// The public changelog at changelog.chunky.ms (CHUNKY-181): what's new written out as it's written, newest first, at Mississippi's
// time, the newest build on top and the ones before it in the archive, nothing in it taken as HTML, a shot at its own size with what
// it shows, a feed, and what stays out of it caught. And the changelog as it stands on this commit, which is what goes up.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { page, feed, problems, sizeOf, whenOf } from './changelog.mjs';

const entry = (more = {}) => ({ build: 312, date: '2026-11-05', time: '07:38', ticket: 'CHUNKY-153', title: 'The trains run for everyone', text: ['Two trains pass on the siding in town.'], image: null, alt: null, ...more });
// the first bytes of a picture of each kind, as far as its size is written
const png = (w, h) => { const b = Buffer.alloc(33); b.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const jpg = (w, h) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0, 0, 0xff, 0xd9]);
const webp = (w, h) => { const b = Buffer.alloc(30); b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(22, 4); b.write('WEBPVP8X', 8, 'latin1'); b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b; };

describe('the page', () => {
  test('an entry is written out as it\'s written, newest first, at its time in Mississippi', () => {
    const html = page([entry({ title: 'Second' }), entry({ date: '2026-07-04', time: '19:05', title: 'First', ticket: null })]);
    assert.ok(html.indexOf('Second') < html.indexOf('First'), 'in the order they come');
    assert.match(html, /<time datetime="2026-11-05T07:38:00-06:00">Thursday 5 November 2026, 7:38 am<\/time>/);
    assert.match(html, /<time datetime="2026-07-04T19:05:00-05:00">Saturday 4 July 2026, 7:05 pm<\/time>/, 'and in summer time');
    assert.match(html, /CHUNKY-153/);
    assert.equal(html.match(/<article/g).length, 2);
  });

  test('the newest build is on top, and the ones before it are kept in the archive, each by itself, newest first', () => {
    const html = page([
      entry({ build: 313, title: 'Newest' }), entry({ build: 313, time: '07:10', title: 'Also newest' }),
      entry({ build: 312, date: '2026-11-04', time: '21:52', title: 'Older' }), entry({ build: 309, date: '2026-11-04', time: '09:00', title: 'Oldest' }),
    ]);
    const at = (words) => html.indexOf(words), archive = at('Archive');
    assert.ok(at('Build 313') < at('Newest') && at('Newest') < at('Also newest') && at('Also newest') < archive, 'the newest build first, all of it');
    assert.ok(archive < at('Build 312') && at('Build 312') < at('Older') && at('Older') < at('Build 309') && at('Build 309') < at('Oldest'), 'then the rest');
    assert.ok(!html.slice(0, archive).includes('<details'), 'with the newest open');
    assert.equal(html.slice(archive).match(/<details/g)?.length, 2, 'and each older build folded away by itself');
    assert.ok(!page([entry()]).includes('Archive'), 'and no archive with only the one');
  });

  test('nothing in an entry is taken as HTML', () => {
    const html = page([entry({ title: '<b>Beans</b> & "more"', text: ['<script>alert(1)</script>', 'a < b'] })]);
    assert.ok(!html.includes('<b>Beans') && !html.includes('<script>alert'));
    assert.ok(html.includes('&lt;b&gt;Beans&lt;/b&gt; &amp; &quot;more&quot;') && html.includes('a &lt; b'));
  });

  test('a shot goes with its words, at its own size, saying what it shows', () => {
    const html = page([entry({ image: 'trains.png', alt: 'The local on the siding at dusk' })], { images: new Map([['trains.png', png(1200, 800)]]) });
    assert.match(html, /<img src="img\/trains\.png" width="1200" height="800" alt="The local on the siding at dusk"/);
  });

  test('it\'s one page with nothing to run, and nowhere to go but the game', () => {
    const html = page([entry()]);
    assert.ok(!/<script/i.test(html), 'no script');
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    for (const l of links) assert.ok(/^(https:\/\/chunky\.ms\/|https:\/\/fonts\.(googleapis|gstatic)\.com|feed\.xml|#|data:image\/svg\+xml)/.test(l), l);
    assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1/);
  });
});

describe('when', () => {
  test('is Mississippi\'s, winter and summer, a minute either side of the clocks changing', () => {
    assert.equal(whenOf('2026-11-01', '00:59').iso, '2026-11-01T00:59:00-05:00');
    assert.equal(whenOf('2026-11-01', '03:00').iso, '2026-11-01T03:00:00-06:00');
    assert.equal(whenOf('2026-03-08', '03:01').iso, '2026-03-08T03:01:00-05:00');
    assert.equal(whenOf('2026-11-05', '00:06').words, 'Thursday 5 November 2026, 12:06 am');
    assert.equal(whenOf('2026-11-05', '12:30').words, 'Thursday 5 November 2026, 12:30 pm');
  });
});

describe('a picture\'s size', () => {
  test('is read from a PNG, a JPEG or a WebP, and nothing else is a picture', () => {
    assert.deepEqual(sizeOf(png(1600, 900)), { width: 1600, height: 900 });
    assert.deepEqual(sizeOf(jpg(640, 480)), { width: 640, height: 480 });
    assert.deepEqual(sizeOf(webp(1024, 768)), { width: 1024, height: 768 });
    assert.equal(sizeOf(Buffer.from('GIF89a........')), null);
  });
});

describe('the feed', () => {
  test('has every entry, newest first, each with an id of its own', () => {
    const xml = feed([entry({ title: 'Second' }), entry({ date: '2026-11-04', time: '21:52', title: 'First & best' })]);
    assert.match(xml, /^<\?xml version="1\.0" encoding="utf-8"\?>\n<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
    const ids = [...xml.matchAll(/<id>([^<]+)<\/id>/g)].map((m) => m[1]);
    assert.equal(ids.length, 3, 'the feed\'s own and one each');
    assert.equal(new Set(ids).size, 3);
    assert.ok(xml.indexOf('Second') < xml.indexOf('First &amp; best'));
    assert.match(xml, /<updated>2026-11-05T07:38:00-06:00<\/updated>/);
  });
});

describe('what\'s wrong with an entry', () => {
  const one = (more, images) => problems([entry(more)], images);
  test('nothing, when it\'s as it should be', () => {
    assert.deepEqual(problems([entry(), entry({ date: '2026-11-04' })]), []);
    assert.deepEqual(problems([entry({ build: 313 }), entry({ build: 312, date: '2026-11-04' })]), []);
    assert.deepEqual(one({ image: 'a.webp', alt: 'Coop at the counter' }, new Map([['a.webp', webp(1600, 900)]])), []);
  });

  test('its shape: which build, when, which ticket, what it\'s called, its words and anything it doesn\'t have', () => {
    for (const more of [{ build: '312' }, { build: 0 }, { build: 3.5 }, { build: null }, { date: '5 Nov' }, { date: '2026-02-30' }, { time: '7:38' }, { time: '24:00' }, { ticket: 'chunky 153' }, { title: '' }, { text: 'One line.' }, { text: [] }, { text: ['', 'x'] }, { colour: 'red' }]) {
      assert.ok(one(more).length, JSON.stringify(more));
    }
  });

  test('its shot: there, a picture, small enough, and saying what it shows', () => {
    const images = new Map([['big.png', png(2400, 1200)], ['heavy.jpg', Buffer.concat([jpg(800, 600), Buffer.alloc(500 * 1024)])], ['a.gif', Buffer.from('GIF89a')], ['ok.png', png(800, 600)]]);
    for (const more of [{ image: 'missing.png', alt: 'x' }, { image: 'big.png', alt: 'x' }, { image: 'heavy.jpg', alt: 'x' }, { image: 'a.gif', alt: 'x' }, { image: 'ok.png', alt: '' }, { image: '../ok.png', alt: 'x' }, { image: null, alt: 'x' }]) {
      assert.ok(one(more, images).length, JSON.stringify(more));
    }
  });

  test('the order: newest first, by build too, and no two at the same moment with the same title', () => {
    assert.ok(problems([entry({ date: '2026-11-04' }), entry()]).length);
    assert.ok(problems([entry({ build: 311 }), entry({ build: 312, date: '2026-11-04' })]).length, 'an older build above a newer one');
    assert.ok(problems([entry(), entry()]).length);
  });

  test('what stays out of it: money, private links, wallets, structure numbers, and Google\'s imagery named', () => {
    for (const words of ['It costs $5 a month.', 'See https://claude.ai/artifact/abc', 'linear.app/chunkistan/issue/CHUNKY-1', 'Sent to 0x1234567890abcdef1234567890abcdef12345678', 'Building 76029134 is fixed.', 'Checked on Street View.', 'Matched to the satellite.', 'From docs/lore.md']) {
      assert.ok(one({ text: [words] }).length, words);
      assert.ok(one({ title: words }).length, `title: ${words}`);
    }
    assert.ok(one({ image: 'a.png', alt: 'Seen from Street View' }, new Map([['a.png', png(10, 10)]])).length, 'in what a shot shows');
  });
});

test('the changelog as it stands on this commit is as it should be', () => {
  const at = new URL('../changelog/', import.meta.url);
  if (!existsSync(new URL('entries.json', at))) return;
  const entries = JSON.parse(readFileSync(new URL('entries.json', at), 'utf8')), img = new URL('img/', at);
  const images = new Map(existsSync(img) ? readdirSync(img).map((n) => [n, readFileSync(new URL(n, img))]) : []);
  assert.deepEqual(problems(entries, images), []);
  // and every picture in it is in an entry, so nothing goes up that nobody wrote about
  const used = new Set(entries.map((e) => e.image).filter(Boolean));
  for (const n of images.keys()) assert.ok(used.has(n), `changelog/img/${n} isn't in any entry`);
});
