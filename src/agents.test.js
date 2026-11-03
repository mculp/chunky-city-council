// Who everyone is and what they remember, and what that does to the crowd on an empty field.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFolks, personOf, BE, AFTER, AWAY, TAILING, HOW, WORDS } from './agents.js';
import { createHorde, SHAMBLE, HUNTING, SWARM, GRABBING, AVOIDING, TRAILING, STUNNED, TUNING } from './horde.js';

const data = JSON.parse(readFileSync(new URL('../data/folks.json', import.meta.url)));
const looks = JSON.parse(readFileSync(new URL('../data/looks.json', import.meta.url))).crowd;
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
const folks = (store = memory()) => createFolks(data, { store, looks });
// The first person whose number makes them like this
const someone = (F, like, skip = -1) => { for (let i = 0; i < 2000; i++) { if (i === skip) continue; const w = F.person(i); if (like(w)) return w; } throw new Error('nobody like that'); };

let seed = 1;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const field = (F, extra = {}) => ({ blocked: () => false, water: () => false, floorAt: () => 0, wander: (s) => [s.x, s.z], rand, folks: F, ...extra });
const still = { x: 0, z: 0, y: 0, noise: 0, light: 0, beans: 0, night: 1, hidden: false, canGrab: true };
const run = (h, p, seconds, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) h.update(dt, p); };
// Adds the person with this number: everybody before them is added too, a long way off
const bring = (h, F, w, x, z) => { let s; do { s = h.add(1e5, 1e5); } while (s.who !== w); s.x = s.tx = s.homeX = x; s.z = s.tz = s.homeZ = z; return s; };

describe('who they are', () => {
  const list = Array.from({ length: 400 }, (_, i) => personOf(i, data, looks));

  test('the same number is always the same person', () => {
    assert.deepEqual(personOf(17, data, looks), personOf(17, data, looks));
  });

  test('half of everyone is an Alexander or a Clark, and half of those are each', () => {
    const count = (name) => list.filter((w) => w.family === name).length;
    assert.equal(count('Alexander'), 100); assert.equal(count('Clark'), 100);
    assert.ok(data.others.every((n) => !data.families.includes(n)));
  });

  test('hardly anyone in the first couple of hundred shares a whole name', () => {
    const names = list.slice(0, 200).map((w) => w.name), repeats = names.filter((n, i) => names.indexOf(n) !== i);
    assert.ok(repeats.length <= 2, `${repeats}`);
  });

  test('a church dress is a woman and a bare chest is a man', () => {
    for (const w of list) {
      const dressed = looks[w.looks.look % looks.length].id;
      if (dressed === 'church-dress') assert.ok(data.women.includes(w.first), w.name);
      if (dressed === 'shirtless') assert.ok(data.men.includes(w.first), w.name);
    }
  });

  test('what they\'re like covers the range', () => {
    for (const k of ['temper', 'nerve', 'nosy', 'homebody', 'tagalong']) {
      const v = list.map((w) => w[k]), mean = v.reduce((a, b) => a + b) / v.length;
      assert.ok(Math.min(...v) < .1 && Math.max(...v) > .9 && Math.abs(mean - .5) < .07, `${k} ${mean}`);
    }
  });

  test('nobody has a name from the lore or the cast', () => {
    const lore = readFileSync(new URL('../docs/lore.md', import.meta.url), 'utf8'), cast = readFileSync(new URL('../data/cast.json', import.meta.url), 'utf8');
    const said = (name) => new RegExp(`\\b${name}\\b`).test(lore) || new RegExp(`\\b${name}\\b`).test(cast);
    for (const name of [...data.women, ...data.men, ...data.others]) assert.ok(!said(name), name);
  });

  test('a name\'s only ever listed once', () => {
    for (const k of ['women', 'men', 'others']) assert.equal(new Set(data[k]).size, data[k].length, k);
    // the names take turns, seventeen at a time, so that has to reach all of them
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    assert.equal(gcd(data.women.length, 17), 1); assert.equal(gcd(data.men.length, 17), 1);
  });
});

