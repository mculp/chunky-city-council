// Plays the town everyone shares (CHUNKY-151) in Cloudflare's own runtime on this machine, with wrangler dev, the way it'll be hosted:
// two phones let in, one of them on a page at online.chunky.ms, and each seeing the other twenty times a second, the title card told
// how many are in town (CHUNKY-169), one going, the hero's link, a page on another site turned away, and someone coming back after the
// Worker's been stopped and started again, to where they were, with what they had and with what the cast remember of them, which is
// kept on its own, and then a thousand more coming and going, after which whoever'd been away longest comes back as someone new, with
// what the cast remembered of them gone from where it was kept. And wearing your own rektguy (CHUNKY-170), against a stand-in for the
// chain: a phone pairing with a wallet and coming in wearing its rektguy, seen by its handle and its picture had by it, whoever wears
// the owner's own being the hero, that kept after the stop and the start, and gone with them once the town's let them go. What the
// town does is tested in server/town.test.js, server/host.test.js and server/wallet.test.js, and npm run net plays it in the game.
// And what's broken (CHUNKY-152): a fence knocked down on one phone is down on the other, something at a place set aside isn't kept,
// and the fence is still down after the stop and the start.
//
//   npm run town:host
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import WebSocket from 'ws';
import { encodePose, decodeMessage, say } from '../src/net.js';
import { BRIDGE } from '../src/aside.js';
import { chainStandIn } from './chain-stand-in.mjs';
import { wranglerDev } from './wrangler-dev.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const HERO = 'a-secret-only-the-owner-has-1386', BUILD = { at: 1, world: 'the-same-vehicles' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, ms = 10000) => { const end = Date.now() + ms; while (!fn()) { if (Date.now() > end) throw new Error(`timed out waiting for ${what}`); await sleep(20); } };

// Ethereum as far as the wallet needs it, on a port of its own: two wallets made up for this, one with rektguy 7 and one with the
// owner's own, and a picture of each
const wallet = privateKeyToAccount(generatePrivateKey()), owners = privateKeyToAccount(generatePrivateKey());
const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 3, 8, 6);
const chain = await chainStandIn({ owners: { 7: wallet.address, 1386: owners.address }, base: 'ipfs://QmMeta/', ipfs: {
  'QmMeta/7': JSON.stringify({ image: 'ipfs://QmArt/7.png' }), 'QmArt/7.png': PNG, 'QmMeta/1386': JSON.stringify({ image: 'ipfs://QmArt/1386.png' }), 'QmArt/1386.png': PNG,
} }).listen();

const kept = mkdtempSync(join(tmpdir(), 'chunky-town-'));
// The Worker as wrangler dev runs it, with what it keeps in `kept`, so it's still there after a stop and a start
const dev = wranglerDev({ cwd: ROOT, args: ['--config', 'server/wrangler.jsonc', '--persist-to', kept, '--var', `CHUNKY_HERO:${createHash('sha256').update(HERO).digest('hex')}`,
  '--var', `ETH_RPC_URL:${chain.rpc}`, '--var', `IPFS_GATEWAY:${chain.gateway}`] });
const start = async () => `ws://127.0.0.1:${await dev.start()}/town`, stop = () => dev.stop();

