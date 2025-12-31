'use strict';

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

export const ToggleButtonsSet = GObject.registerClass({
    GTypeName: 'BluetoothEarbudsCompanion_ToggleButtonsSet',
}, class ToggleButtonsSet extends Gtk.Box {
    _init(isSecondSet, dataHandler) {
        super._init({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            hexpand: false,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 8,
            margin_end: 8,
        });

        this._isSecondSet = isSecondSet;
        this._dataHandler = dataHandler;
        this._buildUI();
        this._syncFromProps();

        this._dataHandlerIdConfig = this._dataHandler.connect('configuration-changed', () => {
            this._buildUI();
            this._syncFromProps();
        });

        this._dataHandlerIdProp = this._dataHandler.connect('properties-changed', () => {
            this._syncFromProps();
        });
    }

    _buildUI() {
        let child;
        while ((child = this.get_first_child()))
            this.remove(child);

        this._icons = [];
        this._names = [];
        this._buttons = [];
        this._title = null;

        const config = this._dataHandler.getConfig();

        this._title = this._isSecondSet ? config.toggle2Title : config.toggle1Title;

        this._icons = [
            this._isSecondSet ? config.toggle2Button1Icon : config.toggle1Button1Icon,
            this._isSecondSet ? config.toggle2Button2Icon : config.toggle1Button2Icon,
            this._isSecondSet ? config.toggle2Button3Icon : config.toggle1Button3Icon,
            this._isSecondSet ? config.toggle2Button4Icon : config.toggle1Button4Icon,
        ];

        this._names = [
            this._isSecondSet ? config.toggle2Button1Name : config.toggle1Button1Name,
            this._isSecondSet ? config.toggle2Button2Name : config.toggle1Button2Name,
            this._isSecondSet ? config.toggle2Button3Name : config.toggle1Button3Name,
            this._isSecondSet ? config.toggle2Button4Name : config.toggle1Button4Name,
        ];


        if (this._title) {
            const label = new Gtk.Label({
                label: this._title,
                halign: Gtk.Align.CENTER,
                css_classes: ['heading'],
            });
            this.append(label);
        }

        this._buttonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            homogeneous: true,
            spacing: 0,
            hexpand: false,
            halign: Gtk.Align.CENTER,
        });

        this._buttonBox.add_css_class('linked');
        this.append(this._buttonBox);

        this._icons.forEach((iconName, index) => {
            if (!iconName)
                return;

            const image = new Gtk.Image({
                icon_name: iconName.replace(/\.svg$/, ''),
            });

            const button = new Gtk.Button({
                hexpand: true,
                tooltip_text: this._names[index] || '',
                child: image,
            });

            button.set_size_request(64, -1);

            const sigId = button.connect('clicked', () => {
                const buttonNumber = index + 1;
                const stateProp = this._isSecondSet ? 'toggle2State' : 'toggle1State';

                this._dataHandler.emitUIAction(stateProp, buttonNumber);
            });

            this._buttons.push({button, sigId});
            this._buttonBox.append(button);
        });
    }

    _syncFromProps() {
        const props = this._dataHandler.getProps();
        const index = this._isSecondSet ? props.toggle2State : props.toggle1State;

        for (let i = 0; i < this._buttons.length; i++) {
            const {button} = this._buttons[i];

            if (index > 0 && i === index - 1)
                button.add_css_class('selected');
            else
                button.remove_css_class('selected');
        }
    }

    destroy() {
        for (const {button, sigId} of this._buttons)
            button.disconnect(sigId);

        this._buttons = [];

        if (this._dataHandler && this._dataHandlerIdConfig)
            this._dataHandler.disconnect(this._dataHandlerIdConfig);

        if (this._dataHandler && this._dataHandlerIdProp)
            this._dataHandler.disconnect(this._dataHandlerIdProp);

        this._dataHandlerIdConfig = null;
        this._dataHandlerIdProp = null;
        this._dataHandler = null;
    }
});

