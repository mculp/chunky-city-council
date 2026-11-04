// The map: the world's own roads, railroad, river and buildings, drawn flat on a canvas. No image files, and nothing here knows about the game.

export const COLORS = { grass: '#2a3a2c', dirt: '#b0602c', ground: '#0d0812', river: 'rgba(111,214,200,.42)', rail: '#ec803a', house: '#5f5570', houseEdge: '#120b14', road: '#f1e6cf', lane: '#b5a68e', ink: '#120b14', cream: '#f1e6cf', rust: '#ec803a', cyan: '#6fd6c8', hot: '#e3285c', dusk: '#a99bc0', blue: '#5b8cff' };

// Long lines cut into short pieces with boxes round them, so a small view only draws what it can see
const PIECE = 12;
function cut(line, out) {
  for (let i = 0; i < line.length - 1; i += PIECE) {
    const q = line.slice(i, i + PIECE + 1), pts = new Float32Array(q.length * 2);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    q.forEach(([x, z], k) => { pts[k * 2] = x; pts[k * 2 + 1] = z; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); });
    out.push({ pts, x0, x1, z0, z1 });
  }
}

export function buildMapData({ roads, lanes: laneRows = [], rail, river, ponds = [], structures, fields = [] }) {
  const major = [], minor = [], lanes = [], drives = [], tracks = [], water = [], lakes = [], houses = [], grass = [], dirt = [];
  for (const r of roads) cut(r.pts, r.width > 7 ? major : minor);
  for (const r of laneRows) cut(r.pts, r.structure ? drives : r.name ? minor : lanes);
  for (const l of rail) cut(l, tracks);
  for (const l of river) cut(l, water);
  const shape = (list) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of list) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return { pts: new Float32Array(list.flat()), x0, x1, z0, z1 };
  };
  for (const l of ponds) lakes.push(shape(l));
  for (const s of structures) houses.push(shape(s.pts));
  for (const f of fields) { grass.push(shape(f.grass)); if (f.dirt) dirt.push(shape(f.dirt)); }
  const bounds = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const p of [...major, ...minor, ...lanes, ...tracks]) { bounds.x0 = Math.min(bounds.x0, p.x0); bounds.x1 = Math.max(bounds.x1, p.x1); bounds.z0 = Math.min(bounds.z0, p.z0); bounds.z1 = Math.max(bounds.z1, p.z1); }
  return { major, minor, lanes, drives, tracks, water, lakes, houses, grass, dirt, bounds, roads };
}

// World to screen. A yaw of 0 is north up. Any other yaw turns the map with a camera at that yaw, so what's ahead of the camera is up.
export function makeView(x, z, scale, yaw, w, h) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { scale, a: scale * c, b: scale * s, c: -scale * s, d: scale * c, e: w / 2 - scale * (x * c - z * s), f: h / 2 - scale * (x * s + z * c) };
}
export const toScreen = (v, x, z) => [v.a * x + v.c * z + v.e, v.b * x + v.d * z + v.f];
export function toWorld(v, sx, sy) {
  const px = sx - v.e, py = sy - v.f, det = v.a * v.d - v.b * v.c;
  return [(v.d * px - v.c * py) / det, (v.a * py - v.b * px) / det];
}
// the box of world a w by h screen can see, whichever way it's turned
export function worldBox(v, w, h) {
  const box = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const [sx, sy] of [[0, 0], [w, 0], [0, h], [w, h]]) { const [x, z] = toWorld(v, sx, sy); box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.z0 = Math.min(box.z0, z); box.z1 = Math.max(box.z1, z); }
  return box;
}

// The whole map's camera: where it's looking and how close. It stops at the edge of the map, and at a limit either way.
export const fitScale = (bounds, w, h) => Math.min(w / (bounds.x1 - bounds.x0), h / (bounds.z1 - bounds.z0)) * .92;
export const MAX_SCALE = 3;
export function clampCam(cam, bounds, w, h) {
  const scale = Math.min(MAX_SCALE, Math.max(fitScale(bounds, w, h), cam.scale));
  return { x: Math.min(bounds.x1, Math.max(bounds.x0, cam.x)), z: Math.min(bounds.z1, Math.max(bounds.z0, cam.z)), scale };
}
// Zoom keeping whatever's under a point of the screen under it
export function zoomAbout(cam, sx, sy, k, bounds, w, h) {
  const scale = Math.min(MAX_SCALE, Math.max(fitScale(bounds, w, h), cam.scale * k));
  const before = toWorld(makeView(cam.x, cam.z, cam.scale, 0, w, h), sx, sy), after = toWorld(makeView(cam.x, cam.z, scale, 0, w, h), sx, sy);
  return clampCam({ x: cam.x + before[0] - after[0], z: cam.z + before[1] - after[1], scale }, bounds, w, h);
}

function trace(g, list, box, close) {
  g.beginPath();
  for (const p of list) {
    if (p.x1 < box.x0 || p.x0 > box.x1 || p.z1 < box.z0 || p.z0 > box.z1) continue;
    const q = p.pts; g.moveTo(q[0], q[1]);
    for (let i = 2; i < q.length; i += 2) g.lineTo(q[i], q[i + 1]);
    if (close) g.closePath();
  }
}

