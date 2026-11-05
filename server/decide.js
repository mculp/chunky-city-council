// What a person holding out comes up with for him to do, once a day (CHUNKY-163). Jev, TypeSafe's decision model on OpenRouter, is
// told what the game says about their round and picks three things: the shape of it from the game's fixed menu, the place by its
// number in the game's list, and whether it's worth bringing up with him today. Jev writes no words and the game names the place, so
// nothing it says can send him anywhere the game didn't offer. It's the talk server's key, limits and bill (server/talk.js), so it
// comes out of the same $20 a month. There's no Cloudflare in here, so a test can run all of it, and server/worker.js gives it the rest.
//
// A phone sends { phone, state, shapes, places } as text, and gets back { shape, place, worth }, with `place` an index into
// `places`, or { quiet } and why, in the talk server's words:
//   bad   the ask broke one of the limits below
//   off   there's no key, or OpenRouter or Jev isn't working, or what Jev said wasn't one of the game's
//   fast  that phone, or that address, asked too soon
//   cap   the month's money is spent, by the count here or by OpenRouter's limit on the key
//   slow  no answer in time
// Every answer's a 200, unless the page is on another site.
import { PHONE_KEY } from '../src/net.js';
import { monthOf, plain, readCapped } from './talk.js';

export const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
// Jev's API is alpha, so the model's pinned, and never ~typesafe/jev-latest. Its price a million tokens in, as OpenRouter listed it
// on 2026-11-04, is for working out what an answer cost when OpenRouter doesn't say. What comes out is free.
export const JEV = { model: 'typesafe/jev-1.14', in: 0.042 };
// bytes an ask can be, characters of what the game says and of each place, how many shapes and places, and ms to wait for Jev
export const DECIDE = { body: 32768, state: 4000, shapes: 8, places: 20, place: 200, wait: 8000 };
const SHAPE = /^[a-z][a-z-]{0,23}$/, MINUTE = 60000;
const words = (s, most) => typeof s === 'string' && s.length > 0 && s.length <= most;

// what a phone asked, or null if it broke any of the limits
export function readDecide(text) {
  let a;
  try { a = JSON.parse(text); } catch { return null; }
  if (!a || typeof a !== 'object' || Array.isArray(a) || typeof a.phone !== 'string' || !PHONE_KEY.test(a.phone) || !words(a.state, DECIDE.state)) return null;
  const { shapes, places } = a;
  if (!Array.isArray(shapes) || !shapes.length || shapes.length > DECIDE.shapes || !shapes.every((s) => typeof s === 'string' && SHAPE.test(s)) || new Set(shapes).size !== shapes.length) return null;
  if (!Array.isArray(places) || !places.length || places.length > DECIDE.places || !places.every((p) => words(p, DECIDE.place))) return null;
  return { phone: a.phone, state: a.state, shapes: [...shapes], places: [...places] };
}

// The three questions Jev's asked, from what the game offered: the shapes are a choice's options, and the places are a choice's
// options by their numbers, with what each is
export function questionsFor({ shapes, places }) {
  return {
    shape: { type: 'choice', instructions: 'What they would ask him to come and do with them', criteria: Object.fromEntries(shapes.map((s) => [s, null])) },
    place: { type: 'choice', instructions: 'Where they would ask him to meet them for it', criteria: Object.fromEntries(places.map((p, i) => [String(i), p])) },
    worth: { type: 'noul', instructions: 'Whether it is worth bringing up with him today', criteria: { true: 'Worth bringing up today', false: 'Better left for another day' } },
  };
}

// Jev's answers, as long as each is one the game offered: a shape off the menu, the number of a place it gave, and a yes that's Jev's
// being at least half sure
export function answerOf(json, { shapes, places }) {
  const a = json?.answers, shape = a?.shape?.type === 'choice' ? a.shape.choice : null, at = a?.place?.type === 'choice' ? a.place.choice : null;
  const place = typeof at === 'string' && /^\d{1,2}$/.test(at) ? Number(at) : -1, yes = a?.worth?.type === 'noul' ? a.worth.noul : NaN;
  if (!shapes.includes(shape) || !(place >= 0 && place < places.length) || !Number.isFinite(yes)) return null;
  return { shape, place, worth: yes >= 0.5 };
}

