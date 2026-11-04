import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FROGS, BEST, TONI, createToni, loadToni, nextFrog, frogLine, askLine } from './toni.js';
import { randomFrom } from './soundbank.js';

const WORDS = JSON.parse(readFileSync(new URL('../data/toni.json', import.meta.url), 'utf8'));

const HOME = { x: 0, z: 0 }, SPOTS = [[0, 8], [6, 9], [-7, 8.5], [3, -6], [-4, -5]], HIM = { x: 10, z: 12 };
function store() { const kept = {}; return { kept, getItem: (k) => kept[k] ?? null, setItem: (k, v) => { kept[k] = v; }, removeItem: (k) => { delete kept[k]; } }; }
const make = (storage = store(), seed = 7) => createToni({ home: HOME, spots: SPOTS, storage, rand: randomFrom(seed) });
// a while of it, with him where he is, and everything she said
function run(t, seconds, world = {}) {
  const said = [];
  for (let s = 0; s < seconds; s += .1) { const w = t.update(.1, world); if (w) said.push(w); }
  return said;
}
// him walking up from well away, so it's another time he's come by, until she's come up to him and asked
function comeBy(t, him = HIM) { run(t, 1, { him: { x: 200, z: 0 } }); const said = []; for (let s = 0; s < 30 && !said.includes('ask'); s += .1) { const w = t.update(.1, { him }); if (w) said.push(w); } return said; }
// what's in her hands as she says who it is
const holding = (t) => FROGS[t.T.frog].name;
// "Yeah.", and then "Got another one?" until she's shown him n, with the names, and a frame between each of what he says, standing there
function shows(t, n) {
  const names = [];
  for (let i = 0; i < n; i++) { const s = i ? t.another() : t.yes(); if (s !== 'frog') return { names, last: s }; names.push(holding(t)); run(t, .5, { him: HIM }); }
  return { names, last: 'frog' };
}
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

test('she comes up to him when he comes by and asks, and waits for him to answer', () => {
  const t = make();
  assert.deepEqual(comeBy(t), ['ask']);
  assert.ok(Math.hypot(t.T.x - HIM.x, t.T.z - HIM.z) < TONI.stand + .05, 'in front of him');
  assert.deepEqual(run(t, 60, { him: HIM }), [], 'nothing more until he says something');
  assert.equal(t.T.doing, 'ask'); assert.deepEqual(t.mind.seen, []);
  assert.equal(t.yes(), 'frog'); assert.equal(holding(t), 'Gerald'); assert.deepEqual(t.mind.seen, ['Gerald']);
  assert.deepEqual(run(t, 60, { him: HIM }), [], 'and she holds it up for as long as he likes');
  assert.equal(t.T.doing, 'show');
});

test('"Got another one?" gets the next one he hasn\'t seen, so all twelve in one go, each with its line, and then Gerald for keeps', () => {
  const t = make();
  comeBy(t);
  const { names } = shows(t, 12);
  assert.deepEqual(names, FROGS.map((f) => f.name));
  for (const n of names) assert.ok(frogLine(WORDS, FROGS.findIndex((f) => f.name === n)).includes(n));
  assert.equal(t.another(), 'give', 'after the twelfth, Gerald'); assert.equal(holding(t), 'Gerald');
  assert.equal(t.gaveIt(), false);
  assert.deepEqual(run(t, TONI.ask + .2, { him: HIM }), ['gave']);
  assert.equal(t.gaveIt(), true); assert.equal(t.holding(), true); assert.equal(t.T.doing, 'given');
  run(t, TONI.given + .2, { him: HIM });
  assert.equal(t.talking(), false, 'and then she\'s back to her frogs');
});

test('"Later." after the twelfth gets him Gerald too, and anywhere else sends her back to her frogs', () => {
  const t = make();
  comeBy(t); shows(t, 3);
  assert.equal(t.later(), null); assert.equal(t.talking(), false);
  comeBy(t); assert.equal(t.later(), null, 'at "Wanna see a frog?" too'); assert.equal(t.talking(), false);
  comeBy(t); shows(t, 9);
  assert.equal(t.mind.seen.length, 12);
  assert.equal(t.later(), 'give'); assert.deepEqual(run(t, TONI.ask + .2, { him: HIM }), ['gave']);
});

