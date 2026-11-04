// Moves the crowd without fighting it, on a phone-sized page, with real taps and the game's own movement: picks up a bottle, throws each lure off US 80 with a crowd on it and counts
// who's left on the road, takes hunters off him, sets off a car alarm from across a lot, walks them into the water (the cottonmouths have them, and the river brings them up again downstream, soaked, with
// a snake on a sleeve, to walk home, the same people and the same number of them), and lets them get around someone it'll cost him with. The water is played again with reduced motion.
//
//   npm i && npm run lures [-- --shots dir]
import { mkdirSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); };
const tap = async (id = '#bC') => { await page.tap(id); await g(() => __game.step(.05)); };

const setup = () => {
  const G = __game; G.pause(); G.jump('town'); G.S.flags.town = true; G.S.flags.ended = G.S.flags.arrived = true; G.step(.1);
  document.getElementById('card').style.display = 'none';
  G.bringOutCrowd();
  // A stretch of US 80 west of town, running east from t = 0, 40 m long, with the crowd on it: 24 of them ambling along it, and the rest of them nowhere near
  const a0 = G.map.sOn('us_80', ...G.map.fromTrue(-560, -20)), a1 = a0 + Math.sign(G.map.sOn('us_80', ...G.map.fromTrue(-500, -21)) - a0) * 40;
  const us80 = (t) => G.map.along('us_80', a0 + (a1 - a0) * t);
  window.us80 = us80;
  window.onRoad = (from = -.2, to = 1.2) => G.horde.all.filter((s) => { const q = G.map.sOn('us_80', s.x, s.z), p = G.map.along('us_80', q), t = (q - a0) / (a1 - a0); return t > from && t < to && Math.hypot(s.x - p.x, s.z - p.z) < 6; }).length;
  // n of them along the road between two places on it, and everyone else far away
  window.crowdOnRoad = (groups = [[0, 1, 24]]) => {
    G.horde.calm();
    let i = 0; const { all } = G.horde, a = us80(0);
    for (const [from, to, n] of groups) for (let k = 0; k < n; k++, i++) { const p = us80(from + (to - from) * (k + .5) / n), s = all[i]; s.x = p.x + (k % 3 - 1) * .5; s.z = p.z + (k % 2 ? 2 : -2); s.y = G.floorAt(s.x, s.z); s.tx = s.x; s.tz = s.z; s.next = k * .01; }
    for (; i < all.length; i++) { const s = all[i], f = i % 2 ? 1 : -1; s.x = a.x + f * (900 + i); s.z = a.z + 500 + i; s.y = G.floorAt(s.x, s.z); s.tx = s.x; s.tz = s.z; }
    G.S.hp = 3; G.S.mode = 'town'; G.player.inv = 0; document.getElementById('fail').hidden = true;
  };
  // standing on the road at t along it, across it by so many metres, facing wherever
  window.stand = (t, across, yaw) => { const p = us80(t); G.place(p.x, p.z + across); G.player.yaw = yaw; G.look(yaw + Math.PI, .3); G.S.mode = 'town'; G.HP.speed = 0; };
  window.flown = () => { for (let i = 0; i < 90 && G.lures.flying.some((f) => f.on); i++) G.step(1 / 30); };
  window.grabbed = () => !!G.horde.grab;
};
await g(setup);

// ---- the shoulder's got bottles on it, and he can pick one up
const found = await g(() => {
  const G = __game, { LYING } = G.lures, a = G.map.fromTrue(-87.85 + 40 - 53, -31.1 + 24 - 10), b = LYING.filter((c) => c.kind === 'bottle').sort((p, q) => Math.hypot(p.x - a[0], p.z - a[1]) - Math.hypot(q.x - a[0], q.z - a[1]))[0];
  G.horde.calm(); G.place(b.x + 3, b.z); G.step(.1);
  const seen = G.lures.lyingNear.includes(b), before = G.S.items.bottle ?? 0, none = document.getElementById('bC').hidden || !!G.S.beans;
  G.key('w', true); let t = 0; while (t < 3 && !b.got) { G.look(Math.atan2(G.player.pos.x - b.x, G.player.pos.z - b.z)); G.sim(1 / 30, 1 / 30); t += 1 / 30; } G.key('w', false); G.step(.1);
  return { seen, before, after: G.S.items.bottle, got: b.got, bottles: LYING.filter((c) => c.kind === 'bottle').length, crackers: LYING.filter((c) => c.kind === 'crackers').length, c: document.getElementById('bC').textContent, hidden: document.getElementById('bC').hidden, near: G.lures.lyingNear.length, pockets: document.getElementById('pockets').textContent };
});
check(`there are bottles lying about and firecrackers on shop steps: ${found.bottles} and ${found.crackers}`, found.bottles > 100 && found.crackers >= 5, found);
check('he walks over a bottle and has it', found.seen && found.got && found.after === found.before + 1, found);
check(`the button says so: ${found.c}, and so do his pockets: ${found.pockets}`, !found.hidden && /BOTTLE/.test(found.c) && /Bottles 1/i.test(found.pockets), found);

