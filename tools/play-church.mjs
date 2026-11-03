// Goes round the church on Church St on a phone-sized page with the stick and real taps: in off the street through its front door, past Miss Odessa, with the roof and the steeple
// out of the way while he's inside, up the aisle, across the pews and not getting anywhere, through the door in the wing's wall to the pantry and what's on its shelf. Then her steps,
// swept for three in Chapter 1 however bare the shelf, and once a day after it, paid for out of the shelf, over a week of days, and still the same after a reload. Then the bell: the rope
// inside the door, a tap, the crowd coming to it from all over and into the church while it rings, out again after, and on a laptop the E key. Last, the steeple coming down with
// the church, and with it the bell.
//
//   npm i && npm run church [-- --shots dir]
import { mkdirSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); };
const tap = async (sel) => { await page.tap(sel); await g(() => __game.sim(1 / 30, 1 / 30)); };
const DAY = 864e5, NOW = Date.UTC(2026, 10, 1, 18);

const setUp = () => g(() => {
  const G = __game; G.pause(); G.jump('town'); G.S.flags.town = G.S.flags.arrived = true; G.step(.1);
  document.getElementById('card').style.display = 'none';
  window.G = G; window.C = G.church; window.T = 1 / 30; window.P = () => G.player.pos;
  window.land = () => { G.S.mode = 'town'; G.HP.kind = 'run'; G.player.vy = 0; G.player.grounded = true; G.player.inv = 0; G.player.kb.set(0, 0); G.S.hp = 3; document.getElementById('fail').hidden = true; document.getElementById('dialog').hidden = true; };
  // the church's own axes: u along its north wall, v down the nave, from its middle
  const [ox, oz] = C.at(0, 0), [ux, uz] = C.at(1, 0), [vx, vz] = C.at(0, 1);
  window.uv = () => { const dx = P().x - ox, dz = P().z - oz; return [dx * (ux - ox) + dz * (uz - oz), dx * (vx - ox) + dz * (vz - oz)]; };
  // with the stick, the way a player would: turn to it and push
  window.walkTo = (u, v, seconds = 10) => {
    const [tx, tz] = C.at(u, v);
    for (let i = 0; i < seconds * 10; i++) { const dx = tx - P().x, dz = tz - P().z, d = Math.hypot(dx, dz); if (d < .3) break; G.look(Math.atan2(-dx, -dz), .3); G.stick(0, Math.min(1, .35 + d)); G.sim(.1, T); }
    G.stick(0, 0); G.sim(.2, T);
    return Math.hypot(P().x - tx, P().z - tz);
  };
  window.inside = () => G.houseAt(P().x, P().z) === C.house;
  window.toastSays = () => document.getElementById('toast').textContent;
  window.prompted = () => (document.getElementById('prompt').hidden ? '' : document.getElementById('prompt').textContent);
  window.dialog = () => (document.getElementById('dialog').hidden ? null : { say: document.getElementById('dSay').textContent, opts: [...document.getElementById('dOpts').children].map((b) => b.textContent) });
  window.byOdessa = () => { land(); const o = G.npcs.odessa; G.place(o.x, o.z + 1.5); G.step(.1); };
});
await setUp();

