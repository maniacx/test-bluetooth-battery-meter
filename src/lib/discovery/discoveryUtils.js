'use strict';

// Pure helpers for the Quick Pair scanner (no gi:// imports, unit-testable).

const COOLDOWN_SECONDS = 120;

// seen: Map<path, lastNotifiedEpochSeconds>. Returns true if we should notify now
// (first sight, or the cooldown has elapsed since the last notification).
export function shouldNotify(seen, path, nowSeconds) {
    const last = seen.get(path);
    if (last !== undefined && nowSeconds - last <= COOLDOWN_SECONDS) return false;
    seen.set(path, nowSeconds);
    return true;
}
