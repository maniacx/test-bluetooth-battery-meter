#!/usr/bin/gjs -m

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Checksum, MessageType} from './sonyConfig.js';

import {
    PayloadType, AutoPowerOff, Speak2ChatSensitivity, Speak2ChatTimeout, EqualizerPreset
} from './sonyDefsV1.js';

class SonyProtocol {
    constructor() {
        this._lastAckSeq = 0;
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

    decode(frame) {
        if (!frame || frame.length < 4)
            return null;
        if (frame[0] !== Checksum.HEADER || frame.at(-1) !== Checksum.TRAILER)
            return null;

        const unesc = this._unescapeBytes(frame);
        const lenAll = unesc.length;
        if (lenAll < 4)
            return null;

        const chksum = unesc[lenAll - 2];
        const exp = this._calcChecksum(unesc.subarray(1, lenAll - 2));
        if (chksum !== exp)
            return {error: 'Checksum', found: chksum, expected: exp, rawUnescaped: unesc};

        if (lenAll < 7)
            return null;
        const messageType = unesc[1];
        const sequence = unesc[2];
        const payloadLen = unesc[3] << 24 | unesc[4] << 16 | unesc[5] << 8 | unesc[6];
        const payload = unesc.subarray(7, 7 + payloadLen);
        return {messageType, sequence, payload, rawUnescaped: unesc};
    }

    encodeMessage(messageType, payloadArr, seq) {
        const sequence = seq !== undefined ? seq : this._lastAckSeq;
        const len = payloadArr ? payloadArr.length : 0;
        const headerBuf = new Uint8Array(6 + len);
        headerBuf[0] = messageType;
        headerBuf[1] = sequence;
        headerBuf[2] = len >>> 24 & 0xff;
        headerBuf[3] = len >>> 16 & 0xff;
        headerBuf[4] = len >>> 8 & 0xff;
        headerBuf[5] = len & 0xff;
        if (len > 0)
            headerBuf.set(payloadArr, 6);

        const chk = this._calcChecksum(headerBuf);
        const bodyEsc = this._escapeBytes(headerBuf);
        const chkEsc = this._escapeBytes(new Uint8Array([chk]));
        const out = new Uint8Array(1 + bodyEsc.length + chkEsc.length + 1);
        out[0] = Checksum.HEADER;
        out.set(bodyEsc, 1);
        out.set(chkEsc, 1 + bodyEsc.length);
        out[out.length - 1] = Checksum.TRAILER;
        return out;
    }

    encodeAckFor(seq) {
        const ackSeq = 1 - seq & 0xff;
        this._lastAckSeq = ackSeq;
        return this.encodeMessage(MessageType.ACK, new Uint8Array([]), ackSeq);
    }

    encodeProtocolInfo() {
        const payload = new Uint8Array([
            PayloadType.CONNECT_RET_PROTOCOL_INFO,
            0x00,
            0x70,
            0x00,
        ]);
        return this.encodeMessage(MessageType.COMMAND_1, payload);
    }
}

class SonySocketServer {
    constructor(host = '127.0.0.1', port = 9000) {
        this._host = host;
        this._port = port;
        this._listener = new Gio.SocketListener();
        this._cancellable = new Gio.Cancellable();
        const addr = Gio.InetSocketAddress.new_from_string(host, port);
        this._listener.add_address(addr, Gio.SocketType.STREAM, Gio.SocketProtocol.TCP, null);
        this._protocol = new SonyProtocol();
        print(`SonySimulator listening on ${host}:${port}`);
        this._listener.accept_async(this._cancellable, (l, r) => this._onAccept(l, r));
    }

    _onAccept(listener, res) {
        try {
            const [conn] = listener.accept_finish(res);
            print('Client connected!');
            this._handleClient(conn);
        } catch (e) {
            logError(e);
        }
        this._listener.accept_async(this._cancellable, (l, r) => this._onAccept(l, r));
    }

    _toHex(buf) {
        return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join(' ');
    }

