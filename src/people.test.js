// The relationship system and the cast file it runs on.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createPeople, checkCast, parseCondition, moveMeter } from './people.js';

const data = JSON.parse(readFileSync(new URL('../data/cast.json', import.meta.url)));
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const ctx = () => { const c = { flags: {}, items: {}, beans: 0, addBeans: (n) => { c.beans += n; } }; return c; };

// The owner: "the only time in history this set of words was arranged"
describe('what Robby said', () => {
  const WORDS = 'hey man, help me get these flies out of here so we can cook some deer meat';

  test('it\'s the owner\'s words, exactly', () => assert.equal(data.dialogue.robby.lines[0].say, WORDS));

  test('and they\'re nowhere else in the game\'s data', () => {
    for (const f of readdirSync(new URL('../data/', import.meta.url)).filter((n) => n.endsWith('.json'))) {
      const text = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').toLowerCase(), times = text.split(WORDS).length - 1;
      assert.equal(times, f === 'cast.json' ? 1 : 0, f);
      if (f !== 'cast.json') assert.doesNotMatch(text, /deer meat|flies out of here/, f);
    }
  });

  test('he says it the once, and that\'s remembered, even after coming back to the game', () => {
    const store = memory(), c = ctx(), first = createPeople(data, { store }), said = first.line('robby', c);
    assert.equal(said.say, WORDS);
    first.apply(said.do, c);
    assert.equal(first.line('robby', c).say, '...');
    const back = { ...ctx(), flags: createPeople(data, { store }).flags() };
    assert.equal(createPeople(data, { store }).line('robby', back).say, '...');
  });

  test('and he\'s got nothing else to say', () => {
    assert.equal(data.dialogue.robby.lines.length, 2);
    assert.deepEqual(data.dialogue.robby.opts, [{ say: '...' }]);
  });
});

describe('the cast file', () => {
  test('has nothing that would only go wrong in play', () => assert.deepEqual(checkCast(data), []));

  test('the check can fail', () => {
    const broken = JSON.parse(JSON.stringify(data));
    broken.dialogue.coopWho.opts[0].to = 'nowhere';
    broken.dialogue.coopNah.lines[0].do[0].meter = 'coop.love';
    assert.equal(checkCast(broken).length, 2);
  });

  test('a rename has to point at someone, and the old name can\'t still be in use', () => {
    const broken = JSON.parse(JSON.stringify(data));
    broken.renamed = { tre: 'nobody', coop: 'rocky' };
    assert.equal(checkCast(broken).length, 2);
  });

  test('every node can be reached from someone you can talk to', () => {
    const seen = new Set(), walk = (id) => {
      if (seen.has(id)) return; seen.add(id);
      for (const o of [...data.dialogue[id].opts || [], ...data.dialogue[id].lines.flatMap((l) => l.opts || [])]) if (o.to) walk(o.to);
    };
    for (const c of data.cast) walk(c.id);
    assert.deepEqual(Object.keys(data.dialogue).filter((id) => !seen.has(id)), []);
  });

  // The owner, playing: "Miss Bobby just shows up as Bobby on the people list"
  test('Miss Bobby is Miss Bobby in the people list too', () => assert.equal(data.cast.find((c) => c.id === 'bobby').short, 'Miss Bobby'));
});

