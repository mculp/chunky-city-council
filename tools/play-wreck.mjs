// Wrecks the town with the game's own movement and real key presses: through houses in a pickup, over young trees and into big ones, a hammer
// through a wall, a can through a window, cars going up and houses burning down, and then a check that it all stays that way.
//
//   npm i && npm run wreck
import { serveAndOpen } from './browser.mjs';

let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const { page, errors, close } = await serveAndOpen({ viewport: { width: 390, height: 844 } });
const g = (fn, arg) => page.evaluate(fn, arg);

const setup = () => g(() => {
  const G = __game, used = new Set(), T = 1 / 30; G.pause(); G.jump('town'); G.S.flags.town = true; G.step(.1);
  window.G = G; window.W = G.wreck;
  // A building of some sort that nobody's touched, with a clear run at it from its road, and where on the way in the wall is
  window.target = (walls) => {
    const m = G.map;
    for (const s of G.structures) {
      if (s.walls !== walls || s.open || s.sqm < 60 || s.sqm > 500 || s.use === 'church' || used.has(s) || W.damage.has(s) || m.roadGrid.nearest(s.wx, s.wz) > 45) continue;
      const id = m.roadGrid.seg.owner.id, p = m.along(id, m.sOn(id, s.wx, s.wz)), d = Math.hypot(s.wx - p.x, s.wz - p.z); if (d < 10) continue;
      const ux = (s.wx - p.x) / d, uz = (s.wz - p.z) / d, free = (k) => { const x = p.x + ux * k, z = p.z + uz * k; return !G.blocked(x, z, 6.9) && !W.treeBlocks(x, z) && Math.abs(G.floorAt(x, z) - 6.2) < 1; };
      let wall = -1; for (let k = 0; k < d; k += .25) if (!free(k)) { wall = k; break; }
      if (wall < 4 || G.houseAt(p.x + ux * (wall + .6), p.z + uz * (wall + .6)) !== s) continue;
      let clear = true; for (let k = -16; k < 0; k += .5) if (!free(k)) clear = false;
      if (!clear) continue;
      used.add(s); return { s, p, ux, uz, d, wall };
    }
    return null;
  };
  // Behind the wheel of one with the gas down, `run` metres short of a wall and doing `speed`
  window.charge = (kind, t, run, speed) => {
    if (G.driving()) G.getOut(true);
    const v = G.vehicles.find((o) => o.kind === kind && !o.wrecked && !o.drowned && !o.loose && Math.hypot(o.x - t.p.x, o.z - t.p.z) > 30); G.getIn(v);
    v.x = t.p.x + t.ux * (t.wall - run); v.z = t.p.z + t.uz * (t.wall - run); v.y = G.floorAt(v.x, v.z); v.yaw = Math.atan2(t.ux, t.uz); v.f = speed; v.s = 0; v.steer = 0; v.grounded = true; v.hp = v.K.hp;
    return v;
  };
  // Out of the way of the next run at it
  window.shift = (v, t) => { if (G.driving() !== v) { if (G.driving()) G.getOut(true); G.getIn(v); } v.x = t.p.x - t.ux * 60; v.z = t.p.z - t.uz * 60; v.y = G.floorAt(v.x, v.z); G.getOut(true); };
  window.past = (v, t) => (v.x - t.p.x) * t.ux + (v.z - t.p.z) * t.uz;
  window.run = (seconds) => { for (let i = 0; i < seconds / T; i++) G.sim(T, T); };
  // Heads for a spot until he's there or the time's up
  window.walk = (x, z, seconds = 12) => {
    const P = G.player.pos; G.key('w', true); let t = 0;
    for (; t < seconds && Math.hypot(P.x - x, P.z - z) > .7; t += T) { G.look(Math.atan2(P.x - x, P.z - z)); G.sim(T, T); }
    G.key('w', false); G.sim(T, T);
    return { off: Math.hypot(P.x - x, P.z - z), t };
  };
  window.tapKey = (k) => { G.key(k, true); G.sim(T, T); G.key(k, false); G.sim(T, T); };
  // A tree of the size asked for with a clear run at it across level ground
  window.treeRun = (small) => {
    const [x0, z0] = G.map.fromTrue(-15, 12);
    for (let x = x0; x < x0 + 2600; x += 40) for (const tree of W.trees(x, z0, 60)) {
      if ((tree.size < (tree.pine ? 1.05 : 1.1)) !== small || tree.first || used.has(tree)) continue;
      const yaw = 1.2 + (tree.x % 2), ux = Math.sin(yaw), uz = Math.cos(yaw); let clear = true;
      // on the way to it, and a little way past it for whatever gets through
      for (let k = -10; k < 34 && clear; k += .5) for (const c of [-1.6, -.8, 0, .8, 1.6]) { if (Math.abs(k) < 1.5 && !c) continue; const px = tree.x - ux * k + uz * c, pz = tree.z - uz * k - ux * c; if (G.blocked(px, pz, tree.h + .7) || W.treeBlocks(px, pz) || Math.abs(G.floorAt(px, pz) - tree.h) > 1.2) { clear = false; break; } }
      if (clear) { used.add(tree); return { tree, p: { x: tree.x, z: tree.z }, ux, uz, wall: 0 }; }
    }
    return null;
  };
});
await setup();

