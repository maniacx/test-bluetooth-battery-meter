'use strict';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

export const SliderBin = GObject.registerClass({
    GTypeName: 'BluetoothEarbudsCompanion_SliderBin',
}, class SliderBin extends Gtk.Box {
    _init(dataHandler, id) {
        super._init({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            hexpand: true,
            margin_top: 8,
        });

        this._dataHandler = dataHandler;
        this._id = id;

        this._programmaticUpdate = false;
        this._dragTimeoutId = 0;

        const config = dataHandler.getConfig();

        const title = new Gtk.Label({
            label: config[`box${id}SliderTitle`] ?? '',
            halign: Gtk.Align.CENTER,
            css_classes: ['heading'],
        });

        this.append(title);

        const row = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            hexpand: true,
            halign: Gtk.Align.FILL,
        });

        const minusLabel = new Gtk.Label({
            label: '−',
            halign: Gtk.Align.START,
            margin_start: 4,
        });

        const plusLabel = new Gtk.Label({
            label: '+',
            halign: Gtk.Align.END,
            margin_end: 4,
        });

        this._scale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            hexpand: true,
            draw_value: false,
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 1,
                page_increment: 10,
            }),
        });

        row.append(minusLabel);
        row.append(this._scale);
        row.append(plusLabel);
        this.append(row);

        this._setSliderValue(
            this._scale,
            dataHandler.getProps()[`box${id}SliderValue`]
        );

        this._scaleId = this._scale.connect('value-changed', () => {
            if (this._programmaticUpdate)
                return;

            this._setDragging(true);

            const value = Math.round(this._scale.get_value());
            dataHandler.emitUIAction(`box${id}SliderValue`, value);
            this._restartDragTimeout();
        });

        this._dataHandlerId = dataHandler.connect('properties-changed', () => {
            const value = dataHandler.getProps()[`box${id}SliderValue`];
            this._setSliderValue(value);
        });
    }


    _setSliderValue(value) {
        this._programmaticUpdate = true;
        this._scale.set_value(value);
        this._programmaticUpdate = false;
    }

    _setDragging(active) {
        this._dataHandler.emitUIAction(
            `box${this._id}SliderIsDragging`,
            active ? 1 : 0
        );
    }

    _restartDragTimeout() {
        if (this._dragTimeoutId) {
            GLib.source_remove(this._dragTimeoutId);
            this._dragTimeoutId = 0;
        }

        this._dragTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            200,
            () => {
                this._dragTimeoutId = 0;
                this._setDragging(false);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    destroy() {
        if (this._dragTimeoutId) {
            GLib.source_remove(this._dragTimeoutId);
            this._dragTimeoutId = 0;
        }

        if (this._dataHandler && this._dataHandlerId)
            this._dataHandler.disconnect(this._dataHandlerId);

        this._dataHandlerId = null;
        this._dataHandler = null;

        if (this._scale && this._scaleId)
            this._scale.disconnect(this._scaleId);

        this._scaleId = null;
        this._scale = null;
    }
});

