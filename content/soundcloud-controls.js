/// ======== Constants and State ========
const playBtn = document.querySelector('.playControl');
const shuffleState = document.querySelector('.shuffleControl');
const repeatState = document.querySelector('.repeatControl');
const prevBtn = document.querySelector('.skipControl__previous');
const nextBtn = document.querySelector('.skipControl__next');

const timeBtn = document.querySelector('.playbackTimeline__duration');
const badgeArtist = document.querySelector('.playbackSoundBadge__lightLink')
const badgeTitle = document.querySelector('.playbackSoundBadge__titleLink');
const badgeLike = document.querySelector('.playbackSoundBadge__like');
const badgeFollow = document.querySelector('.playbackSoundBadge__follow');
const badgeQueue = document.querySelector('.playbackSoundBadge__showQueue');

const DEBUG = true;
function scLog(...args) {
  if (DEBUG) console.log("[SC Controls]", ...args);
}
function scWarn(...args) {
  if (DEBUG) console.warn("[SC Controls]", ...args);
}
function scError(...args) {
  console.error("[SC Controls]", ...args); // always log errors
}
function debugNode(label, selector) {
    const el = document.querySelector(selector);
    if (el) {
        scLog(`[${label}] Found:`, el);
    } else {
        scWarn(`[${label}] Not found: ${selector}`);
    }
}

scLog("Script loaded on:", location.href);

// Helpers: state-readers
function getPlayPauseStateFromDOM() {
    return playBtn.classList.contains('playing') ? "playing" : "paused";
}
function getShuffleStateFromDOM(el) {
    el = el ?? document.querySelector('.shuffleControl');
    return el?.classList.contains('m-shuffling') ? "active" : "inactive";
}
function getRepeatStateFromDOM(el) {
    el = el ?? document.querySelector('.repeatControl');
    if (el?.classList.contains('m-one')) return 'one';
    if (el?.classList.contains('m-all')) return 'all';
    return 'off'
}
function getTimeDisplayStateFromDOM() {
    const displayContainer = document.querySelector('.playbackTimeline__duration');
    if (!displayContainer) return "unknown";

    const timeSpan = displayContainer.querySelector('span[aria-hidden="true"]');
    if (!timeSpan || !timeSpan.textContent.trim()) return "unknown";

    const text = timeSpan.textContent.trim();
    return text.startsWith("-") ? "remaining" : "duration";
}
function getLikeStateFromDOM(el) {
    el = el ?? document.querySelector('.playbackSoundBadge__like')
    return el?.classList.contains('sc-button-selected') ? "liked" : "unliked"
}
function getFollowStateFromDOM(el) {
    el = el ?? document.querySelector('.playbackSoundBadge__follow')
    return el?.classList.contains('sc-button-selected') ? "followed" : "unfollowed"
}
function getQueueStateFromDOM() { //TODO
    const title = badgeQueue?.getAttribute("title") || "";
    if (title.includes("")) return "";
    if (title.includes("")) return "";
    return "unknown"
}
function getSongTitleFromDOM() {
    const titleEl = document.querySelector('.playbackSoundBadge__titleLink span[aria-hidden="true"]');
    return titleEl?.textContent?.trim() ?? null;
}
function getSongArtistFromDOM() {
    const ArtistEl = document.querySelector('.playbackSoundBadge__lightLink');
    return ArtistEl?.textContent?.trim() ?? null;
}
function getDurationFromDOM() { //! This returns total song duration in seconds only if duration mode (not remaining)
    const el = document.querySelector('.playbackTimeline__progressWrapper');
    const val = el?.getAttribute('aria-valuemax');
    return val ? Number(val) : null;
}
function getElapsedSecondsFromDOM() { //! This returns seconds that is used to show time passed, calculate bar width and handle left via divide getElapsedSeconds / getDuration
    const el = document.querySelector('.playbackTimeline__progressWrapper');
    const val = el?.getAttribute('aria-valuenow');
    return val ? Number(val) : null;
}
function getAvatarURL() {
    const artworkEl = document.querySelector('.playbackSoundBadge__avatar .sc-artwork.image__full');
    if (!artworkEl) return null;

    const bg = getComputedStyle(artworkEl).backgroundImage;
    const match = bg.match(/url\("(.+?)"\)/);
    return match ? match[1] : null;
}
function getAllStatesFromDOM() {
    return {
        playPause: getPlayPauseStateFromDOM(),
        shuffle: getShuffleStateFromDOM(),
        repeat: getRepeatStateFromDOM(),
        like: getLikeStateFromDOM(),
        follow: getFollowStateFromDOM(),
        display: getTimeDisplayStateFromDOM(),
        songTitle: getSongTitleFromDOM(),
        songArtist: getSongArtistFromDOM(),
        avatar: getAvatarURL(),
        duration: getDurationFromDOM(),

        secondsElapsed: getElapsedSecondsFromDOM(),
    };
}

