// What a real building is made of. There's no three.js in here, so tools and node tests load it too.
//
// data/structures.json holds every building's footprint and what it looks like, and data/structures.md explains
// it. A building here is a list of pieces, every one a closed solid of its own: a wall panel no wider than PANEL,
// a section of roof, a window, a door. They're written into arrays one cell at a time, and each piece remembers
// its range of vertices and its place in its building, which stays the same however often the cell is written again.

export const PATTERN = { PAINT: 0, SIDING: 1, BRICK: 2, BLOCK: 3, METAL: 4, PLANK: 5, SHINGLE: 6, RIB: 7, WINDOW: 8, BOARDS: 9, DOOR: 10, LEAF: 11, MOBILE: 12, STUCCO: 13 };
const WALLS = { siding: PATTERN.SIDING, brick: PATTERN.BRICK, block: PATTERN.BLOCK, metal: PATTERN.METAL, plank: PATTERN.PLANK, mobile: PATTERN.MOBILE, stucco: PATTERN.STUCCO };

export const PANEL = 3, DOOR_WIDE = 1.6, DOOR_HIGH = 2.15, WALL_THICK = .2;
const ROOF_SECTION = 3.6, ROOF_THICK = .14, EAVES = .45, RAKE = .3;

// a repeatable number in [0, 1) for any two integers
export function hash2(a, b) {
  let x = Math.imul(a ^ Math.imul(b + 1, 2654435761), 1597334677);
  x ^= x >>> 15; x = Math.imul(x, 2246822519); x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

const srgb = (hex) => [1, 3, 5].map((i) => Math.pow(parseInt(hex.slice(i, i + 2), 16) / 255, 2.2));
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// Every building in the world's coordinates. `pts` is its footprint there: it stays rigid, even where the road
// has been compressed, and only its middle moves.
export function placeStructures(data, map) {
  return [...data.structures, ...(data.extras || [])].map((s, index) => {
    const [wx, wz] = map.fromTrue(s.x, s.z);
    return { ...s, index, wx, wz, pts: s.ring.map(([dx, dz]) => [wx + dx, wz + dz]) };
  });
}

export function boundsOf(pts) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  return { x0, x1, z0, z1 };
}

export function insideRing(x, z, pts) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, az] = pts[j], [bx, bz] = pts[i];
    if ((az > z) !== (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) hit = !hit;
  }
  return hit;
}

// The building's own axes, along its longest wall
export function axisOf(pts) {
  let best = -1, ux = 1, uz = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], l = Math.hypot(bx - ax, bz - az);
    if (l > best) { best = l; ux = (bx - ax) / l; uz = (bz - az) / l; }
  }
  return [ux, uz];
}

// A footprint as rectangles in its own axes, biggest first: each gets a roof of its own, the way the wings of a
// real one do. A footprint that isn't square-cornered gets one rectangle around the lot.
export function wingsOf(pts, [ux, uz] = axisOf(pts)) {
  const uv = pts.map(([x, z]) => [x * ux + z * uz, -x * uz + z * ux]);
  let square = true;
  for (let i = 0; i < uv.length; i++) {
    const [au, av] = uv[i], [bu, bv] = uv[(i + 1) % uv.length], du = Math.abs(bu - au), dv = Math.abs(bv - av);
    if (Math.min(du, dv) > Math.max(.35, Math.max(du, dv) * .12)) square = false;
  }
  const box = () => { const b = boundsOf(uv); return [[b.x0, b.x1, b.z0, b.z1]]; };
  if (!square) return box();
  const snap = (vals) => { const s = [...vals].sort((a, b) => a - b), out = [s[0]]; for (const v of s) if (v - out[out.length - 1] > .45) out.push(v); return out; };
  const us = snap(uv.map((p) => p[0])), vs = snap(uv.map((p) => p[1]));
  if (us.length < 2 || vs.length < 2) return box();
  us[us.length - 1] = Math.max(...uv.map((p) => p[0])); vs[vs.length - 1] = Math.max(...uv.map((p) => p[1]));
  const cells = us.slice(1).map((u1, i) => vs.slice(1).map((v1, j) => insideRing((us[i] + u1) / 2, (vs[j] + v1) / 2, uv)));
  const wings = [];
  for (;;) {
    let best = 0, at = null;
    for (let i = 0; i < cells.length; i++) for (let j = 0; j < cells[0].length; j++) for (let i1 = i; i1 < cells.length; i1++) for (let j1 = j; j1 < cells[0].length; j1++) {
      let all = true;
      for (let a = i; a <= i1 && all; a++) for (let b = j; b <= j1; b++) if (!cells[a][b]) { all = false; break; }
      if (!all) continue;
      const area = (us[i1 + 1] - us[i]) * (vs[j1 + 1] - vs[j]);
      if (area > best) { best = area; at = [i, i1, j, j1]; }
    }
    if (!at) break;
    const [i, i1, j, j1] = at;
    for (let a = i; a <= i1; a++) for (let b = j; b <= j1; b++) cells[a][b] = false;
    const w = [us[i], us[i1 + 1], vs[j], vs[j1 + 1]];
    if (Math.min(w[1] - w[0], w[3] - w[2]) > 1) wings.push(w);
  }
  return wings.length ? wings : box();
}

