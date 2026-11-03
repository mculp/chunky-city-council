import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { buildHills, decodeHills } from './hills.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));

// The file's format, the same as pack() in tools/build_hills.py: each number less what its neighbours suggest, and a run of no change is a zero byte and how long it is
function pack(values, cols) {
  const out = [];
  let run = 0;
  const number = (n) => { while (n >= 128) { out.push((n & 127) | 128); n >>>= 7; } out.push(n); };
  values.forEach((h, k) => {
    const left = k % cols ? values[k - 1] : 0, up = k >= cols ? values[k - cols] : 0, corner = k >= cols && k % cols ? values[k - cols - 1] : 0, r = h - (left + up - corner);
    if (r === 0) { run++; return; }
    if (run) { out.push(0); number(run); run = 0; }
    number(r > 0 ? r * 2 : -r * 2 - 1);
  });
  if (run) { out.push(0); number(run); }
  return btoa(String.fromCharCode(...out));
}
// A little map of heights in metres, made the way the build makes one
function little(height, cols = 25, rows = 19, d = 10) {
  const S = 6, quantum = 10, ccols = Math.floor((cols - 1) / S) + 2, crows = Math.floor((rows - 1) / S) + 2, want = [], coarse = [], fine = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) want.push(Math.round(height((i + .5) * d, (j + .5) * d) * quantum));
  for (let b = 0; b < crows; b++) for (let a = 0; a < ccols; a++) coarse.push(want[Math.min(rows - 1, b * S) * cols + Math.min(cols - 1, a * S)]);
  for (let j = 0; j < rows; j++) {
    const b = Math.floor(j / S), y = j % S;
    for (let i = 0; i < cols; i++) {
      const a = Math.floor(i / S), x = i % S, c = b * ccols + a;
      fine.push(want[j * cols + i] - Math.floor((coarse[c] * (S - x) * (S - y) + coarse[c + 1] * x * (S - y) + coarse[c + ccols] * (S - x) * y + coarse[c + ccols + 1] * x * y + 18) / 36));
    }
  }
  return { want, data: { cols, rows, x0: 0, z0: 0, dx: d, dz: d, quantum, coarse: { stride: S, cols: ccols, rows: crows, data: pack(coarse, ccols) }, data: pack(fine, cols) } };
}

test('it reads back every height it was given', () => {
  const { want, data } = little((x, z) => 20 + 9 * Math.sin(x * .02) + 4 * Math.cos(z * .05));
  const { heights } = decodeHills(data);
  want.forEach((q, k) => assert.ok(Math.abs(heights[k] - q / 10) < 1e-5, `height ${k}`));
});

test('flat land is flat, and a steady slope stays a steady slope between the points', () => {
  const flat = buildHills(little(() => 7).data);
  for (let x = 0; x < 240; x += 7) for (let z = 0; z < 180; z += 11) assert.ok(Math.abs(flat.at(x, z) - 7) < 1e-6);
  const slope = buildHills(little((x) => 3 + x * .1).data);
  for (let x = 40; x < 200; x += 3.7) assert.ok(Math.abs(slope.at(x, 90) - (3 + x * .1)) < .03, `at ${x}`);
  const [east, south] = slope.slope(120, 90);
  assert.ok(Math.abs(east - .1) < .005 && Math.abs(south) < .005);
});

test('a line on the flat stays as it is, and a line over a rise gets the points it needs', () => {
  const flat = buildHills(little(() => 0).data), line = [[20, 90], [220, 90]];
  assert.deepEqual(flat.follow(line), line);
  const rise = buildHills(little((x) => 30 * Math.exp(-(((x - 120) / 40) ** 2))).data), out = rise.follow(line);
  assert.ok(out.length > 8);
  assert.deepEqual(out[0], line[0]);
  assert.deepEqual(out.at(-1), line[1]);
  for (let i = 1; i < out.length; i++) {
    const [ax, az] = out[i - 1], [bx, bz] = out[i];
    assert.ok(Math.abs(rise.at((ax + bx) / 2, (az + bz) / 2) - (rise.at(ax, az) + rise.at(bx, bz)) / 2) < .03);
  }
});

