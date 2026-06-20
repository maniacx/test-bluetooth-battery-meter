'use strict';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {createLogger, getDeviceIdentifier, hexBytes} from '../logger.js';
import {
    buds2to1BatteryLevel, validateProperties, launchConfigureWindow, isArrayEqual
} from '../deviceUtils.js';
import {createConfig, createProperties, DataHandler} from '../../dataHandler.js';
import {OpoBudsSocket} from './opoBudsSocket.js';

export const DeviceTypeOpoBuds = 'opoBuds';

const OpoBudsUUID = '0000079a-d102-11e1-9b23-00025b00a5a5';
export function isOpoBuds(bluezDeviceProxy, uuids) {
    const bluezProps = [];
    const supported = uuids.includes(OpoBudsUUID) ? 'yes' : 'no';
    return {supported, bluezProps};
}

function isEqArrayEqual(a, b) {
    if (a === b)
        return true;

    if (!a || !b || a.length !== b.length)
        return false;

    const bMap = new Map(b.map(eq => [eq.eqId, eq]));

    for (const eq of a) {
        const other = bMap.get(eq.eqId);

        if (!other)
            return false;

        if (eq.name !== other.name ||
            eq.sel !== other.sel ||
            eq.min !== other.min ||
            eq.max !== other.max ||
            !isArrayEqual(eq.freq, other.freq) ||
            !isArrayEqual(eq.gain, other.gain))
            return false;
    }

    return true;
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

        this._config = createConfig();
        this._props = createProperties();
        this._modelData = null;
        this._fwVersion = '';

        this._callbacks = {
            modelIntialized: this.modelIntialized.bind(this),
            updateFirmware: this.updateFirmware.bind(this),
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateInEarState: this.updateInEarState.bind(this),
            updateNoiseControl: this.updateNoiseControl.bind(this),
            updateEqPreset: this.updateEqPreset.bind(this),
            updateCustomEq: this.updateCustomEq.bind(this),
            updateGesture: this.updateGesture.bind(this),
            updateLongGestures: this.updateLongGestures.bind(this),
        };

        const profile = {type: DeviceTypeOpoBuds, uuid: OpoBudsUUID};

        this._opoBudsSocket = new OpoBudsSocket(
            this._devicePath,
            profileManager,
            profile,
            this._callbacks
        );
    }

    modelIntialized(modelData, vid, pid) {
        this._modelData = modelData;

        this._log.info(`Configuration: ${JSON.stringify(this._modelData, null, 2)}`);

        this._commonIcon = this._modelData.budsIcon;
        this._config.battery1ShowOnDisconnect = true;
        this._config.showSettingsButton = true;

        if (this._modelData.batteryCase)
            this._caseIcon = `${this._modelData.case}`;

        this._createDefaultSettings(vid, pid);

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
        this._setupNoiseControlConfig();

        if (this._modelData.ring) {
            this._ringState = 'stopped';
            this._settingsItems['ring-state'] = this._ringState;
            this._updateGsettings();
        }
    }

    _createDefaultSettings(vid, pid) {
        const getDefaultAction = gestureType => {
            const actions = this._modelData.gestureOptions.gestures?.[gestureType].actions ?? {};
            const values = Object.values(actions);
            return values[0] ?? 0;
        };

        this._defaultsDeviceSettings = {
            path: this._devicePath,
            vid,
            pid,
            alias: this._alias,
            icon: this._commonIcon,
            'fw-version': this._fwVersion,

            ...this._modelData.batteryCase && {
                'case': this._caseIcon,
            },

            ...this._modelData.eqPreset && {
                'eq-preset': Object.values(this._modelData.eqPreset)[0],
            },

            ...this._modelData.eqPreset?.custom !== undefined && {
                'eq-custom': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            },

            ...this._modelData.bassEnhanceLevel && {
                'bass-arr': [],
            },

            ...this._modelData.gestureOptions.gestureTypes?.single !== undefined && {
                'single-left': getDefaultAction('single'),
                'single-right': getDefaultAction('single'),
            },

            ...this._modelData.gestureOptions.gestureTypes?.double !== undefined && {
                'double-left': getDefaultAction('double'),
                'double-right': getDefaultAction('double'),
            },

            ...this._modelData.gestureOptions.gestureTypes?.triple !== undefined && {
                'triple-left': getDefaultAction('triple'),
                'triple-right': getDefaultAction('triple'),
            },

            ...this._modelData.gestureOptions.gestureTypes?.['action-hold'] !== undefined && {
                'action-hold-left': getDefaultAction('action-hold'),
                'action-hold-right': getDefaultAction('action-hold'),
            },

            ...this._modelData.gestureOptions.gestureTypes?.['long-action-hold'] !== undefined && {
                'long-action-hold-left': getDefaultAction('long-action-hold'),
                'long-action-hold-right': getDefaultAction('long-action-hold'),
            },

            ...this._modelData.gestureOptions.gestureTypes?.['swipe'] !== undefined && {
                'swipe-left': getDefaultAction('swipe'),
                'swipe-right': getDefaultAction('swipe'),
            },

            ...this._modelData.gestureOptions?.noiseControlModes && {
                'longpress': 7,
            },

            ...this._modelData.ring && {
                'ring-state': 'stopped',
            },
        };
    }

    _addPropsToSettings(devicesList) {
        devicesList.push(this._defaultsDeviceSettings);
        this._settings.set_strv('opo-buds-list', devicesList.map(JSON.stringify));
    }

    _updateInitialValues() {
        const devicesList = this._settings.get_strv('opo-buds-list').map(JSON.parse);
        const existingPathIndex = devicesList.findIndex(item => item.path === this._devicePath);
        if (existingPathIndex === -1)
            return;

        this._settingsItems = devicesList[existingPathIndex];

        this._commonIcon = this._settingsItems['icon'];

        if (this._modelData.batteryCase)
            this._caseIcon = this._settingsItems['case'];

        if (this._modelData.eqPreset)
            this._eqPreset = this._settingsItems['eq-preset'];

        if (this._modelData.eqPreset?.custom !== undefined)
            this._customEq = this._settingsItems['eq-custom'];

        if (this._modelData.bassEnhanceLevel)
            this._bassArr = this._settingsItems['bass-arr'];

        const gestureTypes = this._modelData.gestureOptions.gestureTypes;

        if (gestureTypes?.single !== undefined) {
            this._gestureSingleLeft = this._settingsItems['single-left'];
            this._gestureSingleRight = this._settingsItems['single-right'];
        }

        if (gestureTypes?.double !== undefined) {
            this._gestureDoubleLeft = this._settingsItems['double-left'];
            this._gestureDoubleRight = this._settingsItems['double-right'];
        }

        if (gestureTypes?.triple !== undefined) {
            this._gestureTripleLeft = this._settingsItems['triple-left'];
            this._gestureTripleRight = this._settingsItems['triple-right'];
        }

        if (gestureTypes?.['action-hold'] !== undefined) {
            this._gestureLongLeft = this._settingsItems['action-hold-left'];
            this._gestureLongRight = this._settingsItems['action-hold-right'];
        }

        if (gestureTypes?.['long-action-hold'] !== undefined) {
            this._gesture3xLongLeft = this._settingsItems['long-action-hold-left'];
            this._gesture3xLongRight = this._settingsItems['long-action-hold-right'];
        }

        if (gestureTypes?.['swipe'] !== undefined) {
            this._gestureSwipeLeft = this._settingsItems['swipe-left'];
            this._gestureSwipeRight = this._settingsItems['swipe-right'];
        }

        if (this._modelData.gestureOptions?.noiseControlModes)
            this._longpressMode = this._settingsItems['longpress'];


        if (this._modelData.ring)
            this._ringState = 'stopped';
    }

    _updateGsettingsProps() {
        const devicesList = this._settings.get_strv('opo-buds-list').map(JSON.parse);
        const existingPathIndex = devicesList.findIndex(item => item.path === this._devicePath);
        if (existingPathIndex === -1)
            return;

        this._settingsItems = devicesList[existingPathIndex];

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
                this._setEqPreset(eqPreset);
            }
        }

        if (this._modelData.eqPreset?.custom !== undefined) {
            const eqCustom = this._settingsItems['eq-custom'];
            if (!this._customEq || !isEqArrayEqual(eqCustom, this._customEq)) {
                this._customEq = eqCustom;
                this._setCustomEq(eqCustom);
            }
        }

        if (this._modelData.bassEnhanceLevel) {
            const bassArr = this._settingsItems['bass-arr'];
            if (!this._bassArr || !isEqArrayEqual(bassArr, this._bassArr)) {
                this._bassArr = bassArr;
                this._setBassLevel(bassArr);
            }
        }

        const gestureTypes = this._modelData.gestureOptions.gestureTypes;

        if (gestureTypes.single !== undefined) {
            const left = this._settingsItems['single-left'];
            const right = this._settingsItems['single-right'];

            if (!isArrayEqual(this._gestureSingleLeft, left)) {
                this._gestureSingleLeft = left;
                this._setGesture(left);
            }

            if (!isArrayEqual(this._gestureSingleRight, right)) {
                this._gestureSingleRight = right;
                this._setGesture(right);
            }
        }

        if (gestureTypes.double !== undefined) {
            const left = this._settingsItems['double-left'];
            const right = this._settingsItems['double-right'];

            if (!isArrayEqual(this._gestureDoubleLeft, left)) {
                this._gestureDoubleLeft = left;
                this._setGesture(left);
            }

            if (!isArrayEqual(this._gestureDoubleRight, right)) {
                this._gestureDoubleRight = right;
                this._setGesture(right);
            }
        }

        if (gestureTypes.triple !== undefined) {
            const left = this._settingsItems['triple-left'];
            const right = this._settingsItems['triple-right'];

            if (!isArrayEqual(this._gestureTripleLeft, left)) {
                this._gestureTripleLeft = left;
                this._setGesture(left);
            }

            if (!isArrayEqual(this._gestureTripleRight, right)) {
                this._gestureTripleRight = right;
                this._setGesture(right);
            }
        }

        if (gestureTypes['action-hold'] !== undefined) {
            const left = this._settingsItems['action-hold-left'];
            const right = this._settingsItems['action-hold-right'];

            if (!isArrayEqual(this._gestureLongLeft, left)) {
                this._gestureLongLeft = left;
                this._setGesture(left);
            }

            if (!isArrayEqual(this._gestureLongRight, right)) {
                this._gestureLongRight = right;
                this._setGesture(right);
            }
        }

        if (gestureTypes['long-action-hold'] !== undefined) {
            const left = this._settingsItems['long-action-hold-left'];
            const right = this._settingsItems['long-action-hold-right'];

            if (!isArrayEqual(this._gesture3xLongLeft, left)) {
                this._gesture3xLongLeft = left;
                this._setGesture(left);
            }

            if (!isArrayEqual(this._gesture3xLongRight, right)) {
                this._gesture3xLongRight = right;
                this._setGesture(right);
            }
        }

        if (gestureTypes.swipe !== undefined) {
            const left = this._settingsItems['swipe-left'];
            const right = this._settingsItems['swipe-right'];

            if (!isArrayEqual(this._gestureSwipeLeft, left)) {
                this._gestureSwipeLeft = left;
                this._setGesture(left);
            }

            if (!isArrayEqual(this._gestureSwipeRight, right)) {
                this._gestureSwipeRight = right;
                this._setGesture(right);
            }
        }

        if (this._modelData.gestureOptions?.noiseControlModes) {
            const mode = this._settingsItems['longpress'];
            if (mode !== this._longpressMode) {
                this._longpressMode = mode;
                this._setLongPressMode(mode);
            }
        }

        if (this._modelData.ring) {
            const state = this._settingsItems['ring-state'];
            if (this._ringState !== state) {
                this._ringState = state;
                this._setRingMyBuds(state);
            }
        }
    }

    _monitorOpoBudsListGsettings() {
        this._settingsHandlerId = this._settings?.connect('changed::opo-buds-list', () => {
            if (this._ignoreGsettingsChange)
                return;

            this._updateGsettingsProps();
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

        this._config.battery1ShowOnDisconnect = true;
        if (this._modelData.batteryMutiple) {
            this._config.battery1Icon = `${this._commonIcon}-left`;
            this._config.battery2Icon = `${this._commonIcon}-right`;
            this._config.battery2ShowOnDisconnect = true;
            this._config.battery3Icon = this._caseIcon;
        } else {
            this._config.battery1Icon = this._commonIcon;
        }

        this.dataHandler?.setConfig(this._config);
    }

    updateFirmware(fwVersion) {
        this._fwVersion = fwVersion;
        if (this._settingsItems) {
            this._settingsItems['fw-version'] = fwVersion;
            this._updateGsettings();
        }
    }

    _setupNoiseControlConfig() {
        const nc = this._modelData.noiseControl;
        if (!nc)
            return;

        const addToggle = (index, type, bytes, name, icon) => {
            this._config[`toggle1Button${index}Name`] = name;
            this._config[`toggle1Button${index}Icon`] = icon;
            this._ancToggleMap[index] = {type, bytes};
        };

        this._ancToggleMap = {};
        this._noiseLevelMap = {};
        this._transparencyLevelMap = {};

        this._config.toggle1Title = _('Noise Control');

        let toggleIndex = 1;

        if (nc.off)
            addToggle(toggleIndex++, 'off', nc.off, _('Off'), 'bbm-anc-off-symbolic.svg');

        if (nc.transparency) {
            const tranIcon = 'bbm-transperancy-symbolic.svg';
            if (nc.transparency.levels) {
                addToggle(toggleIndex++, 'transparency', null, _('Transparency'), tranIcon);

                const labels = [];
                let levelIndex = 1;

                for (const [name, bytes] of Object.entries(nc.transparency.levels)) {
                    labels.push(_(name));
                    this._transparencyLevelMap[levelIndex++] = bytes;
                }

                this._config.box1RadioTitle = _('Transparency');
                this._config.box1RadioButton = labels;
                this._config.optionsBox1.push('radio-button');
            } else {
                addToggle(toggleIndex++, 'transparency', nc.transparency, _('Transparency'),
                    tranIcon);
            }
        }

        if (nc.adaptive) {
            const adaptiveIcon = 'bbm-adaptive-symbolic.svg';
            addToggle(toggleIndex++, 'adaptive', nc.adaptive, _('Adaptive'), adaptiveIcon);
        }

        if (nc.noiseCancellation) {
            const ncIcon = 'bbm-anc-on-symbolic.svg';
            if (nc.noiseCancellation.levels) {
                addToggle(toggleIndex++, 'noiseCancellation', null, _('Noise Cancellation'),
                    ncIcon);
                const labels = [];
                let levelIndex = 1;

                for (const [name, bytes] of Object.entries(nc.noiseCancellation.levels)) {
                    labels.push(_(name));
                    this._noiseLevelMap[levelIndex++] = bytes;
                }

                this._config.box2RadioTitle = _('Noise Cancellation');
                this._config.box2RadioButton = labels;
                this._config.optionsBox2.push('radio-button');
            } else {
                addToggle(toggleIndex++, 'noiseCancellation', nc.noiseCancellation,
                    _('Noise Cancellation'), ncIcon);
            }
        }
    }

    _startConfiguration(battInfo) {
        const bat1level = battInfo.battery1Level  ?? 0;
        const bat2level = battInfo.battery2Level  ?? 0;
        const bat3level = battInfo.battery3Level  ?? 0;

        if (bat1level <= 0 && bat2level <= 0 && bat3level <= 0)
            return;

        this._battInfoRecieved = true;

        if (this._modelData.noiseControl)
            this._props.toggle1Visible = true;

        this.dataHandler = new DataHandler(this._config, this._props);

        this.updateDeviceMapCb(this._devicePath, this.dataHandler);

        this._dataHandlerId = this.dataHandler.connect(
            'ui-action', (o, command, value) => {
                if (command === 'toggle1State')
                    this._toggle1ButtonClicked(value);

                if (command === 'box1RadioButtonState')
                    this._box1RadioButtonStateChanged(value);

                if (command === 'box2RadioButtonState')
                    this._box2RadioButtonStateChanged(value);

                if (command === 'settingsButtonClicked')
                    this._settingsButtonClicked();
            }
        );
    }

    updateBatteryProps(props) {
        this._props = {...this._props, ...props};

        if (!this._modelData.batteryMutiple)
            this._props.computedBatteryLevel = props.battery1Level;
        else
            this._props.computedBatteryLevel = buds2to1BatteryLevel(props);

        if (!this._battInfoRecieved)
            this._startConfiguration(props);

        this.dataHandler?.setProps(this._props);
    }

    updateNoiseControl(modeBytes) {
        this._log.info(`updateNoiseControl mode: ${hexBytes(modeBytes)}`);
        let toggleIndex = 0;
        let toggleType = null;

        const nc = this._modelData.noiseControl;

        for (const [index, data] of Object.entries(this._ancToggleMap)) {
            if (data.bytes && isArrayEqual(data.bytes, modeBytes)) {
                toggleIndex = Number(index);
                toggleType = data.type;
                break;
            }
        }

        if (!toggleIndex && nc.transparency?.levels) {
            for (const bytes of Object.values(
                nc.transparency.levels
            )) {
                if (isArrayEqual(bytes, modeBytes)) {
                    toggleType = 'transparency';
                    toggleIndex = Number(Object.keys(this._ancToggleMap).find(
                        key => this._ancToggleMap[key].type === 'transparency'));

                    break;
                }
            }
        }

        if (!toggleIndex && nc.noiseCancellation?.levels) {
            for (const bytes of Object.values(nc.noiseCancellation.levels)) {
                if (isArrayEqual(bytes, modeBytes)) {
                    toggleType = 'noiseCancellation';
                    toggleIndex = Number(Object.keys(this._ancToggleMap).find(
                        key => this._ancToggleMap[key].type === 'noiseCancellation'));

                    break;
                }
            }
        }

        this._props.toggle1State = toggleIndex;

        if (nc.transparency.levels && toggleType === 'transparency') {
            let radioIndex = 1;

            for (const bytes of Object.values(nc.transparency.levels)) {
                if (isArrayEqual(bytes, modeBytes)) {
                    this._props.box1RadioButtonState = radioIndex;
                    break;
                }
                radioIndex++;
            }
        }

        if (nc.noiseCancellation.levels && toggleType === 'noiseCancellation') {
            let radioIndex = 1;
            for (const bytes of Object.values(nc.noiseCancellation.levels)) {
                if (isArrayEqual(bytes, modeBytes)) {
                    this._props.box2RadioButtonState = radioIndex;
                    break;
                }
                radioIndex++;
            }
        }


        if (toggleType === 'transparency' && this._config.box2RadioButton.length > 0)
            this._props.optionsBoxVisible = 2;
        else if (toggleType === 'noiseCancellation' && this._config.box1RadioButton.length > 0)
            this._props.optionsBoxVisible = 1;
        else
            this._props.optionsBoxVisible = 0;

        this.dataHandler?.setProps(this._props);
    }

    _toggle1ButtonClicked(index) {
        const toggle = this._ancToggleMap?.[index];
        if (!toggle)
            return;

        this._props.toggle1State = index;

        if (toggle.type === 'transparency' && this._config.box1RadioButton.length > 0)
            this._props.optionsBoxVisible = 1;
        else if (toggle.type === 'noiseCancellation' && this._config.box2RadioButton.length > 0)
            this._props.optionsBoxVisible = 2;
        else
            this._props.optionsBoxVisible = 0;


        this.dataHandler?.setProps(this._props);

        if (toggle.bytes)
            this._opoBudsSocket?.setNoiseControl(toggle.bytes);
    }

    _box1RadioButtonStateChanged(index) {
        const bytes = this._transparencyLevelMap?.[index];
        if (!bytes)
            return;

        this._props.box1RadioButtonState = index;
        this.dataHandler?.setProps(this._props);
        this._opoBudsSocket?.setNoiseControl(bytes);
    }

    _box2RadioButtonStateChanged(index) {
        const bytes = this._noiseLevelMap?.[index];
        if (!bytes)
            return;

        this._props.box2RadioButtonState = index;
        this.dataHandler?.setProps(this._props);
        this._opoBudsSocket?.setNoiseControl(bytes);
    }

    updateInEarState(left, right) {
        this._log.info(`Inear status left: ${left} Right: ${right}`);
    }

    updateEqPreset(mode) {
        this._log.info(`updateEqPreset : ${hexBytes(mode)}`);
        if (!this._modelData.eqPreset)
            return;

        if (this._eqPreset === mode)
            return;

        this._eqPreset = mode;

        if (this._settingsItems) {
            this._settingsItems['eq-preset'] = mode;
            this._updateGsettings();
        }
    }

    _setEqPreset(mode) {
        this._opoBudsSocket?.setEqPreset(mode);
    }

    updateCustomEq(eqArray) {
        this._log.info(`updateCustomEq : ${hexBytes(eqArray)}`);
        if (this._modelData.eqPreset.custom === undefined)
            return;


        if (isEqArrayEqual(this._customEq, eqArray))
            return;

        this._customEq = eqArray;

        if (this._settingsItems) {
            this._settingsItems['eq-custom'] = eqArray;
            this._updateGsettings();
        }
    }

    _setCustomEq(eqArray) {
        this._opoBudsSocket?.setCustomEq(eqArray);
    }

    updateBassLevel(arr) {
        this._log.info(`updateBassLevel : ${hexBytes(arr)}`);
        if (!this._modelData.bassEnhanceLevel)
            return;

        if (isEqArrayEqual(this._bassArr, arr))
            return;

        this._bassArr = arr;

        if (this._settingsItems) {
            this._settingsItems['bass-arr'] = arr;
            this._updateGsettings();
        }
    }

    _setBassLevel(arr) {
        this._opoBudsSocket?.setBassLevel(arr);
    }

    _updateLeftSingle(arr) {
        const gestureTypes = this._modelData.gestureOptions.gestureTypes;

        if (gestureTypes.single === undefined) {
            this._log.info(`updateLeftSingle Received: ${hexBytes(arr)} ` +
                    'but not available in configuration');
            return;
        }

        this._log.info(`updateLeftSingle: ${hexBytes(arr)}`);

        if (!isArrayEqual(this._gestureSingleLeft, arr)) {
            this._gestureSingleLeft = arr;
            this._settingsItems['single-left'] = arr;
        }
    }

    _updateRightSingle(arr) {
        const gestureTypes = this._modelData.gestureOptions.gestureTypes;

        if (gestureTypes.single === undefined) {
            this._log.info(`updateRightSingle Received: ${hexBytes(arr)} ` +
                    'but not available in configuration');
            return;
        }

        this._log.info(`updateRightSingle: ${hexBytes(arr)}`);

        if (!isArrayEqual(this._gestureSingleRight, arr)) {
            this._gestureSingleRight = arr;
            this._settingsItems['single-right'] = arr;
        }
    }

    _updateLeftDouble(arr) {
        const gestureTypes = this._modelData.gestureOptions.gestureTypes;

        if (gestureTypes.double === undefined) {
            this._log.info(`updateLeftDouble Received: ${hexBytes(arr)} ` +
                    'but not available in configuration');
            return;
        }

        this._log.info(`updateLeftDouble: ${hexBytes(arr)}`);

        if (!isArrayEqual(this._gestureDoubleLeft, arr)) {
            this._gestureDoubleLeft = arr;
            this._settingsItems['double-left'] = arr;
        }
    }

    _updateRightDouble(arr) {
        const gestureTypes = this._modelData.gestureOptions.gestureTypes;

        if (gestureTypes.double === undefined) {
            this._log.info(`updateRightDouble Received: ${hexBytes(arr)} ` +
                    'but not available in configuration');
            return;
        }

        this._log.info(`updateRightDouble: ${hexBytes(arr)}`);

        if (!isArrayEqual(this._gestureDoubleRight, arr)) {
            this._gestureDoubleRight = arr;
            this._settingsItems['double-right'] = arr;
        }
    }

    _updateLeftTriple(arr) {
        const gestureTypes = this._modelData.gestureOptions.gestureTypes;

        if (gestureTypes.triple === undefined) {
            this._log.info(`updateLeftTriple Received: ${hexBytes(arr)} ` +
                    'but not available in configuration');
            return;
        }

        this._log.info(`updateLeftTriple: ${hexBytes(arr)}`);

        if (!isArrayEqual(this._gestureTripleLeft, arr)) {
            this._gestureTripleLeft = arr;
            this._settingsItems['triple-left'] = arr;
        }
    }

    _updateRightTriple(arr) {
        const gestureTypes = this._modelData.gestureOptions.gestureTypes;

        if (gestureTypes.triple === undefined) {
            this._log.info(`updateRightTriple Received: ${hexBytes(arr)} ` +
                    'but not available in configuration');
            return;
        }

        this._log.info(`updateRightTriple: ${hexBytes(arr)}`);

        if (!isArrayEqual(this._gestureTripleRight, arr)) {
            this._gestureTripleRight = arr;
            this._settingsItems['triple-right'] = arr;
        }
    }

    _updateLeftActionHold(arr) {
        const gestureTypes = this._modelData.gestureOptions.gestureTypes;

        if (gestureTypes['action-hold'] === undefined) {
            this._log.info(`updateLeftActionHold Received: ${hexBytes(arr)} ` +
                    'but not available in configuration');
            return;
        }

        this._log.info(`updateLeftActionHold: ${hexBytes(arr)}`);

        if (!isArrayEqual(this._gestureLongLeft, arr)) {
            this._gestureLongLeft = arr;
            this._settingsItems['action-hold-left'] = arr;
        }
    }

    _updateRightActionHold(arr) {
        const gestureTypes = this._modelData.gestureOptions.gestureTypes;

        if (gestureTypes['action-hold'] === undefined) {
            this._log.info(`updateRightActionHold Received: ${hexBytes(arr)} ` +
                    'but not available in configuration');
            return;
        }

        this._log.info(`updateRightActionHold: ${hexBytes(arr)}`);

        if (!isArrayEqual(this._gestureLongRight, arr)) {
            this._gestureLongRight = arr;
            this._settingsItems['action-hold-right'] = arr;
        }
    }

    _updateLeftLongActionHold(arr) {
        const gestureTypes = this._modelData.gestureOptions.gestureTypes;

        if (gestureTypes['long-action-hold'] === undefined) {
            this._log.info(`updateLeftLongActionHold Received: ${hexBytes(arr)} ` +
                    'but not available in configuration');
            return;
        }

        this._log.info(`updateLeftLongActionHold: ${hexBytes(arr)}`);

        if (!isArrayEqual(this._gesture3xLongLeft, arr)) {
            this._gesture3xLongLeft = arr;
            this._settingsItems['long-action-hold-left'] = arr;
        }
    }

    _updateRightLongActionHold(arr) {
        const gestureTypes = this._modelData.gestureOptions.gestureTypes;

        if (gestureTypes['long-action-hold'] === undefined) {
            this._log.info(`updateRightLongActionHold Received: ${hexBytes(arr)} ` +
                    'but not available in configuration');
            return;
        }

        this._log.info(`updateRightLongActionHold: ${hexBytes(arr)}`);

        if (!isArrayEqual(this._gesture3xLongRight, arr)) {
            this._gesture3xLongRight = arr;
            this._settingsItems['long-action-hold-right'] = arr;
        }
    }

    _updateLeftSwipe(arr) {
        const gestureTypes = this._modelData.gestureOptions.gestureTypes;

        if (gestureTypes.swipe === undefined) {
            this._log.info(`updateLeftSwipe Received: ${hexBytes(arr)} ` +
                    'but not available in configuration');
            return;
        }

        this._log.info(`updateLeftSwipe: ${hexBytes(arr)}`);

        if (!isArrayEqual(this._gestureSwipeLeft, arr)) {
            this._gestureSwipeLeft = arr;
            this._settingsItems['swipe-left'] = arr;
        }
    }

    _updateRightSwipe(arr) {
        const gestureTypes = this._modelData.gestureOptions.gestureTypes;

        if (gestureTypes.swipe === undefined) {
            this._log.info(`updateRightSwipe Received: ${hexBytes(arr)} ` +
                    'but not available in configuration');
            return;
        }

        this._log.info(`updateRightSwipe: ${hexBytes(arr)}`);

        if (!isArrayEqual(this._gestureSwipeRight, arr)) {
            this._gestureSwipeRight = arr;
            this._settingsItems['swipe-right'] = arr;
        }
    }

    updateGesture(arr) {
        if (arr.length < 1)
            return;

        this._gestureArr = arr;

        const count = arr[0];
        const expectedLen = 1 + count * 4;

        if (count <= 0 || arr.length < expectedLen) {
            this._log.error(`Invalid gesture data. count=${count}, ` +
                `len=${arr.length}, expected>=${expectedLen}`);
            return;
        }

        const positions = this._modelData.gestureOptions.positions;
        const gestureTypes = this._modelData.gestureOptions.gestureTypes;

        if (!positions || !gestureTypes)
            return;

        let offset = 1;

        for (let i = 0; i < count; i++) {
            const gestureData = arr.slice(offset, offset + 4);
            const position = gestureData[0];
            const type = gestureData[2];

            offset += 4;

            switch (type) {
                case gestureTypes.single:
                    if (position === positions.left) {
                        this._updateLeftSingle(gestureData);
                    } else if (position === positions.right) {
                        this._updateRightSingle(gestureData);
                    } else if (position === positions.both) {
                        this._updateLeftSingle(gestureData);
                        this._updateRightSingle(gestureData);
                    }
                    break;

                case gestureTypes.double:
                    if (position === positions.left) {
                        this._updateLeftDouble(gestureData);
                    } else if (position === positions.right) {
                        this._updateRightDouble(gestureData);
                    } else if (position === positions.both) {
                        this._updateLeftDouble(gestureData);
                        this._updateRightDouble(gestureData);
                    }
                    break;

                case gestureTypes.triple:
                    if (position === positions.left) {
                        this._updateLeftTriple(gestureData);
                    } else if (position === positions.right) {
                        this._updateRightTriple(gestureData);
                    } else if (position === positions.both) {
                        this._updateLeftTriple(gestureData);
                        this._updateRightTriple(gestureData);
                    }
                    break;

                case gestureTypes['action-hold']:
                    if (position === positions.left) {
                        this._updateLeftActionHold(gestureData);
                    } else if (position === positions.right) {
                        this._updateRightActionHold(gestureData);
                    } else if (position === positions.both) {
                        this._updateLeftActionHold(gestureData);
                        this._updateRightActionHold(gestureData);
                    }
                    break;

                case gestureTypes['long-action-hold']:
                    if (position === positions.left) {
                        this._updateLeftLongActionHold(gestureData);
                    } else if (position === positions.right) {
                        this._updateRightLongActionHold(gestureData);
                    } else if (position === positions.both) {
                        this._updateLeftLongActionHold(gestureData);
                        this._updateRightLongActionHold(gestureData);
                    }
                    break;

                case gestureTypes.swipe:
                    if (position === positions.left) {
                        this._updateLeftSwipe(gestureData);
                    } else if (position === positions.right) {
                        this._updateRightSwipe(gestureData);
                    } else if (position === positions.both) {
                        this._updateLeftSwipe(gestureData);
                        this._updateRightSwipe(gestureData);
                    }
                    break;

                default:
                    this._log.error(`Unknown gesture type: 0x${type.toString(16)}`);
            }

            continue;
        }
    }

    _setGesture(arr) {
        if (!this._gestureArr || this._gestureArr.length < 1)
            return;

        const count = this._gestureArr[0];
        const full = [...this._gestureArr];
        let offset = 1;

        for (let i = 0; i < count; i++) {
            const entry = full.slice(offset, offset + 4);

            const deviceType = entry[0];
            const button = entry[1];
            const actionType = entry[2];

            const newDeviceType = arr[0];
            const newButton = arr[1];
            const newActionType = arr[2];

            if (deviceType === newDeviceType && button === newButton &&
                    actionType === newActionType) {
                entry[3] = arr[3];
                full.splice(offset, 4, ...entry);
                break;
            }
            offset += 4;
        }

        this._gestureArr = full;
        this._log.info(`Set Gesture full: ${hexBytes(full)}`);
        this._opoBudsSocket?.setGesture(full);
    }

    updateLongGestures(mode) {
        this._log.info(`updateLongGestures : ${hexBytes(mode)}`);
        if (this._longpressMode !== mode) {
            this._longpressMode = mode;
            this._settingsItems['longpress'] = mode;
            this._updateGsettings();
        }
    }

    _setLongPressMode(mode) {
        this._opoBudsSocket?.setLongPressMode(mode);
    }

    _setRingMyBuds(state) {
        this._opoBudsSocket?.setRingMyBuds(state);
    }

    _settingsButtonClicked() {
        this._configureWindowLauncherCancellable = new Gio.Cancellable();
        launchConfigureWindow(this._devicePath, 'opoBuds', this._extPath,
            this._configureWindowLauncherCancellable);
        this._configureWindowLauncherCancellable = null;
    }

    destroy() {
        this._configureWindowLauncherCancellable?.cancel();
        this._configureWindowLauncherCancellable = null;

        this._opoBudsSocket?.destroy();
        this._opoBudsSocket = null;

        if (this._dataHandlerId)
            this.dataHandler?.disconnect(this._dataHandlerId);
        this._dataHandlerId = null;
        this.dataHandler = null;
        if (this._settingsHandlerId)
            this._settings?.disconnect(this._settingsHandlerId);
        this._settingsHandlerId = null;
        this._settings = null;
        this._battInfoRecieved = false;
    }
});

