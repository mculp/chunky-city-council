import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeLine, createTrains, makeSiding, makeTimetable, TRAINS, TIMETABLE, CARS } from './trains.js';

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

test('it blows for him on the tracks ahead, and no oftener than every blastEvery seconds, and not if he\'s off them or it\'s gone by', () => {
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
  assert.equal(log.length, 1, `blew ${log.length} times`);
  assert.ok(log[0] - first < 5);
  // at the speed it goes, it's on him before it can blow again
  assert.ok(TRAINS.sees / TRAINS.speed < TRAINS.blastEvery);
  const n = log.length;
  step({ x: 1000, z: .5 }, 5);
  assert.equal(log.length, n, 'it\'s past him now');
});

test('a slow one blows for him again, but not until blastEvery seconds have gone', () => {
  const log = [];
  let clock = 0;
  const t = make({ blast: () => log.push(clock), tuning: { speed: 5 } });
  t.send(1, 1000);
  const step = (p, seconds) => { for (let e = clock + seconds; clock < e; clock += .05) t.update(.05, p); };
  t.train.head = 1000;
  step({ x: 1000 + TRAINS.sees - 20, z: .5 }, TRAINS.blastEvery + 3);
  assert.equal(log.length, 2, `blew ${log.length} times`);
  assert.ok(Math.abs(log[1] - log[0] - TRAINS.blastEvery) < .2);
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

// Online, the timetable (CHUNKY-153). A straight line as long as the real one, with the siding as far along it as town's, and a road
// crossing just short of the siding and one just past it.
const MAIN = makeLine([[0, 0], [16566, 0]]);
const SIDING = makeSiding(MAIN, { west: [4996.2, 0], east: [5145.5, 0], gap: 4.6, ease: 25 });
const online = (hooks = {}, tuning = {}) => createTrains(MAIN, {
  crossings: [{ x: 4817, z: 0, road: 'before' }, { x: 5151, z: 0, road: 'past' }], timetable: { siding: SIDING }, tuning,
  world: { rand: () => { throw new Error('online, nothing comes from rand'); }, ...hooks },
});
const { epoch: E, every: P, stand: STAND, crawl: CRAWL } = TIMETABLE;
const runIn = (t, from, to, p = { x: 5100, z: 30 }, dt = .05, each = () => {}) => { for (let now = from; now < to; now += dt) { t.update(dt, p, now); each(now); } };
const local = (t, k) => t.trains.find((tr) => tr.run === 2 * k);

test('online every phone has the same trains in the same places, from the town\'s clock and nothing else', () => {
  const a = online(), b = online(), then = E + 3 * P + 600;
  runIn(a, then - 300, then, { x: 5100, z: 30 }, 1 / 30);
  a.update(0, { x: 5100, z: 30 }, then); b.update(0, { x: 0, z: 9000 }, then);
  const what = (t) => t.trains.map((tr) => [tr.run, tr.head.toFixed(6), tr.cars.map((c) => `${c.kind} ${c.seed} ${c.x.toFixed(4)} ${c.z.toFixed(4)}`)]).sort((x, y) => x[0] - y[0]);
  assert.equal(a.trains.length, 2);
  assert.deepEqual(what(a), what(b));
});

test('a local stands on the siding with its engine running while the freight comes, the long way round', () => {
  const t = online(), A = E + 5 * P;
  t.update(0, { x: 5100, z: 30 }, A + STAND / 2);
  const l = local(t, 5), f = t.trains.find((tr) => tr.run === 11);
  assert.ok(l && f && t.trains.length === 2, 'one of each');
  assert.equal(l.dir, 1); assert.equal(f.dir, -1);
  assert.equal(l.speed, 0); assert.ok(l.standing && !f.standing);
  assert.deepEqual(l.cars.map((c) => c.kind).filter((k) => k === 'loco'), ['loco']); assert.equal(l.cars[0].kind, 'loco');
  assert.ok(l.cars.length - 1 >= 3 && l.cars.length - 1 <= 5, `a locomotive and ${l.cars.length - 1} cars`);
  for (const c of l.cars) assert.ok(Math.abs(c.z + SIDING.gap) < 1e-6 && Math.abs(c.yaw - Math.PI / 2) < 1e-6, 'on the siding, to the left going up the line, square to it');
  assert.ok(l.head - l.length >= SIDING.s0 + SIDING.ease && l.head <= SIDING.s1 - SIDING.ease, 'clear of both switches');
  const cars = f.cars.filter((c) => c.kind !== 'loco').length;
  assert.ok(cars >= TRAINS.cars[0] && cars <= TRAINS.cars[1], `and the freight's as long as ever: ${cars}`);
  assert.ok(f.head > SIDING.s1, 'and still coming');
  assert.equal(t.train, l, 'the one that counts for him is the nearest');
});

test('the local takes the switches at a crawl, stands as long as it says, and goes once the freight\'s by it', () => {
  const t = online(), A = E + 7 * P;
  let west = null, east = null, stood = [], freightBy = null;
  runIn(t, A - 400, A + STAND + 120, undefined, .05, (now) => {
    const l = local(t, 7), f = t.trains.find((tr) => tr.run === 15);
    if (!l) return;
    if (west === null && l.head >= SIDING.s0) west = l.speed;
    if (east === null && l.head >= SIDING.s1) east = l.speed;
    if (l.standing) stood.push(now);
    if (freightBy === null && f && f.head + f.length < SIDING.s1 - SIDING.ease) freightBy = now;
  });
  assert.ok(west <= CRAWL + .01, `${west} m/s at the west switch`); assert.ok(east <= CRAWL + .01, `${east} m/s at the east switch`);
  assert.ok(Math.abs(stood[0] - A) < .1 && Math.abs(stood.at(-1) - stood[0] - STAND) < .2, 'from A for as long as it says');
  assert.ok(freightBy < A + STAND && freightBy > A + STAND - 5, 'and the freight\'s tail is past the east switch just before it goes');
});

test('a slow phone, which draws fewer cars in the story, has the same trains online as everyone else', () => {
  const what = (t) => t.trains.map((tr) => [tr.run, tr.head.toFixed(6), tr.length.toFixed(3), tr.cars.map((c) => c.kind)]).sort((x, y) => x[0] - y[0]);
  for (const k of [21, 22, 23]) {
    const fast = online(), slow = online({}, { cars: [10, 16] }), now = E + k * P + STAND - 20;
    fast.update(0, { x: 5100, z: 30 }, now); slow.update(0, { x: 5100, z: 30 }, now);
    assert.equal(fast.trains.length, 2, 'the local standing and the freight coming');
    assert.deepEqual(what(slow), what(fast));
  }
});

test('one on the siding blows for him on the siding\'s track ahead of it, and not for him on the main track beside it', () => {
  // the local pulling out, with its nose 2.4 m past where it stood, and him 10 m ahead of it, where the siding's 2.8 m over from the main track
  const A = E + 23 * P, now = A + STAND + 4, s = 5131, over = SIDING.off(s), blown = (z) => {
    const log = [], t = online({ blast: (tr) => log.push(tr.run) });
    t.update(0, { x: s, z }, now);
    assert.ok(local(t, 23).speed > 1 && Math.abs(local(t, 23).head - (s - 10.1)) < .01, 'pulling out');
    return log;
  };
  assert.ok(over > 2.6 && over < 3, `${over.toFixed(2)} m over`);
  assert.deepEqual(blown(-over), [46], 'on the siding\'s track');
  assert.deepEqual(blown(0), [], 'on the main track beside it');
});

test('how near one on the siding is to him is from the siding\'s track', () => {
  const t = online(), A = E + 25 * P;
  t.update(0, { x: 5050, z: -SIDING.gap }, A + STAND / 2);
  assert.equal(t.train, local(t, 25));
  assert.ok(t.train.gap < .01, `stood on the siding beside the local, ${t.train.gap.toFixed(2)} m from it`);
});

test('two trains are never in the same place: they only pass where one of them\'s on the siding', () => {
  const t = online();
  let pairs = 0;
  for (let now = E + 9 * P; now < E + 11 * P; now += .5) {
    t.update(.5, { x: 0, z: 9000 }, now);
    assert.ok(t.trains.length <= 2, `${t.trains.length} at once`);
    if (t.trains.length < 2) continue;
    const [a, b] = t.trains;
    for (const c of a.cars) for (const d of b.cars) {
      const dx = d.x - c.x, dz = d.z - c.z, along = Math.abs(dx * c.fx + dz * c.fz), across = Math.abs(dx * c.fz - dz * c.fx);
      if (along < (c.len + d.len) / 2) { pairs++; assert.ok(across > c.half + d.half + .5, `${a.run} and ${b.run} meet ${((now - E) % P).toFixed(1)} s into the cycle`); }
    }
  }
  assert.ok(pairs > 0, 'and they did pass');
});

test('one comes through town evenly: the local rolling in, then the freight with the local pulling out behind it', () => {
  assert.equal(STAND, P / 2);
  const t = online(), A = E + 13 * P, past = [];
  runIn(t, A - 60, A + P, undefined, .05, (now) => {
    for (const tr of t.trains) if (!past.some(([run]) => run === tr.run) && (5151 - tr.head) * tr.dir <= 0 && (5151 - tr.head) * tr.dir > -50) past.push([tr.run, now]);
  });
  const [freight, local_] = [past.find(([run]) => run % 2), past.find(([run]) => run % 2 === 0)];
  assert.ok(freight[1] > A + STAND - 30 && freight[1] < A + STAND, `the freight goes over the road past the siding ${(freight[1] - A).toFixed(0)} s after the local stops`);
  assert.ok(local_[1] > A + STAND && local_[1] < A + STAND + 30, `and the local ${(local_[1] - A).toFixed(0)} s after`);
});

test('a crossing\'s shut for whichever train will be on it within shutFor seconds, so it lifts while the local stands short of it', () => {
  const t = online(), A = E + 17 * P, past = t.gates.find((g) => g.road === 'past'), before = t.gates.find((g) => g.road === 'before'), shut = [];
  runIn(t, A - 400, A + STAND + 200, undefined, .05, (now) => { if (past.shut) shut.push(now); });
  assert.ok(shut.every((now) => now > A + STAND - 60), 'up the whole time it stands, until the freight comes');
  assert.ok(shut.length > 0 && shut.at(-1) > A + STAND, 'and down for the freight and the local going');
  t.update(0, { x: 5100, z: 30 }, A + STAND / 2);
  assert.equal(before.shut, false, 'and the one behind it\'s up too');
  t.update(0, { x: 5100, z: 30 }, A - 50);
  assert.ok(before.shut, 'once it\'s on it');
});

test('each train blows once for a crossing it comes to, and the local blows for the one past the siding as it goes, not as it stops', () => {
  const log = [], t = online({ horn: (g, tr) => log.push([tr.run, g.road, now]) }), A = E + 19 * P;
  let now = 0;
  runIn(t, A - 400, A + STAND + 200, undefined, .05, (n) => { now = n; });
  const blew = (run, road) => log.filter(([r, g]) => r === run && g === road);
  for (const run of [38, 39]) for (const road of ['before', 'past']) assert.equal(blew(run, road).length, 1, `${run} for ${road}`);
  assert.ok(blew(38, 'past')[0][2] > A + STAND - TRAINS.horn / TRAINS.speed, 'the local blows for the road past it as it gets ready to go');
});

test('what\'s in a run is the same wherever it\'s asked, and a local\'s as many cars as fit the siding', () => {
  const a = makeTimetable(MAIN, SIDING), b = makeTimetable(MAIN, SIDING);
  for (let n = 100; n < 140; n++) {
    assert.deepEqual(a.consist(n), b.consist(n));
    const { cars, length } = a.consist(n), locos = cars.filter((c) => c.kind === 'loco').length;
    if (n % 2) { assert.ok(locos >= 1 && locos <= 2 && cars.length - locos >= TRAINS.cars[0] && cars.length - locos <= TRAINS.cars[1]); continue; }
    assert.equal(locos, 1);
    assert.ok(cars.length - 1 >= 3 && length <= a.stop - SIDING.s0 - SIDING.ease, `run ${n} is ${cars.length - 1} cars and ${length.toFixed(1)} m`);
  }
});

test('on the real line the siding\'s on the bed between Mulberry St and Poplar St, beside the track and clear of Railroad St, and the timetable fits it', () => {
  const roads = JSON.parse(readFileSync(new URL('../data/roads.json', import.meta.url), 'utf8')), rail = JSON.parse(readFileSync(new URL('../data/railroad.json', import.meta.url), 'utf8'));
  const line = makeLine(roads.reference.railroad.lines[0].points), siding = makeSiding(line, rail.siding);
  assert.ok(siding.s1 - siding.ease - siding.s0 > 95 && siding.s1 - siding.s0 < 160, `${(siding.s1 - siding.s0).toFixed(0)} m from switch to switch`);
  const poplar = roads.reference.crossings.find((c) => c.road === 'poplar_st'), toPoplar = line.nearest(poplar.x, poplar.z).s - siding.s1;
  assert.ok(toPoplar > 2 && toPoplar < 10, `the east switch is ${toPoplar.toFixed(1)} m short of Poplar St`);
  const street = roads.roads.find((r) => r.id === 'railroad_st'), edges = roads.edges.filter((e) => street.edges.includes(e.id)).map((e) => e.points ?? e.pts);
  for (let s = siding.s0 + siding.ease; s <= siding.s1 - siding.ease; s += 5) {
    const q = line.at(s), x = q.x + q.tz * siding.gap, z = q.z - q.tx * siding.gap;
    let near = Infinity;
    for (const p of edges) for (let i = 1; i < p.length; i++) {
      const [ax, az] = p[i - 1], [bx, bz] = p[i], dx = bx - ax, dz = bz - az, u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      near = Math.min(near, Math.hypot(x - ax - dx * u, z - az - dz * u));
    }
    assert.ok(near > street.width / 2 + CARS.box.half + 3, `${near.toFixed(1)} m from Railroad St at ${s.toFixed(0)}`);
  }
  // and over two cycles nothing meets, with the real line's bends
  const t = createTrains(line, { crossings: roads.reference.crossings.filter((c) => c.with === 'railroad'), timetable: { siding }, world: {} });
  for (let now = E + 23 * P; now < E + 25 * P; now += 1) {
    t.update(1, { x: 0, z: 0 }, now);
    if (t.trains.length < 2) continue;
    const [a, b] = t.trains;
    for (const c of a.cars) for (const d of b.cars) {
      const dx = d.x - c.x, dz = d.z - c.z;
      if (Math.abs(dx * c.fx + dz * c.fz) < (c.len + d.len) / 2) assert.ok(Math.abs(dx * c.fz - dz * c.fx) > c.half + d.half + .5, `${a.run} and ${b.run} meet`);
    }
  }
});
