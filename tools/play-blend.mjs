// Gets through the crowd on US 80 by passing for one of them, on a phone-sized page with real taps: SHAMBLE, the stick pushed all the way and him going no quicker than they do,
// nobody coming for him while the act holds, how close each of them is to seeing through it over their heads, one right up against him seeing through it, running, a swing and a light
// each giving him away to everyone close, beans making it harder, someone with a grudge not taken in, and the C key on a laptop.
//
//   npm i && npm run blend [-- --shots dir]
import { mkdirSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); };
const tap = async (id) => { await page.tap(id); await g(() => __game.sim(1 / 30, 1 / 30)); };

await g(() => {
  const G = __game; G.pause(); G.jump('town'); G.S.flags.town = true; G.S.flags.ended = G.S.flags.arrived = true; G.step(.1);
  document.getElementById('card').style.display = 'none';
  G.bringOutCrowd();
  window.G = G; window.H = G.horde; window.T = 1 / 30; window.P = () => G.player.pos;
  // 80 m of US 80 west of town, running east from t = 0
  const a0 = G.map.sOn('us_80', ...G.map.fromTrue(-600, -20)), a1 = a0 + Math.sign(G.map.sOn('us_80', ...G.map.fromTrue(-500, -21)) - a0) * 80;
  window.us80 = (t) => G.map.along('us_80', a0 + (a1 - a0) * t);
  window.tOf = (x, z) => (G.map.sOn('us_80', x, z) - a0) / (a1 - a0);
  window.land = () => { G.S.mode = 'town'; G.HP.kind = 'run'; G.player.vy = 0; G.player.grounded = true; G.player.inv = 0; G.player.kb.set(0, 0); G.S.hp = 3; document.getElementById('fail').hidden = true; };
  // n of them either side of the road, 3 to 6 m off its middle, and everyone else a long way off. They're all ones who've burnt down and come for him on sight,
  // which is who shambling's for. The ones who've gone quiet wouldn't look twice at him anyway: npm run quiet has them.
  window.crowdOnRoad = (n = 30) => {
    H.calm(); G.S.beans = 0;
    const { all } = H, far = us80(0);
    all.forEach((s, i) => {
      let x, z;
      if (i < n) { const p = us80((i + .5) / n), side = i % 2 ? 1 : -1, off = 3 + (i % 3) * 1.5; x = p.x + p.nx * side * off; z = p.z + p.nz * side * off; }
      else { x = far.x + (i % 2 ? 1 : -1) * (900 + i); z = far.z + 500 + i; }
      Object.assign(s, { x, z, tx: x, tz: z, homeX: x, homeZ: z, y: G.floorAt(x, z), state: 0, alert: 0, sus: 0, timer: 2, lead: null }, i < n ? { quiet: false, far: undefined } : {});
    });
    return all.slice(0, n);
  };
  // the way a player would go: along the road, and away from anyone within a few metres of him
  window.cross = (seconds) => {
    const out = { grabbed: false, maxSus: 0, end: 0 };
    for (let i = 0; i < seconds * 5 && tOf(P().x, P().z) < 1.04; i++) {
      const here = tOf(P().x, P().z), p = us80(here), q = us80(here + .06);
      let dx = q.x - P().x + (p.x - P().x) * .3, dz = q.z - P().z + (p.z - P().z) * .3; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      for (const s of H.active) { const ax = P().x - s.x, az = P().z - s.z, d = Math.hypot(ax, az); if (d < 6 && d > .01) { dx += ax / d * (6 - d) / 2.5; dz += az / d * (6 - d) / 2.5; } }
      G.look(Math.atan2(-dx, -dz), .3); G.stick(0, 1); G.sim(.2, T);
      for (const s of H.active) out.maxSus = Math.max(out.maxSus, s.sus ?? 0);
      if (H.grab) { out.grabbed = true; break; }
    }
    G.stick(0, 0); out.end = tOf(P().x, P().z);
    out.hunting = H.active.filter((s) => s.state >= 2 && s.state <= 4).length;
    return out;
  };
  window.meters = () => [...document.querySelectorAll('.sus')].filter((e) => !e.hidden).length;
  window.toastSays = () => document.getElementById('toast').textContent;
});

