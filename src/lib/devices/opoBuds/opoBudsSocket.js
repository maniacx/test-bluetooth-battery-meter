'use strict';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {createLogger, getDeviceIdentifier, hexBytes} from '../logger.js';
import {SocketHandler} from '../socketByProfile.js';
import {
    OpoBudsModelList, Cmd, FeatureId, EventCode, BatteryComponent,
    cycleEnumToMask, macToReversedBytes, reversedBytesToMac,
    FEATURE_CONFIG_MAP, resolveFeatureByte, DefaultBroadcastEvents, CustomEqAction
} from './opoBudsConfig.js';

const HEADER_MAGIC = 0xAA;
const MIN_FRAME_LEN = 9;

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
        this._miscTimeoutIds = new Set();

        this._callbacks = callbacks;

        this.startSocket();
    }

    postConnectInitialization() {
        this._log.info('OpoBuds socket ready: Initializing device info...');
        this._queuePacket(Cmd.HANDSHAKE, [], 'Handshake');
        this._queuePacket(
            Cmd.REGISTER_NOTIFICATION,
            [DefaultBroadcastEvents.length, ...DefaultBroadcastEvents],
            'Subscribe Broadcast Events'
        );

        if (this._modelInitialized && this._modelData) {
            this._log.info('Socket reconnected with active model, refreshing state...');
            this._getBattery();
            if (this._modelData.noiseControl)
                this._getNoiseControl();
            this._getFeatureSwitches();
            if (this._modelData.eqPreset)
                this._getEqPreset();
            if (this._modelData.customEqSupport)
                this.getCustomEqInfo();
            if (this._modelData.gestureOptions)
                this._getGestures();
            if (this._modelData.dualConnection)
                this._getMultiConnectInfo();

            if (this._modelData.broadcastEvents) {
                this._queuePacket(
                    Cmd.REGISTER_NOTIFICATION,
                    [this._modelData.broadcastEvents.length, ...this._modelData.broadcastEvents],
                    'Re-subscribe Model-Specific Broadcast Events'
                );
            }
        } else {
            this._queuePacket(Cmd.PRODUCT_ID, [], 'Query Product ID');
            this._queuePacket(Cmd.VERSION, [], 'Query Version');

            this._modelRetryTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
                if (!this._modelInitialized)
                    this._queuePacket(Cmd.PRODUCT_ID, [], 'Query Product ID');

                this._modelRetryTimeoutId = null;
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _addTimeout(id) {
        this._miscTimeoutIds.add(id);
        return id;
    }

    _removeAllTimeouts() {
        for (const id of this._miscTimeoutIds)
            GLib.source_remove(id);
        this._miscTimeoutIds.clear();
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

        if (!this._encode(item.cmd, item.payload)) {
            this._processQueue();
            return;
        }

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
        const payLen = payload.length;
        if (payLen > 248) {
            this._log.error(`Payload too large for 1-byte frame length: ${payLen}`);
            return false;
        }

        this._seq = this._seq >= 250 ? 1 : this._seq + 1;
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

        const packet = [...header, ...payload];
        this._log.bytes(`Send -> Cmd: 0x${cmd.toString(16).padStart(4, '0')} Seq: ${this._seq} Len: ${totalLen} Data: ${hexBytes(packet)}`);
        this._sendPacket(packet);
        return true;
    }

    _sendPacket(bytes) {
        try {
            this.sendMessage(bytes);
        } catch (e) {
            this._log.error(`Failed to send packet: ${e.message}`);
            this._pendingRequest = null;
            if (this._pendingTimeout) {
                GLib.source_remove(this._pendingTimeout);
                this._pendingTimeout = null;
            }
            this._processQueue();
        }
    }

    processData(byteArray) {
        if (!byteArray || byteArray.length === 0)
            return;

        const incoming = Array.from(byteArray);
        this._log.bytes(`Raw Received bytes (${incoming.length}): ${hexBytes(incoming)}`);

        for (let i = 0; i < incoming.length; i++)
            this._rxBuffer.push(incoming[i]);

        this._processRxBuffer();
    }

    _processRxBuffer() {
        while (this._rxBuffer.length >= MIN_FRAME_LEN) {
            const msg = this._extractMessage();
            if (!msg)
                break;

            this._handleMessage(msg);
        }
    }

    _extractMessage() {
        const buf = this._rxBuffer;
        let magicIdx = -1;

        for (let i = 0; i < buf.length; i++) {
            if (buf[i] === HEADER_MAGIC) {
                magicIdx = i;
                break;
            }
        }

        if (magicIdx === -1) {
            this._rxBuffer = [];
            return null;
        }

        if (magicIdx > 0)
            this._rxBuffer = this._rxBuffer.slice(magicIdx);

        if (this._rxBuffer.length < MIN_FRAME_LEN)
            return null;

        const totalLen = this._rxBuffer[1];
        if (totalLen < 7) {
            this._rxBuffer = this._rxBuffer.slice(1);
            return null;
        }

        const frameLen = totalLen + 2;

        if (this._rxBuffer.length < frameLen)
            return null;

        const raw = this._rxBuffer.slice(0, frameLen);
        this._rxBuffer = this._rxBuffer.slice(frameLen);

        const cmd = raw[4] | raw[5] << 8;
        const seq = raw[6];
        const payLen = raw[7] | raw[8] << 8;

        if (payLen + 7 !== totalLen)
            this._log.info(`Frame length mismatch: totalLen=${totalLen}, payLen=${payLen}`);

        const payload = raw.slice(9, 9 + payLen);

        return {cmd, seq, payload};
    }

    _handleMessage(msg) {
        const {cmd, seq, payload} = msg;
        this._log.bytes(`Recv <- Cmd: 0x${cmd.toString(16).padStart(4, '0')} Seq: ${seq} PayLen: ${payload.length} Data: ${hexBytes(payload)}`);

        if (seq !== 0xFF && (cmd & 0x8000) !== 0)
            this._completePendingRequest(seq);

        this._parseData(msg);
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
        this._callbacks?.modelInitialized?.(modelData);

        this._getBattery();

        if (modelData.noiseControl)
            this._getNoiseControl();

        this._getFeatureSwitches();

        if (modelData.eqPreset)
            this._getEqPreset();

        if (modelData.customEqSupport)
            this.getCustomEqInfo();

        if (modelData.broadcastEvents) {
            this._queuePacket(
                Cmd.REGISTER_NOTIFICATION,
                [modelData.broadcastEvents.length, ...modelData.broadcastEvents],
                'Subscribe Model-Specific Broadcast Events'
            );
        }

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
                this._parseBatteryResponse(payload);
                break;

            case Cmd.ANC_RSP:
                this._parseAncResponse(payload);
                break;

            case Cmd.FEATURE_SWITCH_RSP:
                this._parseFeatureSwitchResponse(payload);
                break;

            case Cmd.FEATURE_EVENT:
                this._parseFeatureSwitchEvent(payload);
                break;

            case Cmd.EQ_RSP:
                this._parseEqResponse(payload);
                break;

            case Cmd.EQ_NOTIFY:
                this._parseEqNotify(payload);
                break;

            case Cmd.CUSTOM_EQ_NOTIFY:
                this._parseCustomEqInfo(payload);
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
                this._parseMultiConnectInfo(payload, cmd);
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
            case 0x840A:
                this._log.info(`Compactness / Power cmd response (cmd=0x${cmd.toString(16)}): ${hexBytes(payload)}`);
                break;

            case Cmd.NOTIFICATION_EVENT:
                this._parseNotificationEvent(payload);
                break;

            default:
                this._log.info(`Unhandled packet cmd=0x${cmd.toString(16)} payload=${hexBytes(payload)}`);
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
                this._parseBatteryEvent(eventData);
                break;

            case EventCode.ANC_MODE:
                this._parseAncEvent(eventData);
                break;

            case EventCode.GAME_MODE:
                if (eventData.length >= 1)
                    this._callbacks?.updateLatency?.(eventData[0] === 0x01);
                break;

            case 0x0D:
            case EventCode.MULTI_CONNECT:
            case 0x12:
            case 0x13:
            case 0x16:
                this._getMultiConnectInfo();
                break;

            case 0x0E:
                this._log.info(`Received special/ear-scan event (0x0E): ${hexBytes(eventData)}`);
                break;

            case 0x0F:
                if (eventData.length >= 1)
                    this._callbacks?.updateSpatialAudio?.(eventData[0] === 0x01);
                break;

            case 0x10:
                if (eventData.length >= 1)
                    this._callbacks?.updateHighRes?.(eventData[0] === 0x01);
                break;

            case EventCode.EARBUDS_STATUS:
                this._log.info(`Received Earbuds in-ear status event: ${hexBytes(eventData)}`);
                if (eventData.length >= 2) {
                    let anyNotWorn = false;
                    for (let i = 1; i + 1 < eventData.length; i += 2) {
                        const wearState = eventData[i + 1];
                        if (wearState === 0x00) {
                            anyNotWorn = true;
                        }
                    }
                    if (anyNotWorn) {
                        this._log.info('In-ear status: at least one bud not worn; aborting fit test');
                        this._callbacks?.updateFitTestResult?.({left: 0, right: 0});
                    }
                }
                break;

            case 0x04:
                this._log.info(`Received fit test / compactness event: ${hexBytes(eventData)}`);
                this._parseCompactnessResult(eventData);
                break;

            case 0xF2:
                this._log.info(`Button Event (0xF2): ${hexBytes(eventData)}`);
                this._getGestures();
                break;

            case EventCode.USER_INTERACTION:
                if (eventData.length >= 4) {
                    const dev = eventData[0];
                    const btn = eventData[1];
                    const act = eventData[2];
                    const func = eventData[3];
                    const scene = eventData.length >= 5 ? eventData[4] : null;
                    this._log.info(`Live button event: dev=${dev} btn=${btn} ` +
                        `act=${act} func=${func} scene=${scene}`);

                    this._callbacks?.updateSingleGesture?.(dev, btn, act, func);
                } else {
                    this._getGestures();
                }
                break;
        }
    }

    _parseFirmwareVersion(payload) {
        if (payload.length < 2 || payload[0] !== 0x00)
            return;

        const versionStr = new TextDecoder('utf-8').decode(new Uint8Array(payload.slice(2))).replace(/\0+$/, '');
        this._log.info(`Firmware string: ${versionStr}`);

        const parts = versionStr.split(',');
        const ver = parts.find(p => /^\d+(\.\d+){1,3}$/.test(p)) ?? parts[0];
        if (ver)
            this._callbacks?.updateFirmwareInfo?.(ver);
    }

    _getBattery() {
        this._queuePacket(Cmd.BATTERY, [], 'Query Battery');
    }

    _parseBatteryResponse(payload) {
        if (payload.length < 2 || payload[0] !== 0x00)
            return;
        this._parseBatteryEntries(payload.slice(1));
    }

    _parseBatteryEvent(eventData) {
        this._parseBatteryEntries(eventData);
    }

    _parseBatteryEntries(bytes) {
        if (bytes.length < 1)
            return;

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

        this._callbacks?.updateBatteryProps?.({left, right, case: cse});
    }

    _getEqPreset() {
        this._queuePacket(Cmd.EQ, [], 'Query EQ Preset');
    }

    _parseEqResponse(payload) {
        if (payload.length < 2 || payload[0] !== 0x00)
            return;

        const presetId = payload[1];
        this._log.info(`Parsed EQ Preset Response: 0x${presetId.toString(16).padStart(2, '0')}`);
        this._callbacks?.updateEqPreset?.(presetId);
    }

    _parseEqNotify(payload) {
        if (payload.length === 0)
            return;

        const presetId = payload.length >= 2 && payload[0] === 0x00 ? payload[1] : payload[0];
        this._log.info(`Parsed EQ Preset Notify: 0x${presetId.toString(16).padStart(2, '0')}`);
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
        this._queuePacket(Cmd.SET_EQ_INFO, payload, 'Set Dynamic Audio EQ');
    }

    _parseCustomEqInfo(payload) {
        if (payload.length === 0)
            return;

        const count = payload[0];
        const entries = [];
        let pos = 1;

        for (let i = 0; i < count; i++) {
            if (pos + 5 > payload.length)
                break;

            const selected = payload[pos] === 0x01;
            const min = (payload[pos + 1] << 24) >> 24;
            const max = (payload[pos + 2] << 24) >> 24;
            const eqId = payload[pos + 3];
            const nameLen = payload[pos + 4];
            pos += 5;

            if (pos + nameLen > payload.length)
                break;

            const name = new TextDecoder().decode(payload.slice(pos, pos + nameLen));
            pos += nameLen;

            if (pos >= payload.length)
                break;

            const bandCount = payload[pos++];
            const freqs = [];
            const dbs = [];

            for (let b = 0; b < bandCount; b++) {
                if (pos + 3 > payload.length)
                    break;

                freqs.push(payload[pos] | payload[pos + 1] << 8);
                dbs.push((payload[pos + 2] << 24) >> 24);
                pos += 3;
            }

            entries.push({eqId, name, min, max, selected, freqs, dbs});
        }

        this._log.info(`Parsed Custom EQ entries: ${entries.length}`);
        this._callbacks?.updateCustomEqs?.(entries);
    }

    getCustomEqInfo() {
        this._queuePacket(Cmd.GET_ALL_EQ_INFO, [], 'Query Custom EQ List');
    }

    setCustomEq(action, eqId, {min = -6, max = 6, name = '', freqs = [], dbs = []} = {}) {
        const toByte = v => (v < 0 ? 256 + v : v) & 0xFF;
        const nameBytes = new TextEncoder().encode(name);
        const payload = [action, toByte(min), toByte(max), eqId, nameBytes.length];

        for (const byte of nameBytes)
            payload.push(byte);

        if (freqs.length > 0 && freqs.length === dbs.length) {
            payload.push(freqs.length);
            freqs.forEach((freq, i) => {
                payload.push(freq & 0xFF, freq >> 8 & 0xFF, toByte(dbs[i]));
            });
        }

        const actionLabel = {
            [CustomEqAction.ADD]: 'Add',
            [CustomEqAction.MODIFY]: 'Modify',
            [CustomEqAction.DELETE]: 'Delete',
            [CustomEqAction.REQUEST]: 'Request',
        }[action] ?? `Action ${action}`;

        this._queuePacket(Cmd.SET_EQ_INFO, payload, `Custom EQ ${actionLabel}: ${name || eqId}`);
    }

    addCustomEq(eqId, eqData) {
        this.setCustomEq(CustomEqAction.ADD, eqId, eqData);
    }

    modifyCustomEq(eqId, eqData) {
        this.setCustomEq(CustomEqAction.MODIFY, eqId, eqData);
    }

    deleteCustomEq(eqId, eqData = {}) {
        this.setCustomEq(CustomEqAction.DELETE, eqId, eqData);
    }

    requestCustomEqInfo() {
        this._queuePacket(Cmd.SET_EQ_INFO, [0x00, 0x00, 0x00, 0x00, 0x00], 'Custom EQ Request');
    }

    _getNoiseControl() {
        this._queuePacket(Cmd.ANC, [0x01, 0x01], 'Query ANC Mode');
        this._queuePacket(Cmd.ANC, [0x02, 0x01], 'Query ANC Cycle (Action 2, Type 1)');
    }

    _parseAncResponse(payload) {
        if (payload.length < 3 || payload[0] !== 0x00)
            return;

        const action = payload[1];
        const valByte = payload.length >= 4 ? payload[3] : payload[2];

        if (action === 0x02) {
            if (payload.length < 4) {
                this._log.info(`ANC cycle response without value byte (len=${payload.length}), ignoring`);
                return;
            }
            const mask = cycleEnumToMask(valByte);
            this._log.info(`Parsed ANC cycle response: raw=0x${valByte.toString(16)} -> mask=0x${mask.toString(16)}`);
            this._callbacks?.updateNoiseControlCycle?.(mask);
        } else {
            const modeBytes = payload.length >= 4 ? payload.slice(3) : [valByte];
            this._log.info(`Parsed ANC mode response: ${hexBytes(modeBytes)}`);
            this._callbacks?.updateNoiseControl?.(modeBytes.length === 1 ? modeBytes[0] : modeBytes);
        }
    }

    _parseAncEvent(eventData) {
        if (eventData.length < 1)
            return;

        const action = eventData[0];
        const valByte = eventData.length >= 3 ? eventData[2] : eventData[eventData.length - 1];

        if (action === 0x02) {
            const mask = cycleEnumToMask(valByte);
            this._log.info(`Parsed ANC cycle event: raw=0x${valByte.toString(16)} -> mask=0x${mask.toString(16)}`);
            this._callbacks?.updateNoiseControlCycle?.(mask);
        } else if (action === 0x04) {
            this._callbacks?.updateAdaptiveAncSubLevel?.(valByte);
        } else {
            const modeBytes = eventData.length >= 3 ? eventData.slice(2, 3) : [valByte];
            this._log.info(`Parsed ANC mode event: ${hexBytes(modeBytes)}`);
            this._callbacks?.updateNoiseControl?.(modeBytes.length === 1 ? modeBytes[0] : modeBytes);
        }
    }

    setNoiseControl(mode) {
        const modeBytes = Array.isArray(mode) ? mode : [mode];
        this._log.info(`Set Noise Control: ${hexBytes(modeBytes)}`);
        const payload = [0x01, 0x01, ...modeBytes];
        this._queuePacket(Cmd.SET_ANC, payload, 'Set Noise Control');
    }

    _getFeatureSwitches() {
        if (!this._modelData)
            return;

        const featureBytes = [];
        for (const feat of FEATURE_CONFIG_MAP) {
            const byte = resolveFeatureByte(this._modelData, feat.configKeys, feat.defaultByte);
            if (byte !== null)
                featureBytes.push(byte);
        }

        if (featureBytes.length > 0)
            this._queuePacket(Cmd.FEATURE_SWITCH, [featureBytes.length, ...featureBytes], 'Query Features');
    }

    _parseFeatureSwitchResponse(payload) {
        if (payload.length < 2 || payload[0] !== 0x00)
            return;

        const count = payload[1];
        this._log.info(`Feature switch response: count=${count}`);
        this._applyFeaturePairs(payload, count, 2);
    }

    _parseFeatureSwitchEvent(payload) {
        if (payload.length < 1)
            return;

        const count = payload[0];
        this._log.info(`Feature switch event: count=${count}`);
        this._applyFeaturePairs(payload, count, 1);
    }

    _applyFeaturePairs(payload, count, startIdx) {
        let pos = startIdx;
        for (let i = 0; i < count && pos + 1 < payload.length; i++) {
            const featByte = payload[pos++];
            const val = payload[pos++] === 0x01;

            for (const feat of FEATURE_CONFIG_MAP) {
                const byte = resolveFeatureByte(this._modelData, feat.configKeys, feat.defaultByte);
                if (byte === featByte) {
                    this._callbacks?.[feat.callback]?.(val);
                    break;
                }
            }
        }
    }

    _setFeatureSwitch(feat, enable, name) {
        this._log.info(`Set ${name}: ${enable}`);
        const payload = [feat, enable ? 0x01 : 0x00];
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, payload, `Set ${name}`);
    }

    setLatency(enable) {
        const byte = resolveFeatureByte(this._modelData, 'lowLatencyMode', FeatureId.GAME_MODE);
        if (byte !== null)
            this._setFeatureSwitch(byte, enable, 'Low Latency Game Mode');
    }

    setInEar(enable) {
        const byte = resolveFeatureByte(this._modelData, 'inEarDetection', FeatureId.IN_EAR);
        if (byte !== null)
            this._setFeatureSwitch(byte, enable, 'In-Ear Detection');
    }

    setDualConnection(enable) {
        const byte = resolveFeatureByte(this._modelData, 'dualConnection', FeatureId.DUAL_DEVICE);
        if (byte !== null) {
            this._setFeatureSwitch(byte, enable, 'Dual Connection');
            if (enable)
                this._getMultiConnectInfo();
        }
    }

    setWindNoise(enable) {
        const byte = resolveFeatureByte(this._modelData, 'windNoiseReduction', FeatureId.WIND_NOISE);
        if (byte !== null)
            this._setFeatureSwitch(byte, enable, 'Wind Noise');
    }

    setVolumeEnhancer(enable) {
        const byte = resolveFeatureByte(this._modelData, 'volumeEnhancer', FeatureId.VOLUME_ENHANCER);
        if (byte !== null)
            this._setFeatureSwitch(byte, enable, 'Volume Enhancer');
    }

    setSpatialAudio(enable) {
        const byte = resolveFeatureByte(this._modelData, 'spatialAudio', FeatureId.SPATIAL);
        if (byte !== null) {
            this._setFeatureSwitch(byte, enable, 'Spatial Audio');
            this._queuePacket(Cmd.SET_SPATIAL_AUDIO, [enable ? 0x01 : 0x00], 'Set Spatial Audio Type');
        }
    }

    setHighRes(enable) {
        const byte = resolveFeatureByte(this._modelData, 'highResAudio', FeatureId.HIGH_RES);
        if (byte !== null)
            this._setFeatureSwitch(byte, enable, 'High-Res LHDC');
    }

    setDynamicBass(enable) {
        const byte = resolveFeatureByte(this._modelData, 'dynamicBass', FeatureId.DYNAMIC_BASS);
        if (byte !== null)
            this._setFeatureSwitch(byte, enable, 'Dynamic Bass');
    }

    setAutoAnswer(enable) {
        const byte = resolveFeatureByte(this._modelData, 'autoAnswer', FeatureId.AUTO_ANSWER);
        if (byte !== null)
            this._setFeatureSwitch(byte, enable, 'Auto Answer');
    }

    setFindPhone(enable) {
        const byte = resolveFeatureByte(this._modelData, 'findMyPhone', FeatureId.FIND_PHONE);
        if (byte !== null)
            this._setFeatureSwitch(byte, enable, 'Find My Phone');
    }

    setFindBuds(ringState) {
        const ring = ringState === 'started' || ringState === 'playing' || ringState === true || ringState === 1;
        this._log.info(`Set Find Buds: ${ring}`);
        const payload = [ring ? 0x01 : 0x00];
        this._queuePacket(Cmd.FIND_BUDS, payload, 'Set Find Buds');
    }

    _getMultiConnectInfo() {
        this._queuePacket(Cmd.GET_MULTI_CONNECT_INFO, [], 'Query Multi-Connect Devices');
    }

    _parseMultiConnectInfo(payload, cmd) {
        if (!payload || payload.length === 0)
            return;

        const isResponse = cmd === Cmd.GET_MULTI_CONNECT_INFO_RSP;
        if (isResponse) {
            if (payload.length < 2 || payload[0] !== 0x00) {
                this._log.info(`Multi-connect query error status: 0x${payload[0]?.toString(16)}`);
                return;
            }
        }

        const count = isResponse ? payload[1] : payload[0];
        let pos = isResponse ? 2 : 1;
        const devices = [];

        if (count === 0) {
            this._log.info(`Multi-Connect: 0 devices connected`);
            this._callbacks?.updateMultiConnectDevices?.([]);
            return;
        }

        for (let i = 0; i < count && pos + 10 <= payload.length; i++) {
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

        this._log.info(`Parsed Multi-Connect Devices (${devices.length}): ${JSON.stringify(devices)}`);
        this._callbacks?.updateMultiConnectDevices?.(devices);
    }

    getMultiConnectInfo() {
        this._getMultiConnectInfo();
    }

    operateMultiConnect(op, macAddress) {
        this._log.info(`Operate MultiConnect: op=${op}, mac=${macAddress}`);
        const macParts = macToReversedBytes(macAddress);
        if (macParts.length !== 6) {
            this._log.info(`Invalid MAC address for MultiConnect: ${macAddress}`);
            return;
        }

        let action = 0x00;
        if (op === 0x01 || op === 'disconnect')
            action = 0x00;
        else if (op === 0x02 || op === 'connect')
            action = 0x01;
        else if (op === 0x03 || op === 'remove')
            action = 0x02;

        const payload = [0x01, ...macParts, action];
        this._queuePacket(Cmd.OPERATE_MULTI_CONNECT, payload, `MultiConnect Action ${action} for ${macAddress}`);

        if (this._multiConnectRefreshTimeout) {
            GLib.source_remove(this._multiConnectRefreshTimeout);
            this._multiConnectRefreshTimeout = null;
        }

        this._multiConnectRefreshTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            this._multiConnectRefreshTimeout = null;
            this._getMultiConnectInfo();
            return GLib.SOURCE_REMOVE;
        });
        this._addTimeout(this._multiConnectRefreshTimeout);
    }

    _getGestures() {
        this._queuePacket(Cmd.KEY_FUNCTION, [0x02, 0x01, 0x02], 'Query Key Functions');
    }

    _parseGestures(payload) {
        if (payload.length < 2 || payload[0] !== 0x00)
            return;

        const count = payload[1];
        const startIdx = 2;
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
        const slotBytes = extraByte !== null
            ? [device, buttonId, gestureType, action, extraByte]
            : [device, buttonId, gestureType, action];
        const payload = [0x01, ...slotBytes];
        this._queuePacket(Cmd.SET_KEY_FUNCTION, payload, 'Set Key Function');
    }

    setGestureSlots(slots) {
        if (!slots || slots.length === 0)
            return;

        if (slots.length === 1) {
            const s = slots[0];
            this.setGestureSlot(s.device, s.buttonId, s.gestureType, s.action);
            return;
        }

        const payload = [slots.length];
        for (const s of slots)
            payload.push(s.device, s.buttonId, s.gestureType, s.action);

        this._log.info(`Set bulk gesture slots (${slots.length}): ${hexBytes(payload)}`);
        this._queuePacket(Cmd.SET_KEY_FUNCTION, payload, `Set ${slots.length} gesture slots`);
    }

    setNoiseControlCycle(maskByte) {
        this._log.info(`Set ANC cycle: mask=0x${maskByte.toString(16).padStart(2, '0')}`);
        const cycleType = this._modelData?.noiseControl?.ancCycleType ?? this._modelData?.ancCycleType ?? 1;
        if (cycleType === 2) {
            this._queuePacket(Cmd.SET_ANC, [0x02, 0x02, maskByte], 'Set ANC Cycle (Action 2, Type 2)');
        } else if (cycleType === 'both') {
            this._queuePacket(Cmd.SET_ANC, [0x02, 0x01, maskByte], 'Set ANC Cycle (Action 2, Type 1)');
            this._queuePacket(Cmd.SET_ANC, [0x02, 0x02, maskByte], 'Set ANC Cycle (Action 2, Type 2)');
        } else {
            this._queuePacket(Cmd.SET_ANC, [0x02, 0x01, maskByte], 'Set ANC Cycle (Action 2, Type 1)');
        }
    }

    _parseCompactnessResult(payload) {
        if (!payload || payload.length === 0)
            return;

        let leftStatus = 0;
        let rightStatus = 0;

        if (payload.length >= 4 && payload[0] === 0x01 && payload[2] === 0x02) {
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

        if (this._multiConnectRefreshTimeout) {
            GLib.source_remove(this._multiConnectRefreshTimeout);
            this._multiConnectRefreshTimeout = null;
        }

        this._removeAllTimeouts();
        this._txQueue = [];
        this._pendingRequest = null;
        this._rxBuffer = [];

        super.destroy();
    }
});
