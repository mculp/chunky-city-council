import test from 'node:test';
import assert from 'node:assert/strict';
import { keyOf, kindOf, dirByte, dirOf, encodeParts, decodeParts, tidy, merge, lasting, partsIn, houseWrecks, takenParts, batches, BYTE, AT_ONCE } from './wrecks.js';

const part = (over) => ({ part: 0, gone: false, cracked: false, burning: false, dir: 0, hp: BYTE, shade: BYTE, ...over });
const building = (parts, over) => ({ k: 'b7301', x: 10, z: -20, n: 40, p: encodeParts(parts), ...over });
const partsOf = (item) => decodeParts(item.p);

// ---------------- what a thing's known by
test('each thing is known by what it is and where it stands, the same on every phone', () => {
  assert.equal(keyOf.building(7301), 'b7301');
  assert.equal(keyOf.prop('fence', 12.34, -56.789), 'pfence:123:-568');
  assert.equal(keyOf.tree(-0.04, 3.25), 't0:33');
  assert.equal(keyOf.vehicle(12), 'v12');
  assert.deepEqual(['b7301', 'pfence:1:2', 't1:2', 'v3', 'x1', ''].map(kindOf), ['b', 'p', 't', 'v', null, null]);
});

test('which way something fell goes in a byte, to within a degree and a half', () => {
  for (let a = -Math.PI; a < Math.PI; a += .1) {
    const [x, z] = dirOf(dirByte(Math.cos(a), Math.sin(a)));
    assert.ok(Math.acos(Math.min(1, x * Math.cos(a) + z * Math.sin(a))) < .026, `${a}`);
    assert.ok(Math.abs(Math.hypot(x, z) - 1) < 1e-9);
  }
});

test('a building\'s parts go as six bytes each and come back as they went', () => {
  const parts = [part({ part: 0, gone: true, dir: 17 }), part({ part: 5, cracked: true, hp: 3, shade: 140 }), part({ part: 4095, burning: true, hp: 200 })];
  assert.deepEqual(decodeParts(encodeParts(parts)), parts);
  assert.equal(atob(encodeParts(parts)).length, 18);
  assert.deepEqual(decodeParts(''), []);
});

// ---------------- what a phone can say
test('a wreck is only ever what the game could have, and anything else is turned away', () => {
  assert.ok(tidy(building([part({ gone: true })])));
  assert.ok(tidy({ k: 'pfence:10:20', x: 1, z: 2, d: 255 }));
  assert.ok(tidy({ k: 't10:20', x: 1, z: 2, d: 0, f: 3 }));
  assert.ok(tidy({ k: 'v4095', x: 1, z: 2, y: 1, yaw: 3, h: 0, f: 7 }));
  for (const bad of [
    null, 'b1', {}, { k: 'q1', x: 0, z: 0 },
    building([part()], { k: 'b12x' }), building([part()], { x: NaN }), building([part()], { z: 40001 }),
    building([part()], { n: 0 }), building([part()], { n: 4097 }), building([part({ part: 40 })]), building([], { p: '!!!' }), building([], { p: 'AAAA' }),
    { k: 'pfence:10', x: 1, z: 2, d: 0 }, { k: 'pfence:10:20', x: 1, z: 2, d: 256 }, { k: 'p:10:20', x: 1, z: 2, d: 0 },
    { k: 't10:20', x: 1, z: 2, d: 0, f: 8 }, { k: 't10:20', x: 1, z: 2, d: 0, f: 0 },
    { k: 'v4096', x: 1, z: 2, y: 1, yaw: 0, h: 0, f: 1 }, { k: 'v1', x: 1, z: 2, y: 1, yaw: 0, h: -1, f: 1 }, { k: 'v1', x: 1, z: 2, y: Infinity, yaw: 0, h: 9, f: 1 },
  ]) assert.equal(tidy(bad), null, JSON.stringify(bad));
});

test('what a wreck carries is only what the game uses, rounded to where it is to 10 cm', () => {
  assert.deepEqual(tidy({ k: 'pfence:10:20', x: 1.234, z: -2.36, d: 9, say: 'hi', at: 5 }), { k: 'pfence:10:20', x: 1.2, z: -2.4, d: 9 });
});

