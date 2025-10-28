'use strict';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {createLogger} from './logger.js';
import {SocketHandler} from './socketByProfile.js';
import {Checksum, MessageType, booleanFromByte, isValidByte} from './sonyConfig.js';

import {
    PayloadType, ValueType, DeviceSeries, DeviceColor, FunctionType, BatteryType, AmbientSoundMode,
    Speak2ChatSensitivity, Speak2ChatTimeout, EqualizerPreset, AutoPowerOffState,
    AutoPowerOffTime, AudioCodec, DseeType
} from './sonyDefsV1.js';

/**
Sony module for Bluetooth battery meter service to provide,
battery information, ANC and Convesational awareness on device that support it.

Reference and Credits: for V1
https://codeberg.org/Freeyourgadget/Gadgetbridge

https://github.com/aybruh00/SonyHeadphonesClient

https://github.com/Plutoberth/SonyHeadphonesClient

https://github.com/andreasolofsson/MDR-protocol
**/
export const SonySocket = GObject.registerClass({
    Signals: {'ack-received': {param_types: [GObject.TYPE_STRING]}},
}, class SonySocket extends SocketHandler {
    _init(devicePath, fd, modelData, callbacks) {
        super._init(devicePath, fd);
        this._log = createLogger('SonySocket');
        this._log.info(`SonySocket init with fd: ${fd}`);
        this._messageQueue = [];
        this._initComplete = false;
        this._processingQueue = false;
        this._currentMessage = null;
        this._seq = 0;
        this._frameBuf = new Uint8Array(0);
        this._callbacks = callbacks;

        this._batteryDualSupported = modelData.batteryDual ?? false;
        this._batteryDual2Supported = modelData.batteryDual2 ?? false;
        this._batteryCaseSupported = modelData.batteryCase ?? false;
        this._batterySingleSupported = modelData.batterySingle ?? false;
        this._noNoiseCancellingSupported = modelData.noNoiseCancelling ?? false;
        this._ambientSoundControlSupported = modelData.ambientSoundControl ?? false;
        this._ambientSoundControl2Supported = modelData.ambientSoundControl2 ?? false;
        this._windNoiseReductionSupported = modelData.windNoiseReduction ?? false;
        this._speakToChatEnabledSupported = modelData.speakToChatEnabled ?? false;
        this._speakToChatConfigSupported = modelData.speakToChatConfig ?? false;
        this._speakToChatFocusOnVoiceSupported = modelData.speakToChatFocusOnVoice ?? false;
        this._equalizerSixBands = modelData.equalizerSixBands ?? false;
        this._voiceNotifications = modelData.voiceNotifications ?? false;
        this._audioUpsamplingSupported = modelData.audioUpsampling ?? false;
        this._pauseWhenTakenOffSupported = modelData.pauseWhenTakenOff ?? false;
        this._automaticPowerOffWhenTakenOffSupported =
            modelData.automaticPowerOffWhenTakenOff ?? false;

        if (globalThis.TESTDEVICE)
            this.startTestSocket();
        else
            this.startSocket(fd);
    }

    _addMessageQueue(type, payload) {
        this._messageQueue.push({type, payload});

        if (!this._processingQueue)
            this._processNextQueuedMessage();
    }

    _processNextQueuedMessage() {
        if (this._messageQueue.length === 0) {
            this._processingQueue = false;
            return;
        }

        this._processingQueue = true;
        this._currentMessage = this._messageQueue.shift();
        this._sendAndWaitAck();
    }

    _sendAndWaitAck() {
        if (!this._currentMessage)
            return;

        const {type, payload} = this._currentMessage;
        this._encodeSonyMessage(type, payload);

        if (this._ackTimeoutId) {
            GLib.source_remove(this._ackTimeoutId);
            this._ackTimeoutId = null;
        }

        this._ackTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._log.info('ACK not received after 1s, continuing.');
            this._currentMessage = null;

            if (this._messageQueue.length === 0)
                this._processingQueue = false;
            else
                this._processNextQueuedMessage();

            this._ackTimeoutId = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    _onAcknowledgeReceived(_, ackType) {
        if (ackType !== 'ack')
            return;

        this._log.info('ACK Received:');
        if (this._ackTimeoutId) {
            GLib.source_remove(this._ackTimeoutId);
            this._ackTimeoutId = null;
        }

        this._currentMessage = null;
        if (this._messageQueue.length === 0)
            this._processingQueue = false;
        else
            this._processNextQueuedMessage();
    }

    _encodeSonyMessage(messageType, payloadArr, seq) {
        const len = payloadArr.length;
        const headerBuf = new Uint8Array(6 + len);
        let sequence;
        if (seq !== undefined) {
            sequence = seq;
        } else {
            sequence = this._seq;
            this._seq = 1 - this._seq;
        }

        headerBuf[0] = messageType;
        headerBuf[1] = sequence;
        headerBuf[2] = len >>> 24 & 0xFF;
        headerBuf[3] = len >>> 16 & 0xFF;
        headerBuf[4] = len >>>  8 & 0xFF;
        headerBuf[5] = len & 0xFF;
        headerBuf.set(payloadArr, 6);

        const chksum = this._calcChecksum(headerBuf);
        const bodyEsc = this._escapeBytes(headerBuf);
        const chkEsc  = this._escapeBytes(new Uint8Array([chksum]));
        this.sendMessage(
            Uint8Array.from([Checksum.HEADER, ...bodyEsc, ...chkEsc, Checksum.TRAILER]));
    }

    _decodeSonyMessage(rawBytes) {
        if (rawBytes[0] !== Checksum.HEADER) {
            this._log.error(`Invalid header: ${rawBytes[0]}`);
            return null;
        }

        if (rawBytes.at(-1) !== Checksum.TRAILER) {
            this._log.error(`Invalid trailer: ${rawBytes.at(-1)}`);
            return null;
        }

        const unesc = this._unescapeBytes(rawBytes);
        const lenAll = unesc.length;
        const chksum = unesc[lenAll - 2];
        const exp    = this._calcChecksum(unesc.subarray(1, lenAll - 2));
        if (chksum !== exp) {
            this._log.error(`Checksum mismatch ${chksum} != ${exp}`);
            return null;
        }

        const payloadLen = unesc[3] << 24 | unesc[4] << 16 | unesc[5] << 8 | unesc[6];
        const payload = unesc.subarray(7, 7 + payloadLen);
        return {messageType: unesc[1], sequence: unesc[2], payload};
    }

    _calcChecksum(buf) {
        let sum = 0;
        for (const b of buf)
            sum = sum + b & 0xFF;
        return sum;
    }

    _escapeBytes(buf) {
        const out = [];
        for (const b of buf) {
            if (b === Checksum.HEADER || b === Checksum.TRAILER || b === Checksum.ESCAPE)
                out.push(Checksum.ESCAPE, b & Checksum.ESCAPE_MASK);
            else
                out.push(b);
        }
        return new Uint8Array(out);
    }

    _unescapeBytes(buf) {
        const out = [];
        for (let i = 0; i < buf.length; i++) {
            if (buf[i] === Checksum.ESCAPE) {
                i++;
                out.push(buf[i] | ~Checksum.ESCAPE_MASK);
            } else {
                out.push(buf[i]);
            }
        }
        return new Uint8Array(out);
    }

    _waitForResponse(ackType, resendFn, timeoutSeconds = 5, maxRetries = 3) {
        return new Promise((resolve, reject) => {
            let retries = 0;

            const attempt = () => {
                if (retries >= maxRetries) {
                    this._log.error(`Failed to receive '${ackType}' after ${maxRetries} retries`);
                    if (this._responseSignalId)
                        this.disconnect(this._responseSignalId);
                    this._responseSignalId = null;

                    if (this._responseTimeoutId)
                        GLib.source_remove(this._responseTimeoutId);
                    this._responseTimeoutId = null;

                    reject(new Error(`Timeout waiting for ${ackType}`));
                    return;
                }

                retries++;
                this._log.info(`Waiting for '${ackType}', attempt ${retries}`);

                if (this._responseSignalId)
                    this.disconnect(this._responseSignalId);

                this._responseSignalId = this.connect('ack-received', (_, receivedAck) => {
                    if (receivedAck === ackType) {
                        this._log.info(`'${ackType}' received`);
                        if (this._responseTimeoutId) {
                            GLib.source_remove(this._responseTimeoutId);
                            this._responseTimeoutId = null;
                        }
                        if (this._responseSignalId) {
                            this.disconnect(this._responseSignalId);
                            this._responseSignalId = null;
                        }
                        resolve();
                    }
                });

                resendFn();

                if (this._responseTimeoutId)
                    GLib.source_remove(this._responseTimeoutId);

                this._responseTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,
                    timeoutSeconds, () => {
                        this._log.info(`'${ackType}' not received after ` +
                             `${timeoutSeconds}s, retrying...`);
                        attempt();
                        return GLib.SOURCE_REMOVE;
                    }
                );
            };

            attempt();
        });
    }


    _encodeAck(seq) {
        this._encodeSonyMessage(MessageType.ACK, [], 1 - seq);
    }

    _supports(funcType) {
        return this._supportedFunction?.includes(funcType);
    }

    _getProtocolInfo() {
        this._log.info('GET ProtocolInfo');

        const payload = [PayloadType.CONNECT_GET_PROTOCOL_INFO, ValueType.FIXED];
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'protocolInfo');
    }

    _parseProtocolInfo(payload) {
        this._log.info('PARSE ProtocolInfo');

        const protocolVersionBE = payload[1] << 8 | payload[2];
        const protocolMajor = (protocolVersionBE & 0xFF00) >> 8;
        const protocolMinor = protocolVersionBE & 0x00FF;

        this._log.info(`Protocol Version: ${protocolMajor}.${protocolMinor}`);
    }

    _getCapabilityInfo() {
        this._log.info('GET CapabilityInfo:');

        const payload = [PayloadType.CONNECT_GET_CAPABILITY_INFO, ValueType.FIXED];
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'capabilityInfo');
    }

    _getDeviceInfoModel() {
        this._log.info('GET DeviceInfoModel:');

        const payload = [PayloadType.CONNECT_GET_DEVICE_INFO, ValueType.MODEL_NAME];
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'deviceInfoModel');
    }


    _parseDeviceInfoModel(payload) {
        this._log.info('PARSE DeviceInfoModel');

        const len = payload[2];
        const nameBytes = payload.slice(3, 3 + len);
        const name = new TextDecoder().decode(new Uint8Array(nameBytes));
        this._log.info('Device Model Name:', name);
    }

    _getDeviceInfoFirmware() {
        this._log.info('GET DeviceInfoFirmware');

        const payload = [PayloadType.CONNECT_GET_DEVICE_INFO, ValueType.FW_VERSION];
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'deviceInfoFirmware');
    }

    _parseDeviceInfoFirmware(payload) {
        this._log.info('PARSE DeviceInfoFirmware:');

        const len = payload[2];
        const fwBytes = payload.slice(3, 3 + len);
        const fwVersion = new TextDecoder().decode(new Uint8Array(fwBytes));

        this._log.info('Device Firmware Version:', fwVersion);
    }

    _getDeviceInfoSeriesColor() {
        this._log.info('GET DeviceInfoSeriesColor:');

        const payload = [PayloadType.CONNECT_GET_DEVICE_INFO, ValueType.SERIES_AND_COLOR_INFO];
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'deviceInfoSeriesColor');
    }

    _parseDeviceInfoSeriesColor(payload) {
        this._log.info('PARSE DeviceInfoSeriesColor:');

        const seriesByte = payload[2];
        const colorByte = payload[3];
        const seriesName = DeviceSeries[seriesByte] || `Unknown(${seriesByte})`;
        const colorName = DeviceColor[colorByte] || `Unknown(${colorByte})`;

        this._log.info('Device Series:', seriesName, 'Color:', colorName);
    }

    _getSupportInfo() {
        this._log.info('GET SupportInfo:');

        const payload = [PayloadType.CONNECT_GET_SUPPORT_FUNCTION, ValueType.FIXED];
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'supportInfo');
    }

    _parseSupportFunctionInfo(payload) {
        this._log.info('PARSE SupportFunctionInfo');

        if (payload.length < 2)
            return;

        const numFunctions = payload[2];
        if (payload.length < 2 + numFunctions)
            return;

        this._supportedFunctions = {
            noiseCancelling: false,
            ambientSoundMode: false,
        };

        const functionMap = {
            [FunctionType.NOISE_CANCELLING]: 'noiseCancelling',
            [FunctionType.AMBIENT_SOUND_MODE]: 'ambientSoundMode',
            [FunctionType.NOISE_CANCELLING_AND_AMBIENT_SOUND_MODE]:
                    ['noiseCancelling', 'ambientSoundMode'],
        };

        for (let i = 0; i < numFunctions; i++) {
            const func = payload[3 + i];
            const key = functionMap[func];
            if (!key)
                continue;

            if (Array.isArray(key)) {
                key.forEach(k => {
                    this._supportedFunctions[k] = true;
                });
            } else {
                this._supportedFunctions[key] = true;
            }
        }

        const map = Object.entries(FunctionType).reduce((acc, [name, value]) => {
            acc[value] = name;
            return acc;
        }, {});

        const availableFunctions = [];

        for (let i = 0; i < numFunctions; i++) {
            const func = payload[3 + i];
            const funcName = map[func];
            if (funcName)
                availableFunctions.push(funcName);
        }

        if (availableFunctions.length > 0) {
            const functionsLog = availableFunctions.join('\n');
            this._log.info(`Support Functions:\n${functionsLog}`);
        } else {
            this._log.info('No supported functions found.');
        }
    }

    _getBatteryRequest(batteryType) {
        this._log.info('GET BatteryRequest:');

        const payloadType = PayloadType.COMMON_GET_BATTERY_LEVEL;
        const payload = [payloadType, batteryType];

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'battery');
    }

    _parseBatteryStatus(payload) {
        this._log.info(`PARSE BatteryStatus payload.length = ${payload.length}`);

        if (payload.length < 4)
            return;

        const type = payload[1];
        if (!Object.values(BatteryType).includes(type))
            return;

        const hasCase = this._batteryCaseSupported;
        const props = {};

        if (type === BatteryType.SINGLE || type === BatteryType.CASE) {
            const level = Math.max(0, Math.min(payload[2], 100));
            const charging = payload[3] === 0x01;
            const status = charging ? 'charging' : 'discharging';

            if (hasCase) {
                props.battery3Level = level;
                props.battery3Status = status;
            } else {
                props.battery1Level = level;
                props.battery1Status = status;
            }
        } else if (type === BatteryType.DUAL) {
            if (payload[2] > 0) {
                const level = Math.max(0, Math.min(payload[2], 100));
                const charging = payload[3] === 0x01;
                const status = charging ? 'charging' : 'discharging';

                props.battery1Level = level;
                props.battery1Status = status;
            }

            if (payload[4] > 0) {
                const level = Math.max(0, Math.min(payload[4], 100));
                const charging = payload[5] === 0x01;
                const status = charging ? 'charging' : 'discharging';

                props.battery2Level = level;
                props.battery2Status = status;
            }
        } else {
            return;
        }

        this._callbacks?.updateBatteryProps?.(props);
    }


    _getAmbientSoundControl() {
        this._log.info('GET AmbientSoundControl:');

        const {noiseCancelling, ambientSoundMode} = this._supportedFunctions;

        let code;
        if (noiseCancelling && ambientSoundMode)
            code = 0x02;
        else if (ambientSoundMode)
            code = 0x03;
        else if (noiseCancelling)
            code = 0x01;
        else
            return;

        const payload = [PayloadType.NC_ASM_GET_PARAM];
        payload.push(code);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'ambientControl');
    }

    _parseAmbientSoundControl(payload) {
        this._log.info('PARSE AmbientSoundControl');

        if (payload.length !== 8)
            return;

        const m0 = payload[2], m1 = payload[3], m2 = payload[4];
        let mode = null;

        if (m0 === 0x00) {
            mode = AmbientSoundMode.ANC_OFF;
        } else if (m0 === 0x01) {
            if (m1 === 0x00) {
                mode = m2 === 0x00 ? AmbientSoundMode.AMBIENT : AmbientSoundMode.ANC_ON;
            } else if (m1 === 0x02) {
                if (m2 === 0x00)
                    mode = AmbientSoundMode.AMBIENT;
                else if (m2 === 0x01)
                    mode = AmbientSoundMode.WIND;
                else
                    mode = AmbientSoundMode.ANC_ON;
            }
        }

        if (!isValidByte(mode, AmbientSoundMode))
            return;

        this._ancmode = mode;
        this._focusOnVoiceState = payload[6] === 0x01;
        const level = payload[7];
        this._ambientSoundLevel = level >= 0 && level <= 20 ? level : 10;

        this._log.info(
            `PARSE AmbientSoundControl: Mode: ${mode} Voice: ${this._focusOnVoiceState} ` +
                `Level: ${level}`);

        this._callbacks?.updateAmbientSoundControl?.(
            mode, this._focusOnVoiceState, this._ambientSoundLevel);
    }

    setAmbientSoundControl(mode, focusOnVoice, level) {
        this._log.info(
            `SET AmbientSoundControl: Mode: ${mode} Voice: ${focusOnVoice} ` +
                `Level: ${level}`);
        const payload = [PayloadType.NC_ASM_SET_PARAM];

        const modeIsOff = mode === AmbientSoundMode.ANC_OFF;
        const modeIsNC = mode === AmbientSoundMode.ANC_ON;
        const modeIsWNR = mode === AmbientSoundMode.WIND;
        const modeIsAmbient = mode === AmbientSoundMode.AMBIENT;

        payload.push(0x02);
        payload.push(modeIsOff ? 0x00 : 0x11);
        payload.push(this._windNoiseReductionSupported ? 0x01 : 0x02);

        let modeCode = 0x00;
        if (this._windNoiseReductionSupported) {
            if (modeIsNC)
                modeCode = 0x02;
            else if (modeIsWNR)
                modeCode = 0x01;
        } else {
            modeCode = modeIsNC ? 0x01 : 0x00;
        }

        payload.push(modeCode);
        payload.push(0x01);
        payload.push(focusOnVoice ? 0x01 : 0x00);

        const attlevel = modeIsOff || modeIsAmbient ? level : 0x00;

        this._focusOnVoiceState = focusOnVoice;
        this._ambientSoundLevel = level;

        payload.push(attlevel);
        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    _getSpeakToChatEnabled() {
        this._log.info('GET SpeakToChatEnabled');

        const payload = [PayloadType.SYSTEM_GET_PARAM];
        payload.push(0x05);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'speakToChatEnable');
    }

    _parseSpeakToChatEnable(payload) {
        this._log.info('PARSE SpeakToChatEnable');

        if (payload.length !== 4 || payload[2] !== 0x01)
            return;

        const enabled = booleanFromByte(payload[3]);
        if (enabled === null)
            return;

        this._callbacks?.updateSpeakToChatEnable?.(enabled);
    }

    setSpeakToChatEnabled(enabled) {
        this._log.info(`SET SpeakToChatEnabled: ${enabled}`);

        const payload = [PayloadType.SYSTEM_SET_PARAM];
        payload.push(0x05);
        payload.push(0x01);
        payload.push(enabled ? 0x01 : 0x00);

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    _getSpeakToChatConfig() {
        this._log.info('GET SpeakToChatConfig');

        const payload = [PayloadType.SYSTEM_GET_EXTENDED_PARAM];
        payload.push(0x05);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'speakToChatConfig');
    }

    _parseSpeakToChatConfig(payload) {
        this._log.info('PARSE SpeakToChatConfig');

        if (payload.length !== 6)
            return;

        const sensCode = payload[3];
        if (!isValidByte(sensCode, Speak2ChatSensitivity))
            return;

        const timeoutCode = payload[5];
        if (!isValidByte(timeoutCode, Speak2ChatTimeout))
            return;

        this._callbacks?.updateSpeakToChatConfig?.(sensCode, timeoutCode);
    }

    setSpeakToChatConfig(sensitivity, timeout) {
        this._log.info(`SET SpeakToChatConfig: Sensitivity=${sensitivity}, Timeout=${timeout}`);

        if (!isValidByte(sensitivity, Speak2ChatSensitivity))
            return;

        if (!isValidByte(timeout, Speak2ChatTimeout))
            return;

        const payload = [PayloadType.SYSTEM_SET_EXTENDED_PARAM];
        payload.push(0x05);
        payload.push(0x00);
        payload.push(sensitivity);
        payload.push(0x00);
        payload.push(timeout);

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    _getEqualizer() {
        this._log.info('GET Equalizer');

        const payload = [PayloadType.EQ_EBB_GET_PARAM];
        payload.push(0x01);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'equalizer');
    }

    _parseEqualizer(payload) {
        this._log.info('PARSE Equalizer');

        if (payload.length !== 10)
            return;

        const presetCode = payload[2];
        if (!isValidByte(presetCode, EqualizerPreset))
            return;

        const customBands = [];
        if (payload[3] === 6) {
            for (let i = 0; i < 6; i++)
                customBands.push(payload[4 + i] - 10);
        } else {
            return;
        }

        this._callbacks?.updateEqualizer?.(presetCode, customBands);
    }

    setEqualizerPreset(presetCode) {
        this._log.info(`SET EqualizerPreset: PresetCode=${presetCode}`);

        if (!isValidByte(presetCode, EqualizerPreset))
            return;

        const payload = [PayloadType.EQ_EBB_SET_PARAM];
        payload.push(0x01);
        payload.push(presetCode);
        payload.push(0x00);

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    setEqualizerCustomBands(customBands) {
        this._log.info(`SET EqualizerCustomBands: CustomBands=${customBands}`);

        const payload = [PayloadType.EQ_EBB_SET_PARAM];
        payload.push(0x01);
        payload.push(0xFF);
        payload.push(0x06);

        if (customBands.length !== 6)
            return;


        for (let i = 0; i < 6; i++)
            payload.push(customBands[i] + 10);

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    _getVoiceNotifications() {
        this._log.info('GET VoiceNotifications');

        const payload = [PayloadType.VPT_GET_PARAM];
        payload.push(0x01);
        payload.push(0x01);

        this._addMessageQueue(MessageType.COMMAND_2, payload, 'voiceNotifications');
    }

    _parseVoiceNotifications(payload) {
        this._log.info('PARSE VoiceNotifications');

        if (payload.length !== 4)
            return;


        const enabled = booleanFromByte(payload[3]);
        if (enabled === null)
            return;

        this._callbacks?.updateVoiceNotifications?.(enabled);
    }

    setVoiceNotifications(enabled) {
        this._log.info(`SET VoiceNotifications: ${enabled}`);

        const payload = [PayloadType.VPT_SET_PARAM];

        payload.push(0x01);
        payload.push(0x01);
        payload.push(enabled ? 0x01 : 0x00);

        this._addMessageQueue(MessageType.COMMAND_2, payload);
    }

    _getAudioUpsampling() {
        this._log.info('GET AudioUpsampling');

        const payload = [PayloadType.AUDIO_GET_PARAM];
        payload.push(0x02);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'audioUpsampling');
    }

    _parseAudioUpsampling(payload) {
        this._log.info('PARSE AudioUpsampling');

        if (payload.length !== 4)
            return;


        const enabled = booleanFromByte(payload[3]);
        if (enabled === null)
            return;

        this._callbacks?.updateAudioSampling?.(enabled);
    }

    setAudioUpsampling(enabled) {
        this._log.info(`SET AudioUpsampling: ${enabled}`);

        const payload = [PayloadType.AUDIO_SET_PARAM];
        payload.push(0x02);
        payload.push(0x00);
        payload.push(enabled ? 0x01 : 0x00);

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    _getPauseWhenTakenOff() {
        this._log.info('GET PauseWhenTakenOff');

        const payload = [PayloadType.SYSTEM_GET_PARAM];
        payload.push(0x03);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'pauseWhenTakenOff');
    }

    _parsePauseWhenTakenOff(payload) {
        this._log.info('PARSE PauseWhenTakenOff');

        if (payload.length !== 4)
            return;


        const enabled = booleanFromByte(payload[3]);
        if (enabled === null)
            return;

        this._callbacks?.updatePauseWhenTakenOff?.(enabled);
    }

    setPauseWhenTakenOff(enabled) {
        this._log.info(`SET PauseWhenTakenOff: ${enabled}`);

        const payload = [PayloadType.SYSTEM_SET_PARAM];
        payload.push(0x03);
        payload.push(0x00);
        payload.push(enabled ? 0x01 : 0x00);

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    _getAutomaticPowerOff() {
        this._log.info('GET AutomaticPowerOff');

        const payload = [PayloadType.SYSTEM_GET_PARAM];
        payload.push(0x04);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'automaticPowerOff');
    }

    _parseAutomaticPowerOff(payload) {
        this._log.info('PARSE AutomaticPowerOff');

        const state = payload[3];
        const time = payload[4];

        if (!isValidByte(state, AutoPowerOffState)) {
            this._log.info(`Invalid Value for byte1 _parseAutomaticPowerOff: id=${state}`);
            return;
        }

        if (!isValidByte(time, AutoPowerOffTime)) {
            this._log.info(`Invalid Value for byte1 _parseAutomaticPowerOff: id=${time}`);
            return;
        }

        const enabled = state === AutoPowerOffState.ENABLE;
        this._currentAutoPowerTime = time;
        this._callbacks?.updateAutomaticPowerOff?.(enabled, time);
    }

    setAutomaticPowerOff(enabled, time) {
        this._log.info(`SET AutomaticPowerOff: enabled=${enabled} time: ${time}`);

        const state = enabled ? AutoPowerOffState.ENABLE : AutoPowerOffState.DISABLE;
        if (!isValidByte(time, AutoPowerOffTime)) {
            this._log.info(`Invalid Value for setAutomaticPowerOff: time: ${time}`);
            return;
        }

        const payload = [PayloadType.POWER_SET_PARAM];
        payload.push(0x04);
        payload.push(0x01);
        payload.push(state);
        payload.push(time);
        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    _getCodecIndicator() {
        this._log.info('GET CodecIndicator');

        const payload = [PayloadType.COMMON_GET_AUDIO_CODEC];
        payload.push(0x00);
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'codecIndicator');
    }

    _parseCodecIndicator(payload) {
        this._log.info('PARSE CodecIndicator');

        const codec = payload[2];
        if (!isValidByte(codec, AudioCodec))
            return;

        this._callbacks?.updateCodecIndicator?.(codec);
    }

    _getUpscalingIndicator() {
        this._log.info('GET UpscalingIndicator');

        const payload = [PayloadType.COMMON_GET_UPSCALING_EFFECT];
        payload.push(0x00);
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'upscalingIndicator');
    }

    _parseUpscalingIndicator(payload) {
        this._log.info('PARSE UpscalingIndicator');

        const mode = payload[2];
        const show = payload[3] !== 0x00;
        if (!isValidByte(mode, DseeType))
            return;

        this._callbacks?.updateUpscalingIndicator?.(mode, show);
    }

    processData(chunk) {
        const buf = new Uint8Array(this._frameBuf.length + chunk.length);
        buf.set(this._frameBuf, 0);
        buf.set(chunk, this._frameBuf.length);

        let frameStart = -1;
        const frames = [];
        for (let i = 0; i < buf.length; i++) {
            const b = buf[i];

            if (frameStart < 0) {
                if (b === Checksum.HEADER)
                    frameStart = i;
            } else if (b === Checksum.TRAILER) {
                frames.push(buf.slice(frameStart, i + 1));
                frameStart = -1;
            }
        }

        if (frameStart >= 0)
            this._frameBuf = buf.slice(frameStart);
        else
            this._frameBuf = new Uint8Array(0);


        for (const frame of frames)
            this._parseData(frame);
    }

    _parseData(rawData) {
        try {
            const data = this._decodeSonyMessage(rawData);
            if (!data)
                return;
            const {messageType, sequence, payload} = data;

            if (messageType === MessageType.ACK) {
                this.emit('ack-received', 'ack');
                return;
            }

            if (messageType === MessageType.COMMAND_1 || messageType === MessageType.COMMAND_2)
                this._encodeAck(sequence);

            if (messageType === MessageType.COMMAND_1) {
                switch (payload[0]) {
                    case PayloadType.CONNECT_RET_PROTOCOL_INFO:
                        this.emit('ack-received', 'protocolInfo');
                        this._parseProtocolInfo(payload);
                        break;

                    case PayloadType.CONNECT_RET_DEVICE_INFO:
                        if (payload[1] === 0x01) {
                            this.emit('ack-received', 'deviceInfoModel');
                            this._parseDeviceInfoModel(payload);
                        } else if (payload[1] === 0x02) {
                            this.emit('ack-received', 'deviceInfoFirmware');
                            this._parseDeviceInfoFirmware(payload);
                        } else if (payload[1] === 0x03) {
                            this.emit('ack-received', 'deviceInfoSeriesColor');
                            this._parseDeviceInfoSeriesColor(payload);
                        }
                        break;

                    case PayloadType.CONNECT_RET_SUPPORT_FUNCTION:
                        this.emit('ack-received', 'supportInfo');
                        this._parseSupportFunctionInfo(payload);
                        break;

                    case PayloadType.COMMON_RET_BATTERY_LEVEL:
                    case PayloadType.COMMON_NTFY_BATTERY_LEVEL:
                        this.emit('ack-received', 'battery');
                        this._parseBatteryStatus(payload);
                        break;

                    case PayloadType.NC_ASM_RET_PARAM:
                    case PayloadType.NC_ASM_NTFY_PARAM:
                        this.emit('ack-received', 'ambientControl');
                        this._parseAmbientSoundControl(payload);
                        break;

                    case PayloadType.SYSTEM_RET_PARAM:
                    case PayloadType.SYSTEM_NTFY_PARAM:
                        if (payload[1] === 0x03) {
                            this.emit('ack-received', 'pauseWhenTakenOff');
                            this._parsePauseWhenTakenOff(payload);
                        } else if (payload[1] === 0x04) {
                            this.emit('ack-received', 'automaticPowerOff');
                            this._parseAutomaticPowerOff(payload);
                        } else if (payload[1] === 0x05) {
                            this.emit('ack-received', 'speakToChatEnable');
                            this._parseSpeakToChatEnable(payload);
                        }
                        break;

                    case PayloadType.SYSTEM_RET_EXTENDED_PARAM:
                    case PayloadType.SYSTEM_NTFY_EXTENDED_PARAM:
                        if (payload[1] === 0x05) {
                            this.emit('ack-received', 'speakToChatConfig');
                            this._parseSpeakToChatConfig(payload);
                        }
                        break;

                    case PayloadType.EQ_EBB_RET_PARAM:
                    case PayloadType.EQ_EBB_NTFY_PARAM:
                        this.emit('ack-received', 'equalizer');
                        this._parseEqualizer(payload);
                        break;

                    case PayloadType.AUDIO_RET_PARAM:
                    case PayloadType.AUDIO_NTFY_PARAM:
                        if (payload[1] === 0x01) {
                            this._parseAudioUpsampling(payload);
                            this.emit('ack-received', 'audioUpsampling');
                        }
                        break;

                    case PayloadType.COMMON_RET_UPSCALING_EFFECT:
                    case PayloadType.COMMON_NTFY_UPSCALING_EFFECT:
                        this._parseCodecIndicator(payload);
                        this.emit('ack-received', 'codecIndicator');
                        break;

                    case PayloadType.COMMON_RET_AUDIO_CODEC:
                    case PayloadType.COMMON_NTFY_AUDIO_CODEC:
                        this._getUpscalingIndicator(payload);
                        this.emit('ack-received', 'upscalingIndicator');
                        break;
                }
            }

            if (messageType === MessageType.COMMAND_2) {
                switch (payload[0]) {
                    case PayloadType.VPT_RET_PARAM:
                    case PayloadType.VPT_NTFY_PARAM:
                        this.emit('ack-received', 'voiceNotifications');
                        this._parseVoiceNotifications(payload);
                        break;
                }
            }
        } catch (e) {
            this._log.error('Failed to process socket data', e);
        }
    }

    _getCurrentState() {
        this._log.info('GET CurrentState');

        if (this._batterySingleSupported)
            this._getBatteryRequest(BatteryType.SINGLE);

        if (this._batteryDualSupported || this._batteryDual2Supported)
            this._getBatteryRequest(BatteryType.DUAL);

        if (this._batteryCaseSupported)
            this._getBatteryRequest(BatteryType.CASE);

        if (this._speakToChatConfigSupported)
            this._getSpeakToChatConfig();

        if (this._speakToChatEnabledSupported)
            this._getSpeakToChatEnabled();

        if (this._equalizerSixBands)
            this._getEqualizer();

        if (this._voiceNotifications)
            this._getVoiceNotifications();

        if (this._audioUpsamplingSupported)
            this._getAudioUpsampling();

        if (this._pauseWhenTakenOffSupported)
            this._getPauseWhenTakenOff();

        if (this._automaticPowerOffWhenTakenOffSupported)
            this._getAutomaticPowerOff();

        if (!this._noNoiseCancellingSupported && (this._ambientSoundControlSupported ||
                    this._ambientSoundControl2Supported || this._windNoiseReductionSupported))
            this._getAmbientSoundControl();
    }

    _requestDeviceInfoSupportFunctions() {
        this._getCapabilityInfo();
        this._getDeviceInfoModel();
        this._getDeviceInfoFirmware();
        this._getDeviceInfoSeriesColor();

        this._waitForResponse('supportInfo', () => this._getSupportInfo(), 5, 3)
            .then(() => this._getCurrentState())
            .catch(err => this._log.error('supportInfo info initialization failed', err));
    }

    _sendInit() {
        this._waitForResponse('protocolInfo', () => this._getProtocolInfo(), 5, 3)
            .then(() => this._requestDeviceInfoSupportFunctions())
            .catch(err => this._log.error('Protocol info initialization failed', err));
    }

    postConnectInitialization() {
        this.ackSignalId =
            this.connect('ack-received', this._onAcknowledgeReceived.bind(this));

        this._sendInit();
    }

    destroy() {
        this._seq = 0;
        if (this._ackTimeoutId)
            GLib.source_remove(this._ackTimeoutId);
        this._ackTimeoutId = null;

        if (this.ackSignalId)
            this.disconnect(this.ackSignalId);
        this.ackSignalId = null;

        if (this._responseSignalId)
            this.disconnect(this._responseSignalId);
        this._responseSignalId = null;

        if (this._responseTimeoutId)
            GLib.source_remove(this._responseTimeoutId);
        this._responseTimeoutId = null;

        super.destroy();
    }
});