    _handleClient(conn) {
        const input = conn.get_input_stream();
        const output = conn.get_output_stream();
        const buffer = [];

        const readLoop = async () => {
            try {
                const bytes = await new Promise((resolve, reject) => {
                    input.read_bytes_async(4096, GLib.PRIORITY_DEFAULT, null, (s, r) => {
                        try {
                            const bs = s.read_bytes_finish(r);
                            resolve(bs ? bs.toArray() : []);
                        } catch (e) {
                            reject(e);
                        }
                    });
                });

                if (!bytes || bytes.length === 0) {
                    print('🔌 Client disconnected');
                    return;
                }

                buffer.push(...bytes);
                print(`Received raw: ${buffer.map(b =>
                    b.toString(16).padStart(2, '0')).join(' ')}`);

                while (true) {
                    const start = buffer.indexOf(Checksum.HEADER);
                    if (start === -1) {
                        buffer.length = 0;
                        break;
                    }
                    const end = buffer.indexOf(Checksum.TRAILER, start + 1);
                    if (end === -1)
                        break;

                    const frame = buffer.slice(start, end + 1);
                    buffer.splice(0, end + 1);

                    const msg = this._protocol.decode(new Uint8Array(frame));
                    if (!msg)
                        continue;
                    if (msg.error === 'Checksum')
                        continue;

                    print(`Received seq=${msg.sequence} type=${msg.messageType} ` +
                        ` payload=${this._toHex(msg.payload)}`);

                    const ackFrame = this._protocol.encodeAckFor(msg.sequence);
                    /* eslint-disable no-await-in-loop */

                    await this._write(output, ackFrame, 'ACK');

                    if (msg.messageType === MessageType.COMMAND_1 &&
                                    msg.payload && msg.payload.length > 0)
                        await this._parseData(msg.payload, output);
                }
                /* eslint-enable no-await-in-loop */

                readLoop();
            } catch (e) {
                logError(e, 'readLoop');
                try {
                    conn.close(null);
                } catch (err) {
                    log(err);
                }
            }
        };

        readLoop();
    }

