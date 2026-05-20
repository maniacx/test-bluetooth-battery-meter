'use strict';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {createLogger} from '../lib/devices/logger.js';
import {getBluezDeviceProxy} from '../lib/bluezDeviceProxy.js';

const DEVICE_INTERFACE_NAME = 'io.github.maniacx.BudsLink.Device';
const MANAGER_INTERFACE_NAME = 'io.github.maniacx.BudsLink.DeviceManager';
const SERVICE_VERSION = '0.0.1';
const STATE_UPDATE_INTERVAL = 200; // msecs
const HEARTBEAT_INTERVAL = 120; // secs. Widget should use this as Heartbeat Interval
const SERVICE_HEARTBEAT_INTERVAL = HEARTBEAT_INTERVAL + 15;

function loadIntrospectionXML(alias) {
    const resourcePath = `/io/github/maniacx/BudsLink/${alias}`;
    const bytes = Gio.resources_lookup_data(resourcePath, Gio.ResourceLookupFlags.NONE);
    return new TextDecoder().decode(bytes.toArray());
}

const DEVICE_INTROSPECTION_XML  = loadIntrospectionXML('io.github.maniacx.BudsLink.Device.xml');
const MANAGER_INTROSPECTION_XML =
    loadIntrospectionXML('io.github.maniacx.BudsLink.DeviceManager.xml');


