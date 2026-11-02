// What the crowd does. There's no three.js or page in here, so node tests load it too. How they look is in index.html.
//
// They've got no eyes to speak of: sound, light and the smell of beans are all they go on, and all of it's
// sharper at night. What they are is in docs/lore.md, and how far gone each of them is only changes how they look so far.

export const SHAMBLE = 0, CURIOUS = 1, HUNTING = 2, SWARM = 3, GRABBING = 4, STUNNED = 5;
export const STATE_NAMES = ['shamble', 'curious', 'hunting', 'swarm', 'grabbing', 'stunned'];

export const TUNING = {
  active: 150,                     // further from the player than this, they wait
  speed: [.75, 1.15, 3, 3.7, 0, 0],   // m/s by state. The player runs at 4.4, so the open ground is always an escape.
  thinkEvery: .2,                  // seconds between looks around
  smellBase: 1.5, smellPerBean: .45,  // metres. A full twelve reaches about ten at night, so standing still among them still means something.
  touch: 2,                        // metres, for someone standing dead still with nothing on them
  nightSense: 1.5,                 // how much further they reach at full night
  alertRate: [.5, 2],              // alert per second, at the edge of a sense and right on top of it
  alertFade: .3,
  curiousAt: .25,
  lookAround: 3,                   // seconds spent looking around where something was
  lostAfter: 5,                    // seconds a hunter keeps going after losing you
  swarmSize: 3, swarmReach: 10, callReach: 20,
  grabReach: .95, grabbers: 3, dragSpeed: .7,
  mash: .17, mashFade: .12, grabHold: 7,   // one press, how fast it slips back, and how long you've got
  stun: 1.6, shove: 2.6, mercy: 1.6,       // what breaking free buys you
  personalSpace: .95,
  feelAlong: 8,                    // seconds along a wall before trying the other way
  lightPull: .35,                  // the chance a shambler heads for a light it's near, at full night
};

const hypot = Math.hypot, TRY = [0, .8, 1.6, 2.4, 3.1];
function turn(from, to, k) { let d = (to - from) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return from + d * k; }

