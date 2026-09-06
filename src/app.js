'use strict';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import GLibUnix from 'gi://GLibUnix';
import {gettext as _} from 'gettext';

import {initLogger, createLogger} from './lib/devices/logger.js';
import {DeviceRowNavPage} from './appLibs/widgets/deviceRow.js';
import {SettingsButton} from './appLibs/widgets/settingsButton.js';
import {ThemeManager} from './appLibs/themeManager.js';
import {DbusService} from './appLibs/dbusService.js';
import {BluetoothClient} from './appLibs/bluetoothClient.js';
import {initConfigureWindowLauncher} from './appLibs/confirueWindowlauncher.js';
import {EnhancedDeviceSupportManager} from './lib/enhancedDeviceSupportManager.js';

Gio._promisify(Gio, 'bus_get');
Gio._promisify(Gio.DBusProxy, 'new');
Gio._promisify(Gio.DBusProxy, 'new_for_bus');
Gio._promisify(Gio.DBusProxy.prototype, 'call');
Gio._promisify(Gio.DBusConnection.prototype, 'call');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async');
Gio._promisify(Gio.OutputStream.prototype, 'write_all_async');
Gio._promisify(Gio.DataInputStream.prototype, 'read_line_async');

const SIGINT = 2;
const SIGTERM = 15;

const AppId = pkg.name; // eslint-disable-line no-undef

function resolveDataDir() {
    const installed = pkg.datadir; // eslint-disable-line no-undef
    const installedIcons = GLib.build_filenamev([installed, 'icons']);
    if (GLib.file_test(installedIcons, GLib.FileTest.IS_DIR))
        return installed;

    const srcRoot = GLib.getenv('MESON_SOURCE_ROOT');
    if (srcRoot) {
        const srcPath = GLib.build_filenamev([srcRoot, 'src']);
        if (GLib.file_test(GLib.build_filenamev([srcPath, 'icons']), GLib.FileTest.IS_DIR))
            return srcPath;
    }

    return installed;
}

const dataDir = resolveDataDir();

