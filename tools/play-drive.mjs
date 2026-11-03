// Finds every kind of vehicle where it's parked and drives it in real Chrome, with real key presses and the phone's stick: along the real roads and off them,
// into walls, through the crowd, into the river, and out again. Fails on anything out of place or a console error.
//
//   npm i && npm run drive -- [--shots dir]
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { serveAndOpen } from './browser.mjs';

const args = process.argv.slice(2), shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const { page, errors, close } = await serveAndOpen({ viewport: { width: 390, height: 844 }, query: '?test' });

let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) { await mkdir(shots, { recursive: true }); await g(() => __game.step(1 / 12)); await page.screenshot({ path: join(shots, name + '.png') }); } };
const KINDS = ['car', 'pickup', 'quad', 'golf'];

await g(() => {
  const G = __game;
  // stands him beside one of a kind, and gets in the way a player does
  window.board = (kind) => {
    const v = G.vehicles.find((o) => o.kind === kind && !o.wrecked && !o.drowned), a = v.yaw + Math.PI / 2, off = v.K.width / 2 + 1;
    G.place(v.x + Math.sin(a) * off, v.z + Math.cos(a) * off); G.step(.6);
    const said = G.state().prompt; G.key('e', true); G.sim(1 / 30, 1 / 30); G.key('e', false); G.sim(1 / 30, 1 / 30);
    return { said, mode: G.S.mode, kind: G.driving()?.kind };
  };
  // puts what he's driving somewhere, standing, without the trip
  window.move = (x, z, yaw) => { const v = G.driving(); v.x = x; v.z = z; v.y = G.floorAt(x, z); v.yaw = yaw; v.f = v.s = v.steer = 0; v.grounded = true; G.look(yaw + Math.PI); return v; };
  // the start of a long clear run east across open ground
  window.openRun = (len) => {
    const [x0] = G.map.fromTrue(-715, 0);
    for (let x = x0; x < x0 + 1800; x += 10) for (const off of [40, -40, 60, -60, 80, -80, 100, -100, 25, -25]) {
      const z = G.map.zAt('us_80', x) + off; let ok = true, y0 = G.floorAt(x, z);
      for (let t = -3; t <= len && ok; t += 1) for (const c of [-3, -1.5, 0, 1.5, 3]) {
        const px = x + t, pz = z + c, f = G.floorAt(px, pz);
        if (!G.map.inBounds(px, pz) || G.onRoad(px, pz) || G.blocked(px, pz, f + .6) || Math.abs(f - y0) > 1.2 || f < .5) { ok = false; break; }
      }
      // and with any trees on it down, or it isn't a clear run for a golf cart
      if (ok) { for (let t = -3; t <= len; t += 4) for (const tree of G.wreck.trees(x + t, z, 7)) if (Math.abs(tree.z - z) < 5 && !tree.down) G.wreck.fellTree(tree, 1, 0); return { x, z }; }
    }
    throw new Error(`no clear run of ${len} m`);
  };
  // takes down whatever's standing between two points, so a test of one thing doesn't hit another
  window.clearLane = (x0, z0, x1, z1) => {
    const W = G.wreck, L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
    const off = (x, z) => { const t = Math.max(0, Math.min(L, (x - x0) * ux + (z - z0) * uz)); return Math.hypot(x - x0 - ux * t, z - z0 - uz * t); };
    for (const p of W.props) if (!p.down && off(p.cx, p.cz) < 4) W.breakProp(p, ux, uz);
    for (let t = 0; t <= L; t += 6) for (const tree of W.trees(x0 + ux * t, z0 + uz * t, 8)) if (!tree.down && off(tree.x, tree.z) < 3) W.fellTree(tree, ux, uz);
    G.sim(3, 1 / 30);
  };
  // on US 80 through town, by true metres from town center
  window.onUS80 = (x) => { const [wx, wz] = G.map.fromTrue(x, -18); return G.map.along('us_80', G.map.sOn('us_80', wx, wz)); };
  // holds the stick the way a thumb does, steering at a point along a road ahead, for so many seconds
  window.follow = (id, dir, seconds, gas = 1) => {
    const v = G.driving(), M = G.map; let top = 0, hits = 0, far = 0, s0 = M.sOn(id, v.x, v.z), last = v.hp;
    const L = M.roadById.get(id).length;
    for (let t = 0; t < seconds; t += 1 / 30) {
      const on = M.sOn(id, v.x, v.z), s = on + dir * (8 + Math.abs(v.f) * .9), p = M.along(id, s);
      if (dir > 0 ? on > L - 10 : on < 10) break;
      let d = Math.atan2(p.x - v.x, p.z - v.z) - v.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      // as anyone would, it slows down for a bend it can see coming, and for where the road stops
      let bend = 0; const a = M.along(id, on), look = 12 + v.f * v.f / 12;
      for (let k = 6; k <= look; k += 6) { const q = M.along(id, on + dir * k); bend = Math.max(bend, Math.abs(Math.atan2(Math.sin(Math.atan2(q.tx, q.tz) - Math.atan2(a.tx, a.tz)), Math.cos(Math.atan2(q.tx, q.tz) - Math.atan2(a.tx, a.tz))))); }
      const left = dir > 0 ? L - on : on, want = Math.min(bend > .9 ? 7 : bend > .35 ? 11 : 99, 5 + left * .7);
      G.stick(Math.max(-1, Math.min(1, -d * 2.4)), Math.abs(v.f) > want ? -1 : gas);
      G.sim(1 / 30, 1 / 30);
      top = Math.max(top, Math.abs(v.f)); if (v.hp < last) { hits++; last = v.hp; } far = Math.max(far, M.roadGrid.nearest(v.x, v.z));
    }
    G.stick(0, 0);
    return { top, hits, far, s: Math.abs(M.sOn(id, v.x, v.z) - s0), hp: v.hp };
  };
  window.stop = () => { const v = G.driving(); G.key(' ', false); G.key('s', true); for (let i = 0; i < 300 && Math.abs(v.f) > .4; i++) G.sim(1 / 30, 1 / 30); G.key('s', false); v.f = v.s = 0; G.sim(1 / 30, 1 / 30); };
  window.out = () => { const v = G.driving(); stop(); G.key('e', true); G.sim(1 / 30, 1 / 30); G.key('e', false); G.sim(1 / 30, 1 / 30); return { mode: G.S.mode, gone: !G.driving(), at: G.player.pos.toArray(), floor: G.floorAt(G.player.pos.x, G.player.pos.z), inside: inVeh(v) }; };
  window.inVeh = (v) => { const P = G.player.pos, dx = P.x - v.x, dz = P.z - v.z, a = dx * Math.sin(v.yaw) + dz * Math.cos(v.yaw), c = dx * Math.cos(v.yaw) - dz * Math.sin(v.yaw); return Math.abs(a) < v.K.length / 2 && Math.abs(c) < v.K.width / 2; };
});

