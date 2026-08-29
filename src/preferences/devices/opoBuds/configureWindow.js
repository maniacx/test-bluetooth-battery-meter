'use strict';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {DropDownRowWidget} from '../../widgets/dropDownRowWidget.js';
import {IconSelectorWidget} from '../../widgets/iconSelectorWidget.js';
import {RingMyBudsRow} from '../../widgets/ringMyBudsRow.js';
import {SliderRowWidget} from '../../widgets/sliderRowWidget.js';
import {CheckBoxesRowWidget} from '../../widgets/checkBoxesRowWidget.js';
import {DeviceManagementRow} from '../../widgets/deviceMgmtRowWidget.js';
import {BtDeviceState, DeviceManagementAction} from '../../../lib/devices/commonEmuns.js';
import {
    supportedAudioDualIcons, supportedAudioSingleIcons, supportedCaseIcons
} from '../../../lib/widgets/iconGroups.js';
import {OpoBudsModelList} from '../../../lib/devices/opoBuds/opoBudsConfig.js';

const ncCycleBits = [0x01, 0x02, 0x08];

function safeJsonParse(str) {
    try {
        return JSON.parse(str);
    } catch {
        return null;
    }
}

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

        const pathsString = settings.get_strv('opo-buds-list').map(safeJsonParse).filter(Boolean);
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

            const list = this._settings.get_strv('opo-buds-list').map(safeJsonParse).filter(Boolean);
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

                if (this._modelData.dualConnection && this._dualConnSwitch) {
                    this._dualConnSwitch.active = this._settingsItems['dual-connection'] ?? false;

                    const multiDevices = this._settingsItems['multi-devices'] ?? [];
                    const devArr = multiDevices.map(dev => ({
                        id: dev.mac,
                        name: dev.name,
                        connected: dev.isConnected,
                        state: BtDeviceState.Ready,
                    }));
                    this._dualConnSwitch.updateDevices(devArr);

                    const ownDev = multiDevices.find(d => d.isCurrent)?.mac ?? '';
                    this._dualConnSwitch.updateOwnDevice(ownDev);
                }

                if (this._modelData.autoAnswer && this._autoAnswerSwitch)
                    this._autoAnswerSwitch.active = this._settingsItems['auto-answer'];

                if (this._modelData.findMyPhone && this._findPhoneSwitch)
                    this._findPhoneSwitch.active = this._settingsItems['find-phone'];

                if (this._lowFreq)
                    this._lowFreq.value = this._settingsItems['dynamic-audio-low'];

                if (this._midFreq)
                    this._midFreq.value = this._settingsItems['dynamic-audio-med'];

                if (this._highFreq)
                    this._highFreq.value = this._settingsItems['dynamic-audio-high'];

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

                if (this._modelData.noiseControl && this._ncCycleWidget) {
                    const mask = this._settingsItems['nc-cycle-mask'] ?? 0x0B;
                    let widgetMask = 0;

                    ncCycleBits.forEach((bit, index) => {
                        if (mask & bit)
                            widgetMask |= 1 << index;
                    });

                    this._ncCycleWidget.toggled_value = widgetMask;
                }

                if (this._isTestingFit && this._modelData.fitTest) {
                    const res = this._settingsItems['fit-test-result'];
                    if (res && typeof res === 'object' && res.left !== undefined && res.right !== undefined)
                        this._onFitTestCompleted?.(res);
                }
            } finally {
                this._isUpdatingUI = false;
            }
        });

        this.connect('close-request', () => {
            this._lowFreq?.destroy();
            this._lowFreq = null;
            this._midFreq?.destroy();
            this._midFreq = null;
            this._highFreq?.destroy();
            this._highFreq = null;

            if (this._multiDevicePollId) {
                const id = this._multiDevicePollId;
                this._multiDevicePollId = null;
                GLib.source_remove(id);
            }

            if (this._fitTestTimeoutId) {
                const id = this._fitTestTimeoutId;
                this._fitTestTimeoutId = null;
                GLib.source_remove(id);
            }

            if (this._modelData?.ring) {
                const ringState = this._settingsItems?.['ring-state'];
                if (ringState === 'playing')
                    this._updateGsettings('ring-state', 'stopped');
            }

            if (this._modelData?.fitTest)
                this._updateGsettings('fit-test-result', null);

            if (this._settingsHandlerId) {
                this._settings.disconnect(this._settingsHandlerId);
                this._settingsHandlerId = null;
            }
        });
    }

    _updateGsettings(key, value) {
        const currentList = this._settings.get_strv('opo-buds-list').map(safeJsonParse).filter(Boolean);
        const index = currentList.findIndex(d => d.path === this._devicePath);

        if (index !== -1) {
            currentList[index][key] = value;
            this._settingsItems[key] = value;
            this._settings.set_strv('opo-buds-list', currentList.map(JSON.stringify));
        }
    }

    _updateMultipleGsettings(obj) {
        const currentList = this._settings.get_strv('opo-buds-list').map(safeJsonParse).filter(Boolean);
        const index = currentList.findIndex(d => d.path === this._devicePath);

        if (index !== -1) {
            for (const [key, value] of Object.entries(obj)) {
                currentList[index][key] = value;
                this._settingsItems[key] = value;
            }
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

            const range = [-5, 5, 1];

            const marks = Array.from({length: 11}, (_o, i) => {
                const value = i - 5;
                const obj = {
                    mark: value,
                };

                if (value === -5)
                    obj.label = _('-5');
                else if (value === 0)
                    obj.label = _('0');
                else if (value === 5)
                    obj.label = _('5');

                return obj;
            });

            this._lowFreq = new SliderRowWidget({
                rowTitle: _('Low Frequency'),
                range,
                marks,
                snapOnStep: true,
                initialValue: this._settingsItems['dynamic-audio-low'],
            });

            this._lowFreq.compact_mode = this._isCompactMode;

            this._lowFreq.connect('notify::value', () => {
                this._updateGsettings('dynamic-audio-low', this._lowFreq.value);
            });

            this._midFreq = new SliderRowWidget({
                rowTitle: _('Mid Frequency'),
                range,
                marks,
                snapOnStep: true,
                initialValue: this._settingsItems['dynamic-audio-med'],
            });

            this._midFreq.compact_mode = this._isCompactMode;

            this._midFreq.connect('notify::value', () => {
                this._updateGsettings('dynamic-audio-med', this._midFreq.value);
            });

            this._highFreq = new SliderRowWidget({
                rowTitle: _('High Frequency'),
                range,
                marks,
                snapOnStep: true,
                initialValue: this._settingsItems['dynamic-audio-high'],
            });

            this._highFreq.compact_mode = this._isCompactMode;

            this._highFreq.connect('notify::value', () => {
                this._updateGsettings('dynamic-audio-high', this._highFreq.value);
            });

            dynamicAudioExpander.add_row(this._lowFreq);
            dynamicAudioExpander.add_row(this._midFreq);
            dynamicAudioExpander.add_row(this._highFreq);

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
            const deviceManagementConfig = {
                maxConnected: 2,
                hasMultipointSwitch: true,
                hasPairMode: false,
                hasRoutingIndicator: false,
                hasRoutingControl: false,
                hasActiveFix: false,
                showMac: true,
            };

            const multiDevices = this._settingsItems['multi-devices'] ?? [];
            const devArr = multiDevices.map(dev => ({
                id: dev.mac,
                name: dev.name,
                connected: dev.isConnected,
                state: BtDeviceState.Ready,
            }));

            const ownDevice = multiDevices.find(d => d.isCurrent)?.mac ?? '';

            this._dualConnSwitch = new DeviceManagementRow(
                this,
                _,
                devArr,
                ownDevice,
                '',
                deviceManagementConfig
            );

            this._dualConnSwitch.active = this._settingsItems['dual-connection'] ?? false;

            this._dualConnSwitch.connect('notify::active', () => {
                this._updateGsettings('dual-connection', this._dualConnSwitch.active);
            });

            this._dualConnSwitch.connect('device-action', (_row, action, id) => {
                const opMap = {
                    [DeviceManagementAction.Connect]: 0x02,
                    [DeviceManagementAction.Disconnect]: 0x01,
                    [DeviceManagementAction.Remove]: 0x03,
                };
                const op = opMap[action];
                if (op) {
                    this._updateGsettings('multi-device-op', {
                        op,
                        mac: id,
                        ts: Date.now(),
                    });
                }
            });

            miscGroup.add(this._dualConnSwitch);

            if (this._dualConnSwitch._button && this._dualConnSwitch._dialog) {
                this._dualConnSwitch._button.connect('clicked', () => {
                    // Query immediately upon opening the Manage Devices dialog
                    this._updateGsettings('multi-device-op', {
                        op: 'refresh',
                        mac: '',
                        ts: Date.now(),
                    });

                    // Start 3-second heartbeat only while the dialog is open
                    if (!this._multiDevicePollId) {
                        this._multiDevicePollId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
                            this._updateGsettings('multi-device-op', {
                                op: 'refresh',
                                mac: '',
                                ts: Date.now(),
                            });
                            return GLib.SOURCE_CONTINUE;
                        });
                    }
                });

                this._dualConnSwitch._dialog.connect('closed', () => {
                    if (this._multiDevicePollId) {
                        const id = this._multiDevicePollId;
                        this._multiDevicePollId = null;
                        GLib.source_remove(id);
                    }
                });
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
            const fitExpander = new Adw.ExpanderRow({
                title: _('Earbud Fit Test'),
                subtitle: _('Check acoustic seal for optimal sound quality and noise cancellation'),
                expanded: false,
            });

            const descRow = new Adw.ActionRow({
                title: _('Ensure good seal with your ear canals'),
                subtitle: _('Tap "Play" to start the acoustic test'),
                subtitle_lines: 3,
            });

            const statusRow = new Adw.ActionRow({
                title: _('Earbuds Seal Status'),
            });

            const earbudStatusBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 24,
                valign: Gtk.Align.CENTER,
            });

            // Left Earbud Box
            const leftBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 8,
                valign: Gtk.Align.CENTER,
            });
            const leftIcon = new Gtk.Image({
                icon_name: 'bbm-earbuds-left-symbolic',
                pixel_size: 20,
            });
            const leftName = new Gtk.Label({
                label: _('Left (L):'),
                css_classes: ['dim-label'],
            });
            this._fitLeftBadge = new Gtk.Label({
                label: '-',
                css_classes: ['dim-label'],
            });
            leftBox.append(leftIcon);
            leftBox.append(leftName);
            leftBox.append(this._fitLeftBadge);

            // Right Earbud Box
            const rightBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 8,
                valign: Gtk.Align.CENTER,
            });
            const rightIcon = new Gtk.Image({
                icon_name: 'bbm-earbuds-right-symbolic',
                pixel_size: 20,
            });
            const rightName = new Gtk.Label({
                label: _('Right (R):'),
                css_classes: ['dim-label'],
            });
            this._fitRightBadge = new Gtk.Label({
                label: '-',
                css_classes: ['dim-label'],
            });
            rightBox.append(rightIcon);
            rightBox.append(rightName);
            rightBox.append(this._fitRightBadge);

            earbudStatusBox.append(leftBox);
            earbudStatusBox.append(rightBox);
            statusRow.add_suffix(earbudStatusBox);

            const actionRow = new Adw.ActionRow({
                title: _('Acoustic Fit Test'),
            });

            const btnBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
                valign: Gtk.Align.CENTER,
            });

            this._fitPlayBtn = new Gtk.Button({
                valign: Gtk.Align.CENTER,
                css_classes: ['suggested-action'],
                child: new Adw.ButtonContent({
                    icon_name: 'bbm-play-symbolic',
                    label: _('Play'),
                }),
            });

            const resetFitState = () => {
                this._isTestingFit = false;
                if (this._fitTestTimeoutId) {
                    const id = this._fitTestTimeoutId;
                    this._fitTestTimeoutId = null;
                    GLib.source_remove(id);
                }
                if (this._fitLeftBadge) {
                    this._fitLeftBadge.label = '-';
                    this._fitLeftBadge.css_classes = ['dim-label'];
                }
                if (this._fitRightBadge) {
                    this._fitRightBadge.label = '-';
                    this._fitRightBadge.css_classes = ['dim-label'];
                }
                descRow.title = _('Ensure good seal with your ear canals');
                descRow.subtitle = _('Tap "Play" to start the acoustic test');
                if (this._fitPlayBtn) {
                    this._fitPlayBtn.sensitive = true;
                    this._fitPlayBtn.child = new Adw.ButtonContent({
                        icon_name: 'bbm-play-symbolic',
                        label: _('Play'),
                    });
                }
                this._settingsItems['fit-test-result'] = null;
            };

            const onFitTestCompleted = (res) => {
                if (!this._isTestingFit)
                    return;

                this._isTestingFit = false;
                if (this._fitTestTimeoutId) {
                    const id = this._fitTestTimeoutId;
                    this._fitTestTimeoutId = null;
                    GLib.source_remove(id);
                }

                this._fitPlayBtn.sensitive = true;
                this._fitPlayBtn.child = new Adw.ButtonContent({
                    icon_name: 'bbm-play-symbolic',
                    label: _('Test Again'),
                });

                let leftGood = false;
                let rightGood = false;
                if (res && typeof res === 'object' && res.left !== undefined && res.right !== undefined) {
                    leftGood = (res.left === 1);
                    rightGood = (res.right === 1);
                } else {
                    this._fitLeftBadge.label = _('Failed');
                    this._fitLeftBadge.css_classes = ['error', 'heading'];
                    this._fitRightBadge.label = _('Failed');
                    this._fitRightBadge.css_classes = ['error', 'heading'];
                    descRow.title = _('Test Incomplete');
                    descRow.subtitle = _('Could not detect earbud seal. Ensure earbuds are worn, then test again');
                    return;
                }

                if (leftGood) {
                    this._fitLeftBadge.label = _('Good');
                    this._fitLeftBadge.css_classes = ['success', 'heading'];
                } else {
                    this._fitLeftBadge.label = _('Not ideal');
                    this._fitLeftBadge.css_classes = ['warning', 'heading'];
                }

                if (rightGood) {
                    this._fitRightBadge.label = _('Good');
                    this._fitRightBadge.css_classes = ['success', 'heading'];
                } else {
                    this._fitRightBadge.label = _('Not ideal');
                    this._fitRightBadge.css_classes = ['warning', 'heading'];
                }

                if (leftGood && rightGood) {
                    descRow.title = _('Great Fit');
                    descRow.subtitle = _('Both earbuds make a good seal for optimal noise cancelling');
                } else {
                    descRow.title = _('Adjust your earbuds');
                    descRow.subtitle = _('Adjust the position of the earbud or change ear tip size, then test again');
                }
            };
            this._onFitTestCompleted = onFitTestCompleted;

            fitExpander.connect('notify::expanded', () => {
                if (!fitExpander.expanded)
                    resetFitState();
            });

            this._fitPlayBtn.connect('clicked', () => {
                this._isTestingFit = true;
                this._fitPlayBtn.sensitive = false;
                this._fitLeftBadge.label = _('Testing…');
                this._fitLeftBadge.css_classes = ['dim-label'];
                this._fitRightBadge.label = _('Testing…');
                this._fitRightBadge.css_classes = ['dim-label'];
                descRow.title = _('Analyzing earbud fit…');
                descRow.subtitle = _('Please keep earbuds in your ears while the tone plays');

                this._updateMultipleGsettings({
                    'fit-test-result': null,
                    'fit-test-op': {action: 'start', ts: Date.now()},
                });

                if (this._fitTestTimeoutId) {
                    const id = this._fitTestTimeoutId;
                    this._fitTestTimeoutId = null;
                    GLib.source_remove(id);
                }

                // 10-second watchdog fallback in case hardware packet drops
                this._fitTestTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 10, () => {
                    this._fitTestTimeoutId = null;
                    if (this._isTestingFit)
                        this._onFitTestCompleted(null);
                    return GLib.SOURCE_REMOVE;
                });
            });

            btnBox.append(this._fitPlayBtn);
            actionRow.add_suffix(btnBox);

            fitExpander.add_row(descRow);
            fitExpander.add_row(statusRow);
            fitExpander.add_row(actionRow);
            miscGroup.add(fitExpander);
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
            });

            const ncCycleItems = [
                {
                    name: _('Off'),
                    icon: 'bbm-anc-off-symbolic',
                },
                {
                    name: _('Transparency'),
                    icon: 'bbm-transperancy-symbolic',
                },
                {
                    name: _('Noise Cancellation'),
                    icon: 'bbm-anc-on-symbolic',
                },
            ];

            let initialWidgetMask = 0;

            ncCycleItems.forEach((item, index) => {
                if (initialMask & ncCycleBits[index])
                    initialWidgetMask |= 1 << index;
            });

            this._ncCycleWidget = new CheckBoxesRowWidget({
                rowTitle: _('Select modes to cycle through'),
                items: ncCycleItems,
                applyBtnName: _('Apply'),
                initialValue: initialWidgetMask,
                minRequired: 2,
            });

            this._ncCycleWidget.compact_mode = this._isCompactMode;

            this._ncCycleWidget.connect('notify::toggled-value', () => {
                const toggled = this._ncCycleWidget.toggled_value;
                let mask = 0;

                ncCycleItems.forEach((item, index) => {
                    if (toggled & 1 << index)
                        mask |= ncCycleBits[index];
                });

                this._updateGsettings('nc-cycle-mask', mask);
            });

            ncCycleGroup.add(this._ncCycleWidget);
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

    _updateCompactStatus() {
        this._lowFreq?.set_property('compact-mode', this._isCompactMode);
        this._midFreq?.set_property('compact-mode', this._isCompactMode);
        this._highFreq?.set_property('compact-mode', this._isCompactMode);
        this._ncCycleWidget?.set_property('compact-mode', this._isCompactMode);
    }
});
