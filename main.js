'use strict';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import './scriptLibs/signalCompat.js';

import {createLogger} from './lib/devices/logger.js';
import {DeviceRowNavPage} from './scriptLibs/widgets/deviceRow.js';
import {BluetoothClient} from './scriptLibs/bluetoothClient.js';
import {openLogWindow} from './scriptLibs/widgets/logWindow.js';
import {runPrechecks} from './scriptLibs/preChecks.js';
import {MockSettings} from './scriptLibs/mockGsettings/mockSettings.js';
import {initConfigureWindowLauncher} from './scriptLibs/confirueWindowlauncher.js';
import {Gtxt as _, APP_ID, scriptDir} from './scriptLibs/utils.js';
import {EnhancedDeviceSupportManager} from './lib/enhancedDeviceSupportManager.js';

Gio._promisify(Gio.DBusProxy, 'new');
Gio._promisify(Gio.DBusProxy, 'new_for_bus');
Gio._promisify(Gio.DBusProxy.prototype, 'call');
Gio._promisify(Gio.DBusConnection.prototype, 'call');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async');
Gio._promisify(Gio.OutputStream.prototype, 'write_all_async');

try {
    runPrechecks();
} catch (e) {
    printerr(`Dependency check failed:\n${e.message}`);
    throw new Error('Stop execution');
}

Adw.init();

class BatteryApp {
    constructor() {
        const styleManager = Adw.StyleManager.get_default();
        styleManager.color_scheme = Adw.ColorScheme.FORCE_DARK;

        this.application = new Adw.Application({
            application_id: APP_ID,
            flags: Gio.ApplicationFlags.FLAGS_NONE,
        });

        this._log = createLogger('Main');

        this.application.connect('activate', () => {
            try {
                this._onActivate();
            } catch (e) {
                this._log.error(e);
            }
        });

        this._compDevices = new Map();
    }

    run(argv) {
        this.application.run(argv);
    }

    _onActivate() {
        try {
            this._window = new Adw.ApplicationWindow({
                application: this.application,
                default_width: 350,
                default_height: 780,
            });

            this.airpodsEnabled = true;
            this.sonyEnabled = true;

            const provider = new Gtk.CssProvider();
            provider.load_from_path(`${scriptDir}/stylesheet.css`);

            Gtk.StyleContext.add_provider_for_display(
                Gdk.Display.get_default(),
                provider,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
            );

            const iconsPath = GLib.build_filenamev([scriptDir, 'icons']);
            const iconTheme = Gtk.IconTheme.get_for_display(this._window.get_display());
            iconTheme.add_search_path(iconsPath);

            this.settings = new MockSettings();

            initConfigureWindowLauncher(this.settings, _);

            const toolbarView = new Adw.ToolbarView();
            const headerBar = new Adw.HeaderBar({
                decoration_layout: 'icon:close',
                show_end_title_buttons: true,
            });
            toolbarView.add_top_bar(headerBar);

            const navPage = new Adw.NavigationPage({
                title: _('Bluetooth Earbuds Companion'),
                child: toolbarView,
            });

            this._navView = new Adw.NavigationView();
            this._navView.add(navPage);

            const devicesPage = new Adw.PreferencesPage();
            this._devicesGrp = new Adw.PreferencesGroup({title: _('Devices')});
            devicesPage.add(this._devicesGrp);
            this._noDeviceRow = new Adw.ActionRow({title: _('No compatible device found')});
            this._devicesGrp.add(this._noDeviceRow);
            toolbarView.set_content(devicesPage);

            const logButton = new Gtk.Button({
                child: new Adw.ButtonContent({icon_name: 'bbm-logs-symbolic'}),
                tooltip_text: _('Realtime Logs'),
                margin_top: 6,
                margin_bottom: 6,
                css_classes: ['circular'],
            });

            logButton.connect('clicked', () => {
                openLogWindow(_);
            });

            this._devicesGrp.set_header_suffix(logButton);

            this._window.set_content(this._navView);
            this._window.present();

            this._client = new BluetoothClient();
            this._deviceManager = new EnhancedDeviceSupportManager(this);
            this._initialize();
        } catch (e) {
            this._log.error(e);
        }
    }

    async _initialize() {
        try {
            await this._client.initClient();
            this._sync();
            this._client.connect('devices-update', () => this._sync());
        } catch (e) {
            this._log.error(e);
        }
    }

    sync() {
        if (this._syncRunning) {
            this._syncPending = true;
            return;
        }

        this._syncRunning = true;

        do {
            this._syncPending = false;
            this._sync();
        } while (this._syncPending);

        this._syncRunning = false;
    }

    _sync() {
        for (const [path, dev] of this._client.devices) {
            try {
                const deviceProp =
                this._deviceManager.onDeviceSync(path, dev.connected, dev.icon, dev.alias);

                if (this._compDevices.has(path)) {
                    const props = this._compDevices.get(path);
                    if (!dev.connected) {
                        props.row.destroy();
                        props.row.get_parent()?.remove(props.row);
                        this._compDevices.delete(path);
                    } else if (dev.connected && !props.row &&
                            deviceProp.type && deviceProp.dataHandler) {
                        props.type = deviceProp.type;
                        props.dataHandler = deviceProp.dataHandler;
                        props.row = new DeviceRowNavPage(path, dev.alias, dev.icon, this._navView,
                            this._devicesGrp, scriptDir, props.dataHandler);
                    }
                } else if (dev.connected) {
                    const props = {type: null, dataHandler: null, row: null};
                    if (deviceProp.type && deviceProp.dataHandler) {
                        props.type = deviceProp.type;
                        props.dataHandler = deviceProp.dataHandler;
                        props.row = new DeviceRowNavPage(path, dev.alias, dev.icon, this._navView,
                            this._devicesGrp, scriptDir, props.dataHandler);
                    }
                    this._compDevices.set(path, props);
                }
            } catch (e) {
                this._log.error(e);
            }
        }

        const anyDeviceRows = Array.from(this._compDevices.values()).some(p => p.row !== null);
        this._noDeviceRow.visible = !anyDeviceRows;

        this._deviceManager?.updateEnhancedDevicesInstance();
    }
}

new BatteryApp().run([]);

