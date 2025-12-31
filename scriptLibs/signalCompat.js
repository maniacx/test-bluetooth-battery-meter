import GObject from 'gi://GObject';

/*
 * Install GNOME Shell–compatible connectObject()/disconnectObject()
 * if they are missing (plain gjs environment).
 */

(function installObjectSignalCompat() {
    const proto = GObject.Object.prototype;

    // GNOME Shell already provides these — do nothing there
    if (proto.connectObject && proto.disconnectObject)
        return;

    class SignalTracker {
        constructor(emitter) {
            this._emitter = emitter;
            this._map = new WeakMap();

            if (this._hasDestroySignal(emitter)) {
                this._emitterDestroyId = emitter.connect('destroy', () => {
                    this.clear();
                });
            }
        }

        _hasDestroySignal(obj) {
            return obj instanceof GObject.Object &&
                GObject.signal_lookup('destroy', obj);
        }

        _get(obj) {
            if (!this._map.has(obj))
                this._map.set(obj, {ids: [], destroyId: 0});
            return this._map.get(obj);
        }

        track(obj, ...ids) {
            const data = this._get(obj);
            data.ids.push(...ids);

            if (!data.destroyId && this._hasDestroySignal(obj)) {
                data.destroyId = obj.connect('destroy', () => {
                    this.untrack(obj);
                });
            }
        }

        untrack(obj) {
            const data = this._map.get(obj);
            if (!data)
                return;

            for (const id of data.ids)
                this._emitter.disconnect(id);

            if (data.destroyId)
                obj.disconnect(data.destroyId);

            this._map.delete(obj);
        }

        clear() {
            for (const obj of this._map.keys())
                this.untrack(obj);
        }
    }

    const trackers = new WeakMap();

    function getTracker(emitter) {
        if (!trackers.has(emitter))
            trackers.set(emitter, new SignalTracker(emitter));
        return trackers.get(emitter);
    }

    proto.connectObject = function (...args) {
        const ids = [];

        while (args.length > 1) {
            const signal = args.shift();
            const handler = args.shift();
            ids.push(this.connect(signal, handler));
        }

        const trackedObj = args[0] ?? globalThis;
        getTracker(this).track(trackedObj, ...ids);
    };

    proto.disconnectObject = function (obj) {
        getTracker(this).untrack(obj);
    };

    // snake_case aliases for full Shell parity
    proto.connect_object = proto.connectObject;
    proto.disconnect_object = proto.disconnectObject;
})();

