'use strict';

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

export const RadioButtonBin = GObject.registerClass({
    GTypeName: 'BluetoothEarbudsCompanion_RadioButtonBin',
}, class RadioButtonBin extends Gtk.Box {
    _init(dataHandler, id) {
        super._init({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            hexpand: true,
            margin_top: 8,
            halign: Gtk.Align.CENTER,
        });

        this._dataHandler = dataHandler;
        this._buttons = [];

        const config = this._dataHandler.getConfig();
        const labels = config[`box${id}RadioButton`];
        const titleText = config[`box${id}RadioTitle`];

        if (titleText) {
            const title = new Gtk.Label({
                label: titleText,
                halign: Gtk.Align.CENTER,
                css_classes: ['heading'],
            });
            this.append(title);
        }

        const row = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            hexpand: true,
            homogeneous: true,
            halign: Gtk.Align.CENTER,
        });
        this.append(row);

        let group = null;

        labels.forEach((label, i) => {
            const index = i + 1;

            const vbox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 6,
                hexpand: true,
                halign: Gtk.Align.CENTER,
            });

            const radioLabel = new Gtk.Label({
                halign: Gtk.Align.CENTER,
                label,
            });
            radioLabel.set_size_request(80, -1);

            const button = new Gtk.CheckButton({
                group,
                halign: Gtk.Align.CENTER,
            });

            vbox.append(button);
            vbox.append(radioLabel);

            if (!group)
                group = button;

            const stateProp = `box${id}RadioButtonState`;

            button.active =
                this._dataHandler.getProps()[stateProp] === index;

            const sigId = button.connect('toggled', () => {
                if (!button.active)
                    return;

                this._dataHandler.emitUIAction(
                    stateProp,
                    index
                );
            });

            row.append(vbox);
            this._buttons.push({button, index, sigId});
        });

        this._dataHandlerId = this._dataHandler.connect('properties-changed', () => {
            const state =
                this._dataHandler.getProps()[`box${id}RadioButtonState`];

            this._buttons.forEach(({button, index}) => {
                button.active = state === index;
            });
        });
    }

    destroy() {
        for (const {button, sigId} of this._buttons)
            button.disconnect(sigId);

        if (this._dataHandler && this._dataHandlerId)
            this._dataHandler.disconnect(this._dataHandlerId);

        this._buttons = [];
        this._dataHandlerId = null;
        this._dataHandler = null;
    }
});

