// How vehicles drive and where they're parked. There's no three.js or page in here, so node tests load it too. How they look is in src/vehiclemodels.js.
//
// Forward is (sin yaw, cos yaw), the same as him on foot, so to the driver's right is (-cos yaw, sin yaw). Everything's in metres, seconds and kilograms.

export const KINDS = {
  //       what it's called,   m/s flat out, in reverse, how hard it pulls and stops, how fast sideways slip dies, how hard it can corner, most steering lock, axle to axle, weight, what it takes,
  //       what fraction of its speed and grip it keeps off the road, and how far the crowd hears it. seat and camera are how it sits in the world.
  car: { name: 'car', top: 30, reverse: 9, accel: 8, brake: 17, grip: 5.5, corner: 15, lock: .56, wheelbase: 3, mass: 1300, hp: 100, rough: .5, noise: 60, length: 5, width: 2.3, track: 1.03, axles: [1.55, -1.45], wheel: .42, tread: .26, seat: [.48, 1.26, .08], hands: [.1, -.12, .46], feet: [.14, -1.06, .42], size: .8, camDist: 8.6, camLook: 1.6 },
  pickup: { name: 'pickup', top: 25, reverse: 8, accel: 6.8, brake: 14, grip: 4, corner: 11, lock: .5, wheelbase: 3.5, mass: 1900, hp: 150, rough: .78, noise: 75, length: 5.7, width: 2.4, track: 1.08, axles: [1.85, -1.65], wheel: .52, tread: .3, seat: [.5, 1.5, .36], hands: [.1, -.14, .46], feet: [.14, -1.06, .42], size: .8, camDist: 9.4, camLook: 1.9 },
  quad: { name: 'four-wheeler', top: 18, reverse: 5, accel: 9.5, brake: 12, grip: 3.4, corner: 13, lock: .72, wheelbase: 1.6, mass: 350, hp: 50, rough: .94, noise: 45, length: 2.6, width: 1.6, track: .64, axles: [.82, -.78], wheel: .42, tread: .36, seat: [0, 1.72, -.1], hands: [.42, -.42, .44], feet: [.28, -1.24, .1], size: .9, camDist: 6.6, camLook: 1.9 },
  coupe: { name: 'coupe', sound: 'car', top: 34, reverse: 9, accel: 9.5, brake: 17, grip: 5.2, corner: 15, lock: .54, wheelbase: 2.85, mass: 1500, hp: 90, rough: .42, noise: 65, length: 4.9, width: 2.1, track: 1, axles: [1.45, -1.4], wheel: .4, tread: .28, seat: [.42, .98, -.42], hands: [.1, -.12, .46], feet: [.14, -.84, .42], size: .8, camDist: 8.4, camLook: 1.4 },
  golf: { name: 'golf cart', top: 9, reverse: 4, accel: 3.8, brake: 8, grip: 6.5, corner: 7, lock: .66, wheelbase: 2.1, mass: 450, hp: 40, rough: .6, noise: 8, length: 3.2, width: 1.7, track: .74, axles: [1.05, -1.05], wheel: .3, tread: .2, seat: [.34, 1.54, -.1], hands: [.1, -.3, .46], feet: [.14, -1.12, .42], size: .8, camDist: 6.4, camLook: 1.6 },
  van: { name: 'church van', sound: 'pickup', top: 24, reverse: 7, accel: 5.6, brake: 13, grip: 4.2, corner: 10, lock: .5, wheelbase: 3.7, mass: 2400, hp: 170, rough: .55, noise: 70, length: 5.9, width: 2.3, track: 1.02, axles: [1.95, -1.75], wheel: .44, tread: .27, seat: [.5, 1.34, 1.15], hands: [.1, -.14, .46], feet: [.14, -1.06, .42], size: .8, camDist: 10.2, camLook: 2.3 },
};

export const GRAVITY = 15;
// What one swing of a hammer's worth of damage takes out of something moving, in joules. A car at 15 m/s has about five of them.
export const SMASH_J = 30000;

// Points round each one's edge, close enough together that a post can't get between them: [along, across], from the middle
for (const K of Object.values(KINDS)) {
  const a = K.length / 2 - .05, c = K.width / 2 - .05, na = Math.ceil(a * 2 / 1.1), nc = Math.ceil(c * 2 / 1.1);
  K.rim = [];
  for (let i = 0; i <= na; i++) { const along = -a + a * 2 * i / na; K.rim.push([along, c], [along, -c]); }
  for (let i = 1; i < nc; i++) { const across = -c + c * 2 * i / nc; K.rim.push([a, across], [-a, across]); }
  // and inside it, for telling that something's got in there
  K.inner = [];
  for (let i = 1; i < na; i++) for (const k of [-.5, 0, .5]) K.inner.push([-a + a * 2 * i / na, c * k]);
  K.whole = [...K.rim, ...K.inner];
}

