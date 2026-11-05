// The railroad's trains. There's no three.js or page in here, so node tests load it too, and data/railroad.md says how it all works.
//
// In the story there's one at a time, and it comes by near wherever he is, every five minutes or so, which on foot is as good as a timetable.
// Online there's a real timetable instead (makeTimetable), so it's the same train for everybody: two at once, passing on the siding in town.
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

// Online (CHUNKY-153). Two run at once, one each way, worked out from the town's clock and nothing else. The one going up the line is a local, a
// locomotive and as many cars as stand clear of both the siding's switches, and it stands there with its engine running while the through
// freight comes out of the long single track east of town. The freight never waits. Standing half the time, the local brings one through town
// evenly: it rolls in, and every / 2 seconds later the freight goes by with the local pulling out behind it.
export const TIMETABLE = {
  epoch: 1793836800,         // 2026-11-05 00:00 UTC, when the first local stood on the siding
  every: 1170,               // seconds from one pair to the next: the soonest the single track east of town takes one each way, and a little over
  stand: 585,                // how long the local stands on the siding, which is half of that
  crawl: 6,                  // m/s it takes the siding's switches at
  rate: .3,                  // m/s² it slows down and gathers speed at
  beyond: 400,               // metres past either end of the line they come from and go to, out past where anyone walks
};

