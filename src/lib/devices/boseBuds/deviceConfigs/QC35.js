'use strict';

export default {
    name: 'QuietComfort 35 II',
    id: '400C',
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

    albumArtIcon: 'headphone1',
    budsIcon: 'headphone1',
};

