// Fills the town and goes round it on a phone-sized page, with real taps and the game's own movement: people at their doors who leave him be until he gives them a reason, somebody
// coming and going, drivers on their own side of the real roads who stop for him and go round him, ramming one and taking another's car, and the kids on four-wheelers on the lanes
// and drives, who get out of the way of everything and can't be touched. What it all costs is at the end.
//
//   npm i && npm run town [-- --shots dir]
import { mkdirSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); };
// how someone is with him, for what a check says: nothing in the game writes it
const MOODS = ['leaving him be', 'after him', 'keeping away', 'following him'];

await g(() => {
  const G = __game; G.pause(); G.fillTown(); G.jump('town'); G.S.flags.town = true; G.S.flags.ended = G.S.flags.arrived = true; G.step(.1);
  document.getElementById('card').style.display = 'none';
  window.T = 1 / 30;
  window.P = () => G.player.pos;
  window.near = (s) => Math.hypot(s.x - P().x, s.z - P().z);
  window.at = (tx, tz, yaw = 0) => { const [x, z] = G.map.fromTrue(tx, tz); G.place(x, z); G.player.yaw = yaw; G.look(yaw + Math.PI, .3); G.HP.speed = 0; };
});

// ---- people at home
const homes = await g(() => {
  const G = __game, H = G.homes, count = (f) => H.filter((h) => G.folks.person(h.id).family === f).length;
  // everyone's door, worked out for all of them this once
  return { n: H.length, alexander: count('Alexander'), clark: count('Clark'), gressett: count('Gressett'), sample: H.slice(0, 6).map((h) => G.folks.person(h.id).name) };
});
console.log(`     ${homes.n} people at home, such as ${homes.sample.join(', ')}`);
check('most of the houses have someone at home', homes.n > 600 && homes.n < 1000, homes);
check('half of them are Alexanders or Clarks', Math.abs(homes.alexander + homes.clark - homes.n / 2) <= 2, homes);
check('and an eighth are Gressetts', Math.abs(homes.gressett - homes.n / 8) <= 2, homes);

// A walk down a street in town: who's there, and that they leave him be
const walk = await g(() => {
  const G = __game; G.traffic.on = false;
  // whichever stretch of street has the most houses on it
  let road = null, s0 = 0, most = -1;
  for (const r of G.map.roads) {
    if (r.id === 'us_80' || r.surface !== 'asphalt') continue;
    for (let a = 0; a + 260 < r.length; a += 40) {
      let n = 0; for (const h of G.homes) { const [x, z] = h.s.pts[0], t = G.map.sOn(r.id, x, z), q = G.map.along(r.id, t); if (t > a && t < a + 260 && Math.hypot(q.x - x, q.z - z) < 30) n++; }
      if (n > most) { most = n; road = r.id; s0 = a; }
    }
  }
  const s1 = s0 + 260, p0 = G.map.along(road, s0); G.place(p0.x, p0.z); G.step(.2);
  const seen = new Set(), states = new Set(); let closest = Infinity, t = 0;
  G.key('w', true);
  while (t < 60) {
    const s = G.map.sOn(road, P().x, P().z); if (s > s1) break;
    const q = G.map.along(road, s + 8); const yaw = Math.atan2(q.x - P().x, q.z - P().z); G.look(yaw + Math.PI, .3); G.player.yaw = yaw;
    G.sim(T, T); t += T;
    for (const c of G.horde.active) if (c.home && near(c) < 25) { seen.add(c.who.id); states.add(c.state); closest = Math.min(closest, near(c)); }
  }
  G.key('w', false); G.step(.3);
  const everyone = G.horde.all.filter((c) => c.home), bad = everyone.filter((c) => G.houseAt(c.home.door[0], c.home.door[1]) || G.floorAt(c.home.door[0], c.home.door[1]) < G.water.level(c.home.door[0], c.home.door[1]) - .1);
  return { road, most, seen: seen.size, states: [...states], t, closest, added: everyone.length, grabbed: !!G.horde.grab, hp: G.S.hp, bad: bad.length, active: G.horde.active.length };
});
console.log(`     walking ${walk.road} in ${walk.t.toFixed(0)} s, past ${walk.most} people's houses: ${walk.seen} people within 25 m, ${walk.added} out so far`);
check('a walk past the houses finds people there', walk.seen >= 5, walk);
check('and they leave him be', !walk.grabbed && walk.states.every((s) => s === 0 || s === 1), walk);
check('their doors are out in the open, and none of them\'s in the water', walk.bad === 0, walk);
await snap('1-street');

