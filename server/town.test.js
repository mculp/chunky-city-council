import test from 'node:test';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import { createTown } from './town.js';
import { readFileSync } from 'node:fs';
import { encodePose, decodeMessage, decodePose, HOW } from '../src/net.js';
import { encodeParts, partsIn } from '../src/wrecks.js';
import { BRIDGE, createAside } from '../src/aside.js';

const farm = JSON.parse(readFileSync(new URL('../data/farm.json', import.meta.url), 'utf8'));

const pose = (x = 1, y = 2, z = 3, extra) => encodePose(100, x, y, z, 0, extra);
const key = (n) => n.toString(16).padStart(64, '0');
let keys = 0;
const hello = (over = {}) => ({ keyHash: key(++keys), name: 'Junebug', look: 2, ...over });
// let in, and the id they were given
const inTown = (t, over) => { const r = t.join(hello(over)); assert.ok(r.id, `turned away: ${JSON.stringify(r.no)}`); return r.id; };
const to = (out, who) => out.filter((o) => o.to === who).map((o) => o.msg);
const kinds = (out) => out.map((o) => `${o.to}:${o.msg.t}${o.close ? '!' : ''}`);

// ---------------- coming in
test('everyone who joins gets an id of their own, and a welcome with their name and look', () => {
  const t = createTown(), a = t.join(hello({ name: 'Miss Bobby', look: 5 })), b = t.join(hello());
  assert.notEqual(a.id, b.id);
  const [welcome] = to(a.out, a.id);
  assert.deepEqual({ ...welcome, cars: undefined, wrecks: undefined }, { t: 'welcome', id: a.id, name: 'Miss Bobby', look: 5, hero: false, saved: null, minds: {}, cars: undefined, wrecks: undefined });
});

test('everyone hears who\'s here each time someone comes', () => {
  const t = createTown(), a = inTown(t, { name: 'Junebug' }), b = t.join(hello({ name: 'Miss Bobby', look: 6 }));
  const [who] = to(b.out, 'all');
  assert.equal(who.t, 'who');
  assert.deepEqual(who.players, [{ id: a, name: 'Junebug', look: 2, hero: false }, { id: b.id, name: 'Miss Bobby', look: 6, hero: false }]);
});

test('the town checks the name itself, and says why without letting them in', () => {
  const t = createTown(), r = t.join(hello({ name: '' }));
  assert.equal(r.id, undefined);
  assert.equal(r.no.t, 'no'); assert.equal(r.no.why, 'name'); assert.match(r.no.say, /name/i);
  assert.equal(t.join(hello({ name: 'Matt<b>' })).no.why, 'name');
});

test('a name is tidied the way the phone tidies it', () => {
  const t = createTown(), r = t.join(hello({ name: '  Miss   Bobby ' }));
  assert.equal(to(r.out, r.id)[0].name, 'Miss Bobby');
});

test('a look that isn\'t one is the first', () => {
  const t = createTown();
  for (const look of [-1, 1.5, 'red', 999, null]) { const r = t.join(hello({ look })); assert.equal(to(r.out, r.id)[0].look, 0, String(look)); }
});

test('nobody can join a full town, until someone leaves', () => {
  const t = createTown({ max: 2 }), a = inTown(t); inTown(t);
  const r = t.join(hello());
  assert.equal(r.no.why, 'full');
  t.leave(a);
  assert.ok(t.join(hello()).id);
});

test('an id isn\'t used twice, so a name doesn\'t pass to whoever comes next', () => {
  const t = createTown({ max: 1 }), a = inTown(t); t.leave(a);
  assert.notEqual(inTown(t), a);
});

// ---------------- where everyone is
test('someone isn\'t in the snapshot until they\'ve said where they are, or they\'d stand on Stuckey\'s Bridge', () => {
  const t = createTown(), a = inTown(t);
  assert.equal(decodeMessage(t.snapshot()).players.length, 0);
  t.move(a, pose(40, 2, -30));
  const { players } = decodeMessage(t.snapshot());
  assert.equal(players.length, 1); assert.equal(players[0].id, a); assert.equal(players[0].x, 40);
});

test('someone who leaves is gone from the snapshot, and from who\'s here', () => {
  const t = createTown(), a = inTown(t), b = inTown(t);
  t.move(a, pose()); t.move(b, pose());
  const out = t.leave(a);
  assert.deepEqual(decodeMessage(t.snapshot()).players.map((p) => p.id), [b]);
  assert.deepEqual(to(out, 'all')[0].players.map((p) => p.id), [b]);
});