// ---- each of them, thrown off the road into the trees from just past the end of a crowd on it
await g(() => {
  window.NORTH = Math.PI;   // +Z is south, so north is along -Z
  // Which way to face at t to throw off the road, on the north side of it and back along it towards t = -infinity. The road's not straight, or square to the compass.
  window.offRoad = (t, along = 1) => { const a = us80(t), b = us80(t - .5); let ux = b.x - a.x, uz = b.z - a.z; const l = Math.hypot(ux, uz); ux /= l; uz /= l; let nx = uz, nz = -ux; if (nz > 0) { nx = -nx; nz = -nz; } return Math.atan2(nx + ux * along, nz + uz * along); };
});
for (const [kind, leaves] of [['bottle', 16], ['crackers', 22], ['fluid', 20], ['can', 8]]) {
  await g((kind) => {
    const G = __game; Object.assign(G.S.items, { bottle: 2, crackers: 2, fluid: 2 }); G.S.gas = 0; G.S.beans = 3; G.S.hand = kind;
    crowdOnRoad(); stand(1.25, 0, offRoad(1.25)); G.step(.1);
  }, kind);
  const r = await g(() => { const G = __game; return { before: onRoad(), thrown: G.lures.thrownNow().kind, label: document.getElementById('bC').textContent }; });
  await tap();
  const after = await g(() => {
    const G = __game; flown();
    const counts = [], land = G.lures.lureSpots.at(-1), P = G.player.pos, a = us80(1.25), b = us80(.75), ux = b.x - a.x, uz = b.z - a.z, l = Math.hypot(ux, uz), off = Math.abs((land.x - a.x) * uz - (land.z - a.z) * ux) / l; let grabbed = false;
    for (let t = 0; t < 16; t += 2) { G.sim(2, 1 / 30); if (window.grabbed()) grabbed = true; counts.push(onRoad()); }
    return { counts, least: Math.min(...counts), grabbed, left: G.lures.thrownNow()?.n, off };
  });
  console.log(`     ${kind}: landed ${after.off.toFixed(0)} m off the road, and on the road ${r.before} -> ${after.counts.join(' ')}`);
  check(`${kind}: he throws what the button says`, r.thrown === kind, r);
  check(`${kind}: it takes them off the road, ${r.before} down to ${after.least}`, r.before === 24 && 24 - after.least >= leaves, after);
  check(`${kind}: and they don't get him`, !after.grabbed, after);
  await snap(`thrown-${kind}`);
}

