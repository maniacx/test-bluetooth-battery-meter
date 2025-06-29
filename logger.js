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

