// Wearing your own rektguy online (CHUNKY-170). A phone's browser has no wallet in it, so the game pairs with the wallet's own: the
// phone asks for a pairing and gets a code for the wallet's page and four letters to show, and the wallet app opens a small page
// with the code (wallet.html), which asks the wallet for its address, gets the words to sign for that pairing, and sends back the
// signature. The server checks the signature, and what the wallet holds from the chain, and never takes a page's word for either.
// The phone, which has been waiting, is told what it can wear. Nothing here is ever a transaction: it's a signature on plain words,
// in the shape EIP-4361 gives them, so that a wallet can see which site is asking.
//
// There's no socket or chain in here: `chain` is whatever can check a signature and say what an address holds (server/chain.js),
// so a test can stand in for it. `store` is anything with get, put, delete and list, which on Cloudflare is the town's own storage,
// so a pairing's still there if the town's been put away while the player was off in their wallet app.

import { PHONE_KEY } from '../src/net.js';

export const PAIR_FOR = 5 * 60 * 1000;   // ms a pairing's good for
export const RECHECK = 60 * 60 * 1000;   // ms before what a wallet holds is read again, in case one's been sold
export const HERO_TOKEN = 1386;          // the owner's own rektguy, who's the hero
// for the screens to match: no vowels, so four of them never spell anything, and no L to mistake for an I
export const LETTERS = 'BCDFGHJKMNPQRSTVWXZ';
const ADDRESS = /^0x[0-9a-fA-F]{40}$/, NONCE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CODE = /^[\w-]{16,64}$/, HANDLE = CODE;
// The most a page says at once, and the longest signature: a smart wallet that's not on the chain yet sends the call that would put
// it there with its signature, which can run to a few thousand bytes
const MOST_SAID = 16384, SIGNATURE = /^0x[0-9a-fA-F]{128,8192}$/;
const MOST_PAIRS = 1000;                 // pairings at once, so nobody can fill the town's storage with them
const PICTURES_MOST = 24 << 20;          // bytes of pictures kept to hand, newest first
const bytes = (n) => crypto.getRandomValues(new Uint8Array(n));
const picked = (from, n) => Array.from(bytes(n), (b) => from[b % from.length]).join('');
const codeOf = () => btoa(String.fromCharCode(...bytes(16))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// the date as it is in Mississippi, which is where the church signs' days are too
const day = (t) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Chicago' }).format(t);
// a phone's key, hashed as server/host.js hashes it, which is who the town knows them as
const hashOf = async (key) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))), (b) => b.toString(16).padStart(2, '0')).join('');
export const walletKey = (keyHash) => `wallet:${keyHash}`;
const pageTest = (pages) => (typeof pages === 'function' ? (o) => typeof o === 'string' && pages(o) : (o) => pages.includes(o));

// What's kept, for Node: a store as Cloudflare's is, in memory, which hands out copies so that nothing's changed behind its back
export function createMemoryStore(entries = []) {
  const m = new Map(entries);
  return {
    get: async (k) => structuredClone(m.get(k)),
    put: async (k, v) => { m.set(k, structuredClone(v)); },
    delete: async (k) => { for (const one of [].concat(k)) m.delete(one); },
    list: async ({ prefix = '' } = {}) => new Map([...m].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])),
    entries: () => [...m],
  };
}

