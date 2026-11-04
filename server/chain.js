// What the chain says, for wearing your own rektguy online (CHUNKY-170): whether a signature is a wallet's own, which rektguys a wallet
// holds, and what each one looks like. It only ever reads. There's no key in here, and nothing that could send a transaction.
//
// rektguy's contract can't list what an address holds, so it's asked how many first, which is all there is to it for a wallet with
// none, and then whose each one is, a thousand to an ask through Multicall3, until as many as it holds have been found. A rektguy kept
// in another wallet counts for the one it's delegated to by either of delegate.xyz's registries, whether that's for all the vault's,
// for rektguy's or for the one, but not if it's only for something in particular, such as an airdrop. A picture's found from what
// tokenURI says, and anything on IPFS comes through the one gateway, since the one an old address names can be long gone: rektguy's
// own was.
//
// `fetch` is what asks the chain and the gateway, so a test can stand in for both (tools/chain-stand-in.mjs).
import { createPublicClient, fallback, getAddress, http, isAddressEqual, parseAbi, zeroHash } from 'viem';
import { mainnet } from 'viem/chains';

export const REKTGUY = '0xb852c6b5892256c264cc2c888ea462189154d8d7';
const DELEGATE_V1 = '0x00000000000076a84fef008cdabe6409d2fe638b', DELEGATE_V2 = '0x00000000000000447e69651d841bd8d104bed493';
// the public nodes that are asked unless the owner's put one of their own in ETH_RPC_URL
export const RPCS = [...mainnet.rpcUrls.default.http, 'https://ethereum-rpc.publicnode.com'];
export const GATEWAY = 'https://ipfs.io/ipfs/';
const BATCH = 1000;                         // rektguys to an ask
const MOST = 8 << 20, MOST_WORDS = 1 << 20;  // bytes: the biggest picture there'll be, and the most a token's description runs to

const rektguyAbi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function tokenCounter() view returns (uint256)',
]);
const v1Abi = parseAbi([
  'struct DelegationInfo { uint8 type_; address vault; address delegate; address contract_; uint256 tokenId; }',
  'function getDelegationsByDelegate(address delegate) view returns (DelegationInfo[])',
]);
const v2Abi = parseAbi([
  'struct Delegation { uint8 type_; address to; address from; bytes32 rights; address contract_; uint256 tokenId; uint256 amount; }',
  'function getIncomingDelegations(address to) view returns (Delegation[] delegations)',
]);
// what the registries' DelegationTypes are for, in both: all a vault's, one contract's, and one token (v2's ERC721)
const ALL = 1, CONTRACT = 2, TOKEN = 3;

// what a picture is, from its first bytes, whatever whoever sent it said it was
function kind(b) {
  const starts = (...xs) => xs.every((x, i) => b[i] === x);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  const text = new TextDecoder().decode(b.slice(0, 512)).replace(/^﻿/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text)) return 'image/svg+xml';
  return null;
}
// what's written into an address itself
function written(address, most) {
  const comma = address.indexOf(',');
  if (comma < 0) throw new Error('That data address has nothing in it.');
  const head = address.slice(5, comma), body = address.slice(comma + 1).replace(/#.*$/, '');
  const bytes = /;base64$/i.test(head) ? Uint8Array.from(atob(body), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(body));
  if (bytes.length > most) throw new Error('That\'s too big to be what it says it is.');
  return bytes;
}
// as much as there is, up to `most`, and not a byte more read
async function upTo(r, most) {
  if (Number(r.headers.get('content-length')) > most) throw new Error('That\'s too big to be what it says it is.');
  if (!r.body) return new Uint8Array(0);
  const reader = r.body.getReader(), parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > most) { reader.cancel().catch(() => {}); throw new Error('That\'s too big to be what it says it is.'); }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out;
}

