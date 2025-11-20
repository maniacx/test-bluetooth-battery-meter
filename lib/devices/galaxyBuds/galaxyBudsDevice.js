'use strict';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import {createLogger} from '../logger.js';
import {getBluezDeviceProxy} from '../../bluezDeviceProxy.js';
import {GalaxyBudsSocket} from './galaxyBudsSocket.js';
import {checkForSamsungBuds} from './galaxyBudsDetector.js';
import {GalaxyBudsModelList, BudsUUID, BudsLegacyUUID, GalaxyBudsAnc} from './galaxyBudsConfig.js';

import {validateProperties} from '../deviceUtils.js';

const SamsungMepSppUUID = 'f8620674-a1ed-41ab-a8b9-de9ad655729d';

export function isGalaxyBuds(bluezDeviceProxy) {
    const bluezProps = [];
    let supported = 'no';

    const UUIDs = bluezDeviceProxy.UUIDs || [];
    if (!UUIDs.includes(SamsungMepSppUUID))
        return {supported, bluezProps};

    const name = bluezDeviceProxy.Name;
    if (checkForSamsungBuds(UUIDs, name))
        supported = 'yes';

    return {supported, bluezProps};
}

export const GalaxyBudsDevice = GObject.registerClass({
}, class GalaxyBudsDevice extends GObject.Object {
    _init(settings, devicePath, alias, uiObjects, profileManager) {
        super._init();
        this._settings = settings;
        this._devicePath = devicePath;
        this._alias = alias;
        this._profileManager = profileManager;
        this._battInfoRecieved = false;

        // script only
        this._log = createLogger('GalaxyBudsDevice');
        this._log.info('GalaxyBudsDevice init ');
        this._ui = uiObjects;
        // end script only

        this._initialize();
    }

    _initialize() {
        let name;
        let uuids;
        if (globalThis.TESTDEVICE) {
            uuids = globalThis.TESTDEVICE === 'Galaxy Buds' ? [BudsLegacyUUID] : [BudsUUID];
            name = globalThis.TESTDEVICE;
        } else {
            const bluezDeviceProxy = getBluezDeviceProxy(this._devicePath);
            uuids = bluezDeviceProxy.UUIDs;
            name = bluezDeviceProxy.Name;
        }

        // script only
        this._log.info('');
        this._log.info(`UUIDs: ${this._uuids}`);
        this._log.info('');
        this._log.info(`Name: ${name}`);
        this._log.info('');
        // end script only

        this._modelId = checkForSamsungBuds(uuids, name);
        if (!this._modelId) {
            this._log.info('No valid modelId found');
            return;
        }
        this._log.info(`Model id: ${this._modelId}`);

        const modelData = GalaxyBudsModelList.find(m => m.modelId === this._modelId);

        if (!modelData) {
            this._log.info(`No matching modelData found for name: ${name}`);
            return;
        }

        this._log.info(`Found modelData for name "${name}": ${JSON.stringify(modelData, null, 2)}`);

        this._features = modelData.features;
        this._touchOptions = modelData.touchOptions;

        // script only
        this._uiGuards = {};
        this._touchProps = {};
        this._touchAndHoldProps = {};
        this._ncCycleProps = {
            off: false,
            ambient: false,
            anc: false,
            adaptive: false,
            leftOff: false,
            leftAmbient: false,
            leftAnc: false,
            leftAdaptive: false,
        };
        this._initialValuesRightCheckBox = 0;
        this._initialValuesLeftCheckBox = 0;
        this._customAmbientWidgets = {};
        this._customAmbientProps = {};
        // end script only

        this._callbacks = {
            updateExtendedStatusStarted: this.updateExtendedStatusStarted.bind(this),
            updateExtendedStatusEnded: this.updateExtendedStatusEnded.bind(this),
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateInEarState: this.updateInEarState.bind(this),

            updateAmbientSoundOnOff: this.updateAmbientSoundOnOff.bind(this),
            updateFocusOnVoice: this.updateFocusOnVoice.bind(this),
            updateAmbientVolume: this.updateAmbientVolume.bind(this),
            updateNCOnOff: this.updateNCOnOff.bind(this),
            updateNCModes: this.updateNCModes.bind(this),

            updateEqPresets: this.updateEqPresets.bind(this),
            updateTouchpadLock: this.updateTouchpadLock.bind(this),
            updateTouchpadOptionL: this.updateTouchpadOptionL.bind(this),
            updateTouchpadOptionR: this.updateTouchpadOptionR.bind(this),
            updateAdvanceTouchpadLock: this.updateAdvanceTouchpadLock.bind(this),
            updateSideToneEnabled: this.updateSideToneEnabled.bind(this),
            updateStereoBal: this.updateStereoBal.bind(this),
            updateNoiseReductionLevel: this.updateNoiseReductionLevel.bind(this),
            updateNoiseControlCycle: this.updateNoiseControlCycle.bind(this),
            updateDetectConversations: this.updateDetectConversations.bind(this),
            updateDetectConversationsDuration: this.updateDetectConversationsDuration.bind(this),
            updateNoiseControlsWithOneEarbud: this.updateNoiseControlsWithOneEarbud.bind(this),
            updateOutsideDoubleTap: this.updateOutsideDoubleTap.bind(this),
            updateLightingMode: this.updateLightingMode.bind(this),
            updateAmbientCustomization: this.updateAmbientCustomization.bind(this),
        };

        this._createDefaultSettings();

        const devicesList = this._settings.get_strv('galaxy-buds-list').map(JSON.parse);

        if (devicesList.length === 0 ||
                !devicesList.some(device => device.path === this._devicePath)) {
            this._addPropsToSettings(devicesList);
        } else {
            validateProperties(this._settings, 'galaxy-buds-list', devicesList,
                this._defaultsDeviceSettings, this._devicePath);
        }

        this._updateInitialValues();
        this._monitorListGsettings(true);

        this._configureBattery(modelData);
        this._configureANCBattery();
        this._configureDetectConversations();

        if (globalThis.TESTDEVICE)
            this._startGalaxyBudsSocket(-1, modelData);
        else
            this._initializeProfile(modelData);
    }

    _createDefaultSettings() {
        this._defaultsDeviceSettings = {
            path: this._devicePath,
            modelId: this._modelId,
            alias: this._alias,
            //  icon: this._config.commonIcon, extension only

            ...this._features.detectConversations && {
                's2c-time': 0,
            },

            'eq-preset': 0,

            ...this._features.stereoPan && {
                'stereo-bal': 0,
            },

            'tp-enabled': false,

            ...this._features.advancedTouchLock && {
                'tp-adv-single': false,
                'tp-adv-double': false,
                'tp-adv-triple': false,
                'tp-adv-hold': false,
            },

            ...this._features.advancedTouchIsPinch && {
                'tp-adv-swipe': false,
            },

            ...this._features.advancedTouchLockForCalls && {
                'tp-adv-call-double': false,
                'tp-adv-call-hold': false,
            },

            ...this._features.lightingControl && {
                'tp-lighting': 0,
            },

            'th-left': 0,
            'th-right': 0,

            ...this._features.ncCycle && {
                'nc-off': false,
                'nc-ambient': false,
                'nc-anc': false,
                ...this._features.adaptiveNoiseControl && {
                    'nc-adaptive': false,
                },

                ...this._features.noiseControlModeDualSide && {
                    'nc-left-off': false,
                    'nc-left-ambient': false,
                    'nc-left-anc': false,
                    ...this._features.adaptiveNoiseControl && {
                        'nc-left-adaptive': false,
                    },
                },
            },

            ...this._features.ambientSidetone && {
                'sidetone': false,
            },

            ...this._features.noiseControlsWithOneEarbud && {
                'nc-one': false,
            },

            ...this._features.doubleTapVolume && {
                '2tap-vol': false,
            },

            ...this._features.ambientCustomize && {
                'amb-enable': false,
                'amb-left': 0,
                'amb-right': 0,
                'amb-tone': 0,
            },
        };
    }

    _addPropsToSettings(devicesList) {
        devicesList.push(this._defaultsDeviceSettings);
        this._settings.set_strv('galaxy-buds-list', devicesList.map(JSON.stringify));
    }

    _updateInitialValues() {
        const devicesList = this._settings.get_strv('galaxy-buds-list').map(JSON.parse);
        const existingPathIndex = devicesList.findIndex(item => item.path === this._devicePath);
        if (existingPathIndex === -1)
            return;

        this._settingsItems = devicesList[existingPathIndex];

        if (this._features.detectConversations)
            this._s2cTime = this._settingsItems['s2c-time'];

        this._eqPreset = this._settingsItems['eq-preset'];

        if (this._features.stereoPan)
            this._stereoBal = this._settingsItems['stereo-bal'];

        this._touchEnabled = this._settingsItems['tp-enabled'];

        if (this._features.advancedTouchLock) {
            this._tpAdvLock = this._settingsItems['tp-adv-lock'];
            this._tpAdvSingle = this._settingsItems['tp-adv-single'];
            this._tpAdvDouble = this._settingsItems['tp-adv-double'];
            this._tpAdvTriple = this._settingsItems['tp-adv-triple'];
            this._tpAdvHold = this._settingsItems['tp-adv-hold'];
        }

        if (this._features.advancedTouchLockForCalls) {
            this._tpAdvCallDouble = this._settingsItems['tp-adv-call-double'];
            this._tpAdvCallHold = this._settingsItems['tp-adv-call-hold'];
        }

        if (this._features.lightingControl)
            this._tpLighting = this._settingsItems['tp-lighting'];

        this._thLeft = this._settingsItems['th-left'];
        this._thRight = this._settingsItems['th-right'];

        if (this._features.noiseControl) {
            this._ncCycleRight = this._settingsItems['nc-cycle-right'];

            if (this._features.noiseControlModeDualSide)
                this._ncCycleLeft = this._settingsItems['nc-cycle-left'];
        }

        if (this._features.ambientSidetone)
            this._sidetone = this._settingsItems['sidetone'];


        if (this._features.noiseControlsWithOneEarbud)
            this._ncOne = this._settingsItems['nc-one'];


        if (this._features.doubleTapVolume)
            this._twoTapVol = this._settingsItems['2tap-vol'];

        if (this._features.ambientCustomize) {
            this._ambEnable = this._settingsItems['amb-enable'];
            this._ambLeft = this._settingsItems['amb-left'];
            this._ambRight = this._settingsItems['amb-right'];
            this._ambTone = this._settingsItems['amb-tone'];
        }
    }

    _updateGsettingsProps() {
        const devicesList = this._settings.get_strv('galaxy-buds-list').map(JSON.parse);
        const existingPathIndex = devicesList.findIndex(item => item.path === this._devicePath);
        if (existingPathIndex === -1)
            return;

        this._settingsItems = devicesList[existingPathIndex];

        if (this._features.detectConversations) {
            const s2cTime = this._settingsItems['s2c-time'];
            if (this._s2cTime !== s2cTime) {
                this._s2cTime = s2cTime;
                this._setDetectConversationConfig();
            }
        }

        const eqPreset = this._settingsItems['eq-preset'];
        if (this._eqPreset !== eqPreset) {
            this._eqPreset = eqPreset;
            this._setEqPreset();
        }

        if (this._features.stereoPan) {
            const stereoBal = this._settingsItems['stereo-bal'];
            if (this._stereoBal !== stereoBal) {
                this._stereoBal = stereoBal;
                this._setStereoBalance();
            }
        }

        const tpLock = this._settingsItems['tp-enabled'];
        if (this._touchEnabled !== tpLock) {
            this._touchEnabled = tpLock;
            if (this._features.advancedTouchLock || this._features.advancedTouchIsPinch)
                this._setAdvancedTouchConfig();
            else
                this._setTouchpadLock();
        }

        if (this._features.advancedTouchLock) {
            const tpAdvSingle = this._settingsItems['tp-adv-single'];
            if (this._tpAdvSingle !== tpAdvSingle) {
                this._tpAdvSingle = tpAdvSingle;
                this._setAdvancedTouchConfig();
            }

            const tpAdvDouble = this._settingsItems['tp-adv-double'];
            if (this._tpAdvDouble !== tpAdvDouble) {
                this._tpAdvDouble = tpAdvDouble;
                this._setAdvancedTouchConfig();
            }

            const tpAdvTriple = this._settingsItems['tp-adv-triple'];
            if (this._tpAdvTriple !== tpAdvTriple) {
                this._tpAdvTriple = tpAdvTriple;
                this._setAdvancedTouchConfig();
            }

            const tpAdvHold = this._settingsItems['tp-adv-hold'];
            if (this._tpAdvHold !== tpAdvHold) {
                this._tpAdvHold = tpAdvHold;
                this._setAdvancedTouchConfig();
            }
        }

        if (this._features.advancedTouchLockForCalls) {
            const tpAdvCallDouble = this._settingsItems['tp-adv-call-double'];
            if (this._tpAdvCallDouble !== tpAdvCallDouble) {
                this._tpAdvCallDouble = tpAdvCallDouble;
                this._setAdvancedTouchConfig();
            }

            const tpAdvCallHold = this._settingsItems['tp-adv-call-hold'];
            if (this._tpAdvCallHold !== tpAdvCallHold) {
                this._tpAdvCallHold = tpAdvCallHold;
                this._setAdvancedTouchConfig();
            }
        }

        if (this._features.lightingControl) {
            const tpLighting = this._settingsItems['tp-lighting'];
            if (this._tpLighting !== tpLighting) {
                this._tpLighting = tpLighting;
                this._setAdvancedTouchConfig();
            }
        }

        const thLeft = this._settingsItems['th-left'];
        if (this._thLeft !== thLeft) {
            this._thLeft = thLeft;
            this._setTouchAndHold();
        }

        const thRight = this._settingsItems['th-right'];
        if (this._thRight !== thRight) {
            this._thRight = thRight;
            this._setTouchAndHold();
        }

        if (this._features.noiseControl) {
            const ncCycleRight = this._settingsItems['nc-cycle-right'];
            if (this._ncCycleRight !== ncCycleRight) {
                this._ncCycleRight = ncCycleRight;
                this._setNoiseControlConfig();
            }

            if (this._features.noiseControlModeDualSide) {
                const ncCycleLeft = this._settingsItems['nc-cycle-left'];
                if (this._ncCycleLeft !== ncCycleLeft) {
                    this._ncCycleLeft = ncCycleLeft;
                    this._setNoiseControlConfig();
                }
            }
        }

        if (this._features.ambientSidetone) {
            const sidetone = this._settingsItems['sidetone'];
            if (this._sidetone !== sidetone) {
                this._sidetone = sidetone;
                this._setAmbientSidetone();
            }
        }

        if (this._features.noiseControlsWithOneEarbud) {
            const ncOne = this._settingsItems['nc-one'];
            if (this._ncOne !== ncOne) {
                this._ncOne = ncOne;
                this._setNcOneEarbud();
            }
        }

        if (this._features.doubleTapVolume) {
            const twoTapVol = this._settingsItems['2tap-vol'];
            if (this._twoTapVol !== twoTapVol) {
                this._twoTapVol = twoTapVol;
                this._setDoubleTapVolume();
            }
        }

        if (this._features.ambientCustomize) {
            const ambEnable = this._settingsItems['amb-enable'];
            if (this._ambEnable !== ambEnable) {
                this._ambEnable = ambEnable;
                this._setAmbientCustomize();
            }

            const ambLeft = this._settingsItems['amb-left'];
            if (this._ambLeft !== ambLeft) {
                this._ambLeft = ambLeft;
                this._setAmbientCustomize();
            }

            const ambRight = this._settingsItems['amb-right'];
            if (this._ambRight !== ambRight) {
                this._ambRight = ambRight;
                this._setAmbientCustomize();
            }

            const ambTone = this._settingsItems['amb-tone'];
            if (this._ambTone !== ambTone) {
                this._ambTone = ambTone;
                this._setAmbientCustomize();
            }
        }
    }

    _monitorListGsettings(monitor) {
        if (monitor) {
            //            this._settings?.connectObject('changed::galaxy-buds-list', () =>
            if (this._connectid)
                return;
            this._connectid = this._settings.connect('changed::galaxy-buds-list', () =>
                this._updateGsettingsProps());
        } else {
            this._settings.disconnect(this._connectid);
            this._connectid = null;
        }
    }

    _updateGsettings() {
        this._monitorListGsettings(false);

        const currentList = this._settings.get_strv('galaxy-buds-list').map(JSON.parse);
        const index = currentList.findIndex(d => d.path === this._devicePath);

        if (index !== -1) {
            currentList[index] = this._settingsItems;
            this._settings.set_strv('galaxy-buds-list', currentList.map(JSON.stringify));
        }

        this._monitorListGsettings(true);
    }


    _configureBattery(modelData) {
        // Battery
        this._ui.bat1.setIcon(`bbm-${modelData.budsIcon}-left-symbolic`);
        this._ui.bat2.setIcon(`bbm-${modelData.budsIcon}-right-symbolic`);
        this._ui.bat2.visible = true;

        if (this._features.caseBattery) {
            this._ui.bat3.setIcon(`bbm-${modelData.case}-symbolic`);
            this._ui.bat3.visible = true;
        }
    }

    _configureANCBattery() {
        this._ui.ancGroup.visible = this._features.noiseControl || this._features.ambientSound ||
                this._features.noiseCancellation;


        if (this._features.noiseControl) {
            const btns = {
                btn1Name: 'Off', btn1Icon: 'bbm-anc-off-symbolic',
                btn2Name: 'On', btn2Icon: 'bbm-anc-on-symbolic',

            };
            if (this._features.ambientSound)
                Object.assign(btns, {btn3Name: 'Ambient', btn3Icon: 'bbm-transperancy-symbolic'});

            if (this._features.adaptiveNoiseControl)
                Object.assign(btns, {btn4Name: 'Adaptive', btn4Icon: 'bbm-adaptive-symbolic'});

            this._ui.ancToggle.updateConfig(btns);
        } else if (this._features.ambientSound) {
            const btns = {
                btn1Name: 'Off', btn1Icon: 'bbm-anc-off-symbolic',
                btn2Name: 'Ambient', btn2Icon: 'bbm-transperancy-symbolic',
            };
            this._ui.ancToggle.updateConfig(btns);
        } else if (this._features.noiseCancellation) {
            const btns = {
                btn1Name: 'Off', btn1Icon: 'bbm-anc-off-symbolic',
                btn2Name: 'On', btn2Icon: 'bbm-anc-on-symbolic',
            };
            this._ui.ancToggle.updateConfig(btns);
        }

        this._ui.voiceFocusSwitch.visible = this._features.ambientVoiceFocus ?? false;

        if (this._features.ambientSoundVolume && this._features.ambientVolumeMax) {
            const adjustment = new Gtk.Adjustment({
                value: 0,
                lower: 0,
                upper: this._features.ambientVolumeMax,
                step_increment: 1,
                page_increment: 1,
                page_size: 0,
            });

            this._ui.ambientLevelSlider._slider.set_adjustment(adjustment);
        }

        if (this._features.noiseReductionAdjustments && this._features.noiseReductionLevels) {
            const adjustment = new Gtk.Adjustment({
                value: 0,
                lower: 0,
                upper: this._features.noiseReductionLevels,
                step_increment: 1,
                page_increment: 1,
                page_size: 0,
            });

            this._ui.noiseCancellationLevelSlider._slider.set_adjustment(adjustment);
        }
    }

    _configureDetectConversations() {
        if (this._features.detectConversations) {
            const s2cTogglebtn = {
                btn1Name: 'Off', btn1Icon: 'bbm-ca-off-symbolic',
                btn2Name: 'On', btn2Icon: 'bbm-ca-on-symbolic',
            };
            this._ui.s2cToggle.updateConfig(s2cTogglebtn);
        }
    }

    _startConfigureWindow() {
        const cW = this._ui.configureWindow;
        const page = this._ui.page;
        this._configureWindow = new cW(this._settings, this._devicePath, page);
    }

    _initializeProfile(modelData) {
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
                    this._startGalaxyBudsSocket(fd, modelData);
                }
            );

            const uuid =  this._deviceType === 'galaxybudslegacy' ? BudsLegacyUUID : BudsUUID;

            this._profileManager.registerProfile(this._deviceType, uuid);
        } else {
            this._log.info(`Found fd: ${fd}`);
            this._startGalaxyBudsSocket(fd, modelData);
        }
    }

    _startGalaxyBudsSocket(fd, modelData) {
        this._log.info(`Start Socket with fd: ${fd}`);
        this._galaxyBudsSocket = new GalaxyBudsSocket(
            this._devicePath,
            fd,
            modelData,
            this._callbacks);
    }

    updateExtendedStatusStarted() {
        this._monitorListGsettings(false);
    }

    updateExtendedStatusEnded() {
        this._monitorListGsettings(true);
        this._updateGsettings();
    }

    _deviceInitialized() {
        this._ambientToggleMonitor();
        this._ambientLevelSliderMonitor();
        this._noiseCancellationLevelSliderMonitor();
        this._voiceFocusSwitchMonitor();
        this._s2cToggleMonitor();
    }

    // Script use only
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
            this._startConfigureWindow();
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
        this._ui.noiseCancellationLevelSlider.visible =
            this._features.noiseReductionAdjustments && mode === GalaxyBudsAnc.NoiseReduction;
        this._ui.ambientLevelSlider.visible =
            this._features.ambientSoundVolume && mode === GalaxyBudsAnc.AmbientSound;
        this._uiGuards.ambientmode = false;
    }

    _ambientToggleMonitor() {
        if (!this._features.noiseControl && !this._features.ambientSound &&
                !this._features.noiseCancellation)
            return;

        this._ui.ancToggle.connect('notify::toggled', () => {
            if (this._uiGuards.ambientmode)
                return;

            const val = this._ui.ancToggle.toggled;
            if (val === 0)
                return;

            if (this._features.noiseControl) {
                const mode = val - 1;

                this._ui.noiseCancellationLevelSlider.visible =
                    this._features.noiseReductionAdjustments &&
                    mode === GalaxyBudsAnc.NoiseReduction;

                this._ui.ambientLevelSlider.visible =
                    this._features.ambientSoundVolume && mode === GalaxyBudsAnc.AmbientSound;

                this._galaxyBudsSocket.setNCModes(mode);
            } else if (this._features.ambientSound) {
                const enabled = val === 2;
                this._ui.ambientLevelSlider.visible = this._features.ambientSoundVolume && enabled;
                this._galaxyBudsSocket.setAmbientSoundOnOff(enabled);
            } else if (this._features.noiseCancellation) {
                const enabled = val === 2;
                this._galaxyBudsSocket.setNCOnOff(enabled);
            }
        });
    }

    updateFocusOnVoice(enabled) {
        this._uiGuards.fov = true;
        this._ui.voiceFocusSwitch.active = enabled;
        this._uiGuards.fov = false;
    }

    _voiceFocusSwitchMonitor() {
        if (!this._features.ambientVoiceFocus)
            return;

        this._ui.voiceFocusSwitch.connect('notify::active', () => {
            if (this._uiGuards.fov)
                return;

            this._galaxyBudsSocket.setFocusOnVoice(this._ui.voiceFocusSwitch.active);
        });
    }

    updateAmbientVolume(level) {
        this._uiGuards.ambientlevel = true;
        this._ambientLevel = level;
        this._ui.ambientLevelSlider.value = level;
        this._uiGuards.ambientlevel = false;
    }

    _ambientLevelSliderMonitor() {
        if (!this._features.ambientSoundVolume || !this._features.ambientVolumeMax)
            return;

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

    updateNoiseReductionLevel(level) {
        this._uiGuards.noiseCancellationLevel = true;
        this._noiseCancellationLevel = level;
        this._ui.noiseCancellationLevelSlider.value = level;
        this._uiGuards.noiseCancellationLevel = false;
    }

    _noiseCancellationLevelSliderMonitor() {
        if (!this._features.noiseReductionAdjustments || !this._features.noiseReductionLevels)
            return;

        this._ui.noiseCancellationLevelSlider.connect('notify::value', () => {
            if (this._uiGuards.noiseCancellationLevel)
                return;

            const value = Math.round(this._ui.noiseCancellationLevelSlider.value);
            if (this._noiseCancellationLevel !== value) {
                this._noiseCancellationLevel = value;
                this._galaxyBudsSocket.setNoiseCancellationLevel(value);
            }
        });
    }

    updateDetectConversations(enabled) {
        this._uiGuards.s2cenable = true;
        this._ui.s2cToggle.toggled = enabled ? 2 : 1;
        this._uiGuards.s2cenable = false;
    }

    _s2cToggleMonitor() {
        if (!this._features.detectConversations)
            return;

        this._ui.s2cGroup.visible = true;
        this._ui.s2cToggle.visible = true;
        this._ui.s2cToggle.connect('notify::toggled', () => {
            if (this._uiGuards.s2cenable)
                return;
            const enabled = this._ui.s2cToggle.toggled === 2;
            this._galaxyBudsSocket.setDetectConversations(enabled);
        });
    }
    // End Script use only

    updateDetectConversationsDuration(duration) {
        if (!this._features.detectConversations)
            return;

        if (this._s2cTime !== duration) {
            this._s2cTime = duration;
            this._settingsItems['s2c-time'] = duration;
            this._updateGsettings();
        }
    }

    _setDetectConversationConfig() {
        if (!this._features.detectConversations)
            return;

        this._galaxyBudsSocket.setDetectConversationsDuration(this._s2cTime);
    }

    updateEqPresets(presetCode) {
        if (this._eqPreset !== presetCode) {
            this._eqPreset = presetCode;
            this._settingsItems['eq-preset'] = presetCode;
            this._updateGsettings();
        }
    }

    _setEqPreset() {
        this._galaxyBudsSocket.setEqPresets(this._eqPreset);
    }

    updateStereoBal(level) {
        if (!this._features.stereoPan)
            return;

        if (this._stereoBal !== level) {
            this._stereoBal = level;
            this._settingsItems['stereo-bal'] = level;
            this._updateGsettings();
        }
    }

    _setStereoBalance() {
        if (!this._features.stereoPan)
            return;

        this._galaxyBudsSocket.setStereoBalance(this._stereoBal);
    }

    updateTouchpadLock(lockEnabled) {
        const touchEnabled = !lockEnabled;
        if (this._touchEnabled !== touchEnabled) {
            this._touchEnabled = touchEnabled;
            this._settingsItems['tp-enabled'] = touchEnabled;
            this._updateGsettings();
        }
    }

    _setTouchpadLock() {
        const lockEnabled = !this._touchEnabled;
        this._galaxyBudsSocket.setTouchPadLock(lockEnabled);
    }

    updateAdvanceTouchpadLock(touchProps) {
        if (!this._features.advancedTouchLock && !this._features.advancedTouchIsPinch)
            return;

        let update = false;

        if (this._features.advancedTouchLock) {
            const touchEnabled = !touchProps.touchpadLock;
            const single = touchProps.singleTapOn;
            const dbl = touchProps.doubleTapOn;
            const triple = touchProps.tripleTapOn;
            const hold = touchProps.touchHoldOn;

            if (this._touchEnabled !== touchEnabled) {
                this._touchEnabled = touchEnabled;
                this._settingsItems['tp-enabled'] = touchEnabled;
                update = true;
            }

            if (this._tpAdvSingle !== single) {
                this._tpAdvSingle = single;
                this._settingsItems['tp-adv-single'] = single;
                update = true;
            }

            if (this._tpAdvDouble !== dbl) {
                this._tpAdvDouble = dbl;
                this._settingsItems['tp-adv-double'] = dbl;
                update = true;
            }

            if (this._tpAdvTriple !== triple) {
                this._tpAdvTriple = triple;
                this._settingsItems['tp-adv-triple'] = triple;
                update = true;
            }

            if (this._tpAdvHold !== hold) {
                this._tpAdvHold = hold;
                this._settingsItems['tp-adv-hold'] = hold;
                update = true;
            }
        } else {
            const single = touchProps.singleTapOn;
            const dbl = touchProps.doubleTapOn;
            const triple = touchProps.tripleTapOn;

            const mediaEnabled = single && dbl && triple;
            if (this._touchEnabled !== mediaEnabled) {
                this._touchEnabled = mediaEnabled;
                this._settingsItems['tp-enabled'] = mediaEnabled;
                update = true;
            }
        }

        if (this._features.advancedTouchLockForCalls) {
            const callDouble = touchProps.doubleTapForCallOn;
            const callHold = touchProps.touchHoldOnForCallOff;

            if (this._tpAdvCallDouble !== callDouble) {
                this._tpAdvCallDouble = callDouble;
                this._settingsItems['tp-adv-call-double'] = callDouble;
                update = true;
            }

            if (this._tpAdvCallHold !== callHold) {
                this._tpAdvCallHold = callHold;
                this._settingsItems['tp-adv-call-hold'] = callHold;
                update = true;
            }
        }

        if (this._features.lightingControl && touchProps.lightingMode) {
            const lighting = touchProps.lightingMode;

            if (this._tpLighting !== lighting) {
                this._tpLighting = lighting;
                this._settingsItems['tp-lighting'] = lighting;
                update = true;
            }
        }

        if (update)
            this._updateGsettings();
    }

    updateLightingMode(lighting) {
        if (this._features.lightingControl) {
            if (this._tpLighting !== lighting) {
                this._tpLighting = lighting;
                this._settingsItems['tp-lighting'] = lighting;
            }
        }
    }

    _setAdvancedTouchConfig() {
        if (!this._features.advancedTouchLock && !this._features.advancedTouchIsPinch)
            return;

        const props = {};
        if (this._features.advancedTouchLock) {
            props.touchpadLock = !this._touchEnabled;
            props.singleTapOn = this._tpAdvSingle;
            props.doubleTapOn = this._tpAdvDouble;
            props.tripleTapOn = this._tpAdvTriple;
            props.touchHoldOn = this._tpAdvHold;
        } else {
            props.touchpadLock = true;
            props.singleTapOn = this._touchEnabled;
            props.doubleTapOn = this._touchEnabled;
            props.tripleTapOn = this._touchEnabled;
            props.touchHoldOn = true;
        }

        if (this._features.advancedTouchLockForCalls) {
            props.doubleTapForCallOn = this._tpAdvCallDouble;
            props.touchHoldOnForCallOff = this._tpAdvCallHold;
        }

        if (this._features.lightingControl)
            props.lightingMode = this._tpLighting;

        this._galaxyBudsSocket.setTouchPadAdvance(props);
    }

    updateTouchpadOptionL(leftMode) {
        if (!this._features.touchAndHold)
            return;

        if (this._thLeft !== leftMode) {
            this._thLeft = leftMode;
            this._settingsItems['th-left'] = leftMode;
            this._updateGsettings();
        }
    }

    updateTouchpadOptionR(rightMode) {
        if (!this._features.touchAndHold)
            return;

        if (this._thRight !== rightMode) {
            this._thRight = rightMode;
            this._settingsItems['th-right'] = rightMode;
            this._updateGsettings();
        }
    }

    _setTouchAndHold() {
        const props = {left: this._thLeft, right: this._thRight};
        this._galaxyBudsSocket.setTouchAndHoldLRModes(props);
    }

    updateNoiseControlCycle(props) {
        if (!this._features.noiseControl)
            return;

        const rightVal =
        (props.off ? 1 : 0) << 0 |
        (props.ambient ? 1 : 0) << 1 |
        (props.anc ? 1 : 0) << 2 |
        (this._features.adaptiveNoiseControl ? (props.adaptive ? 1 : 0) << 3 : 0);

        const leftVal =
        !this._features.noiseControlModeDualSide ? rightVal
            : (props.leftOff ? 1 : 0) << 0 |
             (props.leftAmbient ? 1 : 0) << 1 |
             (props.leftAnc ? 1 : 0) << 2 |
             (this._features.adaptiveNoiseControl ? (props.leftAdaptive ? 1 : 0) << 3 : 0);

        let update = false;

        if (this._ncCycleRight !== rightVal) {
            this._ncCycleRight = rightVal;
            this._settingsItems['nc-cycle-right'] = rightVal;
            update = true;
        }

        if (this._ncCycleLeft !== leftVal) {
            this._ncCycleLeft = leftVal;
            this._settingsItems['nc-cycle-left'] = leftVal;
            update = true;
        }

        if (update)
            this._updateGsettings();
    }


    _setNoiseControlConfig() {
        if (!this._features.noiseControl)
            return;

        const right = this._ncCycleRight;
        const left = this._features.noiseControlModeDualSide ? this._ncCycleLeft : null;

        const payload = {right, left};

        if (this._features.noiseTouchAndHoldNewVersion)
            this._galaxyBudsSocket.setNcCycle(payload);
        else
            this._galaxyBudsSocket.setNcCycleLegacy(payload);
    }


    updateSideToneEnabled(level) {
        if (!this._features.ambientSidetone)
            return;

        if (this._sidetone !== level) {
            this._sidetone = level;
            this._settingsItems['sidetone'] = level;
            this._updateGsettings();
        }
    }

    _setAmbientSidetone() {
        if (!this._features.ambientSidetone)
            return;

        this._galaxyBudsSocket.setSideTone(this._sidetone);
    }

    updateNoiseControlsWithOneEarbud(enabled) {
        if (!this._features.noiseControlsWithOneEarbud)
            return;

        if (this._ncOne !== enabled) {
            this._ncOne = enabled;
            this._settingsItems['nc-one'] = enabled;
            this._updateGsettings();
        }
    }

    _setNcOneEarbud() {
        if (!this._features.noiseControlsWithOneEarbud)
            return;

        this._galaxyBudsSocket.setNoiseControlsWithOneEarbud(!!this._ncOne);
    }



    updateOutsideDoubleTap(enabled) {
        if (!this._features.doubleTapVolume)
            return;

        if (this._twoTapVol !== enabled) {
            this._twoTapVol = enabled;
            this._settingsItems['2tap-vol'] = enabled;
            this._updateGsettings();
        }
    }

    _setDoubleTapVolume() {
        if (!this._features.doubleTapVolume)
            return;

        this._galaxyBudsSocket.setOutsideDoubleTap(!!this._twoTapVol);
    }

    updateAmbientCustomization(props) {
        if (!this._features.ambientCustomize)
            return;

        let update = false;

        if (this._ambEnable !== props.enable) {
            this._ambEnable = props.enable;
            this._settingsItems['amb-enable'] = props.enable;
            update = true;
        }

        if (this._ambLeft !== props.leftVolume) {
            this._ambLeft = props.leftVolume;
            this._settingsItems['amb-left'] = props.leftVolume;
            update = true;
        }

        if (this._ambRight !== props.rightVolume) {
            this._ambRight = props.rightVolume;
            this._settingsItems['amb-right'] = props.rightVolume;
            update = true;
        }

        if (this._ambTone !== props.soundtone) {
            this._ambTone = props.soundtone;
            this._settingsItems['amb-tone'] = props.soundtone;
            update = true;
        }

        if (update)
            this._updateGsettings();
    }

    _setAmbientCustomize() {
        if (!this._features.ambientCustomize)
            return;

        const props = {
            enable: this._ambEnable,
            leftVolume: this._ambLeft,
            rightVolume: this._ambRight,
            soundtone: this._ambTone,
        };

        this._galaxyBudsSocket.setCustomizeAmbientSound(props);
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
