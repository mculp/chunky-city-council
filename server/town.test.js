import test from 'node:test';
import assert from 'node:assert/strict';
import { createTown } from './town.js';
import { encodePose, decodeMessage, decodePose, HOW } from '../src/net.js';

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
  assert.deepEqual({ ...welcome, cars: undefined }, { t: 'welcome', id: a.id, name: 'Miss Bobby', look: 5, hero: false, saved: null, cars: undefined });
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
