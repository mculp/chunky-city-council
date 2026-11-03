import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeLine, createTrains, TRAINS, CARS } from './trains.js';

const seeded = (seed = 7) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// An L: 5 km east along z = 0, then 5 km south
const LINE = makeLine([[0, 0], [5000, 0], [5000, 5000]]);
const make = ({ crossings = [], posts = [], tuning = {}, ...hooks } = {}) => createTrains(LINE, { crossings, posts, tuning, world: { rand: seeded(), ...hooks } });
const run = (t, seconds, p, dt = 1 / 30) => { for (let i = 0, n = Math.round(seconds / dt); i < n; i++) t.update(dt, p); };

test('a line says where anything is along it, and carries straight on past its ends', () => {
  assert.equal(LINE.length, 10000);
  const q = LINE.at(5500);
  assert.deepEqual([q.x, q.z, q.tx, q.tz], [5000, 500, 0, 1]);
  assert.deepEqual([LINE.at(-100).x, LINE.at(-100).z], [-100, 0]);
  assert.deepEqual([LINE.at(10100).x, LINE.at(10100).z], [5000, 5100]);
  const n = LINE.nearest(5020, 700);
  assert.equal(n.d, 20); assert.equal(n.s, 5700);
  assert.equal(makeLine([[0, 0], [0, 0], [10, 0]]).pts.length, 2, 'a point on top of the last is dropped');
});

test('nothing comes until it is due, and then every five minutes or so, from each end in turn', () => {
  const started = [], p = { x: 2500, z: 0 }, t = make({ start: (tr) => started.push({ at: clock, dir: tr.dir }) });
  let clock = 0;
  for (; clock < TRAINS.first - .1; clock += .1) t.update(.1, p);
  assert.equal(started.length, 0, 'not yet');
  for (; clock < 1400; clock += .1) t.update(.1, p);
  assert.ok(started.length >= 4 && started.length <= 6, `${started.length} of them`);
  assert.ok(Math.abs(started[0].at - TRAINS.first) < .5, 'the first is when it says');
  for (let i = 1; i < started.length; i++) {
    const gap = started[i].at - started[i - 1].at;
    assert.ok(gap >= TRAINS.every[0] - 1 && gap <= TRAINS.every[1] + 1, `${gap} s between`);
    assert.equal(started[i].dir, -started[i - 1].dir, 'one way and then the other');
  }
});

test('it comes from far enough off that he can\'t see it start, and goes on until it\'s well past him', () => {
  const p = { x: 2500, z: 40 }, t = make();
  t.soon(0); t.update(1 / 30, p);
  const tr = t.train;
  assert.ok(tr, 'it started');
  assert.ok(Math.abs(tr.ahead - TRAINS.from) < 2, 'its nose is that far along the line from him');
  const until = (TRAINS.from + tr.length + TRAINS.past) / TRAINS.speed;
  run(t, until - 1, p);
  assert.ok(t.train, 'still going');
  run(t, 2, p);
  assert.equal(t.train, null, 'and then it\'s gone');
});

test('there\'s no train if nobody\'s near enough to know', () => {
  const t = make();
  t.soon(0); t.update(1 / 30, { x: -TRAINS.hear - 10, z: 0 });
  assert.equal(t.train, null);
  assert.ok(t.wait > 200, 'and the next one\'s due as usual');
});

test('one that\'s running stops another starting, and he can get away from one', () => {
  const started = [], p = { x: 100, z: 0 }, t = make({ start: (tr) => started.push(tr) });
  t.send(1, -500);
  t.soon(0); t.update(1 / 30, p);
  assert.equal(started.length, 1, 'still just the one');
  t.train.dir = -1; t.train.head = 100 + TRAINS.outrun + 50; t.train.dir = 1; t.train.head = 100 - TRAINS.outrun - 50;
  t.update(1 / 30, p);
  assert.equal(t.train, null, 'too far behind him to matter');
});

