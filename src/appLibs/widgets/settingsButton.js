'use strict';

import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Adw from 'gi://Adw';
import Pango from 'gi://Pango';
import {gettext as _} from 'gettext';

const MODE_KEY = 'dark-mode';
const ACCENT_KEY = 'accent-color';

const MODE_SYSTEM = 'system';
const MODE_LIGHT = 'light';
const MODE_DARK = 'dark';

const ACCENT_SYSTEM = 'system';

export const SettingsButton = GObject.registerClass(
class SettingsButton extends Gtk.MenuButton {
    _init(settings, direction) {
        super._init({
            icon_name: 'bbm-open-menu-symbolic',
            tooltip_text: _('Application Settings'),
            margin_top: 6,
            margin_bottom: 6,
            css_classes: ['circular'],
        });

        this._settings = settings;

        this._accentTable = [
            ['system', '--window-bg-color', _('System Default')],
            ['accent-blue', '--accent-blue', _('Blue')],
            ['accent-teal', '--accent-teal', _('Teal')],
            ['accent-green', '--accent-green', _('Green')],
            ['accent-yellow', '--accent-yellow', _('Yellow')],
            ['accent-orange', '--accent-orange', _('Orange')],
            ['accent-red', '--accent-red', _('Red')],
            ['accent-pink', '--accent-pink', _('Pink')],
            ['accent-purple', '--accent-purple', _('Purple')],
            ['accent-slate', '--accent-slate', _('Slate')],
        ];

        this._popPosition = direction === Gtk.TextDirection.RTL
            ? Gtk.PositionType.LEFT : Gtk.PositionType.RIGHT;

        this._mainPopover = new Gtk.Popover({
            has_arrow: true,
            cascade_popdown: true,
            position: this._popPosition,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
        });

        box.append(this._createRow(
            'bbm-dark-mode-symbolic',
            _('Dark Mode'),
            true,
            btn => this._openSubPopover(() => this._createDarkModePopover(), btn)
        ));

        box.append(this._createRow(
            'bbm-color-symbolic',
            _('Accent Color'),
            true,
            btn => this._openSubPopover(() => this._createAccentColorPopover(), btn)
        ));

        box.append(this._createRow(
            'bbm-logs-symbolic',
            _('Packet Logging'),
            true,
            btn => this._openSubPopover(() => this._createLoggingPopover(), btn)
        ));

        box.append(this._createRow(
            'bbm-mode-run-symbolic',
            _('Run in Background'),
            true,
            btn => this._openSubPopover(() => this._createRunInBackgroundPopover(), btn)
        ));

        box.append(this._createRow(
            'bbm-extension-symbolic',
            _('BudsLink Companion'),
            true,
            btn => this._openSubPopover(() => this._createCompanionLinksPopover(), btn)
        ));

        box.append(this._createRow(
            'bbm-help-about-symbolic',
            _('About BudsLink'),
            false,
            () => {
                const parent = this.get_root();

                const aboutDialog = Adw.AboutDialog.new_from_appdata(
                    '/io/github/maniacx/BudsLink/io.github.maniacx.BudsLink.metainfo.xml',
                    pkg.version    // eslint-disable-line no-undef
                );
                aboutDialog.set_application_icon('io.github.maniacx.BudsLink');
                aboutDialog.add_link(
                    _('Translation'),
                    'https://maniacx.github.io/BudsLink/translation'
                );

                aboutDialog.present(parent);
                this._mainPopover.popdown();
            }
        ));

        this._mainPopover.set_child(box);
        this.set_popover(this._mainPopover);
    }

    _getDarkMode() {
        const v = this._settings.get_string(MODE_KEY);
        return v || MODE_SYSTEM;
    }

    _getAccentColor() {
        const v = this._settings.get_string(ACCENT_KEY);
        return v || ACCENT_SYSTEM;
    }

    _openSubPopover(factory, relativeTo) {
        const popover = factory();
        popover.set_parent(relativeTo);

        popover.connect('hide', () => {
            if (popover.get_parent())
                popover.unparent();
        });

        popover.popup();
    }

    _createRow(iconName, labelText, hasSubmenu, callback) {
        const button = new Gtk.Button({css_classes: ['flat']});

        const row = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
        });

        row.append(new Gtk.Image({icon_name: iconName}));
        row.append(new Gtk.Label({label: labelText, xalign: 0, hexpand: true}));

        if (hasSubmenu)
            row.append(new Gtk.Image({icon_name: 'pan-end-symbolic'}));

        button.set_child(row);
        button.connect('clicked', () => callback(button));
        return button;
    }

    _createDarkModePopover() {
        const current = this._getDarkMode();
        const popover = new Gtk.Popover({
            has_arrow: true,
            position: this._popPosition,
            cascade_popdown: true,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
        });

        const add = (label, mode) => {
            const row = this._createCheckRow(label, current === mode);
            row.connect('clicked', () => {
                this._settings.set_string(MODE_KEY, mode);
                popover.popdown();
                this._mainPopover.popdown();
            });
            box.append(row);
        };

        add(_('System Default'), MODE_SYSTEM);
        add(_('Light'), MODE_LIGHT);
        add(_('Dark'), MODE_DARK);

        popover.set_child(box);
        return popover;
    }

    _createAccentColorPopover() {
        const current = this._getAccentColor();

        const popover = new Gtk.Popover({
            has_arrow: true,
            position: this._popPosition,
            cascade_popdown: true,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
        });

        for (const [value, cssVar, label] of this._accentTable) {
            const row = this._createColorRow(cssVar, label, current === cssVar ||
                value === ACCENT_SYSTEM && current === ACCENT_SYSTEM);

            row.connect('clicked', () => {
                const store = value === ACCENT_SYSTEM ? ACCENT_SYSTEM : cssVar;
                this._settings.set_string(ACCENT_KEY, store);
                popover.popdown();
                this._mainPopover.popdown();
            });
            box.append(row);
        }

        popover.set_child(box);
        return popover;
    }

    _createCheckRow(labelText, checked) {
        const button = new Gtk.Button({css_classes: ['flat']});
        const row = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 12});

        row.append(new Gtk.Label({label: labelText, xalign: 0, hexpand: true}));

        if (checked)
            row.append(new Gtk.Image({icon_name: 'object-select-symbolic'}));

        button.set_child(row);
        return button;
    }

    _createColorRow(cssVar, labelText, checked) {
        const button = new Gtk.Button({css_classes: ['flat']});
        const row = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 12});

        const swatch = new Gtk.Box({
            width_request: 14,
            height_request: 14,
            halign: Gtk.Align.START,
            valign: Gtk.Align.CENTER,
        });

        const provider = new Gtk.CssProvider();
        provider.load_from_data(
            `box { background-color: var(${cssVar}); border-radius: 9999px; }`,
            -1
        );

        swatch.get_style_context().add_provider(
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );

        row.append(swatch);
        row.append(new Gtk.Label({label: labelText, xalign: 0, hexpand: true}));

        if (checked)
            row.append(new Gtk.Image({icon_name: 'object-select-symbolic'}));

        button.set_child(row);
        return button;
    }

    _createLoggingPopover() {
        const enabled = this._settings.get_boolean('logging-enabled');

        const popover = new Gtk.Popover({
            has_arrow: true,
            position: this._popPosition,
            cascade_popdown: true,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
        });

        const add = (label, value) => {
            const row = this._createCheckRow(label, enabled === value);

            row.connect('clicked', () => {
                this._settings.set_boolean('logging-enabled', value);
                popover.popdown();
                this._mainPopover.popdown();
            });

            box.append(row);
        };

        add(_('On'), true);
        add(_('Off'), false);

        popover.set_child(box);
        return popover;
    }

    _createRunInBackgroundPopover() {
        const enabled = this._settings.get_boolean('run-in-background');

        const popover = new Gtk.Popover({
            has_arrow: true,
            position: this._popPosition,
            cascade_popdown: true,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
        });

        const add = (label, value) => {
            const row = this._createCheckRow(label, enabled === value);

            row.connect('clicked', () => {
                this._settings.set_boolean('run-in-background', value);
                popover.popdown();
                this._mainPopover.popdown();
            });

            box.append(row);
        };

        add(_('On'), true);
        add(_('Off'), false);

        popover.set_child(box);
        return popover;
    }

    _createCompanionLinksPopover() {
        const popover = new Gtk.Popover({
            has_arrow: true,
            position: this._popPosition,
            cascade_popdown: true,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
        });

        box.set_size_request(280, -1);

        const addLink = (label, url, iconName) => {
            const button = new Gtk.Button({
                css_classes: ['flat'],
            });

            const row = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 10,
            });

            row.append(new Gtk.Image({
                icon_name: iconName,
            }));

            row.append(new Gtk.Label({
                label,
                xalign: 0,
                hexpand: true,
                ellipsize: Pango.EllipsizeMode.END,
                max_width_chars: 28,
            }));

            row.append(new Gtk.Image({
                icon_name: 'adw-external-link-symbolic',
            }));

            button.set_child(row);

            button.connect('clicked', () => {
                Gio.AppInfo.launch_default_for_uri(url, null);
                popover.popdown();
                this._mainPopover.popdown();
            });

            box.append(button);
        };

        addLink(
            _('GNOME Extension'),
            'https://github.com/maniacx/BudsLink-Companion/tree/Gnome-Extension',
            'bbm-gnome-extension-symbolic'
        );

        addLink(
            _('Plasma Widget'),
            'https://github.com/maniacx/BudsLink-Companion/tree/Plasma-Widget',
            'bbm-plasma-widget-symbolic'
        );

        addLink(
            _('Cinnamon Spice'),
            'https://github.com/maniacx/BudsLink-Companion/tree/Cinnamon-Applet',
            'bbm-cinnamon-spices-symbolic'
        );

        popover.set_child(box);
        return popover;
    }
});