// ---------------- where they are
await g(() => { __game.pause(); __game.jump('town'); __game.step(.2); document.getElementById('card').classList.remove('show'); });
const census = await g(() => {
  const G = __game, n = {}; const list = G.vehicles.map((v) => { n[v.kind] = (n[v.kind] || 0) + 1; return { kind: v.kind, x: v.x, z: v.z, floor: G.floorAt(v.x, v.z), y: v.y, road: G.onRoad(v.x, v.z), house: !!G.houseAt(v.x, v.z), bounds: G.map.inBounds(v.x, v.z) }; });
  return { n, list, hidden: G.vehicles.length };
});
console.log(`     ${JSON.stringify(census.n)}`);
for (const k of KINDS) check(`there are ${k}s to find`, census.n[k] > 0, census.n);
check('none parked on a road, in a building, out of bounds or in the water', census.list.every((v) => !v.road && !v.house && v.bounds && v.floor > .3), census.list.filter((v) => v.road || v.house || !v.bounds || v.floor <= .3));
const neighbours = await g(() => { const G = __game, V = G.vehicles; let least = Infinity; for (let i = 0; i < V.length; i++) for (let j = 0; j < i; j++) least = Math.min(least, Math.hypot(V[i].x - V[j].x, V[i].z - V[j].z)); return least; });
check(`none parked on top of another: closest ${neighbours.toFixed(1)} m`, neighbours >= 6, neighbours);
const firstOne = await g(() => { const G = __game, v = G.vehicles[0], c = G.map.crossings.find((q) => q.road === 'griffis_fountain_rd'); return { kind: v.kind, far: Math.hypot(v.x - c.x, v.z - c.z), onRoad: G.onRoad(v.x, v.z) }; });
check(`the first one's just past where he wakes: a ${firstOne.kind}, ${firstOne.far.toFixed(0)} m from the Chunky River Bridge`, firstOne.far > 20 && firstOne.far < 80 && !firstOne.onRoad, firstOne);
const station = await g(() => { const G = __game, c = G.npcs.coop; return G.vehicles.filter((v) => Math.hypot(v.x - c.x, v.z - c.z) < 40).map((v) => v.kind); });
check(`there's something to drive at the gas station and the town hall: ${station}`, station.includes('pickup') && station.includes('car'), station);

