// What stops anyone in a town everyone shares (CHUNKY-153), and the floors raised off the ground, from data/solids.json, which
// tools/solids.mjs writes from the game's own and checks still matches it. There's no three.js or page in here, so the town uses it too.
//
// The town's ground is flat, as the game's world is with only the drawing going up and down, and every height in here is over it. What
// stops anyone stands as high as it does over the highest floor beside it, and a raised floor is as far up as it is from where you step
// onto it. So where the ground's level it stops whoever the game stops and hides a head the game hides, and every step on or off a raised
// floor is the game's.
//
// It answers as index.html does, by cells 16 m on a side. A box stops anyone within .3 m of it and a wall anyone within its radius and
// .3 m of its line, unless they're less than .25 m under the top of it, and a road bridge's rails stop anyone on it who's between half
// its width and a metre more from the line of the nearest road. That's `stops`, which is what sight goes by. `blocked` is the crowd's,
// with their step on it as well: nobody goes up more than .7 m at once onto a raised floor. A raised floor is where the water isn't, and
// `raised` says whether there's one.
//
// What's broken comes as src/wrecks.js says it. A prop goes over by its key, and the dock goes with its prop, and a building loses
// whatever of it is gone, so long as it's written in as many parts as it is here, since otherwise it's some other game's. A heal puts
// either back as it was built. The boards across the gas station's door are each phone's own, and only stop anyone while they're up.
import { kindOf, decodeParts } from './wrecks.js';

