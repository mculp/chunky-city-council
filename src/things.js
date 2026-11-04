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

// ---- what stands in a cemetery, from what can be seen from the road. Nothing's written on any of it.
const GRAVE_GREYS = ['#8d8c88', '#77767a', '#a3a196', '#5e5d62', '#b4b1a4'], BLOOMS = ['#d94a6a', '#f1e6cf', '#e8a93a', '#b03ac0', '#d9402a'];
export function graveMarker({ kind, tone = 0, flowers = 0, w = 3, d = 3.4 }) {
  const G = GRAVE_GREYS[Math.floor(tone * GRAVE_GREYS.length) % GRAVE_GREYS.length], BASE = '#83827a', parts = [];
  const base = (bw, bd = .34, bh = .14, color = BASE) => box(0, bh / 2, 0, bw, bh, bd, color);
  if (kind === 'low') parts.push(base(.84), box(0, .36, 0, .68, .46, .17, G));
  if (kind === 'double') parts.push(base(1.36, .38), box(0, .4, 0, 1.14, .52, .2, G), box(0, .68, 0, .94, .05, .16, G));
  if (kind === 'upright') parts.push(base(.6, .3, .1), box(0, .46, 0, .42, .72, .12, '#4e4d54'));
  if (kind === 'old') parts.push(...moved([box(0, .4, 0, .38, .8, .07, '#a9a79a'), box(0, .84, 0, .26, .08, .07, '#a9a79a')], { rx: .05 }));
  if (kind === 'cross') parts.push(base(.5, .3, .2), box(0, .62, 0, .11, .85, .1, G), box(0, .78, 0, .46, .1, .1, G));
  if (kind === 'slab') parts.push(
    box(0, .05, 0, w, .1, d, '#a9a79c'), box(0, .09, .1, w - .34, .06, d - .54, '#8b8a80'),
    ...moved([base(1.6, .4), box(0, .42, 0, 1.3, .56, .22, G), box(0, .72, 0, 1.06, .05, .17, G)], { z: -d / 2 + .2 }),
  );
  if (kind === 'obelisk') parts.push(
    box(0, .14, 0, 1.1, .28, 1.1, BASE), box(0, .42, 0, .8, .3, .8, G),
    ...moved([cyl(0, 1.5, 0, .22, 1.9, G, 4, .32), cyl(0, 2.6, 0, 0, .3, G, 4, .22)], { ry: Math.PI / 4 }),
  );
  // Dark and polished, and whatever's cut in it can only be read from right up close
  if (kind === 'stone') parts.push(
    base(1, .42, .16, '#3a383e'), box(0, .6, 0, .8, .88, .16, '#26242a'),
    ...[.86, .78, .7, .62, .54].map((y, i) => box(0, y, .083, [.5, .56, .44, .54, .34][i], .012, .004, '#9a98a0')),
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