// ---------------- crashing
const house = await g(() => {
  const t = target('siding'), v = charge('pickup', t, 12, 24); G.key('w', true);
  const hp = v.hp; let hit = 0; for (let i = 0; i < 90 && past(v, t) < t.d + 6; i++) { G.sim(1 / 30, 1 / 30); hit = Math.max(hit, W.damage.gone(t.s)); }
  G.key('w', false);
  return { through: past(v, t) > t.d + 2, gone: hit, speed: v.f, lost: hp - v.hp, kept: v.hp, wrecked: v.wrecked, wall: t.wall, d: t.d, t: { x: t.p.x, z: t.p.z, ux: t.ux, uz: t.uz } };
});
check('a pickup at speed goes in one wall of a house and out the other side', house.through && house.gone > 0, house);
check('it carries on, slowed by what it hit and hurt a bit', house.speed > 8 && house.lost > 0 && !house.wrecked, house);
const hole = await g(({ t, wall }) => {
  G.getOut(true); G.place(t.x + t.ux * (wall - 2), t.z + t.uz * (wall - 2));
  return { wall: G.blocked(t.x + t.ux * (wall + .1), t.z + t.uz * (wall + .1), 6.9), walked: walk(t.x + t.ux * (wall + 2.5), t.z + t.uz * (wall + 2.5), 6) };
}, { t: house.t, wall: house.wall });
check('and he can walk in through the hole it left', !hole.wall && hole.walked.off < 1, hole);
const hard = await g(() => {
  const t = target('block') ?? target('brick'), v = charge('car', t, 3, 8); G.key('w', true); run(1.5); G.key('w', false);
  const st = W.damage.state(t.s), cracked = st.walls.filter((w) => w.hp < w.max).length, slow = { past: past(v, t), wall: t.wall, cracked, gone: W.damage.gone(t.s) }; shift(v, t);
  const big = charge('pickup', t, 10, 25); G.key('w', true); let most = 0; for (let i = 0; i < 60; i++) { G.sim(1 / 30, 1 / 30); most = Math.max(most, past(big, t)); } G.key('w', false);
  return { slow, fast: { past: most, wall: t.wall, gone: W.damage.gone(t.s) } };
});
check('a car at a crawl only cracks block or brick', hard.slow.past < hard.slow.wall + .5 && hard.slow.cracked > 0 && hard.slow.gone === 0, hard);
check('and a pickup flat out goes through it', hard.fast.past > hard.fast.wall + 3 && hard.fast.gone > 0, hard);
const small = await g(() => {
  const t = target('siding'), v = charge('golf', t, 6, 9); G.key('w', true); run(1.4); G.key('w', false);
  return { past: past(v, t), wall: t.wall, gone: W.damage.gone(t.s), y: v.wrecked };
});
check('a golf cart stops at the wall of a house', small.past < small.wall + .5 && small.gone === 0, small);