test('a pose of the wrong size, or not a number, or off the map, changes nothing', () => {
  const t = createTown(), a = inTown(t);
  t.move(a, pose(5, 0, 5));
  t.move(a, new Uint8Array(3)); t.move(a, pose(NaN)); t.move(a, pose(1e6, 0, 0)); t.move(a, pose(0, 0, -1e6));
  assert.equal(decodeMessage(t.snapshot()).players[0].x, 5);
});

test('the pose is kept as a copy, so the socket\'s buffer can be reused under it', () => {
  const t = createTown(), a = inTown(t), b = pose(7, 0, 7);
  t.move(a, b); b.fill(0);
  assert.equal(decodeMessage(t.snapshot()).players[0].x, 7);
});

test('someone who has gone quiet is on the list to be dropped, counting from when they joined, and a bad pose isn\'t being heard', () => {
  let now = 0; const t = createTown({ clock: () => now }), a = inTown(t);
  now = 4000; assert.deepEqual(t.silent(now, 5000), []);
  now = 5001; assert.deepEqual(t.silent(now, 5000), [a]);
  t.move(a, pose()); assert.deepEqual(t.silent(now, 5000), []);
  now = 10002; t.move(a, new Uint8Array(3)); assert.deepEqual(t.silent(now, 5000), [a]);
});

test('someone who\'s only saying what they carry isn\'t quiet, which is how a newcomer stays in town through the opening before they\'re anywhere', () => {
  let now = 0; const t = createTown({ clock: () => now }), a = inTown(t);
  now = 4000; t.keep(a, { beans: 1 });
  now = 8000; assert.deepEqual(t.silent(now, 5000), []);
  assert.equal(decodeMessage(t.snapshot()).players.length, 0);
  now = 9001; assert.deepEqual(t.silent(now, 5000), [a]);
});

// ---------------- coming back
test('someone coming back is welcomed with where they were and what they had', () => {
  let now = 0; const t = createTown({ clock: () => now }), me = hello({ name: 'Junebug' });
  const a = t.join(me).id;
  t.move(a, encodePose(100, 120, 1.5, -40, 2));
  t.keep(a, { beans: 4, items: { bottle: 2, crackers: 1 }, gas: 1 });
  t.leave(a);
  const back = t.join({ ...me, name: 'Junebug Two' });
  const { saved, name } = to(back.out, back.id)[0];
  assert.equal(name, 'Junebug Two', 'the name they come back with is the one they use');
  assert.equal(saved.x, 120); assert.equal(saved.z, -40); assert.ok(Math.abs(saved.yaw - 2) < .001); assert.ok(Math.abs(saved.y - 1.5) < .01);
  assert.deepEqual({ beans: saved.beans, items: saved.items, gas: saved.gas }, { beans: 4, items: { bottle: 2, crackers: 1 }, gas: 1 });
});

test('someone new has nothing saved, even with a name someone else used', () => {
  const t = createTown(), a = t.join(hello({ name: 'Junebug' })); t.move(a.id, pose()); t.leave(a.id);
  const b = t.join(hello({ name: 'Junebug' }));
  assert.equal(to(b.out, b.id)[0].saved, null);
});

test('what they carry is kept only as numbers the game could have, so nobody can fill the town\'s memory', () => {
  const t = createTown(), me = hello(), a = t.join(me).id;
  t.move(a, pose());
  t.keep(a, { beans: 1e9, gas: -3, items: { bottle: 2, ['x'.repeat(200)]: 1, crackers: 'lots', ...Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`thing${i}`, 1])) } });
  t.leave(a);
  const back = t.join(me), s = to(back.out, back.id)[0].saved;
  assert.equal(s.beans, 999); assert.equal(s.gas, 0);
  assert.equal(s.items.bottle, 2); assert.equal(s.items.crackers, undefined); assert.equal(s.items['x'.repeat(200)], undefined);
  assert.ok(Object.keys(s.items).length <= 32);
});

test('the same phone joining again takes over from where it already was, so it\'s never in town twice', () => {
  const t = createTown(), me = hello(), a = t.join(me).id, b = t.join(me);
  assert.deepEqual(kinds(b.out.filter((o) => o.to === a)), [`${a}:no!`]);
  assert.equal(to(b.out, a)[0].why, 'elsewhere');
  assert.deepEqual(to(b.out, 'all')[0].players.map((p) => p.id), [b.id]);
});

