'use strict';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import {BtDeviceState, DeviceManagementAction} from '../../lib/devices/commonEmuns.js';

const DeviceManagementDialog = GObject.registerClass({
    GTypeName: 'BudsLink_DeviceManagementDialog',
}, class DeviceManagementDialog extends Adw.Dialog {
    _init(mgmtRow) {
        super._init({
            title: '',
            content_width: 360,
            content_height: 700,
        });

        const _ = mgmtRow.gtxt;
        this._mgmtRow = mgmtRow;
        this._routeDevice = this._mgmtRow.routeDevice;
        this._rows = new Map();
        this._connectedRows = [];
        this._pairedRows = [];
        this._currentMac = this._pathToMac(this._mgmtRow.currentDevicePath);

        const toolbarView = new Adw.ToolbarView();
        const headerBar = new Adw.HeaderBar({
            title_widget: new Adw.WindowTitle({
                title: _('Connection Manager'),
            }),
        });
        toolbarView.add_top_bar(headerBar);
        const page = new Adw.PreferencesPage();
        const pairModeGroup = new Adw.PreferencesGroup({title: _('Pairing Mode')});
        const pairModeRow = new Adw.ActionRow({
            title: _('Enable Pairing Mode'),
            subtitle: _('Allow a new Bluetooth device to pair.'),
        });

        const spinner = new Adw.Spinner({
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            width_request: 16,
            height_request: 16,
            visible: false,
        });

        const pairModeSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this._mgmtRow.pairMode,
        });

        pairModeSwitch.bind_property(
            'active',
            spinner,
            'visible',
            GObject.BindingFlags.BIDIRECTIONAL |
            GObject.BindingFlags.SYNC_CREATE
        );

        this._mgmtRow.bind_property(
            'pair-mode',
            pairModeSwitch,
            'active',
            GObject.BindingFlags.BIDIRECTIONAL |
            GObject.BindingFlags.SYNC_CREATE
        );

        pairModeRow.add_suffix(spinner);
        pairModeRow.add_suffix(pairModeSwitch);
        pairModeGroup.add(pairModeRow);

        this._connectedGroup = new Adw.PreferencesGroup({title: _('Connected')});
        this._pairedGroup = new Adw.PreferencesGroup({title: _('Paired')});
        this._connectedEmptyRow = new Adw.ActionRow({title: _('No device connected')});
        this._pairedEmptyRow = new Adw.ActionRow({title: _('No additional device paired')});
        page.add(pairModeGroup);
        page.add(this._connectedGroup);
        page.add(this._pairedGroup);
        toolbarView.set_content(page);
        this.set_child(toolbarView);

        this.updateDevices(this._mgmtRow.deviceArr);
    }

    _pathToMac(devicePath) {
        const match = devicePath.match(/\/dev_([0-9A-Fa-f_]+)$/);

        if (!match)
            return null;

        return match[1].replaceAll('_', '').toUpperCase();
    }

    _formatMac(mac) {
        return mac.replace(/:/g, '').match(/.{1,2}/g)?.join(':') ?? mac;
    }

    updateDevices(deviceArr) {
        const _ = this._mgmtRow.gtxt;
        const devices = deviceArr.map(device => ({...device}));

        devices.sort((a, b) => {
            const aCurrent = a.mac === this._currentMac;
            const bCurrent = b.mac === this._currentMac;

            if (aCurrent === bCurrent)
                return 0;

            return aCurrent ? -1 : 1;
        });

        const newMacs = new Set(devices.map(device => device.mac));


        for (const [mac, info] of this._rows) {
            if (!newMacs.has(mac)) {
                info.group.remove(info.row);

                if (info.group === this._connectedGroup)
                    this._connectedRows = this._connectedRows.filter(r => r !== info.row);
                else
                    this._pairedRows = this._pairedRows.filter(r => r !== info.row);

                this._rows.delete(mac);
            }
        }


        for (const device of devices) {
            const info = this._rows.get(device.mac);

            if (!info) {
                const row = this._createDeviceRow(device);
                const group = device.connected ? this._connectedGroup : this._pairedGroup;
                group.add(row);

                if (device.connected)
                    this._connectedRows.push(row);
                else
                    this._pairedRows.push(row);

                this._rows.set(device.mac, {row, group});
                continue;
            }

            const isCurrent = device.mac === this._currentMac;
            const isNotInitialized = device.state === BtDeviceState.NotInitialized;
            const isProcessing = device.state === BtDeviceState.Processing;
            const macLabel = this._formatMac(device.mac);
            info.row.title = isNotInitialized ? _('Loading Device Information...') : device.name;
            info.row.subtitle = isCurrent ? _('%s (This Device)').replace('%s', macLabel)
                : macLabel;
            info.row.spinner.visible = isProcessing || isNotInitialized;

            if (this._mgmtRow.hasRouting) {
                const isRouteDevice = this._routeDevice === device.mac;
                info.row.routeIcon.visible = !isNotInitialized && !isProcessing &&
                        device.connected && isRouteDevice;
            }

            const targetGroup = device.connected ? this._connectedGroup : this._pairedGroup;

            if (info.group !== targetGroup) {
                info.group.remove(info.row);

                if (info.group === this._connectedGroup) {
                    this._connectedRows = this._connectedRows.filter(r => r !== info.row);
                    this._pairedRows.push(info.row);
                } else {
                    this._pairedRows = this._pairedRows.filter(r => r !== info.row);
                    this._connectedRows.push(info.row);
                }

                targetGroup.add(info.row);
                info.group = targetGroup;
            }
            this._updateDeviceMenu(info.row, device);
        }
        this._updateEmptyRows();
    }

    _updateEmptyRows() {
        if (this._connectedRows.length === 0) {
            if (!this._connectedEmptyRow.get_parent())
                this._connectedGroup.add(this._connectedEmptyRow);
        } else if (this._connectedEmptyRow.get_parent()) {
            this._connectedGroup.remove(this._connectedEmptyRow);
        }

        if (this._pairedRows.length === 0) {
            if (!this._pairedEmptyRow.get_parent())
                this._pairedGroup.add(this._pairedEmptyRow);
        } else if (this._pairedEmptyRow.get_parent()) {
            this._pairedGroup.remove(this._pairedEmptyRow);
        }
    }

    _createDeviceRow(device) {
        const _ = this._mgmtRow.gtxt;
        const isCurrent = device.mac === this._currentMac;
        const isInitializing = device.state === BtDeviceState.NotInitialized;
        const isProcessing = device.state === BtDeviceState.Processing;
        const macLabel = this._formatMac(device.mac);
        const title = isInitializing ? _('Loading Device Information...') : device.name;
        const subtitle = isCurrent ? _('%s (This Device)').replace('%s', macLabel) : macLabel;
        const row = new Adw.ActionRow({title, subtitle});

        let routeIcon;
        if (this._mgmtRow.hasRouting) {
            routeIcon = new Gtk.Image({
                icon_name: 'bbm-speakers-symbolic',
                css_classes: ['flat'],
                visible: !isProcessing && device.connected && this._routeDevice === device.mac,
            });
        }

        const spinner = new Adw.Spinner({
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            width_request: 16,
            height_request: 16,
            visible: isInitializing || isProcessing,
        });


        const button = new Gtk.MenuButton({
            valign: Gtk.Align.CENTER,
            icon_name: 'bbm-settings-symbolic',
        });


        const menu = new Gio.Menu();
        const actionGroup = new Gio.SimpleActionGroup();

        if (this._mgmtRow.hasRouting) {
            const routingAction = new Gio.SimpleAction({name: 'routing'});
            routingAction.connect('activate', () => {
                this._mgmtRow?.emit('device-action', DeviceManagementAction.Routing, device.mac);
            });
            actionGroup.add_action(routingAction);
        }

        const connectAction = new Gio.SimpleAction({name: 'connect'});
        connectAction.connect('activate', () => {
            this._mgmtRow?.emit('device-action', DeviceManagementAction.Connect, device.mac);
        });
        actionGroup.add_action(connectAction);

        const disconnectAction = new Gio.SimpleAction({name: 'disconnect'});
        disconnectAction.connect('activate', () => {
            this._mgmtRow?.emit('device-action', DeviceManagementAction.Disconnect, device.mac);
        });
        actionGroup.add_action(disconnectAction);

        const removeAction = new Gio.SimpleAction({name: 'remove'});
        removeAction.connect('activate', () => {
            const _ = this._mgmtRow.gtxt;

            const dialog = new Adw.AlertDialog({
                heading: _('Remove Device?'),
                body: _('The device will be removed from the paired devices list.'),
            });

            dialog.add_response('cancel', _('Cancel'));
            dialog.add_response('remove', _('Remove'));
            dialog.set_response_appearance('remove', Adw.ResponseAppearance.DESTRUCTIVE);
            dialog.set_default_response('cancel');
            dialog.set_close_response('cancel');

            dialog.connect('response', (_dialog, response) => {
                if (response === 'remove')
                    this._mgmtRow?.emit('device-action', DeviceManagementAction.Remove, device.mac);
            });

            dialog.present(this.get_root());
        });
        actionGroup.add_action(removeAction);

        row.insert_action_group('device', actionGroup);
        button.menu_model = menu;

        const routingItem = Gio.MenuItem.new(_('Set as Playback Device'), 'device.routing');
        const connectItem = Gio.MenuItem.new(_('Connect'), 'device.connect');
        const disconnectItem = Gio.MenuItem.new(_('Disconnect'), 'device.disconnect');
        const removeItem = Gio.MenuItem.new(_('Remove'), 'device.remove');

        row.menu = menu;
        row.connectItem = connectItem;
        row.disconnectItem = disconnectItem;
        row.removeItem = removeItem;
        if (this._mgmtRow.hasRouting)
            row.routingItem = routingItem;


        this._updateDeviceMenu(row, device);

        spinner.bind_property(
            'visible',
            button,
            'visible',
            GObject.BindingFlags.INVERT_BOOLEAN |
            GObject.BindingFlags.SYNC_CREATE
        );

        if (this._mgmtRow.hasRouting) {
            row.add_suffix(routeIcon);
            row.routeIcon = routeIcon;
        }

        row.add_suffix(spinner);
        row.add_suffix(button);

        row.spinner = spinner;
        return row;
    }

    _updateDeviceMenu(row, device) {
        const menu = row.menu;

        menu.remove_all();

        if (device.connected) {
            if (this._mgmtRow.hasRouting)
                menu.append_item(row.routingItem);

            menu.append_item(row.disconnectItem);
            menu.append_item(row.removeItem);
        } else {
            const maxReached = this._mgmtRow.maxConnected > 0 &&
            this._connectedRows.length >= this._mgmtRow.maxConnected;

            if (!maxReached)
                menu.append_item(row.connectItem);

            menu.append_item(row.removeItem);
        }
    }

    updateRouteDevice(mac) {
        if (!this._mgmtRow.hasRouting)
            return;

        if (!mac || this._routeDevice === mac)
            return;

        this._routeDevice = mac;

        for (const [deviceMac, info] of this._rows) {
            const isConnectedRow = this._connectedRows.includes(info.row);
            info.row.routeIcon.visible =
                isConnectedRow && deviceMac === mac && !info.row.spinner.visible;
        }
    }
});

