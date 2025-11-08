'use strict';

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const currentDir = GLib.path_get_dirname(import.meta.url.replace('file://', ''));
const logDir = GLib.build_filenamev([currentDir, 'log']);
let liveLogSink = null;
let logFileStream = null;

function initLogFile() {
    try {
        const logDirFile = Gio.File.new_for_path(logDir);
        if (!logDirFile.query_exists(null))
            logDirFile.make_directory_with_parents(null);

        const timestamp = GLib.DateTime.new_now_local().format('%Y%m%d%H%M%S');
        const logFilePath = GLib.build_filenamev([logDir, `test-bbm-${timestamp}.log`]);

        const file = Gio.File.new_for_path(logFilePath);
        logFileStream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
        const header = `[${new Date().toISOString()}] Log started\n\n`;
        logFileStream.write_all(header, null);
    } catch (e) {
        print('Failed to initialize log file:', e);
    }
}

initLogFile();

export function setLiveLogSink(sinkCallback) {
    liveLogSink = sinkCallback;
}

function WriteLogLine(prefix, msg) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${prefix}: ${msg}\n \n`;

    if (liveLogSink)
        liveLogSink(line);

    try {
        if (logFileStream) {
            logFileStream.write_all(line, null);
            logFileStream.flush(null);
        }
    } catch (e) {
        print('Failed to write log line:', e);
    }

    if (line.includes('BYT') && liveLogSink)
        liveLogSink(' \n');
}

export function createLogger(tag) {
    return {
        info: (...args) => WriteLogLine('INF', `[${tag}] ${args.join(' ')}`),

        error: (err, msg = '') => {
            const text = `${msg} ${err instanceof Error ? err.stack : String(err)}`.trim();
            WriteLogLine('ERR', `[${tag}] ${text}`);
        },

        bytes: (...args) => {
            const text = `[${tag}] ${args.join(' ')}`.replace(/[\r\n]+/g, ' ').trimEnd();
            WriteLogLine('BYT', text);
        },
    };
}

export function hideMacAdddress(devicePath) {
    const match = devicePath.match(/dev_([0-9A-Fa-f_]+)/);
    if (!match)
        return devicePath;

    const mac = match[1];
    const parts = mac.split('_');
    if (parts.length === 6) {
        parts.splice(3, 3, 'XX', 'XX', 'XX');
        const obfuscatedMac = parts.join('_');
        return devicePath.replace(mac, obfuscatedMac);
    }

    return devicePath;
}