// ---------------- other vehicles
const shoved = await g(() => {
  const t = target('siding'), parked = charge('car', t, t.wall + 4, 0); G.getOut(true);
  const at = [parked.x, parked.z], hp = parked.hp, nudge = charge('car', t, t.wall + 8, 2); G.key('w', true); run(1); G.key('w', false);
  const bump = { hp: parked.hp, moved: Math.hypot(parked.x - at[0], parked.z - at[1]) }; shift(nudge, t);
  const v = charge('pickup', t, t.wall + 17, 24); G.key('w', true); let speed = 0;
  for (let i = 0; i < 60 && !speed; i++) { G.sim(1 / 30, 1 / 30); if (parked.loose) speed = v.f; }
  run(.5); G.key('w', false);
  const hard = { hp: parked.hp, moved: Math.hypot(parked.x - at[0], parked.z - at[1]), wrecked: parked.wrecked, speed, left: v.hp / v.K.hp };
  run(5);
  // it won't come to rest on top of what he's driving, so he backs off
  v.x -= t.ux * 14; v.z -= t.uz * 14; v.y = G.floorAt(v.x, v.z); run(1.5);
  return { hp, bump, hard, exploded: !!parked.exploded, settled: !parked.loose, atRest: [parked.x, parked.z].map((n) => +n.toFixed(1)), driven: !!G.driving() };
});
check('a bump at walking pace does nothing to a parked car', shoved.bump.hp === shoved.hp && shoved.bump.moved === 0, shoved);
check('a pickup at speed shoves one along, wrecks it, and carries on slower', shoved.hard.moved > 1 && shoved.hard.wrecked && shoved.hard.speed > 8 && shoved.hard.speed < 22, shoved);
check('and that one goes up', shoved.exploded && shoved.settled, shoved);

// ---------------- trees
const young = await g(() => {
  const t = treeRun(true); t.wall = 0; const v = charge('car', t, 14, 11); G.key('w', true); const f = v.f; let p = 0; for (let i = 0; i < 70; i++) { G.sim(1 / 30, 1 / 30); p = past(v, t); if (p > 5) break; } const after = v.f; G.key('w', false); run(.6);
  return { down: !!t.tree.down, stump: !!t.tree.stump, p, f, after, blocks: !!W.treeBlocks(t.tree.x, t.tree.z), hp: v.hp / v.K.hp };
});
check('a car goes straight over a young tree, hardly slowing, and leaves a stump', young.down && young.stump && young.p > 5 && young.after > young.f * .75 && !young.blocks, young);
const old = await g(() => {
  const t = treeRun(false); t.wall = 0; const v = charge('car', t, 8, 7); G.key('w', true); run(1.6); G.key('w', false);
  const held = { down: !!t.tree.down, past: past(v, t), f: v.f, blocks: !!W.treeBlocks(t.tree.x, t.tree.z) }; shift(v, t);
  const w = charge('pickup', t, 24, 25); G.key('w', true); run(2); G.key('w', false); run(1.4);
  return { held, fell: { down: !!t.tree.down, lean: t.tree.lean, stump: !!t.tree.stump, past: past(w, t) } };
});
check('a big tree stops a car at low speed', !old.held.down && old.held.past < 0 && old.held.blocks, old);
check('and comes down under a pickup flat out, and stays down', old.fell.down && old.fell.lean > 1.3 && !old.fell.stump && old.fell.past > 2, old);
const trunk = await g(() => { const t = treeRun(false); G.getOut(true); G.place(t.tree.x - t.ux * 3, t.tree.z - t.uz * 3); return walk(t.tree.x + t.ux * 3, t.tree.z + t.uz * 3, 1); });
check('his own way round a trunk: it stops him walking straight at it', trunk.off > 3, trunk);