// ---- and the point of it all: he goes along US 80 through three lots of them with three kinds of lure, and never swings at anyone. Each is played its own way: with a bottle he stops well short,
// keeps still while they go and look, and runs for it. Firecrackers go on long enough to throw them and keep walking. A fire holds them long enough to wait a moment and stroll past.
await g(() => {
  const G = __game; Object.assign(G.S.items, { bottle: 1, crackers: 1, fluid: 1 }); G.S.gas = 0; G.S.beans = 0; G.S.hand = null;
  crowdOnRoad([]); stand(.2, 3, -Math.PI / 2); G.step(.1);
  window.ranStats = { grabbed: false, closest: Infinity };
  // he goes where he's going and keeps out of arm's reach of anyone in the way, as anyone would
  window.walkTo = (t, fast) => {
    const P = G.player.pos, p = us80(t), goal = { x: p.x, z: p.z + 3 }; G.key('w', true); if (fast) G.key('shift', true);
    let s = 0;
    while (s < 40 && Math.hypot(P.x - goal.x, P.z - goal.z) > 1.5) {
      let dx = goal.x - P.x, dz = goal.z - P.z; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      for (const c of G.horde.active) { const ax = P.x - c.x, az = P.z - c.z, d = Math.hypot(ax, az); if (d < ranStats.closest) ranStats.closest = d; if (d < 9) { const k = (9 - d) / 9 * 2; dx += ax / d * k; dz += az / d * k; } }
      G.look(Math.atan2(-dx, -dz)); G.sim(1 / 30, 1 / 30); s += 1 / 30; if (window.grabbed()) ranStats.grabbed = true;
    }
    G.key('w', false); G.key('shift', false); G.sim(1 / 30, 1 / 30); return s;
  };
  // Eight of them just there on the road ahead when he gets here, and a way to throw that's got nothing in it: he can see what's in the way, and it's only a pole or a sign if it is.
  window.lot = (i, west, east) => { for (let k = 0; k < 8; k++) { const p = us80(west + (east - west) * (k + .5) / 8), s = G.horde.all[i * 8 + k]; s.x = p.x + (k % 3 - 1) * .5; s.z = p.z + (k % 2 ? 2 : -2); s.y = G.floorAt(s.x, s.z); s.tx = s.x; s.tz = s.z; s.state = 0; s.alert = 0; s.next = k * .01; } };
  window.clearThrow = (t, speed, up) => {
    const P = G.player.pos;
    for (const along of [1, .7, 1.4, .4, 2, .1]) {
      const yaw = offRoad(t, along), fx = Math.sin(yaw), fz = Math.cos(yaw); let ok = true;
      for (let f = .05; f < 1; f += .05) { const d = speed * f, y = P.y + 1.7 + up * f - 7.5 * f * f; if (y < G.floorAt(P.x + fx * d, P.z + fz * d) + .2 ? false : G.blocked(P.x + fx * d, P.z + fz * d, y)) ok = false; }
      if (ok) return yaw;
    }
    return offRoad(t);
  };
});
const legs = [['bottle', .025, -1, -.6, 'still', 20, 6], ['crackers', -4.7, -5.6, -5.2, 'go', 14, 6], ['fluid', -9.3, -10.2, -9.8, 'stroll', 13, 5.5]], shown = [];
for (const [i, [kind, stop, west, east, how, speed, up]] of legs.entries()) {
  await g(([i, kind, stop, west, east, speed, up]) => { const G = __game; walkTo(stop); lot(i, west, east); G.S.hand = kind; G.player.yaw = clearThrow(stop, speed, up); G.step(.05); }, [i, kind, stop, west, east, speed, up]);
  const word = await g(() => document.getElementById('bC').textContent);
  await tap();
  const leg = await g(([west, east, how]) => {
    const G = __game; flown();
    const land = G.lures.lureSpots.at(-1), q = G.map.along('us_80', G.map.sOn('us_80', land.x, land.z)), off = Math.hypot(land.x - q.x, land.z - q.z), on = onRoad(west - .4, east + .4);
    let waited = 0;
    const wait = (until, most) => { while (waited < most && !until()) { G.sim(.25, 1 / 30); waited += .25; if (grabbed()) ranStats.grabbed = true; } };
    if (how === 'still') wait(() => onRoad(west - .4, east + .4) <= 2, 12);
    if (how === 'stroll') wait(() => onRoad(west - .4, east + .4) <= 3, 7);
    const left = onRoad(west - .4, east + .4), t = walkTo(west - .9, how === 'still');
    return { off, on, waited, left, t };
  }, [west, east, how]);
  shown.push(`${word.replace(/\d+/, '').toLowerCase()}: ${leg.off.toFixed(0)} m off the road, ${leg.on} on it ahead, ${leg.left} after ${leg.waited} s, ${leg.t.toFixed(0)} s to get past`);
}
const end = await g(() => { const G = __game; return { ...ranStats, hpNow: G.S.hp, mode: G.S.mode, hand: G.lures.thrownNow() }; });
console.log(`     ${shown.join(' · ')}`);
check(`he gets through three lots on US 80 with three different lures, without a swing or being grabbed, never closer than ${end.closest.toFixed(1)} m`, !end.grabbed && end.hpNow === 3 && !end.hand, end);
await snap('through');

// ---- taken off him
const hunted = await g(() => {
  const G = __game; G.S.items.crackers = 2; G.S.hand = 'crackers'; crowdOnRoad(); stand(1.3, 0, NORTH); G.step(.1);
  // he's been heard, and they're coming for him
  const P = G.player.pos, near = G.horde.all.slice(0, 8);
  for (const s of near) { s.state = 2; s.alert = 1; s.tx = P.x; s.tz = P.z; const a = Math.atan2(s.x - P.x, s.z - P.z); s.x = P.x + Math.sin(a) * 18; s.z = P.z + Math.cos(a) * 18; s.y = G.floorAt(s.x, s.z); }
  G.sim(.4, 1 / 30);
  const before = near.filter((s) => s.state === 2 || s.state === 3).length;
  window.near = near;
  return before;
});
await tap();
const off = await g(() => {
  const G = __game; flown(); G.sim(.6, 1 / 30);
  const P = G.player.pos, spot = G.lures.lureSpots.at(-1), nearSpot = near.filter((s) => s.state === 1 && s.tx === spot.x).length;
  const a = near.map((s) => Math.hypot(s.x - spot.x, s.z - spot.z)), dHim = near.map((s) => Math.hypot(s.x - P.x, s.z - P.z));
  G.sim(4, 1 / 30);
  return { nearSpot, closer: near.filter((s, i) => Math.hypot(s.x - spot.x, s.z - spot.z) < a[i]).length, hunting: near.filter((s) => s.state === 2 || s.state === 3).length, grabbed: grabbed() };
});
check(`firecrackers take hunters off him: ${hunted} after him, ${off.nearSpot} gone to look`, hunted >= 6 && off.nearSpot >= 6 && off.hunting <= 2 && !off.grabbed, { hunted, ...off });

