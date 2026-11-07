// The world the town's people walk in, on the real map: its ground and water, what stops them, and where the river brings them up,
// what they can see, where they wander, who's burnt down, the buildings and where nobody goes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld } from './world.js';
import { TOWN_Y } from '../src/wet.js';
import { createRiver } from '../src/river.js';
import { burntDown, hipsOf } from '../src/agents.js';
import { insideRing } from '../src/structures.js';
import { KINDS } from '../src/vehicles.js';
import { HOME_ID } from './world.js';
import { GROUNDS, GROUNDS_OUT } from '../src/aside.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const data = { roads: json('../data/roads.json'), lanes: json('../data/lanes.json'), water: json('../data/water.json'), solids: json('../data/solids.json'), structures: json('../data/structures.json'), crowd: json('../data/crowd.json') };
const W = createWorld(data), river = createRiver(W.map.river);
const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} isn't within ${tol} of ${b}`);

// a straight stretch of the river away from everything but inside the map, and which way's across it
function quietRiver() {
  for (const line of W.map.river) for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1], [bx, bz] = line[i], len = Math.hypot(bx - ax, bz - az);
    if (len < 20) continue;
    const x = (ax + bx) / 2, z = (az + bz) / 2, nx = -(bz - az) / len, nz = (bx - ax) / len;
    if (Math.abs(z) < 300 && Math.abs(x) < 400) continue;
    let fine = true;
    for (let d = -60; d <= 60 && fine; d += 2) {
      const px = x + nx * d, pz = z + nz * d;
      if (!W.map.inBounds(px, pz) || W.map.roadGrid.nearest(px, pz) < 60 || W.map.railGrid.nearest(px, pz) < 60 || W.wet.pond(px, pz) || W.solids.stops(px, pz, W.floorAt(px, pz))) fine = false;
      else if (Math.abs(W.map.riverGrid.nearest(px, pz) - Math.abs(d)) > .5) fine = false;
    }
    if (fine) return { x, z, nx, nz };
  }
  throw new Error('no quiet stretch of river');
}
const r = quietRiver(), at = (d) => [r.x + r.nx * d, r.z + r.nz * d];

describe('the ground', () => {
  test('it\'s the water\'s, with the raised floors over it', () => {
    near(W.floorAt(...at(0)), -TOWN_Y - 3, 1e-9);
    assert.ok(W.water(...at(0)) && !W.water(...at(30)));
    near(W.level(...at(0)), -TOWN_Y, 1e-9);
    // over a trestle it's the trestle's deck, and dry
    const t = data.solids.floors.trestles[0], [cx, cz] = t.at;
    near(W.floorAt(cx, cz), t.top, 1e-9);
    assert.ok(!W.water(cx, cz));
  });

  test('a wall stops anyone, and a raised floor stops anyone below it who\'d have to climb more than 0.7 m', () => {
    const [id, b] = Object.entries(data.solids.buildings)[0], [, ax, az, bx, bz, top] = b.walls[0];
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    assert.ok(W.blocked(mx, mz, W.floorAt(mx, mz)), `building ${id}`);
    assert.ok(!W.blocked(mx, mz, top + 1), `building ${id}, over its top`);
    // down in the river, the bank's beside them but the town's out of reach
    assert.ok(W.blocked(...at(24), W.floorAt(...at(0))));
    assert.ok(!W.blocked(...at(.1), W.floorAt(...at(0))));
  });

  test('anyone in the river can wade out up its bank, a step at a time', () => {
    let [x, z] = at(0), y = W.floorAt(x, z), steps = 0;
    while (W.water(x, z) && steps < 400) {
      const nx = x + r.nx * .1, nz = z + r.nz * .1;
      assert.ok(!W.blocked(nx, nz, y), `stuck ${Math.hypot(nx - r.x, nz - r.z).toFixed(1)} m out`);
      x = nx; z = nz; y = W.floorAt(x, z); steps++;
    }
    assert.ok(!W.water(x, z), 'still in the river');
  });
});

