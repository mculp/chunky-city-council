// What makes the noise: the levels, the mute, the sounds, the loops, the score and the voice lines. There's no three.js in here and nothing about the game.
//
// A sheet like data/sound-new.json says what each sound is and how loud, and src/soundbank.js works out any that has no file of its own. data/sound.md has the rest.
import { RATE, RECIPES, randomFrom, render, variantsOf } from './soundbank.js';

const BUSES = ['music', 'ambience', 'effects', 'voice'];
// D minor pentatonic, as the pitch of the one plucked note in the bank, which is an A at 110 Hz
const NOTE = { A2: 1, C3: 1.189, D3: 1.335, F3: 1.587, G3: 1.782, A3: 2, C4: 2.378, D4: 2.67 };
const PHRASES = [
  [['D3', 0], ['F3', 1.2], ['G3', 1.8, 'A3'], ['D3', 3.6]],
  [['A2', 0], ['D3', .9], ['C3', 2.4, 'D3']],
  [['A3', 0, 'C4'], ['G3', 1.6], ['F3', 2.4], ['D3', 3.4]],
  [['D4', 0, 'C4'], ['A3', 1.4], ['G3', 2.2, 'F3']],
  [['D3', 0], ['D3', .5], ['F3', 1.5, 'G3'], ['C3', 3.2], ['D3', 4]],
];
const ROOTS = [1, 1, 1.189, .891];   // the low bowed part: D, D, F, C, as rates of the D in the bank
const LOOP_FADE = 5;                 // how long a track takes to fade into itself each time it comes round
const TRACK_RMS = .1, VOICE_RMS = .126;
// how many sounds at once the night always leaves for everything else, so the frogs and crickets can't keep a horn or a crash from being heard
const NIGHT_LEAVES = 4;
const FADE_IN = Float32Array.from({ length: 32 }, (_, i) => Math.sin(i / 31 * Math.PI / 2)), FADE_OUT = FADE_IN.slice().reverse();
const silentWav = () => {
  // half a second of nothing, for the element that holds an iPhone's audio session open
  const n = 4000, b = new Uint8Array(44 + n), v = new DataView(b.buffer), put = (at, s) => [...s].forEach((c, i) => { b[at + i] = c.charCodeAt(0); });
  put(0, 'RIFF'); v.setUint32(4, 36 + n, true); put(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); put(36, 'data'); v.setUint32(40, n, true); b.fill(128, 44);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...b))}`;
};

// `win` is the page, or something shaped like it for a test. `onLine` is told a voice line's words when one starts, and null when it's over.
export function createSound(data, { win = globalThis, onLine = () => {}, seed = 20261101 } = {}) {
  const rand = randomFrom(seed), defaults = data.defaults ?? {}, buffers = new Map(), files = new Map(), loops = new Map(), last = new Map(), playing = new Map(), queue = [], heard = [], said = new Set();
  // A long track takes a lot of memory once it's decoded, about 57 MB for two and a half minutes, so a phone only keeps the last two
  const coarse = !!win.matchMedia?.('(pointer:coarse)').matches, MAX_VOICES = coarse ? 12 : 20, MAX_TRACKS = coarse ? 2 : 4;
  const tracks = new Map(), waitingFor = new Set(), loadQueue = [], voiceLevel = new Map();
  let deck = null, loading = 0, startedAt = -Infinity;
  const levels = { ...data.levels }, L = { x: 0, z: 0, yaw: 0 };
  const fades = {};
  // Somebody's own recordings, by file, which might not be there: whether each one came, how loud it is, and where it's playing from while it is (clip)
  const clips = new Map();
  let clipping = 0;
  // how far up the player has a bus, from 0 to 1 of what the sheet says, kept for next time like the mute
  let mine = {};
  let ctx = null, master = null, buses = {}, voices = 0, muted = false, wanted = 'title', score = null, keepAlive = null, hidden = !!win.document?.hidden, speaking = null, nextLine = null, meterNode = null;
  try { muted = win.localStorage?.getItem('chunky.mute') === '1'; } catch { /* a private window can refuse */ }
  try { const kept = JSON.parse(win.localStorage?.getItem('chunky.levels') ?? '{}'); for (const b of BUSES) if (Number.isFinite(kept?.[b])) mine[b] = Math.max(0, Math.min(1, kept[b])); } catch { mine = {}; }

  // Sound must never be what stops the game, so nothing in here gets to throw into it. It says so, once for each different complaint.
  const said_ = new Set(), complain = (kind, why) => { if (!said_.has(why)) { said_.add(why); win.console?.[kind](`Sound: ${why}`); } };
  const guarded = (f, otherwise = false) => (...args) => { try { return f(...args); } catch (e) { complain('error', e.message); return otherwise; } };
  const cueOf = (name) => { const c = data.cues[name]; return c ? { ...defaults, ...c } : null; };
  const smooth = (param, value, seconds) => { const now = ctx.currentTime; param.cancelScheduledValues(now); param.setTargetAtTime(value, now, seconds); };
  // Everything but the voices dips all the way under a voice line, and under somebody's clip by as much of it as there is, so that it comes back up as one fades away
  const dipBy = () => { let k = speaking ? 1 : 0; for (const c of clips.values()) if (c.src) k = Math.max(k, c.much); return k; };
  const busGain = (b) => (levels[b] ?? 1) * (mine[b] ?? 1) * (fades[b] ?? 1) * (b === 'voice' ? 1 : 1 - (1 - (data.duck?.[b] ?? 1)) * dipBy());

  function toBuffer(samples) { const b = ctx.createBuffer(1, samples.length, RATE); b.getChannelData(0).set(samples); return b; }
  // A sound's takes: its file's if that's come in, or the bank's, worked out now if it hasn't been already
  function takesOf(name) {
    if (files.has(name)) return files.get(name);
    // its file's on the way, so nothing this time, rather than working one out now and holding up a frame
    if (waitingFor.has(name)) return null;
    let list = buffers.get(name);
    if (!list) { if (!RECIPES[name]) return null; list = []; buffers.set(name, list); }
    const n = variantsOf(name);
    for (let v = 0; v < n; v++) if (!list[v]) list[v] = toBuffer(render(name, v));
    return list;
  }
  // Only as much of the bank as fits in a frame, so that it can't hold the opening up
  function workOnQueue() {
    const t0 = win.performance.now();
    while (queue.length) {
      const [name, v] = queue.shift();
      let list = buffers.get(name); if (!list) buffers.set(name, list = []);
      if (!list[v] && !files.has(name)) list[v] = toBuffer(render(name, v));
      if (win.performance.now() - t0 > 3) break;
    }
  }
  const queueRecipe = (name) => { for (let v = 0; v < variantsOf(name); v++) queue.push([name, v]); };
  const decode = (bytes) => new Promise((ok, no) => ctx.decodeAudioData(bytes, ok, no));
  async function load(file) {
    const res = await win.fetch(file);
    if (!res.ok) throw new Error(`${res.status}`);
    return decode(await res.arrayBuffer());
  }
  // Four at a time, so that a pile of little sounds can't hold up a track
  function pump() { while (loading < 4 && loadQueue.length) { loading++; loadQueue.shift()().finally(() => { loading--; pump(); }); } }
  const inTurn = (file) => new Promise((ok, no) => { loadQueue.push(() => load(file).then(ok, no)); pump(); });
  // How a file gets to sit with the rest, so that swapping one in takes only the file and a line: the silence off its ends, its peak where the bank's would be, and one channel
  // unless it's been asked to keep two, or it's a loop on something with the memory for two
  function shaped(b, name) {
    const c = data.cues[name] ?? {}, loop = c.loop ?? RECIPES[name]?.loop, chans = Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i)), n = b.length;
    let peak = 0, first = n, end = 0;
    for (const d of chans) for (let i = 0; i < n; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
    if (peak < 1e-4) return b;
    const floor = peak * .01, k = (c.peak ?? RECIPES[name]?.peak ?? .9) / peak, rate = b.sampleRate;
    for (const d of chans) for (let i = 0; i < n; i++) if (Math.abs(d[i]) > floor) { if (i < first) first = i; if (i > end) end = i; }
    const from = loop ? 0 : Math.max(0, first - Math.floor(rate * .004)), to = loop ? n : Math.min(n, end + Math.floor(rate * .03)), both = (loop && !coarse) || c.stereo, out = ctx.createBuffer(both ? chans.length : 1, to - from, rate);
    for (let ch = 0; ch < out.numberOfChannels; ch++) {
      const o = out.getChannelData(ch), each = both ? [chans[ch]] : chans, tail = loop ? 0 : Math.min(to - from, Math.floor(rate * .012));
      for (let i = 0, m = to - from; i < m; i++) { let s = 0; for (const d of each) s += d[from + i]; o[i] = s / each.length * k * (i > m - tail ? (m - i) / tail : 1); }
    }
    return out;
  }
  const loadFor = (name, list, shape = (b) => b) => {
    waitingFor.add(name);
    return Promise.all([list].flat().map(inTurn)).then((b) => files.set(name, b.map((x) => shape(x, name)))).catch((e) => {
      win.console?.warn(`Couldn't load the file for ${name}, so it'll use its own: ${e.message}`);
      if (RECIPES[name]) queueRecipe(name);
    }).finally(() => waitingFor.delete(name));
  };
  // How loud a track or a line really is, where it starts and where it stops. A look at every 32nd sample is plenty and hardly costs anything.
  function measure(b) {
    const l = b.getChannelData(0), r = b.getChannelData(b.numberOfChannels - 1);
    let sum = 0, m = 0, peak = 0, first = -1, last = 0;
    // A generated track can fade out and then have a few seconds of noise on the end. A full second of quiet near the end is where the music stops.
    const tail = b.length - b.sampleRate * 15;
    for (let i = 0; i < b.length; i += 32) {
      const a = Math.max(Math.abs(l[i]), Math.abs(r[i]));
      if (first >= 0 && i > tail && i - last > b.sampleRate) break;
      if (a > peak) peak = a;
      sum += a * a; m++;
      if (a > .003) { if (first < 0) first = i; last = i; }
    }
    return { rms: Math.sqrt(sum / Math.max(1, m)) || 1e-4, peak: peak || 1, from: Math.max(0, first) / b.sampleRate, to: Math.max(last + 32, 1) / b.sampleRate };
  }
  // A track by its file, with the most recently wanted last and the oldest forgotten. Anything still playing keeps its own hold on the sound.
  function trackOf(file) {
    let t = tracks.get(file);
    if (t) { tracks.delete(file); tracks.set(file, t); return t.ready; }
    t = { file, buffer: null };
    t.ready = load(file).then((b) => { const m = measure(b); Object.assign(t, m, { buffer: b, k: Math.min(TRACK_RMS / m.rms, .95 / m.peak) }); return t; });
    t.ready.catch(() => tracks.delete(file));
    tracks.set(file, t);
    for (const old of tracks.keys()) { if (tracks.size <= MAX_TRACKS) break; if (old !== file) tracks.delete(old); }
    return t.ready;
  }

  function buildScore() {
    const out = ctx.createGain(); out.connect(buses.music);
    const layer = (to = out) => { const g = ctx.createGain(); g.gain.value = 0; g.connect(to); return g; };
    const osc = (type, f, to, detune = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; o.connect(to); o.start(); return o; };
    // the low drone, with its filter opening and closing very slowly, and able to go out of tune for the fever
    const bed = layer(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = .7; lp.connect(bed);
    const bedGain = ctx.createGain(); bedGain.gain.value = .32; bedGain.connect(lp);
    const lows = [['sawtooth', 73.42, -5], ['sawtooth', 73.42, 6], ['triangle', 110, 0], ['sine', 36.71, 0], ['sawtooth', 146.83, 3]].map(([t, f, d]) => osc(t, f, bedGain, d));
    const sweep = ctx.createGain(); sweep.gain.value = 120; sweep.connect(lp.frequency); osc('sine', .047, sweep);
    const wobble = ctx.createGain(); wobble.gain.value = 0; for (const o of lows) wobble.connect(o.detune); osc('sine', .31, wobble);
    // the high thin part
    const air = layer(), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = .8; bp.connect(air);
    for (const [f, rate] of [[293.66, .07], [440, .11], [523.25, .09]]) {
      const g = ctx.createGain(); g.gain.value = .07; g.connect(bp); osc('triangle', f, g);
      const lfo = ctx.createGain(); lfo.gain.value = .05; lfo.connect(g.gain); osc('sine', rate, lfo);
    }
    // the slide guitar, with an echo that's all it has for a room
    const guitar = layer(), echo = ctx.createDelay(1), back = ctx.createGain(), dark = ctx.createBiquadFilter();
    echo.delayTime.value = .42; back.gain.value = .36; dark.type = 'lowpass'; dark.frequency.value = 1400;
    guitar.connect(echo); echo.connect(dark); dark.connect(back); back.connect(echo); dark.connect(out);
    const pulse = layer();
    return { out, layers: { bed, air, guitar, pulse }, wobble, nextBeat: 0, beat: 0, nextPhrase: 0, state: null, plugged: true, layered: false, quietSince: ctx.currentTime };
  }
  // A plucked note at a time ahead, sliding up to where it's going if it's going anywhere
  function pluck(at, note, to, gain) {
    const b = takesOf('music.pluck')[0], s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; g.gain.value = gain;
    s.playbackRate.setValueAtTime(NOTE[note], at); if (to) { s.playbackRate.setValueAtTime(NOTE[note], at + .05); s.playbackRate.linearRampToValueAtTime(NOTE[to], at + .28); }
    s.connect(g); g.connect(score.layers.guitar); s.start(at); s.onended = () => { s.disconnect(); g.disconnect(); };
  }
  function partAt(name, at, rate, gain, to) {
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = takesOf(name)[0]; s.playbackRate.value = rate; g.gain.value = gain;
    s.connect(g); g.connect(to); s.start(at); s.onended = () => { s.disconnect(); g.disconnect(); };
  }
  function runScore() {
    if (!score) return;
    const now = ctx.currentTime, st = data.music[score.state] ?? {};
    if (deck && now >= deck.comesRound - .3) {
      const i = (deck.i + 1) % deck.list.length, ready = tracks.get(deck.list[i]), next = ready?.buffer ? ready : deck.now.t, at = deck.comesRound, fade = deck.fade;
      deck.now.fader.gain.setValueCurveAtTime(FADE_OUT, Math.max(at, now), fade);
      if (ready?.buffer) deck.i = i;
      deck.rounds++;
      playOn(deck, next, at, fade);
      if (deck.list.length > 1) trackOf(deck.list[(deck.i + 1) % deck.list.length]).catch(() => {});
    }
    // nothing's listening to the drone while a track's on, so nothing has to work it out
    if (score.plugged && now - score.quietSince > 5) { score.out.disconnect(); score.plugged = false; }
    if (!score.layered) return;
    if ((st.pulse ?? 0) > 0) {
      const beat = 60 / (st.bpm ?? 90);
      if (score.nextBeat < now) score.nextBeat = now + .05;
      while (score.nextBeat < now + .25) {
        const at = score.nextBeat, i = score.beat++;
        if (i % 2 === 0) partAt('music.thump', at, 1, 1, score.layers.pulse);
        else partAt('music.tick', at, 1, .5, score.layers.pulse);
        if (i % 4 === 0) partAt('music.bow', at, ROOTS[(i / 4) % ROOTS.length], .55, score.layers.pulse);
        score.nextBeat += beat;
      }
    }
    if ((st.guitar ?? 0) > 0 && now >= score.nextPhrase) {
      const phrase = PHRASES[Math.floor(rand() * PHRASES.length)], at = now + .1;
      for (const [note, t, to] of phrase) pluck(at + t, note, to, .75 + rand() * .25);
      score.nextPhrase = at + phrase.at(-1)[1] + 6 + rand() * 9;
    }
  }
  function layersTo(st) {
    if (!score.plugged) { score.out.connect(buses.music); score.plugged = true; }
    for (const [k, g] of Object.entries(score.layers)) smooth(g.gain, st[k] ?? 0, st.quick ? .05 : .9);
    smooth(score.wobble.gain, (st.wobble ?? 0) * 60, 1);
    score.layered = Object.keys(score.layers).some((k) => (st[k] ?? 0) > 0);
    score.quietSince = score.layered ? Infinity : ctx.currentTime;
  }
  // One go at a track, into whichever deck it's for. It's held at the level that track needs, stops where its sound stops, and says when it's due to come round.
  function playOn(d, t, at, fade) {
    const src = ctx.createBufferSource(), level = ctx.createGain(), fader = ctx.createGain();
    src.buffer = t.buffer; level.gain.value = t.k; src.connect(level); level.connect(fader); fader.connect(d.gain);
    const len = t.to - t.from;
    // a curve can't overlap the one that fades it out, which throws, so it's never over a third of the track
    if (fade) fader.gain.setValueCurveAtTime(FADE_IN, Math.max(at, ctx.currentTime), Math.min(fade, len / 3));
    src.start(at, t.from, len);
    src.onended = () => { src.disconnect(); level.disconnect(); fader.disconnect(); };
    d.now = { src, fader, t };
    d.fade = Math.min(LOOP_FADE, len / 3);
    d.comesRound = d.once ? Infinity : at + len - d.fade;
  }
  function stopDeck(seconds) {
    if (!deck) return;
    const old = deck; deck = null;
    smooth(old.gain.gain, 0, seconds / 3);
    old.now.src.onended = () => old.gain.disconnect();
    old.now.src.stop(ctx.currentTime + seconds * 1.5);
  }
  function startDeck(state, st, list, t) {
    stopDeck(st.quick ? .05 : 1.5);
    layersTo({});
    const d = { state, list, i: 0, rounds: 0, once: !!st.once, gain: ctx.createGain(), fade: LOOP_FADE, comesRound: Infinity, now: null };
    d.gain.gain.value = 0; d.gain.connect(buses.music); smooth(d.gain.gain, st.gain ?? 1, st.quick ? .03 : .5);
    playOn(d, t, ctx.currentTime + .02, 0);
    deck = d;
    if (list.length > 1) trackOf(list[1]).catch(() => {});
  }
  function toScoreState(state) {
    if (!ctx || !score || score.state === state) return;
    score.state = state; const st = data.music[state] ?? {}, list = [st.file ?? []].flat();
    for (const next of st.next ?? []) for (const f of [data.music[next]?.file ?? []].flat()) trackOf(f).catch(() => {});
    if (!list.length) { stopDeck(st.quick ? .05 : 1.5); layersTo(st); return; }
    // several parts of the game can share a track, and it just runs on through them at each one's level
    if (deck && list.includes(deck.now.t.file)) { smooth(deck.gain.gain, st.gain ?? 1, st.quick ? .03 : .5); deck.list = list; deck.state = state; return; }
    // what's on carries on until the new one's here, or the drone if nothing's on, which is what's left if it never comes
    if (!deck) layersTo(st);
    trackOf(list[0]).then((t) => { if (score.state === state && deck?.state !== state) startDeck(state, st, list, t); }).catch((e) => {
      win.console?.warn(`Couldn't load ${list[0]}, so ${state} will use its own: ${e.message}`);
      if (score.state === state) { stopDeck(1.5); layersTo(st); }
    });
  }

  // A sound blown as notes, the way a train blows for a crossing: long, long, short, long. Each note holds the steady stretch of the take, `held`, going round it if the
  // note's longer than that, and lets go, with `rest` between them. A take's own echo is at its end, past what's held, so an `echo` that many seconds behind comes back
  // off the woods after each note instead. `out` is where it goes after its level.
  function blow(take, c, rate, amp, out, done) {
    const [from, to] = c.held ?? [0, take.duration], rest = c.rest ?? .5, tail = [];
    if (c.echo) {
      const delay = ctx.createDelay(2), dark = ctx.createBiquadFilter(), back = ctx.createGain(), wet = ctx.createGain();
      delay.delayTime.value = c.echo; dark.type = 'lowpass'; dark.frequency.value = 1400; back.gain.value = .35; wet.gain.value = .45;
      amp.connect(delay); delay.connect(dark); dark.connect(back); back.connect(delay); dark.connect(wet); wet.connect(out);
      tail.push(delay, dark, back, wet);
    }
    let at = ctx.currentTime + .03;
    c.notes.forEach((len, i) => {
      const src = ctx.createBufferSource(), env = ctx.createGain(), final = i === c.notes.length - 1;
      src.buffer = take; src.playbackRate.value = rate; src.loop = true; src.loopStart = from; src.loopEnd = to;
      env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(1, at + .06); env.gain.setValueAtTime(1, at + len); env.gain.setTargetAtTime(0, at + len, .05);
      src.connect(env); env.connect(amp); src.start(at, from);
      // the last one carries on with nothing to hear while the echo dies away, and that's when it's all over
      src.stop(at + len + (final && c.echo ? 2.5 : .3));
      src.onended = () => { src.disconnect(); env.disconnect(); if (final) { for (const n of tail) n.disconnect(); done(); } };
      at += len + rest;
    });
  }

  const applyLevels = () => { if (!ctx) return; for (const b of BUSES) smooth(buses[b].gain, busGain(b), .12); for (const c of clips.values()) if (c.out) smooth(c.out.gain, clipOut(), .12); };
  // A recording of somebody's own goes straight to the master, so the mute has it and nothing it dips does: as loud as a voice line, turned down with the
  // effects, and as much of it as it's been asked for, which is how it fades away. From somewhere, it fades with distance from there, and sits to one side, the
  // way any sound from somewhere does. From nowhere, it's as loud wherever he is, in the middle.
  const clipOut = () => (levels.effects ?? 1) * (mine.effects ?? 1);
  const clipGain = (c) => c.level * c.much * (c.x === null ? 1 : Math.max(0, 1 - Math.hypot(c.x - L.x, c.z - L.z) / c.reach) ** 2);
  const clipPan = (c) => { if (c.x === null) return 0; const dx = c.x - L.x, dz = c.z - L.z, d = Math.hypot(dx, dz); return d > .5 ? Math.max(-.85, Math.min(.85, (dx * Math.cos(L.yaw) - dz * Math.sin(L.yaw)) / d * Math.min(1, d / 6))) : 0; };
  function startClip(c) {
    c.wanted = false;
    const src = ctx.createBufferSource(), amp = ctx.createGain(), out = ctx.createGain(), pan = ctx.createStereoPanner?.() ?? null;
    src.buffer = c.buffer; amp.gain.value = clipGain(c); out.gain.value = clipOut();
    src.connect(amp);
    if (pan) { pan.pan.value = clipPan(c); amp.connect(pan); pan.connect(out); } else amp.connect(out);
    out.connect(master);
    Object.assign(c, { src, amp, out, pan, at: ctx.currentTime });
    clipping++; applyLevels();
    src.onended = () => { for (const n of [src, amp, pan, out]) n?.disconnect(); Object.assign(c, { src: null, amp: null, out: null, pan: null }); clipping--; applyLevels(); };
    src.start();
    heard.push({ name: `clip:${c.file}`, g: amp.gain.value, pan: pan?.pan.value ?? 0, at: ctx.currentTime, notes: 0 }); if (heard.length > 200) heard.shift();
  }
  const pause = () => { hidden = true; if (ctx) ctx.suspend?.(); keepAlive?.pause(); };
  const carryOn = () => { hidden = false; if (ctx) ctx.resume?.(); keepAlive?.play()?.catch?.(() => {}); };

  // The first touch is what's allowed to start it. Every touch after that tries again if it's stopped, because an iPhone leaves it stopped after a call or the lock screen.
  function unlock() {
    if (!ctx) {
      const AC = win.AudioContext ?? win.webkitAudioContext;
      if (!AC) return false;
      // an iPhone keeps web audio quiet with its silent switch on unless the page says this is what it's for. Older ones need a media element playing as well.
      if (win.navigator?.audioSession) win.navigator.audioSession.type = 'playback';
      else if (/iPad|iPhone|iPod/.test(win.navigator?.userAgent ?? '') || (win.navigator?.platform === 'MacIntel' && win.navigator?.maxTouchPoints > 1)) {
        keepAlive = new win.Audio(silentWav()); keepAlive.loop = true; keepAlive.setAttribute?.('playsinline', ''); keepAlive.play()?.catch?.(() => {});
      }
      ctx = new AC({ latencyHint: 'interactive' }); startedAt = win.performance?.now() ?? 0;
      master = ctx.createGain(); master.gain.value = muted ? 0 : levels.master ?? 1;
      const limit = ctx.createDynamicsCompressor(); limit.threshold.value = -9; limit.ratio.value = 8; limit.attack.value = .003; limit.release.value = .2;
      master.connect(limit); limit.connect(ctx.destination); buses.limit = limit;
      for (const b of BUSES) { const g = ctx.createGain(); g.gain.value = busGain(b); g.connect(master); buses[b] = g; }
      score = buildScore();
      // the long ones first, while the title's still on and there's nothing moving to hold up. Anything with a file doesn't need working out, unless the file doesn't come.
      for (const name of Object.keys(RECIPES).sort((a, b) => RECIPES[b].s - RECIPES[a].s)) if (!data.cues[name]?.file) queueRecipe(name);
      for (const [name, c] of Object.entries(data.cues)) if (c.file) loadFor(name, c.file, shaped);
      for (const [name, l] of Object.entries(data.voice ?? {})) if (l.file) loadFor(`voice:${name}`, l.file, (b) => { const m = measure(b); voiceLevel.set(name, Math.min(VOICE_RMS / m.rms, .95 / m.peak)); return b; });
      toScoreState(wanted);
    }
    if (!hidden) { if (ctx.state !== 'running') ctx.resume?.(); if (keepAlive?.paused) keepAlive.play()?.catch?.(() => {}); }
    return true;
  }
  if (win.addEventListener) for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) win.addEventListener(ev, guarded(unlock), { capture: true, passive: true });
  win.document?.addEventListener?.('visibilitychange', () => { if (win.document.hidden || win.document.visibilityState === 'hidden') pause(); else carryOn(); });
  win.addEventListener?.('pagehide', pause);
  win.addEventListener?.('pageshow', () => { if (!win.document?.hidden) carryOn(); });

  const live = () => ctx && !hidden;

  const api = {
    get unlocked() { return !!ctx; },
    get muted() { return muted; },
    get startedAt() { return startedAt; },
    setMuted(on) {
      muted = !!on;
      try { win.localStorage?.setItem('chunky.mute', muted ? '1' : '0'); } catch { /* it only forgets */ }
      if (ctx) smooth(master.gain, muted ? 0 : levels.master ?? 1, .02);
    },
    // Where the ears are: on him, with left and right the camera's
    update(x, z, yaw) {
      L.x = x; L.z = z; L.yaw = yaw;
      if (!live()) return;
      workOnQueue(); runScore();
      for (const [name, l] of loops) if (l.level <= 0 && ctx.currentTime - l.since > 2) { l.src.stop(); l.src.disconnect(); l.gain.disconnect(); loops.delete(name); }
      for (const c of clips.values()) if (c.src) { smooth(c.amp.gain, clipGain(c), .08); if (c.pan) smooth(c.pan.pan, clipPan(c), .08); }
    },
    // One sound, right now. With x and z it fades with distance and sits to one side. A `rate` on its line plays it higher and shorter than its file is, or lower and longer, which is how two sounds can share takes. It says whether it played.
    play(name, { x, z, gain = 1, rate = 1 } = {}) {
      if (!live()) return false;
      const c = cueOf(name);
      if (!c) { complain('warn', `No sound called ${name} in the sheet`); return false; }
      let g = c.gain * gain, pan = 0;
      if (x !== undefined) {
        const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
        if (d >= c.reach) return false;
        g *= (1 - d / c.reach) ** 2;
        if (d > .5) pan = Math.max(-.85, Math.min(.85, (dx * Math.cos(L.yaw) - dz * Math.sin(L.yaw)) / d * Math.min(1, d / 6)));
      }
      if (g < .004) return false;
      const now = ctx.currentTime, n = playing.get(name) ?? 0;
      if (voices >= MAX_VOICES - (c.bus === 'ambience' ? NIGHT_LEAVES : 0) || n >= c.max || now - (last.get(name) ?? -9) < c.gap) return false;
      const takes = takesOf(name);
      if (!takes) return false;
      const take = takes[Math.floor(rand() * takes.length)], amp = ctx.createGain(); amp.gain.value = g;
      let end = amp, panner = null;
      if (pan && ctx.createStereoPanner) { panner = ctx.createStereoPanner(); panner.pan.value = pan; amp.connect(panner); end = panner; }
      end.connect(buses[c.bus]);
      voices++; playing.set(name, n + 1); last.set(name, now);
      const done = () => { voices--; playing.set(name, playing.get(name) - 1); amp.disconnect(); panner?.disconnect(); };
      const r = rate * (c.rate ?? 1) * (1 + (rand() * 2 - 1) * c.spread);
      if (c.notes) blow(take, c, r, amp, panner ?? buses[c.bus], done);
      else { const src = ctx.createBufferSource(); src.buffer = take; src.playbackRate.value = r; src.connect(amp); src.onended = () => { src.disconnect(); done(); }; src.start(); }
      heard.push({ name, g, pan, at: now, notes: c.notes?.length ?? 0 }); if (heard.length > 200) heard.shift();
      return true;
    },
    // How long a go at a sound lasts, at its own pitch, once it's there to play
    lengthOf(name) { const takes = files.get(name) ?? buffers.get(name); return takes?.length ? Math.max(...takes.map((b) => b?.duration ?? 0)) : null; },
    // A sound that keeps going, at a level, from 0 for not at all, and a rate for its pitch. Call it as often as it changes.
    loop(name, level, rate = 1) {
      if (!live()) return;
      let l = loops.get(name);
      const c = cueOf(name), to = (c?.gain ?? 1) * level;
      if (!l) {
        // one that's turned all the way down on its sheet never starts
        if (to <= 0 || !c) return;
        const takes = takesOf(name); if (!takes) return;
        const src = ctx.createBufferSource(), gain = ctx.createGain(); src.buffer = takes[0]; src.loop = true; src.playbackRate.value = rate; gain.gain.value = 0; src.connect(gain); gain.connect(buses[c.bus]); src.start();
        l = { src, gain, level: 0, rate, since: ctx.currentTime }; loops.set(name, l);
      }
      // little changes aren't worth a ramp, except the last one down, or a loop that died away gradually would hum on under everything for good
      if (Math.abs(to - l.level) > .004 || (to <= 0 && l.level > 0)) { if (to <= 0 && l.level > 0) l.since = ctx.currentTime; else if (to > 0) l.since = Infinity; l.level = to; smooth(l.gain.gain, to, .12); }
      if (Math.abs(rate - l.rate) > .004) { l.rate = rate; smooth(l.src.playbackRate, rate, .06); }
    },
    // What the score's doing. The sheet has what each of these is made of.
    music(state) { wanted = state; if (live()) toScoreState(state); },
    // How loud a whole bus is, as a fraction of its level, so that the night can go quiet for the fever
    fade(bus, k) { fades[bus] = k; if (ctx) smooth(buses[bus].gain, busGain(bus), .5); },
    // How far up the player wants a bus, the effects or the night noise, from 0 to 1 of what the sheet says. It's kept for next time, like the mute.
    setLevel(bus, k) {
      if (!BUSES.includes(bus)) return;
      mine[bus] = Math.max(0, Math.min(1, Number(k) || 0));
      try { win.localStorage?.setItem('chunky.levels', JSON.stringify(mine)); } catch { /* it only forgets */ }
      applyLevels();
    },
    levelOf: (bus) => mine[bus] ?? 1,
    // A voice line, by name, if there's a recording for it: the music dips, the words come up, and it only plays once unless it's asked to.
    say(name, { again = false } = {}) {
      const line = data.voice?.[name];
      if (!line?.file || !live() || (!again && said.has(name))) return false;
      const takes = files.get(`voice:${name}`);
      if (!takes) return false;
      if (speaking) { nextLine = name; return false; }
      said.add(name);
      const src = ctx.createBufferSource(), level = ctx.createGain(); src.buffer = takes[0]; level.gain.value = voiceLevel.get(name) ?? 1; src.connect(level); level.connect(buses.voice);
      speaking = name; applyLevels(); onLine(line.text ?? '');
      src.onended = () => { src.disconnect(); level.disconnect(); speaking = null; applyLevels(); onLine(null); if (nextLine) { const n = nextLine; nextLine = null; api.say(n); } };
      src.start();
      return true;
    },
    // Somebody's own recording, from a file that might not be there yet. It's asked for the first time it's wanted, and if nothing's there, nothing plays and
    // nothing's said, then or after. It plays once, from x, z, or from nowhere without them, all of it, and everything else dips under it while it does. Wanted
    // again while it's going, it carries on: it's never started over, or twice. It says whether it's playing or about to.
    clip(file, { x = null, z = null, reach = 30 } = {}) {
      if (!live()) return false;
      let c = clips.get(file);
      if (!c) {
        clips.set(file, c = { file, buffer: undefined, level: 1, much: 1, x, z, reach, wanted: true, src: null });
        win.fetch(file).then((res) => (res.ok ? res.arrayBuffer() : null), () => null)
          .then((bytes) => bytes && decode(bytes).catch((e) => { complain('warn', `${file} isn't something it can play: ${e?.message ?? e}`); return null; }))
          .then((b) => {
            c.buffer = b || null;
            if (!b) return;
            const m = measure(b); c.level = Math.min(VOICE_RMS / m.rms, .95 / m.peak);
            if (c.wanted && live()) startClip(c);
          })
          .catch((e) => { c.buffer ??= null; complain('warn', e.message); });
        return true;
      }
      if (c.src || c.buffer === null) return false;
      Object.assign(c, { x, z, reach, much: 1 });
      if (c.buffer === undefined) { c.wanted = true; return true; }
      startClip(c);
      return true;
    },
    // How much of a clip is to be heard, from 1 for all of it down to 0, which stops it, or stops it starting if it hasn't yet. Asked for again after, it starts again.
    fadeClip(file, much) {
      const c = clips.get(file), k = Math.max(0, Math.min(1, much));
      if (!c || k === c.much) return;
      c.much = k;
      if (k === 0) { c.wanted = false; c.src?.stop(); }
      applyLevels();
    },
    // For tools/play-sound.mjs: what's going on, and how loud it is coming out, in dB. `levels` is each bus as it is, which Chrome only works out while something's
    // playing through it, so a bus with nothing on it keeps the last it had. `aim` is where each one's headed, whatever's on it.
    state() { return { unlocked: !!ctx, ctx: ctx?.state ?? null, muted, voices, loops: [...loops.keys()], loopLevels: Object.fromEntries([...loops].map(([k, l]) => [k, +l.level.toFixed(3)])), loopRates: Object.fromEntries([...loops].map(([k, l]) => [k, +l.rate.toFixed(3)])), maxVoices: MAX_VOICES, maxTracks: MAX_TRACKS, waiting: waitingFor.size, tracks: [...tracks.keys()], track: deck?.now?.t.file ?? null, rounds: deck?.rounds ?? 0, layered: !!score?.layered, plugged: !!score?.plugged, music: score?.state ?? wanted, queued: queue.length, heard: heard.map((h) => h.name), speaking, keepAlive: !!keepAlive, files: [...files.keys()], levels: ctx ? Object.fromEntries(BUSES.map((b) => [b, +buses[b].gain.value.toFixed(3)])) : null, aim: ctx ? Object.fromEntries(BUSES.map((b) => [b, +busGain(b).toFixed(3)])) : null, nodes: voices + loops.size, clipping, clips: Object.fromEntries([...clips].map(([f, c]) => [f, { there: c.buffer === undefined ? null : !!c.buffer, playing: !!c.src, at: c.src ? c.at : null, gain: c.amp ? +c.amp.gain.value.toFixed(3) : 0, out: c.out ? +c.out.gain.value.toFixed(3) : 0, level: +c.level.toFixed(3), much: +c.much.toFixed(3) }])) }; },
    forget() { heard.length = 0; },
    lastHeard(name) { for (let i = heard.length - 1; i >= 0; i--) if (heard[i].name === name) return heard[i]; return null; },
    meter() {
      if (!ctx) return -Infinity;
      if (!meterNode) { meterNode = ctx.createAnalyser(); meterNode.fftSize = 2048; buses.limit.connect(meterNode); return -Infinity; }
      const t = new Float32Array(meterNode.fftSize); meterNode.getFloatTimeDomainData(t);
      let s = 0; for (const x of t) s += x * x;
      return 10 * Math.log10(s / t.length + 1e-12);
    },
    get data() { return data; },
    cueNames: () => Object.keys(data.cues),
  };
  for (const k of ['setMuted', 'update', 'play', 'loop', 'music', 'fade', 'setLevel', 'say', 'clip', 'fadeClip']) api[k] = guarded(api[k]);
  return api;
}

// The first sheet of a list that loads. With none the game still runs. It's just silent.
export async function loadSound(urls, opts) {
  for (const url of [urls].flat()) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      return createSound(await res.json(), opts);
    } catch (e) { console.error(`Couldn't load ${url}: ${e.message}`); }
  }
  return createSound({ cues: {}, music: {} }, opts);
}