const Device = GObject.registerClass(
class Device extends GObject.Object {
    _init(connection, devicePath, objectPath, dataHandler) {
        super._init();

        this._log = createLogger(`Device-${devicePath.split('/').slice(-1)}`);
        this._objectPath = objectPath;
        this._dataHandler = dataHandler;

        this._connection = connection;
        this._registrationId = 0;
        this._stateDebounceId = 0;

        this._bluezDeviceProxy = getBluezDeviceProxy(devicePath);

        this._alias = this._bluezDeviceProxy.Alias;

        this._bluezAliasId = this._bluezDeviceProxy.connect('g-properties-changed', () => {
            const  alias = this._bluezDeviceProxy.Alias;
            if (this._alias !== alias) {
                this._alias = alias;
                this._emitPropertiesChanged({
                    Alias: new GLib.Variant('s', this._alias),
                });
            }
        });

        this._config = dataHandler.getConfig();
        this._state  = dataHandler.getProps();

        const introspection = Gio.DBusNodeInfo.new_for_xml(DEVICE_INTROSPECTION_XML);
        const ifaceInfo = introspection.lookup_interface(DEVICE_INTERFACE_NAME);

        this._registrationId = this._connection.register_object(
            objectPath,
            ifaceInfo,
            this._onMethodCall.bind(this),
            this._onGetProperty.bind(this),
            null
        );

        this._configChangedId = dataHandler.connect('configuration-changed', () =>
            this._onConfigChanged());

        this._propsChangedId = dataHandler.connect('properties-changed', () =>
            this._onPropsChanged());
    }

    _onMethodCall(conn, sender, objectPath, ifaceName, methodName, parameters, invocation) {
        if (ifaceName !== DEVICE_INTERFACE_NAME)
            return;

        if (methodName === 'UiAction') {
            const [actionName, value] = parameters.deepUnpack();

            this._dataHandler?.emitUIAction(actionName, value);

            invocation.return_value(null);
            return;
        }

        invocation.return_value(null);
    }

    _onGetProperty(conn, sender, objectPath, ifaceName, propertyName) {
        if (ifaceName !== DEVICE_INTERFACE_NAME)
            return null;

        switch (propertyName) {
            case 'Alias':
                return GLib.Variant.new_string(this._alias);

            case 'Config':
                return GLib.Variant.new_string(JSON.stringify(this._config));

            case 'State':
                return GLib.Variant.new_string(JSON.stringify(this._state));

            default:
                return null;
        }
    }

    _onConfigChanged() {
        this._config = this._dataHandler.getConfig();

        this._emitPropertiesChanged({
            Config: GLib.Variant.new_string(JSON.stringify(this._config)),
        });
    }

    _onPropsChanged() {
        this._state = this._dataHandler.getProps();

        if (this._stateDebounceId)
            return;

        this._stateDebounceId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, STATE_UPDATE_INTERVAL, () => {
                this._emitPropertiesChanged({
                    State: GLib.Variant.new_string(
                        JSON.stringify(this._state)
                    ),
                });

                this._stateDebounceId = 0;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _emitPropertiesChanged(changedProps) {
        this._connection.emit_signal(
            null,
            this._objectPath,
            'org.freedesktop.DBus.Properties',
            'PropertiesChanged',
            GLib.Variant.new('(sa{sv}as)', [
                DEVICE_INTERFACE_NAME,
                changedProps,
                [],
            ])
        );
    }

    destroy() {
        if (this._bluezAliasId && this._bluezDeviceProxy)
            this._bluezDeviceProxy.disconnect(this._bluezAliasId);
        this._bluezAliasId = null;
        this._bluezDeviceProxy = null;

        if (this._configChangedId && this._dataHandler)
            this._dataHandler.disconnect(this._configChangedId);
        this._configChangedId = null;

        if (this._propsChangedId && this._dataHandler)
            this._dataHandler.disconnect(this._propsChangedId);
        this._propsChangedId = null;

        if (this._stateDebounceId) {
            GLib.source_remove(this._stateDebounceId);
            this._stateDebounceId = null;
        }

        if (this._registrationId && this._connection) {
            this._connection.unregister_object(this._registrationId);
            this._registrationId = 0;
        }

        this._connection = null;
        this._dataHandler = null;
    }
});


export const DbusService = GObject.registerClass(
class DbusService extends GObject.Object {
    _init(connection, objectPath, holdServiceCb, releaseServiceCb) {
        super._init();
        this._log = createLogger('DbusService');
        this._connection = connection;
        this._deviceMap = new Map();
        this._holders = new Map();
        this._holdServiceCb = holdServiceCb;
        this._releaseServiceCb = releaseServiceCb;

        const introspection = Gio.DBusNodeInfo.new_for_xml(MANAGER_INTROSPECTION_XML);
        this._ifaceInfo = introspection.lookup_interface(MANAGER_INTERFACE_NAME);

        connection.register_object(
            objectPath,
            this._ifaceInfo,
            this._onMethodCall.bind(this),
            this._onGetProperty.bind(this),
            null
        );
    }

    _onMethodCall(conn, sender, objectPath, ifaceName, methodName, parameters, invocation) {
        if (ifaceName !== MANAGER_INTERFACE_NAME)
            return;

        if (methodName === 'HoldService') {
            const [clientId] = parameters.deepUnpack();
            if (!clientId) {
                invocation.return_value(null);
                return;
            }

            if (this._holders.has(clientId)) {
                const id = this._holders.get(clientId);
                this._holders.delete(clientId);
                GLib.source_remove(id);
            } else if (this._holders.size === 0) {
                this._holdServiceCb();
            }

            const timerId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                SERVICE_HEARTBEAT_INTERVAL,
                () => {
                    this._holders.delete(clientId);
                    if (this._holders.size === 0)
                        this._releaseServiceCb();
                    return GLib.SOURCE_REMOVE;
                }
            );

            this._holders.set(clientId, timerId);
            this._log.info(`HoldService: client ${clientId}, holders=${this._holders.size}`);

            invocation.return_value(null);
        } else if (methodName === 'ReleaseService') {
            const [clientId] = parameters.deepUnpack();
            if (!clientId || !this._holders.has(clientId)) {
                invocation.return_value(null);
                return;
            }

            const id = this._holders.get(clientId);
            this._holders.delete(clientId);
            GLib.source_remove(id);

            this._log.info(`ReleaseService: client ${clientId}, holders=${this._holders.size}`);

            if (this._holders.size === 0)
                this._releaseServiceCb();

            invocation.return_value(null);
        } else if (methodName === 'ServiceVersion') {
            invocation.return_value(GLib.Variant.new('(s)', [SERVICE_VERSION]));
        } else if (methodName === 'ListDevices') {
            const devices = [...this._deviceMap.values()].map(v => v.objectPath);
            invocation.return_value(GLib.Variant.new('(ao)', [devices]));
        } else {
            invocation.return_value(null);
        }
    }

    _onGetProperty(_conn, _sender, _objectPath, _ifaceName, _propertyName) {
        return null;
    }

    addDevice(devicePath, dataHandler) {
        if (this._deviceMap.has(devicePath))
            return;

        if (!this._connection)
            return;

        const parts = devicePath.split('/');
        const adapter = parts[3];
        const deviceId = parts[4];

        if (!adapter || !deviceId)
            return;

        const objectPath = `/io/github/maniacx/BudsLink/Devices/${adapter}/${deviceId}`;
        const device = new Device(this._connection, devicePath, objectPath, dataHandler);
        this._deviceMap.set(devicePath, {objectPath, device});

        this._connection.emit_signal(
            null,
            '/io/github/maniacx/BudsLink',
            MANAGER_INTERFACE_NAME,
            'DeviceAdded',
            GLib.Variant.new('(o)', [objectPath])
        );

        this._log.info(`Device added: ${this._safeDevicePath(objectPath)}`);
    }

    removeDevice(devicePath) {
        if (!this._deviceMap.has(devicePath))
            return;

        const {objectPath, device} = this._deviceMap.get(devicePath);
        device.destroy();
        this._deviceMap.delete(devicePath);

        this._connection?.emit_signal(
            null,
            '/io/github/maniacx/BudsLink',
            MANAGER_INTERFACE_NAME,
            'DeviceRemoved',
            GLib.Variant.new('(o)', [objectPath])
        );

        this._log.info(`Device removed: ${this._safeDevicePath(objectPath)}`);
    }

    _safeDevicePath(path) {
        return path.replace(
            /dev_([0-9A-Fa-f]{2}_){5}[0-9A-Fa-f]{2}/,
            'dev_XX_XX_XX_XX_XX_XX'
        );
    }

    destroy() {
        for (const {device} of this._deviceMap.values())
            device.destroy();

        this._deviceMap.clear();

        for (const timerId of this._holders.values())
            GLib.source_remove(timerId);

        this._holders.clear();

        if (this._registrationId && this._connection) {
            this._connection.unregister_object(this._registrationId);
            this._registrationId = 0;
        }

        this._connection = null;
    }
});
