// What's along Pine Forest Rd where it passes the compound: the woods on its east side, close enough together that a car gets in only by the drive, the woven-wire fence
// along the edge of the road in front of them, and the few pines in the grass across the road. The same woods and fence go round the compound's north and south sides back to
// the river. There's no three.js or page in here, so node tests load it too.
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
  // The north and south sides: a thinner band, how far in from its fence, whose line carries straight on from each end of the frontage's fence to `to`, out past the
  // river's edge. `in` is near enough the way into the compound. Its trees go on down the bank into the water, as far as it's `wade` deep, and its fence on into the
  // river until it's `deep`, past where anything that tried to drive round its end would drown (src/vehicles.js).
  sides: { near: 1.6, far: 13.6, wade: .5, deep: 1.2, ends: [{ to: [1090, 550], in: [0, 1] }, { to: [1215, 799], in: [0, -1] }] },
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

// Each side: where its line starts and stops, along it and square into the compound as unit vectors, and how long it is
export function sidesOf(line, F = FRONTAGE) {
  const runs = frontageFence(line, F), starts = [runs[0][0], runs.at(-1).at(-1)];
  return F.sides.ends.map(({ to, in: hint }, k) => {
    const from = starts[k], l = Math.hypot(to[0] - from[0], to[1] - from[1]), u = [(to[0] - from[0]) / l, (to[1] - from[1]) / l], n = u[1] * hint[0] - u[0] * hint[1] > 0 ? [u[1], -u[0]] : [-u[1], u[0]];
    return { from, to, u, in: n, long: l };
  });
}
// how far along a side x, z is, and how far in from its line
const onSide = (S, x, z) => [(x - S.from[0]) * S.u[0] + (z - S.from[1]) * S.u[1], (x - S.from[0]) * S.in[0] + (z - S.from[1]) * S.in[1]];

// Whether x, z is in the woods' strip or the sides', gap and all, so that the hashed woods leave it to these. Working out the sides walks the road, so anything that asks
// often works them out once and passes them.
export function inWoods(line, x, z, F = FRONTAGE, sides = sidesOf(line, F)) {
  const q = nearest(line, x, z);
  if (x > q.x && q.d > F.near - 1.5 && q.d < F.far + 1.5 && q.z > F.from - 2 && q.z < F.to + 2) return true;
  return sides.some((S) => { const [t, s] = onSide(S, x, z); return t > -1.5 && t < S.long + 1.5 && s > F.sides.near - 1.5 && s < F.sides.far + 1.5; });
}

// The trees, each { x, z, pine, size, i, j, side }: a staggered grid in true metres, nudged by the hash so it isn't rows, kept to the east side of the road between near and far,
// and off the drive, and to the sides' bands, off the road and out of the river. It's the one grid for all of it, so where the bands meet at the corners there's a tree at a
// spot once. i and j are where it is in the grid, for anything else that wants a number of its own for it, and side is which side's band it's in, or -1 for the frontage.
// hash(a, b, s) is 0 to 1, from whole numbers. deep(x, z) is how deep the water is, less than nothing on dry land, which the page knows and a test needn't.
export function woodsAlong(line, hash, F = FRONTAGE, { sides = sidesOf(line, F), deep = null } = {}) {
  const a = F.step, rowH = a * Math.sqrt(3) / 2, nudge = a * .32, out = [], D = F.sides;
  const near = line.filter(([, z]) => z > F.from - F.far && z < F.to + F.far), ends = sides.flatMap((S) => [S.from, S.to]);
  const x0 = Math.min(...near.map(([x]) => x), ...ends.map(([x]) => x - D.far)), x1 = Math.max(...near.map(([x]) => x + F.far), ...ends.map(([x]) => x + D.far));
  const z0 = Math.min(F.from - F.far, ...ends.map(([, z]) => z - D.far)), z1 = Math.max(F.to + F.far, ...ends.map(([, z]) => z + D.far));
  for (let j = Math.floor(z0 / rowH); j <= Math.ceil(z1 / rowH); j++) {
    for (let i = Math.floor(x0 / a) - 1; i <= Math.ceil(x1 / a) + 1; i++) {
      const x = (i + (j & 1) * .5) * a + (hash(i, j, 61) - .5) * nudge, z = j * rowH + (hash(i, j, 62) - .5) * nudge, q = nearest(line, x, z);
      const front = x > q.x && q.d >= F.near && q.d <= F.far && q.z >= F.from && q.z <= F.to && toSegment(x, z, F.drive.from, F.drive.to) >= F.drive.half;
      const side = front || q.d < F.near ? -1 : sides.findIndex((S) => { const [t, s] = onSide(S, x, z); return t >= 0 && t <= S.long && s >= D.near && s <= D.far; });
      if (!front && (side < 0 || (deep && deep(x, z) > D.wade))) continue;
      const pine = hash(i, j, 63) < F.pines;
      out.push({ x, z, pine, size: (pine ? 1.35 : 1.15) + hash(i, j, 64) * .6, i, j, side });
    }
  }
  return out;
}

// The fence, as lines of corners, each with the side it's on as woodsAlong has them: along the road at `fence` metres out on the east side, from one end of the woods to
// the other, and left open across the drive, and then on from each end of that along the side and into the river, as far as it's `deep`
export function fenceAlong(line, F = FRONTAGE, { sides = sidesOf(line, F), deep = null } = {}) {
  const ends = sides.map((S, side) => {
    let t = S.long;
    if (deep) for (let k = 0; k <= S.long; k += .25) if (deep(S.from[0] + S.u[0] * k, S.from[1] + S.u[1] * k) > F.sides.deep) { t = k; break; }
    return Object.assign([S.from, [S.from[0] + S.u[0] * t, S.from[1] + S.u[1] * t]], { side });
  });
  return [...frontageFence(line, F).map((run) => Object.assign(run, { side: -1 })), ...ends];
}
function frontageFence(line, F) {
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
