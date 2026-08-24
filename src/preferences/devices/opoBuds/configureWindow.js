'use strict';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import {DropDownRowWidget} from '../../widgets/dropDownRowWidget.js';
import {IconSelectorWidget} from '../../widgets/iconSelectorWidget.js';
import {RingMyBudsRow} from '../../widgets/ringMyBudsRow.js';
import {
    supportedAudioDualIcons, supportedAudioSingleIcons, supportedCaseIcons
} from '../../../lib/widgets/iconGroups.js';
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

        this._settings = settings;
        this._devicePath = devicePath;
        this._gettext = _;

        const pathsString = settings.get_strv('opo-buds-list').map(JSON.parse);
        this._settingsItems = pathsString.find(info => info.path === devicePath || info['device-path'] === devicePath);

        if (!this._settingsItems)
            return;

        this.title = this._settingsItems.alias;

        this._modelData =
            OpoBudsModelList.find(m => m.modelId === this._settingsItems.modelid);

        if (!this._modelData)
            return;

        const toolViewBar = new Adw.ToolbarView();
        const headerBar = new Adw.HeaderBar();
        this._page = new Adw.PreferencesPage();

        toolViewBar.add_top_bar(headerBar);
        toolViewBar.set_content(this._page);
        this.set_content(toolViewBar);

        const iconList = this._modelData.batteryLR ? supportedAudioDualIcons
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
            initialIcon: this._settingsItems['icon'] ?? 'earbuds-stem',
            caseIconList,
            initialCaseIcon,
            mac,
            fw: this._settingsItems['fw-version'],
            serial: this._settingsItems['serial'],
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
        this._addAudioEffects();
        this._addMiscSetting();
        this._addGestureControls();

        this._isUpdatingUI = false;

        this._settingsHandlerId = this._settings.connect('changed::opo-buds-list', () => {
            if (this._isUpdatingUI)
                return;

            const list = this._settings.get_strv('opo-buds-list').map(JSON.parse);
            const item = list.find(d => d.path === this._devicePath || d['device-path'] === this._devicePath);
            if (!item)
                return;

            this._isUpdatingUI = true;
            try {
                this._settingsItems = item;

                if (this._modelData.eqPreset && this._eqPresetDropdown)
                    this._eqPresetDropdown.selected_item = this._settingsItems['eq-preset'];

                if (this._modelData.dynamicBass && this._dynamicBassSwitch)
                    this._dynamicBassSwitch.active = this._settingsItems['dynamic-bass'] ?? false;

                if (this._modelData.spatialAudio && this._spatialAudioSwitch)
                    this._spatialAudioSwitch.active = this._settingsItems['spatial'] ?? false;

                if (this._modelData.volumeEnhancer && this._volumeEnhancerSwitch)
                    this._volumeEnhancerSwitch.active = this._settingsItems['volume-enhancer'] ?? false;

                if (this._modelData.highResAudio && this._highResSwitch)
                    this._highResSwitch.active = this._settingsItems['high-res'] ?? false;

                if (this._modelData.windNoiseReduction && this._windNoiseSwitch)
                    this._windNoiseSwitch.active = this._settingsItems['wind-noise'] ?? false;

                if (this._modelData.lowLatencyMode && this._lowLatencySwitch)
                    this._lowLatencySwitch.active = this._settingsItems['lowlatency'] ?? false;

                if (this._modelData.inEarDetection && this._inEarSwitch)
                    this._inEarSwitch.active = this._settingsItems['inear-enable'] ?? false;

                if (this._modelData.autoAnswer && this._autoAnswerSwitch)
                    this._autoAnswerSwitch.active = this._settingsItems['auto-answer'] ?? false;

                if (this._modelData.findMyPhone && this._findPhoneSwitch)
                    this._findPhoneSwitch.active = this._settingsItems['find-phone'] ?? false;

                if (this._modelData.gestureOptions && this._gestureDropdowns) {
                    const gesturesHex = this._settingsItems['gestures'] ?? this._modelData.gestureOptions.default;
                    const slots = this._decodeGestures(gesturesHex);
                    Object.entries(this._gestureDropdowns).forEach(([slotKey, dropdown]) => {
                        if (slots[slotKey] !== undefined && dropdown.selected_item !== slots[slotKey])
                            dropdown.selected_item = slots[slotKey];
                    });
                }
            } finally {
                this._isUpdatingUI = false;
            }
        });

        this.connect('close-request', () => {
            if (this._modelData?.ring) {
                const ringState = this._settingsItems?.['ring-state'];
                if (ringState === 'playing')
                    this._updateGsettings('ring-state', 'stopped');
            }

            if (this._settingsHandlerId) {
                this._settings.disconnect(this._settingsHandlerId);
                this._settingsHandlerId = null;
            }
        });
    }

    _updateGsettings(key, value) {
        const currentList = this._settings.get_strv('opo-buds-list').map(JSON.parse);
        const index = currentList.findIndex(d => d.path === this._devicePath || d['device-path'] === this._devicePath);

        if (index !== -1) {
            currentList[index][key] = value;
            this._settingsItems[key] = value;
            this._settings.set_strv('opo-buds-list', currentList.map(JSON.stringify));
        }
    }

    _addEq() {
        if (!this._modelData.eqPreset)
            return;

        const _ = this._gettext;
        const eqGroup = new Adw.PreferencesGroup({
            title: _('Equalizer'),
        });

        const presetLabels = {
            original_sound: _('Original Sound (Balanced)'),
            deep_bass: _('Deep Bass'),
            serenade: _('Serenade (Vocal)'),
            clear_bass: _('Clear Bass'),
        };

        const options = [];
        const values = [];

        Object.entries(this._modelData.eqPreset).forEach(([key, val]) => {
            options.push(presetLabels[key] ?? key);
            values.push(val);
        });

        this._eqPresetDropdown = new DropDownRowWidget({
            title: _('Equalizer Preset'),
            subtitle: _('Select audio profile'),
            options,
            values,
            initialValue: this._settingsItems['eq-preset'] ?? values[0],
        });

        this._eqPresetDropdown.connect('notify::selected-item', () => {
            this._updateGsettings('eq-preset', this._eqPresetDropdown.selected_item);
        });

        eqGroup.add(this._eqPresetDropdown);
        this._page.add(eqGroup);
    }

    _addAudioEffects() {
        const _ = this._gettext;
        const hasEffects = this._modelData.dynamicBass || this._modelData.spatialAudio ||
            this._modelData.volumeEnhancer || this._modelData.highResAudio ||
            this._modelData.windNoiseReduction;

        if (!hasEffects)
            return;

        const effectsGroup = new Adw.PreferencesGroup({
            title: _('Audio Effects'),
        });

        if (this._modelData.dynamicBass) {
            this._dynamicBassSwitch = new Adw.SwitchRow({
                title: _('Dynamic Bass Boost'),
                subtitle: _('Dynamically enhances low frequency bass in real-time'),
                active: this._settingsItems['dynamic-bass'] ?? false,
            });

            this._dynamicBassSwitch.connect('notify::active', () => {
                this._updateGsettings('dynamic-bass', this._dynamicBassSwitch.active);
            });

            effectsGroup.add(this._dynamicBassSwitch);
        }

        if (this._modelData.spatialAudio) {
            this._spatialAudioSwitch = new Adw.SwitchRow({
                title: _('Spatial Audio'),
                subtitle: _('Immersive 3D surround sound experience'),
                active: this._settingsItems['spatial'] ?? false,
            });

            this._spatialAudioSwitch.connect('notify::active', () => {
                this._updateGsettings('spatial', this._spatialAudioSwitch.active);
            });

            effectsGroup.add(this._spatialAudioSwitch);
        }

        if (this._modelData.volumeEnhancer) {
            this._volumeEnhancerSwitch = new Adw.SwitchRow({
                title: _('Volume Enhancer'),
                subtitle: _('Boost overall sound output for louder playback'),
                active: this._settingsItems['volume-enhancer'] ?? false,
            });

            this._volumeEnhancerSwitch.connect('notify::active', () => {
                this._updateGsettings('volume-enhancer', this._volumeEnhancerSwitch.active);
            });

            effectsGroup.add(this._volumeEnhancerSwitch);
        }

        if (this._modelData.highResAudio) {
            this._highResSwitch = new Adw.SwitchRow({
                title: _('High-Res Audio (LHDC / LDAC)'),
                subtitle: _('Enable high-definition Bluetooth audio codec streaming'),
                active: this._settingsItems['high-res'] ?? false,
            });

            this._highResSwitch.connect('notify::active', () => {
                this._updateGsettings('high-res', this._highResSwitch.active);
            });

            effectsGroup.add(this._highResSwitch);
        }

        if (this._modelData.windNoiseReduction) {
            this._windNoiseSwitch = new Adw.SwitchRow({
                title: _('Smart Wind Noise Reduction'),
                subtitle: _('Suppress turbulent wind noise during outdoor use'),
                active: this._settingsItems['wind-noise'] ?? false,
            });

            this._windNoiseSwitch.connect('notify::active', () => {
                this._updateGsettings('wind-noise', this._windNoiseSwitch.active);
            });

            effectsGroup.add(this._windNoiseSwitch);
        }

        this._page.add(effectsGroup);
    }

    _addMiscSetting() {
        const _ = this._gettext;
        const hasMisc = this._modelData.lowLatencyMode || this._modelData.inEarDetection ||
            this._modelData.dualConnection || this._modelData.autoAnswer || this._modelData.ring;

        if (!hasMisc)
            return;

        const miscGroup = new Adw.PreferencesGroup({
            title: _('Additional Settings'),
        });

        if (this._modelData.lowLatencyMode) {
            this._lowLatencySwitch = new Adw.SwitchRow({
                title: _('Game Mode'),
                subtitle: _('Reduce audio latency for responsive gaming'),
                active: this._settingsItems['lowlatency'] ?? false,
            });

            this._lowLatencySwitch.connect('notify::active', () => {
                this._updateGsettings('lowlatency', this._lowLatencySwitch.active);
            });

            miscGroup.add(this._lowLatencySwitch);
        }

        if (this._modelData.inEarDetection) {
            this._inEarSwitch = new Adw.SwitchRow({
                title: _('In-Ear Detection'),
                subtitle: _('Auto-pause audio playback when earbud is removed'),
                active: this._settingsItems['inear-enable'] ?? false,
            });

            this._inEarSwitch.connect('notify::active', () => {
                this._updateGsettings('inear-enable', this._inEarSwitch.active);
            });

            miscGroup.add(this._inEarSwitch);
        }

        if (this._modelData.dualConnection) {
            this._dualConnectionSwitch = new Adw.SwitchRow({
                title: _('Dual Device Connection'),
                subtitle: _('Connect to two Bluetooth audio devices simultaneously'),
                active: this._settingsItems['dual-connection'] ?? false,
            });

            this._dualConnectionSwitch.connect('notify::active', () => {
                this._updateGsettings('dual-connection', this._dualConnectionSwitch.active);
            });

            miscGroup.add(this._dualConnectionSwitch);
        }

        if (this._modelData.autoAnswer) {
            this._autoAnswerSwitch = new Adw.SwitchRow({
                title: _('Auto Answer Calls'),
                subtitle: _('Automatically answer incoming calls when putting on earbuds'),
                active: this._settingsItems['auto-answer'] ?? false,
            });

            this._autoAnswerSwitch.connect('notify::active', () => {
                this._updateGsettings('auto-answer', this._autoAnswerSwitch.active);
            });

            miscGroup.add(this._autoAnswerSwitch);
        }

        if (this._modelData.findMyPhone) {
            this._findPhoneSwitch = new Adw.SwitchRow({
                title: _('Find My Phone'),
                subtitle: _('Allow triggering phone ringing from neckband controls'),
                active: this._settingsItems['find-phone'] ?? false,
            });

            this._findPhoneSwitch.connect('notify::active', () => {
                this._updateGsettings('find-phone', this._findPhoneSwitch.active);
            });

            miscGroup.add(this._findPhoneSwitch);
        }

        if (this._modelData.ring) {
            const ringRow = new RingMyBudsRow(_, {
                title: _('Find My Buds'),
                subtitle: _('Play a tone to locate your misplaced earbuds'),
                dual: false,
            });

            ringRow.connect('notify::status', () => {
                this._updateGsettings('ring-state', ringRow.status);
            });

            miscGroup.add(ringRow);
        }

        this._page.add(miscGroup);
    }

    _addGestureControls() {
        if (!this._modelData.gestureOptions)
            return;

        const _ = this._gettext;
        const gesturesConfig = this._modelData.gestureOptions;
        this._gestureDropdowns = {};
        this._ncCycleSwitches = null;

        const gestureGroup = new Adw.PreferencesGroup({
            title: _('Gesture &amp; Button Controls'),
            description: _('Customize actions for buttons and touch gestures'),
        });

        const gestureActionNames = {
            'none': _('None'),
            'play-pause': _('Play / Pause'),
            'skip-forward': _('Next Track'),
            'skip-back': _('Previous Track'),
            'volume-up': _('Volume Up'),
            'volume-down': _('Volume Down'),
            'voice-assistant': _('Voice Assistant'),
            'voice-assistant-hold': _('Voice Assistant'),
            'noise-control': _('Noise Control'),
            'game-mode': _('Game Mode Toggle'),
            'device-switch': _('Switch Device / Voice Assistant'),
        };

        const gestureSlotNames = {
            'single': _('Single-tap'),
            'double': _('Double-tap'),
            'triple': _('Triple-tap'),
            'action-hold': _('Touch &amp; Hold'),
            'anc-single': _('Single-tap'),
            'double-action-hold': _('Double Tap &amp; Hold'),
        };

        const currentGesturesHex = this._settingsItems['gestures'] ?? gesturesConfig.default;
        const currentSlots = this._decodeGestures(currentGesturesHex);

        const groups = [...new Set(gesturesConfig.slots.map(s => s.group))];

        groups.forEach(groupKey => {
            const groupExpander = new Adw.ExpanderRow({
                title: this._getGroupTitle(groupKey),
                subtitle: _('Configure controls'),
            });

            gesturesConfig.slots.filter(s => s.group === groupKey).forEach(slot => {
                const gestureDef = gesturesConfig.gestures[slot.type];
                if (!gestureDef)
                    return;

                const allowedActions = gestureDef.actions;
                const options = [];
                const values = [];

                allowedActions.forEach(actionKey => {
                    options.push(gestureActionNames[actionKey] ?? actionKey);
                    values.push(gesturesConfig.mapping.actions[actionKey]?.[0] ?? 0);
                });

                const btnId = slot.buttonId ?? 0x01;
                const slotKey = `${slot.device}_${btnId}_${gesturesConfig.mapping.gestureTypes[slot.type]}`;
                const currentFuncCode = currentSlots[slotKey] !== undefined ? currentSlots[slotKey] : values[0];
                const rowTitle = gestureSlotNames[slot.type] ?? slot.type;

                const dropdown = new DropDownRowWidget({
                    title: rowTitle,
                    options,
                    values,
                    initialValue: currentFuncCode,
                });

                this._gestureDropdowns[slotKey] = dropdown;
                dropdown.connect('notify::selected-item', () => {
                    if (this._isUpdatingUI)
                        return;

                    currentSlots[slotKey] = dropdown.selected_item;
                    const newHex = this._encodeGestures(currentSlots, currentGesturesHex);
                    this._updateGsettings('gestures', newHex);
                });

                groupExpander.add_row(dropdown);
            });

            gestureGroup.add(groupExpander);
        });

        this._page.add(gestureGroup);
    }

    _getGroupTitle(group) {
        const _ = this._gettext;
        switch (group) {
            case 'left':
                return _('Left Earbud');
            case 'right':
                return _('Right Earbud');
            case 'single':
                return _('Button Controls');
            case 'mfb':
                return _('Multi-Function Button');
            default:
                return _('Button & Gesture Controls');
        }
    }

    _decodeGestures(hex) {
        const slots = {};
        for (let i = 0; i < hex.length; i += 8) {
            const dev = parseInt(hex.slice(i, i + 2), 16);
            const btn = parseInt(hex.slice(i + 2, i + 4), 16);
            const act = parseInt(hex.slice(i + 4, i + 6), 16);
            const func = parseInt(hex.slice(i + 6, i + 8), 16);
            slots[`${dev}_${btn}_${act}`] = func;
        }
        return slots;
    }

    _encodeGestures(slotMap, baseHex) {
        let hex = '';
        for (let i = 0; i < baseHex.length; i += 8) {
            const dev = parseInt(baseHex.slice(i, i + 2), 16);
            const btn = parseInt(baseHex.slice(i + 2, i + 4), 16);
            const act = parseInt(baseHex.slice(i + 4, i + 6), 16);
            const origFunc = parseInt(baseHex.slice(i + 6, i + 8), 16);

            const key = `${dev}_${btn}_${act}`;
            const func = slotMap[key] !== undefined ? slotMap[key] : origFunc;

            hex += dev.toString(16).padStart(2, '0');
            hex += btn.toString(16).padStart(2, '0');
            hex += act.toString(16).padStart(2, '0');
            hex += func.toString(16).padStart(2, '0');
        }
        return hex;
    }
});
