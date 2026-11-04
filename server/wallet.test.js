import test from 'node:test';
import assert from 'node:assert/strict';
import { createPairings, createBindings, LETTERS, PAIR_FOR, HERO_TOKEN } from './wallet.js';

const HERE = 'https://online.chunky.ms', ME = '0x1111111111111111111111111111111111111111';
let at = Date.UTC(2026, 10, 4, 18, 20);
const clock = () => at;
const later = (ms) => { at += ms; };

// ---------------- pairing the game with the wallet's own page (CHUNKY-170)
test('a phone asking to pair gets a code for the wallet\'s page and four letters to see on both screens, for five minutes', () => {
  const p = createPairings({ clock }), a = p.pair('k'.repeat(64)), b = p.pair('k'.repeat(64));
  assert.match(a.code, /^[\w-]{22,}$/);
  assert.notEqual(a.code, b.code);
  assert.match(a.letters, new RegExp(`^[${LETTERS}]{4}$`));
  assert.equal(a.until, at + PAIR_FOR);
  assert.equal(PAIR_FOR, 5 * 60 * 1000);
  assert.deepEqual(p.seen(a.code), { letters: a.letters, until: a.until });
  assert.equal(LETTERS.match(/[AEIOUL]/), null, 'no vowels, so four of them never spell anything, and no L to mistake for an I');
});

test('the words to sign are plain, for that pairing and that wallet, with the four letters and the date, and say it costs nothing', () => {
  const p = createPairings({ clock }), { code, letters } = p.pair('k'.repeat(64));
  const { words } = p.words(code, ME, HERE);
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

test('words are only for a pairing that\'s live, an address that\'s one, and the game\'s own pages', () => {
  const p = createPairings({ clock }), { code } = p.pair('k'.repeat(64));
  assert.equal(p.words('nope', ME, HERE).no, 'gone');
  assert.equal(p.words(code, '0x123', HERE).no, 'address');
  assert.equal(p.words(code, ME, 'https://elsewhere.example').no, 'page');
  const local = createPairings({ clock, pages: ['http://localhost:8000'] }), l = local.pair('k'.repeat(64)).code;
  assert.deepEqual(local.words(l, ME, 'http://localhost:8000').words.split('\n').filter((s) => /^(localhost|URI)/.test(s)), ['localhost:8000 wants you to sign in with your Ethereum account:', 'URI: http://localhost:8000']);
  later(PAIR_FOR + 1);
  assert.equal(p.words(code, ME, HERE).no, 'gone');
  assert.equal(p.seen(code), null, 'and a pairing past its five minutes is forgotten');
});

test('a signature is taken once, for the words it was made for, and the phone that\'s waiting is told what the wallet holds', async () => {
  const p = createPairings({ clock }), key = 'k'.repeat(64), { code } = p.pair(key);
  const { words } = p.words(code, ME, HERE);
  const checked = [];
  const chain = { verify: async (address, said, signature) => { checked.push([address, said, signature]); return signature === '0xgood'; }, holds: async (address) => (address === ME ? [1386, 7] : []) };
  assert.deepEqual(p.waiting(code), { waiting: true });
  assert.deepEqual(await p.signed(code, '0xbad', chain), { no: 'signature' });
  assert.deepEqual(p.waiting(code), { waiting: true }, 'a wrong one can be tried again while it\'s live');
  assert.deepEqual(await p.signed(code, '0xgood', chain), { done: true, count: 2 });
  assert.deepEqual(checked.at(-1), [ME, words, '0xgood']);
  assert.deepEqual(p.waiting(code), { done: true, keyHash: key, address: ME, ids: [7, 1386] });
  assert.deepEqual(await p.signed(code, '0xgood', chain), { no: 'gone' }, 'and never twice');
  assert.equal(p.waiting(code).no, 'gone', 'and it\'s told the once');
});

test('a signature with no words asked for, or past the five minutes, isn\'t taken', async () => {
  const chain = { verify: async () => true, holds: async () => [1] };
  const p = createPairings({ clock }), a = p.pair('k'.repeat(64)), b = p.pair('k'.repeat(64));
  assert.deepEqual(await p.signed(a.code, '0xgood', chain), { no: 'words' });
  p.words(b.code, ME, HERE); later(PAIR_FOR + 1);
  assert.deepEqual(await p.signed(b.code, '0xgood', chain), { no: 'gone' });
});

test('if the chain can\'t be read, the pairing stays open to try again, and nothing\'s taken as held', async () => {
  const p = createPairings({ clock }), { code } = p.pair('k'.repeat(64));
  p.words(code, ME, HERE);
  const down = { verify: async () => true, holds: async () => { throw new Error('no answer'); } };
  assert.deepEqual(await p.signed(code, '0xgood', down), { no: 'chain' });
  assert.deepEqual(p.waiting(code), { waiting: true });
});

// ---------------- what's kept of a wallet that's been checked: by whose phone it is, and never told to anyone else
const memory = () => { const m = new Map(); return { m, get: async (k) => m.get(k), put: async (k, v) => { m.set(k, structuredClone(v)); }, delete: async (k) => m.delete(k) }; };
const K = 'a'.repeat(64);

test('a wallet that holds one is wearing it straight away, and one that holds several hasn\'t chosen yet', async () => {
  const store = memory(), b = createBindings({ store, clock });
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
  const store = memory(), b = createBindings({ store, clock });
  await b.bind(K, ME, [7, 12]);
  const h7 = await b.handle(7), h12 = await b.handle(12);
  assert.match(h7, /^[\w-]{16,}$/);
  assert.notEqual(h7, h12);
  assert.equal(await b.handle(7), h7);
  assert.notEqual(await createBindings({ store: memory(), clock }).handle(7), h7, 'made at random, not from the number');
  assert.equal(await b.idOf(h7), 7);
  assert.equal(await b.idOf('nobody'), null);
  assert.equal(await createBindings({ store, clock }).handle(7), h7, 'and kept, so it\'s the same after a restart');
});

test('they choose only from what their wallet holds, or none, for a look of the town\'s', async () => {
  const store = memory(), b = createBindings({ store, clock });
  await b.bind(K, ME, [7, 12]);
  const other = await createBindings({ store: memory(), clock }).handle(99);
  assert.equal(await b.choose(K, await b.handle(12)), true);
  assert.equal((await b.of(K)).chosen, 12);
  assert.equal(await b.choose(K, other), false);
  assert.equal(await b.choose('c'.repeat(64), await b.handle(12)), false, 'nor for a phone with no wallet');
  assert.equal(await b.choose(K, null), true);
  assert.equal((await b.of(K)).chosen, null);
});

test('rektguy 1386 is the owner\'s, the hero', () => assert.equal(HERO_TOKEN, 1386));