// ---------------- merging: only ever more broken
test('two phones\' wrecks of one building come together as everything either broke', () => {
  const a = building([part({ part: 1, gone: true, dir: 10 }), part({ part: 2, hp: 100, shade: 200 })]);
  const b = building([part({ part: 1, gone: true, dir: 90 }), part({ part: 2, hp: 150, shade: 120, cracked: true }), part({ part: 3, gone: true, dir: 5 })], { o: 1 });
  const ab = merge(tidy(a), tidy(b)).kept, ba = merge(tidy(b), tidy(a)).kept;
  assert.deepEqual(partsOf(ab), [part({ part: 1, gone: true, dir: 10 }), part({ part: 2, hp: 100, shade: 120, cracked: true }), part({ part: 3, gone: true, dir: 5 })]);
  assert.equal(ab.o, 1, 'and once it\'s given out it has');
  assert.deepEqual({ ...ba, p: undefined }, { ...ab, p: undefined });
  assert.deepEqual(partsOf(ba).map((q) => ({ ...q, dir: 0 })), partsOf(ab).map((q) => ({ ...q, dir: 0 })), 'the same either way round, but for which way it fell, which is whoever said first');
});

test('nothing new is nothing to tell', () => {
  const a = tidy(building([part({ part: 1, gone: true, dir: 10 })]));
  assert.equal(merge(a, tidy(building([part({ part: 1, gone: true, dir: 50 })]))).changed, false);
  assert.equal(merge(a, tidy(building([part({ part: 1 })]))).changed, false, 'or a part as it was built');
  assert.equal(merge(null, a).changed, true);
});

test('what\'s burning isn\'t kept, since fires go out, but whoever\'s near is told what the phone with it says is', () => {
  const r = merge(null, tidy(building([part({ part: 1, burning: true, hp: 120 }), part({ part: 2, burning: true, gone: true, dir: 3 })])));
  assert.deepEqual(partsOf(r.kept), [part({ part: 1, hp: 120 }), part({ part: 2, gone: true, dir: 3 })]);
  assert.deepEqual(partsOf(r.told), [part({ part: 1, burning: true, hp: 120 }), part({ part: 2, gone: true, dir: 3 })], 'and nothing that\'s down is still burning');
  assert.deepEqual(lasting(r.told), r.kept);
});

test('a building written in a different number of parts, by a different version of the game, starts again', () => {
  const old = tidy(building([part({ part: 1, gone: true })], { n: 40 })), now = tidy(building([part({ part: 9, gone: true })], { n: 41 }));
  const r = merge(old, now);
  assert.equal(r.kept.n, 41); assert.deepEqual(partsOf(r.kept), [part({ part: 9, gone: true })]); assert.equal(r.changed, true);
});

test('a prop that\'s down is down, whichever way whoever saw it first says it went', () => {
  const first = tidy({ k: 'pfence:10:20', x: 1, z: 2, d: 9 });
  assert.deepEqual(merge(first, tidy({ k: 'pfence:10:20', x: 1, z: 2, d: 200 })), { kept: first, told: first, changed: false });
});

test('a tree that\'s down or burnt stays so, and fell the way it was first said to', () => {
  const r = merge(tidy({ k: 't1:2', x: 1, z: 2, d: 9, f: 2 }), tidy({ k: 't1:2', x: 1, z: 2, d: 99, f: 1 }));
  assert.deepEqual(r.kept, { k: 't1:2', x: 1, z: 2, d: 99, f: 3 }, 'burnt first, so it fell the way the second said');
  assert.equal(merge(r.kept, tidy({ k: 't1:2', x: 1, z: 2, d: 7, f: 1 })).changed, false);
});

test('a vehicle only ever loses hit points and never comes back from being wrecked, gone up or drowned, and is where it was last said to be', () => {
  const r = merge(tidy({ k: 'v3', x: 1, z: 2, y: 0, yaw: 0, h: 100, f: 1 }), tidy({ k: 'v3', x: 50, z: 60, y: 1, yaw: 2, h: 180, f: 4 }));
  assert.deepEqual(r.kept, { k: 'v3', x: 50, z: 60, y: 1, yaw: 2, h: 100, f: 5 });
});

test('how many building parts a wreck holds, for how much the town keeps', () => {
  assert.equal(partsIn(tidy(building([part({ part: 1, gone: true }), part({ part: 2, cracked: true })]))), 2);
  assert.equal(partsIn(tidy({ k: 'pfence:10:20', x: 1, z: 2, d: 9 })), 0);
});

