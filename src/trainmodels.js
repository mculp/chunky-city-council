// What a train looks like: low-poly, built from code, with no railroad's name or colours on any of it. Paint is white here, because each car's own colour multiplies it,
// and it's the only pure white in the vertices, so it's what rusts. A car's own axes: +z is the way it's going, +x is the engineer's left, and its origin's on top of the rail under its middle.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, bar, prism, painted, smoothed } from './vehiclemodels.js';

const DARK = '#17131c', TRIM = '#34313a', GREASE = '#100e14', RIM = '#4d4a52', GLASS = '#5d7d86', LIGHT = '#f3e8b4', WARN = '#ec803a', RAILING = '#b09238', TAIL = '#8a1a14';
const both = (fn) => [fn(1), fn(-1)];
const wheels = (z, r = .46) => both((s) => painted(new THREE.CylinderGeometry(r, r, .13, 8).rotateZ(Math.PI / 2).translate(s * .8, r, z), RIM));
// A set of wheels that turns under the car: a frame down each side, with its axles
function truck(z, axles, spread) {
  const parts = [box(0, .78, z, .7, .34, 1), box(0, .95, z, 2.5, .2, .5, GREASE), ...both((s) => box(s * .95, .6, z, .14, .42, spread * (axles - 1) + 1, DARK))];
  for (let i = 0; i < axles; i++) parts.push(...wheels(z + (i - (axles - 1) / 2) * spread));
  return parts;
}
const couplers = (end) => both((s) => box(0, 1.05, s * end, .34, .3, .9, DARK));

