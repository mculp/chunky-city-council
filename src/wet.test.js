// The water in a town everyone shares, as src/wet.js has it, on the real map. Whether it's the game's own is tools/play-wet.mjs's, in the game.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMap } from './map.js';
import { buildWater } from './water.js';
import { TOWN_Y, channel, createWet } from './wet.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const map = buildMap(json('../data/roads.json'), { riverAtBridge: channel, lanes: json('../data/lanes.json') });
const ponds = buildWater(json('../data/water.json'), map);
const wet = createWet({ map, ponds });
const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} isn't within ${tol} of ${b}`);

// A stretch of the river with nothing else near it: a straight run, well off the opening, the Chunky River Bridge, every road and the
// tracks and any pond, with which way is across it
function quietRiver() {
  const wake = map.crossings.find((c) => c.road === 'griffis_fountain_rd' && c.with === 'river');
  for (const line of map.river) for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1], [bx, bz] = line[i], len = Math.hypot(bx - ax, bz - az);
    if (len < 20) continue;
    const x = (ax + bx) / 2, z = (az + bz) / 2, nx = -(bz - az) / len, nz = (bx - ax) / len;
    if (Math.abs(z) < 300 && Math.abs(x) < 400) continue;
    if (Math.hypot(x - wake.x, z - wake.z) < 150) continue;
    let fine = true;
    for (let d = -40; d <= 40 && fine; d += 2) {
      const px = x + nx * d, py = z + nz * d;
      if (map.roadGrid.nearest(px, py) < 45 || map.railGrid.nearest(px, py) < 30 || ponds.look(px, py)) fine = false;
      else if (Math.abs(map.riverGrid.nearest(px, py) - Math.abs(d)) > .5) fine = false;
    }
    if (fine) return { x, z, nx, nz };
  }
  throw new Error('no quiet stretch of river');
}

describe('the river', () => {
  const r = quietRiver(), at = (d) => [r.x + r.nx * d, r.z + r.nz * d];

  test('its surface is the town\'s height under the town, and its bed 3 m under that', () => {
    near(wet.level(...at(0)), -TOWN_Y, 1e-9);
    near(wet.floorAt(...at(0)), -TOWN_Y - 3, 1e-9);
    near(wet.depth(...at(0)), 3, 1e-9);
    assert.ok(!wet.pond(...at(0)));
  });

  test('it\'s wet to 16.5 m either side of its line, as the game cuts it', () => {
    for (const side of [1, -1]) {
      for (const d of [0, 8, 12, 16.3]) assert.ok(wet.water(...at(d * side)), `${d * side} m across`);
      for (const d of [16.7, 20, 24, 40]) assert.ok(!wet.water(...at(d * side)), `${d * side} m across`);
    }
  });

  test('its bank comes up to the town in steps anyone can climb, and the town\'s flat past it', () => {
    let was = wet.floorAt(...at(0)), most = 0;
    for (let d = .1; d <= 30; d += .1) {
      const f = wet.floorAt(...at(d));
      assert.ok(f >= was - 1e-9, `the bank goes down at ${d.toFixed(1)} m`);
      most = Math.max(most, f - was); was = f;
    }
    assert.ok(most < .2, `a step of ${most}`);
    for (const d of [24, 25, 30, 40]) assert.equal(wet.floorAt(...at(d)), 0, `${d} m across`);
  });

  test('a road keeps its bed across it, and the river either side of the road is still the river', () => {
    const crossings = map.crossings.filter((c) => c.with === 'river' && c.road !== 'stuckey_bridge_rd');
    assert.ok(crossings.length >= 5);
    for (const c of crossings) {
      assert.ok(!wet.water(c.x, c.z), `${c.road} at the river`);
      assert.ok(wet.floorAt(c.x, c.z) >= 0, `${c.road} at the river`);
    }
    // Stuckey's is a ruin by the time anyone's in town, with the river where its deck was
    assert.ok(wet.water(0, 0) && wet.water(0, 5) && !wet.water(30, 0));
    // the bridge on US 80 furthest from the opening, and 25 m down the river from it
    const c = map.crossings.filter((c) => c.road === 'us_80' && c.with === 'river').sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z))[0];
    map.riverGrid.nearest(c.x, c.z);
    const g = map.riverGrid.seg, k = Math.hypot(g.dx, g.dz);
    assert.ok(wet.water(c.x + g.dx / k * 25, c.z + g.dz / k * 25));
  });

  test('a raised floor over it is dry, and the river beside it isn\'t', () => {
    const [x, z] = at(0), deck = createWet({ map, ponds, raised: (px, pz) => (Math.abs(px - x) < 2 && Math.abs(pz - z) < 2 ? .4 : null) });
    near(deck.floorAt(x, z), .4, 1e-9);
    assert.ok(!deck.water(x, z));
    assert.ok(deck.water(x + 3, z));
  });

  test('at Stuckey\'s Bridge it\'s the opening scene\'s channel, and narrower at the Chunky River Bridge', () => {
    for (const z of [-60, 50]) {
      assert.ok(wet.water(channel(z) + 16.3, z) && wet.water(channel(z) - 16.3, z));
      assert.ok(!wet.water(channel(z) + 16.7, z) && !wet.water(channel(z) - 16.7, z));
    }
    // within 40 m of the Chunky River Bridge, it stops 7 m sooner, at 9.5 m from its line. Off its road and away from the bridge itself,
    // wherever's further than that is dry and wherever's nearer is wet.
    const wake = map.crossings.find((c) => c.road === 'griffis_fountain_rd' && c.with === 'river');
    let both = [0, 0];
    for (let i = 0; i < 4000; i++) {
      const x = wake.x - 40 + (i % 80), z = wake.z - 40 + Math.floor(i / 80) * 1.6, w = Math.hypot(x - wake.x, z - wake.z), d = map.riverGrid.nearest(x, z);
      if (w < 18 || w > 38 || Math.abs(d - 9.5) < .15 || d > 14 || map.roadGrid.nearest(x, z) < 14) continue;
      assert.equal(wet.water(x, z), d < 9.5, `${d.toFixed(2)} m from the river, ${w.toFixed(1)} m from the bridge`);
      both[d < 9.5 ? 0 : 1]++;
    }
    assert.ok(both[0] > 20 && both[1] > 20, `${both}`);
  });
});

