'use strict';

export default {
    name: 'Redmi Template',
    id: {
        vid: [0x5A4D],
        pid: [0xFFF1, 0xFFF2],
    },

    batteryMutiple: true,
    batteryCase: true,

    eqPreset: {
        standard: 0x00,
        voice: 0x01,
        base: 0x05,
        treble: 0x06,
        boostVolume: 0x07,
        custom: 0x0A,
        classic: 0x0B,
        legendary: 0x0C,
        soothingboost: 0x0D,
        harman: 0x0E,
        harmanmaster: 0x0F,
        standard2: 0x10,
        outdoor: 0x11,
        underwater: 0x12,
        balanced: 0x15,
    },

    noiseControl: {
        off: 0x00,
        noiseCancellation: 0x01,
        transparency: 0x02,
    },

    adaptiveNcSwitch: true,
    ancLevel: 6,

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

    immersiveSound: true,
    lowLatencyMode: true,
    adaptiveSound: true,
    dualConnection: true,
    autoAnswer: true,
    ring: true,

    personalizeAnc: true,
    adaptiveChat: true, // 5,10,15,close

    gestureOptions: {
        positions: {
            left: 0x00,
            right: 0x01,
        },
        gestureTypes: {
            'single': 0x04,
            'double': 0x01,
            'triple': 0x02,
            'action-hold': 0x03,
            'swipe': 0x05,
        },
        gestures: {
            'single': {
                type: 'press',
                actions: {
                    'no-action': 0x08,
                    'play-pause': 0x01,
                    'skip-back': 0x02,
                    'skip-forward': 0x03,
                    'volume-up': 0x04,
                    'volume-down': 0x05,
                    'game-mode': 0x07,
                    'take-photo': 0x09,

                },
            },
            'double': {
                type: 'press',
                actions: {
                    'no-action': 0x08,
                    'play-pause': 0x01,
                    'skip-back': 0x02,
                    'skip-forward': 0x03,
                    'volume-up': 0x04,
                    'volume-down': 0x05,
                    'game-mode': 0x07,
                    'take-photo': 0x09,
                },
            },
            'triple': {
                type: 'press',
                actions: {
                    'no-action': 0x08,
                    'play-pause': 0x01,
                    'skip-back': 0x02,
                    'skip-forward': 0x03,
                    'volume-up': 0x04,
                    'volume-down': 0x05,
                    'game-mode': 0x07,
                    'take-photo': 0x09,
                },
            },
            'action-hold': {
                type: 'press',
                actions: {
                    'voice-assistant': 0x08,
                    'noise-control': 0x06,
                    'no-action': 0x00,
                    'take-photo': 0x09,
                    'change-volume': 0x0B,
                },
            },
            'swipe': {
                type: 'swipe',
                actions: {
                    'no-action': 0x00,
                    'change-volume': 0x0B,
                },
            },
        },
        noiseControlModes: ['off', 'transparency', 'noise-cancellation'],
    },

    albumArtIcon: 'earbuds',
    budsIcon: 'earbuds',
    case: 'case-normal',
};

