'use strict';

export default {
    name: 'OnePlus Buds Z2',
    type: 'oneplus',
    id: {
        vid: [0x5A4D],
        pid: [0xFFF1, 0xFFF2],
    },

    batteryMutiple: true,
    batteryCase: true,

    eqPreset: {
        balanced: 0x0B,
        treblePlus: 0x0D,
        serenade: 0x0E,
        bassPlus: 0x0C,
    },

    noiseControl: {
        off: [0x01],
        transparency: [0x04],
        noiseCancellation: {
            levels: {
                low: [0x40],
                mid: [0x20],
                high: [0x40],
            },
        },
    },

    inEarDetection: true,
    ring: true,

    gestureOptions: {
        positions: {
            left: 0x01,
            right: 0x02,
            both: 0x04,
        },
        gestureTypes: {
            'single': 0x01,
            'double': 0x02,
            'triple': 0x03,
            'action-hold': 0x04,
            'long-action-hold': 0x06,
        },
        gestures: {
            'single': {
                type: 'press',
                actions: {
                    'no-action': 0x00,
                    'play-pause': 0x01,
                },
            },
            'double': {
                type: 'press',
                actions: {
                    'no-action': 0x00,
                    'play-pause': 0x01,
                    'skip-back': 0x05,
                    'skip-forward': 0x06,
                    'voice-assitant': 0x03,
                    'game-mode': 0x11,
                },
            },
            'triple': {
                type: 'press',
                actions: {
                    'no-action': 0x00,
                    'skip-back': 0x05,
                    'skip-forward': 0x06,
                    'voice-assitant': 0x03,
                    'game-mode': 0x11,
                },
            },
            'action-hold': {
                type: 'press',
                actions: {
                    'noise-control': 0x08,
                },
            },
            'long-action-hold': {
                type: 'press',
                actions: {
                    'no-action': 0x00,
                    'volume-down': 0x0C,
                    'volume-up': 0x0B,
                },
            },
        },
        noiseControlModes: ['off', 'transparency', 'noise-cancellation'],
    },

    albumArtIcon: 'earbuds-stem',
    budsIcon: 'earbuds-stem',
    case: 'case-oval',
};

