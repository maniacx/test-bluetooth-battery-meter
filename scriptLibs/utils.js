'use strict';

import GLib from 'gi://GLib';
import Gettext from 'gettext';

export const APP_ID = 'com.github.maniacx.BluetoothEarbudsCompanion';

const currentFile = import.meta.url.replace('file://', '');
const scriptLibDir = GLib.path_get_dirname(currentFile);
export const scriptDir = GLib.path_get_dirname(scriptLibDir);

const localeDir = GLib.build_filenamev([scriptDir, 'translations', 'locale']);
Gettext.bindtextdomain(APP_ID, localeDir);
Gettext.textdomain(APP_ID);

export const Gtxt = Gettext.gettext;

