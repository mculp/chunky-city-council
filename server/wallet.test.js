import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createPairings, createBindings, createMemoryStore, createWalletRoutes, LETTERS, PAIR_FOR, HERO_TOKEN, RECHECK } from './wallet.js';
import { createChain } from './chain.js';
import { chainStandIn } from '../tools/chain-stand-in.mjs';

const HERE = 'https://online.chunky.ms', ME = '0x1111111111111111111111111111111111111111';
let at = Date.UTC(2026, 10, 4, 18, 20);
const clock = () => at;
const later = (ms) => { at += ms; };
const K = 'a'.repeat(64);

// ---------------- pairing the game with the wallet's own page (CHUNKY-170)
test('a phone asking to pair gets a code for the wallet\'s page and four letters to see on both screens, for five minutes', async () => {
  const p = createPairings({ store: createMemoryStore(), clock }), a = await p.pair(K), b = await p.pair('b'.repeat(64));
  assert.match(a.code, /^[\w-]{22,}$/);
  assert.notEqual(a.code, b.code);
  assert.match(a.letters, new RegExp(`^[${LETTERS}]{4}$`));
  assert.equal(a.until, at + PAIR_FOR);
  assert.equal(PAIR_FOR, 5 * 60 * 1000);
  assert.deepEqual(await p.seen(a.code), { letters: a.letters, until: a.until });
  assert.equal(LETTERS.match(/[AEIOUL]/), null, 'no vowels, so four of them never spell anything, and no L to mistake for an I');
});

test('a phone has one pairing at a time, and there are only so many at once', async () => {
  const p = createPairings({ store: createMemoryStore(), clock, most: 2 }), a = await p.pair(K);
  await p.pair(K);
  assert.equal(await p.seen(a.code), null, 'asking again lets the first go');
  await p.pair('b'.repeat(64));
  assert.deepEqual(await p.pair('c'.repeat(64)), { no: 'busy' });
  later(PAIR_FOR + 1);
  assert.ok((await p.pair('c'.repeat(64))).code, 'and once theirs are over there\'s room again');
});

test('a pairing\'s kept where it\'s put, so a town that\'s been put away in the meantime still has it', async () => {
  const store = createMemoryStore(), { code, letters } = await createPairings({ store, clock }).pair(K);
  assert.deepEqual(await createPairings({ store, clock }).seen(code), { letters, until: at + PAIR_FOR });
});

test('the words to sign are plain, for that pairing and that wallet, with the four letters and the date, and say it costs nothing', async () => {
  const p = createPairings({ store: createMemoryStore(), clock: () => Date.UTC(2026, 10, 4, 18, 20) }), { code, letters } = await p.pair(K);
  const { words } = await p.words(code, ME, HERE);
  const lines = words.split('\n');
  assert.equal(lines[0], 'online.chunky.ms wants you to sign in with your Ethereum account:');
  assert.equal(lines[1], ME);
  assert.equal(lines[3], `Wear your rektguy in Chunky, on the screen showing ${letters}, on 4 November 2026. It's only a signature: it costs nothing and moves nothing.`);
  assert.deepEqual(lines.slice(5, 8), ['URI: https://online.chunky.ms', 'Version: 1', 'Chain ID: 1']);
  assert.match(lines[8], /^Nonce: [A-Za-z0-9]{16}$/);
  assert.equal(lines[9], 'Issued At: 2026-11-04T18:20:00.000Z');
  assert.equal(lines[10], 'Expiration Time: 2026-11-04T18:25:00.000Z');
  assert.equal(lines.length, 11);
});

test('words are only for a pairing that\'s live, an address that\'s one, and the game\'s own pages', async () => {
  const p = createPairings({ store: createMemoryStore(), clock }), { code } = await p.pair(K);
  assert.equal((await p.words('nope', ME, HERE)).no, 'gone');
  assert.equal((await p.words(code, '0x123', HERE)).no, 'address');
  assert.equal((await p.words(code, ME, 'https://elsewhere.example')).no, 'page');
  const local = createPairings({ store: createMemoryStore(), clock, pages: (o) => o.startsWith('http://localhost:') }), l = (await local.pair(K)).code;
  assert.deepEqual((await local.words(l, ME, 'http://localhost:8000')).words.split('\n').filter((s) => /^(localhost|URI)/.test(s)), ['localhost:8000 wants you to sign in with your Ethereum account:', 'URI: http://localhost:8000']);
  later(PAIR_FOR + 1);
  assert.equal((await p.words(code, ME, HERE)).no, 'gone');
  assert.equal(await p.seen(code), null, 'and a pairing past its five minutes is forgotten');
});

