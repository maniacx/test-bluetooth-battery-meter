'use strict';
import GObject from 'gi://GObject';

import {createLogger} from './logger.js';
import {getBluezDeviceProxy} from './bluezDeviceProxy.js';
import {createConfig, createProperties, DataHandler} from './dataHandler.js';
import {SonySocket} from './sonySocket.js';
import {SonyConfiguration, AmbientSoundMode} from './sonyConfig.js';

export const SonyUUIDv1 = '96cc203e-5068-46ad-b32d-e316f5e069ba';

export const SonyUUIDv2 = '956c7b26-d49a-4ba8-b03f-b17d393cb6e2';

export const SonyDevice = GObject.registerClass({
}, class SonyDevice extends GObject.Object {
    _init(devicePath, updateDeviceMapCb, profileManager) {
        super._init();
        this._log = createLogger('SonyDevice');
        this._log.info('SonyDevice init ');
        this._devicePath = devicePath;
        this._config = createConfig();
        this._props = createProperties();
        this._usesProtocolV2 = false;
        this._model = null;
        this._ambientLevel = 10;
        this._focusOnVoiceState = false;
        this.updateDeviceMapCb = updateDeviceMapCb;
        this._profileManager = profileManager;
        this._battInfoRecieved = false;

        this._callbacks = {
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateAmbientSoundControl: this.updateAmbientSoundControl.bind(this),
            updateSpeakToChatEnable: this.updateSpeakToChatEnable.bind(this),
            updateSpeakToChatConfig: this.updateSpeakToChatConfig.bind(this),
            updatePlaybackState: this.updatePlaybackState.bind(this),
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

        this._log.info(`Found modelData for name "${name}": ${JSON.stringify(modelData, null, 2)}`);

        this._batteryDualSupported = modelData.batteryDual ?? false;
        this._batteryDual2Supported = modelData.batteryDual2 ?? false;
        this._batteryCaseSupported = modelData.batteryCase ?? false;
        this._batterySingleSupported = modelData.batterySingle ?? false;

        this._noNoiseCancellingSupported = modelData.noNoiseCancelling ?? false;
        this._ambientSoundControlSupported = modelData.ambientSoundControl ?? false;
        this._ambientSoundControl2Supported = modelData.ambientSoundControl2 ?? false;
        this._windNoiseReductionSupported = modelData.windNoiseReduction ?? false;

        this._hasFocusOnVoice = modelData.hasFocusOnVoice ?? false;
        this._hasAmbientLevelControl = modelData.hasAmbientLevelControl ?? false; ;

        this._speakToChatEnabledSupported = modelData.speakToChatEnabled ?? false;
        this._speakToChatConfigSupported = modelData.speakToChatConfig ?? false;
        this._speakToChatFocusOnVoiceSupported = modelData.speakToChatFocusOnVoice ?? false;

        this._pauseWhenTakenOffSupported = modelData.pauseWhenTakenOff ?? false;

        if (this._batteryDualSupported || this._batteryDual2Supported) {
            this._config.battery1Icon = `${modelData.budsIcon}-left`;
            this._config.battery2Icon = `${modelData.budsIcon}-right`;
        }

        if (this._batteryCaseSupported)
            this._config.battery3Icon = `${modelData.case}`;

        if (this._batterySingleSupported)
            this._config.battery1Icon = modelData.budsIcon;

        if (!this._noNoiseCancellingSupported &&
                (this._ambientSoundControlSupported || this._ambientSoundControlSupported2)) {
            this._config.set1Button1Icon = 'bbm-anc-off-symbolic.svg';
            this._config.set1Button2Icon = 'bbm-anc-on-symbolic.svg';
            this._config.set1Button3Icon = 'bbm-transperancy-symbolic.svg';
            if (this._windNoiseReductionSupported)
                this._config.set1Button4Icon = 'bbm-wind-symbolic.svg';
        }

        if (this._speakToChatEnabledSupported) {
            this._config.set2Button1Icon = 'bbm-ca-on-symbolic.svg';
            this._config.set2Button2Icon = 'bbm-ca-off-symbolic.svg';
        }

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

    _startConfiguration(battInfo) {
        const bat1level = battInfo.battery1Level  ?? 0;
        const bat2level = battInfo.battery2Level  ?? 0;
        const bat3level = battInfo.battery3Level  ?? 0;

        if (bat1level <= 0 && bat2level <= 0 && bat3level <= 0)
            return;

        this._battInfoRecieved = true;

        this.dataHandler = new DataHandler(this._config, this._props,
            this.set1ButtonClicked.bind(this), this.set2ButtonClicked.bind(this));

        this.updateDeviceMapCb(this._devicePath, this.dataHandler);
    }

    updateBatteryProps(props) {
        this._props = {...this._props, ...props};
        if (!this._battInfoRecieved)
            this._startConfiguration(props);

        this.dataHandler?.setProps(this._props);
    }

    updateAmbientSoundControl(mode, focusOnVoiceState, level) {
        this._log.info(`updateAmbientSoundControl : M: [${mode}]` +
            ` F:[${focusOnVoiceState}] L:[${level}]`);
        if (this._noNoiseCancellingSupported)
            return;

        this._ambientMode = mode;

        if (this._ambientSoundControlSupported && mode === AmbientSoundMode.ANC_OFF)
            this._props.toggle1State = 1;
        else if (this._ambientSoundControlSupported && mode === AmbientSoundMode.ANC_ON)
            this._props.toggle1State = 2;
        else if (this._ambientSoundControlSupported && mode === AmbientSoundMode.AMBIENT)
            this._props.toggle1State = 3;
        else if (this._ambientSoundControlSupported & this._windNoiseReductionSupported &&
            mode === AmbientSoundMode.WIND)
            this._props.toggle1State = 4;

        this._log.info(`updateAmbientSoundControl toggle1State = [${this._props.toggle1State}]`);

        this._focusOnVoiceState = focusOnVoiceState;
        this._props.tmpFocusOnVoice = focusOnVoiceState;
        this._ambientLevel = level;
        this._props.tmpAmbientLevel = level;

        this.dataHandler?.setProps(this._props);
    }

    updateSpeakToChatEnable(enabled) {
        this._props.toggle2State = enabled ? 1 : 2;
        this.dataHandler?.setProps(this._props);
    }

    updateSpeakToChatConfig(speak2ChatSensitivity, focusOnVoiceState, speak2ChatTimeout) {
        this._speak2ChatSensitivity = speak2ChatSensitivity;
        this._focusOnVoiceState = focusOnVoiceState;
        this._speak2ChatTimeout = speak2ChatTimeout;

        this._props.tmpFocusOnVoice = focusOnVoiceState;
        this.dataHandler?.setProps(this._props);
    }

    updatePlaybackState(state) {
        this._props.tmpPlayPauseStatus = state;
        this.dataHandler?.setProps(this._props);
    }

    set1ButtonClicked(index) {
        if (this._noNoiseCancellingSupported)
            return;

        if (index === 1)
            this._ambientMode = AmbientSoundMode.ANC_OFF;
        else if (index === 2)
            this._ambientMode = AmbientSoundMode.ANC_ON;
        else if (index === 3)
            this._ambientMode = AmbientSoundMode.AMBIENT;
        else if (index === 4)
            this._ambientMode = AmbientSoundMode.WIND;


        this._sonySocket.setAmbientSoundControl(this._ambientMode,
            this._focusOnVoiceState,  this._ambientLevel);
    }

    updateLevel(value) {
        this._ambientLevel = value;
        this._sonySocket.setAmbientSoundControl(this._ambientMode,
            this._focusOnVoiceState,  this._ambientLevel);
    }

    updateSwitch(state) {
        this._focusOnVoiceState = state;
        this._sonySocket.setAmbientSoundControl(this._ambientMode,
            this._focusOnVoiceState,  this._ambientLevel);
    }

    set2ButtonClicked(index) {
        if (this._noNoiseCancellingSupported)
            return;

        if (index === 1)
            this._sonySocket.setSpeakToChatEnabled(true);
        else if (index === 2)
            this._sonySocket.setSpeakToChatEnabled(false);
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
