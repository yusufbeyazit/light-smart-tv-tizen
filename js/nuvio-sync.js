/* ==========================================================================
   Nuvio Live - Nuvio Cloud Sync (Exact NuvioTVSmart Profile & Addon Sync)
   - Profiles: sync_pull_profiles -> profiles / tv_profiles table fallback
   - Addons: addons table (user_id + profile_id) -> tv_addons -> sync_pull_addons RPC
   - Respects usesPrimaryAddons profile inheritance rule
   ========================================================================== */
(function (global) {
    'use strict';

    var NL = global.NuvioLive = global.NuvioLive || {};
    var cachedProfiles = [];

    function getActiveProfile() {
        return NL.storage.get(NL.CONFIG.KEYS.ACTIVE_PROFILE, { id: 1, name: 'Ana Profil', usesPrimaryAddons: false });
    }

    function getActiveProfileId() {
        var saved = getActiveProfile();
        var num = parseInt(saved && (saved.profileIndex || saved.id), 10);
        return (!isNaN(num) && num > 0) ? num : 1;
    }

    function setActiveProfile(profile) {
        if (!profile) return;
        NL.storage.set(NL.CONFIG.KEYS.ACTIVE_PROFILE, profile);
    }

    function normalizeManifestUrl(url) {
        var u = String(url || '').trim();
        if (!u) return '';
        if (u.indexOf('stremio://') === 0) {
            u = 'https://' + u.slice(10);
        }
        if (u.toLowerCase().slice(-13) !== 'manifest.json') {
            u = NL.util.trimUrl(u) + '/manifest.json';
        }
        return u;
    }

    function extractHostName(url) {
        try {
            var m = String(url).match(/^https?:\/\/([^\/]+)/i);
            return m ? m[1] : 'Nuvio Eklenti';
        } catch (e) {
            return 'Nuvio Eklenti';
        }
    }

    function readBool(val, def) {
        if (val === undefined || val === null) return def;
        if (typeof val === 'boolean') return val;
        if (typeof val === 'number') return val !== 0;
        var s = String(val).trim().toLowerCase();
        if (s === 'true' || s === '1') return true;
        if (s === 'false' || s === '0') return false;
        return def;
    }

    function normalizeAddonRecord(item, idx) {
        if (!item) return null;
        if (typeof item === 'string') {
            return {
                id: 'nuvio_addon_' + idx,
                url: normalizeManifestUrl(item),
                name: extractHostName(item),
                enabled: true,
                fromCloud: true
            };
        }
        var rawUrl = item.url || item.manifestUrl || item.manifest_url || item.transportUrl || '';
        if (!rawUrl) return null;
        return {
            id: item.id || ('nuvio_addon_' + idx),
            url: normalizeManifestUrl(rawUrl),
            name: item.name || item.display_name || item.title || extractHostName(rawUrl),
            enabled: readBool(item.enabled, true),
            sortOrder: Number(item.sort_order !== undefined ? item.sort_order : (item.position !== undefined ? item.position : idx)),
            fromCloud: true
        };
    }

    function mapProfiles(rows) {
        var list = Array.isArray(rows) ? rows : (rows && Array.isArray(rows.profiles) ? rows.profiles : []);
        var profiles = [];
        for (var i = 0; i < list.length; i++) {
            var r = list[i];
            if (!r) continue;
            var pIdx = parseInt(r.profile_index || r.profileIndex || r.id || (i + 1), 10);
            if (isNaN(pIdx) || pIdx <= 0) pIdx = i + 1;
            profiles.push({
                id: pIdx,
                profileIndex: pIdx,
                name: r.name || r.display_name || ('Profil ' + pIdx),
                avatar: r.avatar_url || r.avatarUrl || '',
                usesPrimaryAddons: readBool(r.uses_primary_addons !== undefined ? r.uses_primary_addons : r.usesPrimaryAddons, false),
                isPrimary: readBool(r.is_primary !== undefined ? r.is_primary : r.isPrimary, pIdx === 1)
            });
        }
        if (profiles.length === 0) {
            profiles.push({ id: 1, profileIndex: 1, name: 'Ana Profil', avatar: '', usesPrimaryAddons: false, isPrimary: true });
        }
        cachedProfiles = profiles;
        return profiles;
    }

    // Pull profiles: sync_pull_profiles RPC -> profiles table -> tv_profiles table
    function pullProfiles(callback) {
        NL.auth.ensureValidSession(function (authErr) {
            if (authErr) return callback(authErr, []);
            NL.auth.rpc('sync_pull_profiles', {}, true, function (err, data) {
                if (!err && data) {
                    return callback(null, mapProfiles(data));
                }
                NL.auth.getEffectiveUserId(function (uErr, ownerId) {
                    if (uErr || !ownerId) return callback(err || uErr, []);
                    NL.auth.selectTable('profiles', 'user_id=eq.' + encodeURIComponent(ownerId) + '&select=*&order=profile_index.asc', true, function (pErr, pRows) {
                        if (!pErr && Array.isArray(pRows)) {
                            return callback(null, mapProfiles(pRows));
                        }
                        NL.auth.selectTable('tv_profiles', 'owner_id=eq.' + encodeURIComponent(ownerId) + '&select=*&order=profile_index.asc', true, function (tErr, tRows) {
                            if (!tErr && Array.isArray(tRows)) {
                                return callback(null, mapProfiles(tRows));
                            }
                            callback(tErr || pErr || err, mapProfiles([]));
                        });
                    });
                });
            });
        });
    }

    function resolveEffectiveAddonProfileId(requestedId) {
        var pid = parseInt(requestedId || getActiveProfileId(), 10) || 1;
        if (pid === 1) return 1;
        for (var i = 0; i < cachedProfiles.length; i++) {
            if (cachedProfiles[i].id === pid && cachedProfiles[i].usesPrimaryAddons) {
                return 1;
            }
        }
        var active = getActiveProfile();
        if (active && active.id === pid && active.usesPrimaryAddons) return 1;
        return pid;
    }

    function finalizeAddons(rows, callback) {
        var list = [];
        if (Array.isArray(rows)) list = rows;
        else if (rows && Array.isArray(rows.addons)) list = rows.addons;
        else if (rows && typeof rows.addons_json === 'string') {
            try { list = JSON.parse(rows.addons_json); } catch (e) { list = []; }
        }

        var addons = [];
        for (var i = 0; i < list.length; i++) {
            var norm = normalizeAddonRecord(list[i], i);
            if (norm) addons.push(norm);
        }
        addons.sort(function (a, b) {
            return (a.sortOrder || 0) - (b.sortOrder || 0);
        });
        NL.storage.set(NL.CONFIG.KEYS.NUVIO_ADDONS, addons);
        callback(null, addons);
    }

    // Pull addons (exact LibrarySyncService order: addons table -> tv_addons table -> sync_pull_addons RPC)
    function pullAddons(profileId, callback) {
        var effProfileId = resolveEffectiveAddonProfileId(profileId);
        NL.auth.getEffectiveUserId(function (uErr, ownerId) {
            if (uErr || !ownerId) return callback(uErr || new Error('Oturum yok'), []);

            var q1 = 'user_id=eq.' + encodeURIComponent(ownerId) + '&profile_id=eq.' + effProfileId + '&select=*&order=sort_order.asc';
            NL.auth.selectTable('addons', q1, true, function (err1, rows1) {
                if (!err1 && Array.isArray(rows1)) {
                    return finalizeAddons(rows1, callback);
                }
                var q2 = 'owner_id=eq.' + encodeURIComponent(ownerId) + '&select=*&order=position.asc';
                NL.auth.selectTable('tv_addons', q2, true, function (err2, rows2) {
                    if (!err2 && Array.isArray(rows2)) {
                        return finalizeAddons(rows2, callback);
                    }
                    NL.auth.rpc('sync_pull_addons', { p_profile_id: effProfileId }, true, function (err3, rows3) {
                        if (!err3 && rows3) {
                            return finalizeAddons(rows3, callback);
                        }
                        callback(err3 || err2 || err1, []);
                    });
                });
            });
        });
    }

    function pushAddons(addons, profileId, callback) {
        var effProfileId = resolveEffectiveAddonProfileId(profileId);
        var payload = [];
        for (var i = 0; i < addons.length; i++) {
            if (!addons[i] || !addons[i].url) continue;
            var item = {
                url: addons[i].url,
                sort_order: i,
                enabled: addons[i].enabled !== false
            };
            if (addons[i].name) item.name = addons[i].name;
            payload.push(item);
        }
        NL.auth.ensureValidSession(function (authErr) {
            if (authErr) return callback && callback(authErr);
            NL.auth.rpc('sync_push_addons', {
                p_profile_id: effProfileId,
                p_addons: payload,
                p_origin_client_id: NL.storage.getDeviceId()
            }, true, function (err, res) {
                if (callback) callback(err, res);
            });
        });
    }

    function syncAll(callback) {
        pullProfiles(function (pErr, profiles) {
            var activeId = getActiveProfileId();
            var activeObj = null;
            if (!pErr && profiles && profiles.length) {
                for (var i = 0; i < profiles.length; i++) {
                    if (profiles[i].id === activeId) { activeObj = profiles[i]; break; }
                }
                if (!activeObj) activeObj = profiles[0];
                setActiveProfile(activeObj);
                activeId = activeObj.id;
            }
            pullAddons(activeId, function (aErr, addons) {
                callback(aErr || pErr, {
                    profiles: profiles || [],
                    activeProfileId: activeId,
                    addons: addons || []
                });
            });
        });
    }

    NL.sync = {
        normalizeManifestUrl: normalizeManifestUrl,
        getActiveProfileId: getActiveProfileId,
        setActiveProfile: setActiveProfile,
        pullProfiles: pullProfiles,
        pullAddons: pullAddons,
        pushAddons: pushAddons,
        syncAll: syncAll
    };
})(window);
