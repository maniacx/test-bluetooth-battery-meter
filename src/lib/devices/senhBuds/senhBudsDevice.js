'use strict';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {createLogger, getDeviceIdentifier, hexBytes} from '../logger.js';
import {
    buds2to1BatteryLevel, validateProperties, launchConfigureWindow, isArrayEqual
} from '../deviceUtils.js';
import {createConfig, createProperties, DataHandler} from '../../dataHandler.js';
import {SenhBudsSocket} from './senhBudsSocket.js';
import {CodecMap} from './senhBudsConfig.js';

export const DeviceTypeSenhBuds = 'senhBuds';

const SenhBudsUUID = 'a2129ff3-081b-4c45-8afe-469d9c4842ec';
export function isSenhBuds(bluezDeviceProxy, uuids) {
    const bluezProps = [];
    const supported = uuids.includes(SenhBudsUUID) ? 'yes' : 'no';
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

export const SenhBudsDevice = GObject.registerClass({
    GTypeName: 'BudsLink_SenhBudsDevice',
}, class SenhBudsDevice extends GObject.Object {
    _init(settings, devicePath, alias, extPath, profileManager, updateDeviceMapCb) {
        super._init();
        const identifier = getDeviceIdentifier(devicePath);
        const tag = `SenhBudsDevice-${identifier}`;
        this._log = createLogger(tag);
        this._log.info('------------------- SenhBudsDevice init -------------------');
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
            updateNoiseControl: this.updateNoiseControl.bind(this),
            updateNoiseControlMode: this.updateNoiseControlMode.bind(this),
            updateAncTransparencyLevel: this.updateAncTransparencyLevel.bind(this),
            updateAudioMode: this.updateAudioMode.bind(this),
            updateBassBoost: this.updateBassBoost.bind(this),
            updateCrossfeed: this.updateCrossfeed.bind(this),
            updateSideTone: this.updateSideTone.bind(this),
            updateComfortCall: this.updateComfortCall.bind(this),
            updateTransPause: this.updateTransPause.bind(this),
            updateInEarSetting: this.updateInEarSetting.bind(this),
            updateSmartPause: this.updateSmartPause.bind(this),
            updateAutoAnswer: this.updateAutoAnswer.bind(this),
            updateAutoPowerOff: this.updateAutoPowerOff.bind(this),
            updateCodec: this.updateCodec.bind(this),
        };

        const profile = {type: DeviceTypeSenhBuds, uuid: SenhBudsUUID};

        this._senhBudsSocket = new SenhBudsSocket(
            this._devicePath,
            profileManager,
            profile,
            this._callbacks
        );
    }

    modelIntialized(modelData, modelId) {
        this._modelData = modelData;

        this._log.info(`Configuration: ${JSON.stringify(this._modelData, null, 2)}`);

        this._commonIcon = this._modelData.budsIcon;
        this._config.battery1ShowOnDisconnect = true;
        this._config.showSettingsButton = true;

        if (this._modelData.batteryCase)
            this._caseIcon = `${this._modelData.case}`;

        this._createDefaultSettings(modelId);

        const devicesList = this._settings.get_strv('senh-buds-list').map(JSON.parse);

        if (devicesList.length === 0 ||
                !devicesList.some(device => device.path === this._devicePath)) {
            this._addPropsToSettings(devicesList);
        } else {
            validateProperties(this._settings, 'senh-buds-list', devicesList,
                this._defaultsDeviceSettings, this._devicePath);
        }

        this._updateInitialValues();
        this._monitorSenhBudsListGsettings();
        this._updateIcons();
        this._setupNoiseControlConfig();
        this._updateCodecLabel();

        if (this._modelData.ring) {
            this._ringState = 'stopped';
            this._settingsItems['ring-state'] = this._ringState;
            this._updateGsettings();
        }
    }

    _createDefaultSettings(modelId) {
        this._defaultsDeviceSettings = {
            path: this._devicePath,
            modelId,
            alias: this._alias,
            icon: this._commonIcon,
            'fw-version': this._fwVersion,

            ...this._modelData.batteryCase && {
                'case': this._caseIcon,
            },

            ...this._modelData.audioMode && {
                'audio-mode': 0,
            },

            ...this._modelData.eq?.displayedBand !== undefined && {
                'eq-custom': new Array(this._modelData.eq.displayedBand.length).fill(0),
            },

            ...this._modelData.eq?.bassBoost && {
                'bass-boost': false,
            },

            ...this._modelData.crossfeed && {
                'crossfeed': 0,
            },

            ...this._modelData.sideTone && {
                'side-tone': 0,
            },

            ...this._modelData.comfortCalls && {
                'comfort-call': false,
            },

            ...this._modelData.transPause && {
                'trans-pause': false,
            },

            ...this._modelData.inEarDetection && {
                'in-ear-setting': false,
            },

            ...this._modelData.smartPause && {
                'smart-pause': false,
            },

            ...this._modelData.autoAnswer && {
                'autoanswer': false,
            },

            ...this._modelData.autoPowerOff && {
                'auto-power': 0,
            },

            ...this._modelData.ring && {
                'ring-state': 'stopped',
            },
        };
    }

    _addPropsToSettings(devicesList) {
        devicesList.push(this._defaultsDeviceSettings);
        this._settings.set_strv('senh-buds-list', devicesList.map(JSON.stringify));
    }

    _updateInitialValues() {
        const devicesList = this._settings.get_strv('senh-buds-list').map(JSON.parse);
        const existingPathIndex = devicesList.findIndex(item => item.path === this._devicePath);
        if (existingPathIndex === -1)
            return;

        this._settingsItems = devicesList[existingPathIndex];

        this._commonIcon = this._settingsItems['icon'];

        if (this._modelData.batteryCase)
            this._caseIcon = this._settingsItems['case'];

        if (this._modelData.audioMode)
            this._audioMode = this._settingsItems['audio-mode'];

        if (this._modelData.eq?.displayedBand !== undefined)
            this._customEq = this._settingsItems['eq-custom'];

        if (this._modelData.eq?.bassBoost)
            this._bassBoost = this._settingsItems['bass-boost'];

        if (this._modelData.crossfeed)
            this._crossfeed = this._settingsItems['crossfeed'];

        if (this._modelData.sideTone)
            this._sideTone = this._settingsItems['side-tone'];

        if (this._modelData.comfortCalls)
            this._comfortCall = this._settingsItems['comfort-call'];

        if (this._modelData.transPause)
            this._transPause = this._settingsItems['trans-pause'];

        if (this._modelData.inEarDetection)
            this._inEarSetting = this._settingsItems['in-ear-setting'];

        if (this._modelData.smartPause)
            this._smartPause = this._settingsItems['smart-pause'];

        if (this._modelData.autoAnswer)
            this._autoAnswer = this._settingsItems['autoanswer'];

        if (this._modelData.autoPowerOff)
            this._autoPowerOff = this._settingsItems['auto-power'];

        if (this._modelData.ring)
            this._ringState = this._settingsItems['ring-state'];
    }

    _updateGsettingsProps() {
        const devicesList = this._settings.get_strv('senh-buds-list').map(JSON.parse);
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

        if (this._modelData.audioMode) {
            const audioMode = this._settingsItems['audio-mode'];
            if (this._audioMode !== audioMode) {
                this._audioMode = audioMode;
                this._setAudioMode(audioMode);
            }
        }
        /*
        if (this._modelData.eq?.displayedBand !== undefined) {
            const eqCustom = this._settingsItems['eq-custom'];
            if (!this._customEq || !isEqArrayEqual(eqCustom, this._customEq)) {
                this._customEq = eqCustom;
                this._setCustomEq(eqCustom);
            }
        }
*/
        if (this._modelData.eq?.bassBoost) {
            const bassBoost = this._settingsItems['bass-boost'];
            if (this._bassBoost !== bassBoost) {
                this._bassBoost = bassBoost;
                this._setBassBoost(bassBoost);
            }
        }

        if (this._modelData.crossfeed) {
            const crossfeed = this._settingsItems['crossfeed'];
            if (this._crossfeed !== crossfeed) {
                this._crossfeed = crossfeed;
                this._setCrossfeed(crossfeed);
            }
        }

        if (this._modelData.sideTone) {
            const sideTone = this._settingsItems['side-tone'];
            if (this._sideTone !== sideTone) {
                this._sideTone = sideTone;
                this._setSideTone(sideTone);
            }
        }

        if (this._modelData.comfortCalls) {
            const comfortCall = this._settingsItems['comfort-call'];
            if (this._comfortCall !== comfortCall) {
                this._comfortCall = comfortCall;
                this._setComfortCall(comfortCall);
            }
        }

        if (this._modelData.transPause) {
            const transPause = this._settingsItems['trans-pause'];
            if (this._transPause !== transPause) {
                this._transPause = transPause;
                this._setTransPause(transPause);
            }
        }

        if (this._modelData.inEarDetection) {
            const inEarSetting = this._settingsItems['in-ear-setting'];
            if (this._inEarSetting !== inEarSetting) {
                this._inEarSetting = inEarSetting;
                this._setInEarSetting(inEarSetting);
            }
        }

        if (this._modelData.smartPause) {
            const smartPause = this._settingsItems['smart-pause'];
            if (this._smartPause !== smartPause) {
                this._smartPause = smartPause;
                this._setSmartPause(smartPause);
            }
        }

        if (this._modelData.autoAnswer) {
            const autoAnswer = this._settingsItems['autoanswer'];
            if (this._autoAnswer !== autoAnswer) {
                this._autoAnswer = autoAnswer;
                this._setAutoAnswer(autoAnswer);
            }
        }

        if (this._modelData.autoPowerOff) {
            const autoPowerOff = this._settingsItems['auto-power'];
            if (this._autoPowerOff !== autoPowerOff) {
                this._autoPowerOff = autoPowerOff;
                this._setAutoPowerOff(autoPowerOff);
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

    _monitorSenhBudsListGsettings() {
        this._settingsHandlerId = this._settings?.connect('changed::senh-buds-list', () => {
            if (this._ignoreGsettingsChange)
                return;

            this._updateGsettingsProps();
        });
    }

    _updateGsettings() {
        this._ignoreGsettingsChange = true;

        const currentList = this._settings.get_strv('senh-buds-list').map(JSON.parse);
        const index = currentList.findIndex(d => d.path === this._devicePath);

        if (index !== -1) {
            currentList[index] = this._settingsItems;
            this._settings.set_strv('senh-buds-list', currentList.map(JSON.stringify));
        }

        this._ignoreGsettingsChange = false;
    }

    _updateIcons() {
        this._config.commonIcon = this._commonIcon;
        this._config.albumArtIcon = this._commonIcon;

        this._config.battery1ShowOnDisconnect = true;
        if (this._modelData.batteryMultiple) {
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
        if (this._modelData.noiseControl?.type === 1)
            this._setupNoiseControlType1Config();
        else if (this._modelData.noiseControl?.type === 2)
            this._setupNoiseControlType2Config();
    }

    _setupNoiseControlType1Config() {
        this._log.info('Noise Control Type1 Not Implemented');
    }

    _setupNoiseControlType2Config() {
        const data = this._modelData.noiseControl;
        if (!data)
            return;

        this._config.toggle1Title = _('Noise Control');
        this._props.toggle1Visible = true;

        const modes = ['off', 'nc'];

        if (data.adaptive)
            modes.push('adaptive');

        this._toggle1Modes = modes;

        const labels = {
            off: _('Off'),
            nc: _('Noise Cancellation'),
            adaptive: _('Adaptive'),
        };

        const icons = {
            off: 'bbm-anc-off-symbolic.svg',
            nc: 'bbm-anc-on-symbolic.svg',
            adaptive: 'bbm-adaptive-symbolic.svg',
        };

        for (let i = 1; i <= 4; i++) {
            this._config[`toggle1Button${i}Name`] = '';
            this._config[`toggle1Button${i}Icon`] = null;
        }

        modes.forEach((mode, index) => {
            const button = index + 1;
            this._config[`toggle1Button${button}Name`] = labels[mode];
            this._config[`toggle1Button${button}Icon`] = icons[mode];
        });

        this._config.optionsBox1.push('slider');
        this._config.box1SliderTitle = _('Noise Level');

        if (data.wind) {
            const labels = [];
            this._windModes = [];

            const windLabels = {
                off: _('Off'),
                max: _('Max'),
                auto: _('Auto'),
            };

            Object.keys(data.wind).forEach(mode => {
                this._windModes.push(mode);
                labels.push(windLabels[mode] ?? mode);
            });

            if (labels.length >= 2) {
                this._config.optionsBox1.push('radio-button');
                this._config.box1RadioTitle = _('Anti Wind');
                this._config.box1RadioButton = labels;
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

        this.dataHandler = new DataHandler(this._config, this._props);

        this.updateDeviceMapCb(this._devicePath, this.dataHandler);

        this._dataHandlerId = this.dataHandler.connect(
            'ui-action', (o, command, value) => {
                if (command === 'toggle1State')
                    this._toggle1ButtonClicked(value);

                if (command === 'box1SliderValue')
                    this._box1SliderValueChanged(value);

                if (command === 'box1RadioButtonState')
                    this._box1RadioButtonStateChanged(value);

                if (command === 'settingsButtonClicked')
                    this._settingsButtonClicked();
            }
        );
    }

    updateBatteryProps(props) {
        this._props = {...this._props, ...props};

        if (!this._modelData)
            return;

        if (!this._modelData?.batteryMultiple)
            this._props.computedBatteryLevel = props.battery1Level;
        else
            this._props.computedBatteryLevel = buds2to1BatteryLevel(props);

        this._log.info(`Battery INFO: ${JSON.stringify(props)}`);
        if (!this._battInfoRecieved &&
                (props.battery1Level > 0 && props.battery1Status !== 'disconnected') ||
                props.battery2Level > 0 && props.battery2Status !== 'disconnected')
            this._startConfiguration(props);


        this.dataHandler?.setProps(this._props);
    }

    updateNoiseControl(enable) {
        this._log.info(`updateNoiseControl enable: ${enable}`);

        if (!enable) {
            this._props.toggle1State = this._toggle1Modes.indexOf('off') + 1; ;
            this._props.optionsBoxVisible = 0;
            this._currentNoiseControlMode = 'off';
        } else {
            const mode = this._currentNoiseControlMode === 'adaptive' ? 'adaptive' : 'nc';
            const index = this._toggle1Modes.indexOf(mode) + 1;
            this._props.toggle1State = index;

            if (mode === 'nc')
                this._props.optionsBoxVisible = 1;
            else
                this._props.optionsBoxVisible = 0;
        }

        this.dataHandler?.setProps(this._props);
    }

    updateNoiseControlMode(windMode, comfortState, adaptiveState) {
        this._log.info(`updateNoiseControlMode windMode: ${hexBytes(windMode)} ` +
                `comfortState: ${comfortState} adaptiveState: ${adaptiveState}`);

        const offIndex = this._toggle1Modes.indexOf('off') + 1;
        if (adaptiveState && this._toggle1Modes.includes('adaptive')) {
            this._currentNoiseControlMode = 'adaptive';
            if (this._props.toggle1State !==  offIndex) {
                this._props.toggle1State =  this._toggle1Modes.indexOf('adaptive') + 1;
                this._props.optionsBoxVisible = 0;
            }
        } else if (this._currentNoiseControlMode !== 'off') {
            this._currentNoiseControlMode = 'nc';
            if (this._props.toggle1State !== offIndex) {
                this._props.toggle1State = this._toggle1Modes.indexOf('nc') + 1;
                this._props.optionsBoxVisible = 1;
            }
        }

        if (this._modelData.noiseControl.wind && this._windModes) {
            const windData = this._modelData.noiseControl.wind;
            for (let i = 0; i < this._windModes.length; i++) {
                const key = this._windModes[i];
                if (windData[key] === windMode) {
                    this._props.box1RadioButtonState = i + 1;
                    break;
                }
            }
        }

        this.dataHandler?.setProps(this._props);
    }

    updateAncTransparencyLevel(level) {
        this._log.info(`updateAncTransparencyLevel level: ${level}`);

        if (this._props.box1SliderValue === level)
            return;

        this._props.box1SliderValue = level;
        this.dataHandler?.setProps(this._props);
    }

    _toggle1ButtonClicked(index) {
        const mode = this._toggle1Modes?.[index - 1];
        if (!mode)
            return;

        this._currentNoiseControlMode = mode;
        this._props.toggle1State = index;

        if (mode === 'off') {
            this._props.optionsBoxVisible = 0;
            this.dataHandler?.setProps(this._props);
            this._senhBudsSocket?.setNoiseControl(false);
            return;
        }

        const adaptive = mode === 'adaptive';
        this._props.optionsBoxVisible = adaptive ? 0 : 1;
        this.dataHandler?.setProps(this._props);
        this._senhBudsSocket?.setNoiseControl(true);
        this._senhBudsSocket?.setNoiseControlMode(3, adaptive);
    }

    _box1SliderValueChanged(value) {
        this._props.box1SliderValue = value;
        this.dataHandler?.setProps(this._props);
        this._senhBudsSocket?.setAncTransparencyLevel(value);
    }

    _box1RadioButtonStateChanged(index) {
        const key = this._windModes?.[index - 1];
        if (!key)
            return;

        const value = this._modelData.noiseControl.wind[key];
        this._props.box1RadioButtonState = index;
        this.dataHandler?.setProps(this._props);
        this._senhBudsSocket?.setNoiseControlMode(1, value);
    }

    updateAudioMode(mode) {
        this._log.info(`updateAudioMode mode: ${hexBytes(mode)}`);
        if (this._audioMode !== mode) {
            this._audioMode = mode;
            this._settingsItems['audio-mode'] = mode;
            this._updateGsettings();
        }
    }

    _setAudioMode(mode) {
        this._senhBudsSocket?.setAudioMode(mode);
    }

    updateBassBoost(enable) {
        this._log.info(`updateBassBoost enable: ${enable}`);
        if (this._bassBoost !== enable) {
            this._bassBoost = enable;
            this._settingsItems['bass-boost'] = enable;
            this._updateGsettings();
        }
    }

    _setBassBoost(enable) {
        this._senhBudsSocket?.setBassBoost(enable);
    }

    updateCrossfeed(level) {
        this._log.info(`updateCrossfeed level: ${level}`);
        if (this._crossfeed !== level) {
            this._crossfeed = level;
            this._settingsItems['crossfeed'] = level;
            this._updateGsettings();
        }
    }

    _setCrossfeed(level) {
        this._senhBudsSocket?.setCrossfeed(level);
    }

    updateSideTone(level) {
        this._log.info(`updateSideTone level: ${level}`);
        if (this._sideTone !== level) {
            this._sideTone = level;
            this._settingsItems['side-tone'] = level;
            this._updateGsettings();
        }
    }

    _setSideTone(level) {
        this._senhBudsSocket?.setSideTone(level);
    }

    updateComfortCall(enable) {
        this._log.info(`updateComfortCall enable: ${enable}`);
        if (this._comfortCall !== enable) {
            this._comfortCall = enable;
            this._settingsItems['comfort-call'] = enable;
            this._updateGsettings();
        }
    }

    _setComfortCall(enable) {
        this._senhBudsSocket?.setComfortCall(enable);
    }

    updateTransPause(enable) {
        this._log.info(`updateTransPause enable: ${enable}`);
        if (this._transPause !== enable) {
            this._transPause = enable;
            this._settingsItems['trans-pause'] = enable;
            this._updateGsettings();
        }
    }

    _setTransPause(enable) {
        this._senhBudsSocket?.setTransPause(enable);
    }

    updateInEarSetting(enable) {
        this._log.info(`updateInEarSetting enable: ${enable}`);
        if (this._inEarSetting !== enable) {
            this._inEarSetting = enable;
            this._settingsItems['in-ear-setting'] = enable;
            this._updateGsettings();
        }
    }

    _setInEarSetting(enable) {
        this._senhBudsSocket?.setInEarSetting(enable);
    }

    updateSmartPause(enable) {
        this._log.info(`updateSmartPause enable: ${enable}`);
        if (this._smartPause !== enable) {
            this._smartPause = enable;
            this._settingsItems['smart-pause'] = enable;
            this._updateGsettings();
        }
    }

    _setSmartPause(enable) {
        this._senhBudsSocket?.setSmartPause(enable);
    }

    updateAutoAnswer(enable) {
        this._log.info(`updateAutoAnswer enable: ${enable}`);
        if (this._autoAnswer !== enable) {
            this._autoAnswer = enable;
            this._settingsItems['autoanswer'] = enable;
            this._updateGsettings();
        }
    }

    _setAutoAnswer(enable) {
        this._senhBudsSocket?.setAutoAnswer(enable);
    }

    updateAutoPowerOff(time) {
        this._log.info(`updateAutoPowerOff enable: ${time}`);
        if (this._autoPowerOff !== time) {
            this._autoPowerOff = time;
            this._settingsItems['auto-power'] = time;
            this._updateGsettings();
        }
    }

    _setAutoPowerOff(time) {
        this._senhBudsSocket?.setAutoPowerOff(time);
    }

    _settingsButtonClicked() {
        this._configureWindowLauncherCancellable = new Gio.Cancellable();
        launchConfigureWindow(this._devicePath, 'senhBuds', this._extPath,
            this._configureWindowLauncherCancellable);
        this._configureWindowLauncherCancellable = null;
    }

    _updateCodecLabel() {
        if (this._modelData.reportsCodec)
            this._config.labelIndicatorEnabled = 1;
    }

    updateCodec(codec) {
        const text = CodecMap.hasOwnProperty(codec) ? CodecMap[codec] : '';
        this._props.labelIndicator1 = text;
        this.dataHandler?.setProps(this._props);
    }

    destroy() {
        this._configureWindowLauncherCancellable?.cancel();
        this._configureWindowLauncherCancellable = null;

        this._senhBudsSocket?.destroy();
        this._senhBudsSocket = null;

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