// How high the eaves are, above its floor
export function eavesOf(s) {
  if (s.eaves) return s.eaves;
  if (s.open) return s.sqm > 300 ? 4.8 : 2.8;
  if (s.walls === 'mobile') return 2.7;
  if (s.steep) return 4.6 * (s.floors ?? 1);
  if (s.use === 'farm' || (s.walls === 'metal' && s.sqm > 250)) return 4.4;
  if (s.roof === 'flat') return 3.5 * (s.floors ?? 1);
  return 2.75 * (s.floors ?? 1);
}
export function pitchOf(s) {
  if (s.pitch) return s.pitch;
  if (s.steep) return .95;
  if (s.walls === 'mobile') return .12;
  if (s.roofMat === 'metal') return s.use === 'farm' ? .22 : .32;
  return .42;
}

// Some of a ruin has already fallen in, and always the same panels of it
export const fellIn = (s, p, i) => s.condition === 'ruin' && p.kind === 'wall' && hash2(s.id | 0, 40 + i) < .22;

// The walls, as runs of panels. Each is { ax, az, bx, bz, nx, nz, y0, y1, solid, edge }, with n pointing out.
// Each door leaves a gap with a lintel over it, and `doors` says where the gaps are.
export function wallsOf(s, base = 0) {
  if (s.open) return { panels: [], doors: [] };
  const { pts } = s, H = eavesOf(s), panels = [], doors = [], n = pts.length, wanted = s.doors ?? 1;
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n], len = Math.hypot(bx - ax, bz - az);
    if (len < .05) continue;
    const ex = (bx - ax) / len, ez = (bz - az) / len, nx = ez, nz = -ex;
    const at = (t) => [ax + ex * t, az + ez * t];
    // a door takes the middle of its wall, or two of them share it
    const gaps = [];
    if (i === s.door && len > 1.1) {
      const wide = Math.min(DOOR_WIDE, len - .5), count = wanted > 1 && len > 7 ? wanted : 1;
      for (let d = 1; d <= count; d++) {
        const mid = len * d / (count + 1);
        gaps.push([mid - wide / 2, mid + wide / 2]);
        const [x, z] = at(mid);
        doors.push({ x, z, ex, ez, nx, nz, wide, edge: i });
      }
    }
    let from = 0;
    const run = (t0, t1) => {
      const count = Math.max(1, Math.ceil((t1 - t0) / PANEL - .01));
      for (let k = 0; k < count; k++) {
        const [px, pz] = at(t0 + (t1 - t0) * k / count), [qx, qz] = at(t0 + (t1 - t0) * (k + 1) / count);
        panels.push({ ax: px, az: pz, bx: qx, bz: qz, nx, nz, y0: base, y1: base + H, solid: true, edge: i, kind: 'wall' });
      }
    };
    for (const [g0, g1] of gaps) {
      if (g0 > from) run(from, g0);
      const [px, pz] = at(g0), [qx, qz] = at(g1);
      panels.push({ ax: px, az: pz, bx: qx, bz: qz, nx, nz, y0: base + Math.min(DOOR_HIGH, H - .2), y1: base + H, solid: false, edge: i, kind: 'lintel' });
      from = g1;
    }
    if (from < len) run(from, len);
  }
  return { panels, doors };
}

// What stops him: every solid panel and post still standing, as [ax, az, bx, bz, top, radius, which].
// `which` is the panel's place among the walls, or for the kth post -1 - k.
export function collidersOf(s, base = 0) {
  const out = [];
  wallsOf(s, base).panels.forEach((p, i) => { if (p.solid && !fellIn(s, p, i)) out.push([p.ax, p.az, p.bx, p.bz, p.y1, WALL_THICK / 2, i]); });
  postsOf(s, base).forEach(([x, z, top], k) => out.push([x, z, x + .001, z, top, .12, -1 - k]));
  return out;
}

