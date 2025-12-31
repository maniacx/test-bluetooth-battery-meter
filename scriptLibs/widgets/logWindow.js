import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';
import {setLiveLogSink} from '../../lib/devices/logger.js';

const LogWindow = GObject.registerClass(
class LogWindow extends Gtk.Window {
    _init(_, params = {}) {
        super._init({
            title: _('Realtime Logs'),
            default_width: 900,
            default_height: 500,
            ...params,
        });

        const vbox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
        });

        const scrolled = new Gtk.ScrolledWindow({
            vexpand: true,
        });
        scrolled.set_size_request(-1, 220);

        this._logBuffer = new Gtk.TextBuffer();

        this._logView = new Gtk.TextView({
            buffer: this._logBuffer,
            editable: false,
            monospace: true,
            wrap_mode: Gtk.WrapMode.WORD_CHAR,
        });

        scrolled.set_child(this._logView);
        vbox.append(scrolled);

        this.set_child(vbox);
    }

    appendLine(line) {
        const endIter = this._logBuffer.get_end_iter();
        this._logBuffer.insert(endIter, line, line.length);

        const mark = this._logBuffer.create_mark(
            null,
            this._logBuffer.get_end_iter(),
            true
        );
        this._logView.scroll_to_mark(mark, 0, false, 0, 0);
    }
});

let logWindow = null;
export function openLogWindow(gtxt) {
    if (!logWindow) {
        logWindow = new LogWindow(gtxt);

        setLiveLogSink(line => {
            logWindow.appendLine(line);
        });

        logWindow.connect('close-request', () => {
            logWindow = null;
            return false;
        });
    }

    logWindow.present();
}

