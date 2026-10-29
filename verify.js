const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const root = __dirname;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const file = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const vocab = 'the quick brown fox jumps over a lazy dog while reading words at speed on phone screens'.split(' ');
function sample(n) {
  return Array.from({ length: n }, (_, i) => vocab[i % vocab.length] + (i % 7 === 6 ? ',' : ''))
    .join(' ')
    .replace(/((?:\S+ ){11})/g, '$1\n');
}
function count(text) {
  return text.split(/\s+/).filter(Boolean).length;
}
function orpIndex(len) {
  return Math.min(4, Math.ceil((len - 1) / 4));
}

let failed = false;
async function check(name, fn) {
  try {
    await fn();
    console.log(`ok ${name}`);
  } catch (e) {
    failed = true;
    console.log(`FAIL ${name}: ${e.message}`);
  }
}

const text = (page, sel) => page.evaluate((s) => document.querySelector(s).textContent, sel);
const scrollWidth = (page) => page.evaluate(() => document.documentElement.scrollWidth);
let fileCount = 0;
async function openFile(page, t, name = `speed-reader-${process.pid}-${fileCount++}.txt`) {
  const file = path.join(os.tmpdir(), name);
  fs.writeFileSync(file, t);
  await page.setInputFiles('#file', file);
  await page.waitForFunction((p) => document.querySelector('#title').textContent === p, name.replace(/\.txt$/i, ''), { timeout: 2000 });
  fs.unlinkSync(file);
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const device = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
  let page = await browser.newPage(device);
  page.on('pageerror', (e) => console.log(`page error: ${e.message}`));

  await check('page loads empty', async () => {
    await page.goto(base);
    assert.strictEqual(await text(page, '#progress'), '0 / 0');
    assert.strictEqual(await text(page, '#title'), '');
    const box = await page.locator('label[for="file"]').boundingBox();
    assert(box.height === 44 && box.width === 390 - 32, `open label ${box.width}x${box.height}`);
    const w = await scrollWidth(page);
    assert(w <= 390, `scrollWidth ${w}`);
  });

  await check('open txt file loads words', async () => {
    const t = sample(400);
    await openFile(page, t, 'Quick brown fox.txt');
    assert.strictEqual(await text(page, '#progress'), `0 / ${count(t)}`);
    assert.strictEqual(await text(page, '#title'), 'Quick brown fox');
    await openFile(page, t, `${'a-very-long-file-name-'.repeat(6)}.txt`);
    const w = await scrollWidth(page);
    assert(w <= 390, `scrollWidth ${w}`);
  });

  await check('orp index per word', async () => {
    for (const w of ['a', 'to', 'word', 'reading', 'recognition', 'extraordinary']) {
      await openFile(page, w);
      const i = orpIndex(w.length);
      assert.strictEqual(await text(page, '#word .focal'), w[i], `focal of ${w}`);
      assert.strictEqual((await text(page, '#word .before')).length, i, `before of ${w}`);
    }
  });

  await check('focal x fixed, no horizontal scroll', async () => {
    const lefts = [];
    for (const w of ['I', 'we', 'read', 'reading', 'extraordinary', 'incomprehensibilities']) {
      await openFile(page, w);
      lefts.push(await page.evaluate(() => document.querySelector('#word .focal').getBoundingClientRect().left));
    }
    const spread = Math.max(...lefts) - Math.min(...lefts);
    assert(spread <= 1, `focal lefts ${lefts.map((x) => x.toFixed(2)).join(', ')}`);
    const w = await scrollWidth(page);
    assert(w <= 390, `scrollWidth ${w}`);
  });

  await check('slider range and label', async () => {
    const [min, max] = await page.evaluate(() => [document.querySelector('#wpm').min, document.querySelector('#wpm').max]);
    assert.strictEqual(min, '100');
    assert.strictEqual(max, '1000');
    await page.fill('#wpm', '1000');
    assert.strictEqual(await text(page, '#wpm-label'), '1000 wpm');
  });

  await check('300 wpm shows 285..315 words in 60s', async () => {
    await openFile(page, sample(600));
    await page.fill('#wpm', '300');
    await page.evaluate(() => {
      const el = document.querySelector('#word');
      window.__renders = 0;
      window.__last = el.textContent;
      new MutationObserver(() => {
        if (el.textContent !== window.__last) {
          window.__last = el.textContent;
          window.__renders += 1;
        }
      }).observe(el, { childList: true, characterData: true, subtree: true });
      window.__t0 = performance.now();
    });
    await page.click('#play');
    await page.waitForTimeout(60000);
    await page.click('#play');
    const [renders, elapsed] = await page.evaluate(() => [window.__renders, performance.now() - window.__t0]);
    const progress = await text(page, '#progress');
    console.log(`  measured ${renders} words, progress ${progress}, elapsed ${elapsed.toFixed(0)}ms`);
    assert(renders >= 285 && renders <= 315, `${renders} words`);
  });

  await check('button text play, pause, replay', async () => {
    assert.strictEqual(await text(page, '#play'), 'Play');
    await openFile(page, 'one two three');
    await page.fill('#wpm', '1000');
    await page.click('#play');
    await page.waitForFunction(() => document.querySelector('#play').textContent === 'Replay', null, { timeout: 600 });
    assert.strictEqual(await text(page, '#progress'), '3 / 3');
  });

  await check('resume keeps the paused word on screen', async () => {
    await openFile(page, 'one two three four');
    await page.fill('#wpm', '100');
    await page.click('#play');
    await page.waitForFunction(() => document.querySelector('#progress').textContent === '2 / 4', null, { timeout: 2000 });
    await page.click('#play');
    assert.strictEqual(await text(page, '#word'), 'two');
    await page.click('#play');
    await page.waitForTimeout(200);
    assert.strictEqual(await text(page, '#word'), 'two');
    await page.click('#play');
  });

  const rows = () => page.locator('#library li');
  const progressAtLeast = (n) =>
    page.waitForFunction((min) => parseInt(document.querySelector('#progress').textContent, 10) >= min, n, { timeout: 5000 });
  const memoryText = sample(100);
  let saved;

  await check('progress survives reload', async () => {
    await page.context().close();
    page = await (await browser.newContext(device)).newPage();
    page.on('pageerror', (e) => console.log(`page error: ${e.message}`));
    await page.goto(base);
    await openFile(page, memoryText, 'Memory test.txt');
    await page.fill('#wpm', '1000');
    await page.click('#play');
    await progressAtLeast(20);
    await page.click('#play');
    saved = await text(page, '#progress');
    assert.strictEqual(await text(page, '#wpm-label'), '1000 wpm');
    await page.reload();
    assert.strictEqual(await text(page, '#title'), 'Memory test');
    assert.strictEqual(await text(page, '#progress'), saved);
    assert.strictEqual(await text(page, '#wpm-label'), '1000 wpm');
    assert.strictEqual(await text(page, '#play'), 'Play');
  });

  await check('library lists books and switches', async () => {
    await openFile(page, sample(40), 'Second book.txt');
    assert.strictEqual(await rows().count(), 2);
    assert.strictEqual(await text(page, '#library li:first-child .name'), 'Second book');
    assert(await rows().first().evaluate((li) => li.classList.contains('current')), 'first row is current');
    assert.strictEqual(await text(page, '#progress'), '0 / 40');
    const w = await scrollWidth(page);
    assert(w <= 390, `scrollWidth ${w}`);
    await page.locator('#library .book', { hasText: 'Memory test' }).click();
    assert.strictEqual(await text(page, '#title'), 'Memory test');
    assert.strictEqual(await text(page, '#progress'), saved);
    assert.strictEqual(await text(page, '#wpm-label'), '1000 wpm');
  });

  await check('same text under a new name resumes', async () => {
    await openFile(page, memoryText, 'Renamed.txt');
    assert.strictEqual(await text(page, '#progress'), saved);
    assert.strictEqual(await rows().count(), 2);
    assert.strictEqual(await page.locator('#library .book', { hasText: 'Renamed' }).count(), 1);
    assert.strictEqual(await page.locator('#library .book', { hasText: 'Memory test' }).count(), 0);
  });

  await check('hiding the page pauses and saves', async () => {
    await page.click('#play');
    await progressAtLeast(parseInt(saved, 10) + 5);
    const hidden = await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      return document.querySelector('#progress').textContent;
    });
    assert.strictEqual(await text(page, '#play'), 'Play');
    await page.reload();
    assert.strictEqual(await text(page, '#progress'), hidden);
    assert.notStrictEqual(hidden, saved);
  });

  await check('remove forgets a book', async () => {
    const id = await page.locator('#library .book', { hasText: 'Second book' }).getAttribute('data-id');
    await page.locator(`#library .remove[data-id="${id}"]`).click();
    assert.strictEqual(await rows().count(), 1);
    await page.reload();
    assert.strictEqual(await rows().count(), 1);
    const keys = await page.evaluate(() => Object.keys(localStorage));
    assert(!keys.some((k) => k.endsWith(id)), `keys ${keys.join(', ')}`);
    assert.strictEqual(await text(page, '#title'), 'Renamed');
  });

  await check('fresh browser starts empty', async () => {
    const context = await browser.newContext(device);
    const fresh = await context.newPage();
    await fresh.goto(base);
    assert.strictEqual(await text(fresh, '#progress'), '0 / 0');
    assert.strictEqual(await fresh.locator('#library li').count(), 0);
    assert.strictEqual(await text(fresh, '#title'), '');
    await context.close();
  });

  await browser.close();
  server.close();
  process.exitCode = failed ? 1 : 0;
})();
