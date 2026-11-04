// Plays the talk server (CHUNKY-107) in Cloudflare's own runtime on this machine, with wrangler dev and a stand-in for OpenRouter, so
// nothing's spent: a line and what it cost, a page on another site turned away, the month's cap, a phone asking too fast, and the
// month's money still spent after the Worker's been stopped and started again. The rules themselves are tested in server/talk.test.js.
//
//   npm run talk:host
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wranglerDev } from './wrangler-dev.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CAP = 0.0005, COST = 0.0002, WORDS = '{"say":"Well, look who it is."}';

// OpenRouter, as far as this needs it: every line costs the same
const heard = [];
const openrouter = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    heard.push({ auth: req.headers.authorization, ...JSON.parse(body) });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: WORDS } }], usage: { cost: COST } }));
  });
});
await new Promise((r) => openrouter.listen(0, '127.0.0.1', r));

const kept = mkdtempSync(join(tmpdir(), 'chunky-talk-'));
// The Worker as wrangler dev runs it, with what it keeps in `kept`, so it's still there after a stop and a start
const dev = wranglerDev({ cwd: ROOT, args: ['--config', 'server/wrangler.jsonc', '--persist-to', kept,
  '--var', 'OPENROUTER_KEY:sk-on-this-machine', '--var', `OPENROUTER_URL:http://127.0.0.1:${openrouter.address().port}/v1/chat/completions`, '--var', `CAP_USD:${CAP}`] });
const start = async () => `http://127.0.0.1:${await dev.start()}`, stop = () => dev.stop();
const ask = (at, { phone = 'a-phone-of-their-own-1234', origin = 'https://chunky.ms', method = 'POST' } = {}) => fetch(`${at}/talk`, {
  method, headers: { 'Content-Type': 'text/plain', ...(origin && { Origin: origin }) },
  body: method === 'POST' ? JSON.stringify({ phone, messages: [{ role: 'user', content: 'Hey, Coop.' }] }) : undefined,
});
const said = async (res) => { assert.equal(res.status, 200); return res.json(); };

try {
  let at = await start();
  const first = await ask(at), line = await said(first);
  assert.equal(line.reply, WORDS); assert.equal(line.cost, COST);
  assert.equal(first.headers.get('access-control-allow-origin'), 'https://chunky.ms');
  assert.equal(heard[0].auth, 'Bearer sk-on-this-machine'); assert.equal(heard[0].max_tokens, 200);
  console.log(`a line comes back, and what it cost: ${line.model}, $${line.cost}`);

  const away = await ask(at, { origin: 'https://elsewhere.example' });
  assert.equal(away.status, 403); assert.equal(away.headers.get('access-control-allow-origin'), null);
  assert.equal((await ask(at, { method: 'OPTIONS' })).status, 204);
  console.log('a page on another site is turned away, and one that asks first is told it may');

  assert.equal((await said(await ask(at))).reply, WORDS);
  assert.equal((await said(await ask(at))).reply, WORDS);
  assert.equal((await said(await ask(at))).quiet, 'cap');
  assert.equal(heard.length, 3);
  console.log(`three lines at $${COST} spend the month's $${CAP}, and the next is quiet without asking OpenRouter`);

  const quick = [];
  for (let i = 0; i < 6; i++) quick.push((await said(await ask(at, { phone: 'someone-else-entirely-5678' }))).quiet);
  assert.equal(quick.at(-1), 'fast', quick.join(', '));
  console.log(`a phone that asks six times at once is told it's too fast: ${quick.join(', ')}`);

  await stop(); at = await start();
  assert.equal((await said(await ask(at, { phone: 'a-third-phone-9012-abcd' }))).quiet, 'cap');
  assert.equal(heard.length, 3);
  console.log('stopped and started again, the month\'s still spent');
  console.log('talk host: all good');
} finally {
  await stop();
  openrouter.close();
  rmSync(kept, { recursive: true, force: true });
}
