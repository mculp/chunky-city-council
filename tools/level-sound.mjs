// Sets the levels in data/sound-new.json so each generated sound comes out as loud as the one it's up against in data/sound.json, so choosing between the two boards is about the sound and not the level.
// Loudness is weighted roughly the way LUFS is, with the lows taken off and the highs lifted, because that's nearer what's heard, and a phone can't play the lows anyway.
// Effects go by their loudest tenth of a second and loops by their whole length. The old score is oscillators, so it's read live off the meter, a part of the game at a time.
// A track's as dense as a drone is empty, so it only matches as far as its peaks stay near the limiter. Past that it'd be a wall that nothing gets through. Nothing's let clip either.
// It only ever writes data/sound-new.json.
//
//   npm i && npm run sound:level
import { readFileSync, writeFileSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';
import { formatSound } from './make-sound.mjs';

const TRACK_TOP = .5;
const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const OLD = read('data/sound.json'), NEW = read('data/sound-new.json');

// Runs in the page: how loud a recipe or a file comes out, weighted
const setUpInPage = async () => {
  const { render, RATE, RECIPES, variantsOf } = await import('/src/soundbank.js');
  const weigh = (ctx, input) => {
    const low = ctx.createBiquadFilter(); low.type = 'highpass'; low.frequency.value = 100; low.Q.value = .5;
    const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 1500; high.gain.value = 4;
    input.connect(low).connect(high);
    return high;
  };
  const weighted = async (b) => {
    const off = new OfflineAudioContext(1, Math.ceil(b.duration * 44100), 44100), src = off.createBufferSource();
    src.buffer = b; weigh(off, src).connect(off.destination); src.start();
    return (await off.startRendering()).getChannelData(0);
  };
  const decode = async (file) => new OfflineAudioContext(2, 44100, 44100).decodeAudioData(await (await fetch(`/${file}`)).arrayBuffer());
  const db = (x) => 20 * Math.log10(Math.max(x, 1e-6));
  const rmsOf = (d, from = 0, to = d.length) => { let s = 0; for (let i = from; i < to; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, to - from)); };
  const loudest = (d) => { const n = 4410, sums = new Float64Array(d.length + 1); for (let i = 0; i < d.length; i++) sums[i + 1] = sums[i] + d[i] * d[i]; let top = 0; for (let i = 0; i + n <= d.length; i += 441) top = Math.max(top, sums[i + n] - sums[i]); return Math.sqrt((top || sums[d.length]) / n); };
  const levelOf = (d, loop) => db(loop ? rmsOf(d) : loudest(d));
  const mean = (a) => a.reduce((n, x) => n + x, 0) / a.length;
  window.oldCue = async (name) => mean(await Promise.all(Array.from({ length: variantsOf(name) }, async (_, v) => {
    const o = render(name, v), b = new AudioBuffer({ length: o.length, sampleRate: RATE, numberOfChannels: 1 });
    b.copyToChannel(o, 0);
    return levelOf(await weighted(b), RECIPES[name].loop);
  })));
  // brought to the recipe's peak, the way the game brings a file to it when it loads
  window.newCue = async (name, files) => mean(await Promise.all([files].flat().map(async (file) => {
    const b = await decode(file); let peak = 0;
    for (let ch = 0; ch < b.numberOfChannels; ch++) for (const x of b.getChannelData(ch)) peak = Math.max(peak, Math.abs(x));
    return levelOf(await weighted(b), RECIPES[name].loop) + db((RECIPES[name].peak ?? .9) / peak);
  })));
  // what a track comes out at before its part's own gain, the way the game works it out: to .1, stopping at the first second of quiet near its end
  window.newTrack = async (file, bus) => {
    const b = await decode(file), l = b.getChannelData(0), r = b.getChannelData(b.numberOfChannels - 1), tail = b.length - b.sampleRate * 15;
    let sum = 0, m = 0, peak = 0, first = -1, last = 0;
    for (let i = 0; i < b.length; i += 32) { const a = Math.max(Math.abs(l[i]), Math.abs(r[i])); if (first >= 0 && i > tail && i - last > b.sampleRate) break; if (a > peak) peak = a; sum += a * a; m++; if (a > .003) { if (first < 0) first = i; last = i; } }
    const k = Math.min(.1 / Math.sqrt(sum / m), .95 / peak), d = await weighted(b), rate = 44100;
    return [db(rmsOf(d, Math.floor(first / b.sampleRate * rate), Math.floor(last / b.sampleRate * rate)) * k * bus), k * peak * bus];
  };
  // the meter, weighted the same way
  const make = AudioContext.prototype.createAnalyser;
  AudioContext.prototype.createAnalyser = function createAnalyser() {
    const tap = this.createGain(), meter = make.call(this);
    weigh(this, tap).connect(meter);
    tap.getFloatTimeDomainData = (t) => meter.getFloatTimeDomainData(t);
    tap.fftSize = 2048;
    return tap;
  };
};

