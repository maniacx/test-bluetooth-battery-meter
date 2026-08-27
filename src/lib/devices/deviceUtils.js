'use strict';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {createConfigureWindow} from '../../appLibs/confirueWindowlauncher.js';

export const SppUUidType = 'serial';
export const SppUUid = '00001101-0000-1000-8000-00805f9b34fb';

export function booleanFromByte(val) {
    switch (val) {
        case 0x00:
            return false;
        case 0x01:
            return true;
        default:
            return null;
    }
}

export function isValidByte(val, enumObj) {
    return Object.values(enumObj).includes(val);
}

export function isArrayEqual(a, b) {
    if (a === b)
        return true;

    if (!a || !b)
        return false;

    if (a.length !== b.length)
        return false;

    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i])
            return false;
    }

    return true;
}

export function bytesToHex(bytes) {
    if (!bytes || bytes.length === 0)
        return '';

    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
    if (!hex || hex.length === 0 || hex.length % 2 !== 0)
        return [];

    const bytes = [];

    for (let i = 0; i < hex.length; i += 2)
        bytes.push(parseInt(hex.slice(i, i + 2), 16));

    return bytes;
}

export function buds2to1BatteryLevel(battProps) {
    const bat1 = battProps.battery1Level;
    const bat2 = battProps.battery2Level;
    const status1 = battProps.battery1Status;
    const status2 = battProps.battery2Status;
    const isInvalid = level => level === null || level === undefined || level === 0;
    if (status1 === 'charging' && !isInvalid(bat1) && isInvalid(bat2))
        return bat1;

    if (status2 === 'charging' && !isInvalid(bat2) && isInvalid(bat1))
        return bat2;

    if (status1 === 'charging' && status2 !== 'charging')
        return isInvalid(bat2) ? 0 : bat2;

    if (status2 === 'charging' && status1 !== 'charging')
        return isInvalid(bat1) ? 0 : bat1;

    if (isInvalid(bat1) && isInvalid(bat2))
        return 0;

    if (isInvalid(bat1))
        return bat2;

    if (isInvalid(bat2))
        return bat1;

    return bat1 < bat2 ? bat1 : bat2;
}

export function validateProperties(settings, settingsKey, devicesList, defaults, devicePath) {
    const device = devicesList.find(d => d.path === devicePath);
    if (!device)
        return;

    let changed = false;

    for (const key of Object.keys(device)) {
        if (!(key in defaults)) {
            delete device[key];
            changed = true;
        }
    }

    for (const [key, value] of Object.entries(defaults)) {
        if (!(key in device)) {
            device[key] = value;
            changed = true;
        }
    }

    if (changed) {
        settings.set_strv(
            settingsKey,
            devicesList.map(d => JSON.stringify(d))
        );
    }
}

export async function getAdapterMac(devicePath) {
    try {
        const adapterPath = devicePath.split('/dev_')[0];

        const connection = await Gio.bus_get(
            Gio.BusType.SYSTEM,
            null
        );

        const result = await connection.call(
            'org.bluez',
            adapterPath,
            'org.freedesktop.DBus.Properties',
            'Get',
            new GLib.Variant('(ss)', [
                'org.bluez.Adapter1',
                'Address',
            ]),
            new GLib.VariantType('(v)'),
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );

        return result.deepUnpack()[0].deepUnpack();
    } catch {
        return null;
    }
}


const _openConfigureWindows = new Map();

export function launchConfigureWindow(path, type) {
    if (_openConfigureWindows.has(path)) {
        _openConfigureWindows.get(path).present();
        return;
    }

    const win = createConfigureWindow({
        devicePath: path,
        deviceType: type,
    });

    if (!win)
        return;

    _openConfigureWindows.set(path, win);

    win.connect('close-request', () => {
        _openConfigureWindows.delete(path);
    });


    win?.present();
}
