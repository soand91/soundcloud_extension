/// ======== Constants and State ========
let soundcloudTabs = new Map();
let activeSoundCloudTabId = null;
let playpauseState = "paused";
let repeatState = "off";
let shuffleState = "inactive";
let displayState = 'duration';
let likeState = 'unliked';
let followState = 'unfollowed';
const DEFAULT_SETTINGS = {
    'start-open-toggle': false,
    'active-tab-toggle': false,
    'theme-default-toggle': false
}
const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS);

const DEBUG = true;
function bgLog(...args) {
    if (DEBUG) console.log("[Background]", ...args);
}
function bgWarn(...args) {
    if (DEBUG) console.warn("[Background]", ...args);
}
function bgError(...args) {
    if (DEBUG) console.error("[Background]", ...args);
}

/// ======== Runtime Lifecycle Events ========
// Load Settings and restore Active Tab on Startup
browser.runtime.onStartup.addListener(async () => {
    const settings = await getMergedSettings();
    applySettingsToAllTabs(settings);
    await restoreActiveSoundCloudTab();
    await initializeSoundCloudTabs();
    bgLog("[Startup] Settings applied and tab state restored");
})
// Load and merge Settings when extension freshly Updated or Reloaded
browser.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
    if (reason === "install") {
        await initializeDefaultSettings();
        bgLog("[Install] Default settings initialized");
    } else if (reason === "update") {
        await migrateSettingsIfNeeded(previousVersion);
        bgLog("[Update] Migrated settings from version ${previousVersion}");
    }
    const settings = await getMergedSettings();
    applySettingsToAllTabs(settings);
    await restoreActiveSoundCloudTab();
    await initializeSoundCloudTabs();
})
// Central message router of [background.js]
browser.runtime.onMessage.addListener(handleRuntimeMessage);


/// ======== Tab Lifecycle Events ========
// on Tab Updates: add/remove/update as necessary, update active as needed
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    handleTabNavigation(tabId, changeInfo, tab);
});
// on Tab Activation: 
browser.tabs.onActivated.addListener(({ tabId }) => {
    handleTabActivation(tabId);
});
// on Tab Removal: clean up map and active
browser.tabs.onRemoved.addListener((tabId) => {
    handleTabRemoval(tabId);
})


/// ======== Storage Events ========
// Update settings when popup changes settings
browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, { oldValue, newValue }] of Object.entries(changes)) {
        if (SETTINGS_KEYS.includes(key)) {
            applySettingsToAllTabs();
            bgLog(`[Settings Change] ${key}:`, oldValue, "→", newValue);
        }
    }
})


