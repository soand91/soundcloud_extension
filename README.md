# SoundCloud Global Controls (Firefox Extension)
Control SoundCloud playback from **any tab** - play, pause, skip, and more - without having to find and click in the original SoundCloud tab
This extension injects playback controls into SoundCloud pages and exposes global commands through a toolbar UI and popup UI. 
## Features
- Control SoundCloud from any tab
- Play / pause / skip / repeat / shuffle / like / follow without switching tabs
- Volume control
- Playback scrubbing
- Double-click artist or song link to navigate
- Popup UI to see all open SoundCloud instances
- Double-click in popup UI to focus the tab wherever it is
- Lightweight, no tracking, no analytics
## Privacy
This extension **does not collect any user data**.
All functionality runs locally in the browser.

Users may **optionally** submit bug reports via the popup UI.
These reports contain only:
- the URL of the page (autodetected but user-editable)
- an error category (manually selected)
- a user-provided message
- extension version
No data is sent automatically
## Installation
Firefox Add-on Store:
https://addons.mozilla.org/en-US/firefox/addon/soundcloud-ui-extender/
## Development
You need `web-ext`: 
```bash
npm install --global web-ext
web-ext run # to run on temporary Firefox profile
web-ext lint # to lint
web-ext build # to build
```
This repo does not ship with a real bug-report webhook URL.
To run the extension with bug reporting enabled:
1. Copy the sample file:
```bash
cp config.sample.js config.local.js
```
2. Edit `config.local.js` and set `WEBHOOK_URL` to your own endpoint (for example a Discord webhook):
```js
export const WEBHOOK_URL = "https://discord.com/api/webhooks/....";
```
3. Build andrun the extension as usual:
```bash
web-ext run
```
If you skip this step, the extension will fail to load because `config.local.js` is missing. If you don't care about the bug-report feature, you can also comment out the import and usage of `WEBHOOK_URL` at the top of `background.js`.
## License
This project is licensed under the MIT License - see the [License](LICENSE) file for details.
