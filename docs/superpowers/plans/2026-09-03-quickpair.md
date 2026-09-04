# Quick Pair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a discovery front door to BudsLink that detects an unpaired device in pairing mode, decodes its advert to a friendly name, notifies the user, and pairs on one tap — then lets the existing pipeline enhance it.

**Architecture:** A new `QuickPairScanner` runs parallel to `BluetoothClient`. It drives `Adapter1.StartDiscovery`, reads advert data (ManufacturerData/ServiceData/RSSI/Class) off `Device1`, and passes plain unpacked data to pure `advertParsers` functions. A match emits `candidate-found` → notification → `Device1.Pair()`/`Connect()`. Once `Paired` flips true, the untouched `BluetoothClient`→`EnhancedDeviceSupportManager` path enhances the device.

**Tech Stack:** GJS (GNOME JavaScript), GTK4/libadwaita, Gio D-Bus, BlueZ `org.bluez`, meson/flatpak. Tests run with host `gjs` via a hand-rolled assert harness (no new build dep).

**Spec:** `docs/superpowers/specs/2026-09-03-quickpair-design.md`

## Global Constraints

- License: GPL-3.0-or-later; match existing file style (`'use strict';`, 4-space indent, ESM `import ... from`).
- Parsers MUST be pure: input is plain JS (`Map<number,Uint8Array>`, `Map<string,Uint8Array>`, numbers, strings), output is a plain object or `null`. No `gi://` imports in `advertParsers.js`.
- No cloud calls. Fast Pair name resolution is a local map + advert-name fallback only.
- Discovery only runs while `quick-pair-enabled` gschema key is true; always `StopDiscovery` on disable/shutdown.
- No changes to `bluetoothClient.js` or `enhancedDeviceSupportManager.js`.
- Commit after every task with the session footer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_01JV4Hakbf1K9azjxYzETM26`.

## File Structure

- `src/lib/discovery/advertParsers.js` — NEW, pure: per-tier matchers + `parseAdvert()` dispatcher + `FAST_PAIR_MODELS`/`APPLE_MODELS` maps.
- `src/lib/discovery/adapterProxy.js` — NEW: `Adapter1` proxy (discovery control) + `Device1` action calls (Pair/Connect/Trusted).
- `src/lib/discovery/quickPairScanner.js` — NEW, GObject: discovery lifecycle, Variant→plain unpack, dedup, emits `candidate-found`.
- `src/lib/bluezDeviceProxy.js` — MODIFY: add `ManufacturerData`, `ServiceData`, `RSSI`, `Class` to the introspection XML.
- `src/lib/devices/notifier.js` — MODIFY: add `notifyQuickPair(name, icon, onAccept)`.
- `src/app.js` — MODIFY: construct + start/stop scanner; wire accept→pair.
- `data/io.github.maniacx.BudsLink.gschema.xml` — MODIFY: add `quick-pair-enabled` boolean.
- `tests/harness.js` — NEW: tiny assert/test runner for gjs.
- `tests/run.js` — NEW: imports and runs all `*.test.js`.
- `tests/advertParsers.test.js` — NEW: unit tests with constructed advert bytes.
- `scripts/capture-adverts.sh` — NEW: live advert capture helper.

---

### Task 1: Test harness + Swift Pair parser

Swift Pair is simplest — the display name is inside the advert, no lookup.

**Files:**
- Create: `tests/harness.js`, `tests/run.js`, `tests/advertParsers.test.js`
- Create: `src/lib/discovery/advertParsers.js`

**Interfaces:**
- Produces: `parseSwiftPair(advert) -> {kind:'swiftpair', name, icon:'audio-headphones-symbolic', modelId:null} | null` where `advert = {manufacturerData: Map<number,Uint8Array>, serviceData: Map<string,Uint8Array>, class:number|null, name:string|null, rssi:number|null}`.
- Produces test helpers: `describe(name, fn)`, `it(name, fn)`, `assertEqual(a,b,msg)`, `assertNull(a,msg)`.

- [ ] **Step 1: Write the harness**

`tests/harness.js`:
```javascript
'use strict';
let failures = 0;
let total = 0;
let suite = '';
export function describe(name, fn) { suite = name; fn(); }
export function it(name, fn) {
    total++;
    try { fn(); print(`  ok  - ${suite} > ${name}`); }
    catch (e) { failures++; printerr(`  FAIL - ${suite} > ${name}\n        ${e.message}`); }
}
export function assertEqual(actual, expected, msg = '') {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${msg} expected ${e} got ${a}`);
}
export function assertNull(actual, msg = '') {
    if (actual !== null) throw new Error(`${msg} expected null got ${JSON.stringify(actual)}`);
}
export function report() {
    print(`\n${total - failures}/${total} passed`);
    if (failures > 0) imports.system.exit(1);
}
```

`tests/run.js`:
```javascript
'use strict';
import './advertParsers.test.js';
import {report} from './harness.js';
report();
```

- [ ] **Step 2: Write the failing test**

`tests/advertParsers.test.js`:
```javascript
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd ~/Desktop/BudsLink && gjs -m tests/run.js`
Expected: FAIL — `parseSwiftPair` not exported / module not found.

- [ ] **Step 4: Write minimal implementation**

`src/lib/discovery/advertParsers.js`:
```javascript
'use strict';

// Microsoft Swift Pair: manufacturer data under company id 0x0006.
// Layout: [0]=0x03 (Microsoft Beacon Id), [1]=sub-scenario, [2]=rssi/flags,
// [3..]=UTF-8 display name (present in the pairing scenarios).
const MS_COMPANY = 0x0006;
const MS_BEACON_SWIFTPAIR = 0x03;
const decoder = new TextDecoder('utf-8');

export function parseSwiftPair(advert) {
    const data = advert.manufacturerData?.get(MS_COMPANY);
    if (!data || data.length < 4) return null;
    if (data[0] !== MS_BEACON_SWIFTPAIR) return null;
    const name = decoder.decode(data.slice(3)).replace(/\0+$/, '').trim();
    if (!name) return null;
    return {kind: 'swiftpair', name, icon: 'audio-headphones-symbolic', modelId: null};
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `gjs -m tests/run.js`
Expected: PASS (3/3 for parseSwiftPair).

- [ ] **Step 6: Commit**

```bash
git add tests/ src/lib/discovery/advertParsers.js
git commit -m "feat(quickpair): swift pair advert parser + gjs test harness"
```

---

### Task 2: Fast Pair parser

**Files:**
- Modify: `src/lib/discovery/advertParsers.js`
- Modify: `tests/advertParsers.test.js`

**Interfaces:**
- Produces: `parseFastPair(advert) -> {kind:'fastpair', name, icon:'audio-headphones-symbolic', modelId:number} | null`.
- Produces: `FAST_PAIR_MODELS: Map<number,string>` (seeded, extendable).

- [ ] **Step 1: Write the failing test**

Append to `tests/advertParsers.test.js`:
```javascript
import {parseFastPair, FAST_PAIR_MODELS} from '../src/lib/discovery/advertParsers.js';

const FE2C = '0000fe2c-0000-1000-8000-00805f9b34fb';
function svc(uuid, bytes) { return new Map([[uuid, Uint8Array.from(bytes)]]); }

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `gjs -m tests/run.js`
Expected: FAIL — `parseFastPair` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/discovery/advertParsers.js`:
```javascript
// Google Fast Pair: 16-bit service UUID 0xFE2C. In discoverable/pairing mode the
// service data is exactly the 3-byte (24-bit, big-endian) model id. Longer frames
// are the not-discoverable account-key filter — ignored in v1.
const FAST_PAIR_UUID = '0000fe2c-0000-1000-8000-00805f9b34fb';

// Seed map; expanded from a local community model list, never a cloud call.
export const FAST_PAIR_MODELS = new Map();

export function parseFastPair(advert) {
    const data = advert.serviceData?.get(FAST_PAIR_UUID);
    if (!data || data.length !== 3) return null;
    const modelId = (data[0] << 16) | (data[1] << 8) | data[2];
    const name = FAST_PAIR_MODELS.get(modelId) || advert.name?.trim() || 'Fast Pair device';
    return {kind: 'fastpair', name, icon: 'audio-headphones-symbolic', modelId};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `gjs -m tests/run.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/advertParsers.test.js src/lib/discovery/advertParsers.js
git commit -m "feat(quickpair): fast pair (FE2C) advert parser"
```

---

### Task 3: Apple proximity-pairing parser

**Files:**
- Modify: `src/lib/discovery/advertParsers.js`
- Modify: `tests/advertParsers.test.js`

**Interfaces:**
- Produces: `parseApple(advert) -> {kind:'apple', name, icon:'audio-headphones-symbolic', modelId:number} | null`.
- Produces: `APPLE_MODELS: Map<number,string>`.

- [ ] **Step 1: Write the failing test**

Append to `tests/advertParsers.test.js`:
```javascript
import {parseApple, APPLE_MODELS} from '../src/lib/discovery/advertParsers.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `gjs -m tests/run.js`
Expected: FAIL — `parseApple` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/discovery/advertParsers.js`:
```javascript
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
    return {kind: 'apple', name, icon: 'audio-headphones-symbolic', modelId};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `gjs -m tests/run.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/advertParsers.test.js src/lib/discovery/advertParsers.js
git commit -m "feat(quickpair): apple proximity-pairing advert parser"
```

---

### Task 4: Class fallback + precedence dispatcher

**Files:**
- Modify: `src/lib/discovery/advertParsers.js`
- Modify: `tests/advertParsers.test.js`

**Interfaces:**
- Produces: `parseClassFallback(advert, {aggressive}) -> {kind:'class', name, icon, modelId:null} | null`.
- Produces: `parseAdvert(advert, opts={aggressive:false}) -> candidate | null` — precedence fastpair > apple > swiftpair > class.

- [ ] **Step 1: Write the failing test**

Append to `tests/advertParsers.test.js`:
```javascript
import {parseClassFallback, parseAdvert} from '../src/lib/discovery/advertParsers.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `gjs -m tests/run.js`
Expected: FAIL — `parseClassFallback`/`parseAdvert` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/discovery/advertParsers.js`:
```javascript
// Bluetooth Class of Device: bits 8-12 are the major device class.
// 0x04 = Audio/Video. Used only as a low-confidence, opt-in fallback.
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
    return {kind: 'class', name, icon: 'audio-headphones-symbolic', modelId: null};
}

export function parseAdvert(advert, opts = {aggressive: false}) {
    return parseFastPair(advert)
        || parseApple(advert)
        || parseSwiftPair(advert)
        || parseClassFallback(advert, opts);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `gjs -m tests/run.js`
Expected: PASS (full suite green).

- [ ] **Step 5: Commit**

```bash
git add tests/advertParsers.test.js src/lib/discovery/advertParsers.js
git commit -m "feat(quickpair): class fallback + precedence dispatcher"
```

---

### Task 5: Extend device proxy + adapter/device action proxy

Thin D-Bus wrappers; verified by build + a live smoke, not unit tests (they only wrap gio).

**Files:**
- Modify: `src/lib/bluezDeviceProxy.js`
- Create: `src/lib/discovery/adapterProxy.js`

**Interfaces:**
- Produces (adapterProxy): `getAdapterProxy(path='/org/bluez/hci0')`, `async startDiscovery(adapter, filter)`, `async stopDiscovery(adapter)`, `async pairAndConnect(devicePath)`.

- [ ] **Step 1: Extend the device proxy introspection**

In `src/lib/bluezDeviceProxy.js`, add inside the `org.bluez.Device1` interface XML (alongside the existing properties):
```xml
    <property name="ManufacturerData" type="a{qv}" access="read"/>
    <property name="ServiceData" type="a{sv}" access="read"/>
    <property name="RSSI" type="n" access="read"/>
    <property name="Class" type="u" access="read"/>
```

- [ ] **Step 2: Create the adapter/action proxy**

`src/lib/discovery/adapterProxy.js`:
```javascript
'use strict';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const BLUEZ = 'org.bluez';
const ADAPTER_IFACE = 'org.bluez.Adapter1';
const DEVICE_IFACE = 'org.bluez.Device1';
const PROPS_IFACE = 'org.freedesktop.DBus.Properties';

const AdapterXml = `
<node><interface name="org.bluez.Adapter1">
  <method name="StartDiscovery"/>
  <method name="StopDiscovery"/>
  <method name="SetDiscoveryFilter"><arg name="filter" type="a{sv}" direction="in"/></method>
</interface></node>`;
const AdapterProxy = Gio.DBusProxy.makeProxyWrapper(AdapterXml);

export function getAdapterProxy(path = '/org/bluez/hci0') {
    return new AdapterProxy(Gio.DBus.system, BLUEZ, path);
}

export async function setDiscoveryFilter(adapter, rssi = -70) {
    const filter = new GLib.Variant('a{sv}', {
        Transport: GLib.Variant.new_string('auto'),
        DuplicateData: GLib.Variant.new_boolean(true),
        RSSI: GLib.Variant.new_int16(rssi),
    });
    await adapter.SetDiscoveryFilterAsync(filter);
}

export async function pairAndConnect(devicePath) {
    const conn = Gio.DBus.system;
    await conn.call(BLUEZ, devicePath, DEVICE_IFACE, 'Pair', null, null,
        Gio.DBusCallFlags.NONE, 60000, null);
    await conn.call(BLUEZ, devicePath, DEVICE_IFACE, 'Connect', null, null,
        Gio.DBusCallFlags.NONE, 30000, null);
    await conn.call(BLUEZ, devicePath, PROPS_IFACE, 'Set',
        new GLib.Variant('(ssv)', [DEVICE_IFACE, 'Trusted', GLib.Variant.new_boolean(true)]),
        null, Gio.DBusCallFlags.NONE, 5000, null);
}
```

- [ ] **Step 3: Rebuild to verify it compiles/loads**

Run: `flatpak-builder --user --install --force-clean --disable-rofiles-fuse _fbuild io.github.maniacx.BudsLink.yml 2>&1 | tail -5`
Expected: build succeeds (EXIT 0). (No behavior yet — proxies unused.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/bluezDeviceProxy.js src/lib/discovery/adapterProxy.js
git commit -m "feat(quickpair): advert props on device proxy + adapter/pair proxy"
```

---

### Task 6: QuickPairScanner (unpack + dedup + lifecycle)

**Files:**
- Create: `src/lib/discovery/quickPairScanner.js`
- Modify: `tests/advertParsers.test.js` (add unpack + dedup unit tests via exported pure helpers)

**Interfaces:**
- Produces: `unpackAdvert(bluezProps) -> advert` (pure; converts a plain object of GLib.Variant-like values — in tests, plain values — into the parser input shape). Exported from `quickPairScanner.js` as a static helper that does NOT touch gi when given already-unpacked values.
- Produces: `QuickPairScanner` GObject with signal `candidate-found` (`{path, name, icon, kind}`), methods `async start()`, `stop()`, `destroy()`, and a `seen` Map for dedup.

- [ ] **Step 1: Write the failing test for the dedup helper**

Append to `tests/advertParsers.test.js`:
```javascript
import {shouldNotify} from '../src/lib/discovery/quickPairScanner.js';

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
```
> Note: `quickPairScanner.js` imports `gi://` at module top. Running this test file with `gjs -m` loads gi lazily; `shouldNotify` is pure and callable. If gi import at load fails outside a session, move `shouldNotify` into a sibling `discoveryUtils.js` with no gi import and re-point the test. Prefer the sibling file to keep tests gi-free.

Adjust import to the sibling if needed:
```javascript
// import {shouldNotify} from '../src/lib/discovery/discoveryUtils.js';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `gjs -m tests/run.js`
Expected: FAIL — `shouldNotify` not found.

- [ ] **Step 3: Implement the pure helpers (gi-free sibling)**

`src/lib/discovery/discoveryUtils.js`:
```javascript
'use strict';
const COOLDOWN_SECONDS = 120;

// seen: Map<path, lastNotifiedEpochSeconds>. Returns true if we should notify now.
export function shouldNotify(seen, path, nowSeconds) {
    const last = seen.get(path);
    if (last !== undefined && nowSeconds - last <= COOLDOWN_SECONDS) return false;
    seen.set(path, nowSeconds);
    return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `gjs -m tests/run.js`
Expected: PASS.

- [ ] **Step 5: Implement the scanner**

`src/lib/discovery/quickPairScanner.js`:
```javascript
'use strict';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {getBluezDeviceProxy} from '../bluezDeviceProxy.js';
import {getAdapterProxy, setDiscoveryFilter} from './adapterProxy.js';
import {parseAdvert} from './advertParsers.js';
import {shouldNotify} from './discoveryUtils.js';
import {createLogger} from '../devices/logger.js';

const BLUEZ = 'org.bluez';
const OBJ_MANAGER_IFACE = 'org.freedesktop.DBus.ObjectManager';
const DEVICE_IFACE = 'org.bluez.Device1';
const PROPS_IFACE = 'org.freedesktop.DBus.Properties';

function unpackVariantMap(v) {
    // a{qv} or a{sv} deepUnpack -> {key: GLib.Variant}; convert values to Uint8Array
    const out = new Map();
    if (!v) return out;
    const obj = v.deepUnpack?.() ?? v;
    for (const [k, val] of Object.entries(obj)) {
        const bytes = val?.deepUnpack?.() ?? val;
        out.set(isNaN(Number(k)) ? k.toLowerCase() : Number(k), Uint8Array.from(bytes));
    }
    return out;
}

export const QuickPairScanner = GObject.registerClass({
    Signals: {'candidate-found': {param_types: [GObject.TYPE_JSOBJECT]}},
}, class QuickPairScanner extends GObject.Object {
    _init(opts = {}) {
        super._init();
        this._log = createLogger('QuickPairScanner');
        this._bus = Gio.DBus.system;
        this._aggressive = !!opts.aggressive;
        this._seen = new Map();
        this._active = false;
    }

    async start() {
        if (this._active) return;
        try {
            this._adapter = getAdapterProxy();
            await setDiscoveryFilter(this._adapter, -70);
            this._addedId = this._bus.signal_subscribe(BLUEZ, OBJ_MANAGER_IFACE,
                'InterfacesAdded', null, null, Gio.DBusSignalFlags.NONE,
                this._onInterfacesAdded.bind(this));
            this._changedId = this._bus.signal_subscribe(BLUEZ, PROPS_IFACE,
                'PropertiesChanged', null, DEVICE_IFACE, Gio.DBusSignalFlags.NONE,
                this._onPropsChanged.bind(this));
            await this._adapter.StartDiscoveryAsync();
            this._active = true;
            this._log.info('discovery started');
        } catch (e) {
            this._log.error(e);
        }
    }

    _evaluate(path) {
        try {
            const p = getBluezDeviceProxy(path);
            if (p.Paired) return;
            const advert = {
                manufacturerData: unpackVariantMap(p.ManufacturerData),
                serviceData: unpackVariantMap(p.ServiceData),
                class: p.Class ?? null,
                name: p.Name ?? p.Alias ?? null,
                rssi: p.RSSI ?? null,
            };
            const cand = parseAdvert(advert, {aggressive: this._aggressive});
            if (!cand) return;
            const now = GLib.get_monotonic_time() / 1e6;
            if (!shouldNotify(this._seen, path, now)) return;
            this.emit('candidate-found', {path, ...cand});
        } catch (e) {
            this._log.error(e);
        }
    }

    _onInterfacesAdded(_c, _s, _p, _i, _sig, params) {
        const [objPath, ifaces] = params.deepUnpack();
        if (DEVICE_IFACE in ifaces) this._evaluate(objPath);
    }

    _onPropsChanged(_c, _s, path) { this._evaluate(path); }

    stop() {
        if (!this._active) return;
        try { this._adapter?.StopDiscoveryAsync?.(); } catch (e) { this._log.error(e); }
        if (this._addedId) { this._bus.signal_unsubscribe(this._addedId); this._addedId = null; }
        if (this._changedId) { this._bus.signal_unsubscribe(this._changedId); this._changedId = null; }
        this._active = false;
        this._log.info('discovery stopped');
    }

    clearSeen(path) { this._seen.delete(path); }

    destroy() { this.stop(); this._seen.clear(); this._adapter = null; this._bus = null; }
});
```

- [ ] **Step 6: Rebuild to verify it loads**

Run: `flatpak-builder --user --install --force-clean --disable-rofiles-fuse _fbuild io.github.maniacx.BudsLink.yml 2>&1 | tail -5`
Expected: EXIT 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/discovery/ tests/advertParsers.test.js
git commit -m "feat(quickpair): scanner (discovery lifecycle, unpack, dedup)"
```

---

### Task 7: Notification + settings toggle + app wiring

**Files:**
- Modify: `src/lib/devices/notifier.js`
- Modify: `data/io.github.maniacx.BudsLink.gschema.xml`
- Modify: `src/app.js`

**Interfaces:**
- Consumes: `QuickPairScanner`, `pairAndConnect` (Task 5/6).
- Produces: `Notifier.notifyQuickPair(name, icon, onAccept)`.

- [ ] **Step 1: Add the gschema key**

In `data/io.github.maniacx.BudsLink.gschema.xml`, inside the `<schema>` element:
```xml
<key name="quick-pair-enabled" type="b">
  <default>true</default>
  <summary>Enable Quick Pair discovery</summary>
  <description>Watch for nearby unpaired devices in pairing mode and offer to connect.</description>
</key>
```

- [ ] **Step 2: Add notifyQuickPair to the notifier**

Read `src/lib/devices/notifier.js` first to match its Gio.Notification pattern, then add:
```javascript
notifyQuickPair(name, icon, onAccept) {
    const notification = new Gio.Notification();
    notification.set_title(_('Device found'));
    notification.set_body(_('Connect to %s?').format(name));
    notification.set_default_action('app.quickpair-accept');
    // Register a one-shot action the accept maps to onAccept via the app (see app.js).
    this._quickPairAccept = onAccept;
    Gio.Application.get_default().send_notification(`quickpair-${name}`, notification);
}
```
> Match the existing notifier's `_` import and app handle; if it stores `this._app`, use that instead of `Gio.Application.get_default()`.

- [ ] **Step 3: Wire the scanner into the app**

In `src/app.js` `_onStartup`, after `this._deviceManager = ...`:
```javascript
import {QuickPairScanner} from './lib/discovery/quickPairScanner.js';
import {pairAndConnect} from './lib/discovery/adapterProxy.js';
// ...
this._quickPair = new QuickPairScanner({aggressive: false});
this._quickPair.connect('candidate-found', (_s, cand) => {
    this._log.info(`quick pair candidate: ${cand.kind}`);
    const accept = () => pairAndConnect(cand.path).catch(e => this._log.error(e));
    this._notifyQuickPair(cand.name, cand.icon, accept);
});
```
Add an accept action in `_onStartup`:
```javascript
const acceptAction = new Gio.SimpleAction({name: 'quickpair-accept'});
acceptAction.connect('activate', () => this._pendingAccept?.());
this.add_action(acceptAction);
this._notifyQuickPair = (name, icon, cb) => {
    this._pendingAccept = cb;
    const n = new Gio.Notification();
    n.set_title(_('Device found'));
    n.set_body(_('Connect to %s?').format(name));
    n.add_button(_('Connect'), 'app.quickpair-accept');
    this.send_notification('quickpair', n);
};
```
Start/stop by the setting in `_initialize`:
```javascript
const syncQuickPair = () => {
    if (this.settings.get_boolean('quick-pair-enabled')) this._quickPair.start();
    else this._quickPair.stop();
};
this.settings.connect('changed::quick-pair-enabled', syncQuickPair);
syncQuickPair();
```
Add to `destroy()`: `this._quickPair?.destroy(); this._quickPair = null;`

- [ ] **Step 4: Rebuild + run smoke**

Run:
```bash
flatpak-builder --user --install --force-clean --disable-rofiles-fuse _fbuild io.github.maniacx.BudsLink.yml 2>&1 | tail -5
flatpak run io.github.maniacx.BudsLink &
```
Expected: app starts, log shows `discovery started`, no crash.

- [ ] **Step 5: Commit**

```bash
git add src/app.js src/lib/devices/notifier.js data/io.github.maniacx.BudsLink.gschema.xml
git commit -m "feat(quickpair): notification, settings toggle, app wiring"
```

---

### Task 8: Live capture, real fixtures, end-to-end verify

**Files:**
- Create: `scripts/capture-adverts.sh`
- Modify: `tests/advertParsers.test.js` (add real-device fixtures)
- Modify: `src/lib/discovery/advertParsers.js` (seed `FAST_PAIR_MODELS`/`APPLE_MODELS` with the user's devices)

- [ ] **Step 1: Write the capture helper**

`scripts/capture-adverts.sh`:
```bash
#!/usr/bin/env bash
# Put buds in pairing mode, then run this. Dumps advert ManufacturerData/ServiceData.
set -euo pipefail
echo "Scanning 20s — put buds in pairing mode now…"
sudo btmgmt find -l >/tmp/qp-find.txt 2>&1 || true
bluetoothctl --timeout 20 scan on || true
echo "=== devices seen ==="; bluetoothctl devices
echo "For a target MAC: bluetoothctl info <MAC>  (shows ManufacturerData/ServiceData/Class/RSSI)"
```

- [ ] **Step 2: Capture with the user's real devices**

Ask the user to put each device (Galaxy Buds, AirPods) in pairing mode. Run:
```bash
bash scripts/capture-adverts.sh
bluetoothctl info <MAC>   # record ManufacturerData / ServiceData / Class / RSSI
```
Record the raw bytes.

- [ ] **Step 3: Add real fixtures as tests**

Append real captured bytes to `tests/advertParsers.test.js` as `describe('real devices', ...)`, asserting the expected kind + name for each captured device. Seed the model maps in `advertParsers.js` so names resolve.

- [ ] **Step 4: Run the suite**

Run: `gjs -m tests/run.js`
Expected: PASS including real-device cases.

- [ ] **Step 5: End-to-end live verify**

```bash
flatpak run io.github.maniacx.BudsLink &
```
Put an unpaired bud in pairing mode → expect a "Connect to X?" notification → click Connect → device pairs and appears in the BudsLink managed list with battery/ANC.

- [ ] **Step 6: Commit**

```bash
git add scripts/capture-adverts.sh tests/advertParsers.test.js src/lib/discovery/advertParsers.js
git commit -m "test(quickpair): real-device advert fixtures + model seeds; e2e verified"
```

---

## Self-Review

**Spec coverage:** goals (detect/notify/pair/handoff/toggle/no-cloud) → Tasks 1-4 (detect/decode), 6 (scan), 7 (notify/toggle/pair wiring), 8 (e2e). Non-goals (account keys, custom agent, AdvertisementMonitor) explicitly excluded. Tiers 1-4 → Tasks 2,3,1,4. Discovery filter/lifecycle → Task 6. Handoff (no changes to bluetoothClient/enhanced) → honored; app.js only adds. ✓

**Placeholder scan:** every code step has real code; the one conditional ("move shouldNotify to sibling") is resolved in-plan by creating `discoveryUtils.js`. No TBD/TODO. ✓

**Type consistency:** candidate shape `{kind,name,icon,modelId}` consistent across parsers; scanner adds `path`; `parseAdvert(advert, {aggressive})` used consistently; `shouldNotify(seen, path, nowSeconds)` matches test + caller; `pairAndConnect(devicePath)` matches app wiring. ✓

**Note for executor:** Task 7's notifier snippet is best-effort against the existing `notifier.js` pattern — read that file first and adapt to its actual app handle / `_` import; the app.js `_notifyQuickPair` fallback is self-contained if the notifier method is skipped.
