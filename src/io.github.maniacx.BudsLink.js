#!@GJS@ -m
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

imports.package.init({
    name: '@PACKAGE_NAME@',
    version: '@PACKAGE_VERSION@',
    prefix: '@PREFIX@',
    libdir: '@LIBDIR@',
});

const settings = new Gio.Settings({schema_id: '@PACKAGE_NAME@'});
const lang = settings.get_string('language');
if (lang && lang !== 'system')
    GLib.setenv('LANGUAGE', lang, true);

imports.package.initGettext();

const loop = new GLib.MainLoop(null, false);
import('resource:///io/github/maniacx/BudsLink/js/main.js')
    .then(main => {
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            loop.quit();
            imports.package.run(main);
            return GLib.SOURCE_REMOVE;
        });
    })
    .catch(logError);

loop.run();

