// The host for everyone, on Cloudflare: the characters' words at /talk, and the town everyone shares at /town. What they do is in
// server/talk.js and server/host.js, and this gives them the owner's key, Cloudflare's limits, a bill that every copy of the Worker
// shares, and one place for the town to be.
//
//   npx wrangler@4.154.0 deploy --config server/wrangler.jsonc
//
// The owner's OpenRouter key is the Worker's secret OPENROUTER_KEY, and only the owner puts it in. CAP_USD is the month's cap.
// CHUNKY_HERO is the sha256, in hex, of the secret in the hero's link, and it's a secret too.
import { DurableObject } from 'cloudflare:workers';
import { createTalk, OPENROUTER_URL } from './talk.js';
import { createTown } from './town.js';
import { createHost, MOST } from './host.js';
import { NET_RATE } from '../src/net.js';

const KEEP_EVERY = 5000;   // ms between the town being kept while anyone's in it
// the pages the town and the words answer, which are the game's own
const pagesOf = (env) => (env.ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);

// What the month's lines have cost, by month, in one place for every copy of the Worker. While it reads and writes what it keeps,
// nothing else runs in it, so two lines finishing at once are both counted.
export class Bill extends DurableObject {
  async spent(month) { return (await this.ctx.storage.get(month)) ?? 0; }
  async add(month, cost) {
    const total = ((await this.ctx.storage.get(month)) ?? 0) + cost;
    await this.ctx.storage.put(month, total);
    return total;
  }
}

// The town everyone shares: server/host.js on Cloudflare's sockets, beating twenty times a second while anyone's here. It's kept
// every few seconds and once everyone's gone, and then it rests until someone comes, when what was kept is taken back out first.
export class Town extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.town = createTown();
    this.host = createHost({ town: this.town, heroHash: env.CHUNKY_HERO ?? '' });
    this.phones = new Map();   // Cloudflare's socket → what the host knows it as
    this.beating = null; this.keptAt = 0; this.unkept = false;
    ctx.blockConcurrencyWhile(async () => { const kept = await ctx.storage.get('town'); if (kept) this.town.load(kept); });
  }

  fetch() {
    const [phone, here] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(here);
    // one the town lets go of is forgotten here as it's closed, whether or not it ever says it's closed
    const s = {
      send: (data) => { if (here.readyState === WebSocket.OPEN) here.send(data); },
      close: () => { this.phones.delete(here); here.close(1000); },
      kill: () => { this.phones.delete(here); here.close(1011); },
      get open() { return here.readyState === WebSocket.OPEN; },
    };
    this.phones.set(here, s);
    this.host.opened(s);
    this.wake();
    return new Response(null, { status: 101, webSocket: phone });
  }
  // how many are in town right now, for the title card
  here() { return this.host.here; }

  webSocketMessage(ws, data) {
    const s = this.phones.get(ws);
    // one from before the town started over, which comes back and says hello again
    if (!s) { ws.close(1011); return; }
    if ((typeof data === 'string' ? data.length : data.byteLength) > MOST) { s.kill(); return; }
    return this.host.heard(s, typeof data === 'string' ? data : new Uint8Array(data));
  }
  // A phone that closes is waiting to be answered before it's closed. Where the runtime's answered already, this does nothing, but
  // wrangler dev's doesn't, whatever the compatibility date says.
  webSocketClose(ws) { ws.close(1000); this.gone(ws); }
  webSocketError(ws) { this.gone(ws); }
  gone(ws) {
    const s = this.phones.get(ws);
    if (!s) return;
    this.phones.delete(ws);
    this.host.closed(s);
  }

  // each beat due a twentieth after the last was, so they don't drift
  wake() {
    if (this.beating) return;
    const every = 1000 / NET_RATE;
    let due = Date.now() + every;
    const beat = () => {
      this.host.beat();
      if (!this.phones.size) { this.beating = null; this.keep(); return; }
      if (Date.now() - this.keptAt >= KEEP_EVERY) this.keep();
      const now = Date.now();
      due = Math.max(due + every, now);
      this.beating = setTimeout(beat, due - now);
    };
    this.beating = setTimeout(beat, every);
  }
  // without holding up what's going to the phones until it's written
  keep() {
    this.keptAt = Date.now();
    if (!this.town.dirty && !this.unkept) return;
    this.unkept = true;
    const failed = (e) => console.error(`Couldn't keep the town: ${e.message}`);
    try { this.ctx.storage.put('town', this.town.dump(), { allowUnconfirmed: true }).then(() => { this.unkept = false; }, failed); }
    catch (e) { failed(e); }
  }
}

// one for each copy of the Worker, so that it remembers what the month's spent between asks
let talk = null;
export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/town' || pathname === '/town/here') {
      const origin = request.headers.get('origin');
      if (origin && !pagesOf(env).includes(origin)) return new Response('Chunky only talks to Chunky.', { status: 403 });
      // made the first time anyone comes, in the eastern US, which is nearest Mississippi
      const town = env.TOWN.get(env.TOWN.idFromName('chunky'), { locationHint: 'enam' });
      // how many are in town right now, which the title card asks before anyone's said who they are
      if (pathname === '/town/here') return Response.json({ here: await town.here() }, { headers: { 'Cache-Control': 'no-store', ...(origin && { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }) } });
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('This is the town, over a WebSocket.', { status: 426 });
      return town.fetch(request);
    }
    if (pathname === '/talk') {
      const bill = () => env.BILL.get(env.BILL.idFromName('chunky'));
      talk ??= createTalk({
        fetch: (...a) => fetch(...a), key: env.OPENROUTER_KEY, url: env.OPENROUTER_URL || OPENROUTER_URL,
        cap: env.CAP_USD === undefined ? 20 : Number(env.CAP_USD), origins: pagesOf(env),
        phoneLimit: async (key) => (await env.PHONE.limit({ key })).success,
        placeLimit: async (key) => (await env.PLACE.limit({ key })).success,
        bill: { spent: (month) => bill().spent(month), add: (month, cost) => bill().add(month, cost) },
      });
      return talk(request, (p) => ctx.waitUntil(p));
    }
    return new Response('Chunky, Mississippi.', { status: 404 });
  },
};
