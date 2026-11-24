/* ==========================================================================
   Nuvio Live - Nuvio / Stremio Live TV Addon Client (ES5)
   Fetches manifest.json, discovers Live TV catalogs, resolves multi-streams
   ========================================================================== */
(function (global) {
    'use strict';

    var NL = global.NuvioLive = global.NuvioLive || {};
    var manifestCache = {};

    function getBaseUrl(manifestUrl) {
        return String(manifestUrl || '').replace(/\/manifest\.json(\?.*)?$/i, '');
    }

    function isLiveCatalog(cat) {
        if (!cat) return false;
        var t = String(cat.type || '').toLowerCase();
        var id = String(cat.id || '').toLowerCase();
        var name = String(cat.name || '').toLowerCase();
        return t === 'tv' || t === 'channel' || t === 'live' || t === 'iptv' ||
            id.indexOf('tv') !== -1 || id.indexOf('live') !== -1 || id.indexOf('iptv') !== -1 ||
            name.indexOf('live') !== -1 || name.indexOf('tv') !== -1 || name.indexOf('canli') !== -1;
    }

    function supportsStream(manifest, type, id) {
        if (!manifest || !manifest.resources) return false;
        var res = manifest.resources;
        for (var i = 0; i < res.length; i++) {
            var r = res[i];
            if (typeof r === 'string') {
                if (r === 'stream') {
                    return !manifest.types || manifest.types.indexOf(type) !== -1;
                }
            } else if (r && r.name === 'stream') {
                var typesOk = !r.types || r.types.indexOf(type) !== -1;
                var prefixOk = true;
                if (r.idPrefixes && r.idPrefixes.length) {
                    prefixOk = false;
                    for (var p = 0; p < r.idPrefixes.length; p++) {
                        if (String(id).indexOf(r.idPrefixes[p]) === 0) {
                            prefixOk = true;
                            break;
                        }
                    }
                }
                if (typesOk && prefixOk) return true;
            }
        }
        return false;
    }

    function fetchManifest(manifestUrl, callback) {
        var normUrl = NL.sync.normalizeManifestUrl(manifestUrl);
        if (!normUrl) return callback(new Error('Gecersiz eklenti URL'), null);
        if (manifestCache[normUrl]) {
            return callback(null, manifestCache[normUrl]);
        }
        NL.http.getJson(normUrl, {}, function (err, data) {
            if (err || !data) return callback(err || new Error('Manifest alinamadi'), null);
            var entry = {
                url: normUrl,
                baseUrl: getBaseUrl(normUrl),
                manifest: data
            };
            manifestCache[normUrl] = entry;
            callback(null, entry);
        }, 12000);
    }

    function loadChannelsFromAddon(addonRecord, callback) {
        fetchManifest(addonRecord.url, function (err, entry) {
            if (err || !entry) return callback(err, []);
            var m = entry.manifest;
            var catalogs = m.catalogs || [];
            var liveCats = [];
            var i;
            for (i = 0; i < catalogs.length; i++) {
                if (isLiveCatalog(catalogs[i])) liveCats.push(catalogs[i]);
            }
            if (liveCats.length === 0) {
                return callback(null, { manifest: m, channels: [] });
            }

            var allChannels = [];
            var remaining = liveCats.length;
            var addonName = m.name || addonRecord.name || 'Nuvio Eklenti';

            function doneOne() {
                remaining--;
                if (remaining <= 0) {
                    callback(null, { manifest: m, channels: allChannels });
                }
            }

            for (i = 0; i < liveCats.length; i++) {
                (function (cat) {
                    var catType = encodeURIComponent(cat.type || 'tv');
                    var catId = encodeURIComponent(cat.id);
                    var catUrl = entry.baseUrl + '/catalog/' + catType + '/' + catId + '.json';
                    NL.http.getJson(catUrl, {}, function (cErr, cData) {
                        if (!cErr && cData && Array.isArray(cData.metas)) {
                            for (var j = 0; j < cData.metas.length; j++) {
                                var meta = cData.metas[j];
                                if (!meta || !meta.id) continue;
                                var groupName = (meta.genres && meta.genres[0])
                                    || cat.name
                                    || addonName;
                                var ch = {
                                    id: 'addon_' + (m.id || 'x') + '_' + meta.id,
                                    addonMetaId: meta.id,
                                    addonType: meta.type || cat.type || 'tv',
                                    addonManifestUrl: entry.url,
                                    name: meta.name || meta.id,
                                    group: groupName,
                                    logo: meta.logo || meta.poster || '',
                                    description: meta.description || '',
                                    tvgId: meta.tvgId || meta.id,
                                    sourceName: addonName,
                                    sourceType: 'addon',
                                    streams: []
                                };
                                // Some live addons embed direct stream url inside meta.streams or meta.url
                                if (meta.url) {
                                    ch.streams.push({
                                        title: meta.name + ' (Dogrudan)',
                                        url: meta.url,
                                        quality: guessQuality(meta.name),
                                        source: addonName
                                    });
                                }
                                if (Array.isArray(meta.streams)) {
                                    for (var s = 0; s < meta.streams.length; s++) {
                                        var parsed = normalizeStreamObj(meta.streams[s], addonName);
                                        if (parsed) ch.streams.push(parsed);
                                    }
                                }
                                allChannels.push(ch);
                            }
                        }
                        doneOne();
                    }, 15000);
                })(liveCats[i]);
            }
        });
    }

    function guessQuality(text) {
        var s = String(text || '').toUpperCase();
        if (s.indexOf('4K') !== -1 || s.indexOf('2160') !== -1 || s.indexOf('UHD') !== -1) return '4K';
        if (s.indexOf('1080') !== -1 || s.indexOf('FHD') !== -1) return 'FHD';
        if (s.indexOf('720') !== -1 || s.indexOf('HD') !== -1) return 'HD';
        if (s.indexOf('SD') !== -1 || s.indexOf('480') !== -1) return 'SD';
        return 'CANLI';
    }

    function normalizeStreamObj(st, addonName) {
        if (!st) return null;
        var streamUrl = st.url || st.externalUrl || '';
        if (!streamUrl || (streamUrl.indexOf('http://') !== 0 && streamUrl.indexOf('https://') !== 0)) {
            return null;
        }
        var title = st.title || st.name || st.description || addonName || 'Canli Yayin';
        title = String(title).replace(/\n+/g, ' · ').trim();
        var headers = {};
        if (st.behaviorHints && st.behaviorHints.proxyHeaders && st.behaviorHints.proxyHeaders.request) {
            headers = Object.assign({}, st.behaviorHints.proxyHeaders.request);
        }
        return {
            title: title,
            url: streamUrl,
            quality: guessQuality(title + ' ' + (st.name || '')),
            source: addonName || 'Nuvio Eklenti',
            headers: headers
        };
    }

    // Resolve streams for an addon-backed channel across its owning addon + any compatible enabled addons
    function resolveChannelStreams(channel, enabledAddons, callback) {
        var targets = [];
        var seen = {};

        function addTarget(url) {
            var norm = NL.sync.normalizeManifestUrl(url);
            if (!norm || seen[norm]) return;
            seen[norm] = true;
            targets.push(norm);
        }

        if (channel.addonManifestUrl) {
            addTarget(channel.addonManifestUrl);
        }
        if (enabledAddons && enabledAddons.length) {
            for (var i = 0; i < enabledAddons.length; i++) {
                if (enabledAddons[i].enabled !== false) {
                    addTarget(enabledAddons[i].url);
                }
            }
        }

        if (targets.length === 0 || !channel.addonMetaId) {
            return callback(null, channel.streams || []);
        }

        var collected = [];
        var remaining = targets.length;
        var type = channel.addonType || 'tv';
        var metaId = channel.addonMetaId;

        function finishOne() {
            remaining--;
            if (remaining <= 0) {
                callback(null, collected);
            }
        }

        for (var t = 0; t < targets.length; t++) {
            (function (manifestUrl) {
                fetchManifest(manifestUrl, function (err, entry) {
                    if (err || !entry || !supportsStream(entry.manifest, type, metaId)) {
                        return finishOne();
                    }
                    var url = entry.baseUrl + '/stream/' + encodeURIComponent(type) + '/' + encodeURIComponent(metaId) + '.json';
                    NL.http.getJson(url, {}, function (sErr, sData) {
                        if (!sErr && sData && Array.isArray(sData.streams)) {
                            var aName = entry.manifest.name || 'Nuvio Eklenti';
                            for (var k = 0; k < sData.streams.length; k++) {
                                var parsed = normalizeStreamObj(sData.streams[k], aName);
                                if (parsed) collected.push(parsed);
                            }
                        }
                        finishOne();
                    }, 12000);
                });
            })(targets[t]);
        }
    }

    NL.addonClient = {
        fetchManifest: fetchManifest,
        loadChannelsFromAddon: loadChannelsFromAddon,
        resolveChannelStreams: resolveChannelStreams,
        clearCache: function () { manifestCache = {}; }
    };
})(window);
