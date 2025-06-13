// Query for all open SoundCloud tabs
browser.tabs.query({ url: "*://soundcloud.com/*" }, (tabs) => {
    const tabList = document.getElementById('tab-list');
    tabList.innerHTML = '';
    tabs.forEach(tab => {
        const li = document.createElement('li');
        li.textContent = tab.title + ' - ' + tab.url;
        li.onclick = () => {
            // Mark as selected (UI)
            document.querySelectorAll('#tab-list li').forEach(li => li.classList.remove('active'));
            li.classList.add('active');
            browser.runtime.sendMessage({ type: "set-active-soundcloud-tab", tabId: tab.id });
        };
        tabList.appendChild(li);
    });
});