test('a signature is taken once, for the words it was made for, and the phone that asked is told the once', async () => {
  const p = createPairings({ store: createMemoryStore(), clock }), { code } = await p.pair(K);
  const { words } = await p.words(code, ME, HERE);
  const checked = [];
  const chain = { verify: async (address, said, signature) => { checked.push([address, said, signature]); return signature === '0xgood'; }, holds: async (address) => (address === ME ? [1386, 7, 7] : []) };
  assert.deepEqual(await p.waiting(code, K), { waiting: true });
  assert.deepEqual(await p.signed(code, '0xbad', chain), { no: 'signature' });
  assert.deepEqual(await p.waiting(code, K), { waiting: true }, 'a wrong one can be tried again while it\'s live');
  assert.deepEqual(await p.signed(code, '0xgood', chain), { done: true, keyHash: K, address: ME, ids: [7, 1386] });
  assert.deepEqual(checked.at(-1), [ME, words, '0xgood']);
  assert.deepEqual(await p.waiting(code, 'b'.repeat(64)), { no: 'gone' }, 'nobody but the phone that asked is told');
  assert.deepEqual(await p.waiting(code, K), { done: true });
  assert.deepEqual(await p.signed(code, '0xgood', chain), { no: 'gone' }, 'and it\'s never taken twice');
  assert.equal((await p.waiting(code, K)).no, 'gone', 'or told twice');
});

test('a signature with no words asked for, or past the five minutes, isn\'t taken', async () => {
  const chain = { verify: async () => true, holds: async () => [1] };
  const p = createPairings({ store: createMemoryStore(), clock }), a = await p.pair(K), b = await p.pair('b'.repeat(64));
  assert.deepEqual(await p.signed(a.code, '0xgood', chain), { no: 'words' });
  await p.words(b.code, ME, HERE); later(PAIR_FOR + 1);
  assert.deepEqual(await p.signed(b.code, '0xgood', chain), { no: 'gone' });
});

test('if the chain can\'t be read, the pairing stays open to try again, and nothing\'s taken as held', async () => {
  const p = createPairings({ store: createMemoryStore(), clock }), { code } = await p.pair(K);
  await p.words(code, ME, HERE);
  const down = { verify: async () => true, holds: async () => { throw new Error('no answer'); } };
  assert.deepEqual(await p.signed(code, '0xgood', down), { no: 'chain' });
  assert.deepEqual(await p.waiting(code, K), { waiting: true });
});

// ---------------- what's kept of a wallet that's been checked: by whose phone it is, and never told to anyone else
test('a wallet that holds one is wearing it straight away, and one that holds several hasn\'t chosen yet', async () => {
  const b = createBindings({ store: createMemoryStore(), clock });
  await b.bind(K, ME, [7]);
  assert.deepEqual(await b.of(K), { address: ME, ids: [7], chosen: 7, checked: at });
  await b.bind(K, ME, [7, 12]);
  assert.equal((await b.of(K)).chosen, 7, 'one they were wearing that they still hold stays on');
  await b.bind('b'.repeat(64), ME, [7, 12]);
  assert.equal((await b.of('b'.repeat(64))).chosen, null);
  await b.bind(K, ME, []);
  assert.equal(await b.of(K), null, 'and a wallet with none isn\'t kept at all');
});

test('each rektguy is known to phones only by a handle, the same for everyone, which says nothing of which one it is', async () => {
  const store = createMemoryStore(), b = createBindings({ store, clock });
  await b.bind(K, ME, [7, 12]);
  const h7 = await b.handle(7), h12 = await b.handle(12);
  assert.match(h7, /^[\w-]{16,}$/);
  assert.notEqual(h7, h12);
  assert.equal(await b.handle(7), h7);
  assert.notEqual(await createBindings({ store: createMemoryStore(), clock }).handle(7), h7, 'made at random, not from the number');
  assert.equal(await b.idOf(h7), 7);
  assert.equal(await b.idOf('nobody'), null);
  assert.equal(await createBindings({ store, clock }).handle(7), h7, 'and kept, so it\'s the same after a restart');
});

test('they choose only from what their wallet holds, or none, for a look of the town\'s, and what they\'re wearing is told by its handle', async () => {
  const b = createBindings({ store: createMemoryStore(), clock });
  await b.bind(K, ME, [7, 12]);
  const other = await createBindings({ store: createMemoryStore(), clock }).handle(99);
  assert.equal(await b.wearing(K), null);
  assert.equal(await b.choose(K, await b.handle(12)), true);
  assert.deepEqual(await b.wearing(K), { id: 12, handle: await b.handle(12) });
  assert.equal(await b.choose(K, other), false);
  assert.equal(await b.choose('c'.repeat(64), await b.handle(12)), false, 'nor for a phone with no wallet');
  assert.equal(await b.choose(K, null), true);
  assert.equal(await b.wearing(K), null);
});

