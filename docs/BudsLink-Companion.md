---
layout: default
title: BudsLink Companion
nav_order: 95
permalink: /companion
---
# BudsLink Companion

BudsLink Companion provides desktop environment integrations for the Flatpak application [**BudsLink**](https://github.com/maniacx/BudsLink).

BudsLink Application can run in a D-Bus service mode, exposing device information such as battery level, ANC, and Conversation Awareness. The Companion integrations (GNOME Shell extension, Plasma widget, and Cinnamon applet) interact with this service to provide tighter desktop integration and automation.

* Automatically detects compatible devices and starts BudsLink in service mode
* Stops the service when no supported device is connected
* Displays essential device information (battery, ANC, Conversation Awareness)
* Provides a **Device Settings** shortcut to quickly open the BudsLink application
* Ensures the app runs only when needed, without manual launch


See the respective branches for the implementation.

{: .note }
>
> **GNOME Shell Extension**
> If you prefer an all-in-one solution, the `Bluetooth Battery Meter` extension offers the same features as BudsLink and BudsLink Companion combined, including battery monitoring and ANC control. Using it eliminates the need to install both applications separately.

## [GNOME Shell Extension](https://github.com/maniacx/BudsLink-Companion/tree/Gnome-Extension)

[<img src="{{ 'assets/images/companion/gnome-extension.png' | relative_url }}" width="40%">](https://github.com/maniacx/BudsLink-Companion/tree/Gnome-Extension)


## [Cinnamon Applet](https://github.com/maniacx/BudsLink-Companion/tree/Cinnamon-Applet)

[<img src="{{ 'assets/images/companion/cinnamon-applet.png' | relative_url }}" width="80%">](https://github.com/maniacx/BudsLink-Companion/tree/Cinnamon-Applet)


## [Plasma Widget](https://github.com/maniacx/BudsLink-Companion/tree/Plasma-Widget)


### Panel Widget
[<img src="{{ 'assets/images/companion/plasma-panel-widget.png' | relative_url }}" width="85%">](https://github.com/maniacx/BudsLink-Companion/tree/Plasma-Widget)

### Desktop Widget

[<img src="{{ 'assets/images/companion/plasma-desktop-widget.png' | relative_url }}" width="90%">](https://github.com/maniacx/BudsLink-Companion/tree/Plasma-Widget)


## Installation & Feedback

The Companion integrations are currently in **beta** and are only available on GitHub. They are not yet published on official extension or widget stores.
To install, run the `install.sh` script provided in the repository.

Feedback is important before wider release. Please report any issues or suggestions on the project page:
https://github.com/maniacx/BudsLink-Companion/issues

When reporting an issue, include the following details:
> * Component: GNOME Extension / Plasma Widget / Cinnamon Applet
> * Host OS (distribution and version, e.g. : Fedora Workstation)
> * Connected device (make and model, e.g. : Galaxy Buds 4)

Your feedback helps improve stability and ensures readiness for submission to official platforms.
