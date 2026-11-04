import test from 'node:test';
import assert from 'node:assert/strict';
import { encodePose, decodePose, encodeSnapshot, decodeMessage, say, rollLook, createWalkers, connectNet, POSE_BYTES, NET_RATE, HOW } from './net.js';

const near = (a, b, within, what) => assert.ok(Math.abs(a - b) <= within, `${what ?? 'value'}: ${a} is not within ${within} of ${b}`);

// ---------------- what goes over the wire
test('a pose survives the wire to the millimetre and the centimetre, at the far end of the map', () => {
  const bytes = encodePose(12345, 10234.567, 3.21, -9876.543, 2.5);
  assert.equal(bytes.length, POSE_BYTES);
  const p = decodePose(bytes);
  assert.equal(p.stamp, 12345);
  near(p.x, 10234.567, .002, 'x'); near(p.z, -9876.543, .002, 'z'); near(p.y, 3.21, .006, 'y'); near(p.yaw, 2.5, .0002, 'yaw');
});

test('a stamp wraps at 65536 and a facing wraps round the circle', () => {
  assert.equal(decodePose(encodePose(65536 + 7, 0, 0, 0, 0)).stamp, 7);
  near(decodePose(encodePose(0, 0, 0, 0, -Math.PI / 2)).yaw, Math.PI * 1.5, .0002, 'yaw');
  near(decodePose(encodePose(0, 0, 0, 0, Math.PI * 4.5)).yaw, Math.PI / 2, .0002, 'yaw');
});

test('a pose says what they are in, and counts their swings and waves, so nobody misses one between two poses', () => {
  const p = decodePose(encodePose(1, 0, 0, 0, 0, { ride: 4321, swings: 300, waves: 19, how: HOW.swim }));
  assert.equal(p.ride, 4321, 'which vehicle, one more than its place in the list, and 0 on foot');
  assert.equal(p.swings, 300 % 256, 'swings wrap at 256');
  assert.equal(p.waves, 19 % 16, 'waves wrap at 16');
  assert.equal(p.how, HOW.swim);
  assert.deepEqual(decodePose(encodePose(1, 0, 0, 0, 0)), { ...decodePose(encodePose(1, 0, 0, 0, 0)), ride: 0, swings: 0, waves: 0, how: HOW.foot });
});

test('a snapshot is two bytes and twenty for each person, and reads back as it went in', () => {
  const snap = encodeSnapshot([{ id: 3, pose: encodePose(100, 1, 2, 3, 0) }, { id: 900, pose: encodePose(200, -4, 5, -6, 1, { ride: 7, how: HOW.down }) }]);
  assert.equal(snap.length, 2 + 20 * 2);
  const { players } = decodeMessage(snap);
  assert.deepEqual(players.map((p) => p.id), [3, 900]);
  assert.equal(players[1].stamp, 200); near(players[1].x, -4, .001, 'x'); near(players[1].y, 5, .006, 'y'); near(players[1].z, -6, .001, 'z');
  assert.equal(players[1].ride, 7); assert.equal(players[1].how, HOW.down);
});

test('everything else goes as words: who you are, who else is here, and why not', () => {
  assert.deepEqual(decodeMessage(say({ t: 'welcome', id: 4242 })), { t: 'welcome', id: 4242 });
  assert.equal(typeof say({ t: 'who', players: [] }), 'string');
  assert.equal(decodeMessage('not json'), null);
  assert.equal(decodeMessage('[1,2]'), null, 'only an object with a kind of message');
});

test('messages read from an ArrayBuffer and from part of a bigger buffer alike', () => {
  const snap = encodeSnapshot([{ id: 5, pose: encodePose(1, 2, 3, 4, 0) }]);
  assert.equal(decodeMessage(snap.buffer.slice(snap.byteOffset, snap.byteOffset + snap.length)).players[0].id, 5);
  const big = new Uint8Array(snap.length + 9); big.set(snap, 9);
  assert.equal(decodeMessage(big.subarray(9)).players[0].id, 5);
});

