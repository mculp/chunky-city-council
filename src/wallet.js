// Wearing your own rektguy online (CHUNKY-170): the phone's side of pairing with a wallet, and the wallet's own page's. A phone's
// browser has no wallet in it, so the phone asks the town to pair and sends the player to their wallet app with a link to
// wallet.html, which opens in the wallet's own browser and signs the words the town gives it for that pairing. The phone, which has
// been asking whether it's done, is told what it can wear, by handle, and has each one's picture by its handle too. The town's side
// is server/wallet.js.
//
// There's no page in here, so a test can run all of it against the town's own routes. Everything's a POST of JSON as plain words,
// so the town needs no asking first, and nothing private is ever in an address.

export const WAIT_EVERY = 1500;   // ms between the phone asking whether it's done
// ms the phone waits for the wallet at most, which is as long as the town keeps a pairing, counted on the phone's own clock from
// when it asked, since the town's until is by the town's clock. Once it's over, the town says so.
export const PAIR_FOR = 5 * 60 * 1000;

// Every rektguy's picture is its number, as a GIF, in one folder on IPFS, as each one's metadata says (2026-11-04). The public
// gateways turn the town on Cloudflare away, but not a phone's own browser, so the phone that paired has its own from one of them
// whenever the town hasn't, by the numbers only it's told. Filebase's let a page read them and answered quickest.
export const REKT_PICTURES = 'QmRuj3fqWkZkuruTkPgGSvSdTdjyAMiXyBDPQ5oFer43Rq';
export const IPFS = 'https://ipfs.filebase.io/ipfs/';
// Where the phone has them from: the public gateway, or with ?ipfs= one on this machine, as the checks give it. With ?test it's
// nowhere unless that's said, so a test never asks the real one.
export function ipfsFor({ search = '', test = false } = {}) {
  const given = new URLSearchParams(search).get('ipfs');
  try { if (given && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(given).hostname)) return given; } catch { /* not a place */ }
  return test ? null : IPFS;
}

// where the wallet's side of a town is: beside it, at its own origin
export function walletUrl(town) {
  try { return new URL(town.replace(/^ws/, 'http')).origin; } catch { return null; }
}

// what the town says when it's asked, or { no } and why: `town` if it couldn't be asked, `busy` if it's been asked too often
async function ask(base, what, body, fetch) {
  let r;
  try { r = await fetch(`${base}/wallet/${what}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }); } catch { return { no: 'town' }; }
  if (r.status === 429) return { no: 'busy' };
  try { return await r.json(); } catch { return { no: 'town' }; }
}

// The phone's side, for whoever `key` is in the town whose wallet's side is at `base`, with its own pictures from `ipfs`
export function walletOf({ base, key, fetch = (...a) => globalThis.fetch(...a), ipfs = null }) {
  return {
    pair: () => ask(base, 'pair', { key }, fetch),
    waiting: (code) => ask(base, 'waiting', { code, key }, fetch),
    mine: () => ask(base, 'mine', { key }, fetch),
    wear: (rekt) => ask(base, 'wear', { key, rekt }, fetch),
    forget: () => ask(base, 'forget', { key }, fetch),
    picture: (handle) => `${base}/rektguy/${encodeURIComponent(handle)}`,
    pictureOf: (number) => (ipfs ? `${ipfs}${REKT_PICTURES}/${number}.gif` : null),
  };
}

// The wallet's page for a pairing, on the game's own site. On this machine it says which town as well, since there's more than one
// it could be. The code's in the query, not after a #, since a wallet app's link can lose what's after one; the page takes it off
// the address as soon as it's read.
export function pageFor(code, { origin, town }) {
  const u = new URL('/wallet.html', origin);
  u.searchParams.set('pair', code);
  if (!origin.startsWith('https:')) u.searchParams.set('net', town);
  return u.href;
}

// The wallet apps that open a page in their own browser, by the links their own developer docs give
export function openIn(page) {
  const q = encodeURIComponent(page);
  return [
    { name: 'MetaMask', href: `https://link.metamask.io/dapp/${page.replace(/^https:\/\//, '')}` },
    { name: 'Coinbase Wallet', href: `https://go.cb-w.com/dapp?cb_url=${q}` },
    { name: 'Trust Wallet', href: `https://link.trustwallet.com/open_url?coin_id=60&url=${q}` },
    { name: 'Phantom', href: `https://phantom.app/ul/browse/${q}?ref=${encodeURIComponent(new URL(page).origin)}` },
  ];
}

// What the wallet's page shows for pairing `code`: the four letters on the phone, and until when, or { no } and why
export const seenOf = ({ base, code, fetch = (...a) => globalThis.fetch(...a) }) => ask(base, 'seen', { code }, fetch);

// The words are only signed if they're what they should be, whoever sent them: this page asking for this wallet, showing the four
// letters on the phone, saying it costs nothing and moves nothing, on Ethereum, and nothing else
function sound(words, { origin, address, letters }) {
  if (typeof words !== 'string') return false;
  const lines = words.split('\n');
  return lines.length === 11 && lines[0] === `${new URL(origin).host} wants you to sign in with your Ethereum account:` && lines[1] === address && lines[2] === ''
    && lines[3].startsWith(`Wear your rektguy in Chunky, on the screen showing ${letters}, on `) && lines[3].endsWith('. It\'s only a signature: it costs nothing and moves nothing.')
    && lines[5] === `URI: ${origin}` && lines[6] === 'Version: 1' && lines[7] === 'Chain ID: 1'
    && /^Nonce: [A-Za-z0-9]{8,}$/.test(lines[8]) && /^Issued At: \S+$/.test(lines[9]) && /^Expiration Time: \S+$/.test(lines[10]);
}
const hexOf = (words) => `0x${Array.from(new TextEncoder().encode(words), (b) => b.toString(16).padStart(2, '0')).join('')}`;

// The wallet's page: the wallet in front of it, `ethereum`, an EIP-1193 provider, is asked for its address and to sign the words for
// pairing `code`, and that's all it's ever asked. { done } once the town has the signature, or { no } and why: `declined` if the wallet
// said no, `words` if the words weren't what they should be, and otherwise whatever the town said. `looking` is told once it's signed,
// while the town looks at what the wallet holds, which takes a few seconds.
export async function signIn({ base, code, letters, origin, ethereum, fetch = (...a) => globalThis.fetch(...a), looking = () => {} }) {
  const wallet = async (method, params) => {
    try { return { got: await ethereum.request({ method, ...(params && { params }) }) }; } catch (e) { return { no: e?.code === 4001 ? 'declined' : 'wallet' }; }
  };
  const accounts = await wallet('eth_requestAccounts');
  if (accounts.no) return accounts;
  const address = accounts.got?.[0];
  const said = await ask(base, 'words', { code, address }, fetch);
  if (said.no) return said;
  if (!sound(said.words, { origin, address, letters })) return { no: 'words' };
  const signed = await wallet('personal_sign', [hexOf(said.words), address]);
  if (signed.no) return signed;
  looking();
  return ask(base, 'signed', { code, signature: signed.got }, fetch);
}