export function makeVehicle(kind, x, z, yaw, y = 0) {
  const K = KINDS[kind];
  return { kind, K, x, y, z, yaw, f: 0, s: 0, vy: 0, steer: 0, spin: 0, hp: K.hp, wrecked: false, drowned: false, grounded: true, pitch: 0, roll: 0, getOut: 0, freed: 0, heldF: 0, heldB: 0 };
}
export const speedOf = (v) => Math.hypot(v.f, v.s);
const forward = (yaw) => [Math.sin(yaw), Math.cos(yaw)];
const rightOf = (yaw) => [-Math.cos(yaw), Math.sin(yaw)];

// In a vehicle's own frame: how far along it (+ is the nose) and across it (+ is the driver's right)
export function toLocal(v, x, z) {
  const dx = x - v.x, dz = z - v.z, [fx, fz] = forward(v.yaw), [rx, rz] = rightOf(v.yaw);
  return [dx * fx + dz * fz, dx * rx + dz * rz];
}
export const inVehicle = (v, x, z, margin = 0) => { const [a, c] = toLocal(v, x, z); return Math.abs(a) < v.K.length / 2 + margin && Math.abs(c) < v.K.width / 2 + margin; };

// The first point around its edge that's blocked, if it were at x, z
export function rimHit(v, x, z, y, blocked) {
  const [fx, fz] = forward(v.yaw), [rx, rz] = rightOf(v.yaw);
  for (const [along, across] of v.K.rim) { const cx = x + fx * along + rx * across, cz = z + fz * along + rz * across; if (blocked(cx, cz, y)) return [cx, cz]; }
  return null;
}

// What a hit does to it. Heavier takes it better, and anything under a jog's a bump.
export const damageFrom = (K, impact) => Math.max(0, impact - 5) * 3.2 * Math.sqrt(1500 / K.mass);

// Tilt it to the ground under its wheels
export function settle(v, floorAt) {
  const K = v.K, [fx, fz] = forward(v.yaw), [rx, rz] = rightOf(v.yaw), a = K.wheelbase / 2, c = K.track;
  const f = floorAt(v.x + fx * a, v.z + fz * a), b = floorAt(v.x - fx * a, v.z - fz * a), r = floorAt(v.x + rx * c, v.z + rz * c), l = floorAt(v.x - rx * c, v.z - rz * c);
  const clampTilt = (t) => Math.max(-.5, Math.min(.5, t));
  v.pitch = clampTilt(Math.atan2(b - f, K.wheelbase));
  v.roll = clampTilt(Math.atan2(l - r, c * 2));
}

