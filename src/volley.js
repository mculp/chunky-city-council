// Keeping a ball up in the yard, by himself: one thumb to get under it and one button to bump it. There's no three.js or page in here, so node tests load it too.
//
// The court's own axes: u is along it, with the net across the middle at u = 0, and v is across it.

export const VOLLEY = {
  r: .13,                    // metres. A real one's about .105, and this one has to be seen from behind him on a phone
  gravity: 9.8,
  up: 6,                     // m/s it leaves his arms at, which is about a second and a quarter in the air
  reach: 1.7,                // how far from him he can still get to it
  low: .1, high: 2.5,        // how far off the ground under him
  wander: 1.1, more: .28, most: 3.6,   // how far off the next one comes down: at first, how much more for each one in a row, and at most
  bounce: .45,               // how much of its speed it keeps off the ground
  goal: 6,                   // they played six on six
};

export function makeCourt(x, z, deg, long = 18, wide = 9) {
  const t = deg * Math.PI / 180;
  return { x, z, ax: Math.cos(t), az: Math.sin(t), long, wide };
}
export const toCourt = (c, x, z) => { const dx = x - c.x, dz = z - c.z; return [dx * c.ax + dz * c.az, -dx * c.az + dz * c.ax]; };
export const fromCourt = (c, u, v) => [c.x + u * c.ax - v * c.az, c.z + u * c.az + v * c.ax];

export function makeBall(c, u, v) {
  const [x, z] = fromCourt(c, u, v);
  return { court: c, x, y: VOLLEY.r, z, vx: 0, vy: 0, vz: 0, air: false, count: 0, best: 0, landX: x, landZ: z, spin: 0 };
}

// Whether he can get to it from here, standing on `floor`. On its way up it's still out of his hands.
export function ballInReach(b, px, pz, floor = 0) {
  const h = b.y - floor;
  return Math.hypot(b.x - px, b.z - pz) < VOLLEY.reach && h >= VOLLEY.low && h <= VOLLEY.high && (!b.air || b.vy <= 0);
}

// Up it goes, to come down somewhere on his side of the net a bit further off each time. rand is a number from 0 to 1, twice. It says how many that makes in a row, or null if he missed.
export function bump(b, px, pz, floor, rand) {
  if (!ballInReach(b, px, pz, floor)) return null;
  const c = b.court, [u, v] = toCourt(c, b.x, b.z), side = u < 0 ? -1 : 1, far = Math.min(VOLLEY.most, VOLLEY.wander + VOLLEY.more * b.count), a = rand() * Math.PI * 2, d = far * (.6 + .4 * rand());
  const lu = side * Math.min(c.long / 2 - .6, Math.max(.9, side * u + Math.cos(a) * d)), lv = Math.max(-c.wide / 2 + .6, Math.min(c.wide / 2 - .6, v + Math.sin(a) * d));
  [b.landX, b.landZ] = fromCourt(c, lu, lv);
  b.y = Math.max(b.y, floor + .9);
  const G = VOLLEY.gravity, t = (VOLLEY.up + Math.sqrt(VOLLEY.up ** 2 + 2 * G * (b.y - floor - VOLLEY.r))) / G;
  b.vx = (b.landX - b.x) / t; b.vz = (b.landZ - b.z) / t; b.vy = VOLLEY.up; b.air = true; b.spin = 5 + rand() * 5;
  b.count++; b.best = Math.max(b.best, b.count);
  return b.count;
}

// A step of it. It says how hard it hit the ground, if it did, and whether that ended a run.
export function stepBall(b, dt, floor = 0) {
  if (!b.air) return null;
  b.x += b.vx * dt; b.z += b.vz * dt; b.vy -= VOLLEY.gravity * dt; b.y += b.vy * dt;
  if (b.y > floor + VOLLEY.r || b.vy > 0) return null;
  const hit = -b.vy, ended = b.count > 0;
  b.y = floor + VOLLEY.r; b.count = 0;
  if (hit < 1.2) { b.air = false; b.vx = b.vy = b.vz = b.spin = 0; return { hit, ended }; }
  b.vy = hit * VOLLEY.bounce; b.vx *= .55; b.vz *= .55; b.spin *= .6;
  return { hit, ended };
}