// Helper to convert strings _:__ to seconds number
function parseTimeString(timeStr) {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) {
        const [minutes, seconds] = parts;
        return minutes * 60 + seconds;
    }
    return 0;
}

const clickCommandMap = {
    "playpause-toggle-command": {
        label: "Play/Pause button",
        getElement: () => playBtn,
    },
    "shuffle-toggle-command": {
        label: "Shuffle button",
        getElement: () => shuffleState,
    },
    "repeat-toggle-command": {
        label: "Repeat button",
        getElement: () => repeatState,
        postClick: async (msg) => {
            const desiredState = msg.state;
            const states = ['off', 'one', 'all'];
            let currentState = getRepeatStateFromDOM();
            let safety = 0;

            const waitForStateChange = async (expectedState) => {
                // Try requestAnimationFrame first (fastest for visual updates)
                await new Promise(resolve => requestAnimationFrame(resolve));
                
                let newState = getRepeatStateFromDOM();
                if (newState === expectedState) return newState;

                // Fall back to short polling if RAF wasn't enough
                for (let i = 0; i < 10; i++) {
                    await new Promise(resolve => setTimeout(resolve, 5));
                    newState = getRepeatStateFromDOM();
                    if (newState === expectedState) return newState;
                }

                return newState; // Return whatever state we have
            };

            while (currentState !== desiredState && safety < states.length) {
                const nextStateIndex = (states.indexOf(currentState) + 1) % states.length;
                const expectedNextState = states[nextStateIndex];
                
                repeatState.click();
                currentState = await waitForStateChange(expectedNextState);
                safety++;
            }

            browser.runtime.sendMessage({
                type: "repeat-state-updated",
                state: currentState
            });
        }
    },
    "skip-prev-command": {
        label: "Skip prev button",
        getElement: () => prevBtn
    },
    "skip-next-command": {
        label: "Skip next button",
        getElement: () => nextBtn
    },
    "time-btn-command": {
        label: "Time display button",
        getElement: () => timeBtn,
    },
    "avatar-click-command": {
        label: "Artist portrait link",
        selector: ".playbackSoundBadge__avatar",
        customElement: () => badgeArtist 
    },
    "artist-click-command": {
        label: "Artist link",
        selector: ".playbackSoundBadge__lightLink",
        customElement: () => badgeArtist
    },
    "title-click-command": {
        label: "Title link",
        selector: ".playbackSoundBadge__titleLink",
        customElement: () => badgeTitle
    },
    "like-click-command": {
        isComplex: true,
        label: "Like button",
        selector: ".playbackSoundBadge__like",
        getCurrentState: getLikeStateFromDOM,
        desiredState: null,

    },
    "follow-click-command": {
        isComplex: true,
        label: "Follow button",
        selector: ".playbackSoundBadge__follow",
        getCurrentState: getFollowStateFromDOM,
        desiredState: null,
    },
    "queue-click-command": { //TODO
        label: "Queue button",
        getElement: () => badgeQueue,
        postClick: () => {
            const currentState = getQueueStateFromDOM();
            browser.runtime.sendMessage({
                type: "queue-state-updated",
                state: currentState
            });
        }
    }
}

// Command handlers
browser.runtime.onMessage.addListener((msg) => {
    scLog("SC Controls: Received message", msg);

    // Dry centralized handler
    if (msg.type in clickCommandMap) {
        const config = clickCommandMap[msg.type];
        scLog(`Received ${msg.type} in SC tab`);
        try {
            const clickFn = config.isComplex ? handleComplexClickCommand : handleClickCommand;
            clickFn({
                ...config, 
                customElement: config.getElement?.(),
                msg
            });
        } catch (e) {
            scError(`Error handling ${msg.type}:`, e);
        }
    }

    if (msg.type === "get-all-states") {
        return Promise.resolve(getAllStatesFromDOM());
    }
})

