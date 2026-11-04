// Fast travel, part 1 (CHUNKY-176): rings of pale mushrooms at ten public places, all known from the start. Standing in one on foot, he eats one and comes to
// sitting up in any other he picks on the map. There isn't a word in any of it. This is where a ring settles and when each part of the trip happens, so the
// page and the tests agree. There's no three.js or page in here, so node tests load it too. Where each ring is, about, is data/rings.json.

// In metres and seconds: how far across a ring's middle is to its mushrooms, how near its middle he has to be to eat, and how long nobody goes for him where he comes to
export const RING = { r: 1.5, reach: 1.6, grace: 6 };

// The trip, three and a half seconds: he sits down as the world bends into the fever's pink and cyan, is somewhere else at the height of it, and comes to sitting
// up as it goes. With reduced motion it's a fade to dark and back, quicker.
export const TRIP = {
  sit: .5, bend: 1.4, come: 1.6,
  still: { sit: .3, bend: .4, come: .6 },
};

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const times = (still) => (still ? TRIP.still : TRIP);
// When he's somewhere else, and when it's over
export const tripSwap = (still = false) => { const T = times(still); return T.sit + T.bend; };
export const tripLong = (still = false) => tripSwap(still) + times(still).come;

// Where it's got to t seconds after he ate: 'going', then 'coming' once he's somewhere else, then 'up'. `down` is how far he's sat down, from 0 standing to 1
// sitting, `heat` how far the world's bent, and `fade` how much of the picture there is, which only goes with reduced motion.
export function tripAt(t, still = false) {
  const T = times(still), at = tripSwap(still);
  if (t < at) return { part: 'going', down: smooth(0, T.sit, t), heat: still ? 0 : smooth(0, at, t), fade: still ? 1 - smooth(T.sit, at, t) : 1 };
  if (t < at + T.come) return { part: 'coming', down: 1 - smooth(at + T.come * .4, at + T.come, t), heat: still ? 0 : 1 - smooth(at, at + T.come, t), fade: still ? smooth(at, at + T.come * .6, t) : 1 };
  return { part: 'up', down: 0, heat: 0, fade: 1 };
}

// Where a ring goes near `about`: there, if `ok(x, z)` says a ring can go all round it, and otherwise the nearest spot that will do, going round and out in
// `step`s as far as `far`. The same every time. Null if there's nowhere.
export function settle([ax, az], ok, { step = .75, far = 40 } = {}) {
  if (ok(ax, az)) return [ax, az];
  for (let r = step; r <= far + 1e-9; r += step) {
    const n = Math.max(8, Math.round(2 * Math.PI * r / step));
    for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI, x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r; if (ok(x, z)) return [x, z]; }
  }
  return null;
}

// Which ring he's standing in, by its place in the list, or -1
export function ringAt(rings, x, z) {
  for (let i = 0; i < rings.length; i++) if (Math.hypot(rings[i].x - x, rings[i].z - z) <= RING.reach) return i;
  return -1;
}

// Which ring a tap on the map is for: the nearest of `spots`, each [x, y] on the screen, within `within` pixels, or -1
export function pickRing(spots, x, y, within = 26) {
  let best = -1, near = within;
  spots.forEach(([sx, sy], i) => { const d = Math.hypot(sx - x, sy - y); if (d <= near) { near = d; best = i; } });
  return best;
}
