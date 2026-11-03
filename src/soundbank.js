// Every sound the game makes before anyone's recorded anything. They're worked out here from numbers, so nothing in them belongs to anyone else.
// There's no three.js or page in here, so node tests load it too. data/sound.md says how one gets replaced by a real recording.

export const RATE = 32000;
const TAU = Math.PI * 2;

// The game's own random numbers are seeded for the opening, so nothing in here may use them up
export function randomFrom(seed) {
  let s = seed | 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
const seedOf = (name, v) => { let h = 2166136261; for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619); return Math.imul(h + v + 1, 2654435761); };

// A state-variable filter that stays stable wherever its cutoff goes. After run(), lp, bp and hp hold what came out.
class Filter {
  constructor(fc, q = .7) { this.a = this.b = this.lp = this.bp = this.hp = 0; this.q = q; this.set(fc); }
  set(fc) { const g = Math.tan(Math.PI * Math.min(fc, RATE * .45) / RATE), k = 1 / this.q; this.k = k; this.a1 = 1 / (1 + g * (g + k)); this.a2 = g * this.a1; this.a3 = g * this.a2; }
  run(x) {
    const v3 = x - this.b, v1 = this.a1 * this.a + this.a2 * v3, v2 = this.b + this.a2 * this.a + this.a3 * v3;
    this.a = 2 * v1 - this.a; this.b = 2 * v2 - this.b; this.lp = v2; this.bp = v1; this.hp = x - this.k * v1 - v2;
  }
}

// Shapes over the length of a sound, from 0 to 1
const bell = (u) => Math.sin(Math.PI * u), fall = (k) => (u) => Math.exp(-u * k), rise = (k) => (u) => Math.pow(u, k);

