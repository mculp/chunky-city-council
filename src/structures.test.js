// What a building is made of, and that data/structures.json says what data/structures.md says it does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMap } from './map.js';
import { PANEL, DOOR_WIDE, Sheet, axisOf, boundsOf, cellsOf, collidersOf, eavesOf, fellIn, hash2, insideRing, placeStructures, wallsOf, wingsOf, writeStructure } from './structures.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const data = json('../data/structures.json'), map = buildMap(json('../data/roads.json')), placed = placeStructures(data, map);

const house = (pts, more = {}) => ({ id: 1234, index: 7, wx: 0, wz: 0, pts, door: 0, use: 'house', walls: 'siding', roof: 'gable', roofMat: 'shingle', sqm: 100, wallColor: '#c9c1b4', roofColor: '#3d3a3c', ...more });
// clockwise on a map with north up, as the build winds them
const box = [[-6, -4], [6, -4], [6, 4], [-6, 4]];
const ell = [[0, 0], [12, 0], [12, 6], [5, 6], [5, 14], [0, 14]];
const area = (pts) => { let a = 0; pts.forEach(([x, z], i) => { const [u, v] = pts[(i + 1) % pts.length]; a += x * v - u * z; }); return a / 2; };

test('hash2 repeats, and stays in range', () => {
  assert.equal(hash2(5, 9), hash2(5, 9));
  assert.notEqual(hash2(5, 9), hash2(5, 10));
  for (let i = 0; i < 500; i++) { const h = hash2(i * 7, i); assert.ok(h >= 0 && h < 1, String(h)); }
});

test('a plain footprint is one wing, and an L is two that cover it', () => {
  assert.equal(wingsOf(box).length, 1);
  const wings = wingsOf(ell), covered = wings.reduce((n, [a, b, c, d]) => n + (b - a) * (d - c), 0);
  assert.equal(wings.length, 2);
  assert.ok(Math.abs(covered - area(ell)) < 1, `${covered} of ${area(ell)}`);
});

test('a skewed footprint falls back to one rectangle round it', () => {
  assert.equal(wingsOf([[0, 0], [10, 2], [6, 9]]).length, 1);
});

test('walls come in panels no wider than PANEL, with a gap for the door', () => {
  const s = house(box), { panels, doors } = wallsOf(s);
  for (const p of panels) assert.ok(Math.hypot(p.bx - p.ax, p.bz - p.az) <= PANEL + .01, JSON.stringify(p));
  assert.equal(doors.length, 1);
  const solid = panels.filter((p) => p.solid).reduce((n, p) => n + Math.hypot(p.bx - p.ax, p.bz - p.az), 0);
  assert.ok(Math.abs(solid + DOOR_WIDE - 40) < .01, String(solid));
  assert.equal(panels.filter((p) => !p.solid).length, 1, 'a lintel over the door');
});

test('nothing stops him going through a door, and a wall does', () => {
  const s = house(box), { doors } = wallsOf(s), [d] = doors, walls = collidersOf(s);
  const hit = (x, z) => walls.some(([ax, az, bx, bz, , r]) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-9))); return Math.hypot(x - ax - dx * t, z - az - dz * t) < r + .3; });
  assert.ok(!hit(d.x, d.z), 'the middle of the doorway');
  assert.ok(hit(d.x + d.ex * 2, d.z + d.ez * 2), 'beside it');
});

test('a roof on posts has no walls, and nothing stops him but the posts', () => {
  const s = house(box, { open: true, sqm: 96 }), a = written(s), kinds = new Set(a.pieces.map((p) => p.kind));
  assert.deepEqual(wallsOf(s), { panels: [], doors: [] });
  assert.ok(kinds.has('post') && kinds.has('roof')); assert.ok(!kinds.has('wall') && !kinds.has('gable') && !kinds.has('door'));
  faces(a);
  const stops = collidersOf(s), posts = a.pieces.filter((p) => p.kind === 'post');
  assert.equal(stops.length, posts.length);
  for (const w of stops) assert.ok(w[5] < .2 && Math.abs(w[2] - w[0]) < .01, 'a post, not a wall');
  assert.ok(stops.every(([x, z]) => !(Math.abs(x) < 3 && Math.abs(z) < 2)), 'the middle is clear');
  stops.forEach(([x, z], i) => assert.ok(Math.hypot(x - posts[i].x, z - posts[i].z) < .01, 'each collider is its post'));
});

test('what fell in on a ruin stops nobody', () => {
  const s = house(box, { condition: 'ruin', id: 99 }), { panels } = wallsOf(s), gone = panels.filter((p, i) => fellIn(s, p, i));
  assert.ok(gone.length > 0, 'some of it has');
  assert.equal(collidersOf(s).length, panels.filter((p) => p.solid).length - gone.length);
  assert.equal(written(s).pieces.filter((p) => p.kind === 'wall').length, panels.filter((p) => p.kind === 'wall').length - gone.length);
});

test('two doors share a long wall', () => {
  const { doors } = wallsOf(house(box, { doors: 2 }));
  assert.equal(doors.length, 2);
  assert.ok(Math.hypot(doors[0].x - doors[1].x, doors[0].z - doors[1].z) > DOOR_WIDE);
});

