/* ==========================================================================
   Nuvio Live - Xtream Codes Live TV & Short EPG Client (ES5)
   ========================================================================== */
(function (global) {
    'use strict';

    var NL = global.NuvioLive = global.NuvioLive || {};

    function apiUrl(src, action, extra) {
        var base = NL.util.trimUrl(src.server);
        var url = base + '/player_api.php?username=' + encodeURIComponent(src.username) +
            '&password=' + encodeURIComponent(src.password);
        if (action) url += '&action=' + encodeURIComponent(action);
        if (extra) url += '&' + extra;
        return url;
    }

    function buildLiveStreamUrl(src, streamId, ext) {
        var base = NL.util.trimUrl(src.server);
        var extension = ext || NL.storage.getPrefs().preferredFormat || 'm3u8';
        return base + '/live/' + encodeURIComponent(src.username) + '/' +
            encodeURIComponent(src.password) + '/' + streamId + '.' + extension;
    }

    function testConnection(src, callback) {
        NL.http.getJson(apiUrl(src), {}, function (err, data) {
            if (err || !data || !data.user_info || String(data.user_info.auth) === '0') {
                return callback(err || new Error('Xtream girisi dogrulanamadi'), null);
            }
            callback(null, data.user_info);
        }, 12000);
    }

    function loadLiveChannels(src, callback) {
        var catMap = {};
        NL.http.getJson(apiUrl(src, 'get_live_categories'), {}, function (cErr, cats) {
            if (!cErr && Array.isArray(cats)) {
                for (var i = 0; i < cats.length; i++) {
                    catMap[String(cats[i].category_id)] = cats[i].category_name || 'Genel';
                }
            }
            NL.http.getJson(apiUrl(src, 'get_live_streams'), {}, function (sErr, streams) {
                if (sErr || !Array.isArray(streams)) {
                    return callback(sErr || new Error('Xtream canli kanallar alinamadi'), []);
                }
                var label = src.name || 'Xtream TV';
                var list = [];
                for (var j = 0; j < streams.length; j++) {
                    var st = streams[j];
                    if (!st || !st.stream_id) continue;
                    var group = catMap[String(st.category_id)] || 'Genel';
                    var hlsUrl = buildLiveStreamUrl(src, st.stream_id, 'm3u8');
                    var tsUrl = buildLiveStreamUrl(src, st.stream_id, 'ts');
                    list.push({
                        id: 'xt_' + (src.id || 's') + '_' + st.stream_id,
                        number: st.num ? parseInt(st.num, 10) : 0,
                        name: st.name || ('Kanal ' + st.stream_id),
                        group: group,
                        logo: st.stream_icon || '',
                        tvgId: st.epg_channel_id || '',
                        xtreamSource: src,
                        xtreamStreamId: st.stream_id,
                        sourceName: label,
                        sourceType: 'xtream',
                        streams: [
                            { title: (st.name || 'Yayin') + ' (HLS .m3u8)', url: hlsUrl, quality: 'HLS', source: label },
                            { title: (st.name || 'Yayin') + ' (MPEG-TS .ts)', url: tsUrl, quality: 'TS', source: label }
                        ]
                    });
                }
                callback(null, list);
            }, 25000);
        }, 15000);
    }

    function getShortEpg(src, streamId, callback) {
        NL.http.getJson(apiUrl(src, 'get_short_epg', 'stream_id=' + encodeURIComponent(streamId) + '&limit=4'), {}, function (err, data) {
            if (err || !data || !Array.isArray(data.epg_listings)) {
                return callback(err, null);
            }
            var now = NL.util.now();
            var current = null;
            var next = null;
            for (var i = 0; i < data.epg_listings.length; i++) {
                var item = data.epg_listings[i];
                var startMs = item.start_timestamp ? (parseInt(item.start_timestamp, 10) * 1000) : Date.parse(item.start);
                var endMs = item.stop_timestamp ? (parseInt(item.stop_timestamp, 10) * 1000) : Date.parse(item.end);
                var title = decodeBase64Safe(item.title);
                var desc = decodeBase64Safe(item.description);
                var prog = { start: startMs, end: endMs, title: title, desc: desc };
                if (now >= startMs && now < endMs) {
                    current = prog;
                } else if (startMs > now && !next) {
                    next = prog;
                }
            }
            callback(null, { current: current, next: next });
        }, 8000);
    }

    function decodeBase64Safe(str) {
        if (!str) return '';
        try {
            return decodeURIComponent(escape(global.atob(str)));
        } catch (e) {
            try { return global.atob(str); } catch (e2) { return String(str); }
        }
    }

    NL.xtream = {
        testConnection: testConnection,
        loadLiveChannels: loadLiveChannels,
        getShortEpg: getShortEpg
    };
})(window);