// ---- in off the street
let r = await g(() => {
  const d = C.door(), [fx, fz] = C.at(-4.67, 18.47), o = G.npcs.odessa;
  return { edge: d.edge, off: Math.hypot(d.x - fx, d.z - fz), faces: d.nz, odessa: Math.abs((o.x - d.x) * d.ex + (o.z - d.z) * d.ez) };
});
check('its door is in the front gable, under the porch, where her steps are', r.edge === 0 && r.off < .3 && r.faces > .99, r);
check('and she stands to one side of it', r.odessa > 1.8, r);
r = await g(() => { land(); G.place(...C.at(-4.67, 30)); G.step(.1); const out = { street: walkTo(-4.67, 21.5), shown: C.steepleShown() }; out.door = walkTo(-4.67, 15); out.inside = inside(); G.step(.1); out.roof = G.G.uHideRoof.value.x === C.house.index; out.steeple = C.steepleShown(); return out; });
check('he walks up off Church St and in through the door', r.street < .5 && r.door < .5 && r.inside, r);
check('inside, the roof and the steeple are out of the way', r.roof && !r.steeple && r.shown, r);
await snap('1-in-the-door');
r = await g(() => { const out = { aisle: walkTo(-4.67, -13.6) }; out.at = uv(); return out; });
check('and he goes up the aisle to the front', r.aisle < .5, r);
r = await g(() => { walkTo(-4.67, 8.4); const from = uv(); walkTo(-9, 8.4, 3); const to = uv(); return { from, to }; });
check('but the pews stop him going across them', r.to[0] > -6.2, r);
r = await g(() => { walkTo(-4.67, 1.6); const door = walkTo(3, 1.4); const shelf = walkTo(6.7, -2.6); return { door, shelf, inside: inside(), shown: C.shown(), stock: C.pantry.stock(C.today()) }; });
check('the aisle across takes him through the door in the wing\'s wall to the pantry', r.door < .5 && r.shelf < .5 && r.inside, r);
check(`and what's on its shelf is what the pantry has: ${r.shown} cans`, r.shown === 9 && r.stock === 9, r);
await g(() => { G.look(Math.atan2(-(C.at(6.7, -4)[0] - P().x), -(C.at(6.7, -4)[1] - P().z)), .45); G.step(.2); });
await snap('2-the-pantry');
r = await g(() => { walkTo(3, 1.4); walkTo(-4.67, 1.6); walkTo(-4.67, 15); walkTo(-4.67, 24); G.step(.1); return { inside: inside(), steeple: C.steepleShown(), roof: G.G.uHideRoof.value.x === C.house.index }; });
check('and out again, the steeple and the roof are back', !r.inside && r.steeple && !r.roof, r);

// ---- her steps in Chapter 1
r = await g(() => { G.S.flags.ended = false; G.S.flags.swept = false; G.S.beans = 0; byOdessa(); return null; });
await tap('#bA');
r = await g(() => dialog());
check('in Chapter 1 she\'ll have the steps swept', r && r.opts.includes('Can I get some beans?'), r);
await page.locator('#dOpts button', { hasText: 'Can I get some beans?' }).tap(); await g(() => G.sim(.05, T));
await page.locator('#dOpts button', { hasText: 'Sweep the steps.' }).tap(); await g(() => G.sim(.05, T));
r = await g(() => { G.key('e', true); G.sim(3.5, T); G.key('e', false); G.sim(.1, T); return { beans: G.S.beans, swept: G.S.flags.swept, shown: C.shown(), toast: toastSays(), d: dialog() }; });
check('swept for three, and three come off the shelf', r.beans === 3 && r.swept && r.shown === 6 && /\+3 beans · Odessa/.test(r.toast), r);
check('and then she has her say', r.d && /lantern man/.test(r.d.say) && !r.d.opts.includes('Can I get some beans?'), r.d);
await snap('3-swept');
r = await g(() => { land(); C.pantry.sweep(C.today(), 9); G.S.flags.swept = false; G.S.beans = 0; byOdessa(); return C.shown(); });
await tap('#bA');
await page.locator('#dOpts button', { hasText: 'Can I get some beans?' }).tap(); await g(() => G.sim(.05, T));
await page.locator('#dOpts button', { hasText: 'Sweep the steps.' }).tap(); await g(() => G.sim(.05, T));
r = await g(() => { G.key('e', true); G.sim(3.5, T); G.key('e', false); G.sim(.1, T); return { beans: G.S.beans, shown: C.shown() }; });
check('with the shelf bare, a run of Chapter 1 still gets its three, or it couldn\'t get to twelve', r.beans === 3 && r.shown === 0, r);