test('door walls have their outside on the right of the way the ring runs', () => {
  const { panels } = wallsOf(house(box));
  for (const p of panels) {
    const mx = (p.ax + p.bx) / 2 + p.nx * .5, mz = (p.az + p.bz) / 2 + p.nz * .5;
    assert.ok(!insideRing(mx, mz, box), `outside of ${JSON.stringify(p)}`);
  }
});

test('eaves are the height of the floors, and nothing is lower than a door', () => {
  assert.equal(eavesOf(house(box)), 2.75);
  assert.equal(eavesOf(house(box, { floors: 2 })), 5.5);
  for (const s of placed) assert.ok(eavesOf(s) > 2.4, String(s.id));
});

function written(s) { const sheet = new Sheet(); writeStructure(sheet, s, 6); return sheet.arrays(); }
function faces(a) {
  for (let i = 0; i < a.position.length; i++) assert.ok(Number.isFinite(a.position[i]), `position ${i}`);
  for (let i = 0; i < a.normal.length; i += 3) assert.ok(Math.abs(Math.hypot(a.normal[i], a.normal[i + 1], a.normal[i + 2]) - 1) < .01, `normal ${i}`);
  for (let i = 0; i < a.uv.length; i++) assert.ok(Number.isFinite(a.uv[i]), `uv ${i}`);
  for (let i = 0; i < a.index.length; i++) assert.ok(a.index[i] < a.position.length / 3, `index ${i}`);
}

for (const roof of ['gable', 'hip', 'flat', 'shed']) {
  test(`a ${roof} roof comes out as clean solids, in pieces of its own`, () => {
    const s = house(ell, { roof, sqm: 200, porch: 'front', carport: true, shutters: true }), a = written(s);
    faces(a);
    const kinds = new Set(a.pieces.map((p) => p.kind));
    for (const k of ['wall', 'lintel', 'door', 'roof', 'kudzu']) assert.ok(kinds.has(k), k);
    assert.ok(a.pieces.filter((p) => p.kind === 'wall' || p.kind === 'roof').length > 12, 'walls and roof are in pieces');
    a.pieces.forEach((p, i) => { if (i) { const q = a.pieces[i - 1]; assert.ok(p.first >= q.first + q.count, `piece ${i} overlaps`); } });
  });
}

// how high a piece goes, from its lowest corner to its highest
const span = (a, p) => { let lo = Infinity, hi = -Infinity; for (let i = p.first; i < p.first + p.count; i++) { lo = Math.min(lo, a.position[i * 3 + 1]); hi = Math.max(hi, a.position[i * 3 + 1]); } return [lo, hi]; };
test('a house of two floors has a row of windows on each under its eaves, and a roof down its side stays a floor high', () => {
  const s = house(box, { floors: 2, glass: ['north', 'east', 'south', 'west'], lean: { edge: 2, deep: 2.8, t0: 0, t1: 12 } }), a = written(s);
  const windows = a.pieces.filter((p) => p.kind === 'window').map((p) => span(a, p)), rows = [...new Set(windows.map(([lo]) => lo.toFixed(2)))].map(Number).sort((x, y) => x - y);
  const lean = Math.max(...a.pieces.filter((p) => p.kind === 'porch').map((p) => span(a, p)[1])), firstTop = Math.max(...windows.filter(([lo]) => lo < rows[1]).map(([, hi]) => hi));
  assert.equal(rows.length, 2, `windows start at ${rows}`);
  assert.ok(Math.max(...windows.map(([, hi]) => hi)) < 6 + eavesOf(s), 'the top row is under the eaves');
  assert.ok(lean > firstTop && lean < rows[1], `the roof down its side meets the wall at ${lean}, between the first floor's windows, up to ${firstTop}, and the second's, from ${rows[1]}`);
});

test('the roof is marked with its building, and nothing else is', () => {
  const a = written(house(box)), marks = new Set();
  for (let i = 2; i < a.mat.length; i += 3) marks.add(a.mat[i]);
  assert.deepEqual([...marks].sort(), [-1, 7]);
});

test('every wall panel stands on the floor it was given', () => {
  const a = written(house(box));
  let lowest = Infinity;
  for (let i = 1; i < a.position.length; i += 3) lowest = Math.min(lowest, a.position[i]);
  assert.ok(lowest >= 5.9 && lowest <= 6.01, String(lowest));
});

test('the same building comes out the same every time', () => {
  const a = written(house(ell)), b = written(house(ell));
  assert.deepEqual([...a.position], [...b.position]);
  assert.deepEqual([...a.color], [...b.color]);
});

test('the data says where it came from', () => {
  const f = data.source.footprints;
  assert.equal(f.license, 'CC BY 4.0');
  assert.match(f.by, /Oak Ridge National Laboratory/);
  assert.match(f.sha256, /^[0-9a-f]{64}$/);
  assert.equal(data.structures.length + data.dropped.length + data.outsideTheMap, f.features);
});

