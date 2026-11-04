// Plays the town everyone shares (CHUNKY-151) in Cloudflare's own runtime on this machine, with wrangler dev, the way it'll be hosted:
// two phones let in, one of them on a page at online.chunky.ms, and each seeing the other twenty times a second, the title card told
// how many are in town (CHUNKY-169), one going, the hero's link, a page on another site turned away, and someone coming back after the
// Worker's been stopped and started again, to where they were, with what they had and with what the cast remember of them, which is
// kept on its own. What the town does is tested in server/town.test.js and server/host.test.js, and npm run net plays it in the game.
//
//   npm run town:host
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { encodePose, decodeMessage, say } from '../src/net.js';
import { wranglerDev } from './wrangler-dev.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const HERO = 'a-secret-only-the-owner-has-1386', BUILD = { at: 1, world: 'the-same-vehicles' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, ms = 10000) => { const end = Date.now() + ms; while (!fn()) { if (Date.now() > end) throw new Error(`timed out waiting for ${what}`); await sleep(20); } };

const kept = mkdtempSync(join(tmpdir(), 'chunky-town-'));
// The Worker as wrangler dev runs it, with what it keeps in `kept`, so it's still there after a stop and a start
const dev = wranglerDev({ cwd: ROOT, args: ['--config', 'server/wrangler.jsonc', '--persist-to', kept, '--var', `CHUNKY_HERO:${createHash('sha256').update(HERO).digest('hex')}`] });
const start = async () => `ws://127.0.0.1:${await dev.start()}/town`, stop = () => dev.stop();

// A phone, on a page at chunky.ms unless it's said where: it says hello as soon as it's open
const phones = [];
function phone(url, { key, name = 'Junebug', hero, origin = 'https://chunky.ms' }) {
  const ws = new WebSocket(url, { origin }), p = { ws, id: 0, snaps: [], words: [], refused: null, closed: null };
  phones.push(p);
  ws.on('unexpected-response', (req, res) => { p.refused = res.statusCode; res.resume(); });
  ws.on('message', (data, isBinary) => {
    const m = decodeMessage(isBinary ? data : data.toString());
    if (!m) return;
    if (isBinary) p.snaps.push(m.players); else { p.words.push(m); if (m.t === 'welcome') p.id = m.id; }
  });
  ws.on('close', (code) => { p.closed = code; });
  ws.on('error', () => {});
  ws.on('open', () => ws.send(say({ t: 'hello', key, name, look: 1, hero, build: BUILD })));
  p.say = (x, z) => ws.send(encodePose(Math.round(performance.now()) & 0xffff, x, 1, z, 0));
  p.welcome = () => p.words.find((m) => m.t === 'welcome');
  return p;
}
const sees = (p, who, x, z) => p.snaps.at(-1)?.some((q) => q.id === who.id && Math.abs(q.x - x) < .01 && Math.abs(q.z - z) < .01);
// how many are in town, as the title card on a page at online.chunky.ms asks before anyone's said who they are
const hereOf = (url, origin = 'https://online.chunky.ms') => fetch(`${url.replace(/^ws/, 'http')}/here`, { headers: { Origin: origin } });

try {
  let url = await start();
  const empty = await hereOf(url);
  assert.equal(empty.status, 200); assert.equal(empty.headers.get('access-control-allow-origin'), 'https://online.chunky.ms');
  assert.equal(empty.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await empty.json(), { here: 0 });
  const a = phone(url, { key: 'a'.repeat(32) }), b = phone(url, { key: 'b'.repeat(32), name: 'Dee', origin: 'https://online.chunky.ms' });
  await until(() => a.id && b.id, 'both to be let in');
  a.say(5, 6); b.say(-3, 4);
  await until(() => sees(b, a, 5, 6) && sees(a, b, -3, 4), 'each to see the other');
  const before = b.snaps.length; await sleep(1000);
  const rate = b.snaps.length - before;
  assert.ok(rate >= 15 && rate <= 25, `${rate} snapshots in a second`);
  console.log(`two phones are let in, one on a page at online.chunky.ms, and each sees the other where they said, ${rate} times a second`);
  assert.deepEqual(await (await hereOf(url)).json(), { here: 2 });
  console.log('the title card is told how many are in town: nobody, then the two of them');

  a.ws.send(say({ t: 'keep', beans: 4, items: { bottle: 1 }, gas: 0 }));
  a.ws.send(say({ t: 'mind', who: 'coop', said: 'Hey.' })); a.ws.send(say({ t: 'mind', who: 'coop', visit: true }));
  await sleep(100);
  a.ws.close();
  // sooner than the five seconds it takes the town to let go of anyone who's gone quiet, so it's the going that did it
  await until(() => b.snaps.length && !b.snaps.at(-1).some((q) => q.id === a.id), 'the one who went to be gone', 2000);
  console.log('one goes, and is gone from the next snapshot');

  const h = phone(url, { key: 'h'.repeat(32), name: 'River', hero: HERO }), n = phone(url, { key: 'n'.repeat(32), name: 'Lou', hero: 'a-guess-at-it' });
  await until(() => h.id && n.id, 'the hero and a guess to be let in');
  assert.equal(h.welcome().hero, true); assert.equal(n.welcome().hero, false);
  console.log('the hero is whoever has the hero\'s secret, and nobody else');

  const away = phone(url, { key: 'x'.repeat(32), name: 'Ray', origin: 'https://elsewhere.example' });
  await until(() => away.refused !== null || away.closed !== null, 'a page on another site to be answered');
  assert.equal(away.refused, 403); assert.equal(away.id, 0);
  assert.equal((await hereOf(url, 'https://elsewhere.example')).status, 403);
  console.log('a page on another site is turned away, and isn\'t told how many are in town');

  for (const p of [b, h, n]) p.ws.close();
  await until(() => [b, h, n].every((p) => p.closed !== null), 'everyone to have gone');
  await sleep(500);
  await stop(); url = await start();
  const back = phone(url, { key: 'a'.repeat(32) });
  await until(() => back.id, 'someone coming back to be let in');
  const had = back.welcome().saved;
  assert.deepEqual([had?.x, had?.z, had?.beans, had?.items?.bottle], [5, 6, 4, 1]);
  assert.deepEqual(back.welcome().minds, { coop: { notes: [], said: ['Hey.'], visits: 1 } });
  assert.deepEqual(n.welcome().minds, {});
  console.log('stopped and started again, someone coming back finds where they were, what they had, and Coop remembering them');
  console.log('town host: all good');
} finally {
  for (const p of phones) p.ws.terminate();
  await stop();
  rmSync(kept, { recursive: true, force: true });
}