describe('how they take it', () => {
  test('someone nothing has happened to is just how they are', () => {
    const F = folks(), w = F.person(3);
    assert.equal(F.mood(w), BE); assert.equal(F.word(w), '');
  });

  test('hit once, the bold come back at him and the rest keep away', () => {
    const F = folks(), bold = someone(F, (w) => w.nerve > .7), timid = someone(F, (w) => w.nerve < .2);
    F.hurt(bold, 0, 0, 'hit'); F.hurt(timid, 0, 0, 'hit');
    assert.equal(F.mood(bold), AFTER); assert.equal(F.mood(timid), AWAY);
    assert.equal(F.word(bold), WORDS[AFTER]); assert.equal(F.word(timid), WORDS[AWAY]);
  });

  test('hit enough, even the bold keep away', () => {
    const F = folks(), w = someone(F, (x) => x.nerve > .6 && x.nerve < .8 && x.temper < .6);
    F.hurt(w, 0, 0, 'hit'); assert.equal(F.mood(w), AFTER);
    for (let i = 0; i < 4; i++) F.hurt(w, 0, 0, 'hit');
    assert.equal(F.mood(w), AWAY);
  });

  test('being there when it happens only moves the ones at either end', () => {
    const F = folks(), bold = someone(F, (w) => w.nerve > .9 && w.temper > .6), timid = someone(F, (w) => w.nerve < .1 && w.temper < .5), mid = someone(F, (w) => w.nerve > .45 && w.nerve < .55 && w.temper > .4 && w.temper < .6);
    for (const w of [bold, timid, mid]) F.wasThere(w);
    assert.equal(F.mood(bold), AFTER); assert.equal(F.mood(timid), AWAY); assert.equal(F.mood(mid), BE);
  });

  test('being there fades, and sooner for the calm than the quick to anger', () => {
    const F = folks(), calm = someone(F, (w) => w.nerve < .1 && w.temper < .2), hot = someone(F, (w) => w.nerve < .1 && w.temper > .8);
    F.wasThere(calm); F.wasThere(hot);
    F.tick(100); assert.equal(F.mood(calm), BE); assert.notEqual(F.mood(hot), BE);
    F.tick(1000); assert.equal(F.mood(hot), BE);
  });

  test('being hit never quite goes away', () => {
    const F = folks(), w = someone(F, (x) => x.nerve < .2);
    F.hurt(w, 0, 0, 'hit'); F.tick(1e6);
    assert.equal(F.mood(w), AWAY);
  });

  test('a fire isn\'t his doing, but they keep off where it happened', () => {
    const F = folks(), w = F.person(1);
    F.hurt(w, 10, 20, 'fire');
    assert.equal(w.hurt, 0); assert.equal(F.mood(w), BE); assert.ok(F.shuns(w, 12, 25)); assert.ok(!F.shuns(w, 60, 25));
  });

  test('the nosy ones follow him about once they\'ve been close long enough, and nobody else does', () => {
    const F = folks(), nosy = someone(F, (w) => w.nosy > .9), not = someone(F, (w) => w.nosy < .5);
    for (let i = 0; i < 60; i++) { F.close(nosy, .2); F.close(not, .2); }
    assert.equal(F.mood(nosy), TAILING); assert.equal(F.mood(not), BE);
    assert.ok(nosy.met && not.met);
  });

  test('nobody follows him about after getting hold of him', () => {
    const F = folks(), w = someone(F, (x) => x.nosy > .9);
    F.close(w, 60); F.got(w);
    assert.equal(F.mood(w), BE);
  });

  test('the same lure only works so many times, and nosy people catch on first', () => {
    const F = folks(), nosy = someone(F, (w) => w.nosy > .95), slow = someone(F, (w) => w.nosy < .05);
    F.fooled(nosy, 'bottle'); assert.ok(!F.wise(nosy, 'bottle'));
    F.fooled(nosy, 'bottle'); assert.ok(F.wise(nosy, 'bottle')); assert.ok(!F.wise(nosy, 'crackers'));
    for (let i = 0; i < 4; i++) F.fooled(slow, 'bottle');
    assert.ok(!F.wise(slow, 'bottle')); F.fooled(slow, 'bottle'); assert.ok(F.wise(slow, 'bottle'));
  });

  test('it gets around within a family, for a while, and only from who saw it', () => {
    const F = folks(), a = F.person(0), kin = F.person(4), other = F.person(1), third = F.person(8);
    assert.equal(a.family, kin.family); assert.notEqual(a.family, other.family);
    assert.equal(F.tell(a, kin), false);
    F.hurt(a, 0, 0, 'hit');
    assert.equal(F.tell(a, other), false); assert.equal(other.told, 0);
    assert.equal(F.tell(a, kin), true); assert.equal(kin.told, 1);
    assert.equal(F.tell(a, kin), false);
    assert.equal(F.tell(kin, third), false);
    F.tick(HOW.news + 1);
    assert.equal(F.tell(a, third), false);
  });

  test('the panel hears when someone he\'s met changes', () => {
    const F = folks(), w = someone(F, (x) => x.nerve < .2);
    F.close(w, 5); assert.equal(F.recent, w); F.recent = null;
    F.hurt(w, 0, 0, 'hit'); assert.equal(F.recent, w); F.recent = null;
    F.hurt(w, 0, 0, 'hit'); assert.equal(F.recent, null);
  });
});

