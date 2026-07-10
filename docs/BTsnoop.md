---
layout: default
title: Extracting BT Logs (btsnoop)
nav_order: 96
permalink: /bt-snoop-extract
---
# Extracting Bluetooth HCI Snoop Logs (btsnoop)

This guide explains how to enable Bluetooth HCI logging on Android devices and extract the resulting `btsnoop_hci.log` file for analysis.

## Prerequisites

### Android Device

Before collecting Bluetooth logs, you must enable **Developer Options** on your Android device.

> **Note:** Some applications, such as banking or security-sensitive apps, may not function while Developer Options are enabled.

### Linux Requirements

* Install Android Debug Bridge (ADB)

```bash
# Ubuntu / Debian
sudo apt install adb

# Fedora
sudo dnf install android-tools
```

#### Install Wireshark

Wireshark is recommended for analyzing the captured Bluetooth traffic.

```bash
# Ubuntu / Debian
sudo apt install wireshark

# Fedora
sudo dnf install wireshark
```

---

# Enable Bluetooth HCI Logging on Android

## Enable Developer Options

* Open **Settings**.

* Navigate to **About phone** → **Software information**.

<img src="{{ 'assets/images/btsnoop/1-about.png' | relative_url }}" width="40%">
<img src="{{ 'assets/images/btsnoop/2-software-info.png' | relative_url }}" width="40%">

* Locate **Build number**.

<img src="{{ 'assets/images/btsnoop/3-build-number.png' | relative_url }}" width="40%">

* Tap **Build number** **seven times**.

* If prompted, enter your screen lock PIN, password, or pattern.

* Close and reopen the **Settings** application.

* Open **Developer options**.

<img src="{{ 'assets/images/btsnoop/4-dev-options.png' | relative_url }}" width="40%">

* In **Developer options**, locate **Bluetooth stack log level**.

<img src="{{ 'assets/images/btsnoop/5-bt-stack.png' | relative_url }}" width="40%">

* Set the log level to **Info**.

* Locate **Enable Bluetooth HCI snoop log**.

<img src="{{ 'assets/images/btsnoop/6-bt-snoop.png' | relative_url }}" width="40%">

* Set it to **Enabled**.

<img src="{{ 'assets/images/btsnoop/7-bt-snoop-enable.png' | relative_url }}" width="40%">

* In **Developer options**, locate **USB debugging**.
* Enable **USB debugging**.

<img src="{{ 'assets/images/btsnoop/8-usb-debug.png' | relative_url }}" width="40%">

* When prompted with **Allow USB debugging**, select **Allow**.

<img src="{{ 'assets/images/btsnoop/9-usb-debug-allow.png' | relative_url }}" width="40%">

## Reboot Android Device

* Reboot the Android device.
* After rebooting, unlock the device.
* Connect the device to your Linux system using a USB data cable.
* If prompted again with **Allow USB debugging**, select **Allow**.
* Next step download `bugreport` in PC/Laptop.

<img src="{{ 'assets/images/btsnoop/10-usb-debug-allow.png' | relative_url }}" width="40%">

---

# Download bug-report / Extract btsnoop Log

1. Open a terminal/console.
2. Generate and download a bug report:

```bash
adb bugreport ~/Downloads
```

<img src="{{ 'assets/images/btsnoop/11-adb-bugreport.png' | relative_url }}" width="100%">

3. Wait for the bug report collection to complete.
4. Navigate to the generated `bugreport-*.zip` file in your Downloads directory.
5. Extract the ZIP archive.
6. Open the extracted directory.
7. Navigate to:

```text
FS/data/log/bt/
```

8. Locate the Bluetooth snoop log file:

```text
btsnoop_hci.log
```

<img src="{{ 'assets/images/btsnoop/12-location.png' | relative_url }}" width="100%">

---

# Viewing the Log in Wireshark

## Extracting data from btsnoop
Besides packet traffic related to the earbuds, BTSnoop logs may contain other sensitive data, which we do not need.
 Therefore, we will extract only the packet data exchanged between the phone and the earbuds. 

* Open wireshark**

* **Load file** using File > Open

 <img src="{{ 'assets/images/btsnoop/13-wirehark-open.png' | relative_url }}" width="55%">
 
* **Use a display filter** : Bluetooth snoop logs contain a large amount of information, which can be overwhelming to analyze. Using **display filters** can help narrow the capture to only the packets relevant to your investigation.

Below are a few commonly used RFCOMM filters.

**View RFCOMM Packets Sent To or Received From a Specific Device**

Replace `AA:BB:CC:DD:EE:FF` with the Bluetooth MAC address of your earbuds or target device.

```text
btrfcomm && bluetooth.addr == AA:BB:CC:DD:EE:FF
```

**View RFCOMM Packets for a Specific Channel**

Replace `12` with the RFCOMM channel you want to inspect.

```text
btrfcomm && btrfcomm.dlci == 12
```

**View RFCOMM Packets That Start With Byte `FE`**

This is useful when the protocol uses a fixed start-of-frame byte.

```text
btrfcomm && data.data[0] == fe
```

Example with pictures
<img src="{{ 'assets/images/btsnoop/14-filter.png' | relative_url }}" width="100%">
<img src="{{ 'assets/images/btsnoop/15-startwith.png' | relative_url }}" width="100%">


*  **Export File** as Plain Text

Use a display filter to show only RFCOMM packets sent to or received from your earbuds while excluding control packets that do not contain payload data.

Replace AA:BB:CC:DD:EE:FF with the Bluetooth MAC address of your earbuds.

```text
btrfcomm && data.data && bluetooth.addr == AA:BB:CC:DD:EE:FF
```

<img src="{{ 'assets/images/btsnoop/16-export-menu.png' | relative_url }}" width="60%">

* In Packet Range, Choose > `All Packets` and `Displayed`
* In Packet Format ,Select > `Details` and `All Expanded`
* Save with name and path

<img src="{{ 'assets/images/btsnoop/17-export-selection.png' | relative_url }}" width="100%">

* **Verify exported file** by opening it in any text editor and check if `Data:` field is present

<img src="{{ 'assets/images/btsnoop/18-data.png' | relative_url }}" width="60%">

* **Run python script**

[extract_data.py](https://github.com/user-attachments/files/29068326/extract_data.py)

Open the python script `extract_data.py` in text editor and modify the variables , type path of wireshark exported file in `input_file_path`, the path and name of output file in `output_file_path` and the earbuds MAC address in `earbuds_mac_address`. Earbuds mac address is needed to identify which packet was send to earbuds and recieved from earbuds

```
input_file_path = "~/Downloads/ABC.txt"     # Path to Wireshark text export
output_file_path = "~/Downloads/XYZ.txt"    # Where parsed results will be saved
earbuds_mac_address = "9c:de:f0:33:f5:cc" # Your earbuds MAC (lowercase recommended)
```

**Note:** This script only works with Wireshark set to English, as it uses regular expressions to locate the packet data, source MAC address, and destination MAC address within the exported text.

run the script
```
python3 extract_data.py
```

