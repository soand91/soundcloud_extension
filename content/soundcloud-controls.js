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
function getTimeDisplayStateFromDOM() { //TODO SPAN DETECTOR
    return timeBtn.classList.contains('') ? "" : "";
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

function getAllStatesFromDOM() {
    return {
        playPause: getPlayPauseStateFromDOM(),
        shuffle: getShuffleStateFromDOM(),
        repeat: getRepeatStateFromDOM(),
        like: getLikeStateFromDOM(),
        follow: getFollowStateFromDOM()
    };
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
    "time-btn-command": { //TODO
        label: "Time display button",
        getElement: () => timeBtn,
        postClick: () => {
            const currentState = getTimeDisplayStateFromDOM();
            browser.runtime.sendMessage({
                type: "time-btn-state-updated",
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
function setupObserver(selector, type, getStateFn) {
    waitForElement(selector, target => {
        // Mutation observer
        const observer = new MutationObserver(() => {
            browser.runtime.sendMessage({
                type: `${type}-state-updated`,
                state: getStateFn()
            });
        });
        observer.observe(target, { attributes: true, attributeFilter: ['class'] });
        // Initial State sync
        browser.runtime.sendMessage({
            type: `${type}-state-updated`,
            state: getStateFn()
        });
    });
}
setupObserver('.playControl', "playpause", getPlayPauseStateFromDOM);
setupObserver('.shuffleControl', "shuffle", getShuffleStateFromDOM);
setupObserver('.repeatControl', "repeat", getRepeatStateFromDOM);
setupObserver('.playbackSoundBadge__like', "like", getLikeStateFromDOM);
setupObserver('.playbackSoundBadge__follow', "follow", getFollowStateFromDOM);

