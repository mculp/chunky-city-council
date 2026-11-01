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
  // Heads for `next()`, a world position or null when it's done. A wall in the way gets walked around, and only
  // running out of ways round it, or time, counts as blocked.
  window.walk = (next, seconds = 400) => {
    const P = G.player.pos, dt = 1 / 30, began = G.state().time;
    let t = 0, last = [P.x, P.z], lastT = 0, side = 1, tries = 0, round = 0;
    G.key('w', true);
    while (t < seconds) {
      const to = next(); if (!to) break;
      let yaw = Math.atan2(P.x - to[0], P.z - to[1]);    // the camera sits behind the way he's going
      if (round > 0) { yaw += side * Math.PI / 2; round -= dt; }
      G.look(yaw); G.sim(dt, dt); t += dt;
      if (t - lastT > 1) {
        if (round <= 0 && Math.hypot(P.x - last[0], P.z - last[1]) < 1) { tries++; side = -side; round = 1 + tries * .5; if (tries > 12) { G.key('w', false); return { blocked: true, at: [P.x, P.z], t, tries }; } }
        last = [P.x, P.z]; lastT = t;
      }
    }
    G.key('w', false); G.step(.1);
    return { blocked: t >= seconds, at: [P.x, P.z], t: G.state().time - began, tries };
  };
  window.walkTo = (x, z, reach = .6) => walk(() => (Math.hypot(G.player.pos.x - x, G.player.pos.z - z) > reach ? [x, z] : null));
  // Follows the arrow until it goes away, which means he's got there. It only updates on a drawn step.
  window.followArrow = () => {
    const P = G.player.pos; G.step(.1);
    return walk(() => { G.step(1 / 12); if (!G.pointer.on) return null; const a = G.cam.yaw - G.pointer.deg * Math.PI / 180; return [P.x - Math.sin(a) * 10, P.z - Math.cos(a) * 10]; });
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
  return d;
};
const choose = (i = 0) => g((i) => __game.choose(i), i);

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

// the rest of the cans, in through the Mercantile's door
const store = await g(() => { const P = __game.places.store; return [P.x, P.z]; });
const at = ([x, z]) => [x + store[0], z + store[1]];
for (const [name, x, z, reach] of [['the Mercantile door', ...at([40, -4]), .6], ['inside', ...at([40.6, -8]), .5], ['the shelf can', ...at([43, -8.7]), .3]]) { r = await walkTo(x, z, reach); blockedCheck(name, r); }
await snap('06-store');
check('picked up the can on the near shelf', (await can(1)).got, await can(1));
for (const [name, x, z, reach] of [['past the counter', ...at([40.6, -11.3]), .4], ['the back shelf can', ...at([38.2, -11.7]), .3]]) { r = await walkTo(x, z, reach); blockedCheck(name, r); }
check('picked up the can on the back shelf', (await can(0)).got, await can(0));
for (const [name, x, z, reach] of [['back past the counter', ...at([40.6, -11.3]), .4], ['out the door', ...at([40, -4]), .6]]) { r = await walkTo(x, z, reach); blockedCheck(name, r); }
for (const [i, name] of [[2, 'the can by the trailers'], [3, 'the can under the water tower']]) {
  const c = await can(i); r = await walkTo(c.x, c.z, .8); blockedCheck(name, r);
  check(`picked up ${name}`, (await can(i)).got, await can(i));
}
s = await st(); check('ten beans by now and only Miss Odessa left', s.beans === 10 && /Miss Odessa is at the church on Church St/.test(s.obj), [s.beans, s.obj]); await snap('07-cans');

// Church St and the sweeping, which takes it past twelve
r = await g(() => followArrow()); blockedCheck('follow the arrow to Church St', r);
d = await talk('odessa', 'Miss Odessa'); await snap('08-odessa');
await choose(0); s = await choose(0); check('sweeping', s.mode === 'sweep', s.mode);
await g(() => __game.key('e', true)); s = await g(() => __game.step(3.4)); await g(() => __game.key('e', false));
check('swept for 3 beans, and twelve is plenty', s.flags.swept === true && s.beans >= 12, [s.flags.swept, s.beans]); await snap('09-swept');
check('nobody else on the streets for the whole chapter', !(await g(() => __game.crowd())).out);
s = await g(() => __game.step(2)); check('the chapter ends', s.mode === 'end', s.mode); await snap('10-end');
check('and now they come out', (await g(() => __game.crowd())).all > 0);
await page.click('#again'); s = await g(() => __game.step(.1)); check('the final objective', s.mode === 'town' && /Chunky is yours/.test(s.obj), [s.mode, s.obj]);
arrow = await g(() => __game.pointer); check('and nothing left to point at', !arrow.on, arrow);

check('no console errors', errors.length === 0, errors);
await close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
