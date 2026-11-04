// What's broken in a town everyone shares (CHUNKY-152), as everyone agrees on it. There's no three.js or page in here, so the town
// uses it too. A wreck is the whole state of one thing, never what happened to it, and two of them only ever come together towards
// more broken. So whatever order they come in and whoever saw what, everyone ends up with the same.
//
// What a thing's known by:
//   b<id>             a building, by its structure id, with how many parts it's written in
//   p<kind>:<x>:<z>   a prop, by its kind and where it stands to 10 cm, with #n after it for another of the same in the same place
//   t<x>:<z>          a tree, by where it stands to 10 cm
//   v<n>              a vehicle, by its place in the game's list
// Each also says where it is in the world, x and z, for who's near it.
//
// What each one holds:
//   b  n, how many parts; o: 1 once it's given out; p, its parts that aren't as they were built, six bytes each: the part (two),
//      what's happened to it (gone 1, its glass cracked 2, burning 4), which way it fell, its hit points and how dark it's gone
//   p  d, which way it went over
//   t  d, which way it went over, and f: down 1, burnt 2
//   v  h, its hit points; f: wrecked 1, gone up 2, drowned 4; and where it is, y and yaw as well
// Hit points and darkness are out of BYTE, and a direction is a turn split into 256. AT_ONCE is the most the town takes from a phone in
// one message.
import { SAY_MOST } from './net.js';

