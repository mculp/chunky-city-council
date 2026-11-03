// What everyone but the hero wears, drawn onto a canvas at load: crayon cloth and a chalk skull. Canvas only, so
// the game has no image files and this has no idea three.js exists. The looks are in data/looks.json.
const TAU = Math.PI * 2, INK = '#060408';

export const PATTERNS = ['plain', 'stripes', 'bolts', 'ribs'];
export const EYES = ['hollow', 'rings', 'x', 'shades'];
export const TEETH = ['plain', 'bloody'];
export const MARKS = ['caution', 'flammable', 'radioactive'];
export const LINES = ['plain', 'glow', 'spikes'];

const seeded = (text) => { let s = 7; for (const c of text) s = (s * 31 + c.charCodeAt(0)) % 2147483647; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

// Cloth for a body, with u going once round him from his left side, past his front at u = .25, and v going from his
// hem at `from` up to the top of his hood at `to`, in metres. A sleeve gets the cloth without the hem or anything on the chest.
export function drawCloth(g, x, y, w, h, look, { from, to, around = 2.3, painted = false, sleeve = false }) {
  const r = seeded(look.id), [c0, c1 = c0, c2 = c0] = look.hood.colors, k = w / 512;
  const U = (u) => x + u * w, V = (at) => y + h * (1 - (at - from) / (to - from));
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.fillStyle = c0; g.fillRect(x, y, w, h);

  if (look.hood.pattern === 'stripes') {
    // soft-edged, as if sprayed, and they run together over the hood
    const n = 15;
    for (let i = 0; i < n; i++) {
      const u = (i + .5) / n + (r() - .5) * .012, wide = w / n * (.36 + r() * .2), lean = (r() - .5) * .03, ph = r() * TAU;
      for (const [f, a] of [[1.5, .16], [1.1, .3], [.7, .55]]) {
        g.strokeStyle = c1; g.globalAlpha = a; g.lineWidth = wide * f;
        g.beginPath(); for (let t = 0; t <= 1.001; t += .1) { const px = U(u + lean * t + Math.sin(ph + t * 7) * .005), py = y + h * (1 - t); t ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke();
      }
    }
  } else if (look.hood.pattern === 'bolts') {
    const inks = [c1, c2, '#5a0d3c', c1, c2, '#ff7ad0'], n = w * h / 700;
    for (let i = 0; i < n; i++) {
      const cx = x + r() * w, cy = y + r() * h, L = (8 + r() * r() * 46) * k, a = r() * TAU, thin = .22 + r() * .4;
      g.fillStyle = inks[Math.floor(r() * inks.length)]; g.globalAlpha = .5 + r() * .45;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); g.lineTo(cx + Math.cos(a + 2.5) * L * thin, cy + Math.sin(a + 2.5) * L * thin); g.lineTo(cx + Math.cos(a - 2.5) * L * thin, cy + Math.sin(a - 2.5) * L * thin); g.closePath(); g.fill();
    }
  } else if (look.hood.pattern === 'ribs') {
    // front and back the same: a spine, and ribs curving away from it, each ending in a spark
    g.strokeStyle = c1;
    for (const mid of [.25, .75]) {
      g.globalAlpha = 1; g.lineWidth = 4 * k;
      g.beginPath(); g.moveTo(U(mid), V(.14)); g.lineTo(U(mid), V(from)); g.stroke();
      for (let at = -.74; at <= .03; at += .085) for (const side of [-1, 1]) {
        const reach = .19 + r() * .035, end = [U(mid + side * reach), V(at - .05)];
        g.globalAlpha = 1; g.lineWidth = (3.4 + r() * 1.6) * k; g.strokeStyle = c1;
        g.beginPath(); g.moveTo(U(mid), V(at)); g.quadraticCurveTo(U(mid + side * reach * .6), V(at + .025), end[0], end[1]); g.stroke();
        g.fillStyle = c2; g.beginPath(); g.arc(end[0], end[1], 2.2 * k, 0, TAU); g.fill();
      }
    }
    // cracks of the same over the hood and in between
    g.lineWidth = 1.4 * k;
    for (let i = 0; i < 26; i++) {
      let px = x + r() * w, py = y + r() * h;
      g.strokeStyle = r() < .3 ? c2 : c1; g.globalAlpha = .55 + r() * .4; g.beginPath(); g.moveTo(px, py);
      for (let j = 0; j < 5; j++) { px += (r() - .5) * 34 * k; py += (r() - .5) * 26 * k; g.lineTo(px, py); }
      g.stroke();
    }
  }

  // crayon tooth, which is what makes it a rubbing rather than a fill
  for (let i = 0, n = w * h / 300; i < n; i++) {
    const a = .9 + (r() - .5) * .5, L = (3 + r() * 9) * k, cx = x + r() * w, cy = y + r() * h;
    g.strokeStyle = r() < .55 ? '#ffffff' : '#000000'; g.globalAlpha = .03 + r() * .07; g.lineWidth = (.6 + r() * 1.2) * k;
    g.beginPath(); g.moveTo(cx - Math.cos(a) * L, cy - Math.sin(a) * L); g.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); g.stroke();
  }
  g.globalAlpha = 1;

  if (!sleeve) {
    // the hem, which is also where a hand on a crowd's arm gets its black
    g.fillStyle = INK; g.fillRect(x, V(from + (to - from) * .03), w, y + h - V(from + (to - from) * .03));
    // what's on the chest is drawn in metres
    const sx = w / around, sy = h / (to - from), chest = (at, fn) => { g.save(); g.translate(U(.25), V(at)); g.scale(sx, sy); fn(); g.restore(); };
    if (look.mark) chest(look.tassels?.tied ? -.3 : -.22, () => drawMark(g, look.mark, r));
    if (painted && look.tassels) chest(0, () => drawTassels(g, look.tassels));
  }
  g.restore();
}