// world: { blocked(x, z, y), water(x, z), floorAt(x, z), wander(s) -> [x, z], rand() }
// on: { grab(grab), free(), overrun() }
export function createHorde(world, tuning = {}, on = {}) {
  const T = { ...TUNING, ...tuning }, all = [], active = [], noises = [], lights = [], zones = [];
  let clock = 0, bellUntil = -1, mercy = 0;
  const h = { all, active, noises, lights, zones, T, grab: null, on };

  h.inSanctuary = (x, z) => zones.some((a) => hypot(x - a.x, z - a.z) < a.r);
  // Off limits unless the bell's ringing. Anyone caught inside when it stops can still walk out.
  const offLimits = (s, x, z) => clock >= bellUntil && zones.some((a) => { const d = hypot(x - a.x, z - a.z); return d < a.r && d <= hypot(s.x - a.x, s.z - a.z); });
  const open = (s, x, z) => !world.blocked(x, z, s.y) && !world.water(x, z) && !offLimits(s, x, z);

  h.add = (x, z, extra = {}) => {
    const s = { x, z, y: world.floorAt(x, z), yaw: world.rand() * 6.28, state: SHAMBLE, tx: x, tz: z, alert: 0, timer: 0, lost: 0, moving: 0, stuck: 0, side: 0, clear: 0, next: world.rand() * T.thinkEvery, phase: world.rand() * 6.28, gait: world.rand() * 6.28, limp: world.rand() < .5 ? 0 : 1, look: Math.floor(world.rand() * 1000), size: .94 + world.rand() * .12, ...extra };
    all.push(s); return s;
  };
  // Something loud: anyone in reach goes to look, and at a bell they forget the church is off limits
  h.noise = (x, z, r, seconds) => { noises.push({ x, z, r, until: clock + seconds }); };
  h.bell = (x, z, r, seconds) => { h.noise(x, z, r, seconds); bellUntil = clock + seconds; };
  // Knocked flat: anyone within r goes over, thrown clear, and lies there a while. It says how many.
  h.knock = (x, z, r, seconds) => {
    let n = 0;
    for (const s of active) {
      const dx = s.x - x, dz = s.z - z, d = hypot(dx, dz);
      if (d >= r || s.flat > 0) continue;
      s.state = STUNNED; s.timer = seconds; s.alert = 1; s.moving = 0; s.flat = s.flatFor = seconds; n++;
      const k = 1 + (1 - d / r) * 2.4, nx = s.x + dx / (d || 1) * k, nz = s.z + dz / (d || 1) * k;
      if (open(s, nx, nz)) { s.x = nx; s.z = nz; s.y = world.floorAt(nx, nz); }
    }
    return n;
  };
  h.calm = () => {
    if (h.grab) h.grab = null;
    for (const s of all) { s.state = SHAMBLE; s.alert = 0; s.timer = 0; s.lost = 0; s.tx = s.x; s.tz = s.z; s.moving = 0; }
  };
  // A press of the button while held
  h.mash = () => { if (!h.grab) return; h.grab.progress += T.mash / (1 + .5 * (h.grab.who.length - 1)); if (h.grab.progress >= 1) release(true); };

  function nearestNoise(s) {
    let best = null, bd = Infinity;
    for (const n of noises) { const d = hypot(n.x - s.x, n.z - s.z); if (d < n.r && d < bd) { bd = d; best = n; } }
    return best;
  }
  function think(s, p) {
    const d = hypot(s.x - p.x, s.z - p.z), sharp = 1 + (T.nightSense - 1) * p.night;
    const reach = p.hidden ? 0 : Math.max(p.noise * sharp, (T.smellBase + T.smellPerBean * p.beans) * sharp, p.light * sharp, T.touch);
    const sensed = d < reach;
    if (sensed) s.alert = Math.min(1, s.alert + T.thinkEvery * (T.alertRate[0] + (T.alertRate[1] - T.alertRate[0]) * (1 - d / reach)));
    else s.alert = Math.max(0, s.alert - T.thinkEvery * T.alertFade);
    const loud = nearestNoise(s);

    if (s.state === STUNNED) { s.timer -= T.thinkEvery; if (s.timer <= 0) { s.state = HUNTING; s.lost = 0; s.tx = p.x; s.tz = p.z; } return; }
    // caught inside the church when the bell stopped: out they go
    if (clock >= bellUntil) for (const a of zones) {
      const d = hypot(s.x - a.x, s.z - a.z);
      if (d < a.r) { s.state = SHAMBLE; s.timer = 4; s.tx = a.x + (s.x - a.x) / (d || 1) * (a.r + 3); s.tz = a.z + (s.z - a.z) / (d || 1) * (a.r + 3); return; }
    }
    if (s.state === SHAMBLE) {
      if (loud) { s.state = CURIOUS; s.tx = loud.x; s.tz = loud.z; s.timer = T.lookAround; return; }
      if (s.alert >= T.curiousAt) { s.state = CURIOUS; s.tx = p.x; s.tz = p.z; s.timer = T.lookAround; return; }
      s.timer -= T.thinkEvery;
      if (s.timer <= 0 || hypot(s.tx - s.x, s.tz - s.z) < .6 || s.stuck > 1) {
        s.stuck = 0; s.timer = 6 + world.rand() * 10;
        const near = lights.find((l) => hypot(l.x - s.x, l.z - s.z) < l.r);
        // and it keeps going until it's there
        if (near && world.rand() < T.lightPull * p.night) { const a = world.rand() * 6.28, r = 2 + world.rand() * 5; s.tx = near.x + Math.cos(a) * r; s.tz = near.z + Math.sin(a) * r; s.timer = hypot(s.tx - s.x, s.tz - s.z) / T.speed[SHAMBLE] + 2; }
        else [s.tx, s.tz] = world.wander(s);
      }
    } else if (s.state === CURIOUS) {
      if (s.alert >= 1) { s.state = HUNTING; s.lost = 0; return; }
      if (loud) { s.tx = loud.x; s.tz = loud.z; s.timer = T.lookAround; }
      else if (sensed) { s.tx = p.x; s.tz = p.z; s.timer = T.lookAround; }
      if (s.stuck > T.feelAlong) { s.stuck = 0; s.state = SHAMBLE; s.timer = 0; }   // can't get there
      else if (hypot(s.tx - s.x, s.tz - s.z) < 1.2) { s.timer -= T.thinkEvery; if (s.timer <= 0) { s.state = SHAMBLE; s.timer = 0; } }
    } else if (s.state === HUNTING || s.state === SWARM) {
      // a noise only pulls a hunter off you if it's lost you already
      if (sensed) { s.lost = 0; s.tx = p.x; s.tz = p.z; }
      else {
        s.lost += T.thinkEvery;
        if (loud) { s.state = CURIOUS; s.alert = T.curiousAt; s.tx = loud.x; s.tz = loud.z; s.timer = T.lookAround; return; }
        if (s.lost >= T.lostAfter) { s.state = CURIOUS; s.alert = T.curiousAt; s.timer = T.lookAround; return; }
      }
      let pack = 1;
      for (const o of active) if (o !== s && (o.state === HUNTING || o.state === SWARM) && hypot(o.x - s.x, o.z - s.z) < T.swarmReach) pack++;
      s.state = pack >= T.swarmSize ? SWARM : HUNTING;
      if (s.state === SWARM) for (const o of active) if ((o.state === SHAMBLE || o.state === CURIOUS) && hypot(o.x - s.x, o.z - s.z) < T.callReach) { o.alert = Math.min(1, o.alert + T.thinkEvery); if (o.state === SHAMBLE) { o.state = CURIOUS; o.timer = T.lookAround; } o.tx = s.tx; o.tz = s.tz; }
    }
  }
  function walk(s, dt) {
    const sp = T.speed[s.state];
    s.moving = 0; if (!sp) return;
    let dx = s.tx - s.x, dz = s.tz - s.z, l = hypot(dx, dz);
    if (l < .35) return;
    dx /= l; dz /= l;
    // keep out of each other's way, so they crowd rather than stack
    for (const o of active) {
      if (o === s) continue;
      const ax = s.x - o.x, az = s.z - o.z;
      if (Math.abs(ax) > T.personalSpace || Math.abs(az) > T.personalSpace) continue;
      const q = hypot(ax, az); if (q > 0 && q < T.personalSpace) { const k = (T.personalSpace - q) / T.personalSpace * 1.4; dx += ax / q * k; dz += az / q * k; }
    }
    const m = hypot(dx, dz) || 1, step = sp * dt; dx /= m; dz /= m;
    // Straight if it can. Otherwise it picks a side and keeps to it, feeling along whatever's in the way.
    if (!s.side) s.side = world.rand() < .5 ? -1 : 1;
    for (const a of TRY) {
      const q = a * s.side, c = Math.cos(q), n = Math.sin(q), vx = dx * c - dz * n, vz = dx * n + dz * c, nx = s.x + vx * step, nz = s.z + vz * step;
      if (open(s, nx, nz)) {
        s.x = nx; s.z = nz; s.y = world.floorAt(nx, nz); s.moving = sp; s.yaw = turn(s.yaw, Math.atan2(vx, vz), Math.min(1, dt * 5));
        if (a === 0) { s.clear += dt; if (s.clear > .5) { s.side = 0; s.stuck = 0; } }
        else { s.clear = 0; s.stuck += dt; if (s.stuck > T.feelAlong) { s.side = -s.side; s.stuck = 0; } }
        return;
      }
    }
    s.side = -s.side; s.stuck += dt;
  }
  function holdOn(dt, p) {
    const g = h.grab;
    g.time += dt; g.progress = Math.max(0, g.progress - T.mashFade * dt);
    if (g.who.length < T.grabbers) for (const s of active) if ((s.state === HUNTING || s.state === SWARM) && hypot(s.x - p.x, s.z - p.z) < T.grabReach + .3) { s.state = GRABBING; g.who.push(s); if (g.who.length >= T.grabbers) break; }
    // they stand around you and pull the way the first of them came from
    g.who.forEach((s, i) => {
      const a = g.at + i * 2.2, k = Math.min(1, dt * 6), nx = s.x + (p.x + Math.sin(a) * .72 - s.x) * k, nz = s.z + (p.z + Math.cos(a) * .72 - s.z) * k;
      if (open(s, nx, nz)) { s.x = nx; s.z = nz; s.y = world.floorAt(nx, nz); }
      s.yaw = turn(s.yaw, Math.atan2(p.x - s.x, p.z - s.z), Math.min(1, dt * 8)); s.moving = 0;
    });
    const k = T.dragSpeed * Math.min(1.4, .7 + g.who.length * .3);
    g.dx = Math.sin(g.at) * k; g.dz = Math.cos(g.at) * k;
    if (g.time >= T.grabHold) release(false);
  }
  function release(broke) {
    const g = h.grab; h.grab = null; mercy = T.mercy;
    // everyone close gets thrown off, or they'd only grab straight back on
    for (const s of active) {
      const dx = s.x - g.x, dz = s.z - g.z, d = hypot(dx, dz) || 1;
      if (!g.who.includes(s) && d > T.shove) continue;
      s.state = STUNNED; s.timer = T.stun; s.alert = 1; s.moving = 0;
      const nx = s.x + dx / d * T.shove, nz = s.z + dz / d * T.shove;
      if (open(s, nx, nz)) { s.x = nx; s.z = nz; }
    }
    if (broke) h.on.free?.(); else h.on.overrun?.();
  }

  // p: { x, z, y, noise, light, beans, night, hidden, canGrab }
  h.update = (dt, p) => {
    clock += dt; mercy = Math.max(0, mercy - dt);
    for (let i = noises.length - 1; i >= 0; i--) if (noises[i].until < clock) noises.splice(i, 1);
    active.length = 0;
    for (const s of all) if (hypot(s.x - p.x, s.z - p.z) < T.active) active.push(s);
    for (const s of active) {
      s.next -= dt;
      if (s.flat > 0) s.flat -= dt;
      if (s.next <= 0) { s.next += T.thinkEvery; think(s, p); }
      walk(s, dt);
    }
    if (h.grab) { h.grab.x = p.x; h.grab.z = p.z; holdOn(dt, p); return; }
    if (mercy > 0 || !p.canGrab) return;
    for (const s of active) {
      if ((s.state === HUNTING || s.state === SWARM) && hypot(s.x - p.x, s.z - p.z) < T.grabReach) {
        s.state = GRABBING;
        h.grab = { who: [s], time: 0, progress: 0, at: Math.atan2(s.x - p.x, s.z - p.z), x: p.x, z: p.z, dx: 0, dz: 0 };
        h.on.grab?.(h.grab);
        return;
      }
    }
  };
  return h;
}
