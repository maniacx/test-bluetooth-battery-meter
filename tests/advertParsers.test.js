'use strict';
import {describe, it, assertEqual, assertNull} from './harness.js';
import {parseSwiftPair} from '../src/lib/discovery/advertParsers.js';

function mfg(company, bytes) { return new Map([[company, Uint8Array.from(bytes)]]); }
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