function drawMark(g, mark, r) {
  g.rotate((r() - .5) * .3);
  if (mark.kind === 'caution') {
    g.lineWidth = .02; g.strokeStyle = INK; g.fillStyle = mark.color;
    g.beginPath(); g.moveTo(0, -.095); g.lineTo(.1, .075); g.lineTo(-.1, .075); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = INK; g.beginPath(); g.moveTo(-.012, -.045); g.lineTo(.012, -.045); g.lineTo(.006, .02); g.lineTo(-.006, .02); g.closePath(); g.fill();
    g.beginPath(); g.arc(0, .045, .012, 0, TAU); g.fill();
  } else if (mark.kind === 'flammable') {
    g.lineWidth = .014; g.strokeStyle = INK; g.fillStyle = mark.color;
    g.fillRect(-.065, -.085, .13, .17); g.strokeRect(-.065, -.085, .13, .17);
    g.fillStyle = INK;
    g.beginPath(); g.moveTo(0, -.06); g.bezierCurveTo(.05, -.02, .045, .05, 0, .055); g.bezierCurveTo(-.045, .05, -.05, 0, -.018, -.022); g.bezierCurveTo(-.015, -.005, -.005, -.005, 0, -.06); g.fill();
    g.fillStyle = mark.color; g.beginPath(); g.ellipse(0, .028, .014, .02, 0, 0, TAU); g.fill();
  } else if (mark.kind === 'radioactive') {
    g.lineWidth = .016; g.strokeStyle = INK; g.fillStyle = mark.color;
    g.beginPath(); g.arc(0, 0, .095, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = INK;
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, .078, a - .5, a + .5); g.closePath(); g.fill(); }
    g.fillStyle = mark.color; g.beginPath(); g.arc(0, 0, .024, 0, TAU); g.fill();
    g.fillStyle = INK; g.beginPath(); g.arc(0, 0, .015, 0, TAU); g.fill();
  }
}

