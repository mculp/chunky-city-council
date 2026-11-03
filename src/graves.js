// Where the stones stand in the cemetery up the road. There's no three.js or page in here, so node tests load it too.
// The big pale slabs are where they are on the aerial. The rest is rows, as they look from the road, and none of it is anyone's in particular.

// All in true metres. The rows run along the fence by the gravel loop, one behind another going away from it.
export const CEMETERY = {
  outline: [[-450.6, -7393.8], [-413.4, -7426.8], [-401, -7446], [-388, -7446], [-388, -7362], [-465, -7362], [-462, -7384.5]],
  fences: [[[-417.5, -7423.2], [-450.6, -7393.8], [-462, -7384.5], [-465, -7360], [-388, -7360]]],
  origin: [-450.6, -7393.8], along: [.748, -.663], back: [.663, .748],
  slabs: [[-432.6, -7402.7], [-428.6, -7399.8], [-416.4, -7414.2], [-404.7, -7406], [-397.5, -7421.7], [-391.5, -7427], [-389.9, -7397.6], [-395.6, -7397], [-398, -7380.6], [-434.4, -7377], [-430.2, -7374], [-410, -7368.8], [-440, -7388], [-437.5, -7384]],
  obelisks: [[-424, -7410], [-409.5, -7399], [-441.5, -7379]],
  stone: [-402.6, -7390.4],
  // the old family plot off in the north corner
  plot: [-400, -7443, -391, -7434],
  keepClear: [[-422.4, -7404.6, 2.2], [-446, -7375, 3.2], [-432, -7367, 2]],
};

const inside = (x, z, poly) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[j];
    if ((az > z) !== (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) hit = !hit;
  }
  return hit;
};
const edgeDistance = (x, z, poly) => {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[j], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
};

// How much room each kind takes: how far out it stops him, and how high. A slab can be walked on: only the stone at its head stops him.
const SIZE = { low: [.5, .6], double: [.75, .75], upright: [.35, .85], old: [.28, .9], cross: [.3, 1], obelisk: [.6, 3], stone: [.55, 1.05], slab: [.85, .8] };

// hash(a, b, s) from 0 to 1. It's the game's, passed in so that this doesn't need the page.
export function layGraves(hash) {
  const { outline, origin: [ox, oz], along: [ax, az], back: [bx, bz], slabs, obelisks, stone, plot, keepClear } = CEMETERY, out = [];
  const add = (x, z, kind, i, more = {}) => out.push({ x, z, kind, tone: hash(i, 3, 411), turn: (hash(i, 3, 412) - .5) * .12, flowers: hash(i, 3, 413) < .3 ? 1 + Math.floor(hash(i, 3, 414) * 2.99) : 0, ...more });
  slabs.forEach(([x, z], i) => add(x, z, 'slab', i, { w: 2.4 + hash(i, 4, 415) * .9, d: 3 + hash(i, 4, 416) * .6 }));
  obelisks.forEach(([x, z], i) => add(x, z, 'obelisk', 40 + i));
  out.push({ x: stone[0], z: stone[1], kind: 'stone', tone: 0, turn: .03, flowers: 0 });
  // room to stand in front of it and read it
  const roomAt = (x, z) => out.every((o) => Math.hypot(o.x - x, o.z - z) >= (o.kind === 'slab' ? 2.7 : o.kind === 'obelisk' ? 1.7 : o.kind === 'stone' ? 2.2 : 1.05)) && keepClear.every(([cx, cz, r]) => Math.hypot(cx - x, cz - z) >= r);
  for (let iv = 0; iv < 22; iv++) for (let iu = -14; iu < 36; iu++) {
    const u = iu * 2.3 + (iv % 2) * .8 + (hash(iu, iv, 401) - .5) * .5, v = 2.8 + iv * 3.4 + (hash(iu, iv, 402) - .5) * .4, x = ox + ax * u + bx * v, z = oz + az * u + bz * v;
    if (!inside(x, z, outline) || edgeDistance(x, z, outline) < 1.5 || z > -7366) continue;
    // Some of a row's there and some of it isn't, the way families are buried together
    if (hash(Math.floor(iu / 4), iv, 403) > .62 || hash(iu, iv, 404) > .8) continue;
    // and there's bare ground in the middle of it
    if (Math.hypot(x + 423, z + 7380) < 9 && hash(iu, iv, 405) > .25) continue;
    if (!roomAt(x, z)) continue;
    const k = hash(iu, iv, 406);
    add(x, z, k < .44 ? 'low' : k < .64 ? 'double' : k < .8 ? 'upright' : k < .94 ? 'old' : 'cross', 100 + iu * 40 + iv);
  }
  // Older, thinner stones close together in the plot
  for (let i = 0; i < 12; i++) {
    const x = plot[0] + .8 + (i % 4) * 2.4 + hash(i, 5, 417) * .4, z = plot[1] + 1 + Math.floor(i / 4) * 3 + hash(i, 5, 418) * .4;
    if (roomAt(x, z)) add(x, z, 'old', 900 + i);
  }
  return out;
}

// What stops him at each one: [x, z, half width, top], in true metres. A slab's stone is at the head of it, on the side away from where it's read.
export function graveSolid(g, turn = 0) {
  const [half, top] = SIZE[g.kind];
  if (g.kind !== 'slab') return [g.x, g.z, half, top];
  const back = -g.d / 2 + .2, a = turn + g.turn;
  return [g.x + Math.sin(a) * back, g.z + Math.cos(a) * back, half, top];
}
