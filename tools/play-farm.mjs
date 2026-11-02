// Goes and looks at the farm south of the Chunky River Bridge, with real key presses on a phone-sized page: down the gravel from the
// bridge and up the farm road to the barns, what's growing where, over and through the fences, the green pond with its island and its dock,
// and what it costs to draw.
//
//   npm i && npm run farm [-- --shots dir]
import { serveAndOpen } from './browser.mjs';
import { mkdirSync } from 'fs';

const shotAt = process.argv.indexOf('--shots'), shots = shotAt > 0 ? process.argv[shotAt + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) { await g(() => __game.step(.1, 1 / 24)); await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); } };

await g(() => {
  const G = __game, T = 1 / 30; G.pause(); G.jump('town'); G.S.flags.town = true; G.step(.1);
  window.at = ([x, z], yaw) => { G.place(...G.map.fromTrue(x, z)); if (yaw !== undefined) G.look(yaw); G.step(.2, T); };
  window.spot = () => { const P = G.player.pos, [ox, oz] = G.map.fromTrue(0, 0); return [+(P.x - ox).toFixed(1), +(P.z - oz).toFixed(1)]; };
  // runs for a true spot until he's there or the time's up
  window.walk = (to, seconds = 40, run = false) => {
    const [x, z] = G.map.fromTrue(...to), P = G.player.pos; G.key('w', true); if (run) G.key('shift', true); let t = 0;
    for (; t < seconds && Math.hypot(P.x - x, P.z - z) > .9; t += T) { G.look(Math.atan2(P.x - x, P.z - z)); G.sim(T, T); }
    G.key('w', false); G.key('shift', false); G.sim(T, T);
    return { off: +Math.hypot(P.x - x, P.z - z).toFixed(2), t: +t.toFixed(1), at: spot() };
  };
});

// ---------------- the way there
const road = await g(() => {
  const G = __game, M = G.map, griffis = M.roadById.get('griffis_fountain_rd'), lane = M.lanes.find((l) => l.name === griffis.name), [bx, bz] = M.fromTrue(-336.76, 490.37);
  const seen = new Set(), way = [], s0 = M.sOn(griffis.id, bx, bz);
  griffis.pts.forEach((p, i) => { if (griffis.s[i] > s0 + 25) way.push(p); });
  const flip = lane.pts[0][1] > lane.pts.at(-1)[1] ? [...lane.pts].reverse() : lane.pts;
  const [fx, fz] = M.fromTrue(-898, 1654);
  for (const p of flip) { if (Math.hypot(p[0] - fx, p[1] - fz) < 2) break; if (!seen.has(p)) { seen.add(p); way.push(p); } }
  const farm = M.lanes.find((l) => l.surface === 'gravel' && !l.name && Math.hypot(l.pts[0][0] - fx, l.pts[0][1] - fz) < 3), [ox, oz] = M.fromTrue(0, 0);
  // along the gravel, off the bridge
  const sample = way.filter((_, i) => i % 3 === 0).map(([x, z]) => ({ paved: G.pavedAt(x, z), on: G.onRoad(x, z) }));
  return { way: [...way, ...farm.pts].map(([x, z]) => [x - ox, z - oz]), surface: griffis.surface, lane: lane.surface, paved: sample.filter((s) => s.paved).length, off: sample.filter((s) => !s.on).length };
});
check('Griffis Fountain Rd is gravel on both sides of its bridge', road.surface === 'gravel' && road.lane === 'gravel' && road.paved === 0 && road.off === 0, road);
await g(() => at([-345, 523], Math.PI));
const trip = await g(async (way) => { let t = 0, worst = 0; for (const p of way) { const w = walk(p, 60, true); t += w.t; worst = Math.max(worst, w.off); } return { t, worst, at: spot() }; }, road.way);
check(`on foot from the bridge to the barns, ${Math.round(trip.t)} s at a run, with nothing in the way`, trip.worst < 1.5, trip);
await snap('barns');
const miles = await g(() => { const M = __game.map, [a, b] = M.fromTrue(-336.76, 490.37), [c, d] = M.fromTrue(-558, 1725); return Math.hypot(c - a, d - b); });
check(`that's about a mile from the bridge, ${Math.round(miles)} m in a line`, miles > 1100 && miles < 1400, miles);