// ---------------- a look rolled from a name
test('a look rolled from a name is always the same one for that name', () => {
  for (const name of ['Matt', 'Miss Bobby', 'Tre', 'x']) { const l = rollLook(name, 7); assert.ok(Number.isInteger(l) && l >= 0 && l < 7, `${name} gets ${l}`); assert.equal(rollLook(name, 7), l); }
  assert.equal(rollLook('Matt', 7), rollLook('matt', 7), 'whatever the capitals');
});

test('twenty-five names spread over all seven looks', () => {
  const used = new Set(); for (let i = 1; i <= 25; i++) used.add(rollLook(`player ${i}`, 7));
  assert.equal(used.size, 7);
});

// ---------------- someone else's steps
// Someone walks in a straight line along x. They send from a 60 fps page at 20 Hz, a server holds the latest and passes it on at
// its own 20 Hz, out of step with them, and it reaches us a variable time later. We draw at 60 fps.
function watch({ seconds = 5, speed = 4.4, serverPhase = 17, jitter = () => 0, delay, until = () => speed } = {}) {
  const walkers = createWalkers({ looks: 7, delay }), frames = [], FRAME = 1000 / 60;
  const events = [];
  let x = 0, held = null, sendAt = 0, stampEpoch = 40000;
  const truth = [];
  for (let t = 0; t < seconds * 1000; t += FRAME) {
    x += until(t) * FRAME / 1000; truth.push([t, x]);
    if (t >= sendAt) { sendAt += 50; events.push({ at: t + 20, send: encodePose(Math.round(t + stampEpoch), x, 1, 5, Math.PI / 2) }); }
  }
  const ticks = []; for (let t = serverPhase; t < seconds * 1000; t += 50) ticks.push(t);
  // the server's ticks, in order, carrying what had got there by then
  const sends = events.slice(); let i = 0;
  for (const tick of ticks) { while (i < sends.length && sends[i].at <= tick) held = sends[i++].send; if (held) events.push({ at: tick + 20 + jitter(tick), snap: encodeSnapshot([{ id: 9, pose: held }]) }); }
  const incoming = events.filter((e) => e.snap).sort((a, b) => a.at - b.at);
  let j = 0;
  for (let t = 0; t < seconds * 1000 + 1000; t += FRAME) {
    while (j < incoming.length && incoming[j].at <= t) { walkers.take(decodeMessage(incoming[j].snap).players, incoming[j].at); j++; }
    const [w] = walkers.at(t);
    if (w) frames.push({ t, x: w.x, z: w.z, yaw: w.yaw, speed: w.speed, phase: w.phase, y: w.y });
  }
  return { frames, truth, final: x };
}
const worstStep = (frames, from = 1000) => { let worst = 0; for (let i = 1; i < frames.length; i++) if (frames[i].t > from) worst = Math.max(worst, Math.abs(frames[i].x - frames[i - 1].x)); return worst; };

test('nobody is drawn until someone says where they are', () => {
  assert.equal(createWalkers({ looks: 7 }).at(100).length, 0);
});

test('someone new appears where they are, with the name and look they picked', () => {
  const w = createWalkers();
  w.who([{ id: 12, name: 'Miss Bobby', look: 3 }, { id: 13, name: 'Tre', look: 1, hero: true }]);
  w.take([{ id: 12, stamp: 500, x: 40, y: 2, z: -30, yaw: 1 }, { id: 13, stamp: 500, x: 0, y: 0, z: 0, yaw: 0 }], 1000);
  const [a, b] = w.at(1000);
  assert.equal(a.id, 12); assert.equal(a.name, 'Miss Bobby'); assert.equal(a.look, 3); assert.equal(a.hero, false);
  assert.equal(b.hero, true);
  near(a.x, 40, 1e-6, 'x'); near(a.y, 2, 1e-6, 'y'); near(a.z, -30, 1e-6, 'z');
});

