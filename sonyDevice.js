'use strict';
import GObject from 'gi://GObject';

import {createLogger} from './logger.js';
import {getBluezDeviceProxy} from './bluezDeviceProxy.js';
import {SonySocket} from './sonySocket.js';
import {
    SonyConfiguration, AmbientSoundMode,
    AutoAsmSensitivity, ListeningMode
} from './sonyConfig.js';

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
        this._naMode = true;
        this._naSensitivity = AutoAsmSensitivity.STANDARD;
        this._bgmProps = {active: false, distance: 0, mode: ListeningMode.STANDARD};

        this._callbacks = {
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateAmbientSoundControl: this.updateAmbientSoundControl.bind(this),
            updateSpeakToChatEnable: this.updateSpeakToChatEnable.bind(this),
            updateSpeakToChatConfig: this.updateSpeakToChatConfig.bind(this),
            updateEqualizer: this.updateEqualizer.bind(this),
            updateListeningBgmMode: this.updateListeningBgmMode.bind(this),
            updateListeningNonBgmMode: this.updateListeningNonBgmMode.bind(this),
            updateVoiceNotifications: this.updateVoiceNotifications.bind(this),
            updateAudioSampling: this.updateAudioSampling.bind(this),
            updatePauseWhenTakenOff: this.updatePauseWhenTakenOff.bind(this),
            updateAutomaticPowerOff: this.updateAutomaticPowerOff.bind(this),
        };

        this._initialize();
    }

    _initialize() {
        this._bluezDeviceProxy = getBluezDeviceProxy(this._devicePath);
        const uuids = this._bluezDeviceProxy.UUIDs;
        this._log.info('');
        this._log.info(`UUIDs: ${uuids}`);
        this._log.info('');

        if (uuids.includes(SonyUUIDv1))
            this._log.info('Sony device is V1');
        else if (uuids.includes(SonyUUIDv2))
            this._log.info('Sony device is V2');
        else
            this._log.info('No valid UUIDs found');

        if (uuids.includes(SonyUUIDv2))
            this._usesProtocolV2 = true;

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

        this._listeningModeSupported = modelData.listeningMode ?? false;
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

            this._ui.autoAdaptiveNoiseSwitch.visible = this._ambientSoundControlNASupported;
            this._ui.autoAdaptiveNoiseSensitivityDd.visible =  this._ambientSoundControlNASupported;

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
        this._ui.autoPowerOffDd.visible = this._automaticPowerOffWhenTakenOffSupported;

        this._modelData = modelData;
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
            this._usesProtocolV2,
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
            this._autoAdaptiveNoiseSwitchMonitor();
            this._autoAdaptiveNoiseSensitivityDdMonitor();
            this._s2cToggleMonitor();
            this._s2cSensitivityDdMonitor();
            this._s2cDurationDdMonitor();
            this._bgmDistanceDdMonitor();
            this._bgmModeDdMonitor();
            this._voiceNotificationSwitchMonitor();
            this._eqPresetDdMonitor();
            this._eqCustomRowMonitor();
            this._dseeRowSwitchMonitor();
            this._autoPowerOffDdMonitor();
            this._pauseWhenTakeOffSwitchMonitor();
        }

        this._battInfoRecieved = true;
    }

    updateAmbientSoundControl(mode, focusOnVoiceState, level, naMode, naSensitivity) {
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
            this._ui.autoAmbientSoundSwitch.active = naMode;
            this._ui.autoAsmSensitivityDropdown.selected_item = naSensitivity;
        }
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
                this._ambientLevel, this._naMode, this._naSensitivity);
        });
    }

    _ambientLevelSliderMonitor() {
        this._ui.ambientLevelSlider.connect('notify::value-changed', () => {
            if (this._uiGuards.ambientmode)
                return;
            const value = Math.round(this._ui.ambientLevelSlider.get_value());

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

    updateSpeakToChatConfig(speak2ChatSensitivity, focusOnVoiceState, speak2ChatTimeout) {
        this._uiGuards.s2cConfig = true;
        this._speak2ChatSensitivity = speak2ChatSensitivity;
        this._s2cFocusOnVoiceState = focusOnVoiceState;
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

    updateListeningBgmMode(bgmProps) {
        this._uiGuards.bgm = true;
        if (bgmProps.active)
            this._ui.bgmModeDd.selected_item = ListeningMode.BGM;
        else
            this._ui.bgmModeDd.selected_item = bgmProps.mode;

        this._ui.bgmDistanceDd.selected_item = bgmProps.distance;
        this._bgmProps = bgmProps;
        this._uiGuards.bgm = false;
    }

    updateListeningNonBgmMode(bgmProps) {
        this._uiGuards.bgm = true;
        this._ui.bgmModeDd.selected_item = bgmProps.mode;
        this._ui.bgmDistanceDd.selected_item = bgmProps.distance;
        this._bgmProps = bgmProps;
        this._uiGuards.bgm = false;
    }

    _bgmModeDdMonitor() {
        this._ui.bgmModeDd.connect('notify::selected-item', () => {
            if (this._uiGuards.bgm)
                return;
            const val = this._ui.bgmModeDd.selected_item;
            this._bgmProps.mode = val;
            this._sonySocket.setListeningModeBgm(this._bgmProps.mode,
                this._bgmProps.distance);
        });
    }

    _bgmDistanceDdMonitor() {
        this._ui.bgmDistanceDd.connect('notify::selected-item', () => {
            if (this._uiGuards.bgm)
                return;
            const val = this._ui.bgmDistanceDd.selected_item;
            this._bgmProps.distance = val;
            this._sonySocket.setListeningModeBgm(this._bgmProps.mode,
                this._bgmProps.distance);
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
        this._uiGuards.audioSampling = true;
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
