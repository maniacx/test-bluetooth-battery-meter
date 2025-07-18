'use strict';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {createLogger} from './logger.js';
import {SocketHandler} from './socketByProfile.js';
import {
    checksum, MessageType, PayloadType, BatteryTypeV1, BatteryTypeV2, AmbientSoundMode,
    Speak2ChatSensitivity, Speak2ChatTimeout, PlaybackStatus
} from './sonyConfig.js';

export const SonySocket = GObject.registerClass({
    Signals: {'response-received': {param_types: [GObject.TYPE_STRING]}},
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
        this._windNoiseReductionSupported = modelData.windNoiseReduction ?? false;

        this._speakToChatEnabledSupported = modelData.speakToChatEnabled ?? false;
        this._speakToChatConfigSupported = modelData.speakToChatConfig ?? false;
        this._speakToChatFocusOnVoiceSupported = modelData.speakToChatFocusOnVoice ?? false;

        this._pauseWhenTakenOffSupported = modelData.pauseWhenTakenOff ?? false;
        this.startSocket(fd);
    }

    _addMessageQueue(type, msg, payload) {
        this._messageQueue.push({type, msg, payload});

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

        this._retriesLeft = this._initComplete ? 0 : 3;

        this._sendWithRetry();
    }

    _sendWithRetry() {
        if (!this._currentMessage)
            return;
        this._log.info(`Sending message type: ${this._currentMessage.type}`);
        this._encodeSonyMessage(this._currentMessage.msg, this._currentMessage.payload);
        this._awaitingAck = true;

        if (this._ackTimeoutId) {
            GLib.source_remove(this._ackTimeoutId);
            this._ackTimeoutId = null;
        }

        this._ackTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1250, () => {
            if (this._retriesLeft > 0) {
                this._log.info(`ACK not received, retrying... (${this._retriesLeft})`);
                this._retriesLeft--;
                this._encodeSonyMessage(this._currentMessage.msg, this._currentMessage.payload);
                return GLib.SOURCE_CONTINUE;
            } else {
                this._log.error('ACK not received after retries. Giving up.');
                this._popFailedMessage();
                this._ackTimeoutId = null;
                if (!this._initComplete)
                    this.destroy();
                return GLib.SOURCE_REMOVE;
            }
        });
    }

    _popFailedMessage() {
        this._awaitingAck = false;

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

    _onAcknowledgeReceived(_, type) {
        this._log.info(`_onAcknowledgeReceived: ${type}`);
        if (!this._awaitingAck)
            return;

        if (!this._initComplete) {
            this._initComplete = true;
            this._getCurrentState();
        } else if (this._currentMessage.type !== type || type === 'ack') {
            return;
        }

        this._awaitingAck = false;

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
        if (seq !== undefined)
            sequence = seq;
        else
            sequence = this._seq;


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

    _encodeAck(seq) {
        return this._encodeSonyMessage(MessageType.ACK, [], 1 - seq);
    }

    _getInitRequest() {
        this._log.info('_getInitRequest:');
        this._addMessageQueue('ack', MessageType.COMMAND_1, [PayloadType.INIT_REQUEST]);
    }

    _getBatteryRequest(batteryType) {
        this._log.info('_getBatteryRequest:');
        const payloadType = this._usesProtocolV2 ? PayloadType.BATTERY_LEVEL_REQUEST_V2
            : PayloadType.BATTERY_LEVEL_REQUEST;

        this._addMessageQueue('batt', MessageType.COMMAND_1, [payloadType, batteryType]);
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

        this._addMessageQueue('anc', MessageType.COMMAND_1,
            [PayloadType.AMBIENT_SOUND_CONTROL_GET, code]);
    }

    _getSpeakToChatEnabled() {
        this._log.info('_getSpeakToChatEnabled:');
        const byte = this._usesProtocolV2 ? 0x0c : 0x05;
        this._addMessageQueue('speak2chatEnable', MessageType.COMMAND_1,
            [PayloadType.AUTOMATIC_POWER_OFF_BUTTON_MODE_GET, byte]);
    }

    _getSpeakToChatConfig() {
        this._log.info('_getSpeakToChatConfig:');
        const byte = this._usesProtocolV2 ? 0x0c : 0x05;
        this._addMessageQueue('speak2chatConfig', MessageType.COMMAND_1,
            [PayloadType.SPEAK_TO_CHAT_CONFIG_GET, byte]);
    }

    _parseBatteryStatus(payload) {
        this._log.info(`_parseBatteryStatus payload.length = ${payload.length}`);
        if (payload.length < 4)
            return;

        /*
        this._log.info(`_parseBatteryStatus payload[1] = [${payload[1]}]`);
        this._log.info(`_parseBatteryStatus payload[2] = [${payload[2]}]`);
        this._log.info(`_parseBatteryStatus payload[3] = [${payload[3]}]`);
*/
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
        //        this._log.info(`_parseAmbientAttenuationLevel: ${byte}`);
        return byte >= 0 && byte <= 20 ? byte : 10;
    }

    _parseAmbientSoundControlV1(payload) {
        this._log.info(`_parseAmbientSoundControlV1 payload.length = ${payload.length}`);

        if (payload.length !== 8)
            return;
        /*
        this._log.info(`_parseAmbientSoundControlV1 payload[2] = [${payload[2]}]`);
        this._log.info(`_parseAmbientSoundControlV1 payload[4] = [${payload[4]}]`);
        this._log.info(`_parseAmbientSoundControlV1 payload[5] = [${payload[5]}]`);
*/

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

        let ancmode;
        if (mode === AmbientSoundMode.ANC_OFF)
            ancmode = 'ANC-OFF';
        else if (mode === AmbientSoundMode.ANC_ON)
            ancmode = 'ANC-ON';
        else if (mode === AmbientSoundMode.WIND)
            ancmode = 'WIND';
        else if (mode === AmbientSoundMode.AMBIENT)
            ancmode = 'AMBIENT';

        this._log.info(`ANC mode = [${ancmode}]`);
        this._log.info(`Ambient level = [${this._ambientSoundLevel}]`);
        this._log.info(`Focus on Voice = [${this._focusOnVoiceState}]`);

        if (this._callbacks?.updateAmbientSoundControl) {
            this._callbacks.updateAmbientSoundControl(
                mode, this._focusOnVoiceState, this._ambientSoundLevel);
        }
    }

    _parseAmbientSoundControlV2(payload) {
        this._log.info(`_parseAmbientSoundControlV2 payload.lenght = [${payload.length}]`);
        if (payload.length < 6 || payload.length > 8)
            return;
        /*
        this._log.info(`_parseAmbientSoundControlV2 payload[1] = [${payload[1]}]`);
        this._log.info(`_parseAmbientSoundControlV2 payload[4] = [${payload[4]}]`);
        this._log.info(`_parseAmbientSoundControlV2 payload[5] = [${payload[5]}]`);
        this._log.info('_parseAmbientSoundControlV2 payload[payload.length - 2]' +
            ` = [${payload[payload.length - 2]}]`);
*/
        const idx = payload[1];

        if (idx !== 0x15 && idx !== 0x17 && idx !== 0x22)
            return;

        const includesWind = idx === 0x17 && payload.length > 7;
        const noNc = idx === 0x22;


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

        let ancmode;
        if (mode === AmbientSoundMode.ANC_OFF)
            ancmode = 'ANC-OFF';
        else if (mode === AmbientSoundMode.ANC_ON)
            ancmode = 'ANC-ON';
        else if (mode === AmbientSoundMode.WIND)
            ancmode = 'WIND';
        else if (mode === AmbientSoundMode.AMBIENT)
            ancmode = 'AMBIENT';

        this._log.info(`ANC mode = [${ancmode}]`);
        this._log.info(`Ambient level = [${this._ambientSoundLevel}]`);
        this._log.info(`Focus on Voice = [${this._focusOnVoiceState}]`);

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
        this._log.info(`_parseSpeakToChatEnable payload[2] = [${payload[2]}]`);
        this._log.info(`_parseSpeakToChatEnable payload[3] = [${payload[3]}]`);

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
        this._log.info(`SpeakChatSensitivity sensCode payload[3] = [${sensCode}]`);
        if (!Object.values(Speak2ChatSensitivity).includes(sensCode))
            return;
        this._speak2ChatSensitivity = sensCode;

        this._log.info(`SpeakChatSensitivity _focusOnVoiceState payload[4] = [${payload[4]}]`);
        if (payload[4] !== 0x00 && payload[4] !== 0x01)
            return;
        this._focusOnVoiceState = payload[4] === 0x01;

        const timeoutCode = payload[5];
        this._log.info(`SpeakChatSensitivity timeoutCode payload[5] = [${timeoutCode}]`);
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
        this._log.info(`Speak2ChatSensitivity sensCode payload[2] = [${sensCode}]`);

        if (!Object.values(Speak2ChatSensitivity).includes(sensCode))
            return;
        this._speak2ChatSensitivity = sensCode;

        const timeoutCode = payload[3];
        this._log.info(`Speak2ChatSensitivity timeoutCode payload[3] = [${timeoutCode}]`);
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
        const code = payload[3];
        this._log.info(`_parsePlayBackState payload[3] = [${code}]`);
        let state = null;

        if (code === PlaybackStatus.PLAY)
            state = 'play';
        else if (code === PlaybackStatus.PAUSE)
            state = 'pause';
        else
            return;

        this._log.info(`_parsePlayBackState: ${state}`);

        if (this._callbacks?.updatePlaybackState)
            this._callbacks.updatePlaybackState(state);
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
            this._seq = sequence;

            if (messageType === MessageType.ACK) {
                this.emit('response-received', 'ack');
                return;
            }

            if (messageType === MessageType.COMMAND_1 || messageType === MessageType.COMMAND_2)
                this._encodeAck(sequence);

            if (messageType === MessageType.COMMAND_1) {
                switch (payload[0]) {
                    case PayloadType.INIT_REPLY:
                        this.emit('response-received', 'init');
                        break;
                    case PayloadType.BATTERY_LEVEL_REPLY:
                    case PayloadType.BATTERY_LEVEL_NOTIFY:
                    case PayloadType.BATTERY_LEVEL_REPLY_V2:
                    case PayloadType.BATTERY_LEVEL_NOTIFY_V2:
                        this._parseBatteryStatus(payload);
                        this.emit('response-received', 'batt');
                        break;
                    case PayloadType.AMBIENT_SOUND_CONTROL_RET:
                    case PayloadType.AMBIENT_SOUND_CONTROL_NOTIFY:
                        if (this._usesProtocolV2)
                            this._parseAmbientSoundControlV2(payload);
                        else
                            this._parseAmbientSoundControlV1(payload);
                        this.emit('response-received', 'anc');
                        break;
                    case PayloadType.AUTOMATIC_POWER_OFF_BUTTON_MODE_RET:
                    case PayloadType.AUTOMATIC_POWER_OFF_BUTTON_MODE_NOTIFY:
                        if (this._usesProtocolV2 && payload[1] === 0x0C || payload[1] === 0x05) {
                            this._parseSpeakToChatEnable(payload);
                            this.emit('response-received', 'speak2chatEnable');
                        } else if (this._usesProtocolV2 && payload[1] === 0x01 ||
                            payload[1] === 0x03) {
                            this._parsePlayBackState(payload);
                            this.emit('response-received', 'pausePlay');
                        }
                        break;
                    case PayloadType.SPEAK_TO_CHAT_CONFIG_RET:
                    case PayloadType.SPEAK_TO_CHAT_CONFIG_NOTIFY:
                        if (this._usesProtocolV2)
                            this._parseSpeakToChatConfigV2(payload);
                        else
                            this._parseSpeakToChatConfigV1(payload);
                        this.emit('response-received', 'speak2chatConfig');
                        break;
                    case PayloadType.PLAYBACK_STATUS_RET:
                    case PayloadType.PLAYBACK_STATUS_NOTIFY:
                        if (this._usesProtocolV2) {
                            this._parsePlayBackState(payload);
                            this.emit('response-received', 'pausePlay');
                        }
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
        this._log.info(
            `_setAmbientSoundControlV1: mode: ${mode} focusOnVoice: ${focusOnVoice} ` +
                `level: ${level}`);
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
        this._addMessageQueue('ack', MessageType.COMMAND_1, buf);
    }

    _setAmbientSoundControlV2(mode, focusOnVoice, level) {
        this._log.info(
            `_setAmbientSoundControlV2: mode: ${mode} focusOnVoice: ${focusOnVoice} ` +
                `level: ${level}`);
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

        this._addMessageQueue('ack', MessageType.COMMAND_1, buf);
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

        this._addMessageQueue('ack', MessageType.COMMAND_1, payload);
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

        this._addMessageQueue('ack', MessageType.COMMAND_1, payload);
    }

    _getCurrentState() {
        this._log.info('_getCurrentState');

        const batteryType = this._usesProtocolV2 ? BatteryTypeV2 : BatteryTypeV1;

        if (this._batterySingleSupported)
            this._getBatteryRequest(batteryType.SINGLE);

        if (this._batteryDualSupported || this._batteryDual2Supported)
            this._getBatteryRequest(batteryType.DUAL);

        if (!this._noNoiseCancellingSupported && (this._ambientSoundControlSupported ||
                    this._ambientSoundControl2Supported || this._windNoiseReductionSupported))
            this._getAmbientSoundControl();

        if (this._speakToChatEnabledSupported)
            this._getSpeakToChatEnabled();

        if (this._speakToChatConfigSupported)
            this._getSpeakToChatConfig();

        if (this._batteryCaseSupported)
            this._getBatteryRequest(batteryType.CASE);
    }

    postConnectInitialization() {
        this.ackSignalId =
            this.connect('response-received', this._onAcknowledgeReceived.bind(this));
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

