#!/bin/bash

SCHEMA_ID="org.maniacx.testbbm"
SRC_DIR="$(dirname "$(realpath "$0")")/schemas"
DEST_DIR="$HOME/.local/share/glib-2.0/schemas"
SCHEMA_FILE="$SCHEMA_ID.gschema.xml"

install_schema() {
    echo "Installing schema..."

    mkdir -p "$DEST_DIR"

    if [ ! -f "$SRC_DIR/$SCHEMA_FILE" ]; then
        echo "Error: Schema file not found: $SRC_DIR/$SCHEMA_FILE"
        exit 1
    fi

    cp "$SRC_DIR/$SCHEMA_FILE" "$DEST_DIR/"
    glib-compile-schemas "$DEST_DIR"

    echo "Schema installed and compiled successfully."
}

remove_schema() {
    echo "Removing schema..."

    if [ -f "$DEST_DIR/$SCHEMA_FILE" ]; then
        rm "$DEST_DIR/$SCHEMA_FILE"
        glib-compile-schemas "$DEST_DIR"
        echo "Schema removed and recompiled."
    else
        echo "Schema not found in $DEST_DIR"
    fi
}

case "$1" in
    install)
        install_schema
        ;;
    remove)
        remove_schema
        ;;
    *)
        echo "Usage: $0 {install|remove}"
        ;;
esac
#!/usr/bin/env bash
