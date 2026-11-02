// The farm south of the Chunky River Bridge, as the game walks on it. There's no three.js in here, so tools and node tests load it too.
//
// data/farm.json holds where the woods stop, in true metres from town center. data/farm.md has the rest.

export const FARM_CELL = 8;          // metres to a square of what's where. Looking between four of them softens the edge.
export const EDGE = 44;              // how far off open land the woods close up to a wall of trees, as they really do
const TREE_CELL = 11;                // the same squares as the woods

const OPEN = 1, YOUNG = 2;

export function buildFarm(data, map) {
  const world = (ring) => ring.map(([x, z]) => map.fromTrue(x, z));
  const open = data.open.map((o) => world(o.ring)), woods = data.woods.map((o) => world(o.ring)), young = data.young.map((o) => world(o.ring));
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const ring of open) for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  x0 -= EDGE + FARM_CELL; x1 += EDGE + FARM_CELL; z0 -= EDGE + FARM_CELL; z1 += EDGE + FARM_CELL;
  const cols = Math.ceil((x1 - x0) / FARM_CELL) + 1, rows = Math.ceil((z1 - z0) / FARM_CELL) + 1, kind = new Uint8Array(cols * rows), fromOpen = new Uint16Array(cols * rows).fill(65535);
  // each row of squares, filled between where it crosses the outline
  const fill = (ring, value) => {
    for (let j = 0; j < rows; j++) {
      const z = z0 + j * FARM_CELL, cross = [];
      ring.forEach(([ax, az], i) => { const [bx, bz] = ring[(i + 1) % ring.length]; if ((az > z) !== (bz > z)) cross.push(ax + (z - az) * (bx - ax) / (bz - az)); });
      cross.sort((a, b) => a - b);
      for (let k = 0; k + 1 < cross.length; k += 2) for (let i = Math.max(0, Math.ceil((cross[k] - x0) / FARM_CELL)), last = Math.min(cols - 1, Math.floor((cross[k + 1] - x0) / FARM_CELL)); i <= last; i++) kind[j * cols + i] = value;
    }
  };
  for (const ring of open) fill(ring, OPEN);
  for (const ring of woods) fill(ring, 0);
  for (const ring of young) fill(ring, YOUNG);
  // how far each square is from open land, in squares, in two sweeps
  for (let i = 0; i < kind.length; i++) if (kind[i] === OPEN) fromOpen[i] = 0;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const v = j * cols + i; if (i) fromOpen[v] = Math.min(fromOpen[v], fromOpen[v - 1] + 1); if (j) fromOpen[v] = Math.min(fromOpen[v], fromOpen[v - cols] + 1); }
  for (let j = rows - 1; j >= 0; j--) for (let i = cols - 1; i >= 0; i--) { const v = j * cols + i; if (i < cols - 1) fromOpen[v] = Math.min(fromOpen[v], fromOpen[v + 1] + 1); if (j < rows - 1) fromOpen[v] = Math.min(fromOpen[v], fromOpen[v + cols] + 1); }
  const square = (x, z) => { const i = Math.round((x - x0) / FARM_CELL), j = Math.round((z - z0) / FARM_CELL); return i < 0 || j < 0 || i >= cols || j >= rows ? -1 : j * cols + i; };
  const reach = Math.ceil(EDGE / FARM_CELL);
  const lone = new Map(), treeKey = (cx, cz) => (cx + 32768) * 65536 + cz + 32768;
  for (const [tx, tz] of data.lone) { const [x, z] = map.fromTrue(tx, tz); lone.set(treeKey(Math.floor(x / TREE_CELL), Math.floor(z / TREE_CELL)), { x, z }); }
  const scars = data.scars.map(([x, z]) => map.fromTrue(x, z));
  let sx0 = Infinity, sx1 = -Infinity, sz0 = Infinity, sz1 = -Infinity;
  for (const [x, z] of scars) { sx0 = Math.min(sx0, x); sx1 = Math.max(sx1, x); sz0 = Math.min(sz0, z); sz1 = Math.max(sz1, z); }
  return {
    x0, x1, z0, z1, open,
    fences: data.fences.map(world),
    bales: data.bales.map(([x, z, turn]) => [...map.fromTrue(x, z), turn]),
    // How much of here is grass and not woods, 0 to 1, with the edge softened
    grass(x, z) {
      if (x < x0 || x > x1 || z < z0 || z > z1) return 0;
      const fx = (x - x0) / FARM_CELL, fz = (z - z0) / FARM_CELL, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, w = fz - j;
      if (i < 0 || j < 0 || i + 1 >= cols || j + 1 >= rows) return 0;
      const v = j * cols + i, at = (n) => (kind[n] ? 1 : 0);
      return (at(v) * (1 - u) + at(v + 1) * u) * (1 - w) + (at(v + cols) * (1 - u) + at(v + cols + 1) * u) * w;
    },
    // Nothing grows here by chance
    clear(x, z) { const v = square(x, z); return v >= 0 && kind[v] === OPEN; },
    // A row of young pines goes here
    young(x, z) { const v = square(x, z); return v >= 0 && kind[v] === YOUNG; },
    // Woods here close up, because they're right against open land
    edge(x, z) { const v = square(x, z); return v >= 0 && kind[v] !== OPEN && fromOpen[v] <= reach; },
    // A tree that really stands in this square of the woods
    lone(cx, cz) { return lone.get(treeKey(cx, cz)); },
    // Where a round bale's been fed for years: how far into a bare ring this is, 0 to 1
    scar(x, z) {
      if (x < sx0 - 8 || x > sx1 + 8 || z < sz0 - 8 || z > sz1 + 8) return 0;
      let s = 0;
      for (const [cx, cz] of scars) { const d = Math.hypot(cx - x, cz - z); if (d < 7.5) s = Math.max(s, Math.min(1, (7.5 - d) / 2.5)); }
      return s;
    },
  };
}

export async function loadFarm(url, map) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load ${url}: ${res.status}`);
  return buildFarm(await res.json(), map);
}
