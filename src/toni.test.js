import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FROGS, BEST, TONI, createToni, loadToni, nextFrog, sayFrog } from './toni.js';
import { randomFrom } from './soundbank.js';

const WORDS = JSON.parse(readFileSync(new URL('../data/toni.json', import.meta.url), 'utf8'));

const HOME = { x: 0, z: 0 }, SPOTS = [[0, 8], [6, 9], [-7, 8.5], [3, -6], [-4, -5]];
function store() { const kept = {}; return { kept, getItem: (k) => kept[k] ?? null, setItem: (k, v) => { kept[k] = v; }, removeItem: (k) => { delete kept[k]; } }; }
const make = (storage = store(), seed = 7) => createToni({ home: HOME, spots: SPOTS, storage, rand: randomFrom(seed) });
// a while of it, with him where he is, and everything she said, with which frog she said which one it was
const shownAt = new WeakMap();
function run(t, seconds, world = {}) {
  const said = [];
  for (let s = 0; s < seconds; s += .1) { const w = t.update(.1, world); if (w) said.push(w); if (w === 'frog') shownAt.set(t, [...(shownAt.get(t) ?? []), FROGS[t.T.frog].name]); }
  return said;
}
const shownTo = (t) => shownAt.get(t) ?? [];
// him walking up from well away, so it's another time he's come by, and standing there while she shows him
function comeBy(t) { run(t, 1, { him: { x: 200, z: 0 } }); return run(t, 25, { him: { x: 10, z: 12 } }); }
// until she's doing something, or a minute's gone by
function until(t, doing, world) { for (let s = 0; s < 60 && t.T.doing !== doing; s += .1) t.update(.1, world); return t.T.doing; }

test('twelve frogs, all named, of the kinds in the ditches here, Gerald first and the best one', () => {
  assert.equal(FROGS.length, 12); assert.equal(new Set(FROGS.map((f) => f.name)).size, 12);
  assert.equal(FROGS[BEST].name, 'Gerald'); assert.equal(FROGS[0].name, 'Gerald');
  assert.deepEqual([...new Set(FROGS.map((f) => f.kind))].sort(), ['bronze frog', 'bullfrog', 'cricket frog', 'gray treefrog', 'green treefrog', 'southern leopard frog', 'spring peeper', 'toad']);
  assert.equal(FROGS.filter((f) => f.kind === 'toad').length, 1);
  const size = (n) => FROGS.find((f) => f.name === n).size;
  assert.equal(Math.max(...FROGS.map((f) => f.size)), size('Tuba')); assert.equal(Math.min(...FROGS.map((f) => f.size)), size('Button'));
  assert.ok(size('Gerald') < size('Tuba') / 2, 'Gerald is still small');
});

test('she goes up to him when he comes by and shows him one, and it\'s a new one every time he comes by', () => {
  const t = make();
  for (let i = 0; i < 3; i++) assert.deepEqual(comeBy(t), ['ask', 'frog'], `time ${i + 1}`);
  assert.deepEqual(shownTo(t), ['Gerald', 'Tuba', 'Princess']);
  assert.deepEqual(t.mind.seen, shownTo(t));
});

test('standing about near her isn\'t coming by again: one frog a time', () => {
  const t = make();
  comeBy(t);
  assert.deepEqual(run(t, 60, { him: { x: 12, z: 14 } }), []);
  assert.deepEqual(run(t, 60, { him: { x: 30, z: 30 } }), [], 'nor is walking about the yard');
});

test('she goes back to her frogs if he walks off before she gets there, and he hasn\'t seen it', () => {
  const t = make();
  run(t, 1, { him: { x: 200, z: 0 } }); run(t, 1.5, { him: { x: 10, z: 12 } });
  assert.equal(t.T.doing, 'go');
  run(t, 20, { him: { x: 60, z: 0 } });
  assert.notEqual(t.T.doing, 'go'); assert.deepEqual(t.mind.seen, []);
});

test('she remembers which he\'s seen after a reload, and forgets nothing she shouldn\'t', () => {
  const s = store(), t = make(s);
  comeBy(t); comeBy(t);
  assert.deepEqual(loadToni(s).seen, ['Gerald', 'Tuba']);
  const again = make(s);
  comeBy(again);
  assert.deepEqual(shownTo(again), ['Princess']);
  // what was kept wrong, or can't be read, is forgotten rather than trouble
  for (const bad of ['{', '"x"', '{"seen":"Gerald"}', '{"seen":["Nobody", "Tuba"]}']) { s.kept['chunky.toni'] = bad; assert.doesNotThrow(() => make(s)); }
  assert.deepEqual(loadToni(s).seen, ['Tuba']);
  const refusing = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  assert.doesNotThrow(() => comeBy(make(refusing)));
});

test('after all twelve she puts Gerald in his hand, once, and then shows him the rest in turn', () => {
  const t = make(), said = [];
  for (let i = 0; i < 12; i++) said.push(...comeBy(t));
  assert.equal(t.mind.seen.length, 12);
  assert.ok(said.includes('give') && said.includes('gave'), said.join());
  assert.equal(said.filter((s) => s === 'gave').length, 1);
  assert.equal(t.gaveIt(), true);
  // he's got Gerald, so she shows him the others
  for (let i = 0; i < 11; i++) comeBy(t);
  const after = shownTo(t).slice(12);
  assert.equal(after.length, 11); assert.ok(!after.includes('Gerald')); assert.equal(new Set(after).size, 11);
});

