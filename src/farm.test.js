import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFarm, EDGE } from './farm.js';

const map = { fromTrue: (x, z) => [x, z] };
// a square of pasture with a clump of trees in the middle of it, and young pines in one corner
const square = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const little = buildFarm({
  open: [{ ring: square(0, 0, 400, 400) }],
  woods: [{ ring: square(180, 180, 220, 220) }],
  young: [{ ring: square(0, 0, 60, 60) }],
  fences: [[[0, 0], [400, 0]]],
  scars: [[300, 300]],
  bales: [[310, 300, 1]],
  lone: [[100, 100], [333, 77]],
}, map);

test('nothing grows by chance on open land', () => {
  assert.equal(little.clear(100, 300), true);
  assert.equal(little.clear(380, 380), true);
  assert.equal(little.clear(-100, 300), false);
  assert.equal(little.clear(9000, 9000), false);
});

test('trees left standing in the middle of it are woods, with no grass', () => {
  assert.equal(little.clear(200, 200), false);
  assert.equal(little.grass(200, 200), 0);
  assert.equal(little.grass(100, 200), 1);
});

test('young pines stand on grass, and aren\'t open land', () => {
  assert.equal(little.young(30, 30), true);
  assert.equal(little.clear(30, 30), false);
  assert.equal(little.young(100, 100), false);
  assert.equal(little.grass(30, 30), 1);
});

test('woods close up against open land, and not further off', () => {
  assert.equal(little.edge(-16, 200), true);
  assert.equal(little.edge(200, 200), true, 'a clump in the middle of it is right against it');
  assert.equal(little.edge(100, 100), false, 'open land itself is not woods');
  assert.equal(little.edge(-(EDGE + 40), 200), false);
});

test('the edge of the grass is soft, and it stops', () => {
  const edge = little.grass(-3, 200);
  assert.ok(edge > 0 && edge < 1, `${edge}`);
  assert.equal(little.grass(-40, 200), 0);
  assert.equal(little.grass(5000, 200), 0);
});

test('a lone tree is known by the square of the woods it stands in', () => {
  assert.deepEqual(little.lone(Math.floor(100 / 11), Math.floor(100 / 11)), { x: 100, z: 100 });
  assert.equal(little.lone(0, 0), undefined);
});

test('a scar is bare in the middle and goes to nothing', () => {
  assert.equal(little.scar(300, 300), 1);
  const edge = little.scar(306, 300);
  assert.ok(edge > 0 && edge < 1, `${edge}`);
  assert.equal(little.scar(330, 300), 0);
});

// ---- the real one
const data = JSON.parse(readFileSync(new URL('../data/farm.json', import.meta.url)));
const roads = JSON.parse(readFileSync(new URL('../data/roads.json', import.meta.url)));
const farm = buildFarm(data, map);

test('it starts at the river south of the bridge he wakes on', () => {
  const [x, z] = [-336.76, 490.37], wake = roads.reference.crossings.find((c) => c.road === 'griffis_fountain_rd' && c.with === 'river');
  assert.ok(Math.hypot(wake.x - x, wake.z - z) < 1);
  assert.equal(farm.clear(-340, 560), true, 'straight off the south end of the bridge, and the grass goes up to the road');
  assert.equal(farm.clear(-340, 470), false, 'and north of the river it does not');
});

test('its barns are about a mile from that bridge', () => {
  const d = Math.hypot(-520 + 336.76, 1700 - 490.37);
  assert.ok(d > 1100 && d < 1400, `${d}`);
  assert.equal(farm.clear(-520, 1650), true);
});

test('real woods stay woods', () => {
  for (const [x, z] of [[-550, 1400], [300, 1500], [-1100, 1300], [-500, 2200]]) assert.equal(farm.clear(x, z), false, `${x}, ${z}`);
});

test('every fence is a real line and every tree is out of the woods it would be lost in', () => {
  for (const f of data.fences) { assert.ok(f.length >= 2); for (const [x, z] of f) assert.ok(Number.isFinite(x) && Number.isFinite(z)); }
  const lost = data.lone.filter(([x, z]) => !farm.grass(x, z));
  assert.ok(lost.length <= 3, JSON.stringify(lost));
});

test('nothing in it is anybody\'s name or address, only what was seen', () => {
  const said = [...data.open, ...data.woods, ...data.young].map((o) => o.seen).join(' ');
  assert.ok(!/\d/.test(said), 'no house numbers');
  assert.deepEqual(Object.keys(data).sort(), ['axes', 'bales', 'fences', 'lone', 'open', 'scars', 'source', 'units', 'version', 'woods', 'young']);
});
