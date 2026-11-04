// Wearing your own rektguy online (CHUNKY-170). A phone's browser has no wallet in it, so the game pairs with the wallet's own: the
// phone asks for a pairing and gets a code for the wallet's page and four letters to show, and the wallet app opens a small page
// with the code (wallet.html), which asks the wallet for its address, gets the words to sign for that pairing, and sends back the
// signature. The server checks the signature, and what the wallet holds from the chain, and never takes a page's word for either.
// The phone, which has been waiting, is told what it can wear. Nothing here is ever a transaction: it's a signature on plain words,
// in the shape EIP-4361 gives them, so that a wallet can see which site is asking.
//
// There's no socket or chain in here: `chain` is whatever can check a signature and say what an address holds (server/chain.js),
// so a test can stand in for it.

export const PAIR_FOR = 5 * 60 * 1000;   // ms a pairing's good for
export const HERO_TOKEN = 1386;          // the owner's own rektguy, who's the hero
// for the screens to match: no vowels, so four of them never spell anything, and no L to mistake for an I
export const LETTERS = 'BCDFGHJKMNPQRSTVWXZ';
const ADDRESS = /^0x[0-9a-fA-F]{40}$/, NONCE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const bytes = (n) => crypto.getRandomValues(new Uint8Array(n));
const picked = (from, n) => Array.from(bytes(n), (b) => from[b % from.length]).join('');
const codeOf = () => btoa(String.fromCharCode(...bytes(16))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// the date as it is in Mississippi, which is where the church signs' days are too
const day = (t) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Chicago' }).format(t);

// `pages` are the origins the wallet's page can be on, since the words name the site that asks
export function createPairings({ clock = Date.now, pages = ['https://online.chunky.ms'] } = {}) {
  const pairs = new Map();   // code → { keyHash, letters, until, nonce, address, words, done }
  const live = (code) => {
    const p = pairs.get(code);
    if (p && clock() > p.until) { pairs.delete(code); return null; }
    return p ?? null;
  };
  return {
    // for whoever's phone it is, by the hash of its key
    pair(keyHash) {
      for (const [c, p] of pairs) if (clock() > p.until) pairs.delete(c);
      const code = codeOf(), p = { keyHash, letters: picked(LETTERS, 4), until: clock() + PAIR_FOR, nonce: picked(NONCE, 16), address: null, words: null, done: null };
      pairs.set(code, p);
      return { code, letters: p.letters, until: p.until };
    },
    // what the wallet's page shows, so that whoever's holding both can see they match
    seen(code) { const p = live(code); return p && !p.done ? { letters: p.letters, until: p.until } : null; },
    // The words for that wallet to sign, for the page at `origin`. The address is as the wallet gave it, with its capitals, which
    // EIP-4361 wants. Asking again, as a wallet that's changed accounts would, gives new words for the new one.
    words(code, address, origin) {
      const p = live(code);
      if (!p || p.done) return { no: 'gone' };
      if (!ADDRESS.test(address ?? '')) return { no: 'address' };
      if (!pages.includes(origin)) return { no: 'page' };
      const now = clock(), host = new URL(origin).host;
      p.address = address;
      p.words = [
        `${host} wants you to sign in with your Ethereum account:`, address, '',
        `Wear your rektguy in Chunky, on the screen showing ${p.letters}, on ${day(now)}. It's only a signature: it costs nothing and moves nothing.`, '',
        `URI: ${origin}`, 'Version: 1', 'Chain ID: 1', `Nonce: ${p.nonce}`,
        `Issued At: ${new Date(now).toISOString()}`, `Expiration Time: ${new Date(p.until).toISOString()}`,
      ].join('\n');
      return { words: p.words };
    },
    // The signature on those words. It's taken once, and only if it's the wallet's own; then what it holds is read, which the phone's
    // told as it next asks. A wrong one, or a chain that can't be read, leaves the pairing open to try again while it's live.
    async signed(code, signature, chain) {
      const p = live(code);
      if (!p || p.done) return { no: 'gone' };
      if (!p.words) return { no: 'words' };
      const { address, words } = p;
      if (!(await chain.verify(address, words, signature).catch(() => false))) return { no: 'signature' };
      let ids;
      try { ids = [...new Set(await chain.holds(address))].sort((a, b) => a - b); } catch { return { no: 'chain' }; }
      // two at once: the first one in is the one
      if (p.done || pairs.get(code) !== p) return { no: 'gone' };
      p.done = { keyHash: p.keyHash, address, ids };
      return { done: true, count: ids.length };
    },
    // what the phone that asked is told as it waits: still waiting, or done, once, with what was found
    waiting(code) {
      const p = live(code);
      if (!p) return { no: 'gone' };
      if (!p.done) return { waiting: true };
      pairs.delete(code);
      return { done: true, ...p.done };
    },
  };
}

// What's kept of each wallet that's been checked, by the hash of the phone's key: its address, which only the server ever has, the
// rektguys it holds, the one they're wearing, and when it was last read from the chain. A wallet with none isn't kept at all. A
// rektguy is only ever told to a phone by its handle, made once at random and kept both ways, since its number would lead anyone to
// the wallet. `store` is anything with get, put and delete, which on Cloudflare is the town's own storage.
export function createBindings({ store, clock = Date.now }) {
  const key = (keyHash) => `wallet:${keyHash}`;
  const bindings = {
    async bind(keyHash, address, ids) {
      if (!ids.length) { await store.delete(key(keyHash)); return null; }
      const was = await store.get(key(keyHash));
      // one they hold is on straight away, and one they were wearing that they still hold stays on
      const chosen = ids.length === 1 ? ids[0] : was && ids.includes(was.chosen) ? was.chosen : null;
      const b = { address, ids, chosen, checked: clock() };
      await store.put(key(keyHash), b);
      for (const id of ids) await bindings.handle(id);
      return b;
    },
    async of(keyHash) { return (await store.get(key(keyHash))) ?? null; },
    async handle(id) {
      const had = await store.get(`rektof:${id}`);
      if (had) return had;
      const h = codeOf();
      await store.put(`rektof:${id}`, h); await store.put(`rekt:${h}`, id);
      return h;
    },
    async idOf(handle) { const id = typeof handle === 'string' ? await store.get(`rekt:${handle}`) : undefined; return Number.isInteger(id) ? id : null; },
    // one of theirs, or null for a look of the town's
    async choose(keyHash, handle) {
      const b = await store.get(key(keyHash));
      if (!b) return false;
      const id = handle === null ? null : await bindings.idOf(handle);
      if (id !== null && !b.ids.includes(id)) return false;
      if (handle !== null && id === null) return false;
      await store.put(key(keyHash), { ...b, chosen: id });
      return true;
    },
  };
  return bindings;
}
