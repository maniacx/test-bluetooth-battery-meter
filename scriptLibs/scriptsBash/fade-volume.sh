#!/usr/bin/env bash

CURRENT=$1
TARGET=$2

STEPS=8
SLEEP=0.125

curve=(0 10 25 45 65 80 92 100)

for p in "${curve[@]}"; do
    v=$(( CURRENT + (TARGET - CURRENT) * p / 100 ))
    pactl set-sink-volume @DEFAULT_SINK@ "${v}%"
    sleep "$SLEEP"
done

