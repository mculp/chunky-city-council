// The town's people, run by the town everyone shares (CHUNKY-153b): out on the streets and at their homes near whoever's in town, put
// back once nobody's near and out again just as they were, coming for players, and each grab and everything else that happens told for
// whoever it's about. The trains to the town's clock, in the way and throwing anyone on the tracks clear, and what's broken, as the town
// keeps it. None of it hangs on one run of random numbers: it's what happens, not who it happens to first.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld } from './world.js';
import { createCrowd, STREETS, HOME_SEE, HOME_PUT } from './crowd.js';
import { TIMETABLE } from '../src/trains.js';
import { partsOf } from '../src/damage.js';
import { keyOf, encodeParts } from '../src/wrecks.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const data = { roads: json('../data/roads.json'), lanes: json('../data/lanes.json'), water: json('../data/water.json'), solids: json('../data/solids.json'), structures: json('../data/structures.json'), crowd: json('../data/crowd.json'), railroad: json('../data/railroad.json') };
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

describe('the trains', () => {
  // the railroad where it's nearest the middle of town, with open ground either side of it, and which way's across it
  function track(world, crowd) {
    const line = crowd.trains.line, { s } = line.nearest(...at(world, ...MID)), A = line.at(s);
    return { s, x: A.x, z: A.z, ax: A.tz, az: -A.tx };
  }
  // the town's clock when a freight coming down the line at full speed has its nose so far short of s
  function freightShort(crowd, s, short) {
    for (let now = TIMETABLE.epoch - TIMETABLE.every; now < TIMETABLE.epoch + TIMETABLE.every; now += .05) {
      const w = crowd.trains.plan.where(1, now);
      if (w && w.speed > 20 && w.head > s && w.head - s <= short) return now;
    }
    throw new Error('no freight comes by');
  }
  const thrown = (got, s) => got.some((e) => e.t === 'thrown' && e.id === s.who.id), going = (tr) => tr.speed >= 1;

  test('there are none without the town\'s clock, which is all they run to', () => {
    const { world, crowd } = town(), P = player('a', at(world, ...MID));
    run(crowd, 1, [P]);
    assert.equal(crowd.trains.trains.length, 0);
    crowd.step(.1, [P], TIMETABLE.epoch + 60);
    assert.ok(crowd.trains.trains.some((tr) => tr.local && tr.standing), 'the local standing on the siding');
  });

  test('one that\'s going throws anyone on the tracks clear of them, and they lie there longer than anything else keeps anyone down', () => {
    const { world, crowd } = town(), T = track(world, crowd), P = player('a', [T.x + T.ax * 120, T.z + T.az * 120]);
    let now = freightShort(crowd, T.s, 25);
    crowd.step(.1, [P], now);
    const s = crowd.horde.add(T.x, T.z), got = [];
    for (let i = 0; i < 40 && !thrown(got, s); i++) got.push(...crowd.step(.1, [P], now += .1));
    assert.ok(thrown(got, s), 'never thrown');
    for (let i = 0; i < 50 && s.thrown; i++) crowd.step(.1, [P], now += .1);
    assert.ok(!s.thrown, 'still in the air');
    const off = crowd.trains.line.nearest(s.x, s.z).d;
    assert.ok(off > 3, `${off.toFixed(1)} m from the tracks`);
    assert.ok(crowd.horde.down(s) > 20, `down for ${crowd.horde.down(s).toFixed(1)} s`);
  });

  test('the local standing on the siding is in everyone\'s way and hides whoever\'s behind it, and throws nobody', () => {
    const { world, crowd } = town();
    let now = TIMETABLE.epoch + 60;
    crowd.step(.1, [player('a', at(world, ...MID))], now);
    const c = crowd.trains.trains.find((tr) => tr.local && tr.standing).cars[2], ax = c.fz, az = -c.fx;
    assert.ok(crowd.blocked(c.x, c.z, 0) && crowd.blocked(c.x, c.z, 0, true), 'in the way, of anyone thrown into it too');
    const a = { x: c.x + ax * 6, z: c.z + az * 6, y: 0 }, b = { x: c.x - ax * 6, z: c.z - az * 6, y: 0 };
    assert.ok(world.sees(a, b) && !crowd.sees(a, b), 'hiding them');
    assert.ok(crowd.sees({ ...a, y: -4 }, { ...b, y: -4 }), 'though not anyone below it, as under a trestle');
    // right up against it, with someone near enough that the crowd's about there, out of their sight, and the freight going by
    const P = player('a', [c.x + ax * 60, c.z + az * 60]), s = crowd.horde.add(c.x + ax * (c.half + .25), c.z + az * (c.half + .25)), got = [];
    for (let i = 0; i < 30; i++) got.push(...crowd.step(.1, [P], now += .1));
    assert.ok(crowd.trains.trains.some((tr) => !tr.local && going(tr)), 'nothing going by');
    assert.ok(!thrown(got, s));
  });
});

