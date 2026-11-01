// Plays Chapter 1 on foot in real Chrome, from stepping off the bridge to its final objective, and fails on
// anything blocked or unreachable. Unlike tools/smoke.mjs nothing's teleported: it holds forward with the game's
// own movement, and gets to Tre, back to Coop and to Miss Odessa by following the objective's arrow.
//
//   npm i && npm run play -- [--shots dir]
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { serveAndOpen } from './browser.mjs';

const args = process.argv.slice(2), shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const { page, errors, close } = await serveAndOpen({ viewport: { width: 390, height: 844 } });

let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) { await mkdir(shots, { recursive: true }); await g(() => __game.step(.1)); await page.screenshot({ path: join(shots, name + '.png') }); } };

await g(() => {
  const G = __game;
  G.pause();
  // The way from one place to another on foot, over a half-metre grid, or null if there's no way. It only looks as far as it has to.
  const CELL = .5;
  const pathTo = (x0, z0, x1, z1, reach) => {
    const pass = (i, j) => { const x = i * CELL, z = j * CELL, f = G.floorAt(x, z); return f > 2.2 && !G.blocked(x, z, f); };
    const key = (i, j) => (i + 32768) * 65536 + j + 32768, S0 = [Math.round(x0 / CELL), Math.round(z0 / CELL)], T = [Math.round(x1 / CELL), Math.round(z1 / CELL)];
    const came = new Map([[key(...S0), null]]);
    let now = [S0], found = null;
    for (let round = 0; round < reach / CELL && now.length && !found; round++) {
      const next = [];
      for (const [i, j] of now) {
        if (Math.abs(i - T[0]) <= 2 && Math.abs(j - T[1]) <= 2) { found = [i, j]; break; }
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = key(i + a, j + b);
          if (came.has(k) || !pass(i + a, j + b)) continue;
          came.set(k, [i, j]); next.push([i + a, j + b]);
        }
      }
      now = next;
    }
    if (!found) return null;
    const path = [];
    for (let c = found; c; c = came.get(key(...c))) path.push([c[0] * CELL, c[1] * CELL]);
    return path.reverse();
  };
  const clearLine = (x0, z0, x1, z1) => { const l = Math.hypot(x1 - x0, z1 - z0); for (let t = 0; t <= l; t += .5) { const x = x0 + (x1 - x0) * t / l, z = z0 + (z1 - z0) * t / l, f = G.floorAt(x, z); if (f < 2.2 || G.blocked(x, z, f)) return false; } return true; };
  // Heads for `next()`, a world position or null when it's done. A wall in the way gets walked around, and it only
  // counts as blocked if there's no way round it, or it runs out of time.
  window.walk = (next, seconds = 500) => {
    const P = G.player.pos, dt = 1 / 30, began = G.state().time;
    let t = 0, last = [P.x, P.z], lastT = 0, way = null, target = null, rounds = 0;
    G.key('w', true);
    while (t < seconds) {
      const to = next(); if (!to) break;
      // the straight line until it's blocked, then the way round
      if (!way || Math.hypot(to[0] - target[0], to[1] - target[1]) > 4) {
        const far = Math.hypot(to[0] - P.x, to[1] - P.z);
        target = to; way = clearLine(P.x, P.z, to[0], to[1]) ? [to] : null;
        // a long way off, a leg at a time, and only the whole way if that doesn't get anywhere
        if (!way && far > 90) way = pathTo(P.x, P.z, P.x + (to[0] - P.x) * 70 / far, P.z + (to[1] - P.z) * 70 / far, 140);
        if (!way) way = pathTo(P.x, P.z, to[0], to[1], far * 1.6 + 260);
        if (way && way.length > 1) rounds++;
        if (!way) { G.key('w', false); return { blocked: true, noWay: true, at: [P.x, P.z], to, t, rounds }; }
      }
      // on to the furthest point of it he can see from here
      if (way.length > 1) { let k = 0; for (let i = Math.min(way.length - 1, 40); i > 0; i--) if (clearLine(P.x, P.z, way[i][0], way[i][1])) { k = i; break; } if (k) way.splice(0, k); else if (Math.hypot(way[0][0] - P.x, way[0][1] - P.z) < .35) way.shift(); }
      const aim = way.length > 1 || !clearLine(P.x, P.z, to[0], to[1]) ? way[0] : to;
      if (way.length === 1 && aim === way[0] && aim !== to && Math.hypot(aim[0] - P.x, aim[1] - P.z) < .5) way = null;
      G.look(Math.atan2(P.x - aim[0], P.z - aim[1])); G.sim(dt, dt); t += dt;
      if (!way) continue;
      if (t - lastT > 1.5) { if (Math.hypot(P.x - last[0], P.z - last[1]) < 1) { way = null; if (++rounds > 40) break; } last = [P.x, P.z]; lastT = t; }
    }
    G.key('w', false); G.step(.1);
    return { blocked: t >= seconds || rounds > 40, at: [P.x, P.z], t: G.state().time - began, tries: rounds };
  };
  window.walkTo = (x, z, reach = .6) => walk(() => (Math.hypot(G.player.pos.x - x, G.player.pos.z - z) > reach ? [x, z] : null));
  // Follows the arrow until it goes away, which means he's got there. It only updates on a drawn step.
  window.followArrow = () => {
    const P = G.player.pos; G.step(.1);
    // where it's pointing, from which way and how far
    return walk(() => { G.step(1 / 12); if (!G.pointer.on) return null; const a = G.cam.yaw - G.pointer.deg * Math.PI / 180, far = Math.max(G.pointer.dist, 1); return [P.x - Math.sin(a) * far, P.z - Math.cos(a) * far]; });
  };
  window.press = (k = 'e') => { G.key(k, true); G.step(.05); G.key(k, false); return G.state(); };
});
const st = () => g(() => __game.state());
const walkTo = (x, z, reach) => g(([x, z, reach]) => walkTo(x, z, reach), [x, z, reach]);
const blockedCheck = (name, r) => check(`${name}: ${r.t.toFixed(0)} s on foot${r.tries ? `, around ${r.tries} obstacles` : ''}`, !r.blocked, r);
const can = (i) => g((i) => { const c = __game.pickups[i]; return { x: c.x, y: c.y, z: c.z, got: c.got }; }, i);
const talk = async (id, who) => {
  const n = await g((id) => __game.npcs[id], id);
  const r = await walkTo(n.x, n.z, 2); blockedCheck(`walk up to ${who}`, r);
  const s = await g(() => __game.state()); check(`${who} offers to talk`, s.prompt.includes(who), s.prompt);
  const d = await g(() => press()); check(`${who} talks`, d.dialog?.who === who, d.dialog);
  await inShot(id, who);
  return d;
};
const choose = (i = 0) => g((i) => __game.choose(i), i);
// that the camera's settled somewhere you can see who he's talking to, and isn't in a wall
const inShot = async (id, who) => {
  const v = await g((id) => { const G = __game, n = G.npcs[id], c = G.camera, P = G.player.pos; G.step(.7); c.updateMatrixWorld(); const at = new c.position.constructor(n.x, P.y + 1.8, n.z).project(c); return { x: at.x, y: at.y, inWall: G.blocked(c.position.x, c.position.z, P.y + 1) }; }, id);
  check(`${who}'s face is in shot`, Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && !v.inWall, v);
};

