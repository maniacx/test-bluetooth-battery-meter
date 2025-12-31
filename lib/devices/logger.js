'use strict';

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const currentDir = GLib.path_get_dirname(import.meta.url.replace('file://', ''));
const twoUp = GLib.build_pathv('/', [
    currentDir,
    '..',
    '..',
]);
const normalizedTwoUp = GLib.path_get_dirname(GLib.build_filenamev([twoUp, 'x']));

const logDir = GLib.build_filenamev([normalizedTwoUp, 'log']);
let liveLogSink = null;
let logFileStream = null;

function pruneOldLogs(maxFiles = 10) {
    try {
        const dir = Gio.File.new_for_path(logDir);

        if (!dir.query_exists(null))
            return;

        const enumerator = dir.enumerate_children(
            'standard::name,standard::type',
            Gio.FileQueryInfoFlags.NONE,
            null
        );

        let info;
        const logFiles = [];

        while ((info = enumerator.next_file(null)) !== null) {
            if (info.get_file_type() !== Gio.FileType.REGULAR)
                continue;

            const name = info.get_name();
            if (!name.startsWith('bec-') || !name.endsWith('.log'))
                continue;

            logFiles.push(name);
        }

        enumerator.close(null);

        logFiles.sort();

        const excess = logFiles.length - (maxFiles - 1);
        if (excess <= 0)
            return;

        for (let i = 0; i < excess; i++) {
            const file = dir.get_child(logFiles[i]);
            try {
                file.delete(null);
            } catch (e) {
                print(`Failed to delete old log ${logFiles[i]}:`, e);
            }
        }
    } catch (e) {
        print('Failed to prune old logs:', e);
    }
}


function initLogFile() {
    try {
        const logDirFile = Gio.File.new_for_path(logDir);
        if (!logDirFile.query_exists(null))
            logDirFile.make_directory_with_parents(null);

        pruneOldLogs(10);

        const timestamp = GLib.DateTime.new_now_local().format('%Y%m%d%H%M%S');
        const logFilePath = GLib.build_filenamev([logDir, `bec-${timestamp}.log`]);

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

