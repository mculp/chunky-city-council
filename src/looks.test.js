// That data/looks.json says what data/looks.md says it can, and how far gone people are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOPS, BOTTOMS, MARKS, PARTS, BODY, degreeOf } from './looks.js';

const looks = JSON.parse(readFileSync(new URL('../data/looks.json', import.meta.url))), cast = JSON.parse(readFileSync(new URL('../data/cast.json', import.meta.url))).cast;
const all = [...Object.values(looks.cast), ...looks.crowd], color = (c) => /^#[0-9a-f]{6}$/.test(c);

test('nobody in the cast shares a look', () => {
  const ids = all.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length, ids.join());
});

test('everyone in the cast has a look', () => {
  for (const c of cast) assert.ok(looks.cast[c.id], c.id);
  assert.ok(looks.crowd.length > 1);
});

test('every field is one the drawing knows', () => {
  const colors = { tee: [1, 2], flannel: [2, 3], overalls: [2, 2], camo: [2, 4], coveralls: [1, 1], dress: [1, 3], none: [0, 0] };
  for (const l of all) {
    assert.ok(TOPS.includes(l.top.kind), l.id);
    const n = (l.top.colors ?? []).length, [lo, hi] = colors[l.top.kind];
    assert.ok(n >= lo && n <= hi, `${l.id} has ${n} colours`);
    assert.ok((l.top.colors ?? []).every(color), l.id);
    assert.ok(BOTTOMS.includes(l.bottom.kind), l.id);
    assert.ok(color(l.bottom.color), l.id);
    assert.ok(color(l.skin), l.id);
    assert.ok(color(l.shoes), l.id);
    if (l.hair) assert.ok(color(l.hair), l.id);
    if (l.line) assert.ok(color(l.line), l.id);
    if (l.top.vest) assert.ok(color(l.top.vest), l.id);
    if (l.mark) { assert.ok(MARKS.includes(l.mark.kind), l.id); assert.ok(color(l.mark.color), l.id); }
  }
});

test('the cast are the least far gone, and a ghost not at all', () => {
  for (const [id, l] of Object.entries(looks.cast)) assert.ok(l.degree >= 0 && l.degree < .5, id);
  assert.equal(looks.cast.robby.degree, 0);
  for (const l of looks.crowd) assert.equal(l.degree, undefined, `${l.id}: the crowd's are worked out person by person`);
});

test('a row of the sheet is used all the way across', () => {
  const [[bx, bw], [ax, aw], [lx, lw]] = [PARTS.body, PARTS.arm, PARTS.leg];
  assert.equal(bx, 0); assert.equal(bx + bw, ax); assert.equal(ax + aw, lx); assert.equal(lx + lw, 1);
  assert.ok(BODY.from < BODY.neck && BODY.neck < BODY.chin && BODY.chin < BODY.mouth && BODY.mouth < BODY.nose && BODY.nose < BODY.eyes && BODY.eyes < BODY.brow && BODY.brow < BODY.hairline && BODY.hairline < BODY.to);
});

test('how far gone the crowd is goes from nearly a person to nearly nothing, and most are in between', () => {
  const at = Array.from({ length: 1000 }, (_, i) => degreeOf((i + .5) / 1000));
  assert.ok(Math.min(...at) < .06 && Math.max(...at) > .94, `${Math.min(...at)} to ${Math.max(...at)}`);
  assert.ok(at.every((d) => d >= 0 && d <= 1));
  for (let i = 1; i < at.length; i++) assert.ok(at[i] >= at[i - 1]);
  const middle = at.filter((d) => d > .3 && d < .7).length;
  assert.ok(middle > 500 && middle < 900, `${middle} of 1000 in the middle`);
  assert.ok(at.filter((d) => d < .2).length > 60, 'some still look like people');
  assert.ok(at.filter((d) => d > .8).length > 60, 'and some are nearly gone');
});