// ---------------- a parked one's a solid thing, until he's in it
const solid = await g(() => { const G = __game, v = G.vehicles[0]; return { body: G.blocked(v.x, v.z, v.y + .2), above: G.blocked(v.x, v.z, v.y + 3) }; });
check('he can\'t walk through one parked', solid.body && !solid.above, solid);

const lines = {};
for (const kind of KINDS) {
  // ---------------- getting in
  const b = await g((k) => window.board(k), kind); lines[kind] = {};
  check(`${kind}: it says so when he's beside it, and E gets him in`, /Get in the /.test(b.said) && b.mode === 'drive' && b.kind === kind, b);
  await snap(`${kind}-1-in`);

  // ---------------- a straight run on US 80, at the same place, with the stick held forward
  const r = await g(() => { const p = onUS80(-615); move(p.x, p.z, Math.atan2(p.tx, p.tz)); return follow('us_80', 1, 18); });
  const K = await g((k) => __game.kinds[k], kind);
  check(`${kind}: on the road it gets near its own top speed: ${r.top.toFixed(1)} of ${K.top} m/s`, r.top > K.top * .85 && r.top <= K.top + .01, r);
  check(`${kind}: it keeps to US 80 with the stick alone, and doesn't hit anything`, r.far < 7 && r.hits === 0, r);
  await snap(`${kind}-2-road`);
  lines[kind].road = r.top;

  // ---------------- off the road it's slower by how it's built
  const off = await g(() => { const G = __game, p = openRun(220), v = move(p.x, p.z, Math.PI / 2); G.key('w', true); let top = 0, on = 0; for (let i = 0; i < 300; i++) { G.sim(1 / 30, 1 / 30); top = Math.max(top, Math.abs(v.f)); if (G.onRoad(v.x, v.z)) on++; } G.key('w', false); return { top, on, x: v.x, from: p.x, hp: v.hp }; });
  lines[kind].off = off.top;
  check(`${kind}: off the road it's slower: ${off.top.toFixed(1)} of ${K.top} m/s`, off.top < K.top * Math.max(K.rough, .6) + .5 && off.top > K.top * K.rough * .5, off);
  await snap(`${kind}-3-off`);

  // ---------------- stops, reverses, turns
  const brake = await g(() => { const G = __game, v = G.driving(); v.f = Math.max(v.f, 8); G.key('s', true); let t = 0; while (v.f > .3 && t < 8) { G.sim(1 / 30, 1 / 30); t += 1 / 30; } const stopped = t; for (let i = 0; i < 150; i++) G.sim(1 / 30, 1 / 30); const back = v.f; G.key('s', false); return { stopped, back }; });
  check(`${kind}: S stops it (${brake.stopped.toFixed(1)} s) and then backs up (${brake.back.toFixed(1)} m/s)`, brake.stopped < 6 && brake.back < -1, brake);
  const turning = await g(() => { const G = __game, p = openRun(220), v = move(p.x, p.z, Math.PI / 2); G.key('w', true); G.sim(2.5, 1 / 30); const y0 = v.yaw; G.key('d', true); G.sim(.6, 1 / 30); const right = v.yaw - y0; G.key('d', false); G.key('a', true); G.sim(1.2, 1 / 30); G.key('a', false); G.key('w', false); return { right, left: v.yaw - y0 - right }; });
  check(`${kind}: D turns it right and A turns it left`, turning.right < -.05 && turning.left > .05, turning);

  // ---------------- too fast to get out, then out
  const fast = await g(() => { const G = __game, p = openRun(220), v = move(p.x, p.z, Math.PI / 2); v.f = 12; G.key('e', true); G.sim(1 / 30, 1 / 30); G.key('e', false); return { mode: G.S.mode, toast: G.state().toast }; });
  check(`${kind}: he won't jump out at speed`, fast.mode === 'drive' && /Slow down/.test(fast.toast), fast);
  const o = await g(() => window.out());
  check(`${kind}: E gets him out, on his feet beside it`, o.mode === 'town' && o.gone && !o.inside && Math.abs(o.at[1] - o.floor) < .1, o);
  await snap(`${kind}-4-out`);
  const back = await g(() => { const G = __game, P = G.player.pos, x0 = P.x, z0 = P.z; G.key('w', true); G.sim(1, 1 / 30); G.key('w', false); return Math.hypot(P.x - x0, P.z - z0); });
  check(`${kind}: he walks off again`, back > 1, back);
}
check(`they don't all handle the same: top speeds ${KINDS.map((k) => lines[k].road.toFixed(0))}`, new Set(KINDS.map((k) => Math.round(lines[k].road))).size === 4, lines);
check('a four-wheeler barely slows off the road, and a car does', lines.quad.off / lines.quad.road > .8 && lines.car.off / lines.car.road < .65, lines);

