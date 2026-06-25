import * as Airpods from '../preferences/devices/airpods/configureWindow.js';
import * as Sony from '../preferences/devices/sony/configureWindow.js';
import * as GalaxyBuds from '../preferences/devices/galaxyBuds/configureWindow.js';
import * as NothingBuds from '../preferences/devices/nothingBuds/configureWindow.js';
import * as GoogleBuds from '../preferences/devices/googleBuds/configureWindow.js';
import * as RedmiBuds from '../preferences/devices/redmiBuds/configureWindow.js';
import * as SenhBuds from '../preferences/devices/senhBuds/configureWindow.js';
import * as Gfps from '../preferences/devices/gfps/configureWindow.js';

let _settings = null;
let _gettext = null;

export function initConfigureWindowLauncher(settings, gettext) {
    _settings = settings;
    _gettext = gettext;
}

function pathToMac(path) {
    const idx = path.indexOf('dev_');
    if (idx === -1)
        return '';

    return path
        .substring(idx + 4)
        .replace(/_/g, ':');
}

export function createConfigureWindow({
    devicePath,
    deviceType,
}) {
    let Prefs;
    let schemaKey;

    switch (deviceType) {
        case 'airpods':
            Prefs = Airpods;
            schemaKey = 'airpods-list';
            break;
        case 'sony':
            Prefs = Sony;
            schemaKey = 'sony-list';
            break;
        case 'galaxyBuds':
            Prefs = GalaxyBuds;
            schemaKey = 'galaxy-buds-list';
            break;
        case 'nothingBuds':
            Prefs = NothingBuds;
            schemaKey = 'nothing-buds-list';
            break;
        case 'googleBuds':
            Prefs = GoogleBuds;
            schemaKey = 'google-buds-list';
            break;
        case 'redmiBuds':
            Prefs = RedmiBuds;
            schemaKey = 'redmi-buds-list';
            break;
        case 'senhBuds':
            Prefs = SenhBuds;
            schemaKey = 'senh-buds-list';
            break;
        case 'gfps':
            Prefs = Gfps;
            schemaKey = 'gfps-list';
            break;
        default:
            return null;
    }

    if (!_settings || !_settings.get_strv)
        return null;

    const list = _settings.get_strv(schemaKey).map(JSON.parse);
    const entry = list.find(e => e.path === devicePath);
    if (!entry)
        return null;

    const mac = pathToMac(devicePath);

    return new Prefs.ConfigureWindow(
        _settings,
        mac,
        devicePath,
        null,
        _gettext,
        false
    );
}
