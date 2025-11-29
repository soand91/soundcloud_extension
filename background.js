/// ======== Constants and State ========
let soundcloudTabs = new Map();
let activeSoundCloudTabId = null;
let tabStates = {};
let pendingUpdateCache = {};
let persistTimer = null;
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
// Helper that detects all already-open SoundCloud tabs 
async function initializeSoundCloudTabs() {
    try {
        const tabs = await browser.tabs.query({ url: "*://soundcloud.com/*" });
        for (const tab of tabs) {
            const tabId = tab.id;
            ensureTabState(tabId);
            updateTabState(tabId, {
                isSoundCloud: true,
                url: tab.url, 
                pageTitle: tab.title
            }, { force: true });
            injectControlsIntoTab(tabId);
        }
        bgLog(`[Init] Initialized ${tabs.length} SoundCloud tab(s)`);
    } catch (e) {
        bgWarn("[Init] Failed to scan for SoundCloud tabs:", e);
    }
}
// Helper that Restores previously stored activeSoundCloudTabId from persistent storage on Startup
async function restoreActiveSoundCloudTab() {
    const { activeSoundCloudTabId: savedId } = await browser.storage.local.get("activeSoundCloudTabId");
    if (savedId) {
        try {
            const tab = await browser.tabs.get(savedId);
            if (tab.url && tab.url.includes("soundcloud.com")) {
                await setActiveSoundCloudTab(savedId);
                updateAllStatesForActiveTab();
                bgLog("[Restore] Rehydrated active tab from saved ID:", savedId);
                return;
            }
        } catch (e) {
            bgWarn("[Restore] Failed to rehydrate tab:", savedId, e);
        }
    }
    bgLog("[Restore] No saved tab or valid fallback found");
}
// Helper that Restores previously stored tabStates object from persistent storage on Startup
async function restoreTabStatesFromStorage() { //TODO
    try {
        const result = await browser.storage.local.get("tabStates");
        if (result.tabStates && typeof result.tabStates === "object") {
            tabStates = result.tabStates;
            const count = Object.keys(tabStates).length;
            bgLog(`[Restore] Restored ${count} tabStates from storage`);
        } else {
            bgWarn("[Restore] tabStates is missing or malformed");
        }
    } catch (err) {
        bgWarn("[Restore] Failed to restore tabStates:", err);
    }
}
// Helper that injects [soundcloud-controls.js] script into each SC tab
//! might have to fix redundancy. manual injection vs. scripted injection (via manifest)
async function injectControlsIntoTab(tabId) {
    const tab = await browser.tabs.get(tabId);
    if (!tab.url || !tab.url.includes("soundcloud.com")) return; 
    
    // Prevent injection into login, settings, etc. 
    const blacklistPatterns = [
        "/signin", 
        "/you/settings",
        "/upload"
    ];
    
    if (blacklistPatterns.some(path => tab.url.includes(path))) {
        bgLog("[Inject] Skipped blacklisted URL:", tab.url);
        return;
    }

    browser.scripting.executeScript({
        target: { tabId },
        files: ["content/soundcloud-controls.js"]
    }).then(() => {
        bgLog("[Inject] Controls injected into tab:", tabId);
    }).catch(err => {
        bgWarn("[Inject] Failed to inject into tab:", tabId, err);
    });
}
// Helper that detects SC tabs, injects script, and tracks state
async function handleTabNavigation(tabId, changeInfo, tab) {
    if (!tab.url) return;

    const isSC = tab.url.includes("soundcloud.com");

    if (isSC) {
        ensureTabState(tabId);
        updateTabState(tabId, {
            isSoundCloud: true,
            url: tab.url,
            pageTitle: tab.title
        }, { force: true });
        if (changeInfo.status === "complete" || changeInfo.url) {
            if (activeSoundCloudTabId !== tabId) {
                setActiveSoundCloudTab(tabId);
            }
            injectControlsIntoTab(tabId);
            bgLog("[TabUpdate] SC tab tracked and possibly made active:", tabId, tab.url)
        }
    } else {
        removeTabAndReassignIfActive(tabId);
    }
}
// Helper that updates active tab if needed 
async function handleTabActivation(tabId) {
    try {
        const tab = await browser.tabs.get(tabId);
        if (tab.url && tab.url.includes("soundcloud.com") && tabId !== activeSoundCloudTabId) {
            for (const id of Object.keys(tabStates)) {
                tabStates[id].isActive = false;
            }
            ensureTabState(tabId);
            updateTabState(tabId, {
                isSoundCloud: true,
                url: tab.url,
                pageTitle: tab.title,
                isActive: true
            }, { force: true });
            setActiveSoundCloudTab(tabId);
            bgLog("[TabFocus] User switched to SC tab:", tabId);
        }
    } catch (e) {
        bgWarn("[TabFocus] Failed to access activated tab:", tabId, e);
    }
}
// Helper that removes tab from map, and reassigns active tab 
async function handleTabRemoval(tabId) {
    removeTabAndReassignIfActive(tabId)
}
// Helper that sets and persists a new Active SoundCloud tab to memory
async function setActiveSoundCloudTab(tabId) {
    activeSoundCloudTabId = tabId;
    // Ensure structure exists
    ensureTabState(tabId);
    // Clear isActive from all then set isActive to specific tab
    for (const id in tabStates) {
        tabStates[id].isActive = false;
    }
    tabStates[tabId].isActive = true;
    // Persist
    try {
        await browser.storage.local.set({ activeSoundCloudTabId: tabId });
        bgLog("[ActiveTab] Updated and persisted active tab ID:", tabId);
    } catch (err) {
        bgWarn("[ActiveTab] Failed to persist active tab ID:", err);
    }
    // Broadcast known state if present
    const knownState = tabStates[tabId];
    if (knownState) {
        broadcastStateToContentTabs("all-states-updated", knownState);
        bgLog("[ActiveTab] Broadcasted cached state for tab:", tabId);
    } else {
        bgWarn("[ActiveTab] No known state to broadcast for tab:", tabId);
    }

    // Refresh from live tab to avoid stale cache when switching sources
    fetchAndBroadcastTabState(tabId);
}
// Helper that finds and sets SoundCloud tab ID if not known
async function ensureSoundCloudTabId() {
    bgLog("[TabCheck] Starting ensureSoundCloudTabID");
    
    // 1. Try the current active
    if (activeSoundCloudTabId !== null) {
        try {
            const tab = await browser.tabs.get(activeSoundCloudTabId);
            if (tab.url && tab.url.includes("soundcloud.com")) {
                bgLog("[TabCheck] Existing active tab is valid:", tab.id, tab.url);
                return tab.id;
            } 
        } catch (e) {
            bgWarn("[TabCheck] Existing tab lookup failed:", e);
            activeSoundCloudTabId = null;
        }
    }
    // 2. Look for a fallback from tabStates
    const fallbackId = Object.keys(tabStates).find(id => {
        const state = tabStates[id];
        return state?.isSoundCloud;
    });
    if (fallbackId) {
        await setActiveSoundCloudTab(Number(fallbackId));
        bgLog("[TabCheck] Fallback SC tab promoted to active:", fallbackId);
        return Number(fallbackId);
    }
    // 3. No valid tab found
    bgWarn("[TabCheck] No valid SoundCloud tab found");
    return null;
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
                    .catch(err => {
                        // Ignore missing receivers (content script not injected on that tab)
                        if (err && err.message && err.message.includes("Receiving end does not exist")) {
                            return;
                        }
                        bgWarn(`[Broadcast] Failed to send '${type}' to tab ${tab.id}:`, err)
                    })
            );

        await Promise.all(tasks);
        bgLog(`[Broadcast] Completed '${type}' to ${tasks.length} tab(s)`);
    } catch (err) {
        bgWarn("[Broadcast] Failed to query tabs:", err);
    }
}
// Helper that persists tab states
function persistTabStates() { //TODO
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        browser.storage.local.set({ tabStates })
            .then(() => bgLog("[Persist] tabStates saved to storage"))
            .catch(err => bgWarn("[Persist] Failed to persist tabStates:", err));
    }, 500);
}
// Helper that initializes the state for a specific tab ID if it doesn't already exist in tabStates
function ensureTabState(tabId) {
    if (!tabStates[tabId]) {
        tabStates[tabId] = {
            // Lifecycle & presence trackers
            isSoundCloud: false,
            isActive: false,
            url: null,
            pageTitle: null,
            // Player controls
            playpause: "paused",
            repeat: "off",
            shuffle: "off", 
            display: "duration",
            like: "unliked",
            follow: "unfollowed",
            volume: 1,
            muted: false,
            songTitle: null, 
            songArtist: null,
            // Timeline tracking
            secondsElapsed: null, 
            duration: null,

            lastUpdated: Date.now()
        };
    }
}
// Helper that clears and reassigns active SoundCloud tab
function removeTabAndReassignIfActive(tabId) {
    const wasActive = tabId === activeSoundCloudTabId;
    const wasSoundCloud = tabStates[tabId]?.isSoundCloud;

    if (wasSoundCloud) {
        delete tabStates[tabId];
        bgLog("[TabCleanup] Removed SC tab from tabStates:", tabId);
    }

    if (wasActive) {
        const fallbackId = Object.keys(tabStates).find(id => tabStates[id]?.isSoundCloud);
        if (fallbackId) {
            setActiveSoundCloudTab(Number(fallbackId));
            bgLog("[TabCleanup] Active tab reassigned to fallback:", fallbackId);
        } else {
            activeSoundCloudTabId = null;
            browser.storage.local.remove("activeSoundCloudTabId");
            bgLog("[TabCleanup] No SC tabs remain; active ID cleared");
        }
    }
}
// Helper that sends full cached state from tabStates 
function updateAllStatesForActiveTab() {
    if (!activeSoundCloudTabId || !tabStates[activeSoundCloudTabId]) {
        bgWarn("[StateSync] No active tab or state to update from.");
        return;
    }
    const state = tabStates[activeSoundCloudTabId];
    broadcastStateToContentTabs("all-states-updated", state);
    bgLog("[StateSync] Broadcasted all-states-updated from active tab:", activeSoundCloudTabId);
}


