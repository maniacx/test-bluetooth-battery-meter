'use strict';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

import {BatterySetWidget} from './batterySetWidget.js';
import {ToggleButtonsSet} from './toggleButtonsSet.js';
import {CircleBatteryIcon} from './circleBatteryIconWidget.js';
import {OptionsBox} from './optionsBox.js';
import {Gtxt as _} from '../utils.js';

export const DeviceRowNavPage = GObject.registerClass({
    GTypeName: 'BluetoothEarbudsCompanion_DeviceRowNavPage',
}, class DeviceRowNavPage extends Adw.ActionRow {
    _init(path, alias, icon, navView, devicesGrp, scriptDir, dataHandler) {
        super._init({activatable: true});
        this.title = alias;
        this._dataHandler = dataHandler;
        const config = dataHandler.getConfig();

        const battWidget =
            new CircleBatteryIcon(32, config.commonIcon, scriptDir, {valign: Gtk.Align.CENTER});

        this.add_prefix(battWidget);
        this.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
        devicesGrp.add(this);

        this._dataHandlerId = this._dataHandler.connect('properties-changed', () =>  {
            const props = this._dataHandler.getProps();
            const level = props['computedBatteryLevel'];
            const status = 'discharging';
            battWidget.updateValues(level, status);
            if (this._toggle1Grp)
                this._toggle1Grp.visible = props.toggle1Visible;

            if (this._toggle2Grp)
                this._toggle2Grp.visible = props.toggle2Visible;
        });

        this._addNavPage(path, alias, navView, scriptDir, config);
    }

    _addNavPage(path, alias, navView, scriptDir, config) {
        const toolbarView = new Adw.ToolbarView();
        const headerBar = new Adw.HeaderBar({
            decoration_layout: 'icon:close',
            show_end_title_buttons: true,
        });
        toolbarView.add_top_bar(headerBar);

        this._navPage = new Adw.NavigationPage({
            title: _('Bluetooth Earbuds Companion'),
            child: toolbarView,
            tag: path,
        });

        navView.add(this._navPage);

        const devicePage = new Adw.PreferencesPage();
        this._addBatteryBox(devicePage, alias, scriptDir, config);

        const toggleSet1Enabled = config.toggle1Button1Icon && config.toggle1Button2Icon;
        if (toggleSet1Enabled)
            this._addToggleSet1(devicePage, config);

        const toggleSet2Enabled = config.toggle2Button1Icon && config.toggle2Button2Icon;
        if (toggleSet2Enabled)
            this._addToggleSet2(devicePage);

        toolbarView.set_content(devicePage);

        const indicatorCount = config.labelIndicatorEnabled ?? 0;
        if (indicatorCount > 0)
            this._addLabelIndicators(devicePage, indicatorCount);

        this._signalId = this.connect('activated', () => {
            navView.push_by_tag(path);
        });
    }

    _addBatteryBox(page, alias, scriptDir, config) {
        const grp = new Adw.PreferencesGroup({title: alias});
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
        });

        this._configureBtn = new Gtk.Button({
            child: new Adw.ButtonContent({icon_name: 'bbm-settings-symbolic'}),
            visible: config.showSettingsButton ?? false,
            margin_top: 6,
            margin_bottom: 6,
            css_classes: ['circular'],
            tooltip_text: _('Configure'),
        });

        grp.set_header_suffix(this._configureBtn);

        this._configureBtnId = this._configureBtn.connect('clicked', () => {
            this._dataHandler.emitUIAction('settingsButtonClicked', 0);
        });

        const row = new Adw.ActionRow({child: box});
        const label = new Gtk.Label({
            halign: Gtk.Align.CENTER,
            label: _('Battery Level'),
            margin_top: 8,
            css_classes: ['heading'],
        });
        this._battWidget = new BatterySetWidget(32, scriptDir, this._dataHandler);
        box.append(label);
        box.append(this._battWidget);
        grp.add(row);
        page.add(grp);
    }

    _addToggleSet1(page, config) {
        this._toggle1Grp = new Adw.PreferencesGroup();
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
        });
        const row = new Adw.ActionRow({child: box});
        this._toggle1Widget = new ToggleButtonsSet(false, this._dataHandler);
        box.append(this._toggle1Widget);
        this._toggle1Grp.visible = this._dataHandler.getProps.toggle1Visible;

        const boxes = [
            config.optionsBox1,
            config.optionsBox2,
            config.optionsBox3,
            config.optionsBox4,
        ];

        const hasAnyOptions = boxes.some(arr => arr.length > 0);
        if (hasAnyOptions) {
            this._optionBox = new OptionsBox(this._dataHandler);
            box.append(this._optionBox);
        }

        this._toggle1Grp.add(row);
        page.add(this._toggle1Grp);
    }

    _addToggleSet2(page) {
        this._toggle2Grp = new Adw.PreferencesGroup();
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
        });
        const row = new Adw.ActionRow({child: box});
        this._toggle2Widget = new ToggleButtonsSet(true, this._dataHandler);
        box.append(this._toggle2Widget);
        this._toggle2Grp.visible =  this._dataHandler.getProps.toggle2Visible;
        this._toggle2Grp.add(row);
        page.add(this._toggle2Grp);
    }

    _addLabelIndicators(page, count) {
        const props = this._dataHandler.getProps();

        this._labelButtons = [];

        const grp = new Adw.PreferencesGroup();
        const box = new Gtk.Box({
            spacing: 8,
            halign: Gtk.Align.CENTER,
        });

        grp.add(box);
        page.add(grp);

        const createLabelButton = text => {
            const btn = new Gtk.Button({
                label: '',
                halign: Gtk.Align.CENTER,
                can_focus: false,
                can_target: false,
                css_classes: [
                    'accent',
                    'caption-heading',
                    'flat-button',
                ],
            });

            if (text && text.length > 0) {
                btn.label = text;
                btn.visible = true;
            } else {
                btn.visible = false;
            }

            box.append(btn);
            this._labelButtons.push(btn);
        };

        if (count >= 1)
            createLabelButton(props.labelIndicator1);
        if (count >= 2)
            createLabelButton(props.labelIndicator2);
        if (count >= 3)
            createLabelButton(props.labelIndicator3);

        const updateVisibility = () => {
            const anyVisible = this._labelButtons.some(b => b.visible);
            grp.visible = anyVisible;
        };

        updateVisibility();

        this._labelIndicatorSignalId =
            this._dataHandlerId2 = this._dataHandler.connect('properties-changed', () => {
                const handlerProps = this._dataHandler.getProps();
                const labels = [
                    handlerProps.labelIndicator1,
                    handlerProps.labelIndicator2,
                    handlerProps.labelIndicator3,
                ];

                for (let i = 0; i < this._labelButtons.length; i++) {
                    const btn = this._labelButtons[i];
                    const text = labels[i];

                    if (text && text.length > 0) {
                        btn.label = text;
                        btn.visible = true;
                    } else {
                        btn.visible = false;
                    }
                }

                updateVisibility();
            });
    }

    destroy() {
        if (this._navPage && this._navPage.get_parent()) {
            const navView = this._navPage.get_parent();
            if (navView instanceof Adw.NavigationView &&
                    navView.get_visible_page() === this._navPage)
                navView.pop();

            navView.remove(this._navPage);
        }

        this._battWidget?.destroy();
        this._battWidget = null;

        this._optionBox?.destroy();
        this._optionBox = null;

        this._toggle1Widget?.destroy();
        this._toggle1Widget = null;

        this._toggle2Widget?.destroy();
        this._toggle2Widget = null;

        if (this._signalId)
            this.disconnect(this._signalId);

        this._signalId = null;

        if (this._configureBtnId && this._configureBtn)
            this._configureBtn.disconnect(this._configureBtnId);

        this._configureId = null;

        if (this._dataHandlerId && this._dataHandler)
            this._dataHandler.disconnect(this._dataHandlerId);

        if (this._dataHandlerId2 && this._dataHandler)
            this._dataHandler.disconnect(this._dataHandlerId2);

        this._dataHandlerId = null;

        if (this._navPage && this._navPage.get_parent())
            this._navPage.get_parent().remove(this._navPage);
        this._navPage = null;
    }
});
