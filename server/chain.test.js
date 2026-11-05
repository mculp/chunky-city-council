import test from 'node:test';
import assert from 'node:assert/strict';
import { hashMessage } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createChain } from './chain.js';
import { chainStandIn } from '../tools/chain-stand-in.mjs';

// a wallet made up for the test, with a key nobody else has and nothing on any chain
const someone = () => privateKeyToAccount(generatePrivateKey());
const WORDS = 'online.chunky.ms wants you to sign in with your Ethereum account:\n0x1111111111111111111111111111111111111111\n\nWear your rektguy in Chunky.';
const on = (standIn, o = {}) => createChain({ rpc: ['http://chain.stand-in/'], gateway: 'http://chain.stand-in/ipfs/', fetch: standIn.fetch, ...o });
const asked = (s, name) => s.asked.filter((n) => n === name).length;

// ---------------- whose signature it is (CHUNKY-170)
test('an ordinary wallet\'s signature is checked here, without asking the chain', async () => {
  const me = someone(), signature = await me.signMessage({ message: WORDS });
  const nowhere = createChain({ rpc: ['http://chain.stand-in/'], fetch: async () => { throw new Error('the chain was asked'); } });
  assert.equal(await nowhere.verify(me.address, WORDS, signature), true);
  // someone else's, or one made for other words, is asked of the chain, which says it isn't theirs
  const s = chainStandIn(), c = on(s);
  assert.equal(await c.verify(someone().address, WORDS, signature), false);
  assert.equal(await c.verify(me.address, `${WORDS} And more.`, signature), false);
});

test('a smart wallet\'s signature is the chain\'s to say, by EIP-1271 or EIP-6492', async () => {
  const SMART = '0x5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a', GOOD = `0x${'ab'.repeat(65)}`;
  const s = chainStandIn({ smart: { [SMART]: (hash, sig) => hash === hashMessage(WORDS) && sig === GOOD } }), c = on(s);
  assert.equal(await c.verify(SMART, WORDS, GOOD), true);
  assert.equal(await c.verify(SMART, WORDS, `0x${'cd'.repeat(65)}`), false);
  assert.equal(await c.verify(SMART, 'Other words.', GOOD), false);
  assert.ok(asked(s, 'isValidSig') >= 3);
});

// ---------------- what a wallet holds, which rektguy's contract can't list
test('what a wallet holds is found by looking through every rektguy, a thousand to an ask', async () => {
  const me = someone().address, other = someone().address;
  const s = chainStandIn({ owners: { 0: other, 7: me, 1386: me, 2400: me, 2401: other }, counter: 2402 });
  let asks = 0;
  const c = on(s, { fetch: (...a) => { asks++; return s.fetch(...a); } });
  assert.deepEqual(await c.holds(me), [7, 1386, 2400]);
  assert.ok(asked(s, 'ownerOf') >= 2401, `${asked(s, 'ownerOf')} looked at`);
  // who's delegated to it and how many there are, and three thousands
  assert.equal(asks, 4);
});

test('rektguy\'s balanceOf is what an address minted and not what it holds, so it\'s never gone by', async () => {
  // as on the chain, where it's none for most who hold one, and still counts what's been sold for whoever minted it
  const me = someone().address, minter = someone().address;
  const s = chainStandIn({ owners: { 3: me, 4: someone().address, 8000: me }, minted: { [minter]: 2 }, counter: 8814 }), c = on(s);
  assert.deepEqual(await c.holds(me), [3, 8000]);
  assert.deepEqual(await c.holds(minter), []);
  assert.equal(asked(s, 'balanceOf'), 0);
});

test('a thousand asked with none answered is the chain not answering, and it says so rather than say there\'s nothing', async () => {
  const me = someone().address, s = chainStandIn({ owners: { 5: me, 1500: me }, counter: 2000 });
  // the node answers who's delegated to it and how many there are, and then turns down every ask after, as public ones do when they're busy
  let calls = 0;
  const busy = async (input, init) => (++calls > 1 ? Response.json({ jsonrpc: '2.0', id: JSON.parse(init.body).id, error: { code: -32005, message: 'rate limited' } }) : s.fetch(input, init));
  await assert.rejects(on(s, { fetch: busy }).holds(me));
  // and the last ask, which is only the counter's own number in case it's the last, can come back with nothing in it
  const t = chainStandIn({ owners: { 5: me }, counter: 1000 });
  assert.deepEqual(await on(t).holds(me), [5]);
});

