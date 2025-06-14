//---- Build the DOM ----
function addToolbarWhenReady() {
    if (document.body) {
        // Inject controls.html
        fetch(browser.runtime.getURL('controls/controls.html'))
            .then(r => r.text())
            .then(html => {
                const cleanHTML = DOMPurify.sanitize(html);

                const temp = document.createElement('div');
                temp.innerHTML = cleanHTML;
                const controls = temp.firstElementChild;
                document.body.appendChild(controls);
                // Inject controls.css
                fetch(browser.runtime.getURL('controls/controls.css'))
                    .then(r => r.text())
                    .then(css => {
                        const style = document.createElement('style');
                        style.textContent = css;
                        document.head.appendChild(style);
                        
                        //---- Open/Close the Controller UI ----
                        const close_btn = controls.querySelector('.collapse-btn')
                        const controller = controls
                        const open_icon = document.createElement('div');
                        open_icon.className = 'ext-icon';
                        open_icon.textContent = '☰';
                        document.body.appendChild(open_icon);

                        close_btn.onclick = () => {
                            controller.classList.add('ext-hidden');
                            open_icon.classList.add('ext-shown');
                        }
                        open_icon.onclick = () => {
                            controller.classList.remove('ext-hidden');
                            open_icon.classList.remove('ext-shown');
                        }

                        /// ==== On Load, Request State ====
                        /// sends "___-state-get-request" to [background.js]
                        /// receives "___-state-get-response" 
                        // Play/Pause
                        browser.runtime.sendMessage(
                            { type: "playpause-state-get-request" },
                            function(response) {
                                if (response && typeof response.state === "string") {
                                    setPlayPauseButtonUI(response.state);
                                }
                            }
                        );
                        // Shuffle
                        browser.runtime.sendMessage(
                            { type: "shuffle-state-get-request" },
                            function(response) {
                                if (response && typeof response.state === "string") {
                                    setShuffleButtonUI(response.state);
                                }
                            }
                        )
                        // Repeat
                        browser.runtime.sendMessage(
                            { type: "repeat-state-get-request" },
                            function(response) {
                                if (response && typeof response.state === "string") {
                                    setRepeatButtonUI(response.state);
                                }
                            }
                        )


                        /// ==== Event Handling ====
                        /// sends "___-toggle-request" to [background.js]
                        const playPauseBtn = controls.querySelector('.play_pause');
                        const skipPrevBtn = controls.querySelector('.skip_prev');
                        const skipNextBtn = controls.querySelector('.skip_next');
                        const shuffle = controls.querySelector('.shuffle')
                        const repeat = controls.querySelector('.repeat')

                        async function sendSimpleRequest(type, maxRetries = 3) {
                            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                                try {
                                    const response = await browser.runtime.sendMessage({ type });
                                    console.log(`${type} succeeded`, response);
                                    return response;
                                } catch (error) {
                                    console.warn(`Attempt ${attempt} failed for ${type}:`, error);
                                    if (attempt === maxRetries) {
                                        throw error;
                                    }
                                    await new Promise(r => setTimeout(r, 300 * attempt));
                                }
                            }
                        }

                        playPauseBtn.addEventListener('click', () => sendSimpleRequest("playpause-toggle-request"));
                        shuffle.addEventListener('click', () => sendSimpleRequest("shuffle-toggle-request"));
                        skipPrevBtn.addEventListener('click', () => sendSimpleRequest("skip-prev-request"));
                        skipNextBtn.addEventListener('click', () => sendSimpleRequest("skip-next-request"));
                        
                        repeat.addEventListener('click', async () => {
                            const states = ['off', 'one', 'all'];
                            let currentIndex = states.findIndex(state => repeat.classList.contains(state));
                            const nextIndex = (currentIndex + 1) % states.length;
                            const nextState = states[nextIndex];
                            try {
                                await browser.runtime.sendMessage({
                                    type: "repeat-toggle-request",
                                    state: nextState
                                });
                                console.log("repeat-toggle-request succeeded")
                                repeat.classList.remove(...states);
                                repeat.classList.add(nextState);
                            } catch (err) {
                                console.error('Repeat toggle failed:', err);
                            }
                        });


                        /// ==== Receiving State Updates ====
                        /// [background.js] gets an update, broadcasts "___-state-changed"
                        const stateHandlers = {
                            "playpause-state-changed": setPlayPauseButtonUI,
                            "shuffle-state-changed": setShuffleButtonUI,
                            "repeat-state-changed": setRepeatButtonUI,
                        };
                        browser.runtime.onMessage.addListener(function(msg) {
                            console.log("raw message received:", JSON.stringify(msg));
                            if (!msg || typeof msg !== "object") return;
                            // When it is an all-states update
                            if (msg.type === "all-states-updated") {
                                const states = msg.state || msg;
                                console.log("Extracted states:", {
                                    playPause: states.playPause,
                                    shuffle: states.shuffle,
                                    repeat: states.repeat
                                });
                                if (states.playPause) {
                                    stateHandlers["playpause-state-changed"](states.playPause);
                                }
                                if (states.shuffle) {
                                    stateHandlers["shuffle-state-changed"](states.shuffle);
                                }
                                if (states.repeat) {
                                    stateHandlers["repeat-state-changed"](states.repeat);
                                }
                            }
                            // When it is a single-state update
                            if (typeof msg.state === "string" && stateHandlers[msg.type]) {
                                console.log("Single state:", msg.type, msg.state)
                                stateHandlers[msg.type](msg.state);
                            }
                        })


                        /// ==== UI Updates ====
                        /// this document [content.js] calls these functions
                        // Play/Pause UI
                        function setPlayPauseButtonUI(state) {
                            console.log("setPlayPauseButtonUI called with:", state);
                            if (state === "playing") {
                                playPauseBtn.classList.remove('paused');
                                playPauseBtn.classList.add('playing');
                            } else if (state === "paused") {
                                playPauseBtn.classList.add('paused');
                                playPauseBtn.classList.remove('playing');
                            }
                        }
                        // Shuffle Toggle UI
                        function setShuffleButtonUI(state) {
                            console.log("setShuffleButtonUI called with:", state);
                            if (state === "active") {
                                shuffle.classList.add('active');
                            } else { shuffle.classList.remove('active'); }
                        }
                        // Repeat Toggle UI
                        function setRepeatButtonUI(state) {
                            console.log("setRepeatButtonUI called with:", state);
                            const states = ['off', 'one', 'all'];
                            states.forEach(s => repeat.classList.remove(s));
                            if (states.includes(state)) {
                                repeat.classList.add(state);
                            }
                        }
                    })
            })
    } else {
        // Try again very soon (next event loop)
        setTimeout(addToolbarWhenReady, 10);
    }
}
addToolbarWhenReady();