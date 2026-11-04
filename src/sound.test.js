// The engine against a stand-in for Web Audio, for what's hard to catch in Chrome. tools/play-sound.mjs plays the real thing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createSound, loadSound } from './sound.js';
import { RECIPES } from './soundbank.js';

const DATA = JSON.parse(readFileSync(new URL('../data/sound.json', import.meta.url), 'utf8'));

class Param {
  constructor(v = 0) { this.value = v; this.target = v; this.calls = []; }
  setTargetAtTime(v, t, c) { this.target = v; this.value = c < .1 ? v : this.value; this.calls.push(['target', v, t, c]); }
  cancelScheduledValues() {} setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.target = v; }
  setValueCurveAtTime(c, t, d) { this.calls.push(['curve', c, t, d]); }
}
class Node_ { constructor() { this.out = new Set(); this.gain = new Param(1); this.frequency = new Param(); this.detune = new Param(); this.Q = new Param(); this.pan = new Param(); this.delayTime = new Param(); this.threshold = new Param(); this.ratio = new Param(); this.attack = new Param(); this.release = new Param(); this.playbackRate = new Param(1); } connect(n) { this.out.add(n); return n; } disconnect() { this.out.clear(); } }
class Buf { constructor(chans, length, rate) { this.numberOfChannels = chans; this.length = length; this.sampleRate = rate; this.duration = length / rate; this.data = Array.from({ length: chans }, () => new Float32Array(length)); } getChannelData(i) { return this.data[i]; } }
function fakeWorld({ coarse = false, hidden = false, respond = () => null } = {}) {
  const made = { sources: [], fetched: [], keydown: [], warnings: [], stored: {} };
  class Ctx {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = new Node_(); made.ctx = this; }
    resume() { this.state = 'running'; } suspend() { this.state = 'suspended'; }
    createGain() { return new Node_(); } createBiquadFilter() { return new Node_(); } createDelay() { return new Node_(); } createStereoPanner() { const n = new Node_(); made.lastPanner = n; return n; } createDynamicsCompressor() { return new Node_(); } createAnalyser() { return new Node_(); }
    createOscillator() { const n = new Node_(); n.start = () => {}; return n; }
    createBuffer(c, n, r) { return new Buf(c, n, r); }
    createBufferSource() { const n = new Node_(); n.started = null; n.start = (at = 0, offset = 0, len) => { n.started = { at, offset, len }; }; n.stop = (at) => { n.stopped = at; }; made.sources.push(n); return n; }
    decodeAudioData(bytes, ok) { ok(bytes.decoded); }
  }
  const handlers = {};
  const win = {
    AudioContext: Ctx, performance: { now: () => made.ctx?.currentTime * 1000 || 0 }, console: { warn: (m) => made.warnings.push(m) },
    matchMedia: () => ({ matches: coarse }), navigator: {}, document: { hidden, addEventListener: (e, f) => { handlers[e] = f; } },
    localStorage: { getItem: (k) => made.stored[k] ?? null, setItem: (k, v) => { made.stored[k] = v; } },
    addEventListener: (e, f) => { handlers[e] = f; },
    fetch: async (file) => { made.fetched.push(file); const decoded = respond(file); return decoded ? { ok: true, arrayBuffer: async () => ({ decoded }) } : { ok: false, status: 404 }; },
  };
  return { win, made, handlers, touch: () => handlers.pointerdown(), settle: () => new Promise((r) => setTimeout(r, 5)) };
}
function tone({ seconds = 10, chans = 2, rate = 1000, amp = .5, lead = 0, tail = 0 } = {}) {
  const b = new Buf(chans, Math.floor(seconds * rate), rate);
  for (const d of b.data) for (let i = 0; i < d.length; i++) { const t = i / rate; d[i] = t < lead || t > seconds - tail ? 0 : Math.sin(i * .9) * amp; }
  return b;
}
const data = (over = {}) => ({ ...structuredClone(DATA), ...over });

test('nothing happens until something has been touched', () => {
  const w = fakeWorld(), s = createSound(data(), { win: w.win });
  assert.equal(s.unlocked, false); assert.equal(s.play('ui.tap'), false); assert.equal(w.made.ctx, undefined); assert.deepEqual(w.made.fetched, []);
  w.touch();
  assert.equal(s.unlocked, true); assert.equal(w.made.ctx.state, 'running');
});

