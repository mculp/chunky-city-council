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

  test('down as long as the hit says, getting up included, and anything can ask how long that is or keep them there', () => {
    const h = createHorde(field()), s = h.add(1, 0), up = h.add(30, 0);
    run(h, still, .05); s.state = HUNTING; h.knock(0, 0, 3, 10);
    assert.equal(s.hitAs, HUNTING); assert.equal(s.fromX, 1); assert.ok(s.x > 1.5, 'and drawn going over from where they were');
    assert.equal(h.down(s), 10); assert.equal(h.down(up), 0); assert.equal(h.keepDown(up, 5), false);
    run(h, { ...still, canGrab: false }, 5);
    assert.equal(s.state, STUNNED); assert.ok(Math.abs(h.down(s) - 5) < .05, `${h.down(s)} left`);
    assert.equal(h.keepDown(s, 8), true); assert.ok(Math.abs(h.down(s) - 8) < .05);
    run(h, { ...still, canGrab: false }, 7.8);
    assert.equal(s.state, STUNNED, 'still down'); assert.ok(h.down(s) > 0);
    // and up the moment it's over, not whenever they'd next have looked around
    for (let n = 0; n < 60 && h.down(s) > 0; n++) h.update(1 / 30, { ...still, canGrab: false });
    assert.equal(h.down(s), 0); assert.notEqual(s.state, STUNNED, 'up in the same moment');
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

  test('a lure in the water takes them in after it, and the cottonmouths have them', () => {
    const wet = (x) => x > 15, bitten = [], h = createHorde(field({ water: wet }), {}, { bitten: (o) => bitten.push(o) }), s = h.add(10, 0), far = h.add(-40, 0);
    h.lure(25, 0, 40, 8, true);
    const p = { ...still, x: -100 }; let went = false;
    for (let t = 0; t < 30 && !bitten.length; t += 1 / 30) { h.update(1 / 30, p); if (wet(s.x)) went = true; }
    assert.ok(went, 'it went in');
    assert.deepEqual(bitten, [s]);
    assert.equal(far.wading, undefined, 'and whoever couldn\'t hear it stays out');
    const y = s.y; run(h, p, TUNING.goesUnder / 2);
    assert.ok(s.y < y, 'it goes down');
    run(h, p, TUNING.goesUnder);
    assert.ok(s.under > 0, 'and stays down a while'); assert.ok(h.all.includes(s), 'but not gone');
    assert.deepEqual(bitten, [s], 'only the once');
  });

  describe('the river brings them up', () => {
    // the water is east of x = 15 everywhere, and downstream is south, so a place to come up is just in it with a bank just out of it
    const world = (extra = {}) => field({ water: (x) => x > 15, level: () => 0, floorAt: (x) => (x > 15 ? -2 : 0), comeUp: (s, how) => ({ x: 16, z: s.z + how.metres, bank: [13, s.z + how.metres] }), ...extra });
    const p = { ...still, x: -100 };
    // lures one into the water and runs until the cottonmouths have them. It says what they were like as they came up.
    const wade = (h, s, up) => {
      s.wading = true; h.lure(25, 0, 40, 8, true);
      for (let t = 0; t < 40 && !(s.under > 0); t += 1 / 30) h.update(1 / 30, p);
      const was = { x: s.x, z: s.z, swept: s.swept };
      for (let t = 0; t < 40 && s.under !== undefined; t += 1 / 30) h.update(1 / 30, p);
      return { ...was, up: up[0] };
    };
    const seen = (o) => ({ x: o.x, z: o.z, state: o.state, wet: o.wet, snake: o.snake, homeward: o.homeward, climbing: o.climbing, wading: o.wading, under: o.under });

    test('downstream, soaked, with a snake on a sleeve, in the same number as before', () => {
      const up = [], h = createHorde(world(), {}, { surfaced: (o) => up.push(seen(o)) }), s = h.add(10, 0), n = h.all.length;
      const was = wade(h, s, up);
      assert.ok(was.swept >= TUNING.below[0] * TUNING.current && was.swept <= TUNING.below[1] * TUNING.current, `${was.swept} m`);
      assert.equal(up.length, 1, 'up again, the once'); assert.equal(h.all.length, n, 'nobody new, and nobody missing');
      assert.ok(Math.abs(up[0].z - was.z - was.swept) < 1e-9, `${up[0].z - was.z} m downstream when it was ${was.swept}`);
      assert.equal(up[0].wet, TUNING.dries);
      assert.ok(up[0].snake >= TUNING.snakeFor[0] && up[0].snake <= TUNING.snakeFor[1], `a snake for ${up[0].snake} s`);
      assert.equal(up[0].state, SHAMBLE); assert.ok(up[0].homeward); assert.equal(up[0].under, undefined);
      assert.ok(up[0].x > 15 && up[0].climbing && up[0].wading, 'in the water, to wade out of it');
    });

    test('they wade out first and nothing takes them back in, then walk home to dry off', () => {
      const up = [], bitten = [], h = createHorde(world(), {}, { bitten: (o) => bitten.push(o), surfaced: (o) => up.push(seen(o)) }), s = h.add(10, 0);
      s.homeX = 0; s.homeZ = 400;
      wade(h, s, up);
      // another into the water while they're still getting out of it doesn't take them back
      h.lure(25, s.z, 40, 1.5, true);
      run(h, p, 12);
      assert.ok(s.x < 15 && !s.climbing && !s.wading, `on the bank at ${s.x}`);
      assert.equal(bitten.length, 1, 'bitten the once');
      // and with him a way off, keeping up, a long walk
      const q = { ...still, x: 80, z: 0 }, z = s.z;
      for (let t = 0; t < 40; t += 5) { q.z = s.z; run(h, q, 5); }
      assert.ok(s.z > z + 5, 'and off home');
      for (let t = 0; t < 400 / TUNING.speed[SHAMBLE]; t += 5) { q.z = s.z; run(h, q, 5); }
      assert.ok(Math.hypot(s.x, s.z - 400) < TUNING.homeIs + 3, `at ${s.x}, ${s.z}`); assert.ok(!s.homeward);
    });

    test('dry after a while, and the snake lets go before that', () => {
      const up = [], dropped = [], h = createHorde(world(), {}, { drop: (o) => dropped.push(o), surfaced: (o) => up.push(seen(o)) }), s = h.add(10, 0);
      wade(h, s, up);
      run(h, p, up[0].snake + .5);
      assert.deepEqual(dropped, [s]); assert.equal(s.snake, 0); assert.ok(s.wet > 0, 'still soaked');
      run(h, p, TUNING.dries);
      assert.ok(!(s.wet > 0), 'dry');
    });

    test('nobody is asked for a random number to bring them up, which would change what everyone else does', () => {
      let n = 0;
      const h = createHorde({ ...world(), rand: () => { n++; return rand(); } }, {}, {}), s = h.add(10, 0);
      s.wading = true; h.lure(25, 0, 40, 8, true);
      for (let t = 0; t < 40 && !(s.under > 0); t += 1 / 30) h.update(1 / 30, p);
      while (s.under > 1 / 30) h.update(1 / 30, p);
      n = 0; h.update(1 / 30, p);
      assert.equal(s.under, undefined, 'up'); assert.equal(n, 0, `${n} calls`);
    });

    test('with nowhere to come up they\'re where they went under, and wade out from there', () => {
      const h = createHorde(world({ comeUp: undefined }), {}, {}), s = h.add(10, 0);
      const was = wade(h, s, []);
      assert.equal(s.under, undefined); assert.ok(Math.abs(s.x - was.x) < 1 && Math.abs(s.z - was.z) < 1);
      run(h, p, 20); assert.ok(s.x < 15, `out of it at ${s.x}`);
    });
  });

  test('nobody new wanders in to take anyone\'s place, and the town is never asked for anyone', () => {
    let asked = 0;
    const wet = (x) => x > 15, h = createHorde(field({ water: wet, comeFrom: () => { asked++; return [500, 500]; } }), {}, {}), s = h.add(14, 0), p = { ...still, x: -100 };
    h.lure(25, 0, 40, 30, true);
    run(h, p, 20);
    run(h, p, 600);
    assert.equal(h.all.length, 1, 'one, as there always was');
    assert.equal(h.all[0], s); assert.equal(asked, 0);
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
  test('it draws them the way a lure does, quicker than a noise would', () => {
    const a = createHorde(field()), s = a.add(30, 0); a.noise(0, 0, 60, 6); run(a, { ...still, x: 100, hidden: true }, 4);
    const b = createHorde(field()), t = b.add(30, 0); b.bell(0, 0, 60, 6); run(b, { ...still, x: 100, hidden: true }, 4);
    assert.ok(Math.hypot(t.x, t.z) < Math.hypot(s.x, s.z) - 2, `a noise left them ${Math.hypot(s.x, s.z).toFixed(1)} m off, the bell ${Math.hypot(t.x, t.z).toFixed(1)}`);
  });
  test('and when it stops, they walk back out', () => {
    const h = createHorde(field()); h.zones.push(zone); const s = h.add(14, 0);
    h.bell(0, 0, 40, 8); run(h, { ...still, x: 100, hidden: true }, 8.1);
    assert.ok(Math.hypot(s.x, s.z) < 10, 'inside when it stopped');
    run(h, { ...still, x: 100, hidden: true }, 20);
    assert.ok(Math.hypot(s.x, s.z) >= 10, `still in there at ${s.x},${s.z}`);
  });
  test('and something parked in the way doesn\'t keep them in', () => {
    for (const [x0, x1, z0, z1] of [[9.6, 12.4, -.9, .9], [9.6, 10.4, -3, 3]]) {
      const h = createHorde(field({ blocked: (x, z) => x > x0 && x < x1 && z > z0 && z < z1 })); h.zones.push(zone); const s = h.add(9, .3);
      run(h, { ...still, z: 30, hidden: true }, 15);
      assert.ok(Math.hypot(s.x, s.z) >= 10, `still in there at ${s.x.toFixed(2)},${s.z.toFixed(2)}`);
    }
  });
});

describe('grabbing', () => {
  // in reach and long enough to get hold of him
  const caught = (tuning, on) => { const h = createHorde(field(), tuning, on), s = h.add(.5, 0); s.state = HUNTING; run(h, still, TUNING.windUp + .05); return { h, s }; };

  test('in reach, they grab rather than kill', () => {
    let grabbed = 0; const { h, s } = caught({}, { grab: () => grabbed++ });
    assert.equal(grabbed, 1); assert.equal(s.state, GRABBING); assert.ok(h.grab);
  });
  test('it takes them a moment to get hold, and a hit in that moment stops it', () => {
    const h = createHorde(field()), s = h.add(.5, 0); s.state = HUNTING;
    run(h, still, TUNING.windUp - .1);
    assert.equal(h.grab, null, 'not yet'); assert.ok(s.reaching > 0, 'but they\'re reaching');
    run(h, still, .15);
    assert.ok(h.grab, 'and then they have him');
    const g = createHorde(field()), t = g.add(.5, 0); t.state = HUNTING;
    run(g, still, TUNING.windUp * .7); g.knock(0, 0, 1.5, 10);
    run(g, still, 1);
    assert.equal(g.grab, null); assert.equal(t.state, STUNNED); assert.equal(t.reaching, 0);
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
    run(h, still, TUNING.mercy + TUNING.windUp + .1); assert.ok(h.grab, 'and then it\'s over');
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

describe('gone quiet', () => {
  const quiet = (extra = {}) => field({ quiet: () => true, ...extra });

  test('they leave him be, however much noise or light or beans he has on him', () => {
    const h = createHorde(quiet()), s = h.add(4, 0);
    run(h, { ...still, noise: 20, light: 12, beans: 12 }, 5);
    assert.equal(s.state, SHAMBLE); assert.equal(s.alert, 0); assert.equal(h.grab, null);
  });

  test('walking right past them, the only ones who come for him are the ones who haven\'t', () => {
    const h = createHorde(quiet()), lot = [-20, -12, -4, 4, 12, 20].flatMap((x) => [h.add(x, 3), h.add(x + 2, -3)]), hunter = h.add(8, 4, { quiet: false });
    const p = { ...still, x: -30, noise: 14, canGrab: false };
    for (; p.x < 30; p.x += 4.4 / 30) h.update(1 / 30, p);
    assert.ok(lot.every((s) => s.state === SHAMBLE), lot.map((s) => s.state).join());
    assert.ok(hunter.state === HUNTING || hunter.state === SWARM, `the one that hunts is ${hunter.state}`);
  });

  test('shambling past them, they don\'t look twice', () => {
    const h = createHorde(quiet()), s = h.add(1, 0);
    run(h, { ...still, acting: true }, 6);
    assert.equal(s.state, SHAMBLE); assert.ok(!s.sus);
  });

  test('hit one and it comes for him, and so does anyone close by who saw it, and not anyone further off', () => {
    const h = createHorde(quiet()), hit = h.add(1, 0), near = [h.add(4, 3), h.add(-5, -6)], far = h.add(14, 0);
    run(h, still, .05);
    h.knock(.5, 0, 1.2, 1);
    assert.equal(hit.state, STUNNED);
    assert.ok(near.every((s) => s.state === HUNTING), near.map((s) => s.state).join()); assert.equal(far.state, SHAMBLE);
    run(h, { ...still, canGrab: false }, 2.5);
    assert.ok(hit.state === HUNTING || hit.state === SWARM, `and it's up and after him: ${hit.state}`);
    assert.ok(near.every((s) => Math.hypot(s.x, s.z) < 3), 'and they come right to him, though he\'s made no sound');
  });

  test('once they\'ve lost him they leave him be again', () => {
    const h = createHorde(quiet()), hit = h.add(.5, 0), s = h.add(6, 0);
    run(h, still, .05); h.knock(0, 0, 1, 1);
    assert.equal(s.state, HUNTING);
    run(h, { ...still, x: 100, canGrab: false }, TUNING.lostAfter + 8);
    assert.ok([hit, s].every((o) => o.state === SHAMBLE || o.state === CURIOUS), `${hit.state} ${s.state}`);
    run(h, { ...still, x: s.x + 3, z: s.z, noise: 20, canGrab: false }, 3);
    assert.ok([hit, s].every((o) => o.state === SHAMBLE || o.state === CURIOUS), 'even with him right there making all the noise he can');
  });

  test('something he throws that hits one does the same, and so does picking up what\'s at one\'s feet', () => {
    const a = createHorde(quiet()), s = a.add(5, 0), by = a.add(9, 2), off = a.add(30, 0);
    run(a, still, .05);
    assert.equal(a.provoke(s), 2);
    assert.equal(s.state, HUNTING); assert.equal(by.state, HUNTING); assert.equal(off.state, SHAMBLE);
    const b = createHorde(quiet()), t = b.add(5, 0), u = b.add(20, 0);
    run(b, still, .05);
    assert.equal(b.took(5.5, .5), 1); assert.equal(t.state, HUNTING); assert.equal(u.state, SHAMBLE);
    assert.equal(b.took(12, 0), 0, 'and from where nobody\'s standing it\'s nothing');
  });

  test('a fire knocking one over isn\'t him, and they go back to how they were', () => {
    const h = createHorde(quiet()), s = h.add(1, 0), by = h.add(5, 0);
    run(h, still, .05);
    h.knock(0, 0, 2, 1, 'fire');
    assert.equal(by.state, SHAMBLE, 'nobody saw him do anything');
    run(h, { ...still, canGrab: false }, 2);
    assert.equal(s.state, SHAMBLE); assert.equal(s.alert, 0);
  });

  test('a lure, a noise and a light still bring them', () => {
    const h = createHorde(quiet()), s = h.add(20, 0); h.lure(40, 0, 40, 5); run(h, { ...still, x: -20 }, 1);
    assert.equal(s.state, CURIOUS); assert.equal(s.tx, 40); assert.ok(s.drawn);
    const n = createHorde(quiet()), t = n.add(20, 0); n.noise(40, 0, 30, 5); run(n, { ...still, x: -20 }, 1);
    assert.equal(t.state, CURIOUS); assert.equal(t.tx, 40);
    const l = createHorde(quiet({ wander: (o) => [o.x, o.z] }), { lightPull: 1 }), u = l.add(10, 0); l.lights.push({ x: 20, z: 0, r: 30 });
    run(l, { ...still, x: -100 }, 20);
    assert.ok(Math.hypot(u.x - 20, u.z) < 12, `at ${u.x},${u.z}`);
  });

  test('giving himself away doesn\'t turn them, and a swarm going by doesn\'t call them over', () => {
    const h = createHorde(quiet()), s = h.add(3, 0), burnt = h.add(-3, 0, { quiet: false });
    run(h, { ...still, acting: true }, .3);
    assert.equal(h.unmask({ ...still, acting: true }), 1);
    assert.equal(s.state, SHAMBLE); assert.equal(burnt.state, HUNTING);
    const w = createHorde(quiet()), q = w.add(9, 18), pack = [w.add(9, 0, { quiet: false }), w.add(9, 2, { quiet: false }), w.add(9, -2, { quiet: false })];
    run(w, { ...still, noise: 13 }, 1.4);
    assert.ok(pack.some((o) => o.state === SWARM), pack.map((o) => o.state).join()); assert.equal(q.state, SHAMBLE);
  });

  test('the ones who come after him folded over are quicker, and still slower than he runs', () => {
    const h = createHorde(field()), up = h.add(10, 0), low = h.add(10, 1, { scuttle: true });
    run(h, { ...still, noise: 14, canGrab: false }, .8);
    assert.ok(up.state === HUNTING && low.state === HUNTING, `${up.state} ${low.state}`);
    assert.ok(low.moving > up.moving, `${low.moving} against ${up.moving}`);
    assert.ok(TUNING.speed[SWARM] * TUNING.scuttle < 4.4);
  });
});

describe('run over', () => {
  const hit = (over = {}) => ({ x: 3, z: 0, vx: 10, vz: 0, vy: 6, seconds: 30, spin: 8, ...over });
  const away = { ...still, x: -100 };

  test('whoever it finds is thrown, and it says how many', () => {
    const h = createHorde(field()), near = h.add(1, 0), far = h.add(9, 0);
    run(h, still, .05);
    assert.equal(h.runOver((x) => (x < 2 ? hit() : null)), 1);
    assert.equal(near.state, STUNNED); assert.equal(near.x, 3); assert.ok(near.thrown); assert.ok(!far.thrown);
    assert.equal(h.runOver(() => hit()), 1, 'not twice for the same one');
  });

  test('they fly, land, and lie where they land for as long as it says, and nobody dies of it', () => {
    const h = createHorde(field()), s = h.add(1, 0), n = h.all.length;
    run(h, away, .05);
    h.runOver((x) => (x < 2 ? hit() : null));
    run(h, away, .3);
    assert.ok(s.y > 0, 'in the air'); assert.ok(s.x > 4); assert.ok(s.tumble > 0);
    run(h, away, .7);
    assert.equal(s.thrown, null); assert.equal(s.y, 0); assert.equal(s.tumble, 0); assert.ok(s.x > 9, `to ${s.x}`);
    const landed = s.x;
    run(h, away, 28);
    assert.ok(h.down(s) > 0, 'still down'); assert.equal(s.x, landed, 'and not going anywhere'); assert.equal(h.all.length, n); assert.equal(s.dead, undefined);
    run(h, away, 10);
    assert.equal(h.down(s), 0, 'up'); assert.equal(h.all.length, n, 'and nobody\'s gone');
  });

  test('not while they\'re still down, and then they\'re sore, and on their way home', () => {
    const h = createHorde(field()), s = h.add(1, 0);
    run(h, away, .05);
    h.runOver((x) => (x < 2 ? hit({ seconds: 3 }) : null));
    for (let t = 0; t < 8; t += 1 / 30) { h.update(1 / 30, away); if (h.down(s) > 0) assert.equal(s.state, STUNNED, `up with ${h.down(s)} s still to go`); }
    assert.equal(h.down(s), 0); assert.notEqual(s.state, STUNNED);
    assert.equal(s.state, SHAMBLE); assert.ok(s.homeward && s.sore > 0, 'sore and heading home');
  });

  test('they go home, at the pace that leaves them, and are sore until they get there and a little after', () => {
    const h = createHorde(field()), s = h.add(1, 0), q = { ...away, x: 0, z: 0 };
    run(h, q, .05);
    h.runOver((x) => (x < 2 ? hit({ x: 12, z: 0, vx: 0, vz: 0, vy: 1, seconds: 2 }) : null));
    run(h, away, 6);
    const was = s.x; run(h, away, 4);
    assert.ok(was - s.x > 4 * TUNING.speed[SHAMBLE] * TUNING.soreSpeed * .8 && was - s.x < 4 * TUNING.speed[SHAMBLE] * TUNING.soreSpeed * 1.2, `${was - s.x} m in 4 s`);
    assert.ok(s.moving < TUNING.speed[SHAMBLE]);
    for (let t = 0; t < 60 && s.homeward; t += 1 / 30) h.update(1 / 30, away);
    assert.ok(Math.abs(s.x - 1) < TUNING.homeIs + .5, `at ${s.x}`); assert.ok(!s.homeward); assert.ok(s.sore > TUNING.soreFor - 1, 'still sore at home');
    run(h, away, TUNING.soreFor + 1);
    assert.ok(!(s.sore > 0), 'and over it');
    // as quick as they ever were
    s.x = 20; s.tx = 1; s.tz = 0; s.timer = 99; run(h, away, 4);
    assert.ok(20 - s.x > 4 * TUNING.speed[SHAMBLE] * .8, `${20 - s.x} m in 4 s`);
  });

  test('whatever they were doing, they\'ve had enough of it: someone after him goes home, and doesn\'t come back for him', () => {
    const h = createHorde(field()), s = h.add(1, 0), p = { ...still, noise: 20, x: -100 };
    s.state = HUNTING; s.started = true;
    run(h, away, .05);
    h.runOver((x) => (x < 2 ? hit({ seconds: 3 }) : null));
    run(h, away, 30);
    assert.notEqual(s.state, HUNTING); assert.equal(s.started, false);
    assert.ok(Math.abs(s.x - 1) < TUNING.homeIs + 1, `home at ${s.x}`);
  });

  test('a wall stops them flying through it', () => {
    const h = createHorde(field({ blocked: (x) => x > 5 })), s = h.add(1, 0);
    run(h, still, .05);
    h.runOver((x) => (x < 2 ? hit() : null));
    run(h, still, 1.5);
    assert.ok(s.x < 5.1, `to ${s.x}`);
  });

  test('into the water and the river has them, with a splash, and brings them up again, sore', () => {
    let splashes = 0;
    const up = [], world = field({ water: (x) => x > 5, level: () => 0, floorAt: (x) => (x > 5 ? -3 : 0), comeUp: (s) => ({ x: 6, z: s.z + 30, bank: [4, s.z + 30] }) });
    const h = createHorde(world, {}, { splash: () => splashes++, surfaced: (o) => up.push([o.sore > 0, o.homeward]) }), s = h.add(1, 0), n = h.all.length;
    run(h, away, .05);
    h.runOver((x) => (x < 2 ? hit({ seconds: 3 }) : null));
    run(h, away, 1);
    assert.equal(splashes, 1); assert.ok(s.under !== undefined);
    run(h, away, 3);
    assert.equal(h.all.length, n, 'not gone'); assert.ok(h.all.includes(s));
    run(h, away, TUNING.below[1] + 1);
    assert.deepEqual(up, [[true, true]]); assert.equal(s.under, undefined); assert.ok(s.z > 20, 'downstream');
  });

  test('someone who lives somewhere goes home to their door, and on with their day from there', () => {
    const h = createHorde(field()), door = [0, 0], s = h.add(1, 0, { home: { door, inside: [0, -2], nx: 0, nz: 1 } });
    run(h, away, .05); s.homeX = 1; s.homeZ = 0;
    h.runOver((x) => (x < 2 ? hit({ x: 14, z: 0, vx: 0, vz: 0, vy: 1, seconds: 2 }) : null));
    run(h, away, 6);
    assert.ok(s.homeward && s.x > 10, `at ${s.x}`);
    for (let t = 0; t < 90 && s.homeward; t += 1 / 30) h.update(1 / 30, away);
    assert.ok(Math.hypot(s.x - door[0], s.z - door[1]) < TUNING.homeIs + .5, `home at ${s.x}, ${s.z}`);
    assert.ok(s.timer >= TUNING.atHome[0] - 1, 'and the day goes on as it does, at the door, in the house or the yard');
  });

  test('someone holding him lets go, and with nobody left he\'s free', () => {
    let freed = 0;
    const h = createHorde(field(), {}, { free: () => freed++, grab() {} }), s = h.add(.3, 0);
    s.state = HUNTING;
    run(h, { ...still, y: 0 }, .4 + TUNING.windUp);
    assert.ok(h.grab, 'he\'s held');
    h.runOver(() => hit());
    assert.equal(h.grab, null); assert.equal(freed, 1);
  });
});
