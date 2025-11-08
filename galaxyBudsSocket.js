import GObject from 'gi://GObject';

import {createLogger} from './logger.js';
import {SocketHandler} from './socketByProfile.js';
import {
    crc16Tab,
    GalaxyBudsMsgIds,
    LegacyMsgIds,
    GalaxyBudsMsgTypes,
    GalaxyBudsAnc,
    GalaxyBudsEarDetectionState,
    GalaxyBudsLegacyEarDetectionState,
    booleanFromByte,
    isValidByte
} from './galaxyBudsConfig.js';

export const GalaxyBudsSocket = GObject.registerClass(
class GalaxyBudsSocket extends SocketHandler {
    _init(devicePath, fd, modelData, callbacks) {
        super._init(devicePath, fd);
        this._log = createLogger('GalaxyBudsSocket');
        this._log.info('GalaxyBudsSocket init');
        this._modelData = modelData;
        this._isLegacy = this._modelData.legacy;

        const SOM_BUDS = 0xFE;
        const EOM_BUDS = 0xEE;
        const SOM_BUDS_PLUS = 0xFD;
        const EOM_BUDS_PLUS = 0xDD;

        this._startOfMessage = this._isLegacy ? SOM_BUDS : SOM_BUDS_PLUS;
        this._endOfMessage = this._isLegacy ? EOM_BUDS : EOM_BUDS_PLUS;
        this._callbacks = callbacks;

        if (globalThis.TESTDEVICE)
            this.startTestSocket();
        else
            this.startSocket(fd);
    }

    _checksum(data) {
        let crc = 0;
        for (const b of data)
            crc = (crc16Tab[(crc >> 8 ^ b) & 0xFF] ^ crc << 8) & 0xFFFF;

        return crc;
    }

    _checksumMsg(msgId, payload) {
        const data = [msgId, ...payload];
        const crc = this._checksum(data);
        return [crc & 0xFF, crc >> 8];
    }

    extract(buffer) {
        if (buffer.length < 6) {
            this._log.error(`buffer length too short: ${buffer.length}`);
            return null;
        }

        if (buffer[0] !== this._startOfMessage ||
            buffer[buffer.length - 1] !== this._endOfMessage) {
            const som = buffer[0].toString(16);
            const eom = buffer[buffer.length - 1].toString(16);
            const expectedSom = this._startOfMessage.toString(16);
            const expectedEom = this._endOfMessage.toString(16);
            this._log.error(
                `SOM/EOM mismatch: got ${som}/${eom}, expected ${expectedSom}/${expectedEom}`
            );
            return null;
        }


        let type, size;
        if (this._isLegacy) {
            type = buffer[1];
            size = buffer[2];
        } else {
            const header = buffer[2] << 8 | buffer[1];
            type = header & 0x1000 ? GalaxyBudsMsgTypes.Request : GalaxyBudsMsgTypes.Response;
            size = header & 0x3FF;
        }

        const id = buffer[3];
        const payloadSize = Math.max(size - 3, 0);
        const expectedLen = 4 + payloadSize + 2 + 1;
        if (buffer.length < expectedLen) {
            this._log.error(`buffer length too shot: ${buffer.length} < ${expectedLen}`);
            return null;
        }

        const payload = Array.from(buffer.slice(4, 4 + payloadSize));
        const crcLo = buffer[4 + payloadSize];
        const crcHi = buffer[5 + payloadSize];
        const expectedCrc = crcHi << 8 | crcLo;
        const actualCrc = this._checksum([id, ...payload]);
        if (actualCrc !== expectedCrc) {
            this._log.error('bad CRC');
            return null;
        }

        return {id, type, payload};
    }

    encode(msgId, payload = []) {
        const size = 1 + payload.length + 2;
        const buf = [this._startOfMessage];

        if (this._isLegacy) {
            buf.push(GalaxyBudsMsgTypes.Request, size);
        } else {
            const headerLo = size & 0xFF;
            const headerHi = size >> 8 & 0xFF;
            buf.push(headerLo, headerHi);
        }

        buf.push(msgId, ...payload);
        const crc = this._checksum([msgId, ...payload]);
        buf.push(crc & 0xFF, crc >> 8 & 0xFF);
        buf.push(this._endOfMessage);
        return Uint8Array.from(buf);
    }

    _sendPacket(msgId, payload = []) {
        const pkt = this.encode(msgId, payload);
        this.sendMessage(pkt);
    }

    _processBattery(resp) {
        const batCfg = this._modelData.battery;
        const id      = resp.id;
        const p       = resp.payload;
        this._log.bytes(`Process Battery (${p.length}, id=${id}):`, Array.from(p).map(
            b => b.toString(16).padStart(2, '0')).join(' '));
        let l, r, c, mask;

        if (id === GalaxyBudsMsgIds.EXTENDED_STATUS_UPDATED && batCfg.extended) {
            l    = p[batCfg.extended.l];
            r    = p[batCfg.extended.r];
            c    = p[batCfg.extended.c] ?? 255;
            mask = p[batCfg.extChargeOffset] & batCfg.extChargeMask;
        } else if (id === GalaxyBudsMsgIds.STATUS_UPDATED && batCfg.status) {
            l    = p[batCfg.status.l];
            r    = p[batCfg.status.r];
            c    = p[batCfg.status.c] ?? 255;
            mask = p[batCfg.statusChargeOffset] & batCfg.statusChargeMask;
        } else {
            return;
        }

        const caseLevel = c === 255 ? 0 : c;

        let leftStatus;
        if (l === 0)
            leftStatus = 'disconnected';
        else if (mask & 0b00010000)
            leftStatus = 'charging';
        else
            leftStatus = 'discharging';

        let rightStatus;
        if (r === 0)
            rightStatus = 'disconnected';
        else if (mask & 0b00000100)
            rightStatus = 'charging';
        else
            rightStatus = 'discharging';

        let caseStatus;
        if (caseLevel === 0)
            caseStatus = 'disconnected';
        else if (mask & 0b00000001)
            caseStatus = 'charging';
        else
            caseStatus = 'discharging';

        const props = {
            battery1Level: l,
            battery1Status: leftStatus,
            battery2Level: r,
            battery2Status: rightStatus,
            battery3Level: caseLevel,
            battery3Status: caseStatus,
        };

        if (caseLevel > 100) {
            // Don't update when case level > 100
            props.battery3Level = 0;
        }

        if (this._callbacks?.updateBatteryProps)
            this._callbacks.updateBatteryProps(props);
    }

    _processEar(resp) {
        const id = resp.id;
        const p = resp.payload;
        const legacy = this._modelData.earDetectionLegacy ?? false;
        let raw;

        if (id === GalaxyBudsMsgIds.EXTENDED_STATUS_UPDATED)
            raw = p[6];
        else if (id === GalaxyBudsMsgIds.STATUS_UPDATED)
            raw = p[5];
        else
            return;

        let left, right;
        if (legacy) {
            switch (raw) {
                case GalaxyBudsLegacyEarDetectionState.Both:
                    left = right = 'Wearing';
                    break;
                case GalaxyBudsLegacyEarDetectionState.L:
                    left = 'Wearing';
                    right = 'Idle';
                    break;
                case GalaxyBudsLegacyEarDetectionState.R:
                    left = 'Idle';
                    right = 'Wearing';
                    break;
                default:
                    left = right = 'Idle';
            }
        } else {
            left = Object.keys(GalaxyBudsEarDetectionState)
          .find(k => GalaxyBudsEarDetectionState[k] === raw >> 4);
            right = Object.keys(GalaxyBudsEarDetectionState)
          .find(k => GalaxyBudsEarDetectionState[k] === (raw & 0x0F));
        }

        if (this._callbacks?.updateInEarState)
            this._callbacks.updateInEarState(left, right);
    }

    _processAmbientSound(resp) {
        if (!this._modelData.ambientSound)
            return;
        const id = resp.id;
        const p = resp.payload;
        let pos = 0;
        if (id === GalaxyBudsMsgIds.EXTENDED_STATUS_UPDATED)
            pos = this._modelData.ambientSoundLegacy ? 7 : 8;

        const enabled = booleanFromByte(p[pos]);
        if (enabled === null)
            return;

        if (this._callbacks?.updateAmbientSound)
            this._callbacks.updateAmbientSound(enabled);
    }

    _processFocusOnVoice(resp) {
        if (!this._modelData.ambientVoiceFocus)
            return;
        const id = resp.id;
        const p = resp.payload;
        const pos = id === GalaxyBudsMsgIds.EXTENDED_STATUS_UPDATED ? 8 : 0;
        const enabled = booleanFromByte(p[pos]);
        if (enabled === null)
            return;

        if (this._callbacks?.updateFocusOnVoice)
            this._callbacks.updateFocusOnVoice(enabled);
    }

    _processAmbientVolume(resp) {
        if (!this._modelData.ambientSoundVolume)
            return;
        const id = resp.id;
        const p = resp.payload;
        let pos = 0;
        if (id === GalaxyBudsMsgIds.EXTENDED_STATUS_UPDATED)
            pos = this._modelData.ambientSoundVolume.pos;

        const vol = p[pos];
        if (this._callbacks?.updateAmbientVolume)
            this._callbacks.updateAmbientVolume(vol);
    }

    _processNCOnOff(resp) {
        if (!this._modelData.noiseCancellationOnOff)
            return;
        const id = resp.id;
        const p = resp.payload;
        const pos = id === GalaxyBudsMsgIds.EXTENDED_STATUS_UPDATED ? 12 : 0;
        const enabled = booleanFromByte(p[pos]);
        if (enabled === null)
            return;

        if (this._callbacks?.updateNCOnOff)
            this._callbacks.updateNCOnOff(enabled);
    }

    _processNCModes(resp) {
        if (!this._modelData.noiseControl)
            return;
        const id = resp.id;
        const p = resp.payload;
        const pos = id === GalaxyBudsMsgIds.EXTENDED_STATUS_UPDATED ? 12 : 0;
        const mode = isValidByte(p[pos]);
        if (mode === null)
            return;

        if (this._callbacks?.updateNCModes)
            this._callbacks.updateNCModes(mode);
    }

    postConnectInitialization() {
        this.sendMessage(this.encode(GalaxyBudsMsgIds.EXTENDED_STATUS_UPDATED));
    }

    processData(bytes) {
        const resp = this.extract(bytes);
        if (!resp)
            return;

        const {id} = resp;

        switch (id) {
            case GalaxyBudsMsgIds.EXTENDED_STATUS_UPDATED:
                this._processBattery(resp);
                this._processEar(resp);
                this._processAmbientSound(resp);
                this._processFocusOnVoice(resp);
                this._processAmbientVolume(resp);
                this._processNCOnOff(resp);
                this._processNCModes(resp);
                break;

            case GalaxyBudsMsgIds.STATUS_UPDATED:
                this._processBattery(resp);
                this._processEar(resp);
                break;

            case GalaxyBudsMsgIds.AMBIENT_MODE_UPDATED:
                this._processAmbientSound(resp);
                break;

            case LegacyMsgIds.AMBIENT_VOICE_FOCUS:
                if (this._modelData.ambientSoundLegacy)
                    this._processFocusOnVoice(resp);
                break;

            case GalaxyBudsMsgIds.AMBIENT_VOLUME:
                this._processAmbientVolume(resp);
                break;

            case GalaxyBudsMsgIds.NOISE_REDUCTION_MODE_UPDATE:
                this._processNCOnOff(resp);
                break;

            case GalaxyBudsMsgIds.NOISE_CONTROLS_UPDATE:
                this._processNCModes(resp);
                break;


            default:
                break;
        }
    }
}
);