const CELL = 16, GONE = -1e9, STEP = .7;
const cellOf = (x, z) => (Math.floor(x / CELL) + 32768) * 65536 + Math.floor(z / CELL) + 32768;
// how far a point is from a line, squared, as the game measures it
function off2(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9, px = x - ax, pz = z - az;
  let t = (px * dx + pz * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - dx * t, ez = pz - dz * t;
  return ex * ex + ez * ez;
}

export function createSolids(data) {
  const boxCells = new Map(), wallCells = new Map(), floorCells = new Map(), props = new Map(), houses = new Map();
  const into = (cells, c, x0, x1, z0, z1) => {
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      const k = (cx + 32768) * 65536 + cz + 32768; let list = cells.get(k); if (!list) cells.set(k, list = []); list.push(c);
    }
  };
  // each keeps the top it was built with last, for a heal
  const box = ([x0, x1, z0, z1, top]) => { const b = [x0, x1, z0, z1, top, top]; into(boxCells, b, x0 - .3, x1 + .3, z0 - .3, z1 + .3); return b; };
  const wall = ([ax, az, bx, bz, top, r]) => {
    const w = [ax, az, bx, bz, top, r, top], reach = r + .4;
    into(wallCells, w, Math.min(ax, bx) - reach, Math.max(ax, bx) + reach, Math.min(az, bz) - reach, Math.max(az, bz) + reach);
    return w;
  };
  data.fixed.boxes.forEach(box); data.fixed.walls.forEach(wall); Object.values(data.cast).forEach(box);
  for (const [k, p] of Object.entries(data.props)) props.set(k, { boxes: p.boxes.map(box), walls: p.walls.map(wall), floors: [] });
  for (const [id, { n, walls }] of Object.entries(data.buildings)) {
    const parts = new Map();
    for (const [part, ...w] of walls) { let list = parts.get(part); if (!list) parts.set(part, list = []); list.push(wall(w)); }
    houses.set(`b${id}`, { n, parts });
  }
  // down until a phone says they're up
  const bar = wall(data.bar); bar[4] = GONE;

  // The raised floors, each with whatever's inside it. The dock's and the cabin's decks are oblongs, a trestle is wherever's within its
  // reach of its middle and near enough the railroad, or in the refuge halfway over, and a road bridge is wherever's on a road within its
  // reach of where it crosses the river.
  const floor = (f, x0, x1, z0, z1, inside) => {
    const g = { top: f.top, up: true, inside };
    into(floorCells, g, x0, x1, z0, z1);
    if (f.k) { let p = props.get(f.k); if (!p) props.set(f.k, p = { boxes: [], walls: [], floors: [] }); p.floors.push(g); }
    return g;
  };
  for (const f of data.floors.rects) {
    const [cx, cz, ux, uz, hl, hw] = f.rect, ex = hl * Math.abs(ux) + hw * Math.abs(uz), ez = hl * Math.abs(uz) + hw * Math.abs(ux);
    floor(f, cx - ex, cx + ex, cz - ez, cz + ez, (x, z) => { const dx = x - cx, dz = z - cz, u = dx * ux + dz * uz, v = dz * ux - dx * uz; return u > -hl && u < hl && v > -hw && v < hw; });
  }
  for (const t of data.floors.trestles) {
    const [cx, cz, r] = t.at, [rx, rz, rr] = t.refuge, h2 = t.half * t.half;
    floor(t, Math.min(cx - r, rx - rr), Math.max(cx + r, rx + rr), Math.min(cz - r, rz - rr), Math.max(cz + r, rz + rr), (x, z) => {
      if (Math.hypot(x - rx, z - rz) < rr) return true;
      const dx = x - cx, dz = z - cz;
      return dx * dx + dz * dz < r * r && t.rail.some(([ax, az, bx, bz]) => off2(x, z, ax, az, bx, bz) < h2);
    });
  }
  const bridges = data.floors.bridges;
  for (const b of bridges) {
    const [cx, cz, r] = b.at;
    floor({ top: b.deck }, cx - r, cx + r, cz - r, cz + r, (x, z) => (x - cx) ** 2 + (z - cz) ** 2 < r * r && b.roads.some(([ax, az, bx, bz, half]) => off2(x, z, ax, az, bx, bz) < half * half));
  }

  // the rails on a road bridge, going by the first it's on, as the game does
  function rails(x, z, y) {
    for (const b of bridges) {
      const [cx, cz, r] = b.at;
      if (Math.hypot(x - cx, z - cz) >= r) continue;
      if (!(y > b.deck - 1)) return false;
      let best = Infinity;
      for (const [ax, az, bx, bz] of b.roads) best = Math.min(best, off2(x, z, ax, az, bx, bz));
      const d = Math.sqrt(best);
      return d > b.half && d < b.half + 1;
    }
    return false;
  }
  function stops(x, z, y) {
    const cell = cellOf(x, z), boxes = boxCells.get(cell);
    if (boxes) for (let i = 0; i < boxes.length; i++) { const b = boxes[i]; if (x > b[0] - .3 && x < b[1] + .3 && z > b[2] - .3 && z < b[3] + .3 && y < b[4] - .25) return true; }
    const walls = wallCells.get(cell);
    if (walls) for (let i = 0; i < walls.length; i++) { const w = walls[i], r = w[5] + .3; if (y < w[4] - .25 && off2(x, z, w[0], w[1], w[2], w[3]) < r * r) return true; }
    return rails(x, z, y);
  }
  // the highest raised floor here, or null if there isn't one
  function raised(x, z) {
    const list = floorCells.get(cellOf(x, z));
    let top = null;
    if (list) for (let i = 0; i < list.length; i++) { const g = list[i]; if (g.up && (top === null || g.top > top) && g.inside(x, z)) top = g.top; }
    return top;
  }
  const floorAt = (x, z) => raised(x, z) ?? 0;
  const lay = (list, up) => { for (const c of list) c[4] = up ? c[c.length - 1] : GONE; };
  return {
    stops, rails, raised, floorAt,
    blocked: (x, z, y) => stops(x, z, y) || floorAt(x, z) - y > STEP,
    // a wreck, as the wire and the town have it
    take(w) {
      const kind = kindOf(w?.k);
      if (kind === 'p') { const p = props.get(w.k); if (p) { lay(p.boxes, false); lay(p.walls, false); for (const g of p.floors) g.up = false; } return; }
      const house = kind === 'b' ? houses.get(w.k) : null;
      if (!house || w.n !== house.n || typeof w.p !== 'string') return;
      let parts = null;
      try { parts = decodeParts(w.p); } catch { /* not base64 */ }
      for (const q of parts ?? []) if (q.gone && house.parts.has(q.part)) lay(house.parts.get(q.part), false);
    },
    // healed: as it was built
    heal(k) {
      const kind = kindOf(k);
      if (kind === 'p') { const p = props.get(k); if (p) { lay(p.boxes, true); lay(p.walls, true); for (const g of p.floors) g.up = true; } }
      else if (kind === 'b') { const house = houses.get(k); if (house) for (const list of house.parts.values()) lay(list, true); }
    },
    barred(on) { bar[4] = on ? bar[6] : GONE; },
    has: (k) => props.has(k) || houses.has(k),
  };
}
