#!/usr/bin/gjs -m

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Checksum, MessageType} from './sonyConfig.js';

import {PayloadType} from './sonyDefsV1.js';

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
            0x00, 0x07, 0x00,
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
        this._retries= 5;
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
                        if(msg.payload.length > 0) {
                            if(msg.payload[0] === 0x56) {
                                if(this._retries > 0)
                                    this._retries--;
                            }
                            if(msg.payload[0] !== 0x56 || (msg.payload[0] === 0x56 && this._retries <= 0)) {
                                const ackFrame = this._protocol.encodeAckFor(msg.sequence);
                                await this._write(output, ackFrame, 'ACK');
                            }
                        }
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
                if (this._connected)
                    this._sendMultipleBattery(output);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    async _sendMultipleBattery(output) {
        const devPayload = [PayloadType.POWER_NTFY_STATUS, 2, 39, 1];
   //     await this._write(output, this._protocol.encodeMessage(MessageType.COMMAND_1,
    //        devPayload), 'BATT');
    //    this._sendActualPackets(output);
    }

    async _sendActualPackets(output) {
        const rawPackets = [
            // ANC
            '3e0c01000000086702010202010000843c',
            '3e0c00000000086702010202010000833c',
            '3e0c00000000086702010202010000833c',
            '3e0c00000000086702010202010000833c',
            '3e0c00000000086702010202010000833c',

            '3e0c00000000086902000202010000843c',
            '3e0c01000000086902010202010000863c',
            '3e0c00000000086902010200010014973c',
            '3e0c01000000086902010200010114993c',
            '3e0c00000000086902010200010014973c',
            '3e0c01000000086902010200010004883c',
            '3e0c00000000086902010202010000853c',
            '3e0c00000000086902010202010000853c',
            '3e0c00000000086902000202010000843c',
            '3e0c01000000086902000202010000853c',
            '3e0c00000000086902000202010000843c',
            '3e0c01000000086902000202010000853c',
            '3e0c00000000086902000202010000843c',
            '3e0c01000000086902010202010000863c',

            // POWER_RET_STATUS: Battery
            '3e0c000000000411002800493c',
            '3e0c000000000411002800493c',


            // Upscampling Indicator
            '3e0c0100000004e9010001fc3c', // enable upscaling
            '3e0c0100000004150002022a3c',
            '3e0c010000000415000201293c',
            '3e0c0100000004150002022a3c',
            '3e0c010000000415000201293c',
            '3e0c0100000004170002012b3c',
            '3e0c000000000417000200293c',
            '3e0c0100000004170002002a3c',
            '3e0c0000000004170002012a3c',
            '3e0c000000000417000200293c',
            '3e0c0100000004170002012b3c',
            '3e0c0100000004170002022c3c',

            // Audio Codec Indicator
            '3e0c0100000003190000293c',
            '3e0c0000000003190010383c',
            '3e0c0000000003190010383c',
            '3e0c00000000031b00022c3c',
            '3e0c00000000031b00002a3c',
            '3e0c00000000031b00022c3c',
            '3e0c00000000031b00002a3c',
            '3e0c00000000031b00022c3c',

            // Speak2ChatEnable
            '3e0c0100000004f70500010e3c',
            '3e0c0000000004f70500010d3c',
            '3e0c0000000004f70500010d3c',
            '3e0c0000000004f70500010d3c',
            '3e0c0000000004f70500010d3c',
            '3e0c0100000004f9050100103c',
            '3e0c0000000004f9050200103c',
            '3e0c0100000004f9050101113c',
            '3e0c0000000004f9050200103c',
            '3e0c0000000004f9050101103c',
            '3e0c0100000004f9050200113c',
            '3e0c0100000004f9050101113c',
            '3e0c0000000004f9050200103c',
            '3e0c0000000004f9050101103c',
            '3e0c0100000004f9050200113c',
            '3e0c0000000004f9050101103c',
            '3e0c0100000004f9050200113c',

            // Speak2ChatConfig
            '3e0c0000000006fb0500000001133c',
            '3e0c0100000006fb0500000001143c',
            '3e0c0100000006fb0500000001143c',
            '3e0c0100000006fb0500000001143c',
            '3e0c0100000006fb0500000001143c',
            '3e0c0000000006fd0500000101163c',
            '3e0c0100000006fd0500000001163c',
            '3e0c0000000006fd0500000000143c',
            '3e0c0100000006fd0500000002173c',
            '3e0c0000000006fd0500000003173c',
            '3e0c0100000006fd0500000001163c',
            '3e0c0000000006fd0500010001163c',
            '3e0c0100000006fd0500020001183c',
            '3e0c0000000006fd0500000001153c',
            '3e0c0100000006fd0500000101173c',
            '3e0c0000000006fd0500000001153c',


            // VOICE_GUIDANCE_RET_PARAM: Voice Notification
            '3e0e00000000174701052514141034314435393131434439414339344533713c',
            '3e0e0000000004470101015c3c',
            '3e0e0000000004470102015d3c',
            '3e0e010000000447010314723c',
            '3e0e01000000174701052514141034314435393131434439414339344533723c',
            '3e0e0100000004470101015d3c',
            '3e0e0100000004470102015e3c',
            '3e0e000000000447010314713c',
            '3e0e01000000174701052514141034314435393131434439414339344533723c',
            '3e0e0100000004470101015d3c',
            '3e0e0100000004470102015e3c',
            '3e0e000000000447010314713c',
            '3e0e01000000174701052514141034314435393131434439414339344533723c',
            '3e0e0100000004470101015d3c',
            '3e0e0100000004470102015e3c',
            '3e0e000000000447010314713c',
            '3e0e01000000174701052514141034314435393131434439414339344533723c',
            '3e0e0100000004470101015d3c',
            '3e0e0100000004470102015e3c',
            '3e0e000000000447010314713c',
            '3e0e0100000004490101005e3c',
            '3e0e0000000004490101015e3c',

            // EQEBB_RET_PARAM: Equalizer
            '3e0c000000000a570100060a0a0a0a0a0ab03c',
            '3e0c000000000a5701a0060a0a05140a0a553c',
            '3e0c010000000a5701a0060a0a05140a0a563c',
            '3e0c000000000a5701a0060a0a0a0a0a0a503c',
            '3e0c010000000a570100060a0a0a0a0a0ab13c',
            '3e0c010000000a570100060a0a0a0a0a0ab13c',
            '3e0c010000000a570100060a0a0a0a0a0ab13c',
            '3e0c010000000a570100060a0a0a0a0a0ab13c',

            '3e0c000000000a59011006090a0f111113dd3c',
            '3e0c010000000a5901110612090b0a0d0fd43c',
            '3e0c010000000a59011206070908070604b23c',
            '3e0c010000000a59011306010709070502a93c',
            '3e0c010000000a590114060a100e0c0d09d53c',
            '3e0c010000000a590115060a0a0a0c1014da3c',
            '3e0c010000000a59011606110a0a0a0a0ad03c',
            '3e0c010000000a59011706000e0d0b0c00c03c',
            '3e0c010000000a5901a0060a0a0a0a0a0a533c',
            '3e0c010000000a5901a1060a0a0a0a0a0a543c',
            '3e0c010000000a5901a2060a0a0a0a0a0a553c',
            '3e0c010000000a590100060a0a0a0a0a0ab33c',
            '3e0c000000000a5901a0060a0a090a0a0a513c',
            '3e0c000000000a5901a1060a0a0a0a0a0a533c',
            '3e0c000000000a5901a0060a0a05140a0a573c',
            '3e0c000000000a59011706000e0d0b0c00bf3c',
            '3e0c000000000a5901a0060a0a05140a0a573c',
            '3e0c000000000a59011706000e0d0b0c00bf3c',
            '3e0c000000000a59011606110a0a0a0a0acf3c',
            '3e0c000000000a590115060a0a0a0c1014d93c',
            '3e0c000000000a590114060a100e0c0d09d43c',
            '3e0c000000000a59011306010709070502a83c',
            '3e0c000000000a59011206070908070604b13c',
            '3e0c000000000a5901110612090b0a0d0fd33c',
            '3e0c000000000a59011006090a0f111113dd3c',
            '3e0c000000000a590100060a0a0a0a0a0ab23c',


            // AUDIO_RET_PARAM:
            '3e0c0100000004e7010000f93c',
            '3e0c0100000004e9010001fc3c',
            '3e0c0000000004e9010000fa3c',
            '3e0c0100000004e9010001fc3c',
            '3e0c0000000004e9010000fa3c',
            '3e0c0100000004e9020001fd3c',

            // / Auto
            '3e0c0000000004f70300010b3c',
            '3e0c0100000004f90300000d3c',
            '3e0c0000000004f70300010b3c',
            '3e0c0100000004f90300000d3c',
            '3e0c0000000004f90300010d3c',

            '3e0c0100000005f7040110001e3c',
            '3e0c0000000005f7040110001d3c',
            '3e0c0100000005f904011100213c',
            '3e0c0000000005f9040110001f3c',
            '3e0c0000000005f7040110001d3c',
            '3e0c0000000005f7040110001d3c',
            '3e0c0000000005f7040110001d3c',
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

