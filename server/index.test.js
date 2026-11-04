// The server over real sockets, with Node's own WebSocket as the far end
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './index.js';
import { encodePose, decodeMessage, say, NET_MAX } from '../src/net.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const end = Date.now() + ms; while (!fn()) { if (Date.now() > end) throw new Error('timed out waiting for ' + fn); await sleep(5); } };
let made = 0;
// A phone: it says hello as soon as it's open, unless it's told not to
function client(port, hello = {}, { silent = false } = {}) {
  const ws = new WebSocket(`ws://localhost:${port}`), c = { ws, id: 0, snaps: [], words: [], closed: null, sent: 0, key: hello.key ?? `phone-${++made}-${'k'.repeat(16)}` };
  ws.binaryType = 'arraybuffer';
  ws.onmessage = (e) => {
    const m = decodeMessage(e.data);
    if (!m) return;
    if (typeof e.data === 'string') { c.words.push(m); if (m.t === 'welcome') c.id = m.id; }
    else c.snaps.push({ at: performance.now(), players: m.players, bytes: e.data.byteLength });
  };
  ws.onclose = (e) => { c.closed = e.code; };
  c.ready = new Promise((r) => { ws.onopen = r; });
  if (!silent) c.ready.then(() => ws.send(say({ t: 'hello', name: 'Tre', look: 1, ...hello, key: c.key })));
  c.say = (x, y = 1, z = 2, extra) => { ws.send(encodePose(Math.round(performance.now()), x, y, z, 0, extra)); c.sent++; };
  c.in = () => until(() => c.id);
  return c;
}

test('it says who you are, and each sees the other where they said', async () => {
  const s = await startServer({ port: 0, quiet: true });
  try {
    const a = client(s.port), b = client(s.port, { name: 'Miss Bobby' });
    await Promise.all([a.in(), b.in()]); assert.notEqual(a.id, b.id);
    a.say(12.5); b.say(-7);
    await until(() => a.snaps.at(-1)?.players.length === 2 && b.snaps.at(-1)?.players.length === 2);
    const onA = a.snaps.at(-1).players.find((p) => p.id === b.id), onB = b.snaps.at(-1).players.find((p) => p.id === a.id);
    assert.equal(onA.x, -7); assert.equal(onB.x, 12.5);
    await until(() => a.words.some((w) => w.t === 'who' && w.players.length === 2));
    assert.deepEqual(a.words.findLast((w) => w.t === 'who').players.map((p) => p.name).sort(), ['Miss Bobby', 'Tre']);
    a.ws.close(); b.ws.close();
  } finally { await s.close(); }
});

test('it sends to everyone twenty times a second, whether or not anyone moves', async () => {
  const s = await startServer({ port: 0, quiet: true });
  try {
    const a = client(s.port); await a.in();
    const from = a.snaps.length, t0 = performance.now(); await sleep(2000);
    const rate = (a.snaps.length - from) / ((performance.now() - t0) / 1000);
    assert.ok(Math.abs(rate - 20) < .75, `${rate.toFixed(2)} a second`);
    a.ws.close();
  } finally { await s.close(); }
});

test('someone who leaves is gone from the next snapshot', async () => {
  const s = await startServer({ port: 0, quiet: true });
  try {
    const a = client(s.port), b = client(s.port); await Promise.all([a.in(), b.in()]);
    a.say(1); b.say(2);
    await until(() => a.snaps.at(-1)?.players.length === 2);
    b.ws.close();
    await until(() => a.snaps.at(-1).players.length === 1);
    a.ws.close();
  } finally { await s.close(); }
});

test(`the ${NET_MAX + 1}th is told it's full, and the rest aren't bothered`, async () => {
  const s = await startServer({ port: 0, quiet: true });
  try {
    const all = Array.from({ length: NET_MAX }, () => client(s.port));
    await Promise.all(all.map((c) => c.in()));
    const extra = client(s.port); await until(() => extra.closed !== null);
    assert.equal(extra.words[0].why, 'full');
    assert.ok(all.every((c) => c.closed === null));
    all.forEach((c) => c.ws.close());
  } finally { await s.close(); }
});

test('someone who goes quiet is dropped and leaves the snapshot, and someone talking isn\'t', async () => {
  const s = await startServer({ port: 0, quiet: true, silence: 300 });
  try {
    const a = client(s.port), b = client(s.port); await Promise.all([a.in(), b.in()]);
    const talk = setInterval(() => a.say(1), 50);
    b.say(2);
    await until(() => a.snaps.at(-1)?.players.length === 2);
    await until(() => b.closed !== null, 2000);
    await until(() => a.snaps.at(-1).players.length === 1);
    assert.equal(a.closed, null);
    clearInterval(talk); a.ws.close();
  } finally { await s.close(); }
});

