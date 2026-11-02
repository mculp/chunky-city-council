// What things look like when they aren't vehicles: low-poly, built from code, with no real makes or badges, the same way as src/vehiclemodels.js.
// A thing's own axes: +z is its front, +x is to its left, y is up, and its origin is on the floor under its middle. Each returns a list of geometries to merge.
import * as THREE from 'three';
import { painted, box, bar, both } from './vehiclemodels.js';

const BLACK = '#17131c', TOLEX = '#1d1a1e', GRILLE = '#3b3640', STEEL = '#7c7b80', CREAM = '#d8d2bd', BRASS = '#b58d38', WOOD = '#6e5238', PALE = '#b9ad92';

const moved = (parts, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) => parts.map((g) => g.clone().rotateX(rx).rotateZ(rz).rotateY(ry).translate(x, y, z));
const cyl = (x, y, z, r, h, color, n = 10, r2 = r) => painted(new THREE.CylinderGeometry(r, r2, h, n).translate(x, y, z), color);
// the same lying along z, or along x
const cylZ = (x, y, z, r, h, color, n = 10) => painted(new THREE.CylinderGeometry(r, r, h, n).rotateX(Math.PI / 2).translate(x, y, z), color);
const cylX = (x, y, z, r, h, color, n = 10) => painted(new THREE.CylinderGeometry(r, r, h, n).rotateZ(Math.PI / 2).translate(x, y, z), color);
// a pole on three splayed feet
const tripod = (x, z, top, color = STEEL, w = .025) => [bar([x, 0, z], [x, top, z], w, color), ...[0, 2.1, 4.2].map((a) => bar([x, .32, z], [x + Math.cos(a) * .24, .01, z + Math.sin(a) * .24], w, color))];

