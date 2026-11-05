// chunky.ms/?net sends a phone on to online.chunky.ms with what it keeps for the town, and online.chunky.ms takes it in (CHUNKY-169).
// It's the first thing index.html runs, so it's run here as it's written there, in a stand-in for one browser: what each address keeps, apart,
// and its cookies, which chunky.ms and everything under it share.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const code = page.match(/<script>\s*(\/\/ chunky\.ms\/\?net is online\.chunky\.ms[\s\S]*?)<\/script>/)?.[1];
const KEY = 'Ab3_x-'.repeat(4), OTHER = 'Zz9_q-'.repeat(4);
const under = (host, domain) => host === domain || host.endsWith(`.${domain}`);

function browser() {
  const stores = new Map(), jar = new Map();
  // a cookie as a page at `address` would set it: only for its own name or one it's under, only on https if it says Secure, and one named
  // __Secure-… only if it says Secure and came over https
  const set = (address, line) => {
    const url = new URL(address), [pair, ...rest] = line.split(/;\s*/), at = pair.indexOf('='), name = pair.slice(0, at), value = pair.slice(at + 1);
    const a = Object.fromEntries(rest.map((t) => { const j = t.indexOf('='); return j < 0 ? [t.toLowerCase(), true] : [t.slice(0, j).toLowerCase(), t.slice(j + 1)]; }));
    const domain = a.domain ?? url.hostname, https = url.protocol === 'https:';
    if (!under(url.hostname, domain) || (a.secure && !https) || (name.startsWith('__Secure-') && !(a.secure && https))) return;
    if (a['max-age'] !== undefined && +a['max-age'] <= 0) jar.delete(name); else jar.set(name, { value, domain });
  };
  return {
    jar,
    // a cookie set from somewhere else, as someone on the network could answer a phone's first plain http with
    plant: set,
    // what's kept at `origin`, as if they'd played there
    keep(origin, kept) { stores.set(origin, new Map(Object.entries(kept))); },
    // opens `address`, and says where it was sent, what that address keeps after, and what its address is
    open(address, { refuse = false } = {}) {
      assert.ok(code, 'index.html starts with what sends chunky.ms/?net on');
      const url = new URL(address), store = stores.get(url.origin) ?? new Map(), sent = [];
      stores.set(url.origin, store);
      const no = () => { if (refuse) throw new Error('The operation is insecure.'); };
      const localStorage = {
        get length() { no(); return store.size; },
        key: (i) => { no(); return [...store.keys()][i] ?? null; },
        getItem: (k) => { no(); return store.has(k) ? store.get(k) : null; },
        setItem: (k, v) => { no(); store.set(k, String(v)); },
      };
      const document = {
        get cookie() { return [...jar].filter(([, c]) => under(url.hostname, c.domain)).map(([k, c]) => `${k}=${c.value}`).join('; '); },
        set cookie(line) { set(address, line); },
      };
      const location = { hostname: url.hostname, pathname: url.pathname, search: url.search, hash: url.hash, replace: (to) => sent.push(to) };
      const history = { replaceState: (_s, _t, to) => { const u = new URL(to, url); Object.assign(location, { pathname: u.pathname, search: u.search, hash: u.hash }); } };
      runInNewContext(code, { location, localStorage, history, document, crypto: globalThis.crypto, URLSearchParams });
      return { sent: sent[0] ?? null, kept: Object.fromEntries(store), address: location.pathname + location.search + location.hash };
    },
  };
}
// a link to online.chunky.ms with `kept` in it as if it had come from chunky.ms, with `word` in front of it
const link = (kept, word = '0'.repeat(32)) => `https://online.chunky.ms/#carry=${word}.${encodeURIComponent(JSON.stringify(kept))}`;

