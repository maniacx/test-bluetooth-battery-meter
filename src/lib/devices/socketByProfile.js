'use strict';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {createLogger, getDeviceIdentifier} from './logger.js';

const BudsLinkBluetooth = (await import('gi://BudsLinkBluetooth')).default;

const LOG_BYTES = true;

function pathToMac(path) {
    const idx = path.indexOf('dev_');
    if (idx === -1)
        return '';

    return path.substring(idx + 4).replace(/_/g, ':');
}


export const SocketHandler = GObject.registerClass({
    GTypeName: 'BudsLink_SocketHandler',
}, class SocketHandler extends GObject.Object {
    _init(devicePath, profileManager, profile, fallback = null) {
        super._init();
        const subclassName = this.constructor.name;
        const identifier = getDeviceIdentifier(devicePath);
        const tag = `SocketHandler-${subclassName}-${identifier}`;
        this._socketLog = createLogger(tag);
        this._devicePath = devicePath;
        this._profileManager = profileManager;
        this._profile = profile;
        this.running = false;
        this._cancellable = new Gio.Cancellable();
        this._output_queue = [];
        this._fallback = fallback;
    }

    /* eslint-disable no-await-in-loop */
    async startSocket() {
        const fd = await this._profileManager.acquireFd(
            this._profile.type,
            this._profile.uuid,
            this._devicePath
        );

        if (fd !== -1) {
            await this._attachSocket(fd);
        } else if (this._fallback?.psm) {
            const mac = pathToMac(this._devicePath);

            for (const psm of this._fallback.psm) {
                try {
                    const fd = BudsLinkBluetooth.l2cap_connect(mac, psm);
                    if (fd >= 0) {
                        await this._attachSocket(fd);
                        break;
                    }

                    this._socketLog.info(`L2CAP fallback connection failed for PSM ${psm}`);
                } catch (e) {
                    this._socketLog.error(e, `L2CAP fallback connection failed for PSM ${psm}`);
                }
            }
        } else if (this._fallback?.channel) {
            const mac = pathToMac(this._devicePath);

            for (const channel of this._fallback.channel) {
                try {
                    const fd = BudsLinkBluetooth.budslink_rfcomm_connect(mac, channel);
                    if (fd >= 0) {
                        await this._attachSocket(fd);
                        break;
                    }

                    this._socketLog.info(
                        `RFCOMM fallback connection failed for channel ${channel}`
                    );
                } catch (e) {
                    this._socketLog.error(
                        e, `RFCOMM fallback connection failed for channel ${channel}`
                    );
                }
            }
        }
    }
    /* eslint-enable no-await-in-loop */

    // Credits: GSCConnect
    // https://github.com/jtojnar/gnome-shell-extension-gsconnect/
    // blob/bb77316b75f330740ffc3523cd1496b5db0f8199/src/service/bluetooth.js#L321

    async _attachSocket(fd) {
        this._socketLog.info(`Starting socket with fd: ${fd}`);
        try {
            this._socket = Gio.Socket.new_from_fd(fd);
        } catch (e) {
            this._socketLog.error(e, 'Error creating socket by fd');
            return;
        }
        this._connection = this._socket.connection_factory_create_connection();
        this._input_stream = this._connection.get_input_stream();
        this._output_stream = this._connection.get_output_stream();

        this.running = true;
        this._sending = false;

        try {
            this._receiveLoop();
            await this.postConnectInitialization();
        } catch (e) {
            this._socketLog.error(e, 'Error post connection initialization');
            this.destroy();
        }
    }

    async _receiveLoop() {
        if (!this.running)
            return;

        try {
            const bytes = await this._input_stream.read_bytes_async(
                1024, GLib.PRIORITY_DEFAULT, this._cancellable
            );

            if (!bytes || bytes.get_size() === 0) {
                this._socketLog.info('Received empty or null data — stopping receive loop');
                this.destroy();
                return;
            }

            const array = bytes.toArray();

            if (LOG_BYTES) {
                this._socketLog.bytes('⬅ Received:', Array.from(array).map(
                    b => b.toString(16).padStart(2, '0')).join(' '));
            }

            this.processData(array);

            this._receiveLoop();
        } catch (e) {
            this._socketLog.error(e, 'SocketHandler Disconnected');
            this.destroy();
        }
    }

    async sendMessage(packet) {
        if (!this.running)
            return;

        if (LOG_BYTES) {
            this._socketLog.bytes('➡ Sent', Array.from(packet).map(
                b => b.toString(16).padStart(2, '0')).join(' '));
        }

        this._output_queue.push(Uint8Array.from(packet));
        if (this._sending)
            return;

        this._sending = true;

        while (this._output_queue.length > 0 && this.running) {
            const buf = this._output_queue.shift();
            try {
            // eslint-disable-next-line no-await-in-loop
                await this._output_stream.write_all_async(
                    buf, GLib.PRIORITY_DEFAULT, this._cancellable, null
                );
            } catch (e) {
                this._socketLog.error(e, 'Send Message');
                this.destroy();
                this._disconnectProfileCb?.();
                break;
            }
        }

        this._sending = false;
    }

    postConnectInitialization() {
    }

    processData() {
    }

    destroy() {
        if (!this.running)
            return;

        this.running = false;
        this._cancellable.cancel();
        this._output_queue =  [];
        this._socketLog.info('Destroying socket');

        try {
            this._socket.shutdown(true, true);
        } catch (e) {
            this._socketLog.error(e, 'Error shutting down Bluetooth socket');
        }

        try {
            this._connection?.close(null);
        } catch (e) {
            this._socketLog.error(e, 'Error closing Gio.SocketConnection');
        }

        try {
            this._socket?.close();
        } catch (e) {
            this._socketLog.error(e, 'Error closing Gio.Socket');
        }
        this._connection = null;
        this._input_stream = null;
        this._output_stream = null;
        this._socket = null;
        this._profileManager.releaseFd(this._profile.type, this._devicePath, true);
    }
});