test('someone whose name hasn\'t come yet is drawn nameless, and takes it when it comes', () => {
  const w = createWalkers();
  w.take([{ id: 12, stamp: 500, x: 0, y: 0, z: 0, yaw: 0 }], 1000);
  assert.equal(w.at(1000)[0].name, '');
  w.who([{ id: 12, name: 'Tre', look: 2 }]);
  assert.equal(w.at(1010)[0].name, 'Tre'); assert.equal(w.at(1010)[0].look, 2);
});

test('what they are in, how they are and their swings and waves are as of the newest pose, not smoothed', () => {
  const w = createWalkers();
  w.take([{ id: 4, stamp: 0, x: 0, y: 0, z: 0, yaw: 0, ride: 0, swings: 0, waves: 0, how: HOW.foot }], 0);
  w.take([{ id: 4, stamp: 50, x: 1, y: 0, z: 0, yaw: 0, ride: 9, swings: 2, waves: 1, how: HOW.swim }], 50);
  const [a] = w.at(60);
  assert.equal(a.ride, 9); assert.equal(a.swings, 2); assert.equal(a.waves, 1); assert.equal(a.how, HOW.swim);
});

test('at 60 fps a walk out of step with the server moves as evenly as the walk itself', () => {
  const { frames } = watch();
  const one = 4.4 / 60;
  assert.ok(worstStep(frames) < one * 1.5, `worst frame moved ${worstStep(frames).toFixed(3)} m, against ${one.toFixed(3)} m a frame`);
});

test('it stays smooth with up to 50 ms of jitter on the way to us', () => {
  let s = 12345; const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const { frames } = watch({ jitter: () => rand() * 50 });
  const one = 4.4 / 60;
  assert.ok(worstStep(frames) < one * 1.5, `worst frame moved ${worstStep(frames).toFixed(3)} m, against ${one.toFixed(3)} m a frame`);
});

test('it never runs backwards along a straight walk with jitter', () => {
  let s = 777; const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const { frames } = watch({ jitter: () => rand() * 50 });
  for (let i = 1; i < frames.length; i++) if (frames[i].t > 1000) assert.ok(frames[i].x >= frames[i - 1].x - 1e-3, `back ${(frames[i - 1].x - frames[i].x).toFixed(4)} m at ${frames[i].t.toFixed(0)} ms`);
});

test('they end up exactly where they stopped', () => {
  const { frames } = watch({ until: (t) => (t < 3000 ? 4.4 : 0) });
  const last = frames[frames.length - 1];
  near(last.x, 4.4 * 3, .1, 'x');
  assert.ok(last.speed < .05, `still moving at ${last.speed}`);
});

test('what you see is about a tenth of a second behind, plus the wire', () => {
  const { frames, truth } = watch();
  const mid = frames.find((f) => f.t > 3000), [, was] = truth.find(([t]) => t > mid.t);
  const behind = (was - mid.x) / 4.4 * 1000;
  assert.ok(behind > 100 && behind < 220, `${behind.toFixed(0)} ms behind`);
});

test('a stamp seen before is the same pose again, and changes nothing', () => {
  const feed = (again) => {
    const w = createWalkers({ looks: 7 });
    w.take([{ id: 1, stamp: 100, x: 0, y: 0, z: 0, yaw: 0 }], 1000);
    w.take([{ id: 1, stamp: 150, x: .2, y: 0, z: 0, yaw: 0 }], 1050);
    if (again) for (let t = 1100; t < 1200; t += 50) w.take([{ id: 1, stamp: 150, x: .2, y: 0, z: 0, yaw: 0 }], t);
    return w.at(1200)[0];
  };
  assert.equal(feed(true).x, feed(false).x);
  assert.equal(feed(true).speed, feed(false).speed);
});

test('the stamp wrapping round in the middle of a walk is no jump', () => {
  const w = createWalkers({ looks: 7 });
  let last = null;
  for (let i = 0; i < 40; i++) {
    const t = 65536 - 1000 + i * 50, now = 2000 + i * 50;
    w.take([{ id: 1, stamp: t % 65536, x: i * .22, y: 0, z: 0, yaw: 0 }], now);
    const x = w.at(now)[0].x;
    if (last !== null) assert.ok(Math.abs(x - last) < .5, `jumped ${Math.abs(x - last)} at ${i}`);
    last = x;
  }
  assert.ok(last > 6);
});

