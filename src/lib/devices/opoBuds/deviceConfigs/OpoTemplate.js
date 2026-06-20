'use strict';
/* eslint-disable no-dupe-keys */

export default {
    name: 'Redmi Template',
    id: {
        vid: [0x5A4D],
        pid: [0xFFF1, 0xFFF2],
    },

    batteryMutiple: true,
    batteryCase: true,

    eqPreset: {
        classic: 0x01,
        pulseBass: 0x02,
        clearVoice: 0x03,
        brightTransparent: 0x04,
        default: 0x05,
        balanced: 0x0B,
        bassPlus: 0x0C,
        treblePlus: 0x0D,
        serenade: 0x0E,
        softVoice: 0x0F,
        balance: 0x11,
        original: 0x16,
        pureVocals: 0x1C,
        powerfulBass: 0x1D,
        pulseBass2: 0x1F,
    },

    noiseControl: {
        off: [0x01],
        transparency: [0x04],
        noiseCancellation: [0x02],
        adaptive: [0x00, 0x08],
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

    noiseCancellationStrength: {
        balanced: 0x00,
        light: 0x01,
        deep: 0x02,
        adaptive: 0x03,
    },

    transparencyStrength: {
        regular: 0x00,
        voice: 0x01,
        ambient: 0x02,
    },

    bassEnhanceLevel: true,
    windReduction: true,
    personalizeAnc: true,
    dynamicAudio: true,
    spatialAudio: 'on-off',
    volumeEnhancer: true,
    autoAnswer: true,
    dualConnection: true,
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
            'swipe': 0x05,
            'long-action-hold': 0x06,
        },
        gestures: {
            'single': {
                type: 'press',
                actions: {
                    'no-action': 0x00,
                    'play-pause': 0x01,
                    'skip-back': 0x05, // Possibilities: 0x04
                    'skip-forward': 0x06, // Possibilities: 0x05
                    'volume-up': 0x0B,
                    'volume-down': 0x0C,
                    'game-mode': 0x11,
                },
            },
            'double': {
                type: 'press',
                actions: {
                    'no-action': 0x00,
                    'play-pause': 0x01,
                    'skip-back': 0x05, // Possibilities: 0x04
                    'skip-forward': 0x06, // Possibilities: 0x05
                    'volume-up': 0x0B,
                    'volume-down': 0x0C,
                    'game-mode': 0x11,
                },
            },
            'triple': {
                type: 'press',
                actions: {
                    'no-action': 0x00,
                    'play-pause': 0x01,
                    'skip-back': 0x05, // Possibilities: 0x04
                    'skip-forward': 0x06, // Possibilities: 0x05
                    'volume-up': 0x0B,
                    'volume-down': 0x0C,
                    'game-mode': 0x11,
                },
            },
            'action-hold': {
                type: 'press',
                actions: {
                    'no-action': 0x00,
                    'play-pause': 0x01,
                    'skip-back': 0x05, // Possibilities: 0x04
                    'skip-forward': 0x06, // Possibilities: 0x05
                    'volume-up': 0x0B,
                    'volume-down': 0x0C,
                    'game-mode': 0x11,
                    'noise-control': 0x08,
                },
            },
            'long-action-hold': {
                type: 'press',
                actions: {
                    'no-action': 0x00,
                    'play-pause': 0x01,
                    'skip-back': 0x05, // Possibilities: 0x04
                    'skip-forward': 0x06, // Possibilities: 0x05
                    'volume-up': 0x0B,
                    'volume-down': 0x0C,
                    'game-mode': 0x11,
                    'noise-control': 0x08,
                },
            },
            'swipe': {
                type: 'swipe',
                actions: {
                    'no-action': 0x00,
                    'change-volume': 0x07,
                    'voice-assitant': 0x03, // Possibilities: 0x04
                },
            },
        },
        noiseControlModes: ['off', 'transparency', 'noise-cancellation'],
    },

    albumArtIcon: 'earbuds',
    budsIcon: 'earbuds',
    case: 'case-normal',
};

