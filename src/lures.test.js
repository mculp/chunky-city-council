// What he can throw. How the crowd takes it is in src/horde.test.js, and tools/play-lures.mjs plays it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALARM, GRAVITY, LURES, aimedAt, inHand, kindsHeld, nextUp, rangeOf, throwOf } from './lures.js';
import * as lures from './lures.js';

test('each thing says how near a burnt-down one has to be to look at it, how long it\'s there and how long they look, and how it\'s thrown', () => {
  for (const [k, L] of Object.entries(LURES)) {
    assert.ok(L.name && L.word, k);
    if (k === 'gas') continue;
    assert.ok(L.reach > 0 && L.seconds > 0 && L.look > 0 && L.speed > 0 && L.up > 0, k);
    assert.ok(L.look <= L.seconds, `${k} is looked at while it's there`);
  }
  assert.ok(ALARM.reach > LURES.crackers.reach, 'a car alarm\'s the loudest thing in town');
  assert.ok(ALARM.sounds > 0 && ALARM.sounds < ALARM.seconds, 'but it\'s only heard for the first few of its seconds, which is how long it rouses anyone');
  assert.ok(LURES.bottle.reach < LURES.crackers.reach && LURES.bottle.look < LURES.fluid.look);
});

test('a few seconds is what a bottle gets, firecrackers get as long as they go off and a fire as long as it burns', () => {
  assert.ok(LURES.bottle.look >= 5 && LURES.bottle.look <= 8, 'a bottle');
  assert.equal(LURES.crackers.look, LURES.crackers.seconds);
  assert.equal(LURES.fluid.look, LURES.fluid.seconds);
});

test('and it\'s long enough to walk by one stood at the roadside at full pace, from outside earshot to well past it', () => {
  // the stick's pace, a burnt-down one 3 m off the road, and it can hear him at 14 m. From a dozen metres short of it to a dozen past it is about 24 m of road.
  const walk = 4.4, there = 12, past = 12;
  assert.ok(LURES.bottle.look >= (there + past) / walk, `${LURES.bottle.look} s against ${((there + past) / walk).toFixed(1)}`);
});

test('the phone\'s button has room for the word', () => {
  for (const [k, L] of Object.entries(LURES)) assert.ok(L.word.length <= 8, k);
});

test('what\'s in his hand stays there until it runs out', () => {
  assert.equal(inHand({ gas: 2, bottle: 1 }, 'gas'), 'gas');
  assert.equal(inHand({ gas: 2, bottle: 0 }, 'bottle'), 'gas');
  assert.equal(inHand({}, 'gas'), null);
  assert.equal(inHand({ bottle: 1, gas: 1 }, null), 'bottle');
});

test('a can of beans is supper, not something to throw: it\'s not in his hand, however many he has', () => {
  assert.equal(LURES.can, undefined);
  assert.equal(inHand({ can: 5, gas: 1 }, null), 'gas');
  assert.equal(inHand({ can: 5 }, null), null);
  assert.equal(inHand({ can: 5, gas: 1 }, 'can'), 'gas');
  assert.equal(kindsHeld({ can: 5 }), 0);
  assert.equal(lures.SWARM, undefined, 'and nobody is swarmed by a lure, since there are none');
  assert.equal(lures.whoIsSwarmed, undefined);
});

test('switching goes round what he has', () => {
  const have = { bottle: 1, fluid: 2, gas: 1 };
  assert.equal(nextUp(have, 'bottle'), 'fluid');
  assert.equal(nextUp(have, 'fluid'), 'gas');
  assert.equal(nextUp(have, 'gas'), 'bottle');
  assert.equal(nextUp({ gas: 1 }, 'gas'), 'gas');
  assert.equal(nextUp({}, 'gas'), null);
  assert.equal(kindsHeld(have), 3);
  assert.equal(kindsHeld({ bottle: 0 }), 0);
});

test('a throw goes as far as it should', () => {
  const L = LURES.bottle, free = throwOf(L, 1, 0);
  assert.equal(free.vx, L.speed); assert.equal(free.vz, 0); assert.equal(free.vy, L.up);
  // falling from the hand to the ground
  let y = 1.7, x = 0; for (let t = 0; t < 5 && y > 0; t += 1 / 60) { y += (free.vy - GRAVITY * t) / 60; x += free.vx / 60; }
  assert.ok(x > 18 && x < 23, `a bottle goes ${x} m`);
  assert.ok(Math.abs(rangeOf(L) - x) < 1, `and that's how far it says: ${rangeOf(L)}`);
  const to = throwOf(L, 0, 1, 8, 1);
  assert.equal(to.vx, 0);
  assert.ok(Math.abs(to.vz * to.t - 8) < 1e-9, 'and lands where it was aimed');
  assert.ok(throwOf(L, 1, 0, 100).vx <= L.speed, 'but only as far as it\'ll go');
});

test('it goes to something close to where he\'s facing, and the nearest of them', () => {
  const near = { x: 10, z: 1 }, far = { x: 18, z: 0 }, wide = { x: 5, z: 5 }, behind = { x: -6, z: 0 }, right = { x: 2, z: 0 };
  assert.equal(aimedAt(0, 0, 1, 0, [far, near, wide, behind, right], 21), near);
  assert.equal(aimedAt(0, 0, 1, 0, [wide, behind, right], 21), null);
  assert.equal(aimedAt(0, 0, 1, 0, [far], 15), null, 'not if it can\'t get there');
});
