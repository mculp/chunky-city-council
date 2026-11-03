// What everyone but the hero looks like, drawn onto a canvas at load: what they had on when it happened, and how it's going
// through them. Canvas only, so the game has no image files and this has no idea three.js exists. The looks are in data/looks.json.
const TAU = Math.PI * 2, INK = '#060408';

export const TOPS = ['tee', 'flannel', 'overalls', 'camo', 'coveralls', 'dress', 'none'];
export const BOTTOMS = ['trousers', 'shorts', 'skirt'];
export const MARKS = ['caution', 'flammable', 'radioactive'];

// Where things are on a body, in metres up it from its hips' pivot, the same numbers ZOMBIE_SHAPE is built to in index.html
export const BODY = { from: -.62, to: .575, neck: .14, chin: .235, eyes: .375, nose: .335, mouth: .285, brow: .405, hairline: .45, head: .125 };
// A row of the sheet, left to right: all the way round the body, then an arm, then a leg. Up a limb is from its end to where it joins.
export const PARTS = { body: [0, .75], arm: [.75, .125], leg: [.875, .125] };

// How far gone someone in the crowd is, from t going evenly from 0 to 1: from nearly a person to not much but what's coming off
// them. Most are somewhere in the middle.
export const degreeOf = (t) => { const c = 2 * t - 1; return .5 + Math.sign(c) * Math.pow(Math.abs(c), 1.7) * .46; };
// The ones who've burnt down are drawn past `line` and nobody else is, so a player can tell at a glance which ones come for him on sight.
// In town that's where they are anyway, and out of town more of them have burnt down, so they're taken up to it.
export const farOf = (t, burnt, line) => (burnt ? Math.max(degreeOf(t), line) : Math.min(degreeOf(t), line));

