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
import {SliderRowWidget} from './widgets/sliderRowWidget.js';
import {EqualizerWidget} from './widgets/equalizerWidget.js';
import {CheckBoxesGroupWidget} from './widgets/checkBoxesGroupWidget.js';

import {
    EqualizerPreset, AutoPowerOffTime, AutoAsmSensitivity, ListeningMode, BgmDistance
} from './sonyConfig.js';

// globalThis.TESTDEVICE = 'WH-1000XM6';
// globalThis.TESTDEVICE = 'WF-1000XM5';
// globalThis.TESTDEVICE = 'WH-1000XM5';
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

        const infoBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
        });

        batteryGroup.set_header_suffix(infoBox);
        this._dseeIndicator = new Gtk.Image({visible: false});
        this._codecIndicator = new Gtk.Image({visible: false});
        infoBox.append(this._dseeIndicator);
        infoBox.append(this._codecIndicator);



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

        this._ambientLevel.connect('notify::value', () => {
            this._log.info(`Ambient level : ${this._ambientLevel.value}`);
        });

        this._ancGroup.add(this._ambientLevel);

        this._focuseSwitch = new Adw.SwitchRow({title: 'Focus on Voice'});
        this._focuseSwitch.connect('notify::active', () =>
            this._log.info(`Focus on Voice changed : ${this._focuseSwitch.get_active()}`));

        this._ancGroup.add(this._focuseSwitch);

        this._autoAmbientSoundSwitch =
            new Adw.SwitchRow({title: 'Auto Ambient Sound', visible: false});

        this._autoAmbientSoundSwitch.connect('notify::active', () => {
            this._log.info(`Auto Ambient : ${this._autoAmbientSoundSwitch.get_active()}`);
            this._focuseSwitch.sensitive =  !this._autoAmbientSoundSwitch.active;
            this._ambientLevel.sensitive = !this._autoAmbientSoundSwitch.active;
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
        this._ambientLevel.sensitive = !this._autoAmbientSoundSwitch.active;

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

        const items = [
            {name: 'Noise Cancellation', icon: 'bbm-anc-on-symbolic'},
            {name: 'Ambient', icon: 'bbm-transperancy-symbolic'},
            {name: 'Off', icon: 'bbm-anc-off-symbolic'},
        ];

        this._ancToggleButtonWidget = new CheckBoxesGroupWidget({
            groupTitle: 'ANC Button Configuration',
            rowTitle: '[NC/AMB] Button Settings',
            rowSubtitle: 'Select the modes that needs to be toggled',
            items,
            applyBtnName: 'Apply',
            initialValue: 0,
        });
        this._ancToggleButtonWidget.visible = false;

        this._ancToggleButtonWidget.connect('notify::toggled-value', () => {
            this._log.info(
                `ANC Toggle button values : ${this._ancToggleButtonWidget.toggled_value}`);
        });

        page.add(this._ancToggleButtonWidget);

        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
        this._btnTchGroup = new Adw.PreferencesGroup({title: 'Button/Touch Settings'});
        page.add(this._btnTchGroup);

        this._leftBtnTchDropdown = new DropDownRowWidget({
            title: 'Left Bud',
            options: '',
            values: '',
            initialValue: 0,
        });

        this._leftBtnTchDropdown.visible = false;

        this._leftBtnTchDropdown.connect('notify::selected-item', () => {
            const val = this._leftBtnTchDropdown.selected_item;
            this._log.info(`Left Btn/Tch val : ${val}`);
        });

        this._btnTchGroup.add(this._leftBtnTchDropdown);

        this._rightBtnTchDropdown = new DropDownRowWidget({
            title: 'Right Bud',
            options: '',
            values: '',
            initialValue: 0,
        });

        this._rightBtnTchDropdown.visible = false;

        this._rightBtnTchDropdown.connect('notify::selected-item', () => {
            const val = this._rightBtnTchDropdown.selected_item;
            this._log.info(`Right Btn/Tch val : ${val}`);
        });

        this._btnTchGroup.add(this._rightBtnTchDropdown);



        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
        this._moreGroup = new Adw.PreferencesGroup({title: 'More Settings'});
        page.add(this._moreGroup);
        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

        this._voiceNotificationsSwitch = new Adw.SwitchRow({
            title: 'Voice Notification',
            subtitle: 'Enable voice notification',
            visible: false,
        });

        this._voiceNotificationsSwitch.connect('notify::active', () => {
            this._log.info(`Voice Notification : ${this._voiceNotificationsSwitch.active}`);
        });

        this._moreGroup.add(this._voiceNotificationsSwitch);

        this._voiceNotificationsVolume = new SliderRowWidget({
            rowTitle: 'Voice Notification Volume',
            rowSubtitle: '',
            marks: [
                {mark: -2, label: '-2'},
                {mark: -1, label: '-1'},
                {mark: 0, label: '0'},
                {mark: 1, label: '+1'},
                {mark: 2, label: '+2'},
            ],
            initialValue: 50,
            range: [-2, 2, 1],
            snapOnStep: true,
        });

        this._voiceNotificationsVolume.connect('notify::value', () => {
            this._log.info(`Voice Notification Volume : ${this._voiceNotificationsVolume.value}`);
        });

        this._moreGroup.add(this._voiceNotificationsVolume);

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

        this._autoPowerOffSwitch = new Adw.SwitchRow({
            title: 'Automatically Power Off',
            subtitle: 'Automatically power off when not worn.',
            visible: false,
        });

        this._autoPowerOffSwitch.connect('notify::active', () => {
            this._log.info(`Automatically Power Off : ${this._autoPowerOffSwitch.active}`);
        });

        this._moreGroup.add(this._autoPowerOffSwitch);

        this._autoPowerOffLabels = [
            'After 5 minutes',
            'After 30 minutes',
            'After 1 hour',
            'After 3 hours',
        ];

        this._autoPowerOffValues = [
            AutoPowerOffTime.AFTER_5_MIN,
            AutoPowerOffTime.AFTER_30_MIN,
            AutoPowerOffTime.AFTER_1_HOUR,
            AutoPowerOffTime.AFTER_3_HOUR,
            AutoPowerOffTime.AFTER_15_MIN,
        ];

        this._autoPowerOffDropdown = new DropDownRowWidget({
            title: 'Auto Power Off',
            options: this._autoPowerOffLabels,
            values: this._autoPowerOffValues,
            initialValue: AutoPowerOffTime.AFTER_30_MIN,
        });

        this._autoPowerOffDropdown.visible = false;

        this._autoPowerOffDropdown.connect('notify::selected-item', () => {
            const selectedVal = this._autoPowerOffDropdown.selected_item;
            this._log.info(`Auto Power Off changed (id): ${selectedVal}`);
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

            if (!uuids) {
                this._log.info('Incorrect MAC address or Device not paired');
                return;
            }

            if (!uuids.includes(SonyUUIDv2)) {
                this._log.info('Invalid Sony Device: Not Protocol V2 device');
                return;
            }

            const connected = this._bluezDeviceProxy.Connected;
            this._deviceConnected = connected;
            this._log.info(
                `Device connection status: ${connected}`);

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

            this._log.info(`Device connection changed. status: ${connected}`);

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

        const timeout = globalThis.TESTDEVICE ? 1 : 8;
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, timeout, () => {
            this._page.sensitive = true;
            return GLib.SOURCE_REMOVE;
        });

        const uiObjects = {
            codecIndicator: this._codecIndicator,
            dseeIndicator: this._dseeIndicator,

            bat1: this._battery1,
            bat2: this._battery2,
            bat3: this._battery3,

            ancGroup: this._ancGroup,
            ancToggle: this._ancToggle,
            ambientLevelSlider: this._ambientLevel,
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
            updateMenuSensitivityCallBack: this._updateMenuSensitivity.bind(this),

            ancToggleButtonWidget: this._ancToggleButtonWidget,

            leftBtnTchDropdown: this._leftBtnTchDropdown,
            rightBtnTchDropdown: this._rightBtnTchDropdown,

            moreGroup: this._moreGroup,
            voiceNotificationSwitch: this._voiceNotificationsSwitch,
            voiceNotificationsVolume: this._voiceNotificationsVolume,
            eqPresetDd: this._eqPresetDropdown,
            eqCustomRow: this._equalizerCustomRow,
            dseeRow: this._upscalingSwitchRow,
            pauseWhenTakeOffSwitch: this._pauseWhenTakenOff,
            autoPowerOffSwitch: this._autoPowerOffSwitch,
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

