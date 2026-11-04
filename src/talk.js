// The cast in their own words (CHUNKY-107). When he talks to Coop, Rocky or Miss Bobby and all they'd say is what they've said
// before, the game can ask a model for what they say instead, through the talk server, which holds the owner's key and the month's
// cap (server/talk.js). This is the game's side of it: what's sent, the checker every line the model sends back goes through before
// anything's shown, the 988 Lifeline, and what each of them remembers of him. There's no three.js or page in here, so node tests load
// it too. The words and the rules are in data/talk.json, and data/talk.md has the rest. Whenever the model can't answer, is slow or
// says something it shouldn't, they say their written lines, as they always have.
//
// In a town that's shared (CHUNKY-169) they talk to whoever's come by: the hero as the story has him, and anyone else by name and
// as "they", since nobody's said what anyone goes by. That's `as`, { name, hero }, and without it it's him, as it's always been.
import { TALK_URL, PHONE_KEY, makeKey } from './net.js';
import { NAME_MOST } from './names.js';
import { moveMeter } from './people.js';

export const LIMITS = {
  words: 30,        // a line's under this many words
  chars: 200,       // and this many letters, so that it fits the box
  answers: 3,       // his answers on the buttons, besides Later.
  answerWords: 12,  // each of them at most this many words
  noteWords: 16,    // and a note they keep about him
  notes: 12,        // the newest notes they keep
  said: 24,         // what they've said to him, kept so that it isn't said again
  sent: 10,         // how much of that goes with each ask
  turns: 8,         // and how much of this visit's talk
  ask: 5800,        // all of an ask's words, under the server's 6000
  wait: 3000,       // ms before the written line's said instead, a little over the server's own wait on the model
  typed: 160,       // what he can type, on a laptop
};
// Seconds they're left to their written lines, by why the server couldn't answer: it isn't working, the month's money is spent, this phone
// asked too soon, it took too long, or the game asked for something it shouldn't
const REST = { off: 300, cap: 3600, fast: 15, slow: 30, bad: 300 };

const blankMind = () => ({ notes: [], said: [], visits: 0 });
const FELT = ['trust', 'fear'];   // the meters a line can move, and so how they feel about whoever it is online

