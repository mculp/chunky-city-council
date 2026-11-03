// Other people on the roads: drivers on the real roads, keeping to their own side, and kids on four-wheelers on the lanes and drives.
// There's no three.js or page in here, so node tests load it too. It only ever happens around him, and data/folks.md has how.
//
// Nobody's driven by the physics in src/vehicles.js. They follow the line of the road, which is all they ever do, and are only vehicles
// like any other again once something's happened to them. Forward is (sin yaw, cos yaw), so to the driver's right is (-cos yaw, sin yaw).

export const TRAFFIC = {
  cars: 4, riders: 2,
  every: [4, 14],              // seconds before someone else comes along
  from: [150, 260], gone: 300, // metres from him they appear, and how far off they're forgotten about
  riderFrom: [70, 170], riderGone: 230,
  limits: { highway: 24, wide: 15, narrow: 11, unpaved: 8 },   // m/s, for a driver who isn't in any hurry
  corner: 7,                   // m/s, round a turn at a junction
  roomy: 4,                    // m/s² of braking they'd rather use
  gap: 3,                      // metres they stop short of something
  lookEvery: .2,
  patience: [1.5, 5],          // seconds before going round something, the worst temper first
  giveUp: 9,                   // seconds of nowhere to go round it before they turn back
  passing: 5,                  // m/s, going round
  onComing: 45,                // metres ahead that has to be clear of anyone coming the other way, to go round
  shift: 2.4,                  // m/s across the road
  noGo: 400,                   // metres from Stuckey's Bridge, which is as near as anyone comes
  stay: ['griffis_fountain_rd'],   // what's off the roads anyone drives on, since it's the old truss bridge he wakes on
  rider: [7, 12],              // m/s
  swerve: 16, swerveDriving: 30, // metres. How far off they start getting out of his way.
  swerveBy: 7,                 // metres off the line
  swerveFast: 8,               // m/s across
};

const hypot = Math.hypot, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function turn(from, to, k) { let d = (to - from) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return from + d * k; }

