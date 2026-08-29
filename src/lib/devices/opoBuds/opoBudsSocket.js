'use strict';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {createLogger, getDeviceIdentifier, hexBytes} from '../logger.js';
import {SocketHandler} from '../socketByProfile.js';
import {
    OpoBudsModelList, Cmd, FeatureId, EventCode, BatteryComponent
} from './opoBudsConfig.js';

const HEADER_MAGIC = 0xAA;
const MIN_FRAME_LEN = 9;

export function cycleMaskToEnum(mask) {
    const off = (mask & 0x01) !== 0;
    const trans = (mask & 0x02) !== 0;
    const anc = (mask & 0x08) !== 0 || (mask & 0x04) !== 0;

    if (anc && trans && off)
        return 0x02; // All 3 modes
    if (anc && trans && !off)
        return 0x01; // ANC + Trans
    if (anc && !trans && off)
        return 0x03; // ANC + Off
    if (!anc && trans && off)
        return 0x04; // Trans + Off
    return 0x02;
}

export function cycleEnumToMask(enumVal) {
    switch (enumVal) {
        case 0x01: // ANC + Trans
            return 0x0A;
        case 0x02: // All 3
            return 0x0B;
        case 0x03: // ANC + Off
            return 0x09;
        case 0x04: // Trans + Off
            return 0x03;
        default:
            return 0x0B;
    }
}

