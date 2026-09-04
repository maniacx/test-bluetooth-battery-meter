'use strict';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {getBluezDeviceProxy} from '../bluezDeviceProxy.js';
import {getAdapterProxy, setDiscoveryFilter} from './adapterProxy.js';
import {parseAdvert} from './advertParsers.js';
import {shouldNotify} from './discoveryUtils.js';
import {createLogger} from '../devices/logger.js';

const BLUEZ = 'org.bluez';
const OBJ_MANAGER_IFACE = 'org.freedesktop.DBus.ObjectManager';
const DEVICE_IFACE = 'org.bluez.Device1';
const PROPS_IFACE = 'org.freedesktop.DBus.Properties';

// Convert a BlueZ a{qv}/a{sv} property (or its deepUnpack) into
// Map<number|string, Uint8Array> as the parsers expect.
function unpackVariantMap(v) {
    const out = new Map();
    if (!v) return out;
    const obj = v.deepUnpack?.() ?? v;
    for (const [k, val] of Object.entries(obj)) {
        const bytes = val?.deepUnpack?.() ?? val;
        const key = isNaN(Number(k)) ? String(k).toLowerCase() : Number(k);
        out.set(key, Uint8Array.from(bytes));
    }
    return out;
}

export const QuickPairScanner = GObject.registerClass({
    Signals: {'candidate-found': {param_types: [GObject.TYPE_JSOBJECT]}},
}, class QuickPairScanner extends GObject.Object {
    _init(opts = {}) {
        super._init();
        this._log = createLogger('QuickPairScanner');
        this._bus = Gio.DBus.system;
        this._aggressive = !!opts.aggressive;
        this._seen = new Map();
        this._active = false;
    }

    async start() {
        if (this._active)
            return;
        try {
            this._adapter = getAdapterProxy();
            await setDiscoveryFilter(this._adapter, -70);
            this._addedId = this._bus.signal_subscribe(BLUEZ, OBJ_MANAGER_IFACE,
                'InterfacesAdded', null, null, Gio.DBusSignalFlags.NONE,
                this._onInterfacesAdded.bind(this));
            this._changedId = this._bus.signal_subscribe(BLUEZ, PROPS_IFACE,
                'PropertiesChanged', null, DEVICE_IFACE, Gio.DBusSignalFlags.NONE,
                this._onPropsChanged.bind(this));
            await this._adapter.StartDiscoveryAsync();
            this._active = true;
            this._log.info('discovery started');
        } catch (e) {
            this._log.error(e);
        }
    }

    _evaluate(path) {
        try {
            const p = getBluezDeviceProxy(path);
            if (p.Paired)
                return;
            const advert = {
                manufacturerData: unpackVariantMap(p.ManufacturerData),
                serviceData: unpackVariantMap(p.ServiceData),
                class: p.Class ?? null,
                name: p.Name ?? p.Alias ?? null,
                rssi: p.RSSI ?? null,
            };
            const cand = parseAdvert(advert, {aggressive: this._aggressive});
            if (!cand)
                return;
            const now = GLib.get_monotonic_time() / 1e6;
            // Dedup by name so one physical device that advertises on both its LE
            // and BR/EDR addresses (e.g. Galaxy Buds: swiftpair + samsung) only
            // notifies once.
            if (!shouldNotify(this._seen, cand.name || path, now))
                return;
            this._log.info(`candidate ${cand.kind} name=${cand.name}`);
            this.emit('candidate-found', {path, ...cand});
        } catch (e) {
            this._log.error(e);
        }
    }

    _onInterfacesAdded(_c, _s, _p, _i, _sig, params) {
        const [objPath, ifaces] = params.deepUnpack();
        if (DEVICE_IFACE in ifaces)
            this._evaluate(objPath);
    }

    _onPropsChanged(_c, _s, path) {
        this._evaluate(path);
    }

    stop() {
        if (!this._active)
            return;
        try {
            this._adapter?.StopDiscoveryAsync?.();
        } catch (e) {
            this._log.error(e);
        }
        if (this._addedId) {
            this._bus.signal_unsubscribe(this._addedId);
            this._addedId = null;
        }
        if (this._changedId) {
            this._bus.signal_unsubscribe(this._changedId);
            this._changedId = null;
        }
        this._active = false;
        this._log.info('discovery stopped');
    }

    clearSeen(path) {
        this._seen.delete(path);
    }

    destroy() {
        this.stop();
        this._seen.clear();
        this._adapter = null;
        this._bus = null;
    }
});
