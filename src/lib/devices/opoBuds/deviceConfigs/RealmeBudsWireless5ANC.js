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
        ancCycleType: 1,
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
    volumeEnhancer: true,
    dynamicBass: true,
    spatialAudio: true,
    autoAnswer: true,
    findMyPhone: true,
    fitTest: true,
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
                'noise-control': [0x08],
                'device-switch': [0x0A],
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
                    'game-mode',
                    'voice-assistant',
                    'none',
                ],
            },
            'double': {
                type: 'press',
                actions: [
                    'play-pause',
                    'skip-forward',
                    'skip-back',
                    'game-mode',
                    'voice-assistant',
                    'none',
                ],
            },
            'triple': {
                type: 'press',
                actions: [
                    'play-pause',
                    'skip-forward',
                    'skip-back',
                    'game-mode',
                    'voice-assistant',
                    'none',
                ],
            },
            'action-hold': {
                type: 'press',
                actions: [
                    'voice-assistant',
                    'game-mode',
                    'none',
                ],
            },
        },
    },

    albumArtIcon: 'earbuds-neckband',
    budsIcon: 'earbuds-neckband',
};
