'use strict';
import {describe, it, assertEqual, assertNull} from './harness.js';
import {parseSwiftPair, parseFastPair, FAST_PAIR_MODELS, parseApple, APPLE_MODELS} from '../src/lib/discovery/advertParsers.js';

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
