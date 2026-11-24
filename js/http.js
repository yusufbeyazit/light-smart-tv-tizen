/* ==========================================================================
   Nuvio Live - Tizen 3.0 Pure XHR HTTP Client (ES5, Abortable, Zero-Deps)
   ========================================================================== */
(function (global) {
    'use strict';

    var NL = global.NuvioLive = global.NuvioLive || {};

    /**
     * options: {
     *   url: string,
     *   method: 'GET' | 'POST' | 'PUT' | 'DELETE',
     *   headers: { ... },
     *   body: object | string,
     *   timeout: number (ms, default 15000),
     *   responseType: 'json' | 'text' (default 'json')
     * }
     * callback(err, data, status, xhr)
     * returns { abort: fn }
     */
    function request(options, callback) {
        var xhr = new XMLHttpRequest();
        var method = (options.method || 'GET').toUpperCase();
        var timeout = options.timeout || 15000;
        var responseType = options.responseType || 'json';
        var done = false;

        function finish(err, data, status) {
            if (done) return;
            done = true;
            if (callback) {
                callback(err, data, status, xhr);
            }
        }

        try {
            xhr.open(method, options.url, true);
        } catch (openErr) {
            setTimeout(function () {
                finish(new Error('URL acilamadi: ' + (openErr.message || openErr)), null, 0);
            }, 0);
            return { abort: function () {} };
        }

        xhr.timeout = timeout;

        var headers = options.headers || {};
        var hasContentType = false;
        for (var k in headers) {
            if (Object.prototype.hasOwnProperty.call(headers, k)) {
                if (k.toLowerCase() === 'content-type') hasContentType = true;
                try {
                    xhr.setRequestHeader(k, headers[k]);
                } catch (hErr) {
                    // Ignore forbidden headers on browser preview
                }
            }
        }

        var payload = null;
        if (options.body !== undefined && options.body !== null) {
            if (typeof options.body === 'string') {
                payload = options.body;
            } else {
                payload = JSON.stringify(options.body);
                if (!hasContentType) {
                    xhr.setRequestHeader('Content-Type', 'application/json');
                }
            }
        }

        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            var status = xhr.status || 0;
            var text = xhr.responseText || '';

            if (status === 0) {
                finish(new Error('Ag baglantisi kurulamadi (CORS veya cevrimdisi)'), null, 0);
                return;
            }

            if (responseType === 'text') {
                if (status >= 200 && status < 300) {
                    finish(null, text, status);
                } else {
                    finish(new Error('HTTP ' + status + ': ' + text.slice(0, 180)), text, status);
                }
                return;
            }

            var parsed = null;
            if (text) {
                try {
                    parsed = JSON.parse(text);
                } catch (parseErr) {
                    if (status >= 200 && status < 300) {
                        finish(new Error('Gecersiz JSON yaniti'), text, status);
                        return;
                    }
                }
            }

            if (status >= 200 && status < 300) {
                finish(null, parsed, status);
            } else {
                var errMsg = (parsed && (parsed.error_description || parsed.message || parsed.msg || parsed.error))
                    || ('HTTP ' + status);
                var err = new Error(errMsg);
                err.status = status;
                err.payload = parsed;
                finish(err, parsed, status);
            }
        };

        xhr.ontimeout = function () {
            finish(new Error('Istek zaman asimina ugradi (' + Math.round(timeout / 1000) + 's)'), null, 408);
        };

        xhr.onerror = function () {
            finish(new Error('Ag hatasi olustu'), null, 0);
        };

        try {
            xhr.send(payload);
        } catch (sendErr) {
            finish(new Error('Istek gonderilemedi: ' + (sendErr.message || sendErr)), null, 0);
        }

        return {
            abort: function () {
                if (!done) {
                    done = true;
                    try { xhr.abort(); } catch (e) {}
                }
            }
        };
    }

    NL.http = {
        request: request,
        getJson: function (url, headers, callback, timeout) {
            return request({
                url: url,
                method: 'GET',
                headers: headers || {},
                timeout: timeout || 15000,
                responseType: 'json'
            }, callback);
        },
        getText: function (url, headers, callback, timeout) {
            return request({
                url: url,
                method: 'GET',
                headers: headers || {},
                timeout: timeout || 25000,
                responseType: 'text'
            }, callback);
        },
        postJson: function (url, body, headers, callback, timeout) {
            return request({
                url: url,
                method: 'POST',
                body: body || {},
                headers: headers || {},
                timeout: timeout || 15000,
                responseType: 'json'
            }, callback);
        }
    };
})(window);
