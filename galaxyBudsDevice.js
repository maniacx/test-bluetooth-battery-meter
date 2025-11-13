'use strict';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import {createLogger} from './logger.js';
import {getBluezDeviceProxy} from './bluezDeviceProxy.js';
import {GalaxyBudsSocket} from './galaxyBudsSocket.js';
import {checkForSamsungBuds} from './galaxyBudsDetector.js';
import {GalaxyBudsModelList, BudsUUID, BudsLegacyUUID, GalaxyBudsAnc} from './galaxyBudsConfig.js';

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

        this._callbacks = {
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

        if (globalThis.TESTDEVICE) {
            this._uuids = globalThis.TESTDEVICE === 'Galaxy Buds' ? [BudsLegacyUUID] : [BudsUUID];
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
        this._modelData = modelData;

        if (!modelData) {
            this._log.info(`No matching modelData found for name: ${name}`);
            return;
        }

        this._log.info(`Found modelData for name "${name}": ${JSON.stringify(modelData, null, 2)}`);
        this._features = modelData.features;
        this._touchOptions = modelData.touchOptions;


        // Battery
        this._ui.bat1.setIcon(`bbm-${modelData.budsIcon}-left-symbolic`);
        this._ui.bat2.setIcon(`bbm-${modelData.budsIcon}-right-symbolic`);
        this._ui.bat2.visible = true;

        if (this._features.caseBattery) {
            this._ui.bat3.setIcon(`bbm-${modelData.case}-symbolic`);
            this._ui.bat3.visible = true;
        }

        if (globalThis.TESTDEVICE)
            this._startGalaxyBudsSocket(-1);
        else
            this._initializeProfile();
    }

    _addConditionalGUI() {
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

        if (this._features.detectConversations) {
            const s2cTogglebtn = {
                btn1Name: 'Off', btn1Icon: 'bbm-ca-off-symbolic',
                btn2Name: 'On', btn2Icon: 'bbm-ca-on-symbolic',
            };
            this._ui.s2cToggle.updateConfig(s2cTogglebtn);
        }
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
        this._addConditionalGUI();
        this._ambientToggleMonitor();
        this._ambientLevelSliderMonitor();
        this._noiseCancellationLevelSliderMonitor();
        this._voiceFocusSwitchMonitor();
        this._s2cToggleMonitor();
        this._eqPresetDdMonitor();
        this._stereoBalSliderMonitor();
        this._touchControlMonitor();
        this._touchAnHoldMonitor();
        this._noiseControlCheckboxMonitor();
        this._sideToneSwitchMonitor();
        this._noiseControlsOneEarbudSwitchMonitor();
        this._outsideDoubleTapMonitor();
        this._ambientCustomizationMonitor();
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

    updateDetectConversationsDuration(duration) {
        this._uiGuards.s2cTimeout = true;
        this._ui.s2cDurationDd.selected_item = duration;
        this._uiGuards.s2cTimeout = false;
    }

    _s2cToggleMonitor() {
        if (!this._features.detectConversations)
            return;

        this._ui.s2cGroup.visible = true;
        this._ui.s2cToggle.visible = true;
        this._ui.s2cDurationDd.visible = true;
        this._ui.s2cToggle.connect('notify::toggled', () => {
            if (this._uiGuards.s2cenable)
                return;
            const enabled = this._ui.s2cToggle.toggled === 2;
            this._galaxyBudsSocket.setDetectConversations(enabled);
        });

        this._ui.s2cDurationDd.connect('notify::selected-item', () => {
            if (this._uiGuards.s2cTimeout)
                return;

            const duration = this._ui.s2cDurationDd.selected_item;
            this._galaxyBudsSocket.setDetectConversationsDuration(duration);
        });
    }

    updateEqPresets(presetCode) {
        this._uiGuards.equalizer = true;
        this._ui.eqPresetDd.selected_item = presetCode;
        this._uiGuards.equalizer = false;
    }

    _eqPresetDdMonitor() {
        this._ui.eqGroup.visible = true;
        this._ui.eqPresetDd.visible = true;
        this._ui.eqPresetDd.connect('notify::selected-item', () => {
            if (this._uiGuards.equalizer)
                return;

            const presetCode = this._ui.eqPresetDd.selected_item;
            this._galaxyBudsSocket.setEqPresets(presetCode);
        });
    }

    updateStereoBal(level) {
        this._uiGuards.stereoBal = true;
        this._stereoBal = level;
        this._ui.stereoBalSlider.value = level;
        this._uiGuards.stereoBal = false;
    }

    _stereoBalSliderMonitor() {
        if (!this._features.stereoPan)
            return;

        this._ui.stereoBalSlider.visible = true;
        this._ui.stereoBalSlider.connect('notify::value', () => {
            if (this._uiGuards.stereoBal)
                return;

            const bal = Math.round(this._ui.stereoBalSlider.value);
            if (this._stereoBal !== bal) {
                this._stereoBal = bal;
                this._galaxyBudsSocket.setStereoBalance(bal);
            }
        });
    }

    _updateTouchSensitivity(sensitive) {
        this._ui.touchControlSingleTapSwitch.sensitive = sensitive;
        this._ui.touchControlDoubleTapSwitch.sensitive = sensitive;
        this._ui.touchControlTripleTapSwitch.sensitive = sensitive;
        this._ui.touchControlTouchHoldSwitch.sensitive = sensitive;
        this._ui.touchControlAnswerCallSwitch.sensitive = sensitive;
        this._ui.touchControlDeclineCallSwitch.sensitive = sensitive;
    }

    updateTouchpadLock(enable) {
        this._uiGuards.touchControl = true;
        this._ui.touchControlLockSwitch.active = !enable;
        this._uiGuards.touchControl = false;
    }

    _touchControlMonitor() {
        if (this._features.advancedTouchLock) {
            this._advanceTouchControlMonitor();
        } else {
            this._ui.touchControlGroup.visible = true;
            this._ui.touchControlLockSwitch.visible = true;
            this._ui.touchControlLockSwitch.connect('notify::active', () => {
                if (this._uiGuards.touchControl)
                    return;

                const enabled = !this._ui.touchControlLockSwitch.active;
                this._galaxyBudsSocket.setTouchPadLock(enabled);
            });
        }
    }

    updateAdvanceTouchpadLock(touchProps) {
        this._uiGuards.touchControl = true;

        this._touchProps.touchpadLock = touchProps.touchpadLock;
        this._ui.touchControlLockSwitch.active = !touchProps.touchpadLock;

        this._touchProps.singleTapOn = touchProps.singleTapOn;
        this._touchProps.doubleTapOn = touchProps.doubleTapOn;
        this._touchProps.tripleTapOn = touchProps.tripleTapOn;
        this._touchProps.touchHoldOn = touchProps.touchHoldOn;

        if (!this._features.advancedTouchIsPinch) {
            this._updateTouchSensitivity(!touchProps.touchpadLock);
            this._ui.touchControlSingleTapSwitch.active = touchProps.singleTapOn;
            this._ui.touchControlDoubleTapSwitch.active = touchProps.doubleTapOn;
            this._ui.touchControlTripleTapSwitch.active = touchProps.tripleTapOn;
            this._ui.touchControlTouchHoldSwitch.active = touchProps.touchHoldOn;
        }
        if (this._features.advancedTouchLockForCalls) {
            this._touchProps.doubleTapForCallOn = touchProps.doubleTapForCallOn;
            this._touchProps.touchHoldOnForCallOn = touchProps.touchHoldOnForCallOn;
            this._ui.touchControlAnswerCallSwitch.active = touchProps.doubleTapForCallOn;
            this._ui.touchControlDeclineCallSwitch.active = touchProps.touchHoldOnForCallOn;
        }

        if (this._features.advancedTouchIsPinch)
            this._touchProps.swipeStem = touchProps.swipeStem;

        this._uiGuards.touchControl = false;
    }

    updateLightingMode(mode) {
        this._uiGuards.touchControl = true;
        if (this._features.lightingControl) {
            this._touchProps.lightingMode = mode;
            this._ui.lightingModeDD.selected_item = mode;
        }
        this._uiGuards.touchControl = false;
    }

    _advanceTouchControlMonitor() {
        if (this._features.advancedTouchIsPinch)
            this._ui.touchControlLockSwitch.title = 'Media Controls (Pinch And Swipe)';


        this._ui.touchControlGroup.visible = true;
        this._ui.touchControlLockSwitch.visible = true;
        this._ui.touchControlLockSwitch.connect('notify::active', () => {
            if (this._uiGuards.touchControl)
                return;

            const enabled = !this._ui.touchControlLockSwitch.active;

            if (this._features.advancedTouchIsPinch) {
                this._touchProps.touchpadLock = true;
                this._touchProps.singleTapOn = enabled;
                this._touchProps.doubleTapOn = enabled;
                this._touchProps.tripleTapOn = enabled;
                this._touchProps.touchHoldOn = true;
                this._touchProps.swipeStem = enabled;
                this._galaxyBudsSocket.setTouchPadAdvance(this._touchProps);
            } else {
                this._updateTouchSensitivity(!enabled);
                this._touchProps.touchpadLock = enabled;
                this._galaxyBudsSocket.setTouchPadAdvance(this._touchProps);
            }
        });

        if (!this._features.advancedTouchIsPinch) {
            this._ui.touchControlSingleTapSwitch.visible = true;
            this._ui.touchControlSingleTapSwitch.connect('notify::active', () => {
                if (this._uiGuards.touchControl)
                    return;

                this._touchProps.singleTapOn = this._ui.touchControlSingleTapSwitch.active;
                this._galaxyBudsSocket.setTouchPadAdvance(this._touchProps);
            });

            this._ui.touchControlDoubleTapSwitch.visible = true;
            this._ui.touchControlDoubleTapSwitch.connect('notify::active', () => {
                if (this._uiGuards.touchControl)
                    return;

                this._touchProps.doubleTapOn = this._ui.touchControlDoubleTapSwitch.active;
                this._galaxyBudsSocket.setTouchPadAdvance(this._touchProps);
            });

            this._ui.touchControlTripleTapSwitch.visible = true;
            this._ui.touchControlTripleTapSwitch.connect('notify::active', () => {
                if (this._uiGuards.touchControl)
                    return;

                this._touchProps.tripleTapOn = this._ui.touchControlTripleTapSwitch.active;
                this._galaxyBudsSocket.setTouchPadAdvance(this._touchProps);
            });

            this._ui.touchControlTouchHoldSwitch.visible = true;
            this._ui.touchControlTouchHoldSwitch.connect('notify::active', () => {
                if (this._uiGuards.touchControl)
                    return;

                this._touchProps.touchHoldOn = this._ui.touchControlTouchHoldSwitch.active;
                this._galaxyBudsSocket.setTouchPadAdvance(this._touchProps);
            });
        }

        if (this._features.advancedTouchLockForCalls) {
            if (this._features.advancedTouchIsPinch) {
                this._ui.touchControlAnswerCallSwitch.title = 'Pinch to Answer Call or End Call';
                this._ui.touchControlDeclineCallSwitch.title = 'Pinch and Hold to Decline Call';
            }

            this._ui.touchControlAnswerCallSwitch.visible = true;
            this._ui.touchControlAnswerCallSwitch.connect('notify::active', () => {
                if (this._uiGuards.touchControl)
                    return;

                this._touchProps.doubleTapForCallOn = this._ui.touchControlAnswerCallSwitch.active;
                this._galaxyBudsSocket.setTouchPadAdvance(this._touchProps);
            });

            this._ui.touchControlDeclineCallSwitch.visible = true;
            this._ui.touchControlDeclineCallSwitch.connect('notify::active', () => {
                if (this._uiGuards.touchControl)
                    return;

                this._touchProps.touchHoldOnForCallOn =
                    this._ui.touchControlDeclineCallSwitch.active;
                this._galaxyBudsSocket.setTouchPadAdvance(this._touchProps);
            });
        }

        if (this._features.lightingControl) {
            this._ui.lightingModeDD.visible = true;
            this._ui.lightingModeDD.connect('notify::selected-item', () => {
                if (this._uiGuards.touchControl)
                    return;
                this._touchProps.lightingMode = this._ui.lightingModeDD.selected_item;
                this._galaxyBudsSocket.setTouchPadAdvance(this._touchProps);
            });
        }
    }

    updateTouchpadOptionL(mode) {
        this._uiGuards.touchControlAndHold = true;
        this._ui.touchAndHoldLeftDD.selected_item = mode;
        this._uiGuards.touchControlAndHold = false;
    }

    updateTouchpadOptionR(mode) {
        this._uiGuards.touchControlAndHold = true;
        this._ui.touchAndHoldRightDD.selected_item = mode;
        this._uiGuards.touchControlAndHold = false;
    }

    _touchAnHoldMonitor() {
        const readableNames = {
            voiceAssistant: 'Voice Assistant',
            quickAmbientSound: 'Quick Ambient Sound',
            volume: 'Volume Control',
            ambientSound: 'Ambient Sound',
            spotifySpotOn: 'Spotify Spot On',
            noiseControl: 'Noise Control',
            anc: 'ANC',
        };

        const options = [];
        const values = [];

        for (const [key, value] of Object.entries(this._touchOptions)) {
            if (key === 'otherL' || key === 'otherR')
                continue;

            const label = readableNames[key] ?? key;
            options.push(label);
            values.push(value);
        }

        this._ui.touchAndHoldLeftDD.updateList(options, values);
        this._ui.touchAndHoldRightDD.updateList(options, values);

        if (this._features.advancedTouchIsPinch) {
            this._ui.touchAndHoldLeftDD.title = 'Left Earbud Pinch and Hold Function';
            this._ui.touchAndHoldRightDD.title = 'Right Earbud Pinch and Hold Function';
        }

        this._ui.touchAndHoldLeftDD.visible = true;
        this._ui.touchAndHoldLeftDD.connect('notify::selected-item', () => {
            if (this._uiGuards.touchControlAndHold)
                return;
            this._touchAndHoldProps.left = this._ui.touchAndHoldLeftDD.selected_item;
            this._galaxyBudsSocket.setTouchAndHoldLRModes(this._touchAndHoldProps);
        });

        this._ui.touchAndHoldRightDD.visible = true;
        this._ui.touchAndHoldRightDD.connect('notify::selected-item', () => {
            if (this._uiGuards.touchControlAndHold)
                return;
            this._touchAndHoldProps.right = this._ui.touchAndHoldRightDD.selected_item;
            this._galaxyBudsSocket.setTouchAndHoldLRModes(this._touchAndHoldProps);
        });
    }

    _noiseControlCheckboxMonitor() {
        let groupTitle;
        let rowTitle;
        let rowSubtitle;
        let groupTitleL;
        let rowTitleL;
        let maxRequired = null;

        if (this._features.noiseControlModeDualSide) {
            if (this._features.advancedTouchIsPinch) {
                groupTitleL = 'Pinch and Hold Cycle for Left Earbud';
                rowTitleL = 'Pinch and hold cycles between modes (Left)';
                groupTitle = 'Pinch and Hold Cycle for Right Earbud';
                rowTitle = 'Pinch and hold cycles between modes (Right)';
            } else {
                groupTitleL = 'Touch and Hold Cycle for Left Earbud';
                rowTitleL = 'Touch and hold cycles between modes (Left)';
                groupTitle = 'Touch and Hold Cycle for Right Earbud';
                rowTitle = 'Touch and hold cycles between modes (Right)';
            }
        } else if (this._features.advancedTouchIsPinch) {
            groupTitle = 'Pinch and Hold Cycle';
            rowTitle = 'Pinch and hold cycles between modes';
        } else {
            groupTitle = 'Touch and Hold Cycle';
            rowTitle = 'Touch and hold cycles between modes';
        }

        if (this._features.noiseTouchAndHoldNewVersion) {
            rowSubtitle = '';
        } else {
            rowSubtitle = 'Select any two toggles';
            maxRequired = 2;
        }

        const items = [
            {name: 'Off', icon: 'bbm-anc-off-symbolic'},
            {name: 'Ambient', icon: 'bbm-transperancy-symbolic'},
            {name: 'Noise Cancellation', icon: 'bbm-anc-on-symbolic'},
        ];

        if (this._features.adaptiveNoiseControl)
            items.push({name: 'Adaptive', icon: 'bbm-adaptive-symbolic'});


        const paramsRight = {
            groupTitle,
            rowTitle,
            rowSubtitle,
            items,
            applyBtnName: 'Apply',
            initialValue: this._initialValuesRightCheckBox,
            maxRequired,
        };
        this._rightCheckBox = this._ui.addRightToggleCb(paramsRight);
        this._rightCheckBox.connect('notify::toggled-value', () => {
            if (this._uiGuards.ncCycle)
                return;

            const val = this._rightCheckBox.toggled_value;

            this._ncCycleProps.off = !!(val & 1 << 0);
            this._ncCycleProps.ambient = !!(val & 1 << 1);
            this._ncCycleProps.anc = !!(val & 1 << 2);
            if (this._features.adaptiveNoiseControl)
                this._ncCycleProps.adaptive = !!(val & 1 << 3);

            if (this._features.noiseTouchAndHoldNewVersion)
                this._galaxyBudsSocket.setNcCycle(this._ncCycleProps);
            else
                this._galaxyBudsSocket.setNcCycleLegacy(this._ncCycleProps);
        });

        if (this._features.noiseControlModeDualSide) {
            const paramsLeft = {
                groupTitle: groupTitleL,
                rowTitle: rowTitleL,
                rowSubtitle,
                items,
                applyBtnName: 'Apply',
                maxRequired,
                initialValue: this._initialValuesLefttCheckBox,
            };
            this._leftCheckBox = this._ui.addLeftToggleCb(paramsLeft);
            this._leftCheckBox.connect('notify::toggled-value', () => {
                if (this._uiGuards.ncCycle)
                    return;

                const val = this._leftCheckBox.toggled_value;

                this._ncCycleProps.leftOff = !!(val & 1 << 0);
                this._ncCycleProps.leftAmbient = !!(val & 1 << 1);
                this._ncCycleProps.leftAnc = !!(val & 1 << 2);
                if (this._features.adaptiveNoiseControl)
                    this._ncCycleProps.leftAdaptive = !!(val & 1 << 3);

                if (this._features.noiseTouchAndHoldNewVersion)
                    this._galaxyBudsSocket.setNcCycle(this._ncCycleProps);
                else
                    this._galaxyBudsSocket.setNcCycleLegacy(this._ncCycleProps);
            });
        }
    }

    updateNoiseControlCycle(props) {
        this._uiGuards.ncCycle = true;
        this._ncCycleProps = props;

        let rightVal = 0;
        const rightItems = ['off', 'ambient', 'anc'];
        if (this._features.adaptiveNoiseControl)
            rightItems.push('adaptive');

        rightItems.forEach((key, i) => {
            if (props[key])
                rightVal |= 1 << i;
        });

        this._initialValuesRightCheckBox = rightVal;

        if (this._rightCheckBox)
            this._rightCheckBox.toggled_value = rightVal;

        if (this._features.noiseControlModeDualSide) {
            let leftVal = 0;
            const leftItems = ['leftOff', 'leftAmbient', 'leftAnc'];
            if (this._features.adaptiveNoiseControl)
                leftItems.push('leftAdaptive');

            leftItems.forEach((key, i) => {
                if (props[key])
                    leftVal |= 1 << i;
            });

            this._initialValuesLeftCheckBox = leftVal;

            if (this._leftCheckBox)
                this._leftCheckBox.toggled_value = leftVal;
        }

        this._uiGuards.ncCycle = false;
    }

    updateSideToneEnabled(enabled) {
        this._uiGuards.sideTone = true;
        this._ui.sideToneSwitch.active = enabled;
        this._uiGuards.sideTone = false;
    }

    _sideToneSwitchMonitor() {
        if (!this._features.ambientSidetone)
            return;

        this._ui.moreSettingsGrp.visible = true;
        this._ui.sideToneSwitch.visible = true;
        this._ui.sideToneSwitch.connect('notify::active', () => {
            if (this._uiGuards.sideTone)
                return;

            this._galaxyBudsSocket.setSideTone(this._ui.sideToneSwitch.active);
        });
    }

    updateNoiseControlsWithOneEarbud(enabled) {
        this._uiGuards.noiseControlsWithOneEarbud = true;
        this._ui.noiseControlsOneEarbudSwitch.active = enabled;
        this._uiGuards.noiseControlsWithOneEarbud = false;
    }

    _noiseControlsOneEarbudSwitchMonitor() {
        if (!this._features.noiseControlsWithOneEarbud)
            return;

        this._ui.moreSettingsGrp.visible = true;
        this._ui.noiseControlsOneEarbudSwitch.visible = true;
        this._ui.noiseControlsOneEarbudSwitch.connect('notify::active', () => {
            if (this._uiGuards.noiseControlsWithOneEarbud)
                return;

            this._galaxyBudsSocket.setNoiseControlsWithOneEarbud(
                this._ui.noiseControlsOneEarbudSwitch.active);
        });
    }

    updateOutsideDoubleTap(enabled) {
        this._uiGuards.outsideDoubleTap = true;
        this._ui.outsideDoubleTapSwitch.active = enabled;
        this._uiGuards.outsideDoubleTap = false;
    }

    _outsideDoubleTapMonitor() {
        if (!this._features.doubleTapVolume)
            return;

        this._ui.moreSettingsGrp.visible = true;
        this._ui.outsideDoubleTapSwitch.visible = true;
        this._ui.outsideDoubleTapSwitch.connect('notify::active', () => {
            if (this._uiGuards.outsideDoubleTap)
                return;

            this._galaxyBudsSocket.setOutsideDoubleTap(this._ui.outsideDoubleTapSwitch.active);
        });
    }

    updateAmbientCustomization(customAmbientProps) {
        this._customAmbientProps = customAmbientProps;
        this._uiGuards.customAmbient = true;

        this._ui.customAmbientSwitch.active = customAmbientProps.enable;
        const {ambientLLevel, ambientRLevel, ambientToneLevel} = this._customAmbientWidgets;
        if (ambientLLevel)
            ambientLLevel.value = customAmbientProps.leftVolume;

        if (ambientRLevel)
            ambientRLevel.value = customAmbientProps.rightVolume;

        if (ambientToneLevel)
            ambientToneLevel.value = customAmbientProps.soundtone;

        this._uiGuards.customAmbient = false;
    }

    _ambientCustomizationMonitor() {
        if (!this._features.ambientCustomize || !this._features.ambientVolumeMax)
            return;

        const upperRange = this._features.ambientCustomizeVolume
            ? this._features.ambientCustomizeVolume : this._features.ambientVolumeMax;

        const marks = [{mark: 0, label: '-'}, {mark: upperRange, label: '+'}];
        const range = [0, upperRange, 1];

        const paramsL = {
            rowTitle: 'Left Earbud Ambient Volume',
            rowSubtitle: '',
            marks,
            initialValue: this._customAmbientProps.leftVolume ?? upperRange / 2,
            range,
            snapOnStep: true,
        };

        const paramsR = {
            rowTitle: 'Right Earbud Ambient Volume',
            rowSubtitle: '',
            marks,
            initialValue: this._customAmbientProps.rightVolume ?? upperRange / 2,
            range,
            snapOnStep: true,
        };

        this._customAmbientWidgets = this._ui.ambientVolumeLevelCb(paramsL, paramsR);

        this._ui.ambientCustomizeGroup.visible = true;
        this._ui.customAmbientSwitch.visible = true;

        this._ui.customAmbientSwitch.connect('notify::active', () => {
            if (this._uiGuards.customAmbient)
                return;

            this._customAmbientProps.enable = this._ui.customAmbientSwitch.active;
            this._galaxyBudsSocket.setCustomizeAmbientSound(this._customAmbientProps);
        });

        const {ambientLLevel, ambientRLevel, ambientToneLevel} = this._customAmbientWidgets;

        ambientLLevel.connect('notify::value', () => {
            if (this._uiGuards.customAmbient)
                return;

            this._customAmbientProps.leftVolume = ambientLLevel.value;
            this._galaxyBudsSocket.setCustomizeAmbientSound(this._customAmbientProps);
        });

        ambientRLevel.connect('notify::value', () => {
            if (this._uiGuards.customAmbient)
                return;

            this._customAmbientProps.rightVolume = ambientRLevel.value;
            this._galaxyBudsSocket.setCustomizeAmbientSound(this._customAmbientProps);
        });

        ambientToneLevel.connect('notify::value', () => {
            if (this._uiGuards.customAmbient)
                return;

            this._customAmbientProps.soundtone = ambientToneLevel.value;
            this._galaxyBudsSocket.setCustomizeAmbientSound(this._customAmbientProps);
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