// ---- a car alarm, from across the lot
const lot = await g(() => {
  const G = __game; crowdOnRoad([]);
  const loc = (x, z) => G.map.fromTrue(-87.85 + x - 53, -31.1 + z - 10), truck = G.lures.VEHICLES.filter((v) => v.kind === 'pickup').sort((a, b) => { const [x, z] = loc(60.8, 9.2); return Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z); })[0];
  G.S.items.bottle = 2; G.S.hand = 'bottle';
  // from the far side of the road, with nothing in the way, and turned a little away from it. A thumb's not that accurate.
  const fromX = truck.x + 13, fromZ = truck.z + 5, yaw = Math.atan2(truck.x - fromX, truck.z - fromZ) + .12;
  G.place(fromX, fromZ); G.player.yaw = yaw; G.look(yaw + Math.PI, .25); G.S.mode = 'town'; G.step(.1);
  // and some of the crowd within earshot
  G.horde.all.slice(0, 12).forEach((s, i) => { s.x = truck.x + 40 + (i % 4) * 2; s.z = truck.z + 35 + i * 2; s.y = G.floorAt(s.x, s.z); s.tx = s.x; s.tz = s.z; s.next = i * .01; });
  window.truck = truck; G.step(.1);
  return { kind: truck.kind, can: G.lures.canAlarm(truck) };
});
check('there\'s a truck at the gas station with an alarm in it', lot.can, lot);
await tap();
const alarm = await g(() => {
  const G = __game; flown();
  const went = G.lures.ALARMS.some((a) => a.v === truck), glow = () => G.lures.glows.filter((o) => o.visible).length;
  const shown = new Set(); let t = 0; for (; t < 1.2; t += .1) { G.step(.1); shown.add(glow()); }
  const crowd = G.horde.all.slice(0, 12), d0 = crowd.map((s) => Math.hypot(s.x - truck.x, s.z - truck.z)), drawn = crowd.filter((s) => s.state === 1 && s.tx === truck.x).length;
  G.sim(10, 1 / 30);
  const closer = crowd.filter((s, i) => Math.hypot(s.x - truck.x, s.z - truck.z) < d0[i] - 8).length, still = G.lures.ALARMS.length;
  G.sim(5, 1 / 30); G.step(.1);
  return { went, flashed: shown.has(0) && [...shown].some((n) => n > 0), drawn, closer, still, after: G.lures.ALARMS.length, glowsAfter: glow(), again: G.lures.canAlarm(truck) };
});
check('a bottle thrown near it sets it off, from across the road', alarm.went, alarm);
check('its lights go on and off', alarm.flashed, alarm);
check(`the crowd comes to it: ${alarm.drawn} of 12 heard it, ${alarm.closer} are well on their way after 10 s`, alarm.drawn >= 10 && alarm.closer >= 10, alarm);
check('it stops after 15 s, and doesn\'t go again', alarm.still === 1 && alarm.after === 0 && alarm.glowsAfter === 0 && !alarm.again, alarm);
const hammer = await g(() => {
  const G = __game, parked = G.lures.VEHICLES.find((v) => v.kind === 'car' && G.lures.canAlarm(v) && Math.hypot(v.x - truck.x, v.z - truck.z) > 20 && Math.hypot(v.x - truck.x, v.z - truck.z) < 900);
  const yaw = Math.sin(parked.yaw), fx = Math.cos(parked.yaw), side = 1.9, x = parked.x + fx * side, z = parked.z - yaw * side;
  G.place(x, z); G.player.yaw = Math.atan2(parked.x - x, parked.z - z); G.S.mode = 'town'; G.step(.1);
  G.key('f', true); G.step(.05); G.key('f', false); G.step(.6);
  const on = G.lures.ALARMS.some((a) => a.v === parked), golf = G.lures.VEHICLES.find((v) => v.kind === 'golf');
  return { on, golf: G.lures.canAlarm(golf) };
});
check('so does a hammer, on a keyboard, and a golf cart hasn\'t got one', hammer.on && !hammer.golf, hammer);
await g(() => { const G = __game; G.step(16); });

