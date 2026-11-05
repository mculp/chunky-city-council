// Ethereum, as far as wearing your own rektguy needs it (CHUNKY-170), so the tests and the checks never ask the real one: rektguy's
// contract, delegate.xyz's two registries, Multicall3 for asking them many things at once, smart wallets that take the signatures
// they're told to, and an IPFS gateway. It answers JSON-RPC as a node would, to a fetch it's handed or over HTTP on this machine, with
// the gateway at /ipfs/ on the same port. What the contracts are asked is in `asked`, by function, so a test can see how much was.
//
// The contracts are written out here from their own sources, not taken from server/chain.js, so a mistake in one shows against the other.
import { createServer } from 'node:http';
import { decodeAbiParameters, decodeFunctionData, encodeFunctionResult, erc6492SignatureValidatorByteCode, isAddressEqual, multicall3Abi, parseAbi, recoverAddress, zeroAddress, zeroHash } from 'viem';

const REKTGUY = '0xb852c6b5892256c264cc2c888ea462189154d8d7';
const DELEGATE_V1 = '0x00000000000076a84fef008cdabe6409d2fe638b';
const DELEGATE_V2 = '0x00000000000000447e69651d841bd8d104bed493';
const MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11';

const rektguyAbi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function tokenCounter() view returns (uint256)',
]);
// delegate.xyz's first registry, from src/IDelegationRegistry.sol at its v1.0 tag
const v1Abi = parseAbi([
  'struct DelegationInfo { uint8 type_; address vault; address delegate; address contract_; uint256 tokenId; }',
  'function getDelegationsByDelegate(address delegate) view returns (DelegationInfo[])',
]);
// and its second, from src/IDelegateRegistry.sol
const v2Abi = parseAbi([
  'struct Delegation { uint8 type_; address to; address from; bytes32 rights; address contract_; uint256 tokenId; uint256 amount; }',
  'function getIncomingDelegations(address to) view returns (Delegation[] delegations)',
]);
// the two registries' DelegationType enums
const V1_TYPE = { all: 1, contract: 2, token: 3 }, V2_TYPE = { all: 1, contract: 2, token: 3 };

class Reverted extends Error {}

