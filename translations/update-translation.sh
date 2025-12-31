#!/bin/bash
set -e

APP_ID="com.github.maniacx.BluetoothEarbudsCompanion"

TRANS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$TRANS_DIR/.." && pwd)"
PO_DIR="$TRANS_DIR/po"
LOCALE_DIR="$TRANS_DIR/locale"
POT_FILE="$PO_DIR/${APP_ID}.pot"

cd "$ROOT_DIR"

ALL_FILES=$(find lib preferences scriptLibs -type f -name '*.js')

xgettext \
    --language=JavaScript \
    --add-comments="TRANSLATORS:" \
    --from-code=UTF-8 \
    --copyright-holder="maniacx@github.com" \
    --package-name="Bluetooth Earbuds Companion" \
    --output="$POT_FILE" \
    $ALL_FILES

for file in "$PO_DIR"/*.po; do
    lang=$(basename "$file" .po)
    echo "Updating $lang"

    msgmerge --backup=off --update --no-fuzzy-matching "$file" "$POT_FILE"

    if grep --silent "#, fuzzy" "$file"; then
        fuzzy+=("$lang")
    fi
done

for file in "$PO_DIR"/*.po; do
    lang=$(basename "$file" .po)

    target_dir="$LOCALE_DIR/$lang/LC_MESSAGES"
    target_mo="$target_dir/$APP_ID.mo"

    mkdir -p "$target_dir"
    msgfmt "$file" -o "$target_mo"

    echo "Compiled $target_mo"
done

if [[ -v fuzzy ]]; then
    echo "WARNING: Translations have fuzzy strings: ${fuzzy[*]}"
fi