// Helper for click commands
function handleClickCommand({
    selector, 
    label, 
    maxAttempts = 10,
    intervalMs = 500,
    customElement = null,
    postClick = null,
    msg = null // pass full message through
}) {
    scLog(`Looking for ${label}...`);
    let attempts = 0;
    
    function simulateRealClick(el) {
        const events = ["mousedown", "mouseup", "click"];
        events.forEach(type => {
            el.dispatchEvent(new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window
            }));
        });
        scLog(`${label} fully clicked (${events.join(", ")})`);
    }

    function tryClick() {
        const el = customElement || document.querySelector(selector);
        if (el && el.offsetParent !== null) {
            simulateRealClick(el);
            if (postClick) {
                setTimeout(() => postClick(msg), 50); // passes message here
            }
        } else if (++attempts < maxAttempts) {
            setTimeout(tryClick, intervalMs);
        } else {
            scError(`${label} not found or not interactable after ${maxAttempts} attempts`);
        }
    }
    tryClick();
}
// Helper for complex click commands
function handleComplexClickCommand({
    selector, 
    label,
    desiredState = null,
    getCurrentState = null,
    shouldClick = null,
    maxAttempts = 10,
    intervalMs = 500,
    postClick = null,
    msg = null
}) {
    scLog(`[Complex] Looking for ${label}...`);
    let attempts = 0;

    function simulateRealClick(el) {
        const events = ["mousedown", "mouseup", "click"];
        events.forEach(type => {
            el.dispatchEvent(new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window
            }));
        });
        scLog(`[Complex] ${label} fully clicked (${events.join(", ")})`);
    }
    
    function tryClick() {
        const el = document.querySelector(selector);
        const ready = el && el.offsetParent !== null;

        if (ready) {
            const currentState = getCurrentState?.();
            const shouldProceed = shouldClick
                ? shouldClick({ el, currentState, msg })
                : desiredState
                    ? currentState !== desiredState
                    : true;
            if (!shouldProceed) {
                scLog(`[Complex] ${label} already in desired state: ${currentState}`)
                return;
            }
            simulateRealClick(el);
            if (postClick) {
                setTimeout(() => postClick(msg), 100);
            }
        } else if (++attempts < maxAttempts) {
            setTimeout(tryClick, intervalMs);
        } else {
            scError(`[Complex] ${label} not found or not clickable after ${maxAttempts} attempts`);
        }
    }
    tryClick();
}
// Helper to wait for Dynamic DOMS:
function waitForElement(selector, callback) {
    let lastElement = null;
    let stableCount = 0;
    const requiredStableChecks = 3;
    
    const check = () => {
        const el = document.querySelector(selector);
        if (!el) {
            setTimeout(check, 1000);
            return;
        }
        if (el === lastElement) {
            stableCount++;
            if (stableCount >= requiredStableChecks) {
                callback(el);
                return;
            }
        } else {
            stableCount = 0;
            lastElement = el;
        }
        setTimeout(check, 100);
    };
    check();
}
// Mutation Observers and Initial State Sync
function registerResilientStateWatcher({
    selector, 
    type, 
    getState,
    strategy = 'attribute',
    container = '.playControls__soundBadge',
    attributeFilter = ['class'],
    intervalMs = 1000,
}) {
    let currentTarget = null;
    let observer = null;
    let pollInterval = null;
    let lastState = null
    let rebinder = null;
    
    function attach() {
        scLog(`Attempting to attach watcher for ${type}`);
        const el = document.querySelector(selector);
        if (!el) {
            scWarn(`${type}: selector not found at attach time`);
            return;
        }

        detach();

        scLog(`${type}: found element, attaching observer`);
        currentTarget = el;

        // Initial state 
        const initialState = getState();
        lastState = initialState;
        browser.runtime.sendMessage({ type: `${type}-state-updated`, state: initialState });

        // Setup strategy
        if (strategy === 'attribute') {
            observer = new MutationObserver(() => {
                setTimeout(() => {
                    scLog(`Mutation detected on ${type}`);
                    try {
                        const newState = getState();
                        scLog(`${type} new state: ${newState}, last: ${lastState}`);
                        if (newState !== lastState) {
                            lastState = newState;
                            scLog(`[${type}] sending message`, {
                                type: `${type}-state-updated`,
                                state: newState
                            });
                            browser.runtime.sendMessage({ type: `${type}-state-updated`, state: newState });
                        }
                    } catch (err) {
                        scError(`Error in getState for ${type}:`, err);
                    }
                }, 100);
            });
            observer.observe(el, { attributes: true, attributeFilter });
        }

        else if (strategy === 'style' || strategy === 'text') {
            observer = new MutationObserver(() => {
                try {
                    const newState = getState();
                    if (newState !== lastState) {
                        lastState = newState;
                        browser.runtime.sendMessage({ type: `${type}-state-updated`, state: newState });
                    }
                } catch (err) {
                    scError(`Error in getState for ${type}:`, err);
                }
            });
            observer.observe(el, {
                attributes: strategy === 'style',
                attributeFilter: strategy === 'style' ? ['style']: undefined,
                characterData: strategy === 'text', 
                subtree: strategy === 'text'
            });
        }

        else if (strategy === 'poll') {
            pollInterval = setInterval(() => {
                try{
                    const newState = getState();
                    if (newState !== lastState) {
                        lastState = newState; 
                        browser.runtime.sendMessage({ type: `${type}-state-updated`, state: newState });
                    }
                } catch (err) {
                    scError(`Error in getState for ${type}:`, err);
                }
            }, intervalMs);
        }
    }

    function detach() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
        currentTarget = null;
    }

    function init() {
        // Observe container for DOM reattachment
        waitForElement(container, containerEL => {
            // Watch for the playbackSoundBadge to be added/removed/changed
            rebinder = new MutationObserver((mutations) => {
                let shouldReattach = false;
                
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // If playbackSoundBadge was added, or out target is inside it
                            if (node.classList?.contains('playbackSoundBadge') ||
                                node.querySelector?.('.playbackSoundBadge') ||
                                node.querySelector?.(selector)) {
                                    shouldReattach = true;
                            }        
                        }
                    });

                    mutation.removedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // If our current target was removed
                            if (node === currentTarget ||
                                node.contains?.(currentTarget) ||
                                node.classList?.contains('playbackSoundBadge')) {
                                shouldReattach = true;
                            }
                        }
                    });
                });

                if (shouldReattach) {
                    scLog(`${type}: playbackSoundBadge changed, reattaching`);
                    // Wait a bit for DOM to stabilize, then reattach
                    setTimeout(() => {
                        const newEl = document.querySelector(selector);
                        if (newEl !== currentTarget) {
                            attach();
                        }
                    }, 100);
                }
            });

            rebinder.observe(containerEL, { childList: true, subtree: true });
            attach(); // Initial attach
        });
    }
    function cleanup() {
        detach();
        if (rebinder) {
            rebinder.disconnect();
            rebinder = null;
        }
    }

    init();

    return cleanup;
}