    async _write(output, buf, tag = '') {
        await new Promise((resolve, reject) => {
            try {
                output.write_bytes_async(
                    new GLib.Bytes(buf), GLib.PRIORITY_DEFAULT, null, (s, r) => {
                        try {
                            s.write_bytes_finish(r);
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    });
            } catch (e) {
                reject(e);
            }
        });
        print(`➡ Sent ${tag ? `${tag} ` : ''}${Array.from(buf).map(b =>
            b.toString(16).padStart(2, '0')).join(' ')}`);
    }

    async _parseData(payload, output) {
        const reqType = payload[0];
        switch (reqType) {
            case PayloadType.CONNECT_GET_PROTOCOL_INFO:
                await this._write(output,
                    this._protocol.encodeProtocolInfo(), 'PROTO');
                break;
            case PayloadType.CONNECT_GET_DEVICE_INFO:
                {
                    const which = payload[1];
                    if (which === 0x01) {
                        const nameStr = 'WH-1000XM4';
                        const nameBytes = new TextEncoder().encode(nameStr);
                        const maxLen = Math.min(nameBytes.length, 128);
                        const devPayload = new Uint8Array(2 + maxLen);
                        devPayload[0] = PayloadType.CONNECT_RET_DEVICE_INFO;
                        devPayload[1] = maxLen;
                        devPayload.set(nameBytes.subarray(0, maxLen), 2);
                        await this._write(output,
                            this._protocol.encodeMessage(MessageType.COMMAND_1,
                                devPayload), 'DEVINFO_MODEL');
                    } else if (which === 0x02) {
                        const fw = '1.2.3';
                        const fwB = new TextEncoder().encode(fw);
                        const len = Math.min(fwB.length, 128);
                        const devPayload = new Uint8Array(2 + len);
                        devPayload[0] = PayloadType.CONNECT_RET_DEVICE_INFO;
                        devPayload[1] = len;
                        devPayload.set(fwB.subarray(0, len), 2);
                        await this._write(output,
                            this._protocol.encodeMessage(MessageType.COMMAND_1,
                                devPayload), 'DEVINFO_FW');
                    } else if (which === 0x03) {
                        const devPayload = new Uint8Array(
                            [PayloadType.CONNECT_RET_DEVICE_INFO, 0x10, 0x01]);
                        await this._write(output,
                            this._protocol.encodeMessage(MessageType.COMMAND_1,
                                devPayload), 'DEVINFO_SERIES');
                    }
                }
                break;

            case PayloadType.CONNECT_GET_SUPPORT_FUNCTION:
                {
                    const devPayload = [
                        PayloadType.CONNECT_RET_SUPPORT_FUNCTION,
                        0x00, 0x16, 0x71, 0x62, 0xF5, 0x81, 0x51, 0xA1, 0xE1, 0xE2,
                        0xD2, 0xF6, 0xD1, 0xF4, 0xF3, 0x39, 0x12, 0x13, 0x11, 0x30,
                        0xC1, 0x14, 0x22, 0x21, 0x77, 0x3C,
                    ];
                    await this._write(output, this._protocol.encodeMessage(MessageType.COMMAND_1,
                        devPayload), 'SUPPORT_FUNCTION');
                    this._sendBattery(output);
                }
                break;
        }
    }

    _sendBattery(output) {
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,
            6, () => {
                const devPayload = [PayloadType.COMMON_RET_BATTERY_LEVEL];
                devPayload.push(0x00);
                devPayload.push(0x04);
                devPayload.push(0x01);
                this._write(output, this._protocol.encodeMessage(MessageType.COMMAND_1,
                    devPayload), 'BATT');
                this._startTestCycle(output);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    /* eslint-disable no-await-in-loop */
    async _startTestCycle(output) {
        log('Starting test cycle');

        const steps = [
            {type: 'ANC', mode: 'OFF'},
            {type: 'ANC', mode: 'ON'},
            {type: 'ANC', mode: 'WIND'},
            {type: 'ANC', mode: 'OFF'},
            {type: 'ANC', mode: 'AMBIENT'},
            {type: 'ANC', mode: 'AMBIENT15'},
            {type: 'ANC', mode: 'AMBIENT05'},
            {type: 'ANC', mode: 'AMBIENTFV'},

            {type: 'S2C', enable: true},
            {type: 'S2C', enable: false},

            {type: 'S2CS', mode: Speak2ChatSensitivity.HIGH},
            {type: 'S2CS', mode: Speak2ChatSensitivity.LOW},
            {type: 'S2CS', mode: Speak2ChatSensitivity.AUTO},

            {type: 'S2CT', mode: Speak2ChatTimeout.OFF},
            {type: 'S2CT', mode: Speak2ChatTimeout.STANDARD},
            {type: 'S2CT', mode: Speak2ChatTimeout.SHORT},
            {type: 'S2CT', mode: Speak2ChatTimeout.LONG},

            {type: 'VOICE_NOTIFICATION', enable: true},
            {type: 'VOICE_NOTIFICATION', enable: false},

            {type: 'EQ_PRESET', preset: EqualizerPreset.MANUAL},
            {type: 'EQ_CUSTOM', customBands: [10, 20, 0, 5, 15, 17]},

            {type: 'AUDIO_UPSAMPLING', enable: true},
            {type: 'AUDIO_UPSAMPLING', enable: false},

            {type: 'PAUSE_WHEN_TAKEN_OFF', enable: true},
            {type: 'PAUSE_WHEN_TAKEN_OFF', enable: false},

            {type: 'AUTO_POWER_OFF', id: 1},
            {type: 'AUTO_POWER_OFF', id: 4},
        ];

        for (const step of steps) {
            try {
                let payload;
                switch (step.type) {
                    case 'ANC': {
                        payload = [PayloadType.NC_ASM_RET_PARAM, 0x02];
                        if (step.mode === 'OFF')
                            payload.push(0x00, 0x00, 0x00, 0x01, 0x00, 0x00);
                        else if (step.mode === 'ON')
                            payload.push(0x01, 0x00, 0x01, 0x01, 0x00, 0x00);
                        else if (step.mode === 'WIND')
                            payload.push(0x01, 0x02, 0x01, 0x01, 0x00, 0x00);
                        else if (step.mode === 'AMBIENT')
                            payload.push(0x01, 0x00, 0x00, 0x01, 0x01, 0x0A);
                        else if (step.mode === 'AMBIENT15')
                            payload.push(0x01, 0x00, 0x00, 0x01, 0x01, 0x0E);
                        else if (step.mode === 'AMBIENT05')
                            payload.push(0x01, 0x00, 0x00, 0x01, 0x01, 0x05);
                        else if (step.mode === 'AMBIENTFV')
                            payload.push(0x01, 0x00, 0x00, 0x01, 0x00, 0x05);
                        await this._write(output, this._protocol.encodeMessage(
                            MessageType.COMMAND_1, payload), `ANC_${step.mode}`);
                        break;
                    }

                    case 'S2C': {
                        payload = [PayloadType.SYSTEM_RET_PARAM,
                            0x05, 0x01, step.enable ? 0x01 : 0x00];

                        await this._write(output, this._protocol.encodeMessage(
                            MessageType.COMMAND_1, payload), `S2C_${step.enable ? 'ON' : 'OFF'}`);

                        break;
                    }

                    case 'S2CS': {
                        payload = [PayloadType.SYSTEM_RET_EXTENDED_PARAM,
                            0x05, 0x00, step.mode, 0x00, 0x00];

                        await this._write(output, this._protocol.encodeMessage(
                            MessageType.COMMAND_1, payload), `S2CS_${step.mode}`);

                        break;
                    }

                    case 'S2CT': {
                        payload = [PayloadType.SYSTEM_RET_EXTENDED_PARAM,
                            0x05, 0x00, 0x00, 0x00, step.mode];

                        await this._write(output, this._protocol.encodeMessage(
                            MessageType.COMMAND_1, payload), `S2CT_${step.mode}`);

                        break;
                    }

                    case 'VOICE_NOTIFICATION': {
                        payload = [PayloadType.VPT_RET_PARAM, 0x01, 0x01,
                            step.enable ? 0x01 : 0x00];

                        await this._write(output, this._protocol.encodeMessage(
                            MessageType.COMMAND_2, payload),
                        `VOICE_NOTIFICATION_${step.enable ? 'ON' : 'OFF'}`);

                        break;
                    }

                    case 'EQ_PRESET': {
                        payload = [PayloadType.EQ_EBB_RET_PARAM, 0x01, step.preset,
                            0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

                        await this._write(output, this._protocol.encodeMessage(
                            MessageType.COMMAND_1, payload), `EQ_PRESET_${step.preset}`);
                        break;
                    }

                    case 'EQ_CUSTOM': {
                        payload = [PayloadType.EQ_EBB_RET_PARAM, 0x01,
                            EqualizerPreset.MANUAL, 0x06];

                        for (let i = 0; i < 6; i++)
                            payload.push(step.customBands[i]);

                        await this._write(output, this._protocol.encodeMessage(
                            MessageType.COMMAND_1, payload), 'EQ_CUSTOM');

                        break;
                    }

                    case 'AUDIO_UPSAMPLING': {
                        payload = [PayloadType.AUDIO_RET_PARAM, 0x01, 0x01,
                            step.enable ? 0x01 : 0x00];

                        await this._write(output, this._protocol.encodeMessage(
                            MessageType.COMMAND_1, payload),
                        `AUDIO_UPSAMPLING_${step.enable ? 'ON' : 'OFF'}`);

                        break;
                    }

                    case 'PAUSE_WHEN_TAKEN_OFF': {
                        payload = [PayloadType.SYSTEM_RET_PARAM, 0x03, 0x01,
                            step.enable ? 0x01 : 0x00];

                        await this._write(output, this._protocol.encodeMessage(
                            MessageType.COMMAND_1, payload),
                        `PAUSE_WHEN_TAKEN_OFF_${step.enable ? 'ON' : 'OFF'}`);

                        break;
                    }

                    case 'AUTO_POWER_OFF': {
                        const cfg = Object.values(AutoPowerOff).find(v => v.id === step.id);
                        if (!cfg)
                            break;
                        payload = [PayloadType.SYSTEM_RET_PARAM, 0x04, 0x01, ...cfg.bytes];
                        await this._write(output, this._protocol.encodeMessage(
                            MessageType.COMMAND_1, payload), `AUTO_POWER_OFF_${step.id}`);

                        break;
                    }
                }
            } catch (e) {
                log(`Error in test cycle step ${step.type}: ${e}`);
            }

            await new Promise(r => GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT, 3, () => (r(), GLib.SOURCE_REMOVE)));
        }

        log('Test cycle complete');
    }
    /* eslint-enable no-await-in-loop */
}

new SonySocketServer('127.0.0.1', 9000);
GLib.MainLoop.new(null, false).run();