const seeded = (text) => { let s = 7; for (const c of text) s = (s * 31 + c.charCodeAt(0)) % 2147483647; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

// A person, in one row of a sheet. On the body u goes once round from their left side, past their front at u = .25.
export function drawPerson(g, x, y, w, h, look) {
  const r = seeded(look.id), k = w / 512;
  const [bx, bw] = PARTS.body, [ax, aw] = PARTS.arm, [lx, lw] = PARTS.leg;
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.lineCap = 'round'; g.lineJoin = 'round';
  const body = { g, r, k, x: x + bx * w, y, w: bw * w, h, look };
  drawTop(body); drawHead(body);
  drawArm({ g, r, k, x: x + ax * w, y, w: aw * w, h, look });
  drawLeg({ g, r, k, x: x + lx * w, y, w: lw * w, h, look });
  tooth(g, r, x, y, w, h, k);
  g.restore();
}

const U = (p, u) => p.x + u * p.w, V = (p, at) => p.y + p.h * (1 - (at - BODY.from) / (BODY.to - BODY.from));
// where an offset across the front lands, since u goes by the angle round the body and not by how far across it is
const across = (off, half) => .25 + Math.asin(Math.max(-.99, Math.min(.99, off / half))) / TAU;

function drawTop(p) {
  const { g, r, k, look } = p, t = look.top ?? { kind: 'none' }, c = t.colors ?? [], top = V(p, BODY.neck + .01);
  const bottomOf = look.bottom?.color ?? '#222', at = V(p, -.5);
  // what's under it, for when it's short
  g.fillStyle = look.skin; g.fillRect(p.x, p.y, p.w, p.h);
  if (t.kind === 'none') {
    // ribs and a line down the middle
    g.strokeStyle = 'rgba(30,16,16,.5)'; g.lineWidth = 1.6 * k;
    for (const mid of [.25]) for (let i = 0; i < 5; i++) for (const side of [-1, 1]) { const yy = V(p, .02 - i * .075); g.beginPath(); g.moveTo(U(p, mid + side * .03), yy); g.quadraticCurveTo(U(p, mid + side * .11), yy - 2 * k, U(p, mid + side * .17), yy + 7 * k); g.stroke(); }
    g.beginPath(); g.moveTo(U(p, .25), V(p, .07)); g.lineTo(U(p, .25), V(p, -.4)); g.stroke();
    g.fillStyle = bottomOf; g.fillRect(p.x, at, p.w, p.y + p.h - at);
    return;
  }
  g.fillStyle = c[0]; g.fillRect(p.x, top, p.w, p.y + p.h - top);
  if (t.kind === 'flannel') {
    // a big plaid, darker where the bands cross
    const n = 9, band = p.w / n;
    g.globalAlpha = .55; g.fillStyle = c[1];
    for (let i = 0; i < n; i++) g.fillRect(p.x + i * band, top, band * .34, p.y + p.h - top);
    for (let at2 = top; at2 < p.y + p.h; at2 += band * .9) g.fillRect(p.x, at2, p.w, band * .3);
    g.globalAlpha = .4; g.fillStyle = c[2] ?? '#e8dcc0';
    for (let i = 0; i < n; i++) g.fillRect(p.x + (i + .67) * band, top, Math.max(1, band * .05), p.y + p.h - top);
    g.globalAlpha = 1;
    buttons(p, c[1]);
  } else if (t.kind === 'overalls') {
    // a shirt, and over it a bib and two straps going over the shoulders and down the back
    const bib = c[1];
    g.fillStyle = bib;
    const y0 = V(p, -.06), y1 = V(p, -.5);
    g.fillRect(U(p, .16), y0, p.w * .18, y1 - y0);
    g.fillRect(p.x, y1, p.w, p.y + p.h - y1);
    g.fillRect(U(p, .66), V(p, -.1), p.w * .18, y1 - V(p, -.1));
    g.strokeStyle = bib; g.lineWidth = 7 * k;
    for (const side of [-1, 1]) { g.beginPath(); g.moveTo(U(p, .25 + side * .07), y0); g.lineTo(U(p, .25 + side * .1), top); g.stroke(); g.beginPath(); g.moveTo(U(p, .75 - side * .07), V(p, -.1)); g.lineTo(U(p, .75 - side * .1), top); g.stroke(); }
    g.fillStyle = '#d8c98a'; for (const side of [-1, 1]) { g.beginPath(); g.arc(U(p, .25 + side * .075), y0 + 3 * k, 2.4 * k, 0, TAU); g.fill(); }
  } else if (t.kind === 'camo') {
    for (let i = 0, n = 70; i < n; i++) {
      g.fillStyle = c[1 + Math.floor(r() * (c.length - 1))]; g.globalAlpha = .9;
      const cx = p.x + r() * p.w, cy = top + r() * (p.y + p.h - top), a = 8 + r() * 15;
      g.beginPath(); for (let j = 0; j < 7; j++) { const th = j / 7 * TAU, q = a * k * (.55 + r() * .6); g[j ? 'lineTo' : 'moveTo'](cx + Math.cos(th) * q * 1.3, cy + Math.sin(th) * q * .8); } g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
    // a hunter's vest over it
    if (t.vest) {
      g.fillStyle = t.vest;
      g.fillRect(U(p, .02), V(p, .05), p.w * .19, V(p, -.42) - V(p, .05)); g.fillRect(U(p, .29), V(p, .05), p.w * .19, V(p, -.42) - V(p, .05));
      g.fillRect(U(p, .55), V(p, .05), p.w * .4, V(p, -.42) - V(p, .05));
    }
  } else if (t.kind === 'coveralls') {
    g.strokeStyle = 'rgba(10,8,12,.65)'; g.lineWidth = 2 * k;
    g.beginPath(); g.moveTo(U(p, .25), V(p, BODY.neck)); g.lineTo(U(p, .25), V(p, BODY.from)); g.stroke();
    for (const side of [-1, 1]) { g.strokeRect(U(p, .25 + side * .1) - 11 * k, V(p, -.02), 22 * k, 14 * k); }
    g.beginPath(); g.moveTo(p.x, V(p, -.44)); g.lineTo(p.x + p.w, V(p, -.44)); g.stroke();
  } else if (t.kind === 'dress') {
    // a collar, and flowers on it if there's a second colour
    g.fillStyle = c[2] ?? '#e8e2d0';
    g.beginPath(); g.moveTo(U(p, .25) - 26 * k, top); g.lineTo(U(p, .25), top + 15 * k); g.lineTo(U(p, .25) + 26 * k, top); g.closePath(); g.fill();
    if (c[1]) for (let i = 0, n = 110; i < n; i++) { g.fillStyle = c[1]; g.globalAlpha = .85; g.beginPath(); g.arc(p.x + r() * p.w, top + r() * (p.y + p.h - top), (1.4 + r() * 1.8) * k, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
  } else if (t.kind === 'tee') {
    if (c[1]) { g.fillStyle = c[1]; g.fillRect(p.x, V(p, -.02), p.w, 14 * k); g.fillRect(p.x, V(p, -.14), p.w, 14 * k); }
    g.strokeStyle = 'rgba(10,8,12,.6)'; g.lineWidth = 2.4 * k; g.beginPath(); g.ellipse(U(p, .25), top, 26 * k, 11 * k, 0, 0, TAU); g.stroke();
  }
  // a shirt tucked in, or at least it was
  if (!['coveralls', 'dress', 'overalls'].includes(t.kind)) { g.fillStyle = bottomOf; g.fillRect(p.x, at, p.w, p.y + p.h - at); }
  if (t.kind === 'dress' && look.bottom?.kind !== 'skirt') { g.fillStyle = c[0]; g.fillRect(p.x, at, p.w, p.y + p.h - at); }
  if (look.mark) { const s = p.h / (BODY.to - BODY.from); g.save(); g.translate(U(p, t.kind === 'overalls' ? .25 : .32), V(p, -.14)); g.scale(s * .9, s * .9); drawMark(g, look.mark, r); g.restore(); }
}

function buttons(p, color) {
  const { g, k } = p;
  g.strokeStyle = 'rgba(8,6,10,.6)'; g.lineWidth = 1.6 * k; g.beginPath(); g.moveTo(U(p, .25), V(p, BODY.neck)); g.lineTo(U(p, .25), V(p, -.5)); g.stroke();
  g.fillStyle = color; for (let at = .03; at > -.5; at -= .11) { g.beginPath(); g.arc(U(p, .25) + 3 * k, V(p, at), 1.6 * k, 0, TAU); g.fill(); }
}

function drawHead(p) {
  const { g, r, k, look } = p, side = (off) => U(p, across(off, BODY.head));
  // neck and head, and a little of where the shoulders go down into the collar
  const top = V(p, BODY.to), neck = V(p, BODY.neck + .01);
  g.fillStyle = look.skin; g.fillRect(p.x, top, p.w, neck - top);
  // gone hollow under the cheekbones
  g.strokeStyle = 'rgba(16,8,16,.38)';
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { g.lineWidth = (1.6 + i * .8) * k; g.beginPath(); g.moveTo(side(s * (.094 - i * .005)), V(p, .345 - i * .004)); g.quadraticCurveTo(side(s * .07), V(p, .31), side(s * (.05 + i * .004)), V(p, .262)); g.stroke(); }
  // hair: the back of the head and the crown, with a hairline across the front
  if (look.hair) {
    g.fillStyle = look.hair;
    g.beginPath(); g.moveTo(p.x, top - 1);
    g.lineTo(p.x + p.w, top - 1); g.lineTo(p.x + p.w, V(p, .285));
    g.lineTo(U(p, .55), V(p, .265)); g.lineTo(U(p, .44), V(p, .36));
    for (let i = 0; i <= 12; i++) { const u = .44 - i / 12 * .38; g.lineTo(U(p, u), V(p, BODY.hairline + (Math.abs(u - .25) > .13 ? -.06 : 0) + (r() - .5) * .02)); }
    g.lineTo(p.x, V(p, .285)); g.closePath(); g.fill();
    g.strokeStyle = look.hair; g.lineWidth = 2 * k;
    for (let i = 0; i < 14; i++) { const u = .1 + r() * .3, at = BODY.hairline - (Math.abs(u - .25) > .13 ? .07 : .012); g.globalAlpha = .4 + r() * .4; g.beginPath(); g.moveTo(U(p, u), V(p, at)); g.lineTo(U(p, u + (r() - .5) * .02), V(p, at - .006 - r() * .02)); g.stroke(); }
    g.globalAlpha = 1;
  }
  // the sockets, sunk in, and the whites that are left round what's lit
  for (const s of [-1, 1]) {
    const cx = side(s * .048), cy = V(p, BODY.eyes);
    g.fillStyle = '#0a060c'; g.beginPath(); g.ellipse(cx, cy, 9 * k, 6.5 * k, -s * .12, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(14,6,14,.75)'; g.lineWidth = 1.5 * k;
    g.beginPath(); g.moveTo(cx - 11 * k, V(p, BODY.brow) + 2 * k); g.quadraticCurveTo(cx - s * 2 * k, V(p, BODY.brow) - 3 * k, cx + 11 * k, V(p, BODY.brow) + s * 2 * k); g.stroke();
    g.strokeStyle = 'rgba(30,14,24,.5)'; g.beginPath(); g.arc(cx, cy + 4 * k, 11 * k, .2, Math.PI - .2); g.stroke();
  }
  // a nose that's mostly a shadow, and a mouth hanging a little open
  g.fillStyle = 'rgba(10,6,12,.8)';
  g.beginPath(); g.moveTo(side(0), V(p, BODY.nose + .012)); g.lineTo(side(.012), V(p, BODY.nose - .006)); g.lineTo(side(-.012), V(p, BODY.nose - .006)); g.closePath(); g.fill();
  const my = V(p, BODY.mouth), mw = 13 * k;
  g.fillStyle = '#0a0408'; g.beginPath(); g.moveTo(U(p, .25) - mw, my - 1 * k); g.quadraticCurveTo(U(p, .25), my - 4 * k, U(p, .25) + mw, my); g.quadraticCurveTo(U(p, .25), my + 7 * k, U(p, .25) - mw, my - 1 * k); g.closePath(); g.fill();
  g.fillStyle = '#c9c2a6';
  for (let i = -2; i <= 2; i++) if (r() > .3) g.fillRect(U(p, .25) + i * 4.4 * k - 1.2 * k, my - 2.4 * k, 2.6 * k, 2.2 * k);
}

function drawArm(p) {
  const { g, k, look, y, h } = p, t = look.top ?? { kind: 'none' };
  const to = { none: 0, tee: .68, dress: .72, overalls: .68, camo: .12, flannel: .12, coveralls: .1 }[t.kind] ?? 0;
  g.fillStyle = look.skin; g.fillRect(p.x, y, p.w, h);
  if (to) {
    g.fillStyle = (t.sleeve ?? t.colors?.[0]); g.fillRect(p.x, y, p.w, h * (1 - to));
    g.fillStyle = 'rgba(8,6,10,.55)'; g.fillRect(p.x, y + h * (1 - to) - 2 * k, p.w, 3 * k);
    if (t.kind === 'flannel') { g.globalAlpha = .5; g.fillStyle = t.colors[1]; for (let i = 0; i < 3; i++) g.fillRect(p.x + (i + .1) * p.w / 3, y, p.w / 9, h * (1 - to)); for (let at = y; at < y + h * (1 - to); at += 26 * k) g.fillRect(p.x, at, p.w, 7 * k); g.globalAlpha = 1; }
    if (t.kind === 'camo') { g.fillStyle = t.colors[1]; for (let at = y + 8 * k; at < y + h * (1 - to); at += 34 * k) { g.beginPath(); g.ellipse(p.x + p.w * .4, at, p.w * .34, 11 * k, 0, 0, TAU); g.fill(); } }
  }
  // a hand, gone dark at the fingers
  g.fillStyle = 'rgba(20,10,18,.4)'; g.fillRect(p.x, y + h * .975, p.w, h * .025);
}

function drawLeg(p) {
  const { g, k, look, y, h } = p, b = look.bottom ?? { kind: 'trousers', color: '#2a2436' }, t = look.top;
  const to = b.kind === 'skirt' || t?.kind === 'dress' ? .55 : b.kind === 'shorts' ? .62 : .09;
  g.fillStyle = look.skin; g.fillRect(p.x, y, p.w, h);
  g.fillStyle = t?.kind === 'coveralls' || t?.kind === 'dress' ? t.colors[0] : t?.kind === 'overalls' ? t.colors[1] : b.color;
  g.fillRect(p.x, y, p.w, h * (1 - to));
  // a seam, and the knee worn through
  g.strokeStyle = 'rgba(8,6,10,.4)'; g.lineWidth = 1.6 * k; g.beginPath(); g.moveTo(p.x + p.w * .5, y); g.lineTo(p.x + p.w * .5, y + h * (1 - to)); g.stroke();
  // shoes are all that's at the very end, which is all a crowd's foot looks at
  g.fillStyle = look.shoes ?? '#2a2228'; g.fillRect(p.x, y + h * .925, p.w, h * .075);
  if (to < .2) { g.fillStyle = 'rgba(8,6,10,.45)'; g.fillRect(p.x, y + h * .905, p.w, 3 * k); }
}

// crayon tooth, which is what makes it a rubbing rather than a fill
function tooth(g, r, x, y, w, h, k) {
  for (let i = 0, n = w * h / 300; i < n; i++) {
    const a = .9 + (r() - .5) * .5, L = (3 + r() * 9) * k, cx = x + r() * w, cy = y + r() * h;
    g.strokeStyle = r() < .55 ? '#ffffff' : '#000000'; g.globalAlpha = .03 + r() * .07; g.lineWidth = (.6 + r() * 1.2) * k;
    g.beginPath(); g.moveTo(cx - Math.cos(a) * L, cy - Math.sin(a) * L); g.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); g.stroke();
  }
  g.globalAlpha = 1;
}

function drawMark(g, mark, r) {
  g.rotate((r() - .5) * .3);
  if (mark.kind === 'caution') {
    g.lineWidth = .014; g.strokeStyle = INK; g.fillStyle = mark.color;
    g.beginPath(); g.moveTo(0, -.065); g.lineTo(.07, .05); g.lineTo(-.07, .05); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = INK; g.beginPath(); g.moveTo(-.008, -.03); g.lineTo(.008, -.03); g.lineTo(.004, .012); g.lineTo(-.004, .012); g.closePath(); g.fill();
    g.beginPath(); g.arc(0, .03, .008, 0, TAU); g.fill();
  } else if (mark.kind === 'flammable') {
    g.lineWidth = .01; g.strokeStyle = INK; g.fillStyle = mark.color;
    g.fillRect(-.045, -.06, .09, .12); g.strokeRect(-.045, -.06, .09, .12);
    g.fillStyle = INK;
    g.beginPath(); g.moveTo(0, -.042); g.bezierCurveTo(.035, -.014, .03, .035, 0, .038); g.bezierCurveTo(-.03, .035, -.035, 0, -.012, -.015); g.bezierCurveTo(-.01, -.003, -.003, -.003, 0, -.042); g.fill();
  } else if (mark.kind === 'radioactive') {
    g.lineWidth = .011; g.strokeStyle = INK; g.fillStyle = mark.color;
    g.beginPath(); g.arc(0, 0, .065, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = INK;
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, .054, a - .5, a + .5); g.closePath(); g.fill(); }
    g.fillStyle = mark.color; g.beginPath(); g.arc(0, 0, .017, 0, TAU); g.fill();
    g.fillStyle = INK; g.beginPath(); g.arc(0, 0, .01, 0, TAU); g.fill();
  }
}

// How it goes through someone, laid out the same as a row of the sheet. Each channel holds when a spot gives way, against how
// far gone they are, so one map does for everyone and all of them can go at once:
//   red    a crack, lit once they're further gone than 1 - red, starting from the chest and spreading out along its branches
//   green  where it's burnt through to char, once they're further gone than green
//   blue   the same again for the eyes and the mouth
export function drawRadiation(g, w, h) {
  const r = seeded('what it does'), [bx, bw] = PARTS.body, [ax, aw] = PARTS.arm, [lx, lw] = PARTS.leg;
  const bodyU = (u) => (bx + u * bw) * w, bodyV = (at) => h * (1 - (at - BODY.from) / (BODY.to - BODY.from)), k = w / 512;

  // green, a pixel at a time: lumps of noise, and it gets to the top of the head, the chest and the ends of the limbs first
  const lat = new Float32Array(128 * 64); for (let i = 0; i < lat.length; i++) lat[i] = r();
  const noise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, ax = fx * fx * (3 - 2 * fx), ay = fy * fy * (3 - 2 * fy), at = (a, b) => lat[((b & 63) << 7) | (a & 127)]; return (at(xi, yi) * (1 - ax) + at(xi + 1, yi) * ax) * (1 - ay) + (at(xi, yi + 1) * (1 - ax) + at(xi + 1, yi + 1) * ax) * ay; };
  const img = g.createImageData(w, h), d = img.data;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const u = px / w, v = 1 - py / h, i = (py * w + px) * 4;
    // lumps go round the body without a join, and the limbs have their own
    let n = (noise(u * 22, v * 9) * .6 + noise(u * 58 + 11, v * 22 + 3) * .27 + noise(u * 127 + 5, v * 57 + 7) * .13);
    n = (n - .5) * 2.5 + .74;
    if (u < bx + bw) {
      const bu = (u - bx) / bw, at = BODY.from + v * (BODY.to - BODY.from);
      const front = Math.min(Math.abs(bu - .25), Math.abs(bu - 1.25)), ch = Math.hypot(front * 3, (at + .06) * 1.6);
      n -= .2 * Math.exp(-ch * ch * 7) + .1 * Math.max(0, (at - .42) / .15);
      // the face goes last
      if (at > BODY.chin && at < BODY.hairline && front < .13) n += .34 * (1 - front / .13);
    } else {
      // from the hand or foot up
      n -= .22 * Math.max(0, 1 - v / .3);
    }
    // nobody's burnt through at all until they're well on, or everyone would have the same spot on their chest
    n = Math.max(n, .24 + noise(u * 40 + 3, v * 16 + 9) * .1);
    d[i] = 0; d[i + 1] = Math.min(255, n * 255); d[i + 2] = 0; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);

  g.save(); g.globalCompositeOperation = 'lighten'; g.lineCap = 'round'; g.lineJoin = 'round';
  // red: branching cracks, each one lit later than the one it came off
  const crack = (x, y, a, life, level, wide, part) => {
    let px = x, py = y;
    const n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      a += (r() - .5) * .9;
      const L = (9 + r() * 15) * k, nx = px + Math.cos(a) * L, ny = py + Math.sin(a) * L;
      g.strokeStyle = `rgb(${Math.round(level * 255)},0,0)`; g.lineWidth = Math.max(1.1 * k, wide * k);
      g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
      px = nx; py = ny; level *= .965; wide *= .92;
      if (life > 0 && r() < .55) crack(px, py, a + (r() < .5 ? -1 : 1) * (.5 + r() * .8), life - 1, level * .8, wide * .78, part);
    }
    if (life > 0) crack(px, py, a + (r() - .5) * .5, life - 1, level * .82, wide * .85, part);
  };
  const clipped = (x0, x1, fn) => { g.save(); g.beginPath(); g.rect(x0, 0, x1 - x0, h); g.clip(); fn(); g.restore(); };
  clipped(bx * w, (bx + bw) * w, () => {
    // out from the breastbone, one at the back, and up the neck
    for (let i = 0; i < 7; i++) crack(bodyU(.25), bodyV(-.06), i / 7 * TAU + r() * .5, 3, .92 - i * .012, 2.8, 'body');
    for (let i = 0; i < 4; i++) crack(bodyU(.75), bodyV(-.12), i / 4 * TAU + r(), 2, .66, 2.2, 'body');
    crack(bodyU(.2), bodyV(.17), -Math.PI / 2 - .2, 2, .72, 2, 'body');
    crack(bodyU(.3), bodyV(.17), -Math.PI / 2 + .3, 2, .6, 1.8, 'body');
    crack(bodyU(.08), bodyV(-.38), Math.PI / 2 + r(), 2, .5, 1.8, 'body');
    crack(bodyU(.5), bodyV(-.42), -Math.PI / 2 + r(), 2, .46, 1.8, 'body');
  });
  for (const [px, pw] of [[ax, aw], [lx, lw]]) clipped(px * w, (px + pw) * w, () => {
    for (let i = 0; i < 4; i++) crack((px + pw * (.2 + i * .2)) * w, h * (.15 + r() * .7), r() * TAU, 2, .55 - i * .05, 2, 'limb');
  });
  // blue: the eyes, a pinprick to start with and then the whole socket, and the mouth once they're well on
  const side = (off) => bodyU(across(off, BODY.head));
  for (const s of [-1, 1]) {
    const cx = side(s * .048), cy = bodyV(BODY.eyes);
    for (const [wide, tall, level] of [[8.5, 6, .26], [6.5, 4.6, .46], [4.6, 3.3, .68], [2.7, 2.2, .96]]) { g.fillStyle = `rgb(0,0,${Math.round(level * 255)})`; g.beginPath(); g.ellipse(cx, cy, wide * k, tall * k, -s * .12, 0, TAU); g.fill(); }
  }
  g.fillStyle = 'rgb(0,0,100)'; g.beginPath(); g.ellipse(bodyU(.25), bodyV(BODY.mouth) + 1 * k, 9 * k, 2.6 * k, 0, 0, TAU); g.fill();
  g.restore();
}

