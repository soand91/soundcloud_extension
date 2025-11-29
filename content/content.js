/// ======== Constants and State ========
const STATE_KEYS = ['play_pause', 'shuffle', 'repeat'];
let isPlaying = false;
let cachedElapsed = 0;
let cachedDuration = 0;
let lastUpdateTime = 0;
let rafId = null;
let shadowRoot = null;
let teardownScrollbarListener = null;
let teardownVolumeListener = null;
let volumeState = {
    percent: 0.6,
    lastPercent: 0.6,
    lastNonZeroPercent: 0.6,
    muted: false
};
let isTimelineScrubbing = false;
let lastTimelineSeekSend = 0;

const DEBUG = true;
function log(...args) {
    if (DEBUG) console.log("[Toolbar]", ...args);
}
function warn(...args) {
    if (DEBUG) console.warn("[Toolbar]", ...args);
}
function error(...args) {
    if (DEBUG) console.error("[Toolbar]", ...args);
}

/// ======== Entry Point ========
window.addEventListener('DOMContentLoaded', async () => { //! May have to remove the DOM waiter
    log("DOM fully loaded. Initializing toolbar...");
    shadowRoot = await injectToolbar();             // 1. Build the Shadow DOM
    setupScrollbarGutter(shadowRoot);               // 1b. Track page scrollbar width
    log("Toolbar injected. Waiting for buttons...");
    await waitForButtons(shadowRoot);               // 2. Ensure buttons exist
    log("Buttons ready. Syncing extension settings...");
    await syncAllSettings();                        // 3. Fetch & apply settings
    log("Settings ready. Syncing initial states...");
    await syncAllStates();                          // 4. Fetch & apply states
    log("Initial states synced. Setting up listeners...");
    setupButtonListeners(shadowRoot);               // 5. Setup button handlers
    setupMessageListeners();                        // 6. Handle incoming handlers
    log("Toolbar fully initialized.");
    startInterpolatedTimelineLoop(shadowRoot);
})

/// ======== Shadow DOM Injection ========
async function injectToolbar() {

    log("Injecting toolbar Shadow DOM...");
    // 1. Create host and shadow root
    const host = document.createElement('div');
    host.id = "soundcloud-toolbar-host";
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    // Load font from the extension package (avoid blob: URLs that some sites block via CSP)
    const fontUrl = browser.runtime.getURL('controls/Inter-SemiBold.woff');
    const fontFace = new FontFace('Inter', `url(${fontUrl})`, {
        weight: 600,
        style: 'normal',
        display: 'swap'
    });
    // Force-load and apply
    await fontFace.load();
    document.fonts.add(fontFace);
    // Apply to all Shadow DOM elements
    Array.from(shadow.querySelectorAll('*')).forEach(el => {
        el.style.setProperty('font-family', '"Inter", sans-serif', 'important');
    });

    // 2. Load HTML and CSS
    const [htmlText, cssText] = await Promise.all([
        fetch(browser.runtime.getURL('controls/controls.html')).then(r => r.text()),
        fetch(browser.runtime.getURL('controls/controls.css')).then(r => r.text()),
    ]);

    log("HTML and CSS fetched. Sanitizing and injecting...");

    // 3. Sanitize and parse HTML
    const cleanHTML = DOMPurify.sanitize(htmlText);
    const temp = document.createElement('div');
    temp.innerHTML = cleanHTML;

    // 4. Inject CSS
    const style = document.createElement('style');
    style.textContent = cssText;
    shadow.appendChild(style);

    // 5. Inject HTML
    Array.from(temp.children).forEach(child => shadow.appendChild(child));

    log("Shadow DOM ready.");
    // 6. Return shadow root
    return shadow;
}

/// ======== Wait Until DOM Elements Exist ========
function waitForButtons(root) {
    return new Promise((resolve) => {
        const check = () => {
            const allReady = STATE_KEYS.every(key => 
                root.querySelector(`.${key}`)
            );
            if (allReady) {
                log("All button elements found.");
                resolve();
            }
            else {
                log("Waiting for buttons...");
                setTimeout(check, 50);
            }
        };
        check();
    });
}

