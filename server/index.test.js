// The server over real sockets, with Node's own WebSocket as the far end
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { startServer } from './index.js';
import { createChain } from './chain.js';
import { chainStandIn } from '../tools/chain-stand-in.mjs';
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
  if (!silent) c.ready.then(() => ws.send(say({ t: 'hello', name: 'Junebug', look: 1, ...hello, key: c.key })));
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
    assert.deepEqual(a.words.findLast((w) => w.t === 'who').players.map((p) => p.name).sort(), ['Junebug', 'Miss Bobby']);
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

test('what\'s broken is kept beside the town and still broken after it\'s been stopped and started, until it heals, and nothing\'s kept at the places set aside', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chunky-town-')), save = join(dir, 'town.json'), day = 864e5;
  const fence = { k: 'pfence:1:0', x: .1, z: 0, d: 9 }, atTheLot = { k: 'pfence:2:0', x: -254.5 - 6843.067, z: 200 - 7797.433, d: 9 };
  try {
    const s = await startServer({ port: 0, quiet: true, save, saveEvery: 50 });
    const a = client(s.port); await a.in();
    a.ws.send(say({ t: 'wreck', w: [fence, atTheLot] }));
    await sleep(200); await s.close();
    assert.deepEqual(JSON.parse(readFileSync(save, 'utf8')).wrecks.map((w) => w.k), ['pfence:1:0']);
    for (const [later, broken] of [[0, [fence]], [day, []]]) {
      const again = await startServer({ port: 0, quiet: true, save, wall: () => Date.now() + later });
      try {
        const b = client(again.port); await b.in();
        assert.deepEqual(b.words.find((w) => w.t === 'welcome').wrecks, broken);
        b.ws.close();
      } finally { await again.close(); }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('and what the cast remember of them is kept beside the town, and comes back with them and nobody else', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chunky-town-')), save = join(dir, 'town.json');
  try {
    const s = await startServer({ port: 0, quiet: true, save, saveEvery: 50 });
    const a = client(s.port, { key: 'me-on-my-phone-0002' }); await a.in();
    a.ws.send(say({ t: 'mind', who: 'coop', said: 'Hey.' })); a.ws.send(say({ t: 'mind', who: 'coop', visit: true }));
    await sleep(200); a.ws.close(); await sleep(200); await s.close();
    const again = await startServer({ port: 0, quiet: true, save });
    try {
      const back = client(again.port, { key: 'me-on-my-phone-0002' }), someone = client(again.port); await Promise.all([back.in(), someone.in()]);
      assert.deepEqual(back.words.find((w) => w.t === 'welcome').minds, { coop: { notes: [], said: ['Hey.'], visits: 1 } });
      assert.deepEqual(someone.words.find((w) => w.t === 'welcome').minds, {});
      back.ws.close(); someone.ws.close();
    } finally { await again.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('someone the town lets go of, to keep only so many, is gone from what\'s kept, with what the cast remember of them', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chunky-town-')), save = join(dir, 'town.json');
  try {
    const s = await startServer({ port: 0, quiet: true, save, saveEvery: 50, keeps: 1 });
    const a = client(s.port, { key: 'me-on-my-phone-0003' }); await a.in();
    a.ws.send(say({ t: 'mind', who: 'coop', said: 'Hey.' }));
    await sleep(200); a.ws.close(); await sleep(100);
    const b = client(s.port); await b.in(); b.ws.close();
    await sleep(200); await s.close();
    const kept = JSON.parse(readFileSync(save, 'utf8'));
    assert.equal(Object.keys(kept.players).length, 1);
    assert.equal(JSON.stringify(kept).includes('Hey.'), false);
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

// the characters' words, asked as the game asks the talk server
const ask = (port, { origin = 'http://localhost:4321', body } = {}) => fetch(`http://localhost:${port}/talk`, {
  method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: origin },
  body: body ?? JSON.stringify({ phone: 'p'.repeat(32), messages: [{ role: 'system', content: 'You are Coop.' }, { role: 'user', content: 'Hey.' }] }),
});

test('with --talk, it answers the characters\' words by the talk server\'s rules, with one line that costs nothing', async () => {
  const s = await startServer({ port: 0, quiet: true, talk: { line: '{"say":"Well, look who it is."}' } });
  try {
    const res = await ask(s.port), got = await res.json();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:4321');
    assert.equal(got.reply, '{"say":"Well, look who it is."}'); assert.equal(got.cost, 0); assert.ok(got.model);
    assert.deepEqual(await (await ask(s.port, { body: '{"phone":"nope"}' })).json(), { quiet: 'bad' }, 'an ask that breaks the rules is turned down as it would be');
    assert.equal((await ask(s.port, { origin: 'https://somewhere.else' })).status, 403, 'a page that isn\'t on this machine is turned away');
  } finally { await s.close(); }
});

test('it can be asked to be quiet, the way the talk server is when the month\'s money is spent', async () => {
  const s = await startServer({ port: 0, quiet: true, talk: { quiet: 'cap' } });
  try { assert.deepEqual(await (await ask(s.port)).json(), { quiet: 'cap' }); } finally { await s.close(); }
});

test('without --talk there\'s no /talk, and the town still works', async () => {
  const s = await startServer({ port: 0, quiet: true });
  try {
    assert.notEqual((await ask(s.port)).status, 200);
    const a = client(s.port); await a.in(); a.ws.close();
  } finally { await s.close(); }
});

// how many are in town, as the title card asks before anyone's said who they are
const here = (port) => fetch(`http://localhost:${port}/here`, { headers: { Origin: 'http://localhost:4321' } });

test('it says how many are in town right now at /here, for the title card, counting only those let in', async () => {
  const s = await startServer({ port: 0, quiet: true });
  try {
    const empty = await here(s.port);
    assert.equal(empty.status, 200);
    assert.equal(empty.headers.get('access-control-allow-origin'), '*', 'any page can ask, as any page can join');
    assert.equal(empty.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await empty.json(), { here: 0 });
    const a = client(s.port), b = client(s.port), quiet = client(s.port, {}, { silent: true });
    await Promise.all([a.in(), b.in(), quiet.ready]);
    assert.deepEqual(await (await here(s.port)).json(), { here: 2 }, 'a phone that hasn\'t said hello isn\'t in town');
    b.ws.close();
    await until(() => b.closed !== null);
    await sleep(50);
    assert.deepEqual(await (await here(s.port)).json(), { here: 1 }, 'and one who leaves isn\'t counted');
    a.ws.close(); quiet.ws.close();
  } finally { await s.close(); }
});

test('a town that can pair a wallet says so at /here, so the title card only offers it then', async () => {
  const s = await startServer({ port: 0, quiet: true, chain: createChain({ rpc: ['http://chain.stand-in/'], fetch: chainStandIn({ owners: {} }).fetch }) });
  try { assert.deepEqual(await (await here(s.port)).json(), { here: 0, wallets: true }); } finally { await s.close(); }
});

// ---------------- wearing your own rektguy (CHUNKY-170), with a stand-in for the chain and a wallet made up for the test
const PAGE = 'http://localhost:8000', PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4);
function standInChain(owners) {
  const s = chainStandIn({ owners, base: 'ipfs://QmMeta/', ipfs: Object.fromEntries(Object.keys(owners).flatMap((id) => [[`QmMeta/${id}`, JSON.stringify({ image: `ipfs://QmArt/${id}.png` })], [`QmArt/${id}.png`, PNG]])) });
  return createChain({ rpc: ['http://chain.stand-in/'], gateway: 'http://chain.stand-in/ipfs/', fetch: s.fetch });
}
const askWallet = (port, what, body, origin = PAGE) => fetch(`http://localhost:${port}/wallet/${what}`, { method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: origin }, body: JSON.stringify(body) });
async function signIn(port, key, wallet) {
  const { code } = await (await askWallet(port, 'pair', { key })).json();
  const { words } = await (await askWallet(port, 'words', { code, address: wallet.address })).json();
  assert.deepEqual(await (await askWallet(port, 'signed', { code, signature: await wallet.signMessage({ message: words }) })).json(), { done: true });
  return (await askWallet(port, 'waiting', { code, key })).json();
}

test('a phone on this machine pairs with a wallet, comes in wearing its rektguy, and everyone sees it by its handle', async () => {
  const me = privateKeyToAccount(generatePrivateKey()), owner = privateKeyToAccount(generatePrivateKey());
  const s = await startServer({ port: 0, quiet: true, chain: standInChain({ 7: me.address, 1386: owner.address }) });
  try {
    const told = await signIn(s.port, 'me-on-my-phone-0170', me);
    assert.equal(told.wearing, told.rekt[0]);
    const a = client(s.port, { key: 'me-on-my-phone-0170' }), b = client(s.port, { name: 'Dee' }); await Promise.all([a.in(), b.in()]);
    assert.equal(a.words.find((w) => w.t === 'welcome').rekt, told.wearing);
    await until(() => b.words.some((w) => w.t === 'who' && w.players.some((p) => p.id === a.id && p.rekt === told.wearing)));
    const picture = await fetch(`http://localhost:${s.port}/rektguy/${told.wearing}`);
    assert.equal(picture.headers.get('content-type'), 'image/png');
    assert.deepEqual([...new Uint8Array(await picture.arrayBuffer())], [...PNG]);
    // and whoever's wearing the owner's own is the hero
    await signIn(s.port, 'the-owners-phone-1386', owner);
    const o = client(s.port, { key: 'the-owners-phone-1386', name: 'Lou' }); await o.in();
    assert.deepEqual([o.words.find((w) => w.t === 'welcome').hero, o.words.find((w) => w.t === 'welcome').rekt], [true, undefined]);
    assert.equal((await askWallet(s.port, 'pair', { key: 'me-on-my-phone-0170' }, 'https://elsewhere.example')).status, 403, 'and only pages on this machine are answered');
    for (const c of [a, b, o]) c.ws.close();
  } finally { await s.close(); }
});

test('what\'s kept of a wallet is kept with the town, and goes with whoever the town lets go of', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chunky-town-')), save = join(dir, 'town.json'), me = privateKeyToAccount(generatePrivateKey());
  try {
    const chain = standInChain({ 7: me.address });
    const s = await startServer({ port: 0, quiet: true, save, saveEvery: 50, keeps: 1, chain });
    let wearing;
    try { ({ wearing } = await signIn(s.port, 'me-on-my-phone-0171', me)); await sleep(200); } finally { await s.close(); }
    const again = await startServer({ port: 0, quiet: true, save, saveEvery: 50, keeps: 1, chain });
    try {
      assert.deepEqual(await (await askWallet(again.port, 'mine', { key: 'me-on-my-phone-0171' })).json(), { rekt: [wearing], wearing, numbers: { [wearing]: 7 } });
      // they come and go, and then someone else does, which is one more than it keeps
      const a = client(again.port, { key: 'me-on-my-phone-0171' }); await a.in(); a.ws.close(); await sleep(100);
      const b = client(again.port); await b.in(); b.ws.close();
      await sleep(200);
      assert.deepEqual(await (await askWallet(again.port, 'mine', { key: 'me-on-my-phone-0171' })).json(), { rekt: [], wearing: null, numbers: {} });
    } finally { await again.close(); }
    assert.equal(readFileSync(save, 'utf8').toLowerCase().includes(me.address.toLowerCase().slice(2)), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
