// That data/looks.json says what data/looks.md says it can.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PATTERNS, EYES, TEETH, MARKS, LINES } from './looks.js';

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
  const colors = { plain: 1, stripes: 2, bolts: 3, ribs: 3 };
  for (const l of all) {
    assert.ok(PATTERNS.includes(l.hood.pattern), l.id);
    assert.equal(l.hood.colors.length, colors[l.hood.pattern], l.id);
    assert.ok(l.hood.colors.every(color), l.id);
    assert.ok(color(l.line.color), l.id);
    assert.ok(LINES.includes(l.line.style ?? 'plain'), l.id);
    assert.ok(EYES.includes(l.skull.eyes ?? 'hollow'), l.id);
    assert.ok(TEETH.includes(l.skull.teeth ?? 'plain'), l.id);
    assert.ok(color(l.tassels.color), l.id);
    if (l.mark) { assert.ok(MARKS.includes(l.mark.kind), l.id); assert.ok(color(l.mark.color), l.id); }
  }
});

test('spikes are for the cast', () => {
  for (const l of looks.crowd) assert.notEqual(l.line.style, 'spikes', l.id);
});
