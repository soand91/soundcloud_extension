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
function getAllStatesFromDOM() {
    return {
        playPause: getPlayPauseStateFromDOM(),
        shuffle: getShuffleStateFromDOM(),
        repeat: getRepeatStateFromDOM()
    };
}

// Command handlers
browser.runtime.onMessage.addListener((msg) => {
    scLog("SC Controls: Received message", msg);
    if (msg.type === "playpause-toggle-command") {
        scLog("Received playpause-toggle-command in SC tab");
        try {
            if (playBtn) {
                playBtn.click();
                scLog("Play button clicked");
                setTimeout(() => {
                    const currentState = getPlayPauseStateFromDOM();
                    browser.runtime.sendMessage({
                        type: "playpause-state-updated",
                        state: currentState
                    });
                }, 50);
            } else {
                scError("Play button not found in DOM");
            }
        } catch (e) {
            scError("Error handling playpause command:", e);
        }
    }
    if (msg.type === "shuffle-toggle-command") {
        scLog("Received shuffle-toggle-command in SC tab");
        try {
            if (shuffleState) {
                shuffleState.click();
                scLog("Shuffle button clicked");
                setTimeout(() => {
                    const currentState = getShuffleStateFromDOM();
                    browser.runtime.sendMessage({
                        type: "shuffle-state-updated",
                        state: currentState
                    });
                }, 50);
            } else {
                scError("Shuffle button not found in DOM");
            }
        } catch (e) {
            scError("Error handling shuffle command", e);
        }
    }
    if (msg.type === "repeat-toggle-command") {
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
    if (msg.type === "skip-prev-command") {
        scLog("Received skip-prev command in SC tab");
        try {
            if (prevBtn) {
                prevBtn.click();
                scLog("Skip prev button clicked");
            } else {
                scError("Skip prev button not found in DOM");
            }
        } catch (e) {
            scError("Error handling the skip-prev command:", e);
        }
    }
    if (msg.type === "skip-next-command") {
        scLog("Received skip-next command in SC tab");
        try {
            if (nextBtn) {
                nextBtn.click();
                scLog("Skip next button clicked");
            } else {
                scError("Skip next button not found in DOM");
            }
        } catch (e) {
            scError("Error handling the skip-next command:", e);
        }
    }
    if (msg.type === "time-btn-command") {
        scLog("Received time-btn command in SC tab");
        try {
            if (timeBtn) {
                timeBtn.click();
                scLog("Time button clicked");
            } else {
                scError("Time button not found in DOM");
            }
        } catch (e) {
            scError("Error handling the time-btn command:", e);
        }
    }        
    if (msg.type === "avatar-click-command") {
        scLog("Received avatar-click command in SC tab");
        try {
            if (badgeTitle) {
                badgeTitle.click();
                scLog("Avatar clicked");
            } else {
                scError("Avatar not found in DOM");
            }
        } catch (e) {
            scError("Error handling the avatar click command:", e);
        }
    }
    if (msg.type === "artist-click-command") {
        handleClickCommand({ customElement: badgeArtist, label: "Artist link" })
    }
    if (msg.type === "title-click-command") {
        scLog("Received title-click command in SC tab");
        try {
            if (badgeTitle) {
                badgeTitle.click();
                scLog("Title link clicked");
            } else {
                scError("Title link not found in DOM");
            }
        } catch (e) {
            scError("Error handling the title click command:", e);
        }
    }
    if (msg.type === "like-click-command") {
        scLog("Received like-click command in SC tab");
        try {
            if (badgeLike) {
                badgeLike.click();
                scLog("Like button clicked");
            } else {
                scError("Like button not found in DOM");
            }
        } catch (e) {
            scError("Error handling the like click command:", e);
        }
    }
    if (msg.type === "follow-click-command") {
        scLog("Received follow-click command in SC tab");
        try {
            if (badgeFollow) {
                badgeFollow.click();
                scLog("Follow button clicked");
            } else {
                scError("Follow button not found in DOM");
            }
        } catch (e) {
            scError("Error handling the follow click command:", e);
        }
    }
    if (msg.type === "queue-click-command") {
        scLog("Received queue-click command in SC tab");
        try {
            if (badgeQueue) {
                badgeQueue.click();
                scLog("Queue button clicked");
            } else {
                scError("Queue button not found in DOM");
            }
        } catch (e) {
            scError("Error handling the queue click command:", e);
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
    customElement = null
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
        } else if (++attempts <maxAttempts) {
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