registerResilientStateWatcher({ // Playpause
    selector: '.playControl',
    type: 'playpause',
    getState: getPlayPauseStateFromDOM,
    strategy: 'attribute',
    attributeFilter: ['class']
});
registerResilientStateWatcher({ // Artist
    selector: '.playbackSoundBadge__lightLink',
    type: 'songArtist',
    getState: getSongArtistFromDOM,
    strategy: 'text',
    container: '.playControls__soundBadge'
});
registerResilientStateWatcher({ // Title
    selector: '.playbackSoundBadge__titleLink',
    type: 'songTitle',
    getState: getSongTitleFromDOM,
    strategy: 'text',
    container: '.playControls__soundBadge'
});
registerResilientStateWatcher({ // Avatar
    selector: '.playbackSoundBadge__avatar .sc-artwork.image__full',
    type: 'avatar',
    getState: getAvatarURL,
    strategy: 'style',
    attributeFilter: ['style'],
    container: '.playControls__soundBadge'
});
registerResilientStateWatcher({ // secondsElapsed
    selector: '.playbackTimeline__progressWrapper',
    type: 'secondsElapsed',
    getState: getElapsedSecondsFromDOM,
    strategy: 'poll',
    intervalMs: 500
});
registerResilientStateWatcher({ // Duration
    selector: '.playbackTimeline__progressWrapper',
    type: 'duration',
    getState: getDurationFromDOM,
    strategy: 'poll',
    intervalMs: 500
});

