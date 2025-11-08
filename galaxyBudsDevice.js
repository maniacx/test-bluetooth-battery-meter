'use strict';
import GObject from 'gi://GObject';

import {createLogger} from './logger.js';
import {getBluezDeviceProxy} from './bluezDeviceProxy.js';
import {createConfig, createProperties, DataHandler} from './dataHandler.js';
import {GalaxyBudsSocket} from './galaxyBudsSocket.js';
import {checkForSamsungBuds} from './galaxyBudsDetector.js';
import {GalaxyBudsAnc, GalaxyBudsModelList, BudsUUID, BudsLegacyUUID} from './galaxyBudsConfig.js';

export const GalaxyBudsDevice = GObject.registerClass({
}, class GalaxyBudsDevice extends GObject.Object {
    _init(devicePath, updateDeviceMapCb, profileManager) {
        super._init();
        this._log = createLogger('GalaxyBudsDevice');
        this._log.info('GalaxyBudsDevice init ');
        this._devicePath = devicePath;
        this._config = createConfig();
        this._props = createProperties();
        this._model = null;
        this.updateDeviceMapCb = updateDeviceMapCb;
        this._profileManager = profileManager;
        this._battInfoRecieved = false;

        this._callbacks = {
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateAmbientSoundControl: this.updateAmbientSoundControl.bind(this),
            updateInEarState: this.updateInEarState.bind(this),
        };

        this._initialize();
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

        //       this._batteryDualSupported = modelData.batteryDual ?? false;
        //       this._batteryDual2Supported = modelData.batteryDual2 ?? false;
        //       this._batteryCaseSupported = modelData.batteryCase ?? false;
        //       this._batterySingleSupported = modelData.batterySingle ?? false;

        this._noNoiseCancellingSupported = !modelData.anc.supported;
        this._ambientSoundControlSupported =
            !modelData.anc.modes.includes(GalaxyBudsAnc.AmbientSound);
        this._adaptiveSoundControlSupported =
            !modelData.anc.modes.includes(GalaxyBudsAnc.Adaptive);

        this._config.battery1Icon = `${modelData.budsIcon}-left`;
        this._config.battery2Icon = `${modelData.budsIcon}-right`;

        this._config.battery3Icon = `${modelData.case}`;


        if (!this._noNoiseCancellingSupported &&
                this._ambientSoundControlSupported) {
            this._config.set1Button1Icon = 'bbm-anc-off-symbolic.svg';
            this._config.set1Button2Icon = 'bbm-anc-on-symbolic.svg';
            this._config.set1Button3Icon = 'bbm-transperancy-symbolic.svg';
            if (this._adaptiveSoundControlSupported)
                this._config.set1Button4Icon = 'bbm-adaptive-symbolic.svg';
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

    _startConfiguration(battInfo) {
        const bat1level = battInfo.battery1Level  ?? 0;
        const bat2level = battInfo.battery2Level  ?? 0;
        const bat3level = battInfo.battery3Level  ?? 0;

        if (bat1level <= 0 && bat2level <= 0 && bat3level <= 0)
            return;

        this._battInfoRecieved = true;

        this._log.info(`about to start handler: ${bat1level}, ${bat2level}, ${bat3level}`);
        this.dataHandler = new DataHandler(this._config, this._props,
            this.set1ButtonClicked.bind(this), this.set2ButtonClicked.bind(this));
        this._log.info('did start handler');

        this.updateDeviceMapCb(this._devicePath, this.dataHandler);
    }

    updateBatteryProps(props) {
        this._props = {...this._props, ...props};
        if (!this._battInfoRecieved)
            this._startConfiguration(props);

        this.dataHandler?.setProps(this._props);
    }

    updateAmbientSoundControl(mode) {
        if (this._noNoiseCancellingSupported)
            return;

        if (mode === GalaxyBudsAnc.Off)
            this._props.toggle1State = 1;
        else if (mode === GalaxyBudsAnc.NoiseReduction)
            this._props.toggle1State = 2;
        else if (this._ambientSoundControlSupported && mode === GalaxyBudsAnc.AmbientSound)
            this._props.toggle1State = 3;
        else if (this._adaptiveSoundControlSupported && mode === GalaxyBudsAnc.Adaptive)
            this._props.toggle1State = 4;

        this.dataHandler?.setProps(this._props);
    }

    updateInEarState(left, right) {
        this._props.tmpInEarLeft = left;
        this._props.tmpInEarRight = right;
        this.dataHandler?.setProps(this._props);
    }

    updatePlaybackState(state) {
        this._props.tmpPlayPauseStatus = state;
        this.dataHandler?.setProps(this._props);
    }

    set1ButtonClicked(index) {
        this._socketLog.info(`set1ButtonClicked(${index}) called`);
    }

    set2ButtonClicked(index) {
        this._socketLog.info(`set2ButtonClicked(${index}) called`);
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
