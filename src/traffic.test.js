// Other drivers and the kids on four-wheelers, on a made-up bit of road.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createTraffic, TRAFFIC } from './traffic.js';

// A road along x from -1000 to 1000 far from the bridge, another crossing it, and a dirt lane going off it with another on from that
const OFF = 5000;
const road = (id, pts, width = 7.3, surface = 'asphalt', nodes = []) => { const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { id, pts, s, length: s.at(-1), width, surface, nodes }; };
const main = road('main', [[OFF - 1000, 0], [OFF + 1000, 0]], 7.3, 'asphalt', ['a', 'b', 'c']), cross = road('cross', [[OFF, -1000], [OFF, 1000]], 6.6, 'asphalt', ['d', 'b', 'e']);
const lane = road('lane', [[OFF + 300, 0], [OFF + 300, 300]], 3, 'dirt'), lane2 = road('lane2', [[OFF + 300, 300], [OFF + 700, 300]], 3, 'dirt');
const nodes = [{ id: 'a', x: OFF - 1000, z: 0, roads: ['main'] }, { id: 'b', x: OFF, z: 0, roads: ['main', 'cross'] }, { id: 'c', x: OFF + 1000, z: 0, roads: ['main'] }, { id: 'd', x: OFF, z: -1000, roads: ['cross'] }, { id: 'e', x: OFF, z: 1000, roads: ['cross'] }];
const all = new Map([main, cross, lane, lane2].map((r) => [r.id, r]));
function along(id, s) {
  const r = all.get(id), a = r.pts[0], b = r.pts[1], l = r.length, t = Math.max(0, Math.min(1, s / l));
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / l, tz: (b[1] - a[1]) / l, nx: -(b[1] - a[1]) / l, nz: (b[0] - a[0]) / l };
}
const sOn = (id, x, z) => { const r = all.get(id), a = r.pts[0], b = r.pts[1], l = r.length; return Math.max(0, Math.min(l, ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / l)); };
const K = (kind) => ({ width: kind === 'quad' ? 1.6 : 2.3, length: kind === 'quad' ? 2.6 : 5, accel: 7, brake: 15, wheelbase: 3, lock: .5, wheel: .4, hp: 100 });

function setUp({ things = [], crowd = [], tuning = {}, grudge = false, seed0 = 1 } = {}) {
  let seed = seed0, n = 0;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647, removed = [], outs = [], added = [];
  const world = {
    roads: [main, cross], nodes, lanes: [lane, lane2], along, sOn, rand, half: (r) => r.width / 2,
    blocked: (x, z) => things.some((t) => Math.hypot(x - t[0], z - t[1]) < (t[2] ?? 1.5)),
    floorAt: () => 0, someoneAt: (x, z, r) => crowd.some((s) => Math.hypot(x - s[0], z - s[1]) < r),
    add: (kind, x, z, yaw, who) => { const v = { kind, K: K(kind), x, z, y: 0, yaw, f: 0, spin: 0, steer: 0, hp: 100, who }; added.push(v); return v; },
    remove: (v) => removed.push(v), person: () => ({ id: n++, temper: .5, nerve: .5 }), out: (c, why) => outs.push([c, why]), mood: () => grudge,
    laneAt: (x, z, not) => [lane, lane2].find((l) => l !== not && (Math.hypot(l.pts[0][0] - x, l.pts[0][1] - z) < 3 || Math.hypot(l.pts[1][0] - x, l.pts[1][1] - z) < 3)) ?? null,
    laneNear: () => lane,
    roadNear: (x, z) => (Math.abs(z) < Math.abs(x - OFF) ? main : cross),
  };
  const t = createTraffic(world, { cars: 0, riders: 0, gone: 1e6, from: [0, 300], ...tuning });
  return { t, world, removed, outs, added };
}
const run = (t, p, seconds, dt = 1 / 30, each) => { for (let u = 0; u < seconds; u += dt) { t.update(dt, p); each?.(); } };
const him = (x, z = 0, extra = {}) => ({ x: OFF + x, z, y: 0, driving: false, ...extra });
// Sets one going along main from x, eastward
function aCar(t, world, x = 0, p = him(x + 200)) {
  t.T.cars = 1;
  const near = { x: OFF, z: 0, y: 0, driving: false };
  for (let i = 0; i < 400 && !t.cars.length; i++) t.update(1 / 30, near);
  const c = t.cars[0]; t.T.cars = 1;
  c.road = main; c.s = sOn('main', OFF + x, 0); c.dir = 1; c.v.x = OFF + x; c.v.z = 2; c.v.yaw = Math.PI / 2; c.v.f = 11; c.pace = 1; c.who.temper = .5; c.plan = null;
  return c;
}