// Measure native scrollbar width so we can reserve that space even when the page doesn't need to scroll.
let cachedScrollbarWidth = null;
function getScrollbarWidth() {
    if (cachedScrollbarWidth !== null) return cachedScrollbarWidth;
    const probe = document.createElement('div');
    probe.style.width = '100px';
    probe.style.height = '100px';
    probe.style.overflow = 'scroll';
    probe.style.position = 'absolute';
    probe.style.top = '-9999px';
    document.body.appendChild(probe);
    cachedScrollbarWidth = probe.offsetWidth - probe.clientWidth;
    document.body.removeChild(probe);
    return cachedScrollbarWidth;
}
/// ======== Scrollbar Width Sync (host -> CSS var) ========
function setupScrollbarGutter(root) {
    if (!root?.host) return;
    const host = root.host;
    const fallbackScrollbarWidth = getScrollbarWidth();

    const updateScrollbarVar = () => {
        const measuredWidth = Math.max(window.innerWidth - document.documentElement.clientWidth, 0);
        const missingWidth = measuredWidth === 0 ? fallbackScrollbarWidth : 0;
        host.style.setProperty('--page-scrollbar', `${measuredWidth}px`);
        host.style.setProperty('--page-scrollbar-missing', `${missingWidth}px`);
    };

    updateScrollbarVar();
    const resizeListener = () => updateScrollbarVar();
    window.addEventListener('resize', resizeListener);
    teardownScrollbarListener = () => window.removeEventListener('resize', resizeListener);
}

/// ======== Sync All States from [background.js] ========
async function syncAllStates() {
    log("Requesting all UI states from background...");
    const response = await browser.runtime.sendMessage({ type: "get-all-states-active" });
    const elapsed = response.secondsElapsed ?? 0;
    const duration = response.duration ?? 0;
    const volume = response.volume ?? 1;
    const muted = !!response.muted;
    const displayMode = response.display ?? response.time ?? null;

    log("Full raw response from background:", response);
    if (!response) {
        warn("No response from get-all-states-active");
        return;
    }
    setPlayPauseButtonUI(response.playpause, shadowRoot);
    setShuffleButtonUI(response.shuffle, shadowRoot);
    setRepeatButtonUI(response.repeat, shadowRoot);
    if (displayMode) setTimeDisplayUI(displayMode, shadowRoot);
    setLikeUI(response.like, shadowRoot);
    setFollowUI(response.follow, shadowRoot);

    setTitleUI(response.songTitle, shadowRoot);
    setArtistUI(response.songArtist, shadowRoot);
    setAvatarUI(response.avatar, shadowRoot);

    setTimelineUI(elapsed, duration, shadowRoot);
    setVolumeUI({ percent: volume, muted }, shadowRoot);
}

/// ======== Sync All Settings from [background.js] ========
async function syncAllSettings() {
    log("Requesting all extension settings from background...");
    const settings = await browser.runtime.sendMessage({ type: "get-settings" });

    if (!settings) {
        warn("No response from get-settings");
        return;
    }

    log("Received settings:", settings);
    applySettingsToAllTabs(settings)
}

