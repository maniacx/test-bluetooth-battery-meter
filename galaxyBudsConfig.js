
export const crc16Tab = Uint16Array.from([
    0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50A5, 0x60C6, 0x70E7, 0x8108, 0x9129,
    0xA14A, 0xB16B, 0xC18C, 0xD1AD, 0xE1CE, 0xF1EF, 0x1231, 0x0210, 0x3273, 0x2252,
    0x52B5, 0x4294, 0x72F7, 0x62D6, 0x9339, 0x8318, 0xB37B, 0xA35A, 0xD3BD, 0xC39C,
    0xF3FF, 0xE3DE, 0x2462, 0x3443, 0x0420, 0x1401, 0x64E6, 0x74C7, 0x44A4, 0x5485,
    0xA56A, 0xB54B, 0x8528, 0x9509, 0xE5EE, 0xF5CF, 0xC5AC, 0xD58D, 0x3653, 0x2672,
    0x1611, 0x0630, 0x76D7, 0x66F6, 0x5695, 0x46B4, 0xB75B, 0xA77A, 0x9719, 0x8738,
    0xF7DF, 0xE7FE, 0xD79D, 0xC7BC, 0x48C4, 0x58E5, 0x6886, 0x78A7, 0x0840, 0x1861,
    0x2802, 0x3823, 0xC9CC, 0xD9ED, 0xE98E, 0xF9AF, 0x8948, 0x9969, 0xA90A, 0xB92B,
    0x5AF5, 0x4AD4, 0x7AB7, 0x6A96, 0x1A71, 0x0A50, 0x3A33, 0x2A12, 0xDBFD, 0xCBDC,
    0xFBBF, 0xEB9E, 0x9B79, 0x8B58, 0xBB3B, 0xAB1A, 0x6CA6, 0x7C87, 0x4CE4, 0x5CC5,
    0x2C22, 0x3C03, 0x0C60, 0x1C41, 0xEDAE, 0xFD8F, 0xCDEC, 0xDDCD, 0xAD2A, 0xBD0B,
    0x8D68, 0x9D49, 0x7E97, 0x6EB6, 0x5ED5, 0x4EF4, 0x3E13, 0x2E32, 0x1E51, 0x0E70,
    0xFF9F, 0xEFBE, 0xDFDD, 0xCFFC, 0xBF1B, 0xAF3A, 0x9F59, 0x8F78, 0x9188, 0x81A9,
    0xB1CA, 0xA1EB, 0xD10C, 0xC12D, 0xF14E, 0xE16F, 0x1080, 0x00A1, 0x30C2, 0x20E3,
    0x5004, 0x4025, 0x7046, 0x6067, 0x83B9, 0x9398, 0xA3FB, 0xB3DA, 0xC33D, 0xD31C,
    0xE37F, 0xF35E, 0x02B1, 0x1290, 0x22F3, 0x32D2, 0x4235, 0x5214, 0x6277, 0x7256,
    0xB5EA, 0xA5CB, 0x95A8, 0x8589, 0xF56E, 0xE54F, 0xD52C, 0xC50D, 0x34E2, 0x24C3,
    0x14A0, 0x0481, 0x7466, 0x6447, 0x5424, 0x4405, 0xA7DB, 0xB7FA, 0x8799, 0x97B8,
    0xE75F, 0xF77E, 0xC71D, 0xD73C, 0x26D3, 0x36F2, 0x0691, 0x16B0, 0x6657, 0x7676,
    0x4615, 0x5634, 0xD94C, 0xC96D, 0xF90E, 0xE92F, 0x99C8, 0x89E9, 0xB98A, 0xA9AB,
    0x5844, 0x4865, 0x7806, 0x6827, 0x18C0, 0x08E1, 0x3882, 0x28A3, 0xCB7D, 0xDB5C,
    0xEB3F, 0xFB1E, 0x8BF9, 0x9BD8, 0xABBB, 0xBB9A, 0x4A75, 0x5A54, 0x6A37, 0x7A16,
    0x0AF1, 0x1AD0, 0x2AB3, 0x3A92, 0xFD2E, 0xED0F, 0xDD6C, 0xCD4D, 0xBDAA, 0xAD8B,
    0x9DE8, 0x8DC9, 0x7C26, 0x6C07, 0x5C64, 0x4C45, 0x3CA2, 0x2C83, 0x1CE0, 0x0CC1,
    0xEF1F, 0xFF3E, 0xCF5D, 0xDF7C, 0xAF9B, 0xBFBA, 0x8FD9, 0x9FF8, 0x6E17, 0x7E36,
    0x4E55, 0x5E74, 0x2E93, 0x3EB2, 0x0ED1, 0x1EF0,
]);

