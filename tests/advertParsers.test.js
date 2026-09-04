'use strict';
import {describe, it, assertEqual, assertNull} from './harness.js';
import {parseSwiftPair, parseFastPair, FAST_PAIR_MODELS, parseApple, APPLE_MODELS, parseClassFallback, parseAdvert} from '../src/lib/discovery/advertParsers.js';
import {parseSamsung} from '../src/lib/discovery/advertParsers.js';
import {shouldNotify} from '../src/lib/discovery/discoveryUtils.js';

function mfg(company, bytes) { return new Map([[company, Uint8Array.from(bytes)]]); }
function svc(uuid, bytes) { return new Map([[uuid, Uint8Array.from(bytes)]]); }
const FE2C = '0000fe2c-0000-1000-8000-00805f9b34fb';
const empty = {manufacturerData: new Map(), serviceData: new Map(), class: null, name: null, rssi: null};

describe('parseSwiftPair', () => {
    it('decodes MS beacon 0x0006 display name', () => {
        // [0x03 beaconId][0x01 scenario][0x80 rssi/flags]['M','X',' ','K'...]
        const name = Array.from('MX Keys').map(c => c.charCodeAt(0));
        const advert = {...empty, manufacturerData: mfg(0x0006, [0x03, 0x01, 0x80, ...name])};
        assertEqual(parseSwiftPair(advert), {kind: 'swiftpair', name: 'MX Keys', icon: 'audio-headphones-symbolic', modelId: null});
    });
    it('ignores non-swift 0x0006 beacon id', () => {
        assertNull(parseSwiftPair({...empty, manufacturerData: mfg(0x0006, [0x01, 0x02])}));
    });
    it('returns null without 0x0006', () => {
        assertNull(parseSwiftPair(empty));
    });
    it('decodes real Samsung Buds4 Pro swift beacon (6-byte sub-header)', () => {
        // Real capture: 03 02 80 04 44 24 <name>. Control byte 0x04 at index 3
        // flags the extra 3-byte sub-header; name starts at index 6.
        const nm = Array.from("harsha's Buds4 Pro").map(c => c.charCodeAt(0));
        const advert = {...empty, manufacturerData: mfg(0x0006, [0x03, 0x02, 0x80, 0x04, 0x44, 0x24, ...nm])};
        assertEqual(parseSwiftPair(advert).name, "harsha's Buds4 Pro");
    });
    it('rejects a 0x03 beacon whose payload is non-printable garbage', () => {
        assertNull(parseSwiftPair({...empty, manufacturerData: mfg(0x0006, [0x03, 0x02, 0x80, 0x04, 0xfc, 0x45, 0xd9, 0x99])}));
    });
});

describe('parseFastPair', () => {
    it('decodes 3-byte model id (discoverable frame)', () => {
        FAST_PAIR_MODELS.set(0x123456, 'Pixel Buds Pro');
        const advert = {...empty, serviceData: svc(FE2C, [0x12, 0x34, 0x56])};
        assertEqual(parseFastPair(advert),
            {kind: 'fastpair', name: 'Pixel Buds Pro', icon: 'audio-headphones-symbolic', modelId: 0x123456});
    });
    it('falls back to advert name for unknown model id', () => {
        const advert = {...empty, name: 'Some Buds', serviceData: svc(FE2C, [0xAB, 0xCD, 0xEF])};
        assertEqual(parseFastPair(advert),
            {kind: 'fastpair', name: 'Some Buds', icon: 'audio-headphones-symbolic', modelId: 0xABCDEF});
    });
    it('ignores non-discoverable frame (len != 3)', () => {
        assertNull(parseFastPair({...empty, serviceData: svc(FE2C, [0x00, 0x11, 0x22, 0x33, 0x44])}));
    });
    it('returns null without FE2C', () => { assertNull(parseFastPair(empty)); });
});

describe('parseApple', () => {
    it('decodes proximity-pairing (type 0x07) model id', () => {
        APPLE_MODELS.set(0x2014, 'AirPods Pro');
        // [0x07 type][0x19 len][0x01 prefix][model hi][model lo][status]...
        const advert = {...empty, manufacturerData: mfg(0x004C, [0x07, 0x19, 0x01, 0x20, 0x14, 0x0B])};
        assertEqual(parseApple(advert),
            {kind: 'apple', name: 'AirPods Pro', icon: 'audio-headphones-symbolic', modelId: 0x2014});
    });
    it('falls back to generic name for unknown model', () => {
        const advert = {...empty, manufacturerData: mfg(0x004C, [0x07, 0x19, 0x01, 0xFF, 0xFF, 0x00])};
        assertEqual(parseApple(advert),
            {kind: 'apple', name: 'AirPods', icon: 'audio-headphones-symbolic', modelId: 0xFFFF});
    });
    it('ignores non proximity-pairing apple message (e.g. 0x10)', () => {
        assertNull(parseApple({...empty, manufacturerData: mfg(0x004C, [0x10, 0x05, 0x01, 0x02, 0x03])}));
    });
    it('returns null without 0x004C', () => { assertNull(parseApple(empty)); });
});

