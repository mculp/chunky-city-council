// What vehicles look like: low-poly, built from code, with no real makes or badges. Paint is white here, because each one's own colour multiplies it.
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

// An old T-top: long and low with a fastback, no badge on it, and the two panels out of the roof, so that all that's left up there is the bar down the middle
function coupe() {
  return [
    prism([[-2.42, .5], [-2.44, .9], [-2.2, .98], [.5, .94], [2, .74], [2.42, .6], [2.46, .44], [2.3, .32], [-2.28, .32]], -1.02, 1.02),
    box(0, .03, 0, 1.8, .02, 4.4, DARK),
    box(0, .95, -.7, 1.64, .02, 2.5, DARK),
    // the glass: the windshield, the long back window and the side windows
    prism([[.58, .94], [-.5, 1.48], [-.56, 1.45], [.46, .93]], -.84, .84, DARK),
    prism([[-1.08, 1.48], [-2.18, .99], [-2.06, .98], [-1.04, 1.44]], -.8, .8, DARK),
    ...both((s) => prism([[-2.02, .99], [-1.08, 1.44], [-.56, 1.44], [.44, .98]], s * .86, s * .84, DARK)),
    // what's left of the roof: over the windshield, over the back window, and the bar between them
    box(0, 1.48, -.52, 1.72, .05, .16), box(0, 1.48, -1.08, 1.66, .05, .16), box(0, 1.48, -.8, .22, .05, .56),
    ...both((s) => bar([s * .88, .94, .58], [s * .84, 1.48, -.5], .07)), ...both((s) => bar([s * .86, .98, -.5], [s * .84, 1.48, -.56], .06)), ...both((s) => bar([s * .86, 1, -2.08], [s * .82, 1.48, -1.08], .12)),
    // two seats you can see from above, and the wheel
    ...both((s) => box(s * .42, 1.14, -.92, .56, .46, .12, SEAT)), ...both((s) => box(s * .42, .94, -.62, .56, .1, .56, SEAT)),
    box(.42, 1.08, .02, .34, .34, .04, TRIM),
    ...arches(1.45, .46, 1.02), ...arches(-1.4, .46, 1.02),
    // a slot of a grille, low lamps in the nose, red all the way across the tail, and a lip of a spoiler
    box(0, .48, 2.47, 1.3, .1, .04, DARK), ...both((s) => box(s * .66, .62, 2.41, .46, .09, .05, LIGHT)),
    box(0, .78, -2.46, 1.84, .12, .04, TAIL), box(0, 1.04, -2.3, 1.86, .04, .26), ...both((s) => box(s * .78, 1, -2.3, .06, .08, .14)),
    box(0, .42, 2.42, 2.04, .14, .12, TRIM), box(0, .42, -2.42, 2.04, .14, .12, TRIM),
    ...both((s) => box(s * 1.022, .68, -.1, .01, .4, .04, DARK)), ...both((s) => box(s * 1.022, .68, -1.3, .01, .4, .04, DARK)),
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
  for (const [kind, parts] of Object.entries({ car, pickup, quad, golf, coupe })) { const geo = mergeGeometries(parts()); out[kind] = { geo, line: smoothed(geo) }; }
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
  coupe: { head: [.66, .62, 2.46], tail: [.7, .78, -2.5] },
};

// Each one's colour, faded the way paint goes, picked by how it's parked
export const PAINTS = {
  car: ['#8c3a2c', '#3e5874', '#b8b09c', '#44583f', '#7f7a6e', '#2e2b33', '#a5823f', '#642d38'],
  pickup: ['#7d3327', '#2f4a60', '#a8a18f', '#3e5238', '#6b675d', '#8f6a32', '#b5ad98', '#433f45'],
  quad: ['#7a2f24', '#3d5a38', '#a8622a', '#2f3a30'],
  golf: ['#d3cdbd', '#c2bfae', '#b9c4b5'],
  coupe: ['#e6e1d2'],
};
