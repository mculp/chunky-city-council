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

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
// `hedge` is when the fallback's asked alongside a pick that hasn't answered yet. In the trial the fallback was never slower than
// 0.7 s, which leaves it time to answer inside `wait`.
export const TALK = { body: 8192, messages: 24, chars: 6000, wait: 2500, hedge: 1800, tokens: 200 };
// The cheap models it'll use, and what OpenRouter charged a million tokens in and out on 2026-11-03, for working out what a line
// cost when OpenRouter doesn't say. Trying them side by side on Coop and Miss Bobby (tools/talk-trial.mjs, 2026-11-04) picked the
// first, for how they sound, and the second to answer when the first can't. A page can only name another, for trying them again.
// z-ai/glm-5.3-flash is off the list: OpenRouter only runs it reasoning, and these are asked with reasoning off.
// The last three are to try, at the owner's ask on 2026-11-04, at that day's prices. Muse Spark only answers reasoning, so it's
// given the least it'll take, as `reasoning`, and room to do it in, as `tokens`.
export const MODELS = {
  'google/gemma-4-26b-a4b-it': { in: 0.06, out: 0.18 },
  'meta-llama/llama-3.1-8b-instruct': { in: 0.05, out: 0.08 },
  'mistralai/mistral-nemo': { in: 0.029, out: 0.03 },
  'qwen/qwen3.7-flash': { in: 0.03, out: 0.13 },
  'mistralai/mistral-small-3.2-24b-instruct': { in: 0.075, out: 0.2 },
  'deepseek/deepseek-v4.1-flash-1017': { in: 0.15, out: 0.6 },
  'meta/muse-spark-1.3': { in: 1.25, out: 4.25, reasoning: { effort: 'minimal' }, tokens: 1000 },
  'meta/muse-spark-open': { in: 1.25, out: 4.25, reasoning: { effort: 'low' }, tokens: 1000 },
};
export const [MODEL, FALLBACK] = Object.keys(MODELS);
const ROLES = new Set(['system', 'user', 'assistant']);
const MINUTE = 60000;

// by UTC, which is when OpenRouter's own month on the key starts over
export const monthOf = (ms) => new Date(ms).toISOString().slice(0, 7);
const priced = (model, tokensIn, tokensOut) => (MODELS[model].in * tokensIn + MODELS[model].out * tokensOut) / 1e6;
// a few words off an error that are safe for the log, or nothing
const plain = (s) => (/^[\w .:,'-]{1,80}$/.test(String(s ?? '')) ? String(s) : null);

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
  return chars > TALK.chars ? null : { phone: a.phone, messages, model: a.model };
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

// One line from one model, or why there isn't one. Nothing about the game goes with it, so it isn't listed on OpenRouter, and it
// only goes to providers that don't keep what's sent, since it's what people type. When OpenRouter turns it down, the log says how,
// by its status, code and provider, and never by its message, which can repeat what was said.
async function askOne({ fetch, url, key, model, messages, signal, log }) {
  try {
    const res = await fetch(url, {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, messages, max_tokens: MODELS[model].tokens ?? TALK.tokens, temperature: 0.9, reasoning: MODELS[model].reasoning ?? { enabled: false },
        response_format: { type: 'json_object' }, provider: { sort: 'latency', data_collection: 'deny' },
      }),
    });
    const json = await res.json().catch(() => null);
    if (res.status === 402 || (res.status === 403 && /limit/i.test(json?.error?.message ?? ''))) return { quiet: 'cap' };
    const reply = json?.choices?.[0]?.message?.content;
    if (!res.ok || json?.error || typeof reply !== 'string' || !reply.trim()) {
      const code = plain(json?.error?.code), from = plain(json?.error?.metadata?.provider_name);
      log(`OpenRouter turned ${model} down: ${res.status}${code ? `, code ${code}` : ''}${from ? `, from ${from}` : ''}`);
      return { quiet: 'off' };
    }
    const used = json.usage ?? {};
    return { reply, cost: Number.isFinite(used.cost) ? used.cost : priced(model, used.prompt_tokens ?? 0, used.completion_tokens ?? 0) };
  } catch (e) {
    if (!signal.aborted) log(`OpenRouter couldn't be asked for ${model}: ${plain(e?.message) ?? e?.name}`);
    return { quiet: 'off' };
  }
}

