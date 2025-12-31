### Bluetooth Earbuds Companion (GJS Script)

![Screenshot](https://raw.githubusercontent.com/maniacx/test-bluetooth-battery-meter/main/readme.png)

Bluetooth Earbuds Companion is a standalone GJS-based script that provides battery monitoring and feature control for supported Bluetooth earbuds.

## Features
- Displays battery level for:
* Left earbud
* Right earbud
* Charging case
- Controls Active Noise Cancellation (ANC) and related listening modes
- Supports additional device-specific features where available

## Supported Devices
* AirPods
* Beats
* Sony earbuds and headphones

## Desktop Compatibility
* Compatible with GNOME desktop environments.
* For non-GNOME desktop environments, ensure **libadwaita-1** and **gjs** are installed.

## Requirements
The following dependencies are required:
* GJS (>= 1.80.2)
* Adwaita (>= 1.5)
* BlueZ (Accessed via Dbus)
* pactl (PulseAudio or PipeWire with `pipewire-pulse` module)

#### GJS
- Not required on GNOME desktops (already installed)
- May require manual installation on non-GNOME desktops (KDE, XFCE, etc.)

Check if installed / version
```
gjs --version
```

Installation
```
#Fedora
sudo dnf install gjs

#Ubuntu/Debian
sudo apt install gjs
```

#### Adwaita / GTK 4
- Not required on GNOME desktops (already installed)
- May require manual installation on non-GNOME desktops
- Installing `libadwaita` will automatically pull in GTK 4 and required GNOME libraries

Installation
```
#Fedora
sudo dnf install libadwaita

#Ubuntu/Debian
sudo apt install libadwaita-1-0
```

#### BlueZ
- Usually installed and available on most Linux systems
- Must be running as a system service for Bluetooth with Dbus functionality

Bluetooth dbus check
```
busctl --system status org.bluez &>/dev/null && echo "Bluetooth (BlueZ) is running" || echo "Bluetooth (BlueZ) is not running"
```

#### pactl
- Linux systems use either **PulseAudio** or **PipeWire** as the audio server
- `pactl` is a PulseAudio client utility
- With **PulseAudio**, `pactl` works out of the box
- With **PipeWire**, the PulseAudio compatibility layer is required
- On Ubuntu/Debian, `pactl` is provided by `pulseaudio-utils`

Installation for Pipewire Audio servers
```
#Fedora
sudo dnf install pipewire-pulseaudio

#Ubuntu/Debian
sudo apt install pipewire-pulse pulseaudio-utils
```

pactl check
```
pactl --version
```

## Launch Script
You can run the script either with an interactive console (useful for debugging) or without one.


Runs the script in gjs-console, allowing you to see logs, warnings, and stack traces directly in the terminal.

```
gjs-console -m /path/to/main.js
```

Runs the script using gjs, suitable for normal usage when debugging output is not required.

```
gjs -m /path/to/main.js
```