// ---- the button
const btn = await g(() => { crowdOnRoad(); land(); const p = us80(-.1); G.place(p.x, p.z); G.step(.1); const b = document.getElementById('bH'); return { shown: !b.hidden && getComputedStyle(b).display !== 'none', words: b.textContent, on: G.shambling() }; });
check('in town a phone has a SHAMBLE button', btn.shown && btn.words === 'SHAMBLE' && !btn.on, btn);
await tap('#bH');
const pressed = await g(() => { G.step(.05); return { on: G.shambling(), held: document.getElementById('bH').classList.contains('held'), says: toastSays() }; });
check('a tap and he\'s shambling, and it says what gives him away', pressed.on && pressed.held && /run, fight or step into a light/.test(pressed.says), pressed);
const pace = await g(() => { const p = us80(-.1), q = us80(0); G.look(Math.atan2(-(q.x - p.x), -(q.z - p.z)), .3); G.stick(0, 1); G.sim(.5, T); const a = { x: P().x, z: P().z }; G.sim(2, T); G.stick(0, 0); return Math.hypot(P().x - a.x, P().z - a.z) / 2; });
check(`with the stick all the way over he goes no quicker than they do: ${pace.toFixed(2)} m/s`, pace > 1.1 && pace < 1.4, pace);

// ---- through the crowd
// four seconds at a time, drawing in between to see the meters, and a picture the first time there are any
const through = { grabbed: false, maxSus: 0, end: 0, hunting: 0, shown: 0 };
await g(() => { const p = us80(-.06); G.place(p.x, p.z); });
for (let i = 0; i < 30 && through.end < 1.04 && !through.grabbed; i++) {
  const r = await g(() => { const c = cross(4); G.step(.05, 1 / 24); return { ...c, shown: meters() }; });
  if (r.shown && !through.shown) await snap('1-among-them');
  Object.assign(through, { grabbed: r.grabbed, end: r.end, hunting: r.hunting, maxSus: Math.max(through.maxSus, r.maxSus), shown: Math.max(through.shown, r.shown) });
}
console.log(`     the closest anyone came to seeing through it: ${Math.round(through.maxSus * 100)}%, with up to ${through.shown} meters showing at once`);
check('he gets the whole way through 30 of them on foot, keeping the act up, and nobody comes for him', !through.grabbed && through.end > 1 && through.hunting === 0 && (await g(() => G.shambling())), through);
check('and how close each of them is to seeing through it is over their heads', through.shown >= 1 && through.maxSus > .1, through);

// ---- right up against one
const close1 = await g(() => {
  // he keeps right beside one of them, wherever they wander
  const lot = crowdOnRoad(30), s = lot[14];
  land(); G.place(s.x + 1, s.z); G.stick(0, 0); if (!G.shambling()) { G.key('c', true); G.sim(T, T); G.key('c', false); }
  // and nobody gets hold of him while it's looked at, since being grabbed ends the act anyway
  let t = 0; while (s.state < 2 && t < 15) { G.place(s.x + 1, s.z); G.player.inv = .85; G.sim(.1, T); t += .1; }
  G.player.inv = .85; G.step(.05);
  const others = lot.filter((o) => o !== s && o.state >= 2 && o.state <= 4).length;
  return { t, state: s.state, others, says: toastSays(), on: G.shambling() };
});
await snap('2-seen-through');
check(`stood right up against one, they see through it in ${close1.t.toFixed(1)} s, and it says so`, close1.state >= 2 && close1.t > 2 && close1.t < 10 && /sees through it/.test(close1.says), close1);
check('but only them, and the act holds for everyone else', close1.others === 0 && close1.on, close1);