export const BYTE = 255, PARTS_MOST = 4096, VEHICLES_MOST = 4096, AT_ONCE = 64;
const EDGE = 40000;
const KEYS = { b: /^b\d{1,12}$/, p: /^p[a-z_]{1,24}:-?\d{1,7}:-?\d{1,7}(#\d{1,3})?$/, t: /^t-?\d{1,7}:-?\d{1,7}$/, v: /^v\d{1,4}$/ };
const GONE = 1, CRACKED = 2, BURNING = 4, DOWN = 1, BURNT = 2;

const tenth = (n) => Math.round(n * 10);
export const keyOf = {
  building: (id) => `b${id}`,
  prop: (kind, x, z) => `p${kind}:${tenth(x)}:${tenth(z)}`,
  tree: (x, z) => `t${tenth(x)}:${tenth(z)}`,
  vehicle: (i) => `v${i}`,
};
export const kindOf = (k) => { const c = typeof k === 'string' ? k[0] : ''; return KEYS[c]?.test(k) ? c : null; };

export const dirByte = (dx, dz) => ((Math.round(Math.atan2(dz, dx) / (2 * Math.PI) * 256) % 256) + 256) % 256;
export const dirOf = (b) => { const a = b / 256 * 2 * Math.PI; return [Math.cos(a), Math.sin(a)]; };

export function encodeParts(parts) {
  let s = '';
  for (const q of parts) s += String.fromCharCode(q.part >> 8, q.part & 255, (q.gone ? GONE : 0) | (q.cracked ? CRACKED : 0) | (q.burning ? BURNING : 0), q.dir, q.hp, q.shade);
  return btoa(s);
}
// It throws on anything that isn't base64, and says null for anything that isn't six bytes a part
export function decodeParts(text) {
  const s = atob(text), parts = [];
  if (s.length % 6) return null;
  for (let i = 0; i < s.length; i += 6) {
    const f = s.charCodeAt(i + 2);
    parts.push({ part: (s.charCodeAt(i) << 8) | s.charCodeAt(i + 1), gone: !!(f & GONE), cracked: !!(f & CRACKED), burning: !!(f & BURNING), dir: s.charCodeAt(i + 3), hp: s.charCodeAt(i + 4), shade: s.charCodeAt(i + 5) });
  }
  return parts;
}
// One way of saying each part: nothing burns that's down, a part that's standing fell no way, and one that's as it was built isn't said
const tidyPart = (q) => ({ ...q, burning: q.burning && !q.gone, dir: q.gone ? q.dir : 0 });
const touched = (q) => q.gone || q.cracked || q.burning || q.hp < BYTE || q.shade < BYTE;
const sortParts = (parts) => parts.map(tidyPart).filter(touched).sort((a, b) => a.part - b.part);

const isByte = (n) => Number.isInteger(n) && n >= 0 && n <= BYTE;
const where = (n) => Number.isFinite(n) && Math.abs(n) < EDGE;
// What a phone says is broken, as only what the game could have, or null
export function tidy(w) {
  if (!w || typeof w !== 'object') return null;
  const kind = kindOf(w.k);
  if (!kind || !where(w.x) || !where(w.z)) return null;
  const out = { k: w.k, x: tenth(w.x) / 10, z: tenth(w.z) / 10 };
  if (kind === 'b') {
    if (!(Number.isInteger(w.n) && w.n >= 1 && w.n <= PARTS_MOST) || typeof w.p !== 'string' || w.p.length > PARTS_MOST * 8) return null;
    let parts;
    try { parts = decodeParts(w.p); } catch { return null; }
    if (!parts || parts.some((q) => q.part >= w.n) || new Set(parts.map((q) => q.part)).size !== parts.length) return null;
    return { ...out, n: w.n, ...(w.o === 1 && { o: 1 }), p: encodeParts(sortParts(parts)) };
  }
  if (kind === 'p') return isByte(w.d) ? { ...out, d: w.d } : null;
  if (kind === 't') return isByte(w.d) && Number.isInteger(w.f) && w.f >= DOWN && w.f <= (DOWN | BURNT) ? { ...out, d: w.d, f: w.f } : null;
  if (+w.k.slice(1) >= VEHICLES_MOST || !(Math.abs(w.y) < EDGE) || !Number.isFinite(w.yaw) || !isByte(w.h) || !(Number.isInteger(w.f) && w.f >= 0 && w.f <= 7)) return null;
  return { ...out, y: Math.round(w.y * 100) / 100, yaw: Math.round(w.yaw * 1000) / 1000, h: w.h, f: w.f };
}

// What's kept of it: everything but what's burning, since fires go out
export function lasting(w) {
  if (kindOf(w.k) !== 'b') return w;
  return { ...w, p: encodeParts(decodeParts(w.p).map((q) => ({ ...q, burning: false }))) };
}
export const partsIn = (w) => (kindOf(w.k) === 'b' ? atob(w.p).length / 6 : 0);

// `had` is what's kept, or null, and `w` a tidy wreck of the same thing. It answers with what's kept now, what to tell everyone else, which
// is that and whatever's burning on the phone that said it, and whether there's anything new in it.
export function merge(had, w) {
  if (!had || (had.n ?? 0) !== (w.n ?? 0)) return { kept: lasting(w), told: w, changed: true };
  const kind = kindOf(w.k);
  if (kind === 'p') return { kept: had, told: had, changed: false };
  if (kind === 't') {
    const f = had.f | w.f, kept = { ...had, d: had.f & DOWN ? had.d : w.d, f };
    return { kept, told: kept, changed: f !== had.f };
  }
  if (kind === 'v') {
    const kept = { ...w, h: Math.min(had.h, w.h), f: had.f | w.f };
    return { kept, told: kept, changed: ['x', 'z', 'y', 'yaw', 'h', 'f'].some((f) => kept[f] !== had[f]) };
  }
  const parts = new Map(decodeParts(had.p).map((q) => [q.part, q])), burning = new Set();
  for (const q of decodeParts(w.p)) {
    if (q.burning) burning.add(q.part);
    const m = parts.get(q.part);
    if (!m) { parts.set(q.part, { ...q, burning: false }); continue; }
    parts.set(q.part, { part: q.part, gone: m.gone || q.gone, dir: m.gone ? m.dir : q.dir, cracked: m.cracked || q.cracked, burning: false, hp: Math.min(m.hp, q.hp), shade: Math.min(m.shade, q.shade) });
  }
  const list = sortParts([...parts.values()]), kept = { ...had, ...((had.o || w.o) && { o: 1 }), p: encodeParts(list) };
  const told = { ...kept, p: encodeParts(list.map((q) => ({ ...q, burning: burning.has(q.part) && !q.gone }))) };
  return { kept, told, changed: kept.p !== had.p || kept.o !== had.o };
}

// ---------------- on a phone
// What src/damage.js's read() says of a building, as wrecks: its parts in bytes, rounded towards more broken, and in pieces of at most
// `most` parts, since a phone can only say so much at once. The town puts the pieces back together. One as it was built says nothing.
export function houseWrecks(k, x, z, n, { out, parts }, most = 200) {
  if (!parts.length && !out) return [];
  const said = parts.map((q) => ({ part: q.part, gone: q.gone, cracked: q.cracked, burning: q.burning, dir: q.gone ? dirByte(q.dirx, q.dirz) : 0, hp: Math.max(0, Math.floor(q.hp / q.max * BYTE)), shade: Math.max(0, Math.floor(q.shade * BYTE)) }));
  const list = [];
  for (let i = 0; i < Math.max(1, said.length); i += most) list.push({ k, x, z, n, ...(out && { o: 1 }), p: encodeParts(said.slice(i, i + most)) });
  return list;
}
// and back, as src/damage.js's take() has it, against the building's own parts (`built`, by part). A part it hasn't got is left.
export function takenParts(w, built) {
  const out = [];
  for (const q of decodeParts(w.p)) {
    const p = built[q.part];
    if (!p) continue;
    const [dirx, dirz] = dirOf(q.dir);
    out.push({ part: q.part, gone: q.gone, cracked: q.cracked, burning: q.burning, dirx, dirz, hp: q.hp / BYTE * p.max, shade: q.shade / BYTE });
  }
  return out;
}
// What a phone says, in as few messages as it fits in: none longer than the town hears and none with more than it takes at once, in the
// order it was said.
export function batches(list, most = SAY_MOST) {
  const empty = JSON.stringify({ t: 'wreck', w: [] }).length, out = [];
  let now = [], size = empty;
  for (const w of list) {
    const n = JSON.stringify(w).length;
    // never, since a building's said in pieces, and one that long would have him let go of
    if (empty + n > most) continue;
    if (now.length && (size + 1 + n > most || now.length >= AT_ONCE)) { out.push(now); now = []; size = empty; }
    size += (now.length ? 1 : 0) + n; now.push(w);
  }
  if (now.length) out.push(now);
  return out;
}
