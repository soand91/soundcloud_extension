/// ======== Constants and State ========
const STATE_KEYS = ['play_pause', 'shuffle', 'repeat'];
let shadowRoot = null;

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
})

/// ======== Shadow DOM Injection ========
async function injectToolbar() {

    log("Injecting toolbar Shadow DOM...");
    // 1. Create host and shadow root
    const host = document.createElement('div');
    host.id = "soundcloud-toolbar-host";
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    // 1. Fetch the font as a Blob
    const fontBlob = await fetch(browser.runtime.getURL('controls/Inter-SemiBold.woff'))
        .then(r => r.blob());
    // 2. Create a Blob URL
    const fontUrl = URL.createObjectURL(fontBlob);
    // 3. Inject with FontFace API (bypasses Firefox's restrictions)
    const fontFace = new FontFace('Inter', `url(${fontUrl})`, {
        weight: 600,
        style: 'normal',
        display: 'swap'
    });
    // 4. Force-load and apply
    await fontFace.load();
    document.fonts.add(fontFace);
    // 5. Apply to all Shadow DOM elements
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

/// ======== Sync All States from [background.js] ========
async function syncAllStates() {
    log("Requesting all UI states from background...");
    const response = await browser.runtime.sendMessage({ type: "get-all-states" });

    if (!response) {
        warn("No response from get-all-states");
        return;
    }

    log("Received states:", {
        playpause: response.playpause,
        shuffle: response.shuffle,
        repeat: response.repeat
    });
    setPlayPauseButtonUI(response.playpause, shadowRoot);
    setShuffleButtonUI(response.shuffle, shadowRoot);
    setRepeatButtonUI(response.repeat, shadowRoot);
    //! may have to include container states
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
    if (state === 'playing') btn.classList.add('playing');
    else if (state === 'paused') btn.classList.add('paused');
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
function applySettingsToAllTabs(settings) {
    applyStartOpenSetting(!!settings['start-open-toggle']);
    applyActiveTabSetting(!!settings['active-tab-toggle']);
    applyThemeSetting(!!settings['theme-default-toggle']);
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
    const close_btn     = root.querySelector('.collapse-btn');
    const open_icon     = root.querySelector('.ext-icon');
    const timeBtn = root.querySelector('.timeDuration');
    const badgeAvatar = root.querySelector('.soundBadge_avatar');
    const badgeArtist = root.querySelector('.artistLink')
    const badgeTitle = root.querySelector('.titleLink');
    const badgeLike = root.querySelector('.soundBadge_like');
    const badgeFollow = root.querySelector('.soundBadge_follow');
    const badgeQueue = root.querySelector('.soundBadge_queue');

    async function sendSimpleRequest(type, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await browser.runtime.sendMessage({ type });
                console.log(`${type} succeeded`, response);
                return response;
            } catch (error) {
                console.warn(`Attempt ${attempt} failed for ${type}:`, error);
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

    if (repeat) {
        repeat.addEventListener('click', async () => {
            const states = ['off', 'one', 'all'];
            let currentIndex = states.findIndex(state => repeat.classList.contains(state));
            const nextIndex = (currentIndex + 1) % states.length;
            const nextState = states[nextIndex];
            try {
                const response = await browser.runtime.sendMessage({
                    type: "repeat-toggle-request",
                    state: nextState
                });
                if (response && response.success) {
                    console.log("repeat-toggle-request succeeded")
                    repeat.classList.remove(...states);
                    repeat.classList.add(nextState);
                } else {
                    warn("repeat-toggle-request failed or was ignored.")
                }
            } catch (err) {
                console.error('Repeat toggle failed:', err);
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
        "playpause-state-changed": setPlayPauseButtonUI,
        "shuffle-state-changed": setShuffleButtonUI,
        "repeat-state-changed": setRepeatButtonUI,
    };
    browser.runtime.onMessage.addListener((msg) => {
        log("Incoming message:", msg);
        if (!msg || typeof msg !== 'object') return;
        // When it is an all-states update
        if (msg.type === "all-states-updated") {
            const states = msg.state || msg;
            log("Received states update:", {
                playPause: states.playPause,
                shuffle: states.shuffle,
                repeat: states.repeat
            });
            if (states.playPause) {
                stateHandlers["playpause-state-changed"](states.playPause, shadowRoot);
            }
            if (states.shuffle) {
                stateHandlers["shuffle-state-changed"](states.shuffle, shadowRoot);
            }
            if (states.repeat) {
                stateHandlers["repeat-state-changed"](states.repeat, shadowRoot);
            }
        }
        // When it is a single-state update
        if (typeof msg.state === "string" && stateHandlers[msg.type]) {
            log("Single state:", msg.type, msg.state)
            stateHandlers[msg.type](msg.state, shadowRoot);
        }
        // When it is a settings update
        if (msg.type === "settings-updated" && msg.settings) {
            
            log("Received settings update:", msg.settings);
            applySettingsToAllTabs(msg.settings);

        }
    });
}
