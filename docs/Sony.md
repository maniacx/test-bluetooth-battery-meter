---
layout: default
title: Sony Bluetooth Audio
nav_order: 5
permalink: /sony
---


# Sony Bluetooth Audio

{: .note }
>
> Sony Bluetooth sockets can be accessed by only one application at a time.  
> Do not run other Sony's companion or monitoring apps while using BudsLink, such as:
>
> * **SonyHeadphonesClient**
> * **Bluetooth Battery Meter** GNOME Extension  (disable the Sony feature in the extension preferences)


<br>
<img src="{{ 'assets/images/sony/sony-main.png' | relative_url }}" width="45%">

* Displays a circular battery widget, supporting either a single battery (headset) or three separate levels for Left, Right, and Case.
* The case battery is shown only when the Sony report it, usually when the case is charging or when at least one bud is inside.
* **Conversation Awareness** in Sony term is **Speak to Chat**.
* Only certain Sony models support ANC mode.
* Some models support ANC but not Ambient mode.
* Some models also support Conversation Mode.

## Icons:

Anti-Noise Cancellation (ANC)

|:-:|:-:|
| <img src="{{ 'assets/images/airpods/anc-off.png' | relative_url }}" width="15%"> | Anti-Noise Cancellation Off  |
| <img src="{{ 'assets/images/airpods/anc-on.png' | relative_url }}" width="15%"> | Anti-Noise Cancellation On |
| <img src="{{ 'assets/images/airpods/transperancy.png' | relative_url }}" width="15%"> | Ambient |
| <img src="{{ 'assets/images/airpods/adaptive.png' | relative_url }}" width="15%"> | Adaptive |


Conversation Awareness (Speak to Chat)

|:-:|:-:|
| <img src="{{ 'assets/images/airpods/ca-on.png' | relative_url }}" width="15%"> | Conversation Awareness On |
| <img src="{{ 'assets/images/airpods/ca-off.png' | relative_url }}" width="15%"> | Conversation Awareness Off |


## Features

When enabled, the system can detect Sony headphones/earbuds among connected Bluetooth devices. It communicates over RFCOMM sockets to support features such as:

* Battery level reporting
* Control of ANC (Active Noise Cancellation) / Ambient mode (if supported)
* Conversation Awareness mode (if supported)
* Adaptive noise level customization (if supported)
* Configure Stem/Touch, Equalizer, Notifications etc.

 
## Configuration by Device

Configure per device settings if supported

<img src="{{ 'assets/images/sony/sony-configure.png' | relative_url }}" width="85%">

## Icon selection

* Device icons: Select from the available options for your headset type (single-battery or dual-battery devices).
* Case icon: For models that report a case battery, an additional case icon can be selected.

## Other settings:
Other settings are self explanatory similar to settings available in Sony's Sound Connect app.

## Compatibility
Some devices have not yet been tested and may show incorrect features in the configuration. Others may be missing entirely. If you notice missing devices or incorrect feature mappings, please open an issue on GitHub so we can add or correct them.

Currently tested and confirmed working:
* **Sony WF-C510**  ✅ — Credits: G-dH
* **Sony WH-1000XM4**  ✅ — Credits: Int-Circuit
* **Sony WF-1000XM5**  ✅ — Credits: kilisei
* **Sony WH-1000XM5**  ✅ — Credits: pesader
* **Sony WH-1000XM5**  ✅ — Credits: guiand888
* **Sony WH-XB900N**  ✅ — Credits: BerenLuth
* **Sony WF-1000XM4**  ✅ — Credits: Raycx86


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

### Sony WH-1000XM6

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Battery Level                 | Single         | ❌     |
| Ambient Mode                  | ✅             | ❌     |
| Anc Mode                      | ✅             | ❌     |
| Auto Ambient Sound Control    | ✅             | ❌     |
| Noise Control Button Mode     | ✅             | ❌     |
| Speak To Chat Config          | ✅             | ❌     |
| Voice Notifications           | ✅             | ❌     |
| Voice Notifications Volume    | ✅             | ❌     |
| Auto Power Off When Taken Off | ✅             | ❌     |
| Pause When Taken Off          | ✅             | ❌     |
| Equalizer Ten Bands           | ✅             | ❌     |
| Listening Mode                | ✅             | ❌     |
| DSEE                          | ✅             | ❌     |