test('Gerald stays in his hand through a reload, until he lets him go, and then he\'s gone for good', () => {
  const s = store(), t = make(s);
  for (let i = 0; i < 12; i++) comeBy(t);
  assert.equal(t.holding(), true);
  const again = make(s);
  assert.equal(again.holding(), true);
  assert.equal(again.letGo(), true); assert.equal(again.letGo(), false);
  assert.equal(make(s).holding(), false); assert.equal(make(s).gaveIt(), true);
  s.kept['chunky.toni'] = '{"seen":[],"gave":false,"holding":true}';
  assert.equal(make(s).holding(), false, 'nobody holds Gerald who was never given him');
});

test('forgetting everyone forgets him too: none of them seen, and Gerald hers again', () => {
  const s = store(), t = make(s);
  for (let i = 0; i < 12; i++) comeBy(t);
  assert.equal(t.holding(), true);
  t.forget();
  assert.deepEqual(t.mind.seen, []); assert.equal(t.holding(), false); assert.equal(t.gaveIt(), false);
  assert.deepEqual(loadToni(s), { seen: [], gave: false, holding: false });
  comeBy(t);
  assert.equal(shownTo(t).at(-1), 'Gerald');
});

test('he has to be there to take Gerald', () => {
  const t = make();
  for (let i = 0; i < 11; i++) comeBy(t);
  run(t, 1, { him: { x: 200, z: 0 } });
  assert.equal(until(t, 'give', { him: { x: 10, z: 12 } }), 'give');
  // he walks off as she holds Gerald out
  run(t, 20, { him: { x: 90, z: 0 } });
  assert.equal(t.gaveIt(), false);
  comeBy(t);
  assert.equal(t.gaveIt(), true);
});

test('the gone quiet get shown one too, once a night, and she\'s fine about it', () => {
  const t = make(), q = [{ id: 4, x: 8, z: 14 }, { id: 9, x: -10, z: 12 }];
  const said = run(t, 40, { quiet: q });
  assert.equal(said.filter((s) => s === 'quiet').length, 2);
  assert.deepEqual(run(t, 40, { quiet: q }), []);
  t.night();
  assert.ok(run(t, 40, { quiet: q }).includes('quiet'));
});

test('he comes first', () => {
  const t = make();
  run(t, 1, { him: { x: 200, z: 0 } });
  run(t, 15, { him: { x: 10, z: 12 }, quiet: [{ id: 3, x: -12, z: 10 }] });
  assert.equal(t.mind.seen.length, 1);
});

test('nobody far off: she just catches frogs about the yard and the ditch, and never goes off', () => {
  const t = make(); let crouched = 0, far = 0;
  for (let s = 0; s < 600; s += .1) { t.update(.1, { him: { x: 300, z: 0 } }); if (t.T.doing === 'crouch') crouched++; far = Math.max(far, Math.hypot(t.T.x, t.T.z)); }
  assert.ok(crouched > 600, `down catching them ${crouched / 10} s of 600`);
  assert.ok(far <= Math.max(...SPOTS.map(([x, z]) => Math.hypot(x, z))) + .01, `${far.toFixed(1)} m from the house at most`);
});

test('every frog has its own line, and everything she says is under 30 words', () => {
  assert.deepEqual(Object.keys(WORDS.frogs).sort(), FROGS.map((f) => f.name).sort());
  for (const f of FROGS) assert.ok(WORDS.frogs[f.name].includes(f.name), `${f.name}'s line names it`);
  assert.ok(WORDS.he.every((n) => FROGS.some((f) => f.name === n)));
  const all = [WORDS.ask, WORDS.quiet, WORDS.give, WORDS.word, ...Object.values(WORDS.frogs), ...WORDS.after.map((a) => a.say)];
  for (const line of all) assert.ok(line.split(/\s+/).length < 30, line);
  assert.ok(WORDS.after.some((a) => !a.he), 'something to say after any of them');
  assert.ok(WORDS.give.includes('Gerald') && WORDS.word.includes('{frog}'));
});

test('what she says showing one: its own line, then one of the rest in turn, and "him" only about a boy', () => {
  const at = (name) => FROGS.findIndex((f) => f.name === name);
  assert.deepEqual(sayFrog(WORDS, at('Gerald'), 0), [WORDS.frogs.Gerald, WORDS.after[0].say]);
  const hers = new Set(Array.from({ length: 6 }, (_, i) => sayFrog(WORDS, at('Princess'), i)[1]));
  assert.deepEqual([...hers], WORDS.after.filter((a) => !a.he).map((a) => a.say));
  const his = new Set(Array.from({ length: 6 }, (_, i) => sayFrog(WORDS, at('Banjo'), i)[1]));
  assert.equal(his.size, WORDS.after.length);
});

test('once he\'s seen them all, it\'s still whichever one\'s turn it is', () => {
  const mind = { seen: FROGS.map((f) => f.name), gave: true };
  const turns = Array.from({ length: 22 }, (_, i) => nextFrog(mind, i));
  assert.ok(!turns.includes(BEST)); assert.equal(new Set(turns).size, 11);
  assert.equal(nextFrog({ seen: [], gave: false }), 0);
  assert.ok(TONI.notice < TONI.away);
});
