// The public changelog at changelog.chunky.ms (CHUNKY-181): what's new in the game, newest first, written for players by the creative
// director in changelog/entries.json, with the game's own shots in changelog/img/. This makes the site from them: one page with
// nothing to run, the newest build on top and every build before it folded away in the archive below, a feed, and the pictures the
// entries show, and nothing else, so nothing goes up that isn't the changelog's own.
//
//   node tools/changelog.mjs [--out dir]
//
// makes it from this folder into data/raw/changelog, or dir, to look at with `python3 -m http.server -d data/raw/changelog`.
// tools/deploy.mjs makes it from the commit that's going up, with that commit's own copy of this, which is why it uses nothing but
// Node's own. It won't make it at all while anything in it is wrong (problems()), which `npm test` says first.
//
// An entry is { build, date, time, ticket, title, text, image, alt }: the build it's in, the number in chunky.ms/build.json, which is
// how many commits main had; the day and the minute in Mississippi, "2026-11-05" and "07:38"; its ticket, "CHUNKY-153", or null; a
// title; its words as plain paragraphs; and a picture in changelog/img/ or null, with alt saying what it shows. Nothing in one is
// taken as HTML.
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE = 'https://changelog.chunky.ms/', GAME = 'https://chunky.ms/', TITLE = 'What\'s new in Chunky';
// a picture's most, as it goes up: phones load the page over whatever they've got
export const MOST = { bytes: 400 * 1024, px: 1600 };
const KEYS = ['build', 'date', 'time', 'ticket', 'title', 'text', 'image', 'alt'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// What's only ever the team's or the owner's, which the creative director keeps out of every entry anyway: what anything costs, the
// private pages and tickets, a wallet, a building's number in the structures data, how places were checked against Google's
// imagery, the notes in docs/ and the hero's link. A family's name can't be listed here, so that stays theirs to keep out.
const OUT = [
  ['money', /\$\s?\d|\b\d+(\.\d+)?\s?(dollars?|usd|bucks)\b/i],
  ['a private link', /claude\.ai|linear\.app/i],
  ['a wallet', /\b0x[0-9a-f]{40}\b/i],
  ['a structure number', /\b\d{7,}\b/],
  ['Google\'s imagery', /street\s?view|satellite|google (earth|maps)/i],
  ['the notes', /\bdocs\/|lore\.md/i],
  ['the hero\'s link', /#hero=/i],
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const two = (n) => String(n).padStart(2, '0');
const local = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const realDate = (d) => { const [y, m, day] = d.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, day)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === day; };

// A day and a minute in Mississippi, as the moment it was (iso, ms) and as it's read ("Thursday 5 November 2026, 7:38 am"). Summer
// time is worked out from Chicago's clocks, the first of an hour that comes twice.
export function whenOf(date, time) {
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  let off = -6, ms = Date.UTC(y, mo - 1, d, h, mi) + 6 * 36e5;
  for (const o of [-5, -6]) {
    const at = Date.UTC(y, mo - 1, d, h, mi) - o * 36e5, p = Object.fromEntries(local.formatToParts(at).map((q) => [q.type, q.value]));
    if (+p.year === y && +p.month === mo && +p.day === d && +p.hour === h && +p.minute === mi) { off = o; ms = at; break; }
  }
  const day = DAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()], hour = h % 12 || 12;
  return { iso: `${date}T${time}:00-0${-off}:00`, ms, words: `${day} ${d} ${MONTHS[mo - 1]} ${y}, ${hour}:${two(mi)} ${h < 12 ? 'am' : 'pm'}` };
}

// How big a picture is, from the first bytes of a PNG, a JPEG or a WebP, and null for anything else
export function sizeOf(b) {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.toString('latin1', 12, 16) === 'IHDR') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 <= b.length;) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  }
  if (b.length >= 30 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const kind = b.toString('latin1', 12, 16);
    if (kind === 'VP8X') return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
    if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { width: (v & 0x3fff) + 1, height: ((v >>> 14) & 0x3fff) + 1 }; }
  }
  return null;
}

