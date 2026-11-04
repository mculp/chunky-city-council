// The town behind a socket, whichever socket it is: ws on this machine (server/index.js), or Cloudflare's own in the Durable Object
// (server/worker.js). It's what's said over them and when: a hello within so long, then poses and what they carry, a beat twenty
// times a second with everyone on it, and letting go of anyone who's gone quiet.
//
// A socket here is anything with send(data), close() once it's been told why, kill() when there's nothing to tell it, and `open`.
// `buffered` is how much is still waiting to go to it, where its socket can say. What's heard is a string for words and bytes for a
// pose. Keys and the hero's secret are hashed with Web Crypto, which Node and Workers both have, so it's the same here as there.
// `mindsOf(keyHash)` is what the cast remember of someone, from wherever that's kept, and keeping it is up to whatever's around this.
import { PHONE_KEY, decodeMessage, say } from '../src/net.js';

const SLOW = 16384;   // bytes still waiting to go to a phone before it's skipped for a beat
export const MOST = 2048;   // the most a phone can say at once: a hello, or what he's carrying, is well under it

const sha = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
// as long whatever the secret, so how long it takes says nothing about how close it was
const same = (a, b) => { let d = a.length ^ b.length; for (let i = 0; i < Math.min(a.length, b.length); i++) d |= a[i] ^ b[i]; return d === 0; };

export function createHost({ town, heroHash = '', mindsOf = null, silence = 5000, helloWithin = 5000, clock = () => performance.now() }) {
  const sockets = new Map(), waiting = new Set();   // id → the socket of whoever's in town; and the ones that haven't said who they are
  const hero = /^[0-9a-f]{64}$/i.test(heroHash) ? Uint8Array.from(heroHash.match(/../g), (h) => parseInt(h, 16)) : null;
  if (heroHash && !hero) console.warn('CHUNKY_HERO isn\'t a sha256 in hex, so nobody\'s the hero.');
  const isHero = async (secret) => !!hero && typeof secret === 'string' && secret.length <= 256 && same(await sha(secret), hero);
  let ticks = 0, joined = 0, busy = 0;

  // a phone the town's done with, so that nothing more goes to it and its closing doesn't count as leaving twice
  function letGo(id) { const ws = sockets.get(id); sockets.delete(id); if (ws) ws.id = 0; return ws; }
  // what the town said to tell, to whom, in the order it said it
  function deliver(out) {
    for (const { to, msg, close } of out) {
      const words = say(msg);
      if (to === 'all') { for (const ws of sockets.values()) if (ws.open) ws.send(words); continue; }
      const ws = sockets.get(to);
      if (ws?.open) ws.send(words);
      if (close) letGo(to)?.close();
    }
  }
  async function hello(ws, m) {
    // the key's made on the phone and kept there, and only its hash is ever kept here
    const keyHash = typeof m.key === 'string' && PHONE_KEY.test(m.key) ? hex(await sha(m.key)) : '';
    const him = await isHero(m.hero);
    // What the cast remember of them. If it can't be read they're let go and try again, rather than come in as a stranger and have
    // it written over.
    const minds = keyHash && mindsOf ? await mindsOf(keyHash) : null;
    if (ws.gone) return;   // it went while that was being worked out
    const r = town.join({ keyHash, name: m.name, look: m.look, hero: him, build: m.build, minds });
    if (!r.id) { deliver(r.out ?? []); ws.send(say(r.no)); ws.close(); return; }
    // Anything everyone's told before his welcome happened before he was here, and he'll find it in the welcome itself
    const at = r.out.findIndex((o) => o.to === r.id && o.msg.t === 'welcome');
    deliver(r.out.slice(0, at));
    joined++; ws.id = r.id; sockets.set(r.id, ws);
    deliver(r.out.slice(at));
  }

  return {
    opened(ws) { ws.id = 0; ws.said = false; ws.gone = false; ws.since = clock(); waiting.add(ws); },
    // and it's heard once: a hello, and nothing else until it's in
    heard(ws, data) {
      const words = typeof data === 'string';
      if (ws.id) {
        if (!words) { deliver(town.move(ws.id, data)); return; }
        const m = decodeMessage(data);
        if (m?.t === 'keep') deliver(town.keep(ws.id, m));
        else if (m?.t === 'mind') deliver(town.mind(ws.id, m));
        return;
      }
      if (ws.said || !words) return;
      const m = decodeMessage(data);
      if (m?.t !== 'hello') return;
      ws.said = true; waiting.delete(ws);
      // something wrong with one phone's hello is that phone's, and the town carries on
      return hello(ws, m).catch((e) => { console.error(`A hello went wrong: ${e.message}`); ws.kill(); });
    },
    closed(ws) { ws.gone = true; waiting.delete(ws); const id = ws.id; if (id) { letGo(id); deliver(town.leave(id)); } },
    beat() {
      const began = clock();
      for (const ws of waiting) if (began - ws.since > helloWithin) { waiting.delete(ws); ws.kill(); }
      for (const id of town.silent(began, silence)) { letGo(id)?.kill(); deliver(town.leave(id)); }
      const snapshot = town.snapshot();
      for (const ws of sockets.values()) if (ws.open && (ws.buffered ?? 0) < SLOW) ws.send(snapshot);
      ticks++; busy += clock() - began;
    },
    // Everyone's let go as if they'd left, so whatever they were driving stays where it was
    letGoAll() { for (const id of [...sockets.keys()]) { letGo(id); town.leave(id); } },
    get here() { return sockets.size; },
    get waiting() { return waiting.size; },
    stats: () => ({ ticks, joined, busy, sockets: [...sockets] }),
  };
}
