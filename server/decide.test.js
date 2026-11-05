// What a person holding out comes up with for him to do (CHUNKY-163): what a phone may ask, what goes on to Jev, what comes back, and
// when it all goes quiet
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecide, readDecide, questionsFor, answerOf, DECIDE, DECISIONS_URL, JEV } from './decide.js';
import { monthOf } from './talk.js';

const PHONE = 'a-phone-of-their-own-1234';
const STATE = 'Coop keeps the gas station on US 80 and drives home along Chunky Duffee Rd after he closes up at nine.';
const PLACES = ['the pond behind the church on Chunky Duffee Rd', 'the pond in the pines past the creek'];
const body = (over = {}) => JSON.stringify({ phone: PHONE, state: STATE, shapes: ['fishing'], places: PLACES, ...over });
const ask = (text = body(), { origin = 'https://chunky.ms', method = 'POST' } = {}) => new Request('https://talk.test/decide', {
  method, body: method === 'POST' ? text : undefined,
  headers: { 'Content-Type': 'text/plain', 'CF-Connecting-IP': '203.0.113.7', ...(origin && { Origin: origin }) },
});
// Jev's answers as OpenRouter's decisions endpoint gives them
const decided = ({ shape = 'fishing', place = '1', yes = 0.82, cost = 0.00001 } = {}) => ({
  answers: {
    shape: { type: 'choice', choice: shape, probabilities: { [shape]: 1 }, confidence: 0.9 },
    place: { type: 'choice', choice: place, probabilities: { [place]: 0.8 }, confidence: 0.7 },
    worth: { type: 'noul', noul: yes },
  },
  model: JEV.model, usage: { input_tokens: 260, output_tokens: 3, ...(cost !== null && { cost }) },
});
// OpenRouter, as far as these need it: it answers as it's told, or hangs until it's given up on
function upstream({ status = 200, json = decided(), hang = false, fail = false } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    if (fail) throw new TypeError('fetch failed');
    if (hang) return new Promise((_, no) => init.signal.addEventListener('abort', () => no(new DOMException('gave up', 'AbortError'))));
    return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, calls };
}
// what the month's cost, kept as the Durable Object keeps it, the same bill as the talk server's
function ledger(months = {}) {
  const kept = new Map(Object.entries(months)), b = { asked: 0, kept };
  b.spent = async (month) => { b.asked++; return kept.get(month) ?? 0; };
  b.add = async (month, cost) => { const total = (kept.get(month) ?? 0) + cost; kept.set(month, total); return total; };
  return b;
}
const NOW = Date.UTC(2026, 10, 5, 6, 1);
function decide({ up = upstream(), bill = ledger(), phoneOk = true, placeOk = true, ...over } = {}) {
  const t = { now: NOW }, later = [], limited = [];
  const handle = createDecide({
    fetch: up.fetch, key: 'sk-test', cap: 5, origins: ['https://chunky.ms', 'http://localhost:8000'], clock: () => t.now, bill, log: () => {},
    phoneLimit: async (k) => { limited.push(['phone', k]); return phoneOk; }, placeLimit: async (k) => { limited.push(['place', k]); return placeOk; }, ...over,
  });
  const go = async (req = ask()) => { const res = await handle(req, (p) => later.push(p)); await Promise.all(later.splice(0)); return { res, json: res.status === 200 ? await res.json() : null }; };
  return { go, up, bill, t, limited };
}

test('a good ask gets Jev\'s three answers: a shape off the menu, a place by its number, and whether it\'s worth it today', async () => {
  const { go, up, bill, limited } = decide();
  const { res, json } = await go();
  assert.equal(res.status, 200);
  assert.deepEqual(json, { shape: 'fishing', place: 1, worth: true });
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://chunky.ms');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  // and it came out of the same bill as the talk server's, by the phone's limit and the address's
  assert.deepEqual(limited, [['phone', PHONE], ['place', '203.0.113.7']]);
  assert.equal(bill.kept.get(monthOf(NOW)), 0.00001);
  assert.equal(up.calls.length, 1);
});

test('what goes to Jev is the pinned model, what the game said, and the three questions, and nothing of the phone\'s', async () => {
  const { go, up } = decide();
  await go();
  const [{ url, init, body: sent }] = up.calls;
  assert.equal(url, DECISIONS_URL);
  assert.equal(DECISIONS_URL, 'https://openrouter.ai/api/alpha/decisions');
  assert.equal(init.headers.Authorization, 'Bearer sk-test');
  assert.equal(sent.model, 'typesafe/jev-1.14', 'pinned, since the API is alpha');
  assert.equal(sent.state, STATE);
  assert.deepEqual(sent.questions, questionsFor({ shapes: ['fishing'], places: PLACES }));
  assert.deepEqual(Object.keys(sent.questions.shape.criteria), ['fishing']);
  assert.deepEqual(sent.questions.place.criteria, { 0: PLACES[0], 1: PLACES[1] });
  assert.equal(sent.questions.worth.type, 'noul');
  assert.equal(JSON.stringify(sent).includes(PHONE), false, 'the phone\'s key never goes');
});

test('no is a no, and a yes is Jev at least half sure', async () => {
  for (const [yes, worth] of [[0.5, true], [0.49, false], [0.02, false], [1, true]]) {
    const { go } = decide({ up: upstream({ json: decided({ yes }) }) });
    assert.equal((await go()).json.worth, worth, String(yes));
  }
});

