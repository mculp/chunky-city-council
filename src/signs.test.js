import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSigns, dayOf, MAX_LETTERS, MAX_ROWS } from './signs.js';

const data = JSON.parse(readFileSync('data/signs.json', 'utf8'));
const signs = createSigns(data), ids = data.churches.map((c) => c.id), DAY = 20758;
const all = [...data.lines, ...data.feuds.flatMap((f) => Object.values(f))];

test('every line fits on the board, in letters the sign has', () => {
  for (const rows of all) {
    assert.ok(rows.length >= 1 && rows.length <= MAX_ROWS, rows.join(' / '));
    for (const row of rows) { assert.ok(row.length <= MAX_LETTERS, `${row} is ${row.length} letters`); assert.match(row, /^[A-Z0-9 ]+$/, row); }
  }
});

test('nothing is on the sheet twice', () => {
  const seen = new Set(data.lines.map((r) => r.join(' / ')));
  assert.equal(seen.size, data.lines.length);
});

test('no two churches say the same thing on the same day, for a year and more', () => {
  for (let d = DAY; d < DAY + 400; d++) assert.equal(new Set(ids.map((id) => signs.says(id, d).join(' / '))).size, ids.length, `day ${d}`);
});

test('every sign says something else tomorrow', () => {
  for (let d = DAY; d < DAY + 400; d++) for (const id of ids) assert.notDeepEqual(signs.says(id, d), signs.says(id, d + 1), `${id} on day ${d}`);
});

test('nothing comes round again until the sheet has', () => {
  const days = Math.floor(data.lines.length / ids.length), start = DAY + 1, seen = new Set();
  for (let d = start; d < start + days; d++) if (!signs.feudOn(d)) for (const id of ids) { const line = signs.says(id, d).join(' / '); assert.ok(!seen.has(line), `${line} again on day ${d}`); seen.add(line); }
});

test('they argue every few days, and a church that isn\'t in it still has its own line', () => {
  const day = data.feudEvery * 7, feud = signs.feudOn(day);
  assert.ok(feud);
  assert.equal(signs.feudOn(day + 1), null);
  const quiet = ids.find((id) => !feud[id]);
  for (const id of Object.keys(feud)) assert.deepEqual(signs.says(id, day), feud[id]);
  if (quiet) assert.ok(data.lines.some((r) => r === signs.says(quiet, day)));
});

test('every feud is between churches that exist, with at least two of them in it', () => {
  for (const f of data.feuds) { assert.ok(Object.keys(f).length >= 2); for (const id of Object.keys(f)) assert.ok(ids.includes(id), id); }
});

test('the day turns over at midnight in Mississippi, whatever the time is anywhere else', () => {
  // 5:59 am and 6:01 am UTC in January are either side of midnight in Chicago, which is six hours behind
  const before = dayOf(new Date(Date.UTC(2026, 0, 15, 5, 59))), after = dayOf(new Date(Date.UTC(2026, 0, 15, 6, 1)));
  assert.equal(after - before, 1);
  assert.equal(after, Math.round(Date.UTC(2026, 0, 15) / 864e5));
  // and it's five hours in summer
  assert.equal(dayOf(new Date(Date.UTC(2026, 6, 15, 5, 1))) - dayOf(new Date(Date.UTC(2026, 6, 15, 4, 59))), 1);
});

test('the sheet stays out of the things it should', () => {
  const words = all.flat().join(' ');
  // not the pun on a real brand in one of the photos, and not a word of Robby's line, which only ever got said once
  assert.doesNotMatch(words, /FAITH ?BOOK/);
  assert.doesNotMatch(words, /DEER MEAT|FLIES OUT OF HERE/);
});