const DRIVES_FROM = .5;
// The land itself. `road` is how wide the big and small roads are in pixels.
export function drawWorld(g, data, v, dpr, box, { road, houses = true, edges = false }) {
  const s = v.scale;
  g.setTransform(dpr * v.a, dpr * v.b, dpr * v.c, dpr * v.d, dpr * v.e, dpr * v.f);
  g.lineCap = g.lineJoin = 'round';
  if (data.grass.length) { trace(g, data.grass, box, true); g.fillStyle = COLORS.grass; g.fill(); trace(g, data.dirt, box, true); g.fillStyle = COLORS.dirt; g.fill(); }
  trace(g, data.water, box); g.strokeStyle = COLORS.river; g.lineWidth = Math.max(3 / s, 24); g.stroke();
  if (data.lakes.length) { trace(g, data.lakes, box, true); g.fillStyle = COLORS.river; g.fill(); }
  if (houses) { trace(g, data.houses, box, true); g.fillStyle = COLORS.house; g.fill(); if (edges) { g.strokeStyle = COLORS.houseEdge; g.lineWidth = 1 / s; g.stroke(); } }
  trace(g, data.tracks, box); g.lineCap = 'butt'; g.strokeStyle = COLORS.rail; g.lineWidth = 1.6 / s; g.stroke();
  g.setLineDash([1.4 / s, 6 / s]); g.lineWidth = 5 / s; g.stroke(); g.setLineDash([]); g.lineCap = 'round';
  // the little ones in one thin pale line, and somebody's drive only once you're close enough to tell which house it goes to
  if (s > DRIVES_FROM) { trace(g, data.drives, box); g.strokeStyle = COLORS.ink; g.lineWidth = (road[1] * .3 + 1.5) / s; g.stroke(); g.strokeStyle = COLORS.lane; g.lineWidth = road[1] * .3 / s; g.stroke(); }
  trace(g, data.lanes, box); g.strokeStyle = COLORS.ink; g.lineWidth = (road[1] * .55 + 1.5) / s; g.stroke(); g.strokeStyle = COLORS.lane; g.lineWidth = road[1] * .55 / s; g.stroke();
  trace(g, data.minor, box); g.strokeStyle = COLORS.ink; g.lineWidth = (road[1] + 2) / s; g.stroke();
  trace(g, data.major, box); g.lineWidth = (road[0] + 2) / s; g.stroke();
  trace(g, data.minor, box); g.strokeStyle = COLORS.road; g.lineWidth = road[1] / s; g.stroke();
  trace(g, data.major, box); g.lineWidth = road[0] / s; g.stroke();
}

// Where a road's name goes: along it, the right way up, about every `every` pixels of it that's on screen
export function roadLabels(road, v, w, h, every = 420, margin = 40) {
  const out = [], inside = (x, y) => x > margin && x < w - margin && y > margin && y < h - margin;
  let run = every * .55, prev = null;
  for (const [x, z] of road.pts) {
    const at = toScreen(v, x, z);
    if (prev) {
      const dx = at[0] - prev[0], dy = at[1] - prev[1], L = Math.hypot(dx, dy);
      for (let t = 0; t < L;) {
        const sx = prev[0] + dx * t / L, sy = prev[1] + dy * t / L;
        if (!inside(sx, sy)) { t += 40; continue; }
        const step = Math.min(every - run, L - t, 40);
        run += step; t += step;
        if (run >= every) {
          let angle = Math.atan2(dy, dx);
          if (angle > Math.PI / 2) angle -= Math.PI; else if (angle < -Math.PI / 2) angle += Math.PI;
          out.push({ text: road.name, x: prev[0] + dx * Math.min(t, L) / L, y: prev[1] + dy * Math.min(t, L) / L, angle }); run = 0;
        }
      }
    }
    prev = at;
  }
  return out;
}

// Hard against the rim of a circle if it's beyond it
export function toRim(cx, cy, x, y, r) {
  const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
  return d <= r ? [x, y, false] : [cx + dx / d * r, cy + dy / d * r, true];
}

// The arrow for which way someone's facing, pointing along (dx, dy) on the screen
export function drawArrow(g, x, y, dx, dy, size, fill = COLORS.rust) {
  const L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, px = -uy, py = ux;
  g.beginPath();
  g.moveTo(x + ux * size, y + uy * size);
  g.lineTo(x - ux * size * .8 + px * size * .78, y - uy * size * .8 + py * size * .78);
  g.lineTo(x - ux * size * .35, y - uy * size * .35);
  g.lineTo(x - ux * size * .8 - px * size * .78, y - uy * size * .8 - py * size * .78);
  g.closePath();
  g.fillStyle = fill; g.strokeStyle = COLORS.ink; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke(); g.fill();
}

// A word with an ink edge, so it reads over anything
export function drawLabel(g, text, x, y, font, fill = COLORS.cream, angle = 0, align = 'center') {
  g.save(); g.translate(x, y); g.rotate(angle); g.font = font; g.textAlign = align; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.strokeStyle = COLORS.ink; g.lineWidth = 4; g.strokeText(text, 0, 0); g.fillStyle = fill; g.fillText(text, 0, 0); g.restore();
}

// Labels take turns, most important first, and one that'd land on another is left out
export function labelSpace() {
  const used = [];
  return (x, y, w, h) => { const a = { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2 }; for (const b of used) if (a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0) return false; used.push(a); return true; };
}