describe('kept between sessions', () => {
  test('they come back with what they remember, and what they\'re like', () => {
    const store = memory(), F = folks(store), w = someone(F, (x) => x.nerve < .2);
    F.close(w, 5); F.hurt(w, 3, 4, 'truck'); F.fooled(w, 'bottle'); w.body = { x: 11.4, z: 22.6 }; F.tick(30); F.save();
    const again = folks(store), was = again.person(w.id);
    assert.equal(was.name, w.name); assert.equal(was.hurt, 1); assert.equal(was.truck, 1); assert.deepEqual(was.fooled, { bottle: 1 }); assert.deepEqual(was.shun, [3, 4]); assert.deepEqual(was.where, [11, 23]);
    assert.equal(again.mood(was), AWAY); assert.equal(again.now(), 30); assert.deepEqual(again.latest(5).map((x) => x.id), [w.id]);
  });

  test('only who has something to remember takes up any room', () => {
    const store = memory(), F = folks(store);
    for (let i = 0; i < 200; i++) F.next();
    F.hurt(F.person(5), 0, 0, 'hit'); F.save();
    const saved = JSON.parse(store.getItem(`chunky.folks.v${data.version}`));
    assert.deepEqual(Object.keys(saved.rows), ['5']); assert.ok(store.getItem(`chunky.folks.v${data.version}`).length < 200);
  });

  test('it saves by itself every so often, but only if anything\'s happened', () => {
    const store = memory(), F = folks(store);
    F.tick(HOW.saveEvery + 1); assert.equal(F.hasSave(), false);
    F.hurt(F.person(5), 0, 0, 'hit'); F.tick(HOW.saveEvery + 1); assert.equal(F.hasSave(), true);
  });

  test('anyone the river had doesn\'t come back, and someone new takes their turn', () => {
    const store = memory(), F = folks(store); F.next(); F.gone(F.person(1)); F.save();
    const again = folks(store); assert.equal(again.next().id, 0); assert.equal(again.next().id, 2);
    assert.deepEqual(again.met(), []);
  });

  test('a save that can\'t be read counts as none, and a browser that won\'t keep anything still plays', () => {
    const store = memory(); store.setItem(`chunky.folks.v${data.version}`, '{nope'); assert.equal(folks(store).person(1).hurt, 0);
    const F = createFolks(data, { store: null, looks }); F.hurt(F.person(1), 0, 0, 'hit'); F.save(); assert.equal(F.hasSave(), false);
  });

  test('forgetting everyone means everyone', () => {
    const store = memory(), F = folks(store), w = F.person(2); F.close(w, 5); F.hurt(w, 0, 0, 'hit'); F.fooled(w, 'bottle'); F.gone(F.person(0)); F.next(); F.save();
    F.forget();
    assert.equal(F.hasSave(), false); assert.equal(w.hurt, 0); assert.equal(F.mood(w), BE); assert.deepEqual(F.met(), []); assert.equal(F.next().id, 0);
  });
});

