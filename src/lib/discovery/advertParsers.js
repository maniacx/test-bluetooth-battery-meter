'use strict';

// Pure advertisement parsers for Quick Pair discovery. No gi:// imports — input is
// plain unpacked data, output is a plain candidate object or null. See
// docs/superpowers/specs/2026-09-03-quickpair-design.md for the wire formats.
//
// advert shape:
//   {
//     manufacturerData: Map<number, Uint8Array>,   // company id -> bytes
//     serviceData:      Map<string, Uint8Array>,   // lowercase uuid -> bytes
//     class:            number | null,              // Bluetooth Class of Device
//     name:             string | null,
//     rssi:             number | null,
//   }
// candidate shape: {kind, name, icon, modelId}

const decoder = new TextDecoder('utf-8');
const ICON = 'audio-headphones-symbolic';

// --- Microsoft Swift Pair ------------------------------------------------
// Manufacturer data under company id 0x0006. Layout:
//   [0]=0x03 (Microsoft Beacon Id), [1]=sub-scenario, [2]=rssi/flags,
//   then the UTF-8 display name. Some devices (e.g. Samsung Galaxy Buds,
//   sub-scenario 0x02) insert a 3-byte sub-header before the name, flagged by a
//   control byte at index 3 (observed: 04 44 24); plain MS beacons (mice) start
//   the name right at index 3.
const MS_COMPANY = 0x0006;
const MS_BEACON_SWIFTPAIR = 0x03;
const CTRL = /[\x00-\x1f]/;
const CTRL_G = /[\x00-\x1f]+/g;
const REPLACEMENT = '�';

export function parseSwiftPair(advert) {
    const data = advert.manufacturerData?.get(MS_COMPANY);
    if (!data || data.length < 4) return null;
    if (data[0] !== MS_BEACON_SWIFTPAIR) return null;
    const nameStart = (data[3] !== undefined && data[3] < 0x20) ? 6 : 3;
    if (data.length <= nameStart) return null;
    const name = decoder.decode(data.slice(nameStart)).replace(CTRL_G, '').trim();
    // Reject non-name payloads from other 0x03 beacons: no decode errors, no
    // leftover control chars, and at least one letter.
    if (!name || name.includes(REPLACEMENT) || CTRL.test(name) || !/[A-Za-z]/.test(name))
        return null;
    return {kind: 'swiftpair', name, icon: ICON, modelId: null};
}

// --- Google Fast Pair ----------------------------------------------------
// 16-bit service UUID 0xFE2C. In discoverable/pairing mode the service data is
// exactly the 3-byte (24-bit, big-endian) model id. Longer frames are the
// not-discoverable account-key filter — ignored in v1.
const FAST_PAIR_UUID = '0000fe2c-0000-1000-8000-00805f9b34fb';

// Seeded from a local model list, never a cloud call.
export const FAST_PAIR_MODELS = new Map();

export function parseFastPair(advert) {
    const data = advert.serviceData?.get(FAST_PAIR_UUID);
    if (!data || data.length !== 3) return null;
    const modelId = (data[0] << 16) | (data[1] << 8) | data[2];
    const name = FAST_PAIR_MODELS.get(modelId) || advert.name?.trim() || 'Fast Pair device';
    return {kind: 'fastpair', name, icon: ICON, modelId};
}

// --- Apple proximity pairing ---------------------------------------------
// Apple Continuity manufacturer data (company id 0x004C) is a sequence of
// [type][length][payload...] messages. Proximity Pairing = type 0x07; its payload
// is [prefix=0x01][model hi][model lo][status][battery...]. Model id is big-endian.
const APPLE_COMPANY = 0x004C;
const APPLE_PROX_PAIRING = 0x07;

export const APPLE_MODELS = new Map();

export function parseApple(advert) {
    const data = advert.manufacturerData?.get(APPLE_COMPANY);
    if (!data || data.length < 5) return null;
    if (data[0] !== APPLE_PROX_PAIRING) return null;
    const modelId = (data[3] << 8) | data[4];
    const name = APPLE_MODELS.get(modelId) || 'AirPods';
    return {kind: 'apple', name, icon: ICON, modelId};
}

// --- Samsung -------------------------------------------------------------
// Galaxy Buds advertise Samsung manufacturer data (company id 0x0075) rather than
// Google Fast Pair. But 0x0075 covers all Samsung gear (phones, watches, TVs), so
// require an Audio/Video class of device to mean a bud/headphone. Model id is not
// reliably in the advert; name comes from the resolved Name/Alias, else generic.
const SAMSUNG_COMPANY = 0x0075;

export function parseSamsung(advert) {
    const data = advert.manufacturerData?.get(SAMSUNG_COMPANY);
    if (!data) return null;
    const cod = advert.class;
    const major = cod == null ? null : (cod >> 8) & 0x1F;
    if (major !== 0x04) return null;
    const name = advert.name?.trim() || 'Galaxy Buds';
    return {kind: 'samsung', name, icon: ICON, modelId: null};
}

// --- Class-of-Device fallback --------------------------------------------
// Bluetooth Class of Device: bits 8-12 are the major device class. 0x04 =
// Audio/Video. Low-confidence, opt-in ('aggressive') fallback for devices that
// carry no vendor pairing beacon. Gated by a close-proximity RSSI floor.
const MAJOR_AUDIO = 0x04;
const CLASS_RSSI_MIN = -60;

export function parseClassFallback(advert, opts = {}) {
    if (!opts.aggressive) return null;
    const cod = advert.class;
    if (cod == null) return null;
    const major = (cod >> 8) & 0x1F;
    if (major !== MAJOR_AUDIO) return null;
    if (advert.rssi == null || advert.rssi < CLASS_RSSI_MIN) return null;
    const name = advert.name?.trim();
    if (!name) return null;
    return {kind: 'class', name, icon: ICON, modelId: null};
}

// --- Dispatcher ----------------------------------------------------------
// Precedence: fast pair > apple > samsung > swift pair > class fallback.
// First match wins.
export function parseAdvert(advert, opts = {aggressive: false}) {
    return parseFastPair(advert)
        || parseApple(advert)
        || parseSamsung(advert)
        || parseSwiftPair(advert)
        || parseClassFallback(advert, opts);
}
