// The water in a town everyone shares (CHUNKY-153): where it is, how high it stands and the ground under it, as the game has them, over the
// town's flat ground (src/solids.js). There's no three.js or page in here, so the town uses it too.
//
// It's index.html's landH, pondGround and floorAt, without the land's rise and fall away from the water, since the town's ground is flat, and
// without the buildings' pads, which are the page's. So the river's banks go down from the town to its bed as the game's do: someone thrown off
// a trestle falls as far as the game has them fall, and wades out up the same bank, a step at a time that the crowd's step rule lets them take.
// A pond stands where the game's would on flat ground, half a metre under the town or lower by the river, a swimming pool where the game's
// does, and a road keeps its bed across either. Every height is over the town's flat ground, so the river's surface is TOWN_Y under it.
// tools/play-wet.mjs checks all of it against the game's own.
//
// `ponds` is src/water.js's, which this settles, and `raised(x, z)` is the top of a raised floor there or null, which is src/solids.js's.

export const TOWN_Y = 6.15;                               // index.html's: how high the town stands over the river
export const channel = (z) => 3.5 * Math.sin(z * .035);   // index.html's: the river at Stuckey's Bridge, where the opening scene was built on it
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const BED = 3, BANK = 9, WETS = .1;                       // the river's bed under its surface, a pond's bank, and how far under the water the ground's wet
const WAKE_ROAD = 'griffis_fountain_rd', WAKE_HALF = 2.15, ROAD_GAP = 20.4, ABUTMENT = 6.0 - .05 - TOWN_Y;

export function createWet({ map, ponds, raised = null }) {
  const wake = map.crossings.find((c) => c.road === WAKE_ROAD && c.with === 'river'), opening = map.opening.road;
  const fromWake = (x, z) => Math.hypot(x - wake.x, z - wake.z);
  // How far from the river, as the game measures it: the opening's channel at Stuckey's Bridge, and narrower at the Chunky River Bridge
  function riverDist(x, z) {
    const az = Math.abs(z);
    if (az >= 160 || Math.abs(x) > 150) { const d = map.riverGrid.nearest(x, z), w = fromWake(x, z); return w < 90 ? d + 7 * (1 - sstep(40, 90, w)) : d; }
    const near = Math.abs(x - channel(z));
    if (az <= 100) return near;
    return near + (Math.min(map.riverGrid.nearest(x, z), 60) - near) * sstep(100, 160, az);
  }
  function roadHalf(road, x, z) {
    const half = road.width / 2, ax = Math.abs(x);
    if (road.id === WAKE_ROAD) { const w = fromWake(x, z); return w < 26 ? WAKE_HALF + (half - WAKE_HALF) * sstep(16, 26, w) : half; }
    return road.id === opening && ax < 60 && Math.abs(z) < 8 ? 2.8 + (half - 2.8) * sstep(30, 60, ax) : half;
  }
  const onRoad = (x, z) => { const g = map.roadGrid.within(x, z, roadHalf); return !!g && !(g.owner.id === opening && Math.abs(x) < ROAD_GAP && Math.abs(z) < 8); };
  // The land with no ponds and no buildings: down the river's banks to its bed, the clearing at Stuckey's Bridge, and level under a road or
  // the tracks, except where they're on a bridge over the river
  function land(x, z) {
    const d = riverDist(x, z);
    let h = -(TOWN_Y + BED) * (1 - sstep(12, 24, d));
    if (h === 0) return 0;
    const clearing = sstep(23, 30, x) * (1 - sstep(42, 56, Math.abs(z))) * (1 - sstep(125, 180, x));
    if (clearing > 0) h -= h * clearing;
    const banks = sstep(14, 26, d);
    if (banks > 0) {
      const rd = map.roadGrid.nearest(x, z);
      if (rd < 32) {
        const ax = Math.abs(x), half = roadHalf(map.roadGrid.seg.owner, x, z), guard = Math.abs(z) < 30 ? sstep(24, 34, ax) : 1;
        h -= h * (1 - sstep(half + .5, half + 3 + 11 * sstep(125, 170, ax), rd)) * banks * guard;
      }
      const td = map.railGrid.nearest(x, z);
      if (td < 24) h -= h * (1 - sstep(3.5, 16, td)) * banks;
    }
    return h;
  }
  // A pond takes the ground down to it over a bank and goes down from its shore to a floor, and the bed of a road or the tracks stays where it
  // is. A pool has sides.
  function pondGround(h, x, z) {
    const p = ponds.pond, d = ponds.d, level = p.level - TOWN_Y;
    if (p.pool) return d > 0 ? h : level - p.deep;
    const shore = level + .3, low = d > 0 ? shore + (h - shore) * sstep(0, BANK, d) : Math.max(shore + d * .5, level - p.deep);
    let keep = 0;
    const rd = map.roadGrid.nearest(x, z);
    if (rd < 12) { const half = roadHalf(map.roadGrid.seg.owner, x, z); keep = 1 - sstep(half + .4, half + 2.6, rd); }
    const td = map.railGrid.nearest(x, z);
    if (td < 6) keep = Math.max(keep, 1 - sstep(2.6, 5, td));
    return low + (h - low) * keep;
  }
  const ground = (x, z) => { const h = land(x, z); return ponds.look(x, z) ? pondGround(h, x, z) : h; };
  // as the game settles them, on the land as it'd be with no ponds, in its own heights
  ponds.settle((x, z) => TOWN_Y + land(x, z), TOWN_Y - .5);

  // What anyone stands on: the ground, a road's bed, the abutments at Stuckey's Bridge, or a raised floor
  function floorAt(x, z) {
    let f = ground(x, z);
    if (f < 0 && onRoad(x, z)) f = 0;
    if (Math.abs(z) < 4.25 && Math.abs(Math.abs(x) - 22) < 2.25) f = Math.max(f, ABUTMENT);
    const r = raised?.(x, z);
    return r === null || r === undefined ? f : Math.max(f, r);
  }
  // How high the water stands here: a pond's level in a pond, and the river's anywhere else
  const level = (x, z) => { const p = ponds.in(x, z); return (p ? p.level : 0) - TOWN_Y; };
  return {
    floorAt, level, land, ground,
    water: (x, z) => floorAt(x, z) < level(x, z) - WETS,
    depth: (x, z) => level(x, z) - floorAt(x, z),
    pond: (x, z) => !!ponds.in(x, z),
  };
}
