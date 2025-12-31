'use strict';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {scriptDir} from '../../scriptLibs/utils.js';
import {createLogger} from './logger.js';

const MEDIA_PLAYER_PREFIX = 'org.mpris.MediaPlayer2.';

export const MediaController = GObject.registerClass({
    GTypeName: 'BluetoothEarbudsCompanion_MediaController',
    Properties: {
        'output-is-a2dp': GObject.ParamSpec.boolean(
            'output-is-a2dp', 'output-is-a2dp', '', GObject.ParamFlags.READWRITE, false
        ),
    },
}, class MediaController extends GObject.Object {
    _init(settings, devicePath, previousOnDestroyVolume) {
        super._init();
        this._log = createLogger('MediaController');
        this._settings = settings;
        this._devicePath = devicePath;
        const indexMacAddress = devicePath.indexOf('dev_') + 4;
        this._macId = devicePath.substring(indexMacAddress);
        this._previousVolume = previousOnDestroyVolume;

        this._isSinkDefault = false;
        this._isStreaming = false;
        this._volume = null;
        this._muted = null;

        this._asyncCancellable = new Gio.Cancellable();

        this._subscribeStream = null;
        this._subscribeCancellable = null;

        this._subscribePid = 0;
        this._subscribeStdoutFd = -1;
        this._decodeTimeoutId = 0;

        this._mprisNames = [];
        this._lastPausedPlayer = null;
        this._playbackStatusChangePending = false;

        this._initialize();
    }

    async _runPactl(argv, isJson) {
        if (this._asyncCancellable?.is_cancelled())
            return null;

        const proc = new Gio.Subprocess({
            argv,
            flags: Gio.SubprocessFlags.STDOUT_PIPE |
               Gio.SubprocessFlags.STDERR_PIPE,
        });

        proc.init(null);

        try {
            const [, stdout, stderr] = await new Promise((resolve, reject) => {
                proc.communicate_utf8_async(
                    null,
                    this._asyncCancellable,
                    (obj, res) => {
                        try {
                            resolve(obj.communicate_utf8_finish(res));
                        } catch (e) {
                            reject(e);
                        }
                    }
                );
            });

            if (this._asyncCancellable?.is_cancelled())
                return null;

            if (stderr?.length)
                return null;

            return isJson ? JSON.parse(stdout) : stdout;
        } catch {
            return null;
        }
    }

    async _isDefaultSink() {
        const defaultSink =
            await this._runPactl(['pactl', '-f', 'json', 'get-default-sink'], false);

        return defaultSink && defaultSink.includes(this._macId);
    }

    async _getCard() {
        const cards = await this._runPactl(['pactl', '-f', 'json', 'list', 'cards'], true);
        if (!Array.isArray(cards))
            return null;

        const card = cards.find(c => c.name?.includes(this._macId));
        if (!card)
            return null;

        return card;
    }

    async _getSink() {
        const sinks = await this._runPactl(['pactl', '-f', 'json', 'list', 'sinks'], true);
        if (!Array.isArray(sinks))
            return null;

        const sink = sinks.find(s => s.name?.includes(this._macId));
        if (!sink)
            return null;

        return sink;
    }

    _isA2DP(card) {
        const profile =
            typeof card?.active_profile === 'string'
                ? card.active_profile
                : card?.active_profile?.name ?? '';

        return profile.includes('a2dp');
    }

    _getSinkVolumePercent(sink) {
        if (!sink?.volume)
            return null;

        let max = null;

        for (const ch of Object.values(sink.volume)) {
            if (!ch?.value_percent)
                continue;

            const v = parseInt(ch.value_percent, 10);
            if (Number.isNaN(v))
                continue;

            if (max === null || v > max)
                max = v;
        }

        return max;
    }

    _isStreamingRunning(sink) {
        const volume = this._getSinkVolumePercent(sink);
        if (volume && this._volume !== volume)
            this._volume = volume;


        const muted = sink?.mute ?? null;
        if (this._muted !== muted)
            this._muted = muted;

        return sink?.state === 'RUNNING';
    }

    async _initialize() {
        try {
            const isDefault = await this._isDefaultSink();
            if (isDefault) {
                this._isSinkDefault = true;
                const card = await this._getCard();
                const sink = await this._getSink();
                if (card && sink) {
                    this.output_is_a2dp = this._isA2DP(card);
                    this._isStreaming = this._isStreamingRunning(sink);
                }
            }
            this._monitorPactl();
        } catch (e) {
            this._log.error(e);
        }
    }

    _monitorPactl() {
        this._subscribeCancellable = new Gio.Cancellable();

        const pactlPath = GLib.find_program_in_path('pactl');
        if (!pactlPath)
            throw new Error('pactl not found in PATH');

        const [, pid, stdinFd, stdoutFd] =
        GLib.spawn_async_with_pipes(
            null,
            [pactlPath, 'subscribe'],
            null,
            GLib.SpawnFlags.DO_NOT_REAP_CHILD,
            null
        );

        this._subscribePid = pid;
        this._subscribeStdoutFd = stdoutFd;

        if (stdinFd !== -1)
            GLib.close(stdinFd);

        const stdoutStream = new GioUnix.InputStream({
            fd: stdoutFd,
            close_fd: true,
        });

        this._subscribeStream = new Gio.DataInputStream({
            base_stream: stdoutStream,
        });

        this._readNextPactlLine();

        this._childWatchId = GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, () => {
            GLib.spawn_close_pid(pid);
            this._subscribePid = 0;
        });
    }

    _readNextPactlLine() {
        if (!this._subscribeStream || !this._subscribeCancellable)
            return;

        if (this._subscribeCancellable.is_cancelled())
            return;

        this._subscribeStream.read_line_async(
            GLib.PRIORITY_LOW,
            this._subscribeCancellable,
            (stream, res) => {
                if (!this._subscribeStream)
                    return;

                let line;
                try {
                    [line] = stream.read_line_finish_utf8(res);
                } catch (e) {
                    if (!this._subscribeCancellable.is_cancelled())
                        this._log.error(e);
                    return;
                }

                if (line === null)
                    return;

                this._handlePactlEvent(line);
                this._readNextPactlLine();
            }
        );
    }

    _handlePactlEvent(event) {
        if (event.includes('server')) {
            this._lastEvent = 'server';
        } else if (event.includes('card')) {
            if (this._lastEvent !== 'server')
                this._lastEvent = 'card';
        } else if (event.includes('sink')) {
            if (!this._lastEvent)
                this._lastEvent = 'sink';
        } else {
            return;
        }

        if (this._decodeTimeoutId > 0)
            return;

        this._decodeTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_LOW,
            300,
            () => {
                this._decodeTimeoutId = 0;
                const eventType = this._lastEvent;
                this._lastEvent = null;
                this._decodeEvent(eventType);
                return GLib.SOURCE_REMOVE;
            }
        );
    }


    async _decodeEvent(eventType) {
        if (eventType === 'server') {
            const isDefaultSink = await this._isDefaultSink();
            if (!isDefaultSink && this._isSinkDefault) {
                this._isSinkDefault = false;

                if (this.output_is_a2dp)
                    this.output_is_a2dp = false;

                this._isStreaming = false;
            }

            if (isDefaultSink) {
                this._isSinkDefault = true;

                const card = await this._getCard();
                const sink = await this._getSink();

                if (card && sink) {
                    const isA2dpOutput = this._isA2DP(card);
                    if (isA2dpOutput !== this.output_is_a2dp)
                        this.output_is_a2dp = isA2dpOutput;

                    this._isStreaming = this._isStreamingRunning(sink);
                }
            }
        } else if (eventType === 'card' && this._isSinkDefault) {
            const card = await this._getCard();
            const sink = await this._getSink();

            if (card && sink) {
                const isA2dpOutput = this._isA2DP(card);
                if (isA2dpOutput !== this.output_is_a2dp)
                    this.output_is_a2dp = isA2dpOutput;

                this._isStreaming = this._isStreamingRunning(sink);
            }
        } else if (eventType === 'sink' && this._isSinkDefault) {
            const sink = await this._getSink();
            this._isStreaming = this._isStreamingRunning(sink);
        }
    }

    async _fadeSubprocess(currentVol, newVol) {
        if (this._asyncCancellable?.is_cancelled())
            return;

        const proc = new Gio.Subprocess({
            argv: [`${scriptDir}/scriptLibs/scriptsBash/fade-volume.sh`,
                String(currentVol),
                String(newVol)],
            flags: Gio.SubprocessFlags.NONE,
        });

        proc.init(null);

        try {
            await new Promise((resolve, reject) => {
                proc.wait_async(this._asyncCancellable, (p, res) => {
                    try {
                        p.wait_finish(res);
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                });
            });
        } catch {
        /* cancelled or failed → ignore */
        }
    }

    async lowerAirpodsVolume(attenuated, caVolume) {
        if (!this._isStreaming || !this.output_is_a2dp || this._muted)
            return;

        if (attenuated && this._previousVolume !== null)
            return;

        if (!attenuated && this._previousVolume === null)
            return;

        const currentVolume = this._volume;

        if (typeof currentVolume !== 'number')
            return;

        if (attenuated) {
            const targetVolume = Math.floor(caVolume);

            if (currentVolume <= targetVolume)
                return;

            this._previousVolume = currentVolume;

            await this._fadeSubprocess(currentVolume, targetVolume);
        } else {
            const targetVolume = this._previousVolume;

            if (typeof targetVolume !== 'number')
                return;

            await this._fadeSubprocess(currentVolume, targetVolume);

            this._previousVolume = null;
        }
    }

    _playerPropsChanged() {
        if (this._playbackStatusChangePending) {
            this._playbackStatusChangePending = false;
            return;
        }
        const status = this._playerProxy?.get_cached_property('PlaybackStatus')?.unpack();
        if (status !== 'Paused')
            this._lastPausedPlayer = null;
    }

    async _changeStatus() {
        if (this._playerProxy) {
            if (this._requestedState === 'pause') {
                try {
                    await this._playerProxy.call(
                        'Pause',
                        null,
                        Gio.DBusCallFlags.NONE,
                        -1,
                        null
                    );
                } catch (e) {
                    this._log.error(e);
                }
                const status = this._playerProxy?.get_cached_property('PlaybackStatus')?.unpack();
                this._playbackStatusChangePending = status !== 'Paused';
                this._playerProxy.connectObject(
                    'g-properties-changed', () => this._playerPropsChanged(), this);
            } else {
                try {
                    await this._playerProxy.call(
                        'Play',
                        null,
                        Gio.DBusCallFlags.NONE,
                        -1,
                        null
                    );
                } catch {
                    console.error('Bluetooth-Battery-Meter: Error calling Mpris Play method');
                }
            }
        }
    }

    _onPlayerProxyReady() {
        const status = this._playerProxy?.get_cached_property('PlaybackStatus')?.unpack();
        if (this._requestedState === 'play' && status === 'Playing') {
            this._lastPausedPlayer = null;
            this._mprisNames = [];
        } else if (this._requestedState === 'play' && status === 'Paused') {
            this._lastPausedPlayer = null;
            this._mprisNames = [];
            this._changeStatus();
        } else if (this._requestedState === 'pause' && status === 'Playing') {
            this._mprisNames = [];
            this._lastPausedPlayer = this._busname;
            this._changeStatus();
        } else {
            this._playerProxy = null;
            this._iteratePlayers();
        }
    }

    async _initPlayerProxy(busname) {
        try {
            this._playerProxy = await Gio.DBusProxy.new_for_bus(
                Gio.BusType.SESSION,
                Gio.DBusProxyFlags.NONE,
                null,
                busname,
                '/org/mpris/MediaPlayer2',
                'org.mpris.MediaPlayer2.Player',
                null
            );
        } catch {
            console.error('Bluetooth-Battery-Meter: Failed to initialize proxy in player proxy');
            return;
        }
        this._onPlayerProxyReady();
    }

    _iteratePlayers() {
        if (this._mprisNames.length === 0)
            return;

        this._busname = this._mprisNames.shift();
        this._initPlayerProxy(this._busname);
    }

    _disconnectPlayerProxy() {
        this._playerProxy?.disconnectObject(this);
        this._playerProxy = null;
    }

    async changeActivePlayerState(requestedState) {
        if (requestedState === 'pause' && !this._isStreaming)
            return;

        this._requestedState = requestedState;
        this._disconnectPlayerProxy();

        let names = [];
        try {
            const res = await Gio.DBus.session.call(
                'org.freedesktop.DBus',
                '/org/freedesktop/DBus',
                'org.freedesktop.DBus',
                'ListNames',
                null,
                new GLib.VariantType('(as)'),
                Gio.DBusCallFlags.NONE,
                -1,
                null
            );

            if (res)
                [names] = res.deepUnpack();
        } catch {
            console.error('Bluetooth-Battery-Meter: Error calling ListNames');
            return;
        }

        this._mprisNames = names.filter(name => name.startsWith(MEDIA_PLAYER_PREFIX));
        if (this._requestedState === 'play') {
            if (this._lastPausedPlayer && this._mprisNames.includes(this._lastPausedPlayer))
                this._initPlayerProxy(this._lastPausedPlayer);
        } else {
            this._iteratePlayers();
        }
    }

    _onDestroy() {
        if (this._previousVolume !== null) {
            const lastAttenuationInfo = {
                path: this._devicePath,
                timestamp: Date.now(),
                volume: this._previousVolume,
            };
            this._settings.set_strv('attenuated-on-destroy-info',
                [JSON.stringify(lastAttenuationInfo)]);
        }
    }

    destroy() {
        this._onDestroy?.();

        if (this._decodeTimeoutId) {
            GLib.source_remove(this._decodeTimeoutId);
            this._decodeTimeoutId = 0;
        }

        if (this._asyncCancellable) {
            this._asyncCancellable.cancel();
            this._asyncCancellable = null;
        }

        if (this._subscribeCancellable) {
            this._subscribeCancellable.cancel();
            this._subscribeCancellable = null;
        }

        if (this._childWatchId) {
            GLib.source_remove(this._childWatchId);
            this._childWatchId = 0;
        }

        if (this._subscribeStream) {
            try {
                this._subscribeStream.close(null);
            } catch {}
            this._subscribeStream = null;
        }

        if (this._subscribePid > 0) {
            try {
                GLib.kill(this._subscribePid, GLib.SIGTERM);
            } catch {}
            this._subscribePid = 0;
        }

        this._disconnectPlayerProxy();

        this._settings = null;
        this._mprisNames = [];
    }
});