// Noise through a filter whose cutoff glides from `from` to `to`
function hiss(o, at, seconds, r, { from, to = from, q = .8, kind = 'bp', env = bell, amp = 1 }) {
  const n = Math.floor(seconds * RATE), s = Math.floor(at * RATE), f = new Filter(from, q), glide = to / from;
  for (let i = 0; i < n && s + i < o.length; i++) {
    if (i % 16 === 0 && glide !== 1) f.set(from * Math.pow(glide, i / n));
    f.run(r() * 2 - 1); o[s + i] += f[kind] * env(i / n) * amp;
  }
}
// A decaying sine, gliding from f0 towards f1
function ring(o, at, f0, tau, amp, f1 = f0, glide = tau) {
  const s = Math.floor(at * RATE), n = Math.min(Math.ceil(tau * 6 * RATE), o.length - s); let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / RATE, f = f1 + (f0 - f1) * Math.exp(-t / glide); ph += TAU * f / RATE; o[s + i] += Math.sin(ph) * Math.exp(-t / tau) * amp * Math.min(1, i / 6); }
}
// A lot of small knocks scattered over a stretch, thicker at the start the more `thin` there is
function clatter(o, from, to, count, r, lo, hi, tau, amp, thin = 0) {
  for (let i = 0; i < count; i++) ring(o, from + (to - from) * Math.pow(r(), 1 + thin), lo * Math.pow(hi / lo, r()), tau * (.5 + r()), amp * (.3 + r() * .7));
}
// A drop of water
const drip = (o, at, f, amp) => ring(o, at, f, .018, amp, f * 1.7, .02);
// A struck piece of metal: its partials aren't in tune with each other
function clang(o, at, f, tau, amp) {
  ring(o, at, f, tau, amp); ring(o, at, f * 2.76, tau * .6, amp * .55); ring(o, at, f * 5.4, tau * .32, amp * .3); ring(o, at, f * 8.93, tau * .16, amp * .16);
}
// Wood or rope under strain: small ticks that come faster in the middle, each one ringing the thing that's straining
function strain(o, seconds, r, freqs, amp, slow, fast) {
  for (let t = .02; t < seconds - .03;) {
    const e = Math.sin(Math.PI * t / seconds);
    freqs.forEach(([f, tau, g]) => ring(o, t, f * (.94 + r() * .12), tau, g * amp * e));
    t += (slow + (fast - slow) * e) * (.75 + r() * .5);
  }
}
const VOWELS = { uh: [[520, 6, 1], [1150, 8, .6], [2500, 10, .25]], aw: [[640, 6, 1], [980, 8, .7], [2600, 10, .2]], oo: [[340, 6, 1], [820, 8, .4], [2400, 12, .15]] };
// A throat: a buzz at a wavering pitch through a vowel
function throat(o, r, seconds, { f0, f1, wob = .06, vowel, rough = 0, breath = .08, env = bell }) {
  const n = Math.floor(seconds * RATE), [a, b, c] = VOWELS[vowel], A = new Filter(a[0], a[1]), B = new Filter(b[0], b[1]), C = new Filter(c[0], c[1]);
  const w1 = 1.3 + r() * 1.4, w2 = 5 + r() * 4, p1 = r() * 6, p2 = r() * 6; let ph = 0;
  for (let i = 0; i < n && i < o.length; i++) {
    const t = i / RATE, u = i / n, f = (f0 + (f1 - f0) * u) * (1 + wob * Math.sin(TAU * w1 * t + p1) + wob * .4 * Math.sin(TAU * w2 * t + p2) + (r() - .5) * .012);
    ph += f / RATE; if (ph >= 1) ph -= 1;
    const buzz = (1 - 2 * ph) * (1 - rough * (.5 + .5 * Math.sin(TAU * 31 * t))) + (r() * 2 - 1) * breath;
    A.run(buzz); B.run(buzz); C.run(buzz);
    o[i] += (A.bp * a[2] + B.bp * b[2] + C.bp * c[2]) * env(u);
  }
}
// An engine: `fires` firings a second for one second, each one ringing what it's bolted to. Anything that rings on past the end comes round to the start, so it loops.
function engine(o, r, fires, freqs, tau, lumpy) {
  const pattern = Array.from({ length: 8 }, () => 1 + (r() - .5) * lumpy);
  for (let k = 0; k < fires; k++) freqs.forEach(([f, g]) => ring(o, k / fires, f, tau, g * pattern[k % 8]));
  const L = RATE; for (let i = L; i < o.length; i++) { o[i - L] += o[i]; o[i] = 0; }
}

