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
// a bench hung on chains from an A-frame of its own, the way one stands out on a deck
export function porchSwing(seat = '#8a6a48') {
  return [
    ...both((s) => [bar([s * 1.2, 0, -.6], [s * 1.2, 2.15, 0], .08, WOOD), bar([s * 1.2, 0, .6], [s * 1.2, 2.15, 0], .08, WOOD), bar([s * 1.2, .5, -.45], [s * 1.2, .5, .45], .05, WOOD)]).flat(),
    box(0, 2.19, 0, 2.62, .1, .12, WOOD),
    ...both((s) => [bar([s * .72, 2.14, 0], [s * .72, .52, .2], .015, STEEL), bar([s * .72, 2.14, 0], [s * .72, .62, -.22], .015, STEEL)]).flat(),
    box(0, .48, 0, 1.5, .07, .5, seat), box(0, .74, -.25, 1.5, .44, .06, seat), ...both((s) => box(s * .74, .62, 0, .06, .18, .48, seat)),
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
// A round bale lying on its side, weathered grey on the outside, with the straw showing at the ends
export function roundBale(r = .72, long = 1.25) {
  return [cylX(0, r, 0, r, long, '#8f8460', 12), cylX(long / 2 + .005, r, 0, r * .82, .02, '#b09a5e', 12), cylX(-long / 2 - .005, r, 0, r * .82, .02, '#a48f58', 12)];
}
// A plain old farm tractor with no make on it: big wheels behind, little ones in front, a long hood and a seat in the open
export function tractor(color = '#3e6b38') {
  const TYRE = '#17151a', RIM = '#c9b14a';
  return [
    ...both((s) => [cylX(s * .72, .68, -.62, .68, .34, TYRE, 14), cylX(s * .9, .68, -.62, .3, .02, RIM, 10), cylX(s * .52, .34, 1.12, .34, .16, TYRE, 12), cylX(s * .61, .34, 1.12, .15, .02, RIM, 8)]).flat(),
    box(0, .92, .32, .46, .5, 1.5, color), box(0, 1.22, .34, .42, .12, 1.42, color), box(0, .6, .3, .3, .24, 1.7, '#24211f'), box(0, .94, 1.08, .46, .46, .04, '#2a2a24'),
    box(0, .82, -.56, .62, .3, .62, '#2a2826'), ...both((s) => box(s * .46, 1.42, -.62, .36, .06, .9, color)), box(0, 1.18, -.72, .36, .08, .32, '#1c1a1c'), box(0, 1.42, -.9, .36, .42, .06, '#1c1a1c'),
    bar([.14, 1.28, .78], [.14, 1.96, .78], .05, '#1c1a1c'), bar([0, 1.1, -.26], [0, 1.5, -.1], .03, '#1c1a1c'), box(0, 1.51, -.09, .3, .03, .03, '#1c1a1c'),
  ];
}
// A little two-wheeled trailer with low white sides
export function utilityTrailer() {
  return [box(0, .62, -.25, 1.3, .08, 2.3, '#55524c'), ...both((s) => [box(s * .63, .86, -.25, .05, .42, 2.3, '#c9c8bf'), cylX(s * .72, .32, -.25, .32, .16, '#17151a', 10)]).flat(), box(0, .86, -1.38, 1.3, .42, .05, '#c9c8bf'), box(0, .86, .88, 1.3, .42, .05, '#c9c8bf'), bar([-.4, .6, .9], [0, .44, 1.9], .06, '#55524c'), bar([.4, .6, .9], [0, .44, 1.9], .06, '#55524c')];
}
// A farm dump trailer gone to rust: a steel tub on two axles, with an A-frame tongue to the front and the ram that tips it under the tub
export function dumpTrailer(color = '#7e3a26') {
  const DARK = '#5a291b', RUST = '#a3542c', IRON = '#2b2522';
  return [
    box(0, .78, -.2, 1.9, .06, 3.4, DARK), ...both((s) => [box(s * .92, 1.08, -.2, .06, .6, 3.4, color), box(s * .94, 1.4, -.2, .1, .06, 3.44, DARK), box(s * .955, .98, .35, .01, .34, .8, RUST), box(s * .955, 1.18, -1.2, .01, .2, .5, RUST)]).flat(),
    box(0, 1.14, 1.47, 1.9, .72, .06, color), box(0, 1.05, -1.87, 1.9, .54, .06, color), box(0, 1.34, -1.9, 1.94, .06, .1, DARK),
    ...both((s) => [box(s * .5, .62, -.1, .12, .14, 3.6, IRON), box(s * .98, .78, -.15, .26, .05, 1.5, DARK), ...[-.55, .25].flatMap((z) => [cylX(s * .98, .36, z, .36, .2, '#17151a', 12), cylX(s * 1.09, .36, z, .14, .02, '#6a6660', 8)])]).flat(),
    ...both((s) => bar([s * .5, .6, 1.5], [0, .5, 2.6], .07, IRON)), box(0, .5, 2.65, .12, .1, .22, IRON), bar([.22, .62, 2.05], [.22, 0, 2.05], .05, IRON), bar([0, .6, 1.25], [0, .74, .3], .07, '#3a3836'),
  ];
}
// An old disc harrow, rusted: four gangs of dished discs on a square frame, two angled one way in front and two the other way behind, and an A-frame hitch
export function discHarrow(color = '#7a3f25') {
  const FRAME = '#4f3022', UP = new THREE.Vector3(0, 1, 0);
  // discs along a shaft from a to b, each square to it
  const gang = (a, b, n) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), q = new THREE.Quaternion().setFromUnitVectors(UP, B.clone().sub(A).normalize()), out = [bar(a, b, .04, FRAME)];
    for (let i = 0; i < n; i++) { const p = A.clone().lerp(B, (i + .5) / n); out.push(painted(new THREE.CylinderGeometry(.27, .2, .04, 12).applyQuaternion(q).translate(p.x, p.y, p.z), color)); }
    return out;
  };
  return [
    box(0, .66, .72, 2.6, .1, .1, FRAME), box(0, .66, -.72, 2.6, .1, .1, FRAME), ...both((s) => box(s * 1.25, .66, 0, .1, .1, 1.54, FRAME)),
    ...both((s) => [...gang([s * 1.2, .3, .52], [s * .06, .3, .3], 5), ...gang([s * 1.2, .3, -.4], [s * .06, .3, -.62], 5), bar([s * .7, .66, .72], [s * .7, .3, .42], .05, FRAME), bar([s * .7, .66, -.72], [s * .7, .3, -.5], .05, FRAME)]).flat(),
    ...both((s) => bar([s * .62, .66, .72], [0, .56, 1.8], .06, FRAME)), box(0, .56, 1.85, .12, .1, .2, FRAME),
  ];
}
// Logs stacked to dry, lying along x: four on the ground and three in the grooves between them, each a little longer or shorter, with their cut ends showing
export function logPile(bark = '#5a4330', cut = '#b89a6e') {
  const LOGS = [[-.78, .26, .26, 5.6, .2], [-.26, .24, .24, 6, -.3], [.24, .27, .27, 5.2, .1], [.76, .23, .23, 5.8, -.15], [-.52, .65, .22, 5.4, .35], [-.02, .67, .25, 4.8, -.2], [.5, .64, .21, 5, .05]];
  return LOGS.flatMap(([z, y, r, long, dx]) => [cylX(dx, y, z, r, long, bark, 9), cylX(dx + long / 2 + .01, y, z, r * .9, .02, cut, 9), cylX(dx - long / 2 - .01, y, z, r * .9, .02, cut, 9)]);
}
// A front-load dumpster with two black lids, pockets in its sides for the truck's forks, and a plain white label on its front
export function dumpster(color = '#1f3554') {
  const DARK = '#16253c';
  return [
    box(0, .66, 0, 1.9, 1.16, 1.25, color), box(0, 1.27, 0, 1.96, .06, 1.31, DARK), ...both((s) => [box(s * .48, 1.32, -.02, .92, .05, 1.27, '#1a1a1e'), box(s * .99, .86, 0, .06, .2, .9, DARK), box(s * .75, .05, 0, .12, .1, 1.22, DARK)]).flat(),
    box(0, .8, .63, .72, .34, .01, '#e8e6e0'),
  ];
}
// A low timber skid: two long runners with their ends cut up at the front, and planks across them
export function skid(long = 6, color = '#7d7466') {
  const n = Math.round(long / .3);
  return [
    ...both((s) => [box(s * .55, .13, -.15, .2, .26, long - .3, color), bar([s * .55, .13, long / 2 - .3], [s * .55, .3, long / 2], .2, color)]).flat(),
    ...Array.from({ length: n }, (_, i) => box(0, .29, -long / 2 + .2 + i * (long - .5) / (n - 1), 1.4, .05, .22, i % 3 ? color : '#6b6356')),
  ];
}
// A galvanised feed bin on legs with a cone for a top and a cone for a bottom
export function feedBin(color = '#a9acab') {
  return [...[[-.9, -.9], [.9, -.9], [-.9, .9], [.9, .9]].map(([x, z]) => bar([x, 0, z], [x * .9, 1.7, z * .9], .09, '#6c6e6e')), painted(new THREE.CylinderGeometry(1.3, .22, 1.1, 12).translate(0, 1.6, 0), '#8e9190'), cyl(0, 3.3, 0, 1.3, 2.3, color, 14), painted(new THREE.ConeGeometry(1.34, .8, 14).translate(0, 4.85, 0), '#bcbfbe'), box(0, 5.3, 0, .36, .1, .36, '#7c7e7e')];
}
// A round steel stock tank
export function stockTank(r = 1.1) {
  return [cyl(0, .32, 0, r, .64, '#7c8083', 16), cyl(0, .6, 0, r * .92, .06, '#2a2c2c', 16)];
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
// A net with nothing but a post at each end, `wide` between them, and a guy rope off each, and somebody's cap on one post. The net's along x.
export function volleyNet(wide = 9.6, high = 2.35) {
  const top = high - .03, bottom = high - .95, cord = '#26222a', W = wide / 2 - .05, parts = [];
  for (const s of [-1, 1]) parts.push(cyl(s * wide / 2, high / 2 + .05, 0, .045, high + .1, STEEL, 8), bar([s * wide / 2, high - .1, 0], [s * (wide / 2 + 1.5), 0, 0], .018, PALE));
  parts.push(...moved(cap(), { x: -wide / 2, y: high + .1 }));
  parts.push(box(0, top, 0, wide, .06, .012, CREAM), box(0, bottom, 0, wide, .05, .012, CREAM));
  for (let y = bottom + .19; y < top - .05; y += .19) parts.push(box(0, y, 0, wide, .012, .008, cord));
  for (let x = -W; x <= W; x += .32) parts.push(box(x, (top + bottom) / 2, 0, .012, top - bottom, .008, cord));
  return parts;
}
// One you can really jump on. It's round, with a pad round the edge, and legs.
export function trampoline(r = 2.3, high = .85) {
  const PAD = '#34506e', parts = [cyl(0, high - .02, 0, r - .16, .03, '#18151b', 18), cyl(0, high - .05, 0, r, .07, PAD, 18)];
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, c = Math.cos(a) * (r - .1), s = Math.sin(a) * (r - .1); parts.push(bar([c, high - .08, s], [c * 1.04, 0, s * 1.04], .05, STEEL)); }
  return parts;
}
// It stands on its knob. There's tape on the grip.
export function bat(color = '#a9793f', tape = '#a82a2a') {
  return [
    cyl(0, .02, 0, .03, .04, color, 8), cyl(0, .16, 0, .02, .24, tape, 6, .021), cyl(0, .42, 0, .027, .28, color, 6, .02), cyl(0, .68, 0, .034, .26, color, 8, .027), cyl(0, .82, 0, .03, .03, color, 8, .034),
  ];
}
// ---- a frog, sitting, of the kinds in the ditches here, each with what tells it from the others. `size` is how long it is from its nose to its back end.
const blob = (x, y, z, rx, ry, rz, color, n = 8) => painted(new THREE.SphereGeometry(1, n, Math.max(4, Math.round(n * .6))).scale(rx, ry, rz).translate(x, y, z), color);
export const FROG_KINDS = {
  bullfrog: { body: '#5f6b34', head: '#6f8a3c', belly: '#d3c996', ears: '#4b4628' },
  'green treefrog': { body: '#5fa63a', belly: '#e6dfbd', stripe: '#ece4ba' },
  'gray treefrog': { body: '#8a8e86', belly: '#d8d3bf', mottle: '#585d56', under: '#e6a22b' },
  'southern leopard frog': { body: '#7a9947', belly: '#dcd7bc', spots: '#2b3720', nose: 1.3 },
  'spring peeper': { body: '#b48d5e', belly: '#e0d2af', cross: '#57391f' },
  'cricket frog': { body: '#76704a', belly: '#d5cba9', warts: '#8c8659', triangle: '#332e1d' },
  'bronze frog': { body: '#8a5f32', belly: '#d7caa5', lip: '#6c9d3a' },
  toad: { body: '#7a593a', belly: '#ccba97', warts: '#5c4128', glands: '#8d6c4a', stout: true },
};
export function frog(kind = 'bullfrog', size = .08) {
  const K = FROG_KINDS[kind] ?? FROG_KINDS.bullfrog, wide = K.stout ? 1.22 : 1, leg = K.stout ? .8 : 1, nose = K.nose ?? 1, head = K.head ?? K.body;
  // where its marks go on its back, the same for every frog of a kind
  const on = (i, n) => { const a = i * 2.39996 + 1, r = Math.sqrt((i + .5) / n); return [Math.cos(a) * r * .22 * wide, Math.sin(a) * r * .3 - .06]; };
  const parts = [
    blob(0, .21, -.05, .3 * wide, .19 * (K.stout ? 1.15 : 1), .4, K.body, 10), blob(0, .13, 0, .27 * wide, .1, .35, K.belly),
    blob(0, .29, .3, .26 * wide, .15, .2 * nose, head, 10),
    ...both((s) => blob(s * .15 * wide, .43, .31, .075, .075, .075, '#c9a43a', 6)), ...both((s) => blob(s * .19 * wide, .445, .35, .03, .04, .03, '#120e10', 4)),
    // front legs, and the back ones folded up under it
    ...both((s) => bar([s * .15 * wide, .22, .24], [s * .2 * wide, .02, .33], .06, K.body)),
    ...both((s) => bar([s * .18 * wide, .15, -.3], [s * .34 * wide, .12, -.3 + .28 * leg], .1, K.body)),
    ...both((s) => bar([s * .34 * wide, .12, -.3 + .28 * leg], [s * .3 * wide, .05, -.3 - .08 * leg], .08, K.body)),
    ...both((s) => bar([s * .3 * wide, .03, -.3 - .08 * leg], [s * .4 * wide, .015, -.3 + .25 * leg], .06, K.body)),
  ];
  if (K.ears) parts.push(...both((s) => cylX(s * .245 * wide, .35, .2, .065, .012, K.ears, 10)));
  if (K.stripe) parts.push(...both((s) => bar([s * .29, .2, -.32], [s * .25, .29, .38], .035, K.stripe)));
  if (K.mottle) for (let i = 0; i < 6; i++) { const [x, z] = on(i, 6); parts.push(blob(x, .39, z, .07, .02, .06, K.mottle, 6)); }
  if (K.under) parts.push(...both((s) => bar([s * .16, .13, -.27], [s * .3, .09, -.04], .065, K.under)));
  if (K.spots) for (let i = 0; i < 8; i++) { const [x, z] = on(i, 8); parts.push(blob(x, .39, z, .045, .016, .045, K.spots, 6)); }
  if (K.spots) parts.push(...both((s) => blob(s * .3, .15, -.12, .035, .02, .035, K.spots, 6)));
  if (K.cross) parts.push(bar([-.11, .4, -.22], [.11, .405, .08], .035, K.cross), bar([.11, .4, -.22], [-.11, .405, .08], .035, K.cross));
  if (K.warts) for (let i = 0; i < 14; i++) { const [x, z] = on(i, 14); parts.push(blob(x * 1.15, .38 + .02 * Math.cos(i), z * 1.1, .026, .022, .026, K.warts, 5)); }
  if (K.triangle) parts.push(painted(new THREE.CylinderGeometry(.075, .075, .012, 3).rotateY(Math.PI / 2).translate(0, .44, .25), K.triangle));
  if (K.lip) parts.push(...both((s) => bar([s * .22, .25, .2], [s * .07, .25, .3 + .19 * nose], .035, K.lip)));
  if (K.glands) parts.push(...both((s) => blob(s * .18 * wide, .39, .16, .06, .04, .1, K.glands, 6)));
  return parts.map((g) => g.scale(size, size, size));
}
// What moves on a live one sat in somebody's hands, at the same size as frog() and each with its own place on it: its throat, under its chin, which swells and goes
// down as it breathes and is built round its own middle so that it swells in place, and its lids, which come down over its eyes when it blinks.
export function frogThroat(kind = 'bullfrog', size = .08) {
  const K = FROG_KINDS[kind] ?? FROG_KINDS.bullfrog, wide = K.stout ? 1.22 : 1, nose = K.nose ?? 1;
  return { parts: [blob(0, 0, 0, .17 * wide, .065, .12, K.belly, 8).scale(size, size, size)], at: [0, .165 * size, (.31 + .06 * nose) * size] };
}
export function frogLids(kind = 'bullfrog', size = .08) {
  const K = FROG_KINDS[kind] ?? FROG_KINDS.bullfrog, wide = K.stout ? 1.22 : 1;
  return both((s) => blob(s * .15 * wide, .435, .315, .085, .085, .085, K.head ?? K.body, 6)).map((g) => g.scale(size, size, size));
}

