import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';


import {MacAddress} from './macAddress.js';

import {createLogger, setLiveLogSink} from './lib/devices/logger.js';
import {getBluezDeviceProxy} from './lib/bluezDeviceProxy.js';
import {ProfileManager} from './lib/devices/profileManager.js';

import {ToggleButtonRow} from './preferences/widgets/toggleButtonRow.js';
import {SliderRowWidget} from './preferences/widgets/sliderRowWidget.js';

import {GalaxyBudsDevice} from './lib/devices/galaxyBuds/galaxyBudsDevice.js';
import {ConfigureWindow} from './preferences/devices/galaxyBuds/configureWindow.js';

// globalThis.TESTDEVICE = 'Galaxy Buds Core';
// globalThis.TESTDEVICE = 'Galaxy Buds3 FE';
// globalThis.TESTDEVICE = 'Galaxy Buds3 Pro';
// globalThis.TESTDEVICE = 'Galaxy Buds3';
// globalThis.TESTDEVICE = 'Galaxy Buds FE';
// globalThis.TESTDEVICE = 'Galaxy Buds2 Pro';
// globalThis.TESTDEVICE = 'Galaxy Buds2';
// globalThis.TESTDEVICE = 'Galaxy Buds Pro';
// globalThis.TESTDEVICE = 'Galaxy Buds Live';
// globalThis.TESTDEVICE = 'Galaxy Buds+';
// globalThis.TESTDEVICE = 'Galaxy Buds';

globalThis.TESTDEVICE = '';

Gio._promisify(Gio.DBusProxy, 'new');
Gio._promisify(Gio.DBusProxy, 'new_for_bus');
Gio._promisify(Gio.DBusProxy.prototype, 'call');
Gio._promisify(Gio.DBusConnection.prototype, 'call');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async');
Gio._promisify(Gio.OutputStream.prototype, 'write_all_async');

Adw.init();

function macToDevicePath(mac) {
    const macRegex = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/;
    if (!macRegex.test(mac))
        return null;

    const formatted = mac.replace(/:/g, '_').toUpperCase();

    return `/org/bluez/hci0/dev_${formatted}`;
}

