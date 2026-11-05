// The world the town's people walk in, in a town everyone shares (CHUNKY-153b), built from the same data the game is: the roads, the
// lanes and the river (data/roads.json, data/lanes.json), what stops anyone and the floors raised off the ground (data/solids.json),
// the ponds (data/water.json), the buildings (data/structures.json), and who's at home where, the vehicles where they're parked and the
// lights (data/crowd.json). It's what src/horde.js asks of the world, on the town's flat ground, with no page and no three.js, so it's the
// same on this machine as on Cloudflare. The data's passed in, since each of them has its own way of reading files.
//
// The ground's src/wet.js's, with src/solids.js's raised floors over it, and it stops anyone as the page does: past the end of the map,
// whatever's built, a parked vehicle, and anything that's more than 0.7 m up from where they're standing. What they see and where they
// wander, who's burnt down and how far over they stand, where nobody goes and the doors the people at home come out of are the page's own
// (index.html, where the crowd's world is made). The river brings anyone it's had up as the page has it, by src/river.js, and never inside
// `keepOut`, which is the compound on Pine Forest Rd's grounds.
import { buildMap } from '../src/map.js';
import { buildWater } from '../src/water.js';
import { createSolids } from '../src/solids.js';
import { channel, createWet } from '../src/wet.js';
import { createRiver, surfacing } from '../src/river.js';
import { placeStructures, boundsOf, insideRing, wallsOf } from '../src/structures.js';
import { burntDown, hipsOf } from '../src/agents.js';
import { KINDS, inVehicle } from '../src/vehicles.js';

const STEP = .7, SEED = 20260214, HOUSE_CELL = 32, VEH_CELL = 16;
// what the first of the people at home is numbered, and each after is one more, as the game has them
export const HOME_ID = 1000;