test('what the town holds goes into a save and comes back out of it', () => {
  const t = createTown(), me = hello(), a = t.join(me).id;
  t.move(a, encodePose(100, 33, 0, 44, 1)); t.keep(a, { beans: 2, items: {}, gas: 0 });
  assert.equal(t.dirty, true);
  const save = JSON.parse(JSON.stringify(t.dump()));
  assert.equal(t.dirty, false);
  const u = createTown(); u.load(save);
  const back = u.join(me);
  assert.equal(to(back.out, back.id)[0].saved.x, 33);
  assert.equal(JSON.stringify(save).includes(me.keyHash), true, 'kept by the hash of their key, which is all the town ever sees');
});

// ---------------- how much it keeps, so that however many come, it's still one value Cloudflare can keep
const keptIn = (t) => Object.keys(t.dump().players).sort();

test('the town keeps so many, and lets go of whoever\'s been away longest', () => {
  const t = createTown({ keeps: 2 }), [a, b, c] = [hello(), hello(), hello()];
  t.leave(t.join(a).id); t.leave(t.join(b).id); t.leave(t.join(a).id);
  t.join(c);
  assert.deepEqual(keptIn(t), [a.keyHash, c.keyHash].sort(), 'b, who\'d been away longest, since a came back');
  assert.deepEqual(t.forgotten(), [b.keyHash], 'and what the cast remember of them is to go too, wherever it\'s kept');
  assert.deepEqual(t.forgotten(), [], 'once');
});

test('nobody who\'s here is let go, however long ago they came', () => {
  const t = createTown({ keeps: 2 }), [a, b, c] = [hello(), hello(), hello()];
  t.join(a); t.leave(t.join(b).id); t.join(c);
  assert.deepEqual(keptIn(t), [a.keyHash, c.keyHash].sort());
});

test('someone who\'s been let go comes back as someone new, with nothing, and what they were told that wasn\'t kept yet isn\'t', () => {
  const t = createTown({ keeps: 1 }), a = hello(), id = t.join(a).id;
  t.move(id, pose(40, 0, 50)); t.keep(id, { beans: 3 }); t.mind(id, { who: 'coop', said: 'Hey.' }); t.leave(id);
  t.leave(t.join(hello()).id);
  assert.deepEqual(t.keepMinds(), []);
  const back = t.join(a);
  assert.equal(to(back.out, back.id)[0].saved, null);
  assert.deepEqual(to(back.out, back.id)[0].minds, {});
});

test('a vehicle is only one the game could have, so nobody can fill the town with where they left them', () => {
  const t = createTown(), a = inTown(t);
  t.move(a, pose(1, 2, 3, { ride: 4097 }));
  assert.equal(decodeMessage(t.snapshot()).players[0].ride, 0, 'on foot, to everyone');
  assert.deepEqual(kinds(t.move(a, pose(5, 2, 3))), [], 'and nothing left anywhere');
  t.move(a, pose(1, 2, 3, { ride: 4096 }));
  assert.deepEqual(kinds(t.move(a, pose(5, 2, 3))), ['all:car']);
});

test('however many come, whatever they say they carry and wherever they leave things, the town is less than Cloudflare keeps in one value', () => {
  const t = createTown(), most = Object.fromEntries(Array.from({ length: 32 }, (_, k) => [`a${String(k).padStart(23, 'x')}`, 999]));
  for (let i = 0; i < 1100; i++) {
    const id = t.join({ keyHash: key(1e6 + i), name: 'Abcdefghijklmnop', look: 255 }).id;
    t.move(id, encodePose(1, -39999.123 + i * .37, 123.45, 39999.987 - i * .29, 6.28));
    t.keep(id, { beans: 999, items: most, gas: 999 }); t.leave(id);
  }
  const id = inTown(t);
  for (let v = 1; v <= 4097; v++) t.move(id, encodePose(1, -39999.123 + v * .37, 123.45, 39999.987, 6.28, { ride: v }));
  t.leave(id);
  const save = t.dump();
  assert.equal(Object.keys(save.players).length, 1000);
  assert.equal(Object.keys(save.cars).length, 4096);
  // Cloudflare's limit is 2 MB for a key and its value together, and the value as it keeps it is V8's own serialization
  assert.ok(v8.serialize(save).length + 'town'.length < 2e6, `${v8.serialize(save).length} bytes`);
});

// ---------------- what the cast remember of each of them (CHUNKY-169), kept apart from the town's one value, since there can be a lot of it
const mindsIn = (out, id) => to(out, id)[0].minds;
const blank = { notes: [], said: [], visits: 0 };

