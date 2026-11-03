// The light on Stuckey's Bridge. docs/lore.md has what it's from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIGHT, lightAt, makeLight, stepLight } from './light.js';

const DECK = 6.36, on = { can: true, deck: DECK };
const run = (l, he, seconds, opts = on) => { for (let t = 0; t < seconds; t += 1 / 30) stepLight(l, he, 1 / 30, opts); return l; };

test('it isn\'t there until he\'s come back to the bridge', () => {
  const l = makeLight();
  assert.equal(run(l, { x: 200, y: 6.2, z: 0 }, 5).state, 'waiting');
  assert.equal(l.shown, 0);
});

test('and not while it\'s not a time it could be, which is what keeps it out of the opening', () => {
  const l = makeLight();
  assert.equal(run(l, { x: 10, y: 6.2, z: 0 }, 5, { can: false, deck: DECK }).state, 'waiting');
});

test('it starts on the far side of the bridge from him, and hangs there a while', () => {
  for (const [x, side] of [[40, -1], [-40, 1]]) {
    const l = makeLight(), he = { x, y: 6.2, z: 0 };
    run(l, he, 1);
    assert.equal(l.state, 'out');
    assert.equal(l.x, side * LIGHT.end);
    assert.ok(l.shown > 0 && l.shown < 1);
    run(l, he, LIGHT.wait - 1.5);
    assert.equal(l.x, side * LIGHT.end);
    assert.ok(!l.hush);
  }
});

test('it comes to him, goes through him and carries on out the other way', () => {
  const l = makeLight(), he = { x: 30, y: 6.2, z: 0 };
  run(l, he, LIGHT.wait + 1);
  assert.equal(l.state, 'coming');
  run(l, he, (30 + LIGHT.end) / LIGHT.speed);
  assert.ok(l.through);
  assert.ok(l.closest < LIGHT.through + .2);
  assert.equal(l.state, 'past');
  run(l, he, 5);
  assert.ok(l.x > he.x + 10, `it's at ${l.x}`);
  assert.equal(l.ux > 0, true);
});

test('it gets him wherever he goes, if he stays in reach of it', () => {
  const l = makeLight(), he = { x: 30, y: 6.2, z: 0 };
  run(l, he, LIGHT.wait + 2);
  he.x = 50; he.z = 25;
  run(l, he, 40);
  assert.ok(l.through);
});

test('it goes out a long way past him, and doesn\'t come again until he\'s been away', () => {
  const l = makeLight(), he = { x: 30, y: 6.2, z: 0 };
  run(l, he, LIGHT.wait + (30 + LIGHT.end) / LIGHT.speed + 1);
  run(l, he, (LIGHT.past - LIGHT.fade / 2) / LIGHT.speed);
  assert.ok(l.shown > 0 && l.shown < 1, `${l.shown}`);
  run(l, he, LIGHT.fade / LIGHT.speed);
  assert.equal(l.state, 'gone');
  assert.equal(l.shown, 0);
  run(l, he, 30);
  assert.equal(l.state, 'gone');
  run(l, { x: LIGHT.again + 1, y: 6.2, z: 0 }, .1);
  assert.equal(l.state, 'waiting');
  run(l, he, .5);
  assert.equal(l.state, 'out');
});

test('it doesn\'t follow him if he gets far enough away', () => {
  const l = makeLight(), he = { x: 30, y: 6.2, z: 0 };
  run(l, he, LIGHT.wait + 1);
  he.x = 250;
  run(l, he, .1);
  assert.equal(l.state, 'gone');
  assert.ok(!l.hush);
});

test('nothing can be heard while it\'s close, and it comes back after', () => {
  const l = makeLight(), he = { x: 45, y: 6.2, z: 0 };
  run(l, he, LIGHT.wait - 1);
  assert.ok(!l.hush);
  let quiet = false;
  for (let t = 0; t < 60 && l.state !== 'gone'; t += 1 / 30) { stepLight(l, he, 1 / 30, on); if (l.through) quiet = quiet || l.hush; }
  assert.ok(quiet);
  assert.ok(!l.hush);
});

test('it swings across the way it\'s going, and less with reduced motion', () => {
  const l = makeLight(), he = { x: 30, y: 6.2, z: 0 };
  run(l, he, 1);
  const quarter = LIGHT.period / 4, [x, y, z] = lightAt(l, quarter), [xs, , zs] = lightAt(l, quarter, true);
  assert.equal(x, l.x);
  assert.ok(Math.abs(z - l.z) > .5, `${z}`);
  assert.ok(Math.abs(zs - l.z) < Math.abs(z - l.z) / 2);
  assert.ok(y > l.y, 'it comes up at the ends of the swing, like anything hanging');
  assert.deepEqual(lightAt(l, 0), [l.x, l.y, l.z]);
  assert.equal(xs, l.x);
});