// `pages` are the origins the wallet's page can be on, since the words name the site that asks, or a test of one. `onSigned` is
// told whose phone it was, the wallet and what it holds before the phone can be told it's done.
export function createPairings({ store, clock = Date.now, pages = ['https://online.chunky.ms'], most = MOST_PAIRS, onSigned = async () => {} }) {
  const allowed = pageTest(pages), at = (code) => `pair:${code}`;
  const live = async (code) => {
    if (typeof code !== 'string' || !CODE.test(code)) return null;
    const p = await store.get(at(code));
    if (p && clock() > p.until) { await store.delete(at(code)); return null; }
    return p ?? null;
  };
  return {
    // for whoever's phone it is, by the hash of its key, which has one at a time
    async pair(keyHash) {
      const now = clock(), over = [];
      let live = 0;
      for (const [k, p] of await store.list({ prefix: 'pair:' })) if (now > p.until || p.keyHash === keyHash) over.push(k); else live++;
      for (let i = 0; i < over.length; i += 128) await store.delete(over.slice(i, i + 128));
      if (live >= most) return { no: 'busy' };
      const code = codeOf(), p = { keyHash, letters: picked(LETTERS, 4), until: now + PAIR_FOR, nonce: picked(NONCE, 16), address: null, words: null, done: false };
      await store.put(at(code), p);
      return { code, letters: p.letters, until: p.until };
    },
    // what the wallet's page shows, so that whoever's holding both can see they match
    async seen(code) { const p = await live(code); return p && !p.done ? { letters: p.letters, until: p.until } : null; },
    // The words for that wallet to sign, for the page at `origin`. The address is as the wallet gave it, with its capitals, which
    // EIP-4361 wants. Asking again, as a wallet that's changed accounts would, gives new words for the new one.
    async words(code, address, origin) {
      const p = await live(code);
      if (!p || p.done) return { no: 'gone' };
      if (typeof address !== 'string' || !ADDRESS.test(address)) return { no: 'address' };
      if (!allowed(origin)) return { no: 'page' };
      const now = clock(), host = new URL(origin).host;
      p.address = address;
      p.words = [
        `${host} wants you to sign in with your Ethereum account:`, address, '',
        `Wear your rektguy in Chunky, on the screen showing ${p.letters}, on ${day(now)}. It's only a signature: it costs nothing and moves nothing.`, '',
        `URI: ${origin}`, 'Version: 1', 'Chain ID: 1', `Nonce: ${p.nonce}`,
        `Issued At: ${new Date(now).toISOString()}`, `Expiration Time: ${new Date(p.until).toISOString()}`,
      ].join('\n');
      await store.put(at(code), p);
      return { words: p.words };
    },
    // The signature on those words. It's taken once, and only if it's the wallet's own; then what it holds is read, and kept, and
    // the phone's told it's done as it next asks. A wrong one, or a chain that can't be read, leaves the pairing open to try again.
    async signed(code, signature, chain) {
      const p = await live(code);
      if (!p || p.done) return { no: 'gone' };
      if (!p.words) return { no: 'words' };
      const { address, words } = p;
      if (!(await chain.verify(address, words, signature).catch(() => false))) return { no: 'signature' };
      let ids;
      try { ids = [...new Set(await chain.holds(address))].sort((a, b) => a - b); } catch { return { no: 'chain' }; }
      // two at once, or a wallet that asked for other words meanwhile: the first one in, for the words that were signed, is the one
      const now = await live(code);
      if (!now || now.done || now.words !== words) return { no: 'gone' };
      await store.put(at(code), { ...now, done: true });
      await onSigned(p.keyHash, address, ids);
      return { done: true, keyHash: p.keyHash, address, ids };
    },
    // what the phone that asked is told as it waits: still waiting, or done, once. Nobody else is told anything.
    async waiting(code, keyHash) {
      const p = await live(code);
      if (!p || p.keyHash !== keyHash) return { no: 'gone' };
      if (!p.done) return { waiting: true };
      await store.delete(at(code));
      return { done: true };
    },
  };
}

