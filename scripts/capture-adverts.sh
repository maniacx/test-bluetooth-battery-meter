#!/usr/bin/env bash
# Capture BLE/BR-EDR advertisement data from a device in pairing mode, so we can
# build real test fixtures + seed the Fast Pair / Apple model maps.
#
# Usage:
#   1. Put the buds in pairing mode (case open + hold button until light blinks).
#   2. Run:  bash scripts/capture-adverts.sh
#   3. Note the target MAC from the list, then it dumps its advert fields.
set -uo pipefail

DUR="${1:-15}"
echo "Scanning ${DUR}s — put the device in pairing mode NOW…"

# Kick a scan so BlueZ collects advert data (ManufacturerData/ServiceData/RSSI).
bluetoothctl --timeout "$DUR" scan on >/dev/null 2>&1 || true

echo
echo "=== devices seen ==="
bluetoothctl devices | sort -u

echo
echo "For each candidate MAC, dumping advert fields (ManufacturerData / ServiceData / Class / RSSI):"
for mac in $(bluetoothctl devices | awk '{print $2}'); do
    info=$(bluetoothctl info "$mac" 2>/dev/null)
    if echo "$info" | grep -qiE 'ManufacturerData|ServiceData'; then
        echo "----- $mac -----"
        echo "$info" | grep -iE 'Name|Alias|Class|RSSI|ManufacturerData|ServiceData|Icon|UUID' | sed 's/^/  /'
        echo
    fi
done

echo "Tip: for raw advert bytes over time, run in another terminal:"
echo "  sudo btmon | grep -A20 -iE 'advertis|report'"
