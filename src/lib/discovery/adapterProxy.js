'use strict';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const BLUEZ = 'org.bluez';
const DEVICE_IFACE = 'org.bluez.Device1';
const PROPS_IFACE = 'org.freedesktop.DBus.Properties';

const AdapterXml = `
<node><interface name="org.bluez.Adapter1">
  <method name="StartDiscovery"/>
  <method name="StopDiscovery"/>
  <method name="SetDiscoveryFilter"><arg name="filter" type="a{sv}" direction="in"/></method>
</interface></node>`;
const AdapterProxy = Gio.DBusProxy.makeProxyWrapper(AdapterXml);

export function getAdapterProxy(path = '/org/bluez/hci0') {
    return new AdapterProxy(Gio.DBus.system, BLUEZ, path);
}

// Restrict discovery to what Quick Pair needs: both transports, keep advert
// updates flowing (DuplicateData), and let BlueZ pre-drop weak signals.
export async function setDiscoveryFilter(adapter, rssi = -70) {
    // The proxy-wrapper method marshals its a{sv} argument itself, so pass a plain
    // object whose values are variants (the `v`); do NOT pre-wrap in GLib.Variant.
    await adapter.SetDiscoveryFilterAsync({
        Transport: GLib.Variant.new_string('auto'),
        DuplicateData: GLib.Variant.new_boolean(true),
        RSSI: GLib.Variant.new_int16(rssi),
    });
}

// Pair (Just Works for buds), connect, then trust so it auto-connects later.
export async function pairAndConnect(devicePath) {
    const conn = Gio.DBus.system;
    await conn.call(BLUEZ, devicePath, DEVICE_IFACE, 'Pair', null, null,
        Gio.DBusCallFlags.NONE, 60000, null);
    await conn.call(BLUEZ, devicePath, DEVICE_IFACE, 'Connect', null, null,
        Gio.DBusCallFlags.NONE, 30000, null);
    await conn.call(BLUEZ, devicePath, PROPS_IFACE, 'Set',
        new GLib.Variant('(ssv)', [DEVICE_IFACE, 'Trusted', GLib.Variant.new_boolean(true)]),
        null, Gio.DBusCallFlags.NONE, 5000, null);
}
