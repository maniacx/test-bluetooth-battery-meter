---
layout: default
title: Application Settings
nav_order: 3
permalink: /application-settings
---



## Application Settings

<br>
<img src="{{ 'assets/images/application-settings/preferences.png' | relative_url }}" width="55%">

### Dark Mode

<img src="{{ 'assets/images/application-settings/dark-menu.png' | relative_url }}" width="75%">

This setting allows you to override the system appearance mode.

* Clicking it opens a submenu with three options: System Default, Light, and Dark.
* System Default follows the current system light/dark preference.
* Selecting Light or Dark forces the app to use that appearance.
* Switching back to System Default requires restarting the app for the change to take effect.

<img src="{{ 'assets/images/application-settings/dark.png' | relative_url }}" width="100%">



### Accent Colors:

<img src="{{ 'assets/images/application-settings/accent-menu.png' | relative_url }}" width="80%">

This setting allows you to override the system accent color.

* Clicking it opens a submenu with available libadwaita accent colors and System Default.
* System Default follows the current system accent color.
* Selecting a specific color forces the app to use that accent color.
* Switching back to System Default requires restarting the app for the change to take effect.

<img src="{{ 'assets/images/application-settings/accent-device.png' | relative_url }}" width="100%">
<br>
<br>
<img src="{{ 'assets/images/application-settings/accent-configure.png' | relative_url }}" width="100%">

### Packet Logging:

<img src="{{ 'assets/images/application-settings/packet-logs.png' | relative_url }}" width="80%">

Packet logging is **disabled by default**. In this mode, the application only records errors and essential runtime information.

When enabled, the application logs **packet data** sent to and received from connected earbuds. This is useful for debugging connection issues or analyzing device communication.

**What gets logged**
* Outgoing packets (app → device)
* Incoming packets (device → app)
* Errors and important runtime events

**Log file location**

Logs are saved inside the application's data directory.

For Flatpak installations, you can find the log file at:

```
~/.var/app/io.github.maniacx.BudsLink/.local/state/log/runtime.log
```

{: .note }
> * The exact location may vary depending on your setup / system.