// at #old, because that's what has the drones on it
const { page, errors, close } = await serveAndOpen({ viewport: { width: 390, height: 844 }, query: '?test#old' });
await page.evaluate(setUpInPage);

// ---------------- effects and loops
const rows = [], recipePeak = await page.evaluate(async () => Object.fromEntries(Object.entries((await import('/src/soundbank.js')).RECIPES).map(([k, r]) => [k, r.peak])));
for (const [name, c] of Object.entries(NEW.cues)) {
  if (!c.file) continue;
  const before = OLD.cues[name]?.gain ?? OLD.defaults.gain;
  const [oldDb, newDb] = await page.evaluate(async ([n, f]) => [await window.oldCue(n), await window.newCue(n, f)], [name, c.file]);
  const most = .98 / ((NEW.levels[c.bus ?? 'effects'] ?? 1) * (recipePeak[name] ?? .9));
  c.gain = Number(Math.min(most, before * 10 ** ((oldDb - newDb) / 20)).toFixed(3));
  rows.push(`${name.padEnd(16)} old ${oldDb.toFixed(1).padStart(6)} new ${newDb.toFixed(1).padStart(6)}  gain ${String(before).padEnd(6)} -> ${c.gain}`);
}
console.log(rows.join('\n'));

// ---------------- the score, a part at a time. The page plays the old sheet, so the meter's reading its drone.
await page.keyboard.press('x');
await page.waitForFunction(() => window.__game.sound.state().ctx === 'running', null, { timeout: 5000 });
await page.evaluate(() => { window.__game.sound.meter(); });
const score = [];
for (const [state, st] of Object.entries(NEW.music)) {
  const files = [st.file ?? []].flat();
  if (!files.length) continue;
  const oldDb = await page.evaluate(async (s) => {
    const Snd = window.__game.sound; Snd.music(s);
    await new Promise((r) => setTimeout(r, 3500));
    let sum = 0, n = 0;
    for (; n < 30; n++) { sum += 10 ** (Snd.meter() / 10); await new Promise((r) => setTimeout(r, 100)); }
    return 10 * Math.log10(sum / n);
  }, state);
  const each = await page.evaluate(async ([f, bus]) => Promise.all(f.map((x) => window.newTrack(x, bus))), [files, NEW.levels.music]);
  const newDb = each.reduce((n, [x]) => n + x, 0) / each.length, top = Math.max(...each.map(([, p]) => p));
  st.gain = Number(Math.min(TRACK_TOP / top, 10 ** ((oldDb - newDb) / 20)).toFixed(3));
  score.push(`${state.padEnd(10)} old ${oldDb.toFixed(1).padStart(6)} new ${newDb.toFixed(1).padStart(6)}  gain -> ${st.gain}`);
}
console.log(score.join('\n'));

await close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
writeFileSync(new URL('../data/sound-new.json', import.meta.url), formatSound(NEW));
console.log('data/sound-new.json is levelled');
