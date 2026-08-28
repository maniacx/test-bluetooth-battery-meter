'use strict';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {createLogger, getDeviceIdentifier} from '../logger.js';
import {
    buds2to1BatteryLevel, validateProperties, launchConfigureWindow
} from '../deviceUtils.js';
import {createConfig, createProperties, DataHandler} from '../../dataHandler.js';
import {OpoBudsSocket} from './opoBudsSocket.js';

export const DeviceTypeOpoBuds = 'opoBuds';

const OpoBudsUUID = '0000079a-d102-11e1-9b23-00025b00a5a5';

export function isOpoBuds(bluezDeviceProxy, uuids) {
    const bluezProps = [];
    const supported = uuids.some(uuid => uuid.toLowerCase() === OpoBudsUUID) ? 'yes' : 'no';
    return {supported, bluezProps};
}

export const OpoBudsDevice = GObject.registerClass({
    GTypeName: 'BudsLink_OpoBudsDevice',
}, class OpoBudsDevice extends GObject.Object {
    _init(settings, devicePath, alias, extPath, profileManager, updateDeviceMapCb) {
        super._init();
        const identifier = getDeviceIdentifier(devicePath);
        const tag = `OpoBudsDevice-${identifier}`;
        this._log = createLogger(tag);
        this._log.info('------------------- OpoBudsDevice init -------------------');
        this._settings = settings;
        this._devicePath = devicePath;
        this._alias = alias;
        this._extPath = extPath;
        this.updateDeviceMapCb = updateDeviceMapCb;
        this._ignoreGsettingsChange = false;
        this._fwVersion = '';
        this._commonIcon = 'earbuds-stem';
        this._caseIcon = 'case-round';

        this._config = createConfig();
        this._props = createProperties();
        this._modelData = null;

        this._callbacks = {
            modelIntialized: this.modelIntialized.bind(this),
            updateFirmwareInfo: this.updateFirmwareInfo.bind(this),
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateNoiseControl: this.updateNoiseControl.bind(this),
            updateInEar: this.updateInEar.bind(this),
            updateLatency: this.updateLatency.bind(this),
            updateDualConnection: this.updateDualConnection.bind(this),
            updateWindNoise: this.updateWindNoise.bind(this),
            updateVolumeEnhancer: this.updateVolumeEnhancer.bind(this),
            updateSpatialAudio: this.updateSpatialAudio.bind(this),
            updateHighRes: this.updateHighRes.bind(this),
            updateDynamicBass: this.updateDynamicBass.bind(this),
            updateAutoAnswer: this.updateAutoAnswer.bind(this),
            updateFindPhone: this.updateFindPhone.bind(this),
            updateEqPreset: this.updateEqPreset.bind(this),
            updateGestures: this.updateGestures.bind(this),
            updateSingleGesture: this.updateSingleGesture.bind(this),
        };

        const profile = {type: DeviceTypeOpoBuds, uuid: OpoBudsUUID};

        this._opoBudsSocket = new OpoBudsSocket(
            devicePath,
            profileManager,
            profile,
            this._callbacks
        );

        this._battInfoRecieved = false;
        this._pendingAncMode = null;
        this._pendingWindNoise = null;
        this._pendingVolumeEnhancer = null;
        this._isReady = false;
    }

    modelIntialized(modelData) {
        this._modelData = modelData;

        this._log.info(`Configuration: ${JSON.stringify(this._modelData, null, 2)}`);

        this._commonIcon = this._modelData.budsIcon ?? 'earbuds-stem';
        if (this._modelData.batteryCase)
            this._caseIcon = `${this._modelData.case ?? 'case-round'}`;

        this._createDefaultSettings();

        const devicesList = this._settings.get_strv('opo-buds-list').map(JSON.parse);

        if (devicesList.length === 0 ||
                !devicesList.some(device => device.path === this._devicePath)) {
            this._addPropsToSettings(devicesList);
        } else {
            validateProperties(this._settings, 'opo-buds-list', devicesList,
                this._defaultsDeviceSettings, this._devicePath);
        }

        this._updateInitialValues();
        this._monitorOpoBudsListGsettings();

        this._updateIcons();
        this._updateAncConfig();

        if (this._pendingAncMode !== null) {
            this.updateNoiseControl(this._pendingAncMode);
            this._pendingAncMode = null;
        }

        if (this._pendingWindNoise !== null) {
            this.updateWindNoise(this._pendingWindNoise);
            this._pendingWindNoise = null;
        }

        if (this._pendingVolumeEnhancer !== null) {
            this.updateVolumeEnhancer(this._pendingVolumeEnhancer);
            this._pendingVolumeEnhancer = null;
        }

        if (this._modelData.ring) {
            this._ringState = 'stopped';
            this._settingsItems['ring-state'] = this._ringState;
            this._updateGsettings();
        }

        if (!this._battInfoRecieved) {
            const b1 = this._props.battery1Level ?? 0;
            const b2 = this._props.battery2Level ?? 0;
            const b3 = this._props.battery3Level ?? 0;
            if (b1 > 0 || b2 > 0 || b3 > 0)
                this._startConfiguration(this._props);
        }
    }

    _createDefaultSettings() {
        this._defaultsDeviceSettings = {
            path: this._devicePath,
            modelid: this._modelData.modelId,
            alias: this._alias,
            icon: this._commonIcon,
            'fw-version': this._fwVersion,

            ...this._modelData.batteryCase && {
                'case': this._caseIcon,
            },

            ...this._modelData.eqPreset && {
                'eq-preset': Object.values(this._modelData.eqPreset)[0],
            },

            ...this._modelData.lowLatencyMode && {
                'lowlatency': false,
            },

            ...this._modelData.inEarDetection && {
                'inear-enable': false,
            },

            ...this._modelData.dualConnection && {
                'dual-connection': false,
            },

            ...this._modelData.windNoiseReduction && {
                'wind-noise': false,
            },

            ...this._modelData.volumeEnhancer && {
                'volume-enhancer': false,
            },

            ...this._modelData.spatialAudio && {
                'spatial': false,
            },

            ...this._modelData.highResAudio && {
                'high-res': false,
            },

            ...this._modelData.dynamicBass && {
                'dynamic-bass': false,
            },

            ...this._modelData.autoAnswer && {
                'auto-answer': false,
            },

            ...this._modelData.findMyPhone && {
                'find-phone': false,
            },
        };
    }

    _updateInitialValues() {
        const devicesList = this._settings.get_strv('opo-buds-list').map(JSON.parse);
        const index = devicesList.findIndex(item => item.path === this._devicePath);
        if (index === -1)
            return;

        this._settingsItems = devicesList[index];

        this._commonIcon = this._settingsItems['icon'];

        if (this._modelData.batteryCase)
            this._caseIcon = this._settingsItems['case'];

        if (this._modelData.eqPreset)
            this._eqPreset = this._settingsItems['eq-preset'];

        if (this._modelData.inEarDetection)
            this._inEar = this._settingsItems['inear-enable'];

        if (this._modelData.lowLatencyMode)
            this._lowlatency = this._settingsItems['lowlatency'];

        if (this._modelData.dualConnection)
            this._dualConnection = this._settingsItems['dual-connection'];

        if (this._modelData.windNoiseReduction) {
            this._windNoise = this._settingsItems['wind-noise'];
            this._props.box1CheckButton1State = this._windNoise ? 1 : 0;
            this._props.box2CheckButton2State = this._windNoise ? 1 : 0;
        }

        if (this._modelData.volumeEnhancer) {
            this._volumeEnhancer = this._settingsItems['volume-enhancer'];
            this._props.box2CheckButton1State = this._volumeEnhancer ? 1 : 0;
        }

        if (this._modelData.spatialAudio)
            this._spatial = this._settingsItems['spatial'];

        if (this._modelData.highResAudio)
            this._highRes = this._settingsItems['high-res'];

        if (this._modelData.dynamicBass) {
            this._dynamicBass = this._settingsItems['dynamic-bass'];
            this._dynamicAudioLow = this._settingsItems['dynamic-audio-low'] ?? 0;
            this._dynamicAudioMed = this._settingsItems['dynamic-audio-med'] ?? 0;
            this._dynamicAudioHigh = this._settingsItems['dynamic-audio-high'] ?? 0;
        }

        if (this._modelData.autoAnswer)
            this._autoAnswer = this._settingsItems['auto-answer'];

        if (this._modelData.findMyPhone)
            this._findPhone = this._settingsItems['find-phone'];

        if (this._modelData.gestureOptions)
            this._gestures = this._settingsItems['gestures'];

        if (this._modelData.ring)
            this._ringState = this._settingsItems['ring-state'];
    }

    _addPropsToSettings(devicesList) {
        devicesList.push(this._defaultsDeviceSettings);
        this._settings.set_strv('opo-buds-list', devicesList.map(JSON.stringify));
    }

    _monitorOpoBudsListGsettings() {
        this._settingsHandlerId = this._settings?.connect('changed::opo-buds-list', () => {
            if (this._ignoreGsettingsChange)
                return;

            const devicesList = this._settings.get_strv('opo-buds-list').map(JSON.parse);
            const index = devicesList.findIndex(item => item.path === this._devicePath);
            if (index === -1)
                return;

            this._settingsItems = devicesList[index];

            const icon = this._settingsItems['icon'];
            if (this._commonIcon !== icon) {
                this._commonIcon = icon;
                this._updateIcons();
            }

            if (this._modelData.batteryCase) {
                const caseIcon = this._settingsItems['case'];
                if (this._caseIcon !== caseIcon) {
                    this._caseIcon = caseIcon;
                    this._updateIcons();
                }
            }

            if (this._modelData.eqPreset) {
                const eqPreset = this._settingsItems['eq-preset'];
                if (this._eqPreset !== eqPreset) {
                    this._eqPreset = eqPreset;
                    this._opoBudsSocket?.setEqPreset(eqPreset);
                }
            }

            if (this._modelData.inEarDetection) {
                const inEar = this._settingsItems['inear-enable'];
                if (this._inEar !== inEar) {
                    this._inEar = inEar;
                    this._opoBudsSocket?.setInEar(inEar);
                }
            }

            if (this._modelData.lowLatencyMode) {
                const latency = this._settingsItems['lowlatency'];
                if (this._lowlatency !== latency) {
                    this._lowlatency = latency;
                    this._opoBudsSocket?.setLatency(latency);
                }
            }

            if (this._modelData.dualConnection) {
                const dual = this._settingsItems['dual-connection'];
                if (this._dualConnection !== dual) {
                    this._dualConnection = dual;
                    this._opoBudsSocket?.setDualConnection(dual);
                }
            }

            if (this._modelData.windNoiseReduction) {
                const windNoise = this._settingsItems['wind-noise'];
                if (this._windNoise !== windNoise) {
                    this._windNoise = windNoise;
                    this._opoBudsSocket?.setWindNoise(windNoise);
                }
            }

            if (this._modelData.volumeEnhancer) {
                const volumeEnhancer = this._settingsItems['volume-enhancer'];
                if (this._volumeEnhancer !== volumeEnhancer) {
                    this._volumeEnhancer = volumeEnhancer;
                    this._opoBudsSocket?.setVolumeEnhancer(volumeEnhancer);
                }
            }

            if (this._modelData.spatialAudio) {
                const spatial = this._settingsItems['spatial'];
                if (this._spatial !== spatial) {
                    this._spatial = spatial;
                    this._opoBudsSocket?.setSpatialAudio(spatial);
                }
            }

            if (this._modelData.highResAudio) {
                const highRes = this._settingsItems['high-res'];
                if (this._highRes !== highRes) {
                    this._highRes = highRes;
                    this._opoBudsSocket?.setHighRes(highRes);
                }
            }

            if (this._modelData.dynamicBass) {
                const dynamicBass = this._settingsItems['dynamic-bass'];
                if (this._dynamicBass !== dynamicBass) {
                    this._dynamicBass = dynamicBass;
                    this._opoBudsSocket?.setDynamicBass(dynamicBass);
                }

                const low = this._settingsItems['dynamic-audio-low'] ?? 0;
                const med = this._settingsItems['dynamic-audio-med'] ?? 0;
                const high = this._settingsItems['dynamic-audio-high'] ?? 0;
                if (this._dynamicAudioLow !== low || this._dynamicAudioMed !== med || this._dynamicAudioHigh !== high) {
                    this._dynamicAudioLow = low;
                    this._dynamicAudioMed = med;
                    this._dynamicAudioHigh = high;
                    this._opoBudsSocket?.setDynamicAudioEq(low, med, high);
                }
            }

            if (this._modelData.autoAnswer) {
                const autoAnswer = this._settingsItems['auto-answer'];
                if (this._autoAnswer !== autoAnswer) {
                    this._autoAnswer = autoAnswer;
                    this._opoBudsSocket?.setAutoAnswer(autoAnswer);
                }
            }

            if (this._modelData.findMyPhone) {
                const findPhone = this._settingsItems['find-phone'];
                if (this._findPhone !== findPhone) {
                    this._findPhone = findPhone;
                    this._opoBudsSocket?.setFindPhone(findPhone);
                }
            }

            if (this._modelData.gestureOptions) {
                const gestures = this._settingsItems['gestures'];
                if (gestures && this._gestures !== gestures) {
                    const changed = this._findChangedGestureSlot(this._gestures, gestures);
                    this._gestures = gestures;
                    if (changed)
                        this._opoBudsSocket?.setGestureSlot(
                            changed.device, changed.buttonId,
                            changed.gestureType, changed.action);
                }
            }

            if (this._modelData.ring) {
                const ringState = this._settingsItems['ring-state'];
                if (this._ringState !== ringState) {
                    this._ringState = ringState;
                    this._opoBudsSocket?.setFindBuds(ringState);
                }
            }
        });
    }

    _updateGsettings() {
        this._ignoreGsettingsChange = true;

        const currentList = this._settings.get_strv('opo-buds-list').map(JSON.parse);
        const index = currentList.findIndex(d => d.path === this._devicePath);

        if (index !== -1) {
            currentList[index] = this._settingsItems;
            this._settings.set_strv('opo-buds-list', currentList.map(JSON.stringify));
        }

        this._ignoreGsettingsChange = false;
    }

    _updateIcons() {
        this._config.commonIcon = this._commonIcon;
        this._config.albumArtIcon = this._commonIcon;
        this._config.showSettingsButton = true;

        this._config.battery1ShowOnDisconnect = true;
        if (this._modelData?.batteryLR) {
            this._config.battery1Icon = `${this._commonIcon}-left`;
            this._config.battery2Icon = `${this._commonIcon}-right`;
            this._config.battery2ShowOnDisconnect = true;
            this._config.battery3Icon = this._caseIcon;
        } else {
            this._config.battery1Icon = this._commonIcon;
        }

        this.dataHandler?.setConfig(this._config);
    }

    _updateAncConfig() {
        const nc = this._modelData?.noiseControl;
        if (!nc)
            return;

        let buttonIndex = 1;
        this._ancToggleMap = {};
        this._config.toggle1Title = _('Noise Control');

        const addToggle = (type, modeBytes, icon, name, matchBytes = modeBytes) => {
            this._config[`toggle1Button${buttonIndex}Icon`] = icon;
            this._config[`toggle1Button${buttonIndex}Name`] = name;
            this._ancToggleMap[buttonIndex] = {type, modeBytes, matchBytes};
            buttonIndex++;
        };

        const toBytes = entry => {
            if (Array.isArray(entry))
                return entry;
            if (entry?.byte !== undefined)
                return [entry.byte];
            return [];
        };

        if (nc.off)
            addToggle('off', toBytes(nc.off), 'bbm-anc-off-symbolic', _('Off'));

        if (nc.transparency) {
            const transBytes = nc.transparency.levels?.regular
                ? toBytes(nc.transparency.levels.regular)
                : toBytes(nc.transparency);
            addToggle('transparency', transBytes,
                'bbm-transperancy-symbolic', _('Transparency'));
        }

        if (nc.noiseCancellation) {
            const flatBytes = [];
            this._ancRadioMap = {};
            this._ancRadioReverse = {};

            if (nc.noiseCancellation.levels) {
                const levelsObj = nc.noiseCancellation.levels;
                const levelKeys = ['smart', 'mild', 'moderate', 'deep'].filter(k => k in levelsObj);

                const levelNames = {
                    'smart': _('Smart (Adaptive)'),
                    'mild': _('Mild'),
                    'moderate': _('Moderate'),
                    'deep': _('Deep (Max)'),
                };

                const radioNames = [];
                levelKeys.forEach((key, idx) => {
                    const num = idx + 1;
                    radioNames.push(levelNames[key] ?? key);
                    const modeBytes = toBytes(levelsObj[key]);
                    this._ancRadioMap[num] = modeBytes;
                    if (modeBytes.length)
                        this._ancRadioReverse[modeBytes[modeBytes.length - 1]] = num;
                    flatBytes.push(...modeBytes);
                });

                this._config.box1RadioButton = radioNames;
                this._config.box1RadioTitle = _('Noise Cancellation Level');
            } else if (nc.noiseCancellation.byte !== undefined) {
                flatBytes.push(nc.noiseCancellation.byte);
            } else {
                flatBytes.push(...toBytes(nc.noiseCancellation));
            }

            addToggle('noiseCancellation', flatBytes, 'bbm-anc-on-symbolic', _('Noise Cancellation'),
                flatBytes);
        }

        this._config.optionsBox1 = [];
        if (nc.noiseCancellation?.levels)
            this._config.optionsBox1.push('radio-button');
        if (this._modelData.windNoiseReduction) {
            this._config.optionsBox1.push('check-button');
            this._config.box1CheckButton = [_('Smart Wind Noise Reduction')];
        }

        this._config.optionsBox2 = [];
        const box2Labels = [];
        if (this._modelData.volumeEnhancer)
            box2Labels.push(_('Enhance Voice'));
        if (this._modelData.windNoiseReduction)
            box2Labels.push(_('Smart Wind Noise Reduction'));

        if (box2Labels.length > 0) {
            this._config.optionsBox2.push('check-button');
            this._config.box2CheckButton = box2Labels;
        }

        this.dataHandler?.setConfig(this._config);
    }

    _startConfiguration(battProps) {
        if (!this._modelData)
            return;

        const bat1level = battProps.battery1Level ?? 0;
        const bat2level = battProps.battery2Level ?? 0;
        const bat3level = battProps.battery3Level ?? 0;

        if (bat1level <= 0 && bat2level <= 0 && bat3level <= 0)
            return;

        this._battInfoRecieved = true;

        if (this._modelData.noiseControl)
            this._props.toggle1Visible = true;

        this.dataHandler = new DataHandler(this._config, this._props);
        this.updateDeviceMapCb(this._devicePath, this.dataHandler);

        this._dataHandlerId = this.dataHandler.connect('ui-action', (o, command, value) => {
            if (command === 'toggle1State')
                this._toggle1ButtonClicked(value);

            if (command === 'box1RadioButtonState')
                this._box1RadioButtonStateChanged(value);

            if (command === 'box1CheckButton1State')
                this._box1CheckButton1Changed(value);

            if (command === 'box2CheckButton1State')
                this._box2CheckButton1Changed(value);

            if (command === 'box2CheckButton2State')
                this._box2CheckButton2Changed(value);

            if (command === 'settingsButtonClicked')
                this._settingsButtonClicked();
        });

        this._isReady = true;
    }

    _toggle1ButtonClicked(index) {
        if (!this._ancToggleMap || !this._modelData)
            return;

        const toggle = this._ancToggleMap[index];
        if (!toggle)
            return;

        const isSameState = (this._props.toggle1State === index);
        this._props.toggle1State = index;

        let ancMode = null;
        if (toggle.type === 'noiseCancellation') {
            this._props.optionsBoxVisible = this._config.optionsBox1?.length ? 1 : 0;

            if (toggle.matchBytes.length > 1) {
                const radioIndex = this._props.box1RadioButtonState || 1;
                let modeBytes = this._ancRadioMap[radioIndex];
                if (!modeBytes?.length) {
                    modeBytes = [toggle.matchBytes[0]];
                    this._props.box1RadioButtonState = 1;
                }
                ancMode = modeBytes;
            } else {
                ancMode = toggle.modeBytes;
            }
        } else if (toggle.type === 'transparency') {
            this._props.optionsBoxVisible = this._config.optionsBox2?.length ? 2 : 0;
            ancMode = toggle.modeBytes;
        } else {
            this._props.optionsBoxVisible = 0;
            ancMode = toggle.modeBytes;
        }

        this.dataHandler?.setProps(this._props);

        if (this._isReady && !isSameState && ancMode != null)
            this._opoBudsSocket?.setNoiseControl(ancMode);
    }

    _box1RadioButtonStateChanged(index) {
        if (!this._ancRadioMap)
            return;

        this._props.box1RadioButtonState = index;
        this.dataHandler?.setProps(this._props);

        const modeBytes = this._ancRadioMap[index];
        if (modeBytes?.length)
            this._opoBudsSocket?.setNoiseControl(modeBytes);
    }

    _box1CheckButton1Changed(value) {
        const enabled = value > 0;
        this._windNoise = enabled;
        if (this._settingsItems) {
            this._settingsItems['wind-noise'] = enabled;
            this._updateGsettings();
        }
        this._props.box1CheckButton1State = value;
        this._props.box2CheckButton2State = value;
        this.dataHandler?.setProps(this._props);
        this._opoBudsSocket?.setWindNoise(enabled);
    }

    _box2CheckButton1Changed(value) {
        const enabled = value > 0;
        this._volumeEnhancer = enabled;
        if (this._settingsItems) {
            this._settingsItems['volume-enhancer'] = enabled;
            this._updateGsettings();
        }
        this._props.box2CheckButton1State = value;
        this.dataHandler?.setProps(this._props);
        this._opoBudsSocket?.setVolumeEnhancer(enabled);
    }

    _box2CheckButton2Changed(value) {
        const enabled = value > 0;
        this._windNoise = enabled;
        if (this._settingsItems) {
            this._settingsItems['wind-noise'] = enabled;
            this._updateGsettings();
        }
        this._props.box1CheckButton1State = value;
        this._props.box2CheckButton2State = value;
        this.dataHandler?.setProps(this._props);
        this._opoBudsSocket?.setWindNoise(enabled);
    }

    _settingsButtonClicked() {
        launchConfigureWindow(this._devicePath, 'opoBuds');
    }

    updateFirmwareInfo(version) {
        this._fwVersion = version;
        if (this._settingsItems) {
            this._settingsItems['fw-version'] = version;
            this._updateGsettings();
        }
    }

    updateBatteryProps({left, right, case: cse}) {
        if (left) {
            this._props.battery1Level = left.level;
            this._props.battery1Status = left.isCharging ? 'charging' : 'discharging';
        }
        if (right) {
            this._props.battery2Level = right.level;
            this._props.battery2Status = right.isCharging ? 'charging' : 'discharging';
        }
        if (cse) {
            this._props.battery3Level = cse.level;
            this._props.battery3Status = cse.isCharging ? 'charging' : 'discharging';
        }

        if (!this._modelData?.batteryLR)
            this._props.computedBatteryLevel = this._props.battery1Level;
        else
            this._props.computedBatteryLevel = buds2to1BatteryLevel(this._props);

        if (!this._battInfoRecieved)
            this._startConfiguration(this._props);
        else
            this.dataHandler?.setProps(this._props);
    }

    updateNoiseControl(modeByte) {
        if (!this._ancToggleMap) {
            this._pendingAncMode = modeByte;
            return;
        }

        const nc = this._modelData?.noiseControl;
        if (!nc)
            return;

        let toggleIndex = 0;
        let activeType = 'off';

        for (const [index, {matchBytes, type}] of Object.entries(this._ancToggleMap)) {
            if (matchBytes.includes(modeByte)) {
                toggleIndex = Number(index);
                activeType = type;
                break;
            }
        }

        this._props.toggle1State = toggleIndex;

        if (activeType === 'noiseCancellation') {
            if (this._ancRadioReverse && this._ancRadioReverse[modeByte] !== undefined)
                this._props.box1RadioButtonState = this._ancRadioReverse[modeByte];
            this._props.optionsBoxVisible = this._config.optionsBox1?.length ? 1 : 0;
        } else if (activeType === 'transparency') {
            this._props.optionsBoxVisible = this._config.optionsBox2?.length ? 2 : 0;
        } else {
            this._props.optionsBoxVisible = 0;
        }

        this.dataHandler?.setProps(this._props);
    }

    updateInEar(inEar) {
        this._inEar = inEar;
        if (this._settingsItems) {
            this._settingsItems['inear-enable'] = this._inEar;
            this._updateGsettings();
        }
    }

    updateLatency(latency) {
        this._lowlatency = latency;
        if (this._settingsItems) {
            this._settingsItems['lowlatency'] = this._lowlatency;
            this._updateGsettings();
        }
    }

    updateDualConnection(dual) {
        this._dualConnection = dual;
        if (this._settingsItems) {
            this._settingsItems['dual-connection'] = this._dualConnection;
            this._updateGsettings();
        }
    }

    updateWindNoise(windNoise) {
        if (!this._modelData) {
            this._pendingWindNoise = windNoise;
            return;
        }
        this._windNoise = windNoise;
        if (this._settingsItems) {
            this._settingsItems['wind-noise'] = this._windNoise;
            this._updateGsettings();
        }
        this._props.box1CheckButton1State = windNoise ? 1 : 0;
        this._props.box2CheckButton2State = windNoise ? 1 : 0;
        this.dataHandler?.setProps(this._props);
    }

    updateVolumeEnhancer(volumeEnhancer) {
        if (!this._modelData) {
            this._pendingVolumeEnhancer = volumeEnhancer;
            return;
        }
        this._volumeEnhancer = volumeEnhancer;
        if (this._settingsItems) {
            this._settingsItems['volume-enhancer'] = this._volumeEnhancer;
            this._updateGsettings();
        }
        this._props.box2CheckButton1State = volumeEnhancer ? 1 : 0;
        this.dataHandler?.setProps(this._props);
    }

    updateSpatialAudio(spatial) {
        this._spatial = spatial;
        if (this._settingsItems) {
            this._settingsItems['spatial'] = this._spatial;
            this._updateGsettings();
        }
    }

    updateHighRes(highRes) {
        this._highRes = highRes;
        if (this._settingsItems) {
            this._settingsItems['high-res'] = this._highRes;
            this._updateGsettings();
        }
    }

    updateDynamicBass(dynamicBass) {
        this._dynamicBass = dynamicBass;
        if (this._settingsItems) {
            this._settingsItems['dynamic-bass'] = this._dynamicBass;
            this._updateGsettings();
        }
    }

    updateAutoAnswer(autoAnswer) {
        this._autoAnswer = autoAnswer;
        if (this._settingsItems) {
            this._settingsItems['auto-answer'] = this._autoAnswer;
            this._updateGsettings();
        }
    }

    updateFindPhone(findPhone) {
        this._findPhone = findPhone;
        if (this._settingsItems) {
            this._settingsItems['find-phone'] = this._findPhone;
            this._updateGsettings();
        }
    }

    updateEqPreset(preset) {
        this._eqPreset = preset;
        if (this._settingsItems) {
            this._settingsItems['eq-preset'] = this._eqPreset;
            this._updateGsettings();
        }
    }

    _buildPlaceholderGesturesHex() {
        const gesturesConfig = this._modelData?.gestureOptions;
        if (!gesturesConfig)
            return '';

        let hex = '';
        gesturesConfig.slots.forEach(slot => {
            const gestureDef = gesturesConfig.gestures[slot.type];
            if (!gestureDef?.actions?.length)
                return;

            const firstAction = gestureDef.actions[0];
            const func = gesturesConfig.mapping.actions[firstAction]?.[0] ?? 0;
            const btnId = slot.buttonId ?? 0x01;
            const act = gesturesConfig.mapping.gestureTypes[slot.type];

            hex += slot.device.toString(16).padStart(2, '0');
            hex += btnId.toString(16).padStart(2, '0');
            hex += act.toString(16).padStart(2, '0');
            hex += func.toString(16).padStart(2, '0');
        });
        return hex;
    }

    _findChangedGestureSlot(oldHex, newHex) {
        if (!newHex)
            return null;

        const baseHex = oldHex ?? this._buildPlaceholderGesturesHex();

        for (let i = 0; i < newHex.length; i += 8) {
            const baseChunk = baseHex.slice(i, i + 8);
            const newChunk = newHex.slice(i, i + 8);
            if (baseChunk !== newChunk && newChunk.length === 8)
                return {
                    device: parseInt(newChunk.slice(0, 2), 16),
                    buttonId: parseInt(newChunk.slice(2, 4), 16),
                    gestureType: parseInt(newChunk.slice(4, 6), 16),
                    action: parseInt(newChunk.slice(6, 8), 16),
                };
        }

        return null;
    }

    updateGestures(gesturesHex) {
        this._gestures = gesturesHex;
        if (this._settingsItems) {
            this._settingsItems['gestures'] = this._gestures;
            this._updateGsettings();
        }
    }

    updateSingleGesture(dev, btn, act, func) {
        if (!this._settingsItems || !this._settingsItems['gestures']) {
            this._opoBudsSocket?._getGestures();
            return;
        }

        const devHex = dev.toString(16).padStart(2, '0');
        const btnHex = btn.toString(16).padStart(2, '0');
        const actHex = act.toString(16).padStart(2, '0');
        const funcHex = func.toString(16).padStart(2, '0');

        const hex = this._settingsItems['gestures'];
        let updated = false;
        let newHex = '';

        for (let i = 0; i < hex.length; i += 8) {
            const chunkDev = hex.slice(i, i + 2);
            const chunkBtn = hex.slice(i + 2, i + 4);
            const chunkAct = hex.slice(i + 4, i + 6);

            if (chunkDev === devHex && chunkBtn === btnHex && chunkAct === actHex) {
                newHex += chunkDev + chunkBtn + chunkAct + funcHex;
                updated = true;
            } else {
                newHex += hex.slice(i, i + 8);
            }
        }

        if (updated) {
            this._gestures = newHex;
            this._settingsItems['gestures'] = newHex;
            this._updateGsettings();
        } else {
            this._opoBudsSocket?._getGestures();
        }
    }

    destroy() {
        if (this._settingsHandlerId) {
            this._settings?.disconnect(this._settingsHandlerId);
            this._settingsHandlerId = null;
        }

        if (this._dataHandlerId) {
            this.dataHandler?.disconnect(this._dataHandlerId);
            this._dataHandlerId = null;
        }

        this.dataHandler = null;
        this._opoBudsSocket?.destroy();
        this._opoBudsSocket = null;
    }
});
