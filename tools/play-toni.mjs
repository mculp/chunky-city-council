// Goes to Toni's, at the burned house on Gallatin St, on a phone-sized page with the stick and real taps: that she's there, see-through and shimmering, catching
// frogs in the ditch and the tall grass with nobody living there and nothing parked, that she comes up to him when he comes by along Gallatin and shows him one
// with the camera over his shoulder so he can see her, a different one each time he comes by and the same she'd have shown him after a reload, that a swing and a
// pickup go through her, that she shows the gone quiet one too, and that once he's seen a frog they say so. Then, once he's seen all twelve, Gerald in his hand: no
// swinging, Coop's and Miss Bobby's lines about him, and letting him go in a ditch, and him gone for good after a reload. Last, the same again with reduced motion,
// when her rows hold still and her words don't fade in.
//
//   npm i && npm run toni [-- --shots dir]
import { mkdirSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };

const setUp = () => {
  const G = __game; G.pause(); G.jump('town'); G.S.flags.town = true; G.S.flags.ended = G.S.flags.arrived = true; G.step(.1);
  document.getElementById('card').style.display = 'none';
  window.G = G; window.Tn = G.toni; window.R = G.toni.road; window.T = 1 / 30; window.P = () => G.player.pos;
  window.land = () => { G.S.mode = 'town'; G.HP.kind = 'run'; G.player.vy = 0; G.player.grounded = true; G.player.inv = 0; G.player.kb.set(0, 0); G.S.hp = 3; G.revive(); document.getElementById('dialog').hidden = true; };
  // a point on Gallatin St, s along it from in front of the house and o out from its middle towards her side
  window.gal = (s, o = -1.2) => R.at(R.s0 + s, o);
  // with the stick, the way a player would: turn to it and push, and let go
  window.walkTo = ([tx, tz], seconds = 40) => {
    for (let i = 0; i < seconds * 10; i++) { const dx = tx - P().x, dz = tz - P().z, d = Math.hypot(dx, dz); if (d < .4) break; G.look(Math.atan2(-dx, -dz), .3); G.stick(0, Math.min(1, .35 + d)); G.sim(.1, T); }
    G.stick(0, 0); G.sim(.1, T);
    return Math.hypot(P().x - tx, P().z - tz);
  };
  // stood where he's put, the camera behind him, and nobody remembering him having been near her
  window.stand = ([x, z], [lx, lz]) => { land(); G.place(x, z); G.player.yaw = Math.atan2(lx - x, lz - z); G.look(G.player.yaw + Math.PI, .3); G.stick(0, 0); G.sim(T, T); };
  // until she's doing something, or so long's gone by, saying everything she said on the way
  window.until = (doing, seconds = 30) => { const said = []; for (let i = 0; i < seconds * 10 && Tn.state().doing !== doing; i++) { G.sim(.1, T); const w = Tn.says()?.text; if (w && said.at(-1) !== w) said.push(w); } return { doing: Tn.state().doing, said }; };
  // well away along Gallatin, then back to the house on foot
  window.comeBy = () => { stand(gal(95), gal(0)); G.sim(1, T); const walked = walkTo(gal(4)); return { walked, ...until('show') }; };
  // where she is on the screen, and him, as a part of its width and height
  window.onScreen = () => {
    const s = Tn.state(), v = new G.THREE.Vector3(s.x, s.y + .7, s.z).project(G.camera), h = G.heroRoot.position.clone().add(new G.THREE.Vector3(0, 1, 0)).project(G.camera);
    return { her: [+(v.x * .5 + .5).toFixed(3), +(.5 - v.y * .5).toFixed(3)], him: [+(h.x * .5 + .5).toFixed(3), +(.5 - h.y * .5).toFixed(3)], z: v.z };
  };
  window.button = (id) => { const e = document.getElementById(id); return e.style.visibility === 'hidden' || e.hidden ? null : e.getAttribute('aria-label'); };
  window.dialog = () => (document.getElementById('dialog').hidden ? null : document.getElementById('dSay').textContent);
};

let { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
let g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); };
const tap = async (id) => { await page.tap(id); await g(() => __game.sim(1 / 30, 1 / 30)); };
await g(setUp);

