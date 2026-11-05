// Fishing (CHUNKY-112, for CHUNKY-163), as src/fishing.js has it, with a seeded rand in place of the page's hash()
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFishing, FISH } from './fishing.js';

const seeded = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const DT = 1 / 30;
// waits for the bite, and says how long it took
const toBite = (f) => { let t = 0; while (f.view().state === 'waiting') { t += DT; if (f.tick(DT)?.what === 'bite') return t; } return null; };
// plays out a fish on the line, holding as `hold(view)` says, and says what came of it
const playOut = (f, hold, most = 120) => { for (let t = 0; t < most; t += DT) { const e = f.tick(DT, hold(f.view())); if (e) return e; } return null; };
const careful = (v) => !v.running && v.strain < .8;

test('a cast sits on the water until something takes it, and the hook\'s set in the moment after it goes under', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const f = createFishing({ rand: seeded(seed) });
    assert.ok(f.cast(9, 'river'));
    assert.equal(f.cast(9, 'river'), false, 'one cast at a time');
    assert.equal(f.view().under, 0);
    const t = toBite(f);
    assert.ok(t >= FISH.bite[0] - DT && t <= FISH.bite[1] + DT, `${t}`);
    assert.deepEqual([f.view().state, f.view().under], ['bite', 1]);
    assert.equal(f.press(), 'hooked');
    assert.equal(f.view().state, 'hooked');
  }
});

test('too slow, and it\'s gone with the bait; too soon, and the line comes in empty with its bait', () => {
  const f = createFishing({ rand: seeded(3) });
  f.cast(8); toBite(f);
  let e = null;
  for (let t = 0; t <= FISH.window + DT && !e; t += DT) e = f.tick(DT);
  assert.deepEqual(e, { what: 'missed' });
  assert.equal(f.view().state, 'idle');
  f.cast(8); f.tick(1);
  assert.equal(f.press(), 'empty');
  assert.equal(f.view().state, 'idle');
  assert.equal(f.press(), null, 'and nothing to press with nothing out');
});

test('letting go when it runs or the line strains lands every one, and holding on regardless loses the big ones', () => {
  const landed = { river: [], pond: [] };
  for (let seed = 1; seed <= 60; seed++) for (const water of ['river', 'pond']) {
    const f = createFishing({ rand: seeded(seed) });
    f.cast(10, water); toBite(f); f.press();
    const e = playOut(f, careful);
    assert.equal(e?.what, 'landed', `seed ${seed} ${water}: ${JSON.stringify(e)}`);
    assert.equal(e.fish.water, water);
    landed[water].push(e.fish.lb);
  }
  for (const [water, [lo, hi]] of Object.entries(FISH.lb)) {
    const lbs = landed[water].sort((a, b) => a - b);
    assert.ok(lbs[0] >= lo && lbs.at(-1) <= hi, `${water} ${lbs[0]}..${lbs.at(-1)}`);
    assert.ok(lbs[lbs.length >> 1] < (lo + hi) / 2, `${water}: the smaller more often`);
  }
  assert.ok(Math.max(...landed.river) > Math.max(...landed.pond), 'and bigger in the river');
  let snapped = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const f = createFishing({ rand: seeded(seed) });
    f.cast(10, 'river'); toBite(f); f.press();
    const lb = f.view().state === 'hooked' && playOut(f, () => true);
    if (lb?.what === 'snapped') snapped++;
    else assert.ok(lb.fish.lb < 10, `held all the way, only a small one comes in: ${JSON.stringify(lb)}`);
  }
  assert.ok(snapped > 20, `${snapped}`);
});

test('the line strains held, more while it runs, and eases off let go, and never pays out more than the reel has', () => {
  const f = createFishing({ rand: seeded(9) });
  f.cast(10, 'river'); toBite(f); f.press();
  f.tick(.5, true);
  const held = f.view();
  assert.ok(held.strain > 0 && held.line < 10, JSON.stringify(held));
  f.tick(.5, false);
  assert.ok(f.view().strain < held.strain && f.view().line > held.line);
  for (let t = 0; t < 60; t += DT) f.tick(DT, false);
  assert.equal(f.view().line, FISH.most);
  assert.equal(f.view().strain, 0);
  assert.deepEqual(f.stop(), { what: 'lost' }, 'put away with a fish on, the fish and the worm are gone');
  assert.equal(f.view().state, 'idle');
});

test('put away, a line nothing has taken keeps its bait, and one with a bite on it loses it', () => {
  const f = createFishing({ rand: seeded(4) });
  assert.equal(f.stop(), null, 'nothing out');
  f.cast(6, 'pond');
  assert.equal(f.stop(), null, 'nothing on it');
  f.cast(6, 'pond'); toBite(f);
  assert.equal(f.view().state, 'bite');
  assert.deepEqual(f.stop(), { what: 'lost' });
});
