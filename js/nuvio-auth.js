/* ==========================================================================
   Nuvio Live - Nuvio Backend Authentication (Strict ES5, NuvioTVSmart Parity)
   - Primary + Fallback backend routing (api.nuvio.tv -> api-two.nuvioapp.space)
   - Anonymous caller JWT bootstrap for QR TV Login
   - start_device_login_session (+ start_tv_login_session fallback)
   - poll_tv_login_session & /functions/v1/tv-logins-exchange
   - Email/Password sign-in, JWT decoding, automatic refresh, get_sync_owner
   ========================================================================== */
(function (global) {
    'use strict';

    var NL = global.NuvioLive = global.NuvioLive || {};
    var listeners = [];
    var pollTimer = null;
    var activeQrSession = null;
    var qrCallerToken = null;
    var cachedEffectiveUserId = null;

    var RETRYABLE_STATUSES = [0, 408, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 530];

    function notifyAuth(session) {
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](session); } catch (e) {}
        }
    }

    function decodeJwtPayload(token) {
        try {
            var parts = String(token || '').split('.');
            if (parts.length !== 3 || !parts[1]) return null;
            var norm = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            while (norm.length % 4 !== 0) norm += '=';
            return JSON.parse(global.atob(norm));
        } catch (e) {
            return null;
        }
    }

    function isJwtExpired(token, leewaySec) {
        var payload = decodeJwtPayload(token);
        if (!payload) return true;
        var exp = Number(payload.exp || 0);
        if (!exp || isNaN(exp)) return false;
        var nowSec = Math.floor(NL.util.now() / 1000);
        return exp <= (nowSec + (leewaySec !== undefined ? leewaySec : 30));
    }

    function getHeaders(bearerToken) {
        var cfg = NL.storage.getBackendConfig();
        var key = cfg.supabaseAnonKey || '';
        var h = {
            'Content-Type': 'application/json'
        };
        if (key) h.apikey = key;
        if (bearerToken) {
            h.Authorization = 'Bearer ' + bearerToken;
        } else if (key) {
            h.Authorization = 'Bearer ' + key;
        }
        return h;
    }

    function isRetryableStatus(status) {
        return RETRYABLE_STATUSES.indexOf(Number(status || 0)) !== -1;
    }

    // Request helper with automatic primary -> fallback backend failover (exact supabaseAuthFetch parity)
    function backendRequest(endpoint, options, callback) {
        var cfg = NL.storage.getBackendConfig();
        var primary = NL.util.trimUrl(cfg.supabaseUrl);
        var fallback = NL.util.trimUrl(cfg.supabaseFallbackUrl || '');
        if (!primary) {
            return callback(new Error('Nuvio backend URL ayarlanmamis'), null, 0);
        }
        var ep = endpoint.charAt(0) === '/' ? endpoint : ('/' + endpoint);
        var canFallback = !!(fallback && fallback.toLowerCase() !== primary.toLowerCase());

        var reqOpts = Object.assign({}, options, { url: primary + ep });
        NL.http.request(reqOpts, function (err, data, status) {
            if (!err || !canFallback || !isRetryableStatus(status)) {
                return callback(err, data, status);
            }
            var fbOpts = Object.assign({}, options, { url: fallback + ep });
            NL.http.request(fbOpts, callback);
        });
    }

    function getSession() {
        return NL.storage.get(NL.CONFIG.KEYS.AUTH_SESSION, null);
    }

    function saveSession(raw) {
        if (!raw) return null;
        var accessToken = raw.access_token || raw.accessToken || (raw.session && raw.session.access_token) || '';
        var refreshToken = raw.refresh_token || raw.refreshToken || (raw.session && raw.session.refresh_token) || '';
        if (!accessToken) return null;

        var jwt = decodeJwtPayload(accessToken) || {};
        var expiresAtMs = 0;
        if (jwt.exp) {
            expiresAtMs = jwt.exp * 1000;
        } else if (raw.expires_at) {
            expiresAtMs = raw.expires_at > 1e12 ? raw.expires_at : raw.expires_at * 1000;
        } else {
            expiresAtMs = NL.util.now() + (raw.expires_in || 3600) * 1000;
        }

        var userObj = raw.user || {
            id: jwt.sub || '',
            email: jwt.email || ''
        };

        var session = {
            access_token: accessToken,
            refresh_token: refreshToken,
            token_type: raw.token_type || 'bearer',
            expires_at: expiresAtMs,
            user: userObj
        };
        cachedEffectiveUserId = null;
        NL.storage.set(NL.CONFIG.KEYS.AUTH_SESSION, session);
        notifyAuth(session);
        return session;
    }

    function clearSession() {
        stopQrPolling();
        qrCallerToken = null;
        cachedEffectiveUserId = null;
        NL.storage.remove(NL.CONFIG.KEYS.AUTH_SESSION);
        notifyAuth(null);
    }

    function isAuthenticated() {
        var s = getSession();
        return !!(s && s.access_token);
    }

    // Auto-discover Nuvio self-host or official capabilities via /.well-known/nuvio
    function discoverBackend(baseUrl, callback) {
        var cleanUrl = NL.util.trimUrl(baseUrl);
        if (!cleanUrl) {
            return callback(new Error('Gecerli bir Nuvio sunucu adresi girin'));
        }
        NL.http.getJson(cleanUrl + '/.well-known/nuvio', {}, function (err, data) {
            if (err || !data) {
                return callback(err || new Error('Sunucu kesfedilemedi'), null);
            }
            var patch = {
                supabaseUrl: NL.util.trimUrl(data.supabase_url || data.backend_url || cleanUrl),
                supabaseFallbackUrl: NL.util.trimUrl(data.fallback_backend_url || ''),
                supabaseAnonKey: data.supabase_anon_key || data.publishable_key || data.anon_key || NL.storage.getBackendConfig().supabaseAnonKey,
                tvLoginWebBaseUrl: NL.util.trimUrl(data.tv_login_url || data.tv_login_web_base_url || (cleanUrl + '/tv-login')),
                deviceLoginWebBaseUrl: NL.util.trimUrl(data.device_login_url || data.device_login_web_base_url || (cleanUrl + '/link')),
                selfHosted: data.self_hosted !== undefined ? !!data.self_hosted : true
            };
            var updated = NL.storage.setBackendConfig(patch);
            callback(null, { config: updated, capabilities: data });
        }, 10000);
    }

    // Standard Supabase RPC & REST Select callers with automatic fallback backend
    function rpc(fnName, params, useUserToken, callback) {
        var token = null;
        if (useUserToken) {
            var sess = getSession();
            if (!sess || !sess.access_token) {
                return callback(new Error('Oturum acik degil'), null, 401);
            }
            token = sess.access_token;
        }
        return backendRequest('/rest/v1/rpc/' + fnName, {
            method: 'POST',
            headers: getHeaders(token),
            body: params || {},
            timeout: 15000
        }, callback);
    }

    function selectTable(table, query, useUserToken, callback) {
        var token = null;
        if (useUserToken) {
            var sess = getSession();
            if (!sess || !sess.access_token) {
                return callback(new Error('Oturum acik degil'), null, 401);
            }
            token = sess.access_token;
        }
        var ep = '/rest/v1/' + table + (query ? ('?' + query) : '');
        return backendRequest(ep, {
            method: 'GET',
            headers: getHeaders(token),
            timeout: 15000
        }, callback);
    }

    // Refresh expired Supabase user session automatically
    function ensureValidSession(callback) {
        var s = getSession();
        if (!s || !s.access_token) {
            return callback(new Error('Oturum yok'), null);
        }
        if (!isJwtExpired(s.access_token, 60)) {
            return callback(null, s);
        }
        if (!s.refresh_token) {
            return callback(null, s);
        }
        backendRequest('/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: getHeaders(null),
            body: { refresh_token: s.refresh_token },
            timeout: 12000
        }, function (err, data) {
            if (err || !data || !(data.access_token || data.accessToken)) {
                return callback(err || new Error('Oturum yenilenemedi'), null);
            }
            var next = saveSession(data);
            callback(null, next);
        });
    }

    // Resolve sync owner ID via get_sync_owner RPC (exact AuthManager.getEffectiveUserId parity)
    function getEffectiveUserId(callback) {
        if (cachedEffectiveUserId) {
            return callback(null, cachedEffectiveUserId);
        }
        ensureValidSession(function (authErr, sess) {
            if (authErr || !sess) return callback(authErr || new Error('Oturum yok'), null);
            rpc('get_sync_owner', {}, true, function (err, data) {
                if (!err && data) {
                    var id = typeof data === 'string' ? data : (data.id || data.user_id || String(data));
                    cachedEffectiveUserId = String(id).replace(/^"|"$/g, '').trim();
                    if (cachedEffectiveUserId) {
                        return callback(null, cachedEffectiveUserId);
                    }
                }
                // Fallback to JWT sub if get_sync_owner is absent on older self-host
                var jwt = decodeJwtPayload(sess.access_token);
                if (jwt && jwt.sub) {
                    cachedEffectiveUserId = jwt.sub;
                    return callback(null, cachedEffectiveUserId);
                }
                callback(err || new Error('Kullanici kimligi alinamadi'), null);
            });
        });
    }

    // Direct Email & Password Sign-In (Supabase Auth)
    function signInWithPassword(email, password, callback) {
        backendRequest('/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: getHeaders(null),
            body: {
                email: String(email || '').trim(),
                password: String(password || '')
            },
            timeout: 15000
        }, function (err, data) {
            if (err || !data || !data.access_token) {
                return callback(err || new Error('Giris basarisiz'), null);
            }
            var session = saveSession(data);
            callback(null, session);
        });
    }

    // Step 0 for QR Login: Ensure anonymous Supabase caller JWT (exact QrLoginService parity!)
    function ensureQrCallerSession(forceNew, callback) {
        if (!forceNew && qrCallerToken && !isJwtExpired(qrCallerToken, 30)) {
            return callback(null, qrCallerToken);
        }
        qrCallerToken = null;
        // 1) Try /auth/v1/signup anonymous client
        backendRequest('/auth/v1/signup', {
            method: 'POST',
            headers: getHeaders(null),
            body: { data: { tv_client: 'tizen' } },
            timeout: 12000
        }, function (err, data) {
            var tok = data && (data.access_token || (data.session && data.session.access_token));
            if (!err && tok) {
                qrCallerToken = tok;
                return callback(null, qrCallerToken);
            }
            // 2) Fallback /auth/v1/token?grant_type=anonymous
            backendRequest('/auth/v1/token?grant_type=anonymous', {
                method: 'POST',
                headers: getHeaders(null),
                body: {},
                timeout: 12000
            }, function (err2, data2) {
                var tok2 = data2 && (data2.access_token || (data2.session && data2.session.access_token));
                if (!err2 && tok2) {
                    qrCallerToken = tok2;
                    return callback(null, qrCallerToken);
                }
                // 3) Fallback to publishable key if anonymous signup is disabled on custom self-host
                var cfg = NL.storage.getBackendConfig();
                if (cfg.supabaseAnonKey) {
                    return callback(null, cfg.supabaseAnonKey);
                }
                callback(err2 || err || new Error('Anonim oturum baslatilamadi'), null);
            });
        });
    }

    function unwrapRpc(data) {
        if (Array.isArray(data)) return data.length > 0 ? data[0] : null;
        return data;
    }

    function generateDeviceNonce() {
        var hex = NL.util.randomHex(32);
        return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-4' + hex.slice(13, 16) +
            '-a' + hex.slice(17, 20) + '-' + hex.slice(20, 32);
    }

    // Step 1: Start QR Device Login Session (exact NuvioTVSmart start_device_login_session + legacy fallback)
    function startQrLogin(callback) {
        stopQrPolling();
        var cfg = NL.storage.getBackendConfig();
        var deviceNonce = generateDeviceNonce();
        var deviceName = 'Samsung Smart TV (Tizen 3.0)';
        var redirectBaseUrl = cfg.deviceLoginWebBaseUrl || cfg.tvLoginWebBaseUrl || 'https://nuvio.tv/link';
        var legacyRedirectBaseUrl = cfg.tvLoginWebBaseUrl || redirectBaseUrl;

        ensureQrCallerSession(false, function (anonErr, callerTok) {
            if (anonErr || !callerTok) {
                return callback(anonErr || new Error('QR istemci oturumu acilamadi'), null);
            }

            backendRequest('/rest/v1/rpc/start_device_login_session', {
                method: 'POST',
                headers: getHeaders(callerTok),
                body: {
                    p_device_nonce: deviceNonce,
                    p_redirect_base_url: redirectBaseUrl,
                    p_device_type: 'tv',
                    p_device_name: deviceName
                },
                timeout: 15000
            }, function (err, raw) {
                if (!err && raw) {
                    return finalizeQrStart(raw, deviceNonce, redirectBaseUrl, callback);
                }
                // Legacy fallback: start_tv_login_session
                backendRequest('/rest/v1/rpc/start_tv_login_session', {
                    method: 'POST',
                    headers: getHeaders(callerTok),
                    body: {
                        p_device_nonce: deviceNonce,
                        p_redirect_base_url: legacyRedirectBaseUrl,
                        p_device_name: deviceName
                    },
                    timeout: 15000
                }, function (err2, raw2) {
                    if (err2 || !raw2) {
                        return callback(err2 || err || new Error('QR oturumu baslatilamadi'), null);
                    }
                    finalizeQrStart(raw2, deviceNonce, legacyRedirectBaseUrl, callback);
                });
            });
        });
    }

    function finalizeQrStart(raw, deviceNonce, baseRedirectUrl, callback) {
        var row = unwrapRpc(raw);
        if (!row) {
            return callback(new Error('QR oturumu bos yanit dondu'), null);
        }
        var deviceCode = String(row.device_code || row.deviceCode || row.code || '').trim();
        var displayCode = String(row.user_code || row.userCode || row.code || deviceCode).trim();
        var qrUrl = String(
            row.verification_uri_complete ||
            row.verificationUriComplete ||
            row.qr_content ||
            row.login_url ||
            row.web_url ||
            (baseRedirectUrl + '?code=' + encodeURIComponent(displayCode))
        ).trim();

        var expiresAt = NL.util.now() + NL.CONFIG.QR_SESSION_TTL_SEC * 1000;
        var rawExp = row.expires_at_millis || row.expiresAtMillis || row.expires_at || row.expiresAt;
        if (typeof rawExp === 'number') {
            expiresAt = rawExp > 1e10 ? rawExp : rawExp * 1000;
        } else if (rawExp) {
            var parsedExp = Date.parse(rawExp);
            if (!isNaN(parsedExp)) expiresAt = parsedExp;
        }

        var pollSec = Number(row.poll_interval_seconds || row.pollIntervalSeconds || 3);
        if (!pollSec || isNaN(pollSec) || pollSec < 2) pollSec = 3;

        activeQrSession = {
            deviceCode: deviceCode,
            code: displayCode,
            nonce: deviceNonce,
            qrUrl: qrUrl,
            expiresAt: expiresAt,
            pollIntervalMs: pollSec * 1000,
            status: 'pending'
        };
        callback(null, activeQrSession);
    }

    // Step 2: Poll QR TV Login Session (exact poll_tv_login_session RPC)
    function startQrPolling(sessionInfo, onStatus, onSuccess, onError) {
        stopQrPolling();
        if (!sessionInfo || !sessionInfo.deviceCode) return;
        activeQrSession = sessionInfo;

        function tick() {
            if (!activeQrSession) return;
            if (NL.util.now() >= sessionInfo.expiresAt) {
                stopQrPolling();
                if (onStatus) onStatus('expired');
                return;
            }

            ensureQrCallerSession(false, function (cErr, callerTok) {
                if (!activeQrSession) return;
                if (cErr || !callerTok) { scheduleNext(); return; }

                backendRequest('/rest/v1/rpc/poll_tv_login_session', {
                    method: 'POST',
                    headers: getHeaders(callerTok),
                    body: {
                        p_code: sessionInfo.deviceCode,
                        p_device_nonce: sessionInfo.nonce
                    },
                    timeout: 12000
                }, function (err, raw, status) {
                    if (!activeQrSession) return;
                    if (status === 401) {
                        ensureQrCallerSession(true, function () { scheduleNext(); });
                        return;
                    }
                    if (err) {
                        scheduleNext();
                        return;
                    }
                    var row = unwrapRpc(raw) || {};
                    var st = String(row.status || 'pending').toLowerCase();
                    if (row.poll_interval_seconds && Number(row.poll_interval_seconds) >= 2) {
                        sessionInfo.pollIntervalMs = Number(row.poll_interval_seconds) * 1000;
                    }
                    if (onStatus) onStatus(st, row);

                    if (st === 'approved' || st === 'confirmed' || st === 'completed') {
                        stopQrPolling();
                        exchangeQrSession(sessionInfo, onSuccess, onError);
                        return;
                    }
                    if (st === 'expired' || st === 'cancelled' || st === 'rejected') {
                        stopQrPolling();
                        return;
                    }
                    scheduleNext();
                });
            });
        }

        function scheduleNext() {
            if (!activeQrSession) return;
            pollTimer = setTimeout(tick, sessionInfo.pollIntervalMs || NL.CONFIG.QR_POLL_INTERVAL_MS);
        }

        pollTimer = setTimeout(tick, sessionInfo.pollIntervalMs || NL.CONFIG.QR_POLL_INTERVAL_MS);
    }

    // Step 3: Exchange approved session via /functions/v1/tv-logins-exchange
    function exchangeQrSession(sessionInfo, onSuccess, onError) {
        ensureQrCallerSession(false, function (cErr, callerTok) {
            backendRequest('/functions/v1/tv-logins-exchange', {
                method: 'POST',
                headers: getHeaders(callerTok),
                body: {
                    code: sessionInfo.deviceCode,
                    device_nonce: sessionInfo.nonce
                },
                timeout: 15000
            }, function (err, data) {
                var saved = !err ? saveSession(data) : null;
                if (saved) {
                    qrCallerToken = null;
                    if (onSuccess) onSuccess(saved);
                    return;
                }
                if (onError) {
                    onError(err || new Error('QR oturum token takasi basarisiz'));
                }
            });
        });
    }

    function stopQrPolling() {
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
        activeQrSession = null;
    }

    NL.auth = {
        getSession: getSession,
        isAuthenticated: isAuthenticated,
        ensureValidSession: ensureValidSession,
        getEffectiveUserId: getEffectiveUserId,
        discoverBackend: discoverBackend,
        signInWithPassword: signInWithPassword,
        startQrLogin: startQrLogin,
        startQrPolling: startQrPolling,
        stopQrPolling: stopQrPolling,
        signOut: clearSession,
        rpc: rpc,
        selectTable: selectTable,
        onChange: function (fn) {
            if (typeof fn === 'function') listeners.push(fn);
        }
    };
})(window);
