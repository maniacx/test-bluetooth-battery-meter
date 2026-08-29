'use strict';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

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
        this._settingsItems = pathsString.find(info => info.path === devicePath);

        if (!this._settingsItems)
            return;

        this.title = this._settingsItems.alias;

        this._modelData = OpoBudsModelList.find(m => m.modelId === this._settingsItems.modelid);

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
        this._addAudioEffects();
        this._addMiscSetting();
        this._addGestureControls();

        this._isUpdatingUI = false;

        this._settingsHandlerId = this._settings.connect('changed::opo-buds-list', () => {
            if (this._isUpdatingUI)
                return;

            const list = this._settings.get_strv('opo-buds-list').map(JSON.parse);
            const item = list.find(d => d.path === this._devicePath);

            if (!item)
                return;

            this._isUpdatingUI = true;
            try {
                this._settingsItems = item;

                if (this._modelData.eqPreset && this._eqPresetDropdown)
                    this._eqPresetDropdown.selected_item = this._settingsItems['eq-preset'];

                if (this._modelData.dynamicBass && this._dynamicBassSwitch)
                    this._dynamicBassSwitch.active = this._settingsItems['dynamic-bass'];

                if (this._modelData.spatialAudio && this._spatialAudioSwitch)
                    this._spatialAudioSwitch.active = this._settingsItems['spatial'];

                if (this._modelData.volumeEnhancer && this._volumeEnhancerSwitch)
                    this._volumeEnhancerSwitch.active = this._settingsItems['volume-enhancer'];

                if (this._modelData.highResAudio && this._highResSwitch)
                    this._highResSwitch.active = this._settingsItems['high-res'];

                if (this._modelData.windNoiseReduction && this._windNoiseSwitch)
                    this._windNoiseSwitch.active = this._settingsItems['wind-noise'];

                if (this._modelData.lowLatencyMode && this._lowLatencySwitch)
                    this._lowLatencySwitch.active = this._settingsItems['lowlatency'];

                if (this._modelData.inEarDetection && this._inEarSwitch)
                    this._inEarSwitch.active = this._settingsItems['inear-enable'];

                if (this._modelData.autoAnswer && this._autoAnswerSwitch)
                    this._autoAnswerSwitch.active = this._settingsItems['auto-answer'];

                if (this._modelData.findMyPhone && this._findPhoneSwitch)
                    this._findPhoneSwitch.active = this._settingsItems['find-phone'];

                if (this._modelData.gestureOptions && this._gestureDropdowns) {
                    const gesturesHex = this._settingsItems['gestures'] ??
                            this._buildPlaceholderGesturesHex(this._modelData.gestureOptions);

                    const slots = this._decodeGestures(gesturesHex);
                    Object.entries(this._gestureDropdowns).forEach(([slotKey, dropdown]) => {
                        if (slots[slotKey] !== undefined &&
                                dropdown.selected_item !== slots[slotKey])
                            dropdown.selected_item = slots[slotKey];
                    });
                }

                if (this._modelData.noiseControl && this._ancCycleSwitchOff) {
                    const mask = this._settingsItems['nc-cycle-mask'] ?? 0x0B;
                    this._ancCycleSwitchOff.active = (mask & 0x01) !== 0;
                    this._ancCycleSwitchTrans.active = (mask & 0x02) !== 0;
                    this._ancCycleSwitchAnc.active = (mask & 0x08) !== 0;
                }

                if (this._modelData.fitTest && this._fitTestResultLabel) {
                    const res = this._settingsItems['fit-test-result'] ?? 0;
                    this._renderFitTestBadge(res);
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
        const index = currentList.findIndex(d => d.path === this._devicePath);

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
            const isDynamicBassActive = this._settingsItems['dynamic-bass'] ?? false;
            const dynamicAudioExpander = new Adw.ExpanderRow({
                title: _('Dynamic Audio'),
                subtitle: _('Real-time dynamic bass and 3-band equalization'),
                show_enable_switch: true,
                enable_expansion: isDynamicBassActive,
                expanded: isDynamicBassActive,
            });

            dynamicAudioExpander.connect('notify::enable-expansion', () => {
                const enabled = dynamicAudioExpander.enable_expansion;
                dynamicAudioExpander.expanded = enabled;
                this._updateGsettings('dynamic-bass', enabled);
            });

            const createFreqScaleRow = (label, gsettingsKey) => {
                const row = new Adw.ActionRow({
                    title: label,
                });
                const adjustment = new Gtk.Adjustment({
                    lower: -5,
                    upper: 5,
                    step_increment: 1,
                    page_increment: 1,
                    value: this._settingsItems[gsettingsKey] ?? 0,
                });
                const scale = new Gtk.Scale({
                    orientation: Gtk.Orientation.HORIZONTAL,
                    adjustment,
                    draw_value: true,
                    value_pos: Gtk.PositionType.RIGHT,
                    hexpand: true,
                    width_request: 180,
                    digits: 0,
                    round_digits: 0,
                });
                scale.set_digits(0);
                scale.set_round_digits(0);
                scale.add_mark(-5, Gtk.PositionType.BOTTOM, '-5');
                scale.add_mark(0, Gtk.PositionType.BOTTOM, '0');
                scale.add_mark(5, Gtk.PositionType.BOTTOM, '+5');
                scale.connect('value-changed', () => {
                    const val = Math.round(scale.get_value());
                    this._updateGsettings(gsettingsKey, val);
                });
                row.add_suffix(scale);
                return row;
            };

            dynamicAudioExpander.add_row(createFreqScaleRow(_('Low Frequency'), 'dynamic-audio-low'));
            dynamicAudioExpander.add_row(createFreqScaleRow(_('Mid Frequency'), 'dynamic-audio-med'));
            dynamicAudioExpander.add_row(createFreqScaleRow(_('High Frequency'), 'dynamic-audio-high'));

            effectsGroup.add(dynamicAudioExpander);
        }

        if (this._modelData.spatialAudio) {
            this._spatialAudioSwitch = new Adw.SwitchRow({
                title: _('Spatial Audio'),
                subtitle: _('Immersive 3D surround sound experience'),
                active: this._settingsItems['spatial'],
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
                active: this._settingsItems['volume-enhancer'],
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
                active: this._settingsItems['high-res'],
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
                active: this._settingsItems['wind-noise'],
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
            this._modelData.dualConnection || this._modelData.autoAnswer ||
            this._modelData.fitTest || this._modelData.findMyPhone || this._modelData.ring;

        if (!hasMisc)
            return;

        const miscGroup = new Adw.PreferencesGroup({
            title: _('Additional Settings'),
        });

        if (this._modelData.lowLatencyMode) {
            this._lowLatencySwitch = new Adw.SwitchRow({
                title: _('Game Mode'),
                subtitle: _('Reduce audio latency for responsive gaming'),
                active: this._settingsItems['lowlatency'],
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
                active: this._settingsItems['inear-enable'],
            });

            this._inEarSwitch.connect('notify::active', () => {
                this._updateGsettings('inear-enable', this._inEarSwitch.active);
            });

            miscGroup.add(this._inEarSwitch);
        }

        if (this._modelData.dualConnection) {
            const multiDevices = this._settingsItems['multi-devices'] ?? [];
            if (multiDevices.length > 0) {
                const isDualActive = this._settingsItems['dual-connection'] ?? false;
                const dualDeviceExpander = new Adw.ExpanderRow({
                    title: _('Dual Device Connection'),
                    subtitle: _('Connect to two Bluetooth audio devices simultaneously'),
                    show_enable_switch: true,
                    enable_expansion: isDualActive,
                    expanded: isDualActive,
                });

                dualDeviceExpander.connect('notify::enable-expansion', () => {
                    const enabled = dualDeviceExpander.enable_expansion;
                    dualDeviceExpander.expanded = enabled;
                    this._updateGsettings('dual-connection', enabled);
                });

                multiDevices.forEach(dev => {
                    let statusLabel = _('Paired');
                    if (dev.isConnected) {
                        if (dev.isCurrent)
                            statusLabel = _('Current Host (Connected)');
                        else if (dev.isAudioActive)
                            statusLabel = _('Audio Streaming (Connected)');
                        else
                            statusLabel = _('Connected');
                    }

                    const devRow = new Adw.ActionRow({
                        title: dev.name || dev.mac,
                        subtitle: `${dev.mac} • ${statusLabel}`,
                    });

                    const btnBox = new Gtk.Box({
                        orientation: Gtk.Orientation.HORIZONTAL,
                        spacing: 6,
                        valign: Gtk.Align.CENTER,
                    });

                    if (dev.isConnected) {
                        const priorityBtn = new Gtk.Button({
                            label: _('Priority'),
                            valign: Gtk.Align.CENTER,
                            css_classes: ['flat', 'suggested-action'],
                            tooltip_text: _('Set audio priority to this device'),
                        });
                        priorityBtn.connect('clicked', () => {
                            this._updateGsettings('multi-device-op', {op: 0x04, mac: dev.mac, ts: Date.now()});
                        });
                        btnBox.append(priorityBtn);

                        const disconnectBtn = new Gtk.Button({
                            label: _('Disconnect'),
                            valign: Gtk.Align.CENTER,
                            css_classes: ['flat'],
                        });
                        disconnectBtn.connect('clicked', () => {
                            this._updateGsettings('multi-device-op', {op: 0x02, mac: dev.mac, ts: Date.now()});
                        });
                        btnBox.append(disconnectBtn);
                    } else {
                        const connectBtn = new Gtk.Button({
                            label: _('Connect'),
                            valign: Gtk.Align.CENTER,
                            css_classes: ['flat', 'suggested-action'],
                        });
                        connectBtn.connect('clicked', () => {
                            this._updateGsettings('multi-device-op', {op: 0x01, mac: dev.mac, ts: Date.now()});
                        });
                        btnBox.append(connectBtn);

                        const unpairBtn = new Gtk.Button({
                            label: _('Unpair'),
                            valign: Gtk.Align.CENTER,
                            css_classes: ['flat', 'destructive-action'],
                        });
                        unpairBtn.connect('clicked', () => {
                            this._updateGsettings('multi-device-op', {op: 0x03, mac: dev.mac, ts: Date.now()});
                        });
                        btnBox.append(unpairBtn);
                    }

                    devRow.add_suffix(btnBox);
                    dualDeviceExpander.add_row(devRow);
                });

                miscGroup.add(dualDeviceExpander);
            } else {
                this._dualConnectionSwitch = new Adw.SwitchRow({
                    title: _('Dual Device Connection'),
                    subtitle: _('Connect to two Bluetooth audio devices simultaneously'),
                    active: this._settingsItems['dual-connection'],
                });

                this._dualConnectionSwitch.connect('notify::active', () => {
                    this._updateGsettings('dual-connection', this._dualConnectionSwitch.active);
                });

                miscGroup.add(this._dualConnectionSwitch);
            }
        }

        if (this._modelData.autoAnswer) {
            this._autoAnswerSwitch = new Adw.SwitchRow({
                title: _('Auto Answer Calls'),
                subtitle: _('Automatically answer incoming calls when putting on earbuds'),
                active: this._settingsItems['auto-answer'],
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
                active: this._settingsItems['find-phone'],
            });

            this._findPhoneSwitch.connect('notify::active', () => {
                this._updateGsettings('find-phone', this._findPhoneSwitch.active);
            });

            miscGroup.add(this._findPhoneSwitch);
        }

        if (this._modelData.fitTest) {
            const fitTestRow = new Adw.ActionRow({
                title: _('Earbud Fit Test'),
                subtitle: _('Test the acoustic seal of your earbuds for optimal audio and ANC'),
            });

            const fitBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
                valign: Gtk.Align.CENTER,
            });

            this._fitTestResultLabel = new Gtk.Label({
                valign: Gtk.Align.CENTER,
            });

            const initialRes = this._settingsItems['fit-test-result'] ?? 0;
            this._renderFitTestBadge(initialRes);

            this._fitTestBtn = new Gtk.Button({
                valign: Gtk.Align.CENTER,
                css_classes: ['suggested-action'],
                child: new Adw.ButtonContent({
                    icon_name: 'bbm-play-symbolic',
                    label: _('Test Fit'),
                }),
            });

            this._fitTestBtn.connect('clicked', () => {
                this._fitTestBtn.sensitive = false;
                this._fitTestResultLabel.label = _('Testing…');
                this._fitTestResultLabel.css_classes = ['dim-label'];
                this._updateGsettings('fit-test-op', {action: 'start', ts: Date.now()});

                GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 4, () => {
                    this._fitTestBtn.sensitive = true;
                    const curRes = this._settingsItems['fit-test-result'] ?? 1;
                    this._renderFitTestBadge(curRes);
                    return GLib.SOURCE_REMOVE;
                });
            });

            fitBox.append(this._fitTestResultLabel);
            fitBox.append(this._fitTestBtn);
            fitTestRow.add_suffix(fitBox);
            miscGroup.add(fitTestRow);
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
            'noise-control': _('Noise Control'),
            'game-mode': _('Game Mode'),
            'device-switch': _('Switch Device'),
        };

        const gestureSlotNames = {
            'single': _('Single-tap'),
            'double': _('Double-tap'),
            'triple': _('Triple-tap'),
            'action-hold': _('Touch &amp; Hold'),
            'anc-single': _('Single-tap'),
            'double-action-hold': _('Double Tap &amp; Hold'),
        };

        const currentGesturesHex = this._settingsItems['gestures'] ??
            this._buildPlaceholderGesturesHex(gesturesConfig);
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

                const allowedActions = slot.actions ?? gestureDef.actions;
                const options = [];
                const values = [];

                allowedActions.forEach(actionKey => {
                    options.push(gestureActionNames[actionKey] ?? actionKey);
                    values.push(gesturesConfig.mapping.actions[actionKey]?.[0] ?? 0);
                });

                const btnId = slot.buttonId ?? 0x01;
                const slotKey =
                    `${slot.device}_${btnId}_${gesturesConfig.mapping.gestureTypes[slot.type]}`;

                const currentFuncCode =
                     currentSlots[slotKey] !== undefined ? currentSlots[slotKey] : values[0];

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
                    const newHex = this._encodeGestures(currentSlots, gesturesConfig);
                    this._updateGsettings('gestures', newHex);
                });

                groupExpander.add_row(dropdown);
            });

            gestureGroup.add(groupExpander);
        });

        this._page.add(gestureGroup);

        if (this._modelData.noiseControl) {
            const initialMask = this._settingsItems['nc-cycle-mask'] ?? 0x0B;

            const ncCycleGroup = new Adw.PreferencesGroup({
                title: _('Noise Control Button Cycling'),
                description: _('Select modes to cycle through when pressing the earbud/neckband button (minimum 2 required)'),
            });

            this._ancCycleSwitchAnc = new Adw.SwitchRow({
                title: _('Noise Cancellation'),
                subtitle: _('Block out ambient background noise'),
                icon_name: 'bbm-anc-on-symbolic',
                active: (initialMask & 0x08) !== 0,
            });

            this._ancCycleSwitchTrans = new Adw.SwitchRow({
                title: _('Transparency'),
                subtitle: _('Hear external sounds and voices clearly'),
                icon_name: 'bbm-transperancy-symbolic',
                active: (initialMask & 0x02) !== 0,
            });

            this._ancCycleSwitchOff = new Adw.SwitchRow({
                title: _('Off'),
                subtitle: _('Disable active noise cancellation and transparency'),
                icon_name: 'bbm-anc-off-symbolic',
                active: (initialMask & 0x01) !== 0,
            });

            const onCycleSwitchToggled = toggledSwitch => {
                if (this._isUpdatingUI)
                    return;

                const anc = this._ancCycleSwitchAnc.active;
                const trans = this._ancCycleSwitchTrans.active;
                const off = this._ancCycleSwitchOff.active;
                const count = (anc ? 1 : 0) + (trans ? 1 : 0) + (off ? 1 : 0);

                if (count < 2) {
                    this._isUpdatingUI = true;
                    toggledSwitch.active = true;
                    this._isUpdatingUI = false;
                    return;
                }

                const mask = (off ? 0x01 : 0x00) | (trans ? 0x02 : 0x00) | (anc ? 0x08 : 0x00);
                this._updateGsettings('nc-cycle-mask', mask);
            };

            this._ancCycleSwitchAnc.connect('notify::active', () => onCycleSwitchToggled(this._ancCycleSwitchAnc));
            this._ancCycleSwitchTrans.connect('notify::active', () => onCycleSwitchToggled(this._ancCycleSwitchTrans));
            this._ancCycleSwitchOff.connect('notify::active', () => onCycleSwitchToggled(this._ancCycleSwitchOff));

            ncCycleGroup.add(this._ancCycleSwitchAnc);
            ncCycleGroup.add(this._ancCycleSwitchTrans);
            ncCycleGroup.add(this._ancCycleSwitchOff);
            this._page.add(ncCycleGroup);
        }
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
            case 'anc':
                return _('Noise Control (ANC) Button');
            default:
                return _('Button & Gesture Controls');
        }
    }

    _buildPlaceholderGesturesHex(gesturesConfig) {
        let hex = '';
        gesturesConfig.slots.forEach(slot => {
            const gestureDef = gesturesConfig.gestures[slot.type];
            const allowedActions = slot.actions ?? gestureDef?.actions;
            if (!allowedActions?.length)
                return;

            const firstAction = allowedActions[0];
            const func = gesturesConfig.mapping.actions[firstAction]?.[0] ?? 0;
            const btnId = slot.buttonId ?? 0x01;
            const act = gesturesConfig.mapping.gestureTypes[slot.type];

            hex += slot.device.toString(16).padStart(2, '0');
            hex += btnId.toString(16).padStart(2, '0');
            hex += act.toString(16).padStart(2, '0');
            hex += func.toString(16).padStart(2, '0');
        });
        return hex;
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

    _encodeGestures(slotMap, gesturesConfig) {
        let hex = '';
        gesturesConfig.slots.forEach(slot => {
            const btnId = slot.buttonId ?? 0x01;
            const act = gesturesConfig.mapping.gestureTypes[slot.type];
            const key = `${slot.device}_${btnId}_${act}`;
            const gestureDef = gesturesConfig.gestures[slot.type];
            const defaultFunc = gestureDef?.actions?.length
                ? gesturesConfig.mapping.actions[gestureDef.actions[0]]?.[0] ?? 0
                : 0;
            const func = slotMap[key] !== undefined ? slotMap[key] : defaultFunc;

            hex += slot.device.toString(16).padStart(2, '0');
            hex += btnId.toString(16).padStart(2, '0');
            hex += act.toString(16).padStart(2, '0');
            hex += func.toString(16).padStart(2, '0');
        });
        return hex;
    }

    _renderFitTestBadge(statusCode) {
        const _ = this._gettext;
        if (!this._fitTestResultLabel)
            return;

        if (statusCode === 1) {
            this._fitTestResultLabel.label = _('✓ Good Earbud Seal');
            this._fitTestResultLabel.css_classes = ['success', 'heading'];
        } else if (statusCode === 2) {
            this._fitTestResultLabel.label = _('⚠ Adjust Left Earbud');
            this._fitTestResultLabel.css_classes = ['warning', 'heading'];
        } else if (statusCode === 3) {
            this._fitTestResultLabel.label = _('⚠ Adjust Right Earbud');
            this._fitTestResultLabel.css_classes = ['warning', 'heading'];
        } else if (statusCode === 4) {
            this._fitTestResultLabel.label = _('⚠ Poor Seal (Adjust Both)');
            this._fitTestResultLabel.css_classes = ['error', 'heading'];
        } else {
            this._fitTestResultLabel.label = '';
            this._fitTestResultLabel.css_classes = ['dim-label'];
        }
    }
});
