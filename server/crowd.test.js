// The town's people, run by the town everyone shares (CHUNKY-153b): out on the streets and at their homes near whoever's in town, put
// back once nobody's near and out again just as they were, coming for players, and each grab and everything else that happens told for
// whoever it's about. None of it hangs on one run of random numbers: it's what happens, not who it happens to first.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld } from './world.js';
import { createCrowd, STREETS, HOME_SEE, HOME_PUT } from './crowd.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const data = { roads: json('../data/roads.json'), lanes: json('../data/lanes.json'), water: json('../data/water.json'), solids: json('../data/solids.json'), structures: json('../data/structures.json'), crowd: json('../data/crowd.json') };
const folks = json('../data/folks.json'), looks = json('../data/looks.json').crowd;
// a world each, since a crowd parks and drives its vehicles and takes its random numbers
const town = () => { const world = createWorld(data); return { world, crowd: createCrowd(world, { folks, looks }) }; };
const at = (world, x, z) => world.map.fromTrue(x, z);
const player = (id, [x, z], more = {}) => ({ id, x, z, y: 0, yaw: 0, canGrab: true, noise: 0, beans: 0, night: 1, hidden: false, driving: false, acting: false, ...more });
// every tenth of a second for so long, with everything that happened
function run(crowd, seconds, players) { const out = []; for (let t = 0; t < seconds - 1e-9; t += .1) out.push(...crowd.step(.1, players)); return out; }
const street = (s) => !s.home && !s.who.calm;
const MID = [-215, -9];

describe('the street crowd', () => {
  test('nobody\'s out until somebody\'s in town', () => {
    const { crowd } = town();
    assert.deepEqual(run(crowd, 2, []), []);
    assert.equal(crowd.horde.all.length, 0);
  });

  test('and then it\'s out along the streets the game puts it on, thickest on US 80, and not on top of anyone', () => {
    const { world, crowd } = town(), P = player('a', at(world, ...MID));
    crowd.step(.1, [P]);
    const out = crowd.horde.all.filter(street);
    assert.equal(out.length, STREETS.reduce((n, s) => n + s[3], 0));
    // within the 5 m either way of a street that they're put out at, somewhere between its ends
    const on = ([id, a, b]) => {
      const s0 = world.map.sOn(id, ...at(world, ...a)), s1 = world.map.sOn(id, ...at(world, ...b)), lo = Math.min(s0, s1) - 8, hi = Math.max(s0, s1) + 8;
      return (s) => { const along = world.map.sOn(id, s.homeX, s.homeZ), p = world.map.along(id, along); return Math.hypot(s.homeX - p.x, s.homeZ - p.z) <= 5 * Math.SQRT2 + .01 && along >= lo && along <= hi; };
    };
    for (const st of STREETS) assert.ok(out.filter(on(st)).length >= st[3], `${out.filter(on(st)).length} on ${st[0]}`);
    for (const s of out) {
      assert.ok(STREETS.some((st) => on(st)(s)), 'on a street');
      assert.ok(Math.hypot(s.homeX - P.x, s.homeZ - P.z) >= 35, 'not on top of anyone');
      assert.ok(!world.water(s.homeX, s.homeZ) && !world.blocked(s.homeX, s.homeZ, world.floorAt(s.homeX, s.homeZ)), 'on open dry ground');
      assert.ok(!world.houseAt(s.homeX, s.homeZ) && !crowd.horde.inSanctuary(s.homeX, s.homeZ), 'nowhere they don\'t go');
    }
  });

  test('only the once, however many come and go', () => {
    const { world, crowd } = town(), A = player('a', at(world, ...MID)), B = player('b', at(world, -700, -300));
    crowd.step(.1, [A]);
    const n = crowd.horde.all.filter(street).length;
    run(crowd, 1, [A, B]); run(crowd, 1, []); run(crowd, 1, [B]);
    assert.equal(crowd.horde.all.filter(street).length, n);
  });
});

