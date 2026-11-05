// Side quests the town comes up with (CHUNKY-163), as src/quests.js has them, stepped through days and nights in Mississippi with a
// stand-in for the talk server's /decide
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createQuests, placesNear, forJev, clockOf, slotOf, DECIDE } from './quests.js';
import { dayOf } from './signs.js';

const json = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const PLACES = json('places.json'), DATA = json('quests.json'), TALK = json('talk.json');
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
// a time on the clock in Mississippi in November 2026, which is six hours behind: '11-10 21:30' is a Tuesday night
const at = (when) => { const [, mo, d, h, mi] = /^(\d+)-(\d+) (\d+):(\d+)$/.exec(when).map(Number); return new Date(Date.UTC(2026, mo - 1, d, h + 6, mi)); };
const clock = (when) => { const c = { t: at(when), set: (w) => { c.t = at(w); }, now: () => c.t }; return c; };
// /decide, as a stand-in: what it was asked, and what it answers next, which a throw stands for a fetch that failed
const jev = (...answers) => { const asked = []; const decide = async (q) => { asked.push(q); const a = answers.shift(); if (a instanceof Error) throw a; return a; }; decide.asked = asked; return decide; };
// the places along Coop's walk are the US 80 bridge's, nearest the pumps, then the near trestle's, so these are their numbers from 0
const BRIDGE = { shape: 'fishing', place: 0, worth: true }, TRESTLE = { shape: 'fishing', place: 1, worth: true };
const quests = (c, decide, store) => createQuests({ data: DATA, places: PLACES.places, decide, store, now: c.now });

describe('data/places.json and data/quests.json', () => {
  test('every place has its own id, a name, a kind and shapes from the lists, and somewhere it is', () => {
    const ids = new Set();
    for (const p of PLACES.places) {
      assert.ok(/^[a-z0-9-]+$/.test(p.id) && !ids.has(p.id), p.id); ids.add(p.id);
      assert.ok(p.name.length > 3 && p.name.length < 120 && PLACES.kinds.includes(p.kind), p.id);
      assert.ok(p.shapes.length && p.shapes.every((s) => PLACES.shapes.includes(s)), p.id);
      assert.ok(p.at.length === 2 && p.at.every(Number.isFinite) && Math.hypot(...p.at) < 20000, p.id);
    }
    assert.deepEqual(PLACES.shapes, ['fishing', 'visit', 'delivery', 'lost', 'dare']);
    assert.ok(PLACES.shapes.every((s) => /^[a-z][a-z-]{0,23}$/.test(s)), 'as /decide takes them');
  });

  test('no place\'s name is an address, and nothing a template or Jev is given has anywhere in it but {place}', () => {
    const addresses = TALK.addresses.map((r) => new RegExp(r)), words = [...DATA.jev.trips, ...Object.entries(DATA.jev).filter(([k]) => k !== 'trips').map(([, v]) => v)];
    for (const p of PLACES.places) for (const r of addresses) assert.doesNotMatch(p.name, r, p.id);
    for (const [shape, t] of Object.entries(DATA.templates)) {
      assert.ok(PLACES.shapes.includes(shape) && DATA.rounds[t.who] && DATA.jev[t.who], shape);
      words.push(...Object.values(t.lines), ...Object.values(t.notes));
    }
    for (const line of words) for (const r of addresses) assert.doesNotMatch(line, r, line);
  });

  test('Coop\'s walk passes the two fishing holes the creative director found nearest the pumps, and nothing else of the list\'s', () => {
    const near = (shapes) => placesNear(PLACES.places, DATA.rounds.coop.way, { shapes, near: DATA.near }).map((p) => p.id);
    assert.deepEqual(near(['fishing']), ['under-us80-east', 'trestle-near']);
    assert.deepEqual(placesNear(PLACES.places, [[645, -70]], { shapes: ['fishing'], near: 1 }).map((p) => p.id), ['under-us80-east'], 'a way that\'s one spot');
  });
});