// Every sound. `s` is how long it's worked out for, `peak` how loud it comes out, `variants` how many takes there are, `loop` the seconds its ends overlap by to
// make it loop, and `exact` that it loops as it is. `kind` says who it's for and only the tests read it.
export const RECIPES = {
  'step.dirt': { s: .18, peak: .8, variants: 3, make(o, r) { ring(o, 0, 120, .032, .9, 70, .02); hiss(o, 0, .07, r, { from: 1100, to: 500, kind: 'lp', env: fall(5), amp: .5 }); hiss(o, .03, .1, r, { from: 1900 + r() * 800, q: .6, amp: .1 }); } },
  'step.road': { s: .14, peak: .8, variants: 3, make(o, r) { ring(o, 0, 170, .02, .6, 95, .012); hiss(o, 0, .05, r, { from: 3200, to: 1800, q: .7, env: fall(7), amp: .55 }); clatter(o, 0, .07, 5, r, 2500, 6000, .003, .12); } },
  'step.wood': { s: .26, peak: .8, variants: 3, make(o, r) { ring(o, 0, 205 + r() * 30, .06, .8, 170); ring(o, 0, 430 + r() * 60, .03, .45); ring(o, .001, 1150 + r() * 200, .008, .3); hiss(o, 0, .02, r, { from: 2500, env: fall(5), amp: .3 }); } },
  'step.mud': { s: .26, peak: .8, variants: 3, make(o, r) { ring(o, 0, 95, .05, .6, 60); hiss(o, 0, .14, r, { from: 350, to: 1500, q: 1.1, amp: .65 }); drip(o, .09 + r() * .04, 650 + r() * 300, .28); } },

  'rope.creak': { s: .85, peak: .7, variants: 3, make(o, r) { strain(o, .8, r, [[310, .012, .5], [760, .007, .4], [1650, .003, .25]], 1, .05, .018); } },
  'rope.saw': { s: .22, peak: .7, variants: 2, make(o, r) { const f = new Filter(1900 + r() * 1200, 1.1), n = Math.floor(.2 * RATE); for (let i = 0; i < n; i++) { const am = Math.pow(Math.abs(Math.sin(TAU * 58 * i / RATE + r() * .2)), 2); f.run((r() * 2 - 1) * am); o[i] = f.bp * bell(i / n); } } },
  'rope.snap': { s: .45, peak: .95, make(o, r) { hiss(o, 0, .012, r, { from: 6500, kind: 'hp', env: fall(3), amp: 1.2 }); ring(o, 0, 240, .03, .6, 90, .02); hiss(o, .006, .28, r, { from: 4200, to: 700, env: fall(6), amp: .55 }); } },
  'fall.air': { s: 1.35, peak: .7, make(o, r) { hiss(o, 0, 1.3, r, { from: 260, to: 1500, q: .9, env: (u) => Math.pow(u, 1.6) * (1 - Math.pow(u, 10)), amp: 1 }); } },

  'splash.big': { s: 2.1, peak: .95, make(o, r) { ring(o, 0, 95, .14, .9, 38, .06); hiss(o, 0, .5, r, { from: 5200, to: 700, kind: 'lp', env: fall(6), amp: .9 }); hiss(o, .03, 1.1, r, { from: 1700, to: 500, q: .6, env: fall(4.5), amp: .35 }); for (let i = 0; i < 70; i++) { const at = .08 + Math.pow(r(), 1.8) * 1.6; drip(o, at, 500 + r() * 1800, .05 + r() * .16 * (1 - at / 2)); } } },
  'splash.small': { s: .75, peak: .8, variants: 2, make(o, r) { ring(o, 0, 170, .05, .6, 70, .03); hiss(o, 0, .18, r, { from: 3400, to: 700, kind: 'lp', env: fall(6), amp: .6 }); for (let i = 0; i < 14; i++) drip(o, .03 + Math.pow(r(), 1.5) * .55, 600 + r() * 1500, .05 + r() * .12); } },
  'swim.stroke': { s: .62, peak: .55, variants: 3, make(o, r) { hiss(o, 0, .55, r, { from: 420, to: 1000, q: .7, amp: .8 }); for (let i = 0; i < 6; i++) drip(o, .2 + r() * .35, 700 + r() * 1200, .03 + r() * .06); } },

  swing: { s: .3, peak: .7, variants: 2, make(o, r) { hiss(o, 0, .28, r, { from: 450, to: 1700, q: 1.2, amp: 1 }); } },
  'hit.flesh': { s: .22, peak: .9, variants: 3, make(o, r) { ring(o, 0, 130, .05, 1, 58, .03); hiss(o, 0, .09, r, { from: 1800, to: 500, kind: 'lp', env: fall(6), amp: .6 }); hiss(o, 0, .012, r, { from: 3000, kind: 'hp', env: fall(3), amp: .3 }); } },
  'hit.wood': { s: .3, peak: .9, variants: 3, make(o, r) { ring(o, 0, 190 + r() * 30, .07, .9, 165); ring(o, 0, 410 + r() * 50, .04, .5); ring(o, 0, 1180 + r() * 200, .01, .35); clatter(o, .01, .09, 6, r, 1500, 4200, .004, .25); } },
  'hit.metal': { s: .7, peak: .85, variants: 3, make(o, r) { clang(o, 0, 430 + r() * 180, .3, .9); hiss(o, 0, .01, r, { from: 4000, kind: 'hp', env: fall(3), amp: .5 }); } },
  hurt: { s: .55, peak: .95, make(o, r) { ring(o, 0, 75, .16, 1, 45, .05); hiss(o, 0, .25, r, { from: 900, to: 200, kind: 'lp', env: fall(5), amp: .5 }); ring(o, 0, 1900, .12, .06); } },
  'break.wood': { s: .95, peak: .95, variants: 3, make(o, r) { ring(o, 0, 110, .07, .7, 60, .03); hiss(o, 0, .35, r, { from: 2500, to: 500, kind: 'lp', env: fall(5), amp: .4 }); clatter(o, 0, .8, 26, r, 500, 3000, .012, .7, 1.2); } },
  'break.metal': { s: .95, peak: .9, variants: 2, make(o, r) { clang(o, 0, 310 + r() * 120, .22, .8); clang(o, .07 + r() * .1, 520 + r() * 300, .14, .5); clang(o, .22 + r() * .2, 800 + r() * 500, .08, .3); clatter(o, .02, .7, 14, r, 1800, 5200, .005, .25, 1); } },
  rubble: { s: 1.65, peak: .85, variants: 2, make(o, r) { hiss(o, 0, 1.5, r, { from: 300, to: 120, kind: 'lp', env: fall(3), amp: .8 }); clatter(o, 0, 1.4, 30, r, 180, 900, .025, .8, 1); } },
  'tree.fall': { s: 2.5, peak: .9, make(o, r) { strain(o, 1.35, r, [[240, .02, .5], [560, .01, .3]], .8, .09, .03); ring(o, 1.35, 90, .16, 1, 45, .05); hiss(o, 1.35, .9, r, { from: 1800, to: 400, kind: 'lp', env: fall(4), amp: .7 }); clatter(o, 1.35, 2.3, 24, r, 700, 3200, .008, .35, 1); } },
  explosion: { s: 3.1, peak: 1, make(o, r) { hiss(o, 0, .025, r, { from: 5000, kind: 'hp', env: fall(3), amp: 1.4 }); ring(o, 0, 85, .55, 1.1, 30, .12); hiss(o, 0, 2.8, r, { from: 2200, to: 110, kind: 'lp', env: fall(4.2), amp: 1.1 }); clatter(o, .25, 2.4, 24, r, 700, 3400, .01, .16, .8); for (let i = 0; i < o.length; i++) o[i] = Math.tanh(o[i] * 1.6); } },
  'fire.catch': { s: .95, peak: .75, variants: 2, make(o, r) { hiss(o, 0, .9, r, { from: 180, to: 1400, kind: 'lp', q: .9, env: (u) => Math.sin(Math.PI * Math.pow(u, .6)), amp: 1 }); } },

  'can.clink': { s: .55, peak: .75, make(o) { for (const [at, g] of [[0, 1], [.075, .6]]) { ring(o, at, 1760, .05, .5 * g); ring(o, at, 2930, .035, .35 * g); ring(o, at, 4210, .02, .2 * g); } ring(o, .02, 440, .18, .25); ring(o, .1, 660, .22, .22); } },
  'can.slosh': { s: .75, peak: .7, make(o, r) { ring(o, 0, 620, .05, .6); ring(o, 0, 1390, .03, .35); hiss(o, .03, .6, r, { from: 500, to: 900, q: 1.4, env: (u) => bell(u) * (.6 + .4 * Math.sin(TAU * 5 * u)), amp: .7 }); } },
  'ui.tap': { s: .05, peak: .5, make(o) { ring(o, 0, 1300, .006, .8); } },
  'ui.paper': { s: .38, peak: .55, variants: 2, make(o, r) { clatter(o, 0, .3, 30, r, 2500, 7000, .002, .3); hiss(o, 0, .25, r, { from: 3500, kind: 'hp', amp: .25 }); } },
  glitch: { s: .3, peak: .5, variants: 3, make(o, r) { const n = Math.floor(.28 * RATE); let held = 0; for (let i = 0, next = 0, on = 1, hold = 12; i < n; i++) { if (i % 480 === 0) { hold = 4 + Math.floor(r() * 56); on = r() < .7 ? 1 : 0; } if (i >= next) { held = Math.round((r() * 2 - 1) * 6) / 6; next = i + hold; } o[i] = held * on * (1 - i / n); } } },
  fail: { s: 1.7, peak: .85, make(o, r) { ring(o, 0, 110, .5, .9, 55, .4); ring(o, 0, 165, .35, .4, 82, .4); hiss(o, 0, .8, r, { from: 1200, to: 200, kind: 'lp', env: fall(5), amp: .35 }); } },

  'vehicle.start': { s: .95, peak: .8, make(o, r) { for (let i = 0; i < 7; i++) { const t = i * .09; ring(o, t, 95, .03, .6); hiss(o, t, .04, r, { from: 1400, env: fall(4), amp: .1 }); } for (let i = 0; i < 6; i++) { const t = .63 + i * .045; ring(o, t, 130, .03, .9 - i * .08); ring(o, t, 340, .02, .4); } } },
  'vehicle.door': { s: .3, peak: .7, make(o) { ring(o, 0, 180, .06, .9); ring(o, 0, 540, .02, .4); ring(o, 0, 1900, .005, .2); } },
  crash: { s: 1.15, peak: 1, variants: 3, make(o, r) { ring(o, 0, 90, .12, 1, 45, .05); hiss(o, 0, .3, r, { from: 3500, to: 600, kind: 'lp', env: fall(6), amp: .8 }); clang(o, 0, 240 + r() * 120, .2, .55); clang(o, .05 + r() * .08, 480 + r() * 200, .14, .4); clang(o, .13 + r() * .14, 900 + r() * 300, .08, .25); clatter(o, .02, .95, 22, r, 1200, 5200, .006, .4, 1.2); } },
  flood: { s: 1.75, peak: .9, make(o, r) { ring(o, 0, 110, .1, .7, 50, .05); hiss(o, 0, .35, r, { from: 3000, to: 500, kind: 'lp', env: fall(6), amp: .7 }); for (let i = 0; i < 24; i++) { const f = 180 + r() * 500; ring(o, .15 + i * .055, f, .03, .4 * (1 - i / 30), f * 1.9, .03); } } },

  'bridge.groan': { s: 2.45, peak: .85, variants: 3, make(o, r) { strain(o, 2.4, r, [[120, .05, .7], [290, .025, .5], [610, .01, .3]], 1, .07, .028); hiss(o, 0, 2.4, r, { from: 180, kind: 'lp', amp: .3 }); } },
  'plank.crack': { s: .55, peak: .85, variants: 3, make(o, r) { hiss(o, 0, .01, r, { from: 3000, kind: 'hp', env: fall(3), amp: 1 }); ring(o, 0, 260, .04, .7); clatter(o, 0, .18, 8, r, 700, 2600, .006, .5, 1); } },
  'bridge.fall': { s: 4.1, peak: .95, make(o, r) { ring(o, 0, 60, .8, .9, 32, .3); hiss(o, 0, 3.8, r, { from: 900, to: 100, kind: 'lp', env: fall(2.5), amp: .9 }); clatter(o, 0, 3.2, 70, r, 250, 1800, .02, .7, .6); } },

  'snake.hiss': { s: 1.45, peak: .55, variants: 2, make(o, r) { hiss(o, 0, 1.4, r, { from: 4200, kind: 'hp', q: .7, env: (u) => bell(Math.pow(u, .5)) * (.75 + .25 * Math.sin(TAU * 12 * u)), amp: 1 }); } },
  'snake.strike': { s: .4, peak: .9, make(o, r) { hiss(o, 0, .18, r, { from: 1800, to: 5200, q: 1.2, amp: .9 }); ring(o, .17, 110, .05, 1, 70, .03); } },
  'bite.sting': { s: 2.7, peak: .95, make(o, r) { ring(o, 0, 70, .25, 1, 40, .08); hiss(o, 0, .35, r, { from: 3000, to: 300, kind: 'lp', env: fall(7), amp: .7 }); ring(o, 0, 3150, 1, .1); ring(o, 0, 3170, 1, .1); } },
  'dream.swell': { s: 7.6, peak: .85, make(o, r) {
    const n = Math.floor(7.5 * RATE), voices = [55, 82.6, 110.7, 164.2].map((f) => ({ f, ph: r() * TAU }));
    for (let i = 0; i < n; i++) { const u = i / n, e = Math.pow(u, 1.8) * (1 - Math.pow(u, 40)), bend = 1 + .5 * u * u; let x = 0; for (const v of voices) { v.ph += TAU * v.f * bend / RATE; x += Math.sin(v.ph); } o[i] = x * e / voices.length; }
    hiss(o, 0, 7.5, r, { from: 200, to: 3200, q: 1.1, env: (u) => Math.pow(u, 2.2) * (1 - Math.pow(u, 40)), amp: .9 });
  } },
  'wake.heart': { s: .85, peak: .9, make(o) { ring(o, 0, 62, .07, 1, 44, .02); ring(o, .28, 58, .09, .7, 42, .02); } },

  'frog.a': { s: .32, peak: .6, variants: 3, make(o, r) { const f = 470 + r() * 140, n = .24 * 38 | 0; for (let i = 0; i < n; i++) { const e = bell((i + .5) / n); ring(o, i / 38, f, .008, e); ring(o, i / 38, f * 2.5, .004, .5 * e); } } },
  'frog.b': { s: .18, peak: .5, variants: 3, make(o, r) { const f = 2300 + r() * 500, nn = Math.floor(.14 * RATE); let ph = 0; for (let i = 0; i < nn; i++) { ph += TAU * (f + 600 * i / nn) / RATE; o[i] = Math.sin(ph) * bell(i / nn); } } },
  'frog.c': { s: .75, peak: .7, variants: 2, make(o, r) { const pulses = 10, f = 88 + r() * 16; for (let i = 0; i < pulses; i++) { const e = bell((i + .5) / pulses), t = i * .07; ring(o, t, f * 2, .03, e); ring(o, t, f * 4.4, .018, .5 * e); ring(o, t, f, .05, .7 * e); } } },

  'groan.low': { s: 2.5, peak: .8, variants: 4, make(o, r, v) { const f0 = 78 + r() * 27; throat(o, r, 1.4 + r() * 1, { f0, f1: f0 * (.8 + r() * .1), vowel: ['uh', 'aw', 'oo', 'uh'][v], breath: .08 }); } },
  'groan.hunt': { s: 1.2, peak: .85, variants: 3, make(o, r, v) { const f0 = 118 + r() * 24; throat(o, r, .8 + r() * .3, { f0, f1: f0 * 1.25, wob: .09, vowel: ['aw', 'uh', 'aw'][v], rough: .5, breath: .14, env: (u) => Math.sin(Math.PI * Math.pow(u, .7)) }); } },
  'groan.grab': { s: 1.3, peak: .95, variants: 2, make(o, r, v) { const f0 = 92 + r() * 14; throat(o, r, 1.2, { f0, f1: f0 * 1.45, wob: .12, vowel: ['aw', 'uh'][v], rough: .8, breath: .2 }); } },

  'amb.wind': { s: 13, loop: 1, peak: .8, kind: 'loop', make(o, r) {
    const f = new Filter(400, 1), w = new Filter(850, 6), p1 = r() * 6, p2 = r() * 6, p3 = r() * 6;
    for (let i = 0; i < o.length; i++) {
      const t = i / RATE, gust = .55 + .28 * Math.sin(TAU * .083 * t + p1) + .17 * Math.sin(TAU * .21 * t + p2) + .08 * Math.sin(TAU * .57 * t + p3);
      if (i % 32 === 0) f.set(180 + 520 * gust * gust);
      const n = r() * 2 - 1; f.run(n); w.run(n); o[i] = f.lp * gust + w.bp * .12 * gust * gust;
    }
  } },
  'amb.river': { s: 6.5, loop: .5, peak: .7, kind: 'loop', make(o, r) { hiss(o, 0, 6.5, r, { from: 650, q: .5, env: (u) => .8 + .2 * Math.sin(TAU * 3 * u), amp: 1 }); for (let i = 0; i < 120; i++) drip(o, r() * 6.4, 300 + r() * 900, .04 + r() * .1); } },
  // whole numbers of quarter hertz, and chirps that fit, so that it comes round to where it started
  'amb.crickets': { s: 4, exact: true, peak: .6, kind: 'loop', make(o) {
    const pulse = (t, at, on) => { const d = t - at; return d < 0 || d > on ? 0 : Math.min(1, d / .003, (on - d) / .003); };
    for (let i = 0; i < o.length; i++) {
      const t = i / RATE, a = t % .5, b = (t + .11) % (4 / 7), c = .22 * (.5 + .5 * Math.sin(TAU * t / 4)) * (.5 + .5 * Math.sin(TAU * 20 * t));
      o[i] = Math.sin(TAU * 4300 * t) * (pulse(a, 0, .022) + pulse(a, .044, .022) + pulse(a, .088, .022)) + .6 * Math.sin(TAU * 3650 * t) * (pulse(b, 0, .03) + pulse(b, .06, .03)) + c * Math.sin(TAU * 5000 * t);
    }
  } },
  'amb.fire': { s: 4.4, loop: .4, peak: .75, kind: 'loop', make(o, r) { hiss(o, 0, 4.4, r, { from: 240, kind: 'lp', env: () => 1, amp: .35 }); for (let i = 0; i < 60; i++) ring(o, r() * 4.3, 1300 + r() * 3900, .0015 + r() * .0035, Math.pow(r(), 3)); for (let i = 0; i < 5; i++) ring(o, r() * 4.2, 400 + r() * 300, .008, .6); } },
  'engine.car': { s: 1.2, exact: 1, peak: .7, kind: 'loop', make(o, r) { engine(o, r, 36, [[130, .9], [340, .5], [880, .16]], .018, .25); } },
  'engine.pickup': { s: 1.2, exact: 1, peak: .8, kind: 'loop', make(o, r) { engine(o, r, 28, [[92, 1], [240, .6], [620, .22]], .024, .55); } },
  'engine.quad': { s: 1.2, exact: 1, peak: .75, kind: 'loop', make(o, r) { engine(o, r, 17, [[150, 1], [470, .7], [1300, .3]], .022, .35); } },
  'engine.golf': { s: 1, exact: true, peak: .5, kind: 'loop', make(o) { for (let i = 0; i < o.length; i++) { const t = i / RATE; o[i] = Math.sin(TAU * 190 * t) + .4 * Math.sin(TAU * 380 * t) + .15 * Math.sin(TAU * 570 * t); } } },
  'vehicle.road': { s: 2.3, loop: .3, peak: .6, kind: 'loop', make(o, r) { hiss(o, 0, 2.3, r, { from: 900, kind: 'lp', q: .5, env: () => 1, amp: 1 }); } },
  'vehicle.dirt': { s: 2.3, loop: .3, peak: .65, kind: 'loop', make(o, r) { hiss(o, 0, 2.3, r, { from: 1300, kind: 'lp', q: .6, env: () => 1, amp: .8 }); clatter(o, 0, 2.2, 70, r, 900, 3600, .004, .5); } },
  'vehicle.skid': { s: 1.8, loop: .3, peak: .55, kind: 'loop', make(o, r) { hiss(o, 0, 1.8, r, { from: 1400, q: 2.2, env: () => 1, amp: 1 }); hiss(o, 0, 1.8, r, { from: 920, q: 3, env: () => 1, amp: .7 }); } },

  // the score's parts. src/sound.js plays them and has the drones in it, which aren't buffers.
  'music.pluck': { s: 3.6, peak: .85, kind: 'music', make(o, r) {
    // a plucked string, plucked once, the way Karplus and Strong worked out: a loop that's as long as the note's period and loses a little each time round
    const period = Math.round(RATE / 110), line = new Float32Array(period), body = new Filter(190, 2.2), box = new Filter(430, 3), soft = new Filter(2400, .7);
    for (let i = 0; i < period; i++) { soft.run(r() * 2 - 1); line[i] = soft.lp * 1.6; }
    let at = 0, last = 0;
    for (let i = 0; i < o.length; i++) { const x = line[at], y = .996 * (.5 * x + .5 * last); last = x; line[at] = y; at = (at + 1) % period; body.run(x); box.run(x); o[i] = x + body.bp * .5 + box.bp * .35; }
  } },
  'music.thump': { s: .62, peak: .95, kind: 'music', make(o) { ring(o, 0, 62, .16, 1, 41, .03); for (let i = 0; i < o.length; i++) o[i] = Math.tanh(o[i] * 2); } },
  'music.tick': { s: .09, peak: .6, kind: 'music', make(o, r) { hiss(o, 0, .08, r, { from: 5000, kind: 'hp', env: fall(7), amp: 1 }); ring(o, 0, 3100, .01, .4); } },
  'music.bow': { s: 1.65, peak: .8, kind: 'music', make(o) {
    const f = new Filter(600, .9), n = Math.floor(1.6 * RATE); let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / RATE, u = i / n; ph += 73.42 / RATE; if (ph >= 1) ph -= 1; if (i % 32 === 0) f.set(600 + 300 * Math.sin(Math.PI * u)); f.run(1 - 2 * ph); o[i] = f.lp * Math.min(1, t / .06) * Math.min(1, (1.6 - t) / .3) * (.8 + .2 * Math.sin(TAU * 5.5 * t)); }
  } },
};