// ---------------- going up
const boom = await g(() => {
  if (G.driving()) G.getOut(true);
  const list = G.vehicles.filter((v) => !v.wrecked && !v.loose), a = list.find((v) => v.kind === 'car'), b = list.find((v) => v.kind === 'quad');
  G.place(a.x + 40, a.z); b.x = a.x + 4; b.z = a.z; b.y = G.floorAt(b.x, b.z); W.wreckVehicle(a); a.wrecked = true; a.hp = 0;
  const y0 = a.y; let high = 0; for (let i = 0; i < 90; i++) { G.sim(1 / 30, 1 / 30); high = Math.max(high, a.y - y0); }
  const burning = W.burners.filter((q) => q.owner?.veh === a).length; run(4);
  return { a: !!a.exploded, high, burning, b: b.wrecked, bx: !!b.exploded };
});
check('a wrecked car burns for a moment, goes up and comes down again on fire', boom.a && boom.high > 1 && boom.burning === 1, boom);
check('and takes the one parked beside it with it', boom.b && boom.bx, boom);
const out = await g(() => {
  const t = target('siding'), v = charge('car', t, 9, 16); v.hp = 1; G.key('w', true); run(1); G.key('w', false);
  const wrecked = v.wrecked, still = G.driving() === v; run(3.5);
  return { wrecked, still, gone: v.exploded, driving: !!G.driving(), mode: G.S.mode, hp: G.S.hp, thrown: Math.hypot(G.player.pos.x - v.x, G.player.pos.z - v.z) };
});
check('wrecked with him in it, he has a moment to get out', out.wrecked && out.still, out);
check('and if he doesn\'t it throws him clear', out.gone && !out.driving && out.mode === 'town' && out.thrown > 1, out);

// ---------------- the hammer and the cans
const hammer = await g(() => {
  const t = target('siding'), x = t.p.x + t.ux * (t.wall - .5), z = t.p.z + t.uz * (t.wall - .5);
  G.place(x, z); G.player.yaw = Math.atan2(t.ux, t.uz); G.look(G.player.yaw + Math.PI); G.sim(.1, 1 / 30);
  const one = (() => { tapKey('f'); run(.6); return W.damage.gone(t.s); })(), cracked = W.damage.state(t.s).walls.some((w) => w.hp < w.max);
  tapKey('f'); run(.6); tapKey('f'); run(.6);
  const two = W.damage.gone(t.s), walked = walk(t.p.x + t.ux * (t.wall + 2), t.p.z + t.uz * (t.wall + 2), 5);
  return { one, cracked, two, walked };
});
check('one swing cracks a siding wall and it takes more to bring it down', hammer.one === 0 && hammer.cracked && hammer.two > 0, hammer);
check('and he walks through the gap', hammer.walked.off < 1, hammer);
const cans = await g(() => {
  const c = W.gasCans.find((q) => !q.got), n = G.S.gas; G.place(c.x + 3, c.z); walk(c.x, c.z, 3);
  const picked = { before: n, after: G.S.gas, got: c.got };
  const t = target('siding'); G.place(t.p.x + t.ux * (t.wall - 9), t.p.z + t.uz * (t.wall - 9)); G.player.yaw = Math.atan2(t.ux, t.uz); G.look(G.player.yaw + Math.PI); G.sim(.1, 1 / 30); G.S.gas = Math.max(G.S.gas, 1);
  const had = G.S.gas; tapKey('q'); const thrown = had - G.S.gas; let gone = 0; for (let i = 0; i < 60 && !gone; i++) { G.sim(1 / 30, 1 / 30); gone = W.damage.gone(t.s); }
  return { picked, thrown, gone, burning: W.damage.burning(t.s), target: t.s.index };
});
check('walking over a gas can picks it up', cans.picked.after === cans.picked.before + 1 && cans.picked.got, cans);
check('a can thrown at a house blows a hole in it and sets it alight', cans.thrown === 1 && cans.gone > 0 && cans.burning > 0, cans);

