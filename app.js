const state = { book: null, words: [], index: 0, wpm: 300, playing: false };
let library = [];

let timer = 0;
let anchorTime = 0;
let anchorIndex = 0;

const el = {};
for (const id of ['file', 'word', 'title', 'play', 'pause', 'wpm', 'wpm-label', 'progress', 'library']) {
  el[id] = document.getElementById(id);
}
const before = el.word.querySelector('.before');
const focal = el.word.querySelector('.focal');
const after = el.word.querySelector('.after');

const LIBRARY_KEY = 'speedreader:library';
const textKey = (id) => `speedreader:text:${id}`;

// The id is a hash of the text, not the file name, so a renamed or re-downloaded
// copy of the same book resumes where the first copy left off.
function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

function readLibrary() {
  let parsed;
  try {
    parsed = JSON.parse(localStorage.getItem(LIBRARY_KEY));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (e) =>
      e &&
      typeof e === 'object' &&
      typeof e.id === 'string' &&
      typeof e.title === 'string' &&
      [e.total, e.index, e.wpm, e.openedAt].every(Number.isFinite),
  );
}

function store(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn(`could not save ${key}`, e);
  }
}

function writeLibrary() {
  store(LIBRARY_KEY, JSON.stringify(library));
}

// The eye recognizes a word fastest when it lands a little left of center,
// so the focal letter sits about a quarter of the way in, capped at the fifth.
// This is the table most RSVP readers use: 1 -> 0, 2..5 -> 1, 6..9 -> 2, 10..13 -> 3, 14+ -> 4.
function orpIndex(len) {
  return Math.min(4, Math.ceil((len - 1) / 4));
}

function done() {
  return state.index >= state.words.length;
}

function row(entry) {
  const li = document.createElement('li');
  if (state.book && state.book.id === entry.id) li.className = 'current';
  li.innerHTML =
    '<button class="book" type="button"><span class="name"></span><span class="count"></span></button>' +
    '<button class="remove" type="button">×</button>';
  const [book, remove] = li.children;
  book.dataset.id = entry.id;
  book.firstChild.textContent = entry.title;
  book.lastChild.textContent = `${entry.index} / ${entry.total}`;
  remove.dataset.id = entry.id;
  remove.setAttribute('aria-label', `Remove ${entry.title}`);
  return li;
}

function render() {
  const { book, words, index, wpm, playing } = state;
  const word = words[Math.max(0, index - 1)] || '';
  const i = orpIndex(word.length);
  before.textContent = word.slice(0, i);
  focal.textContent = word.slice(i, i + 1);
  after.textContent = word.slice(i + 1);
  el.title.textContent = book ? book.title : '';
  el.play.textContent = words.length && done() ? 'Replay' : 'Play';
  el.play.disabled = playing;
  el.pause.disabled = !playing;
  el.progress.textContent = `${index} / ${words.length}`;
  el['wpm-label'].textContent = `${wpm} wpm`;
  const sorted = library.slice().sort((a, b) => b.openedAt - a.openedAt);
  el.library.replaceChildren(...sorted.map(row));
}

// setTimeout drifts by a few ms per call, so each tick is scheduled against the
// moment play started rather than against the previous tick. A wpm change
// while playing re-anchors so the new rate applies from now.
function schedule() {
  const due = anchorTime + (state.index - anchorIndex) * (60000 / state.wpm);
  timer = setTimeout(tick, Math.max(0, due - performance.now()));
}

// The word on screen is words[index - 1], so anchoring one behind gives it a
// full interval after a resume or a wpm change instead of cutting it short.
function anchor() {
  clearTimeout(timer);
  anchorTime = performance.now();
  anchorIndex = Math.max(0, state.index - 1);
  schedule();
}

function tick() {
  state.index += 1;
  if (done()) {
    state.playing = false;
    save();
  } else schedule();
  render();
}

function save() {
  if (!state.book) return;
  const entry = library.find((e) => e.id === state.book.id);
  entry.index = state.index;
  entry.wpm = state.wpm;
  writeLibrary();
}

function open(text, title) {
  pause();
  const id = hashText(text);
  const words = text.split(/\s+/).filter(Boolean);
  let entry = library.find((e) => e.id === id);
  if (entry) {
    entry.title = title;
    entry.openedAt = Date.now();
  } else {
    entry = { id, title, total: words.length, index: 0, wpm: state.wpm, openedAt: Date.now() };
    library.push(entry);
    store(textKey(id), text);
  }
  state.book = { id, title };
  state.words = words;
  state.index = entry.index;
  state.wpm = entry.wpm;
  el.wpm.value = state.wpm;
  writeLibrary();
  render();
}

function openId(id) {
  const text = localStorage.getItem(textKey(id));
  if (text === null) return remove(id);
  open(text, library.find((e) => e.id === id).title);
}

function remove(id) {
  library = library.filter((e) => e.id !== id);
  localStorage.removeItem(textKey(id));
  if (state.book && state.book.id === id) {
    clearTimeout(timer);
    state.book = null;
    state.words = [];
    state.index = 0;
    state.playing = false;
  }
  writeLibrary();
  render();
}

function play() {
  if (!state.words.length) return;
  if (done()) state.index = 0;
  state.playing = true;
  anchor();
  render();
}

function pause() {
  state.playing = false;
  clearTimeout(timer);
  save();
  render();
}

el.file.addEventListener('change', async () => {
  const file = el.file.files[0];
  if (file) open(await file.text(), file.name.replace(/\.txt$/i, ''));
  el.file.value = '';
});
el.play.addEventListener('click', play);
el.pause.addEventListener('click', pause);
el.wpm.addEventListener('input', () => {
  state.wpm = Number(el.wpm.value);
  if (state.playing) anchor();
  save();
  render();
});
el.library.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-id]');
  if (!button) return;
  (button.classList.contains('remove') ? remove : openId)(button.dataset.id);
});

// iOS Safari fires no unload when the user switches apps or swipes the tab
// away, so the moment the page hides is the last reliable chance to stop the
// timer and save. pagehide covers a navigation away while paused.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && state.playing) pause();
});
window.addEventListener('pagehide', save);

library = readLibrary();
if (library.length) openId(library.reduce((a, b) => (b.openedAt > a.openedAt ? b : a)).id);
render();