export const variantsOf = (name) => RECIPES[name]?.variants ?? 1;

// Works one out: mono samples, as RATE, no louder than its peak, starting and stopping on nothing unless it loops
export function render(name, v = 0) {
  const R = RECIPES[name];
  if (!R) throw new Error(`No sound called ${name}`);
  let o = new Float32Array(Math.ceil(R.s * RATE));
  R.make(o, randomFrom(seedOf(name, v)), v);
  if (R.loop) {
    const L = o.length - Math.ceil(R.loop * RATE), n = o.length - L, out = o.slice(0, L);
    for (let i = 0; i < n; i++) { const k = i / n; out[i] = o[i] * Math.sqrt(k) + o[L + i] * Math.sqrt(1 - k); }
    o = out;
  } else if (R.exact === 1) o = o.slice(0, RATE);
  let mean = 0, top = 0;
  for (let i = 0; i < o.length; i++) mean += o[i];
  mean /= o.length;
  for (let i = 0; i < o.length; i++) { o[i] -= mean; top = Math.max(top, Math.abs(o[i])); }
  if (top > 0) for (let i = 0; i < o.length; i++) o[i] *= R.peak / top;
  // only just enough at the start to stop a click, because the first couple of milliseconds are most of what a crack or a snap is
  if (!R.loop && !R.exact) { for (let i = 0; i < 6; i++) o[i] *= i / 6; for (let i = 0, n = Math.min(64, o.length >> 1); i < n; i++) o[o.length - 1 - i] *= i / n; }
  return o;
}
