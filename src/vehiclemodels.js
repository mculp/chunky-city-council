// What vehicles look like: low-poly and built from code. Paint is white here, because each one's own colour multiplies it.
// A vehicle's own axes: +z is the nose, +x is the driver's left, y is up, and its origin is on the ground under its middle.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PAINT = '#ffffff', DARK = '#17131c', TRIM = '#3a3840', LIGHT = '#f3e8b4', TAIL = '#8a1a14', SEAT = '#4a3a30', CREAM = '#c9bd9e', TIRE = '#0d0b10', HUB = '#6d6a72';

export function painted(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
export const box = (x, y, z, w, h, d, color = PAINT) => painted(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
// a bar from one point to another
export function bar(a, b, w, color = PAINT) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B);
  const g = new THREE.BoxGeometry(w, L, w).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize())).translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return painted(g, color);
}
// A side view swept across the width: `profile` is [along, up] pairs going clockwise from the back, seen from the driver's side
export function prism(profile, x0, x1, color = PAINT) {
  const pos = [], n = profile.length;
  let cz = 0, cy = 0; for (const [z, y] of profile) { cz += z / n; cy += y / n; }
  for (let i = 0; i < n; i++) {
    const [az, ay] = profile[i], [bz, by] = profile[(i + 1) % n];
    // the band round the edge, and the two sides as a fan
    pos.push(x0, ay, az, x1, by, bz, x1, ay, az, x0, ay, az, x0, by, bz, x1, by, bz);
    pos.push(x1, cy, cz, x1, ay, az, x1, by, bz, x0, cy, cz, x0, by, bz, x0, ay, az);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  return painted(g, color);
}
export const both = (fn) => [fn(1), fn(-1)];
// A body joined up through sections across it: each ring is the same number of [x, y, z] points, round its section in order, and the next ring along is joined to it face by face.
// Every face points away from `from`, an [x, y] down the middle, or from the middle of its own ring, so it doesn't matter which way round they go. `closed` joins each ring's last point
// back to its first, for a solid with both ends capped; without it, it's a strip.
export function loft(rings, color = PAINT, { closed = true, from = null } = {}) {
  const pos = [], mid = (r) => r.reduce((m, p) => [m[0] + p[0] / r.length, m[1] + p[1] / r.length, m[2] + p[2] / r.length], [0, 0, 0]);
  const tri = (a, b, c, out) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    pos.push(...a, ...(n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0 ? [...c, ...b] : [...b, ...c]));
  };
  for (let i = 0; i + 1 < rings.length; i++) {
    const A = rings[i], B = rings[i + 1], n = A.length, ca = mid(A), cb = mid(B), [ox, oy] = from ?? [(ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2];
    for (let j = 0; j < (closed ? n : n - 1); j++) {
      const k = (j + 1) % n, a = A[j], b = A[k], c = B[k], d = B[j], out = [(a[0] + b[0] + c[0] + d[0]) / 4 - ox, (a[1] + b[1] + c[1] + d[1]) / 4 - oy, 0];
      tri(a, b, c, out); tri(a, c, d, out);
    }
  }
  if (closed) for (const [r, s] of [[rings[0], 1], [rings.at(-1), -1]]) { const c = mid(r), out = [0, 0, s * Math.sign(rings[0][0][2] - rings.at(-1)[0][2] || 1)]; for (let j = 0; j < r.length; j++) tri(c, r[j], r[(j + 1) % r.length], out); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  return painted(g, color);
}
// the dark shape round a wheel, on each side
const arches = (z, r, x) => both((s) => prism([[z - r, .32], [z - r, .55], [z - r * .55, r + .4], [z + r * .55, r + .4], [z + r, .55], [z + r, .32]], s * x, s * (x + .012), DARK));

function car() {
  return [
    prism([[-2.5, .55], [-2.5, 1], [-1.7, 1.08], [1, 1.08], [2.3, .95], [2.5, .74], [2.5, .52], [2.3, .4], [-2.3, .4]], -1.12, 1.12),
    box(0, .03, 0, 2, .02, 4.6, DARK),
    box(0, 1.09, -.5, 2, .02, 2.9, DARK),
    box(0, 1.98, -.55, 1.96, .09, 1.95),
    ...both((s) => bar([s * .98, 1.06, 1.08], [s * .95, 1.96, .36], .09)), ...both((s) => bar([s * 1, 1.06, -.5], [s * .96, 1.96, -.55], .09)), ...both((s) => bar([s * .98, 1.06, -1.86], [s * .95, 1.96, -1.46], .11)),
    ...arches(1.55, .55, 1.12), ...arches(-1.45, .55, 1.12),
    ...both((s) => box(s * .72, .84, 2.47, .46, .2, .08, LIGHT)), ...both((s) => box(s * .78, .88, -2.5, .42, .14, .04, TAIL)),
    box(0, .52, 2.52, 2.2, .18, .14, TRIM), box(0, .52, -2.52, 2.2, .18, .14, TRIM), box(0, .74, 2.5, .9, .18, .04, DARK),
    ...both((s) => box(s * 1.122, .75, .9, .01, .62, .05, DARK)), ...both((s) => box(s * 1.122, .75, -.55, .01, .62, .05, DARK)),
    box(.48, 1.3, .52, .4, .4, .05, TRIM), ...both((s) => box(s * .48, .96, -.42, .78, .52, .14, SEAT)), ...both((s) => box(s * .48, .66, -.04, .78, .12, .72, SEAT)),
  ];
}
function pickup() {
  return [
    prism([[-.55, .55], [-.55, 1.2], [1.15, 1.2], [2.55, 1.1], [2.85, .92], [2.85, .66], [2.6, .5], [-.55, .5]], -1.18, 1.18),
    prism([[-2.9, .55], [-2.9, .92], [-.6, .92], [-.6, .55]], -1.18, 1.18),
    box(0, .03, 0, 2.1, .02, 5.2, DARK),
    box(0, 1.21, .32, 2.1, .02, 1.6, DARK),
    box(0, .93, -1.75, 2.1, .03, 2.25, DARK),
    ...both((s) => box(s * 1.12, 1.14, -1.75, .12, .46, 2.3)), box(0, 1.14, -2.85, 2.36, .46, .1),
    box(0, 2.22, .28, 2.06, .09, 1.55),
    ...both((s) => bar([s * 1.04, 1.2, 1.2], [s * 1, 2.2, .98], .1)), ...both((s) => bar([s * 1.04, 1.2, -.48], [s * 1, 2.2, -.42], .14)),
    ...arches(1.85, .66, 1.18), ...arches(-1.65, .66, 1.18),
    ...both((s) => box(s * .78, .98, 2.82, .46, .24, .08, LIGHT)), ...both((s) => box(s * 1.17, 1.12, -2.92, .08, .3, .04, TAIL)),
    box(0, .62, 2.9, 2.36, .2, .14, HUB), box(0, .62, -2.94, 2.36, .18, .14, TRIM), box(0, .88, 2.84, 1.1, .2, .04, DARK),
    box(.5, 1.5, .78, .4, .4, .05, TRIM), ...both((s) => box(s * .5, 1.2, -.24, .8, .52, .14, SEAT)), ...both((s) => box(s * .5, .9, .12, .8, .12, .72, SEAT)),
    box(.35, 1.14, -1.4, .9, .4, .6, TRIM),
  ];
}
function quad() {
  return [
    box(0, .62, 0, .62, .3, 2),
    prism([[.35, .72], [.35, .88], [1.15, .88], [1.32, .7], [1.2, .6], [.4, .6]], -.8, .8),
    prism([[-1.28, .7], [-1.28, .88], [-.4, .88], [-.4, .6], [-1.15, .6]], -.8, .8),
    box(0, .97, -.36, .48, .16, .98, DARK), box(0, 1, .42, .52, .28, .44),
    bar([0, 1.1, .42], [0, 1.36, .3], .07, TRIM), bar([-.5, 1.42, .28], [.5, 1.42, .28], .06, HUB), ...both((s) => bar([s * .5, 1.42, .28], [s * .56, 1.44, .2], .07, DARK)),
    box(0, .93, .85, 1.02, .04, .52, HUB), box(0, .93, -.95, 1.02, .04, .52, HUB),
    ...both((s) => box(s * .24, .82, 1.3, .18, .14, .06, LIGHT)), ...both((s) => box(s * .22, .8, -1.3, .16, .08, .04, TAIL)),
    ...both((s) => box(s * .42, .6, 0, .34, .05, .5, TRIM)),
    box(0, .03, 0, 1.3, .02, 2.2, DARK),
  ];
}
function golf() {
  return [
    prism([[-1.55, .4], [-1.55, .82], [-.95, .86], [.55, .82], [1.35, .76], [1.6, .6], [1.6, .4]], -.82, .82),
    ...arches(1.05, .4, .82), ...arches(-1.05, .4, .82),
    box(0, .03, 0, 1.4, .02, 2.9, DARK),
    box(0, .87, -.4, 1.36, .05, .72, DARK),
    box(0, .95, -.42, 1.36, .16, .62, CREAM), box(0, 1.28, -.75, 1.36, .52, .14, CREAM),
    box(0, 2.22, -.2, 1.5, .07, 2.3),
    ...both((s) => bar([s * .68, .8, .6], [s * .66, 2.2, .36], .06)), ...both((s) => bar([s * .7, .84, -1.12], [s * .68, 2.2, -.98], .06)),
    bar([.34, .82, .6], [.34, 1.22, .3], .05, TRIM), box(.34, 1.24, .28, .4, .4, .05, TRIM),
    ...both((s) => box(s * .52, .66, 1.58, .22, .14, .06, LIGHT)),
    painted(new THREE.CylinderGeometry(.15, .13, .95, 8).translate(-.3, 1.2, -1.36), '#3c4a3a'),
    bar([-.34, 1.6, -1.36], [-.42, 1.92, -1.4], .03, HUB), bar([-.26, 1.6, -1.38], [-.2, 1.88, -1.34], .03, HUB),
  ];
}

// The white one is a '91 or '92, the boxier shape from before '93, which is the one the owner picked. Its side's measured off a photo of a white one taken side on from a car going along
// beside it, against the real thing's 4.89 m long, 1.28 m tall and 2.565 m between the wheels, and laid over the photo to check: a long flat hood, a nose that comes to a shallow point with
// two lamps in each corner of it and a bumper and a lip under them, one window a side, and one great bubble of glass at the back that's the hatch, with a wing on the deck behind it. The
// tail comes to a point as well, with its lamps across it. The panels are out of its roof, so all that's left over the seats is the bar down the middle and a little roof either end of it.
// The bow tie and its RS are in index.html.
function camaro91() {
  const AMBER = '#c9862e', CLEAR = '#d2d0c2';
  // A section across it: how far along it is at its sides and down its middle, which is further at the ends because they come to a point when you look down on them, how high its bottom,
  // the crease down its side and its top are, how far out each one is, and how much higher the top is down the middle. The top's the hood and the deck. A section's tip is all of it drawn
  // in to its middle, which closes up an end.
  const ring = ([z, zm, yb, ys, yt, wb, ws, wt, crown = 0]) => [[wb, yb, z], [ws, ys, z], [wt, yt, z], [0, yt + crown, zm], [-wt, yt, z], [-ws, ys, z], [-wb, yb, z], [0, yb, zm]];
  const tip = ([, zm, yb, ys, yt, , , , crown = 0]) => [[0, yb, zm], [0, ys, zm], [0, yt, zm], [0, yt + crown, zm], [0, yt, zm], [0, ys, zm], [0, yb, zm], [0, yb, zm]];
  const body = [
    [2.28, 2.385, .36, .47, .6, .62, .66, .58], [2.22, 2.31, .25, .5, .69, .78, .82, .72], [2.13, 2.17, .24, .53, .79, .85, .88, .79, .005], [1.96, 1.96, .22, .57, .855, .89, .91, .82, .01],
    [1.55, 1.55, .2, .6, .895, .91, .925, .84, .015], [1.05, 1.05, .18, .62, .93, .915, .93, .85, .015], [.72, .72, .175, .62, .95, .915, .93, .86, .015], [.4, .4, .175, .62, .885, .915, .93, .87],
    [-.85, -.85, .18, .63, .885, .915, .93, .87], [-1.37, -1.37, .2, .64, .89, .91, .925, .86], [-1.92, -1.92, .26, .65, .89, .9, .92, .84], [-2.15, -2.31, .3, .62, .845, .86, .89, .8],
    [-2.21, -2.37, .32, .6, .62, .84, .87, .8],
  ];
  // the cabin's sides, from the bottom of the window up to where the glass starts, which runs up the windshield's edge from the hood and along the roof, then drops behind the door's window
  // nearly to the sill, because the hatch's glass comes down the sides that far. The photo's roof is its edge nearer the camera, not its middle, so it's a little lower than it looks.
  const SIDE = [[.72, .955, .86, .955, .86], [.4, .885, .87, 1.1, .74], [.06, .885, .87, 1.255, .65], [-.07, .885, .87, 1.275, .63], [-.45, .885, .87, 1.276, .62], [-.85, .885, .87, 1.257, .63],
    [-.96, .885, .87, 1.24, .65], [-1.05, .885, .87, 1.15, .7], [-1.3, .89, .865, .94, .82], [-1.55, .89, .86, .9, .84], [-1.92, .89, .84, .89, .84]];
  const wall = (z, t) => {
    let i = 0; while (i < SIDE.length - 2 && z < SIDE[i + 1][0]) i++;
    const [z0, yb0, wb0, yt0, wt0] = SIDE[i], [z1, yb1, wb1, yt1, wt1] = SIDE[i + 1], k = (z - z0) / (z1 - z0), l = (a, b) => a + (b - a) * k;
    return [l(wb0, wb1) + (l(wt0, wt1) - l(wb0, wb1)) * t, l(yb0, yb1) + (l(yt0, yt1) - l(yb0, yb1)) * t];
  };
  // round over the top from one side's top edge to the other's, as high down its middle as the photo has it, at z along its sides and zm down its middle: the back of the roof, and the hatch,
  // which is one piece of glass that comes down the sides and ends further back in the middle than at them
  const dome = (rows) => rows.map(([z, top, zm = z]) => {
    const [w, y] = wall(z, 1), mid = y + (top - y) * .8, zq = (z + zm) / 2;
    return [[w - .01, y + .004, z], [w * .55, mid + .004, zq], [0, top + .006, zm], [-w * .55, mid + .004, zq], [.01 - w, y + .004, z]];
  });
  // where the nose is at x out from the middle and y up, on its face or round the corner from it to the section behind
  const nose = (x, y) => {
    const out = ([, , yb, ys, yt, wb, ws, wt]) => (y < ys ? wb + (ws - wb) * (y - yb) / (ys - yb) : ws + (wt - ws) * (y - ys) / (yt - ys));
    const [front, next] = body, a = out(front), b = out(next);
    return x < a ? front[1] - (front[1] - front[0]) * x / a : front[0] - (front[0] - next[0]) * (x - a) / (b - a);
  };
  // where the tail's panel is, from the deck down to the bumper: it comes to a point down the middle as well, and leans back
  const [deck, bumper] = body.slice(-2), lean = Math.atan2(deck[1] - bumper[1], deck[4] - bumper[4]);
  const tail = (x, y) => { const k = (deck[4] - y) / (deck[4] - bumper[4]), l = (i) => deck[i] + (bumper[i] - deck[i]) * k; return l(1) + (l(0) - l(1)) * x / deck[7]; };
  // a box h high and d deep laid along one of them from x0 to x1 out on each side, turned and leaning with it, and stood out from it by `proud`
  const laid = (x0, x1, y, h, d, color, at, proud, pitch = 0) => {
    const za = at(x0, y), zb = at(x1, y);
    return both((s) => painted(new THREE.BoxGeometry(Math.hypot(x1 - x0, zb - za), h, d).rotateX(pitch).rotateY(s * Math.atan2(za - zb, x1 - x0)).translate(s * (x0 + x1) / 2, y, (za + zb) / 2 + proud), color));
  };
  const onNose = (x0, x1, y, h, d, color, proud) => laid(x0, x1, y, h, d, color, nose, proud), onTail = (x0, x1, y, h, d, color, proud) => laid(x0, x1, y, h, d, color, tail, -proud, lean);
  return [
    loft([tip(body[0]), ...body.map(ring), tip(body.at(-1))]),
    box(0, .03, 0, 1.6, .02, 4.3, DARK),
    // the cabin's sides, a little thick, and the door's window in each, going to a point at the front where the windshield's edge comes down to the door, and straight up at the back
    ...both((s) => loft(SIDE.map(([z]) => { const [wb, yb] = wall(z, 0), [wt, yt] = wall(z, 1); return [[s * wb, yb, z], [s * wt, yt, z], [s * (wt - .03), yt, z], [s * (wb - .03), yb, z]]; }))),
    ...both((s) => loft([[.4, .02, .05], [.1, .02, .52], [-.15, .02, .855], [-.5, .02, .84], [-.845, .02, .815]].map(([z, t0, t1]) => {
      const [x0, y0] = wall(z, t0), [x1, y1] = wall(z, t1); return [[s * (x0 + .008), y0, z], [s * (x1 + .008), y1, z], [s * (x1 + .002), y1, z], [s * (x0 + .002), y0, z]];
    }), DARK)),
    // the windshield, lying across from one side's top edge to the other's, the hatch, and what's left of the roof between them: over the windshield, the bar down the middle, and the bit in
    // front of the hatch
    loft([.72, -.07].map((z) => { const [w, y] = wall(z, 1); return [[w - .02, y + .004, z], [w - .02, y + .022, z], [.02 - w, y + .022, z], [.02 - w, y + .004, z]]; }), DARK),
    loft(dome([[-.96, 1.269], [-1.05, 1.235], [-1.2, 1.173], [-1.41, 1.087], [-1.68, .991], [-1.77, .889, -1.92]]), DARK, { closed: false }),
    box(0, 1.268, -.12, 1.26, .03, .14), box(0, 1.27, -.475, .2, .03, .58), loft(dome([[-.76, 1.274], [-.96, 1.269]]), PAINT, { closed: false }),
    // inside, through where the panels were: the floor, two seats that stop short of the roof, and the wheel on the driver's side
    box(0, .885, -.3, 1.7, .02, 1.3, DARK), ...both((s) => box(s * .4, 1.07, -.62, .5, .34, .12, SEAT)), ...both((s) => box(s * .4, .93, -.36, .5, .08, .46, SEAT)),
    box(.4, .9, .14, .32, .32, .04, TRIM),
    // mirrors at the foot of the windshield's edge, the doors' seams and handles, a marker at each corner, where the skirts along the bottom start, and the seam where the nose meets the wing
    // over the front wheel
    ...both((s) => box(s * .96, .93, .22, .07, .09, .18)), ...both((s) => box(s * .932, .55, .48, .006, .66, .02, DARK)), ...both((s) => box(s * .932, .55, -.906, .006, .66, .02, DARK)),
    ...both((s) => box(s * .935, .756, -.74, .006, .03, .15, TRIM)), ...both((s) => box(s * .92, .52, 1.756, .012, .035, .145, CLEAR)), ...both((s) => box(s * .866, .7, -2.12, .01, .1, .12, TAIL)),
    ...both((s) => box(s * .932, .253, -.11, .006, .012, 1.78, DARK)), ...both((s) => bar([s * .903, .37, 1.97], [s * .914, .57, 1.97], .008, DARK)), ...both((s) => bar([s * .914, .57, 1.97], [s * .854, .76, 1.97], .008, DARK)),
    // the wheel wells, as they are on the photo: flatter over the top than round
    ...both((s) => prism([[.8, .19], [.83, .579], [.87, .622], [.95, .672], [1.031, .7], [1.111, .71], [1.191, .712], [1.272, .707], [1.352, .692], [1.432, .665], [1.512, .609], [1.543, .19]], s * .932, s * .942, DARK)),
    ...both((s) => prism([[-1.678, .2], [-1.655, .593], [-1.615, .623], [-1.575, .643], [-1.534, .656], [-1.494, .666], [-1.454, .668], [-1.374, .668], [-1.294, .656], [-1.213, .628], [-1.133, .573], [-1.093, .525], [-1.053, .452], [-1.036, .2]], s * .932, s * .942, DARK)),
    // the front: two lamps side by side in a slot in each corner of the nose, the black of it showing round the corner under the hood's edge, the parking lamps and the opening in the bumper
    // under them, and the lip that wraps round under it all
    ...both((s) => bar([s * .833, .76, 2.05], [s * .808, .7, 2.15], .035, DARK)), ...both((s) => bar([s * .808, .7, 2.15], [s * .703, .62, 2.24], .035, DARK)),
    ...onNose(.35, .54, .58, .07, .03, DARK, 0), ...onNose(.54, .73, .58, .07, .03, DARK, 0), ...onNose(.375, .525, .58, .045, .02, LIGHT, .015), ...onNose(.555, .705, .58, .045, .02, LIGHT, .015),
    ...onNose(.48, .68, .43, .06, .02, CLEAR, .006), ...onNose(0, .25, .41, .08, .02, DARK, .004),
    loft([ring([2.13, 2.13, .24, .29, .37, .85, .86, .84]), ring([2.25, 2.31, .25, .29, .37, .74, .76, .72]), ring([2.33, 2.445, .245, .29, .335, .6, .64, .6]), tip([2.33, 2.445, .245, .29, .335])]),
    // the tail: a lamp across each side of the panel, red, then amber, then clear for backing up, each in black and in three rows, the plate between them, the bumper under them, and the wing
    // on the deck, which follows its edge round and comes down to it at each end
    ...[[.515, .8, TAIL], [.37, .5, AMBER], [.215, .355, CLEAR]].flatMap(([x0, x1, color]) => [...onTail(x0 - .012, x1 + .012, .71, .19, .016, DARK, .002), ...onTail(x0, x1, .71, .17, .02, color, .006)]),
    ...[.682, .738].flatMap((y) => onTail(.2, .8, y, .008, .024, DARK, .008)), ...onTail(-.012, .15, .71, .17, .02, DARK, .004),
    loft([ring([-2.2, -2.36, .3, .45, .585, .84, .87, .84]), ring([-2.28, -2.445, .33, .45, .57, .74, .78, .74]), tip([-2.28, -2.445, .33, .45, .57])]),
    ...laid(-.04, .78, .952, .045, .42, PAINT, (x) => tail(Math.abs(x), deck[4]) + .22, 0), ...both((s) => box(s * .76, .885, -2.045, .05, .13, .19)),
  ];
}

// ETB2k4's '99: long, low and pointed, the windshield laid right back, a fastback of glass and a wing on the deck. Its side's measured off a photo of a '96 taken side on, against the real
// thing's 4.9 m long and 2.57 m between the wheels, which puts 1.25 m of nose in front of the front ones. From '98 the headlamps are big and swept back. The panels are out of its roof as
// well, so all that's left over the seats is the bar down the middle. Its name's on the tail, in index.html.
function camaro99() {
  const AMBER = '#c9862e';
  // under the windows, nose to tail: along, then how high its bottom, the crease down its side and its top are, and how far out each one is
  const body = [
    [2.45, .36, .44, .5, .6, .66, .52], [2.38, .26, .44, .58, .8, .85, .72], [2.2, .23, .48, .66, .88, .91, .84], [1.9, .22, .52, .75, .91, .93, .9],
    [1.5, .22, .56, .84, .92, .94, .91], [1.05, .19, .58, .9, .92, .95, .92], [0, .18, .58, .86, .92, .95, .92], [-.9, .18, .6, .88, .93, .96, .93],
    [-1.36, .2, .62, .94, .93, .96, .93], [-1.95, .24, .64, 1, .92, .95, .92], [-2.3, .3, .62, .93, .88, .92, .86], [-2.45, .33, .56, .86, .82, .86, .76],
  ].map(([z, yb, ys, yt, wb, ws, wt]) => [[wb, yb, z], [ws, ys, z], [wt, yt, z], [-wt, yt, z], [-ws, ys, z], [-wb, yb, z]]);
  // the cabin's sides, from the bottom of the windows up to the roof's edge, which runs up the windshield's edge from the hood and down the back window's to the deck
  const SIDE = [[1.05, .9, .92, .9, .92], [.6, .88, .92, 1.06, .78], [-.06, .87, .92, 1.29, .64], [-.66, .88, .93, 1.28, .64], [-1.05, .9, .93, 1.17, .7], [-1.5, .95, .93, 1.09, .76], [-1.92, 1, .92, 1.01, .84]];
  const wall = (z, t) => {
    let i = 0; while (i < SIDE.length - 2 && z < SIDE[i + 1][0]) i++;
    const [z0, yb0, wb0, yt0, wt0] = SIDE[i], [z1, yb1, wb1, yt1, wt1] = SIDE[i + 1], k = (z - z0) / (z1 - z0), l = (a, b) => a + (b - a) * k;
    return [l(wb0, wb1) + (l(wt0, wt1) - l(wb0, wb1)) * t, l(yb0, yb1) + (l(yt0, yt1) - l(yb0, yb1)) * t];
  };
  // a pane of glass across from one side's top edge to the other's, from z0 to z1, lying on it
  const pane = (z0, z1, inset = .02) => loft([z0, z1].map((z) => { const [w, y] = wall(z, 1); return [[w - inset, y + .004, z], [w - inset, y + .022, z], [inset - w, y + .022, z], [inset - w, y + .004, z]]; }), DARK);
  return [
    loft(body),
    box(0, .03, 0, 1.7, .02, 4.4, DARK),
    // the cabin's sides, a little thick, and the glass in them: the door's window and the one behind it, going to a point
    ...both((s) => loft(SIDE.map(([z]) => { const [wb, yb] = wall(z, 0), [wt, yt] = wall(z, 1); return [[s * wb, yb, z], [s * wt, yt, z], [s * (wt - .03), yt, z], [s * (wb - .03), yb, z]]; }))),
    ...both((s) => loft([[.98, .2, .45], [.6, .08, .9], [-.06, .06, .92], [-.66, .06, .9], [-.92, .06, .5], [-1.06, .06, .08]].map(([z, t0, t1]) => {
      const [x0, y0] = wall(z, t0), [x1, y1] = wall(z, t1); return [[s * (x0 + .008), y0, z], [s * (x1 + .008), y1, z], [s * (x1 + .002), y1, z], [s * (x0 + .002), y0, z]];
    }), DARK)),
    // the windshield and the back window, and what's left of the roof between them: over the windshield, over the back window, and the bar down the middle
    pane(1.0, -.04), pane(-.7, -1.9),
    box(0, 1.298, -.11, 1.3, .03, .14), box(0, 1.288, -.63, 1.3, .03, .14), box(0, 1.296, -.37, .2, .03, .4),
    // inside, through where the panels were: the floor, two seats, and the wheel on the driver's side
    box(0, .885, -.05, 1.76, .02, 1.9, DARK), ...both((s) => box(s * .4, 1.1, -.62, .5, .4, .12, SEAT)), ...both((s) => box(s * .4, .93, -.36, .5, .08, .46, SEAT)),
    box(.4, .9, .16, .32, .32, .04, TRIM),
    // mirrors, the doors' seams and handles, and a marker at each corner
    ...both((s) => box(s * .955, .96, .8, .07, .07, .12)),...both((s) => box(s * .957, .55, .92, .006, .6, .02, DARK)), ...both((s) => box(s * .965, .58, -.84, .006, .62, .02, DARK)),
    ...both((s) => box(s * .967, .74, -.66, .006, .03, .12, TRIM)), ...both((s) => box(s * .94, .6, -2.15, .01, .04, .1, TAIL)), ...both((s) => box(s * .915, .5, 2.05, .01, .04, .1, AMBER)),
    // the wheel wells
    ...[1.2, -1.36].flatMap((z) => both((s) => prism([[z - .44, .17], [z - .44, .46], [z - .3, .7], [z, .76], [z + .3, .7], [z + .44, .46], [z + .44, .17]], s * .955, s * .965, DARK))),
    // the front: its lamps, the slot under them and the turn signals
    ...both((s) => box(s * .52, .54, 2.33, .42, .13, .1, DARK)), ...both((s) => box(s * .52, .545, 2.355, .36, .09, .08, LIGHT)), box(0, .32, 2.4, .86, .12, .06, DARK), ...both((s) => box(s * .66, .4, 2.38, .16, .04, .04, AMBER)),
    // the tail: a lamp at each end, the panel between them with the name on it, the plate below, and the wing
    ...both((s) => box(s * .58, .74, -2.452, .3, .12, .02, TAIL)), ...both((s) => box(s * .37, .74, -2.452, .12, .1, .02, AMBER)), box(0, .5, -2.452, .34, .17, .016, DARK),
    box(0, 1.1, -2.18, 1.72, .035, .24), ...both((s) => box(s * .74, 1.03, -2.16, .07, .12, .16)), box(0, 1.122, -2.24, .3, .015, .05, TAIL),
  ];
}
const coupe = camaro91, coupe99 = camaro99;

// A church's passenger van: a tall box with a short nose and windows all the way back. The church's name down each side is drawn over it in index.html.
function van() {
  return [
    prism([[-2.95, .5], [-2.95, 2.04], [-2.84, 2.14], [1.28, 2.14], [1.56, 2], [2.34, 1.3], [2.86, 1.18], [2.95, .94], [2.95, .55], [2.78, .42], [-2.82, .42]], -1.12, 1.12),
    box(0, .03, 0, 2.1, .02, 5.6, DARK),
    // the windshield, the back windows, and a row of windows down each side with the pillars between them
    prism([[1.56, 1.99], [2.31, 1.32], [2.35, 1.34], [1.6, 2.01]], -1, 1, DARK),
    box(0, 1.64, -2.96, 1.86, .52, .02, DARK),
    ...both((s) => box(s * 1.125, 1.64, -.45, .02, .5, 3.9, DARK)),
    ...both((s) => box(s * 1.13, 1.64, -.05, .025, .56, .12)), ...both((s) => box(s * 1.13, 1.64, -1.3, .025, .56, .12)),
    // the side doors on the right. The church's name in index.html goes across them from .64 to 1.36 m up, painted over the gaps, so they stop there, and there's no handle
    // where it'd be read as a dash between the words.
    ...[.2, -1].flatMap((z) => [box(-1.122, .505, z, .01, .27, .04, DARK), box(-1.122, 1.615, z, .01, .51, .04, DARK)]),
    ...arches(1.95, .5, 1.12), ...arches(-1.75, .5, 1.12),
    ...both((s) => box(s * .8, 1.02, 2.94, .42, .22, .06, LIGHT)), ...both((s) => box(s * 1.05, 1.12, -2.96, .1, .42, .04, TAIL)),
    box(0, .84, 2.96, 1.2, .26, .04, DARK), box(0, .54, 2.98, 2.3, .18, .14, TRIM), box(0, .54, -2.98, 2.3, .18, .14, TRIM),
  ];
}

// The outline's hull has to meet at the corners, so its normals are shared wherever two faces touch
export function smoothed(geo) {
  const p = geo.attributes.position, sum = new Map(), key = (i) => `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) { const k = key(i); let s = sum.get(k); if (!s) sum.set(k, s = new THREE.Vector3()); s.x += n.getX(i); s.y += n.getY(i); s.z += n.getZ(i); }
  const out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const s = sum.get(key(i)).clone().normalize(); out[i * 3] = s.x; out[i * 3 + 1] = s.y; out[i * 3 + 2] = s.z; }
  const line = new THREE.BufferGeometry(); line.setAttribute('position', p); line.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return line;
}

export function vehicleGeometries() {
  const out = {};
  for (const [kind, parts] of Object.entries({ car, pickup, quad, golf, coupe, coupe99, van })) { const geo = mergeGeometries(parts()); out[kind] = { geo, line: smoothed(geo) }; }
  // one wheel, a unit across and a unit wide, turning about x
  const wheel = mergeGeometries([painted(new THREE.CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2), TIRE), painted(new THREE.CylinderGeometry(.56, .56, 1.04, 6).rotateZ(Math.PI / 2), HUB)]);
  out.wheel = { geo: wheel, line: smoothed(wheel) };
  return out;
}

// Where the lamps are, on one side: the other's the mirror of it
export const LAMPS = {
  car: { head: [.72, .84, 2.54], tail: [.78, .88, -2.56] },
  pickup: { head: [.78, .98, 2.9], tail: [1.17, 1.12, -2.96] },
  quad: { head: [.24, .82, 1.36], tail: [.22, .8, -1.34] },
  golf: { head: [.52, .66, 1.63], tail: [.5, .62, -1.58] },
  coupe: { head: [.54, .58, 2.33], tail: [.66, .71, -2.24] },
  coupe99: { head: [.52, .545, 2.39], tail: [.58, .74, -2.47] },
  van: { head: [.8, 1.02, 2.98], tail: [1.05, 1.12, -2.99] },
};

// Each one's colour, faded the way paint goes, picked by how it's parked
export const PAINTS = {
  car: ['#8c3a2c', '#3e5874', '#b8b09c', '#44583f', '#7f7a6e', '#2e2b33', '#a5823f', '#642d38'],
  pickup: ['#7d3327', '#2f4a60', '#a8a18f', '#3e5238', '#6b675d', '#8f6a32', '#b5ad98', '#433f45'],
  quad: ['#7a2f24', '#3d5a38', '#a8622a', '#2f3a30'],
  golf: ['#d3cdbd', '#c2bfae', '#b9c4b5'],
  coupe: ['#e6e1d2'],
  coupe99: ['#2f5d48'],
  van: ['#e3dfd3'],
};
