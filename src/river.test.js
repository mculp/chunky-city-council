// Following the river downstream, and where someone it's had comes up.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMap } from './map.js';
import { createRiver, surfacing, SURFACING } from './river.js';

const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} isn't within ${tol} of ${b}`);

describe('following it', () => {
  // two lines end to end with a gap of 10 m between them, and one by itself
  const river = createRiver([[[0, 0], [100, 0], [100, 100]], [[100, 110], [100, 300]], [[500, 500], [600, 500]]]);

  test('it knows how far along a line a place is, and which way the river runs there', () => {
    const p = river.near(40, 7);
    assert.equal(p.line, 0); near(p.s, 40, 1e-9); near(p.d, 7, 1e-9); near(p.x, 40, 1e-9); near(p.z, 0, 1e-9); near(p.tx, 1, 1e-9); near(p.tz, 0, 1e-9);
    const q = river.near(95, 60);
    assert.equal(q.line, 0); near(q.s, 160, 1e-9); near(q.tx, 0, 1e-9); near(q.tz, 1, 1e-9);
  });

  test('downstream is further along, round a bend', () => {
    const at = river.near(60, 3), on = river.walk(at, 90);
    near(on.x, 100, 1e-9); near(on.z, 50, 1e-9); assert.equal(on.end, false);
    const back = river.walk(at, -20);
    near(back.x, 40, 1e-9);
  });

  test('it carries on into the line that starts where one stops, and runs out at the last', () => {
    const at = river.near(100, 90), on = river.walk(at, 30);
    assert.equal(on.line, 1); near(on.z, 130, 1e-9);
    const far = river.walk(at, 1000);
    assert.equal(far.end, true); near(far.z, 300, 1e-9);
    const up = river.walk(river.near(0, 0), -50);
    assert.equal(up.end, true); near(up.x, 0, 1e-9);
    assert.equal(river.walk(river.near(550, 500), 1000).line, 2, 'and not onto one that isn\'t joined');
  });
});

// A straight river along z = 0 from x = 0 to 2000, 16 m either side of the middle in the water and 3 m deep in the middle, with a bank beyond that, in bounds to 120 m off
const water = (x, z) => Math.abs(z) < 16 && x > -50 && x < 2050;
const make = ({ fence = null, pool = null, bounds = 120 } = {}) => {
  const inPool = (x, z) => !!pool && Math.hypot(x - pool.x, z - pool.z) < pool.r;
  const world = {
    water: (x, z) => water(x, z) || inPool(x, z),
    pond: (x, z) => inPool(x, z),
    depth: (x, z) => (inPool(x, z) ? 1.5 : water(x, z) ? 3 * (1 - (z / 16) ** 2) : 0),
    floorAt: (x, z) => -world.depth(x, z),
    blocked: (x, z) => Math.abs(z) > bounds || (!!fence && Math.abs(z - fence.z) < .6 && x > fence.x0 && x < fence.x1),
  };
  return { world, river: createRiver([[[0, 0], [2000, 0]]]), comeUp: surfacing(createRiver([[[0, 0], [2000, 0]]]), world) };
};

describe('where they come up', () => {
  test('downstream, on the bank, up out of the water a little way from it', () => {
    const { world, comeUp } = make(), at = comeUp({ x: 300, z: 2 }, { metres: 50, side: .2, home: [0, -200] });
    near(at.x, 350, 1.5);
    assert.ok(world.water(at.x, at.z), 'they come up in the water');
    assert.ok(world.depth(at.x, at.z) >= SURFACING.deep, `${world.depth(at.x, at.z)} m deep`);
    assert.ok(!world.water(...at.bank) && !world.blocked(...at.bank, 0), 'and the bank is dry land');
    assert.ok(Math.hypot(at.bank[0] - at.x, at.bank[1] - at.z) < 5, 'not far from the water');
  });

  test('on the bank towards home, and by their number when home\'s no help', () => {
    const { comeUp } = make();
    assert.ok(comeUp({ x: 300, z: 0 }, { metres: 40, home: [300, 500] }).bank[1] > 16, 'home\'s to the south');
    assert.ok(comeUp({ x: 300, z: 0 }, { metres: 40, home: [300, -500] }).bank[1] < -16, 'home\'s to the north');
    assert.ok(comeUp({ x: 300, z: 0 }, { metres: 40, side: .1, home: [300, 1] }).bank[1] > 16);
    assert.ok(comeUp({ x: 300, z: 0 }, { metres: 40, side: .9, home: [300, 1] }).bank[1] < -16);
  });

  test('the same every time for the same person', () => {
    const { comeUp } = make(), a = comeUp({ x: 300, z: 2 }, { metres: 50, side: .3, home: [0, 90] });
    assert.deepEqual(comeUp({ x: 300, z: 2 }, { metres: 50, side: .3, home: [0, 90] }), a);
  });

  test('not on the far side of a fence: a bank with one right behind it is passed over for the other', () => {
    const { comeUp } = make({ fence: { z: 24, x0: 100, x1: 1900 } }), at = comeUp({ x: 300, z: 0 }, { metres: 50, home: [350, 300] });
    assert.ok(at.bank[1] < -16, 'home is on the fence\'s side, but they come up on the other');
    // and where the fence stops there's room
    const free = comeUp({ x: 1950, z: 0 }, { metres: 10, home: [1960, 300] });
    assert.ok(free.bank[1] > 16);
  });

  test('not in a pond: the river doesn\'t bring them up in one or take them across one', () => {
    const { world, comeUp } = make({ pool: { x: 350, z: 24, r: 14 } }), at = comeUp({ x: 300, z: 0 }, { metres: 50, home: [350, 300] });
    assert.ok(at.bank[1] < -16, 'the south bank has a pond beside it');
    assert.ok(!world.pond(at.x, at.z) && !world.pond(...at.bank) && !world.water(...at.bank));
  });

  test('swept as far as the river goes, and no further, and never out of bounds', () => {
    const { world, comeUp } = make(), at = comeUp({ x: 1950, z: 0 }, { metres: 500, home: [1900, 90] });
    assert.ok(at.x > 1950 - 1 && at.x < 2050, `${at.x}`);
    assert.ok(!world.blocked(...at.bank, 0));
    const short = make({ bounds: 30 }), tight = short.comeUp({ x: 300, z: 0 }, { metres: 50, home: [300, 500] });
    assert.ok(Math.abs(tight.bank[1]) < 30, 'the bank is inside the map');
  });

  test('a pond or a pool has no downstream: they come up on the shore towards home', () => {
    const { world, comeUp } = make({ pool: { x: 1000, z: 60, r: 12 } }), at = comeUp({ x: 1000, z: 60 }, { metres: 50, home: [1100, 60] });
    assert.ok(at.bank[0] > 1012 && Math.abs(at.bank[1] - 60) < 12, `${at.bank}`);
    assert.ok(!world.water(...at.bank));
  });

  test('and nothing, if there is nowhere to stand', () => {
    const world = { water: () => true, pond: () => false, depth: () => 3, floorAt: () => -3, blocked: () => false };
    assert.equal(surfacing(createRiver([[[0, 0], [100, 0]]]), world)({ x: 50, z: 0 }, { metres: 20 }), null);
  });
});