<br>
### Sony WH-1000XM5

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Battery Level                 | Single         | ✅     |
| Ambient Mode                  | ✅             | ✅     |
| Anc Mode                      | ✅             | ✅     |
| Noise Control Button Mode     | ✅             | ✅     |
| Speak To Chat Config          | ✅             | ✅     |
| Voice Notifications           | ✅             | ✅     |
| Auto Power Off When Taken Off | ✅             | ✅     |
| Pause When Taken Off          | ✅             | ✅     |
| Equalizer Six Bands           | ✅             | ✅     |
| DSEE                          | ✅             | ✅     |

<br>
### Sony WH-1000XM4

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Battery Level                 | Single         | ✅     |
| Ambient Mode                  | ✅             | ✅     |
| Anc Mode                      | ✅             | ✅     |
| Speak To Chat Config          | ✅             | ✅     |
| Voice Notifications           | ✅             | ✅     |
| Auto Power Off When Taken Off | ✅             | ✅     |
| Pause When Taken Off          | ✅             | ✅     |
| Equalizer Six Bands           | ✅             | ✅     |
| DSEE                          | ✅             | ✅     |

<br>
### Sony WH-1000XM3

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Battery Level                 | Single         | ❌     |
| Ambient Mode                  | ✅             | ❌     |
| Anc Mode                      | ✅             | ❌     |
| Voice Notifications           | ✅             | ❌     |
| Auto Power Off When Taken Off | ✅             | ❌     |
| Auto Power Off When Taken Time| ✅            | ❌     |
| Equalizer Six Bands           | ✅             | ❌     |
| DSEE                          | ✅             | ❌     |

<br>
### Sony WH-1000XM2

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Battery Level                 | Single         | ❌     |
| Ambient Mode                  | ✅             | ❌     |
| Anc Mode                      | ✅             | ❌     |
| Voice Notifications           | ✅             | ❌     |
| Equalizer Six Bands           | ✅             | ❌     |
| DSEE                          | ✅             | ❌     |

<br>
### Sony WH-CH720N

| Feature                       | Supported      | Tested |
|:-----------------------------:|:--------------:|:------:|
| Battery Level                 | Single         | ❌     |
| Ambient Mode                  | ✅             | ❌     |
| Anc Mode                      | ✅             | ❌     |
| Noise Control Button Mode     | ✅             | ❌     |
| Auto Power Off When Taken Off | ✅             | ❌     |
| Voice Notifications           | ✅             | ❌     |
| Equalizer Six Bands           | ✅             | ❌     |
| DSEE                          | ✅             | ❌     |

### Sony WF-1000XM6

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ❌     |
| Ambient Mode                  | ✅        | ❌     |
| Speak To Chat Config          | ✅        | ❌     |
| Voice Notifications           | ✅        | ❌     |
| Pause When Taken Off          | ✅        | ❌     |
| Auto Power Off When Taken Off | ✅        | ❌     |
| Equalizer Six Bands           | ✅        | ❌     |
| Upscaling (DSEE)              | ✅        | ❌     |


### Sony WF-1000XM5

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ✅     |
| Ambient Mode                  | ✅        | ✅     |
| Speak To Chat Config          | ✅        | ✅     |
| Voice Notifications           | ✅        | ✅     |
| Pause When Taken Off          | ✅        | ✅     |
| Auto Power Off When Taken Off | ✅        | ✅     |
| Equalizer Six Bands           | ✅        | ✅     |
| Upscaling (DSEE)              | ✅        | ✅     |

<br>

### Sony WF-1000XM4

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ✅     |
| Ambient Mode                  | ✅        | ✅     |
| Anc Mode                      | ✅        | ✅     |
| Pause When Taken Off          | ✅        | ✅     |
| Auto Power Off When Taken Off | ✅        | ✅     |
| Equalizer Six Bands           | ✅        | ✅     |
| Upscaling (DSEE)              | ✅        | ✅     |

<br>

### Sony WF-1000XM3

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ✅     |
| Ambient Mode                  | ✅        | ✅     |
| Anc Mode                      | ✅        | ✅     |
| Voice Notifications           | ✅        | ❌     |
| Pause When Taken Off          | ✅        | ✅     |
| Auto Power Off When Taken Off | ✅        | ✅     |
| Auto Power Off When Taken Time| ✅        | ✅     |
| Equalizer Six Bands           | ✅        | ✅     |
| Upscaling (DSEE)              | ✅        | ✅     |

