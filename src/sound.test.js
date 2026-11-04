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

test('a loop turned all the way down on its sheet never starts, and one that isn\'t does', async () => {
  const d = data(); d.cues['amb.wind'].file = 'c.mp3'; d.cues['amb.wind'].gain = 0; d.cues['amb.crickets'].file = 'd.mp3';
  const w = fakeWorld({ respond: () => tone({ seconds: 2, amp: .2 }) }), s = createSound(d, { win: w.win }); w.touch(); await w.settle();
  s.loop('amb.wind', 1); s.loop('amb.crickets', 1);
  assert.deepEqual(s.state().loops, ['amb.crickets']);
});

test('a loop that dies away a little at a time still goes quiet, and is let go of', async () => {
  const d = data(); d.cues['vehicle.dirt'] = { gain: 1, file: 'v.mp3' };
  const w = fakeWorld({ respond: () => tone({ seconds: 2, amp: .2 }) }), s = createSound(d, { win: w.win }); w.touch(); await w.settle(); s.update(0, 0, 0);
  // a pickup rolling to a stop on the dirt, where the last step down is less than a loop bothers with
  for (const k of [.4, .2, .05, .01, .003, 0]) s.loop('vehicle.dirt', k);
  assert.equal(s.state().loopLevels['vehicle.dirt'], 0);
  w.made.ctx.currentTime = 3; s.update(0, 0, 0);
  assert.deepEqual(s.state().loops, []);
});

test('a horn is blown as its notes: the steady part of its take held for each, rests between, and it\'s one sound until the echo after the last is gone', async () => {
  const d = data(); d.cues['train.horn'] = { gain: .5, reach: 1200, max: 1, gap: 1, file: 'h.mp3', stereo: true, held: [.1, 2.3], notes: [2, 2, .7, 2.1], rest: .55, echo: .3 };
  const w = fakeWorld({ respond: () => tone({ seconds: 7 }) }), s = createSound(d, { win: w.win }); w.touch(); await w.settle(); s.update(0, 0, 0);
  const before = w.made.sources.length;
  assert.ok(s.play('train.horn', { x: 100, z: 0 }));
  const notes = w.made.sources.slice(before), starts = notes.map((n) => n.started.at);
  assert.equal(notes.length, 4);
  assert.deepEqual(starts.slice(1).map((t, i) => +(t - starts[i]).toFixed(2)), [2.55, 2.55, 1.25], 'long, long, short, long, with .55 s between');
  for (const n of notes) assert.deepEqual([n.started.offset, n.loop, n.loopStart, n.loopEnd], [.1, true, .1, 2.3]);
  assert.ok(notes[2].stopped - starts[2] < 1.1, 'the short one stops short');
  assert.ok(notes[3].stopped - starts[3] > 2.1 + 2, 'the last one waits out the echo');
  assert.equal(s.lastHeard('train.horn').notes, 4);
  assert.equal(s.play('train.horn', { x: 100, z: 0 }), false, 'one at a time');
  for (const n of notes.slice(0, 3)) n.onended();
  assert.equal(s.state().voices, 1, 'it\'s still blowing');
  notes[3].onended();
  assert.equal(s.state().voices, 0, 'and it\'s over when the last note and its echo are');
});

test('no note on the new sheet is longer than the steady part it holds, so none goes round with a click', () => {
  const made = JSON.parse(readFileSync(new URL('../data/sound-new.json', import.meta.url), 'utf8'));
  const blown = Object.entries(made.cues).filter(([, c]) => c.notes);
  assert.ok(blown.some(([name]) => name === 'train.horn'), 'the horn is blown as notes');
  for (const [name, c] of blown) for (const n of c.notes) assert.ok(c.held[1] > c.held[0] && n <= c.held[1] - c.held[0], `${name}'s ${n} s note fits in what it holds`);
  const horn = made.cues['train.horn'], at = (d) => horn.gain * Math.max(0, 1 - d / horn.reach) ** 2;
  assert.deepEqual(horn.notes.map((n) => (n > 1.5 ? 'long' : 'short')), ['long', 'long', 'short', 'long']);
  assert.ok(at(1000) > 0 && at(1000) < at(400) / 10 && at(1500) === 0, 'it\'s loud close by, faint from a kilometre off and gone past that');
});

test('the player\'s own levels for the effects and the night noise go on top of the sheet\'s, and are kept for next time', () => {
  const w = fakeWorld(), s = createSound(data(), { win: w.win }); w.touch();
  s.setLevel('ambience', .25); s.setLevel('effects', 1.7); s.setLevel('nonsense', .5);
  assert.deepEqual([s.levelOf('ambience'), s.levelOf('effects'), s.levelOf('music')], [.25, 1, 1]);
  assert.deepEqual(JSON.parse(w.made.stored['chunky.levels']), { ambience: .25, effects: 1 });
  const again = createSound(data(), { win: w.win }); w.touch();
  assert.equal(again.levelOf('ambience'), .25);
  assert.ok(Math.abs(again.state().levels.ambience - DATA.levels.ambience * .25) < 1e-3, 'the night\'s down from the start');
  assert.ok(Math.abs(again.state().levels.effects - DATA.levels.effects) < 1e-3, 'and nothing else is');
});

