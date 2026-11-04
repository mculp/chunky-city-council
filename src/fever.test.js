// When a try ends: the fever of whatever got him, the dark, and coming to. CHUNKY-142 has what it's for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAUSES, FEVER, feverAt, feverLong, wakesAt } from './fever.js';

test('it\'s about five seconds from the hit to playing again, and quicker held still', () => {
  assert.ok(Math.abs(feverLong() - 5) < .01, feverLong());
  assert.ok(feverLong(true) < feverLong() * .75, feverLong(true));
  assert.equal(feverAt(feverLong()).part, 'up');
  assert.equal(feverAt(feverLong(true), true).part, 'up');
});

test('the fever comes up hot and stays hot, then it goes black, then he comes to', () => {
  const at = (t) => feverAt(t);
  assert.equal(at(0).part, 'fever'); assert.equal(at(0).heat, FEVER.from); assert.equal(at(0).fade, 1);
  assert.equal(at(FEVER.up).heat, FEVER.to);
  assert.equal(at(FEVER.scene - FEVER.out - .01).fade, 1);
  assert.ok(at(FEVER.scene - .01).fade < .01);
  assert.equal(at(FEVER.scene).part, 'dark'); assert.equal(at(FEVER.scene).fade, 0);
  assert.equal(at(wakesAt()).part, 'waking'); assert.equal(at(wakesAt()).fade, 0); assert.equal(at(wakesAt()).heat, 0);
  assert.equal(at(wakesAt() + FEVER.back).fade, 1);
  for (let t = 0; t < FEVER.scene - FEVER.out; t += .05) assert.ok(at(t).fade === 1 && at(t).heat >= FEVER.from, t);
});

test('a tap skips to the moment he starts to come to', () => {
  assert.equal(wakesAt(), FEVER.scene + FEVER.dark);
  assert.equal(feverAt(wakesAt()).part, 'waking');
  assert.equal(feverAt(wakesAt(true), true).part, 'waking');
});

test('everything that ends a try has a name the page knows it by', () => {
  assert.deepEqual(CAUSES, ['crowd', 'train', 'snake', 'river', 'blast', 'fire', 'hit', 'wreck']);
});
