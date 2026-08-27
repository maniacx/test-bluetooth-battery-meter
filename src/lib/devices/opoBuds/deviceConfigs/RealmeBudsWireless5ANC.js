'use strict';

export default {
    modelId: '051412',
    name: 'Realme Buds Wireless 5 ANC',

    batteryLR: false,
    batteryCase: false,

    eqPreset: {
        original_sound: 0x00,
        deep_bass: 0x01,
        serenade: 0x02,
        clear_bass: 0x03,
    },

    noiseControl: {
        off: [0x01],
        transparency: {
            levels: {
                regular: [0x02],
            },
        },
        noiseCancellation: {
            levels: {
                smart: [0x20],
                mild: [0x04],
                moderate: [0x10],
                deep: [0x08],
            },
        },
    },

    lowLatencyMode: true,
    dualConnection: true,
    windNoiseReduction: true,
    dynamicBass: true,
    spatialAudio: true,
    autoAnswer: true,
    findMyPhone: true,
    ring: true,

    gestureOptions: {
        slots: [
            {group: 'mfb', device: 0x01, buttonId: 0x01, type: 'single'},
            {group: 'mfb', device: 0x01, buttonId: 0x01, type: 'double'},
            {group: 'mfb', device: 0x01, buttonId: 0x01, type: 'triple'},
            {group: 'mfb', device: 0x01, buttonId: 0x01, type: 'action-hold'},
        ],
        mapping: {
            gestureTypes: {
                'single': 0x01,
                'double': 0x02,
                'triple': 0x03,
                'action-hold': 0x04,
            },
            actions: {
                'none': [0x00],
                'play-pause': [0x01],
                'voice-assistant': [0x04],
                'skip-back': [0x05],
                'skip-forward': [0x06],
                'game-mode': [0x11],
            },
        },
        gestures: {
            'single': {
                type: 'press',
                actions: [
                    'play-pause',
                    'skip-forward',
                    'skip-back',
                    'voice-assistant',
                    'game-mode',
                    'none',
                ],
            },
            'double': {
                type: 'press',
                actions: [
                    'play-pause',
                    'skip-forward',
                    'skip-back',
                    'voice-assistant',
                    'game-mode',
                    'none',
                ],
            },
            'triple': {
                type: 'press',
                actions: [
                    'play-pause',
                    'skip-forward',
                    'skip-back',
                    'voice-assistant',
                    'game-mode',
                    'none',
                ],
            },
            'action-hold': {
                type: 'hold',
                actions: [
                    'voice-assistant',
                    'play-pause',
                    'skip-forward',
                    'skip-back',
                    'game-mode',
                    'none',
                ],
            },
        },
    },

    albumArtIcon: 'earbuds-neckband',
    budsIcon: 'earbuds-neckband',
};
