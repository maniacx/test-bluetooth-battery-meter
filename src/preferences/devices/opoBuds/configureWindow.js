'use strict';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {
    supportedAudioSingleIcons, supportedAudioDualIcons, supportedCaseIcons
} from '../../../lib/widgets/iconGroups.js';
import {DropDownRowWidget} from './../../widgets/dropDownRowWidget.js';
import {CheckBoxesRowWidget} from './../../widgets/checkBoxesRowWidget.js';
import {IconSelectorWidget} from './../../widgets/iconSelectorWidget.js';
import {RingMyBudsRow} from './../../widgets/ringMyBudsRow.js';
import {EqualizerWidget} from './../../widgets/equalizerWidget.js';
import {OpoBudsModelList} from '../../../lib/devices/opoBuds/opoBudsConfig.js';

export const ConfigureWindow = GObject.registerClass({
    GTypeName: 'BudsLink_OpoBudsConfigureWindow',
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

        this._isCompactMode = false;

        this._breakpointCompact = new Adw.Breakpoint({
            condition: Adw.BreakpointCondition.parse('max-width: 500px'),
        });

        this._breakpointExpanded = new Adw.Breakpoint({
            condition: Adw.BreakpointCondition.parse('min-width: 550px'),
        });

        this.add_breakpoint(this._breakpointCompact);
        this.add_breakpoint(this._breakpointExpanded);

        this._breakpointCompact.connect('apply', () => {
            this._isCompactMode = true;
            this._updateCompactStatus();
        });

        this._breakpointExpanded.connect('apply', () => {
            this._isCompactMode = false;
            this._updateCompactStatus();
        });

        this._settings = settings;
        this._devicePath = devicePath;
        this._gettext = _;
        this.checkBoxWidgets = [];

        const pathsString = settings.get_strv('opo-buds-list').map(JSON.parse);
        this._settingsItems = pathsString.find(info => info.path === devicePath);

        if (!this._settingsItems)
            return;

        this.title = this._settingsItems.alias;

        const vid = this._settingsItems.vid;
        const pid = this._settingsItems.pid;

        this._modelData = OpoBudsModelList.find(model => model.id.vid.includes(vid) &&
            model.id.pid.includes(pid));

        if (!this._modelData)
            return;

        const toolViewBar = new Adw.ToolbarView();
        const headerBar = new Adw.HeaderBar();
        this._page = new Adw.PreferencesPage();

        toolViewBar.add_top_bar(headerBar);
        toolViewBar.set_content(this._page);
        this.set_content(toolViewBar);

        const iconList = this._modelData.batteryMutiple ? supportedAudioDualIcons
            : supportedAudioSingleIcons;

        let caseIconList = [];
        let initialCaseIcon = '';
        if (this._modelData.batteryCase) {
            caseIconList = supportedCaseIcons;
            initialCaseIcon = this._settingsItems['case'];
        }

        const iconSelector = new IconSelectorWidget({
            gtxt: _,
            grpTitle: _('Icon'),
            rowTitle: _('Select Icon'),
            rowSubtitle: _('Select the icon used for the indicator and quick menu'),
            iconList,
            initialIcon: this._settingsItems['icon'],
            caseIconList,
            initialCaseIcon,
            mac,
            fw: this._settingsItems['fw-version'],
        });

        iconSelector.connect('notify::selected-icon', () => {
            this._updateGsettings('icon', iconSelector.selected_icon);
        });

        if (this._modelData.batteryCase) {
            iconSelector.connect('notify::selected-case-icon', () => {
                this._updateGsettings('case', iconSelector.selected_case_icon);
            });
        }

        this._page.add(iconSelector);

        this._addEq();
        this._addMiscSetting();
        this._addGestureControls();

        const settingSignalId = this._settings.connect('changed::opo-buds-list', () => {
            const updatedList = this._settings.get_strv('opo-buds-list').map(JSON.parse);
            this._settingsItems = updatedList.find(info => info.path === devicePath);
            if (!this._settingsItems)
                return;

            this.title = this._settingsItems.alias;

            if (this._modelData.eqPreset)
                this._eqPresetDropdown.selected_item = this._settingsItems['eq-preset'];


            if (this._modelData.ring && this._ringBudsRow)
                this._ringBudsRow.status = this._settingsItems['ring-state'];

            for (const [settingKey, row] of Object.entries(this._gestureRows)) {
                const value = this._settingsItems[settingKey];

                if (value)
                    row.selected_item = value[3];
            }

            for (const {ncRow, dropdown, ncValue} of Object.values(this._noiseControlRows)) {
                if (dropdown)
                    ncRow.visible = dropdown.selected_item === ncValue;
            }

            for (const item of Object.values(this._noiseControlRows))
                item.ncRow.toggled_value = this._settingsItems.longpress;
        });

        this.connect('close-request', () => {
            if (this._modelData.ring) {
                const ringState = this._settingsItems?.['ring-state'];
                if (ringState === 'playing')
                    this._updateGsettings('ring-state', 'stopped');
            }


            if (settingSignalId && this._settings)
                this._settings.disconnect(settingSignalId);

            this._settings = null;

            return false;
        });
    }

    _updateGsettings(key, value) {
        const pairedDevice = this._settings.get_strv('opo-buds-list');
        const existingPathIndex =
                pairedDevice.findIndex(item => JSON.parse(item).path === this._devicePath);
        if (existingPathIndex !== -1) {
            const existingItem = JSON.parse(pairedDevice[existingPathIndex]);
            existingItem[key] = value;
            pairedDevice[existingPathIndex] = JSON.stringify(existingItem);
            this._settings.set_strv('opo-buds-list', pairedDevice);
        }
    }

    _addEq() {
        if (!this._modelData.eqPreset)
            return;

        const _ = this._gettext;

        const eqGroup = new Adw.PreferencesGroup({title: _('Equalizer')});
        this._page.add(eqGroup);

        const presetObj = this._modelData.eqPreset;

        const presetLabels = {
            standard: _('Standard'),
            serenade: _('Voice'),
            bassPlus: _('More Bass'),
            treble: _('More Treble'),
            treblePlus: _('More Treble'),
            original: _('Original Sound'),
            classic: _('Classic'),
            balanced: _('Balanced'),
            powerfulBass: _('Deep Bass'),
        };

        const descriptors = Object.keys(presetObj).filter(key => presetLabels[key] !== undefined)
                .map(key => ({label: presetLabels[key], value: presetObj[key]}));

        const options = descriptors.map(d => d.label);
        const presetValues  = descriptors.map(d => d.value);

        this._eqPresetDropdown = new DropDownRowWidget({
            title: _('Equalizer Preset'),
            options,
            values: presetValues,
            initialValue: this._settingsItems['eq-preset'],
        });

        this._eqPresetDropdown.connect('notify::selected-item', () => {
            this._updateGsettings('eq-preset', this._eqPresetDropdown.selected_item);
        });

        eqGroup.add(this._eqPresetDropdown);
    }

    _addMiscSetting() {
        let miscGroup;
        const _ = this._gettext;

        if (this._modelData.ring) {
            miscGroup = new Adw.PreferencesGroup({title: _('Additional Settings')});
            this._page.add(miscGroup);
        }

        if (this._modelData.ring) {
            this._ringBudsRow = new RingMyBudsRow(_, {dual: false});

            this._ringBudsRow.connect('notify::status', () => {
                this._updateGsettings('ring-state', this._ringBudsRow.status);
            });

            miscGroup.add(this._ringBudsRow);
        }
    }

    _buildNoiseControlRow(title, initialValue) {
        const _ = this._gettext;

        const items = [
            {name: _('Off'), icon: 'bbm-anc-off-symbolic'},
            {name: _('Ambient'), icon: 'bbm-transperancy-symbolic'},
            {name: _('Noise Cancellation'), icon: 'bbm-anc-on-symbolic'},
        ];

        const checkBoxWidget = new CheckBoxesRowWidget({
            rowTitle: _('Noise Control Cycle: ') + title,
            items,
            applyBtnName: _('Apply'),
            initialValue,
            minRequired: 2,
        });

        checkBoxWidget.compact_mode = this._isCompactMode;
        this.checkBoxWidgets.push(checkBoxWidget);

        return checkBoxWidget;
    }

    _addGestureControls() {
        const gc = this._modelData.gestureOptions;
        if (!gc)
            return;

        const _ = this._gettext;

        this._gestureRows = {};
        this._noiseControlRows = {};

        const GESTURE_DISPLAY = {
            'single-tap': _('Single Tap'),
            'double-tap': _('Double Tap'),
            'triple-tap': _('Triple Tap'),
            'action-hold-tap': _('Tap and Hold'),
            'long-action-hold-tap': _('Long Tap and Hold'),

            'single-press': _('Single Press'),
            'double-press': _('Double Press'),
            'triple-press': _('Triple Press'),
            'action-hold-press': _('Press and Hold'),
            'long-action-hold-press': _('Long Press and Hold'),

            'single-pinch': _('Single Pinch'),
            'double-pinch': _('Double Pinch'),
            'triple-pinch': _('Triple Pinch'),
            'action-hold-pinch': _('Pinch and Hold'),
            'long-action-hold-pinch': _('Long Pinch and Hold'),

            'swipe-swipe': _('Swipe'),
        };

        const leftGroup = new Adw.PreferencesGroup({
            title: _('Left Buds Gesture Control'),
        });

        const rightGroup = new Adw.PreferencesGroup({
            title: _('Right Buds Gesture Control'),
        });

        this._page.add(leftGroup);
        this._page.add(rightGroup);

        const createGestureWidget = (gestureKey, gestureConfig, side) => {
            const actions = gestureConfig.actions;
            const title = GESTURE_DISPLAY[`${gestureKey}-${gestureConfig.type}`] ?? gestureKey;
            const options = Object.keys(actions).map(action => this._readableAction(_, action));
            const values = Object.values(actions);
            const settingKey = `${gestureKey}-${side}`;
            const gestureData = this._settingsItems[settingKey];
            const initialValue = gestureData ? gestureData[3] : values[0];
            const hasNCLongpress = gc.noiseControlModes && Object.hasOwn(actions, 'noise-control');
            let dropdown = null;
            let ncRow = null;

            if (options.length > 1) {
                dropdown = new DropDownRowWidget({
                    title,
                    options,
                    values,
                    initialValue,
                });

                this._gestureRows[settingKey] = dropdown;
            }

            if (hasNCLongpress) {
                const ncSettingKey = 'longpress';
                ncRow = this._buildNoiseControlRow(title, this._settingsItems[ncSettingKey]);
                const ncValue = actions['noise-control'];
                this._noiseControlRows[ncSettingKey] = {ncRow, dropdown, ncValue};
                ncRow.visible = !dropdown || dropdown.selected_item === ncValue;
                ncRow.connect('notify::toggled-value', () => {
                    this._updateGsettings(ncSettingKey, ncRow.toggled_value);
                });
            }
            if (dropdown) {
                dropdown.connect('notify::selected-item', () => {
                    const value = dropdown.selected_item;
                    const arr = [...this._settingsItems[settingKey]];

                    arr[3] = value;

                    this._updateGsettings(settingKey, arr);

                    if (ncRow)
                        ncRow.visible = value === actions['noise-control'];
                });
            }

            return {dropdown, ncRow};
        };

        for (const [gestureKey, gestureConfig] of Object.entries(gc.gestures)) {
            const leftWidgets = createGestureWidget(gestureKey, gestureConfig, 'left');

            if (leftWidgets.dropdown)
                leftGroup.add(leftWidgets.dropdown);

            if (leftWidgets.ncRow)
                leftGroup.add(leftWidgets.ncRow);

            const rightWidgets = createGestureWidget(gestureKey, gestureConfig, 'right');

            if (rightWidgets.dropdown)
                rightGroup.add(rightWidgets.dropdown);

            if (rightWidgets.ncRow)
                rightGroup.add(rightWidgets.ncRow);
        }
    }

    _readableAction(_, action) {
        switch (action) {
            case 'play-pause':
                return _('Play / Pause');

            case 'skip-back':
                return _('Previous Track');

            case 'skip-forward':
                return _('Next Track');

            case 'voice-assistant':
                return _('Voice Assistant');

            case 'volume-up':
                return _('Volume Up');

            case 'volume-down':
                return _('Volume Down');

            case 'noise-control':
                return _('Noise Control');

            case 'no-action':
                return _('No Action');

            case 'change-volume':
                return _('Change Volume');

            case 'game-mode':
                return _('Toggle Low Latency');

            default:
                return action;
        }
    }

    _updateCompactStatus() {
        for (const widget of this.checkBoxWidgets)
            widget.set_property('compact-mode', this._isCompactMode);
    }
});
