// Who everyone is and what they remember, and what that does to the crowd on an empty field.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFolks, personOf, burntDown, hipsOf, flickering, BE, AFTER, AWAY, TAILING, HOW, WORDS } from './agents.js';
import { createHorde, SHAMBLE, CURIOUS, HUNTING, SWARM, GRABBING, AVOIDING, TRAILING, STUNNED, ROUSED, TUNING } from './horde.js';

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

  test('and an eighth are Gressetts, out of the other half', () => {
    const gressetts = list.filter((w) => w.family === 'Gressett');
    assert.equal(gressetts.length, 50);
    assert.ok(gressetts.every((w) => w.id % 4 >= 2));
    // each of them has a first name of their own until there've been more of them than names
    assert.equal(new Set(gressetts.map((w) => w.first)).size, 50);
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

  test('nobody\'s name sounds like one of the cast\'s, so whoever he hears about is the only one', () => {
    const cast = JSON.parse(readFileSync(new URL('../data/cast.json', import.meta.url), 'utf8')).cast;
    // Bobbie and Bobby: the same name said aloud, near enough, once the ending's let go and a doubled letter's said once
    const sound = (n) => n.toLowerCase().replace(/(ie|ey|y|i|e)$/, '').replace(/(.)\1+/g, '$1');
    const theirs = new Set(cast.flatMap((c) => c.name.split(' ').filter((w) => !/^(Miss|Mr|Mrs|Uncle|Aunt)$/.test(w)).map(sound)));
    for (const name of [...data.women, ...data.men]) assert.ok(!theirs.has(sound(name)), `${name} sounds like one of the cast`);
  });

  test('a name\'s only ever listed once', () => {
    for (const k of ['women', 'men', 'others']) assert.equal(new Set(data[k]).size, data[k].length, k);
    // the names take turns, seventeen at a time, so that has to reach all of them
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    assert.equal(gcd(data.women.length, 17), 1); assert.equal(gcd(data.men.length, 17), 1);
  });

  const many = Array.from({ length: 3000 }, (_, i) => personOf(i, data, looks));
  test('about one in fifteen of the crowd in town have burnt down and one in five from 3 km out, and it\'s the furthest gone who have', () => {
    const share = (out) => many.filter((w) => burntDown(w, out)).length / many.length;
    assert.ok(Math.abs(share(0) - 1 / 15) < .012, `${share(0)} in town`); assert.equal(share(800), share(0));
    assert.ok(Math.abs(share(4000) - 1 / 5) < .02, `${share(4000)} out of town`);
    assert.ok(share(2000) > share(0) && share(2000) < share(4000), 'and more of them on the way out');
    assert.ok(many.filter((w) => burntDown(w, 0)).every((w) => w.looks.phase / 6.28 > 14 / 15));
    assert.ok(!many.some((w) => burntDown({ ...w, calm: true }, 4000)), 'and nobody at home has');
  });

  test('how far over they stand goes with how far gone they are, the burnt-down ones furthest, and the quiet ones spread evenly between', () => {
    for (const out of [0, 4000]) {
      const burnt = many.filter((w) => burntDown(w, out)).map((w) => hipsOf(w, out)), quiet = many.filter((w) => !burntDown(w, out)).map((w) => hipsOf(w, out));
      assert.ok(burnt.every((h) => h >= 0 && h <= 30) && quiet.every((h) => h >= 30 && h <= 150), 'burnt down 0° to 30°, gone quiet 30° to 150°');
      assert.ok(Math.min(...burnt) < 2 && Math.max(...quiet) > 148, 'and the whole of each');
      assert.ok(Math.max(...burnt) <= Math.min(...quiet), 'nobody quiet is as far over as anyone burnt down');
      // a quarter of the quiet ones in each quarter of their range
      for (const [lo, hi] of [[30, 60], [60, 90], [90, 120], [120, 150]]) assert.ok(Math.abs(quiet.filter((h) => h >= lo && h < hi).length / quiet.length - .25) < .03, `${lo}° to ${hi}°`);
    }
    // further gone, further over
    const sorted = [...many].sort((a, b) => a.looks.phase - b.looks.phase).map((w) => hipsOf(w, 0));
    assert.ok(sorted.every((h, i) => i === 0 || h <= sorted[i - 1]));
    // the same person stands the same way anywhere in town
    assert.ok(many.every((w) => hipsOf(w, 0) === hipsOf(w, HOW.burntOut[0] - 1)));
    // and nobody at home has burnt down, so they're all on the quiet ones' range
    assert.ok(many.every((w) => { const h = hipsOf({ ...w, calm: true }, 4000); return h >= 30 && h <= 150; }));
  });

  test('anyone numbered further over than a table stays folded over and scuttles after him, and that\'s every one who\'s burnt down', () => {
    const h = createHorde(field(folks(), { hips: (s) => hipsOf(s.who, 0), quiet: (s) => !burntDown(s.who, 0) }));
    const all = Array.from({ length: 400 }, (_, i) => h.add(i % 20, Math.floor(i / 20)));
    assert.ok(all.every((s) => s.scuttle === s.hips < 90));
    assert.ok(all.filter((s) => !s.quiet).every((s) => s.scuttle));
    const low = all.filter((s) => s.scuttle).length / all.length;
    assert.ok(low > .4 && low < .65, `${low} of them`);
  });

  test('the cast who\'ve only quit a little stand a little over, the further gone the further over', () => {
    const cast = JSON.parse(readFileSync(new URL('../data/looks.json', import.meta.url))).cast;
    const hips = ['bobby', 'coop', 'rocky'].map((id) => flickering(cast[id].degree));
    assert.ok(hips.every((h) => h >= 150 && h <= 170), `${hips}`);
    assert.ok(hips[0] > hips[1] && hips[1] > hips[2], 'Miss Bobby least, then Coop, then Rocky');
  });

  test('everyone has something to mutter, by their number, and between them it\'s all of it', () => {
    assert.equal(data.mutters.length, 20);
    assert.ok(list.every((w) => data.mutters.includes(w.says)));
    assert.equal(new Set(list.map((w) => w.says)).size, data.mutters.length);
    assert.equal(personOf(41, data, looks).says, personOf(41, data, looks).says);
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

  test('nobody is lost to the river: an old save that says someone was comes back with them, and what it says of them is kept', () => {
    const store = memory(), key = `chunky.folks.v${data.version}`;
    store.setItem(key, JSON.stringify({ clock: 500, rows: { 1: { gone: true, hurt: 2, when: 400, met: true, near: 12 }, 3: { gone: true } } }));
    const F = folks(store), one = F.person(1);
    assert.equal(one.gone, undefined); assert.equal(one.hurt, 2); assert.equal(one.met, true); assert.equal(F.now(), 500);
    assert.deepEqual([F.next().id, F.next().id, F.next().id, F.next().id], [0, 1, 2, 3], 'and everyone takes their turn, the one it lost too');
    assert.deepEqual(F.met().map((w) => w.id), [1]);
    // and what it writes next doesn't say it
    F.hurt(F.person(5), 0, 0, 'hit'); F.save();
    const rows = JSON.parse(store.getItem(key)).rows;
    assert.ok(Object.values(rows).every((r) => r.gone === undefined), 'nobody\'s gone'); assert.equal(rows[1].hurt, 2); assert.equal(rows[3], undefined, 'and a row with nothing else in it takes no room');
    assert.equal(F.gone, undefined);
  });

  test('a save that can\'t be read counts as none, and a browser that won\'t keep anything still plays', () => {
    const store = memory(); store.setItem(`chunky.folks.v${data.version}`, '{nope'); assert.equal(folks(store).person(1).hurt, 0);
    const F = createFolks(data, { store: null, looks }); F.hurt(F.person(1), 0, 0, 'hit'); F.save(); assert.equal(F.hasSave(), false);
  });

  test('forgetting everyone means everyone', () => {
    const store = memory(), F = folks(store), w = F.person(2); F.close(w, 5); F.hurt(w, 0, 0, 'hit'); F.fooled(w, 'bottle'); F.next(); F.save();
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
    assert.equal(s(timid).state, AVOIDING); assert.equal(s(bold).state, ROUSED, 'the bold one is up, and stands there a moment first');
    run(h, still, 1.2);
    assert.ok(s(bold).state === HUNTING || s(bold).state === SWARM || s(bold).state === GRABBING, `state ${s(bold).state}`);
    run(h, { ...still, canGrab: false }, 3);
    assert.ok(Math.hypot(s(timid).x, s(timid).z) > 6, 'the timid one got away from him');
    assert.ok(Math.hypot(s(bold).x, s(bold).z) < 3, 'the bold one came at him');
  });

  test('one who\'s gone quiet takes something thrown at them the same way: the bold one comes for him and the timid one keeps away', () => {
    for (const [like, comes] of [[(w) => w.nerve > .7 && w.temper > .7, true], [(w) => w.nerve < .15, false]]) {
      const F = folks(), w = someone(F, like), h = createHorde(field(F, { quiet: () => true })), s = bring(h, F, w, 2, 0);
      run(h, still, .5);
      assert.equal(s.state, SHAMBLE, 'they leave him be until then');
      assert.equal(h.provoke(s, 'thrown'), 1); assert.equal(w.hurt, 1); assert.equal(F.mood(w), comes ? AFTER : AWAY);
      run(h, { ...still, canGrab: false }, 3);
      if (comes) assert.ok(Math.hypot(s.x, s.z) < 1.5, `came at him, to ${Math.hypot(s.x, s.z).toFixed(1)} m`);
      else { assert.equal(s.state, AVOIDING); assert.ok(Math.hypot(s.x, s.z) > 6, 'got away from him'); }
    }
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
    // the one without a grudge at one end and the one with at the other, whichever order they came in
    s(not).x = s(not).tx = 2; s(not).z = s(not).tz = -30; s(hit).x = s(hit).tx = 2; s(hit).z = s(hit).tz = 30;
    F.hurt(hit, 0, 0, 'hit');
    run(h, { ...still, canGrab: false, acting: true, x: 0, z: -30 }, 1);
    assert.equal(s(not).state, SHAMBLE); assert.ok(s(not).sus > 0, 'though they looked twice');
    run(h, { ...still, canGrab: false, acting: true, x: 0, z: 30 }, 1);
    assert.equal(s(hit).state, ROUSED, 'the one with a grudge stops and turns to him first'); assert.equal(s(not).state, SHAMBLE);
    run(h, { ...still, canGrab: false, acting: true, x: 0, z: 30 }, TUNING.rouseFor);
    assert.ok(s(hit).state === HUNTING || s(hit).state === SWARM, `state ${s(hit).state}`);
  });

  test('someone who keeps away doesn\'t answer the swarm\'s call', () => {
    const F = folks(), timid = someone(F, (w) => w.nerve < .15), h = createHorde(field(F)), s = bring(h, F, timid, 30, 0);
    F.hurt(timid, 0, 0, 'hit');
    const others = [0, 1, 2, 3].map((i) => { const o = h.add(32, i - 1.5); o.who = null; o.state = HUNTING; return o; });
    run(h, { ...still, x: 40, noise: 0, canGrab: false }, 2);
    assert.ok(others.length); assert.equal(s.state, SHAMBLE);
  });

  test('backed into a wall with him right there, even they\'ll turn on him, stopping and flaring for a second first, and then go back to keeping away', () => {
    const F = folks(), timid = someone(F, (w) => w.nerve < .15), told = [], wall = { blocked: (x, z) => x > 2 || Math.abs(z) > .6 };
    const h = createHorde(field(F, wall), {}, { roused: (s, why) => told.push(why.kind) }), s = bring(h, F, timid, 1.5, 0);
    F.hurt(timid, 0, 0, 'hit');
    const p = { ...still, canGrab: false };
    let t = 0; while (s.state !== ROUSED && t < 6) { run(h, p, 1 / 30); t += 1 / 30; }
    assert.equal(s.state, ROUSED, 'it stops first'); assert.deepEqual(told, ['cornered']); assert.ok(!s.rouse.over);
    run(h, p, TUNING.rouseFor + .1);
    assert.equal(s.state, HUNTING, 'and then it turns on him, though it\'s the kind that keeps away'); assert.ok(s.turned > 0);
    run(h, { ...p, x: -2 }, TUNING.turnsFor + 1);
    assert.equal(s.state, AVOIDING);
  });

  test('and backing off in that second sends it back to keeping away, and it\'s left alone a few seconds before it tries it again', () => {
    const F = folks(), timid = someone(F, (w) => w.nerve < .15), told = [], wall = { blocked: (x, z) => x > 2 || Math.abs(z) > .6 };
    const h = createHorde(field(F, wall), {}, { roused: (s, why) => told.push(why.kind) }), s = bring(h, F, timid, 1.5, 0);
    F.hurt(timid, 0, 0, 'hit');
    const p = { ...still, canGrab: false };
    let t = 0; while (s.state !== ROUSED && t < 6) { run(h, p, 1 / 30); t += 1 / 30; }
    assert.equal(s.state, ROUSED);
    run(h, { ...p, x: -2 }, .1);
    assert.equal(s.state, AVOIDING); assert.deepEqual(told, ['cornered']);
    // standing right there again, it's still against the wall, and it doesn't stop for him again till it's been left alone for its time
    run(h, p, TUNING.coolFor - .5); assert.notEqual(s.state, ROUSED); assert.deepEqual(told, ['cornered']);
  });

  test('however many are cornered, no more than three are after him: the rest only look up', () => {
    const F = folks(), timid = someone(F, (w) => w.nerve < .15), wall = { blocked: (x, z) => x > 2 || Math.abs(z) > .6 };
    const h = createHorde(field(F, wall)), s = bring(h, F, timid, 1.5, 0);
    F.hurt(timid, 0, 0, 'hit');
    // three already after him, a long way up the wall
    const hunters = [0, 1, 2].map((i) => { const o = h.add(-30, 40 + i); o.state = HUNTING; o.who.calm = false; return o; });
    let hunted = false, looked = false;
    for (let k = 0; k < 30 * 8; k++) {
      for (const o of hunters) { o.state = HUNTING; o.lost = 0; }
      h.update(1 / 30, { ...still, canGrab: false });
      if (s.state === HUNTING || (s.state === ROUSED && !s.rouse.over)) hunted = true;
      if (s.state === ROUSED && s.rouse.over) looked = true;
    }
    assert.ok(!hunted, 'it didn\'t come for him'); assert.ok(looked, 'it only looked up');
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

  test('wise to a thrown bottle, it no longer turns them to look, and a different kind of thing still does', () => {
    const F = folks(), wise = someone(F, (w) => w.nosy > .95 && w.nerve > .4 && w.nerve < .6), fresh = someone(F, (w) => w.nosy > .95, wise.id), order = wise.id < fresh.id ? [wise, fresh] : [fresh, wise];
    const h = createHorde(field(F)), ss = order.map((w) => bring(h, F, w, 40, 0)), s = (w) => ss[order.indexOf(w)];
    F.fooled(wise, 'bottle'); F.fooled(wise, 'bottle');
    run(h, { ...still, x: -60, canGrab: false }, .05);
    h.look(45, 0, 30, 10, 'bottle');
    assert.ok(s(fresh).gaze); assert.equal(fresh.fooled.bottle, 1); assert.ok(!s(wise).gaze); assert.equal(wise.fooled.bottle, 2);
    run(h, { ...still, x: -60, canGrab: false }, 11);
    h.look(45, 0, 30, 10, 'crackers');
    assert.ok(s(wise).gaze, 'and firecrackers still work on them'); assert.equal(wise.fooled.crackers, 1);
  });

  test('the church bell is only noise, and nobody gets used to it, since nobody comes to it', () => {
    const F = folks(), w = someone(F, (x) => x.nosy > .95), h = createHorde(field(F)), s = bring(h, F, w, 40, 0, { quiet: false });
    run(h, { ...still, x: -60, canGrab: false }, .05);
    for (let i = 0; i < 6; i++) { h.noise(45, 0, 160, 10, 'bell'); run(h, { ...still, x: -60, canGrab: false }, 12); }
    assert.deepEqual(w.fooled, {}, 'nothing has fooled them');
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

  describe('the river gives them back', () => {
    // water everywhere to start with, and downstream is south: dry just above where they come up
    // and the train throws them in
    const wade = (F, w, extra = {}) => {
      const h = createHorde(field(F, { water: (x, z) => z < 20, level: () => 0, floorAt: (x, z) => (z < 20 ? -2 : 0), comeUp: (s, how) => ({ x: s.x, z: 19, bank: [s.x, 21] }), ...extra })), s = bring(h, F, w, 1, 0);
      h.update(1 / 30, { ...still, x: 50, canGrab: false });
      h.runOver(() => ({ x: 1, z: 0, vx: 0, vz: 0, vy: 0, seconds: 3 }));
      return { h, s };
    };

    test('the same person comes up, with everything they remember, and nobody new takes their turn', () => {
      const F = folks(), w = someone(F, (x) => x.nerve > .5);
      F.hurt(w, 3, 4, 'hit'); F.fooled(w, 'bottle'); F.close(w, 5);
      const { h, s } = wade(F, w), hurt = w.hurt, mood = F.mood(w), n = h.all.length;
      run(h, { ...still, x: 50, canGrab: false }, 1);
      assert.ok(s.under !== undefined, 'under');
      assert.deepEqual(w.shun, [1, 0], 'they remember where the river had them'); assert.equal(w.hurt, hurt, 'but not that it was him');
      run(h, { ...still, x: 50, canGrab: false }, TUNING.goesUnder + TUNING.below[1] + 1);
      assert.equal(s.under, undefined); assert.equal(s.who, w); assert.equal(w.body, s);
      assert.equal(w.hurt, hurt); assert.equal(F.mood(w), mood); assert.equal(w.fooled.bottle >= 1, true); assert.equal(w.met, true);
      assert.equal(h.all.length, n); assert.equal(w.gone, undefined);
      assert.equal(F.next().id, n, 'and the next to come out is whoever was next, because nobody was sent for');
    });

    test('how long they\'re under, how far they\'re taken and how long the snake hangs on are theirs, from their number', () => {
      const ids = [3, 8, 13, 21, 34, 55], swept = [], snake = [];
      for (const id of ids) {
        const run1 = () => {
          const F = folks(), up = [], { h, s } = wade(F, F.person(id), {}); h.on.surfaced = (o) => up.push(o.snake);
          const p = { ...still, x: 50, canGrab: false }; let t = 0;
          for (; t < 60 && s.under === undefined; t += 1 / 30) h.update(1 / 30, p);
          const was = s.swept, under = s.under;
          for (let k = 0; k < 40 * 30 && s.under !== undefined; k++) h.update(1 / 30, p);
          return [was, under, up[0]];
        };
        const [a, under, snk] = run1(), [b, under2, snk2] = run1();
        assert.equal(a, b, 'the same every time'); assert.equal(under, under2); assert.equal(snk, snk2);
        swept.push(a.toFixed(2)); snake.push(snk.toFixed(2));
      }
      assert.ok(new Set(swept).size >= 5 && new Set(snake).size >= 5, `${swept} ${snake}`);
    });
  });

  test('being knocked over counts once however many things hit them at once', () => {
    const F = folks(), h = createHorde(field(F)), s = h.add(1, 0);
    run(h, still, .05);
    h.knock(0, 0, 3, 2); h.knock(0, 0, 3, 2);
    assert.equal(s.who.hurt, 1);
  });

  test('STUNNED stays what it was, for what the page checks, and every state has a speed, ROUSED at the end of them', () => { assert.equal(STUNNED, 5); assert.equal(ROUSED, 8); assert.equal(TUNING.speed.length, 9); assert.equal(TUNING.speed[ROUSED], 0); });

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

  test('its horn draws nobody, since everyone in Chunky has heard it every day for years: there is nothing for it to call, and nothing is got used to', () => {
    const F = folks(), h = createHorde(field(F));
    const a = h.add(10, 0), b = h.add(-10, 0);
    b.who.calm = true;
    assert.equal(h.lure, undefined);
    run(h, { ...still, z: 200 }, .3);
    run(h, { ...still, z: 200 }, 10);
    assert.ok(Math.hypot(a.x - 10, a.z) < 1.5 && Math.hypot(b.x + 10, b.z) < 1.5, `they're where they were: ${a.x}, ${b.x}`);
    assert.deepEqual(a.who.fooled, {}); assert.deepEqual(b.who.fooled, {});
  });
});

describe('why one comes for him', () => {
  // Nothing on screen says why, and nothing's written for it: no lines in data/folks.json and no element in the page. The cause is only kept, as { kind, her }, for what has to still be true by
  // the end of the second for someone woken by something about him, and for the tests.
  test('nothing says why: there are no lines for it, and no element in the page to put them in', () => {
    assert.equal(data.why, undefined);
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.ok(!/id="why"/.test(html) && !/#why\b/.test(html) && !/\$\('why'\)/.test(html));
  });

  test('what the game knows of who\'s a woman is which list their name came from', () => {
    const list = Array.from({ length: 400 }, (_, i) => personOf(i, data, looks));
    assert.ok(data.women.every((n) => !data.men.includes(n)), 'no name is on both lists');
    assert.ok(list.every((w) => w.her === data.women.includes(w.first)));
    assert.ok(list.filter((w) => w.her).length > 150 && list.filter((w) => !w.her).length > 150);
  });

  test('hitting a woman is her, to her and to everyone gone quiet who saw it, and a man is him', () => {
    for (const her of [true, false]) {
      const F = folks(), victim = someone(F, (w) => w.her === her), by = someone(F, (w) => w.id !== victim.id), told = [];
      const order = victim.id < by.id ? [victim, by] : [by, victim], h = createHorde(field(F, { quiet: () => true }), {}, { roused: (s, why) => told.push({ who: s.who.id, kind: why.kind, her: why.her }) });
      const ss = order.map((w, i) => bring(h, F, w, 1 + i * 3, 0)), s = (w) => ss[order.indexOf(w)];
      run(h, still, .05);
      h.knock(s(victim).x, 0, 1, 1);
      assert.deepEqual(told, [{ who: by.id, kind: 'hit', her }], 'the one who saw it, straight away');
      run(h, { ...still, canGrab: false }, 1.5);
      assert.deepEqual(told.map((t) => [t.kind, t.her]), [['hit', her], ['hit', her]], 'and the one he hit, as it gets up'); assert.equal(told[1].who, victim.id);
    }
  });

  test('someone with a grudge is woken by that, whatever it was they heard, and it\'s the grudge that\'s theirs', () => {
    const F = folks(), w = someone(F, (x) => x.nerve > .8 && x.temper > .5 && x.her), told = [], h = createHorde(field(F), {}, { roused: (s, why) => told.push({ kind: why.kind, her: why.her }) });
    F.hurt(w, 0, 0, 'hit'); assert.equal(F.mood(w), AFTER);
    const s = bring(h, F, w, 9, 0);
    run(h, { ...still, noise: 14, canGrab: false }, 4);
    assert.deepEqual(told, [{ kind: 'hit', her: true }]);
    assert.ok(s.state === HUNTING || s.state === SWARM);
  });

  test('nobody stays on him for good, even with a grudge: lost for eight seconds, they go home', () => {
    const F = folks(), w = someone(F, (x) => x.nerve > .8 && x.temper > .9), h = createHorde(field(F), {});
    F.hurt(w, 0, 0, 'hit'); F.hurt(w, 0, 0, 'hit');
    const s = bring(h, F, w, 9, 0);
    run(h, { ...still, noise: 14, canGrab: false }, 4);
    assert.ok(s.state === HUNTING || s.state === SWARM, `${s.state}`);
    run(h, { ...still, x: -200, canGrab: false }, TUNING.giveUp + 1);
    assert.equal(s.state, SHAMBLE); assert.ok(s.homeward);
  });
});