test('levels that can\'t be kept, or that were kept wrong, are forgotten rather than trouble', () => {
  const w = fakeWorld(); w.win.localStorage = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  const s = createSound(data(), { win: w.win }); w.touch(); s.setLevel('ambience', .5);
  assert.equal(s.levelOf('ambience'), .5);
  const w2 = fakeWorld(); w2.made.stored['chunky.levels'] = '{nope'; assert.equal(createSound(data(), { win: w2.win }).levelOf('ambience'), 1);
  const w3 = fakeWorld(); w3.made.stored['chunky.levels'] = '{"ambience":"loud","effects":-3}';
  const s3 = createSound(data(), { win: w3.win }); assert.deepEqual([s3.levelOf('ambience'), s3.levelOf('effects')], [1, 0]);
});

test('the night never takes the last four sounds at once, so a horn or a crash is always heard', () => {
  const d = data(); Object.assign(d.cues['frog.a'], { max: 30, gap: 0 }); Object.assign(d.cues.explosion, { max: 30, gap: 0 });
  const w = fakeWorld({ coarse: true }), s = createSound(d, { win: w.win }); w.touch();
  let frogs = 0; for (let i = 0; i < 30; i++) if (s.play('frog.a')) frogs++;
  assert.equal(frogs, 12 - 4, 'the frogs stop with four to spare on a phone');
  let booms = 0; for (let i = 0; i < 30; i++) if (s.play('explosion')) booms++;
  assert.equal(booms, 4, 'and those four are there for the rest');
});

