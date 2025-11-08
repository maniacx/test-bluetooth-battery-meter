'use strict';
import GObject from 'gi://GObject';

import {createLogger} from './logger.js';
import {getBluezDeviceProxy} from './bluezDeviceProxy.js';
import {GalaxyBudsSocket} from './galaxyBudsSocket.js';
import {checkForSamsungBuds} from './galaxyBudsDetector.js';
import {GalaxyBudsAnc, GalaxyBudsModelList, BudsUUID, BudsLegacyUUID} from './galaxyBudsConfig.js';

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

        this._callbacks = {
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateAmbientSoundControl: this.updateAmbientSoundControl.bind(this),
            updateInEarState: this.updateInEarState.bind(this),
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

        this._ui.bat1.setIcon(`bbm-${modelData.budsIcon}-left-symbolic`);
        this._ui.bat2.setIcon(`bbm-${modelData.budsIcon}-right-symbolic`);
        this._ui.bat2.visible = true;

        if (modelData.battery.status.c !== null) {
            this._ui.bat3.setIcon(`bbm-${modelData.case}-symbolic`);
            this._ui.bat3.visible = true;
        }


        this._modelData = modelData;

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

    }


    _startConfiguration(battInfo) {
        const bat1level = battInfo.battery1Level  ?? 0;
        const bat2level = battInfo.battery2Level  ?? 0;
        const bat3level = battInfo.battery3Level  ?? 0;

        if (bat1level <= 0 && bat2level <= 0 && bat3level <= 0)
            return;

        if (!this._battInfoRecieved) {
            this._battInfoRecieved = true;
            this._deviceInitialized();
        }
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
    }

    updateAmbientSoundControl() {
    }

    updateInEarState(left, right) {
        this._ui.inEarL.setLabel(left);
        this._ui.inEarR.setLabel(right);
    }

    set1ButtonClicked(index) {
        this._log.info(`set1ButtonClicked(${index}) called`);
    }

    set2ButtonClicked(index) {
        this._log.info(`set2ButtonClicked(${index}) called`);
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