// ---- into the water after it
// The cottonmouths have whoever goes in, and the current, and the river brings them up again downstream on the bank, soaked, with a snake on a sleeve, and they walk home. Nobody is lost, and nobody new walks in.
const intoTheWater = async (pg, tag, calm, picture) => {
  const e = (fn, arg) => pg.evaluate(fn, arg);
  await e(() => {
    const G = __game; crowdOnRoad([]);
    const isWet = (x, z) => G.floorAt(x, z) < G.water.level(x, z) - .1, dry = (x, z) => G.floorAt(x, z) > G.water.level(x, z) + .2 && !G.blocked(x, z, G.floorAt(x, z) + .1);
    // somewhere in the river, well away from any bridge and as near town as that can be, and a place on the bank a bottle's throw from it. It only goes as far as it goes.
    const [tx, tz] = G.map.fromTrue(0, 0), bridges = G.map.crossings.filter((k) => k.with === 'river');
    const places = G.map.river.flat().filter(([x, z]) => G.map.inBounds(x, z) && Math.hypot(x, z) > 300 && bridges.every((k) => Math.hypot(k.x - x, k.z - z) > 90)).sort((p, q) => Math.hypot(p[0] - tx, p[1] - tz) - Math.hypot(q[0] - tx, q[1] - tz));
    let spot = null, bank = null;
    for (const [x, z] of places) {
      if (bank) break;
      if (!isWet(x, z) || G.floorAt(x, z) > G.water.level(x, z) - .6) continue;
      for (let b = 0; b < 6.28 && !bank; b += .2) { const bx = x + Math.cos(b) * 20.9, bz = z + Math.sin(b) * 20.9; if (dry(bx, bz)) { let clear = true; for (let f = .1; f < .9; f += .1) if (G.blocked(bx + (x - bx) * f, bz + (z - bz) * f, 8)) clear = false; if (clear) { spot = { x, z }; bank = { x: bx, z: bz }; } } }
    }
    const yaw = Math.atan2(spot.x - bank.x, spot.z - bank.z);
    G.place(bank.x, bank.z); G.player.yaw = yaw; G.look(yaw + Math.PI, .3); G.S.mode = 'town'; G.S.items.bottle = 2; G.S.hand = 'bottle';
    // ten of them on the banks, in earshot of it and not too close to him
    const crowd = G.horde.all.slice(0, 10); let i = 0;
    for (let r = 10; r < 30 && i < 10; r += 2) for (let a = 0; a < 6.28 && i < 10; a += .5) { const x = spot.x + Math.cos(a) * r, z = spot.z + Math.sin(a) * r; if (!dry(x, z) || Math.hypot(x - bank.x, z - bank.z) < 12) continue; const s = crowd[i++]; s.x = x; s.z = z; s.y = G.floorAt(x, z); s.tx = x; s.tz = z; s.next = i * .01; }
    window.wetCrowd = crowd.slice(0, i); window.spot = spot; window.bank = bank; G.step(.1);
    return { spot, bank, placed: i, all: G.horde.all.length };
  });

  await pg.tap('#bC'); await e(() => __game.step(.05));
  await e(() => __game.step(.6)); await picture('water-going');
  const sunk = await e(() => {
    const G = __game, H = G.horde, was = H.all.length, inWater = (s) => G.floorAt(s.x, s.z) < G.water.level(s.x, s.z) - .1;
    flown();
    const landed = G.lures.lureSpots.at(-1), dist = Math.hypot(landed.x - spot.x, landed.z - spot.z);
    // who they are and what they remember: he's been around them, so they know him
    window.under = new Map(); window.up = [];
    for (const s of wetCrowd) { G.folks.close(s.who, 5); under.set(s, { met: s.who.met, near: null }); }
    const surfaced = H.on.surfaced; H.on.surfaced = (s) => { up.push({ s, x: s.x, z: s.z, wet: s.wet, dries: H.T.dries, snake: s.snake, snakeFor: H.T.snakeFor, sore: s.sore > 0, home: s.homeward, climbing: s.climbing, state: s.state, floor: G.floorAt(s.x, s.z), level: G.water.level(s.x, s.z), pond: !!G.water.in(s.x, s.z) }); surfaced?.(s); };
    const counts = new Set([H.all.length]);
    let most = 0, t = 0, quiet = 0;
    // until the cottonmouths have the ones that went in, the current's brought them up, and they're out of the water, with a moment to spare
    for (; t < 90 && (t < 12 || quiet < 4); t += .25) {
      G.S.mode = 'town'; G.sim(.25, 1 / 30);
      most = Math.max(most, wetCrowd.filter(inWater).length); counts.add(H.all.length);
      for (const s of wetCrowd) if (s.under !== undefined && !under.get(s).near) under.get(s).near = G.river.path.near(s.x, s.z);
      quiet = wetCrowd.some((s) => s.under !== undefined || s.climbing || (s.wading && inWater(s))) ? 0 : quiet + 1;
    }
    const went = [...under.values()].filter((o) => o.near).length;
    return { placed: wetCrowd.length, landedWet: G.floorAt(landed.x, landed.z) < G.water.level(landed.x, landed.z) - .1, dist, most, went, up: up.length, lost: was - H.all.length, counts: [...counts], t };
  });
  console.log(`     ${tag}${sunk.went} of ${sunk.placed} went in after it and under, ${sunk.up} came up again, all by ${sunk.t.toFixed(0)} s`);
  check(`${tag}a bottle in the water takes them in after it, and the cottonmouths have them: ${sunk.went} of ${sunk.placed}`, sunk.landedWet && sunk.most >= 3 && sunk.went >= 3, sunk);
  check(`${tag}and the crowd is the same size all the way through: nobody is lost, and nobody new comes in`, sunk.lost === 0 && sunk.counts.length === 1, sunk);
  const upAgain = await e(() => {
    const G = __game, H = G.horde, total = (p) => { let v = p.s; for (let k = G.river.path.lines[p.line].prev; k >= 0; k = G.river.path.lines[k].prev) v += G.river.path.lines[k].length; return v; };
    const mine = up.filter((u) => under.get(u.s)?.near);
    return {
      n: mine.length,
      soaked: mine.every((u) => u.wet === u.dries), snake: mine.every((u) => u.snake >= u.snakeFor[0] && u.snake <= u.snakeFor[1]), sore: mine.filter((u) => u.sore).length,
      inTheWater: mine.every((u) => u.floor < u.level - .1 && !u.pond && u.climbing), home: mine.every((u) => u.home && u.state === 0),
      downstream: mine.map((u) => total(G.river.path.near(u.x, u.z)) - total(under.get(u.s).near)),
      same: mine.every((u) => u.s.who === G.folks.person(u.s.who.id) && u.s.who.body === u.s), there: wetCrowd.every((s) => H.all.includes(s)),
    };
  });
  check(`${tag}they all come up again: ${upAgain.n} of ${sunk.went}`, upAgain.n === sunk.went && upAgain.there && upAgain.same, upAgain);
  check(`${tag}downstream, ${upAgain.downstream.map((d) => d.toFixed(0)).join(', ')} m, and not up the river`, upAgain.downstream.length > 0 && upAgain.downstream.every((d) => d > 5 && d < 70), upAgain);
  check(`${tag}up in the water to wade out of it, soaked, with a snake on a sleeve, and heading home, not after anyone`, upAgain.soaked && upAgain.snake && upAgain.inTheWater && upAgain.home, upAgain);
  // they walk home to dry off: out on the bank and drawn soaked, with the snake on a sleeve, which the graphics card has, and one of them in front of the camera
  const drawn = await e(() => {
    const G = __game, list = up.filter((u) => under.get(u.s)?.near).map((u) => u.s), P = G.player.pos;
    const s = list.filter((o) => o.snake > 0).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
    if (!s) return { none: true, n: list.length, snakes: G.river.snakes() };
    window.soaked = s;
    // from dry ground a few metres off, level with them, which is up the bank from the river and not in it, with the camera behind him and a little to one side
    let at = null;
    for (let r = 5.5; r <= 9 && !at; r += 1.5) for (let a = 0; a < 6.28 && !at; a += .4) {
      const x = s.x + Math.sin(a) * r, z = s.z + Math.cos(a) * r, f = G.floorAt(x, z);
      if (f > G.water.level(x, z) + .3 && Math.abs(f - s.y) < 1 && !G.blocked(x, z, f) && !G.water.in(x, z)) at = { x, z };
    }
    const dx = at.x - s.x, dz = at.z - s.z;
    G.place(at.x, at.z); G.player.yaw = Math.atan2(-dx, -dz); G.look(Math.atan2(dx, dz) + .4, .26); G.S.mode = 'town'; G.HP.speed = 0; G.step(.5, 1 / 24);
    const wets = list.map((o) => G.river.wetOn(o)).filter((v) => v !== null);
    // and the snake on its sleeve, step by step: it swings a little, or with reduced motion it only hangs
    const seen = new Set();
    for (let i = 0; i < 12; i++) { G.step(1 / 12, 1 / 24); const m = G.river.relative(s); if (m) seen.add(m.slice(0, 11).map((v) => (Math.round(v * 100) / 100 || 0).toFixed(2)).join()); }
    return { shown: wets.length, wet: Math.min(...wets), snakes: G.river.snakes(), on: list.filter((o) => o.snake > 0).length, n: list.length, hung: seen.size };
  });
  check(`${tag}they're drawn soaked, with ${drawn.snakes?.drawn} snakes on sleeves`, !drawn.none && drawn.shown >= 1 && drawn.wet > .5 && drawn.snakes.drawn >= 1 && drawn.snakes.shown && drawn.snakes.calls === 2, drawn);
  check(`${tag}and the snake ${calm ? 'only hangs' : 'swings a little'}`, calm ? drawn.hung === 1 : drawn.hung > 3, drawn);
  await picture('water-after');
  const home = await e(() => {
    const G = __game, H = G.horde, list = up.filter((u) => under.get(u.s)?.near).map((u) => u.s), home = (s) => Math.hypot(s.x - s.homeX, s.z - s.homeZ);
    const d0 = list.map(home);
    G.S.mode = 'town'; G.sim(20, 1 / 30);
    const out = list.map((s, i) => ({ dry: G.floorAt(s.x, s.z) >= G.water.level(s.x, s.z) - .1 && !G.water.in(s.x, s.z), out: !s.climbing && !s.wading, got: d0[i] - home(s) }));
    // what they remember carries on: they know him still, the bottle is remembered, and so is where the river had them
    const mem = list.map((s) => ({ met: s.who.met, near: s.who.near >= 5, fooled: (s.who.fooled.bottle ?? 0) >= 1, shun: !!s.who.shun, same: s.who === G.folks.person(s.who.id) }));
    // and the rest of the day, in case anyone was owed
    G.sim(60, 1 / 30);
    return { out, mem, later: H.all.length };
  });
  check(`${tag}then out on the bank, on dry ground and not in a pond, and walking home, slower than they went about`, home.out.every((o) => o.dry && o.out && o.got > 1 && o.got / 20 < .8), home.out);
  check(`${tag}and they're the same people: what they remember carries on, the bottle too, and where the river had them`, home.mem.every((m) => m.met && m.near && m.fooled && m.shun && m.same), home.mem);
  check(`${tag}and nobody new walks into town to take their place, not in the next minute either`, home.later === sunk.counts[0], home);

};
await intoTheWater(page, '', false, snap);