describe('the clock in Mississippi, and Coop\'s round', () => {
  test('the day is the church signs\', and the minute and whether it\'s Sunday are Mississippi\'s', () => {
    assert.deepEqual(clockOf(at('11-10 09:30')), { day: dayOf(at('11-10 09:30')), min: 570, sun: false });
    assert.equal(clockOf(at('11-11 00:00')).day, clockOf(at('11-10 23:59')).day + 1);
    assert.ok(clockOf(at('11-15 10:00')).sun && !clockOf(at('11-14 10:00')).sun);
  });

  test('behind the counter six to one, his walk, asleep in the back, and on Sunday church and back at noon', () => {
    const where = (when) => { const s = slotOf(DATA.rounds.coop, clockOf(at(when))); return [s.at, s.sign]; };
    assert.deepEqual(where('11-10 09:30'), ['counter', null]);
    assert.deepEqual(where('11-10 00:30'), ['counter', null], 'last night\'s still going');
    assert.deepEqual(where('11-10 01:20'), ['walk', 'BACK AT 6']);
    assert.equal(slotOf(DATA.rounds.coop, clockOf(at('11-10 01:20'))).t, .5, 'halfway round');
    assert.deepEqual(where('11-10 03:00'), ['asleep', 'BACK AT 6']);
    assert.deepEqual(where('11-10 06:00'), ['counter', null]);
    assert.deepEqual(where('11-15 00:30'), ['counter', null], 'Saturday night');
    assert.deepEqual(where('11-15 08:00'), ['asleep', 'BACK AT NOON']);
    assert.deepEqual(where('11-15 10:30'), ['church', 'BACK AT NOON']);
    assert.deepEqual(where('11-15 11:45'), ['away', 'BACK AT NOON']);
    assert.deepEqual(where('11-15 12:00'), ['counter', null]);
    assert.equal(quests(clock('11-10 09:30')).where('rocky'), null, 'and nobody without a round has one');
  });
});

describe('the day\'s idea', () => {
  const near = placesNear(PLACES.places, DATA.rounds.coop.way, { shapes: ['fishing'], near: DATA.near });

  test('/decide is asked in plain words what code knows, with the shapes and the places as words in code\'s order, and nothing anybody typed', () => {
    const q = forJev({ jev: DATA.jev, who: 'coop', places: near, shapes: ['fishing'] });
    assert.deepEqual(Object.keys(q), ['state', 'shapes', 'places']);
    assert.deepEqual(q.places, ['under the US 80 bridge, east of town: fishing', 'the near trestle: fishing']);
    assert.deepEqual(q.shapes, ['fishing']);
    assert.equal(q.state, `${DATA.jev.coop} The neighbor's never been out with him.`);
    assert.equal(forJev({ jev: DATA.jev, who: 'coop', places: near, shapes: ['fishing'], trips: 1, last: 'missed' }).state, `${DATA.jev.coop} The neighbor's been out with him once. ${DATA.jev.missed}`);
    assert.match(forJev({ jev: DATA.jev, who: 'coop', places: near, shapes: ['fishing'], trips: 4, last: 'done' }).state, /out with him 4 times\. The last time he asked, the neighbor came\.$/);
  });

  test('and never more than /decide takes', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: 'x'.repeat(300), shapes: ['fishing'] }));
    const q = forJev({ jev: { coop: 'y'.repeat(5000), trips: ['z'] }, who: 'coop', places: many, shapes: ['fishing'] });
    assert.equal(q.places.length, DECIDE.places);
    assert.ok(q.places.every((p) => p.length <= DECIDE.place) && q.state.length <= DECIDE.state);
  });

  test('at the first look of a day he comes up with one, from the list, once that day, and tells him with the place named by code', async () => {
    const c = clock('11-10 08:00'), decide = jev(TRESTLE), Q = quests(c, decide);
    const idea = await Q.think('coop');
    assert.equal(idea.at.id, 'trestle-near');
    assert.equal(idea.lines.ask, 'Found a hole on my walk last night: the near trestle. Catfish rolling like hogs. I\'m going back at nine. You coming?');
    assert.deepEqual(decide.asked, [forJev({ jev: DATA.jev, who: 'coop', places: near, shapes: ['fishing'] })]);
    assert.equal(await Q.think('coop'), null); assert.equal(decide.asked.length, 1, 'once a day');
    assert.equal(Q.news('coop').say, 'ask'); assert.equal(Q.open('coop'), null, 'nothing to say yes to until he\'s told');
  });

  test('anything /decide says that isn\'t one of its answers is no idea that day', async () => {
    for (const bad of [{ shape: 'fishing', place: 2, worth: true }, { shape: 'fishing', place: -1, worth: true }, { shape: 'fishing', place: '0', worth: true }, { shape: 'fishing', place: .5, worth: true },
      { shape: 'dare', place: 1, worth: true }, { shape: 'supper', place: 0, worth: true }, { ...BRIDGE, worth: false }, { ...BRIDGE, worth: 'yes' }, { shape: 'fishing', place: 0 },
      null, 'fishing', 7, [], { quiet: 'cap' }, { quiet: 'bad' }]) {
      const Q = quests(clock('11-10 08:00'), jev(bad));
      assert.equal(await Q.think('coop'), null, JSON.stringify(bad));
      assert.equal(Q.news('coop'), null);
    }
    assert.equal(await quests(clock('11-10 08:00')).think('coop'), null, 'with no /decide at all');
    assert.equal(await quests(clock('11-10 08:00'), jev(BRIDGE)).think('rocky'), null, 'and nobody comes up with a shape that isn\'t theirs');
  });

  test('quiet for a reason that might pass, it\'s asked once more an hour on, and quiet for one that won\'t, not again that day', async () => {
    for (const first of [{ quiet: 'slow' }, { quiet: 'off' }, { quiet: 'fast' }, new Error('no answer')]) {
      const c = clock('11-10 08:00'), decide = jev(first, TRESTLE), Q = quests(c, decide);
      assert.equal(await Q.think('coop'), null);
      c.set('11-10 08:30'); assert.equal(await Q.think('coop'), null); assert.equal(decide.asked.length, 1, 'not straight away');
      c.set('11-10 09:00'); assert.equal((await Q.think('coop'))?.at.id, 'trestle-near', JSON.stringify(first) ?? 'a throw');
    }
    {
      const c = clock('11-10 08:00'), decide = jev({ quiet: 'slow' }, new Error('no answer'), TRESTLE), Q = quests(c, decide);
      await Q.think('coop'); c.set('11-10 10:00'); await Q.think('coop');
      c.set('11-10 20:00'); assert.equal(await Q.think('coop'), null); assert.equal(decide.asked.length, 2, 'once more and no more');
      c.set('11-11 08:00'); assert.equal((await Q.think('coop')).at.id, 'trestle-near', 'until tomorrow');
    }
    for (const why of ['cap', 'bad']) {
      const c = clock('11-10 08:00'), decide = jev({ quiet: why }, TRESTLE), Q = quests(c, decide);
      await Q.think('coop'); c.set('11-10 20:00');
      assert.equal(await Q.think('coop'), null, why); assert.equal(decide.asked.length, 1, why);
    }
  });

  test('one he was never told is gone with the night, and the next night there\'s another', async () => {
    const c = clock('11-10 08:00'), Q = quests(c, jev(TRESTLE, BRIDGE));
    await Q.think('coop');
    c.set('11-11 08:00');
    assert.equal(Q.news('coop'), null, 'gone before he\'s thought of the next');
    assert.equal((await Q.think('coop')).at.id, 'under-us80-east');
  });
});