// ---------------- fire
const fire = await g(({ index }) => {
  const s = G.structures.find((q) => q.index === index), seen = []; let down = 0;
  for (let t = 0; t <= 90; t += 5) { run(5); seen.push(+W.damage.gone(s).toFixed(2)); if (W.damage.gone(s) > .95) { down = t + 5; break; } }
  run(25);
  const stops = [...s.stops.values()].filter((w) => w[4] > -1e8).length;
  return { seen, down, burning: W.damage.burning(s), left: W.burners.length, stops };
}, { index: cans.target });
check('a fire takes that house down by itself in under a minute and a half', fire.down > 0, fire);
check('it burns out afterwards, and nothing of it stops him', fire.burning === 0 && fire.stops === 0, fire);
const stays = await g(({ index }) => {
  const s = G.structures.find((q) => q.index === index), st = W.damage.state(s), p = st.parts.find((q) => q.kind === 'wall'), lowest = () => {
    const c = s.cell; if (!c.mesh) return null; const P = c.mesh.geometry.attributes.position.array, at = c.starts.get(s.index) + p.first; let hi = -1e9; for (let v = at; v < at + p.count; v++) hi = Math.max(hi, P[v * 3 + 1]); return hi;
  };
  // away across the map, so that its cell's dropped, and back, so that it's written again
  G.place(s.wx + 2600, s.wz); G.step(1, 1 / 10); const dropped = !s.cell.mesh;
  G.place(s.wx + 12, s.wz); G.step(2, 1 / 10);
  return { dropped, top: lowest(), gone: W.damage.gone(s) };
}, { index: cans.target });
check('what\'s come down is still down after going away and coming back', stays.dropped && stays.gone > .95 && stays.top !== null && stays.top < 7.2, stays);

// ---------------- what holds up what
const held = await g(() => {
  const legs = W.props.filter((p) => p.kind === 'leg'), tower = W.props.find((p) => p.kind === 'tower'), posts = W.props.filter((p) => p.kind === 'post'), canopy = W.props.find((p) => p.kind === 'canopy'), pump = W.props.find((p) => p.kind === 'pump');
  G.place(tower.cx - 60, tower.cz); W.breakProp(legs[0], 1, 0); const oneLeg = tower.down; W.breakProp(legs[1], 1, 0); const twoLegs = tower.down, allLegs = legs.every((p) => p.down); run(3);
  G.place(canopy.cx - 40, canopy.cz); W.breakProp(posts[0], 1, 0); const onePost = canopy.down; W.breakProp(posts[1], 1, 0); const twoPosts = canopy.down;
  const before = W.burners.length; W.breakProp(pump, 1, 0); run(.3);
  return { oneLeg, twoLegs, allLegs, onePost, twoPosts, lit: W.burners.length - before };
});
check('one leg of the water tower and it stands, two and it all goes over', !held.oneLeg && held.twoLegs && held.allLegs, held);
check('the same with two posts of the gas station canopy', !held.onePost && held.twoPosts, held);
check('a pump goes up, and sets light to what\'s round it', held.lit > 0, held);
const through = await g(() => {
  const f = W.props.find((p) => p.kind === 'fence' && p.hp < 1 && !p.down), [nx, nz] = f.falls, t = { p: { x: f.cx, z: f.cz }, ux: nx, uz: nz, wall: 0 }, v = charge('car', t, 9, 9); v.yaw = Math.atan2(nx, nz); G.key('w', true); run(1.2); G.key('w', false);
  return { down: f.down, past: past(v, t) };
});
check('a car goes through a low stretch of fence', through.down && through.past > 0, through);
const rail = await g(() => {
  if (G.driving()) G.getOut(true);
  const c = G.map.crossings.find((q) => q.road === 'griffis_fountain_rd'), near = W.props.filter((p) => p.kind === 'fence' && Math.hypot(p.cx - c.x, p.cz - c.z) < 30), f = near[0], [nx, nz] = f.falls, P = G.player.pos;
  G.place(f.cx - nx * 4, f.cz - nz * 4); walk(f.cx + nx * 3, f.cz + nz * 3, 3);
  const stopped = (P.x - f.cx) * nx + (P.z - f.cz) * nz, t = { p: { x: f.cx, z: f.cz }, ux: nx, uz: nz, wall: 0 }, v = charge('pickup', t, 12, 14);
  G.key('w', true); run(1.4); G.key('w', false);
  const out = { n: near.length, stopped, down: f.down, past: past(v, t) }; if (G.driving()) G.getOut(true);
  return out;
});
check('the rail coming off the Chunky River Bridge stops him, and a pickup takes it out', rail.n === 4 && rail.stopped < 0 && rail.down && rail.past > 0, rail);
const first = await g(() => {
  if (G.driving()) G.getOut(true);
  const list = W.trees(-40, 30, 60), t = list.find((q) => !q.down); G.place(t.x - 30, t.z);
  const was = !!W.treeBlocks(t.x, t.z); W.fellTree(t, 1, 0); run(2); G.step(.2);
  return { n: list.length, was, down: t.down, now: !!W.treeBlocks(t.x, t.z) };
});
check('a tree from the first scene comes down as well, once he\'s in town', first.was && first.down && !first.now, first);

