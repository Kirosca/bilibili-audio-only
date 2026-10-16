// ==UserScript==
// @name         Bilibili 纯音频模式（听视频省流量）
// @version      2.4.9
// @description  一键切换纯音频省流模式，全新上线网易云黑胶与小宇宙播客现代沉浸式UI；黑胶与播客双模式全面配备±15s前后进度微调；沉浸式单行轻量字幕与网易云全屏垂直平滑滚动歌词双模无缝切换；全面修复并重构浏览器高倍率缩放（Zoom/DPR变动）下的UI排版自适应、底栏三级弹性流式防溢出、黑胶唱盘与留声机唱针精密几何对齐、以及弹出菜单边缘防截断保护
// @author       Kirosca
// @license      MIT
// @icon         https://www.bilibili.com/favicon.ico
// @match        *://www.bilibili.com/video/*
// @match        *://www.bilibili.com/list/*
// @match        *://www.bilibili.com/bangumi/play/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    let isAudioMode = false;
    let isSwitchingMode = false;
    let currentAudioUrl = null;
    let currentAudioVideoKey = null; // 当前音源绑定的视频标识
    let audioBandwidth = 132000;   // 默认 bps
    let videoBandwidth = 2800000;  // 默认 bps
    let totalPlayedSeconds = 0;
    let currentVideoUsedBytes = 0;
    let currentVideoSavedBytes = 0;
    let currentVideoDuration = 0;
    let trafficTimer = null;

    let availableAudioTracks = [];
    let currentAudioQualityId = null;
    const STORAGE_KEY_PREFERRED_QUALITY = 'bili_audio_preferred_quality';

    let isVideoSwitchPending = false;
    let standbyAudioEl = null;
    let isSyncingToNativeVideo = false; // 音频向原视频同步标志锁（避免由脚本同步触发的 seeked 事件引起反向二次寻道震荡）
    let isAudioHandoverPending = false; // 音频初次装载/换源寻道交接屏障锁（防止 0 进度反向污染原视频与历史断点）
    let currentSwitchTransactionId = 0; // 模式切换事务令牌（严格防并发与防抖）

    // 苹果 SF Symbols 官方设计规范内联 SVG 矢量图标集（层次化质感、极致圆角、完美自适应深浅色主题）
    const ICONS = {
        HEADPHONES: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -3px; margin-right: 6px;"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" fill="currentColor" fill-opacity="0.16"/></svg>`,
        PLAY: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: -1px; margin-right: 5px;"><path d="M7.5 4.87c0-.77.85-1.24 1.5-.83l10.22 6.3c.63.39.63 1.3 0 1.69L9 18.33c-.65.41-1.5-.06-1.5-.83V4.87z"/></svg>`,
        PAUSE: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: -1px; margin-right: 5px;"><path d="M6 5a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5zm7 0a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2V5z"/></svg>`,
        SCREEN: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 5px;"><rect x="2" y="4" width="20" height="13" rx="2.5"/><path d="M8 20h8M12 17v3"/></svg>`,
        VIDEO: `<svg width="14" height="14" viewBox="0 0 24 24" fill="#ff6699" style="vertical-align: -2px; margin-right: 4px;"><path d="M4 5a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3v-1.8l4.4 2.64A1 1 0 0 0 22 16V8a1 1 0 0 0-1.6-.8L16 9.8V8a3 3 0 0 0-3-3H4z"/></svg>`,
        MUSIC: `<svg width="14" height="14" viewBox="0 0 24 24" fill="#00aeec" style="vertical-align: -2px; margin-right: 4px;"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h5V3h-7z"/></svg>`,
        BOLT: `<svg width="14" height="14" viewBox="0 0 24 24" fill="#4cd964" style="vertical-align: -2px; margin-right: 4px;"><path d="M11.67 1.25a1 1 0 0 0-.92.62l-7 13.5A1 1 0 0 0 4.64 17h6.08l-2.39 5.38a1 1 0 0 0 1.76.96l9.5-13.5a1 1 0 0 0-.89-1.59h-5.97l2.4-5.38a1 1 0 0 0-.46-1.12 1 1 0 0 0-.99-.05z"/></svg>`,
        REPEAT_ONE: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 5px;"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><path d="M11 9.5l1.5-1v7.5" stroke-width="2.2"/></svg>`,
        PIN: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: -2px; margin-right: 3px;"><path transform="rotate(45 12 12)" d="M16 3a1 1 0 0 1 1 1v1.5a1 1 0 0 1-.3.7L15 8v3l2.7 2.7a1 1 0 0 1 .3.7V16a1 1 0 0 1-1 1h-4v6a1 1 0 0 1-2 0v-6H7a1 1 0 0 1-1-1v-1.6a1 1 0 0 1 .3-.7L9 11V8l-1.7-1.8a1 1 0 0 1-.3-.7V4a1 1 0 0 1 1-1h8z"/></svg>`,
        GLOBE: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 3px;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
        TRASH: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: -1px; margin-right: 3px;"><path d="M9 3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1h5a1 1 0 0 1 0 2h-1.07l-1.2 13.17A3 3 0 0 1 13.75 22H10.25a3 3 0 0 1-2.98-2.83L6.07 6H5a1 1 0 0 1 0-2h5V3zm2 1h2V3h-2v1zm-2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 2 0v-8a1 1 0 0 0-1-1zm6 0a1 1 0 0 0-1 1v8a1 1 0 0 0 2 0v-8a1 1 0 0 0-1-1z"/></svg>`,
        VOLUME_HIGH: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`,
        VOLUME_MUTE: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`,
        DOWNLOAD: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 3px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
        BACKWARD_15: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -3px;"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/><text x="12" y="15.5" font-size="8" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">15</text></svg>`,
        FORWARD_15: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -3px;"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/><text x="12" y="15.5" font-size="8" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">15</text></svg>`,
        PODCAST: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>`,
        DISC: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>`,
        THEME_SWITCH: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 3px;"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/><circle cx="12" cy="12" r="4"/></svg>`,
        SETTINGS: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px;"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
        CHEVRON_UP: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-left: 2px;"><polyline points="18 15 12 9 6 15"></polyline></svg>`,
        PLAY_ROUND: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: -1px; margin-left: 2px;"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>`,
        PAUSE_ROUND: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: -1px;"><rect x="6" y="4" width="4" height="16" rx="1.5"></rect><rect x="14" y="4" width="4" height="16" rx="1.5"></rect></svg>`,
        LOOP: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px;"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><path d="M11 9.5l1.5-1v7.5" stroke-width="2.2"/></svg>`,
        SUBTITLE: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 2px;"><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="7" y1="15" x2="11" y2="15"/><line x1="13" y1="15" x2="17" y2="15"/><line x1="7" y1="11" x2="17" y2="11"/></svg>`
    };

    // 大面板视觉风格管理（播客卡片 podcast / 黑胶唱机 vinyl）
    const STORAGE_KEY_PANEL_THEME_STYLE = 'bili_audio_panel_theme_style_v1';
    function getPanelThemeStyle() {
        try {
            return localStorage.getItem(STORAGE_KEY_PANEL_THEME_STYLE) || 'podcast';
        } catch {
            return 'podcast';
        }
    }
    function setPanelThemeStyle(style) {
        try {
            localStorage.setItem(STORAGE_KEY_PANEL_THEME_STYLE, style);
        } catch {}
    }

    // 音量与静音记忆系统及双向防暴音同步控制
    const STORAGE_KEY_USER_VOLUME = 'bili_audio_user_volume';
    const STORAGE_KEY_USER_MUTED = 'bili_audio_user_muted';
    let isSyncingVolume = false;

    function saveUserVolume(volume, muted) {
        if (typeof volume === 'number' && !isNaN(volume)) {
            try {
                localStorage.setItem(STORAGE_KEY_USER_VOLUME, String(volume));
                localStorage.setItem(STORAGE_KEY_USER_MUTED, muted ? 'true' : 'false');
            } catch {}
        }
    }

    function getSavedUserVolume() {
        // 1. 优先读取脚本自身记录的用户明确调节音量
        try {
            const saved = localStorage.getItem(STORAGE_KEY_USER_VOLUME);
            if (saved !== null) {
                const val = parseFloat(saved);
                if (!isNaN(val) && val >= 0 && val <= 1) {
                    return val;
                }
            }
        } catch {}

        // 2. 其次读取 B 站官方播放器 profile 中的历史音量
        try {
            const profile = JSON.parse(localStorage.getItem('bpx_player_profile') || '{}');
            if (typeof profile.volume === 'number' && !isNaN(profile.volume) && profile.volume >= 0 && profile.volume <= 1) {
                return profile.volume;
            }
        } catch {}

        // 3. 再次读取 B 站官方播放器设置中的历史音量
        try {
            const biliSettings = JSON.parse(localStorage.getItem('bilibili_player_settings') || '{}');
            const v = biliSettings?.video_status?.volume;
            if (typeof v === 'number' && !isNaN(v) && v >= 0 && v <= 1) {
                return v;
            }
        } catch {}

        // 4. 再次检查原视频当前音量（若原视频存在且已被官方初始化为非 1.0 音量）
        const origVideo = getOriginalVideo();
        if (origVideo && typeof origVideo.volume === 'number' && origVideo.volume < 1) {
            return origVideo.volume;
        }

        // 5. 兜底合理中等音量，杜绝无脑突发 100% 暴音
        return 0.6;
    }

    function getSavedUserMuted() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_USER_MUTED);
            if (saved !== null) return saved === 'true';
        } catch {}
        // 用户从未在大面板显式静音过，坚决不静音（杜绝被 B 站无交互 Autoplay 策略或临时防串音误导）
        return false;
    }

    function syncVolumeVideoToAudio() {
        const origVideo = getOriginalVideo();
        if (!origVideo || !customAudioEl || isSyncingVolume) return;
        try {
            isSyncingVolume = true;
            const savedVol = getSavedUserVolume();
            const savedMuted = getSavedUserMuted();

            // 若原视频已被系统级静音（例如换视频防串音或无手势 Autoplay），坚决不采信原视频的静音状态
            let vol = (typeof origVideo.volume === 'number' && origVideo.volume > 0) ? origVideo.volume : savedVol;
            customAudioEl.volume = vol;
            customAudioEl.muted = savedMuted;
        } catch {} finally {
            isSyncingVolume = false;
        }
    }

    function syncVolumeAudioToVideo() {
        const origVideo = getOriginalVideo();
        if (!origVideo || !customAudioEl || isSyncingVolume) return;
        try {
            isSyncingVolume = true;
            origVideo.volume = customAudioEl.volume;
            // 仅在非音频模式（或切回看视频）时才将静音状态同步给原视频
            if (!isAudioMode) {
                origVideo.muted = customAudioEl.muted;
            }
            saveUserVolume(customAudioEl.volume, customAudioEl.muted);
        } catch {} finally {
            isSyncingVolume = false;
        }
    }

    function getStandbyAudio() {
        if (!standbyAudioEl) {
            standbyAudioEl = document.createElement('audio');
            standbyAudioEl.id = 'bili-standby-audio';
            standbyAudioEl.style.display = 'none';
            standbyAudioEl.loop = getRepeatState();
            standbyAudioEl.volume = getSavedUserVolume();
            standbyAudioEl.muted = getSavedUserMuted();
            (document.body || document.documentElement).appendChild(standbyAudioEl);
        }
        return standbyAudioEl;
    }

    let customAudioEl = null;
    let audioPanelEl = null;
    let toggleBtnEl = null;
    let checkPageChange = null;

    // 寻道防护锁与防抖定时器（杜绝调整进度时播放/暂停按钮闪烁）
    let isSeekingOperation = false;
    let seekSettleTimer = null;
    let pauseDebounceTimer = null;

    // 单曲循环 / 洗脑循环与 B 站官方原生播放器双向深度联动
    const STORAGE_KEY_LOOP_ENABLED = 'bili_audio_loop_enabled';
    let isLoopEnabled = false;
    let isSyncingRepeat = false;

    // 初始化读取循环配置：优先官方 profile，兜底独立存储
    function getInitialLoopState() {
        try {
            const profile = JSON.parse(localStorage.getItem('bpx_player_profile') || '{}');
            if (typeof profile.repeat === 'boolean') return profile.repeat;
            if (typeof profile.repeat === 'number') return profile.repeat === 1;
        } catch {}
        try {
            return localStorage.getItem(STORAGE_KEY_LOOP_ENABLED) === 'true';
        } catch {
            return false;
        }
    }

    isLoopEnabled = getInitialLoopState();

    function getRepeatState() {
        return isLoopEnabled;
    }

    // 查找 B 站官方原生播放器循环控制元素（支持现代 bpx 播放器设置面板 bui-switch、控制栏按钮、右键菜单项）
    function getNativeRepeatElement() {
        // 1. 首选：B 站设置面板中的 bui-switch 开关控件（标准官方单集/洗脑循环入口）
        const buiInput = document.querySelector(
            '.bui-switch-input[aria-label="洗脑循环"], ' +
            '.bui-switch-input[aria-label="单集循环"], ' +
            '.bpx-player-ctrl-setting-loop input, ' +
            'input[aria-label="洗脑循环"], ' +
            'input[aria-label="单集循环"], ' +
            '.bpx-player-ctrl-setting-loop .bui-switch, ' +
            '.bpx-player-ctrl-setting-loop'
        );
        if (buiInput) return buiInput;

        // 2. 备选：带有相关语义 aria-label 或 title 的控制按钮
        const ctrlBtn = document.querySelector(
            '.bpx-player-ctrl-repeat, .bilibili-player-video-btn-repeat, ' +
            '[aria-label*="单集循环"], [title*="单集循环"], [data-text*="单集循环"], ' +
            '[aria-label*="洗脑循环"], [title*="洗脑循环"], [data-text*="洗脑循环"]'
        );
        if (ctrlBtn) return ctrlBtn;

        // 3. 右键菜单中的循环项
        const menuItems = document.querySelectorAll('.bpx-player-contextmenu li, .bilibili-player-context-menu li');
        for (const item of menuItems) {
            if (item.textContent && (item.textContent.includes('洗脑循环') || item.textContent.includes('单集循环'))) {
                return item;
            }
        }

        return null;
    }

    // 检测官方循环控件的当前真实激活状态
    function isNativeRepeatActive(elem) {
        if (!elem) elem = getNativeRepeatElement();
        if (!elem) return isLoopEnabled;

        if (elem.tagName === 'INPUT') {
            return Boolean(elem.checked);
        }
        const innerInput = elem.querySelector ? elem.querySelector('input') : null;
        if (innerInput) {
            return Boolean(innerInput.checked);
        }

        if (elem.classList.contains('bui-switch')) {
            return elem.classList.contains('bui-switch-active') || elem.classList.contains('bui-switch-checked');
        }

        return elem.classList.contains('bpx-state-active') ||
               elem.classList.contains('active') ||
               elem.getAttribute('aria-pressed') === 'true' ||
               elem.getAttribute('aria-checked') === 'true';
    }

    // 将循环状态同步至 B 站官方播放器（带防反弹锁）
    function triggerNativeRepeatSwitch(targetState) {
        if (isSyncingRepeat) return;
        isSyncingRepeat = true;

        try {
            // A. 同步官方本地 profile 配置
            try {
                const profile = JSON.parse(localStorage.getItem('bpx_player_profile') || '{}');
                profile.repeat = targetState;
                localStorage.setItem('bpx_player_profile', JSON.stringify(profile));
            } catch {}

            // B. 尝试调用官方 API
            try {
                if (window.player && typeof window.player.repeat === 'function') {
                    window.player.repeat(targetState);
                }
            } catch {}

            // C. 模拟点击官方开关控件（仅单次原生 click，杜绝重复撤销）
            const elem = getNativeRepeatElement();
            if (elem) {
                const currentActive = isNativeRepeatActive(elem);
                if (currentActive !== targetState) {
                    const clickTarget = (elem.tagName === 'INPUT' || !elem.querySelector('input')) ? elem : elem.querySelector('input');
                    if (typeof clickTarget.click === 'function') {
                        clickTarget.click();
                    }
                }
            }
        } catch {
        } finally {
            // 延时解除防重锁，彻底杜绝官方内部状态更新引发回弹
            setTimeout(() => {
                isSyncingRepeat = false;
            }, 120);
        }
    }

    // 绑定原生循环开关事件，当用户在官方设置界面操作时反向同步大面板
    function bindNativeRepeatListener() {
        const elem = getNativeRepeatElement();
        if (!elem) return;

        const targets = [elem];
        if (elem.parentElement) targets.push(elem.parentElement);
        const innerInput = elem.querySelector ? elem.querySelector('input') : null;
        if (innerInput) targets.push(innerInput);

        targets.forEach(t => {
            if (t && !t._biliRepeatBound) {
                t._biliRepeatBound = true;
                const onNativeUserAction = () => {
                    // 若处于大面板向官方同步的过程中，忽略回弹
                    if (isSyncingRepeat) return;
                    setTimeout(() => {
                        if (isSyncingRepeat) return;
                        const newState = isNativeRepeatActive(elem);
                        setRepeatState(newState, false);
                    }, 50);
                };
                t.addEventListener('click', onNativeUserAction);
                t.addEventListener('change', onNativeUserAction);
            }
        });
    }

    // 设置循环状态（大面板权威控制，绝对不会被未初始化的官方状态误弹回）
    function setRepeatState(enable, syncToNative = true) {
        isLoopEnabled = Boolean(enable);

        // 1. 本地持久化保存
        try {
            localStorage.setItem(STORAGE_KEY_LOOP_ENABLED, isLoopEnabled ? 'true' : 'false');
        } catch {}

        // 2. 立即同步音频播放器元素循环属性
        if (customAudioEl) {
            customAudioEl.loop = isLoopEnabled;
        }
        if (standbyAudioEl) {
            standbyAudioEl.loop = isLoopEnabled;
        }

        // 3. 立即同步原视频元素
        const origVideo = getOriginalVideo();
        if (origVideo) {
            origVideo.loop = isLoopEnabled;
        }

        // 4. 立即更新大面板循环 UI（滑动开关与图标按钮双向同步）
        if (audioPanelEl) {
            const loopSwitch = audioPanelEl.querySelector('#bili-setting-loop-switch');
            if (loopSwitch && loopSwitch.checked !== isLoopEnabled) {
                loopSwitch.checked = isLoopEnabled;
            }
            const loopBtn = audioPanelEl.querySelector('#bili-btn-loop-mode');
            if (loopBtn) {
                loopBtn.style.color = isLoopEnabled ? '#00aeec' : 'inherit';
                loopBtn.style.borderColor = isLoopEnabled ? '#00aeec' : 'rgba(127,127,127,0.2)';
                loopBtn.style.background = isLoopEnabled ? 'rgba(0,174,236,0.15)' : 'transparent';
            }
        }

        // 5. 若需要联动官方播放器，触发主动通知
        if (syncToNative) {
            triggerNativeRepeatSwitch(isLoopEnabled);
        }
    }

    // 绑定原视频事件（音量双向同步 + 切视频生命周期感知 + 音频模式下防误播放保护）
    function bindVideoEventListeners(video) {
        if (!video || video._biliAudioBound) return;
        video._biliAudioBound = true;

        video.addEventListener('volumechange', () => {
            if (isSyncingVolume || isAudioMode) return;
            saveUserVolume(video.volume, video.muted);
        });

        // 原生播放器加载新流时，主动触发视频切换检测
        video.addEventListener('loadstart', () => {
            if (typeof checkPageChange === 'function') {
                checkPageChange();
            }
        });
        video.addEventListener('loadedmetadata', () => {
            if (typeof checkPageChange === 'function') {
                checkPageChange();
            }
        });

        video.addEventListener('play', () => {
            if (isAudioMode) {
                // 若处于换视频等待新音源阶段，先静音原视频保持加载管线畅通，待新音源到达后自动接力暂停
                if (isVideoSwitchPending && !currentAudioUrl) {
                    video.muted = true;
                } else {
                    video.pause();
                }
            }
        });

        const handleNativeVideoSeek = () => {
            // 若当前 seek 是脚本由音频主动同步给原视频的，跳过反向触发
            if (isSyncingToNativeVideo) return;

            // 若正处于初次握手交接期（音频仍在换源加载中），若原生播放器触发了 seek（如 B 站官方自动恢复历史进度）
            if (isAudioHandoverPending) {
                const origTime = video.currentTime;
                if (Number.isFinite(origTime) && origTime > 0.5 && customAudioEl) {
                    try {
                        customAudioEl.currentTime = origTime;
                    } catch {}
                }
                return;
            }

            // 当且仅当音频模式开启、未在换视频过渡中且非自定义卡片拖拽中
            if (isAudioMode && customAudioEl && !isSeekingOperation && !isVideoSwitchPending) {
                const origTime = video.currentTime;
                if (!Number.isFinite(origTime)) return;
                const dur = (typeof getCurrentMediaDuration === 'function') ? getCurrentMediaDuration() : (customAudioEl.duration || 0);
                const validDur = (Number.isFinite(dur) && dur > 0) ? dur : 0;
                // 排除接近尾声与越界的 seek，避免把音频推向结束
                if (validDur > 3 && origTime >= validDur - 3) return;

                // 外部主动寻道检测（包括用户点击原生底栏进度条、键盘左右方向键快退快进、B 站官方恢复历史断点）：
                // 只要与当前音频进度相差超过 0.5 秒，音频立即跟随原视频寻道目标，实现双向 100% 实时同步！
                if (Math.abs(origTime - customAudioEl.currentTime) > 0.5) {
                    try {
                        customAudioEl.currentTime = origTime;
                    } catch {}
                    if (typeof updateCustomPlayerUI === 'function') {
                        updateCustomPlayerUI();
                    }
                    if (typeof syncAudioProgressToVideoAndStorage === 'function') {
                        syncAudioProgressToVideoAndStorage(true, null, false);
                    }
                }
            }
        };

        video.addEventListener('seeked', handleNativeVideoSeek);
    }

    // 唤醒 B 站播放器原生播放
    function triggerBiliPlay() {
        try {
            if (window.player && typeof window.player.play === 'function') {
                window.player.play();
                return;
            }
        } catch {}

        const playBtn = document.querySelector('.bpx-player-ctrl-play, .bilibili-player-video-btn-start');
        const origVideo = getOriginalVideo();
        if (playBtn && origVideo && origVideo.paused) {
            playBtn.click();
        }
    }

    // 音频播放状态与面板按钮文本同步（寻道过程中静默，防按钮闪烁）
    function updatePlayPauseBtnState(force = false) {
        if (!audioPanelEl || !customAudioEl) return;
        // 寻道操作期间（包括拖拽与寻道平息期），除用户显式操作外，坚决锁定按钮，禁止任何重绘闪烁
        if (!force && (isSeekingOperation || customAudioEl.seeking)) return;

        const btn = audioPanelEl.querySelector('#bili-btn-play-pause');
        if (!btn) return;
        const isPaused = customAudioEl.paused;
        const isDark = isBiliDarkMode();

        btn.innerHTML = isPaused ? ICONS.PLAY_ROUND : ICONS.PAUSE_ROUND;
        btn.style.background = '#00aeec';
        btn.style.color = '#ffffff';
        btn.style.border = 'none';
        btn.title = isPaused ? '播放 (空格键)' : '暂停 (空格键)';

        // 网易云黑胶唱片旋转与唱针起落动效联动
        const discEl = audioPanelEl.querySelector('#bili-vinyl-disc');
        const needleEl = audioPanelEl.querySelector('#bili-vinyl-needle-wrap');
        if (discEl) {
            discEl.style.animationPlayState = isPaused ? 'paused' : 'running';
        }
        if (needleEl) {
            needleEl.style.transform = isPaused ? 'rotate(-73deg)' : 'rotate(-45deg)';
        }

        // 小宇宙播客大卡片微动效与状态联动
        const podcastArtwork = audioPanelEl.querySelector('#bili-podcast-artwork');
        const podcastGlow = audioPanelEl.querySelector('#bili-podcast-ambient-glow');
        const podcastBadgeText = audioPanelEl.querySelector('#bili-podcast-badge-text');
        if (podcastArtwork) {
            podcastArtwork.style.transform = isPaused ? 'scale(1)' : 'scale(1.02)';
            podcastArtwork.style.boxShadow = isPaused 
                ? (isDark ? '0 8px 24px rgba(0,0,0,0.45)' : '0 8px 24px rgba(0,0,0,0.12)')
                : (isDark ? '0 16px 36px rgba(0,174,236,0.22), 0 8px 24px rgba(0,0,0,0.5)' : '0 16px 36px rgba(0,174,236,0.18), 0 8px 24px rgba(0,0,0,0.15)');
        }
        if (podcastGlow) {
            podcastGlow.style.opacity = isPaused ? '0.25' : '0.6';
        }
        if (podcastBadgeText) {
            podcastBadgeText.textContent = isPaused ? '已暂停' : '正在收听';
        }
    }

    // 寻道防护：处理音频暂停事件（防抖过滤寻道瞬态的虚假暂停）
    function handleAudioPause() {
        if (isSeekingOperation || (customAudioEl && customAudioEl.seeking)) {
            return;
        }
        if (pauseDebounceTimer) clearTimeout(pauseDebounceTimer);
        pauseDebounceTimer = setTimeout(() => {
            if (isSeekingOperation || !customAudioEl || customAudioEl.seeking || !customAudioEl.paused) {
                return;
            }
            flushCurrentTrafficStats();
            syncAudioProgressToVideoAndStorage(true);
            updatePlayPauseBtnState();
        }, 120);
    }

    // 寻道防护：处理音频播放与发声事件
    function handleAudioPlayOrPlaying() {
        if (pauseDebounceTimer) {
            clearTimeout(pauseDebounceTimer);
            pauseDebounceTimer = null;
        }
        if (seekSettleTimer) {
            clearTimeout(seekSettleTimer);
            seekSettleTimer = null;
        }
        isSeekingOperation = false;
        updatePlayPauseBtnState();
    }

    // 0. 记忆存储与配置管理（全局默认开关 + 单视频独立记忆 LRU 上限 500）
    const STORAGE_KEY_GLOBAL_DEFAULT = 'bili_audio_global_default';
    const STORAGE_KEY_LRU_MEMORY = 'bili_audio_video_memory_v1';
    const MAX_MEMORY_LIMIT = 500;

    function getGlobalDefault() {
        try {
            return localStorage.getItem(STORAGE_KEY_GLOBAL_DEFAULT) === 'true';
        } catch {
            return false;
        }
    }

    function setGlobalDefault(enabled) {
        try {
            localStorage.setItem(STORAGE_KEY_GLOBAL_DEFAULT, enabled ? 'true' : 'false');
        } catch {}
    }

    function loadMemoryList() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_LRU_MEMORY);
            if (!raw) return [];
            const list = JSON.parse(raw);
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    }

    function saveMemoryList(list) {
        try {
            localStorage.setItem(STORAGE_KEY_LRU_MEMORY, JSON.stringify(list.slice(0, MAX_MEMORY_LIMIT)));
        } catch {}
    }

    // 获取当前播放视频/分P的唯一标识（不论多 P 均独立生成标识，按新视频逻辑处理）
    function getVideoKey() {
        // 番剧 ep 与 ss 标识
        const epMatch = location.pathname.match(/\/(ep\d+)/i);
        if (epMatch) return epMatch[1].toLowerCase();
        const ssMatch = location.pathname.match(/\/(ss\d+)/i);
        if (ssMatch) {
            const sp = new URLSearchParams(location.search);
            const ep = sp.get('ep_id') || '';
            return `${ssMatch[1].toLowerCase()}${ep ? '_ep' + ep : ''}`;
        }

        // 普通稿件 bvid + 分P 标识
        let bvid = null;
        const bvidPathMatch = location.pathname.match(/\/(BV[a-zA-Z0-9]+)/i);
        if (bvidPathMatch) {
            bvid = bvidPathMatch[1];
        } else {
            const sp = new URLSearchParams(location.search);
            if (sp.has('bvid')) bvid = sp.get('bvid');
        }

        if (bvid) {
            const sp = new URLSearchParams(location.search);
            const p = sp.get('p') || '1';
            return `${bvid.toLowerCase()}_p${p}`;
        }

        // 兜底方案
        const p = new URLSearchParams(location.search).get('p') || '1';
        return `${location.pathname.replace(/\/+$/, '')}_p${p}`.toLowerCase();
    }

    // 获取单视频记忆（纯只读查询，杜绝读取时频繁写盘）
    function getVideoMemory(videoKey) {
        if (!videoKey) return undefined;
        const list = loadMemoryList();
        const item = list.find(entry => entry.key === videoKey);
        return item ? item.enabled : undefined;
    }

    // 保存单视频记忆（新记录插在最前，超出 500 自动淘汰最旧数据）
    function setVideoMemory(videoKey, enabled) {
        if (!videoKey) return;
        const list = loadMemoryList();
        const idx = list.findIndex(entry => entry.key === videoKey);
        if (idx !== -1) {
            list.splice(idx, 1);
        }
        list.unshift({ key: videoKey, enabled: Boolean(enabled) });
        saveMemoryList(list);
    }

    // 清除单视频独立记忆
    function clearVideoMemory(videoKey) {
        if (!videoKey) return;
        const list = loadMemoryList();
        const filtered = list.filter(entry => entry.key !== videoKey);
        saveMemoryList(filtered);
    }

    // 状态判定：先读取独立记忆，无记忆按默认开关
    function shouldAudioModeBeActive(videoKey = getVideoKey()) {
        const mem = getVideoMemory(videoKey);
        if (mem !== undefined) {
            return { active: mem, source: 'memory' };
        }
        return { active: getGlobalDefault(), source: 'default' };
    }

    // 播放进度断点记忆与原视频同步管理（LRU 上限 500）
    const STORAGE_KEY_PLAY_PROGRESS = 'bili_audio_video_progress_v1';
    const MAX_PROGRESS_LIMIT = 500;
    let lastProgressSyncTimestamp = 0;

    function loadProgressList() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_PLAY_PROGRESS);
            if (!raw) return [];
            const list = JSON.parse(raw);
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    }

    function saveProgressList(list) {
        try {
            localStorage.setItem(STORAGE_KEY_PLAY_PROGRESS, JSON.stringify(list.slice(0, MAX_PROGRESS_LIMIT)));
        } catch {}
    }

    function getVideoProgress(videoKey, currentDuration = 0) {
        if (!videoKey) return 0;
        const list = loadProgressList();
        const item = list.find(entry => entry.key === videoKey);
        if (!item || typeof item.time !== 'number' || isNaN(item.time)) return 0;

        const dur = (currentDuration > 0) ? currentDuration : (item.duration || 0);
        // 若断点记录已接近视频尾声（离结束不到 3 秒）或已超过总时长，视作已播完，自动清理并归零
        if (dur > 3 && item.time >= dur - 3) {
            const idx = list.indexOf(item);
            if (idx !== -1) {
                list.splice(idx, 1);
                saveProgressList(list);
            }
            return 0;
        }

        return item.time > 0 ? item.time : 0;
    }

    function setVideoProgress(videoKey, time, duration = 0) {
        if (!videoKey || typeof time !== 'number' || isNaN(time)) return;
        const list = loadProgressList();
        const idx = list.findIndex(entry => entry.key === videoKey);
        if (idx !== -1) {
            list.splice(idx, 1);
        }

        // 如果播放时间已接近尾声（离结束不到 3 秒）或者小于 1 秒，重置为 0 从头开始
        if (duration > 3 && time >= duration - 3) {
            saveProgressList(list);
            return;
        }

        if (time >= 1) {
            list.unshift({
                key: videoKey,
                time: Math.floor(time * 10) / 10,
                duration: Math.floor(duration || 0),
                updatedAt: Date.now()
            });
        }
        saveProgressList(list);
    }

    function getBestStartingTime(videoKey = getVideoKey()) {
        const dur = (typeof getCurrentMediaDuration === 'function') ? getCurrentMediaDuration() : 0;
        const origVideo = getOriginalVideo();
        const savedProgress = getVideoProgress(videoKey, dur);

        // 如果处于切视频挂起中，或者当前音频流标识与待播放视频不一致，原视频的时间绝不可信
        const isSwitching = isVideoSwitchPending || (currentAudioVideoKey && currentAudioVideoKey !== videoKey);

        let origTime = 0;
        if (!isSwitching && origVideo && Number.isFinite(origVideo.currentTime)) {
            origTime = origVideo.currentTime;
            // 校验原视频时间：若原视频已播完到结尾（离结束不到 3 秒）或溢出总时长，则视为无效
            if (dur > 3 && origTime >= dur - 3) {
                origTime = 0;
            }
        }

        let bestTime = 0;
        // 若原视频已有真实有效播放进度（看视频模式下正常播到此），优先采用原视频实时时间
        if (origTime > 1) {
            bestTime = origTime;
        } else if (savedProgress > 1) {
            // 否则恢复本地历史断点
            bestTime = savedProgress;
        } else if (origTime > 0) {
            bestTime = origTime;
        }

        // 最终安全防线：若计算出的时间接近视频尾声或越界，强制归零
        if (dur > 3 && bestTime >= dur - 3) {
            return 0;
        }
        return bestTime > 0 ? bestTime : 0;
    }

    // 将音频当前播放进度实时双向同步给原视频和本地断点存储
    function syncAudioProgressToVideoAndStorage(force = false, targetKey = null, syncToNativeVideo = true) {
        if (!customAudioEl) return;
        // 核心屏障：握手交接未完成前（音频未就绪寻道完毕），严禁任何向原视频与断点存储的回写，彻底消灭 0 秒倒灌！
        if (isAudioHandoverPending && !force) return;

        const curTime = customAudioEl.currentTime;
        if (!Number.isFinite(curTime)) return;
        // 安全防线：媒体初始化或刚换源时产生的瞬时 0 进度（<= 0.05秒），非显式强制清零下坚决拒绝回写
        if (curTime <= 0.05 && !force) return;

        const dur = (typeof getCurrentMediaDuration === 'function') ? getCurrentMediaDuration() : (customAudioEl.duration || 0);
        const activeKey = targetKey || currentAudioVideoKey || getVideoKey();
        if (!activeKey) return;

        // 安全屏障：如果未显式指定 targetKey，且当前音频绑定的视频标识与待写入的 activeKey 不符，
        // 说明当前音频属于旧视频，绝不可向新视频写入该进度！
        if (!targetKey && currentAudioVideoKey && activeKey !== currentAudioVideoKey) {
            return;
        }

        const now = Date.now();

        // 节流控制：非强制同步下每 2 秒最多同步一次原视频与写盘
        if (force || now - lastProgressSyncTimestamp >= 2000) {
            lastProgressSyncTimestamp = now;

            // 1. 本地断点记录
            setVideoProgress(activeKey, curTime, dur);

            // 2. 双向同步回原视频（仅当允许同步、且 activeKey 确为当前页面正在播放的视频时）
            if (syncToNativeVideo && activeKey === getVideoKey()) {
                const origVideo = getOriginalVideo();
                if (origVideo) {
                    // 若音频进度已在视频末尾，不同步以免把原生视频推向结束
                    if (Number.isFinite(dur) && dur > 3 && curTime >= dur - 3) return;
                    if (Math.abs(origVideo.currentTime - curTime) > 0.8) {
                        isSyncingToNativeVideo = true;
                        try {
                            origVideo.currentTime = curTime;
                            origVideo.dispatchEvent(new Event('timeupdate'));
                        } catch {}
                        // 健壮性保障：监听原生视频真实的 seeked 事件精准释放互斥锁，配 500ms 超时兜底，消灭固定 120ms 的乒乓震荡
                        const releaseLock = () => {
                            origVideo.removeEventListener('seeked', releaseLock);
                            isSyncingToNativeVideo = false;
                        };
                        origVideo.addEventListener('seeked', releaseLock, { once: true });
                        setTimeout(releaseLock, 500);
                    }
                }
            }
        }
    }

    // 流量统计会话存储管理（sessionStorage：刷新页面保留，关闭当前窗口/标签页自动销毁，LRU 上限 500）
    const STORAGE_KEY_TRAFFIC_STATS = 'bili_audio_traffic_stats_session_v1';
    const MAX_TRAFFIC_LIMIT = 500;

    // 清理此前 localStorage 旧版本遗留键值
    try { localStorage.removeItem('bili_audio_traffic_stats_v1'); } catch {}

    function loadTrafficStatsList() {
        try {
            const raw = sessionStorage.getItem(STORAGE_KEY_TRAFFIC_STATS);
            if (!raw) return [];
            const list = JSON.parse(raw);
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    }

    function saveTrafficStatsList(list) {
        try {
            sessionStorage.setItem(STORAGE_KEY_TRAFFIC_STATS, JSON.stringify(list.slice(0, MAX_TRAFFIC_LIMIT)));
        } catch {}
    }

    function loadVideoTrafficStats(videoKey) {
        if (!videoKey) return { seconds: 0, usedBytes: 0, savedBytes: 0 };
        const list = loadTrafficStatsList();
        const item = list.find(entry => entry.key === videoKey);
        if (!item) return { seconds: 0, usedBytes: 0, savedBytes: 0 };

        const sec = typeof item.seconds === 'number' && item.seconds >= 0 ? item.seconds : 0;
        const used = typeof item.usedBytes === 'number' && item.usedBytes >= 0
            ? item.usedBytes
            : Math.round((audioBandwidth / 8) * sec);
        const saved = typeof item.savedBytes === 'number' && item.savedBytes >= 0
            ? item.savedBytes
            : Math.round(Math.max(0, (videoBandwidth - audioBandwidth) / 8 * sec));

        return { seconds: sec, usedBytes: used, savedBytes: saved };
    }

    function saveVideoTrafficStats(videoKey, stats) {
        if (!videoKey || !stats) return;
        const list = loadTrafficStatsList();
        const idx = list.findIndex(entry => entry.key === videoKey);
        if (idx !== -1) {
            list.splice(idx, 1);
        }
        list.unshift({
            key: videoKey,
            seconds: Math.floor(stats.seconds || 0),
            usedBytes: Math.round(stats.usedBytes || 0),
            savedBytes: Math.round(stats.savedBytes || 0),
            updatedAt: Date.now()
        });
        saveTrafficStatsList(list);
    }

    function flushCurrentTrafficStats(targetKey = getVideoKey()) {
        if (!targetKey) return;
        if (currentVideoUsedBytes > 0 || currentVideoSavedBytes > 0 || totalPlayedSeconds > 0) {
            saveVideoTrafficStats(targetKey, {
                seconds: totalPlayedSeconds,
                usedBytes: currentVideoUsedBytes,
                savedBytes: currentVideoSavedBytes
            });
        }
    }

    function restoreTrafficStatsForCurrentVideo(targetKey = getVideoKey()) {
        const stats = loadVideoTrafficStats(targetKey);
        totalPlayedSeconds = stats.seconds;
        currentVideoUsedBytes = stats.usedBytes;
        currentVideoSavedBytes = stats.savedBytes;
        updateTrafficDisplay();
    }

    // 内存元数据缓存字典（key 为 videoKey，缓存当前视频已拉取的封面与权威标题）
    const videoMetaCache = new Map();

    // 获取当前页面的 BVID
    function getCurrentBvid() {
        const bvidPathMatch = location.pathname.match(/\/(BV[a-zA-Z0-9]+)/i);
        if (bvidPathMatch) return bvidPathMatch[1];
        const sp = new URLSearchParams(location.search);
        return sp.get('bvid') || '';
    }

    // 提取当前视频的封面与曲目标题（供网易云黑胶大唱片展示）
    function getCurrentVideoMeta() {
        const currentKey = getVideoKey();
        if (videoMetaCache.has(currentKey)) {
            const cached = videoMetaCache.get(currentKey);
            if (cached && (cached.title || cached.cover)) {
                return cached;
            }
        }

        let title = '';
        let cover = '';
        const currentBvid = getCurrentBvid();
        const currentP = new URLSearchParams(location.search).get('p') || '1';

        // 1. SSR 初始状态校验（必须严格匹配当前页面的 BVID，杜绝 SPA 切视频后沿用老视频数据）
        try {
            const initState = window.__INITIAL_STATE__;
            if (initState?.videoData && currentBvid) {
                const initBvid = (initState.videoData.bvid || '').toLowerCase();
                if (initBvid === currentBvid.toLowerCase()) {
                    let baseTitle = initState.videoData.title || '';
                    const pIdx = parseInt(currentP, 10) - 1;
                    if (initState.videoData.pages && initState.videoData.pages.length > 1 && initState.videoData.pages[pIdx]?.part) {
                        baseTitle = `${baseTitle} - P${currentP} ${initState.videoData.pages[pIdx].part}`;
                    }
                    title = baseTitle;
                    cover = initState.videoData.pic || '';
                }
            } else if (initState?.epInfo) {
                title = initState.epInfo.share_copy || initState.h1Title || '';
                cover = initState.epInfo.cover || '';
            }
        } catch {}

        // 2. 实时 DOM 提取（最具备真实性的第一真理来源）
        if (!title) {
            try {
                // 普通视频标题
                const h1 = document.querySelector('h1.video-title') || document.querySelector('.video-title');
                if (h1 && h1.textContent.trim()) {
                    let h1Text = h1.textContent.trim();
                    // 检查分 P 标题
                    const partActive = document.querySelector('.cur-list .part-active')?.textContent?.trim() ||
                                       document.querySelector('.video-pod__list .active')?.textContent?.trim() ||
                                       document.querySelector('.list-box li.on')?.textContent?.trim();
                    if (partActive && !h1Text.includes(partActive)) {
                        h1Text = `${h1Text} - ${partActive}`;
                    }
                    title = h1Text;
                }
            } catch {}
        }

        if (!title) {
            try {
                // 番剧/影视标题
                const mediaTitle = document.querySelector('.media-title') || document.querySelector('a.mediainfo_title__7FmYv');
                if (mediaTitle && mediaTitle.textContent.trim()) {
                    title = mediaTitle.textContent.trim();
                }
            } catch {}
        }

        if (!title) {
            // document.title 兜底
            const docTitle = (document.title || '').replace(/_哔哩哔哩_bilibili.*$/i, '').trim();
            if (docTitle && docTitle !== '哔哩哔哩' && docTitle !== 'bilibili') {
                title = docTitle;
            } else {
                title = 'Bilibili 纯音频模式';
            }
        }

        // 3. 封面提取（页面实时 DOM）
        if (!cover) {
            try {
                // 原生 video poster 属性
                const videoEl = document.querySelector('video');
                if (videoEl && videoEl.getAttribute('poster')) {
                    cover = videoEl.getAttribute('poster');
                }
            } catch {}
        }

        if (!cover) {
            try {
                // 播放器海报节点
                const posterImg = document.querySelector('.bpx-player-poster img, .bilibili-player-video-poster img, .bpx-player-video-poster img');
                if (posterImg && posterImg.src) {
                    cover = posterImg.src;
                }
            } catch {}
        }

        if (!cover) {
            try {
                // 仅当当前为初始 BVID 时采信 meta 标签
                const ogImg = document.querySelector('meta[property="og:image"]')?.content;
                if (ogImg) cover = ogImg;
            } catch {}
        }

        let author = '';
        try {
            const upEl = document.querySelector('.up-name, .bili-avatar-name, .up-info--name, .staff-name, .up-detail-top .name');
            if (upEl && upEl.textContent.trim()) {
                author = upEl.textContent.trim();
            }
        } catch {}

        if (cover && cover.startsWith('//')) {
            cover = 'https:' + cover;
        }

        return { title, cover, author };
    }

    // 主动异步向 B 站官方接口拉取权威高清封面与分P标题（100% 官方数据兜底）
    async function fetchVideoMetaFromApi(bvid, targetKey) {
        if (!bvid) return;
        try {
            const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
            if (!res.ok) return;
            const json = await res.json();
            if (json?.code === 0 && json?.data) {
                const data = json.data;
                let apiTitle = data.title || '';
                const p = new URLSearchParams(location.search).get('p') || '1';
                const pNum = parseInt(p, 10);
                if (data.pages && data.pages.length > 1 && data.pages[pNum - 1]?.part) {
                    apiTitle = `${data.title} - P${pNum} ${data.pages[pNum - 1].part}`;
                }
                let apiCover = data.pic || '';
                if (apiCover && apiCover.startsWith('//')) apiCover = 'https:' + apiCover;
                const apiAuthor = data.owner?.name || '';

                const meta = { title: apiTitle, cover: apiCover, author: apiAuthor };
                videoMetaCache.set(targetKey, meta);

                // 若当前仍在同一视频，即刻无缝刷新大面板
                if (getVideoKey() === targetKey) {
                    applyVinylMetaToUI(meta);
                }
            }
        } catch {}
    }

    // 真正将元数据渲染更新至大面板 DOM（黑胶与播客模式双向同步）
    function applyVinylMetaToUI(meta) {
        if (!audioPanelEl || !meta) return;

        // 1. 黑胶模式元素
        const vinylCoverEl = audioPanelEl.querySelector('#bili-vinyl-cover');
        const vinylTitleEl = audioPanelEl.querySelector('#bili-vinyl-title');

        if (vinylCoverEl) {
            vinylCoverEl.style.backgroundSize = 'cover';
            vinylCoverEl.style.backgroundPosition = 'center';
            vinylCoverEl.style.backgroundRepeat = 'no-repeat';
            if (meta.cover) {
                vinylCoverEl.style.backgroundImage = `url("${meta.cover}")`;
            } else {
                vinylCoverEl.style.backgroundImage = 'radial-gradient(circle, #333 0%, #111 100%)';
            }
        }
        if (vinylTitleEl && meta.title) {
            vinylTitleEl.textContent = meta.title;
            vinylTitleEl.title = meta.title;
        }
        const vinylAuthorEl = audioPanelEl.querySelector('#bili-vinyl-author');
        if (vinylAuthorEl) {
            const authorText = meta.author || '哔哩哔哩 UP主';
            vinylAuthorEl.textContent = authorText;
            vinylAuthorEl.title = authorText;
        }

        // 2. 小宇宙播客模式元素
        const podcastArtwork = audioPanelEl.querySelector('#bili-podcast-artwork');
        const podcastGlow = audioPanelEl.querySelector('#bili-podcast-ambient-glow');
        const podcastTitle = audioPanelEl.querySelector('#bili-podcast-title');
        const podcastAuthor = audioPanelEl.querySelector('#bili-podcast-author-name');

        if (podcastArtwork) {
            podcastArtwork.style.backgroundSize = 'cover';
            podcastArtwork.style.backgroundPosition = 'center';
            podcastArtwork.style.backgroundRepeat = 'no-repeat';
            if (meta.cover) {
                podcastArtwork.style.backgroundImage = `url("${meta.cover}")`;
            } else {
                podcastArtwork.style.backgroundImage = 'linear-gradient(135deg, #2b2d31 0%, #18191c 100%)';
            }
        }
        if (podcastGlow && meta.cover) {
            podcastGlow.style.backgroundImage = `url("${meta.cover}")`;
            podcastGlow.style.backgroundSize = 'cover';
            podcastGlow.style.backgroundPosition = 'center';
        }
        if (podcastTitle && meta.title) {
            podcastTitle.textContent = meta.title;
            podcastTitle.title = meta.title;
        }
        if (podcastAuthor) {
            const authorText = meta.author || '哔哩哔哩 UP主';
            podcastAuthor.textContent = authorText;
            podcastAuthor.title = authorText;
        }
    }

    // 切换并应用大面板视觉风格（小宇宙播客 podcast / 网易云黑胶 vinyl）
    function applyThemeStyleToUI() {
        if (!audioPanelEl) return;
        const style = getPanelThemeStyle();
        const isPodcast = style === 'podcast';

        const panelCard = audioPanelEl.querySelector('#bili-audio-card');
        if (panelCard) {
            panelCard.setAttribute('data-style', isPodcast ? 'podcast' : 'vinyl');
        }

        const podcastWrap = audioPanelEl.querySelector('#bili-podcast-wrap');
        const vinylWrap = audioPanelEl.querySelector('#bili-vinyl-wrap');
        const vinylInfo = audioPanelEl.querySelector('#bili-vinyl-info');
        const vinylTitle = audioPanelEl.querySelector('#bili-vinyl-title');
        const btnBack15 = audioPanelEl.querySelector('#bili-btn-backward-15');
        const btnFwd15 = audioPanelEl.querySelector('#bili-btn-forward-15');
        const badgeEl = audioPanelEl.querySelector('#bili-audio-mode-badge');
        const styleBtnText = audioPanelEl.querySelector('#bili-style-text');

        if (podcastWrap) podcastWrap.style.display = isPodcast ? 'flex' : 'none';
        if (vinylWrap) vinylWrap.style.display = isPodcast ? 'none' : 'flex';
        if (vinylInfo) vinylInfo.style.display = isPodcast ? 'none' : 'flex';
        if (vinylTitle) vinylTitle.style.display = isPodcast ? 'none' : 'block';
        if (btnBack15) btnBack15.style.display = 'inline-flex';
        if (btnFwd15) btnFwd15.style.display = 'inline-flex';

        if (badgeEl) {
            badgeEl.innerHTML = isPodcast
                ? `<span style="display: inline-flex; align-items: center;">${ICONS.PODCAST}播客模式</span><span>•</span><span>画面已阻断</span>`
                : `<span style="display: inline-flex; align-items: center;">${ICONS.HEADPHONES}纯音频黑胶</span><span>•</span><span>画面已阻断</span>`;
        }

        if (styleBtnText) {
            styleBtnText.innerHTML = isPodcast ? `${ICONS.PODCAST}风格: 播客` : `${ICONS.DISC}风格: 黑胶`;
        }

        if (!isPodcast) {
            enforceVinylCircleDefense();
        }

        updateAudioCardResponsiveSize(true);
    }

    // 更新网易云黑胶大唱片的封面图与曲目标题
    function updateVinylMeta() {
        if (!audioPanelEl) return;
        const currentKey = getVideoKey();
        const currentBvid = getCurrentBvid();

        // 1. 同步应用当前已提取到的元数据
        const meta = getCurrentVideoMeta();
        applyVinylMetaToUI(meta);

        // 2. 若尚未拿到官方权威缓存，异步发起 API 兜底校验
        if (currentBvid && !videoMetaCache.has(currentKey)) {
            fetchVideoMetaFromApi(currentBvid, currentKey);
        }
    }

    // ==========================================
    // 沉浸式字幕与网易云歌词垂直平滑滚动引擎系统
    // ==========================================
    const STORAGE_KEY_SUBTITLE_MODE = 'bili_audio_subtitle_mode_v2';
    const STORAGE_KEY_PREFERRED_SUBTITLE_LANG = 'bili_audio_preferred_sub_lang';

    let availableSubtitleTracks = [];
    let currentSubtitleTrackId = null;
    let currentSubtitleList = [];
    let activeSubtitleIndex = -1;
    let isUserScrollingLyrics = false;
    let lyricsScrollResumeTimer = null;
    const subtitleDataCache = new Map();

    function getSubtitleMode() {
        try {
            return localStorage.getItem(STORAGE_KEY_SUBTITLE_MODE) || 'off';
        } catch {
            return 'off';
        }
    }

    function setSubtitleMode(mode) {
        try {
            localStorage.setItem(STORAGE_KEY_SUBTITLE_MODE, mode);
        } catch {}
    }

    function getPreferredSubtitleLang() {
        try {
            return localStorage.getItem(STORAGE_KEY_PREFERRED_SUBTITLE_LANG) || '';
        } catch {
            return '';
        }
    }

    function setPreferredSubtitleLang(lan) {
        try {
            localStorage.setItem(STORAGE_KEY_PREFERRED_SUBTITLE_LANG, lan);
        } catch {}
    }

    // 格式化字幕项（统一将相对时间转为浮点秒数，并过滤无效空白项）
    function normalizeSubtitleList(rawBody) {
        if (!Array.isArray(rawBody)) return [];
        return rawBody.map(item => ({
            from: typeof item.from === 'number' ? item.from : parseFloat(item.from) || 0,
            to: typeof item.to === 'number' ? item.to : parseFloat(item.to) || 0,
            content: String(item.content || '').trim()
        })).filter(item => item.content.length > 0)
          .sort((a, b) => a.from - b.from);
    }

    // 异步拉取远程字幕 JSON 数据
    async function fetchSubtitleBody(url) {
        if (!url) return [];
        try {
            const res = await fetch(url);
            if (!res.ok) return [];
            const json = await res.json();
            return normalizeSubtitleList(json?.body);
        } catch (e) {
            console.warn('[BiliAudio] 字幕 JSON 拉取失败:', e);
            return [];
        }
    }

    // 探测并获取当前视频的所有可用字幕轨道
    async function fetchSubtitleTracks(bvid, cid) {
        let rawTracks = [];

        // 1. 尝试从 window.__INITIAL_STATE__ 中获取首屏字幕轨道
        try {
            const initState = window.__INITIAL_STATE__;
            if (initState?.videoData?.subtitle?.list?.length) {
                const currentP = new URLSearchParams(location.search).get('p') || '1';
                if (currentP === '1' || !initState.videoData.pages || initState.videoData.pages.length <= 1) {
                    rawTracks = initState.videoData.subtitle.list;
                }
            }
        } catch {}

        // 2. 权威接口 x/player/v2（精确对应当前分 P 的 cid）
        if ((!rawTracks || rawTracks.length === 0) && cid && bvid) {
            try {
                const res = await fetch(`https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`, { credentials: 'include' });
                if (res.ok) {
                    const json = await res.json();
                    if (json?.code === 0 && Array.isArray(json?.data?.subtitle?.subtitles)) {
                        rawTracks = json.data.subtitle.subtitles;
                    }
                }
            } catch {}
        }

        // 3. 兜底接口 x/web-interface/view
        if ((!rawTracks || rawTracks.length === 0) && bvid) {
            try {
                const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
                if (res.ok) {
                    const json = await res.json();
                    if (json?.code === 0 && Array.isArray(json?.data?.subtitle?.list)) {
                        rawTracks = json.data.subtitle.list;
                    }
                }
            } catch {}
        }

        return (rawTracks || []).map(t => {
            let url = t.subtitle_url || '';
            if (url.startsWith('//')) url = 'https:' + url;
            return {
                id: String(t.id || t.lan),
                lan: t.lan,
                lan_doc: t.lan_doc || t.lan,
                url: url,
                is_machine: Boolean(t.is_machine)
            };
        }).filter(t => Boolean(t.url));
    }

    // 为当前正在播放的视频装载或更新字幕数据
    async function loadSubtitleForCurrentVideo(force = false) {
        const identity = getCurrentVideoIdentity();
        if (!identity || !identity.bvid) return;

        const currentKey = getVideoKey();
        const cacheKey = `${identity.bvid}_${identity.cid || 'default'}`;

        if (!force && subtitleDataCache.has(cacheKey)) {
            const cached = subtitleDataCache.get(cacheKey);
            availableSubtitleTracks = cached.tracks || [];
            currentSubtitleTrackId = cached.activeTrackId;
            currentSubtitleList = cached.list || [];
            activeSubtitleIndex = -1;
            renderLyricsList();
            updateSubtitleMenu();
            applySubtitleModeToUI();
            const curTime = (customAudioEl && customAudioEl.currentTime) || 0;
            syncSubtitleHighlight(curTime, true);
            return;
        }

        const tracks = await fetchSubtitleTracks(identity.bvid, identity.cid);
        if (getVideoKey() !== currentKey) return;

        availableSubtitleTracks = tracks;
        if (!tracks || tracks.length === 0) {
            currentSubtitleTrackId = null;
            currentSubtitleList = [];
            activeSubtitleIndex = -1;
            renderLyricsList();
            updateSubtitleMenu();
            applySubtitleModeToUI();
            return;
        }

        // 选择最佳语言轨道：用户历史偏好 > 中文 > 首项
        const pref = getPreferredSubtitleLang();
        let targetTrack = null;
        if (pref) {
            targetTrack = tracks.find(t => t.lan === pref);
        }
        if (!targetTrack) {
            targetTrack = tracks.find(t => t.lan.startsWith('zh') || t.lan.includes('cn')) || tracks[0];
        }

        currentSubtitleTrackId = targetTrack.id;
        const bodyList = await fetchSubtitleBody(targetTrack.url);
        if (getVideoKey() !== currentKey) return;

        currentSubtitleList = bodyList;
        activeSubtitleIndex = -1;

        subtitleDataCache.set(cacheKey, {
            tracks: availableSubtitleTracks,
            activeTrackId: currentSubtitleTrackId,
            list: currentSubtitleList
        });

        renderLyricsList();
        updateSubtitleMenu();
        applySubtitleModeToUI();
        const curTime = (customAudioEl && customAudioEl.currentTime) || 0;
        syncSubtitleHighlight(curTime, true);
    }

    // 用户切换字幕语言轨道
    async function switchSubtitleTrack(trackId) {
        const track = availableSubtitleTracks.find(t => String(t.id) === String(trackId));
        if (!track) return;

        currentSubtitleTrackId = track.id;
        setPreferredSubtitleLang(track.lan);

        const currentKey = getVideoKey();
        const bodyList = await fetchSubtitleBody(track.url);
        if (getVideoKey() !== currentKey) return;

        currentSubtitleList = bodyList;
        activeSubtitleIndex = -1;

        const identity = getCurrentVideoIdentity();
        if (identity) {
            const cacheKey = `${identity.bvid}_${identity.cid || 'default'}`;
            subtitleDataCache.set(cacheKey, {
                tracks: availableSubtitleTracks,
                activeTrackId: currentSubtitleTrackId,
                list: currentSubtitleList
            });
        }

        renderLyricsList();
        updateSubtitleMenu();
        const curTime = (customAudioEl && customAudioEl.currentTime) || 0;
        syncSubtitleHighlight(curTime, true);
    }

    // 渲染网易云歌词列表 DOM
    function renderLyricsList() {
        if (!audioPanelEl) return;
        const listContainer = audioPanelEl.querySelector('#bili-lyrics-list-container');
        if (!listContainer) return;

        listContainer.innerHTML = '';
        listContainer.style.transform = 'translateY(110px)';

        if (!currentSubtitleList || currentSubtitleList.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'bili-lyric-item';
            emptyEl.style.cssText = 'color: rgba(127,127,127,0.7); cursor: default; margin-top: 80px;';
            emptyEl.textContent = (availableSubtitleTracks && availableSubtitleTracks.length > 0) ? '字幕装载中...' : '暂无可用字幕';
            listContainer.appendChild(emptyEl);
            return;
        }

        const frag = document.createDocumentFragment();
        currentSubtitleList.forEach((sub, idx) => {
            const item = document.createElement('div');
            item.className = 'bili-lyric-item';
            item.dataset.index = idx;
            item.dataset.from = sub.from;
            item.textContent = sub.content;

            item.onclick = (e) => {
                e.stopPropagation();
                const fromTime = parseFloat(item.dataset.from);
                if (Number.isFinite(fromTime) && customAudioEl) {
                    isUserScrollingLyrics = false;
                    try {
                        customAudioEl.currentTime = fromTime;
                    } catch {}
                    syncAudioProgressToVideoAndStorage(true);
                    updateCustomPlayerUI();
                    syncSubtitleHighlight(fromTime, true);
                }
            };
            frag.appendChild(item);
        });
        listContainer.appendChild(frag);
    }

    // 二分查找时间匹配索引
    function findSubtitleIndex(time, list) {
        if (!list || list.length === 0) return -1;
        let low = 0;
        let high = list.length - 1;
        let best = -1;

        while (low <= high) {
            const mid = (low + high) >> 1;
            const item = list[mid];
            if (time >= item.from) {
                best = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        if (best >= 0) {
            const item = list[best];
            if (time <= item.to + 0.6) {
                return best;
            }
        }
        return -1;
    }

    // 实时同步高亮与歌词垂直平滑居中滚动
    function syncSubtitleHighlight(time, force = false) {
        if (!audioPanelEl) return;
        const mode = getSubtitleMode();
        if (mode === 'off') return;

        const singleSubEl = audioPanelEl.querySelector('#bili-single-subtitle');
        const podcastSingleSubEl = audioPanelEl.querySelector('#bili-podcast-single-subtitle');

        if (!currentSubtitleList || currentSubtitleList.length === 0) {
            const emptyText = availableSubtitleTracks.length > 0 ? '字幕装载中...' : '暂无可用字幕';
            if (singleSubEl && singleSubEl.textContent !== emptyText) singleSubEl.textContent = emptyText;
            if (podcastSingleSubEl && podcastSingleSubEl.textContent !== emptyText) podcastSingleSubEl.textContent = emptyText;
            return;
        }

        const idx = findSubtitleIndex(time, currentSubtitleList);
        if (idx === activeSubtitleIndex && !force) return;
        activeSubtitleIndex = idx;

        const currentText = (idx >= 0 && currentSubtitleList[idx]) ? currentSubtitleList[idx].content : '';

        // 1. 同步单行字幕
        [singleSubEl, podcastSingleSubEl].forEach(el => {
            if (!el) return;
            if (el.textContent !== currentText) {
                el.style.opacity = '0';
                setTimeout(() => {
                    el.textContent = currentText;
                    el.style.opacity = currentText ? '0.9' : '0';
                }, 100);
            }
        });

        // 2. 同步网易云滚动歌词
        if (mode === 'scroll') {
            const listContainer = audioPanelEl.querySelector('#bili-lyrics-list-container');
            const scrollWrap = audioPanelEl.querySelector('#bili-lyrics-scroll-wrap');
            if (!listContainer || !scrollWrap) return;

            const items = listContainer.querySelectorAll('.bili-lyric-item');
            items.forEach((item, i) => {
                if (i === idx) {
                    if (!item.classList.contains('active')) item.classList.add('active');
                } else {
                    if (item.classList.contains('active')) item.classList.remove('active');
                }
            });

            if (!isUserScrollingLyrics && idx >= 0 && items[idx]) {
                const activeItem = items[idx];
                const wrapHeight = scrollWrap.clientHeight || 260;
                const targetY = (wrapHeight / 2) - activeItem.offsetTop - (activeItem.clientHeight / 2);
                listContainer.style.transition = 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)';
                listContainer.style.transform = `translateY(${targetY}px)`;
            }
        }
    }

    // 应用字幕模式至 UI（黑胶/播客卡片与滚动视窗互斥显示）
    function applySubtitleModeToUI() {
        if (!audioPanelEl) return;
        const mode = getSubtitleMode();
        const panelCard = audioPanelEl.querySelector('#bili-audio-card');
        if (panelCard) {
            panelCard.setAttribute('data-sub-mode', mode);
        }

        const pillTextEl = audioPanelEl.querySelector('#bili-subtitle-pill-text');
        if (pillTextEl) {
            if (mode === 'scroll') pillTextEl.textContent = '字幕: 滚动';
            else if (mode === 'single') pillTextEl.textContent = '字幕: 单行';
            else pillTextEl.textContent = '字幕: 关';
        }

        if (mode === 'scroll') {
            isUserScrollingLyrics = false;
            const curTime = (customAudioEl && customAudioEl.currentTime) || 0;
            syncSubtitleHighlight(curTime, true);
        } else if (mode === 'single') {
            const curTime = (customAudioEl && customAudioEl.currentTime) || 0;
            syncSubtitleHighlight(curTime, true);
        }
    }

    // 动态渲染字幕上弹选择菜单（模式分组 + 语言轨道分组）
    function updateSubtitleMenu() {
        if (!audioPanelEl) return;
        const menuEl = audioPanelEl.querySelector('#bili-subtitle-popup-menu');
        if (!menuEl) return;

        const curMode = getSubtitleMode();
        menuEl.innerHTML = `
            <div style="font-size: 10px; opacity: 0.6; padding: 2px 8px 1px 8px; text-align: left;">显示模式</div>
            <button class="bili-popup-menu-item ${curMode === 'scroll' ? 'active' : ''}" data-sub-action="mode" data-sub-val="scroll">滚动歌词</button>
            <button class="bili-popup-menu-item ${curMode === 'single' ? 'active' : ''}" data-sub-action="mode" data-sub-val="single">单行字幕</button>
            <button class="bili-popup-menu-item ${curMode === 'off' ? 'active' : ''}" data-sub-action="mode" data-sub-val="off">关闭字幕</button>
        `;

        if (availableSubtitleTracks && availableSubtitleTracks.length > 0) {
            const divider = document.createElement('div');
            divider.style.cssText = 'height: 1px; background: rgba(127,127,127,0.2); margin: 4px 2px;';
            menuEl.appendChild(divider);

            const langTitle = document.createElement('div');
            langTitle.style.cssText = 'font-size: 10px; opacity: 0.6; padding: 2px 8px 1px 8px; text-align: left;';
            langTitle.textContent = '字幕语言';
            menuEl.appendChild(langTitle);

            availableSubtitleTracks.forEach(track => {
                const item = document.createElement('button');
                item.className = 'bili-popup-menu-item';
                item.dataset.subAction = 'track';
                item.dataset.subVal = track.id;
                item.textContent = track.lan_doc || track.lan;
                if (String(track.id) === String(currentSubtitleTrackId)) {
                    item.classList.add('active');
                }
                menuEl.appendChild(item);
            });
        }

        // 绑定菜单项点击事件
        menuEl.querySelectorAll('.bili-popup-menu-item').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const action = btn.dataset.subAction;
                const val = btn.dataset.subVal;
                if (action === 'mode') {
                    setSubtitleMode(val);
                    applySubtitleModeToUI();
                    updateSubtitleMenu();
                } else if (action === 'track') {
                    switchSubtitleTrack(val);
                }
                menuEl.classList.remove('show');
            };
        });
    }

    // 绑定网易云歌词滚轮交互手势
    function bindLyricsScrollEvents() {
        if (!audioPanelEl) return;
        const scrollWrap = audioPanelEl.querySelector('#bili-lyrics-scroll-wrap');
        const listContainer = audioPanelEl.querySelector('#bili-lyrics-list-container');
        if (!scrollWrap || !listContainer) return;

        scrollWrap.onwheel = (e) => {
            e.preventDefault();
            e.stopPropagation();

            isUserScrollingLyrics = true;
            if (lyricsScrollResumeTimer) clearTimeout(lyricsScrollResumeTimer);

            let currentY = 0;
            const match = listContainer.style.transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/);
            if (match) currentY = parseFloat(match[1]);

            let nextY = currentY - e.deltaY;
            const wrapHeight = scrollWrap.clientHeight || 260;
            const listHeight = listContainer.scrollHeight;
            const minY = (wrapHeight / 2) - listHeight;
            const maxY = wrapHeight / 2;
            nextY = Math.max(minY, Math.min(maxY, nextY));

            listContainer.style.transition = 'transform 0.1s ease-out';
            listContainer.style.transform = `translateY(${nextY}px)`;

            // 3 秒无操作后平滑自动回弹至播放句
            lyricsScrollResumeTimer = setTimeout(() => {
                isUserScrollingLyrics = false;
                listContainer.style.transition = 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)';
                const curTime = (customAudioEl && customAudioEl.currentTime) || 0;
                syncSubtitleHighlight(curTime, true);
            }, 3000);
        };
    }

    // 1. 判断是否为暗黑模式（优先读取 B 站 Cookie: theme_style）
    function isBiliDarkMode() {
        const match = document.cookie.match(/(?:^|;\s*)theme_style=([^;]+)/);
        if (match) {
            const theme = decodeURIComponent(match[1]).trim().toLowerCase();
            if (theme === 'dark') return true;
            if (theme === 'light') return false;
        }

        // 次级检查页面 DOM 标记与系统主题
        if (document.documentElement.classList.contains('dark') ||
            document.body?.classList.contains('dark') ||
            document.documentElement.getAttribute('data-theme') === 'dark') {
            return true;
        }
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function isPlayApiUrl(url) {
        if (!url || typeof url !== 'string') return false;
        return url.includes('/player/playurl') || 
               url.includes('/player/wbi/playurl') || 
               url.includes('/player/wbi/v2') || 
               url.includes('/player/v2') || 
               url.includes('/pgc/player/web/playurl') || 
               url.includes('/pgc/player/web/v2/playurl') || 
               url.includes('/pugv/player/web/playurl') || 
               url.includes('playurl');
    }

    function isCurrentVideoRequest(requestUrl) {
        if (!requestUrl || typeof requestUrl !== 'string') return true;
        // 仅过滤非核心播放 API（雪碧图微缩图、弹幕段等），绝不丢弃任何携带音视频流的播放请求
        if (requestUrl.includes('/videoshot') || requestUrl.includes('/dm/') || requestUrl.includes('/seg.so')) {
            return false;
        }
        return true;
    }

    // 音频流数据缓存池：按 bvid, cid 或组合键映射保存解析后的可用音轨与码率，防串音并支持瞬时命中
    const audioDataCache = new Map();
    const MAX_CACHE_ENTRIES = 50;
    const CACHE_TTL_MS = 45 * 60 * 1000; // 45 分钟最大生存期（远低于 B 站 CDN 2 小时的 deadline 鉴权窗口）

    // 检测音频直链 URL 是否已过期失效（检查 deadline/e 参数或时间戳）
    function isAudioUrlExpired(url, bufferMinutes = 5) {
        if (!url || typeof url !== 'string') return true;
        try {
            const u = new URL(url, location.origin);
            const deadline = u.searchParams.get('deadline') || u.searchParams.get('e');
            if (deadline) {
                const deadlineMs = Number(deadline) * 1000;
                if (Number.isFinite(deadlineMs) && deadlineMs > 0) {
                    return Date.now() + bufferMinutes * 60 * 1000 >= deadlineMs;
                }
            }
        } catch {}
        return false;
    }

    // 检测缓存池条目是否已过期
    function isCacheEntryExpired(entry) {
        if (!entry) return true;
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) return true;
        if (entry.tracks && entry.tracks[0] && isAudioUrlExpired(entry.tracks[0].url)) return true;
        return false;
    }

    // 从缓存池中剔除指定视频条目（音轨失效或发生 403 错误时使用）
    function evictAudioCache(identity) {
        if (!identity) return;
        if (identity.bvid && identity.cid) audioDataCache.delete(`${identity.bvid}:${identity.cid}`);
        if (identity.bvid) audioDataCache.delete(`bvid:${identity.bvid}`);
        if (identity.cid) audioDataCache.delete(`cid:${identity.cid}`);
        if (identity.epId) audioDataCache.delete(`ep:${identity.epId}`);
    }

    function saveToAudioCache(identity, tracks, vidBandwidth, duration) {
        if (!tracks || tracks.length === 0 || !identity) return;
        const entry = {
            tracks,
            videoBandwidth: vidBandwidth || 0,
            duration: duration || 0,
            bvid: identity.bvid,
            cid: identity.cid,
            epId: identity.epId,
            timestamp: Date.now()
        };

        if (identity.bvid && identity.cid) {
            audioDataCache.set(`${identity.bvid}:${identity.cid}`, entry);
        }
        if (identity.bvid) {
            audioDataCache.set(`bvid:${identity.bvid}`, entry);
        }
        if (identity.cid) {
            audioDataCache.set(`cid:${identity.cid}`, entry);
        }
        if (identity.epId) {
            audioDataCache.set(`ep:${identity.epId}`, entry);
        }

        while (audioDataCache.size > MAX_CACHE_ENTRIES) {
            const firstKey = audioDataCache.keys().next().value;
            audioDataCache.delete(firstKey);
        }
    }

    function getFromAudioCache(identity) {
        if (!identity) return null;
        const checkHit = (hit) => {
            if (!hit) return null;
            if (isCacheEntryExpired(hit)) {
                evictAudioCache(identity);
                return null;
            }
            return hit;
        };

        if (identity.bvid && identity.cid) {
            const hit = checkHit(audioDataCache.get(`${identity.bvid}:${identity.cid}`));
            if (hit) return hit;
        }
        if (identity.epId) {
            const hit = checkHit(audioDataCache.get(`ep:${identity.epId}`));
            if (hit) return hit;
        }
        if (identity.cid) {
            const hit = checkHit(audioDataCache.get(`cid:${identity.cid}`));
            if (hit) return hit;
        }
        if (identity.bvid) {
            const rawHit = audioDataCache.get(`bvid:${identity.bvid}`);
            if (rawHit) {
                if (identity.cid && rawHit.cid && rawHit.cid !== identity.cid) {
                    return null;
                }
                const hit = checkHit(rawHit);
                if (hit) return hit;
            }
        }
        return null;
    }

    // 获取当前播放器/主页面正在播放的视频身份
    function getCurrentVideoIdentity() {
        let bvid = null;
        let cid = null;
        let epId = null;

        try {
            if (window.player) {
                if (typeof window.player.getBvid === 'function') bvid = window.player.getBvid();
                if (typeof window.player.getCid === 'function') cid = window.player.getCid();
            }
        } catch {}

        if (!bvid) {
            const bvidMatch = location.pathname.match(/\/(BV[a-zA-Z0-9]+)/i);
            if (bvidMatch) {
                bvid = bvidMatch[1];
            } else {
                const sp = new URLSearchParams(location.search);
                if (sp.has('bvid')) bvid = sp.get('bvid');
            }
        }

        if (!cid) {
            const sp = new URLSearchParams(location.search);
            if (sp.has('cid')) cid = sp.get('cid');
        }

        const epMatch = location.pathname.match(/\/(ep\d+)/i);
        if (epMatch) {
            epId = epMatch[1];
        } else {
            const sp = new URLSearchParams(location.search);
            if (sp.has('ep_id')) epId = sp.get('ep_id');
        }

        return {
            bvid: bvid ? bvid.toLowerCase() : null,
            cid: cid ? String(cid) : null,
            epId: epId ? epId.toLowerCase() : null,
            videoKey: getVideoKey()
        };
    }

    // 全自动主动拉取新鲜音轨自愈管线（针对长时间挂起导致 403 过期、切视频或音轨缺失场景）
    let isRequestingFreshAudio = false;
    let lastAudioRefreshRequestTime = 0;

    async function requestFreshAudioSource(force = false) {
        const now = Date.now();
        if (isRequestingFreshAudio || (!force && now - lastAudioRefreshRequestTime < 2500)) {
            return;
        }
        isRequestingFreshAudio = true;
        lastAudioRefreshRequestTime = now;

        const currentId = getCurrentVideoIdentity();

        try {
            // 途径 1：如果已有 bvid 与 cid，直接请求 B 站标准官方 playurl 接口获取新鲜 DASH 音轨
            if (currentId && currentId.bvid && currentId.cid) {
                const apiUrl = `https://api.bilibili.com/x/player/playurl?bvid=${currentId.bvid}&cid=${currentId.cid}&qn=64&fnval=16`;
                const fetchFn = origFetch || window.fetch;
                const res = await fetchFn(apiUrl, { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    if (data && (data.code === 0 || data.data || data.result)) {
                        extractPlayInfo(data, false, apiUrl);
                        isRequestingFreshAudio = false;
                        return;
                    }
                }
            }
        } catch (e) {}

        // 途径 2：唤醒原生播放器核心重新拉流（促使拦截器捕获新鲜 DASH 音轨）
        try {
            if (window.player && typeof window.player.reload === 'function') {
                window.player.reload();
            } else {
                const origVideo = getOriginalVideo();
                if (origVideo && typeof origVideo.load === 'function') {
                    origVideo.load();
                }
            }
        } catch {}

        setTimeout(() => {
            isRequestingFreshAudio = false;
        }, 2500);
    }

    // 从请求 URL 与响应 JSON 数据中提取视频归属身份
    function extractPayloadIdentity(url, data) {
        let bvid = null;
        let cid = null;
        let epId = null;

        if (url && typeof url === 'string') {
            try {
                const parsedUrl = new URL(url, location.origin);
                const sp = parsedUrl.searchParams;
                if (sp.has('bvid')) bvid = sp.get('bvid');
                if (sp.has('cid')) cid = sp.get('cid');
                if (sp.has('ep_id')) epId = sp.get('ep_id');
            } catch {}
        }

        if (data && typeof data === 'object') {
            const root = data.data || data.result || data;
            if (!bvid) bvid = root.bvid || root.video_info?.bvid;
            if (!cid) cid = root.cid || root.video_info?.cid;
            if (!epId) epId = root.ep_id || root.video_info?.ep_id;
        }

        return {
            bvid: bvid ? bvid.toLowerCase() : null,
            cid: cid ? String(cid) : null,
            epId: epId ? epId.toLowerCase() : null
        };
    }

    // 严格校验载荷身份与当前播放视频身份的一致性（彻底杜绝推荐流顶替当前视频）
    function isPayloadMatchingCurrent(payloadId, currentId) {
        if (!payloadId || !currentId) return true;

        // 1. 若两者均包含 bvid 且不一致，100% 为其他视频（如推荐视频或预加载流），严禁匹配
        if (payloadId.bvid && currentId.bvid && payloadId.bvid !== currentId.bvid) {
            return false;
        }

        // 2. 若两者均包含 epId 且不一致，属于番剧其他分集
        if (payloadId.epId && currentId.epId && payloadId.epId !== currentId.epId) {
            return false;
        }

        // 3. 若两者均包含 cid 且不一致，属于同视频下其他分 P
        if (payloadId.cid && currentId.cid && payloadId.cid !== currentId.cid) {
            return false;
        }

        // 4. 正向匹配条件
        if (payloadId.bvid && currentId.bvid && payloadId.bvid === currentId.bvid) {
            return true;
        }
        if (payloadId.epId && currentId.epId && payloadId.epId === currentId.epId) {
            return true;
        }
        if (payloadId.cid && currentId.cid && payloadId.cid === currentId.cid) {
            return true;
        }

        // 5. 若 payload 没有任何明确身份标识，只要不存在显式冲突则允许
        if (!payloadId.bvid && !payloadId.cid && !payloadId.epId) {
            return true;
        }

        return false;
    }

    // 3. 劫持 window.__playinfo__，支持首屏与后续 SPA 路由更新
    let playinfoData = window.__playinfo__;

    Object.defineProperty(window, '__playinfo__', {
        configurable: true,
        enumerable: true,
        get() {
            return playinfoData;
        },
        set(val) {
            playinfoData = val;
            if (val) {
                extractPlayInfo(val, false, '');
            }
        }
    });

    // 4. 劫持 fetch 与 XMLHttpRequest 捕获全量播放 API 数据（普通稿件 + 多P + 番剧影视）
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await origFetch.apply(this, args);
        try {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            if (isPlayApiUrl(url) && isCurrentVideoRequest(url)) {
                const clone = response.clone();
                clone.json().then(data => extractPlayInfo(data, false, url)).catch(() => {});
            }
        } catch {}
        return response;
    };

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        this._requestUrl = url;
        return origOpen.apply(this, arguments);
    };

    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            try {
                if (isPlayApiUrl(this._requestUrl) && isCurrentVideoRequest(this._requestUrl)) {
                    const data = JSON.parse(this.responseText);
                    extractPlayInfo(data, false, this._requestUrl);
                }
            } catch {}
        });
        return origSend.apply(this, arguments);
    };

    // 5. 解析 DASH 音轨与参考视频码率
    function parseDashTracks(data) {
        const dash = data?.data?.dash || 
                     data?.result?.dash || 
                     data?.data?.playurl?.dash || 
                     data?.data?.playurl_info?.playurl?.dash || 
                     data?.result?.video_info?.dash ||
                     data?.dash;
        if (!dash) return null;

        let vidBw = 0;
        if (dash.video && dash.video.length) {
            const videoItem = dash.video[0];
            if (videoItem.bandwidth) vidBw = videoItem.bandwidth;
        }

        const tracks = [];
        const pushTrack = (item, typeHint) => {
            if (!item) return;
            const url = item.baseUrl || item.base_url || (item.backupUrl && item.backupUrl[0]) || (item.backup_url && item.backup_url[0]);
            if (!url) return;
            const id = item.id;
            const bw = item.bandwidth || 132000;
            const kbps = Math.round(bw / 1000);
            let label = '';

            if (id === 30250 || typeHint === 'flac') {
                label = 'Hi-Res 无损';
            } else if (id === 30251 || typeHint === 'dolby') {
                label = '杜比全景声';
            } else if (id === 30280 || bw >= 200000) {
                label = `高品质 (~${kbps}K)`;
            } else if (id === 30232 || (bw >= 100000 && bw < 200000)) {
                label = `标准 (~${kbps}K)`;
            } else if (id === 30216 || bw < 100000) {
                label = `极速省流 (~${kbps}K)`;
            } else {
                label = `${kbps}K 音质`;
            }

            tracks.push({ id, url, bandwidth: bw, label, kbps });
        };

        if (Array.isArray(dash.audio)) {
            dash.audio.forEach(item => pushTrack(item, 'normal'));
        }
        if (dash.flac?.audio) {
            pushTrack(dash.flac.audio, 'flac');
        }
        if (Array.isArray(dash.dolby?.audio)) {
            dash.dolby.audio.forEach(item => pushTrack(item, 'dolby'));
        }

        const seen = new Set();
        const validTracks = tracks.filter(t => {
            if (seen.has(t.id)) return false;
            seen.add(t.id);
            return true;
        }).sort((a, b) => b.bandwidth - a.bandwidth);

        const duration = Number(dash.duration) || (Number(data?.data?.timelength || data?.result?.timelength) / 1000) || 0;

        return { validTracks, videoBandwidth: vidBw, duration };
    }

    // 将已校验身份的音轨集合装载并应用到当前播放器
    function applyAudioTracks(validTracks, vidBw, targetVideoKey, duration) {
        if (!validTracks || validTracks.length === 0) return;

        if (vidBw) {
            videoBandwidth = vidBw;
        }
        if (duration && Number.isFinite(duration) && duration > 0) {
            currentVideoDuration = duration;
        }
        availableAudioTracks = validTracks;

        // 匹配用户偏好或选取最佳可用品质
        let selectedTrack = null;
        const savedQualityId = localStorage.getItem(STORAGE_KEY_PREFERRED_QUALITY);
        if (savedQualityId) {
            selectedTrack = availableAudioTracks.find(t => String(t.id) === savedQualityId);
        }
        if (!selectedTrack) {
            selectedTrack = availableAudioTracks[0];
        }

        currentAudioQualityId = selectedTrack.id;
        const newAudioUrl = selectedTrack.url;
        audioBandwidth = selectedTrack.bandwidth;

        const isNewUrl = currentAudioUrl !== newAudioUrl;
        currentAudioUrl = newAudioUrl;
        currentAudioVideoKey = targetVideoKey || getVideoKey();
        loadSubtitleForCurrentVideo();

        // 若当前已在音频模式且音频直链发生变化或正在换视频挂起中，立刻换源起播
        if (isAudioMode && customAudioEl) {
            if (isNewUrl || isVideoSwitchPending) {
                const origVideo = getOriginalVideo();
                isVideoSwitchPending = false;
                isAudioHandoverPending = true;
                let curTime = getBestStartingTime(currentAudioVideoKey);

                customAudioEl.src = currentAudioUrl;
                const onLoaded = () => {
                    const dur = (typeof getCurrentMediaDuration === 'function') ? getCurrentMediaDuration() : (customAudioEl.duration || 0);
                    if (Number.isFinite(dur) && dur > 3 && curTime >= dur - 3) {
                        curTime = 0;
                    }
                    if (curTime > 0) {
                        try { customAudioEl.currentTime = curTime; } catch {}
                    }
                    isAudioHandoverPending = false;
                    syncAudioProgressToVideoAndStorage(true);
                    customAudioEl.removeEventListener('loadedmetadata', onLoaded);
                };
                if (customAudioEl.readyState >= 1) {
                    onLoaded();
                } else {
                    customAudioEl.addEventListener('loadedmetadata', onLoaded, { once: true });
                }
                // 确保新视频换源起播时音量与静音状态受用户真实配置保护，杜绝由于系统换源阶段而残留静音
                customAudioEl.muted = getSavedUserMuted();
                const curUserVol = getSavedUserVolume();
                if (customAudioEl.volume === 0 && curUserVol > 0) {
                    customAudioEl.volume = curUserVol;
                }
                customAudioEl.play().catch(() => {});
                updatePlayPauseBtnState(true);
                updateCustomPlayerUI();

                if (origVideo) {
                    origVideo.style.visibility = 'hidden';
                    try { origVideo.pause(); } catch {}
                }
            }
        }

        checkAndApplyAutoMode();
        renderQualityButtons();
        updateVinylMeta();
    }

    // 提取音视频码率与多档音频链接，安全隔离其他推荐视频
    function extractPlayInfo(data, isInit = false, requestUrl = '') {
        const parsed = parseDashTracks(data);
        if (!parsed || !parsed.validTracks || parsed.validTracks.length === 0) return;

        const { validTracks, videoBandwidth: vidBw, duration } = parsed;
        const payloadId = extractPayloadIdentity(requestUrl, data);
        const currentId = getCurrentVideoIdentity();

        // 1. 无条件存入音轨缓存池（为 SPA 切换和预加载提供快速命中底座）
        saveToAudioCache(payloadId, validTracks, vidBw, duration);

        // 2. 身份归属严格判定：仅当载荷与当前主视频完全一致时，才允许装载起播；严防推荐视频串音！
        if (isPayloadMatchingCurrent(payloadId, currentId)) {
            applyAudioTracks(validTracks, vidBw, currentId.videoKey, duration);
        }
    }

    // 切换指定音频品质（双音频缓冲无缝接力，彻底消灭切换空隙）
    function switchAudioQuality(targetId) {
        const track = availableAudioTracks.find(t => String(t.id) === String(targetId));
        if (!track || !customAudioEl) return;

        try {
            localStorage.setItem(STORAGE_KEY_PREFERRED_QUALITY, String(track.id));
        } catch {}

        currentAudioQualityId = track.id;
        currentAudioUrl = track.url;
        audioBandwidth = track.bandwidth;

        const curTime = Number.isFinite(customAudioEl.currentTime) ? customAudioEl.currentTime : 0;
        const shouldPlay = !customAudioEl.paused;

        renderQualityButtons();
        updateTrafficDisplay();

        if (!shouldPlay) {
            customAudioEl.src = track.url;
            try { customAudioEl.currentTime = curTime; } catch {}
            return;
        }

        // 双缓冲接力：主音频继续播放，备用节点预加载新音质并就绪起播
        const standby = getStandbyAudio();
        standby.src = track.url;
        standby.volume = customAudioEl.volume;
        standby.muted = customAudioEl.muted;

        let hasHandedOver = false;
        const doHandover = () => {
            if (hasHandedOver) return;
            hasHandedOver = true;
            const latestTime = Number.isFinite(standby.currentTime) && standby.currentTime > 0 
                ? standby.currentTime 
                : (Number.isFinite(customAudioEl.currentTime) ? customAudioEl.currentTime : curTime);

            customAudioEl.src = track.url;
            try { customAudioEl.currentTime = latestTime; } catch {}
            customAudioEl.play().catch(() => {});
            try { standby.pause(); } catch {}
        };

        const onCanPlay = () => {
            try {
                const realtime = customAudioEl.currentTime;
                if (Number.isFinite(realtime) && realtime > 0) standby.currentTime = realtime;
            } catch {}
            const p = standby.play();
            if (p && typeof p.then === 'function') {
                p.then(doHandover).catch(doHandover);
            } else {
                doHandover();
            }
            standby.removeEventListener('canplay', onCanPlay);
        };

        if (standby.readyState >= 2) {
            onCanPlay();
        } else {
            standby.addEventListener('canplay', onCanPlay, { once: true });
        }

        // 兜底超时保护
        setTimeout(doHandover, 500);
    }

    // 渲染音频品质切换列表（支持竖向毛玻璃弹出菜单与当前品质胶囊文本联动）
    function renderQualityButtons() {
        if (!audioPanelEl) return;
        const menuEl = audioPanelEl.querySelector('#bili-quality-popup-menu');
        const pillTextEl = audioPanelEl.querySelector('#bili-quality-pill-text');

        if (!availableAudioTracks || availableAudioTracks.length === 0) {
            if (pillTextEl) pillTextEl.textContent = '标准音质';
            if (menuEl) menuEl.innerHTML = `<div class="bili-popup-menu-item active" style="cursor: default;">标准音质</div>`;
            return;
        }

        const activeTrack = availableAudioTracks.find(t => String(t.id) === String(currentAudioQualityId)) || availableAudioTracks[0];
        if (pillTextEl && activeTrack) {
            pillTextEl.textContent = activeTrack.label;
        }

        if (menuEl) {
            menuEl.innerHTML = '';
            availableAudioTracks.forEach(track => {
                const item = document.createElement('button');
                item.className = 'bili-popup-menu-item';
                item.dataset.id = track.id;
                item.textContent = track.label;
                const isActive = String(track.id) === String(currentAudioQualityId);
                if (isActive) item.classList.add('active');

                item.onclick = (e) => {
                    e.stopPropagation();
                    switchAudioQuality(track.id);
                    menuEl.classList.remove('show');
                };
                menuEl.appendChild(item);
            });
        }
    }

    // 检查并自动执行听视频模式（无缝进入）
    function checkAndApplyAutoMode() {
        const key = getVideoKey();
        const decision = shouldAudioModeBeActive(key);
        if (decision.active && !isAudioMode && currentAudioUrl) {
            setAudioMode(true, false);
        }
    }

    // 6. 获取原视频元素
    function getOriginalVideo() {
        const v = document.querySelector('video:not(#bili-native-audio)');
        if (v) bindVideoEventListeners(v);
        return v;
    }

    // 7. 格式化流量大小与媒体时间
    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function formatMediaTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
        const s = Math.floor(seconds);
        const sec = s % 60;
        const min = Math.floor(s / 60) % 60;
        const hr = Math.floor(s / 3600);
        const pad = (n) => String(n).padStart(2, '0');
        if (hr > 0) {
            return `${pad(hr)}:${pad(min)}:${pad(sec)}`;
        }
        return `${pad(min)}:${pad(sec)}`;
    }

    // 获取当前视频/音频的有效总时长（秒）
    function getCurrentMediaDuration() {
        if (customAudioEl && Number.isFinite(customAudioEl.duration) && customAudioEl.duration > 0) {
            return customAudioEl.duration;
        }
        const origVideo = getOriginalVideo();
        if (origVideo && Number.isFinite(origVideo.duration) && origVideo.duration > 0) {
            return origVideo.duration;
        }
        if (currentVideoDuration && Number.isFinite(currentVideoDuration) && currentVideoDuration > 0) {
            return currentVideoDuration;
        }
        try {
            if (window.player && typeof window.player.getDuration === 'function') {
                const pDur = window.player.getDuration();
                if (Number.isFinite(pDur) && pDur > 0) return pDur;
            }
        } catch {}
        return 0;
    }

    // 8. 流量数据显示（大面板已精简移除流量模块，留空避免调用处异常）
    function updateTrafficDisplay() {
        // 大面板已移除流量模块
    }

    // 9. 设置音频模式（开/关，精确保留播放进度与播放/暂停状态，支持单视频记忆与全局默认）
    function setAudioMode(enable, isUserAction = false) {
        if (isSwitchingMode) return;
        isSwitchingMode = true;

        try {
            const key = getVideoKey();
            if (isUserAction) {
                setVideoMemory(key, enable);
            }

            isAudioMode = Boolean(enable);
            const origVideo = getOriginalVideo();
            const transactionId = ++currentSwitchTransactionId;

            if (isAudioMode) {
                // 确立交接保护屏障：在音频真正就绪寻道完毕并出声前，阻断一切向原视频的回写与断点覆盖
                isAudioHandoverPending = true;

                // 核心修复：原子级捕获用户点击切换那一瞬间原视频当前的真实有效播放进度，确立不可变目标时间戳
                let capturedOrigTime = 0;
                if (origVideo && Number.isFinite(origVideo.currentTime) && origVideo.currentTime > 0.2) {
                    capturedOrigTime = origVideo.currentTime;
                }
                const baselineStartTime = capturedOrigTime > 0 ? capturedOrigTime : getBestStartingTime(key);

                // 若尚未取得有效且未过期的音频直链，优先从音轨缓存池检索；若兜底读取首屏 playinfo 需严格校验身份一致性
                if (!currentAudioUrl || isAudioUrlExpired(currentAudioUrl)) {
                    currentAudioUrl = null;
                    const currentId = getCurrentVideoIdentity();
                    const cached = getFromAudioCache(currentId);
                    if (cached) {
                        applyAudioTracks(cached.tracks, cached.videoBandwidth, currentId.videoKey);
                    } else if (window.__playinfo__) {
                        const playinfoId = extractPayloadIdentity(null, window.__playinfo__);
                        if (isPayloadMatchingCurrent(playinfoId, currentId)) {
                            extractPlayInfo(window.__playinfo__, false, '');
                        }
                    }
                    if (!currentAudioUrl) {
                        requestFreshAudioSource(true);
                    }
                }

                if (!audioPanelEl || !audioPanelEl.parentElement) {
                    createAudioPanel();
                } else {
                    applyThemeToPanel();
                }

                if (audioPanelEl) {
                    audioPanelEl.style.display = 'flex';
                    updateAudioCardResponsiveSize();
                }

                // 立即隐藏原视频画面（覆盖式置顶），但若原视频正在播放，先不强制中断，等待音频出声平滑接力
                if (origVideo) {
                    origVideo.style.visibility = 'hidden';
                }

                const shouldPlay = origVideo ? !origVideo.paused : true;

                if (customAudioEl && currentAudioUrl) {
                    syncVolumeVideoToAudio();
                    syncPlaybackRate(false);

                    const maxDur = (typeof getCurrentMediaDuration === 'function') ? getCurrentMediaDuration() : (customAudioEl.duration || 0);

                    if (!shouldPlay) {
                        // 原视频本来就是暂停状态：平滑对齐时间并保持暂停
                        if (origVideo) {
                            try { origVideo.pause(); } catch {}
                        }
                        if (customAudioEl.src !== currentAudioUrl) {
                            customAudioEl.src = currentAudioUrl;
                        }
                        const applyTimeAndPause = () => {
                            if (transactionId !== currentSwitchTransactionId) return;
                            const dur = (typeof getCurrentMediaDuration === 'function') ? getCurrentMediaDuration() : (customAudioEl.duration || maxDur || 0);
                            let finalTarget = baselineStartTime;
                            if (dur > 3 && finalTarget >= dur - 3) {
                                finalTarget = 0;
                            }
                            if (finalTarget > 0) {
                                try { customAudioEl.currentTime = finalTarget; } catch {}
                            }
                            customAudioEl.pause();
                            isAudioHandoverPending = false;
                            syncAudioProgressToVideoAndStorage(true);
                            updatePlayPauseBtnState(true);
                            updateCustomPlayerUI();
                        };

                        if (customAudioEl.readyState >= 1) {
                            applyTimeAndPause();
                        } else {
                            customAudioEl.addEventListener('loadedmetadata', applyTimeAndPause, { once: true });
                        }
                    } else {
                        // 原视频正在播放：执行无感平滑音频接力（Handover），确保声音绝不中断且绝不倒灌 0 秒
                        let handoverDone = false;
                        const completeHandover = () => {
                            if (handoverDone || transactionId !== currentSwitchTransactionId) return;
                            handoverDone = true;
                            isAudioHandoverPending = false;
                            // 音频已真正完成寻道并出声，此时平滑暂停原视频
                            if (origVideo) {
                                try { origVideo.pause(); } catch {}
                            }
                            syncAudioProgressToVideoAndStorage(true);
                            updatePlayPauseBtnState(true);
                            updateCustomPlayerUI();
                        };

                        const executeAudioSeekAndPlay = () => {
                            if (handoverDone || transactionId !== currentSwitchTransactionId) return;
                            const dur = (typeof getCurrentMediaDuration === 'function') ? getCurrentMediaDuration() : (customAudioEl.duration || maxDur || 0);
                            let seekTarget = baselineStartTime;
                            // 若原视频在音频网络加载期间持续前进了，取原视频最新时间戳以实现无缝贴合
                            if (origVideo && !origVideo.paused && Number.isFinite(origVideo.currentTime) && origVideo.currentTime > seekTarget) {
                                seekTarget = origVideo.currentTime;
                            }
                            if (dur > 3 && seekTarget >= dur - 3) {
                                seekTarget = 0;
                            }

                            const onSeekReadyAndPlay = () => {
                                if (handoverDone || transactionId !== currentSwitchTransactionId) return;
                                syncVolumeVideoToAudio();
                                const p = customAudioEl.play();
                                if (p && typeof p.then === 'function') {
                                    p.then(completeHandover).catch(() => {
                                        completeHandover();
                                    });
                                } else {
                                    completeHandover();
                                }
                            };

                            if (seekTarget > 0.2) {
                                try {
                                    customAudioEl.currentTime = seekTarget;
                                } catch {}
                                if (Math.abs(customAudioEl.currentTime - seekTarget) <= 0.3) {
                                    onSeekReadyAndPlay();
                                } else {
                                    customAudioEl.addEventListener('seeked', onSeekReadyAndPlay, { once: true });
                                    setTimeout(onSeekReadyAndPlay, 450); // 寻道超时安全保障
                                }
                            } else {
                                onSeekReadyAndPlay();
                            }
                        };

                        if (customAudioEl.src !== currentAudioUrl) {
                            customAudioEl.src = currentAudioUrl;
                            if (customAudioEl.readyState >= 1) {
                                executeAudioSeekAndPlay();
                            } else {
                                customAudioEl.addEventListener('loadedmetadata', executeAudioSeekAndPlay, { once: true });
                            }
                        } else {
                            executeAudioSeekAndPlay();
                        }

                        // 安全看门狗：即使极端网络超时，也仅解除屏障锁，严禁将未就绪进度回写原视频
                        setTimeout(() => {
                            if (!handoverDone && transactionId === currentSwitchTransactionId) {
                                isAudioHandoverPending = false;
                            }
                        }, 2500);
                    }
                } else if (origVideo) {
                    // 核心平滑接力防静音：音频流拉取中，若原视频正在播放，不强行 pause 原视频，让其作为临时发声源！
                    // 仅隐藏原视频画面，等待音频流到达起播后自动接力静音/暂停原视频
                    origVideo.style.visibility = 'hidden';
                }

                clearInterval(trafficTimer);
                trafficTimer = setInterval(() => {
                    if (customAudioEl && !customAudioEl.paused && !isAudioHandoverPending) {
                        syncAudioProgressToVideoAndStorage(false);
                    }
                }, 1000);
            } else {
                // 切换回【看视频】：平滑接力回原视频画面与声音
                isAudioHandoverPending = false;
                flushCurrentTrafficStats();
                syncAudioProgressToVideoAndStorage(true);
                const curTime = customAudioEl && Number.isFinite(customAudioEl.currentTime) ? customAudioEl.currentTime : 0;
                const shouldPlay = customAudioEl ? !customAudioEl.paused : false;

                syncVolumeAudioToVideo();

                if (audioPanelEl) {
                    audioPanelEl.style.display = 'none';
                }

                clearInterval(trafficTimer);

                if (origVideo) {
                    origVideo.style.visibility = 'visible';
                    syncVolumeAudioToVideo();
                    syncPlaybackRate(true);

                    if (!shouldPlay) {
                        // 音频处于暂停状态：直接同步时间并保持原视频暂停
                        if (customAudioEl) {
                            try { customAudioEl.pause(); } catch {}
                        }
                        if (Number.isFinite(curTime) && curTime > 0) {
                            isSyncingToNativeVideo = true;
                            try {
                                origVideo.currentTime = curTime;
                                origVideo.dispatchEvent(new Event('timeupdate'));
                            } catch {}
                            const releaseLock = () => {
                                origVideo.removeEventListener('seeked', releaseLock);
                                isSyncingToNativeVideo = false;
                            };
                            origVideo.addEventListener('seeked', releaseLock, { once: true });
                            setTimeout(releaseLock, 500);
                        }
                        try { origVideo.pause(); } catch {}
                    } else {
                        // 音频正在播放：让原视频定位起播，在原视频实际出声瞬间停止音频
                        let handoverDone = false;
                        const completeHandover = () => {
                            if (handoverDone || transactionId !== currentSwitchTransactionId) return;
                            handoverDone = true;
                            if (customAudioEl) {
                                try { customAudioEl.pause(); } catch {}
                            }
                        };

                        if (Number.isFinite(curTime) && curTime > 0) {
                            isSyncingToNativeVideo = true;
                            try {
                                origVideo.currentTime = curTime;
                                origVideo.dispatchEvent(new Event('timeupdate'));
                            } catch {}
                            const releaseLock = () => {
                                origVideo.removeEventListener('seeked', releaseLock);
                                isSyncingToNativeVideo = false;
                            };
                            origVideo.addEventListener('seeked', releaseLock, { once: true });
                            setTimeout(releaseLock, 500);
                        }

                        // 监听原视频出画面发声瞬间
                        origVideo.addEventListener('playing', completeHandover, { once: true });

                        const playOrig = () => {
                            if (transactionId !== currentSwitchTransactionId) return;
                            const p = origVideo.play();
                            if (p && typeof p.catch === 'function') {
                                p.catch(() => {
                                    triggerBiliPlay();
                                    completeHandover();
                                });
                            }
                        };

                        if (origVideo.seeking) {
                            origVideo.addEventListener('seeked', playOrig, { once: true });
                        } else {
                            playOrig();
                        }

                        // 兜底超时：450ms 后停止音频，杜绝双重出声
                        setTimeout(completeHandover, 450);
                    }
                } else if (customAudioEl) {
                    try { customAudioEl.pause(); } catch {}
                }
            }

            updateToggleButtonState();
            updateMemoryStatusDisplay();
        } finally {
            isSwitchingMode = false;
        }
    }

    // 9. 更新播放器底栏控制按钮外观状态（100% 对齐原生清晰度/倍速按钮 UI）
    function updateToggleButtonState() {
        if (!toggleBtnEl) return;
        const textElem = toggleBtnEl.querySelector('#bili-audio-btn-text');

        if (isAudioMode) {
            if (textElem) textElem.textContent = '看视频';
            toggleBtnEl.classList.add('bpx-state-active');
            if (textElem) textElem.style.color = '#00aeec';
        } else {
            if (textElem) textElem.textContent = '听视频';
            toggleBtnEl.classList.remove('bpx-state-active');
            if (textElem) textElem.style.color = '';
        }
    }

    // 10. 应用主题样式至音频面板（暗黑/明亮动态切换）
    function applyThemeToPanel() {
        if (!audioPanelEl) return;
        const isDark = isBiliDarkMode();
        audioPanelEl.setAttribute('data-dark', isDark ? 'true' : 'false');

        const panelCard = audioPanelEl.querySelector('#bili-audio-card');
        const vinylTitle = audioPanelEl.querySelector('#bili-vinyl-title');
        const vinylAuthor = audioPanelEl.querySelector('#bili-vinyl-author');
        const playPauseBtn = audioPanelEl.querySelector('#bili-btn-play-pause');

        // 主背景
        audioPanelEl.style.background = isDark
            ? 'linear-gradient(145deg, #18191c 0%, #1f2024 100%)'
            : 'linear-gradient(145deg, #f1f2f3 0%, #ffffff 100%)';
        audioPanelEl.style.color = isDark ? '#e3e5e7' : '#18191c';

        if (panelCard) {
            panelCard.style.background = isDark ? 'rgba(255,255,255,0.03)' : '#ffffff';
            panelCard.style.borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#e3e5e7';
            panelCard.style.boxShadow = isDark ? '0 10px 30px rgba(0,0,0,0.5)' : '0 10px 30px rgba(0,0,0,0.08)';
        }

        if (vinylTitle) {
            vinylTitle.style.color = isDark ? '#ffffff' : '#18191c';
        }
        if (vinylAuthor) {
            vinylAuthor.style.color = isDark ? '#c9ccd0' : '#4b5058';
        }

        const podcastTitle = audioPanelEl.querySelector('#bili-podcast-title');
        if (podcastTitle) {
            podcastTitle.style.color = isDark ? '#ffffff' : '#18191c';
        }
        const podcastAuthor = audioPanelEl.querySelector('#bili-podcast-author-name');
        if (podcastAuthor) {
            podcastAuthor.style.color = isDark ? '#c9ccd0' : '#4b5058';
        }

        if (playPauseBtn) {
            playPauseBtn.style.color = '#ffffff';
            playPauseBtn.style.background = '#00aeec';
            playPauseBtn.style.border = 'none';
        }

        audioPanelEl.querySelectorAll('#bili-btn-backward-15, #bili-btn-forward-15, #bili-btn-toggle-settings').forEach(btn => {
            btn.style.color = isDark ? '#e3e5e7' : '#18191c';
            btn.style.borderColor = isDark ? 'rgba(255,255,255,0.2)' : '#c9ccd0';
        });

        const toggleStyleBtn = audioPanelEl.querySelector('#bili-btn-toggle-style');
        if (toggleStyleBtn) {
            toggleStyleBtn.style.borderColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)';
            toggleStyleBtn.style.color = isDark ? '#9499a0' : '#61666d';
        }

        const loopBtn = audioPanelEl.querySelector('#bili-btn-loop-mode');
        if (loopBtn) {
            const isLoop = getRepeatState();
            loopBtn.style.color = isLoop ? '#00aeec' : (isDark ? '#e3e5e7' : '#18191c');
            loopBtn.style.borderColor = isLoop ? '#00aeec' : (isDark ? 'rgba(255,255,255,0.2)' : '#c9ccd0');
            loopBtn.style.background = isLoop ? 'rgba(0,174,236,0.15)' : 'transparent';
        }

        const progressTrack = audioPanelEl.querySelector('#bili-audio-progress-track');
        if (progressTrack) {
            progressTrack.style.background = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';
        }
        const volumeTrack = audioPanelEl.querySelector('#bili-audio-volume-track');
        if (volumeTrack) {
            volumeTrack.style.background = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';
        }

        audioPanelEl.querySelectorAll('.bili-single-subtitle').forEach(el => {
            el.style.color = isDark ? 'rgba(255,255,255,0.88)' : '#18191c';
        });

        updateCustomPlayerUI();

        // 胶囊类按钮（倍速、音质、下载等）自适应背景与边框
        audioPanelEl.querySelectorAll('.bili-pill-btn:not(#bili-btn-restore)').forEach(btn => {
            btn.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
            btn.style.borderColor = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)';
            btn.style.color = isDark ? '#e3e5e7' : '#18191c';
        });

        // 竖向弹出菜单项高亮处理
        audioPanelEl.querySelectorAll('.bili-popup-menu-item').forEach(btn => {
            const isActive = btn.classList.contains('active');
            btn.style.background = isActive ? '#00aeec' : 'transparent';
            btn.style.color = isActive ? '#ffffff' : (isDark ? '#e3e5e7' : '#18191c');
        });

        updateMemoryStatusDisplay();
        updateSpeedUI();
        applyThemeStyleToUI();
        updateAudioCardResponsiveSize();
    }

    // 更新倍速胶囊文本与弹出菜单高亮项
    function updateSpeedUI() {
        if (!audioPanelEl || !customAudioEl) return;
        const curRate = customAudioEl.playbackRate || 1.0;
        const pillText = audioPanelEl.querySelector('#bili-speed-pill-text');
        if (pillText) {
            pillText.textContent = `${curRate}x`;
        }
        audioPanelEl.querySelectorAll('#bili-speed-popup-menu .bili-popup-menu-item').forEach(item => {
            const r = parseFloat(item.dataset.rate);
            if (Math.abs(r - curRate) < 0.01) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    // 双向同步播放倍速
    function syncPlaybackRate(fromAudioToVideo = false) {
        const origVideo = getOriginalVideo();
        if (!origVideo || !customAudioEl) return;
        try {
            if (fromAudioToVideo) {
                if (typeof customAudioEl.playbackRate === 'number' && customAudioEl.playbackRate > 0) {
                    origVideo.playbackRate = customAudioEl.playbackRate;
                }
            } else {
                if (typeof origVideo.playbackRate === 'number' && origVideo.playbackRate > 0) {
                    customAudioEl.playbackRate = origVideo.playbackRate;
                }
            }
            updateSpeedUI();
        } catch {}
    }

    // 11. 更新设置与记忆状态展示（仅驱动大面板中的设置与状态）
    let lastMemoryStatusHTML = '';
    function updateMemoryStatusDisplay() {
        if (!audioPanelEl) return;
        const key = getVideoKey();
        const mem = getVideoMemory(key);
        const globalDef = getGlobalDefault();

        const statusEl = audioPanelEl.querySelector('#bili-memory-status-text');
        const defaultSwitch = audioPanelEl.querySelector('#bili-setting-default-switch');
        if (defaultSwitch) {
            defaultSwitch.checked = globalDef;
        }

        const loopSwitch = audioPanelEl.querySelector('#bili-setting-loop-switch');
        if (loopSwitch && !isSyncingRepeat) {
            loopSwitch.checked = getRepeatState();
        }

        const memorySwitch = audioPanelEl.querySelector('#bili-setting-memory-switch');
        if (memorySwitch) {
            memorySwitch.checked = (mem !== undefined ? Boolean(mem) : Boolean(globalDef));
        }

        if (statusEl) {
            let newHTML = '';
            if (mem !== undefined) {
                newHTML = `<span style="display: inline-flex; align-items: center; gap: 2px;">${ICONS.PIN}<span style="color: ${mem ? '#4cd964' : '#ff6699'}; font-weight: 600;">${mem ? '已记忆听视频' : '已记忆看视频'}</span></span>`;
            } else {
                newHTML = `<span style="display: inline-flex; align-items: center; gap: 2px;">${ICONS.GLOBE}<span style="color: ${globalDef ? '#4cd964' : 'inherit'}; opacity: 0.8;">跟随全局默认</span></span>`;
            }

            if (newHTML !== lastMemoryStatusHTML) {
                lastMemoryStatusHTML = newHTML;
                statusEl.innerHTML = newHTML;
            }
        }
    }

    // 核心正圆防御守卫：独立于尺寸计算，强制为唱盘、封面和轴孔施加最高优先级圆角与裁剪防御
    function enforceVinylCircleDefense() {
        if (!audioPanelEl) return;
        const targets = [
            audioPanelEl.querySelector('#bili-vinyl-disc'),
            audioPanelEl.querySelector('#bili-vinyl-cover'),
            audioPanelEl.querySelector('#bili-vinyl-center-hole')
        ];
        targets.forEach(el => {
            if (!el) return;
            el.style.setProperty('border-radius', '50%', 'important');
            el.style.setProperty('-webkit-border-radius', '50%', 'important');
            el.style.setProperty('clip-path', 'circle(50% at 50% 50%)', 'important');
            el.style.setProperty('-webkit-clip-path', 'circle(50% at 50% 50%)', 'important');
            el.style.setProperty('overflow', 'hidden', 'important');
        });

        // 确保样式表在 head 最末位，杜绝第三方插件后插样式表以同等 !important 权重压制
        const panelStyle = document.getElementById('bili-audio-panel-style');
        if (panelStyle && panelStyle.parentElement && panelStyle !== panelStyle.parentElement.lastElementChild) {
            panelStyle.parentElement.appendChild(panelStyle);
        }
    }

    // 针对黑胶唱盘与内圈封面的 DOM 属性主动防御观察器：外部插件若敢修改 style/class，瞬间自动打回正圆
    let vinylDefenseObserver = null;
    function setupVinylDefenseObserver() {
        if (!audioPanelEl) return;
        if (vinylDefenseObserver) {
            vinylDefenseObserver.disconnect();
            vinylDefenseObserver = null;
        }

        const targets = [
            audioPanelEl.querySelector('#bili-vinyl-disc'),
            audioPanelEl.querySelector('#bili-vinyl-cover'),
            audioPanelEl.querySelector('#bili-vinyl-center-hole')
        ].filter(Boolean);

        if (targets.length === 0) return;

        vinylDefenseObserver = new MutationObserver(() => {
            enforceVinylCircleDefense();
        });

        targets.forEach(el => {
            vinylDefenseObserver.observe(el, {
                attributes: true,
                attributeFilter: ['style', 'class']
            });
        });
    }

    // 12. 根据父元素视口动态自适应卡片与黑胶唱盘尺寸（对齐视频窗口 0.7 比例，沉浸饱满呈现）
    let panelResizeObserver = null;
    let panelResizeRaf = null;
    let lastCalculatedCardW = 0;
    let lastCalculatedCardH = 0;
    let lastCalculatedDpr = window.devicePixelRatio || 1;
    let lastCalculatedCardStyle = '';

    function updateAudioCardResponsiveSize(force = false) {
        if (!audioPanelEl) return;
        const isPodcast = getPanelThemeStyle() === 'podcast';
        const currentStyleKey = isPodcast ? 'podcast' : 'vinyl';

        // 监测浏览器缩放 DPR 变动
        const currentDpr = window.devicePixelRatio || 1;
        if (Math.abs(currentDpr - lastCalculatedDpr) > 0.01) {
            force = true;
            lastCalculatedDpr = currentDpr;
        }

        // 获取视频窗口父容器有效视口宽度与高度
        const rect = audioPanelEl.getBoundingClientRect();
        const parentW = (audioPanelEl.parentElement ? audioPanelEl.parentElement.clientWidth : 0);
        const parentH = (audioPanelEl.parentElement ? audioPanelEl.parentElement.clientHeight : 0);
        const w = Math.round(rect.width || audioPanelEl.clientWidth || parentW || window.innerWidth);
        const h = Math.round(rect.height || audioPanelEl.clientHeight || parentH || window.innerHeight);
        if (w <= 0 || h <= 0) return;

        // 视口尺寸记忆缓存拦截（Layout Memoization）：
        // 若非强制重绘、DPR 与主题未变、且宽高像素变化小于 2px，跳过重排
        if (!force && lastCalculatedCardStyle === currentStyleKey && Math.abs(w - lastCalculatedCardW) < 2 && Math.abs(h - lastCalculatedCardH) < 2) {
            return;
        }

        lastCalculatedCardW = w;
        lastCalculatedCardH = h;
        lastCalculatedCardStyle = currentStyleKey;

        // 尺寸解耦：仅在黑胶模式下执行正圆防御，避免干扰播客卡片
        if (!isPodcast) {
            enforceVinylCircleDefense();
        }

        const panelCard = audioPanelEl.querySelector('#bili-audio-card');
        if (!panelCard) return;

        panelCard.setAttribute('data-style', isPodcast ? 'podcast' : 'vinyl');

        // 1. 卡片宽度自适应：在缩放窗口变窄时自动向上拓展比例（最高 95%），避免内部挤压
        let targetCardW = Math.round(w * 0.72);
        if (w < 520) {
            targetCardW = Math.max(280, Math.round(w * 0.95));
        } else if (w < 720) {
            targetCardW = Math.max(420, Math.round(w * 0.86));
        } else if (targetCardW > 980) {
            targetCardW = 980;
        }

        // 2. 垂直高度保护与黑胶唱盘尺寸计算（保证小高度缩放时不溢出）
        const isCompactHeight = h < 420;
        const isSpaciousHeight = h >= 640;
        const reservedControlsH = isCompactHeight ? 120 : (isSpaciousHeight ? 175 : 150);

        const maxDiscByHeight = Math.max(70, Math.round(h * 0.72 - reservedControlsH));
        const maxDiscByWidth = Math.round(targetCardW * 0.44);
        let baseDiscSize = Math.min(maxDiscByHeight, maxDiscByWidth);
        baseDiscSize = Math.max(70, Math.min(320, baseDiscSize));

        // 黑胶唱盘饱满呈现
        let discSize = Math.max(68, Math.round(baseDiscSize * 0.9));

        const coverSize = Math.round(discSize * 0.622);
        const centerSize = Math.max(12, Math.round(discSize * 0.102));
        const needleScale = Number((discSize / 196).toFixed(3));
        const wrapW = discSize + 24;
        const wrapH = discSize + 6;

        // 3. 内边距与文字按钮尺寸适配
        const cardPadding = isCompactHeight ? '6px 14px' : (isSpaciousHeight ? '16px 26px' : '10px 18px');
        const titleFontSize = isCompactHeight ? '13px' : (isSpaciousHeight ? '16px' : '15px');

        // 4. 应用至卡片 DOM
        panelCard.style.width = `${Math.min(96, Math.max(70, Math.round(targetCardW / w * 100)))}%`;
        panelCard.style.maxWidth = `${targetCardW}px`;
        panelCard.style.height = 'auto';
        panelCard.style.minHeight = 'auto';
        panelCard.style.padding = cardPadding;
        panelCard.style.justifyContent = 'flex-start';

        const titleEl = panelCard.querySelector('#bili-vinyl-title');
        if (titleEl) {
            titleEl.style.display = isPodcast ? 'none' : 'block';
            titleEl.style.fontSize = titleFontSize;
            titleEl.style.marginBottom = isCompactHeight ? '2px' : '4px';
        }

        const vinylWrap = panelCard.querySelector('#bili-vinyl-wrap');
        if (vinylWrap) {
            vinylWrap.style.display = isPodcast ? 'none' : 'flex';
            vinylWrap.style.width = `${wrapW}px`;
            vinylWrap.style.height = `${wrapH}px`;
            vinylWrap.style.minHeight = `${wrapH}px`;
            vinylWrap.style.flex = 'none';
            vinylWrap.style.alignItems = 'center';
            vinylWrap.style.justifyContent = 'center';
            vinylWrap.style.margin = isCompactHeight ? '2px 0 4px 0' : '4px 0 8px 0';
        }

        const vinylDisc = panelCard.querySelector('#bili-vinyl-disc');
        if (vinylDisc) {
            vinylDisc.style.width = `${discSize}px`;
            vinylDisc.style.height = `${discSize}px`;
            vinylDisc.style.setProperty('border-radius', '50%', 'important');
            vinylDisc.style.setProperty('clip-path', 'circle(50% at 50% 50%)', 'important');
        }

        const vinylCover = panelCard.querySelector('#bili-vinyl-cover');
        if (vinylCover) {
            vinylCover.style.width = `${coverSize}px`;
            vinylCover.style.height = `${coverSize}px`;
            vinylCover.style.setProperty('border-radius', '50%', 'important');
            vinylCover.style.setProperty('clip-path', 'circle(50% at 50% 50%)', 'important');
        }

        const centerHole = panelCard.querySelector('#bili-vinyl-center-hole');
        if (centerHole) {
            centerHole.style.width = `${centerSize}px`;
            centerHole.style.height = `${centerSize}px`;
            centerHole.style.setProperty('border-radius', '50%', 'important');
            centerHole.style.setProperty('clip-path', 'circle(50% at 50% 50%)', 'important');
        }

        const needleScaler = panelCard.querySelector('#bili-vinyl-needle-scaler');
        if (needleScaler) {
            // 唱针旋转原点在 scaler 内部的 (16, 16)，确保缩放时轴心严格对齐唱盘中轴线
            const needleLeft = Math.round((wrapW / 2) - (16 * needleScale));
            const needleTop = Math.round(-16 * needleScale);
            needleScaler.style.left = `${needleLeft}px`;
            needleScaler.style.top = `${needleTop}px`;
            needleScaler.style.transform = `scale(${needleScale})`;
        }

        // 2.2 小宇宙播客卡片尺寸适配（16:9 原比例自适应，保证封面大字完整展现）
        const podcastWrap = panelCard.querySelector('#bili-podcast-wrap');
        const podcastArtwork = panelCard.querySelector('#bili-podcast-artwork');
        const podcastGlow = panelCard.querySelector('#bili-podcast-ambient-glow');
        if (podcastWrap) {
            podcastWrap.style.display = isPodcast ? 'flex' : 'none';
        }
        if (podcastWrap && podcastArtwork) {
            const maxPodcastWByWidth = Math.round(targetCardW * 0.62);
            const maxPodcastWByHeight = Math.round(Math.max(60, h * 0.72 - reservedControlsH) * (16 / 9));
            let podcastW = Math.min(maxPodcastWByWidth, maxPodcastWByHeight);
            podcastW = Math.max(120, Math.min(460, podcastW));
            const podcastH = Math.round(podcastW * 9 / 16);

            podcastArtwork.style.width = `${podcastW}px`;
            podcastArtwork.style.height = `${podcastH}px`;
            if (podcastGlow) {
                podcastGlow.style.width = `${Math.round(podcastW * 0.92)}px`;
                podcastGlow.style.height = `${Math.round(podcastH * 0.88)}px`;
            }
            podcastWrap.style.margin = isCompactHeight ? '2px 0 4px 0' : '4px 0 8px 0';
        }

        const podcastTitleEl = panelCard.querySelector('#bili-podcast-title');
        if (podcastTitleEl) {
            podcastTitleEl.style.fontSize = titleFontSize;
            podcastTitleEl.style.marginBottom = isCompactHeight ? '2px' : '4px';
        }

        const vinylInfoEl = panelCard.querySelector('#bili-vinyl-info');
        if (vinylInfoEl) {
            vinylInfoEl.style.display = isPodcast ? 'none' : 'flex';
        }

        // 2.3 网易云全屏滚动歌词视窗高度自适应适配（小高度视口下动态压缩，防止挤压控制栏）
        const lyricsScrollWrap = panelCard.querySelector('#bili-lyrics-scroll-wrap');
        if (lyricsScrollWrap) {
            const maxAvailableLyricsH = Math.max(90, Math.round(h * 0.72 - (isCompactHeight ? 110 : 140)));
            const scrollH = isCompactHeight ? Math.min(180, maxAvailableLyricsH) : (isSpaciousHeight ? 320 : Math.min(250, maxAvailableLyricsH));
            lyricsScrollWrap.style.height = `${scrollH}px`;
        }

        // 主控纯圆大播放按键尺寸适配（网易云/小宇宙规范）
        const mainPlayBtn = panelCard.querySelector('#bili-btn-play-pause');
        if (mainPlayBtn) {
            const playBtnSize = isCompactHeight ? '38px' : (isSpaciousHeight ? '48px' : '44px');
            mainPlayBtn.style.width = playBtnSize;
            mainPlayBtn.style.height = playBtnSize;
            mainPlayBtn.style.minWidth = playBtnSize;
            mainPlayBtn.style.minHeight = playBtnSize;
        }

        // ±15s 快退快进按钮尺寸适配（黑胶与播客模式通用）
        panelCard.querySelectorAll('#bili-btn-backward-15, #bili-btn-forward-15').forEach(btn => {
            btn.style.display = 'inline-flex';
            const btnD = isCompactHeight ? '28px' : (isSpaciousHeight ? '34px' : '32px');
            btn.style.width = btnD;
            btn.style.height = btnD;
        });

        // 5. 底栏主控行三级自适应响应式排版（彻底解决浏览器缩放导致的溢出挤压）
        const cardInnerW = targetCardW - (isCompactHeight ? 28 : 36);
        const mainCtrlRow = panelCard.querySelector('#bili-audio-main-controls');
        const leftGroup = panelCard.querySelector('#bili-audio-ctrl-left');
        const centerGroup = panelCard.querySelector('#bili-audio-ctrl-center');
        const rightGroup = panelCard.querySelector('#bili-audio-ctrl-right');
        const volumeText = panelCard.querySelector('#bili-audio-volume-text');
        const volumeWrap = panelCard.querySelector('#bili-audio-volume-wrap');

        if (mainCtrlRow) {
            if (cardInnerW >= 610) {
                // 宽屏模式：舒适单行两端排开
                mainCtrlRow.style.flexDirection = 'row';
                mainCtrlRow.style.flexWrap = 'nowrap';
                mainCtrlRow.style.justifyContent = 'space-between';
                mainCtrlRow.style.alignItems = 'center';
                mainCtrlRow.style.gap = '0px';
                if (volumeWrap) volumeWrap.style.width = '66px';
                if (volumeText) volumeText.style.display = 'inline-block';
                if (centerGroup) {
                    centerGroup.style.order = '0';
                    centerGroup.style.gap = '14px';
                }
                if (leftGroup) {
                    leftGroup.style.order = '0';
                    leftGroup.style.gap = '6px';
                }
                if (rightGroup) {
                    rightGroup.style.order = '0';
                    rightGroup.style.gap = '6px';
                }
                panelCard.querySelectorAll('.bili-pill-btn').forEach(btn => {
                    btn.style.padding = '3px 10px';
                    btn.style.fontSize = '11px';
                });
            } else if (cardInnerW >= 430) {
                // 中等模式（缩放 125%~150% 典型状态）：紧凑单行，隐藏音量百分比，缩小按钮间距，无缝一行容纳
                mainCtrlRow.style.flexDirection = 'row';
                mainCtrlRow.style.flexWrap = 'nowrap';
                mainCtrlRow.style.justifyContent = 'space-between';
                mainCtrlRow.style.alignItems = 'center';
                mainCtrlRow.style.gap = '0px';
                if (volumeWrap) volumeWrap.style.width = '42px';
                if (volumeText) volumeText.style.display = 'none';
                if (centerGroup) {
                    centerGroup.style.order = '0';
                    centerGroup.style.gap = '8px';
                }
                if (leftGroup) {
                    leftGroup.style.order = '0';
                    leftGroup.style.gap = '4px';
                }
                if (rightGroup) {
                    rightGroup.style.order = '0';
                    rightGroup.style.gap = '4px';
                }
                panelCard.querySelectorAll('.bili-pill-btn').forEach(btn => {
                    btn.style.padding = '2px 6px';
                    btn.style.fontSize = '10.5px';
                });
            } else {
                // 超窄模式（高倍率缩放或小视口）：两行布局，主播放键置顶居中，两组辅助键居中排开
                mainCtrlRow.style.flexDirection = 'column';
                mainCtrlRow.style.flexWrap = 'wrap';
                mainCtrlRow.style.justifyContent = 'center';
                mainCtrlRow.style.alignItems = 'center';
                mainCtrlRow.style.gap = '8px';
                if (volumeWrap) volumeWrap.style.width = '40px';
                if (volumeText) volumeText.style.display = 'none';
                if (centerGroup) {
                    centerGroup.style.order = '1';
                    centerGroup.style.gap = '10px';
                }
                if (leftGroup) {
                    leftGroup.style.order = '2';
                    leftGroup.style.gap = '4px';
                }
                if (rightGroup) {
                    rightGroup.style.order = '3';
                    rightGroup.style.gap = '4px';
                }
                panelCard.querySelectorAll('.bili-pill-btn').forEach(btn => {
                    btn.style.padding = '2px 5px';
                    btn.style.fontSize = '10px';
                });
            }
        }
    }

    function setupPanelResizeObserver() {
        if (!audioPanelEl || typeof ResizeObserver === 'undefined') return;
        if (panelResizeObserver) {
            panelResizeObserver.disconnect();
            panelResizeObserver = null;
        }
        panelResizeObserver = new ResizeObserver(() => {
            if (panelResizeRaf) cancelAnimationFrame(panelResizeRaf);
            panelResizeRaf = requestAnimationFrame(() => {
                panelResizeRaf = null;
                updateAudioCardResponsiveSize(false);
            });
        });
        panelResizeObserver.observe(audioPanelEl);
        if (audioPanelEl.parentElement) {
            panelResizeObserver.observe(audioPanelEl.parentElement);
        }
    }

    // 13. 获取音频面板的安全挂载目标容器与插入位置（彻底避免父子节点不匹配异常）
    function getPlayerMountTarget() {
        // 1. 首选视频主视口容器（彻底覆盖视频画面与弹幕，位于底栏上方，绝不在 video 内部）
        const primary = document.querySelector('.bpx-player-primary-area');
        if (primary) {
            return { container: primary, insertBeforeNode: null };
        }

        // 2. 次选播放器根容器（若 control-wrap 存在且其直接父节点为 container，则安全插入在其前）
        const container = document.querySelector('.bpx-player-container');
        if (container) {
            const controlWrap = container.querySelector('.bpx-player-control-wrap');
            const insertBeforeNode = (controlWrap && controlWrap.parentElement === container) ? controlWrap : null;
            return { container, insertBeforeNode };
        }

        // 3. 旧版播放器支持
        const oldWrap = document.querySelector('.bilibili-player-video-wrap') || document.querySelector('.bilibili-player-area');
        if (oldWrap) {
            return { container: oldWrap, insertBeforeNode: null };
        }

        // 4. 终极兜底：原视频元素的父节点的外层（避开直接监听点击的 video 内部直接父节点）
        const origVideo = getOriginalVideo();
        if (origVideo && origVideo.parentElement) {
            const parent = origVideo.parentElement;
            const target = parent.parentElement || parent;
            return { container: target, insertBeforeNode: null };
        }

        return null;
    }

    let isDraggingProgress = false;
    let isDraggingVolume = false;

    // 实时同步更新自定义音频控制器的进度条与音量条 UI（已播段与音量段均采用 B 站主题蓝 #00aeec）
    function updateCustomPlayerUI() {
        if (!audioPanelEl || !customAudioEl) return;

        const timeCurrentEl = audioPanelEl.querySelector('#bili-audio-time-current');
        const timeTotalEl = audioPanelEl.querySelector('#bili-audio-time-total');
        const progressBarEl = audioPanelEl.querySelector('#bili-audio-progress-bar');
        const progressThumbEl = audioPanelEl.querySelector('#bili-audio-progress-thumb');

        if (!isDraggingProgress && progressBarEl && progressThumbEl) {
            const cur = (Number.isFinite(customAudioEl.currentTime) && customAudioEl.currentTime > 0) ? customAudioEl.currentTime : 0;
            const dur = (typeof getCurrentMediaDuration === 'function') ? getCurrentMediaDuration() : (customAudioEl.duration || 0);
            const validDur = (Number.isFinite(dur) && dur > 0) ? dur : 0;
            const pct = validDur > 0 ? Math.min(100, Math.max(0, (cur / validDur) * 100)) : 0;
            progressBarEl.style.width = pct + '%';
            progressThumbEl.style.left = pct + '%';
            if (timeCurrentEl) timeCurrentEl.textContent = formatMediaTime(cur);
            if (timeTotalEl) timeTotalEl.textContent = formatMediaTime(validDur);
        }

        const volumeBarEl = audioPanelEl.querySelector('#bili-audio-volume-bar');
        const volumeThumbEl = audioPanelEl.querySelector('#bili-audio-volume-thumb');
        const volumeTextEl = audioPanelEl.querySelector('#bili-audio-volume-text');
        const volumeBtnEl = audioPanelEl.querySelector('#bili-audio-volume-btn');

        if (!isDraggingVolume && volumeBarEl && volumeThumbEl) {
            const isMuted = customAudioEl.muted;
            const vol = isMuted ? 0 : (typeof customAudioEl.volume === 'number' ? customAudioEl.volume : 1);
            const pct = Math.round(vol * 100);
            volumeBarEl.style.width = pct + '%';
            volumeThumbEl.style.left = pct + '%';
            if (volumeTextEl) volumeTextEl.textContent = pct + '%';
            if (volumeBtnEl) {
                volumeBtnEl.innerHTML = (isMuted || vol === 0) ? ICONS.VOLUME_MUTE : ICONS.VOLUME_HIGH;
            }
        }
    }

    // 绑定自定义音频播放控制器（进度跳转、拖拽寻道、音量调节与静音切换）
    function bindCustomPlayerControls() {
        if (!audioPanelEl || !customAudioEl) return;

        const progressWrap = audioPanelEl.querySelector('#bili-audio-progress-wrap');
        const progressTrack = audioPanelEl.querySelector('#bili-audio-progress-track');
        const progressBar = audioPanelEl.querySelector('#bili-audio-progress-bar');
        const progressThumb = audioPanelEl.querySelector('#bili-audio-progress-thumb');
        const timeCurrentEl = audioPanelEl.querySelector('#bili-audio-time-current');

        const volumeWrap = audioPanelEl.querySelector('#bili-audio-volume-wrap');
        const volumeTrack = audioPanelEl.querySelector('#bili-audio-volume-track');
        const volumeBar = audioPanelEl.querySelector('#bili-audio-volume-bar');
        const volumeThumb = audioPanelEl.querySelector('#bili-audio-volume-thumb');
        const volumeTextEl = audioPanelEl.querySelector('#bili-audio-volume-text');
        const volumeBtn = audioPanelEl.querySelector('#bili-audio-volume-btn');

        const getTrackRatio = (e, trackEl) => {
            const rect = trackEl.getBoundingClientRect();
            if (rect.width <= 0) return 0;
            const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
            return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        };

        // 1. 进度条交互（点击与拖动）
        if (progressWrap && progressTrack) {
            const handleProgressSeek = (e) => {
                const ratio = getTrackRatio(e, progressTrack);
                const dur = (typeof getCurrentMediaDuration === 'function') ? getCurrentMediaDuration() : (customAudioEl.duration || 0);
                const validDur = (Number.isFinite(dur) && dur > 0) ? dur : 0;
                const targetTime = validDur > 0 ? ratio * validDur : 0;
                const pct = ratio * 100;
                if (progressBar) progressBar.style.width = pct + '%';
                if (progressThumb) progressThumb.style.left = pct + '%';
                if (timeCurrentEl) timeCurrentEl.textContent = formatMediaTime(targetTime);
                return targetTime;
            };

            const onProgressPointerDown = (e) => {
                isDraggingProgress = true;
                if (pauseDebounceTimer) {
                    clearTimeout(pauseDebounceTimer);
                    pauseDebounceTimer = null;
                }
                if (seekSettleTimer) {
                    clearTimeout(seekSettleTimer);
                    seekSettleTimer = null;
                }
                isSeekingOperation = true;
                const targetTime = handleProgressSeek(e);

                const onProgressPointerMove = (moveEvt) => {
                    if (!isDraggingProgress) return;
                    handleProgressSeek(moveEvt);
                };

                const onProgressPointerUp = (upEvt) => {
                    if (!isDraggingProgress) return;
                    isDraggingProgress = false;
                    const finalTime = handleProgressSeek(upEvt);
                    try {
                        customAudioEl.currentTime = finalTime;
                    } catch {}
                    syncAudioProgressToVideoAndStorage(true);
                    syncSubtitleHighlight(finalTime, true);
                    window.removeEventListener('pointermove', onProgressPointerMove);
                    window.removeEventListener('pointerup', onProgressPointerUp);
                    window.removeEventListener('pointercancel', onProgressPointerUp);
                    if (seekSettleTimer) clearTimeout(seekSettleTimer);
                    seekSettleTimer = setTimeout(() => {
                        isSeekingOperation = false;
                        updatePlayPauseBtnState();
                    }, 200);
                };

                window.addEventListener('pointermove', onProgressPointerMove);
                window.addEventListener('pointerup', onProgressPointerUp);
                window.addEventListener('pointercancel', onProgressPointerUp);
            };

            progressWrap.addEventListener('pointerdown', onProgressPointerDown);
        }

        // 2. 音量条交互（点击与拖动）
        if (volumeWrap && volumeTrack) {
            const handleVolumeAdjust = (e) => {
                const ratio = getTrackRatio(e, volumeTrack);
                const pct = Math.round(ratio * 100);
                if (volumeBar) volumeBar.style.width = pct + '%';
                if (volumeThumb) volumeThumb.style.left = pct + '%';
                if (volumeTextEl) volumeTextEl.textContent = pct + '%';
                if (volumeBtn) {
                    volumeBtn.innerHTML = (pct === 0) ? ICONS.VOLUME_MUTE : ICONS.VOLUME_HIGH;
                }
                customAudioEl.muted = false;
                customAudioEl.volume = ratio;
                syncVolumeAudioToVideo();
            };

            const onVolumePointerDown = (e) => {
                isDraggingVolume = true;
                handleVolumeAdjust(e);

                const onVolumePointerMove = (moveEvt) => {
                    if (!isDraggingVolume) return;
                    handleVolumeAdjust(moveEvt);
                };

                const onVolumePointerUp = () => {
                    if (!isDraggingVolume) return;
                    isDraggingVolume = false;
                    window.removeEventListener('pointermove', onVolumePointerMove);
                    window.removeEventListener('pointerup', onVolumePointerUp);
                    window.removeEventListener('pointercancel', onVolumePointerUp);
                };

                window.addEventListener('pointermove', onVolumePointerMove);
                window.addEventListener('pointerup', onVolumePointerUp);
                window.addEventListener('pointercancel', onVolumePointerUp);
            };

            volumeWrap.addEventListener('pointerdown', onVolumePointerDown);
        }

        // 3. 音量按钮点击静音/取消静音
        if (volumeBtn) {
            volumeBtn.onclick = () => {
                if (customAudioEl.muted || customAudioEl.volume === 0) {
                    customAudioEl.muted = false;
                    if (customAudioEl.volume === 0) {
                        customAudioEl.volume = 0.5;
                    }
                } else {
                    customAudioEl.muted = true;
                }
                syncVolumeAudioToVideo();
                updateCustomPlayerUI();
            };
        }

        // 4. 音频下载按钮点击事件
        const downloadBtn = audioPanelEl.querySelector('#bili-audio-download-btn');
        if (downloadBtn) {
            downloadBtn.onclick = () => {
                downloadCurrentAudio();
            };
        }
    }

    // 下载当前音频直链文件
    async function downloadCurrentAudio() {
        if (!currentAudioUrl) {
            return;
        }

        const downloadBtn = audioPanelEl ? audioPanelEl.querySelector('#bili-audio-download-btn') : null;
        const textSpan = downloadBtn ? downloadBtn.querySelector('span') : null;
        const origText = textSpan ? textSpan.textContent : '下载音频';
        if (downloadBtn) {
            downloadBtn.style.opacity = '0.5';
            downloadBtn.style.pointerEvents = 'none';
            if (textSpan) textSpan.textContent = '下载中...';
        }

        let rawTitle = document.title || 'bilibili_audio';
        rawTitle = rawTitle.replace(/_哔哩哔哩_bilibili.*/i, '').trim();
        rawTitle = rawTitle.replace(/[\\/:*?"<>|]/g, '_');
        const filename = `${rawTitle || 'bilibili_audio'}.m4a`;

        try {
            const res = await fetch(currentAudioUrl);
            if (!res.ok) throw new Error('网络请求异常');
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        } catch {
            const a = document.createElement('a');
            a.href = currentAudioUrl;
            a.target = '_blank';
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } finally {
            if (downloadBtn) {
                downloadBtn.style.opacity = '0.85';
                downloadBtn.style.pointerEvents = 'auto';
                if (textSpan) textSpan.textContent = origText;
            }
        }
    }

    // 13. 创建纯音频播放面板
    function createAudioPanel() {
        const mount = getPlayerMountTarget();
        if (!mount || !mount.container) return;

        const { container, insertBeforeNode } = mount;

        // 若已存在面板元素，确认其在正确容器中后直接复用
        let existing = document.getElementById('bili-audio-theme-panel');
        if (existing) {
            audioPanelEl = existing;
            customAudioEl = audioPanelEl.querySelector('#bili-native-audio');
            if (audioPanelEl.parentElement !== container) {
                if (insertBeforeNode && insertBeforeNode.parentElement === container) {
                    container.insertBefore(audioPanelEl, insertBeforeNode);
                } else {
                    container.appendChild(audioPanelEl);
                }
            }
            applyThemeToPanel();
            updateVinylMeta();
            updateCustomPlayerUI();
            applySubtitleModeToUI();
            updateSubtitleMenu();
            loadSubtitleForCurrentVideo();
            setupPanelResizeObserver();
            updateAudioCardResponsiveSize();
            setupVinylDefenseObserver();
            enforceVinylCircleDefense();
            return;
        }

        let panelStyle = document.getElementById('bili-audio-panel-style');
        if (!panelStyle) {
            panelStyle = document.createElement('style');
            panelStyle.id = 'bili-audio-panel-style';
            panelStyle.textContent = `
                #bili-audio-theme-panel::-webkit-scrollbar {
                    display: none !important;
                    width: 0 !important;
                    height: 0 !important;
                }
                #bili-audio-card {
                    max-height: calc(100% - 12px);
                    box-sizing: border-box;
                    overflow: hidden !important;
                    transition: width 0.25s cubic-bezier(0.25, 1, 0.5, 1), max-width 0.25s cubic-bezier(0.25, 1, 0.5, 1), padding 0.25s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.2s ease, background 0.2s ease, border-color 0.2s ease;
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                }
                html body #bili-audio-theme-panel #bili-audio-card #bili-vinyl-wrap #bili-vinyl-disc,
                html body #bili-audio-theme-panel #bili-audio-card #bili-vinyl-wrap #bili-vinyl-disc.bili-vinyl-disc,
                html body #bili-audio-theme-panel #bili-audio-card #bili-vinyl-wrap #bili-vinyl-cover,
                html body #bili-audio-theme-panel #bili-audio-card #bili-vinyl-wrap #bili-vinyl-center-hole,
                #bili-vinyl-disc,
                #bili-vinyl-disc.bili-vinyl-disc,
                #bili-vinyl-cover,
                #bili-vinyl-center-hole {
                    border-radius: 50% !important;
                    -webkit-border-radius: 50% !important;
                    clip-path: circle(50% at 50% 50%) !important;
                    -webkit-clip-path: circle(50% at 50% 50%) !important;
                    overflow: hidden !important;
                    aspect-ratio: 1 / 1 !important;
                    flex-shrink: 0 !important;
                    box-sizing: border-box !important;
                    transition: width 0.25s cubic-bezier(0.25, 1, 0.5, 1), height 0.25s cubic-bezier(0.25, 1, 0.5, 1);
                }
                #bili-vinyl-wrap {
                    transition: width 0.25s cubic-bezier(0.25, 1, 0.5, 1), height 0.25s cubic-bezier(0.25, 1, 0.5, 1);
                }
                #bili-vinyl-needle-scaler {
                    transition: left 0.25s cubic-bezier(0.25, 1, 0.5, 1), top 0.25s cubic-bezier(0.25, 1, 0.5, 1), transform 0.25s cubic-bezier(0.25, 1, 0.5, 1);
                }
                .bili-slider-wrap:hover .bili-slider-track {
                    height: 6px !important;
                }
                .bili-slider-wrap:hover .bili-slider-thumb {
                    transform: translate(-50%, -50%) scale(1.25) !important;
                }
                .bpx-player-ctrl-progress-played,
                .bpx-player-ctrl-volume-progress-bar,
                .bpx-player-ctrl-volume-progress-inner {
                    background-color: #00aeec !important;
                }
                @keyframes bili-vinyl-spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .bili-vinyl-disc {
                    animation: bili-vinyl-spin 20s linear infinite;
                    animation-play-state: paused;
                }
                .bili-vinyl-disc:hover {
                    filter: brightness(1.06);
                }
                #bili-podcast-artwork:hover {
                    filter: brightness(1.05);
                }

                /* 纯正圆形主播放大按键（网易云/小宇宙规范） */
                .bili-main-play-btn {
                    width: 44px;
                    height: 44px;
                    border-radius: 50% !important;
                    background: #00aeec !important;
                    border: none !important;
                    outline: none !important;
                    color: #ffffff !important;
                    cursor: pointer;
                    display: flex !important;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 4px 14px rgba(0, 174, 236, 0.4);
                    transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease, background-color 0.2s ease;
                    flex-shrink: 0;
                    padding: 0 !important;
                }
                .bili-main-play-btn:hover {
                    transform: scale(1.08);
                    background: #00b8f6 !important;
                    box-shadow: 0 6px 20px rgba(0, 174, 236, 0.55);
                }
                .bili-main-play-btn:active {
                    transform: scale(0.94);
                }

                /* 辅助纯圆图标按键（快退/快进/设置齿轮） */
                .bili-circle-btn {
                    width: 32px;
                    height: 32px;
                    border-radius: 50% !important;
                    background: transparent;
                    border: 1px solid rgba(127,127,127,0.22);
                    color: inherit;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                    flex-shrink: 0;
                    padding: 0;
                }
                .bili-circle-btn:hover {
                    background: rgba(127,127,127,0.18);
                    transform: scale(1.06);
                }

                .bili-icon-btn {
                    width: 28px;
                    height: 28px;
                    border-radius: 50% !important;
                    background: transparent;
                    border: 1px solid rgba(127,127,127,0.2);
                    color: inherit;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                    flex-shrink: 0;
                    padding: 0;
                }
                .bili-icon-btn:hover {
                    background: rgba(127,127,127,0.18);
                    transform: scale(1.06);
                }

                /* 精致胶囊药丸按钮（倍速、音质、下载、看视频） */
                .bili-pill-btn {
                    background: rgba(127,127,127,0.12);
                    border: 1px solid rgba(127,127,127,0.2);
                    border-radius: 14px !important;
                    padding: 3px 10px;
                    font-size: 11px;
                    font-weight: 500;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    color: inherit;
                    transition: all 0.2s ease;
                    white-space: nowrap;
                    user-select: none;
                    flex-shrink: 0;
                }
                .bili-pill-btn:hover {
                    background: rgba(127,127,127,0.22);
                }

                /* 向上竖向展开毛玻璃选择菜单 */
                .bili-popup-menu {
                    display: none;
                    position: absolute;
                    bottom: calc(100% + 8px);
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(30, 32, 36, 0.95);
                    backdrop-filter: blur(14px);
                    -webkit-backdrop-filter: blur(14px);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 8px;
                    padding: 4px;
                    flex-direction: column;
                    gap: 2px;
                    min-width: 68px;
                    max-width: 90vw;
                    z-index: 60;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.45);
                }
                /* 右侧边缘胶囊（音质与字幕）弹出菜单靠右对齐，防止伸出卡片右边界被截断 */
                #bili-quality-container .bili-popup-menu,
                #bili-subtitle-container .bili-popup-menu {
                    left: auto !important;
                    right: 0 !important;
                    transform: none !important;
                }
                .bili-popup-menu.show {
                    display: flex !important;
                }
                .bili-popup-menu-item {
                    background: none;
                    border: none;
                    padding: 4px 10px;
                    font-size: 11px;
                    color: #e3e5e7;
                    border-radius: 4px;
                    cursor: pointer;
                    text-align: center;
                    white-space: nowrap;
                    transition: background 0.15s ease, color 0.15s ease;
                    font-family: inherit;
                }
                .bili-popup-menu-item:hover {
                    background: rgba(255, 255, 255, 0.14);
                    color: #ffffff;
                }
                .bili-popup-menu-item.active {
                    background: #00aeec !important;
                    color: #ffffff !important;
                    font-weight: 600;
                }

                /* 右上角偏好设置悬浮抽屉 */
                .bili-settings-drawer {
                    display: none;
                    position: absolute;
                    top: calc(100% + 8px);
                    right: 0;
                    width: 230px;
                    max-width: calc(100vw - 32px);
                    background: rgba(30, 32, 36, 0.96);
                    backdrop-filter: blur(16px);
                    -webkit-backdrop-filter: blur(16px);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 10px;
                    padding: 12px 14px;
                    box-shadow: 0 10px 28px rgba(0,0,0,0.5);
                    z-index: 100;
                    flex-direction: column;
                    gap: 10px;
                    text-align: left;
                    user-select: none;
                }
                .bili-settings-drawer.open {
                    display: flex !important;
                }
                .bili-setting-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 8px;
                }
                .bili-setting-label {
                    display: flex;
                    flex-direction: column;
                    font-size: 11px;
                    line-height: 1.3;
                }
                .bili-setting-sub {
                    font-size: 9.5px;
                    opacity: 0.6;
                    margin-top: 1px;
                }
                .bili-text-link {
                    background: none;
                    border: none;
                    color: #00aeec;
                    cursor: pointer;
                    padding: 0;
                    font-size: 10px;
                    text-decoration: underline;
                }

                /* iOS 拟态左右平滑滑动开关（Toggle Switch） */
                .bili-toggle-switch {
                    position: relative;
                    display: inline-block;
                    width: 32px;
                    height: 18px;
                    cursor: pointer;
                    flex-shrink: 0;
                    margin: 0;
                }
                .bili-toggle-switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                    position: absolute;
                    margin: 0;
                }
                .bili-toggle-slider {
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background-color: rgba(127, 127, 127, 0.35);
                    transition: 0.22s cubic-bezier(0.4, 0, 0.2, 1);
                    border-radius: 18px;
                }
                .bili-toggle-slider:before {
                    position: absolute;
                    content: "";
                    height: 14px;
                    width: 14px;
                    left: 2px;
                    bottom: 2px;
                    background-color: white;
                    transition: 0.22s cubic-bezier(0.4, 0, 0.2, 1);
                    border-radius: 50%;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                }
                .bili-toggle-switch input:checked + .bili-toggle-slider {
                    background-color: #00aeec;
                }
                .bili-toggle-switch input:checked + .bili-toggle-slider:before {
                    transform: translateX(14px);
                }

                /* 浅色模式主题适配覆盖 */
                #bili-audio-theme-panel[data-dark="false"] .bili-popup-menu {
                    background: rgba(255, 255, 255, 0.96);
                    border-color: rgba(0, 0, 0, 0.1);
                    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
                }
                #bili-audio-theme-panel[data-dark="false"] .bili-popup-menu-item {
                    color: #18191c;
                }
                #bili-audio-theme-panel[data-dark="false"] .bili-popup-menu-item:hover {
                    background: rgba(0, 0, 0, 0.06);
                    color: #18191c;
                }
                #bili-audio-theme-panel[data-dark="false"] .bili-settings-drawer {
                    background: rgba(255, 255, 255, 0.96);
                    border-color: rgba(0, 0, 0, 0.1);
                    box-shadow: 0 10px 28px rgba(0,0,0,0.14);
                    color: #18191c;
                }

                /* 双主题互斥展示强保障（避免外部样式或尺寸计算覆盖导致黑胶/播客重叠显示） */
                #bili-audio-card[data-style="podcast"] #bili-vinyl-wrap,
                #bili-audio-card[data-style="podcast"] #bili-vinyl-info,
                #bili-audio-card[data-style="podcast"] #bili-vinyl-title {
                    display: none !important;
                }
                #bili-audio-card[data-style="podcast"] #bili-podcast-wrap {
                    display: flex !important;
                }
                #bili-audio-card[data-style="vinyl"] #bili-podcast-wrap {
                    display: none !important;
                }
                #bili-audio-card[data-style="vinyl"] #bili-vinyl-wrap {
                    display: flex !important;
                }
                #bili-audio-card[data-style="vinyl"] #bili-vinyl-info {
                    display: flex !important;
                }

                /* 沉浸式网易云全屏垂直滚动歌词视窗与高亮渐变 */
                #bili-lyrics-scroll-wrap {
                    width: 100%;
                    height: 250px;
                    overflow: hidden;
                    position: relative;
                    user-select: none;
                    cursor: default;
                    box-sizing: border-box;
                    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 16%, black 84%, transparent 100%);
                    mask-image: linear-gradient(to bottom, transparent 0%, black 16%, black 84%, transparent 100%);
                }
                #bili-lyrics-list-container {
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    box-sizing: border-box;
                    padding: 24px 0;
                    will-change: transform;
                }
                .bili-lyric-item {
                    padding: 9px 18px;
                    margin: 2px 0;
                    border-radius: 8px;
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.44);
                    text-align: center;
                    line-height: 1.5;
                    cursor: pointer;
                    transition: all 0.28s cubic-bezier(0.25, 1, 0.5, 1);
                    max-width: 90%;
                    word-break: break-word;
                    user-select: none;
                }
                .bili-lyric-item:hover {
                    color: rgba(255, 255, 255, 0.8);
                    background: rgba(255, 255, 255, 0.06);
                }
                .bili-lyric-item.active {
                    font-size: 18px;
                    font-weight: 700;
                    color: #ffffff !important;
                    transform: scale(1.04);
                    text-shadow: 0 2px 14px rgba(0,0,0,0.5);
                }

                /* 单行轻量级居中字幕 */
                .bili-single-subtitle {
                    font-size: 13px;
                    font-weight: 500;
                    color: rgba(255, 255, 255, 0.88);
                    text-align: center;
                    line-height: 1.4;
                    transition: opacity 0.2s ease;
                    user-select: none;
                }
                .bili-single-subtitle:hover {
                    color: #00aeec !important;
                }

                /* 浅色模式主题适配覆盖 */
                #bili-audio-theme-panel[data-dark="false"] .bili-lyric-item {
                    color: rgba(0, 0, 0, 0.44);
                }
                #bili-audio-theme-panel[data-dark="false"] .bili-lyric-item:hover {
                    color: rgba(0, 0, 0, 0.82);
                    background: rgba(0, 0, 0, 0.05);
                }
                #bili-audio-theme-panel[data-dark="false"] .bili-lyric-item.active {
                    color: #18191c !important;
                    text-shadow: none;
                }
                #bili-audio-theme-panel[data-dark="false"] .bili-single-subtitle {
                    color: rgba(0, 0, 0, 0.85);
                }

                /* 歌词视窗、单行字幕与黑胶/播客卡片互斥展示强保障 */
                #bili-audio-card[data-sub-mode="scroll"] #bili-vinyl-wrap,
                #bili-audio-card[data-sub-mode="scroll"] #bili-vinyl-info,
                #bili-audio-card[data-sub-mode="scroll"] #bili-vinyl-title,
                #bili-audio-card[data-sub-mode="scroll"] #bili-podcast-wrap {
                    display: none !important;
                }
                #bili-audio-card[data-sub-mode="scroll"] #bili-lyrics-scroll-wrap {
                    display: flex !important;
                }
                #bili-audio-card:not([data-sub-mode="scroll"]) #bili-lyrics-scroll-wrap {
                    display: none !important;
                }

                #bili-audio-card[data-sub-mode="single"] .bili-single-subtitle {
                    display: block !important;
                }
                #bili-audio-card:not([data-sub-mode="single"]) .bili-single-subtitle {
                    display: none !important;
                }
            `;
            (document.head || document.documentElement).appendChild(panelStyle);
        } else {
            if (panelStyle.parentElement && panelStyle !== panelStyle.parentElement.lastElementChild) {
                panelStyle.parentElement.appendChild(panelStyle);
            }
        }

        audioPanelEl = document.createElement('div');
        audioPanelEl.id = 'bili-audio-theme-panel';
        audioPanelEl.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 100;
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            scrollbar-width: none;
            -ms-overflow-style: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            box-sizing: border-box;
            padding: 10px;
        `;

        // 核心防护：拦截并阻断大面板上所有的点击与指针事件向底层冒泡，彻底杜绝误触发原视频播放/暂停
        ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'touchstart'].forEach(eventType => {
            audioPanelEl.addEventListener(eventType, (e) => {
                e.stopPropagation();
            });
        });

        audioPanelEl.innerHTML = `
            <div id="bili-audio-card" data-style="${getPanelThemeStyle()}" data-sub-mode="${getSubtitleMode()}" style="border: 1px solid; border-radius: 12px; padding: 12px 20px; width: 70%; max-width: 880px; display: flex; flex-direction: column; align-items: center; box-sizing: border-box; transition: all 0.25s ease; position: relative;">
                
                <!-- 顶部栏：左侧风格切换胶囊，中间收听标识，右侧设置齿轮与悬浮抽屉 -->
                <div id="bili-audio-top-bar" style="width: 100%; display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; position: relative; z-index: 30;">
                    <!-- 左侧风格切换按钮 -->
                    <button id="bili-btn-toggle-style" class="bili-pill-btn" title="切换视觉风格（网易云黑胶 / 小宇宙播客）">
                        <span id="bili-style-text" style="display: inline-flex; align-items: center; gap: 4px;">${ICONS.PODCAST}播客</span>
                    </button>

                    <!-- 中间模式徽章（淡雅居中） -->
                    <div id="bili-audio-mode-badge" style="display: flex; align-items: center; gap: 6px; font-size: 11px; opacity: 0.65;">
                        <span style="display: inline-flex; align-items: center;">${ICONS.PODCAST}播客模式</span>
                        <span>•</span>
                        <span>画面已阻断</span>
                    </div>

                    <!-- 右侧设置按钮及悬浮设置抽屉 -->
                    <div style="position: relative;">
                        <button id="bili-btn-toggle-settings" class="bili-icon-btn" title="偏好设置">
                            ${ICONS.SETTINGS}
                        </button>

                        <!-- 悬浮偏好设置抽屉 -->
                        <div id="bili-audio-settings-drawer" class="bili-settings-drawer">
                            <div style="font-size: 12px; font-weight: 600; margin-bottom: 4px; opacity: 0.9; display: flex; align-items: center; justify-content: space-between;">
                                <span>播放偏好</span>
                                <span id="bili-memory-status-text" style="font-size: 10px; font-weight: normal; opacity: 0.8;"></span>
                            </div>
                            
                            <!-- 设置项 1：新视频默认听视频 -->
                            <div class="bili-setting-item">
                                <div class="bili-setting-label">
                                    <span>新视频默认开启</span>
                                    <span class="bili-setting-sub">打开视频时自动进入听视频</span>
                                </div>
                                <label class="bili-toggle-switch">
                                    <input type="checkbox" id="bili-setting-default-switch">
                                    <span class="bili-toggle-slider"></span>
                                </label>
                            </div>

                            <!-- 设置项 2：单曲循环 -->
                            <div class="bili-setting-item">
                                <div class="bili-setting-label">
                                    <span>单曲循环</span>
                                    <span class="bili-setting-sub">与官方播放器洗脑循环联动</span>
                                </div>
                                <label class="bili-toggle-switch">
                                    <input type="checkbox" id="bili-setting-loop-switch">
                                    <span class="bili-toggle-slider"></span>
                                </label>
                            </div>

                            <!-- 设置项 3：独立记忆本视频 -->
                            <div class="bili-setting-item">
                                <div class="bili-setting-label">
                                    <div style="display: flex; align-items: center; gap: 4px;">
                                        <span>独立记忆模式</span>
                                        <button id="bili-btn-reset-memory" class="bili-text-link" title="清除本视频独立记忆">清除</button>
                                    </div>
                                    <span class="bili-setting-sub">单独记住此视频是否听视频</span>
                                </div>
                                <label class="bili-toggle-switch">
                                    <input type="checkbox" id="bili-setting-memory-switch">
                                    <span class="bili-toggle-slider"></span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 小宇宙现代播客大卡片交互视窗（16:9 原比例高质感大圆角封面 + 弥散流光光晕） -->
                <div id="bili-podcast-wrap" style="position: relative; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 4px 0 10px 0; user-select: none;">
                    <div style="position: relative; display: flex; align-items: center; justify-content: center; margin-bottom: 8px;">
                        <!-- 弥散环境光晕层 -->
                        <div id="bili-podcast-ambient-glow" style="position: absolute; width: 92%; height: 88%; border-radius: 16px; filter: blur(22px); opacity: 0.55; z-index: 1; pointer-events: none; transition: opacity 0.3s ease, width 0.25s ease, height 0.25s ease;"></div>
                        <!-- 16:9 高质感圆角大封面卡片 -->
                        <div id="bili-podcast-artwork" style="position: relative; z-index: 2; width: 320px; height: 180px; border-radius: 12px; background-size: cover; background-position: center; background-repeat: no-repeat; box-shadow: 0 10px 28px rgba(0,0,0,0.35); cursor: pointer; transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease, width 0.25s ease, height 0.25s ease;" title="点击播放/暂停">
                            <!-- 播客收听状态胶囊标贴 -->
                            <div style="position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,0.68); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); padding: 3px 8px; border-radius: 10px; font-size: 10px; color: #ffffff; display: flex; align-items: center; gap: 4px; pointer-events: none; border: 1px solid rgba(255,255,255,0.15);">
                                <span style="width: 6px; height: 6px; border-radius: 50%; background: #00aeec; display: inline-block;"></span>
                                <span id="bili-podcast-badge-text">正在收听</span>
                            </div>
                        </div>
                    </div>
                    <!-- 播客模式视频大标题与主播信息 -->
                    <div id="bili-podcast-title" style="font-size: 15px; font-weight: 600; text-align: center; max-width: 90%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; cursor: default;" title="">
                        Bilibili 纯音频播客
                    </div>
                    <div id="bili-podcast-author" style="display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 12px; opacity: 0.8; margin-bottom: 2px;">
                        <span style="opacity: 0.7;">主播:</span>
                        <span id="bili-podcast-author-name" style="font-weight: 500; max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">哔哩哔哩 UP主</span>
                    </div>
                    <!-- 播客单行轻量字幕节点 -->
                    <div id="bili-podcast-single-subtitle" class="bili-single-subtitle" style="margin-top: 4px; max-width: 90%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;" title="点击展开全屏滚动歌词"></div>
                </div>

                <!-- 网易云黑胶唱片与留声机唱针交互区 -->
                <div id="bili-vinyl-wrap" style="position: relative; width: 220px; height: 200px; display: none; align-items: center; justify-content: center; margin: 2px 0 6px 0; user-select: none;">
                    <!-- 仿真留声机唱针缩放定位容器 -->
                    <div id="bili-vinyl-needle-scaler" style="position: absolute; top: -16px; left: 108px; width: 44px; height: 102px; pointer-events: none; z-index: 10; transform-origin: 16px 16px; transform: scale(1); transition: left 0.25s cubic-bezier(0.25, 1, 0.5, 1), top 0.25s cubic-bezier(0.25, 1, 0.5, 1), transform 0.25s cubic-bezier(0.25, 1, 0.5, 1);">
                        <div id="bili-vinyl-needle-wrap" style="width: 44px; height: 102px; transform-origin: 16px 16px; transform: rotate(-73deg); transition: transform 0.45s cubic-bezier(0.4, 0, 0.2, 1); filter: drop-shadow(0 3px 6px rgba(0,0,0,0.45));">
                            <svg width="44" height="102" viewBox="0 0 44 102" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="16" cy="16" r="14" fill="#2d3035" stroke="#4b5058" stroke-width="2.5"/>
                                <circle cx="16" cy="16" r="7" fill="#6b7280"/>
                                <circle cx="16" cy="16" r="3" fill="#1f2124"/>
                                <path d="M16 16 L22 72 L16 92" stroke="#d1d5db" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                                <rect x="8" y="88" width="16" height="10" rx="2" fill="#1f2124" stroke="#9ca3af" stroke-width="1.5" transform="rotate(-12 16 93)"/>
                            </svg>
                        </div>
                    </div>

                    <!-- 实体黑胶唱盘主体（多重同心圆沟槽质感） -->
                    <div id="bili-vinyl-disc" class="bili-vinyl-disc" style="position: relative; width: 196px; height: 196px; border-radius: 50% !important; -webkit-border-radius: 50% !important; clip-path: circle(50% at 50% 50%) !important; -webkit-clip-path: circle(50% at 50% 50%) !important; overflow: hidden !important; background: repeating-radial-gradient(circle at center, #111111 0, #111111 2px, #222222 3px, #151515 4px, #0d0d0d 6px); box-shadow: 0 8px 24px rgba(0,0,0,0.5), inset 0 0 0 3px rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: filter 0.2s ease;" title="点击播放/暂停">
                        <!-- 黑胶内圈圆形封面 -->
                        <div id="bili-vinyl-cover" style="width: 122px; height: 122px; border-radius: 50% !important; -webkit-border-radius: 50% !important; clip-path: circle(50% at 50% 50%) !important; -webkit-clip-path: circle(50% at 50% 50%) !important; overflow: hidden !important; background-size: cover; background-position: center; border: 3px solid #111111; box-shadow: inset 0 0 10px rgba(0,0,0,0.6), 0 0 4px rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; position: relative;">
                            <!-- 中心金属轴心孔 -->
                            <div id="bili-vinyl-center-hole" style="width: 20px; height: 20px; border-radius: 50% !important; -webkit-border-radius: 50% !important; clip-path: circle(50% at 50% 50%) !important; -webkit-clip-path: circle(50% at 50% 50%) !important; background: radial-gradient(circle, #000 0%, #000 30%, #e5e7eb 34%, #9ca3af 65%, #374151 100%); box-shadow: 0 1px 3px rgba(0,0,0,0.8); z-index: 2;"></div>
                        </div>
                    </div>
                </div>

                <!-- 黑胶模式曲目标题与 UP 主（网易云居中排版） -->
                <div id="bili-vinyl-info" style="display: none; flex-direction: column; align-items: center; justify-content: center; margin-top: 4px; margin-bottom: 8px; max-width: 90%; text-align: center; user-select: none;">
                    <div id="bili-vinyl-title" style="font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; cursor: default;" title="">
                        Bilibili 纯音频模式
                    </div>
                    <div id="bili-vinyl-author" style="font-size: 12px; opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; margin-top: 2px; cursor: default;" title="">
                        哔哩哔哩 UP主
                    </div>
                    <!-- 黑胶单行轻量字幕节点 -->
                    <div id="bili-single-subtitle" class="bili-single-subtitle" style="margin-top: 6px; max-width: 96%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;" title="点击展开全屏滚动歌词"></div>
                </div>

                <!-- 沉浸式网易云全屏垂直滚动歌词视窗 -->
                <div id="bili-lyrics-scroll-wrap" style="position: relative; width: 100%; height: 250px; overflow: hidden; display: none; flex-direction: column; align-items: center; justify-content: flex-start; margin: 4px 0 10px 0; user-select: none;">
                    <!-- 顶部悬浮返回封面胶囊 -->
                    <div style="position: absolute; top: 0; right: 0; z-index: 20; padding: 4px 6px;">
                        <button id="bili-btn-lyrics-back" class="bili-pill-btn" style="font-size: 10px; padding: 2px 8px;" title="返回封面/唱片视图">
                            <span>返回封面</span>
                        </button>
                    </div>
                    <!-- 歌词垂直平滑滚动列表容器 -->
                    <div id="bili-lyrics-list-container" class="bili-lyrics-list-container" style="width: 100%; display: flex; flex-direction: column; align-items: center; transition: transform 0.35s cubic-bezier(0.25, 1, 0.5, 1); will-change: transform;"></div>
                </div>

                <!-- 底层原生音频驱动节点（隐藏 controls，由自定义 UI 精确驱动） -->
                <audio id="bili-native-audio" style="display: none;"></audio>

                <!-- 自定义纯音频控制器 -->
                <div id="bili-audio-control-bar" style="width: 100%; display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; box-sizing: border-box; user-select: none;">
                    <!-- 1. 播放进度条区域 -->
                    <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                        <span id="bili-audio-time-current" style="font-size: 12px; font-variant-numeric: tabular-nums; opacity: 0.8; min-width: 42px; text-align: right;">00:00</span>
                        <div id="bili-audio-progress-wrap" class="bili-slider-wrap" style="flex: 1; height: 20px; display: flex; align-items: center; cursor: pointer; position: relative;">
                            <div id="bili-audio-progress-track" class="bili-slider-track" style="width: 100%; height: 5px; border-radius: 3px; background: rgba(127,127,127,0.25); position: relative; transition: height 0.15s ease;">
                                <div id="bili-audio-progress-bar" style="position: absolute; left: 0; top: 0; height: 100%; width: 0%; background: #00aeec; border-radius: 3px; pointer-events: none;"></div>
                                <div id="bili-audio-progress-thumb" class="bili-slider-thumb" style="position: absolute; top: 50%; left: 0%; transform: translate(-50%, -50%); width: 11px; height: 11px; border-radius: 50%; background: #00aeec; box-shadow: 0 1px 4px rgba(0,0,0,0.35); pointer-events: none; transition: transform 0.15s ease;"></div>
                            </div>
                        </div>
                        <span id="bili-audio-time-total" style="font-size: 12px; font-variant-numeric: tabular-nums; opacity: 0.6; min-width: 42px;">00:00</span>
                    </div>

                    <!-- 2. 主控按键与胶囊选项行 -->
                    <div id="bili-audio-main-controls" style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 2px 0;">
                        <!-- 左侧快捷组：循环模式按钮、下载音频按钮、音量条 -->
                        <div id="bili-audio-ctrl-left" style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                            <button id="bili-btn-loop-mode" class="bili-pill-btn" title="单曲循环播放切换">
                                ${ICONS.LOOP}
                            </button>
                            <button id="bili-audio-download-btn" class="bili-pill-btn" title="下载当前音频直链">
                                ${ICONS.DOWNLOAD}
                                <span>下载</span>
                            </button>
                            <div style="display: flex; align-items: center; gap: 4px; margin-left: 2px;">
                                <button id="bili-audio-volume-btn" style="background: none; border: none; padding: 0; cursor: pointer; display: flex; align-items: center; color: inherit; opacity: 0.85;" title="静音/取消静音">
                                    ${ICONS.VOLUME_HIGH}
                                </button>
                                <div id="bili-audio-volume-wrap" class="bili-slider-wrap" style="width: 66px; height: 20px; display: flex; align-items: center; cursor: pointer; position: relative;">
                                    <div id="bili-audio-volume-track" class="bili-slider-track" style="width: 100%; height: 4px; border-radius: 2px; background: rgba(127,127,127,0.25); position: relative; transition: height 0.15s ease;">
                                        <div id="bili-audio-volume-bar" style="position: absolute; left: 0; top: 0; height: 100%; width: 100%; background: #00aeec; border-radius: 2px; pointer-events: none;"></div>
                                        <div id="bili-audio-volume-thumb" class="bili-slider-thumb" style="position: absolute; top: 50%; left: 100%; transform: translate(-50%, -50%); width: 10px; height: 10px; border-radius: 50%; background: #00aeec; box-shadow: 0 1px 4px rgba(0,0,0,0.35); pointer-events: none; transition: transform 0.15s ease;"></div>
                                    </div>
                                </div>
                                <span id="bili-audio-volume-text" style="font-size: 11px; font-variant-numeric: tabular-nums; opacity: 0.7; min-width: 30px;">100%</span>
                            </div>
                        </div>

                        <!-- 中间主播放区：±15s 快退快进 + 纯圆大播放键（双模式通用） -->
                        <div id="bili-audio-ctrl-center" style="display: flex; align-items: center; gap: 14px; flex-shrink: 0;">
                            <button id="bili-btn-backward-15" class="bili-circle-btn" style="display: inline-flex;" title="快退 15 秒">
                                ${ICONS.BACKWARD_15}
                            </button>
                            <button id="bili-btn-play-pause" class="bili-main-play-btn" title="播放/暂停 (空格键)">
                                ${ICONS.PAUSE_ROUND}
                            </button>
                            <button id="bili-btn-forward-15" class="bili-circle-btn" style="display: inline-flex;" title="快进 15 秒">
                                ${ICONS.FORWARD_15}
                            </button>
                        </div>

                        <!-- 右侧功能组：倍速胶囊（竖向菜单）、音质胶囊（竖向菜单）、字幕胶囊（竖向菜单）、恢复看视频 -->
                        <div id="bili-audio-ctrl-right" style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                            <div class="bili-dropdown-container" id="bili-speed-container" style="position: relative;">
                                <button id="bili-speed-pill-btn" class="bili-pill-btn" title="播放倍速调节">
                                    <span id="bili-speed-pill-text">1.0x</span>
                                    ${ICONS.CHEVRON_UP}
                                </button>
                                <div id="bili-speed-popup-menu" class="bili-popup-menu">
                                    <button class="bili-popup-menu-item" data-rate="2.0">2.0x</button>
                                    <button class="bili-popup-menu-item" data-rate="1.5">1.5x</button>
                                    <button class="bili-popup-menu-item" data-rate="1.25">1.25x</button>
                                    <button class="bili-popup-menu-item active" data-rate="1.0">1.0x</button>
                                    <button class="bili-popup-menu-item" data-rate="0.75">0.75x</button>
                                    <button class="bili-popup-menu-item" data-rate="0.5">0.5x</button>
                                </div>
                            </div>

                            <div class="bili-dropdown-container" id="bili-quality-container" style="position: relative;">
                                <button id="bili-quality-pill-btn" class="bili-pill-btn" title="音频品质切换">
                                    <span id="bili-quality-pill-text">标准音质</span>
                                    ${ICONS.CHEVRON_UP}
                                </button>
                                <div id="bili-quality-popup-menu" class="bili-popup-menu"></div>
                            </div>

                            <div class="bili-dropdown-container" id="bili-subtitle-container" style="position: relative;">
                                <button id="bili-subtitle-pill-btn" class="bili-pill-btn" title="字幕与滚动歌词设置">
                                    ${ICONS.SUBTITLE}
                                    <span id="bili-subtitle-pill-text">字幕: 关</span>
                                    ${ICONS.CHEVRON_UP}
                                </button>
                                <div id="bili-subtitle-popup-menu" class="bili-popup-menu" style="min-width: 105px;"></div>
                            </div>

                            <button id="bili-btn-restore" class="bili-pill-btn" style="color: #00aeec; border-color: rgba(0,174,236,0.35);" title="恢复看视频">
                                ${ICONS.SCREEN}
                                <span>看视频</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const computedPos = window.getComputedStyle(container).position;
        if (computedPos === 'static') {
            container.style.position = 'relative';
        }

        if (insertBeforeNode && insertBeforeNode.parentElement === container) {
            container.insertBefore(audioPanelEl, insertBeforeNode);
        } else {
            container.appendChild(audioPanelEl);
        }

        customAudioEl = audioPanelEl.querySelector('#bili-native-audio');
        if (customAudioEl) {
            const initVol = getSavedUserVolume();
            const initMuted = getSavedUserMuted();
            customAudioEl.volume = initVol;
            customAudioEl.muted = initMuted;
            customAudioEl.loop = getRepeatState();

            // 播放与发声事件：立刻解除寻道锁，并更新按钮为暂停音频状态
            customAudioEl.onplay = handleAudioPlayOrPlaying;
            customAudioEl.onplaying = handleAudioPlayOrPlaying;

            // 暂停事件：加入 120ms 防抖过滤，过滤调整进度条时浏览器派发的微秒级假 pause
            customAudioEl.onpause = handleAudioPause;

            // 寻道状态锁定与延迟平息解锁
            const lockSeeking = () => {
                isSeekingOperation = true;
                if (pauseDebounceTimer) {
                    clearTimeout(pauseDebounceTimer);
                    pauseDebounceTimer = null;
                }
                if (seekSettleTimer) {
                    clearTimeout(seekSettleTimer);
                    seekSettleTimer = null;
                }
            };
            const unlockSeekingDebounced = () => {
                if (seekSettleTimer) clearTimeout(seekSettleTimer);
                seekSettleTimer = setTimeout(() => {
                    isSeekingOperation = false;
                    updatePlayPauseBtnState();
                }, 200);
            };

            customAudioEl.onseeking = lockSeeking;
            customAudioEl.onseeked = unlockSeekingDebounced;

            // 指针交互前置监听：在用户手指或鼠标接触原生控制条瞬间立即锁定，抢在底层 pause 派发前生效
            customAudioEl.addEventListener('pointerdown', lockSeeking, { passive: true });
            customAudioEl.addEventListener('mousedown', lockSeeking, { passive: true });
            customAudioEl.addEventListener('touchstart', lockSeeking, { passive: true });
            window.addEventListener('pointerup', unlockSeekingDebounced, { passive: true });
            window.addEventListener('mouseup', unlockSeekingDebounced, { passive: true });
            window.addEventListener('touchend', unlockSeekingDebounced, { passive: true });

            customAudioEl.addEventListener('ended', () => {
                if (getRepeatState()) {
                    try {
                        customAudioEl.currentTime = 0;
                        customAudioEl.play().catch(() => {});
                    } catch {}
                } else {
                    setVideoProgress(getVideoKey(), 0, 0);
                    updatePlayPauseBtnState(true);
                }
            });
            customAudioEl.addEventListener('timeupdate', () => {
                updateCustomPlayerUI();
                syncSubtitleHighlight(customAudioEl.currentTime);
                if (!isAudioHandoverPending) {
                    syncAudioProgressToVideoAndStorage(false);
                }
            });
            customAudioEl.addEventListener('loadedmetadata', () => {
                updateCustomPlayerUI();
                updateVinylMeta();
            });
            customAudioEl.addEventListener('durationchange', () => {
                updateCustomPlayerUI();
            });
            customAudioEl.addEventListener('error', () => {
                const err = customAudioEl.error;
                console.warn('[BiliAudio] 音频元素播放/加载出错 (可能是 CDN 签名过期 403 或网络中断):', err?.code, err?.message);
                const curId = getCurrentVideoIdentity();
                if (curId) evictAudioCache(curId);
                currentAudioUrl = null;
                // 启动静默续期拉取自愈
                requestFreshAudioSource(true);
            });
            customAudioEl.addEventListener('volumechange', () => {
                if (!isSyncingVolume) {
                    syncVolumeAudioToVideo();
                }
                updateCustomPlayerUI();
            });
        }

        // 默认开关勾选变动
        const defaultSwitch = audioPanelEl.querySelector('#bili-setting-default-switch');
        if (defaultSwitch) {
            defaultSwitch.checked = getGlobalDefault();
            defaultSwitch.onchange = (e) => {
                setGlobalDefault(e.target.checked);
                updateMemoryStatusDisplay();
            };
        }

        // 单曲循环开关勾选变动
        const loopSwitch = audioPanelEl.querySelector('#bili-setting-loop-switch');
        if (loopSwitch) {
            loopSwitch.checked = getRepeatState();
            loopSwitch.onchange = (e) => {
                setRepeatState(e.target.checked, true);
            };
        }

        // 单曲循环底栏快捷胶囊按钮
        const loopModeBtn = audioPanelEl.querySelector('#bili-btn-loop-mode');
        if (loopModeBtn) {
            loopModeBtn.onclick = (e) => {
                e.stopPropagation();
                setRepeatState(!getRepeatState(), true);
            };
        }

        // 独立记忆开关变动
        const memorySwitch = audioPanelEl.querySelector('#bili-setting-memory-switch');
        if (memorySwitch) {
            const curKey = getVideoKey();
            const curMem = getVideoMemory(curKey);
            memorySwitch.checked = (curMem !== undefined ? Boolean(curMem) : Boolean(getGlobalDefault()));
            memorySwitch.onchange = (e) => {
                setVideoMemory(curKey, e.target.checked);
                updateMemoryStatusDisplay();
            };
        }

        // 清除本视频独立记忆
        const resetMemoryBtn = audioPanelEl.querySelector('#bili-btn-reset-memory');
        if (resetMemoryBtn) {
            resetMemoryBtn.onclick = (e) => {
                e.stopPropagation();
                clearVideoMemory(getVideoKey());
                updateMemoryStatusDisplay();
            };
        }

        // 设置齿轮抽屉展开/收起切换
        const settingsBtn = audioPanelEl.querySelector('#bili-btn-toggle-settings');
        const settingsDrawer = audioPanelEl.querySelector('#bili-audio-settings-drawer');
        if (settingsBtn && settingsDrawer) {
            settingsBtn.onclick = (e) => {
                e.stopPropagation();
                settingsDrawer.classList.toggle('open');
            };
        }

        // 点击大面板空白处自动收起悬浮抽屉与弹出菜单
        audioPanelEl.addEventListener('click', (e) => {
            if (settingsDrawer && !settingsDrawer.contains(e.target) && (!settingsBtn || !settingsBtn.contains(e.target))) {
                settingsDrawer.classList.remove('open');
            }
            const speedContainer = audioPanelEl.querySelector('#bili-speed-container');
            const speedMenu = audioPanelEl.querySelector('#bili-speed-popup-menu');
            if (speedMenu && speedContainer && !speedContainer.contains(e.target)) {
                speedMenu.classList.remove('show');
            }
            const qualityContainer = audioPanelEl.querySelector('#bili-quality-container');
            const qualityMenu = audioPanelEl.querySelector('#bili-quality-popup-menu');
            if (qualityMenu && qualityContainer && !qualityContainer.contains(e.target)) {
                qualityMenu.classList.remove('show');
            }
            const subtitleContainer = audioPanelEl.querySelector('#bili-subtitle-container');
            const subtitleMenu = audioPanelEl.querySelector('#bili-subtitle-popup-menu');
            if (subtitleMenu && subtitleContainer && !subtitleContainer.contains(e.target)) {
                subtitleMenu.classList.remove('show');
            }
        });

        // 倍速胶囊与竖向弹出菜单事件绑定
        const speedPillBtn = audioPanelEl.querySelector('#bili-speed-pill-btn');
        const speedMenu = audioPanelEl.querySelector('#bili-speed-popup-menu');
        const speedPillText = audioPanelEl.querySelector('#bili-speed-pill-text');
        if (speedPillBtn && speedMenu) {
            speedPillBtn.onclick = (e) => {
                e.stopPropagation();
                speedMenu.classList.toggle('show');
                const qm = audioPanelEl.querySelector('#bili-quality-popup-menu');
                if (qm) qm.classList.remove('show');
                const sm = audioPanelEl.querySelector('#bili-subtitle-popup-menu');
                if (sm) sm.classList.remove('show');
            };
        }
        audioPanelEl.querySelectorAll('#bili-speed-popup-menu .bili-popup-menu-item').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const rate = parseFloat(btn.dataset.rate);
                if (customAudioEl) customAudioEl.playbackRate = rate;
                audioPanelEl.querySelectorAll('#bili-speed-popup-menu .bili-popup-menu-item').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (speedPillText) speedPillText.textContent = `${rate}x`;
                if (speedMenu) speedMenu.classList.remove('show');
                applyThemeToPanel();
            };
        });

        // 音质胶囊药丸按钮点击展开/收起竖向菜单
        const qualityPillBtn = audioPanelEl.querySelector('#bili-quality-pill-btn');
        const qualityMenu = audioPanelEl.querySelector('#bili-quality-popup-menu');
        if (qualityPillBtn && qualityMenu) {
            qualityPillBtn.onclick = (e) => {
                e.stopPropagation();
                qualityMenu.classList.toggle('show');
                if (speedMenu) speedMenu.classList.remove('show');
                const sm = audioPanelEl.querySelector('#bili-subtitle-popup-menu');
                if (sm) sm.classList.remove('show');
            };
        }

        // 字幕胶囊药丸按钮点击展开/收起竖向菜单
        const subtitlePillBtn = audioPanelEl.querySelector('#bili-subtitle-pill-btn');
        const subtitleMenu = audioPanelEl.querySelector('#bili-subtitle-popup-menu');
        if (subtitlePillBtn && subtitleMenu) {
            subtitlePillBtn.onclick = (e) => {
                e.stopPropagation();
                subtitleMenu.classList.toggle('show');
                if (speedMenu) speedMenu.classList.remove('show');
                if (qualityMenu) qualityMenu.classList.remove('show');
            };
        }

        // 单行轻量字幕点击直达全屏滚动歌词视窗
        const singleSubEl = audioPanelEl.querySelector('#bili-single-subtitle');
        const podcastSingleSubEl = audioPanelEl.querySelector('#bili-podcast-single-subtitle');
        const onSingleSubClick = (e) => {
            e.stopPropagation();
            setSubtitleMode('scroll');
            applySubtitleModeToUI();
            updateSubtitleMenu();
        };
        if (singleSubEl) singleSubEl.onclick = onSingleSubClick;
        if (podcastSingleSubEl) podcastSingleSubEl.onclick = onSingleSubClick;

        // 全屏歌词视窗“返回封面”按钮事件绑定
        const lyricsBackBtn = audioPanelEl.querySelector('#bili-btn-lyrics-back');
        if (lyricsBackBtn) {
            lyricsBackBtn.onclick = (e) => {
                e.stopPropagation();
                setSubtitleMode('single');
                applySubtitleModeToUI();
                updateSubtitleMenu();
            };
        }

        const toggleAudioPlayback = () => {
            if (!customAudioEl) return;
            if (pauseDebounceTimer) {
                clearTimeout(pauseDebounceTimer);
                pauseDebounceTimer = null;
            }
            if (seekSettleTimer) {
                clearTimeout(seekSettleTimer);
                seekSettleTimer = null;
            }
            isSeekingOperation = false;

            if (customAudioEl.paused) {
                // 时效性安全体检：若当前音频直链已失效过期，立即主动换源，避免向 CDN 提交死请求
                if (!currentAudioUrl || isAudioUrlExpired(currentAudioUrl) || customAudioEl.error) {
                    console.info('[BiliAudio] 点击起播检测到音源已过期或异常，启动新鲜音源续期...');
                    currentAudioUrl = null;
                    const curId = getCurrentVideoIdentity();
                    if (curId) evictAudioCache(curId);
                    requestFreshAudioSource(true);
                } else {
                    const p = customAudioEl.play();
                    if (p && typeof p.catch === 'function') {
                        p.catch((err) => {
                            console.warn('[BiliAudio] play() 失败，启动新鲜音源重拉自愈:', err);
                            requestFreshAudioSource(true);
                        });
                    }
                }
            } else {
                customAudioEl.pause();
            }
            updatePlayPauseBtnState(true);
        };

        // 播放/暂停点击事件
        const playPauseBtn = audioPanelEl.querySelector('#bili-btn-play-pause');
        if (playPauseBtn) {
            playPauseBtn.onclick = toggleAudioPlayback;
        }

        // 恢复看视频点击事件（用户显式行为，记录关闭记忆）
        const restoreBtn = audioPanelEl.querySelector('#bili-btn-restore');
        if (restoreBtn) {
            restoreBtn.onclick = () => setAudioMode(false, true);
        }

        // 黑胶唱盘点击事件：点击黑胶唱盘或封面即可直接切换播放/暂停
        const vinylDisc = audioPanelEl.querySelector('#bili-vinyl-disc');
        if (vinylDisc) {
            vinylDisc.onclick = toggleAudioPlayback;
        }

        // 播客大封面点击事件：点击封面直接切换播放/暂停
        const podcastArtwork = audioPanelEl.querySelector('#bili-podcast-artwork');
        if (podcastArtwork) {
            podcastArtwork.onclick = toggleAudioPlayback;
        }

        // 播客专属 ±15s 快退快进点击事件
        const btnBackward15 = audioPanelEl.querySelector('#bili-btn-backward-15');
        if (btnBackward15) {
            btnBackward15.onclick = () => {
                if (!customAudioEl) return;
                const cur = customAudioEl.currentTime || 0;
                const target = Math.max(0, cur - 15);
                try {
                    customAudioEl.currentTime = target;
                } catch {}
                syncAudioProgressToVideoAndStorage(true);
                updateCustomPlayerUI();
                syncSubtitleHighlight(target, true);
            };
        }

        const btnForward15 = audioPanelEl.querySelector('#bili-btn-forward-15');
        if (btnForward15) {
            btnForward15.onclick = () => {
                if (!customAudioEl) return;
                const cur = customAudioEl.currentTime || 0;
                const dur = (typeof getCurrentMediaDuration === 'function') ? getCurrentMediaDuration() : (customAudioEl.duration || 0);
                const validDur = (Number.isFinite(dur) && dur > 0) ? dur : 0;
                let target = cur + 15;
                if (validDur > 3 && target >= validDur - 3) {
                    target = Math.max(0, validDur - 3);
                }
                try {
                    customAudioEl.currentTime = target;
                } catch {}
                syncAudioProgressToVideoAndStorage(true);
                updateCustomPlayerUI();
                syncSubtitleHighlight(target, true);
            };
        }

        // 视觉风格双主题切换点击事件（播客卡片 / 黑胶留声机）
        const toggleStyleBtn = audioPanelEl.querySelector('#bili-btn-toggle-style');
        if (toggleStyleBtn) {
            toggleStyleBtn.onclick = () => {
                const curStyle = getPanelThemeStyle();
                const nextStyle = curStyle === 'podcast' ? 'vinyl' : 'podcast';
                setPanelThemeStyle(nextStyle);
                applyThemeStyleToUI();
                applyThemeToPanel();
            };
        }

        bindCustomPlayerControls();
        bindLyricsScrollEvents();
        updateCustomPlayerUI();
        renderQualityButtons();
        applySubtitleModeToUI();
        updateSubtitleMenu();
        loadSubtitleForCurrentVideo();
        applyThemeToPanel();
        updateVinylMeta();
        setupPanelResizeObserver();
        updateAudioCardResponsiveSize();
        setupVinylDefenseObserver();
        enforceVinylCircleDefense();
    }

    // 14. 挂载按钮至播放器底部控制栏（完全采用原生倍速/清晰度相同结构，无缝融入底栏，无悬停菜单）
    function mountToggleButton() {
        const controlRight = document.querySelector('.bpx-player-control-bottom-right, .bilibili-player-video-control-bottom-right');
        if (!controlRight) return;
        if (controlRight.querySelector('#bili-audio-ctrl-btn')) return;

        toggleBtnEl = document.createElement('div');
        toggleBtnEl.id = 'bili-audio-ctrl-btn';
        // 完全复用 B 站原生纯文本控制按钮类名体系
        toggleBtnEl.className = 'bpx-player-ctrl-btn bpx-player-ctrl-playbackrate';
        toggleBtnEl.setAttribute('role', 'button');
        toggleBtnEl.setAttribute('aria-label', '听视频');
        toggleBtnEl.setAttribute('tabindex', '0');

        toggleBtnEl.innerHTML = `<div class="bpx-player-ctrl-playbackrate-result" id="bili-audio-btn-text" style="cursor: pointer; user-select: none;">听视频</div>`;
        const onToggleClick = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            setAudioMode(!isAudioMode, true);
        };
        toggleBtnEl.onclick = onToggleClick;
        toggleBtnEl.addEventListener('click', onToggleClick, true);

        // 精确插入在清晰度按钮前，与清晰度、倍速紧挨排列，彻底脱离扩展插件容器
        const qualityBtn = controlRight.querySelector('.bpx-player-ctrl-quality');
        if (qualityBtn) {
            controlRight.insertBefore(toggleBtnEl, qualityBtn);
        } else {
            controlRight.insertBefore(toggleBtnEl, controlRight.firstChild);
        }

        updateToggleButtonState();
    }

    // 14. DOM 动态监听与初始化
    function init() {
        if (window.__playinfo__) {
            const playinfoId = extractPayloadIdentity(null, window.__playinfo__);
            const curId = getCurrentVideoIdentity();
            if (isPayloadMatchingCurrent(playinfoId, curId)) {
                extractPlayInfo(window.__playinfo__, true, '');
            }
        }

        // 监听 SPA 换 P / 换视频，按新视频逻辑独立判断
        let lastVideoKey = getVideoKey();
        restoreTrafficStatsForCurrentVideo(lastVideoKey);

        window.addEventListener('beforeunload', () => {
            flushCurrentTrafficStats();
            syncAudioProgressToVideoAndStorage(true, getVideoKey(), false);
        });
        window.addEventListener('pagehide', () => {
            flushCurrentTrafficStats();
            syncAudioProgressToVideoAndStorage(true, getVideoKey(), false);
        });

        const handleVideoChange = () => {
            const currentKey = getVideoKey();
            isVideoSwitchPending = true;
            isAudioHandoverPending = false; // 重置交接屏障锁

            // 0. 重置寻道锁与防抖状态
            if (pauseDebounceTimer) {
                clearTimeout(pauseDebounceTimer);
                pauseDebounceTimer = null;
            }
            if (seekSettleTimer) {
                clearTimeout(seekSettleTimer);
                seekSettleTimer = null;
            }
            isSeekingOperation = false;

            // 黑胶唱针平滑抬起复位，杜绝上一视频视觉残留
            if (audioPanelEl) {
                const needleEl = audioPanelEl.querySelector('#bili-vinyl-needle-wrap');
                if (needleEl) needleEl.style.transform = 'rotate(-73deg)';
            }

            // 1. 判断当前音源是否已经被网络请求提前解析并装载为新视频音频
            const isAlreadyNewVideoAudio = currentAudioVideoKey && (currentAudioVideoKey === currentKey);

            if (!isAlreadyNewVideoAudio) {
                // 确实属于旧视频的陈旧音频流：彻底停止并卸载，杜绝串歌与声音残留
                if (customAudioEl) {
                    try {
                        customAudioEl.pause();
                        customAudioEl.removeAttribute('src');
                        customAudioEl.currentTime = 0;
                        customAudioEl.load();
                    } catch {}
                }
                if (standbyAudioEl) {
                    try {
                        standbyAudioEl.pause();
                        standbyAudioEl.removeAttribute('src');
                        standbyAudioEl.currentTime = 0;
                        standbyAudioEl.load();
                    } catch {}
                }

                currentAudioUrl = null;
                availableAudioTracks = [];
                currentAudioQualityId = null;
                currentVideoDuration = 0;
                availableSubtitleTracks = [];
                currentSubtitleTrackId = null;
                currentSubtitleList = [];
                activeSubtitleIndex = -1;
                isUserScrollingLyrics = false;
                renderLyricsList();
                updateSubtitleMenu();
                applySubtitleModeToUI();
                restoreTrafficStatsForCurrentVideo(currentKey);
                renderQualityButtons();
                updateCustomPlayerUI();
                loadSubtitleForCurrentVideo(true);

                // 尝试从音轨缓存池中瞬时命中提前返回的新视频音轨
                const currentId = getCurrentVideoIdentity();
                const cached = getFromAudioCache(currentId);
                if (cached) {
                    applyAudioTracks(cached.tracks, cached.videoBandwidth, currentKey, cached.duration);
                }
            }

            // 2. 根据新视频独立记忆或全局配置应用模式
            const decision = shouldAudioModeBeActive(currentKey);

            if (decision.active) {
                isAudioMode = true;
                const origVideo = getOriginalVideo();
                if (origVideo) {
                    origVideo.style.visibility = 'hidden';
                    // 若已有新音频在播，暂停原视频；若尚在等待网络流，静音原视频保持加载管线畅通
                    if (currentAudioUrl) {
                        try { origVideo.pause(); } catch {}
                    } else {
                        origVideo.muted = true;
                    }
                }
                if (!audioPanelEl || !audioPanelEl.parentElement) {
                    createAudioPanel();
                }
                if (audioPanelEl) {
                    audioPanelEl.style.display = 'flex';
                }
                setRepeatState(getRepeatState(), false);
                updateToggleButtonState();

                // 若新音源已经就绪（从缓存池中恢复），确保装载起播并在元数据就绪后平滑继承有效进度
                if (currentAudioUrl && customAudioEl) {
                    if (customAudioEl.src !== currentAudioUrl) {
                        customAudioEl.src = currentAudioUrl;
                    }
                    const bestStart = getBestStartingTime(currentKey);
                    if (bestStart > 0) {
                        const applyTime = () => {
                            try { customAudioEl.currentTime = bestStart; } catch {}
                            syncAudioProgressToVideoAndStorage(true);
                            customAudioEl.removeEventListener('loadedmetadata', applyTime);
                        };
                        if (customAudioEl.readyState >= 1) {
                            applyTime();
                        } else {
                            customAudioEl.addEventListener('loadedmetadata', applyTime, { once: true });
                        }
                    }
                    customAudioEl.muted = getSavedUserMuted();
                    const curUserVol = getSavedUserVolume();
                    if (customAudioEl.volume === 0 && curUserVol > 0) {
                        customAudioEl.volume = curUserVol;
                    }
                    customAudioEl.play().catch(() => {});
                    updatePlayPauseBtnState(true);
                    updateCustomPlayerUI();
                }
            } else {
                if (isAudioMode) {
                    setAudioMode(false, false);
                }
            }
            updateMemoryStatusDisplay();
            updateVinylMeta();
            enforceVinylCircleDefense();
            // 延时重试梯队：适应 B 站单页应用（SPA）异步渲染标题与海报的时间差，并保障黑胶圆角防御即时生效
            [80, 250, 600, 1200, 2500].forEach(delay => {
                setTimeout(() => {
                    updateVinylMeta();
                    enforceVinylCircleDefense();
                }, delay);
            });
        };

        checkPageChange = () => {
            const currentKey = getVideoKey();
            if (currentKey !== lastVideoKey) {
                if (lastVideoKey) {
                    flushCurrentTrafficStats(lastVideoKey);
                    // 核心修复：切视频时旧视频进度只写入 lastVideoKey，严禁篡改新视频且不同步原生 video
                    syncAudioProgressToVideoAndStorage(true, lastVideoKey, false);
                }
                lastVideoKey = currentKey;
                handleVideoChange();
            }
        };

        window.addEventListener('popstate', checkPageChange);
        const origPushState = history.pushState;
        history.pushState = function() {
            origPushState.apply(this, arguments);
            checkPageChange();
        };
        const origReplaceState = history.replaceState;
        history.replaceState = function() {
            origReplaceState.apply(this, arguments);
            checkPageChange();
        };

        // 兜底定时检查 URL 变更与官方循环开关绑定
        setInterval(() => {
            checkPageChange();
            const elem = getNativeRepeatElement();
            if (elem) {
                bindNativeRepeatListener();
            }
        }, 500);

        // 观察器 1：仅监听根节点主题变化（仅属性监听，无 childList/subtree，彻底杜绝死循环）
        const themeObserver = new MutationObserver(() => {
            if (isAudioMode) {
                applyThemeToPanel();
            }
        });
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'data-theme']
        });

        // 观察器 2：监听底部控制栏出现以挂载按钮（不触发主题与面板更新）
        const btnObserver = new MutationObserver(() => {
            if (!document.querySelector('#bili-audio-ctrl-btn')) {
                mountToggleButton();
            }

            // 持续绑定官方原生循环开关（用户在官方界面操作时自动反向同步）
            const nativeRepeatElem = getNativeRepeatElement();
            if (nativeRepeatElem) {
                bindNativeRepeatListener();
            }

            // 监听设置齿轮按钮的移入与点击，确保设置面板弹出时瞬间绑定开关
            const settingBtn = document.querySelector('.bpx-player-ctrl-setting, .bilibili-player-video-btn-setting');
            if (settingBtn && !settingBtn._biliSettingHoverBound) {
                settingBtn._biliSettingHoverBound = true;
                const onSettingInteract = () => {
                    setTimeout(bindNativeRepeatListener, 60);
                    setTimeout(bindNativeRepeatListener, 200);
                };
                settingBtn.addEventListener('mouseenter', onSettingInteract);
                settingBtn.addEventListener('click', onSettingInteract);
            }

            // 音频模式下大面板脱落自动重新挂载守卫
            if (isAudioMode && (!audioPanelEl || !audioPanelEl.parentElement)) {
                createAudioPanel();
                if (audioPanelEl) audioPanelEl.style.display = 'flex';
            }
            // 播放器初次挂载时防误播拦截守卫（绝不篡改原视频音量/静音设置）
            const origVideo = getOriginalVideo();
            if (origVideo && !origVideo.paused && shouldAudioModeBeActive(getVideoKey()).active && !isAudioMode) {
                try { origVideo.pause(); } catch {}
            }
        });
        btnObserver.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });

        // 观察器 3：监听文档标题变化（B站单页应用换视频必改 title，瞬间同步更新大面板曲目标题与封面）
        const titleNode = document.querySelector('title');
        if (titleNode) {
            const titleObserver = new MutationObserver(() => {
                updateVinylMeta();
            });
            titleObserver.observe(titleNode, { childList: true, characterData: true, subtree: true });
        }

        mountToggleButton();

        // 全局捕获委托监听底栏按钮点击（双重防护，防止冒泡阻断或 DOM 替换丢监听）
        document.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest && e.target.closest('#bili-audio-ctrl-btn');
            if (btn) {
                e.preventDefault();
                e.stopPropagation();
                setAudioMode(!isAudioMode, true);
            }
        }, true);

        // 视口尺寸变化与浏览器缩放（Zoom / DPR 改变）兜底自适应驱动
        const handleViewportResize = () => {
            if (isAudioMode) {
                updateAudioCardResponsiveSize(true);
            }
        };
        window.addEventListener('resize', handleViewportResize);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', handleViewportResize);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