// How what's put to them says whoever's talking to them: each {word} in the rules and the lines below is said one way for him and the
// other for anyone else. His are what the story's always said, to the byte.
const FORMS = {
  him: { They: 'He', they: 'he', them: 'him', their: 'his', themselves: 'himself', "They've": "He's", "they're": "he's", have: 'has', are: 'is', say: 'says', walk: 'walks' },
  them: { They: 'They', they: 'they', them: 'them', their: 'their', themselves: 'themselves', "They've": "They've", "they're": "they're", have: 'have', are: 'are', say: 'say', walk: 'walk' },
};
const someoneElse = (as) => !!as && !as.hero;
const spoken = (text, as) => { const f = FORMS[someoneElse(as) ? 'them' : 'him']; return text.replace(/\{([\w']+)\}/g, (all, k) => f[k] ?? all); };
// A name's only ever a name, the player's own words and never anything to do: letters, numbers, spaces and the marks names have, and
// no longer than the town lets one be. It's put to them in quotes.
const nameOf = (as) => String(as?.name ?? '').replace(/[^\p{L}\p{N}' -]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MOST).trim() || 'Someone';
// who they're talking to, as it's put to them
const whoItIs = (data, as) => (someoneElse(as) ? data.online.them.replace('{name}', () => nameOf(as)) : data.him);
const plain = (t) => String(t).toLowerCase().replace(/[’‘]/g, "'").replace(/n't\b/g, ' not').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const wordsIn = (t) => (String(t).match(/\S+/g) ?? []).length;
// The same line, or near enough to it: for anything five words or longer, three words in four that the two have between them in both
export function sameLine(a, b) {
  const x = plain(a), y = plain(b);
  if (x === y) return true;
  const A = new Set(x.split(' ')), B = new Set(y.split(' '));
  if (A.size < 5 || B.size < 5) return false;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return (2 * both) / (A.size + B.size) >= 0.75;
}

// The words that aren't PG-13 are kept as these, so that they aren't written out anywhere in the game. tools/talk-words.mjs makes them.
export function wordHash(word) {
  let h = 0x811c9dc5;
  for (let i = 0; i < word.length; i++) h = Math.imul(h ^ word.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}
// A word, and the word it'd be without its ending, with any letter said three times or more over said once
export function formsOf(word) {
  const w = word.replace(/(.)\1{2,}/g, '$1'), forms = new Set([w]);
  const add = (f) => { if (f.length < 3) return; forms.add(f); if (/(.)\1$/.test(f)) forms.add(f.slice(0, -1)); };
  if (w.endsWith('ies')) add(`${w.slice(0, -3)}y`);
  if (/(ch|sh|x|s|z)es$/.test(w)) add(w.slice(0, -2));
  for (const end of ['s', 'ed', 'er', 'ers', 'ing', 'in', 'y']) if (w.length > end.length + 2 && w.endsWith(end)) add(w.slice(0, -end.length));
  return forms;
}

const compiled = new WeakMap();
function rulesOf(data) {
  let r = compiled.get(data);
  if (!r) {
    const all = (list, flags = 'iu') => (list ?? []).map((s) => new RegExp(s, flags));
    r = {
      outside: all(data.outside), never: all(data.never), real: (data.real ?? []).map((n) => new RegExp(`\\b${n}\\b`, 'iu')),
      // an address is a number and a name with capitals, so they're the only rules that mind capitals
      addresses: all(data.addresses, 'u'), lyrics: all(data.lyrics), blocked: new Set(data.blocked ?? []), care: all(data.care?.when),
    };
    compiled.set(data, r);
  }
  return r;
}
// Why a line can't be shown, or '' if it can: it knows the world outside Chunky, says how anyone quit, names someone real, has an
// address, a phone number or a song in it, or isn't PG-13
// A word with stars for some of its letters, like f***, is what it stands for, and so is one spelled with figures, like sh1t
const MASKED = /(^|[^*\p{L}])\p{L}{1,4}\*+\p{L}{0,4}(?![\p{L}*])/u, FIGURES = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
export function whyNot(text, data) {
  const r = rulesOf(data), t = String(text).replace(/[’‘]/g, "'");
  for (const why of ['outside', 'never', 'real', 'addresses', 'lyrics']) if (r[why].some((re) => re.test(t))) return why;
  if (MASKED.test(t)) return 'pg13';
  for (const w of t.split(/\s+/)) {
    const read = /\p{L}/u.test(w) ? [w, w.replace(/[0-9@$]/g, (c) => FIGURES[c] ?? c)] : [w];
    for (const v of read) for (const p of plain(v).split(' ')) for (const f of formsOf(p.replace(/[^a-z]/g, ''))) if (r.blocked.has(wordHash(f))) return 'pg13';
  }
  return '';
}

// A line as it's shown: on one line, without anything that isn't a letter, a figure or punctuation, and without quotes round it or
// the speaker's name in front of it
function tidy(text, name) {
  let t = String(text).replace(/\p{Extended_Pictographic}|️/gu, '').replace(/\s+/g, ' ').trim();
  if (name) t = t.replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*`, 'i'), '');
  const quoted = t.match(/^["“'‘](.*)["”'’]$/s);
  return (quoted ? quoted[1] : t).trim();
}

// What the model sent back, as it can be shown, or { bad } with why it can't be, which sends them back to their written line. A line
// they've said to him before, or one of their written ones, isn't new, so it can't be either. Of what it does, only how they feel about
// him can change, by a point, once a line: everything else is thrown away and counted in `thrown`. An answer or a note that doesn't pass
// is dropped, and a mood that isn't one of data/talk.json's is plain. { care } is the model saying he sounds like he's really not okay.
export function checkReply(text, { data, who, said = [] }) {
  let got;
  try { got = JSON.parse(String(text).replace(/^[^{]*/, '').replace(/[^}]*$/, '')); } catch { return { bad: 'unreadable' }; }
  if (!got || typeof got !== 'object' || Array.isArray(got)) return { bad: 'unreadable' };
  if (got.care === true) return { care: true };
  const person = data.people[who];
  if (!person) return { bad: 'nobody' };
  const say = typeof got.say === 'string' ? tidy(got.say, person.name) : '';
  if (!say) return { bad: 'nothing said' };
  if (wordsIn(say) >= LIMITS.words || say.length > LIMITS.chars) return { bad: 'too long' };
  // as it came too, for a song's notes, which tidying takes out, and nobody in the game talks the way he'd sound if he were really not okay
  const why = whyNot(got.say, data) || whyNot(say, data) || (inDistress(say, data) ? 'never' : '');
  if (why) return { bad: why };
  if ([...said, ...person.samples].some((s) => sameLine(s, say))) return { bad: 'said before' };

  const effects = [], moved = new Set();
  let thrown = 0;
  for (const e of Array.isArray(got.do) ? got.do : got.do ? [got.do] : []) {
    const meter = typeof e?.meter === 'string' ? e.meter.replace(`${who}.`, '') : '';
    if ((meter === 'trust' || meter === 'fear') && (e.by === 1 || e.by === -1) && !moved.has(meter) && Object.keys(e).every((k) => k === 'meter' || k === 'by')) {
      moved.add(meter); effects.push({ meter: `${who}.${meter}`, by: e.by });
    } else thrown++;
  }
  const replies = [];
  for (const a of Array.isArray(got.replies) ? got.replies : []) {
    const t = typeof a === 'string' ? tidy(a) : '';
    if (!t || wordsIn(t) > LIMITS.answerWords || t.length > 80 || /^later\b/i.test(t) || whyNot(a, data) || whyNot(t, data) || inDistress(t, data) || replies.some((r) => sameLine(r, t))) continue;
    replies.push(t);
    if (replies.length === LIMITS.answers) break;
  }
  let remember = typeof got.remember === 'string' ? tidy(got.remember) : '';
  if (remember && (wordsIn(remember) > LIMITS.noteWords || whyNot(got.remember, data) || whyNot(remember, data) || inDistress(remember, data))) remember = '';
  return { say, mood: data.moods.includes(got.mood) ? got.mood : 'plain', do: effects, remember, replies, thrown };
}

// Whether what he typed sounds like he's really not okay. It's read before anything's sent, and it decides on its own: the model's told to
// say so too, but this doesn't wait for it or need it.
export const inDistress = (text, data) => { const t = String(text).replace(/[’‘]/g, "'"); return rulesOf(data).care.some((re) => re.test(t)); };

// Whether a written line's effects would change nothing now: each one's conditions don't hold, or it sets a flag that's already set or
// unsets one that isn't. Only a line like that can be said in new words instead, so the story's lines are always the written ones.
export const changesNothing = (effects, { check, flags }) => (effects ?? []).every((e) => !check(e.when) || (e.set ? !!flags[e.set] : e.unset ? !flags[e.unset] : false));

// What he's just said, as it's put to them, or that he's walked up. This visit's talk so far goes in the same way, his and theirs in turn.
// What he said goes in as he said it, and only the words around it are said for whoever it is.
export const heardAs = (data, heard, as) => (heard ? `${spoken('{They} {say}', as)}: "${heard}"` : spoken(data.opener, as));

// The written line a visit opens with: this is the one place it's chosen. On its own it's the story's. In a town that's shared it's the
// first time's on their first visit, coming back's after that, and for the hero, whom they know, Coop's line for him or else coming
// back's; then the lines for any time in turn. Each is said once to each of them, and once they all have been it's null, and they nod.
export function writtenOpener(data, who, { mind = blankMind(), as, story = null } = {}) {
  if (!as) return story;
  const l = data.online.lines[who];
  if (!l) return null;
  const first = as.hero ? l.hero ?? l.back : mind.visits ? l.back : l.first;
  return [first, ...l.any].find((s) => s && !mind.said.includes(s)) ?? null;
}
// What they say when nothing new comes in time: this is the one place it's chosen. On its own it's a spare line they haven't said to
// him, or else the story's. In a town that's shared it's the next of their lines for any time, each once, and then null, and they nod.
export function writtenFallback(data, who, { mind = blankMind(), as, story = null } = {}) {
  if (!as) return data.people[who].spare.find((s) => !mind.said.includes(s)) ?? story;
  return data.online.lines[who]?.any.find((s) => !mind.said.includes(s)) ?? null;
}

const listed = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
// Online, how they feel about whoever it is, as the story shows its meters: rounded, and nothing said when it's neither way. In the
// game on its own it's the story's meters, which pick its lines, so nothing's said of it there.
function feelings(data, mind, as) {
  if (!as) return '';
  const F = data.online.feel, at = (list, v, low) => list[Math.max(0, Math.min(list.length - 1, Math.round(v ?? 0) - low))];
  return [at(F.trust, mind.trust, -3), at(F.fear, mind.fear, 0)].filter(Boolean).map((t) => spoken(t, as)).join(' ');
}
// Everything that goes with one line: who they are, the world, what's going on, what they remember of him and what they've said to him,
// and how to answer, then this visit's talk so far and what he's just said, or that he's walked up. `here` is what's going on: his beans,
// what he's carrying, what's happened and what's happening tonight. What they've said goes first, the oldest of it first, then their
// oldest notes, then the start of this visit, until it all fits under the server's limit. Only the words around what's remembered, said
// and carrying are said for whoever it is, never those themselves.
export function messagesFor({ data, who, here = {}, mind = blankMind(), turns = [], heard = null, me = '', as }) {
  const p = data.people[who], beans = here.beans ?? 0, feel = feelings(data, mind, as);
  let said = mind.said.slice(-LIMITS.sent), notes = mind.notes.filter((n) => n.about === me).slice(-LIMITS.notes), talk = turns.slice(-LIMITS.turns);
  const build = () => {
    const system = [
      data.world.join(' '),
      '',
      `You are ${p.name}. ${p.sheet}`,
      `How you talk: ${p.voice} ${p.samples.map((l) => `"${l}"`).join(' ')}`,
      `Where you are: ${p.place}.`,
      '',
      `${whoItIs(data, as)}${mind.visits ? ` ${spoken("{They've}", as)} been by to talk to you ${mind.visits === 1 ? 'once' : `${mind.visits} times`} before.` : ''}`,
      ...(feel ? [feel] : []),
      `${spoken('{They} {have}', as)} ${beans} ${beans === 1 ? 'can' : 'cans'} of beans${here.carrying?.length ? `, and ${spoken("{they're}", as)} carrying ${listed(here.carrying)}` : ''}.`,
      ...(here.happened?.length ? [`What's happened: ${here.happened.join(' ')}`] : []),
      ...(here.tonight ? [here.tonight] : []),
      ...(notes.length ? [spoken('What you remember about {them}:', as), ...notes.map((n) => `- ${n.text}`)] : []),
      ...(said.length ? [spoken("What you've already said to {them}, which you never say again:", as), ...said.map((s) => `- ${s}`)] : []),
      '',
      spoken(data.rules.join('\n'), as),
    ];
    return [{ role: 'system', content: system.join('\n') }, ...talk, { role: 'user', content: heardAs(data, heard, as) }];
  };
  let messages = build();
  const size = () => messages.reduce((n, m) => n + m.content.length, 0);
  while (size() > LIMITS.ask && (said.length || notes.length || talk.length)) {
    if (said.length) said = said.slice(1); else if (notes.length) notes = notes.slice(1); else talk = talk.slice(2);
    messages = build();
  }
  return messages;
}

// Where to ask: the talk server, from the game's own pages, which are the only ones it answers, or with ?talk= a server on this
// machine, for the tests. Anywhere else, nowhere.
export function talkUrl(data, { search = '', origin = '' } = {}) {
  const given = new URLSearchParams(search).get('talk');
  if (given) return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(given) ? given : null;
  return data.pages.includes(origin) ? TALK_URL : null;
}

// The game's side of the talk server, and what they remember. It asks only once it's been told where, and it leaves them to their
// written lines for a while whenever the server says it can't answer. `store` is localStorage or anything like it, and a browser that
// won't keep anything just doesn't remember. `cast` is data/cast.json, whose meters and ties how they feel moves by online.
export function createTalk({ data, cast = null, store = null, fetch = globalThis.fetch, now = Date.now } = {}) {
  const KEY = `chunky.talk.v${data.version}`, PHONE = 'chunky.talk.phone';
  let url = null, restUntil = 0, minds = {}, phone = null, asking = 0, waiting = [], shared = null;
  const mind = (who) => (minds[who] ??= blankMind());
  // the longest wait it's been told of, so a quick answer to one ask doesn't cut short what another was told
  const rest = (why) => { restUntil = Math.max(restUntil, now() + (REST[why] ?? REST.off) * 1000); };

  // what a phone calls itself, for the server's limit on how often one phone can ask, made the first time and kept
  function phoneKey() {
    if (phone) return phone;
    try { phone = store?.getItem(PHONE) ?? null; } catch { /* not kept */ }
    if (!PHONE_KEY.test(phone ?? '')) { phone = makeKey(); try { store?.setItem(PHONE, phone); } catch { /* not kept */ } }
    return phone;
  }
  // what they remember, from what was kept: only the ones that talk, and only what would be kept, with how they feel online
  function take(kept) {
    for (const [who, m] of Object.entries(kept ?? {})) {
      if (!Object.hasOwn(data.people, who) || !m || typeof m !== 'object') continue;
      minds[who] = {
        notes: (Array.isArray(m.notes) ? m.notes : []).filter((n) => typeof n?.text === 'string' && typeof n.about === 'string').slice(-LIMITS.notes),
        said: (Array.isArray(m.said) ? m.said : []).filter((s) => typeof s === 'string').slice(-LIMITS.said),
        visits: Number.isFinite(m.visits) ? m.visits : 0,
      };
      for (const meter of FELT) if (Number.isFinite(m[meter])) minds[who][meter] = m[meter];
    }
  }
  function load() { try { take(JSON.parse(store.getItem(KEY))?.minds); } catch { /* nothing saved */ } }
  function save() { try { store.setItem(KEY, JSON.stringify({ minds })); } catch { /* not kept */ } }
  // kept on the phone, or in a town that's shared, told to the town
  const changed = (who, change) => (shared ? shared({ who, ...change }) : save());
  const keep = (list, most) => { if (list.length > most) list.splice(0, list.length - most); };

  const talk = {
    data,
    // where it asks, or null to stop asking
    on(at) { url = at || null; restUntil = 0; },
    get url() { return url; },
    ready: () => !!url && now() >= restUntil,
    talks: (who) => data.who.includes(who) && !!data.people[who],
    mind,
    // who a note's about: this phone, by a hash of its key, so that once there's more than one of him they can say which
    me: () => wordHash(phoneKey()),
    visited(who) { mind(who).visits++; changed(who, { visit: true }); },
    said(who, text) { const m = mind(who); if (!m.said.includes(text)) { m.said.push(text); keep(m.said, LIMITS.said); changed(who, { said: text }); } },
    note(who, text, about = talk.me()) { const m = mind(who), at = now(); m.notes.push({ about, text, at }); keep(m.notes, LIMITS.notes); changed(who, { note: text, about, at }); },
    // Online (CHUNKY-169), how they feel about whoever's playing moves by the story's own rule (src/people.js), and each of them it
    // moves is told to the town as they are now
    feel(who, meter, by) {
      const meters = Object.fromEntries(data.who.map((w) => [w, Object.fromEntries(FELT.map((f) => [f, mind(w)[f] ?? 0]))]));
      moveMeter(cast, meters, who, meter, by);
      for (const w of data.who) {
        const m = mind(w);
        if (FELT.every((f) => meters[w][f] === (m[f] ?? 0))) continue;
        Object.assign(m, meters[w]); changed(w, { ...meters[w] });
      }
    },
    // In a town that's shared (CHUNKY-169) what they remember of whoever's playing is the town's, apart from the phone's own game's:
    // it's what the town had, and each change is told to it with `tell`. share(null) has it the phone's own again.
    share(kept, tell) { minds = {}; shared = kept ? tell : null; if (kept) take(kept); else load(); },
    forget() { minds = {}; try { store.removeItem(KEY); } catch { /* nothing to remove */ } },
    hasSave() { try { return !!store?.getItem(KEY); } catch { return false; } },
    // whatever's still being asked, for a test to wait on
    settled: () => (asking ? new Promise((r) => waiting.push(r)) : Promise.resolve()),
    // What they'd say: { reply } that's been through the checker, { bad } with why it didn't pass, or { quiet } with why nothing came
    async ask(who, { here, turns = [], heard = null, wait = LIMITS.wait, as } = {}) {
      if (!talk.ready() || !talk.talks(who)) return { quiet: 'rest' };
      const messages = messagesFor({ data, who, here, mind: mind(who), turns, heard, me: talk.me(), as });
      const stop = new AbortController(), timer = setTimeout(() => stop.abort(), wait);
      asking++;
      try {
        // as text, so that a page on another site doesn't have to ask first whether it may
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ phone: phoneKey(), messages }), signal: stop.signal, credentials: 'omit', cache: 'no-store' });
        const answer = await res.json();
        if (answer?.quiet) { rest(answer.quiet); return { quiet: answer.quiet }; }
        if (typeof answer?.reply !== 'string') { rest('off'); return { quiet: 'off' }; }
        const reply = checkReply(answer.reply, { data, who, said: mind(who).said });
        return reply.bad ? { bad: reply.bad } : { reply, ms: answer.ms, model: answer.model };
      } catch {
        const why = stop.signal.aborted ? 'slow' : 'off';
        rest(why);
        return { quiet: why };
      } finally {
        clearTimeout(timer);
        if (!--asking) waiting.splice(0).forEach((r) => r());
      }
    },
  };
  load();
  return talk;
}
