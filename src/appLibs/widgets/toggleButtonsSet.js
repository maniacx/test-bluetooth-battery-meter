'use strict';

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

const NO_ACTIVE_TOGGLE_WORKAROUND_INDEX = 16;

export const ToggleButtonsSet = GObject.registerClass({
    GTypeName: 'BudsLink_ToggleButtonsSet',
}, class ToggleButtonsSet extends Gtk.Box {
    _init(isSecondSet, dataHandler) {
        super._init({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 8,
            margin_end: 8,
        });

        this._isSecondSet = isSecondSet;
        this._dataHandler = dataHandler;
        this._group = null;
        this._titleLabel = null;
        this._lastSentIndex = 0;
        this._updatingFromProps = false;

        this._buildUI();
        this._syncFromProps();

        this._dataHandlerIdConfig = this._dataHandler.connect('configuration-changed', () => {
            this._buildUI();
            this._syncFromProps();
        });

        this._dataHandlerIdProp = this._dataHandler.connect('properties-changed', () => {
            this._syncFromProps();
        });
    }

    _buildUI() {
        if (this._group && this._groupNotifyId)
            this._group.disconnect(this._groupNotifyId);
        this._groupNotifyId = null;

        let child;
        while ((child = this.get_first_child()))
            this.remove(child);

        const config = this._dataHandler.getConfig();
        const title = this._isSecondSet ? config.toggle2Title : config.toggle1Title;

        const icons = [
            this._isSecondSet ? config.toggle2Button1Icon : config.toggle1Button1Icon,
            this._isSecondSet ? config.toggle2Button2Icon : config.toggle1Button2Icon,
            this._isSecondSet ? config.toggle2Button3Icon : config.toggle1Button3Icon,
            this._isSecondSet ? config.toggle2Button4Icon : config.toggle1Button4Icon,
        ];

        const names = [
            this._isSecondSet ? config.toggle2Button1Name : config.toggle1Button1Name,
            this._isSecondSet ? config.toggle2Button2Name : config.toggle1Button2Name,
            this._isSecondSet ? config.toggle2Button3Name : config.toggle1Button3Name,
            this._isSecondSet ? config.toggle2Button4Name : config.toggle1Button4Name,
        ];

        if (title) {
            this._titleLabel = new Gtk.Label({
                label: title,
                halign: Gtk.Align.CENTER,
                css_classes: ['heading'],
            });
            this.append(this._titleLabel);
        }

        this._group = new Adw.ToggleGroup({
            orientation: Gtk.Orientation.HORIZONTAL,
            halign: Gtk.Align.CENTER,
            css_classes: ['budslink-toggle-group'],
        });
        this.append(this._group);

        icons.forEach((iconName, index) => {
            if (!iconName)
                return;
            const toggle = new Adw.Toggle({
                icon_name: iconName.replace(/\.svg$/, ''),
                tooltip: names[index],
            });
            this._group.add(toggle);
        });

        this._groupNotifyId = this._group.connect('notify::active', () => {
            if (this._updatingFromProps)
                return;

            const active = this._group.active;
            if (active < 0 || active === NO_ACTIVE_TOGGLE_WORKAROUND_INDEX)
                return;

            const stateProp = this._isSecondSet ? 'toggle2State' : 'toggle1State';
            const uiIndex = active + 1;

            if (this._lastSentIndex === uiIndex)
                return;

            this._lastSentIndex = uiIndex;
            this._dataHandler.emitUIAction(stateProp, uiIndex);
        });
    }

    _syncFromProps() {
        if (!this._group)
            return;

        const props = this._dataHandler.getProps();
        const index = this._isSecondSet ? props.toggle2State : props.toggle1State;
        const desired = index === 0 ? NO_ACTIVE_TOGGLE_WORKAROUND_INDEX : index - 1;

        if (this._group.active !== desired) {
            this._updatingFromProps = true;
            this._group.active = desired;
            this._updatingFromProps = false;
        }
    }

    destroy() {
        if (this._group && this._groupNotifyId)
            this._group.disconnect(this._groupNotifyId);

        if (this._group)
            this._group.remove_all();

        if (this._dataHandler && this._dataHandlerIdConfig)
            this._dataHandler.disconnect(this._dataHandlerIdConfig);

        if (this._dataHandler && this._dataHandlerIdProp)
            this._dataHandler.disconnect(this._dataHandlerIdProp);

        this._groupNotifyId = null;
        this._dataHandlerIdConfig = null;
        this._dataHandlerIdProp = null;
        this._dataHandler = null;
    }
});

