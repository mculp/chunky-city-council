// Measures every file in audio/ in real Chrome, the way the game will decode it, and fails on one that's broken: silent, clipped, cut short, or a loop with a click where it comes round.
// Nothing here can hear, so it can't say whether any of it's good. With --pictures it draws a spectrogram of each file, to look at.
//
//   npm i && npm run sound:measure -- [--pictures dir] [--only town,step.road]
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveAndOpen } from './browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2), flag = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const pictures = flag('--pictures'), only = flag('--only')?.split(',') ?? null;

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (/\.(mp3|wav|m4a|ogg)$/.test(e.name)) out.push(p);
  }
  return out;
}
// step.road.2.mp3 is a take of step.road. A file with no take number is just its name.
const nameOf = (file) => { const base = file.split('/').pop(); return /\.\d+\.\w+$/.test(base) ? base.replace(/\.\d+\.\w+$/, '') : base.replace(/\.\w+$/, ''); };
const files = (await walk(join(ROOT, 'audio'))).filter((f) => !only || only.includes(nameOf(f))).sort();
if (!files.length) { console.log('Nothing in audio/ to measure.'); process.exit(0); }
const sheet = JSON.parse(await readFile(join(ROOT, 'tools/sound_prompts.json'), 'utf8'));
const data = JSON.parse(await readFile(join(ROOT, 'data/sound.json'), 'utf8'));

const { page, close } = await serveAndOpen({ viewport: { width: 800, height: 600 } });
if (pictures) await mkdir(pictures, { recursive: true });

// Runs in the page, on one file. Peak and loudness over the whole of it, where the sound starts and stops, how much is in the lows, mids and highs, and what happens at the seam if it's a loop
const measureInPage = async ({ b64, spectrogram }) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const ctx = new OfflineAudioContext(2, 44100, 44100), b = await ctx.decodeAudioData(bytes.buffer), rate = b.sampleRate, n = b.length;
  const chans = Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i));
  let peak = 0, sum = 0, clipped = 0;
  for (const d of chans) for (let i = 0; i < n; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += a * a; if (a >= .999) clipped++; }
  const rms = Math.sqrt(sum / (n * chans.length)) || 1e-9, floor = peak * .01;
  let first = n, last = 0;
  for (const d of chans) for (let i = 0; i < n; i++) if (Math.abs(d[i]) > floor) { if (i < first) first = i; if (i > last) last = i; }
  const loudness = (from, to) => { let s = 0, m = 0; for (let i = Math.max(0, from); i < Math.min(n, to); i++) { s += chans[0][i] ** 2; m++; } return Math.sqrt(s / Math.max(1, m)) || 1e-9; };
  const edge = Math.floor(rate * .25), wrap = Math.abs(chans[0][0] - chans[0][n - 1]);
  // an FFT of a window every so often, for the balance and the picture
  const size = 2048, win = Float32Array.from({ length: size }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / (size - 1))), cols = spectrogram ? 900 : 120, rows = 256;
  const fft = (re, im) => { for (let i = 1, j = 0; i < size; i++) { let bit = size >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } } for (let len = 2; len <= size; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < size; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, c = a + len / 2, xr = re[c] * cr - im[c] * ci, xi = re[c] * ci + im[c] * cr; re[c] = re[a] - xr; im[c] = im[a] - xi; re[a] += xr; im[a] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } };
  const bands = [0, 0, 0], picture = spectrogram ? new Float32Array(cols * rows) : null, maxHz = Math.min(rate / 2, 16000);
  for (let c = 0; c < cols; c++) {
    const at = Math.floor((c + .5) / cols * Math.max(1, n - size)), re = new Float32Array(size), im = new Float32Array(size);
    for (let i = 0; i < size; i++) re[i] = (chans[0][at + i] ?? 0) * win[i];
    fft(re, im);
    for (let k = 1; k < size / 2; k++) {
      const hz = k * rate / size, p = re[k] * re[k] + im[k] * im[k];
      bands[hz < 200 ? 0 : hz < 2000 ? 1 : 2] += p;
      if (picture) { const r = Math.min(rows - 1, Math.floor(Math.log(Math.max(hz, 40) / 40) / Math.log(maxHz / 40) * rows)); picture[c * rows + r] = Math.max(picture[c * rows + r], p); }
    }
  }
  // the low rows of a log scale fall between bins, so they take the one below rather than showing as stripes
  if (picture) for (let c = 0; c < cols; c++) for (let r = 1; r < rows; r++) if (picture[c * rows + r] === 0) picture[c * rows + r] = picture[c * rows + r - 1];
  const bandSum = bands[0] + bands[1] + bands[2] || 1;
  let png = null;
  if (picture) {
    const cv = document.createElement('canvas'); cv.width = cols; cv.height = rows; const g = cv.getContext('2d'), im = g.createImageData(cols, rows);
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const v = Math.max(0, Math.min(1, (10 * Math.log10(picture[c * rows + r] + 1e-12) + 70) / 80)), o = ((rows - 1 - r) * cols + c) * 4;
      im.data[o] = 255 * Math.min(1, v * 1.8); im.data[o + 1] = 255 * Math.max(0, v * 1.8 - .8); im.data[o + 2] = 90 * (1 - v) + 255 * Math.max(0, v - .85) * 6; im.data[o + 3] = 255;
    }
    g.putImageData(im, 0, 0); png = cv.toDataURL('image/png').split(',')[1];
  }
  // The level every quarter second, for a loop that swells or a track whose end isn't its end
  const beat = Math.floor(rate * .25), levels = [];
  for (let at = 0; at + beat <= n; at += beat) levels.push(20 * Math.log10(loudness(at, at + beat)));
  const sorted = [...levels].sort((a, b) => a - b), swells = levels.length > 3 ? sorted[sorted.length - 1] - sorted[sorted.length >> 1] : 0;
  // Gone quiet in the last 15 s and then back again. The game stops a track at a full second of silence there, so it's only one that doesn't reach that which is wrong.
  let quietAt = -1, silent = 0, comesBack = 0;
  for (let i = Math.max(0, levels.length - 60); i < levels.length && silent < 4; i++) {
    silent = levels[i] < -50 ? silent + 1 : 0;
    if (levels[i] < -40 && quietAt < 0) quietAt = i; else if (quietAt >= 0 && levels[i] > -35 && !comesBack) comesBack = (levels.length - i) / 4;
  }
  // How long the sound takes to arrive once it's started, and how many separate hits are in it. A trim can't take off a faint tick before the real hit.
  const fold = (i) => { let a = 0; for (const d of chans) a = Math.max(a, Math.abs(d[i])); return a; };
  let arrive = first; while (arrive < n && fold(arrive) < peak * .3) arrive++;
  const ms = Math.floor(rate * .01); let hits = 0, under = 99;
  for (let at = first; at + ms <= n; at += ms) { let top = 0; for (let i = at; i < at + ms; i++) top = Math.max(top, fold(i)); if (top > peak * .5) { if (under >= 8) hits++; under = 0; } else if (top < peak * .15) under++; }
  return { seconds: n / rate, rate, chans: chans.length, peak, rms, clipped, leads: first / rate, trails: (n - 1 - last) / rate, startRms: loudness(0, edge), endRms: loudness(n - edge, n), wrap, lows: bands[0] / bandSum, mids: bands[1] / bandSum, highs: bands[2] / bandSum, swells, comesBack, late: (arrive - first) / rate, hits, png };
};

