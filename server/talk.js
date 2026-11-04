// The characters' own words (CHUNKY-107): what a phone may ask the talk server, and how the server asks OpenRouter for them. There's
// no Cloudflare in here, so a test can run all of it, and server/worker.js gives it the owner's key, the limits and the bill.
//
// The game builds the whole prompt and sends it as text, and it gets the model's words back as they came, for its own checker to
// read. Anything that keeps the model from answering comes back as { quiet } with why, and the game says its written lines instead:
//   bad   the ask broke one of the limits below
//   off   there's no key, or OpenRouter, or something here, isn't working
//   fast  that phone, or that address, asked too soon
//   cap   the month's money is spent, by the count here or by OpenRouter's limit on the key
//   slow  no answer in time
// Every answer's a 200, so that nothing on a phone's console looks as if it went wrong, unless the page is on another site.
import { PHONE_KEY } from '../src/net.js';

export const TALK_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const TALK = { body: 8192, messages: 24, chars: 6000, wait: 2500, tokens: 200 };
// The cheap models it'll use, and what OpenRouter charged a million tokens in and out on 2026-11-03, for working out what a line
// cost when OpenRouter doesn't say. The first is the one used, until trying them side by side on Coop and Miss Bobby picks one, and
// a page can only name another for that.
export const MODELS = {
  'mistralai/mistral-nemo': { in: 0.029, out: 0.03 },
  'z-ai/glm-5.3-flash': { in: 0.028, out: 0.093 },
  'qwen/qwen3.7-flash': { in: 0.03, out: 0.13 },
  'meta-llama/llama-3.1-8b-instruct': { in: 0.05, out: 0.08 },
  'google/gemma-4-26b-a4b-it': { in: 0.06, out: 0.18 },
  'mistralai/mistral-small-3.2-24b-instruct': { in: 0.075, out: 0.2 },
};
export const MODEL = Object.keys(MODELS)[0];
const ROLES = new Set(['system', 'user', 'assistant']);
const MINUTE = 60000;

// by UTC, which is when OpenRouter's own month on the key starts over
export const monthOf = (ms) => new Date(ms).toISOString().slice(0, 7);
const priced = (model, tokensIn, tokensOut) => (MODELS[model].in * tokensIn + MODELS[model].out * tokensOut) / 1e6;

// what a phone asked, or null if it broke any of the limits
export function readAsk(text) {
  let a;
  try { a = JSON.parse(text); } catch { return null; }
  if (!a || typeof a !== 'object' || Array.isArray(a) || typeof a.phone !== 'string' || !PHONE_KEY.test(a.phone)) return null;
  if (!Array.isArray(a.messages) || !a.messages.length || a.messages.length > TALK.messages) return null;
  if (a.model !== undefined && !(typeof a.model === 'string' && Object.hasOwn(MODELS, a.model))) return null;
  const messages = [];
  let chars = 0;
  for (const m of a.messages) {
    if (!ROLES.has(m?.role) || typeof m.content !== 'string') return null;
    chars += m.content.length; messages.push({ role: m.role, content: m.content });
  }
  return chars > TALK.chars ? null : { phone: a.phone, messages, model: a.model ?? MODEL };
}

// the body, as long as it's no more than `most` bytes however it's sent
async function readCapped(request, most) {
  if (+(request.headers.get('content-length') ?? 0) > most) return null;
  if (!request.body) return '';
  const reader = request.body.getReader(), parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if ((size += value.byteLength) > most) { await reader.cancel(); return null; }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  parts.reduce((at, p) => (all.set(p, at), at + p.byteLength), 0);
  return new TextDecoder().decode(all);
}

// One line from the model. Nothing about the game goes with it, so it isn't listed on OpenRouter, and it only goes to providers that
// don't keep what's sent, since it's what people type. `charged` is what a line given up on may still have cost.
async function askModel({ fetch, url, key, model, messages, wait, clock }) {
  const began = clock(), stop = new AbortController(), timer = setTimeout(() => stop.abort(), wait);
  try {
    const res = await fetch(url, {
      method: 'POST', signal: stop.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, messages, max_tokens: TALK.tokens, temperature: 0.9, reasoning: { enabled: false },
        response_format: { type: 'json_object' }, provider: { sort: 'latency', data_collection: 'deny' },
      }),
    });
    const json = await res.json().catch(() => null);
    if (res.status === 402 || (res.status === 403 && /limit/i.test(json?.error?.message ?? ''))) return { quiet: 'cap' };
    const reply = json?.choices?.[0]?.message?.content;
    if (!res.ok || json?.error || typeof reply !== 'string' || !reply.trim()) return { quiet: 'off' };
    const used = json.usage ?? {};
    const cost = Number.isFinite(used.cost) ? used.cost : priced(model, used.prompt_tokens ?? 0, used.completion_tokens ?? 0);
    return { reply, model, cost, ms: Math.round(clock() - began) };
  } catch {
    if (!stop.signal.aborted) return { quiet: 'off' };
    const chars = messages.reduce((n, m) => n + m.content.length, 0);
    return { quiet: 'slow', charged: priced(model, chars / 4, TALK.tokens) };
  } finally { clearTimeout(timer); }
}

// The talk server, given how to ask OpenRouter, the owner's key, the month's cap in dollars, the pages it answers, the two limits
// (each is told a key and says whether it may go on) and the bill (a month's spent, and adding to it, which says the new total).
// It remembers what the month's spent for up to a minute, so most lines don't wait on the bill, and each line's cost goes on the bill
// after the phone has its answer.
export function createTalk({ fetch, key, cap = 5, origins = [], url = TALK_URL, wait = TALK.wait, clock = Date.now, phoneLimit, placeLimit, bill }) {
  // a cap that isn't a sum of money is no money at all, never no limit
  if (!(typeof cap === 'number' && Number.isFinite(cap) && cap >= 0)) cap = 0;
  let known = { month: '', spent: 0, at: -Infinity };
  const answer = (body, origin) => new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(origin && { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }) },
  });
  return async function talk(request, waitUntil = () => {}) {
    const origin = request.headers.get('origin');
    if (origin && !origins.includes(origin)) return new Response('Chunky only talks to Chunky.', { status: 403 });
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin ?? '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } });
    }
    const say = (body) => answer(body, origin);
    const ask = request.method === 'POST' ? readAsk(await readCapped(request, TALK.body) ?? '') : null;
    if (!ask) return say({ quiet: 'bad' });
    if (!key) return say({ quiet: 'off' });
    const month = monthOf(clock());
    try {
      const [phoneOk, placeOk] = await Promise.all([phoneLimit(ask.phone), placeLimit(request.headers.get('cf-connecting-ip') ?? '')]);
      if (!phoneOk || !placeOk) return say({ quiet: 'fast' });
      if (known.month !== month || clock() - known.at > MINUTE) known = { month, spent: await bill.spent(month), at: clock() };
    } catch { return say({ quiet: 'off' }); }
    if (known.spent >= cap) return say({ quiet: 'cap' });

    const { charged, ...said } = await askModel({ fetch, url, key, model: ask.model, messages: ask.messages, wait, clock });
    // OpenRouter's own limit on the key is spent, whatever the count here says: not asked again for a minute
    if (said.quiet === 'cap') known = { month, spent: Math.max(known.spent, cap), at: clock() };
    const cost = said.cost ?? charged ?? 0;
    if (cost > 0) {
      waitUntil(bill.add(month, cost).then((spent) => { if (known.month === month && spent > known.spent) known = { month, spent, at: clock() }; })
        .catch((e) => console.error(`A line's cost didn't go on the bill: ${e.message}`)));
    }
    return say(said);
  };
}
