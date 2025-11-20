export function booleanFromByte(val) {
    switch (val) {
        case 0x00:
            return false;
        case 0x01:
            return true;
        default:
            return null;
    }
}

export function isValidByte(val, enumObj) {
    return Object.values(enumObj).includes(val);
}

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
export const DeviceIdPrefixUUID = 'd908aab5-7a90-4cbe-8641-86a553db';

export const GalaxyBudsMsgIds = {
    UNIVERSAL_MSG_ID_ACKNOWLEDGEMENT: 0X42,
    STATUS_UPDATED: 0x60,
    EXTENDED_STATUS_UPDATED: 0x61,
    SET_ANC_WITH_ONE_EARBUD: 0x6F,
    NOISE_CONTROLS_UPDATE: 0x77,
    NOISE_CONTROLS: 0x78,
    SET_TOUCH_AND_HOLD_NOISE_CONTROLS: 0x79,
    SET_DETECT_CONVERSATIONS: 0x7A,
    SET_DETECT_CONVERSATIONS_DURATION: 0x7B,
    SET_AMBIENT_MODE: 0x80,
    AMBIENT_MODE_UPDATED: 0x81,
    CUSTOMIZE_AMBIENT_SOUND: 0x82,
    NOISE_REDUCTION_LEVEL: 0x83,
    AMBIENT_VOLUME: 0x84,
    MANAGER_INFO: 0x88,
    SET_SIDETONE: 0x8B,
    SET_HEARING_ENHANCEMENTS: 0x8F,
    LOCK_TOUCHPAD: 0x90,
    TOUCH_UPDATED: 0x91,
    SET_TOUCHPAD_OPTION: 0x92,
    OUTSIDE_DOUBLE_TAP: 0x95,
    SET_NOISE_REDUCTION: 0x98,
    NOISE_REDUCTION_MODE_UPDATE: 0x9B,
    EQUALIZER: 0x56,
};

