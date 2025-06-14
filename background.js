let soundcloudTabs = new Map();
let activeSoundCloudTabId = null;

// Find all current SoundCloud tabs and add them
browser.tabs.query({url: "*://soundcloud.com/*"}).then(tabs => {
    for (const tab of tabs) {
        soundcloudTabs.set(tab.id, { title: tab.title, url: tab.url });
        activeSoundCloudTabId = tab.id //TODO logic for most recent/first, etc.
    }
    console.log("Populated SoundCloud tabs on startup", Array.from(soundcloudTabs.entries()))
})
// Update when tabs are opened
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!tab.url) return;
    if (tab.url.includes('soundcloud.com')) {
        if (changeInfo.status === 'complete' || changeInfo.url) {
            soundcloudTabs.set(tabId, { title: tab.title, url: tab.url });
            activeSoundCloudTabId = tabId;
            console.log("SoundCloud tab set/updated", tabId, tab.url);
        }
    } else {
        if (soundcloudTabs.has(tabId)) {
            soundcloudTabs.delete(tabId);
            console.log("Tab navigated away, removed from SC set", tabId);
        }
    }
});
browser.tabs.onRemoved.addListener((tabId) => {
    if (soundcloudTabs.has(tabId)) {
        soundcloudTabs.delete(tabId);
        console.log("SoundCloud tab closed:", tabId);
    }
    // If the closed tab was the active one, pick new of any remaining
    if (tabId === activeSoundCloudTabId) {
        const tabIds = Array.from(soundcloudTabs.keys());
        if (tabIds.length > 0) {
            activeSoundCloudTabId = tabIds[0];
            //TODO Optionally: broadcast to popup/content.js that the active tab has changed
        } else {
            activeSoundCloudTabId = null;
            //TODO Optionally: broadcast "no SoundCloud tabs open"
        }
    }
});
// On tab activation, "last interacted" logic
browser.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
        const tab = await browser.tabs.get(tabId);
        if (tab.url && tab.url.includes("soundcloud.com")) {
            activeSoundCloudTabId = tabId;
            console.log("Active SC tab set by activation:", tabId);
        }
    } catch (e) {}
});
// On navigation to SoundCloud
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('soundcloud.com')) {
        activeSoundCloudTabId = tabId;
        console.log("Active SC tab set by navigation", tabId);
    }
});

// Helper: find and set the SoundCloud tab ID if not known
async function ensureSoundCloudTabId(callback) {
    console.log("Starting ensureSoundCloudTabId");
    try {
        if (activeSoundCloudTabId !== null) {
            console.log("Checking existing tab ID", activeSoundCloudTabId);
            try {
                const tab = await browser.tabs.get(activeSoundCloudTabId);
                console.log("Existing tab found:", tab.id, tab.url);
                if (tab.url.includes('soundcloud.com')) {
                    console.log("Returning existing tab");
                    callback(activeSoundCloudTabId);
                    return;
                }
            } catch (e) {
                // Tab was closed or inaccessible
                console.error("Error checking existing tab:", e);
                activeSoundCloudTabId = null;
            }
        } 
        console.log("Searching through all tracked tabs");
        for (let [tabId, _] of soundcloudTabs) {
            try {
                console.log("Checking tab ID:", tabId);
                const tab = await browser.tab.get(tabId);
                console.log("Tab found:", tab.id, tab.url);
                if (tab.url.includes('soundcloud.com')) {
                    activeSoundCloudTabId = tabId;
                    console.log("Setting new active tab:", tabId);
                    callback(tabId);
                    return;
                }
            } catch (e) {
                // Remove dead tab from tracking
                console.error("Error checking tab:", tabId, e);
                soundcloudTabs.delete(tabId);
            }
        }
        console.log("No valid SoundCloud tab found");
        callback(null);
    } catch (e) {
        console.error("Critical error in ensureSoundCloudTabId:", e);
        callback(null);
    }
}

// Helper: broadcaster function for confirmation handling
function broadcastStateToContentTabs(type, state) {
    browser.tabs.query({ url: ["<all_urls>"] }, (tabs) => {
        tabs.forEach(tab => {
            if (!/soundcloud\.com/.test(tab.url)) {
                browser.tabs.sendMessage(tab.id, { type, state });
            }
        });
    });
}

