/* ==========================================================================
   Nuvio Live - Configuration & Defaults (Tizen 3.0 + Nuvio Backend)
   ========================================================================== */
(function (global) {
    'use strict';

    var NL = global.NuvioLive = global.NuvioLive || {};

    NL.CONFIG = {
        APP_NAME: 'Light Smart TV',
        APP_VERSION: '1.0.0',
        PLATFORM: 'tizen-3.0',

        // Official Nuvio Backend settings (from NuvioTVSmart local.properties)
        // Can also be overridden at runtime in Settings -> Nuvio Backend for self-host instances
        DEFAULT_BACKEND: {
            supabaseUrl: 'https://api.nuvio.tv',
            supabaseFallbackUrl: 'https://api-two.nuvioapp.space',
            supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgxNTIxMzQ2LCJleHAiOjE5MzkyMDEzNDZ9.tmQaj682pwzehpqlgCDMnySOqiUvpgRbrE43T4VJpDI',
            tvLoginWebBaseUrl: 'https://nuvio.tv/tv-login',
            deviceLoginWebBaseUrl: 'https://nuvio.tv/link',
            avatarPublicBaseUrl: 'https://api.nuvio.tv/storage/v1/object/public/avatars',
            selfHosted: false
        },

        // Polling & Timing
        QR_POLL_INTERVAL_MS: 3000,
        QR_SESSION_TTL_SEC: 300,
        OSD_AUTO_HIDE_MS: 5200,
        ZAP_DEBOUNCE_MS: 180,
        NUMBER_ZAP_COMMIT_MS: 1400,
        STREAM_RECONNECT_DELAY_MS: 3500,
        STREAM_MAX_RETRIES: 3,

        // Tizen 3.0 AVPlay live-streaming tuning
        AVPLAY_BUFFER_PLAY_SEC: 2,
        AVPLAY_BUFFER_RESUME_SEC: 3,

        // Storage keys
        KEYS: {
            BACKEND_CFG: 'nl_backend_cfg_v1',
            AUTH_SESSION: 'nl_auth_session_v1',
            ACTIVE_PROFILE: 'nl_active_profile_v1',
            NUVIO_ADDONS: 'nl_nuvio_addons_v1',
            CUSTOM_ADDONS: 'nl_custom_addons_v1',
            M3U_SOURCES: 'nl_m3u_sources_v1',
            XTREAM_SOURCES: 'nl_xtream_sources_v1',
            EPG_SOURCES: 'nl_epg_sources_v1',
            FAVORITES: 'nl_favorites_v1',
            RECENTS: 'nl_recents_v1',
            LAST_CHANNEL: 'nl_last_channel_v1',
            PREFS: 'nl_prefs_v1',
            DEVICE_ID: 'nl_device_id_v1'
        },

        // Built-in verified public Free-To-Air (FTA) Turkish & international HLS demo channels
        // so the TV app works immediately even before adding private playlists or Nuvio addons
        DEMO_CHANNELS: [
            {
                id: 'demo_trt1',
                number: 1,
                name: 'TRT 1 HD',
                group: 'Ulusal (Demo)',
                logo: '',
                tvgId: 'TRT1.tr',
                sourceName: 'Demo FTA',
                sourceType: 'demo',
                streams: [
                    { title: 'TRT 1 HLS 1080p', url: 'https://tv-trt1.medya.trt.com.tr/master.m3u8', quality: 'FHD', source: 'TRT Official' }
                ]
            },
            {
                id: 'demo_trthaber',
                number: 2,
                name: 'TRT Haber HD',
                group: 'Haber (Demo)',
                logo: '',
                tvgId: 'TRTHaber.tr',
                sourceName: 'Demo FTA',
                sourceType: 'demo',
                streams: [
                    { title: 'TRT Haber HLS', url: 'https://tv-trthaber.medya.trt.com.tr/master.m3u8', quality: 'FHD', source: 'TRT Official' }
                ]
            },
            {
                id: 'demo_trtspor',
                number: 3,
                name: 'TRT Spor HD',
                group: 'Spor (Demo)',
                logo: '',
                tvgId: 'TRTSpor.tr',
                sourceName: 'Demo FTA',
                sourceType: 'demo',
                streams: [
                    { title: 'TRT Spor HLS', url: 'https://tv-trtspor1.medya.trt.com.tr/master.m3u8', quality: 'FHD', source: 'TRT Official' }
                ]
            },
            {
                id: 'demo_trtspor2',
                number: 4,
                name: 'TRT Spor Yildiz',
                group: 'Spor (Demo)',
                logo: '',
                tvgId: 'TRTSporYildiz.tr',
                sourceName: 'Demo FTA',
                sourceType: 'demo',
                streams: [
                    { title: 'TRT Spor Yildiz HLS', url: 'https://tv-trtspor2.medya.trt.com.tr/master.m3u8', quality: 'HD', source: 'TRT Official' }
                ]
            },
            {
                id: 'demo_trtbelgesel',
                number: 5,
                name: 'TRT Belgesel HD',
                group: 'Belgesel (Demo)',
                logo: '',
                tvgId: 'TRTBelgesel.tr',
                sourceName: 'Demo FTA',
                sourceType: 'demo',
                streams: [
                    { title: 'TRT Belgesel HLS', url: 'https://tv-trtbelgesel.medya.trt.com.tr/master.m3u8', quality: 'FHD', source: 'TRT Official' }
                ]
            },
            {
                id: 'demo_trt2',
                number: 6,
                name: 'TRT 2 HD',
                group: 'Kultur & Sanat (Demo)',
                logo: '',
                tvgId: 'TRT2.tr',
                sourceName: 'Demo FTA',
                sourceType: 'demo',
                streams: [
                    { title: 'TRT 2 HLS', url: 'https://tv-trt2.medya.trt.com.tr/master.m3u8', quality: 'FHD', source: 'TRT Official' }
                ]
            },
            {
                id: 'demo_trtcocuk',
                number: 7,
                name: 'TRT Cocuk HD',
                group: 'Cocuk (Demo)',
                logo: '',
                tvgId: 'TRTCocuk.tr',
                sourceName: 'Demo FTA',
                sourceType: 'demo',
                streams: [
                    { title: 'TRT Cocuk HLS', url: 'https://tv-trtcocuk.medya.trt.com.tr/master.m3u8', quality: 'HD', source: 'TRT Official' }
                ]
            },
            {
                id: 'demo_trtworld',
                number: 8,
                name: 'TRT World HD',
                group: 'Haber (Demo)',
                logo: '',
                tvgId: 'TRTWorld.tr',
                sourceName: 'Demo FTA',
                sourceType: 'demo',
                streams: [
                    { title: 'TRT World HLS', url: 'https://tv-trtworld.medya.trt.com.tr/master.m3u8', quality: 'FHD', source: 'TRT Official' }
                ]
            }
        ]
    };
})(window);
