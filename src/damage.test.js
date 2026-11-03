// What breaks, what comes down with it and where it lands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMap } from './map.js';
import { Sheet, collidersOf, fellIn, placeStructures, wallsOf, writeStructure } from './structures.js';
import { burnRate, createDamage, faceNormals, modeOf, partsOf, settle, tip, tipNormals } from './damage.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const placed = placeStructures(json('../data/structures.json'), buildMap(json('../data/roads.json')));
const box = [[-6, -4], [6, -4], [6, 4], [-6, 4]];
const house = (more = {}) => ({ id: 1234, index: 7, wx: 0, wz: 0, pts: box, door: 0, use: 'house', walls: 'siding', roof: 'gable', roofMat: 'shingle', sqm: 96, wallColor: '#c9c1b4', roofColor: '#3d3a3c', ...more });
const near = (a, b, e = 1e-5) => Math.abs(a - b) < e;

function watched(s) {
  const fell = [], d = createDamage({ on: { fall: (b, p) => fell.push(p) } });
  return { d, fell, st: d.state(s) };
}
const wall = (st, i = 0) => st.walls.filter((w) => w.kind === 'wall')[i];

test('a piece keeps its place however often it is written', () => {
  const s = house({ porch: 'front', carport: true, shutters: true }), a = partsOf(s).parts.map((p) => [p.part, p.kind, p.first, p.count]), b = partsOf(s).parts.map((p) => [p.part, p.kind, p.first, p.count]);
  assert.deepEqual(a, b);
  a.forEach(([part], i) => assert.equal(part, i));
});

test('pieces that hang on a panel know which', () => {
  const { parts, panels } = partsOf(house({ shutters: true }));
  for (const p of parts) if (['window', 'shutter', 'door', 'kudzu'].includes(p.kind)) assert.ok(p.on >= 0 && p.on < panels.length, `${p.kind} ${p.on}`);
  const lintel = parts.find((p) => p.kind === 'lintel'), door = parts.find((p) => p.kind === 'door');
  assert.equal(door.on, lintel.panel);
});

test('a wall takes more than one swing, and brick takes more than siding', () => {
  for (const [walls, swings] of [['siding', 2], ['brick', 5]]) {
    const s = house({ walls }), { d, st } = watched(s), w = wall(st); let n = 0;
    while (!w.gone && n < 20) { d.hit(s, w, 1, 1, 0); n++; }
    assert.equal(n, swings, walls);
  }
});

test('whatever hangs on a wall goes with it, and the glass goes first', () => {
  const s = house({ shutters: true }), { d, st, fell } = watched(s), w = st.walls.find((q) => q.holds.some((h) => h.kind === 'window')), glass = w.holds.find((h) => h.kind === 'window');
  let broke = 0; const e = createDamage({ on: { shatter: () => broke++ } }), st2 = e.state(s), w2 = st2.parts[w.part];
  e.hit(s, w2, 1, 1, 0);
  assert.equal(broke, 1); assert.ok(!w2.gone, 'one swing of two');
  d.hit(s, w, 5, 1, 0);
  assert.ok(w.gone && glass.gone);
  assert.ok(fell.includes(glass));
});

test('a roof holds until too little is under it, and walls go first', () => {
  const s = house(), { d, st, fell } = watched(s), roof = st.parts.filter((p) => p.kind === 'roof');
  assert.ok(roof.length > 2);
  d.hit(s, wall(st), 9, 1, 0);
  assert.ok(roof.every((r) => !r.gone) || fell[0].kind === 'wall', 'the wall went first');
  for (const w of st.walls) if (!w.gone) d.hit(s, w, 9, 1, 0);
  assert.ok(roof.every((r) => r.gone), 'with no walls, nothing stays up');
  assert.equal(fell.filter((p) => p.kind === 'wall')[0], fell[0]);
});

test('past a point the rest of it comes down by itself', () => {
  const s = house(), { d, st } = watched(s), walls = st.walls;
  for (const w of walls) { if (d.gone(s) >= .6) break; if (!w.gone) d.hit(s, w, 9, 1, 0); }
  assert.ok(st.parts.every((p) => p.gone || p.kind === 'window'), st.parts.filter((p) => !p.gone).map((p) => p.kind).join());
  assert.equal(d.gone(s), 1);
});