describe('where the river brings them up', () => {
  test('down the river, on dry ground they can walk home from, and never in a pond', () => {
    const [x, z] = at(0), up = W.comeUp({ x, z }, { metres: 40, side: .3 });
    assert.ok(up, 'nowhere');
    assert.ok(W.water(up.x, up.z), 'they come up in the water');
    assert.ok(!W.water(...up.bank) && !W.blocked(...up.bank, W.floorAt(...up.bank)), 'onto a bank they can stand on');
    assert.ok(!W.wet.pond(up.x, up.z));
    // and downstream: further along the river than where they went under, which is how its lines run
    const went = river.near(x, z, {}), came = river.near(up.x, up.z, {});
    assert.ok(came.line > went.line || (came.line === went.line && came.s > went.s + 20), `from ${went.line}:${went.s.toFixed(0)} to ${came.line}:${came.s.toFixed(0)}`);
  });

  test('not inside anywhere they\'re kept out of', () => {
    const [x, z] = at(0), free = W.comeUp({ x, z }, { metres: 40, side: .3 });
    const [bx, bz] = free.bank, box = { on: (px, pz) => Math.abs(px - bx) < 30 && Math.abs(pz - bz) < 30 };
    const kept = createWorld({ ...data, keepOut: box.on }).comeUp({ x, z }, { metres: 40, side: .3 });
    assert.ok(kept, 'nowhere at all');
    assert.ok(!box.on(...kept.bank), 'brought up where nobody goes');
  });

  test('in a pond, on its own shore towards home', () => {
    const p = W.ponds.ponds.find((q) => !q.pool && q.area > 3000 && q.ring.every(([px, pz]) => W.map.riverGrid.nearest(px, pz) === Infinity));
    let mid = null;
    for (let i = 0; i <= 30 && !mid; i++) for (let j = 0; j <= 30 && !mid; j++) {
      const x = p.x0 + (p.x1 - p.x0) * i / 30, z = p.z0 + (p.z1 - p.z0) * j / 30;
      if (W.ponds.look(x, z) === p && W.ponds.d < -3) mid = [x, z];
    }
    const up = W.comeUp({ x: mid[0], z: mid[1] }, { home: [mid[0] + 500, mid[1]] });
    assert.ok(up, p.id);
    assert.ok(W.wet.pond(up.x, up.z), 'they come up in the pond they went into');
    assert.ok(!W.water(...up.bank), 'and onto its shore');
  });
});

// every 0.1 m from a to b, at y, whether nothing stops anyone
const clear = (a, b, y) => {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .1);
  for (let i = 0; i <= n; i++) if (W.stops(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n, y)) return false;
  return true;
};
// the walls, each with its middle and which way's out from it, on the town's flat ground: a building's as long as a room and well over
// anyone's head, or a fence anyone can see over
function* walls(low) {
  const all = low ? [...data.solids.fixed.walls, ...Object.values(data.solids.props).flatMap((p) => p.walls)] : Object.values(data.solids.buildings).flatMap((b) => b.walls.map(([, ...w]) => w));
  for (const [ax, az, bx, bz, top, r] of all) {
    const len = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (len < 3 || (low ? !(top > .8 && top < 1.6) : top < 2.5) || W.floorAt(mx, mz) !== 0) continue;
    yield { mx, mz, nx: -(bz - az) / len, nz: (bx - ax) / len, top, r };
  }
}

describe('what they can see', () => {
  const on = (d) => { const [x, z] = at(d); return { x, z, y: W.floorAt(x, z) }; };
  test('anyone across open ground, or the river', () => {
    assert.ok(W.sees(on(30), on(-30)));
  });

  test('nobody through a wall', () => {
    const w = walls().next().value, out = (d) => ({ x: w.mx + w.nx * d, z: w.mz + w.nz * d, y: 0 });
    assert.ok(!W.sees(out(5), out(-5)) && !W.sees(out(-5), out(5)));
  });

  test('but a wall he\'s standing against doesn\'t hide him from what\'s right in front of it', () => {
    for (const w of walls()) for (const k of [1, -1]) {
      const out = (d) => ({ x: w.mx + w.nx * k * d, z: w.mz + w.nz * k * d, y: 0 }), s = out(6), p = out(w.r + .25);
      if (!clear(s, out(w.r + 1.1), 1.5)) continue;
      assert.ok(W.stops(p.x, p.z, 1.5), 'he\'s right up against it');
      assert.ok(W.sees(s, p));
      return;
    }
    assert.fail('no wall to stand against');
  });

  test('nor anything lower than their heads', () => {
    for (const w of walls(true)) {
      const s = { x: w.mx + w.nx * 3, z: w.mz + w.nz * 3, y: 0 }, p = { x: w.mx - w.nx * 3, z: w.mz - w.nz * 3, y: 0 };
      if (!clear(s, p, 1.5)) continue;
      assert.ok(W.blocked(w.mx, w.mz, 0), 'it stops anyone walking through it');
      assert.ok(W.sees(s, p) && W.sees(p, s));
      return;
    }
    assert.fail('no fence to see over');
  });
});

