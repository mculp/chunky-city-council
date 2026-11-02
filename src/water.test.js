// What a pond is, and that data/water.json says what data/water.md says it does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMap } from './map.js';
import { REACH, buildWater } from './water.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const data = json('../data/water.json'), roads = json('../data/roads.json'), map = buildMap(roads);

// on a made-up map where a true metre is a world metre
const flat = { fromTrue: (x, z) => [x, z] };
const square = (x, z, size) => [[x, z], [x + size, z], [x + size, z + size], [x, z + size]];
const made = (...rings) => buildWater({ ponds: rings.map((ring, i) => ({ id: `p${i}`, source: 'nhd', area: 1000, ring })) }, flat);

test('every pond has an id of its own and a closed outline with no repeated point', () => {
  assert.equal(new Set(data.ponds.map((p) => p.id)).size, data.ponds.length);
  for (const p of data.ponds) {
    assert.ok(p.ring.length >= 3, p.id);
    p.ring.forEach(([x, z], i) => { const [u, v] = p.ring[(i + 1) % p.ring.length]; assert.ok(x !== u || z !== v, `${p.id} repeats ${x}, ${z}`); });
  }
});

test('a pool has straight sides and stays where it was put', () => {
  const W = buildWater({ ponds: [{ id: 'pool-1', source: 'naip', pool: 'blue', area: 40, ring: square(0, 0, 8) }] }, flat), p = W.ponds[0];
  W.settle(() => 100, 5.65);
  assert.equal(p.pool, 'blue');
  assert.ok(Math.abs(p.level - 6.03) < 1e-9, `${p.level}`);
  assert.ok(p.deep > 1.4);
  assert.equal(made(square(0, 0, 8)).ponds[0].pool, null);
});

test('an outline is its lon/lat, by the map\'s own projection', () => {
  const R = data.projection.radiusM, lat0 = data.origin.lat * Math.PI / 180;
  for (const p of data.ponds) {
    assert.equal(p.lonlat.length, p.ring.length, p.id);
    p.lonlat.forEach(([lon, lat], i) => {
      const x = R * (lon - data.origin.lon) * Math.PI / 180 * Math.cos(lat0), z = -R * (lat - data.origin.lat) * Math.PI / 180;
      assert.ok(Math.hypot(x - p.ring[i][0], z - p.ring[i][1]) < .2, `${p.id} vertex ${i} is off`);
    });
  }
});

test('an area is what its outline comes to', () => {
  for (const p of data.ponds) {
    let a = 0; p.ring.forEach(([x, z], i) => { const [u, v] = p.ring[(i + 1) % p.ring.length]; a += x * v - u * z; });
    assert.ok(Math.abs(Math.abs(a) / 2 - p.area) <= 1, p.id);
  }
});

test('each comes from one of the two sources, and both are credited', () => {
  for (const p of data.ponds) assert.ok(p.source === 'nhd' || p.source === 'naip', p.id);
  assert.equal(data.source.ponds.license, 'Public domain');
  assert.match(data.source.ponds.by, /Geological Survey/);
  assert.equal(data.source.extras.license, 'Public domain');
  assert.match(data.source.extras.by, /Department of Agriculture/);
  assert.ok(!JSON.stringify(data.source).toLowerCase().includes('google'));
});

test('nothing in it comes near the first scene', () => {
  const b = map.bridge;
  for (const p of data.ponds) for (const [x, z] of p.ring) assert.ok(Math.hypot(x - b.x, z - b.z) > 400, p.id);
  assert.equal(data.left.byTheBridge, 0);
});

test('the real map loads, and each pond is where its data says, on the world\'s frame', () => {
  const W = buildWater(data, map);
  assert.equal(W.ponds.length, data.ponds.length);
  for (const [i, p] of W.ponds.entries()) {
    const [x, z] = map.fromTrue(...data.ponds[i].ring[0]);
    assert.ok(Math.hypot(p.ring[0][0] - x, p.ring[0][1] - z) < 1e-9, p.id);
  }
  // the one on the east side of Commerce St, by its middle
  const commerce = W.in(...map.fromTrue(75, -325));
  assert.ok(commerce, 'there\'s a pond east of Commerce St');
  assert.equal(W.in(...map.fromTrue(-37, -325)), null, 'and none on the street');
});

test('look says how far from the shore, negative in the water, up to its reach', () => {
  const W = made(square(0, 0, 100));
  assert.equal(W.look(50, 50), W.ponds[0]); assert.equal(W.d, -REACH);
  assert.equal(W.look(10, 50), W.ponds[0]); assert.ok(Math.abs(W.d + 10) < 1e-9);
  assert.equal(W.look(-5, 50), W.ponds[0]); assert.ok(Math.abs(W.d - 5) < 1e-9);
  assert.equal(W.look(-REACH - 1, 50), null); assert.equal(W.d, Infinity);
  assert.equal(W.look(5000, 5000), null); assert.equal(W.pond, null);
});

test('in only counts what\'s inside, and a bay in a pond is land', () => {
  // a U, open at the north
  const W = made([[0, 0], [20, 0], [20, 60], [40, 60], [40, 0], [60, 0], [60, 80], [0, 80]]);
  assert.equal(W.in(10, 40), W.ponds[0]);
  assert.equal(W.in(50, 40), W.ponds[0]);
  assert.equal(W.in(30, 70), W.ponds[0]);
  assert.equal(W.in(30, 30), null);
  assert.equal(W.in(-1, 40), null);
  assert.equal(W.look(30, 30), W.ponds[0]); assert.ok(W.d > 0 && W.d <= 10);
});

test('of two ponds close together it answers with the right one', () => {
  const W = made(square(0, 0, 40), square(50, 0, 40));
  assert.equal(W.in(20, 20), W.ponds[0]);
  assert.equal(W.in(70, 20), W.ponds[1]);
  assert.equal(W.in(45, 20), null);
  assert.equal(W.look(70, 20), W.ponds[1]);
  assert.equal(W.look(38, 20), W.ponds[0]);
});

test('a pond stands just under the lowest of its shore', () => {
  const W = made(square(0, 0, 100));
  W.settle(() => 5, 9);
  assert.ok(Math.abs(W.ponds[0].level - 4.7) < 1e-9);
  W.settle((x) => (x > 90 ? 4 : 6), 9);
  assert.ok(Math.abs(W.ponds[0].level - 3.7) < 1e-9, 'and one low place sets it');
  assert.ok(Math.abs(W.level(50, 50) - 3.7) < 1e-9);
});

test('never higher than it\'s told, and down by the river it\'s the river', () => {
  const W = made(square(0, 0, 100));
  W.settle(() => 20, 5.65);
  assert.equal(W.ponds[0].level, 5.65);
  W.settle(() => 1, 5.65);
  assert.equal(W.ponds[0].level, 0);
});

test('off a pond the water\'s the river\'s, which is 0', () => {
  const W = made(square(0, 0, 100));
  W.settle(() => 5, 9);
  assert.equal(W.level(500, 500), 0);
  assert.equal(W.level(-1, 50), 0);
});

test('the bigger the pond the deeper, between the two limits', () => {
  const W = buildWater({ ponds: [100, 2500, 10000, 1000000].map((area, i) => ({ id: `p${i}`, source: 'nhd', area, ring: square(i * 1000, 0, Math.sqrt(area)) })) }, flat);
  const deep = W.ponds.map((p) => p.deep);
  assert.equal(deep[0], 1.1);
  assert.ok(deep[1] > 1.1 && deep[1] < deep[2]);
  assert.equal(deep[3], 3);
});