test('chunky.ms/?net goes on to online.chunky.ms, which takes in what the phone kept for the town and nothing else of the game\'s', () => {
  const b = browser();
  b.keep('https://chunky.ms', { 'chunky.net.key@': KEY, 'chunky.net.name': 'Junebug', 'chunky.net.look': '3', 'chunky.mute': '1', 'chunky.levels': '{}' });
  const first = b.open('https://chunky.ms/?net');
  assert.match(first.sent, /^https:\/\/online\.chunky\.ms\/#carry=[0-9a-f]{32}\./);
  const there = b.open(first.sent);
  assert.equal(there.sent, null);
  assert.deepEqual(there.kept, { 'chunky.net.key@': KEY, 'chunky.net.name': 'Junebug', 'chunky.net.look': '3' });
  assert.equal(there.address, '/');
  assert.equal(b.jar.size, 0, 'and the word it came with is gone');
});

test('so does www.chunky.ms/?net, with the rest of the address, and ?net=… keeps the town it names', () => {
  const b = browser();
  b.keep('https://www.chunky.ms', { 'chunky.net.key@': KEY });
  const u = new URL(b.open('https://www.chunky.ms/?test&net').sent);
  assert.equal(u.origin, 'https://online.chunky.ms');
  assert.ok(u.searchParams.has('test') && !u.searchParams.has('net'), u.search);
  assert.deepEqual(b.open(u.href).kept, { 'chunky.net.key@': KEY });
  const c = browser(), town = 'wss://elsewhere.example/town';
  c.keep('https://chunky.ms', { [`chunky.net.key@${town}`]: KEY });
  const there = new URL(c.open(`https://chunky.ms/?net=${town}`).sent);
  assert.equal(there.search, '?net=wss%3A%2F%2Felsewhere.example%2Ftown');
  const r = c.open(there.href);
  assert.deepEqual(r.kept, { [`chunky.net.key@${town}`]: KEY });
  assert.equal(r.address, '/?net=wss%3A%2F%2Felsewhere.example%2Ftown');
});

test('the hero\'s link goes on as the hero\'s, for its town, and a phone with nothing kept goes on with nothing after it and no cookie', () => {
  const b = browser();
  b.keep('https://chunky.ms', { 'chunky.net.key@': KEY });
  assert.deepEqual(b.open(b.open('https://chunky.ms/?net#hero=s3cret%2Bplus').sent).kept, { 'chunky.net.key@': KEY, 'chunky.net.hero@': 's3cret+plus' });
  const c = browser();
  assert.equal(c.open('https://chunky.ms/?net').sent, 'https://online.chunky.ms/');
  assert.equal(c.jar.size, 0);
  // a hero's link that's been mangled is still sent on, without it
  assert.equal(c.open('https://chunky.ms/?net#hero=%E0%A4%A').sent, 'https://online.chunky.ms/');
});

test('a phone that won\'t say what it keeps is still sent on', () => {
  const b = browser();
  b.keep('https://chunky.ms', { 'chunky.net.key@': KEY });
  assert.equal(b.open('https://chunky.ms/?net', { refuse: true }).sent, 'https://online.chunky.ms/');
});

test('nothing happens anywhere else: the story, a town on this machine, the project\'s own address, or online.chunky.ms itself', () => {
  for (const address of ['https://chunky.ms/', 'https://chunky.ms/?test', 'https://chunky.ms/#free', 'http://localhost:8000/?net', 'http://127.0.0.1:8000/?test&net', 'https://chunky-survival.vercel.app/?net', 'https://online.chunky.ms/?net', 'https://online.chunky.ms/#hero=abc']) {
    const b = browser(), kept = { 'chunky.net.key@': KEY };
    b.keep(new URL(address).origin, kept);
    const r = b.open(address);
    assert.equal(r.sent, null, address);
    assert.deepEqual(r.kept, kept, address);
    assert.equal(r.address, new URL(address).pathname + new URL(address).search + new URL(address).hash, address);
    assert.equal(b.jar.size, 0, address);
  }
});

test('a carry that didn\'t come with this phone on its own way here is never taken in, and still comes off the address', () => {
  // A link anyone could post, with a key they know, opened on a phone with nothing kept at online.chunky.ms: it has no word of the phone's own
  const b = browser();
  let r = b.open(link({ 'chunky.net.key@': OTHER, 'chunky.net.name': 'Pip' }));
  assert.deepEqual(r.kept, {});
  assert.equal(r.address, '/');
  // nor while the phone's on its own way here, with a word of its own that the link can't know
  b.keep('https://chunky.ms', { 'chunky.net.key@': KEY });
  const own = b.open('https://chunky.ms/?net').sent;
  r = b.open(link({ 'chunky.net.key@': OTHER }));
  assert.deepEqual(r.kept, {});
  assert.equal(r.address, '/');
  // the phone's own still comes in after that, and its word can't be used twice
  assert.deepEqual(b.open(own).kept, { 'chunky.net.key@': KEY });
  const again = browser();
  assert.deepEqual(again.open(own).kept, {});
  // a word without anything after it, and anything after no word at all
  for (const hash of [`#carry=${'a'.repeat(32)}`, `#carry=.${encodeURIComponent(JSON.stringify({ 'chunky.net.key@': OTHER }))}`, `#carry=${encodeURIComponent(JSON.stringify({ 'chunky.net.key@': OTHER }))}`]) {
    const c = browser(), back = c.open(`https://online.chunky.ms/${hash}`);
    assert.deepEqual(back.kept, {}, hash);
    assert.equal(back.address, '/', hash);
  }
});

test('two tabs on their way at once each come in as who they were, each by its own word, which only it clears', () => {
  const b = browser();
  b.keep('https://chunky.ms', { 'chunky.net.key@': KEY });
  const one = b.open('https://chunky.ms/?net').sent, two = b.open('https://chunky.ms/?net').sent;
  assert.equal(b.jar.size, 2);
  assert.deepEqual(b.open(one).kept, { 'chunky.net.key@': KEY });
  assert.equal(b.jar.size, 1, 'the second\'s is left for it');
  assert.deepEqual(b.open(two).kept, { 'chunky.net.key@': KEY });
  assert.equal(b.jar.size, 0);
});

test('a word planted over plain http, before the phone\'s ever had chunky.ms on https, isn\'t one', () => {
  const b = browser(), word = 'f'.repeat(32), posted = link({ 'chunky.net.key@': OTHER }, word);
  for (const name of [`__Secure-chunky.carry.${word}`, `chunky.carry.${word}`, 'chunky.carry', '__Secure-chunky.carry']) {
    b.plant('http://chunky.ms/', `${name}=${name.endsWith(word) ? 1 : word}; Domain=chunky.ms; Path=/`);
    b.plant('http://online.chunky.ms/', `${name}=${name.endsWith(word) ? 1 : word}; Path=/`);
  }
  assert.ok([...b.jar.keys()].every((k) => !k.startsWith('__Secure-')), 'the browser refuses a __Secure- cookie from plain http');
  assert.deepEqual(b.open(posted).kept, {});
});

test('online.chunky.ms never writes over what it already keeps, and what came that isn\'t right is left', () => {
  const b = browser();
  b.keep('https://chunky.ms', { 'chunky.net.key@': KEY, 'chunky.net.name': 'Junebug' });
  b.keep('https://online.chunky.ms', { 'chunky.net.key@': OTHER });
  assert.deepEqual(b.open(b.open('https://chunky.ms/?net').sent).kept, { 'chunky.net.key@': OTHER, 'chunky.net.name': 'Junebug' });
  // with the phone's own word in front of each, as if it had come from chunky.ms
  for (const body of ['%7Bnot%20json', encodeURIComponent('[1,2]'), encodeURIComponent('null'), encodeURIComponent(JSON.stringify({ 'chunky.net.key@': 5, 'chunky.net.name': 'x'.repeat(1025), 'elsewhere': 'x' })), '%E0%A4%A']) {
    const c = browser();
    c.keep('https://chunky.ms', { 'chunky.net.look': '1' });
    const word = new URL(c.open('https://chunky.ms/?net').sent).hash.slice(7, 39), r = c.open(`https://online.chunky.ms/#carry=${word}.${body}`);
    assert.deepEqual(r.kept, {}, body);
    assert.equal(r.address, '/', body);
  }
  // and a phone that won't keep anything at online.chunky.ms still has the address come off clean
  const d = browser();
  d.keep('https://chunky.ms', { 'chunky.net.key@': KEY });
  assert.equal(d.open(d.open('https://chunky.ms/?net').sent, { refuse: true }).address, '/');
});