test('an ask that breaks a limit is bad, and Jev\'s never asked', async () => {
  const { go, up } = decide();
  const bad = [
    'not words at all', JSON.stringify([]), body({ phone: 'short' }), body({ phone: undefined }),
    body({ state: '' }), body({ state: 'x'.repeat(DECIDE.state + 1) }), body({ state: 42 }),
    body({ shapes: [] }), body({ shapes: ['Fishing'] }), body({ shapes: ['fishing', 'fishing'] }), body({ shapes: Array.from({ length: DECIDE.shapes + 1 }, (_, i) => `shape-${'abcdefghij'[i]}`) }),
    body({ shapes: 'fishing' }), body({ places: [] }), body({ places: [''] }), body({ places: ['x'.repeat(DECIDE.place + 1)] }),
    body({ places: Array.from({ length: DECIDE.places + 1 }, (_, i) => `pond ${i}`) }), body({ places: [7] }),
  ];
  for (const text of bad) assert.deepEqual((await go(ask(text))).json, { quiet: 'bad' }, text.slice(0, 80));
  assert.deepEqual((await go(ask(body(), { method: 'GET' }))).json, { quiet: 'bad' });
  assert.deepEqual((await go(ask('x'.repeat(DECIDE.body + 1)))).json, { quiet: 'bad' });
  assert.equal(up.calls.length, 0);
  assert.ok(readDecide(body()));
});

test('an answer that isn\'t one the game offered is off, so nothing Jev says can name a place that isn\'t on the list', async () => {
  const off = [
    decided({ shape: 'swimming' }), decided({ place: '2' }), decided({ place: '-1' }), decided({ place: 'the river' }), decided({ place: '1.5' }),
    { ...decided(), answers: { ...decided().answers, worth: { type: 'refusal' } } },
    { ...decided(), answers: { ...decided().answers, shape: { type: 'refusal' } } },
    { answers: {} }, {},
  ];
  for (const json of off) {
    const { go } = decide({ up: upstream({ json }) });
    assert.deepEqual((await go()).json, { quiet: 'off' }, JSON.stringify(json).slice(0, 120));
  }
  assert.equal(answerOf(decided(), { shapes: ['fishing'], places: PLACES }).place, 1);
});

test('with no key, OpenRouter turning it down or not there, it\'s off; out of money is cap, and the month\'s cap is kept to', async () => {
  assert.deepEqual((await decide({ key: '' }).go()).json, { quiet: 'off' });
  for (const up of [upstream({ status: 500, json: { error: { code: 500, message: 'Internal Server Error' } } }), upstream({ fail: true }), upstream({ status: 429, json: { error: { code: 429, message: 'Rate limit exceeded' } } })]) {
    assert.deepEqual((await decide({ up }).go()).json, { quiet: 'off' });
  }
  const broke = decide({ up: upstream({ status: 402, json: { error: { code: 402, message: 'Insufficient credits' } } }) });
  assert.deepEqual((await broke.go()).json, { quiet: 'cap' });
  assert.deepEqual((await broke.go()).json, { quiet: 'cap' });
  assert.equal(broke.up.calls.length, 1, 'and it isn\'t asked again for a minute');
  const spent = decide({ bill: ledger({ [monthOf(NOW)]: 5 }) });
  assert.deepEqual((await spent.go()).json, { quiet: 'cap' });
  assert.equal(spent.up.calls.length, 0);
});

test('too fast by the phone or the address is fast, and an answer that doesn\'t come in time is slow', async () => {
  assert.deepEqual((await decide({ phoneOk: false }).go()).json, { quiet: 'fast' });
  assert.deepEqual((await decide({ placeOk: false }).go()).json, { quiet: 'fast' });
  const late = decide({ up: upstream({ hang: true }), wait: 20 });
  assert.deepEqual((await late.go()).json, { quiet: 'slow' });
  assert.ok(late.bill.kept.get(monthOf(NOW)) > 0, 'and what it may have cost goes on the bill anyway');
  assert.ok(DECIDE.wait >= 5000 && DECIDE.wait <= 10000);
});

test('what it cost is what OpenRouter says, or Jev\'s price for what went in', async () => {
  const said = decide({ up: upstream({ json: decided({ cost: 0.00003 }) }) });
  await said.go();
  assert.equal(said.bill.kept.get(monthOf(NOW)), 0.00003);
  const unsaid = decide({ up: upstream({ json: decided({ cost: null }) }) });
  await unsaid.go();
  assert.equal(unsaid.bill.kept.get(monthOf(NOW)), (260 * JEV.in) / 1e6);
});

test('only the game\'s own pages are answered, and one that asks first is told it may', async () => {
  const { go, up } = decide();
  const away = await go(ask(body(), { origin: 'https://elsewhere.example' }));
  assert.equal(away.res.status, 403);
  assert.equal(away.res.headers.get('access-control-allow-origin'), null);
  const first = await go(ask(undefined, { method: 'OPTIONS' }));
  assert.equal(first.res.status, 204);
  assert.equal(first.res.headers.get('access-control-allow-methods'), 'POST');
  assert.equal(up.calls.length, 0);
});