// A road locomotive: a long hood behind the cab and a short one in front, a walkway all round, and the warning stripes on the nose
function loco() {
  return [
    box(0, 1.32, 0, 3.1, .26, 19.9, TRIM), box(0, .88, 0, 2.4, .66, 6.2, GREASE),
    ...truck(6.65, 3, 1.75), ...truck(-6.65, 3, 1.75),
    // the long hood, with its louvers and fans
    box(0, 2.75, -3.1, 2.12, 2.6, 13.2), box(0, 4.1, -3.1, 1.7, .1, 12.8, TRIM),
    ...both((s) => box(s * 1.075, 3.3, -8, .04, 1.2, 2.8, GREASE)), ...both((s) => box(s * 1.075, 2.55, -2.2, .04, .9, 7.4, TRIM)),
    ...[-8.4, -6.4, -4.4].map((z) => painted(new THREE.CylinderGeometry(.58, .58, .1, 8).translate(0, 4.2, z), GREASE)),
    box(0, 4.32, -.2, .56, .36, 1.1, GREASE),
    // the cab
    box(0, 2.95, 5.2, 3, 3, 3.2), box(0, 4.52, 5.2, 3.14, .14, 3.5, TRIM),
    box(0, 3.72, 6.82, 2.5, .82, .04, GLASS), box(0, 3.72, 3.58, 2.5, .82, .04, GLASS), ...both((s) => box(s * 1.515, 3.72, 5.2, .04, .82, 2.3, GLASS)),
    bar([.2, 4.68, 4.8], [.8, 4.68, 4.8], .12, TRIM), bar([-.2, 4.68, 5.2], [-.8, 4.68, 5.2], .12, TRIM),
    // the short hood, and the front of it
    box(0, 2.35, 8.3, 2, 1.8, 3), box(0, 2.35, 9.82, 2.02, 1.82, .08, WARN),
    ...both((s) => bar([s * .98, 1.5, 9.88], [0, 3.22, 9.88], .17, DARK)),
    box(0, 3.4, 9.7, .78, .34, .22, DARK), box(0, 3.4, 9.84, .56, .2, .04, LIGHT),
    ...both((s) => box(s * 1.05, 1.62, 10.08, .24, .24, .08, LIGHT)),
    box(0, .92, 10.02, 3.1, 1, .3, WARN), ...both((s) => bar([s * 1.5, .46, 10.02], [s * .55, 1.38, 10.2], .2, DARK)), box(0, .9, 10.2, .4, .3, .5, DARK),
    box(0, 1.3, -10, 3.1, .5, .3, WARN),
    // what's along the sides
    ...both((s) => box(s * 1.09, 2.05, -3.1, .02, .22, 13, WARN)),
    ...both((s) => bar([s * 1.5, 2.42, -9.9], [s * 1.5, 2.42, 3.4], .05, RAILING)), ...both((s) => bar([s * 1.5, 2.42, 7], [s * 1.5, 2.42, 10], .05, RAILING)),
    ...[-9.9, -6, -2, 2, 7, 10].flatMap((z) => both((s) => bar([s * 1.5, 1.45, z], [s * 1.5, 2.42, z], .05, RAILING))),
  ];
}
// A boxcar: ribbed, with a door on each side
function boxcar() {
  const ribs = [];
  for (let z = -7; z <= 7; z += 1.75) if (Math.abs(z) > 2) ribs.push(...both((s) => box(s * 1.61, 2.75, z, .04, 3, .1, TRIM)));
  return [
    box(0, 1.14, 0, 3, .3, 15.4, TRIM), ...truck(5.6, 2, 1.7), ...truck(-5.6, 2, 1.7), ...couplers(7.7),
    box(0, 2.8, 0, 3.2, 3.1, 15.3), box(0, 4.42, 0, 3.08, .16, 15.2, TRIM), ...ribs,
    ...both((s) => box(s * 1.63, 2.72, 0, .05, 2.8, 3, '#5a564e')), ...both((s) => box(s * 1.65, 2.72, -1.45, .05, 2.8, .12, TRIM)), ...both((s) => box(s * 1.66, 4.22, 0, .05, .1, 6.2, TRIM)),
    ...both((s) => box(s * .9, 2.8, -7.68, .06, 3, .06, TRIM)), ...both((s) => box(s * .9, 2.8, 7.68, .06, 3, .06, TRIM)),
    ...both((s) => bar([s * 1.62, 1.3, 7.2], [s * 1.62, 3.9, 7.2], .05, RAILING)),
  ];
}
// A covered hopper: sloped pockets underneath, and a hatch along the top
function hopper() {
  const ribs = [];
  for (const z of [-5.2, -2.6, 0, 2.6, 5.2]) ribs.push(...both((s) => box(s * 1.57, 3.05, z, .04, 1.9, .12, TRIM)));
  return [
    prism([[-6.6, 2.1], [-6.6, 4.05], [6.6, 4.05], [6.6, 2.1], [5.1, 1.15], [2.9, 2.1], [0, 1.15], [-2.9, 2.1], [-5.1, 1.15]], -1.55, 1.55),
    box(0, 1.25, 0, .6, .36, 13.4, TRIM), box(0, 4.14, 0, .9, .14, 12.4, TRIM), ...ribs,
    ...truck(4.9, 2, 1.7), ...truck(-4.9, 2, 1.7), ...couplers(6.7),
    ...both((s) => box(0, 1.4, s * 6.5, 2.9, .12, 1, TRIM)),
    ...both((s) => bar([s * 1.2, 1.5, 6.9], [s * 1.2, 3.9, 6.72], .05, RAILING)),
  ];
}
// A tank car: a long drum, with a dome on top and a walkway round the dome
function tank() {
  const drum = new THREE.CylinderGeometry(1.42, 1.42, 13, 10).rotateX(Math.PI / 2).translate(0, 2.8, 0);
  return [
    painted(drum, '#ffffff'),
    ...both((s) => painted(new THREE.ConeGeometry(1.42, .8, 10).rotateX(s * Math.PI / 2).translate(0, 2.8, s * 6.9), '#ffffff')),
    ...[-6.45, -2.2, 2.2, 6.45].map((z) => painted(new THREE.CylinderGeometry(1.45, 1.45, .1, 10).rotateX(Math.PI / 2).translate(0, 2.8, z), TRIM)),
    painted(new THREE.CylinderGeometry(.44, .5, .42, 8).translate(0, 4.36, 0), TRIM), box(0, 4.14, 0, 1.3, .06, 1.3, TRIM),
    box(0, 1.28, 0, .7, .36, 14.8, TRIM), ...truck(5.3, 2, 1.7), ...truck(-5.3, 2, 1.7), ...couplers(7.45),
    ...both((s) => box(0, 1.44, s * 7.2, 2.9, .1, 1, TRIM)),
    ...both((s) => bar([s * 1.45, 1.5, -5], [s * 1.45, 3.1, -5], .05, RAILING)), ...both((s) => bar([s * 1.45, 1.5, 5], [s * 1.45, 3.1, 5], .05, RAILING)), ...both((s) => bar([s * 1.45, 3.1, -5], [s * 1.45, 3.1, 5], .05, RAILING)),
  ];
}

// All of them, each as what's drawn and a smoothed copy for its line
export function trainGeometries() {
  const out = {};
  for (const [kind, parts] of Object.entries({ loco, box: boxcar, hopper, tank })) { const geo = mergeGeometries(parts()); out[kind] = { geo, line: smoothed(geo) }; }
  return out;
}
// Where the lights are on a locomotive, and the red one that hangs on the last car
export const TRAIN_LAMPS = { head: [0, 3.4, 9.92], ditch: [1.05, 1.62, 10.16], tail: [.9, 2.4] };

// A gate arm, a unit long along +x from its pivot, in red and white, so that stretching it only makes the bands longer
export function gateArm() {
  const parts = [], n = 7;
  for (let i = 0; i < n; i++) parts.push(box((i + .5) / n, 0, 0, 1 / n, .1, .07, i % 2 ? '#b9b3a4' : '#b0271f'));
  const geo = mergeGeometries(parts);
  return { geo, line: smoothed(geo) };
}