// ---- the place, and her in it
let r = await g(() => {
  const s = Tn.state(), H = s.home, away = Math.max(...s.spots.map(([x, z]) => Math.hypot(x - H.x, z - H.z)));
  const ditch = s.spots.filter(([x, z]) => Tn.inDitch(x, z)).length;
  return { away: +away.toFixed(1), ditch, spots: s.spots.length, home: G.homes.some((h) => h.id === 75037508), parked: G.vehicles.filter((v) => Math.hypot(v.x - H.x, v.z - H.z) < 30).length, roof: G.structures.find((t) => t.id === 75037508).roofColor, drive: G.map.roadById.get('drive_75037508')?.surface };
});
check('she catches frogs in the ditch along Gallatin and in the grass round the house, never far from it', r.away < 30 && r.ditch >= 4 && r.ditch < r.spots, r);
check('nobody lives at the burned house, nobody\'s parked there, its roof is brown and the drive in is gravel', !r.home && r.parked === 0 && r.roof === '#664a33' && r.drive === 'gravel', r);
r = await g(() => { stand(gal(6, -3), Tn.road.at(Tn.road.s0 - 30, 20)); G.sim(2, T); G.step(.05); return { drawn: Tn.state().drawn, astral: Tn.astral(), frog: Tn.state().inHand }; });
check('near the house she\'s drawn, all of her as a projection but the frog in her hand, which is solid', r.drawn && r.astral.all && r.astral.frogSolid && r.frog >= 0, r);

// ---- he comes by, and she comes up and shows him one
r = await g(() => comeBy());
const first = await g(() => ({ seen: [...Tn.state().mind.seen], says: Tn.says(), screen: onScreen(), cam: G.cam.toni }));
check('he walks along Gallatin to the house, and she comes up and asks him', r.walked < .6 && r.doing === 'show' && r.said[0] === 'Wanna see a frog?', r);
check('and shows him Gerald first, over her head', first.seen.join() === 'Gerald' && /^This is Gerald\./.test(first.says?.text), first);
r = await g(() => { G.sim(.8, T); G.step(.05); return { screen: onScreen(), cam: G.cam.toni }; });
check('stood still, the camera goes over his shoulder, and she\'s on the screen beside him and not behind him', r.cam > .99 && r.screen.z < 1 && r.screen.her.every((v) => v > .05 && v < .95) && Math.abs(r.screen.her[0] - r.screen.him[0]) > .12, r);
await snap('1-gerald');
r = await g(() => { const said = [Tn.says()?.text]; for (let i = 0; i < 120; i++) { G.sim(.1, T); const w = Tn.says()?.text; if (w && said.at(-1) !== w) said.push(w); } return said; });
check('then something about him, long enough to read each', r.length >= 2 && r[1] === 'You can pet him with one finger. One.', r);
r = await g(() => { G.stick(0, 1); G.sim(.6, T); const moving = G.cam.toni; G.stick(0, 0); return moving; });
check('and moving has the camera back', r < .5, r);

// ---- a new one each time he comes by, and the same after a reload
r = await g(() => { const a = comeBy(); return { ...a, seen: [...Tn.state().mind.seen] }; });
check('the next time he comes by it\'s a new one, Tuba', r.doing === 'show' && r.seen.join() === 'Gerald,Tuba' && r.said.some((l) => /^This is Tuba\./.test(l)), r);
r = await g(() => { stand(gal(4), gal(0)); G.sim(40, T); return { seen: Tn.state().mind.seen.length, doing: Tn.state().doing }; });
check('standing about by the house isn\'t coming by again', r.seen === 2, r);
await page.reload({ waitUntil: 'load', timeout: 120000 }); await page.waitForFunction(() => window.__game, null, { timeout: 60000 }); await g(setUp);
r = await g(() => { const before = [...Tn.state().mind.seen], a = comeBy(); return { before, ...a, seen: [...Tn.state().mind.seen] }; });
check('after a reload she remembers he\'s seen Gerald and Tuba, and shows him Princess', r.before.join() === 'Gerald,Tuba' && r.said.some((l) => /^This is Princess\./.test(l)), r);

