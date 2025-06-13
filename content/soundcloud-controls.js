// Listen for DOM changes on the play/pause button
function sendPlaybackState() {
    const isPlaying = document.querySelector('.playControl').classList.contains('playing');
    browser.runtime.sendMessage({
        type: 'playback-state-update',
        state: isPlaying ? 'playing' : 'paused'
    });
}
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "playpause") {
        // Find SoundCloud's play/pause button in the DOM and click it
        const playBtn = document.querySelector('.playControl');
        if (playBtn) {
            playBtn.click();
            setTimeout(sendPlaybackState, 200);
        }
    }
    if (message.type === "skip_prev") {
        // Find SoundCloud's skip previous button in the DOM and click it
        const prevBtn = document.querySelector('.skipControl__previous');
        if (prevBtn) {
            prevBtn.click();
            setTimeout(sendPlaybackState, 200);
        }
    }
    if (message.type === "skip_next") {
        // Find SoundCloud's skip next button in the DOM and click it
        const nextBtn = document.querySelector('.skipControl__next');
        if (nextBtn) {
            nextBtn.click();
            setTimeout(sendPlaybackState, 200);
        }
    }
})
const playBtn = document.querySelector('.playControl');
const prevBtn = document.querySelector('.skipControl__previous');
const nextBtn = document.querySelector('.skipControl__next');

if (playBtn) playBtn.addEventListener('click', () => setTimeout(sendPlaybackState, 200));
if (prevBtn) prevBtn.addEventListener('click', () => setTimeout(sendPlaybackState, 200));
if (nextBtn) nextBtn.addEventListener('click', () => setTimeout(sendPlaybackState, 200));

if (playBtn) {
    const observer = new MutationObserver(() => {
        sendPlaybackState();
    });
    observer.observe(playBtn, { attributes: true, attributeFilter: ['class'] });
}