test('the mute is kept for next time, and survives storage refusing', () => {
  const w = fakeWorld(), s = createSound(data(), { win: w.win });
  s.setMuted(true); assert.equal(w.made.stored['chunky.mute'], '1');
  assert.equal(createSound(data(), { win: w.win }).muted, true);
  const w2 = fakeWorld(); w2.win.localStorage = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  const s2 = createSound(data(), { win: w2.win }); s2.setMuted(true); assert.equal(s2.muted, true);
});

test('a hidden tab stops, plays nothing, and carries on', () => {
  const w = fakeWorld(), s = createSound(data(), { win: w.win }); w.touch();
  w.win.document.hidden = true; w.handlers.visibilitychange();
  assert.equal(w.made.ctx.state, 'suspended'); assert.equal(s.play('ui.tap'), false);
  w.win.document.hidden = false; w.handlers.visibilitychange();
  assert.equal(w.made.ctx.state, 'running'); assert.equal(s.play('ui.tap'), true);
});

test('every touch tries again if an iPhone has stopped it', () => {
  const w = fakeWorld(), s = createSound(data(), { win: w.win }); w.touch();
  w.made.ctx.state = 'interrupted'; w.touch();
  assert.equal(w.made.ctx.state, 'running'); assert.ok(s.unlocked);
});

test('distance takes the sound away and direction sends it to a side', () => {
  const w = fakeWorld(), s = createSound(data(), { win: w.win }); w.touch(); s.update(0, 0, 0);
  const reach = DATA.cues.explosion.reach;
  assert.equal(s.play('explosion', { x: reach + 1, z: 0 }), false);
  assert.ok(s.play('explosion', { x: 20, z: 0 }));
  const near = s.lastHeard('explosion');
  assert.ok(near.pan > 0, 'looking north, east is on the right');
  w.made.ctx.currentTime = 1; s.update(0, 0, Math.PI);
  assert.ok(s.play('explosion', { x: 100, z: 0 }));
  const far = s.lastHeard('explosion');
  assert.ok(far.pan < 0, 'looking south, it\'s on the left'); assert.ok(far.g < near.g);
});

test('there are limits on one sound and on them all, and a phone has lower ones', () => {
  const w = fakeWorld(), s = createSound(data(), { win: w.win }); w.touch();
  assert.ok(s.play('hurt')); assert.equal(s.play('hurt'), false, 'one at a time');
  const phone = fakeWorld({ coarse: true }), p = createSound(data(), { win: phone.win }); phone.touch();
  let n = 0; for (let i = 0; i < 4; i++) { for (const name of p.cueNames()) { if (!name.startsWith('amb') && !name.startsWith('engine') && p.play(name)) n++; } phone.made.ctx.currentTime += 1; }
  assert.equal(n, 12); assert.equal(p.state().voices, 12);
});

test('a sound with a rate plays that much higher and shorter, on top of any rate the game asks for, and nothing else changes', () => {
  const d = data(); Object.assign(d.cues['step.road'], { rate: 1.4, spread: 0 }); d.cues['ui.tap'].spread = 0;
  const w = fakeWorld(), s = createSound(d, { win: w.win }); w.touch();
  const rateOf = () => w.made.sources.at(-1).playbackRate.value, later = () => { w.made.ctx.currentTime += 1; };
  assert.ok(s.play('step.road')); assert.equal(rateOf(), 1.4, 'its own');
  later(); assert.ok(s.play('step.road', { rate: 1.5 })); assert.ok(Math.abs(rateOf() - 2.1) < 1e-9, `${rateOf()} with the game's on top`);
  assert.ok(s.play('ui.tap')); assert.equal(rateOf(), 1, 'and a sound without one is as it was');
});

test('the groan as their hands go up is the hunting groan\'s takes played higher and shorter', () => {
  const { cues } = JSON.parse(readFileSync(new URL('../data/sound-new.json', import.meta.url), 'utf8'));
  assert.deepEqual(cues['groan.reach'].file, cues['groan.hunt'].file); assert.ok(cues['groan.reach'].rate > 1);
});