// ---- somebody coming and going
const going = await g(() => {
  const G = __game, s = G.horde.active.filter((c) => c.home && !c.who.met).sort((a, b) => near(a) - near(b))[0] ?? G.horde.active.find((c) => c.home);
  const startsAt = [s.x, s.z], door = s.home.door, been = { door: 0, inside: 0, yard: 0, off: 0 };
  let moved = 0, stopped = 0, far = 0, took = 0;
  // a long way off from them, so it's only what they're doing
  const px = P().x, pz = P().z;
  G.place(s.x + 60, s.z + 60);
  // Going in is a roll each time they stop at the door, about one in three, so four minutes of it can go by without. Then it watches on, for up to twelve.
  for (let t = 0; t < 240 || (t < 720 && !(been.door && been.inside && been.yard)); t += .2) {
    G.sim(.2, 1 / 15);
    const d = Math.hypot(s.x - door[0], s.z - door[1]);
    if (s.inside) been.inside++; else if (d < 2) been.door++; else if (d < 12) been.yard++; else been.off++;
    if (t < 240) { far = Math.max(far, d); if (s.moving) moved++; else stopped++; }
    took = t + .2;
  }
  G.place(px, pz);
  return { name: s.who.name, been, moved, stopped, far, took, state: s.state, homebody: s.who.homebody, startsAt };
});
console.log(`     ${going.name}: ${JSON.stringify(going.been)} over ${Math.round(going.took / 60)} minutes, up to ${going.far.toFixed(0)} m from the door in the first 4`);
check('someone at home moves around and stays a while', going.moved > 40 && going.stopped > 200, going);
check('between the door, the house and the yard', going.been.door > 0 && going.been.inside > 0 && going.been.yard > 0, going);
check('and doesn\'t wander off for good', going.far < 80, going);

// ---- give them a reason
const reason = await g(() => {
  const G = __game; G.traffic.on = false;
  const s = G.horde.active.filter((c) => c.home && c.who.nerve > .3).sort((a, b) => near(a) - near(b))[0]; s.inside = false;
  const [x, z] = s.home.door; s.x = s.tx = x; s.z = s.tz = z; s.state = 0;
  G.place(x + s.home.nx * 1.1, z + s.home.nz * 1.1); const yaw = Math.atan2(-s.home.nx, -s.home.nz); G.player.yaw = yaw; G.look(yaw + Math.PI, .3); G.HP.speed = 0; G.step(.2);
  window.victim = s;
  return { calm: s.who.calm, mood: G.folks.mood(s.who), state: s.state };
});
check('someone at home to start with, leaving him be', reason.calm && reason.mood === 0, reason);
await snap('2-at-home');
await page.tap('#bA');
const after = await g(() => { const G = __game; G.sim(.5, T); return { hurt: victim.who.hurt, flat: victim.flat, mood: G.folks.mood(victim.who) }; });
check(`hit them and they don't leave him be any more: they're ${MOODS[after.mood]}`, after.hurt === 1 && after.flat > 0 && after.mood !== 0, after);
await g(() => { const G = __game; G.folks.forget(); G.horde.calm(); });

