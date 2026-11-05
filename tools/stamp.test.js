import test from 'node:test';
import assert from 'node:assert/strict';
import { dayOf, stampOf } from './stamp.mjs';

// main's first commit, as git has it
const FIRST = '2026-10-31T17:42:41-05:00';

test('the day main\'s first commit went in is day 1, and each day after as the calendar has it in Mississippi', () => {
  assert.equal(dayOf(FIRST, FIRST), 1);
  assert.equal(dayOf(FIRST, '2026-10-31T23:59:59-05:00'), 1);
  assert.equal(dayOf(FIRST, '2026-11-01T00:00:01-05:00'), 2);
  // the clocks went back at two that morning, and it's still the one day
  assert.equal(dayOf(FIRST, '2026-11-01T01:30:00-06:00'), 2);
  assert.equal(dayOf(FIRST, '2026-11-04T21:58:23-06:00'), 5);
});

test('a commit\'s day is Mississippi\'s, whatever the clock it was made by said', () => {
  // half past eleven on the fourth there is already the fifth in London
  assert.equal(dayOf(FIRST, '2026-11-05T05:30:00Z'), 5);
  assert.equal(dayOf(FIRST, '2026-11-05T06:30:00Z'), 6);
  assert.equal(dayOf('2026-10-31T23:42:41Z', '2026-11-04T21:58:23-06:00'), 5);
});

test('build.json says which commit, how many commits it is, and which day', () => {
  const sha = '0ba51a4c2d083d9e800a68111e780b78d8a47003';
  assert.deepEqual(stampOf({ sha, build: 292, at: '2026-11-04T21:58:23-06:00', first: FIRST }), { commit: sha, build: 292, day: 5 });
});
