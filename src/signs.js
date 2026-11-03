// The church signs: what each one says today, and painting it. There's no three.js in here, so node tests load it too.
// data/signs.md has the schema.

// What fits on the board, measured off the photos the owner sent: the fullest one has four rows of about eighteen letters
export const MAX_ROWS = 4, MAX_LETTERS = 18;

const mix = (n) => { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return (n ^ (n >>> 15)) >>> 0; };

// Days since 1970 on the calendar in Mississippi, so that they all change at midnight there, for everyone, wherever they are
const CENTRAL = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'numeric', day: 'numeric' });
export function dayOf(date = new Date()) {
  const p = Object.fromEntries(CENTRAL.formatToParts(date).map(({ type, value }) => [type, +value]));
  return Math.round(Date.UTC(p.year, p.month - 1, p.day) / 864e5);
}

export function createSigns(data) {
  // One fixed shuffle of the sheet that the days walk along, so nothing comes round again until everything has
  const order = data.lines.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = mix(i + 1) % (i + 1), t = order[i]; order[i] = order[j]; order[j] = t; }
  const index = new Map(data.churches.map((c, i) => [c.id, i])), n = data.churches.length;
  return {
    churches: data.churches, lines: data.lines, feuds: data.feuds,
    // Every few days they argue
    feudOn: (day) => (day % data.feudEvery === 0 ? data.feuds[Math.floor(day / data.feudEvery) % data.feuds.length] : null),
    says(id, day) { return this.feudOn(day)?.[id] ?? data.lines[order[(day * n + index.get(id)) % order.length]]; },
  };
}

// Paints one side of a sign on a 2D canvas: a blue header with the church's name in it, and under it a lit board of black letters
// pushed along rails by someone in a hurry. Everything uneven about it comes from the church's id, so it's the same each time.
export function paintSign(g, w, h, church, rows) {
  const seed = [...church.id].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7), r = (i) => mix(seed + Math.imul(i, 7919)) % 100000 / 100000;
  const top = Math.round(h * .3), gap = Math.round(h * .024), y0 = top + gap, H = h - y0;

  // ---- the header. Paint comes off these from the top down, in flakes, with the grey showing through
  g.fillStyle = '#21459b'; g.fillRect(0, 0, w, top);
  const fade = g.createLinearGradient(0, 0, 0, top); fade.addColorStop(0, 'rgba(10,16,40,.28)'); fade.addColorStop(.5, 'rgba(10,16,40,0)'); fade.addColorStop(1, 'rgba(10,16,40,.2)'); g.fillStyle = fade; g.fillRect(0, 0, w, top);
  for (let i = 0; i < 70; i++) { const u = r(i), v = r(i + 100), s = 2 + r(i + 200) * 12; g.fillStyle = `rgba(190,194,196,${.25 + r(i + 300) * .55})`; g.fillRect(u * w, v * v * top * .9, s * (1 + r(i + 400) * 2), s * .6); }
  // a plain cross in a ring, where the photos have a badge
  const cx = w * .91, cy = top * .5, ring = top * .34;
  g.strokeStyle = '#f4f1e6'; g.lineWidth = ring * .12; g.beginPath(); g.arc(cx, cy, ring, 0, 6.2832); g.stroke();
  g.fillStyle = '#f4f1e6'; g.fillRect(cx - ring * .09, cy - ring * .72, ring * .18, ring * 1.44); g.fillRect(cx - ring * .46, cy - ring * .38, ring * .92, ring * .18);
  // the name, big over small, in the serif the first photo has
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f4f1e6';
  const fit = (text, size, room) => { g.font = `700 ${size}px Georgia, 'Times New Roman', serif`; const m = g.measureText(text).width; if (m > room) g.font = `700 ${size * room / m}px Georgia, 'Times New Roman', serif`; };
  const room = w * .8, nameX = w * .43, [one, two] = church.name;
  fit(one, top * .4, room); g.fillText(one, nameX, top * (two ? .32 : .5));
  if (two) { fit(two, top * .3, room); g.fillText(two, nameX, top * .72); }

  // ---- the strip between them
  g.fillStyle = '#c9c5b6'; g.fillRect(0, top, w, gap);

  // ---- the board, lit from behind by two tubes, with the rails the letters sit on, and what's collected in the bottom of it
  g.fillStyle = '#e6e1d0'; g.fillRect(0, y0, w, H);
  const tubes = g.createLinearGradient(0, y0, 0, h);
  tubes.addColorStop(0, 'rgba(90,84,66,.26)'); tubes.addColorStop(.28, 'rgba(255,252,236,.4)'); tubes.addColorStop(.5, 'rgba(90,84,66,.1)'); tubes.addColorStop(.72, 'rgba(255,252,236,.4)'); tubes.addColorStop(1, 'rgba(70,60,44,.42)');
  g.fillStyle = tubes; g.fillRect(0, y0, w, H);
  g.fillStyle = 'rgba(60,54,44,.2)'; for (let i = 1; i < 6; i++) g.fillRect(w * i / 6 - 1, y0, 2, H);
  for (let i = 0; i < 90; i++) { const v = 1 - r(i + 500) * r(i + 600) * .5, s = 1 + r(i + 700) * 3; g.fillStyle = `rgba(24,18,20,${.25 + r(i + 800) * .5})`; g.fillRect(r(i + 900) * w, y0 + H * v - s, s * 1.4, s); }

  // ---- the letters: one size for the whole sign, bigger when there's less to say
  const n = rows.length, cap = H * [0, .3, .25, .21, .178][n], pitch = Math.min((H * .94) / n, cap * 1.38), first = y0 + H / 2 - pitch * (n - 1) / 2;
  g.font = '100px Bungee, Impact, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  const capOf = g.measureText('H').actualBoundingBoxAscent || 72, size = cap * 100 / capOf;
  g.font = `${size}px Bungee, Impact, sans-serif`;
  const room2 = w * .95;
  let at = 0;
  rows.forEach((row, ry) => {
    const base = first + ry * pitch + cap / 2, gapX = size * .07, widths = [...row].map((c) => (c === ' ' ? size * .34 : g.measureText(c).width * .7 + gapX)), total = widths.reduce((a, b) => a + b, 0), squeeze = Math.min(1, room2 / total);
    // the rail
    g.fillStyle = 'rgba(52,46,40,.36)'; g.fillRect(0, base + cap * .1, w, Math.max(2, h * .004));
    let x = (w - total * squeeze) / 2;
    [...row].forEach((c, i) => {
      at++;
      if (c !== ' ') {
        const slip = r(at + 1000) < .05 ? (r(at + 1100) - .5) * .22 : (r(at + 1200) - .5) * .04;
        g.save(); g.translate(x + widths[i] * squeeze / 2, base + (r(at + 1300) - .5) * cap * .05); g.rotate(slip); g.scale(.7 * squeeze, 1);
        g.fillStyle = r(at + 1400) < .03 ? '#4a4348' : '#17131b'; g.textAlign = 'center'; g.fillText(c, 0, 0); g.restore();
      }
      x += widths[i] * squeeze;
    });
  });
}
