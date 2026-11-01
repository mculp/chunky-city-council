// How the crowd senses, hunts and grabs, on an empty field.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHorde, SHAMBLE, CURIOUS, HUNTING, SWARM, GRABBING, STUNNED, TUNING } from './horde.js';

let seed = 1;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const field = (extra = {}) => ({ blocked: () => false, water: () => false, floorAt: () => 0, wander: (s) => [s.x, s.z], rand, ...extra });
const still = { x: 0, z: 0, y: 0, noise: 0, light: 0, beans: 0, night: 1, hidden: false, canGrab: true };
const run = (h, p, seconds, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) h.update(dt, p); };

describe('senses', () => {
  test('a still player with nothing on them goes unnoticed past arm\'s reach', () => {
    const h = createHorde(field()), s = h.add(6, 0);
    run(h, still, 5);
    assert.equal(s.state, SHAMBLE); assert.equal(s.alert, 0);
  });

  test('they hear you running', () => {
    const h = createHorde(field()), s = h.add(10, 0);
    run(h, { ...still, noise: 12 }, 1);
    assert.ok(s.state >= CURIOUS, `state ${s.state}`);
  });

  test('a noise is heard further at night', () => {
    const dark = createHorde(field()), day = createHorde(field());
    const a = dark.add(15, 0), b = day.add(15, 0);
    run(dark, { ...still, noise: 12, night: 1 }, 1); run(day, { ...still, noise: 12, night: 0 }, 1);
    assert.ok(a.state >= CURIOUS); assert.equal(b.state, SHAMBLE);
  });

  test('the more beans you carry, the further they smell you', () => {
    const none = createHorde(field()), lots = createHorde(field());
    const a = none.add(9, 0), b = lots.add(9, 0);
    run(none, { ...still, beans: 0 }, 1.5); run(lots, { ...still, beans: 12 }, 1.5);
    assert.equal(a.state, SHAMBLE); assert.ok(b.state >= CURIOUS);
  });

  test('a light gives you away', () => {
    const h = createHorde(field()), s = h.add(10, 0);
    run(h, { ...still, light: 12 }, 1);
    assert.ok(s.state >= CURIOUS);
  });

  test('curiosity turns to hunting if you keep it up, and it wears off if you don\'t', () => {
    const h = createHorde(field()), s = h.add(11, 0);
    run(h, { ...still, noise: 12 }, .5);
    assert.equal(s.state, CURIOUS);
    const far = createHorde(field()), q = far.add(16, 0);
    run(far, { ...still, noise: 12 }, .6);
    assert.equal(q.state, CURIOUS);
    run(far, { ...still, x: -100 }, 20);   // gone by the time it's walked over
    assert.equal(q.state, SHAMBLE);
  });

  test('a loud noise draws them away to look', () => {
    const h = createHorde(field()), s = h.add(20, 0);
    h.noise(40, 0, 30, 5); run(h, { ...still, x: -20 }, 1);
    assert.equal(s.state, CURIOUS); assert.equal(s.tx, 40);
    assert.ok(s.x > 20, 'and walk towards it');
  });

  test('they\'re drawn to a light at night', () => {
    const h = createHorde(field({ wander: (s) => [s.x, s.z] }), { lightPull: 1 }), s = h.add(10, 0); h.lights.push({ x: 20, z: 0, r: 30 });
    run(h, { ...still, x: -100 }, 20);
    assert.ok(Math.hypot(s.x - 20, s.z) < 12, `at ${s.x},${s.z}`);
  });
});

describe('hunting', () => {
  test('they run you down, slower than you run', () => {
    const h = createHorde(field()), s = h.add(8, 0);
    run(h, { ...still, noise: 12 }, 1.2);
    assert.ok(s.state >= HUNTING);
    assert.ok(TUNING.speed[SWARM] < 4.4);
  });

  test('three or more hunting together become a swarm, and pull in others', () => {
    const h = createHorde(field()), a = [h.add(9, 0), h.add(9, 2), h.add(9, -2)], other = h.add(9, 18);
    run(h, { ...still, noise: 13 }, 1.4);
    assert.ok(a.some((s) => s.state === SWARM), a.map((s) => s.state).join());
    assert.ok(other.state >= CURIOUS, 'called over');
  });

  test('they give up when they lose you', () => {
    const h = createHorde(field()), s = h.add(8, 0);
    run(h, { ...still, noise: 12 }, 1.2);
    run(h, { ...still, x: 100, z: 0 }, TUNING.lostAfter + 1);
    assert.ok(s.state <= CURIOUS, `state ${s.state}`);
  });

  test('walls stop them, and they go around', () => {
    const wall = (x, z) => x > 3 && x < 4 && Math.abs(z) < 6;
    const h = createHorde(field({ blocked: wall })), s = h.add(8, 0);
    let touched = false; for (let t = 0; t < 12; t += 1 / 30) { h.update(1 / 30, { ...still, noise: 12 }); if (wall(s.x, s.z)) touched = true; }
    assert.ok(!touched); assert.ok(s.x < 3, `still at ${s.x},${s.z}`);
  });

  test('they stay out of the water', () => {
    const wet = (x) => x > 3 && x < 8;
    const h = createHorde(field({ water: wet })), s = h.add(12, 0);
    let swam = false; for (let t = 0; t < 6; t += 1 / 30) { h.update(1 / 30, { ...still, noise: 16 }); if (wet(s.x)) swam = true; }
    assert.ok(!swam);
  });

  test('they crowd rather than stack', () => {
    const h = createHorde(field()); for (let i = 0; i < 8; i++) h.add(6 + i * .2, i * .2);
    run(h, { ...still, x: 40, noise: 60, canGrab: false }, 8);
    let closest = Infinity; for (const a of h.all) for (const b of h.all) if (a !== b) closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z));
    assert.ok(closest > .4, `closest pair ${closest}`);
  });
});