/// ======== Runtime Lifecycle Events ========
// Load Settings and restore Active Tab on Startup
browser.runtime.onStartup.addListener(async () => {
    const settings = await getMergedSettings();
    applySettingsToAllTabs(settings);
    await restoreActiveSoundCloudTab();
    await initializeSoundCloudTabs(); //TODO
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
    await initializeSoundCloudTabs(); //TODO
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


/// ======== Runtime Message Handler ========
// State update senders
const defaultBroadcastIfActive = (tabId) => {
    if (tabId === activeSoundCloudTabId) {
        broadcastStateToContentTabs("all-states-updated", tabStates[tabId]);
    }
};
const fieldMap = {
    // Standard button/toggler states
    "playpause-state-updated":  { field: "playpause", afterUpdate: defaultBroadcastIfActive },
    "repeat-state-updated":     { field: "repeat", afterUpdate: defaultBroadcastIfActive },
    "shuffle-state-updated":    { field: "shuffle", afterUpdate: defaultBroadcastIfActive },
    "like-state-updated":       { field: "like", afterUpdate: defaultBroadcastIfActive },
    "follow-state-updated":     { field: "follow", afterUpdate: defaultBroadcastIfActive },
    "avatar-state-updated":   { field: "avatar", afterUpdate: defaultBroadcastIfActive },
    "display-state-updated":    { field: "display", afterUpdate: defaultBroadcastIfActive },
    // Timeline metadata 
    "songTitle-state-updated":  { field: "songTitle", afterUpdate: defaultBroadcastIfActive },
    "songArtist-state-updated": { field: "songArtist", afterUpdate: defaultBroadcastIfActive },
    "duration-state-updated":   { field: "duration", afterUpdate: defaultBroadcastIfActive },
    // Timeline live ticker fields
    "secondsElapsed-state-updated": { field: "secondsElapsed", afterUpdate: defaultBroadcastIfActive },
    "timeline-seek-state-updated": { field: "secondsElapsed", afterUpdate: defaultBroadcastIfActive },
};
// Central message handler 
async function handleRuntimeMessage(msg, sender, sendResponse) {
    if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return;

    const tabId = sender?.tab?.id || msg.tabId;
    if (!tabId) return;

    // 1. For the state-updated messages
    const fieldEntry = fieldMap[msg.type];
    if (fieldEntry) {
        bgLog("message received:", {
            type: msg.type,
            state: msg.state,
            tabId: tabId
        });
        const { field, afterUpdate } = fieldEntry;
        const changed = updateTabState(tabId, { [field]: msg.state });
        if (changed) {
            if (afterUpdate) afterUpdate(tabId, msg.state);
        }
        return true; 
    }
    // 2. For all others
    switch (msg.type) {
        case "volume-state-updated": {
            const volState = msg.state || {};
            const percentVal = (typeof volState.percent === "number")
                ? volState.percent
                : (typeof volState.volume === "number" ? volState.volume : null);
            const partial = {
                volume: percentVal,
                muted: !!volState.muted
            };
            const changed = updateTabState(tabId, partial);
            if (changed && tabId === activeSoundCloudTabId) {
                const outbound = {
                    percent: tabStates[tabId].volume ?? 0,
                    muted: !!tabStates[tabId].muted
                };
                broadcastStateToContentTabs("volume-state-updated", outbound);
            }
            return true;
        }
        case "get-settings":
            const settings = await browser.storage.local.get(SETTINGS_KEYS);
            bgLog("[Settings] Responding to get-settings with:", settings);
            return settings;
        case "get-all-states-active": // For toolbar //TODO
            const state = tabStates[activeSoundCloudTabId] || null;
            bgLog(`[State] get-all-states-active | tab ${activeSoundCloudTabId}:`, state);
            return state;
        case "get-tab-states-summary": // For popup //TODO
            return Object.entries(tabStates).map(([tabId, state]) => ({
                tabId, 
                songTitle: state.songTitle,
                playpause: state.playpause
            }));
        case "get-all-states": // For unified states
            bgLog("[State] Responding to get-all-states with:", tabStates)
            return tabStates;
        case "get-soundcloud-tabs": //TODO
            if (!soundcloudTabs || !(soundcloudTabs instanceof Map)) {
                bgWarn("[Background] soundcloudTabs is undefined or invalid");
                return ({ tabs: [], error: "No soundcloudTabs map available." });
            }
            const activeId = activeSoundCloudTabId ?? null;

            const tabs = Array.from(soundcloudTabs.entries()).map(([tabId, info]) => {
                const tabObj = {
                    tabId, 
                    pageTitle: info?.pageTitle || "(Untitled)",
                    url: info?.url || "(No URL)",
                    isActive: tabId === activeId,
                };
                bgLog(`[Background] Tab ID: ${tabId}`, tabObj);
                return { tabs };
            });
            bgLog(`[Background] Returning ${tabs.length} SoundCloud tab(s). Active ID: ${activeId}`);
            return { tabs };        
        case "set-active-soundcloud-tabs": //TODO
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
            ensureSoundCloudTabId().then(tabId => {
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
            ensureSoundCloudTabId().then(tabId => {
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
            ensureSoundCloudTabId().then(tabId => {
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
            ensureSoundCloudTabId().then(tabId => {
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
            ensureSoundCloudTabId().then(tabId => {
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
            ensureSoundCloudTabId().then(tabId => {
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
            ensureSoundCloudTabId().then(tabId => {
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
            ensureSoundCloudTabId().then(tabId => {
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
            ensureSoundCloudTabId().then(tabId => {
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
            ensureSoundCloudTabId().then(tabId => {
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
            ensureSoundCloudTabId().then(tabId => {
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
            ensureSoundCloudTabId().then(tabId => {
                if (tabId === null) {
                    bgLog("[Queue Click request] No SoundCloud tab found");
                    return;
                }
                browser.tabs.sendMessage(tabId, { type: "queue-click-command" })
                    .then(() => bgLog("[Queue Click request] Queue click command sent"))
                    .catch(err => bgError("[Queue Click request] Failed to send queue click", err));
            })
            return true;   
        case "volume-set-request":
            ensureSoundCloudTabId().then(tabId => {
                if (tabId === null) {
                    bgLog("[Volume request] No SoundCloud tab found");
                    return;
                }
                browser.tabs.sendMessage(tabId, { type: "volume-set-command", percent: msg.percent, muted: msg.muted })
                    .then(() => bgLog("[Volume request] Volume set command sent"))
                    .catch(err => bgError("[Volume request] Failed to send volume set", err));
            });
            return true;
        case "volume-mute-toggle-request":
            ensureSoundCloudTabId().then(tabId => {
                if (tabId === null) {
                    bgLog("[Volume toggle request] No SoundCloud tab found");
                    return;
                }
                browser.tabs.sendMessage(tabId, { type: "volume-mute-toggle-command" })
                    .then(() => bgLog("[Volume toggle request] Volume toggle command sent"))
                    .catch(err => bgError("[Volume toggle request] Failed to send volume toggle", err));
            });
            return true;
        case "timeline-seek-request":
            ensureSoundCloudTabId().then(tabId => {
                if (tabId === null) {
                    bgLog("[Timeline seek request] No SoundCloud tab found");
                    return;
                }
                browser.tabs.sendMessage(tabId, { type: "timeline-seek-command", seconds: msg.seconds, percent: msg.percent })
                    .then(() => bgLog("[Timeline seek request] Seek command sent"))
                    .catch(err => bgError("[Timeline seek request] Failed to send seek", err));
            });
            return true;

        default:
            bgWarn("[Message] Unhandled message type:", msg.type);
            break;
    }
    return true;
};
// Helper to request a fresh full state from a tab, update cache, and broadcast
async function fetchAndBroadcastTabState(tabId, { attempts = 2, delayMs = 150 } = {}) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const snapshot = await browser.tabs.sendMessage(tabId, { type: "get-all-states" });
            if (snapshot && typeof snapshot === "object") {
                updateTabState(tabId, snapshot, { force: true });
                broadcastStateToContentTabs("all-states-updated", tabStates[tabId]);
                bgLog(`[Refresh] Pulled and broadcast fresh state from tab ${tabId}`);
                return;
            } else {
                bgWarn(`[Refresh] Empty/invalid snapshot from tab ${tabId}`);
            }
        } catch (err) {
            bgWarn(`[Refresh] Failed to pull state from tab ${tabId} (attempt ${attempt}/${attempts}):`, err);
        }
        if (attempt < attempts) {
            await new Promise(r => setTimeout(r, delayMs));
        }
    }
}
/// ======== Two-level Change Filter ========
const perFieldChangeLogic = {
    // Toggle buttons should always be accepted
    playpause: (oldVal, newVal) => oldVal !== newVal,
    shuffle: (oldVal, newVal) => oldVal !== newVal,
    repeat: (oldVal, newVal) => oldVal !== newVal,
    like: (oldVal, newVal) => oldVal !== newVal,
    follow: (oldVal, newVal) => oldVal !== newVal,
    volume: (oldVal, newVal) =>
        typeof newVal === "number" && Math.abs((newVal ?? 0) - (oldVal ?? 0)) >= 0.01,
    muted: (oldVal, newVal) => !!oldVal !== !!newVal,
    display: (oldVal, newVal) => oldVal !== newVal,
    // Tickers should allow small changes
    secondsElapsed: (oldVal, newVal) => 
        typeof newVal === "number" && Math.abs(newVal - oldVal) >= 1,
    // Title should have strict identity
    songTitle: (oldVal, newVal) => oldVal !== newVal,
    songArtist: (oldVal, newVal) => oldVal !== newVal,
    // Duration should only accept if title also changed
    // duration: (oldVal, newVal, tabId) => {
    //     if (oldVal === newVal) return false;
    //     const oldTitle = tabStates[tabId]?.songTitle;
    //     const newTitle = pendingUpdateCache[tabId]?.songTitle ?? oldTitle;
    //     return oldTitle !== newTitle;
    // }
    duration: (oldVal, newVal) => oldVal !== newVal
}
// Helper that filters via the perFieldChangeLogic
function hasMeaningfulChange(tabId, partialState) {
    const prev = tabStates[tabId] || {};
    pendingUpdateCache[tabId] = { ...prev, ...partialState};

    for (const [key, newVal] of Object.entries(partialState)) {
        const oldVal = prev[key];
        const checkFn = perFieldChangeLogic[key];

        let changed;
        if (checkFn) {
            changed = checkFn(oldVal, newVal, tabId);
            bgLog(`[Check] ${key}: old=${JSON.stringify(oldVal)} new=${JSON.stringify(newVal)} → ${changed}`)
        } else {
            if (oldVal !== newVal) return true;
            bgLog(`[Check] ${key}: (no logic) old=${JSON.stringify(oldVal)} new=${JSON.stringify(newVal)} → ${changed}`)
        }
        if (changed) return true;
    }
    bgLog(`[Check] No meaningful changes for tab ${tabId}`);
    return false;
}
// Helper that checks each change that it is new and persists to storage.local
function updateTabState(tabId, partialState, { force = false, suppressTimeStamp = false }= {}) {
    ensureTabState(tabId);
    
    if (!force && !hasMeaningfulChange(tabId, partialState)) {
        bgLog(`[Update] Ignored: No changes for tab ${tabId}`);
        return false; // No update
    }
    
    Object.assign(tabStates[tabId], partialState);

    if (!suppressTimeStamp) {
        tabStates[tabId].lastUpdated = Date.now();
    }

    bgLog(`[Update] Applied to tab ${tabId}: `, JSON.stringify(partialState));
    delete pendingUpdateCache[tabId];

    return true;
}