test('what the cast remember of someone comes with their welcome, from wherever it was kept, and someone new has nothing', () => {
  const t = createTown(), kept = { coop: { notes: [{ about: 'ab12', text: 'Comes back a lot.', at: 5 }], said: ['Hey.'], visits: 2 } };
  const r = t.join({ ...hello(), minds: kept }), n = t.join(hello());
  assert.deepEqual(mindsIn(r.out, r.id), kept);
  assert.deepEqual(mindsIn(n.out, n.id), {});
});

test('each line one of them says, each thing they keep about someone and each visit over is kept, and handed over to be kept once', () => {
  const t = createTown(), me = hello(), a = t.join(me).id;
  t.dump();
  t.mind(a, { t: 'mind', who: 'coop', said: 'Hey.' }); t.mind(a, { t: 'mind', who: 'coop', said: 'Hey.' });
  t.mind(a, { t: 'mind', who: 'coop', note: 'Comes back a lot.', about: 'ab12', at: 7 });
  t.mind(a, { t: 'mind', who: 'rocky', visit: true });
  assert.equal(t.dirty, false, 'the town\'s own value isn\'t written again for it');
  assert.deepEqual(t.keepMinds(), [[me.keyHash, { coop: { notes: [{ about: 'ab12', text: 'Comes back a lot.', at: 7 }], said: ['Hey.'], visits: 0 }, rocky: { ...blank, visits: 1 } }]]);
  assert.deepEqual(t.keepMinds(), [], 'and not again until something changes');
  assert.equal(JSON.stringify(t.dump()).includes('Comes back'), false, 'and it isn\'t in the town\'s own value');
});

test('they remember as much as the game does and no more, and only words, from one of eight of them at most', () => {
  const t = createTown(), a = t.join(hello()).id;
  for (let i = 0; i < 30; i++) t.mind(a, { who: 'coop', said: `Line ${i}.` });
  for (let i = 0; i < 15; i++) t.mind(a, { who: 'coop', note: `Note ${i}.`, about: 'ab12', at: i });
  for (const bad of [{ who: 'coop', said: 'x'.repeat(241) }, { who: 'coop', said: 5 }, { who: 'coop', said: '' }, { who: 'Coop!', said: 'Hey.' }, { who: 'coop', note: 'Hey.', about: 'x'.repeat(65) },
    { who: 'coop', note: 'Hey.' }, { who: 'coop', visit: 'yes' }, { who: 'coop' }, { who: '__proto__', visit: true }, null, 'coop']) t.mind(a, bad);
  assert.doesNotThrow(() => t.mind(a, { who: 'constructor', said: 'Hey.' }), 'a name every object has is only a name');
  for (const who of 'abcdefghij') t.mind(a, { who: `kid${who}`, visit: true });
  const [[, m]] = t.keepMinds();
  assert.deepEqual(m.coop.said, Array.from({ length: 24 }, (_, i) => `Line ${i + 6}.`), 'the last 24 said');
  assert.deepEqual(m.coop.notes.map((n) => n.text), Array.from({ length: 12 }, (_, i) => `Note ${i + 3}.`), 'and the newest 12 notes');
  assert.equal(m.coop.visits, 0);
  assert.equal(Object.keys(m).length, 8, 'and eight of them at most');
  assert.equal(Object.getPrototypeOf(m), Object.prototype);
});

test('what was kept is tidied the same way as it comes back', () => {
  const t = createTown(), r = t.join({ ...hello(), minds: { coop: { said: ['Hey.', 7, 'x'.repeat(300)], notes: [{ text: 'Ok.' }, { about: 'ab12', text: 'Ok.', at: 'then' }], visits: -2 }, 'Bad!': blank, rocky: 'no' } });
  assert.deepEqual(mindsIn(r.out, r.id), { coop: { notes: [{ about: 'ab12', text: 'Ok.', at: 0 }], said: ['Hey.'], visits: 0 } });
});

test('the same phone back before it\'s been kept still has it, and once it\'s kept and gone, it\'s what was kept', () => {
  const t = createTown(), me = hello(), a = t.join(me).id;
  t.mind(a, { who: 'coop', said: 'Hey.' }); t.leave(a);
  const b = t.join({ ...me, minds: {} });
  assert.deepEqual(mindsIn(b.out, b.id).coop.said, ['Hey.']);
  t.keepMinds(); t.leave(b.id); t.keepMinds();
  const c = t.join({ ...me, minds: { coop: { ...blank, said: ['From where it was kept.'] } } });
  assert.deepEqual(mindsIn(c.out, c.id).coop.said, ['From where it was kept.']);
});

