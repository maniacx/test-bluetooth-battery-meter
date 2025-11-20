import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

export const ToggleButtonRow = GObject.registerClass({
    GTypeName: 'BluetoothBatteryMeter_ToggleButtonRow',
    Properties: {
        'toggled': GObject.ParamSpec.int(
            'toggled',
            '',
            '',
            GObject.ParamFlags.READWRITE,
            0, 4, 0
        ),
    },
}, class ToggleButtonRow extends Adw.ActionRow {
    constructor(params = {}) {
        super(params);

        this.visible = false;
        this._buttons = [];
        this._buttonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            homogeneous: true,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 12,
            margin_end: 12,
        });
        this.child = this._buttonBox;

        this._toggled = 0;
    }

    get toggled() {
        return this._toggled;
    }

    set toggled(value) {
        const newValue = Math.max(0, Math.min(value, this._buttons.length));
        if (this._toggled === newValue)
            return;

        this._toggled = newValue;
        this._updateButtonStyles();
        this.notify('toggled');
    }

    updateConfig(args = {}) {
        let child = this._buttonBox.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this._buttonBox.remove(child);
            child = next;
        }

        this._buttons = [];

        const buttonNames = Object.keys(args)
        .filter(key => key.startsWith('btn') && key.endsWith('Name'))
        .sort();

        if (buttonNames.length === 0) {
            this.visible = false;
            return;
        }

        for (let i = 1; i <= buttonNames.length; i++) {
            const nameKey = `btn${i}Name`;
            const iconKey = `btn${i}Icon`;
            const label = args[nameKey] ?? '';
            const icon = args[iconKey] ?? '';

            const content = new Adw.ButtonContent();
            if (icon)
                content.set_icon_name(icon);
            if (label)
                content.set_label(label);

            const btn = new Gtk.Button({child: content});
            btn.connect('clicked', () => {
                this.toggled = this._toggled === i ? 0 : i; // deselect if clicked again
            });

            this._buttonBox.append(btn);
            this._buttons.push(btn);
        }

        this._updateButtonStyles();
        this.visible = true;
    }


    _updateButtonStyles() {
        this._buttons.forEach((btn, idx) => {
            const ctx = btn.get_style_context();
            ctx.remove_class('accent');
            if (this._toggled === idx + 1)
                ctx.add_class('accent');
        });
    }
});

