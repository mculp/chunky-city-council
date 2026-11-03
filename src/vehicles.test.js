import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, damageFrom, hurtVehicle, inVehicle, makeVehicle, placeVehicles, settle, speedOf, stepVehicle, toLocal } from './vehicles.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} is not ${b}`);
const open = { blocked: () => false, floorAt: () => 6, road: () => true };
const drive = (v, ctl, seconds, world = open, dt = 1 / 30) => { let last; for (let t = 0; t < seconds; t += dt) last = stepVehicle(v, ctl, dt, world); return last; };

test('flat out on the road each kind gets near its own top speed, and no further', () => {
  for (const kind of Object.keys(KINDS)) {
    const v = makeVehicle(kind, 0, 0, 0, 6);
    drive(v, { gas: 1, steer: 0 }, 30);
    assert.ok(v.f > KINDS[kind].top * .9 && v.f <= KINDS[kind].top + .01, `${kind} ${v.f}`);
  }
});

test('they\'re not all the same: speed, pull and weight differ', () => {
  const tops = Object.values(KINDS).map((k) => k.top), weights = Object.values(KINDS).map((k) => k.mass), grips = Object.values(KINDS).map((k) => k.grip);
  assert.equal(new Set(tops).size, 4); assert.equal(new Set(weights).size, 4); assert.equal(new Set(grips).size, 4);
  // a four-wheeler leaves a car standing, then the car catches it
  const q = makeVehicle('quad', 0, 0, 0, 6), c = makeVehicle('car', 0, 0, 0, 6);
  drive(q, { gas: 1, steer: 0 }, 1); drive(c, { gas: 1, steer: 0 }, 1); assert.ok(q.f > c.f);
  drive(q, { gas: 1, steer: 0 }, 19); drive(c, { gas: 1, steer: 0 }, 19); assert.ok(c.f > q.f);
});

test('it goes the way it\'s pointing', () => {
  const v = makeVehicle('car', 0, 0, 0, 6); drive(v, { gas: 1, steer: 0 }, 2);
  assert.ok(v.z > 5); near(v.x, 0, 1e-3);
  const w = makeVehicle('car', 0, 0, Math.PI / 2, 6); drive(w, { gas: 1, steer: 0 }, 2);
  assert.ok(w.x > 5); near(w.z, 0, 1e-3);
});

test('steering right turns it to the driver\'s right', () => {
  const v = makeVehicle('car', 0, 0, 0, 6);   // facing south, so the driver's right is west
  drive(v, { gas: 1, steer: 0 }, 1); drive(v, { gas: 1, steer: 1 }, 1);
  assert.ok(v.yaw < 0); assert.ok(v.x < 0);
});

test('it doesn\'t steer standing still', () => {
  const v = makeVehicle('car', 0, 0, 1, 6); drive(v, { gas: 0, steer: 1 }, 2);
  near(v.yaw, 1);
});

test('brakes stop it far quicker than coasting does, and reverse goes backwards at its own speed', () => {
  const a = makeVehicle('car', 0, 0, 0, 6), b = makeVehicle('car', 0, 0, 0, 6);
  drive(a, { gas: 1, steer: 0 }, 8); drive(b, { gas: 1, steer: 0 }, 8);
  drive(a, { gas: -1, steer: 0 }, 1); drive(b, { gas: 0, steer: 0 }, 1);
  assert.ok(a.f < b.f - 10);
  drive(a, { gas: -1, steer: 0 }, 12);
  assert.ok(a.f < -KINDS.car.reverse * .9 && a.f >= -KINDS.car.reverse - .01);
});

test('flat out it takes a wide corner, and slowed down it takes a tight one', () => {
  const rate = (f) => { const v = makeVehicle('car', 0, 0, 0, 6); v.f = f; for (let t = 0; t < .5; t += 1 / 60) { v.f = f; stepVehicle(v, { gas: 0, steer: 1 }, 1 / 60, open); } return Math.abs(v.yaw) / .5; };
  assert.ok(rate(30) < .6, `at 30 m/s ${rate(30)} rad/s`);
  assert.ok(rate(10) > rate(30) * 1.5, `at 10 m/s ${rate(10)} rad/s`);
  for (const kind of Object.keys(KINDS)) assert.ok(KINDS[kind].corner > 5);
});

test('the brake beats the gas', () => {
  const v = makeVehicle('car', 0, 0, 0, 6); drive(v, { gas: 1, steer: 0 }, 6); const was = v.f;
  drive(v, { gas: 1, steer: 0, brake: true }, 1);
  assert.ok(v.f < was - 10);
});

test('the handbrake lets it slide', () => {
  const run = (brake) => { const v = makeVehicle('car', 0, 0, 0, 6); drive(v, { gas: 1, steer: 0 }, 6); drive(v, { gas: 0, steer: 1, brake }, .6); return Math.abs(v.s); };
  assert.ok(run(true) > run(false) * 1.5);
});