export function createChain({ rpc = RPCS, gateway = GATEWAY, fetch = (...a) => globalThis.fetch(...a), most = MOST } = {}) {
  const client = createPublicClient({ chain: mainnet, transport: fallback(rpc.map((url) => http(url, { fetchFn: fetch, retryCount: 1, timeout: 15000 }))) });
  // many asks as one, however many: viem would otherwise split them up by how long they are, into hundreds
  const all = (contracts, allowFailure = false) => client.multicall({ contracts, allowFailure, batchSize: 0 });
  const rektguy = (functionName, ...args) => ({ address: REKTGUY, abi: rektguyAbi, functionName, args });

  // where something a token names is: IPFS through the gateway, whichever gateway it named; Arweave; or a site's own https
  function where(address) {
    if (typeof address !== 'string') throw new Error('There\'s no address there.');
    const ipfs = address.match(/^ipfs:\/\/(?:ipfs\/)?(.+)$/) ?? address.match(/^https:\/\/[^/]+\/ipfs\/(.+)$/);
    if (ipfs) return gateway + ipfs[1];
    if (address.startsWith('ar://')) return `https://arweave.net/${address.slice(5)}`;
    if (address.startsWith('https://')) return address;
    throw new Error(`${address.slice(0, 40)} isn't anywhere a picture's taken from.`);
  }
  async function get(address, most) {
    if (typeof address === 'string' && address.startsWith('data:')) return written(address, most);
    const r = await fetch(where(address), { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`${r.status} from ${where(address).slice(0, 60)}`);
    // and wherever it was sent on to, it ended up somewhere it could have been asked for
    if (r.url && !r.url.startsWith('https://') && !r.url.startsWith(gateway)) throw new Error(`It ended up at ${r.url.slice(0, 40)}.`);
    return upTo(r, most);
  }

  return {
    // An ordinary wallet's signature is checked here, without the chain. One that isn't, which is a smart wallet's, is checked on the
    // chain by EIP-1271, or by EIP-6492 if the wallet's not been put on the chain yet.
    verify: (address, words, signature) => client.verifyMessage({ address: getAddress(address), message: words, signature, mode: 'eoa' }),

    async holds(address) {
      const me = getAddress(address);
      const [v1, v2, counter] = await all([
        { address: DELEGATE_V1, abi: v1Abi, functionName: 'getDelegationsByDelegate', args: [me] },
        { address: DELEGATE_V2, abi: v2Abi, functionName: 'getIncomingDelegations', args: [me] },
        rektguy('tokenCounter'),
      ]);
      // whose every rektguy he can wear, and the single ones he can, with whose they'd have to be
      const whole = new Map([[me.toLowerCase(), me]]), single = [];
      const take = (type, contract, whose, id) => {
        if (type === ALL || (type === CONTRACT && isAddressEqual(contract, REKTGUY))) whole.set(whose.toLowerCase(), whose);
        else if (type === TOKEN && isAddressEqual(contract, REKTGUY)) single.push([whose, id]);
      };
      for (const d of v1) take(d.type_, d.contract_, d.vault, d.tokenId);
      for (const d of v2) if (d.rights === zeroHash) take(d.type_, d.contract_, d.from, d.tokenId);

      const ids = new Set();
      const counts = await all([...whole.values()].map((a) => rektguy('balanceOf', a)));
      let want = counts.reduce((n, c) => n + Number(c), 0);
      // a single one's only his while it's still the vault's that said so
      if (single.length) {
        const owners = await all(single.map(([, id]) => rektguy('ownerOf', id)), true);
        single.forEach(([whose, id], i) => { if (owners[i].status === 'success' && isAddressEqual(owners[i].result, whose)) ids.add(Number(id)); });
      }
      // Whose each one is, until as many as they hold have been found. The numbers start at 0, and the counter's the next one, which
      // is looked at too in case it's the last.
      for (let from = 0, last = Number(counter); want > 0 && from <= last; from += BATCH) {
        const some = Array.from({ length: Math.min(BATCH, last + 1 - from) }, (_, i) => from + i);
        const owners = await all(some.map((id) => rektguy('ownerOf', BigInt(id))), true);
        owners.forEach((o, i) => { if (o.status === 'success' && whole.has(o.result.toLowerCase())) { ids.add(some[i]); want--; } });
      }
      return [...ids].sort((a, b) => a - b);
    },

    // what rektguy `id` looks like: { type, bytes }, and only if it's a picture
    async picture(id) {
      const uri = await client.readContract(rektguy('tokenURI', BigInt(id)));
      const about = JSON.parse(new TextDecoder().decode(await get(uri, MOST_WORDS)));
      const bytes = await get(typeof about?.image === 'string' ? about.image : about?.image_url, most), type = kind(bytes);
      if (!type) throw new Error(`What rektguy ${id}'s picture is said to be isn't a picture.`);
      return { type, bytes };
    },
  };
}
