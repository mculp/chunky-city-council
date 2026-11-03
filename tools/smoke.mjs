// Plays Chapter 1 in real Chrome through the ?test hook and fails on a wrong beat or a console error.
//
//   npm i && npm run smoke -- [--shots dir] [--touch]
//
// It serves the repo itself and drives the system Chrome with the GPU on, so WebGL runs for real.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try {
    const body = await readFile(join(ROOT, path === '/' ? 'index.html' : path));
    res.writeHead(200, { 'content-type': MIME[extname(path) || '.html'] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/?test`;

const args = process.argv.slice(2), shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null, touch = args.includes('--touch');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 513, height: 696 }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const step = (s) => g((s) => __game.step(s), s);
const key = (k, down = true) => g(([k, d]) => __game.key(k, d), [k, down]);
const snap = async (name) => { if (shots) { await mkdir(shots, { recursive: true }); await page.screenshot({ path: join(shots, name + '.png') }); } };

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
await g(() => __game.pause());
let st = await step(.5);
check('title', st.mode === 'title', st.mode); await snap('title');

// the opening
await page.click('#start');
st = await step(1); check('stuckey card', st.mode === 'hang' && /Stuckey/.test(st.card), st.card); await snap('hang');
st = await step(3.2); check('he decides', /decides/.test(st.card), st.card);
st = await step(2.5); check('cut prompt', /cut the rope/i.test(st.prompt), st.prompt);
await key('e'); st = await step(1.2); check('sawing', st.cut > .4 && st.cut < .6, st.cut); await snap('cut');
st = await step(1.3); check('rope cut', st.mode === 'fall', st.mode); await key('e', false); await snap('fall');
st = await step(1.2); check('in the river', st.mode === 'swim', st.mode); await snap('splash');
check('swim objective', /west bank/i.test(st.obj), st.obj);
st = await step(1.6); check('cottonmouths toast', /cottonmouths/i.test(st.toast), st.toast);

// swim to the west bank by hand: face it, hold forward
await g(() => __game.look(Math.PI / 2 + .1, .28));
await key('w');
for (let i = 0; i < 40 && st.mode === 'swim'; i++) { st = await step(1); if (st.hp <= 1) await g(() => { __game.S.hp = 3; }); }
await key('w', false);
check('climbed out', st.mode === 'land', st.mode); check('noose off', /noose/i.test(st.toast), st.toast); await snap('bank');

// up to the road and across the bridge with the planks falling behind
await g(() => { __game.place(-23, 2); __game.look(-Math.PI / 2, .3); });
st = await step(.1); await key('w'); st = await step(.6); check('bridge starts', st.mode === 'bridge', st.mode); await snap('bridge');
for (let i = 0; i < 60 && st.mode === 'bridge'; i++) {
  // hop any time the plank ahead is a hole
  const hop = await g(() => { const p = __game.player.pos; return p.x > -21 && p.x < 21; });
  if (hop && i % 2 === 0) await key(' '); st = await step(.25); await key(' ', false); st = await step(.25);
}
await key('w', false);
check('into town', st.mode === 'town', [st.mode, st.pos]); await snap('town');

// Coop's bag to Tre
await g(() => { const c = __game.npcs.coop; __game.place(c.x, c.z - 1.5); });
st = await step(.1); check('talk prompt', /Coop/.test(st.prompt), st.prompt);
await key('e'); st = await step(.05); await key('e', false); check('coop talks', st.dialog?.who === 'Coop', st.dialog); await snap('coop');
st = await g(() => __game.choose(0)); check('beans ask', /Beans ain/.test(st.dialog?.say), st.dialog);
st = await g(() => __game.choose(0)); st = await g(() => __game.choose(0)); check('got the bag', st.flags.bag === true, st.flags);
st = await g(() => __game.choose(0)); check('dialog closed', st.mode === 'town' && /Tre/.test(st.obj), [st.mode, st.obj]);
await g(() => { const c = __game.npcs.tre; __game.place(c.x - 1.5, c.z); });
st = await step(.1); await key('e'); st = await step(.05); await key('e', false); check('tre talks', st.dialog?.who === 'Tre', st.dialog);
st = await g(() => __game.choose(0)); check('delivered', st.flags.delivered === true && st.beans === 2, st); st = await g(() => __game.choose(0));
await g(() => { const c = __game.npcs.coop; __game.place(c.x, c.z - 1.5); });
st = await step(.1); await key('e'); st = await step(.05); await key('e', false); check('coop pays', st.beans === 5, st.beans); st = await g(() => __game.choose(0));

// sweep for Odessa, then the cans take it to twelve
await g(() => { const c = __game.npcs.odessa; __game.place(c.x, c.z + 1.5); });
st = await step(.1); await key('e'); st = await step(.05); await key('e', false); check('odessa talks', st.dialog?.who === 'Miss Odessa', st.dialog);
st = await g(() => __game.choose(0)); st = await g(() => __game.choose(0)); check('sweeping', st.mode === 'sweep', st.mode);
await key('e'); st = await step(3.4); await key('e', false); check('swept', st.flags.swept === true && st.beans === 8, st); await snap('swept');
st = await g((i) => __game.choose(i), st.dialog.opts.length - 1);
const cans = await g(() => __game.pickups.length);
for (let i = 0; i < cans && st.beans < 12; i++) { await g((i) => { const c = __game.pickups[i]; __game.place(c.x, c.z); }, i); st = await step(.2); }
check('twelve beans', st.beans >= 12, st.beans);
st = await step(2); check('chapter ends', st.mode === 'end', st.mode); await snap('end');

check('no console errors', errors.length === 0, errors);
await browser.close(); server.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