describe('the ponds', () => {
  // A pond well away from the river and the roads, big enough to be wet in the middle, and a point in it so far in from its shore
  const quiet = ponds.ponds.filter((p) => !p.pool && p.area > 2000 && p.ring.every(([x, z]) => map.riverGrid.nearest(x, z) === Infinity && map.roadGrid.nearest(x, z) > 15 && map.railGrid.nearest(x, z) > 8));
  const inside = (p, deeper) => {
    for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) {
      const x = p.x0 + (p.x1 - p.x0) * i / 40, z = p.z0 + (p.z1 - p.z0) * j / 40;
      if (ponds.look(x, z) === p && ponds.d < -deeper) return [x, z];
    }
    return null;
  };
  // out from somewhere in a pond to where it's d metres from the shore, negative in the water
  const out = (p, [x, z], d) => {
    for (let k = 0; k < 4000; k++) { const px = x + k * .02, pz = z; if (ponds.look(px, pz) === p && Math.abs(ponds.d - d) < .02) return [px, pz]; if (ponds.look(px, pz) !== p) break; }
    return null;
  };

  test('every one stands where the game\'s would on flat ground: half a metre under the town, or lower by the river', () => {
    for (const p of ponds.ponds) {
      if (p.pool) continue;
      assert.ok(p.level - TOWN_Y <= -.5 + 1e-9, p.id);
    }
    assert.ok(quiet.length > 5, `${quiet.length} ponds away from everything`);
    for (const p of quiet) near(p.level - TOWN_Y, -.5, 1e-9, p.id);
  });

  test('one\'s wet from .8 m in from its shore, and dry from there out', () => {
    const p = quiet.find((p) => inside(p, 3)), mid = inside(p, 3);
    assert.ok(wet.water(...mid) && wet.pond(...mid));
    near(wet.level(...mid), -.5, 1e-9);
    const wetAt = out(p, mid, -1), dryAt = out(p, mid, -.6);
    assert.ok(wetAt && dryAt, p.id);
    assert.ok(wet.water(...wetAt), `${p.id} a metre in`);
    assert.ok(!wet.water(...dryAt), `${p.id} .6 m in`);
  });

  test('its bank goes down to its shore over 9 m, from the town to .3 m over the water', () => {
    const p = quiet.find((p) => inside(p, 3)), mid = inside(p, 3);
    const shore = out(p, mid, 0);
    assert.ok(shore);
    near(wet.floorAt(...shore), -.2, .02);
    // and out past it, where the pond's no longer the nearest water
    let [x, z] = shore, f = wet.floorAt(x, z);
    for (let k = 0; k < 600; k++) { x += .02; const g = wet.floorAt(x, z); assert.ok(g >= f - 1e-9, `${p.id} goes down again`); f = g; }
    assert.equal(f, 0);
  });

  test('a swimming pool is wet to its edge, 1.7 m deep, and stands 12 cm under the town', () => {
    const pools = ponds.ponds.filter((p) => p.pool);
    assert.equal(pools.length, 3);
    for (const p of pools) {
      near(p.level - TOWN_Y, -.12, 1e-9, p.id);
      const mid = inside(p, .2);
      assert.ok(mid, p.id);
      assert.ok(wet.water(...mid), p.id);
      near(wet.floorAt(...mid), -.12 - 1.7, 1e-9, p.id);
    }
  });
});

test('away from the water the town\'s ground is flat, and dry', () => {
  let looked = 0;
  for (let i = 0; i < 4000; i++) {
    const x = -12000 + (i * 7919) % 20000, z = -12000 + (i * 104729) % 20000;
    if (map.riverGrid.nearest(x, z) !== Infinity || ponds.look(x, z)) continue;
    looked++;
    assert.equal(wet.floorAt(x, z), 0, `${x}, ${z}`);
    assert.ok(!wet.water(x, z));
  }
  assert.ok(looked > 3000, `${looked}`);
});
