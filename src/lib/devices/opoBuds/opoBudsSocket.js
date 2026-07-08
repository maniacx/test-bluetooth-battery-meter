'use strict';
import GObject from 'gi://GObject';

import {createLogger, getDeviceIdentifier, hexBytes} from '../logger.js';
import {SocketHandler} from '../socketByProfile.js';
import {isValidByte, isArrayEqual} from '../deviceUtils.js';
import {
    OpoBudsModelList, PayloadType
} from './opoBudsConfig.js';

/* eslint-disable max-len */

/**
Reference Material and Credits
https://codeberg.org/Freeyourgadget/Gadgetbridge/src/branch/master/app/src/main/java/nodomain/freeyourgadget/gadgetbridge/service/devices/oppo

https://github.com/funinkina/realme-t310-anc-controls

https://github.com/siudajakub/realme-buds-controller/tree/main

https://github.com/TANICE-GAWD/Poltergeist
**/

/* eslint-enable max-len */

const HEADER = 0xAA;

export const OpoBudsSocket = GObject.registerClass({
    GTypeName: 'BudsLink_OpoSocket',
}, class OpoBudsSocket extends SocketHandler {
    _init(devicePath, profileManager, profile, callbacks) {
        super._init(devicePath, profileManager, profile);
        const identifier = getDeviceIdentifier(devicePath);
        const tag = `OpoSocket-${identifier}`;
        this._log = createLogger(tag);
        this._log.info('OpoSocket init');
        this._callbacks = callbacks;
        this._seq = 0;
        this._rxBuffer = [];
        this._modelData = null;
        this._vendorId = null;
        this._productId = null;
        this._bassType = null;

        this.startSocket();
    }

    postConnectInitialization() {
        this._encode(PayloadType.SEND_INIT);
        this._getVendorId();
        this._getProductId();
    }

    processData(bytes) {
        this._rxBuffer.push(...bytes);

        while (true) {
            const msg = this._extractMessage();
            if (!msg)
                break;

            this._handleMessage(msg);
        }
    }

    _encode(command, payload = []) {
        const payloadLength = payload.length;
        const size = 9 + payloadLength;
        const seq = this._seq;

        const out = [
            HEADER,
            size - 2,
            0x00,
            0x00,
            command & 0xFF,
            command >> 8 & 0xFF,
            seq,
            payloadLength & 0xFF,
            payloadLength >> 8 & 0xFF,
            ...payload,
        ];

        this._seq = this._seq + 1 & 0xFF;
        this.sendMessage(out);
    }

    _extractMessage() {
        const buf = this._rxBuffer;

        for (let i = 0; i <= buf.length - 9; i++) {
            if (buf[i] !== HEADER)
                continue;

            const packetLength = buf[i + 1];
            const totalLength = packetLength + 2;

            if (i + totalLength > buf.length)
                return null;

            const raw = buf.slice(i, i + totalLength);
            this._rxBuffer.splice(0, i + totalLength);
            return this._parseMessage(raw);
        }

        return null;
    }

    _parseMessage(raw) {
        const command = raw[4] | raw[5] << 8;
        const seq = raw[6];
        const payloadLength = raw[7] | raw[8] << 8;
        const payload = raw.slice(9, 9 + payloadLength);
        return {command, seq, payload};
    }

    _handleMessage(msg) {
        const ackStatus = payload => {
            return payload[0] === 0 ? 'ok' : 'Failed';
        };

        this._log.info(`Command: [${hexBytes(msg.command)}] Seq: [${hexBytes(msg.seq)}] ` +
                `payload: [${hexBytes(msg.payload)}]`);

        if (msg.payload.length < 1)
            return;

        switch (msg.command) {
            case PayloadType.DEVICE_INFO: {
                //                if (this._modelData) // Test. Fake VID /PID
                this._parseDeviceInfo(msg.payload);
                break;
            }

            case PayloadType.BATTERY_RET: {
                if (this._modelData)
                    this._parseBattery(msg.payload);
                break;
            }

            case PayloadType.FIRMWARE_RET: {
                this._parseFirmware(msg.payload);
                break;
            }

            case PayloadType.VID_RET: {
                this._parseVendorId(msg.payload);
                break;
            }

            case PayloadType.PID_RET: {
                this._parseProductId(msg.payload);
                break;
            }

            case PayloadType.INEAR_STATUS_RET: {
                if (this._modelData)
                    this._parseInEarStatus(msg.payload);
                break;
            }

            case PayloadType.NOISE_REDUCTION_RET: {
                if (msg.payload[0] === 0x01 && this._modelData?.noiseControl)
                    this._parseNoiseControl(msg.payload);
                else if (msg.payload[0] === 0x02 &&
                        this._modelData.gestureOptions?.noiseControlModes)
                    this._parseLongPressMode(msg.payload);
                break;
            }

            case PayloadType.NOISE_REDUCTION_ACK: {
                this._log.info(`Noise Reduction Status: ${ackStatus(msg.payload)}`);
                break;
            }

            case PayloadType.EQPRESET_RET: {
                if (this._modelData?.eqPreset)
                    this._parseEqPreset(msg.payload);

                break;
            }

            case PayloadType.EQPRESET_ACK: {
                this._log.info(`Eq Preset Status: ${ackStatus(msg.payload)}`);
                break;
            }

            case PayloadType.EQCUSTOM_RET: {
                if (this._modelData?.eqPreset?.custom)
                    this._parseCustomEq(msg.payload);

                break;
            }

            case PayloadType.EQCUSTOM_ACK: {
                this._log.info(`Eq Custom Status: ${ackStatus(msg.payload)}`);
                break;
            }

            case PayloadType.BASS_RET: {
                if (this._modelData?.bassEnhanceLevel)
                    this._getBassLevel(msg.payload);

                break;
            }

            case PayloadType.BASS_ACK: {
                this._log.info(`BassLevel Status: ${ackStatus(msg.payload)}`);
                break;
            }

            case PayloadType.TOUCH_CONFIG_RET: {
                if (this._modelData?.gestureOptions)
                    this._parseGestures(msg.payload);

                break;
            }

            case PayloadType.TOUCH_CONFIG_ACK: {
                this._log.info(`Gesture Status: ${ackStatus(msg.payload)}`);
                break;
            }

            case PayloadType.FIND_DEVICE_ACK: {
                this._log.info(`Find Device Status: ${ackStatus(msg.payload)}`);
                break;
            }

            default:
                this._log.info(`Unhandled command ${hexBytes(msg.command)}`);
        }
    }

    _parseDeviceInfo(payload) {
        const eventType = payload[0];

        switch (eventType) {
            case 0x01:
                this._parseBattery(payload);
                break;

            case 0x02:
                this._parseInEarStatus(payload);
                break;

            default:
                this._log.info(`Unhandled device info event: ${hexBytes(eventType)}`);
                break;
        }
    }

    _getVendorId() {
        this._log.info('Get Vendor ID');
        const payload = [0x9A, 0x07];
        this._encode(PayloadType.VID_GET, payload);
    }

    _parseVendorId(payload) {
        if (payload.length !== 3) {
            this._log.info(`Unexpected Vendor ID payload length: ${payload.length}`);
            return;
        }

        const status = payload[0];
        if (status !== 0) {
            this._log.info(`Vendor ID request failed: ${status}`);
            return;
        }

        this._vendorId = payload[1] | payload[2] << 8;
        this._log.info(`Parse Vendor ID: ${hexBytes(this._vendorId)}`);
        this._updateVidPid();
    }

    _getProductId() {
        this._log.info('Get Product ID');
        this._encode(PayloadType.PID_GET);
    }

    _parseProductId(payload) {
        if (payload.length < 4)
            return;

        const status = payload[0];
        if (status !== 0) {
            this._log.warning(`Product ID request failed: ${status}`);
            return;
        }

        this._productId = payload[1] | payload[2] << 8 | payload[3] << 16;
        this._log.info(`Parse Product ID: ${hexBytes(this._productId)})`);
        this._updateVidPid();
    }

    _updateVidPid() {
        if (this._vendorId === null || this._productId === null)
            return;

        this._modelData = OpoBudsModelList.find(model => model.id.vid.includes(this._vendorId) &&
                model.id.pid.includes(this._productId));

        if (!this._modelData) {
            this._log.info(`No model matched for VID: ${hexBytes(this._vendorId)}, ` +
                    `PID: ${hexBytes(this._productId)}`);
            return;
        }

        this._callbacks?.modelIntialized?.(this._modelData, this._vendorId, this._productId);
        this._getCurrentState();
    }


    _getCurrentState() {
        this._getFirmware();
        this._getBattery();
        this._getInEarStatus();
        if (this._modelData.noiseControl)
            this._getNoiseControl();

        if (this._modelData.eqPreset)
            this._getEqPreset();

        if (this._modelData.eqPreset?.custom)
            this._getCustomEq();

        if (this._modelData.bassEnhanceLevel)
            this._getBassLevel();

        if (this._modelData.gestureOptions)
            this._getGestures();

        if (this._modelData.gestureOptions?.noiseControlModes)
            this._getFirmware();
    }

    _getFirmware() {
        this._log.info('Get Firmware');
        this._encode(PayloadType.FIRMWARE_GET);
    }

    _parseFirmware(payload) {
        if (!payload?.length || payload[0] !== 0) {
            this._log.warning(`Unexpected firmware payload: ${hexBytes(payload)}`);
            return;
        }

        this._log.info('Parse Firmware');

        let fwString;

        if (payload[payload.length - 1] === 0x00)
            fwString = new TextDecoder().decode(Uint8Array.from(payload.slice(2, -1))).trim();
        else
            fwString = new TextDecoder().decode(Uint8Array.from(payload.slice(2))).trim();

        const parts = fwString.split(',');

        const firmware = {1: null,  2: null, 3: null};

        for (let i = 0; i + 2 < parts.length; i += 3) {
            const versionPart = parts[i];
            const versionType = parts[i + 1];
            const version = parts[i + 2];

            if (versionType !== '2')
                continue;

            if (versionPart in firmware)
                firmware[versionPart] = version;
        }

        this._log.info(`Firmware 1: ${firmware[1] ?? 'N/A'}`);
        this._log.info(`Firmware 2: ${firmware[2] ?? 'N/A'}`);
        this._log.info(`Firmware 3: ${firmware[3] ?? 'N/A'}`);

        this._callbacks?.updateFirmware?.(firmware[1] ?? '');
    }

    _getBattery() {
        this._log.info('Get Battery');
        this._encode(PayloadType.BATTERY_GET);
    }

    _parseBattery(payload) {
        if (payload.length < 2)
            return;

        // Temporarily force Realme Air 7 with fake VID / PID
        if (!this._modelData) {
            this._vendorId = 0x5A4D;
            this._productId = 0x065018;

            this._modelData = OpoBudsModelList.find(model => model.id.vid.includes(this._vendorId) &&
                model.id.pid.includes(this._productId));

            if (!this._modelData) {
                this._log.info(`No model matched for VID: ${hexBytes(this._vendorId)}, ` +
                        `PID: ${hexBytes(this._productId)}`);
                return;
            }

            this._callbacks?.modelIntialized?.(this._modelData, this._vendorId, this._productId);
        }
        // Temp hack end

        this._log.info('Parse Battery');
        const props = {};

        const parse = (batteryInfo, index) => {
            if (batteryInfo === 0xFF) {
                props[`battery${index}Level`] = 0;
                props[`battery${index}Status`] = 'disconnected';
                return;
            }

            const level = batteryInfo & 0x7F;
            const charging = (batteryInfo & 0x80) !== 0;
            const statusStr = charging ? 'charging' : 'discharging';

            this._log.info(`Battery ${index}: ${level}% : ${statusStr}`);

            props[`battery${index}Level`] = level;
            props[`battery${index}Status`] = statusStr;
        };

        let left = 0xFF;
        let right = 0xFF;
        let cas = 0xFF;

        const count = payload[1];

        for (let i = 0; i < count; i++) {
            const offset = 2 + i * 2;

            if (offset + 1 >= payload.length)
                break;

            const batteryId = payload[offset];
            const batteryInfo = payload[offset + 1];

            switch (batteryId) {
                case 1:
                    left = batteryInfo;
                    break;
                case 2:
                    right = batteryInfo;
                    break;
                case 3:
                    cas = batteryInfo;
                    break;
            }
        }

        parse(left, 1);
        parse(right, 2);
        parse(cas, 3);

        this._callbacks?.updateBatteryProps?.(props);
    }

    _getInEarStatus() {
        this._log.info('Get Battery');
        this._encode(PayloadType.INEAR_STATUS_GET);
    }

    _parseInEarStatus(payload) {
        if (payload.length < 2)
            return;

        this._log.info('Parse In-Ear Status');
        const count = payload[1];
        let left = false;
        let right = false;
        let offset = 2;

        for (let i = 0; i < count; i++) {
            if (offset + 1 >= payload.length)
                break;

            const deviceType = payload[offset];
            const flags = payload[offset + 1];
            const inEar = (flags & 0x02) !== 0;

            switch (deviceType) {
                case 0x01: {
                    left = inEar;
                    break;
                }

                case 0x02: {
                    right = inEar;
                    break;
                }
            }
            offset += 2;
        }

        this._log.info(`In-ear: left=${left} right=${right}`);
        this._callbacks?.updateInEarStatus?.(left, right);
    }

    _getNoiseControl() {
        this._log.info('Get NoiseControl');
        const payload = [0x01, 0x01];
        this._encode(PayloadType.NOISE_REDUCTION_GET, payload);
    }

    _parseNoiseControl(payload) {
        if (payload.length < 3)
            return;

        this._log.info('Parse NoiseControl');

        if (payload[1] !== 0x01)
            return;

        const nc = this._modelData.noiseControl;
        const arr = [payload[2]];

        if (payload.length > 3)
            arr.push(payload[3]);

        const validModes = [];

        for (const value of Object.values(nc)) {
            if (Array.isArray(value))
                validModes.push(value);
            else if (value?.levels)
                validModes.push(...Object.values(value.levels));
        }

        const matched = validModes.some(mode => isArrayEqual(mode, arr));

        if (!matched) {
            this._log.info(`Parse NoiseControl Invalid bytes ${hexBytes(arr)}`);
            return;
        }

        this._callbacks?.updateNoiseControl?.(arr);
    }

    setNoiseControl(arr) {
        this._log.info(`Set NoiseControl Arr: ${hexBytes(arr)}`);
        const payload = [0x01, 0x01, ...arr];
        this._encode(PayloadType.NOISE_REDUCTION_SET, payload);
    }

    _getEqPreset() {
        this._log.info('Get EqPreset');
        this._encode(PayloadType.EQPRESET_GET);
    }

    _parseEqPreset(payload) {
        if (payload.length < 2)
            return;

        this._log.info('Parse EqPreset');

        const status = payload[0];
        if (status !== 0)
            return;

        const mode = payload[1];

        if (!isValidByte(mode, this._modelData.eqPreset))
            return;

        this._callbacks?.updateEqPreset?.(mode);
    }

    setEqPreset(mode) {
        this._log.info(`Set EqPreset mode: ${mode}`);
        this._encode(PayloadType.EQPRESET_SET, [mode]);
    }

    _getCustomEq() {
        this._log.info('Get CustomEq');
        this._encode(PayloadType.EQCUSTOM_GET);
    }

    _parseCustomEq(payload) {
        if (payload.length < 2)
            return;

        this._log.info('Parse CustomEq');

        const count = payload[0];
        let offset = 1;

        const arr = [];

        for (let i = 0; i < count; i++) {
            if (offset + 5 > payload.length)
                return;

            const sel = payload[offset++] !== 0;
            const min = payload[offset++];
            const max = payload[offset++];
            const eqId = payload[offset++];
            const nameLength = payload[offset++];

            if (offset + nameLength > payload.length)
                return;

            let name = '';
            if (nameLength > 0) {
                name = new TextDecoder().decode(
                    payload.slice(offset, offset + nameLength)
                );
            }
            offset += nameLength;

            if (offset >= payload.length)
                return;

            const bandCount = payload[offset++];

            const freq = [];
            const gain = [];

            for (let j = 0; j < bandCount; j++) {
                if (offset + 3 > payload.length)
                    return;

                const frequency = payload[offset] | payload[offset + 1] << 8;
                offset += 2;

                let db = payload[offset++];
                if (db > 127)
                    db -= 256;

                freq.push(frequency);
                gain.push(db);
            }

            arr.push({eqId, name, sel, min, max, freq, gain});
        }

        this._callbacks?.updateCustomEq?.(arr);
    }

    setCustomEq(eq) {
        this._log.info(`Set CustomEq eqInfo: ${eq}`);
        const encoder = new TextEncoder();

        const nameBytes = encoder.encode(eq.name ?? '');

        const payload = [
            eq.action & 0xff,
            eq.min & 0xff,
            eq.max & 0xff,
            eq.eqId & 0xff,

            nameBytes.length,
            ...nameBytes,

            eq.frequency.length,
        ];

        for (let i = 0; i < eq.frequency.length; i++) {
            const freq = eq.frequency[i];

            payload.push(freq & 0xff);
            payload.push(freq >> 8 & 0xff);
            payload.push(eq.gain[i] & 0xff);
        }

        this._encode(PayloadType.EQCUSTOM_SET, payload);
    }

    _getBassLevel() {
        this._log.info('Get BassLevel');
        this._encode(PayloadType.BASS_GET);
    }

    _parseBassLevel(payload) {
        if (payload.length < 3)
            return;

        this._log.info('Parse BassLevel');

        const min = payload[0];
        const max = payload[1];
        const current = payload[2];
        if (payload.length >= 4)
            this._bassType = payload[3];

        this._callbacks?.updateBassLevel?.([min, max, current]);
    }

    setBassLevel(arr) {
        this._log.info(`Set BassLevel arr: ${hexBytes(arr)}}`);

        const payload = [...arr];

        if (this._bassType)
            payload.push(this._bassType);

        this._encode(PayloadType.BASS_LEVEL_SET, payload);
    }

    _getGestures() {
        this._log.info('Get Gestures');
        this._encode(PayloadType.TOUCH_CONFIG_GET);
    }

    _parseGestures(payload) {
        if (payload.length < 2)
            return;

        this._log.info('Parse Gestures');
        const status = payload[0];
        if (status !== 0x00) {
            this._log.error(`Gesture packet failed with status: ${hexBytes(status)}`);
            return;
        }

        const count = payload[1];
        const expectedLen = 2 + count * 4;

        if (count <= 0 || payload.length < expectedLen) {
            this._log.error(`Invalid gesture packet length. count=${count}, ` +
                    `len=${payload.length}, expected>=${expectedLen}`);
            return;
        }

        const arr = payload.slice(1);
        this._callbacks?.updateGesture?.(arr);
    }

    setGesture(arr) {
        this._log.info(`Set Gesture arr: ${hexBytes(arr)}}`);
        const payload = [...arr];
        this._encode(PayloadType.TOUCH_CONFIG_SET, payload);
    }


    _getLongPressMode() {
        this._log.info('Get LongPressMode');
        const payload = [0x02, 0x01];
        this._encode(PayloadType.NOISE_REDUCTION_GET, payload);
    }

    _parseLongPressMode(payload) {
        if (payload.length < 3)
            return;

        this._log.info('Parse LongPressMode');

        if (payload[1] !== 0x01)
            return;

        const mode = payload[2];
        this._callbacks?.updateLongGestures?.(mode);
    }

    setLongPressMode(mode) {
        this._log.info(`Set LongPressMode: ${hexBytes(mode)}`);
        const payload = [0x02, 0x01, mode];
        this._encode(PayloadType.NOISE_REDUCTION_SET, payload);
    }

    setRingMyBuds(state) {
        const enabled = state === 'playing';
        const payload = [enabled ? 0x01 : 0x00];
        this._encode(PayloadType.FIND_DEVICE_SET, payload);
    }

    destroy() {
        super.destroy?.();
    }
});