export const BudsLinkApplication = GObject.registerClass({
    GTypeName: 'BudsLinkApplication',
}, class BudsLinkApplication extends Adw.Application {
    _init() {
        super._init({
            application_id: AppId,
            flags: Gio.ApplicationFlags.FLAGS_NONE,
        });

        this._isServiceHeld = false;

        this._log = createLogger('Main');

        this.connect('startup', () => {
            try {
                this._onStartup();
            } catch (e) {
                this._log.error(e);
            }
        });

        this.connect('activate', () => {
            try {
                this._onActivate();
            } catch (e) {
                this._log.error(e);
            }
        });

        this.connect('shutdown', () => {
            this.destroy();
        });

        this._sigtermId = GLibUnix.signal_add(
            GLib.PRIORITY_DEFAULT,
            SIGTERM,
            () => {
                this.quit();
                return GLib.SOURCE_REMOVE;
            }
        );

        this._sigintId = GLibUnix.signal_add(
            GLib.PRIORITY_DEFAULT,
            SIGINT,
            () => {
                this.quit();
                return GLib.SOURCE_REMOVE;
            }
        );

        this._compDevices = new Map();
    }

    vfunc_dbus_register(connection, objectPath) {
        if (!super.vfunc_dbus_register(connection, objectPath))
            return false;

        this._onDbusRegister(connection, objectPath);

        return true;
    }

    _onDbusRegister(connection, objectPath) {
        this._dbusService = new DbusService(connection, objectPath, this._holdService.bind(this),
            this._releaseService.bind(this));
    }

    _holdService() {
        if (this._releaseTimer) {
            GLib.source_remove(this._releaseTimer);
            this._releaseTimer = 0;
        }

        if (!this._isServiceHeld) {
            this._isServiceHeld = true;
            this.hold();
        }
    }

    _releaseService() {
        if (this._releaseTimer)
            return;

        this._releaseTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
            this._releaseTimer = 0;
            this.release();
            this._isServiceHeld = false;
            return GLib.SOURCE_REMOVE;
        });
    }

    _onStartup() {
        this.settings = new Gio.Settings({schema_id: AppId});
        initLogger(this.settings);
        this._themeManager = new ThemeManager(this, this.settings);
        initConfigureWindowLauncher(this.settings, _);

        const provider = new Gtk.CssProvider();
        provider.load_from_resource('/io/github/maniacx/BudsLink/stylesheet.css');
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );

        const iconsPath = GLib.build_filenamev([dataDir, 'icons']);
        const iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
        iconTheme.add_search_path(iconsPath);

        this.airpodsEnabled = true;
        this.sonyEnabled = true;
        this.galaxyBudsEnabled = true;
        this.nothingBudsEnabled = true;
        this.googleBudsEnabled = true;
        this.redmiBudsEnabled = true;
        this.senhBudsEnabled = true;
        this.boseBudsEnabled = true;
        this.edifierBudsEnabled = true;
        this.gfpsEnabled = true;

        this._client = new BluetoothClient();
        this._deviceManager = new EnhancedDeviceSupportManager(this);
        this._initialize();
    }

    _onActivate() {
        if (this._window) {
            this._window.present();
            return;
        }

        this._showGui = true;

        this._window = new Adw.ApplicationWindow({
            application: this,
            default_width: 350,
            default_height: 780,
        });

        this._window.connect('close-request', () => {
            this._log.info('window close requested');
            this._showGui = false;
            this._sync();
            this._window = null;
            this._navView = null;
            this._toastOverlay = null;
            this._devicesGrp = null;
            this._noDeviceRow = null;
            return false;
        });

        const toolbarView = new Adw.ToolbarView();
        const headerBar = new Adw.HeaderBar();
        toolbarView.add_top_bar(headerBar);

        const navPage = new Adw.NavigationPage({
            title: _('BudsLink'),
            child: toolbarView,
        });

        const direction = navPage.get_direction();

        this._navView = new Adw.NavigationView();
        this._navView.add(navPage);

        const devicesPage = new Adw.PreferencesPage();
        this._devicesGrp = new Adw.PreferencesGroup({title: _('Devices')});
        devicesPage.add(this._devicesGrp);
        this._noDeviceRow = new Adw.ActionRow({title: _('No compatible device found')});
        this._devicesGrp.add(this._noDeviceRow);
        toolbarView.set_content(devicesPage);

        const settingsButton = new SettingsButton(this.settings, direction, this);
        this._devicesGrp.set_header_suffix(settingsButton);

        this._toastOverlay = new Adw.ToastOverlay({child: this._navView});
        this._window.set_content(this._toastOverlay);
        this._window.present();
        this.sync();
    }

    showToast(message) {
        if (this._toastOverlay)
            this._toastOverlay.add_toast(new Adw.Toast({title: message, timeout: 3}));
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
            const deviceProp =
                this._deviceManager.onDeviceSync(path, dev.connected, dev.icon, dev.alias);

            if (this._compDevices.has(path)) {
                const props = this._compDevices.get(path);

                if (!dev.connected) {
                    this._dbusService?.removeDevice(path);

                    if (this._showGui && props.row) {
                        props.row.destroy();
                        props.row.get_parent()?.remove(props.row);
                    }

                    this._compDevices.delete(path);
                    continue;
                }

                const dataHandlerRecieved =
                dev.connected && deviceProp.dataHandler && !props.dataHandler;

                if (dataHandlerRecieved) {
                    props.dataHandler = deviceProp.dataHandler;
                    this._dbusService?.addDevice(path, props.dataHandler);

                    if (this._showGui) {
                        props.row = new DeviceRowNavPage(path, dev.alias,
                            this._navView, this._devicesGrp, dataDir, props.dataHandler);
                    }
                }

                if (dev.connected) {
                    if (!this._showGui && props.row) {
                        props.row = null;
                    } else if (this._showGui && !props.row && props.dataHandler) {
                        props.row = new DeviceRowNavPage(path, dev.alias,
                            this._navView, this._devicesGrp, dataDir, props.dataHandler);
                    }
                }
            } else if (dev.connected) {
                const props = {dataHandler: null, row: null};

                if (deviceProp.dataHandler) {
                    props.dataHandler = deviceProp.dataHandler;
                    this._dbusService?.addDevice(path, props.dataHandler);

                    if (this._showGui) {
                        props.row = new DeviceRowNavPage(path, dev.alias,
                            this._navView, this._devicesGrp, dataDir, props.dataHandler);
                    }
                }

                this._compDevices.set(path, props);
            }
        }

        if (this._showGui && this._noDeviceRow) {
            const anyDeviceRows = Array.from(this._compDevices.values()).some(p => p.row !== null);
            this._noDeviceRow.visible = !anyDeviceRows;
        }

        this._deviceManager?.updateEnhancedDevicesInstance();
    }

    destroy() {
        if (this._sigintId) {
            GLib.Source.remove(this._sigintId);
            this._sigintId = 0;
        }

        if (this._sigtermId) {
            GLib.Source.remove(this._sigtermId);
            this._sigtermId = 0;
        }

        this._themeManager?.destroy();
        this._themeManager = null;

        this._client?.destroy();
        this._client = null;

        this._dbusService?.destroy();
        this._dbusService = null;

        this._deviceManager?.destroy();
        this._deviceManager = null;

        for (const props of this._compDevices.values())
            props.row?.destroy();

        this._compDevices.clear();

        this.settings = null;
    }
});