// `owners` is rektguy number → address. `minted` is address → how many it minted, which is all rektguy's balanceOf says: it's the
// contract's tokenBalancePerOwner, which only its mint counts and no transfer changes, and not the ERC-721 balance it keeps beside
// it, so on the chain it's none for most who hold one (CHUNKY-170). `delegations` are { registry: 1 or 2, type: 'all', 'contract' or
// 'token', from, to }, with `contract`, `tokenId` and `rights` where they're wanted. `smart` is a smart wallet's address → (hash,
// signature) → whether it takes it. `ipfs` is 'cid/path' → what's there, words or bytes. `base` is what tokenURI puts the number on
// the end of, as rektguy's does. Alchemy's NFT API is here too, at /nft/v3/<key>/: its index of who holds what is `index`, rektguy
// number → address, where it's given, as one that hasn't caught up would be, and otherwise the same as `owners`; and its own copy of
// each picture is `cached`, number → bytes, at /cdn/<number>. `alchemyDown` has it answer nothing but 503.
export function chainStandIn({ owners = {}, minted = {}, counter = null, delegations = [], smart = {}, ipfs = {}, base = 'ipfs://QmStandInMeta/', index = null, cached = {}, alchemyDown = false } = {}) {
  const asked = [];
  const ownerOf = (id) => owners[id] ?? null;
  const contracts = {
    [REKTGUY]: {
      abi: rektguyAbi,
      balanceOf: (who) => BigInt(Object.entries(minted).find(([a]) => isAddressEqual(a, who))?.[1] ?? 0),
      ownerOf: (id) => { const o = ownerOf(Number(id)); if (!o) throw new Reverted('ERC721: invalid token ID'); return o; },
      tokenURI: (id) => `${base}${id}`,
      tokenCounter: () => BigInt(counter ?? Math.max(-1, ...Object.keys(owners).map(Number)) + 1),
    },
    [DELEGATE_V1]: {
      abi: v1Abi,
      getDelegationsByDelegate: (who) => delegations.filter((d) => d.registry === 1 && isAddressEqual(d.to, who)).map((d) => ({
        type_: V1_TYPE[d.type], vault: d.from, delegate: d.to, contract_: d.type === 'all' ? zeroAddress : d.contract ?? REKTGUY, tokenId: BigInt(d.tokenId ?? 0),
      })),
    },
    [DELEGATE_V2]: {
      abi: v2Abi,
      getIncomingDelegations: (who) => delegations.filter((d) => d.registry === 2 && isAddressEqual(d.to, who)).map((d) => ({
        type_: V2_TYPE[d.type], to: d.to, from: d.from, rights: d.rights ?? zeroHash, contract_: d.type === 'all' ? zeroAddress : d.contract ?? REKTGUY,
        tokenId: BigInt(d.tokenId ?? 0), amount: 0n,
      })),
    },
  };

  // What the universal signature validator says, which is what viem puts on the chain without deploying it to check a smart wallet's
  // signature: a smart wallet's own answer, or for anyone else whether the signature's theirs.
  async function validate(data) {
    if (!data.startsWith(erc6492SignatureValidatorByteCode)) throw new Reverted('nothing to deploy here');
    const [signer, hash, signature] = decodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }, { type: 'bytes' }], `0x${data.slice(erc6492SignatureValidatorByteCode.length)}`);
    asked.push('isValidSig');
    const wallet = Object.entries(smart).find(([a]) => isAddressEqual(a, signer))?.[1];
    if (wallet) return wallet(hash, signature) ? '0x01' : '0x00';
    try { return isAddressEqual(await recoverAddress({ hash, signature }), signer) ? '0x01' : '0x00'; } catch { return '0x00'; }
  }
  async function call(to, data) {
    if (!to) return validate(data);
    if (to.toLowerCase() === MULTICALL3) {
      const { functionName, args: [calls] } = decodeFunctionData({ abi: multicall3Abi, data });
      if (functionName !== 'aggregate3') throw new Reverted(`Multicall3 here only does aggregate3, not ${functionName}`);
      const result = [];
      for (const { target, allowFailure, callData } of calls) {
        try { result.push({ success: true, returnData: await call(target, callData) }); }
        catch (e) { if (!allowFailure || !(e instanceof Reverted)) throw e; result.push({ success: false, returnData: '0x' }); }
      }
      return encodeFunctionResult({ abi: multicall3Abi, functionName, result });
    }
    const contract = contracts[to.toLowerCase()];
    if (!contract) throw new Reverted('there\'s no contract there');
    const { functionName, args = [] } = decodeFunctionData({ abi: contract.abi, data });
    asked.push(functionName);
    return encodeFunctionResult({ abi: contract.abi, functionName, result: contract[functionName](...args) });
  }
  async function rpc({ id, method, params = [] }) {
    try {
      if (method === 'eth_chainId') return { jsonrpc: '2.0', id, result: '0x1' };
      if (method === 'eth_blockNumber') return { jsonrpc: '2.0', id, result: '0x1' };
      if (method !== 'eth_call') return { jsonrpc: '2.0', id, error: { code: -32601, message: `${method} isn't here` } };
      return { jsonrpc: '2.0', id, result: await call(params[0].to, params[0].data) };
    } catch (e) {
      if (e instanceof Reverted) return { jsonrpc: '2.0', id, error: { code: 3, message: `execution reverted: ${e.message}`, data: '0x' } };
      throw e;
    }
  }

  // Alchemy's NFT API, v3: what an owner holds of a contract's, a hundred to a page at most, and a token's metadata with its picture's copy
  function alchemy(what, q) {
    if (alchemyDown) return new Response('Service Unavailable', { status: 503 });
    asked.push(what);
    if (what === 'getNFTsForOwner') {
      const theirs = q.get('contractAddresses[]')?.toLowerCase() !== REKTGUY ? [] : Object.entries(index ?? owners).filter(([, o]) => isAddressEqual(o, q.get('owner'))).map(([id]) => +id).sort((a, b) => a - b);
      const from = +(q.get('pageKey') ?? 0), size = Math.min(100, +(q.get('pageSize') ?? 100)), page = theirs.slice(from, from + size);
      return Response.json({ ownedNfts: page.map((id) => ({ contractAddress: REKTGUY, tokenId: String(id), balance: '1' })), totalCount: theirs.length, pageKey: from + size < theirs.length ? String(from + size) : null });
    }
    if (what === 'getNFTMetadata') return Response.json({ tokenId: q.get('tokenId'), image: { cachedUrl: cached[q.get('tokenId')] ? `https://nft-cdn.stand-in/cdn/${q.get('tokenId')}` : null } });
    return new Response('Not Found', { status: 404 });
  }

  async function answer(request) {
    const { pathname, searchParams } = new URL(request.url);
    if (pathname.startsWith('/nft/v3/')) return alchemy(pathname.split('/').pop(), searchParams);
    if (pathname.startsWith('/cdn/')) { const there = cached[pathname.slice('/cdn/'.length)]; return there ? new Response(there) : new Response('Not Found', { status: 404 }); }
    if (pathname.startsWith('/ipfs/')) {
      const there = ipfs[decodeURIComponent(pathname.slice('/ipfs/'.length))];
      if (there === undefined) return new Response('not pinned', { status: 404 });
      return new Response(there, { headers: { 'Content-Type': typeof there === 'string' ? 'text/plain' : 'application/octet-stream' } });
    }
    if (request.method !== 'POST') return new Response('JSON-RPC, by POST', { status: 405 });
    const body = await request.json();
    return Response.json(Array.isArray(body) ? await Promise.all(body.map(rpc)) : await rpc(body));
  }

  return {
    asked, owners, delegations,
    // for a fetch to be handed: whatever it's asked is asked of this
    fetch: (input, init) => answer(new Request(input, init)),
    // or on a port of its own on this machine, for a Worker in wrangler dev or the town on this machine
    async listen() {
      const server = createServer(async (req, res) => {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const r = await answer(new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers: req.headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }));
        res.writeHead(r.status, Object.fromEntries(r.headers));
        res.end(Buffer.from(await r.arrayBuffer()));
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const url = `http://127.0.0.1:${server.address().port}`;
      return { rpc: `${url}/`, gateway: `${url}/ipfs/`, close: () => new Promise((r) => { server.close(r); server.closeAllConnections(); }) };
    },
  };
}