describe('someone driving', () => {
  test('they come along in time, a long way off and on their way to him', () => {
    const { t } = setUp({ tuning: { cars: 3, gone: 300, from: TRAFFIC.from } }), p = him(100, 20);
    let most = 0; run(t, p, 60, 1 / 30, () => { most = Math.max(most, t.cars.length); });
    assert.ok(most >= 2, `${most}`);
  });

  test('they start out of sight', () => {
    const { t, added } = setUp({ tuning: { cars: 3, from: TRAFFIC.from } }), p = him(100, 20);
    run(t, p, .1); assert.equal(t.cars.length, 1);
    assert.ok(Math.hypot(added[0].x - p.x, added[0].z - p.z) > 140);
  });

  test('they\'re on their way towards him', () => {
    for (const seed0 of [3, 5, 7, 9]) {
      const { t } = setUp({ seed0, tuning: { cars: 1, from: TRAFFIC.from } }), p = him(40);
      for (let i = 0; i < 400 && !t.cars.length; i++) t.update(1 / 30, p);
      const c = t.cars[0];
      assert.ok(Math.sign(sOn(c.road.id, p.x, p.z) - c.s) === c.dir);
    }
  });

  test('they stay on their own side of the road', () => {
    const { t, world } = setUp(), c = aCar(t, world);
    run(t, him(5000), 5);
    assert.ok(c.v.x > OFF + 20); assert.ok(c.v.z > .8 && c.v.z < 3.65 - 1, `${c.v.z}`);
    assert.ok(Math.abs(Math.sin(c.v.yaw) - 1) < .01);
    c.dir = -1; c.want = 0; run(t, him(5000), 5);
    assert.ok(c.v.z < -.8 && c.v.z > -3.65 + 1, `the other way it's the other side: ${c.v.z}`);
  });

  test('a driver goes the speed limit, more or less', () => {
    const { t, world } = setUp(), c = aCar(t, world);
    run(t, him(5000), 10);
    assert.ok(c.v.f > 12 && c.v.f < 17, `${c.v.f}`);
  });

  test('they stop for him and don\'t touch him', () => {
    const { t, world } = setUp({ tuning: { patience: [999, 999] } }), c = aCar(t, world), p = him(60, 2);
    let closest = Infinity;
    run(t, p, 12, 1 / 30, () => { closest = Math.min(closest, Math.hypot(c.v.x - p.x, c.v.z - p.z)); });
    assert.ok(c.v.f < .1, `${c.v.f}`); assert.ok(closest > 3, `${closest}`); assert.ok(c.v.x < p.x);
  });

  test('they stop for someone in the road, and for something in it', () => {
    let s = setUp({ crowd: [[OFF + 60, 2]], tuning: { patience: [999, 999] } }), c = aCar(s.t, s.world);
    run(s.t, him(5000), 12); assert.ok(c.v.f < .1); assert.ok(c.v.x < OFF + 60);
    s = setUp({ things: [[OFF + 60, 2]], tuning: { patience: [999, 999] } }); c = aCar(s.t, s.world);
    run(s.t, him(5000), 12); assert.ok(c.v.f < .1); assert.ok(c.v.x < OFF + 60);
  });

  test('they go round him after a bit and get back on their own side', () => {
    const { t, world } = setUp(), c = aCar(t, world), p = him(60, 2);
    let closest = Infinity, crossed = false;
    run(t, p, 45, 1 / 30, () => { closest = Math.min(closest, Math.hypot(c.v.x - p.x, c.v.z - p.z)); if (c.v.z < 0) crossed = true; });
    assert.ok(crossed, 'over to the other side'); assert.ok(c.v.x > p.x + 10, `past him ${c.v.x - p.x}`); assert.ok(c.v.z > .8, `and back ${c.v.z}`); assert.ok(closest > 2.2, `${closest}`);
  });

  test('they don\'t go round with someone coming the other way', () => {
    const { t, world } = setUp({ tuning: { giveUp: 999 } }), c = aCar(t, world), p = him(60, 2);
    t.T.cars = 2; for (let i = 0; i < 4000 && t.cars.length < 2; i++) t.update(1 / 30, { x: OFF, z: 0, y: 0, driving: false });
    c.road = main; c.s = sOn('main', OFF, 0); c.dir = 1; c.v.x = OFF; c.v.z = 2; c.v.f = 0; c.plan = null;
    const o = t.cars[1]; o.road = main; o.s = c.s + 30; o.dir = -1; o.v.f = 0; o.v.x = OFF + 30; o.v.z = -2; o.want = -2;
    c.ahead = 30; c.what = 'him';
    // the other one's held there by a person
    const pp = { ...p }; o.next = 1e9; o.ahead = 0; o.what = 'him';
    for (let i = 0; i < 300; i++) t.update(1 / 30, pp);
    assert.equal(c.passUntil, null);
  });

  test('with no way round they turn back', () => {
    const { t, world } = setUp({ things: [[OFF + 60, 2], [OFF + 60, -2]], tuning: { giveUp: 2 } }), c = aCar(t, world);
    run(t, him(5000), 25);
    assert.equal(c.dir, -1); assert.ok(c.v.x < OFF + 55);
  });

  test('someone with a grudge doesn\'t stop for him', () => {
    const { t, world } = setUp({ grudge: true }), c = aCar(t, world), p = him(60, 2);
    run(t, p, 12);
    assert.ok(c.v.x > p.x);
  });

  test('they turn at a junction, slowly, and carry on along the other road on its own right', () => {
    let turned = 0;
    for (let seed0 = 1; seed0 < 12 && !turned; seed0++) {
      const { t, world } = setUp({ seed0 }), c = aCar(t, world, -60), p = him(5000);
      c.plan = undefined;
      let at = Infinity;
      run(t, p, 16, 1 / 30, () => { if (c.road === cross && at === Infinity) at = c.v.f; });
      if (c.road === cross) {
        turned++;
        assert.ok(at <= 8, `${at}`);
        assert.ok(Math.abs(c.v.z) > 20);
        const rightOfTravel = -c.v.z * 0 + (c.v.x - OFF) * (c.dir > 0 ? -1 : 1);
        assert.ok(rightOfTravel > .5, `${c.v.x - OFF} going ${c.dir}`);
      }
    }
    assert.ok(turned);
  });

  test('at the end of the road they come back', () => {
    const { t, world } = setUp(), c = aCar(t, world, 980, him(5000));
    run(t, him(5000), 14);
    assert.equal(c.dir, -1); assert.ok(c.v.x < OFF + 1000);
  });

  test('nobody comes within reach of Stuckey\'s Bridge', () => {
    const near = road('near', [[-1000, 0], [1000, 0]]); all.set('near', near);
    const nodes0 = [];
    const world = { ...setUp().world, roads: [near], nodes: nodes0, roadNear: () => near };
    const t = createTraffic(world, { cars: 1, riders: 0, gone: 1e6, from: [0, 1e6] });
    const p = { x: 1e4, z: 0, y: 0, driving: false };
    let closest = Infinity;
    const here = { ...p, x: 0, z: 0 };
    for (let i = 0; i < 3000; i++) { t.update(1 / 15, here); for (const c of t.cars) closest = Math.min(closest, Math.hypot(c.v.x, c.v.z)); }
    assert.ok(closest > TRAFFIC.noGo - 40, `${closest}`);
    all.delete('near');
  });

  test('they\'re forgotten about a long way off', () => {
    const { t, world, removed } = setUp(), c = aCar(t, world, 0, him(100));
    t.T.gone = 300;
    run(t, him(-900), 1); assert.equal(t.cars.length, 0); assert.deepEqual(removed, [c.v]);
  });

  test('something happens to the car and the driver\'s out of it', () => {
    for (const hit of [(v) => { v.loose = {}; }, (v) => { v.wrecked = true; }, (v) => { v.hp = 50; }, (v) => { v.drowned = true; }]) {
      const { t, world, outs, removed } = setUp(), c = aCar(t, world);
      hit(c.v); t.update(1 / 30, him(5000));
      assert.equal(t.cars.length, 0); assert.equal(c.v.ai, null); assert.equal(outs.length, 1); assert.equal(outs[0][1], 'hit'); assert.deepEqual(removed, []);
    }
  });

  test('griffis Fountain Rd\'s off the list', () => {
    assert.ok(TRAFFIC.stay.includes('griffis_fountain_rd'));
  });
});