test('one hole does not bring down a building', () => {
  const s = placed.find((b) => b.sqm > 150 && b.walls === 'brick') ?? house({ walls: 'brick' }), { d, st } = watched(s);
  d.hit(s, wall(st), 9, 1, 0);
  assert.ok(st.walls.filter((w) => !w.gone).length >= st.walls.length * .7, `${st.walls.filter((w) => !w.gone).length} of ${st.walls.length}`);
});

test('every building in the map can be brought all the way down', () => {
  for (let i = 0; i < placed.length; i += 11) {
    const s = placed[i], { d, st } = watched(s);
    for (let guard = 0; guard < 400 && st.parts.some((p) => !p.gone && p.kind !== 'window' && p.kind !== 'kudzu'); guard++) { const p = st.parts.find((q) => !q.gone && q.kind !== 'window' && q.kind !== 'kudzu'); d.hit(s, p, 9, 1, 0); }
    assert.ok(st.parts.every((p) => p.gone || p.kind === 'window' || p.kind === 'kudzu'), String(s.id));
    assert.ok(st.parts.filter((p) => p.kind === 'wall').every((w) => w.gone), String(s.id));
  }
});

test('the same blows bring down the same pieces', () => {
  const s = house({ porch: 'front' }), run = () => { const { d, st, fell } = watched(s); d.blast(s, 6, 1, 0, 5, 6); return [fell.map((p) => [p.part, p.dirx, p.dirz, p.delay]), st.parts.map((p) => p.hp)]; };
  assert.deepEqual(run(), run());
});

test('a blast is worst in the middle and does nothing past its reach', () => {
  const s = house(), { d, st } = watched(s);
  d.blast(s, 40, 1, 0, 6, 9);
  assert.ok(st.parts.every((p) => p.hp === p.max));
  d.blast(s, 6.2, 1, 0, 6, 9);
  const east = st.walls.filter((w) => w.x > 5), west = st.walls.filter((w) => w.x < -5);
  assert.ok(east.every((w) => w.gone));
  assert.ok(west.every((w) => w.hp === w.max) );
});

test('a swing finds the wall it lands on, at the right height', () => {
  const s = house(), { d } = watched(s), e = d.nearest(s, 7, 1, 2, 2);
  assert.ok(e && e.part.kind === 'wall', JSON.stringify(e?.part?.kind));
  assert.ok(near(e.d, 1));
  assert.equal(d.nearest(s, 7, 40, 2, 2), null, 'over its head');
  assert.equal(d.nearest(s, 30, 1, 2, 2), null, 'out of reach');
  assert.ok(e.part.kind === 'wall' && d.nearest(s, 0, 1, -3.9, .5)?.part.z < 0, 'from inside too');
});

test('a wall falls away from what hit it', () => {
  const s = house(), { d, st } = watched(s), w = st.walls.find((q) => q.kind === 'wall' && q.x > 5);
  d.hit(s, w, 9, -1, 0);   // from the east, so it goes in
  assert.ok(near(w.dirx, -1) && near(w.dirz, 0), `${w.dirx}, ${w.dirz}`);
});

test('what stops him is what is drawn', () => {
  const ruin = placed.find((s) => s.condition === 'ruin') ?? house({ condition: 'ruin', id: 99 }), { panels } = wallsOf(ruin);
  const stops = new Set(collidersOf(ruin).map((w) => w[6]));
  panels.forEach((p, i) => { if (p.solid) assert.equal(stops.has(i), !fellIn(ruin, p, i), `panel ${i}`); });
  const sheet = new Sheet(); writeStructure(sheet, ruin); const drawn = new Set(sheet.pieces.filter((p) => p.kind === 'wall').map((p) => p.panel));
  panels.forEach((p, i) => { if (p.kind === 'wall') assert.equal(drawn.has(i), stops.has(i), `panel ${i}`); });
});

test('every collider belongs to a piece that can fall', () => {
  const s = house({ porch: 'front', carport: true }), { walls, posts } = partsOf(s);
  for (const w of collidersOf(s)) {
    const which = w[6];
    if (which >= 0) assert.ok(walls.some((q) => q.panel === which), `panel ${which}`);
    else assert.ok(posts[-1 - which], `post ${-1 - which}`);
  }
});