// nothing's left where the prototype had it
const PROTOTYPE = { coop: [53, 8.4], tre: [84, 12.2], odessa: [68.5, -5.8] }, PROTOTYPE_CANS = [[38.2, -12.7], [43, -9.7], [76.6, 20.6], [100, -14], [85.9, 14]];
const placed = await g(() => ({ npcs: __game.npcs, cans: __game.pickups.map((c) => [c.x, c.z]) }));
for (const [id, at] of Object.entries(PROTOTYPE)) { const d = Math.hypot(placed.npcs[id].x - at[0], placed.npcs[id].z - at[1]); check(`${id} has moved from the prototype's spot, by ${d.toFixed(0)} m`, d > 50, placed.npcs[id]); }
placed.cans.forEach((c, i) => { const d = Math.min(...PROTOTYPE_CANS.map((p) => Math.hypot(c[0] - p[0], c[1] - p[1]))); check(`can ${i + 1} has moved, by ${d.toFixed(0)} m`, d > 50, c); });

// stepping off the bridge
await g(() => { __game.jump('town'); __game.place(24, 0); __game.step(.1); });
let s = await st();
check('town begins with the road', /^Follow US 80 into town$/.test(s.obj), s.obj);
let arrow = await g(() => __game.pointer);
check(`the arrow points down the road, ${arrow.dist.toFixed(0)} m to the gas station`, arrow.on && arrow.dist > 200, arrow); await snap('01-off-the-bridge');
let r = await g(() => walk(() => (__game.state().flags.arrived ? null : [__game.npcs.coop.x, 0]))); blockedCheck('along US 80 to the edge of town', r);
s = await st(); check('arriving points at Coop', /Stock up on beans \(0\/12\) · Coop is at the gas station on US 80/.test(s.obj), s.obj); await snap('02-arrived');