// ---- and wherever along the river someone goes under, there's a bank to come up on that they can walk home from: every 40 m of it inside the map, from either side
const banks = await g(() => {
  const G = __game, P = G.river.path;
  const wet = (x, z) => G.floorAt(x, z) < G.water.level(x, z) - .1, open = (x, z) => G.map.inBounds(x, z) && !G.blocked(x, z, G.floorAt(x, z)) && !wet(x, z);
  // can they walk away from here: a flood fill of 4 m cells that has to get 100 m from where it started without leaving the map or crossing anything
  const escapes = (x0, z0) => {
    const seen = new Set([0]), queue = [[0, 0]], C = 4; let n = 0, far = 0;
    while (queue.length && n < 2500 && far < 100) {
      const [i, j] = queue.shift(); n++; far = Math.max(far, Math.hypot(i, j) * C);
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const ni = i + a, nj = j + b, k = ni * 100000 + nj;
        if (seen.has(k) || Math.hypot(ni, nj) * C > 150) continue; seen.add(k);
        if (open(x0 + ni * C, z0 + nj * C)) queue.push([ni, nj]);
      }
    }
    return far >= 100;
  };
  const total = (p) => { let v = p.s; for (let k = P.lines[p.line].prev; k >= 0; k = P.lines[k].prev) v += P.lines[k].length; return v; };
  const r = { tried: 0, none: 0, wet: 0, blocked: 0, pond: 0, trapped: [], up: 0, full: 0 };
  for (let k = 0; k < P.lines.length; k++) {
    if (P.lines[k].length < 5000) continue;
    for (let s = 100; s < P.lines[k].length - 100; s += 40) {
      const c = P.point(k, s);
      if (!G.map.inBounds(c.x, c.z)) continue;
      for (const side of [-1, 1]) {
        const x = c.x - c.tz * 4 * side, z = c.z + c.tx * 4 * side;
        if (!wet(x, z) || G.blocked(x, z, G.floorAt(x, z))) continue;
        // with home on one bank or the other, a way off
        const metres = 35 + (r.tried % 5) * 7, at = G.river.comeUp({ x, z }, { metres, side: (r.tried % 9) / 9, home: [c.x - c.tz * 300 * side, c.z + c.tx * 300 * side] });
        r.tried++;
        if (!at) { r.none++; continue; }
        if (wet(...at.bank)) r.wet++;
        if (G.blocked(at.bank[0], at.bank[1], G.floorAt(...at.bank))) r.blocked++;
        if (G.water.in(...at.bank) || G.water.in(at.x, at.z)) r.pond++;
        if (!escapes(...at.bank)) r.trapped.push(at.bank.map(Math.round));
        const swept = total(P.near(at.x, at.z)) - total(P.near(x, z));
        if (swept > -3) r.up++;
        if (swept >= metres - 10) r.full++;
      }
    }
  }
  return r;
});
check(`all along the river, ${banks.tried} places: somewhere dry to come up that's inside the map, not in a pond, with a way off it`, banks.tried > 300 && banks.none === 0 && banks.wet === 0 && banks.blocked === 0 && banks.pond === 0 && banks.trapped.length === 0, banks);
check(`and it's downstream every time, and as far as the current took them in ${banks.full} of ${banks.tried}`, banks.up === banks.tried && banks.full > banks.tried * .9, banks);