// What's kept of each wallet that's been checked, by the hash of the phone's key: its address, which only the server ever has, the
// rektguys it holds, the one they're wearing, and when it was last read from the chain. A wallet with none isn't kept at all. A
// rektguy is only ever told to a phone by its handle, made once at random and kept both ways, since its number would lead anyone to
// the wallet.
export function createBindings({ store, clock = Date.now }) {
  const bindings = {
    async bind(keyHash, address, ids) {
      if (!ids.length) { await store.delete(walletKey(keyHash)); return null; }
      const was = await store.get(walletKey(keyHash));
      // one they hold is on straight away, and one they were wearing that they still hold stays on
      const chosen = ids.length === 1 ? ids[0] : was && ids.includes(was.chosen) ? was.chosen : null;
      const b = { address, ids, chosen, checked: clock() };
      await store.put(walletKey(keyHash), b);
      for (const id of ids) await bindings.handle(id);
      return b;
    },
    async of(keyHash) { return (await store.get(walletKey(keyHash))) ?? null; },
    async handle(id) {
      const had = await store.get(`rektof:${id}`);
      if (had) return had;
      const h = codeOf();
      await store.put(`rektof:${id}`, h); await store.put(`rekt:${h}`, id);
      return h;
    },
    async idOf(handle) { const id = typeof handle === 'string' && HANDLE.test(handle) ? await store.get(`rekt:${handle}`) : undefined; return Number.isInteger(id) ? id : null; },
    // one of theirs, or null for a look of the town's
    async choose(keyHash, handle) {
      const b = await store.get(walletKey(keyHash));
      if (!b || (handle !== null && typeof handle !== 'string')) return false;
      const id = handle === null ? null : await bindings.idOf(handle);
      if (handle !== null && (id === null || !b.ids.includes(id))) return false;
      await store.put(walletKey(keyHash), { ...b, chosen: id });
      return true;
    },
    // which one they're wearing, if any, as { id, handle }
    async wearing(keyHash) {
      const b = await store.get(walletKey(keyHash));
      return b && Number.isInteger(b.chosen) ? { id: b.chosen, handle: await bindings.handle(b.chosen) } : null;
    },
    async forget(keyHashes) { for (let i = 0; i < keyHashes.length; i += 128) await store.delete(keyHashes.slice(i, i + 128).map(walletKey)); },
  };
  return bindings;
}

