'use strict';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {createLogger, getDeviceIdentifier} from '../logger.js';
import {
    buds2to1BatteryLevel, validateProperties, launchConfigureWindow
} from '../deviceUtils.js';
import {createConfig, createProperties, DataHandler} from '../../dataHandler.js';
import {OpoBudsSocket} from './opoBudsSocket.js';
import {
    safeJsonParse, buildPlaceholderGesturesHex, findChangedGestureSlots, updateGestureSlotInHex
} from './opoBudsConfig.js';

export const DeviceTypeOpoBuds = 'opoBuds';

const OpoBudsUUID = '0000079a-d102-11e1-9b23-00025b00a5a5';

const SIMPLE_FEATURE_MAP = [
    { key: 'eq-preset', flags: ['eqPreset'], prop: '_eqPreset', fn: (s, v) => s.setEqPreset(v) },
    { key: 'inear-enable', flags: ['inEarDetection'], prop: '_inEar', fn: (s, v) => s.setInEar(v) },
    { key: 'lowlatency', flags: ['lowLatencyMode'], prop: '_lowlatency', fn: (s, v) => s.setLatency(v) },
    { key: 'dual-connection', flags: ['dualConnection'], prop: '_dualConnection', fn: (s, v) => s.setDualConnection(v) },
    { key: 'wind-noise', flags: ['windNoiseReduction'], prop: '_windNoise', fn: (s, v) => s.setWindNoise(v) },
    { key: 'volume-enhancer', flags: ['volumeEnhancer'], prop: '_volumeEnhancer', fn: (s, v) => s.setVolumeEnhancer(v) },
    { key: 'spatial', flags: ['spatialAudio'], prop: '_spatial', fn: (s, v) => s.setSpatialAudio(v) },
    { key: 'high-res', flags: ['highResAudio'], prop: '_highRes', fn: (s, v) => s.setHighRes(v) },
    { key: 'dynamic-bass', flags: ['dynamicBass'], prop: '_dynamicBass', fn: (s, v) => s.setDynamicBass(v) },
    { key: 'auto-answer', flags: ['autoAnswer'], prop: '_autoAnswer', fn: (s, v) => s.setAutoAnswer(v) },
    { key: 'find-phone', flags: ['findMyPhone'], prop: '_findPhone', fn: (s, v) => s.setFindPhone(v) },
    { key: 'ring-state', flags: ['ring'], prop: '_ringState', fn: (s, v) => s.setFindBuds(v) },
];

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
        this._config = createConfig();
        this._props = createProperties();
        this._modelData = null;
        this._lastMultiDeviceOpTs = 0;
        this._lastFitTestOpTs = 0;

        this._callbacks = {
            modelInitialized: this.modelInitialized.bind(this),
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
            updateMultiConnectDevices: this.updateMultiConnectDevices.bind(this),
            updateAdaptiveAncSubLevel: this.updateAdaptiveAncSubLevel.bind(this),
            updateNoiseControlCycle: this.updateNoiseControlCycle.bind(this),
            updateFitTestResult: this.updateFitTestResult.bind(this),
            updateCustomEqs: this.updateCustomEqs.bind(this),
        };

        const profile = {type: DeviceTypeOpoBuds, uuid: OpoBudsUUID};

        this._opoBudsSocket = new OpoBudsSocket(
            devicePath,
            profileManager,
            profile,
            this._callbacks
        );

        this._battInfoReceived = false;
        this._pendingAncMode = null;
        this._pendingWindNoise = null;
        this._pendingVolumeEnhancer = null;
        this._isReady = false;
        this._customEqList = [];
        this._lastCustomEqOpTs = 0;
    }

    modelInitialized(modelData) {
        this._modelData = modelData;

        this._log.info(`Configuration: ${JSON.stringify(this._modelData, null, 2)}`);

        this._commonIcon = this._modelData.budsIcon ?? 'earbuds-stem';
        if (this._modelData.batteryCase)
            this._caseIcon = `${this._modelData.case ?? 'case-round'}`;

        this._createDefaultSettings();

        const devicesList = this._settings.get_strv('opo-buds-list').map(safeJsonParse).filter(Boolean);

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

        if (this._pendingAncMode != null) {
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

        this._isReady = true;
        this._log.info('OpoBudsDevice is ready.');
    }

    _createDefaultSettings() {
        this._defaultsDeviceSettings = {
            'path': this._devicePath,
            'modelid': this._modelData.modelId,
            'alias': this._alias,
            'icon': this._commonIcon,
            'fw-version': this._fwVersion,

            ...(this._modelData.batteryCase ? {'case': this._caseIcon} : {}),
            ...(this._modelData.eqPreset ? {'eq-preset': Object.values(this._modelData.eqPreset)[0] ?? 0} : {}),
            ...(this._modelData.eqPreset ? {'custom-eq-list': [], 'custom-eq-op': null} : {}),
            ...(this._modelData.inEarDetection ? {'inear-enable': false} : {}),
            ...(this._modelData.lowLatencyMode ? {'lowlatency': false} : {}),
            ...(this._modelData.dualConnection ? {
                'dual-connection': false,
                'audio-priority-mac': '',
                'multi-device-op': null,
            } : {}),
            ...((this._modelData.windNoiseReduction) ? {'wind-noise': false} : {}),
            ...(this._modelData.volumeEnhancer ? {'volume-enhancer': false} : {}),
            ...(this._modelData.fitTest ? {'fit-test-op': null} : {}),
            ...(this._modelData.spatialAudio ? {'spatial': false} : {}),
            ...(this._modelData.highResAudio ? {'high-res': false} : {}),
            ...(this._modelData.dynamicBass ? {
                'dynamic-bass': false,
                'dynamic-audio-low': 0,
                'dynamic-audio-med': 0,
                'dynamic-audio-high': 0,
            } : {}),
            ...(this._modelData.gestureOptions ? {'gestures': ''} : {}),
            ...(this._modelData.ring ? {'ring-state': 'stopped'} : {}),
            ...(this._modelData.autoAnswer ? {'auto-answer': false} : {}),
            ...(this._modelData.findMyPhone ? {'find-phone': false} : {}),
            ...(this._modelData.noiseControl ? {'nc-cycle-mask': 0x0B} : {}),
        };
    }

    _updateInitialValues() {
        const devicesList = this._settings.get_strv('opo-buds-list').map(safeJsonParse).filter(Boolean);
        const index = devicesList.findIndex(item => item.path === this._devicePath);
        if (index === -1)
            return;

        this._settingsItems = devicesList[index];

        this._commonIcon = this._settingsItems['icon'];

        if (this._modelData.batteryCase)
            this._caseIcon = this._settingsItems['case'];

        if (this._modelData.eqPreset)
            this._eqPreset = this._settingsItems['eq-preset'];

        if (this._modelData.eqPreset) {
            this._customEqList = this._settingsItems['custom-eq-list'] ?? [];
            this._lastCustomEqOpTs = this._settingsItems['custom-eq-op']?.ts ?? 0;
        }

        if (this._modelData.inEarDetection)
            this._inEar = this._settingsItems['inear-enable'];

        if (this._modelData.lowLatencyMode)
            this._lowlatency = this._settingsItems['lowlatency'];

        if (this._modelData.dualConnection) {
            this._dualConnection = this._settingsItems['dual-connection'];
            this._audioPriorityMac = this._settingsItems['audio-priority-mac'];
            this._lastMultiDeviceOpTs = this._settingsItems['multi-device-op']?.ts ?? 0;
        }

        if (this._modelData.fitTest)
            this._lastFitTestOpTs = this._settingsItems['fit-test-op']?.ts ?? 0;

        if (this._modelData.windNoiseReduction)
            this._windNoise = this._settingsItems['wind-noise'];

        if (this._modelData.volumeEnhancer)
            this._volumeEnhancer = this._settingsItems['volume-enhancer'];

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

        if (this._modelData.noiseControl)
            this._ncCycleMask = this._settingsItems['nc-cycle-mask'] ?? 0x0B;
    }

    _addPropsToSettings(devicesList) {
        devicesList.push(this._defaultsDeviceSettings);
        this._settings.set_strv('opo-buds-list', devicesList.map(JSON.stringify));
    }

    _monitorOpoBudsListGsettings() {
        this._settingsHandlerId = this._settings?.connect('changed::opo-buds-list', () => {
            if (this._ignoreGsettingsChange)
                return;

            try {
                const devicesList = this._settings.get_strv('opo-buds-list').map(safeJsonParse).filter(Boolean);
                const index = devicesList.findIndex(item => item.path === this._devicePath);
                if (index === -1)
                    return;

                this._settingsItems = devicesList[index];

                // 1. Common & Case Icons
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

                // 2. Declarative 1-to-1 feature mapping
                for (const item of SIMPLE_FEATURE_MAP) {
                    const isConfigured = item.flags.some(flag => this._modelData[flag]);
                    if (isConfigured) {
                        const val = this._settingsItems[item.key];
                        if (this[item.prop] !== val) {
                            this[item.prop] = val;
                            if (this._opoBudsSocket) {
                                // Custom EQ presets are applied by re-sending their recorded
                                // band gains rather than the plain preset switch opcode.
                                if (item.key === 'eq-preset') {
                                    const custom = this._customEqList.find(e => e.eqId === val);
                                    if (custom)
                                        this._opoBudsSocket.modifyCustomEq(custom.eqId, {
                                            name: custom.name,
                                            min: custom.min,
                                            max: custom.max,
                                            freqs: custom.freqs,
                                            dbs: custom.dbs,
                                        });
                                    else
                                        item.fn(this._opoBudsSocket, val);
                                } else {
                                    item.fn(this._opoBudsSocket, val);
                                }
                            }

                            // When Dynamic Bass is enabled, immediately push the stored slider values
                            if (item.key === 'dynamic-bass' && val === true) {
                                this._opoBudsSocket?.setDynamicAudioEq(
                                    this._dynamicAudioLow ?? 0,
                                    this._dynamicAudioMed ?? 0,
                                    this._dynamicAudioHigh ?? 0
                                );
                            }
                        }
                    }
                }

                // 3. Multi-device operations
                if (this._modelData.dualConnection) {
                    const multiDeviceOp = this._settingsItems['multi-device-op'];
                    if (multiDeviceOp && multiDeviceOp.ts !== this._lastMultiDeviceOpTs) {
                        this._lastMultiDeviceOpTs = multiDeviceOp.ts;
                        if (multiDeviceOp.op === 'refresh' || multiDeviceOp.op === 0xFF)
                            this._opoBudsSocket?.getMultiConnectInfo();
                        else
                            this._opoBudsSocket?.operateMultiConnect(multiDeviceOp.op, multiDeviceOp.mac);
                    }
                }

                // 4. Earbud Fit Test operations
                if (this._modelData.fitTest) {
                    const fitTestOp = this._settingsItems['fit-test-op'];
                    if (fitTestOp && fitTestOp.ts !== this._lastFitTestOpTs) {
                        this._lastFitTestOpTs = fitTestOp.ts;
                        if (fitTestOp.action === 'start')
                            this._opoBudsSocket?.startFitTest();
                        else if (fitTestOp.action === 'stop')
                            this._opoBudsSocket?.stopFitTest();
                    }
                }

                // 5. Dynamic Audio EQ (3-band sliders) - only send if dynamic bass is enabled
                if (this._modelData.dynamicBass) {
                    const low = this._settingsItems['dynamic-audio-low'] ?? 0;
                    const med = this._settingsItems['dynamic-audio-med'] ?? 0;
                    const high = this._settingsItems['dynamic-audio-high'] ?? 0;
                    const changed = this._dynamicAudioLow !== low || this._dynamicAudioMed !== med || this._dynamicAudioHigh !== high;
                    if (changed) {
                        this._dynamicAudioLow = low;
                        this._dynamicAudioMed = med;
                        this._dynamicAudioHigh = high;
                        if (this._dynamicBass)
                            this._opoBudsSocket?.setDynamicAudioEq(low, med, high);
                    }
                }

                // 6. Gestures slot change detection (multi-slot support)
                if (this._modelData.gestureOptions) {
                    const gestures = this._settingsItems['gestures'];
                    if (gestures && this._gestures !== gestures) {
                        const changedSlots = findChangedGestureSlots(this._gestures, gestures, this._modelData.gestureOptions);
                        this._gestures = gestures;
                        if (changedSlots.length > 0)
                            this._opoBudsSocket?.setGestureSlots(changedSlots);
                    }
                }

                // 7. Noise Control cycle mask
                if (this._modelData.noiseControl) {
                    const ncCycleMask = this._settingsItems['nc-cycle-mask'] ?? 0x0B;
                    if (this._ncCycleMask !== ncCycleMask) {
                        this._ncCycleMask = ncCycleMask;
                        this._opoBudsSocket?.setNoiseControlCycle(ncCycleMask);
                    }
                }

                // 8. Custom EQ operations
                if (this._modelData.eqPreset) {
                    const customEqOp = this._settingsItems['custom-eq-op'];
                    if (customEqOp && customEqOp.ts !== this._lastCustomEqOpTs) {
                        this._lastCustomEqOpTs = customEqOp.ts;
                        const eqId = customEqOp.eqId;
                        const eqData = {
                            name: customEqOp.name ?? '',
                            min: customEqOp.min ?? -6,
                            max: customEqOp.max ?? 6,
                            freqs: customEqOp.freqs ?? [],
                            dbs: customEqOp.dbs ?? [],
                        };
                        switch (customEqOp.action) {
                            case 'add':
                                this._opoBudsSocket?.addCustomEq(eqId, eqData);
                                break;
                            case 'modify':
                                this._opoBudsSocket?.modifyCustomEq(eqId, eqData);
                                break;
                            case 'delete':
                                this._opoBudsSocket?.deleteCustomEq(eqId, eqData);
                                break;
                            case 'select':
                                if (eqData.dbs.length > 0)
                                    this._opoBudsSocket?.modifyCustomEq(eqId, eqData);
                                break;
                            case 'list':
                                this._opoBudsSocket?.getCustomEqInfo();
                                break;
                            default:
                                this._log.warn(`Unknown custom EQ op action: ${customEqOp.action}`);
                                break;
                        }
                    }
                }
            } catch (e) {
                this._log.error(`OpoBudsDevice: GSettings monitor error: ${e.message}`);
            }
        });
    }

    _updateSettingKey(key, value) {
        if (!this._settings || !this._devicePath)
            return;

        if (this._settingsItems && this._settingsItems[key] === value)
            return;

        if (this._settingsItems)
            this._settingsItems[key] = value;

        this._ignoreGsettingsChange = true;
        try {
            const list = this._settings.get_strv('opo-buds-list').map(safeJsonParse).filter(Boolean);
            const index = list.findIndex(d => d.path === this._devicePath);
            if (index !== -1) {
                list[index][key] = value;
                this._settings.set_strv('opo-buds-list', list.map(JSON.stringify));
            }
        } catch (e) {
            this._log.error(`_updateSettingKey error (${key}): ${e.message}`);
        }
        this._ignoreGsettingsChange = false;
    }

    _updateGsettings() {
        this._ignoreGsettingsChange = true;

        const currentList = this._settings.get_strv('opo-buds-list').map(safeJsonParse).filter(Boolean);
        const index = currentList.findIndex(d => d.path === this._devicePath);

        if (index !== -1) {
            currentList[index] = this._settingsItems;
            this._settings.set_strv('opo-buds-list', currentList.map(JSON.stringify));
        }

        this._ignoreGsettingsChange = false;
    }

    _updateSimpleSetting(prop, key, value) {
        if (this[prop] === value)
            return;

        this[prop] = value;
        this._updateSettingKey(key, value);
    }

    _updateIcons() {
        this._config.commonIcon = this._commonIcon;
        this._config.albumArtIcon = this._commonIcon;
        this._config.showSettingsButton = true;
        this._config.labelIndicatorEnabled = 1;
        this._props.labelIndicator1 = '';

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
            if (typeof entry === 'number')
                return [entry];
            if (entry?.byte !== undefined)
                return [entry.byte];
            return [];
        };

        if (nc.off)
            addToggle('off', toBytes(nc.off), 'bbm-anc-off-symbolic', _('Off'));

        if (nc.transparency) {
            let transDefault = [];
            const transMatch = [];
            if (nc.transparency.levels) {
                const transLevels = nc.transparency.levels;
                const keys = Object.keys(transLevels);
                keys.forEach(k => {
                    const b = toBytes(transLevels[k]);
                    if (transDefault.length === 0 && b.length > 0)
                        transDefault = b;
                    transMatch.push(...b);
                });
            } else {
                transDefault = toBytes(nc.transparency);
                transMatch.push(...transDefault);
            }
            addToggle('transparency', transDefault,
                'bbm-transperancy-symbolic', _('Transparency'), transMatch);
        }

        if (nc.noiseCancellation) {
            const flatBytes = [];
            this._ancRadioMap = {};
            this._ancRadioReverse = {};

            if (nc.noiseCancellation.levels) {
                const levelsObj = nc.noiseCancellation.levels;
                const levelKeys = Object.keys(levelsObj);

                const levelNames = {
                    'smart': _('Smart'),
                    'auto': _('Auto'),
                    'mild': _('Mild'),
                    'low': _('Low'),
                    'moderate': _('Moderate'),
                    'mid': _('Moderate'),
                    'deep': _('Max'),
                    'high': _('High'),
                    'max': _('Max'),
                };

                const radioNames = [];
                let firstLevelBytes = [];
                levelKeys.forEach((key, idx) => {
                    const num = idx + 1;
                    const displayName = levelNames[key] ??
                        (key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '));
                    radioNames.push(displayName);
                    const modeBytes = toBytes(levelsObj[key]);
                    if (firstLevelBytes.length === 0 && modeBytes.length > 0)
                        firstLevelBytes = modeBytes;
                    this._ancRadioMap[num] = modeBytes;
                    modeBytes.forEach(b => {
                        this._ancRadioReverse[b] = num;
                    });
                    flatBytes.push(...modeBytes);
                });

                this._config.box1RadioButton = radioNames;
                this._config.box1RadioTitle = _('Noise Cancellation Level');
                addToggle('noiseCancellation', firstLevelBytes.length ? firstLevelBytes : flatBytes,
                    'bbm-anc-on-symbolic', _('Noise Cancellation'), flatBytes);
            } else if (nc.noiseCancellation.byte !== undefined) {
                flatBytes.push(nc.noiseCancellation.byte);
                addToggle('noiseCancellation', flatBytes, 'bbm-anc-on-symbolic', _('Noise Cancellation'),
                    flatBytes);
            } else {
                flatBytes.push(...toBytes(nc.noiseCancellation));
                addToggle('noiseCancellation', flatBytes, 'bbm-anc-on-symbolic', _('Noise Cancellation'),
                    flatBytes);
            }
        }

        this._config.optionsBox1 = [];
        if (nc.noiseCancellation?.levels)
            this._config.optionsBox1.push('radio-button');
        if (this._modelData.windNoiseReduction) {
            this._config.optionsBox1.push('check-button');
            this._config.box1CheckButton = [_('Smart Wind Noise Reduction')];
        }

        this._config.optionsBox2 = [];
        this._box2Map = [];
        const box2Labels = [];
        if (this._modelData.volumeEnhancer) {
            box2Labels.push(_('Enhance Voice'));
            this._box2Map.push('volumeEnhancer');
        }
        if (this._modelData.windNoiseReduction) {
            box2Labels.push(_('Smart Wind Noise Reduction'));
            this._box2Map.push('windNoise');
        }

        if (box2Labels.length > 0) {
            this._config.optionsBox2.push('check-button');
            this._config.box2CheckButton = box2Labels;
        }

        if (this._config.box1RadioButton?.length && !this._props.box1RadioButtonState)
            this._props.box1RadioButtonState = 1;

        if (this._box2Map?.length) {
            this._box2Map.forEach((feat, idx) => {
                const val = feat === 'volumeEnhancer' ? (this._volumeEnhancer ? 1 : 0) : (this._windNoise ? 1 : 0);
                if (idx === 0)
                    this._props.box2CheckButton1State = val;
                else if (idx === 1)
                    this._props.box2CheckButton2State = val;
            });
        }

        if (this._modelData.windNoiseReduction)
            this._props.box1CheckButton1State = this._windNoise ? 1 : 0;

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

        this._battInfoReceived = true;

        if (this._modelData.noiseControl)
            this._props.toggle1Visible = true;

        if (this.dataHandler) {
            this.dataHandler.setProps(this._props);
            return;
        }

        this.dataHandler = new DataHandler(this._config, this._props);
        this.updateDeviceMapCb(this._devicePath, this.dataHandler);

        this._dataHandlerId = this.dataHandler.connect('ui-action', (o, command, value) => {
            try {
                this._log.info(`ui-action received: command=${command}, value=${value}`);
                if (command === 'toggle1State')
                    this._toggle1ButtonClicked(value);
                else if (command === 'box1RadioButtonState')
                    this._box1RadioButtonStateChanged(value);
                else if (command === 'box1CheckButton1State')
                    this._box1CheckButton1Changed(value);
                else if (command === 'box2CheckButton1State')
                    this._box2CheckButton1Changed(value);
                else if (command === 'box2CheckButton2State')
                    this._box2CheckButton2Changed(value);
                else if (command === 'settingsButtonClicked')
                    this._settingsButtonClicked();
            } catch (e) {
                this._log.error(`Error in ui-action (${command}): ${e.message}\n${e.stack}`);
            }
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
                let radioIndex = this._props.box1RadioButtonState || 1;
                this._props.box1RadioButtonState = radioIndex;
                let modeBytes = this._ancRadioMap?.[radioIndex] || [toggle.matchBytes[0]];
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

        this._updateLabelIndicator();

        if (this._isReady && !isSameState && ancMode != null)
            this._opoBudsSocket?.setNoiseControl(ancMode);
    }

    _box1RadioButtonStateChanged(index) {
        if (!this._ancRadioMap)
            return;

        this._props.box1RadioButtonState = index;
        this._updateLabelIndicator();

        const modeBytes = this._ancRadioMap[index];
        if (modeBytes?.length)
            this._opoBudsSocket?.setNoiseControl(modeBytes);
    }

    _box1CheckButton1Changed(value) {
        const enabled = value > 0;
        this._windNoise = enabled;
        this._updateSettingKey('wind-noise', enabled);
        this._props.box1CheckButton1State = value;
        if (this._box2Map) {
            const idx = this._box2Map.indexOf('windNoise');
            if (idx === 0)
                this._props.box2CheckButton1State = value;
            else if (idx === 1)
                this._props.box2CheckButton2State = value;
        }
        this.dataHandler?.setProps(this._props);
        this._opoBudsSocket?.setWindNoise(enabled);
    }

    _handleBox2Checkbox(index, value) {
        const feature = this._box2Map?.[index];
        if (!feature)
            return;

        const enabled = value > 0;
        if (feature === 'volumeEnhancer') {
            this._volumeEnhancer = enabled;
            this._updateSettingKey('volume-enhancer', enabled);
            if (index === 0)
                this._props.box2CheckButton1State = value;
            else if (index === 1)
                this._props.box2CheckButton2State = value;
            this.dataHandler?.setProps(this._props);
            this._opoBudsSocket?.setVolumeEnhancer(enabled);
        } else if (feature === 'windNoise') {
            this._windNoise = enabled;
            this._updateSettingKey('wind-noise', enabled);
            this._props.box1CheckButton1State = value;
            if (index === 0)
                this._props.box2CheckButton1State = value;
            else if (index === 1)
                this._props.box2CheckButton2State = value;
            this.dataHandler?.setProps(this._props);
            this._opoBudsSocket?.setWindNoise(enabled);
        }
    }

    _box2CheckButton1Changed(value) {
        this._handleBox2Checkbox(0, value);
    }

    _box2CheckButton2Changed(value) {
        this._handleBox2Checkbox(1, value);
    }

    _settingsButtonClicked() {
        launchConfigureWindow(this._devicePath, 'opoBuds');
    }

    updateFirmwareInfo(version) {
        this._updateSimpleSetting('_fwVersion', 'fw-version', version);
    }

    updateMultiConnectDevices(devices) {
        this._updateSimpleSetting('_multiDevices', 'multi-devices', devices);
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

        if (!this._modelData?.batteryLR) {
            const primary = left ?? right ?? cse;
            if (primary) {
                this._props.battery1Level = primary.level;
                this._props.battery1Status = primary.isCharging ? 'charging' : 'discharging';
            }
            this._props.computedBatteryLevel = this._props.battery1Level ?? 0;
        } else {
            this._props.computedBatteryLevel = buds2to1BatteryLevel(this._props);
        }

        if (!this._battInfoReceived)
            this._startConfiguration(this._props);
        else
            this.dataHandler?.setProps(this._props);
    }

    updateNoiseControl(mode) {
        if (!this._ancToggleMap) {
            this._pendingAncMode = mode;
            return;
        }

        const nc = this._modelData?.noiseControl;
        if (!nc)
            return;

        const modeArr = Array.isArray(mode) ? mode : [mode];
        const lastByte = modeArr[modeArr.length - 1];

        let toggleIndex = 0;
        let activeType = 'off';

        for (const [index, {matchBytes, type}] of Object.entries(this._ancToggleMap)) {
            const matched = modeArr.some(b => matchBytes.includes(b)) ||
                matchBytes.some(b => modeArr.includes(b));
            if (matched) {
                toggleIndex = Number(index);
                activeType = type;
                break;
            }
        }

        this._props.toggle1State = toggleIndex;

        if (activeType === 'noiseCancellation') {
            if (this._ancRadioReverse && this._ancRadioReverse[lastByte] !== undefined)
                this._props.box1RadioButtonState = this._ancRadioReverse[lastByte];
            else if (!this._props.box1RadioButtonState)
                this._props.box1RadioButtonState = 1;
            this._props.optionsBoxVisible = this._config.optionsBox1?.length ? 1 : 0;
        } else if (activeType === 'transparency') {
            this._props.optionsBoxVisible = this._config.optionsBox2?.length ? 2 : 0;
        } else {
            this._props.optionsBoxVisible = 0;
        }

        this._updateLabelIndicator();
    }

    updateNoiseControlCycle(maskByte) {
        this._updateSimpleSetting('_ncCycleMask', 'nc-cycle-mask', maskByte);
    }

    _updateLabelIndicator() {
        const toggle = this._ancToggleMap?.[this._props.toggle1State];
        const isAnc = toggle?.type === 'noiseCancellation';
        const isSmart = this._props.box1RadioButtonState === 1;

        const hasSmartLevel = this._modelData.noiseControl?.noiseCancellation?.levels?.smart ||
            this._modelData.noiseControl?.noiseCancellation?.levels?.auto;

        if (isAnc && isSmart && hasSmartLevel) {
            const sub = this._smartSubName ?? '';
            this._props.labelIndicator1 = sub ? `${_('Adaptive')}: ${sub}` : _('Adaptive');
        } else {
            this._props.labelIndicator1 = '';
        }
        this.dataHandler?.setProps(this._props);
    }

    updateAdaptiveAncSubLevel(subByte) {
        const subNames = {
            0x04: _('Mild'),
            0x10: _('Moderate'),
            0x08: _('Max (Deep)'),
        };
        const subName = subNames[subByte] ?? '';
        this._log.info(`Real-Time Adaptive ANC Level: ${subName} (0x${subByte.toString(16)})`);
        this._smartSubName = subName;
        if (subName && this._settingsItems)
            this._updateSettingKey('smart-anc-sublevel', subName);
        this._updateLabelIndicator();
    }

    updateInEar(inEar) {
        this._updateSimpleSetting('_inEar', 'inear-enable', inEar);
    }

    updateLatency(latency) {
        this._updateSimpleSetting('_lowlatency', 'lowlatency', latency);
    }

    updateDualConnection(dual) {
        this._updateSimpleSetting('_dualConnection', 'dual-connection', dual);
    }

    updateWindNoise(windNoise) {
        if (!this._modelData) {
            this._pendingWindNoise = windNoise;
            return;
        }
        this._windNoise = windNoise;
        this._updateSettingKey('wind-noise', this._windNoise);
        this._props.box1CheckButton1State = windNoise ? 1 : 0;
        if (this._box2Map) {
            const idx = this._box2Map.indexOf('windNoise');
            if (idx === 0)
                this._props.box2CheckButton1State = windNoise ? 1 : 0;
            else if (idx === 1)
                this._props.box2CheckButton2State = windNoise ? 1 : 0;
        }
        this.dataHandler?.setProps(this._props);
    }

    updateVolumeEnhancer(volumeEnhancer) {
        if (!this._modelData) {
            this._pendingVolumeEnhancer = volumeEnhancer;
            return;
        }
        this._volumeEnhancer = volumeEnhancer;
        this._updateSettingKey('volume-enhancer', this._volumeEnhancer);
        if (this._box2Map) {
            const idx = this._box2Map.indexOf('volumeEnhancer');
            if (idx === 0)
                this._props.box2CheckButton1State = volumeEnhancer ? 1 : 0;
            else if (idx === 1)
                this._props.box2CheckButton2State = volumeEnhancer ? 1 : 0;
        }
        this.dataHandler?.setProps(this._props);
    }

    updateSpatialAudio(spatial) {
        this._updateSimpleSetting('_spatial', 'spatial', spatial);
    }

    updateHighRes(highRes) {
        this._updateSimpleSetting('_highRes', 'high-res', highRes);
    }

    updateDynamicBass(dynamicBass) {
        this._updateSimpleSetting('_dynamicBass', 'dynamic-bass', dynamicBass);
    }

    updateAutoAnswer(autoAnswer) {
        this._updateSimpleSetting('_autoAnswer', 'auto-answer', autoAnswer);
    }

    updateFindPhone(findPhone) {
        this._updateSimpleSetting('_findPhone', 'find-phone', findPhone);
    }

    updateEqPreset(preset) {
        this._updateSimpleSetting('_eqPreset', 'eq-preset', preset);
    }

    updateCustomEqs(entries) {
        if (!this._modelData?.eqPreset)
            return;

        this._customEqList = Array.isArray(entries) ? entries : [];
        this._updateSettingKey('custom-eq-list', this._customEqList);

        if (this._customEqList.length > 0)
            this._log.info(`Custom EQ list updated (${this._customEqList.length} entries)`);

        const selected = this._customEqList.find(e => e.selected);
        if (selected)
            this._updateSettingKey('eq-preset', selected.eqId);
    }

    updateGestures(gesturesHex) {
        this._updateSimpleSetting('_gestures', 'gestures', gesturesHex);
    }

    updateSingleGesture(dev, btn, act, func) {
        if (!this._settingsItems || !this._settingsItems['gestures'])
            return;

        const hex = this._settingsItems['gestures'];
        const newHex = updateGestureSlotInHex(hex, dev, btn, act, func);

        if (newHex !== hex) {
            this._gestures = newHex;
            this._updateSettingKey('gestures', newHex);
        }
    }

    updateFitTestResult(result) {
        this._log.info(`Update Fit Test Result: left=${result?.left}, right=${result?.right}`);
        this._fitTestResult = result;
        if (this._modelData?.fitTest && this._settingsItems)
            this._updateSettingKey('fit-test-result', result);
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