// ---- giving himself away
// whoever's within 14 m of him, which is everyone it gives him away to
const ring = () => g(() => { const lot = crowdOnRoad(30), s = lot[14]; land(); G.place(s.x, s.z + 1.5); for (const o of lot) o.sus = 0; if (!G.shambling()) { G.key('c', true); G.sim(T, T); G.key('c', false); } G.sim(.3, T); window.near = lot.filter((o) => Math.hypot(o.x - P().x, o.z - P().z) < 14); return near.length; });
const said = () => g(() => toastSays());
// knocked flat counts, since they get up and come for him
const after = () => g(() => { G.player.inv = .85; G.sim(1.5, T); G.step(.05); return { on: G.shambling(), turned: near.filter((s) => s.state >= 2 && s.state <= 6).length, closer: near.filter((s) => Math.hypot(s.x - P().x, s.z - P().z) < 6).length }; });
let near = await ring();
// RUN stays held a moment after a tap, which is plenty with the stick pushed
await g(() => { G.stick(0, 1); });
await tap('#bR');
let says = await said();
await g(() => { G.stick(0, 0); });
const ran = await after();
check(`running gives him away: ${ran.turned} of the ${near} within 14 m turn on him at once, and it says so`, !ran.on && ran.turned === near && /gave you away/.test(says), { near, ran, says });
near = await ring();
await tap('#bA');
says = await said();
const swung = await after();
check(`and so does a swing, standing still: ${swung.turned} of ${near}, and ${swung.closer} of them are on him in a second and a half`, !swung.on && swung.turned === near && swung.closer >= Math.min(near, 3) && /gave you away/.test(says), { near, swung, says });
const lit = await g(() => {
  const spot = G.station.spot; crowdOnRoad(30); land(); G.place(spot.x + 30, spot.z); if (!G.shambling()) { G.key('c', true); G.sim(T, T); G.key('c', false); }
  const was = G.shambling(); G.place(spot.x + 2, spot.z); G.sim(.3, T);
  return { was, on: G.shambling(), lights: H.lights.includes(spot) };
});
check('and so does stepping into a light', lit.was && !lit.on && lit.lights, lit);

// ---- beans, and a grudge
const beans = await g(() => {
  const until = (n) => { const lot = crowdOnRoad(30), s = lot[14]; land(); G.S.beans = n; G.place(s.x + 1.5, s.z); if (!G.shambling()) { G.key('c', true); G.sim(T, T); G.key('c', false); } let t = 0; while (s.state < 2 && t < 20) { G.place(s.x + 1.5, s.z); G.sim(.1, T); t += .1; } G.S.beans = 0; return t; };
  return { none: until(0), full: until(12) };
});
check(`twelve cans of beans and they see through it far sooner: ${beans.full.toFixed(1)} s against ${beans.none.toFixed(1)} s`, beans.full < beans.none / 2, beans);
const grudge = await g(() => {
  // someone bold enough to come for him once he's hit them, and someone who isn't nosy
  const lot = crowdOnRoad(30), a = lot.find((s) => s.who.nerve > .7 && s.who.temper > .3 && s.who.temper < .7), b = lot.find((s) => s !== a && s.who.nosy < .5); land();
  G.folks.hurt(a.who, a.x, a.z, 'hit'); const mood = G.folks.mood(a.who);
  b.x = b.tx = a.x + 40; b.z = b.tz = a.z; a.sus = b.sus = 0;
  if (!G.shambling()) { G.key('c', true); G.sim(T, T); G.key('c', false); }
  // the one without first, since the one with a grudge ends it
  G.place(b.x + 2, b.z); G.sim(1.5, T); const sb = b.state, bSus = b.sus;
  G.place(a.x + 2, a.z); G.sim(1.5, T);
  return { mood, a: a.state, b: sb, bSus };
});
check('someone with a grudge isn\'t taken in, and someone without is', grudge.a >= 2 && grudge.a <= 4 && grudge.b < 2 && grudge.bSus > 0, grudge);
check('no console errors', errors.length === 0, errors.slice(0, 5));
await g(() => { G.folks.forget(); });
await close();

// ---- a laptop
const lap = await serveAndOpen({ viewport: { width: 1280, height: 720 } });
await lap.page.evaluate(() => { const G = __game; G.pause(); G.jump('town'); G.S.flags.town = true; G.S.flags.ended = G.S.flags.arrived = true; G.bringOutCrowd(); G.step(.1); document.getElementById('card').style.display = 'none'; });
const strip = () => lap.page.evaluate(() => { __game.step(.05); return document.getElementById('keyStrip').textContent; });
const before = await strip();
await lap.page.keyboard.press('KeyC');
const on = await lap.page.evaluate(() => { __game.sim(1 / 30, 1 / 30); return __game.shambling(); });
const during = await strip();
await lap.page.keyboard.press('KeyC');
const off = await lap.page.evaluate(() => { __game.sim(1 / 30, 1 / 30); return __game.shambling(); });
if (shots) await lap.page.screenshot({ path: `${shots}/3-laptop.jpg`, type: 'jpeg', quality: 82 });
check('on a laptop C starts it and stops it, and the strip says which', on && !off && /CShamble/.test(before) && /CStop shambling/.test(during), { before, during, on, off });
check('no console errors there either', lap.errors.length === 0, lap.errors.slice(0, 5));
await lap.close();

console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
