// Serves the repo and opens the game in the system Chrome with the GPU on, so WebGL runs for real.
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

// The game gets three.js from jsDelivr and its fonts from Google. Once a check has fetched one of those files, every
// check after it gets the same bytes from data/raw/cdn/, so a dropped connection or a slow CDN can't fail a check, and
// nothing that's drawn changes. A file that won't fetch is left to the browser, as it was.
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, CACHE = join(ROOT, 'data', 'raw', 'cdn');
async function fromCache(route) {
  const req = route.request(), file = join(CACHE, createHash('sha1').update(`${req.url()}\n${req.headers()['user-agent'] || ''}`).digest('hex'));
  try {
    const [body, headers] = await Promise.all([readFile(file), readFile(file + '.json', 'utf8')]);
    return await route.fulfill({ status: 200, headers: JSON.parse(headers), body });
  } catch {}
  try {
    const res = await route.fetch();
    if (!res.ok()) return await route.fulfill({ response: res });
    const body = await res.body(), headers = { 'content-type': res.headers()['content-type'] || 'application/octet-stream', 'access-control-allow-origin': '*' };
    await mkdir(CACHE, { recursive: true });
    await writeFile(file + '.json', JSON.stringify(headers));
    await writeFile(`${file}.${process.pid}`, body); await rename(`${file}.${process.pid}`, file);
    return await route.fulfill({ status: 200, headers, body });
  } catch { return route.continue().catch(() => {}); }
}

// `overrides` serves its contents at those paths in place of what's in the repo, or as well as it. Null means there's nothing there.
export async function serveAndOpen({ touch = false, viewport, query = '?test', reducedMotion, overrides = {} } = {}) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    try {
      if (overrides[path] === null) throw new Error('not there');
      const body = overrides[path] ?? await readFile(join(ROOT, path === '/' ? 'index.html' : path));
      res.writeHead(200, { 'content-type': MIME[extname(path) || '.html'] || 'application/octet-stream' }); res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const size = viewport || (touch ? { width: 390, height: 844 } : { width: 513, height: 696 });
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch, reducedMotion });
  await context.route(CDN, fromCache);
  const page = await context.newPage();
  // What's written on the screen right now, a line at a time: whatever anything in the page says other than its dials, which are the HUD (the street, the objective and how far it is, the speed,
  // hearts, beans and pockets, and the people panel, which says how each of them is with him), the buttons, what the big one would do ("Get in the pickup") and the name tag over whoever's
  // nearest. Those change all the time as he moves and as the crowd does, and none of them is a reason. The checks that watch one of the crowd stop, turn to him and flare compare it before and after, because nothing on the screen says why.
  await page.addInitScript(() => {
    window.screenText = () => {
      const dials = '.hud, #btns, #stick, #prompt, #who, #keyStrip', shown = (e) => { const c = getComputedStyle(e); return c.display !== 'none' && c.visibility !== 'hidden'; };
      return [...document.body.children].filter((e) => !e.matches(`${dials}, script, style, canvas`) && shown(e)).flatMap((e) => e.innerText.split('\n')).map((l) => l.trim()).filter(Boolean);
    };
  });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|ERR_TIMED_OUT/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  // The first check on a machine fetches three.js and the fonts, and that can be slow enough to take most of a minute.
  await page.goto(`http://localhost:${server.address().port}/${query}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
  // Chrome sometimes never finishes closing, and every check waits on this before it reports. So it gets 8 s, and
  // Playwright stops anything still running when the check exits.
  return { page, errors, close: async () => { await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 8000))]); server.close(); } };
}

// What's written on the screen right now, from outside the page (inside it, window.screenText() is the same). There's no line for why one of them is coming for him and nothing in the page to put one in.
export const screenLines = (page) => page.evaluate(() => window.screenText());
// What's on the screen now that wasn't there before.
export const newLines = (before, after) => after.filter((l) => !before.includes(l));
// Whether the page has anything to say why with: the element that used to hold the line is gone.
export const hasWhyBox = (page) => page.evaluate(() => !!document.getElementById('why'));
