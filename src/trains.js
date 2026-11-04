// The railroad's trains. There's no three.js or page in here, so node tests load it too, and data/railroad.md says how it all works.
//
// There's one at a time, and it comes by near wherever he is, every five minutes or so, which on foot is as good as a timetable. Two on one track would have to meet somewhere.
// Along the line is s, in metres from its first point. A train's head is where its nose is and dir is which way it's going along the line.
// Forward is (sin yaw, cos yaw) like everything else, so a car's fx and fz are that, and across it is (fz, -fx).

export const TRAINS = {
  first: 75,                 // seconds after he gets to town before the first one comes
  every: [270, 310],         // and from one to the next
  speed: 22,                 // m/s, which is about 50 mph
  from: 1500, past: 1100,    // metres along the line from him it starts, and how far its tail gets past him
  hear: 3200,                // further than this from the line and nobody'd know, so there's no train
  outrun: 2400,              // and if he's got this far ahead of one it's as good as gone
  horn: 420,                 // metres short of a crossing or a trestle it comes to the horn
  hornNear: 300,             // and the page only blows it for a road crossing this near him
  shutFor: 13,               // seconds before it gets there that a crossing shuts
  clear: 14,                 // metres its tail has to be past a crossing before it opens
  sees: 260, onIt: 2.2,      // how far ahead it blows for someone on the tracks, and how near the middle counts as on them
  blastEvery: 15,            // seconds from one blast at him to the next
  locos: [1, 2], cars: [14, 24],
  couple: .9,                // metres between cars
};

// len is over the couplers, half is half the width, top is above the rail, and truck is how far in from each end the wheels turn
export const CARS = {
  loco: { len: 20.5, half: 1.58, top: 4.6, truck: 3.6 },
  box: { len: 16, half: 1.6, top: 4.5, truck: 2.4 },
  hopper: { len: 14, half: 1.6, top: 4.3, truck: 2.2 },
  tank: { len: 15.5, half: 1.5, top: 4.3, truck: 2.2 },
};
const KINDS = ['box', 'hopper', 'tank'];

const hypot = Math.hypot;

// points are [x, z]. Past either end the line carries straight on, which only ever happens out of his sight.
export function makeLine(points) {
  const pts = [points[0]], S = [0];
  for (let i = 1; i < points.length; i++) {
    const l = hypot(points[i][0] - pts[pts.length - 1][0], points[i][1] - pts[pts.length - 1][1]);
    if (l > .01) { S.push(S[S.length - 1] + l); pts.push(points[i]); }
  }
  return {
    pts, S, length: S[S.length - 1],
    at(s, out = {}) {
      let lo = 0, hi = S.length - 2;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S[m] <= s) lo = m; else hi = m - 1; }
      const a = pts[lo], b = pts[lo + 1], l = S[lo + 1] - S[lo], t = (s - S[lo]) / l;
      out.x = a[0] + (b[0] - a[0]) * t; out.z = a[1] + (b[1] - a[1]) * t; out.tx = (b[0] - a[0]) / l; out.tz = (b[1] - a[1]) / l;
      return out;
    },
    nearest(x, z) {
      let best = Infinity, s = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)), d = hypot(x - a[0] - dx * t, z - a[1] - dz * t);
        if (d < best) { best = d; s = S[i] + t * (S[i + 1] - S[i]); }
      }
      return { s, d: best };
    },
  };
}

