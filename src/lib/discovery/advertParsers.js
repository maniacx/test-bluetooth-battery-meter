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

// --- Microsoft Swift Pair ------------------------------------------------
// Manufacturer data under company id 0x0006. Layout:
//   [0]=0x03 (Microsoft Beacon Id), [1]=sub-scenario, [2]=rssi/flags,
//   [3..]=UTF-8 display name (present in the pairing scenarios).
const MS_COMPANY = 0x0006;
const MS_BEACON_SWIFTPAIR = 0x03;

export function parseSwiftPair(advert) {
    const data = advert.manufacturerData?.get(MS_COMPANY);
    if (!data || data.length < 4) return null;
    if (data[0] !== MS_BEACON_SWIFTPAIR) return null;
    const name = decoder.decode(data.slice(3)).replace(/\0+$/, '').trim();
    if (!name) return null;
    return {kind: 'swiftpair', name, icon: 'audio-headphones-symbolic', modelId: null};
}
