const tabStateCache = new Map();
let tabListElem;
let tabEmptyElem;

document.addEventListener('DOMContentLoaded', async () => {
    tabListElem = document.getElementById('tab-list');
    tabEmptyElem = document.getElementById('tab-empty');

    await loadPopupFont();
    await loadInitialTabStates();
    setupRuntimeListeners();
    setupSettingsToggles();
    setupReportUI();
});

async function loadPopupFont() {
    const fontBlob = await fetch(browser.runtime.getURL('controls/Inter-SemiBold.woff')).then(r => r.blob());
    const fontUrl = URL.createObjectURL(fontBlob);
    const fontFace = new FontFace('Inter', `url(${fontUrl})`, {
        weight: 600,
        style: 'normal',
        display: 'swap'
    });
    await fontFace.load();
    document.fonts.add(fontFace);
}

async function loadInitialTabStates() {
    try {
        const allStates = await browser.runtime.sendMessage({ type: "get-all-states" });
        tabStateCache.clear();
        if (allStates && typeof allStates === "object") {
            Object.entries(allStates).forEach(([tabId, state]) => {
                tabStateCache.set(Number(tabId), state);
            });
        }
        renderTabRows();
    } catch (err) {
        console.error("Failed to load tab states:", err);
    }
}

function setupRuntimeListeners() {
    browser.runtime.onMessage.addListener(msg => {
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "tab-state-updated" && msg.state) {
            tabStateCache.set(Number(msg.tabId), msg.state);
            renderTabRows();
        } else if (msg.type === "tab-state-removed") {
            tabStateCache.delete(Number(msg.tabId));
            renderTabRows();
        } else if (msg.type === "active-soundcloud-tab-changed") {
            const activeId = Number(msg.tabId);
            tabStateCache.forEach((state, id) => {
                tabStateCache.set(id, { ...state, isActive: id === activeId });
            });
            renderTabRows();
        }
    });
}

function deriveRenderableTabs() {
    return Array.from(tabStateCache.entries())
        .filter(([, state]) => state?.isSoundCloud)
        .map(([tabId, state]) => ({
            tabId: Number(tabId),
            title: state.songTitle || state.pageTitle || state.url || "SoundCloud Tab",
            subtitle: state.songArtist || state.pageTitle || state.url || "",
            playpause: state.playpause || "paused",
            timeLabel: formatTimeLabel(state.secondsElapsed, state.duration),
            isActive: !!state.isActive,
            lastUpdated: state.lastUpdated || 0
        }))
        .sort((a, b) => {
            if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
            return (b.lastUpdated || 0) - (a.lastUpdated || 0);
        });
}

function renderTabRows() {
    if (!tabListElem || !tabEmptyElem) return;
    const tabs = deriveRenderableTabs();
    tabListElem.innerHTML = '';

    if (tabs.length === 0) {
        tabEmptyElem.classList.remove('hidden');
        return;
    }
    tabEmptyElem.classList.add('hidden');

    tabs.forEach(tab => {
        const row = document.createElement('div');
        row.className = `tab-row${tab.isActive ? ' active' : ''}`;
        row.dataset.tabId = tab.tabId;
        row.addEventListener('dblclick', () => focusTab(tab.tabId));
        row.title = "Double-click to focus this SoundCloud tab";

        const ctrlBtn = document.createElement('button');
        ctrlBtn.type = 'button';
        ctrlBtn.className = `tab-ctrl${tab.isActive ? ' active' : ''}`;
        const playState = tab.playpause === "playing" ? "playing" : "paused";
        ctrlBtn.classList.toggle('playing', playState === "playing");
        
        const icon = document.createElement('span');
        icon.className = 'icon';
        
        if (playState === "playing") {
            // Pause icon (two vertical bars)
            icon.innerHTML = `<svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="1" width="2.5" height="10" rx="0.5"/>
                <rect x="7.5" y="1" width="2.5" height="10" rx="0.5"/>
            </svg>`;
        } else {
            // Play icon (triangle)
            icon.innerHTML = `<svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 1.5 L3 10.5 L10 6 Z"/>
            </svg>`;
        }
        
        ctrlBtn.appendChild(icon);
        ctrlBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePlayPause(tab.tabId);
        });

        const timeEl = document.createElement('div');
        timeEl.className = 'tab-time';
        timeEl.textContent = tab.timeLabel;

        const textWrap = document.createElement('div');
        textWrap.className = 'tab-text';

        const titleEl = document.createElement('div');
        titleEl.className = 'tab-title';
        titleEl.textContent = tab.title;

        const subtitleEl = document.createElement('div');
        subtitleEl.className = 'tab-subtitle';
        subtitleEl.textContent = tab.subtitle;

        textWrap.appendChild(titleEl);
        textWrap.appendChild(subtitleEl);

        row.appendChild(ctrlBtn);
        row.appendChild(timeEl);
        row.appendChild(textWrap);
        tabListElem.appendChild(row);
    });
}

