import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { LIMITS, checkReply, inDistress, changesNothing, messagesFor, talkUrl, createTalk, whyNot, wordHash, formsOf, sameLine } from './talk.js';
import { createPeople } from './people.js';
import { TALK_URL, PHONE_KEY } from './net.js';

const DATA = JSON.parse(readFileSync(new URL('../data/talk.json', import.meta.url), 'utf8'));
const CAST = JSON.parse(readFileSync(new URL('../data/cast.json', import.meta.url), 'utf8'));
const reply = (o) => JSON.stringify(o);
const say = (text, more = {}) => reply({ say: text, mood: 'plain', do: [], remember: '', replies: [], ...more });
const check = (text, who = 'coop', said = []) => checkReply(text, { data: DATA, who, said });
function store() { const kept = {}; return { kept, getItem: (k) => kept[k] ?? null, setItem: (k, v) => { kept[k] = String(v); }, removeItem: (k) => { delete kept[k]; } }; }

test('everyone who talks has who they are, where, how they talk, what they have said and what they can always say', () => {
  for (const who of DATA.who) {
    const p = DATA.people[who];
    assert.ok(p, who);
    for (const k of ['name', 'sheet', 'place', 'voice']) assert.ok(typeof p[k] === 'string' && p[k].length > (k === 'name' ? 1 : 5), `${who} ${k}`);
    assert.ok(p.samples.length >= 3 && p.spare.length >= 1, who);
    for (const line of [...p.samples, ...p.spare]) assert.ok(line.split(' ').length < LIMITS.words, line);
  }
  assert.ok(!DATA.who.includes('robby'), 'Robby never says more than his one line');
  assert.equal(DATA.blocked.length, new Set(DATA.blocked).size);
  for (const h of DATA.blocked) assert.match(h, /^[0-9a-f]{8}$/);
});

test('the game only asks from pages the talk server answers', () => {
  const kept = readFileSync(new URL('../server/wrangler.jsonc', import.meta.url), 'utf8').match(/"ORIGINS":\s*"([^"]*)"/)[1].split(',');
  for (const page of DATA.pages) assert.ok(kept.includes(page), page);
  assert.equal(talkUrl(DATA, { origin: 'https://chunky.ms' }), TALK_URL);
  assert.equal(talkUrl(DATA, { origin: 'https://someone.else' }), null);
  assert.equal(talkUrl(DATA, { search: '?test&talk=http://localhost:4123/talk', origin: 'https://someone.else' }), 'http://localhost:4123/talk');
  assert.equal(talkUrl(DATA, { search: '?talk=https://someone.else/talk', origin: 'https://chunky.ms' }), null, 'a link can only point it at this machine');
});

test('a good line comes through with its answers, its note and its mood', () => {
  const r = check(reply({ say: 'Pumps are dry, river boy. Dominoes are not.', mood: 'amused', do: [], remember: 'Came by after dark again.', replies: ['Deal me in.', 'Maybe later.', 'What are the stakes?'] }));
  assert.deepEqual(r, { say: 'Pumps are dry, river boy. Dominoes are not.', mood: 'amused', do: [], remember: 'Came by after dark again.', replies: ['Deal me in.', 'Maybe later.', 'What are the stakes?'], thrown: 0 });
});

test('the checker lets none of the bad replies through: an unknown effect, 60 words, an address', () => {
  // what it does that isn't how he feels about him, by a point, is thrown away, and the line can still be said
  const odd = check(say('Well now.', { do: [{ set: 'paid' }, { beans: 5 }, { item: 'bag', by: 1 }, { pantry: true }, { meter: 'bobby.trust', by: 1 }, { meter: 'coop.trust', by: 3 }, { meter: 'coop.debt', by: 1 }, { meter: 'trust', by: 1, when: ['metCoop'] }, 'beans', { sell: 'jerky', price: 2 }] }));
  assert.deepEqual(odd.do, []);
  assert.equal(odd.thrown, 10);
  const one = check(say('Well now.', { do: [{ meter: 'trust', by: -1 }, { meter: 'coop.trust', by: 1 }, { meter: 'coop.fear', by: 1 }] }));
  assert.deepEqual(one.do, [{ meter: 'coop.trust', by: -1 }, { meter: 'coop.fear', by: 1 }], 'once a line for each');
  assert.equal(one.thrown, 1);
  // sixty words
  assert.equal(check(say(Array.from({ length: 60 }, (_, i) => `word${i}`).join(' '))).bad, 'too long');
  assert.equal(check(say(Array.from({ length: 29 }, () => 'yes').join(' '))).bad, undefined);
  assert.equal(check(say(Array.from({ length: 30 }, () => 'yes').join(' '))).bad, 'too long');
  // an address, however it's written
  for (const line of ['Come by 412 Church St and holler.', 'Mail it to PO Box 12, river boy.', 'Bring it to 4521 Hwy 80 by morning.', 'Zip is 39323, baby.', 'Call 601-555-0142 if you see her.', 'Look it up at www.chunky.ms tonight.']) {
    assert.equal(check(say(line)).bad, 'addresses', line);
  }
  for (const line of ['Take 80 to Church St and hang a left.', 'Two cans, by the way.', 'Highway 80 runs both ways.']) assert.equal(check(say(line)).bad, undefined, line);
});

