// The town behind any socket, with stand-ins for the sockets and the clock: what the Durable Object relies on, since that can't run
// here. server/index.test.js plays the same over real sockets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHost } from './host.js';
import { createTown } from './town.js';
import { encodePose, decodeMessage, say } from '../src/net.js';

const HERO = 'only-the-owner-has-this-one-1386', heroHash = createHash('sha256').update(HERO).digest('hex');
function setup(opts = {}) {
  const t = { now: 0 }, clock = () => t.now, town = createTown({ clock });
  const host = createHost({ town, clock, heroHash, ...opts });
  const phone = () => {
    const s = { open: true, got: [], killed: false, closed: false, send(d) { this.got.push(d); }, close() { this.closed = true; this.open = false; }, kill() { this.killed = true; this.open = false; } };
    s.words = () => s.got.filter((d) => typeof d === 'string').map(decodeMessage);
    s.snaps = () => s.got.filter((d) => typeof d !== 'string').map(decodeMessage);
    host.opened(s); return s;
  };
  const hello = (s, extra = {}) => host.heard(s, say({ t: 'hello', key: 'k'.repeat(32), name: 'Junebug', look: 1, ...extra }));
  return { t, town, host, phone, hello };
}

test('a phone that says hello is let in, and is sent everyone, where they said, on each beat', async () => {
  const { host, phone, hello } = setup();
  const a = phone(), b = phone();
  await hello(a, { key: 'a'.repeat(32) }); await hello(b, { key: 'b'.repeat(32), name: 'Dee' });
  const [wa] = a.words().filter((m) => m.t === 'welcome'), [wb] = b.words().filter((m) => m.t === 'welcome');
  assert.ok(wa.id && wb.id && wa.id !== wb.id);
  host.heard(a, encodePose(10, 4, 1, 2, 0));
  host.beat();
  const seen = b.snaps().at(-1).players.find((p) => p.id === wa.id);
  assert.deepEqual([seen.x, seen.z], [4, 2]);
  assert.equal(host.here, 2);
});

test('a phone that never says hello is let go once it\'s had its time, and not before', () => {
  const { t, host, phone } = setup({ helloWithin: 5000 });
  const s = phone();
  t.now = 4900; host.beat(); assert.equal(s.killed, false);
  t.now = 5100; host.beat(); assert.equal(s.killed, true);
});

test('a phone that goes while its hello is being checked never comes in, and nobody hears of it', async () => {
  const { host, phone, hello } = setup();
  const watcher = phone(); await hello(watcher, { key: 'w'.repeat(32), name: 'Dee' });
  const s = phone(), said = hello(s);
  host.closed(s);
  await said;
  host.beat();
  assert.equal(host.here, 1);
  assert.ok(!watcher.words().some((m) => m.t === 'who' && m.players?.some((p) => p.name === 'Junebug')), 'the others were told about it');
});

test('the hero is whoever has the hero\'s secret, and nobody else', async () => {
  const { phone, hello } = setup();
  const h = phone(), n = phone();
  await hello(h, { key: 'h'.repeat(32), hero: HERO }); await hello(n, { key: 'n'.repeat(32), hero: HERO.replace(/6$/, '7') });
  assert.equal(h.words().find((m) => m.t === 'welcome').hero, true);
  assert.equal(n.words().find((m) => m.t === 'welcome').hero, false);
});

test('someone quiet too long is let go and leaves, and someone saying what they carry isn\'t quiet', async () => {
  const { t, host, phone, hello } = setup({ silence: 5000 });
  const a = phone(), b = phone();
  await hello(a, { key: 'a'.repeat(32) }); await hello(b, { key: 'b'.repeat(32) });
  host.heard(a, encodePose(0, 1, 1, 1, 0)); host.heard(b, encodePose(0, 2, 1, 1, 0));
  t.now = 4000; host.heard(b, say({ t: 'keep', beans: 1 }));
  t.now = 5500; host.beat();
  assert.equal(a.killed, true); assert.equal(b.killed, false);
  assert.equal(host.here, 1);
});

test('what the cast remember of someone is asked for by the hash of their key before they\'re let in, and what one of them says goes to the town', async () => {
  const asked = [], kept = { coop: { notes: [], said: ['Hey.'], visits: 1 } };
  const { town, host, phone, hello } = setup({ mindsOf: async (k) => { asked.push(k); return kept; } });
  const a = phone(); await hello(a, { key: 'a'.repeat(32) });
  assert.deepEqual(asked, [createHash('sha256').update('a'.repeat(32)).digest('hex')]);
  assert.deepEqual(a.words().find((m) => m.t === 'welcome').minds, kept);
  host.heard(a, say({ t: 'mind', who: 'coop', said: 'There you are.' }));
  assert.deepEqual(town.keepMinds()[0][1].coop.said, ['Hey.', 'There you are.']);
});

test('where what the cast remember of someone can\'t be read, they\'re let go to try again, rather than come in as a stranger and have it written over', async () => {
  const { host, phone, hello } = setup({ mindsOf: async () => { throw new Error('nothing there'); } });
  const a = phone(); await hello(a, { key: 'a'.repeat(32) });
  assert.equal(a.killed, true); assert.equal(host.here, 0);
});

test('one phone that\'s behind with what it\'s sent is skipped for a beat, and the rest still get theirs', async () => {
  const { host, phone, hello } = setup();
  const a = phone(), b = phone();
  await hello(a, { key: 'a'.repeat(32) }); await hello(b, { key: 'b'.repeat(32) });
  a.buffered = 1 << 20;
  const before = [a.snaps().length, b.snaps().length];
  host.beat();
  assert.deepEqual([a.snaps().length, b.snaps().length], [before[0], before[1] + 1]);
});