/// ======== Idempotent UI Updaters ========
function setPlayPauseButtonUI(state, root) {
    const btn = root.querySelector('.play_pause');
    if (!btn) return;
    btn.classList.remove('playing', 'paused');
    if (state === 'playing') {
        isPlaying = true;
        btn.classList.add('playing');
    } else if (state === 'paused') {
        isPlaying = false;
        btn.classList.add('paused')
    };
}
function setShuffleButtonUI(state, root) {
    const btn = root.querySelector('.shuffle');
    if (!btn) return;
    btn.classList.toggle('active', state === 'active');
}
function setRepeatButtonUI(state, root) {
    const btn = root.querySelector('.repeat');
    if (!btn) return;
    const validStates = ['off', 'one', 'all'];
    validStates.forEach(s => btn.classList.remove(s));
    if (validStates.includes(state)) btn.classList.add(state);
}
function setTimeDisplayUI(state, root) {
    const btn = root.querySelector('.timeDuration');
    const left = root.getElementById('duration_left');
    const total = root.getElementById('duration_total');
    if (!btn) return;
    if (state === 'remaining') {
        left.classList.remove('time_hidden');
        total.classList.add('time_hidden');
    }
    if (state === 'duration') {
        left.classList.add('time_hidden');
        total.classList.remove('time_hidden');
    }
}
function setLikeUI(state, root) {
    const btn = root.querySelector('.soundBadge_like');
    if (!btn) return;
    btn.classList.toggle('liked', state === 'liked');
}
function setFollowUI(state, root) {
    const btn = root.querySelector('.soundBadge_follow');
    if (!btn) return;
    btn.classList.toggle('followed', state === 'followed');
}
function setTitleUI(state, root) {
    const container = root.querySelector('.titleLink');
    if (!container) return;
    container.innerHTML = state ?? '';
}
function setArtistUI(state, root) {
    const container = root.querySelector('.artistLink');
    if (!container) return;
    container.innerHTML = state ?? '';
}
function setVolumeUI({ percent = 0, muted = false }, root) {
    const slider = root.querySelector('.volume_slider');
    const track = root.querySelector('.volume_sliderBackground');
    const progress = root.querySelector('.volume_sliderProgress');
    const handle = root.querySelector('.volume_sliderHandle');
    const button = root.querySelector('.volume_button');

    if (!slider || !track || !progress || !handle || !button) return;

    const clamp = (v) => Math.max(0, Math.min(1, v));
    const clamped = clamp(percent);
    const sliderRect = slider.getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();
    const trackHeight = trackRect.height || 1;
    const trackOffsetTop = trackRect.top - sliderRect.top;

    log("[Volume] Applying UI", { clamped, muted });

    // Persist local state
    volumeState.percent = clamped;
    if (clamped > 0) {
        volumeState.lastPercent = clamped;
        volumeState.lastNonZeroPercent = clamped;
    }
    volumeState.muted = muted || clamped === 0;

    progress.style.height = `${clamped * trackHeight}px`;
    const handleTop = trackOffsetTop + (1 - clamped) * trackHeight - (handle.offsetHeight / 2);
    handle.style.top = `${handleTop}px`;
    slider.dataset.volumePercent = clamped.toFixed(3);
    slider.classList.toggle('muted', volumeState.muted);
    button.classList.toggle('muted', volumeState.muted);

    const level = volumeState.muted ? 'mute' : (clamped <= 0.5 ? 'low' : 'high');
    button.dataset.level = level;
    button.classList.remove('vol-low', 'vol-high', 'vol-mute');
    button.classList.add(level === 'low' ? 'vol-low' : level === 'high' ? 'vol-high' : 'vol-mute');
}
function setAvatarUI(url, root) {
    const el = root.querySelector('.soundBadge_avatar');
    if (el && url) {
        el.style.backgroundImage = `url("${url}")`;
    }
}
function setTimelineUI(elapsed, duration, root) {
    cachedElapsed = elapsed ?? 0;
    cachedDuration = duration ?? 0;
    lastUpdateTime = performance.now();

    log("[Timeline] Updating timeline UI:", {
        cachedElapsed,
        cachedDuration
    });
    const remaining = Math.max(cachedDuration - cachedElapsed, 0);
    const percent = cachedDuration > 0
        ? (cachedElapsed / cachedDuration) * 100
        : 0;
    updateTimelineProgressBar(percent, root);
    updateTimelineMetadataUI(cachedElapsed, cachedDuration, remaining, root);
}
function updateTimelineMetadataUI(elapsed, duration, remaining, root) {
    const elapsedEl = root.querySelector('#current_time')
    const durationEl = root.querySelector('#duration_total')
    const remainingEl = root.querySelector('#duration_left')

    if (elapsedEl) elapsedEl.textContent = formatTime(elapsed);
    if (durationEl) durationEl.textContent = formatTime(duration);
    if (remainingEl) remainingEl.textContent = `-${formatTime(remaining)}`;
}
function updateTimelineProgressBar(percent, root) {
    const progressFill = root.querySelector('.progressBar');
    const handle = root.querySelector('.progressHandle');

    if (!progressFill) {
        warn("[Timeline] .progressBar not found");
    } else {
        log("[Timeline] Settings progress bar width to:", `${percent}%`);
        progressFill.style.setProperty('width', `${percent}%`);
    }
    if (!handle) {
        warn("[Timeline] .progressHandle not found");
    } else {
        log("[Timeline] Moving handle to:", `${percent}%`);
        handle.style.setProperty('left', `${percent}%`);
    }
}
function startInterpolatedTimelineLoop(root) {
    function loop() {
        const now = performance.now();
        
        if (isPlaying && !isTimelineScrubbing) {
            const delta = (now - lastUpdateTime) / 1000;
            const virtualElapsed = cachedElapsed + delta;
            const percent = cachedDuration > 0 ? (virtualElapsed / cachedDuration) * 100 : 0;
            updateTimelineProgressBar(percent, root);
        }
        rafId = requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop)
}
function applySettingsToAllTabs(settings) {
    if (settings && Object.prototype.hasOwnProperty.call(settings, 'start-open-toggle')) {
        applyStartOpenSetting(!!settings['start-open-toggle']);
    }
    if (settings && Object.prototype.hasOwnProperty.call(settings, 'active-tab-toggle')) {
        applyActiveTabSetting(!!settings['active-tab-toggle']);
    }
    if (settings && Object.prototype.hasOwnProperty.call(settings, 'theme-default-toggle')) {
        applyThemeSetting(!!settings['theme-default-toggle']);
    }
}
function applyStartOpenSetting(startOpen) {
    const controller = shadowRoot.querySelector('.controller');
    const openIcon = shadowRoot.querySelector('.ext-icon');

    if (!controller || !openIcon) return;

    controller.classList.toggle('ext-shown', startOpen);
    openIcon.classList.toggle('ext-shown', !startOpen);
}
function applyActiveTabSetting(isActiveOnly) { //TODO
    
}
function applyThemeSetting(useDarkMode) { //TODO
    shadowRoot.host.classList.toggle('dark-mode', useDarkMode);
}
function showToolBar() {
    const controller    = shadowRoot.querySelector('.controller');
    const open_icon     = shadowRoot.querySelector('.ext-icon');
    
    controller.classList.add('ext-shown');
    open_icon.classList.remove('ext-shown');
}
function hideToolbar() {
    const controller    = shadowRoot.querySelector('.controller');
    const open_icon     = shadowRoot.querySelector('.ext-icon');

    controller.classList.remove('ext-shown');
    open_icon.classList.add('ext-shown');
}

