import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CEMETERY, layGraves, graveSolid, onSlab, slabHead } from './graves.js';

// the same hash as the game's, near enough
const hash = (x, y, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
const graves = layGraves(hash), TURN = Math.atan2(CEMETERY.back[0], CEMETERY.back[1]), words = graves.find((g) => g.words);

test('it comes out the same every time', () => {
  assert.deepEqual(layGraves(hash), graves);
});

test('about as many as it looks like from the road', () => {
  assert.ok(graves.length > 90 && graves.length < 220, String(graves.length));
});

test('every kind is there, and the words are on one of them', () => {
  const kinds = new Set(graves.map((g) => g.kind));
  for (const k of ['low', 'double', 'upright', 'old', 'cross', 'slab', 'obelisk']) assert.ok(kinds.has(k), k);
  assert.deepEqual(graves.filter((g) => g.words).map((g) => g.kind), ['slab']);
});

test('the words are on the slab the owner picked, the northernmost, number 1 on the map they were sent', () => {
  const slabs = graves.filter((g) => g.kind === 'slab');
  assert.deepEqual([words.x, words.z], [-391.5, -7427]);
  assert.equal(Math.min(...slabs.map((g) => g.z)), words.z);
});

test('the upright that had the words is an ordinary stone, where it was', () => {
  const was = graves.filter((g) => g.x === CEMETERY.upright[0] && g.z === CEMETERY.upright[1]);
  assert.deepEqual(was.map((g) => g.kind), ['upright']);
  assert.ok(!was[0].words);
});

test('none of them stand on top of another', () => {
  for (const [i, a] of graves.entries()) for (const b of graves.slice(i + 1)) {
    const r = a.kind === 'slab' || b.kind === 'slab' ? 2.4 : 1;
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= r, `${a.kind} ${a.x},${a.z} and ${b.kind} ${b.x},${b.z}`);
  }
});

test('nothing else moved when the words went: the upright still has the room it had', () => {
  const [sx, sz] = CEMETERY.upright;
  for (const g of graves) if (g.x !== sx || g.z !== sz) assert.ok(Math.hypot(g.x - sx, g.z - sz) >= 2.2, `${g.kind} ${g.x},${g.z}`);
});

test('there is room all round the slab with the words to stand beside it and read it', () => {
  for (const g of graves) if (g !== words) assert.ok(!onSlab(words, g.x, g.z, TURN, .9), `${g.kind} ${g.x},${g.z}`);
});

test('it can be read anywhere along the slab, standing on it or beside it, and not from further off', () => {
  const at = (u, v) => { const a = TURN + words.turn; return [words.x + u * Math.cos(a) + v * Math.sin(a), words.z - u * Math.sin(a) + v * Math.cos(a)]; };
  const { w, d } = words;
  for (const [u, v] of [[0, 0], [0, d / 2 - .1], [w / 2 - .1, -d / 3], [-w / 2 - .8, 0], [w / 2 + .8, d / 2], [0, d / 2 + .8]]) assert.ok(onSlab(words, ...at(u, v), TURN, .9), `${u},${v}`);
  for (const [u, v] of [[-w / 2 - 1.2, 0], [0, d / 2 + 1.2], [w / 2 + 1, d / 2 + 1]]) assert.ok(!onSlab(words, ...at(u, v), TURN, .9), `${u},${v}`);
});

test('a slab only stops him at its head', () => {
  const slab = graves.find((g) => g.kind === 'slab'), [x, z, half] = graveSolid(slab);
  assert.ok(Math.hypot(x - slab.x, z - slab.z) > 1);
  assert.ok(half < 1);
  assert.deepEqual([x, z], slabHead(slab));
  assert.ok(onSlab(slab, x, z));
});
