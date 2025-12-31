import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const MODULE_DIR = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const CONFIG_PATH = GLib.build_filenamev([MODULE_DIR, 'mock-settings.ini']);

export const MockSettings = GObject.registerClass({
    Signals: {
        'changed': {param_types: [GObject.TYPE_STRING]},
    },
}, class MockSettings extends GObject.Object {
    _init(schemaId) {
        super._init();
        this._schemaId = schemaId;

        this._data = {};
        this._load();
    }

    _load() {
        try {
            const file = Gio.File.new_for_path(CONFIG_PATH);

            if (!file.query_exists(null)) {
                const stream = file.create(
                    Gio.FileCreateFlags.REPLACE_DESTINATION,
                    null
                );
                stream.close(null);

                this._data = {};
                return;
            }
            const [ok, contents] = file.load_contents(null);
            if (!ok)
                throw new Error('load failed');

            const text = new TextDecoder().decode(contents);

            this._data = {};

            for (const line of text.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#'))
                    continue;

                const eq = trimmed.indexOf('=');
                if (eq === -1)
                    continue;

                const key = trimmed.slice(0, eq).trim();
                const raw = trimmed.slice(eq + 1).trim();

                try {
                    this._data[key] = JSON.parse(raw);
                } catch {
                    this._data[key] = [];
                }
            }
        } catch {
            this._save();
        }
    }

    _save() {
        let out = '';
        for (const [key, val] of Object.entries(this._data))
            out += `${key}=${JSON.stringify(val)}\n`;

        const file = Gio.File.new_for_path(CONFIG_PATH);
        file.replace_contents(
            new TextEncoder().encode(out),
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null
        );
    }

    get_strv(key) {
        return Array.isArray(this._data[key]) ? this._data[key] : [];
    }

    set_strv(key, value) {
        this._data[key] = value;
        this._save();
        this.emit('changed', key);
    }

    connect(detailed, callback) {
        if (detailed.startsWith('changed::')) {
            const targetKey = detailed.split('::')[1];
            return super.connect('changed', (obj, changedKey) => {
                if (changedKey === targetKey)
                    callback(obj, changedKey);
            });
        }

        return super.connect(detailed, callback);
    }
});

