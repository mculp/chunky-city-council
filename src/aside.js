// Where nothing breaks online (CHUNKY-152): the places in the bible's section 17, where real people live or lie. In the story only he
// sees what he's broken. Online everyone would, for a day, so there a truck bumps off like a wall, a swing lands on nothing, and the
// town keeps no wreck. There's no three.js or page in here, so the town asks it too.
//
// In true metres from town center, +x east and +z south, as src/map.js has them.
import { insideRing } from './structures.js';
import { fromCemetery } from './graves.js';

// Stuckey's Bridge, in true metres, which is the world's middle (data/roads.md)
export const BRIDGE = [6843.067, 7797.433];
// [west, north, east, south]
const BOXES = [
  [835, 548, 1220, 801],        // the compound on Pine Forest Rd, from its sign across the road to past the river, and the woods and fence round it (src/frontage.js)
  [-1600, -830, -1490, -745],   // the yard off True Light Rd
  [-730, 1630, -440, 1780],     // the farm's yard
  [-12, -526, 44, -468],        // a home, its barn and its yard, from the road
  [-370, -588, -350, -561],     // the trailer with the computer in it, and its deck, and not the trailers either side of it
  [-280, 184, -244, 215],       // Robby's lot
];
const FENCE = 6, SPOT = 4, PAST_THE_FENCE = 4;

const inBox = (x, z, [w, n, e, s]) => x > w && x < e && z > n && z < s;
function toLine(x, z, line) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1], [bx, bz] = line[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

// `farm` is data/farm.json: the whole of it, its pastures, its fences, its lone trees and its bales, from the river to the far pasture.
// Without it, it's only the farm's yard.
export function createAside(farm = null) {
  const rings = farm ? [...farm.open, ...farm.young].map((o) => o.ring) : [], fences = farm?.fences ?? [], spots = farm ? [...farm.lone, ...farm.bales] : [];
  // the farm's land in one box first, so anywhere else is asked about it once
  const all = [...rings.flat(), ...fences.flat(), ...spots];
  const land = all.length ? [Math.min(...all.map((p) => p[0])) - FENCE, Math.min(...all.map((p) => p[1])) - FENCE, Math.max(...all.map((p) => p[0])) + FENCE, Math.max(...all.map((p) => p[1])) + FENCE] : null;
  const onFarm = (x, z) => !!land && inBox(x, z, land) && (rings.some((r) => insideRing(x, z, r)) || fences.some((l) => toLine(x, z, l) < FENCE) || spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < SPOT));
  const at = (x, z) => BOXES.some((b) => inBox(x, z, b)) || fromCemetery(x, z) < PAST_THE_FENCE || onFarm(x, z);
  return { at, world: (x, z) => at(x + BRIDGE[0], z + BRIDGE[1]) };
}
