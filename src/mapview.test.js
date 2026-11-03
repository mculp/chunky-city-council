import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMapData, clampCam, fitScale, makeView, roadLabels, toRim, toScreen, toWorld, worldBox, zoomAbout, labelSpace } from './mapview.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} is not ${b}`);
const data = () => buildMapData({
  roads: [{ id: 'a', name: 'A Road', width: 7.3, pts: Array.from({ length: 40 }, (_, i) => [i * 50, 0]) }, { id: 'b', name: 'B Road', width: 6, pts: [[0, 0], [0, 500]] }],
  rail: [[[0, 100], [2000, 100]]], river: [[[900, -500], [900, 500]]],
  structures: [{ pts: [[95, 45], [105, 45], [105, 55], [95, 55]] }],
});

test('every point of a long line ends up in a piece', () => {
  const d = data(), seen = new Set();
  for (const p of d.major) for (let i = 0; i < p.pts.length; i += 2) seen.add(p.pts[i]);
  assert.equal(seen.size, 40);
  assert.equal(d.minor.length, 1);
  assert.deepEqual(Array.from(d.houses[0].pts.slice(0, 2)), [95, 45]);
  assert.deepEqual(d.bounds, { x0: 0, x1: 1950 + 50, z0: 0, z1: 500 });
});

test('the lanes are drawn apart from the roads: a named one with the small roads, and a drive on its own', () => {
  const d = buildMapData({
    roads: [{ id: 'a', name: 'A Road', width: 7.3, pts: [[0, 0], [100, 0]] }],
    lanes: [{ id: 'l1', name: 'Long Rd', pts: [[0, 0], [0, 50]] }, { id: 'l2', name: null, pts: [[100, 0], [300, 300]] }, { id: 'd', name: null, structure: 5, pts: [[0, 50], [10, 60]] }],
    rail: [], river: [], structures: [],
  });
  assert.equal(d.minor.length, 1);
  assert.equal(d.lanes.length, 1);
  assert.equal(d.drives.length, 1);
  assert.deepEqual(d.bounds, { x0: 0, x1: 300, z0: 0, z1: 300 });
});

test('north is up with no yaw, and east is right', () => {
  const v = makeView(10, 20, 2, 0, 100, 100);
  assert.deepEqual(toScreen(v, 10, 20), [50, 50]);
  const north = toScreen(v, 10, 10), east = toScreen(v, 20, 20);
  assert.ok(north[1] < 50); near(north[0], 50);
  assert.ok(east[0] > 50); near(east[1], 50);
});

test('what the camera faces is up the map', () => {
  for (const yaw of [0, 1, 2.4, -1.3]) {
    const v = makeView(0, 0, 1, yaw, 100, 100), [x, y] = toScreen(v, -Math.sin(yaw) * 10, -Math.cos(yaw) * 10);
    near(x, 50); near(y, 40);
  }
});

test('world to screen and back', () => {
  const v = makeView(33, -12, .7, .9, 320, 200), [sx, sy] = toScreen(v, 140, 76), [x, z] = toWorld(v, sx, sy);
  near(x, 140); near(z, 76);
});

test('the box of what a turned view can see holds its corners', () => {
  const v = makeView(0, 0, 1, Math.PI / 4, 100, 100), b = worldBox(v, 100, 100), r = 50 * Math.SQRT2;
  near(b.x0, -r); near(b.x1, r); near(b.z0, -r); near(b.z1, r);
});

test('zooming keeps what was under the fingers under them', () => {
  const d = data(), cam = { x: 500, z: 100, scale: .5 }, next = zoomAbout(cam, 80, 60, 1.8, d.bounds, 400, 300);
  const before = toWorld(makeView(cam.x, cam.z, cam.scale, 0, 400, 300), 80, 60), after = toWorld(makeView(next.x, next.z, next.scale, 0, 400, 300), 80, 60);
  near(before[0], after[0]); near(before[1], after[1]);
  near(next.scale, .9);
});

test('the camera stops at the edge of the map and the whole map is as far out as it goes', () => {
  const d = data(), c = clampCam({ x: -999, z: 9999, scale: .00001 }, d.bounds, 400, 300);
  assert.equal(c.x, d.bounds.x0); assert.equal(c.z, d.bounds.z1); near(c.scale, fitScale(d.bounds, 400, 300));
});

test('a road\'s name reads the right way up, and only on screen', () => {
  const road = { name: 'Backwards', pts: Array.from({ length: 30 }, (_, i) => [1000 - i * 50, 5]) };
  const out = roadLabels(road, makeView(500, 0, 1, 0, 400, 400), 400, 400, 120);
  assert.ok(out.length >= 2);
  for (const l of out) { assert.ok(Math.abs(l.angle) <= Math.PI / 2 + 1e-9); assert.ok(l.x > 0 && l.x < 400); }
});

test('a long straight road still gets its name, away from the edges', () => {
  const road = { name: 'Long', pts: [[-5000, 0], [5000, 0]] }, out = roadLabels(road, makeView(0, 0, 1, 0, 400, 400), 400, 400);
  assert.equal(out.length, 1);
  assert.ok(out[0].x >= 40 && out[0].x <= 360); near(out[0].y, 200);
});

test('something beyond the rim sits on it', () => {
  assert.deepEqual(toRim(0, 0, 3, 4, 10), [3, 4, false]);
  const [x, y, out] = toRim(0, 0, 30, 40, 10); near(x, 6); near(y, 8); assert.equal(out, true);
});

test('labels don\'t land on each other', () => {
  const free = labelSpace();
  assert.equal(free(10, 10, 20, 10), true);
  assert.equal(free(15, 12, 20, 10), false);
  assert.equal(free(60, 10, 20, 10), true);
});