// What's coming off them: chalk strokes out from a body, drawn four times to go round on the twelve frames. How bright a stroke
// is says how far gone someone has to be before it shows, and a cell at the end holds the glow on the ground.
export const AURA_CELLS = 4;
export function drawAura(g, cell) {
  const r = seeded('coming off them');
  g.fillStyle = '#000'; g.fillRect(0, 0, cell * AURA_CELLS, cell);
  g.lineCap = 'round'; g.globalCompositeOperation = 'lighten';
  for (let c = 0; c < AURA_CELLS; c++) {
    const cx = (c + .5) * cell, cy = cell * .5, R = cell * .5, n = 26;
    for (let i = 0; i < n; i++) {
      // from round the outline of a person, straight out, dimming as it goes so that it reaches further the further gone they are
      const a = (i + (r() - .5) * .55) / n * TAU, level = .5 + r() * .5, ca = Math.cos(a), sa = Math.sin(a), wob = (r() - .5) * .1;
      const bx = cx + ca * R * .36, by = cy + sa * R * .72, nx = ca / .36, ny = sa / .72, nl = Math.hypot(nx, ny), dx = nx / nl, dy = ny / nl;
      const gap = .015 + r() * .04, L = .12 + r() * .11, wide = cell * (.007 + r() * .004);
      for (let t = 0; t < 8; t++) {
        const t0 = gap + L * t / 8, t1 = gap + L * (t + 1) / 8, v = Math.round(level * (1 - .62 * t / 8) * 255);
        g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = wide * (1 - .55 * t / 8);
        g.beginPath(); g.moveTo(bx + (dx + wob * t0) * R * t0, by + (dy - wob * t0) * R * t0); g.lineTo(bx + (dx + wob * t1) * R * t1, by + (dy - wob * t1) * R * t1); g.stroke();
      }
    }
  }
  g.globalCompositeOperation = 'source-over';
}
