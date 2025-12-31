'use strict';

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

import {CircleBatteryIcon} from './circleBatteryIconWidget.js';

export const BatterySetWidget = GObject.registerClass({
    GTypeName: 'BluetoothEarbudsCompanion_BatterySetWidget',
}, class BatterySetWidget extends Gtk.Box {
    _init(batteryIconSize, scriptDir, dataHandler) {
        super._init({
            spacing: 16,
            halign: Gtk.Align.CENTER,
            margin_bottom: 8,
        });

        this._dataHandler = dataHandler;
        this._config = dataHandler.getConfig();

        this.set_size_request(80, -1);

        if (this._config.battery1Icon)
            this._buildBattery(1, batteryIconSize, scriptDir);

        if (this._config.battery2Icon) {
            this._addSpacer();
            this._buildBattery(2, batteryIconSize, scriptDir);
        }

        if (this._config.battery3Icon) {
            this._addSpacer();
            this._buildBattery(3, batteryIconSize, scriptDir);
        }

        const props = this._dataHandler.getProps();
        this._updateProps(props);

        this._dataHandlerId = this._dataHandler.connect(
            'properties-changed',
            () => this._updateProps(this._dataHandler.getProps())
        );
    }

    _buildBattery(index, iconSize, scriptDir) {
        const verticalBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 2,
            halign: Gtk.Align.START,
        });

        const iconPath = this._config[`battery${index}Icon`];

        const icon = new CircleBatteryIcon(
            iconSize,
            iconPath,
            scriptDir
        );

        const label = new Gtk.Label({
            halign: Gtk.Align.CENTER,
        });

        const attrs = new Pango.AttrList();
        attrs.insert(Pango.attr_weight_new(Pango.Weight.BOLD));
        attrs.insert(Pango.attr_scale_new(0.75));
        label.set_attributes(attrs);
        label.set_margin_top(4);

        verticalBox.append(icon);
        verticalBox.append(label);
        this.append(verticalBox);

        icon.updateValues(0, false);

        this[`_battery${index}BatteryBox`] = verticalBox;
        this[`_battery${index}BatteryIcon`] = icon;
        this[`_battery${index}PercentageLabel`] = label;
    }

    _addSpacer() {
        this.append(new Gtk.Box({height_request: 6}));
    }

    _updateProps(props) {
        this._updateBattery(1, props);
        this._updateBattery(2, props);
        this._updateBattery(3, props);
    }

    _updateBattery(index, props) {
        const iconKey = `battery${index}Icon`;
        if (!this._config[iconKey])
            return;

        const level = props[`battery${index}Level`];
        const status = props[`battery${index}Status`];
        const showOnDisconnect = this._config[`battery${index}ShowOnDisconnect`];

        const box = this[`_battery${index}BatteryBox`];
        const icon = this[`_battery${index}BatteryIcon`];
        const label = this[`_battery${index}PercentageLabel`];

        if (
            showOnDisconnect ||
            level !== 0 && status !== 'disconnected'
        ) {
            icon.updateValues(level, status);

            label.label =
                level === 0 && showOnDisconnect
                    ? ''
                    : `${level}%`;

            box.set_visible(true);
        } else {
            box.set_visible(false);
        }
    }

    destroy() {
        if (this._dataHandlerId && this._dataHandler)
            this._dataHandler.disconnect(this._dataHandlerId);

        this._dataHandlerId = null;
        this._dataHandler = null;
    }
});