describe('meters', () => {
  test('stop at their limits', () => {
    const p = createPeople(data);
    p.change('rocky', 'trust', 99); assert.equal(p.get('rocky', 'trust'), 3);
    p.change('rocky', 'fear', -5); assert.equal(p.get('rocky', 'fear'), 0);
  });

  test('helping one person costs you with another, but falling out earns nothing back', () => {
    const p = createPeople(data);
    p.change('coop', 'trust', 2); assert.equal(p.get('bobby', 'trust'), -1);
    p.change('coop', 'trust', -2); assert.equal(p.get('bobby', 'trust'), -1);
    assert.equal(p.get('rocky', 'trust'), 0);
  });

  test('a tie doesn\'t set off another tie', () => {
    const p = createPeople(data);
    p.change('coop', 'trust', 1);
    assert.equal(p.get('coop', 'trust'), 1);
  });

  test('how a meter moves is one rule, which a town that\'s shared moves its own by, and a tie to someone not there is nothing', () => {
    const meters = { coop: { trust: 2.5, fear: 0 }, bobby: { trust: 0, fear: 0 } };
    moveMeter(data, meters, 'coop', 'trust', 1);
    assert.deepEqual(meters, { coop: { trust: 3, fear: 0 }, bobby: { trust: -.5, fear: 0 } });
    assert.doesNotThrow(() => moveMeter(data, { bobby: { trust: 0, fear: 0 } }, 'bobby', 'trust', 1));
  });
});

describe('saving', () => {
  test('meters, remembered flags and who you\'ve met survive a reload', () => {
    const store = memory(), c = ctx(), p = createPeople(data, { store });
    p.apply([{ meter: 'rocky.trust', by: 2 }, { set: 'tank' }, { set: 'delivered' }], c); p.meet('rocky');
    const q = createPeople(data, { store });
    assert.equal(q.get('rocky', 'trust'), 2);
    assert.deepEqual(q.flags(), { tank: true }, 'a flag that belongs to one run isn\'t kept');
    assert.ok(q.known().some((x) => x.id === 'rocky'));
  });

  test('a save from before Tre was Rocky and Miss Odessa was Miss Bobby keeps what they thought of him', () => {
    const store = memory(), KEY = `chunky.people.v${data.version}`;
    store.setItem(KEY, JSON.stringify({ meters: { tre: { trust: 2, fear: 1 }, odessa: { trust: -1 }, coop: { debt: 3 } }, flags: { metTre: true, tank: true }, met: ['tre', 'odessa', 'robby'] }));
    const p = createPeople(data, { store });
    assert.equal(p.get('rocky', 'trust'), 2); assert.equal(p.get('rocky', 'fear'), 1); assert.equal(p.get('bobby', 'trust'), -1); assert.equal(p.get('coop', 'debt'), 3);
    assert.deepEqual(p.flags(), { metRocky: true, tank: true });
    p.change('coop', 'trust', 1);
    assert.deepEqual(JSON.parse(store.getItem(KEY)).met.sort(), ['bobby', 'robby', 'rocky'], 'and it\'s saved under their new names');
  });

  test('a person with no meters yet starts at zero', () => {
    const store = memory();
    createPeople(data, { store }).change('rocky', 'trust', 1);
    const more = { ...data, cast: [...data.cast, { id: 'new', name: 'New', short: 'New' }] };
    const q = createPeople(more, { store });
    assert.equal(q.get('new', 'trust'), 0); assert.equal(q.get('rocky', 'trust'), 1);
    assert.ok(!q.known().some((x) => x.id === 'new'), 'and they aren\'t shown until you meet them');
  });

  test('a save that can\'t be read counts as no save', () => {
    const store = memory(); store.setItem(`chunky.people.v${data.version}`, '{not json');
    assert.equal(createPeople(data, { store }).get('coop', 'trust'), 0);
    store.setItem(`chunky.people.v${data.version}`, JSON.stringify({ meters: { coop: { trust: 'lots', fear: 99 } } }));
    const p = createPeople(data, { store });
    assert.equal(p.get('coop', 'trust'), 0); assert.equal(p.get('coop', 'fear'), 3);
  });

  test('a browser that won\'t store anything still plays', () => {
    const store = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
    const p = createPeople(data, { store }); p.change('coop', 'trust', 1);
    assert.equal(p.get('coop', 'trust'), 1); assert.equal(p.hasSave(), false);
    p.forget(); assert.equal(p.get('coop', 'trust'), 0);
    const none = createPeople(data); none.change('coop', 'trust', 1); assert.equal(none.get('coop', 'trust'), 1);
  });

  test('forgetting wipes it', () => {
    const store = memory(), p = createPeople(data, { store }); p.change('coop', 'trust', 1);
    assert.ok(p.hasSave()); p.forget(); assert.ok(!p.hasSave());
    assert.equal(createPeople(data, { store }).get('coop', 'trust'), 0);
  });
});

