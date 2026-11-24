/* ==========================================================================
   Nuvio Live - Tizen 3.0 (Chromium 47) Strict ES5 Polyfills & Helpers
   ========================================================================== */
(function (global) {
    'use strict';

    var NL = global.NuvioLive = global.NuvioLive || {};

    // Object.assign polyfill for Chromium 47 safety
    if (typeof Object.assign !== 'function') {
        Object.assign = function (target) {
            if (target === null || target === undefined) {
                throw new TypeError('Cannot convert undefined or null to object');
            }
            var to = Object(target);
            for (var i = 1; i < arguments.length; i++) {
                var nextSource = arguments[i];
                if (nextSource !== null && nextSource !== undefined) {
                    for (var key in nextSource) {
                        if (Object.prototype.hasOwnProperty.call(nextSource, key)) {
                            to[key] = nextSource[key];
                        }
                    }
                }
            }
            return to;
        };
    }

    // String.prototype.trim / startsWith / endsWith / includes
    if (!String.prototype.startsWith) {
        String.prototype.startsWith = function (search, pos) {
            pos = !pos || pos < 0 ? 0 : +pos;
            return this.substring(pos, pos + search.length) === search;
        };
    }
    if (!String.prototype.endsWith) {
        String.prototype.endsWith = function (search, thisLen) {
            if (thisLen === undefined || thisLen > this.length) {
                thisLen = this.length;
            }
            return this.substring(thisLen - search.length, thisLen) === search;
        };
    }
    if (!String.prototype.includes) {
        String.prototype.includes = function (search, start) {
            if (typeof start !== 'number') start = 0;
            if (start + search.length > this.length) return false;
            return this.indexOf(search, start) !== -1;
        };
    }

    // Array.prototype.includes & find
    if (!Array.prototype.includes) {
        Array.prototype.includes = function (searchElement, fromIndex) {
            var len = this.length >>> 0;
            if (len === 0) return false;
            var n = fromIndex | 0;
            var k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);
            while (k < len) {
                if (this[k] === searchElement) return true;
                k++;
            }
            return false;
        };
    }
    if (!Array.prototype.find) {
        Array.prototype.find = function (predicate, thisArg) {
            for (var i = 0; i < this.length; i++) {
                if (predicate.call(thisArg, this[i], i, this)) {
                    return this[i];
                }
            }
            return undefined;
        };
    }

    // Safe utility library
    NL.util = {
        now: function () {
            return Date.now ? Date.now() : new Date().getTime();
        },

        uid: function (prefix) {
            var rand = Math.floor(Math.random() * 1000000000).toString(36);
            return (prefix || 'id') + '_' + NL.util.now().toString(36) + '_' + rand;
        },

        randomHex: function (len) {
            var chars = '0123456789abcdef';
            var out = '';
            var i;
            if (global.crypto && global.crypto.getRandomValues) {
                var arr = new Uint8Array(Math.ceil(len / 2));
                global.crypto.getRandomValues(arr);
                for (i = 0; i < arr.length; i++) {
                    out += ('0' + arr[i].toString(16)).slice(-2);
                }
                return out.slice(0, len);
            }
            for (i = 0; i < len; i++) {
                out += chars.charAt(Math.floor(Math.random() * 16));
            }
            return out;
        },

        escapeHtml: function (str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },

        // Turkish-friendly search & EPG matching normalization
        normalizeText: function (str) {
            if (!str) return '';
            return String(str)
                .replace(/İ/g, 'i')
                .replace(/I/g, 'i')
                .replace(/ı/g, 'i')
                .replace(/Ş/g, 's')
                .replace(/ş/g, 's')
                .replace(/Ğ/g, 'g')
                .replace(/ğ/g, 'g')
                .replace(/Ü/g, 'u')
                .replace(/ü/g, 'u')
                .replace(/Ö/g, 'o')
                .replace(/ö/g, 'o')
                .replace(/Ç/g, 'c')
                .replace(/ç/g, 'c')
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        },

        normalizeChannelKey: function (name) {
            var s = NL.util.normalizeText(name);
            // Strip common IPTV resolution/region tags for smart multi-stream grouping & EPG match
            s = s.replace(/\b(4k|uhd|fhd|hd|sd|hevc|h265|h264|50fps|60fps|tr|raw|backup|yedek|vip)\b/g, ' ');
            return s.replace(/\s+/g, ' ').trim();
        },

        formatTime: function (dateOrMs) {
            var d = (dateOrMs instanceof Date) ? dateOrMs : new Date(dateOrMs);
            if (isNaN(d.getTime())) return '--:--';
            var h = d.getHours();
            var m = d.getMinutes();
            return (h < 10 ? '0' + h : '' + h) + ':' + (m < 10 ? '0' + m : '' + m);
        },

        initials: function (name) {
            if (!name) return 'TV';
            var parts = String(name).trim().split(/\s+/);
            if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
            return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
        },

        clamp: function (val, min, max) {
            return val < min ? min : (val > max ? max : val);
        },

        isTizen: function () {
            return !!(global.tizen && global.webapis && global.webapis.avplay);
        },

        trimUrl: function (url) {
            if (!url) return '';
            return String(url).trim().replace(/\/+$/, '');
        },

        debounce: function (fn, wait) {
            var timer = null;
            return function () {
                var ctx = this;
                var args = arguments;
                if (timer) clearTimeout(timer);
                timer = setTimeout(function () {
                    timer = null;
                    fn.apply(ctx, args);
                }, wait);
            };
        }
    };
})(window);