// Everything wrong with the changelog, in words, or nothing. images is what's in changelog/img/, by name.
export function problems(entries, images = new Map()) {
  if (!Array.isArray(entries)) return ['entries.json isn\'t a list'];
  const out = [], seen = new Set();
  entries.forEach((e, i) => {
    const at = `entry ${i + 1}${e?.title ? ` ("${String(e.title).slice(0, 40)}")` : ''}`, say = (why) => out.push(`${at}: ${why}`);
    if (!e || typeof e !== 'object' || Array.isArray(e)) return say('isn\'t an entry');
    for (const k of Object.keys(e)) if (!KEYS.includes(k)) say(`has ${k}, which an entry doesn't`);
    if (!Number.isInteger(e.build) || e.build < 1) say('build isn\'t a build\'s number, like 311');
    if (typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !realDate(e.date)) say('date isn\'t a day like 2026-11-05');
    if (typeof e.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time)) say('time isn\'t a minute like 07:38');
    if (e.ticket != null && !(typeof e.ticket === 'string' && /^CHUNKY-\d{1,5}$/.test(e.ticket))) say('ticket isn\'t like CHUNKY-153');
    if (typeof e.title !== 'string' || !e.title.trim() || e.title.length > 120) say('needs a title, of 120 characters at most');
    if (!Array.isArray(e.text) || !e.text.length || e.text.some((p) => typeof p !== 'string' || !p.trim())) say('text has to be its paragraphs, each with words in it');
    if (e.image != null) {
      const b = typeof e.image === 'string' && /^[\w.-]+\.(png|jpe?g|webp)$/i.test(e.image) ? images.get(e.image) : undefined, size = b && sizeOf(b);
      if (!b) say(`image ${e.image} isn't a png, jpg or webp in changelog/img/`);
      else if (!size) say(`image ${e.image} isn't a picture`);
      else {
        if (size.width > MOST.px || size.height > MOST.px) say(`image ${e.image} is ${size.width}×${size.height}, over ${MOST.px} px`);
        if (b.length > MOST.bytes) say(`image ${e.image} is ${Math.round(b.length / 1024)} KB, over ${MOST.bytes / 1024} KB`);
      }
      if (typeof e.alt !== 'string' || !e.alt.trim()) say('alt has to say what the picture shows');
    } else if (e.alt != null) say('has alt but no image');
    for (const [what, re] of OUT) {
      const words = [e.title, ...(Array.isArray(e.text) ? e.text : []), e.alt].filter((w) => typeof w === 'string').join('\n'), hit = words.match(re);
      if (hit) say(`has ${what} in it ("${hit[0]}")`);
    }
    const next = entries[i + 1];
    if (next && typeof e.date === 'string' && typeof e.time === 'string' && typeof next.date === 'string' && typeof next.time === 'string' && `${e.date} ${e.time}` < `${next.date} ${next.time}`) say('is older than the one after it, and they go newest first');
    if (next && Number.isInteger(e.build) && Number.isInteger(next.build) && e.build < next.build) say('is from an older build than the one after it, and they go newest first');
    const key = `${e.date} ${e.time} ${e.title}`;
    if (seen.has(key)) say('is there twice'); seen.add(key);
  });
  return out;
}

// each entry's place on the page, by its moment, with -2 and on for another at the same minute
function idsOf(entries) {
  const n = new Map();
  return entries.map((e) => { const base = `e-${e.date}-${e.time.replace(':', '')}`, k = (n.get(base) ?? 0) + 1; n.set(base, k); return k > 1 ? `${base}-${k}` : base; });
}

