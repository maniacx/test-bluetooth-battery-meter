# Quick Pair for BudsLink — design

**Date:** 2026-09-03
**Status:** approved (design), pending spec review → plan
**Branch:** `quickpair` (fork of maniacx/BudsLink, GPL-3.0)

## Overview

BudsLink today only manages devices that are **already paired** — `BluetoothClient`
enumerates `org.bluez` and keeps entries whose `Paired == true`. There is no path
that helps a user *pair* a nearby earbud in the first place.

Quick Pair adds that missing front door: a discovery component that detects an
**unpaired** device in pairing mode, decodes its advertisement to a friendly name,
shows a "Connect to X?" notification, and on accept runs BlueZ `Pair()` +
`Connect()`. Once paired, the existing `BluetoothClient` → `EnhancedDeviceSupportManager`
pipeline enhances it (battery/ANC/EQ) with **no changes to that path**.

This is the Linux equivalent of Microsoft Swift Pair / Android Fast Pair popups,
generalized across brands.

## Goals (v1)

- Detect nearby unpaired devices in pairing mode and notify the user.
- Decode adverts to a friendly name across four tiers (Fast Pair, Apple, Swift
  Pair, class fallback).
- One-tap pair + connect + trust; hand off to existing enhancement pipeline.
- A settings toggle to enable/disable Quick Pair discovery.
- No cloud dependency (Fast Pair rich name is best-effort from a local model map).

## Non-goals (v1)

- Google Fast Pair account-key / anti-spoofing key exchange (cloud, grey) — the
  rich per-account experience. We use only the public advert model ID.
- A custom auto-accept pairing agent (rely on the system default agent + Just
  Works for buds). Deferred to phase 2.
- `AdvertisementMonitor1` low-power path (needs `Experimental=true` and hits the
  known MT7925 ext-adv kernel wedge). Deferred as an optimization.
- New per-brand *management* code — reuse what BudsLink already has.

## Architecture

New component runs parallel to `BluetoothClient`, instantiated in
`app.js:_onStartup` and started in `_initialize`:

```
QuickPairScanner (new)
  ├─ Adapter1.SetDiscoveryFilter({Transport:'auto', DuplicateData:true, RSSI:-70})
  ├─ Adapter1.StartDiscovery()   (gated by the quick-pair-enabled toggle; windowed)
  ├─ watches ObjectManager InterfacesAdded + Device1 PropertiesChanged
  │    → reads ManufacturerData / ServiceData / RSSI / Class   (via extended proxy)
  ├─ advertParsers.js  (pure fns) → {kind, name, icon, modelId} | null
  ├─ dedup by address; suppress already-Paired; RSSI gate
  └─ emit 'candidate-found' {path, name, icon, kind}
        │
        ▼
  Notifier.notifyQuickPair(name, icon, onAccept)   (extend notifier.js)
        │ accept
        ▼
  Adapter1/Device1: Device1.Pair() → Connect() → set Trusted=true
        │ Paired → true
        ▼
  existing BluetoothClient 'devices-update' → EnhancedDeviceSupportManager enhances
```

### New / changed files

| File | Change |
|---|---|
| `src/lib/discovery/quickPairScanner.js` | NEW — discovery lifecycle, advert watch, dedup, emit candidates |
| `src/lib/discovery/advertParsers.js` | NEW — pure advert→candidate matchers (4 tiers) + local Fast Pair model map |
| `src/lib/discovery/adapterProxy.js` | NEW — `Adapter1` proxy (StartDiscovery/StopDiscovery/SetDiscoveryFilter) + `Device1` Pair/Connect/Trusted |
| `src/lib/bluezDeviceProxy.js` | EDIT — add `ManufacturerData a{qv}`, `ServiceData a{sv}`, `RSSI n`, `Class u` |
| `src/lib/devices/notifier.js` | EDIT — add `notifyQuickPair(name, icon, onAccept)` (action button) |
| `src/app.js` | EDIT — instantiate + start/stop scanner; wire accept → pair |
| `data/io.github.maniacx.BudsLink.gschema.xml` | EDIT — add `quick-pair-enabled` boolean |
| `src/preferences/...` (settings) | EDIT — add a toggle row |
| `tests/advertParsers.test.js` | NEW — unit tests with real captured advert fixtures |