describe('where they wander', () => {
  const road = W.map.roadById.get('us_80'), mid = W.map.along('us_80', road.length / 2), s = { x: mid.x, z: mid.z };
  test('on down whichever street they\'re nearest, 6 to 36 m along it and a few metres either side', () => {
    W.map.roadGrid.nearest(s.x, s.z);
    assert.equal(W.map.roadGrid.seg.owner.id, 'us_80');
    const from = W.map.sOn('us_80', s.x, s.z), went = [];
    for (let i = 0; i < 300; i++) {
      const [x, z] = W.wander(s), on = W.map.along('us_80', W.map.sOn('us_80', x, z));
      assert.ok(Math.hypot(x - on.x, z - on.z) <= 4 * Math.SQRT2 + .01, `${Math.hypot(x - on.x, z - on.z).toFixed(2)} m off the road`);
      went.push(W.map.sOn('us_80', x, z) - from);
    }
    const far = went.map(Math.abs);
    assert.ok(far.every((d) => d > 6 - 4 * Math.SQRT2 && d < 36 + 4 * Math.SQRT2), 'from 6 to 36 m along it');
    assert.ok(Math.min(...far) < 10 && Math.max(...far) > 32, 'all the way from one to the other');
    assert.ok(went.filter((d) => d > 0).length > 100 && went.filter((d) => d < 0).length > 100, 'either way');
  });

  test('and off the streets, somewhere within 10 m', () => {
    const [x, z] = at(40);
    assert.equal(W.map.roadGrid.nearest(x, z), Infinity);
    for (let i = 0; i < 100; i++) { const [tx, tz] = W.wander({ x, z }); assert.ok(Math.abs(tx - x) <= 10 && Math.abs(tz - z) <= 10); }
  });

  test('the same every time from the same start, which is the town\'s own and nobody else\'s', () => {
    const a = createWorld(data), b = createWorld(data), c = createWorld({ ...data, seed: 7 });
    const go = (w) => Array.from({ length: 20 }, () => w.wander(s));
    const ga = go(a);
    assert.deepEqual(ga, go(b));
    assert.notDeepEqual(ga, go(c));
  });
});

describe('who they are', () => {
  // someone far enough gone to have burnt down out past 3 km from the middle of town, and not in it
  const who = { calm: false, looks: { phase: .85 * 6.28 } }, [tx, tz] = W.map.fromTrue(0, 0), bridge = Math.hypot(...W.map.toGame(0, 0));
  test('more of them have burnt down the further out of town they came out, from the middle of town', () => {
    assert.ok(bridge > 9000, `Stuckey's Bridge is ${bridge} m out of town`);
    assert.ok(W.quiet({ x: tx, z: tz, who }), 'gone quiet in the middle of town');
    assert.ok(!W.quiet({ x: 0, z: 0, who }), 'burnt down out at Stuckey\'s Bridge');
    assert.equal(W.quiet({ x: 0, z: 0, who }), !burntDown(who, bridge));
  });

  test('and how far over they stand goes with it', () => {
    near(W.hips({ x: tx, z: tz, who }), hipsOf(who, 0), 1e-9);
    near(W.hips({ x: 0, z: 0, who }), hipsOf(who, bridge), 1e-9);
    assert.ok(W.hips({ x: 0, z: 0, who }) < W.hips({ x: tx, z: tz, who }), 'further over out there');
  });
});

describe('where nobody goes', () => {
  test('the compound on Pine Forest Rd\'s grounds, with a way out of them for anyone caught inside, on ground they can stand on', () => {
    const g = W.grounds, [ox, oz] = g.out, off = Math.max(g.x0 - ox, ox - g.x1, g.z0 - oz, oz - g.z1);
    assert.deepEqual([g.x0, g.z0, g.x1, g.z1], [...W.map.fromTrue(...GROUNDS.slice(0, 2)), ...W.map.fromTrue(...GROUNDS.slice(2))]);
    assert.deepEqual(g.out, W.map.fromTrue(...GROUNDS_OUT));
    assert.ok(!g.on(ox, oz) && off > 0 && off < 10, `${off} m off its edge`);
    assert.ok(!W.water(ox, oz) && !W.blocked(ox, oz, W.floorAt(ox, oz)));
  });

  test('the church on Church St, all round it, while it stands', () => {
    const c = W.church;
    assert.equal(W.houseAt(c.x, c.z)?.use, 'church');
    assert.equal(c.r, 28);
  });

  test('and the river never brings anyone up onto the grounds', () => {
    const g = W.grounds, near = (x, z) => x > g.x0 - 150 && x < g.x1 + 150 && z > g.z0 - 150 && z < g.z1 + 150;
    let tried = 0;
    for (const line of W.map.river) for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1], [bx, bz] = line[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 5);
      for (let k = 0; k < n; k++) {
        const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
        if (!near(x, z)) continue;
        for (const side of [.1, .5, .9]) { const up = W.comeUp({ x, z }, { metres: 40, side }); tried++; if (up) assert.ok(!g.on(...up.bank), `onto the grounds at ${up.bank}`); }
      }
    }
    assert.ok(tried > 30, `the river's only ${tried / 3} places along the grounds`);
  });

  test('nor past the end of the map, which is woods nobody walks', () => {
    assert.ok(!W.solids.stops(1e5, 1e5, 0) && W.stops(1e5, 1e5, 0) && W.blocked(1e5, 1e5, 0));
    assert.ok(!W.blocked(s0.x, s0.z, 0), 'and the middle of US 80 is somewhere');
  });
});