// The line, from the first of `models` that has one. The next is asked as soon as one's turned down, or alongside it once it's gone
// `hedge` without answering, and whichever answers first is the line. Whatever's still being asked when there's a line, or when
// `wait` is up, is given up on, and goes in `charged`, since OpenRouter may charge for it anyway. A key out of money is out for all.
function askModels({ fetch, url, key, models, messages, wait, hedge, clock, log }) {
  const began = clock(), chars = messages.reduce((n, m) => n + m.content.length, 0), asked = [];
  return new Promise((resolve) => {
    let over = false;
    const end = (said) => {
      if (over) return;
      over = true; clearTimeout(alongside); clearTimeout(late);
      const left = asked.filter((a) => !a.back);
      for (const a of left) a.stop.abort();
      const charged = left.reduce((n, a) => n + priced(a.model, chars / 4, MODELS[a.model].tokens ?? TALK.tokens), 0);
      resolve(charged ? { ...said, charged } : said);
    };
    const next = () => {
      if (over || asked.length === models.length) return;
      const a = { model: models[asked.length], stop: new AbortController(), back: false };
      asked.push(a);
      askOne({ fetch, url, key, model: a.model, messages, signal: a.stop.signal, log }).then((said) => {
        a.back = true;
        if (said.reply !== undefined) end({ reply: said.reply, model: a.model, cost: said.cost, ms: Math.round(clock() - began) });
        else if (said.quiet === 'cap') end(said);
        else if (asked.length < models.length) next();
        else if (asked.every((b) => b.back)) end({ quiet: 'off' });
      });
    };
    const alongside = setTimeout(next, hedge), late = setTimeout(() => end({ quiet: 'slow' }), wait);
    next();
  });
}

// The talk server, given how to ask OpenRouter, the owner's key, the month's cap in dollars, the pages it answers (a list, or a rule
// for pages that are somewhere different each time, like a test's on this machine), the two limits (each is told a key and says
// whether it may go on) and the bill (a month's spent, and adding to it, which says the new total). It remembers what the month's
// spent for up to a minute, so most lines don't wait on the bill, and each line's cost goes on the bill after the phone has its answer.
export function createTalk({ fetch, key, cap = 20, origins = [], url = OPENROUTER_URL, wait = TALK.wait, hedge = TALK.hedge, clock = Date.now, phoneLimit, placeLimit, bill, log = console.error }) {
  // a cap that isn't a sum of money is no money at all, never no limit
  if (!(typeof cap === 'number' && Number.isFinite(cap) && cap >= 0)) cap = 0;
  const answers = typeof origins === 'function' ? origins : (o) => origins.includes(o);
  let known = { month: '', spent: 0, at: -Infinity };
  const answer = (body, origin) => new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(origin && { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }) },
  });
  return async function talk(request, waitUntil = () => {}) {
    const origin = request.headers.get('origin');
    if (origin && !answers(origin)) return new Response('Chunky only talks to Chunky.', { status: 403 });
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
    } catch (e) { log(`The talk server couldn't ask the limits or the bill: ${plain(e?.message) ?? e?.name}`); return say({ quiet: 'off' }); }
    if (known.spent >= cap) return say({ quiet: 'cap' });

    // a model the page names is asked alone, for trying them side by side, and otherwise it's the pick with its fallback
    const models = ask.model ? [ask.model] : [MODEL, FALLBACK];
    const { charged = 0, ...said } = await askModels({ fetch, url, key, models, messages: ask.messages, wait, hedge, clock, log });
    // OpenRouter's own limit on the key is spent, whatever the count here says: not asked again for a minute
    if (said.quiet === 'cap') known = { month, spent: Math.max(known.spent, cap), at: clock() };
    const cost = (said.cost ?? 0) + charged;
    if (cost > 0) {
      waitUntil(bill.add(month, cost).then((spent) => { if (known.month === month && spent > known.spent) known = { month, spent, at: clock() }; })
        .catch((e) => console.error(`A line's cost didn't go on the bill: ${e.message}`)));
    }
    return say(said);
  };
}
