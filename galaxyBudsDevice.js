'use strict';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import {createLogger} from './logger.js';
import {getBluezDeviceProxy} from './bluezDeviceProxy.js';
import {GalaxyBudsSocket} from './galaxyBudsSocket.js';
import {checkForSamsungBuds} from './galaxyBudsDetector.js';
import {GalaxyBudsModelList, BudsUUID, BudsLegacyUUID} from './galaxyBudsConfig.js';

export const GalaxyBudsDevice = GObject.registerClass({
}, class GalaxyBudsDevice extends GObject.Object {
    _init(devicePath, uiObjects, profileManager) {
        super._init();
        this._log = createLogger('GalaxyBudsDevice');
        this._log.info('GalaxyBudsDevice init ');
        this._devicePath = devicePath;
        this._ui = uiObjects;
        this._profileManager = profileManager;
        this._battInfoRecieved = false;
        this._uiGuards = {};

        this._callbacks = {
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateInEarState: this.updateInEarState.bind(this),

            updateAmbientSoundOnOff: this.updateAmbientSoundOnOff.bind(this),
            updateFocusOnVoice: this.updateFocusOnVoice.bind(this),
            updateAmbientVolume: this.updateAmbientVolume.bind(this),
            updateNCOnOff: this.updateNCOnOff.bind(this),
            updateNCModes: this.updateNCModes.bind(this),

        };

        if (globalThis.TESTDEVICE) {
            this._uuids = [BudsUUID];
            this._initializeModel('v0075pA223d0143', globalThis.TESTDEVICE);
        } else {
            this._initialize();
        }
    }

    _initialize() {
        this._bluezDeviceProxy = getBluezDeviceProxy(this._devicePath);
        this._uuids = this._bluezDeviceProxy.UUIDs;
        const modalias = this._bluezDeviceProxy.Modalias;
        const name = this._bluezDeviceProxy.Name;
        this._log.info('');
        this._log.info(`UUIDs: ${this._uuids}`);
        this._log.info('');
        this._log.info(`Modalias: ${modalias}`);
        this._log.info('');
        this._log.info(`Name: ${name}`);
        this._log.info('');
        if (!name || !modalias) {
            this._bluezSignalId = this._bluezDeviceProxy.connect(
                'g-properties-changed', () => this._onBluezPropertiesChanged());
        } else {
            this._initializeModel(modalias, name);
        }
    }

    _onBluezPropertiesChanged() {
        const name = this._bluezDeviceProxy.Name;
        const modalias = this._bluezDeviceProxy.Modalias;
        if (name && modalias) {
            this._log.info('');
            this._log.info(`Modalias: ${modalias}`);
            this._log.info('');
            this._log.info(`Name: ${name}`);
            this._log.info('');
            this._initializeModel(modalias, name);
            if (this._bluezDeviceProxy && this._bluezSignalId)
                this._bluezDeviceProxy.disconnect(this._bluezSignalId);
            this._bluezSignalId = null;
            this._bluezDeviceProxy = null;
        }
    }

    _initializeModel(modalias, name) {
        if (this._uuids.includes(BudsUUID)) {
            this._log.info('this._deviceType = galaxybuds');
            this._deviceType = 'galaxybuds';
        } else if (this._uuids.includes(BudsLegacyUUID)) {
            this._log.info('this._deviceType = galaxybudslegacy');
            this._deviceType = 'galaxybudslegacy';
        } else {
            this._log.info('No valid UUID found');
            return;
        }

        const modelId = checkForSamsungBuds(this._uuids, modalias, name);
        if (!modelId) {
            this._log.info('No valid modelId found');
            return;
        }
        this._log.info(`got model id: ${modelId}`);


        this._uuids = null;
        const modelData = GalaxyBudsModelList.find(m => m.modelId === modelId);

        if (!modelData) {
            this._log.info(`No matching modelData found for name: ${name}`);
            return;
        }

        this._log.info(`Found modelData for name "${name}": ${JSON.stringify(modelData, null, 2)}`);
        this._modelData = modelData;

        this._ui.bat1.setIcon(`bbm-${modelData.budsIcon}-left-symbolic`);
        this._ui.bat2.setIcon(`bbm-${modelData.budsIcon}-right-symbolic`);
        this._ui.bat2.visible = true;

        if (modelData.battery.status.c !== null) {
            this._ui.bat3.setIcon(`bbm-${modelData.case}-symbolic`);
            this._ui.bat3.visible = true;
        }

        if (this._modelData.ambientSoundOnOff) {
            const btns = {
                btn1Name: 'Off', btn1Icon: 'bbm-anc-off-symbolic',
                btn2Name: 'Ambient', btn2Icon: 'bbm-transperancy-symbolic',
            };
            this._ui.ancToggle.updateConfig(btns);
        } else if (this._modelData.noiseCancellationOnOff) {
            const btns = {
                btn1Name: 'Off', btn1Icon: 'bbm-anc-off-symbolic',
                btn2Name: 'On', btn2Icon: 'bbm-anc-on-symbolic',
            };
            this._ui.ancToggle.updateConfig(btns);
        } else if (this._modelData.noiseControl) {
            const btns = {
                btn1Name: 'Off', btn1Icon: 'bbm-anc-off-symbolic',
                btn2Name: 'On', btn2Icon: 'bbm-anc-on-symbolic',
                btn3Name: 'Ambient', btn3Icon: 'bbm-transperancy-symbolic',
            };
            this._ui.ancToggle.updateConfig(btns);
        }

        this._ui.voiceFocusSwitch.visible = this._modelData.ambientVoiceFocus ?? false;
        this._ui.ambientLevelSlider.visible = this._modelData.ambientSoundVolume ?? false;
        if (this._modelData.ambientSoundVolume) {
            const adjustment = new Gtk.Adjustment({
                value: 0,
                lower: 0,
                upper: this._modelData.ambientSoundVolume.max,
                step_increment: 1,
                page_increment: 10,
                page_size: 0,
            });

            this._ui.ambientLevelSlider._slider.set_adjustment(adjustment);
            this._ui.ambientLevelSlider.visible = true;
        }

        if (globalThis.TESTDEVICE)
            this._startGalaxyBudsSocket(-1);
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
                    this._startGalaxyBudsSocket(fd);
                }
            );

            const uuid =  this._deviceType === 'galaxybudslegacy' ? BudsLegacyUUID : BudsUUID;

            this._profileManager.registerProfile(this._deviceType, uuid);
        } else {
            this._log.info(`Found fd: ${fd}`);
            this._startGalaxyBudsSocket(fd);
        }
    }

    _startGalaxyBudsSocket(fd) {
        this._log.info(`Start Socket with fd: ${fd}`);
        this._galaxyBudsSocket = new GalaxyBudsSocket(
            this._devicePath,
            fd,
            this._modelData,
            this._callbacks);
    }

    _deviceInitialized() {
        this._ambientToggleMonitor();
        this._ambientLevelSliderMonitor();
        this._voiceFocusSwitchMonitor();
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
            this._battInfoRecieved = true;
            this._deviceInitialized();
        }
    }

    updateInEarState(left, right) {
        this._ui.inEarL.setLabel(left);
        this._ui.inEarR.setLabel(right);
    }

    updateAmbientSoundOnOff(enabled) {
        this._uiGuards.ambientmode = true;
        this._ui.ancToggle.toggled =  enabled ? 2 : 1;
        this._uiGuards.ambientmode = false;
    }

    updateNCOnOff(enabled) {
        this._uiGuards.ambientmode = true;
        this._ui.ancToggle.toggled =  enabled ? 2 : 1;
        this._uiGuards.ambientmode = false;
    }

    updateNCModes(mode) {
        this._uiGuards.ambientmode = true;
        this._ui.ancToggle.toggled = mode + 1;
        this._uiGuards.ambientmode = false;
    }

    _ambientToggleMonitor() {
        this._ui.ancToggle.connect('notify::toggled', () => {
            if (this._uiGuards.ambientmode)
                return;

            const val = this._ui.ancToggle.toggled;
            if (val === 0)
                return;

            if (this._modelData.ambientSoundOnOff) {
                const enabled = val === 2;
                this._galaxyBudsSocket.setAmbientSoundOnOff(enabled);
            } else if (this._modelData.noiseCancellationOnOff) {
                const enabled = val === 2;
                this._galaxyBudsSocket.setNCOnOff(enabled);
            } else if (this._modelData.noiseControl) {
                const mode = val - 1;
                this._galaxyBudsSocket.setNCModes(mode);
            }
        });
    }

    updateFocusOnVoice(enabled) {
        this._uiGuards.fov = true;
        this._ui.voiceFocusSwitch.active = enabled;
        this._uiGuards.fov = false;
    }

    _voiceFocusSwitchMonitor() {
        this._ui.voiceFocusSwitch.connect('notify::active', () => {
            if (this._uiGuards.fov)
                return;

            this._galaxyBudsSocket.setFocusOnVoice(this._ui.voiceFocusSwitch.active);
        });
    }

    updateAmbientVolume(level) {
        this._uiGuards.ambientlevel = true;
        this._ui.ambientLevelSlider.value = level;
        this._uiGuards.ambientlevel = false;
    }

    _ambientLevelSliderMonitor() {
        this._ui.ambientLevelSlider.connect('notify::value', () => {
            if (this._uiGuards.ambientlevel)
                return;

            const value = Math.round(this._ui.ambientLevelSlider.value);
            if (this._ambientLevel !== value) {
                this._ambientLevel = value;
                this._galaxyBudsSocket.setAmbientVolume(value);
            }
        });
    }

    destroy() {
        if (this._bluezDeviceProxy && this._bluezSignalId)
            this._bluezDeviceProxy.disconnect(this._bluezSignalId);
        this._bluezSignalId = null;
        this._bluezDeviceProxy = null;
        this._galaxyBudsSocket?.destroy();
        this._galaxyBudsSocket = null;
        this.dataHandler = null;
        this._battInfoRecieved = false;
    }
});
