import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

export const EqualizerWidget = GObject.registerClass({
    GTypeName: 'EqualizerWidget',
    Signals: {'eq-changed': {param_types: [GObject.TYPE_JSOBJECT]}},
}, class EqualizerWidget extends Gtk.Box {
    _init(freqs, initialValues, range) {
        super._init({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
            homogeneous: false,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 12,
            margin_end: 12,
        });

        this.set_size_request(-1, 200);
        this._values = freqs.map((_, i) => Math.round(initialValues[i] ?? 0));
        this._range = range;

        freqs.forEach((freq, i) => {
            const vbox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 4,
                halign: Gtk.Align.CENTER,
                vexpand: true,
                hexpand: true,
            });

            const freqLabel = new Gtk.Label({
                label: String(freq),
                halign: Gtk.Align.CENTER,
                width_chars: 5,
                max_width_chars: 5,
            });

            const adj = new Gtk.Adjustment({
                lower: -range,
                upper: range,
                step_increment: 1,
                page_increment: 1,
                value: this._values[i],
            });

            const slider = new Gtk.Scale({
                orientation: Gtk.Orientation.VERTICAL,
                adjustment: adj,
                draw_value: false,
                inverted: true,
                vexpand: true,
            });

            const valueLabel = new Gtk.Label({
                halign: Gtk.Align.CENTER,
                label: `${this._values[i]} dB`,
                width_chars: 5,
                max_width_chars: 5,
            });

            slider._lastStepValue = Math.round(slider.get_value());

            slider.connect('value-changed', w => {
                const val = Math.round(w.get_value());
                if (val !== slider._lastStepValue) {
                    slider._lastStepValue = val;
                    this._values[i] = val;
                    valueLabel.label = `${val} dB`;
                    this.emit('eq-changed', this._values.slice());
                }
            });

            vbox.append(freqLabel);
            vbox.append(slider);
            vbox.append(valueLabel);
            this.append(vbox);
        });
    }

    get values() {
        return this._values.slice();
    }

    setValues(values) {
        this._values = this._values.map((_, i) => Math.round(values[i] ?? 0));
    }
});