// A low red cap for the top of a post
export function cap(color = '#a82a2a') {
  return [cyl(0, .06, 0, .075, .1, color, 8, .1), cyl(0, .115, 0, .018, .012, color, 6), box(0, .018, .13, .17, .014, .12, color)];
}

export function crate(w = .8, h = .6, d = .6, color = PALE) {
  return [box(0, h / 2, 0, w, h, d, color), box(0, h, 0, w + .03, .03, d + .03, '#8a7f66'), ...both((s) => box(s * (w / 2 + .004), h / 2, 0, .012, h, .06, '#8a7f66'))];
}

// ---- the back room of a trailer. An old computer on a laminate desk: a tube monitor, a tower, speakers, a keyboard and a mouse. The glass isn't here: GLASS says where the page puts it, lit, in the monitor's front.
export const GLASS = { y: 1.03, z: .09, w: .31, h: .235 };
export function computerDesk() {
  const TOP = '#6b4f38', SIDE = '#54402f', CASE = '#efe8d2', LOW = '#cfc7ae', DARK = '#262228', KEY = '#f5f0de', { y, z, w, h } = GLASS, wide = .065, under = .085, over = .05, front = z + .012;
  return [
    box(0, .725, 0, 1.45, .03, .72, TOP), ...both((s) => box(s * .69, .355, 0, .03, .71, .68, SIDE)), box(0, .42, -.33, 1.35, .56, .02, SIDE),
    // the monitor: its foot, the hump behind, and the bezel round the glass with its buttons and its light
    box(0, .762, -.06, .24, .024, .24, LOW), box(0, .79, -.06, .11, .04, .11, LOW),
    box(0, y - .01, -.17, .3, .29, .25, LOW), box(0, y, z - .14, .36, .3, .1, CASE), box(0, y, z - .024, w + .01, h + .01, .02, DARK),
    box(0, y + h / 2 + over / 2, z - .05, w + wide * 2, over, .124, CASE), box(0, y - h / 2 - under / 2, z - .05, w + wide * 2, under, .124, CASE),
    ...both((s) => box(s * (w / 2 + wide / 2), y, z - .05, wide, h, .124, CASE)),
    ...[-.1, -.06, -.02].map((x) => box(x, y - h / 2 - .05, front, .024, .012, .004, LOW)), box(.14, y - h / 2 - .05, front, .012, .012, .004, '#7adf6a'),
    // the tower standing beside it
    box(.54, .96, -.05, .19, .44, .44, CASE), box(.54, 1.11, .172, .155, .036, .006, LOW), box(.54, 1.05, .172, .11, .012, .006, DARK), box(.54, .88, .172, .03, .03, .006, LOW), box(.5, .88, .172, .012, .012, .004, '#e8a93a'),
    // the speakers, the keyboard and the mouse on its pad, with its cord
    ...both((s) => [box(s * .3, .83, .02, .09, .18, .1, CASE), cylZ(s * .3, .86, .074, .03, .004, DARK, 8)]).flat(),
    box(-.02, .752, .25, .46, .018, .16, CASE), box(-.07, .764, .25, .32, .006, .125, KEY), box(.17, .764, .25, .075, .006, .125, KEY),
    box(.34, .742, .25, .2, .004, .2, '#27353f'), box(.34, .756, .25, .06, .024, .1, CASE), bar([.34, .76, .2], [.26, .76, -.12], .008, DARK),
    // a stack of discs with nothing on them, and a mug
    cyl(-.56, .762, .12, .06, .045, '#c9ccd2', 12), cyl(-.56, .785, .12, .018, .006, '#6b6e74', 8), cyl(-.5, .79, -.14, .04, .09, '#7a3030', 8),
  ];
}
export function deskChair() {
  const SEAT = '#26262e', STEEL_DARK = '#4a4a50';
  return [
    box(0, .47, 0, .46, .08, .46, SEAT), box(0, .86, -.21, .42, .55, .07, SEAT), bar([0, .62, -.2], [0, .47, -.14], .05, STEEL_DARK), cyl(0, .26, 0, .03, .4, STEEL_DARK, 8),
    ...[0, 1.257, 2.513, 3.77, 5.027].map((a) => bar([0, .08, 0], [Math.sin(a) * .28, .05, Math.cos(a) * .28], .03, STEEL_DARK)),
  ];
}
// A twin bed, with its head at -z
export function narrowBed(blanket = '#2f3a4f') {
  return [
    box(0, .17, 0, 1, .3, 2, '#3a2c22'), box(0, .36, 0, .96, .14, 1.94, '#8b8778'), box(0, .44, .2, 1, .06, 1.5, blanket), box(.08, .46, -.72, .7, .1, .4, '#b9b3a4'), box(0, .55, -.98, 1, .8, .05, '#3a2c22'),
  ];
}
// A rack of discs, every spine a different color and nothing on any of them
export function discRack(colors = ['#a33a3a', '#e8a93a', '#2f6f8f', '#d8d2bd', '#3a7a4a', '#7a4a8a', '#c86a2a', '#26262e']) {
  const spines = [];
  for (let y = 0; y < 5; y++) for (let i = 0; i < 12; i++) spines.push(box(-.165 + i * .03, .12 + y * .25, .02, .024, .17, .12, colors[(i * 5 + y * 3) % colors.length]));
  return [box(0, .68, -.06, .42, 1.36, .03, '#3a2c22'), ...both((s) => box(s * .2, .68, 0, .02, 1.36, .16, '#3a2c22')), ...[0, 1, 2, 3, 4, 5].map((y) => box(0, .02 + y * .25, 0, .4, .02, .16, '#3a2c22')), ...spines];
}

