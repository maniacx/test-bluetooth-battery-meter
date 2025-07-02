'use strict';
import GObject from 'gi://GObject';

import {getBluezDeviceProxy} from './bluezDeviceProxy.js';
import {createConfig, createProperties, DataHandler} from './dataHandler.js';
import {AirpodsSocket} from './airpodsSocket.js';
import {AirpodsModelList, ANCMode, AwarenessMode, EarDetection} from './airpodsConfig.js';

export const AirpodsUUID = '74ec2172-0bad-4d01-8f77-997b2be0722a';

export const AirpodsDevice = GObject.registerClass({
}, class AirpodsDevice extends GObject.Object {
    _init(devicePath, updateDeviceMapCb, profileManager) {
        super._init();
        this._devicePath = devicePath;
        this._config = createConfig();
        this._props = createProperties();
        this._model = null;
        this._adaptiveLevel = 50;
        this._inEarControl = true;
        this._budInEar = false;
        this._bothBudsInEar = false;
        this.updateDeviceMapCb = updateDeviceMapCb;
        this._profileManager = profileManager;
        this._battInfoRecieved = false;

        this._callbacks = {
            updateBatteryProps: this.updateBatteryProps.bind(this),
            updateAncMode: this.updateAncMode.bind(this),
            updateAdaptiveLevel: this.updateAdaptiveLevel.bind(this),
            updateAwarenessMode: this.updateAwarenessMode.bind(this),
            updateAwarenessData: this.updateAwarenessData.bind(this),
            updateInEarStatus: this.updateInEarStatus.bind(this),
        };

        this._initialize();
    }

    _initialize() {
        this._bluezDeviceProxy = getBluezDeviceProxy(this._devicePath);
        const modalias = this._bluezDeviceProxy.Modalias;
        if (!modalias) {
            this._bluezSignalId = this._bluezDeviceProxy.connect(
                'g-properties-changed', () => this._onBluezPropertiesChanged());
        } else {
            this._initializeModel(modalias);
        }
    }

    _onBluezPropertiesChanged() {
        const modalias = this._bluezDeviceProxy.Modalias;
        if (modalias) {
            this._initializeModel(modalias);
            if (this._bluezDeviceProxy && this._bluezSignalId)
                this._bluezDeviceProxy.disconnect(this._bluezSignalId);
            this._bluezSignalId = null;
            this._bluezDeviceProxy = null;
        }
    }

    _initializeModel(modalias) {
        const regex = /v004Cp([0-9A-Fa-f]{4})d/;
        const match = modalias.match(regex);
        if (match) {
            this._model = match[1].toUpperCase();
            const modelData = AirpodsModelList.find(m => m.key === this._model);
            this._batteryType = modelData.batteryType;
            this._ancSupported = modelData.ancSupported;
            this._adaptiveSupported = modelData.adaptiveSupported;
            this._awarenessSupported = modelData.awarenessSupported;

            this._config.commonIcon = modelData.budsIcon;
            this._config.albumArtIcon = modelData.albumArtIcon;
            this._config.battery1ShowOnDisconnect = true;
            this._config.battery2ShowOnDisconnect = true;

            if (modelData.batteryType !== 1) {
                this._config.battery1Icon = `${modelData.budsIcon}-left`;
                this._config.battery2Icon = `${modelData.budsIcon}-right`;
                this._config.battery3Icon = `${modelData.case}`;
            } else {
                this._config.battery1Icon = modelData.budsIcon;
            }

            if (this._ancSupported) {
                this._config.set1Button1Icon = 'bbm-anc-off-symbolic.svg';
                this._config.set1Button2Icon = 'bbm-anc-on-symbolic.svg';
                this._config.set1Button3Icon = 'bbm-transperancy-symbolic.svg';
                if (modelData.adaptiveSupported)
                    this._config.set1Button4Icon = 'bbm-adaptive-symbolic.svg';
            }

            if (this._awarenessSupported) {
                this._config.set2Button1Icon = 'bbm-ca-on-symbolic.svg';
                this._config.set2Button2Icon = 'bbm-ca-off-symbolic.svg';
            }

            this._initializeProfile();
        }
    }

    _initializeProfile() {
        let fd;
        fd = this._profileManager.getFd(this._devicePath);
        if (fd === -1) {
            this._profileSignalId = this._profileManager.connect(
                'new-connection', (_, path, newFd) => {
                    if (path !== this._devicePath)
                        return;
                    fd = newFd;
                    this._profileManager.disconnect(this._profileSignalId);
                    this._profileSignalId = null;
                    this._startAirpodsSocket(fd);
                }
            );

            this._profileManager.registerProfile('airpods', AirpodsUUID);
        } else {
            this._startAirpodsSocket(fd);
        }
    }

    _startAirpodsSocket(fd) {
        this._airpodsSocket = new AirpodsSocket(
            this._devicePath,
            fd,
            this._batteryType,
            this._ancSupported,
            this._adaptiveSupported,
            this._awarenessSupported,
            this._callbacks);
    }

    _startConfiguration(battInfo) {
        const bat1level = battInfo.battery1Level  ?? 0;
        const bat2level = battInfo.battery2Level  ?? 0;
        const bat3level = battInfo.battery3Level  ?? 0;

        if (bat1level <= 0 && bat2level <= 0 && bat3level <= 0)
            return;

        this._battInfoRecieved = true;

        this.dataHandler = new DataHandler(this._config, this._props,
            this.set1ButtonClicked.bind(this), this.set2ButtonClicked.bind(this));

        this.updateDeviceMapCb(this._devicePath, this.dataHandler);
    }

    updateBatteryProps(props) {
        this._props = {...this._props, ...props};
        if (!this._battInfoRecieved)
            this._startConfiguration(props);

        this.dataHandler?.setProps(this._props);
    }

    updateAncMode(mode) {
        if (mode === ANCMode.ANC_OFF)
            this._props.toggle1State = 1;
        else if (mode === ANCMode.ANC_ON)
            this._props.toggle1State = 2;
        else if (mode === ANCMode.TRANSPARENCY)
            this._props.toggle1State = 3;
        else if (this._adaptiveSupported && mode === ANCMode.ADAPTIVE)
            this._props.toggle1State = 4;

        this.dataHandler?.setProps(this._props);
    }

    updateAdaptiveLevel(level) {
        this._adaptiveLevel = level;
    }

    updateAwarenessMode(mode) {
        if (mode === AwarenessMode.ON)
            this._props.toggle2State = 1;
        else if (mode === AwarenessMode.OFF)
            this._props.toggle2State = 2;

        this.dataHandler?.setProps(this._props);
    }

    _updatetoggleVisibility() {
        const toggle1Visible = this._budInEar && this._ancSupported;
        const toggle2Visible =
            this._bothBudsInEar  && this._awarenessSupported && this._outputIsA2dp;

        this._props.toggle1Visible = toggle1Visible;
        this._props.toggle2Visible = toggle2Visible;
        this.dataHandler?.setProps(this._props);
    }

    updateInEarStatus(bud1Status, bud2status) {
        this._bothBudsInEar =
            bud1Status === EarDetection.IN_EAR && bud2status === EarDetection.IN_EAR;

        this._budInEar =
            bud1Status === EarDetection.IN_EAR ||  bud2status === EarDetection.IN_EAR;

        this._updatetoggleVisibility();

        if (bud1Status === EarDetection.IN_EAR)
            this._props.tmpInEarLeft = 'in-ear';
        else if (bud1Status === EarDetection.OUT_EAR)
            this._props.tmpInEarLeft = 'out-ear';
        else if (bud1Status === EarDetection.IN_CASE)
            this._props.tmpInEarLeft = 'in-case';

        if (bud2status === EarDetection.IN_EAR)
            this._props.tmpInEarRight = 'in-ear';
        else if (bud2status === EarDetection.OUT_EAR)
            this._props.tmpInEarRight = 'out-ear';
        else if (bud2status === EarDetection.IN_CASE)
            this._props.tmpInEarRight = 'in-case';

        if (this._budInEar)
            this._props.tmpPlayPauseStatus = 'play';
        else
            this._props.tmpPlayPauseStatus = 'pause';

        this.dataHandler?.setProps(this._props);
    }

    updateAwarenessData(attenuated) {
        this._props.tmpAwarnessAtt = attenuated;
        this.dataHandler?.setProps(this._props);
    }

    set1ButtonClicked(index) {
        if (this._ancSupported && index === 1)
            this._airpodsSocket.setAncMode(ANCMode.ANC_OFF);
        else if (this._ancSupported && index === 2)
            this._airpodsSocket.setAncMode(ANCMode.ANC_ON);
        else if (this._ancSupported && index === 3)
            this._airpodsSocket.setAncMode(ANCMode.TRANSPARENCY);
        else if (this._ancSupported && this._adaptiveSupported && index === 4)
            this._airpodsSocket.setAncMode(ANCMode.ADAPTIVE);
    }

    set2ButtonClicked(index) {
        if (this._awarenessSupported && index === 1)
            this._airpodsSocket.setAwarenessMode(AwarenessMode.ON);
        else if (this._awarenessSupported && index === 2)
            this._airpodsSocket.setAwarenessMode(AwarenessMode.OFF);
    }

    destroy() {
        if (this._bluezDeviceProxy && this._bluezSignalId)
            this._bluezDeviceProxy.disconnect(this._bluezSignalId);
        this._bluezSignalId = null;
        this._bluezDeviceProxy = null;
        this._airpodsSocket?.destroy();
        this._airpodsSocket = null;
        this.dataHandler = null;
        this._battInfoRecieved = false;
    }
});