// ---------------- what's on it
const land = await g(() => {
  const G = __game, F = G.farm, M = G.map, out = { grid: 0, off: [], growing: 0, lone: 0, woods: 0, young: 0, buildings: {} };
  // every bit of open land can be walked on
  for (let x = F.x0; x < F.x1; x += 24) for (let z = F.z0; z < F.z1; z += 24) if (F.clear(x, z)) { out.grid++; if (!M.inBounds(x, z)) out.off.push([Math.round(x), Math.round(z)]); }
  // nothing's growing out on the grass but the trees that really stand there
  const seen = new Set();
  for (let x = F.x0; x < F.x1; x += 60) for (let z = F.z0; z < F.z1; z += 60) G.wreck.treesNear(x, z, 40, (t) => { if (seen.has(t)) return; seen.add(t); const c = F.lone(Math.floor(t.x / 11), Math.floor(t.z / 11)); if (t.young) out.young++; else if (c) out.lone++; else if (F.clear(t.x, t.z)) out.growing++; else out.woods++; });
  for (const s of G.structures) if ([74756684, 74466261, 74647050, 74447926, 75046441, 74854012, 74434542, 900016].includes(s.id)) { const c = s.pts ? s.pts.reduce((a, p) => [a[0] + p[0] / s.pts.length, a[1] + p[1] / s.pts.length], [0, 0]) : [s.x, s.z]; out.buildings[s.id] = G.blocked(c[0], c[1], 6.5) || !!s; }
  return out;
});
check(`all ${land.grid * 24 * 24 / 1e6 | 0} sq km or so of open land's inside the map`, land.off.length === 0, land.off.slice(0, 12));
check(`${land.lone} trees standing out on their own, and nothing else growing on the grass`, land.lone > 60 && land.growing === 0, land);
check(`${land.young} young pines in the west field, and woods close up to the edges`, land.young > 40 && land.woods > 500, land);
check('all its buildings are here', Object.keys(land.buildings).length === 8, land.buildings);
const redBarn = await g(() => { const G = __game; at([-484, 1740]); const w = walk([-484, 1700], 8); return w; });
check('the red barn is solid', redBarn.off > 15, redBarn);
const tufts = await g(() => {
  const G = __game; at([-350, 1450]); const out = G.farm.tufts.count; at([-250, -100]); const town = G.farm.tufts.count; at([-350, 1450]); return { out, town };
});
check(`${tufts.out} tufts of grass on the pasture, and none in town`, tufts.out > 200 && tufts.town === 0, tufts);

// ---------------- the fences
const fence = await g(() => {
  const G = __game, P = G.player.pos; at([-640, 800], 0);
  const stop = walk([-690, 800], 12), by = spot();
  // he takes a run at it and jumps
  at([-662, 800]); const [tx, tz] = G.map.fromTrue(-690, 800); G.key('w', true); G.key('shift', true); let over = false;
  for (let t = 0; t < 4 && !over; t += 1 / 30) { G.look(Math.atan2(P.x - tx, P.z - tz)); if (spot()[0] > -668.2 && spot()[0] < -666) { G.key(' ', true); } else G.key(' ', false); G.sim(1 / 30, 1 / 30); over = spot()[0] < -670.5; }
  G.key('w', false); G.key('shift', false); G.key(' ', false); G.sim(.5, 1 / 30);
  return { stop, by, over, at: spot() };
});
check('a fence stops him walking into it', fence.stop.off > 19 && fence.by[0] > -669 && fence.by[0] < -660, fence);
check('and he can jump over it', fence.over, fence);
const gap = await g(() => {
  // the farm road goes through the fence along Griffis Fountain Rd, at the real gate
  const G = __game, M = G.map, [fx, fz] = M.fromTrue(-898, 1654), [ox, oz] = M.fromTrue(0, 0), farm = M.lanes.find((l) => !l.name && l.surface === 'gravel' && Math.hypot(l.pts[0][0] - fx, l.pts[0][1] - fz) < 3);
  at([-904, 1650]); let off = 0;
  for (const [x, z] of farm.pts.slice(0, 5)) off = Math.max(off, walk([x - ox, z - oz], 40).off);
  return { off, at: spot() };
});
check('the farm road goes through the fence at the gate', gap.off < 1, gap);
const swing = await g(() => {
  const G = __game, P = G.player.pos; at([-640, 900], Math.PI / 2 * -1); walk([-667.6, 900], 8);
  const [wx, wz] = G.map.fromTrue(-669, 900), runs = G.wreck.props.filter((p) => p.kind === 'fence' && p.line && Math.hypot((p.line[0] + p.line[2]) / 2 - wx, (p.line[1] + p.line[3]) / 2 - wz) < 9);
  const before = runs.filter((p) => !p.down).length;
  G.wreck.strike(P.x, P.y + 1, P.z, 2.4, 3, -1, 0); G.sim(1.4, 1 / 30);
  const down = before - runs.filter((p) => !p.down).length, w = walk([-690, 900], 10);
  return { before, down, w };
});
check('a blow takes a stretch of it down, and then he walks through', swing.before > 0 && swing.down > 0 && swing.w.off < 1, swing);
const truck = await g(() => {
  const G = __game, v = G.vehicles.find((o) => o.kind === 'pickup' && !o.wrecked && !o.drowned), a = v.yaw + Math.PI / 2, off = v.K.width / 2 + 1;
  G.place(v.x + Math.sin(a) * off, v.z + Math.cos(a) * off); G.step(.6); G.key('e', true); G.sim(1 / 30, 1 / 30); G.key('e', false); G.sim(1 / 30, 1 / 30);
  const d = G.driving(); if (!d) return { boarded: false };
  const [wx, wz] = G.map.fromTrue(-640, 1100), [tx, tz] = G.map.fromTrue(-700, 1100); d.x = wx; d.z = wz; d.y = G.floorAt(wx, wz); d.yaw = -Math.PI / 2; d.f = 16; d.s = d.steer = 0; d.grounded = true; G.look(d.yaw + Math.PI);
  const runs = G.wreck.props.filter((p) => p.kind === 'fence' && p.line && Math.hypot((p.line[0] + p.line[2]) / 2 - G.map.fromTrue(-669, 1100)[0], (p.line[1] + p.line[3]) / 2 - G.map.fromTrue(-669, 1100)[1]) < 12);
  const hp = d.hp; G.stick(0, 1); let t = 0; for (; t < 5 && d.x > tx; t += 1 / 30) G.sim(1 / 30, 1 / 30); G.stick(0, 0);
  const out = { boarded: true, through: d.x <= tx, hurt: hp - d.hp, down: runs.filter((p) => p.down).length };
  d.f = d.s = 0; G.sim(.5, 1 / 30); G.key('e', true); G.sim(1 / 30, 1 / 30); G.key('e', false); G.sim(.5, 1 / 30); out.out = !G.driving();
  return out;
});
check('a pickup goes through a fence and hardly notices', truck.boarded && truck.through && truck.down > 0 && truck.hurt < 30 && truck.out, truck);