// ---- what stands in a cemetery, from what can be seen from the road. Nothing's written on any of it but the one slab with `words`, whose lines are cut in the
// face of the stone at its head, toward the slab, where it's read from, and can only be made out from right up close.
const GRAVE_GREYS = ['#8d8c88', '#77767a', '#a3a196', '#5e5d62', '#b4b1a4'], BLOOMS = ['#d94a6a', '#f1e6cf', '#e8a93a', '#b03ac0', '#d9402a'];
export function graveMarker({ kind, tone = 0, flowers = 0, w = 3, d = 3.4, words = false }) {
  const G = GRAVE_GREYS[Math.floor(tone * GRAVE_GREYS.length) % GRAVE_GREYS.length], BASE = '#83827a', parts = [];
  const base = (bw, bd = .34, bh = .14, color = BASE) => box(0, bh / 2, 0, bw, bh, bd, color);
  if (kind === 'low') parts.push(base(.84), box(0, .36, 0, .68, .46, .17, G));
  if (kind === 'double') parts.push(base(1.36, .38), box(0, .4, 0, 1.14, .52, .2, G), box(0, .68, 0, .94, .05, .16, G));
  if (kind === 'upright') parts.push(base(.6, .3, .1), box(0, .46, 0, .42, .72, .12, '#4e4d54'));
  if (kind === 'old') parts.push(...moved([box(0, .4, 0, .38, .8, .07, '#a9a79a'), box(0, .84, 0, .26, .08, .07, '#a9a79a')], { rx: .05 }));
  if (kind === 'cross') parts.push(base(.5, .3, .2), box(0, .62, 0, .11, .85, .1, G), box(0, .78, 0, .46, .1, .1, G));
  if (kind === 'slab') parts.push(
    box(0, .05, 0, w, .1, d, '#a9a79c'), box(0, .09, .1, w - .34, .06, d - .54, '#8b8a80'),
    ...moved([base(1.6, .4), box(0, .42, 0, 1.3, .56, .22, G), box(0, .72, 0, 1.06, .05, .17, G),
      ...(words ? [.6, .53, .46, .39, .32].map((y, i) => box(0, y, .112, [.82, .94, .72, .88, .56][i], .012, .004, '#4c4b52')) : [])], { z: -d / 2 + .2 }),
  );
  if (kind === 'obelisk') parts.push(
    box(0, .14, 0, 1.1, .28, 1.1, BASE), box(0, .42, 0, .8, .3, .8, G),
    ...moved([cyl(0, 1.5, 0, .22, 1.9, G, 4, .32), cyl(0, 2.6, 0, 0, .3, G, 4, .22)], { ry: Math.PI / 4 }),
  );
  for (let i = 0; i < flowers; i++) {
    const x = (i - (flowers - 1) / 2) * .22, z = kind === 'slab' ? -d / 2 + .56 : .26;
    parts.push(box(x, .1, z, .03, .2, .03, '#3a5230'), box(x, .22, z, .16, .12, .16, BLOOMS[(Math.floor(tone * 97) + i * 2) % BLOOMS.length]));
  }
  return parts;
}
// All of them in one go. place says where each one stands: [x, z, turn]
export function cemeteryStones(list, place) {
  return list.flatMap((g) => { const [x, z, ry] = place(g); return moved(graveMarker(g), { x, z, ry }); });
}