class BatteryApp {
    constructor() {
        this.application = new Adw.Application({
            application_id: 'com.github.maniacx.BluetoothBatteryMeterTest',
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

        this._deviceStarted = false;
        this._deviceConnected = false;
    }

    run(argv) {
        this.application.run(argv);
    }

    _onActivate() {
        this._window = new Adw.ApplicationWindow({
            application: this.application,
            default_width: 1200,
            default_height: 800,
            title: 'Bluetooth Battery Meter Test',
        });

        const tag = 'Main';
        this._log = createLogger(tag);

        const toolbarView = new Adw.ToolbarView();
        const headerBar = new Adw.HeaderBar({
            decoration_layout: 'icon:close',
            show_end_title_buttons: true,
        });
        toolbarView.add_top_bar(headerBar);

        const vbox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
            vexpand: true,
        });

        const page = new Adw.PreferencesPage();
        this._page = page;
        this._page.sensitive = false;

        const currentFile = import.meta.url.replace('file://', '');
        const scriptDir = Gio.File.new_for_path(GLib.path_get_dirname(currentFile));
        const iconsDir = scriptDir.get_child('icons');
        const iconsPath = iconsDir.get_path();
        const iconTheme = Gtk.IconTheme.get_for_display(this._window.get_display());
        iconTheme.add_search_path(iconsPath);

        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
        const batteryGroup = new Adw.PreferencesGroup({title: 'Battery Information'});
        page.add(batteryGroup);

        this._battRow = new Adw.ActionRow({});

        const batteryBox1 = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            homogeneous: true,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 12,
            margin_end: 12,
        });

        const bat1 = new Adw.ButtonContent({label: '---', icon_name: 'bbm-gatt-bas-symbolic'});
        const bat2 = new Adw.ButtonContent({label: '---'});
        const bat3 = new Adw.ButtonContent({label: '---'});

        this._battery1 = new Gtk.Button({sensitive: false, child: bat1});
        this._battery2 = new Gtk.Button({sensitive: false, child: bat2, visible: false});
        this._battery3 = new Gtk.Button({sensitive: false, child: bat3, visible: false});

        this._battery1.setLabel = bat1.set_label.bind(bat1);
        this._battery2.setLabel = bat2.set_label.bind(bat2);
        this._battery3.setLabel = bat3.set_label.bind(bat3);

        this._battery1.setIcon = bat1.set_icon_name.bind(bat1);
        this._battery2.setIcon = bat2.set_icon_name.bind(bat2);
        this._battery3.setIcon = bat3.set_icon_name.bind(bat3);

        batteryBox1.append(this._battery1);
        batteryBox1.append(this._battery2);
        batteryBox1.append(this._battery3);

        this._battRow.child = batteryBox1;
        batteryGroup.add(this._battRow);

        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

        const inEarGroup = new Adw.PreferencesGroup({title: 'In Ear Status'});
        page.add(inEarGroup);

        this._inEarRow = new Adw.ActionRow({});

        const inEarBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            homogeneous: true,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 12,
            margin_end: 12,
        });

        const inEarL =
            new Adw.ButtonContent({label: 'Disconnected', icon_name: 'bbm-left-symbolic'});
        const inEarR =
            new Adw.ButtonContent({label: 'Disconnected', icon_name: 'bbm-right-symbolic'});

        this._inEarL = new Gtk.Button({sensitive: false, child: inEarL});
        this._inEarR = new Gtk.Button({sensitive: false, child: inEarR});


        this._inEarL.setLabel = inEarL.set_label.bind(inEarL);
        this._inEarR.setLabel = inEarR.set_label.bind(inEarR);

        this._inEarL.setIcon = inEarL.set_icon_name.bind(inEarL);
        this._inEarR.setIcon = inEarR.set_icon_name.bind(inEarR);

        inEarBox.append(this._inEarL);
        inEarBox.append(this._inEarR);

        this._inEarRow.child = inEarBox;
        inEarGroup.add(this._inEarRow);

        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

        this._ancGroup = new Adw.PreferencesGroup({title: 'Noise Cancellation', visible: false});
        page.add(this._ancGroup);

        this._ancToggle = new ToggleButtonRow();
        this._ancToggle.connect('notify::toggled', () =>
            this._log.info(`ANC toggled : ${this._ancToggle.toggled}`));

        this._ancGroup.add(this._ancToggle);

        this._ambientLevel = new SliderRowWidget({
            rowTitle: 'Ambient Level',
            rowSubtitle: '',
            initialValue: 0,
            range: [0, 20, 1],
            snapOnStep: true,
        });

        this._ambientLevel.visible = false;

        this._ambientLevel.connect('notify::value', () => {
            this._log.info(`Ambient level : ${this._ambientLevel.value}`);
        });

        this._ancGroup.add(this._ambientLevel);

        this._noiseCancellationLevel = new SliderRowWidget({
            rowTitle: 'Noise Level',
            rowSubtitle: '',
            initialValue: 0,
            range: [0, 20, 1],
            snapOnStep: true,
        });

        this._noiseCancellationLevel.visible = false;

        this._noiseCancellationLevel.connect('notify::value', () => {
            this._log.info(`Noise level : ${this._noiseCancellationLevel.value}`);
        });

        this._ancGroup.add(this._noiseCancellationLevel);


        this._focuseSwitch = new Adw.SwitchRow({title: 'Focus on Voice'});
        this._focuseSwitch.connect('notify::active', () =>
            this._log.info(`Focus on Voice changed : ${this._focuseSwitch.get_active()}`));

        this._focuseSwitch.visible = false;

        this._ancGroup.add(this._focuseSwitch);

        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

        this._ambientCustomizeGroup = new Adw.PreferencesGroup({
            title: 'Customize Ambient Sound',
            visible: false,
        });
        page.add(this._ambientCustomizeGroup);

        this._customAmbientSwitch = new Adw.SwitchRow({title: 'Customize Ambient Sound'});
        this._customAmbientSwitch.connect('notify::active', () => {
            this._log.info(
                `Customize Ambient Sound changed : ${this._customAmbientSwitch.get_active()}`);
        });

        this._customAmbientSwitch.visible = false;

        this._ambientCustomizeGroup.add(this._customAmbientSwitch);

        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

        this._awarenessGroup = new Adw.PreferencesGroup({title: 'Voice detection', visible: false});
        page.add(this._awarenessGroup);

        this._awarenessToggle = new ToggleButtonRow();
        this._awarenessToggle.connect('notify::toggled', () =>
            this._log.info(`S2C toggled : ${this._awarenessToggle.toggled}`));

        this._awarenessGroup.add(this._awarenessToggle);

        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
        vbox.append(page);

        const scrolled = new Gtk.ScrolledWindow({
            vexpand: true,
        });
        scrolled.set_size_request(-1, 220);

        this._logBuffer = new Gtk.TextBuffer();
        this._logView = new Gtk.TextView({
            buffer: this._logBuffer,
            editable: false,
            monospace: true,
            wrap_mode: Gtk.WrapMode.WORD_CHAR,
        });

        scrolled.set_child(this._logView);
        vbox.append(scrolled);

        toolbarView.set_content(vbox);
        this._window.set_content(toolbarView);
        this._window.present();

        setLiveLogSink(line => {
            const endIter = this._logBuffer.get_end_iter();
            this._logBuffer.insert(endIter, line, line.length);

            const mark = this._logBuffer.create_mark(null, this._logBuffer.get_end_iter(), true);
            this._logView.scroll_to_mark(mark, 0, false, 0, 0);
        });

        this._page = page;

        this._initialize();
    }

    _loadGsettings() {
        const schema = Gio.SettingsSchemaSource.get_default()?.lookup('org.maniacx.testbbm', true);

        if (!schema) {
            this._log.info('Missing schema org.maniacx.testbbm.\n' +
                'Please run bash script provided to INSTALL schemas\n\n' +
                'Command:[  install-schema.sh install  ]\n');
            return null;
        }

        return new Gio.Settings({settings_schema: schema});
    }

    _initialize() {
        const settings = this._loadGsettings();
        if (settings === null)
            return;

        if (globalThis.TESTDEVICE) {
            this._alias = globalThis.TESTDEVICE;
            this._startDevice(settings);
        } else {
            this._devicePath = macToDevicePath(MacAddress);
            if (!this._devicePath) {
                this._log.info('ERROR: Invalid format of MAC Address. Please check');
                return;
            }

            this._bluezDeviceProxy = getBluezDeviceProxy(this._devicePath);
            const connected = this._bluezDeviceProxy.Connected;
            if (connected === null) {
                this._log.info('ERROR: Device not found for the provided MAC address');
                return;
            }

            if (!connected) {
                this._log.info('Device not connected. Waiting for device');
                this._bluezSignalId = this._bluezDeviceProxy.connect(
                    'g-properties-changed', () => this._onBluezPropertiesChanged(settings));
            } else {
                this._alias = this._bluezDeviceProxy.Alias;
                this._startDevice(settings);
            }
        }
    }

    _onBluezPropertiesChanged(settings) {
        const connected = this._bluezDeviceProxy.Connected;
        if (connected) {
            this._startDevice(settings);
            if (this._bluezDeviceProxy && this._bluezSignalId)
                this._bluezDeviceProxy.disconnect(this._bluezSignalId);
            this._bluezSignalId = null;
            this._bluezDeviceProxy = null;
        }
    }

    _startDevice(settings) {
        const timeout = globalThis.TESTDEVICE ? 1 : 8;
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, timeout, () => {
            this._page.sensitive = true;
            return GLib.SOURCE_REMOVE;
        });

        const uiObjects = {
            configureWindow: ConfigureWindow,
            page: this._page,

            bat1: this._battery1,
            bat2: this._battery2,
            bat3: this._battery3,

            inEarL: this._inEarL,
            inEarR: this._inEarR,

            ancGroup: this._ancGroup,
            ancToggle: this._ancToggle,
            ambientLevelSlider: this._ambientLevel,
            noiseCancellationLevelSlider: this._noiseCancellationLevel,
            voiceFocusSwitch: this._focuseSwitch,

            s2cGroup: this._awarenessGroup,
            s2cToggle: this._awarenessToggle,
        };

        this._log.info('Start Device');
        this._profileManager = new ProfileManager();
        this._galaxyBudsDevice = new GalaxyBudsDevice(settings,
            this._devicePath, this._alias, uiObjects, this._profileManager);
    }
}

new BatteryApp().run([]);