/// ======== Button Listeners (sends state updates) ========
function setupButtonListeners(root) {
    const playPauseBtn  = root.querySelector('.play_pause');
    const shuffle       = root.querySelector('.shuffle');
    const repeat        = root.querySelector('.repeat');
    const skipPrevBtn   = root.querySelector('.skip_prev');
    const skipNextBtn   = root.querySelector('.skip_next');
    const close_btn     = root.querySelector('.int-icon');
    const open_icon     = root.querySelector('.ext-icon');
    const timeBtn       = root.querySelector('.timeDuration');
    const badgeAvatar   = root.querySelector('.soundBadge_avatar');
    const badgeArtist   = root.querySelector('.artistLink')
    const badgeTitle    = root.querySelector('.titleLink');
    const badgeLike     = root.querySelector('.soundBadge_like');
    const badgeFollow   = root.querySelector('.soundBadge_follow');
    const badgeQueue    = root.querySelector('.soundBadge_queue');
    const volumeSlider  = root.querySelector('.volume_slider');

    async function sendSimpleRequest(type, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await browser.runtime.sendMessage({ type });
                log(`${type} succeeded`, response);
                return response;
            } catch (error) {
                warn(`Attempt ${attempt} failed for ${type}:`, error);
                if (attempt === maxRetries) throw error;
                await new Promise(r => setTimeout(r, 300 * attempt));
            }
        }
    }
    
    if (playPauseBtn) {playPauseBtn.addEventListener('click', () => sendSimpleRequest('playpause-toggle-request'))};
    if (shuffle) {shuffle.addEventListener('click', () => sendSimpleRequest('shuffle-toggle-request'))};
    if (skipPrevBtn) {skipPrevBtn.addEventListener('click', () => sendSimpleRequest('skip-prev-request'))};
    if (skipNextBtn) {skipNextBtn.addEventListener('click', () => sendSimpleRequest('skip-next-request'))};
    if (timeBtn) {timeBtn.addEventListener('click', () => sendSimpleRequest('timeBtn-click-request'))}
    if (badgeAvatar) {badgeAvatar.addEventListener('click', () => sendSimpleRequest('avatar-click-request'))};
    if (badgeArtist) {badgeArtist.addEventListener('click', () => sendSimpleRequest('artist-click-request'))};
    if (badgeTitle)  {badgeTitle.addEventListener('click', () => sendSimpleRequest('title-click-request'))};
    if (badgeLike)   {badgeLike.addEventListener('click', () => sendSimpleRequest('like-request'))};
    if (badgeFollow) {badgeFollow.addEventListener('click', () => sendSimpleRequest('follow-request'))};
    if (badgeQueue)  {badgeQueue.addEventListener('click', () => sendSimpleRequest('queue-request'))};
    if (volumeSlider) {
        setupVolumeSlider(root);
    }
    setupTimelineScrubber(root);

    if (repeat) {
        repeat.addEventListener('click', async () => {
            try {
                browser.runtime.sendMessage({
                    type: "repeat-toggle-request"
                });
            } catch (err) {
                error('Repeat toggle failed:', err);
            } 
        });
    }
    if (close_btn) {close_btn.addEventListener('click', () => {
        hideToolbar();
    })};
    if (open_icon) {open_icon.addEventListener('click', () => {
        showToolBar();
    })};
}