// ---- someone else's problem
const coop = await g(() => {
  const G = __game; crowdOnRoad([]);
  const { x, z } = G.npcs.coop;
  G.S.items.crackers = 2; G.S.hand = 'crackers';
  const fromX = x - 12, fromZ = z + 6, yaw = Math.atan2(x - fromX, z - fromZ);
  G.place(fromX, fromZ); G.player.yaw = yaw; G.look(yaw + Math.PI, .3); G.S.mode = 'town';
  G.horde.all.slice(0, 16).forEach((s, i) => { const a = i * .5; s.x = x + Math.sin(a) * (22 + i % 4); s.z = z + Math.cos(a) * (22 + i % 4) + 8; s.y = G.floorAt(s.x, s.z); s.tx = s.x; s.tz = s.z; s.next = i * .01; });
  G.step(.1);
  return { x, z, before: G.state().people.coop.trust };
});
await tap();
const swarmed = await g(() => {
  const G = __game; flown();
  const P = G.player.pos, trust = () => G.state().people.coop.trust;
  // he gets well clear: he'd rather watch from over here
  G.place(P.x - 70, P.z + 30);
  for (let t = 0; t < 30; t += .5) { G.S.mode = 'town'; G.sim(.5, 1 / 30); }
  return { after: trust(), near: G.horde.all.filter((s) => Math.hypot(s.x - G.npcs.coop.x, s.z - G.npcs.coop.z) < 9).length };
});
check(`letting them get around Coop costs a point of trust: ${coop.before} to ${swarmed.after}, with ${swarmed.near} around him`, swarmed.after === coop.before - 1, { coop, swarmed });
const once = await g(() => { const G = __game, p = () => G.state().people.coop.trust, was = p(); G.lures.lureSpots.push({ x: G.npcs.coop.x, z: G.npcs.coop.z, until: 1e9 }); G.sim(5, 1 / 30); return { was, now: p() }; });
check('and only the once, for a while', once.now === once.was, once);