// The look is the creative director's Overnight page's, so that the two read as one
const CSS = `:root{--night:#0b0812;--sky:#3d0f30;--line:#2b2338;--cream:#f1e6cf;--dim:#b4a9c6;--orange:#ec803a;--cyan:#66d4c6;
--f-display:"Bungee","Arial Black",Impact,system-ui,sans-serif;--f-body:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--f-mono:"IBM Plex Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace;color-scheme:dark}
*{box-sizing:border-box}
html{background:var(--night)}
body{margin:0;background:var(--night) linear-gradient(to bottom,var(--sky) 0,var(--night) 340px) no-repeat;color:var(--cream);font:400 16px/1.6 var(--f-body)}
.wrap{max-width:760px;margin:0 auto;padding-block:36px 72px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:44px}
a{color:inherit;text-decoration-color:var(--orange);text-underline-offset:3px}
a:focus-visible,summary:focus-visible{outline:2px solid var(--cyan);outline-offset:3px}
.eyebrow,h2,.meta,summary,.foot{font-family:var(--f-mono)}
header{display:grid;gap:18px;justify-items:start}
.eyebrow{margin:0;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
h1{margin:0;font:400 clamp(36px,9vw,60px)/1 var(--f-display);color:var(--cream)}
h1 span{color:var(--orange)}
.play{display:inline-block;font:400 17px/1 var(--f-display);letter-spacing:.04em;text-decoration:none;color:var(--night);background:var(--orange);border-radius:999px;padding:13px 26px}
main{display:grid;gap:44px}
h2{margin:0;font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);padding-bottom:10px;border-bottom:1px solid var(--line)}
.entry{display:grid;gap:24px;padding-block:26px;border-bottom:1px solid var(--line)}
.entry.shot{grid-template-columns:minmax(0,1fr) 210px}
.meta{margin:0 0 6px;font-size:13px;color:var(--dim);display:flex;flex-wrap:wrap;gap:4px 12px}
.meta time{color:var(--orange);font-weight:600}
h3{margin:0 0 10px;font:600 22px/1.25 var(--f-body)}
p{max-width:62ch;margin:0 0 12px}
.entry p:last-child{margin-bottom:0}
.note{color:var(--dim);font-size:15px}
figure{margin:0}
figure img{display:block;width:100%;height:auto;border-radius:16px;border:1px solid var(--line);background:#000}
details{border-bottom:1px solid var(--line)}
summary{cursor:pointer;list-style:none;padding-block:14px;font-size:13px;color:var(--dim);display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px}
summary::-webkit-details-marker{display:none}
summary::before{content:"+";color:var(--orange);font-weight:600}
details[open] summary::before{content:"−"}
summary b{color:var(--cream);font-weight:600}
details .entry:last-child{border-bottom:0}
.foot{font-size:12px;color:var(--dim);display:flex;flex-wrap:wrap;gap:8px 20px}
@media (max-width:640px){.entry.shot{grid-template-columns:minmax(0,1fr)}.entry.shot figure{width:min(210px,58vw);justify-self:center}}`;

