// tools/browser.mjs's watch on the screenshots a check keeps, on a plain page in Chrome rather than the game, so it's quick.
// It needs Chrome, so where there's none to start, as on GitHub's machines, it's skipped; npm run check runs it on the Mac.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright-core';
import { watchShots } from './browser.mjs';

let browser = null;
const dir = mkdtempSync(join(tmpdir(), 'chunky-shots-'));
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => null); });
after(async () => { await browser?.close(); rmSync(dir, { recursive: true, force: true }); });
const painted = async (html) => {
  const page = await browser.newPage({ viewport: { width: 120, height: 80 } });
  await page.setContent(`<style>html,body{margin:0;height:100%}</style>${html}`);
  watchShots(page);
  return page;
};
const RED = '<div style="height:100%;background:#c41e1e"></div>';

test('a screenshot a check keeps that\'s nearly all one colour fails it, saying how much and what colour, and is still kept', async (t) => {
  if (!browser) return t.skip('no Chrome to start');
  const page = await painted(RED), path = join(dir, 'all-red.png');
  await assert.rejects(page.screenshot({ path }), /all-red\.png is 100% #c41e1e/);
  assert.ok(existsSync(path), 'kept, to look at');
});

test('one that\'s meant to be all one colour says so, and passes', async (t) => {
  if (!browser) return t.skip('no Chrome to start');
  const page = await painted(RED), path = join(dir, 'meant.png');
  await page.screenshot({ path, flat: true });
  assert.ok(existsSync(path));
});

test('one with things in it passes, and so does any screenshot a check looks at without keeping', async (t) => {
  if (!browser) return t.skip('no Chrome to start');
  const scene = await painted('<div style="height:60%;background:#96b4dc"></div><div style="height:40%;display:flex"><div style="flex:7;background:#466e28"></div><div style="flex:3;background:#0c0e1e"></div></div>');
  await scene.screenshot({ path: join(dir, 'scene.png') });
  const red = await painted(RED);
  assert.ok((await red.screenshot()).length > 0, 'a screenshot that isn\'t kept is the check\'s own business');
});
