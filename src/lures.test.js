// What he can throw. How the crowd takes it is in src/horde.test.js, and tools/play-lures.mjs plays it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALARM, GRAVITY, LURES, SWARM, aimedAt, inHand, kindsHeld, nextUp, rangeOf, throwOf, whoIsSwarmed } from './lures.js';

test('each lure says how far off it\'s heard and for how long, and how it\'s thrown', () => {
  for (const [k, L] of Object.entries(LURES)) {
    assert.ok(L.name && L.word, k);
    if (k === 'gas') continue;
    assert.ok(L.reach > 0 && L.seconds > 0 && L.speed > 0 && L.up > 0, k);
  }
  assert.ok(ALARM.reach > LURES.crackers.reach, 'a car alarm\'s the loudest thing in town');
  assert.ok(LURES.bottle.reach < LURES.crackers.reach && LURES.bottle.seconds < LURES.crackers.seconds);
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

test('he\'d throw his beans last', () => {
  assert.equal(inHand({ can: 5, gas: 1 }, null), 'gas');
  assert.equal(inHand({ can: 5 }, null), 'can');
});

test('switching goes round what he has', () => {
  const have = { bottle: 1, fluid: 2, can: 1 };
  assert.equal(nextUp(have, 'bottle'), 'fluid');
  assert.equal(nextUp(have, 'fluid'), 'can');
  assert.equal(nextUp(have, 'can'), 'bottle');
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

test('someone\'s only swarmed if it came down near them and the crowd\'s around them now', () => {
  const coop = { id: 'coop', x: 0, z: 0 }, rocky = { id: 'rocky', x: 200, z: 0 }, crowd = [...Array(SWARM.count)].map((_, i) => ({ x: i, z: 1 }));
  const spot = { x: 5, z: 5 };
  assert.deepEqual(whoIsSwarmed([spot], [coop, rocky], crowd), ['coop']);
  assert.deepEqual(whoIsSwarmed([], [coop], crowd), [], 'nothing thrown');
  assert.deepEqual(whoIsSwarmed([{ x: 100, z: 0 }], [coop], crowd), [], 'thrown somewhere else');
  assert.deepEqual(whoIsSwarmed([spot], [coop], crowd.slice(1)), [], 'not enough of them');
});
