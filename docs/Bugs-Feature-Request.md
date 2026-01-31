---
layout: default
title: Bugs / Feature Request
nav_order: 6
permalink: /bugs-feature-request
---

# Feature Request

For feature request, create an issue of Github.

[Raise an issue on GitHub](https://github.com/maniacx/BudsLink/issues){: .btn .btn-purple .v-align-bottom .fs-2}.


# Bugs and Debugging

Encountering issues with this app? Please follow the steps below for troubleshooting and reporting:

### Flatpak

1. Check the runtime log at:
```
~/.var/app/io.github.maniacx.BudsLink/.local/state/log/runtime.log
```
(Note: On some distributions, the .var directory may be located elsewhere.)

2. If the issue persists, create a GitHub issue.
Please describe the problem in detail and attach the log file.

[Raise an issue on GitHub](https://github.com/maniacx/BudsLink/issues){: .btn .btn-purple .v-align-bottom .fs-2}.

3. Run the application from the command line and check for any log messages:
```
flatpak run io.github.maniacx.BudsLink
```


### Gjs script
1. Verify that all required dependencies are installed.
See the dependency list [here](./gjs-script)

2. Check the log file located in the local data log directory inside the script folder.

3. Run the script from the terminal/console using `gjs-console` command and observe any output or error messages:
```
gjs-console -m /path/to/BudsLink/script.js
```
Any logs displayed

4. If the problem persists, open an issue on GitHub and attach the relevant logs.

[Raise an issue on GitHub](https://github.com/maniacx/BudsLink/issues){: .btn .btn-purple .v-align-bottom .fs-2}.

### Terminating the Application

The application correctly handles cleanup during normal shutdown and when receiving SIGTERM or SIGINT signals.
This includes properly terminating any pactl subprocess started by the app.

If the application is terminated using other methods (for example, kill -9), cleanup handlers will not run.
In such cases, you may need to manually terminate any remaining pactl processes started by the application, if they still exist.