test('how each of them feels about someone is kept with what they remember, as numbers within the story\'s ranges', () => {
  const t = createTown(), a = t.join(hello()).id;
  t.mind(a, { who: 'coop', trust: 9, fear: -2 }); t.mind(a, { who: 'bobby', trust: -.5, fear: 1 });
  for (const bad of [{ who: 'rocky', trust: 'lots', fear: 0 }, { who: 'rocky', trust: 1 }, { who: 'rocky', trust: NaN, fear: 0 }]) t.mind(a, bad);
  const [[, m]] = t.keepMinds();
  assert.deepEqual(m, { coop: { ...blank, trust: 3, fear: 0 }, bobby: { ...blank, trust: -.5, fear: 1 } });
  const r = t.join({ ...hello(), minds: { coop: { ...blank, visits: 1, trust: -7, fear: 'x' } } });
  assert.deepEqual(mindsIn(r.out, r.id), { coop: { ...blank, visits: 1, trust: -3 } }, 'and tidied the same way as it comes back');
});

test('memories that couldn\'t be kept are kept next time', () => {
  const t = createTown(), a = t.join(hello()).id;
  t.mind(a, { who: 'coop', visit: true });
  const list = t.keepMinds();
  t.notKept(list);
  assert.deepEqual(t.keepMinds(), list);
});

// ---------------- the hero
test('the hero is the hero to everyone, and only one phone at a time can be him', () => {
  const t = createTown(), a = t.join(hello({ hero: true, name: 'rhiza' }));
  assert.equal(to(a.out, a.id)[0].hero, true);
  assert.equal(to(a.out, 'all')[0].players[0].hero, true);
  const b = t.join(hello({ hero: true, name: 'rhiza' }));
  assert.deepEqual(kinds(b.out.filter((o) => o.to === a.id)), [`${a.id}:no!`], 'the phone he was on is told, and let go');
  assert.equal(to(b.out, a.id)[0].why, 'hero');
  assert.deepEqual(to(b.out, 'all')[0].players.map((p) => [p.id, p.hero]), [[b.id, true]]);
});

test('nobody else is the hero', () => {
  const t = createTown(), r = t.join(hello({ hero: 'yes please' }));
  assert.equal(to(r.out, r.id)[0].hero, false);
});

// ---------------- wearing your own rektguy (CHUNKY-170)
const HANDLE = 'r'.repeat(22);
test('someone wearing their own rektguy is welcomed in it, and everyone sees it by its handle alone', () => {
  const t = createTown(), a = t.join(hello({ rekt: HANDLE }));
  assert.equal(to(a.out, a.id)[0].rekt, HANDLE);
  const b = t.join(hello());
  assert.deepEqual(to(b.out, 'all')[0].players.map((p) => p.rekt), [HANDLE, undefined]);
  assert.equal('rekt' in to(b.out, b.id)[0], false, 'and nothing\'s said of it for someone in a look of the town\'s');
});

test('a handle that isn\'t one is no rektguy, and the hero\'s in the hero\'s own look', () => {
  for (const rekt of ['short', 42, { a: 1 }, 'x'.repeat(65), 'not a handle at all!!']) {
    const t = createTown(), a = t.join(hello({ rekt }));
    assert.equal('rekt' in to(a.out, a.id)[0], false, JSON.stringify(rekt));
  }
  const t = createTown(), h = t.join(hello({ hero: true, rekt: HANDLE }));
  assert.equal('rekt' in to(h.out, h.id)[0], false);
  assert.equal('rekt' in to(h.out, 'all')[0].players[0], false);
});

// ---------------- vehicles
test('a vehicle someone drives is theirs until they get out, and stays where they leave it, for everyone', () => {
  const t = createTown(), a = inTown(t);
  t.move(a, pose(10, 0, 10, { ride: 5 }));
  t.move(a, pose(50, 0, 60, { ride: 5 }));
  const out = t.move(a, pose(52, 0, 61));
  assert.deepEqual(to(out, 'all'), [{ t: 'car', v: 4, x: 50, y: 0, z: 60, yaw: 0 }], 'where it was when he got out, by its place in the list');
  const c = t.join(hello());
  assert.deepEqual(to(c.out, c.id)[0].cars, [{ v: 4, x: 50, y: 0, z: 60, yaw: 0 }], 'and anyone who comes later finds it there');
});

