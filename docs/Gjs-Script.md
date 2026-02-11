---
layout: default
title: BudsLink as GJS script
nav_order: 3
permalink: /gjs-script
---

# Running BudsLink as a GJS Script)

BudsLink can be run directly as a GJS script. This mode is intended for **testing, development, and debugging**, allowing fast iteration without building a Flatpak.

## Component needed

### GJS
Minimum version: **GJS 1.80** or newer

**Check Installation**
```bash
gjs --version
```

**Installation**
```bash
# Fedora
sudo dnf install gjs

# Ubuntu
sudo apt install gjs
```

### libadwaita (and GTK 4)

* Minimum version: **libadwaita 1.7** or newer

{: .note }
>
> * libadwaita depends on **GTK 4**, so installing libadwaita will automatically install GTK 4.

**Check Installation**
```bash
gjs -c 'try { const Adw = imports.gi.Adw; const v = `${Adw.MAJOR_VERSION}.${Adw.MINOR_VERSION}`; print(`libadwaita found (version ${v})`); } catch (e) { print("libadwaita not found"); }'
```

**Installation**
```bash
#Fedora
sudo dnf install libadwaita

# Ubuntu
sudo apt install libadwaita-1-0
```

### BlueZ (Bluetooth Stack)

BudsLink relies on BlueZ via Dbus for Bluetooth device management.

**Check Installation**
```bash
bluetoothctl --version
```
Also OS have Experimental feature enable. But if not enambed do this

**Enable experimental feature**
There are several ways to enable experimental feature, the easiest way to enable is to edit system file

`/etc/bluetooth/main.conf`

Search for the line `#Experimental = false` and remove the # and change from false to true

```
Experimental = true
```

Restart the bluetooth service using

```
systemctl restart bluetooth
```

## pactl (Audio Control)

BudsLink uses `pactl` to interact with the system audio server.

* No minimum version requirement
* Required regardless of whether the system uses PulseAudio or PipeWire

```bash
pactl info
```

* If this command works, `pactl` is installed and functional.
* If the command is missing, install the appropriate packages below.

**Install pactl (PulseAudio)**
If your system uses **PulseAudio**:

```bash
# Fedora
sudo dnf install pulseaudio-utils

# Ubuntu
sudo apt install pulseaudio-utils
```


**Install pactl (PipeWire)**
If your system uses **PipeWire** with PulseAudio compatibility:

```bash
# Fedora

sudo dnf install pipewire-pulse pulseaudio-utils

# Ubuntu
sudo apt install pipewire-pulse pulseaudio-utils
```

{: .note }
>
> * `pipewire-pulse` provides a PulseAudio-compatible server
> * `pulseaudio-utils` provides the `pactl` command itself


## Running BudsLink

Once all required components are available, run BudsLink as a GJS script:

```bash
gjs-console -m path/to/BudsLink/main.js
```


