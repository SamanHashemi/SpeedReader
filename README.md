# speed-reader

A speed reader that shows one word at a time. Each word is placed so its focal letter, drawn in red, lands at the same spot on screen. Your eyes stay still and the text moves past them.

Plain HTML, CSS, and JavaScript. No build step, no dependencies at runtime.

## Use it on a phone

Open https://samanhashemi.github.io/speedreader/ in Safari.

1. Paste text into the box and tap Load, or tap the file picker and choose a .txt file.
2. Tap Play. Tap again to pause. When the text ends the button reads Replay.
3. Drag the slider to change the speed, from 100 to 1000 words per minute. It takes effect at once, even while playing.

The counter under the word shows how far along you are.

## Verify

```
node verify.js
```

The script needs Node 22 and Playwright 1.63.0 with Chromium. It serves this folder, opens it at iPhone size (390 by 844), and checks the load, upload, focal alignment, slider, and button states. It then plays 600 words at 300 wpm for a minute and checks that between 285 and 315 words appeared. It prints one `ok` or `FAIL` line per check and takes about 70 seconds.

## Deploy

Every push to `main` runs `.github/workflows/pages.yml`. The `verify` job runs `node verify.js`. If it passes, the `deploy` job publishes the repo root to GitHub Pages.
