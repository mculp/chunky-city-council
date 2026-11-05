// The town's people, run by the town everyone shares (CHUNKY-153b): the crowd out on the streets and the people at home near whoever's
// in town, put back once nobody's near and out again just as they were, and everything src/horde.js does with them, for every player at
// once. It's what the page does in index.html's bringOutCrowd, fillHomes and tidyFolk, measured from everyone in town instead of from him,
// on the town's world (server/world.js), with no page and no three.js.
//
// step(dt, players, now) is ten times a second, with everyone in town as horde.update takes them: { id, x, z, y, yaw, ride, canGrab,
// noise, beans, night, hidden, driving, acting }, y being the town's floor where they are, and now the town's clock in seconds, which the
// trains run to, as every phone runs them. Without it there are none. A phone that's driving sends its vehicle's place, so whatever someone's
// in is where they are, in the way of anyone on foot, and it's parked wherever they get out. It gives back what happened, each with the
// folks number of whoever it happened to, and for getting hold of someone, letting go and running them down, the player.
//
// wreck(w) and heal(k) are what's broken and what's healed, as the town keeps it (src/wrecks.js), and car(i, at) is where a vehicle's
// been left, or back where it's parked with nowhere said.
import { createHorde } from '../src/horde.js';
import { createFolks } from '../src/agents.js';
import { hash2 } from '../src/structures.js';
import { inVehicle } from '../src/vehicles.js';
import { createTrains } from '../src/trains.js';
import { partsOf } from '../src/damage.js';
import { keyOf, kindOf, decodeParts } from '../src/wrecks.js';

// where the crowd's put out, along the streets of town and thickest on US 80, in true metres from town center, as the page has them
export const STREETS = [['us_80', [-615, -18], [185, 0], 56], ['church_st', [-1098, -379], [-281, -199], 20], ['adams_st', [-283, -23], [-285, -338], 20]];
// the people at home come out within this of anyone and are put back past this from everyone, looked at once a second, as the page does
export const HOME_SEE = 190, HOME_PUT = 300, HOME_LOOK = 1;
// and nobody's put out on the streets this close to anyone
const CLEAR = 35;
// how long anyone a train throws is down for, off the side of it and off the front, and up to 6 s and 10 s more, as index.html's DOWN_FOR
// has it, which is longer than anything else keeps anyone down
const DOWN_BY_TRAIN = [30, 45];