// world: { roads, nodes, lanes, along(id, s), sOn(id, x, z), half(road, x, z), blocked(x, z, y), floorAt(x, z), someoneAt(x, z, r), rand(), add(kind, x, z, yaw) -> vehicle, remove(v),
//          person(kind) -> who, out(car, why), mood(who) -> whether they'd run him down, roadNear(x, z) -> a road or nothing, laneAt(x, z, not) -> a lane or nothing, laneNear(x, z) -> a lane or nothing, touch(car) }
// p: { x, z, y, driving }
export function createTraffic(world, tuning = {}) {
  const T = { ...TRAFFIC, ...tuning }, cars = [], riders = [], nodeById = new Map(world.nodes.map((n) => [n.id, n]));
  const open = world.roads.filter((r) => r.length > 150 && !T.stay.includes(r.id));
  const joins = new Map(open.map((r) => [r.id, r.nodes.map((id) => nodeById.get(id)).filter((n) => n.roads.length > 1).map((n) => ({ s: world.sOn(r.id, n.x, n.z), node: n })).sort((a, b) => a.s - b.s)]));
  const roadOf = new Map(open.map((r) => [r.id, r]));
  let nextCar = 0, nextRider = 0;
  const t = { cars, riders, T, on: true };

  const noGo = (x, z) => hypot(x, z) < T.noGo;
  const limitOf = (r) => (r.surface !== 'asphalt' ? T.limits.unpaved : r.id === 'us_80' ? T.limits.highway : r.width >= 6.5 ? T.limits.wide : T.limits.narrow);
  const laneOff = (c, x, z) => { const half = world.half(c.road, x, z); return Math.max(0, half - c.v.K.width / 2 - .25) * .75 + Math.min(half / 2, c.v.K.width / 2) * .25; };

  function comeAlong(p) {
    for (let tries = 0; tries < 12; tries++) {
      // somewhere around him, and the nearest road to that. There's no use asking for somewhere on the road, since most of it's miles from him.
      const a = world.rand() * 6.2832, r = T.from[0] + world.rand() * (T.from[1] - T.from[0]), road = roadOf.get(world.roadNear(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r)?.id);
      if (!road) continue;
      const s = world.sOn(road.id, p.x + Math.cos(a) * r, p.z + Math.sin(a) * r), q = world.along(road.id, s), d = hypot(q.x - p.x, q.z - p.z);
      if (d < T.from[0] || d > T.from[1] || noGo(q.x, q.z) || s < 5 || s > road.length - 5) continue;
      // on their way towards where he is, so that someone comes by
      const dir = world.sOn(road.id, p.x, p.z) > s ? 1 : -1, who = world.person('car'), kind = who.temper > .5 ? 'pickup' : 'car';
      const v = world.add(kind, q.x, q.z, Math.atan2(q.tx * dir, q.tz * dir), who);
      const c = { v, who, road, s, dir, off: 0, want: 0, next: world.rand() * T.lookEvery, ahead: Infinity, what: null, stopped: 0, passUntil: null, stuck: 0, plan: undefined, slow: 0, pace: .85 + who.temper * .3 };
      c.off = c.want = laneOff(c, q.x, q.z);
      const fx = q.tx * dir, fz = q.tz * dir; v.x = q.x - fz * c.off; v.z = q.z + fx * c.off; v.ai = c;
      cars.push(c);
      return c;
    }
    return null;
  }

  // What's in the road ahead, on the line they'd take. It's the people and whatever's solid, which is anything else on the road too.
  function look(c, p) {
    const v = c.v, f = Math.abs(v.f), w = v.K.width / 2 + .6, reach = Math.max(14, 8 + f * f / (2 * T.roomy) + f);
    c.ahead = Infinity; c.what = null;
    for (let d = v.K.length / 2 + 1.2; d < reach; d += 3) {
      const q = world.along(c.road.id, c.s + c.dir * d), rx = -q.tz * c.dir, rz = q.tx * c.dir, x = q.x + rx * c.want, z = q.z + rz * c.want;
      if (hypot(p.x - x, p.z - z) < w + (p.driving ? 1.2 : .2) && !world.mood(c.who)) { c.ahead = d; c.what = 'him'; return; }
      if (world.someoneAt(x, z, w)) { c.ahead = d; c.what = 'someone'; return; }
      if (d < 24 && world.blocked(x, z, v.y + .6)) { c.ahead = d; c.what = 'thing'; return; }
    }
  }
  const clearAt = (c, off, far, p) => {
    for (let d = 3; d < far; d += 3) {
      const q = world.along(c.road.id, c.s + c.dir * d), x = q.x - q.tz * c.dir * off, z = q.z + q.tx * c.dir * off;
      if (hypot(p.x - x, p.z - z) < c.v.K.width / 2 + .8 || world.blocked(x, z, c.v.y + .6) || world.someoneAt(x, z, c.v.K.width / 2 + .4)) return false;
    }
    return true;
  };
  const onComing = (c) => cars.some((o) => o !== c && o.road === c.road && o.dir !== c.dir && (o.s - c.s) * c.dir > 0 && (o.s - c.s) * c.dir < T.onComing);

  // Which way at the next junction, if it's a turn. They choose when they get near it and stick to that.
  function planAt(c, at) {
    const others = at.node.roads.filter((id) => id !== c.road.id && roadOf.has(id));
    if (!others.length || world.rand() < .55) return null;
    const road = roadOf.get(others[Math.floor(world.rand() * others.length)]), s = world.sOn(road.id, at.node.x, at.node.z);
    const dirs = [1, -1].filter((d) => (d > 0 ? road.length - s : s) > 60);
    if (!dirs.length) return null;
    return { road, s, dir: dirs[Math.floor(world.rand() * dirs.length)] };
  }
  const nextJoin = (c) => {
    let best = null; for (const j of joins.get(c.road.id) ?? []) { const d = (j.s - c.s) * c.dir; if (d > 0 && (!best || d < best.d)) best = { d, j }; }
    return best;
  };
  function turnBack(c) { c.dir = -c.dir; c.want = Math.abs(c.want); c.passUntil = null; c.stopped = 0; c.stuck = 0; c.plan = undefined; c.slow = 2.5; }

  function drive(c, dt, p) {
    const v = c.v, K = v.K;
    if ((c.next -= dt) <= 0) { c.next = T.lookEvery; look(c, p); }
    else if (c.ahead < Infinity) c.ahead -= Math.abs(v.f) * dt;

    // going round something, or waiting to
    const q0 = world.along(c.road.id, c.s), lane = laneOff(c, q0.x, q0.z), still = Math.abs(v.f) < .6;
    if (c.passUntil !== null) {
      if ((c.s - c.passUntil) * c.dir > 0) { c.passUntil = null; c.want = lane; c.stopped = 0; }
    } else {
      c.want = lane;
      if (c.what && still) {
        c.stopped += dt;
        if (c.stopped > T.patience[1] - (T.patience[1] - T.patience[0]) * c.who.temper) {
          if (!onComing(c) && clearAt(c, -lane, c.ahead + K.length + 8, p)) { c.want = -lane; c.passUntil = c.s + c.dir * (c.ahead + K.length + 7); c.what = null; c.ahead = Infinity; c.stopped = 0; c.stuck = 0; }
          else if ((c.stuck += dt) > T.giveUp) turnBack(c);
        }
      } else if (!c.what) c.stopped = 0;
    }

    // how fast
    let limit = limitOf(c.road) * c.pace;
    if (c.passUntil !== null) limit = Math.min(limit, T.passing);
    if (c.slow > 0) { c.slow -= dt; limit = Math.min(limit, 3); }
    const join = nextJoin(c);
    if (join && join.d < 35 && c.plan === undefined) c.plan = planAt(c, join.j);
    if (c.plan && join) limit = Math.min(limit, Math.max(T.corner, Math.sqrt(T.corner * T.corner + 2 * T.roomy * Math.max(0, join.d - 3))));
    if (c.ahead < Infinity) limit = Math.min(limit, Math.sqrt(2 * T.roomy * Math.max(0, c.ahead - K.length / 2 - T.gap)));
    const a = v.f < limit ? K.accel * .45 : K.brake * .6;
    v.f += clamp(limit - v.f, -a * dt, a * dt);

    // along the road
    const was = c.s; c.s += c.dir * v.f * dt;
    if (join && (join.j.s - c.s) * c.dir <= 0) {
      if (c.plan) { const n = c.plan; c.road = n.road; c.s = n.s; c.dir = n.dir; c.passUntil = null; }
      c.plan = undefined;
    }
    const q = world.along(c.road.id, c.s);
    if (c.s <= 0 || c.s >= c.road.length || noGo(q.x, q.z)) { c.s = was; turnBack(c); }
    const fx = q.tx * c.dir, fz = q.tz * c.dir;
    c.off += clamp(c.want - c.off, -T.shift * dt, T.shift * dt);
    // they follow the line a little behind it, which is what rounds off a junction
    const k = 1 - Math.exp(-dt * 7), nx = v.x + (q.x - fz * c.off - v.x) * k, nz = v.z + (q.z + fx * c.off - v.z) * k, moved = hypot(nx - v.x, nz - v.z);
    if (moved > 1e-3) {
      const yaw = turn(v.yaw, Math.atan2(nx - v.x, nz - v.z), Math.min(1, dt * 6));
      v.steer = clamp(((yaw - v.yaw) / dt) * K.wheelbase / Math.max(v.f, 2), -K.lock, K.lock);
      v.yaw = yaw;
    }
    v.x = nx; v.z = nz; v.spin = (v.spin + v.f * dt / K.wheel) % 6.2832;
    world.touch?.(c);
  }

  function setOff(p) {
    for (let tries = 0; tries < 6; tries++) {
      const a = world.rand() * 6.2832, r = T.riderFrom[0] + world.rand() * (T.riderFrom[1] - T.riderFrom[0]), road = world.laneNear(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r);
      if (!road || road.length < 40) continue;
      const s = world.rand() * road.length, q = world.along(road.id, s), d = hypot(q.x - p.x, q.z - p.z);
      if (d < T.riderFrom[0] || noGo(q.x, q.z)) continue;
      const who = world.person('rider'), dir = world.rand() < .5 ? 1 : -1, v = world.add('quad', q.x, q.z, Math.atan2(q.tx * dir, q.tz * dir), who);
      const c = { v, who, road, s, dir, off: 0, want: 0, next: 0, speed: T.rider[0] + who.nerve * (T.rider[1] - T.rider[0]) };
      v.ai = c; v.kid = true;
      riders.push(c);
      return c;
    }
    return null;
  }
  // Round the lanes and drives, as fast as they like, and out of his way before he's close. Nothing can touch them.
  function ride(c, dt, p) {
    const v = c.v, K = v.K;
    if ((c.next -= dt) <= 0) {
      c.next = T.lookEvery;
      const q = world.along(c.road.id, c.s), fx = q.tx * c.dir, fz = q.tz * c.dir, rx = -fz, rz = fx, dx = p.x - v.x, dz = p.z - v.z, d = hypot(dx, dz), ahead = dx * fx + dz * fz, across = dx * rx + dz * rz, reach = p.driving ? T.swerveDriving : T.swerve;
      c.turned = Math.max(0, (c.turned ?? 0) - T.lookEvery);
      c.want = 0;
      if (d < reach && ahead > -4) {
        // away from whichever side he's on, or the other way if there's something there
        const side = across >= 0 ? -1 : 1, can = (o) => !world.blocked(q.x + rx * o, q.z + rz * o, v.y + .6);
        c.want = can(side * T.swerveBy) ? side * T.swerveBy : can(-side * T.swerveBy) ? -side * T.swerveBy : 0;
        // and if there's no getting past him, back the way they came, and once they've turned that's that
        if (!c.want && ahead > 2 && !c.turned) { c.dir = -c.dir; c.turned = 2; v.f = Math.min(v.f, 5); }
      }
    }
    const top = c.speed * (Math.abs(c.want) > 0 ? .8 : 1);
    v.f += clamp(top - v.f, -K.brake * dt, K.accel * dt);
    c.s += c.dir * v.f * dt;
    if (c.s <= 0 || c.s >= c.road.length) {
      const end = world.along(c.road.id, c.s), next = world.laneAt(end.x, end.z, c.road);
      if (next) { const s = world.sOn(next.id, end.x, end.z); c.road = next; c.s = s; c.dir = s < next.length / 2 ? 1 : -1; }
      else { c.s = clamp(c.s, 0, c.road.length); c.dir = -c.dir; v.f = Math.min(v.f, 4); }
    }
    const q = world.along(c.road.id, c.s), fx = q.tx * c.dir, fz = q.tz * c.dir;
    c.off += clamp(c.want - c.off, -T.swerveFast * dt, T.swerveFast * dt);
    const k = 1 - Math.exp(-dt * 7), nx = v.x + (q.x - fz * c.off - v.x) * k, nz = v.z + (q.z + fx * c.off - v.z) * k;
    if (hypot(nx - v.x, nz - v.z) > 1e-3) { const yaw = turn(v.yaw, Math.atan2(nx - v.x, nz - v.z), Math.min(1, dt * 7)); v.steer = clamp(((yaw - v.yaw) / dt) * K.wheelbase / Math.max(v.f, 2), -K.lock, K.lock); v.yaw = yaw; }
    v.x = nx; v.z = nz; v.spin = (v.spin + v.f * dt / K.wheel) % 6.2832;
  }

  // Someone along soon, and nobody for now
  t.soon = () => { nextCar = nextRider = 0; };
  t.clear = () => { for (const c of [...cars, ...riders]) world.remove(c.v); cars.length = riders.length = 0; };
  // The driver's out of it: the car's only a car now, wherever it's got to, and someone's got to do something about the driver
  t.letGo = (c, why) => {
    const i = cars.indexOf(c); if (i < 0) return;
    cars.splice(i, 1); c.v.ai = null; world.out(c, why);
    nextCar = Math.max(nextCar, T.every[0]);
  };

  t.update = (dt, p) => {
    if (!t.on) return;
    if (cars.length < T.cars && (nextCar -= dt) <= 0) { comeAlong(p); nextCar = T.every[0] + world.rand() * (T.every[1] - T.every[0]); }
    if (riders.length < T.riders && (nextRider -= dt) <= 0) { setOff(p); nextRider = T.every[0] + world.rand() * (T.every[1] - T.every[0]); }
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i], v = c.v;
      if (v.loose || v.wrecked || v.drowned || v.hp < v.K.hp) { t.letGo(c, 'hit'); continue; }
      drive(c, dt, p);
      if (hypot(v.x - p.x, v.z - p.z) > T.gone) { cars.splice(i, 1); world.remove(v); }
    }
    for (let i = riders.length - 1; i >= 0; i--) {
      const c = riders[i]; ride(c, dt, p);
      if (hypot(c.v.x - p.x, c.v.z - p.z) > T.riderGone) { riders.splice(i, 1); world.remove(c.v); }
    }
  };
  return t;
}
