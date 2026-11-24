/* ==========================================================================
   Nuvio Live - Samsung Tizen 3.0 Hardware AVPlay Engine + HTML5 Fallback
   Optimized for instant Live TV zapping, HLS/MPEG-TS, custom headers, tracks
   ========================================================================== */
(function (global) {
    'use strict';

    var NL = global.NuvioLive = global.NuvioLive || {};

    var useAvPlay = false;
    var videoEl = null;
    var currentChannel = null;
    var currentStreams = [];
    var currentStreamIdx = 0;
    var playState = 'idle'; // idle | loading | buffering | playing | paused | error
    var retryCount = 0;
    var zapTimer = null;
    var retryTimer = null;
    var aspectMode = 'letterbox';
    var listeners = [];
    var audioTracks = [];
    var activeAudioIdx = 0;
    var subtitleTracks = [];
    var activeSubIdx = -1;
    var currentTimeMs = 0;
    var durationMs = 0;
    var seekDebounceTimer = null;
    var pendingSeekDeltaMs = 0;

    function emit(type, payload) {
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](type, payload); } catch (e) {}
        }
    }

    function setState(next, detail) {
        playState = next;
        emit('state', {
            state: next,
            detail: detail || '',
            channel: currentChannel,
            stream: currentStreams[currentStreamIdx] || null,
            streamIndex: currentStreamIdx,
            streamCount: currentStreams.length
        });
    }

    function init() {
        aspectMode = NL.storage.getPrefs().aspectMode || 'letterbox';
        useAvPlay = NL.util.isTizen();
        videoEl = document.getElementById('html5-video');
        var avObj = document.getElementById('av-player');

        if (useAvPlay) {
            if (videoEl) videoEl.style.display = 'none';
            if (avObj) avObj.style.display = 'block';
            try {
                // Keep TV screen awake during live TV playback
                if (global.webapis && global.webapis.appcommon && global.webapis.appcommon.setScreenSaver) {
                    global.webapis.appcommon.setScreenSaver(global.webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF);
                }
            } catch (e) {}
        } else {
            if (avObj) avObj.style.display = 'none';
            if (videoEl) {
                videoEl.style.display = 'block';
                bindHtml5Events();
            }
        }
    }

    function bindHtml5Events() {
        if (!videoEl) return;
        videoEl.addEventListener('waiting', function () {
            if (playState !== 'idle') setState('buffering', 'Arabelleğe alınıyor...');
        });
        videoEl.addEventListener('playing', function () {
            retryCount = 0;
            setState('playing', '');
        });
        videoEl.addEventListener('pause', function () {
            if (playState === 'playing') setState('paused', 'Duraklatildi');
        });
        videoEl.addEventListener('timeupdate', function () {
            currentTimeMs = Math.floor((videoEl.currentTime || 0) * 1000);
            durationMs = (videoEl.duration && isFinite(videoEl.duration))
                ? Math.floor(videoEl.duration * 1000) : 0;
            emit('time', { currentMs: currentTimeMs, durationMs: durationMs });
        });
        videoEl.addEventListener('error', function () {
            handleStreamFailure('Yayin acilamadi (Tarayici onizlemesi HLS/MPEG-TS desteklemeyebilir; TV\'de AVPlay ile calisir)');
        });
    }

    function clearTimers() {
        if (zapTimer) { clearTimeout(zapTimer); zapTimer = null; }
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
        if (seekDebounceTimer) { clearTimeout(seekDebounceTimer); seekDebounceTimer = null; }
        pendingSeekDeltaMs = 0;
    }

    function stopHardware() {
        if (useAvPlay) {
            try {
                var st = global.webapis.avplay.getState();
                if (st !== 'NONE' && st !== 'IDLE') {
                    global.webapis.avplay.stop();
                }
            } catch (e) {}
            try {
                global.webapis.avplay.close();
            } catch (e2) {}
        } else if (videoEl) {
            try {
                videoEl.pause();
                videoEl.removeAttribute('src');
                videoEl.load();
            } catch (e3) {}
        }
    }

    function applyAspectRatio(mode) {
        aspectMode = mode || 'letterbox';
        NL.storage.setPrefs({ aspectMode: aspectMode });
        if (useAvPlay) {
            try {
                var method = 'PLAYER_DISPLAY_MODE_LETTER_BOX';
                if (aspectMode === 'fill') method = 'PLAYER_DISPLAY_MODE_FULL_SCREEN';
                else if (aspectMode === 'original') method = 'PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO';
                global.webapis.avplay.setDisplayMethod(method);
            } catch (e) {}
        } else if (videoEl) {
            videoEl.style.objectFit = aspectMode === 'fill' ? 'cover' : 'contain';
        }
        emit('aspect', { mode: aspectMode });
    }

    function cycleAspectRatio() {
        var order = ['letterbox', 'fill', 'original'];
        var idx = order.indexOf(aspectMode);
        var next = order[(idx + 1) % order.length];
        applyAspectRatio(next);
        return next;
    }

    function playChannel(channel, streamIndex) {
        if (!channel) return;
        clearTimers();
        currentChannel = channel;
        currentStreams = (channel.streams || []).slice();
        currentStreamIdx = streamIndex || 0;
        retryCount = 0;

        NL.store.recordRecent(channel.id);
        setState('loading', 'Kanala baglaniliyor...');

        // Debounce rapid CH+/CH- zapping so Tizen 3.0 decoder stays rock-solid
        zapTimer = setTimeout(function () {
            zapTimer = null;
            // If channel comes from a Nuvio addon and streams aren't resolved yet, resolve now
            if (channel.sourceType === 'addon' && currentStreams.length === 0) {
                setState('loading', 'Nuvio eklenti yayinlari aranıyor...');
                NL.addonClient.resolveChannelStreams(channel, NL.store.getAllAddons(), function (err, resolved) {
                    if (currentChannel !== channel) return;
                    if (resolved && resolved.length > 0) {
                        channel.streams = resolved.slice();
                        currentStreams = resolved.slice();
                        currentStreamIdx = Math.min(currentStreamIdx, currentStreams.length - 1);
                        openCurrentStream();
                    } else {
                        setState('error', 'Bu kanal icin aktif yayin bulunamadi');
                    }
                });
            } else {
                openCurrentStream();
            }
        }, NL.CONFIG.ZAP_DEBOUNCE_MS);
    }

    function switchStream(index) {
        if (!currentStreams || index < 0 || index >= currentStreams.length) return;
        clearTimers();
        currentStreamIdx = index;
        retryCount = 0;
        openCurrentStream();
    }

    function openCurrentStream() {
        var st = currentStreams[currentStreamIdx];
        if (!st || !st.url) {
            setState('error', 'Gecerli yayin baglantisi yok');
            return;
        }
        setState('loading', (st.source || 'Yayin') + ' baglaniliyor...');
        stopHardware();

        if (useAvPlay) {
            openWithAvPlay(st);
        } else {
            openWithHtml5(st);
        }
    }

    function openWithAvPlay(stream) {
        var avplay = global.webapis.avplay;
        try {
            avplay.open(stream.url);
            avplay.setDisplayRect(0, 0, 1920, 1080);
            applyAspectRatio(aspectMode);

            // Fast Live TV zapping buffer params
            try {
                avplay.setBufferingParam('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', NL.CONFIG.AVPLAY_BUFFER_PLAY_SEC);
                avplay.setBufferingParam('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', NL.CONFIG.AVPLAY_BUFFER_RESUME_SEC);
            } catch (bErr) {}

            // Apply custom headers (User-Agent / Referer) if provided by M3U or Nuvio Addon
            if (stream.headers) {
                try {
                    if (stream.headers['User-Agent'] || stream.headers['user-agent']) {
                        avplay.setStreamingProperty('USER_AGENT', stream.headers['User-Agent'] || stream.headers['user-agent']);
                    }
                    var customPairs = [];
                    for (var hk in stream.headers) {
                        if (Object.prototype.hasOwnProperty.call(stream.headers, hk) && hk.toLowerCase() !== 'user-agent') {
                            customPairs.push(hk + ':' + stream.headers[hk]);
                        }
                    }
                    if (customPairs.length > 0) {
                        avplay.setStreamingProperty('CUSTOM_HEADER', customPairs.join('\r\n'));
                    }
                } catch (hErr) {}
            }

            avplay.setListener({
                onbufferingstart: function () {
                    setState('buffering', 'Arabelleğe alınıyor...');
                },
                onbufferingprogress: function (percent) {
                    setState('buffering', 'Yukleniyor %' + percent);
                },
                onbufferingcomplete: function () {
                    retryCount = 0;
                    setState('playing', '');
                },
                onstreamcompleted: function () {
                    // Live stream ended/dropped -> reconnect automatically
                    handleStreamFailure('Canli yayin akisi kesildi, yeniden baglaniliyor...');
                },
                oncurrentplaytime: function (ms) {
                    currentTimeMs = Number(ms) || 0;
                    try {
                        durationMs = Number(avplay.getDuration()) || 0;
                    } catch (dErr) {}
                    emit('time', { currentMs: currentTimeMs, durationMs: durationMs });
                },
                onerror: function (errType) {
                    handleStreamFailure('AVPlay hatasi: ' + errType);
                },
                onevent: function () {}
            });

            avplay.prepareAsync(function () {
                try {
                    refreshAvPlayTracks();
                    avplay.play();
                    retryCount = 0;
                    setState('playing', '');
                } catch (playErr) {
                    handleStreamFailure('Oynatma baslatilamadi');
                }
            }, function (prepErr) {
                handleStreamFailure('Yayin hazirlanamadi (' + (prepErr && prepErr.name ? prepErr.name : 'Hata') + ')');
            });
        } catch (err) {
            handleStreamFailure('AVPlay acilamadi: ' + (err.message || err));
        }
    }

    function openWithHtml5(stream) {
        if (!videoEl) return;
        try {
            videoEl.src = stream.url;
            videoEl.load();
            var p = videoEl.play();
            if (p && typeof p.catch === 'function') {
                p.catch(function () {
                    // Autoplay or HLS codec limitation in desktop browser preview
                    setState('error', 'Masaustu onizlemede bu HLS/TS yayini tarayici tarafindan oynatilamadi (Tizen TV\'de AVPlay donanimda acar)');
                });
            }
        } catch (e) {
            setState('error', 'Video baslatilamadi');
        }
    }

    function handleStreamFailure(reason) {
        if (!currentChannel) return;
        // If there is another stream source on this channel, automatically failover!
        if (currentStreams.length > 1 && retryCount === 0 && (currentStreamIdx + 1) < currentStreams.length) {
            currentStreamIdx++;
            setState('loading', 'Yedek yayina geciliyor (' + (currentStreamIdx + 1) + '/' + currentStreams.length + ')...');
            retryTimer = setTimeout(openCurrentStream, 900);
            return;
        }
        // Otherwise retry up to MAX_RETRIES on Tizen
        if (useAvPlay && retryCount < NL.CONFIG.STREAM_MAX_RETRIES) {
            retryCount++;
            setState('buffering', 'Yeniden baglaniliyor (' + retryCount + '/' + NL.CONFIG.STREAM_MAX_RETRIES + ')...');
            retryTimer = setTimeout(openCurrentStream, NL.CONFIG.STREAM_RECONNECT_DELAY_MS);
            return;
        }
        setState('error', reason || 'Yayin acilamadi');
    }

    function refreshAvPlayTracks() {
        audioTracks = [];
        subtitleTracks = [];
        activeAudioIdx = 0;
        activeSubIdx = -1;
        if (!useAvPlay) return;
        try {
            var tracks = global.webapis.avplay.getTotalTrackInfo() || [];
            for (var i = 0; i < tracks.length; i++) {
                var t = tracks[i];
                var extra = {};
                try { extra = JSON.parse(t.extra_info || '{}'); } catch (e) {}
                var lang = extra.language || extra.track_lang || ('Parca ' + t.index);
                if (t.type === 'AUDIO') {
                    audioTracks.push({ index: t.index, label: lang.toUpperCase() });
                } else if (t.type === 'TEXT') {
                    subtitleTracks.push({ index: t.index, label: lang.toUpperCase() });
                }
            }
        } catch (e2) {}
    }

    function cycleAudioTrack() {
        if (!useAvPlay || audioTracks.length <= 1) return null;
        activeAudioIdx = (activeAudioIdx + 1) % audioTracks.length;
        var track = audioTracks[activeAudioIdx];
        try {
            global.webapis.avplay.setSelectTrack('AUDIO', track.index);
            return track.label;
        } catch (e) {
            return null;
        }
    }

    function togglePause() {
        if (useAvPlay) {
            try {
                var st = global.webapis.avplay.getState();
                if (st === 'PLAYING') {
                    global.webapis.avplay.pause();
                    setState('paused', 'Duraklatildi');
                } else if (st === 'PAUSED') {
                    global.webapis.avplay.play();
                    setState('playing', '');
                }
            } catch (e) {}
        } else if (videoEl) {
            if (videoEl.paused) { videoEl.play(); setState('playing', ''); }
            else { videoEl.pause(); setState('paused', 'Duraklatildi'); }
        }
    }

    function executeHardwareSeek(deltaMs, callback) {
        if (!deltaMs) return;
        if (useAvPlay) {
            var avplay = global.webapis.avplay;
            try {
                var st = avplay.getState();
                if (st !== 'PLAYING' && st !== 'PAUSED' && st !== 'READY') {
                    if (callback) callback(new Error('Oynatici sarma icin hazir degil'));
                    return;
                }
                var absMs = Math.abs(deltaMs);
                var onOk = function () {
                    if (callback) callback(null);
                };
                var onFail = function () {
                    // Fallback to absolute seekTo if duration is known
                    if (durationMs > 0) {
                        var target = NL.util.clamp(currentTimeMs + deltaMs, 0, Math.max(0, durationMs - 1000));
                        try {
                            avplay.seekTo(target, onOk, function (err2) {
                                if (callback) callback(err2 || new Error('Bu canli yayin ileri/geri sarmayi desteklemiyor'));
                            });
                            return;
                        } catch (e2) {}
                    }
                    if (callback) callback(new Error('Bu canli yayin ileri/geri sarmayi desteklemiyor'));
                };

                if (deltaMs > 0) {
                    avplay.jumpForward(absMs, onOk, onFail);
                } else {
                    avplay.jumpBackward(absMs, onOk, onFail);
                }
            } catch (err) {
                if (callback) callback(err);
            }
        } else if (videoEl) {
            try {
                var targetSec = (videoEl.currentTime || 0) + (deltaMs / 1000);
                if (videoEl.seekable && videoEl.seekable.length > 0) {
                    var minS = videoEl.seekable.start(0);
                    var maxS = videoEl.seekable.end(videoEl.seekable.length - 1);
                    targetSec = NL.util.clamp(targetSec, minS, maxS);
                } else if (videoEl.duration && isFinite(videoEl.duration)) {
                    targetSec = NL.util.clamp(targetSec, 0, videoEl.duration);
                } else {
                    targetSec = Math.max(0, targetSec);
                }
                videoEl.currentTime = targetSec;
                if (callback) callback(null);
            } catch (e3) {
                if (callback) callback(new Error('Bu yayinda sarma desteklenmiyor'));
            }
        }
    }

    // Accumulating debounced seek so rapid FF/RW clicks feel instant and safe on Tizen 3.0
    function seekBy(deltaSec, onPreview, onComplete) {
        if (!currentChannel) return;
        pendingSeekDeltaMs += (deltaSec * 1000);
        if (onPreview) onPreview(Math.round(pendingSeekDeltaMs / 1000), currentTimeMs, durationMs);
        if (seekDebounceTimer) clearTimeout(seekDebounceTimer);
        seekDebounceTimer = setTimeout(function () {
            var totalDelta = pendingSeekDeltaMs;
            pendingSeekDeltaMs = 0;
            seekDebounceTimer = null;
            executeHardwareSeek(totalDelta, function (err) {
                if (onComplete) onComplete(err, Math.round(totalDelta / 1000));
            });
        }, 420);
    }

    function seekToLive() {
        if (!currentChannel) return;
        if (seekDebounceTimer) { clearTimeout(seekDebounceTimer); seekDebounceTimer = null; }
        pendingSeekDeltaMs = 0;
        if (useAvPlay && durationMs > 0) {
            try {
                global.webapis.avplay.seekTo(Math.max(0, durationMs - 2000), function () {}, function () {
                    reconnect();
                });
                return;
            } catch (e) {}
        }
        reconnect();
    }

    function reconnect() {
        if (!currentChannel) return;
        retryCount = 0;
        currentTimeMs = 0;
        durationMs = 0;
        openCurrentStream();
    }

    function stop() {
        clearTimers();
        stopHardware();
        currentTimeMs = 0;
        durationMs = 0;
        setState('idle', '');
    }

    NL.player = {
        init: init,
        playChannel: playChannel,
        switchStream: switchStream,
        seekBy: seekBy,
        seekToLive: seekToLive,
        reconnect: reconnect,
        stop: stop,
        togglePause: togglePause,
        cycleAspectRatio: cycleAspectRatio,
        applyAspectRatio: applyAspectRatio,
        cycleAudioTrack: cycleAudioTrack,
        getTimeInfo: function () { return { currentMs: currentTimeMs, durationMs: durationMs }; },
        getAspectMode: function () { return aspectMode; },
        getAudioTracks: function () { return audioTracks; },
        getState: function () { return playState; },
        getCurrentChannel: function () { return currentChannel; },
        getCurrentStreams: function () { return currentStreams; },
        getCurrentStreamIndex: function () { return currentStreamIdx; },
        onEvent: function (fn) {
            if (typeof fn === 'function') listeners.push(fn);
        }
    };
})(window);
