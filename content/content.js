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
                        playPauseBtn.addEventListener('click', () => {
                            // Toggle the state class on the button itself
                            if (playPauseBtn.classList.contains('paused')) {
                                playPauseBtn.classList.remove('paused');
                                playPauseBtn.classList.add('playing');
                                // TODO: trigger play logic here!
                            } else {
                                playPauseBtn.classList.remove('playing');
                                playPauseBtn.classList.add('paused');
                                // TODO: trigger pause logic here!
                            }
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