// ---------------- along every road, both ways, in the fastest one
for (const id of await g(() => __game.map.roads.map((r) => r.id))) {
  const r = await g((id) => { const G = __game, M = G.map; G.vehicles.find((o) => o.kind === 'pickup'); board('pickup'); const R = M.roadById.get(id); const out = []; for (const [at, dir] of [[.15, 1], [.85, -1]]) { const p = M.along(id, R.length * at); move(p.x, p.z, Math.atan2(p.tx * dir, p.tz * dir)); const f = follow(id, dir, Math.min(20, R.length * .6 / 12)); stop(); out.push(f); } G.driving().hp = G.driving().K.hp; window.out(); return out; }, id);
  const whole = await g((id) => __game.map.roadById.get(id).length, id);
  check(`${id}: a pickup stays on it both ways: ${r.map((x) => x.s.toFixed(0) + ' m')}`, r.every((x) => x.s > Math.min(40, whole * .4) && x.far < 9 && x.hits === 0), r);
}

// ---------------- the whole way out to Stuckey's, and off the end of it
const trip = await g(() => {
  const G = __game, M = G.map, node = (a, b) => M.nodes.find((n) => n.roads.includes(a) && n.roads.includes(b)); board('pickup'); const v = G.driving();
  const p = onUS80(-40); move(p.x, p.z, Math.atan2(p.tx, p.tz));
  let metres = 0, seconds = 0, hits = 0, far = 0;
  for (const [id, dir, to] of [['us_80', 1, node('us_80', 'meehan_savoy_rd')], ['meehan_savoy_rd', 1, node('meehan_savoy_rd', M.opening.road)], [M.opening.road, -1, { x: 45, z: 0 }]]) {
    const goal = M.sOn(id, to.x, to.z), start = M.sOn(id, v.x, v.z), p0 = M.along(id, start); move(p0.x, p0.z, Math.atan2(p0.tx * dir, p0.tz * dir));
    for (let i = 0; i < 900 && (goal - M.sOn(id, v.x, v.z)) * dir > 90; i++) { const f = follow(id, dir, 1); hits += f.hits; far = Math.max(far, f.far); seconds += 1; }
    stop(); metres += Math.abs(M.sOn(id, v.x, v.z) - start);
  }
  const at = { hits, far, metres, seconds, x: v.x, z: v.z, hp: v.hp / v.K.hp, dryBefore: !v.drowned };
  // and on, where there's no bridge left
  move(45, 0, -Math.PI / 2); G.key('w', true); for (let i = 0; i < 300 && !v.drowned; i++) G.sim(1 / 30, 1 / 30); G.key('w', false);
  at.drowned = v.drowned; at.endX = v.x; at.endY = v.y; at.toast = G.state().toast;
  const r = out(); G.sim(1 / 30, 1 / 30); at.mode = G.S.mode;
  if (at.mode === 'swim') { G.place(...M.fromTrue(-115, -58)); G.S.mode = 'town'; G.HP.kind = 'run'; }
  return at;
});
console.log(`     town to Stuckey's: ${(trip.metres / 1609.344).toFixed(1)} miles in ${trip.seconds} s`);
check(`a pickup gets from town to Stuckey's on the real roads, and stays on them`, trip.metres > 14000 && trip.far < 9 && trip.hits === 0 && trip.x > 30 && trip.x < 200 && Math.abs(trip.z) < 8, trip);
check('and the bridge is out: it goes in the river', trip.dryBefore && trip.drowned && trip.endX < 21 && trip.mode === 'swim', trip);

