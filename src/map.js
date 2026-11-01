// The road graph as the game walks on it. There's no three.js in here, so tools and node tests load it too.
//
// data/roads.json holds game x and z, with town center at 0. The world is the same map with two changes:
// its origin is Stuckey's Bridge, so the opening scene never moves, and US 80 is laid straight from the
// bridge to the edge of town. data/roads.md has the formulas.

export const R = 6371000;

// Nearest-segment lookups on a uniform grid. A cell lists every segment within `reach` of it, so a result
// under reach is exact and anything further reads as Infinity. Results land on the grid object, so a hot
// loop like the terrain allocates nothing.
export class SegGrid {
  constructor(cell, reach) {
    this.cell = cell; this.reach = reach; this.cells = new Map(); this.segs = [];
    this.d = Infinity; this.seg = null; this.t = 0;
  }
  key(cx, cz) { return (cx + 32768) * 65536 + (cz + 32768); }
  add(ax, az, bx, bz, owner = null, s0 = 0) {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const seg = { ax, az, bx, bz, dx, dz, l2, len: Math.sqrt(l2), owner, s0 };
    const { cell, reach } = this, grow = reach + cell * .7072;
    const x0 = Math.floor((Math.min(ax, bx) - reach) / cell), x1 = Math.floor((Math.max(ax, bx) + reach) / cell);
    const z0 = Math.floor((Math.min(az, bz) - reach) / cell), z1 = Math.floor((Math.max(az, bz) + reach) / cell);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      // long diagonal segments would otherwise fill their whole bounding box
      const px = (cx + .5) * cell, pz = (cz + .5) * cell;
      const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
      if (Math.hypot(px - ax - dx * t, pz - az - dz * t) > grow) continue;
      const k = this.key(cx, cz); let list = this.cells.get(k);
      if (!list) this.cells.set(k, list = []);
      list.push(seg);
    }
  }
  nearest(x, z) {
    const list = this.cells.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    let best = Infinity, seg = null, tb = 0;
    if (list) for (let i = 0; i < list.length; i++) {
      const g = list[i], px = x - g.ax, pz = z - g.az;
      let t = g.l2 ? (px * g.dx + pz * g.dz) / g.l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - g.dx * t, ez = pz - g.dz * t, d2 = ex * ex + ez * ez;
      if (d2 < best) { best = d2; seg = g; tb = t; }
    }
    this.seg = seg; this.t = tb;
    return this.d = seg ? Math.sqrt(best) : Infinity;
  }
}

// Joins a road's edges into one line. Each later edge repeats the node the last one ended on.
function walk(road, edges) {
  const pts = [];
  road.edges.forEach((id, i) => pts.push(...edges.get(id).points.slice(i ? 1 : 0)));
  return pts;
}

// true x through compression[], as the build does it: identity at town center, scaled in a band, a shift past one
export function compressX(x, bands) {
  let last = null;
  for (const b of bands) {
    if (x < b.trueFrom) return x + b.gameFrom - b.trueFrom;
    if (x < b.trueTo) return b.gameFrom + (x - b.trueFrom) * b.factor;
    last = b;
  }
  return last ? x + last.gameTo - last.trueTo : x;
}