// ---- someone driving
const lanes = await g(() => {
  const G = __game; G.traffic.on = true; G.traffic.T.every = [.5, 1]; G.traffic.T.cars = 4; G.traffic.T.gone = 300; G.traffic.soon();
  // drive the whole way along US 80, in his own truck
  const samples = []; let passed = new Set(), t = 0, n = 0;
  const road = G.map.roadById.get('us_80');
  const [x, z] = G.map.fromTrue(-1100, -30); G.place(x, z);
  const truck = G.vehicles.filter((v) => v.kind === 'pickup' && !v.ai)[0];
  const s = G.map.sOn('us_80', x, z), q = G.map.along('us_80', s);
  truck.x = q.x + q.nx * -1.9; truck.z = q.z + q.nz * -1.9; truck.y = G.floorAt(truck.x, truck.z); truck.yaw = Math.atan2(q.tx, q.tz);
  G.step(.6, T);
  G.place(truck.x + 2, truck.z); G.step(.6, T); G.key('e', true); G.sim(T, T); G.key('e', false); G.sim(.2, T);
  const d = G.driving();
  const hit = { before: d?.hp };
  // on with the stick, with the camera behind him
  G.stick(0, 1);
  while (t < 90) {
    const here = G.map.sOn('us_80', d.x, d.z), a = G.map.along('us_80', here + 16), want = Math.atan2(a.x - d.x, a.z - d.z);
    let dy = want - d.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); G.stick(Math.max(-1, Math.min(1, -dy * 4)), 1); G.look(d.yaw + Math.PI, .3);
    G.sim(T, T); t += T; n++;
    for (const c of G.traffic.cars) {
      const v = c.v, dd = Math.hypot(v.x - d.x, v.z - d.z);
      if (dd < 14) passed.add(c.who.id);
      if (n % 15 === 0 && c.passUntil === null) {
        const q2 = G.map.along(c.road.id, c.s), rx = -q2.tz * c.dir, rz = q2.tx * c.dir, across = (v.x - q2.x) * rx + (v.z - q2.z) * rz, half = c.road.width / 2;
        samples.push({ across, half, road: c.road.id, f: v.f });
      }
    }
    if (here > road.length * .92) break;
  }
  G.stick(0, 0); G.key(' ', true); G.sim(1.5, T); G.key(' ', false);
  d.f = d.s = 0; G.sim(.2, T); G.key('e', true); G.sim(T, T); G.key('e', false); G.sim(.2, T);
  const wrong = samples.filter((q) => q.across < 0), off = samples.filter((q) => q.across > q.half);
  return { passed: passed.size, seconds: t, samples: samples.length, wrong: wrong.length, off: off.length, some: wrong.slice(0, 3), speeds: Math.max(0, ...samples.map((q) => q.f)), hp: d.hp, before: hit.before, driving: !!G.driving(), roads: [...new Set(samples.map((q) => q.road))], mode: G.S.mode };
});
console.log(`     along US 80 in ${lanes.seconds.toFixed(0)} s: passed ${lanes.passed} people driving, on ${lanes.roads.join(', ')}, up to ${lanes.speeds.toFixed(0)} m/s`);
check('a drive through town passes people driving', lanes.passed >= 2 && lanes.samples > 50, lanes);
check('and they\'re on their own side of the road', lanes.wrong <= lanes.samples * .02 && lanes.off <= lanes.samples * .02, lanes);

