import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

import {createLogger} from './logger.js';
import {getBluezDeviceProxy} from './bluezDeviceProxy.js';
import {GalaxyBudsDevice} from './galaxyBudsDevice.js';
import {ProfileManager} from './profileManager.js';
import {setLiveLogSink} from './logger.js';
import {ToggleButtonRow} from './widgets/toggleButtonRow.js';
import {DropDownRowWidget} from './widgets/dropDownRowWidget.js';
import {SliderRowWidget} from './widgets/sliderRowWidget.js';
import {CheckBoxesGroupWidget} from './widgets/checkBoxesGroupWidget.js';

import {EqPresets} from './galaxyBudsConfig.js';

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

        const durationOptions = ['5 seconds', '10 seconds', '15 seconds'];
        const durationValues = [0, 1, 2];
        this._durationDropdown = new DropDownRowWidget({
            title: 'Duration',
            options: durationOptions,
            values: durationValues,
            initialValue: 0,
        });

        this._durationDropdown.visible = false;

        this._durationDropdown.connect('notify::selected-item', () => {
            const val = this._durationDropdown.selected_item;
            this._log.info(`Voice Detect Duration : ${val}`);
        });

        this._awarenessGroup.add(this._durationDropdown);

        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
        this._eqGroup = new Adw.PreferencesGroup({title: 'Equalizer', visible: false});
        page.add(this._eqGroup);

        const eqPresets =  [
            'Off',
            'Bass Boost',
            'Soft',
            'Dynamic',
            'Clear',
            'Treble Boost',

        ];

        this._eqPresetValues = [
            EqPresets.Off,
            EqPresets.BassBoost,
            EqPresets.Soft,
            EqPresets.Dynamic,
            EqPresets.Clear,
            EqPresets.TrebleBoost,
        ];

        this._eqPresetDropdown = new DropDownRowWidget({
            title: 'Equalizer Preset',
            options: eqPresets,
            values: this._eqPresetValues,
            initialValue: EqPresets.Off,
        });

        this._eqPresetDropdown.visible = false;

        this._stereoBal = new SliderRowWidget({
            rowTitle: 'Balance',
            rowSubtitle: '',
            initialValue: 16,
            marks: [
                {mark: 0, label: 'Left'},
                {mark: 16, label: 'Center'},
                {mark: 32, label: 'Right'},
            ],
            range: [0, 32, 1],
            snapOnStep: true,
        });

        this._stereoBal.visible = false;

        this._stereoBal.connect('notify::value', () => {
            this._log.info(`Stereo Balance : ${this._stereoBal.value}`);
        });

        this._eqGroup.add(this._eqPresetDropdown);
        this._eqGroup.add(this._stereoBal);

        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

        this._touchControlGroup = new Adw.PreferencesGroup({
            title: 'Earbuds Controls',
            visible: false,
        });
        page.add(this._touchControlGroup);

        // Touch Control Enable
        this._touchControlLockSwitch = new Adw.SwitchRow({
            title: 'Lock Touch Controls ',
            visible: false,
        });

        this._touchControlLockSwitch.connect('notify::active', () => {
            this._log.info(`Touch Controls : ${this._touchControlLockSwitch.active}`);
        });

        this._touchControlGroup.add(this._touchControlLockSwitch);

        // SingleTap Enable
        this._touchControlSingleTapSwitch = new Adw.SwitchRow({
            title: 'Single Tap',
            visible: false,
        });

        this._touchControlSingleTapSwitch.connect('notify::active', () => {
            this._log.info(`Single Tap : ${this._touchControlSingleTapSwitch.active}`);
        });

        this._touchControlGroup.add(this._touchControlSingleTapSwitch);

        // DoubleTap Enable
        this._touchControlDoubleTapSwitch = new Adw.SwitchRow({
            title: 'Double Tap',
            visible: false,
        });

        this._touchControlDoubleTapSwitch.connect('notify::active', () => {
            this._log.info(`Double Tap : ${this._touchControlDoubleTapSwitch.active}`);
        });

        this._touchControlGroup.add(this._touchControlDoubleTapSwitch);

        // TripleTap Enable
        this._touchControlTripleTapSwitch = new Adw.SwitchRow({
            title: 'Triple Tap',
            visible: false,
        });

        this._touchControlTripleTapSwitch.connect('notify::active', () => {
            this._log.info(`Triple Tap : ${this._touchControlTripleTapSwitch.active}`);
        });

        this._touchControlGroup.add(this._touchControlTripleTapSwitch);

        // Touch and Hold Enable
        this._touchControlTouchHoldSwitch = new Adw.SwitchRow({
            title: 'Touch and Hold',
            visible: false,
        });

        this._touchControlTouchHoldSwitch.connect('notify::active', () => {
            this._log.info(`Touch and Hold : ${this._touchControlTouchHoldSwitch.active}`);
        });

        this._touchControlGroup.add(this._touchControlTouchHoldSwitch);


        // /

        this._touchAndHoldLeftDD = new DropDownRowWidget({
            title: 'Left Earbud Touch and Hold Function',
            options: ['Volume'],
            values: [3],
            initialValue: 3,
        });

        this._touchAndHoldLeftDD.visible = false;
        this._touchAndHoldLeftDD.connect('notify::selected-item', () => {
            const val = this._touchAndHoldLeftDD.selected_item;
            this._log.info(`Left Earbud Touch and Hold Function : ${val}`);
        });

        this._touchControlGroup.add(this._touchAndHoldLeftDD);

        this._touchAndHoldRightDD = new DropDownRowWidget({
            title: 'Right Earbud Touch and Hold Function',
            options: ['Volume'],
            values: [3],
            initialValue: 3,
        });

        this._touchAndHoldRightDD.visible = false;
        this._touchAndHoldRightDD.connect('notify::selected-item', () => {
            const val = this._touchAndHoldRightDD.selected_item;
            this._log.info(`Right Earbud Touch and Hold Function : ${val}`);
        });

        this._touchControlGroup.add(this._touchAndHoldRightDD);

        // /
        // Answer Call or End Call Enable
        this._touchControlAnswerCallSwitch = new Adw.SwitchRow({
            title: 'Double Tap to Answer Call or End Call',
            visible: false,
        });

        this._touchControlAnswerCallSwitch.connect('notify::active', () => {
            this._log.info(
                `Answer Call or End Call : ${this._touchControlAnswerCallSwitch.active}`);
        });

        this._touchControlGroup.add(this._touchControlAnswerCallSwitch);

        // Decline Call Enable
        this._touchControlDeclineCallSwitch = new Adw.SwitchRow({
            title: 'Touch and Hold to Decline Call',
            visible: false,
        });

        this._touchControlDeclineCallSwitch.connect('notify::active', () => {
            this._log.info(`Decline Call : ${this._touchControlDeclineCallSwitch.active}`);
        });

        this._touchControlGroup.add(this._touchControlDeclineCallSwitch);

        // Lighting mode
        this._lightingModeDD = new Adw.SwitchRow({
            title: 'Lighting Controls',
            visible: false,
        });

        //
        const lightingModesOptions = ['Blinking', 'Fade in and out', 'Steady'];
        const lightingValues = [2, 3, 1];
        this._lightingModeDD = new DropDownRowWidget({
            title: 'Earbuds Lighting Controls',
            options: lightingModesOptions,
            values: lightingValues,
            initialValue: 2,
        });

        this._lightingModeDD.visible = false;
        this._lightingModeDD.connect('notify::selected-item', () => {
            const val = this._lightingModeDD.selected_item;
            this._log.info(`Lighting Mode : ${val}`);
        });

        this._touchControlGroup.add(this._lightingModeDD);

        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
        this._moreSettings = new Adw.PreferencesGroup({
            title: 'Additional Settings',
            visible: false,
        });
        page.add(this._moreSettings);

        // SideTone
        this._sideToneSwitch = new Adw.SwitchRow({
            title: 'Ambient Sound During Calls',
            visible: false,
        });

        this._sideToneSwitch.connect('notify::active', () => {
            this._log.info(
                `Answer Call or End Call : ${this._sideToneSwitch.active}`);
        });

        this._moreSettings.add(this._sideToneSwitch);

        // NoiseControlsOneEarbud
        this._noiseControlsOneEarbudSwitch = new Adw.SwitchRow({
            title: 'Noise Controls With One Earbud',
            visible: false,
        });

        this._noiseControlsOneEarbudSwitch.connect('notify::active', () => {
            this._log.info(
                `Noise Controls With One Earbud: ${this._noiseControlsOneEarbudSwitch.active}`);
        });

        this._moreSettings.add(this._noiseControlsOneEarbudSwitch);

        // outsideDoubleTap
        this._outsideDoubleTapSwitch = new Adw.SwitchRow({
            title: 'Double Tap Outside Edge For Volume Controls',
            visible: false,
        });

        this._outsideDoubleTapSwitch.connect('notify::active', () => {
            this._log.info(
                `Outside Double Tap: ${this._outsideDoubleTapSwitch.active}`);
        });

        this._moreSettings.add(this._outsideDoubleTapSwitch);
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

    _addLeftToggleCb(params) {
        const leftToggleWidget = new CheckBoxesGroupWidget(params);
        this._page.add(leftToggleWidget);
        return leftToggleWidget;
    }

    _addRightToggleCb(params) {
        const rightToggleWidget = new CheckBoxesGroupWidget(params);
        this._page.add(rightToggleWidget);
        return rightToggleWidget;
    }

    _addAmbientCustomWidget(paramL, paramsR) {
        this._ambientLLevel = new SliderRowWidget(paramL);
        this._ambientLLevel.connect('notify::value', () => {
            this._log.info(`Left Earbud Ambient Volume : ${this._ambientLLevel.value}`);
        });

        this._ambientCustomizeGroup.add(this._ambientLLevel);

        this._ambientRLevel = new SliderRowWidget(paramsR);
        this._ambientRLevel.connect('notify::value', () => {
            this._log.info(`Right Earbud Ambient Volume : ${this._ambientRLevel.value}`);
        });

        this._ambientCustomizeGroup.add(this._ambientRLevel);

        this._ambientToneLevel = new SliderRowWidget({
            rowTitle: 'Ambient Sound Tone',
            rowSubtitle: '',
            initialValue: 2,
            range: [0, 4, 1],
            snapOnStep: true,
        });

        this._ambientToneLevel.connect('notify::value', () => {
            this._log.info(`Ambient Sound Tone : ${this._ambientToneLevel.value}`);
        });

        this._ambientCustomizeGroup.add(this._ambientToneLevel);

        return {
            ambientLLevel: this._ambientLLevel,
            ambientRLevel: this._ambientRLevel,
            ambientToneLevel: this._ambientToneLevel,
        };
    }


    _initialize() {
        if (globalThis.TESTDEVICE) {
            this._startDevice();
        } else {
            this._bluezDeviceProxy = getBluezDeviceProxy(this._devicePath);
            const connected = this._bluezDeviceProxy.Connected;
            this._log.info(`Device connection status: ${connected}`);
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
            noiseCancellationLevelSlider: this._noiseCancellationLevel,
            voiceFocusSwitch: this._focuseSwitch,

            s2cGroup: this._awarenessGroup,
            s2cToggle: this._awarenessToggle,
            s2cDurationDd: this._durationDropdown,

            eqGroup: this._eqGroup,
            eqPresetDd: this._eqPresetDropdown,
            stereoBalSlider: this._stereoBal,

            touchControlGroup: this._touchControlGroup,
            touchControlLockSwitch: this._touchControlLockSwitch,
            touchControlSingleTapSwitch: this._touchControlSingleTapSwitch,
            touchControlDoubleTapSwitch: this._touchControlDoubleTapSwitch,
            touchControlTripleTapSwitch: this._touchControlTripleTapSwitch,
            touchControlTouchHoldSwitch: this._touchControlTouchHoldSwitch,
            touchAndHoldLeftDD: this._touchAndHoldLeftDD,
            touchAndHoldRightDD: this._touchAndHoldRightDD,

            touchControlAnswerCallSwitch: this._touchControlAnswerCallSwitch,
            touchControlDeclineCallSwitch: this._touchControlDeclineCallSwitch,

            lightingModeDD: this._lightingModeDD,

            addLeftToggleCb: this._addLeftToggleCb.bind(this),
            addRightToggleCb: this._addRightToggleCb.bind(this),

            moreSettingsGrp: this._moreSettings,
            sideToneSwitch: this._sideToneSwitch,
            noiseControlsOneEarbudSwitch: this._noiseControlsOneEarbudSwitch,
            outsideDoubleTapSwitch: this._outsideDoubleTapSwitch,

            ambientCustomizeGroup: this._ambientCustomizeGroup,
            customAmbientSwitch: this._customAmbientSwitch,
            ambientVolumeLevelCb: this._addAmbientCustomWidget.bind(this),
        };

        this._log.info('Start Device');
        this._profileManager = new ProfileManager();
        this._galaxyBudsDevice = new GalaxyBudsDevice(
            this._devicePath, uiObjects, this._profileManager);
    }
}

new BatteryApp().run([]);