// Observers for Like & Follow only
(() => {
    class StateMonitor {
        constructor({
            containerSelector,
            targetSelector,
            label,
            getStateFn,
            onStateChange,
            logPrefix = '[StateMonitor]',
            quietMode = true,
            debounceMs = 100
        }) {
            this.containerSelector = containerSelector;
            this.targetSelector = targetSelector;
            this.label = label;
            this.getStateFn = getStateFn;
            this.onStateChange = onStateChange;
            this.logPrefix = logPrefix;
            this.quietMode = quietMode;
            this.debounceMs = debounceMs;

            this.containerObserver = null;
            this.targetObserver = null;
            this.currentTarget = null;
            this.lastState = null;
            this.isRunning = false;
            this.debounceTimer = null;

            this.handleContainerMutation = this.handleContainerMutation.bind(this);
            this.handleTargetMutation = this.handleTargetMutation.bind(this);
        }

        log(msg, data) {
            if (!this.quietMode) {
                console.log(`${this.logPrefix} ${msg}`, data || '');
            }
        }

        start() {
            const container = document.querySelector(this.containerSelector);
            if (!container) {
                console.warn(`${this.logPrefix} Container not found: ${this.containerSelector}`);
                return false;
            }

            this.log(`🚀 Starting monitor for ${this.label}`);

            this.containerObserver = new MutationObserver(this.handleContainerMutation);
            this.containerObserver.observe(container, { childList: true, subtree: true });

            this.attachTarget();
            this.isRunning = true;
            return true;
        }

        stop() {
            this.containerObserver?.disconnect();
            this.targetObserver?.disconnect();
            this.containerObserver = null;
            this.targetObserver = null;
            this.currentTarget = null;
            this.lastState = null;
            this.isRunning = false;
            this.log(`🛑 Stopped monitor for ${this.label}`);
        }

        attachTarget() {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                const target = document.querySelector(this.targetSelector);
                if (!target) return;

                if (this.targetObserver) this.targetObserver.disconnect();

                this.currentTarget = target;
                this.lastState = this.getStateFn(target);

                this.targetObserver = new MutationObserver(this.handleTargetMutation);
                this.targetObserver.observe(target, {
                    attributes: true,
                    attributeFilter: ['class', 'title', 'aria-label'],
                    attributeOldValue: true
                });

                this.log(`Attached to ${this.label} target`);
            }, this.debounceMs);
        }

        handleContainerMutation() {
            this.attachTarget();
        }

        handleTargetMutation() {
            const newState = this.getStateFn(this.currentTarget);
            if (JSON.stringify(this.lastState) !== JSON.stringify(newState)) {
                this.lastState = newState;
                this.onStateChange(newState);
            }
        }

        toggleQuietMode() {
            this.quietMode = !this.quietMode;
            this.log(`Quiet mode ${this.quietMode ? 'ENABLED' : 'DISABLED'}`);
        }

        getStatus() {
        return {
            label: this.label,
            isRunning: this.isRunning,
            quietMode: this.quietMode,
            currentState: this.lastState
        };
        }
    }

    // SHUFFLE BUTTON INSTANCE 
    const shuffleMonitor = new StateMonitor({
        containerSelector: '.playControls__control',
        targetSelector: '.shuffleControl',
        label: 'Shuffle',
        getStateFn: getShuffleStateFromDOM,
        onStateChange: state => {
            browser.runtime.sendMessage({
                type: "shuffle-state-updated",
                state: state
            });
            console.log(`[ShuffleMonitor] ${state.toUpperCase()}`)
        }
    });
    
    // REPEAT BUTTON INSTANCE
    const repeatMonitor = new StateMonitor({
        containerSelector: '.playControls__control',
        targetSelector: '.repeatControl',
        label: 'Repeat',
        getStateFn: getRepeatStateFromDOM,
        onStateChange: state => {
            browser.runtime.sendMessage({
                type: "repeat-state-updated",
                state: state
            })
            console.log(`[RepeatMonitor] ${state.toUpperCase()}`)            
        }
    })

    // LIKE BUTTON INSTANCE - simplified state
    const likeMonitor = new StateMonitor({
        containerSelector: '.playControls__soundBadge',
        targetSelector: '.playbackSoundBadge__like',
        label: 'Like',
        getStateFn: getLikeStateFromDOM,
        onStateChange: state => {
            const icon = state === "liked" ? '❤️' : '🤍';
            browser.runtime.sendMessage({
                type: "like-state-updated",
                state: state
            })
            console.log(`[LikeMonitor] ${icon} ${state.toUpperCase()}`);
        }
    });

    // FOLLOW BUTTON INSTANCE - simplified state
    const followMonitor = new StateMonitor({
        containerSelector: '.playControls__soundBadge',
        targetSelector: '.playbackSoundBadge__follow',
        label: 'Follow',
        getStateFn: getFollowStateFromDOM,
        onStateChange: state => {
            const icon = state === "followed" ? '✅' : '➕';
            browser.runtime.sendMessage({
                type: "follow-state-updated",
                state: state
            })
            console.log(`[FollowMonitor] ${icon} ${state.toUpperCase()}`);
        }
    });

    // Start both
    shuffleMonitor.start();
    repeatMonitor.start();
    likeMonitor.start();
    followMonitor.start();

    // Expose for debugging
    window.stateMonitors = {
        likeMonitor,
        followMonitor
    };
})();