const s0 = W.map.along('us_80', W.map.roadById.get('us_80').length / 2);

describe('the buildings', () => {
  test('inside one is that one, and out on the road is nowhere', () => {
    let n = 0, same = 0;
    for (const s of W.structures) {
      let cx = 0, cz = 0; for (const [x, z] of s.pts) { cx += x / s.pts.length; cz += z / s.pts.length; }
      if (!insideRing(cx, cz, s.pts)) continue;
      const got = W.houseAt(cx, cz);
      assert.ok(got && insideRing(cx, cz, got.pts));
      n++; if (got === s) same++;
    }
    assert.ok(n > 1000 && same > n * .98, `${same} of ${n}`);
    assert.equal(W.houseAt(s0.x, s0.z), null);
  });
});

describe('the vehicles', () => {
  // one parked out on its own, with nothing else either side of it, and which way's across it
  const lone = W.parked.find((v) => { const ax = Math.cos(v.yaw), az = -Math.sin(v.yaw); return [3, -3].every((d) => !W.solids.stops(v.x + ax * d, v.z + az * d, 0)); });
  const across = (v, d) => [v.x + Math.cos(v.yaw) * d, v.z - Math.sin(v.yaw) * d];
  test('every one where the game parks it stops anyone, and not anyone over its roof', () => {
    assert.equal(W.parked.length, data.crowd.parked.length);
    for (const v of W.parked) assert.ok(W.stops(v.x, v.z, W.floorAt(v.x, v.z)) && W.blocked(v.x, v.z, W.floorAt(v.x, v.z)), `${v.kind} ${v.i}`);
    assert.ok(!W.stops(...across(lone, 3), 0), 'beside it');
    assert.ok(!W.stops(lone.x, lone.z, lone.y + 1.5), 'over it');
    assert.ok(W.stops(...across(lone, KINDS[lone.kind].width / 2 + .2), 0), 'right up against it');
  });

  test('wherever it\'s been left since, and nowhere while someone\'s in it', () => {
    const { i, x, z, yaw } = lone, [nx, nz] = across(lone, 8);
    W.park(i, nx, nz, yaw);
    assert.ok(!W.stops(x, z, 0) && W.stops(nx, nz, 0), 'left somewhere else');
    W.ride(i);
    assert.ok(!W.stops(x, z, 0) && !W.stops(nx, nz, 0), 'someone\'s in it');
    W.park(i, x, z, yaw);
    assert.ok(W.stops(x, z, 0) && !W.stops(nx, nz, 0), 'back where it was');
  });
});

describe('the people at home', () => {
  test('everyone the game has at home, numbered as it numbers them, in the houses it has them in', () => {
    assert.equal(W.homes.length, data.crowd.homes.length);
    W.homes.forEach((h, i) => { assert.equal(h.id, HOME_ID + i); assert.equal(h.s.id, data.crowd.homes[i]); });
  });

  test('each comes out of their own front door, a step out from it, facing out, on ground they can stand on', () => {
    let out = 0;
    for (const h of W.homes) {
      const d = W.doorOf(h);
      if (!d) continue;
      out++;
      assert.ok(!insideRing(...d.door, h.s.pts) && insideRing(...d.inside, h.s.pts), `${h.id}'s door`);
      const [ox, oz] = d.door, [ix, iz] = d.inside, len = Math.hypot(ox - ix, oz - iz);
      near((ox - ix) / len, d.nx, 1e-9); near((oz - iz) / len, d.nz, 1e-9);
      assert.ok(!W.blocked(ox, oz, 0) && !W.water(ox, oz), `${h.id} can stand at their door`);
    }
    assert.ok(out > W.homes.length * .9, `${out} of ${W.homes.length} have a door to come out of`);
  });
});

describe('the lights', () => {
  test('every light that draws them at night, with the props that put it out', () => {
    assert.equal(W.lights.length, data.crowd.lights.length);
    // a prop's key is its kind and where it stands, in tenths of a metre (src/wrecks.js)
    const at = (k) => { const [, x, z] = /^p\w+:(-?\d+):(-?\d+)/.exec(k) ?? []; return [x / 10, z / 10]; };
    for (const l of W.lights) assert.ok(l.r > 20 && l.k.length && l.k.every((k) => Math.hypot(at(k)[0] - l.x, at(k)[1] - l.z) < 12), JSON.stringify(l));
  });
});
