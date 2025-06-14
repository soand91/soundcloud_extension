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