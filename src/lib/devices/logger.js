'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const MAX_LOG_BYTES = 1024 * 1024;
const FULL_SANITIZE_LOG = true;

let _settings = null;
let LOG_ENABLED = true;

const LogDir = GLib.build_filenamev([GLib.get_user_state_dir(), 'log']);
GLib.mkdir_with_parents(LogDir, 0o755);

function getLogFiles() {
    if (!LogDir)
        throw new Error('LogDir not initialized (initContext not called yet)');

    GLib.mkdir_with_parents(LogDir, 0o755);

    const logPath = GLib.build_filenamev([LogDir, 'runtime.log']);
    const historyPath = GLib.build_filenamev([LogDir, 'runtime-old.log']);

    return {
        logFile: Gio.File.new_for_path(logPath),
        historyFile: Gio.File.new_for_path(historyPath),
    };
}

function enforceLogSizeLimit(logFile, historyFile) {
    try {
        const info = logFile.query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null);
        if (info.get_size() >= MAX_LOG_BYTES) {
            if (historyFile.query_exists(null))
                historyFile.delete(null);

            logFile.move(historyFile, Gio.FileCopyFlags.OVERWRITE, null, null);
        }
    } catch {
        // Do nothing
    }
}

function WriteLogLine(prefix, msg) {
    const {logFile, historyFile} = getLogFiles();
    enforceLogSizeLimit(logFile, historyFile);
    const line = `[${new Date().toISOString()}] ${prefix}: ${msg}\n\n`;

    const stream = logFile.append_to(Gio.FileCreateFlags.NONE, null);
    const bytes = new GLib.Bytes(line);
    stream.write_bytes(bytes, null);
    stream.flush(null);
    stream.close(null);
}

export function createLogger(tag) {
    return {
        info: (...args) => {
            if (!LOG_ENABLED)
                return;
            WriteLogLine('INF', `[${tag}] ${args.join(' ')}`);
        },

        error: (err, msg = '') => {
            const text = `${msg} ${err instanceof Error ? err.stack : String(err)}`.trim();
            WriteLogLine('ERR', `[${tag}] ${text}`);
        },

        bytes: (...args) => {
            if (!LOG_ENABLED)
                return;
            WriteLogLine('BYT', `[${tag}] ${args.join(' ')}`);
        },
    };
}

export function initLogger(settings) {
    _settings = settings;
    LOG_ENABLED = _settings.get_boolean('logging-enabled');

    _settings.connect('changed::logging-enabled', () => {
        LOG_ENABLED = _settings.get_boolean('logging-enabled');
    });
}

export function sanitizeDevPath(path) {
    return path.replace(
        /dev_(?:[0-9A-Fa-f]{2}_){5}([0-9A-Fa-f]{2})/,
        FULL_SANITIZE_LOG ? 'dev_XX_XX_XX_XX_XX_XX' : 'dev_XX_XX_XX_XX_XX_$1'
    );
}

export function getDeviceIdentifier(devicePath) {
    return FULL_SANITIZE_LOG ? 'XX' : devicePath.slice(-2);
}