export const BudsUUID = '00001101-0000-1000-8000-00805f9b34fb';
export const BudsLegacyUUID = '00001102-0000-1000-8000-00805f9b34fd';
export const BudsNewUUID = '2e73a4ad-332d-41fc-90e2-16bef06523f2';
export const LeAudioUUID = '0000184e-0000-1000-8000-00805f9b34fb';
export const HandsFreeUUID = '0000111e-0000-1000-8000-00805f9b34fb';
export const DeviceIdPrefixUUID = 'd908aab5-7a90-4cbe-8641-86a553db';

export const GalaxyBudsMsgIds = {
    UNIVERSAL_MSG_ID_ACKNOWLEDGEMENT: 66,
    STATUS_UPDATED: 96,
    EXTENDED_STATUS_UPDATED: 97,
    NOISE_CONTROLS_UPDATE: 119,
    NOISE_CONTROLS: 120,
};

export const GalaxyBudsMsgTypes = {
    Request: 0,
    Response: 1,
};

export const GalaxyBudsAnc = {
    Off: 0,
    NoiseReduction: 1,
    AmbientSound: 2,
    Adaptive: 3,
};

export const GalaxyBudsEarDetectionState = {
    Disconnected: 0,
    Wearing: 1,
    Idle: 2,
    Case: 3,
    ClosedCase: 4,
};

export const GalaxyBudsLegacyEarDetectionState = {
    None: 0,
    R: 1,
    L: 16,
    Both: 17,
};

export const GalaxyBudsModel = {
    Unknown: 0,
    GalaxyBuds: 1,
    GalaxyBudsPlus: 2,
    GalaxyBudsLive: 3,
    GalaxyBudsPro: 4,
    GalaxyBuds2: 5,
    GalaxyBuds2Pro: 6,
    GalaxyBudsFe: 7,
    GalaxyBuds3: 8,
    GalaxyBuds3Pro: 9,
};