// A phone, on a page at chunky.ms unless it's said where: it says hello as soon as it's open
const phones = [];
function phone(url, { key, name = 'Junebug', hero, origin = 'https://chunky.ms' }) {
  const ws = new WebSocket(url, { origin }), p = { ws, id: 0, snaps: [], words: [], refused: null, closed: null };
  phones.push(p);
  ws.on('unexpected-response', (req, res) => { p.refused = res.statusCode; res.resume(); });
  ws.on('message', (data, isBinary) => {
    const m = decodeMessage(isBinary ? data : data.toString());
    if (!m) return;
    if (isBinary) p.snaps.push(m.players); else { p.words.push(m); if (m.t === 'welcome') p.id = m.id; }
  });
  ws.on('close', (code) => { p.closed = code; });
  ws.on('error', () => {});
  ws.on('open', () => ws.send(say({ t: 'hello', key, name, look: 1, hero, build: BUILD })));
  p.say = (x, z) => ws.send(encodePose(Math.round(performance.now()) & 0xffff, x, 1, z, 0));
  p.welcome = () => p.words.find((m) => m.t === 'welcome');
  return p;
}
const sees = (p, who, x, z) => p.snaps.at(-1)?.some((q) => q.id === who.id && Math.abs(q.x - x) < .01 && Math.abs(q.z - z) < .01);
// how many are in town, as the title card on a page at online.chunky.ms asks before anyone's said who they are
const hereOf = (url, origin = 'https://online.chunky.ms') => fetch(`${url.replace(/^ws/, 'http')}/here`, { headers: { Origin: origin } });
// the wallet's side of the town, as the phone and the wallet's page at online.chunky.ms ask it
const http = (url) => url.replace(/^ws/, 'http').replace(/\/town$/, '');
const askWallet = async (url, what, body) => (await fetch(`${http(url)}/wallet/${what}`, { method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: 'https://online.chunky.ms' }, body: JSON.stringify(body) })).json();
async function signIn(url, key, who) {
  const { code } = await askWallet(url, 'pair', { key });
  const { words } = await askWallet(url, 'words', { code, address: who.address });
  assert.deepEqual(await askWallet(url, 'signed', { code, signature: await who.signMessage({ message: words }) }), { done: true });
  return askWallet(url, 'waiting', { code, key });
}

