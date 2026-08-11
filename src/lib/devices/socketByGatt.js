'use strict';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {createLogger, getDeviceIdentifier, sanitizeDevPath} from './logger.js';

const LOG_BYTES = true;

const BLUEZ_NAME = 'org.bluez';
const ADAPTER_IFACE = 'org.bluez.Adapter1';
const DEVICE_IFACE = 'org.bluez.Device1';
const CHRC_IFACE = 'org.bluez.GattCharacteristic1';
const PROPS_IFACE = 'org.freedesktop.DBus.Properties';
const OBJMAN_IFACE = 'org.freedesktop.DBus.ObjectManager';

const DISCOVERY_TIMEOUT_MS = 30000;
const DISCOVERY_POLL_MS = 1000;
const RESOLVE_TIMEOUT_MS = 15000;

/**
 * Transport for devices whose control channel is BLE GATT rather than RFCOMM.
 *
 * Mirrors the surface of SocketHandler (socketByProfile.js) so vendor sockets can
 * subclass either one: startSocket(), sendMessage(), processData(),
 * postConnectInitialization(), destroy().
 *
 * Some vendors expose the control service on a *separate* BLE address from the
 * classic BR/EDR device that carries audio (Edifier, for example, advertises
 * "EDIFIER BLE" on an address that differs from the A2DP one only in the third
 * octet). The peer is therefore located by matching the trailing octets of the
 * classic address, then confirmed by advertised service UUID or name prefix.
 */
