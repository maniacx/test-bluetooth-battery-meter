import fs from 'fs';
import vm from 'vm';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const sharedContext = vm.createContext({
    console,
    assert,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    Array,
    Object,
    parseInt,
    Math,
    JSON,
    Set
});

const moduleCache = new Map();

async function loadEsm(filePath) {
    const resolvedPath = path.resolve(filePath);
    if (moduleCache.has(resolvedPath)) {
        return moduleCache.get(resolvedPath);
    }

    const code = fs.readFileSync(resolvedPath, 'utf8');

    const module = new vm.SourceTextModule(code, {
        context: sharedContext,
        initializeImportMeta(meta) {
            meta.url = `file://${resolvedPath}`;
        },
        importModuleDynamically(specifier) {
            const childPath = path.resolve(path.dirname(resolvedPath), specifier);
            return loadEsm(childPath);
        }
    });

    moduleCache.set(resolvedPath, module);

    await module.link(async (specifier) => {
        const childPath = path.resolve(path.dirname(resolvedPath), specifier);
        return loadEsm(childPath);
    });

    await module.evaluate();
    return module;
}

// Emulate pure parser logic from OpoBudsSocket for protocol testing
function parseBatteryEntries(bytes, BatteryComponent) {
    if (bytes.length < 1)
        return null;

    const count = bytes[0];
    let left = null;
    let right = null;
    let cse = null;

    for (let i = 0; i < count; i++) {
        const idx = 1 + i * 2;
        if (idx + 1 >= bytes.length)
            break;

        const comp = bytes[idx];
        const rawVal = bytes[idx + 1];
        const level = rawVal & 0x7F;
        const charging = (rawVal & 0x80) !== 0;

        const info = {level, isCharging: charging};
        if (comp === BatteryComponent.LEFT)
            left = info;
        else if (comp === BatteryComponent.RIGHT)
            right = info;
        else if (comp === BatteryComponent.CASE)
            cse = info;
    }

    return {left, right, case: cse};
}

function parseEqPayload(payload) {
    if (!payload || payload.length < 2 || payload[0] !== 0x00)
        return null;

    return payload[1];
}

function parseMultiConnectPayload(payload, cmd, reversedBytesToMac) {
    if (!payload || payload.length < 2)
        return null;

    const isResponse = cmd === 0x8112 || payload[0] === 0x00;
    if (cmd === 0x8112 && payload[0] !== 0x00)
        return null; // Error status guard

    const count = isResponse ? payload[1] : payload[0];
    let pos = isResponse ? 2 : 1;
    const devices = [];

    for (let i = 0; i < count && pos + 9 <= payload.length; i++) {
        const macBytes = payload.slice(pos, pos + 6);
        const mac = reversedBytesToMac(macBytes);
        pos += 6;

        const elemLen = payload[pos++];
        const entryEnd = pos + elemLen;

        const connState = payload[pos++];
        const flag = payload[pos++];
        const nameLen = payload[pos++];

        let deviceName = '';
        if (nameLen > 0 && pos + nameLen <= payload.length) {
            const nameBytes = payload.slice(pos, pos + nameLen);
            deviceName = new TextDecoder('utf-8').decode(new Uint8Array(nameBytes)).replace(/\0+$/, '');
        } else {
            deviceName = `Device ${mac.slice(-5)}`;
        }

        const isCurrent = (flag & 0x01) !== 0;
        const isMainAudio = (flag & 0x02) !== 0;
        const isAudioActive = (flag & 0x04) !== 0;
        const isConnected = connState === 0x02 || connState === 0x01;

        devices.push({
            mac,
            name: deviceName,
            isConnected,
            isCurrent,
            isMainAudio,
            isAudioActive,
            connState,
        });

        pos = elemLen > 0 ? entryEnd : (pos + Math.max(0, nameLen));
    }

    return devices;
}