test('a wallet that\'s forgotten is forgotten, and so is one whose phone the town\'s let go of', async () => {
  const store = createMemoryStore(), b = createBindings({ store, clock });
  await b.bind(K, ME, [7]); await b.bind('b'.repeat(64), ME, [7]);
  await b.forget([K]);
  assert.equal(await b.of(K), null);
  assert.ok(await b.of('b'.repeat(64)));
});

test('rektguy 1386 is the owner\'s, the hero', () => assert.equal(HERO_TOKEN, 1386));

// ---------------- the whole trip, as the phone and the wallet's page ask for it
const someone = () => privateKeyToAccount(generatePrivateKey());
const PHONE = 'a-phone-of-their-own-1234', PHONE_HASH = createHash('sha256').update(PHONE).digest('hex');
const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4);
function trip({ owners = {}, ipfs = {} } = {}) {
  const s = chainStandIn({ owners, ipfs, base: 'ipfs://QmMeta/' });
  const chain = createChain({ rpc: ['http://chain.stand-in/'], gateway: 'http://chain.stand-in/ipfs/', fetch: s.fetch });
  const store = createMemoryStore(), routes = createWalletRoutes({ store, chain, pages: [HERE], clock });
  const answers = [];
  const ask = async (path, body, { origin = HERE, method = body === undefined ? 'GET' : 'POST' } = {}) => {
    const sent = body === undefined || method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const r = await routes(new Request(`http://town.example${path}`, { method, headers: { 'Content-Type': 'text/plain', ...(origin && { Origin: origin }) }, body: sent }));
    if (!r) return null;
    const text = (r.headers.get('content-type') ?? '').startsWith('application/json') ? await r.clone().text() : '';
    answers.push({ path, text });
    return { status: r.status, headers: r.headers, json: text ? JSON.parse(text) : null, bytes: new Uint8Array(await r.arrayBuffer()) };
  };
  return { s, store, routes, ask, answers };
}
async function signIn(t, wallet) {
  const { json: paired } = await t.ask('/wallet/pair', { key: PHONE });
  assert.deepEqual((await t.ask('/wallet/seen', { code: paired.code })).json, { letters: paired.letters, until: paired.until });
  const { json: { words } } = await t.ask('/wallet/words', { code: paired.code, address: wallet.address });
  assert.deepEqual((await t.ask('/wallet/waiting', { code: paired.code, key: PHONE })).json, { waiting: true });
  assert.deepEqual((await t.ask('/wallet/signed', { code: paired.code, signature: await wallet.signMessage({ message: words }) })).json, { done: true });
  return (await t.ask('/wallet/waiting', { code: paired.code, key: PHONE })).json;
}

test('the whole trip: the phone pairs, the wallet\'s page signs, and the phone\'s told what it can wear, by handles alone', async () => {
  const me = someone(), t = trip({ owners: { 7: me.address, 1386: me.address, 3: someone().address } });
  const told = await signIn(t, me);
  assert.equal(told.done, true);
  assert.equal(told.rekt.length, 2);
  for (const h of told.rekt) assert.match(h, /^[\w-]{16,64}$/);
  assert.equal(told.wearing, null, 'with two, they\'ve not chosen yet');
  // and each one's number, for the button when its picture can't be had, which is theirs to know and nobody else's
  assert.deepEqual(told.rekt.map((h) => told.numbers[h]), [7, 1386]);
  assert.deepEqual(Object.keys(told.numbers).sort(), [...told.rekt].sort());
  assert.deepEqual((await t.ask('/wallet/mine', { key: PHONE })).json, { rekt: told.rekt, wearing: null, numbers: told.numbers });
  assert.deepEqual((await t.ask('/wallet/mine', { key: 'another-phone-entirely' })).json, { rekt: [], wearing: null, numbers: {} });
  // the phone's never told the wallet's address, whatever it asked, and only the wallet's own page has it in the words it signs
  const phone = t.answers.filter((a) => a.path !== '/wallet/words');
  assert.equal(phone.length, t.answers.length - 1);
  for (const a of phone) assert.equal(a.text.toLowerCase().includes(me.address.toLowerCase().slice(2)), false, a.text);
});