export const OpoBudsSocket = GObject.registerClass({
    GTypeName: 'BudsLink_OpoBudsSocket',
}, class OpoBudsSocket extends SocketHandler {
    _init(devicePath, profileManager, profile, callbacks) {
        super._init(devicePath, profileManager, profile);
        const identifier = getDeviceIdentifier(devicePath);
        const tag = `OpoBudsSocket-${identifier}`;
        this._log = createLogger(tag);
        this._log.info('OpoBudsSocket init');

        this._devicePath = devicePath;
        this._seq = 0;
        this._rxBuffer = [];
        this._txQueue = [];
        this._pendingRequest = null;
        this._pendingTimeout = null;
        this._modelInitialized = false;
        this._modelData = null;

        this._callbacks = callbacks;

        this.startSocket();
    }

    _queuePacket(cmd, payload = [], loginfo = '') {
        this._txQueue.push({cmd, payload, loginfo});
        this._processQueue();
    }

    _processQueue() {
        if (this._pendingRequest)
            return;

        if (this._txQueue.length === 0)
            return;

        const item = this._txQueue.shift();

        if (item.loginfo)
            this._log.info(item.loginfo);

        this._encode(item.cmd, item.payload);
        this._pendingRequest = this._seq;

        if (this._pendingTimeout) {
            GLib.source_remove(this._pendingTimeout);
            this._pendingTimeout = null;
        }

        this._pendingTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._log.info(`Response Timeout seq: ${this._pendingRequest}`);
            this._pendingRequest = null;
            this._pendingTimeout = null;
            this._processQueue();
            return GLib.SOURCE_REMOVE;
        });
    }

    _completePendingRequest(seq) {
        if (!this._pendingRequest)
            return;

        if (seq !== this._pendingRequest)
            return;

        if (this._pendingTimeout)
            GLib.source_remove(this._pendingTimeout);

        this._pendingTimeout = null;
        this._pendingRequest = null;
        this._processQueue();
    }

    _encode(cmd, payload = []) {
        this._seq = this._seq >= 250 ? 1 : this._seq + 1;
        const payLen = payload.length;
        const totalLen = 7 + payLen;

        const header = [
            HEADER_MAGIC,
            totalLen & 0xFF,
            0x00,
            0x00,
            cmd & 0xFF,
            cmd >> 8 & 0xFF,
            this._seq,
            payLen & 0xFF,
            payLen >> 8 & 0xFF,
        ];

        const packet = Uint8Array.from([...header, ...payload]);
        this.sendMessage(packet);
    }

    processData(bytes) {
        this._rxBuffer.push(...bytes);

        while (true) {
            const msg = this._extractMessage();

            if (!msg)
                break;

            if (msg.seq !== 0xFF)
                this._completePendingRequest(msg.seq);

            this._parseData(msg);
        }
    }

    _extractMessage() {
        const buf = this._rxBuffer;

        for (let i = 0; i < buf.length; i++) {
            if (buf[i] !== HEADER_MAGIC)
                continue;

            if (buf.length - i < MIN_FRAME_LEN)
                return null;

            const totalLen = buf[i + 1];
            const frameLen = totalLen + 2;

            if (totalLen < 7 || frameLen > 512)
                continue;

            if (buf.length - i < frameLen)
                return null;

            const raw = buf.slice(i, i + frameLen);
            this._rxBuffer.splice(0, i + frameLen);
            return this._parseMessage(raw);
        }

        if (buf.length > 512)
            this._rxBuffer = [];

        return null;
    }

    _parseMessage(raw) {
        const cmd = raw[4] | raw[5] << 8;
        const seq = raw[6];
        const payLen = raw[7] | raw[8] << 8;
        const payload = raw.slice(9, 9 + payLen);

        return {cmd, seq, payload};
    }

    postConnectInitialization() {
        this._onPostConnectInitialization();
    }

    _onPostConnectInitialization() {
        this._log.info('Starting post connect initialization');
        this._queuePacket(Cmd.HANDSHAKE, [], 'Handshake');
        this._queuePacket(Cmd.GET_NOTIFICATION_CAPABILITY, [], 'Query Notification Capabilities');

        const events = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x0d, 0x0e, 0x0f, 0x10, 0xf1, 0xf2];
        const payload =  [events.length, ...events];
        this._queuePacket(Cmd.REGISTER_NOTIFICATION, payload, 'Subscribe Broadcast Events');

        this._queuePacket(Cmd.PRODUCT_ID, [], 'Query Product ID');
        this._queuePacket(Cmd.VERSION, [], 'Query Version');

        this._modelRetryTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            if (!this._modelInitialized)
                this._queuePacket(Cmd.PRODUCT_ID, [], 'Query Product ID');

            this._modelRetryTimeoutId = null;
            return GLib.SOURCE_REMOVE;
        });
    }


    _onModelInitialized(modelData) {
        if (this._modelInitialized)
            return;

        if (this._modelRetryTimeoutId) {
            GLib.source_remove(this._modelRetryTimeoutId);
            this._modelRetryTimeoutId = null;
        }

        this._log.info(`OpoBuds Model Initialized: ${modelData.name}`);
        this._modelInitialized = true;
        this._modelData = modelData;
        this._callbacks?.modelIntialized?.(modelData);

        this._getBattery();

        if (modelData.noiseControl)
            this._getNoiseControl();

        this._getFeatureSwitches();

        if (modelData.eqPreset)
            this._getEqPreset();

        if (modelData.gestureOptions)
            this._getGestures();

        if (modelData.dualConnection)
            this._getMultiConnectInfo();
    }

    _parseData(resp) {
        const {cmd, payload} = resp;

        switch (cmd) {
            case Cmd.PRODUCT_ID_RSP:
                if (!this._modelInitialized && payload.length >= 4 && payload[0] === 0x00) {
                    const id = payload[1] | payload[2] << 8 | payload[3] << 16;
                    const pidHex = id.toString(16).padStart(6, '0').toUpperCase();
                    this._log.info(`Received Product ID: 0x${pidHex}`);
                    const model = OpoBudsModelList.find(m => m.modelId.toUpperCase() === pidHex);
                    if (model)
                        this._onModelInitialized(model);
                }
                break;

            case Cmd.VERSION_RSP:
                this._parseFirmwareVersion(payload);
                break;

            case Cmd.BATTERY_RSP:
                this._parseBattery(payload);
                break;

            case Cmd.ANC_RSP:
                this._parseAnc(payload);
                break;

            case Cmd.FEATURE_SWITCH_RSP:
            case Cmd.FEATURE_EVENT:
                this._parseFeatureSwitches(payload);
                break;

            case Cmd.EQ_RSP:
            case Cmd.EQ_NOTIFY:
                this._parseEq(payload);
                break;

            case Cmd.KEY_FUNCTION_RSP:
                this._parseGestures(payload);
                break;

            case Cmd.KEY_FUNCTION_NOTIFY:
            case 0x0501:
                this._getGestures();
                break;

            case Cmd.GET_MULTI_CONNECT_INFO_RSP:
            case 0x0512:
                this._parseMultiConnectInfo(payload);
                break;

            case Cmd.OPERATE_MULTI_CONNECT_RSP:
            case 0x050E:
            case 0x0513:
            case 0x0516:
                this._log.info(`Multi-connect notify/ack (cmd=0x${cmd.toString(16)}): refreshing device list`);
                this._getMultiConnectInfo();
                break;

            case Cmd.GET_COMPACTNESS_INFO_RSP:
            case Cmd.START_COMPACTNESS_DETECT_RSP:
            case 0x8405:
            case 0x840A:
            case 0x8410:
                this._log.info(`Compactness cmd response (cmd=0x${cmd.toString(16)}): ${hexBytes(payload)}`);
                break;

            case Cmd.NOTIFICATION_EVENT:
                this._parseNotificationEvent(payload);
                break;
        }
    }

    _parseNotificationEvent(payload) {
        if (payload.length === 0)
            return;

        const eventCode = payload[0];
        const eventData = payload.slice(1);

        switch (eventCode) {
            case EventCode.BATTERY:
                this._parseBattery(eventData);
                break;

            case EventCode.ANC_MODE:
                if (eventData.length >= 3) {
                    const subId = eventData[0];
                    const modeByte = eventData[eventData.length - 1];
                    if (subId === 0x04)
                        this._callbacks?.updateAdaptiveAncSubLevel?.(modeByte);
                    else
                        this._callbacks?.updateNoiseControl?.(modeByte);
                } else if (eventData.length >= 1) {
                    const modeByte = eventData[eventData.length - 1];
                    this._callbacks?.updateNoiseControl?.(modeByte);
                }
                break;

            case 0x05:
            case 0x0E:
            case 0x12:
            case 0x13:
            case 0x16:
                this._getMultiConnectInfo();
                break;

            case EventCode.GAME_MODE:
                if (eventData.length >= 1)
                    this._callbacks?.updateLatency?.(eventData[0] === 0x01);
                break;

            case EventCode.EARBUDS_STATUS:
                this._log.info('Received Earbuds in-ear status event');
                break;

            case 0x04:
                this._log.info(`Received fit test / compactness event: ${hexBytes(eventData)}`);
                this._parseCompactnessResult(eventData);
                break;

            case EventCode.USER_INTERACTION:
            case 0xF1:
                if (eventData.length >= 4) {
                    const dev = eventData[0];
                    const btn = eventData[1];
                    const act = eventData[2];
                    const func = eventData[3];
                    const extra = eventData.length >= 5 ? eventData[4] : null;
                    this._log.info(`Live button event: dev=${dev} btn=${btn} ` +
                        `act=${act} func=${func} extra=${extra}`);

                    this._callbacks?.updateSingleGesture?.(dev, btn, act, func);
                    if (func === 0x08 && extra !== null)
                        this._callbacks?.updateNoiseControl?.(extra);
                } else {
                    this._getGestures();
                }
                break;
        }
    }

    _parseFirmwareVersion(payload) {
        if (payload.length < 2 || payload[0] !== 0x00)
            return;

        const strBytes = payload.slice(2);
        const versionStr = String.fromCharCode(...strBytes);
        this._log.info(`Firmware string: ${versionStr}`);

        const parts = versionStr.split(',');
        const ver = parts.find(p => /^\d+(\.\d+){1,3}$/.test(p)) ?? parts[0];
        if (ver)
            this._callbacks?.updateFirmwareInfo?.(ver);
    }

    _getBattery() {
        this._queuePacket(Cmd.BATTERY, [], 'Query Battery');
    }

    _parseBattery(payload) {
        if (payload.length < 2)
            return;

        const offset = payload[0] === 0x00 ? 1 : 0;
        const count = payload[offset];
        let left = null;
        let right = null;
        let cse = null;

        for (let i = 0; i < count; i++) {
            const idx = offset + 1 + i * 2;
            if (idx + 1 >= payload.length)
                break;

            const comp = payload[idx];
            const rawVal = payload[idx + 1];
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

        this._callbacks?.updateBatteryProps?.({left, right, case: cse});
    }

    _getEqPreset() {
        this._queuePacket(Cmd.EQ, [], 'Query EQ Preset');
    }

    _parseEq(payload) {
        if (payload.length === 0)
            return;

        const presetId = payload[payload.length - 1];
        this._log.info(`Parsed EQ preset: ${presetId}`);
        this._callbacks?.updateEqPreset?.(presetId);
    }

    setEqPreset(presetId) {
        this._log.info(`Set EQ Preset: ${presetId}`);
        this._queuePacket(Cmd.SET_EQ, [presetId], 'Set EQ Preset');
    }

    setDynamicAudioEq(low, med, high) {
        const toByte = v => (v < 0 ? 256 + v : v) & 0xFF;
        const lowByte = toByte(low);
        const medByte = toByte(med);
        const highByte = toByte(high);

        this._log.info(`Set Dynamic Audio EQ: Low=${low}, Med=${med}, High=${high}`);
        const payload = [0x03, lowByte, medByte, highByte];
        this._queuePacket(Cmd.SET_EQ_DETAIL, payload, 'Set Dynamic Audio EQ');
    }

    _getNoiseControl() {
        this._queuePacket(Cmd.ANC, [0x01, 0x01], 'Query ANC Mode');
        this._queuePacket(Cmd.ANC, [0x02, 0x01], 'Query ANC Cycle (Action 2, Type 1)');
        this._queuePacket(Cmd.ANC, [0x02, 0x02], 'Query ANC Cycle (Action 2, Type 2)');
    }

    _parseAnc(payload) {
        if (payload.length < 3)
            return;

        const action = payload[0];
        const subId = payload[1];
        const valByte = payload[payload.length - 1];

        if (action === 0x02 || subId === 0x02) {
            const mask = valByte <= 0x04 ? cycleEnumToMask(valByte) : valByte;
            this._log.info(`Parsed ANC cycle: raw=0x${valByte.toString(16)} -> mask=0x${mask.toString(16)}`);
            this._callbacks?.updateNoiseControlCycle?.(mask);
        } else {
            this._log.info(`Parsed ANC mode byte: ${hexBytes(valByte)}`);
            this._callbacks?.updateNoiseControl?.(valByte);
        }
    }

    setNoiseControl(modeBytes) {
        const arr = Array.isArray(modeBytes) ? modeBytes : [modeBytes];
        this._log.info(`Set ANC mode bytes: ${hexBytes(arr)}`);
        const payload = [0x01, 0x01, ...arr];
        this._queuePacket(Cmd.SET_ANC, payload, 'Set ANC Mode');
    }

    _getFeatureSwitches() {
        const features = [
            FeatureId.IN_EAR,
            FeatureId.GAME_MODE,
            FeatureId.DUAL_DEVICE,
            FeatureId.WIND_NOISE,
            FeatureId.VOLUME_ENHANCER,
            FeatureId.SPATIAL,
            FeatureId.HIGH_RES,
            FeatureId.DYNAMIC_BASS,
            FeatureId.AUTO_ANSWER,
            FeatureId.FIND_PHONE,
        ];
        this._queuePacket(Cmd.FEATURE_SWITCH, [features.length, ...features], 'Query Features');
    }

    _parseFeatureSwitches(payload) {
        if (payload.length < 2)
            return;

        let startIdx = 1;
        let count = payload[0];

        if (payload[0] === 0x00) {
            if (payload.length > 2 && payload[1] === 0x00) {
                startIdx = 3;
                count = payload[2];
            } else {
                startIdx = 2;
                count = payload[1];
            }
        }

        for (let i = 0; i < count; i++) {
            const idx = startIdx + i * 2;
            if (idx + 1 >= payload.length)
                break;

            const feat = payload[idx];
            const val = payload[idx + 1] === 0x01;

            if (feat === FeatureId.IN_EAR)
                this._callbacks?.updateInEar?.(val);
            else if (feat === FeatureId.GAME_MODE)
                this._callbacks?.updateLatency?.(val);
            else if (feat === FeatureId.DUAL_DEVICE)
                this._callbacks?.updateDualConnection?.(val);
            else if (feat === FeatureId.WIND_NOISE)
                this._callbacks?.updateWindNoise?.(val);
            else if (feat === FeatureId.VOLUME_ENHANCER)
                this._callbacks?.updateVolumeEnhancer?.(val);
            else if (feat === FeatureId.SPATIAL)
                this._callbacks?.updateSpatialAudio?.(val);
            else if (feat === FeatureId.HIGH_RES)
                this._callbacks?.updateHighRes?.(val);
            else if (feat === FeatureId.DYNAMIC_BASS)
                this._callbacks?.updateDynamicBass?.(val);
            else if (feat === FeatureId.AUTO_ANSWER)
                this._callbacks?.updateAutoAnswer?.(val);
            else if (feat === FeatureId.FIND_PHONE)
                this._callbacks?.updateFindPhone?.(val);
        }
    }

    setLatency(enable) {
        this._log.info(`Set Low Latency Game Mode: ${enable}`);
        const payload = [FeatureId.GAME_MODE, enable ? 0x01 : 0x00];
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, payload, 'Set Game Mode');
    }

    setInEar(enable) {
        this._log.info(`Set In-Ear Detection: ${enable}`);
        const payload = [FeatureId.IN_EAR, enable ? 0x01 : 0x00];
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, payload, 'Set In-Ear Detection');
    }

    setDualConnection(enable) {
        this._log.info(`Set Dual Connection: ${enable}`);
        const payload = [FeatureId.DUAL_DEVICE, enable ? 0x01 : 0x00];
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, payload, 'Set Dual Connection');
        if (enable)
            this._getMultiConnectInfo();
    }

    _getMultiConnectInfo() {
        this._queuePacket(Cmd.GET_MULTI_CONNECT_INFO, [], 'Query Multi-Connect Devices');
    }

    _parseMultiConnectInfo(payload) {
        if (payload.length < 2)
            return;

        const count = payload[0] === 0x00 ? payload[1] : payload[0];
        let pos = payload[0] === 0x00 ? 2 : 1;
        const devices = [];

        for (let i = 0; i < count && pos + 9 <= payload.length; i++) {
            // MAC is transmitted in reverse (little-endian wire order)
            const macBytes = [];
            for (let j = 0; j < 6; j++)
                macBytes.push(payload[pos + 5 - j]);
            const mac = macBytes.map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase();
            pos += 6;

            const elemByte = payload[pos++];
            const connState = payload[pos++];
            const flag = payload[pos++];
            const nameLen = payload[pos++];

            if (nameLen < 0 || pos + nameLen > payload.length)
                break;

            let deviceName = '';
            if (nameLen > 0) {
                const nameBytes = payload.slice(pos, pos + nameLen);
                deviceName = new TextDecoder('utf-8').decode(new Uint8Array(nameBytes)).replace(/\0+$/, '');
                pos += nameLen;
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
        }

        this._log.info(`Parsed Multi-Connect Devices (${devices.length}): ${JSON.stringify(devices)}`);
        this._callbacks?.updateMultiConnectDevices?.(devices);
    }

    getMultiConnectInfo() {
        this._getMultiConnectInfo();
    }

    operateMultiConnect(op, macAddress) {
        this._log.info(`Operate MultiConnect: op=${op}, mac=${macAddress}`);
        if (!macAddress)
            return;

        // Convert MAC address to reversed (little-endian) byte array matching firmware wire order
        const macParts = macAddress.split(':').map(h => parseInt(h, 16)).reverse();
        if (macParts.length !== 6) {
            this._log.warn(`Invalid MAC address for MultiConnect: ${macAddress}`);
            return;
        }

        // Action byte: 0x00 = Disconnect, 0x01 = Connect, 0x02 = Remove (Delete)
        let action = 0x00;
        if (op === 0x01 || op === 'disconnect')
            action = 0x00;
        else if (op === 0x02 || op === 'connect')
            action = 0x01;
        else if (op === 0x03 || op === 'remove')
            action = 0x02;

        const payload = [0x01, ...macParts, action];
        this._queuePacket(Cmd.OPERATE_MULTI_CONNECT, payload, `MultiConnect Action ${action} for ${macAddress}`);

        // Schedule staggered refresh checks as Bluetooth connection/disconnection takes 1-4 seconds
        [800, 2000, 3500, 5500].forEach(delayMs => {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
                this._getMultiConnectInfo();
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    setWindNoise(enable) {
        this._log.info(`Set Wind Noise: ${enable}`);
        const payload = [FeatureId.WIND_NOISE, enable ? 0x01 : 0x00];
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, payload, 'Set Wind Noise');
    }

    setVolumeEnhancer(enable) {
        this._log.info(`Set Volume Enhancer: ${enable}`);
        const payload = [FeatureId.VOLUME_ENHANCER, enable ? 0x01 : 0x00];
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, payload, 'Set Volume Enhancer');
    }

    setSpatialAudio(enable) {
        this._log.info(`Set Spatial Audio: ${enable}`);
        const payload = [FeatureId.SPATIAL, enable ? 0x01 : 0x00];
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, payload, 'Set Spatial Audio');
    }

    setHighRes(enable) {
        this._log.info(`Set High-Res LHDC: ${enable}`);
        const payload = [FeatureId.HIGH_RES, enable ? 0x01 : 0x00];
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, payload, 'Set High-Res LHDC');
    }

    setDynamicBass(enable) {
        this._log.info(`Set Dynamic Bass: ${enable}`);
        const payload = [FeatureId.DYNAMIC_BASS, enable ? 0x01 : 0x00];
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, payload, 'Set Dynamic Bass');
    }

    setAutoAnswer(enable) {
        this._log.info(`Set Auto Answer: ${enable}`);
        const payload = [FeatureId.AUTO_ANSWER, enable ? 0x01 : 0x00];
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, payload, 'Set Auto Answer');
    }

    setFindPhone(enable) {
        this._log.info(`Set Find My Phone: ${enable}`);
        const payload = [FeatureId.FIND_PHONE, enable ? 0x01 : 0x00];
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, payload, 'Set Find My Phone');
    }

    setFindBuds(ringState) {
        const ring = ringState === 'started' || ringState === 'playing';
        this._log.info(`Set Find Buds: ${ring}`);
        const payload = [ring ? 0x01 : 0x00];
        this._queuePacket(Cmd.FIND_BUDS, payload, 'Set Find Buds');
    }

    _getGestures() {
        this._queuePacket(Cmd.KEY_FUNCTION, [0x02, 0x01, 0x02], 'Query Key Functions');
    }

    _parseGestures(payload) {
        if (payload.length < 3)
            return;

        let startIdx = 3;
        if (payload[0] === 0x00 && payload[1] !== 0x00)
            startIdx = 2;
        else if (payload[0] !== 0x00)
            startIdx = 1;

        const count = payload[startIdx - 1];
        const needed = count * 4;
        if (count < 1 || count > 16 || payload.length < startIdx + needed)
            return;

        const slotsBytes = payload.slice(startIdx, startIdx + needed);
        const hex = Array.from(slotsBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        this._log.info(`Parsed gestures hex: ${hex}`);
        this._callbacks?.updateGestures?.(hex);
    }

    setGestureSlot(device, buttonId, gestureType, action, extraByte = null) {
        this._log.info(
            `Set gesture slot: dev=${hexBytes(device)} btn=${hexBytes(buttonId)} ` +
            `type=${hexBytes(gestureType)} action=${hexBytes(action)} extra=${extraByte}`
        );
        const payload = extraByte !== null
            ? [device, buttonId, gestureType, action, extraByte]
            : [device, buttonId, gestureType, action];
        this._queuePacket(Cmd.SET_KEY_FUNCTION, payload, 'Set Key Function');
    }

    setNoiseControlCycle(maskByte) {
        this._log.info(`Set ANC cycle: mask=0x${maskByte.toString(16).padStart(2, '0')}`);
        this._queuePacket(Cmd.SET_ANC, [0x02, 0x01, maskByte], 'Set ANC Cycle (Action 2, Type 1)');
        this._queuePacket(Cmd.SET_ANC, [0x02, 0x02, maskByte], 'Set ANC Cycle (Action 2, Type 2)');
    }

    _parseCompactnessResult(payload) {
        if (!payload || payload.length === 0)
            return;

        let leftStatus = 0;
        let rightStatus = 0;

        if (payload.length >= 4 && payload[0] === 0x01 && payload[2] === 0x02) {
            // 0x01 = Good (Green), 0x00 / other = Not ideal (Yellow)
            leftStatus = (payload[1] === 0x01) ? 1 : 0;
            rightStatus = (payload[3] === 0x01) ? 1 : 0;
        } else if (payload.length >= 2) {
            leftStatus = (payload[0] === 0x01) ? 1 : 0;
            rightStatus = (payload[1] === 0x01) ? 1 : 0;
        } else {
            const single = payload[payload.length - 1];
            leftStatus = (single === 1 || single === 3) ? 1 : 0;
            rightStatus = (single === 1 || single === 2) ? 1 : 0;
        }

        this._log.info(`[FitTest Telemetry] Left=${leftStatus === 1 ? 'Good' : 'Not ideal'} (${leftStatus}), Right=${rightStatus === 1 ? 'Good' : 'Not ideal'} (${rightStatus}) (payload=${hexBytes(payload)})`);
        this._callbacks?.updateFitTestResult?.({left: leftStatus, right: rightStatus});
    }

    getCompactnessInfo() {
        this._queuePacket(Cmd.GET_COMPACTNESS_INFO, [], 'Query Compactness Info');
    }

    startFitTest() {
        this._log.info('Start Earbud Fit Test (0x0405)');
        this._queuePacket(0x0405, [0x01], 'Start Fit Test (0x0405)');
    }

    stopFitTest() {
        this._log.info('Stop Earbud Fit Test');
        this._queuePacket(0x0405, [0x00], 'Stop Fit Test (0x0405)');
    }

    destroy() {
        if (this._pendingTimeout) {
            GLib.source_remove(this._pendingTimeout);
            this._pendingTimeout = null;
        }

        if (this._modelRetryTimeoutId) {
            GLib.source_remove(this._modelRetryTimeoutId);
            this._modelRetryTimeoutId = null;
        }

        super.destroy();
    }
});
