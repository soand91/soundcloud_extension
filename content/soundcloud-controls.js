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
function getShuffleStateFromDOM() {
    return shuffleState.classList.contains('m-shuffling') ? "active" : "inactive";
}
function getRepeatStateFromDOM() {
    if (repeatState.classList.contains('m-one')) return 'one';
    if (repeatState.classList.contains('m-all')) return 'all';
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
function getLikeStateFromDOM() {
    const title = badgeLike?.getAttribute("title") || "";
    if (title.includes("Unlike")) return "liked";
    if (title.includes("Like")) return "unliked";
    return "unknown"
}
function getFollowStateFromDOM() {
    const title = badgeFollow?.getAttribute("title") || "";
    if (title.includes("Unfollow")) return "followed";
    if (title.includes("Follow")) return "unfollowed";
    return "unknown"
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
        postClick: () => {
            const currentState = getPlayPauseStateFromDOM();
            browser.runtime.sendMessage({
                type: "playpause-state-updated",
                state: currentState
            });
        }
    },
    "shuffle-toggle-command": {
        label: "Shuffle button",
        getElement: () => shuffleState,
        postClick: () => {
            const currentState = getShuffleStateFromDOM();
            browser.runtime.sendMessage({
                type: "shuffle-state-updated",
                state: currentState
            });
        }
    },
    "repeat-toggle-command": {
        label: "Repeat button",
        getElement: () => repeatState,
        postClick: (msg) => {
            const desiredState = msg.state; // "off", "one", or "all"
            const states = ['off', 'one', 'all'];
            let currentState = getRepeatStateFromDOM();
            let safety = 0;
            // Cycle until reaching desired state and prevent infinite loop
            while (currentState !== desiredState && safety < states.length) {
                repeatState.click();
                currentState = getRepeatStateFromDOM();
                safety++;
            }
            // Report the new state back to the background.js 
            browser.runtime.sendMessage({
                type: "repeat-state-updated",
                state: currentState
            })
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
        postClick: () => {
            const currentState = getTimeDisplayStateFromDOM();
            browser.runtime.sendMessage({
                type: "time-display-state-updated",
                state: currentState
            });
        }
    },
    "avatar-click-command": {
        label: "Artist portrait link",
        getElement: () => badgeArtist
    },
    "artist-click-command": {
        label: "Artist link",
        getElement: () => badgeArtist
    },
    "title-click-command": {
        label: "Title link",
        getElement: () => badgeTitle
    },
    "like-click-command": {
        label: "Like button",
        getElement: () => badgeLike,
        postClick: () => {
            const currentState = getLikeStateFromDOM();
            browser.runtime.sendMessage({
                type: "like-state-updated",
                state: currentState
            });
        }
    },
    "follow-click-command": {
        label: "Follow button", 
        getElement: () => badgeFollow,
        postClick: () => {
            const currentState = getFollowStateFromDOM();
            browser.runtime.sendMessage({
                type: "follow-state-updated",
                state: currentState
            });
        }
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
            handleClickCommand({
                label: config.label,
                customElement: config.getElement?.(),
                selector: config.selector,
                postClick: config.postClick,
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
// Helper to wait for Dynamic DOMS:
function waitForElement(selector, callback) {
    const el = document.querySelector(selector);
    if (el) callback(el);
    else setTimeout(() => waitForElement(selector, callback), 100);
}
// Mutation Observers and Initial State Sync
function registerResilientStateWatcher({
    selector, 
    type, 
    getState,
    strategy = 'attribute',
    container = '.playbackSoundBadge',
    attributeFilter = ['class'],
    intervalMs = 1000,
}) {
    let currentTarget = null;
    let observer = null;
    let pollInterval = null;
    let lastState = null
    
    function attach() {
        scLog(`Attempting to attach watcher for ${type}`);
        const el = document.querySelector(selector);
        if (!el) {
            scWarn(`${type}: selector not found at attach time`);
            return;
        }

        scLog(`${type}: found element, attaching observer`);
        currentTarget = el;

        // Initial state 
        const initialState = getState();
        lastState - initialState;
        browser.runtime.sendMessage({ type: `${type}-state-updated`, state: initialState });

        // Setup strategy
        if (strategy === 'attribute') {
            observer = new MutationObserver(() => {
                scLog(`Mutation detected on ${type}`);
                try {
                    const newState = getState();
                    scLog(`${type} new state:`, newState);
                    if (newState !== lastState) {
                        lastState = newState;
                        browser.runtime.sendMessage({ type: `${type}-state-updated`, state: newState });
                    }
                } catch (err) {
                    scError(`Error in getState for ${type}:`, err);
                }
            });
            observer.observe(el, { attributes: true, attributeFilter });
        }

        else if (strategy === 'style' || strategy === 'text') {
            observer = new MutationObserver(() => {
                const newState = getState();
                if (newState !== lastState) {
                    lastState = newState;
                    browser.runtime.sendMessage({ type: `${type}-state-updated`, state: newState });
                }
            });
            observer.observe(el, {
                attribute: true,
                attributeFilter: strategy === 'style' ? ['style']: undefined,
                characterData: strategy === 'text', 
                subtree: strategy === 'text'
            });
        }

        else if (strategy === 'poll') {
            pollInterval = setInterval(() => {
                const newState = getState();
                if (newState !== lastState) {
                    lastState = newState; 
                    browser.runtime.sendMessage({ type: `${type}-state-updated`, state: newState });
                }
            }, intervalMs);
        }
    }

    function detach() {
        if (observer) observer.disconnect();
        if (pollInterval) clearInterval(pollInterval);
        observer = null;
        pollInterval = null;
        currentTarget = null;
    }

    // Observe container for DOM reattachment
    waitForElement(container, containerEL => {
        const rebinder = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el !== currentTarget) {
                detach();
                attach();
            }
        });

        rebinder.observe(containerEL, { childList: true, subtree: true });
        attach(); // Initial attach
    })
}

registerResilientStateWatcher({ // Playpause
    selector: '.playControl',
    type: 'playpause',
    getState: getPlayPauseStateFromDOM,
    strategy: 'attribute',
    attributeFilter: ['class']
});
registerResilientStateWatcher({ // Shuffle
    selector: '.shuffleControl',
    type: 'shuffle',
    getState: getShuffleStateFromDOM,
    strategy: 'attribute',
    attributeFilter: ['class']
});
registerResilientStateWatcher({ // Repeat
    selector: '.repeatControl',
    type: 'repeat',
    getState: getRepeatStateFromDOM,
    strategy: 'attribute',
    attributeFilter: ['class']
});
registerResilientStateWatcher({ // Like
    selector: '.playbackSoundBadge__like',
    type: 'like',
    getState: getLikeStateFromDOM,
    strategy: 'attribute',
    attributeFilter: ['class']
});
registerResilientStateWatcher({ // Follow
    selector: '.playbackSoundBadge__follow',
    type: 'follow',
    getState: getFollowStateFromDOM,
    strategy: 'attribute',
    attributeFilter: ['class']
});
registerResilientStateWatcher({ // Artist
    selector: '.playbackSoundBadge__lightLink',
    type: 'songArtist',
    getState: getSongArtistFromDOM,
    strategy: 'text',
    container: '.playbackSoundBadge'
});
registerResilientStateWatcher({ // Title
    selector: '.playbackSoundBadge__titleLink',
    type: 'songTitle',
    getState: getSongTitleFromDOM,
    strategy: 'text',
    container: '.playbackSoundBadge'
});
registerResilientStateWatcher({ // Avatar
    selector: '.playbackSoundBadge__avatar .sc-artwork.image__full',
    type: 'avatar',
    getState: getAvatarURL,
    strategy: 'style',
    container: '.playbackSoundBadge',
    attributeFilter: ['style']
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





















// window.addEventListener("focus", () => {
//     scLog("[🔄 Tab Focus] Re-checking important nodes...");
//     debugNode("Like Button", '.playbackSoundBadge__like');
//     debugNode("Follow Button", '.playbackSoundBadge__follow');
//     debugNode("Artist Link", '.playbackSoundBadge__lightLink');
//     debugNode("Song Link", '.playbackSoundBadge__titleLink');
// });