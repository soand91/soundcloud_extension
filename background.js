let soundcloudTabs = new Map();
// Update when tabs are opened/closed
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.url?.includes('soundcloud.com')) {
        if (changeInfo.status === 'complete') {
            soundcloudTabs.set(tabId, { title: tab.title, url: tab.url });
        }
    }
});
browser.tabs.onRemoved.addListener((tabId) => {
    soundcloudTabs.delete(tabId);
});

let activeSoundCloudTabId = null;
let playbackState = "paused";
// Update when you get any button messages
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // messages regarding the active SoundCloud tab via popup
    if (message.type === "set-active-soundcloud-tab") {
        activeSoundCloudTabId = message.tabId;
        sendResponse({ success: true });
    }
    // messages regarding play/pause button
    else if (message.type === "playpause") {
        if (activeSoundCloudTabId !== null) {
            browser.tabs.sendMessage(activeSoundCloudTabId, { type: "playpause" });
        } else {
            // Find all SoundCloud tabs
            browser.tabs.query({ url: "*://soundcloud.com/*" }, (tabs) => {
                if (tabs.length > 0) {
                    // Fow now: just target the first one (or pick a "main" later)
                    browser.tabs.sendMessage(tabs[0].id, { type: "playpause" })
                } else {
                    console.log("No SoundCloud tabs found.");
                }   
            });
        }
        // Toggle state
        playbackState = playbackState === "playing" ? "paused" : "playing";
        // Communicate new state to all non-SoundCloud tabs
        browser.tabs.query({ url: ["<all_urls>"] }, (tabs) => {
            tabs.forEach(tab => {
                // Be sure not to broadcast to SoundCloud tabs
                if (!/soundcloud\.com/.test(tab.url)) {
                    browser.tabs.sendMessage(tab.id, {
                        type: "update-ui-state",
                        state: playbackState
                    });
                }
            });
        });
    }
    // messages regarding skip previous button
    else if (message.type === "skip_prev") {
        if (activeSoundCloudTabId !== null) {
            browser.tabs.sendMessage(activeSoundCloudTabId, { type: "skip_prev" });
        } else {
            // Find all SoundCloud tabs
            browser.tabs.query({ url: "*://soundcloud.com/*" }, (tabs) => {
                if (tabs.length > 0) {
                    // Fow now: just target the first one (or pick a "main" later)
                    browser.tabs.sendMessage(tabs[0].id, { type: "skip_prev" })
                } else {
                    console.log("No SoundCloud tabs found.");
                }   
            });
        }
    }    
    // messages regarding skip next button
    else if (message.type === "skip_next") {
        if (activeSoundCloudTabId !== null) {
            browser.tabs.sendMessage(activeSoundCloudTabId, { type: "skip_next" });
        } else {
            // Find all SoundCloud tabs
            browser.tabs.query({ url: "*://soundcloud.com/*" }, (tabs) => {
                if (tabs.length > 0) {
                    // Fow now: just target the first one (or pick a "main" later)
                    browser.tabs.sendMessage(tabs[0].id, { type: "skip_next" })
                } else {
                    console.log("No SoundCloud tabs found.");
                }   
            });
        }   
    }
    // messages regarding the playback state update
    if (message.type === "playback-state-update") {
        playbackState = message.state;
        // Communicate new state to all non-SoundCloud tabs
        browser.tabs.query({ url: ["<all_urls>"] }, (tabs) => {
            tabs.forEach(tab => {
                if (!/soundcloud\.com/.test(tab.url)) {
                    browser.tabs.sendMessage(tab.id, {
                        type: "update-ui-state",
                        state: playbackState
                    });
                }
            });
        });
    }
});