// The world frame the game builds from data/roads.json.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMap, compressX, SegGrid } from './map.js';

const data = JSON.parse(readFileSync(new URL('../data/roads.json', import.meta.url)));
const sine = (z) => 3.5 * Math.sin(z * .035);
const map = buildMap(data, { riverAtBridge: sine });
const near = (a, b, tol = .01, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} isn't within ${tol} of ${b}`);

describe('the lanes', () => {
  const [x0, z0] = [data.edges[0].points[0][0], data.edges[0].points[0][1]];
  const lanes = {
    lanes: [{ id: 'lane_1', name: 'Long Rd', width: 5.5, surface: 'asphalt', points: [[x0, z0], [x0 + 400, z0 + 300]] }, { id: 'lane_2', name: null, width: 4.2, surface: 'gravel', generated: true, points: [[x0 + 400, z0 + 300], [x0 + 500, z0 + 300]] }],
    drives: [{ id: 'drive_7', structure: 7, generated: true, width: 3, surface: 'dirt', points: [[x0 + 500, z0 + 300], [x0 + 500, z0 + 340]] }],
    crossings: [{ road: 'lane_1', with: 'railroad', x: x0 + 100, z: z0 + 75 }],
    closed: [{ road: 'lane_2', x: x0 + 500, z: z0 + 300 }],
  };
  const m = buildMap(data, { riverAtBridge: sine, lanes });
  test('the graph stays the graph, and they\'re roads to whatever asks', () => {
    assert.equal(m.roads.length, map.roads.length);
    assert.equal(m.lanes.length, 3);
    assert.equal(m.roadById.get('drive_7').structure, 7);
    const [x, z] = m.toWorld(x0 + 500, z0 + 320);
    near(m.roadGrid.nearest(x, z), 0);
    assert.equal(m.roadGrid.seg.owner.id, 'drive_7');
    near(m.along('lane_1', 500).x, m.toWorld(x0 + 400, 0)[0]);
  });
  test('their crossings and where they stop come along with them', () => {
    assert.equal(m.crossings.length, map.crossings.length + 1);
    assert.deepEqual(m.closedLanes.map((c) => c.roads), [['lane_2']]);
    near(m.closedLanes[0].x, m.toWorld(x0 + 500, 0)[0]);
    assert.equal(m.closedLanes[0].kind, 'clip');
  });
  test('the map reaches 280 m past them', () => {
    const [x, z] = m.toWorld(x0 + 500, z0 + 340);
    assert.ok(m.inBounds(x, z + 200));
    assert.ok(!map.inBounds(x + 50000, z));
  });
  test('without any, nothing\'s different', () => {
    assert.deepEqual(map.lanes, []);
    assert.deepEqual(map.closedLanes, []);
  });
});

