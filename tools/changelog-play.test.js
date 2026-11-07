// The changelog phone check's expectations, in plain Node: worked out from the entries, compared with what a page and a feed say, and
// shown to catch what's wrong so that the check can't pass by saying nothing. The browser half is tools/play-changelog.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, page, feed, MOST, sizeOf } from './changelog.mjs';
import { FIXTURE, compare, expectedOf, parseFeed, writeFixture } from './changelog-play.mjs';

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
// what a page says, read back out of page()'s own html in the shape the check reads from the browser
function seenOf(entries, images) {
  const html = page(entries, { images }), xml = feed(entries);
  const articles = (h) => (h.match(/<article[\s\S]*?<\/article>/g) || []).map((a) => ({
    words: unesc(a.match(/<time[^>]*>([^<]*)<\/time>/)[1]), iso: a.match(/datetime="([^"]*)"/)[1], title: unesc(a.match(/<h3>([\s\S]*?)<\/h3>/)[1]),
    ticket: a.match(/<\/time><span>([^<]*)<\/span>/)?.[1] ?? null, paras: [...a.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => unesc(m[1])),
    images: [...a.matchAll(/<img src="([^"]*)"[^>]* alt="([^"]*)"/g)].map((m) => ({ src: m[1], alt: unesc(m[2]) })),
  }));
  const main = html.slice(html.indexOf('<main>')), archiveAt = main.indexOf('<h2>Archive</h2>'), top = archiveAt < 0 ? main : main.slice(0, archiveAt);
  return {
    top: { heading: unesc(top.match(/<h2>([^<]*)<\/h2>/)[1]), items: articles(top) },
    archive: [...main.matchAll(/<details>\n<summary><b>([^<]*)<\/b><span>([^<]*)<\/span><\/summary>([\s\S]*?)<\/details>/g)].map((m) => ({ summary: m[1], weekday: m[2], items: articles(m[3]) })),
    feed: parseFeed(xml),
  };
}

describe('expectations from the entries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'changelog-play-test-')), root = fileURLToPath(new URL('..', import.meta.url));
  writeFixture(dir);
  const png = readFileSync(join(dir, 'changelog', 'img', 'fixture.png')), imgs = new Map([['fixture.png', png]]);
  const real = JSON.parse(readFileSync(join(root, 'changelog', 'entries.json'), 'utf8'));
  const seen = () => structuredClone(seenOf(FIXTURE, imgs));
  test.after(() => rmSync(dir, { recursive: true, force: true }));

  test('the newest build is on top and older builds are archive summaries in first-seen order', () => {
    const want = expectedOf(FIXTURE);
    assert.equal(want.top.heading, 'Build 902');
    assert.deepEqual(want.top.items.map((i) => i.title), [FIXTURE[0].title, FIXTURE[1].title]);
    assert.deepEqual(want.archive.map((g) => g.summary), ['Build 901', 'Build 900']);
    assert.deepEqual(want.archive.map((g) => g.weekday), ['Friday 20 November 2026', 'Tuesday 10 November 2026']);
    assert.equal(want.feed.length, 4);
  });
  test('the fixture is varied enough to mean something', () => {
    assert.ok(FIXTURE.length >= 3 && new Set(FIXTURE.map((e) => e.build)).size >= 2 && new Set(FIXTURE.map((e) => e.date)).size >= 2);
    assert.ok(new Set(FIXTURE.map((e) => e.text.length)).size >= 3);
    assert.equal(FIXTURE.filter((e) => e.image).length, 1);
    assert.ok(FIXTURE.some((e, i) => FIXTURE.some((f, j) => i !== j && e.build === f.build)));
    const size = sizeOf(png);
    assert.ok(size && size.width <= 390 && size.width <= MOST.px && png.length <= MOST.bytes);
  });
  test('the fixture builds with the real generator and what it makes matches the expectations', () => {
    const out = mkdtempSync(join(tmpdir(), 'changelog-play-out-'));
    try { build(dir, out); assert.ok(readdirSync(join(out, 'img')).includes('fixture.png')); } finally { rmSync(out, { recursive: true, force: true }); }
    assert.deepEqual(compare(expectedOf(FIXTURE), seen()), []);
  });
  test('the real entries match their own page and feed', () => {
    const pics = new Map(real.filter((e) => e.image).map((e) => [e.image, readFileSync(join(root, 'changelog', 'img', e.image))]));
    assert.deepEqual(compare(expectedOf(real), seenOf(real, pics)), []);
  });

  describe('a wrong page or feed is reported', () => {
    const caught = (mutate, re) => { const s = seen(); mutate(s); const bad = compare(expectedOf(FIXTURE), s); assert.ok(bad.length && bad.some((b) => re.test(b)), JSON.stringify(bad)); };
    test('a missing entry', () => caught((s) => s.top.items.pop(), /missing the entry/));
    test('an extra entry', () => caught((s) => s.archive[1].items.push({ ...s.archive[1].items[0], title: 'Surprise' }), /extra entry "Surprise"/));
    test('entries swapped', () => caught((s) => s.top.items.reverse(), /out of order/));
    test('a dropped paragraph', () => caught((s) => s.top.items[1].paras.pop(), /3 paragraphs, expected 4/));
    test('paragraphs reordered', () => caught((s) => s.top.items[1].paras.reverse(), /paragraphs differ or are out of order/));
    test('a wrong build group', () => caught((s) => { s.top.heading = 'Build 901'; }, /heading reads "Build 901"/));
    test('an entry in the wrong build', () => caught((s) => { s.archive[0].items.push(s.top.items.pop()); }, /missing the entry|extra entry/));
    test('archive builds swapped', () => caught((s) => s.archive.reverse(), /archive builds/));
    test('a missing image', () => caught((s) => { s.archive[0].items[0].images = []; }, /is missing/));
    test('an unexpected image', () => caught((s) => { s.top.items[0].images = [{ src: 'img/x.png', alt: 'x' }]; }, /has an image/));
    test('the wrong image alt', () => caught((s) => { s.archive[0].items[0].images[0].alt = 'something else'; }, /image is/));
    test('a wrong date, datetime or ticket', () => {
      caught((s) => { s.top.items[0].words = 'Monday 1 January 2001, 1:00 am'; }, /date reads/);
      caught((s) => { s.top.items[0].iso = '2001-01-01T01:00:00-06:00'; }, /datetime is/);
      caught((s) => { s.top.items[1].ticket = null; }, /ticket is/);
    });
    test('a feed that drops, reorders or disagrees', () => {
      caught((s) => s.feed.pop(), /feed has 3 entries/);
      caught((s) => s.feed.reverse(), /feed #1/);
      caught((s) => s.feed[1].paras.pop(), /feed #2: paragraphs/);
      caught((s) => { s.feed[0].updated = '2026-12-02T13:41:00-0600'; }, /feed #1: updated/);
    });
    test('nothing at all is not a pass', () => {
      assert.ok(compare(expectedOf(FIXTURE), { top: null, archive: [], feed: [] }).length >= 4);
      assert.ok(compare(expectedOf(real), { top: null, archive: [], feed: [] }).length >= 1);
    });
  });
});