// ---- nothing hurts her, and nothing stops on her
const before = await g(() => { G.sim(.1, T); const s = Tn.state(); return { doing: s.doing, at: [s.x, s.z], d: Math.hypot(s.x - P().x, s.z - P().z) }; });
await page.tap('#bA');
r = { before, ...(await g(([x0, z0]) => { G.sim(T, T); const swung = G.swinging(); G.sim(.8, T); const s = Tn.state(); return { swung, doing: s.doing, moved: Math.hypot(s.x - x0, s.z - z0) }; }, before.at)) };
check('a swing at her while she\'s showing him one goes through her, and she carries on showing him', r.before.doing === 'show' && r.before.d < 2 && r.swung && r.doing === 'show' && r.moved < .01, r);
r = await g(() => {
  // straight through where she's standing, with the stick, and nothing in the way
  const s = Tn.state(), dx = s.x - P().x, dz = s.z - P().z, d = Math.hypot(dx, dz), past = [s.x + dx / d * 2.5, s.z + dz / d * 2.5];
  return { blocked: G.blocked(s.x, s.z, G.floorAt(s.x, s.z) + 1), left: walkTo(past, 6) };
});
check('he walks straight through her, and nothing\'s in the way where she stands', !r.blocked && r.left < .6, r);
// the gone quiet: one stood near her, who she shows one, and they don't react
r = await g(() => {
  G.bringOutCrowd(); const H = G.horde, q = H.all.find((s) => s.quiet === true);
  const [x, z] = Tn.road.at(Tn.road.s0 - 8, 9);
  Object.assign(q, { x, z, tx: x, tz: z, homeX: x, homeZ: z, y: G.floorAt(x, z), state: 1, timer: 200, alert: 0, sus: 0, flat: 0, started: false });
  stand(gal(2, -2), [x, z]); Tn.night();
  const said = [];
  for (let i = 0; i < 400; i++) { G.sim(.1, T); q.state = 1; q.timer = 200; q.tx = x; q.tz = z; const w = Tn.says()?.text; if (w && said.at(-1) !== w) said.push(w); if (said.includes('He liked it. He just doesn\'t show it.')) break; }
  return { said, who: Tn.state().who, state: q.state };
});
check('she shows one of the gone quiet one too, and is fine about it', r.said.includes('Wanna see a frog?') && r.said.includes('He liked it. He just doesn\'t show it.'), r);
r = await g(() => {
  const H = G.horde, near = H.all.filter((s) => s.quiet === true).slice(0, 6), [x, z] = gal(0, -2);
  near.forEach((s, i) => Object.assign(s, { x: x + (i - 2.5) * 1.6, z: z - 3.2, tx: x + (i - 2.5) * 1.6, tz: z - 3.2, homeX: x, homeZ: z, y: G.floorAt(x, z), state: 0, alert: 0, sus: 0, flat: 0, mutterNext: 0 }));
  stand(gal(0, -1), [x, z - 3.2]); const heard = new Set();
  for (let i = 0; i < 240; i++) { near.forEach((s) => Object.assign(s, { state: 1, timer: 60, tx: s.x, tz: s.z })); G.sim(.4, T); G.step(1 / 60, 1 / 60); for (const m of G.mutters()) heard.add(m.says); if ([...heard].some((w) => w.startsWith('Did she show you'))) break; }
  return [...heard];
});
check('once he\'s seen one, the gone quiet near Gallatin ask him if she showed him one he has', r.some((w) => /^Did she show you (Gerald|Tuba|Princess)\?$/.test(w)), r);
await snap('2-quiet');

// ---- all twelve, and Gerald in his hand
r = await g(() => {
  G.horde.all.forEach((s, i) => Object.assign(s, { x: P().x + 900 + i, z: P().z + 900, tx: P().x + 900 + i, tz: P().z + 900, homeX: P().x + 900 + i, homeZ: P().z + 900 }));
  localStorage.setItem('chunky.toni', JSON.stringify({ seen: Tn.FROGS.slice(0, 11).map((f) => f.name), gave: false, holding: false }));
  return true;
});
await page.reload({ waitUntil: 'load', timeout: 120000 }); await page.waitForFunction(() => window.__game, null, { timeout: 60000 }); await g(setUp);
r = await g(() => { const a = comeBy(); const b = until('stand', 30); return { a, b, gerald: Tn.gerald(), seen: Tn.state().mind.seen.length, items: G.S.items.gerald }; });
check('after the last of the twelve she gives him Gerald: "Take Gerald. He knows now."', r.a.said.some((l) => /^This is Dumpling\./.test(l)) && r.b.said.includes('Take Gerald. He knows now.') && r.gerald.held && r.items === 1 && r.seen === 12, r);
r = await g(() => { land(); G.place(...gal(-30, -1)); G.stick(0, 0); G.sim(.5, T); G.step(.1); return { ...Tn.gerald(), a: button('bA') }; });
check('Gerald\'s in his hand, the way she holds them, and there\'s no SWING with his hand full', r.held && r.drawn && r.a === null, r);
await snap('3-gerald-in-hand');
r = await g(() => { const before = G.swinging(); return before; });
await tap('#bA').catch(() => {});
r = await g(() => { G.sim(.2, T); return { swinging: G.swinging(), keys: [...document.querySelectorAll('#keyStrip .ks')].map((e) => e.textContent) }; });
check('and a tap where the button was doesn\'t swing', !r.swinging, r);