// The posts holding up a porch or a carport, as [x, z, top]
function porchOf(s) {
  if (!s.porch || s.porch === 'none') return null;
  const { pts } = s, i = s.door, [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], len = Math.hypot(bx - ax, bz - az);
  if (len < 3) return null;
  const ex = (bx - ax) / len, ez = (bz - az) / len, nx = ez, nz = -ex, wide = Math.min(len - .4, s.porch === 'wrap' ? len : Math.max(3.6, len * .5)), mid = len / 2, deep = 2.1;
  return { ax: ax + ex * (mid - wide / 2), az: az + ez * (mid - wide / 2), ex, ez, nx, nz, wide, deep };
}
function carportOf(s) {
  if (!s.carport) return null;
  const { pts } = s, i = (s.door + 1) % pts.length, [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], len = Math.hypot(bx - ax, bz - az);
  if (len < 3) return null;
  const ex = (bx - ax) / len, ez = (bz - az) / len, nx = ez, nz = -ex, wide = Math.min(len, 6), deep = 3.2;
  return { ax: ax + ex * ((len - wide) / 2), az: az + ez * ((len - wide) / 2), ex, ez, nx, nz, wide, deep };
}
// A roof on posts down one wall, running down from under the eave: a porch along a house, an open bay on a barn.
// `lean` is { edge, deep, t0, t1, slope, post }, with t0 and t1 in metres along that edge.
function leanOf(s) {
  if (!s.lean) return null;
  const { edge, deep, t0, t1 } = s.lean, { pts } = s, [ax, az] = pts[edge], [bx, bz] = pts[(edge + 1) % pts.length], len = Math.hypot(bx - ax, bz - az), ex = (bx - ax) / len, ez = (bz - az) / len;
  return { ax: ax + ex * t0, az: az + ez * t0, ex, ez, nx: ez, nz: -ex, wide: t1 - t0, deep, lean: true };
}
// A roof with nothing under it but posts, around its edge and no further apart than this
function openPostsOf(s, base) {
  const out = [], { pts } = s, top = base + eavesOf(s), r = .28;
  if (!s.open) return out;
  pts.forEach(([ax, az], i) => {
    const [bx, bz] = pts[(i + 1) % pts.length], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 4.5));
    if (len < .5) return;
    for (let k = 0; k < n; k++) { const t = k / n; out.push([ax + (bx - ax) * t + (s.wx - ax) / Math.hypot(s.wx - ax, s.wz - az) * r, az + (bz - az) * t + (s.wz - az) / Math.hypot(s.wx - ax, s.wz - az) * r, top]); }
  });
  return out;
}
function postsOf(s, base) {
  const out = openPostsOf(s, base), H = Math.min(eavesOf(s), 2.6);
  for (const f of [porchOf(s), carportOf(s), leanOf(s)]) {
    if (!f) continue;
    const count = Math.max(2, Math.ceil(f.wide / 3.2));
    for (let k = 0; k < count; k++) { const t = f.wide * k / (count - 1); out.push([f.ax + f.ex * t + f.nx * (f.deep - .15), f.az + f.ez * t + f.nz * (f.deep - .15), base + H]); }
  }
  return out;
}

// ---------------------------------------------------------------- writing it down