<br>

### Sony WF-C710N

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | Dual2+Case | No    |
| Ambient Mode                  | ✅        | ❌     |
| Anc Mode                      | ✅        | ❌     |
| Equalizer Six Bands           | ✅        | ❌     |
| Upscaling (DSEE)              | ✅        | ❌     |

<br>

### Sony WF-C700N

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | Dual2+Case | No    |
| Ambient Mode                  | ✅        | ❌     |
| Anc Mode                      | ✅        | ❌     |
| Auto Power Off When Taken Off | ✅        | ❌     |
| Equalizer Six Bands           | ✅        | ❌     |
| Upscaling (DSEE)              | ✅        | ❌     |

<br>

### Sony WF-C510

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ❌     |
| Ambient Mode                  | ✅        | ❌     |
| Voice Notifications           | ✅        | ❌     |
| Equalizer Six Bands           | ✅        | ❌     |
| Upscaling (DSEE)              | ✅        | ❌     |

<br>

### Sony WF-C500

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R,     | ❌     |
| Voice Notifications           | ✅        | ❌     |
| Equalizer Six Bands           | ✅        | ❌     |
| Upscaling (DSEE)              | ✅        | ❌     |

<br>

### Sony WI-C100

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | Single    | ❌     |
| Voice Notifications           | ✅        | ❌     |
| Equalizer Six Bands           | ✅        | ❌     |
| Upscaling (DSEE)              | ✅        | ❌     |

<br>

### Sony WF-SP800N

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ❌     |
| Ambient Mode                  | ✅        | ❌     |
| Anc Mode                      | ✅        | ❌     |
| Voice Notifications           | ✅        | ❌     |
| Pause When Taken Off          | ✅        | ❌     |
| Auto Power Off When Taken Off | ✅        | ❌     |
| Equalizer Six Bands           | ✅        | ❌     |

<br>

### Sony ULT / ULT WEAR

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | Single    | ❌     |
| Ambient Mode                  | ✅        | ❌     |
| Voice Notifications           | ✅        | ❌     |
| Pause When Taken Off          | ✅        | ❌     |

<br>

### Sony WH-XB910N

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | Single    | ❌     |
| Ambient Mode                  | ✅        | ❌     |
| Anc Mode                      | ✅        | ❌     |
| Voice Notifications           | ✅        | ❌     |
| Pause When Taken Off          | ✅        | ❌     |
| Auto Power Off When Taken Off | ✅        | ❌     |
| Equalizer Six Bands           | ✅        | ❌     |

<br>

### Sony WH-XB900N

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | Single    | ✅     |
| Ambient Mode                  | ✅        | ✅     |
| Anc Mode                      | ✅        | ✅     |
| Voice Notifications           | ✅        | ✅     |
| Pause When Taken Off          | ✅        | ✅     |
| Auto Power Off When Taken Off | ✅        | ✅     |
| Auto Power Off When Taken Time| ✅        | ✅     |
| Equalizer Six Bands           | ✅        | ✅     |

<br>

### Sony WI-SP600N

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | Single    | ❌     |
| Ambient Mode                  | ✅        | ❌     |
| Anc Mode                      | ✅        | ❌     |
| Voice Notifications           | ✅        | ❌     |
| Equalizer Six Bands           | ✅        | ❌     |

### Sony LinkBuds

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ❌     |
| Speak To Chat Config          | ✅        | ❌     |
| Voice Notifications           | ✅        | ❌     |
| Pause When Taken Off          | ✅        | ❌     |
| Auto Power Off When Taken Off | ✅        | ❌     |
| Equalizer Six Bands           | ✅        | ❌     |
| Upscaling (DSEE)              | ✅        | ❌     |

<br>

### Sony LinkBuds S

| Feature                       | Supported | Tested |
|:-----------------------------:|:---------:|:------:|
| Battery Level                 | L, R, Case| ❌     |
| Ambient Mode                  | ✅        | ❌     |
| Speak To Chat Config          | ✅        | ❌     |
| Voice Notifications           | ✅        | ❌     |
| Pause When Taken Off          | ✅        | ❌     |
| Auto Power Off When Taken Off | ✅        | ❌     |
| Equalizer Six Bands           | ✅        | ❌     |
| Upscaling (DSEE)              | ✅        | ❌     |

<br>