test('nobody can take a vehicle someone else is in: they\'re told, and the town never shows two in it', () => {
  const t = createTown(), a = inTown(t), b = inTown(t);
  t.move(a, pose(10, 0, 10, { ride: 5 }));
  const out = t.move(b, pose(11, 0, 10, { ride: 5 }));
  assert.deepEqual(to(out, b), [{ t: 'bump', ride: 5 }]);
  const players = decodeMessage(t.snapshot()).players;
  assert.deepEqual(players.map((p) => [p.id, p.ride]), [[a, 5], [b, 0]]);
});

test('a vehicle someone drives off in is no longer where it was left', () => {
  const t = createTown(), a = inTown(t);
  t.move(a, pose(10, 0, 10, { ride: 2 })); t.move(a, pose(20, 0, 20));
  t.move(a, pose(20, 0, 20, { ride: 2 }));
  const c = t.join(hello());
  assert.deepEqual(to(c.out, c.id)[0].cars, []);
});

test('leaving town in a vehicle leaves it where it was', () => {
  const t = createTown(), a = inTown(t);
  t.move(a, pose(30, 0, 40, { ride: 9 }));
  assert.deepEqual(to(t.leave(a), 'all').find((m) => m.t === 'car'), { t: 'car', v: 8, x: 30, y: 0, z: 40, yaw: 0 });
});

test('where vehicles were left goes into the save too', () => {
  const t = createTown(), a = inTown(t);
  t.move(a, pose(30, 0, 40, { ride: 9 })); t.move(a, pose(31, 0, 40));
  const u = createTown(); u.load(JSON.parse(JSON.stringify(t.dump())));
  const c = u.join(hello());
  assert.deepEqual(to(c.out, c.id)[0].cars, [{ v: 8, x: 30, y: 0, z: 40, yaw: 0 }]);
});

// ---------------- different versions of the game
test('one version of the game with another in town is fine while the vehicles are the same', () => {
  const t = createTown(), a = inTown(t, { build: { at: 100, world: 'w1' } }), b = t.join(hello({ build: { at: 200, world: 'w1' } }));
  assert.ok(b.id); assert.equal(b.out.filter((o) => o.to === a).length, 0);
  assert.ok(t.join(hello({ build: { at: 50, world: 'w1' } })).id);
});

test('once the vehicles change, an older game is told to reload and a newer one has everyone on the old one reload', () => {
  const t = createTown(), a = inTown(t, { build: { at: 100, world: 'w1' } });
  t.move(a, pose(1, 0, 1, { ride: 3 })); t.move(a, pose(2, 0, 2));
  const old = t.join(hello({ build: { at: 50, world: 'w0' } }));
  assert.equal(old.no.why, 'reload');
  const fresh = t.join(hello({ build: { at: 300, world: 'w2' } }));
  assert.deepEqual(kinds(fresh.out.filter((o) => o.to === a)), [`${a}:no!`]);
  assert.equal(to(fresh.out, a)[0].why, 'reload');
  assert.deepEqual(to(fresh.out, fresh.id)[0].cars, [], 'and where vehicles were left counted for the old ones, so it\'s forgotten');
});

test('the snapshot holds a pose for a vehicle as it was sent', () => {
  const t = createTown(), a = inTown(t);
  t.move(a, pose(1, 2, 3, { ride: 7, swings: 4, waves: 2, how: HOW.swim }));
  const p = decodeMessage(t.snapshot()).players[0];
  assert.deepEqual([p.ride, p.swings, p.waves, p.how], [7, 4, 2, HOW.swim]);
  assert.equal(decodePose(pose()).ride, 0);
});

// ---------------- what's broken (CHUNKY-152): the same for everyone, and healed a day later
const DAY = 864e5;
const wall = (t = 1e12) => { const w = () => w.now; w.now = t; return w; };
const fence = (n = 1, over) => ({ k: `pfence:${n}:0`, x: n / 10, z: 0, d: 9, ...over });
const wall3 = (over) => ({ k: 'b7301', x: 10, z: -20, n: 40, p: encodeParts([{ part: 3, gone: true, cracked: false, burning: false, dir: 40, hp: 0, shade: 200 }]), ...over });
// what someone new is told is broken, as they come in
const wrecksNow = (t) => { const c = t.join(hello()); return to(c.out, c.id)[0].wrecks; };
const carsNow = (t) => { const c = t.join(hello()); return to(c.out, c.id)[0].cars; };

