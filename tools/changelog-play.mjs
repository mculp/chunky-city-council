// What the changelog's phone check (tools/play-changelog.mjs) expects, worked out from the entries it was built from and compared with
// what the page and the feed turned out to say. Plain Node: no browser, so tools/changelog-play.test.js can run it anywhere.
// Also the disposable multi-entry changelog the check builds to prove it reads more than the one real entry.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { whenOf } from './changelog.mjs';

// One entry as it should read on the page: { words, iso, title, ticket, paras, images: [{ src, alt }] }
export const itemOf = (e) => {
  const w = whenOf(e.date, e.time);
  return { words: w.words, iso: w.iso, title: e.title, ticket: e.ticket ?? null, paras: [...e.text], images: e.image ? [{ src: `img/${e.image}`, alt: e.alt }] : [] };
};

// The page as changelog.mjs's page() lays it out: the newest build's entries under "Build N", every older build in the archive as a
// "Build N" summary with the day ("Friday 20 November 2026") of its first entry, in the order the builds first appear. The feed has one item per entry, in order.
export function expectedOf(entries) {
  const builds = new Map();
  entries.forEach((e) => builds.set(e.build, [...(builds.get(e.build) ?? []), e]));
  const [first, ...older] = [...builds];
  return {
    top: first ? { heading: `Build ${first[0]}`, items: first[1].map(itemOf) } : null,
    archive: older.map(([build, es]) => ({ summary: `Build ${build}`, weekday: whenOf(es[0].date, es[0].time).words.split(', ')[0], items: es.map(itemOf) })),
    feed: entries.map((e) => ({ title: e.title, updated: whenOf(e.date, e.time).iso, paras: [...e.text] })),
  };
}

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
// the feed's entries as { title, updated, paras }
export function parseFeed(xml) {
  return (xml.match(/<entry>[\s\S]*?<\/entry>/g) || []).map((f) => ({
    title: unesc(f.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''),
    updated: f.match(/<updated>([^<]*)<\/updated>/)?.[1] ?? null,
    paras: [...unesc(f.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] ?? '').matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => unesc(m[1])),
  }));
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const flat = (x) => [...(x.top?.items ?? []), ...x.archive.flatMap((g) => g.items)];

// Everything the page or feed says that the entries don't, in words, or nothing. seen has the same shape as expectedOf's answer.
export function compare(want, seen) {
  const bad = [];
  const items = (where, w, s) => {
    const at = (i, what) => `${where} #${i + 1} ("${w[i]?.title ?? s[i]?.title}"): ${what}`;
    const titles = (l) => l.map((x) => x.title);
    for (const t of titles(w)) if (!titles(s).includes(t)) bad.push(`${where}: missing the entry "${t}"`);
    for (const t of titles(s)) if (!titles(w).includes(t)) bad.push(`${where}: has an extra entry "${t}"`);
    if (w.length !== s.length) bad.push(`${where}: ${s.length} entries, expected ${w.length}`);
    else if (same(titles(w).slice().sort(), titles(s).slice().sort()) && !same(titles(w), titles(s))) bad.push(`${where}: entries are out of order (${titles(s).join(' | ')}, expected ${titles(w).join(' | ')})`);
    if (w.length !== s.length || !same(titles(w), titles(s))) return;
    w.forEach((x, i) => {
      const y = s[i];
      if (x.words !== y.words) bad.push(at(i, `date reads "${y.words}", expected "${x.words}"`));
      if (x.iso !== y.iso) bad.push(at(i, `datetime is ${y.iso}, expected ${x.iso}`));
      if (x.ticket !== y.ticket) bad.push(at(i, `ticket is ${JSON.stringify(y.ticket)}, expected ${JSON.stringify(x.ticket)}`));
      if (x.paras.length !== y.paras.length) bad.push(at(i, `${y.paras.length} paragraphs, expected ${x.paras.length}`));
      else if (!same(x.paras, y.paras)) bad.push(at(i, 'paragraphs differ or are out of order'));
      if (x.images.length && !y.images.length) bad.push(at(i, `image ${x.images[0].src} is missing`));
      else if (!x.images.length && y.images.length) bad.push(at(i, `has an image (${y.images[0].src}) it shouldn't`));
      else if (!same(x.images, y.images)) bad.push(at(i, `image is ${JSON.stringify(y.images)}, expected ${JSON.stringify(x.images)}`));
    });
  };
  if ((want.top?.heading ?? null) !== (seen.top?.heading ?? null)) bad.push(`newest build heading reads "${seen.top?.heading ?? null}", expected "${want.top?.heading ?? null}"`);
  items('newest build', want.top?.items ?? [], seen.top?.items ?? []);
  if (!same(want.archive.map((g) => g.summary), seen.archive.map((g) => g.summary))) bad.push(`archive builds are ${JSON.stringify(seen.archive.map((g) => g.summary))}, expected ${JSON.stringify(want.archive.map((g) => g.summary))}`);
  else want.archive.forEach((g, i) => {
    if (g.weekday !== seen.archive[i].weekday) bad.push(`${g.summary}: day reads "${seen.archive[i].weekday}", expected "${g.weekday}"`);
    items(g.summary, g.items, seen.archive[i].items);
  });
  const pageItems = flat(seen);
  if (want.feed.length !== seen.feed.length) bad.push(`feed has ${seen.feed.length} entries, expected ${want.feed.length}`);
  else want.feed.forEach((f, i) => {
    const g = seen.feed[i], p = pageItems[i];
    if (f.title !== g.title) bad.push(`feed #${i + 1}: title is "${g.title}", expected "${f.title}"`);
    if (f.updated !== g.updated) bad.push(`feed #${i + 1}: updated is ${g.updated}, expected ${f.updated}`);
    if (!same(f.paras, g.paras)) bad.push(`feed #${i + 1}: paragraphs differ from the entry's`);
    if (p && (p.iso !== g.updated || !same(p.paras, g.paras) || p.title !== g.title)) bad.push(`feed #${i + 1}: isn't the same as the page's entry #${i + 1}`);
  });
  return bad;
}