// Growing arrays for one cell of buildings. position, normal, color, aUv and aMat line up, and aMat holds
// the surface's pattern, how much it glows, and for a roof which building it's the roof of.
export class Sheet {
  constructor() {
    this.cap = 4096; this.n = 0; this.iN = 0;
    this.position = new Float32Array(this.cap * 3); this.normal = new Float32Array(this.cap * 3); this.color = new Float32Array(this.cap * 3);
    this.uv = new Float32Array(this.cap * 2); this.mat = new Float32Array(this.cap * 3); this.index = new Uint32Array(this.cap * 2);
    this.pieces = []; this.partN = 0;
  }
  // to use it again, keeping what it's grown to
  reset() { this.n = 0; this.iN = 0; this.pieces = []; this.partN = 0; }
  grow() {
    this.cap *= 2;
    for (const [k, w] of [['position', 3], ['normal', 3], ['color', 3], ['uv', 2], ['mat', 3]]) { const a = new Float32Array(this.cap * w); a.set(this[k]); this[k] = a; }
  }
  // one flat triangle, facing away from the piece's middle, in the same way as a side
  tri(p0, p1, p2, c, o, m) {
    let nx = (p1[1] - p0[1]) * (p2[2] - p0[2]) - (p1[2] - p0[2]) * (p2[1] - p0[1]);
    let ny = (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]);
    let nz = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-5) return;
    nx /= l; ny /= l; nz /= l;
    const fx = (p0[0] + p1[0] + p2[0]) / 3 - m[0], fy = (p0[1] + p1[1] + p2[1]) / 3 - m[1], fz = (p0[2] + p1[2] + p2[2]) / 3 - m[2];
    const q = nx * fx + ny * fy + nz * fz < 0 ? [p0, p2, p1] : [p0, p1, p2], sign = q[1] === p1 ? 1 : -1;
    if (this.n + 3 > this.cap) this.grow();
    if (this.iN + 3 > this.index.length) { const a = new Uint32Array(this.index.length * 2); a.set(this.index); this.index = a; }
    const v = this.n;
    for (let i = 0; i < 3; i++) {
      const p = q[i], j = v + i;
      this.position[j * 3] = p[0]; this.position[j * 3 + 1] = p[1]; this.position[j * 3 + 2] = p[2];
      this.normal[j * 3] = nx * sign; this.normal[j * 3 + 1] = ny * sign; this.normal[j * 3 + 2] = nz * sign;
      this.color[j * 3] = c[0]; this.color[j * 3 + 1] = c[1]; this.color[j * 3 + 2] = c[2];
      this.uv[j * 2] = p[0] - o.origin[0] + p[1] - o.origin[1]; this.uv[j * 2 + 1] = p[2] - o.origin[2];
      this.mat[j * 3] = o.pattern; this.mat[j * 3 + 1] = o.glow || 0; this.mat[j * 3 + 2] = o.roofOf ?? -1;
      this.index[this.iN++] = j;
    }
    this.n += 3;
  }
  // one flat side, facing away from the piece's middle (mx, my, mz)
  quad(p0, p1, p2, p3, c, o, m) {
    let nx = (p2[1] - p0[1]) * (p3[2] - p1[2]) - (p2[2] - p0[2]) * (p3[1] - p1[1]);
    let ny = (p2[2] - p0[2]) * (p3[0] - p1[0]) - (p2[0] - p0[0]) * (p3[2] - p1[2]);
    let nz = (p2[0] - p0[0]) * (p3[1] - p1[1]) - (p2[1] - p0[1]) * (p3[0] - p1[0]);
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-5) return;
    nx /= l; ny /= l; nz /= l;
    const fx = (p0[0] + p1[0] + p2[0] + p3[0]) / 4 - m[0], fy = (p0[1] + p1[1] + p2[1] + p3[1]) / 4 - m[1], fz = (p0[2] + p1[2] + p2[2] + p3[2]) / 4 - m[2];
    let q = [p0, p1, p2, p3], uvs = o.unit ? [[0, 0], [1, 0], [1, 1], [0, 1]] : null;
    if (nx * fx + ny * fy + nz * fz < 0) { q = [p0, p3, p2, p1]; nx = -nx; ny = -ny; nz = -nz; if (uvs) uvs = [[0, 0], [0, 1], [1, 1], [1, 0]]; }
    // u along the building, v up the wall or the slope, measured in metres from its middle so that panels line up
    let ux, uy = 0, uz;
    if (Math.abs(ny) > .96) { ux = o.axis[0]; uz = o.axis[1]; } else { const h = Math.hypot(nz, nx); ux = nz / h; uz = -nx / h; }
    let vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    if (vy < 0 || (Math.abs(ny) > .96 && o.axis)) { if (vy < 0) { vx = -vx; vy = -vy; vz = -vz; } }
    if (this.n + 4 > this.cap) this.grow();
    if (this.iN + 6 > this.index.length) { const a = new Uint32Array(this.index.length * 2); a.set(this.index); this.index = a; }
    const v = this.n;
    for (let i = 0; i < 4; i++) {
      const p = q[i], k = o.lowDark && p[1] < m[1] ? o.lowDark : 1;
      this.position.set(p, v * 3 + i * 3 - 0); this.normal[(v + i) * 3] = nx; this.normal[(v + i) * 3 + 1] = ny; this.normal[(v + i) * 3 + 2] = nz;
      this.color[(v + i) * 3] = c[0] * k; this.color[(v + i) * 3 + 1] = c[1] * k; this.color[(v + i) * 3 + 2] = c[2] * k;
      if (uvs) { this.uv[(v + i) * 2] = uvs[i][0]; this.uv[(v + i) * 2 + 1] = uvs[i][1]; }
      else { const dx = p[0] - o.origin[0], dy = p[1] - o.origin[1], dz = p[2] - o.origin[2]; this.uv[(v + i) * 2] = dx * ux + dy * uy + dz * uz; this.uv[(v + i) * 2 + 1] = dx * vx + dy * vy + dz * vz; }
      this.mat[(v + i) * 3] = o.pattern; this.mat[(v + i) * 3 + 1] = o.glow || 0; this.mat[(v + i) * 3 + 2] = o.roofOf ?? -1;
    }
    this.index[this.iN++] = v; this.index[this.iN++] = v + 1; this.index[this.iN++] = v + 2;
    this.index[this.iN++] = v; this.index[this.iN++] = v + 2; this.index[this.iN++] = v + 3;
    this.n += 4;
  }
  // a solid from its four corners underneath and the four over them, with its own colours for the top and the sides
  solid([a, b, c, d, e, f, g, h], o) {
    const start = this.n, side = o.side || o.color, top = o.color, m = [0, 0, 0];
    for (const p of [a, b, c, d, e, f, g, h]) { m[0] += p[0] / 8; m[1] += p[1] / 8; m[2] += p[2] / 8; }
    if (!o.noBottom) this.quad(a, b, c, d, o.under || side, o, m);
    this.quad(e, f, g, h, top, o, m);
    this.quad(a, b, f, e, side, o, m); this.quad(b, c, g, f, side, o, m); this.quad(c, d, h, g, side, o, m); this.quad(d, a, e, h, side, o, m);
    if (o.kind) this.pieces.push({ kind: o.kind, s: o.s, part: this.partN++, panel: o.panel, on: o.on, first: start, count: this.n - start, x: m[0], y: m[1], z: m[2] });
  }
  // a square-cornered upright block around a wall line, reaching in by `inward` and out by `outward`
  upright(ax, az, bx, bz, nx, nz, y0, y1, inward, outward, o) {
    const low = (x, z) => [x, y0, z], high = (x, z) => [x, y1, z];
    const ox = nx * outward, oz = nz * outward, ix = -nx * inward, iz = -nz * inward;
    this.solid([low(ax + ox, az + oz), low(bx + ox, bz + oz), low(bx + ix, bz + iz), low(ax + ix, az + iz), high(ax + ox, az + oz), high(bx + ox, bz + oz), high(bx + ix, bz + iz), high(ax + ix, az + iz)], o);
  }
  // a blanket of leaves lying against a wall, lumpy and ragged at the edge. (x, z) is the middle of the edge it hangs or
  // climbs from at height y, e runs along the wall, n out of it, and h is how far it reaches, up or down.
  drape(x, y, z, ex, ez, nx, nz, w, h, c, seed, o) {
    const start = this.n, cols = 6, rows = 4, m = [x - nx, y + h / 2, z - nz];
    const at = (i, j) => {
      const k = Math.imul(seed, 31) + i * 7 + j * 101, inner = i > 0 && i < cols && j > 0 && j < rows, along = (i / cols - .5) * w + (hash2(k, 1) - .5) * w / cols * .7, up = j ? j / rows * h + (hash2(k, 2) - .5) * h / rows * .7 : 0, out = inner ? .1 + hash2(k, 3) * .14 : .08;
      return [x + ex * along + nx * out, y + up, z + ez * along + nz * out];
    };
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      // wide where it starts, narrowing to a ragged tongue
      if (Math.hypot(((i + .5) / cols - .5) * 2, (j + .5) / rows) > .86 + (hash2(seed, 200 + i * 9 + j) - .5) * .5) continue;
      const p00 = at(i, j), p10 = at(i + 1, j), p11 = at(i + 1, j + 1), p01 = at(i, j + 1), tint = (k) => shade(c, .72 + hash2(seed, 300 + i * 11 + j * 3 + k) * .56);
      this.tri(p00, p10, p11, tint(0), o, m); this.tri(p00, p11, p01, tint(1), o, m);
    }
    if (o.kind) this.pieces.push({ kind: o.kind, s: o.s, part: this.partN++, on: o.on, first: start, count: this.n - start, x, y: y + h / 2, z });
  }
  arrays() {
    return { position: this.position.subarray(0, this.n * 3), normal: this.normal.subarray(0, this.n * 3), color: this.color.subarray(0, this.n * 3), uv: this.uv.subarray(0, this.n * 2), mat: this.mat.subarray(0, this.n * 3), index: this.index.subarray(0, this.iN), pieces: this.pieces };
  }
}