/// ======== Helper Functions ========
// Helper that sets up the extension's default Settings when installed
async function initializeDefaultSettings() {
    await browser.storage.local.set(DEFAULT_SETTINGS);
    bgLog("[Init] Default settings written to storage:", DEFAULT_SETTINGS);
}
// Helper that applies changes to storage structure/keys if version is updated
async function migrateSettingsIfNeeded(previousVersion) {
    // Optional: Compare old version to new and migrate storage format if needed
    const current = await browser.storage.local.get(SETTINGS_KEYS);
    const migrated = { ...DEFAULT_SETTINGS, ...current };
    await browser.storage.local.set(migrated);
    bgLog(`[Migration] Migrated settings from version ${previousVersion} to merge settings:`, migrated)
}
// Helper that ensures Settings object is populated and usable
async function getMergedSettings() {
    const stored = await browser.storage.local.get(SETTINGS_KEYS);
    const merged = { ...DEFAULT_SETTINGS, ...stored };
    bgLog("[Settings] Retreived and merged settings:", merged);
    return merged;
}
// Helper that applies all Settings to all tabs
async function applySettingsToAllTabs(settings) {
    browser.tabs.query({}).then(tabs => {
        let sentCount = 0;
        for (const tab of tabs) {
            browser.tabs.sendMessage(tab.id, {
                type: "settings-updated",
                settings
            }).then(() => {
                sentCount++;
                bgLog(`[Settings] Applied to tab ${tab.id}:`, settings);
            }).catch(() => {
                bgWarn(`[Settings] Skipped tab ${tab.id} - content script not available`);
            });
        }
        bgLog(`[Settings] Broadcast attemp to ${tabs.length} tabs`)
    })
}
// Helper that Restores previously selected Active SoundCloud tab on Startup
async function restoreActiveSoundCloudTab() {
    const { activeSoundCloudTabId } = await browser.storage.local.get("activeSoundCloudTabId");
    if (!activeSoundCloudTabId) {
        bgWarn("[Restore] No active tab stored");
        return;
    }
    try {
        const tab = await browser.tabs.get(activeSoundCloudTabId);
        if (tab.url && tab.url.includes("soundcloud.com")) {
            setActiveSoundCloudTab(tab.id);
            bgLog("[Restore] Restored valid active SC tab from storage:", tab.id, tab.url);
        } else {
            bgWarn("[Restore] Tab is no longer a valid SoundCLoud page:", tab.id, tab.url);
        }
    } catch (err) {
        bgWarn("[Restore] Stored active tab ID is invalid or closed:", activeSoundCloudTabId);
    }
}
// Helper that sets and persists a new Active SoundCloud tab to memory
async function setActiveSoundCloudTab(tabId) {
    activeSoundCloudTabId = tabId;
    try {
        await browser.storage.local.set({ activeSoundCloudTabId: tabId });
        bgLog("[ActiveTab] Updated and persisted active tab ID:", tabId);
    } catch (err) {
        bgWarn("[ActiveTab] Failed to persist active tab ID:", err);
    }
    updateAllStatesForActiveTab();
}
// Helper that updates all states on active tab switch
function updateAllStatesForActiveTab() {
    if (!activeSoundCloudTabId) {
        bgWarn("[StateSync] No active SoundCloud tab to sync with");
        return;
    }
    browser.tabs.sendMessage(activeSoundCloudTabId, { type: "get-all-states" })
        .then(states => {
            if (!states) {
                bgWarn("[StateSync] Empty state response from active tab:", activeSoundCloudTabId);
                return;
            }
            broadcastStateToContentTabs("all-states-updated", states);
            bgLog("[StateSync] Got states from active tab:", states);
        })
        .catch(err => {
            bgWarn("[StateSync] Failed to get states from active tab:", err);
        });
}
// Helper that broadcasts 
async function broadcastStateToContentTabs(type, state) {
    try {
        const tabs = await browser.tabs.query({
            url: ["http://*/*", "https://*/*"]
        });
        const tasks = tabs
            .filter(tab => tab.url && !/soundcloud\.com/.test(tab.url))
            .map(tab =>
                browser.tabs.sendMessage(tab.id, { type, state })
                    .then(() => bgLog(`[Broadcast] Sent '${type}' to tab ${tab.id}`))
                    .catch(err => bgWarn(`[Broadcast] Failed to send '${type}' to tab ${tab.id}:`, err))
            );

        await Promise.all(tasks);
        bgLog(`[Broadcast] Completed '${type}' to ${tasks.length} tab(s)`);
    } catch (err) {
        bgWarn("[Broadcast] Failed to query tabs:", err);
    }
}
// Helper that detects SC tabs, injects script, and tracks state
async function handleTabNavigation(tabId, changeInfo, tab) {
    if (!tab.url) return;
    if (tab.url.includes("soundcloud.com")) {
        soundcloudTabs.set(tabId, { title: tab.title, url: tab.url });
        // Trigger only if it's a new navigation or fully loaded
        if (changeInfo.status === "complete" || changeInfo.url) {
            if (activeSoundCloudTabId !== tabId) {
                setActiveSoundCloudTab(tabId);
            }
            injectControlsIntoTab(tabId);
            bgLog("[TabUpdate] SC tab tracked and possibly made active:", tabId, tab.url);
        }
    } else {
        // Navigated away from SoundCloud
        if (soundcloudTabs.has(tabId)) {
            soundcloudTabs.delete(tabId);
            bgLog("[TabUpdate] Tab navigated away from SC, removed:", tabId);
            
            if (tabId === activeSoundCloudTabId) {
                const fallbackId = [...soundcloudTabs.keys()][0] || null;
                if (fallbackId) {
                    setActiveSoundCloudTab(fallbackId);
                    bgLog("[TabUpdate] Active tab closed, switched to fallback:", fallbackId);
                } else {
                    activeSoundCloudTabId = null;
                    browser.storage.local.remove("activeSoundCloudTabId");
                    bgLog("[TabUpdate] No SC tabs remain; active ID cleared");
                }
            }
        }
    }
}
// Helper that updates active tab if needed 
async function handleTabActivation(tabId) {
    try {
        const tab = await browser.tabs.get(tabId);
        if (tab.url && tab.url.includes("soundcloud.com") && tabId !== activeSoundCloudTabId) {
            setActiveSoundCloudTab(tabId);
            bgLog("[TabFocus] User switched to SC tab:", tabId);
        }
    } catch (e) {
        bgWarn("[TabFocus] Failed to access activated tab:", tabId, e);
    }
}
// Helper that removes tab from map, and reassigns active tab 
async function handleTabRemoval(tabId) {
    if (soundcloudTabs.delete(tabId)) {
        bgLog("[TabClose] Removed SC tab from map:", tabId);
    }
    if (tabId === activeSoundCloudTabId) {
        const fallbackId = [...soundcloudTabs.keys()][0] || null;
        if (fallbackId) {
            setActiveSoundCloudTab(fallbackId);
            bgLog("[TabClose] Active tab closed, switched to fallback:", fallbackId);
        } else {
            activeSoundCloudTabId = null;
            browser.storage.local.remove("activeSoundCloudTabId");
            bgLog("[TabClose] No SC tabs remain; active ID cleared");
        }
    }
}
// Helper that injects [soundcloud-controls.js] script into each SC tab
function injectControlsIntoTab(tabId) {
    browser.scripting.executeScript({
        target: { tabId },
        files: ["content/soundcloud-controls.js"]
    }).then(() => {
        bgLog("[Inject] Controls injected into tab:", tabId);
    }).catch(err => {
        bgWarn("[Inject] Failed to inject into tab:", tabId, err);
    });
}
// Helper that detects all already-open SoundCloud tabs 
async function initializeSoundCloudTabs() {
    const tabs = await browser.tabs.query({ url: "*://soundcloud.com/*" });
    for (const tab of tabs) {
        soundcloudTabs.set(tab.id, { title: tab.title, url: tab.url });
        injectControlsIntoTab(tab.id);
        bgLog("[Init] Injected and tracked SC tab:", tab.id, tab.url);
    }
    if (tabs.length > 0 && !activeSoundCloudTabId) {
        await setActiveSoundCloudTab(tabs[tabs.length - 1].id);
    }
}
// Helper that finds and sets SoundCloud tab ID if not known
async function ensureSoundCloudTabId(callback) {
    bgLog("[TabCheck] Starting ensureSoundCloudTabID");
    try {
        if (activeSoundCloudTabId !== null) {
            bgLog("[TabCheck] Checking existing active tab ID:", activeSoundCloudTabId);
            try {
                const tab = await browser.tabs.get(activeSoundCloudTabId);
                if (tab.url && tab.url.includes('soundcloud.com')) {
                    bgLog("[TabCheck] Existing tab is valid:", tab.id, tab.url);
                    callback(activeSoundCloudTabId);
                    updateAllStatesForActiveTab();
                    return;
                }
            } catch (e) {
                bgWarn("[TabCheck] Existing tab lookup failed:", e);
                activeSoundCloudTabId = null;
            }
        }
        bgLog("[TabCheck] Scanning tracked SoundCloud tabs...");
        for (let [tabId, _] of soundcloudTabs) {
            try {
                const tab = await browser.tabs.get(tabId);
                if (tab.url && tab.url.includes('soundcloud.com')) {
                    activeSoundCloudTabId = tabId;
                    bgLog("[TabCheck] Found new active tab:", tabId);
                    updateAllStatesForActiveTab();
                    callback(tabId);
                    return;
                }
            } catch (e) {
                bgWarn("[TabCheck] Failed to retrieve or validate tab:", tabId, e);
                soundcloudTabs.delete(tabId);
            }
        }
        bgWarn("[TabCheck] No valid SoundCloud tab found");
        callback(null);
    } catch (e) {
        bgWarn("[TabCheck] Critical error in ensureSoundCloudTabId:", e);
        callback(null);
    }
}

