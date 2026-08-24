'use strict';

export default {
    modelId: '051412',
    name: 'Realme Buds Wireless 5 ANC',
    pattern: /^realme Buds Wireless\s*5(\s*ANC)?$/i,

    batteryLR: false,
    batteryCase: false,

    eqPreset: {
        original_sound: 0x00,
        deep_bass: 0x01,
        serenade: 0x02,
        clear_bass: 0x03,
    },

    noiseControl: {
        off: {byte: 0x01},
        transparency: {byte: 0x02},
        noiseCancellation: {
            levels: {
                smart: 0x20,
                mild: 0x04,
                moderate: 0x10,
                deep: 0x08,
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
    ring: true,

    gestureOptions: {
        default: '0101010101010206010103050101040301040108',
        slots: [
            {group: 'single', device: 0x01, buttonId: 0x01, type: 'double'},
            {group: 'single', device: 0x01, buttonId: 0x01, type: 'triple'},
            {group: 'single', device: 0x01, buttonId: 0x01, type: 'action-hold'},
            {group: 'single', device: 0x01, buttonId: 0x04, type: 'single'},
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
                'skip-back': [0x02],
                'device-switch': [0x03],
                'volume-down': [0x04],
                'game-mode': [0x05],
                'skip-forward': [0x06],
                'voice-assistant': [0x07],
                'noise-control': [0x08],
            },
        },
        gestures: {
            'single': {
                type: 'press',
                actions: [
                    'noise-control',
                    'none',
                ],
            },
            'double': {
                type: 'press',
                actions: [
                    'skip-forward',
                    'skip-back',
                    'play-pause',
                    'voice-assistant',
                    'game-mode',
                    'none',
                ],
            },
            'triple': {
                type: 'press',
                actions: [
                    'game-mode',
                    'skip-forward',
                    'skip-back',
                    'voice-assistant',
                    'none',
                ],
            },
            'action-hold': {
                type: 'hold',
                actions: [
                    'device-switch',
                    'voice-assistant',
                    'game-mode',
                    'noise-control',
                    'none',
                ],
            },
        },
    },

    albumArtIcon: 'earbuds-neckband',
    budsIcon: 'earbuds-neckband',
};
