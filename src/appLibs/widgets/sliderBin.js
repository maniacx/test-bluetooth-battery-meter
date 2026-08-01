'use strict';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

const THROTTLE_DELAY = 1000;

export const SliderBin = GObject.registerClass({
    GTypeName: 'BudsLink_SliderBin',
}, class SliderBin extends Gtk.Box {
    _init(dataHandler, id) {
        super._init({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            hexpand: true,
            margin_top: 10,
        });

        this._dataHandler = dataHandler;
        this._id = id;

        this._programmaticUpdate = false;
        this._pendingSliderValue = null;
        this._lastSentSliderValue = null;
        this._sliderTimeoutId = null;
        this._isDragging = false;
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

            const value = Math.round(this._scale.get_value());
            this._throttleSliderValue(value);
        });

        this._dataHandlerId = dataHandler.connect('properties-changed', () => {
            const value = dataHandler.getProps()[`box${id}SliderValue`];
            this._setSliderValue(value);
        });

        const controllers = this._scale.observe_controllers();

        for (let i = 0; i < controllers.get_n_items(); i++) {
            const controller = controllers.get_item(i);

            if (controller instanceof Gtk.GestureClick) {
                this._scaleGesture = controller;

                this._scalePressedId = controller.connect('pressed', () => {
                    this._isDragging = true;
                    this._setDragging();
                });

                this._scaleReleasedId = controller.connect('released', () => {
                    this._isDragging = false;
                    if (!this._sliderTimeoutId)
                        this._setDragging();
                });

                break;
            }
        }
    }

    _setSliderValue(value) {
        this._programmaticUpdate = true;
        this._scale.set_value(value);
        this._programmaticUpdate = false;
    }

    _setDragging() {
        this._dataHandler.emitUIAction(`box${this._id}SliderIsDragging`, this._isDragging ? 1 : 0);
    }

    _throttleSliderValue(value) {
        this._pendingSliderValue = value;

        if (this._sliderTimeoutId)
            return;

        this._emitPendingSliderValue();

        this._sliderTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, THROTTLE_DELAY, () => {
            if (this._pendingSliderValue !== null) {
                this._emitPendingSliderValue();
                return GLib.SOURCE_CONTINUE;
            }

            this._sliderTimeoutId = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    _emitPendingSliderValue() {
        const value = this._pendingSliderValue;
        this._pendingSliderValue = null;

        if (value !== this._lastSentSliderValue) {
            this._lastSentSliderValue = value;
            this._dataHandler.emitUIAction(`box${this._id}SliderValue`, value);
        }

        if (!this._isDragging)
            this._setDragging();
    }

    destroy() {
        if (this._sliderTimeoutId)
            GLib.source_remove(this._sliderTimeoutId);
        this._sliderTimeoutId = null;

        if (this._dataHandler && this._dataHandlerId)
            this._dataHandler.disconnect(this._dataHandlerId);

        this._dataHandlerId = null;
        this._dataHandler = null;

        if (this._scale && this._scaleId)
            this._scale.disconnect(this._scaleId);

        this._scaleId = null;

        if (this._scaleGesture) {
            if (this._scalePressedId)
                this._scaleGesture.disconnect(this._scalePressedId);

            if (this._scaleReleasedId)
                this._scaleGesture.disconnect(this._scaleReleasedId);
        }

        this._scaleGesture = null;
        this._scalePressedId = null;
        this._scaleReleasedId = null;
        this._scale = null;
    }
});

