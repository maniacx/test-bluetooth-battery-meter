'use strict';
import Gio from 'gi://Gio';
import {gettext as _} from 'gettext';

import {DeviceTypeAirpods} from './airpods/airpodsDevice.js';
import {DeviceTypeSonyV1, DeviceTypeSonyV2} from './sony/sonyDevice.js';
import {DeviceTypeGalaxyLegacy, DeviceTypeGalaxyBuds} from './galaxyBuds/galaxyBudsDevice.js';
import {DeviceTypeNothingBuds} from './nothingBuds/nothingBudsDevice.js';
import {DeviceTypeGoogleBuds} from './googleBuds/googleBudsDevice.js';
import {DeviceTypeRedmiBuds} from './redmiBuds/redmiBudsDevice.js';
import {DeviceTypeSenhBuds} from './senhBuds/senhBudsDevice.js';
import {DeviceTypeBoseBuds} from './boseBuds/boseBudsDevice.js';
import {DeviceTypeEdifierBuds} from './edifierBuds/edifierBudsDevice.js';
import {DeviceTypeGfps} from './gfps/gfpsDevice.js';

export class Notifier {
    constructor(toggle) {
        this._toggle = toggle;
        this._notificationId = 'profile-error';
    }

    notifyProfileRegisteredError(type) {
        let label;
        if (type === DeviceTypeAirpods)
            label = _('AirPods / Beats');
        else if (type === DeviceTypeSonyV1 || type === DeviceTypeSonyV2)
            label = _('Sony');
        else if (type === DeviceTypeGalaxyLegacy || type === DeviceTypeGalaxyBuds)
            label = _('Samsung Galaxy');
        else if (type === DeviceTypeNothingBuds)
            label = _('Nothing / CMF');
        else if (type === DeviceTypeGoogleBuds)
            label = _('Google Pixel Buds');
        else if (type === DeviceTypeRedmiBuds)
            label = _('Redmi / Xiaomi');
        else if (type === DeviceTypeSenhBuds)
            label = _('Sennheiser');
        else if (type === DeviceTypeBoseBuds)
            label = _('Bose');
        else if (type === DeviceTypeEdifierBuds)
            label = _('Edifier');
        else if (type === DeviceTypeGfps)
            label = _('Google Fast Pair');
        else
            label = type;

        const notification = new Gio.Notification();

        const title = _('Could not access advanced features for %s Bluetooth audio devices.')
            .replace('%s', label);

        const body = _(
            'Another app or session is already using the Bluetooth socket/profile for %s ' +
            'Bluetooth audio devices. Close any other apps using this device, ' +
            'then restart this app.'
        ).replace('%s', label);

        notification.set_title(title);
        notification.set_body(body);

        this._toggle.send_notification(this._notificationId, notification);
    }

    destroy() {
        this._toggle.withdraw_notification(this._notificationId);
    }
}
