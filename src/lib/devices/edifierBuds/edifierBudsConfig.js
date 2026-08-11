'use strict';

import X5Pro from './deviceConfigs/X5Pro.js';

export const EdifierBudsModelList = [
    X5Pro,
];

/**
Reference Material and Credits

Protocol recovered from the "Edifier ConneX" Android application
(com.edifier.edifierconnex): com.edifier.lib_connect.{model.CommandBean,
manager.CommandManager, constant.ECCommand, constant.CommandIndex,
parser.CommandParser}.
**/

/* Frame delimiters — ECCommand$CommandHeaderCode */
export const HeaderCode = {
    SEND: 0xAA,
    RECEIVE: 0xBB,
    RECEIVE_LEGACY: 0xCC,
};

/* ECCommand$CommandAppCode — only used by the V2 framing */
export const AppCode = {
    EC: 0xEC,
    EC_ED: 0xED,
    BOX: 0x06,
};

/* ECCommand$VendorCode */
export const VendorCode = {
    EDIFIER: 0xE007,
};

/* Seed for the V1 checksum (CommandManager.BleV1CRCCode) */
export const CrcSeedV1 = 0x2019;

/* Protocol variants. The device reports which one it speaks in the trailing bytes
   of its BLE manufacturer data: version = mfg[len - 2], encryption = mfg[len - 1]. */
export const ProtocolVersion = {
    V1: 1,
    V2: 2,
};

/* enums/EncryptionCode — DEFAULT leaves the payload untouched; XOR10 XORs every
   payload byte with a constant. The enum carries both a key (the code advertised
   by the device) and a value (the XOR constant):
     Default      key 0x00, value 0x00
     Encryption10 key 0x10, value 0xA5
   The X5 Pro advertises 0x10, so its payloads are XORed with 0xA5. */
export const EncryptionCode = {
    DEFAULT: 0x00,
    XOR10: 0x10,
};

export const XOR10_VALUE = 0xA5;

/* Company identifier in Edifier BLE advertisements, as decoded by BlueZ.
   The advertisement payload is: classicAddress[6] | protocolVersion | encryption */
export const EdifierManufacturerId = 0x07E0;

/* constant/CommandIndex — the subset this implementation uses.
   Values are the command byte carried at offset 2 of every frame. */
export const CommandType = {
    BATTERY_QUERY: 0xD0,

    ANC_QUERY: 0xCC,
    ANC_SET: 0xC1,

    EQ_QUERY: 0xD5,
    EQ_SET: 0xC4,

    VERSION_QUERY: 0xC6,
    NAME_QUERY: 0xC9,
    MAC_QUERY: 0xC8,

    DEVICE_FUNCTION_QUERY: 0xD8,
    DEVICE_STATE_QUERY: 0xF2,

    IN_EAR_STATE_QUERY: 0xFB,
    IN_EAR_STATE_SET: 0xFC,

    GAME_STATE_QUERY: 0x08,
    GAME_STATE_SET: 0x09,

    TAP_QUERY: 0xF0,
    TAP_SET: 0xF1,

    AUTO_SHUTDOWN_QUERY: 0xD7,
    AUTO_SHUTDOWN_SET: 0xD6,

    A2DP_QUERY: 0xC3,
    LDAC_STATE_QUERY: 0x48,
    LDAC_STATE_SET: 0x49,
};

/* ANC_QUERY replies with [group, mode]; ANC_SET takes [group, mode] on V2 and
   [mode] on V1. The group (ECCommand$ANCIndex, ANC01..ANC2B) selects which modes
   a model offers — CmdParserExtKt switches on it to build the selector.
   An X5 Pro reports group 0x17, whose selector offers exactly these three. */
export const AncGroup = {
    X5PRO: 0x17,
};

export const AncMode = {
    NOISE_CANCELLING: 0x01,
    AMBIENT_SOUND: 0x02,
    OFF: 0x03,
};

export const EqPreset = {
    CLASSIC: 0x00,
    POP: 0x01,
    CLASSICAL: 0x02,
    ROCK: 0x03,
    HIPHOP: 0x04,
};
