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
async function loadText(page, t) {
  await page.fill('#text', t);
  await page.click('#load');
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  page.on('pageerror', (e) => console.log(`page error: ${e.message}`));

  await check('page loads empty', async () => {
    await page.goto(base);
    assert.strictEqual(await text(page, '#progress'), '0 / 0');
    const w = await scrollWidth(page);
    assert(w <= 390, `scrollWidth ${w}`);
  });

  await check('paste and load', async () => {
    const t = sample(400);
    await loadText(page, t);
    assert.strictEqual(await text(page, '#progress'), `0 / ${count(t)}`);
  });

  await check('orp index per word', async () => {
    for (const w of ['a', 'to', 'word', 'reading', 'recognition', 'extraordinary']) {
      await loadText(page, w);
      const i = orpIndex(w.length);
      assert.strictEqual(await text(page, '#word .focal'), w[i], `focal of ${w}`);
      assert.strictEqual((await text(page, '#word .before')).length, i, `before of ${w}`);
    }
  });

  await check('focal x fixed, no horizontal scroll', async () => {
    const lefts = [];
    for (const w of ['I', 'we', 'read', 'reading', 'extraordinary', 'incomprehensibilities']) {
      await loadText(page, w);
      lefts.push(await page.evaluate(() => document.querySelector('#word .focal').getBoundingClientRect().left));
    }
    const spread = Math.max(...lefts) - Math.min(...lefts);
    assert(spread <= 1, `focal lefts ${lefts.map((x) => x.toFixed(2)).join(', ')}`);
    const w = await scrollWidth(page);
    assert(w <= 390, `scrollWidth ${w}`);
  });

  await check('upload txt file', async () => {
    const file = path.join(os.tmpdir(), `speed-reader-${process.pid}.txt`);
    fs.writeFileSync(file, sample(50));
    await page.setInputFiles('#file', file);
    await page.waitForFunction(() => document.querySelector('#progress').textContent === '0 / 50', null, { timeout: 2000 });
    fs.unlinkSync(file);
  });

  await check('slider range and label', async () => {
    const [min, max] = await page.evaluate(() => [document.querySelector('#wpm').min, document.querySelector('#wpm').max]);
    assert.strictEqual(min, '100');
    assert.strictEqual(max, '1000');
    await page.fill('#wpm', '1000');
    assert.strictEqual(await text(page, '#wpm-label'), '1000 wpm');
  });

  await check('300 wpm shows 285..315 words in 60s', async () => {
    await loadText(page, sample(600));
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
    await loadText(page, 'one two three');
    await page.fill('#wpm', '1000');
    await page.click('#play');
    await page.waitForFunction(() => document.querySelector('#play').textContent === 'Replay', null, { timeout: 600 });
    assert.strictEqual(await text(page, '#progress'), '3 / 3');
  });

  await check('resume keeps the paused word on screen', async () => {
    await loadText(page, 'one two three four');
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

  await browser.close();
  server.close();
  process.exitCode = failed ? 1 : 0;
})();