test('they turn the short way round', () => {
  const w = createWalkers({ looks: 7, delay: 100 });
  w.take([{ id: 1, stamp: 0, x: 0, y: 0, z: 0, yaw: .1 }], 1000);
  w.take([{ id: 1, stamp: 100, x: 0, y: 0, z: 0, yaw: Math.PI * 2 - .1 }], 1100);
  const yaw = w.at(1150).find((a) => a.id === 1).yaw;
  const off = Math.abs(Math.atan2(Math.sin(yaw), Math.cos(yaw)));
  assert.ok(off < .11, `yaw ${yaw} went the long way`);
});

test('someone who jumps across the map is there, and doesn\'t skate past everything on the way', () => {
  const w = createWalkers({ looks: 7, delay: 100 });
  for (let i = 0; i < 10; i++) w.take([{ id: 1, stamp: i * 50, x: 0, y: 0, z: 0, yaw: 0 }], 1000 + i * 50);
  w.take([{ id: 1, stamp: 500, x: 300, y: 0, z: 0, yaw: 0 }], 1500);
  w.take([{ id: 1, stamp: 550, x: 300, y: 0, z: 0, yaw: 0 }], 1550);
  const seen = []; for (let t = 1500; t < 1800; t += 16) seen.push(w.at(t)[0].x);
  assert.ok(seen.every((x) => x < 1 || x > 299), `somewhere in between: ${seen.map((x) => x.toFixed(0))}`);
  assert.ok(seen[seen.length - 1] > 299);
});

test('when the wire goes quiet they carry on for a moment and then wait, without running on', () => {
  const w = createWalkers({ looks: 7, delay: 100 });
  for (let i = 0; i < 40; i++) { w.take([{ id: 1, stamp: i * 50, x: i * .22, y: 0, z: 0, yaw: 0 }], 1000 + i * 50); w.at(1000 + i * 50); }
  const lastSent = 39 * .22;
  const at = (t) => w.at(t)[0];
  const soon = at(1000 + 39 * 50 + 100 + 100).x;   // 100 ms past the last pose in shown time
  assert.ok(soon > lastSent + .3, `stopped dead at ${soon}`);
  const later = at(1000 + 39 * 50 + 5000);
  assert.ok(later.x < lastSent + .7, `ran on to ${later.x}`);
  assert.ok(later.speed < .1, `legs still going at ${later.speed}`);
});

test('legs keep time with the ground: a stride comes round every so many metres, whatever the frame rate', () => {
  const run = (frame) => {
    const w = createWalkers({ looks: 7, delay: 100 });
    let next = 0, phase = 0;
    for (let t = 0; t < 4000; t += frame) {
      while (next <= t) { w.take([{ id: 1, stamp: next, x: next / 1000 * 4.4, y: 0, z: 0, yaw: 0 }], next + 30); next += 50; }
      const a = w.at(t + 30)[0]; if (a) phase = a.phase;
    }
    return phase;
  };
  const at60 = run(1000 / 60), at24 = run(1000 / 24);
  near(at60, at24, at60 * .05, 'phase');
  assert.ok(at60 > 30 && at60 < 50, `${at60} radians in four seconds at a walk`);
});

test('someone who stops being in the snapshots is gone', () => {
  const w = createWalkers({ looks: 7 });
  w.take([{ id: 1, stamp: 0, x: 0, y: 0, z: 0, yaw: 0 }, { id: 2, stamp: 0, x: 5, y: 0, z: 0, yaw: 0 }], 1000);
  w.take([{ id: 2, stamp: 50, x: 5, y: 0, z: 0, yaw: 0 }], 1050);
  assert.deepEqual(w.at(1050).map((a) => a.id), [2]);
});