describe('the world frame', () => {
  test('Stuckey\'s Bridge is the origin, where TIGER has its road cross the river', () => {
    const c = map.crossings.find((x) => x.road === map.opening.road && x.with === 'river');
    near(c.x, 0); near(c.z, 0);
    near(c.lon, -88.855232, 1e-6); near(c.lat, 32.255706, 1e-6);
  });

  test('it\'s a true map moved over, with one shift for everything', () => {
    for (const n of data.nodes) { const w = map.nodes.find((o) => o.id === n.id); near(w.x - n.x, -map.bridge.x, .002, n.id); near(w.z - n.z, -map.bridge.z, .002, n.id); }
    assert.deepEqual(data.compression, []);
  });

  test('town is 6.45 miles from Stuckey\'s as the crow flies and about ten by road, all of it connected', () => {
    const [x, z] = map.fromTrue(0, 0), mile = 1609.344;
    near(Math.hypot(x, z) / mile, 6.45, .01);
    const node = (a, b) => map.nodes.find((n) => n.roads.includes(a) && n.roads.includes(b)), span = (id, a, b) => Math.abs(map.sOn(id, a.x, a.z) - map.sOn(id, b.x, b.z));
    const center = { x, z }, turn = node('us_80', 'meehan_savoy_rd'), fork = node('meehan_savoy_rd', map.opening.road);
    const road = span('us_80', center, turn) + span('meehan_savoy_rd', turn, fork) + span(map.opening.road, fork, { x: 0, z: 0 });
    assert.ok(road / mile > 9 && road / mile < 11, `${(road / mile).toFixed(2)} miles`);
  });

  test('he wakes on the real Chunky River Bridge, on Griffis Fountain Rd', () => {
    const c = map.crossings.find((x) => x.road === 'griffis_fountain_rd' && x.with === 'river');
    near(c.lon, -88.931644, 1e-6); near(c.lat, 32.32142, 1e-6);
    const road = map.roadById.get('griffis_fountain_rd');
    assert.ok(map.sOn(road.id, c.x, c.z) > 100 && map.sOn(road.id, c.x, c.z) < road.length - 100);
  });

  test('the road through the opening runs dead straight along z 0, west to east', () => {
    const { west, east, road } = map.opening, r = map.roadById.get(road);
    const at = r.pts.findIndex(([x, z]) => x === west && z === 0);
    assert.deepEqual(r.pts.slice(at, at + 3), [[west, 0], [0, 0], [east, 0]]);
    for (let s = r.s[at]; s < r.s[at + 2]; s += 20) { const p = map.along(road, s); near(p.z, 0, 1e-9); near(p.tx, 1, 1e-9); }
    assert.ok(r.pts[0][0] < r.pts.at(-1)[0], 'it walks west to east');
  });

  test('past the joins it\'s TIGER\'s own line, and nothing else was bent', () => {
    const { joinWest, joinEast, road } = map.opening, r = map.roadById.get(road);
    const real = data.edges.filter((e) => e.road === road).flatMap((e) => e.points).map(([x, z]) => map.toWorld(x, z));
    const out = real.filter(([x, z]) => x < joinWest[0] - 1 || z > joinWest[1] + 1 || x > joinEast[0] + 1 || z < joinEast[1] - 1);
    assert.ok(out.length > 40);
    for (const [x, z] of out) assert.ok(r.pts.some((p) => p[0] === x && p[1] === z), `${x},${z} isn't on the road`);
    for (const o of map.roads) if (o.id !== road) { const e = data.edges.filter((d) => d.road === o.id)[0]; const [x, z] = map.toWorld(...e.points[0]); near(o.pts[0][0], x, 1e-9, o.id); near(o.pts[0][1], z, 1e-9, o.id); }
  });

  test('the curves on and off it are gentle enough to drive', () => {
    const { road, joinWest, joinEast } = map.opening, r = map.roadById.get(road);
    for (let i = 2; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 2], [bx, bz] = r.pts[i - 1], [cx, cz] = r.pts[i];
      if (bx < joinWest[0] || bx > joinEast[0] || bz > joinWest[1] || bz < joinEast[1]) continue;
      const turn = Math.abs(Math.atan2(Math.sin(Math.atan2(cx - bx, cz - bz) - Math.atan2(bx - ax, bz - az)), Math.cos(Math.atan2(cx - bx, cz - bz) - Math.atan2(bx - ax, bz - az))));
      assert.ok(turn < .5, `${turn.toFixed(2)} rad at ${bx.toFixed(0)},${bz.toFixed(0)}`);
    }
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

  test('compressX leaves x alone with no bands, and follows any it\'s given', () => {
    assert.equal(compressX(1234, data.compression), 1234);
    const bands = [{ trueFrom: 100, trueTo: 200, gameFrom: 100, gameTo: 150, factor: .5 }];
    near(compressX(50, bands), 50, 1e-9); near(compressX(150, bands), 125, 1e-9); near(compressX(300, bands), 250, 1e-9);
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
  test('within goes by each road\'s own width, not just the nearest road\'s', () => {
    const wide = { half: 6 }, narrow = { half: 2 }, half = (o) => o.half, g = new SegGrid(10, 12);
    g.add(-50, 0, 50, 0, wide); g.add(3, 4, 3, 50, narrow);
    // nearer the narrow road's end, and too far out for its width, but it's on the wide one
    assert.ok(g.nearest(3, 5) < 5 && g.seg.owner === narrow); near(g.nearest(5.5, 5), 2.5, 1e-9); assert.equal(g.seg.owner, narrow);
    assert.equal(g.within(5.5, 5, half).owner, wide);
    assert.equal(g.within(3, 20, half).owner, narrow);
    assert.equal(g.within(20, 20, half), null);
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
