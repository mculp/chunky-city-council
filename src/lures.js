// What he can throw to slip past the ones who've burnt down. There's no three.js or page in here, so node tests load it too. How they look and sound is in index.html.
//
// Each one says how near a burnt-down one has to be to turn and look at where it came down (reach), how long it's there (seconds) and how long they look for (look): a few seconds for a bottle,
// as long as firecrackers go off for, and as long as a fire of lighter fluid burns. What they make of it is in src/horde.js: they look, they can't make out anything else while they do, and
// nobody walks over. Walking at full pace it takes about seven seconds to get from a dozen metres short of one stood by the road to well past it and out of earshot, so that's what a bottle gets.
// The ones who've gone quiet don't care. Nothing draws a crowd but supper, and he can't throw that yet, so a can of beans isn't in his hand any more.
// A car alarm isn't thrown, but anything that is can set one off, and it's only noise, the same as a crash: it rouses the burnt-down ones near enough to hear it, and they come for him.

export const LURES = {
  // he's been able to throw these for a while, and they're a bomb, not a distraction. They come along here so that there's one list of what's in his hand.
  gas: { name: 'gas', word: 'GAS', carry: 4 },
  bottle: { name: 'bottle', word: 'BOTTLE', carry: 6, speed: 20, up: 6, reach: 14, seconds: 7, look: 7 },
  crackers: { name: 'firecrackers', word: 'CRACKERS', carry: 6, speed: 14, up: 6, reach: 24, seconds: 8, look: 8 },
  fluid: { name: 'lighter fluid', word: 'FLUID', carry: 4, speed: 13, up: 5.5, reach: 14, seconds: 18, look: 18 },
};
// A car alarm is noise, like a crash. It's only heard for the first few seconds of its 15, while all there is to play for it is a siren, and that's how long it rouses anyone.
// Its lights go on and off for all 15.
export const ALARM = { reach: 80, seconds: 15, sounds: 5, kinds: new Set(['car', 'pickup', 'coupe']) };

// the order they come up in. Gas after the rest, because it's the loudest way to make a point.
const ORDER = ['bottle', 'crackers', 'fluid', 'gas'];
const G = 15;

// What's still in his hand, given how many he has of each, or what he should have there if that's run out
export const inHand = (have, current) => (have[current] > 0 && ORDER.includes(current) ? current : ORDER.find((k) => have[k] > 0) ?? null);
// The next thing he's got, going round
export function nextUp(have, current) {
  const from = ORDER.indexOf(current);
  for (let i = 1; i <= ORDER.length; i++) {
    const k = ORDER[(from + i) % ORDER.length];
    if (have[k] > 0) return k;
  }
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
