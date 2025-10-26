'use strict';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {createLogger} from './logger.js';
import {SocketHandler} from './socketByProfile.js';
import {Checksum, MessageType, booleanFromByte, isValidByte} from './sonyConfig.js';

import {
    PayloadType, PayloadTypeV2, DeviceSeries, DeviceColor, FunctionType, BatteryType,
    AmbientSoundMode, AutoPowerOff, Speak2ChatSensitivity, Speak2ChatTimeout, EqualizerPreset,
    ListeningMode, BgmDistance, AutoAsmSensitivity
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
        this._callbacks = callbacks;

        this._batteryDualSupported = modelData.batteryDual ?? false;
        this._batteryDual2Supported = modelData.batteryDual2 ?? false;
        this._batteryCaseSupported = modelData.batteryCase ?? false;
        this._batterySingleSupported = modelData.batterySingle ?? false;
        this._noNoiseCancellingSupported = modelData.noNoiseCancelling ?? false;
        this._ambientSoundControlSupported = modelData.ambientSoundControl ?? false;
        this._ambientSoundControl2Supported = modelData.ambientSoundControl2 ?? false;
        this._ambientSoundControlNASupported = modelData.ambientSoundControlNA ?? false;
        this._windNoiseReductionSupported = modelData.windNoiseReduction ?? false;
        this._speakToChatEnabledSupported = modelData.speakToChatEnabled ?? false;
        this._speakToChatConfigSupported = modelData.speakToChatConfig ?? false;
        this._speakToChatFocusOnVoiceSupported = modelData.speakToChatFocusOnVoice ?? false;
        this._pauseWhenTakenOffSupported = modelData.pauseWhenTakenOff ?? false;
        this._equalizerSixBands = modelData.equalizerSixBands ?? false;
        this._equalizerTenBands = modelData.equalizerTenBands ?? false;
        this._voiceNotifications = modelData.voiceNotifications ?? false;
        this._audioUpsampling = modelData.audioUpsampling ?? false;


        this._noiseAdaptiveOn = true;
        this._noiseAdaptiveSensitivity = AutoAsmSensitivity.STANDARD;
        this._bgmProps = {active: false, distance: 0, mode: ListeningMode.STANDARD};

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

    _getProtocolInfo() {
        this._log.info('GET ProtocolInfo');

        const payload = [PayloadType.CONNECT_GET_PROTOCOL_INFO];
        payload.push(0x00);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'protocolInfo');
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

        const payload = [PayloadType.CONNECT_GET_CAPABILITY_INFO];
        payload.push(0x00);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'capabilityInfo');
    }

    _getDeviceInfoModel() {
        this._log.info('GET DeviceInfoModel:');

        const payload = [PayloadType.CONNECT_GET_DEVICE_INFO];
        payload.push(0x01);

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

        const payload = [PayloadType.CONNECT_GET_DEVICE_INFO];
        payload.push(0x02);

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

        const payload = [PayloadType.CONNECT_GET_DEVICE_INFO];
        payload.push(0x03);

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

        const payload = [PayloadType.CONNECT_GET_SUPPORT_FUNCTION];
        payload.push(0x00);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'supportInfo');
    }

    _parseSupportFunctionInfo(payload) {
        this._log.info('PARSE SupportFunctionInfo');

        if (payload.length < 3)
            return;

        const numFunctions = payload[2];
        if (payload.length < 3 + numFunctions)
            return;

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

        const payloadType = PayloadType.POWER_GET_STATUS;
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

        const payload = [PayloadType.NCASM_GET_PARAM];
        let idx = 0x15;
        if (this._ambientSoundControlNASupported)
            idx = 0x19;
        else if (this._windNoiseReductionSupported || this._ambientSoundControl2Supported)
            idx = 0x17;
        payload.push(idx);
        this._addMessageQueue(MessageType.COMMAND_1, payload, 'ambientControl');
    }

    _parseAmbientSoundControl(payload) {
        this._log.info('PARSE AmbientSoundControl');

        if (payload.length < 6 || payload.length > 9)
            return;

        const idx = payload[1];

        if (idx !== 0x15 && idx !== 0x17 && idx !== 0x19 && idx !== 0x22)
            return;

        const includesWind = idx === 0x17 || idx === 0x19;
        const noNc = idx === 0x22;

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

            let i = payload.length - (this._ambientSoundControlNASupported ? 4 : 2);
            this._focusOnVoiceState = payload[i] === 0x01;

            i++;
            const level = payload[i];
            this._ambientSoundLevel = level >= 0 && level <= 20 ? level : 10;

            if (this._ambientSoundControlNASupported && idx === 0x19) {
                let j = payload.length - 2;
                const val = payload[j];
                if (val === 0x00 || val === 0x01)
                    this._noiseAdaptiveOn = val === 0x01;

                j++;
                const noiseAdaptiveSensitivity = payload[j];
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

        const payload = [PayloadType.NCASM_SET_PARAM];
        let idx = 0x15;
        if (this._ambientSoundControlNASupported)
            idx = 0x19;
        else if (this._windNoiseReductionSupported || this._ambientSoundControl2Supported)
            idx = 0x17;

        payload.push(idx);
        payload.push(0x01);
        payload.push(mode === AmbientSoundMode.ANC_OFF ? 0x00 : 0x01);
        payload.push(mode === AmbientSoundMode.AMBIENT ? 0x01 : 0x00);

        if (this._windNoiseReductionSupported)
            payload.push(mode === AmbientSoundMode.WIND ? 0x03 : 0x02);

        payload.push(this._focusOnVoiceState ? 0x01 : 0x00);
        payload.push(level);

        this._focusOnVoiceState = focusOnVoice;
        this._ambientSoundLevel = level;

        if (this._ambientSoundControlNASupported) {
            payload.push(adaptiveMode ? 0x01 : 0x00);
            payload.push(sensitivity);

            this._noiseAdaptiveOn = adaptiveMode;
            this._noiseAdaptiveSensitivity = sensitivity;
        }

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    _getSpeakToChatEnabled() {
        this._log.info('GET SpeakToChatEnabled');

        const payload = [PayloadType.SYSTEM_GET_PARAM];
        payload.push(0x0C);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'speakToChatEnable');
    }

    _parseSpeakToChatEnable(payload) {
        this._log.info('PARSE SpeakToChatEnable');

        if (payload.length !== 4 || payload[1] !== 0x0C)
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

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    _getSpeakToChatConfig() {
        this._log.info('GET SpeakToChatConfig');

        const payload = [PayloadType.SYSTEM_GET_EXT_PARAM];
        payload.push(0x0C);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'speakToChatConfig');
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

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    _getEqualizer() {
        this._log.info('GET Equalizer');

        const payload = [PayloadType.EQEBB_GET_PARAM];
        payload.push(0x00);

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
        if (this._equalizerTenBands && payload[3] === 10) {
            for (let i = 0; i < 10; i++)
                customBands.push(payload[4 + i] - 6);
        } else if (this._equalizerSixBands && payload[3] === 6) {
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

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    setEqualizerCustomBands(customBands) {
        this._log.info(`SET EqualizerCustomBands: CustomBands=${customBands}`);

        const payload = [PayloadType.EQEBB_SET_PARAM];
        payload.push(0x00);
        payload.push(0xA0);
        payload.push(this._equalizerTenBands ? 0x0A : 0x06);

        const bandCount = this._equalizerTenBands ? 10 : 6;
        const levelCompensator = this._equalizerTenBands ? 6 : 10;

        if (customBands.length !== bandCount) {
            this._log.info('setEqualizerCustomBands: invalid length');
            return;
        }

        for (let i = 0; i < bandCount; i++)
            payload.push(customBands[i] + levelCompensator);

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    _getListeningMode() {
        this._log.info('GET ListeningMode:');

        const payloadNonBgm = [PayloadType.AUDIO_GET_PARAM, 0x04];
        this._addMessageQueue(MessageType.COMMAND_1, payloadNonBgm, 'listeningModeNonBgm');

        const payloadBgm = [PayloadType.AUDIO_GET_PARAM, 0x03];
        this._addMessageQueue(MessageType.COMMAND_1, payloadBgm, 'listeningModeBgm');
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
            this._addMessageQueue(MessageType.COMMAND_1, payload);
        }

        if (!bgmActive) {
            const payload = [PayloadType.AUDIO_SET_PARAM];
            payload.push(0x04);
            payload.push(mode);
            this._addMessageQueue(MessageType.COMMAND_1, payload);
        }

        this._bgmProps.active = bgmActive;
        this._bgmProps.distance = distance;

        if (mode === ListeningMode.STANDARD || mode === ListeningMode.CINEMA)
            this._bgmProps.mode = mode;
    }


    _getVoiceNotifications() {
        this._log.info('_getVoiceNotifications:');

        const payload = [PayloadTypeV2.VOICE_GUIDANCE_GET_PARAM];
        payload.push(0x03);
        this._addMessageQueue(MessageType.COMMAND_2, payload, 'voiceNotifications');
    }

    _parseVoiceNotifications(payload) {
        this._log.info(`_parseVoiceNotifications: payload.length = ${payload.length}`);

        if (payload.length !== 4 && payload[1] !== 0x03)
            return;


        const disable = booleanFromByte(payload[2]);
        if (disable === null)
            return;

        this._callbacks?.updateVoiceNotifications?.(!disable);
    }

    setVoiceNotifications(enabled) {
        this._log.info(`_setVoiceNotifications: ${enabled}`);

        const payload = [PayloadTypeV2.VOICE_GUIDANCE_SET_PARAM];
        payload.push(0x03);
        payload.push(enabled ? 0x00 : 0x01);

        this._addMessageQueue(MessageType.COMMAND_2, payload);
    }

    _getAudioUpsampling() {
        this._log.info('GET AudioUpsampling');

        const payload = [PayloadType.AUDIO_GET_PARAM];
        payload.push(0x01);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'audioUpsampling');
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

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    _getPauseWhenTakenOff() {
        this._log.info('GET PauseWhenTakenOff');

        const payload = [PayloadType.POWER_GET_PARAM];
        payload.push(0x01);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'pauseWhenTakenOff');
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
        this._log.info(`setPauseWhenTakenOff: ${enabled}`);

        const payload = [PayloadType.SYSTEM_SET_PARAM];
        payload.push(0x00);
        payload.push(enabled ? 0x00 : 0x01);

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    _getAutomaticPowerOff() {
        this._log.info('GET AutomaticPowerOff');

        const payload = [PayloadType.POWER_GET_PARAM];
        payload.push(0x05);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'automaticPowerOff');
    }

    _parseAutomaticPowerOff(payload) {
        this._log.info('PARSE AutomaticPowerOff');

        if (payload[1] !== 0x05)
            return;

        const byte1 = payload[2];
        const byte2 = payload[3];
        const mode = Object.values(AutoPowerOff).find(v =>
            v.bytes[0] === byte1 && v.bytes[1] === byte2
        );
        if (!mode)
            return;

        this._callbacks?.updateAutomaticPowerOff?.(mode.id);
    }

    setAutomaticPowerOff(id) {
        this._log.info(`setAutomaticPowerOff: id=${id}`);

        const config = Object.values(AutoPowerOff).find(v => v.id === id);
        if (!config)
            return;

        const payload = [PayloadType.POWER_SET_PARAM];
        payload.push(0x05);
        payload.push(...config.bytes);

        this._addMessageQueue(MessageType.COMMAND_1, payload);
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
                        this._parseAutomaticPowerOff(payload);
                        break;

                    case PayloadType.NCASM_RET_PARAM:
                    case PayloadType.NCASM_NTFY_PARAM:
                        this.emit('ack-received', 'ambientControl');
                        this._parseAmbientSoundControl(payload);
                        break;

                    case PayloadType.SYSTEM_RET_PARAM:
                    case PayloadType.SYSTEM_NTFY_PARAM:
                        if (payload[1] === 0x0C) {
                            this.emit('ack-received', 'pauseWhenTakenOff');
                            this._parsePauseWhenTakenOff(payload);
                        } else if (payload[1] === 0x01) {
                            this.emit('ack-received', 'speakToChatEnable');
                            this._parseSpeakToChatEnable(payload);
                        }
                        break;

                    case PayloadType.SYSTEM_RET_EXT_PARAM:
                    case PayloadType.SYSTEM_NTFY_EXT_PARAM:
                        if (payload[1] === 0x0C) {
                            this.emit('ack-received', 'speakToChatEnable');
                            this._parseSpeakToChatConfig(payload);
                        }
                        break;

                    case PayloadType.EQEBB_RET_PARAM:
                    case PayloadType.EQEBB_NTFY_PARAM:
                        this.emit('ack-received', 'equalizer');
                        this._parseEqualizer(payload);
                        break;

                    case PayloadType.AUDIO_PARAM_RET:
                    case PayloadType.AUDIO_PARAM_NOTIFY:
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

        if (this._equalizerSixBands || this._equalizerTenBands)
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
            .then(() => this._send)
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