const hills = read('hills'), H = buildHills(hills), roads = read('roads'), lanes = read('lanes'), water = read('water'), structures = read('structures');
const edges = new Map(roads.edges.map((e) => [e.id, e.points]));
const everyLine = [...roads.edges.map((e) => e.points), ...lanes.lanes.map((l) => l.points), ...lanes.drives.map((l) => l.points)];
// every few metres along a line
function* along(points, step) {
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) yield [ax + (bx - ax) * k / n, az + (bz - az) * k / n];
  }
}
// how far from a road or the tracks, as far as he could see
const reachable = (() => {
  const cell = 200, grid = new Map();
  for (const points of [...everyLine, ...roads.reference.railroad.lines.map((l) => l.points)]) for (const [x, z] of points) { const k = `${Math.floor(x / cell)},${Math.floor(z / cell)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push([x, z]); }
  return (x, z, r) => { const a = Math.floor(x / cell), b = Math.floor(z / cell), n = Math.ceil(r / cell); for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (const p of grid.get(`${a + i},${b + j}`) ?? []) if (Math.hypot(p[0] - x, p[1] - z) < r) return true; return false; };
})();

test('the file is small enough for a phone, and says where it came from', () => {
  assert.ok(statSync(new URL('../data/hills.json', import.meta.url)).size < 200 * 1024);
  assert.match(hills.source.name, /U\.S\. Geological Survey/);
  assert.equal(hills.source.licence, 'Public domain');
  assert.equal(hills.units, 'metres');
  assert.equal(H.heights.length, hills.cols * hills.rows);
  // nothing's below the floodplain but in a dip, where the land really is lower, and nothing's below a dip's floor. What's levelled in one, a pond
  // or a building, takes some of the land around it down too.
  H.heights.forEach((h, k) => {
    if (h >= 0) return;
    const x = H.x0 + (k % H.cols + .5) * H.dx, z = H.z0 + (Math.floor(k / H.cols) + .5) * H.dz;
    assert.ok(hills.dips.some((d) => Math.hypot(x - d.x, z - d.z) < 2 * d.edge && h >= -d.depth), `${h} at ${x}, ${z}`);
  });
});

test('the first scene is at the bottom of the hills, all the way across its square and past it', () => {
  const bridge = roads.reference.crossings.find((c) => c.road === roads.opening.road && c.with === 'river');
  for (let x = -280; x <= 280; x += 8) for (let z = -280; z <= 280; z += 8) assert.ok(H.at(bridge.x + x, bridge.z + z) < .005, `at ${x}, ${z}`);
});

test('the river is at the foot of the land wherever it can be seen, and where a bluff stands over it, it stays under water', () => {
  let count = 0, raised = 0;
  for (const line of roads.reference.river.lines) for (const [x, z] of along(line.points, 8)) {
    if (!reachable(x, z, 420)) continue;
    const h = H.at(x, z);
    count++;
    if (h > .25) raised++;
    assert.ok(h < 2.5, `the river at ${x}, ${z} is ${h}, and its bed's 3 m down`);
  }
  assert.ok(count > 1500);
  assert.ok(raised < 30, `${raised} of ${count}`);
});

test('water is level', () => {
  for (const pond of water.ponds) {
    const ring = pond.ring, heights = [...along([...ring, ring[0]], 6)].map(([x, z]) => H.at(x, z));
    const off = Math.max(...heights) - Math.min(...heights);
    assert.ok(off < (pond.pool ? .1 : .12), `${pond.id} is ${off} out`);
  }
});

test('the places that are known are about what they are', () => {
  assert.ok(Math.abs(H.at(0, 0) - 3) < 1, 'town center');
  assert.ok(H.at(-336.8, 490.4) < .1, 'the bridge he wakes on');
  assert.ok(Math.abs(H.at(-425, -7400) - 48) < 4, 'the cemetery, up the road');
  // 97 m is the published elevation of Chunky, which is about the floodplain's height and what town stands on
  assert.ok(hills.elevation.lowest > 60 && hills.elevation.highest < 200 && hills.elevation.highestOverFloodplain > 80);
});