describe('dialogue', () => {
  test('conditions read flags, items, meters and beans', () => {
    assert.deepEqual(parseCondition('!metCoop'), { flag: 'metCoop', not: true });
    assert.deepEqual(parseCondition('has:bag'), { item: 'bag', not: false });
    assert.deepEqual(parseCondition('coop.trust >= 1'), { who: 'coop', meter: 'trust', op: '>=', value: 1 });
    assert.deepEqual(parseCondition('beans < 3'), { what: 'beans', op: '<', value: 3 });
    assert.throws(() => parseCondition('coop.trust !! 3'));
    const p = createPeople(data), c = ctx(); c.items.bag = 1; c.beans = 3; p.change('rocky', 'trust', 1);
    assert.ok(p.check(['has:bag', '!metCoop', 'rocky.trust >= 1', 'beans >= 3'], c));
    assert.ok(!p.check(['has:bag', 'metCoop'], c));
    c.items.bag = 0; assert.ok(p.check(['!has:bag'], c));
  });

  test('the first line whose conditions hold is the one said', () => {
    const p = createPeople(data), c = ctx();
    assert.match(p.line('coop', c).say, /Look what the river spat out/);
    p.apply(p.line('coop', c).do, c);
    assert.match(p.line('coop', c).say, /What you need, river boy/);
    c.flags.delivered = true;
    assert.match(p.line('coop', c).say, /Three cans, like I said/);
  });

  test('options come and go with their conditions', () => {
    const p = createPeople(data), c = ctx(), says = () => p.line('coop', c).opts.map((o) => o.say);
    assert.ok(says().includes('I need beans.')); assert.ok(says().includes('Nice chain.'));
    c.items.bag = 1; c.flags.chain = true;
    assert.ok(!says().includes('I need beans.')); assert.ok(!says().includes('Nice chain.'));
  });

  test('effects move beans, items and meters, and can have conditions of their own', () => {
    const p = createPeople(data), c = ctx();
    p.apply(p.line('rockyHand', c).do, c);
    assert.equal(c.beans, 2); assert.equal(c.items.bag, -1); assert.ok(c.flags.delivered);
    assert.equal(p.get('rocky', 'trust'), 1); assert.equal(p.get('coop', 'debt'), -3);
    const first = p.line('rocky', ctx());
    const fresh = createPeople(data), d = ctx();
    fresh.apply(first.do, d); fresh.apply(first.do, d);
    assert.equal(fresh.get('rocky', 'fear'), 1, 'only the first meeting counts');
  });

  test('the whole favor nets Coop out of your debt', () => {
    const p = createPeople(data), c = ctx();
    for (const id of ['coopBag', 'rockyHand']) p.apply(p.line(id, c).do, c);
    assert.equal(p.get('coop', 'debt'), -3);
    p.apply(p.line('coop', c).do, c);
    assert.equal(p.get('coop', 'debt'), 0); assert.equal(c.beans, 5); assert.equal(c.items.bag, 0);
  });

  test('the steps are paid for out of the pantry, and she only asks while it has something', () => {
    const p = createPeople(data), c = ctx();
    let paid = 0;
    c.pantry = 2; c.fromPantry = () => { paid++; c.beans += c.pantry; c.pantry = 0; };
    const asks = () => p.line('bobby', c).opts.some((o) => o.to === 'bobbyBeans');
    assert.ok(asks());
    p.apply(data.events.swept, c);
    assert.equal(paid, 1); assert.equal(c.beans, 2); assert.ok(c.flags.swept);
    assert.ok(!asks());
    c.flags.swept = false;
    assert.ok(!asks(), 'not with nothing on the shelves');
  });
});