// ---------------- the connection
class FakeSocket {
  static made = [];
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeSocket.made.push(this); }
  send(b) { this.sent.push(b); }
  opened() { this.readyState = 1; this.onopen?.(); }
  hear(b) { this.onmessage?.({ data: typeof b === 'string' ? b : b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }); }
  shut(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
  get poses() { return this.sent.filter((s) => typeof s !== 'string'); }
  get words() { return this.sent.filter((s) => typeof s === 'string').map((s) => JSON.parse(s)); }
}
const ME = { key: 'a5'.repeat(16), name: 'Tre', look: 2 };
const link = (over = {}) => { FakeSocket.made = []; const t = { now: 0 }; const net = connectNet({ url: 'ws://here', WS: FakeSocket, clock: () => t.now, hello: () => ME, ...over }); return { net, t, socket: () => FakeSocket.made[FakeSocket.made.length - 1] }; };
// connected and let in
const joined = (l, id = 4) => { l.net.update(0, 0, 0, 0); l.socket().opened(); l.socket().hear(say({ t: 'welcome', id })); return l; };

test('nothing happens until the game asks, so a hidden tab never reconnects by itself', () => {
  const { socket } = link();
  assert.equal(socket(), undefined);
});

test('it connects on the first update, says who it is as soon as it can, and sends no pose until it\'s let in', () => {
  const { net, socket } = link();
  net.update(1, 2, 3, 0);
  assert.equal(socket().url, 'ws://here'); assert.equal(socket().sent.length, 0);
  socket().opened();
  assert.deepEqual(socket().words, [{ t: 'hello', ...ME }]);
  net.update(1, 2, 3, 0);
  assert.equal(socket().poses.length, 0);
  socket().hear(say({ t: 'welcome', id: 4 })); net.update(1, 2, 3, 0);
  assert.equal(socket().poses.length, 1); assert.equal(socket().poses[0].length, POSE_BYTES);
});

for (const fps of [30, 60, 120]) test(`at ${fps} fps it still sends twenty poses a second`, () => {
  const l = joined(link()), { net, t, socket } = l;
  for (t.now = 0; t.now < 10000; t.now += 1000 / fps) net.update(t.now, 0, 0, 0);
  const rate = socket().poses.length / 10;
  assert.ok(Math.abs(rate - NET_RATE) < .6, `${rate} a second`);
});

test('a stamp is the sender\'s own clock, so that smoothing doesn\'t care when the server passed it on', () => {
  const l = link(); l.t.now = 1234; joined(l); l.net.update(0, 0, 0, 0);
  assert.equal(decodePose(l.socket().poses[0]).stamp, 1234);
});

test('what he\'s in and how he is go with each pose', () => {
  const { net, socket } = joined(link());
  net.update(1, 2, 3, 0, { ride: 12, swings: 3, waves: 1, how: HOW.swim });
  assert.deepEqual((({ ride, swings, waves, how }) => ({ ride, swings, waves, how }))(decodePose(socket().poses[0])), { ride: 12, swings: 3, waves: 1, how: HOW.swim });
});

test('it knows who it is, and doesn\'t count itself among the others', () => {
  const { net, t, socket } = joined(link());
  assert.equal(net.id, 4);
  t.now = 100; socket().hear(encodeSnapshot([{ id: 4, pose: encodePose(100, 1, 1, 1, 0) }, { id: 5, pose: encodePose(100, 8, 1, 1, 0) }]));
  assert.deepEqual(net.others().map((o) => o.id), [5]);
});

test('who else is here comes by name and look', () => {
  const { net, socket } = joined(link());
  socket().hear(say({ t: 'who', players: [{ id: 4, name: 'Tre', look: 2 }, { id: 5, name: 'Miss Bobby', look: 6 }] }));
  socket().hear(encodeSnapshot([{ id: 5, pose: encodePose(100, 8, 1, 1, 0) }]));
  assert.deepEqual(net.others().map((o) => [o.name, o.look]), [['Miss Bobby', 6]]);
});

test('the welcome, and vehicles left about or taken out from under him, go to the game as they are', () => {
  const heard = [];
  const l = link({ on: { welcome: (m) => heard.push(m), car: (m) => heard.push(m), bump: (m) => heard.push(m) } });
  joined(l, 7);
  l.socket().hear(say({ t: 'car', v: 3, x: 1, y: 0, z: 2, yaw: 0 }));
  l.socket().hear(say({ t: 'bump', ride: 4 }));
  assert.deepEqual(heard.map((m) => m.t), ['welcome', 'car', 'bump']);
  assert.equal(heard[0].id, 7);
});

