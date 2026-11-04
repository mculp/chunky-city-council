// What breaks, and what comes down with it. There's no three.js or page in here, so node tests load it too. How it looks is in index.html.
//
// A building is the pieces src/structures.js writes it in. Walls hold up the roof, and each other: take enough of them
// away and what they held comes down, and past a point the rest follows. What's gone stays gone when its cell is
// dropped and written again, because a piece is known by its place in the building.
import { Sheet, writeStructure, wallsOf, hash2 } from './structures.js';

// How many swings of the skillet, near enough
const WALLS = { mobile: 1.2, plank: 1.5, siding: 2, metal: 2.5, stucco: 3, block: 4, brick: 4.5 };
const TOUGH = { lintel: 1.2, door: .5, window: .25, shutter: .25, kudzu: .2, bay: 1.5, post: 1, roof: 1.5, gable: 2, porch: 1, carport: 1, vent: .4 };
// Brick and block crumble where they stand. Everything else comes down in sheets.
const MASONRY = new Set(['brick', 'block', 'stucco']);
const FACING = new Set(['wall', 'lintel', 'door', 'bay', 'post']);   // what a swing can land on
const HELD_UP = new Set(['roof', 'gable', 'porch', 'carport', 'vent']);
const HANGING = new Set(['window', 'shutter', 'door', 'bay', 'kudzu']);
const GIVES_OUT = .6;                // the share of its walls a building can lose before the rest follows
const CRACK_RUNS = .2;               // how much a wall's neighbours lose when it goes
// How fast it burns, in hit points a second. Brick, block and tin walls have nothing in them to burn, so a fire in one of those takes the roof and leaves them standing.
const BURN_WALLS = { mobile: .13, plank: .11, siding: .085 };
const BURNS = { kudzu: .12, door: .05, shutter: .06, bay: .05, post: .05, porch: .07, carport: .07, vent: .05 };
const SPREADS = 3.4;                 // metres a fire reaches within a building
export function burnRate(s, p) {
  if (p.kind === 'wall' || p.kind === 'lintel') return BURN_WALLS[s.walls] ?? 0;
  if (p.kind === 'gable') return (BURN_WALLS[s.walls] ?? 0) * .8 || .04;
  if (p.kind === 'roof') return s.roofMat === 'metal' ? .03 : .065;
  return BURNS[p.kind] ?? 0;
}