// ---------------- everything else
const things = await g(() => {
  const count = {}, stuck = [];
  G.place(-60, 0);
  for (const p of W.props) {
    count[p.kind] = (count[p.kind] ?? 0) + 1;
    W.breakProp(p, 1, 0);
    if (!p.down) stuck.push(p.kind);
    if (p.solids.some((b) => b[4] > -1e8) || p.walls.some((w) => w[4] > -1e8)) stuck.push(p.kind);
  }
  run(4);
  return { count, stuck, falling: W.falling.length };
});
const WANT = ['pole', 'sign', 'fence', 'dugout', 'bleachers', 'dumpster', 'tree', 'shrub', 'wall', 'curb', 'trailer', 'cart', 'tower', 'leg', 'steeple', 'canopy', 'post', 'pump', 'barrel', 'car', 'boxcar', 'tank', 'counter', 'shelf', 'board', 'barricade', 'steps'];
check('every kind of thing in town comes down, and stops stopping him', things.stuck.length === 0 && WANT.every((k) => things.count[k] > 0), { missing: WANT.filter((k) => !things.count[k]), stuck: things.stuck, count: things.count });
check('nothing\'s still falling after a few seconds', things.falling === 0, things.falling);
const bridge = await g(() => { const y = G.floorAt(0, 0); W.blast(0, y + .5, 0, 8, 8); return { before: y, after: G.floorAt(0, 0), mode: G.S.mode }; });
check('Stuckey\'s Bridge stands up to all of it', bridge.before === bridge.after, bridge);
const wakes = await g(() => { const c = G.map.crossings.find((q) => q.road === 'griffis_fountain_rd'), y = G.floorAt(c.x, c.z); G.place(c.x + 40, c.z); W.blast(c.x, y + .5, c.z, 8, 8); run(1); return { before: y, after: G.floorAt(c.x, c.z), mode: G.S.mode }; });
check('and so does the Chunky River Bridge', wakes.before === wakes.after && wakes.after > 6, wakes);
check('no console errors', errors.length === 0, errors.slice(0, 5));
await close();