/// ======== Message Listeners (react to state pushes) ========
function setupMessageListeners() {
    const stateHandlers = {
        "playpause-state-updated": setPlayPauseButtonUI,
        "shuffle-state-updated": setShuffleButtonUI,
        "repeat-state-updated": setRepeatButtonUI,
        "display-state-updated": setTimeDisplayUI,
        "time-display-updated": setTimeDisplayUI,
        "like-state-updated": setLikeUI,
        "follow-state-updated": setFollowUI,
        "title-state-updated": setTitleUI,
        "artist-state-updated": setArtistUI,
        "avatar-state-updated": setAvatarUI,
    };
    browser.runtime.onMessage.addListener((msg) => {
        log("Incoming message:", msg);
        if (!msg || typeof msg !== 'object') return;

        // When it is an all-states update
        if (msg.type === "all-states-updated") { //TODO MAYBE
            const states = msg.state || msg;
            log("Received states update:", states);
            if (states.playpause) {
                stateHandlers["playpause-state-updated"](states.playpause, shadowRoot);
            }
            if (states.shuffle) {
                stateHandlers["shuffle-state-updated"](states.shuffle, shadowRoot);
            }
            if (states.repeat) {
                stateHandlers["repeat-state-updated"](states.repeat, shadowRoot);
            }
            if (states.display) {
                stateHandlers["display-state-updated"](states.display, shadowRoot);
            }
            if (states.like) {
                stateHandlers["like-state-updated"](states.like, shadowRoot);
            }
            if (states.follow) {
                stateHandlers["follow-state-updated"](states.follow, shadowRoot);
            }
            if (states.songTitle) {
                stateHandlers["title-state-updated"](states.songTitle, shadowRoot);
            }
            if (states.songArtist) {
                stateHandlers["artist-state-updated"](states.songArtist, shadowRoot);
            }
            if (states.avatar) {
                stateHandlers["avatar-state-updated"](states.avatar, shadowRoot);
            }
            if (states.secondsElapsed != null || states.duration != null) {
                setTimelineUI(states.secondsElapsed, states.duration, shadowRoot);
            }
        }
        // When it is a single-state update
        if (typeof msg.state === "string" && stateHandlers[msg.type]) {
            log("Single state:", msg.type, msg.state)
            stateHandlers[msg.type](msg.state, shadowRoot);
        }
        // Volume updates (structured object)
        if (msg.type === "volume-state-updated") {
            const state = msg.state || {};
            log("[Volume] Incoming volume-state-updated", state);
            setVolumeUI({ percent: state.percent ?? 0, muted: !!state.muted }, shadowRoot);
        }
        if (msg.type === "timeline-seek-state-updated") {
            const state = msg.state || {};
            const seconds = state.seconds ?? cachedElapsed;
            const duration = state.duration ?? cachedDuration;
            log("[Timeline] Incoming timeline-seek-state-updated", state);
            setTimelineUI(seconds, duration, shadowRoot);
        }
        // When it is a settings update
        if (msg.type === "settings-updated" && msg.settings) {
            
            log("Received settings update:", msg.settings);
            applySettingsToAllTabs(msg.settings);

        }
    });
}
// Helper that formats time correctly 
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}
/// ======== Volume Slider (UI only) ========
function setupVolumeSlider(root) {
    const slider = root.querySelector('.volume_slider');
    const track = root.querySelector('.volume_sliderBackground');
    const progress = root.querySelector('.volume_sliderProgress');
    const handle = root.querySelector('.volume_sliderHandle');
    const button = root.querySelector('.volume_button');
    const iconLow = button?.querySelector('.vol-icon-low');
    const iconHigh = button?.querySelector('.vol-icon-high');
    const iconMute = button?.querySelector('.vol-icon-mute');
    if (!slider || !track || !progress || !handle || !button) return;

    let dragging = false;
    let pointerId = null;
    let observer = null;
    let lastSendTime = 0;
    const SEND_THROTTLE_MS = 60;

    const clamp = (v) => Math.max(0, Math.min(1, v));

    const getTrackMetrics = () => {
        const sliderRect = slider.getBoundingClientRect();
        const trackRect = track.getBoundingClientRect();
        return {
            trackHeight: trackRect.height || 1,
            trackOffsetTop: trackRect.top - sliderRect.top,
            trackTop: trackRect.top
        };
    };

    const percentFromClientY = (clientY) => {
        const { trackHeight, trackTop, trackOffsetTop } = getTrackMetrics();
        const yWithinTrack = clientY - trackTop;
        const percent = 1 - (yWithinTrack / trackHeight);
        return {
            percent: clamp(percent),
            trackHeight,
            trackOffsetTop
        };
    };

    const applyPercent = ({ percent, trackHeight, trackOffsetTop }, { muted = false, skipSend = false } = {}) => {
        const clamped = clamp(percent);
        volumeState.percent = clamped;
        if (clamped > 0) {
            volumeState.lastPercent = clamped;
            volumeState.lastNonZeroPercent = clamped;
        }
        progress.style.height = `${clamped * trackHeight}px`;
        const handleTop = trackOffsetTop + (1 - clamped) * trackHeight - (handle.offsetHeight / 2);
        handle.style.top = `${handleTop}px`;
        slider.dataset.volumePercent = clamped.toFixed(3);
        slider.classList.toggle('muted', muted);
        button.classList.toggle('muted', muted);
        syncButtonFromSlider();
        if (!skipSend) {
            maybeSendVolume(clamped, muted);
        }
    };

    const syncButtonFromSlider = () => {
        const percentVal = parseFloat(slider.dataset.volumePercent || "0");
        const muted = slider.classList.contains('muted') || isNaN(percentVal) || percentVal <= 0;
        const level = muted ? 'mute' : (percentVal <= 0.5 ? 'low' : 'high');
        button.dataset.level = level;
        button.classList.remove('vol-low', 'vol-high', 'vol-mute');
        button.classList.add(level === 'low' ? 'vol-low' : level === 'high' ? 'vol-high' : 'vol-mute');
        if (iconLow && iconHigh && iconMute) {
            iconLow.hidden = level !== 'low';
            iconHigh.hidden = level !== 'high';
            iconMute.hidden = level !== 'mute';
        }
    };

    const maybeSendVolume = (percent, muted) => {
        const now = Date.now();
        if (now - lastSendTime < SEND_THROTTLE_MS) return;
        lastSendTime = now;
        log("[Volume] Sending volume-set-request", { percent, muted });
        browser.runtime.sendMessage({
            type: "volume-set-request",
            percent,
            muted
        });
    };

    const setPercent = (percent) => {
        const metrics = getTrackMetrics();
        const clamped = clamp(percent);
        volumeState.percent = clamped;
        volumeState.lastPercent = clamped;
        volumeState.muted = false;
        applyPercent({ ...metrics, percent: clamped }, { muted: false });
    };

    const toggleMute = () => {
        const metrics = getTrackMetrics();
        const currentPercent = parseFloat(slider.dataset.volumePercent || "0");
        const isCurrentlyMuted = slider.classList.contains('muted') || currentPercent <= 0;

        if (isCurrentlyMuted) {
            const target = volumeState.lastNonZeroPercent || 0.6;
            volumeState.muted = false;
            applyPercent({ ...metrics, percent: target }, { muted: false, skipSend: true });
            log("[Volume] Sending volume-mute-toggle-request (unmute)");
            browser.runtime.sendMessage({ type: "volume-mute-toggle-request" });
        } else {
            volumeState.muted = true;
            applyPercent({ ...metrics, percent: 0 }, { muted: true, skipSend: true });
            log("[Volume] Sending volume-mute-toggle-request (mute)");
            browser.runtime.sendMessage({ type: "volume-mute-toggle-request" });
        }
    };

    const onPointerMove = (e) => {
        if (!dragging || e.pointerId !== pointerId) return;
        const metrics = percentFromClientY(e.clientY);
        volumeState.muted = false;
        applyPercent(metrics, { muted: false });
        e.preventDefault();
    };

    const endDrag = (e) => {
        if (e.pointerId !== pointerId) return;
        dragging = false;
        pointerId = null;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', endDrag);
        window.removeEventListener('pointercancel', endDrag);
    };

    const onPointerDown = (e) => {
        if (e.button !== 0) return; // left click only
        dragging = true;
        pointerId = e.pointerId;
        const metrics = percentFromClientY(e.clientY);
        volumeState.muted = false;
        applyPercent(metrics, { muted: false });
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', endDrag);
        e.preventDefault();
    };

    const onButtonClick = (e) => {
        toggleMute();
        e.preventDefault();
    };

    button.addEventListener('click', onButtonClick);
    slider.addEventListener('pointerdown', onPointerDown);

    // Initialize UI state
    const initialMetrics = getTrackMetrics();
    const initialPercent = volumeState.muted ? 0 : (volumeState.percent ?? 0.6);
    applyPercent({ ...initialMetrics, percent: initialPercent }, { muted: volumeState.muted, skipSend: true });
    syncButtonFromSlider();

    // Keep button in sync if data-volume-percent changes externally
    observer = new MutationObserver(syncButtonFromSlider);
    observer.observe(slider, { attributes: true, attributeFilter: ['data-volume-percent', 'class'] });

    teardownVolumeListener = () => {
        slider.removeEventListener('pointerdown', onPointerDown);
        button.removeEventListener('click', onButtonClick);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', endDrag);
        window.removeEventListener('pointercancel', endDrag);
        if (observer) {
            observer.disconnect();
            observer = null;
        }
    };
}

