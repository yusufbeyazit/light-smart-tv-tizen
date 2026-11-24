/* ==========================================================================
   Nuvio Live - Zero-Lag Virtualized List for Tizen 3.0 (Chromium 47)
   Recycles a fixed pool of DOM rows with GPU translate3d positioning
   Handles 20,000+ IPTV channels at 60fps on 2017 Smart TV hardware
   ========================================================================== */
(function (global) {
    'use strict';

    var NL = global.NuvioLive = global.NuvioLive || {};

    /**
     * options: {
     *   container: HTMLElement,
     *   rowHeight: number (px),
     *   overscan: number (default 2),
     *   renderRow: function(el, item, index, isFocused)
     * }
     */
    function VirtualList(options) {
        this.container = options.container;
        this.rowHeight = options.rowHeight || 82;
        this.overscan = options.overscan !== undefined ? options.overscan : 2;
        this.renderRow = options.renderRow;
        this.items = [];
        this.focusedIndex = 0;
        this.scrollTop = 0;
        this.pool = [];
        this.fixedViewportHeight = options.viewportHeight || 0;
        this.viewportHeight = this.fixedViewportHeight || this.container.clientHeight || 860;

        this.inner = document.createElement('div');
        this.inner.className = 'vlist-inner';
        this.container.innerHTML = '';
        this.container.appendChild(this.inner);

        this._initPool();
    }

    VirtualList.prototype._initPool = function () {
        var visibleCount = Math.ceil(this.viewportHeight / this.rowHeight) + this.overscan * 2 + 2;
        this.pool = [];
        for (var i = 0; i < visibleCount; i++) {
            var row = document.createElement('div');
            row.className = 'vlist-row';
            row.style.height = this.rowHeight + 'px';
            row.style.display = 'none';
            this.inner.appendChild(row);
            this.pool.push(row);
        }
    };

    VirtualList.prototype.setItems = function (items, keepIndex) {
        this.items = items || [];
        if (keepIndex) {
            this.focusedIndex = NL.util.clamp(this.focusedIndex, 0, Math.max(0, this.items.length - 1));
        } else {
            this.focusedIndex = 0;
            this.scrollTop = 0;
        }
        this.viewportHeight = this.fixedViewportHeight || this.container.clientHeight || this.viewportHeight;
        this.inner.style.height = (this.items.length * this.rowHeight) + 'px';
        this.ensureVisible(this.focusedIndex);
        this.render();
    };

    VirtualList.prototype.setFocusIndex = function (idx) {
        if (this.items.length === 0) {
            this.focusedIndex = 0;
            this.render();
            return;
        }
        this.focusedIndex = NL.util.clamp(idx, 0, this.items.length - 1);
        this.ensureVisible(this.focusedIndex);
        this.render();
    };

    VirtualList.prototype.move = function (delta) {
        if (this.items.length === 0) return -1;
        var next = this.focusedIndex + delta;
        if (next < 0) next = this.items.length - 1;
        if (next >= this.items.length) next = 0;
        this.setFocusIndex(next);
        return this.focusedIndex;
    };

    VirtualList.prototype.getFocusedItem = function () {
        return this.items[this.focusedIndex] || null;
    };

    VirtualList.prototype.ensureVisible = function (idx) {
        var vh = this.fixedViewportHeight || this.container.clientHeight || this.viewportHeight;
        this.viewportHeight = vh;
        var totalHeight = this.items.length * this.rowHeight;
        var maxScroll = Math.max(0, totalHeight - vh);
        var itemTop = idx * this.rowHeight;
        var itemBottom = itemTop + this.rowHeight;
        var pad = this.rowHeight; // keep 1 row lookahead comfort

        if (itemTop - pad < this.scrollTop) {
            this.scrollTop = Math.max(0, itemTop - pad);
        } else if (itemBottom + pad > this.scrollTop + vh) {
            this.scrollTop = Math.min(maxScroll, itemBottom + pad - vh);
        }
        this.scrollTop = NL.util.clamp(this.scrollTop, 0, maxScroll);
    };

    VirtualList.prototype.render = function () {
        var total = this.items.length;
        var startIdx = Math.max(0, Math.floor(this.scrollTop / this.rowHeight) - this.overscan);
        var i;

        for (i = 0; i < this.pool.length; i++) {
            var itemIdx = startIdx + i;
            var el = this.pool[i];
            if (itemIdx >= total) {
                el.style.display = 'none';
                continue;
            }
            var y = (itemIdx * this.rowHeight) - this.scrollTop;
            el.style.display = 'block';
            el.style.webkitTransform = 'translate3d(0,' + y + 'px,0)';
            el.style.transform = 'translate3d(0,' + y + 'px,0)';
            el.setAttribute('data-index', String(itemIdx));
            this.renderRow(el, this.items[itemIdx], itemIdx, itemIdx === this.focusedIndex);
        }
    };

    NL.VirtualList = VirtualList;
})(window);