// Coop's bag
let d = await talk('coop', 'Coop'); await snap('03-coop');
await choose(0); await choose(0); s = await choose(0); check('took the bag', s.items.bag === 1, s.items);
check('Coop says where the tracks really are', /south, across the road/.test(s.dialog?.say), s.dialog); s = await choose(0);
check('the objective says where Tre is', /Take Coop's bag to Tre at the boxcar, south of US 80/.test(s.obj), s.obj); await snap('04-bag');

// follow the arrow to Tre, past the can by the boxcar
r = await g(() => followArrow()); blockedCheck('follow the arrow to Tre', r);
d = await talk('tre', 'Tre'); await snap('05-tre');
s = await choose(0); check('delivered for 2 beans', s.flags.delivered === true && s.beans >= 2, s); s = await choose(0);
check('the objective says go back to Coop', /Go get paid by Coop at the gas station on US 80/.test(s.obj), s.obj);
const boxCan = await can(4);
if (!boxCan.got) { r = await walkTo(boxCan.x, boxCan.z, .8); blockedCheck('the can by the boxcar', r); }
check('picked up the can by the boxcar', (await can(4)).got, await can(4));

// and back
r = await g(() => followArrow()); blockedCheck('follow the arrow back to Coop', r);
d = await talk('coop', 'Coop'); s = await st(); check('paid', s.flags.paid === true, s.flags); s = await choose(0);

// the rest of the cans, in through the store's door
const store = await g(() => { const P = __game.places.store; return [P.x, P.z]; });
const at = ([x, z]) => [x + store[0], z + store[1]];
for (const [name, x, z, reach] of [['the store door', ...at([42.4, -3.8]), .6], ['inside', ...at([42.4, -7.6]), .5], ['the shelf can', ...at([43, -8.95]), .25]]) { r = await walkTo(x, z, reach); blockedCheck(name, r); }
await snap('06-store');
check('picked up the can on the near shelf', (await can(1)).got, await can(1));
for (const [name, x, z, reach] of [['round to the gap', ...at([40.6, -8.2]), .4], ['past the counter', ...at([40.6, -11.3]), .4], ['the back shelf can', ...at([38.2, -11.7]), .3]]) { r = await walkTo(x, z, reach); blockedCheck(name, r); }
check('picked up the can on the back shelf', (await can(0)).got, await can(0));
for (const [name, x, z, reach] of [['back past the counter', ...at([40.6, -11.3]), .4], ['and through the gap', ...at([40.6, -8.2]), .4], ['to the door', ...at([42.4, -7.6]), .5], ['out the door', ...at([42.4, -3.8]), .6]]) { r = await walkTo(x, z, reach); blockedCheck(name, r); }
for (const [i, name] of [[2, 'the can by the mobile home'], [3, 'the can under the water tower']]) {
  const c = await can(i); r = await walkTo(c.x, c.z, .8); blockedCheck(name, r);
  check(`picked up ${name}`, (await can(i)).got, await can(i));
}
s = await st(); check('ten beans by now and only Miss Odessa left', s.beans === 10 && /Miss Odessa is at the church on Church St/.test(s.obj), [s.beans, s.obj]); await snap('07-cans');

// Church St and the sweeping, which takes it past twelve
r = await g(() => followArrow()); blockedCheck('follow the arrow to Church St', r);
d = await talk('odessa', 'Miss Odessa'); await snap('08-odessa');
await choose(0); s = await choose(0); check('sweeping', s.mode === 'sweep', s.mode);
await g(() => __game.key('e', true)); s = await g(() => __game.step(3.4)); await g(() => __game.key('e', false));
check('swept for 3 beans, and twelve is plenty', s.flags.swept === true && s.beans >= 12, [s.flags.swept, s.beans]); await inShot('odessa', 'Miss Odessa'); await snap('09-swept');
check('nobody else on the streets for the whole chapter', !(await g(() => __game.crowd())).out);
s = await g(() => __game.step(2)); check('the chapter ends', s.mode === 'end', s.mode); await snap('10-end');
check('and now they come out', (await g(() => __game.crowd())).all > 0);
await page.click('#again'); s = await g(() => __game.step(.1)); check('the final objective', s.mode === 'town' && /Chunky is yours/.test(s.obj), [s.mode, s.obj]);
arrow = await g(() => __game.pointer); check('and nothing left to point at', !arrow.on, arrow);

check('no console errors', errors.length === 0, errors);
await close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