test('tipping leans up towards the way it falls, about the pivot', () => {
  const from = new Float32Array([0, 1, 0, 2, 0, 0]), to = new Float32Array(6);
  tip(from, to, 2, [0, 0, 0], 1, 0, Math.PI / 2);
  assert.ok(near(to[0], 1) && near(to[1], 0) && near(to[2], 0), [...to].join());
  assert.ok(near(to[3], 0) && near(to[4], -2) && near(to[5], 0), [...to].join());
  tip(from, to, 1, [0, 0, 0], 0, -1, Math.PI / 2);
  assert.ok(near(to[0], 0) && near(to[1], 0) && near(to[2], -1), [...to].join());
});

for (const [walls, want] of [['siding', 'topple'], ['brick', 'crumble']]) {
  test(`a ${walls} wall ends up on the floor, ${want === 'topple' ? 'in one sheet' : 'in a heap'}`, () => {
    const s = house({ walls }), base = 6, st = createDamage({ base }).state(s), sheet = new Sheet(); writeStructure(sheet, s, base);
    const p = st.walls.find((w) => w.kind === 'wall'); p.dirx = 0; p.dirz = 1;
    assert.equal(modeOf(s, p), want);
    const from = sheet.position.slice(p.first * 3, (p.first + p.count) * 3), to = new Float32Array(from.length), how = settle(s, p, base, from, to);
    assert.equal(how.mode, want);
    let top = -Infinity, low = Infinity;
    for (let i = 1; i < to.length; i += 3) { assert.ok(Number.isFinite(to[i])); top = Math.max(top, to[i]); low = Math.min(low, to[i]); }
    assert.ok(low >= base, `${low}`); assert.ok(top < base + 1, `${top}`);
    if (want === 'topple') { const edge = from.reduce((n, v, i) => (i % 3 === 2 ? Math.max(n, v) : n), -Infinity); assert.ok(to.reduce((n, v, i) => (i % 3 === 2 ? Math.max(n, v) : n), -Infinity) > edge + 1.5, 'it went the way it was told'); }
  });
}

test('a corner stays one corner when it crumbles, so the heap stays closed', () => {
  const s = house({ walls: 'brick' }), st = createDamage({}).state(s), sheet = new Sheet(); writeStructure(sheet, s, 0);
  const p = st.walls[0]; p.dirx = 1; p.dirz = 0;
  const from = sheet.position.slice(p.first * 3, (p.first + p.count) * 3), to = new Float32Array(from.length); settle(s, p, 0, from, to);
  const seen = new Map();
  for (let i = 0; i < from.length; i += 3) { const k = `${from[i].toFixed(3)},${from[i + 1].toFixed(3)},${from[i + 2].toFixed(3)}`, v = [to[i], to[i + 1], to[i + 2]]; if (seen.has(k)) assert.deepEqual(seen.get(k), v); else seen.set(k, v); }
  assert.ok(seen.size < from.length / 3, 'corners are shared');
});

test('roofs land flat and low, near where they were', () => {
  const s = house(), base = 6, st = createDamage({ base }).state(s), sheet = new Sheet(); writeStructure(sheet, s, base);
  for (const p of st.parts.filter((q) => q.kind === 'roof')) {
    const from = sheet.position.slice(p.first * 3, (p.first + p.count) * 3), to = new Float32Array(from.length), how = settle(s, p, base, from, to);
    assert.equal(how.mode, 'drop'); assert.ok(how.T > 0 && how.T < 1);
    for (let i = 0; i < to.length; i += 3) { assert.ok(to[i + 1] >= base && to[i + 1] < base + 1.5, `${to[i + 1]}`); assert.ok(Math.abs(to[i] - from[i]) < .5); }
  }
});

