---
layout: default
title: Google Pixel Buds
parent: Devices
nav_order: 5
permalink: /pixel
---

# Google Pixel Buds

{: .note }
>
> Google Pixel Buds
 Bluetooth sockets can be accessed by only one application at a time.
> Do not run other Google Pixel Buds companion or monitoring apps while using BudsLink, such as:
>
> * **Bluetooth Battery Meter** GNOME Extension  (disable the Google Pixel Buds feature in the extension preferences)

<br>
<img src="{{ 'assets/images/pixel/pixel-main.png' | relative_url }}" width="45%">


* Displays a circular battery widget, supporting either a single battery (headset) or three separate levels for Left, Right, and Case.
* The case battery is shown only when the Google Pixel Buds report it, usually when the case is charging or when at least one Google Pixel Buds is inside.
* Only certain Google Pixel Buds models support ANC mode.
* Some models also support Conversation Mode.

## Button Visibility

* The ANC option (if supported) is only shown when one or both earbuds are in the ears.
* The Conversation Mode (if supported) option is only shown when both earbuds are in the ears.


## Icons:

Anti-Noise Cancellation (ANC)

|:-:|:-:|
| <img src="{{ 'assets/images/airpods/anc-off.png' | relative_url }}" width="15%"> | Anti-Noise Cancellation Off  |
| <img src="{{ 'assets/images/airpods/anc-on.png' | relative_url }}" width="15%"> | Anti-Noise Cancellation On |
| <img src="{{ 'assets/images/airpods/transperancy.png' | relative_url }}" width="15%"> | Transperancy |
| <img src="{{ 'assets/images/airpods/adaptive.png' | relative_url }}" width="15%"> | Adaptive |


## Features

* App can detect Google Pixel Buds devices among connected Bluetooth devices.
* It communicates over RFCOMM sockets to support features such as:
* Battery level reporting
* Noise control
* Equalizer

 
## Configuration by Device

Configure per device settings if supported

<img src="{{ 'assets/images/pixel/pixel-configure.png' | relative_url }}" width="85%">

## Icon selection

* Device icons: Select from the available options for your headset type (single-battery or dual-battery devices).
* Case icon: For models that report a case battery, an additional case icon can be selected.

## Other settings:
Other settings are self explanatory similar to settings available in OEM Mobile App

## Compatibility
Some devices have not yet been tested and may show incorrect features in the configuration. Others may be missing entirely. If you notice missing devices or incorrect feature mappings, please open an issue on GitHub so we can add or correct them.

Currently tested and confirmed working:

* **Google Pixel Buds Pro** ✅ — Credits: bhack@github.com
* **Google Pixel Buds Pro 2** ✅ — Credits: IGS-GIT@github.com


<style>
table th:first-of-type {
    width: 60%;
}
table th:nth-of-type(2) {
    width: 20%;
}
table th:nth-of-type(3) {
    width: 20%;
}
</style>

## Google Pixel Buds Pro

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | ✅ | ✅ |
| Noise Control | ✅ | ✅ |
| Equalizer Preset | ✅ | ✅ |
| Volume EQ | ✅ | ✅ |

---

## Google Pixel Buds Pro 2

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | ✅ | ✅ |
| Noise Control | ✅ | ✅ |
| Equalizer Preset | ✅ | ✅ |
| Volume EQ | ✅ | ✅ |


