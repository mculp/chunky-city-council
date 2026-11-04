// How far the land stands over the floodplain. There's no three.js in here, so tools and node tests load it too.
//
// The game's world is flat, and walking, driving and the crowd all happen on that. This is only what it's drawn on: index.html moves every
// vertex up by it, on the graphics card, with the same lookup as at(). data/hills.md has the rest.

// Whole numbers from data/hills.json: each is what its neighbours suggest, plus a number, and a zero byte is a run of nothing to add
function unpack(data, cols, rows) {
  const bin = atob(data), q = new Int32Array(cols * rows);
  let at = 0, run = 0;
  const number = () => { let n = 0, shift = 0, b; do { b = bin.charCodeAt(at++); n |= (b & 127) << shift; shift += 7; } while (b & 128); return n; };
  for (let k = 0; k < q.length; k++) {
    let r = 0;
    if (run > 0) run--;
    else if (bin.charCodeAt(at) === 0) { at++; run = number() - 1; }
    else { const z = number(); r = z & 1 ? -((z + 1) >> 1) : z >> 1; }
    const left = k % cols ? q[k - 1] : 0, up = k >= cols ? q[k - cols] : 0, corner = k >= cols && k % cols ? q[k - cols - 1] : 0;
    q[k] = r + left + up - corner;
  }
  return q;
}
// The heights in metres: the land every few pixels, and what to add to that wherever it's seen up close
export function decodeHills({ data, cols, rows, quantum, coarse }) {
  const fine = unpack(data, cols, rows), c = unpack(coarse.data, coarse.cols, coarse.rows), S = coarse.stride, area = S * S, v = new Float32Array(cols * rows);
  for (let j = 0, k = 0; j < rows; j++) {
    const b = Math.floor(j / S), y = j % S;
    for (let i = 0; i < cols; i++, k++) {
      const a = Math.floor(i / S), x = i % S, n = b * coarse.cols + a;
      const base = Math.floor((c[n] * (S - x) * (S - y) + c[n + 1] * x * (S - y) + c[n + coarse.cols] * (S - x) * y + c[n + coarse.cols + 1] * x * y + Math.floor(area / 2)) / area);
      v[k] = (base + fine[k]) / quantum;
    }
  }
  return { heights: v, far: c };
}

