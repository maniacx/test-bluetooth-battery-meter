### Samsung Galaxy Buds Testing App

This script is intended for the development and testing of socket connection and feature-specific code for AirPods.
Successful implementations can later be migrated into the GNOME extension **Bluetooth Battery Meter**.

It allows socket-level experimentation and debugging in avoiding GNOME Shell restarts or crashes, making it much easier to run and debug.

>Note!
> 
>This is a rough prototype and may contain bugs.

---

### Instructions

1. **Disable any other extension or application** that may be accessing AirPods sockets.
2. **Edit `main.js`** and set your Samsung Galaxy Buds buds `devicePath` (replace `XX` with the device's MAC address).
3. **Ensure your Samsung Galaxy Buds buds are connected** before running the script.
4. **Execute the script via terminal**:

```
gjs-console -m /path/to/main.js
```

