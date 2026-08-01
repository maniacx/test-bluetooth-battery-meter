'use strict';

export default {
    name: 'QuietComfort Earbuds II',
    id: '4064',
    type: 'earbuds',

    batteryMultiple: true,
    batteryCase: true,

    eq: {
        bands: ['bass', 'mid', 'treble'],
        range: 8,
        custom: true,
        presets: {
            flat: [0, 0, 0],
            bassBoost: [8, 0, 0],
            bassReducer: [-8, -2, 0],
            trebleBoost: [0, 0, 6],
            trebleReducer: [0, -2, -6],
        },
    },

    audioModes: {
        defaultConfig: {
            index: 256,
            id: 0,
            editable: true,
            added: false,
            ui: false,
            fav: false,
            name: '',
            flag: 255,
            cnc: 5,
            autoCnc: false,
            spatial: 0,
            wind: false,
            anc: false,
        },
        presets: {
            quiet: {
                index: 0,
                id: 1,
                editable: false,
                added: true,
                ui: true,
                fav: true,
                name: 'Quiet',
                cnc: 10,
            },

            aware: {
                index: 1,
                id: 2,
                editable: false,
                added: true,
                ui: true,
                fav: true,
                name: 'Aware',
                cnc: 0,
            },
        },

        ancToggle: false,
        nc: {level: 10, steps: 1},
        autoNc: false,
        windToggle: false,
        spatialMode: false,
        userMode: [
            'commute', 'focus', 'home', 'music', 'outdoor', 'relax',
            'run', 'walk', 'work', 'workout',
        ],
        totalModes: 10,
        maxAllowedFav: 10,
    },

    sideTone: {
        off: 0x00,
        low: 0x03,
        mid: 0x02,
        high: 0x01,
    },

    inEarSettings: true,
    autoAnswer: true,
    autoPause: true,
    autoTransparency: true,
    dualConnection: true,

    voicePrompt: {
        0x00: 'English (UK)',
        0x01: 'English (US)',
        0x02: 'Français',
        0x03: 'Italiano',
        0x04: 'Deutsch',
        0x05: 'Español (EU)',
        0x06: 'Español (MX)',
        0x07: 'Português',
        0x08: '普通话 (Mandarin)',
        0x09: '한국어 (Korean)',
        0x0A: 'Русский (Russian)',
        0x0B: 'Polski',
        0x0C: 'עִברִית (Hebrew)',
        0x0D: 'Türk',
        0x0E: 'Nederlands',
        0x0F: '日本語 (Japanese)',
        0x10: '廣東話 (Cantonese)',
        0x11: 'العربية (Arabic)',
        0x12: 'Svensk',
        0x13: 'Dansk',
        0x14: 'Norsk',
        0x15: 'Suomen kieli (Finnish)',
        0x16: 'हिंदी (Hindi)',
    },

    gestureOptions: {
        buttons: {
            left: {
                id: 0x03,
                gestures: {
                    'action-hold': {
                        type: 'tap',
                        byte: 0x09,
                        actions: {
                            'no-action': 0x00,
                            'mode': 0x11,
                            'spatial': 0x13,
                            'voice-assistant': 0x01,
                        },
                    },
                },
            },

            right: {
                id: 0x04,
                gestures: {
                    'action-hold': {
                        type: 'tap',
                        byte: 0x09,
                        actions: {
                            'no-action': 0x00,
                            'mode': 0x11,
                            'spatial': 0x13,
                            'voice-assistant': 0x01,
                        },
                    },
                },
            },
        },
    },

    albumArtIcon: 'earbuds',
    budsIcon: 'earbuds',
    case: 'case-normal',
};

