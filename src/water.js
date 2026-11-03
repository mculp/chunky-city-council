// The ponds as the game walks on them. There's no three.js in here, so tools and node tests load it too.
//
// data/water.json holds their outlines in true metres from town center. A pond's level isn't in there, because it comes from the
// ground around it, which only the game knows. data/water.md has the rest.
import { SegGrid } from './map.js';

export const REACH = 14;             // how far from a shore anything cares, on the bank or under the water
const CELL = 32, ROW = 6;
const RIVER_LOW = 1.5;               // a shore that gets this low is down by the river, so it's at the river's level
const SINKS = .3;                    // how far under the lowest of its shore a pond stands
const POOL_RISE = .38;               // a swimming pool stands this far over `top`, which is just under the level of the ground, with its coping round it
const POOL_DEEP = 1.7;

export function buildWater(data, map) {
  const shore = new SegGrid(16, REACH), cells = new Map();
  const key = (cx, cz) => (cx + 32768) * 65536 + cz + 32768;
  const ponds = data.ponds.map((d) => {
    const ring = d.ring.map(([x, z]) => map.fromTrue(x, z));
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const p = { id: d.id, source: d.source, area: d.area, pool: d.pool ?? null, ring, x0, x1, z0, z1, x: (x0 + x1) / 2, z: (z0 + z1) / 2, level: 0, deep: d.pool ? POOL_DEEP : Math.max(1.1, Math.min(3, Math.sqrt(d.area) / 18)), rows: [] };
    // the edges each row of the pond crosses, so asking if a point's in it only looks at a few
    ring.forEach(([ax, az], i) => {
      const [bx, bz] = ring[(i + 1) % ring.length];
      shore.add(ax, az, bx, bz, p);
      for (let r = Math.floor((Math.min(az, bz) - z0) / ROW); r <= Math.floor((Math.max(az, bz) - z0) / ROW); r++) (p.rows[r] ??= []).push([ax, az, bx, bz]);
    });
    for (let cx = Math.floor((x0 - REACH) / CELL); cx <= Math.floor((x1 + REACH) / CELL); cx++) for (let cz = Math.floor((z0 - REACH) / CELL); cz <= Math.floor((z1 + REACH) / CELL); cz++) {
      const k = key(cx, cz); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(p);
    }
    return p;
  });
  const inside = (p, x, z) => {
    if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) return false;
    const edges = p.rows[Math.floor((z - p.z0) / ROW)];
    let c = false;
    if (edges) for (let i = 0; i < edges.length; i++) { const e = edges[i]; if ((e[1] > z) !== (e[3] > z) && x < e[0] + (z - e[1]) * (e[2] - e[0]) / (e[3] - e[1])) c = !c; }
    return c;
  };
  const near = (x, z) => cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  const W = {
    ponds, pond: null, d: Infinity,
    // The pond x, z is in, or close to the shore of. W.d is how far it is from that shore, negative in the water, and past REACH it stops counting.
    // The answer's left on W as well, as in SegGrid, so that the terrain allocates nothing.
    look(x, z) {
      W.pond = null; W.d = Infinity;
      const list = near(x, z);
      if (!list) return null;
      const e = shore.nearest(x, z);
      for (let i = 0; i < list.length; i++) if (inside(list[i], x, z)) { W.pond = list[i]; W.d = -Math.min(e, REACH); return W.pond; }
      if (e < REACH) { W.pond = shore.seg.owner; W.d = e; }
      return W.pond;
    },
    // The pond it's in, if it's in one
    in(x, z) {
      const list = near(x, z);
      if (list) for (let i = 0; i < list.length; i++) if (inside(list[i], x, z)) return list[i];
      return null;
    },
    // How high the water is here: a pond's level in a pond, and the river's anywhere else, which is 0
    level(x, z) { const p = W.in(x, z); return p ? p.level : 0; },
    // Water finds the lowest place on its shore. `ground` is the land as it is without any ponds, and `top` is as high as one can stand.
    settle(ground, top) {
      for (const p of ponds) {
        if (p.pool) { p.level = top + POOL_RISE; continue; }
        let low = Infinity;
        p.ring.forEach(([ax, az], i) => {
          const [bx, bz] = p.ring[(i + 1) % p.ring.length], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 5));
          for (let k = 0; k < n; k++) low = Math.min(low, ground(ax + (bx - ax) * k / n, az + (bz - az) * k / n));
        });
        p.level = low < RIVER_LOW ? 0 : Math.min(low - SINKS, top);
      }
    },
  };
  return W;
}

export async function loadWater(url, map) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load ${url}: ${res.status}`);
  return buildWater(await res.json(), map);
}