test('what he carries goes when the game says, once he\'s let in', () => {
  const l = link();
  l.net.keep({ beans: 3, items: { bottle: 1 }, gas: 1 });
  l.net.update(0, 0, 0, 0); l.socket().opened(); l.net.keep({ beans: 3, items: {}, gas: 0 });
  assert.deepEqual(l.socket().words.map((w) => w.t), ['hello']);
  l.socket().hear(say({ t: 'welcome', id: 4 }));
  l.net.keep({ beans: 3, items: { bottle: 1 }, gas: 1 });
  assert.deepEqual(l.socket().words.at(-1), { t: 'keep', beans: 3, items: { bottle: 1 }, gas: 1 });
});

test('it counts what goes each way', () => {
  const { net, socket } = link();
  net.update(0, 0, 0, 0); socket().opened();
  const welcome = say({ t: 'welcome', id: 4 }), snap = encodeSnapshot([{ id: 5, pose: encodePose(100, 8, 1, 1, 0) }]);
  socket().hear(welcome); socket().hear(snap); net.update(0, 0, 0, 0);
  assert.deepEqual(net.count, { framesIn: 2, bytesIn: welcome.length + snap.length, framesOut: 2, bytesOut: socket().sent[0].length + POSE_BYTES });
});

test('losing the connection empties the town, says so once, and tries again after a while', () => {
  const said = []; const l = joined(link({ status: (s) => said.push(s), retry: 2000 })), { net, t, socket } = l;
  socket().hear(encodeSnapshot([{ id: 5, pose: encodePose(0, 8, 1, 1, 0) }]));
  assert.equal(net.others().length, 1);
  const first = socket(); first.shut();
  assert.equal(net.others().length, 0); assert.equal(net.id, 0);
  t.now = 1000; net.update(0, 0, 0, 0);
  assert.equal(socket(), first, 'tried again too soon');
  t.now = 2001; net.update(0, 0, 0, 0);
  assert.notEqual(socket(), first);
  socket().shut(); t.now = 5000; net.update(0, 0, 0, 0); socket().shut();
  assert.deepEqual(said, ['joined', 'lost']);
});

test('a full town says so, and it tries again, but later', () => {
  const said = []; const { net, t, socket } = link({ status: (s) => said.push(s), retry: 2000 });
  net.update(0, 0, 0, 0); socket().opened(); socket().hear(say({ t: 'no', why: 'full', say: 'Chunky\'s full.' })); const first = socket(); first.shut(1000);
  assert.deepEqual(said, ['full']);
  t.now = 2500; net.update(0, 0, 0, 0); assert.equal(socket(), first, 'not as soon as after a dropped line');
  t.now = 10001; net.update(0, 0, 0, 0); assert.notEqual(socket(), first);
});

for (const why of ['name', 'reload', 'hero']) test(`turned away for "${why}", it says why and stays away until it's asked to try again`, () => {
  const said = []; const { net, t, socket } = link({ status: (s, m) => said.push([s, m?.say]), retry: 10 });
  net.update(0, 0, 0, 0); socket().opened(); socket().hear(say({ t: 'no', why, say: 'because' })); const first = socket(); first.shut(1000);
  assert.deepEqual(said, [[why, 'because']]);
  t.now = 60000; net.update(0, 0, 0, 0); assert.equal(socket(), first);
  net.again(); net.update(0, 0, 0, 0); assert.notEqual(socket(), first);
});

test('joining again after being lost says so', () => {
  const said = []; const { net, t, socket } = joined(link({ status: (s) => said.push(s), retry: 10 }));
  socket().shut(); t.now = 100; net.update(0, 0, 0, 0); socket().opened(); socket().hear(say({ t: 'welcome', id: 5 }));
  assert.deepEqual(said, ['joined', 'lost', 'joined']);
  assert.equal(net.id, 5);
});