async function runTests() {
    console.log('====================================================');
    console.log(' Running OpoBuds Protocol Parser & Encoder Tests');
    console.log('====================================================\n');

    const configMod = await loadEsm(path.join(projectRoot, 'src/lib/devices/opoBuds/opoBudsConfig.js'));
    const air7Mod = await loadEsm(path.join(projectRoot, 'src/lib/devices/opoBuds/deviceConfigs/RealmeBudsAir7.js'));
    const w5Mod = await loadEsm(path.join(projectRoot, 'src/lib/devices/opoBuds/deviceConfigs/RealmeBudsWireless5ANC.js'));

    const cfg = configMod.namespace;
    const air7 = air7Mod.namespace.default;
    const w5 = w5Mod.namespace.default;

    // 1. Gesture Hex Encoding & Decoding Round-Trips
    console.log('1. Testing Gesture Hex Round-Trips...');
    const air7Hex = cfg.buildPlaceholderGesturesHex(air7.gestureOptions);
    const air7Decoded = cfg.decodeGesturesHex(air7Hex);
    assert.strictEqual(Object.keys(air7Decoded).length, air7.gestureOptions.slots.length);
    const air7Reencoded = cfg.encodeGesturesHex(air7Decoded, air7.gestureOptions);
    assert.strictEqual(air7Reencoded, air7Hex);

    const w5Hex = cfg.buildPlaceholderGesturesHex(w5.gestureOptions);
    const w5Decoded = cfg.decodeGesturesHex(w5Hex);
    assert.strictEqual(Object.keys(w5Decoded).length, w5.gestureOptions.slots.length);
    const w5Reencoded = cfg.encodeGesturesHex(w5Decoded, w5.gestureOptions);
    assert.strictEqual(w5Reencoded, w5Hex);
    console.log('   ✓ Gesture encode/decode round-trips pass');

    // 2. Gesture Change Detection (No changes, single change, multiple changes)
    console.log('2. Testing Gesture Change Detection...');
    const noDiffs = cfg.findChangedGestureSlots(air7Hex, air7Hex, air7.gestureOptions);
    assert.strictEqual(noDiffs.length, 0);

    // Single change
    const singleChangeHex = cfg.updateGestureSlotInHex(air7Hex, 0x01, 0x01, 0x02, 0x06);
    const singleDiffs = cfg.findChangedGestureSlots(air7Hex, singleChangeHex, air7.gestureOptions);
    assert.strictEqual(singleDiffs.length, 1);
    assert.strictEqual(singleDiffs[0].device, 1);
    assert.strictEqual(singleDiffs[0].buttonId, 1);
    assert.strictEqual(singleDiffs[0].gestureType, 2);
    assert.strictEqual(singleDiffs[0].action, 6);

    // Multiple changes
    const multiChangeHex = cfg.updateGestureSlotInHex(singleChangeHex, 0x02, 0x01, 0x03, 0x05);
    const multiDiffs = cfg.findChangedGestureSlots(air7Hex, multiChangeHex, air7.gestureOptions);
    assert.strictEqual(multiDiffs.length, 2);
    console.log('   ✓ findChangedGestureSlots (no diff, single diff, multi diff) pass');

    // 3. MAC Wire-Order Conversions
    console.log('3. Testing MAC Wire-Order Reversal...');
    const testMac = 'E8:6B:EA:9C:2A:2F';
    const reversed = cfg.macToReversedBytes(testMac);
    assert.deepStrictEqual([...reversed], [0x2F, 0x2A, 0x9C, 0xEA, 0x6B, 0xE8]);
    const reconstructedMac = cfg.reversedBytesToMac(reversed);
    assert.strictEqual(reconstructedMac, testMac);
    console.log('   ✓ MAC to wire-order and wire-order to MAC pass');

    // 4. Battery Payload Decoding (Left, Right, Case, Charging Bit)
    console.log('4. Testing Battery Payload Decoding...');
    // Payload format: [count, compId, valByte, compId, valByte, compId, valByte]
    // valByte: bit 7 = charging (0x80), bits 0-6 = level (0x7F)
    // Left: 85% charging (85 | 0x80 = 0xD5), Right: 90% discharging (90 = 0x5A), Case: 100% charging (100 | 0x80 = 0xE4)
    const rawBatteryBytes = [
        0x03,
        cfg.BatteryComponent.LEFT,  0xD5, // 85% + charging
        cfg.BatteryComponent.RIGHT, 0x5A, // 90% + not charging
        cfg.BatteryComponent.CASE,  0xE4  // 100% + charging
    ];
    const batteryResult = parseBatteryEntries(rawBatteryBytes, cfg.BatteryComponent);
    assert.deepStrictEqual(batteryResult.left, {level: 85, isCharging: true});
    assert.deepStrictEqual(batteryResult.right, {level: 90, isCharging: false});
    assert.deepStrictEqual(batteryResult.case, {level: 100, isCharging: true});
    console.log('   ✓ Battery parsing with levels and charging bits pass');

    // 5. Strict EQ Payload Parsing
    console.log('5. Testing Strict EQ Response Parsing...');
    // Valid response: [status=0x00, eqId=0x02]
    assert.strictEqual(parseEqPayload([0x00, 0x02]), 0x02);
    // Error response: [status=0x01, eqId=0x02] -> should return null
    assert.strictEqual(parseEqPayload([0x01, 0x02]), null);
    // Truncated response: [status=0x00] -> should return null
    assert.strictEqual(parseEqPayload([0x00]), null);
    assert.strictEqual(parseEqPayload([]), null);
    console.log('   ✓ Strict EQ response status and length checks pass');

    // 6. Multi-Connect Response & Error Status Guarding
    console.log('6. Testing Multi-Connect Response Parsing & Error Guards...');
    // Mock multi-connect response:
    // status=0x00, count=1, MAC (reversed: 2F:2A:9C:EA:6B:E8), elemLen=16, connState=0x02, flag=0x03 (current + main audio), nameLen=9, name="TestPhone"
    const nameBytes = Array.from(new TextEncoder().encode('TestPhone'));
    const mockMultiConnectRsp = [
        0x00, // Status: OK
        0x01, // Count: 1
        0x2F, 0x2A, 0x9C, 0xEA, 0x6B, 0xE8, // MAC
        12 + nameBytes.length, // elemLen
        0x02, // connState (Connected)
        0x03, // flag (Current + MainAudio)
        nameBytes.length, // nameLen
        ...nameBytes
    ];
    const mcDevices = parseMultiConnectPayload(mockMultiConnectRsp, 0x8112, cfg.reversedBytesToMac);
    assert.strictEqual(mcDevices.length, 1);
    assert.strictEqual(mcDevices[0].mac, 'E8:6B:EA:9C:2A:2F');
    assert.strictEqual(mcDevices[0].name, 'TestPhone');
    assert.strictEqual(mcDevices[0].isConnected, true);
    assert.strictEqual(mcDevices[0].isCurrent, true);
    assert.strictEqual(mcDevices[0].isMainAudio, true);

    // Error status test (status=0x01)
    const errorMultiConnectRsp = [0x01, 0x00, 0x00];
    const mcErrorResult = parseMultiConnectPayload(errorMultiConnectRsp, 0x8112, cfg.reversedBytesToMac);
    assert.strictEqual(mcErrorResult, null);
    console.log('   ✓ Multi-connect response parsing and error status guards pass');

    console.log('\n====================================================');
    console.log(' 🎉 ALL 6 PROTOCOL SUITES PASSED SUCCESSFULLY!');
    console.log('====================================================');
}

runTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
