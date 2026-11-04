// Plays the opening twice in real Chrome, once as it is here and once as it is at a git ref, origin/main unless it's given another, and
// fails unless every frame is the same to the byte: for a change that isn't meant to touch the opening, such as playing together, whose
// lines in index.html do nothing in a game on its own. The frames are read straight off the WebGL canvas in the task that drew them,
// because the held clock and the seeded random numbers make those exactly repeatable, and a page screenshot isn't: it comes back a few
// levels different on the same code. 2D canvases are drawn on the CPU here, because on the GPU one of the hoodie's hatch textures comes
// out one of two ways, whichever way a race in Chrome goes.
//
//   npm run frames -- [git ref] [--shots dir]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { serveAndOpen } from './browser.mjs';

const args = process.argv.slice(2), shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const ref = args[0] && !args[0].startsWith('--') ? args[0] : 'origin/main';
const git = (...a) => execFileSync('git', a, { maxBuffer: 1 << 28 });

async function opening(overrides, name) {
  const { page, errors, close } = await serveAndOpen({ overrides, args: ['--disable-accelerated-2d-canvas'] });
  const out = {};
  const grab = async (beat, seconds) => {
    const url = await page.evaluate((s) => { __game.step(s); return __game.renderer.domElement.toDataURL('image/png'); }, seconds), png = Buffer.from(url.split(',')[1], 'base64');
    out[beat] = createHash('sha256').update(png).digest('hex');
    if (shots) { await mkdir(join(shots, name), { recursive: true }); await writeFile(join(shots, name, beat + '.png'), png); }
  };
  const key = (k, down = true) => page.evaluate(([k, d]) => __game.key(k, d), [k, down]);
  const jump = (phase) => page.evaluate((p) => __game.jump(p), phase);
  await grab('00-title', .5);
  await page.click('#start');
  await grab('01-hanging', 1);
  await grab('02-he-decides', 3.2);
  await grab('03-cut-prompt', 2.5);
  await key('e'); await grab('04-sawing', 1.2);
  await grab('05-rope-cut', 1.3); await key('e', false);
  await grab('06-splash', 1.2);
  await grab('07-in-the-river', 1.6);
  await page.evaluate(() => __game.look(Math.PI / 2 + .1, .28)); await key('w');
  await grab('08-swimming', 6); await key('w', false);
  await jump('land'); await page.evaluate(() => { __game.place(-23, 2); __game.look(-Math.PI / 2, .3); });
  await grab('09-the-road', .1);
  await key('w'); await grab('10-bridge-starts', .6);
  await grab('11-on-the-bridge', 2); await key('w', false);
  await jump('bitten'); await grab('12-bitten', 1);
  await grab('13-he-goes-down', 2);
  await jump('dream'); await grab('14-the-fever', 4);
  await jump('wake'); await grab('15-he-comes-to', 2);
  await jump('town'); await grab('16-town', 1);
  await close();
  return { frames: out, errors };
}

// What's different from the ref, as it is there. Anything new since then is left where it is, and the old page won't ask for it.
const overrides = {};
for (const path of git('diff', '--name-only', ref, '--', 'index.html', 'src', 'data').toString().split('\n').filter(Boolean)) {
  try { overrides['/' + path] = git('show', `${ref}:${path}`); } catch { /* it's new */ }
}
if (overrides['/index.html']) overrides['/'] = overrides['/index.html'];
console.log(`against ${ref}: ${Object.keys(overrides).filter((p) => p !== '/').join(', ') || 'nothing'} differs`);

const was = await opening(overrides, 'was'), now = await opening({}, 'now');
let failed = 0;
for (const beat of Object.keys(was.frames)) {
  const same = was.frames[beat] === now.frames[beat];
  console.log(`${same ? 'ok  ' : 'FAIL'} ${beat} ${now.frames[beat].slice(0, 16)}`);
  if (!same) failed++;
}
for (const e of [...was.errors, ...now.errors]) { console.log('FAIL console error:', e); failed++; }
console.log(failed ? `${failed} failed` : 'every frame the same to the byte');
process.exit(failed ? 1 : 0);
