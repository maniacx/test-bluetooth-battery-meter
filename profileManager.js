'use strict';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {createLogger} from './logger.js';

const SERVICE_PATH = '/com/github/maniacx/TestBluetoothBatteryMeter/Profile';

export const ProfileManager = GObject.registerClass({
    Signals: {
        'new-connection': {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_INT],
        },
    },
}, class ProfileManager extends GObject.Object {
    _init() {
        super._init();
        const tag = 'ProfileManager';
        this._log = createLogger(tag);
        this._systemBus = Gio.bus_get_sync(Gio.BusType.SYSTEM, null);
        this._interface = this._buildInterfaceInfo();
        this._profiles = new Map();
        this._fdByDevice = new Map();
    }

    _buildInterfaceInfo() {
        const PROFILE_IFACE = 'org.bluez.Profile1';
        const xml = `
      <node>
        <interface name="${PROFILE_IFACE}">
          <method name="Release"/>
          <method name="NewConnection">
            <arg type="o" name="device" direction="in"/>
            <arg type="h" name="fd" direction="in"/>
            <arg type="a{sv}" name="props" direction="in"/>
          </method>
          <method name="RequestDisconnection">
            <arg type="o" name="device" direction="in"/>
          </method>
        </interface>
      </node>`;
        return Gio.DBusNodeInfo.new_for_xml(xml).interfaces[0];
    }

    async registerProfile(deviceType, uuid) {
        try {
            if (this._profiles.has(deviceType))
                return;

            let registrationId;
            let proxy;

            const objectPath = `${SERVICE_PATH}/${deviceType}`;

            this._log.info(`Registering Profile manager object for ${deviceType}`);
            try {
                registrationId = this._systemBus.register_object(
                    objectPath,
                    this._interface,
                    this._onMethodCall.bind(this, deviceType),
                    null,
                    null
                );
            } catch (e) {
                this._log.error(e, `Failed to register object for ${deviceType}`);
                return;
            }

            if (registrationId <= 0) {
                this._log.info(`Failed to register object (<=0) for ${deviceType}`);
                return;
            }

            try {
                proxy = await Gio.DBusProxy.new(
                    this._systemBus,
                    Gio.DBusProxyFlags.NONE,
                    null,
                    'org.bluez',
                    '/org/bluez',
                    'org.bluez.ProfileManager1',
                    null
                );
            } catch (e) {
                this._log.error(e, `Failed to create ProfileManager1 proxy for ${deviceType}`);
                return;
            }

            const opts = {
                Name: new GLib.Variant('s', `CustomProfile-${deviceType}`),
                Role: new GLib.Variant('s', 'client'),
                AutoConnect: new GLib.Variant('b', true),
            };

            await proxy.call(
                'RegisterProfile',
                GLib.Variant.new_tuple([
                    new GLib.Variant('o', objectPath),
                    new GLib.Variant('s', uuid),
                    new GLib.Variant('a{sv}', opts),
                ]),
                Gio.DBusCallFlags.NONE,
                -1,
                null
            );

            this._profiles.set(deviceType, {
                proxy,
                objectPath,
                registrationId,
            });
        } catch (e) {
            this._log.error(e, `Error while registering profile for ${deviceType}`);
        }
    }

    unregisterProfile(deviceType) {
        try {
            const info = this._profiles.get(deviceType);
            if (!info)
                return;

            this._log.info(`Unregistering profile for ${deviceType}`);
            info.proxy.call_sync(
                'UnregisterProfile',
                GLib.Variant.new_tuple([
                    new GLib.Variant('o', info.objectPath),
                ]),
                Gio.DBusCallFlags.NONE,
                -1,
                null
            );
            this._systemBus.unregister_object(info.registrationId);
            this._profiles.delete(deviceType);
        } catch (e) {
            this._log.error(e, `Error while unregistering profile for ${deviceType}`);
        }
    }

    _onMethodCall(deviceType, conn, sender, path, iface, method, params, invocation) {
        if (method === 'Release') {
            this._log.info(`Profile Release ${deviceType}`);
            invocation.return_value(null);
            return;
        }
        if (method === 'NewConnection') {
            this._log.info(`Profile NewConnection ${deviceType}`);
            const [devicePath, fdIndex] = params.deep_unpack();
            const fdList = invocation.get_message().get_unix_fd_list();
            const fd = fdList.get(fdIndex);
            this._fdByDevice.set(devicePath, fd);
            this.emit('new-connection', devicePath, fd);
            invocation.return_value(null);
            return;
        }
        if (method === 'RequestDisconnection') {
            this._log.info(`Profile RequestDisconnection ${deviceType}`);
            const [devicePath] = params.deep_unpack();
            this._fdByDevice.delete(devicePath);
            invocation.return_value(null);
        }
    }

    getFd(devicePath) {
        return this._fdByDevice.get(devicePath) ?? -1;
    }

    deleteFD(devicePath) {
        this._fdByDevice.delete(devicePath);
    }
});

