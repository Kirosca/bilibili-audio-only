// ==UserScript==
// @name         Bilibili 纯音频模式（听视频省流量）
// @version      1.9.0
// @description  一键切换纯音频省流量模式，多档音频品质双缓冲无缝切换，视频换P/换稿件音源精准更替与状态隔离，SPA切视频全量API拦截与音源无感自动更替，实时音量双向同步与智能防暴音记忆保护，单曲循环与官方双向联动，寻道防抖全周期零闪烁，B站原生规范内联SVG矢量图标
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
    let trafficTimer = null;

    let availableAudioTracks = [];
    let currentAudioQualityId = null;
    const STORAGE_KEY_PREFERRED_QUALITY = 'bili_audio_preferred_quality';

    let isVideoSwitchPending = false;
    let standbyAudioEl = null;

    // B 站原生设计规范内联 SVG 矢量图标集（彻底替代系统 Emoji，跨平台渲染统一且自适应深浅色主题）
    const ICONS = {
        HEADPHONES: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -3px; margin-right: 6px;"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`,
        PLAY: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: -1px; margin-right: 5px;"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>`,
        PAUSE: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: -1px; margin-right: 5px;"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`,
        SCREEN: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 5px;"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
        VIDEO: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff6699" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`,
        MUSIC: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00aeec" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
        BOLT: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="color: #4cd964; vertical-align: -2px; margin-right: 4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
        REPEAT_ONE: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 5px;"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><path d="M11 10h1v4"/><path d="M11 14h2"/></svg>`,
        PIN: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 3px;"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V5h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v5.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z"/></svg>`,
        GLOBE: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 3px;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
        TRASH: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 3px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`
    };

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
        try {
            const profile = JSON.parse(localStorage.getItem('bpx_player_profile') || '{}');
            if (typeof profile.muted === 'boolean') return profile.muted;
        } catch {}
        return false;
    }

    function syncVolumeVideoToAudio() {
        const origVideo = getOriginalVideo();
        if (!origVideo || !customAudioEl || isSyncingVolume) return;
        try {
            isSyncingVolume = true;
            const savedVol = getSavedUserVolume();
            // 防假象 1.0 冲刷：当原视频为浏览器默认 1.0 且处于未充分初始化状态（readyState <= 1），但本地有更可信的历史音量时，优先保护
            if (origVideo.volume === 1 && savedVol < 0.95 && origVideo.readyState <= 1) {
                origVideo.volume = savedVol;
                customAudioEl.volume = savedVol;
                customAudioEl.muted = getSavedUserMuted();
                return;
            }

            customAudioEl.volume = origVideo.volume;
            customAudioEl.muted = origVideo.muted;
            saveUserVolume(origVideo.volume, origVideo.muted);
        } catch {} finally {
            isSyncingVolume = false;
        }
    }

    function syncVolumeAudioToVideo() {
        const origVideo = getOriginalVideo();
        if (!origVideo || !customAudioEl || isSyncingVolume) return;
        try {
            isSyncingVolume = true;
            const savedVol = getSavedUserVolume();
            // 防假象 1.0 倒灌：若音频为默认 1.0 但本地有较低历史音量，且音频尚未被用户显式调整
            if (customAudioEl.volume === 1 && savedVol < 0.95 && (!customAudioEl.currentTime || customAudioEl.currentTime < 1)) {
                customAudioEl.volume = savedVol;
                origVideo.volume = savedVol;
                origVideo.muted = getSavedUserMuted();
                return;
            }

            origVideo.volume = customAudioEl.volume;
            origVideo.muted = customAudioEl.muted;
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

        // 4. 立即更新大面板复选框 UI
        if (audioPanelEl) {
            const loopSwitch = audioPanelEl.querySelector('#bili-setting-loop-switch');
            if (loopSwitch && loopSwitch.checked !== isLoopEnabled) {
                loopSwitch.checked = isLoopEnabled;
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
            if (!isSyncingVolume) {
                if (isAudioMode) {
                    syncVolumeVideoToAudio();
                } else {
                    saveUserVolume(video.volume, video.muted);
                }
            }
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

        btn.innerHTML = isPaused ? `${ICONS.PLAY}播放音频` : `${ICONS.PAUSE}暂停音频`;
        btn.style.background = isPaused ? '#00aeec' : 'transparent';
        btn.style.color = isPaused ? '#ffffff' : (isDark ? '#e3e5e7' : '#18191c');
        btn.style.borderColor = isPaused ? '#00aeec' : (isDark ? 'rgba(255,255,255,0.2)' : '#c9ccd0');
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
                extractPlayInfo(val, false);
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
                clone.json().then(data => extractPlayInfo(data, false)).catch(() => {});
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
                    extractPlayInfo(data, false);
                }
            } catch {}
        });
        return origSend.apply(this, arguments);
    };

    // 5. 提取音视频码率与多档音频链接
    function extractPlayInfo(data) {
        const dash = data?.data?.dash || 
                     data?.result?.dash || 
                     data?.data?.playurl?.dash || 
                     data?.data?.playurl_info?.playurl?.dash || 
                     data?.result?.video_info?.dash ||
                     data?.dash;
        if (!dash) return;

        // 提取视频参考码率
        if (dash.video && dash.video.length) {
            const videoItem = dash.video[0];
            if (videoItem.bandwidth) videoBandwidth = videoItem.bandwidth;
        }

        // 解析全部可用音频轨道
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

        // 去重并按码率降序排序（高音质在前）
        const seen = new Set();
        const validTracks = tracks.filter(t => {
            if (seen.has(t.id)) return false;
            seen.add(t.id);
            return true;
        }).sort((a, b) => b.bandwidth - a.bandwidth);

        if (validTracks.length > 0) {
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
            currentAudioVideoKey = getVideoKey();

            // 若当前已在音频模式且音频直链发生变化或正在换视频挂起中，立刻换源起播
            if (isAudioMode && customAudioEl) {
                if (isNewUrl || isVideoSwitchPending) {
                    const origVideo = getOriginalVideo();
                    // 若处于换视频期间，时间严格从 0（或新视频真实当前进度）起播，杜绝继承旧视频播放进度
                    let curTime = 0;
                    if (!isVideoSwitchPending && origVideo && Number.isFinite(origVideo.currentTime) && origVideo.currentTime > 0) {
                        curTime = origVideo.currentTime;
                    }
                    isVideoSwitchPending = false;

                    customAudioEl.src = currentAudioUrl;
                    if (curTime > 0) {
                        const onLoaded = () => {
                            try { customAudioEl.currentTime = curTime; } catch {}
                            customAudioEl.removeEventListener('loadedmetadata', onLoaded);
                        };
                        customAudioEl.addEventListener('loadedmetadata', onLoaded, { once: true });
                    }
                    customAudioEl.play().catch(() => {});
                    updatePlayPauseBtnState(true);

                    // 原视频隐藏并安全暂停
                    if (origVideo) {
                        origVideo.style.visibility = 'hidden';
                        try { origVideo.pause(); } catch {}
                    }
                }
            }

            checkAndApplyAutoMode();
            renderQualityButtons();
        }

        updateTrafficDisplay();
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

    // 渲染音频品质切换按钮列表
    function renderQualityButtons() {
        if (!audioPanelEl) return;
        const listEl = audioPanelEl.querySelector('#bili-audio-quality-list');
        if (!listEl) return;

        listEl.innerHTML = '';
        const isDark = isBiliDarkMode();

        if (!availableAudioTracks || availableAudioTracks.length === 0) {
            listEl.innerHTML = `<span style="opacity: 0.6; font-size: 12px;">默认标准音质</span>`;
            return;
        }

        availableAudioTracks.forEach(track => {
            const btn = document.createElement('button');
            btn.className = 'bili-quality-btn';
            btn.dataset.id = track.id;
            btn.textContent = track.label;
            const isActive = String(track.id) === String(currentAudioQualityId);
            if (isActive) btn.classList.add('active');

            btn.style.cssText = `
                border: none;
                border-radius: 4px;
                padding: 4px 10px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.2s;
                background: ${isActive ? '#00aeec' : (isDark ? '#2b2d31' : '#e3e5e7')};
                color: ${isActive ? '#ffffff' : (isDark ? '#e3e5e7' : '#18191c')};
                font-weight: ${isActive ? 'bold' : 'normal'};
            `;

            btn.onclick = () => switchAudioQuality(track.id);
            listEl.appendChild(btn);
        });
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

    // 7. 格式化流量大小
    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    // 8. 更新流量对比与节省数据显示
    function updateTrafficDisplay() {
        const savedPercent = Math.max(0, ((videoBandwidth - audioBandwidth) / videoBandwidth * 100)).toFixed(1);
        const videoRate = (videoBandwidth / 8 / 1024).toFixed(0);
        const audioRate = (audioBandwidth / 8 / 1024).toFixed(0);
        const totalSavedBytes = Math.max(0, (videoBandwidth - audioBandwidth) / 8 * totalPlayedSeconds);

        const rateElem = document.querySelector('#bili-traffic-rates');
        if (rateElem) {
            rateElem.innerHTML = `
                <div style="display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center;">${ICONS.VIDEO}视频预计码率：<span style="color: #ff6699; margin-left: 2px;">${videoRate} KB/s</span></div>
                    <div style="display: flex; align-items: center;">${ICONS.MUSIC}音频当前码率：<span style="color: #00aeec; margin-left: 2px;">${audioRate} KB/s</span></div>
                    <div style="display: flex; align-items: center;">${ICONS.BOLT}流量节约率：<span style="color: #4cd964; font-weight: bold; margin-left: 2px;">-${savedPercent}%</span></div>
                </div>
            `;
        }

        const savedElem = document.querySelector('#bili-traffic-saved');
        if (savedElem) {
            savedElem.textContent = formatBytes(totalSavedBytes);
        }
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

            if (isAudioMode) {
                // 若尚未取得音频直链，尝试从首屏 __playinfo__ 提取
                if (!currentAudioUrl && window.__playinfo__) {
                    extractPlayInfo(window.__playinfo__);
                }

                if (!audioPanelEl || !audioPanelEl.parentElement) {
                    createAudioPanel();
                } else {
                    applyThemeToPanel();
                }

                if (audioPanelEl) {
                    audioPanelEl.style.display = 'flex';
                }

                // 立即隐藏原视频画面（覆盖式置顶），但若原视频正在播放，先不强制中断，等待音频出声平滑接力
                if (origVideo) {
                    origVideo.style.visibility = 'hidden';
                }

                const shouldPlay = origVideo ? !origVideo.paused : true;

                if (customAudioEl && currentAudioUrl) {
                    syncVolumeVideoToAudio();

                    if (!shouldPlay) {
                        // 原视频本来就是暂停状态：直接同步时间并暂停，无需接力
                        const curTime = (origVideo && Number.isFinite(origVideo.currentTime)) ? origVideo.currentTime : 0;
                        if (origVideo) {
                            try { origVideo.pause(); } catch {}
                        }
                        if (customAudioEl.src !== currentAudioUrl) {
                            customAudioEl.src = currentAudioUrl;
                        }
                        try {
                            if (curTime > 0) customAudioEl.currentTime = curTime;
                        } catch {}
                        customAudioEl.pause();
                        updatePlayPauseBtnState(true);
                    } else {
                        // 原视频正在播放：执行无感平滑音频接力（Handover）
                        let handoverDone = false;
                        const completeHandover = () => {
                            if (handoverDone) return;
                            handoverDone = true;
                            // 音频已真正开始发声，此时瞬时暂停原视频，声音毫无顿挫且不重复
                            if (origVideo) {
                                try { origVideo.pause(); } catch {}
                            }
                            updatePlayPauseBtnState(true);
                        };

                        const startPlayAudio = () => {
                            // 读取音频即将发声瞬间原视频的最新实时时间戳
                            const latestTime = (origVideo && Number.isFinite(origVideo.currentTime)) ? origVideo.currentTime : 0;
                            try {
                                if (latestTime > 0) customAudioEl.currentTime = latestTime;
                            } catch {}
                            syncVolumeVideoToAudio();
                            const p = customAudioEl.play();
                            if (p && typeof p.then === 'function') {
                                p.then(completeHandover).catch(completeHandover);
                            } else {
                                completeHandover();
                            }
                        };

                        if (customAudioEl.src !== currentAudioUrl) {
                            customAudioEl.src = currentAudioUrl;
                            const onCanPlay = () => {
                                startPlayAudio();
                                customAudioEl.removeEventListener('canplay', onCanPlay);
                            };
                            if (customAudioEl.readyState >= 2) {
                                startPlayAudio();
                            } else {
                                customAudioEl.addEventListener('canplay', onCanPlay);
                            }
                        } else {
                            startPlayAudio();
                        }

                        // 兜底超时：500ms 后强制暂停原视频，防止网络波动导致重音过久
                        setTimeout(completeHandover, 500);
                    }
                } else if (origVideo) {
                    try { origVideo.pause(); } catch {}
                }

                clearInterval(trafficTimer);
                trafficTimer = setInterval(() => {
                    if (customAudioEl && !customAudioEl.paused) {
                        totalPlayedSeconds += 1;
                        updateTrafficDisplay();
                    }
                }, 1000);
            } else {
                // 切换回【看视频】：平滑接力回原视频画面与声音
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

                    if (!shouldPlay) {
                        // 音频处于暂停状态：直接同步时间并保持原视频暂停
                        if (customAudioEl) {
                            try { customAudioEl.pause(); } catch {}
                        }
                        if (Number.isFinite(curTime) && curTime > 0) {
                            try { origVideo.currentTime = curTime; } catch {}
                        }
                        try { origVideo.pause(); } catch {}
                    } else {
                        // 音频正在播放：让原视频定位起播，在原视频实际出声瞬间停止音频
                        let handoverDone = false;
                        const completeHandover = () => {
                            if (handoverDone) return;
                            handoverDone = true;
                            if (customAudioEl) {
                                try { customAudioEl.pause(); } catch {}
                            }
                        };

                        if (Number.isFinite(curTime) && curTime > 0) {
                            try { origVideo.currentTime = curTime; } catch {}
                        }

                        // 监听原视频出画面发声瞬间
                        origVideo.addEventListener('playing', completeHandover, { once: true });

                        const playOrig = () => {
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

        const panelCard = audioPanelEl.querySelector('#bili-audio-card');
        const trafficBox = audioPanelEl.querySelector('#bili-traffic-box');
        const settingsBox = audioPanelEl.querySelector('#bili-audio-settings-box');
        const playPauseBtn = audioPanelEl.querySelector('#bili-btn-play-pause');
        const audioEl = audioPanelEl.querySelector('#bili-native-audio');

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

        if (trafficBox) {
            trafficBox.style.background = isDark ? '#131416' : '#f6f7f8';
            trafficBox.style.borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#e3e5e7';
        }

        if (settingsBox) {
            settingsBox.style.background = isDark ? '#131416' : '#f6f7f8';
            settingsBox.style.borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#e3e5e7';
        }

        if (playPauseBtn && customAudioEl) {
            const isPaused = customAudioEl.paused;
            playPauseBtn.style.color = isPaused ? '#ffffff' : (isDark ? '#e3e5e7' : '#18191c');
            playPauseBtn.style.borderColor = isPaused ? '#00aeec' : (isDark ? 'rgba(255,255,255,0.2)' : '#c9ccd0');
            playPauseBtn.style.background = isPaused ? '#00aeec' : 'transparent';
        }

        const restoreBtn = audioPanelEl.querySelector('#bili-btn-restore');
        if (restoreBtn) {
            restoreBtn.style.color = isDark ? '#e3e5e7' : '#18191c';
            restoreBtn.style.borderColor = isDark ? 'rgba(255,255,255,0.2)' : '#c9ccd0';
        }

        if (audioEl) {
            audioEl.style.filter = isDark ? 'invert(0.9) hue-rotate(180deg)' : 'none';
        }

        audioPanelEl.querySelectorAll('.bili-rate-btn').forEach(btn => {
            const isActive = btn.classList.contains('active');
            btn.style.background = isActive ? '#00aeec' : (isDark ? '#2b2d31' : '#e3e5e7');
            btn.style.color = isActive ? '#ffffff' : (isDark ? '#e3e5e7' : '#18191c');
        });

        audioPanelEl.querySelectorAll('.bili-quality-btn').forEach(btn => {
            const isActive = btn.classList.contains('active');
            btn.style.background = isActive ? '#00aeec' : (isDark ? '#2b2d31' : '#e3e5e7');
            btn.style.color = isActive ? '#ffffff' : (isDark ? '#e3e5e7' : '#18191c');
        });

        updateMemoryStatusDisplay();
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

        if (statusEl) {
            let newHTML = '';
            if (mem !== undefined) {
                newHTML = `<span style="display: inline-flex; align-items: center;">${ICONS.PIN}独立记忆：<span style="color: ${mem ? '#4cd964' : '#ff6699'}; font-weight: bold;">${mem ? '已开启' : '已关闭'}</span></span>`;
            } else {
                newHTML = `<span style="display: inline-flex; align-items: center;">${ICONS.GLOBE}跟随默认：<span style="color: ${globalDef ? '#4cd964' : '#999999'}; font-weight: bold;">${globalDef ? '开启' : '关闭'}</span></span>`;
            }

            if (newHTML !== lastMemoryStatusHTML) {
                lastMemoryStatusHTML = newHTML;
                statusEl.innerHTML = newHTML;
            }
        }
    }

    // 12. 获取音频面板的安全挂载目标容器与插入位置（彻底避免父子节点不匹配异常）
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
            updateTrafficDisplay();
            return;
        }

        if (!document.getElementById('bili-audio-panel-style')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'bili-audio-panel-style';
            styleEl.textContent = `
                #bili-audio-theme-panel::-webkit-scrollbar {
                    display: none !important;
                    width: 0 !important;
                    height: 0 !important;
                }
            `;
            document.head.appendChild(styleEl);
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
            overflow-y: auto;
            scrollbar-width: none;
            -ms-overflow-style: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            box-sizing: border-box;
            padding: 12px;
        `;

        // 核心防护：拦截并阻断大面板上所有的点击与指针事件向底层冒泡，彻底杜绝误触发原视频播放/暂停
        ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'touchstart'].forEach(eventType => {
            audioPanelEl.addEventListener(eventType, (e) => {
                e.stopPropagation();
            });
        });

        audioPanelEl.innerHTML = `
            <div id="bili-audio-card" style="border: 1px solid; border-radius: 10px; padding: 16px 22px; max-width: 580px; width: 92%; display: flex; flex-direction: column; align-items: center; box-sizing: border-box; transition: all 0.2s;">
                <div style="font-size: 16px; font-weight: 600; margin-bottom: 3px; display: flex; align-items: center; gap: 6px;">
                    <span style="display: inline-flex; align-items: center;">${ICONS.HEADPHONES}纯音频省流模式运行中</span>
                </div>
                <div style="font-size: 12px; opacity: 0.65; margin-bottom: 10px;">
                    视频画面已阻断，仅加载 DASH 音频流
                </div>

                <!-- 流量对比区域 -->
                <div id="bili-traffic-box" style="width: 100%; border: 1px solid; border-radius: 6px; padding: 8px 14px; margin-bottom: 10px; font-size: 12px; line-height: 1.6; box-sizing: border-box;">
                    <div id="bili-traffic-rates" style="border-bottom: 1px solid rgba(127,127,127,0.18); padding-bottom: 6px; margin-bottom: 6px;"></div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span>已节约流量累计：</span>
                        <span id="bili-traffic-saved" style="font-size: 14px; font-weight: bold; color: #4cd964;">0 MB</span>
                    </div>
                </div>

                <!-- 全局设置与单视频独立记忆管理区域 -->
                <div id="bili-audio-settings-box" style="width: 100%; border: 1px solid; border-radius: 6px; padding: 7px 12px; margin-bottom: 10px; font-size: 12px; display: flex; flex-direction: column; gap: 6px; box-sizing: border-box; transition: all 0.2s;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none;">
                            <input type="checkbox" id="bili-setting-default-switch" style="cursor: pointer; width: 14px; height: 14px; accent-color: #00aeec;">
                            <span style="font-weight: 500;">新视频默认开启听视频</span>
                        </label>
                        <div id="bili-memory-status-text" style="font-size: 11px;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; border-top: 1px dashed rgba(127,127,127,0.18); padding-top: 5px;">
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none;">
                            <input type="checkbox" id="bili-setting-loop-switch" style="cursor: pointer; width: 14px; height: 14px; accent-color: #00aeec;">
                            <span style="display: inline-flex; align-items: center; font-weight: 500;">${ICONS.REPEAT_ONE}单曲循环播放（与B站单集循环联动）</span>
                        </label>
                        <span style="font-size: 11px; opacity: 0.65;">自动重播本集</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; opacity: 0.65; border-top: 1px dashed rgba(127,127,127,0.2); padding-top: 5px;">
                        <span>判定：优先独立记忆（上限 500），无记忆按默认设置</span>
                        <button id="bili-btn-reset-memory" style="background: none; border: none; color: #00aeec; cursor: pointer; padding: 0; font-size: 11px; text-decoration: underline; display: inline-flex; align-items: center;">
                            ${ICONS.TRASH}清除本视频记忆
                        </button>
                    </div>
                </div>

                <!-- 原生音频条 -->
                <audio id="bili-native-audio" controls style="width: 100%; outline: none; margin-bottom: 10px; height: 38px; transition: filter 0.2s;"></audio>

                <!-- 音质与倍速并排控制区 -->
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                    <div id="bili-audio-quality-section" style="display: flex; gap: 6px; align-items: center; font-size: 12px;">
                        <span style="opacity: 0.8; font-weight: 500;">音质：</span>
                        <div id="bili-audio-quality-list" style="display: flex; gap: 4px; flex-wrap: wrap;"></div>
                    </div>
                    <div style="display: flex; gap: 6px; align-items: center; font-size: 12px;">
                        <span style="opacity: 0.8; font-weight: 500;">倍速：</span>
                        <button class="bili-rate-btn" data-rate="0.75" style="border:none; border-radius:4px; padding:3px 7px; font-size:11px; cursor:pointer;">0.75</button>
                        <button class="bili-rate-btn active" data-rate="1.0" style="border:none; border-radius:4px; padding:3px 7px; font-size:11px; cursor:pointer;">1.0</button>
                        <button class="bili-rate-btn" data-rate="1.25" style="border:none; border-radius:4px; padding:3px 7px; font-size:11px; cursor:pointer;">1.25</button>
                        <button class="bili-rate-btn" data-rate="1.5" style="border:none; border-radius:4px; padding:3px 7px; font-size:11px; cursor:pointer;">1.5</button>
                        <button class="bili-rate-btn" data-rate="2.0" style="border:none; border-radius:4px; padding:3px 7px; font-size:11px; cursor:pointer;">2.0</button>
                    </div>
                </div>

                <!-- 控制操作区：播放/暂停与恢复视频并列 -->
                <div style="display: flex; gap: 12px; align-items: center;">
                    <button id="bili-btn-play-pause" style="background: transparent; border: 1px solid; border-radius: 6px; padding: 6px 18px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 5px;">
                        ${ICONS.PAUSE}暂停音频
                    </button>
                    <button id="bili-btn-restore" style="background: transparent; border: 1px solid; border-radius: 6px; padding: 6px 16px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 5px;">
                        ${ICONS.SCREEN}恢复看视频
                    </button>
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
                    updatePlayPauseBtnState(true);
                }
            });
            customAudioEl.addEventListener('volumechange', () => {
                if (!isSyncingVolume) {
                    syncVolumeAudioToVideo();
                }
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

        // 清除本视频独立记忆
        const resetMemoryBtn = audioPanelEl.querySelector('#bili-btn-reset-memory');
        if (resetMemoryBtn) {
            resetMemoryBtn.onclick = () => {
                clearVideoMemory(getVideoKey());
                updateMemoryStatusDisplay();
            };
        }

        // 播放/暂停点击事件
        const playPauseBtn = audioPanelEl.querySelector('#bili-btn-play-pause');
        if (playPauseBtn) {
            playPauseBtn.onclick = () => {
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
                    customAudioEl.play().catch(() => {});
                } else {
                    customAudioEl.pause();
                }
                updatePlayPauseBtnState(true);
            };
        }

        // 恢复看视频点击事件（用户显式行为，记录关闭记忆）
        const restoreBtn = audioPanelEl.querySelector('#bili-btn-restore');
        if (restoreBtn) {
            restoreBtn.onclick = () => setAudioMode(false, true);
        }

        // 倍速点击事件
        audioPanelEl.querySelectorAll('.bili-rate-btn').forEach(btn => {
            btn.onclick = () => {
                const rate = parseFloat(btn.dataset.rate);
                if (customAudioEl) customAudioEl.playbackRate = rate;
                audioPanelEl.querySelectorAll('.bili-rate-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                applyThemeToPanel();
            };
        });

        renderQualityButtons();
        applyThemeToPanel();
        updateTrafficDisplay();
    }

    // 13. 挂载按钮至播放器底部控制栏（完全采用原生倍速/清晰度相同结构，无缝融入底栏，无悬停菜单）
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

        toggleBtnEl.innerHTML = `<div class="bpx-player-ctrl-playbackrate-result" id="bili-audio-btn-text">听视频</div>`;
        toggleBtnEl.onclick = () => setAudioMode(!isAudioMode, true);

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
            extractPlayInfo(window.__playinfo__, true);
        }

        // 监听 SPA 换 P / 换视频，按新视频逻辑独立判断
        let lastVideoKey = getVideoKey();

        const handleVideoChange = () => {
            const currentKey = getVideoKey();
            isVideoSwitchPending = true;

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

            // 1. 判断当前音源是否已经被网络请求提前解析并装载为新视频音频
            const isAlreadyNewVideoAudio = currentAudioVideoKey && (currentAudioVideoKey === currentKey);

            if (!isAlreadyNewVideoAudio) {
                // 确实属于旧视频的陈旧音频流：彻底停止并卸载，杜绝串歌与声音残留
                if (customAudioEl) {
                    try {
                        customAudioEl.pause();
                        customAudioEl.removeAttribute('src');
                        customAudioEl.load();
                    } catch {}
                }
                if (standbyAudioEl) {
                    try {
                        standbyAudioEl.pause();
                        standbyAudioEl.removeAttribute('src');
                        standbyAudioEl.load();
                    } catch {}
                }

                currentAudioUrl = null;
                availableAudioTracks = [];
                currentAudioQualityId = null;
                totalPlayedSeconds = 0;
                renderQualityButtons();
                updateTrafficDisplay();
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

                // 若新音源已经就绪，确保装载起播
                if (currentAudioUrl && customAudioEl) {
                    if (customAudioEl.src !== currentAudioUrl) {
                        customAudioEl.src = currentAudioUrl;
                    }
                    customAudioEl.play().catch(() => {});
                    updatePlayPauseBtnState(true);
                }
            } else {
                if (isAudioMode) {
                    setAudioMode(false, false);
                }
            }
            updateMemoryStatusDisplay();
        };

        checkPageChange = () => {
            const currentKey = getVideoKey();
            if (currentKey !== lastVideoKey) {
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
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
