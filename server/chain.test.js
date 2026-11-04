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
  // who's delegated to it and how many there are, how many it holds, and three thousands
  assert.equal(asks, 5);
});

test('a wallet that holds none is told so straight away, without looking through them', async () => {
  const s = chainStandIn({ owners: { 1: someone().address }, counter: 9000 }), c = on(s);
  assert.deepEqual(await c.holds(someone().address), []);
  assert.equal(asked(s, 'ownerOf'), 0);
});

test('and the looking stops once it\'s found as many as the wallet holds', async () => {
  const me = someone().address, s = chainStandIn({ owners: { 3: me, 4: someone().address }, counter: 8814 }), c = on(s);
  assert.deepEqual(await c.holds(me), [3]);
  assert.ok(asked(s, 'ownerOf') <= 1000, `${asked(s, 'ownerOf')} asked`);
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
