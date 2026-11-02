import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VOLLEY, makeCourt, makeBall, toCourt, fromCourt, ballInReach, bump, stepBall } from './volley.js';

const court = makeCourt(100, -50, -10), seq = (...n) => { let i = 0; return () => n[i++ % n.length]; };
const fly = (b, seconds = 4) => { let out = null; for (let t = 0; t < seconds; t += 1 / 60) out = stepBall(b, 1 / 60) ?? out; return out; };

test('the court turns both ways', () => {
  const [x, z] = fromCourt(court, 7, -3), [u, v] = toCourt(court, x, z);
  assert.ok(Math.abs(u - 7) < 1e-9 && Math.abs(v + 3) < 1e-9);
});

test("it's on the ground to begin with, and in reach when he's beside it", () => {
  const b = makeBall(court, -4, 0);
  assert.equal(b.air, false);
  assert.ok(ballInReach(b, b.x + 1, b.z));
  assert.ok(!ballInReach(b, b.x + VOLLEY.reach + .1, b.z));
});

test('he can only get to it on the way down', () => {
  const b = makeBall(court, -4, 0);
  assert.equal(bump(b, b.x, b.z, 0, seq(.3, .7)), 1);
  assert.equal(ballInReach(b, b.x, b.z), false);
  assert.equal(bump(b, b.x, b.z, 0, seq(.3, .7)), null);
  assert.equal(b.count, 1);
  while (b.vy > 0) stepBall(b, 1 / 60);
  while (b.y > 2) stepBall(b, 1 / 60);
  assert.ok(ballInReach(b, b.x, b.z));
});

test('it comes down where it says it will', () => {
  const b = makeBall(court, -4, 0);
  bump(b, b.x, b.z, 0, seq(.15, .9));
  const x = b.landX, z = b.landZ;
  while (!stepBall(b, 1 / 240));
  assert.ok(Math.hypot(b.x - x, b.z - z) < .08, `${b.x},${b.z} ${x},${z}`);
});

test('a bump gets further off the longer it goes, never over the net or off the court', () => {
  const R = seq(.1, .9, .4, .2, .8, .55, .33, .71, .05, .99);
  for (const start of [-1, 1]) {
    const b = makeBall(court, start * 4, 0);
    let last = 0;
    for (let i = 0; i < 80; i++) {
      assert.ok(bump(b, b.x, b.z, 0, R));
      const [u, v] = toCourt(court, b.landX, b.landZ);
      assert.ok(Math.sign(u) === start && Math.abs(u) <= court.long / 2 && Math.abs(v) <= court.wide / 2, `${u},${v}`);
      last = Math.min(VOLLEY.most, VOLLEY.wander + VOLLEY.more * (b.count - 1));
      b.x = b.landX; b.z = b.landZ; b.y = 1; b.vy = -1;
    }
    assert.equal(last, VOLLEY.most);
  }
});

test('it counts them in a row until it hits the ground', () => {
  const b = makeBall(court, -4, 0);
  for (let i = 1; i <= VOLLEY.goal; i++) {
    assert.equal(bump(b, b.x, b.z, 0, seq(.25, .5)), i);
    while (!(b.vy < 0 && b.y < 1.2)) stepBall(b, 1 / 60);
  }
  assert.equal(b.best, VOLLEY.goal);
  const out = fly(b);
  assert.equal(b.count, 0);
  assert.equal(b.best, VOLLEY.goal);
  assert.ok(out);
  assert.equal(b.air, false);
});

test('only the first bounce ends the run, and then it settles', () => {
  const b = makeBall(court, -4, 0);
  bump(b, b.x, b.z, 0, seq(.25, .5));
  let first = null;
  while (!(first = stepBall(b, 1 / 60)));
  assert.equal(first.ended, true);
  let later = null;
  while (b.air) later = stepBall(b, 1 / 60) ?? later;
  assert.equal(later.ended, false);
  assert.equal(b.vx, 0);
  assert.equal(b.y, VOLLEY.r);
});

test("it works on a floor that isn't at zero", () => {
  const b = makeBall(court, -4, 0); b.y += 6;
  assert.equal(bump(b, b.x, b.z, 6, seq(.25, .5)), 1);
  let out = null;
  while (!(out = stepBall(b, 1 / 60, 6)));
  assert.equal(b.y, 6 + VOLLEY.r);
});