test('nothing from outside Chunky, nothing about how anyone quit, nobody real, no songs and nothing past PG-13', () => {
  const bad = (line, who = 'coop') => check(say(line), who).bad;
  assert.equal(bad('As an AI, I cannot sell you jerky.'), 'outside');
  assert.equal(bad('Them zombies by the pumps again.'), 'outside');
  assert.equal(bad('Saw it on the internet, sugar.', 'bobby'), 'outside');
  assert.equal(bad('He hanged himself out back.'), 'never');
  assert.equal(bad('Pills ain\'t the answer, baby.', 'bobby'), 'never');
  assert.equal(bad('Robby was by asking for flies.'), 'real');
  assert.equal(bad('Toni brought another frog round.', 'bobby'), 'real');
  assert.equal(bad('♪ Down by the river ♪', 'rocky'), 'lyrics');
  assert.equal(bad('Tonight it is, river boy.'), undefined, 'a name inside another word is fine');
  // a word that isn't PG-13, and with its endings, and spelled out long
  const data = { ...DATA, blocked: [wordHash('blorp')] };
  for (const line of ['Well blorp.', 'Quit blorping around.', 'You blorped it.', 'Blooorp off.']) assert.equal(whyNot(line, data), 'pg13', line);
  assert.equal(whyNot('Blorpy is fine as a name.', { ...DATA, blocked: [wordHash('blorpy') + 'x'] }), '');
  assert.equal(bad(`What the ${'f'}${'uck'}, river boy.`), 'pg13');
  assert.equal(bad(`That's ${'sh'}${'itty'} beans.`), 'pg13');
  assert.equal(bad('Pass the cumin and the spices, river boy.'), undefined);
  assert.ok(formsOf('bitches').has('bitch') && formsOf('shitty').has('shit') && !formsOf('spices').has('spic'));
});

test('nothing they have said to him before, or any of their written lines, is new', () => {
  assert.equal(check(say('Well, look who it is!'), 'coop', ['Well, look who it is.']).bad, 'said before');
  assert.equal(check(say('What you need, river boy?')).bad, 'said before', "one of Coop's written lines");
  assert.equal(check(say('Moccasin. I named her Bobby. Do not tell Miss Bobby, now.'), 'rocky').bad, 'said before', 'near enough');
  assert.ok(sameLine('Beans ain\'t free, river boy, not today.', 'Beans ain\'t free river boy not today'));
  assert.ok(!sameLine('Beans ain\'t free.', 'Gas ain\'t free.'));
});

test('what comes back is tidied and checked a piece at a time, and only the line itself can send them back to the written one', () => {
  assert.equal(check('not json').bad, 'unreadable');
  assert.equal(check('```json\n{"say": "Evening, river boy."}\n```').say, 'Evening, river boy.');
  assert.equal(check('{"say": "Coop: \\"Evening, river boy.\\""}').say, 'Evening, river boy.');
  assert.equal(check('{"say": "Evening, goin\'"}').say, "Evening, goin'");
  assert.equal(check('{"say": "Evening 🙂 river boy."}').say, 'Evening river boy.');
  assert.equal(check('{"say": ""}').bad, 'nothing said');
  assert.deepEqual(check('{"care": true}'), { care: true });
  const r = check(reply({ say: 'Evening.', mood: 'furious', remember: 'He lives at 412 Church St.', replies: ['Later.', 'Sure.', 'sure', 'This answer is far too long to fit on any button anybody would want to press', 'Robby says hey.', 'Fine.', 'Okay.', 'One more.'] }));
  assert.equal(r.mood, 'plain');
  assert.equal(r.remember, '');
  assert.deepEqual(r.replies, ['Sure.', 'Fine.', 'Okay.']);
});

