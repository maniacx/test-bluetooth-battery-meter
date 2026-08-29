'use strict';

export default {
    modelId: '064812',
    name: 'Realme Buds Air 7',

    batteryLR: true,
    batteryCase: true,

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

    inEarDetection: true,
    lowLatencyMode: true,
    dualConnection: true,
    windNoiseReduction: true,
    volumeEnhancer: true,
    spatialAudio: true,
    highResAudio: true,
    dynamicBass: true,
    autoAnswer: true,
    fitTest: true,
    ring: true,

    gestureOptions: {
        slots: [
            {group: 'left',  device: 0x01, buttonId: 0x01, type: 'double'},
            {group: 'left',  device: 0x01, buttonId: 0x01, type: 'triple'},
            {group: 'left',  device: 0x01, buttonId: 0x01, type: 'action-hold'},
            {group: 'right', device: 0x02, buttonId: 0x01, type: 'double'},
            {group: 'right', device: 0x02, buttonId: 0x01, type: 'triple'},
            {group: 'right', device: 0x02, buttonId: 0x01, type: 'action-hold'},
        ],
        mapping: {
            gestureTypes: {
                'double': 0x02,
                'triple': 0x03,
                'action-hold': 0x04,
            },
            actions: {
                'none': [0x00],
                'play-pause': [0x01],
                'skip-back': [0x02],
                'volume-up': [0x03],
                'volume-down': [0x04],
                'game-mode': [0x05],
                'skip-forward': [0x06],
                'voice-assistant': [0x07],
                'noise-control': [0x08],
            },
        },
        gestures: {
            'double': {
                type: 'tap',
                actions: [
                    'play-pause',
                    'skip-forward',
                    'voice-assistant',
                    'none',
                ],
            },
            'triple': {
                type: 'tap',
                actions: [
                    'skip-forward',
                    'skip-back',
                    'volume-up',
                    'volume-down',
                    'voice-assistant',
                    'game-mode',
                    'none',
                ],
            },
            'action-hold': {
                type: 'hold',
                actions: [
                    'noise-control',
                    'voice-assistant',
                    'game-mode',
                    'none',
                ],
            },
        },
    },

    albumArtIcon: 'earbuds-stem',
    budsIcon: 'earbuds-stem',
    case: 'case-round',
};
