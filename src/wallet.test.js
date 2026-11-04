import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { walletUrl, walletOf, pageFor, openIn, seenOf, signIn, WAIT_EVERY, PAIR_FOR } from './wallet.js';
import { TOWN_URL } from './net.js';
import { createWalletRoutes, createMemoryStore, PAIR_FOR as KEPT_FOR } from '../server/wallet.js';
import { createChain } from '../server/chain.js';
import { chainStandIn } from '../tools/chain-stand-in.mjs';

const HERE = 'https://online.chunky.ms', BASE = 'https://chunky.chunkymetro.workers.dev';
const someone = () => privateKeyToAccount(generatePrivateKey());
// a wallet as a page has one, an EIP-1193 provider, which says what it's asked and to sign
function walletApp(account, asked = []) {
  return { request: async ({ method, params }) => {
    asked.push(method);
    if (method === 'eth_requestAccounts') return [account.address];
    if (method === 'personal_sign') return account.signMessage({ message: { raw: params[0] } });
    throw Object.assign(new Error(`${method} isn't asked of a wallet here`), { code: 4200 });
  } };
}
// the town's own routes, as a browser on a page at online.chunky.ms asks them
function town(owners) {
  const s = chainStandIn({ owners });
  const routes = createWalletRoutes({ store: createMemoryStore(), chain: createChain({ rpc: ['http://chain.stand-in/'], fetch: s.fetch }), pages: [HERE] });
  return (url, init) => routes(new Request(url, { ...init, headers: { ...init?.headers, Origin: HERE } }));
}

test('the wallet\'s side of a town is beside it', () => {
  assert.equal(walletUrl(TOWN_URL), BASE);
  assert.equal(walletUrl('ws://localhost:8787'), 'http://localhost:8787');
  assert.equal(walletUrl('ws://localhost:8788/town'), 'http://localhost:8788');
  assert.equal(walletUrl('not an address'), null);
});

test('the phone waits for the wallet as long as the town keeps a pairing, by its own clock, which needn\'t be the town\'s', () => {
  assert.equal(PAIR_FOR, KEPT_FOR);
});

test('the wallet\'s page is on the game\'s own site, with the pairing, and on this machine it says which town', () => {
  assert.equal(pageFor('the-code-0123456789ab', { origin: HERE, town: TOWN_URL }), `${HERE}/wallet.html?pair=the-code-0123456789ab`);
  assert.equal(pageFor('the-code-0123456789ab', { origin: 'http://localhost:8000', town: 'ws://localhost:8787' }), 'http://localhost:8000/wallet.html?pair=the-code-0123456789ab&net=ws%3A%2F%2Flocalhost%3A8787');
});

test('each wallet app opens the page in its own browser, by the link it says to use', () => {
  const page = `${HERE}/wallet.html?pair=the-code-0123456789ab`, q = encodeURIComponent(page);
  assert.deepEqual(openIn(page), [
    { name: 'MetaMask', href: 'https://link.metamask.io/dapp/online.chunky.ms/wallet.html?pair=the-code-0123456789ab' },
    { name: 'Coinbase Wallet', href: `https://go.cb-w.com/dapp?cb_url=${q}` },
    { name: 'Trust Wallet', href: `https://link.trustwallet.com/open_url?coin_id=60&url=${q}` },
    { name: 'Phantom', href: `https://phantom.app/ul/browse/${q}?ref=${encodeURIComponent(HERE)}` },
  ]);
});

test('the whole trip: the phone pairs, the wallet\'s page signs what it\'s given, and the phone\'s told what it can wear', async () => {
  const me = someone(), fetch = town({ 7: me.address }), phone = walletOf({ base: BASE, key: 'a-phone-of-their-own-1234', fetch });
  const { code, letters, until } = await phone.pair();
  assert.deepEqual(await seenOf({ base: BASE, code, fetch }), { letters, until }, 'the wallet\'s page has the four letters to show');
  assert.deepEqual(await seenOf({ base: BASE, code: 'not-a-pairing-there-at-all', fetch }), { no: 'gone' });
  assert.deepEqual(await phone.waiting(code), { waiting: true });
  const asked = [];
  assert.deepEqual(await signIn({ base: BASE, code, letters, origin: HERE, ethereum: walletApp(me, asked), fetch }), { done: true });
  assert.deepEqual(asked, ['eth_requestAccounts', 'personal_sign'], 'and nothing but its address and a signature is asked of the wallet');
  const told = await phone.waiting(code);
  assert.deepEqual(told, { done: true, rekt: told.rekt, wearing: told.rekt[0] });
  assert.equal(phone.picture(told.rekt[0]), `${BASE}/rektguy/${told.rekt[0]}`);
  assert.deepEqual(await phone.wear(null), { wearing: null });
  assert.deepEqual(await phone.mine(), { rekt: told.rekt, wearing: null });
  assert.deepEqual(await phone.forget(), { forgotten: true });
  assert.ok(WAIT_EVERY >= 1000 && WAIT_EVERY <= 3000);
});

test('the wallet\'s page signs nothing but the words it should, whoever sent them', async () => {
  const me = someone();
  for (const words of [
    'Sign this to give away everything.',
    `online.chunky.ms wants you to sign in with your Ethereum account:\n${someone().address}\n\nWear your rektguy in Chunky, on the screen showing BCDF, on 4 November 2026. It's only a signature: it costs nothing and moves nothing.`,
    `elsewhere.example wants you to sign in with your Ethereum account:\n${me.address}\n\nWear your rektguy in Chunky, on the screen showing BCDF, on 4 November 2026. It's only a signature: it costs nothing and moves nothing.`,
    `online.chunky.ms wants you to sign in with your Ethereum account:\n${me.address}\n\nWear your rektguy in Chunky, on the screen showing ZZZZ, on 4 November 2026. It's only a signature: it costs nothing and moves nothing.`,
  ]) {
    const asked = [], fetch = async () => Response.json({ words });
    assert.deepEqual(await signIn({ base: BASE, code: 'the-code-0123456789ab', letters: 'BCDF', origin: HERE, ethereum: walletApp(me, asked), fetch }), { no: 'words' });
    assert.deepEqual(asked, ['eth_requestAccounts'], words);
  }
});

test('a wallet that won\'t, or a town that says no, is said as it is, with nothing signed', async () => {
  const me = someone(), app = { request: async () => { throw Object.assign(new Error('User rejected the request.'), { code: 4001 }); } };
  assert.deepEqual(await signIn({ base: BASE, code: 'x'.repeat(22), letters: 'BCDF', origin: HERE, ethereum: app, fetch: town({}) }), { no: 'declined' });
  const asked = [];
  assert.deepEqual(await signIn({ base: BASE, code: 'x'.repeat(22), letters: 'BCDF', origin: HERE, ethereum: walletApp(me, asked), fetch: town({}) }), { no: 'gone' });
  assert.deepEqual(asked, ['eth_requestAccounts']);
});
