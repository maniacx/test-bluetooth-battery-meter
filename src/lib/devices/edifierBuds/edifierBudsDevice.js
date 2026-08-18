'use strict';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import {gettext as _} from 'gettext';

import {createLogger, getDeviceIdentifier, hexBytes} from '../logger.js';
import {
    buds2to1BatteryLevel, validateProperties, launchConfigureWindow
} from '../deviceUtils.js';
import {createConfig, createProperties, DataHandler} from '../../dataHandler.js';
import {MediaController} from '../mediaController.js';
import {EdifierBudsSocket} from './edifierBudsSocket.js';
import {
    EdifierBudsModelList, EdifierManufacturerId, AncMode
} from './edifierBudsConfig.js';

export const DeviceTypeEdifierBuds = 'edifierBuds';

/* Vendor SPP record present on the classic (audio) device. It is the only
   Edifier marker BlueZ exposes there, so detection keys off it — the actual
   control channel is the LE peer located by EdifierBudsSocket. */
const EdifierSppUUID = 'edf00000-edfe-dfed-fedf-edfedfedfedf';

/* Characteristics of the LE control service (ProductRead/WriteUuid). */
const EdifierGattNotifyUUID = '48090001-1a48-11e9-ab14-d663bd873d93';
const EdifierGattWriteUUID = '48090002-1a48-11e9-ab14-d663bd873d93';

export function isEdifierBuds(bluezDeviceProxy, uuids) {
    const bluezProps = [];
    const supported = uuids.some(u => u.toLowerCase() === EdifierSppUUID)
        ? 'yes' : 'no';
    return {supported, bluezProps};
}