export function createWorld({ roads, lanes, water, solids: solidsData, structures = null, crowd = null, seed = SEED, keepOut = null }) {
  const map = buildMap(roads, { riverAtBridge: channel, lanes }), ponds = buildWater(water, map), solids = createSolids(solidsData);
  const wet = createWet({ map, ponds, raised: solids.raised });
  const at = (x, z) => map.fromTrue(x, z);
  // The compound on Pine Forest Rd's grounds, where the owner wants nobody, with the way out for anyone caught inside, and the church on
  // Church St, where nobody comes for anyone while it stands
  const grounds = (() => { const [x0, z0] = at(855.5, 572), [x1, z1] = at(1088, 739); return { x0, z0, x1, z1, out: at(850, 737), on: (x, z) => x > x0 && x < x1 && z > z0 && z < z1 }; })();
  const church = (() => { const [x, z] = at(-309, -228); return { x, z, r: 28 }; })();
  keepOut ??= grounds.on;
  // their own random numbers, the same way the page's are, and the same from the same start
  let r = seed;
  const rand = () => (r = (r * 16807) % 2147483647) / 2147483647;

  // the same place is asked for over and over in a step, as in the page
  let fx = NaN, fz = NaN, fy = 0;
  const floorAt = (x, z) => { if (x !== fx || z !== fz) { fx = x; fz = z; fy = wet.floorAt(x, z); } return fy; };
  const isWet = (x, z) => floorAt(x, z) < wet.level(x, z) - .1;

  // Every vehicle where the game parks it, by its place in the game's list, which is its number on the wire. Once someone's left one
  // somewhere else it's there (park), and while someone's in it it's wherever they are and parked nowhere (ride). It stops anyone within
  // .3 m of it and under its roof, and it's kept by cells 16 m on a side, as the page keeps them.
  const parked = (crowd?.parked ?? []).map(([kind, x, z, yaw], i) => ({ i, kind, K: KINDS[kind], x, z, yaw, y: 0, on: false })), vehCells = new Map();
  const vehCell = (cx, cz) => (cx + 32768) * 65536 + cz + 32768;
  function mark(v, on) {
    const r = Math.hypot(v.K.length, v.K.width) / 2 + .4;
    for (let cx = Math.floor((v.x - r) / VEH_CELL); cx <= Math.floor((v.x + r) / VEH_CELL); cx++) for (let cz = Math.floor((v.z - r) / VEH_CELL); cz <= Math.floor((v.z + r) / VEH_CELL); cz++) {
      const k = vehCell(cx, cz); let list = vehCells.get(k);
      if (on) { if (!list) vehCells.set(k, list = []); if (!list.includes(v)) list.push(v); }
      else if (list) { const j = list.indexOf(v); if (j >= 0) list.splice(j, 1); if (!list.length) vehCells.delete(k); }
    }
    v.on = on;
  }
  const ride = (i) => { const v = parked[i]; if (v?.on) mark(v, false); };
  function park(i, x, z, yaw) {
    const v = parked[i]; if (!v) return;
    ride(i); v.x = x; v.z = z; v.yaw = yaw; v.y = floorAt(x, z); mark(v, true);
  }
  parked.forEach((v) => park(v.i, v.x, v.z, v.yaw));
  function parkedAt(x, z, y) {
    const list = vehCells.get(vehCell(Math.floor(x / VEH_CELL), Math.floor(z / VEH_CELL)));
    if (list) for (let i = 0; i < list.length; i++) if (y < list[i].y + 1.4 && inVehicle(list[i], x, z, .3)) return true;
    return false;
  }

  // What stops anyone that isn't the ground: the end of the map, past which it's woods nobody walks, whatever's built and a parked vehicle.
  // What they see and the river's banks go by this, and where they can walk by this and the step up.
  const stops = (x, z, y) => !map.inBounds(x, z) || solids.stops(x, z, y) || parkedAt(x, z, y);
  const blocked = (x, z, y) => stops(x, z, y) || floorAt(x, z) - y > STEP;
  // Round a corner, behind a wall or a building, he can't be seen. His head's at the height of theirs, which is what the wall has to be
  // higher than, and the last 0.8 m short of him is left out, so that a wall he's standing against doesn't hide him from what's in front of it.
  function sees(s, p) {
    const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz), y = Math.max(s.y, p.y) + 1.5, n = Math.ceil((d - .8) / .5);
    for (let i = 1; i <= n; i++) { const k = Math.min(i * .5, d - .8) / (d || 1); if (stops(s.x + dx * k, s.z + dz * k, y)) return false; }
    return true;
  }
  // How far out of town someone is, from its middle in true metres: more of them have burnt down the further out they came out, and how
  // far over they stand goes with it, which is src/agents.js's
  const fromTown = (s) => Math.hypot(...map.toGame(s.x, s.z));
  // on down whichever street they're nearest, or anywhere near if there's none
  function wander(s) {
    if (map.roadGrid.nearest(s.x, s.z) === Infinity) return [s.x + (rand() - .5) * 20, s.z + (rand() - .5) * 20];
    const id = map.roadGrid.seg.owner.id, p = map.along(id, map.sOn(id, s.x, s.z) + (rand() < .5 ? -1 : 1) * (6 + rand() * 30));
    return [p.x + (rand() - .5) * 8, p.z + (rand() - .5) * 8];
  }

  // every building, by cells 32 m on a side, and which one's here
  const placed = structures ? placeStructures(structures, map) : [], houses = new Map();
  for (const s of placed) {
    const b = boundsOf(s.pts);
    for (let cx = Math.floor(b.x0 / HOUSE_CELL); cx <= Math.floor(b.x1 / HOUSE_CELL); cx++) for (let cz = Math.floor(b.z0 / HOUSE_CELL); cz <= Math.floor(b.z1 / HOUSE_CELL); cz++) {
      const k = (cx + 32768) * 65536 + cz + 32768; let list = houses.get(k); if (!list) houses.set(k, list = []); list.push(s);
    }
  }
  function houseAt(x, z) {
    const list = houses.get((Math.floor(x / HOUSE_CELL) + 32768) * 65536 + Math.floor(z / HOUSE_CELL) + 32768);
    if (list) for (const s of list) if (insideRing(x, z, s.pts)) return s;
    return null;
  }

  // Who's at home where: each home's number, which is HOME_ID and its place among them, and the house, which is somebody's twice where
  // two live there
  const byId = new Map(placed.map((s) => [s.id, s]));
  const homes = (crowd?.homes ?? []).map((id, i) => ({ id: HOME_ID + i, s: byId.get(id) }));
  // Where someone comes out of their house: a step out from its front door, facing out from it, and where inside it they go back to, or
  // nowhere if the door's somewhere nobody can stand
  function doorOf(h) {
    const d = wallsOf(h.s, 0).doors[0];
    if (!d) return null;
    let nx = d.nx, nz = d.nz; if (houseAt(d.x + nx * 1.5, d.z + nz * 1.5) === h.s) { nx = -nx; nz = -nz; }
    const door = [d.x + nx * 1.3, d.z + nz * 1.3], inside = [d.x - nx * 1.5, d.z - nz * 1.5];
    return stops(door[0], door[1], 0) || isWet(door[0], door[1]) ? null : { door, inside, nx, nz };
  }
  // the lights that draw them at night, each with the props that put it out when they're broken
  const lights = (crowd?.lights ?? []).map(([x, z, r, k]) => ({ x, z, r, k }));

  const comeUp = surfacing(createRiver(map.river), {
    water: isWet, pond: wet.pond, floorAt,
    depth: (x, z) => wet.level(x, z) - floorAt(x, z),
    blocked: (x, z, y) => stops(x, z, y) || keepOut(x, z),
  });
  return {
    map, ponds, solids, wet, structures: placed, floorAt, water: isWet, level: wet.level, stops, blocked, sees, wander, rand, houseAt, comeUp,
    parked, park, ride, homes, doorOf, lights,
    quiet: (s) => !burntDown(s.who, fromTown(s)), hips: (s) => hipsOf(s.who, fromTown(s)), grounds, church, keepOut,
  };
}