test('something broken on one phone is broken for everyone else in town, and for anyone who comes later', () => {
  const t = createTown(), a = inTown(t), b = inTown(t);
  const out = t.wreck(a, [wall3(), fence()]);
  assert.deepEqual(out, [{ to: 'all', except: a, msg: { t: 'wreck', w: [wall3(), fence(1, { x: .1 })] } }]);
  assert.deepEqual(wrecksNow(t), [wall3(), fence(1, { x: .1 })]);
  assert.ok(b);
});

test('what everyone already knows is broken is nothing to tell', () => {
  const t = createTown(), a = inTown(t);
  t.wreck(a, [fence()]);
  assert.deepEqual(t.wreck(a, [fence(1, { d: 200 })]), []);
});

test('the town keeps only what the game could have, a few at a time, from someone who\'s in town', () => {
  const t = createTown(), a = inTown(t);
  assert.deepEqual(t.wreck(a, [{ k: 'x1', x: 0, z: 0 }, fence(1, { d: 999 }), 'fence']), []);
  assert.deepEqual(t.wreck(a, 'all of it'), []);
  assert.deepEqual(t.wreck(99, [fence()]), []);
  const out = t.wreck(a, Array.from({ length: 100 }, (_, i) => fence(i + 1)));
  assert.equal(out[0].msg.w.length, 64);
});

test('nothing at the places set aside is kept broken, whatever a phone says', () => {
  const t = createTown({ aside: createAside(farm) }), a = inTown(t);
  const [x, z] = [-254.5 - BRIDGE[0], 200 - BRIDGE[1]];
  assert.deepEqual(t.wreck(a, [fence(1, { x, z })]), []);
  assert.deepEqual(wrecksNow(t), []);
});

test('it heals a real day after it first broke, once nobody\'s within 200 m of it, and everyone\'s told', () => {
  const w = wall(), t = createTown({ wall: w }), a = inTown(t);
  t.move(a, pose(10, 0, -120));
  t.wreck(a, [wall3()]);
  w.now += DAY / 2; t.wreck(a, [wall3({ p: encodeParts([{ part: 7, gone: true, cracked: false, burning: false, dir: 1, hp: 0, shade: 255 }]) })]);
  w.now += DAY / 2 - 1;
  assert.deepEqual(t.heal(), [], 'not quite a day');
  w.now += 1;
  assert.deepEqual(t.heal(), [], 'a day, from when it first broke and not when it was last hit, but he\'s 100 m off');
  t.move(a, pose(10, 0, 181));
  assert.deepEqual(t.heal(), [{ to: 'all', msg: { t: 'heal', k: ['b7301'] } }], 'and he\'s gone 201 m off');
  assert.deepEqual(wrecksNow(t), []);
});

test('somewhere busy, anything broken two days heals as soon as nobody\'s within 60 m', () => {
  const w = wall(), t = createTown({ wall: w }), a = inTown(t);
  t.wreck(a, [fence()]);
  t.move(a, pose(.1, 0, 61));
  w.now += DAY;
  assert.deepEqual(t.heal(), [], 'a day, and he\'s within 200 m');
  w.now += DAY - 1;
  assert.deepEqual(t.heal(), []);
  w.now += 1;
  assert.deepEqual(t.heal(), [{ to: 'all', msg: { t: 'heal', k: ['pfence:1:0'] } }], 'two, and he\'s more than 60 m off');
});

test('past 2000 broken things the oldest heals first, as long as nobody\'s near it, and otherwise nothing new is kept', () => {
  const w = wall(), t = createTown({ wall: w }), a = inTown(t);
  for (let i = 0; i < 2000; i += 50) { t.wreck(a, Array.from({ length: 50 }, (_, j) => fence(i + j + 1, { x: 1000 + i + j, z: 0 }))); w.now += 1; }
  t.move(a, pose(1000, 0, 0));
  const out = t.wreck(a, [fence(9999, { x: 30000, z: 0 })]);
  assert.deepEqual(kinds(out), ['all:heal', 'all:wreck']);
  assert.ok(out[0].msg.k.length >= 1 && !out[0].msg.k.includes('pfence:1:0'), 'not the very oldest, with him beside it');
  t.move(a, pose(0, 0, 0));
  const all = createTown({ wall: w }), b = inTown(all);
  for (let i = 0; i < 2000; i += 50) all.wreck(b, Array.from({ length: 50 }, (_, j) => fence(i + j + 1, { x: 0, z: 0 })));
  all.move(b, pose(0, 0, 0));
  assert.deepEqual(all.wreck(b, [fence(9999)]), [], 'with him beside every one of them, there\'s no room');
});