test('every car is in a line behind the nose, nose first, with the locomotives up front', () => {
  const t = make(), tr = t.send(1, 1000);
  assert.equal(tr.cars[0].kind, 'loco');
  const kinds = tr.cars.map((c) => c.kind), locos = kinds.filter((k) => k === 'loco').length;
  assert.ok(locos >= 1 && locos <= 2); assert.ok(kinds.slice(locos).every((k) => k !== 'loco'));
  assert.ok(tr.cars.length - locos >= TRAINS.cars[0] && tr.cars.length - locos <= TRAINS.cars[1]);
  let was = tr.head;
  for (const c of tr.cars) {
    assert.ok(Math.abs(c.fx - 1) < 1e-9 && Math.abs(c.fz) < 1e-9, 'pointing the way it\'s going');
    assert.ok(Math.abs(c.yaw - Math.PI / 2) < 1e-9);
    assert.ok(Math.abs(was - TRAINS.couple * (c === tr.cars[0] ? 0 : 1) - c.len / 2 - c.x) < 1e-6, 'coupled to the last');
    was = c.x - c.len / 2;
  }
  assert.ok(Math.abs(tr.head - tr.length - was) < 1e-6);
});

test('going the other way it points the other way', () => {
  const t = make(), tr = t.send(-1, 1000), c = tr.cars[0];
  assert.ok(Math.abs(c.fx + 1) < 1e-9);
  assert.ok(Math.abs(c.x - (1000 + c.len / 2)) < 1e-9, 'behind its nose is up the line');
  assert.equal(t.at(1000 + c.len / 2, 0), c);
  assert.equal(t.at(1000 - 3, 0), null, 'nothing in front of it');
});

test('round a corner a car lies across the bend, between its wheels', () => {
  const t = make(), tr = t.send(1, 5015), c = tr.cars[0], b = c.len / 2 - c.truck;
  // its back wheels haven't got to the corner and its front ones have
  const backS = 5015 - c.off - b, frontS = 5015 - c.off + b;
  assert.ok(backS < 5000 && frontS > 5000);
  const f = LINE.at(frontS), k = LINE.at(backS);
  assert.ok(Math.abs(c.x - (f.x + k.x) / 2) < 1e-9); assert.ok(Math.abs(c.z - (f.z + k.z) / 2) < 1e-9);
  assert.ok(c.fx > .1 && c.fz > .1, 'at an angle');
});

test('what\'s there is known by the car\'s real shape, with a pad', () => {
  const t = make(), tr = t.send(1, 1000), c = tr.cars[1];
  assert.equal(t.at(c.x, 0), c);
  assert.equal(t.at(c.x, c.half - .01), c, 'just inside its side');
  assert.equal(t.at(c.x, c.half + .01), null, 'just outside it');
  assert.equal(t.at(c.x, c.half + .1, .2), c, 'with a pad');
  assert.equal(t.side(c, c.x, -5), 1); assert.equal(t.side(c, c.x, 5), -1);
  assert.equal(t.at(c.x, 40), null);
  assert.equal(t.at(5000, 5000), null, 'nowhere near');
  t.clear();
  assert.equal(t.at(c.x, 0), null, 'there\'s no train');
});

test('a crossing shuts in time for the train, and opens behind it', () => {
  const log = [], crossing = { x: 2000, z: 0, road: 'a' }, p = { x: 2000, z: 100 };
  let clock = 0, nose = 0;
  const t = make({ crossings: [crossing], gate: (g) => log.push([g.shut, clock, nose]) });
  const tr = t.send(1, 1000);
  for (; clock < 120 && t.train; clock += .05) { nose = t.train.head; t.update(.05, p); assert.equal(t.shutAt(2000, 3), crossing.shut); assert.equal(t.shutAt(2100, 3), false, 'only there'); }
  assert.equal(log.length, 2);
  const [[shut, , at], [open, , at2]] = log;
  assert.equal(shut, true); assert.equal(open, false);
  assert.ok(Math.abs(2000 - at - TRAINS.shutFor * TRAINS.speed) < 3, 'that many seconds short of it');
  assert.ok(Math.abs(at2 - tr.length - TRAINS.clear - 2000) < 3, 'the tail\'s clear of it');
});