test('every field is one the generator knows', () => {
  const color = /^#[0-9a-f]{6}$/;
  for (const s of [...data.structures, ...data.extras]) {
    assert.ok(['house', 'mobile', 'shed', 'farm', 'public', 'shop', 'office', 'church', 'cabin', 'hall'].includes(s.use), `${s.id} ${s.use}`);
    assert.ok(['siding', 'brick', 'block', 'metal', 'plank', 'stucco', 'mobile'].includes(s.walls), `${s.id} ${s.walls}`);
    assert.ok(['gable', 'hip', 'flat', 'shed'].includes(s.roof), `${s.id} ${s.roof}`);
    assert.ok(['shingle', 'metal'].includes(s.roofMat), `${s.id} ${s.roofMat}`);
    assert.match(s.wallColor, color); assert.match(s.roofColor, color);
    assert.ok(Number.isInteger(s.door) && s.door >= 0 && s.door < s.ring.length, `${s.id} door`);
    assert.ok(s.ring.length >= 3, String(s.id));
  }
});

test('notes hold no names or street numbers', () => {
  const notes = json('../tools/structure_notes.json');
  for (const [id, n] of Object.entries(notes.structures)) if (n.what) assert.doesNotMatch(n.what, /\d|[A-Z]{2,}/, `${id}: ${n.what}`);
});

test('what was written down comes through to the data', () => {
  const notes = json('../tools/structure_notes.json').structures, kept = new Map(data.structures.map((s) => [String(s.id), s])), dropped = new Map(data.dropped.map((d) => [String(d.id), d]));
  for (const [id, n] of Object.entries(notes)) {
    if (n.condition === 'gone') { assert.equal(dropped.get(id)?.why, 'gone', id); assert.ok(!kept.has(id), id); continue; }
    const s = kept.get(id);
    if (!s) { assert.ok(dropped.has(id), `${id} went missing`); continue; }
    assert.equal(s.seen, true, id);
    for (const k of ['use', 'open', 'walls', 'roof', 'roofMat', 'floors', 'condition', 'carport', 'trimColor', 'doorColor', 'what']) if (k in n) assert.equal(s[k], n[k], `${id} ${k}`);
  }
  assert.ok(data.structures.filter((s) => s.open).length >= 8, 'the carports and canopies are open');
});

test('every building keeps its real shape and size', () => {
  for (const s of placed) {
    const a = Math.abs(area(s.pts));
    assert.ok(a > 10, `${s.id} is ${a}`);
    assert.ok(Number.isFinite(s.wx) && Number.isFinite(s.wz), String(s.id));
    s.pts.forEach(([x, z], i) => { assert.ok(Math.abs(x - s.wx - s.ring[i][0]) < 1e-6 && Math.abs(z - s.wz - s.ring[i][1]) < 1e-6, `${s.id} is rigid`); });
  }
});

test('nothing stands in the opening', () => {
  for (const s of placed) assert.ok(Math.abs(s.wx) >= 150 || Math.abs(s.wz) >= 150, `${s.id} at ${s.wx}, ${s.wz}`);
});

test('nothing stands on a road', () => {
  for (const s of placed) for (const [x, z] of s.pts) {
    const d = map.roadGrid.nearest(x, z);
    if (d < 32) assert.ok(d > map.roadGrid.seg.owner.width / 2, `${s.id} is ${d} m from ${map.roadGrid.seg.owner.id}`);
  }
});

test('no two buildings stand in each other', () => {
  const insideOther = (a, b) => a.pts.some(([x, z]) => insideRing(x, z, b.pts));
  for (const c of cellsOf(placed, 96)) {
    const near = placed.filter((s) => Math.abs(s.wx - c.x) < 140 && Math.abs(s.wz - c.z) < 140);
    for (const a of c.list) for (const b of near) if (a !== b && (insideOther(a, b) || insideOther(b, a))) assert.fail(`${a.id} and ${b.id}`);
  }
});

test('every building writes out clean', () => {
  // one in nine of them: a house at a time is quick, and all of them isn't
  for (let i = 0; i < placed.length; i += 9) faces(written(placed[i]));
});

test('the axis lies along the longest wall', () => {
  const [ux, uz] = axisOf([[0, 0], [10, 0], [10, 3], [0, 3]]);
  assert.ok(Math.abs(Math.abs(ux) - 1) < 1e-9 && Math.abs(uz) < 1e-9);
  assert.deepEqual(boundsOf([[1, 2], [3, -4]]), { x0: 1, x1: 3, z0: -4, z1: 2 });
});

test('a porch along the whole of a wall keeps its posts out of the doorway', () => {
  const s = { pts: [[0, 0], [13, 0], [13, 9], [0, 9]], wx: 6.5, wz: 4.5, door: 0, walls: 'siding', roofMat: 'metal', porch: 'wrap', sqm: 117, floors: 1 };
  const { doors } = wallsOf(s, 0), { x, z } = doors[0], posts = collidersOf(s, 0).filter((w) => w[6]?.startsWith?.('post') || w[5] < .2);
  for (const [ax, az] of posts) assert.ok(Math.hypot(ax - x, az - (z - 1.95)) > 1, `a post at ${ax}, ${az}, right in the way of the door at ${x}, ${z}`);
});
