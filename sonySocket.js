'use strict';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {createLogger} from './logger.js';
import {SocketHandler} from './socketByProfile.js';
import {
    checksum, MessageType, PayloadType, BatteryTypeV1, BatteryTypeV2, AmbientSoundMode,
    Speak2ChatSensitivity, Speak2ChatTimeout, PlaybackStatus
} from './sonyConfig.js';

export const SonySocket = GObject.registerClass(
class SonySocket extends SocketHandler {
    _init(devicePath, fd, modelData, usesProtocolV2, callbacks) {
        super._init(devicePath, fd);
        this._log = createLogger('SonySocket');
        this._log.info(`SonySocket init with fd: ${fd}`);
        this._initRetries = 0;
        this._hasInitReply = false;
        this._featureInitComplete = false;
        this._seq = 0;
        this._usesProtocolV2 = usesProtocolV2;
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

        this._pauseWhenTakenOffSupported = modelData.pauseWhenTakenOff ?? false;

        this.startSocket(fd);
    }

    _encodeSonyMessage(messageType, sequence, payloadArr) {
        const len = payloadArr.length;
        const headerBuf = new Uint8Array(6 + len);
        headerBuf[0] = messageType;
        headerBuf[1] = sequence;
        headerBuf[2] = len >>> 24 & 0xff;
        headerBuf[3] = len >>> 16 & 0xff;
        headerBuf[4] = len >>>  8 & 0xff;
        headerBuf[5] = len & 0xff;
        headerBuf.set(payloadArr, 6);

        const chksum = this._calcChecksum(headerBuf);
        const bodyEsc = this._escapeBytes(headerBuf);
        const chkEsc  = this._escapeBytes(new Uint8Array([chksum]));
        return Uint8Array.from([checksum.HEADER, ...bodyEsc, ...chkEsc, checksum.TRAILER]);
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
            sum = sum + b & 0xff;
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

    _encodeAck(recvSeq) {
        const ackSeq = 1 - (recvSeq & 0xff);
        return this._encodeSonyMessage(MessageType.ACK, ackSeq, []);
    }

    _getInitRequest() {
        this._log.info('_getInitRequest:');
        return this._encodeSonyMessage(
            MessageType.COMMAND_1, this._seq++, [PayloadType.INIT_REQUEST]);
    }

    _getBatteryRequest(batteryTypeV1) {
        this._log.info('_getBatteryRequest:');
        const payloadType = this._usesProtocolV2 ? PayloadType.BATTERY_LEVEL_REQUEST_V2
            : PayloadType.BATTERY_LEVEL_REQUEST;

        return this._encodeSonyMessage(
            MessageType.COMMAND_1, this._seq++, [payloadType, batteryTypeV1]);
    }


    _getAmbientSoundControl() {
        this._log.info('_getAmbientSoundControl:');
        let code;
        if (this._usesProtocolV2) {
            code = this._windNoiseReductionSupported || this._ambientSoundControl2Supported
                ? 0x17 : 0x15;
        } else {
            code = 0x02;
        }

        return this._encodeSonyMessage(
            MessageType.COMMAND_1,
            this._seq++,
            [PayloadType.AMBIENT_SOUND_CONTROL_GET, code]
        );
    }

    _getSpeakToChatEnabled() {
        this._log.info('_getSpeakToChatEnabled:');
        const byte = this._usesProtocolV2 ? 0x0c : 0x05;
        return this._encodeSonyMessage(MessageType.COMMAND_1, this._seq++,
            [PayloadType.AUTOMATIC_POWER_OFF_BUTTON_MODE_GET, byte]);
    }

    _parseBatteryStatus(payload) {
        this._log.info('_parseBatteryStatus:');
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

        if (this._callbacks?.updateBatteryProps)
            this._callbacks.updateBatteryProps(props);
    }

    _parseAmbientAttenuationLevel(byte) {
        this._log.info(`_parseAmbientAttenuationLevel: ${byte}`);
        return byte >= 0 && byte <= 20 ? byte : 10;
    }

    _parseAmbientSoundControlV1(payload) {
        this._log.info('_parseAmbientSoundControlV1');
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

        this._focusOnVoiceState = payload[6] === 0x01;

        const level = payload[7];
        this._ambientSoundLevel = this._parseAmbientAttenuationLevel(level);

        if (this._callbacks?.updateAmbientSoundControl) {
            this._callbacks.updateAmbientSoundControl(
                mode, this._focusOnVoiceState, this._ambientSoundLevel);
        }
    }

    _parseAmbientSoundControlV2(payload) {
        this._log.info('_parseAmbientSoundControlV2');
        if (payload.length < 6 || payload.length > 8)
            return;

        const idx = payload[1];
        if (idx !== 0x15 && idx !== 0x17 && idx !== 0x22)
            return;

        const includesWind = idx === 0x17 && payload.length > 7;
        const noNc          = idx === 0x22;


        let mode = null;
        if (payload[3] === 0x00) {
            mode = AmbientSoundMode.ANC_OFF;
            this._focusOnVoiceState = false;
            this._ambientSoundLevel = 10;
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

            let i = payload.length - 2;
            this._focusOnVoiceState = payload[i] === 0x01;

            i++;
            const level = payload[i];
            this._ambientSoundLevel = this._parseAmbientAttenuationLevel(level);
        }

        if (this._callbacks?.updateAmbientSoundControl) {
            this._callbacks.updateAmbientSoundControl(
                mode, this._focusOnVoiceState, this._ambientSoundLevel);
        }
    }

    _parseSpeakToChatEnable(payload) {
        this._log.info('_parseSpeakToChatEnable');

        if (payload.length !== 4)
            return;

        let enabled = null;

        if (this._usesProtocolV2) {
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
                enabled = Boolean(val);
            else
                return;
        }

        this._log.debug(`Speak to chat enabled: ${enabled}`);

        if (this._callbacks?.updateSpeakToChatEnable)
            this._callbacks.updateSpeakToChatEnable(enabled);
    }


    _parseSpeakToChatConfigV1(payload) {
        this._log.info('_parseSpeakToChatConfigV1');

        if (payload.length !== 6 || payload[1] !== 0x05)
            return;

        const sensCode = payload[3];
        if (!Object.values(Speak2ChatSensitivity).includes(sensCode))
            return;
        this._speak2ChatSensitivity = sensCode;

        if (payload[4] !== 0x00 && payload[4] !== 0x01)
            return;
        this._focusOnVoiceState = payload[4] === 0x01;

        const timeoutCode = payload[5];
        if (!Object.values(Speak2ChatTimeout).includes(timeoutCode))
            return;
        this._speak2ChatTimeout = timeoutCode;

        this._callbacks?.updateSpeakToChatConfig?.(
            this._speak2ChatSensitivity,
            this._focusOnVoiceState,
            this._speak2ChatTimeout
        );
    }

    _parseSpeakToChatConfigV2(payload) {
        this._log.info('_parseSpeakToChatConfigV2');

        if (payload.length !== 4 || payload[1] !== 0x0c)
            return;

        const sensCode = payload[2];
        if (!Object.values(Speak2ChatSensitivity).includes(sensCode))
            return;
        this._speak2ChatSensitivity = sensCode;

        const timeoutCode = payload[3];
        if (!Object.values(Speak2ChatTimeout).includes(timeoutCode))
            return;
        this._speak2ChatTimeout = timeoutCode;

        this._focusOnVoiceState = false;

        this._callbacks?.updateSpeakToChatConfig?.(
            this._speak2ChatSensitivity,
            this._focusOnVoiceState,
            this._speak2ChatTimeout
        );
    }


    _parsePlayBackState(payload) {
        const state = payload[3];
        this._log.info(`_parsePlayBackState: state: ${state}`);

        if (!Object.values(PlaybackStatus).includes(state))
            return;

        if (this._callbacks?.updatePlaybackState)
            this._callbacks.updatePlaybackState(state);
    }

    processData(rawData) {
        try {
            const data = this._decodeSonyMessage(rawData);
            if (!data)
                return;
            const {messageType, sequence, payload} = data;

            if (!this._featureInitComplete && messageType === MessageType.ACK) {
                if (sequence !== this._seq) {
                    this._log.info('Emitted: ack‑received');
                    this.emit('ack‑received');
                }
                return;
            }

            if (messageType === MessageType.COMMAND_1)
                this.sendMessage(this._encodeAck(sequence));

            if (messageType === MessageType.COMMAND_1) {
                switch (payload[0]) {
                    case PayloadType.INIT_REPLY:
                        this._hasInitReply = true;
                        if (this._retryTimeoutId)
                            GLib.source_remove(this._retryTimeoutId);
                        this._retryTimeoutId = null;
                        this._getCurrentState();
                        break;
                    case PayloadType.BATTERY_LEVEL_REPLY:
                    case PayloadType.BATTERY_LEVEL_NOTIFY:
                        this._parseBatteryStatus(payload);
                        break;
                    case PayloadType.AMBIENT_SOUND_CONTROL_RET:
                    case PayloadType.AMBIENT_SOUND_CONTROL_NOTIFY:
                        if (this._usesProtocolV2)
                            this._parseAmbientSoundControlV2(payload);
                        else
                            this._parseAmbientSoundControlV1(payload);
                        break;
                    case PayloadType.AUTOMATIC_POWER_OFF_BUTTON_MODE_RET:
                    case PayloadType.AUTOMATIC_POWER_OFF_BUTTON_MODE_NOTIFY:
                        if (this._usesProtocolV2 && payload[1] === 0x0C || payload[1] === 0x05)
                            this._parseSpeakToChatEnable(payload);
                        break;
                    case PayloadType.SPEAK_TO_CHAT_CONFIG_RET:
                    case PayloadType.SPEAK_TO_CHAT_CONFIG_NOTIFY:
                        if (this._usesProtocolV2)
                            this._parseSpeakToChatConfigV2(payload);
                        else
                            this._parseSpeakToChatConfigV1(payload);
                        break;
                    case PayloadType.PLAYBACK_STATUS_RET:
                    case PayloadType.PLAYBACK_STATUS_NOTIFY:
                        this._parsePlayBackState(payload);
                        break;
                }
            }
        } catch (e) {
            this._log.error('Failed to process socket data', e);
        }
    }

    setAmbientSoundControl(mode, focusOnVoice, level) {
        if (this._usesProtocolV2)
            this._setAmbientSoundControlV2(mode, focusOnVoice, level);
        else
            this._setAmbientSoundControlV1(mode, focusOnVoice, level);
    }

    _setAmbientSoundControlV1(mode, focusOnVoice, level) {
        this._log.info(`_setAmbientSoundControlV1: mode: ${mode} focusOnVoice: ${focusOnVoice} level: ${level}`);
        const buf = [PayloadType.AMBIENT_SOUND_CONTROL_SET, 0x02];

        const modeIsOff = mode === AmbientSoundMode.ANC_OFF; ;
        const modeIsNC = mode === AmbientSoundMode.ANC_ON;
        const modeIsWNR = mode === AmbientSoundMode.WIND;
        const modeIsAmbient = mode === AmbientSoundMode.AMBIENT;

        buf.push(modeIsOff ? 0x00 : 0x11);
        buf.push(this._windNoiseReductionSupported ? 0x02 : 0x00);

        let modeCode = 0x00;
        if (this._windNoiseReductionSupported) {
            if (modeIsNC)
                modeCode = 0x02;
            else if (modeIsWNR)
                modeCode = 0x01;
        } else {
            modeCode = modeIsNC ? 0x01 : 0x00;
        }

        buf.push(modeCode);
        buf.push(0x01);
        buf.push(this._focusOnVoiceState ? 0x01 : 0x00);

        const attlevel = modeIsOff || modeIsAmbient
            ? this._parseAmbientAttenuationLevel(level)
            : 0x00;

        buf.push(attlevel);
        return this._encodeSonyMessage(MessageType.COMMAND_1, this._seq++, buf);
    }

    _setAmbientSoundControlV2(mode, focusOnVoice, level) {
        const featureIdx = this._windNoiseReductionSupported ||
                        this._ambientSoundControl2Supported
            ? 0x17
            : 0x15;

        const buf = [
            PayloadType.AMBIENT_SOUND_CONTROL_SET,
            featureIdx,
            0x01,
            mode === AmbientSoundMode.ANC_OFF ? 0x00 : 0x01,
            mode === AmbientSoundMode.AMBIENT ? 0x01 : 0x00,
        ];

        if (this._windNoiseReductionSupported)
            buf.push(mode === AmbientSoundMode.WIND ? 0x03 : 0x02);


        buf.push(this._focusOnVoiceState ? 0x01 : 0x00,
            this._parseAmbientAttenuationLevel(level)
        );

        return this._encodeSonyMessage(MessageType.COMMAND_1, this._seq++, buf);
    }


    setSpeakToChatEnabled(enabled) {
        this._log.info(`setSpeakToChatEnabled: ${enabled}`);
        const subCommand = this._usesProtocolV2 ? 0x0c : 0x05;
        const payload = [PayloadType.AUTOMATIC_POWER_OFF_BUTTON_MODE_SET, subCommand];

        if (this._usesProtocolV2) {
            payload.push(enabled ? 0x00 : 0x01);
            payload.push(0x01);
        } else {
            payload.push(0x01);
            payload.push(enabled ? 0x01 : 0x00);
        }

        return this._encodeSonyMessage(MessageType.COMMAND_1, this._seq++, payload);
    }


    setSpeakToChatConfig(sensitivity, timeout) {
        this._log.info(`setSpeakToChatConfig: sensitivity=${sensitivity}, timeout=${timeout}`);
        const subCommand = this._usesProtocolV2 ? 0x0c : 0x05;
        const payload = [PayloadType.SPEAK_TO_CHAT_CONFIG_SET, subCommand];

        if (this._usesProtocolV2) {
            payload.push(sensitivity & 0xff);
            payload.push(timeout & 0xff);
        } else {
            payload.push(0x00);
            payload.push(sensitivity & 0xff);
            payload.push(this._focusOnVoiceState ? 0x01 : 0x00);
            payload.push(timeout & 0xff);
        }

        return this._encodeSonyMessage(
            MessageType.COMMAND_1,
            this._seq++,
            payload
        );
    }


    async sendAndWait(packet) {
        this._encodeSonyMessage(MessageType.COMMAND_1, this._seq++, packet);

        if (this._ackSignal)
            this.disconnect(this._ackSignal);
        this._ackSignal = null;

        if (this._ackTimeout)
            GLib.source_remove(this._ackTimeout);
        this._ackTimeout = null;

        await new Promise(resolve => {
            this._ackSignal = this.connect('ack‑received', () => {
                if (this._ackSignal)
                    this.disconnect(this._ackSignal);
                this._ackSignal = null;

                if (this._ackTimeout)
                    GLib.source_remove(this._ackTimeout);
                this._ackTimeout = null;

                resolve();
            });

            this._ackTimeout = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT, 1000,
                () => {
                    this.disconnect(this._ackSignal);
                    this._ackSignal = null;
                    this._ackTimeout = null;

                    resolve();
                    return GLib.SOURCE_REMOVE;
                }
            );
        });
    }

    async _getCurrentState() {
        if (this._featureInitComplete)
            return;

        const batteryType = this._usesProtocolV2 ? BatteryTypeV2 : BatteryTypeV1;
        this._log.info(`UsesProtocolV2: ${this._usesProtocolV2}`);

        if (this._batterySingleSupported)
            await this.sendMessage(this._getBatteryRequest(batteryType.SINGLE));

        if (this._batteryDualSupported || this._batteryDual2Supported)
            await this.sendMessage(this._getBatteryRequest(batteryType.DUAL));

        if (this._batteryCaseSupported)
            await this.sendMessage(this._getBatteryRequest(batteryType.CASE));

        if (!this._noNoiseCancellingSupported && (this._ambientSoundControlSupported ||
            this._ambientSoundControl2Supported || this._windNoiseReductionSupported))
            await this.sendMessage(this._getAmbientSoundControl());

        if (this._speakToChatEnabledSupported)
            await this.sendMessage(this._getSpeakToChatEnabled());
    }


    _retryInitRequest() {
        this._log.info(`HasInitReply: ${this._hasInitReply}`);
        if (this._hasInitReply)
            return;

        if (this._initRetries++ < 3) {
            this._log.info(`Retrying init (#${this._initRetries})`);
            this.sendMessage(this._getInitRequest());

            if (this._retryTimeoutId)
                GLib.source_remove(this._retryTimeoutId);

            this._retryTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1250, () => {
                this._retryInitRequest();
                this._retryTimeoutId = null;
                return GLib.SOURCE_REMOVE;
            });
        } else {
            this._log.error('Failed to complete init after 3 attempts');
            this.destroy();
        }
    }


    postConnectInitialization() {
        this._retryInitRequest();
    }

    destroy() {
        if (this._retryTimeoutId)
            GLib.source_remove(this._retryTimeoutId);
        this._retryTimeoutId = null;

        if (this._ackSignal)
            this.disconnect(this._ackSignal);
        this._ackSignal = null;

        if (this._ackTimeout)
            GLib.source_remove(this._ackTimeout);
        this._ackTimeout = null;

        super.destroy();
    }
});

