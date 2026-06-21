'use strict';

import OnePlusNordBuds3 from './deviceConfigs/OnePlusNordBuds3.js';
import OnePlusBudsZ2 from './deviceConfigs/OnePlusBudsZ2.js';
import RealmeAir7 from './deviceConfigs/RealmeAir7.js';

export const OpoBudsModelList = [
    OnePlusNordBuds3,
    OnePlusBudsZ2,
    RealmeAir7,
];

export const PayloadType = {
    SEND_INIT: 0x0100,

    BATTERY_GET: 0x0106,
    BATTERY_RET: 0x8106,

    DEVICE_INFO: 0x0204,

    FIRMWARE_GET: 0x0105,
    FIRMWARE_RET: 0x8105,

    INEAR_STATUS_GET: 0x0109,
    INEAR_STATUS_RET: 0x8109,

    VID_GET: 0x0102,
    VID_RET: 0x8102,

    PID_GET: 0x0103,
    PID_RET: 0x8103,

    NOISE_REDUCTION_GET: 0x010C,
    NOISE_REDUCTION_SET: 0x0404,
    NOISE_REDUCTION_RET: 0x810C,
    NOISE_REDUCTION_ACK: 0x8404,

    EQPRESET_GET: 0x010F,
    EQPRESET_SET: 0x0406,
    EQPRESET_RET: 0x810F,
    EQPRESET_ACK: 0x8406,

    EQCUSTOM_GET: 0x0506,
    EQCUSTOM_SET: 0x0418,
    EQCUSTOM_RET: 0x0504,
    EQCUSTOM_ACK: 0x8418,

    BASS_GET: 0x0124,
    BASS_SET: 0x041B,
    BASS_RET: 0x8124,
    BASS_ACK: 0x841B,

    TOUCH_CONFIG_GET: 0x0108,
    TOUCH_CONFIG_SET: 0x0401,
    TOUCH_CONFIG_RET: 0x8108,
    TOUCH_CONFIG_ACK: 0x8401,

    FIND_DEVICE_SET: 0x0400,
    FIND_DEVICE_ACK: 0x8400,
};