export const LegacyMsgIds = {
    SPP_ROLE_STATE: 0x73,
    AMBIENT_VOICE_FOCUS: 0x85,
    AMBIENT_WEARING_STATUS_UPDATED: 0x89,
    TAP_TEST_MODE_EVENT: 0x8E,
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

export const EqPresets = {
    BassBoost: 0,
    Soft: 1,
    Dynamic: 2,
    Clear: 3,
    TrebleBoost: 4,
    Off: 255, // Do not send this
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
    GalaxyBuds3Fe: 10,
    GalaxyBudsCore: 11,
};

export const GalaxyBudsModelList = [
    // 1) Galaxy Buds
    {
        modelId: GalaxyBudsModel.GalaxyBuds,
        name: 'Galaxy Buds',

        features: {
            ambientSound: true,
            ambientSoundVolume: true,
            ambientVolumeMax: 4,
            ambientVoiceFocus: true,
            batteryType: true,
            buildInfo: true,
            current: true,
            pairingMode: true,
            seamlessConnection: true,
            sppLegacyMessageHeader: true,
            voltage: true,
        },
        touchOptions: {
            voiceAssistant: 0,
            quickAmbientSound: 1,
            volume: 2,
            ambientSound: 3,
            spotifySpotOn: 4,
            otherL: 5,
            otherR: 6,
        },

        albumArtIcon: 'earbuds',
        budsIcon: 'earbuds',
        case: 'case-oval',
    },

    // 2) Galaxy Buds+
    {
        modelId: GalaxyBudsModel.GalaxyBudsPlus,
        name: 'Galaxy Buds+',

        features: {
            ambientExtraLoud: true,
            ambientSidetone: true,
            ambientSound: true,
            ambientSoundVolume: true,
            ambientVolumeMax: 2, // 3 if ExtraLoud is set
            buildInfo: true,
            callPathControl: true,
            caseBattery: true,
            doubleTapVolume: true,
            gamingMode: true,
            hiddenAtMode: true,
            pairingMode: true,
            seamlessConnection: true,
            smartThingsFind: true,
            voltage: true,
        },
        touchOptions: {
            voiceAssistant: 1,
            ambientSound: 2,
            volume: 3,
            spotifySpotOn: 4,
            otherL: 5,
            otherR: 6,
        },

        albumArtIcon: 'earbuds',
        budsIcon: 'earbuds',
        case: 'case-oval',
    },

    // 3) Galaxy Buds Live
    {
        modelId: GalaxyBudsModel.GalaxyBudsLive,
        name: 'Galaxy Buds Live',

        features: {
            ambientPassthrough: true,
            bixbyWakeup: true,
            buildInfo: true,
            callPathControl: true,
            caseBattery: true,
            gamingMode: true,
            hiddenAtMode: true,
            noiseCancellation: true,
            pairingMode: true,
            seamlessConnection: true,
            smartThingsFind: true,
            spatialSensor: true,
            stereoPan: true,
            voltage: true,
        },
        touchOptions: {
            voiceAssistant: 1,
            anc: 2,
            volume: 3,
            spotifySpotOn: 4,
            otherL: 5,
            otherR: 6,
        },

        iconResourceKey: 'Bean',

        albumArtIcon: 'earbuds',
        budsIcon: 'earbuds-bean',
        case: 'case-normal',
    },

    // 4) Galaxy Buds Pro
    {
        modelId: GalaxyBudsModel.GalaxyBudsPro,
        name: 'Galaxy Buds Pro',

        features: {
            ambientCustomize: true,
            ambientCustomizeVolume: 4,
            ambientSidetone: true,
            ambientSound: true,
            ambientSoundVolume: true,
            ambientVolumeMax: 3, // from GBC
            bixbyWakeup: true,
            buildInfo: true,
            callPathControl: true,
            caseBattery: true,
            detectConversations: true,
            doubleTapVolume: true,
            gamingMode: true,
            hiddenAtMode: true,
            noiseCancellation: true,
            noiseControl: true,
            noiseControlModeDualSide: true,
            noiseControlsWithOneEarbud: true,
            noiseReductionAdjustments: true,
            noiseReductionLevels: 1,
            pairingMode: true,
            seamlessConnection: true,
            smartThingsFind: true,
            spatialSensor: true,
            stereoPan: true,
            voltage: true,
        },
        touchOptions: {
            voiceAssistant: 1,
            noiseControl: 2,
            volume: 3,
            spotifySpotOn: 4,
            otherL: 5,
            otherR: 6,
        },

        albumArtIcon: 'earbuds',
        budsIcon: 'earbuds',
        case: 'case-normal',
    },

    // 5) Galaxy Buds 2
    {
        modelId: GalaxyBudsModel.GalaxyBuds2,
        name: 'Galaxy Buds2',

        features: {
            advancedTouchLock: true,
            advancedTouchLockForCalls: true,
            ambientCustomize: true,
            ambientCustomizeVolume: 2,
            ambientExtraLoud: true,
            ambientSidetone: true,
            ambientSound: true,
            ambientVolumeMax: 2,
            autoAdjustSound: true,
            bixbyWakeup: true,
            callPathControl: true,
            caseBattery: true,
            chargingState: true,
            doubleTapVolume: true,
            extraClearCallSound: true,
            fmgRingWhileWearing: true,
            gamingMode: true,
            gearFitTest: true,
            headTracking: true,
            noiseCancellation: true,
            noiseControl: true,
            noiseControlModeDualSide: true,
            noiseControlsWithOneEarbud: true,
            pairingMode: true,
            rename: true,
            seamlessConnection: true,
            smartThingsFind: true,
            spatialSensor: true,
            stereoPan: true,
        },
        touchOptions: {
            voiceAssistant: 1,
            noiseControl: 2,
            volume: 3,
            spotifySpotOn: 4,
            otherL: 5,
            otherR: 6,
        },

        albumArtIcon: 'earbuds',
        budsIcon: 'earbuds',
        case: 'case-normal',
    },

    // 6) Galaxy Buds 2 Pro
    {
        modelId: GalaxyBudsModel.GalaxyBuds2Pro,
        name: 'Galaxy Buds2 Pro',

        features: {
            advancedTouchLock: true,
            advancedTouchLockForCalls: true,
            ambientCustomize: true,
            ambientCustomizeVolume: 2,
            ambientExtraLoud: true,
            ambientSidetone: true,
            ambientSound: true,
            ambientVolumeMax: 2,
            autoAdjustSound: true,
            bixbyWakeup: true,
            callPathControl: true,
            caseBattery: true,
            chargingState: true,
            detectConversations: true,
            doubleTapVolume: true,
            extraClearCallSound: true,
            fmgRingWhileWearing: true,
            gamingMode: true,
            gearFitTest: true,
            headTracking: true,
            noiseCancellation: true,
            noiseControl: true,
            noiseControlModeDualSide: true,
            noiseControlsWithOneEarbud: true,
            rename: true,
            seamlessConnection: true,
            smartThingsFind: true,
            spatialSensor: true,
            stereoPan: true,
        },
        touchOptions: {
            voiceAssistant: 1,
            noiseControl: 2,
            volume: 3,
            spotifySpotOn: 4,
            otherL: 5,
            otherR: 6,
        },

        albumArtIcon: 'earbuds',
        budsIcon: 'earbuds',
        case: 'case-normal',
    },

    // 7) Galaxy Buds FE
    {
        modelId: GalaxyBudsModel.GalaxyBudsFe,
        name: 'Galaxy Buds FE',

        features: {
            advancedTouchLock: true,
            advancedTouchLockForCalls: true,
            ambientCustomize: true,
            ambientCustomizeVolume: 2,
            ambientSidetone: true,
            ambientSound: true,
            ambientVolumeMax: 2,
            bixbyWakeup: true,
            callPathControl: true,
            caseBattery: true,
            chargingState: true,
            fmgRingWhileWearing: true,
            gamingMode: true,
            gearFitTest: true,
            noiseCancellation: true,
            noiseControl: true,
            noiseControlModeDualSide: true,
            noiseControlsWithOneEarbud: true,
            noiseTouchAndHoldNewVersion: true, // Is new? Delete this line
            rename: true,
            seamlessConnection: true,
            smartThingsFind: true,
            stereoPan: true,
        },
        touchOptions: {
            voiceAssistant: 1,
            noiseControl: 2,
            volume: 3,
            spotifySpotOn: 4,
            otherL: 5,
            otherR: 6,
        },

        albumArtIcon: 'earbuds',
        budsIcon: 'earbuds',
        case: 'case-normal',
    },

    // 8) Galaxy Buds 3
    {
        modelId: GalaxyBudsModel.GalaxyBuds3,
        name: 'Galaxy Buds3',

        features: {
            advancedTouchLockForCalls: true,
            advancedTouchIsPinch: true,
            ambientVolumeMax: 2,
            bixbyWakeup: true,
            callPathControl: true,
            caseBattery: true,
            chargingState: true,
            doubleTapVolume: true,
            fmgRingWhileWearing: true,
            gamingMode: true,
            gearFitTest: true,
            noiseCancellation: true,
            noiseControl: true,
            noiseControlModeDualSide: true,
            pairingMode: true,
            rename: true,
            seamlessConnection: true,
            smartThingsFind: true,
            spatialSensor: true,
            stereoPan: true,
            usesStem: true,
        },
        touchOptions: {
            voiceAssistant: 1,
            noiseControl: 2,
            volume: 3,
            spotifySpotOn: 4,
            otherL: 5,
            otherR: 6,
        },

        albumArtIcon: 'earbuds-stem2',
        budsIcon: 'earbuds-stem2',
        case: 'case-normal',
    },

    // 9) Galaxy Buds 3 Pro
    {
        modelId: GalaxyBudsModel.GalaxyBuds3Pro,
        name: 'Galaxy Buds3 Pro',

        features: {
            adaptiveNoiseControl: true,
            advancedTouchLockForCalls: true,
            advancedTouchIsPinch: true,
            ambientCustomize: true,
            ambientCustomizeVolume: 4,
            ambientExtraLoud: true,
            ambientSidetone: true,
            ambientSound: true,
            ambientSoundVolume: true,
            ambientVolumeMax: 4,
            autoAdjustSound: true,
            bixbyWakeup: true,
            callPathControl: true,
            caseBattery: true,
            chargingState: true,
            detectConversations: true,
            doubleTapVolume: true,
            extraClearCallSound: true,
            fmgRingWhileWearing: true,
            gamingMode: true,
            gearFitTest: true,
            headTracking: true,
            lightingControl: true,
            noiseCancellation: true,
            noiseControl: true,
            noiseControlModeDualSide: true,
            noiseControlsWithOneEarbud: true,
            noiseReductionAdjustments: true,
            noiseReductionLevels: 4,
            noiseTouchAndHoldNewVersion: true,
            quickLaunchAdvance: true,
            rename: true,
            seamlessConnection: true,
            smartThingsFind: true,
            spatialSensor: true,
            stereoPan: true,
        },
        touchOptions: {
            voiceAssistant: 1,
            noiseControl: 2,
            volume: 3,
            spotifySpotOn: 4,
            otherL: 5,
            otherR: 6,
        },

        albumArtIcon: 'earbuds-stem',
        budsIcon: 'earbuds-stem',
        case: 'case-normal',
    },
    // 10) Galaxy Buds 3 FE
    {
        modelId: GalaxyBudsModel.GalaxyBuds3Fe,
        name: 'Galaxy Buds3 FE',

        features: {
            adaptiveNoiseControl: true,
            advancedTouchLockForCalls: true,
            advancedTouchIsPinch: true,
            //  ambientCustomize: true,
            ambientExtraLoud: true,
            ambientSidetone: true,
            ambientSound: true,
            ambientSoundVolume: true,
            ambientVolumeMax: 4,
            autoAdjustSound: true,
            bixbyWakeup: true,
            callPathControl: true,
            caseBattery: true,
            chargingState: true,
            detectConversations: true,
            doubleTapVolume: true,
            extraClearCallSound: true,
            fmgRingWhileWearing: true,
            gamingMode: true,
            gearFitTest: true,
            headTracking: true,
            noiseCancellation: true,
            noiseControl: true,
            noiseControlModeDualSide: true,
            noiseControlsWithOneEarbud: true,
            noiseReductionAdjustments: true,
            noiseReductionLevels: 4,
            noiseTouchAndHoldNewVersion: true,
            quickLaunchAdvance: true,
            rename: true,
            seamlessConnection: true,
            smartThingsFind: true,
            spatialSensor: true,
            stereoPan: true,
        },
        touchOptions: {
            voiceAssistant: 1,
            noiseControl: 2,
            volume: 3,
            spotifySpotOn: 4,
            otherL: 5,
            otherR: 6,
        },

        albumArtIcon: 'earbuds-stem',
        budsIcon: 'earbuds-stem',
        case: 'case-normal',
    },
    // 11) Galaxy Buds FE
    {
        modelId: GalaxyBudsModel.GalaxyBudsCore,
        name: 'Galaxy Buds Core',

        features: {
            advancedTouchLock: true,
            advancedTouchLockForCalls: true,
            ambientCustomize: true,
            ambientCustomizeVolume: 2,
            ambientSidetone: true,
            ambientSound: true,
            ambientVolumeMax: 2,
            bixbyWakeup: true,
            callPathControl: true,
            caseBattery: true,
            chargingState: true,
            doubleTapVolume: true,
            fmgRingWhileWearing: true,
            gamingMode: true,
            gearFitTest: true,
            noiseCancellation: true,
            noiseControl: true,
            noiseControlModeDualSide: true,
            noiseControlsWithOneEarbud: true,
            rename: true,
            seamlessConnection: true,
            smartThingsFind: true,
            stereoPan: true,
        },
        touchOptions: {
            voiceAssistant: 1,
            noiseControl: 2,
            volume: 3,
            spotifySpotOn: 4,
            otherL: 5,
            otherR: 6,
        },

        albumArtIcon: 'earbuds',
        budsIcon: 'earbuds',
        case: 'case-normal',
    },
];

