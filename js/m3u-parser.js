/* ==========================================================================
   Nuvio Live - Chunked Non-Blocking ES5 M3U / M3U8 Playlist Parser
   Parses 20,000+ channels cleanly without freezing Tizen 3.0 UI
   ========================================================================== */
(function (global) {
    'use strict';

    var NL = global.NuvioLive = global.NuvioLive || {};

    function extractAttr(line, attrName) {
        var re = new RegExp(attrName + '="([^"]*)"', 'i');
        var m = line.match(re);
        if (m) return m[1];
        var re2 = new RegExp(attrName + "='([^']*)'", 'i');
        var m2 = line.match(re2);
        return m2 ? m2[1] : '';
    }

    function guessQuality(name, url) {
        var s = (String(name || '') + ' ' + String(url || '')).toUpperCase();
        if (s.indexOf('4K') !== -1 || s.indexOf('UHD') !== -1 || s.indexOf('2160') !== -1) return '4K';
        if (s.indexOf('FHD') !== -1 || s.indexOf('1080') !== -1) return 'FHD';
        if (s.indexOf('HD') !== -1 || s.indexOf('720') !== -1) return 'HD';
        if (s.indexOf('HEVC') !== -1 || s.indexOf('H265') !== -1) return 'HEVC';
        return 'CANLI';
    }

    function parseAsync(text, sourceName, onProgress, callback) {
        if (!text || typeof text !== 'string') {
            return callback(null, []);
        }
        var lines = text.split(/\r?\n/);
        var total = lines.length;
        var idx = 0;
        var CHUNK = 600;
        var channels = [];
        var currentMeta = null;
        var currentHeaders = {};
        var sName = sourceName || 'M3U Liste';

        function step() {
            var end = Math.min(idx + CHUNK, total);
            for (; idx < end; idx++) {
                var line = lines[idx].trim();
                if (!line) continue;

                if (line.indexOf('#EXTINF:') === 0) {
                    var commaIdx = line.lastIndexOf(',');
                    var displayName = commaIdx !== -1 ? line.substring(commaIdx + 1).trim() : 'Kanal';
                    var tvgName = extractAttr(line, 'tvg-name');
                    var tvgId = extractAttr(line, 'tvg-id');
                    var tvgLogo = extractAttr(line, 'tvg-logo');
                    var tvgChno = extractAttr(line, 'tvg-chno');
                    var group = extractAttr(line, 'group-title') || 'Genel';

                    currentMeta = {
                        name: displayName || tvgName || 'Kanal',
                        tvgId: tvgId || '',
                        logo: tvgLogo || '',
                        number: tvgChno ? parseInt(tvgChno, 10) : 0,
                        group: group.trim() || 'Genel'
                    };
                } else if (line.indexOf('#EXTVLCOPT:') === 0) {
                    var opt = line.substring(11);
                    if (opt.indexOf('http-user-agent=') === 0) {
                        currentHeaders['User-Agent'] = opt.substring(16).trim();
                    } else if (opt.indexOf('http-referrer=') === 0) {
                        currentHeaders.Referer = opt.substring(14).trim();
                    }
                } else if (line.indexOf('#EXTGRP:') === 0) {
                    if (currentMeta && (!currentMeta.group || currentMeta.group === 'Genel')) {
                        currentMeta.group = line.substring(8).trim() || 'Genel';
                    }
                } else if (line.charAt(0) !== '#') {
                    // Stream URL line
                    var url = line;
                    var headersCopy = Object.assign({}, currentHeaders);
                    // Handle Kodi-style pipe headers: http://...m3u8|User-Agent=...&Referer=...
                    var pipeIdx = url.indexOf('|');
                    if (pipeIdx !== -1) {
                        var hPart = url.substring(pipeIdx + 1);
                        url = url.substring(0, pipeIdx).trim();
                        var pairs = hPart.split('&');
                        for (var p = 0; p < pairs.length; p++) {
                            var eq = pairs[p].indexOf('=');
                            if (eq > 0) {
                                var hk = pairs[p].substring(0, eq).trim();
                                var hv = decodeURIComponent(pairs[p].substring(eq + 1).trim());
                                headersCopy[hk] = hv;
                            }
                        }
                    }

                    if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) {
                        var meta = currentMeta || {
                            name: 'Kanal ' + (channels.length + 1),
                            tvgId: '',
                            logo: '',
                            number: 0,
                            group: 'Genel'
                        };
                        var q = guessQuality(meta.name, url);
                        channels.push({
                            id: 'm3u_' + channels.length + '_' + NL.util.normalizeText(meta.name).slice(0, 24),
                            number: meta.number || 0,
                            name: meta.name,
                            group: meta.group,
                            logo: meta.logo,
                            tvgId: meta.tvgId,
                            sourceName: sName,
                            sourceType: 'm3u',
                            streams: [
                                {
                                    title: meta.name + ' (' + sName + ')',
                                    url: url,
                                    quality: q,
                                    source: sName,
                                    headers: headersCopy
                                }
                            ]
                        });
                    }
                    currentMeta = null;
                    currentHeaders = {};
                }
            }

            if (onProgress) {
                onProgress(Math.round((idx / total) * 100), channels.length);
            }

            if (idx < total) {
                setTimeout(step, 0);
            } else {
                callback(null, channels);
            }
        }

        setTimeout(step, 0);
    }

    function loadFromUrl(url, sourceName, onProgress, callback) {
        NL.http.getText(url, {}, function (err, text) {
            if (err) return callback(err, []);
            parseAsync(text, sourceName, onProgress, callback);
        }, 30000);
    }

    NL.m3u = {
        parseAsync: parseAsync,
        loadFromUrl: loadFromUrl
    };
})(window);