test('one rektguy is worn straight away, and they can change what they wear to another of theirs or a look of the town\'s', async () => {
  const me = someone(), t = trip({ owners: { 7: me.address } });
  const told = await signIn(t, me);
  assert.deepEqual(told, { done: true, rekt: told.rekt, wearing: told.rekt[0], numbers: { [told.rekt[0]]: 7 } });
  assert.deepEqual((await t.ask('/wallet/wear', { key: PHONE, rekt: null })).json, { wearing: null });
  assert.deepEqual((await t.ask('/wallet/wear', { key: PHONE, rekt: told.rekt[0] })).json, { wearing: told.rekt[0] });
  assert.deepEqual((await t.ask('/wallet/wear', { key: PHONE, rekt: 'not-one-of-theirs-at-all' })).json, { no: 'rekt' });
  assert.deepEqual((await t.ask('/wallet/wear', { key: 'another-phone-entirely', rekt: told.rekt[0] })).json, { no: 'rekt' });
  assert.deepEqual(await createBindings({ store: t.store, clock }).wearing(PHONE_HASH), { id: 7, handle: told.rekt[0] });
});

test('a wallet with none, a wallet that never signs and one that\'s forgotten all leave the phone with nothing to wear and nothing said', async () => {
  const none = trip(), told = await signIn(none, someone());
  assert.deepEqual(told, { done: true, rekt: [], wearing: null, numbers: {} });
  const t = trip(), { json: { code } } = await t.ask('/wallet/pair', { key: PHONE });
  later(PAIR_FOR + 1);
  assert.deepEqual((await t.ask('/wallet/waiting', { code, key: PHONE })).json, { no: 'gone' });
  const me = someone(), f = trip({ owners: { 7: me.address } });
  await signIn(f, me);
  assert.deepEqual((await f.ask('/wallet/forget', { key: PHONE })).json, { forgotten: true });
  assert.deepEqual((await f.ask('/wallet/mine', { key: PHONE })).json, { rekt: [], wearing: null, numbers: {} });
});

test('only the game\'s own pages are answered, with nothing kept along the way, and what isn\'t what\'s asked for is turned away before the chain\'s asked', async () => {
  const t = trip(), away = await t.ask('/wallet/pair', { key: PHONE }, { origin: 'https://elsewhere.example' });
  assert.equal(away.status, 403);
  const ok = await t.ask('/wallet/pair', { key: PHONE });
  assert.equal(ok.headers.get('access-control-allow-origin'), HERE);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.equal((await t.ask('/wallet/pair', { key: 'too short' })).status, 400);
  assert.equal((await t.ask('/wallet/pair', 'not words at all')).status, 400);
  assert.equal((await t.ask('/wallet/pair', { key: PHONE }, { method: 'GET' })).status, 405);
  const { json: { code } } = ok;
  await t.ask('/wallet/words', { code, address: someone().address });
  for (const signature of ['0xnot-hex', `0x${'ab'.repeat(8192)}`, 42]) assert.equal((await t.ask('/wallet/signed', { code, signature })).status, 400);
  assert.equal(t.s.asked.length, 0, 'and the chain was never asked');
  assert.equal(await t.routes(new Request('http://town.example/town')), null, 'and anything else isn\'t the wallet\'s');
});

test('a rektguy\'s picture is had by its handle, the same for everyone and kept a day, and only as a picture', async () => {
  const me = someone(), t = trip({ owners: { 7: me.address }, ipfs: { 'QmMeta/7': JSON.stringify({ image: 'ipfs://QmArt/7.png' }), 'QmArt/7.png': PNG } });
  const [handle] = (await signIn(t, me)).rekt;
  const r = await t.ask(`/rektguy/${handle}`, undefined, { origin: null });
  assert.equal(r.status, 200);
  assert.deepEqual([...r.bytes], [...PNG]);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal(r.headers.get('cache-control'), 'public, max-age=86400');
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await t.ask('/rektguy/nobody-at-all-like-this', undefined, { origin: null })).status, 404);
});

test('a picture that can\'t be had is nothing, which any page may read without an error, kept nowhere so it\'s asked for again', async () => {
  const me = someone(), t = trip({ owners: { 77: me.address } });
  const [handle] = (await signIn(t, me)).rekt;
  const r = await t.ask(`/rektguy/${handle}`, undefined, { origin: null });
  assert.equal(r.status, 204);
  assert.equal(r.bytes.length, 0);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  t.s.asked.length = 0;
  assert.equal((await t.ask(`/rektguy/${handle}`, undefined, { origin: null })).status, 204);
  assert.ok(t.s.asked.includes('tokenURI'), 'and the chain is asked again the next time');
});

test('what a wallet holds is read again once it\'s been an hour, so a rektguy that\'s been sold comes off', async () => {
  const me = someone(), t = trip({ owners: { 7: me.address } });
  await signIn(t, me);
  later(RECHECK + 1);
  t.s.owners[7] = someone().address;
  assert.equal((await t.ask('/wallet/mine', { key: PHONE })).json.rekt.length, 1, 'what was known is said straight away');
  await t.routes.settled();
  assert.deepEqual((await t.ask('/wallet/mine', { key: PHONE })).json, { rekt: [], wearing: null, numbers: {} });
});