let playpauseState = "paused";
let repeatState = "off";
let shuffleState = "inactive";

console.log("Background script loaded");
// Update when you get any button messages
browser.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
    console.log("Background.js: received message:", msg);
    // handles "get-soundcloud-tabs" from [popup.js] and returns the table of all sc tabs open
    if (msg.type === "get-soundcloud-tabs") {
        const tabs = Array.from(soundcloudTabs.entries()).map(([tabId, info]) => ({
            tabId, 
            title: info.title,
            url: info.url,
            isActive: tabId === activeSoundCloudTabId
        }));
        return Promise.resolve({ tabs });
    }
    // handles "set-active-soundcloud-tab" from [popup.js] and updates "activeSoundCloudTabId"
    else if (msg.type === "set-active-soundcloud-tab") {
        activeSoundCloudTabId = msg.tabId;
        sendResponse({ success: true });
        return true;
    }

    /// ==== Handles "___-state-get-request" from [content.js] and sends back the "___-state"
    else if (msg.type === "playpause-state-get-request") {
        sendResponse({ state: playpauseState });
        return true;
    }
    else if (msg.type === "shuffle-state-get-request") {
        sendResponse({ state: shuffleState });
        return true;
    }
    else if (msg.type === "repeat-state-get-request") {
        sendResponse({ state: repeatState });
        return true;
    }

    /// ==== Handles "___-toggle-request" from [content.js] and sends "___-toggle-command" to [sc.js] ====
    /// does not update the "___-state" until confirmation from [sc.js]
    else if (msg.type === "playpause-toggle-request") {
        console.log("playpause toggle request received");
        ensureSoundCloudTabId(tabId => {
            console.log("playpause toggle command send initiated");
            if (tabId === null) {
                console.log("No SoundCloud tab found");
                return;
            }
            browser.tabs.sendMessage(tabId, { type: "playpause-toggle-command" })
                .then(() => console.log("Playpause toggled"))
                .catch(err => console.error("Failed to send playpause:", err));
        });
        return true;
    }
    else if (msg.type === "shuffle-toggle-request") {
        ensureSoundCloudTabId(tabId => {
            if (tabId === null) {
                console.log("No SoundCloud tab found");
                return;
            }
            browser.tabs.sendMessage(tabId, { type: "shuffle-toggle-command" })
                .then(() => console.log("Playpause toggled"))
                .catch(err => console.error("Failed to send playpause:", err));
        });
        return true;
    }
    else if (msg.type === "repeat-toggle-request") {
        ensureSoundCloudTabId(tabId => {
            if (tabId === null) {
                console.log("No SoundCloud tab found");
                return;
            }
            browser.tabs.sendMessage(tabId, { type: "repeat-toggle-command", state: msg.state })
                .then(() => console.log("Playpause toggled"))
                .catch(err => console.error("Failed to send playpause:", err));
        })
        return true;
    }

    /// ==== Confirmation handler from [sc.js], receives "__-state-updated" and broadcasts confirmation ====
    /// ==== "___-state-changed" to all non-sc tab [content.js]
    else if (msg.type === "playpause-state-updated") {
        playpauseState = msg.state;
        broadcastStateToContentTabs("playpause-state-changed", playpauseState);
        return true;
    }
    else if (msg.type === "shuffle-state-updated") {
        shuffleState = msg.state;
        broadcastStateToContentTabs("shuffle-state-changed", shuffleState);
        return true;
    }
    else if (msg.type === "repeat-state-updated") {
        repeatState = msg.state;
        broadcastStateToContentTabs("repeat-state-changed", repeatState);
        return true;
    }
    
    // messages regarding skip previous and next buttons
    else if (msg.type === "skip_prev") {
        ensureSoundCloudTabId(tabId => {
            if (tabId !== null) {
                browser.tabs.sendMessage(tabId, { type: "skip_prev" });
            } else {
                console.log("No SoundCloud tabs found.");
            }
        })
        return true;
    }
    else if (msg.type === "skip_next") {
        ensureSoundCloudTabId(tabId => {
            if (tabId !== null) {
                browser.tabs.sendMessage(tabId, { type: "skip_next" });
            } else {
                console.log("No SoundCloud tabs found.");
            }
        })
        return true;
    }
});