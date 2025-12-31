'use strict';

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

export const CheckButtonBin = GObject.registerClass({
    GTypeName: 'BluetoothEarbudsCompanion_CheckButtonBin',
}, class CheckButtonBin extends Gtk.Box {
    _init(dataHandler, id) {
        super._init({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            hexpand: true,
            halign: Gtk.Align.CENTER,
        });

        this._dataHandler = dataHandler;
        this._buttons = [];
        this._syncing = false;

        const labels = this._dataHandler.getConfig()[`box${id}CheckButton`];

        labels.forEach((label, i) => {
            const index = i + 1;

            const box = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 6,
                margin_top: 8,
                hexpand: true,
                halign: Gtk.Align.CENTER,
            });

            const checkTitle = new Gtk.Label({
                halign: Gtk.Align.CENTER,
                label,
                margin_top: 8,
                css_classes: ['heading'],
            });

            const check = new Gtk.CheckButton({
                hexpand: true,
                halign: Gtk.Align.CENTER,
            });

            const stateProp = `box${id}CheckButton${index}State`;

            check.active = this._dataHandler.getProps()[stateProp] > 0;

            const sigId = check.connect('toggled', () => {
                if (this._syncing)
                    return;

                this._dataHandler.emitUIAction(
                    stateProp,
                    check.active ? 1 : 0
                );
            });

            box.append(checkTitle);
            box.append(check);
            this.append(box);

            this._buttons.push({check, stateProp, sigId});
        });

        this._dataHandlerId = this._dataHandler.connect('properties-changed', () => {
            const props = this._dataHandler.getProps();

            this._syncing = true;
            for (const {check, stateProp} of this._buttons) {
                const newValue = props[stateProp] > 0;
                if (check.active !== newValue)
                    check.active = newValue;
            }
            this._syncing = false;
        });
    }

    destroy() {
        for (const {check, sigId} of this._buttons)
            check.disconnect(sigId);

        if (this._dataHandler && this._dataHandlerId)
            this._dataHandler.disconnect(this._dataHandlerId);

        this._buttons = [];
        this._dataHandlerId = null;
        this._dataHandler = null;
    }
});