test('what he types that sounds like he is really not okay is caught on its own, and the game\'s own talk isn\'t', () => {
  for (const t of ['I want to kill myself', 'honestly i\'m not okay', 'i wanna die', 'I don’t want to be alive', 'nobody would miss me', 'I can\'t do this anymore', 'thinking about hurting myself', 'Im not ok', 'better off dead', 'kms', 'I hate my life']) assert.ok(inDistress(t, DATA), t);
  for (const t of ['I quit', 'he quit back in the spring', 'kill the lights', 'this game is killing me', "I'm going to die out here", 'I can\'t go on that bridge', 'jump the fence', 'end of the road', "I'm fine", 'ok', 'how do I kill them'] ) assert.ok(!inDistress(t, DATA), t);
});

test('only a written line that would change nothing can be said in new words instead', () => {
  const people = createPeople(CAST), flags = {}, played = { flags, items: {}, beans: 0, addBeans() {}, pantry: 0, fromPantry() {} };
  const nothing = (id) => { const line = people.line(id, played); return changesNothing(line.do, { check: (when) => people.check(when, played), flags }); };
  assert.equal(nothing('rocky'), false, 'meeting Rocky the first time');
  flags.metRocky = true;
  assert.equal(nothing('rocky'), true, 'and every time after');
  assert.equal(nothing('coop'), false, 'meeting Coop');
  flags.metCoop = true;
  assert.equal(nothing('coop'), true);
  flags.delivered = true;
  assert.equal(nothing('coop'), false, 'being paid');
});

test('one ask is everything about them and him, under the server\'s limit, however much they remember', () => {
  const mind = { visits: 2, notes: [{ about: 'me', text: 'Liked the chain.', at: 1 }, { about: 'someone', text: 'Not him.', at: 2 }], said: ['First thing.', 'Second thing.'] };
  const [system, user] = messagesFor({ data: DATA, who: 'coop', here: { beans: 1, carrying: ['a gas can', '2 bottles'], happened: ['He swept Miss Bobby\'s steps today.'], tonight: DATA.tonight }, mind, me: 'me' });
  assert.equal(system.role, 'system');
  for (const bit of ['You are Coop.', 'river boy', 'at your gas station on US 80', 'He\'s been by to talk to you 2 times before.', 'He has 1 can of beans, and he\'s carrying a gas can and 2 bottles.', 'swept', DATA.tonight, '- Liked the chain.', '- Second thing.', '{"care": true}']) assert.ok(system.content.includes(bit), bit);
  assert.ok(!system.content.includes('Not him.'), 'notes about someone else stay out');
  assert.deepEqual(user, { role: 'user', content: DATA.opener });
  const turns = [{ role: 'user', content: 'He says: "Hey."' }, { role: 'assistant', content: '{"say":"Hey yourself."}' }];
  const more = messagesFor({ data: DATA, who: 'coop', mind, turns, heard: 'How is business?', me: 'me' });
  assert.deepEqual(more.slice(1), [...turns, { role: 'user', content: 'He says: "How is business?"' }]);
  const full = { visits: 40, notes: Array.from({ length: 12 }, (_, i) => ({ about: 'me', text: `Note ${i} ${'x'.repeat(120)}`, at: i })), said: Array.from({ length: 24 }, (_, i) => `Line ${i} ${'y'.repeat(190)}`) };
  const big = messagesFor({ data: DATA, who: 'bobby', mind: full, turns: Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'z'.repeat(150) })), heard: 'q'.repeat(LIMITS.typed), me: 'me' });
  assert.ok(big.reduce((n, m) => n + m.content.length, 0) <= LIMITS.ask);
  assert.ok(big.length <= 24);
  assert.ok(big[0].content.includes('Note 11'), 'the newest notes are the last to go');
  assert.ok(!big[0].content.includes('Line 13 '), 'what they said goes first, oldest first');
});