function setActiveTab(tabId) {
    return browser.runtime.sendMessage({ type: "set-active-soundcloud-tab", tabId: Number(tabId) }).catch(err => {
        console.error("Failed to set active SoundCloud tab:", err);
    });
}

function togglePlayPause(tabId) {
    setActiveTab(tabId)
        .then(() => browser.runtime.sendMessage({ type: "playpause-toggle-request" }))
        .catch(err => console.error("Failed to toggle play/pause:", err));
}

function focusTab(tabId) {
    browser.runtime.sendMessage({ type: "focus-soundcloud-tab", tabId: Number(tabId) })
        .catch(err => console.error("Failed to focus tab:", err));
}

function setupSettingsToggles() {
    const settingKeys = ['start-open-toggle', 'active-tab-toggle', 'theme-default-toggle'];
    browser.storage.local.get(settingKeys).then(settings => {
        settingKeys.forEach(key => {
            const togglebox = document.getElementById(key);
            const labelSpan = document.getElementById(`${key}-label`);

            if (!togglebox || !labelSpan) return;

            const toggled = !!settings[key];
            togglebox.checked = toggled;
            labelSpan.textContent = getLabelText(key, toggled);
            if (key === 'theme-default-toggle') applyTheme(toggled);

            togglebox.addEventListener('change', () => {
                const isToggled = togglebox.checked;
                labelSpan.textContent = getLabelText(key, isToggled);
                if (key === 'theme-default-toggle') applyTheme(isToggled);

                const update = {};
                update[key] = isToggled;
                browser.storage.local.set(update);
            });
        });
    });
}

function setupReportUI() {
    const reportBtn = document.getElementById('report-Btn');
    const reportCard = document.querySelector('.report-card');
    reportBtn.addEventListener('click', () => {
        reportCard.classList.toggle('card-shown');
    });
    // Report Menu Tab Logic
    let selectedTab = "page"
    const tabViews = {
        playback: document.getElementById('playback-info'),
        page: document.getElementById('page-info'),
    }

    document.querySelectorAll('.report-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.id === selectedTab) return; 
            document.getElementById(selectedTab).classList.remove('selected');
            tab.classList.add('selected');
            
            tabViews[selectedTab].classList.add('hidden');
            tabViews[tab.id].classList.remove('hidden');
            
            selectedTab = tab.id;
        })
    })
}

function getLabelText(key, value) {
    switch (key) {
        case 'start-open-toggle':
            return value ? 'opened' : 'closed';
        case 'active-tab-toggle':
            return value ? 'Popup-selected' : 'Focused Tab';
        case 'theme-default-toggle': 
            return value ? 'Dark Mode' : 'Light Mode';
        default:
            return value ? 'on' : 'off'
    }
}

function applyTheme(isDark) {
    document.body.classList.toggle('theme-dark', !!isDark);
}

function formatTimeLabel(currentSeconds, durationSeconds) {
    const fmt = (s) => {
        if (typeof s !== "number" || !Number.isFinite(s) || s < 0) return "--:--";
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, "0")}`;
    };
    const cur = fmt(currentSeconds);
    const dur = fmt(durationSeconds);
    if (cur === "--:--" && dur === "--:--") return "--:-- / --:--";
    return `${cur} / ${dur}`;
}