export const GattHandler = GObject.registerClass({
    GTypeName: 'BudsLink_GattHandler',
}, class GattHandler extends GObject.Object {
    /**
     * @param {string} devicePath BlueZ object path of the classic (audio) device
     * @param {object} gattProfile transport description
     * @param {string} gattProfile.type vendor type tag, used for logging
     * @param {string[]} gattProfile.serviceUuids advertised UUIDs identifying the peer
     * @param {string} gattProfile.writeUuid characteristic written to
     * @param {string[]} gattProfile.notifyUuids characteristics subscribed to
     * @param {number} [gattProfile.manufacturerId] company id whose advertisement
     *     begins with the classic address, giving an exact peer match
     * @param {string} [gattProfile.peerNamePrefix] fallback name match
     */
    _init(devicePath, gattProfile) {
        super._init();
        const subclassName = this.constructor.name;
        const identifier = getDeviceIdentifier(devicePath);
        this._socketLog = createLogger(`GattHandler-${subclassName}-${identifier}`);
        this._devicePath = devicePath;
        this._profile = gattProfile;
        this.running = false;
        this._cancellable = new Gio.Cancellable();
        this._output_queue = [];
        this._sending = false;
        this._notifyProxies = [];
        this._notifyIds = [];
        this._writeProxy = null;
        this._peerPath = null;
        this._discovering = false;

        /* Populated from the peer's advertisement when available. Vendors use these
           to pick a protocol variant instead of guessing. */
        this.peerManufacturerData = null;
    }

    async startSocket() {
        try {
            this._bus = Gio.DBus.system;

            const peerPath = await this._findPeer();
            if (!peerPath) {
                this._socketLog.info(
                    `No GATT peer found for ${sanitizeDevPath(this._devicePath)}`);
                return;
            }
            this._peerPath = peerPath;
            this._socketLog.info(`Using GATT peer ${sanitizeDevPath(peerPath)}`);

            if (!await this._connectPeer(peerPath))
                return;

            if (!await this._resolveCharacteristics(peerPath))
                return;

            this.running = true;

            await this._startNotify();
            await this.postConnectInitialization();
        } catch (e) {
            this._socketLog.error(e, 'Error starting GATT transport');
            this.destroy();
        }
    }

    /* ---------------------------------------------------------------- peer */

    async _getManagedObjects() {
        const reply = await this._bus.call(
            BLUEZ_NAME, '/', OBJMAN_IFACE, 'GetManagedObjects',
            null, new GLib.VariantType('(a{oa{sa{sv}}})'),
            Gio.DBusCallFlags.NONE, -1, this._cancellable);
        return reply.deepUnpack()[0];
    }

    _addressFromPath(path) {
        const match = /dev_([0-9A-Fa-f_]+)$/.exec(path);
        if (!match)
            return null;
        return match[1].replaceAll('_', ':').toUpperCase();
    }

    _manufacturerData(props) {
        const raw = props['ManufacturerData']?.deepUnpack?.();
        if (!raw)
            return null;

        return Object.fromEntries(Object.entries(raw).map(
            ([id, v]) => [id, Array.from(v.deepUnpack?.() ?? v)]));
    }

    /* Vendors that embed the classic address in their advertisement give an exact
       pairing between the LE peer and the audio device. Edifier puts it in the
       first six bytes of its manufacturer data. */
    _mfgClaimsAddress(mfg, classicAddr) {
        const idKey = this._profile.manufacturerId;
        if (idKey === undefined || !mfg)
            return false;

        const data = mfg[idKey];
        if (!data || data.length < 6)
            return false;

        const claimed = data.slice(0, 6)
            .map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase();

        return claimed === classicAddr;
    }

    _isCandidate(props) {
        const classicAddr = this._addressFromPath(this._devicePath);
        if (!classicAddr)
            return false;

        const addr = props['Address']?.deepUnpack?.() ?? props['Address'];
        if (!addr || addr.toUpperCase() === classicAddr)
            return false;

        const mfg = this._manufacturerData(props);
        if (this._mfgClaimsAddress(mfg, classicAddr))
            return true;

        /* Fallback for peers that do not advertise the audio address: the same
           earbuds keep the trailing octets and vary only the vendor octets. */
        const tail = a => a.toUpperCase().split(':').slice(3).join(':');
        if (tail(addr) !== tail(classicAddr))
            return false;

        const uuids = props['UUIDs']?.deepUnpack?.() ?? [];
        const wanted = (this._profile.serviceUuids ?? []).map(u => u.toLowerCase());
        if (uuids.some(u => wanted.includes(u.toLowerCase())))
            return true;

        const name = props['Name']?.deepUnpack?.() ?? props['Name'] ?? '';
        const prefix = this._profile.peerNamePrefix;
        return !!prefix && name.toUpperCase().startsWith(prefix.toUpperCase());
    }

    async _scanForPeer() {
        const objects = await this._getManagedObjects();
        for (const [path, ifaces] of Object.entries(objects)) {
            const props = ifaces[DEVICE_IFACE];
            if (!props)
                continue;

            if (this._isCandidate(props)) {
                this.peerManufacturerData = this._manufacturerData(props);
                return path;
            }
        }
        return null;
    }

    async _setDiscovery(enable) {
        const adapterPath = this._devicePath.split('/').slice(0, 4).join('/');
        try {
            if (enable) {
                await this._bus.call(
                    BLUEZ_NAME, adapterPath, ADAPTER_IFACE, 'SetDiscoveryFilter',
                    new GLib.Variant('(a{sv})',
                        [{'Transport': new GLib.Variant('s', 'le')}]),
                    null, Gio.DBusCallFlags.NONE, -1, this._cancellable);
            }

            await this._bus.call(
                BLUEZ_NAME, adapterPath, ADAPTER_IFACE,
                enable ? 'StartDiscovery' : 'StopDiscovery',
                null, null, Gio.DBusCallFlags.NONE, -1, this._cancellable);

            this._discovering = enable;
        } catch (e) {
            /* Another client may already be discovering; that is fine for us. */
            this._socketLog.info(
                `Discovery ${enable ? 'start' : 'stop'} failed: ${e.message}`);
        }
    }

    async _findPeer() {
        let peer = await this._scanForPeer();
        if (peer)
            return peer;

        /* The LE peer often only advertises in short windows, so drive discovery
           ourselves and poll until it shows up. */
        this._socketLog.info('GATT peer not yet visible — starting LE discovery');
        await this._setDiscovery(true);

        const deadline = GLib.get_monotonic_time() + DISCOVERY_TIMEOUT_MS * 1000;
        while (GLib.get_monotonic_time() < deadline && !this._cancellable.is_cancelled()) {
            // eslint-disable-next-line no-await-in-loop
            await this._sleep(DISCOVERY_POLL_MS);
            // eslint-disable-next-line no-await-in-loop
            peer = await this._scanForPeer();
            if (peer)
                break;
        }

        await this._setDiscovery(false);
        return peer;
    }

    _sleep(ms) {
        return new Promise(resolve => {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
                resolve();
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    async _getProperty(path, iface, name) {
        try {
            const reply = await this._bus.call(
                BLUEZ_NAME, path, PROPS_IFACE, 'Get',
                new GLib.Variant('(ss)', [iface, name]),
                new GLib.VariantType('(v)'),
                Gio.DBusCallFlags.NONE, -1, this._cancellable);
            return reply.deepUnpack()[0].deepUnpack();
        } catch {
            return null;
        }
    }

    async _connectPeer(peerPath) {
        const connected = await this._getProperty(peerPath, DEVICE_IFACE, 'Connected');
        if (!connected) {
            try {
                await this._bus.call(
                    BLUEZ_NAME, peerPath, DEVICE_IFACE, 'Connect',
                    null, null, Gio.DBusCallFlags.NONE, 40000, this._cancellable);
            } catch (e) {
                this._socketLog.error(e, 'GATT peer Connect failed');
                return false;
            }
        }

        const deadline = GLib.get_monotonic_time() + RESOLVE_TIMEOUT_MS * 1000;
        while (GLib.get_monotonic_time() < deadline && !this._cancellable.is_cancelled()) {
            // eslint-disable-next-line no-await-in-loop
            const resolved = await this._getProperty(
                peerPath, DEVICE_IFACE, 'ServicesResolved');
            if (resolved)
                return true;
            // eslint-disable-next-line no-await-in-loop
            await this._sleep(500);
        }

        this._socketLog.info('GATT services were not resolved in time');
        return false;
    }

    /* ------------------------------------------------------- characteristics */

    async _resolveCharacteristics(peerPath) {
        const objects = await this._getManagedObjects();
        const notifyWanted = (this._profile.notifyUuids ?? []).map(u => u.toLowerCase());
        const writeWanted = this._profile.writeUuid?.toLowerCase();
        const notifyPaths = [];
        let writePath = null;

        for (const [path, ifaces] of Object.entries(objects)) {
            if (!path.startsWith(`${peerPath}/`))
                continue;

            const props = ifaces[CHRC_IFACE];
            if (!props)
                continue;

            const uuid = (props['UUID']?.deepUnpack?.() ?? '').toLowerCase();
            if (uuid === writeWanted)
                writePath = path;

            if (notifyWanted.includes(uuid))
                notifyPaths.push(path);
        }

        if (!writePath) {
            this._socketLog.info(
                `Write characteristic ${this._profile.writeUuid} not found`);
            return false;
        }

        this._writeProxy = await Gio.DBusProxy.new(
            this._bus, Gio.DBusProxyFlags.NONE, null,
            BLUEZ_NAME, writePath, CHRC_IFACE, this._cancellable);

        for (const path of notifyPaths) {
            // eslint-disable-next-line no-await-in-loop
            const proxy = await Gio.DBusProxy.new(
                this._bus, Gio.DBusProxyFlags.NONE, null,
                BLUEZ_NAME, path, CHRC_IFACE, this._cancellable);
            this._notifyProxies.push(proxy);
        }

        return this._notifyProxies.length > 0;
    }

    async _startNotify() {
        for (const proxy of this._notifyProxies) {
            const id = proxy.connect('g-properties-changed', (p, changed) => {
                const value = changed.lookup_value('Value', null);
                if (!value)
                    return;

                const array = value.deepUnpack();
                if (!array || array.length === 0)
                    return;

                if (LOG_BYTES) {
                    this._socketLog.bytes('⬅ Received:', Array.from(array).map(
                        b => b.toString(16).padStart(2, '0')).join(' '));
                }

                try {
                    this.processData(Uint8Array.from(array));
                } catch (e) {
                    this._socketLog.error(e, 'Error processing GATT notification');
                }
            });
            this._notifyIds.push(id);

            try {
                // eslint-disable-next-line no-await-in-loop
                await proxy.call('StartNotify', null,
                    Gio.DBusCallFlags.NONE, 5000, this._cancellable);
            } catch (e) {
                this._socketLog.error(e, 'StartNotify failed');
            }
        }
    }

    /* ---------------------------------------------------------------- io */

    async sendMessage(packet) {
        if (!this.running || !this._writeProxy)
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
                await this._writeProxy.call('WriteValue',
                    new GLib.Variant('(aya{sv})', [
                        Array.from(buf),
                        {'type': new GLib.Variant('s', 'command')},
                    ]),
                    Gio.DBusCallFlags.NONE, 5000, this._cancellable);
            } catch (e) {
                this._socketLog.error(e, 'Send Message');
                this.destroy();
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
        if (this._destroyed)
            return;

        this._destroyed = true;
        this.running = false;
        this._output_queue = [];
        this._socketLog.info('Destroying GATT transport');

        this._notifyProxies.forEach((proxy, i) => {
            if (this._notifyIds[i])
                proxy.disconnect(this._notifyIds[i]);

            proxy.call('StopNotify', null, Gio.DBusCallFlags.NONE, 2000, null)
                .catch(e => this._socketLog.info(`StopNotify failed: ${e.message}`));
        });

        this._notifyProxies = [];
        this._notifyIds = [];
        this._writeProxy = null;

        if (this._discovering)
            this._setDiscovery(false);

        this._cancellable.cancel();
    }
});