// One decision, or why there isn't one. When OpenRouter turns it down, the log says how, by its status and code, and never by its
// message.
async function askJev({ fetch, url, key, ask, signal, log }) {
  try {
    const res = await fetch(url, {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: JEV.model, state: ask.state, questions: questionsFor(ask) }),
    });
    const json = await res.json().catch(() => null);
    if (signal.aborted) return { quiet: 'off' };
    if (res.status === 402 || (res.status === 403 && /limit/i.test(json?.error?.message ?? ''))) return { quiet: 'cap' };
    const used = json?.usage ?? {}, cost = Number.isFinite(used.cost) ? used.cost : ((used.input_tokens ?? 0) * JEV.in) / 1e6;
    if (!res.ok || json?.error) {
      const code = plain(json?.error?.code);
      log(`OpenRouter turned Jev down: ${res.status}${code ? `, code ${code}` : ''}`);
      return { quiet: 'off' };
    }
    const decision = answerOf(json, ask);
    if (!decision) { log('Jev answered with something the game didn\'t offer'); return { quiet: 'off', cost }; }
    return { ...decision, cost };
  } catch (e) {
    if (!signal.aborted) log(`OpenRouter couldn't be asked for Jev: ${plain(e?.message) ?? e?.name}`);
    return { quiet: 'off' };
  }
}

// The decisions, given how to ask OpenRouter, the owner's key, the month's cap in dollars, the pages it answers, the two limits and
// the bill, as the talk server has them. It remembers what the month's spent for up to a minute, as the talk server does.
export function createDecide({ fetch, key, cap = 20, origins = [], url = DECISIONS_URL, wait = DECIDE.wait, clock = Date.now, phoneLimit, placeLimit, bill, log = console.error }) {
  if (!(typeof cap === 'number' && Number.isFinite(cap) && cap >= 0)) cap = 0;
  const answers = typeof origins === 'function' ? origins : (o) => origins.includes(o);
  let known = { month: '', spent: 0, at: -Infinity };
  return async function decide(request, waitUntil = () => {}) {
    const origin = request.headers.get('origin');
    if (origin && !answers(origin)) return new Response('Chunky only talks to Chunky.', { status: 403 });
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin ?? '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } });
    }
    const say = (body) => new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(origin && { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }) },
    });
    const ask = request.method === 'POST' ? readDecide(await readCapped(request, DECIDE.body) ?? '') : null;
    if (!ask) return say({ quiet: 'bad' });
    if (!key) return say({ quiet: 'off' });
    const month = monthOf(clock());
    try {
      const [phoneOk, placeOk] = await Promise.all([phoneLimit(ask.phone), placeLimit(request.headers.get('cf-connecting-ip') ?? '')]);
      if (!phoneOk || !placeOk) return say({ quiet: 'fast' });
      if (known.month !== month || clock() - known.at > MINUTE) known = { month, spent: await bill.spent(month), at: clock() };
    } catch (e) { log(`The decisions couldn't ask the limits or the bill: ${plain(e?.message) ?? e?.name}`); return say({ quiet: 'off' }); }
    if (known.spent >= cap) return say({ quiet: 'cap' });

    // given up on after `wait`, which is said before the ask's stopped so it's what the phone's told, and charged anyway at what went
    // in, since OpenRouter may charge for it
    const stop = new AbortController();
    const late = new Promise((r) => { const t = setTimeout(() => { r({ quiet: 'slow', cost: (JSON.stringify(questionsFor(ask)).length + ask.state.length) / 4 * JEV.in / 1e6 }); stop.abort(); }, wait); stop.signal.addEventListener('abort', () => clearTimeout(t)); });
    const { cost = 0, ...said } = await Promise.race([askJev({ fetch, url, key, ask, signal: stop.signal, log }), late]);
    if (!stop.signal.aborted) stop.abort();
    if (said.quiet === 'cap') known = { month, spent: Math.max(known.spent, cap), at: clock() };
    if (cost > 0) {
      waitUntil(bill.add(month, cost).then((spent) => { if (known.month === month && spent > known.spent) known = { month, spent, at: clock() }; })
        .catch((e) => console.error(`A decision's cost didn't go on the bill: ${e.message}`)));
    }
    return say(said);
  };
}