describe('the church', () => {
  const zone = { x: 0, z: 0, r: 10 };
  test('they won\'t step inside', () => {
    const h = createHorde(field()); h.zones.push(zone); const s = h.add(14, 0);
    let inside = false; for (let t = 0; t < 10; t += 1 / 30) { h.update(1 / 30, { ...still, x: 0, noise: 20 }); if (Math.hypot(s.x, s.z) < 10) inside = true; }
    assert.ok(!inside);
  });
  test('someone inside can\'t be sensed', () => {
    const h = createHorde(field()); h.zones.push(zone); const s = h.add(12, 0);
    run(h, { ...still, noise: 20, beans: 12, hidden: true }, 3);
    assert.equal(s.state, SHAMBLE);
  });
  test('the bell brings them in anyway', () => {
    const h = createHorde(field()); h.zones.push(zone); const s = h.add(14, 0);
    h.bell(0, 0, 40, 12); run(h, { ...still, x: 100, hidden: true }, 8);
    assert.ok(Math.hypot(s.x, s.z) < 7, `at ${s.x},${s.z}`);
  });
  test('and when it stops, they walk back out', () => {
    const h = createHorde(field()); h.zones.push(zone); const s = h.add(14, 0);
    h.bell(0, 0, 40, 8); run(h, { ...still, x: 100, hidden: true }, 8.1);
    assert.ok(Math.hypot(s.x, s.z) < 10, 'inside when it stopped');
    run(h, { ...still, x: 100, hidden: true }, 12);
    assert.ok(Math.hypot(s.x, s.z) >= 10, `still in there at ${s.x},${s.z}`);
  });
});

describe('grabbing', () => {
  const caught = (tuning, on) => { const h = createHorde(field(), tuning, on), s = h.add(.5, 0); s.state = HUNTING; h.update(1 / 30, still); return { h, s }; };

  test('in reach, they grab rather than kill', () => {
    let grabbed = 0; const { h, s } = caught({}, { grab: () => grabbed++ });
    assert.equal(grabbed, 1); assert.equal(s.state, GRABBING); assert.ok(h.grab);
  });
  test('they don\'t grab someone who can\'t be grabbed', () => {
    const h = createHorde(field()), s = h.add(.5, 0); s.state = HUNTING; h.update(1 / 30, { ...still, canGrab: false });
    assert.equal(h.grab, null);
  });
  test('held, you\'re dragged', () => {
    const { h } = caught(); run(h, still, .5);
    assert.ok(Math.hypot(h.grab.dx, h.grab.dz) > 0);
  });
  test('mashing breaks free, and throws them off', () => {
    let free = 0; const { h, s } = caught({}, { free: () => free++ });
    const before = Math.hypot(s.x, s.z);
    for (let i = 0; i < 6; i++) h.mash();
    assert.equal(free, 1); assert.equal(h.grab, null); assert.equal(s.state, STUNNED);
    assert.ok(Math.hypot(s.x, s.z) > before + 1);
  });
  test('more of them make it harder', () => {
    const presses = (n) => { const { h } = caught(); for (let i = 1; i < n; i++) { const o = h.add(.6, i * .1); o.state = HUNTING; } h.update(1 / 30, still); let c = 0; while (h.grab) { h.mash(); c++; } return c; };
    assert.ok(presses(3) > presses(1));
  });
  test('you get a moment after breaking free', () => {
    const { h, s } = caught(); for (let i = 0; i < 6; i++) h.mash();
    s.state = HUNTING; s.x = .5; s.z = 0; h.update(1 / 30, still);
    assert.equal(h.grab, null);
    run(h, still, TUNING.mercy + .1); assert.ok(h.grab, 'and then it\'s over');
  });
  test('slowly mashing doesn\'t get there, and running out of time costs you', () => {
    let over = 0; const { h } = caught({}, { overrun: () => over++ });
    run(h, still, TUNING.grabHold + .1);
    assert.equal(over, 1); assert.equal(h.grab, null);
  });
  test('a stunned one comes back hunting', () => {
    const { h, s } = caught(); for (let i = 0; i < 6; i++) h.mash();
    run(h, { ...still, x: 100, noise: 0 }, TUNING.stun + .5);
    assert.notEqual(s.state, STUNNED);
  });
});

test('far from the player they wait', () => {
  const h = createHorde(field()), s = h.add(500, 0);
  run(h, still, 2);
  assert.equal(h.active.length, 0); assert.equal(s.x, 500);
});
