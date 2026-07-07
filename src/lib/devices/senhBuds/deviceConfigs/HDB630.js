'use strict';

export default {
    name: 'HDB 630',
    id: ['HDBT'],
    type: 'headband',

    batterySingle: true,


    audioMode: {
        off: 0x00,
        eq: 0x01,
        podcast: 0x02,
        personalized: 0x03,
        peq: 0x04,
    },

    eq: {
        displayedBand: [50, 250, 800, 3000, 8000],
        band: [50, 250, 800, 3000, 8000],
        range: 6,
        bassBoost: true,
        custom: true,
        presets: {
            flat: [0.0, 0.0, 0.0, 0.0, 0.0],
            rock: [0.0, 2.0, 2.5, 1.5, -2.0],
            pop: [0.0, -2.5, 0.0, 2.5, 0.0],
            dance: [3.5, 2.0, -1.5, 1.5, 3.0],
            hipHop: [3.0, 1.5, -1.5, 0.0, -1.5],
            classical: [-2.0, -1.5, 0.0, 3.5, 4.0],
            movie: [0.0, 0.0, 2.0, 2.0, -2.0],
            jazz: [-3.2, 0.0, 2.2, 2.2, 0.0],
        },
    },

    peq: {
        fMin: 20,
        fMax: 20000,
        range: 6.0,
        gain_max: 6.0,
        qMin: 0.25,
        qMax: 8.0,
        minMasterGain: -12.0,
        shelfQmax: 0.71,
        gainCalculated: true,
    },

    crossfeed: {
        off: 0x02,
        low: 0x00,
        high: 0x01,
    },

    noiseControl: {
        type: 2,
        adaptive: true,
        wind: {
            off: 0x00,
            max: 0x01,
            auto: 0x02,
        },
    },

    reportsCodec: true,
    inEarDetection: true,
    transPause: true,
    smartPause: true,
    autoAnswer: true,
    autoPowerOff: [0, 15, 30, 60],
    //    ring: true,
    sideTone: 5,
    dualConnection: true,
    notifcation: true,
    comfortCalls: true,

    registerNotification: [
        0x00, // Core
        0x02, // Device
        0x03, // Battery
        0x04, // Audio
        0x08, // User EQ
        0x09, // Versions
        0x0A, // Management
        0x0B, // MMI
        0x0C, // Transparency
        0x0D, // ANC
    ],

    albumArtIcon: 'headphone1',
    budsIcon: 'headphone1',
};

