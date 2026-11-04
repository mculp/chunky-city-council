// The characters' words (CHUNKY-107): what a phone may ask, what goes on to OpenRouter, and when it all goes quiet
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTalk, MODEL, FALLBACK, MODELS, TALK, OPENROUTER_URL, monthOf } from './talk.js';

const PHONE = 'a-phone-of-their-own-1234';
const SAID = [{ role: 'system', content: 'You are Coop.' }, { role: 'user', content: 'Hey, Coop.' }];
const body = (over = {}) => JSON.stringify({ phone: PHONE, messages: SAID, ...over });
const ask = (text = body(), { origin = 'https://chunky.ms', method = 'POST' } = {}) => new Request('https://talk.test/talk', {
  method, body: method === 'POST' ? text : undefined,
  headers: { 'Content-Type': 'text/plain', 'CF-Connecting-IP': '203.0.113.7', ...(origin && { Origin: origin }) },
});
const WORDS = '{"say":"Well, look who it is."}';
// OpenRouter, as far as these need it: it answers as it's told, or hangs until it's given up on
function upstream({ status = 200, json = { choices: [{ message: { content: WORDS } }], usage: { cost: 0.0002, prompt_tokens: 900, completion_tokens: 30 } }, hang = false, fail = false } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    if (fail) throw new TypeError('fetch failed');
    if (hang) return new Promise((_, no) => init.signal.addEventListener('abort', () => no(new DOMException('gave up', 'AbortError'))));
    return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, calls };
}
// OpenRouter answering each model its own way: words, or a status and what it said, after a while, or not until it's given up on.
// Each call keeps which model it was for and whether it was given up on.
function voices(by = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const { model } = JSON.parse(init.body), how = by[model] ?? {}, call = { model, stopped: false };
    calls.push(call);
    init.signal.addEventListener('abort', () => { call.stopped = true; });
    if (how.hang) return new Promise((_, no) => init.signal.addEventListener('abort', () => no(new DOMException('gave up', 'AbortError'))));
    if (how.after) await new Promise((r) => setTimeout(r, how.after));
    const json = how.json ?? { choices: [{ message: { content: WORDS } }], usage: { cost: how.cost ?? 0.0002 } };
    return new Response(JSON.stringify(json), { status: how.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, calls };
}
// what the month's cost, kept as the Durable Object keeps it
function ledger(months = {}) {
  const kept = new Map(Object.entries(months)), b = { asked: 0, kept };
  b.spent = async (month) => { b.asked++; return kept.get(month) ?? 0; };
  b.add = async (month, cost) => { const total = (kept.get(month) ?? 0) + cost; kept.set(month, total); return total; };
  return b;
}
const NOW = Date.UTC(2026, 10, 4, 5, 0);
function talk({ up = upstream(), bill = ledger(), phoneOk = true, placeOk = true, ...over } = {}) {
  const t = { now: NOW }, later = [], limited = [];
  const handle = createTalk({
    fetch: up.fetch, key: 'sk-test', cap: 5, origins: ['https://chunky.ms', 'http://localhost:8000'], clock: () => t.now, bill, log: () => {},
    phoneLimit: async (k) => { limited.push(['phone', k]); return phoneOk; }, placeLimit: async (k) => { limited.push(['place', k]); return placeOk; }, ...over,
  });
  // each answer, once whatever it left to finish has finished
  const go = async (req = ask()) => { const res = await handle(req, (p) => later.push(p)); await Promise.all(later.splice(0)); return { res, json: res.status === 200 ? await res.json() : null }; };
  return { go, up, bill, t, limited };
}

test('a good ask gets the model\'s words back as they came, with what they cost and which model said them', async () => {
  const { go } = talk();
  const { res, json } = await go();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://chunky.ms');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(json, { reply: WORDS, model: MODEL, cost: 0.0002, ms: 0 });
});

test('what goes to OpenRouter is the owner\'s key, a model off the list, the messages and nothing else of the ask, and short', async () => {
  const { go, up } = talk();
  await go(ask(body({ messages: SAID.map((m) => ({ ...m, name: 'dropped' })), extra: 'dropped' })));
  const [{ url, init, body: sent }] = up.calls;
  assert.equal(url, OPENROUTER_URL);
  assert.equal(init.headers.Authorization, 'Bearer sk-test');
  assert.deepEqual(Object.keys(init.headers).sort(), ['Authorization', 'Content-Type'], 'nothing that would list the game on OpenRouter');
  assert.equal(sent.model, MODEL);
  assert.deepEqual(sent.messages, SAID);
  assert.equal(sent.max_tokens, TALK.tokens);
  assert.deepEqual(sent.reasoning, { enabled: false });
  assert.deepEqual(sent.provider, { sort: 'latency', data_collection: 'deny' });
  assert.deepEqual(sent.response_format, { type: 'json_object' });
  assert.equal(sent.stream, undefined);
});

test('his turns and theirs go on just as the game sent them, in turn and ending on his, since some models won\'t take any other order', async () => {
  // what src/talk.js sends once he's answered: what they're told, him walking up, their line and his answer
  const turns = [SAID[0], { role: 'user', content: 'He walks up.' }, { role: 'assistant', content: WORDS }, { role: 'user', content: 'Doing alright, Coop?' }];
  const { go, up } = talk();
  await go(ask(body({ messages: turns })));
  assert.deepEqual(up.calls[0].body.messages, turns);
});

test('the page can only pick a model that\'s on the list, for trying them side by side', async () => {
  const other = Object.keys(MODELS)[1], { go, up } = talk();
  assert.equal((await go(ask(body({ model: other })))).json.model, other);
  assert.equal(up.calls[0].body.model, other);
  for (const model of ['openai/gpt-6', 'constructor', 7]) assert.equal((await go(ask(body({ model })))).json.quiet, 'bad', String(model));
  assert.equal(up.calls.length, 1);
});

// The Creative Director's pick from tools/talk-trial.mjs, and what answers when it can't
test('with nothing named, the Creative Director\'s pick is asked, and nothing else once it answers', async () => {
  const { go, up } = talk({ up: voices() });
  assert.equal((await go()).json.model, MODEL);
  assert.deepEqual(up.calls.map((c) => c.model), [MODEL]);
  assert.notEqual(FALLBACK, MODEL);
});

test('when the pick\'s turned down, the fallback\'s asked straight away and its words are the line, with nothing charged for the other', async () => {
  const up = voices({ [MODEL]: { status: 400, json: { error: { code: 400, message: 'Reasoning is mandatory' } } }, [FALLBACK]: { cost: 0.0003 } });
  const { go, bill } = talk({ up, hedge: 5000, wait: 10000 });
  const began = performance.now(), { json } = await go();
  assert.ok(performance.now() - began < 1000, 'not left until it would have been asked alongside');
  assert.deepEqual(json, { reply: WORDS, model: FALLBACK, cost: 0.0003, ms: 0 });
  assert.equal(bill.kept.get('2026-11'), 0.0003);
});

test('when the pick\'s slow, the fallback\'s asked alongside it, and the first to answer has the line', async () => {
  const up = voices({ [MODEL]: { hang: true }, [FALLBACK]: { cost: 0.0003 } });
  const { go, bill } = talk({ up, hedge: 20, wait: 1000 });
  assert.equal((await go()).json.model, FALLBACK);
  assert.deepEqual(up.calls.map((c) => [c.model, c.stopped]), [[MODEL, true], [FALLBACK, false]], 'the pick given up on once there\'s a line');
  assert.ok(bill.kept.get('2026-11') > 0.0003, 'with what it may still cost on the bill');
});

test('the pick still has the line when it answers before the fallback asked alongside it', async () => {
  const up = voices({ [MODEL]: { after: 60 }, [FALLBACK]: { hang: true } });
  const { go } = talk({ up, hedge: 20, wait: 1000 });
  assert.equal((await go()).json.model, MODEL);
  assert.deepEqual(up.calls.map((c) => [c.model, c.stopped]), [[MODEL, false], [FALLBACK, true]]);
});

test('when neither answers in time it\'s slow, and both count against the month', async () => {
  const up = voices({ [MODEL]: { hang: true }, [FALLBACK]: { hang: true } });
  const { go, bill } = talk({ up, hedge: 10, wait: 60 });
  assert.deepEqual((await go()).json, { quiet: 'slow' });
  const chars = SAID.reduce((n, m) => n + m.content.length, 0), may = (m) => (MODELS[m].in * chars / 4 + MODELS[m].out * TALK.tokens) / 1e6;
  assert.ok(Math.abs(bill.kept.get('2026-11') - may(MODEL) - may(FALLBACK)) < 1e-12);
});

test('a model the page names is asked alone, with nothing to fall back on, so trying them side by side tries just that one', async () => {
  const named = Object.keys(MODELS).find((m) => m !== MODEL && m !== FALLBACK);
  for (const how of [{ status: 500, json: { error: { code: 500 } } }, { hang: true }]) {
    const up = voices({ [named]: how }), { go } = talk({ up, hedge: 10, wait: 60 });
    await go(ask(body({ model: named })));
    assert.deepEqual(up.calls.map((c) => c.model), [named], JSON.stringify(how));
  }
});

test('a key that\'s out of money is out for every model, so the fallback isn\'t asked', async () => {
  const up = voices({ [MODEL]: { status: 402, json: { error: { message: 'Insufficient credits' } } } });
  const { go } = talk({ up, hedge: 5000, wait: 10000 });
  assert.equal((await go()).json.quiet, 'cap');
  assert.deepEqual(up.calls.map((c) => c.model), [MODEL]);
});

test('the log says how OpenRouter turned a line down, by its status, code and provider, and never what was said or the key', async () => {
  const logged = [], up = voices({
    [MODEL]: { status: 403, json: { error: { code: 403, message: 'Your input was flagged: Hey, Coop.', metadata: { flagged_input: 'Hey, Coop.', provider_name: 'DeepInfra' } } } },
    [FALLBACK]: { json: { error: { code: 502, message: 'Provider returned error', metadata: { raw: 'Hey, Coop.', provider_name: 'Parasail' } } } },
  });
  assert.equal((await talk({ up, log: (line) => logged.push(line) }).go()).json.quiet, 'off');
  assert.equal(logged.length, 2);
  assert.ok(logged[0].includes(MODEL) && /403/.test(logged[0]) && /DeepInfra/.test(logged[0]), logged[0]);
  assert.ok(logged[1].includes(FALLBACK) && /502/.test(logged[1]) && /Parasail/.test(logged[1]), logged[1]);
  for (const line of logged) assert.doesNotMatch(line, /Coop|flagged|Provider returned|sk-test/);
});

test('when the limits or the bill can\'t be asked, the log says which went wrong', async () => {
  const logged = [], broken = ledger();
  broken.spent = async () => { throw new Error('Durable Object reset because its code was updated.'); };
  await talk({ bill: broken, log: (line) => logged.push(line) }).go();
  assert.match(logged.join('\n'), /bill.*Durable Object reset/);
});

test('an ask that breaks any limit is turned away and never reaches OpenRouter', async () => {
  const many = Array.from({ length: TALK.messages + 1 }, () => ({ role: 'user', content: 'hi' }));
  const bad = {
    'not JSON': 'hello', 'a list': '[]', 'no phone': JSON.stringify({ messages: SAID }), 'a short phone': body({ phone: 'short' }),
    'no messages': body({ messages: [] }), 'too many messages': body({ messages: many }),
    'too many words': body({ messages: [{ role: 'user', content: 'x'.repeat(TALK.chars + 1) }] }),
    'a role of its own': body({ messages: [{ role: 'tool', content: 'hi' }] }), 'words that aren\'t words': body({ messages: [{ role: 'user', content: 7 }] }),
    'too big, however it\'s padded': body() + ' '.repeat(TALK.body),
  };
  const { go, up } = talk();
  for (const [why, text] of Object.entries(bad)) assert.equal((await go(ask(text))).json?.quiet, 'bad', why);
  assert.equal((await go(ask(undefined, { method: 'GET' }))).json.quiet, 'bad', 'a GET');
  assert.equal(up.calls.length, 0);
});

test('a page on another site is turned away, a tool with no page is answered, and a page that asks first is told it may', async () => {
  const { go, up } = talk();
  const away = await go(ask(body(), { origin: 'https://elsewhere.example' }));
  assert.equal(away.res.status, 403); assert.equal(away.res.headers.get('access-control-allow-origin'), null);
  assert.equal(up.calls.length, 0);
  const tool = await go(ask(body(), { origin: null }));
  assert.equal(tool.json.reply, WORDS); assert.equal(tool.res.headers.get('access-control-allow-origin'), null);
  const first = await go(ask(undefined, { origin: 'http://localhost:8000', method: 'OPTIONS' }));
  assert.equal(first.res.status, 204);
  assert.equal(first.res.headers.get('access-control-allow-origin'), 'http://localhost:8000');
  assert.match(first.res.headers.get('access-control-allow-methods'), /POST/);
});

test('with no key it\'s quiet, and asks nobody', async () => {
  const { go, up, bill } = talk({ key: '' });
  assert.equal((await go()).json.quiet, 'off');
  assert.equal(up.calls.length, 0); assert.equal(bill.asked, 0);
});

test('a phone, or a place, that asks too fast is told so, by its key and its address, and nothing\'s spent', async () => {
  for (const which of ['phoneOk', 'placeOk']) {
    const { go, up, bill, limited } = talk({ [which]: false });
    assert.equal((await go()).json.quiet, 'fast', which);
    assert.deepEqual(limited.sort(), [['phone', PHONE], ['place', '203.0.113.7']]);
    assert.equal(up.calls.length, 0); assert.equal(bill.asked, 0);
  }
});

test('once the month\'s money is spent, it\'s quiet until the 1st, and nothing more\'s asked of OpenRouter', async () => {
  const { go, up, bill, t } = talk({ bill: ledger({ '2026-11': 4.9999 }) });
  assert.equal((await go()).json.reply, WORDS);
  assert.equal((await go()).json.quiet, 'cap');
  t.now = Date.UTC(2026, 10, 30, 23, 59);
  assert.equal((await go()).json.quiet, 'cap');
  assert.equal(up.calls.length, 1);
  t.now = Date.UTC(2026, 11, 1, 0, 0, 1);
  assert.equal((await go()).json.reply, WORDS);
  assert.equal(bill.kept.get('2026-12'), 0.0002);
});

test('a cap that isn\'t a sum of money is no money at all, never no limit', async () => {
  for (const cap of [NaN, -1, Infinity, '5']) {
    const { go, up } = talk({ cap });
    assert.equal((await go()).json.quiet, 'cap', String(cap));
    assert.equal(up.calls.length, 0);
  }
});

test('the month goes by UTC, as OpenRouter\'s does', () => {
  assert.equal(monthOf(Date.UTC(2026, 10, 30, 23, 59, 59)), '2026-11');
  assert.equal(monthOf(Date.UTC(2026, 11, 1)), '2026-12');
});

test('what\'s been spent is asked at most once a minute, and every line\'s cost is added to it', async () => {
  const { go, bill, t } = talk();
  await go(); await go();
  assert.equal(bill.asked, 1);
  assert.equal(bill.kept.get('2026-11'), 0.0004);
  t.now += 61000; await go();
  assert.equal(bill.asked, 2);
});

test('a reply that doesn\'t say what it cost is worked out from its tokens and the model\'s price', async () => {
  const { go, bill } = talk({ up: upstream({ json: { choices: [{ message: { content: WORDS } }], usage: { prompt_tokens: 1000, completion_tokens: 50 } } }) });
  const { json } = await go(), { in: inPrice, out: outPrice } = MODELS[MODEL];
  const cost = (1000 * inPrice + 50 * outPrice) / 1e6;
  assert.ok(Math.abs(json.cost - cost) < 1e-12, `${json.cost} against ${cost}`);
  assert.ok(Math.abs(bill.kept.get('2026-11') - cost) < 1e-12);
});

test('a model that\'s slow, broken, out of money or down is quiet, so the game says its written lines', async () => {
  const cases = [
    ['slow', { hang: true }], ['cap', { status: 402, json: { error: { message: 'Insufficient credits' } } }],
    ['cap', { status: 403, json: { error: { message: 'Key limit exceeded' } } }], ['off', { status: 403, json: { error: { message: 'Input was flagged' } } }],
    ['off', { status: 500, json: { error: { message: 'Internal Server Error' } } }], ['off', { fail: true }], ['off', { json: { choices: [] } }],
    ['off', { json: { error: { message: 'Provider returned error' } } }], ['off', { json: { choices: [{ message: { content: '  ' } }] } }],
  ];
  for (const [quiet, how] of cases) {
    const { go } = talk({ up: upstream(how), wait: 30 });
    const { res, json } = await go();
    assert.equal(res.status, 200); assert.deepEqual(json, { quiet }, JSON.stringify(how));
  }
});

test('a line given up on still counts against the month, since OpenRouter may charge for it', async () => {
  const { go, bill } = talk({ up: upstream({ hang: true }), wait: 30 });
  await go();
  assert.ok(bill.kept.get('2026-11') > 0);
});

test('once OpenRouter says the key\'s out of money, it isn\'t asked again for a minute', async () => {
  const { go, up, t } = talk({ up: upstream({ status: 402, json: { error: { message: 'Key limit exceeded' } } }) });
  await go(); await go();
  assert.equal(up.calls.length, 1);
  t.now += 61000; await go();
  assert.equal(up.calls.length, 2);
});

test('if what\'s been spent can\'t be found out, or the limits can\'t be asked, it\'s quiet rather than spending blind', async () => {
  const broken = ledger(); broken.spent = async () => { throw new Error('gone'); };
  assert.equal((await talk({ bill: broken }).go()).json.quiet, 'off');
  assert.equal((await talk({ phoneLimit: async () => { throw new Error('gone'); } }).go()).json.quiet, 'off');
});