// ---------------- into a wall
const crash = await g(() => {
  const G = __game; board('pickup'); const v = G.driving(), [cx, cz] = G.map.fromTrue(-115, -18), S = G.structures.find((b) => b.use === 'house' && Math.hypot(b.wx - cx, b.wz - cz) < 200);
  const a = Math.atan2(S.wx - cx, S.wz - cz), x = S.wx - Math.sin(a) * 34, z = S.wz - Math.cos(a) * 34; clearLane(x, z, S.wx, S.wz); move(x, z, a); const hp0 = v.hp; G.key('w', true);
  let hit = 0, t = 0; while (t < 8 && v.hp === hp0) { G.sim(1 / 30, 1 / 30); t += 1 / 30; } G.key('w', false);
  return { hp0, hp: v.hp, t, speed: Math.abs(v.f), shake: G.cam.shake, inside: G.blocked(v.x, v.z, v.y + .6) };
});
check(`a pickup into a house takes damage (${crash.hp0} to ${crash.hp.toFixed(0)}) and comes out the far side of the wall at ${crash.speed.toFixed(0)} m/s`, crash.hp < crash.hp0 && crash.speed < 14 && !crash.inside, crash);
await snap('crash');
// over and over until it's done for
const wreck = await g(() => {
  // a house only stands so many of these, so it's a different one each time
  const G = __game, v = G.driving(), [cx, cz] = G.map.fromTrue(-115, -18), houses = G.structures.filter((b) => b.use === 'house' && Math.hypot(b.wx - cx, b.wz - cz) < 500); let tries = 0, toast = '';
  for (const S of houses) { if (v.wrecked || tries >= 30) break; tries++; const a = Math.atan2(S.wx - cx, S.wz - cz); move(S.wx - Math.sin(a) * 26, S.wz - Math.cos(a) * 26, a); v.f = 22; G.key('w', true); for (let i = 0; i < 90 && !v.wrecked; i++) G.sim(1 / 30, 1 / 30); G.key('w', false); toast = G.state().toast || toast; }
  const x = v.x, z = v.z; G.key("w", true); G.key("a", true); v.f = v.s = 0; G.sim(1, 1 / 30); G.key("w", false); G.key("a", false);
  return { wrecked: v.wrecked, tries, toast, moved: Math.hypot(v.x - x, v.z - z), hp: v.hp };
});
check(`${wreck.tries} crashes wreck it, it says so, and it won't go`, wreck.wrecked && wreck.hp === 0 && /Wrecked/.test(wreck.toast) && wreck.moved < .2, wreck);
await g(() => __game.step(.6)); await snap('wrecked');
const left = await g(() => { const G = __game, v = G.driving(), r = out(); G.step(.6); const a = v.yaw + Math.PI / 2; G.place(v.x + Math.sin(a) * (v.K.width / 2 + 1), v.z + Math.cos(a) * (v.K.width / 2 + 1)); G.step(.6); const said = G.state().prompt; G.key('e', true); G.sim(1 / 30, 1 / 30); G.key('e', false); return { ...r, said, mode: G.S.mode }; });
check('he climbs out of a wreck, and it can\'t be got back into', left.gone && left.mode === 'town' && !/Get in/.test(left.said), left);

