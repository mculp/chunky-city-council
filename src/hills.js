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
      v[k] = Math.max(0, base + fine[k]) / quantum;
    }
  }
  return { heights: v, far: c };
}

// A cubic spline through the grid: smooth all the way through, so there's no crease in the land for a road to float over or dip under
export function buildHills(data, map) {
  const { cols, rows, dx, dz } = data, { heights: v, far } = decodeHills(data), wx = new Float64Array(4), wz = new Float64Array(4);
  const [x0, z0] = map ? map.toWorld(data.x0, data.z0) : [data.x0, data.z0];
  const weights = (w, f) => { const f2 = f * f, f3 = f2 * f; w[0] = (1 - 3 * f + 3 * f2 - f3) / 6; w[1] = (4 - 6 * f2 + 3 * f3) / 6; w[2] = (1 + 3 * f + 3 * f2 - 3 * f3) / 6; w[3] = f3 / 6; };
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
  return { cols, rows, x0, z0, dx, dz, heights: v, at, slope, follow, skyline };
}

export async function loadHills(url, map) {
  return buildHills(await (await fetch(url)).json(), map);
}
