// The changelog page on a phone: built from the real changelog/entries.json, and again from a disposable multi-entry changelog, each
// served locally at 390x844 with touch. Every article and every feed entry is read back and compared with the entries it was built
// from (tools/changelog-play.mjs); the archive is opened by touch and every article is scrolled to before it's measured; and the Feed
// and Play links are tapped for real. Play goes to a stub, so nothing reaches the game.
//
//   npm run changelog:play [-- --shots dir] [--real | --fixture]
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { CDN, fromCache, watchShots } from './browser.mjs';
import { GAME, build } from './changelog.mjs';
import { compare, expectedOf, parseFeed, writeFixture } from './changelog-play.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
const only = process.argv.includes('--real') ? 'real' : process.argv.includes('--fixture') ? 'fixture' : null;
let failed = 0, label = '', dir = shots;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const shoot = (page, name, flat = false) => dir ? page.screenshot({ path: join(dir, name), flat }) : Promise.resolve();

const TYPES = { '.html': 'text/html; charset=utf-8', '.xml': 'application/atom+xml; charset=utf-8', '.png': 'image/png' };

// What the page says, read in the browser: each article in the shape the entries are expected in.
function readPage() {
  const text = (el) => el?.textContent.trim() ?? '';
  const article = (a) => ({
    words: text(a.querySelector('time')), iso: a.querySelector('time')?.getAttribute('datetime') ?? null, title: text(a.querySelector('h3')),
    ticket: a.querySelector('.meta span') ? text(a.querySelector('.meta span')) : null, paras: [...a.querySelectorAll('div > p:not(.meta)')].map(text),
    images: [...a.querySelectorAll('img')].map((i) => ({ src: i.getAttribute('src'), alt: i.getAttribute('alt') })),
  });
  const top = document.querySelector('main section:first-of-type');
  return {
    top: top?.querySelector('h2') ? { heading: text(top.querySelector('h2')), items: [...top.querySelectorAll('article.entry')].map(article) } : null,
    archive: [...document.querySelectorAll('details')].map((d) => ({ summary: text(d.querySelector('summary b')), weekday: text(d.querySelector('summary span')), items: [...d.querySelectorAll('article.entry')].map(article) })),
    all: document.querySelectorAll('article.entry').length,
  };
}

// One article, once it's been scrolled to: where its parts are (in page coordinates), how big their text is, and whether they're all
// there. The first is what it sits under: the build's heading or its summary.
function measure(i) {
  const art = document.querySelectorAll('article.entry')[i], sy = scrollY, sx = scrollX;
  const box = (el, kind) => {
    const r = el.getBoundingClientRect(), c = getComputedStyle(el);
    return {
      kind, text: el.textContent.trim().slice(0, 30), x: r.left + sx, y: r.top + sy, r: r.right + sx, b: r.bottom + sy, size: parseFloat(c.fontSize),
      shown: c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0 && r.width > 0 && r.height > 0,
      clipped: kind !== 'image' && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1), loaded: kind !== 'image' || (el.complete && el.naturalWidth > 0),
    };
  };
  const above = art.closest('details')?.querySelector('summary') ?? document.querySelector('main h2');
  return [box(above, 'label'), box(art.querySelector('time'), 'meta'), ...[...art.querySelectorAll('.meta span')].map((e) => box(e, 'meta')), box(art.querySelector('h3'), 'title'),
    ...[...art.querySelectorAll('div > p:not(.meta)')].map((e) => box(e, 'body')), ...[...art.querySelectorAll('img')].map((e) => box(e, 'image'))];
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });

