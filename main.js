import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

import {createLogger} from './logger.js';
import {getBluezDeviceProxy} from './bluezDeviceProxy.js';
import {GalaxyBudsDevice} from './galaxyBudsDevice.js';
import {ProfileManager} from './profileManager.js';
import {setLiveLogSink, hideMacAdddress} from './logger.js';
import {ToggleButtonRow} from './widgets/toggleButtonRow.js';
import {DropDownRowWidget} from './widgets/dropDownRow.js';
import {SliderRowWidget} from './widgets/sliderRowWidget.js';
import {EqualizerWidget} from './widgets/equalizerWidget.js';

// globalThis.TESTDEVICE = 'Galaxy Buds 3 Pro';
// globalThis.TESTDEVICE = 'Galaxy Buds';
globalThis.TESTDEVICE = '';

Gio._promisify(Gio.DBusProxy, 'new');
Gio._promisify(Gio.DBusProxy, 'new_for_bus');
Gio._promisify(Gio.DBusProxy.prototype, 'call');
Gio._promisify(Gio.DBusConnection.prototype, 'call');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async');
Gio._promisify(Gio.OutputStream.prototype, 'write_all_async');

Adw.init();

const devicePath = '/org/bluez/hci0/dev_XX_XX_XX_XX_XX_XX';

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
        this._devicePath = devicePath;
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

        this._ancGroup = new Adw.PreferencesGroup({title: 'Noise Cancellation'});
        page.add(this._ancGroup);

        this._ancToggle = new ToggleButtonRow();
        this._ancToggle.connect('notify::toggled', () =>
            this._log.info(`ANC toggled : ${this._ancToggle.toggled}`));

        this._ancGroup.add(this._ancToggle);

        this._ambientLevel = new SliderRowWidget({
            rowTitle: 'Ambient Level',
            rowSubtitle: '',
            initialValue: 50,
            marks: [
                {mark: 0, label: 'Less'},
                {mark: 20, label: 'More'},
            ],
            range: [0, 20, 1],
            snapOnStep: false,
        });

        this._ambientLevel.visible = false;

        this._ambientLevel.connect('notify::value', () => {
            this._log.info(`Ambient level : ${this._ambientLevel.value}`);
        });

        this._ancGroup.add(this._ambientLevel);

        this._focuseSwitch = new Adw.SwitchRow({title: 'Focus on Voice'});
        this._focuseSwitch.connect('notify::active', () =>
            this._log.info(`Focus on Voice changed : ${this._focuseSwitch.get_active()}`));

        this._focuseSwitch.visible = false;

        this._ancGroup.add(this._focuseSwitch);

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


        this._initialize();
    }

    _initialize() {
        if (globalThis.TESTDEVICE) {
            this._startDevice();
        } else {
            this._bluezDeviceProxy = getBluezDeviceProxy(this._devicePath);
            const connected = this._bluezDeviceProxy.Connected;
            this._log.info(`Device connection status: ${connected}` +
                `Path: ${hideMacAdddress(this._devicePath)}`);
            if (!connected) {
                this._log.info('Device not connected. Waiting for device');
                this._bluezSignalId = this._bluezDeviceProxy.connect(
                    'g-properties-changed', () => this._onBluezPropertiesChanged());
            } else {
                this._startDevice();
            }
        }
    }

    _onBluezPropertiesChanged() {
        const connected = this._bluezDeviceProxy.Connected;
        if (connected) {
            this._startDevice();
            if (this._bluezDeviceProxy && this._bluezSignalId)
                this._bluezDeviceProxy.disconnect(this._bluezSignalId);
            this._bluezSignalId = null;
            this._bluezDeviceProxy = null;
        }
    }

    _startDevice() {
        const timeout = globalThis.TESTDEVICE ? 1 : 8;
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, timeout, () => {
            this._page.sensitive = true;
            return GLib.SOURCE_REMOVE;
        });

        const uiObjects = {
            bat1: this._battery1,
            bat2: this._battery2,
            bat3: this._battery3,

            inEarL: this._inEarL,
            inEarR: this._inEarR,

            ancGroup: this._ancGroup,
            ancToggle: this._ancToggle,
            ambientLevelSlider: this._ambientLevel,
            voiceFocusSwitch: this._focuseSwitch,

        };

        this._log.info('Start Device');
        this._profileManager = new ProfileManager();
        this._galaxyBudsDevice = new GalaxyBudsDevice(
            this._devicePath, uiObjects, this._profileManager);
    }
}

new BatteryApp().run([]);

