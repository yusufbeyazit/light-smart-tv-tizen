/* ==========================================================================
   Nuvio Live - Unified Channel Store, Multi-Stream Merger, Favorites & Search
   ========================================================================== */
(function (global) {
    'use strict';

    var NL = global.NuvioLive = global.NuvioLive || {};

    var state = {
        allChannels: [],
        byId: {},
        categories: [],     // [{ id, name, count, type }]
        byCategory: {},     // catId -> Channel[]
        favorites: [],      // channelId[]
        recents: [],        // channelId[]
        loading: false,
        lastError: null
    };

    var listeners = [];

    function emit(eventName, payload) {
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](eventName, payload); } catch (e) {}
        }
    }

    function loadPersistedLists() {
        state.favorites = NL.storage.get(NL.CONFIG.KEYS.FAVORITES, []);
        state.recents = NL.storage.get(NL.CONFIG.KEYS.RECENTS, []);
    }

    function isFavorite(channelId) {
        return state.favorites.indexOf(channelId) !== -1;
    }

    function toggleFavorite(channelId) {
        if (!channelId) return false;
        var idx = state.favorites.indexOf(channelId);
        var added;
        if (idx !== -1) {
            state.favorites.splice(idx, 1);
            added = false;
        } else {
            state.favorites.unshift(channelId);
            added = true;
        }
        NL.storage.set(NL.CONFIG.KEYS.FAVORITES, state.favorites);
        rebuildSpecialCategories();
        emit('favorites', { channelId: channelId, added: added });
        return added;
    }

    function recordRecent(channelId) {
        if (!channelId) return;
        var idx = state.recents.indexOf(channelId);
        if (idx !== -1) state.recents.splice(idx, 1);
        state.recents.unshift(channelId);
        if (state.recents.length > 25) state.recents = state.recents.slice(0, 25);
        NL.storage.set(NL.CONFIG.KEYS.RECENTS, state.recents);
        NL.storage.set(NL.CONFIG.KEYS.LAST_CHANNEL, channelId);
        rebuildSpecialCategories();
        emit('recents', { channelId: channelId });
    }

    function getFavoriteChannels() {
        var out = [];
        for (var i = 0; i < state.favorites.length; i++) {
            var ch = state.byId[state.favorites[i]];
            if (ch) out.push(ch);
        }
        return out;
    }

    function getRecentChannels() {
        var out = [];
        for (var i = 0; i < state.recents.length; i++) {
            var ch = state.byId[state.recents[i]];
            if (ch) out.push(ch);
        }
        return out;
    }

    function rebuildSpecialCategories() {
        var favs = getFavoriteChannels();
        var recs = getRecentChannels();
        state.byCategory['__favorites__'] = favs;
        state.byCategory['__recents__'] = recs;
        state.byCategory['__all__'] = state.allChannels;

        for (var i = 0; i < state.categories.length; i++) {
            var c = state.categories[i];
            if (c.id === '__favorites__') c.count = favs.length;
            else if (c.id === '__recents__') c.count = recs.length;
            else if (c.id === '__all__') c.count = state.allChannels.length;
        }
    }

    function indexChannels(rawChannels) {
        var prefs = NL.storage.getPrefs();
        var groupDups = prefs.groupDuplicateStreams !== false;

        var merged = [];
        var mergeMap = {};
        var i, s;

        for (i = 0; i < rawChannels.length; i++) {
            var ch = rawChannels[i];
            if (!ch || !ch.name) continue;
            var key = groupDups ? (NL.util.normalizeChannelKey(ch.name) + '||' + NL.util.normalizeText(ch.group || '')) : '';
            if (groupDups && key.length > 3 && mergeMap[key] && ch.sourceType !== 'addon') {
                var existing = mergeMap[key];
                if (!existing.logo && ch.logo) existing.logo = ch.logo;
                if (!existing.tvgId && ch.tvgId) existing.tvgId = ch.tvgId;
                if (ch.streams && ch.streams.length) {
                    for (s = 0; s < ch.streams.length; s++) {
                        addUniqueStream(existing.streams, ch.streams[s]);
                    }
                }
            } else {
                var copy = Object.assign({}, ch, {
                    streams: (ch.streams || []).slice(),
                    searchKey: NL.util.normalizeText(ch.name + ' ' + (ch.group || ''))
                });
                merged.push(copy);
                if (groupDups && key.length > 3 && ch.sourceType !== 'addon') {
                    mergeMap[key] = copy;
                }
            }
        }

        // Assign sequential channel numbers
        var byId = {};
        var catOrder = [];
        var catGroups = {};
        for (i = 0; i < merged.length; i++) {
            merged[i].number = i + 1;
            byId[merged[i].id] = merged[i];
            var gName = merged[i].group || 'Genel';
            var gId = 'cat_' + NL.util.normalizeText(gName).replace(/\s+/g, '_');
            if (!catGroups[gId]) {
                catGroups[gId] = { id: gId, name: gName, list: [] };
                catOrder.push(gId);
            }
            catGroups[gId].list.push(merged[i]);
        }

        state.allChannels = merged;
        state.byId = byId;
        state.byCategory = {};

        var categories = [
            { id: '__favorites__', name: 'Favoriler', icon: '★', count: 0, special: true },
            { id: '__recents__',   name: 'Son Izlenenler', icon: '⏱', count: 0, special: true },
            { id: '__all__',       name: 'Tum Kanallar', icon: '⚡', count: merged.length, special: true }
        ];

        for (i = 0; i < catOrder.length; i++) {
            var grp = catGroups[catOrder[i]];
            state.byCategory[grp.id] = grp.list;
            categories.push({
                id: grp.id,
                name: grp.name,
                icon: '▸',
                count: grp.list.length,
                special: false
            });
        }

        state.categories = categories;
        rebuildSpecialCategories();
        emit('channels', { count: merged.length });
    }

    function addUniqueStream(targetArr, st) {
        if (!st || !st.url) return;
        for (var i = 0; i < targetArr.length; i++) {
            if (targetArr[i].url === st.url) return;
        }
        targetArr.push(st);
    }

    // Source management helpers
    function getAllAddons() {
        var cloud = NL.storage.get(NL.CONFIG.KEYS.NUVIO_ADDONS, []);
        var custom = NL.storage.get(NL.CONFIG.KEYS.CUSTOM_ADDONS, []);
        var merged = [];
        var seen = {};
        var i;
        for (i = 0; i < cloud.length; i++) {
            if (cloud[i] && cloud[i].url && !seen[cloud[i].url]) {
                seen[cloud[i].url] = true;
                merged.push(cloud[i]);
            }
        }
        for (i = 0; i < custom.length; i++) {
            if (custom[i] && custom[i].url && !seen[custom[i].url]) {
                seen[custom[i].url] = true;
                merged.push(custom[i]);
            }
        }
        return merged;
    }

    function addCustomAddon(url, name) {
        var norm = NL.sync.normalizeManifestUrl(url);
        if (!norm) return null;
        var list = NL.storage.get(NL.CONFIG.KEYS.CUSTOM_ADDONS, []);
        for (var i = 0; i < list.length; i++) {
            if (list[i].url === norm) return list[i];
        }
        var rec = {
            id: NL.util.uid('addon'),
            url: norm,
            name: name || norm.replace(/^https?:\/\//i, '').split('/')[0],
            enabled: true,
            fromCloud: false
        };
        list.push(rec);
        NL.storage.set(NL.CONFIG.KEYS.CUSTOM_ADDONS, list);
        return rec;
    }

    function removeCustomAddon(id) {
        var list = NL.storage.get(NL.CONFIG.KEYS.CUSTOM_ADDONS, []);
        list = list.filter(function (a) { return a.id !== id; });
        NL.storage.set(NL.CONFIG.KEYS.CUSTOM_ADDONS, list);
    }

    function getM3uSources() {
        return NL.storage.get(NL.CONFIG.KEYS.M3U_SOURCES, []);
    }

    function addM3uSource(name, url, epgUrl) {
        var list = getM3uSources();
        var rec = {
            id: NL.util.uid('m3u'),
            name: (name || 'IPTV Liste').trim(),
            url: String(url || '').trim(),
            epgUrl: String(epgUrl || '').trim(),
            enabled: true
        };
        list.push(rec);
        NL.storage.set(NL.CONFIG.KEYS.M3U_SOURCES, list);
        return rec;
    }

    function removeM3uSource(id) {
        var list = getM3uSources().filter(function (s) { return s.id !== id; });
        NL.storage.set(NL.CONFIG.KEYS.M3U_SOURCES, list);
    }

    function getXtreamSources() {
        return NL.storage.get(NL.CONFIG.KEYS.XTREAM_SOURCES, []);
    }

    function addXtreamSource(name, server, username, password) {
        var list = getXtreamSources();
        var rec = {
            id: NL.util.uid('xt'),
            name: (name || 'Xtream TV').trim(),
            server: NL.util.trimUrl(server),
            username: String(username || '').trim(),
            password: String(password || '').trim(),
            enabled: true
        };
        list.push(rec);
        NL.storage.set(NL.CONFIG.KEYS.XTREAM_SOURCES, list);
        return rec;
    }

    function removeXtreamSource(id) {
        var list = getXtreamSources().filter(function (s) { return s.id !== id; });
        NL.storage.set(NL.CONFIG.KEYS.XTREAM_SOURCES, list);
    }

    // Load all configured sources (Nuvio Addons + M3U + Xtream + XMLTV EPG)
    function refreshAllSources(onStatus, callback) {
        state.loading = true;
        state.lastError = null;
        emit('loading', { loading: true });

        var addons = getAllAddons().filter(function (a) { return a.enabled !== false; });
        var m3us = getM3uSources().filter(function (s) { return s.enabled !== false && s.url; });
        var xtreams = getXtreamSources().filter(function (s) { return s.enabled !== false && s.server; });

        var totalJobs = addons.length + m3us.length + xtreams.length;
        var collected = [];
        var epgUrls = [];

        if (totalJobs === 0) {
            var prefs = NL.storage.getPrefs();
            if (prefs.showDemoWhenEmpty) {
                collected = NL.CONFIG.DEMO_CHANNELS.slice();
            }
            indexChannels(collected);
            state.loading = false;
            emit('loading', { loading: false });
            if (callback) callback(null, state.allChannels.length);
            return;
        }

        var done = 0;
        function finishJob() {
            done++;
            if (onStatus) onStatus('Kaynaklar yukleniyor (' + done + '/' + totalJobs + ')...');
            if (done >= totalJobs) {
                if (collected.length === 0 && NL.storage.getPrefs().showDemoWhenEmpty) {
                    collected = NL.CONFIG.DEMO_CHANNELS.slice();
                }
                indexChannels(collected);
                state.loading = false;
                emit('loading', { loading: false });
                if (callback) callback(null, state.allChannels.length);
                // Load XMLTV EPG silently in background so Live TV starts immediately
                loadBackgroundEpgs(epgUrls);
            }
        }

        var i;
        for (i = 0; i < addons.length; i++) {
            (function (addon) {
                NL.addonClient.loadChannelsFromAddon(addon, function (err, res) {
                    if (!err && res && res.channels) {
                        for (var k = 0; k < res.channels.length; k++) collected.push(res.channels[k]);
                    }
                    finishJob();
                });
            })(addons[i]);
        }

        for (i = 0; i < m3us.length; i++) {
            (function (src) {
                if (src.epgUrl) epgUrls.push(src.epgUrl);
                NL.m3u.loadFromUrl(src.url, src.name, null, function (err, chs) {
                    if (!err && chs) {
                        for (var k = 0; k < chs.length; k++) collected.push(chs[k]);
                    }
                    finishJob();
                });
            })(m3us[i]);
        }

        for (i = 0; i < xtreams.length; i++) {
            (function (src) {
                NL.xtream.loadLiveChannels(src, function (err, chs) {
                    if (!err && chs) {
                        for (var k = 0; k < chs.length; k++) collected.push(chs[k]);
                    }
                    finishJob();
                });
            })(xtreams[i]);
        }
    }

    function loadBackgroundEpgs(urls) {
        if (!urls || urls.length === 0) return;
        NL.epg.clear();
        for (var i = 0; i < urls.length; i++) {
            NL.epg.loadFromUrl(urls[i], function () {
                emit('epg', { count: NL.epg.getCount() });
            });
        }
    }

    function searchChannels(query, limit) {
        var q = NL.util.normalizeText(query);
        var max = limit || 120;
        if (!q) return state.allChannels.slice(0, max);
        var tokens = q.split(' ');
        var out = [];
        for (var i = 0; i < state.allChannels.length; i++) {
            var ch = state.allChannels[i];
            var hay = ch.searchKey || '';
            var match = true;
            for (var t = 0; t < tokens.length; t++) {
                if (tokens[t] && hay.indexOf(tokens[t]) === -1) {
                    match = false;
                    break;
                }
            }
            if (match) {
                out.push(ch);
                if (out.length >= max) break;
            }
        }
        return out;
    }

    function getChannelByNumber(num) {
        var n = parseInt(num, 10);
        if (isNaN(n) || n < 1 || n > state.allChannels.length) return null;
        return state.allChannels[n - 1] || null;
    }

    function getNeighborChannel(currentChannel, catId, delta) {
        var list = (catId && state.byCategory[catId] && state.byCategory[catId].length)
            ? state.byCategory[catId]
            : state.allChannels;
        if (!list || list.length === 0) return null;
        if (!currentChannel) return list[0];
        var idx = -1;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === currentChannel.id) { idx = i; break; }
        }
        if (idx === -1) return list[0];
        var nextIdx = (idx + delta + list.length) % list.length;
        return list[nextIdx];
    }

    loadPersistedLists();

    NL.store = {
        getCategories: function () { return state.categories; },
        getChannelsInCategory: function (catId) { return state.byCategory[catId] || state.allChannels; },
        getAllChannels: function () { return state.allChannels; },
        getChannelById: function (id) { return state.byId[id] || null; },
        getChannelByNumber: getChannelByNumber,
        getNeighborChannel: getNeighborChannel,
        getLastChannel: function () {
            var id = NL.storage.get(NL.CONFIG.KEYS.LAST_CHANNEL, null);
            return (id && state.byId[id]) ? state.byId[id] : (state.allChannels[0] || null);
        },
        isFavorite: isFavorite,
        toggleFavorite: toggleFavorite,
        recordRecent: recordRecent,
        getFavoriteChannels: getFavoriteChannels,
        getRecentChannels: getRecentChannels,
        searchChannels: searchChannels,
        getAllAddons: getAllAddons,
        addCustomAddon: addCustomAddon,
        removeCustomAddon: removeCustomAddon,
        getM3uSources: getM3uSources,
        addM3uSource: addM3uSource,
        removeM3uSource: removeM3uSource,
        getXtreamSources: getXtreamSources,
        addXtreamSource: addXtreamSource,
        removeXtreamSource: removeXtreamSource,
        refreshAllSources: refreshAllSources,
        onChange: function (fn) {
            if (typeof fn === 'function') listeners.push(fn);
        }
    };
})(window);
