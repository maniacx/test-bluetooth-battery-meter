'use strict';

import MomentumWireless5 from './deviceConfigs/MomentumWireless5.js';
import MomentumWireless4 from './deviceConfigs/MomentumWireless4.js';
import MomentumTrueWireless4 from './deviceConfigs/MomentumTrueWireless4.js';
import HDB630 from './deviceConfigs/HDB630.js';
import AccentumWireless from './deviceConfigs/AccentumWireless.js';
import AccentumTrueWireless from './deviceConfigs/AccentumTrueWireless.js';
import AccentumPlusWireless from './deviceConfigs/AccentumPlusWireless.js';

export const SenhBudsModelList = [
    MomentumWireless5,
    MomentumWireless4,
    MomentumTrueWireless4,
    HDB630,
    AccentumWireless,
    AccentumTrueWireless,
    AccentumPlusWireless,
];

export const VendorType = {
    QCOM: 0x001D,
    SENH: 0x0495,
};

export const CommandType = {
    MODELID_GET: 0x1206,
    MODELID_RET: 0x1306,

    REGISTER_NOTI_SET: 0x0007,
    REGISTER_NOTI_RET: 0x0107,

    FIRMWARE_GET: 0x1202,
    FIRMWARE_RET: 0x1302,

    BATT_LEVEL_GET: 0x0603,
    BATT_LEVEL_RET: 0x0703,
    BATT_LEVEL_NOTI: 0x0683,

    BATT_STATUS_GET: 0x0602,
    BATT_STATUS_RET: 0x0702,
    BATT_STATUS_NOTI: 0x0682,

    INEAR_STATE_GET: 0x0402,
    INEAR_STATE_RET: 0x0502,
    INEAR_STATE_NOTI: 0x0482,

    ANC_STATUS_GET: 0x1A05,
    ANC_STATUS_SET: 0x1A04,
    ANC_STATUS_RET: 0x1B05,
    ANC_STATUS_RET2: 0x1B04,
    ANC_STATUS_NOTI: 0x1A85,

    ANC_MODE_GET: 0x1A01,
    ANC_MODE_SET: 0x1A00,
    ANC_MODE_RET: 0x1B01,
    ANC_MODE_RET2: 0x1B00,
    ANC_MODE_NOTI: 0x1A81,

    ANC_TRANSP_LEVEL_GET: 0x1A03,
    ANC_TRANSP_LEVEL_SET: 0x1A02,
    ANC_TRANSP_LEVEL_RET: 0x1B03,
    ANC_TRANSP_LEVEL_RET2: 0x1B02,
    ANC_TRANSP_LEVEL_NOTI: 0x1A83,

    TRANSP_STATE_GET: 0x1805,
    TRANSP_STATE_SET: 0x1804,
    TRANSP_STATE_RET: 0x1905,
    TRANSP_STATE_RET2: 0x1904,
    TRANSP_STATE_NOTI: 0x1885,

    TRANSP_LEVEL_GET: 0x1803,
    TRANSP_LEVEL_SET: 0x1802,
    TRANSP_LEVEL_RET: 0x1903,
    TRANSP_LEVEL_RET2: 0x1902,
    TRANSP_LEVEL_NOTI: 0x1883,

    AUDIO_MODE_GET: 0x0804,
    AUDIO_MODE_SET: 0x0803,
    AUDIO_MODE_RET: 0x0904,
    AUDIO_MODE_RET2: 0x0903,
    AUDIO_MODE_NOTI: 0x0884,

    BASS_BOOST_GET: 0x1009,
    BASS_BOOST_SET: 0x1008,
    BASS_BOOST_RET: 0x1108,
    BASS_BOOST_RET2: 0x1109,
    BASS_BOOST_NOTI: 0x1089,

    CROSSFEED_GET: 0x2E01,
    CROSSFEED_SET: 0x2E00,
    CROSSFEED_RET: 0x2F01,
    CROSSFEED_NOTI: 0x2E81,

    SIDETONE_GET: 0x0806,
    SIDETONE_SET: 0x0805,
    SIDETONE_RET: 0x0906,
    SIDETONE_RET2: 0x0905,

    COMFORT_CALL_GET: 0x0815,
    COMFORT_CALL_SET: 0x0814,
    COMFORT_CALL_RET: 0x0915,
    COMFORT_CALL_RET2: 0x0914,

    PAUSE_ON_TRANS_GET: 0x1801,
    PAUSE_ON_TRANS_SET: 0x1800,
    PAUSE_ON_TRANS_RET: 0x1900,
    PAUSE_ON_TRANS_RET2: 0x1901,

    INEAR_SETTING_GET: 0x0401,
    INEAR_SETTING_SET: 0x0400,
    INEAR_SETTING_RET: 0x0501,
    INEAR_SETTING_RET2: 0x0500,

    SMART_PAUSE_GET: 0x080D,
    SMART_PAUSE_SET: 0x080C,
    SMART_PAUSE_RET: 0x090D,
    SMART_PAUSE_RET2: 0x090C,

    AUTO_CALL_GET: 0x080B,
    AUTO_CALL_SET: 0x080A,
    AUTO_CALL_RET: 0x090B,
    AUTO_CALL_RET2: 0x090A,

    AUTO_POWER_OFF_GET: 0x0601,
    AUTO_POWER_OFF_SET: 0x0600,
    AUTO_POWER_OFF_RET: 0x0701,
    AUTO_POWER_OFF_RET2: 0x0700,

    CODEC_GET: 0x0800,
    CODEC_RET: 0x0900,
    CODEC_NOTI: 0x0880,

    FIND_BUD_RING_SET: 0x2C02,
    FIND_BUD_STOP_SET: 0x2C01,

    EQ_CONFIG_GET: 0x1000,
    EQ_CONFIG_RET: 0x1100,

    EQ_BAND_GET: 0x1002,
    EQ_BAND_SET: 0x1001,
    EQ_BAND_RET: 0x1102,
    EQ_BAND_RET2: 0x1101,
    EQ_BAND_NOTI: 0x1082,
};

export const CodecMap = {
    0: 'SBC',
    1: 'AAC',
    2: 'aptX',
    3: 'aptX-LL',
    4: 'MP3',
    5: 'aptX-HD',
    6: 'Faststream',
    7: 'LHDC',
    8: 'aptX adaptive',
    9: 'aptX Lossless',
    10: 'LC3',
    255: '',
};
