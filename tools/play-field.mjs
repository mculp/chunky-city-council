// Walks onto the ball field from Adams St and runs the bases with the game's own movement and real key presses, and
// checks that the fence and the backstop stop him and that the gates let him through, on foot and in a pickup.
//
//   npm i && npm run field
import { serveAndOpen } from './browser.mjs';

const { page, errors, close } = await serveAndOpen({ viewport: { width: 390, height: 844 } });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);

await g(() => {
  const G = __game; G.pause(); G.jump('town'); G.S.flags.town = true; G.step(.1);
  window.at = ([x, z]) => { G.place(...G.map.fromTrue(x, z)); G.sim(1 / 30, 1 / 30); };
  window.where = () => { const P = G.player.pos, [ox, oz] = G.map.fromTrue(0, 0); return [P.x - ox, P.z - oz]; };
  // heads for a true spot until he's there or the time's up, and says how close he got
  window.walk = (to, seconds = 40) => {
    const [x, z] = G.map.fromTrue(...to), P = G.player.pos; G.key('w', true); let t = 0;
    for (; t < seconds && Math.hypot(P.x - x, P.z - z) > .7; t += 1 / 30) { G.look(Math.atan2(P.x - x, P.z - z)); G.sim(1 / 30, 1 / 30); }
    G.key('w', false); G.sim(1 / 30, 1 / 30);
    return { off: Math.hypot(P.x - x, P.z - z), t, at: where() };
  };
});

// off Adams St and straight at the outfield fence: it stops him
await g(() => at([-282, -490]));
const fence = await g(() => walk([-340, -490], 25));
check('coming off Adams St, the outfield fence stops him', fence.at[0] > -299.2 && fence.at[0] < -290, fence);
// around to the wide gate in the right field corner and onto the grass
await g(() => at([-282, -445]));
const gate = await g(() => [walk([-300, -448], 30), walk([-303.2, -453.3], 12), walk([-320, -468], 15)]);
check('from Adams St through the wide gate and onto the field', gate.every((w) => w.off < 1), gate);
// around the bases and home
await g(() => at([-378.4, -463.5]));
const bases = await g(() => [[-360.36, -460.44], [-357.3, -478.5], [-375.34, -481.54], [-378.4, -463.5]].map((b) => walk(b, 12)));
check('runs the bases and comes home with nothing in the way', bases.every((w) => w.off < 1), bases);
const clay = await g(() => { const G = __game; at([-364, -472]); return { y: G.player.pos.y, floor: G.floorAt(G.player.pos.x, G.player.pos.z), ok: G.S.mode === 'town' }; });
check('the infield is level with the ground', Math.abs(clay.floor - 6.15) < .02 && clay.ok, clay);
// the backstop's behind home, and he can't jump it
await g(() => at([-378.4, -463.5]));
const stop = await g(() => { const G = __game, w = walk([-392, -452], 6), a = where(); G.key(' ', true); G.sim(.4, 1 / 30); G.key(' ', false); const b = walk([-392, -452], 3); return { w, b }; });
check('the backstop stops him, jumping or not', stop.w.off > 8 && stop.b.off > 8, stop);
// through the gates beside the dugouts, from the field out
await g(() => at([-374, -489]));
const third = await g(() => [walk([-380.2, -487.6], 8), walk([-386, -491], 6)]);
check('out through the gate by the third base dugout', third.every((w) => w.off < 1), third);
await g(() => at([-358.6, -459]));
const first = await g(() => [walk([-358.8, -453.7], 8), walk([-358.8, -447.5], 6)]);
check('out through the gate by the first base dugout', first.every((w) => w.off < 1), first);
// the dugout: he can sit in it from the field, and its back wall stops him
await g(() => at([-375, -482]));
const dug = await g(() => walk([-390, -484.5], 6));
check('the third base dugout has a back wall', dug.off > 3 && dug.at[0] > -384.8, dug);
// a pickup goes in through the wide gate and the fence stops it anywhere else
const drove = await g(() => {
  const G = __game, v = G.vehicles.find((o) => o.kind === 'pickup' && !o.wrecked && !o.drowned), a = v.yaw + Math.PI / 2, off = v.K.width / 2 + 1;
  G.place(v.x + Math.sin(a) * off, v.z + Math.cos(a) * off); G.step(.6); G.key('e', true); G.sim(1 / 30, 1 / 30); G.key('e', false); G.sim(1 / 30, 1 / 30);
  const d = G.driving(); if (!d) return { boarded: false };
  const put = (x, z, yaw) => { const [wx, wz] = G.map.fromTrue(x, z); d.x = wx; d.z = wz; d.y = G.floorAt(wx, wz); d.yaw = yaw; d.f = d.s = d.steer = 0; d.grounded = true; G.look(yaw + Math.PI); };
  const go = (x, z, seconds) => { const [tx, tz] = G.map.fromTrue(x, z); let t = 0; for (; t < seconds && Math.hypot(d.x - tx, d.z - tz) > 2.5; t += 1 / 30) { let e = Math.atan2(tx - d.x, tz - d.z) - d.yaw; e = Math.atan2(Math.sin(e), Math.cos(e)); G.stick(Math.max(-1, Math.min(1, -e * 2.4)), Math.abs(d.f) > 7 ? 0 : 1); G.sim(1 / 30, 1 / 30); } G.stick(0, 0); return { off: Math.hypot(d.x - tx, d.z - tz), hp: d.hp }; };
  put(-296, -444, Math.atan2(-7.2, -9.3)); const a1 = go(-303.2, -453.3, 12), a2 = go(-320, -470, 12);
  put(-286, -490, -Math.PI / 2); const hp0 = d.hp, b = go(-330, -490, 8), [ox] = G.map.fromTrue(0, 0);
  return { boarded: true, a1, a2, x: d.x - ox, hurt: hp0 - d.hp };
});
check('a pickup gets in through the wide gate', drove.boarded && drove.a1.off < 3.5 && drove.a2.off < 3.5, drove);
check('and the fence stops one anywhere else', drove.boarded && drove.x > -300, drove);
check('no console errors', errors.length === 0, errors.slice(0, 5));
await close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