// ---------------- straight into town, on a phone, and with the buttons it has there
const phone = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
const label = (id) => phone.page.evaluate((i) => { const e = document.getElementById(i); return e.hidden || e.style.visibility === 'hidden' ? null : e.textContent; }, id);
const titled = await phone.page.evaluate(() => { const b = document.getElementById('free'); return !!b && !b.hidden; });
check('the title card offers a way straight into town', titled, titled);
await phone.page.tap('#free');
await phone.page.evaluate(() => { __game.pause(); __game.step(.5); });
const free = await phone.page.evaluate(() => ({ mode: __game.S.mode, gas: __game.S.gas, crowd: __game.crowd().out, free: !!__game.S.flags.ended, ruin: __game.floorAt(0, 0) < 0 }));
check('and that drops him in town with some cans and the crowd out, and Stuckey\'s is down', free.mode === 'town' && free.gas === 3 && free.crowd && free.free && free.ruin, free);
const a = await label('bA'), c = await label('bC');
check('on a phone the big button swings and the other throws', a === 'SWING' && /^GAS/.test(c ?? ''), { a, c });
await phone.page.tap('#bC'); await phone.page.evaluate(() => __game.step(.1));
const thrown = await phone.page.evaluate(() => __game.S.gas);
check('tapping THROW throws one', thrown === 2, thrown);
await phone.page.tap('#bA'); await phone.page.evaluate(() => __game.step(.1));
await phone.page.evaluate(() => __game.step(2));
// what the worst of it costs: a street on fire, things going up, and the crowd all round him
const worst = await phone.page.evaluate(() => {
  const G = __game, W = G.wreck, P = G.player.pos;
  window.street = G.structures.filter((q) => !q.open && Math.hypot(q.wx - P.x, q.wz - P.z) < 90).slice(0, 6);
  for (const s of window.street) for (let i = 0; i < 12; i++) W.damage.catchNear(s, s.wx, 8, s.wz, 40);
  G.horde.T.grabReach = 0; G.horde.all.slice(0, 48).forEach((z, i) => { const a = i * .9, r = 8 + (i % 7) * 2; z.x = P.x + Math.sin(a) * r; z.z = P.z + Math.cos(a) * r; });
  G.step(5, 1 / 20); const r = G.calls();
  return { calls: r.calls, triangles: r.triangles, burners: W.burners.length, buildings: window.street.length, crowd: G.crowd().drawn };
});
console.log(`     ${worst.buildings} buildings alight, ${worst.burners} things burning and ${worst.crowd} of the crowd: ${worst.calls} draw calls, ${worst.triangles} triangles`);
const frameCost = async (rate) => {
  const client = await phone.page.context().newCDPSession(phone.page);
  await client.send('Emulation.setCPUThrottlingRate', { rate });
  const ms = await phone.page.evaluate(() => { const G = __game, W = G.wreck, s = window.street, began = performance.now(); for (let i = 0; i < 60; i++) { if (i % 15 === 0) { const q = s[(i / 15) % s.length]; W.blast(q.wx, 7, q.wz, 7, 3); } G.step(1 / 30, 1 / 30); } return (performance.now() - began) / 60; });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return ms;
};
const fast = await frameCost(1), slow = await frameCost(4);
console.log(`     a frame's JS in all that, with a blast every half second: ${fast.toFixed(1)} ms here, ${slow.toFixed(1)} ms at a quarter of this CPU. Not a real phone: the GPU isn't slowed down.`);
check('under 33 ms of JS a frame at a quarter of this CPU', slow < 33, slow);
check('no console errors on a phone', phone.errors.length === 0, phone.errors.slice(0, 5));
await phone.close();

// ---------------- from the address, which is all the shared link can pass
const hashed = await serveAndOpen({ query: '?test#free' });
await hashed.page.evaluate(() => { __game.pause(); __game.step(.2); });
const viaHash = await hashed.page.evaluate(() => ({ mode: __game.S.mode, gas: __game.S.gas }));
check('#free in the address does the same', viaHash.mode === 'town' && viaHash.gas === 3, viaHash);
await hashed.close();

// ---------------- with reduced motion it all still happens, and the camera holds still
const calm = await serveAndOpen({ reducedMotion: 'reduce' });
const still = await calm.page.evaluate(() => {
  const G = __game, W = G.wreck; W.startFree(); G.pause(); G.step(.2); G.cam.shake = 0;
  const s = G.structures.find((q) => !q.open && q.walls === 'siding' && Math.hypot(q.wx - G.player.pos.x, q.wz - G.player.pos.z) > 30);
  W.blast(s.pts[0][0], 7, s.pts[0][1], 7, 7); G.step(.5, 1 / 30);
  return { gone: W.damage.gone(s), burning: W.burners.length, shake: G.cam.shake };
});
check('with reduced motion it still goes up, and the camera holds still', still.gone > 0 && still.burning > 0 && still.shake === 0, still);
check('no console errors with reduced motion', calm.errors.length === 0, calm.errors.slice(0, 5));
await calm.close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