// ---------------- on a phone: what src/damage.js reads of a building, said in bytes and taken back
// A part as src/damage.js's read() has it, with its hit points out of its own most
const read = (over) => ({ part: 0, gone: false, cracked: false, burning: false, dirx: 1, dirz: 0, hp: 10, max: 10, shade: 1, ...over });

test('a building\'s parts are said as bytes, and only the ones that aren\'t as they were built, rounded towards more broken', () => {
  const [w] = houseWrecks('b7301', 10.04, -20, 40, { out: false, parts: [read({ part: 3, gone: true, hp: -2, dirx: 0, dirz: -1 }), read({ part: 5, hp: 9.99 }), read({ part: 6, shade: .999 }), read({ part: 7, cracked: true })] });
  assert.deepEqual({ ...w, p: undefined }, { k: 'b7301', x: 10.04, z: -20, n: 40, p: undefined });
  assert.deepEqual(decodeParts(w.p), [
    part({ part: 3, gone: true, dir: dirByte(0, -1), hp: 0 }),
    part({ part: 5, hp: BYTE - 1 }),
    part({ part: 6, shade: BYTE - 1 }),
    part({ part: 7, cracked: true }),
  ]);
  assert.ok(tidy(w), 'and the town takes it as it is');
  assert.deepEqual(houseWrecks('b7301', 0, 0, 40, { out: false, parts: [] }), [], 'one that\'s as it was built says nothing');
  assert.equal(houseWrecks('b7301', 0, 0, 40, { out: true, parts: [] })[0].o, 1, 'but one that\'s given out says so');
});

test('a building with more parts broken than fit in what a phone can say at once goes in pieces, which the town puts back together', () => {
  const parts = Array.from({ length: 1000 }, (_, i) => read({ part: i, gone: i % 2 === 0, hp: i % 2 ? 4 : 0, dirx: 0, dirz: 1 }));
  const pieces = houseWrecks('b7301', 1, 2, 1200, { out: true, parts });
  assert.ok(pieces.length > 1);
  let kept = null;
  for (const w of pieces) { assert.ok(tidy(w)); assert.equal(w.o, 1); kept = merge(kept, tidy(w)).kept; }
  assert.equal(partsIn(kept), 1000);
  for (const b of batches(pieces)) assert.ok(JSON.stringify({ t: 'wreck', w: b }).length <= 2048);
});

test('another phone takes a building\'s bytes back as src/damage.js reads them, against its own parts, and leaves anything it hasn\'t got', () => {
  const built = Array.from({ length: 8 }, (_, i) => ({ part: i, max: i + 1 }));
  const [w] = houseWrecks('b7301', 0, 0, 8, { out: false, parts: [read({ part: 2, gone: true, dirx: 0, dirz: 1, hp: 0, max: 3 }), read({ part: 6, hp: 3.5, max: 7, shade: .5, cracked: true })] });
  const got = takenParts(w, built);
  assert.equal(got.length, 2);
  assert.deepEqual({ ...got[0], dirx: undefined, dirz: undefined }, { part: 2, gone: true, cracked: false, burning: false, dirx: undefined, dirz: undefined, hp: 0, shade: 1 });
  assert.ok(Math.abs(got[0].dirx) < .03 && Math.abs(got[0].dirz - 1) < .001);
  assert.equal(got[1].part, 6); assert.ok(Math.abs(got[1].hp - 3.5) < 7 / BYTE); assert.ok(Math.abs(got[1].shade - .5) < 1 / BYTE); assert.equal(got[1].cracked, true);
  assert.deepEqual(takenParts(w, built.slice(0, 4)).map((q) => q.part), [2], 'and a part it hasn\'t got is left');
});

test('what a phone says goes in as few messages as it fits in, none over what the town hears and none with more than it takes at once, in the order it was said', () => {
  const list = Array.from({ length: 200 }, (_, i) => ({ k: `pfence:${i}:0`, x: i, z: 0, d: i % 256 }));
  const sent = batches(list);
  assert.deepEqual(sent.flat(), list);
  for (const b of sent) { assert.ok(JSON.stringify({ t: 'wreck', w: b }).length <= 2048); assert.ok(b.length <= AT_ONCE); }
  for (let i = 0; i + 1 < sent.length; i++) assert.ok(sent[i].length === AT_ONCE || JSON.stringify({ t: 'wreck', w: [...sent[i], sent[i + 1][0]] }).length > 2048, 'each as full as it goes');
  assert.deepEqual(batches([]), []);
});