const db = (x) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
const rows = [], problems = [];
for (const file of files) {
  const rel = relative(ROOT, file), name = nameOf(file), size = (await stat(file)).size, cue = sheet.cues[name], track = sheet.music.tracks[name];
  const m = await page.evaluate(measureInPage, { b64: (await readFile(file)).toString('base64'), spectrogram: !!pictures });
  if (pictures) await writeFile(join(pictures, rel.replace(/\//g, '_') + '.png'), Buffer.from(m.png, 'base64'));
  const loop = !!(cue?.loop ?? data.cues[name]?.loop), asked = cue?.seconds ?? (track ? (track.takes ?? [track]).map((t) => t.sections.reduce((n, s) => n + s.seconds, 0))[Number(rel.match(/\.(\d+)\.\w+$/)?.[1] ?? 1) - 1] : null);
  const wrong = [];
  if (m.peak < .01) wrong.push('silent');
  else if (m.peak < .125 && !cue?.quiet) wrong.push('hardly anything there');
  // a crash can flatten a few of its peaks and nobody would know. Much more than that and it's distorted.
  if (m.clipped > m.seconds * m.rate * m.chans * .005) wrong.push(`clipped ${m.clipped} samples`);
  if (asked && m.seconds < asked * .75) wrong.push(`${m.seconds.toFixed(1)} s of the ${asked} s asked for`);
  // a loop's ends have to meet, or there's a click or a jump each time it comes round
  if (loop && (m.wrap > Math.max(.08, m.rms * 1.5))) wrong.push(`jumps ${m.wrap.toFixed(3)} where it comes round`);
  if (loop && Math.abs(20 * Math.log10(m.startRms / m.endRms)) > 8) wrong.push(`starts ${db(m.startRms)} dB and ends ${db(m.endRms)} dB`);
  if (track && m.trails > 6) wrong.push(`${m.trails.toFixed(1)} s of silence on the end`);
  if (track && m.comesBack) wrong.push(`fades out, then ${m.comesBack.toFixed(1)} s more comes back`);
  // a loop comes round every few seconds, so anything that stands out in it comes round too
  if (loop && m.swells > (cue?.uneven ? 24 : 6)) wrong.push(`swells ${m.swells.toFixed(1)} dB`);
  // a footstep or a blow has to land when it happens, and only once
  if (/^(step|hit)\./.test(name) && m.late > .2) wrong.push(`arrives ${m.late.toFixed(2)} s after it starts`);
  if (/^(step|hit)\./.test(name) && m.hits > 1) wrong.push(`${m.hits} hits in it`);
  if (wrong.length) problems.push(`${rel}: ${wrong.join(', ')}`);
  rows.push([rel.replace(/^audio\//, '').padEnd(28), `${m.seconds.toFixed(1)}s`.padStart(7), `${(size / 1024).toFixed(0)}KB`.padStart(7), `${m.chans}ch`.padStart(4), `pk ${db(m.peak)}`.padStart(9), `rms ${db(m.rms)}`.padStart(10), `in ${m.leads.toFixed(2)}`.padStart(8), `out ${m.trails.toFixed(2)}`.padStart(9), `lo/mid/hi ${Math.round(m.lows * 100)}/${Math.round(m.mids * 100)}/${Math.round(m.highs * 100)}`.padStart(20), `late ${m.late.toFixed(2)}`.padStart(10), `hits ${m.hits}`.padStart(8), `swell ${m.swells.toFixed(1)}`.padStart(11), wrong.length ? `  <- ${wrong.join(', ')}` : ''].join(' '));
}
console.log(rows.join('\n'));
await close();
console.log(problems.length ? `${problems.length} to look at:\n${problems.join('\n')}` : `all ${files.length} look sound`);
process.exit(problems.length ? 1 : 0);
