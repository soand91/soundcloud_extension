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

                        // All my event listeners here  

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
                        
                        //---- Press Play/Pause Button Toggle Logic ----
                        const playPauseBtn = controls.querySelector('.play_pause');
                        // Asks background for current state when created
                        browser.runtime.sendMessage({ type: "get-ui-state" }, (response) => {
                            if (response && response.state) {
                                updatePlayPauseIcon(response.state);
                            }
                        });
                        // Sends the play/pause message to the SoundCloud tab
                        playPauseBtn.addEventListener('click', () => {
                            browser.runtime.sendMessage({ type: "playpause" })
                        });
                        // Listen for UI updates from background
                        browser.runtime.onMessage.addListener((message, sender, sendReseponse) => {
                            if (message.type === "update-ui-state") {
                                updatePlayPauseIcon(message.state);
                            }
                        });
                        // Update the UI based on received response
                        function updatePlayPauseIcon(state) {
                            if (state === "playing") {
                                playPauseBtn.classList.remove('paused');
                                playPauseBtn.classList.add('playing');
                            } else {
                                playPauseBtn.classList.add('paused');
                                playPauseBtn.classList.remove('playing');
                            }
                        }

                        //--- Skip Prev/Next Button Logic ----
                        const skipPrevBtn = controls.querySelector('.skip_prev');
                        const skipNextBtn = controls.querySelector('.skip_next');
                        skipPrevBtn.addEventListener('click', () => {
                            browser.runtime.sendMessage({ type: "skip_prev" })
                        });
                        skipNextBtn.addEventListener('click', () => {
                            browser.runtime.sendMessage({ type: "skip_next" })
                        });

                        //---- Shuffle Button Cycling Logic ---- 
                        const shuffle = controls.querySelector('.shuffle')
                        shuffle.onclick = () => {
                            shuffle.classList.toggle('active');
                        }

                        //---- Repeat Button Cycling log ----
                        const repeat = controls.querySelector('.repeat')
                        const states = ['off', 'one', 'all']
                        repeat.addEventListener('click', () => {
                            // Find current state index
                            let currentIndex = states.findIndex(state => repeat.classList.contains(state));
                            // Remove current state class
                            if (currentIndex !== -1) repeat.classList.remove(states[currentIndex]);
                            // Get the next state index
                            const nextIndex = (currentIndex + 1) % states.length;
                            repeat.classList.add(states[nextIndex]);
                            // Downstream click logic 
                            switch (states[nextIndex]) {
                                case 'off':
                                // insert for repeat: off
                                break;
                                case 'one':
                                // insert for repeat: one
                                break;
                                case 'all':
                                // insert for repeat: all
                                break;
                            }
                        });
                    })
            })
    } else {
        // Try again very soon (next event loop)
        setTimeout(addToolbarWhenReady, 10);
    }
}
addToolbarWhenReady();