export const GalaxyBudsModelList = [
    // 1) Galaxy Buds
    {
        modelId: GalaxyBudsModel.GalaxyBuds,
        name: 'Galaxy Buds',
        legacy: true,
        anc: {supported: false, modes: []},
        earDetection: {offset: 6, legacy: true},
        battery: {
            status: {l: 1, r: 2, c: null},
            statusChargeOffset: null,
            statusChargeMask: null,
            extended: null,
            extChargeOffset: null,
            extChargeMask: null,
        },
        albumArtIcon: 'earbuds',
        budsIcon: 'earbuds-stem3',
        case: 'case-normal',
    },

    // 2) Galaxy Buds+
    {
        modelId: GalaxyBudsModel.GalaxyBudsPlus,
        name: 'Galaxy Buds+',
        legacy: true,
        anc: {supported: false, modes: []},
        earDetection: {offset: 6, legacy: false},
        battery: {
            status: {l: 1, r: 2, c: 6},
            statusChargeOffset: null,
            statusChargeMask: null,
            extended: {l: 2, r: 3, c: 7},
            extChargeOffset: null,
            extChargeMask: null,
        },
        albumArtIcon: 'earbuds',
        budsIcon: 'earbuds-stem3',
        case: 'case-normal',
    },

    // 3) Galaxy Buds Live
    {
        modelId: GalaxyBudsModel.GalaxyBudsLive,
        name: 'Galaxy Buds Live',
        legacy: true,
        anc: {supported: false, modes: []},
        earDetection: {offset: 6, legacy: false},
        battery: {
            status: {l: 1, r: 2, c: 6},
            statusChargeOffset: null,
            statusChargeMask: null,
            extended: {l: 2, r: 3, c: 7},
            extChargeOffset: null,
            extChargeMask: null,
        },
        albumArtIcon: 'earbuds',
        budsIcon: 'earbuds-stem3',
        case: 'case-normal',
    },

    // 4) Galaxy Buds Pro
    {
        modelId: GalaxyBudsModel.GalaxyBudsPro,
        name: 'Galaxy Buds Pro',
        legacy: false,
        anc: {
            supported: true,
            extendedOffset: 12,
            noiseUpdateOffset: 0,
            ackOffset: 1,
            modes: [
                GalaxyBudsAnc.Off,
                GalaxyBudsAnc.AmbientSound,
                GalaxyBudsAnc.NoiseReduction,
            ],
        },
        earDetection: {offset: 6, legacy: false},
        battery: {
            status: {l: 1, r: 2, c: 6},
            statusChargeOffset: 7,
            statusChargeMask: 0b00010001 | 0b00000100,
            extended: {l: 2, r: 3, c: 7},
            extChargeOffset: 43,
            extChargeMask: 0b00010001 | 0b00000100,
        },
        albumArtIcon: 'earbuds',
        budsIcon: 'earbuds-stem3',
        case: 'case-normal',
    },

    // 5) Galaxy Buds 2
    {
        modelId: GalaxyBudsModel.GalaxyBuds2,
        name: 'Galaxy Buds 2',
        legacy: false,
        anc: {
            supported: true,
            extendedOffset: 12,
            noiseUpdateOffset: 0,
            ackOffset: 1,
            modes: [
                GalaxyBudsAnc.Off,
                GalaxyBudsAnc.AmbientSound,
                GalaxyBudsAnc.NoiseReduction,
            ],
        },
        earDetection: {offset: 6, legacy: false},
        battery: {
            status: {l: 1, r: 2, c: 6},
            statusChargeOffset: 7,
            statusChargeMask: 0b00010001 | 0b00000100,
            extended: {l: 2, r: 3, c: 7},
            extChargeOffset: 36,
            extChargeMask: 0b00010001 | 0b00000100,
        },
        albumArtIcon: 'earbuds',
        budsIcon: 'earbuds-stem3',
        case: 'case-normal',
    },

    // 6) Galaxy Buds 2 Pro
    {
        modelId: GalaxyBudsModel.GalaxyBuds2Pro,
        name: 'Galaxy Buds 2 Pro',
        legacy: false,
        anc: {
            supported: true,
            extendedOffset: 12,
            noiseUpdateOffset: 0,
            ackOffset: 1,
            modes: [
                GalaxyBudsAnc.Off,
                GalaxyBudsAnc.AmbientSound,
                GalaxyBudsAnc.Adaptive,
                GalaxyBudsAnc.NoiseReduction,
            ],
        },
        earDetection: {offset: 6, legacy: false},
        battery: {
            status: {l: 1, r: 2, c: 6},
            statusChargeOffset: 7,
            statusChargeMask: 0b00010001 | 0b00000100,
            extended: {l: 2, r: 3, c: 7},
            extChargeOffset: 43,
            extChargeMask: 0b00010001 | 0b00000100,
        },
        albumArtIcon: 'earbuds',
        budsIcon: 'earbuds-stem3',
        case: 'case-normal',
    },

    // 7) Galaxy Buds FE
    {
        modelId: GalaxyBudsModel.GalaxyBudsFe,
        name: 'Galaxy Buds FE',
        legacy: false,
        anc: {
            supported: true,
            extendedOffset: 12,
            noiseUpdateOffset: 0,
            ackOffset: 1,
            modes: [
                GalaxyBudsAnc.Off,
                GalaxyBudsAnc.AmbientSound,
                GalaxyBudsAnc.NoiseReduction,
            ],
        },
        earDetection: {offset: 6, legacy: false},
        battery: {
            status: {l: 1, r: 2, c: 6},
            statusChargeOffset: 7,
            statusChargeMask: 0b00010001 | 0b00000100,
            extended: {l: 2, r: 3, c: 7},
            extChargeOffset: 43,
            extChargeMask: 0b00010001 | 0b00000100,
        },
        albumArtIcon: 'earbuds',
        budsIcon: 'earbuds-stem3',
        case: 'case-normal',
    },

    // 8) Galaxy Buds 3
    {
        modelId: GalaxyBudsModel.GalaxyBuds3,
        name: 'Galaxy Buds 3',
        legacy: false,
        anc: {
            supported: true,
            extendedOffset: 12,
            noiseUpdateOffset: 0,
            ackOffset: 1,
            modes: [
                GalaxyBudsAnc.Off,
                GalaxyBudsAnc.NoiseReduction,
            ],
        },
        earDetection: {offset: 6, legacy: false},
        battery: {
            status: {l: 1, r: 2, c: 6},
            statusChargeOffset: 7,
            statusChargeMask: 0b00010001 | 0b00000100,
            extended: {l: 2, r: 3, c: 7},
            extChargeOffset: 42,
            extChargeMask: 0b00010001 | 0b00000100,
        },
        albumArtIcon: 'earbuds',
        budsIcon: 'earbuds-stem3',
        case: 'case-normal',
    },

    // 9) Galaxy Buds 3 Pro
    {
        modelId: GalaxyBudsModel.GalaxyBuds3Pro,
        name: 'Galaxy Buds 3 Pro',
        legacy: false,
        anc: {
            supported: true,
            extendedOffset: 12,
            noiseUpdateOffset: 0,
            ackOffset: 1,
            modes: [
                GalaxyBudsAnc.Off,
                GalaxyBudsAnc.AmbientSound,
                GalaxyBudsAnc.Adaptive,
                GalaxyBudsAnc.NoiseReduction,
            ],
        },
        earDetection: {offset: 6, legacy: false},
        battery: {
            status: {l: 1, r: 2, c: 6},
            statusChargeOffset: 7,
            statusChargeMask: 0b00010001 | 0b00000100,
            extended: {l: 2, r: 3, c: 7},
            extChargeOffset: 42,
            extChargeMask: 0b00010001 | 0b00000100,
        },
        albumArtIcon: 'earbuds',
        budsIcon: 'earbuds-stem3',
        case: 'case-normal',
    },
];

