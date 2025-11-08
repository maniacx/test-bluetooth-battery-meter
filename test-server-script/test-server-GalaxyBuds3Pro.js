#!/usr/bin/gjs -m
/* eslint-disable no-await-in-loop */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

class SimpleSocketServer {
    constructor(host = '127.0.0.1', port = 9000) {
        this._host = host;
        this._port = port;
        this._listener = new Gio.SocketListener();
        this._cancellable = new Gio.Cancellable();
        this._connected = false;

        const addr = Gio.InetSocketAddress.new_from_string(host, port);
        this._listener.add_address(addr, Gio.SocketType.STREAM, Gio.SocketProtocol.TCP, null);

        print(`Listening on ${host}:${port}`);
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
        this._connected = true;
        const input = conn.get_input_stream();
        const output = conn.get_output_stream();

        this._readLoop(input, conn);

        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 6, () => {
            if (this._connected)
                this._sendActualPackets(output);
            return GLib.SOURCE_REMOVE;
        });
    }

    async _readLoop(input, conn) {
        try {
            while (this._connected) {
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
                    print('Client disconnected');
                    this._connected = false;
                    conn.close(null);
                    return;
                }

                print(`Received (${bytes.length} bytes): ${this._toHex(bytes)}`);
            }
        } catch (e) {
            logError(e);
            this._connected = false;
        }
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

        print(
            `Sent ${tag}: ${
                this._toHex(buf)
            }`
        );
    }

    async _sendActualPackets(output) {
        const rawPackets = [
            [253, 61, 0, 97, 2, 8, 100, 100, 1, 1, 17, 0, 0, 0, 255, 34, 0, 0,
                84, 1, 84, 1, 7, 0, 4, 221, 0, 4, 4, 16, 0, 1, 0, 0, 17, 2, 0, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 255,
                1, 1, 0, 15, 84, 221],

            [253, 61, 192, 97, 2, 8, 100, 100, 1, 1, 33, 0, 0, 0, 255, 34, 2, 0,
                84, 1, 84, 1, 7, 0, 4, 221, 0, 4, 4, 16, 0, 1, 0, 0, 17, 2, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 255, 1, 1, 0, 212, 72, 221],

            [253, 61, 128, 97, 2, 8, 100, 100, 1, 1, 17, 0, 0, 0, 255, 34, 0, 0, 84, 1, 84, 1,
                7, 0, 4, 221, 0, 4, 4, 16, 0, 1, 0, 0, 17, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 255, 1, 1, 0, 15, 84, 221],

            [253, 10, 0, 119, 0, 17, 1, 0, 13, 13, 1, 77, 166, 221],

            [253, 10, 64, 119, 1, 17, 1, 0, 13, 13, 1, 44, 30, 221],

            [253, 61, 0, 97, 2, 8, 100, 100, 1, 1, 17, 0, 0, 0, 255, 34, 0, 0, 84, 1, 84,
                1, 7, 0, 4, 221, 0, 4, 4, 16, 0, 1, 0, 0, 17, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 255, 1, 1, 0, 15, 84, 221],

            [253, 11, 192, 96, 1, 100, 100, 1, 1, 17, 30, 0, 89, 28, 221],


            [253, 11, 8, 96, 1, 100, 99, 1, 1, 51, 87, 4, 110, 203, 221],

            [253, 10, 64, 119, 1, 17, 1, 0, 13, 13, 1, 44, 30, 221],

            [253, 10, 64, 119, 1, 17, 1, 0, 13, 13, 1, 44, 30, 221],


            [253, 61, 0, 97, 2, 8, 100, 100, 1, 1, 17, 0, 0, 0, 255, 34, 0, 0, 84,
                1, 84, 1, 7, 0, 4, 221, 0, 4, 4, 16, 0, 1, 0, 0, 17, 2, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 255, 1, 1, 0, 15, 84, 221],

            [253, 11, 64, 96, 1, 99, 99, 1, 0, 17, 33, 0, 67, 174, 221],

            [253, 11, 8, 96, 1, 100, 99, 1, 1, 51, 87, 4, 110, 203, 221],

        ];

        this._socketLog?.info?.(`Starting to send ${rawPackets.length} packets...`);

        for (let i = 0; i < rawPackets.length; i++) {
            if (!this._connected) {
                this._socketLog?.warn?.('Connection lost — stopping send loop.');
                break;
            }

            let bytes;
            const pkt = rawPackets[i];

            if (Array.isArray(pkt)) {
                bytes = new Uint8Array(pkt);
            } else {
                const clean = pkt.replace(/\s+/g, '');
                const pairs = clean.match(/.{1,2}/g);
                if (!pairs) {
                    this._socketLog?.error?.(`Invalid packet format at index ${i}`);
                    continue;
                }
                bytes = new Uint8Array(pairs.map(b => parseInt(b, 16)));
            }

            await this._write(output, bytes, `RAW_${i}`);

            const msg = `Sent packet ${i + 1}/${rawPackets.length} ` +
                `(${bytes.length} bytes): ` +
                `${Array.from(bytes)
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join(' ')}`;

            this._socketLog?.debug?.(msg);

            await new Promise(resolve => {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 800, () => {
                    resolve();
                    return GLib.SOURCE_REMOVE;
                });
            });
        }

        this._socketLog?.info?.('Finished sending all raw packets');
    }
}

new SimpleSocketServer('127.0.0.1', 9000);
GLib.MainLoop.new(null, false).run();

/* eslint-enable no-await-in-loop */
