'use strict';

export default {
    name: 'QuietComfort 35 II',
    id: '4020',
    type: 'headband',

    batterySingle: true,
    legacy: true,
    anr: {
        off: 0x00,
        low: 0x03,
        high: 0x01,
    },

    sideTone: 4,
    automaticPowerOffTimer: [0, 5, 20, 40, 60, 180],

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
            action: {
                id: 0x10,
                gestures: {
                    'single': {
                        type: 'press',
                        byte: 0x04,
                        actions: {
                            'anc': 0x02,
                            'voice-assistant': 0x01,
                        },
                    },
                },
            },
        },
    },

    albumArtIcon: 'headphone1',
    budsIcon: 'headphone1',
};