export const DeviceManagementRow = GObject.registerClass({
    GTypeName: 'BudsLink_DeviceManagementRow',
    Signals: {
        'device-action': {param_types: [GObject.TYPE_INT, GObject.TYPE_STRING]},
    },
    Properties: {
        'active': GObject.ParamSpec.boolean('active', '', '', GObject.ParamFlags.READWRITE, false),
        'pair-mode': GObject.ParamSpec.boolean('pair-mode', '', '',
            GObject.ParamFlags.READWRITE, false),
    },
}, class DeviceManagementRow extends Adw.ActionRow {
    _init(window, gtxt, maxConnected, hasRouting, deviceArr, currentDevicePath, routeDevice) {
        super._init();

        const _ = gtxt;
        this.title = _('Allow Connections to Multiple Devices');
        this.gtxt = gtxt;
        this.maxConnected = maxConnected;
        this.deviceArr = deviceArr.map(device => ({...device}));
        this.routeDevice = routeDevice;
        this.hasRouting = hasRouting;
        this.currentDevicePath = currentDevicePath;
        this._active = false;

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            valign: Gtk.Align.CENTER,
        });

        this._button = new Gtk.Button({
            icon_name: 'bbm-device-mgmt-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['circular'],
            tooltip_text: _('Manage Devices'),
        });

        this._switch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
        });

        this.bind_property(
            'active',
            this._switch,
            'active',
            GObject.BindingFlags.BIDIRECTIONAL |
            GObject.BindingFlags.SYNC_CREATE
        );

        this._switch.bind_property(
            'active',
            this._button,
            'sensitive',
            GObject.BindingFlags.SYNC_CREATE
        );

        this._dialog = new DeviceManagementDialog(this);
        this._button.connect('clicked', () => this._dialog.present(window));

        box.append(this._button);
        box.append(this._switch);
        this.add_suffix(box);
    }

    get active() {
        return this._active;
    }

    set active(value) {
        if (this._active === value)
            return;

        this._active = value;
        this.notify('active');
    }

    _deviceArrEqual(a, b) {
        if (a.length !== b.length)
            return false;

        return a.every((device, i) => {
            const other = b[i];

            return device.mac === other.mac &&
                device.name === other.name &&
                device.connected === other.connected &&
                device.state === other.state;
        });
    }

    updateDevices(deviceArr) {
        if (this._deviceArrEqual(this.deviceArr, deviceArr))
            return;

        this.deviceArr = deviceArr.map(device => ({...device}));
        this._dialog?.updateDevices(deviceArr);
    }

    updateRouteDevice(mac) {
        this._dialog?.updateRouteDevice(mac);
    }
});

