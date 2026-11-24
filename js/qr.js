/* ==========================================================================
   Nuvio / Light Smart TV - QR Code Wrapper (Kazuhiko Arase qrcode-generator)
   100% ISO/IEC 18004 compliant, pure ES5, crisp 4-module quiet zone
   ========================================================================== */
(function (global) {
    'use strict';

    var NL = global.NuvioLive = global.NuvioLive || {};

    function generateMatrix(text) {
        if (typeof global.qrcode !== 'function') {
            throw new Error('qrcode-generator yuklenemedi');
        }
        var qr = global.qrcode(0, 'M');
        qr.addData(String(text || ''), 'Byte');
        qr.make();
        var count = qr.getModuleCount();
        var mat = new Array(count);
        for (var r = 0; r < count; r++) {
            mat[r] = new Array(count);
            for (var c = 0; c < count; c++) {
                mat[r][c] = qr.isDark(r, c) ? 1 : 0;
            }
        }
        return mat;
    }

    function renderToCanvas(canvas, text, options) {
        if (!canvas || typeof global.qrcode !== 'function') return false;
        var opts = options || {};
        var sizePx = opts.size || 240;
        var quiet = opts.quiet !== undefined ? opts.quiet : 4;
        var darkColor = opts.dark || '#000000';
        var lightColor = opts.light || '#FFFFFF';

        var qr = global.qrcode(0, 'M');
        qr.addData(String(text || ''), 'Byte');
        qr.make();

        var modules = qr.getModuleCount();
        var totalModules = modules + quiet * 2;
        var scale = Math.floor(sizePx / totalModules);
        if (scale < 2) scale = 2;
        var actualSize = scale * totalModules;

        canvas.width = actualSize;
        canvas.height = actualSize;
        canvas.style.width = actualSize + 'px';
        canvas.style.height = actualSize + 'px';

        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = lightColor;
        ctx.fillRect(0, 0, actualSize, actualSize);

        ctx.fillStyle = darkColor;
        for (var r = 0; r < modules; r++) {
            for (var c = 0; c < modules; c++) {
                if (qr.isDark(r, c)) {
                    ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
                }
            }
        }
        return true;
    }

    NL.qr = {
        generateMatrix: generateMatrix,
        renderToCanvas: renderToCanvas
    };
})(window);