test('a vehicle that\'s gone up is where it ended up for everyone, unless someone\'s in it, and healing it puts it back where it was parked', () => {
  const w = wall(), t = createTown({ wall: w }), a = inTown(t), b = inTown(t);
  const car = { k: 'v4', x: 50, z: 60, y: 1, yaw: 2, h: 0, f: 3 };
  assert.deepEqual(kinds(t.wreck(a, [car])), ['all:wreck', 'all:car']);
  assert.deepEqual(carsNow(t), [{ v: 4, x: 50, y: 1, z: 60, yaw: 2 }]);
  t.move(b, pose(1, 0, 1, { ride: 5 }));
  assert.deepEqual(kinds(t.wreck(a, [{ ...car, x: 70, h: 0, f: 7 }])), ['all:wreck'], 'and with someone in it, it\'s wherever they take it');
  t.move(a, pose(-3000, 0, -3000)); t.move(b, pose(400, 0, 400, { ride: 5 }));
  w.now += DAY;
  assert.deepEqual(t.heal(), [], 'and it isn\'t put back with someone in it, a long way from where it was wrecked');
  t.move(b, pose(400, 0, 402));
  assert.deepEqual(carsNow(t), [{ v: 4, x: 400, y: 0, z: 400, yaw: 0 }], 'they leave it by them');
  assert.deepEqual(t.heal(), [], 'nor with them beside it');
  t.move(b, pose(400, 0, 700));
  assert.deepEqual(kinds(t.heal()), ['all:heal']);
  assert.deepEqual(carsNow(t).filter((c) => c.v === 4), [], 'back where it was parked');
});

test('what\'s broken is kept apart from the town, with when each thing first broke, and comes back out', () => {
  const w = wall(), t = createTown({ wall: w }), a = inTown(t);
  t.wreck(a, [wall3()]); w.now += 5; t.wreck(a, [fence()]);
  assert.ok(t.wrecksDirty);
  const kept = JSON.parse(JSON.stringify(t.dumpWrecks()));
  assert.ok(!t.wrecksDirty);
  assert.equal('wrecks' in t.dump(), false, 'and not in the town\'s one value');
  const u = createTown({ wall: w }); u.load(t.dump()); u.loadWrecks(kept);
  assert.deepEqual(wrecksNow(u), [wall3(), fence(1, { x: .1 })]);
  w.now += DAY - 3;
  assert.deepEqual(u.heal(), [{ to: 'all', msg: { t: 'heal', k: ['b7301'] } }], 'the one that broke first');
  assert.deepEqual(u.heal(), []);
  u.loadWrecks([{ k: 'nope' }, { ...fence(), at: 'yesterday' }, null]);
  assert.deepEqual(wrecksNow(u), [], 'and anything in it that isn\'t a wreck is left out');
});

test('once the vehicles change, what was broken of them goes with where they were left', () => {
  const t = createTown(), a = inTown(t, { build: { at: 100, world: 'w1' } });
  t.wreck(a, [{ k: 'v4', x: 50, z: 60, y: 1, yaw: 2, h: 0, f: 3 }, fence()]);
  const fresh = t.join(hello({ build: { at: 300, world: 'w2' } }));
  assert.deepEqual(to(fresh.out, fresh.id)[0].wrecks.map((x) => x.k), ['pfence:1:0']);
});

test('however much is broken, it\'s less than Cloudflare keeps in one value', () => {
  const t = createTown(), a = inTown(t), parts = Array.from({ length: 300 }, (_, i) => ({ part: i, gone: true, cracked: true, burning: false, dir: 200, hp: 0, shade: 0 }));
  for (let i = 0; i < 100; i++) t.wreck(a, [{ k: `b${1e11 + i}`, x: 39999.9, z: -39999.9, n: 4096, p: encodeParts(parts) }]);
  for (let i = 0; i < 1900; i += 50) t.wreck(a, Array.from({ length: 50 }, (_, j) => fence(i + j + 1, { k: `pabcdefghijklmnopqrstuvwx:${-1e6 - i - j}:-999999#999`, x: -39999.9, z: 39999.9 })));
  const save = t.dumpWrecks();
  assert.equal(save.length, 2000, 'as many things as it keeps');
  assert.equal(save.reduce((n, w) => n + partsIn(w), 0), 30000, 'with as many of a building\'s parts as it keeps');
  assert.ok(v8.serialize(save).length + 'wrecks'.length < 2e6, `${v8.serialize(save).length} bytes`);
});
