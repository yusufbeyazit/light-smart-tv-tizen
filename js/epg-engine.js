/* ==========================================================================
   Nuvio Live - Lightweight Chunked XMLTV EPG Engine (ES5)
   Memory-capped window (-2h to +12h) for Tizen 3.0 RAM efficiency
   ========================================================================== */
(function (global) {
    'use strict';

    var NL = global.NuvioLive = global.NuvioLive || {};
    var byId = {};
    var byName = {};
    var loadedCount = 0;

    // Parse XMLTV timestamp: YYYYMMDDHHMMSS +HHMM
    function parseXmltvDate(str) {
        if (!str || str.length < 14) return 0;
        var y = parseInt(str.substring(0, 4), 10);
        var mo = parseInt(str.substring(4, 6), 10) - 1;
        var d = parseInt(str.substring(6, 8), 10);
        var h = parseInt(str.substring(8, 10), 10);
        var mi = parseInt(str.substring(10, 12), 10);
        var s = parseInt(str.substring(12, 14), 10);
        var utc = Date.UTC(y, mo, d, h, mi, s);
        var tzMatch = str.match(/([+-])(\d{2})(\d{2})/);
        if (tzMatch) {
            var sign = tzMatch[1] === '+' ? 1 : -1;
            var offsetMs = (parseInt(tzMatch[2], 10) * 60 + parseInt(tzMatch[3], 10)) * 60000;
            utc -= sign * offsetMs;
        }
        return utc;
    }

    function decodeXmlEntities(s) {
        if (!s) return '';
        return String(s)
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'");
    }

    function clear() {
        byId = {};
        byName = {};
        loadedCount = 0;
    }

    function parseXmltvAsync(xmlText, callback) {
        if (!xmlText || typeof xmlText !== 'string') {
            return callback && callback(null, 0);
        }
        var now = NL.util.now();
        var windowStart = now - 2 * 3600000;
        var windowEnd = now + 12 * 3600000;

        // First map <channel id="..."> to display-name for fallback matching
        var chanIdToName = {};
        var chRe = /<channel\s+[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/channel>/gi;
        var cm;
        while ((cm = chRe.exec(xmlText)) !== null) {
            var dn = cm[2].match(/<display-name[^>]*>([^<]+)<\/display-name>/i);
            if (dn) {
                chanIdToName[cm[1].toLowerCase()] = NL.util.normalizeChannelKey(decodeXmlEntities(dn[1]));
            }
        }

        var progRe = /<programme\s+([^>]+)>([\s\S]*?)<\/programme>/gi;
        var count = 0;
        var BATCH = 350;

        function processBatch() {
            var processed = 0;
            var m;
            while (processed < BATCH && (m = progRe.exec(xmlText)) !== null) {
                processed++;
                var attrs = m[1];
                var body = m[2];
                var stM = attrs.match(/start="([^"]+)"/i);
                var spM = attrs.match(/stop="([^"]+)"/i);
                var chM = attrs.match(/channel="([^"]+)"/i);
                if (!stM || !spM || !chM) continue;

                var startMs = parseXmltvDate(stM[1]);
                var endMs = parseXmltvDate(spM[1]);
                if (!startMs || !endMs || endMs < windowStart || startMs > windowEnd) continue;

                var titleM = body.match(/<title[^>]*>([^<]+)<\/title>/i);
                var descM = body.match(/<desc[^>]*>([^<]+)<\/desc>/i);
                var prog = {
                    start: startMs,
                    end: endMs,
                    title: titleM ? decodeXmlEntities(titleM[1].trim()) : '',
                    desc: descM ? decodeXmlEntities(descM[1].trim()) : ''
                };

                var cid = chM[1].toLowerCase();
                if (!byId[cid]) byId[cid] = [];
                byId[cid].push(prog);

                var cname = chanIdToName[cid];
                if (cname) {
                    if (!byName[cname]) byName[cname] = byId[cid];
                }
                count++;
            }

            if (processed >= BATCH) {
                setTimeout(processBatch, 0);
            } else {
                loadedCount += count;
                if (callback) callback(null, count);
            }
        }

        setTimeout(processBatch, 0);
    }

    function loadFromUrl(url, callback) {
        NL.http.getText(url, {}, function (err, text) {
            if (err) return callback && callback(err, 0);
            parseXmltvAsync(text, callback);
        }, 30000);
    }

    function getNowNext(channel) {
        if (!channel) return null;
        var list = null;
        if (channel.tvgId) {
            list = byId[String(channel.tvgId).toLowerCase()];
        }
        if (!list && channel.name) {
            list = byName[NL.util.normalizeChannelKey(channel.name)];
        }
        if (!list || list.length === 0) return null;

        var now = NL.util.now();
        var current = null;
        var next = null;
        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            if (now >= p.start && now < p.end) {
                current = p;
            } else if (p.start > now) {
                if (!next || p.start < next.start) next = p;
            }
        }
        if (!current && !next) return null;
        var progress = 0;
        if (current && current.end > current.start) {
            progress = NL.util.clamp(Math.round(((now - current.start) / (current.end - current.start)) * 100), 0, 100);
        }
        return {
            current: current,
            next: next,
            progress: progress
        };
    }

    NL.epg = {
        clear: clear,
        loadFromUrl: loadFromUrl,
        parseXmltvAsync: parseXmltvAsync,
        getNowNext: getNowNext,
        getCount: function () { return loadedCount; }
    };
})(window);