// One step. ctl is { gas -1..1, steer -1..1 where + is right, brake }. world is { blocked(x, z, y), floorAt(x, z), road(x, z) }, and if anything
// can break, ram(x, z, y, speed, dirx, dirz, mass), which says what it cost as { energy in joules, gone } or null if there's nothing there to break.
// It moves the vehicle and says what happened: { hit: how hard, smash: joules spent breaking things, damage, wrecked: just now, landed: how hard }.
export function stepVehicle(v, ctl, dt, world) {
  const K = v.K, out = { hit: 0, smash: 0, damage: 0, wrecked: false, landed: 0, wet: false };
  const onRoad = world.road(v.x, v.z), floor0 = world.floorAt(v.x, v.z), level = world.level?.(v.x, v.z) ?? 0, wet = floor0 < level - .1;
  out.wet = wet;
  if (floor0 < level - .8) v.drowned = true;
  const dead = v.wrecked || v.drowned, gas = dead || ctl.brake ? 0 : Math.max(-1, Math.min(1, ctl.gas)), top = K.top * (onRoad ? 1 : K.rough);
  let grip = K.grip * (onRoad ? 1 : .55 + .45 * K.rough), f = v.f, s = v.s;
  // Whether anything's in the way of it at this spot and this way round
  const inTheWay = (x, z, yaw, points) => {
    const [ax, az] = forward(yaw), [bx, bz] = rightOf(yaw);
    for (const [along, across] of points) { const cx = x + ax * along + bx * across, cz = z + az * along + bz * across; if (world.blocked(cx, cz, v.y + .6) || world.floorAt(cx, cz) - v.y > 1) return true; }
    return false;
  };
  // Already touching something, nowhere it could go would count as clear, not even backing away, and it could never leave. So while it's caught only what's ahead of it
  // counts, whichever way it's going, and what's behind it is what it's leaving. That lasts a little past the touching, since something inside it can be between the points
  // it's checked at. It can't go on through what it's touching, because that's ahead of it.
  if (inTheWay(v.x, v.z, v.yaw, K.rim) || inTheWay(v.x, v.z, v.yaw, K.inner)) v.getOut = K.length / 2 + 1;
  const caught = v.getOut > 0, freed = v.freed > 0;
  // the engine, and the brakes when it's going the other way
  if (v.grounded) {
    if (gas > 0) { if (f < -.3) f += K.brake * gas * dt; else if (f < top) f += K.accel * gas * (1 - Math.max(0, f) / top) * dt; }
    else if (gas < 0) { if (f > .3) f += K.brake * gas * dt; else if (f > -K.reverse) f += K.accel * .7 * gas * (1 - Math.max(0, -f) / K.reverse) * dt; }
    else { const roll = (onRoad ? 1.1 : 3) * dt; f -= Math.sign(f) * Math.min(Math.abs(f), roll); }
    if (f > top) f -= Math.min(f - top, 7 * dt);
    if (ctl.brake) { f -= Math.sign(f) * Math.min(Math.abs(f), K.brake * .8 * dt); grip *= .26; }
  }
  if (wet) { f *= Math.exp(-2.6 * dt); s *= Math.exp(-2.6 * dt); }
  // steering takes a moment and there's less of it at speed. It only turns the wheels if it's rolling, and the slip it makes dies off by grip
  const want = (dead ? 0 : Math.max(-1, Math.min(1, ctl.steer))) * K.lock / (1 + Math.abs(f) / K.top * 1.5);
  v.steer += (want - v.steer) * Math.min(1, dt * 7);
  if (v.grounded) {
    // however far the wheels are turned, it can only corner so hard, or it'd spin round at top speed. With the brake on the back end lets go.
    const hardest = K.corner * (onRoad ? 1 : .6 + .4 * K.rough) * (ctl.brake ? 1.8 : 1) / Math.max(Math.abs(f), 4);
    const turn = Math.max(-hardest, Math.min(hardest, -f / K.wheelbase * Math.tan(v.steer))) * dt;
    // It can't swing its nose into something. Up against a tree it goes straight until there's room to turn.
    if (turn !== 0 && (caught || !inTheWay(v.x, v.z, v.yaw + turn, K.rim))) { v.yaw += turn; f -= s * turn; s += f * turn; }
    s *= Math.exp(-grip * dt);
  }
  // Move in short hops, so nothing's thin enough to go through at speed
  const [fx, fz] = forward(v.yaw), [rx, rz] = rightOf(v.yaw);
  let vx = fx * f + rx * s, vz = fz * f + rz * s;
  const hops = Math.max(1, Math.ceil(Math.hypot(vx, vz) * dt / .28));
  // `edge` is where the map stops: it holds you back without hurting anything
  let soft = false, struck = false, hitX = 0, hitZ = 0;
  const clear = (px, pz) => {
    struck = false;
    const goX = px - x, goZ = pz - z;
    for (const [along, across] of caught ? K.whole : K.rim) {
      const ox = fx * along + rx * across, oz = fz * along + rz * across, cx = px + ox, cz = pz + oz;
      if (world.edge?.(cx, cz)) { soft = true; return false; }
      if (freed || (caught && ox * goX + oz * goZ <= 0)) continue;
      if (world.blocked(cx, cz, v.y + .6)) { struck = true; hitX = cx; hitZ = cz; return false; }
      if (world.floorAt(cx, cz) - v.y > 1) return false;
    }
    return true;
  };
  let x = v.x, z = v.z;
  for (let i = 0; i < hops; i++) {
    let nx = x + vx * dt / hops, nz = z + vz * dt / hops;
    if (clear(nx, nz)) { x = nx; z = nz; continue; }
    // Whatever's in the way may not stand up to it. Breaking it takes some of the speed, and it carries on through what's gone.
    if (world.ram) {
      let through = false;
      for (let tries = 0; tries < 4 && struck && !through; tries++) {
        const speed = Math.hypot(vx, vz), r = speed > 0 ? world.ram(hitX, hitZ, v.y + .6, speed, vx / speed, vz / speed, K.mass) : null;
        if (!r) break;
        const left = Math.sqrt(Math.max(0, speed * speed - 2 * r.energy / K.mass)) / speed;
        vx *= left; vz *= left; out.smash += r.energy;
        nx = x + vx * dt / hops; nz = z + vz * dt / hops;
        if (!r.gone) break;
        through = clear(nx, nz);
      }
      if (through) { x = nx; z = nz; continue; }
    }
    // slide along whatever it hit if it can, losing the speed going into it, and bounce off if it can't
    if (clear(nx, z)) { x = nx; out.hit = Math.max(out.hit, Math.abs(vz)); vz *= -.2; }
    else if (clear(x, nz)) { z = nz; out.hit = Math.max(out.hit, Math.abs(vx)); vx *= -.2; }
    else { out.hit = Math.max(out.hit, Math.hypot(vx, vz)); vx *= -.25; vz *= -.25; break; }
  }
  const moved = Math.hypot(x - v.x, z - v.z);
  if (caught) v.getOut -= moved;
  if (freed) v.freed -= moved;
  // Wedged, with something in front and something behind and no room to turn: if it won't go forward and it won't go back, it comes free the way you're pushing it
  v.heldF = Math.max(0, v.heldF - dt); v.heldB = Math.max(0, v.heldB - dt);
  if (moved < .002 && !dead) { if (gas > 0) v.heldF = 3; else if (gas < 0) v.heldB = 3; }
  if (v.heldF > 0 && v.heldB > 0) { v.freed = K.length / 2 + 1; v.heldF = v.heldB = 0; }
  v.x = x; v.z = z;
  v.f = vx * fx + vz * fz; v.s = vx * rx + vz * rz;
  v.spin += v.f / K.wheel * dt;
  // over the ground, or off it
  const floor = world.floorAt(x, z);
  if (v.grounded && floor < v.y - .35 && Math.abs(v.f) > 5) { v.grounded = false; v.vy = 0; }
  if (v.grounded) { v.y += (floor - v.y) * Math.min(1, dt * 14); v.vy = 0; }
  else { v.vy -= GRAVITY * dt; v.y += v.vy * dt; if (v.y <= floor) { out.landed = -v.vy; v.y = floor; v.vy = 0; v.grounded = true; } }
  if (v.grounded) settle(v, world.floorAt);
  // what it cost
  out.edge = soft;
  if (!v.wrecked) {
    const damage = damageFrom(K, Math.max(soft ? 0 : out.hit, out.landed * .6)) + out.smash / SMASH_J * 2 * Math.sqrt(1500 / K.mass);
    if (damage > 0) { v.hp -= damage; out.damage = damage; if (v.hp <= 0) { v.hp = 0; v.wrecked = true; out.wrecked = true; } }
  }
  return out;
}