test('off the road a car crawls and a four-wheeler barely notices', () => {
  const rough = { ...open, road: () => false };
  for (const [kind, least, most] of [['car', .45, .55], ['quad', .88, .96]]) {
    const v = makeVehicle(kind, 0, 0, 0, 6); drive(v, { gas: 1, steer: 0 }, 30, rough);
    const k = v.f / KINDS[kind].top; assert.ok(k > least && k <= most, `${kind} ${k}`);
  }
});

test('it stops at a wall however fast it\'s going, and takes damage by how hard', () => {
  const wall = { ...open, blocked: (x, z) => z > 60 };
  const v = makeVehicle('car', 0, 0, 0, 6);
  let hit = 0; for (let t = 0; t < 8 && !hit; t += 1 / 30) hit = stepVehicle(v, { gas: 1, steer: 0 }, 1 / 30, wall).hit;
  assert.ok(hit > 5); assert.ok(v.z < 60); assert.ok(v.hp < KINDS.car.hp);
  assert.ok(v.f <= 0, 'it comes back off it');
});

test('a thin wall doesn\'t get skipped at top speed', () => {
  const thin = { ...open, blocked: (x, z) => z > 100 && z < 100.3 };
  const v = makeVehicle('car', 0, 0, 0, 6); v.f = 30;
  for (let t = 0; t < 8; t += 1 / 20) stepVehicle(v, { gas: 1, steer: 0 }, 1 / 20, thin);
  assert.ok(v.z < 100);
});

test('a post can\'t get between the points round its edge, head on or down its side', () => {
  const post = (px, pz) => ({ ...open, blocked: (x, z) => Math.hypot(x - px, z - pz) < .5 });
  for (const kind of Object.keys(KINDS)) for (const off of [-.8, -.4, 0, .4, .8]) {
    const v = makeVehicle(kind, 0, 0, 0, 6); v.f = 6; drive(v, { gas: 0, steer: 0 }, 3, post(off * KINDS[kind].width / 2, 12));
    assert.ok(v.z + KINDS[kind].length / 2 < 12, `${kind} ${off}: ${v.z}`);
  }
  // sliding sideways into one, halfway along it
  const v = makeVehicle('car', 0, 0, 0, 6); v.s = 4; drive(v, { gas: 0, steer: 0 }, .6, post(-3, 0));
  assert.ok(v.x > -3 + KINDS.car.width / 2 - .1, `${v.x}`);
});

test('a glancing hit slides along the wall and keeps most of its speed', () => {
  const wall = { ...open, blocked: (x, z) => x > 2 };
  const v = makeVehicle('car', 0, 0, .35, 6); v.f = 20;
  let got = 0; for (let t = 0; t < 2; t += 1 / 30) got = Math.max(got, stepVehicle(v, { gas: 1, steer: 0 }, 1 / 30, wall).hit);
  assert.ok(got > 0); assert.ok(v.z > 25); assert.ok(v.x < 2);
});

test('heavier takes it better, and a small bump does nothing', () => {
  assert.equal(damageFrom(KINDS.car, 4), 0);
  assert.ok(damageFrom(KINDS.quad, 15) > damageFrom(KINDS.car, 15));
  assert.ok(damageFrom(KINDS.car, 15) > damageFrom(KINDS.pickup, 15));
});

test('enough crashes wreck it, and a wreck doesn\'t drive', () => {
  const wall = { ...open, blocked: (x, z) => z > 40 };
  const v = makeVehicle('quad', 0, 0, 0, 6); v.f = 18;
  let wrecked = false;
  for (let i = 0; i < 6 && !wrecked; i++) { v.f = 18; for (let t = 0; t < 3 && !wrecked; t += 1 / 30) wrecked = stepVehicle(v, { gas: 1, steer: 0 }, 1 / 30, wall).wrecked; v.z = 0; }
  assert.ok(wrecked); assert.ok(v.wrecked); assert.equal(v.hp, 0);
  const z = v.z; v.f = 0; drive(v, { gas: 1, steer: 1 }, 1, wall); near(v.z, z, 1e-6);
});

test('in deep water the engine dies and it stops', () => {
  const river = { ...open, floorAt: () => -2 };
  const v = makeVehicle('car', 0, 0, 0, 0); v.f = 12; drive(v, { gas: 1, steer: 0 }, 3, river);
  assert.ok(v.drowned); assert.ok(speedOf(v) < 1);
});