// Standing in the road with someone coming
const stand = async () => g(() => {
  const G = __game; G.traffic.on = true; G.traffic.T.every = [1e9, 1e9]; G.traffic.T.gone = 1e5;
  G.traffic.clear();
  G.horde.calm();
  // the east end of town on US 80, with nobody else on it, and him standing where they'd drive
  const road = 'us_80', s0 = G.map.sOn(road, ...G.map.fromTrue(300, -5));
  const here = G.map.along(road, s0), side = 1.9;
  G.place(here.x + -here.tz * side, here.z + here.tx * side); G.player.yaw = 0; G.HP.speed = 0; G.step(.2);
  return true;
});
await stand();
const stops = await g(() => {
  const G = __game, road = 'us_80', s0 = G.map.sOn(road, P().x, P().z);
  G.traffic.T.cars = 1; G.traffic.T.every = [0, 0]; G.traffic.T.from = [40, 200]; G.traffic.soon();
  let c = null; for (let i = 0; i < 2000 && !c; i++) { G.sim(1 / 30, 1 / 30); c = G.traffic.cars[0]; }
  G.traffic.T.cars = 1; G.traffic.T.every = [1e9, 1e9];
  const r = G.map.roadById.get(road); c.road = r; c.dir = 1; c.s = s0 - 90; c.plan = null; const q = G.map.along(road, c.s), fx = q.tx, fz = q.tz;
  c.off = c.want = 1.9; c.v.x = q.x - fz * 1.9; c.v.z = q.z + fx * 1.9; c.v.yaw = Math.atan2(fx, fz); c.v.f = 14;
  // a real driver with nothing against him
  window.theCar = c; G.folks.forget(); c.who.temper = .4;
  let closest = Infinity, first = null, t = 0, stoppedAt = null;
  const hpWas = G.S.hp;
  while (t < 30 && c.passUntil === null) { G.sim(T, T); t += T; const d = near(c.v); closest = Math.min(closest, d); if (c.v.f < .2 && stoppedAt === null) stoppedAt = d; }
  const waited = t, wasPassing = c.passUntil !== null;
  G.step(.2);
  return { closest, stoppedAt, waited, wasPassing, hpWas };
});
check(`someone driving stops for him, ${(stops.stoppedAt ?? 0).toFixed(1)} m off`, stops.stoppedAt !== null && stops.stoppedAt > 3.5 && stops.stoppedAt < 22, stops);
check(`and after ${stops.waited.toFixed(0)} s starts round him`, stops.wasPassing, stops);
await snap('3-going-round');
const round = await g(() => {
  const G = __game, c = theCar; let closest = Infinity, t = 0, crossed = false;
  while (t < 22 && (c.passUntil !== null || (c.s - G.map.sOn('us_80', P().x, P().z)) < 8)) { G.sim(T, T); t += T; closest = Math.min(closest, near(c.v)); const q = G.map.along('us_80', c.s), across = (c.v.x - q.x) * -q.tz + (c.v.z - q.z) * q.tx; if (across < 0) crossed = true; }
  G.sim(4, T);
  const q = G.map.along('us_80', c.s), across = (c.v.x - q.x) * -q.tz + (c.v.z - q.z) * q.tx;
  return { closest, t, crossed, across, past: c.s - G.map.sOn('us_80', P().x, P().z), hp: G.S.hp, mode: G.S.mode, f: c.v.f };
});
check(`and goes round him, no closer than ${round.closest.toFixed(1)} m, and back on its own side`, round.crossed && round.closest > 2.1 && round.past > 8 && round.across > 1, round);

// Ramming one: it's only a car now, and they're out of it
const rammed = await g(() => {
  const G = __game; G.folks.forget(); G.traffic.T.gone = 1e5;
  const c = theCar, v = c.v, who = c.who; c.dir = 1;
  const truck = G.vehicles.filter((o) => o.kind === 'pickup' && !o.ai && !o.wrecked)[1];
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
  v.f = 0; c.want = c.off;
  truck.x = v.x - fx * 26; truck.z = v.z - fz * 26; truck.y = G.floorAt(truck.x, truck.z); truck.yaw = v.yaw; G.step(.6, T);
  G.place(truck.x + 2, truck.z); G.step(.6, T); G.key('e', true); G.sim(T, T); G.key('e', false); G.sim(.2, T);
  const d = G.driving(); if (!d) return { no: 'truck' };
  d.f = 18; G.stick(0, 1); G.look(d.yaw + Math.PI, .3);
  c.next = 1e9; c.what = null; c.ahead = 0;
  let t = 0; const was = { x: v.x, z: v.z };
  while (t < 5 && v.ai) { G.sim(T, T); t += T; }
  G.stick(0, 0); G.step(.1);
  const s = who.body;
  const out = { t, freed: !v.ai, moved: Math.hypot(v.x - was.x, v.z - was.z), hurt: who.hurt, truck: who.truck, onFoot: !!s, fig: !!v.fig, name: who.name, mood: G.folks.mood(who), loose: !!v.loose };
  d.f = d.s = 0; G.sim(.2, T); G.key('e', true); G.sim(T, T); G.key('e', false); G.sim(.2, T);
  out.mode = G.S.mode;
  return out;
});
check(`ram someone and ${rammed.name} is out of it, on foot, and ${MOODS[rammed.mood]}`, rammed.freed && rammed.onFoot && !rammed.fig && rammed.hurt >= 1 && rammed.truck >= 1 && rammed.mood !== 0, rammed);
await snap('4-rammed');

