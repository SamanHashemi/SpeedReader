const state = { words: [], index: 0, wpm: 300, playing: false, title: '' };

let timer = 0;
let anchorTime = 0;
let anchorIndex = 0;

const el = {};
for (const id of ['file', 'word', 'title', 'play', 'wpm', 'wpm-label', 'progress']) {
  el[id] = document.getElementById(id);
}
const before = el.word.querySelector('.before');
const focal = el.word.querySelector('.focal');
const after = el.word.querySelector('.after');

// The eye recognizes a word fastest when it lands a little left of center,
// so the focal letter sits about a quarter of the way in, capped at the fifth.
// This is the table most RSVP readers use: 1 -> 0, 2..5 -> 1, 6..9 -> 2, 10..13 -> 3, 14+ -> 4.
function orpIndex(len) {
  return Math.min(4, Math.ceil((len - 1) / 4));
}

function done() {
  return state.index >= state.words.length;
}

function render() {
  const { words, index, wpm, playing, title } = state;
  const word = words[Math.max(0, index - 1)] || '';
  const i = orpIndex(word.length);
  before.textContent = word.slice(0, i);
  focal.textContent = word.slice(i, i + 1);
  after.textContent = word.slice(i + 1);
  el.title.textContent = title;
  el.play.textContent = playing ? 'Pause' : words.length && done() ? 'Replay' : 'Play';
  el.progress.textContent = `${index} / ${words.length}`;
  el['wpm-label'].textContent = `${wpm} wpm`;
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
  if (done()) state.playing = false;
  else schedule();
  render();
}

function load(text, title) {
  clearTimeout(timer);
  state.title = title.replace(/\.txt$/i, '');
  state.words = text.split(/\s+/).filter(Boolean);
  state.index = 0;
  state.playing = false;
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
  render();
}

el.file.addEventListener('change', async () => {
  const file = el.file.files[0];
  if (file) load(await file.text(), file.name);
  el.file.value = '';
});
el.play.addEventListener('click', () => (state.playing ? pause() : play()));
el.wpm.addEventListener('input', () => {
  state.wpm = Number(el.wpm.value);
  if (state.playing) anchor();
  render();
});

render();