// The wallet's side of the town, as the phone and the wallet's page ask for it, for Cloudflare's town and the one on this machine
// alike. Everything's a POST of JSON as words, so a page on another site needs no asking first, and nothing private's ever in an
// address. Anything that isn't /wallet/ or /rektguy/ is someone else's, and gets null.
//
//   from the phone:         pair { key } → { code, letters, until },
//                           waiting { code, key } → { waiting } or { done, rekt, wearing, numbers },
//                           mine { key } → { rekt, wearing, numbers }, wear { key, rekt } → { wearing }, forget { key }
//   from the wallet's page: seen { code } → { letters, until }, words { code, address } → { words }, signed { code, signature }
//   from anyone:            GET /rektguy/<handle>, the picture
//
// `rekt` are handles, and `wearing` is one of them or null. `numbers` is each handle's rektguy number, for the phone to put on its
// button when the picture can't be had. Only the phone that paired is told them, since they're the wallet's to know, and with a
// number anyone could look up whose it is. Anything that can't be done is { no } and why.
export function createWalletRoutes({ store, chain, pages, clock = Date.now }) {
  const allowed = pageTest(pages);
  const bindings = createBindings({ store, clock });
  const pairings = createPairings({ store, clock, pages, onSigned: (keyHash, address, ids) => bindings.bind(keyHash, address, ids) });
  const checking = new Map(), pictures = new Map();
  let pictured = 0;

  const json = (body, origin, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } });
  // what a page said, read only as far as the most it could, as an object
  async function said(request) {
    if (Number(request.headers.get('content-length')) > MOST_SAID || !request.body) return null;
    const reader = request.body.getReader(), parts = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > MOST_SAID) { reader.cancel().catch(() => {}); return null; }
      parts.push(value);
    }
    const all = new Uint8Array(n);
    let at = 0;
    for (const p of parts) { all.set(p, at); at += p.byteLength; }
    try { const v = JSON.parse(new TextDecoder().decode(all)); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
  }

  // What a wallet holds is read again once it's been an hour, without anyone waiting for it, unless it's been let go of meanwhile
  function recheck(keyHash, b) {
    if (checking.has(keyHash) || !chain) return;
    const again = chain.holds(b.address)
      .then(async (ids) => { const now = await bindings.of(keyHash); if (now?.address === b.address) await bindings.bind(keyHash, b.address, ids); })
      .catch((e) => console.error(`Couldn't read what a wallet holds again: ${e.message}`))
      .finally(() => checking.delete(keyHash));
    checking.set(keyHash, again);
  }
  async function mine(keyHash) {
    const b = await bindings.of(keyHash);
    if (!b) return { rekt: [], wearing: null, numbers: {} };
    if (clock() - b.checked > RECHECK) recheck(keyHash, b);
    const rekt = [], numbers = {};
    for (const id of b.ids) { const h = await bindings.handle(id); rekt.push(h); numbers[h] = id; }
    return { rekt, wearing: Number.isInteger(b.chosen) ? await bindings.handle(b.chosen) : null, numbers };
  }

  // A picture's the same for everyone, so it's kept to hand, newest first, and anyone can have it once they know the handle. One that
  // can't be had right now is nothing, which a page can read without its console saying anything went wrong, and isn't kept.
  async function picture(request, handle) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
    const none = (status, words) => new Response(words, { status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' } });
    let p = pictures.get(handle);
    if (!p) {
      const id = await bindings.idOf(handle);
      if (id === null || !chain) return none(404, 'Nobody\'s wearing that.');
      try { p = await chain.picture(id); } catch (e) {
        console.error(`Couldn't have rektguy ${id}'s picture: ${e.message}`);
        return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' } });
      }
      pictures.set(handle, p); pictured += p.bytes.length;
      for (const [h, q] of pictures) { if (pictured <= PICTURES_MOST) break; pictures.delete(h); pictured -= q.bytes.length; }
    } else { pictures.delete(handle); pictures.set(handle, p); }
    return new Response(request.method === 'HEAD' ? null : p.bytes, { headers: {
      'Content-Type': p.type, 'Content-Length': String(p.bytes.length), 'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin',
      // an SVG with anything in it besides the picture runs nothing
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'default-src \'none\'; style-src \'unsafe-inline\'; sandbox',
    } });
  }

  async function routes(request) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/rektguy/')) return picture(request, pathname.slice('/rektguy/'.length));
    if (!pathname.startsWith('/wallet/')) return null;
    const origin = request.headers.get('origin');
    if (!allowed(origin)) return new Response('Chunky only talks to Chunky.', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } });
    if (request.method !== 'POST') return json({ no: 'post' }, origin, 405);
    const m = await said(request), what = pathname.slice('/wallet/'.length);
    if (!m) return json({ no: 'said' }, origin, 400);
    // what the phone asks is by its key, which is who the town knows it as
    const phone = ['pair', 'waiting', 'mine', 'wear', 'forget'].includes(what);
    if (phone && !(typeof m.key === 'string' && PHONE_KEY.test(m.key))) return json({ no: 'key' }, origin, 400);
    const keyHash = phone ? await hashOf(m.key) : '';
    switch (what) {
      case 'pair': return json(await pairings.pair(keyHash), origin);
      case 'seen': return json((await pairings.seen(m.code)) ?? { no: 'gone' }, origin);
      case 'words': return json(await pairings.words(m.code, m.address, origin), origin);
      case 'signed': {
        if (typeof m.signature !== 'string' || !SIGNATURE.test(m.signature)) return json({ no: 'signature' }, origin, 400);
        if (!chain) return json({ no: 'chain' }, origin);
        const r = await pairings.signed(m.code, m.signature, chain);
        // the wallet's page is only told it's done: what's in the wallet is for the phone that asked
        return json(r.done ? { done: true } : r, origin);
      }
      case 'waiting': {
        const r = await pairings.waiting(m.code, keyHash);
        return json(r.done ? { done: true, ...await mine(keyHash) } : r, origin);
      }
      case 'mine': return json(await mine(keyHash), origin);
      case 'wear': return json((await bindings.choose(keyHash, m.rekt ?? null)) ? { wearing: m.rekt ?? null } : { no: 'rekt' }, origin);
      case 'forget': await bindings.forget([keyHash]); return json({ forgotten: true }, origin);
      default: return json({ no: 'what' }, origin, 404);
    }
  }
  // for the town: what someone's wearing as they come in, by the hash of their key, and forgetting those it's let go of
  routes.wearing = (keyHash) => bindings.wearing(keyHash);
  routes.forget = (keyHashes) => bindings.forget(keyHashes);
  // once anything being read again has been
  routes.settled = () => Promise.all([...checking.values()]);
  return routes;
}