// metres: how fast a stretch of a track counts for less the further off it is than the nearest one, and how far off a terrace's box a track's all the way its own,
// so that a track that ends beside a terrace meets it without a step
export const TRACK_SOFT = 1, TRACK_EASE = 3;
// A cubic spline through the grid: smooth all the way through, so there's no crease in the land for a road to float over or dip under
export function buildHills(data, map) {
  const { cols, rows, dx, dz } = data, { heights: v, far } = decodeHills(data), wx = new Float64Array(4), wz = new Float64Array(4);
  const [x0, z0] = map ? map.toWorld(data.x0, data.z0) : [data.x0, data.z0];
  const weights = (w, f) => { const f2 = f * f, f3 = f2 * f; w[0] = (1 - 3 * f + 3 * f2 - f3) / 6; w[1] = (4 - 6 * f2 + 3 * f3) / 6; w[2] = (1 + 3 * f + 3 * f2 - 3 * f3) / 6; w[3] = f3 / 6; };
  // Ground somebody cut and filled flat where it's steeper than a pixel can hold: level across its box, and back to the land by `edge` metres out of it
  const terraces = (data.terraces ?? []).map((t) => {
    const [ax, az] = map ? map.toWorld(t.x0, t.z0) : [t.x0, t.z0], [bx, bz] = map ? map.toWorld(t.x1, t.z1) : [t.x1, t.z1];
    return { x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz), edge: t.edge, at: t.at };
  });
  // A track cut and filled down a hill: level across its width, at the height its points have along it, and back to the land by `edge` metres out of it. Each stretch's height
  // counts for more the nearer it is (TRACK_SOFT), so there's no step where one stretch gives way to the next on the inside of a bend, and each carries on at its own grade
  // for up to its length past a point in the middle of the track, so the grade's as even through a point as either side of it. It goes after the terraces, so that it
  // keeps its grade down to one, and not on one, so that it stays flat. It ends at the terrace's level, and it eases out by TRACK_EASE short of a terrace's box, so it
  // meets one without a step.
  const tracks = (data.tracks ?? []).map((t) => {
    const pts = t.points.map(([x, z, h]) => [...(map ? map.toWorld(x, z) : [x, z]), h]), out = t.width / 2 + t.edge, xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    return { pts, half: t.width / 2, edge: t.edge, box: [Math.min(...xs) - out, Math.min(...zs) - out, Math.max(...xs) + out, Math.max(...zs) + out] };
  });
  const at = (x, z) => {
    const fx = (x - x0) / dx - .5, fz = (z - z0) / dz - .5, i = Math.floor(fx), j = Math.floor(fz);
    weights(wx, fx - i); weights(wz, fz - j);
    let sum = 0;
    for (let b = 0; b < 4; b++) {
      const row = Math.max(0, Math.min(rows - 1, j + b - 1)) * cols;
      let r = 0;
      for (let a = 0; a < 4; a++) r += wx[a] * v[row + Math.max(0, Math.min(cols - 1, i + a - 1))];
      sum += wz[b] * r;
    }
    let off = Infinity;
    for (const t of terraces) {
      const out = Math.hypot(Math.max(t.x0 - x, 0, x - t.x1), Math.max(t.z0 - z, 0, z - t.z1)), k = Math.min(1, out / t.edge);
      sum += (t.at - sum) * (1 - k * k * (3 - 2 * k)); off = Math.min(off, out);
    }
    for (const t of tracks) {
      if (off === 0 || x < t.box[0] || z < t.box[1] || x > t.box[2] || z > t.box[3]) continue;
      let near = Infinity, sw = 0, sh = 0;
      const last = t.pts.length - 1;
      for (let k = 1; k <= last; k++) {
        const [ax, az, ah] = t.pts[k - 1], [bx, bz, bh] = t.pts[k], ex = bx - ax, ez = bz - az, u = ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez), f = Math.max(0, Math.min(1, u));
        const d = Math.hypot(x - ax - ex * f, z - az - ez * f), w = Math.exp(-d / TRACK_SOFT), on = Math.max(k === 1 ? 0 : -1, Math.min(k === last ? 1 : 2, u));
        near = Math.min(near, d); sw += w; sh += w * (ah + (bh - ah) * on);
      }
      const k = Math.min(1, Math.max(0, (near - t.half) / t.edge)), e = Math.min(1, off / TRACK_EASE);
      sum += (sh / sw - sum) * (1 - k * k * (3 - 2 * k)) * e * e * (3 - 2 * e);
    }
    return sum;
  };
  // how it slopes, east and south, in metres a metre
  const slope = (x, z, e = 6) => [(at(x + e, z) - at(x - e, z)) / (2 * e), (at(x, z + e) - at(x, z - e)) / (2 * e)];
  // Points along a line, with more put in wherever the land's curved enough that a straight stretch would leave it by more than `tol`. A line that's on the flat stays as it is.
  const follow = (pts, tol = .015, least = 1.5) => {
    const out = [pts[0]];
    const split = (ax, az, ha, bx, bz, hb, depth) => {
      const L = Math.hypot(bx - ax, bz - az);
      let off = false;
      if (L > least * 2 && depth < 12) for (let t = .25; t < 1 && !off; t += .25) off = Math.abs(at(ax + (bx - ax) * t, az + (bz - az) * t) - (ha + (hb - ha) * t)) > tol;
      if (!off) { out.push([bx, bz]); return; }
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, hm = at(mx, mz);
      split(ax, az, ha, mx, mz, hm, depth + 1); split(mx, mz, hm, bx, bz, hb, depth + 1);
    };
    for (let i = 1; i < pts.length; i++) split(pts[i - 1][0], pts[i - 1][1], at(pts[i - 1][0], pts[i - 1][1]), pts[i][0], pts[i][1], at(pts[i][0], pts[i][1]), 0);
    return out;
  };
  // the skyline: a height every few pixels, in metres, and how far apart they are
  const skyline = { cols: data.coarse.cols, rows: data.coarse.rows, x0: x0 + dx / 2, z0: z0 + dz / 2, dx: dx * data.coarse.stride, dz: dz * data.coarse.stride, heights: Float32Array.from(far, (q) => q / data.quantum) };
  return { cols, rows, x0, z0, dx, dz, heights: v, at, slope, follow, skyline, terraces, tracks };
}

export async function loadHills(url, map) {
  return buildHills(await (await fetch(url)).json(), map);
}
