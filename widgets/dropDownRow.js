import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

export const DropDownRowWidget = GObject.registerClass({
    GTypeName: 'DropDownRowWidget',
    Properties: {
        selected_item: GObject.ParamSpec.object(
            'selected-item',
            '',
            '',
            GObject.ParamFlags.READWRITE,
            GObject.TYPE_OBJECT
        ),
    },
}, class DropDownRowWidget extends Adw.ActionRow {
    _init(params = {}) {
        const {
            title = '',             // Adw Row Title
            subtitle = '',          // Adw Row Subtitle
            options = [],           // Array of Options to be Displayed in dropdown
            values = [],            // Array of Values for the above options
            initialValue = null,    // Initital Selection
        } = params;

        super._init({title, subtitle});

        this._values = values;
        this._updatingProgrammatically = false;

        this._stringList = new Gtk.StringList();
        for (const label of options)
            this._stringList.append(label);

        let currentIndex = this._values.indexOf(initialValue);
        if (currentIndex === -1)
            currentIndex = 0;

        this._dropdown = Gtk.DropDown.new(this._stringList, null);
        this._dropdown.valign = Gtk.Align.CENTER;
        this._dropdown.selected = currentIndex;

        this.add_suffix(this._dropdown);
        this.activatable_widget = this._dropdown;

        this._dropdown.connect('notify::selected', () => {
            if (this._updatingProgrammatically)
                return;
            this.notify('selected-item');
        });
    }

    get selected_item() {
        const idx = this._dropdown.selected;
        return this._values[idx];
    }

    set selected_item(val) {
        const idx = this._values.indexOf(val);
        this._updatingProgrammatically = true;
        this._dropdown.selected = idx === -1 ? 0 : idx;
        this._updatingProgrammatically = false;
    }
});