export function createCrowd(world, { folks: folksData, looks = [], store = null, tuning = {} } = {}) {
  const folks = createFolks(folksData, { store, looks }), told = [];
  const tell = (t, s, more) => told.push({ t, id: s.who.id, ...more });

  // The trains, to the town's clock as every phone runs them (src/trains.js's timetable). Where they are, they're in the way of anyone on
  // foot or thrown up in the air, and of anyone seeing past them, as on the page, though not of anyone under a trestle.
  const trains = world.siding ? createTrains(world.rail, { timetable: { siding: world.siding }, world: {} }) : null;
  const onTrain = (x, z, y) => !!trains?.trains.length && y > -2 && !!trains.at(x, z, .15);
  const going = (tr) => tr.speed >= 1;
  // Anyone on the tracks in front of one that's going is thrown clear of them, off the front further and harder than off the side, as
  // index.html's trainThrows does, from random numbers of their own as the page's are. The index.html patch for 153b moves it to src/trains.js.
  let trainR = 20261102;
  const trainRand = () => (trainR = (trainR * 16807) % 2147483647) / 2147483647, hit = { x: 0, z: 0, vx: 0, vz: 0, vy: 0, hard: false, seconds: 0, spin: 0 };
  function trainThrows(x, z, y) {
    if (y < -2) return null;
    const c = trains.at(x, z, .3), tr = c && trains.of(c);
    if (!tr || !going(tr)) return null;
    const side = trains.side(c, x, z), ax = c.fz * side, az = -c.fx * side, along = (x - c.x) * c.fx + (z - c.z) * c.fz, front = c === tr.cars[0] && along > c.len / 2 - 2.5, r = trainRand();
    hit.x = c.x + c.fx * along + ax * (c.half + .5); hit.z = c.z + c.fz * along + az * (c.half + .5);
    const ahead = front ? tr.speed * (.6 + r * .35) : 0, off = front ? 7 + r * 6 : 7 + r * 2;
    hit.vx = c.fx * ahead + ax * off; hit.vz = c.fz * ahead + az * off; hit.vy = front ? 5 + r * 5 : 2.5; hit.hard = front;
    hit.seconds = DOWN_BY_TRAIN[+front] + r * (front ? 10 : 6); hit.spin = front ? 8 + r * 8 : 3;
    return hit;
  }

  // what's being driven, by its place in the game's list, where its driver last had it
  const driven = new Map();
  // and it's in the way of anyone on foot, though not anyone it's thrown up in the air, who goes over it
  function blocked(x, z, y, flying) {
    if (world.blocked(x, z, y) || onTrain(x, z, y)) return true;
    if (!flying) for (const v of driven.values()) if (inVehicle(v, x, z, .3)) return true;
    return false;
  }
  const stops = (x, z, y) => world.stops(x, z, y) || onTrain(x, z, y), sees = (s, p) => world.sees(s, p, onTrain);
  const horde = createHorde({ ...world, folks, blocked, sees, reaching: (s) => tell('reaching', s) }, tuning, {
    grab: (g, pid) => told.push({ t: 'grab', pid, ids: g.who.map((s) => s.who.id), at: g.at }),
    free: (pid) => told.push({ t: 'free', pid }),
    overrun: (pid) => told.push({ t: 'overrun', pid }),
    spotted: (s) => tell('spotted', s),
    roused: (s, why) => tell('roused', s, { why: why?.kind ?? null }),
    thrown: (s) => tell('thrown', s),
    splash: (s) => tell('splash', s),
    surfaced: (s) => tell('surfaced', s),
    drop: (s) => tell('drop', s),
    flung: (s) => tell('flung', s),
    bounce: (s, speed) => tell('bounce', s, { speed }),
  });
  // nobody comes for anyone on the compound on Pine Forest Rd's grounds or in the church on Church St, and the lights draw them at night
  horde.zones.push(world.grounds, world.church);
  horde.lights.push(...world.lights);

  const nearest = (x, z, players) => { let d = Infinity; for (const p of players) d = Math.min(d, Math.hypot(p.x - x, p.z - z)); return d; };

  // The street crowd, put out once there's anyone in town, the way the page puts it out when the crowd comes out
  let streets = false;
  function putOut(players) {
    const { map } = world;
    for (const [id, a, b, n] of STREETS) {
      const s0 = map.sOn(id, ...map.fromTrue(...a)), s1 = map.sOn(id, ...map.fromTrue(...b));
      for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) {
        const p = map.along(id, s0 + (s1 - s0) * world.rand()), x = p.x + (world.rand() - .5) * 10, z = p.z + (world.rand() - .5) * 10;
        if (nearest(x, z, players) < CLEAR || horde.inSanctuary(x, z) || world.water(x, z) || stops(x, z, world.floorAt(x, z)) || world.houseAt(x, z)) continue;
        horde.add(x, z); i++;
      }
    }
  }

  // The people at home, out as anyone gets near their house, which is measured from its first corner as the page measures it. Anyone
  // who lives somewhere is put back once nobody's within 300 m of them, just as they were, and out again as anyone's within 190 m.
  const homes = world.homes.map((h) => ({ h, out: false })), putBack = [];
  let look = 0;
  function atHome(dt, players) {
    if ((look -= dt) > 0) return;
    look = HOME_LOOK;
    for (let i = horde.all.length - 1; i >= 0; i--) { const s = horde.all[i]; if (s.who?.calm && nearest(s.x, s.z, players) > HOME_PUT) putBack.push(horde.remove(s)); }
    for (let i = putBack.length - 1; i >= 0; i--) { const s = putBack[i]; if (nearest(s.x, s.z, players) < HOME_SEE) { putBack.splice(i, 1); horde.restore(s); } }
    for (const o of homes) {
      const { h } = o, [hx, hz] = h.s.pts[0];
      if (o.out || nearest(hx, hz, players) > HOME_SEE) continue;
      o.out = true;
      const d = world.doorOf(h);
      if (!d) continue;
      const who = folks.person(h.id), { door, nx, nz } = d;
      who.calm = true;
      const s = horde.add(door[0], door[1], { who, home: d });
      s.timer = hash2(h.id, 82) * 10; s.yaw = Math.atan2(nx, nz);
      // the second of them's in the yard to start with
      if (hash2(h.id, 84) < .5) {
        const off = 2 + hash2(h.id, 85) * 4, by = (hash2(h.id, 86) - .5) * 8, x = door[0] + nx * off + nz * by, z = door[1] + nz * off - nx * by;
        if (!stops(x, z, 0)) { s.x = s.tx = x; s.z = s.tz = z; s.y = world.floorAt(x, z); }
      }
    }
  }

  // Whatever someone's driving isn't parked anywhere, and once they're out of it, it's parked where they left it
  function rides(players) {
    const now = new Set();
    for (const p of players) {
      const i = (p.ride ?? 0) - 1, v = world.parked[i];
      if (!v) continue;
      now.add(i);
      if (!driven.has(i)) world.ride(i);
      driven.set(i, { x: p.x, z: p.z, yaw: p.yaw, K: v.K });
    }
    for (const [i, v] of driven) if (!now.has(i)) { driven.delete(i); world.park(i, v.x, v.z, v.yaw); }
  }
  // where a vehicle's been left, or back where the game parks it with nowhere said, unless someone's in it, who has it wherever they are
  function car(i, at) { if (!driven.has(i)) { if (at) world.park(i, at.x, at.z, at.yaw); else world.park(i); } }

  // What's broken, each the whole of what's happened to one thing, as the town keeps it. Whatever's built stops nobody where it's come down
  // (src/solids.js), a light's out while any prop that puts it out is broken, the church on Church St is no refuge once more than .4 of its
  // walls are down, as the page counts them (src/damage.js's gone), and a vehicle that's been sent somewhere lies there.
  const broken = new Set();
  const church = world.churchHouse && (() => { const { parts, walls } = partsOf(world.churchHouse); return { k: keyOf.building(world.churchHouse.id), n: parts.length, walls: new Set(walls.map((w) => w.part)) }; })();
  function lit() {
    for (const l of world.lights) {
      const out = l.k.some((k) => broken.has(k)), i = horde.lights.indexOf(l);
      if (out && i >= 0) horde.lights.splice(i, 1); else if (!out && i < 0) horde.lights.push(l);
    }
  }
  function refuge(stands) {
    const i = horde.zones.indexOf(world.church);
    if (stands && i < 0) horde.zones.push(world.church); else if (!stands && i >= 0) horde.zones.splice(i, 1);
  }
  function wallsDown(w) {
    let parts = null;
    try { parts = decodeParts(w.p); } catch { /* not base64 */ }
    return (parts ?? []).filter((q) => q.gone && church.walls.has(q.part)).length / church.walls.size;
  }

  return {
    horde, folks, blocked, sees, trains,
    step(dt, players, now) {
      // the trains first, so that nobody's put out in one, and anyone in front of one is thrown from where they've got to
      const trainsOut = !!trains && now !== undefined && players.length > 0;
      if (trainsOut) trains.update(dt, players[0], now);
      rides(players);
      if (players.length && !streets) { streets = true; putOut(players); }
      atHome(dt, players);
      horde.update(dt, players);
      if (trainsOut && trains.trains.some(going)) horde.runOver(trainThrows);
      return told.splice(0);
    },
    // a press of A while they've hold of someone, from that someone's phone
    mash: (pid) => horde.mash(pid),
    wreck(w) {
      const kind = kindOf(w?.k);
      if (!kind) return;
      world.solids.take(w);
      if (kind === 'p') { broken.add(w.k); lit(); }
      else if (kind === 'v') car(+w.k.slice(1), w);
      else if (church && w.k === church.k && w.n === church.n && wallsDown(w) > .4) refuge(false);
    },
    heal(k) {
      const kind = kindOf(k);
      if (!kind) return;
      world.solids.heal(k);
      if (kind === 'p') { broken.delete(k); lit(); }
      else if (kind === 'v') car(+k.slice(1), null);
      else if (church && k === church.k) refuge(true);
    },
    car,
  };
}
