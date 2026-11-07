// First-time-player fishing controls: real touch input and the running game clock, not stepped fishing states.
// Only the starting place and gear are fixtures. After that the player responds to visible prompts.
// npm run fishing:input -- [--shots dir]
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serveAndOpen } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) await mkdir(shots, { recursive: true });
const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
const cdp = await page.context().newCDPSession(page);
const snap = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.jpg` }); };
const view = () => page.evaluate(() => __game.fishing.view());
const words = () => page.locator('#prompt').innerText();
let held = false, point;
async function hold(down, target = '#prompt', cancel = false) {
  if (down === held) return;
  if (down) { const r = await page.locator(target).boundingBox(); point = { x: r.x + r.width / 2, y: r.y + r.height / 2, id: 1 }; }
  await cdp.send('Input.dispatchTouchEvent', { type: down ? 'touchStart' : cancel ? 'touchCancel' : 'touchEnd', touchPoints: down ? [point] : [] });
  held = down;
}
async function start(hole) {
  await hold(false);
  await page.reload();
  await page.waitForFunction(() => window.__game);
  await page.evaluate((id) => {
    const G = __game; G.pause(); G.jump('town'); G.S.flags.town = G.S.flags.arrived = true; G.S.beans = 0; G.talk.on(null);
    document.getElementById('card').style.display = 'none';
    G.fishing.give(); const h = G.coop.hole(id); G.place(h.x, h.z); G.player.yaw = h.yaw; G.look(h.yaw + Math.PI, .25);
    G.step(.1); G.resume();
  }, hole);
  await page.locator('#bA').filter({ hasText: 'CAST' }).tap();
}
const waitWords = (text, timeout = 15000) => page.waitForFunction((text) => document.getElementById('prompt').innerText.toLowerCase().includes(text), text, { timeout });
try {
  await start('trestle-near');
  assert.equal(await page.locator('#prompt').evaluate((e) => getComputedStyle(e).pointerEvents), 'auto', 'the central fishing prompt looks like a button: it must accept a tap');
  await waitWords('bite');
  // The waiting instructions also mention a bite; wait for the actual HOOK control, then allow a human reaction time.
  await page.waitForFunction(() => document.getElementById('bA').textContent === 'HOOK', null, { timeout: 15000 });
  await page.waitForTimeout(250);
  await page.locator('#prompt').tap();
  await waitWords('hooked', 2000);
  assert.equal((await view()).state, 'hooked');
  assert.match(await words(), /hold.*reel/i, 'a tap must visibly confirm the hook and explain what to do next');
  await snap('1-hooked');
  const before = await view();
  await hold(true); await page.waitForTimeout(650); await hold(false, '#prompt', true);
  const reeled = await view();
  assert(reeled.line < before.line - .4, 'holding the central prompt brings the line in');
  assert.match(await words(), /\d+ m out/i, 'the player can see their reeling progress');
  await page.waitForTimeout(250);
  const released = await view();
  assert(released.line >= reeled.line, 'cancelling the touch releases the reel instead of leaving it stuck down');
  assert(released.strain < reeled.strain, 'letting go eases the line');
  console.log('ok central prompt hooks, holding reels, and touch cancellation releases; visible feedback and progress');

  let sawRun = false, caught = false;
  const end = Date.now() + 45000;
  while (Date.now() < end) {
    const text = await words();
    if (await page.locator('#toast').evaluate((e) => /catfish/i.test(e.textContent))) { caught = true; break; }
    if (/let go/i.test(text)) { sawRun = true; await hold(false); }
    else if (/hold.*reel/i.test(text)) await hold(true);
    else throw new Error(`Lost the fishing flow: ${text}`);
    await page.waitForTimeout(50);
  }
  await hold(false);
  assert(caught && sawRun, 'following only the visible hold/release instructions lands a fish, including a run');
  assert.equal(await page.evaluate(() => __game.fishing.caught().length), 1);
  await snap('2-caught');
  console.log('ok a complete catch using visible instructions and real-time touch input, without stepping or reading state to steer');

  await start('under-us80-east');
  await page.waitForFunction(() => document.getElementById('bA').textContent === 'HOOK', null, { timeout: 15000 });
  await page.locator('#bA').tap();
  await waitWords('hooked', 2000);
  const b = await view(); await hold(true, '#bA'); await page.waitForTimeout(600); await hold(false);
  assert((await view()).line < b.line - .4, 'the original corner REEL button still works too');
  console.log('ok corner HOOK/REEL button also hooks and reels with real touch input');

  await start('pond-us80-east');
  await page.waitForFunction(() => document.getElementById('bA').textContent === 'HOOK', null, { timeout: 15000 });
  await page.waitForFunction(() => /missed/i.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  assert.equal((await view()).state, 'idle');
  await page.waitForFunction(() => document.getElementById('bA').textContent === 'CAST', null, { timeout: 1000 });
  assert.equal(await page.locator('#bA').innerText(), 'CAST');
  assert.equal(await page.locator('#prompt').evaluate((e) => getComputedStyle(e).pointerEvents), 'none', 'the prompt only captures fishing actions, not other game prompts');
  await snap('3-missed');
  console.log('ok missing a bite says so and returns to CAST; no invisible interactive prompt left behind');
  assert.deepEqual(errors, []);
} catch (e) {
  await snap('failure'); throw e;
} finally {
  await hold(false); await close();
}
// Like the other browser tools: Chrome may outlive close()'s bounded wait; don't leave a passed check hanging.
process.exit(0);
