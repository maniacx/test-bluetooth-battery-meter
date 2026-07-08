'use strict';

export default {
    name: 'Realme Air 7',
    type: 'realme',
    id: {
        vid: [0x5A4D],
        pid: [0x065018],
    },

    batteryMutiple: true,
    batteryCase: true,

    eqPreset: {
        serenade: 0x0E,
        original: 0x16,
        bassPlus: 0x0C,
        pulseBass: 0x02,
    },

    noiseControl: {
        off: [0x01],
        transparency: {
            levels: {
                regular: [0x00, 0x01],
                voice: [0x00, 0x01],
            },
        },
        noiseCancellation: {
            levels: {
                low: [0x40],
                mid: [0x20],
                high: [0x10],
                auto: [0x80],
            },
        },
    },

    windReduction: true,
    dynamicAudio: true,
    spatialAudio: 'on-off',
    volumeEnhancer: true,
    dualConnection: true,
    autoAnswer: true,


    inEarDetection: true,
    ring: true,

    gestureOptions: {
        positions: {
            left: 0x01,
            right: 0x02,
            both: 0x04,
        },
        gestureTypes: {
            'double': 0x02,
            'triple': 0x03,
            'action-hold': 0x04,
        },
        gestures: {
            'double': {
                type: 'press',
                actions: {
                    'play-pause': 0x01,
                    'skip-back': 0x05,
                    'voice-assitant': 0x03,
                    'no-action': 0x00,
                },
            },
            'triple': {
                type: 'press',
                actions: {
                    'skip-back': 0x05,
                    'skip-forward': 0x06,
                    'volume-up': 0x0B,
                    'volume-down': 0x0C,
                    'voice-assitant': 0x03,
                    'game-mode': 0x11,
                    'no-action': 0x00,
                },
            },
            'action-hold': {
                type: 'press',
                actions: {
                    'noise-control': 0x08,
                    'voice-assitant': 0x03,
                    'game-mode': 0x11,
                    'no-action': 0x00,
                },
            },
        },
        noiseControlModes: ['off', 'transparency', 'noise-cancellation'],
    },

    albumArtIcon: 'earbuds-stem',
    budsIcon: 'earbuds-stem',
    case: 'case-normal',
};

