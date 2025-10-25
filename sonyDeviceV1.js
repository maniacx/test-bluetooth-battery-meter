'use strict';
import GObject from 'gi://GObject';

import {createLogger} from './logger.js';
import {getBluezDeviceProxy} from './bluezDeviceProxy.js';
import {SonySocket} from './sonySocketV1.js';
import {AmbientSoundMode} from './sonyDefsV1.js';
import {SonyConfiguration} from './sonyConfig.js';

export const SonyUUIDv1 = '96cc203e-5068-46ad-b32d-e316f5e069ba';

export const SonyUUIDv2 = '956c7b26-d49a-4ba8-b03f-b17d393cb6e2';

export const SonyDevice = GObject.registerClass({
}, class SonyDevice extends GObject.Object {
    _init(devicePath, ui, profileManager) {
        super._init();
        this._ui = ui;
        this._log = createLogger('SonyDevice');
        this._log.info('SonyDevice init ');
        this._devicePath = devicePath;
        this._usesProtocolV2 = false;
        this._model = null;
        this._ambientLevel = 10;
        this._focusOnVoiceState = false;
        this._profileManager = profileManager;
        this._battInfoRecieved = false;
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

        this._callbacks = {
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateAmbientSoundControl: this.updateAmbientSoundControl.bind(this),
            updateSpeakToChatEnable: this.updateSpeakToChatEnable.bind(this),
            updateSpeakToChatConfig: this.updateSpeakToChatConfig.bind(this),
            updateEqualizer: this.updateEqualizer.bind(this),
            updateVoiceNotifications: this.updateVoiceNotifications.bind(this),
            updateAudioSampling: this.updateAudioSampling.bind(this),
            updatePauseWhenTakenOff: this.updatePauseWhenTakenOff.bind(this),
            updateAutomaticPowerOff: this.updateAutomaticPowerOff.bind(this),
        };

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
        this._ambientSoundControl2Supported = modelData.ambientSoundControl2 ?? false;
        this._windNoiseReductionSupported = modelData.windNoiseReduction ?? false;
        this._ambientSoundControlNASupported = modelData.ambientSoundControlNA ?? false;

        this._speakToChatEnabledSupported = modelData.speakToChatEnabled ?? false;
        this._speakToChatConfigSupported = modelData.speakToChatConfig ?? false;
        this._speakToChatFocusOnVoiceSupported = modelData.speakToChatFocusOnVoice ?? false;

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
                (this._ambientSoundControlSupported || this._ambientSoundControl2Supported)) {
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


        this._ui.moreGroup.visible = this._voiceNotificationsSupported ||
            this._equalizerSixBandsSupported || this._equalizerTenBandsSupported ||
            this._audioUpsamplingSupported || this._pauseWhenTakenOffSupported ||
            this._automaticPowerOffWhenTakenOffSupported;

        this._ui.voiceNotificationSwitch.visible = this._voiceNotificationsSupported;
        if (this._equalizerSixBandsSupported) {
            this._ui.eqPresetDd.visible = true;
            this._ui.eqCustomRow.visible =  true;
            this._eq = this._ui.addCustomEqCallback(false);
        }
        this._ui.dseeRow.visible = this._audioUpsamplingSupported;
        this._ui.pauseWhenTakeOffSwitch.visible = this._pauseWhenTakenOffSupported;
        this._ui.autoPowerOffDd.visible = this._automaticPowerOffWhenTakenOffSupported;

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

            const uuid =  this._usesProtocolV2 ? SonyUUIDv2 : SonyUUIDv1;

            this._profileManager.registerProfile('sony', uuid);
        } else {
            this._log.info(`Found fd: ${fd}`);
            this._startSonySocket(fd);
        }
    }

    _startSonySocket(fd) {
        this._log.info(`Start Socket with fd: ${fd}`);
        this._sonySocket = new SonySocket(
            this._devicePath,
            fd,
            this._modelData,
            this._callbacks);
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

        if (!this._battInfoRecieved) {
            this._ancToggleMonitor();
            this._ambientLevelSliderMonitor();
            this._voiceFocusSwitchMonitor();
            this._s2cToggleMonitor();
            this._s2cSensitivityDdMonitor();
            this._s2cDurationDdMonitor();
            this._voiceNotificationSwitchMonitor();
            this._eqPresetDdMonitor();
            this._eqCustomRowMonitor();
            this._dseeRowSwitchMonitor();
            this._autoPowerOffDdMonitor();
            this._pauseWhenTakeOffSwitchMonitor();
        }

        this._battInfoRecieved = true;
    }

    updateAmbientSoundControl(mode, focusOnVoiceState, level) {
        this._uiGuards.ambientmode = true;

        this._ambientMode = mode;
        this._focusOnVoiceState = focusOnVoiceState;
        this._ambientLevel = level;

        if (mode === AmbientSoundMode.ANC_OFF)
            this._ui.ancToggle.toggled = 1;
        else if (mode === AmbientSoundMode.ANC_ON)
            this._ui.ancToggle.toggled = 2;
        else if (mode === AmbientSoundMode.AMBIENT)
            this._ui.ancToggle.toggled = 3;
        else if (this._windNoiseReductionSupported && mode === AmbientSoundMode.WIND)
            this._ui.ancToggle.toggled = 4;

        this._ui.voiceFocusSwitch.active = focusOnVoiceState;
        this._ui?.ambientLevelSlider?.set_value(level);

        this._uiGuards.ambientmode = false;
    }

    _ancToggleMonitor() {
        this._ui.ancToggle.connect('notify::toggled', () => {
            if (this._uiGuards.ambientmode)
                return;
            const val = this._ui.ancToggle.toggled;
            let mode = AmbientSoundMode.ANC_OFF;
            if (val === 2)
                mode = AmbientSoundMode.ANC_ON;
            else if (val === 3)
                mode = AmbientSoundMode.AMBIENT;
            else if (val === 4)
                mode = AmbientSoundMode.WIND;

            this._ambientMode = mode;

            this._sonySocket.setAmbientSoundControl(this._ambientMode, this._focusOnVoiceState,
                this._ambientLevel);
        });
    }

    _ambientLevelSliderMonitor() {
        this._ui.ambientLevelSlider.connect('value-changed', () => {
            if (this._uiGuards.ambientmode)
                return;
            const value = Math.round(this._ui.ambientLevelSlider.get_value());

            if (this._ambientLevel !== value) {
                this._ambientLevel = value;
                this._sonySocket.setAmbientSoundControl(this._ambientMode, this._focusOnVoiceState,
                    this._ambientLevel);
            }
        });
    }

    _voiceFocusSwitchMonitor() {
        this._ui.voiceFocusSwitch.connect('notify::active', () => {
            if (this._uiGuards.ambientmode)
                return;
            this._focusOnVoiceState = this._ui.voiceFocusSwitch.active;
            this._sonySocket.setAmbientSoundControl(this._ambientMode, this._focusOnVoiceState,
                this._ambientLevel);
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
        this._speak2ChatSensitivity = speak2ChatSensitivity;
        this._speak2ChatTimeout = speak2ChatTimeout;

        this._ui.s2cSensitivityDd.selected_item = speak2ChatSensitivity;
        this._ui.s2cDurationDd.selected_item = speak2ChatTimeout;
        this._uiGuards.s2cConfig = false;
    }

    _s2cSensitivityDdMonitor() {
        this._ui.s2cSensitivityDd.connect('notify::selected-item', () => {
            if (this._uiGuards.s2cConfig)
                return;
            const val = this._ui.s2cSensitivityDd.selected_item;
            this._speak2ChatSensitivity = val;
            this._sonySocket.setSpeakToChatEnabled(this._speak2ChatSensitivity,
                this._speak2ChatTimeout);
        });
    }

    _s2cDurationDdMonitor() {
        this._ui.s2cDurationDd.connect('notify::selected-item', () => {
            if (this._uiGuards.s2cConfig)
                return;
            const val = this._ui.s2cDurationDd.selected_item;
            this._speak2ChatTimeout = val;
            this._sonySocket.setSpeakToChatEnabled(this._speak2ChatSensitivity,
                this._speak2ChatTimeout);
        });
    }

    updateVoiceNotifications(enabled) {
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

    updateEqualizer(presetCode, customBands) {
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
            const val = this._ui.eqPresetDd.selected_item;
            this._sonySocket.setEqualizerPreset(val);
        });
    }

    _eqCustomRowMonitor() {
        if (this._uiGuards.equalizer)
            return;
        this._eq.connect('eq-changed', (_w, arr) => {
            if (this._uiGuards.equalizer)
                return;
            this._sonySocket.setEqualizerCustomBands(arr);
        });
    }

    updateAudioSampling(enabled) {
        this._uiGuards.audioSampling = true;
        this._ui.dseeRow.active = enabled;
        this._uiGuards.audioSampling = false;
    }

    _dseeRowSwitchMonitor() {
        this._ui.dseeRow.connect('notify::active', () => {
            if (this._uiGuards.audioSampling)
                return;
            const enabled = this._ui.dseeRow.active;
            this._sonySocket.setAudioUpsampling(enabled);
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

    updateAutomaticPowerOff(mode) {
        this._uiGuards.automaticPowerOff = true;
        this._ui.autoPowerOffDd.selected_item = mode;
        this._uiGuards.automaticPowerOff = false;
    }

    _autoPowerOffDdMonitor() {
        this._ui.autoPowerOffDd.connect('notify::selected-item', () => {
            if (this._uiGuards.automaticPowerOff)
                return;
            const val = this._ui.autoPowerOffDd.selected_item;
            this._sonySocket.setAutomaticPowerOff(val);
        });
    }

    destroy() {
        if (this._bluezDeviceProxy && this._bluezSignalId)
            this._bluezDeviceProxy.disconnect(this._bluezSignalId);
        this._bluezSignalId = null;
        this._bluezDeviceProxy = null;
        this._sonySocket?.destroy();
        this._sonySocket = null;
        this.dataHandler = null;
        this._battInfoRecieved = false;
    }
});
