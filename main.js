import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {createLogger} from './logger.js';
import {getBluezDeviceProxy} from './bluezDeviceProxy.js';
import {SonyDevice} from './sonyDevice.js';
import {ProfileManager} from './profileManager.js';
import {setLiveLogSink, hideMacAdddress} from './logger.js';

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

        this.application.connect('activate', this._onActivate.bind(this));
        this._devicePath = devicePath;
        this._deviceStarted = false;
        this._deviceConnected = false;
        this._dataHandler = null;
        this._battL = '--';
        this._battR = '--';
        this._battC = '--';
        this._battStatusL = '--';
        this._battStatusR = '--';
        this._battStatusC = '--';
        this._leftBudsStatus =  '--';
        this._rightBudsStatus =  '--';
        this._attenuationStatus = '--';
        this._mediaStatus = '--';
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

        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
        const batteryGroup = new Adw.PreferencesGroup({title: 'Battery Information'});

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

        this._battery1 = new Gtk.Button({sensitive: false});
        this._battery2 = new Gtk.Button({sensitive: false});
        this._battery3 = new Gtk.Button({sensitive: false});

        batteryBox1.append(this._battery1);
        batteryBox1.append(this._battery2);
        batteryBox1.append(this._battery3);

        this._battRow.child = batteryBox1;
        batteryGroup.add(this._battRow);

        page.add(batteryGroup);
        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

        const inEarGroup = new Adw.PreferencesGroup({title: 'Status'});

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

        this._inEarRowL = new Gtk.Button({sensitive: false});
        this._inEarRowR = new Gtk.Button({sensitive: false});
        this._inPausePlay = new Gtk.Button({sensitive: false});
        this._attStatus = new Gtk.Button({sensitive: false});

        inEarBox.append(this._inEarRowL);
        inEarBox.append(this._inEarRowR);
        inEarBox.append(this._inPausePlay);
        inEarBox.append(this._attStatus);

        this._inEarRow.child = inEarBox;
        inEarGroup.add(this._inEarRow);

        page.add(inEarGroup);
        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

        this._ancGroup = new Adw.PreferencesGroup({title: 'Noise Cancellation'});
        const ancRow = new Adw.ActionRow({activatable: false});

        const toggleBox1 = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            homogeneous: true,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 12,
            margin_end: 12,
        });

        this._ancOffButton = new Gtk.Button({label: 'Off'});
        this._ancOffButton.connect('clicked', () => {
            this._sonyDevice?.set1ButtonClicked(1);
        });

        this._ancOnButton = new Gtk.Button({label: 'ANC'});
        this._ancOnButton.connect('clicked', () => {
            this._sonyDevice?.set1ButtonClicked(2);
        });

        this._ambientButton = new Gtk.Button({label: 'Ambient'});
        this._ambientButton.connect('clicked', () => {
            this._sonyDevice?.set1ButtonClicked(3);
        });

        this._windButton = new Gtk.Button({label: 'Wind'});
        this._windButton.connect('clicked', () => {
            this._sonyDevice?.set1ButtonClicked(4);
        });

        toggleBox1.append(this._ancOffButton);
        toggleBox1.append(this._ancOnButton);
        toggleBox1.append(this._ambientButton);
        toggleBox1.append(this._windButton);

        ancRow.child = toggleBox1;
        this._ancGroup.add(ancRow);
        page.add(this._ancGroup);

        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

        this._awarenessGroup = new Adw.PreferencesGroup({title: 'Speak to Chat'});
        const awarenessrow = new Adw.ActionRow({activatable: false});

        const toggleBox2 = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            homogeneous: true,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 12,
            margin_end: 12,
        });

        this._speak2chatOnButton = new Gtk.ToggleButton({label: 'Speak to Chat On'});
        this._speak2chatOnButton.connect('clicked', () => {
            this._sonyDevice?.set2ButtonClicked(1);
        });

        this._speak2chatOffButton = new Gtk.ToggleButton({label: 'Speak to Chat Off'});
        this._speak2chatOffButton.connect('clicked', () => {
            this._sonyDevice?.set2ButtonClicked(2);
        });

        toggleBox2.append(this._speak2chatOnButton);
        toggleBox2.append(this._speak2chatOffButton);

        awarenessrow.child = toggleBox2;
        this._awarenessGroup.add(awarenessrow);
        page.add(this._awarenessGroup);

        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

        vbox.append(page);

        const scrolled = new Gtk.ScrolledWindow({
            vexpand: true,
        });

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

        this._ancGroup.visible = false;
        this._ancOffButton.visible = false;
        this._ancOnButton.visible = false;
        this._ambientButton.visible = false;
        this._windButton.visible = false;
        this._awarenessGroup.visible = false;

        this._updateGuiData();
        this._initialize();
    }

    _initialize() {
        this._bluezDeviceProxy = getBluezDeviceProxy(this._devicePath);
        const connected = this._bluezDeviceProxy.Connected;
        this._deviceConnected = connected;
        this._log.info(
            `Device connection status: ${connected} Path: ${hideMacAdddress(this._devicePath)}`);
        if (!connected) {
            this._log.info('Device not connected. Waiting for device');
            this._bluezSignalId = this._bluezDeviceProxy.connect(
                'g-properties-changed', () => this._onBluezPropertiesChanged());
        } else {
            this._startDevice();
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
            }
        }
    }

    _startDevice() {
        if (this._deviceStarted)
            return;
        this._deviceStarted = true;
        this._log.info('Start Device');
        this._profileManager = new ProfileManager();
        this._sonyDevice = new SonyDevice(
            this._devicePath, this.updateDeviceMapCb.bind(this), this._profileManager);
    }

    updateDeviceMapCb(path, dataHandler) {
        if (this._dataHandler)
            return;
        this._dataHandler = dataHandler;
        this._ancGroup.visible = !this._sonyDevice._noNoiseCancellingSupported;
        this._ancOffButton.visible = !this._sonyDevice._noNoiseCancellingSupported;
        this._ancOnButton.visible = !this._sonyDevice._noNoiseCancellingSupported;
        this._ambientButton.visible = this._sonyDevice._ambientSoundControlSupported ||
                                      this._sonyDevice._ambientSoundControl2Supported;
        this._windButton.visible = this._sonyDevice._windNoiseReductionSupported;
        this._awarenessGroup.visible = this._sonyDevice._speakToChatEnabledSupported;

        this._dataHandler.connect('properties-changed', () => {
            this._props = this._dataHandler.getProps();
            this._battL = this._props.battery1Level;
            this._battR = this._props.battery2Level;
            this._battC = this._props.battery3Level;

            this._battStatusL = this._props.battery1Status;
            this._battStatusR = this._props.battery2Status;
            this._battStatusC = this._props.battery3Status;
            this._leftBudsStatus = this._props.tmpInEarLeft;
            this._rightBudsStatus = this._props.tmpInEarRight;
            this._attenuationStatus = this._props.tmpAwarnessAtt;
            this._mediaStatus = this._props.tmpPlayPauseStatus;

            this._updateGuiData();

            const ctx1 = [
                this._ancOffButton,
                this._ancOnButton,
                this._ambientButton,
                this._windButton,
            ];
            ctx1.forEach(btn => btn.get_style_context().remove_class('accent'));

            const index1 = {1: 0, 2: 1, 3: 2, 4: 3}[this._props.toggle1State];
            if (index1 !== undefined)
                ctx1[index1].get_style_context().add_class('accent');

            const ctx2 = [
                this._speak2chatOnButton,
                this._speak2chatOffButton,
            ];
            ctx2.forEach(btn => btn.get_style_context().remove_class('accent'));

            const index2 = {1: 0, 2: 1}[this._props.toggle2State];
            if (index2 !== undefined)
                ctx2[index2].get_style_context().add_class('accent');
        });
    }

    _updateGuiData() {
        this._battery1.label = `Battery1: ${this._battL}, ${this._battStatusL}`;
        this._battery2.label = `Battery2: ${this._battR}, ${this._battStatusR}`;
        this._battery3.label = `Battery3: ${this._battC}, ${this._battStatusC}`;
        this._inEarRowL.label = `InEar Bud1 : ${this._leftBudsStatus}`;
        this._inEarRowR.label = `InEar Bud2 : ${this._rightBudsStatus}`;
        this._inPausePlay.label = `Media Trigger : ${this._mediaStatus}`;
        this._attStatus.label = `Attenuation Triggered : ${this._attenuationStatus}`;
    }
}

new BatteryApp().run([]);

