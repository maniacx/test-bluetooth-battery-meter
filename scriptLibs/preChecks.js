'use strict';

import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

function _checkGtkVersion() {
    const major = Gtk.get_major_version();
    const minor = Gtk.get_minor_version();
    const micro = Adw.get_micro_version();

    if (major < 4 || major === 4 && minor < 14) {
        throw new Error(
            `Unsupported GTK version ${major}.${minor}.${micro}. ` +
            'GTK <= 4.14 is required.'
        );
    }
}

function _checkAdwVersion() {
    const major = Adw.get_major_version();
    const minor = Adw.get_minor_version();
    const micro = Adw.get_micro_version();

    if (major < 1 || major === 1 && minor < 5
    ) {
        throw new Error(
            `Unsupported Libadwaita version ${major}.${minor}.${micro}. ` +
            'Libadwaita <= 1.5.8 is required.'
        );
    }
}

function _checkBlueZ() {
    let bus;
    try {
        bus = Gio.bus_get_sync(Gio.BusType.SYSTEM, null);
    } catch {
        throw new Error('Unable to connect to the system DBus.');
    }

    const result = bus.call_sync(
        'org.freedesktop.DBus',
        '/org/freedesktop/DBus',
        'org.freedesktop.DBus',
        'NameHasOwner',
        new GLib.Variant('(s)', ['org.bluez']),
        new GLib.VariantType('(b)'),
        Gio.DBusCallFlags.NONE,
        -1,
        null
    );

    const [hasOwner] = result.deep_unpack();

    if (!hasOwner) {
        throw new Error(
            'BlueZ is not available (org.bluez is not owned on the system DBus).'
        );
    }
}

function _checkPactl() {
    if (!GLib.find_program_in_path('pactl')) {
        throw new Error(
            '`pactl` was not found in PATH. PulseAudio or PipeWire(with Pulse) is required.'
        );
    }
}

export function runPrechecks() {
    _checkGtkVersion();
    _checkAdwVersion();
    _checkBlueZ();
    _checkPactl();
}

