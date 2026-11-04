import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRONTAGE as F, GRASS_PINES, woodsAlong, fenceAlong, inWoods } from './frontage.js';
import { KINDS } from './vehicles.js';

const roads = JSON.parse(readFileSync(new URL('../data/roads.json', import.meta.url), 'utf8'));
const line = roads.edges.find((e) => e.id === 'pine_forest_rd_e1').points;
// the game's own hash, from index.html
const hash = (x, y, s) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const trees = woodsAlong(line, hash), fence = fenceAlong(line);
const toLine = (x, z) => { let best = Infinity; for (let i = 1; i < line.length; i++) { const [ax, az] = line[i - 1], [bx, bz] = line[i], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return best; };
// how far south the nearest point of the road is, which is what says where the stretch starts and stops
const roadZ = (x, z) => { let best = Infinity, at = 0; for (let i = 1; i < line.length; i++) { const [ax, az] = line[i - 1], [bx, bz] = line[i], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))), d = Math.hypot(x - ax - dx * t, z - az - dz * t); if (d < best) { best = d; at = az + dz * t; } } return at; };
const toDrive = (x, z) => { const [ax, az] = F.drive.from, [bx, bz] = F.drive.to, dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
// The widest anything can be and still not touch a trunk: the game stops a car when a point round its edge comes within a trunk's radius and 0.3 m of a tree's middle,
// and a trunk's 0.16 of a pine's size across, and 0.2 of a hardwood's.
const trunk = (t) => (t.pine ? .16 : .2) * t.size + .3;
const widest = Math.max(...Object.values(KINDS).map((K) => K.width));

test('the woods stand off the road on its east side, in the stretch past the compound', () => {
  assert.ok(trees.length > 300, `${trees.length} trees`);
  for (const t of trees) {
    const d = toLine(t.x, t.z);
    assert.ok(d >= F.near - 1e-6 && d <= F.far + 1e-6, `${t.x}, ${t.z} is ${d} m off the road`);
    assert.ok(t.z >= F.from - F.far && t.z <= F.to + F.far);
    assert.ok(inWoods(line, t.x, t.z));
  }
  assert.ok(!inWoods(line, 840, 700), 'across the road is not');
});

test('nothing in them is too close to the next one to be a tree of its own', () => {
  let least = Infinity;
  for (let a = 0; a < trees.length; a++) for (let b = a + 1; b < trees.length; b++) least = Math.min(least, Math.hypot(trees[a].x - trees[b].x, trees[a].z - trees[b].z));
  assert.ok(least > 1.5, `two are ${least} m apart`);
});

test('a car going in anywhere but the drive meets four trees or more before it is through them', () => {
  // from the fence's line, every metre along it, at every heading within 60 degrees of square on, as far as it takes to be out the other side. A way that goes out past
  // either end of the woods, or into the drive, isn't going through them, and nor is one that only runs along the road.
  const half = widest / 2;
  let fewest = Infinity, where = null, ways = 0;
  for (const run of fence) for (let i = 1; i < run.length; i++) {
    const [ax, az] = run[i - 1], [bx, bz] = run[i], L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, nx = uz > 0 ? uz : -uz, nz = uz > 0 ? -ux : ux;
    for (let s = 0; s <= L; s += 1) {
      const x0 = ax + ux * s, z0 = az + uz * s;
      for (let deg = -60; deg <= 60; deg += 10) {
        const c = Math.cos(deg * Math.PI / 180), n = Math.sin(deg * Math.PI / 180), dx = nx * c - nz * n, dz = nz * c + nx * n;
        let reach = 0, by = true;
        for (; reach < 60 && toLine(x0 + dx * reach, z0 + dz * reach) < F.far + 1; reach += .5) {
          const x = x0 + dx * reach, z = z0 + dz * reach;
          if (roadZ(x, z) < F.from || roadZ(x, z) > F.to || toDrive(x, z) < F.drive.half + half) { by = false; break; }
        }
        if (!by || reach >= 60) continue;
        let met = 0;
        for (const t of trees) {
          const along = (t.x - x0) * dx + (t.z - z0) * dz, across = Math.abs((t.x - x0) * dz - (t.z - z0) * dx);
          if (along > 0 && along < reach && across < half + trunk(t)) met++;
        }
        ways++;
        if (met < fewest) { fewest = met; where = [x0, z0, deg]; }
      }
    }
  }
  assert.ok(ways > 2000, `${ways} ways in`);
  assert.ok(fewest >= 4, `going in at ${where} meets only ${fewest}`);
});

test('and the drive is open: nothing stands within a car of it', () => {
  const half = widest / 2 + .4;
  for (const t of trees) assert.ok(toDrive(t.x, t.z) > half + trunk(t), `a tree ${toDrive(t.x, t.z)} m from the drive`);
});

test('the fence runs along the road in front of them, open only at the drive', () => {
  assert.equal(fence.length, 2, `${fence.length} lengths of it`);
  const [north, south] = fence[0][0][1] < fence[1][0][1] ? fence : [fence[1], fence[0]];
  for (const run of fence) for (const [x, z] of run) {
    assert.ok(Math.abs(toLine(x, z) - F.fence) < .05, `a corner ${toLine(x, z)} m off the road`);
    assert.ok(roadZ(x, z) >= F.from - .01 && roadZ(x, z) <= F.to + .01);
  }
  // it covers the stretch, and the opening at the drive is wide enough to drive through and no wider than it needs to be
  assert.ok(roadZ(...north[0]) - F.from < .3 && F.to - roadZ(...south.at(-1)) < .3, 'from one end to the other');
  const gap = Math.hypot(south[0][0] - north.at(-1)[0], south[0][1] - north.at(-1)[1]);
  assert.ok(gap > 2 * F.drive.half && gap < 2 * F.drive.half + 4, `the opening's ${gap} m`);
  assert.ok(toDrive(...north.at(-1)) >= F.drive.half && toDrive(...south[0]) >= F.drive.half);
  // and nothing's between its corners that it doesn't go round
  for (const run of fence) for (let i = 1; i < run.length; i++) assert.ok(Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]) > .01);
});

test('the pines across the road are in the grass, off the road and out of the woods', () => {
  for (const [x, z, size] of GRASS_PINES) {
    assert.ok(x < 851 && toLine(x, z) > 4.5, `${x}, ${z}`);
    assert.ok(size > .8 && size < 2);
    assert.ok(!inWoods(line, x, z));
  }
});

test('it comes out the same every time', () => {
  assert.deepEqual(woodsAlong(line, hash), trees);
  assert.deepEqual(fenceAlong(line), fence);
});
