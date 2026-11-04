// tools/wrangler-dev.mjs with stand-ins for wrangler dev, so nothing of Cloudflare's is started here
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wranglerDev } from './wrangler-dev.mjs';

// One that takes the port it's given and the inspector's, as wrangler dev does, and says it's ready once it has both. Left without an
// inspector port, wrangler takes 9229 if it looks free, so two started at once can both go for it.
const READY = ['node', '-e', `
  const a = process.argv, at = (k) => +a[a.indexOf(k) + 1], http = require('node:http');
  if (!a.includes('--inspector-port')) { console.error('no inspector port, so 9229 if it looks free'); process.exit(2); }
  let up = 0;
  for (const port of [at('--port'), at('--inspector-port')]) http.createServer().on('error', (e) => { console.error(e.message); process.exit(1); })
    .listen(port, '127.0.0.1', () => { if (++up === 2) console.log('[wrangler:info] Ready on http://127.0.0.1:' + at('--port')); });
`, '--'];
// and one that dies as it starts, as wrangler dev does when a port it wants is taken, with something of its own still going a moment
// after it, as npx's are
const DIES = ['node', '-e', `
  require('node:child_process').spawn('sleep', ['3'], { stdio: 'ignore' });
  console.error('Address already in use (socket "direct:1:default")'); process.exit(1);
`, '--'];
const within = (p, ms, what) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`${what} took over ${ms} ms`)), ms))]);

test('one that dies as it starts says so, with what it said, and stopping it then is over at once', async () => {
  const dev = wranglerDev({ cwd: process.cwd(), args: [], command: DIES });
  await assert.rejects(dev.start(), /stopped \(1\)[\s\S]*Address already in use/);
  await within(dev.stop(), 1000, 'stopping one that had already stopped');
});

test('one that\'s ready is on the port it was given and stops when it\'s told', async () => {
  const dev = wranglerDev({ cwd: process.cwd(), args: ['--config', 'server/wrangler.jsonc'], command: READY });
  const port = await within(dev.start(), 5000, 'starting');
  assert.ok(Number.isInteger(port) && port > 0, `port ${port}`);
  await within(dev.stop(), 3000, 'stopping one that was running');
});

test('two started at once each have an inspector port of their own, so neither dies for the other', async () => {
  const devs = [0, 1].map(() => wranglerDev({ cwd: process.cwd(), args: [], command: READY }));
  try {
    const ports = await within(Promise.all(devs.map((d) => d.start())), 5000, 'starting two at once');
    assert.notEqual(ports[0], ports[1]);
  } finally {
    await Promise.all(devs.map((d) => d.stop()));
  }
});