describe('the Chunky River as the game has it', () => {
  const map = buildMap(JSON.parse(readFileSync(new URL('../data/roads.json', import.meta.url))));
  const river = createRiver(map.river);
  // the water is 16 m either side of the middle, as the ground is cut, and the map ends 280 m from a road or the tracks
  const world = {
    water: (x, z) => map.riverGrid.nearest(x, z) < 16.5,
    pond: () => false,
    depth: (x, z) => Math.max(0, 3 - map.riverGrid.nearest(x, z) * .19),
    floorAt: (x, z) => -Math.max(0, 3 - map.riverGrid.nearest(x, z) * .19),
    blocked: (x, z) => !map.inBounds(x, z),
  };
  const comeUp = surfacing(river, world);
  // how far down the whole river a place is
  const total = (p) => { let s = p.s; for (let k = river.lines[p.line].prev; k >= 0; k = river.lines[k].prev) s += river.lines[k].length; return s; };

  test('it runs from the north-west to the south-east, which is the way the data runs: the Chunky River goes down to the Chickasawhay', () => {
    const [first] = river.lines.filter((l) => l.length > 5000), last = river.lines.at(-1);
    const start = first.pts[0], end = last.pts.at(-1);
    assert.ok(end[0] - start[0] > 5000 && end[1] - start[1] > 5000, `from ${start} to ${end}`);
    // the two long lines are one river, and the stub at the head of the first isn't joined to it
    assert.equal(river.lines.filter((l) => l.next >= 0).length, 1);
  });

  test('anyone it has comes up downstream of where they went in, on dry land inside the map, wherever along it that is', () => {
    const long = river.lines.filter((l) => l.length > 5000);
    let tried = 0, full = 0, lost = 0, deeper = 0;
    for (const [k, l] of river.lines.entries()) {
      if (l.length < 5000) continue;
      for (let s = 150; s < l.length - 150; s += 53) {
        const p = river.point(k, s), side = (tried % 2) * 2 - 1, x = p.x - p.tz * 3 * side, z = p.z + p.tx * 3 * side;
        // nobody's out where there isn't any map
        if (!world.water(x, z) || world.blocked(x, z)) continue;
        // on the home side, or whichever, from a few places round
        const home = [p.x - p.tz * 400 * side, p.z + p.tx * 400 * side], metres = 35 + (tried % 4) * 9;
        const at = comeUp({ x, z }, { metres, side: (tried % 7) / 7, home });
        tried++;
        // right at the edge of the map there can be nowhere, and nobody's there
        if (!at) { lost++; continue; }
        const from = river.near(x, z), to = river.near(at.x, at.z);
        // measured from the middle of the river to somewhere 14 m off it, round a bend, so a few metres either way, and less if the bank it wanted was off the map
        const swept = total(to) - total(from);
        assert.ok(swept > -8 && swept < metres + 8, `${swept} m downstream when it was ${metres}`);
        if (swept > metres - 8) full++;
        assert.ok(!world.water(...at.bank) && !world.blocked(...at.bank), 'the bank is dry and in bounds');
        assert.ok(world.water(at.x, at.z) && !world.blocked(at.x, at.z), 'and they come up in the water, inside the map');
        if (world.depth(at.x, at.z) >= SURFACING.deep) deeper++;
      }
    }
    assert.ok(tried > 100, `only ${tried} places tried`);
    assert.ok(lost <= 2, `${lost} places with nowhere to come up`);
    assert.ok(deeper > tried * .9, `${deeper} of ${tried} came up out of deep water`);
    assert.ok(full > tried * .7, `${full} of ${tried} came up where the current took them`);
    assert.ok(long.length >= 2);
  });

  test('it sets them down towards home when home is across from the river', () => {
    const l = river.lines[1], p = river.point(1, 4000), home = [p.x - p.tz * 300, p.z + p.tx * 300], at = comeUp({ x: p.x, z: p.z }, { metres: 50, home });
    const out = (at.bank[0] - p.x) * -p.tz + (at.bank[1] - p.z) * p.tx;
    assert.ok(out > 0, `${out}`);
    assert.ok(l.length > 5000);
  });
});