describe('the people at home', () => {
  // somewhere with a few houses round it that have someone at home
  function among(world) {
    let best = null, most = 0;
    for (const h of world.homes) {
      const [x, z] = h.s.pts[0], n = world.homes.filter((o) => Math.hypot(o.s.pts[0][0] - x, o.s.pts[0][1] - z) <= HOME_SEE && world.doorOf(o)).length;
      if (n > most && Math.hypot(...world.map.toGame(x, z)) > 600) { most = n; best = [x, z]; }
    }
    return best;
  }
  const homesNear = (world, [x, z]) => world.homes.filter((h) => Math.hypot(h.s.pts[0][0] - x, h.s.pts[0][1] - z) <= HOME_SEE && world.doorOf(h));

  test('come out of their own front doors once anyone\'s within 190 m of their house, some out in the yard already', () => {
    const { world, crowd } = town(), spot = among(world), P = player('a', spot);
    crowd.step(.1, [P]);
    const near = homesNear(world, spot);
    assert.ok(near.length >= 6, `only ${near.length} round there`);
    let yard = 0;
    for (const h of near) {
      const s = crowd.horde.all.find((q) => q.who.id === h.id), d = world.doorOf(h);
      assert.ok(s, `nobody out of ${h.id}`);
      assert.deepEqual(s.home, d);
      assert.ok(s.who.calm && s.homeX === d.door[0] && s.homeZ === d.door[1], 'from their door');
      const off = Math.hypot(s.x - d.door[0], s.z - d.door[1]);
      assert.ok(off < 8, `${off.toFixed(1)} m from their door`);
      if (off > 1.5) yard++;
    }
    assert.ok(yard > 0 && yard < near.length, `${yard} of ${near.length} in the yard`);
    // and nobody further off
    for (const s of crowd.horde.all.filter((q) => q.home)) assert.ok(Math.hypot(s.homeX - P.x, s.homeZ - P.z) < HOME_SEE + 40);
  });

  test('are put back once nobody\'s within 300 m, and come out again just as they were', () => {
    const { world, crowd } = town(), spot = among(world), P = player('a', spot);
    run(crowd, 3, [P]);
    const was = crowd.horde.all.filter((s) => s.home).map((s) => ({ s, who: s.who, state: s.state }));
    assert.ok(was.length >= 6);
    const away = player('a', [spot[0] + HOME_PUT + 900, spot[1]]);
    run(crowd, 1.2, [away]);
    for (const w of was) assert.ok(!crowd.horde.all.includes(w.s), `${w.who.id} still out with nobody near`);
    const where = was.map((w) => [w.s.x, w.s.z]);
    // they're back as soon as anyone's near again, the same bodies where they were put back, the same people in the same state
    let back = false;
    for (let i = 0; i < 12 && !back; i++) { crowd.step(.1, [P]); back = was.every((w) => crowd.horde.all.includes(w.s)); }
    assert.ok(back, 'not back');
    was.forEach((w, i) => {
      assert.ok(Math.hypot(w.s.x - where[i][0], w.s.z - where[i][1]) < .3, `${w.who.id} moved while put back`);
      assert.equal(w.s.who, w.who); assert.equal(w.s.state, w.state);
    });
  });
});