test('a phone that never says hello is let go, and one with no proper key is told why', async () => {
  const s = await startServer({ port: 0, quiet: true, helloWithin: 200 });
  try {
    const mute = client(s.port, {}, { silent: true }), bad = client(s.port, { key: 'short' });
    await until(() => mute.closed !== null && bad.closed !== null);
    assert.equal(mute.id, 0); assert.equal(bad.words[0].why, 'key');
  } finally { await s.close(); }
});

test('rubbish and oversize messages don\'t move anyone or take the server down', async () => {
  const s = await startServer({ port: 0, quiet: true });
  try {
    const a = client(s.port), bad = client(s.port); await Promise.all([a.in(), bad.in()]);
    a.say(3); bad.say(4);
    await until(() => a.snaps.at(-1)?.players.length === 2);
    bad.ws.send('hello'); bad.ws.send(say({ t: 'hello', key: 'z'.repeat(40), name: 'Again' })); bad.ws.send(new Uint8Array(3)); bad.ws.send(encodePose(1, NaN, 0, 0, 0));
    await sleep(120);
    assert.equal(a.snaps.at(-1).players.find((p) => p.id === bad.id).x, 4);
    bad.ws.send(new Uint8Array(70000));
    await until(() => bad.closed !== null);
    await until(() => a.snaps.at(-1).players.length === 1);
    assert.equal(a.closed, null);
    a.ws.close();
  } finally { await s.close(); }
});

test('someone coming back after the server\'s been stopped and started finds where they were and what they had', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chunky-town-')), save = join(dir, 'town.json');
  try {
    const s = await startServer({ port: 0, quiet: true, save, saveEvery: 50 });
    const a = client(s.port, { key: 'me-on-my-phone-0001' }); await a.in();
    a.say(120, 1.5, -40); a.ws.send(say({ t: 'keep', beans: 3, items: { bottle: 1 }, gas: 0 }));
    await sleep(200); await s.close();
    assert.ok(existsSync(save));
    const again = await startServer({ port: 0, quiet: true, save });
    try {
      const back = client(again.port, { key: 'me-on-my-phone-0001' }); await back.in();
      const { saved } = back.words.find((w) => w.t === 'welcome');
      assert.equal(saved.x, 120); assert.equal(saved.z, -40); assert.equal(saved.beans, 3); assert.deepEqual(saved.items, { bottle: 1 });
      back.ws.close();
    } finally { await again.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the hero is whoever has the hero\'s key, nobody else, and only one phone at a time', async () => {
  const s = await startServer({ port: 0, quiet: true, heroHash: createHash('sha256').update('the-owners-secret').digest('hex') });
  try {
    const a = client(s.port, { hero: 'the-owners-secret' }), b = client(s.port, { hero: 'a guess' });
    await Promise.all([a.in(), b.in()]);
    assert.equal(a.words.find((w) => w.t === 'welcome').hero, true);
    assert.equal(b.words.find((w) => w.t === 'welcome').hero, false);
    const c = client(s.port, { hero: 'the-owners-secret' }); await c.in();
    await until(() => a.closed !== null);
    assert.equal(a.words.at(-1).why, 'hero');
    assert.equal(c.words.find((w) => w.t === 'welcome').hero, true);
    b.ws.close(); c.ws.close();
  } finally { await s.close(); }
});

test('a vehicle one leaves somewhere is told to everyone', async () => {
  const s = await startServer({ port: 0, quiet: true });
  try {
    const a = client(s.port), b = client(s.port); await Promise.all([a.in(), b.in()]);
    a.say(10, 0, 10, { ride: 3 }); await sleep(60); a.say(12, 0, 12);
    await until(() => b.words.some((w) => w.t === 'car'));
    assert.deepEqual(b.words.find((w) => w.t === 'car'), { t: 'car', v: 2, x: 10, y: 0, z: 10, yaw: 0 });
    a.ws.close(); b.ws.close();
  } finally { await s.close(); }
});

test('it counts what it sent and heard for each of them', async () => {
  const s = await startServer({ port: 0, quiet: true });
  try {
    const a = client(s.port); await a.in();
    a.say(1); await until(() => a.snaps.length > 3);
    const [me] = s.stats().clients;
    assert.equal(me.id, a.id);
    assert.ok(me.bytesOut > 0 && me.bytesIn > 0, JSON.stringify(me));
    a.ws.close();
  } finally { await s.close(); }
});

test('closing it closes everyone and lets the port go', async () => {
  const s = await startServer({ port: 0, quiet: true }), port = s.port;
  const a = client(port); await a.in();
  await s.close();
  await until(() => a.closed !== null);
  const again = await startServer({ port, quiet: true });
  assert.equal(again.port, port);
  await again.close();
});