test('it blows once for each crossing and trestle it comes to, far enough short of it', () => {
  const log = [], crossing = { x: 2000, z: 0 }, post = { x: 3000, z: 0 }, off = { x: 2000, z: 600 };
  const t = make({ crossings: [crossing, off], posts: [post], horn: (g, tr) => log.push([g, tr.head]) });
  assert.equal(t.gates.length, 1, 'a crossing that isn\'t on this line is no business of a train\'s');
  t.send(1, 1400);
  run(t, 120, { x: 2500, z: 0 }, .05);
  assert.equal(log.length, 2);
  assert.equal(log[0][0], crossing); assert.equal(log[1][0], post);
  for (const [g, head] of log) assert.ok(Math.abs(g.x - head - TRAINS.horn) < 3);
  assert.equal(post.shut, undefined, 'and a trestle never shuts');
});

test('it blows for him on the tracks ahead, again and again, and not if he\'s off them or it\'s gone by', () => {
  const log = [];
  let clock = 0;
  const t = make({ blast: () => log.push(clock) });
  t.send(1, 1000);
  const step = (p, seconds) => { for (let e = clock + seconds; clock < e; clock += .05) t.update(.05, p); };
  step({ x: 2000, z: 10 }, 30);
  assert.equal(log.length, 0, 'beside the line, nothing');
  t.train.head = 1000;
  step({ x: 1000 + TRAINS.sees + 200, z: .5 }, 5);
  assert.equal(log.length, 0, 'not while it\'s too far off to see him');
  const first = clock;
  step({ x: 1000 + TRAINS.sees + 200, z: .5 }, 9.5);
  assert.ok(log.length >= 2, `blew ${log.length} times`);
  assert.ok(log[0] - first < 5);
  assert.ok(Math.abs(log[1] - log[0] - TRAINS.blastEvery) < .2);
  const n = log.length;
  step({ x: 1000, z: .5 }, 5);
  assert.equal(log.length, n, 'it\'s past him now');
});

test('how near it is and which way that\'s going', () => {
  const t = make(), p = { x: 2000, z: 30 };
  const tr = t.send(1, 1000);
  t.update(0, p);
  assert.ok(Math.abs(tr.gap - Math.hypot(1000, 30)) < .01);
  assert.ok(tr.closing > 21 && tr.closing <= 22, 'coming straight at him');
  tr.head = 2000 + 50;
  t.update(0, p);
  assert.ok(Math.abs(tr.gap - 30) < .01, 'going by');
  assert.equal(tr.closing, 0);
  tr.head = 2000 + tr.length + 1000;
  t.update(0, p);
  assert.ok(tr.closing < -21, 'going away');
  assert.ok(tr.gap > 900);
});

test('clearing it opens every crossing', () => {
  const crossing = { x: 2000, z: 0 }, t = make({ crossings: [crossing] });
  t.send(1, 1950); t.update(1 / 30, { x: 2000, z: 10 });
  assert.equal(crossing.shut, true);
  t.clear();
  assert.equal(crossing.shut, false); assert.equal(t.train, null);
});

test('there are no real railroad names anywhere in the data', () => {
  const words = readFileSync(new URL('../data/railroad.json', import.meta.url), 'utf8');
  for (const name of ['Kansas City', 'Southern', 'Illinois Central', 'Norfolk', 'Alabama & Vicksburg', 'A&V']) assert.ok(!words.includes(name), name);
});

test('every kind of car has a size', () => {
  for (const K of Object.values(CARS)) { assert.ok(K.len > 10 && K.half > 1 && K.top > 3); assert.ok(K.truck * 2 < K.len); }
});
