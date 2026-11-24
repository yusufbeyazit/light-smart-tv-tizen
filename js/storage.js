/* ==========================================================================
   Nuvio Live - Safe LocalStorage Persistence Layer (ES5)
   ========================================================================== */
(function (global) {
    'use strict';

    var NL = global.NuvioLive = global.NuvioLive || {};
    var memoryFallback = {};

    function getRaw(key) {
        try {
            return global.localStorage.getItem(key);
        } catch (e) {
            return memoryFallback[key] || null;
        }
    }

    function setRaw(key, val) {
        try {
            global.localStorage.setItem(key, val);
            return true;
        } catch (e) {
            memoryFallback[key] = val;
            return false;
        }
    }

    function removeRaw(key) {
        try {
            global.localStorage.removeItem(key);
        } catch (e) {
            delete memoryFallback[key];
        }
    }

    NL.storage = {
        get: function (key, defaultValue) {
            var raw = getRaw(key);
            if (raw === null || raw === undefined) return defaultValue;
            try {
                return JSON.parse(raw);
            } catch (e) {
                return defaultValue;
            }
        },

        set: function (key, value) {
            try {
                return setRaw(key, JSON.stringify(value));
            } catch (e) {
                return false;
            }
        },

        remove: function (key) {
            removeRaw(key);
        },

        getDeviceId: function () {
            var id = NL.storage.get(NL.CONFIG.KEYS.DEVICE_ID, null);
            if (!id) {
                id = 'tizen3_' + NL.util.randomHex(16);
                NL.storage.set(NL.CONFIG.KEYS.DEVICE_ID, id);
            }
            return id;
        },

        getBackendConfig: function () {
            var saved = NL.storage.get(NL.CONFIG.KEYS.BACKEND_CFG, null);
            var def = NL.CONFIG.DEFAULT_BACKEND;
            if (!saved) {
                return Object.assign({}, def);
            }
            var merged = Object.assign({}, def, saved);
            if (!merged.supabaseUrl) merged.supabaseUrl = def.supabaseUrl;
            if (!merged.supabaseAnonKey && merged.supabaseUrl === def.supabaseUrl) {
                merged.supabaseAnonKey = def.supabaseAnonKey;
            }
            if (!merged.supabaseFallbackUrl && merged.supabaseUrl === def.supabaseUrl) {
                merged.supabaseFallbackUrl = def.supabaseFallbackUrl;
            }
            return merged;
        },

        setBackendConfig: function (cfg) {
            var merged = Object.assign({}, NL.storage.getBackendConfig(), cfg || {});
            merged.supabaseUrl = NL.util.trimUrl(merged.supabaseUrl);
            merged.tvLoginWebBaseUrl = NL.util.trimUrl(merged.tvLoginWebBaseUrl);
            merged.deviceLoginWebBaseUrl = NL.util.trimUrl(merged.deviceLoginWebBaseUrl);
            NL.storage.set(NL.CONFIG.KEYS.BACKEND_CFG, merged);
            return merged;
        },

        getPrefs: function () {
            var defaults = {
                autoPlayLast: true,
                aspectMode: 'letterbox', // letterbox | fill | original
                showDemoWhenEmpty: true,
                groupDuplicateStreams: true,
                preferredFormat: 'm3u8'
            };
            var saved = NL.storage.get(NL.CONFIG.KEYS.PREFS, null);
            return saved ? Object.assign({}, defaults, saved) : defaults;
        },

        setPrefs: function (patch) {
            var next = Object.assign({}, NL.storage.getPrefs(), patch || {});
            NL.storage.set(NL.CONFIG.KEYS.PREFS, next);
            return next;
        }
    };
})(window);
