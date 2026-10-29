# speed-reader

A speed reader that shows one word at a time. Each word is placed so its focal letter, drawn in red, lands at the same spot on screen. Your eyes stay still and the text moves past them.

Plain HTML, CSS, and JavaScript. No build step, no dependencies at runtime.

## Use it on a phone

Open https://samanhashemi.github.io/SpeedReader/ in Safari.

1. Tap Open a .txt file and pick one. Its name appears above the Play button.
2. Tap Play. Tap again to pause. When the text ends the button reads Replay.
3. Drag the slider to change the speed, from 100 to 1000 words per minute. It takes effect at once, even while playing.

The reader holds longer at the end of a sentence, longer still at a paragraph break, and longer on long words. The slider is still the true average speed, so 300 means 300 words per minute over the whole file.

The counter under the word shows how far along you are.

The app remembers where you are and your speed for each file. Your files are listed under the Open button, newest first, and tapping one switches to it. When you come back, the app reopens the last file you read. Tap × next to a file to forget it. All of this lives in Safari on your phone, so clearing website data removes it.

## Verify

```
node verify.js
```

The script needs Node 22 and Playwright 1.63.0 with Chromium. It serves this folder, opens it at iPhone size (390 by 844), and checks the file load, focal alignment, slider, and button states. It then plays 600 words at 300 wpm for a minute and checks that between 285 and 315 words appeared. Then it checks that progress, speed, and the file list survive a reload, and that a fresh browser starts empty. Last it plays a file of short paragraphs for 8 seconds and checks that sentence ends, paragraph ends, and commas hold longer than plain words by the expected ratios while the average rate stays at 300. It prints one `ok` or `FAIL` line per check and takes about 80 seconds.

## Deploy

Every pull request and every push to `main` runs `.github/workflows/pages.yml`. The `verify` job runs `node verify.js`. On `main`, if it passes, the `deploy` job publishes the repo root to GitHub Pages. Work lands through pull requests, never by a direct push to `main`.