// Taking someone's car when they've stopped
const taken = await g(() => {
  const G = __game; G.horde.calm(); G.folks.forget(); G.traffic.T.gone = 1e5; G.traffic.T.every = [0, 0]; G.traffic.T.cars = 1; G.traffic.soon();
  const road = 'us_80'; let c = null; for (let i = 0; i < 2000 && !c; i++) { G.sim(1 / 30, 1 / 30); c = G.traffic.cars[0]; }
  G.traffic.T.every = [1e9, 1e9];
  const s0 = G.map.sOn(road, ...G.map.fromTrue(-200, -10)); c.road = G.map.roadById.get(road); c.dir = 1; c.s = s0; c.plan = null; c.passUntil = null;
  const q = G.map.along(road, s0); c.off = c.want = 1.9; c.v.x = q.x - q.tz * 1.9; c.v.z = q.z + q.tx * 1.9; c.v.yaw = Math.atan2(q.tx, q.tz); c.v.f = 11;
  // moving, there's no getting in
  G.place(c.v.x + Math.cos(c.v.yaw) * -2.2, c.v.z + Math.sin(c.v.yaw) * 2.2); G.step(.6, T);
  const moving = G.S.act;
  window.takenCar = c;
  return { moving, f: c.v.f };
});
const stopped = await g(() => {
  const G = __game, c = takenCar;
  G.traffic.T.patience = [99, 99]; c.next = 1e9; c.what = 'him'; c.ahead = 0; G.sim(4, T);
  const v = c.v; G.place(v.x - Math.cos(v.yaw) * 2, v.z + Math.sin(v.yaw) * 2); G.step(.6, T);
  return { act: G.S.act, f: v.f, a: document.getElementById('bA').textContent };
});
check('someone stopped, he can get in', /Get in/.test(stopped.act ?? ''), { taken, stopped });
await page.tap('#bA');
const took = await g(() => {
  const G = __game, c = takenCar, who = c.who; G.sim(.3, T);
  const s = who.body;
  return { driving: G.driving() === c.v, ai: !!c.v.ai, onFoot: !!s, hurt: who.hurt, name: who.name, mood: G.folks.mood(who), near: s ? near(s) : null };
});
check(`and pulls ${took.name} out of it, who's on foot and ${MOODS[took.mood]}`, took.driving && !took.ai && took.onFoot && took.hurt === 1, took);
await g(() => { const G = __game, d = G.driving(); if (d) { d.f = d.s = 0; G.sim(.2, T); G.key('e', true); G.sim(T, T); G.key('e', false); G.sim(.2, T); } });