describe('what\'s broken', () => {
  const prop = (k, x, z) => ({ k, x, z, d: 0 });

  test('a light\'s out while any prop that puts it out is broken, and lit again once they\'re all healed', () => {
    const { world, crowd } = town(), lit = (l) => crowd.horde.lights.includes(l);
    const cinema = world.lights.find((l) => l.k.length === 2), gas = world.lights.find((l) => l.k[0].startsWith('pcanopy')), [screen, projector] = cinema.k;
    assert.ok(world.lights.every(lit));
    crowd.wreck(prop(gas.k[0], gas.x, gas.z));
    assert.ok(!lit(gas) && lit(cinema));
    crowd.wreck(prop(screen, cinema.x, cinema.z)); crowd.wreck(prop(projector, cinema.x, cinema.z));
    crowd.heal(screen);
    assert.ok(!lit(cinema), 'with the projector still broken');
    crowd.heal(projector); crowd.heal(gas.k[0]);
    assert.ok(world.lights.every(lit));
  });

  test('what\'s built stops nobody where it\'s come down, and does again once it\'s healed', () => {
    const { world, crowd } = town(), k = world.lights.find((l) => l.k[0].startsWith('pbarrel')).k[0], [x, z] = k.split(':').slice(1).map((n) => +n / 10);
    assert.ok(crowd.blocked(x, z, 0));
    crowd.wreck(prop(k, x, z));
    assert.ok(!crowd.blocked(x, z, 0));
    crowd.heal(k);
    assert.ok(crowd.blocked(x, z, 0));
  });

  test('the church on Church St is no refuge once more than .4 of its walls are down, whatever else is, and is again once it\'s healed', () => {
    const { world, crowd } = town(), s = world.churchHouse, { parts, walls } = partsOf(s), k = keyOf.building(s.id);
    const down = (list) => ({ k, x: world.church.x, z: world.church.z, n: parts.length, p: encodeParts(list.map((q) => ({ part: q.part, gone: true, cracked: false, burning: false, dir: 0, hp: 0, shade: 255 }))) });
    const refuge = () => crowd.horde.inSanctuary(world.church.x, world.church.z), most = Math.floor(walls.length * .4);
    assert.ok(walls.length >= 10 && refuge());
    crowd.wreck(down([...parts.filter((q) => !walls.includes(q)), ...walls.slice(0, most)]));
    assert.ok(refuge(), 'with everything but its walls down, and .4 of them');
    crowd.wreck(down(walls.slice(0, most + 1)));
    assert.ok(!refuge(), 'with more than .4 of its walls down');
    crowd.heal(k);
    assert.ok(refuge(), 'healed');
  });

  test('a vehicle that\'s been sent somewhere lies there, and it\'s back where it was parked once it\'s healed, unless someone\'s in it', () => {
    const { world, crowd } = town(), open = (x, z) => !world.blocked(x, z, 0) && !world.water(x, z) && !world.solids.stops(x + 3, z, 0);
    const [v, u] = world.parked.filter((q) => open(q.x + 30, q.z) && open(q.x + 60, q.z));
    const home = [v.x, v.z], there = [v.x + 30, v.z];
    crowd.wreck({ k: `v${v.i}`, x: there[0], z: there[1], y: 0, yaw: 1, h: 0, f: 2 });
    assert.ok(world.stops(...there, 0) && !world.stops(...home, 0), 'where it was sent');
    crowd.heal(`v${v.i}`);
    assert.ok(world.stops(...home, 0) && !world.stops(...there, 0), 'back where it was parked');
    const P = player('a', [u.x + 30, u.z], { ride: u.i + 1, yaw: u.yaw, driving: true });
    crowd.step(.1, [P]);
    crowd.wreck({ k: `v${u.i}`, x: u.x + 60, z: u.z, y: 0, yaw: 0, h: 0, f: 1 });
    assert.ok(!world.stops(u.x + 60, u.z, 0) && crowd.blocked(P.x, P.z, 0), 'where whoever\'s in it has it');
    crowd.heal(`v${u.i}`);
    assert.ok(!world.stops(u.x, u.z, 0) && crowd.blocked(P.x, P.z, 0), 'and not back where it was parked either');
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