describe('kids on four-wheelers', () => {
  const rider = (over = {}, p = him(5000)) => {
    const s = setUp({ tuning: { riders: 1, riderFrom: [0, 1e5], riderGone: 1e5, gone: 1e5 }, ...over }); for (let i = 0; i < 400 && !s.t.riders.length; i++) s.t.update(1 / 30, p);
    return { ...s, c: s.t.riders[0] };
  };
  const onLane = (c) => { c.road = lane; c.s = 100; c.dir = 1; c.v.x = OFF + 300; c.v.z = 100; c.v.yaw = 0; c.off = c.want = 0; c.v.f = c.speed; c.next = 0; };

  test('they stay on the lanes and off the road', () => {
    const { t, c } = rider(); onLane(c);
    run(t, him(5000), 3);
    assert.ok(Math.abs(c.v.x - (OFF + 300)) < 1); assert.ok(c.v.z > 110);
  });

  test('at the end of a lane they go on to the next one, or come back', () => {
    const { t, c } = rider(); onLane(c);
    let lanes = new Set(); run(t, him(5000), 60, 1 / 30, () => lanes.add(c.road.id));
    assert.ok(lanes.has('lane2'));
  });

  test('coming at him on foot they swerve off the line', () => {
    const { t, c } = rider(), p = him(301, 180); onLane(c);
    let closest = Infinity, most = 0; run(t, p, 12, 1 / 30, () => { closest = Math.min(closest, Math.hypot(c.v.x - p.x, c.v.z - p.z)); most = Math.max(most, Math.abs(c.off)); });
    assert.ok(most > 4, `${most}`); assert.ok(closest > 3, `${closest}`);
  });

  test('they see a truck coming from further off', () => {
    const { t, c } = rider(), p = him(301, 125, { driving: true }); onLane(c);
    run(t, p, .5); assert.ok(Math.abs(c.want) > 0);
    const { t: t2, c: c2 } = rider(), p2 = him(301, 125); onLane(c2);
    run(t2, p2, .5); assert.equal(c2.want, 0);
  });

  test('they\'ve nothing to do with anything that stops a car', () => {
    const { t, c, outs } = rider(); onLane(c);
    c.v.hp = 1; run(t, him(5000), 2); assert.equal(outs.length, 0); assert.equal(t.riders.length, 1);
  });

  test('with no room to swerve, they turn back', () => {
    const { t, c } = rider({ things: [[OFF + 293, 170, 9], [OFF + 307, 170, 9]] }), p = him(300, 180); onLane(c); c.s = 165; c.v.z = 165;
    run(t, p, 1); assert.equal(c.dir, -1);
  });
});

