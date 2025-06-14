console.log("SoundCloud Controls script loaded!");
// Selectors
const playBtn = document.querySelector('.playControl');
const shuffleState = document.querySelector('.shuffleControl');
const repeatState = document.querySelector('.repeatControl');
const prevBtn = document.querySelector('.skipControl__previous');
const nextBtn = document.querySelector('.skipControl__next');

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

// Command handlers
browser.runtime.onMessage.addListener((msg) => {
    console.log("SC Controls: Received message", msg);
    if (msg.type === "playpause-toggle-command") {
        console.log("Received playpause-toggle-command in SC tab");
        try {
            if (playBtn) {
                playBtn.click();
                console.log("Play button clicked");
                setTimeout(() => {
                    const currentState = getPlayPauseStateFromDOM();
                    browser.runtime.sendMessage({
                        type: "playpause-state-updated",
                        state: currentState
                    });
                }, 50);
            } else {
                console.error("Play button not found in DOM");
            }
        } catch (e) {
            console.error("Error handling playpause command:", e);
        }
    }
    if (msg.type === "shuffle-toggle-command") {
        console.log("Received shuffle-toggle-command in SC tab");
        try {
            if (shuffleState) {
                shuffleState.click();
                console.log("Shuffle button clicked");
                setTimeout(() => {
                    const currentState = getShuffleStateFromDOM();
                    browser.runtime.sendMessage({
                        type: "shuffle-state-updated",
                        state: currentState
                    });
                }, 50);
            } else {
                console.error("Shuffle button not found in DOM");
            }
        } catch (e) {
            console.error("Error handling shuffle command", e);
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
})

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

