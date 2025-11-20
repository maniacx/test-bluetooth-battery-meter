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
        /* eslint-disable max-len */
        const rawPackets = [

            'fd0d00f252d2a30800b300070700a5dedd',
            'fd1050b452523137355858553041554b31b707dd',
            'fd0f00a70d4c432b8101000000dd6d00c7c8ddfd030026a444ddfd0400a400bad1ddfd0300294bb5dd',
            'fd1090b44c523137355858553041554b313295dd',
            'fd1910295246414e363052384138415246414e36305237584357a8c6dd',
            'fd1b80610d0064640100333d000100000033000501050100000003004883dd',
            'fd041061001b38dd',
            'fd060088010220cb2ddd',
            'fd04d088003192dd',
            'fd040087012e92dd',
            'fd1300f25274a608000f008e2bb12b8101000002d044dd',
            'fd1340f24cdca508000f00672bb12b81010000024f50dd',
            'fd5790260203016a010bb41a1d947eb9b41a1d947d10c001c0fa00f180fb4001c0f0f03f0000f03f000012010e01640097010d0064009a012a002c083c089f01000000000000000003000000000000000000000000003d3d4dd0dd',
            'fd0dc0630303016a01016a010b0b7089dd',
            'fd04106300795edd',
            'fd3d102e00000000000000000000000000000000000000000000000000000000000000000000000000000000000068a008006308000000000000aea908002a63dd',
            'fd2a502f63a108007dda000000000000000000000000000000000000027eb9007d10007eb9000000000000f451dd',
            'fd09907452239e0800007195dd',
            'fd48c0f2528baf0800020002016a0103000001000000000000ffffffffffffffffffffd4000000352e00008c050000fd100000e60109006a02af02c200000000000000000002000001008ddd',
            'fd4800f24c24af0800020002016a0103000001000000000000ffffffffffffffffffffd500000074330000a70500007a0700000502090039029902aa000000000000000000020000016f54dd',
            'fd6b40f2525bb708000300010000000000000000251b0000d3cd7e622f40090024849a620000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e13dd',
            'fd6b80f24cf3b6080003000100000000000000005e2d0000000000000c40090023849a62000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000591cdd',
            'fd04008001b90bdd',
            'fd040084005cd7dd',
            'fd05d042840091a4dd',
            'fd040084017dc7dd',
            'fd0510428401b0b4dd',
            'fd040084021ef7dd',
            'fd0550428402d384dd',
            'fd040084017dc7dd',
            'fd0590428401b0b4dd',
            'fd04008000981bdd',
            'fd05009202011a60dd',
            'fd06d042920201eee3dd',
            'fd05009201014935dd',
            'fd061042920101bdb6dd',
            'fd05009203036973dd',
            'fd0650429203039df0dd',
            'fd05009201022a05dd',
            'fd069042920102de86dd',
            'fd05009201014935dd',
            'fd06d042920101bdb6dd',
            'fd05009203036973dd',
            'fd0610429203039df0dd',
            'fd04009001ca08dd',
            'fd0550429001077bdd',
            'fd04009000eb18dd',
            'fd0590429000266bdd',
            'fd040086011fa1dd',
            'fd05d0428601d2d2dd',
            'fd040086027c91dd',
            'fd0510428602b1e2dd',
            'fd040086035d81dd',
            'fd055042860390f2dd',
            'fd04008604baf1dd',
            'fd05904286047782dd',
            'fd040086059be1dd',
            'fd05d04286055692dd',
            'fd040086003eb1dd',
            'fd0510428600f3c2dd',
            'fd0400af01611ddd',
            'fd055042af01ac6edd',
            'fd0400af00400ddd',
            'fd059042af008d7edd',
            'fd04006e010438dd',
            'fd04006e002528dd',
            'fd040095013ff7dd',
            'fd040095001ee7dd',
            'fd040096016ca2dd',
            'fd040096004db2dd',
            'fd04008b0143d7dd',
            'fd04008b0062c7dd',

        ];
        /* eslint-enable max-len */

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