test('glass and leaves go to nothing, at one point', () => {
  const s = house({ shutters: true }), st = createDamage({}).state(s), sheet = new Sheet(); writeStructure(sheet, s, 0);
  const p = st.parts.find((q) => q.kind === 'window'), from = sheet.position.slice(p.first * 3, (p.first + p.count) * 3), to = new Float32Array(from.length);
  assert.equal(settle(s, p, 0, from, to).mode, 'vanish');
  for (let i = 0; i < to.length; i += 3) assert.deepEqual([to[i], to[i + 1], to[i + 2]], [to[0], to[1], to[2]]);
});

test('normals stay unit length through a fall', () => {
  const s = house(), st = createDamage({}).state(s), sheet = new Sheet(); writeStructure(sheet, s, 0);
  const p = st.walls.find((w) => w.kind === 'wall'); p.dirx = 1; p.dirz = 0;
  const n = sheet.normal.slice(p.first * 3, (p.first + p.count) * 3), out = new Float32Array(n.length);
  tipNormals(n, out, p.count, 1, 0, 1.2);
  for (let i = 0; i < out.length; i += 3) assert.ok(near(Math.hypot(out[i], out[i + 1], out[i + 2]), 1, 1e-3));
  const q = st.parts.find((w) => w.kind === 'roof'), pos = sheet.position.slice(), nor = sheet.normal.slice();
  faceNormals(pos, nor, q.first, q.count);
  for (let v = q.first; v < q.first + q.count; v++) assert.ok(near(Math.hypot(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]), 1, 1e-3));
  for (let i = q.first * 3; i < (q.first + q.count) * 3; i++) assert.ok(near(nor[i], sheet.normal[i], 1e-3), 'and untouched pieces work out as they were written');
});

// ---- fire
const dice = (seed = 1) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function burnDown(s, seconds = 240) {
  const { d, st, fell } = watched(s), rand = dice();
  d.catchNear(s, 0, 1, 0, 30);
  for (let t = 0; t < seconds && d.burning(s); t += .25) d.stepFire(s, .25, rand);
  return { d, st, fell };
}
test('a fire in a wooden house takes all of it down, given time', () => {
  const s = house(), { d, st } = burnDown(s);
  assert.equal(d.burning(s), 0);
  assert.ok(d.gone(s) > .95, `${d.gone(s)} of its walls`);
  assert.ok(st.parts.filter((p) => p.kind === 'roof').every((p) => p.gone), 'and its roof');
});
test('a fire in a brick house takes its roof and leaves its walls', () => {
  const s = house({ walls: 'brick', id: 321 }), { d, st } = burnDown(s);
  assert.equal(d.burning(s), 0);
  assert.ok(st.parts.filter((p) => p.kind === 'roof').every((p) => p.gone), 'the roof');
  assert.equal(st.walls.filter((w) => w.kind === 'wall' && w.gone).length, 0, 'the walls');
});
test('what will not burn does not catch', () => {
  const s = house({ walls: 'block' }), { d, st } = watched(s), w = wall(st);
  assert.equal(burnRate(s, w), 0);
  assert.equal(d.burn(s, w), false);
  assert.equal(d.burning(s), 0);
});
test('fire keeps to what is next to it, and takes its time', () => {
  const s = house(), { d, st } = watched(s), rand = dice(), w = wall(st);
  assert.ok(d.burn(s, w));
  d.stepFire(s, .25, rand);
  assert.ok(d.burning(s) < 4, `${d.burning(s)} after a quarter of a second`);
  for (const p of st.burning) assert.ok(Math.hypot(p.x - w.x, p.y - w.y, p.z - w.z) < 3.5);
  assert.ok(!w.gone);
});
test('what falls stops burning, and says it was', () => {
  const s = house(), seen = [], d = createDamage({ on: { fall: (b, p, was) => seen.push(was) } }), st = d.state(s), w = wall(st);
  d.burn(s, w); d.hit(s, w, 99);
  assert.equal(seen[0], true);
  assert.ok(!st.burning.has(w));
});
test('the same dice burn it down the same way', () => {
  const run = () => burnDown(house()).fell.map((p) => p.part).join();
  assert.equal(run(), run());
});
test('every piece that stops him knows which collider it is', () => {
  const s = house({ porch: 'front', carport: true }), { parts } = partsOf(s), named = new Set(parts.map((p) => p.stop));
  for (const w of collidersOf(s)) assert.ok(named.has(w[6]), `collider ${w[6]}`);
});
