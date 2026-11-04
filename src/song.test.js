import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSong, SONG } from './song.js';
import { CEMETERY, fromCemetery } from './graves.js';

// a run of frames at 30 a second: where he is, and how fast what he's driving's going, or null on foot. Says the frames it started on and how much of it there was at the end.
const run = (song, frames) => { const out = { starts: [], much: null }; frames.forEach(([d, speed], i) => { const s = song.update(d, speed, 1 / 30); if (s.start) out.starts.push(i); out.much = s.much; }); return out; };
const go = (from, to, speed, onFoot = false) => { const n = Math.ceil(Math.abs(to - from) / speed * 30); return Array.from({ length: n + 1 }, (_, i) => [from + (to - from) * i / n, onFoot ? null : speed]); };
const wait = (d, speed, seconds) => Array.from({ length: Math.round(seconds * 30) }, () => [d, speed]);

test('pulling up starts it: a truck stopping near the cemetery, and once only', () => {
  const song = createSong();
  const up = run(song, [...go(300, 15, 12), ...go(15, 12, 1), ...wait(12, 0, 3)]);
  assert.equal(up.starts.length, 1, `it starts once: ${up.starts}`);
  assert.equal(up.much, 1);
});

test('driving past at speed doesn\'t start it, however close it goes', () => {
  const song = createSong();
  assert.deepEqual(run(song, [...go(300, 0, 12), ...go(0, 300, 12)]).starts, []);
  assert.deepEqual(run(song, go(300, 0, SONG.stopped + .1)).starts, [], 'nor does crawling past');
});

test('stopping further off than `near` doesn\'t', () => {
  assert.deepEqual(run(createSong(), [...go(300, SONG.near + 2, 12), ...wait(SONG.near + 2, 0, 5)]).starts, []);
});

test('walking in starts it, as soon as he\'s near enough', () => {
  const song = createSong(), walk = run(song, go(200, 0, 4.4, true)), at = go(200, 0, 4.4, true);
  assert.equal(walk.starts.length, 1);
  assert.ok(Math.abs(at[walk.starts[0]][0] - SONG.near) < .2, `at ${at[walk.starts[0]][0]} m`);
});

test('once a visit: back within `away` it doesn\'t start again, and after being further off it does', () => {
  const song = createSong();
  assert.equal(run(song, go(200, 0, 4.4, true)).starts.length, 1);
  assert.deepEqual(run(song, [...go(0, SONG.away - 5, 4.4, true), ...go(SONG.away - 5, 0, 4.4, true)]).starts, [], 'not without being far enough off');
  assert.equal(run(song, [...go(0, SONG.away + 5, 4.4, true), ...go(SONG.away + 5, 0, 4.4, true)]).starts.length, 1, 'and again after');
});

test('past `fade` it fades away over `fadeFor` seconds, and comes back up if he does first', () => {
  const song = createSong();
  run(song, wait(0, null, 1));
  const half = run(song, wait(SONG.fade + 1, null, SONG.fadeFor / 2));
  assert.ok(Math.abs(half.much - .5) < .02, `half of it half way through: ${half.much}`);
  assert.equal(run(song, wait(SONG.fade - 1, null, SONG.fadeFor / 2)).much, 1, 'and back up');
  assert.equal(run(song, wait(SONG.fade + 1, null, SONG.fadeFor + .1)).much, 0, 'and gone');
});

test('how far from the cemetery: 0 inside it, and from its edge outside', () => {
  const [x0, z0] = CEMETERY.words, [wx, wz] = CEMETERY.outline.reduce((a, p) => (p[0] < a[0] ? p : a));
  assert.equal(fromCemetery(x0, z0), 0, 'the stone with the words is in it');
  assert.equal(fromCemetery(...CEMETERY.upright), 0);
  assert.ok(Math.abs(fromCemetery(wx - 20, wz) - 20) < 1e-9, '20 m west of its west corner is 20 m off');
  assert.ok(fromCemetery(-430, -7600) > 100, 'and well up the road, more than 100 m');
});
