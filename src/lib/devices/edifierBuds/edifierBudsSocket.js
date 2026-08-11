'use strict';
import GObject from 'gi://GObject';

import {createLogger, getDeviceIdentifier, hexBytes} from '../logger.js';
import {GattHandler} from '../socketByGatt.js';
import {
    EdifierBudsModelList, HeaderCode, AppCode, CrcSeedV1, CommandType,
    ProtocolVersion, EncryptionCode, XOR10_VALUE, EdifierManufacturerId, AncMode
} from './edifierBudsConfig.js';

export const EdifierBudsSocket = GObject.registerClass({
    GTypeName: 'BudsLink_EdifierSocket',
}, class EdifierBudsSocket extends GattHandler {
    _init(devicePath, gattProfile, callbacks) {
        super._init(devicePath, gattProfile);
        const identifier = getDeviceIdentifier(devicePath);
        this._log = createLogger(`EdifierSocket-${identifier}`);
        this._log.info('EdifierSocket init');
        this._callbacks = callbacks;
        this._rxBuffer = [];

        /* Defaults match the app's fallback when a device does not tag its
           advertisement (BLEManager: version V1, no payload encryption). */
        this._version = ProtocolVersion.V1;
        this._encryption = EncryptionCode.DEFAULT;

        this._modelData = null;
        this._modelInitialized = false;
        this._battInfo = {
            battery1Level: 0,
            battery2Level: 0,
            battery3Level: 0,
            battery1Status: 'disconnected',
            battery2Status: 'disconnected',
            battery3Status: 'disconnected',
        };

        this.startSocket();
    }

    postConnectInitialization() {
        this._readProtocolVariant();
        this._initializeModel();

        /* BATTERY_QUERY (0xD0) is not answered by TWS models — an X5 Pro reports
           per-bud levels through DEVICE_STATE_QUERY instead, and also pushes it
           unsolicited whenever a level changes. */
        this._sendCommand(CommandType.DEVICE_FUNCTION_QUERY);
        this._sendCommand(CommandType.VERSION_QUERY);
        this._sendCommand(CommandType.DEVICE_STATE_QUERY);
        this._sendCommand(CommandType.ANC_QUERY);
        this._sendCommand(CommandType.IN_EAR_STATE_QUERY);
        this._sendCommand(CommandType.GAME_STATE_QUERY);
    }

    /* The peer tags its advertisement with the protocol variant it speaks:
       version = mfg[len - 2], encryption = mfg[len - 1].
       Observed on an X5 Pro: 08 f0 b6 7e f9 f0 02 10 → V2, XOR encryption. */
    _readProtocolVariant() {
        const mfg = this.peerManufacturerData?.[EdifierManufacturerId];

        if (!mfg || mfg.length < 2) {
            this._log.info(
                'No Edifier manufacturer data — assuming protocol V1, no encryption');
            return;
        }

        this._version = mfg[mfg.length - 2];
        this._encryption = mfg[mfg.length - 1];
        this._log.info(
            `Protocol from advertisement: version=${this._version} ` +
            `encryption=0x${this._encryption.toString(16)}`);
    }

    _initializeModel() {
        if (this._modelInitialized)
            return;

        const uuids = (this._profile.serviceUuids ?? []).map(u => u.toLowerCase());
        this._modelData = EdifierBudsModelList.find(
            model => model.searchUuids?.some(u => uuids.includes(u.toLowerCase()))
        ) ?? EdifierBudsModelList[0];

        this._modelInitialized = true;
        this._callbacks.modelIntialized(this._modelData, this._modelData.id[0]);
    }

    /* ------------------------------------------------------------- encoding */

    _encryptPayload(payload) {
        if (this._encryption !== EncryptionCode.XOR10)
            return payload;

        return payload.map(b => (b ^ XOR10_VALUE) & 0xFF);
    }

    _encode(command, payload = []) {
        let frame;

        if (this._version > ProtocolVersion.V1) {
            frame = [
                HeaderCode.SEND,
                AppCode.EC,
                command & 0xFF,
                payload.length >> 8 & 0xFF,
                payload.length & 0xFF,
                ...this._encryptPayload(payload),
            ];

            const sum = frame.reduce((acc, b) => acc + b, 0);
            frame.push(sum & 0xFF);
        } else {
            frame = [
                HeaderCode.SEND,
                payload.length + 1 & 0xFF,
                command & 0xFF,
                ...payload,
            ];

            const sum = frame.reduce((acc, b) => acc + b, CrcSeedV1);
            frame.push(sum >> 8 & 0xFF, sum & 0xFF);
        }

        return frame;
    }

    _sendCommand(command, payload = [], loginfo = '') {
        if (loginfo)
            this._log.info(loginfo);

        this.sendMessage(this._encode(command, payload));
    }

    /* ------------------------------------------------------------- decoding */

    processData(data) {
        this._rxBuffer.push(...data);

        while (this._rxBuffer.length > 0) {
            const start = this._rxBuffer.findIndex(
                b => b === HeaderCode.RECEIVE || b === HeaderCode.RECEIVE_LEGACY);

            if (start === -1) {
                this._rxBuffer = [];
                return;
            }

            if (start > 0)
                this._rxBuffer.splice(0, start);

            const frame = this._takeFrame();
            if (!frame)
                return;

            this._handleFrame(frame);
        }
    }

    /* Removes and returns one complete frame, or null when more bytes are needed. */
    _takeFrame() {
        const buf = this._rxBuffer;

        if (this._version > ProtocolVersion.V1) {
            if (buf.length < 6)
                return null;

            const length = buf[3] << 8 | buf[4];
            const total = 5 + length + 1;
            if (buf.length < total)
                return null;

            const raw = buf.splice(0, total);
            const sum = raw.slice(0, total - 1).reduce((acc, b) => acc + b, 0);

            if ((sum & 0xFF) !== raw[total - 1]) {
                this._log.info(`Checksum mismatch: ${hexBytes(raw[total - 1])}`);
                return null;
            }

            return {
                command: raw[2],
                payload: this._encryptPayload(raw.slice(5, total - 1)),
            };
        }

        if (buf.length < 5)
            return null;

        /* length counts the command byte plus the payload. */
        const length = buf[1];
        const total = 2 + length + 2;
        if (buf.length < total)
            return null;

        const raw = buf.splice(0, total);
        const expected = raw.slice(0, total - 2)
            .reduce((acc, b) => acc + b, CrcSeedV1) & 0xFFFF;
        const actual = raw[total - 2] << 8 | raw[total - 1];

        if (expected !== actual) {
            this._log.info(
                `Checksum mismatch: expected ${hexBytes(expected)} got ${hexBytes(actual)}`);
            return null;
        }

        return {command: raw[2], payload: raw.slice(3, total - 2)};
    }

    _handleFrame({command, payload}) {
        switch (command) {
            case CommandType.DEVICE_STATE_QUERY:
                this._handleDeviceState(payload);
                break;

            case CommandType.BATTERY_QUERY:
                this._handleBattery(payload);
                break;

            case CommandType.ANC_QUERY:
            case CommandType.ANC_SET:
                this._handleAnc(payload);
                break;

            case CommandType.VERSION_QUERY:
                this._handleVersion(payload);
                break;

            case CommandType.IN_EAR_STATE_QUERY:
            case CommandType.IN_EAR_STATE_SET:
                if (payload.length >= 1)
                    this._callbacks.updateInEarSetting(payload[0] !== 0x00);
                break;

            case CommandType.GAME_STATE_QUERY:
            case CommandType.GAME_STATE_SET:
                if (payload.length >= 1)
                    this._callbacks.updateGameMode(payload[0] !== 0x00);
                break;

            case CommandType.DEVICE_FUNCTION_QUERY:
                this._log.info(`Device function payload: ${hexBytes(payload)}`);
                break;

            default:
                this._log.info(
                    `Unhandled command ${hexBytes(command)} payload ${hexBytes(payload)}`);
                break;
        }
    }

    /* CommandParser.parseDeviceState, TWS branch:
       [peerValue, leftBattery, rightBattery, caseBattery, chargingFlag, edValue]
       Observed on an X5 Pro: 03 3b 3c 00 03 11 → 59% / 60%, case absent. */
    _handleDeviceState(payload) {
        if (payload.length < 3)
            return;

        const charging = payload.length > 4 && payload[4] === 0x01;
        const status = level => {
            if (level < 1 || level > 100)
                return 'disconnected';

            return charging ? 'charging' : 'discharging';
        };

        const inRange = level => level >= 1 && level <= 100 ? level : 0;

        this._battInfo.battery1Level = inRange(payload[1]);
        this._battInfo.battery2Level = inRange(payload[2]);
        this._battInfo.battery3Level = payload.length > 3 ? inRange(payload[3]) : 0;
        this._battInfo.battery1Status = status(payload[1]);
        this._battInfo.battery2Status = status(payload[2]);
        this._battInfo.battery3Status = payload.length > 3
            ? status(payload[3]) : 'disconnected';

        this._callbacks.updateBatteryProps({...this._battInfo});
    }

    /* Non-TWS models answer BATTERY_QUERY with a single percentage. */
    _handleBattery(payload) {
        if (payload.length < 1)
            return;

        const level = payload[0] & 0x7F;
        if (level < 1 || level > 100)
            return;

        this._battInfo.battery1Level = level;
        this._battInfo.battery1Status =
            (payload[0] & 0x80) !== 0 ? 'charging' : 'discharging';

        this._callbacks.updateBatteryProps({...this._battInfo});
    }

    /* payload = [group, mode] (+ level). Observed on an X5 Pro: 17 01. */
    _handleAnc(payload) {
        if (payload.length < 2)
            return;

        this._ancGroup = payload[0];
        const mode = payload[1];
        const level = payload.length > 2 ? payload[2] : 0;

        this._callbacks.updateNoiseControl(mode, level);
    }

    _handleVersion(payload) {
        if (payload.length === 0)
            return;

        const version = Array.from(payload).join('.');
        this._callbacks.updateFirmware(version);
    }

    /* --------------------------------------------------------------- setters */

    /* CommandManager.setANC: V2 sends [group, mode] (+ level), V1 sends [mode]. */
    setNoiseControl(mode, level = 0) {
        const group = this._ancGroup ?? this._modelData?.noiseControl?.group;
        let payload;

        if (this._version > ProtocolVersion.V1)
            payload = group === undefined ? [mode] : [group, mode];
        else
            payload = [mode];

        if (level > 0)
            payload.push(level);

        this._sendCommand(CommandType.ANC_SET, payload,
            `Set noise control mode: ${hexBytes(mode)} level: ${level}`);
    }

    setInEarDetection(enable) {
        this._sendCommand(CommandType.IN_EAR_STATE_SET, [enable ? 0x01 : 0x00],
            `Set in-ear detection: ${enable}`);
    }

    setGameMode(enable) {
        this._sendCommand(CommandType.GAME_STATE_SET, [enable ? 0x01 : 0x00],
            `Set game mode: ${enable}`);
    }

    requestBattery() {
        this._sendCommand(CommandType.DEVICE_STATE_QUERY);
    }

    requestNoiseControl() {
        this._sendCommand(CommandType.ANC_QUERY);
    }

    get ancModes() {
        return AncMode;
    }
});