describe('a railroad crossing', () => {
  const shutAt = (world, x) => { world.shut = (px, pz) => Math.hypot(px - (OFF + x), pz) < 7; };

  test('shut, it holds a driver up for as long as it takes, and they don\'t go round it or turn back', () => {
    const { t, world } = setUp(), c = aCar(t, world, 100), p = him(100, 500);
    shutAt(world, 180);
    run(t, p, 40);
    assert.ok(c.v.x < OFF + 180 - 7 && c.v.x > OFF + 100, `stopped short of it at ${c.v.x - OFF}`);
    assert.ok(Math.abs(c.v.f) < .5, 'and stayed stopped');
    assert.equal(c.dir, 1); assert.equal(c.passUntil, null); assert.equal(c.what, 'crossing');
    world.shut = null;
    run(t, p, 6);
    assert.ok(c.v.x > OFF + 185, `went on when it opened, to ${c.v.x - OFF}`);
  });

  test('someone already on it when it shuts carries on over it', () => {
    const { t, world } = setUp(), c = aCar(t, world, 100), p = him(100, 500);
    shutAt(world, 103);
    run(t, p, 3);
    assert.ok(c.v.x > OFF + 112, `got off it, to ${c.v.x - OFF}`);
  });

  test('a kid holds up for it too, and goes on', () => {
    const { t, world } = setUp({ tuning: { riders: 1, riderFrom: [0, 1], riderGone: 1e6 } }), p = him(5000);
    run(t, him(300, 150), 1); const c = t.riders[0];
    c.road = lane; c.s = 100; c.dir = 1; c.v.x = OFF + 300; c.v.z = 100; c.v.yaw = 0; c.off = c.want = 0; c.v.f = c.speed; c.next = 0;
    world.shut = (x, z) => Math.hypot(x - (OFF + 300), z - 140) < 7;
    run(t, p, 12);
    assert.ok(c.v.z < 134 && c.v.z > 100, `stopped short of it at ${c.v.z}`);
    world.shut = null;
    run(t, p, 5);
    assert.ok(c.v.z > 150 || c.road !== lane, `went on, to ${c.v.z}`);
  });
});
