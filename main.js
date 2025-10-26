import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

import {createLogger} from './logger.js';
import {getBluezDeviceProxy} from './bluezDeviceProxy.js';
import {SonyDevice, SonyUUIDv2} from './sonyDeviceV2.js';
import {ProfileManager} from './profileManager.js';
import {setLiveLogSink, hideMacAdddress} from './logger.js';
import {ToggleButtonRow} from './widgets/toggleButtonRow.js';
import {DropDownRowWidget} from './widgets/dropDownRow.js';
import {EqualizerWidget} from './widgets/equalizerWidget.js';

import {
    EqualizerPreset, AutoPowerOff, AutoAsmSensitivity, ListeningMode, BgmDistance
} from './sonyDefsV2.js';

// globalThis.TESTDEVICE = 'WH-1000XM5';
// globalThis.TESTDEVICE = 'WF-C700N';
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

        this._battRow = new Adw.ActionRow({});
        page.add(batteryGroup);

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

        this._ancGroup = new Adw.PreferencesGroup({title: 'Noise Cancellation', visible: false});
        page.add(this._ancGroup);

        this._ancToggle = new ToggleButtonRow();
        this._ancToggle.connect('notify::toggled', () =>
            this._log.info(`ANC toggled : ${this._ancToggle.toggled}`));

        this._ancGroup.add(this._ancToggle);

        this._slider = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 20, 1);
        this._slider.hexpand = true;
        this._slider.margin_start = 50;
        this._slider.margin_end = 50;
        this._slider.margin_top = 4;
        this._slider.margin_bottom = 4;
        this._slider.add_mark(0, Gtk.PositionType.BOTTOM, 'Less');
        this._slider.add_mark(20, Gtk.PositionType.BOTTOM, 'More');

        this._levelSliderRow = new Adw.ActionRow({title: 'Ambient Level'});
        this._levelSliderRow.add_suffix(this._slider);

        this._slider.set_value(10);

        this._slider.connect('value-changed', () => {
            const value = Math.round(this._slider.get_value());
            if (this._sliderValue !== value)
                this._log.info(`Ambient level changed : ${value}`);
        });
        this._ancGroup.add(this._levelSliderRow);

        this._focuseSwitch = new Adw.SwitchRow({title: 'Focus on Voice'});
        this._focuseSwitch.connect('notify::active', () =>
            this._log.info(`Focus on Voice changed : ${this._focuseSwitch.get_active()}`));

        this._ancGroup.add(this._focuseSwitch);

        this._autoAmbientSoundSwitch =
            new Adw.SwitchRow({title: 'Auto Ambient Sound', visible: false});

        this._autoAmbientSoundSwitch.connect('notify::active', () => {
            this._log.info(`Auto Ambient : ${this._autoAmbientSoundSwitch.get_active()}`);
            this._focuseSwitch.sensitive =  !this._autoAmbientSoundSwitch.active;
            this._levelSliderRow.sensitive = !this._autoAmbientSoundSwitch.active;
            this._slider.sensitive = !this._autoAmbientSoundSwitch.active;
            if (this._autoAsmSensitivityDropdown)
                this._autoAsmSensitivityDropdown.sensitive = this._autoAmbientSoundSwitch.active;
        });

        this._ancGroup.add(this._autoAmbientSoundSwitch);

        const autoAsmSensitivityOptions = ['Standard', 'High', 'Low'];
        const autoAsmSensitivityValues =
            [AutoAsmSensitivity.STANDARD, AutoAsmSensitivity.HIGH, AutoAsmSensitivity.LOW];

        this._autoAsmSensitivityDropdown = new DropDownRowWidget({
            title: 'Auto Ambient Sound Sensitivity',
            options: autoAsmSensitivityOptions,
            values: autoAsmSensitivityValues,
            initialValue: AutoAsmSensitivity.STANDARD,
        });

        this._autoAsmSensitivityDropdown.visible = false;
        this._autoAsmSensitivityDropdown.sensitive = this._autoAmbientSoundSwitch.active;
        this._focuseSwitch.sensitive = !this._autoAmbientSoundSwitch.active;
        this._levelSliderRow.sensitive = !this._autoAmbientSoundSwitch.active;
        this._slider.sensitive = !this._autoAmbientSoundSwitch.active;

        this._autoAsmSensitivityDropdown.connect('notify::selected-item', () => {
            const val = this._autoAsmSensitivityDropdown.selected_item;
            this._log.info(`Auto ASM Sensitivity : ${val}`);
        });

        this._ancGroup.add(this._autoAsmSensitivityDropdown);

        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

        this._awarenessGroup = new Adw.PreferencesGroup({title: 'Speak to Chat', visible: false});
        page.add(this._awarenessGroup);

        this._awarenessToggle = new ToggleButtonRow();
        this._awarenessToggle.connect('notify::toggled', () =>
            this._log.info(`S2C toggled : ${this._awarenessToggle.toggled}`));

        this._awarenessGroup.add(this._awarenessToggle);

        const sensitivityOptions = ['Auto', 'High', 'Low'];
        const sensitivityValues = [0, 1, 2];
        this._sensitivityDropdown = new DropDownRowWidget({
            title: 'Voice Detection Sensitivity',
            options: sensitivityOptions,
            values: sensitivityValues,
            initialValue: 0,
        });

        this._sensitivityDropdown.visible = false;

        this._sensitivityDropdown.connect('notify::selected-item', () => {
            const val = this._sensitivityDropdown.selected_item;
            this._log.info(`S2C Sensitivity : ${val}`);
        });

        this._awarenessGroup.add(this._sensitivityDropdown);

        const durationOptions = ['Short', 'Standard', 'Long', 'Off'];
        const durationValues = [0, 1, 2, 3];
        this._durationDropdown = new DropDownRowWidget({
            title: 'Duration',
            options: durationOptions,
            values: durationValues,
            initialValue: 0,
        });

        this._durationDropdown.visible = false;

        this._durationDropdown.connect('notify::selected-item', () => {
            const val = this._durationDropdown.selected_item;
            this._log.info(`S2C Duration : ${val}`);
        });

        this._awarenessGroup.add(this._durationDropdown);

        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
        this._listeningModeGroup =
            new Adw.PreferencesGroup({title: 'Listening Mode', visible: false});

        const listeningModes =  [
            'Standard',
            'Background Music',
            'Cinema',
        ];

        this._listeningModesValues = [
            ListeningMode.STANDARD,
            ListeningMode.BGM,
            ListeningMode.CINEMA,
        ];

        this._bgmModeDropdown = new DropDownRowWidget({
            title: 'Listening Mode',
            options: listeningModes,
            values: this._listeningModesValues,
            initialValue: ListeningMode.STANDARD,
        });

        this._bgmModeDropdown.connect('notify::selected-item', () => {
            this._log.info(`BGM Mode  : ${this._bgmModeDropdown.selected_item}`);
            this._updateMenuSensitivity();
        });

        this._listeningModeGroup.add(this._bgmModeDropdown);

        const bgmDistance =  [
            'My Room',
            'Living Room',
            'Cafe',
        ];

        this._bgmDistanceValues = [
            BgmDistance.MY_ROOM,
            BgmDistance.LIVING_ROOM,
            BgmDistance.CAFE,
        ];

        this._bgmDistanceDropdown = new DropDownRowWidget({
            title: 'Background Music Effects',
            options: bgmDistance,
            values: this._bgmDistanceValues,
            initialValue: BgmDistance.MY_ROOM,
        });

        this._updateMenuSensitivity();

        this._bgmDistanceDropdown.connect('notify::selected-item', () => {
            this._log.info(`BGM Distance : ${this._bgmDistanceDropdown.selected_item}`);
        });

        this._listeningModeGroup.add(this._bgmDistanceDropdown);
        page.add(this._listeningModeGroup);

        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
        this._moreGroup = new Adw.PreferencesGroup({title: 'More Settings'});
        page.add(this._moreGroup);
        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

        this._voiceNotificationsSwitchRow = new Adw.SwitchRow({
            title: 'Voice Notification',
            subtitle: 'Enable voice notification',
            visible: false,
        });

        this._voiceNotificationsSwitchRow.connect('notify::active', () => {
            this._log.info(`Voice Notification : ${this._voiceNotificationsSwitchRow.active}`);
        });

        this._moreGroup.add(this._voiceNotificationsSwitchRow);

        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

        const eqPresets =  [
            'Off',
            'Bright',
            'Excited',
            'Mellow',
            'Relaxed',
            'Vocal',
            'Treble Boost',
            'Bass Boost',
            'Speech',
            'Manual',
            'Custom 1',
            'Custom 2',
        ];

        this._eqPresetValues = [
            EqualizerPreset.OFF,
            EqualizerPreset.BRIGHT,
            EqualizerPreset.EXCITED,
            EqualizerPreset.MELLOW,
            EqualizerPreset.RELAXED,
            EqualizerPreset.VOCAL,
            EqualizerPreset.TREBLE_BOOST,
            EqualizerPreset.BASS_BOOST,
            EqualizerPreset.SPEECH,
            EqualizerPreset.MANUAL,
            EqualizerPreset.CUSTOM_1,
            EqualizerPreset.CUSTOM_2,
        ];

        this._eqPresetDropdown = new DropDownRowWidget({
            title: 'Equalizer Preset',
            options: eqPresets,
            values: this._eqPresetValues,
            initialValue: EqualizerPreset.OFF,
        });

        this._eqPresetDropdown.visible = false;

        this._eqPresetDropdown.connect('notify::selected-item', () => {
            this._log.info(`Preset Eq changed: ${this._eqPresetDropdown.selected_item}`);
            this._updateEqCustomRowVisibility();
        });

        this._moreGroup.add(this._eqPresetDropdown);

        this._equalizerCustomRow =
                    new Adw.ActionRow({title: 'Custom Equalizer', visible: false});

        this._moreGroup.add(this._equalizerCustomRow);

        this._upscalingSwitchRow = new Adw.SwitchRow({
            title: 'Enable DSEE',
            subtitle: 'Enable DSEE enhancement',
            visible: false,
        });

        this._upscalingSwitchRow.connect('notify::active', () => {
            this._log.info(`DSEE : ${this._upscalingSwitchRow.active}`);
        });

        this._moreGroup.add(this._upscalingSwitchRow);


        this._pauseWhenTakenOff = new Adw.SwitchRow({
            title: 'Pause when taken off',
            visible: false,
        });

        this._pauseWhenTakenOff.connect('notify::active', () => {
            this._log.info(`Pause when taken off : ${this._pauseWhenTakenOff.active}`);
        });

        this._moreGroup.add(this._pauseWhenTakenOff);

        this._autoPowerOffLabels = [
            'Off',
            'After 5 minutes',
            'After 30 minutes',
            'After 1 hour',
            'After 3 hours',
            'When taken off',
        ];

        this._autoPowerOffValues = [
            AutoPowerOff.OFF.id,
            AutoPowerOff.AFTER_5_MIN.id,
            AutoPowerOff.AFTER_30_MIN.id,
            AutoPowerOff.AFTER_1_HOUR.id,
            AutoPowerOff.AFTER_3_HOUR.id,
            AutoPowerOff.WHEN_TAKEN_OFF.id,
        ];

        this._autoPowerOffDropdown = new DropDownRowWidget({
            title: 'Auto Power Off',
            options: this._autoPowerOffLabels,
            values: this._autoPowerOffValues,
            initialValue: AutoPowerOff.AFTER_30_MIN.id,
        });

        this._autoPowerOffDropdown.visible = false;

        this._autoPowerOffDropdown.connect('notify::selected-item', () => {
            const selectedId = this._autoPowerOffDropdown.selected_item;
            this._log.info(`Auto Power Off changed (id): ${selectedId}`);
        });

        this._moreGroup.add(this._autoPowerOffDropdown);

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

    addCustomEq(isTenBand = false) {
        const sixBandFreqs = ['Bass', '400', '1k', '2.5k', '6.3k', '16k'];
        const tenBandFreqs = ['31', '63', '125', '250', '500',
            '1k', '2k', '4k', '8k', '16k'];
        const freqs = isTenBand ? tenBandFreqs : sixBandFreqs;
        const range = isTenBand ? 6 : 10;

        const bandCount = isTenBand ? 10 : 6;
        const initialValues = Array(bandCount).fill(0);

        this._eq = new EqualizerWidget(freqs, initialValues, range);

        this._eq.connect('eq-changed', (_w, arr) => {
            this._log.info(`Custom Eq changed : ${arr}`);
        });

        this._equalizerCustomRow.set_child(this._eq);
        this._updateEqCustomRowVisibility();
        this._updateMenuSensitivity();
        return this._eq;
    }

    _updateEqCustomRowVisibility() {
        if (!this._equalizerCustomRow)
            return;

        const val = this._eqPresetDropdown.selected_item;

        this._equalizerCustomRow.visible = [
            EqualizerPreset.MANUAL,
            EqualizerPreset.CUSTOM_1,
            EqualizerPreset.CUSTOM_2,
        ].includes(val);
    };

    _updateMenuSensitivity()  {
        const isBGMMode = this._bgmModeDropdown.selected_item === ListeningMode.BGM;

        if (this._bgmDistanceDropdown)
            this._bgmDistanceDropdown.sensitive = isBGMMode;

        const isStdMode = this._bgmModeDropdown.selected_item === ListeningMode.STANDARD;

        if (this._eqPresetDropdown)
            this._eqPresetDropdown.sensitive = isStdMode;

        if (this._equalizerCustomRow)
            this._equalizerCustomRow.sensitive = isStdMode;
    }

    _initialize() {
        if (globalThis.TESTDEVICE) {
            this._startDevice();
        } else {
            this._bluezDeviceProxy = getBluezDeviceProxy(this._devicePath);
            const uuids = this._bluezDeviceProxy.UUIDs;

            if (!uuids.includes(SonyUUIDv2)) {
                this._log.info('Invalid Sony Device: Not Protocol V2 device');
                return;
            }

            const connected = this._bluezDeviceProxy.Connected;
            this._deviceConnected = connected;
            this._log.info(
                `Device connection status: ${connected} ` +
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
        if (this._deviceConnected !== connected) {
            this._deviceConnected = connected;

            this._log.info(
                'Device connection Changed' +
            `status: ${connected} Path: ${hideMacAdddress(this._devicePath)}`);

            if (connected) {
                this._startDevice();
                /*
            if (this._bluezDeviceProxy && this._bluezSignalId)
                this._bluezDeviceProxy.disconnect(this._bluezSignalId);
            this._bluezSignalId = null;
            this._bluezDeviceProxy = null;
 */
            } else {
                this._sonyDevice?.destroy();
                this._sonyDevice = null;
                this._profileManager.deleteFD(this._devicePath);
                this._profileManager.unregisterProfile('sony');
                this._profileManager = null;
            }
        }
    }

    _startDevice() {
        if (this._deviceStarted)
            return;

        this._deviceStarted = true;

        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 4, () => {
            this._page.sensitive = true;
            return GLib.SOURCE_REMOVE;
        });



        const uiObjects = {
            bat1: this._battery1,
            bat2: this._battery2,
            bat3: this._battery3,

            ancGroup: this._ancGroup,
            ancToggle: this._ancToggle,
            ambientLevelRow: this._levelSliderRow,
            ambientLevelSlider: this._slider,
            voiceFocusSwitch: this._focuseSwitch,
            autoAdaptiveNoiseSwitch: this._autoAmbientSoundSwitch,
            autoAdaptiveNoiseSensitivityDd: this._autoAsmSensitivityDropdown,

            s2cGroup: this._awarenessGroup,
            s2cToggle: this._awarenessToggle,
            s2cSensitivityDd: this._sensitivityDropdown,
            s2cDurationDd: this._durationDropdown,

            bgmGroup: this._listeningModeGroup,
            bgmModeDd: this._bgmModeDropdown,
            bgmDistanceDd: this._bgmDistanceDropdown,

            moreGroup: this._moreGroup,
            voiceNotificationSwitch: this._voiceNotificationsSwitchRow,
            eqPresetDd: this._eqPresetDropdown,
            eqCustomRow: this._equalizerCustomRow,
            dseeRow: this._upscalingSwitchRow,
            pauseWhenTakeOffSwitch: this._pauseWhenTakenOff,
            autoPowerOffDd: this._autoPowerOffDropdown,
            addCustomEqCallback: this.addCustomEq.bind(this),
            updateEqCustomRowVisibility: this._updateEqCustomRowVisibility.bind(this),
        };

        this._log.info('Start Device');
        this._profileManager = new ProfileManager();
        this._sonyDevice = new SonyDevice(this._devicePath, uiObjects, this._profileManager);
    }
}

new BatteryApp().run([]);