test('standing about near her, she doesn\'t come up again, but TALK always gets her', () => {
  const t = make();
  comeBy(t); t.yes(); t.later();
  assert.deepEqual(run(t, 60, { him: { x: 12, z: 14 } }), []);
  assert.deepEqual(run(t, 60, { him: { x: 30, z: 30 } }), [], 'nor walking about the yard');
  assert.equal(t.talk({ x: t.T.x + 2, z: t.T.z }), 'ask'); assert.equal(t.talking(), true);
  assert.equal(t.talk({ x: t.T.x + 2, z: t.T.z }), null, 'not twice');
  // and she comes the rest of the way up to him as she talks
  const at = { x: t.T.x + 2.4, z: t.T.z };
  run(t, 2, { him: at });
  assert.ok(Math.hypot(t.T.x - at.x, t.T.z - at.z) < TONI.stand + .35);
  assert.equal(t.yes(), 'frog'); assert.equal(holding(t), 'Tuba', 'the next one he hasn\'t seen');
});

test('the one more thing to ask is her other lines, one at a time, each once a time he talks to her, and him or her as the frog is', () => {
  const at = (name) => FROGS.findIndex((f) => f.name === name);
  assert.deepEqual(askLine(WORDS, at('Gerald'), 0), { ask: 'Can I pet him?', say: 'You can pet him with one finger. One.' });
  assert.deepEqual(askLine(WORDS, at('Princess'), 0), { ask: 'Can I pet her?', say: 'You can pet her with one finger. One.' });
  assert.equal(askLine(WORDS, at('Princess'), 2).say, askLine(WORDS, at('Banjo'), 2).say, 'about her, it\'s the same for any of them');
  assert.equal(askLine(WORDS, at('Banjo'), WORDS.asks.length), undefined);
  for (const f of FROGS) for (let k = 0; k < WORDS.asks.length; k++) {
    const { ask, say } = askLine(WORDS, FROGS.indexOf(f), k), he = WORDS.he.includes(f.name);
    assert.ok(!/\b(him|he)\b/i.test(ask + say) || he, `${f.name}: ${ask} ${say}`); assert.ok(!/\b(her|she)\b/i.test(ask + say) || !he, `${f.name}: ${ask} ${say}`);
  }
  const t = make();
  comeBy(t); t.yes();
  assert.equal(t.question(), 'answer'); assert.equal(t.T.asks, 1);
  t.another(); assert.equal(t.question(), 'answer'); assert.equal(t.question(), 'answer'); assert.equal(t.T.asks, 3);
  assert.equal(t.T.doing, 'show', 'asking her things doesn\'t end it');
  t.later(); t.talk(HIM); assert.equal(t.T.asks, 0, 'and next time he talks to her, they\'re all there to ask again');
  assert.equal(t.question(), null, 'nothing to ask about until she\'s shown him one');
});

test('she goes back to her frogs if he walks off before she gets there, or while she\'s showing him', () => {
  const t = make();
  run(t, 1, { him: { x: 200, z: 0 } }); run(t, 1.5, { him: HIM });
  assert.equal(t.T.doing, 'go');
  run(t, 20, { him: { x: 60, z: 0 } });
  assert.notEqual(t.T.doing, 'go'); assert.deepEqual(t.mind.seen, []);
  comeBy(t); t.yes();
  run(t, 3, { him: { x: HIM.x + 20, z: HIM.z } });
  assert.equal(t.talking(), false);
});

test('she remembers which he\'s seen after a reload, and forgets nothing she shouldn\'t', () => {
  const s = store(), t = make(s);
  comeBy(t); shows(t, 2);
  assert.deepEqual(loadToni(s).seen, ['Gerald', 'Tuba']);
  const again = make(s);
  comeBy(again); again.yes();
  assert.equal(holding(again), 'Princess', 'coming back later, she starts with one he hasn\'t seen');
  // what was kept wrong, or can't be read, is forgotten rather than trouble
  for (const bad of ['{', '"x"', '{"seen":"Gerald"}', '{"seen":["Nobody", "Tuba"]}']) { s.kept['chunky.toni'] = bad; assert.doesNotThrow(() => make(s)); }
  assert.deepEqual(loadToni(s).seen, ['Tuba']);
  const refusing = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  assert.doesNotThrow(() => { const r = make(refusing); comeBy(r); shows(r, 2); });
});