export function buildMap(data, { riverAtBridge = null } = {}) {
  const edges = new Map(data.edges.map((e) => [e.id, e]));
  const lat0 = data.origin.lat * Math.PI / 180, lon0 = data.origin.lon * Math.PI / 180;
  const bridge = data.reference.crossings.find((c) => c.road === 'us_80' && c.with === 'river');   // the first along the road, the west one
  const us80 = walk(data.roads.find((r) => r.id === 'us_80'), edges);
  const west = data.compression.filter((b) => b.trueTo <= 0).at(-1);
  const leanEnd = west ? west.gameTo : bridge.x;

  // z of US 80 at a game x, held constant past the edge of town and past the road's west end
  const knots = us80.filter(([x]) => x <= leanEnd);
  function leanAt(x) {
    if (x >= leanEnd) return leanEndZ;
    if (x <= knots[0][0]) return knots[0][1];
    let lo = 0, hi = knots.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (knots[m][0] <= x) lo = m; else hi = m; }
    const a = knots[lo], b = knots[hi];
    return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
  }
  const edgeIdx = us80.findIndex(([x]) => x > leanEnd), ea = us80[edgeIdx - 1], eb = us80[edgeIdx];
  const leanEndZ = ea[1] + (eb[1] - ea[1]) * (leanEnd - ea[0]) / (eb[0] - ea[0]);

  const toWorld = (x, z) => [x - bridge.x, z - leanAt(x)];
  const toGame = (wx, wz) => { const x = wx + bridge.x; return [x, wz + leanAt(x)]; };
  // a position in true metres from town center, which is how landmarks are placed
  const fromTrue = (x, z) => toWorld(compressX(x, data.compression), z);
  const trueOf = (lon, lat) => [R * (lon * Math.PI / 180 - lon0) * Math.cos(lat0), -R * (lat * Math.PI / 180 - lat0)];
  const fromLonLat = (lon, lat) => fromTrue(...trueOf(lon, lat));

  const line = (pts) => pts.map(([x, z]) => toWorld(x, z));
  const measure = (pts) => { const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return s; };

  const roads = data.roads.map((r) => {
    const pts = line(walk(r, edges));
    const s = measure(pts);
    return { id: r.id, name: r.name, width: r.width, surface: r.surface, pts, s, length: s.at(-1), nodes: r.nodes };
  });
  const roadById = new Map(roads.map((r) => [r.id, r]));
  const nodes = data.nodes.map((n) => { const [x, z] = toWorld(n.x, n.z); return { ...n, x, z }; });
  const rail = data.reference.railroad.lines.map((l) => line(l.points));
  // Near the bridge the river bends over to the channel the opening scene was built on
  const river = data.reference.river.lines.map((l) => line(l.points).map(([x, z]) => {
    const az = Math.abs(z);
    if (!riverAtBridge || az >= 200 || Math.abs(x) > 300) return [x, z];
    const t = Math.max(0, Math.min(1, (az - 100) / 100)), k = t * t * (3 - 2 * t);
    return [riverAtBridge(z) + (x - riverAtBridge(z)) * k, z];
  }));
  const trestles = data.reference.trestles.map((t) => { const [x, z] = toWorld(t.x, t.z); return { ...t, x, z }; });
  const crossings = data.reference.crossings.map((c) => { const [x, z] = toWorld(c.x, c.z); return { ...c, x, z }; });

  const roadGrid = new SegGrid(24, 32), riverGrid = new SegGrid(32, 40), railGrid = new SegGrid(24, 24);
  for (const r of roads) for (let i = 1; i < r.pts.length; i++) roadGrid.add(r.pts[i - 1][0], r.pts[i - 1][1], r.pts[i][0], r.pts[i][1], r, r.s[i - 1]);
  for (const l of river) for (let i = 1; i < l.length; i++) riverGrid.add(l[i - 1][0], l[i - 1][1], l[i][0], l[i][1]);
  for (const l of rail) for (let i = 1; i < l.length; i++) railGrid.add(l[i - 1][0], l[i - 1][1], l[i][0], l[i][1], l);

  // A point on a road, `s` metres along its walk, with the road's direction there
  function along(id, s) {
    const r = roadById.get(id), { pts, s: ss } = r;
    s = Math.max(0, Math.min(r.length, s));
    let lo = 0, hi = ss.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] <= s) lo = m; else hi = m; }
    const a = pts[lo], b = pts[hi], l = ss[hi] - ss[lo] || 1, t = (s - ss[lo]) / l;
    const tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx, tz, nx: -tz, nz: tx };
  }
  // z of a road at a world x, along the first stretch that spans it
  function zAt(id, x) {
    const { pts } = roadById.get(id);
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      if ((ax <= x && x <= bx) || (bx <= x && x <= ax)) return ax === bx ? az : az + (bz - az) * (x - ax) / (bx - ax);
    }
    return pts[x < pts[0][0] ? 0 : pts.length - 1][1];
  }
  // How far along a road the point nearest to a world position is
  function sOn(id, x, z) {
    const { pts, s } = roadById.get(id); let best = Infinity, at = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], dx = pts[i][0] - ax, dz = pts[i][1] - az, l2 = dx * dx + dz * dz;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < best) { best = d; at = s[i - 1] + (s[i] - s[i - 1]) * t; }
    }
    return at;
  }

  // Where the map stops: anything within reach of a road or the tracks. Past that it's woods nobody walks.
  const BOUND = 280, BC = 40, inside = new Set();
  const mark = (x, z) => {
    const r = Math.ceil(BOUND / BC), cx0 = Math.floor(x / BC), cz0 = Math.floor(z / BC);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (i * i + j * j <= r * r) inside.add((cx0 + i + 32768) * 65536 + (cz0 + j + 32768));
  };
  for (const l of [...roads.map((r) => r.pts), ...rail]) for (let i = 1; i < l.length; i++) {
    const [ax, az] = l[i - 1], [bx, bz] = l[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 30);
    for (let k = 0; k <= n; k++) mark(ax + (bx - ax) * k / n, az + (bz - az) * k / n);
  }
  const inBounds = (x, z) => inside.has((Math.floor(x / BC) + 32768) * 65536 + (Math.floor(z / BC) + 32768));

  return { bridge, leanEnd, leanEndZ, compression: data.compression, toWorld, toGame, fromTrue, trueOf, fromLonLat, roads, roadById, nodes, rail, river, trestles, crossings, roadGrid, riverGrid, railGrid, along, zAt, sOn, inBounds };
}

export async function loadMap(url, opts) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load ${url}: ${res.status}`);
  return buildMap(await res.json(), opts);
}