test('off the edge it falls, and lands', () => {
  const edge = { ...open, floorAt: (x, z) => (z > 10 ? 2 : 6) };
  const v = makeVehicle('car', 0, 0, 0, 6); v.f = 15;
  let landed = 0, airborne = false;
  for (let t = 0; t < 3; t += 1 / 30) { const r = stepVehicle(v, { gas: 0, steer: 0 }, 1 / 30, edge); airborne ||= !v.grounded; landed = Math.max(landed, r.landed); }
  assert.ok(airborne); assert.ok(landed > 5); near(v.y, 2, .1);
});

test('the edge of the map holds it back without hurting it', () => {
  const v = makeVehicle('car', 0, 0, 0, 6); v.f = 25;
  const world = { ...open, edge: (x, z) => z > 30 };
  drive(v, { gas: 1, steer: 0 }, 3, world);
  assert.ok(v.z < 30); assert.equal(v.hp, KINDS.car.hp);
});

test('it tilts to the ground under it: nose up on the way up a slope, and leaning away from the high side', () => {
  const up = makeVehicle('car', 0, 0, 0, 6); settle(up, (x, z) => 6 + z * .2); assert.ok(up.pitch < -.1);
  const side = makeVehicle('car', 0, 0, 0, 6); settle(side, (x) => 6 + x * .2); assert.ok(side.roll > .1);   // +x is the driver's left, so the left's high
});

test('a hit from outside can finish it, once', () => {
  const v = makeVehicle('golf', 0, 0, 0); assert.equal(hurtVehicle(v, 10), false); assert.equal(hurtVehicle(v, 100), true); assert.equal(hurtVehicle(v, 100), false);
});

test('inside and outside it, by its own shape and way round', () => {
  const v = makeVehicle('car', 10, 10, Math.PI / 2);   // nose east
  const [along, across] = toLocal(v, 12, 10); near(along, 2); near(across, 0);
  assert.ok(inVehicle(v, 12, 10)); assert.ok(!inVehicle(v, 10, 12)); assert.ok(inVehicle(v, 10, 11)); assert.ok(inVehicle(v, 10, 11.3, .3)); assert.ok(!inVehicle(v, 10, 11.3));
});

// a house, 30 m north of a road running along z = 0
const house = (id, use, x) => ({ id, use, wx: x, wz: -30, pts: [[x - 5, -35], [x + 5, -35], [x + 5, -25], [x - 5, -25]] });
const roadSide = { hash: () => 0, road: (x) => ({ x, z: 0 }), free: () => true };

test('they\'re parked between a building and its road, nose to the building', () => {
  const [p] = placeVehicles([house(1, 'house', 0)], roadSide);
  assert.ok(p); assert.ok(p.z > -25 && p.z < 0, `${p.z}`);
  near(Math.abs(p.yaw), Math.PI, 1e-6);   // facing north
});

test('what\'s where: golf carts at churches, four-wheelers by trailers, pickups and cars at houses', () => {
  const kinds = (use) => placeVehicles([house(1, use, 0)], roadSide).map((p) => p.kind);
  assert.deepEqual(kinds('church'), ['golf']); assert.deepEqual(kinds('mobile'), ['quad']); assert.deepEqual(kinds('house'), ['pickup']); assert.deepEqual(kinds('shed'), []);
});

test('not every house has one, and the same house always does or doesn\'t', () => {
  const hash = (id, n) => ((id * 2654435761 + n * 40503) % 1000) / 1000, many = Array.from({ length: 200 }, (_, i) => house(i + 1, 'house', i * 40));
  const a = placeVehicles(many, { ...roadSide, hash }), b = placeVehicles(many, { ...roadSide, hash });
  assert.ok(a.length > 10 && a.length < 100, `${a.length}`); assert.deepEqual(a, b);
});

test('nothing\'s parked on top of anything else', () => {
  const a = placeVehicles([house(1, 'house', 0), house(2, 'house', 1), house(3, 'house', 2)], roadSide);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < i; j++) assert.ok(Math.hypot(a[i].x - a[j].x, a[i].z - a[j].z) >= 7);
  assert.deepEqual(placeVehicles([house(1, 'house', 0)], { ...roadSide, free: () => false }), []);
});

test('a building right on the road has it round the side', () => {
  const tight = { ...house(1, 'house', 0), wz: -7, pts: [[-5, -12], [5, -12], [5, -2], [-5, -2]] };
  const [p] = placeVehicles([tight], roadSide);
  assert.ok(Math.abs(p.x) > 5, `${p.x}`);
});

test('a building with no road near it still has one', () => {
  assert.equal(placeVehicles([house(1, 'house', 0)], { ...roadSide, road: () => null }).length, 1);
});

test('a church that can\'t have its cart out front has it round the side', () => {
  const [p] = placeVehicles([house(1, 'church', 0)], { ...roadSide, free: (kind, x, z) => z < -25 || Math.abs(x) > 5 });
  assert.equal(p.kind, 'golf');
});