try {
  let url = await start();
  const empty = await hereOf(url);
  assert.equal(empty.status, 200); assert.equal(empty.headers.get('access-control-allow-origin'), 'https://online.chunky.ms');
  assert.equal(empty.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await empty.json(), { here: 0, wallets: true });
  const a = phone(url, { key: 'a'.repeat(32) }), b = phone(url, { key: 'b'.repeat(32), name: 'Dee', origin: 'https://online.chunky.ms' });
  await until(() => a.id && b.id, 'both to be let in');
  a.say(5, 6); b.say(-3, 4);
  await until(() => sees(b, a, 5, 6) && sees(a, b, -3, 4), 'each to see the other');
  const before = b.snaps.length; await sleep(1000);
  const rate = b.snaps.length - before;
  assert.ok(rate >= 15 && rate <= 25, `${rate} snapshots in a second`);
  console.log(`two phones are let in, one on a page at online.chunky.ms, and each sees the other where they said, ${rate} times a second`);
  assert.deepEqual(await (await hereOf(url)).json(), { here: 2, wallets: true });
  console.log('the title card is told how many are in town, nobody and then the two of them, and that the town can pair a wallet');

  a.ws.send(say({ t: 'keep', beans: 4, items: { bottle: 1 }, gas: 0 }));
  a.ws.send(say({ t: 'mind', who: 'coop', said: 'Hey.' })); a.ws.send(say({ t: 'mind', who: 'coop', visit: true }));
  // a fence knocked down, and something at Robby's lot, where nothing's kept broken
  const fence = { k: 'pfence:1:0', x: .1, z: 0, d: 9 }, atTheLot = { k: 'pfence:2:0', x: -254.5 - BRIDGE[0], z: 200 - BRIDGE[1], d: 9 };
  a.ws.send(say({ t: 'wreck', w: [fence, atTheLot] }));
  await until(() => b.words.some((m) => m.t === 'wreck'), 'the other to be told what\'s broken');
  assert.deepEqual(b.words.filter((m) => m.t === 'wreck'), [{ t: 'wreck', w: [fence] }]);
  console.log('a fence knocked down on one phone is down on the other, and nothing at a place set aside is kept broken');
  await sleep(100);
  a.ws.close();
  // sooner than the five seconds it takes the town to let go of anyone who's gone quiet, so it's the going that did it
  await until(() => b.snaps.length && !b.snaps.at(-1).some((q) => q.id === a.id), 'the one who went to be gone', 2000);
  console.log('one goes, and is gone from the next snapshot');

  const h = phone(url, { key: 'h'.repeat(32), name: 'River', hero: HERO }), n = phone(url, { key: 'n'.repeat(32), name: 'Lou', hero: 'a-guess-at-it' });
  await until(() => h.id && n.id, 'the hero and a guess to be let in');
  assert.equal(h.welcome().hero, true); assert.equal(n.welcome().hero, false);
  console.log('the hero is whoever has the hero\'s secret, and nobody else');

  const away = phone(url, { key: 'x'.repeat(32), name: 'Ray', origin: 'https://elsewhere.example' });
  await until(() => away.refused !== null || away.closed !== null, 'a page on another site to be answered');
  assert.equal(away.refused, 403); assert.equal(away.id, 0);
  assert.equal((await hereOf(url, 'https://elsewhere.example')).status, 403);
  console.log('a page on another site is turned away, and isn\'t told how many are in town');

  // a phone pairs with a wallet, and comes in wearing its rektguy
  const told = await signIn(url, 'w'.repeat(32), wallet);
  assert.equal(told.wearing, told.rekt[0]);
  const w = phone(url, { key: 'w'.repeat(32), name: 'Pearl' });
  await until(() => w.id, 'the one wearing their own to be let in');
  assert.equal(w.welcome().rekt, told.wearing);
  await until(() => b.words.some((m) => m.t === 'who' && m.players.some((q) => q.id === w.id && q.rekt === told.wearing)), 'the others to see what they\'re wearing');
  const picture = await fetch(`${http(url)}/rektguy/${told.wearing}`);
  assert.equal(picture.headers.get('content-type'), 'image/png');
  assert.deepEqual([...new Uint8Array(await picture.arrayBuffer())], [...PNG]);
  await signIn(url, 'o'.repeat(32), owners);
  const o = phone(url, { key: 'o'.repeat(32), name: 'Moss' });
  await until(() => o.id, 'the one wearing the owner\'s own to be let in');
  assert.deepEqual([o.welcome().hero, o.welcome().rekt], [true, undefined]);
  assert.equal((await fetch(`${http(url)}/wallet/pair`, { method: 'POST', headers: { Origin: 'https://elsewhere.example' }, body: '{}' })).status, 403);
  console.log('a phone pairs with a wallet and comes in wearing its rektguy, which everyone sees by its handle and its picture, and whoever wears the owner\'s own is the hero');

  for (const p of [b, h, n, w, o]) p.ws.close();
  await until(() => [b, h, n, w, o].every((p) => p.closed !== null), 'everyone to have gone');
  await sleep(500);
  await stop(); url = await start();
  const back = phone(url, { key: 'a'.repeat(32) });
  await until(() => back.id, 'someone coming back to be let in');
  const had = back.welcome().saved;
  assert.deepEqual([had?.x, had?.z, had?.beans, had?.items?.bottle], [5, 6, 4, 1]);
  assert.deepEqual(back.welcome().minds, { coop: { notes: [], said: ['Hey.'], visits: 1 } });
  assert.deepEqual(n.welcome().minds, {});
  assert.deepEqual(await askWallet(url, 'mine', { key: 'w'.repeat(32) }), { rekt: told.rekt, wearing: told.wearing });
  assert.deepEqual(back.welcome().wrecks, [fence]);
  console.log('stopped and started again, someone coming back finds where they were, what they had, Coop remembering them, what they wear of their own, and the fence still down');

  // a thousand more come and go, twenty at a time, so that they're the thousand the town keeps
  back.ws.close();
  await until(() => back.closed !== null, 'them to go again');
  for (let i = 0; i < 1000; i += 20) {
    const some = Array.from({ length: 20 }, (_, j) => phone(url, { key: `someone-${i + j}`.padEnd(16, '-') }));
    await until(() => some.every((p) => p.id), 'twenty more to be let in');
    for (const p of some) p.ws.close();
    await until(() => some.every((p) => p.closed !== null), 'them to go');
  }
  await sleep(500);
  const forgotten = phone(url, { key: 'a'.repeat(32) });
  await until(() => forgotten.id, 'the one away longest to come back');
  assert.equal(forgotten.welcome().saved, null);
  assert.deepEqual(forgotten.welcome().minds, {});
  assert.deepEqual(await askWallet(url, 'mine', { key: 'w'.repeat(32) }), { rekt: [], wearing: null });
  console.log('a thousand more come and go, and whoever\'d been away longest comes back as someone new, with Coop not remembering them, and their wallet forgotten');
  console.log('town host: all good');
} finally {
  for (const p of phones) p.ws.terminate();
  await stop();
  await chain.close();
  rmSync(kept, { recursive: true, force: true });
}
