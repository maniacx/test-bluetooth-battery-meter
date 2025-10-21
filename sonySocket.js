'use strict';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {createLogger} from './logger.js';
import {SocketHandler} from './socketByProfile.js';
import {
    checksum, MessageType, PayloadType, BatteryTypeV1, BatteryTypeV2, AmbientSoundMode,
    Speak2ChatSensitivity, Speak2ChatTimeout, EqualizerPreset, ListeningMode,
    BgmDistance, AutoPowerOff, AutoAsmSensitivity
} from './sonyConfig.js';

/**
Sony module for Bluetooth battery meter service to provide,
battery information, ANC and Convesational awareness on device that support it.

Reference and Credits:
https://codeberg.org/Freeyourgadget/Gadgetbridge

https://github.com/mos9527/SonyHeadphonesClient
**/

export const SonySocket = GObject.registerClass({
    Signals: {'ack-received': {param_types: [GObject.TYPE_STRING]}},
}, class SonySocket extends SocketHandler {
    _init(devicePath, fd, modelData, usesProtocolV2, callbacks) {
        super._init(devicePath, fd);
        this._log = createLogger('SonySocket');
        this._log.info(`SonySocket init with fd: ${fd}`);
        this._messageQueue = [];
        this._initComplete = false;
        this._processingQueue = false;
        this._currentMessage = null;
        this._seq = 0;
        this._frameBuf = new Uint8Array(0);
        this._usesProtocolV2 = usesProtocolV2;
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

        this._noiseAdaptiveOn = true;
        this._noiseAdaptiveSensitivity = AutoAsmSensitivity.STANDARD;
        this._speakToChatMode = false;
        this._speak2ChatSensitivity = Speak2ChatSensitivity.AUTO;
        this._speak2ChatFocusOnVoiceState = false;
        this._speak2ChatTimeout = Speak2ChatTimeout.STANDARD;
        this._bgmProps = {active: false, distance: 0, mode: ListeningMode.STANDARD};

        this.startSocket(fd);
    }

    _addMessageQueue(type, payload, ack = 'ack') {
        this._messageQueue.push({type, payload, ack});

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
        this._sendWithRetry();
    }

    _sendWithRetry() {
        if (!this._currentMessage)
            return;
        this._encodeSonyMessage(this._currentMessage.type, this._currentMessage.payload);
        this._awaitingAck = this._currentMessage.ack;

        this._retriesLeft = this._awaitingAck === 'ack' ? 0 : 3;

        if (this._ackTimeoutId) {
            GLib.source_remove(this._ackTimeoutId);
            this._ackTimeoutId = null;
        }

        this._ackTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
            if (this._retriesLeft > 0) {
                this._log.info(`ACK not received, retrying... (${this._retriesLeft})`);
                this._retriesLeft--;
                const {type, payload} = this._currentMessage ?? {};
                if (type && payload)
                    this._encodeSonyMessage(type, payload);

                return GLib.SOURCE_CONTINUE;
            }

            this._popFailedMessage();
            this._ackTimeoutId = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    _popFailedMessage() {
        this._awaitingAck = null;

        if (this._ackTimeoutId) {
            GLib.source_remove(this._ackTimeoutId);
            this._ackTimeoutId = null;
        }

        if (!this._initComplete) {
            this._log.error('ACK not received after retries. Giving up.');
            this.destroy();
        }

        this._currentMessage = null;
        if (this._messageQueue.length === 0)
            this._processingQueue = false;
        else
            this._processNextQueuedMessage();
    }

    _onAcknowledgeReceived(o, ackType) {
        this._log.info('_onAcknowledgeReceived:');
        if (this._awaitingAck !== ackType)
            return;

        this._awaitingAck = null;

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
            Uint8Array.from([checksum.HEADER, ...bodyEsc, ...chkEsc, checksum.TRAILER]));
    }

    _decodeSonyMessage(rawBytes) {
        if (rawBytes[0] !== checksum.HEADER) {
            this._log.error(`Invalid header: ${rawBytes[0]}`);
            return null;
        }

        if (rawBytes.at(-1) !== checksum.TRAILER) {
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
            if (b === checksum.HEADER || b === checksum.TRAILER || b === checksum.ESCAPE)
                out.push(checksum.ESCAPE, b & checksum.ESCAPE_MASK);
            else
                out.push(b);
        }
        return new Uint8Array(out);
    }

    _unescapeBytes(buf) {
        const out = [];
        for (let i = 0; i < buf.length; i++) {
            if (buf[i] === checksum.ESCAPE) {
                i++;
                out.push(buf[i] | ~checksum.ESCAPE_MASK);
            } else {
                out.push(buf[i]);
            }
        }
        return new Uint8Array(out);
    }

    _encodeAck(seq) {
        this._encodeSonyMessage(MessageType.ACK, [], 1 - seq);
    }

    _getInitRequest() {
        this._log.info('_getInitRequest:');

        const payload = [PayloadType.INIT_REQUEST];
        payload.push(0x00);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'init');
    }

    _getBatteryRequest(batteryType) {
        this._log.info('_getBatteryRequest:');

        const payloadType = this._usesProtocolV2 ? PayloadType.BATTERY_LEVEL_REQUEST_V2
            : PayloadType.BATTERY_LEVEL_REQUEST;
        const payload = [payloadType, batteryType];

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'battery');
    }

    _parseBatteryStatus(payload) {
        this._log.info(`_parseBatteryStatus payload.length = ${payload.length}`);
        if (payload.length < 4)
            return;

        const batteryType = this._usesProtocolV2 ? BatteryTypeV2 : BatteryTypeV1;

        const type = payload[1];
        if (!Object.values(batteryType).includes(type))
            return;

        const hasCase = this._batteryCaseSupported;
        const props = {};

        if (type === batteryType.SINGLE || type === batteryType.CASE) {
            const level = Math.max(0, Math.min(payload[2], 100));
            const charging = payload[3] === 1;
            const status = charging ? 'charging' : 'discharging';

            if (hasCase) {
                props.battery3Level = level;
                props.battery3Status = status;
            } else {
                props.battery1Level = level;
                props.battery1Status = status;
            }
        } else if (type === batteryType.DUAL) {
            if (payload[2] > 0) {
                const level = Math.max(0, Math.min(payload[2], 100));
                const charging = payload[3] === 1;
                const status = charging ? 'charging' : 'discharging';

                props.battery1Level = level;
                props.battery1Status = status;
            }

            if (payload[4] > 0) {
                const level = Math.max(0, Math.min(payload[4], 100));
                const charging = payload[5] === 1;
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
        this._log.info('_getAmbientSoundControl:');

        const payload = [PayloadType.AMBIENT_SOUND_CONTROL_GET];
        if (this._usesProtocolV2) {
            let idx = 0x15;
            if (this._ambientSoundControlNASupported)
                idx = 0x19;
            else if (this._windNoiseReductionSupported || this._ambientSoundControl2Supported)
                idx = 0x17;
            payload.push(idx);
        } else {
            payload.push(0x02);
        }

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'ambientControl');
    }

    _parseAmbientSoundControlV1(payload) {
        this._log.info(`_parseAmbientSoundControlV1 payload.length = ${payload.length}`);

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

        if (!mode)
            return;

        this._ancmode = mode;
        this._focusOnVoiceState = payload[6] === 0x01;
        const level = payload[7];
        this._ambientSoundLevel = level >= 0 && level <= 20 ? level : 10;

        this._callbacks?.updateAmbientSoundControl?.(
            mode, this._focusOnVoiceState, this._ambientSoundLevel);
    }

    _parseAmbientSoundControlV2(payload) {
        this._log.info(`_parseAmbientSoundControlV2 payload.lenght = [${payload.length}]`);
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
                if (Object.values(AutoAsmSensitivity).includes(noiseAdaptiveSensitivity))
                    this._noiseAdaptiveSensitivity = noiseAdaptiveSensitivity;
            }
        }

        this._callbacks?.updateAmbientSoundControl?.(mode, this._focusOnVoiceState,
            this._ambientSoundLevel, this._noiseAdaptiveOn, this._noiseAdaptiveSensitivity);
    }


    setAmbientSoundControl(mode, focusOnVoice, level, adaptiveMode, sensitivity) {
        if (this._usesProtocolV2)
            this._setAmbientSoundControlV2(mode, focusOnVoice, level);
        else
            this._setAmbientSoundControlV1(mode, focusOnVoice, level, adaptiveMode, sensitivity);
    }

    _setAmbientSoundControlV1(mode, focusOnVoice, level) {
        this._log.info(
            `_setAmbientSoundControlV1: mode: ${mode} focusOnVoice: ${focusOnVoice} ` +
                `level: ${level}`);
        const payload = [PayloadType.AMBIENT_SOUND_CONTROL_SET];

        const modeIsOff = mode === AmbientSoundMode.ANC_OFF; ;
        const modeIsNC = mode === AmbientSoundMode.ANC_ON;
        const modeIsWNR = mode === AmbientSoundMode.WIND;
        const modeIsAmbient = mode === AmbientSoundMode.AMBIENT;

        payload.push(0x02);
        payload.push(modeIsOff ? 0x00 : 0x11);
        payload.push(this._windNoiseReductionSupported ? 0x02 : 0x00);

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

    _setAmbientSoundControlV2(mode, focusOnVoice, level, adaptiveMode, sensitivity) {
        this._log.info(
            `_setAmbientSoundControlV2: mode: ${mode} focusOnVoice: ${focusOnVoice} ` +
                `level: ${level}`);

        const payload = [PayloadType.AMBIENT_SOUND_CONTROL_SET];
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
            payload.push(sensitivity);  // already sending correct bytes

            this._noiseAdaptiveOn = adaptiveMode;
            this._noiseAdaptiveSensitivity = sensitivity;
        }

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }


    _getSpeakToChatEnabled() {
        this._log.info('_getSpeakToChatEnabled:');

        const payload = [PayloadType.AUTOMATIC_POWER_OFF_BUTTON_MODE_GET];
        payload.push(this._usesProtocolV2 ? 0x0C : 0x05);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'speakToChatEnable');
    }

    _parseSpeakToChatEnable(payload) {
        this._log.info('_parseSpeakToChatEnable');

        if (payload.length !== 4)
            return;

        let enabled = null;

        if (this._usesProtocolV2) {
            if (payload[1] !== 0x0C)
                return;
            const disabled = payload[2];
            if (disabled === 0x00 || disabled === 0x01)
                enabled = !disabled;
            else
                return;
        } else {
            if (payload[2] !== 0x01)
                return;

            const val = payload[3];
            if (val === 0x00 || val === 0x01)
                enabled = val === 0x01;
            else
                return;
        }

        this._speakToChatMode = enabled;

        this._callbacks?.updateSpeakToChatEnable?.(this._speakToChatMode);
    }

    setSpeakToChatEnabled(enabled) {
        this._log.info(`setSpeakToChatEnabled: ${enabled}`);

        const payload = [PayloadType.AUTOMATIC_POWER_OFF_BUTTON_MODE_SET];
        if (this._usesProtocolV2) {
            payload.push(0x0C);
            payload.push(enabled ? 0x00 : 0x01);
            payload.push(0x01);
        } else {
            payload.push(0x05);
            payload.push(0x01);
            payload.push(enabled ? 0x01 : 0x00);
        }

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    _getSpeakToChatConfig() {
        this._log.info('_getSpeakToChatConfig:');

        const payload = [PayloadType.SPEAK_TO_CHAT_CONFIG_GET];
        payload.push(this._usesProtocolV2 ? 0x0C : 0x05);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'speakToChatConfig');
    }

    _parseSpeakToChatConfig(payload) {
        this._log.info('_parseSpeakToChatConfig');

        if (this._usesProtocolV2) {
            if (payload.length !== 4 || payload[1] !== 0x0C)
                return;
        } else if (payload.length !== 6 || payload[1] !== 0x05) {
            return;
        }

        const sensCode = this._usesProtocolV2 ? payload[2] : payload[3];
        if (!Object.values(Speak2ChatSensitivity).includes(sensCode))
            return;

        this._speak2ChatSensitivity = sensCode;

        if (!this._usesProtocolV2) {
            if (payload[4] !== 0x00 && payload[4] !== 0x01)
                return;
            this._speak2ChatFocusOnVoiceState = payload[4] === 0x01;
        } else {
            this._speak2ChatFocusOnVoiceState = false;
        }

        const timeoutCode = this._usesProtocolV2 ? payload[3] : payload[5];
        if (!Object.values(Speak2ChatTimeout).includes(timeoutCode))
            return;

        this._speak2ChatTimeout = timeoutCode;

        this._callbacks?.updateSpeakToChatConfig?.(
            this._speak2ChatSensitivity,
            this._speak2ChatFocusOnVoiceState,
            this._speak2ChatTimeout
        );
    }

    setSpeakToChatConfig(sensitivity, timeout) {
        this._log.info(`setSpeakToChatConfig: sensitivity=${sensitivity}, timeout=${timeout}`);

        const payload = [PayloadType.SPEAK_TO_CHAT_CONFIG_SET];
        if (this._usesProtocolV2) {
            payload.push(0x0C);
            payload.push(sensitivity & 0xFF);
            payload.push(timeout & 0xFF);
        } else {
            payload.push(0x05);
            payload.push(0x00);
            payload.push(sensitivity & 0xFF);
            payload.push(this._speak2ChatFocusOnVoiceState ? 0x01 : 0x00);
            payload.push(timeout & 0xFF);
        }

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    _getEqualizer() {
        this._log.info('_getEqualizer:');

        const payload = [PayloadType.EQUALIZER_GET];
        payload.push(this._usesProtocolV2 ? 0x00 : 0x01);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'equalizer');
    }

    _parseEqualizer(payload) {
        this._log.info(`_parseEqualizer: payload.length =  ${payload.length}`);
        if (payload.length < 9)
            return;

        const presetCode = payload[2];
        if (!Object.values(EqualizerPreset).includes(presetCode))
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

        this._log.info(`Equalizer Custom Bands: ${customBands}`);

        this._callbacks?.updateEqualizer?.(presetCode, customBands);
    }

    setEqualizerPreset(presetCode) {
        this._log.info(`setEqualizerPreset: presetCode=${presetCode}`);

        if (!Object.values(EqualizerPreset).includes(presetCode))
            return;

        const payload = [PayloadType.EQUALIZER_SET];
        payload.push(this._usesProtocolV2 ? 0x00 : 0x01);
        payload.push(presetCode);
        payload.push(0x00);

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    setEqualizerCustomBands(customBands) {
        this._log.info(`setEqualizerCustomBands: customBands=${customBands}`);

        const payload = [PayloadType.EQUALIZER_SET];
        payload.push(this._usesProtocolV2 ? 0x00 : 0x01);
        payload.push(this._usesProtocolV2 ? 0xa0 : 0xFF);
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
        this._log.info('_getListeningMode:');

        const payloadNonBgm = [PayloadType.AUDIO_PARAM_GET, 0x04];
        this._addMessageQueue(MessageType.COMMAND_1, payloadNonBgm, 'listeningModeNonBgm');

        const payloadBgm = [PayloadType.AUDIO_PARAM_GET, 0x03];
        this._addMessageQueue(MessageType.COMMAND_1, payloadBgm, 'listeningModeBgm');
    }

    _parseListeningModeBgm(payload) {
        this._log.info(`_parseListeningModeBgm: payload.length = ${payload.length}`);

        const bgmActive = payload[2] === 0x00;
        const bgmDistanceMode = payload[3];

        if (!Object.values(BgmDistance).includes(bgmDistanceMode))
            return;

        this._bgmProps.active = bgmActive;
        this._bgmProps.distance = bgmDistanceMode;

        this._callbacks?.updateListeningBgmMode?.(this._bgmProps);
    }

    _parseListeningModeNonBgm(payload) {
        this._log.info(`_parseListeningModeNonBgm: payload.length = ${payload.length}`);

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
            const payload = [PayloadType.AUDIO_PARAM_SET];
            payload.push(0x03);
            payload.push(bgmActive ? 0x00 : 0x01);
            payload.push(distance);
            this._addMessageQueue(MessageType.COMMAND_1, payload);
        }

        if (!bgmActive) {
            const payload = [PayloadType.AUDIO_PARAM_SET];
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

        const payload = [PayloadType.VOICE_NOTIFICATIONS_GET];
        payload.push(0x01);

        if (!this._usesProtocolV2)
            payload.push(0x01);

        this._addMessageQueue(MessageType.COMMAND_2, payload, 'voiceNotifications');
    }

    _parseVoiceNotifications(payload) {
        this._log.info(`_parseVoiceNotifications: payload.length = ${payload.length}`);

        if (payload.length !== 4) {
            this._log.error(`Unexpected payload length ${payload.length}`);
            return;
        }

        let enabled = null;

        if (this._usesProtocolV2) {
            switch (payload[2]) {
                case 0x00:
                    enabled = true;
                    break;
                case 0x01:
                    enabled = false;
                    break;
                default:
                    return;
            }
        } else {
            switch (payload[3]) {
                case 0x00:
                    enabled = false;
                    break;
                case 0x01:
                    enabled = true;
                    break;
                default:
                    return;
            }
        }

        this._voiceNotificationsEnabled = enabled;
        this._log.info(`Voice Notifications: ${enabled}`);

        this._callbacks?.updateVoiceNotifications?.(enabled);
    }

    setVoiceNotifications(enabled) {
        this._log.info(`_setVoiceNotifications: ${enabled}`);

        const payload = [PayloadType.VOICE_NOTIFICATIONS_SET];

        payload.push(0x01);
        if (this._usesProtocolV2) {
            payload.push(enabled ? 0x00 : 0x01);
        } else {
            payload.push(0x01);
            payload.push(enabled ? 0x01 : 0x00);
        }

        this._addMessageQueue(MessageType.COMMAND_2, payload);
    }
    // ///////////

    _getAudioUpsampling() {
        this._log.info('_getAudioUpsampling:');

        const payload = [PayloadType.AUDIO_PARAM_GET];
        payload.push(this._usesProtocolV2 ? 0x01 : 0x02);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'audioSampling');
    }

    _parseAudioUpsampling(payload) {
        this._log.info(`_parseAudioUpsampling: payload.length = ${payload.length}`);

        if (!this._usesProtocolV2 && payload.length !== 4 ||
                this._usesProtocolV2 && payload.length !== 3)  {
            this._log.error(`Unexpected payload length ${payload.length}`);
            return;
        }

        let enabled = null;

        const val = this._usesProtocolV2 ? payload[2] : payload[3];
        if (val !== 0x00 && val !== 0x01)
            return;

        enabled = val === 0x01;

        this._audioSamplingEnabled = enabled;
        this._log.info(`DSEE : ${enabled}`);

        this._callbacks?.updateAudioSampling?.(enabled);
    }

    setAudioUpsampling(enabled) {
        this._log.info(`setAudioUpsampling: ${enabled}`);

        const payload = [PayloadType.AUDIO_PARAM_SET];

        if (this._usesProtocolV2) {
            payload.push(0x01);
        } else {
            payload.push(0x02);
            payload.push(0x00);
        }
        payload.push(enabled ? 0x01 : 0x00);

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    // ///////
    _getPauseWhenTakenOff() {
        this._log.info('_getPauseWhenTakenOff:');

        const payload = [this._usesProtocolV2 ? PayloadType.AUTOMATIC_POWER_OFF_GET
            : PayloadType.AUTOMATIC_POWER_OFF_BUTTON_MODE_GET];
        payload.push(this._usesProtocolV2 ? 0x01 : 0x03);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'pauseWhenTakenOff');
    }

    _parsePauseWhenTakenOff(payload) {
        this._log.info(`_parsePauseWhenTakenOff: payload.length = ${payload.length}`);

        if (!this._usesProtocolV2 && payload.length !== 4 ||
                this._usesProtocolV2 && payload.length !== 3)  {
            this._log.error(`Unexpected payload length ${payload.length}`);
            return;
        }

        let enabled = null;

        const val = this._usesProtocolV2 ? payload[2] : payload[3];
        if (val !== 0x00 && val !== 0x01)
            return;

        enabled = val === 0x01;

        this._audioSamplingEnabled = enabled;
        this._log.info(`Pause when taken off : ${enabled}`);

        this._callbacks?.updatePauseWhenTakenOff?.(enabled);
    }

    setPauseWhenTakenOff(enabled) {
        this._log.info(`setPauseWhenTakenOff: ${enabled}`);

        const payload = [this._usesProtocolV2 ? PayloadType.AUTOMATIC_POWER_OFF_BUTTON_MODE_SET
            : PayloadType.AUTOMATIC_POWER_OFF_BUTTON_MODE_SET];

        if (this._usesProtocolV2) {
            payload.push(0x01);
            payload.push(enabled ? 0x00 : 0x01);
        } else {
            payload.push(0x03);
            payload.push(0x00);
            payload.push(enabled ? 0x01 : 0x00);
        }

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    // //////
    _getAutomaticPowerOff() {
        this._log.info('_getAutomaticPowerOff:');

        const payload = [this._usesProtocolV2 ? PayloadType.AUTOMATIC_POWER_OFF_GET
            : PayloadType.AUTOMATIC_POWER_OFF_BUTTON_MODE_GET];
        payload.push(this._usesProtocolV2 ? 0x05 : 0x04);

        this._addMessageQueue(MessageType.COMMAND_1, payload, 'automaticPowerOff');
    }

    _parseAutomaticPowerOff(payload) {
        this._log.info(`_parseAutomaticPowerOff: payload.length = ${payload.length}`);

        if (!this._usesProtocolV2 && payload.length !== 5 ||
        this._usesProtocolV2 && payload.length !== 4) {
            this._log.warn(`Unexpected payload length ${payload.length}`);
            return;
        }

        const byte1 = this._usesProtocolV2 ? payload[2] : payload[3];
        const byte2 = this._usesProtocolV2 ? payload[3] : payload[4];

        const mode = Object.values(AutoPowerOff).find(v =>
            v.bytes[0] === byte1 && v.bytes[1] === byte2
        );

        if (!mode)
            return;


        this._log.info(`Automatic Power Off: id=${mode.id}`);

        this._callbacks?.updateAutomaticPowerOff?.(mode.id);
    }

    setAutomaticPowerOff(id) {
        this._log.info(`setAutomaticPowerOff: id=${id}`);

        const config = Object.values(AutoPowerOff).find(v => v.id === id);
        if (!config)
            return;

        const payload = [
            this._usesProtocolV2
                ? PayloadType.AUTOMATIC_POWER_OFF_SET
                : PayloadType.AUTOMATIC_POWER_OFF_BUTTON_MODE_SET,
        ];

        payload.push(this._usesProtocolV2 ? 0x05 : 0x04);

        if (!this._usesProtocolV2)
            payload.push(0x01);

        payload.push(...config.bytes);

        this._log.info(
            `Sending AutoPowerOff payload: ${payload.map(x => x.toString(16)).join(' ')}`
        );

        this._addMessageQueue(MessageType.COMMAND_1, payload);
    }

    // //////


    processData(chunk) {
        const buf = new Uint8Array(this._frameBuf.length + chunk.length);
        buf.set(this._frameBuf, 0);
        buf.set(chunk, this._frameBuf.length);

        let frameStart = -1;
        const frames = [];
        for (let i = 0; i < buf.length; i++) {
            const b = buf[i];

            if (frameStart < 0) {
                if (b === checksum.HEADER)
                    frameStart = i;
            } else if (b === checksum.TRAILER) {
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
                    case PayloadType.INIT_REPLY:
                        this._log.info('Recieved: PayloadType.INIT_REPLY');
                        if (!this._initComplete) {
                            this._initComplete = true;
                            this.emit('ack-received', 'init');
                            this._getCurrentState();
                        }
                        break;

                    case PayloadType.BATTERY_LEVEL_REPLY:
                    case PayloadType.BATTERY_LEVEL_NOTIFY:
                    case PayloadType.BATTERY_LEVEL_REPLY_V2:
                    case PayloadType.BATTERY_LEVEL_NOTIFY_V2:
                        this.emit('ack-received', 'battery');
                        this._parseBatteryStatus(payload);
                        break;

                    case PayloadType.AMBIENT_SOUND_CONTROL_RET:
                    case PayloadType.AMBIENT_SOUND_CONTROL_NOTIFY:
                        this.emit('ack-received', 'ambientControl');
                        if (this._usesProtocolV2)
                            this._parseAmbientSoundControlV2(payload);
                        else
                            this._parseAmbientSoundControlV1(payload);
                        break;

                    case PayloadType.AUTOMATIC_POWER_OFF_BUTTON_MODE_RET:
                    case PayloadType.AUTOMATIC_POWER_OFF_BUTTON_MODE_NOTIFY:
                        this.emit('ack-received', 'speakToChatEnable');
                        if (this._usesProtocolV2 && payload[1] === 0x01 || payload[1] === 0x03)
                            this._parsePauseWhenTakenOff(payload);
                        else if (this._usesProtocolV2 && payload[1] === 0x0C || payload[1] === 0x04)
                            this._parseAutomaticPowerOff(payload);
                        else if (this._usesProtocolV2 && payload[1] === 0x0C || payload[1] === 0x05)
                            this._parseSpeakToChatEnable(payload);
                        break;

                    case PayloadType.SPEAK_TO_CHAT_CONFIG_RET:
                    case PayloadType.SPEAK_TO_CHAT_CONFIG_NOTIFY:
                        this.emit('ack-received', 'speakToChatConfig');
                        this._parseSpeakToChatConfig(payload);
                        break;

                    case PayloadType.EQUALIZER_RET:
                    case PayloadType.EQUALIZER_NOTIFY:
                        this.emit('ack-received', 'equalizer');
                        this._parseEqualizer(payload);
                        break;

                    case PayloadType.AUDIO_PARAM_RET:
                    case PayloadType.AUDIO_PARAM_NOTIFY:
                        if (payload[1] === 0x03) {
                            this.emit('ack-received', 'listeningModeBgm');
                            this._parseListeningModeBgm(payload);
                        } else if (payload[1] === 0x04) {
                            this._parseListeningModeNonBgm(payload);
                            this.emit('ack-received', 'listeningModeNonBgm');
                        } else if (payload[1] === 0x01) {
                            this._parseAudioSampling(payload);
                            this.emit('ack-received', 'audioSampling');
                        }
                        break;
                }
            }

            if (messageType === MessageType.COMMAND_2) {
                switch (payload[0]) {
                    case PayloadType.VOICE_NOTIFICATIONS_RET:
                    case PayloadType.VOICE_NOTIFICATIONS_NOTIFY:
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
        this._log.info('_getCurrentState');

        if (!this._noNoiseCancellingSupported && (this._ambientSoundControlSupported ||
                    this._ambientSoundControl2Supported || this._windNoiseReductionSupported))
            this._getAmbientSoundControl();

        if (this._speakToChatEnabledSupported)
            this._getSpeakToChatEnabled();

        const batteryType = this._usesProtocolV2 ? BatteryTypeV2 : BatteryTypeV1;

        if (this._batterySingleSupported)
            this._getBatteryRequest(batteryType.SINGLE);

        if (this._batteryDualSupported || this._batteryDual2Supported)
            this._getBatteryRequest(batteryType.DUAL);

        if (this._batteryCaseSupported)
            this._getBatteryRequest(batteryType.CASE);

        if (this._speakToChatConfigSupported)
            this._getSpeakToChatConfig();

        if (this._equalizerSixBands || this._equalizerTenBands)
            this._getEqualizer();

        if (this._voiceNotifications)
            this._getVoiceNotifications();

        if (this._listeningMode)
            this._getListeningMode();
    }

    postConnectInitialization() {
        this.ackSignalId =
            this.connect('ack-received', this._onAcknowledgeReceived.bind(this));
        this._getInitRequest();
    }

    destroy() {
        this._seq = 0;
        if (this._ackTimeoutId)
            GLib.source_remove(this._ackTimeoutId);
        this._ackTimeoutId = null;

        if (this.ackSignalId)
            this.disconnect(this.ackSignalId);
        this.ackSignalId = null;

        super.destroy();
    }
});