// ---------------- the pond
const pond = await g(() => {
  const G = __game, W = G.water, p = W.ponds.find((o) => o.islands.length), isle = p.islands[0], ix = isle.reduce((a, q) => a + q[0], 0) / isle.length, iz = isle.reduce((a, q) => a + q[1], 0) / isle.length;
  return { id: p.id, look: p.look, level: p.level, area: p.area, inIsle: !!W.in(ix, iz), isleGround: G.groundH(ix, iz), isleN: isle.length, onMap: true };
});
check('the green pond is on the map, level, with its island', pond.look === 'algae' && pond.area > 10000 && pond.level > 3 && pond.level < 5.66, pond);
check('the island is dry land', !pond.inIsle && pond.isleGround > pond.level, pond);
const swim = await g(() => {
  const G = __game, W = G.water, P = G.player.pos, p = W.ponds.find((o) => o.islands.length); at([-530, 1850], -Math.PI / 2); const start = W.in(P.x, P.z) === p;
  const w = walk([-566, 1852], 45), swimming = G.state().swimming ?? G.state().mode === 'swim' ?? false, y = P.y;
  return { start, w, swimming, y, level: p.level };
});
check('he can swim across it', swim.start && swim.w.off < 1.2 && swim.y < swim.level + .1, swim);
await snap('pond');
const dock = await g(() => {
  const G = __game, P = G.player.pos, D = G.dock; at([-596, 1851], -Math.PI / 2);
  const walked = walk([-577, 1854], 10), top = P.y, on = G.onDock(P.x, P.z);
  return { walked, top, on, want: D.top };
});
check('from the bank along the dock to its end, up over the water', dock.walked.off < 1.2 && dock.on && Math.abs(dock.top - dock.want) < .15, dock);
await snap('dock');
const off = await g(() => {
  const G = __game, P = G.player.pos, W = G.water; const w = walk([-571, 1855], 6); G.sim(1, 1 / 30);
  const wet = P.y < W.level(P.x, P.z) + .1;
  at([-585, 1853]); const top = G.floorAt(P.x, P.z); G.wreck.breakProp(G.dock.prop, 0, 1); G.sim(2, 1 / 30);
  return { wet, top, after: G.floorAt(P.x, P.z), level: W.level(P.x, P.z) };
});
check('off the end of it and into the water', off.wet, off);
check('and when it\'s been knocked down there\'s no walking on it', off.after < off.level && off.top > off.level, off);

// ---------------- what it costs
const cost = await g(() => {
  const G = __game, out = {}; G.bringOutCrowd?.();
  for (const [name, p] of [['pasture', [-350, 1450]], ['yard', [-520, 1712]], ['pond', [-600, 1800]], ['lane', [-267, 1200]]]) { at(p, 1); G.step(.5, 1 / 24); const c = G.calls(); out[name] = { calls: c.calls, tris: c.triangles }; }
  return out;
});
for (const [k, c] of Object.entries(cost)) console.log(`     ${k}: ${c.calls} draw calls, ${c.tris} triangles`);
check('the farm costs no more to draw than town', Object.values(cost).every((c) => c.calls < 200 && c.tris < 320000), cost);
await snap('field');

check('no console errors', errors.length === 0, errors.slice(0, 5));
await close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