export function drumKit() {
  const SHELL = '#7f2c22', HOOP = '#a9a89e', drum = (x, y, z, r, h, rx = 0, rz = 0) => moved([cyl(0, 0, 0, r, h, SHELL, 12), cyl(0, h / 2 + .006, 0, r * 1.02, .018, CREAM, 12), cyl(0, -h / 2 - .006, 0, r * 1.02, .018, HOOP, 12)], { x, y, z, rx, rz });
  const cymbal = (x, y, z, r, rx = 0, rz = 0, color = BRASS) => moved([cyl(0, 0, 0, r, .012, color, 14, r * .98), cyl(0, .014, 0, r * .16, .02, color, 8)], { x, y, z, rx, rz });
  return [
    // the bass drum, with its head to the room, and the two toms mounted on it
    cylZ(0, .36, 0, .36, .42, SHELL, 14), cylZ(0, .36, .215, .37, .018, CREAM, 14), cylZ(0, .36, -.215, .37, .018, HOOP, 14), cylZ(0, .36, .226, .12, .004, '#2b2628', 10),
    ...both((s) => bar([s * .24, .12, .16], [s * .34, 0, .3], .02, STEEL)),
    ...drum(-.17, .88, -.02, .15, .15, .32, .1), ...drum(.17, .88, -.02, .16, .17, .32, -.1), bar([0, .7, 0], [0, .82, 0], .04, STEEL),
    // the snare on its stand, the floor tom on its legs, and the stool
    ...tripod(-.34, -.42, .56), ...drum(-.34, .62, -.42, .18, .12, .1), ...drum(.56, .46, -.32, .22, .36),
    ...[[.74, -.2], [.4, -.18], [.56, -.52]].map(([x, z]) => bar([x, .36, z], [x, 0, z], .02, STEEL)),
    cyl(0, .5, -.92, .17, .07, '#26222a', 10), bar([0, .46, -.92], [0, .02, -.92], .04, STEEL), cyl(0, .02, -.92, .2, .03, STEEL, 8),
    // the hi-hat and two more cymbals
    ...tripod(-.74, -.2, .92), ...cymbal(-.74, .9, -.2, .18), ...cymbal(-.74, .925, -.2, .18),
    ...tripod(-.52, .34, 1.32), ...cymbal(-.52, 1.34, .34, .24, .18, .12),
    ...tripod(.74, .16, 1.22), ...cymbal(.74, 1.24, .16, .28, .14, -.14),
  ];
}
// on a stand, leaning back
export function guitar(body = '#b5472a', neck = '#a07a4a', long = 1) {
  const up = .62 * long;
  return [
    ...moved([
      cylZ(0, .34, 0, .2, .05, body, 12), cylZ(0, .58, 0, .135, .05, body, 12), box(0, .46, 0, .25, .18, .05, body),
      box(0, .73 + up / 2, 0, .05, up, .03, neck), box(0, .77 + up, 0, .075, .16, .025, '#2a2226'),
      // the neck carries on down the body to the bridge, with the pickups and the knobs either side of it
      box(0, .5, .027, .05, .36, .006, neck), box(0, .46, .03, .1, .035, .012, CREAM), box(0, .36, .03, .1, .035, .012, CREAM), box(0, .27, .03, .09, .025, .012, STEEL),
      cylZ(.12, .28, .03, .016, .012, BLACK, 6), cylZ(.08, .22, .03, .016, .012, BLACK, 6),
    ], { rx: -.16, z: -.02 }),
    ...tripod(0, -.09, .62, BLACK, .018), bar([-.12, .2, .02], [.12, .2, .02], .02, BLACK),
  ];
}
// a combo, or a cabinet with a head on it
export function amp(w = .62, h = .5, d = .27, color = TOLEX) {
  return [
    box(0, h / 2 + .015, 0, w, h, d, color), box(0, h * .42 + .015, d / 2 + .003, w - .07, h * .72, .008, GRILLE), box(0, h * .91 + .015, d / 2 + .003, w - .05, h * .12, .01, CREAM),
    ...[-.2, -.1, 0, .1, .2].map((t) => cylZ(t * w, h * .91 + .015, d / 2 + .012, .014, .02, BLACK, 6)),
    bar([-w * .18, h + .04, 0], [w * .18, h + .04, 0], .025, BLACK),
  ];
}
export function ampStack() {
  return [...amp(.78, .78, .36), ...moved(amp(.72, .28, .28, '#222024'), { y: .8, z: -.02 })];
}
export function keyboard() {
  const keys = [];
  for (let i = 0; i < 26; i++) if (i % 7 !== 2 && i % 7 !== 6) keys.push(box(-.57 + i * .0465, .892, .05, .022, .02, .1, BLACK));
  return [
    box(0, .82, 0, 1.3, .09, .34, '#231f26'), box(0, .868, .07, 1.22, .012, .17, '#e6e0cf'), ...keys, box(0, .872, -.1, 1.22, .016, .1, '#2e2a32'),
    box(.46, .884, -.1, .1, .008, .05, '#6fd6c8'), ...[-.4, -.3, -.2].map((x) => cyl(x, .886, -.1, .014, .012, CREAM, 6)),
    // the X it stands on
    ...both((s) => [bar([s * .36, .78, -.14], [s * .36, 0, .16], .025, STEEL), bar([s * .36, .78, .14], [s * .36, 0, -.16], .025, STEEL)]).flat(),
  ];
}
export function micStand() {
  return [...tripod(0, 0, 1.42, STEEL, .018), bar([0, 1.42, 0], [0, 1.5, .1], .018, STEEL), cyl(0, 1.54, .13, .03, .09, '#3a3840', 8)];
}
export function stool(top = '#2a262c') {
  return [cyl(0, .55, 0, .17, .05, top, 10), ...[0, 2.1, 4.2].map((a) => bar([Math.cos(a) * .1, .54, Math.sin(a) * .1], [Math.cos(a) * .2, 0, Math.sin(a) * .2], .025, STEEL))];
}
export function couch(color = '#5a3f33') {
  return [
    box(0, .26, 0, 2, .3, .85, color), box(0, .62, -.34, 2, .5, .2, color), ...both((s) => box(s * .92, .44, 0, .2, .4, .85, color)),
    ...both((s) => box(s * .42, .44, .06, .78, .1, .66, '#6b4e3f')), box(.4, .47, .1, .5, .12, .4, '#7f2c22'),
  ];
}
// the three legs of an easel and the ledge a canvas stands on: the canvas is its own
export function easel() {
  return [
    ...both((s) => bar([s * .34, 0, .16], [s * .03, 1.85, -.02], .04, WOOD)), bar([0, 0, -.42], [0, 1.72, -.03], .04, WOOD),
    box(0, .72, .13, .86, .035, .1, WOOD), bar([-.2, .96, .06], [.2, .96, .06], .025, WOOD),
  ];
}
export function workbench(long = 2.6) {
  const pots = [];
  for (let i = 0; i < 7; i++) {
    const x = -long / 2 + .25 + i * (long - .5) / 6, tone = ['#b5472a', '#d9c9a0', '#3a7a78', '#c89a3a', '#7a2f3c', '#56507a', '#e0dccf'][i];
    if (i % 2) pots.push(cyl(x, .99, -.1 + (i % 3) * .08, .07, .15, tone, 8), cyl(x, 1.07, -.1 + (i % 3) * .08, .072, .012, '#8a8880', 8));
    else pots.push(cyl(x, .97, .06, .05, .12, '#a8b8b4', 6), bar([x, .98, .06], [x + .03, 1.2, .08], .012, WOOD), bar([x, .98, .06], [x - .04, 1.22, .03], .012, WOOD));
  }
  return [box(0, .88, 0, long, .06, .7, '#6a5238'), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => box(a * (long / 2 - .08), .43, b * .28, .07, .86, .07, '#4f3c2a')), box(0, .3, 0, long - .2, .04, .56, '#4f3c2a'), ...pots];
}
// a film projector, with two reels up top, on a little table
export function projector() {
  return [
    box(0, .4, 0, .5, .8, .5, CREAM), box(0, .8, 0, .56, .04, .56, CREAM),
    box(0, .98, 0, .22, .32, .44, '#37343a'), cylZ(0, 1, .28, .06, .14, '#1a171c', 8),
    ...[-.2, .2].map((z) => cylX(0, 1.27, z, .19, .03, '#55535a', 12)), ...[-.2, .2].map((z) => cylX(0, 1.27, z, .05, .05, BLACK, 6)),
  ];
}
export function excavator() {
  const YEL = '#d6a321', DEEP = '#a87c17';
  return [
    ...both((s) => [box(s * .62, .24, 0, .34, .34, 1.7, '#18151a'), cylX(s * .62, .24, .85, .17, .34, '#18151a', 8), cylX(s * .62, .24, -.85, .17, .34, '#18151a', 8)]).flat(),
    box(0, .3, 0, .9, .16, 1.3, '#26222a'), box(0, .28, 1.28, 1.5, .34, .1, YEL), ...both((s) => bar([s * .5, .28, 1.24], [s * .5, .3, .7], .06, DEEP)),
    box(0, .66, -.08, 1.26, .36, 1.4, YEL), box(0, .68, -.78, 1.2, .44, .3, DEEP),
    box(-.24, 1.32, -.12, .74, .98, .9, '#1a2227'), box(-.24, 1.84, -.12, .88, .07, 1.06, YEL), ...both((s) => bar([-.24 + s * .4, .85, .36], [-.24 + s * .4, 1.82, .36], .05, YEL)),
    bar([.36, .85, .48], [.36, 1.72, 1.42], .17, YEL), bar([.36, 1.72, 1.42], [.36, .78, 2.26], .12, DEEP), bar([.36, 1.1, .85], [.36, 1.72, 1.32], .06, STEEL),
    box(.36, .5, 2.42, .46, .44, .36, '#2c2823'),
  ];
}
export function propaneTank() {
  const TANK = '#d7d4c8', round = (x) => painted(new THREE.SphereGeometry(.42, 10, 6).translate(x, .62, 0), TANK);
  return [cylX(0, .62, 0, .42, 1.3, TANK, 12), round(-.65), round(.65), ...both((s) => box(s * .42, .12, 0, .1, .24, .7, '#6a6860')), box(0, 1.08, 0, .34, .1, .3, TANK), box(0, 1.14, 0, .18, .06, .16, '#8a8880')];
}
export function hotTub() {
  return [painted(new THREE.CylinderGeometry(1.05, 1.08, .82, 8).rotateY(Math.PI / 8).translate(0, .41, 0), '#4c3a30'), painted(new THREE.CylinderGeometry(1, 1.05, .1, 8).rotateY(Math.PI / 8).translate(0, .87, 0), '#2a262c'), box(0, .92, 0, 2, .012, .05, '#16131a')];
}
// A long pale boat with a point at each end, turned over or not, that isn't made of boxes
export function boat(long = 4.2, wide = .9, color = '#d3cdb9') {
  const pos = [], N = 10, stations = [];
  for (let i = 0; i <= N; i++) { const t = i / N * 2 - 1, w = wide / 2 * Math.pow(1 - t * t, .6); stations.push([t * long / 2, w]); }
  const hi = .42, low = .05;
  for (let i = 0; i < N; i++) {
    const [z0, w0] = stations[i], [z1, w1] = stations[i + 1];
    for (const s of [1, -1]) pos.push(s * w0, hi, z0, s * w1, hi, z1, 0, low, z1, s * w0, hi, z0, 0, low, z1, 0, low, z0);
    pos.push(-w0, hi, z0, w0, hi, z0, w1, hi, z1, -w0, hi, z0, w1, hi, z1, -w1, hi, z1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.index = null;
  return [painted(g, color), box(0, .43, -.5, wide * .8, .03, .22, WOOD), box(0, .43, .6, wide * .78, .03, .22, WOOD), box(0, .434, 0, wide * .3, .012, long * .6, '#2a2620')];
}
export function crate(w = .8, h = .6, d = .6, color = PALE) {
  return [box(0, h / 2, 0, w, h, d, color), box(0, h, 0, w + .03, .03, d + .03, '#8a7f66'), ...both((s) => box(s * (w / 2 + .004), h / 2, 0, .012, h, .06, '#8a7f66'))];
}