// Writes one building on a sheet. `base` is the height of its floor.
export function writeStructure(sheet, s, base = 0) {
  sheet.partN = 0;
  const seed = s.id | 0, wall = srgb(s.wallColor), roof = srgb(s.roofColor), axis = axisOf(s.pts), origin = [s.wx, base, s.wz], H = eavesOf(s), hurt = s.condition === 'ruin' ? .55 : s.condition === 'worn' ? .22 : s.condition === 'sound' ? 0 : .07;
  const tone = .92 + hash2(seed, 1) * .16, pattern = WALLS[s.walls] ?? PATTERN.SIDING, trim = s.trimColor ? srgb(s.trimColor) : shade([.62, .58, .52], tone), lit = s.lit ? 1 : 0;
  const base0 = { s: s.index, axis, origin };
  const { panels, doors } = wallsOf(s, base);
  const missing = new Set();
  // Everyone's been gone a while: some of it has already fallen in.
  panels.forEach((p, i) => {
    const k = hash2(seed, 40 + i);
    if (fellIn(s, p, i)) { missing.add(i); return; }
    sheet.upright(p.ax, p.az, p.bx, p.bz, p.nx, p.nz, p.y0, p.y1, WALL_THICK, 0, { ...base0, kind: p.kind, panel: i, color: shade(wall, tone * (.94 + k * .12)), lowDark: .72, noBottom: true, pattern, edge: p.edge });
  });
  // windows
  const smallWindows = s.use === 'shed' || s.use === 'farm';
  const plate = s.use === 'shop' || s.use === 'office' || s.use === 'public' || s.use === 'hall';
  panels.forEach((p, i) => {
    if (p.kind !== 'wall' || missing.has(i)) return;
    const len = Math.hypot(p.bx - p.ax, p.bz - p.az), k = hash2(seed, 200 + i);
    if (len < 1.5 || k < (smallWindows ? .88 : p.edge === s.door ? .15 : .4)) return;
    for (let floor = 0; floor < (s.floors ?? 1); floor++) {
      const mobile = s.walls === 'mobile', wide = Math.min(len - .5, plate && p.edge === s.door ? 2.2 : mobile ? 1 : 1.05), high = plate && p.edge === s.door ? 1.75 : mobile ? .85 : 1.25, sill = base + floor * 2.75 + (plate && p.edge === s.door ? .55 : mobile ? 1.25 : .9);
      const ex = (p.bx - p.ax) / len, ez = (p.bz - p.az) / len, mx = (p.ax + p.bx) / 2, mz = (p.az + p.bz) / 2;
      const boarded = !lit && hash2(seed, 300 + i) < hurt * 2.4;
      sheet.upright(mx - ex * wide / 2, mz - ez * wide / 2, mx + ex * wide / 2, mz + ez * wide / 2, p.nx, p.nz, sill, sill + high, WALL_THICK + .03, .03, { ...base0, kind: 'window', on: i, color: boarded ? shade([.3, .22, .14], .8 + k * .5) : trim, pattern: boarded ? PATTERN.BOARDS : PATTERN.WINDOW, glow: lit, unit: true });
      if (s.shutters && !boarded) for (const side of [-1, 1]) {
        const t0 = wide / 2 + .02, t1 = wide / 2 + .42;
        sheet.upright(mx + ex * side * t0, mz + ez * side * t0, mx + ex * side * t1, mz + ez * side * t1, p.nx, p.nz, sill, sill + high, 0, .05, { ...base0, kind: 'shutter', on: i, color: shade([.05, .05, .06], tone * 1.4), pattern: PATTERN.PLANK });
      }
    }
  });
  // doors stand open, in the way they were left
  const doorColor = s.doorColor ? srgb(s.doorColor) : shade([[.3, .08, .06], [.55, .52, .47], [.08, .2, .22], [.16, .1, .07]][Math.floor(hash2(seed, 5) * 4)], 1);
  const lintels = []; panels.forEach((p, i) => { if (p.kind === 'lintel') lintels.push(i); });
  doors.forEach((d, i) => {
    const swing = .9 + hash2(seed, 500 + i) * .7, wide = d.wide / 2, hx = d.x - d.ex * d.wide / 2, hz = d.z - d.ez * d.wide / 2;
    const dirx = d.ex * Math.cos(swing) - d.nx * Math.sin(swing), dirz = d.ez * Math.cos(swing) - d.nz * Math.sin(swing);
    sheet.upright(hx, hz, hx + dirx * wide, hz + dirz * wide, -dirz, dirx, base, base + DOOR_HIGH - .05, .03, .03, { ...base0, kind: 'door', on: lintels[i], color: doorColor, pattern: PATTERN.DOOR, unit: true, noBottom: true });
  });
  // roll-up doors, shut, down the wall the door's on
  if (s.bays) {
    const [ax, az] = s.pts[s.door], [bx, bz] = s.pts[(s.door + 1) % s.pts.length], len = Math.hypot(bx - ax, bz - az), ex = (bx - ax) / len, ez = (bz - az) / len, wide = Math.min(3.2, len / (s.bays + 1) - .4), nx = ez, nz = -ex, high = Math.min(3.4, H - (s.band ?? .3));
    for (let i = 0; i < s.bays; i++) {
      // clear of the door in the middle, spaced along what's left
      const t = len * (i + .5) / s.bays + (i < s.bays / 2 ? -1 : 1) * Math.min(.8, len * .03), mx = ax + ex * t, mz = az + ez * t;
      if (Math.abs(t - len / 2) < wide / 2 + DOOR_WIDE / 2) continue;
      let on = -1, od = Infinity;
      panels.forEach((p, q) => { if (p.kind === 'wall' && !missing.has(q)) { const d = Math.hypot((p.ax + p.bx) / 2 - mx, (p.az + p.bz) / 2 - mz); if (d < od) { od = d; on = q; } } });
      sheet.upright(mx - ex * wide / 2, mz - ez * wide / 2, mx + ex * wide / 2, mz + ez * wide / 2, nx, nz, base, base + high, 0, .06, { ...base0, kind: 'bay', on, color: shade(wall, .62), pattern: PATTERN.SIDING, noBottom: true });
    }
  }
  // the top of the door wall painted in with the gable, and a louvre up under the ridge
  if (s.band || s.vent) {
    const [ax, az] = s.pts[s.door], [bx, bz] = s.pts[(s.door + 1) % s.pts.length], len = Math.hypot(bx - ax, bz - az), ex = (bx - ax) / len, ez = (bz - az) / len, nx = ez, nz = -ex, E = base + H;
    if (s.band) sheet.upright(ax, az, bx, bz, nx, nz, E - s.band, E, 0, .03, { ...base0, kind: 'gable', color: shade(srgb(s.gableColor ?? s.wallColor), tone), pattern: PATTERN.PAINT, noBottom: true });
    if (s.vent) { const mx = (ax + bx) / 2, mz = (az + bz) / 2, w = Math.min(.9, len * .12); sheet.upright(mx - ex * w, mz - ez * w, mx + ex * w, mz + ez * w, nx, nz, E - .12, E + .5, 0, .07, { ...base0, kind: 'vent', color: shade([.2, .2, .22], tone), pattern: PATTERN.BOARDS, unit: true, noBottom: true }); }
  }
  // the floor, from the wings
  const wings = wingsOf(s.pts, axis), [ux, uz] = axis;
  const toWorld = (a, b, y, flip) => (flip ? [b * ux - a * uz, y, b * uz + a * ux] : [a * ux - b * uz, y, a * uz + b * ux]);
  for (const [u0, u1, v0, v1] of wings) {
    const fl = shade([.1, .085, .07], tone);
    sheet.solid([toWorld(u0, v0, base, 0), toWorld(u1, v0, base, 0), toWorld(u1, v1, base, 0), toWorld(u0, v1, base, 0), toWorld(u0, v0, base + .03, 0), toWorld(u1, v0, base + .03, 0), toWorld(u1, v1, base + .03, 0), toWorld(u0, v1, base + .03, 0)], { ...base0, color: fl, pattern: PATTERN.PLANK, noBottom: true });
  }
  // the roof, a wing at a time
  const roofPat = s.roofMat === 'metal' ? PATTERN.RIB : PATTERN.SHINGLE, pitch = pitchOf(s), E = base + H;
  const roofO = { ...base0, roofOf: s.index, pattern: roofPat, kind: 'roof', under: shade(roof, .35) };
  let sectionN = 0;
  const section = (corners, o = {}) => {
    sectionN++;
    if (hash2(seed, 900 + sectionN) < hurt * .55) return;
    const k = .92 + hash2(seed, 700 + sectionN) * .16;
    sheet.solid(corners, { ...roofO, color: shade(roof, k), side: o.side || shade(roof, k * .6), ...o });
  };
  const thick = (p) => [p[0], p[1] - ROOF_THICK, p[2]];
  // Four corners of a section of slope, thickened downwards
  const slope = (flip, pts4) => { const w = pts4.map(([a, b, y]) => toWorld(a, b, y, flip)); section([...w.map(thick), ...w]); };
  // On a cross gable each wing after the first turns its ridge across the main one and runs in to meet it, no higher than it is.
  const mainRidge = (() => { const [u0, u1, v0, v1] = wings[0]; return Math.min(u1 - u0, v1 - v0) / 2 * pitch; })();
  wings.forEach(([u0, u1, v0, v1], w) => {
    const cross = s.cross && w > 0, [mu0, mu1, mv0, mv1] = wings[0], mainFlip = mu1 - mu0 < mv1 - mv0;
    const flip = cross ? !mainFlip : u1 - u0 < v1 - v0, b0 = flip ? u0 : v0, b1 = flip ? u1 : v1, bm = (b0 + b1) / 2, half = (b1 - b0) / 2;
    let a0 = flip ? v0 : u0, a1 = flip ? v1 : u1, in0 = false, in1 = false;
    if (cross) { const mid = mainFlip ? (mu0 + mu1) / 2 : (mv0 + mv1) / 2; if (mid < a0) { a0 = mid; in0 = true; } else if (mid > a1) { a1 = mid; in1 = true; } }
    const rise = cross ? Math.min(half * pitch, mainRidge) : half * pitch, slopeK = rise / (half || 1);
    const P = (a, b, y) => toWorld(a, b, y, flip);
    if (s.roof === 'flat') {
      const nA = Math.max(1, Math.ceil((a1 - a0 + .5) / 4)), nB = Math.max(1, Math.ceil((b1 - b0 + .5) / 4)), fascia = s.trimColor ? trim : shade(wall, .86);
      for (let i = 0; i < nA; i++) for (let j = 0; j < nB; j++) {
        const A0 = a0 - .25 + (a1 - a0 + .5) * i / nA, A1 = a0 - .25 + (a1 - a0 + .5) * (i + 1) / nA, B0 = b0 - .25 + (b1 - b0 + .5) * j / nB, B1 = b0 - .25 + (b1 - b0 + .5) * (j + 1) / nB;
        section([P(A0, B0, E), P(A1, B0, E), P(A1, B1, E), P(A0, B1, E), P(A0, B0, E + .3), P(A1, B0, E + .3), P(A1, B1, E + .3), P(A0, B1, E + .3)], { side: fascia, pattern: PATTERN.RIB });
      }
      return;
    }
    const ridge = E + rise, eave = E - EAVES * slopeK, sections = (from, to) => { const n = Math.max(1, Math.ceil((to - from) / ROOF_SECTION)); return Array.from({ length: n }, (_, i) => [from + (to - from) * i / n, from + (to - from) * (i + 1) / n]); };
    const gableEnd = (a, inward) => {
      const c = s.gableColor ? shade(srgb(s.gableColor), tone) : shade(wall, tone * .95), o = { ...base0, kind: 'gable', color: c, pattern: s.gableColor ? PATTERN.PAINT : pattern, roofOf: s.index };
      sheet.solid([P(a, b0, E), P(a, b1, E), P(a + inward, b1, E), P(a + inward, b0, E), P(a, bm, ridge), P(a, bm, ridge), P(a + inward, bm, ridge), P(a + inward, bm, ridge)], o);
    };
    if (s.roof === 'shed') {
      const up = (b1 - b0) * .16, A0 = a0 - RAKE, A1 = a1 + RAKE, high = E + up + EAVES * .16, low = E - EAVES * .16;
      for (const [x0, x1] of sections(A0, A1)) slope(flip, [[x0, b0 - EAVES, low], [x1, b0 - EAVES, low], [x1, b1 + EAVES, high], [x0, b1 + EAVES, high]]);
      if (!s.open) for (const [a, inward] of [[a0, WALL_THICK], [a1, -WALL_THICK]]) {
        sheet.solid([P(a, b0, E), P(a, b1, E), P(a + inward, b1, E), P(a + inward, b0, E), P(a, b1, E + up), P(a, b1, E + up), P(a + inward, b1, E + up), P(a + inward, b1, E + up)], { ...base0, kind: 'gable', color: shade(wall, tone * .95), pattern, roofOf: s.index });
      }
      return;
    }
    if (s.roof === 'hip') {
      const hb = half + EAVES, ha = (a1 - a0) / 2 + EAVES, am = (a0 + a1) / 2, run = Math.max(0, ha - hb), top = eave + hb * pitch;
      for (const side of [-1, 1]) {
        const eb = bm + side * hb;
        // the slope beside the ridge, in sections, and a triangle at each end
        slope(flip, [[am - ha, eb, eave], [am - run, eb, eave], [am - run, bm, top], [am - run, bm, top]]);
        for (const [x0, x1] of sections(am - run, am + run)) if (x1 > x0) slope(flip, [[x0, eb, eave], [x1, eb, eave], [x1, bm, top], [x0, bm, top]]);
        slope(flip, [[am + run, eb, eave], [am + ha, eb, eave], [am + run, bm, top], [am + run, bm, top]]);
      }
      for (const side of [-1, 1]) slope(flip, [[am + side * ha, bm - hb, eave], [am + side * ha, bm + hb, eave], [am + side * run, bm, top], [am + side * run, bm, top]]);
      return;
    }
    // a gable: two slopes meeting at a ridge along the wing's length
    for (const side of [-1, 1]) for (const [x0, x1] of sections(a0 - RAKE, a1 + RAKE)) slope(flip, [[x0, bm + side * (half + EAVES), eave], [x1, bm + side * (half + EAVES), eave], [x1, bm, ridge], [x0, bm, ridge]]);
    if (!s.open) { if (!in0) gableEnd(a0, WALL_THICK); if (!in1) gableEnd(a1, -WALL_THICK); }
  });
  for (const [x, z, top] of openPostsOf(s, base)) {
    const r = s.sqm > 300 ? .16 : .08, post = shade(s.trimColor ? trim : wall, .9);
    sheet.solid([[x - r, base, z - r], [x + r, base, z - r], [x + r, base, z + r], [x - r, base, z + r], [x - r, top, z - r], [x + r, top, z - r], [x + r, top, z + r], [x - r, top, z + r]], { ...base0, kind: 'post', color: post, pattern: PATTERN.PAINT, noBottom: true });
  }
  // a porch on posts over the door, and a carport on the wall beside it
  for (const [f, kind] of [[porchOf(s), 'porch'], [carportOf(s), 'carport'], [leanOf(s), 'porch']]) {
    if (!f) continue;
    const under = E - EAVES * pitch - .02, top = f.lean ? under - f.deep * (s.lean.slope ?? .13) : base + Math.min(H, 2.6), high = f.lean ? under : base + Math.min(H, 2.6) + .28, c = shade(roof, .95), post = f.lean && s.lean.post ? srgb(s.lean.post) : f.lean && s.trimColor ? trim : shade(wall, .9);
    const corner = (t, d, y) => [f.ax + f.ex * t + f.nx * d, y, f.az + f.ez * t + f.nz * d];
    const n = Math.max(1, Math.ceil(f.wide / ROOF_SECTION));
    for (let i = 0; i < n; i++) {
      const t0 = f.wide * i / n, t1 = f.wide * (i + 1) / n;
      sheet.solid([corner(t0, 0, high - .1), corner(t1, 0, high - .1), corner(t1, f.deep, top - .1), corner(t0, f.deep, top - .1), corner(t0, 0, high), corner(t1, 0, high), corner(t1, f.deep, top), corner(t0, f.deep, top)], { ...base0, kind, color: c, side: shade(c, .6), pattern: roofPat, roofOf: -1 });
    }
    const count = Math.max(2, Math.ceil(f.wide / 3.2));
    for (let k = 0; k < count; k++) {
      const t = f.wide * k / (count - 1), [x, , z] = corner(t, f.deep - .15, 0), r = .07;
      sheet.solid([[x - r, base, z - r], [x + r, base, z - r], [x + r, base, z + r], [x - r, base, z + r], [x - r, top, z - r], [x + r, top, z - r], [x + r, top, z + r], [x - r, top, z + r]], { ...base0, kind: 'post', color: post, pattern: PATTERN.PAINT, noBottom: true });
    }
    // the board along the posts' tops
    if (f.lean) { const b0 = corner(0, f.deep - .1, 0), b1 = corner(f.wide, f.deep - .1, 0); sheet.upright(b0[0], b0[2], b1[0], b1[2], f.nx, f.nz, top - .3, top - .08, .08, .06, { ...base0, kind: 'post', color: post, pattern: PATTERN.PAINT }); }
  }
  // kudzu, over everything left standing: spilling from under the eaves or climbing from the ground, flat to the walls
  if (!s.open) {
    const patches = Math.round((s.sqm > 300 ? 6 : 3) * (s.condition === 'ruin' ? 3 : s.condition === 'worn' ? 1.8 : 1)), n = s.pts.length;
    for (let i = 0; i < patches; i++) {
      const e = Math.floor(hash2(seed, 1000 + i) * n);
      if (e === s.door) continue;
      const [ax, az] = s.pts[e], [bx, bz] = s.pts[(e + 1) % n], len = Math.hypot(bx - ax, bz - az);
      if (len < 1.4) continue;
      const ex = (bx - ax) / len, ez = (bz - az) / len, wide = Math.min(len - .1, 1.8 + hash2(seed, 1100 + i) * 2.6), t = wide / 2 + .05 + hash2(seed, 1200 + i) * (len - wide - .1), down = hash2(seed, 1300 + i) < .55, reach = Math.min(H - .8, 1 + hash2(seed, 1400 + i) * 1.5);
      // it goes with the panel it's on
      const x = ax + ex * t, z = az + ez * t; let on = -1, od = Infinity;
      panels.forEach((p, q) => { if (p.edge === e && !missing.has(q)) { const d = Math.hypot((p.ax + p.bx) / 2 - x, (p.az + p.bz) / 2 - z); if (d < od) { od = d; on = q; } } });
      sheet.drape(x, down ? base + H : base + .02, z, ex, ez, ez, -ex, wide, down ? -reach : reach, [.05 + hash2(seed, 1500 + i) * .05, .16 + hash2(seed, 1600 + i) * .13, .035], seed + i, { ...base0, kind: 'kudzu', on, pattern: PATTERN.LEAF });
    }
  }
}

// Buildings by the cell their middle's in
export function cellsOf(structures, size) {
  const cells = new Map();
  for (const s of structures) {
    const cx = Math.floor(s.wx / size), cz = Math.floor(s.wz / size), k = `${cx},${cz}`;
    if (!cells.has(k)) cells.set(k, { x: (cx + .5) * size, z: (cz + .5) * size, list: [], key: k, mesh: null });
    cells.get(k).list.push(s);
  }
  return [...cells.values()];
}
