'use strict';

import RealmeBudsAir7 from './deviceConfigs/RealmeBudsAir7.js';
import RealmeBudsWireless5ANC from './deviceConfigs/RealmeBudsWireless5ANC.js';

export const OpoBudsModelList = [
    RealmeBudsAir7,
    RealmeBudsWireless5ANC,
];

export const CommonRealmeEqPresets = {
    original_sound: 0x00,
    deep_bass: 0x01,
    serenade: 0x02,
    clear_bass: 0x03,
};

export const CommonRealmeAncLevels = {
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
};

export const CommonGestureMapping = {
    gestureTypes: {
        'single': 0x01,
        'double': 0x02,
        'triple': 0x03,
        'action-hold': 0x04,
        'double-action-hold': 0x06,
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
};

export const Cmd = {
    HANDSHAKE: 0x0100,
    HANDSHAKE_RSP: 0x8100,

    PRODUCT_ID: 0x0103,
    PRODUCT_ID_RSP: 0x8103,

    VERSION: 0x0105,
    VERSION_RSP: 0x8105,

    BATTERY: 0x0106,
    BATTERY_RSP: 0x8106,

    KEY_FUNCTION: 0x0108,
    KEY_FUNCTION_RSP: 0x8108,

    ANC: 0x010C,
    ANC_RSP: 0x810C,

    FEATURE_SWITCH: 0x010D,
    FEATURE_SWITCH_RSP: 0x810D,

    EQ: 0x010F,
    EQ_RSP: 0x810F,

    REGISTER_NOTIFICATION_SINGLE: 0x0201,
    REGISTER_NOTIFICATION_SINGLE_RSP: 0x8201,

    NOTIFICATION_EVENT: 0x0204,

    REGISTER_NOTIFICATION: 0x0205,
    REGISTER_NOTIFICATION_RSP: 0x8205,

    FIND_BUDS: 0x0400,
    FIND_BUDS_RSP: 0x8400,

    SET_KEY_FUNCTION: 0x0401,
    SET_KEY_FUNCTION_RSP: 0x8401,

    SET_KEY_FUNCTION_BULK: 0x0402,
    SET_KEY_FUNCTION_BULK_RSP: 0x8402,

    SET_FEATURE_SWITCH: 0x0403,
    SET_FEATURE_SWITCH_RSP: 0x8403,

    SET_ANC: 0x0404,
    SET_ANC_RSP: 0x8404,

    SET_EQ: 0x0406,
    SET_EQ_RSP: 0x8406,

    SET_EQ_DETAIL: 0x0418,
    SET_EQ_DETAIL_RSP: 0x8418,

    SET_BASS_ENGINE: 0x041B,
    SET_BASS_ENGINE_RSP: 0x841B,

    GET_MULTI_CONNECT_INFO: 0x0112,
    GET_MULTI_CONNECT_INFO_RSP: 0x8112,

    OPERATE_MULTI_CONNECT: 0x040B,
    OPERATE_MULTI_CONNECT_RSP: 0x840B,

    GET_COMPACTNESS_INFO: 0x0114,
    GET_COMPACTNESS_INFO_RSP: 0x8114,

    START_COMPACTNESS_DETECT: 0x0405,
    START_COMPACTNESS_DETECT_RSP: 0x8405,

    SET_SPATIAL_AUDIO: 0x041E,
    SET_SPATIAL_AUDIO_RSP: 0x841E,

    FEATURE_EVENT: 0x0503,
    EQ_NOTIFY: 0x0504,
    KEY_FUNCTION_NOTIFY: 0x0508,
    SPATIAL_NOTIFY: 0x0510,
};

export const CompactnessStatus = {
    UNKNOWN: 0,
    GOOD: 1,
    LEFT_POOR: 2,
    RIGHT_POOR: 3,
    BOTH_POOR: 4,
};

export const FeatureId = {
    IN_EAR: 0x04,
    GAME_MODE: 0x06,
    AUTO_ANSWER: 0x08,
    VOLUME_ENHANCER: 0x09,
    DUAL_DEVICE: 0x11,
    HIGH_RES: 0x18,
    WIND_NOISE: 0x1A,
    SPATIAL: 0x1B,
    DYNAMIC_BASS: 0x1D,
    FIND_PHONE: 0x36,
};

export const FEATURE_CONFIG_MAP = [
    { configKeys: ['inEarDetection'], defaultByte: FeatureId.IN_EAR, name: 'In-Ear Detection', callback: 'updateInEar' },
    { configKeys: ['lowLatencyMode'], defaultByte: FeatureId.GAME_MODE, name: 'Low Latency Game Mode', callback: 'updateLatency' },
    { configKeys: ['dualConnection'], defaultByte: FeatureId.DUAL_DEVICE, name: 'Dual Connection', callback: 'updateDualConnection' },
    { configKeys: ['windReduction', 'windNoiseReduction'], defaultByte: FeatureId.WIND_NOISE, name: 'Wind Noise Reduction', callback: 'updateWindNoise' },
    { configKeys: ['volumeEnhancer'], defaultByte: FeatureId.VOLUME_ENHANCER, name: 'Volume Enhancer', callback: 'updateVolumeEnhancer' },
    { configKeys: ['spatialAudio'], defaultByte: FeatureId.SPATIAL, name: 'Spatial Audio', callback: 'updateSpatialAudio' },
    { configKeys: ['highResAudio'], defaultByte: FeatureId.HIGH_RES, name: 'High-Res LHDC', callback: 'updateHighRes' },
    { configKeys: ['dynamicBass'], defaultByte: FeatureId.DYNAMIC_BASS, name: 'Dynamic Bass', callback: 'updateDynamicBass' },
    { configKeys: ['autoAnswer'], defaultByte: FeatureId.AUTO_ANSWER, name: 'Auto Answer', callback: 'updateAutoAnswer' },
    { configKeys: ['findMyPhone'], defaultByte: FeatureId.FIND_PHONE, name: 'Find My Phone', callback: 'updateFindPhone' },
];

export function resolveFeatureByte(modelData, configKeys, defaultByte) {
    if (!modelData)
        return null;
    const keys = Array.isArray(configKeys) ? configKeys : [configKeys];
    for (const key of keys) {
        const val = modelData[key];
        if (typeof val === 'number')
            return val;
        if (val?.byte !== undefined)
            return val.byte;
        if (val === true)
            return defaultByte;
    }
    return null;
}

export const DefaultBroadcastEvents = [
    0x01, // Battery
    0x02, // Earbuds Status / In-Ear
    0x03, // ANC Mode
    0x04, // Fit Test / Compactness
    0x05, // Game Mode
    0x06, // Multi-Connect
    0x0D, // Dual Connection State
    0x0E, // Ear-Scan / Special
    0x0F, // Spatial Audio State
    0x10, // Audio Codec / Status
    0xF1, // Live User Interaction / Gestures
    0xF2, // Button Events
];

export const EventCode = {
    BATTERY: 0x01,
    EARBUDS_STATUS: 0x02,
    ANC_MODE: 0x03,
    GAME_MODE: 0x05,
    MULTI_CONNECT: 0x06,
    USER_INTERACTION: 0xF1,
};

export const BatteryComponent = {
    LEFT: 1,
    RIGHT: 2,
    CASE: 3,
};

export const NC_CYCLE_BITS = [0x01, 0x02, 0x08];

export function safeJsonParse(str) {
    try {
        return JSON.parse(str);
    } catch {
        return null;
    }
}

export function cycleMaskToEnum(mask) {
    const hasOff = (mask & 0x01) !== 0;
    const hasTrans = (mask & 0x02) !== 0;
    const hasAnc = (mask & 0x08) !== 0;

    if (hasAnc && hasTrans && hasOff)
        return 0x04;
    if (hasAnc && hasTrans)
        return 0x01;
    if (hasAnc && hasOff)
        return 0x02;
    if (hasTrans && hasOff)
        return 0x03;

    return 0x04;
}

export function cycleEnumToMask(code) {
    switch (code) {
        case 0x01:
            return 0x0A;
        case 0x02:
            return 0x09;
        case 0x03:
            return 0x03;
        case 0x04:
            return 0x0B;
        case 0x07:
            return 0x0B;
        case 0x0B:
            return 0x0B;
        default:
            return code;
    }
}

export function widgetMaskToProtocolMask(widgetMask) {
    let mask = 0;
    if (widgetMask & (1 << 0))
        mask |= 0x01;
    if (widgetMask & (1 << 1))
        mask |= 0x02;
    if (widgetMask & (1 << 2))
        mask |= 0x08;
    return mask;
}

export function protocolMaskToWidgetMask(protocolMask) {
    let widgetMask = 0;
    if (protocolMask & 0x01)
        widgetMask |= 1 << 0;
    if (protocolMask & 0x02)
        widgetMask |= 1 << 1;
    if (protocolMask & 0x08 || protocolMask & 0x04)
        widgetMask |= 1 << 2;
    return widgetMask;
}

export function macToReversedBytes(mac) {
    if (!mac || typeof mac !== 'string' || !/^([0-9A-Fa-f]{2}:){5}([0-9A-Fa-f]{2})$/.test(mac))
        return [];
    return mac.split(':').map(h => parseInt(h, 16)).reverse();
}

export function reversedBytesToMac(bytes) {
    if (!bytes || !Array.isArray(bytes) || bytes.length < 6)
        return '';
    const macBytes = [];
    for (let j = 0; j < 6; j++)
        macBytes.push(bytes[5 - j]);
    return macBytes.map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase();
}

export function decodeGesturesHex(hex) {
    const slots = {};
    if (!hex || typeof hex !== 'string' || hex.length % 8 !== 0)
        return slots;

    if (!/^[0-9a-fA-F]*$/.test(hex))
        return slots;

    for (let i = 0; i + 8 <= hex.length; i += 8) {
        const dev = parseInt(hex.slice(i, i + 2), 16);
        const btn = parseInt(hex.slice(i + 2, i + 4), 16);
        const act = parseInt(hex.slice(i + 4, i + 6), 16);
        const func = parseInt(hex.slice(i + 6, i + 8), 16);
        slots[`${dev}_${btn}_${act}`] = func;
    }
    return slots;
}

export function encodeGesturesHex(slotMap, gesturesConfig) {
    if (!gesturesConfig?.slots)
        return '';

    let hex = '';
    gesturesConfig.slots.forEach(slot => {
        const btnId = slot.buttonId ?? 0x01;
        const act = gesturesConfig.mapping.gestureTypes[slot.type];
        const key = `${slot.device}_${btnId}_${act}`;
        const gestureDef = gesturesConfig.gestures[slot.type];
        const allowedActions = slot.actions ?? gestureDef?.actions;
        const defaultFunc = allowedActions?.length
            ? gesturesConfig.mapping.actions[allowedActions[0]]?.[0] ?? 0
            : 0;
        const func = slotMap[key] !== undefined ? slotMap[key] : defaultFunc;

        hex += slot.device.toString(16).padStart(2, '0');
        hex += btnId.toString(16).padStart(2, '0');
        hex += act.toString(16).padStart(2, '0');
        hex += func.toString(16).padStart(2, '0');
    });
    return hex;
}

export function buildPlaceholderGesturesHex(gesturesConfig) {
    if (!gesturesConfig?.slots)
        return '';

    let hex = '';
    gesturesConfig.slots.forEach(slot => {
        const gestureDef = gesturesConfig.gestures[slot.type];
        const allowedActions = slot.actions ?? gestureDef?.actions;
        if (!allowedActions?.length)
            return;

        const firstAction = allowedActions[0];
        const func = gesturesConfig.mapping.actions[firstAction]?.[0] ?? 0;
        const btnId = slot.buttonId ?? 0x01;
        const act = gesturesConfig.mapping.gestureTypes[slot.type];

        hex += slot.device.toString(16).padStart(2, '0');
        hex += btnId.toString(16).padStart(2, '0');
        hex += act.toString(16).padStart(2, '0');
        hex += func.toString(16).padStart(2, '0');
    });
    return hex;
}

export function findChangedGestureSlots(oldHex, newHex, gesturesConfig) {
    const changed = [];
    if (!newHex)
        return changed;

    const baseHex = oldHex ?? buildPlaceholderGesturesHex(gesturesConfig);

    for (let i = 0; i + 8 <= newHex.length; i += 8) {
        const baseChunk = baseHex.slice(i, i + 8);
        const newChunk = newHex.slice(i, i + 8);
        if (baseChunk !== newChunk && newChunk.length === 8) {
            changed.push({
                device: parseInt(newChunk.slice(0, 2), 16),
                buttonId: parseInt(newChunk.slice(2, 4), 16),
                gestureType: parseInt(newChunk.slice(4, 6), 16),
                action: parseInt(newChunk.slice(6, 8), 16),
            });
        }
    }

    return changed;
}

export function findChangedGestureSlot(oldHex, newHex, gesturesConfig) {
    const slots = findChangedGestureSlots(oldHex, newHex, gesturesConfig);
    return slots.length > 0 ? slots[0] : null;
}

export function updateGestureSlotInHex(hex, dev, btn, act, func) {
    if (!hex || hex.length < 8)
        return hex;

    const devHex = dev.toString(16).padStart(2, '0');
    const btnHex = btn.toString(16).padStart(2, '0');
    const actHex = act.toString(16).padStart(2, '0');
    const funcHex = func.toString(16).padStart(2, '0');

    let updated = false;
    let newHex = '';

    for (let i = 0; i + 8 <= hex.length; i += 8) {
        const chunkDev = hex.slice(i, i + 2);
        const chunkBtn = hex.slice(i + 2, i + 4);
        const chunkAct = hex.slice(i + 4, i + 6);

        if (chunkDev === devHex && chunkBtn === btnHex && chunkAct === actHex) {
            newHex += chunkDev + chunkBtn + chunkAct + funcHex;
            updated = true;
        } else {
            newHex += hex.slice(i, i + 8);
        }
    }

    return updated ? newHex : hex;
}
