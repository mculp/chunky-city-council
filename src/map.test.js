// The world frame the game builds from data/roads.json.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMap, compressX, SegGrid } from './map.js';

const data = JSON.parse(readFileSync(new URL('../data/roads.json', import.meta.url)));
const sine = (z) => 3.5 * Math.sin(z * .035);
const map = buildMap(data, { riverAtBridge: sine });
const near = (a, b, tol = .01, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} isn't within ${tol} of ${b}`);

describe('the world frame', () => {
  test('Stuckey\'s Bridge is the origin', () => {
    const c = map.crossings.find((x) => x.road === 'us_80' && x.with === 'river');
    near(c.x, 0); near(c.z, 0);
  });

  test('US 80 runs dead straight from its west end to the edge of town', () => {
    const us80 = map.roadById.get('us_80');
    const [edgeX] = map.toWorld(map.leanEnd, 0);
    for (const [x, z] of us80.pts) if (x <= edgeX) near(z, 0, .002, `at x ${x}`);
  });

  test('east of the edge of town it keeps true distances', () => {
    const adams = map.nodes.find((n) => n.id === 'n2'), church = map.nodes.find((n) => n.id === 'n5');
    const a = data.nodes.find((n) => n.id === 'n2'), c = data.nodes.find((n) => n.id === 'n5');
    near(Math.hypot(adams.x - church.x, adams.z - church.z), Math.hypot(a.x - c.x, a.z - c.z), .002);
    near(adams.x - a.x, map.nodes.find((n) => n.id === 'n3').x - data.nodes.find((n) => n.id === 'n3').x, .002, 'one shift');
  });

  test('world x keeps the map\'s order, so nothing crosses that didn\'t', () => {
    let last = -Infinity;
    for (const r of [...data.reference.river.lines, ...data.reference.railroad.lines]) for (const [x, z] of r.points) { const [wx] = map.toWorld(x, z); assert.equal(wx, x - map.bridge.x); last = wx; }
    assert.ok(Number.isFinite(last));
  });

  test('toGame undoes toWorld', () => {
    for (const [x, z] of [[-1000, 100], [-720, -30], [-400, 80], [5000, 2000]]) {
      const [gx, gz] = map.toGame(...map.toWorld(x, z));
      near(gx, x, 1e-9); near(gz, z, 1e-9);
    }
  });

  test('fromLonLat agrees with the file at every node', () => {
    for (const n of data.nodes) {
      const [x, z] = map.fromLonLat(n.lon, n.lat), w = map.toWorld(n.x, n.z);
      near(x, w[0], .002, n.id); near(z, w[1], .002, n.id);
    }
  });

  test('compressX matches every written band edge', () => {
    for (const b of data.compression) {
      near(compressX(b.trueFrom, data.compression), b.gameFrom, 1e-6);
      near(compressX(b.trueTo, data.compression), b.gameTo, 1e-6);
    }
    assert.equal(compressX(0, data.compression), 0);
  });
});

describe('the river at the bridge', () => {
  test('it follows the opening scene\'s channel within 100 m north and south', () => {
    let n = 0;
    for (const l of map.river) for (const [x, z] of l) if (Math.abs(z) < 100 && Math.abs(x) < 100) { near(x, sine(z), 1e-9, `at z ${z}`); n++; }
    assert.ok(n > 10);
  });
  test('it\'s the TIGER line again by 200 m', () => {
    const raw = data.reference.river.lines.flatMap((l) => l.points).map(([x, z]) => map.toWorld(x, z));
    const moved = map.river.flat().filter(([x, z], i) => Math.abs(x - raw[i][0]) > 1e-9);
    for (const [, z] of moved) assert.ok(Math.abs(z) < 200, `moved a vertex at z ${z}`);
  });
});

describe('lookups', () => {
  test('nearest is exact within reach and Infinity past it', () => {
    const g = new SegGrid(10, 12); g.add(0, 0, 100, 0);
    near(g.nearest(50, 5), 5, 1e-9); near(g.t, .5, 1e-9);
    near(g.nearest(-3, 4), 5, 1e-9); assert.equal(g.t, 0);
    assert.equal(g.nearest(50, 200), Infinity);
  });
  test('a long diagonal is only listed near itself', () => {
    const g = new SegGrid(10, 5); g.add(0, 0, 1000, 1000);
    assert.ok(g.cells.size < 800, `${g.cells.size} cells`);
    near(g.nearest(500, 500), 0, 1e-9);
  });
  test('along walks a road and sOn finds the way back', () => {
    for (const r of map.roads) for (const f of [0, .1, .5, .9, 1]) {
      const p = map.along(r.id, r.length * f);
      near(map.sOn(r.id, p.x, p.z), r.length * f, .01, r.id);
      near(Math.hypot(p.tx, p.tz), 1, 1e-9);
    }
  });
  test('every road and the tracks are in bounds, and the far woods aren\'t', () => {
    for (const l of [...map.roads.map((r) => r.pts), ...map.rail]) for (const [x, z] of l) assert.ok(map.inBounds(x, z), `${x},${z}`);
    assert.ok(!map.inBounds(0, -1500));
    assert.ok(!map.inBounds(9000, -3000));
  });
});