// Central message handler 
async function handleRuntimeMessage(msg, sender) {
    switch (msg.type) {
        case "get-soundcloud-tabs": 
            if (!soundcloudTabs || !(soundcloudTabs instanceof Map)) {
                bgWarn("[Background] soundcloudTabs is undefined or invalid");
                return ({ tabs: [], error: "No soundcloudTabs map available." });
            }
            const activeId = activeSoundCloudTabId ?? null;

            const tabs = Array.from(soundcloudTabs.entries()).map(([tabId, info]) => {
                const tabObj = {
                    tabId, 
                    title: info?.title || "(Untitled)",
                    url: info?.url || "(No URL)",
                    isActive: tabId === activeId,
                };
                bgLog(`[Background] Tab ID: ${tabId}`, tabObj);
                return { tabs };
            });
            bgLog(`[Background] Returning ${tabs.length} SoundCloud tab(s). Active ID: ${activeId}`);
            return { tabs };        
        case "set-active-soundcloud-tabs":
            await setActiveSoundCloudTab(msg.tabId);
            return { success: true };
        case "playpause-state-get-request":
            return { state: playpauseState };
        case "shuffle-state-get-request":
            return { state: shuffleState };
        case "repeat-state-get-request":
            return { state: repeatState };
        case "playpause-toggle-request":
            bgLog("playpause toggle request received");
            ensureSoundCloudTabId(tabId => {
                bgLog("playpause toggle command send initiated");
                if (tabId === null) {
                    bgLog("[Playpause request] No SoundCloud tab found");
                    return;
                }
                browser.tabs.sendMessage(tabId, { type: "playpause-toggle-command" })
                    .then(() => bgLog("[Playpause request] Playpause command sent"))
                    .catch(err => bgError("[Playpause request] Failed to send playpause:", err));
            });
            return true;
        case "shuffle-toggle-request":
            ensureSoundCloudTabId(tabId => {
                if (tabId === null) {
                    bgLog("[Shuffle request] No SoundCloud tab found");
                    return;
                }
                browser.tabs.sendMessage(tabId, { type: "shuffle-toggle-command" })
                    .then(() => bgLog("[Shuffle request] Shuffle command sent"))
                    .catch(err => bgError("[Shuffle request] Failed to send playpause:", err));
            });
            return true;
        case "repeat-toggle-request":
            ensureSoundCloudTabId(tabId => {
                if (tabId === null) {
                    bgLog("[Repeat request] No SoundCloud tab found");
                    sendResponse({ success: false });
                    return;
                }
                browser.tabs.sendMessage(tabId, { type: "repeat-toggle-command", state: msg.state })
                    .then(() => {
                        bgLog("[Repeat request] Repeat command sent");
                        sendResponse({ success: true });
                    })
                    .catch(err => {
                        bgError("[Repeat request] Failed to send playpause:", err);
                        sendResponse({ success: false });
                    });
            })
            return true;
        case "skip-prev-request":
            ensureSoundCloudTabId(tabId => {
                if (tabId === null) {
                    bgLog("[Skip Prev request] No SoundCloud tab found");
                    return;
                }
                browser.tabs.sendMessage(tabId, { type: "skip-prev-command" })
                    .then(() => bgLog("[Skip Prev request] Skip-prev command sent"))
                    .catch(err => bgError("[Skip Prev request] Failed to send skip-prev", err));
            });
            return true;
        case "skip-next-request":
            ensureSoundCloudTabId(tabId => {
                if (tabId === null) {
                    bgLog("[Skip Next request] No SoundCloud tab found");
                    return;
                }
                browser.tabs.sendMessage(tabId, { type: "skip-next-command" })
                    .then(() => bgLog("[Skip Next request] Skip-next command sent"))
                    .catch(err => bgError("[Skip Next request] Failed to send skip-next", err));
            });
            return true;
        case "timeBtn-click-request":
            ensureSoundCloudTabId(tabId => {
                if (tabId === null) {
                    bgLog("[Time Button request] No SoundCloud tab found");
                    return;
                }
                browser.tabs.sendMessage(tabId, { type: "time-btn-command" })
                    .then(() => bgLog("[Time Button request] Time-btn command sent"))
                    .catch(err => bgError("[Time Button request] Failed to send time-btn", err));
            });
            return true;            
        case "avatar-click-request":
            ensureSoundCloudTabId(tabId => {
                if (tabId === null) {
                    bgLog("[Avatar Click request] No SoundCloud tab found");
                    return;
                }
                browser.tabs.sendMessage(tabId, { type: "avatar-click-command" })
                    .then(() => bgLog("[Avatar Click request] Avatar click command sent"))
                    .catch(err => bgError("[Avatar Click request] Failed to send avatar click", err));
            })
            return true;
        case "artist-click-request":
            ensureSoundCloudTabId(tabId => {
                if (tabId === null) {
                    bgLog("[Artist Click request] No SoundCloud tab found");
                    return;
                }
                browser.tabs.sendMessage(tabId, { type: "artist-click-command" })
                    .then(() => bgLog("[Artist Click request] Artist click command sent"))
                    .catch(err => bgError("[Artist Click request] Failed to send artist click", err));
            })
            return true;    
        case "title-click-request":
            ensureSoundCloudTabId(tabId => {
                if (tabId === null) {
                    bgLog("[Title Click request] No SoundCloud tab found");
                    return;
                }
                browser.tabs.sendMessage(tabId, { type: "title-click-command" })
                    .then(() => bgLog("[Title Click request] Title click command sent"))
                    .catch(err => bgError("[Title Click request] Failed to send title click", err));
            })
            return true;              
        case "like-request":
            ensureSoundCloudTabId(tabId => {
                if (tabId === null) {
                    bgLog("[Like Click request] No SoundCloud tab found");
                    return;
                }
                browser.tabs.sendMessage(tabId, { type: "like-click-command" })
                    .then(() => bgLog("[Like Click request] Like click command sent"))
                    .catch(err => bgError("[Like Click request] Failed to send like click", err));
            })
            return true;
        case "follow-request":
            ensureSoundCloudTabId(tabId => {
                if (tabId === null) {
                    bgLog("[Follow Click request] No SoundCloud tab found");
                    return;
                }
                browser.tabs.sendMessage(tabId, { type: "follow-click-command" })
                    .then(() => bgLog("[Follow Click request] Follow click command sent"))
                    .catch(err => bgError("[Follow Click request] Failed to send follow click", err));
            })
            return true;
        case "queue-request":
            ensureSoundCloudTabId(tabId => {
                if (tabId === null) {
                    bgLog("[Queue Click request] No SoundCloud tab found");
                    return;
                }
                browser.tabs.sendMessage(tabId, { type: "queue-click-command" })
                    .then(() => bgLog("[Queue Click request] Queue click command sent"))
                    .catch(err => bgError("[Queue Click request] Failed to send queue click", err));
            })
            return true;                        
        case "playpause-state-updated":
            playpauseState = msg.state;
            broadcastStateToContentTabs("playpause-state-changed", playpauseState);
            return true;
        case "shuffle-state-updated":
            shuffleState = msg.state;
            broadcastStateToContentTabs("shuffle-state-changed", shuffleState);
            return true;
        case "repeat-state-updated":
            repeatState = msg.state;
            broadcastStateToContentTabs("repeat-state-changed", repeatState);
            return true;

        case "time-display-state-updated":
            displayState = msg.state;
            broadcastStateToContentTabs("time-display-changed", displayState);
            return true;
        case "like-state-updated":
            likeState = msg.state;
            broadcastStateToContentTabs("like-state-changed", likeState);
            return true;
        case "follow-state-updated":
            followState = msg.state;
            broadcastStateToContentTabs("follow-state-changed", followState);
            return true;


        case "get-settings":
            const settings = await browser.storage.local.get(SETTINGS_KEYS);
            bgLog("[Background] Responding to get-settings with:", settings);
            return settings;
        case "get-all-states":
            bgLog("[Background] Responding to get-all-states with:", {
                playpause: playpauseState,
                shuffle: shuffleState,
                repeat: repeatState,
                time: displayState,
                like: likeState,
                follow: followState
            });
            return {
                playpause: playpauseState,
                shuffle: shuffleState,
                repeat: repeatState,
                time: displayState,
                like: likeState,
                follow: followState
            };

        default:
            bgWarn("Unknown message type:", msg.type)
    }
}