const AUDIO_CLASS = 0x240418; // major device class = Audio/Video

describe('parseClassFallback', () => {
    it('matches audio class + strong rssi only when aggressive', () => {
        const advert = {...empty, class: AUDIO_CLASS, name: 'BT Speaker', rssi: -50};
        assertNull(parseClassFallback(advert, {aggressive: false}));
        assertEqual(parseClassFallback(advert, {aggressive: true}),
            {kind: 'class', name: 'BT Speaker', icon: 'audio-headphones-symbolic', modelId: null});
    });
    it('rejects weak rssi even when aggressive', () => {
        assertNull(parseClassFallback({...empty, class: AUDIO_CLASS, name: 'x', rssi: -80}, {aggressive: true}));
    });
    it('rejects non-audio class', () => {
        assertNull(parseClassFallback({...empty, class: 0x000100, name: 'x', rssi: -50}, {aggressive: true}));
    });
});

describe('parseAdvert precedence', () => {
    it('prefers fast pair over class fallback', () => {
        FAST_PAIR_MODELS.set(0x000001, 'Known Buds');
        const advert = {...empty, class: AUDIO_CLASS, rssi: -50,
            serviceData: svc(FE2C, [0x00, 0x00, 0x01])};
        assertEqual(parseAdvert(advert, {aggressive: true}).kind, 'fastpair');
    });
    it('returns null when nothing matches', () => {
        assertNull(parseAdvert(empty, {aggressive: false}));
    });
});

// Real capture: Galaxy Buds4 Pro, company 0x0075, class 0x00244404 (audio).
const BUDS4PRO_MFG = [0x02, 0x09, 0x01, 0x00, 0x00, 0x00, 0x15, 0x06, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x03, 0x01, 0x68, 0x01, 0x5b, 0x48, 0x65, 0x61, 0x64,
    0x70, 0x68, 0x6f, 0x6e, 0x65, 0x5d, 0x20];
const BUDS4PRO_CLASS = 0x00244404;

describe('parseSamsung', () => {
    it('matches company 0x0075 with audio class', () => {
        const advert = {...empty, class: BUDS4PRO_CLASS, name: "harsha's Buds4 Pro",
            manufacturerData: mfg(0x0075, BUDS4PRO_MFG)};
        assertEqual(parseSamsung(advert),
            {kind: 'samsung', name: "harsha's Buds4 Pro", icon: 'audio-headphones-symbolic', modelId: null});
    });
    it('falls back to Galaxy Buds when unnamed', () => {
        const advert = {...empty, class: BUDS4PRO_CLASS, manufacturerData: mfg(0x0075, BUDS4PRO_MFG)};
        assertEqual(parseSamsung(advert).name, 'Galaxy Buds');
    });
    it('ignores non-audio Samsung gear (phone/watch)', () => {
        assertNull(parseSamsung({...empty, class: 0x000100, manufacturerData: mfg(0x0075, [0x01])}));
    });
    it('returns null without 0x0075', () => { assertNull(parseSamsung(empty)); });
});

describe('real devices', () => {
    it('Galaxy Buds4 Pro resolves via parseAdvert as samsung', () => {
        const advert = {...empty, class: BUDS4PRO_CLASS, name: "harsha's Buds4 Pro",
            manufacturerData: mfg(0x0075, BUDS4PRO_MFG)};
        assertEqual(parseAdvert(advert, {aggressive: false}).kind, 'samsung');
    });
});

describe('shouldNotify dedup', () => {
    it('notifies first sight, suppresses repeat within session', () => {
        const seen = new Map();
        assertEqual(shouldNotify(seen, '/org/bluez/hci0/dev_AA', 1000), true);
        assertEqual(shouldNotify(seen, '/org/bluez/hci0/dev_AA', 1005), false);
    });
    it('re-notifies after the cooldown window', () => {
        const seen = new Map();
        shouldNotify(seen, '/p', 1000);
        assertEqual(shouldNotify(seen, '/p', 1000 + 121), true); // > 120s cooldown
    });
});