// ---------------- one vehicle into another
const bump = await g(() => {
  const G = __game; board('car'); const v = G.driving(), o = G.vehicles.find((p) => p !== v && p.kind === 'quad' && p.x > G.map.fromTrue(-615, 0)[0] && p.x < G.map.fromTrue(1200, 0)[0]); const hp0 = o.hp, x0 = o.x, z0 = o.z, a = o.yaw + Math.PI / 2;
  G.key('w', true); move(o.x + Math.sin(a) * 26, o.z + Math.cos(a) * 26, a + Math.PI); v.f = 22; G.sim(.1, 1 / 30); for (let i = 0; i < 90 && o.hp === hp0; i++) G.sim(1 / 30, 1 / 30); G.key('w', false);
  const r = { hp0, hp: o.hp, moved: Math.hypot(o.x - x0, o.z - z0), still: G.blocked(o.x, o.z, o.y + .2) || true };
  v.hp = v.K.hp; window.out(); return r;
});
check(`a car into a parked four-wheeler hurts it and shoves it ${bump.moved.toFixed(1)} m`, bump.hp < bump.hp0 && bump.moved > .3, bump);

// ---------------- the river
const river = await g(() => {
  const G = __game; G.step(.1); board('quad'); const v = G.driving();
  // the deepest part of the river near the road
  let best = null; for (let x = -180; x < 600; x += 4) for (let z = -400; z < 400; z += 4) { const f = G.floorAt(x, z); if (f < -1.2 && G.map.inBounds(x, z) && (!best || f < best[2])) best = [x, z, f]; }
  move(best[0], best[1], 0); v.y = best[2]; v.f = 6; G.key('w', true); G.sim(1, 1 / 30); G.key('w', false);
  const flooded = v.drowned, toast = G.state().toast, r = out();
  G.sim(1 / 30, 1 / 30);
  const m = G.S.mode, kind = G.state().kind; if (m === 'swim') { G.place(...G.map.fromTrue(-115, -58)); G.S.mode = 'town'; G.HP.kind = 'run'; }
  return { flooded, toast, m, kind, r };
});
check('in deep water the engine floods and it stops', river.flooded && /Flooded/.test(river.toast), river);
check('he gets out and he\'s swimming', river.m === 'swim' && river.kind === 'swim', river);

