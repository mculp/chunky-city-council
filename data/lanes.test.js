// Checks data/lanes.json by itself: that the smaller roads and the drives join up, that every building has a way in, and that they keep out of what they should.
// Comparing it with raw TIGER is the job of tools/build_lanes.py --check. data/lanes.md says what it all means.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMap, SegGrid } from '../src/map.js';

const read = (name) => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const roads = read('./roads.json'), lanes = read('./lanes.json'), built = read('./structures.json'), config = read('../tools/lane_config.json');
const map = buildMap(roads, { lanes });
const buildings = [...built.structures, ...built.extras];
const rows = [...lanes.lanes, ...lanes.drives];
const OPENING = 280;

// every `step` metres along a line
const along = (pts, step, visit) => {
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / step);
    for (let k = 0; k <= n; k++) visit(ax + (bx - ax) * k / n, az + (bz - az) * k / n);
  }
};
const worldRing = (b) => b.ring.map(([x, z]) => map.toWorld(b.x + x, b.z + z));
const inRing = (x, z, ring) => { let on = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [ax, az] = ring[i], [bx, bz] = ring[j]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) on = !on; } return on; };

test('each row is what it says it is', () => {
  const surfaces = new Set(['asphalt', 'gravel', 'dirt']), ids = new Set();
  for (const r of rows) {
    assert.ok(!ids.has(r.id), `${r.id} is there twice`); ids.add(r.id);
    assert.ok(r.points.length >= 2, `${r.id} has no length`);
    assert.ok(r.width > 0 && surfaces.has(r.surface), `${r.id}: ${r.width} wide, ${r.surface}`);
  }
  for (const d of lanes.drives) { assert.equal(d.generated, true, `${d.id} isn't TIGER's, and has to say so`); assert.equal(d.id, `drive_${d.structure}`); }
  for (const l of lanes.lanes) if (!l.measured) assert.ok(l.mtfcc && l.linearId, `${l.id} doesn't say what it is in TIGER`);
});

test('a road with two names in TIGER is only here once', () => {
  const seen = new Set();
  for (const l of lanes.lanes.filter((r) => !r.generated)) {
    for (let i = 1; i < l.points.length; i++) {
      const a = l.points[i - 1].join(), b = l.points[i].join(), key = a < b ? `${a} ${b}` : `${b} ${a}`;
      assert.ok(!seen.has(key), `${l.id}, ${l.name}, goes over ${key} again`); seen.add(key);
    }
  }
});

test('everything joins up with the game\'s roads', () => {
  const joined = new SegGrid(24, 32);
  const add = (r) => { for (let i = 1; i < r.pts.length; i++) joined.add(r.pts[i - 1][0], r.pts[i - 1][1], r.pts[i][0], r.pts[i][1]); };
  map.roads.forEach(add);
  let left = map.lanes;
  for (let again = true; again;) {
    again = false;
    const still = [];
    for (const r of left) {
      if (r.pts.some(([x, z]) => joined.nearest(x, z) < 1)) { add(r); again = true; } else still.push(r);
    }
    left = still;
  }
  assert.deepEqual(left.map((r) => r.id), []);
});

test('every building has a way in', () => {
  const own = new Set(config.ownDrive), drives = new Set(lanes.drives.map((d) => d.structure));
  const inOpening = (b) => { const [x, z] = map.toWorld(b.x, b.z); return Math.abs(x) < OPENING && Math.abs(z) < OPENING; };
  // a drive of its own, or a road right outside: a drive stops up to 9 m short of a wall if it has to, so one that would stop on the road isn't made
  const hasWay = (b) => own.has(b.id) || drives.has(b.id) || worldRing(b).some(([x, z]) => map.roadGrid.nearest(x, z) < map.roadGrid.seg?.owner.width / 2 + 13);
  const served = buildings.filter((b) => !inOpening(b) && hasWay(b));
  // and a shed can share the way in to what it's beside
  const missing = buildings.filter((b) => !inOpening(b) && !hasWay(b) && !(b.use === 'shed' && served.some((o) => o !== b && Math.hypot(o.x - b.x, o.z - b.z) < 40))).map((b) => `${b.id} ${b.use}`);
  assert.deepEqual(missing, []);
});

test('none of it goes through the first scene', () => {
  for (const r of map.lanes) along(r.pts, 8, (x, z) => assert.ok(!(Math.abs(x) < OPENING && Math.abs(z) < OPENING), `${r.id} is in it at ${x}, ${z}`));
});

test('a drive goes round whatever isn\'t the building it goes to', () => {
  const cells = new Map();
  for (const b of buildings) {
    const ring = worldRing(b), xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
    for (let i = Math.floor(Math.min(...xs) / 32); i <= Math.floor(Math.max(...xs) / 32); i++) for (let j = Math.floor(Math.min(...zs) / 32); j <= Math.floor(Math.max(...zs) / 32); j++) {
      const k = `${i},${j}`; if (!cells.has(k)) cells.set(k, []); cells.get(k).push({ id: b.id, ring });
    }
  }
  const through = [];
  for (const r of map.lanes) {
    // a named road's in the right place, and a building beside it is moved off it. It's somebody's track that gives way, and that's what's checked.
    if (r.name && !r.generated) continue;
    along(r.pts, 1.5, (x, z) => { for (const b of cells.get(`${Math.floor(x / 32)},${Math.floor(z / 32)}`) ?? []) if (b.id !== r.structure && inRing(x, z, b.ring)) through.push(`${r.id} through ${b.id}`); });
  }
  assert.deepEqual([...new Set(through)], []);
});

test('its crossings are on its roads, and the graph\'s are still there', () => {
  const ids = new Set(rows.map((r) => r.id));
  for (const c of lanes.crossings) { assert.ok(ids.has(c.road), c.road); assert.ok(c.with === 'river' || c.with === 'railroad', c.with); }
  assert.equal(map.crossings.length, roads.reference.crossings.length + lanes.crossings.length);
  assert.ok(lanes.crossings.some((c) => c.with === 'railroad'), 'TIGER has them crossing the tracks');
});

test('the graph is still the graph', () => {
  assert.equal(map.roads.length, roads.roads.length);
  assert.ok(map.roads.every((r) => !r.lane));
  assert.ok(map.lanes.every((r) => r.lane && map.roadById.get(r.id) === r));
});

test('the map reaches as far as the lanes do', () => {
  for (const r of map.lanes) for (const [x, z] of r.pts) assert.ok(map.inBounds(x, z), `${r.id} runs off the map at ${x}, ${z}`);
});

test("a road isn't barricaded from itself over a short gap", () => {
  assert.equal(lanes.lanes.filter((l) => l.name === 'True Light Rd').length, 1);
});

test('data/lanes.md has the numbers', () => {
  const doc = readFileSync(new URL('./lanes.md', import.meta.url), 'utf8');
  const km = (list) => list.reduce((n, r) => n + r.points.slice(1).reduce((m, p, i) => m + Math.hypot(p[0] - r.points[i][0], p[1] - r.points[i][1]), 0), 0) / 1000;
  assert.ok(doc.includes(`${lanes.lanes.length} lanes`), `it should say ${lanes.lanes.length} lanes`);
  assert.ok(doc.includes(`${lanes.drives.length} drives`), `it should say ${lanes.drives.length} drives`);
  assert.ok(doc.includes(`${km(lanes.lanes).toFixed(1)} km`), `it should say ${km(lanes.lanes).toFixed(1)} km of lanes`);
  assert.ok(doc.includes(`${km(lanes.drives).toFixed(1)} km`), `it should say ${km(lanes.drives).toFixed(1)} km of drives`);
});
