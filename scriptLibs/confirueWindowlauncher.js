import * as Airpods from '../preferences/devices/airpods/configureWindow.js';
import * as Sony from '../preferences/devices/sony/configureWindow.js';

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

