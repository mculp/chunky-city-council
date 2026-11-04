import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BRIDGE, createAside } from './aside.js';
import { CEMETERY } from './graves.js';

const json = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const farm = json('farm.json'), roads = json('roads.json'), aside = createAside(farm);
const list = (d) => (Array.isArray(d) ? d : Object.values(d).find(Array.isArray));
const buildings = list(json('structures.json'));

test('the world\'s middle is where the map puts Stuckey\'s Bridge, in true metres', () => {
  const b = roads.reference.crossings.find((c) => c.road === roads.opening.road && c.with === 'river');
  assert.deepEqual(BRIDGE, [b.x, b.z]);
  assert.deepEqual(roads.compression, [], 'and true metres go straight over, with nothing squeezed');
});

// Where things are built at each of them, in true metres, from index.html and the data
const SET_ASIDE = {
  'the compound on Pine Forest Rd, its sign at the road, its house and its cabin by the river': [[844.6, 736.2], [1030, 625], [1045, 588]],
  'the yard off True Light Rd, the house and the propane tank out back': [[-1549, -768], [-1520, -816]],
  'a home, its barn and the drive in off the road': [[-1.04, -504.27], [33.93, -484.37], [34, -471.6]],
  'the trailer with the computer in it, and its deck': [[-359.91, -574.58], [-356.5, -572.2]],
  'Robby\'s lot, from what\'s left of the trailer to the hearth': [[-254.5, 200], [-276, 189.5], [-259.1, 203.2]],
};
for (const [what, spots] of Object.entries(SET_ASIDE)) {
  test(`nothing breaks online at ${what}`, () => {
    for (const [x, z] of spots) assert.ok(aside.at(x, z), `(${x}, ${z})`);
  });
}

test('nothing breaks online anywhere on the farm south of the bridge: its yard, its pastures, its fences, its lone trees and its bales', () => {
  for (const [x, z] of [[-500, 1680], [-485, 1652], [-467.5, 1666], [-509, 1700.5]]) assert.ok(aside.at(x, z), `the yard, its tractor, trailer and feed bin (${x}, ${z})`);
  for (const [x, z] of [[-375, 1547], [-372, 1565]]) assert.ok(aside.at(x, z), `a stock tank (${x}, ${z})`);
  for (const [x, z] of farm.scars) assert.ok(aside.at(x, z), `a pasture, where the bales are fed (${x}, ${z})`);
  for (const line of farm.fences) for (const [x, z] of line) assert.ok(aside.at(x, z), `a fence post (${x}, ${z})`);
  for (const [x, z] of farm.lone) assert.ok(aside.at(x, z), `a lone tree (${x}, ${z})`);
  for (const [x, z] of farm.bales) assert.ok(aside.at(x, z), `a bale (${x}, ${z})`);
});

test('nothing breaks online in the cemetery, up to and past its fence', () => {
  for (const [x, z] of CEMETERY.outline) { assert.ok(aside.at(x, z), `its fence (${x}, ${z})`); assert.ok(aside.at(x + 3, z), 'and just outside it'); }
  const [cx, cz] = CEMETERY.outline.reduce(([a, b], [x, z]) => [a + x / CEMETERY.outline.length, b + z / CEMETERY.outline.length], [0, 0]);
  assert.ok(aside.at(cx, cz), 'and among the stones');
});

test('everywhere else breaks as it always has: the bridge, the gas station, and nearly every building in town', () => {
  assert.ok(!aside.at(...BRIDGE), 'Stuckey\'s Bridge');
  assert.ok(!aside.at(BRIDGE[0] + 53, BRIDGE[1] + 10), 'the gas station\'s canopy');
  const spared = buildings.filter((s) => aside.at(s.x, s.z));
  assert.ok(spared.length > 5 && spared.length < 40, `${spared.length} of ${buildings.length} buildings`);
  assert.ok(!aside.at(1000, 400) && !aside.at(-1545, -700) && !aside.at(-500, 1550) && !aside.at(-360, -540), 'and just past each of them');
  // the trailer's in a row, with its neighbours a couple of metres off either side
  const row = buildings.filter((s) => s.use === 'mobile' && s.x > -420 && s.x < -300 && s.z > -610 && s.z < -540);
  assert.equal(row.filter((s) => aside.at(s.x, s.z)).length, 1, 'only the one trailer in its row');
  assert.ok(row.length >= 3);
});

test('the world\'s metres are true metres less where the bridge is', () => {
  for (const [x, z] of [[844.6, 736.2], [-254.5, 200], [BRIDGE[0] + 53, BRIDGE[1] + 10]]) assert.equal(aside.world(x - BRIDGE[0], z - BRIDGE[1]), aside.at(x, z));
});

test('without the farm\'s own data, its yard\'s still set aside, and the rest of it is up to whoever has the data', () => {
  const bare = createAside();
  assert.ok(bare.at(-500, 1680));
  assert.ok(!bare.at(...farm.lone[0]));
});
