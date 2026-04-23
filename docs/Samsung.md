---
layout: default
title: Samsung Galaxy Buds
nav_order: 7
permalink: /galaxy
---

# Samsung Galaxy Buds

{: .note }
>
> Galaxy Buds
 Bluetooth sockets can be accessed by only one application at a time.
> Do not run other AirPods companion or monitoring apps while using BudsLink, such as:
>
> * **Galaxy Buds Client**
> * **Bluetooth Battery Meter** GNOME Extension  (disable the AirPods feature in the extension preferences)

<br>
<img src="{{ 'assets/images/galaxy/galaxy-main.png' | relative_url }}" width="45%">


* Displays a circular battery widget, supporting either a single battery (headset) or three separate levels for Left, Right, and Case.
* The case battery is shown only when the AirPods report it, usually when the case is charging or when at least one AirPod is inside.
* Only certain AirPods models support ANC mode.
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


Conversation Awareness

|:-:|:-:|
| <img src="{{ 'assets/images/airpods/ca-on.png' | relative_url }}" width="15%"> | Conversation Awareness On |
| <img src="{{ 'assets/images/airpods/ca-off.png' | relative_url }}" width="15%"> | Conversation Awareness Off |


## Features

* App can detect Samsung Galaxy Buds devices among connected Bluetooth devices.
* It communicates over L2CAP sockets to support features such as:
* Battery level reporting
* In-ear detection for automatic pause/play of media
* Control of ANC (Active Noise Cancellation) mode (if supported)
* Conversation Awareness mode (if supported)
* Adaptive noise level customization (if supported)
* Configure Stem/Touch  Equalizer etc.

 
## Configuration by Device

Configure per device settings if supported

<img src="{{ 'assets/images/galaxy/galaxy-configure.png' | relative_url }}" width="85%">

## Icon selection

* Device icons: Select from the available options for your headset type (single-battery or dual-battery devices).
* Case icon: For models that report a case battery, an additional case icon can be selected.

## Pause when device is not worn

When enabled, media playback automatically pauses when the earbuds are removed and resumes based on the selected behavior:

* Default behavior: Uses the device’s standard in-ear detection for pausing and resuming.
* Resume with both earbuds: Playback resumes only when both earbuds are worn.
* Resume with any earbud: Playback resumes as soon as at least one earbud is worn.

## Conversation awareness volume Limit

If supported by device, this setting limits media volume during active conversations to enhance awareness of your surroundings and reduce distractions.

* When conversation mode is triggered (based on supported device capabilities), the system automatically reduces media volume to a user-defined percentage of the maximum volume.

* This helps ensure you can still hear important external sounds while music or other media is playing.

Adjustable Range

* You can set the volume limit to any value between 0 and 50.
* Values are interpreted as a percentage of the device's maximum volume.
* Note: If the current playback volume is already below the specified limit, no adjustment will be made.

## Other settings:
Other settings are self explanatory similar to settings available in iPhone / iPads / Macs

## Compatibility

Currently tested and confirmed working:

* **Galaxy Buds 4 Pro** ✅ — Credits: NormalHuman-Anything
* **Galaxy Buds Pro** ✅ — Credits: NormalHuman-Anything
* **Galaxy Buds 3 Pro** ✅ — Credits: kacpero1530
* **Galaxy Buds 3** ✅ — Credits: kacpero1530
* **Galaxy Buds 2 Pro** ✅ — Credits: kacpero1530
* **Galaxy Buds Live (Partially tested)** ❌ — Credits: adlr
* **Galaxy Buds FE (Partially tested)** ❌ — Credits: kerembayulgen


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

## Galaxy Buds

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | ✅ | ❌ |
| Ambient sound | ✅ | ❌ |
| In Ear Detection | ✅ | ❌ |
| Equalizer Preset | ✅ | ❌ |

---

## Galaxy Buds+

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | ✅ | ❌ |
| Ambient sound | ✅ | ❌ |
| Ambient Sound During Calls | ✅ | ❌ |
| In Ear Detection | ✅ | ❌ |
| Equalizer Preset | ✅ | ❌ |

---

## Galaxy Buds Live

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | ✅ | ❌ |
| Noise Cancellation | ✅ | ❌ |
| In Ear Detection | ✅ | ❌ |
| Equalizer Preset | ✅ | ❌ |
| Stereo Balance | ✅ | ❌ |

---

## Galaxy Buds Pro

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | ✅ | ✅ |
| Noise Cancellation | ✅ | ✅ |
| Ambient sound | ✅ | ✅ |
| Ambient Sound During Calls | ✅ | ❌ |
| Noise Controls With One Earbud | ✅ | ❌ |
| In Ear Detection | ✅ | ✅ |
| Double Tap Volume | ✅ | ✅ |
| Equalizer Preset | ✅ | ❌ |
| Stereo Balance | ✅ | ❌ |

---

