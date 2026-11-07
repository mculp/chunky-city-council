// The changelog page on a phone: built from the real changelog/entries.json, served locally at 390x844 with touch, read for its date,
// build and title, its paragraphs and its feed, and its Feed and Play links tapped for real. Play goes to a stub, so nothing reaches the game.
//
//   npm run changelog:play [-- --shots dir]
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { CDN, fromCache, watchShots } from './browser.mjs';
import { GAME, build, whenOf } from './changelog.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const shoot = (page, name, flat = false) => shots ? page.screenshot({ path: join(shots, name), flat }) : Promise.resolve();

const entries = JSON.parse(readFileSync(join(root, 'changelog', 'entries.json'), 'utf8')), e = entries[0], when = whenOf(e.date, e.time);
const out = mkdtempSync(join(tmpdir(), 'changelog-play-'));
build(root, out);
const TYPES = { '.html': 'text/html; charset=utf-8', '.xml': 'application/atom+xml; charset=utf-8' };
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname, name = path === '/' ? 'index.html' : path.slice(1);
  try { const body = readFileSync(join(out, name)); res.writeHead(200, { 'content-type': TYPES[name.slice(name.lastIndexOf('.'))] || 'application/octet-stream' }); res.end(body); } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await context.route(CDN, fromCache);
  let stubbed = 0;
  await context.route(GAME + '**', (route) => { stubbed++; return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#3d0f30;color:#f1e6cf;font:24px sans-serif;padding:40px 20px"><h1>Play (stub)</h1><p>The game would open here.</p></body>' }); });
  const outside = [], errors = [];
  context.on('request', (r) => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith('data:') && !CDN.test(u) && u !== GAME) outside.push(u); });
  const page = watchShots(await context.newPage());
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|ERR_TIMED_OUT/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (x) => errors.push(x.message));
  await page.goto(base, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);

  const info = await page.evaluate(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect(), c = getComputedStyle(el);
      return { text: el.textContent.trim(), x: r.left, y: r.top, r: r.right, b: r.bottom, size: parseFloat(c.fontSize), shown: c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0 && r.width > 0 && r.height > 0, clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1 };
    };
    const art = document.querySelector('article.entry');
    return {
      time: box(art.querySelector('time')), title: box(art.querySelector('h3')), build: box(document.querySelector('main h2')),
      paras: [...art.querySelectorAll('div > p:not(.meta)')].map(box), imgs: document.querySelectorAll('img').length, articles: document.querySelectorAll('article.entry').length,
      scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth,
    };
  });
  check('date reads as expected', info.time.text === when.words && info.time.text === 'Saturday 7 November 2026, 2:05 am', info.time.text);
  check('build reads "Build 324"', info.build.text === 'Build 324', info.build.text);
  check('title reads as the entry', info.title.text === e.title, info.title.text);
  for (const [n, b] of [['date', info.time], ['build', info.build], ['title', info.title]]) {
    check(`${n} is visible and inside the screen`, b.shown && b.x >= 0 && b.r <= 390 && b.y >= 0 && b.b <= 844, b);
    check(`${n} is not clipped`, !b.clipped, b);
    check(`${n} is readable (>= 12px)`, b.size >= 12, b.size);
  }
  const rects = [info.build, info.time, info.title, ...info.paras];
  const overlap = rects.some((a, i) => rects.some((b, j) => j > i && a.x < b.r && b.x < a.r && a.y < b.b - 0.5 && b.y < a.b - 0.5));
  check('nothing overlaps', !overlap, rects.map((r) => [r.text.slice(0, 20), r.y, r.b]));
  check('body text is at least 15px', info.paras.length > 0 && info.paras.every((p) => p.size >= 15 && p.shown && !p.clipped), info.paras.map((p) => p.size));
  check('no horizontal scroll', info.scrollWidth <= info.width, [info.scrollWidth, info.width]);
  check('exactly the three paragraphs, in order', JSON.stringify(info.paras.map((p) => p.text)) === JSON.stringify(e.text) && e.text.length === 3, info.paras.map((p) => p.text));
  check('one entry and no image', info.articles === 1 && info.imgs === 0, [info.articles, info.imgs]);
  await shoot(page, 'page.png');

  // the feed says what the page says
  const xml = readFileSync(join(out, 'feed.xml'), 'utf8'), unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const fe = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [], f = fe[0] || '';
  const fTitle = unesc(f.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''), fUpdated = f.match(/<updated>([^<]*)<\/updated>/)?.[1];
  const fParas = [...unesc(f.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] ?? '').matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => unesc(m[1]));
  const pageIso = await page.$eval('article.entry time', (t) => t.getAttribute('datetime'));
  check('feed has the one entry with the page\'s title', fe.length === 1 && fTitle === info.title.text, [fe.length, fTitle]);
  check('feed has the page\'s paragraphs, in order', JSON.stringify(fParas) === JSON.stringify(info.paras.map((p) => p.text)), fParas);
  check('feed updated is the entry\'s time, as on the page', fUpdated === when.iso && fUpdated === pageIso, [fUpdated, when.iso, pageIso]);

  // real taps, at the centre of each link
  const tap = async (label) => {
    const link = page.getByRole('link', { name: label, exact: true }).first();
    await link.scrollIntoViewIfNeeded();
    const b = await link.boundingBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  };
  await tap('Feed');
  await page.waitForURL(base + 'feed.xml', { timeout: 15000 }).catch(() => {});
  check('Feed tap reaches feed.xml', page.url() === base + 'feed.xml', page.url());
  await page.waitForLoadState('load');
  // Chrome's view of a raw feed is a few lines of text on white, which is a wall of one colour by the guard's measure and meant to be
  await shoot(page, 'feed.png', true);
  await page.goBack({ waitUntil: 'load' });
  await tap('Play');
  await page.waitForURL(GAME, { timeout: 15000 }).catch(() => {});
  check('Play tap reaches the stubbed game address', page.url() === GAME && stubbed >= 1, [page.url(), stubbed]);
  await page.waitForLoadState('load');
  await shoot(page, 'play-stub.png');
  check('no request left the machine but the fonts and the Play stub', outside.length === 0, outside);
  check('no page or console errors', errors.length === 0, errors);
} catch (err) {
  console.log(`FAIL check crashed -- ${err.stack || err}`); failed++;
} finally {
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 8000))]);
  server.close(); rmSync(out, { recursive: true, force: true });
}
if (failed) { console.error(`${failed} check${failed > 1 ? 's' : ''} failed`); process.exit(1); }
console.log('changelog page ok');
process.exit(0);