// Under the chin, for someone whose cords are only painted on
function drawTassels(g, t) {
  const back = t.color === '#0c0809' ? '#f8fdfb' : INK;
  const stroke = (fn) => { for (const [color, wide] of [[back, .021], [t.color, .012]]) { g.strokeStyle = color; g.lineWidth = wide; g.beginPath(); fn(); g.stroke(); } };
  g.lineCap = 'round';
  if (t.tied) stroke(() => {
    g.moveTo(-.1, .08); g.quadraticCurveTo(-.04, .03, 0, -.02); g.moveTo(.1, .08); g.quadraticCurveTo(.04, .03, 0, -.02);
    g.moveTo(0, -.02); g.bezierCurveTo(-.09, .02, -.1, -.07, 0, -.02); g.moveTo(0, -.02); g.bezierCurveTo(.09, .02, .1, -.07, 0, -.02);
    g.moveTo(0, -.02); g.lineTo(-.045, -.15); g.moveTo(0, -.02); g.lineTo(.045, -.15);
  });
  else stroke(() => { g.moveTo(-.1, .08); g.quadraticCurveTo(-.115, -.02, -.135, -.12); g.moveTo(.1, .08); g.quadraticCurveTo(.09, -.02, .08, -.12); });
  g.fillStyle = t.color; for (const side of [-1, 1]) { g.beginPath(); g.arc(side * .1, .08, .017, 0, TAU); g.fill(); }
}