// ---- shown to Coop and Miss Bobby, then let go in a ditch
for (const [who, line] of [['coop', 'That one of Toni\'s? Keep him off my counter. Last one got in the jerky.'], ['bobby', 'She gave you Gerald? Baby, she doesn\'t give Gerald to anybody.']]) {
  r = await g((who) => { const n = G.npcs[who]; land(); G.place(n.x + 1.6, n.z); G.player.yaw = Math.atan2(n.x - P().x, n.z - P().z); G.sim(.2, T); G.step(.05); return { a: button('bA'), act: G.S.act }; }, who);
  const shown = r;
  await tap('#bA');
  r = await g(() => { G.sim(.3, T); const say = dialog(); land(); return say; });
  check(`near ${who === 'coop' ? 'Coop' : 'Miss Bobby'} the button says SHOW, and showing him gets "${line}"`, shown.a === 'SHOW' && r === line, { shown, said: r });
}
r = await g(() => { const n = G.npcs.coop; land(); G.place(n.x + 1.6, n.z); G.sim(.2, T); G.step(.05); return button('bA'); });
check('and once they\'ve seen him, it\'s just TALK again', r === 'TALK', r);
r = await g(() => {
  // the ditch: past the shoulder of Gallatin, on her side, away from the drive
  const [x, z] = Tn.road.at(Tn.road.s0 + 12); land(); G.place(...gal(12, -1)); G.sim(.1, T);
  const d = walkTo([x, z], 15); G.sim(.2, T); G.step(.05);
  return { d, a: button('bA'), act: G.S.act, ditch: Tn.inDitch(P().x, P().z) };
});
check('in the ditch the button says LET GO', r.a === 'LET GO' && r.ditch, r);
await tap('#bA');
r = await g(() => { const at = []; for (let i = 0; i < 12; i++) { G.sim(.1, T); at.push(Tn.gerald().free); } G.step(.05); return { ...Tn.gerald(), hopped: at.some(Boolean), a: button('bA') }; });
check('and he\'s let go, hops off into the ditch, and his hand\'s free to swing again', !r.held && !r.drawn && r.hopped && r.a === 'SWING', r);
await page.reload({ waitUntil: 'load', timeout: 120000 }); await page.waitForFunction(() => window.__game, null, { timeout: 60000 }); await g(setUp);
r = await g(() => { const a = comeBy(); const b = until('stand', 30); return { said: [...a.said, ...b.said], gerald: Tn.gerald(), gave: Tn.state().mind.gave }; });
check('after a reload Gerald\'s gone for good: she shows him another, and never gives him again', !r.gerald.held && r.gave && !r.said.includes('Take Gerald. He knows now.') && !r.said.some((l) => /^This is Gerald\./.test(l)), r);
console.log('errors', JSON.stringify(errors.slice(0, 5)));
check('nothing went wrong in the console', !errors.length, errors.slice(0, 5));
await close();

// ---- reduced motion: her rows hold still, and her words are just there
({ page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }));
g = (fn, arg) => page.evaluate(fn, arg);
await g(setUp);
for (const [name, still] of [['reduced', true]]) {
  r = await g(() => { const a = comeBy(); G.sim(.2, T); G.step(1 / 60, 1 / 60); return { ...a, says: Tn.says() }; });
  check('with reduced motion she still comes and shows him a frog, and her words are there at once', r.doing === 'show' && r.says?.shown && r.says.opacity === 1, r);
}
const rows = async () => {
  const box = await g(() => { G.sim(.8, T); G.step(.02); const s = Tn.state(), v = new G.THREE.Vector3(s.x, s.y + .5, s.z).project(G.camera); return { x: (v.x * .5 + .5) * innerWidth, y: (.5 - v.y * .5) * innerHeight }; });
  const clip = { x: Math.max(0, box.x - 30), y: Math.max(0, box.y - 50), width: 60, height: 100 };
  const shot = async (step) => { await g((step) => { Tn.rows(step); G.render(0); }, step); return page.screenshot({ clip }); };
  const a = await shot(0), again = await shot(0), b = await shot(2);
  return { same: a.equals(b), steady: a.equals(again), clip };
};
r = await rows();
check('and her rows hold still from one frame to the next', r.steady && r.same, r);
await close();
({ page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } }));
g = (fn, arg) => page.evaluate(fn, arg);
await g(setUp);
await g(() => comeBy());
r = await rows();
check('where without it they climb her', r.steady && !r.same, r);
await close();
process.exit(failed ? 1 : 0);
