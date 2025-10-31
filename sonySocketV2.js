'use strict';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {createLogger} from './logger.js';
import {SocketHandler} from './socketByProfile.js';
import {Checksum, MessageType, booleanFromByte, isValidByte} from './sonyConfig.js';

import {
    PayloadType, PayloadTypeV2, ValueType, DeviceSeries, DeviceColor, FunctionType1, BatteryType,
    BatteryStatus, AmbientSoundMode, AutoAsmSensitivity, AsmType, Speak2ChatSensitivity, AudioCodec,
    DseeType, Speak2ChatTimeout, EqualizerPreset, ListeningMode, BgmDistance, AutoPowerOffState,
    AutoPowerOffTime, AmbientButtonMode, ButtonModes
} from './sonyDefsV2.js';

/**
Sony module for Bluetooth battery meter service to provide,
battery information, ANC and Convesational awareness on device that support it.

Reference and Credits: for V1
https://codeberg.org/Freeyourgadget/Gadgetbridge

https://github.com/mos9527/SonyHeadphonesClient

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
        this._supportedFunction = [];
        this._callbacks = callbacks;

        this._asmType = null;
        this._battProps = {
            battery1Level: 0,
            battery1Status: '',
            battery2Level: 0,
            battery2Status: '',
            battery3Level: 0,
            battery3Status: '',
        };

        this._batteryDualSupported = modelData.batteryDual ?? false;
        this._batteryDual2Supported = modelData.batteryDual2 ?? false;
        this._batteryCaseSupported = modelData.batteryCase ?? false;
        this._batterySingleSupported = modelData.batterySingle ?? false;
        this._noNoiseCancellingSupported = modelData.noNoiseCancelling ?? false;
        this._ambientSoundControlSupported = modelData.ambientSoundControl ?? false;
        this._ambientSoundControl2Supported = modelData.ambientSoundControl2 ?? false;
        this._ambientSoundControlNASupported = modelData.ambientSoundControlNA ?? false;
        this._windNoiseReductionSupported = modelData.windNoiseReduction ?? false;
        this._ambientSoundControlButtonMode = modelData.ambientSoundControlButtonMode ?? false;
        this._speakToChatEnabledSupported = modelData.speakToChatEnabled ?? false;
        this._speakToChatConfigSupported = modelData.speakToChatConfig ?? false;
        this._speakToChatFocusOnVoiceSupported = modelData.speakToChatFocusOnVoice ?? false;
        this._pauseWhenTakenOffSupported = modelData.pauseWhenTakenOff ?? false;
        this._equalizerSixBands = modelData.equalizerSixBands ?? false;
        this._equalizerTenBands = modelData.equalizerTenBands ?? false;
        this._voiceNotifications = modelData.voiceNotifications ?? false;
        this._audioUpsamplingSupported = modelData.audioUpsampling ?? false;
        this._automaticPowerOffWhenTakenOff = modelData.automaticPowerOffWhenTakenOff ?? false;
        this._automaticPowerOffByTime = modelData.automaticPowerOffByTime ?? false;
        this._buttonModesLeftRight = modelData.buttonModesLeftRight?.length > 0;


        this._noiseAdaptiveOn = true;
        this._noiseAdaptiveSensitivity = AutoAsmSensitivity.STANDARD;
        this._bgmProps = {active: false, distance: 0, mode: ListeningMode.STANDARD};

        if (globalThis.TESTDEVICE)
            this.startTestSocket();
        else
            this.startSocket(fd);
    }

    _addMessageQueue(type, payload, ackType = 'unknown') {
        this._messageQueue.push({type, payload, ackType});

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

        this._ackTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            const ackType = this._currentMessage?.ackType ?? 'Unknown';
            this._log.info(`ACK not received after 300ms for ${ackType}, continuing.`);
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

        if (!this._currentMessage || !this._currentMessage.ackType)
            this._log.info('ACK Received.');
        else
            this._log.info(`ACK Received for ${this._currentMessage.ackType}`);

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
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'GetProtocolInfo');
    }

    _parseProtocolInfo(payload) {
        this._log.info('PARSE ProtocolInfo');

        const protocolVersionLE =
        payload[1] |
        payload[2] << 8 |
        payload[3] << 16 |
        payload[4] << 24;

        const protocolVersion =
        protocolVersionLE >> 24 & 0xFF |
        protocolVersionLE >> 8 & 0xFF00 |
        protocolVersionLE << 8 & 0xFF0000 |
        protocolVersionLE << 24 & 0xFF000000;

        const protocolMajor = protocolVersion >> 16 & 0xFFFF;
        const protocolMinor = protocolVersion & 0xFFFF;

        this._log.info(`Protocol Version: ${protocolMajor}.${protocolMinor}`);
    }

    _getCapabilityInfo() {
        this._log.info('GET CapabilityInfo:');

        const payload = [PayloadType.CONNECT_GET_CAPABILITY_INFO, ValueType.FIXED];
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'GetCapabilityInfo');
    }

    _getDeviceInfoModel() {
        this._log.info('GET DeviceInfoModel:');

        const payload = [PayloadType.CONNECT_GET_DEVICE_INFO, ValueType.MODEL_NAME];
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'GetDeviceInfoModel');
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
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'GetDeviceInfoFirmware');
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
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'GetDeviceInfoSeriesColor');
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
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'GetSupportInfo');
    }

    _parseSupportFunctionInfo(payload) {
        this._log.info('PARSE SupportFunctionInfo');

        if (payload.length < 3)
            return;

        const numFunctions = payload[2];
        const requiredLen = 3 + numFunctions * 2;

        if (payload.length < requiredLen)
            return;


        const funcMap = Object.entries(FunctionType1).reduce((acc, [name, value]) => {
            acc[value] = name;
            return acc;
        }, {});

        const availableFunctions = [];
        const supportedFunctionIds = [];

        for (let i = 0; i < numFunctions; i++) {
            const funcId = payload[3 + i * 2];
            const priority = payload[3 + i * 2 + 1];
            const funcName = funcMap[funcId] ?? `Unknown_0x${funcId.toString(16).padStart(2, '0')}`;
            availableFunctions.push(`${funcName} (priority=${priority})`);
            supportedFunctionIds.push(funcId);
        }

        this._supportedFunction = supportedFunctionIds;

        if (availableFunctions.length > 0)
            this._log.info(`Support Functions:\n${availableFunctions.join('\n')}`);
        else
            this._log.info('No supported functions found.');
    }

    _getBatteryRequest(batteryType) {
        this._log.info('GET BatteryRequest:');

        const payloadType = PayloadType.POWER_GET_STATUS;
        const payload = [payloadType, batteryType];

        this._addMessageQueue(MessageType.COMMAND_1, payload, `GetBatteryType${batteryType}`);
    }

    _parseBatteryStatus(payload) {
        this._log.info(`PARSE BatteryStatus payload.length = ${payload.length}`);

        if (payload.length < 4)
            return;

        const type = payload[1];
        if (!Object.values(BatteryType).includes(type))
            return;

        const getStatus = state => {
            if (state === BatteryStatus.CHARGING || state === BatteryStatus.CHARGED)
                return 'charging';
            else
                return 'discharging';
        };


        if (type === BatteryType.SINGLE || type === BatteryType.CASE ||
            type === BatteryType.SINGLE_THD || type === BatteryType.CASE_THD) {
            const level = Math.max(0, Math.min(payload[2], 100));

            if (type === BatteryType.CASE || type === BatteryType.CASE_THD) {
                this._battProps.battery3Level = level;
                this._battProps.battery3Status = getStatus(payload[3]);
            } else {
                this._battProps.battery1Level = level;
                this._battProps.battery1Status = getStatus(payload[3]);
            }
        } else if (type === BatteryType.DUAL || type === BatteryType.DUAL_THD) {
            if (payload[2] > 0) {
                const level = Math.max(0, Math.min(payload[2], 100));
                this._battProps.battery1Level = level;
                this._battProps.battery1Status = getStatus(payload[3]);
            }

            if (payload[4] > 0) {
                const level = Math.max(0, Math.min(payload[4], 100));
                this._battProps.battery2Level = level;
                this._battProps.battery2Status = getStatus(payload[5]);
            }
        } else {
            return;
        }

        this._callbacks?.updateBatteryProps?.(this._battProps);
    }


    _getAmbientSoundControl() {
        this._log.info('GET AmbientSoundControl:');

        const payload = [PayloadType.NCASM_GET_PARAM, this._asmType];
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'GetAmbientControl');
    }

    _parseAmbientSoundControl(payload) {
        this._log.info('PARSE AmbientSoundControl');

        if (payload.length < 6 || payload.length > 9)
            return;

        const idx = payload[1];

        if (idx !== 0x15 && idx !== 0x17 && idx !== 0x19 && idx !== 0x22) {
            this._log.info('ERROR: No supported NC/ASM mode found');
            return;
        }

        const includesWind = idx === 0x15;
        const noNc = idx === 0x21 || idx === 0x22;

        let mode;
        if (payload[3] === 0x00) {
            mode = AmbientSoundMode.ANC_OFF;
        } else {
            if (includesWind) {
                const sub = payload[5];
                if (sub === 0x03 || sub === 0x05) {
                    mode = AmbientSoundMode.WIND;
                } else if (sub === 0x02) {
                    mode = payload[4] === 0x00
                        ? AmbientSoundMode.ANC_ON
                        : AmbientSoundMode.AMBIENT;
                }
            } else if (noNc) {
                mode = AmbientSoundMode.AMBIENT;
            } else {
                mode = payload[4] === 0x00
                    ? AmbientSoundMode.ANC_ON
                    : AmbientSoundMode.AMBIENT;
            }
            if (mode === null)
                return;

            let i = payload.length - (idx === 19 ? 4 : 2);
            this._focusOnVoiceState = payload[i] === 0x01;

            i++;
            const level = payload[i];
            this._ambientSoundLevel = level >= 0 && level <= 20 ? level : 10;

            if (idx === 19) {
                i++;
                const val = payload[i];
                if (val === 0x00 || val === 0x01)
                    this._noiseAdaptiveOn = val === 0x01;

                i++;
                const noiseAdaptiveSensitivity = payload[i];
                if (isValidByte(noiseAdaptiveSensitivity, AutoAsmSensitivity))
                    this._noiseAdaptiveSensitivity = noiseAdaptiveSensitivity;
            }
        }

        this._callbacks?.updateAmbientSoundControl?.(mode, this._focusOnVoiceState,
            this._ambientSoundLevel, this._noiseAdaptiveOn, this._noiseAdaptiveSensitivity);
    }

    setAmbientSoundControl(mode, focusOnVoice, level, adaptiveMode, sensitivity) {
        this._log.info(
            `SET AmbientSoundControl: Mode: ${mode} Voice: ${focusOnVoice} ` +
                `Level: ${level}`);

        if (!this._asmType) {
            this._log.info('ERROR: No supported NC/ASM mode found');
            return;
        }

        const idx = this._asmType;
        const payload = [PayloadType.NCASM_SET_PARAM];
        payload.push(idx);
        payload.push(0x01);
        payload.push(mode === AmbientSoundMode.ANC_OFF ? 0x00 : 0x01);
        payload.push(mode === AmbientSoundMode.AMBIENT ? 0x01 : 0x00);

        if (this._asmType === 0x15)
            payload.push(mode === AmbientSoundMode.WIND ? 0x03 : 0x02);

        payload.push(this._focusOnVoiceState ? 0x01 : 0x00);
        payload.push(level);

        this._focusOnVoiceState = focusOnVoice;
        this._ambientSoundLevel = level;

        if (this._asmType === 0x19) {
            payload.push(adaptiveMode ? 0x01 : 0x00);
            payload.push(sensitivity);

            this._noiseAdaptiveOn = adaptiveMode;
            this._noiseAdaptiveSensitivity = sensitivity;
        }
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'SetAmbientSoundControl');
    }

    _getAmbientSoundButton() {
        this._log.info('GET AmbientSoundButton');

        const payload = [PayloadType.NCASM_GET_PARAM];
        payload.push(0x30);
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'GetAmbientSoundButton');
    }

    _parseAmbientSoundButton(payload) {
        this._log.info('PARSE AmbientSoundButton');

        let buttonValue;
        switch (payload[2]) {
            case AmbientButtonMode.NC_ASM_OFF:
                buttonValue = 0b111;
                break;
            case AmbientButtonMode.NC_ASM:
                buttonValue = 0b011;
                break;
            case AmbientButtonMode.NC_OFF:
                buttonValue = 0b101;
                break;
            case AmbientButtonMode.ASM_OFF:
                buttonValue = 0b110;
                break;
            default:
                return;
        }
        this._callbacks?.updateAmbientSoundButton?.(buttonValue);
    }


    setAmbientSoundButton(value) {
        let buttonMode;
        switch (value) {
            case 0b111:
                buttonMode = AmbientButtonMode.NC_ASM_OFF;
                break;
            case 0b011:
                buttonMode = AmbientButtonMode.NC_ASM;
                break;
            case 0b101:
                buttonMode = AmbientButtonMode.NC_OFF;
                break;
            case 0b110:
                buttonMode = AmbientButtonMode.ASM_OFF;
                break;
            default:
                return;
        }

        const payload = [PayloadType.NCASM_SET_PARAM];
        payload.push(0x30);
        payload.push(buttonMode);
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'SetAmbientSoundButton');
    }

    _getSpeakToChatEnabled() {
        this._log.info('GET SpeakToChatEnabled');

        const payload = [PayloadType.SYSTEM_GET_PARAM];
        payload.push(0x0C);
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'GetSpeakToChatEnable');
    }

    _parseSpeakToChatEnable(payload) {
        this._log.info('PARSE SpeakToChatEnable');

        if (payload.length !== 4)
            return;

        const disable = booleanFromByte(payload[2]);
        if (disable === null)
            return;

        this._callbacks?.updateSpeakToChatEnable?.(!disable);
    }

    setSpeakToChatEnabled(enabled) {
        this._log.info(`SET SpeakToChatEnabled: ${enabled}`);

        const payload = [PayloadType.SYSTEM_SET_PARAM];
        payload.push(0x0C);
        payload.push(enabled ? 0x00 : 0x01);
        payload.push(0x01);
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'SetSpeakToChatEnabled');
    }

    _getSpeakToChatConfig() {
        this._log.info('GET SpeakToChatConfig');

        const payload = [PayloadType.SYSTEM_GET_EXT_PARAM];
        payload.push(0x0C);
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'GetSpeakToChatConfig');
    }

    _parseSpeakToChatConfig(payload) {
        this._log.info('PARSE SpeakToChatConfig');

        const sensCode = payload[2];
        if (!isValidByte(sensCode, Speak2ChatSensitivity))
            return;

        const timeoutCode = payload[3];
        if (!isValidByte(timeoutCode, Speak2ChatTimeout))
            return;

        this._speak2ChatSensitivity = sensCode;
        this._speak2ChatTimeout = timeoutCode;

        this._callbacks?.updateSpeakToChatConfig?.(
            this._speak2ChatSensitivity,
            this._speak2ChatTimeout
        );
    }

    setSpeakToChatConfig(sensitivity, timeout) {
        this._log.info(`SET SpeakToChatConfig: Sensitivity=${sensitivity}, Timeout=${timeout}`);

        const payload = [PayloadType.SYSTEM_SET_EXT_PARAM];
        payload.push(0x0C);
        payload.push(sensitivity);
        payload.push(timeout);
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'SetSpeakToChatConfig');
    }

    _getEqualizer() {
        this._log.info('GET Equalizer');

        const payload = [PayloadType.EQEBB_GET_PARAM];
        payload.push(0x00);
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'GetEqualizer');
    }

    _parseEqualizer(payload) {
        this._log.info('PARSE Equalizer');

        const presetCode = payload[2];
        if (!isValidByte(presetCode, EqualizerPreset))
            return;

        const customBands = [];
        if (this._equalizerTenBands && payload[3] === 0x0A) {
            for (let i = 0; i < 10; i++)
                customBands.push(payload[4 + i] - 6);
        } else if (this._equalizerSixBands && payload[3] === 0x06) {
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

        const payload = [PayloadType.EQEBB_SET_PARAM];
        payload.push(0x00);
        payload.push(presetCode);
        payload.push(0x00);
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'SetEqualizerPreset');
    }

    setEqualizer(presetCode, customBands) {
        this._log.info(
            `SET EqualizerCustomBands: Preset: ${presetCode} CustomBands=${customBands}`);

        const payload = [PayloadType.EQEBB_SET_PARAM];
        payload.push(0x00);
        payload.push(presetCode);
        payload.push(this._equalizerTenBands ? 0x0A : 0x06);

        const bandCount = this._equalizerTenBands ? 10 : 6;
        const levelCompensator = this._equalizerTenBands ? 6 : 10;

        if (customBands.length !== bandCount) {
            this._log.info('setEqualizerCustomBands: invalid length');
            return;
        }

        for (let i = 0; i < bandCount; i++)
            payload.push(customBands[i] + levelCompensator);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'SetEqualizer');
    }

    _getListeningMode() {
        this._log.info('GET ListeningMode:');

        const payloadNonBgm = [PayloadType.AUDIO_GET_PARAM, 0x04];
        this._addMessageQueue(MessageType.COMMAND_1, payloadNonBgm, 'GetListeningModeNonBgm');

        const payloadBgm = [PayloadType.AUDIO_GET_PARAM, 0x03];
        this._addMessageQueue(MessageType.COMMAND_1, payloadBgm, 'GetListeningModeBgm');
    }

    _parseListeningModeBgm(payload) {
        this._log.info(`PARSE ListeningModeBgm: payload.length = ${payload.length}`);

        const bgmActive = payload[2] === 0x00;
        const bgmDistanceMode = payload[3];

        if (!isValidByte(bgmDistanceMode, BgmDistance))
            return;

        this._bgmProps.active = bgmActive;
        this._bgmProps.distance = bgmDistanceMode;
        this._callbacks?.updateListeningBgmMode?.(this._bgmProps);
    }

    _parseListeningModeNonBgm(payload) {
        this._log.info(`PARSE ListeningModeNonBgm: payload.length = ${payload.length}`);

        const nonBgmMode = payload[2];
        if (nonBgmMode !== ListeningMode.STANDARD && nonBgmMode !== ListeningMode.CINEMA)
            return;

        this._bgmProps.mode = nonBgmMode;
        this._callbacks?.updateListeningNonBgmMode?.(this._bgmProps);
    }

    setListeningModeBgm(mode, distance) {
        const bgmActive = mode === ListeningMode.BGM;
        const bgmToStandard =
            this._bgmProps.active && !bgmActive && mode === ListeningMode.STANDARD;

        if (bgmActive || bgmToStandard) {
            const payload = [PayloadType.AUDIO_SET_PARAM];
            payload.push(0x03);
            payload.push(bgmActive ? 0x00 : 0x01);
            payload.push(distance);
            this._addMessageQueue(MessageType.COMMAND_1, payload, 'SetListeningModeBgm');
        }

        if (!bgmActive) {
            const payload = [PayloadType.AUDIO_SET_PARAM];
            payload.push(0x04);
            payload.push(mode);
            this._addMessageQueue(MessageType.COMMAND_1, payload, 'SetListeningModeNonBgm');
        }

        this._bgmProps.active = bgmActive;
        this._bgmProps.distance = distance;

        if (mode === ListeningMode.STANDARD || mode === ListeningMode.CINEMA)
            this._bgmProps.mode = mode;
    }

    _getButtonModesLeftRight() {
        this._log.info('GET ButtonModesLeftRight');

        const payload = [PayloadType.SYSTEM_GET_PARAM];
        payload.push(0x03);
        this._addMessageQueue(MessageType.COMMAND_2, payload, 'GetButtonModesLeftRight');
    }

    _parseButtonModesLeftRight(payload) {
        this._log.info('PARSE ButtonModesLeftRight');

        const leftMode = payload[3];
        const rightMode = payload[4];

        if (payload[2] !== 0x02 || !isValidByte(leftMode, ButtonModes) ||
                    !isValidByte(rightMode, ButtonModes))
            return;

        this._callbacks?.updateButtonModesLeftRight?.(leftMode, rightMode);
    }

    setButtonModesLeftRight(leftMode, rightMode) {
        this._log.info(`SET ButtonModesLeftRight: ${leftMode}, ${rightMode}`);

        const payload = [PayloadType.SYSTEM_SET_PARAM];
        payload.push(0x03);
        payload.push(0x02);
        payload.push(leftMode);
        payload.push(rightMode);
        this._addMessageQueue(MessageType.COMMAND_2, payload, 'SetButtonModesLeftRight');
    }

    _getVoiceNotifications() {
        this._log.info('GET VoiceNotifications');

        const payload = [PayloadTypeV2.VOICE_GUIDANCE_GET_PARAM];
        payload.push(0x03);
        this._addMessageQueue(MessageType.COMMAND_2, payload, 'GetVoiceNotifications');
    }

    _parseVoiceNotifications(payload) {
        this._log.info('PARSE VoiceNotifications');

        if (payload.length !== 4 && payload[1] !== 0x03)
            return;

        const disable = booleanFromByte(payload[2]);
        if (disable === null)
            return;

        this._callbacks?.updateVoiceNotifications?.(!disable);
    }

    setVoiceNotifications(enabled) {
        this._log.info(`SET VoiceNotifications: ${enabled}`);

        const payload = [PayloadTypeV2.VOICE_GUIDANCE_SET_PARAM];
        payload.push(0x03);
        payload.push(enabled ? 0x00 : 0x01);
        this._addMessageQueue(MessageType.COMMAND_2, payload, 'SetVoiceNotifications');
    }

    _getAudioUpsampling() {
        this._log.info('GET AudioUpsampling');

        const payload = [PayloadType.AUDIO_GET_PARAM];
        payload.push(0x01);
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'GetAudioUpsampling');
    }

    _parseAudioUpsampling(payload) {
        this._log.info('PARSE AudioUpsampling');

        if (payload.length !== 3)
            return;

        const enabled = booleanFromByte(payload[2]);
        if (enabled === null)
            return;

        this._callbacks?.updateAudioSampling?.(enabled);
    }

    setAudioUpsampling(enabled) {
        this._log.info(`SET AudioUpsampling: ${enabled}`);

        const payload = [PayloadType.AUDIO_SET_PARAM];
        payload.push(0x01);
        payload.push(enabled ? 0x01 : 0x00);
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'SetAudioUpsampling');
        if (enabled)
            this._getUpscalingIndicator();
    }

    _getPauseWhenTakenOff() {
        this._log.info('GET PauseWhenTakenOff');

        const payload = [PayloadType.SYSTEM_GET_PARAM];
        payload.push(0x01);
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'GetPauseWhenTakenOff');
    }

    _parsePauseWhenTakenOff(payload) {
        this._log.info('PARSE PauseWhenTakenOff');

        if (payload.length !== 3)
            return;

        const disabled = booleanFromByte(payload[2]);
        if (disabled === null)
            return;

        this._callbacks?.updatePauseWhenTakenOff?.(!disabled);
    }

    setPauseWhenTakenOff(enabled) {
        this._log.info(`SET PauseWhenTakenOff: ${enabled}`);

        const payload = [PayloadType.SYSTEM_SET_PARAM];
        payload.push(0x01);
        payload.push(enabled ? 0x00 : 0x01);
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'SetPauseWhenTakenOff');
    }

    _getAutomaticPowerOff() {
        this._log.info('GET AutomaticPowerOff');

        const payload = [PayloadType.POWER_GET_PARAM];
        payload.push(0x05);
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'GetAutomaticPowerOff');
    }

    _parseAutomaticPowerOff(payload) {
        if (payload[1] !== 0x05)
            return;

        this._log.info('PARSE AutomaticPowerOff');

        const state = payload[2];
        const time = payload[3];

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
        payload.push(0x05);
        payload.push(state);
        payload.push(this._automaticPowerOffByTime ? time : 0x00);
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'SetAutomaticPowerOff');
    }

    _getCodecIndicator() {
        this._log.info('GET CodecIndicator');

        const payload = [PayloadType.COMMON_GET_STATUS];
        payload.push(0x02);
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'GetCodecIndicator');
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

        const payload = [PayloadType.COMMON_GET_STATUS];
        payload.push(0x03);
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'GetUpscalingIndicator');
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

                    case PayloadType.POWER_RET_STATUS:
                    case PayloadType.POWER_NTFY_STATUS:
                        this.emit('ack-received', 'battery');
                        this._parseBatteryStatus(payload);
                        break;

                    case PayloadType.POWER_RET_PARAM:
                    case PayloadType.POWER_NTFY_PARAM:
                        this.emit('ack-received', 'automaticPowerOff');
                        this._parseAutomaticPowerOff(payload);
                        break;

                    case PayloadType.NCASM_RET_PARAM:
                    case PayloadType.NCASM_NTFY_PARAM:
                        if (payload[1] === 0x30) {
                            this.emit('ack-received', 'ambientSoundButton');
                            this._parseAmbientSoundButton(payload);
                        } else {
                            this.emit('ack-received', 'ambientControl');
                            this._parseAmbientSoundControl(payload);
                        }
                        break;

                    case PayloadType.SYSTEM_RET_PARAM:
                    case PayloadType.SYSTEM_NTFY_PARAM:
                        if (payload[1] === 0x01) {
                            this.emit('ack-received', 'pauseWhenTakenOff');
                            this._parsePauseWhenTakenOff(payload);
                        } else if (payload[1] === 0x03) {
                            this.emit('ack-received', 'buttonModesLeftRight');
                            this._parseButtonModesLeftRight(payload);
                        } else if (payload[1] === 0x0C) {
                            this.emit('ack-received', 'speakToChatEnable');
                            this._parseSpeakToChatEnable(payload);
                        }
                        break;

                    case PayloadType.SYSTEM_RET_EXT_PARAM:
                    case PayloadType.SYSTEM_NTFY_EXT_PARAM:
                        if (payload[1] === 0x0C) {
                            this.emit('ack-received', 'speakToChatConfig');
                            this._parseSpeakToChatConfig(payload);
                        }
                        break;

                    case PayloadType.EQEBB_RET_PARAM:
                    case PayloadType.EQEBB_NTFY_PARAM:
                        this.emit('ack-received', 'equalizer');
                        this._parseEqualizer(payload);
                        break;

                    case PayloadType.AUDIO_RET_PARAM:
                    case PayloadType.AUDIO_NTFY_PARAM:
                        if (payload[1] === 0x01) {
                            this._parseAudioUpsampling(payload);
                            this.emit('ack-received', 'audioUpsampling');
                        } else if (payload[1] === 0x03) {
                            this.emit('ack-received', 'listeningModeBgm');
                            this._parseListeningModeBgm(payload);
                        } else if (payload[1] === 0x04) {
                            this._parseListeningModeNonBgm(payload);
                            this.emit('ack-received', 'listeningModeNonBgm');
                        }
                        break;

                    case PayloadType.COMMON_RET_STATUS:
                    case PayloadType.COMMON_NTFY_STATUS:
                        if (payload[1] === 0x02) {
                            this._parseCodecIndicator(payload);
                            this.emit('ack-received', 'codecIndicator');
                        } else if (payload[1] === 0x03) {
                            this._parseUpscalingIndicator(payload);
                            this.emit('ack-received', 'upsamplingIndicator');
                        }
                }
            }

            if (messageType === MessageType.COMMAND_2) {
                switch (payload[0]) {
                    case PayloadTypeV2.VOICE_GUIDANCE_RET_PARAM:
                    case PayloadTypeV2.VOICE_GUIDANCE_NTFY_PARAM:
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

        if (this._supportedFunction.length === 0)
            return;

        if (this._supports(FunctionType1.CODEC_INDICATOR))
            this._getCodecIndicator();

        if (this._supports(FunctionType1.UPSCALING_INDICATOR))
            this._getUpscalingIndicator();

        if (this._supports(FunctionType1.BATTERY_LEVEL_INDICATOR)) {
            this._getBatteryRequest(BatteryType.SINGLE);
        } else if (this._supports(FunctionType1.BATTERY_LEVEL_WITH_THRESHOLD)) {
            this._getBatteryRequest(BatteryType.SINGLE_THD);
            this._getBatteryRequest(BatteryType.SINGLE);
        }

        if (this._supports(FunctionType1.LEFT_RIGHT_BATTERY_LEVEL_INDICATOR)) {
            this._getBatteryRequest(BatteryType.DUAL);
        } else if (this._supports(FunctionType1.LR_BATTERY_LEVEL_WITH_THRESHOLD)) {
            this._getBatteryRequest(BatteryType.DUAL_THD);
            this._getBatteryRequest(BatteryType.DUAL);
        }

        if (this._supports(FunctionType1.CRADLE_BATTERY_LEVEL_INDICATOR)) {
            this._getBatteryRequest(BatteryType.CASE);
        } else if (this._supports(FunctionType1.CRADLE_BATTERY_LEVEL_WITH_THRESHOLD)) {
            this._getBatteryRequest(BatteryType.CASE_THD);
            this._getBatteryRequest(BatteryType.CASE);
        }

        if (this._automaticPowerOffWhenTakenOff)
            this._getAutomaticPowerOff();

        if (this._equalizerSixBands || this._equalizerTenBands)
            this._getEqualizer();

        if (this._audioUpsamplingSupported)
            this._getAudioUpsampling();

        /* eslint-disable max-len */
        if (this._supports(FunctionType1.MODE_NC_ASM_NOISE_CANCELLING_DUAL_AMBIENT_SOUND_MODE_LEVEL_ADJUSTMENT_NOISE_ADAPTATION))
            this._asmType = AsmType.MODE_NC_ASM_DUAL_NC_MODE_SWITCH_AND_ASM_SEAMLESS_NA;
        else if (this._supports(FunctionType1.MODE_NC_ASM_NOISE_CANCELLING_DUAL_AMBIENT_SOUND_MODE_LEVEL_ADJUSTMENT))
            this._asmType = AsmType.MODE_NC_ASM_DUAL_NC_MODE_SWITCH_AND_ASM_SEAMLESS;
        else if (this._supports(FunctionType1.MODE_NC_ASM_NOISE_CANCELLING_DUAL_AUTO_AMBIENT_SOUND_MODE_LEVEL_ADJUSTMENT))
            this._asmType = AsmType.MODE_NC_ASM_AUTO_NC_MODE_SWITCH_AND_ASM_SEAMLESS;
        else if (this._supports(FunctionType1.AMBIENT_SOUND_MODE_LEVEL_ADJUSTMENT))
            this._asmType = AsmType.ASM_SEAMLESS;
        /* eslint-enable max-len */

        if (this._asmType)
            this._getAmbientSoundControl();

        if (this._pauseWhenTakenOffSupported)
            this._getPauseWhenTakenOff();

        if (this._buttonModesLeftRight)
            this._getButtonModesLeftRight();

        if (this._speakToChatEnabledSupported)
            this._getSpeakToChatEnabled();

        if (this._speakToChatConfigSupported)
            this._getAmbientSoundButton();

        if (this._speakToChatConfigSupported)
            this._getSpeakToChatConfig();

        if (this._voiceNotifications)
            this._getVoiceNotifications();

        this._callbacks?.deviceInitialized?.();
    }

    _requestDeviceInfoSupportFunctions() {
        // this._getCapabilityInfo();
        // this._getDeviceInfoModel();
        this._getDeviceInfoFirmware();
        // this._getDeviceInfoSeriesColor();

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
        this.ackSignalId = this.connect('ack-received', this._onAcknowledgeReceived.bind(this));
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