// A skull in the dark of the hood, where a unit across is half the width of the opening and a unit up is from its chin to
// its top. The numbers are measured: tall scribbled eyes 70% of the way up, a small nose just under halfway, and two rows of
// square teeth, the bottom row narrower than the top.
export function drawSkull(g, x, y, w, h, look) {
  const r = seeded(look.id + 'skull'), s = look.skull || {}, c = s.line || look.line.color, S = w / 2;
  const X = (t) => x + w / 2 + t * S, Y = (t) => y + h * (1 - t);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = '#020103'; g.fillRect(x, y, w, h);
  g.lineCap = 'round'; g.lineJoin = 'round';

  const oval = (cx, cy, rx, ry, tilt) => {
    if (s.eyes === 'rings') {
      g.strokeStyle = c; g.globalAlpha = 1; g.lineWidth = S * .055;
      for (const f of [1, .66, .34]) { g.beginPath(); g.ellipse(X(cx), Y(cy - (1 - f) * ry * .35), rx * S * f, ry * h * f, tilt, 0, TAU); g.stroke(); }
      return;
    }
    // scribbled in, one way and then back, thin in the middle and a bit below it, with a few loops round the edge
    g.strokeStyle = c;
    g.save(); g.beginPath(); g.ellipse(X(cx), Y(cy), rx * S, ry * h, tilt, 0, TAU); g.clip();
    for (let i = 0; i < 70; i++) {
      const a = 1.15 + (r() - .5) * .9, L = (.06 + r() * .16) * S, px = X(cx) + (r() - .5) * 2 * rx * S, py = Y(cy) + (r() - .5) * 2 * ry * h;
      const off = Math.hypot((px - X(cx)) / (rx * S), (py - Y(cy) - ry * h * .14) / (ry * h));
      g.globalAlpha = Math.min(1, .12 + off * off * .95) * (.6 + r() * .4); g.lineWidth = S * (.014 + r() * .024);
      g.beginPath(); g.moveTo(px - Math.cos(a) * L, py - Math.sin(a) * L); g.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L); g.stroke();
    }
    g.restore();
    for (let i = 0; i < 9; i++) {
      const a = r() * TAU; g.globalAlpha = .55 + r() * .45; g.lineWidth = S * (.016 + r() * .022);
      g.beginPath(); g.ellipse(X(cx + (r() - .5) * .04), Y(cy + (r() - .5) * .016), rx * S * (.92 + r() * .1), ry * h * (.92 + r() * .1), tilt + (r() - .5) * .14, a, a + 2.2 + r() * 3); g.stroke();
    }
    g.globalAlpha = 1;
  };
  const scrawl = (x0, t0, x1, t1, color, wide) => {
    g.strokeStyle = color;
    for (let i = 0; i < 7; i++) { g.globalAlpha = .55 + r() * .45; g.lineWidth = S * wide * (.4 + r() * .6); g.beginPath(); g.moveTo(X(x0 + (r() - .5) * .07), Y(t0 + (r() - .5) * .03)); g.lineTo(X(x1 + (r() - .5) * .07), Y(t1 + (r() - .5) * .03)); g.stroke(); }
    g.globalAlpha = 1;
  };

  if (s.eyes !== 'shades') for (const side of [-1, 1]) {
    oval(side * .39, .705, .275, .165, -side * .08);
    if (s.eyes === 'x') { const a = s.accent || c; scrawl(side * .39 - .34, .79, side * .39 + .34, .6, a, .17); scrawl(side * .39 + .34, .79, side * .39 - .34, .6, a, .17); }
  }

  // the nose: an outline, a little filled in
  g.strokeStyle = c; g.lineWidth = S * .07; g.globalAlpha = 1;
  g.beginPath(); g.moveTo(X(0), Y(.565)); g.lineTo(X(.167), Y(.417)); g.lineTo(X(-.167), Y(.417)); g.closePath(); g.stroke();
  g.fillStyle = c; g.globalAlpha = .28; g.fill(); g.globalAlpha = 1;

  // a row of teeth is one wobbling line, square-waved, with a slight smile to it
  const row = (x0, x1, top, bottom, n) => {
    g.strokeStyle = c; g.lineWidth = S * .06; g.beginPath();
    const step = (x1 - x0) / n, at = (px, t) => [X(px + (r() - .5) * .025), Y(t + (r() - .5) * .014 + .035 * px * px)];
    g.moveTo(...at(x0, (top + bottom) / 2));
    for (let i = 0; i < n; i++) {
      const a = x0 + i * step, up = top + (r() - .5) * .03, down = bottom + (r() - .5) * .03;
      g.lineTo(...at(a + step * .06, up)); g.lineTo(...at(a + step * .4, up + .008)); g.lineTo(...at(a + step * .5, down)); g.lineTo(...at(a + step * .9, down + .008));
    }
    g.lineTo(...at(x1, (top + bottom) / 2)); g.stroke();
  };
  row(-.88, .88, .377, .246, 7);
  row(-.6, .6, .197, .072, 5);

  if (s.teeth === 'bloody') {
    // on every tooth, and running
    for (let i = 0; i < 16; i++) {
      const top = i < 9, px = top ? -.9 + i * .225 : -.58 + (i - 9) * .193, t = top ? .31 : .13;
      g.fillStyle = '#ff1426'; g.strokeStyle = '#ff1426';
      for (let j = 0; j < 5; j++) { g.globalAlpha = .7 + r() * .3; g.beginPath(); g.ellipse(X(px + (r() - .5) * .12), Y(t + (r() - .5) * .07), S * (.03 + r() * .05), S * (.03 + r() * .05), r() * 3, 0, TAU); g.fill(); }
      if (r() < .55) { g.lineWidth = S * .025; g.globalAlpha = .9; g.beginPath(); g.moveTo(X(px), Y(t)); g.lineTo(X(px + (r() - .5) * .04), Y(t - .05 - r() * .1)); g.stroke(); }
    }
    g.globalAlpha = 1;
  }

  if (s.eyes === 'shades') {
    // a wraparound visor: dark band along the top, and colour across it from the temples to the bridge of the nose
    const bands = ['#26dcff', '#f2fbff', '#ffd21f', '#ff9a1f', '#ffc21f', '#ffe36a', '#f2fbff', '#26dcff'];
    g.save(); g.beginPath();
    g.moveTo(X(-1.02), Y(.72)); g.quadraticCurveTo(X(0), Y(.91), X(1.02), Y(.72));
    g.lineTo(X(.98), Y(.58)); g.quadraticCurveTo(X(.52), Y(.44), X(.2), Y(.53)); g.quadraticCurveTo(X(0), Y(.6), X(-.2), Y(.53)); g.quadraticCurveTo(X(-.52), Y(.44), X(-.98), Y(.58)); g.closePath();
    g.clip();
    bands.forEach((b, i) => { g.fillStyle = b; g.fillRect(X(-1.05 + i * .2625), y, .2625 * S + 1, h); });
    g.restore();
    g.strokeStyle = INK; g.lineWidth = S * .05; g.beginPath(); g.moveTo(X(-1.02), Y(.72)); g.quadraticCurveTo(X(0), Y(.91), X(1.02), Y(.72)); g.stroke();
    g.fillStyle = c; g.beginPath(); g.moveTo(X(-.22), Y(.815)); g.quadraticCurveTo(X(0), Y(.91), X(.22), Y(.815)); g.closePath(); g.globalAlpha = .9; g.fill(); g.globalAlpha = 1;
  }
  g.restore();
}