describe('the nights it stands', () => {
  test('told him in the day, he\'s at the hole nine to ten that night and the two after, with GONE FISHIN\' on the door from nine', async () => {
    const c = clock('11-10 08:00'), Q = quests(c, jev(TRESTLE));
    await Q.think('coop');
    c.set('11-10 15:00'); Q.told('coop');
    const where = (when) => { c.set(when); const w = Q.where('coop'); return [w.at, w.sign, w.place?.id ?? null]; };
    assert.deepEqual(where('11-10 20:59'), ['counter', null, null]);
    assert.deepEqual(where('11-10 21:02'), ['away', 'GONE FISHIN\'', null]);
    assert.deepEqual(where('11-10 21:30'), ['hole', 'GONE FISHIN\'', 'trestle-near']);
    assert.deepEqual(where('11-10 22:05'), ['away', 'GONE FISHIN\'', null]);
    assert.deepEqual(where('11-10 22:10'), ['counter', null, null]);
    assert.deepEqual(where('11-12 21:30'), ['hole', 'GONE FISHIN\'', 'trestle-near'], 'the third night');
    assert.deepEqual(where('11-12 22:05'), ['away', 'GONE FISHIN\'', null], 'and back from it');
    assert.deepEqual(where('11-13 21:30'), ['counter', null, null], 'and not a fourth');
  });

  test('told him after nine, it\'s the three nights after', async () => {
    const c = clock('11-10 08:00'), Q = quests(c, jev(TRESTLE));
    await Q.think('coop');
    c.set('11-10 23:00'); Q.told('coop');
    c.set('11-11 21:30'); assert.equal(Q.where('coop').at, 'hole');
    c.set('11-13 21:30'); assert.equal(Q.where('coop').at, 'hole');
    c.set('11-14 21:30'); assert.equal(Q.where('coop').at, 'counter');
  });

  test('he can say yes while it stands, and after its last night it\'s lapsed, once, with his note if he said yes, and Jev\'s told how it went', async () => {
    for (const yes of [false, true]) {
      const c = clock('11-10 08:00'), decide = jev(TRESTLE, BRIDGE), Q = quests(c, decide);
      await Q.think('coop');
      c.set('11-10 09:00'); Q.told('coop');
      assert.equal(Q.news('coop'), null, 'nothing new while it stands');
      if (yes) Q.yes('coop');
      assert.equal(Q.open('coop').yes, yes);
      c.set('11-11 08:00'); assert.equal(await Q.think('coop'), null, 'nothing new while it stands');
      c.set('11-12 21:59'); assert.ok(Q.open('coop'), 'until he packs up on the last night');
      c.set('11-12 22:00');
      assert.equal(Q.open('coop'), null);
      Q.yes('coop');
      const news = Q.news('coop');
      assert.deepEqual([news.say, news.lines.lapse], ['lapse', 'Guess you got busy. Fish don\'t wait.']);
      assert.deepEqual(Q.lapsed('coop'), { note: yes ? 'Said yes to fishing at the near trestle, then never showed.' : null });
      assert.equal(Q.news('coop'), null, 'said once');
      assert.equal(await Q.think('coop'), null, 'and nothing new until tomorrow');
      c.set('11-13 08:00'); assert.equal((await Q.think('coop')).at.id, 'under-us80-east');
      assert.ok(decide.asked.at(-1).state.endsWith(yes ? DATA.jev.missed : DATA.jev.lapsed), decide.asked.at(-1).state);
    }
  });

  test('a lapse nobody came by for is closed the next time he does, and then there\'s a new one that day', async () => {
    const c = clock('11-10 08:00'), Q = quests(c, jev(TRESTLE, BRIDGE));
    await Q.think('coop'); Q.told('coop');
    c.set('11-14 08:00');
    assert.equal(await Q.think('coop'), null, 'not over the top of it');
    assert.equal(Q.news('coop').say, 'lapse'); Q.lapsed('coop');
    assert.equal((await Q.think('coop')).at.id, 'under-us80-east');
  });

  test('the first time he\'s out there with them it\'s done for him, with the rod, the trust the first time ever and their note, and they still go the nights after', async () => {
    const c = clock('11-10 08:00'), Q = quests(c, jev(TRESTLE, BRIDGE));
    await Q.think('coop'); Q.told('coop');
    c.set('11-10 20:00'); assert.equal(Q.came('coop'), null, 'only while he\'s out there');
    c.set('11-10 21:30');
    const first = Q.came('coop');
    assert.deepEqual([first.reward, first.note, first.lines.came, first.lines.done], [{ rod: true, worms: 6, trust: 1 }, 'Came fishing with me at the near trestle.', 'You came. Spare rod, and worms.', 'That\'s me. Keep the rod. It never caught me nothing.']);
    assert.equal(Q.came('coop'), null, 'once');
    assert.equal(Q.open('coop'), null, 'with nothing more to say yes to');
    c.set('11-11 21:30'); assert.equal(Q.where('coop').at, 'hole', 'he still goes');
    assert.equal(await Q.think('coop'), null, 'and has nothing new while he does');
    c.set('11-12 22:30'); assert.equal(Q.news('coop'), null, 'nor any lapse');
    c.set('11-13 08:00'); assert.equal((await Q.think('coop')).at.id, 'under-us80-east'); Q.told('coop');
    c.set('11-13 21:30');
    assert.deepEqual(Q.came('coop').reward, { rod: true, worms: 6, trust: 0 }, 'the trust only the first time ever');
    assert.equal(Q.trips('coop'), 2);
  });
});

test('it\'s remembered between visits, Forget everyone forgets it, and a place taken off the list takes its idea with it', async () => {
  const store = memory(), c = clock('11-10 08:00'), Q = quests(c, jev(TRESTLE), store);
  await Q.think('coop'); Q.told('coop');
  c.set('11-10 21:30');
  assert.equal(quests(c, null, store).where('coop').at, 'hole');
  const without = createQuests({ data: DATA, places: PLACES.places.filter((p) => p.id !== 'trestle-near'), store, now: c.now });
  assert.equal(without.where('coop').at, 'counter');
  Q.forget();
  assert.equal(store.m.size, 0);
  for (const junk of ['[1,2]', '"x"', '{"coop":{"idea":{"shape":"fishing","place":"trestle-near","told":"x"},"trips":"two"}}']) {
    const odd = memory(); odd.setItem('chunky.quests.v1', junk);
    const q = quests(c, null, odd);
    assert.doesNotThrow(() => [q.news('coop'), q.where('coop'), q.open('coop'), q.came('coop'), q.trips('coop')], junk);
  }
});
