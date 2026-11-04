// The host for everyone, on Cloudflare: the characters' words at /talk, and next the town everyone shares. What it does is in
// server/talk.js, and this gives it the owner's key, Cloudflare's limits and a bill that every copy of the Worker shares.
//
//   npx wrangler@4.154.0 deploy --config server/wrangler.jsonc
//
// The owner's OpenRouter key is the Worker's secret OPENROUTER_KEY, and only the owner puts it in. CAP_USD is the month's cap.
import { DurableObject } from 'cloudflare:workers';
import { createTalk, TALK_URL } from './talk.js';

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

// one for each copy of the Worker, so that it remembers what the month's spent between asks
let talk = null;
export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/talk') {
      const bill = () => env.BILL.get(env.BILL.idFromName('chunky'));
      talk ??= createTalk({
        fetch: (...a) => fetch(...a), key: env.OPENROUTER_KEY, url: env.OPENROUTER_URL || TALK_URL,
        cap: env.CAP_USD === undefined ? 20 : Number(env.CAP_USD), origins: (env.ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
        phoneLimit: async (key) => (await env.PHONE.limit({ key })).success,
        placeLimit: async (key) => (await env.PLACE.limit({ key })).success,
        bill: { spent: (month) => bill().spent(month), add: (month, cost) => bill().add(month, cost) },
      });
      return talk(request, (p) => ctx.waitUntil(p));
    }
    return new Response('Chunky, Mississippi.', { status: 404 });
  },
};