test('there are real hills on the roads that have them', () => {
  const rise = (id) => {
    const hs = roads.roads.find((r) => r.id === id).edges.flatMap((e) => [...along(edges.get(e), 10)]).map(([x, z]) => H.at(x, z));
    return Math.max(...hs) - Math.min(...hs);
  };
  assert.ok(rise('us_80') > 25);
  assert.ok(rise('meehan_savoy_rd') > 50);
  assert.ok(rise('stuckey_bridge_rd') > 40);
});

test('Chestnut St comes up off Griffis Fountain Rd from as low as the land really is there', () => {
  const lines = (id) => roads.roads.find((r) => r.id === id).edges.map((e) => edges.get(e));
  const at = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1;
  const foot = lines('chestnut_st').flatMap((p) => [p[0], p.at(-1)]).find((q) => lines('griffis_fountain_rd').some((p) => at(p[0], q) || at(p.at(-1), q)));
  const up = lines('chestnut_st').map((p) => (at(p[0], foot) ? p : at(p.at(-1), foot) ? [...p].reverse() : null)).find(Boolean);
  const hs = [...along(up, 5)].map(([x, z]) => H.at(x, z)), rise = Math.max(...hs) - hs[0];
  let steepest = 0;
  for (let i = 3; i < hs.length; i++) steepest = Math.max(steepest, (hs[i] - hs[i - 3]) / 15);
  assert.ok(hs[0] < -1.8 && hs[0] > -2.4, `its foot's ${hs[0]}, where the survey has it 2.1 m under the floodplain`);
  assert.ok(rise > 6.5, `it climbs ${rise} m of its real 7.9`);
  assert.ok(steepest < .11, `at up to ${steepest}, where the survey's steepest 15 m is 10%`);
});

test('nearly every building stands on ground that has been levelled for it', () => {
  let steep = 0, leaning = 0;
  for (const b of [...structures.structures, ...structures.extras]) {
    const pts = b.ring.map(([x, z]) => [b.x + x, b.z + z]), hs = pts.map(([x, z]) => H.at(x, z));
    let span = 1;
    for (const p of pts) for (const q of pts) span = Math.max(span, Math.hypot(p[0] - q[0], p[1] - q[1]));
    const grade = (Math.max(...hs) - Math.min(...hs)) / span;
    if (grade > .08) leaning++;
    if (grade > .15) steep++;
  }
  assert.equal(steep, 0);
  assert.ok(leaning <= 12, `${leaning} lean more than 8%`);
});

test('a road or lane stays on the land once it has the points it needs', () => {
  let was = 0, now = 0, worst = 0;
  for (const line of everyLine) {
    const out = H.follow(line);
    was += line.length; now += out.length;
    for (let i = 1; i < out.length; i++) {
      const [ax, az] = out[i - 1], [bx, bz] = out[i];
      worst = Math.max(worst, Math.abs(H.at((ax + bx) / 2, (az + bz) / 2) - (H.at(ax, az) + H.at(bx, bz)) / 2));
    }
  }
  assert.ok(worst < .06, `a stretch leaves the land by ${worst}`);
  assert.ok(now < was * 2, `${was} points to ${now}`);
});

test('the skyline is the same land, further apart', () => {
  const { skyline: s } = H;
  assert.equal(s.heights.length, s.cols * s.rows);
  assert.equal(s.dx, hills.dx * hills.coarse.stride);
  assert.ok(s.heights.every((h) => h >= -Math.max(0, ...hills.dips.map((d) => d.depth)) && Number.isFinite(h)));
  // a long way from any road, where it's all there is, it's what the near land says within what a coarse grid can do
  const k = Math.floor(s.rows / 2) * s.cols + Math.floor(s.cols / 2);
  assert.ok(Math.abs(s.heights[k] - H.at(s.x0 + Math.floor(s.cols / 2) * s.dx, s.z0 + Math.floor(s.rows / 2) * s.dz)) < 15);
});