test('how long a go at a sound lasts is known once its file is in', async () => {
  const d = data(); d.cues['step.road'].file = ['a.mp3', 'b.mp3'];
  const w = fakeWorld({ respond: (f) => tone({ seconds: f === 'a.mp3' ? 1 : 1.5 }) }), s = createSound(d, { win: w.win }); w.touch();
  assert.equal(s.lengthOf('step.road'), null, 'not while it\'s on its way');
  await w.settle();
  assert.ok(Math.abs(s.lengthOf('step.road') - 1.5) < .05, `${s.lengthOf('step.road')}`);
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

// The buses as they're made, which are the four gains after the master's, in BUSES' order, to see where they're headed
function withBuses(w) {
  const gains = [], C = w.win.AudioContext;
  w.win.AudioContext = class extends C { createGain() { const g = super.createGain(); gains.push(g); return g; } };
  return () => ({ master: gains[0], music: gains[1], ambience: gains[2], effects: gains[3], voice: gains[4] });
}

test('somebody\'s own clip plays once from where it is, as loud as a voice line, with the night and the crowd dipped under it', async () => {
  const w = fakeWorld({ respond: (f) => (f === 'stone.mp3' ? tone({ seconds: 3, amp: .3 }) : null) }), buses = withBuses(w), s = createSound(data(), { win: w.win }); w.touch(); await w.settle();
  // each bus as it was made, and then where it's headed each time it's changed
  const B = buses(), level = (b) => B[b].gain.target, before = Object.fromEntries(['music', 'ambience', 'effects', 'voice'].map((b) => [b, B[b].gain.value]));
  s.update(0, 0, 0);
  assert.ok(s.clip('stone.mp3', { x: 3, z: 0 })); await w.settle();
  const src = w.made.sources.at(-1), c = () => s.state().clips['stone.mp3'];
  assert.ok(src.started && src.buffer.duration === 3 && c().playing);
  const amp = [...src.out][0], pan = [...amp.out][0], out = [...pan.out][0];
  assert.ok(out.out.has(B.master), 'it goes straight to the master, so the mute has it');
  assert.ok(level('ambience') < before.ambience * .6 && level('effects') < before.effects * .8 && level('music') < before.music, 'the night and the crowd dip under it');
  assert.equal(level('voice'), before.voice);
  assert.equal(s.clip('stone.mp3', { x: 3, z: 0 }), false, 'wanted again while it\'s going, it carries on');
  assert.equal(w.made.sources.at(-1), src, 'and isn\'t started over or twice');
  const near = c().gain; s.update(18, 0, 0);
  assert.ok(c().gain < near / 3 && c().gain > 0, `quieter as he walks off: ${near} to ${c().gain}`);
  s.update(40, 0, 0); assert.equal(c().gain, 0, 'and gone past where it reaches');
  const was = out.gain.target; s.setLevel('effects', .5);
  assert.ok(Math.abs(out.gain.target - was / 2) < 1e-9, 'it\'s turned down with the effects');
  s.setLevel('effects', 1);
  src.onended();
  assert.ok(!c().playing && s.state().clipping === 0);
  for (const b of Object.keys(before)) assert.ok(Math.abs(level(b) - before[b]) < 1e-9, `${b} comes back up after`);
  assert.ok(s.clip('stone.mp3'), 'and it can be played again once it\'s done'); assert.notEqual(w.made.sources.at(-1), src);
  assert.deepEqual(w.made.fetched.filter((f) => f === 'stone.mp3'), ['stone.mp3'], 'it\'s only ever asked for once');
});

test('a clip that isn\'t there plays nothing and says nothing, however often it\'s wanted', async () => {
  const w = fakeWorld(), errors = []; w.win.console.error = (m) => errors.push(m);
  const s = createSound(data(), { win: w.win }); w.touch(); await w.settle();
  const made = w.made.sources.length, warned = w.made.warnings.length;
  s.clip('stone.mp3'); await w.settle();
  for (let i = 0; i < 3; i++) assert.equal(s.clip('stone.mp3'), false);
  assert.equal(w.made.sources.length, made); assert.equal(s.state().clipping, 0);
  assert.equal(s.state().clips['stone.mp3'].there, false);
  assert.deepEqual([errors, w.made.warnings.slice(warned)], [[], []]);
  assert.deepEqual(w.made.fetched.filter((f) => f === 'stone.mp3'), ['stone.mp3'], 'and it\'s only asked for once');
});

test('a clip wanted while it\'s on its way plays once it comes, and only once', async () => {
  const w = fakeWorld({ respond: (f) => (f === 'stone.mp3' ? tone({ seconds: 2 }) : null) }), s = createSound(data(), { win: w.win }); w.touch(); await w.settle();
  const made = w.made.sources.length;
  assert.ok(s.clip('stone.mp3')); assert.ok(s.clip('stone.mp3')); await w.settle();
  assert.equal(w.made.sources.length, made + 1);
});

test('a clip from nowhere is as loud wherever he is, and in the middle', async () => {
  const w = fakeWorld({ respond: (f) => (f === 'stone.mp3' ? tone({ seconds: 3, amp: .3 }) : null) }), s = createSound(data(), { win: w.win }); w.touch(); await w.settle();
  s.update(0, 0, 0); assert.ok(s.clip('stone.mp3')); await w.settle();
  const c = () => s.state().clips['stone.mp3'], here = c().gain;
  for (const [x, z, yaw] of [[30, 0, 0], [0, -500, 1.2], [-80, 60, 3]]) { s.update(x, z, yaw); assert.equal(c().gain, here, `as loud at ${x}, ${z}`); assert.equal(w.made.lastPanner.pan.target, 0, 'and in the middle'); }
});

test('a clip fades away by as much of it as it\'s asked for, everything else comes back up as it does, and none of it stops it', async () => {
  const w = fakeWorld({ respond: (f) => (f === 'stone.mp3' ? tone({ seconds: 3, amp: .3 }) : null) }), buses = withBuses(w), s = createSound(data(), { win: w.win }); w.touch(); await w.settle();
  // the night noise where the sheet has it, with nothing dipping it
  s.setLevel('ambience', 1);
  const B = buses(), level = (b) => B[b].gain.target, before = level('ambience');
  s.update(0, 0, 0); s.clip('stone.mp3'); await w.settle();
  const src = w.made.sources.at(-1), c = () => s.state().clips['stone.mp3'], all = c().gain, under = level('ambience');
  assert.ok(under < before * .6, 'the night noise dips under all of it');
  s.fadeClip('stone.mp3', .5); s.update(0, 0, 0);
  assert.ok(Math.abs(c().gain - all / 2) < .002, `half of it is half as loud: ${all} to ${c().gain}`);
  assert.ok(Math.abs(level('ambience') - (before + under) / 2) < 1e-9, 'and the night noise is half way back up');
  assert.equal(s.state().aim.ambience, +level('ambience').toFixed(3), 'and it says that\'s where the night noise is headed');
  s.fadeClip('stone.mp3', 1); s.update(0, 0, 0);
  assert.ok(c().gain === all && level('ambience') === under, 'and all of it again is as it was');
  s.fadeClip('stone.mp3', 0);
  assert.ok('stopped' in src, 'none of it stops it');
  src.onended();
  assert.ok(!c().playing && s.state().clipping === 0 && level('ambience') === before);
  assert.ok(s.clip('stone.mp3'), 'and asked for again, it starts again'); assert.notEqual(w.made.sources.at(-1), src);
  assert.equal(c().much, 1, 'all of it');
});

test('a clip faded to nothing before it comes in doesn\'t start when it does', async () => {
  const w = fakeWorld({ respond: (f) => (f === 'stone.mp3' ? tone({ seconds: 2 }) : null) }), s = createSound(data(), { win: w.win }); w.touch(); await w.settle();
  const made = w.made.sources.length;
  s.clip('stone.mp3'); s.fadeClip('stone.mp3', 0); await w.settle();
  assert.equal(w.made.sources.length, made);
  assert.ok(s.clip('stone.mp3'), 'and asked for after, it starts'); assert.equal(w.made.sources.length, made + 1);
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