// ---- the kids
const kid = await g(() => {
  const G = __game; G.horde.calm(); G.traffic.T.cars = 0; G.traffic.clear();
  G.traffic.T.riders = 1; G.traffic.T.every = [0, 0]; G.traffic.T.riderGone = 1e5; G.traffic.T.riderFrom = [20, 140]; G.traffic.soon();
  // somewhere with a dirt lane
  const lane = G.map.lanes.filter((l) => l.surface === 'dirt' && l.length > 180)[0], q = G.map.along(lane.id, lane.length / 2); G.place(q.x + 30, q.z + 30);
  let c = null, n = 0; while (!c && n++ < 3000) { G.sim(1 / 15, 1 / 15); c = G.traffic.riders[0]; }
  if (!c) return { none: true };
  window.theKid = c;
  const seen = new Set(); let t = 0;
  for (; t < 40; t += T) { G.sim(T, T); seen.add(c.road.surface); }
  return { surfaces: [...seen], road: c.road.id, f: c.v.f, size: c.v.fig?.size, far: c.v.fig?.far, name: c.who.name };
});
check(`a kid on a four-wheeler goes round on ${(kid.surfaces ?? []).join(' and ')}, never on anything paved`, kid.surfaces?.length && !kid.surfaces.includes('asphalt'), kid);
check('small, and hardly gone at all', kid.size < .8 && kid.far < .2, kid);
await g(() => { const G = __game, c = theKid, v = c.v, fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); G.place(v.x + fx * 8 - fz * 2.5, v.z + fz * 8 + fx * 2.5); const yaw = Math.atan2(-fx, -fz); G.player.yaw = yaw; G.look(yaw + Math.PI, .25); G.step(.1, T); });
await snap('5-kid');
const dodge = await g(() => {
  const G = __game, c = theKid, v = c.v; let closest = Infinity, swerved = 0;
  // standing right on their line
  const q = G.map.along(c.road.id, Math.min(c.road.length - 1, Math.max(1, c.s + c.dir * 40))); G.place(q.x, q.z); G.HP.speed = 0;
  const hpWas = G.S.hp;
  for (let t = 0; t < 8; t += T) { G.sim(T, T); closest = Math.min(closest, near(v)); swerved = Math.max(swerved, Math.abs(c.off)); }
  return { closest, swerved, hp: v.hp, hpWas, hpNow: G.S.hp, act: G.S.act };
});
check(`coming at him they swerve, ${dodge.swerved.toFixed(1)} m off the line and never nearer than ${dodge.closest.toFixed(1)} m`, dodge.closest > 2 && dodge.swerved > 3, dodge);
const hitKid = await g(() => {
  const G = __game, c = theKid, v = c.v, wasHp = v.hp, K = G.horde.knock(v.x, v.z, 4, 2), hurtWas = c.who.hurt;
  // a truck straight at them, a blast, and a swing, none of which touch them
  G.place(v.x + 1.2, v.z); G.step(.6, T);
  const act = G.S.act; G.key('f', true); G.sim(.6, T); G.key('f', false);
  const truck = G.vehicles.filter((o) => o.kind === 'pickup' && !o.ai && !o.wrecked)[2];
  truck.x = v.x - Math.sin(v.yaw) * 2; truck.z = v.z - Math.cos(v.yaw) * 2; truck.y = G.floorAt(truck.x, truck.z); truck.yaw = v.yaw; truck.f = 20; G.step(.2, T);
  return { knock: K, hp: v.hp, wasHp, hurt: c.who.hurt, act, still: G.traffic.riders.includes(c), wrecked: !!v.wrecked };
});
check('and nothing can hurt them, or get them off it', hitKid.hp === hitKid.wasHp && hitKid.hurt === 0 && hitKid.still && !hitKid.wrecked && !/Get in/.test(hitKid.act ?? ''), hitKid);

// ---- Stuckey's Bridge
const bridge = await g(() => {
  const G = __game, houses = G.homes.filter((h) => Math.hypot(h.s.pts[0][0], h.s.pts[0][1]) < 390);
  G.traffic.T.cars = 3; G.traffic.T.every = [.2, .4]; G.traffic.T.gone = 700; G.traffic.T.from = [150, 500]; G.traffic.T.riders = 2; G.traffic.soon();
  G.place(-60, -30); let closest = Infinity;
  for (let t = 0; t < 90; t += 1 / 15) { G.sim(1 / 15, 1 / 15); for (const c of G.traffic.cars) closest = Math.min(closest, Math.hypot(c.v.x, c.v.z)); }
  return { houses: houses.length, closest, n: G.traffic.cars.length };
});
check(`nobody lives within reach of Stuckey's Bridge, and nobody drives any nearer than ${Number.isFinite(bridge.closest) ? bridge.closest.toFixed(0) : 'that'} m`, bridge.houses === 0 && bridge.closest > 360, bridge);

