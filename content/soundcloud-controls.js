browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "playpause") {
        // Find SoundCloud's play/pause button in the DOM and click it
        const playBtn = document.querySelector('.playControl');
        if (playBtn) playBtn.click();
        else console.log('Play button not found!');
    }
    if (message.type === "skip_prev") {
        // Find SoundCloud's skip previous button in the DOM and click it
        const prevBtn = document.querySelector('.skipControl__previous');
        if (prevBtn) prevBtn.click();
    }
    if (message.type === "skip_next") {
        // Find SoundCloud's skip next button in the DOM and click it
        const nextBtn = document.querySelector('.skipControl__next');
        if (nextBtn) nextBtn.click();
    }
})
