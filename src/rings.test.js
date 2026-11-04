import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { RING, TRIP, tripAt, tripSwap, tripLong, settle, ringAt, pickRing } from './rings.js';

const RINGS = JSON.parse(readFileSync(new URL('../data/rings.json', import.meta.url), 'utf8'));
const ROADS = JSON.parse(readFileSync(new URL('../data/roads.json', import.meta.url), 'utf8'));

test('the sheet is ten rings, each with where it is and about where, in true metres', () => {
  assert.equal(RINGS.version, 1);
  assert.equal(RINGS.rings.length, 10);
  for (const r of RINGS.rings) {
    assert.deepEqual(Object.keys(r).sort(), ['about', 'at']);
    assert.ok(typeof r.at === 'string' && r.at.length > 5);
    assert.ok(r.about.length === 2 && r.about.every(Number.isFinite));
  }
});

test('they\'re spread out, and none is near Stuckey\'s Bridge, where nothing new goes', () => {
  const bridge = ROADS.reference.crossings.find((c) => c.road === ROADS.opening.road && c.with === 'river');
  const [a, b] = [RINGS.rings.map((r) => r.about), RINGS.rings.map((r) => r.about)];
  for (const [x, z] of a) assert.ok(Math.hypot(x - bridge.x, z - bridge.z) > 1400, `${x}, ${z} is ${Math.round(Math.hypot(x - bridge.x, z - bridge.z))} m from the bridge`);
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < b.length; j++) assert.ok(Math.hypot(a[i][0] - b[j][0], a[i][1] - b[j][1]) > 2000, `${i} and ${j} are close`);
});

test('a trip: he sits as the world bends, is somewhere else at the height of it, and comes to sitting up as it goes', () => {
  const at = tripSwap(), end = tripLong();
  assert.ok(end > 3 && end < 4, `about three seconds: ${end}`);
  assert.equal(tripAt(0).part, 'going'); assert.equal(tripAt(0).down, 0); assert.equal(tripAt(0).heat, 0);
  const sat = tripAt(TRIP.sit);
  assert.equal(sat.down, 1, 'sat down'); assert.ok(sat.heat > 0 && sat.heat < 1);
  assert.equal(tripAt(at - .01).part, 'going'); assert.ok(tripAt(at - .01).heat > .99, 'as bent as it gets');
  const come = tripAt(at + .01);
  assert.equal(come.part, 'coming'); assert.equal(come.down, 1, 'sitting where he comes to'); assert.ok(come.heat > .99);
  assert.ok(tripAt(at + TRIP.come * .7).down < 1 && tripAt(at + TRIP.come * .7).down > 0, 'getting up');
  assert.deepEqual(tripAt(end), { part: 'up', down: 0, heat: 0, fade: 1 });
  for (let t = 0; t < end; t += .05) assert.equal(tripAt(t).fade, 1, 'the picture never fades without reduced motion');
});

test('with reduced motion it\'s a fade to dark and back, quicker, with nothing bent', () => {
  const at = tripSwap(true), end = tripLong(true);
  assert.ok(end < tripLong() && end > .8);
  for (let t = 0; t < end; t += .02) assert.equal(tripAt(t, true).heat, 0);
  assert.equal(tripAt(0, true).fade, 1);
  assert.ok(tripAt(at - .01, true).fade < .02, 'dark when he goes');
  assert.ok(tripAt(at + .01, true).fade < .05 && tripAt(at + TRIP.still.come * .6, true).fade === 1, 'and back');
});

test('a ring settles where it\'s asked if it can, and otherwise at the nearest spot that will do, the same every time', () => {
  assert.deepEqual(settle([10, 20], () => true), [10, 20]);
  // nothing within 6 m of a road along z = 0
  const ok = (x, z) => Math.abs(z) > 6;
  const s = settle([3, 0], ok);
  assert.ok(Math.abs(s[1]) > 6 && Math.hypot(s[0] - 3, s[1]) < 6 + .75 + .01, `just off it, within a step of as near as it can be: ${s}`);
  assert.deepEqual(settle([3, 0], ok), s);
  assert.equal(settle([0, 0], () => false, { far: 5 }), null);
});

test('which ring he\'s in, and which one a tap on the map is for', () => {
  const rings = [{ x: 0, z: 0 }, { x: 100, z: 0 }];
  assert.equal(ringAt(rings, .5, .5), 0); assert.equal(ringAt(rings, 100, RING.reach - .01), 1); assert.equal(ringAt(rings, 50, 0), -1);
  const spots = [[10, 10], [60, 10], [62, 40]];
  assert.equal(pickRing(spots, 12, 14), 0); assert.equal(pickRing(spots, 61, 30), 2); assert.equal(pickRing(spots, 200, 200), -1);
});
