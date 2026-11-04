// Serves the repo and opens the game in the system Chrome with the GPU on, so WebGL runs for real. Every screenshot a check keeps
// is looked at, and one that's nearly all one colour fails the check, since that's the camera inside something, such as his hood.
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { WALL, oneColour } from './picture.mjs';

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

// How much of a screenshot is one colour, and which (tools/picture.mjs), decoded in `page`, which only has to be open
export const oneColourIn = (page, image) => page.evaluate(async ([b64, measure]) => {
  const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
  const canvas = new OffscreenCanvas(bmp.width, bmp.height), g = canvas.getContext('2d');
  g.drawImage(bmp, 0, 0);
  return (0, eval)(`(${measure})`)(g.getImageData(0, 0, canvas.width, canvas.height));
}, [Buffer.from(image).toString('base64'), oneColour.toString()]);

// A kept screenshot that's a wall of one colour, more of it than tools/picture.mjs's WALL, fails the check. The night's never a
// wall, so the dark at the end of a fever is fine as it is. One that's meant to be a wall, such as the train's light when it's all
// there is, says so with { flat: true } among its options, which Playwright never sees.
const WATCHED = Symbol('watched');
export function watchShots(page) {
  if (page[WATCHED]) return page;
  page[WATCHED] = true;
  const shoot = page.screenshot.bind(page);
  page.screenshot = async ({ flat = false, ...options } = {}) => {
    const image = await shoot(options);
    if (options.path && !flat) {
      const { share, colour } = await oneColourIn(page, image);
      if (share > WALL) throw new Error(`${basename(options.path)} is ${Math.round(share * 100)}% ${colour}: is the camera inside something? One that's meant to be one colour says so with { flat: true }`);
    }
    return image;
  };
  return page;
}

// `overrides` serves its contents at those paths in place of what's in the repo, or as well as it. Null means there's nothing there.
// `args` go to Chrome as well as the GPU's.
export async function serveAndOpen({ touch = false, viewport, query = '?test', reducedMotion, overrides = {}, args = [] } = {}) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    try {
      if (overrides[path] === null) throw new Error('not there');
      const body = overrides[path] ?? await readFile(join(ROOT, path === '/' ? 'index.html' : path));
      res.writeHead(200, { 'content-type': MIME[extname(path) || '.html'] || 'application/octet-stream' }); res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', ...args] });
  const size = viewport || (touch ? { width: 390, height: 844 } : { width: 513, height: 696 });
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch, reducedMotion });
  await context.route(CDN, fromCache);
  context.on('page', watchShots);
  const page = watchShots(await context.newPage());
  // What's written on the screen right now, a line at a time: whatever anything in the page says other than its dials, which are the HUD (the street, the objective and how far it is, the speed,
  // hearts, beans and pockets, and the people panel, which is the names of the people he knows), the buttons and what the big one would do ("Get in the pickup"). Those change all the time
  // as he moves, and none of them is a reason. The checks that watch one of the crowd stop, turn to him and flare compare it before and after, because nothing on the screen says why.
  await page.addInitScript(() => {
    window.screenText = () => {
      const dials = '.hud, #btns, #stick, #prompt, #keyStrip', shown = (e) => { const c = getComputedStyle(e); return c.display !== 'none' && c.visibility !== 'hidden'; };
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