// one pass over a changelog: siteRoot has changelog/entries.json (and img/), entries is what's in it
async function run(name, siteRoot, entries) {
  label = name ? `[${name}] ` : '';
  dir = shots && name ? join(shots, name) : shots;
  if (dir) mkdirSync(dir, { recursive: true });
  const out = mkdtempSync(join(tmpdir(), 'changelog-play-'));
  build(siteRoot, out);
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname, file = path === '/' ? 'index.html' : path.slice(1);
    try { const body = readFileSync(join(out, file)); res.writeHead(200, { 'content-type': TYPES[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream' }); res.end(body); } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  let context;
  try {
    context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
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
    // a real touch at the centre of something
    const touch = async (loc) => { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
    await shoot(page, 'page.png');

    // the archive starts folded: open each build with a tap on its summary
    const want = expectedOf(entries), sums = page.locator('details > summary'), folded = await page.locator('details[open]').count();
    check('the archive starts folded', folded === 0, folded);
    for (let i = 0; i < await sums.count(); i++) {
      await touch(sums.nth(i));
      check(`archive build ${i + 1} opens when tapped`, await page.locator('details').nth(i).evaluate((d) => d.open), i);
    }
    const seen = await page.evaluate(readPage);
    seen.feed = parseFeed(readFileSync(join(out, 'feed.xml'), 'utf8'));
    const bad = compare(want, seen);
    check(`page and feed say what the ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} in ${want.archive.length + 1} build${want.archive.length ? 's' : ''} say`, bad.length === 0, bad);
    check('every entry is on the page once', seen.all === entries.length, [seen.all, entries.length]);

    // each article scrolled to, then read for what a phone shows of it; it needn't fit the first screen, only be whole and legible
    let shotArchive = false, shotImage = false;
    for (let i = 0; i < entries.length; i++) {
      await page.evaluate((n) => document.querySelectorAll('article.entry')[n].scrollIntoView({ block: 'start' }), i);
      await page.waitForFunction((n) => [...document.querySelectorAll('article.entry')[n].querySelectorAll('img')].every((m) => m.complete), i, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(100);
      const boxes = await page.evaluate(measure, i), n = `entry ${i + 1}`, parts = boxes.filter((b) => b.kind !== 'label');
      const fits = (b) => b.shown && b.loaded && !b.clipped && b.x >= 0 && b.r <= 390;
      check(`${n} is shown, whole and inside the 390px width`, boxes.every(fits), boxes.filter((b) => !fits(b)));
      check(`${n} date and title are readable (>= 12px)`, boxes.filter((b) => ['label', 'meta', 'title'].includes(b.kind)).every((b) => b.size >= 12), boxes.map((b) => [b.kind, b.size]));
      const body = boxes.filter((b) => b.kind === 'body');
      check(`${n} body text is at least 15px`, body.length > 0 && body.every((b) => b.size >= 15), boxes.map((b) => [b.kind, b.size]));
      const overlap = boxes.some((a, x) => boxes.some((b, y) => y > x && a.x < b.r && b.x < a.r && a.y < b.b - 0.5 && b.y < a.b - 0.5));
      check(`${n} nothing overlaps`, !overlap, boxes.map((b) => [b.kind, b.text, b.y, b.b]));
      const img = parts.find((b) => b.kind === 'image');
      if (img) check(`${n} picture is drawn and fits the 390px width`, img.loaded && img.r - img.x <= 390 && img.x >= 0 && img.r <= 390 && img.b > img.y, img);
      if (img && !shotImage) { shotImage = true; await shoot(page, 'entry-image.png'); }
      if (!shotArchive && await page.evaluate((k) => !!document.querySelectorAll('article.entry')[k].closest('details'), i)) { shotArchive = true; await shoot(page, 'entry-archive.png'); }
    }
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    check('no horizontal scroll', sw[0] <= sw[1], sw);

    // real taps, at the centre of each link
    const tap = (text) => touch(page.getByRole('link', { name: text, exact: true }).first());
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
  } finally {
    await context?.close().catch(() => {});
    server.close(); rmSync(out, { recursive: true, force: true });
  }
}

try {
  // the real changelog, then a disposable one in the temp folder that is never published: the same path over both
  if (only !== 'fixture') await run(only ? '' : 'real', root, JSON.parse(readFileSync(join(root, 'changelog', 'entries.json'), 'utf8')));
  if (only !== 'real') {
    const tmp = mkdtempSync(join(tmpdir(), 'changelog-fixture-'));
    try { await run(only ? '' : 'fixture', tmp, writeFixture(tmp)); } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
} catch (err) {
  console.log(`FAIL check crashed -- ${err.stack || err}`); failed++;
} finally {
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 8000))]);
}
if (failed) { console.error(`${failed} check${failed > 1 ? 's' : ''} failed`); process.exit(1); }
console.log('changelog page ok');
process.exit(0);
