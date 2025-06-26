document.addEventListener('DOMContentLoaded', async() => {
    const fontBlob = await fetch(browser.runtime.getURL('controls/Inter-SemiBold.woff'))
        .then(r => r.blob());
    const fontUrl = URL.createObjectURL(fontBlob);
    const fontFace = new FontFace('Inter', `url(${fontUrl})`, {
        weight: 600,
        style: 'normal',
        display: 'swap'
    });
    await fontFace.load();
    document.fonts.add(fontFace);
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
    // Report Menu opener logic
    const reportBtn = document.getElementById('report-Btn');
    const reportCard = document.querySelector('.report-card');
    reportBtn.addEventListener('click', () => {
        console.log("clicked");
        reportCard.classList.toggle('card-shown');
    })
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