// ---- the disposable changelog ----
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
// a small real PNG, a colour gradient with a stripe, w by h
export function makePng(w = 240, h = 160) {
  const chunk = (type, data) => { const t = Buffer.concat([Buffer.from(type, 'latin1'), data]), len = Buffer.alloc(4), sum = Buffer.alloc(4); len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(t)); return Buffer.concat([len, t, sum]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3, s = (x + y) % 40 < 8; raw[o] = s ? 241 : Math.round(60 + 150 * x / w); raw[o + 1] = s ? 230 : Math.round(15 + 120 * y / h); raw[o + 2] = s ? 207 : 130; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Placeholder entries for a throwaway site: 4 entries, 3 builds, 4 days, 1 to 4 paragraphs, two in one build, one with a picture
// (in the archive, so it has to be opened and scrolled to), newest first. Never published and never copied into changelog/entries.json.
export const FIXTURE = [
  { build: 902, date: '2026-12-02', time: '13:40', ticket: null, title: 'Fixture entry A, one paragraph', text: ['Placeholder text for a disposable test page, one paragraph only.'], image: null, alt: null },
  { build: 902, date: '2026-12-01', time: '09:05', ticket: 'CHUNKY-1', title: 'Fixture entry B, four paragraphs & a ticket', text: ['Placeholder paragraph one, with <angle brackets> & an ampersand.', 'Placeholder paragraph two.', 'Placeholder paragraph three, a little longer so that it has to wrap over several lines on a narrow phone screen, which is what this one is for.', 'Placeholder paragraph four.'], image: null, alt: null },
  { build: 901, date: '2026-11-20', time: '23:59', ticket: null, title: 'Fixture entry C, two paragraphs and a picture', text: ['Placeholder text for the entry that has a generated picture.', 'It is only here to be drawn, and fitted to the screen.'], image: 'fixture.png', alt: 'A generated test picture of diagonal colour stripes' },
  { build: 900, date: '2026-11-10', time: '00:30', ticket: null, title: 'Fixture entry D, the oldest build', text: ['Placeholder text, an older build in the archive.', 'A second placeholder paragraph.', 'A third placeholder paragraph.'], image: null, alt: null },
];

// writes a root with changelog/entries.json and changelog/img/ into dir, for tools/changelog.mjs's build(), and says its entries
export function writeFixture(dir, entries = FIXTURE) {
  mkdirSync(join(dir, 'changelog', 'img'), { recursive: true });
  writeFileSync(join(dir, 'changelog', 'entries.json'), JSON.stringify(entries, null, 2));
  writeFileSync(join(dir, 'changelog', 'img', 'fixture.png'), makePng());
  return entries;
}
