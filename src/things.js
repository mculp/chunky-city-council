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

// ---- the taxidermy shop's, as its inside is on the listing's photo from December 2020: a whole alligator on a long bench of planks on cinder blocks, with tools lying at
// the other end of it, the bins, bags and boxes past that, and what hangs on the walls. What hangs on a wall has its origin on the wall, at its own middle, and looks out along +z.
export const BENCH_TOP = .805;
// planks on three piers of blocks laid on their sides, four high, with their two holes looking out front and back
export function blockBench(long = 4.6, wide = .9) {
  const BLOCK = '#9a978e', CORE = '#3d3b38', parts = [];
  for (const x of [-long / 2 + .3, 0, long / 2 - .3]) for (let k = 0; k < 4; k++) for (const s of [1, -1]) {
    const y = .095 + k * .19, z = s * (wide / 2 - .1);
    parts.push(box(x, y, z, .39, .19, .19, BLOCK), ...[-.095, .095].map((dx) => box(x + dx, y, z + s * .097, .13, .12, .006, CORE)));
  }
  ['#a07c52', '#97744d', '#a8855a'].forEach((c, i) => parts.push(box(0, .7825, (i - 1) * (wide - .02) / 3, long, .045, (wide - .06) / 3, c)));
  return parts;
}
// A big one, lying on its belly with its head at +z, its tail curving off to its left, and its teeth showing along its jaws. `long` is from its nose to its tail,
// and `open` is how far its jaws are open, from 0 to 1.
export function alligator(long = 3.2, open = 0) {
  const BACK = '#363b2d', SIDE = '#4a5039', BELLY = '#cfc6a3', SCUTE = '#25281f', TOOTH = '#e8e1ca', EYE = '#b8952f', DARK = '#0e0d0c', MOUTH = '#dcb8a2', k = long / 3.2;
  // how high its back is at (x, z), over one of the lumps it's made of: [y, z, half across, half high, half long]
  const LUMPS = [[.14, .35, .28, .13, .48], [.12, -.12, .22, .11, .26], [.12, .78, .18, .095, .2]];
  const over = (x, z) => Math.max(...LUMPS.map(([y, z0, a, b, c]) => y + b * Math.sqrt(Math.max(0, 1 - (x / a) ** 2 - ((z - z0) / c) ** 2))));
  // the half-width of its snout, which is broad and flat and narrows to the nose
  const snoutHalf = (z) => z < 1.05 ? .136 : .12 - .055 * (z - 1.05) / .5;
  // Its jaws hinge behind its eyes. The top one has its nostrils on the end and its teeth hanging over the line of its mouth, and the bottom one its own teeth standing up,
  // and both are pale inside, which shows when they're open.
  const upper = [
    painted(new THREE.CylinderGeometry(.065, .12, .5, 10).rotateX(Math.PI / 2).scale(1, .5, 1).translate(0, .09, 1.3), BACK), blob(0, .045, 1.25, .095, .012, .26, MOUTH),
    blob(0, .125, 1.52, .045, .028, .035, BACK), ...both((s) => blob(s * .018, .15, 1.53, .008, .006, .008, DARK)),
    ...both((s) => bar([s * .138, .085, .95], [s * .068, .085, 1.53], .014, DARK)),
  ];
  for (let i = 0; i < 9; i++) { const z = .98 + i * .065; upper.push(...both((s) => box(s * (snoutHalf(z) + .004), .07, z, .012, .028, .012, TOOTH))); }
  // the bottom one runs all the way back to the hinge, where it's broad
  const lower = [
    painted(new THREE.CylinderGeometry(.06, .125, .62, 10).rotateX(Math.PI / 2).scale(1, .32, 1).translate(0, .04, 1.22), SIDE), blob(0, .068, 1.2, .08, .008, .24, MOUTH),
    ...both((s) => blob(s * .1, .05, .96, .045, .04, .09, SIDE)),
  ];
  for (let i = 0; i < 8; i++) { const z = 1.08 + i * .055, r = .125 - .065 * (z - .91) / .62; lower.push(...both((s) => box(s * r * .88, .08, z, .01, .022, .01, TOOTH))); }
  const hinge = (list, rx) => moved(moved(list, { y: -.08, z: -.92 }), { rx, y: .08, z: .92 });
  const parts = [
    ...hinge(upper, -open * .32), ...hinge(lower, open * .38),
    blob(0, .11, 1, .15, .085, .17, BACK), blob(0, .045, .88, .11, .045, .13, BELLY), ...LUMPS.map(([y, z, a, b, c]) => blob(0, y, z, a, b, c, BACK)), blob(0, .07, .35, .275, .06, .46, BELLY),
    // its eyes up on top of its head
    ...both((s) => [blob(s * .08, .19, .95, .045, .04, .05, BACK), blob(s * .105, .2, .96, .022, .02, .026, EYE), blob(s * .126, .2, .962, .004, .015, .008, DARK)]).flat(),
  ];
  // its back, in rows of ridged scutes
  for (let z = .7; z > -.3; z -= .095) for (const x of [-.2, -.13, -.05, .05, .13, .2]) { const y = over(x, z); if (y > .17) parts.push(blob(x, y, z, .015, .022, .04, SCUTE, 5)); }
  // the tail, narrowing and taller than it's wide by the end, with two rows of scutes standing up along its top that come together a third of the way down it
  for (let i = 0; i < 10; i++) {
    const t = i / 9, z = -.32 - t * 1.2, x = .14 * Math.sin(t * 2.4), w = .19 * (1 - .82 * t), h = .1 * (1 - .55 * t) + .015;
    parts.push(blob(x, h * .95, z, w, h, .19, BACK));
    if (t < .35) parts.push(...both((s) => blob(x + s * w * .4, h * 1.95 - .005, z, .012, .04, .055, SCUTE, 5)));
    else parts.push(blob(x, h * 1.95, z, .012, .045, .065, SCUTE, 5));
  }
  // its legs splayed out to its sides, the front ones reaching forward and the back ones bent, on flat feet with their toes spread
  parts.push(...both((s) => [
    bar([s * .2, .12, .6], [s * .36, .07, .64], .07, BACK), bar([s * .36, .07, .64], [s * .42, .03, .74], .055, BACK), blob(s * .44, .018, .79, .05, .016, .065, BACK),
    bar([s * .17, .12, -.1], [s * .36, .09, -.2], .09, BACK), bar([s * .36, .09, -.2], [s * .44, .035, -.07], .07, BACK), blob(s * .46, .018, -.01, .055, .016, .08, BACK),
  ]).flat());
  for (const s of [1, -1]) for (const [fx, fz, n] of [[.44, .79, 5], [.46, -.01, 4]]) for (let j = 0; j < n; j++) { const a = (j - (n - 1) / 2) * .32 + s * .25; parts.push(bar([s * fx, .012, fz + .03], [s * fx + Math.sin(a) * .09, .01, fz + .03 + Math.cos(a) * .09], .016, BACK)); }
  return parts.map((g) => g.scale(k, k, k));
}
// The bench with the alligator lying along it, its head at the bench's -x end with its jaws open past it, and at the other end what's lying about: a hammer, a knife,
// a brush, a can, a roll of tape and a small box
export const GATOR_HINGE = .1;
export function gatorOnBench(long = 4.6, wide = .9) {
  const y = BENCH_TOP, x = long / 2 - 1.3;
  return [
    ...blockBench(long, wide), ...moved(alligator(3.2, 1), { y, ry: -Math.PI / 2, x: -long / 2 + GATOR_HINGE + .92, z: .02 }),
    box(x, y + .015, -.12, .3, .025, .03, '#7a4a2a'), box(x + .16, y + .022, -.12, .03, .035, .1, '#8a8c92'),
    box(x + .45, y + .006, .1, .14, .012, .025, '#c9cbd0'), box(x + .33, y + .012, .1, .11, .024, .03, '#2a2228'),
    cyl(x + .8, y + .06, -.16, .045, .12, '#b8562a', 10), cyl(x + .8, y + .125, -.16, .046, .01, '#8a8c92', 10),
    painted(new THREE.TorusGeometry(.04, .018, 6, 12).rotateX(Math.PI / 2).translate(x + .6, y + .018, .2), '#cfc9b8'),
    box(x + 1.15, y + .05, .04, .2, .1, .14, '#b08a5a'), box(x + .2, y + .01, .28, .2, .02, .03, '#d8c9a0'), box(x + .33, y + .014, .28, .06, .03, .04, '#5a3a22'),
  ];
}
// A whitetail buck's head and shoulders, with eight points, its head turned a little to its left. A smaller one's a young buck, with four.
export function buckHead(small = false) {
  const COAT = '#7d6347', BROW = '#5a4430', WHITE = '#ebe5d6', DARK = '#1b1714', ANTLER = '#d6c6a2', BURR = '#8a7050';
  // a long head, narrowing to a muzzle that's white under it, with the black of its nose at the end and big dark eyes
  const head = [
    blob(0, .25, .41, .08, .09, .12, COAT), blob(0, .2, .55, .05, .055, .13, COAT), blob(0, .196, .675, .03, .025, .02, DARK),
    blob(0, .168, .6, .04, .02, .07, WHITE), blob(0, .305, .44, .05, .03, .06, BROW),
    ...both((s) => [blob(s * .062, .275, .46, .025, .021, .027, '#b9ab92'), blob(s * .067, .277, .466, .017, .017, .017, DARK)]).flat(),
    ...both((s) => moved([blob(0, .09, 0, .045, .1, .02, COAT), blob(0, .09, .012, .03, .07, .012, '#c4b69d')], { rx: -.2, rz: -s * .9, x: s * .075, y: .32, z: .36 })).flat(),
  ];
  // the main beams sweep out and round to the front, darker at the burr, with tines standing up off each
  const beam = (pts) => pts.slice(1).map((p, i) => bar(pts[i], p, .032 - i * .0045, i ? ANTLER : BURR));
  const rack = both((s) => small ? [
    ...beam([[s * .05, .34, .42], [s * .12, .44, .4], [s * .16, .5, .46], [s * .13, .53, .55]]), bar([s * .135, .45, .405], [s * .14, .58, .43], .02, ANTLER),
  ] : [
    ...beam([[s * .05, .34, .42], [s * .17, .46, .38], [s * .24, .52, .45], [s * .22, .55, .58], [s * .12, .57, .67]]),
    bar([s * .085, .385, .415], [s * .09, .5, .47], .02, ANTLER), bar([s * .19, .48, .4], [s * .2, .68, .43], .022, ANTLER), bar([s * .235, .535, .52], [s * .215, .7, .57], .02, ANTLER),
  ]).flat();
  const parts = [
    // the shoulders flat against the wall, the chest under them, and the neck coming out and up, white at the throat
    blob(0, -.02, 0, .26, .3, .1, COAT), blob(0, -.2, .08, .15, .13, .1, COAT), blob(0, .03, .17, .14, .22, .14, COAT), blob(0, .16, .3, .11, .14, .11, COAT), blob(0, .1, .3, .07, .06, .03, WHITE),
    ...moved(moved([...head, ...rack], { z: -.3 }), { ry: .22, z: .3 }),
  ];
  return small ? parts.map((g) => g.scale(.8, .8, .8)) : parts;
}
// A wild turkey in full strut on a shelf, with its fan spread behind it, its wings dragging and its beard hanging. The shelf's top is at y = 0.
export function struttingTurkey() {
  const SHELF = '#6e5238', BRONZE = '#3b2f26', LEG = '#b8897a', RED = '#b3262b';
  // the fan's a half circle standing up behind it, in rings: chestnut tips, a dark band and the barred brown, and the coverts over them
  const half = (r, z, color) => painted(new THREE.CylinderGeometry(r, r, .016, 16, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, .36, z), color);
  return [
    box(0, -.015, .23, .9, .03, .46, SHELF), ...both((s) => [box(s * .36, -.13, .015, .035, .22, .03, SHELF), bar([s * .36, -.22, .03], [s * .36, -.035, .32], .03, SHELF)]).flat(),
    half(.44, .075, '#8a5a32'), half(.4, .085, '#1f1813'), half(.36, .095, '#5d4430'), half(.2, .11, '#6e4d30'),
    blob(0, .33, .24, .19, .19, .21, BRONZE), blob(0, .35, .36, .14, .15, .1, '#5a3f28'),
    ...both((s) => moved([blob(0, 0, 0, .035, .17, .2, '#4c3c2d'), blob(0, -.1, .02, .036, .04, .14, '#cfc6b4')], { x: s * .175, y: .2, z: .24, rx: .3 })).flat(),
    ...both((s) => [bar([s * .05, 0, .27], [s * .055, .17, .25], .022, LEG), ...[-.5, 0, .5].map((a) => bar([s * .05, .006, .27], [s * .05 + Math.sin(a) * .09, .006, .27 + Math.cos(a) * .09], .014, LEG))]).flat(),
    // its head pulled back, pale, with the red under it and the snood hanging over its beak
    blob(0, .5, .35, .045, .07, .045, BRONZE), blob(0, .58, .37, .05, .05, .055, '#cad6df'), blob(0, .52, .405, .038, .05, .032, RED), bar([0, .6, .41], [0, .52, .45], .016, RED),
    blob(0, .575, .425, .014, .012, .026, '#c8b48c'), ...both((s) => blob(s * .042, .59, .38, .008, .008, .008, '#111')),
    bar([0, .4, .44], [0, .2, .47], .03, '#1d1712'),
  ];
}
// A mallard drake flying toward +x, climbing by `climb`, its wings up, the near one out toward the room. `beat` brings that one down a little.
export function flyingDuck(climb = .35, beat = 0) {
  const z = .13, BLACK = '#1b1a1d', WHITE = '#efece4';
  return moved([
    blob(0, 0, z, .22, .08, .09, '#a29d92'), blob(.12, -.015, z, .1, .07, .085, '#6b3825'), blob(.205, .02, z, .026, .046, .046, WHITE),
    blob(.26, .045, z, .062, .05, .045, '#1d5a3c'), blob(.33, .035, z, .045, .014, .022, '#d4b13c'), ...both((s) => blob(.275, .06, z + s * .038, .007, .007, .007, BLACK)),
    blob(-.21, .01, z, .06, .025, .05, BLACK), blob(-.2, .045, z, .012, .02, .012, BLACK), blob(-.245, .005, z, .03, .02, .045, WHITE),
    ...both((s) => blob(-.12, -.065, z + s * .03, .035, .01, .015, '#d9822b')),
    ...moved(wing('#857b6e', true), { x: .03, y: .04, z: z + .07, rx: .5 - beat, rz: .2 }),
    ...moved(wing('#cdc7ba', false), { x: .03, y: .04, z: z - .05, rx: -.12, rz: .2 }),
  ], { rz: climb });
}
// one of its wings, standing up from the shoulder: the broad inner part with the blue patch on its back edge, and the long primaries tapering to a point
function wing(color, patch) {
  const parts = [blob(-.01, .1, 0, .085, .12, .014, color), painted(new THREE.CylinderGeometry(.006, .07, .27, 6).scale(1, 1, .2).translate(-.025, .33, 0), color)];
  if (patch) parts.push(blob(-.07, .1, .012, .022, .055, .004, '#3c4fa8'), blob(-.09, .1, .012, .006, .055, .004, '#efece4'));
  return parts;
}
// The plaques: an oval of dark wood with a set of antlers on a skull cap, or with a bleached skull, nose down, and its antlers, or nothing on it at all
const oval = (w, h, d, z, color) => painted(new THREE.CylinderGeometry(.5, .5, d, 20).rotateX(Math.PI / 2).scale(w, h, 1).translate(0, 0, z), color);
// each beam rises off the cap at height y, sweeps out and round to the front, and has its tines standing up off it
function antlers(spread, tines, y = .06) {
  const parts = [];
  for (const s of [1, -1]) {
    const p = [[s * .03, y, .07], [s * .1, y + .08, .07], [s * spread * .55, y + .16, .1], [s * spread * .6, y + .24, .17], [s * spread * .42, y + .3, .23]];
    for (let i = 1; i < p.length; i++) parts.push(bar(p[i - 1], p[i], .026 - i * .003, '#d2c19b'));
    for (let t = 0; t < tines; t++) { const a = p[t + 2]; parts.push(bar(a, [a[0] * 1.03, a[1] + .14 - t * .025, a[2] + .01], .016, '#d2c19b')); }
  }
  return parts;
}
export function antlerPlaque(spread = .3, tines = 2) {
  return [oval(.34, .44, .03, .015, '#3c2717'), oval(.3, .4, .02, .035, '#5a3a22'), blob(0, .04, .06, .05, .035, .03, '#3a2a1e'), ...antlers(spread, tines)];
}
export function skullPlaque(spread = .3, tines = 2) {
  const BONE = '#e6dfcd', HOLE = '#2a2420';
  return [
    oval(.32, .46, .03, .015, '#3c2717'), oval(.28, .42, .02, .035, '#6a4a2c'),
    blob(0, .05, .075, .06, .055, .05, BONE), blob(0, -.08, .085, .042, .11, .035, BONE), ...both((s) => blob(s * .045, .02, .105, .02, .02, .015, HOLE)), blob(0, -.13, .115, .015, .04, .01, HOLE),
    ...antlers(spread, tines, .09),
  ];
}
export function ovalPlaque(w = .42, h = .56) {
  return [oval(w + .04, h + .04, .03, .015, '#3c2717'), oval(w, h, .025, .04, '#7a5232')];
}
// Tools hung on nails among the mounts: a handsaw, or a hammer and a pair of pliers
export function hangingTools(kind = 'saw') {
  const STEEL = '#9a9ca2', NAIL = '#2a2628', WOOD = '#7a4a2a';
  if (kind === 'saw') {
    // hung by the hole in its handle, with its blade tapering down to the tip and its teeth along the right-hand edge
    const V = (x, y) => new THREE.Vector2(x, y), edge = [V(-.07, -.05), V(-.07, -.62), V(-.005, -.62)];
    for (let i = 1; i <= 44; i++) { const t = i / 44; edge.push(V(-.005 + .07 * t + (i % 2) * .008, -.62 + .57 * t)); }
    const grip = new THREE.Shape(), hole = new THREE.Path();
    grip.moveTo(-.075, -.08); grip.lineTo(.07, -.08); grip.lineTo(.07, .06); grip.quadraticCurveTo(.07, .13, 0, .13); grip.quadraticCurveTo(-.075, .13, -.075, .06); grip.closePath();
    hole.moveTo(-.04, -.035); hole.lineTo(.035, -.035); hole.lineTo(.035, .05); hole.quadraticCurveTo(.035, .09, 0, .09); hole.quadraticCurveTo(-.04, .09, -.04, .05); hole.closePath(); grip.holes.push(hole);
    return [
      painted(new THREE.ExtrudeGeometry(new THREE.Shape(edge), { depth: .003, bevelEnabled: false }).translate(0, 0, .014), STEEL),
      painted(new THREE.ExtrudeGeometry(grip, { depth: .024, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, .004), WOOD), box(0, .075, .03, .012, .012, .05, NAIL),
    ];
  }
  return [
    box(-.1, 0, .03, .012, .012, .05, NAIL), box(-.1, -.012, .03, .12, .035, .035, STEEL), box(-.1, -.19, .03, .028, .32, .022, WOOD),
    box(.12, 0, .03, .012, .012, .05, NAIL), bar([.11, -.01, .03], [.13, .07, .03], .02, STEEL), bar([.13, -.01, .03], [.11, .07, .03], .02, STEEL),
    bar([.11, -.01, .03], [.08, -.29, .03], .018, '#b0362e'), bar([.13, -.01, .03], [.16, -.29, .03], .018, '#b0362e'),
  ];
}
// The bins, bags and boxes on the floor past the end of the bench: two bins stacked, a box with a smaller one on it, and two sacks slumped against them
export function shopClutter() {
  const bin = (x, y, z, w, h, d, color, lid) => [box(x, y + h / 2, z, w, h, d, color), box(x, y + h + .015, z, w + .03, .03, d + .03, lid)];
  const sack = (x, z, color, turn) => moved([blob(0, .16, 0, .24, .16, .17, color), blob(0, .3, -.12, .14, .06, .07, color)], { x, z, ry: turn });
  return [
    ...bin(-.62, 0, -.05, .6, .38, .42, '#3e5f86', '#2d4664'), ...bin(-.62, .41, -.05, .55, .3, .4, '#d9d4c6', '#bdb7a6'),
    box(.08, .22, -.12, .5, .44, .4, '#b08a5a'), box(.08, .445, -.12, .5, .012, .06, '#cdb48c'), box(.12, .59, -.1, .36, .28, .3, '#a07c4e'),
    ...sack(.62, .12, '#d8d0bc', .3), ...sack(.72, -.22, '#8f7350', -.4),
  ];
}
// A round clock, stopped at ten past ten, in a case of its own colour
export function wallClock(r = .17, rim = '#1d1a1e') {
  const INK = '#1d1a1e', parts = [cylZ(0, 0, .025, r, .05, rim, 24), cylZ(0, 0, .051, r - .015, .004, '#efebe0', 24), cylZ(0, 0, .058, .01, .006, INK, 8)];
  for (let h = 0; h < 12; h++) { const a = h * Math.PI / 6; parts.push(bar([Math.sin(a) * (r - .045), Math.cos(a) * (r - .045), .054], [Math.sin(a) * (r - .025), Math.cos(a) * (r - .025), .054], h % 3 ? .006 : .012, INK)); }
  const hand = (turns, long, w) => bar([0, 0, .057], [Math.sin(turns * 2 * Math.PI) * long, Math.cos(turns * 2 * Math.PI) * long, .057], w, INK);
  return [...parts, hand((10 + 10 / 60) / 12, r * .5, .012), hand(10 / 60, r * .66, .008)];
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

// ---- fishing (CHUNKY-112, and Coop's fishing hole in CHUNKY-163)
// An old fiberglass rod, held by its cork grip, with a spinning reel under it, standing up its own y with its tip at ROD_TIP
export const ROD_TIP = 2.1;
export function fishingRod(blank = '#6b4a2e') {
  return [
    cyl(0, .02, 0, .02, .04, '#2a2629', 8), cyl(0, .17, 0, .017, .26, '#b98e5a', 8, .019), cyl(0, .33, 0, .012, .06, STEEL, 8),
    cyl(0, 1.2, 0, .0035, ROD_TIP - .36, blank, 6, .01), cyl(0, ROD_TIP - .02, 0, .004, .04, '#c9c4b4', 6),
    // the reel, hung on its foot under the rod
    bar([0, .33, 0], [0, .3, -.045], .012, STEEL), cylZ(0, .3, -.07, .034, .04, '#3f3a40', 12), cylZ(0, .3, -.098, .02, .02, STEEL, 10),
    ...[.62, 1.02, 1.42, 1.8].map((y) => blob(0, y, -.012, .007, .007, .007, '#c9c4b4', 5)),
  ];
}
// A red and white bobber, floating on its middle
export function bobber(r = .032) {
  const half = (top, color) => painted(new THREE.SphereGeometry(r, 10, 4, 0, Math.PI * 2, top ? 0 : Math.PI / 2, Math.PI / 2), color);
  return [half(true, '#efe9dc'), half(false, '#c8352c'), cyl(0, r + .012, 0, .004, .028, '#efe9dc', 5)];
}
// A channel catfish of `lb` pounds, slate on its back and pale under, with its whiskers, lying on its belly with its nose to +z. It's
// about as long as one that weighs that much: a foot for a pound, and near three foot for twenty.
export const catfishLong = (lb) => .36 * Math.max(1, lb) ** .3;
export function catfish(lb = 4) {
  const BACK = '#4e5a66', BELLY = '#d9d4c4', FIN = '#3d4650', L = catfishLong(lb);
  const parts = [
    blob(0, .5, 0, .5, .55, 2.6, BACK, 10), blob(0, .32, .1, .44, .3, 2.3, BELLY, 10),
    blob(0, .46, 2.15, .62, .4, .9, BACK, 10), blob(0, .3, 2.25, .55, .22, .78, BELLY, 8),
    // its eyes, wide on the flat of its head, and the whiskers off its mouth, the long ones at the corners
    ...both((s) => blob(s * .42, .6, 2.45, .07, .07, .07, '#151216', 5)),
    ...both((s) => bar([s * .4, .36, 2.85], [s * 1.25, .2, 2.45], .045, FIN)), ...both((s) => bar([s * .15, .22, 2.95], [s * .45, .02, 2.7], .035, FIN)),
    // the fin on its back, the ones under it, and its tail, forked
    painted(new THREE.CylinderGeometry(.04, .04, .9, 3).rotateX(-Math.PI / 2).scale(1, 9, 1).translate(0, 1.05, 1.1), FIN),
    ...both((s) => bar([s * .38, .2, 1.5], [s * .95, .05, 1.05], .08, FIN)),
    ...both((s) => bar([0, .5, -2.45], [s * .05, .5 + s * .55, -3.35], .1, FIN)), ...both((s) => bar([0, .5, -2.6], [0, .5 + s * .38, -3.1], .2, FIN)),
  ];
  return parts.map((g) => g.scale(L / 6.4, L / 6.4, L / 6.4));
}