// ---------------- the edge of the map
const edge = await g(() => {
  const G = __game; board('car'); const v = G.driving(), M = G.map, hp = v.hp, p = M.along('us_80', 300); let x = p.x, z = p.z; while (M.inBounds(x, z - 40)) z -= 40;
  move(x, z + 30, Math.PI); G.key('w', true); G.sim(8, 1 / 30); G.key('w', false);
  const r = { hp0: hp, hp: v.hp, inBounds: M.inBounds(v.x, v.z), toast: G.state().toast }; window.out(); return r;
});
check('the edge of the map holds it back, and doesn\'t hurt it', edge.inBounds && edge.hp === edge.hp0, edge);

// ---------------- the crowd
await g(() => { __game.bringOutCrowd(); __game.horde.calm(); __game.horde.all.length = 0; __game.step(.1); });
const crowd = await g(() => {
  const G = __game, H = G.horde; board('pickup'); const v = G.driving(), p = onUS80(-295);
  move(p.x, p.z, Math.atan2(p.tx, p.tz));
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), line = [];
  for (let i = 0; i < 9; i++) line.push(H.add(v.x + fx * (30 + i * 2.4), v.z + fz * (30 + i * 2.4)));
  G.sim(.1, 1 / 30); const hp0 = v.hp, pos0 = [line[0].x, line[0].z]; v.f = 16; G.key('w', true);
  let hit = 0; for (let i = 0; i < 120; i++) { G.sim(1 / 30, 1 / 30); hit = Math.max(hit, line.filter((s) => s.flat > 0).length); }
  G.key('w', false);
  return { hit, hp0, hp: v.hp, speed: v.f, mode: G.S.mode, canGrab: G.horde.grab };
});
check(`driving through nine knocks them flat (${crowd.hit}) and costs a little`, crowd.hit >= 5 && crowd.hp < crowd.hp0 && crowd.hp > crowd.hp0 * .7, crowd);
check('nobody grabs him in it', crowd.mode === 'drive' && !crowd.canGrab, crowd);
await snap('crowd-flat');
const up = await g(() => { const G = __game, H = G.horde, v = G.driving(); stop(); move(v.x + 60, v.z, v.yaw); G.sim(7, 1 / 30); return { flat: H.all.filter((s) => s.flat > 0).length, standing: H.all.filter((s) => !(s.flat > 0)).length }; });
check('they get up again', up.flat === 0 && up.standing === 9, up);
// an engine carries, and a golf cart's barely there
const hears = await g(async () => {
  const G = __game, H = G.horde, r = {};
  for (const kind of ['pickup', 'golf']) {
    if (G.driving()) { G.driving().hp = G.driving().K.hp; window.out(); }
    H.calm(); H.all.length = 0; board(kind); const v = G.driving(), p = onUS80(-215); move(p.x, p.z, Math.atan2(p.tx, p.tz));
    const s = H.add(v.x, v.z + 45); v.f = v.K.top * .9; G.sim(4, 1 / 30);
    r[kind] = { alert: s.alert, state: s.state, d: Math.hypot(s.x - v.x, s.z - v.z) };
  }
  return r;
});
check(`a pickup's heard from 45 m, and a golf cart isn't`, hears.pickup.alert > .2 && hears.golf.alert === 0, hears);
// sitting still, they get at it
const claw = await g(() => {
  const G = __game, H = G.horde, v = G.driving(); H.calm(); H.all.length = 0; v.hp = v.K.hp; v.f = v.s = 0;
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; H.add(v.x + Math.sin(a) * 4, v.z + Math.cos(a) * 4, { state: 3, alert: 1 }); }
  const hp0 = v.hp; G.sim(10, 1 / 30);
  const inside = H.all.filter((s) => { const dx = s.x - v.x, dz = s.z - v.z, a = dx * Math.sin(v.yaw) + dz * Math.cos(v.yaw), c = dx * Math.cos(v.yaw) - dz * Math.sin(v.yaw); return Math.abs(a) < v.K.length / 2 && Math.abs(c) < v.K.width / 2; }).length;
  return { hp0, hp: v.hp, inside, mode: G.S.mode };
});
check(`sitting still among them they tear at it (${claw.hp0} to ${claw.hp.toFixed(0)}), from outside it`, claw.hp < claw.hp0 && claw.inside === 0 && claw.mode === 'drive', claw);
await snap('crowd-claw');