test('after Gerald\'s his, she shows him the other eleven in turn, never Gerald', () => {
  const t = make();
  comeBy(t); shows(t, 12); t.another(); run(t, TONI.ask + TONI.given + .5, { him: HIM });
  assert.equal(t.gaveIt(), true);
  comeBy(t);
  const { names } = shows(t, 22);
  assert.equal(names.length, 22); assert.ok(!names.includes('Gerald')); assert.equal(new Set(names).size, 11);
});

test('Gerald stays in his hand through a reload, until he lets him go, and then he\'s gone for good', () => {
  const s = store(), t = make(s);
  comeBy(t); shows(t, 12); t.another(); run(t, TONI.ask + .2, { him: HIM });
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
  comeBy(t); shows(t, 12); t.another(); run(t, TONI.ask + .2, { him: HIM });
  assert.equal(t.holding(), true);
  t.forget();
  assert.deepEqual(t.mind.seen, []); assert.equal(t.holding(), false); assert.equal(t.gaveIt(), false); assert.equal(t.talking(), false);
  assert.deepEqual(loadToni(s), { seen: [], gave: false, holding: false });
  comeBy(t); t.yes();
  assert.equal(holding(t), 'Gerald');
});

test('he has to be there to take Gerald', () => {
  const t = make();
  comeBy(t); shows(t, 12);
  assert.equal(t.later(), 'give');
  // he walks off as she holds Gerald out
  run(t, 20, { him: { x: 90, z: 0 } });
  assert.equal(t.gaveIt(), false);
  // next time, Gerald's the first thing she does
  comeBy(t);
  assert.equal(t.yes(), 'give');
  run(t, TONI.ask + .2, { him: HIM });
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

test('he comes first, and while she\'s talking to him she doesn\'t go off to anyone else', () => {
  const t = make(), q = [{ id: 3, x: -12, z: 10 }];
  run(t, 1, { him: { x: 200, z: 0 } });
  for (let s = 0; s < 30 && t.T.doing !== 'ask'; s += .1) t.update(.1, { him: HIM, quiet: q });
  assert.equal(t.T.who, 'him');
  assert.deepEqual(run(t, 30, { him: HIM, quiet: q }), []);
  assert.equal(t.T.who, 'him');
});

test('nobody far off: she just catches frogs about the yard and the ditch, and never goes off', () => {
  const t = make(); let crouched = 0, far = 0;
  for (let s = 0; s < 600; s += .1) { t.update(.1, { him: { x: 300, z: 0 } }); if (t.T.doing === 'crouch') crouched++; far = Math.max(far, Math.hypot(t.T.x, t.T.z)); }
  assert.ok(crouched > 600, `down catching them ${crouched / 10} s of 600`);
  assert.ok(far <= Math.max(...SPOTS.map(([x, z]) => Math.hypot(x, z))) + .01, `${far.toFixed(1)} m from the house at most`);
});

test('every frog has its own line, and everything she and he say is short enough for the box', () => {
  assert.deepEqual(Object.keys(WORDS.frogs).sort(), FROGS.map((f) => f.name).sort());
  for (const f of FROGS) assert.ok(WORDS.frogs[f.name].includes(f.name), `${f.name}'s line names it`);
  assert.ok(WORDS.he.every((n) => FROGS.some((f) => f.name === n)));
  const asks = WORDS.asks.flatMap((a) => [a, a.her].filter(Boolean));
  for (const line of [WORDS.ask, WORDS.quiet, WORDS.give, WORDS.word, ...Object.values(WORDS.frogs), ...asks.map((a) => a.say)]) assert.ok(line.split(/\s+/).length < 30, line);
  // his answers on the buttons, the same as with the cast, and "Later." as theirs is
  for (const line of [...Object.values(WORDS.answers), ...asks.map((a) => a.ask)]) assert.ok(line.split(/\s+/).length <= 12, line);
  assert.equal(WORDS.answers.later, 'Later.');
  assert.ok(WORDS.give.includes('Gerald') && WORDS.word.includes('{frog}'));
});

test('once he\'s seen them all, it\'s still whichever one\'s turn it is', () => {
  const mind = { seen: FROGS.map((f) => f.name), gave: true };
  const turns = Array.from({ length: 22 }, (_, i) => nextFrog(mind, i));
  assert.ok(!turns.includes(BEST)); assert.equal(new Set(turns).size, 11);
  assert.equal(nextFrog({ seen: [], gave: false }), 0);
  assert.ok(TONI.notice < TONI.away);
});