test('the talk server is asked with text, a phone that keeps its key, and everything the checker needs to see', async () => {
  const kept = store(), asked = [];
  const fetch = async (url, opts) => { asked.push({ url, opts }); return { json: async () => ({ reply: say('Evening, river boy. The pumps are as dry as the jokes.'), model: 'm', ms: 640 }) }; };
  const talk = createTalk({ data: DATA, store: kept, fetch });
  assert.deepEqual(await talk.ask('coop', {}), { quiet: 'rest' }, 'not until it has been told where');
  assert.equal(asked.length, 0);
  talk.on('http://localhost:1/talk');
  const got = await talk.ask('coop', { here: { beans: 2 } });
  assert.equal(got.reply.say, 'Evening, river boy. The pumps are as dry as the jokes.');
  assert.equal(asked[0].opts.headers['Content-Type'], 'text/plain');
  const body = JSON.parse(asked[0].opts.body);
  assert.match(body.phone, PHONE_KEY);
  assert.equal(body.phone, kept.kept['chunky.talk.phone']);
  assert.equal(body.messages.at(-1).content, DATA.opener);
  assert.deepEqual(await talk.ask('robby', {}), { quiet: 'rest' }, 'Robby never');
  assert.equal(asked.length, 1);
});

test('when the server can\'t answer they go back to their written lines for a while, and a bad line is only that line', async () => {
  let clock = 0, answer = { quiet: 'cap' }, calls = 0;
  const fetch = async (url, { signal }) => {
    calls++;
    if (answer === 'throw') throw new TypeError('no');
    // as a browser's does, it only gives up when it's told to
    if (answer === 'hang') return new Promise((_, no) => signal.addEventListener('abort', () => no(new DOMException('stopped', 'AbortError'))));
    return { json: async () => answer };
  };
  const talk = createTalk({ data: DATA, fetch, now: () => clock });
  talk.on('http://localhost:1/talk');
  assert.deepEqual(await talk.ask('bobby', {}), { quiet: 'cap' });
  assert.equal(talk.ready(), false);
  clock += 3599e3; assert.equal(talk.ready(), false);
  clock += 2e3; assert.equal(talk.ready(), true, 'an hour, for the month\'s money');
  answer = { quiet: 'fast' };
  await talk.ask('bobby', {}); clock += 15e3; assert.equal(talk.ready(), true);
  answer = 'throw';
  assert.deepEqual(await talk.ask('bobby', {}), { quiet: 'off' }); clock += 299e3; assert.equal(talk.ready(), false); clock += 2e3;
  answer = { reply: say('Moccasin. I named her Bobby. Don\'t tell Miss Bobby.') };
  assert.deepEqual(await talk.ask('rocky', {}), { bad: 'said before' });
  assert.equal(talk.ready(), true, 'a line that does not pass doesn\'t stop the next one');
  answer = { reply: '{"care": true}' };
  assert.deepEqual((await talk.ask('rocky', { heard: 'what is even the point' })).reply, { care: true });
  // and one that takes too long
  answer = 'hang';
  const slow = talk.ask('rocky', { wait: 20 });
  await talk.settled();
  assert.deepEqual(await slow, { quiet: 'slow' });
  assert.equal(talk.ready(), false);
  assert.equal(calls, 6);
});

test('what they remember of him, and what they have said, is kept between sessions, the newest of it', () => {
  const kept = store();
  let talk = createTalk({ data: DATA, store: kept, fetch: async () => ({}) });
  for (let i = 0; i < 30; i++) talk.said('coop', `Line ${i}.`);
  talk.said('coop', 'Line 29.');
  for (let i = 0; i < 15; i++) talk.note('coop', `Note ${i}.`);
  talk.visited('coop'); talk.visited('coop');
  talk = createTalk({ data: DATA, store: kept, fetch: async () => ({}) });
  const m = talk.mind('coop');
  assert.equal(m.said.length, LIMITS.said); assert.equal(m.said[0], 'Line 6.'); assert.equal(m.said.at(-1), 'Line 29.');
  assert.equal(m.notes.length, LIMITS.notes); assert.equal(m.notes[0].text, 'Note 3.');
  assert.equal(m.notes[0].about, talk.me(), 'each note says which of him it is about');
  assert.equal(m.visits, 2);
  talk.forget();
  assert.deepEqual(createTalk({ data: DATA, store: kept, fetch: async () => ({}) }).mind('coop'), { notes: [], said: [], visits: 0 });
});
