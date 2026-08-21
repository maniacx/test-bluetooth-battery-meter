'use strict';

import RedmiBuds6Play from './deviceConfigs/RedmiBuds6Play.js';
import RedmiBuds8Lite from './deviceConfigs/RedmiBuds8Lite.js';

export const RedmiBudsModelList = [
    RedmiBuds6Play,
    RedmiBuds8Lite,
];

export const MessageType = {
    PHONE_REQUEST: 0xC4,
    RESPONSE: 0x04,
    EARBUDS_REQUEST: 0xC0,
    EARBUDS_RESPONSE: 0x07,
    EARBUDS_NOTIFY: 0xC7,
    UNKNOWN: 0xFF,
};

export const Opcode = {
    GET_DEVICE_INFO: 0x02,
    SET_DEVICE_INFO: 0x08,
    GET_DEVICE_RUN_INFO: 0x09,
    REPORT_STATUS: 0x0E,
    AUTH_CHALLENGE: 0x50,
    AUTH_CONFIRM: 0x51,
    SET_CONFIG: 0xF2,
    GET_CONFIG: 0xF3,
    NOTIFY_CONFIG: 0xF4,
    UNKNOWN: 0xFF,
};

export const ConfigType = {
    SERIAL_NUMBER: 0x27,
    GESTURES: 0x02,
    AUTO_ANSWER: 0x03,
    DOUBLE_CONNECTION: 0x04,
    EQ_PRESET: 0x07,
    RING_MY_BUDS: 0x09,
    LONG_GESTURES: 0x0A,
    ANC: 0x0B,
    ADAPTIVE_ANC: 0x25,
    LOW_LATENCY: 0x2F,
    ADAPTIVE_SOUND: 0x29,
    EQ_CURVE: 0x37,
    PERSONALIZE_ANC: 0x3B,
    ADAPTIVE_VOLUME: 0x48,
    SPATIAL_AUDIO: 0x4F,
    UNKNOWN: 0xFF,
};

export const DeviceInfoRetType = {
    FIRMWARE: 0x01,
    VID_PID: 0x03,
    BATTERY: 0x07,
};

