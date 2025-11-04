#!/usr/bin/gjs -m

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Checksum, MessageType} from './sonyConfig.js';

import {PayloadType} from './sonyDefsV2.js';

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
            0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00,
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
        this._connected = false;
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
        this._connected = true;

        /*    conn.connect('closed', () => {
            this._connected = false;
            print('Client disconnected');
        });*/

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
                    this._connected = false;
                    print('Client disconnected');
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

                    /* eslint-disable no-await-in-loop */
                    if (msg.messageType === MessageType.COMMAND_1 ||
                                 msg.messageType === MessageType.COMMAND_2) {
                        const ackFrame = this._protocol.encodeAckFor(msg.sequence);
                        await this._write(output, ackFrame, 'ACK');
                    }
                    if (msg.messageType === MessageType.COMMAND_1 &&
                                    msg.payload && msg.payload.length > 0)
                        await this._parseData(msg.payload, output);
                }
                /* eslint-enable no-await-in-loop */

                readLoop();
            } catch (e) {
                logError(e, 'readLoop');
                try {
                    this._connected = false;
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
                        const devPayload = [PayloadType.CONNECT_RET_DEVICE_INFO,
                            0x01, 0x0a, 0x57, 0x48, 0x2d, 0x31, 0x30, 0x30, 0x30, 0x58, 0x4d, 0x35];
                        await this._write(output,
                            this._protocol.encodeMessage(MessageType.COMMAND_1,
                                devPayload), 'DEVINFO_MODEL');
                    } else if (which === 0x02) {
                        const devPayload = [PayloadType.CONNECT_RET_DEVICE_INFO,
                            0x05, 0x02, 0x05, 0x31, 0x2e, 0x31, 0x2e, 0x33];
                        await this._write(output,
                            this._protocol.encodeMessage(MessageType.COMMAND_1,
                                devPayload), 'DEVINFO_FW');
                    } else if (which === 0x03) {
                        const devPayload = [PayloadType.CONNECT_RET_DEVICE_INFO, 0x03, 0x30, 0x01];
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
                        0x00, 0x1f, 0x10, 0xff, 0x12, 0xff, 0x13, 0xff, 0x14, 0xff, 0x23, 0xff,
                        0x25, 0x18, 0x20, 0xff, 0x27, 0xff, 0xd1, 0x14, 0x32, 0x1c, 0x50, 0x09,
                        0x6d, 0x05, 0x70, 0x01, 0x90, 0xff, 0xa1, 0x0a, 0xc1, 0xff, 0xc2, 0xff,
                        0xe3, 0x0c, 0xe2, 0x0d, 0xf4, 0x10, 0x93, 0xff, 0x69, 0x15, 0xd2, 0x0e,
                        0xf9, 0x1d, 0xb0, 0x1e, 0xb2, 0x20, 0xb3, 0x1f, 0xf1, 0x1a, 0xfd, 0x16,
                        0xfc, 0x08, 0xb1, 0xff, 0xb0,
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
            3, () => {
                if (this._connected)
                    this._sendMultipleBattery(output);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    async _sendMultipleBattery(output) {
        const devPayload = [PayloadType.POWER_NTFY_STATUS, 2, 39, 1];
        await this._write(output, this._protocol.encodeMessage(MessageType.COMMAND_1,
            devPayload), 'BATT');
        this._sendActualPackets(output);
    }

    async _sendActualPackets(output) {
        const rawPackets = [

            // POWER_RET_STATUS: Battery
            '3e0c000000000423005500883c',
            '3e0c010000000423005400883c',
            '3e0c0100000004250054008a3c',

            // COMMON_RET_STATUS: Codec
            '3e0c0000000003130202263c',
            '3e0c0100000003130210353c',
            '3e0c0100000003130202273c',
            '3e0c00000000031302ff233c',
            '3e0c0000000003130201253c',
            '3e0c0000000003130200243c',
            '3e0c0000000003130210343c',
            '3e0c0000000003130220443c',
            '3e0c0000000003130221453c',
            '3e0c0000000003130230543c',

            //  COMMON_RET_STATUS: DSSE Indicator
            '3e0c0000000003e90101fa3c', // enable dsse
            '3e0c000000000413030200283c',
            '3e0c000000000413030002283c',
            '3e0c0000000004150301022b3c',
            '3e0c0000000004150302022c3c',
            '3e0c0000000004150303022d3c',

            // NCASM_RET_PARAM: ANC
            '3e0c0000000009671901000100140000ab3c',
            '3e0c0000000009691901010000140000ad3c',
            '3e0c0000000009691901010100140000ae3c',
            '3e0c0000000009671901000100140000ab3c',
            '3e0c0000000009691901010000140000ad3c',
            '3e0c0000000009691901010100140000ae3c',
            '3e0c0000000009691901010101140000af3c',
            '3e0c0000000009691901010100140000ae3c',
            '3e0c0000000009691901010101140000af3c',
            '3e0c00000000096919010101000000009a3c',
            '3e0c00000000096919010101000a0000a43c',
            '3e0c0000000009691901010100140000ae3c',
            '3e0c0000000009691901010100140100af3c',
            '3e0c0000000009691901010100140101b03c',
            '3e0c0000000009691901010100140102b13c',
            '3e0c0000000009691901010100140100af3c',
            '3e0c0000000009691901010100140000ae3c',

            // SYSTEM_RET_PARAM: Speak2Chat Enable
            '3e0c0100000004f70c0001153c',
            '3e0c0100000004f70c0101163c',
            '3e0c0100000004f90c0001173c',
            '3e0c0100000004f90c0101183c',

            // SYSTEM_RET_EXT_PARAM: Speak 2 Chat Config
            '3e0c0100000004fb0c0000183c',
            '3e0c0100000004fb0c0100193c',
            '3e0c0100000004fb0c02001a3c',

            '3e0c0100000004fd0c00001a3c',
            '3e0c0100000004fd0c00011b3c',
            '3e0c0100000004fd0c00021c3c',
            '3e0c0000000004fd0c00031c3c',

            // AUDIO_RET_PARAM: BGM modes
            '3e0c0100000003e90401fe3c',
            '3e0c0100000004e9030000fd3c',
            '3e0c0000000003e90400fc3c',
            '3e0c0100000004e9030000fd3c',
            '3e0c0100000004e9030001fe3c',
            '3e0c0000000004e9030002fe3c',
            '3e0c0100000004e9030000fd3c',
            '3e0c0100000003e90401fe3c',
            '3e0c0100000004e9030100fe3c',

            // EQEBB_RET_PARAM: Equalizer
            '3e0c000000000e5900a00a14090b0c0d0f000000006d3c',
            '3e0c010000000e5900a00a1409090c0d0f000000006c3c',
            '3e0c000000000e5900a00a1409090a0d0f00000000693c',
            '3e0c010000000e5900a00a1409090a040f00000000613c',
            '3e0c000000000e5900a00a1409090a0409000000006a3c',
            '3e0c010000000e5900a00a1409090a04090a000000653c',
            '3e0c000000000e5900a00a1409090a04090a0a00006e3c',
            '3e0c010000000e5900a00a1409090a04090a0a0700763c',
            '3e0c000000000e5900a00a1409090a04090a0a070b803c',
            '3e0c000000000e5900100a1409090a04090a0a070bff3c',
            '3e0c000000000e5900120a1409090a04090a0a070bf23c',
            '3e0c010000000e5900130a1409090a04090a0a070bf43c',
            '3e0c000000000e5900140a1409090a04090a0a070bf43c',
            '3e0c010000000e5900150a1409090a04090a0a070bf63c',
            '3e0c000000000e5900160a1409090a04090a0a070bf63c',
            '3e0c010000000e5900170a1409090a04090a0a070bf83c',

            // AUDIO_RET_PARAM: UpSampling
            '3e0c0100000003e70100f83c',
            '3e0c0000000003e90101fa3c',
            '3e0c0100000003e90100fa3c',
            '3e0c0100000003e90101fb3c',

            // NCASM_RET_PARAM: ANC Toggle
            '3e0c0000000003673002a83c',
            '3e0c0000000003673004aa3c',
            '3e0c0000000003673003a93c',
            '3e0c0000000003673001a73c',

            // VOICE_GUIDANCE_RET_PARAM: Voice Notification
            '3e0e0000000004470300015d3c',
            '3e0e0000000004470301015e3c',
            '3e0e0000000004470300015d3c',
            '3e0e0000000004470301015e3c',

            // VOICE_GUIDANCE_RET_PARAM: Voice Volume
            '3e0e00000000034920fe783c',
            '3e0e01000000034920ff7a3c',
            '3e0e00000000034920007a3c',
            '3e0e01000000034920017c3c',
            '3e0e00000000034920027c3c',

            // SYSTEM_RET_PARAM: Pause When Take Off
            '3e0c0000000003f70100073c',
            '3e0c0100000003f901010b3c',
            '3e0c0000000003f90100093c',
            '3e0c0100000003f901010b3c',

            // POWER_RET_STATUS: Auto Power Off
            '3e0c0000000004270510004c3c',
            '3e0c010000000429051100503c',
            '3e0c0000000004270510004c3c',
            '3e0c010000000429051100503c',

        ];
        /* eslint-disable no-await-in-loop */
        for (let i = 0; i < rawPackets.length; i++) {
            if (!this._connected)
                break;

            const hex = rawPackets[i].replace(/\s+/g, '');
            const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
            await this._write(output, bytes, `RAW_${i}`);

            await new Promise(r => {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 800, () => {
                    if (!this._connected)
                        return GLib.SOURCE_REMOVE;

                    r();
                    return GLib.SOURCE_REMOVE;
                });
            });
        }
        /* eslint-enable no-await-in-loop */

        log('Finished sending actual raw packets');
    }
}

new SonySocketServer('127.0.0.1', 9000);
GLib.MainLoop.new(null, false).run();

