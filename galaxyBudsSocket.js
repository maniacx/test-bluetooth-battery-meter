import GObject from 'gi://GObject';

import {createLogger} from './logger.js';
import {SocketHandler} from './socketByProfile.js';
import {
    crc16Tab,
    GalaxyBudsModel,
    GalaxyBudsMsgIds,
    GalaxyBudsMsgTypes,
    GalaxyBudsAnc,
    GalaxyBudsEarDetectionState,
    GalaxyBudsLegacyEarDetectionState,
    GalaxyBudsModelList
} from './galaxyBudsConfig.js';

export const GalaxyBudsSocket = GObject.registerClass(
class GalaxyBudsSocket extends SocketHandler {
    _init(devicePath, fd, modelData, callbacks) {
        super._init(devicePath, fd);
        this._modelData = modelData;
        this._isLegacy = this._modelData.legacy;
        this._startOfMessage = 0;
        this._endOfMessage = 0;
        this._callbacks = callbacks;
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
            this._socketLog.error(`buffer length too short: ${buffer.length}`);
            return null;
        }
        this._startOfMessage = buffer[0];
        this._endOfMessage = buffer[buffer.length - 1];

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
            this._socketLog.error(`buffer length too shot: ${buffer.length} < ${expectedLen}`);
            return null;
        }

        const payload = Array.from(buffer.slice(4, 4 + payloadSize));
        const crcLo = buffer[4 + payloadSize];
        const crcHi = buffer[5 + payloadSize];
        const expectedCrc = crcHi << 8 | crcLo;
        const actualCrc = this._checksum([id, ...payload]);
        if (actualCrc !== expectedCrc) {
            this._socketLog.error(`bad CRC`);
            return null;
        }

        return {id, type, payload};
    }

    encode(msgId, payload = []) {
        const size = 1 + payload.length + 2;
        const buf = [this._startOfMessage];
        if (this._isLegacy)
            buf.push(GalaxyBudsMsgTypes.Request, size);
        else
            buf.push(size & 0xFF, size >> 8);

        buf.push(msgId, ...payload, ...this._checksumMsg(msgId, payload), this._endOfMessage);
        return Uint8Array.from(buf);
    }

    setAnc(mode) {
        const pkt = this.encode(GalaxyBudsMsgIds.NOISE_CONTROLS, [val]);
        this.sendMessage(pkt);
    }

    _processBattery(resp) {
        const batCfg = this._modelData.battery;
        const id      = resp.id;
        const p       = resp.payload;
        this._socketLog.bytes(`Process Battery (${p.length}, id=${id}):`, Array.from(p).map(
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

        print(JSON.stringify(props));

        if (this._callbacks?.updateBatteryProps)
            this._callbacks.updateBatteryProps(props);
    }

    _processAnc(resp) {
        if (!this._modelData.anc.supported)
            return;
        const id = resp.id;
        const p = resp.payload;
        const ancCfg = this._modelData.anc;
        let b;

        if (id === GalaxyBudsMsgIds.EXTENDED_STATUS_UPDATED)
            b = p[ancCfg.extendedOffset];
        else if (id === GalaxyBudsMsgIds.NOISE_CONTROLS_UPDATE)
            b = p[ancCfg.noiseUpdateOffset];
        else if (id === GalaxyBudsMsgIds.UNIVERSAL_MSG_ID_ACKNOWLEDGEMENT &&
               p[0] === GalaxyBudsMsgIds.NOISE_CONTROLS)
            b = p[ancCfg.ackOffset];

        if (ancCfg.modes.includes(b)) {
            const modeName = Object.keys(GalaxyBudsAnc).find(k => GalaxyBudsAnc[k] === b);
            print(`ANC mode: ${modeName}`);
        if (this._callbacks?.updateAmbientSoundControl)
            this._callbacks.updateAmbientSoundControl(modeName);
        }

    }

    _processEar(resp) {
        const id = resp.id;
        const p = resp.payload;
        const earCfg = this._modelData.earDetection;
        let raw;

        if (id === GalaxyBudsMsgIds.EXTENDED_STATUS_UPDATED)
            raw = p[earCfg.offset];
        else if (id === GalaxyBudsMsgIds.STATUS_UPDATED)
            raw = p[earCfg.offset - 1];  // offset is only 5 for Galaxy Buds Live instead of 6 in this case
        else
            return;

        print(`L: ${raw >> 4}, R: ${raw & 0x0F}`);
        let left, right;
        if (earCfg.legacy) {
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

        print(`Ear L:${left}  R:${right}`);
        if (this._callbacks?.updateInEarState) {
            this._callbacks.updateInEarState(left, right);
        }
    }

    postConnectInitialization() {
        this._startOfMessage = 0xAA;
        this._endOfMessage = 0x55;
        this.sendMessage(this.encode(GalaxyBudsMsgIds.STATUS_UPDATED));
    }

    processData(bytes) {
        this._socketLog.info(`called processData: legacy: ${this._isLegacy}`);
        const resp = this.extract(bytes);
        if (!resp)
            return;
        this._socketLog.info("got response");
        this._processBattery(resp);
        this._processAnc(resp);
        this._processEar(resp);
    }
}
);