// ---- after it, once a day
const sweepToday = async () => {
  await g(() => byOdessa()); await tap('#bA');
  const d = await g(() => dialog());
  if (!d?.opts.includes('Can I get some beans?')) { await g(() => land()); return { asked: false, d }; }
  await page.locator('#dOpts button', { hasText: 'Can I get some beans?' }).tap(); await g(() => G.sim(.05, T));
  await page.locator('#dOpts button', { hasText: 'Sweep the steps.' }).tap(); await g(() => G.sim(.05, T));
  return g(() => { const b = G.S.beans; G.key('e', true); G.sim(3.5, T); G.key('e', false); G.sim(.1, T); const out = { asked: true, paid: G.S.beans - b, shown: C.shown() }; land(); return out; });
};
await g(() => { land(); G.S.flags.ended = true; });
r = await sweepToday();
check('once Chapter 1\'s done, the steps swept today stay swept', !r.asked && /lantern man/.test(r.d?.say), r);
const week = [];
for (let d = 1; d <= 7; d++) { await g((ms) => { G.churchSigns.clock(ms); G.step(.1); }, NOW + d * DAY); week.push(await sweepToday()); }
console.log(`     a week of sweeping: ${week.map((w) => (w.asked ? `+${w.paid}` : '-')).join(' ')}, on the shelf after: ${week.map((w) => w.shown).join(' ')}`);
check('the next day they want sweeping again, and she pays what\'s come in', week.every((w) => w.asked) && week[0].paid === 2 && week.every((w) => w.paid === 2 && w.shown === 0), week);
// the shelf's looked at again every ten seconds, with the signs
await g((ms) => { G.churchSigns.clock(ms); G.step(10.5); }, NOW + 12 * DAY);
r = await g(() => C.shown());
check('left a few days, the shelf fills back up, and no further than it holds', r === 9, r);
r = await sweepToday();
check('and she pays the three again, from it', r.asked && r.paid === 3 && r.shown === 6, r);

// ---- a reload
await page.reload(); await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await g((ms) => { __game.churchSigns.clock(ms); }, NOW + 12 * DAY);
await setUp();
r = await g(() => ({ shown: C.shown(), swept: C.pantry.sweptOn(C.today()) }));
check('after a reload, the shelf\'s as it was and the steps are still swept', r.shown === 6 && r.swept, r);
r = await g(() => { document.getElementById('forget').click(); return { shown: C.shown(), swept: C.pantry.sweptOn(C.today()) }; });
check('and Forget everyone fills it again', r.shown === 9 && !r.swept, r);

