'use strict';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

import {createLogger} from './logger.js';
import {getBluezDeviceProxy} from './bluezDeviceProxy.js';
import {SonySocketV2} from './sonySocketV2.js';
import {
    AmbientSoundMode, AutoAsmSensitivity, ListeningMode, AudioCodec, DseeType, ButtonModes
} from './sonyConfig.js';

import {SonyConfiguration} from './sonyConfig.js';

export const SonyUUIDv2 = '956c7b26-d49a-4ba8-b03f-b17d393cb6e2';

export const SonyDevice = GObject.registerClass({
}, class SonyDevice extends GObject.Object {
    _init(devicePath, ui, profileManager) {
        super._init();
        this._ui = ui;
        this._log = createLogger('SonyDevice');
        this._log.info('SonyDevice init ');
        this._devicePath = devicePath;
        this._model = null;
        this._ambientLevel = 10;
        this._focusOnVoiceState = false;
        this._profileManager = profileManager;
        this._uiGuards = {
            ambientmode: false,
            s2cenable: false,
            s2cConfig: false,
            bgm: false,
            voiceNotifications: false,
            equalizer: false,
            audioSampling: false,
            pauseWhenTakenOff: false,
            automaticPowerOff: false,
        };

        this._ambientMode = AmbientSoundMode.ANC_OFF;
        this._focusOnVoiceState = false;
        this._ambientLevel = 10;
        this._naMode = true;
        this._naSensitivity = AutoAsmSensitivity.STANDARD;
        this._bgmProps = {active: false, distance: 0, mode: ListeningMode.STANDARD};

        this._callbacks = {
            updateCapabilities: this.updateCapabilities.bind(this),
            deviceInitialized: this.deviceInitialized.bind(this),
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateAmbientSoundControl: this.updateAmbientSoundControl.bind(this),
            updateAmbientSoundButton: this.updateAmbientSoundButton.bind(this),
            updateSpeakToChatEnable: this.updateSpeakToChatEnable.bind(this),
            updateSpeakToChatConfig: this.updateSpeakToChatConfig.bind(this),
            updateEqualizer: this.updateEqualizer.bind(this),
            updateBgmMode: this.updateBgmMode.bind(this),
            updateCinemaMode: this.updateCinemaMode.bind(this),
            updateVoiceNotifications: this.updateVoiceNotifications.bind(this),
            updateVoiceNotificationsVolume: this.updateVoiceNotificationsVolume.bind(this),
            updateAudioSampling: this.updateAudioSampling.bind(this),
            updatePauseWhenTakenOff: this.updatePauseWhenTakenOff.bind(this),
            updateAutomaticPowerOff: this.updateAutomaticPowerOff.bind(this),
            updateCodecIndicator: this.updateCodecIndicator.bind(this),
            updateUpscalingIndicator: this.updateUpscalingIndicator.bind(this),
            updateButtonModesLeftRight: this.updateButtonModesLeftRight.bind(this),
        };

        this._log.info('Branch: sony-v2');

        if (globalThis.TESTDEVICE)
            this._initializeModel(globalThis.TESTDEVICE);
        else
            this._initialize();
    }

    _initialize() {
        this._bluezDeviceProxy = getBluezDeviceProxy(this._devicePath);
        const name = this._bluezDeviceProxy.Name;
        this._log.info('');
        this._log.info(`Name: ${name}`);
        this._log.info('');
        if (!name) {
            this._bluezSignalId = this._bluezDeviceProxy.connect(
                'g-properties-changed', () => this._onBluezPropertiesChanged());
        } else {
            this._initializeModel(name);
        }
    }

    _onBluezPropertiesChanged() {
        const name = this._bluezDeviceProxy.Name;
        if (name) {
            this._log.info('');
            this._log.info(`Name: ${name}`);
            this._log.info('');
            this._initializeModel(name);
            if (this._bluezDeviceProxy && this._bluezSignalId)
                this._bluezDeviceProxy.disconnect(this._bluezSignalId);
            this._bluezSignalId = null;
            this._bluezDeviceProxy = null;
        }
    }

    _initializeModel(name) {
        const modelData = SonyConfiguration.find(model => model.pattern.test(name));

        if (!modelData) {
            this._log.info(`No matching modelData found for name: ${name}`);
            return;
        }

        this._log.info(`Found modelData "${name}": ${JSON.stringify(modelData, null, 2)}`);

        this._batteryDualSupported = modelData.batteryDual ?? false;
        this._batteryDual2Supported = modelData.batteryDual2 ?? false;
        this._batteryCaseSupported = modelData.batteryCase ?? false;
        this._batterySingleSupported = modelData.batterySingle ?? false;

        this._noNoiseCancellingSupported = modelData.noNoiseCancelling ?? false;
        this._ambientSoundControlSupported = modelData.ambientSoundControl ?? false;
        this._windNoiseReductionSupported = modelData.windNoiseReduction ?? false;
        this._ambientSoundControlNASupported = modelData.ambientSoundControlNA ?? false;

        this._speakToChatEnabledSupported = modelData.speakToChatEnabled ?? false;
        this._speakToChatConfigSupported = modelData.speakToChatConfig ?? false;
        this._speakToChatFocusOnVoiceSupported = modelData.speakToChatFocusOnVoice ?? false;

        this._listeningModeSupported = modelData.listeningMode ?? false;

        this._ambientSoundControlButtonMode = modelData.ambientSoundControlButtonMode ?? false;
        this._buttonModesLeftRight = modelData.buttonModesLeftRight ?? false;

        this._voiceNotificationsSupported = modelData.voiceNotifications ?? false;
        this._equalizerSixBandsSupported = modelData.equalizerSixBands ?? false;
        this._equalizerTenBandsSupported = modelData.equalizerTenBands ?? false;
        this._audioUpsamplingSupported = modelData.audioUpsampling ?? false;
        this._pauseWhenTakenOffSupported = modelData.pauseWhenTakenOff ?? false;
        this._automaticPowerOffWhenTakenOffSupported =
            modelData.automaticPowerOffWhenTakenOff ?? false;

        if (this._batteryDualSupported || this._batteryDual2Supported) {
            this._ui.bat1.setIcon(`bbm-${modelData.budsIcon}-left-symbolic`);
            this._ui.bat2.setIcon(`bbm-${modelData.budsIcon}-right-symbolic`);
            this._ui.bat2.visible = true;
        }

        if (this._batteryCaseSupported) {
            this._ui.bat3.setIcon(`bbm-${modelData.case}-symbolic`);
            this._ui.bat3.visible = true;
        }

        if (this._batterySingleSupported)
            this._ui.bat1.setIcon(`bbm-${modelData.budsIcon}-symbolic`);

        if (!this._noNoiseCancellingSupported &&
                this._ambientSoundControlSupported) {
            this._ui.ancGroup.visible = true;

            const btns = {
                btn1Name: 'Off', btn1Icon: 'bbm-anc-off-symbolic',
                btn2Name: 'On', btn2Icon: 'bbm-anc-on-symbolic',
                btn3Name: 'Ambient', btn3Icon: 'bbm-transperancy-symbolic',
            };
            if (this._windNoiseReductionSupported) {
                btns.btn4Name = 'Wind';
                btns.btn4Icon = 'bbm-adaptive-symbolic';
            }

            this._ui.autoAdaptiveNoiseSwitch.visible = this._ambientSoundControlNASupported;
            this._ui.autoAdaptiveNoiseSensitivityDd.visible = this._ambientSoundControlNASupported;

            this._ui.ancToggle.updateConfig(btns);
        }

        if (this._speakToChatEnabledSupported) {
            this._ui.s2cGroup.visible = true;
            const s2cTogglebtn = {
                btn1Name: 'Off', btn1Icon: 'bbm-ca-off-symbolic',
                btn2Name: 'On', btn2Icon: 'bbm-ca-on-symbolic',
            };
            this._ui.s2cToggle.updateConfig(s2cTogglebtn);
            if (this._speakToChatConfigSupported) {
                this._ui.s2cSensitivityDd.visible = true;
                this._ui.s2cDurationDd.visible = true;
            }
        }

        this._ui.bgmGroup.visible = this._listeningModeSupported;

        this._ui.ancToggleButtonWidget.visible = this._ambientSoundControlButtonMode;

        this._buttonModesLeftRight = modelData.buttonModesLeftRight ?? false;

        if (this._buttonModesLeftRight && this._buttonModesLeftRight.length > 0) {
            const buttonModeMap = {
                amb: ['Ambient Sound Control', ButtonModes.AMBIENT_SOUND_CONTROL],
                ambqa: ['Ambient Sound Control / Quick Access',
                    ButtonModes.AMBIENT_SOUND_CONTROL_QA],
                pb: ['Playback Control', ButtonModes.PLAYBACK_CONTROL],
                vol: ['Volume Control', ButtonModes.VOLUME_CONTROL],
                na: ['Not Assigned', ButtonModes.NO_FUNCTION],
            };

            const options = [];
            const values = [];

            for (const key of this._buttonModesLeftRight) {
                const entry = buttonModeMap[key];
                if (!entry)
                    continue;
                const [label, value] = entry;
                options.push(label);
                values.push(value);
            }

            this._ui.leftBtnTchDropdown.updateList(options, values);
            this._ui.rightBtnTchDropdown.updateList(options, values);
            this._ui.leftBtnTchDropdown.visible = true;
            this._ui.rightBtnTchDropdown.visible = true;
        }


        this._ui.moreGroup.visible = this._voiceNotificationsSupported ||
            this._equalizerSixBandsSupported || this._equalizerTenBandsSupported ||
            this._audioUpsamplingSupported || this._pauseWhenTakenOffSupported ||
            this._automaticPowerOffWhenTakenOffSupported;

        this._ui.voiceNotificationSwitch.visible = this._voiceNotificationsSupported;
        if (this._equalizerSixBandsSupported || this._equalizerTenBandsSupported) {
            this._ui.eqPresetDd.visible = true;
            this._ui.eqCustomRow.visible =  true;
            this._eq = this._ui.addCustomEqCallback(this._equalizerTenBandsSupported);
        }
        this._ui.dseeRow.visible = this._audioUpsamplingSupported;
        this._ui.pauseWhenTakeOffSwitch.visible = this._pauseWhenTakenOffSupported;
        this._ui.autoPowerOffSwitch.visible = this._automaticPowerOffWhenTakenOffSupported;
        this._ui.autoPowerOffDd.visible = this._ui.autoPowerOffSwitch.active &&
            this._automaticPowerOffWhenTakenOffSupported && this._automaticPowerOffByTime;

        this._ui.codecIndicator.set_pixel_size(30);
        this._ui.dseeIndicator.set_pixel_size(30);

        this._modelData = modelData;

        if (globalThis.TESTDEVICE)
            this._startSonySocket(-1);
        else
            this._initializeProfile();
    }

    _initializeProfile() {
        let fd;
        fd = this._profileManager.getFd(this._devicePath);
        if (fd === -1) {
            this._log.info('No fd: listen for new connections');
            this._profileSignalId = this._profileManager.connect(
                'new-connection', (_, path, newFd) => {
                    if (path !== this._devicePath)
                        return;
                    this._log.info(`New connection fd: ${newFd}`);
                    fd = newFd;
                    this._profileManager.disconnect(this._profileSignalId);
                    this._profileSignalId = null;
                    this._startSonySocket(fd);
                }
            );

            this._profileManager.registerProfile('sony', SonyUUIDv2);
        } else {
            this._log.info(`Found fd: ${fd}`);
            this._startSonySocket(fd);
        }
    }

    _startSonySocket(fd) {
        this._log.info(`Start Socket with fd: ${fd}`);
        this._sonySocket = new SonySocketV2(
            this._devicePath,
            fd,
            this._modelData,
            this._callbacks);
    }

    deviceInitialized() {
        this._ambientToggleMonitor();
        this._ambientLevelSliderMonitor();
        this._voiceFocusSwitchMonitor();
        this._autoAdaptiveNoiseSwitchMonitor();
        this._autoAdaptiveNoiseSensitivityDdMonitor();
        this._ambientToggleButtonWidgetMonitor();
        this._s2cToggleMonitor();
        this._s2cSensitivityDdMonitor();
        this._s2cDurationDdMonitor();
        this._bgmDistanceDdMonitor();
        this._bgmModeDdMonitor();
        this._voiceNotificationSwitchMonitor();
        this._voiceNotificationVolumeMonitor();
        this._eqPresetDdMonitor();
        this._eqCustomRowMonitor();
        this._dseeRowSwitchMonitor();
        this._autoPowerOffDdMonitor();
        this._autoPowerOffSwitchMonitor();
        this._pauseWhenTakeOffSwitchMonitor();
        this._buttonModesLeftRightMonitor();
    }

    updateCapabilities() {
        //dummy
    }

    updateBatteryProps(props) {
        this._props = {...this._props, ...props};
        const bat1level = props.battery1Level  ?? 0;
        const bat2level = props.battery2Level  ?? 0;
        const bat3level = props.battery3Level  ?? 0;

        if (bat1level <= 0 && bat2level <= 0 && bat3level <= 0)
            return;

        this._ui.bat1.setLabel(bat1level === 0 ? '---' : `${bat1level}%,  ${props.battery1Status}`);
        this._ui.bat2.setLabel(bat2level === 0 ? '---' : `${bat2level}%,  ${props.battery2Status}`);
        this._ui.bat3.setLabel(bat3level === 0 ? '---' : `${bat3level}%,  ${props.battery3Status}`);
    }

    updateAmbientSoundControl(mode, focusOnVoiceState, level, naMode, naSensitivity) {
        log(`AMB mode: ${mode},  focusOnVoiceState: ${focusOnVoiceState},  level: ${level},` +
                `naMode: ${naMode} naSensitivity: ${naSensitivity}`);
        this._uiGuards.ambientmode = true;

        this._ambientMode = mode;
        this._focusOnVoiceState = focusOnVoiceState;
        this._ambientLevel = level;
        this._naMode = naMode;
        this._naSensitivity = naSensitivity;

        if (mode === AmbientSoundMode.ANC_OFF)
            this._ui.ancToggle.toggled = 1;
        else if (mode === AmbientSoundMode.ANC_ON)
            this._ui.ancToggle.toggled = 2;
        else if (mode === AmbientSoundMode.AMBIENT)
            this._ui.ancToggle.toggled = 3;
        else if (this._windNoiseReductionSupported && mode === AmbientSoundMode.WIND)
            this._ui.ancToggle.toggled = 4;

        this._ui.voiceFocusSwitch.active = focusOnVoiceState;
        this._ui.ambientLevelSlider.value = level;

        if (this._ambientSoundControlNASupported) {
            this._ui.autoAdaptiveNoiseSwitch.active = naMode;
            this._ui.autoAdaptiveNoiseSensitivityDd.selected_item = naSensitivity;
        }
        this._uiGuards.ambientmode = false;
    }

    _ambientToggleMonitor() {
        this._ui.ancToggle.connect('notify::toggled', () => {
            if (this._uiGuards.ambientmode)
                return;
            const value = this._ui.ancToggle.toggled;
            let mode = AmbientSoundMode.ANC_OFF;
            if (value === 2)
                mode = AmbientSoundMode.ANC_ON;
            else if (value === 3)
                mode = AmbientSoundMode.AMBIENT;
            else if (value === 4)
                mode = AmbientSoundMode.WIND;

            this._ambientMode = mode;

            this._sonySocket.setAmbientSoundControl(this._ambientMode, this._focusOnVoiceState,
                this._ambientLevel, this._naMode, this._naSensitivity);
        });
    }

    _ambientLevelSliderMonitor() {
        this._ui.ambientLevelSlider.connect('notify::value', () => {
            if (this._uiGuards.ambientmode)
                return;
            const value = Math.round(this._ui.ambientLevelSlider.value);

            if (this._ambientLevel !== value) {
                this._ambientLevel = value;
                this._sonySocket.setAmbientSoundControl(this._ambientMode, this._focusOnVoiceState,
                    this._ambientLevel, this._naMode, this._naSensitivity);
            }
        });
    }

    _voiceFocusSwitchMonitor() {
        this._ui.voiceFocusSwitch.connect('notify::active', () => {
            if (this._uiGuards.ambientmode)
                return;
            this._focusOnVoiceState = this._ui.voiceFocusSwitch.active;
            this._sonySocket.setAmbientSoundControl(this._ambientMode, this._focusOnVoiceState,
                this._ambientLevel, this._naMode, this._naSensitivity);
        });
    }

    _autoAdaptiveNoiseSwitchMonitor() {
        this._ui.autoAdaptiveNoiseSwitch.connect('notify::active', () => {
            if (this._uiGuards.ambientmode)
                return;
            this._naMode = this._ui.autoAdaptiveNoiseSwitch.active;
            this._sonySocket.setAmbientSoundControl(this._ambientMode, this._focusOnVoiceState,
                this._ambientLevel, this._naMode, this._naSensitivity);
        });
    }

    _autoAdaptiveNoiseSensitivityDdMonitor() {
        this._ui.autoAdaptiveNoiseSensitivityDd.connect('notify::selected-item', () => {
            if (this._uiGuards.ambientmode)
                return;
            this._naSensitivity = this._ui.autoAdaptiveNoiseSensitivityDd.selected_item;
            this._sonySocket.setAmbientSoundControl(this._ambientMode, this._focusOnVoiceState,
                this._ambientLevel, this._naMode, this._naSensitivity);
        });
    }

    updateSpeakToChatEnable(enabled) {
        this._uiGuards.s2cenable = true;
        this._ui.s2cToggle.toggled = enabled ? 2 : 1;
        this._uiGuards.s2cenable = false;
    }

    _s2cToggleMonitor() {
        this._ui.s2cToggle.connect('notify::toggled', () => {
            if (this._uiGuards.s2cenable)
                return;
            const enabled = this._ui.s2cToggle.toggled === 2;
            this._sonySocket.setSpeakToChatEnabled(enabled);
        });
    }

    updateSpeakToChatConfig(speak2ChatSensitivity, speak2ChatTimeout) {
        this._uiGuards.s2cConfig = true;
        this._ui.s2cSensitivityDd.selected_item = speak2ChatSensitivity;
        this._ui.s2cDurationDd.selected_item = speak2ChatTimeout;
        this._uiGuards.s2cConfig = false;
    }

    _s2cSensitivityDdMonitor() {
        this._ui.s2cSensitivityDd.connect('notify::selected-item', () => {
            if (this._uiGuards.s2cConfig)
                return;
            const speak2ChatSensitivity = this._ui.s2cSensitivityDd.selected_item;
            const speak2ChatTimeout = this._ui.s2cDurationDd.selected_item;
            this._sonySocket.setSpeakToChatConfig(speak2ChatSensitivity,
                speak2ChatTimeout);
        });
    }

    _s2cDurationDdMonitor() {
        this._ui.s2cDurationDd.connect('notify::selected-item', () => {
            if (this._uiGuards.s2cConfig)
                return;
            const speak2ChatSensitivity = this._ui.s2cSensitivityDd.selected_item;
            const speak2ChatTimeout = this._ui.s2cDurationDd.selected_item;
            this._sonySocket.setSpeakToChatConfig(speak2ChatSensitivity,
                speak2ChatTimeout);
        });
    }

    updateBgmMode(enable, distance) {
        this._uiGuards.bgm = true;
        if (enable)
            this._ui.bgmModeDd.selected_item = ListeningMode.BGM;
        else
            this._ui.bgmModeDd.selected_item = ListeningMode.STANDARD;

        this._ui.bgmDistanceDd.selected_item = distance;
        this._ui.updateMenuSensitivityCallBack();
        this._uiGuards.bgm = false;
    }

    updateCinemaMode(enable) {
        this._uiGuards.bgm = true;
        if (enable)
            this._ui.bgmModeDd.selected_item = ListeningMode.CINEMA;
        this._uiGuards.bgm = false;
    }

    _bgmModeDdMonitor() {
        this._ui.bgmModeDd.connect('notify::selected-item', () => {
            if (this._uiGuards.bgm)
                return;
            this._ui.updateMenuSensitivityCallBack();
            const mode = this._ui.bgmModeDd.selected_item;
            const distance = this._ui.bgmDistanceDd.selected_item;
            this._sonySocket.setListeningMode(mode, distance);
        });
    }

    _bgmDistanceDdMonitor() {
        this._ui.bgmDistanceDd.connect('notify::selected-item', () => {
            if (this._uiGuards.bgm)
                return;
            this._ui.updateMenuSensitivityCallBack();
            const mode = this._ui.bgmModeDd.selected_item;
            const distance = this._ui.bgmDistanceDd.selected_item;
            this._sonySocket.setListeningMode(mode, distance);
        });
    }

    updateAmbientSoundButton(value) {
        log(`AmbientSoundButton value: ${value}`);
        this._uiGuards.ambientButton = true;
        this._ui.ancToggleButtonWidget.toggled_value = value;
        this._uiGuards.ambientButton = false;
    }

    _ambientToggleButtonWidgetMonitor() {
        if (this._uiGuards.ambientButton)
            return;
        this._ui.ancToggleButtonWidget.connect('notify::toggled-value', () => {
            const value = this._ui.ancToggleButtonWidget.toggled_value;
            this._sonySocket.setAmbientSoundButton(value);
        });
    }

    updateButtonModesLeftRight(leftMode, rightMode) {
        log(`AmbientSoundButton leftMode: ${leftMode}, rightMode: ${rightMode}`);
        this._uiGuards.buttonModesLR = true;
        this._ui.leftBtnTchDropdown.selected_item = leftMode;
        this._ui.rightBtnTchDropdown.selected_item = rightMode;
        this._uiGuards.buttonModesLR = false;
    }

    _buttonModesLeftRightMonitor() {
        if (this._uiGuards.buttonModesLR)
            return;
        this._ui.leftBtnTchDropdown.connect('notify::selected-item', () => {
            const leftMode = this._ui.leftBtnTchDropdown.selected_item;
            const rightMode = this._ui.rightBtnTchDropdown.selected_item;
            this._sonySocket.setButtonModesLeftRight(leftMode, rightMode);
        });
        this._ui.rightBtnTchDropdown.connect('notify::selected-item', () => {
            const leftMode = this._ui.leftBtnTchDropdown.selected_item;
            const rightMode = this._ui.rightBtnTchDropdown.selected_item;
            this._sonySocket.setButtonModesLeftRight(leftMode, rightMode);
        });
    }

    updateVoiceNotifications(enabled) {
        log(`VoiceNotifications enabled: ${enabled}`);
        this._uiGuards.voiceNotifications = true;
        this._ui.voiceNotificationSwitch.active = enabled;
        this._uiGuards.voiceNotifications = false;
    }

    _voiceNotificationSwitchMonitor() {
        this._ui.voiceNotificationSwitch.connect('notify::active', () => {
            if (this._uiGuards.voiceNotifications)
                return;
            const enabled = this._ui.voiceNotificationSwitch.active;
            this._sonySocket.setVoiceNotifications(enabled);
        });
    }

    // /
    updateVoiceNotificationsVolume(vol) {
        log(`VoiceNotifications vol: ${vol}`);
        this._uiGuards.voiceNotificationsVol = true;
        this._ui.voiceNotificationsVolume.value = vol;
        this._uiGuards.voiceNotificationsVol = false;
    }

    _voiceNotificationVolumeMonitor() {
        this._ui.voiceNotificationsVolume.connect('notify::value', () => {
            if (this._uiGuards.voiceNotificationsVol)
                return;
            const vol = this._ui.voiceNotificationsVolume.value;
            this._sonySocket.setVoiceNotificationsVolume(vol);
        });
    }
    // //

    updateEqualizer(presetCode, customBands) {
        log(`updateEqualizer presetCode: ${presetCode}, customBands: ${customBands}`);
        this._uiGuards.equalizer = true;
        this._ui.eqPresetDd.selected_item = presetCode;
        this._ui.updateEqCustomRowVisibility();
        this._eq.setValues(customBands);
        this._uiGuards.equalizer = false;
    }

    _eqPresetDdMonitor() {
        this._ui.eqPresetDd.connect('notify::selected-item', () => {
            if (this._uiGuards.equalizer)
                return;
            const presetCode = this._ui.eqPresetDd.selected_item;
            const customBand = this._eq.values;
            this._scheduleEqUpdate(presetCode, customBand);
        });
    }

    _eqCustomRowMonitor() {
        if (this._uiGuards.equalizer)
            return;
        this._eq.connect('eq-changed', (_w, arr) => {
            if (this._uiGuards.equalizer)
                return;
            const presetCode = this._ui.eqPresetDd.selected_item;
            const customBand = arr;
            this._scheduleEqUpdate(presetCode, customBand);
        });
    }

    _scheduleEqUpdate(presetCode, customBand) {
        this._eqPending = {presetCode, customBand};

        if (this._eqTimeoutId)
            return;

        this._eqTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            if (this._eqPending) {
                const p = this._eqPending;
                this._sonySocket.setEqualizer(p.presetCode, p.customBand);
                this._eqPending = null;
                return GLib.SOURCE_CONTINUE;
            }

            this._eqTimeoutId = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    updateAudioSampling(enabled) {
        this._uiGuards.audioSampling = true;
        this._ui.dseeRow.active = enabled;
        this._dseeEnabled = enabled;
        this._uiGuards.audioSampling = false;
        this._updateUpscalingIndicatorVisibility();
    }

    _dseeRowSwitchMonitor() {
        this._ui.dseeRow.connect('notify::active', () => {
            if (this._uiGuards.audioSampling)
                return;
            const enabled = this._ui.dseeRow.active;
            this._dseeEnabled = enabled;
            this._sonySocket.setAudioUpsampling(enabled);
            this._updateUpscalingIndicatorVisibility();
        });
    }

    updatePauseWhenTakenOff(enabled) {
        this._uiGuards.pauseWhenTakenOff = true;
        this._ui.pauseWhenTakeOffSwitch.active = enabled;
        this._uiGuards.pauseWhenTakenOff = false;
    }

    _pauseWhenTakeOffSwitchMonitor() {
        this._ui.pauseWhenTakeOffSwitch.connect('notify::active', () => {
            if (this._uiGuards.pauseWhenTakenOff)
                return;
            const enabled = this._ui.pauseWhenTakeOffSwitch.active;
            this._sonySocket.setPauseWhenTakenOff(enabled);
        });
    }

    updateAutomaticPowerOff(enabled, mode) {
        this._uiGuards.automaticPowerOff = true;
        this._ui.autoPowerOffSwitch.active = enabled;
        this._ui.autoPowerOffDd.selected_item = mode;
        this._uiGuards.automaticPowerOff = false;
    }

    _autoPowerOffDdMonitor() {
        this._ui.autoPowerOffDd.connect('notify::selected-item', () => {
            if (this._uiGuards.automaticPowerOff)
                return;
            const enabled = this._ui.autoPowerOffSwitch.active;
            const mode = this._ui.autoPowerOffDd.selected_item;
            this._sonySocket.setAutomaticPowerOff(enabled, mode);
        });
    }

    _autoPowerOffSwitchMonitor() {
        this._ui.autoPowerOffSwitch.connect('notify::active', () => {
            if (this._uiGuards.automaticPowerOff)
                return;
            const enabled = this._ui.autoPowerOffSwitch.active;
            const mode = this._ui.autoPowerOffDd.selected_item;
            this._ui.autoPowerOffDd.visible = enabled && this._automaticPowerOffByTime;
            this._sonySocket.setAutomaticPowerOff(enabled, mode);
        });
    }

    updateCodecIndicator(code) {
        if (code === AudioCodec.SBC)
            this._ui.codecIndicator.icon_name = 'bbm-sbc-symbolic';
        else if (code === AudioCodec.AAC)
            this._ui.codecIndicator.icon_name = 'bbm-aac-symbolic';
        else if (code === AudioCodec.LDAC)
            this._ui.codecIndicator.icon_name = 'bbm-ldac-symbolic';
        else if (code === AudioCodec.APT_X)
            this._ui.codecIndicator.icon_name = 'bbm-aptx-symbolic';
        else if (code === AudioCodec.APT_X_HD)
            this._ui.codecIndicator.icon_name = 'bbm-aptxhd-symbolic';
        else if (code === AudioCodec.LC3)
            this._ui.codecIndicator.icon_name = 'bbm-lc3-symbolic';

        const visible = code !== AudioCodec.UNSETTLED && code !== AudioCodec.OTHER;
        this._ui.codecIndicator.visible = visible;
    }

    updateUpscalingIndicator(mode, show) {
        if (mode === DseeType.DSEE_ULTIMATE)
            this._ui.dseeIndicator.icon_name = 'bbm-dsee-ex-symbolic';
        if (mode === DseeType.DSEE_HX_AI)
            this._ui.dseeIndicator.icon_name = 'bbm-dsee-ex-symbolic';
        if (mode === DseeType.DSEE_HX)
            this._ui.dseeIndicator.icon_name = 'bbm-dsee-hx-symbolic';
        if (mode === DseeType.DSEE)
            this._ui.dseeIndicator.icon_name = 'bbm-dsee-symbolic';

        this._dseeIndicatorEnabled = show;
        this._updateUpscalingIndicatorVisibility();
    }

    _updateUpscalingIndicatorVisibility() {
        this._ui.dseeIndicator.visible = this._dseeIndicatorEnabled && this._dseeEnabled;
    }

    destroy() {
        if (this._bluezDeviceProxy && this._bluezSignalId)
            this._bluezDeviceProxy.disconnect(this._bluezSignalId);
        this._bluezSignalId = null;
        this._bluezDeviceProxy = null;
        this._sonySocket?.destroy();
        this._sonySocket = null;
        this.dataHandler = null;
    }
});
