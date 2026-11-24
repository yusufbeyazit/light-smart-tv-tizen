/* ==========================================================================
   Nuvio Live - Main Application & TV Focus Controller (Strict ES5)
   ========================================================================== */
(function (global) {
    'use strict';

    var NL = global.NuvioLive = global.NuvioLive || {};

    var ui = {
        mode: 'player',         // player | drawer | dock | streams | search | hub
        osdVisible: false,
        osdFocusActive: false,
        osdBtnIdx: 0,
        osdTimer: null,
        toastTimer: null,
        seekHudTimer: null,
        backExitTs: 0,

        // Number zap
        zapDigits: '',
        zapTimer: null,

        // Drawer state
        drawerPane: 'channels', // categories | channels
        activeCatId: '__all__',
        catVList: null,
        chVList: null,

        // Dock state
        dockItems: [],
        dockIdx: 0,

        // Stream modal state
        streamChannel: null,
        streamItems: [],
        streamIdx: 0,

        // Search modal state
        searchArea: 'osk',      // osk | results
        oskIdx: 0,
        searchResults: [],
        searchResIdx: 0,

        // Hub modal state
        hubArea: 'tabs',        // tabs | content
        hubTabIdx: 0,
        hubTabs: ['nuvio', 'addons', 'm3u', 'xtream', 'settings'],
        hubContentIdx: 0,
        profiles: [],
        qrCountdownTimer: null,
        qrExpiresAt: 0
    };

    var OSK_KEYS = [
        'A','B','C','D','E','F','G','H',
        'I','J','K','L','M','N','O','P',
        'R','S','T','U','V','Y','Z','W',
        '0','1','2','3','4','5','6','7',
        '8','9','BOSLUK','SIL','TEMIZLE'
    ];

    function $(id) {
        return document.getElementById(id);
    }

    /* ======================================================================
       TOAST & CLOCK
       ====================================================================== */
    function showToast(msg, duration) {
        var el = $('toast');
        if (!el) return;
        el.textContent = msg;
        el.className = '';
        if (ui.toastTimer) clearTimeout(ui.toastTimer);
        ui.toastTimer = setTimeout(function () {
            el.className = 'toast-hidden';
        }, duration || 2800);
    }

    function startClock() {
        function update() {
            var el = $('tv-clock');
            if (el) el.textContent = NL.util.formatTime(new Date());
            if (ui.osdVisible) updateOsdEpg();
        }
        update();
        setInterval(update, 15000);
    }

    function updateTopAccountBadge() {
        var dot = $('acct-dot');
        var label = $('acct-label');
        var sess = NL.auth.getSession();
        if (sess && sess.access_token) {
            if (dot) dot.className = 'acct-dot online';
            var email = (sess.user && sess.user.email) ? sess.user.email : 'Nuvio Hesabi';
            var prof = NL.storage.get(NL.CONFIG.KEYS.ACTIVE_PROFILE, null);
            if (label) label.textContent = prof && prof.name ? (prof.name + ' · Nuvio') : email;
        } else {
            if (dot) dot.className = 'acct-dot';
            if (label) label.textContent = 'Nuvio Giris (Mavi)';
        }
    }

    function syncTopInfoVisibility() {
        var el = $('top-info-pills');
        if (!el) return;
        el.className = (ui.mode === 'player' && ui.osdVisible) ? '' : 'hud-hidden';
    }

    /* ======================================================================
       FLOATING PLAYER OSD
       ====================================================================== */
    function showOsd(focusButtons) {
        ui.osdVisible = true;
        ui.osdFocusActive = !!focusButtons;
        var el = $('player-osd');
        if (el) el.className = '';
        syncTopInfoVisibility();
        renderOsdContent();
        renderOsdFocus();
        resetOsdTimer();
    }

    function hideOsd() {
        ui.osdVisible = false;
        ui.osdFocusActive = false;
        if (ui.osdTimer) { clearTimeout(ui.osdTimer); ui.osdTimer = null; }
        var el = $('player-osd');
        if (el) el.className = 'overlay-hidden';
        syncTopInfoVisibility();
        renderOsdFocus();
    }

    function resetOsdTimer() {
        if (ui.osdTimer) clearTimeout(ui.osdTimer);
        if (ui.mode !== 'player') return;
        var delay = ui.osdFocusActive ? 9000 : NL.CONFIG.OSD_AUTO_HIDE_MS;
        ui.osdTimer = setTimeout(function () {
            if (ui.mode === 'player') hideOsd();
        }, delay);
    }

    function renderOsdContent() {
        var ch = NL.player.getCurrentChannel();
        var streams = NL.player.getCurrentStreams();
        var curSt = streams[NL.player.getCurrentStreamIndex()] || null;
        if (!ch) return;

        $('osd-ch-num').textContent = ('000' + (ch.number || 1)).slice(-3);
        $('osd-ch-name').textContent = ch.name;
        $('osd-quality-badge').textContent = (curSt && curSt.quality) ? curSt.quality : 'CANLI';
        $('osd-source-name').textContent = (curSt && curSt.source) ? curSt.source : (ch.sourceName || 'Canli TV');
        $('osd-stream-count').textContent = (streams.length || 1) + ' Yayin Kaynagi';

        var isFav = NL.store.isFavorite(ch.id);
        $('osd-fav-badge').className = isFav ? 'fav-star-badge' : 'fav-star-badge hidden';
        $('osd-fav-btn-txt').textContent = isFav ? 'Favoriden Cikar' : 'Favori';

        var aspect = NL.player.getAspectMode();
        $('osd-aspect-txt').textContent = aspect === 'fill' ? 'Tam Ekran' : (aspect === 'original' ? 'Orijinal' : '16:9');

        var img = $('osd-logo-img');
        var fb = $('osd-logo-fallback');
        fb.textContent = NL.util.initials(ch.name);
        if (ch.logo) {
            img.onload = function () {
                img.className = '';
                fb.className = 'hidden';
            };
            img.onerror = function () {
                img.className = 'hidden';
                fb.className = '';
            };
            img.src = ch.logo;
        } else {
            img.className = 'hidden';
            fb.className = '';
        }

        updateOsdEpg();
    }

    function updateOsdEpg() {
        var ch = NL.player.getCurrentChannel();
        if (!ch) return;
        var epg = NL.epg.getNowNext(ch);
        if (epg && epg.current) {
            $('osd-epg-now').textContent = NL.util.formatTime(epg.current.start) + ' - ' +
                NL.util.formatTime(epg.current.end) + '  ' + epg.current.title;
            $('osd-progress-fill').style.width = epg.progress + '%';
            $('osd-epg-next').textContent = epg.next
                ? ('Sonraki: ' + NL.util.formatTime(epg.next.start) + ' ' + epg.next.title)
                : '';
        } else {
            $('osd-epg-now').textContent = (ch.group || 'Canli Yayin') + ' · Canli TV Akisi';
            $('osd-progress-fill').style.width = '100%';
            $('osd-epg-next').textContent = '';
        }
    }

    function getOsdButtons() {
        return $('osd-actions').querySelectorAll('.osd-btn');
    }

    function renderOsdFocus() {
        var btns = getOsdButtons();
        for (var i = 0; i < btns.length; i++) {
            var isFoc = ui.osdVisible && ui.osdFocusActive && i === ui.osdBtnIdx;
            var base = btns[i].getAttribute('data-action') === 'hub' ? 'osd-btn osd-btn-accent' : 'osd-btn';
            btns[i].className = isFoc ? (base + ' focused') : base;
        }
    }

    function formatDuration(ms) {
        var totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
        var h = Math.floor(totalSec / 3600);
        var m = Math.floor((totalSec % 3600) / 60);
        var s = totalSec % 60;
        var mm = m < 10 ? ('0' + m) : String(m);
        var ss = s < 10 ? ('0' + s) : String(s);
        return h > 0 ? (h + ':' + mm + ':' + ss) : (mm + ':' + ss);
    }

    function performSeek(deltaSec) {
        var hud = $('seek-hud');
        var deltaEl = $('seek-hud-delta');
        var timeEl = $('seek-hud-time');

        NL.player.seekBy(
            deltaSec,
            function onPreview(totalSec, curMs, durMs) {
                var sign = totalSec >= 0 ? '» +' : '« ';
                deltaEl.textContent = sign + totalSec + ' sn';
                if (durMs > 0) {
                    var estMs = NL.util.clamp(curMs + totalSec * 1000, 0, durMs);
                    timeEl.textContent = formatDuration(estMs) + ' / ' + formatDuration(durMs);
                } else if (curMs > 0) {
                    timeEl.textContent = formatDuration(Math.max(0, curMs + totalSec * 1000));
                } else {
                    timeEl.textContent = totalSec >= 0 ? 'Ileri sariliyor...' : 'Geri sariliyor...';
                }
                hud.className = '';
                if (ui.seekHudTimer) clearTimeout(ui.seekHudTimer);
                ui.seekHudTimer = setTimeout(function () {
                    hud.className = 'seek-hidden';
                }, 1600);
            },
            function onComplete(err) {
                if (err) {
                    showToast(err.message || 'Bu canli yayin sarma desteklemiyor', 2600);
                }
            }
        );
    }

    function executeOsdAction(action) {
        var ch = NL.player.getCurrentChannel();
        switch (action) {
            case 'seek_back':
                performSeek(-5);
                resetOsdTimer();
                break;
            case 'seek_fwd':
                performSeek(5);
                resetOsdTimer();
                break;
            case 'seek_live':
                NL.player.seekToLive();
                showToast('Canli yayin anina donuluyor...');
                resetOsdTimer();
                break;
            case 'drawer': openDrawer(); break;
            case 'streams': if (ch) openStreamModal(ch); break;
            case 'favorite':
                if (ch) {
                    var added = NL.store.toggleFavorite(ch.id);
                    showToast(added ? ('★ ' + ch.name + ' favorilere eklendi') : (ch.name + ' favorilerden cikarildi'));
                    renderOsdContent();
                }
                break;
            case 'dock': openDock(); break;
            case 'aspect':
                var mode = NL.player.cycleAspectRatio();
                var lbl = mode === 'fill' ? 'Tam Ekran' : (mode === 'original' ? 'Orijinal' : '16:9 Letterbox');
                showToast('Goruntu orani: ' + lbl);
                renderOsdContent();
                break;
            case 'audio':
                var track = NL.player.cycleAudioTrack();
                showToast(track ? ('Ses parcasi: ' + track) : 'Bu yayinda tek ses parcasi var');
                break;
            case 'reconnect':
                NL.player.reconnect();
                showToast('Yayina yeniden baglaniliyor...');
                break;
            case 'search': openSearchModal(); break;
            case 'hub': openHubModal(0); break;
        }
    }

    /* ======================================================================
       NUMERIC CHANNEL ZAP
       ====================================================================== */
    function pushZapDigit(d) {
        if (ui.zapDigits.length >= 4) ui.zapDigits = '';
        ui.zapDigits += String(d);
        $('nz-digits').textContent = ui.zapDigits;
        $('number-zap-hud').className = '';
        if (ui.zapTimer) clearTimeout(ui.zapTimer);
        ui.zapTimer = setTimeout(commitZapDigits, NL.CONFIG.NUMBER_ZAP_COMMIT_MS);
    }

    function commitZapDigits() {
        if (ui.zapTimer) { clearTimeout(ui.zapTimer); ui.zapTimer = null; }
        var num = parseInt(ui.zapDigits, 10);
        ui.zapDigits = '';
        $('number-zap-hud').className = 'hidden';
        if (!isNaN(num)) {
            var ch = NL.store.getChannelByNumber(num);
            if (ch) {
                playAndShowOsd(ch);
            } else {
                showToast('Kanal #' + num + ' bulunamadi');
            }
        }
    }

    function playAndShowOsd(channel, streamIdx) {
        if (!channel) return;
        NL.player.playChannel(channel, streamIdx || 0);
        showOsd(false);
    }

    /* ======================================================================
       QUICK ACCESS DOCK (FAVORITES + RECENTS)
       ====================================================================== */
    function openDock() {
        hideOsd();
        var favs = NL.store.getFavoriteChannels();
        var recs = NL.store.getRecentChannels();
        var seen = {};
        var merged = [];
        var i;
        for (i = 0; i < favs.length; i++) {
            seen[favs[i].id] = true;
            merged.push({ ch: favs[i], fav: true });
        }
        for (i = 0; i < recs.length; i++) {
            if (!seen[recs[i].id]) {
                seen[recs[i].id] = true;
                merged.push({ ch: recs[i], fav: false });
            }
        }
        if (merged.length === 0) {
            var all = NL.store.getAllChannels();
            for (i = 0; i < Math.min(10, all.length); i++) {
                merged.push({ ch: all[i], fav: false });
            }
        }
        ui.dockItems = merged;
        ui.dockIdx = 0;
        ui.mode = 'dock';
        $('quick-dock').className = '';
        renderDock();
    }

    function closeDock() {
        $('quick-dock').className = 'overlay-hidden';
        ui.mode = 'player';
    }

    function renderDock() {
        var strip = $('dock-strip');
        var html = '';
        var start = Math.max(0, ui.dockIdx - 3);
        var end = Math.min(ui.dockItems.length, start + 7);
        for (var i = start; i < end; i++) {
            var item = ui.dockItems[i];
            var ch = item.ch;
            var cls = 'dock-card' + (i === ui.dockIdx ? ' focused' : '');
            html += '<div class="' + cls + '" data-dock-idx="' + i + '">' +
                '<div class="dock-card-top">' +
                    '<span class="dock-ch-num">#' + ch.number + '</span>' +
                    '<span class="dock-fav-tag">' + (item.fav ? '★' : '⏱') + '</span>' +
                '</div>' +
                '<div class="dock-ch-name">' + NL.util.escapeHtml(ch.name) + '</div>' +
                '<div class="dock-ch-group">' + NL.util.escapeHtml(ch.group || 'Canli TV') + '</div>' +
            '</div>';
        }
        strip.innerHTML = html || '<div class="empty-state">Henuz favori veya son izlenen kanal yok</div>';
    }

    /* ======================================================================
       DUAL-PANE VIRTUALIZED CHANNEL DRAWER
       ====================================================================== */
    function initDrawerLists() {
        ui.catVList = new NL.VirtualList({
            container: $('category-list'),
            rowHeight: 76,
            viewportHeight: 856,
            overscan: 2,
            renderRow: function (el, cat, idx, isFocused) {
                var active = (cat.id === ui.activeCatId);
                var foc = isFocused && ui.drawerPane === 'categories';
                var cls = 'cat-row-card' + (active ? ' active-cat' : '') + (foc ? ' focused' : '');
                el.innerHTML =
                    '<div class="' + cls + '">' +
                        '<div class="cat-left">' +
                            '<span class="cat-icon">' + NL.util.escapeHtml(cat.icon || '▸') + '</span>' +
                            '<span class="cat-name">' + NL.util.escapeHtml(cat.name) + '</span>' +
                        '</div>' +
                        '<span class="cat-count">' + cat.count + '</span>' +
                    '</div>';
            }
        });

        ui.chVList = new NL.VirtualList({
            container: $('channel-list'),
            rowHeight: 98,
            viewportHeight: 856,
            overscan: 3,
            renderRow: function (el, ch, idx, isFocused) {
                var cur = NL.player.getCurrentChannel();
                var isPlaying = cur && cur.id === ch.id;
                var foc = isFocused && ui.drawerPane === 'channels';
                var cls = 'ch-row-card' + (isPlaying ? ' is-playing' : '') + (foc ? ' focused' : '');
                var isFav = NL.store.isFavorite(ch.id);
                var epg = NL.epg.getNowNext(ch);
                var subTxt = (epg && epg.current)
                    ? (NL.util.formatTime(epg.current.start) + ' ' + epg.current.title)
                    : (ch.group || ch.sourceName || 'Canli TV');
                var streamCount = ch.streams ? ch.streams.length : 0;
                var avatarHtml = ch.logo
                    ? ('<img src="' + NL.util.escapeHtml(ch.logo) + '" alt="" onerror="this.style.display=\'none\'">')
                    : NL.util.escapeHtml(NL.util.initials(ch.name));

                el.innerHTML =
                    '<div class="' + cls + '">' +
                        '<div class="ch-num">' + ('000' + ch.number).slice(-3) + '</div>' +
                        '<div class="ch-avatar">' + avatarHtml + '</div>' +
                        '<div class="ch-info">' +
                            '<div class="ch-title">' + NL.util.escapeHtml(ch.name) + '</div>' +
                            '<div class="ch-sub">' + NL.util.escapeHtml(subTxt) + '</div>' +
                        '</div>' +
                        '<div class="ch-badges">' +
                            (isPlaying ? '<span class="ch-badge-live">IZLENIYOR</span>' : '') +
                            (streamCount > 1 ? '<span class="ch-badge-stream">' + streamCount + ' yayin</span>' : '') +
                            (isFav ? '<span class="ch-badge-fav">★</span>' : '') +
                        '</div>' +
                    '</div>';
            }
        });
    }

    function syncDrawerData(focusCurrentChannel) {
        var cats = NL.store.getCategories();
        var catIdx = 0;
        for (var i = 0; i < cats.length; i++) {
            if (cats[i].id === ui.activeCatId) { catIdx = i; break; }
        }
        if (cats[catIdx]) {
            ui.activeCatId = cats[catIdx].id;
            $('active-cat-title').textContent = cats[catIdx].name;
        }
        ui.catVList.setItems(cats, false);
        ui.catVList.setFocusIndex(catIdx);

        var chs = NL.store.getChannelsInCategory(ui.activeCatId);
        $('active-cat-count').textContent = String(chs.length);
        $('drawer-stats').textContent = NL.store.getAllChannels().length + ' kanal · ' +
            NL.store.getFavoriteChannels().length + ' favori';

        ui.chVList.setItems(chs, false);
        if (focusCurrentChannel) {
            var cur = NL.player.getCurrentChannel();
            if (cur) {
                for (var k = 0; k < chs.length; k++) {
                    if (chs[k].id === cur.id) {
                        ui.chVList.setFocusIndex(k);
                        break;
                    }
                }
            }
        }
    }

    function openDrawer() {
        hideOsd();
        ui.mode = 'drawer';
        ui.drawerPane = 'channels';
        $('channel-drawer').className = '';
        syncDrawerData(true);
    }

    function closeDrawer() {
        $('channel-drawer').className = 'drawer-hidden';
        ui.mode = 'player';
    }

    function selectCategoryFromList() {
        var cat = ui.catVList.getFocusedItem();
        if (!cat) return;
        ui.activeCatId = cat.id;
        $('active-cat-title').textContent = cat.name;
        var chs = NL.store.getChannelsInCategory(cat.id);
        $('active-cat-count').textContent = String(chs.length);
        ui.chVList.setItems(chs, false);
        ui.catVList.render();
    }

    /* ======================================================================
       MULTI-STREAM PICKER MODAL
       ====================================================================== */
    function openStreamModal(channel) {
        if (!channel) return;
        hideOsd();
        ui.streamChannel = channel;
        ui.streamItems = (channel.streams || []).slice();
        ui.streamIdx = (NL.player.getCurrentChannel() === channel) ? NL.player.getCurrentStreamIndex() : 0;
        ui.mode = 'streams';

        $('stream-modal-title').textContent = channel.name + ' · Yayin Sec';
        $('stream-modal-sub').textContent = 'En akici veya yedek yayin kaynagini secin';
        $('stream-modal').className = '';

        if (channel.sourceType === 'addon' && ui.streamItems.length === 0) {
            $('stream-list').innerHTML = '<div class="empty-state">Nuvio eklentilerinden canli yayinlar yukleniyor...</div>';
            NL.addonClient.resolveChannelStreams(channel, NL.store.getAllAddons(), function (err, resolved) {
                if (ui.mode !== 'streams' || ui.streamChannel !== channel) return;
                channel.streams = (resolved || []).slice();
                ui.streamItems = channel.streams.slice();
                ui.streamIdx = 0;
                renderStreamList();
            });
        } else {
            renderStreamList();
        }
    }

    function closeStreamModal() {
        $('stream-modal').className = 'modal-hidden';
        ui.mode = 'player';
    }

    function renderStreamList() {
        var listEl = $('stream-list');
        if (!ui.streamItems || ui.streamItems.length === 0) {
            listEl.innerHTML = '<div class="empty-state">Bu kanal icin yayin baglantisi bulunamadi.</div>';
            return;
        }
        var curCh = NL.player.getCurrentChannel();
        var activeIdx = (curCh && ui.streamChannel && curCh.id === ui.streamChannel.id)
            ? NL.player.getCurrentStreamIndex() : -1;

        var html = '';
        for (var i = 0; i < ui.streamItems.length; i++) {
            var st = ui.streamItems[i];
            var cls = 'stream-item' + (i === activeIdx ? ' active-stream' : '') + (i === ui.streamIdx ? ' focused' : '');
            html += '<div class="' + cls + '" data-stream-idx="' + i + '">' +
                '<div>' +
                    '<div class="stream-item-title">' + NL.util.escapeHtml(st.title || ('Yayin ' + (i + 1))) + '</div>' +
                    '<div class="stream-item-meta">' + NL.util.escapeHtml(st.source || 'Kaynak') + (i === activeIdx ? ' · SU AN OYNATILIYOR' : '') + '</div>' +
                '</div>' +
                '<span class="quality-badge">' + NL.util.escapeHtml(st.quality || 'CANLI') + '</span>' +
            '</div>';
        }
        listEl.innerHTML = html;
    }

    /* ======================================================================
       FAST CHANNEL SEARCH MODAL
       ====================================================================== */
    function initSearchOsk() {
        var grid = $('osk-grid');
        var html = '';
        for (var i = 0; i < OSK_KEYS.length; i++) {
            var k = OSK_KEYS[i];
            var wide = (k === 'BOSLUK' || k === 'SIL' || k === 'TEMIZLE') ? ' wide' : '';
            html += '<div class="osk-key' + wide + '" data-osk-idx="' + i + '">' + k + '</div>';
        }
        grid.innerHTML = html;

        $('search-input').addEventListener('input', function () {
            runSearchQuery();
        });
    }

    function openSearchModal() {
        hideOsd();
        $('channel-drawer').className = 'drawer-hidden';
        ui.mode = 'search';
        ui.searchArea = 'osk';
        ui.oskIdx = 0;
        ui.searchResIdx = 0;
        $('search-modal').className = '';
        runSearchQuery();
        renderSearchFocus();
    }

    function closeSearchModal() {
        $('search-input').blur();
        $('search-modal').className = 'modal-hidden';
        ui.mode = 'player';
    }

    function runSearchQuery() {
        var q = $('search-input').value || '';
        ui.searchResults = NL.store.searchChannels(q, 80);
        ui.searchResIdx = 0;
        $('search-count').textContent = String(ui.searchResults.length);
        renderSearchResults();
    }

    function renderSearchResults() {
        var el = $('search-results');
        if (ui.searchResults.length === 0) {
            el.innerHTML = '<div class="empty-state">Eslesen kanal bulunamadi</div>';
            return;
        }
        var html = '';
        for (var i = 0; i < ui.searchResults.length; i++) {
            var ch = ui.searchResults[i];
            var foc = (ui.searchArea === 'results' && i === ui.searchResIdx);
            html += '<div class="search-res-item' + (foc ? ' focused' : '') + '" data-res-idx="' + i + '">' +
                '<div>' +
                    '<div class="ch-title">#' + ch.number + ' ' + NL.util.escapeHtml(ch.name) + '</div>' +
                    '<div class="ch-sub">' + NL.util.escapeHtml(ch.group || 'Canli TV') + '</div>' +
                '</div>' +
                (NL.store.isFavorite(ch.id) ? '<span class="ch-badge-fav">★</span>' : '') +
            '</div>';
        }
        el.innerHTML = html;
        if (ui.searchArea === 'results') {
            var activeNode = el.querySelector('.search-res-item.focused');
            if (activeNode && activeNode.scrollIntoView) {
                activeNode.scrollIntoView(false);
            }
        }
    }

    function renderSearchFocus() {
        var keys = $('osk-grid').querySelectorAll('.osk-key');
        for (var i = 0; i < keys.length; i++) {
            var k = OSK_KEYS[i];
            var base = 'osk-key' + ((k === 'BOSLUK' || k === 'SIL' || k === 'TEMIZLE') ? ' wide' : '');
            keys[i].className = (ui.searchArea === 'osk' && i === ui.oskIdx) ? (base + ' focused') : base;
        }
        renderSearchResults();
    }

    function pressOskKey(idx) {
        var k = OSK_KEYS[idx];
        var inp = $('search-input');
        if (!k || !inp) return;
        if (k === 'BOSLUK') inp.value += ' ';
        else if (k === 'SIL') inp.value = inp.value.slice(0, -1);
        else if (k === 'TEMIZLE') inp.value = '';
        else inp.value += k.toLowerCase();
        runSearchQuery();
    }

    /* ======================================================================
       NUVIO ACCOUNT, QR LOGIN & SOURCE HUB MODAL
       ====================================================================== */
    function openHubModal(tabIndex) {
        hideOsd();
        $('channel-drawer').className = 'drawer-hidden';
        ui.mode = 'hub';
        ui.hubArea = 'tabs';
        ui.hubTabIdx = tabIndex || 0;
        ui.hubContentIdx = 0;
        $('hub-modal').className = '';
        populateHubData();
        selectHubTab(ui.hubTabIdx);
    }

    function closeHubModal() {
        NL.auth.stopQrPolling();
        if (ui.qrCountdownTimer) { clearInterval(ui.qrCountdownTimer); ui.qrCountdownTimer = null; }
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        $('hub-modal').className = 'modal-hidden';
        ui.mode = 'player';
    }

    function populateHubData() {
        // Backend config inputs
        var cfg = NL.storage.getBackendConfig();
        $('inp-backend-url').value = cfg.supabaseUrl || '';
        $('inp-backend-key').value = cfg.supabaseAnonKey || '';

        // Auth state card
        renderNuvioAccountCard();
        renderAddonSourceList();
        renderM3uSourceList();
        renderXtreamSourceList();
        renderSettingsTab();
    }

    function renderNuvioAccountCard() {
        var sess = NL.auth.getSession();
        if (sess && sess.access_token) {
            $('nuvio-signed-out-view').className = 'hidden';
            $('nuvio-signed-in-view').className = '';
            var email = (sess.user && sess.user.email) ? sess.user.email : 'Nuvio Kullanicisi';
            $('acct-email').textContent = email;
            $('acct-avatar').textContent = email.charAt(0).toUpperCase();
            renderProfilesRow();
        } else {
            $('nuvio-signed-out-view').className = '';
            $('nuvio-signed-in-view').className = 'hidden';
        }
        updateTopAccountBadge();
    }

    function renderProfilesRow() {
        var activeId = NL.sync.getActiveProfileId();
        var list = ui.profiles && ui.profiles.length ? ui.profiles : [{ id: activeId, name: 'Ana Profil' }];
        var html = '';
        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            var act = p.id === activeId ? ' active' : '';
            html += '<button class="profile-chip hub-focusable' + act + '" data-profile-id="' + p.id + '">' +
                NL.util.escapeHtml(p.name) + '</button>';
        }
        $('profile-list').innerHTML = html;
    }

    function startNuvioQrFlow() {
        var statusEl = $('qr-status-text');
        var codeEl = $('qr-code-text');
        var phEl = $('qr-placeholder');
        var canvas = $('qr-canvas');
        var cfg = NL.storage.getBackendConfig();

        statusEl.textContent = 'Nuvio sunucusundan QR oturumu isteniyor...';
        codeEl.textContent = '.... ....';

        NL.auth.startQrLogin(function (err, qrSess) {
            if (err || !qrSess) {
                // Even if official anon key isn't configured yet, show helpful guidance
                statusEl.textContent = 'Baglanti hatasi: ' + (err ? err.message : 'Sunucu yanit vermedi') +
                    (!cfg.supabaseAnonKey ? ' (Sagdan Supabase Key girin veya .well-known kesfedin)' : '');
                showToast('QR oturumu baslatilamadi — Nuvio backend ayarlarini kontrol edin', 4000);
                return;
            }
            phEl.className = 'qr-placeholder hidden';
            NL.qr.renderToCanvas(canvas, qrSess.qrUrl, { size: 252, quiet: 4 });
            codeEl.textContent = qrSess.code || 'HAZIR';
            ui.qrExpiresAt = qrSess.expiresAt;

            if (ui.qrCountdownTimer) clearInterval(ui.qrCountdownTimer);
            ui.qrCountdownTimer = setInterval(function () {
                var left = Math.max(0, Math.round((ui.qrExpiresAt - NL.util.now()) / 1000));
                if (left <= 0) {
                    clearInterval(ui.qrCountdownTimer);
                    ui.qrCountdownTimer = null;
                    statusEl.textContent = 'Sure doldu. Yeni QR kod olusturun.';
                } else {
                    var m = Math.floor(left / 60);
                    var s = left % 60;
                    statusEl.textContent = 'Telefon onayi bekleniyor (' + m + ':' + (s < 10 ? '0' + s : s) + ')...';
                }
            }, 1000);

            NL.auth.startQrPolling(qrSess,
                function onStatus(st) {
                    if (st === 'approved' || st === 'confirmed') {
                        statusEl.textContent = 'Onaylandi! Oturum aciliyor...';
                    } else if (st === 'expired') {
                        statusEl.textContent = 'QR suresi doldu, yenileyin.';
                    }
                },
                function onSuccess() {
                    if (ui.qrCountdownTimer) { clearInterval(ui.qrCountdownTimer); ui.qrCountdownTimer = null; }
                    showToast('Nuvio hesabina basariyla giris yapildi!');
                    renderNuvioAccountCard();
                    triggerCloudSync();
                },
                function onError(exErr) {
                    statusEl.textContent = 'Giris tamamlanamadi: ' + (exErr ? exErr.message : 'Hata');
                }
            );
        });
    }

    function triggerCloudSync() {
        showToast('Nuvio bulut eklentileri senkronize ediliyor...');
        NL.sync.syncAll(function (err, res) {
            if (err) {
                showToast('Senkronizasyon uyarisi: ' + err.message, 3500);
                return;
            }
            if (res && res.profiles) ui.profiles = res.profiles;
            renderNuvioAccountCard();
            renderAddonSourceList();
            var cnt = res && res.addons ? res.addons.length : 0;
            showToast('Nuvio senkronizasyonu tamamlandi (' + cnt + ' eklenti)');
            reloadAllChannels();
        });
    }

    function renderAddonSourceList() {
        var list = NL.store.getAllAddons();
        var el = $('addon-source-list');
        if (list.length === 0) {
            el.innerHTML = '<div class="empty-state">Yuklu Nuvio eklentisi yok.<br>Nuvio QR giris yapin veya soldan manifest.json URL ekleyin.</div>';
            return;
        }
        var html = '';
        for (var i = 0; i < list.length; i++) {
            var a = list[i];
            html += '<div class="source-item hub-focusable" data-remove-addon="' + (a.fromCloud ? '' : NL.util.escapeHtml(a.id)) + '">' +
                '<div class="source-item-info">' +
                    '<div class="source-item-name">' + NL.util.escapeHtml(a.name) + '</div>' +
                    '<div class="source-item-url">' + NL.util.escapeHtml(a.url) + '</div>' +
                '</div>' +
                '<span class="source-tag' + (a.fromCloud ? '' : ' del-hint') + '">' + (a.fromCloud ? 'NUVIO BULUT' : 'SIL (OK)') + '</span>' +
            '</div>';
        }
        el.innerHTML = html;
    }

    function renderM3uSourceList() {
        var list = NL.store.getM3uSources();
        var el = $('m3u-source-list');
        if (list.length === 0) {
            el.innerHTML = '<div class="empty-state">Kayitli M3U listesi yok.<br>Soldan M3U/M3U8 ve istege bagli XMLTV EPG baglantisi ekleyin.</div>';
            return;
        }
        var html = '';
        for (var i = 0; i < list.length; i++) {
            var s = list[i];
            html += '<div class="source-item hub-focusable" data-remove-m3u="' + NL.util.escapeHtml(s.id) + '">' +
                '<div class="source-item-info">' +
                    '<div class="source-item-name">' + NL.util.escapeHtml(s.name) + (s.epgUrl ? ' · +EPG' : '') + '</div>' +
                    '<div class="source-item-url">' + NL.util.escapeHtml(s.url) + '</div>' +
                '</div>' +
                '<span class="source-tag del-hint">SIL (OK)</span>' +
            '</div>';
        }
        el.innerHTML = html;
    }

    function renderXtreamSourceList() {
        var list = NL.store.getXtreamSources();
        var el = $('xtream-source-list');
        if (list.length === 0) {
            el.innerHTML = '<div class="empty-state">Kayitli Xtream Codes sunucusu yok.<br>Soldan sunucu, kullanici adi ve sifre girerek ekleyin.</div>';
            return;
        }
        var html = '';
        for (var i = 0; i < list.length; i++) {
            var s = list[i];
            html += '<div class="source-item hub-focusable" data-remove-xtream="' + NL.util.escapeHtml(s.id) + '">' +
                '<div class="source-item-info">' +
                    '<div class="source-item-name">' + NL.util.escapeHtml(s.name) + '</div>' +
                    '<div class="source-item-url">' + NL.util.escapeHtml(s.server + ' (' + s.username + ')') + '</div>' +
                '</div>' +
                '<span class="source-tag del-hint">SIL (OK)</span>' +
            '</div>';
        }
        el.innerHTML = html;
    }

    function renderSettingsTab() {
        var p = NL.storage.getPrefs();
        setToggle('tog-autoPlayLast', p.autoPlayLast);
        setToggle('tog-groupDuplicateStreams', p.groupDuplicateStreams);
        setToggle('tog-showDemoWhenEmpty', p.showDemoWhenEmpty);
        var asp = $('tog-aspectMode');
        if (asp) {
            asp.textContent = p.aspectMode === 'fill' ? 'TAM EKRAN' : (p.aspectMode === 'original' ? 'ORIJINAL' : '16:9');
            asp.className = 'toggle-pill';
        }
        $('sys-foot-info').textContent = 'Light Smart TV v' + NL.CONFIG.APP_VERSION + ' · github.com/yusufbeyazit';
    }

    function setToggle(id, val) {
        var el = $(id);
        if (!el) return;
        el.textContent = val ? 'ACIK' : 'KAPALI';
        el.className = val ? 'toggle-pill' : 'toggle-pill off';
    }

    function selectHubTab(idx) {
        ui.hubTabIdx = NL.util.clamp(idx, 0, ui.hubTabs.length - 1);
        ui.hubContentIdx = 0;
        var tabEls = $('hub-tabs').querySelectorAll('.hub-tab');
        for (var i = 0; i < ui.hubTabs.length; i++) {
            var panel = $('tab-' + ui.hubTabs[i]);
            if (panel) panel.className = (i === ui.hubTabIdx) ? 'hub-panel' : 'hub-panel hidden';
            if (tabEls[i]) {
                var cls = 'hub-tab' + (i === ui.hubTabIdx ? ' active' : '');
                if (ui.hubArea === 'tabs' && i === ui.hubTabIdx) cls += ' focused';
                tabEls[i].className = cls;
            }
        }
        renderHubFocus();
    }

    function getActiveHubFocusables() {
        var panel = $('tab-' + ui.hubTabs[ui.hubTabIdx]);
        if (!panel) return [];
        var all = panel.querySelectorAll('.hub-focusable');
        var visible = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].offsetParent !== null) visible.push(all[i]);
        }
        return visible;
    }

    function renderHubFocus() {
        var tabEls = $('hub-tabs').querySelectorAll('.hub-tab');
        var i;
        for (i = 0; i < tabEls.length; i++) {
            var base = 'hub-tab' + (i === ui.hubTabIdx ? ' active' : '');
            tabEls[i].className = (ui.hubArea === 'tabs' && i === ui.hubTabIdx) ? (base + ' focused') : base;
        }
        var items = getActiveHubFocusables();
        if (items.length > 0) {
            ui.hubContentIdx = NL.util.clamp(ui.hubContentIdx, 0, items.length - 1);
        }
        for (i = 0; i < items.length; i++) {
            var el = items[i];
            var isFoc = (ui.hubArea === 'content' && i === ui.hubContentIdx);
            if (isFoc) {
                if (el.className.indexOf('focused') === -1) el.className += ' focused';
                if (el.scrollIntoView) el.scrollIntoView(false);
            } else {
                el.className = el.className.replace(/\bfocused\b/g, '').trim();
                if (el === document.activeElement && el.tagName === 'INPUT') el.blur();
            }
        }
    }

    function activateHubElement(el) {
        if (!el) return;
        if (el.tagName === 'INPUT') {
            el.focus();
            return;
        }
        var id = el.id;
        if (id === 'btn-start-qr') { startNuvioQrFlow(); return; }
        if (id === 'btn-sync-now') { triggerCloudSync(); return; }
        if (id === 'btn-sign-out') {
            NL.auth.signOut();
            renderNuvioAccountCard();
            showToast('Nuvio hesabindan cikis yapildi');
            return;
        }
        if (id === 'btn-save-backend') {
            NL.storage.setBackendConfig({
                supabaseUrl: $('inp-backend-url').value,
                supabaseAnonKey: $('inp-backend-key').value
            });
            showToast('Nuvio sunucu ayarlari kaydedildi');
            return;
        }
        if (id === 'btn-discover-backend') {
            var u = $('inp-backend-url').value;
            showToast('Sunucu kesfediliyor...');
            NL.auth.discoverBackend(u, function (err, res) {
                if (err) { showToast('Kesif hatasi: ' + err.message, 3500); return; }
                $('inp-backend-url').value = res.config.supabaseUrl || '';
                $('inp-backend-key').value = res.config.supabaseAnonKey || '';
                showToast('Nuvio sunucu yapilandirmasi otomatik alindi!');
            });
            return;
        }
        if (id === 'btn-email-login') {
            var email = $('inp-login-email').value;
            var pass = $('inp-login-pass').value;
            if (!email || !pass) { showToast('E-posta ve sifre girin'); return; }
            showToast('Nuvio girisi yapiliyor...');
            NL.auth.signInWithPassword(email, pass, function (err) {
                if (err) { showToast('Giris hatasi: ' + err.message, 3500); return; }
                $('inp-login-pass').value = '';
                renderNuvioAccountCard();
                showToast('Nuvio girisi basarili!');
                triggerCloudSync();
            });
            return;
        }
        if (id === 'btn-add-addon') {
            var aUrl = $('inp-addon-url').value;
            var aName = $('inp-addon-name').value;
            if (!aUrl) { showToast('Eklenti manifest URL girin'); return; }
            NL.store.addCustomAddon(aUrl, aName);
            $('inp-addon-url').value = '';
            $('inp-addon-name').value = '';
            renderAddonSourceList();
            showToast('Eklenti eklendi, kanallar yukleniyor...');
            reloadAllChannels();
            return;
        }
        if (id === 'btn-reload-sources') {
            reloadAllChannels();
            return;
        }
        if (id === 'btn-add-m3u') {
            var mName = $('inp-m3u-name').value || 'IPTV Liste';
            var mUrl = $('inp-m3u-url').value;
            var mEpg = $('inp-m3u-epg').value;
            if (!mUrl) { showToast('M3U URL girin'); return; }
            NL.store.addM3uSource(mName, mUrl, mEpg);
            $('inp-m3u-name').value = '';
            $('inp-m3u-url').value = '';
            $('inp-m3u-epg').value = '';
            renderM3uSourceList();
            showToast('M3U eklendi, kanallar yukleniyor...');
            reloadAllChannels();
            return;
        }
        if (id === 'btn-add-xtream') {
            var xName = $('inp-xt-name').value || 'Xtream TV';
            var xSrv = $('inp-xt-server').value;
            var xUsr = $('inp-xt-user').value;
            var xPwd = $('inp-xt-pass').value;
            if (!xSrv || !xUsr || !xPwd) { showToast('Tum Xtream alanlarini doldurun'); return; }
            showToast('Xtream hesabi dogrulaniyor...');
            NL.xtream.testConnection({ server: xSrv, username: xUsr, password: xPwd }, function (err) {
                if (err) { showToast('Xtream hatasi: ' + err.message, 3500); return; }
                NL.store.addXtreamSource(xName, xSrv, xUsr, xPwd);
                $('inp-xt-name').value = '';
                $('inp-xt-server').value = '';
                $('inp-xt-user').value = '';
                $('inp-xt-pass').value = '';
                renderXtreamSourceList();
                showToast('Xtream dogrulandi! Kanallar yukleniyor...');
                reloadAllChannels();
            });
            return;
        }

        // Dynamic data attributes (profile switch, remove source, toggle setting)
        var profId = el.getAttribute('data-profile-id');
        if (profId) {
            var pid = parseInt(profId, 10) || profId;
            for (var p = 0; p < ui.profiles.length; p++) {
                if (String(ui.profiles[p].id) === String(pid)) {
                    NL.sync.setActiveProfile(ui.profiles[p]);
                    break;
                }
            }
            triggerCloudSync();
            return;
        }

        var remAddon = el.getAttribute('data-remove-addon');
        if (remAddon) {
            NL.store.removeCustomAddon(remAddon);
            renderAddonSourceList();
            showToast('Eklenti kaldirildi');
            reloadAllChannels();
            return;
        }

        var remM3u = el.getAttribute('data-remove-m3u');
        if (remM3u) {
            NL.store.removeM3uSource(remM3u);
            renderM3uSourceList();
            showToast('M3U listesi kaldirildi');
            reloadAllChannels();
            return;
        }

        var remXt = el.getAttribute('data-remove-xtream');
        if (remXt) {
            NL.store.removeXtreamSource(remXt);
            renderXtreamSourceList();
            showToast('Xtream kaynagi kaldirildi');
            reloadAllChannels();
            return;
        }

        var settingKey = el.getAttribute('data-setting');
        if (settingKey) {
            var prefs = NL.storage.getPrefs();
            if (settingKey === 'aspectMode') {
                NL.player.cycleAspectRatio();
            } else {
                var patch = {};
                patch[settingKey] = !prefs[settingKey];
                NL.storage.setPrefs(patch);
                if (settingKey === 'groupDuplicateStreams' || settingKey === 'showDemoWhenEmpty') {
                    reloadAllChannels();
                }
            }
            renderSettingsTab();
        }
    }

    /* ======================================================================
       REMOTE CONTROL ACTION ROUTER
       ====================================================================== */
    function handleAction(action) {
        // Numeric digits while watching live TV
        if (ui.mode === 'player' && action.indexOf('DIGIT_') === 0) {
            pushZapDigit(action.slice(6));
            return;
        }

        if (ui.mode === 'player') { handlePlayerKey(action); return; }
        if (ui.mode === 'drawer') { handleDrawerKey(action); return; }
        if (ui.mode === 'dock')   { handleDockKey(action);   return; }
        if (ui.mode === 'streams'){ handleStreamsKey(action); return; }
        if (ui.mode === 'search') { handleSearchKey(action); return; }
        if (ui.mode === 'hub')    { handleHubKey(action);    return; }
    }

    function handlePlayerKey(action) {
        if (ui.zapDigits && action === 'ENTER') {
            commitZapDigits();
            return;
        }
        var ch = NL.player.getCurrentChannel();
        var btns = getOsdButtons();

        switch (action) {
            case 'CH_UP':
                playAndShowOsd(NL.store.getNeighborChannel(ch, ui.activeCatId, -1));
                break;
            case 'CH_DOWN':
                playAndShowOsd(NL.store.getNeighborChannel(ch, ui.activeCatId, 1));
                break;
            case 'UP':
                if (ui.osdVisible && ui.osdFocusActive) {
                    ui.osdFocusActive = false;
                    renderOsdFocus();
                    resetOsdTimer();
                } else {
                    openDock();
                }
                break;
            case 'DOWN':
                if (!ui.osdVisible) {
                    showOsd(true);
                } else if (!ui.osdFocusActive) {
                    ui.osdFocusActive = true;
                    renderOsdFocus();
                    resetOsdTimer();
                }
                break;
            case 'LEFT':
                if (ui.osdVisible && ui.osdFocusActive) {
                    ui.osdBtnIdx = (ui.osdBtnIdx - 1 + btns.length) % btns.length;
                    renderOsdFocus();
                    resetOsdTimer();
                } else {
                    openDrawer();
                }
                break;
            case 'RIGHT':
                if (ui.osdVisible && ui.osdFocusActive) {
                    ui.osdBtnIdx = (ui.osdBtnIdx + 1) % btns.length;
                    renderOsdFocus();
                    resetOsdTimer();
                } else {
                    performSeek(5);
                }
                break;
            case 'SEEK_FWD':
                performSeek(5);
                break;
            case 'SEEK_BACK':
                performSeek(-5);
                break;
            case 'ENTER':
                if (ui.osdVisible && ui.osdFocusActive) {
                    var act = btns[ui.osdBtnIdx] && btns[ui.osdBtnIdx].getAttribute('data-action');
                    if (act) executeOsdAction(act);
                } else {
                    openDrawer();
                }
                break;
            case 'INFO':
                if (ui.osdVisible) hideOsd(); else showOsd(false);
                break;
            case 'RED':
                executeOsdAction('favorite');
                break;
            case 'GREEN':
                executeOsdAction('streams');
                break;
            case 'YELLOW':
                openSearchModal();
                break;
            case 'BLUE':
                openHubModal(0);
                break;
            case 'PLAY_PAUSE':
                NL.player.togglePause();
                showOsd(false);
                break;
            case 'RECONNECT':
                executeOsdAction('reconnect');
                break;
            case 'BACK':
                if (ui.osdVisible) {
                    hideOsd();
                } else {
                    var now = NL.util.now();
                    if (now - ui.backExitTs < 2200) {
                        NL.player.stop();
                        NL.remote.exitApp();
                    } else {
                        ui.backExitTs = now;
                        showToast('Cikmak icin GERI tusuna tekrar basin', 2000);
                    }
                }
                break;
        }
    }

    function handleDrawerKey(action) {
        switch (action) {
            case 'UP':
                if (ui.drawerPane === 'categories') {
                    ui.catVList.move(-1);
                    selectCategoryFromList();
                } else {
                    ui.chVList.move(-1);
                }
                break;
            case 'DOWN':
                if (ui.drawerPane === 'categories') {
                    ui.catVList.move(1);
                    selectCategoryFromList();
                } else {
                    ui.chVList.move(1);
                }
                break;
            case 'CH_UP':
                if (ui.drawerPane === 'channels') ui.chVList.move(-8);
                break;
            case 'CH_DOWN':
                if (ui.drawerPane === 'channels') ui.chVList.move(8);
                break;
            case 'LEFT':
                if (ui.drawerPane === 'channels') {
                    ui.drawerPane = 'categories';
                    ui.catVList.render();
                    ui.chVList.render();
                }
                break;
            case 'RIGHT':
                if (ui.drawerPane === 'categories') {
                    ui.drawerPane = 'channels';
                    ui.catVList.render();
                    ui.chVList.render();
                }
                break;
            case 'ENTER':
                if (ui.drawerPane === 'categories') {
                    selectCategoryFromList();
                    ui.drawerPane = 'channels';
                    ui.catVList.render();
                    ui.chVList.render();
                } else {
                    var ch = ui.chVList.getFocusedItem();
                    if (ch) {
                        closeDrawer();
                        playAndShowOsd(ch);
                    }
                }
                break;
            case 'RED':
                if (ui.drawerPane === 'channels') {
                    var fch = ui.chVList.getFocusedItem();
                    if (fch) {
                        var added = NL.store.toggleFavorite(fch.id);
                        showToast(added ? ('★ ' + fch.name + ' favorilere eklendi') : (fch.name + ' favorilerden cikarildi'));
                        syncDrawerData(false);
                    }
                }
                break;
            case 'GREEN':
                if (ui.drawerPane === 'channels') {
                    var sch = ui.chVList.getFocusedItem();
                    if (sch) { closeDrawer(); openStreamModal(sch); }
                }
                break;
            case 'YELLOW':
                openSearchModal();
                break;
            case 'BLUE':
                openHubModal(0);
                break;
            case 'BACK':
                closeDrawer();
                break;
        }
    }

    function handleDockKey(action) {
        if (ui.dockItems.length === 0) {
            if (action === 'BACK' || action === 'DOWN') closeDock();
            return;
        }
        switch (action) {
            case 'LEFT':
                ui.dockIdx = (ui.dockIdx - 1 + ui.dockItems.length) % ui.dockItems.length;
                renderDock();
                break;
            case 'RIGHT':
                ui.dockIdx = (ui.dockIdx + 1) % ui.dockItems.length;
                renderDock();
                break;
            case 'ENTER':
                var picked = ui.dockItems[ui.dockIdx];
                closeDock();
                if (picked && picked.ch) playAndShowOsd(picked.ch);
                break;
            case 'RED':
                var item = ui.dockItems[ui.dockIdx];
                if (item && item.ch) {
                    var added = NL.store.toggleFavorite(item.ch.id);
                    showToast(added ? '★ Favorilere eklendi' : 'Favorilerden cikarildi');
                    openDock();
                }
                break;
            case 'DOWN':
            case 'BACK':
                closeDock();
                break;
        }
    }

    function handleStreamsKey(action) {
        var len = ui.streamItems.length;
        switch (action) {
            case 'UP':
                if (len > 0) { ui.streamIdx = (ui.streamIdx - 1 + len) % len; renderStreamList(); }
                break;
            case 'DOWN':
                if (len > 0) { ui.streamIdx = (ui.streamIdx + 1) % len; renderStreamList(); }
                break;
            case 'ENTER':
                if (len > 0 && ui.streamChannel) {
                    var targetCh = ui.streamChannel;
                    var idx = ui.streamIdx;
                    closeStreamModal();
                    if (NL.player.getCurrentChannel() && NL.player.getCurrentChannel().id === targetCh.id) {
                        NL.player.switchStream(idx);
                        showOsd(false);
                    } else {
                        playAndShowOsd(targetCh, idx);
                    }
                }
                break;
            case 'BACK':
                closeStreamModal();
                break;
        }
    }

    function handleSearchKey(action) {
        if (action === 'INPUT_ENTER') {
            $('search-input').blur();
            if (ui.searchResults.length > 0) {
                ui.searchArea = 'results';
                ui.searchResIdx = 0;
                renderSearchFocus();
            }
            return;
        }
        var cols = 8;
        if (ui.searchArea === 'osk') {
            switch (action) {
                case 'LEFT':
                    ui.oskIdx = (ui.oskIdx - 1 + OSK_KEYS.length) % OSK_KEYS.length;
                    renderSearchFocus();
                    break;
                case 'RIGHT':
                    if ((ui.oskIdx % cols === cols - 1 || ui.oskIdx === OSK_KEYS.length - 1) && ui.searchResults.length > 0) {
                        ui.searchArea = 'results';
                        renderSearchFocus();
                    } else {
                        ui.oskIdx = (ui.oskIdx + 1) % OSK_KEYS.length;
                        renderSearchFocus();
                    }
                    break;
                case 'UP':
                    ui.oskIdx = Math.max(0, ui.oskIdx - cols);
                    renderSearchFocus();
                    break;
                case 'DOWN':
                    ui.oskIdx = Math.min(OSK_KEYS.length - 1, ui.oskIdx + cols);
                    renderSearchFocus();
                    break;
                case 'ENTER':
                    pressOskKey(ui.oskIdx);
                    break;
                case 'BACK':
                    closeSearchModal();
                    break;
            }
        } else {
            switch (action) {
                case 'LEFT':
                    ui.searchArea = 'osk';
                    renderSearchFocus();
                    break;
                case 'UP':
                    if (ui.searchResults.length > 0) {
                        ui.searchResIdx = (ui.searchResIdx - 1 + ui.searchResults.length) % ui.searchResults.length;
                        renderSearchResults();
                    }
                    break;
                case 'DOWN':
                    if (ui.searchResults.length > 0) {
                        ui.searchResIdx = (ui.searchResIdx + 1) % ui.searchResults.length;
                        renderSearchResults();
                    }
                    break;
                case 'ENTER':
                    var ch = ui.searchResults[ui.searchResIdx];
                    if (ch) { closeSearchModal(); playAndShowOsd(ch); }
                    break;
                case 'BACK':
                    closeSearchModal();
                    break;
            }
        }
    }

    function handleHubKey(action) {
        var items = getActiveHubFocusables();
        if (action === 'INPUT_ENTER') {
            if (document.activeElement) document.activeElement.blur();
            return;
        }
        if (ui.hubArea === 'tabs') {
            switch (action) {
                case 'LEFT':
                    selectHubTab((ui.hubTabIdx - 1 + ui.hubTabs.length) % ui.hubTabs.length);
                    break;
                case 'RIGHT':
                    selectHubTab((ui.hubTabIdx + 1) % ui.hubTabs.length);
                    break;
                case 'DOWN':
                case 'ENTER':
                    if (items.length > 0) {
                        ui.hubArea = 'content';
                        ui.hubContentIdx = 0;
                        renderHubFocus();
                    }
                    break;
                case 'BACK':
                    closeHubModal();
                    break;
            }
        } else {
            switch (action) {
                case 'UP':
                    if (ui.hubContentIdx === 0) {
                        ui.hubArea = 'tabs';
                        renderHubFocus();
                    } else {
                        ui.hubContentIdx--;
                        renderHubFocus();
                    }
                    break;
                case 'DOWN':
                    if (items.length > 0) {
                        ui.hubContentIdx = (ui.hubContentIdx + 1) % items.length;
                        renderHubFocus();
                    }
                    break;
                case 'LEFT':
                    if (ui.hubContentIdx > 0) { ui.hubContentIdx--; renderHubFocus(); }
                    else { ui.hubArea = 'tabs'; renderHubFocus(); }
                    break;
                case 'RIGHT':
                    if (items.length > 0) {
                        ui.hubContentIdx = (ui.hubContentIdx + 1) % items.length;
                        renderHubFocus();
                    }
                    break;
                case 'ENTER':
                    activateHubElement(items[ui.hubContentIdx]);
                    break;
                case 'BACK':
                    if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                        document.activeElement.blur();
                    } else {
                        closeHubModal();
                    }
                    break;
            }
        }
    }

    /* ======================================================================
       MOUSE / CLICK SUPPORT (FOR EASY DESKTOP PREVIEW & MAGIC REMOTE)
       ====================================================================== */
    function bindPointerSupport() {
        $('osd-actions').addEventListener('click', function (e) {
            var btn = findClosest(e.target, '.osd-btn');
            if (btn) executeOsdAction(btn.getAttribute('data-action'));
        });
        $('hub-tabs').addEventListener('click', function (e) {
            var tab = findClosest(e.target, '.hub-tab');
            if (!tab) return;
            var name = tab.getAttribute('data-tab');
            var idx = ui.hubTabs.indexOf(name);
            if (idx !== -1) { ui.hubArea = 'tabs'; selectHubTab(idx); }
        });
        $('hub-modal').addEventListener('click', function (e) {
            var foc = findClosest(e.target, '.hub-focusable');
            if (foc) activateHubElement(foc);
        });
        $('osk-grid').addEventListener('click', function (e) {
            var key = findClosest(e.target, '.osk-key');
            if (key) pressOskKey(parseInt(key.getAttribute('data-osk-idx'), 10));
        });
        $('search-results').addEventListener('click', function (e) {
            var item = findClosest(e.target, '.search-res-item');
            if (item) {
                var idx = parseInt(item.getAttribute('data-res-idx'), 10);
                if (ui.searchResults[idx]) { closeSearchModal(); playAndShowOsd(ui.searchResults[idx]); }
            }
        });
        $('stream-list').addEventListener('click', function (e) {
            var item = findClosest(e.target, '.stream-item');
            if (item) {
                ui.streamIdx = parseInt(item.getAttribute('data-stream-idx'), 10);
                handleStreamsKey('ENTER');
            }
        });
        $('dock-strip').addEventListener('click', function (e) {
            var card = findClosest(e.target, '.dock-card');
            if (card) {
                ui.dockIdx = parseInt(card.getAttribute('data-dock-idx'), 10);
                handleDockKey('ENTER');
            }
        });
        $('category-list').addEventListener('click', function (e) {
            var row = findClosest(e.target, '.vlist-row');
            if (row) {
                ui.drawerPane = 'categories';
                ui.catVList.setFocusIndex(parseInt(row.getAttribute('data-index'), 10));
                selectCategoryFromList();
            }
        });
        $('channel-list').addEventListener('click', function (e) {
            var row = findClosest(e.target, '.vlist-row');
            if (row) {
                ui.drawerPane = 'channels';
                ui.chVList.setFocusIndex(parseInt(row.getAttribute('data-index'), 10));
                handleDrawerKey('ENTER');
            }
        });
    }

    function findClosest(node, selector) {
        var cls = selector.charAt(0) === '.' ? selector.slice(1) : '';
        while (node && node !== document) {
            if (cls && node.className && (' ' + node.className + ' ').indexOf(' ' + cls + ' ') !== -1) {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    /* ======================================================================
       PLAYER STATE & BOOTSTRAP
       ====================================================================== */
    function bindPlayerEvents() {
        NL.player.onEvent(function (ev, data) {
            if (ev !== 'state') return;
            var pill = $('player-state-pill');
            var text = $('player-state-text');
            var ambient = $('ambient-bg');
            var ambSub = $('ambient-status');

            if (data.state === 'playing') {
                pill.className = 'hidden';
                ambient.className = 'playing-active';
                renderOsdContent();
            } else if (data.state === 'loading' || data.state === 'buffering') {
                pill.className = '';
                text.textContent = data.detail || 'Yukleniyor...';
                ambSub.textContent = data.detail || 'Yayin yukleniyor...';
            } else if (data.state === 'paused') {
                pill.className = '';
                text.textContent = 'Duraklatildi';
            } else if (data.state === 'error') {
                pill.className = 'error-state';
                text.textContent = data.detail || 'Yayin hatasi';
                ambient.className = '';
                ambSub.textContent = data.detail || 'Yayin acilamadi — YESIL tusla baska kaynak secebilirsiniz';
            }
        });
    }

    function reloadAllChannels(autoStartPlayback) {
        $('ambient-status').textContent = 'Canli TV kaynaklari yukleniyor...';
        NL.store.refreshAllSources(
            function onStatus(msg) { $('ambient-status').textContent = msg; },
            function onDone(err, count) {
                if (ui.mode === 'drawer') syncDrawerData(false);
                if (count === 0) {
                    $('ambient-status').textContent = 'Henuz kanal yok — MAVI tusla Nuvio QR giris yapin veya M3U ekleyin';
                    if (autoStartPlayback) openHubModal(0);
                    return;
                }
                $('ambient-status').textContent = count + ' canli kanal hazir';
                if (autoStartPlayback) {
                    var prefs = NL.storage.getPrefs();
                    var first = NL.store.getLastChannel();
                    if (prefs.autoPlayLast && first) {
                        playAndShowOsd(first);
                    } else {
                        openDrawer();
                    }
                }
            }
        );
    }

    function boot() {
        startClock();
        updateTopAccountBadge();
        syncTopInfoVisibility();
        NL.player.init();
        initDrawerLists();
        initSearchOsk();
        bindPlayerEvents();
        bindPointerSupport();
        NL.remote.init(handleAction);

        NL.auth.onChange(updateTopAccountBadge);
        NL.store.onChange(function (ev) {
            if (ev === 'epg' && ui.osdVisible) updateOsdEpg();
            if (ev === 'epg' && ui.mode === 'drawer') ui.chVList.render();
        });

        // If user has an existing Nuvio session, silently refresh addons in background
        if (NL.auth.isAuthenticated()) {
            NL.sync.syncAll(function () {
                updateTopAccountBadge();
                reloadAllChannels(true);
            });
        } else {
            reloadAllChannels(true);
        }
    }

    document.addEventListener('DOMContentLoaded', boot);
})(window);