/// ======== Timeline Scrubber (UI only for now) ========
function setupTimelineScrubber(root) {
    const track = root.querySelector('.timeProgress');
    const progressFill = root.querySelector('.progressBar');
    const handle = root.querySelector('.progressHandle');
    if (!track || !progressFill || !handle) return;

    let pointerId = null;

    const clampPercent = (p) => Math.max(0, Math.min(100, p));
    const SEND_THROTTLE_MS = 60;

    const maybeSendTimelineSeek = (percent, { force = false } = {}) => {
        const now = Date.now();
        if (!force && now - lastTimelineSeekSend < SEND_THROTTLE_MS) return;
        lastTimelineSeekSend = now;
        const clamped = clampPercent(percent);
        const seconds = cachedDuration > 0 ? (clamped / 100) * cachedDuration : null;
        log("[Timeline] Sending seek request", { seconds, percent: clamped });
        browser.runtime.sendMessage({
            type: "timeline-seek-request",
            seconds,
            percent: clamped
        });
    };

    const applyPercent = (percent, { send = false } = {}) => {
        const clamped = clampPercent(percent);
        updateTimelineProgressBar(clamped, root);
        if (cachedDuration > 0) {
            const newElapsed = (clamped / 100) * cachedDuration;
            cachedElapsed = newElapsed;
            updateTimelineMetadataUI(cachedElapsed, cachedDuration, Math.max(cachedDuration - cachedElapsed, 0), root);
        }
        if (send) {
            maybeSendTimelineSeek(clamped);
        }
    };

    const percentFromClientX = (clientX) => {
        const rect = track.getBoundingClientRect();
        if (rect.width === 0) return 0;
        const raw = ((clientX - rect.left) / rect.width) * 100;
        return clampPercent(raw);
    };

    const onMove = (e) => {
        if (e.pointerId !== pointerId) return;
        applyPercent(percentFromClientX(e.clientX), { send: true });
        e.preventDefault();
    };

    const endScrub = (e) => {
        if (e.pointerId !== pointerId) return;
        isTimelineScrubbing = false;
        pointerId = null;
        track.classList.remove('scrubbing');
        // send final position immediately
        applyPercent(percentFromClientX(e.clientX), { send: true });
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', endScrub);
        window.removeEventListener('pointercancel', endScrub);
    };

    track.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        isTimelineScrubbing = true;
        pointerId = e.pointerId;
        track.classList.add('scrubbing');
        applyPercent(percentFromClientX(e.clientX), { send: true });
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', endScrub);
        window.addEventListener('pointercancel', endScrub);
        e.preventDefault();
    });
}