No change to `bluetoothClient.js` or `enhancedDeviceSupportManager.js` — the
handoff is via the events they already emit.

## Advert parser tiers (advertParsers.js — pure functions)

Input: `{manufacturerData: Map<companyId, bytes>, serviceData: Map<uuid, bytes>,
class, name, rssi}`. Output: `{kind, name, icon, modelId} | null`.

1. **Fast Pair** — `serviceData['0000fe2c-...']`. If length == 3 → 24-bit big-endian
   model ID (discoverable mode). Name = local model map lookup, else fall back to
   BlueZ `Name`/`Alias`. (Length > 3 = not-discoverable account-key frame → ignore
   in v1.)
2. **Apple** — `manufacturerData[0x004C]`, message type `0x07` (proximity pairing).
   Decode model bytes → AirPods/Beats name (reuse `airpods/` model table where
   possible). LibrePods/OpenPods format.
3. **Swift Pair** — `manufacturerData[0x0006]`, first byte `0x03` (Microsoft Beacon,
   Swift Pair), scenario byte, then RSSI byte, then UTF-8 display name — **name is
   in the advert**.
4. **Class fallback** — `Class` major = Audio/Video (0x04xxxx) or HID, AND
   `rssi >= -60` (very close). Name = `Name`/`Alias`. Lowest priority; opt-in via a
   secondary "aggressive" setting so it isn't noisy by default.

Precedence: 1 > 2 > 3 > 4. First match wins.

## Discovery details

- `SetDiscoveryFilter`: `Transport='auto'` (LE + BR/EDR), `DuplicateData=true` (needed
  to keep receiving advert updates), `RSSI=-70` (BlueZ pre-filters weak signals).
- Scan is gated by `quick-pair-enabled` and only runs while the app is held/active;
  stop discovery when disabled or on shutdown to avoid spectrum/battery cost and
  interference with WIFI_LAN-style flows.
- Dedup: keep a short-lived Map keyed by device address; one notification per device
  per discovery session; clear on pair or on InterfacesRemoved.
- Reuse the advert-read idiom already in `socketByGatt.js` (`_manufacturerData`,
  RSSI handling, windowed discovery) rather than reinventing.

## Pairing + handoff

- On accept: `Device1.Pair()` (async), then `Connect()`, then set `Trusted=true`.
- Buds pair Just Works (no PIN); the system default agent auto-confirms. No custom
  agent in v1.
- After `Paired→true`, existing `BluetoothClient._onPropertiesChanged` adds it and
  emits `devices-update` → normal enhancement. Nothing else to wire.

## Error handling

- Discovery start/filter failure: log, mark scanner inactive, app keeps managing
  paired devices (Quick Pair is additive, never fatal).
- Pair/Connect failure: notification "Couldn't connect to X"; leave device for a
  retry on the next advert.
- Missing advert props: parser returns null (no candidate) — never throws.

## Testing

- **Unit (TDD, first):** `advertParsers.js` are pure byte→object functions. Capture
  **real** advert bytes from the user's Galaxy Buds / AirPods (via `bluetoothctl` /
  `btmgmt` / a dump script) → commit as fixtures → write failing tests → implement
  parsers. gjs test runner (jasmine-gjs or a plain gjs assert harness — match repo
  convention; repo currently has no `tests/`, so add a minimal gjs harness).
- **Integration (live):** run the flatpak, put buds in pairing mode, confirm
  notification → pair → device appears in BudsLink managed list. Use the MT7925.

## Phases

1. Capture real adverts → fixtures (needs the user's buds in pairing mode).
2. TDD `advertParsers.js` (tiers 1–4).
3. `adapterProxy.js` + extend `bluezDeviceProxy.js`.
4. `quickPairScanner.js` (discovery lifecycle, dedup, emit).
5. `notifier.js` action + `app.js` wiring + gschema toggle + settings row.
6. Live verify; then consider phase-2 (auto-accept agent, AdvertisementMonitor1,
   Fast Pair model-map expansion).

## Open questions

- Fast Pair model map: seed with the user's own devices first; expand from a
  community model-ID list later (no cloud).
- Test harness choice: confirm whether to pull jasmine-gjs or hand-roll a tiny
  assert runner (leaning hand-rolled to avoid a new build dep).