describe('what it does in the crowd', () => {
  test('a person\'s look and their number come with them, without changing what else the crowd draws', () => {
    const F = folks(), a = createHorde(field(F)), b = createHorde(field(null));
    seed = 5; const s = a.add(1, 2), n = rand(); seed = 5; const t = b.add(1, 2);
    assert.equal(rand(), n); assert.equal(s.who.id, 0); assert.equal(s.look, s.who.looks.look); assert.equal(s.phase, s.who.looks.phase); assert.equal(t.who, undefined);
  });

  test('the same hit leaves one coming at him from further off and the other keeping away', () => {
    const F = folks(), bold = someone(F, (w) => w.nerve > .7 && w.temper > .7), timid = someone(F, (w) => w.nerve < .15), order = bold.id < timid.id ? [bold, timid] : [timid, bold];
    const h = createHorde(field(F)), ss = order.map((w) => bring(h, F, w, 1, 0)), s = (w) => ss[order.indexOf(w)];
    run(h, still, .05);
    for (const x of ss) { x.x = 1; x.z = 0; }
    h.knock(0, 0, 3, .5);
    assert.equal(bold.hurt, 1); assert.equal(timid.hurt, 1);
    run(h, still, 1.2);
    assert.equal(s(timid).state, AVOIDING); assert.ok(s(bold).state === HUNTING || s(bold).state === SWARM || s(bold).state === GRABBING, `state ${s(bold).state}`);
    run(h, { ...still, canGrab: false }, 3);
    assert.ok(Math.hypot(s(timid).x, s(timid).z) > 6, 'the timid one got away from him');
    assert.ok(Math.hypot(s(bold).x, s(bold).z) < 3, 'the bold one came at him');
  });

  test('someone with a grudge can tell from further off than someone without', () => {
    const F = folks(), hit = someone(F, (w) => w.nerve > .7 && w.temper > .3 && w.temper < .7), not = someone(F, (w) => w.temper > .3 && w.temper < .7, hit.id), order = hit.id < not.id ? [hit, not] : [not, hit];
    const h = createHorde(field(F)), ss = order.map((w) => bring(h, F, w, 26, 0)), s = (w) => ss[order.indexOf(w)];
    F.hurt(hit, 0, 0, 'hit');
    const walking = { ...still, noise: 14, canGrab: false };
    run(h, walking, 4);
    assert.ok(s(hit).state === HUNTING || s(hit).state === SWARM, `state ${s(hit).state}`); assert.equal(s(not).state === HUNTING || s(not).state === SWARM, false);
  });

  test('shambling along with them fools anyone but someone with a grudge', () => {
    const F = folks(), hit = someone(F, (w) => w.nerve > .7 && w.temper > .3 && w.temper < .7), not = someone(F, (w) => w.nosy < .5, hit.id), order = hit.id < not.id ? [hit, not] : [not, hit];
    const h = createHorde(field(F)), ss = order.map((w, i) => bring(h, F, w, 2, i ? 30 : -30)), s = (w) => ss[order.indexOf(w)];
    F.hurt(hit, 0, 0, 'hit');
    run(h, { ...still, canGrab: false, acting: true, x: 0, z: -30 }, 1);
    run(h, { ...still, canGrab: false, acting: true, x: 0, z: 30 }, 1);
    assert.ok(s(hit).state === HUNTING || s(hit).state === SWARM, `state ${s(hit).state}`);
    assert.equal(s(not).state, SHAMBLE); assert.ok(s(not).sus > 0, 'though they looked twice');
  });

  test('someone who keeps away doesn\'t answer the swarm\'s call', () => {
    const F = folks(), timid = someone(F, (w) => w.nerve < .15), h = createHorde(field(F)), s = bring(h, F, timid, 30, 0);
    F.hurt(timid, 0, 0, 'hit');
    const others = [0, 1, 2, 3].map((i) => { const o = h.add(32, i - 1.5); o.who = null; o.state = HUNTING; return o; });
    run(h, { ...still, x: 40, noise: 0, canGrab: false }, 2);
    assert.ok(others.length); assert.equal(s.state, SHAMBLE);
  });

  test('backed into a wall with him right there, even they\'ll turn on him, and then go back to keeping away', () => {
    const F = folks(), timid = someone(F, (w) => w.nerve < .15), h = createHorde(field(F, { blocked: (x, z) => x > 2 || Math.abs(z) > .6 })), s = bring(h, F, timid, 1.5, 0);
    F.hurt(timid, 0, 0, 'hit');
    run(h, { ...still, canGrab: false }, 2.2);
    assert.equal(s.state, HUNTING);
    run(h, { ...still, x: -2, canGrab: false }, TUNING.turnsFor + 1);
    assert.equal(s.state, AVOIDING);
  });

  test('anyone a truck has hit gets out of the way of a truck, even if they\'d come at him on foot', () => {
    const F = folks(), bold = someone(F, (w) => w.nerve > .8 && w.temper > .5), h = createHorde(field(F)), s = bring(h, F, bold, 5, 0);
    F.hurt(bold, 0, 0, 'truck');
    const p = { ...still, canGrab: false, noise: 14 };
    run(h, { ...p, driving: true }, .5); assert.equal(s.state, AVOIDING);
    run(h, p, 1); assert.notEqual(s.state, AVOIDING);
  });

  test('someone following keeps their distance and stops to face him', () => {
    const F = folks(), nosy = someone(F, (w) => w.nosy > .9 && w.tagalong < .5), h = createHorde(field(F)), s = bring(h, F, nosy, 20, 0);
    F.close(nosy, HOW.nearFor + 1);
    run(h, { ...still, canGrab: false }, 30);
    const gap = TUNING.trailGap[0] + (TUNING.trailGap[1] - TUNING.trailGap[0]) * nosy.temper, d = Math.hypot(s.x, s.z);
    assert.equal(s.state, TRAILING); assert.ok(Math.abs(d - gap) < 2.2, `${d} vs ${gap}`); assert.equal(s.moving, 0);
    assert.ok(Math.abs(Math.sin(s.yaw - Math.atan2(-s.x, -s.z))) < .1, 'facing him');
    run(h, { ...still, x: 60, canGrab: false }, 20);
    assert.equal(s.state, SHAMBLE);
  });

  test('hit someone following him and they stop', () => {
    const F = folks(), nosy = someone(F, (w) => w.nosy > .9 && w.nerve < .2 && w.tagalong < .5), h = createHorde(field(F)), s = bring(h, F, nosy, 12, 0);
    F.close(nosy, HOW.nearFor + 1); run(h, { ...still, canGrab: false }, .5);
    assert.equal(s.state, TRAILING);
    h.knock(s.x, s.z, 1, .5); run(h, { ...still, canGrab: false }, 1.2);
    assert.equal(F.mood(nosy), AWAY); assert.notEqual(s.state, TRAILING);
  });

  test('wise to a lure, they stay on him', () => {
    const F = folks(), wise = someone(F, (w) => w.nosy > .95 && w.nerve > .4 && w.nerve < .6), fresh = someone(F, (w) => w.nosy > .95, wise.id), order = wise.id < fresh.id ? [wise, fresh] : [fresh, wise];
    const h = createHorde(field(F)), ss = order.map((w) => bring(h, F, w, 40, 0)), s = (w) => ss[order.indexOf(w)];
    F.fooled(wise, 'bottle'); F.fooled(wise, 'bottle');
    h.lure(45, 0, 30, 10, false, 'bottle');
    run(h, { ...still, canGrab: false }, .4);
    assert.ok(s(fresh).drawn); assert.equal(fresh.fooled.bottle, 1); assert.ok(!s(wise).drawn); assert.equal(wise.fooled.bottle, 2);
  });

  test('the church bell is a lure of its own, and wears off the same way', () => {
    const F = folks(), wise = someone(F, (w) => w.nosy > .95), fresh = someone(F, (w) => w.nosy > .95, wise.id), order = wise.id < fresh.id ? [wise, fresh] : [fresh, wise];
    const h = createHorde(field(F)), ss = order.map((w) => bring(h, F, w, 40, 0)), s = (w) => ss[order.indexOf(w)];
    F.fooled(wise, 'bell'); F.fooled(wise, 'bell');
    h.bell(45, 0, 160, 10);
    run(h, { ...still, canGrab: false }, .4);
    assert.ok(s(fresh).drawn); assert.equal(fresh.fooled.bell, 1); assert.ok(!s(wise).drawn);
    assert.ok(!F.wise(fresh, 'bottle'), 'and a bottle still works on them');
  });

  test('they go along with their own people', () => {
    const F = folks(), kin = (w) => w.family === 'Clark', lead = someone(F, (w) => kin(w) && w.tagalong < .2), tag = someone(F, (w) => kin(w) && w.tagalong > .7);
    const order = lead.id < tag.id ? [lead, tag] : [tag, lead];
    const h = createHorde(field(F, { wander: (s) => (s.who === lead ? [s.x + 8, s.z] : [s.x, s.z]) })), ss = order.map((w, i) => bring(h, F, w, i * 6, 0)), s = (w) => ss[order.indexOf(w)];
    const far = { ...still, x: 100, canGrab: false };
    run(h, far, 25);
    assert.equal(s(tag).lead, s(lead)); assert.ok(Math.hypot(s(tag).x - s(lead).x, s(tag).z - s(lead).z) < 8);
    assert.ok(s(lead).x > 8, 'and off they went');
  });

  test('a homebody doesn\'t get far', () => {
    const F = folks(), home = someone(F, (w) => w.homebody > .95 && w.tagalong < .5), h = createHorde(field(F, { wander: (s) => [s.x + 10, s.z] })), s = bring(h, F, home, 0, 0);
    run(h, { ...still, x: 100, z: 100, canGrab: false }, 400);
    assert.ok(Math.hypot(s.x, s.z) < F.roam(home) + 12, `${s.x}`);
  });

  test('they keep off where they were hurt', () => {
    const F = folks(), w = someone(F, (x) => x.nerve > .7 && x.tagalong < .5), h = createHorde(field(F, { wander: (s) => [s.x + 8, s.z] })), s = bring(h, F, w, 0, 0);
    F.hurt(w, 14, 0, 'hit');
    h.update(.01, { ...still, x: -100, canGrab: false }); s.timer = 0; s.next = 0; s.tx = s.x; h.update(.01, { ...still, x: -100, canGrab: false });
    assert.ok(F.shuns(w, 8, 0)); assert.ok(s.tx < s.x + .5, `${s.tx}`);
  });

  test('what grabs him remembers how that went', () => {
    const F = folks(), h = createHorde(field(F)), s = h.add(.5, 0);
    run(h, { ...still, noise: 14 }, 3);
    assert.ok(h.grab); assert.equal(s.state, GRABBING);
    for (let i = 0; i < 30 && h.grab; i++) h.mash();
    assert.equal(s.who.slipped, 1);
    const t = createHorde(field(F, {}), { grabHold: .1 }), u = t.add(.5, 0); run(t, { ...still, noise: 14 }, 3);
    assert.ok(u.who.got >= 1);
  });

  test('the river has them for good', () => {
    const F = folks(), h = createHorde(field(F, { water: () => true }), { bite: [.1, .1], goesUnder: .1 }), s = h.add(1, 0);
    s.wading = true; h.lure(2, 0, 10, 5, true, 'bottle');
    run(h, { ...still, x: 50, canGrab: false }, 2);
    assert.equal(s.who.gone, true); assert.ok(!h.all.includes(s));
  });

  test('being knocked over counts once however many things hit them at once', () => {
    const F = folks(), h = createHorde(field(F)), s = h.add(1, 0);
    run(h, still, .05);
    h.knock(0, 0, 3, 2); h.knock(0, 0, 3, 2);
    assert.equal(s.who.hurt, 1);
  });

  test('STUNNED stays what it was, for what the page checks', () => { assert.equal(STUNNED, 5); assert.equal(TUNING.speed.length, 8); });

  test('thinking about it all stays cheap', () => {
    const F = folks(), h = createHorde(field(F));
    for (let i = 0; i < 400; i++) h.add((i % 20) * 7, Math.floor(i / 20) * 7);
    for (let i = 0; i < 100; i++) F.hurt(F.person(i), 0, 0, 'hit');
    const began = performance.now(), p = { ...still, x: 70, z: 70, noise: 14, canGrab: false };
    for (let i = 0; i < 300; i++) h.update(1 / 30, p);
    const ms = (performance.now() - began) / 300;
    assert.ok(ms < 4, `${ms.toFixed(2)} ms a frame for 400 of them`);
  });
});

describe('the train', () => {
  test('nobody holds it against him, though they keep off the spot', () => {
    const F = folks(), w = someone(F, () => true), was = F.mood(w);
    F.hurt(w, 10, 20, 'train');
    assert.equal(w.hurt, 0); assert.equal(w.when, 0); assert.equal(F.mood(w), was); assert.deepEqual(w.shun, [10, 20]);
    assert.ok(F.shuns(w, 11, 21));
  });

  test('its horn draws the crowd to a crossing, but not someone who\'s lived with it, and not forever', () => {
    const F = folks(), h = createHorde(field(F));
    const a = h.add(10, 0), b = h.add(-10, 0);
    b.who.calm = true;
    run(h, still, .3);
    h.lure(30, 0, 95, 20, false, 'train');
    const bWas = b.x;
    run(h, still, 2.5);
    assert.ok(a.x > 11, `one came, to ${a.x}`);
    assert.ok(Math.abs(b.x - bWas) < 1.5, `the other's still where they were, ${b.x}`);
    assert.ok(a.who.fooled.train >= 1, 'and it counts');
    assert.ok(!b.who.fooled?.train, 'and nothing to the other');
  });
});