// ---------------- cans from the seat, and the chapter ending with him in it
const can = await g(() => {
  const G = __game, c = G.pickups.find((p) => !p.got && p.y < G.floorAt(p.x, p.z) + 1), v = G.driving(); G.horde.all.length = 0; v.hp = v.K.hp;
  if (!c) return { none: true }; const a = v.yaw; const b0 = G.S.beans; move(c.x - Math.sin(a) * 1.8, c.z - Math.cos(a) * 1.8, a); G.sim(.1, 1 / 30); return { b0, b: G.S.beans, got: c.got };
});
check('a can in reach of the seat gets picked up', can.none || (can.got && can.b === can.b0 + 1), can);
const ending = await g(() => { const G = __game; G.S.beans = 11; G.S.flags.ended = false; const c = G.pickups.find((p) => !p.got); const v = G.driving(); move(c.x, c.z, 0); v.y = c.y; G.sim(3, 1 / 30); return { mode: G.S.mode, driving: !!G.driving() }; });
check('the chapter can end with him in it, and it gets him out first', ending.mode === 'end' && !ending.driving, ending);

// ---------------- into the woods, steering, the way you do, and it always backs out. The owner: "I keep getting stuck on trees and things when i drive into them. can't reverse."
{
  const woods = await g((kinds) => {
    const G = __game, T = 1 / 30, W = G.wreck, big = [], seen = new Set();
    for (const [tx, tz] of [[-300, 200], [-500, -100], [200, -300], [600, 50], [-900, 100]]) { const [x, z] = G.map.fromTrue(tx, tz); for (const t of W.trees(x, z, 120)) { if (!t.down && t.size > 1.25 && !seen.has(t) && big.length < 14) { seen.add(t); big.push(t); } } }
    let tried = 0; const stuck = [];
    for (const kind of kinds) {
      const v = G.vehicles.find((o) => o.kind === kind && !o.wrecked && !o.drowned && !o.loose); if (G.driving()) G.getOut(true); G.getIn(v);
      for (const t of big) for (const a of [0, 2.1, 4.2]) for (const steer of [-1, 0, 1]) {
        if (t.down) continue;
        const x = t.x + Math.sin(a) * 9, z = t.z + Math.cos(a) * 9;
        v.hp = v.K.hp; v.wrecked = false; v.x = x; v.z = z; v.y = G.floorAt(x, z); v.yaw = Math.atan2(t.x - x, t.z - z) + .2 * (steer || 1); v.f = 0; v.s = 0; v.steer = 0; v.grounded = true; v.vy = 0; v.getOut = 0;
        G.key('w', true); if (steer > 0) G.key('d', true); if (steer < 0) G.key('a', true);
        G.sim(3, T); G.key('w', false); G.key('a', false); G.key('d', false);
        const at = [v.x, v.z]; G.key('s', true); G.sim(3, T); G.key('s', false); tried++;
        // if something's behind it as well, you'd rock it: forward and back again, and that gets it out
        if (Math.hypot(v.x - at[0], v.z - at[1]) < 1) { G.key('w', true); G.sim(1.5, T); G.key('w', false); G.key('s', true); G.sim(3, T); G.key('s', false); }
        if (Math.hypot(v.x - at[0], v.z - at[1]) < 1 && !v.wrecked) stuck.push([kind, a, steer, Math.hypot(v.x - at[0], v.z - at[1])]);
      }
    }
    if (G.driving()) G.getOut(true);
    return { tried, stuck: stuck.slice(0, 6), n: stuck.length };
  }, KINDS);
  check(`it can always back out of the woods: ${woods.tried} runs at big trees, steering`, woods.tried > 80 && woods.n === 0, woods);
}
check(`no console errors`, errors.length === 0, errors);
await close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