// ---------------- with the owner's Alchemy key, its index says what a wallet holds and the chain says whether it still does
const KEY = 'a-key-for-the-stand-in';
test('with an Alchemy key, what a wallet holds is found by its index, a hundred to a page, without looking through them all', async () => {
  const me = someone().address, other = someone().address, owners = { 0: other, 8813: other };
  for (let i = 1; i <= 250; i++) owners[i * 30] = me;
  const s = chainStandIn({ owners, counter: 8814 }), c = on(s, { alchemy: KEY });
  const ids = await c.holds(me);
  assert.equal(ids.length, 250);
  assert.deepEqual(ids.slice(0, 3), [30, 60, 90]);
  assert.equal(asked(s, 'getNFTsForOwner'), 3);
  assert.ok(asked(s, 'ownerOf') <= 250, `${asked(s, 'ownerOf')} looked at`);
});

test('and one the index has that the chain says has gone to someone else isn\'t theirs, nor one the chain has that the index hasn\'t caught up with', async () => {
  const me = someone().address, buyer = someone().address;
  const s = chainStandIn({ owners: { 4: me, 9: buyer, 12: me }, index: { 4: me, 9: me }, counter: 20 }), c = on(s, { alchemy: KEY });
  assert.deepEqual(await c.holds(me), [4]);
});

test('and a vault delegated to them is asked of the index too', async () => {
  const me = someone().address, vault = someone().address;
  const s = chainStandIn({ owners: { 2: vault, 5: me }, delegations: [{ registry: 2, type: 'all', from: vault, to: me }], counter: 10 }), c = on(s, { alchemy: KEY });
  assert.deepEqual(await c.holds(me), [2, 5]);
  assert.equal(asked(s, 'getNFTsForOwner'), 2);
});

test('an index that doesn\'t answer is passed over for looking through them all', async () => {
  const me = someone().address, s = chainStandIn({ owners: { 7: me, 1500: me }, counter: 2000, alchemyDown: true }), c = on(s, { alchemy: KEY });
  assert.deepEqual(await c.holds(me), [7, 1500]);
  assert.ok(asked(s, 'ownerOf') >= 2000);
});

test('a rektguy kept in another wallet counts for the one it\'s delegated to, by either of delegate.xyz\'s registries', async () => {
  const me = someone().address, [vault, vault2, vault3, vault4, vault5, vault6, stranger] = Array.from({ length: 7 }, () => someone().address);
  const s = chainStandIn({
    owners: { 1: vault, 2: vault2, 3: vault3, 4: vault3, 5: vault4, 6: vault5, 8: stranger, 9: me },
    delegations: [
      { registry: 2, type: 'all', from: vault, to: me },
      { registry: 1, type: 'contract', from: vault2, to: me },
      // the one, and not the other the vault has
      { registry: 2, type: 'token', from: vault3, to: me, tokenId: 3 },
      // only for something in particular, which isn't wearing it
      { registry: 2, type: 'contract', from: vault4, to: me, rights: `0x${'11'.repeat(32)}` },
      // for another contract
      { registry: 1, type: 'contract', from: vault5, to: me, contract: `0x${'22'.repeat(20)}` },
      // for one the vault's since sold
      { registry: 1, type: 'token', from: vault6, to: me, tokenId: 8 },
    ],
  }), c = on(s);
  assert.deepEqual(await c.holds(me), [1, 2, 3, 9]);
});

test('if the chain can\'t be read, it says so rather than say there\'s nothing', async () => {
  const me = someone().address;
  assert.deepEqual(await on(chainStandIn()).holds(me), []);
  const c = createChain({ rpc: ['http://chain.stand-in/'], fetch: async () => new Response('', { status: 503 }) });
  await assert.rejects(c.holds(me));
});

