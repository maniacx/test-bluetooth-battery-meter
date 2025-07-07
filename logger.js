'use strict';

let liveLogSink = null;

export function setLiveLogSink(sinkCallback) {
    liveLogSink = sinkCallback;
}

function WriteLogLine(prefix, msg) {
    if (!liveLogSink)
        return;

    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${prefix}: ${msg}\n \n`;


    liveLogSink(line);
    if (line.includes('BYT'))
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
