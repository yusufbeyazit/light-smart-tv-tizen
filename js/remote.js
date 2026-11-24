/* ==========================================================================
   Nuvio Live - Samsung Tizen 3.0 Remote Control + Desktop Keyboard Bridge
   Also scales 1920x1080 TV canvas cleanly when previewed on desktop PC
   ========================================================================== */
(function (global) {
    'use strict';

    var NL = global.NuvioLive = global.NuvioLive || {};
    var keyHandler = null;

    var TIZEN_KEYS = [
        'ChannelUp', 'ChannelDown',
        'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
        'Info', 'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
        'MediaFastForward', 'MediaRewind',
        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
    ];

    function registerTizenKeys() {
        try {
            if (global.tizen && global.tizen.tvinputdevice) {
                if (typeof global.tizen.tvinputdevice.registerKeyBatch === 'function') {
                    global.tizen.tvinputdevice.registerKeyBatch(TIZEN_KEYS);
                } else {
                    for (var i = 0; i < TIZEN_KEYS.length; i++) {
                        try { global.tizen.tvinputdevice.registerKey(TIZEN_KEYS[i]); } catch (e) {}
                    }
                }
            }
        } catch (err) {}
    }

    function mapKeyEvent(e) {
        var code = e.keyCode || e.which;

        // Allow native text typing when an input field is actively focused
        var active = document.activeElement;
        var isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');

        if (isTyping) {
            if (code === 10009 || code === 27) return 'BACK';
            if (code === 13) return 'INPUT_ENTER';
            if (code === 38) return 'UP';
            if (code === 40) return 'DOWN';
            return null; // Let user type freely into the input
        }

        // Digits 0-9
        if (code >= 48 && code <= 57) return 'DIGIT_' + (code - 48);
        if (code >= 96 && code <= 105) return 'DIGIT_' + (code - 96);

        switch (code) {
            case 37: return 'LEFT';
            case 38: return 'UP';
            case 39: return 'RIGHT';
            case 40: return 'DOWN';
            case 13: return 'ENTER';
            case 10009: // Samsung Tizen Return
            case 27:    // Desktop Escape
            case 8:     // Desktop Backspace
                return 'BACK';
            case 427:   // Samsung ChannelUp
            case 33:    // PageUp (desktop)
                return 'CH_UP';
            case 428:   // Samsung ChannelDown
            case 34:    // PageDown (desktop)
                return 'CH_DOWN';
            case 403:   // ColorF0Red
            case 70:    // 'F' key (Favorite on desktop)
                return 'RED';
            case 404:   // ColorF1Green
            case 83:    // 'S' key (Streams on desktop)
                return 'GREEN';
            case 405:   // ColorF2Yellow
            case 81:    // 'Q' key (Search on desktop)
                return 'YELLOW';
            case 406:   // ColorF3Blue
            case 78:    // 'N' key (Nuvio Settings on desktop)
                return 'BLUE';
            case 457:   // Samsung Info
            case 73:    // 'I' key (Info on desktop)
                return 'INFO';
            case 10252: // Samsung MediaPlayPause
            case 415:   // MediaPlay
            case 19:    // MediaPause
            case 32:    // Spacebar
                return 'PLAY_PAUSE';
            case 413:   // MediaStop
                return 'STOP';
            case 417:   // Samsung MediaFastForward
            case 221:   // ']' key on desktop
            case 190:   // '.' key on desktop
                return 'SEEK_FWD';
            case 412:   // Samsung MediaRewind
            case 219:   // '[' key on desktop
            case 188:   // ',' key on desktop
                return 'SEEK_BACK';
            case 82:    // 'R' (Reconnect on desktop)
                return 'RECONNECT';
            default:
                return null;
        }
    }

    function isTizenEnvironment() {
        var ua = String((global.navigator && global.navigator.userAgent) || '').toLowerCase();
        return !!(
            global.tizen ||
            (global.webapis && (global.webapis.avplay || global.webapis.productinfo)) ||
            ua.indexOf('tizen') !== -1 ||
            ua.indexOf('smart-tv') !== -1 ||
            ua.indexOf('smarttv') !== -1
        );
    }

    function fitStageToViewport() {
        var stage = document.getElementById('tv-stage');
        if (!stage) return;

        // CRITICAL FOR SAMSUNG TIZEN 3.0:
        // Samsung TV WebView renders a native 1920x1080 CSS canvas via viewport meta,
        // but older Tizen 3.0 builds often under-report window.innerWidth (e.g. 960 or 1280).
        // Never CSS-scale #tv-stage on Tizen TV or the UI gets double-shrunk!
        if (isTizenEnvironment()) {
            stage.style.webkitTransform = 'none';
            stage.style.transform = 'none';
            stage.style.left = '0px';
            stage.style.top = '0px';
            stage.style.width = '1920px';
            stage.style.height = '1080px';
            return;
        }

        var w = global.innerWidth || 1920;
        var h = global.innerHeight || 1080;
        if (w >= 1900 && h >= 1060) {
            stage.style.webkitTransform = 'none';
            stage.style.transform = 'none';
            stage.style.left = '0px';
            stage.style.top = '0px';
            return;
        }
        var scale = Math.min(w / 1920, h / 1080);
        var left = Math.floor((w - 1920 * scale) / 2);
        var top = Math.floor((h - 1080 * scale) / 2);
        stage.style.left = left + 'px';
        stage.style.top = top + 'px';
        stage.style.webkitTransform = 'scale(' + scale + ')';
        stage.style.transform = 'scale(' + scale + ')';
    }

    function exitApp() {
        try {
            if (global.tizen && global.tizen.application) {
                global.tizen.application.getCurrentApplication().exit();
            }
        } catch (e) {}
    }

    function init(onAction) {
        keyHandler = onAction;
        registerTizenKeys();
        fitStageToViewport();
        global.addEventListener('resize', fitStageToViewport);

        document.addEventListener('keydown', function (e) {
            var action = mapKeyEvent(e);
            if (!action) return;
            e.preventDefault();
            if (keyHandler) keyHandler(action, e);
        });
    }

    NL.remote = {
        init: init,
        exitApp: exitApp,
        fitStageToViewport: fitStageToViewport
    };
})(window);
