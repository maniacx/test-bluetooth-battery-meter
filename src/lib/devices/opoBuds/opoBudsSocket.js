'use strict';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {createLogger, getDeviceIdentifier} from '../logger.js';
import {SocketHandler} from '../socketByProfile.js';
import {getBluezDeviceProxy} from '../../bluezDeviceProxy.js';
import {
    OpoBudsModelList, Cmd, FeatureId, EventCode, BatteryComponent
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
            (cmd >> 8) & 0xFF,
            this._seq,
            payLen & 0xFF,
            (payLen >> 8) & 0xFF,
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
        const cmd = raw[4] | (raw[5] << 8);
        const seq = raw[6];
        const payLen = raw[7] | (raw[8] << 8);
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
        this._queuePacket(Cmd.REGISTER_NOTIFICATION, [events.length, ...events], 'Subscribe Broadcast Events');

        this._queuePacket(Cmd.PRODUCT_ID, [], 'Query Product ID');
        this._queuePacket(Cmd.VERSION, [], 'Query Version');

        this._modelFallbackTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            if (!this._modelInitialized)
                this._getModelByName();

            this._modelFallbackTimeoutId = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    _getModelByName() {
        const bluezProxy = getBluezDeviceProxy(this._devicePath);
        const alias = bluezProxy.Alias ?? bluezProxy.Name ?? '';

        this._log.info(`Model fallback by name: "${alias}"`);
        const model = OpoBudsModelList.find(m => m.pattern.test(alias)) ?? OpoBudsModelList[0];
        this._onModelInitialized(model);
    }

    _onModelInitialized(modelData) {
        if (this._modelInitialized)
            return;

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
    }

    _getBattery() {
        this._queuePacket(Cmd.BATTERY, [], 'Query Battery');
    }

    _getNoiseControl() {
        this._queuePacket(Cmd.ANC, [0x01, 0x01], 'Query ANC');
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

    _getEqPreset() {
        this._queuePacket(Cmd.EQ, [], 'Query EQ Preset');
    }

    _getGestures() {
        this._queuePacket(Cmd.KEY_FUNCTION, [0x02, 0x01, 0x02], 'Query Key Functions');
    }

    _parseData(resp) {
        const {cmd, payload} = resp;

        switch (cmd) {
            case Cmd.PRODUCT_ID_RSP:
                if (!this._modelInitialized && payload.length >= 4 && payload[0] === 0x00) {
                    const id = payload[1] | (payload[2] << 8) | (payload[3] << 16);
                    const pidHex = id.toString(16).padStart(6, '0').toUpperCase();
                    this._log.info(`Received Product ID: 0x${pidHex}`);
                    const model = OpoBudsModelList.find(m => m.modelId.toUpperCase() === pidHex);
                    if (model)
                        this._onModelInitialized(model);
                    else
                        this._getModelByName();
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
            case Cmd.SET_KEY_FUNCTION_RSP:
            case 0x0501:
            case 0x0508:
                this._parseGestures(payload);
                break;

            case Cmd.NOTIFICATION_EVENT:
                this._parseNotificationEvent(payload);
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

    _parseAnc(payload) {
        if (payload.length < 3)
            return;

        const modeByte = payload[payload.length - 1];
        this._log.info(`Parsed ANC mode byte: 0x${modeByte.toString(16)}`);
        this._callbacks?.updateNoiseControl?.(modeByte);
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

    _parseEq(payload) {
        if (payload.length === 0)
            return;

        const presetId = payload[payload.length - 1];
        this._log.info(`Parsed EQ preset: ${presetId}`);
        this._callbacks?.updateEqPreset?.(presetId);
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
        const slotsBytes = payload.slice(startIdx, startIdx + count * 4);
        const hex = Array.from(slotsBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        this._log.info(`Parsed gestures hex: ${hex}`);
        this._callbacks?.updateGestures?.(hex);
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
                    if (subId === 0x01) {
                        const modeByte = eventData[2];
                        this._callbacks?.updateNoiseControl?.(modeByte);
                    }
                } else if (eventData.length >= 1) {
                    const modeByte = eventData[eventData.length - 1];
                    this._callbacks?.updateNoiseControl?.(modeByte);
                }
                break;

            case EventCode.GAME_MODE:
                if (eventData.length >= 1)
                    this._callbacks?.updateLatency?.(eventData[0] === 0x01);
                break;

            case EventCode.EARBUDS_STATUS:
                this._log.info('Received Earbuds in-ear status event');
                break;
        }
    }

    setNoiseControl(modeByte) {
        this._log.info(`Set ANC mode byte: 0x${modeByte.toString(16)}`);
        this._queuePacket(Cmd.SET_ANC, [0x01, 0x01, modeByte], 'Set ANC Mode');
    }

    setNoiseControlCycle(maskByte) {
        this._log.info(`Set ANC cycle mask byte: 0x${maskByte.toString(16)}`);
        this._queuePacket(Cmd.SET_ANC_CYCLE, [0x01, maskByte], 'Set ANC Cycle Mask');
    }

    setLatency(enable) {
        this._log.info(`Set Low Latency Game Mode: ${enable}`);
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, [FeatureId.GAME_MODE, enable ? 0x01 : 0x00], 'Set Game Mode');
    }

    setInEar(enable) {
        this._log.info(`Set In-Ear Detection: ${enable}`);
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, [FeatureId.IN_EAR, enable ? 0x01 : 0x00], 'Set In-Ear Detection');
    }

    setDualConnection(enable) {
        this._log.info(`Set Dual Connection: ${enable}`);
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, [FeatureId.DUAL_DEVICE, enable ? 0x01 : 0x00], 'Set Dual Connection');
    }

    setWindNoise(enable) {
        this._log.info(`Set Wind Noise: ${enable}`);
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, [FeatureId.WIND_NOISE, enable ? 0x01 : 0x00], 'Set Wind Noise');
    }

    setVolumeEnhancer(enable) {
        this._log.info(`Set Volume Enhancer: ${enable}`);
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, [FeatureId.VOLUME_ENHANCER, enable ? 0x01 : 0x00], 'Set Volume Enhancer');
    }

    setSpatialAudio(enable) {
        this._log.info(`Set Spatial Audio: ${enable}`);
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, [FeatureId.SPATIAL, enable ? 0x01 : 0x00], 'Set Spatial Audio');
    }

    setHighRes(enable) {
        this._log.info(`Set High-Res LHDC: ${enable}`);
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, [FeatureId.HIGH_RES, enable ? 0x01 : 0x00], 'Set High-Res LHDC');
    }

    setDynamicBass(enable) {
        this._log.info(`Set Dynamic Bass: ${enable}`);
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, [FeatureId.DYNAMIC_BASS, enable ? 0x01 : 0x00], 'Set Dynamic Bass');
    }

    setAutoAnswer(enable) {
        this._log.info(`Set Auto Answer: ${enable}`);
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, [FeatureId.AUTO_ANSWER, enable ? 0x01 : 0x00], 'Set Auto Answer');
    }

    setFindPhone(enable) {
        this._log.info(`Set Find My Phone: ${enable}`);
        this._queuePacket(Cmd.SET_FEATURE_SWITCH, [FeatureId.FIND_PHONE, enable ? 0x01 : 0x00], 'Set Find My Phone');
    }

    setEqPreset(presetId) {
        this._log.info(`Set EQ Preset: ${presetId}`);
        this._queuePacket(Cmd.SET_EQ, [presetId], 'Set EQ Preset');
    }

    setFindBuds(ringState) {
        const ring = ringState === 'started' || ringState === 'playing';
        this._log.info(`Set Find Buds: ${ring}`);
        this._queuePacket(Cmd.FIND_BUDS, [ring ? 0x01 : 0x00], 'Set Find Buds');
    }

    setGestures(gesturesHex) {
        this._log.info(`Set gestures hex: ${gesturesHex}`);
        const bytes = [];
        for (let i = 0; i < gesturesHex.length; i += 2)
            bytes.push(parseInt(gesturesHex.slice(i, i + 2), 16));

        const count = Math.floor(bytes.length / 4);
        this._queuePacket(Cmd.SET_KEY_FUNCTION, [0x00, count, ...bytes], 'Set Key Functions');
    }

    destroy() {
        if (this._modelFallbackTimeoutId) {
            GLib.source_remove(this._modelFallbackTimeoutId);
            this._modelFallbackTimeoutId = null;
        }

        if (this._pendingTimeout) {
            GLib.source_remove(this._pendingTimeout);
            this._pendingTimeout = null;
        }

        super.destroy();
    }
});
