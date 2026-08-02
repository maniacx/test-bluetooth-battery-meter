---
layout: default
title: Sennheiser
nav_order: 8
parent: Devices
permalink: /sennheiser
---


# Sennheiser Headband / Earbuds

{: .note }
>
> Sennheiser Headband / Earbuds sockets can be accessed by only one application at a time. 
> Do not run other Sennheiser Headband / Earbuds's companion or monitoring apps while using BudsLink, such as:
>
> * **Bluetooth Battery Meter** GNOME Extension  (disable the Sennheiser feature in the extension preferences)


<br>
<img src="{{ 'assets/images/sennheiser/sennheiser-main.png' | relative_url }}" width="45%">

* Displays a circular battery widget, supporting either a single battery (headset) or three separate levels for Left, Right, and Case.
* The case battery is shown only when the Sennheiser  report it, usually when the case is charging or when at least one bud is inside.
* Only certain Sennheiser  models support ANC mode.

## Icons:

Anti-Noise Cancellation (ANC)

|:-:|:-:|
| <img src="{{ 'assets/images/airpods/anc-off.png' | relative_url }}" width="15%"> | Anti-Noise Cancellation Off  |
| <img src="{{ 'assets/images/airpods/anc-on.png' | relative_url }}" width="15%"> | Anti-Noise Cancellation On |
| <img src="{{ 'assets/images/airpods/adaptive.png' | relative_url }}" width="15%"> | Adaptive |


## Features

When enabled, the system can detect Sennheiser  headphones/earbuds among connected Bluetooth devices. It communicates over RFCOMM sockets to support features such as:

* Battery level reporting
* Control of ANC (Active Noise Cancellation) / Ambient mode (if supported)
* Configure Stem/Touch, Equalizer, Notifications etc.

 
## Configuration by Device

Configure per device settings if supported

<img src="{{ 'assets/images/sennheiser/sennheiser-configure.png' | relative_url }}" width="85%">

## Icon selection

* Device icons: Select from the available options for your headset type (single-battery or dual-battery devices).
* Case icon: For models that report a case battery, an additional case icon can be selected.

## Parametric Eq (HDB 630 only)
<img src="{{ 'assets/images/sennheiser/sennheiser-parametric.png' | relative_url }}" width="85%">

## Other settings:
Other settings are self explanatory similar to settings available in OEM Mobile App

## Compatibility
Some devices have not yet been tested and may show incorrect features in the configuration. Others may be missing entirely. If you notice missing devices or incorrect feature mappings, please open an issue on GitHub so we can add or correct them.

Currently tested and confirmed working:
* **Sennheiser HDB 630**  ✅ — Credits: TheGentleChainsaw
* **Sennheiser Momentum Wireless 4**  ✅ — Credits: jacostag


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

### Sennheiser HDB 630

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | Headband  | ✅     |
| Noise Cancellation (strength) | ✅        | ✅     |
| Adaptive                      | ✅        | ✅     |
| Equalizer Preset              | ✅        | ✅     |
| Equalizer Custom              | ✅        | ✅     |
| Podcast Mode                  | ✅        | ✅     |
| Switch to Sound Personalization| ✅        | ✅     |
| Sound Personalization Customization| ❌        | ❌     |
| Parametric Equalizer          | ✅        | ✅     |
| CrossFeed                     | ✅        | ✅     |
| SideTone                      | ✅        | ✅     |
| Comfort Call                  | ✅        | ✅     |
| In Ear Detection              | ✅        |Not Tested|
| Auto Answer Calls             | ✅        | ✅     |
| Auto Pause  (OEM app)         | ✅        | ✅     |
| Auto Pause Resume (BudsLink app)| ✅        | ❌     |
| Auto Transparency             | ✅        | ✅     |
| Auto Power Timeout            | ✅        | ✅     |
| Device Management (Multipoint)| ✅        | ❌     |

### Sennheiser Momentum Wireless 4

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | Headband  | ✅     |
| Noise Cancellation (strength) | ✅        | ✅     |
| Adaptive                      | ✅        | ✅     |
| Equalizer Preset              | ✅        | ✅     |
| Equalizer Custom              | ✅        | ✅     |
| Podcast Mode                  | ✅        | ✅     |
| Switch to Sound Personalization| ✅        | ✅     |
| Sound Personalization Customization| ❌        | ❌     |
| SideTone                      | ✅        | ✅     |
| Comfort Call                  | ✅        | ✅     |
| In Ear Detection              | ✅        |Not Tested|
| Auto Answer Calls             | ✅        | ✅     |
| Auto Pause  (OEM app)         | ✅        | ✅     |
| Auto Pause Resume (BudsLink app)| ✅        | ❌     |
| Auto Power Timeout            | ✅        | ✅     |
| Device Management (Multipoint)| ✅        | ❌     |