// ---- switching
const sw = await g(() => { const G = __game; crowdOnRoad([]); Object.assign(G.S.items, { bottle: 1, crackers: 1, fluid: 0 }); G.S.gas = 0; G.S.beans = 0; G.S.hand = 'bottle'; G.S.mode = 'town'; G.step(.1); return { n: !document.getElementById('bN').hidden, c: document.getElementById('bC').textContent }; });
await tap('#bN');
const sw2 = await g(() => { const G = __game; G.step(.1); return { c: document.getElementById('bC').textContent }; });
await tap(); await g(() => { __game.lures.flying.forEach(() => {}); __game.step(1.5); });
const sw3 = await g(() => { const G = __game; G.step(.1); return { n: !document.getElementById('bN').hidden, c: document.getElementById('bC').textContent, hand: G.lures.thrownNow()?.kind }; });
check(`SWAP goes from ${sw.c} to ${sw2.c}, and when that's gone he's back to what's left`, sw.n && /BOTTLE/.test(sw.c) && /CRACKERS/.test(sw2.c) && /BOTTLE/.test(sw3.c) && !sw3.n, { sw, sw2, sw3 });
await tap(); await g(() => __game.step(1.5));
check('with nothing left the button goes', await g(() => document.getElementById('bC').hidden));

// ---- what it costs, at the worst of it
const cost = await g(() => {
  const G = __game; Object.assign(G.S.items, { bottle: 4, crackers: 4, fluid: 2 }); crowdOnRoad([[0, 1, 48]]); stand(1.2, 0, offRoad(1.2)); G.step(.5);
  const info = G.renderer.info; info.autoReset = false; info.reset(); G.step(1 / 30); const quiet = { calls: info.render.calls, tris: info.render.triangles }; info.autoReset = true;
  G.lures.soundAlarm(G.lures.VEHICLES.find((v) => G.lures.canAlarm(v) && Math.hypot(v.x - G.player.pos.x, v.z - G.player.pos.z) < 200) ?? G.lures.VEHICLES.find((v) => G.lures.canAlarm(v)));
  G.key('q', true); G.step(.03); G.key('q', false); G.step(.3); G.S.hand = 'crackers'; G.key('q', true); G.step(.03); G.key('q', false); G.step(.3); G.S.hand = 'fluid'; G.key('q', true); G.step(.03); G.key('q', false);
  G.step(1); G.renderer.info.autoReset = false; G.renderer.info.reset(); G.step(1 / 30); const r = { calls: G.renderer.info.render.calls, tris: G.renderer.info.render.triangles }; G.renderer.info.autoReset = true;
  return { ...r, quiet, shown: G.crowd().shown };
});
console.log(`     with ${cost.shown} of the crowd in view: ${cost.quiet.calls} draw calls and ${cost.quiet.tris} triangles, or ${cost.calls} and ${cost.tris} with firecrackers, a fire and an alarm going`);
await snap('all-of-it');

check('no console errors', errors.length === 0, errors);
await close();

// ---- and for anyone who'd rather things didn't flash
{
  const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const still = await page.evaluate(() => {
    const G = __game; G.pause(); G.jump('town'); G.S.flags.town = true; G.S.flags.ended = G.S.flags.arrived = true; G.step(.1); G.bringOutCrowd(); G.horde.calm();
    const v = G.lures.VEHICLES.find((o) => G.lures.canAlarm(o)), P = G.player.pos; G.lures.soundAlarm(v);
    const lit = []; for (let t = 0; t < 2; t += .1) { G.step(.1); lit.push(G.lures.glows.filter((o) => o.visible).length); }
    G.S.items.crackers = 1; G.S.hand = 'crackers'; G.place(v.x + 200, v.z); G.player.yaw = 0; G.S.mode = 'town'; G.key('q', true); G.step(.03); G.key('q', false);
    for (let i = 0; i < 90 && G.lures.flying.some((f) => f.on); i++) G.step(1 / 30);
    const popped = G.lures.popping.length; let most = 0; for (let t = 0; t < 2; t += .05) { G.step(.05); most = Math.max(most, G.lures.glows.filter((o) => o.visible).length); }
    return { lit: [...new Set(lit)], popped, most };
  });
  check('with reduced motion a car alarm\'s lights stay on, and firecrackers don\'t flash', still.lit.length === 1 && still.lit[0] === 2 && still.popped === 1 && still.most <= 2, still);
  // the water the same way, with nothing swung that doesn't have to be: the snake only hangs
  await page.evaluate(setup);
  await intoTheWater(page, 'with reduced motion, ', true, async () => {});
  check('no console errors', errors.length === 0, errors);
  await close();
}
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