// ---- what it costs, on the busiest street there is
const cost = async (rate) => {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate });
  const t = await g(() => {
    const G = __game, b1 = performance.now(); for (let i = 0; i < 90; i++) { G.player.inv = .85; G.sim(1 / 30, 1 / 30); } const logic = (performance.now() - b1) / 90;
    const b2 = performance.now(); for (let i = 0; i < 60; i++) { G.player.inv = .85; G.step(1 / 30, 1 / 30); } return { logic, frame: (performance.now() - b2) / 60 };
  });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return t;
};
const busy = await g(() => {
  const G = __game; G.traffic.on = true; G.traffic.T.cars = 3; G.traffic.T.riders = 2; G.traffic.T.every = [.2, .4]; G.traffic.T.gone = 300; G.traffic.T.from = [60, 200]; G.traffic.T.riderFrom = [40, 120]; G.traffic.T.riderGone = 230; G.traffic.soon();
  G.bringOutCrowd();
  const [x, z] = G.map.fromTrue(-200, -30); G.place(x, z); G.look(2.2, .3);
  for (let t = 0; t < 40; t += .25) G.sim(.25, 1 / 20);
  // the crowd around him as well
  G.horde.calm(); let i = 0; for (const s of G.horde.all) { if (s.who.calm) continue; const a = i * 2.4, r = 8 + Math.sqrt(i++) * 4; s.x = s.tx = x + Math.cos(a) * r; s.z = s.tz = z + Math.sin(a) * r; s.y = G.floorAt(s.x, s.z); }
  G.player.inv = .85; G.step(.4, 1 / 30); G.player.inv = .85; G.step(.4, 1 / 30);
  const c = G.crowd();
  return { calls: G.calls().calls, tris: G.calls().triangles, shown: c.shown, all: c.all, active: c.active, cars: G.traffic.cars.length, riders: G.traffic.riders.length };
});
await snap('6-busy');
// Right beside one, a lamp doesn't fill the screen, which is what a point does when it's nearly touching the camera
const lamp = await g(async () => {
  const G = __game, c = G.traffic.cars[0], v = c.v, fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), keep = G.camera.lookAt;
  G.traffic.on = false; G.player.inv = 0; G.horde.calm(); G.camera.lookAt = () => { G.camera.position.set(v.x - fx * 3.4, v.y + 1.1, v.z - fz * 3.4); keep.call(G.camera, v.x, v.y + 1, v.z); };
  G.step(.1, 1 / 30); G.render(0);
  const gl = G.renderer.getContext(), px = new Uint8Array(4); gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  delete G.camera.lookAt; G.traffic.on = true;
  return { middle: [...px] };
});
check('and there\'s still a picture right behind someone\'s tail lights', !(lamp.middle[0] > 200 && lamp.middle[1] < 60 && lamp.middle[2] < 60), lamp);
const fast = await cost(1), slow = await cost(4);
console.log(`     ${busy.active} about, ${busy.shown} drawn, ${busy.cars} cars and ${busy.riders} kids: ${busy.calls} draw calls, ${busy.tris} triangles. A frame's JS: ${fast.frame.toFixed(1)} ms here, ${slow.frame.toFixed(1)} ms at a quarter of this CPU, ${slow.logic.toFixed(1)} ms of that without drawing. Not a real phone: the GPU isn't slowed down.`);
check('under 33 ms of JS a frame at a quarter of this CPU', slow.frame < 33, slow);
check('and still in the same number of draw calls as anywhere else', busy.calls < 340, busy);

check('no console errors', errors.length === 0, errors);
await close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