## Galaxy Buds2

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | ✅ | ❌ |
| Noise Cancellation | ✅ | ❌ |
| Ambient sound | ✅ | ❌ |
| Ambient Sound During Calls | ✅ | ❌ |
| Noise Controls With One Earbud | ✅ | ❌ |
| In Ear Detection | ✅ | ❌ |
| Touch Lock Settings | ✅ | ❌ |
| Touch Configuration | ✅ | ❌ |
| Double Tap Volume Settings | ✅ | ❌ |
| Find My Buds | ✅ | ❌ |
| Equalizer Preset | ✅ | ❌ |
| Stereo Balance | ✅ | ❌ |

---

## Galaxy Buds2 Pro

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | ✅ | ✅ |
| Noise Cancellation | ✅ | ✅ |
| Ambient sound | ✅ | ✅ |
| Ambient Sound During Calls | ✅ | ❌ |
| Noise Controls With One Earbud | ✅ | ❌ |
| In Ear Detection | ✅ | ✅ |
| Touch Lock Settings | ✅ | ✅ |
| Touch Configuration | ✅ | ✅ |
| Double Tap Volume Settings | ✅ | ✅ |
| Find My Buds | ✅ | ✅ |
| Equalizer Preset | ✅ | ✅ |
| Stereo Balance | ✅ | ✅ |

---

## Galaxy Buds FE

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | ✅ | ❌ |
| Noise Cancellation | ✅ | ❌ |
| Ambient sound | ✅ | ❌ |
| Ambient Sound During Calls | ✅ | ❌ |
| Noise Controls With One Earbud | ✅ | ❌ |
| In Ear Detection | ✅ | ❌ |
| Touch Lock Settings | ✅ | ❌ |
| Touch Configuration | ✅ | ❌ |
| Find My Buds | ✅ | ❌ |
| Equalizer Preset | ✅ | ❌ |
| Stereo Balance | ✅ | ❌ |

---

## Galaxy Buds3

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | ✅ | ✅ |
| Noise Cancellation | ✅ | ✅ |
| In Ear Detection | ✅ | ✅ |
| Gesture Configuration | ✅ | ✅ |
| Find My Buds | ✅ | ✅ |
| Equalizer Preset | ✅ | ✅ |
| Stereo Balance | ✅ | ✅ |

---

## Galaxy Buds3 Pro

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | ✅ | ✅ |
| Noise Cancellation | ✅ | ✅ |
| Ambient sound | ✅ | ✅ |
| Ambient Sound During Calls | ✅ | ❌ |
| Noise Controls With One Earbud | ✅ | ❌ |
| In Ear Detection | ✅ | ✅ |
| Gesture Configuration | ✅ | ✅ |
| Lighting Control | ✅ | ✅ |
| Find My Buds | ✅ | ✅ |
| Equalizer Preset | ✅ | ✅ |
| Stereo Balance | ✅ | ✅ |

---

## Galaxy Buds3 FE

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | ✅ | ❌ |
| Noise Cancellation | ✅ | ❌ |
| Ambient sound | ✅ | ❌ |
| Ambient Sound During Calls | ✅ | ❌ |
| Noise Controls With One Earbud | ✅ | ❌ |
| In Ear Detection | ✅ | ❌ |
| Gesture Configuration | ✅ | ✅ |
| Find My Buds | ✅ | ❌ |
| Equalizer Preset | ✅ | ❌ |
| Stereo Balance | ✅ | ❌ |

---

## Galaxy Buds Core

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | ✅ | ❌ |
| Noise Cancellation | ✅ | ❌ |
| Ambient sound | ✅ | ❌ |
| Ambient Sound During Calls | ✅ | ❌ |
| Noise Controls With One Earbud | ✅ | ❌ |
| In Ear Detection | ✅ | ❌ |
| Find My Buds | ✅ | ❌ |
| Touch Lock Settings | ✅ | ❌ |
| Touch Configuration | ✅ | ❌ |
| Equalizer Preset | ✅ | ❌ |
| Stereo Balance | ✅ | ❌ |

---

## Galaxy Buds4

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | ✅ | ❌ |
| Noise Cancellation | ✅ | ❌ |
| Ambient sound | ✅ | ❌ |
| Ambient Sound During Calls | ✅ | ❌ |
| Noise Controls With One Earbud | ✅ | ❌ |
| In Ear Detection | ✅ | ❌ |
| Find My Buds | ✅ | ❌ |
| Gesture Configuration | ✅ | ❌ |
| Equalizer Preset | ✅ | ❌ |
| Stereo Balance | ✅ | ❌ |

---

## Galaxy Buds4 Pro

| Feature | Supported | Tested |
|:--|:--:|:--:|
| Battery Level | ✅ | ✅ |
| Noise Cancellation | ✅ | ✅ |
| Ambient sound | ✅ | ✅ |
| Ambient Sound During Calls | ✅ | ❌ |
| Noise Controls With One Earbud | ✅ | ❌ |
| In Ear Detection | ✅ | ✅ |
| Gesture Configuration | ✅ | ❌ |
| Find My Buds | ✅ | ❌ |
| Equalizer Preset | ✅ | ❌ |
| Stereo Balance | ✅ | ❌ |