const scratch = new Sheet();
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function toSegment(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

// Everything a building is made of, and what's holding what up
export function partsOf(s, base = 0) {
  scratch.reset(); writeStructure(scratch, s, base);
  const { panels } = wallsOf(s, base), parts = scratch.pieces.map((p) => {
    const max = p.kind === 'wall' ? WALLS[s.walls] ?? 2 : TOUGH[p.kind] ?? 1;
    return { part: p.part, kind: p.kind, panel: p.panel, on: p.on, x: p.x, y: p.y, z: p.z, first: p.first, count: p.count, hp: max, max, gone: false, dirx: 0, dirz: 0, holds: [], carries: [], under: [] };
  });
  const byPanel = new Map(), walls = [], posts = [];
  for (const p of parts) {
    // `stop` is what src/structures.js's colliders call it: the panel, or for the kth post -1 - k
    if (p.panel !== undefined) { byPanel.set(p.panel, p); p.stop = p.panel; if (p.kind === 'wall' || p.kind === 'lintel') walls.push(p); }
    if (p.kind === 'post') { p.stop = -1 - posts.length; posts.push(p); }
  }
  for (const p of parts) {
    if (HANGING.has(p.kind) && byPanel.has(p.on)) byPanel.get(p.on).holds.push(p);
    if (!HELD_UP.has(p.kind)) continue;
    // a porch stands on its posts, and anything else on the walls nearest it
    const by = (p.kind === 'porch' || p.kind === 'carport') && posts.length ? posts : walls, near = by.reduce((n, w) => Math.min(n, dist2(p, w)), Infinity), reach = near + (p.kind === 'gable' ? 2.5 : 3.2);
    for (const w of by) if (dist2(p, w) <= reach) { p.under.push(w); w.carries.push(p); }
  }
  // the panels either side of a panel, as they run around the walls
  const n = panels.length;
  for (const w of walls) { w.prev = byPanel.get((w.panel + n - 1) % n) ?? null; w.next = byPanel.get((w.panel + 1) % n) ?? null; }
  return { s, base, parts, panels, walls, posts };
}

// on: { fall(s, part), crack(s, part), shatter(s, part) }. spared(s) is a building nothing happens to, which online is any at the places
// set aside (src/aside.js).
export function createDamage({ base = 0, on = {}, spared = () => false } = {}) {
  const states = new Map();
  const state = (s) => { let st = states.get(s.index); if (!st) { st = partsOf(s, base); st.delay = 0; st.givenOut = false; st.burning = new Set(); states.set(s.index, st); } return st; };
  // In a town everyone shares (CHUNKY-152): the buildings that have changed here since that was last asked, by their place in the list.
  // What's taken from another phone isn't a change here.
  const changed = new Map();
  let taking = false;
  const mark = (s) => { if (!taking) changed.set(s.index, s); };
  const standing = (st) => st.walls.reduce((n, w) => n + (w.gone ? 0 : 1), 0);

  // Which way it goes: a wall falls the way it was hit, and left to itself it mostly falls in on the building
  function aim(st, p, dx, dz) {
    if (p.panel === undefined || p.kind === 'lintel') { const l = Math.hypot(dx, dz) || 1; p.dirx = dx / l; p.dirz = dz / l; if (!dx && !dz) { p.dirx = 1; p.dirz = 0; } return; }
    const q = st.panels[p.panel], sign = dx || dz ? (dx * q.nx + dz * q.nz >= 0 ? 1 : -1) : hash2(st.s.id | 0, 2000 + p.part) < .78 ? -1 : 1;
    p.dirx = q.nx * sign; p.dirz = q.nz * sign;
  }
  function fall(st, p, dx, dz, delay) {
    if (p.gone) return;
    p.gone = true; p.delay = delay; aim(st, p, dx, dz); mark(st.s);
    const wasBurning = st.burning.delete(p);
    on.fall?.(st.s, p, wasBurning);
    const after = delay + .08;
    for (const q of p.holds) fall(st, q, dx, dz, after);
    if (p.kind !== 'wall' && p.kind !== 'lintel' && p.kind !== 'post') { if (HELD_UP.has(p.kind)) for (const w of p.under) lonely(st, w, after); return; }
    // what it held comes down once too little's left under it
    for (const r of p.carries) if (!r.gone && r.under.filter((w) => !w.gone).length < r.under.length / 2) fall(st, r, 0, 0, after + hash2(st.s.id | 0, 3000 + r.part) * .22);
    if (p.kind === 'post') return;
    // the crack runs into the panels beside it, and one with nothing left to lean on goes too
    for (const w of [p.prev, p.next]) {
      if (!w || w.gone) continue;
      w.hp -= w.max * CRACK_RUNS;
      if (w.hp <= 0) fall(st, w, 0, 0, after + .1); else { on.crack?.(st.s, w); lonely(st, w, after); }
    }
    if (!st.givenOut && 1 - standing(st) / st.walls.length >= GIVES_OUT) giveOut(st, p, after);
  }
  // A panel with both neighbours gone and nothing resting on it doesn't stay up
  function lonely(st, w, after) {
    if (w.gone || w.kind === 'post' || (w.prev && !w.prev.gone) || (w.next && !w.next.gone) || w.carries.some((r) => !r.gone)) return;
    fall(st, w, 0, 0, after + .2);
  }
  // Past this it isn't a building any more. The roof goes first, spreading out from whatever just went.
  function giveOut(st, from, after) {
    st.givenOut = true;
    const later = (p) => after + Math.min(1.1, dist2(p, from) * .05) + hash2(st.s.id | 0, 4000 + p.part) * .2;
    for (const p of st.parts) if (HELD_UP.has(p.kind)) fall(st, p, 0, 0, later(p));
    for (const p of st.parts) if (p.kind === 'wall' || p.kind === 'lintel' || p.kind === 'post') fall(st, p, 0, 0, later(p) + .3);
  }
  function hit(st, p, power, dx, dz) {
    if (p.gone || spared(st.s)) return false;
    p.hp -= power; mark(st.s);
    if (p.kind === 'window') { if (p.hp <= 0 && !p.cracked) { p.cracked = true; on.shatter?.(st.s, p); } return false; }
    // the glass goes first
    for (const q of p.holds) if (q.kind === 'window' || q.kind === 'shutter') hit(st, q, power, dx, dz);
    if (p.hp > 0) { on.crack?.(st.s, p); return false; }
    fall(st, p, dx, dz, 0);
    return true;
  }
  // What's within a fire's reach of a piece, worked out the first time it's asked
  function nearOf(st, p) {
    if (p.near) return p.near;
    p.near = [];
    for (const q of st.parts) if (q !== p && Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < SPREADS) p.near.push(q);
    return p.near;
  }
  function ignite(st, p) {
    if (p.gone || st.burning.has(p) || !burnRate(st.s, p) || spared(st.s)) return false;
    st.burning.add(p); p.spreadT = .6; p.charred = 1; mark(st.s);
    on.ignite?.(st.s, p);
    return true;
  }
  const d = {
    state, has: (s) => states.has(s.index),
    burn: (s, p) => ignite(state(s), p),
    burning: (s) => states.get(s.index)?.burning.size ?? 0,
    // A fire close by catches the nearest thing there is to catch
    catchNear(s, x, y, z, r) {
      if (spared(s)) return false;
      const st = state(s); let best = null, bd = r;
      for (const p of st.parts) {
        if (p.gone || st.burning.has(p) || !burnRate(s, p)) continue;
        const e = Math.hypot(x - p.x, y - p.y, z - p.z);
        if (e < bd) { bd = e; best = p; }
      }
      return best ? ignite(st, best) : false;
    },
    // One step of fire: what's burning loses its hit points, chars, catches what's next to it and in the end comes down
    stepFire(s, dt, rand) {
      const st = states.get(s.index); if (!st || !st.burning.size) return;
      mark(s);
      for (const p of [...st.burning]) {
        p.hp -= burnRate(s, p) * dt;
        const left = Math.max(0, p.hp / p.max), step = Math.ceil(left * 4) / 4;
        if (step < p.charred) { p.charred = step; on.char?.(s, p, .2 + .8 * left); }
        if ((p.spreadT -= dt) <= 0) {
          p.spreadT = .5 + rand() * .7;
          const next = nearOf(st, p).filter((q) => !q.gone && !st.burning.has(q) && burnRate(s, q));
          if (next.length) ignite(st, next[Math.floor(rand() * next.length)]);
        }
        if (p.hp <= 0) fall(st, p, 0, 0, 0);
      }
    },
    // how much of its walls are gone, from 0 to 1
    gone: (s) => { const st = states.get(s.index); return st ? 1 - standing(st) / (st.walls.length || 1) : 0; },
    // The nearest thing a swing could land on, and how far off it is
    nearest(s, x, y, z, reach) {
      if (spared(s)) return null;
      const st = state(s); let best = null, bd = reach;
      for (const p of st.parts) {
        if (p.gone || !FACING.has(p.kind)) continue;
        let e;
        if (p.panel !== undefined) { const q = st.panels[p.panel]; if (y < q.y0 - .3 || y > q.y1 + .3) continue; e = toSegment(x, z, q.ax, q.az, q.bx, q.bz); }
        else e = Math.hypot(x - p.x, z - p.z) - (p.kind === 'post' ? .1 : .6);
        if (e < bd) { bd = e; best = p; }
      }
      return best && { part: best, d: bd };
    },
    hit: (s, p, power, dx = 0, dz = 0) => hit(state(s), p, power, dx, dz),
    // Everything in reach of (x, y, z) takes `power` at the middle, falling off to nothing at r
    blast(s, x, y, z, r, power) {
      if (spared(s)) return;
      const st = state(s);
      for (const p of st.parts) {
        if (p.gone) continue;
        const q = p.panel !== undefined ? st.panels[p.panel] : null, e = q ? Math.hypot(toSegment(x, z, q.ax, q.az, q.bx, q.bz), Math.max(0, q.y0 - y, y - q.y1)) : Math.hypot(x - p.x, y - p.y, z - p.z);
        if (e < r) hit(st, p, power * (1 - e / r) * (1 - e / r), p.x - x, p.z - z);
      }
    },

    // ---- in a town everyone shares (CHUNKY-152)
    // What's happened to it: the parts that aren't as they were built, and whether it's given out
    read(s) {
      const st = states.get(s.index), parts = [];
      if (!st) return { out: false, parts };
      for (const p of st.parts) {
        const burning = st.burning.has(p), shade = p.shade ?? 1;
        if (p.gone || p.cracked || burning || p.hp < p.max || shade < 1) parts.push({ part: p.part, gone: p.gone, cracked: !!p.cracked, burning, dirx: p.dirx, dirz: p.dirz, hp: p.hp, max: p.max, shade });
      }
      return { out: st.givenOut, parts };
    },
    // What's happened to it on another phone, as read() said it there. Nothing comes down after it, since whatever did there comes
    // with it, and it's drawn through the same on.fall, on.char and on.shatter as if it had happened here. Unless it's happening in
    // front of him, live, a part that's come down is laid where it lies, quietly, and a fire isn't lit.
    take(s, parts, { live = false, out = false } = {}) {
      if (spared(s)) return;
      const st = state(s);
      taking = true;
      try {
        if (out) st.givenOut = true;
        for (const q of parts) {
          const p = st.parts[q.part];
          if (!p) continue;
          if (q.hp < p.hp) p.hp = q.hp;
          if (q.cracked && !p.cracked) { p.cracked = true; on.shatter?.(s, p); }
          if (q.shade < (p.shade ?? 1)) on.char?.(s, p, q.shade);
          if (q.gone && !p.gone) {
            p.gone = true; p.dirx = q.dirx; p.dirz = q.dirz; p.delay = 0; p.quiet = !live;
            on.fall?.(s, p, st.burning.delete(p));
          } else if (live && q.burning) ignite(st, p);
        }
      } finally { taking = false; }
    },
    // healed: as it was built, once the page has written it again
    forget(s) { states.delete(s.index); changed.delete(s.index); },
    touched() { const out = [...changed.values()]; changed.clear(); return out; },
  };
  return d;
}

// ---------------------------------------------------------------- where it ends up

export function modeOf(s, p) {
  if (p.kind === 'wall') return MASONRY.has(s.walls) ? 'crumble' : 'topple';
  if (p.kind === 'lintel') return MASONRY.has(s.walls) ? 'crumble' : 'drop';
  if (p.kind === 'door' || p.kind === 'bay' || p.kind === 'post') return 'topple';
  if (HELD_UP.has(p.kind)) return 'drop';
  return 'vanish';
}
// Tips a run of points over about the line through pivot that's square to (dirx, dirz), so that up leans towards it
export function tip(from, to, count, [px, py, pz], dirx, dirz, angle, lift = 0) {
  const ax = dirz, az = -dirx, c = Math.cos(angle), n = Math.sin(angle);
  for (let i = 0; i < count * 3; i += 3) {
    const vx = from[i] - px, vy = from[i + 1] - py, vz = from[i + 2] - pz, dot = ax * vx + az * vz;
    // Rodrigues: v cos + (a x v) sin + a (a . v) (1 - cos), with a flat on the ground
    to[i] = px + vx * c - az * vy * n + ax * dot * (1 - c);
    to[i + 1] = py + lift + vy * c + (az * vx - ax * vz) * n;
    to[i + 2] = pz + vz * c + ax * vy * n + az * dot * (1 - c);
  }
}
// The same turn for directions, which don't care where the pivot is
export const tipNormals = (from, to, count, dirx, dirz, angle) => tip(from, to, count, [0, 0, 0], dirx, dirz, angle, 0);

// Where a piece lands. `from` holds its vertices where they stood, and `to` gets them where they lie.
// Returns how it got there, for whoever's drawing the fall: how long it takes and, if it tips, about what.
export function settle(s, p, base, from, to) {
  const seed = (s.id | 0) + p.part * 31, mode = modeOf(s, p), count = p.count;
  let lo = Infinity, hi = -Infinity;
  for (let i = 1; i < count * 3; i += 3) { if (from[i] < lo) lo = from[i]; if (from[i] > hi) hi = from[i]; }
  if (mode === 'vanish') { for (let i = 0; i < count * 3; i += 3) { to[i] = p.x; to[i + 1] = p.y; to[i + 2] = p.z; } return { mode, T: 0 }; }
  if (mode === 'topple') {
    const pivot = [p.x, lo, p.z], angle = Math.PI / 2 - .04 - hash2(seed, 1) * .1;
    tip(from, to, count, pivot, p.dirx, p.dirz, angle, 0);
    let low = Infinity; for (let i = 1; i < count * 3; i += 3) if (to[i] < low) low = to[i];
    const lift = base + .02 + hash2(seed, 2) * .06 - low;
    for (let i = 1; i < count * 3; i += 3) to[i] += lift;
    return { mode, T: .62 + hash2(seed, 3) * .18, pivot, angle, lift };
  }
  // Corners that were one corner stay one corner, so it's still a closed lump
  const corner = (x, y, z, k) => hash2((Math.round(x * 50) * 73856093) ^ (Math.round(y * 50) * 19349663) ^ (Math.round(z * 50) * 83492791) ^ seed, k);
  if (mode === 'crumble') {
    const high = Math.max(hi - lo, .01);
    for (let i = 0; i < count * 3; i += 3) {
      const x = from[i], y = from[i + 1], z = from[i + 2], up = (y - lo) / high, k = .08 + corner(x, y, z, 1) * .18, out = up * (.25 + corner(x, y, z, 2) * .55);
      to[i] = x + p.dirx * out + (corner(x, y, z, 3) - .5) * .28 * up;
      to[i + 1] = base + .02 + (y - lo) * k;
      to[i + 2] = z + p.dirz * out + (corner(x, y, z, 4) - .5) * .28 * up;
    }
    return { mode, T: .32 + hash2(seed, 3) * .12 };
  }
  // A section of roof drops flat, more or less, on whatever's under it by then
  const heap = base + .06 + hash2(seed, 5) * .34, flat = .16 + hash2(seed, 6) * .14, slideX = (hash2(seed, 7) - .5) * .7, slideZ = (hash2(seed, 8) - .5) * .7, leanX = (hash2(seed, 9) - .5) * .13, leanZ = (hash2(seed, 10) - .5) * .13;
  for (let i = 0; i < count * 3; i += 3) {
    const x = from[i], y = from[i + 1], z = from[i + 2];
    to[i] = x + slideX; to[i + 1] = heap + (y - lo) * flat + Math.max(0, (x - p.x) * leanX + (z - p.z) * leanZ); to[i + 2] = z + slideZ;
  }
  return { mode, T: Math.min(.9, Math.sqrt(2 * Math.max(lo - base, .1) / 9.8) + .1) };
}
// Face normals for a piece written in quads, once it's been bent out of shape
export function faceNormals(position, normal, first, count) {
  for (let v = first; v < first + count - 3; v += 4) {
    const a = v * 3, b = a + 3, c = a + 6, d = a + 9;
    const ex = position[c] - position[a], ey = position[c + 1] - position[a + 1], ez = position[c + 2] - position[a + 2], fx = position[d] - position[b], fy = position[d + 1] - position[b + 1], fz = position[d + 2] - position[b + 2];
    let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx; const l = Math.hypot(nx, ny, nz);
    if (l < 1e-6) continue;
    nx /= l; ny /= l; nz /= l;
    for (let k = 0; k < 4; k++) { normal[a + k * 3] = nx; normal[a + k * 3 + 1] = ny; normal[a + k * 3 + 2] = nz; }
  }
}
