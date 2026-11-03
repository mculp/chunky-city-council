// How the crowd senses, hunts and grabs, on an empty field.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHorde, SHAMBLE, CURIOUS, HUNTING, SWARM, GRABBING, STUNNED, TUNING } from './horde.js';

let seed = 1;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const field = (extra = {}) => ({ blocked: () => false, water: () => false, floorAt: () => 0, wander: (s) => [s.x, s.z], rand, ...extra });
const still = { x: 0, z: 0, y: 0, noise: 0, light: 0, beans: 0, night: 1, hidden: false, canGrab: true };
const run = (h, p, seconds, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) h.update(dt, p); };

describe('knocked over', () => {
  test('anyone in reach goes flat, thrown clear, and it says how many', () => {
    const h = createHorde(field()), near = h.add(1, 0), far = h.add(9, 0);
    run(h, still, .05);
    assert.equal(h.knock(0, 0, 3, 2), 1);
    assert.equal(near.state, STUNNED); assert.ok(near.flat > 0); assert.ok(near.x > 1.5); assert.ok(!(far.flat > 0));
  });

  test('hit again while they\'re down, they don\'t count twice', () => {
    const h = createHorde(field()); h.add(1, 0);
    run(h, still, .05);
    assert.equal(h.knock(0, 0, 3, 2), 1); assert.equal(h.knock(0, 0, 3, 2), 0);
  });

  test('a wall stops them being thrown through it', () => {
    const h = createHorde(field({ blocked: (x) => x > 2 })), s = h.add(1, 0);
    run(h, still, .05); h.knock(0, 0, 3, 2);
    assert.equal(s.x, 1); assert.ok(s.flat > 0);
  });

  test('they get up and come for you', () => {
    const h = createHorde(field()), s = h.add(1, 0);
    run(h, still, .05); h.knock(0, 0, 3, 1);
    run(h, still, 1.5);
    assert.ok(!(s.flat > 0)); assert.ok(s.state === HUNTING || s.state === SWARM || s.state === GRABBING, `state ${s.state}`);
  });
});

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

  test('a lure takes hunters off him, and they go to it quicker than they\'d go to look', () => {
    const h = createHorde(field()), s = h.add(10, 0), p = { ...still, noise: 20 };
    run(h, p, 1.5); assert.ok(s.state === HUNTING || s.state === SWARM, `it's ${s.state}`);
    const x = s.x;
    h.lure(30, 0, 40, 6); run(h, p, .4);
    assert.equal(s.state, CURIOUS); assert.equal(s.tx, 30);
    run(h, p, 2);
    assert.ok(s.x - x > 2.5, `only got to ${s.x}`);
    assert.ok(s.moving > TUNING.speed[CURIOUS]);
  });

  test('a plain noise doesn\'t take a hunter off someone it can still hear', () => {
    const h = createHorde(field()), s = h.add(10, 0), p = { ...still, noise: 20 };
    run(h, p, 1.5);
    h.noise(30, 0, 40, 6); run(h, p, .4);
    assert.ok(s.state === HUNTING || s.state === SWARM);
  });

  test('but one still comes for him if he\'s right on top of it', () => {
    const h = createHorde(field()), s = h.add(2, 0), p = { ...still, noise: 20 };
    run(h, p, 1.2);
    h.lure(30, 0, 40, 6); run(h, p, .4);
    assert.ok(s.state === HUNTING || s.state === SWARM || s.state === GRABBING, `it's ${s.state}`);
  });

  test('a lure wins over a noise that\'s nearer', () => {
    const h = createHorde(field()), s = h.add(0, 40);
    h.noise(0, 45, 20, 6); h.lure(0, 20, 40, 6); run(h, { ...still, x: 100 }, .3);
    assert.equal(s.tz, 20);
  });

  test('once it stops they can make him out again', () => {
    const h = createHorde(field()), s = h.add(10, 0);
    h.lure(30, 0, 40, 1); run(h, { ...still, noise: 20 }, 4);
    assert.ok(s.alert > 0, 'it\'s heard him');
    assert.ok(!s.drawn);
  });

  test('anywhere else they keep out of the water, however loud it is', () => {
    const wet = (x) => x > 15, h = createHorde(field({ water: wet })), s = h.add(10, 0);
    h.noise(25, 0, 40, 8); run(h, { ...still, x: -100 }, 8);
    assert.ok(!wet(s.x), `it's at ${s.x}`);
  });

  test('a lure in the water takes them in after it, and they don\'t come out', () => {
    const wet = (x) => x > 15, bitten = [], h = createHorde(field({ water: wet }), {}, { bitten: (o) => bitten.push(o) }), s = h.add(10, 0), far = h.add(-40, 0);
    h.lure(25, 0, 40, 8, true);
    const p = { ...still, x: -100 }; let went = false;
    for (let t = 0; t < 30 && !bitten.length; t += 1 / 30) { h.update(1 / 30, p); if (wet(s.x)) went = true; }
    assert.ok(went, 'it went in');
    assert.deepEqual(bitten, [s]);
    assert.equal(far.wading, undefined, 'and whoever couldn\'t hear it stays out');
    const y = s.y; run(h, p, TUNING.goesUnder / 2);
    assert.ok(s.y < y, 'it goes down');
    assert.ok(h.all.includes(s));
    run(h, p, TUNING.goesUnder);
    assert.ok(!h.all.includes(s), 'and it\'s gone');
    assert.ok(h.all.includes(far));
  });

  test('the town doesn\'t empty: another wanders in for each, in time, from out of sight, and only for those', () => {
    const wet = (x) => x > 15, h = createHorde(field({ water: wet, comeFrom: () => [500, 500] }, {})), s = h.add(14, 0), p = { ...still, x: -100 };
    h.lure(25, 0, 40, 30, true);
    run(h, p, 20);
    assert.ok(!h.all.includes(s), 'the water had it');
    assert.equal(h.all.length, 0);
    run(h, p, TUNING.comeIn - 15);
    assert.equal(h.all.length, 0, 'not straight away');
    run(h, p, 16);
    assert.deepEqual([h.all.length, h.all[0].x, h.all[0].z], [1, 500, 500]);
    run(h, p, TUNING.comeIn * 3);
    assert.equal(h.all.length, 1, 'one for one');
    h.all.length = 0; run(h, p, TUNING.comeIn * 2);
    assert.equal(h.all.length, 0, 'and nobody comes for those it didn\'t have');
  });

  test('it only takes a moment of hearing it, and they go all the way', () => {
    const wet = (x) => x > 15, h = createHorde(field({ water: wet })), s = h.add(0, 0);
    h.lure(25, 0, 40, .5, true); run(h, { ...still, x: -100 }, 25);
    assert.ok(wet(s.x) || !h.all.includes(s), `it's at ${s.x}`);
  });

  test('anyone who\'s called off before they get there stays out', () => {
    const wet = (x) => x > 15, h = createHorde(field({ water: wet, wander: (o) => [o.x - 5, o.z] })), s = h.add(-20, 0);
    h.lure(25, 0, 50, .5, true); run(h, { ...still, x: -100 }, .4);
    assert.equal(s.wading, true);
    run(h, { ...still, x: -100 }, .4); h.calm(); run(h, { ...still, x: -100 }, 1);
    assert.ok(!s.wading);
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

describe('shambling with them', () => {
  const act = (over = {}) => ({ ...still, acting: true, ...over });
  // along x, at the pace, past whoever's there
  const walkPast = (h, p, to, pace = TUNING.actPace, dt = 1 / 30) => { for (; p.x < to; p.x += pace * dt) h.update(dt, p); };
  const line = (h, off) => [-20, -12, -4, 4, 12, 20].flatMap((x) => [h.add(x, off), h.add(x + 2, -off)]);

  test('he walks between them a few metres off, and nobody comes for him', () => {
    const h = createHorde(field()), crowd = line(h, 2.6), p = act({ x: -30 });
    walkPast(h, p, 30);
    assert.equal(h.grab, null);
    assert.ok(crowd.every((s) => s.state === SHAMBLE || s.state === CURIOUS), crowd.map((s) => s.state).join());
    assert.ok(crowd.some((s) => s.sus > .15), 'though they looked twice');
  });

  test('walking it the usual way, they come for him', () => {
    const h = createHorde(field()), crowd = line(h, 2.6), p = { ...still, x: -30, noise: 14 };
    walkPast(h, p, 30, 4.4);
    assert.ok(h.grab || crowd.some((s) => s.state === HUNTING || s.state === SWARM || s.state === GRABBING));
  });

  test('right up against one, it doesn\'t last, and they say so', () => {
    let spotted = 0;
    const h = createHorde(field(), {}, { spotted: () => spotted++ }), s = h.add(1, 0);
    run(h, act(), 3);
    assert.equal(s.state, SHAMBLE, 'not yet'); assert.ok(s.sus > .4);
    run(h, act(), 3);
    assert.equal(spotted, 1); assert.ok(s.state === HUNTING || s.state === SWARM || s.state === GRABBING, `state ${s.state}`);
  });

  test('beans make it quicker, since they can smell them', () => {
    const until = (beans) => { const h = createHorde(field()), s = h.add(1.5, 0); let t = 0; while (s.state === SHAMBLE && t < 30) { h.update(.1, act({ beans })); t += .1; } return t; };
    const none = until(0), full = until(12);
    assert.ok(full < none / 2, `${full} s with twelve, ${none} s with none`);
  });

  test('out of reach it wears off', () => {
    const h = createHorde(field()), s = h.add(1, 0);
    run(h, act(), 2.5);
    const was = s.sus;
    run(h, act({ x: -20 }), 3);
    assert.ok(s.sus < was - .25, `${was} to ${s.sus}`);
  });

  test('anyone already after him isn\'t taken in', () => {
    const h = createHorde(field()), s = h.add(1.5, 0);
    s.state = HUNTING;
    run(h, act(), 2);
    assert.ok(h.grab, 'they get him anyway');
  });

  test('giving himself away gives him away to everyone close, and it says how many', () => {
    const h = createHorde(field()), near = [h.add(3, 0), h.add(-6, 4), h.add(0, -9)], far = h.add(30, 0);
    run(h, act(), .3);
    assert.equal(h.unmask(act()), 3);
    assert.ok(near.every((s) => s.state === HUNTING)); assert.equal(far.state, SHAMBLE);
    // standing still and quiet, out of reach of their senses, with a noise of his own going: they still know where he is, for a while
    h.noise(0, 0, 14, 1);
    run(h, { ...still, canGrab: false }, 2);
    assert.ok(near.every((s) => s.state === HUNTING || s.state === SWARM), near.map((s) => s.state).join());
    assert.ok(near.every((s) => Math.hypot(s.x, s.z) < 3), 'and they come right to him');
  });
});

describe('run over', () => {
  const hit =(over = {}) => ({ x: 3, z: 0, vx: 10, vz: 0, vy: 6, kills: true, seconds: 30, spin: 8, ...over });

  test('whoever it finds is thrown, and it says how many', () => {
    const h = createHorde(field()), near = h.add(1, 0), far = h.add(9, 0);
    run(h, still, .05);
    assert.equal(h.runOver((x) => (x < 2 ? hit() : null)), 1);
    assert.equal(near.state, STUNNED); assert.equal(near.x, 3); assert.ok(near.thrown); assert.ok(!far.thrown);
    assert.equal(h.runOver(() => hit()), 1, 'not twice for the same one');
  });

  test('they fly, land, and if it killed them they lie there and then they\'re gone', () => {
    const h = createHorde(field()), s = h.add(1, 0), n = h.all.length;
    run(h, still, .05);
    h.runOver((x) => (x < 2 ? hit() : null));
    run(h, still, .3);
    assert.ok(s.y > 0, 'in the air'); assert.ok(s.x > 4); assert.ok(s.tumble > 0);
    run(h, still, .7);
    assert.equal(s.thrown, null); assert.equal(s.y, 0); assert.equal(s.tumble, 0); assert.ok(s.x > 9, `to ${s.x}`);
    const landed = s.x;
    run(h, still, TUNING.liesDead - .5);
    assert.ok(s.flat > 0, 'still down'); assert.equal(s.x, landed, 'and not going anywhere'); assert.equal(h.all.length, n);
    run(h, still, 2.5);
    assert.equal(h.all.length, n - 1, 'gone');
  });

  test('if it didn\'t, they get up', () => {
    const h = createHorde(field()), s = h.add(1, 0), n = h.all.length;
    run(h, still, .05);
    h.runOver((x) => (x < 2 ? hit({ kills: false, seconds: 3 }) : null));
    run(h, still, 6);
    assert.notEqual(s.state, STUNNED); assert.equal(h.all.length, n); assert.equal(s.dead, undefined);
  });

  test('a wall stops them flying through it', () => {
    const h = createHorde(field({ blocked: (x) => x > 5 })), s = h.add(1, 0);
    run(h, still, .05);
    h.runOver((x) => (x < 2 ? hit() : null));
    run(h, still, 1.5);
    assert.ok(s.x < 5.1, `to ${s.x}`);
  });

  test('into the water and that\'s the last of them, with a splash', () => {
    let splashes = 0;
    const h = createHorde(field({ water: (x) => x > 5, level: () => 0, floorAt: (x) => (x > 5 ? -3 : 0) }), {}, { splash: () => splashes++ }), s = h.add(1, 0), n = h.all.length;
    run(h, still, .05);
    h.runOver((x) => (x < 2 ? hit({ kills: false, seconds: 3 }) : null));
    run(h, still, 1);
    assert.equal(splashes, 1); assert.ok(s.under !== undefined);
    run(h, still, 2);
    assert.equal(h.all.length, n - 1);
  });

  test('someone holding him lets go, and with nobody left he\'s free', () => {
    let freed = 0;
    const h = createHorde(field(), {}, { free: () => freed++, grab() {} }), s = h.add(.3, 0);
    s.state = HUNTING;
    run(h, { ...still, y: 0 }, .4);
    assert.ok(h.grab, 'he\'s held');
    h.runOver(() => hit());
    assert.equal(h.grab, null); assert.equal(freed, 1);
  });
});