// The page: the newest build's entries on top, then the archive, every build before it folded away by itself, newest first. Each
// entry has its moment, its ticket, its title, its words and its picture. icon is the game's own tab icon, as SVG.
export function page(entries, { images = new Map(), icon = '' } = {}) {
  const ids = idsOf(entries);
  const article = (i) => {
    const e = entries[i], w = whenOf(e.date, e.time), b = e.image && images.get(e.image), size = b && sizeOf(b);
    const shot = e.image ? `\n<figure><img src="img/${esc(e.image)}"${size ? ` width="${size.width}" height="${size.height}"` : ''} alt="${esc(e.alt)}"${i ? ' loading="lazy"' : ''} decoding="async"></figure>` : '';
    return `<article class="entry${e.image ? ' shot' : ''}" id="${ids[i]}">
<div>
<p class="meta"><time datetime="${w.iso}">${w.words}</time>${e.ticket ? `<span>${esc(e.ticket)}</span>` : ''}</p>
<h3>${esc(e.title)}</h3>
${e.text.map((p) => `<p>${esc(p)}</p>`).join('\n')}
</div>${shot}
</article>`;
  };
  // the builds in the order they come, each with which entries are its
  const builds = new Map();
  entries.forEach((e, i) => builds.set(e.build, [...(builds.get(e.build) ?? []), i]));
  const [newest, ...older] = builds;
  const top = newest ? `<h2>Build ${esc(newest[0])}</h2>\n${newest[1].map(article).join('\n')}` : '<p class="note">Nothing yet.</p>';
  const archive = older.map(([build, at]) => `<details>
<summary><b>Build ${esc(build)}</b><span>${whenOf(entries[at[0]].date, entries[at[0]].time).words.split(', ')[0]}</span></summary>
${at.map(article).join('\n')}
</details>`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(TITLE)}</title>
<meta name="description" content="What's new in Chunky, the game, newest first.">
<meta name="referrer" content="no-referrer">
${icon ? `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}">\n` : ''}<link rel="alternate" type="application/atom+xml" title="${esc(TITLE)}" href="feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bungee&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
${CSS}
</style>
</head>
<body>
<div class="wrap">
<header>
<p class="eyebrow">changelog.chunky.ms</p>
<h1>What's new in <span>Chunky</span></h1>
<a class="play" href="${GAME}">Play</a>
</header>
<main>
<section>
${top}
</section>
${archive.length ? `<section>\n<h2>Archive</h2>\n${archive.join('\n')}\n</section>\n` : ''}</main>
<footer class="foot"><a href="${GAME}">chunky.ms</a><a href="feed.xml">Feed</a></footer>
</div>
</body>
</html>
`;
}

// The same, for a feed reader: Atom, newest first
export function feed(entries) {
  const ids = idsOf(entries), newest = entries.length ? whenOf(entries[0].date, entries[0].time).iso : '1970-01-01T00:00:00Z';
  const items = entries.map((e, i) => {
    const w = whenOf(e.date, e.time), html = e.text.map((p) => `<p>${esc(p)}</p>`).join('');
    return `<entry><title>${esc(e.title)}</title><id>${SITE}#${ids[i]}</id><link href="${SITE}#${ids[i]}"/><updated>${w.iso}</updated><content type="html">${esc(html)}</content></entry>`;
  });
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>${esc(TITLE)}</title>
<id>${SITE}</id>
<link href="${SITE}"/>
<link rel="self" href="${SITE}feed.xml"/>
<updated>${newest}</updated>
<author><name>Chunky</name></author>
${items.join('\n')}
</feed>
`;
}

// The site, from the changelog/ folder in `from` into `out`: the page, the feed and the pictures the entries show. It's what goes up,
// so anything wrong with it stops it here. It says what it wrote, each as [name, bytes].
export function build(from, out, { icon = '' } = {}) {
  const at = join(from, 'changelog'), file = join(at, 'entries.json'), img = join(at, 'img');
  const entries = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  const images = new Map(existsSync(img) ? readdirSync(img).map((n) => [n, readFileSync(join(img, n))]) : []);
  const wrong = problems(entries, images);
  if (wrong.length) throw new Error(`the changelog isn't ready:\n  ${wrong.join('\n  ')}`);
  mkdirSync(join(out, 'img'), { recursive: true });
  const wrote = [];
  const put = (name, data) => { writeFileSync(join(out, name), data); wrote.push([name, Buffer.byteLength(data)]); };
  put('index.html', page(entries, { images, icon }));
  put('feed.xml', feed(entries));
  for (const n of new Set(entries.map((e) => e.image).filter(Boolean))) put(`img/${n}`, images.get(n));
  return wrote;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '..'), i = process.argv.indexOf('--out'), out = i > 0 ? process.argv[i + 1] : join(root, 'data', 'raw', 'changelog');
  // --out has to be followed by a directory: not nothing, not an empty value and not another flag
  if (i > 0 && (typeof out !== 'string' || !out.trim() || out.startsWith('-'))) {
    console.error('--out needs a directory to make the changelog in.\nusage: node tools/changelog.mjs [--out dir]');
    process.exit(2);
  }
  const html = readFileSync(join(root, 'index.html'), 'utf8'), icon = decodeURIComponent(html.match(/<link rel="icon" href="data:image\/svg\+xml,([^"]+)"/)?.[1] ?? '');
  for (const [name, bytes] of build(root, out, { icon })) console.log(`${name}  ${bytes} bytes`);
  console.log(`made in ${out}`);
}
