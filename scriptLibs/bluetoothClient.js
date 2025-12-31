import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import {getBluezDeviceProxy} from '../lib/bluezDeviceProxy.js';
import {createLogger} from '../lib/devices/logger.js';

const BLUEZ = 'org.bluez';
const OBJ_MANAGER_IFACE = 'org.freedesktop.DBus.ObjectManager';
const FD_PROPS_IFACE = 'org.freedesktop.DBus.Properties';
const DEVICE_IFACE = 'org.bluez.Device1';
// const BATTERY_IFACE = 'org.bluez.Battery1';

export const BluetoothClient = GObject.registerClass({
    Signals: {
        'devices-update': {},
        /*
        'battery-level-update': {
            param_types: [
                GObject.TYPE_STRING,
                GObject.TYPE_UCHAR,
            ],
        },
        */
    },
}, class BluetoothClient extends GObject.Object {
    _init() {
        super._init();

        this._log = createLogger('BluetoothClient');
        this._bus = Gio.DBus.system;
        this.devices = new Map();
        // this.bluezBatteryDevices = new Map();
    }

    async initClient() {
        try {
            const objManagerProxy = await Gio.DBusProxy.new_for_bus(
                Gio.BusType.SYSTEM,
                Gio.DBusProxyFlags.NONE,
                null,
                BLUEZ,
                '/',
                OBJ_MANAGER_IFACE,
                null
            );

            const rawManaged = await objManagerProxy.call(
                'GetManagedObjects',
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null
            );
            const managed = rawManaged.get_child_value(0).deepUnpack();

            for (const [path, ifaces] of Object.entries(managed)) {
                if (DEVICE_IFACE in ifaces) {
                    const props = ifaces[DEVICE_IFACE];
                    const paired = props?.Paired?.deepUnpack?.();
                    if (paired) {
                        const connected = props?.Connected?.deepUnpack?.();
                        const icon = props?.Icon?.deepUnpack?.();
                        const alias = props?.Alias?.deepUnpack?.();
                        this.devices.set(path, {connected, icon, alias});
                    }
                }
                /*
                if (BATTERY_IFACE in ifaces) {
                    const battProps = ifaces[BATTERY_IFACE];
                    const batteryLevel = battProps?.Percentage?.deepUnpack?.();
                    this.bluezBatteryDevices.set(path, batteryLevel);
                }
                */
            }

            this._bus.signal_subscribe(
                BLUEZ,
                FD_PROPS_IFACE,
                'PropertiesChanged',
                null,
                DEVICE_IFACE,
                Gio.DBusSignalFlags.NONE,
                this._onPropertiesChanged.bind(this)
            );
            /*
            this._bus.signal_subscribe(
                BLUEZ,
                FD_PROPS_IFACE,
                'PropertiesChanged',
                null,
                BATTERY_IFACE,
                Gio.DBusSignalFlags.NONE,
                this._onBattPropertiesChanged.bind(this)
            );
            */
            this._bus.signal_subscribe(
                BLUEZ,
                OBJ_MANAGER_IFACE,
                'InterfacesRemoved',
                null,
                null,
                Gio.DBusSignalFlags.NONE,
                this._onInterfacesRemoved.bind(this)
            );

            this.emit('devices-update');
        } catch (e) {
            this._log.error(e);
        }
    }

    _onInterfacesRemoved(conn, sender, path, iface, signal, params) {
        const [objPath, ifaces] = params.deepUnpack();

        // if (ifaces.includes(BATTERY_IFACE))
        //     this.bluezBatteryDevices.delete(objPath);

        if (!ifaces.includes(DEVICE_IFACE))
            return;

        // this.bluezBatteryDevices.delete(objPath);
        this.devices.delete(objPath);
        this.emit('devices-update');
    }

    _onPropertiesChanged(conn, sender, path, iface, signal, params) {
        const [ifaceName, changed] = params.deepUnpack();
        if (ifaceName !== 'org.bluez.Device1')
            return;

        if (!('Connected' in changed || 'Paired' in changed))
            return;

        const hasPath = this.devices.has(path);
        const bluezProxy = getBluezDeviceProxy(path);
        if (!bluezProxy)
            return;

        const paired = bluezProxy.Paired;
        if (!paired) {
            if (hasPath) {
                this.devices.delete(path);
                this.emit('devices-update');
            }
            return;
        }

        const connected = bluezProxy.Connected;
        const icon = bluezProxy.Icon;
        const alias = bluezProxy.Alias;

        if (!hasPath) {
            this.devices.set(path, {connected, icon, alias});
            this.emit('devices-update');
        }

        const device = this.devices.get(path);
        if (device.connected !== connected || device.icon !== icon || device.alias !== alias) {
            this.devices.set(path, {connected, icon, alias});
            this.emit('devices-update');
        }
    }
/*
    _onBattPropertiesChanged(conn, sender, path, iface, signal, params) {
        const [ifaceName, changed] = params.deepUnpack();
        if (ifaceName === 'org.bluez.Battery1' && 'Percentage' in changed) {
            const battLevel = changed.Percentage.deepUnpack();
            this.bluezBatteryDevices.set(path, battLevel);
            this.emit('battery-level-update', path, battLevel);
        }
    }
*/
});