const hypot = Math.hypot;
const between = ([a, b], rand) => a + rand() * (b - a);
// The same numbers on every phone for run n
const seeded = (n) => { let s = Math.abs(n * 7919 + 1) % 2147483646 + 1; for (let i = 0; i < 3; i++) s = (s * 16807) % 2147483647; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
// What's in a train: locos and cars, each a [least, most] to pick from, and no longer than most metres, which drops the cars that don't fit
function build(rand, T, locos, cars, most = Infinity) {
  const list = [], nl = Math.round(between(locos, rand)), nc = Math.round(between(cars, rand));
  // a lot of the same thing goes by in a run, as it does
  let kind = KINDS[Math.floor(rand() * KINDS.length)], off = 0;
  for (let i = 0; i < nl + nc; i++) {
    if (i >= nl && rand() < .3) kind = KINDS[Math.floor(rand() * KINDS.length)];
    const K = CARS[i < nl ? 'loco' : kind];
    if (off + K.len > most) break;
    list.push({ kind: i < nl ? 'loco' : kind, len: K.len, half: K.half, top: K.top, truck: K.truck, off: off + K.len / 2, seed: rand(), x: 0, z: 0, yaw: 0, fx: 0, fz: 1 });
    off += K.len + T.couple;
  }
  return { cars: list, length: off - T.couple };
}

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

// The siding: its switches where the points west and east are on the line, at s0 and s1, and its track gap metres to the left going up the line
// at its fullest, easing over in ease metres from each switch. off(s) is how far over from the line it is at s, and clear(x, z, r) whether
// (x, z) is r or more from its own track, which everywhere short of one switch or past the other is.
export function makeSiding(line, { west, east, gap, ease }) {
  const s0 = line.nearest(west[0], west[1]).s, s1 = line.nearest(east[0], east[1]).s, k = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  const off = (s) => gap * Math.min(k((s - s0) / ease), k((s1 - s) / ease)), A = {}, box = [Infinity, -Infinity, Infinity, -Infinity];
  for (let s = s0; s <= s1 + 1; s += 2) {
    const o = off(Math.min(s, s1)); line.at(Math.min(s, s1), A);
    const x = A.x + A.tz * o, z = A.z - A.tx * o;
    box[0] = Math.min(box[0], x); box[1] = Math.max(box[1], x); box[2] = Math.min(box[2], z); box[3] = Math.max(box[3], z);
  }
  return {
    s0, s1, gap, ease, off,
    clear(x, z, r) {
      if (x < box[0] - r || x > box[1] + r || z < box[2] - r || z > box[3] + r) return true;
      const { s } = line.nearest(x, z);
      if (s < s0 || s > s1) return true;
      line.at(s, A);
      return Math.abs((x - A.x) * A.tz - (z - A.z) * A.tx - off(s)) >= r;
    },
  };
}

// The timetable on its own, for the town as well as the page. Run n is in cycle floor(n / 2), which starts when its local comes to a stand:
// the even runs are the locals going up the line, and the odd ones the freights coming down it. It's TRAINS as they are, whatever a phone's
// tuned to draw, so a slow phone's trains are everyone's.
export function makeTimetable(line, siding, tuning = {}) {
  const T = TRAINS, TT = { ...TIMETABLE, ...tuning }, V = T.speed, c = TT.crawl, a = TT.rate, L = line.length, B = TT.beyond;
  // the local's nose stands short of the east switch, and it's crawling by the west one
  const stop = siding.s1 - siding.ease - 2, d2 = c * c / (2 * a), t2 = c / a, d1 = (V * V - c * c) / (2 * a), t1 = (V - c) / a;
  const tc = (stop - d2 - siding.s0) / c, tIn = (siding.s0 - d1 + B) / V + t1 + tc + t2, tUp = V / a, dUp = V * V / (2 * a);
  const shapes = new Map();
  // a locomotive and as many cars as stand clear of both switches for a local, and the same as the story's for a freight
  function consist(n) {
    let shape = shapes.get(n);
    if (!shape) {
      shape = n % 2 ? build(seeded(n), T, T.locos, T.cars) : build(seeded(n), T, [1, 1], [8, 8], stop - siding.s0 - siding.ease);
      shapes.set(n, shape);
      if (shapes.size > 12) shapes.delete(shapes.keys().next().value);
    }
    return shape;
  }
  // Where run n's nose is at time now, into out as { head, speed }, or null when it isn't out
  function where(n, now, out = {}) {
    const rel = now - (TT.epoch + Math.floor(n / 2) * TT.every), len = consist(n).length;
    // a freight comes down at full speed, timed so its tail's past the east switch just before the local goes
    if (n % 2) {
      out.head = siding.s1 - siding.ease - V * (rel - TT.stand + len / V + 2); out.speed = V;
      return out.head <= L + B && out.head + len >= -B ? out : null;
    }
    // a local slows to a crawl by the west switch, comes to a stand, waits, and gathers speed again
    if (rel < -tIn) return null;
    if (rel < 0) {
      const r = -rel;
      if (r <= t2) { out.head = stop - a * r * r / 2; out.speed = a * r; }
      else if (r <= t2 + tc) { out.head = stop - d2 - c * (r - t2); out.speed = c; }
      else if (r <= t2 + tc + t1) { const q = r - t2 - tc; out.head = siding.s0 - c * q - a * q * q / 2; out.speed = c + a * q; }
      else { out.head = siding.s0 - d1 - V * (r - t2 - tc - t1); out.speed = V; }
    } else if (rel <= TT.stand) { out.head = stop; out.speed = 0; }
    else {
      const q = rel - TT.stand;
      if (q <= tUp) { out.head = stop + a * q * q / 2; out.speed = a * q; } else { out.head = stop + dUp + V * (q - tUp); out.speed = V; }
    }
    return out.head - len <= L + B ? out : null;
  }
  // every run that could be out at now
  const runs = (now) => { const k = Math.floor((now - TT.epoch) / TT.every), list = []; for (let j = k - 1; j <= k + 1; j++) list.push(2 * j, 2 * j + 1); return list; };
  return { TT, siding, stop, consist, where, runs };
}

// crossings are [{ x, z, ... }], with their shut kept up to date, and posts are where else it sounds the horn, the same way. Only what's on the line counts.
// world: { rand(), start(train), gone(train), horn(place, train), blast(train), gate(crossing) }, all of it but rand optional, and online rand isn't asked
// p: { x, z }. With timetable: { siding, ...TIMETABLE's numbers } it's online, and update's now, the town's clock in seconds, says where they are.
export function createTrains(line, { crossings = [], posts = [], world, tuning = {}, timetable = null }) {
  const T = { ...TRAINS, ...tuning }, on = (list) => list.map((c) => ({ c, n: line.nearest(c.x, c.z) })).filter(({ n }) => n.d < 6).map(({ c, n }) => { c.s = n.s; return c; });
  const gates = on(crossings), blowFor = [...gates, ...on(posts)];
  for (const g of gates) g.shut = false;
  const plan = timetable && makeTimetable(line, timetable.siding, timetable);
  const t = { T, line, gates, plan, train: null, trains: [], wait: T.first, runs: 0 }, A = {}, B = {};
  let clock = 0;

  const make = () => build(world.rand, T, T.locos, T.cars);
  // A car's wheels at s along the line, or over on the siding for a train that's on it
  const wheels = (tr, s, out) => { line.at(s, out); const o = tr.siding?.off(s); if (o) { out.x += out.tz * o; out.z -= out.tx * o; } return out; };
  // Where every car's got to, from where its two sets of wheels are on the line
  function place(tr) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const c of tr.cars) {
      const mid = tr.head - tr.dir * c.off, b = c.len / 2 - c.truck;
      wheels(tr, mid + tr.dir * b, A); wheels(tr, mid - tr.dir * b, B);
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
    t.train = tr; t.trains = [tr];
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
    t.train = null; t.trains = [];
    for (const g of gates) if (g.shut) { g.shut = false; world.gate?.(g); }
    world.gone?.(tr);
  }
  t.clear = () => { if (t.train && !plan) done(); };
  t.soon = (seconds = 0) => { t.wait = seconds; };

  // How near it is to him, and how fast that's changing, which is what the sound's made of, and whether it blows for him on the tracks ahead.
  // It's all from the track it's on, which for one on the siding is the siding's wherever he's beside it.
  function near(tr, p, q, when) {
    const toHead = (q.s - tr.head) * tr.dir, toTail = (q.s - tr.head + tr.dir * tr.length) * tr.dir;
    wheels(tr, toHead > 0 ? tr.head : toTail < 0 ? tr.head - tr.dir * tr.length : q.s, A);
    tr.gap = hypot(A.x - p.x, A.z - p.z); tr.ahead = toHead;
    wheels(tr, q.s, B); const d = hypot(B.x - p.x, B.z - p.z);
    tr.closing = toHead > 0 ? tr.speed * toHead / (hypot(toHead, d) || 1) : toTail < 0 ? tr.speed * toTail / (hypot(toTail, d) || 1) : 0;
    if (tr.speed > 1 && d < T.onIt && toHead > 0 && toHead < T.sees && when > tr.blastAt) { tr.blastAt = when + T.blastEvery; world.blast?.(tr); }
    return toTail;
  }

  t.update = (dt, p, now) => {
    clock += dt;
    if (plan) return follow(p, now);
    if ((t.wait -= dt) <= 0) { t.wait = between(T.every, world.rand); if (!t.train) start(p); }
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
    const q = line.nearest(p.x, p.z), toTail = near(tr, p, q, clock);
    if (toTail < -T.past || tr.ahead > T.outrun) done();
  };

  // Online: whichever runs the timetable has out at now, each with its own horn, blasts and gap, and the crossings for all of them. A crossing
  // goes by where the timetable will have a train in shutFor seconds, the way a real one does, so it lifts for the local standing short of it.
  const running = new Map(), W = {}, Wby = {};
  const by = (tr, s, then) => { const w = plan.where(tr.run, then, Wby); return !w || (s - w.head) * tr.dir <= 0; };
  function follow(p, now) {
    const seen = new Set();
    for (const n of plan.runs(now)) {
      if (!plan.where(n, now, W)) continue;
      seen.add(n);
      let tr = running.get(n);
      if (!tr) {
        const { cars, length } = plan.consist(n);
        tr = { run: n, dir: n % 2 ? -1 : 1, local: n % 2 === 0, siding: n % 2 ? null : plan.siding, cars: cars.map((c) => ({ ...c })), length, head: W.head, speed: W.speed, blown: new Set(), blastAt: 0, gap: Infinity, ahead: Infinity, closing: 0 };
        // one that's out already when the page starts has blown for whatever it's come up to
        for (const g of blowFor) if ((g.s - tr.head) * tr.dir > 0 && by(tr, g.s, now + T.horn / T.speed)) tr.blown.add(g);
        running.set(n, tr);
        world.start?.(tr);
      }
      tr.head = W.head; tr.speed = W.speed; tr.standing = W.speed === 0;
      place(tr);
    }
    for (const [n, tr] of running) if (!seen.has(n)) { running.delete(n); world.gone?.(tr); }
    t.trains = [...running.values()];
    for (const g of gates) {
      const shut = t.trains.some((tr) => (g.s - tr.head) * tr.dir > -(tr.length + T.clear) && by(tr, g.s, now + T.shutFor));
      if (shut !== g.shut) { g.shut = shut; world.gate?.(g); }
    }
    const q = line.nearest(p.x, p.z);
    t.train = null;
    for (const tr of t.trains) {
      for (const g of blowFor) if (!tr.blown.has(g) && (g.s - tr.head) * tr.dir > 0 && by(tr, g.s, now + T.horn / T.speed)) { tr.blown.add(g); world.horn?.(g, tr); }
      near(tr, p, q, now);
      if (!t.train || tr.gap < t.train.gap) t.train = tr;
    }
  }

  // The car that's at a spot, with pad round it, or nothing. y isn't its business: someone under a trestle has to ask for themselves.
  t.at = (x, z, pad = 0) => {
    for (const tr of t.trains) {
      if (x < tr.x0 || x > tr.x1 || z < tr.z0 || z > tr.z1) continue;
      for (const c of tr.cars) {
        const dx = x - c.x, dz = z - c.z, reach = c.len / 2 + c.half + pad;
        if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
        if (Math.abs(dx * c.fx + dz * c.fz) < c.len / 2 + pad && Math.abs(dx * c.fz - dz * c.fx) < c.half + pad) return c;
      }
    }
    return null;
  };
  // Which train a car's in
  t.of = (c) => t.trains.find((tr) => tr.cars.includes(c)) ?? null;
  // Which side of a car a spot's on, across it: + is (fz, -fx)
  t.side = (c, x, z) => ((x - c.x) * c.fz - (z - c.z) * c.fx >= 0 ? 1 : -1);
  // Whether a crossing's shut at a spot
  t.shutAt = (x, z, r = 7) => {
    if (!t.trains.length) return false;
    for (const g of gates) if (g.shut && hypot(x - g.x, z - g.z) < r) return true;
    return false;
  };
  return t;
}
