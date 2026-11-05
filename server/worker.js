// The host for everyone, on Cloudflare: the characters' words at /talk, and the town everyone shares at /town. What they do is in
// server/talk.js and server/host.js, and this gives them the owner's key, Cloudflare's limits, a bill that every copy of the Worker
// shares, and one place for the town to be.
//
//   npx wrangler@4.154.0 deploy --config server/wrangler.jsonc
//
// The owner's OpenRouter key is the Worker's secret OPENROUTER_KEY, and only the owner puts it in. CAP_USD is the month's cap.
// CHUNKY_HERO is the sha256, in hex, of the secret in the hero's link, and it's a secret too. Wearing your own rektguy (CHUNKY-170)
// asks Ethereum's public nodes, unless ETH_RPC_URL names the owner's own, which is a secret if it has a key in it, and IPFS_GATEWAY
// is where the pictures come through, a list in the order to try, server/chain.js's public ones unless it's said.
import { DurableObject } from 'cloudflare:workers';
import { createTalk, OPENROUTER_URL } from './talk.js';
import { createTown } from './town.js';
import { createHost, MOST } from './host.js';
import { createChain, GATEWAYS, RPCS } from './chain.js';
import { createWalletRoutes, walletKey } from './wallet.js';
import { NET_RATE } from '../src/net.js';
import { createAside } from '../src/aside.js';
// the farm's own outlines, for where nothing's kept broken, which wrangler puts in with the rest
import farm from '../data/farm.json';

const KEEP_EVERY = 5000;   // ms between the town being kept while anyone's in it
// the pages the town and the words answer, which are the game's own; and the nodes the chain's asked of
const listOf = (s) => (s ?? '').split(',').map((o) => o.trim()).filter(Boolean), pagesOf = (env) => listOf(env.ORIGINS);
// made the first time anyone comes, in the eastern US, which is nearest Mississippi
const townOf = (env) => env.TOWN.get(env.TOWN.idFromName('chunky'), { locationHint: 'enam' });

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
// The wallet's side of it is here too, beside the town in its storage, where a pairing waits while the player's off in their wallet
// app, and asking the chain gets the half a minute a Durable Object has for each ask where the Worker would have a hundredth of it.
export class Town extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.town = createTown({ aside: createAside(farm) });
    const chain = createChain({ rpc: listOf(env.ETH_RPC_URL).length ? listOf(env.ETH_RPC_URL) : RPCS, gateway: listOf(env.IPFS_GATEWAY).length ? listOf(env.IPFS_GATEWAY) : GATEWAYS });
    this.wallet = createWalletRoutes({ store: ctx.storage, chain, pages: pagesOf(env) });
    // what the cast remember of each of them is kept on its own, beside the town, since everyone's together would be too much for one
    this.host = createHost({ town: this.town, heroHash: env.CHUNKY_HERO ?? '', mindsOf: (k) => ctx.storage.get(`mind:${k}`), rektOf: (k) => this.wallet.wearing(k) });
    this.phones = new Map();   // Cloudflare's socket → what the host knows it as
    this.beating = null; this.keptAt = 0; this.unkept = false; this.wrecksUnkept = false;
    // and what's broken, in a value of its own beside it
    ctx.blockConcurrencyWhile(async () => {
      const [kept, wrecks] = await Promise.all([ctx.storage.get('town'), ctx.storage.get('wrecks')]);
      if (kept) this.town.load(kept);
      if (wrecks) this.town.loadWrecks(wrecks);
    });
  }

  // the wallet's side of the town and the pictures, and otherwise a phone coming in over a WebSocket
  async fetch(request) {
    const answer = await this.wallet(request);
    if (answer) return answer;
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
    const failed = (e) => console.error(`Couldn't keep the town: ${e.message}`), minds = this.town.keepMinds();
    // whoever the town's let go of is forgotten here too, with any wallet of theirs, a hundred and twenty-eight keys to a delete,
    // which is as many as one takes
    const gone = this.town.forgotten().flatMap((k) => [`mind:${k}`, walletKey(k)]);
    for (let i = 0; i < gone.length; i += 128) {
      try { this.ctx.storage.delete(gone.slice(i, i + 128), { allowUnconfirmed: true }).catch(failed); }
      catch (e) { failed(e); }
    }
    // whoever's memories changed, as many to a put, and any that don't go go next time
    for (let i = 0; i < minds.length; i += 128) {
      const some = minds.slice(i, i + 128), again = (e) => { this.town.notKept(some); failed(e); };
      try { this.ctx.storage.put(Object.fromEntries(some.map(([k, m]) => [`mind:${k}`, m])), { allowUnconfirmed: true }).catch(again); }
      catch (e) { again(e); }
    }
    if (this.town.wrecksDirty || this.wrecksUnkept) {
      this.wrecksUnkept = true;
      try { this.ctx.storage.put('wrecks', this.town.dumpWrecks(), { allowUnconfirmed: true }).then(() => { this.wrecksUnkept = false; }, failed); }
      catch (e) { failed(e); }
    }
    if (!this.town.dirty && !this.unkept) return;
    this.unkept = true;
    try { this.ctx.storage.put('town', this.town.dump(), { allowUnconfirmed: true }).then(() => { this.unkept = false; }, failed); }
    catch (e) { failed(e); }
  }
}

// one for each copy of the Worker, so that it remembers what the month's spent between asks
let talk = null;
export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    // The wallet's side of the town, whose pages it answers itself, and the pictures. What asks the chain, the words and the
    // signature, can only be asked so often from one address.
    if (pathname.startsWith('/wallet/') || pathname.startsWith('/rektguy/')) {
      if (/^\/wallet\/(pair|words|signed)$/.test(pathname) && !(await env.PLACE.limit({ key: request.headers.get('cf-connecting-ip') ?? '' })).success) {
        const origin = request.headers.get('origin');
        return new Response('Slow down a little.', { status: 429, headers: origin && pagesOf(env).includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {} });
      }
      return townOf(env).fetch(request);
    }
    if (pathname === '/town' || pathname === '/town/here') {
      const origin = request.headers.get('origin');
      if (origin && !pagesOf(env).includes(origin)) return new Response('Chunky only talks to Chunky.', { status: 403 });
      const town = townOf(env);
      // how many are in town right now, which the title card asks before anyone's said who they are, and that it can pair a wallet,
      // so the title card only offers it then and the game can go up before the town that pairs
      if (pathname === '/town/here') return Response.json({ here: await town.here(), wallets: true }, { headers: { 'Cache-Control': 'no-store', ...(origin && { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }) } });
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
