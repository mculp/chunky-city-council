// What he can throw to move the crowd without fighting it. There's no three.js or page in here, so node tests load it too. How they look and sound is in index.html.
//
// Each one says how far off it can be made out and for how long. What the crowd does about it is in src/horde.js: while one's going they go to it, and can't make out
// anything else unless he's right on top of them. A car alarm isn't thrown, but anything that is can set one off. The church bell isn't either: it's with the church, in index.html.

export const LURES = {
  // he's been able to throw these for a while, and they're a bomb, not a lure. They come along here so that there's one list of what's in his hand.
  gas: { name: 'gas', word: 'GAS', carry: 4 },
  bottle: { name: 'bottle', word: 'BOTTLE', carry: 6, speed: 20, up: 6, reach: 32, seconds: 4 },
  crackers: { name: 'firecrackers', word: 'CRACKERS', carry: 6, speed: 14, up: 6, reach: 60, seconds: 8 },
  fluid: { name: 'lighter fluid', word: 'FLUID', carry: 4, speed: 13, up: 5.5, reach: 40, seconds: 18 },
  // a bean can's a smell rather than a noise, and he smells of it that bit less himself afterwards
  can: { name: 'beans', word: 'BEANS', speed: 14, up: 6, reach: 24, seconds: 12 },
};
// A car alarm brings the crowd for its seconds, and is only heard for the first few of them, while all there is to play for it is a siren.
export const ALARM = { reach: 80, seconds: 15, sounds: 5, kinds: new Set(['car', 'pickup', 'coupe']) };
// What a lure does for anyone caught where the crowd ends up. They don't take it well: a point of trust, at most once every couple of minutes.
export const SWARM = { lure: 16, close: 9, count: 4, remember: 40, again: 120 };

// the order they come up in. Beans last, because it costs him a can, and gas after the lures, because it's the loudest way to make a point.
const ORDER = ['bottle', 'crackers', 'fluid', 'gas', 'can'];
const G = 15;

// What's still in his hand, given how many he has of each, or what he should have there if that's run out
export const inHand = (have, current) => (have[current] > 0 ? current : ORDER.find((k) => have[k] > 0) ?? null);
// The next thing he's got, going round
export function nextUp(have, current) {
  const from = ORDER.indexOf(current);
  for (let i = 1; i <= ORDER.length; i++) { const k = ORDER[(from + i) % ORDER.length]; if (have[k] > 0) return k; }
  return null;
}
export const kindsHeld = (have) => ORDER.filter((k) => have[k] > 0).length;

// How long it's in the air, if where it lands is drop below his hand, and so how far it can go
const airTime = (lure, drop) => (lure.up + Math.sqrt(lure.up * lure.up + 2 * G * drop)) / G;
export const rangeOf = (lure, drop = 1.7) => lure.speed * airTime(lure, drop);
// How he throws it. Given how far off something is, it lands there if it can reach.
export function throwOf(lure, fx, fz, dist = null, drop = 1.7) {
  const t = airTime(lure, drop), speed = dist === null ? lure.speed : Math.min(lure.speed, dist / t);
  return { vx: fx * speed, vy: lure.up, vz: fz * speed, t };
}
export const GRAVITY = G;

// The nearest thing in front of him that's in range. A thumb can't aim at a car from across a lot, so the throw goes to it if it's close to where he's facing.
export function aimedAt(x, z, fx, fz, things, far, { near = 3, cone = .966 } = {}) {
  let best = null, bd = far;
  for (const o of things) {
    const dx = o.x - x, dz = o.z - z, d = Math.hypot(dx, dz);
    if (d < near || d >= bd || (dx * fx + dz * fz) / d < cone) continue;
    best = o; bd = d;
  }
  return best;
}

// Who's got the crowd around them because of what he threw: a lure came down near them, and enough of the crowd are there now.
export function whoIsSwarmed(spots, folks, crowd) {
  const out = [];
  for (const f of folks) {
    if (!spots.some((l) => Math.hypot(l.x - f.x, l.z - f.z) < SWARM.lure)) continue;
    let n = 0;
    for (const s of crowd) if (Math.hypot(s.x - f.x, s.z - f.z) < SWARM.close) n++;
    if (n >= SWARM.count) out.push(f.id);
  }
  return out;
}