export const EdifierBudsDevice = GObject.registerClass({
    GTypeName: 'BudsLink_EdifierBudsDevice',
}, class EdifierBudsDevice extends GObject.Object {
    _init(settings, devicePath, alias, extPath, _profileManager, updateDeviceMapCb) {
        super._init();
        const identifier = getDeviceIdentifier(devicePath);
        this._log = createLogger(`EdifierBudsDevice-${identifier}`);
        this._log.info('------------------- EdifierBudsDevice init -------------------');
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
        this._noiseControlLevel = 0;

        this._callbacks = {
            modelIntialized: this.modelIntialized.bind(this),
            updateFirmware: this.updateFirmware.bind(this),
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateNoiseControl: this.updateNoiseControl.bind(this),
            updateInEarSetting: this.updateInEarSetting.bind(this),
            updateGameMode: this.updateGameMode.bind(this),
        };

        const searchUuids = EdifierBudsModelList.flatMap(
            model => model.searchUuids ?? []);

        const gattProfile = {
            type: DeviceTypeEdifierBuds,
            serviceUuids: searchUuids,
            notifyUuids: [EdifierGattNotifyUUID],
            writeUuid: EdifierGattWriteUUID,
            manufacturerId: EdifierManufacturerId,
            peerNamePrefix: 'EDIFIER',
        };

        this._edifierBudsSocket = new EdifierBudsSocket(
            this._devicePath, gattProfile, this._callbacks);
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

        const devicesList = this._settings.get_strv('edifier-buds-list').map(JSON.parse);

        if (devicesList.length === 0 ||
                !devicesList.some(device => device.path === this._devicePath)) {
            this._addPropsToSettings(devicesList);
        } else {
            validateProperties(this._settings, 'edifier-buds-list', devicesList,
                this._defaultsDeviceSettings, this._devicePath);
        }

        this._updateInitialValues();
        this._monitorEdifierBudsListGsettings();
        this._updateIcons();
        this._setupNoiseControlConfig();
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

            ...this._modelData.inEarDetection && {
                'in-ear-setting': false,
                'wear-detection-mode': 1,
            },

            ...this._modelData.gameMode && {
                'game-mode': false,
            },
        };
    }

    _addPropsToSettings(devicesList) {
        devicesList.push(this._defaultsDeviceSettings);
        this._settings.set_strv('edifier-buds-list', devicesList.map(JSON.stringify));
    }

    _updateInitialValues() {
        const devicesList = this._settings.get_strv('edifier-buds-list').map(JSON.parse);
        const existingPathIndex = devicesList.findIndex(
            item => item.path === this._devicePath);
        if (existingPathIndex === -1)
            return;

        this._settingsItems = devicesList[existingPathIndex];
        this._commonIcon = this._settingsItems['icon'];

        if (this._modelData.batteryCase)
            this._caseIcon = this._settingsItems['case'];

        if (this._modelData.inEarDetection) {
            this._inEarSetting = this._settingsItems['in-ear-setting'];
            this._wearDetectionMode = this._settingsItems['wear-detection-mode'];
        }

        if (this._modelData.gameMode)
            this._gameMode = this._settingsItems['game-mode'];
    }

    _updateGsettingsProps() {
        const devicesList = this._settings.get_strv('edifier-buds-list').map(JSON.parse);
        const existingPathIndex = devicesList.findIndex(
            item => item.path === this._devicePath);
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

        if (this._modelData.inEarDetection) {
            const inEarSetting = this._settingsItems['in-ear-setting'];
            if (this._inEarSetting !== inEarSetting) {
                this._inEarSetting = inEarSetting;
                this._edifierBudsSocket?.setInEarDetection(inEarSetting);
                this._configureMediaController();
            }

            const wearDetectionMode = this._settingsItems['wear-detection-mode'];
            if (this._wearDetectionMode !== wearDetectionMode) {
                this._wearDetectionMode = wearDetectionMode;
                this._configureMediaController();
            }
        }

        if (this._modelData.gameMode) {
            const gameMode = this._settingsItems['game-mode'];
            if (this._gameMode !== gameMode) {
                this._gameMode = gameMode;
                this._edifierBudsSocket?.setGameMode(gameMode);
            }
        }
    }

    _monitorEdifierBudsListGsettings() {
        this._settingsHandlerId = this._settings?.connect(
            'changed::edifier-buds-list', () => {
                if (this._ignoreGsettingsChange)
                    return;

                this._updateGsettingsProps();
            });
    }

    _updateGsettings() {
        this._ignoreGsettingsChange = true;

        const currentList = this._settings.get_strv('edifier-buds-list').map(JSON.parse);
        const index = currentList.findIndex(d => d.path === this._devicePath);

        if (index !== -1) {
            currentList[index] = this._settingsItems;
            this._settings.set_strv('edifier-buds-list', currentList.map(JSON.stringify));
        }

        this._ignoreGsettingsChange = false;
    }

    _configureMediaController() {
        const enableMediaController = this._wearDetectionMode !== 0 && this._inEarSetting;

        if (enableMediaController && !this._mediaController) {
            this._mediaController = new MediaController(this._settings, this._devicePath,
                this._previousOnDestroyVolume);

            this._mediaHandlerId = this._mediaController.connect(
                'notify::output-is-a2dp', () => {
                    this._outputIsA2dp = this._mediaController.output_is_a2dp;
                }
            );
            this._outputIsA2dp = this._mediaController.output_is_a2dp;
        } else if (!enableMediaController) {
            if (this._mediaHandlerId) {
                this._mediaController?.disconnect(this._mediaHandlerId);
                this._mediaHandlerId = null;
            }
            this._mediaController?.destroy();
            this._mediaController = null;
        }
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

    _setupNoiseControlConfig() {
        const modes = this._modelData.noiseControl?.modes;
        if (!modes || modes.length < 2)
            return;

        this._config.toggle1Title = _('Noise Control');
        this._props.toggle1Visible = true;
        this._toggle1Modes = modes;

        const labels = {
            off: _('Off'),
            nc: _('Noise Cancellation'),
            ambient: _('Ambient Sound'),
        };

        const icons = {
            off: 'bbm-anc-off-symbolic.svg',
            nc: 'bbm-anc-on-symbolic.svg',
            ambient: 'bbm-transperancy-symbolic.svg',
        };

        for (let i = 1; i <= 4; i++) {
            this._config[`toggle1Button${i}Name`] = '';
            this._config[`toggle1Button${i}Icon`] = null;
        }

        modes.forEach((mode, index) => {
            const button = index + 1;
            this._config[`toggle1Button${button}Name`] = labels[mode] ?? mode;
            this._config[`toggle1Button${button}Icon`] = icons[mode] ?? null;
        });
    }

    _modeToAncValue(mode) {
        switch (mode) {
            case 'nc':
                return AncMode.NOISE_CANCELLING;
            case 'ambient':
                return AncMode.AMBIENT_SOUND;
            default:
                return AncMode.OFF;
        }
    }

    _ancValueToMode(value) {
        switch (value) {
            case AncMode.NOISE_CANCELLING:
                return 'nc';
            case AncMode.AMBIENT_SOUND:
                return 'ambient';
            case AncMode.OFF:
                return 'off';
            default:
                return null;
        }
    }

    _startConfiguration(battInfo) {
        const bat1level = battInfo.battery1Level ?? 0;
        const bat2level = battInfo.battery2Level ?? 0;
        const bat3level = battInfo.battery3Level ?? 0;

        if (bat1level <= 0 && bat2level <= 0 && bat3level <= 0)
            return;

        this._battInfoRecieved = true;

        this.dataHandler = new DataHandler(this._config, this._props);

        this.updateDeviceMapCb(this._devicePath, this.dataHandler);

        this._dataHandlerId = this.dataHandler.connect(
            'ui-action', (o, command, value) => {
                if (command === 'toggle1State')
                    this._toggle1ButtonClicked(value);

                if (command === 'settingsButtonClicked')
                    this._settingsButtonClicked();
            }
        );
    }

    updateBatteryProps(props) {
        this._props = {...this._props, ...props};

        if (!this._modelData)
            return;

        if (!this._modelData.batteryMultiple)
            this._props.computedBatteryLevel = props.battery1Level;
        else
            this._props.computedBatteryLevel = buds2to1BatteryLevel(props);

        this._log.info(`Battery INFO: ${JSON.stringify(props)}`);

        if (!this._battInfoRecieved &&
                (props.battery1Level > 0 && props.battery1Status !== 'disconnected' ||
                 props.battery2Level > 0 && props.battery2Status !== 'disconnected'))
            this._startConfiguration(props);

        this.dataHandler?.setProps(this._props);
    }

    updateFirmware(fwVersion) {
        this._fwVersion = fwVersion;
        if (this._settingsItems) {
            this._settingsItems['fw-version'] = fwVersion;
            this._updateGsettings();
        }
    }

    updateNoiseControl(value, level) {
        this._log.info(`updateNoiseControl value: ${hexBytes(value)} level: ${level}`);

        const mode = this._ancValueToMode(value);
        if (!mode || !this._toggle1Modes)
            return;

        const index = this._toggle1Modes.indexOf(mode);
        if (index === -1)
            return;

        this._noiseControlLevel = level;
        this._props.toggle1State = index + 1;
        this.dataHandler?.setProps(this._props);
    }

    _toggle1ButtonClicked(index) {
        const mode = this._toggle1Modes?.[index - 1];
        if (!mode)
            return;

        this._props.toggle1State = index;
        this.dataHandler?.setProps(this._props);
        this._edifierBudsSocket?.setNoiseControl(this._modeToAncValue(mode));
    }

    updateInEarSetting(enable) {
        this._log.info(`updateInEarSetting enable: ${enable}`);
        if (this._inEarSetting !== enable) {
            this._inEarSetting = enable;
            if (this._settingsItems) {
                this._settingsItems['in-ear-setting'] = enable;
                this._updateGsettings();
            }
            this._configureMediaController();
        }
    }

    updateGameMode(enable) {
        this._log.info(`updateGameMode enable: ${enable}`);
        if (this._gameMode !== enable) {
            this._gameMode = enable;
            if (this._settingsItems) {
                this._settingsItems['game-mode'] = enable;
                this._updateGsettings();
            }
        }
    }

    _settingsButtonClicked() {
        this._configureWindowLauncherCancellable = new Gio.Cancellable();
        launchConfigureWindow(this._devicePath, 'edifierBuds', this._extPath,
            this._configureWindowLauncherCancellable);
        this._configureWindowLauncherCancellable = null;
    }

    destroy() {
        this._configureWindowLauncherCancellable?.cancel();
        this._configureWindowLauncherCancellable = null;

        this._edifierBudsSocket?.destroy();
        this._edifierBudsSocket = null;

        if (this._dataHandlerId)
            this.dataHandler?.disconnect(this._dataHandlerId);
        this._dataHandlerId = null;
        this.dataHandler = null;

        if (this._settingsHandlerId)
            this._settings?.disconnect(this._settingsHandlerId);
        this._settingsHandlerId = null;

        if (this._mediaHandlerId)
            this._mediaController?.disconnect(this._mediaHandlerId);
        this._mediaHandlerId = null;
        this._mediaController?.destroy();
        this._mediaController = null;

        this._settings = null;
        this._battInfoRecieved = false;
    }
});
