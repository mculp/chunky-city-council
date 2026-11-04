// What's along Pine Forest Rd where it passes the compound: the woods on its east side, close enough together that a car gets in only by the drive, the woven-wire fence
// along the edge of the road in front of them, and the few pines in the grass across the road. There's no three.js or page in here, so node tests load it too.
// It's all in true metres, from the road's own line as it's drawn, which TIGER has about 5 m east of the real asphalt there, so the woods stand off it as the real ones
// stand off the road.

export const FRONTAGE = {
  // from the bend north of the compound to about 50 m south of the drive, by how far south the nearest point of the road is
  from: 548, to: 800,
  // how far off the road's line the trees stand, and the fence, in metres. That's deep enough that the fastest car there is, flat out, has gone through all it can before
  // it's through them.
  near: 6.8, far: 22, fence: 5.2,
  // how far apart the trees are, near enough, and how many of them are pines
  step: 2.5, pines: .55,
  // the drive, where nothing stands: its first stretch off the road, and how far either side of it is kept clear
  drive: { from: [851.6, 736.3], to: [875, 734], half: 4.6 },
};
// In the grass across the road, north of the sign: the two pines with the white sand under them, and a few more along the road, which the grass carries on past
export const GRASS_PINES = [[845.5, 708.5, 1.5], [846.2, 712.6, 1.3], [838, 690, 1.4], [843.5, 671, 1.6], [834, 655, 1.2], [841, 638, 1.5]];

const toSegment = (x, z, [ax, az], [bx, bz]) => {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-9)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};
// The nearest point of a line to x, z: how far it is, and where
function nearest(line, x, z) {
  let best = { d: Infinity, x: 0, z: 0 };
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1], [bx, bz] = line[i], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-9)));
    const qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(x - qx, z - qz);
    if (d < best.d) best = { d, x: qx, z: qz };
  }
  return best;
}

// Whether x, z is in the woods' strip, gap and all, so that the hashed woods leave it to these
export function inWoods(line, x, z, F = FRONTAGE) {
  const q = nearest(line, x, z);
  return x > q.x && q.d > F.near - 1.5 && q.d < F.far + 1.5 && q.z > F.from - 2 && q.z < F.to + 2;
}

// The trees, each { x, z, pine, size, i, j }: a staggered grid in true metres, nudged by the hash so it isn't rows, kept to the east side of the road between near and far,
// and off the drive. i and j are where it is in the grid, for anything else that wants a number of its own for it. hash(a, b, s) is 0 to 1, from whole numbers.
export function woodsAlong(line, hash, F = FRONTAGE) {
  const a = F.step, rowH = a * Math.sqrt(3) / 2, nudge = a * .32, out = [];
  const near = line.filter(([, z]) => z > F.from - F.far && z < F.to + F.far), x0 = Math.min(...near.map(([x]) => x)), x1 = Math.max(...near.map(([x]) => x)) + F.far;
  for (let j = Math.floor((F.from - F.far) / rowH); j <= Math.ceil((F.to + F.far) / rowH); j++) {
    for (let i = Math.floor(x0 / a) - 1; i <= Math.ceil(x1 / a) + 1; i++) {
      const x = (i + (j & 1) * .5) * a + (hash(i, j, 61) - .5) * nudge, z = j * rowH + (hash(i, j, 62) - .5) * nudge, q = nearest(line, x, z);
      if (x <= q.x || q.d < F.near || q.d > F.far || q.z < F.from || q.z > F.to) continue;
      if (toSegment(x, z, F.drive.from, F.drive.to) < F.drive.half) continue;
      const pine = hash(i, j, 63) < F.pines;
      out.push({ x, z, pine, size: (pine ? 1.35 : 1.15) + hash(i, j, 64) * .6, i, j });
    }
  }
  return out;
}

// The fence, as lines of corners: along the road at `fence` metres out on the east side, from one end of the woods to the other, and left open across the drive
export function fenceAlong(line, F = FRONTAGE) {
  // the road's line moved out to the east, mitred at the bends
  const east = (i) => { const [ax, az] = line[i], [bx, bz] = line[i + 1], l = Math.hypot(bx - ax, bz - az), s = bz >= az ? 1 : -1; return [s * (bz - az) / l, -s * (bx - ax) / l]; };
  const moved = line.map(([x, z], i) => {
    const a = i > 0 ? east(i - 1) : east(i), b = i < line.length - 1 ? east(i) : a, mx = a[0] + b[0], mz = a[1] + b[1], l = Math.hypot(mx, mz), out = F.fence / ((a[0] * mx + a[1] * mz) / l);
    return [x + mx / l * out, z + mz / l * out];
  });
  // walked in short steps, kept wherever it's in the stretch and off the drive, with its corners and where it's cut
  const keep = (x, z) => { const q = nearest(line, x, z); return q.z >= F.from && q.z <= F.to && toSegment(x, z, F.drive.from, F.drive.to) >= F.drive.half + .6; };
  const runs = [], STEP = .2;
  let run = null, last = null;
  const end = () => { if (run) { if (last) run.push(last); runs.push(run); } run = last = null; };
  for (let i = 1; i < moved.length; i++) {
    const [ax, az] = moved[i - 1], [bx, bz] = moved[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP));
    for (let k = 0; k <= n; k++) {
      const p = k === n ? [bx, bz] : [ax + (bx - ax) * k / n, az + (bz - az) * k / n];
      if (!keep(...p)) { end(); continue; }
      if (!run) run = [p];
      last = p;
    }
    // a corner it goes on round
    if (run && last && last[0] === bx && last[1] === bz) { run.push(last); last = null; }
  }
  end();
  // nothing twice over, where a corner was also where it was cut
  return runs.map((r) => r.filter((p, k) => k === 0 || Math.hypot(p[0] - r[k - 1][0], p[1] - r[k - 1][1]) > .01)).filter((r) => r.length > 1);
}