// crossings are [{ x, z, ... }], with their shut kept up to date, and posts are where else it sounds the horn, the same way. Only what's on the line counts.
// world: { rand(), start(train), gone(train), horn(place, train), blast(train), gate(crossing) }, all of it but rand optional
// p: { x, z }
export function createTrains(line, { crossings = [], posts = [], world, tuning = {} }) {
  const T = { ...TRAINS, ...tuning }, on = (list) => list.map((c) => ({ c, n: line.nearest(c.x, c.z) })).filter(({ n }) => n.d < 6).map(({ c, n }) => { c.s = n.s; return c; });
  const gates = on(crossings), blowFor = [...gates, ...on(posts)];
  for (const g of gates) g.shut = false;
  const t = { T, line, gates, train: null, wait: T.first, runs: 0 }, A = {}, B = {};
  let clock = 0;

  const between = ([a, b]) => a + world.rand() * (b - a);
  function make() {
    const list = [], locos = Math.round(between(T.locos)), cars = Math.round(between(T.cars));
    // a lot of the same thing goes by in a run, as it does
    let kind = KINDS[Math.floor(world.rand() * KINDS.length)], off = 0;
    for (let i = 0; i < locos + cars; i++) {
      if (i >= locos && world.rand() < .3) kind = KINDS[Math.floor(world.rand() * KINDS.length)];
      const K = CARS[i < locos ? 'loco' : kind];
      list.push({ kind: i < locos ? 'loco' : kind, len: K.len, half: K.half, top: K.top, truck: K.truck, off: off + K.len / 2, seed: world.rand(), x: 0, z: 0, yaw: 0, fx: 0, fz: 1 });
      off += K.len + T.couple;
    }
    return { cars: list, length: off - T.couple };
  }
  // Where every car's got to, from where its two sets of wheels are on the line
  function place(tr) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const c of tr.cars) {
      const mid = tr.head - tr.dir * c.off, b = c.len / 2 - c.truck;
      line.at(mid + tr.dir * b, A); line.at(mid - tr.dir * b, B);
      const dx = A.x - B.x, dz = A.z - B.z, l = hypot(dx, dz) || 1;
      c.x = (A.x + B.x) / 2; c.z = (A.z + B.z) / 2; c.fx = dx / l; c.fz = dz / l; c.yaw = Math.atan2(c.fx, c.fz);
      if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x; if (c.z < z0) z0 = c.z; if (c.z > z1) z1 = c.z;
    }
    tr.x0 = x0 - 14; tr.x1 = x1 + 14; tr.z0 = z0 - 14; tr.z1 = z1 + 14;
  }

  // One going that way with its nose at head. Anywhere's fine: the next update takes it from there.
  t.send = (dir, head, speed = T.speed) => {
    const tr = { dir, head, speed, ...make(), blown: new Set(), blastAt: 0, gap: Infinity, ahead: Infinity, closing: 0 };
    place(tr);
    t.train = tr;
    world.start?.(tr);
    return tr;
  };
  function start(p) {
    const q = line.nearest(p.x, p.z);
    if (q.d > T.hear) return null;
    const dir = t.runs++ % 2 ? -1 : 1;
    return t.send(dir, q.s - dir * T.from);
  }
  function done() {
    const tr = t.train;
    t.train = null;
    for (const g of gates) if (g.shut) { g.shut = false; world.gate?.(g); }
    world.gone?.(tr);
  }
  t.clear = () => { if (t.train) done(); };
  t.soon = (seconds = 0) => { t.wait = seconds; };

  t.update = (dt, p) => {
    clock += dt;
    if ((t.wait -= dt) <= 0) { t.wait = between(T.every); if (!t.train) start(p); }
    const tr = t.train;
    if (!tr) return;
    tr.head += tr.dir * tr.speed * dt;
    place(tr);
    for (const g of blowFor) {
      const ahead = (g.s - tr.head) * tr.dir;
      if (ahead > 0 && ahead <= T.horn && !tr.blown.has(g)) { tr.blown.add(g); world.horn?.(g, tr); }
      if (g.shut !== undefined) {
        const shut = ahead < T.shutFor * tr.speed && ahead > -(tr.length + T.clear);
        if (shut !== g.shut) { g.shut = shut; world.gate?.(g); }
      }
    }
    // How near it is to him, and how fast that's changing, which is what the sound's made of
    const q = line.nearest(p.x, p.z), toHead = (q.s - tr.head) * tr.dir, toTail = (q.s - tr.head + tr.dir * tr.length) * tr.dir;
    line.at(toHead > 0 ? tr.head : toTail < 0 ? tr.head - tr.dir * tr.length : q.s, A);
    tr.gap = hypot(A.x - p.x, A.z - p.z); tr.ahead = toHead;
    tr.closing = toHead > 0 ? tr.speed * toHead / (hypot(toHead, q.d) || 1) : toTail < 0 ? tr.speed * toTail / (hypot(toTail, q.d) || 1) : 0;
    if (q.d < T.onIt && toHead > 0 && toHead < T.sees && clock > tr.blastAt) { tr.blastAt = clock + T.blastEvery; world.blast?.(tr); }
    if (toTail < -T.past || toHead > T.outrun) done();
  };

  // The car that's at a spot, with pad round it, or nothing. y isn't its business: someone under a trestle has to ask for themselves.
  t.at = (x, z, pad = 0) => {
    const tr = t.train;
    if (!tr || x < tr.x0 || x > tr.x1 || z < tr.z0 || z > tr.z1) return null;
    for (const c of tr.cars) {
      const dx = x - c.x, dz = z - c.z, reach = c.len / 2 + c.half + pad;
      if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
      if (Math.abs(dx * c.fx + dz * c.fz) < c.len / 2 + pad && Math.abs(dx * c.fz - dz * c.fx) < c.half + pad) return c;
    }
    return null;
  };
  // Which side of a car a spot's on, across it: + is (fz, -fx)
  t.side = (c, x, z) => ((x - c.x) * c.fz - (z - c.z) * c.fx >= 0 ? 1 : -1);
  // Whether a crossing's shut at a spot
  t.shutAt = (x, z, r = 7) => {
    if (!t.train) return false;
    for (const g of gates) if (g.shut && hypot(x - g.x, z - g.z) < r) return true;
    return false;
  };
  return t;
}
