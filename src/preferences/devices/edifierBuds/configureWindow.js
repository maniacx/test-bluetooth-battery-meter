'use strict';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {
    supportedAudioSingleIcons, supportedCaseIcons
} from '../../../lib/widgets/iconGroups.js';
import {IconSelectorWidget} from './../../widgets/iconSelectorWidget.js';
import {DropDownRowWidget} from './../../widgets/dropDownRowWidget.js';

export const ConfigureWindow = GObject.registerClass({
    GTypeName: 'BudsLink_EdifierBudsConfigureWindow',
}, class ConfigureWindow extends Adw.Window {
    _init(settings, mac, devicePath, parentWindow, _, modal = false) {
        super._init({
            default_width: 650,
            default_height: 650,
            width_request: 320,
            height_request: 100,
            modal,
            transient_for: parentWindow ?? null,
        });

        this._settings = settings;
        this._devicePath = devicePath;

        const pathsString = this._settings.get_strv('edifier-buds-list').map(JSON.parse);
        this._settingsItems = pathsString.find(info => info.path === devicePath);
        if (!this._settingsItems)
            return;

        this.title = this._settingsItems.alias;

        const toolViewBar = new Adw.ToolbarView();
        const headerBar = new Adw.HeaderBar();
        const page = new Adw.PreferencesPage();

        toolViewBar.add_top_bar(headerBar);
        toolViewBar.set_content(page);
        this.set_content(toolViewBar);

        const iconSelector = new IconSelectorWidget({
            gtxt: _,
            grpTitle: _('Icon'),
            rowTitle: _('Select Icon'),
            rowSubtitle: _('Select the icon used for the indicator and quick menu'),
            iconList: supportedAudioSingleIcons,
            initialIcon: this._settingsItems['icon'] || 'earbuds',
            caseIconList: supportedCaseIcons,
            initialCaseIcon: this._settingsItems['case'] || 'case-normal',
            mac,
            fw: this._settingsItems['fw-version'] || '',
        });

        iconSelector.connect('notify::selected-icon', () => {
            this._updateGsettings('icon', iconSelector.selected_icon);
        });

        if ('case' in this._settingsItems) {
            iconSelector.connect('notify::selected-case-icon', () => {
                this._updateGsettings('case', iconSelector.selected_case_icon);
            });
        }

        page.add(iconSelector);

        const settingsGroup = new Adw.PreferencesGroup({title: _('Settings')});
        page.add(settingsGroup);

        if ('game-mode' in this._settingsItems) {
            this._gameModeSwitch = new Adw.SwitchRow({
                title: _('Game Mode'),
                subtitle: _('Reduce audio latency while gaming'),
            });
            this._gameModeSwitch.active = this._settingsItems['game-mode'];
            this._gameModeSwitch.connect('notify::active', () => {
                this._updateGsettings('game-mode', this._gameModeSwitch.active);
            });
            settingsGroup.add(this._gameModeSwitch);
        }

        if ('in-ear-setting' in this._settingsItems) {
            this._inEarSwitch = new Adw.SwitchRow({
                title: _('In-Ear Detection'),
                subtitle: _('Let the earbuds detect when they are worn'),
            });
            this._inEarSwitch.active = this._settingsItems['in-ear-setting'];
            this._inEarSwitch.connect('notify::active', () => {
                this._updateGsettings('in-ear-setting', this._inEarSwitch.active);
            });
            settingsGroup.add(this._inEarSwitch);

            this._wearModeDropdown = new DropDownRowWidget({
                title: _('Auto Pause'),
                subtitle: _('Control media playback using in-ear detection'),
                options: [
                    _('Disabled'),
                    _('Pause when both removed'),
                    _('Pause when either removed'),
                ],
                values: [0, 1, 2],
                initialValue: this._settingsItems['wear-detection-mode'] ?? 1,
            });

            this._wearModeDropdown.connect('notify::selected-item', () => {
                this._updateGsettings('wear-detection-mode',
                    this._wearModeDropdown.selected_item);
            });
            settingsGroup.add(this._wearModeDropdown);
        }

        const settingSignalId = this._settings.connect('changed::edifier-buds-list', () => {
            const updatedList =
                this._settings.get_strv('edifier-buds-list').map(JSON.parse);
            this._settingsItems = updatedList.find(info => info.path === devicePath);
            if (!this._settingsItems)
                return;

            this.title = this._settingsItems.alias;

            if (this._gameModeSwitch)
                this._gameModeSwitch.active = this._settingsItems['game-mode'];

            if (this._inEarSwitch)
                this._inEarSwitch.active = this._settingsItems['in-ear-setting'];

            if (this._wearModeDropdown) {
                this._wearModeDropdown.selected_item =
                    this._settingsItems['wear-detection-mode'];
            }
        });

        this.connect('close-request', () => {
            if (settingSignalId && this._settings)
                this._settings.disconnect(settingSignalId);

            this._settings = null;

            return false;
        });
    }

    _updateGsettings(key, value) {
        const pairedDevice = this._settings.get_strv('edifier-buds-list');
        const existingPathIndex =
                pairedDevice.findIndex(item => JSON.parse(item).path === this._devicePath);
        if (existingPathIndex !== -1) {
            const existingItem = JSON.parse(pairedDevice[existingPathIndex]);
            existingItem[key] = value;
            pairedDevice[existingPathIndex] = JSON.stringify(existingItem);
            this._settings.set_strv('edifier-buds-list', pairedDevice);
        }
    }
});