// ---------------- what each one looks like
const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4);
test('a rektguy\'s picture is what its tokenURI says, through the gateway, whichever gateway the address named', async () => {
  const s = chainStandIn({
    base: 'https://rektguy.mypinata.cloud/ipfs/QmMeta/',
    ipfs: { 'QmMeta/1386': JSON.stringify({ name: 'rektguy #1386', image: 'ipfs://QmArt/1386.png' }), 'QmArt/1386.png': PNG },
  }), c = on(s);
  const p = await c.picture(1386);
  assert.equal(p.type, 'image/png');
  assert.deepEqual([...p.bytes], [...PNG]);
});

test('a gateway that turns it down is passed over for the next, and none answering is said', async () => {
  // as ipfs.io does now, which puts anyone who isn't a person in a browser through a challenge a server can't pass
  const s = chainStandIn({ base: 'ipfs://QmMeta/', ipfs: { 'QmMeta/1386': JSON.stringify({ image: 'ipfs://QmArt/1386.png' }), 'QmArt/1386.png': PNG } });
  const asked = [], fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/ipfs/')) asked.push(new URL(url).host);
    return url.startsWith('http://busy.stand-in/') ? new Response('Too Many Requests', { status: 429 }) : url.startsWith('http://gone.stand-in/') ? Promise.reject(new TypeError('fetch failed')) : s.fetch(input, init);
  };
  const c = on(s, { gateway: ['http://busy.stand-in/ipfs/', 'http://gone.stand-in/ipfs/', 'http://chain.stand-in/ipfs/'], fetch });
  assert.deepEqual([...(await c.picture(1386)).bytes], [...PNG]);
  assert.deepEqual(asked, ['busy.stand-in', 'gone.stand-in', 'chain.stand-in', 'busy.stand-in', 'gone.stand-in', 'chain.stand-in']);
  await assert.rejects(on(s, { gateway: ['http://busy.stand-in/ipfs/', 'http://gone.stand-in/ipfs/'], fetch }).picture(1386));
});

test('with an Alchemy key, a picture is Alchemy\'s own copy, and the gateways if it hasn\'t one', async () => {
  const s = chainStandIn({ base: 'ipfs://QmMeta/', ipfs: { 'QmMeta/2': JSON.stringify({ image: 'ipfs://QmArt/2.png' }), 'QmArt/2.png': PNG }, cached: { 1386: PNG } });
  // none of the gateways answers, as from Cloudflare
  const fetch = (input, init) => (String(input instanceof Request ? input.url : input).includes('/ipfs/') ? new Response('Too Many Requests', { status: 429 }) : s.fetch(input, init));
  const c = on(s, { alchemy: KEY, fetch });
  assert.deepEqual([...(await c.picture(1386)).bytes], [...PNG]);
  assert.equal(asked(s, 'tokenURI'), 0);
  await assert.rejects(c.picture(2));
  assert.deepEqual([...(await on(s, { alchemy: KEY }).picture(2)).bytes], [...PNG]);
});

test('a picture written into the address itself is read from there', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
  const meta = { image: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` };
  const s = chainStandIn({ base: `data:application/json;base64,${Buffer.from(JSON.stringify(meta)).toString('base64')}#` }), c = on(s);
  const p = await c.picture(12);
  assert.equal(p.type, 'image/svg+xml');
  assert.equal(new TextDecoder().decode(p.bytes), svg);
});

test('only a picture is taken, only so big, and only through the gateway or from a site\'s own https', async () => {
  const meta = (image) => JSON.stringify({ image });
  const s = chainStandIn({
    base: 'ipfs://QmMeta/',
    ipfs: {
      'QmMeta/1': meta('http://169.254.169.254/latest/meta-data'), 'QmMeta/2': meta('file:///etc/passwd'),
      'QmMeta/3': meta('ipfs://QmArt/page.html'), 'QmArt/page.html': '<html><script>alert(1)</script></html>',
      'QmMeta/4': meta('ipfs://QmArt/big.png'), 'QmArt/big.png': new Uint8Array([...PNG, ...new Uint8Array(64)]),
      'QmMeta/5': meta('ipfs://QmArt/small.png'), 'QmArt/small.png': PNG,
    },
  }), c = on(s, { most: 32 });
  for (const id of [1, 2, 3, 4]) await assert.rejects(c.picture(id), undefined, `rektguy ${id}`);
  assert.equal((await c.picture(5)).type, 'image/png');
});