test('every sound the game asks for is on a sheet, and every one there can be made', () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8'), made = JSON.parse(readFileSync(new URL('../data/sound-new.json', import.meta.url), 'utf8'));
  // A new sound only goes on the new sheet, since nothing writes over the old one. The game can't ask for it on the old sheet and be told off, so it has to be a loop, or go by way of playNew.
  for (const m of page.matchAll(/SFX\.(play|loop)\('([^']+)'/g)) assert.ok(DATA.cues[m[2]] || (m[1] === 'loop' && made.cues[m[2]]), `${m[2]} is on a sheet`);
  for (const m of page.matchAll(/playNew\('([^']+)'/g)) assert.ok(made.cues[m[1]], `${m[1]} is on the new sheet`);
  for (const [name, c] of Object.entries(made.cues)) assert.ok(RECIPES[name] || c.file, `${name} on the new sheet has a recipe or a file`);
  for (const [name, c] of Object.entries(DATA.cues)) assert.ok(RECIPES[name] || c.file, `${name} has a recipe or a file`);
  for (const name of ['groan.low', 'groan.hunt', 'groan.grab', 'rope.creak', 'vehicle.road', 'vehicle.dirt', 'vehicle.skid', 'amb.wind', 'amb.crickets', 'amb.river', 'amb.fire', 'engine.car', 'engine.pickup', 'engine.quad', 'engine.golf']) assert.ok(page.includes(name) || name.startsWith('engine'), name);
  for (const m of page.matchAll(/SFX\.music\('([^']+)'/g)) assert.ok(DATA.music[m[1]], `${m[1]} is part of the score`);
  for (const state of Object.values(page.match(/const SCORE = (\{[^}]+\})/)[1].matchAll(/'(\w+)'/g)).map((m) => m[1])) assert.ok(DATA.music[state], `${state} is part of the score`);
});

test('a sound with a file plays the file, once it comes, with nothing worked out on the way', async () => {
  const d = data(); d.cues['step.road'].file = ['a.mp3', 'b.mp3'];
  const w = fakeWorld({ respond: (f) => tone({ seconds: 1 }) }), s = createSound(d, { win: w.win }); w.touch();
  assert.equal(s.play('step.road'), false, 'nothing while it\'s on its way');
  await w.settle();
  assert.ok(s.play('step.road')); assert.ok(s.state().files.includes('step.road'));
});

test('a file that fails leaves the sound its own, and says so', async () => {
  const d = data(); d.cues['can.clink'].file = 'gone.mp3';
  const w = fakeWorld(), s = createSound(d, { win: w.win }); w.touch(); await w.settle();
  assert.match(w.made.warnings[0], /gone|can\.clink/);
  assert.ok(s.play('can.clink'));
});

test('a file loses its silence and is brought to the peak the recipe has, in one channel unless asked', async () => {
  const d = data(); d.cues['step.road'].file = 'a.mp3'; d.cues.explosion.file = 'b.mp3'; d.cues.explosion.stereo = true; d.cues['amb.wind'].file = 'c.mp3';
  const w = fakeWorld({ respond: (f) => tone({ seconds: 2, lead: .5, tail: .5, amp: .2 }) }), s = createSound(d, { win: w.win }); w.touch(); await w.settle();
  s.play('step.road'); s.play('explosion'); s.loop('amb.wind', 1);
  const buffers = w.made.sources.map((x) => x.buffer).filter(Boolean), [step, boom, wind] = [buffers.find((b) => b.length < 1200 && b.numberOfChannels === 1), buffers.find((b) => b.numberOfChannels === 2 && b.length < 1200), buffers.find((b) => b.length === 2000)];
  assert.ok(step, 'mono and trimmed'); assert.ok(step.length >= 1000 && step.length < 1100, `kept ${step.length}`);
  assert.ok(Math.abs(Math.max(...step.data[0]) - RECIPES['step.road'].peak) < .03);
  assert.ok(boom, 'it kept its two channels');
  assert.ok(wind, 'a loop keeps every sample');
});

test('a loop keeps both its channels, except on a phone, where the memory is better spent', async () => {
  const d = data(); d.cues['amb.wind'].file = 'c.mp3';
  for (const [coarse, chans] of [[false, 2], [true, 1]]) {
    const w = fakeWorld({ coarse, respond: () => tone({ seconds: 2, amp: .2 }) }), s = createSound(d, { win: w.win }); w.touch(); await w.settle();
    s.loop('amb.wind', 1);
    assert.equal(w.made.sources.map((x) => x.buffer).find((b) => b?.length === 2000)?.numberOfChannels, chans);
  }
});

const scored = (extra) => { const d = data(); Object.assign(d.music.title, { file: 'title.mp3' }); Object.assign(d.music.hang, { file: 'title.mp3' }); Object.assign(d.music.town, { file: ['t1.mp3', 't2.mp3'], next: ['chase'] }); Object.assign(d.music.chase, { file: 'chase.mp3' }); Object.assign(d.music.dream, { file: 'dream.mp3', once: true }); extra?.(d); return d; };
const started = (w) => w.made.sources.filter((x) => x.started && x.buffer?.length >= 1000);

test('a track only comes down when it\'s wanted, and runs straight on through what shares it', async () => {
  const w = fakeWorld({ respond: () => tone() }), s = createSound(scored(), { win: w.win }); w.touch(); await w.settle();
  assert.deepEqual(w.made.fetched, ['title.mp3']);
  assert.equal(s.state().track, 'title.mp3'); assert.equal(s.state().layered, false);
  const n = started(w).length;
  s.music('hang'); await w.settle();
  assert.equal(started(w).length, n, 'nothing restarted'); assert.deepEqual(w.made.fetched, ['title.mp3']);
  s.music('town'); await w.settle();
  assert.equal(s.state().track, 't1.mp3');
  assert.ok(w.made.fetched.includes('chase.mp3'), 'what comes next is fetched ahead'); assert.ok(w.made.fetched.includes('t2.mp3'), 'and the next of its list');
});

test('a phone keeps two tracks, anything else four', async () => {
  for (const [coarse, most] of [[true, 2], [false, 4]]) {
    const w = fakeWorld({ coarse, respond: () => tone() }), s = createSound(scored(), { win: w.win }); w.touch(); await w.settle();
    for (const st of ['town', 'chase', 'dream', 'town', 'chase']) { s.music(st); await w.settle(); }
    assert.ok(s.state().tracks.length <= most, `${s.state().tracks.length} of ${most}`);
    assert.equal(s.state().maxTracks, most);
  }
});

test('a track fades into the next of its list when it comes round, skipping the silence at its ends', async () => {
  const w = fakeWorld({ respond: (f) => tone({ seconds: 12, lead: 1, tail: 2 }) }), s = createSound(scored(), { win: w.win }); w.touch(); await w.settle();
  s.music('town'); await w.settle();
  const first = started(w).at(-1);
  assert.ok(Math.abs(first.started.offset - 1) < .1, `starts at ${first.started.offset}`);
  assert.ok(Math.abs(first.started.len - 9) < .1, `plays ${first.started.len}`);
  w.made.ctx.currentTime = 2; s.update(0, 0, 0);
  assert.equal(s.state().rounds, 0);
  w.made.ctx.currentTime = 6; s.update(0, 0, 0);
  assert.equal(s.state().rounds, 1); assert.equal(s.state().track, 't2.mp3');
  const next = started(w).at(-1);
  assert.notEqual(next, first);
  assert.ok(Math.abs(next.started.at - (first.started.at + 9 - 3)) < .01, 'it starts a fade before the end');
});

test('a track stops at a second of quiet near its end, whatever comes back after it, but one earlier on is just a pause', async () => {
  const gap = (from, to) => () => { const b = tone({ seconds: 30 }); for (const d of b.data) d.fill(0, from * 1000, to * 1000); return b; };
  for (const [from, to, plays] of [[24, 28, 24], [5, 8, 30]]) {
    const w = fakeWorld({ respond: gap(from, to) }), s = createSound(scored(), { win: w.win }); w.touch(); await w.settle();
    s.music('town'); await w.settle();
    assert.ok(Math.abs(started(w).at(-1).started.len - plays) < .1, `a gap at ${from} s plays ${started(w).at(-1).started.len} s`);
  }
});

test('a track that\'s only meant to play once doesn\'t come round', async () => {
  const w = fakeWorld({ respond: () => tone({ seconds: 3 }) }), s = createSound(scored(), { win: w.win }); w.touch(); await w.settle();
  s.music('dream'); await w.settle();
  w.made.ctx.currentTime = 30; s.update(0, 0, 0);
  assert.equal(s.state().rounds, 0);
});

test('different tracks come out at the same level, and none can clip', async () => {
  const levels = {};
  for (const amp of [.05, .5]) {
    const w = fakeWorld({ respond: () => tone({ amp }) }), s = createSound(scored(), { win: w.win }); w.touch(); await w.settle();
    const src = started(w).at(-1), level = [...src.out][0];
    levels[amp] = level.gain.value;
    assert.ok(amp * level.gain.value <= .96, 'no clipping');
    assert.equal(s.state().track, 'title.mp3');
  }
  assert.ok(Math.abs(levels[.05] / levels[.5] - 10) < .5, `${levels[.05]} against ${levels[.5]}`);
});

test('the drone stands in for a track until it comes or if it never does, and is let go of when one is on', async () => {
  const d = scored((x) => { x.music.end.file = 'gone.mp3'; });
  const w = fakeWorld({ respond: (f) => (f === 'gone.mp3' ? null : tone()) }), s = createSound(d, { win: w.win }); w.touch();
  assert.equal(s.state().layered, true, 'the drone before the title track comes');
  await w.settle();
  assert.equal(s.state().layered, false); assert.equal(s.state().plugged, true);
  w.made.ctx.currentTime = 6; s.update(0, 0, 0);
  assert.equal(s.state().plugged, false, 'nothing is working it out once it has been quiet a while');
  s.music('end'); await w.settle();
  assert.equal(s.state().track, null); assert.equal(s.state().layered, true); assert.equal(s.state().plugged, true);
  assert.match(w.made.warnings.join(), /gone\.mp3/);
});

test('a voice line shows its words, ducks the rest, only plays once and queues one behind it', async () => {
  const d = data(); d.voice.one = { file: 'one.mp3', text: 'First' }; d.voice.two = { file: 'two.mp3', text: 'Second' };
  const words = [], w = fakeWorld({ respond: () => tone({ seconds: 1 }) }), s = createSound(d, { win: w.win, onLine: (t) => words.push(t) }); w.touch(); await w.settle();
  assert.equal(s.say('nobody-recorded-this'), false);
  assert.ok(s.say('one')); assert.deepEqual(words, ['First']);
  assert.equal(s.state().speaking, 'one');
  assert.equal(s.say('two'), false, 'it waits its turn');
  w.made.sources.at(-1).onended();
  assert.deepEqual(words, ['First', null, 'Second']);
  w.made.sources.at(-1).onended();
  assert.equal(s.state().speaking, null);
  assert.equal(s.say('one'), false, 'once only'); assert.ok(s.say('one', { again: true }));
});

test('nothing that goes wrong in here can reach the game', () => {
  const w = fakeWorld(), errors = []; w.win.console.error = (m) => errors.push(m);
  const s = createSound(data(), { win: w.win }); w.touch();
  w.made.ctx.createBufferSource = () => { throw new Error('this browser says no'); };
  assert.equal(s.play('ui.tap'), false);
  assert.doesNotThrow(() => { w.made.ctx.currentTime += 1; s.play('hurt'); s.loop('amb.wind', 1); s.update(0, 0, 0); s.music('town'); s.fade('ambience', .5); s.say('x'); s.setMuted(true); });
  assert.deepEqual(errors, ['Sound: this browser says no'], 'and it says so, once');
});

test('with no sheet the game still runs, in silence', async () => {
  const real = globalThis.fetch, oldError = console.error; globalThis.fetch = async () => { throw new Error('offline'); }; console.error = () => {};
  try {
    const w = fakeWorld(), s = await loadSound('data/sound.json', { win: w.win }); w.touch();
    assert.equal(s.play('step.road'), false); assert.doesNotThrow(() => { s.loop('amb.wind', 1); s.music('town'); s.update(0, 0, 0); });
  } finally { globalThis.fetch = real; console.error = oldError; }
});

test('it takes the first sheet that loads', async () => {
  const real = globalThis.fetch, oldError = console.error, asked = [];
  globalThis.fetch = async (url) => { asked.push(url); return url === 'old.json' ? { ok: true, json: async () => data() } : { ok: false, status: 404 }; }; console.error = () => {};
  try {
    const w = fakeWorld(), s = await loadSound(['new.json', 'old.json'], { win: w.win });
    assert.deepEqual(asked, ['new.json', 'old.json']); assert.ok(s.cueNames().length > 0);
    asked.length = 0; await loadSound('old.json', { win: fakeWorld().win });
    assert.deepEqual(asked, ['old.json'], 'and the old sheet alone never looks for the new one');
  } finally { globalThis.fetch = real; console.error = oldError; }
});

test('no recording, no line: the game has none written for him', () => {
  assert.deepEqual(DATA.voice, {});
});