// ---- the bell
await page.keyboard.press('x');
await page.waitForFunction(() => __game.sound.state().ctx === 'running', null, { timeout: 5000 });
await page.waitForFunction(() => __game.sound.state().files.some((f) => /church\.bell/.test(f)), null, { timeout: 60000, polling: 250 });
r = await g(() => {
  // they only move within 150 m of him, so he's at the church first
  land(); G.S.flags.ended = true; G.place(...C.at(-4.67, 24)); G.step(.1); G.bringOutCrowd(); const H = G.horde; H.calm();
  // forty of them all round, from 40 to 110 m off, minding their own business
  const [cx, cz] = C.at(-4.4, 15.6);
  H.all.forEach((s, i) => { const a = i * 2.39996, d = i < 40 ? 40 + (i % 8) * 10 : 900 + i, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; Object.assign(s, { x, z, tx: x, tz: z, homeX: x, homeZ: z, y: G.floorAt(x, z), state: 0, alert: 0, timer: 2, lead: null }); });
  G.sim(.5, T);
  window.was = new Map(H.active.filter((s) => Math.hypot(s.x - cx, s.z - cz) < 120).map((s) => [s, Math.hypot(s.x - cx, s.z - cz)]));
  walkTo(-4.67, 15.5); walkTo(-3.65, 16.2); G.step(.1);
  return { prompt: prompted(), reach: C.bellInReach(), near: was.size };
});
check(`inside the door, by the rope, the button rings the bell: "${r.prompt}"`, /Ring the bell/.test(r.prompt) && r.reach, r);
await g(() => G.sound.forget());
await tap('#bA');
r = await g(() => { G.sim(.3, T); return { ringing: C.ringing(), toast: toastSays(), heard: !!G.sound.lastHeard('church.bell'), again: C.bellInReach(), prompt: prompted() }; });
check('a tap and it rings, and it says they\'ll come', r.ringing && r.heard && /bell's ringing/.test(r.toast), r);
check('and it can\'t be rung again while it\'s going', !r.again && !/Ring the bell/.test(r.prompt), r);
r = await g(() => {
  // he gets out of the way, down Church St, and they can't lay hands on him while it's measured
  walkTo(-4.67, 24); G.place(...C.at(-4.67, 45)); G.step(.1);
  const H = G.horde, [cx, cz] = C.at(-4.4, 15.6), out = { in: 0, closer: 0 };
  for (let t = 0; t < 19.5; t += .5) { G.player.inv = .85; G.sim(.5, T); out.in = Math.max(out.in, H.active.filter((s) => H.inSanctuary(s.x, s.z)).length); }
  out.tolls = C.strokes();
  for (const [s, d] of was) if (Math.hypot(s.x - cx, s.z - cz) < d - 20) out.closer++;
  out.stopped = !C.ringing();
  for (let t = 0; t < 30; t += .5) { G.player.inv = .85; G.sim(.5, T); }
  out.after = H.active.filter((s) => H.inSanctuary(s.x, s.z)).length;
  return out;
});
console.log(`     ${r.closer} of ${await g(() => was.size)} came closer, ${r.in} were round the church at once, ${r.tolls} strokes`);
check('it tolls every few seconds while it rings, and then stops', r.tolls >= 4 && r.stopped, r);
check('they come to it from all over, and into the church while it rings', r.closer >= 20 && r.in >= 3, r);
check('and once it\'s stopped they don\'t stay in it', r.after <= 1, r);
await g(() => { G.place(...C.at(-4.67, 34)); G.look(Math.atan2(-(C.at(-4.67, 18)[0] - P().x), -(C.at(-4.67, 18)[1] - P().z)), .15); G.step(.2); });
await snap('4-after-the-bell');

// ---- on a laptop
const laptop = await page.context().browser().newContext({ viewport: { width: 1280, height: 760 } });
const lp = await laptop.newPage(); const lpErrors = []; lp.on('pageerror', (e) => lpErrors.push(e.message));
await lp.goto(page.url(), { waitUntil: 'load', timeout: 120000 }); await lp.waitForFunction(() => window.__game, null, { timeout: 60000 });
r = await lp.evaluate(() => {
  const G = __game, C = G.church; G.pause(); G.jump('town'); G.S.flags.town = G.S.flags.arrived = true; G.step(.1); document.getElementById('card').style.display = 'none';
  G.place(...C.at(-3.65, 16.2)); G.step(.1);
  return document.getElementById('prompt').textContent;
});
await lp.keyboard.press('e'); await lp.evaluate(() => __game.sim(.2, 1 / 30));
const rung = await lp.evaluate(() => __game.church.ringing());
check(`on a laptop it says "${r}", and E rings it`, /E · Ring the bell/.test(r) && rung, { r, rung });
await laptop.close();

// ---- the steeple comes down with the church, and the bell with it
r = await g(() => {
  land(); const W = G.wreck;
  // along the walls, the way a few gas cans would go, until enough of it's gone
  for (let i = 0; i < 40 && !C.steeple.down; i++) { const [bx, bz] = C.at(i % 2 ? .9 : -10, -18 + (i >> 1) * 2.4); W.blast(bx, 7, bz, 7, 3); G.sim(.2, T); }
  G.sim(2, T); G.place(...C.at(-3.65, 16.2)); G.step(.1);
  return { down: C.steeple.down, gone: +W.damage.gone(C.house).toFixed(2), reach: C.bellInReach(), prompt: prompted() };
});
check(`blow enough of the church away and the steeple comes down, and there's no bell to ring (${r.gone} of it gone)`, r.down && !r.reach && !/Ring the bell/.test(r.prompt), r);
await snap('5-down');

check('no console errors', !errors.length && !lpErrors.length, [...errors, ...lpErrors]);
await close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
