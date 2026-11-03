import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CEMETERY, layGraves, graveSolid } from './graves.js';

// the same hash as the game's, near enough
const hash = (x, y, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
const graves = layGraves(hash);

test('it comes out the same every time', () => {
  assert.deepEqual(layGraves(hash), graves);
});

test('about as many as it looks like from the road', () => {
  assert.ok(graves.length > 90 && graves.length < 220, String(graves.length));
});

test('every kind is there, and only one of them is the stone', () => {
  const kinds = new Set(graves.map((g) => g.kind));
  for (const k of ['low', 'double', 'upright', 'old', 'cross', 'slab', 'obelisk', 'stone']) assert.ok(kinds.has(k), k);
  assert.equal(graves.filter((g) => g.kind === 'stone').length, 1);
});

test('none of them stand on top of another', () => {
  for (const [i, a] of graves.entries()) for (const b of graves.slice(i + 1)) {
    const r = a.kind === 'slab' || b.kind === 'slab' ? 2.4 : 1;
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= r, `${a.kind} ${a.x},${a.z} and ${b.kind} ${b.x},${b.z}`);
  }
});

test('there is room to walk up to the stone', () => {
  const [sx, sz] = CEMETERY.stone;
  for (const g of graves) if (g.kind !== 'stone') assert.ok(Math.hypot(g.x - sx, g.z - sz) >= 2.2, `${g.kind} ${g.x},${g.z}`);
});

test('the stone is off toward the back, not by the road or the gate', () => {
  const [sx, sz] = CEMETERY.stone, fence = CEMETERY.fences[0];
  for (const [x, z] of fence.slice(0, 2)) assert.ok(Math.hypot(sx - x, sz - z) > 30);
});

test('a slab only stops him at its head', () => {
  const slab = graves.find((g) => g.kind === 'slab'), [x, z, half] = graveSolid(slab);
  assert.ok(Math.hypot(x - slab.x, z - slab.z) > 1);
  assert.ok(half < 1);
});
