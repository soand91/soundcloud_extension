document.addEventListener('DOMContentLoaded', async() => {
    // Query for all open SoundCloud tabs
    browser.runtime.sendMessage({ type: "get-soundcloud-tabs" }, response => {
        const tabListElem = document.getElementById('tab-list');
        tabListElem.innerHTML = '';
        response.tabs.forEach(tab => {
            const li = document.createElement('li');
            li.textContent = tab.title || tab.url;
            li.className = tab.isActive ? 'active' : '';
            li.onclick = () => {
                browser.runtime.sendMessage({ type: "set-active-soundcloud-tab", tabId: tab.tabId }, (res) => {
                    if (res.success) {
                        //TODO Optionally provide visual feedback or close popup
                    }
                })
            }
            tabListElem.appendChild(li);
        })
    })
    // Query for settings data from [background.js]
    const settingKeys = ['start-open-toggle', 'active-tab-toggle', 'theme-default-toggle']
    browser.storage.local.get(settingKeys).then(settings => {
        settingKeys.forEach(key => {
            const togglebox = document.getElementById(key);
            const labelSpan = document.getElementById(`${key}-label`);

            if (!togglebox || !labelSpan) return;

            const toggled = !!settings[key];
            togglebox.checked = toggled;
            labelSpan.textContent = getLabelText(key, toggled);

            togglebox.addEventListener('change', () => {
                const isToggled = togglebox.checked;
                labelSpan.textContent = getLabelText(key, isToggled);

                const update = {};
                update[key] = isToggled;
                browser.storage.local.set(update);
            });
        });
    });
});

function getLabelText(key, value) {
    switch (key) {
        case 'start-open-toggle':
            return value ? 'opened' : 'closed';
        case 'active-tab-toggle':
            return value ? 'Tab-focused' : 'Popup-select';
        case 'theme-default-toggle': 
            return value ? 'Dark Mode' : 'Light Mode';
        default:
            return value ? 'on' : 'off'
    }

}