// Someone struck it, or it struck someone: only the hit points. It says whether that finished it.
export function hurtVehicle(v, damage) {
  if (v.wrecked) return false;
  v.hp -= damage; if (v.hp > 0) return false;
  v.hp = 0; v.wrecked = true; return true;
}

// Where they're parked: in driveways and on the real buildings' own ground. `hash(id, n)` is 0 to 1, `road(x, z)` is the nearest point of a road or null,
// and `free(kind, x, z, yaw)` says whether it fits there.
export function placeVehicles(structures, { hash, road, free }) {
  const out = [], kept = [];
  const park = (kind, x, z, yaw, s) => {
    if (kept.some((k) => Math.hypot(k[0] - x, k[1] - z) < 7)) return false;
    if (!free(kind, x, z, yaw)) return false;
    kept.push([x, z]); out.push({ kind, x, z, yaw, tone: hash(s.id ?? 0, 7) }); return true;
  };
  // Beside a building, nose towards it: on the side towards its road if there's room, then round either side, then behind.
  // It tries along each side too if the middle's taken. A building with no road near it starts from the south.
  const beside = (kind, s) => {
    const p = road(s.wx, s.wz), dx = p ? p.x - s.wx : 0, dz = p ? p.z - s.wz : 1, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
    for (const [ax, az] of [[ux, uz], [-uz, ux], [uz, -ux], [-ux, -uz]]) {
      let reach = 0; for (const [px, pz] of s.pts) reach = Math.max(reach, (px - s.wx) * ax + (pz - s.wz) * az);
      const back = reach + KINDS[kind].length / 2 + 1.2;
      if (p && ax === ux && az === uz && back > L - 5) continue;
      const yaw = Math.atan2(-ax, -az);
      for (const off of [0, 5, -5]) if (park(kind, s.wx + ax * back - az * off, s.wz + az * back + ax * off, yaw, s)) return true;
    }
    return false;
  };
  for (const s of structures) {
    const h = hash(s.id ?? 0, 3), which = hash(s.id ?? 0, 5);
    if (s.use === 'church') beside('golf', s);
    else if (s.use === 'mobile') { if (h < .4) beside('quad', s); }
    else if (s.use === 'house') { if (h < .2) beside(which < .62 ? 'pickup' : 'car', s); }
    else if (s.use === 'farm') { if (h < .6) beside('pickup', s); }
    else if (s.use === 'shop' || s.use === 'office' || s.use === 'public' || s.use === 'hall') { if (h < .5) beside(which < .5 ? 'car' : 'pickup', s); }
  }
  return out;
}
