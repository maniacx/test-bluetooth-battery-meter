'use strict';
import System from 'system';

let failures = 0;
let total = 0;
let suite = '';

export function describe(name, fn) { suite = name; fn(); }

export function it(name, fn) {
    total++;
    try {
        fn();
        print(`  ok   - ${suite} > ${name}`);
    } catch (e) {
        failures++;
        printerr(`  FAIL - ${suite} > ${name}\n        ${e.message}`);
    }
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
    if (failures > 0) System.exit(1);
}