describe('coming for whoever\'s in town', () => {
  // one of the street crowd who's burnt down, with open ground in front of them to come across, and someone walking about there
  function setUp() {
    const { world, crowd } = town(), first = player('a', at(world, ...MID));
    crowd.step(.1, [first]);
    for (const s of crowd.horde.all.filter((q) => street(q) && !q.quiet)) {
      for (const a of [0, 1.57, 3.14, 4.71]) {
        const x = s.x + Math.sin(a) * 4, z = s.z + Math.cos(a) * 4, P = player('a', [x, z], { noise: 10 });
        if (crowd.horde.all.some((o) => o !== s && Math.hypot(o.x - x, o.z - z) < 12)) continue;
        if (world.blocked(x, z, 0) || world.water(x, z) || !world.sees({ ...s, y: 0 }, P)) continue;
        return { world, crowd, s, P };
      }
    }
    throw new Error('nobody burnt down out in the open');
  }

  test('one who\'s burnt down stops and turns to them, reaches for them and gets hold, and lets go once they\'ve fought free, all of it told for them', () => {
    const { crowd, s, P } = setUp(), got = [];
    for (let i = 0; i < 300 && !got.some((e) => e.t === 'grab'); i++) got.push(...crowd.step(.1, [P]));
    const grab = got.find((e) => e.t === 'grab');
    assert.ok(grab, `nobody got hold of them: ${JSON.stringify(got.slice(0, 6))}`);
    assert.equal(grab.pid, 'a');
    assert.ok(grab.ids.length >= 1 && Number.isFinite(grab.at));
    const by = grab.ids[0];
    assert.ok(got.some((e) => e.t === 'roused' && e.id === by), 'stopped and turned to them first');
    assert.ok(got.findIndex((e) => e.t === 'reaching' && e.id === by) < got.indexOf(grab), 'reached for them first');
    assert.ok(crowd.horde.all.some((q) => q.who.id === by && q === s) || by !== s.who.id, 'by whoever it was');
    let free = null;
    for (let i = 0; i < 100 && !free; i++) { crowd.mash('a'); free = crowd.step(.1, [P]).find((e) => e.t === 'free'); }
    assert.equal(free?.pid, 'a');
  });

  test('and with two in town, it\'s told for the one it\'s about', () => {
    // the one they come for is the second in town, and the first is a long way off
    const { world, crowd, P } = setUp(), near = { ...P, id: 'b' }, far = player('a', at(world, -2400, -1400));
    const got = [];
    for (let i = 0; i < 300 && !got.some((e) => e.t === 'grab'); i++) got.push(...crowd.step(.1, [far, near]));
    const grabs = got.filter((e) => e.t === 'grab');
    assert.ok(grabs.length && grabs.every((g) => g.pid === 'b'), JSON.stringify(grabs));
    assert.ok(!got.some((e) => e.pid === 'a'));
    let free = null;
    for (let i = 0; i < 100 && !free; i++) { crowd.mash('b'); free = crowd.step(.1, [far, near]).find((e) => e.t === 'free'); }
    assert.equal(free?.pid, 'b');
  });
});

describe('the vehicles', () => {
  test('one someone\'s driving is where they are and not where it was parked, and stays where they leave it', () => {
    const { world, crowd } = town();
    const v = world.parked.find((q) => !world.solids.stops(q.x + 30, q.z, 0) && !world.blocked(q.x + 30, q.z, 0) && !world.water(q.x + 30, q.z) && !world.solids.stops(q.x + 33, q.z, 0));
    const [x0, z0] = [v.x, v.z], driving = player('a', [v.x + 30, v.z], { ride: v.i + 1, yaw: v.yaw, driving: true });
    crowd.step(.1, [driving]);
    assert.ok(!world.stops(x0, z0, 0), 'parked nowhere while someone\'s in it');
    assert.ok(crowd.blocked(driving.x, driving.z, 0), 'in the way where it\'s being driven');
    assert.ok(!crowd.blocked(driving.x, driving.z, 0, true), 'but not to anyone thrown over it');
    crowd.step(.1, [player('a', [driving.x + 3, driving.z])]);
    assert.ok(world.stops(driving.x, driving.z, 0) && !world.stops(x0, z0, 0), 'left where they got out');
  });
});

describe('what happens to them', () => {
  test('anything that happens to one of them is told with who it happened to', () => {
    const { world, crowd } = town(), P = player('a', at(world, ...MID));
    crowd.step(.1, [P]);
    const s = crowd.horde.all.find(street);
    crowd.horde.on.splash(s); crowd.horde.on.surfaced(s); crowd.horde.on.bounce(s, 4);
    const got = crowd.step(.1, [P]);
    for (const t of ['splash', 'surfaced']) assert.ok(got.some((e) => e.t === t && e.id === s.who.id), t);
    assert.ok(got.some((e) => e.t === 'bounce' && e.id === s.who.id && e.speed === 4));
  });
});
