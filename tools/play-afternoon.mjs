// Plays the owner's afternoon on a phone-sized page, with real taps, a real finger on the stick and on RUN, and the game's own movement: drives a pickup east along US 80, crashes it into a
// parked car in front of the Baptist church, gets out with a dozen cans of beans and stands in front of the church with a crowd about, and counts who comes for him, in what order and why.
// No more than three come at once, each one stops, turns to him and flares first and nothing on the screen says why, the quiet ones leave him be, and running for ten seconds loses all of them,
// who go home. Then beans, a train going by and a noise beside a row of houses, which draw nobody, and driving the county for ten minutes, with the number out at once staying level and anyone put
// back coming out again just as they were. What it costs is at the end, and it can't say whether any of it is fun.
//
//   npm i && npm run afternoon [-- --shots dir]
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
// a real finger on the stick, pushed all the way forward, and another on RUN, for as long as the page is stepped on
const cdp = await page.context().newCDPSession(page), touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
const centre = (sel) => g((s) => { const e = document.querySelector(s), r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, r: r.width / 2, hidden: e.hidden }; }, sel);
const fingers = async (run) => {
  const s = await centre('#stick'), r = await centre('#bR'), both = (up) => [{ x: s.x, y: s.y - (up ? s.r * .95 : 0), id: 1 }, ...(run ? [{ x: r.x, y: r.y, id: 2 }] : [])];
  await touch('touchStart', both(false)); await touch('touchMove', both(true));
  return { run: run && !r.hidden };
};
const lift = () => touch('touchEnd', []);
// the ones who've gone quiet only stir for a reason the ticket allows: he hit someone beside them, or they hold something against him already
const quietOk = (w) => w.stirs.every((q) => q.kind === 'hit' || q.mood !== 0);

const setup = () => {
  const G = __game; G.pause(); G.fillTown(); G.jump('town'); G.S.flags.town = true; G.S.flags.ended = G.S.flags.arrived = true; G.step(.1);
  document.getElementById('card').style.display = 'none';
  G.bringOutCrowd(); G.step(.1);
  window.G = G; window.H = G.horde; window.T = 1 / 30; window.P = () => G.player.pos;
  // the sign of the church that's beside US 80, and the road there, with s running east
  const sg = G.churchSigns.list.map((c) => { const s = G.map.sOn('us_80', c.x, c.z), q = G.map.along('us_80', s); return { c, s, d: Math.hypot(q.x - c.x, q.z - c.z) }; }).sort((a, b) => a.d - b.d)[0];
  window.SS = sg.s; window.SIGN = [sg.c.x, sg.c.z];
  window.road = (s, across = 0) => { const q = G.map.along('us_80', s); return [q.x + q.nx * across, q.z + q.nz * across, Math.atan2(q.tx, q.tz)]; };
  window.dist = (s) => Math.hypot(s.x - P().x, s.z - P().z);
  window.facing = (dx, dz) => G.look(Math.atan2(-dx, -dz), .3);
  window.after = (s) => s.state === 2 || s.state === 4 || (s.state === 8 && !s.rouse.over);
  // parked the way the game parks anything: got into, put there, and got out of, so that what's in the way is where it says it is
  window.park = (v, s, across) => { if (G.driving()) G.getOut(true); G.getIn(v); const [x, z, yaw] = road(s, across); Object.assign(v, { x, z, y: G.floorAt(x, z), yaw, f: 0, s: 0, steer: 0, grounded: true }); G.getOut(true); };
  // everybody else a long way off, nothing remembered, nothing noted, and nobody able to lay a hand on him while it's measured
  window.empty = () => {
    H.calm(); H.noises.length = 0; H.looks.length = 0; G.folks.forget(); G.roused.log.length = 0; G.traffic.on = false; G.traffic.clear();
    G.S.hp = 3; G.S.mode = 'town'; G.player.inv = 0; H.T.grabReach = 0; G.revive();
  };
  // Watching every step of the crowd's: who is after him at once, and for each one that comes for him, whether it stopped and turned to him first, how long that took, how much it flared
  // and what woke it, and whether anything on the screen said so. take() says what's been seen since the last time and starts again.
  const last = new WeakMap(), update = H.update, knock = H.knock;
  // and what the screen used to say. It's gone, and nothing is to say it in another place: every time one of them stops and turns to him, the next frame checks the screen for any of it.
  const WAS_SAID = /woke one up|smells your beans|caught one's eye|you hit (him|her)/i;
  let screenNext = false;
  const fresh = () => ({ t: 0, peak: 0, roused: [], looked: 0, hunters: new Set(), surprise: 0, delay: [], flare: 0, quietStirred: new Set(), stirs: [], knocks: [], said: [] });
  window.W = fresh();
  window.take = () => { const r = W; r.hunters = r.hunters.size; r.quietStirred = r.quietStirred.size; window.W = fresh(); return r; };
  H.knock = (x, z, r, seconds, by) => { const n = knock.call(H, x, z, r, seconds, by); if (n) W.knocks.push({ by, n, t: +W.t.toFixed(1) }); return n; };
  H.update = (dt, p) => {
    // a frame after one of them stopped and turned to him, with everything else the frame does done: is any of what the screen used to say on it
    if (screenNext) { screenNext = false; W.said.push(...window.screenText().filter((l) => WAS_SAID.test(l))); }
    update.call(H, dt, p); W.t += dt;
    let n = 0;
    for (const s of H.all) {
      const was = last.get(s) ?? { state: s.state, over: false, at: 0 }, over = s.state === 8 && !!s.rouse?.over;
      if (s.state === 8 && !over && (was.state !== 8 || was.over)) { was.at = W.t; was.kind = s.rouse.why.kind; W.roused.push(was.kind); screenNext = true; }
      if (s.state === 8 && over && was.state !== 8) W.looked++;
      if (s.state === 8 && !over) W.flare = Math.max(W.flare, G.glow(s));
      if (s.state === 2 && was.state !== 2) { W.hunters.add(s); if (was.state === 8 && !was.over) W.delay.push(+(W.t - was.at).toFixed(2)); else W.surprise++; }
      if (s.quiet && !s.who?.hurt && (s.state === 8 || s.state === 2 || s.gaze) && !W.quietStirred.has(s)) { W.quietStirred.add(s); W.stirs.push({ state: s.state, gaze: !!s.gaze, kind: s.rouse?.why?.kind, mood: G.folks.mood(s.who), flat: s.flat, d: +dist(s).toFixed(1), t: +W.t.toFixed(1) }); }
      if (after(s)) n++;
      was.state = s.state; was.over = over; last.set(s, was);
    }
    W.peak = Math.max(W.peak, n);
  };
};
await g(setup);

// ---- the crowd as the game deals it, and then a bad stretch of road, with this many of the ones near the church burnt down
const crowd = await g(() => {
  const around = H.all.filter((s) => !s.home && Math.hypot(s.x - SIGN[0], s.z - SIGN[1]) < 150);
  return { street: H.all.filter((s) => !s.home).length, homes: H.all.filter((s) => s.home).length, near: around.length, burnt: around.filter((s) => !s.quiet).length };
});
console.log(`     the game deals ${crowd.street} on the streets, ${crowd.near} of them within 150 m of the church and ${crowd.burnt} of those burnt down`);

// ---- the drive and the crash
const crash = await g(() => {
  empty();
  // the two dozen nearest the sign, in a row along the shoulders: twelve round where the car is parked and twelve round the sign, a third of them burnt down and the rest gone quiet
  const CS = SS - 60, pool = H.all.filter((s) => !s.home).sort((a, b) => Math.hypot(a.x - SIGN[0], a.z - SIGN[1]) - Math.hypot(b.x - SIGN[0], b.z - SIGN[1])).slice(0, 24);
  const far = road(SS - 2500);
  H.all.forEach((s, i) => { if (!pool.includes(s) && !s.home) { s.x = s.tx = s.homeX = far[0] + 700 + i; s.z = s.tz = s.homeZ = far[1] + 900; s.y = G.floorAt(s.x, s.z); s.quiet = true; } });
  pool.forEach((s, i) => {
    const near = i < 12, at = (near ? CS : SS) + ((i % 12) - 5.5) * 5.2, side = i % 2 ? 1 : -1, [x, z] = road(at, side * (7 + (i % 3) * 2));
    Object.assign(s, { x, z, tx: x, tz: z, homeX: x, homeZ: z, state: 0, alert: 0, timer: 99, rouse: null, gaze: null, lost: 0, quiet: i % 3 !== 0 });
    s.y = G.floorAt(x, z);
  });
  window.pool = pool;
  // the parked car in the eastbound lane, and a pickup 110 m back in the same lane, pointing at it
  const car = G.vehicles.find((v) => v.kind === 'car' && !v.ai && !v.wrecked), truck = G.vehicles.find((v) => v.kind === 'pickup' && !v.ai && !v.wrecked);
  park(car, CS, 1.9); park(truck, CS - 110, 1.9);
  window.car = car; window.truck = truck; window.CS = CS;
  G.S.beans = 12; G.step(.6, T);
  const [tx, tz] = [truck.x, truck.z]; G.place(tx + 2, tz); G.step(.6, T); take();
  return { burnt: pool.filter((s) => !s.quiet).length, quiet: pool.filter((s) => s.quiet).length, prompt: document.getElementById('bA').textContent.replace(/\s/g, '') };
});
check(`a bad stretch of US 80: ${crash.burnt} of the two dozen near the church have burnt down and ${crash.quiet} have gone quiet, and he has a dozen cans, with the big button saying ${crash.prompt}`, crash.burnt === 8 && crash.prompt === 'GETIN', crash);
await tap('#bA');
const seat = await g(() => ({ driving: !!G.driving(), kind: G.driving()?.kind, mode: G.S.mode, button: document.getElementById('bA').textContent.replace(/\s/g, '') }));
check('a tap and he is in the pickup', seat.driving && seat.kind === 'pickup' && seat.button === 'GETOUT', seat);
await snap('1-in-the-truck');
// foot down to about 14 m/s, steering for the car with the stick, until it hits the car
const drove = await g(() => {
  const d = G.driving(), out = { t: 0, speed: 0, noises: [] };
  for (let t = 0; t < 14; t += T) {
    const dx = car.x - d.x, dz = car.z - d.z; let dy = Math.atan2(dx, dz) - d.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    G.stick(Math.max(-1, Math.min(1, -dy * 4)), d.f < 14 ? 1 : 0); G.look(d.yaw + Math.PI, .3);
    G.step(T, T); out.t = t; out.speed = Math.max(out.speed, d.f);
    for (const e of H.noises) if (!out.noises.some((n) => n.kind === e.kind && n.r === e.r)) out.noises.push({ kind: e.kind, r: e.r });
    if (Math.hypot(car.x - d.x, car.z - d.z) < 6.2 && d.f < 4) break;
  }
  G.stick(0, 0); G.sim(.3, T);
  return { ...out, w: take(), far: +Math.hypot(car.x - d.x, car.z - d.z).toFixed(1), driving: !!G.driving() };
});
console.log(`     driving: ${drove.t.toFixed(1)} s at up to ${drove.speed.toFixed(0)} m/s; woke ${drove.w.roused.length} (${drove.w.roused.join(', ')}), ${drove.w.looked} looked up, ${drove.w.hunters} came, ${drove.w.peak} at most at once; noises ${JSON.stringify(drove.noises)}`);
check('he drives into the parked car', drove.far < 6.5 && drove.noises.some((n) => n.kind === 'alarm' || n.kind === 'crash'), drove);
check('no more than three come for him, and each of them stopped and turned to him first, and nothing on the screen said why', drove.w.peak <= 3 && drove.w.hunters >= 1 && drove.w.surprise === 0 && drove.w.roused.length >= drove.w.hunters && drove.w.said.length === 0, drove.w);
check('each flares, for about a second', drove.w.flare > 1.4 && drove.w.delay.every((d) => d > .9 && d < 1.4), drove.w);
check(`and none of the ones who have gone quiet stirs, except ${drove.w.quietStirred} next to someone he ran down (${drove.w.knocks.length} knocked over)`, quietOk(drove.w) && (drove.w.quietStirred === 0 || drove.w.knocks.length > 0), drove.w);
await snap('2-the-crash');

// ---- out with a dozen cans, and in front of the church for a quarter of a minute, with whoever was woken by the engine and the crash coming for him, and whoever else hears him
await tap('#bA');
const out = await g(() => ({ driving: !!G.driving(), mode: G.S.mode, beans: G.S.beans, truck: truck.wrecked ? 'wrecked' : 'running', button: document.getElementById('bA').textContent.replace(/\s/g, '') }));
check('a tap and he is out of the truck, with his twelve cans', !out.driving && out.mode === 'town' && out.beans === 12, out);
const front = await g(() => {
  take();
  const goal = [SIGN[0], SIGN[1] + 2.5], out = {};
  let t = 0; while (t < 40 && Math.hypot(goal[0] - P().x, goal[1] - P().z) > 1) { facing(goal[0] - P().x, goal[1] - P().z); G.stick(0, 1); G.step(T, T); t += T; }
  G.stick(0, 0); out.walked = +t.toFixed(1); out.at = +Math.hypot(goal[0] - P().x, goal[1] - P().z).toFixed(1);
  G.look(Math.atan2(-(SIGN[0] - P().x), -(SIGN[1] - P().z)), .3);
  const arrive = take();
  for (let i = 0; i < 15 / T; i++) G.sim(T, T);
  const stood = take();
  return { ...out, arrive, stood, after: H.all.filter(after).length, burntNear: pool.filter((s) => !s.quiet && dist(s) < 40).length };
});
console.log(`     walked to the sign in ${front.walked} s, and stood in front of it for 15 s: ${front.arrive.roused.length} woken on the way (${front.arrive.roused.join(', ')}), ${front.stood.roused.length} more standing there (${front.stood.roused.join(', ')}), ${front.stood.looked} looked up, ${front.after} after him now`);
check('he gets there', front.at < 1.5, front);
check('still no more than three after him, however many have burnt down round here, and every one of them stopped and turned to him first, with nothing on the screen to say why', Math.max(front.arrive.peak, front.stood.peak) <= 3 && front.arrive.surprise === 0 && front.stood.surprise === 0 && front.arrive.said.length === 0 && front.stood.said.length === 0, front);
check('and nobody who has gone quiet stirs without a reason: the ones next to the two he ran down, and the ones with a grudge already', quietOk(front.arrive) && quietOk(front.stood), front);
await snap('3-at-the-church');

// ---- running for ten seconds, with a real finger on the stick and another on RUN
const before = await g(() => {
  // the wreck is burning, and a light draws the ones who wander, which has nothing to do with what is measured here
  H.lights.length = 0;
  const chasing = H.all.filter(after); window.chasing = chasing;
  const cx = chasing.reduce((n, s) => n + s.x, 0) / (chasing.length || 1);
  window.awayTo = P().x > cx ? road(SS + 400) : road(SS - 400);
  take();
  return { n: chasing.length, from: chasing.map((s) => +dist(s).toFixed(1)), states: chasing.map((s) => s.state), run: document.getElementById('bR').hidden ? 'no RUN button' : 'RUN' };
});
console.log(`     ${before.n} after him, ${before.from.join(', ')} m off, when he starts to run`);
check('there are some after him to lose', before.n >= 1, before);
const held = await fingers(true);
const ran = await g(() => {
  const start = [P().x, P().z], gave = new Map();
  for (let t = 0; t < 10; t += T) {
    facing(awayTo[0] - P().x, awayTo[1] - P().z); G.sim(T, T);
    for (const s of chasing) if (!gave.has(s) && !after(s) && s.homeward) gave.set(s, +(t + T).toFixed(1));
  }
  const gap = chasing.map((s) => +dist(s).toFixed(1));
  return { speed: +(Math.hypot(P().x - start[0], P().z - start[1]) / 10).toFixed(1), gave: chasing.map((s) => gave.get(s) ?? null), gap, left: chasing.filter(after).length, running: G.player.running, stamina: +G.player.stamina.toFixed(2) };
});
await lift();
check(`a finger on RUN and the stick: ${ran.speed} m/s over ten seconds, against 4.4 at a walk`, held.run && ran.speed > 7, { held, ran });
console.log(`     ten seconds of running: they gave up at ${ran.gave.map((t) => (t === null ? 'not yet' : t + ' s')).join(', ')}, and were ${ran.gap.join(', ')} m off at the end`);
const lost = await g(() => {
  // then on his feet, and nothing more than standing, until the rest have lost him too
  let t = 0; while (t < 20 && chasing.some(after)) { G.sim(T, T); t += T; }
  const gaveUp = chasing.map((s) => !after(s) && s.homeward), homes = chasing.map((s) => Math.hypot(s.homeX - s.x, s.homeZ - s.z));
  for (let i = 0; i < 15 / T; i++) G.sim(T, T);
  const homes2 = chasing.map((s) => Math.hypot(s.homeX - s.x, s.homeZ - s.z));
  return { more: +t.toFixed(1), left: chasing.filter(after).length, gaveUp, states: chasing.map((s) => s.state), homes: homes.map((v) => +v.toFixed(0)), homes2: homes2.map((v) => +v.toFixed(0)), woke: take() };
});
const whole = Math.max(...ran.gave.map((t) => t ?? 10 + lost.more));
check(`running for ten seconds loses all of them: ${ran.gave.filter((t) => t !== null).length} of ${ran.gave.length} had given up by the end of it, and all of them by ${whole.toFixed(1)} s`, lost.left === 0 && whole < 14, { ran, lost });
check(`and each folds back down and is sent home, and none comes back for him in the fifteen seconds after (${lost.states.join(', ')}: a grudge-holder who heard him run goes to look where he was, which is not coming for him)`, lost.gaveUp.every(Boolean) && lost.woke.hunters === 0 && lost.woke.roused.length === 0, lost);
check('and nobody woke on the way, or stirred who had nothing against him', lost.woke.hunters === 0 && quietOk(lost.woke), lost.woke);
await snap('4-lost-them');

// ---- and only walking, with the stick and no finger on RUN, in the open: three of them after him from six, nine and twelve metres back
const walking = await g(() => {
  empty(); H.lights.length = 0;
  const set = H.all.filter((s) => !s.home).slice(0, 3), [x0, z0] = road(SS - 700, 1.9);
  H.all.forEach((s) => { if (!set.includes(s)) { s.x = s.tx = s.homeX = x0 + 800; s.z = s.tz = s.homeZ = z0 + 900; s.y = G.floorAt(s.x, s.z); s.quiet = true; } });
  G.place(x0, z0); G.step(.3, T); take();
  set.forEach((s, i) => { const [x, z] = road(SS - 700 - 6 - i * 3, 1.9 + (i - 1) * 1.5); Object.assign(s, { x, z, tx: x, tz: z, homeX: x, homeZ: z, y: G.floorAt(x, z), quiet: false, state: 2, alert: 1, lost: 0, rouse: null, gaze: null, knows: 0 }); });
  const away = road(SS + 3000), gave = new Map();
  let t = 0; while (t < 60 && gave.size < 3) {
    facing(away[0] - P().x, away[1] - P().z); G.stick(0, 1); G.sim(T, T); t += T;
    for (const s of set) if (!gave.has(s) && !after(s) && s.homeward) gave.set(s, +t.toFixed(1));
  }
  G.stick(0, 0);
  const homes = set.map((s) => Math.hypot(s.homeX - s.x, s.homeZ - s.z)), took = take();
  for (let i = 0; i < 30 / T; i++) G.sim(T, T);
  const homes2 = set.map((s) => Math.hypot(s.homeX - s.x, s.homeZ - s.z)), back = take();
  return { gave: set.map((s) => gave.get(s) ?? null), gap: set.map((s) => +dist(s).toFixed(0)), t: +t.toFixed(1), homes: homes.map((v) => +v.toFixed(0)), homes2: homes2.map((v) => +v.toFixed(0)), states: set.map((s) => s.state), back: back.hunters };
});
console.log(`     walking away, they gave up at ${walking.gave.map((t) => (t === null ? 'not yet' : t + ' s')).join(', ')}, and were ${walking.homes.join(', ')} m from where they live, then ${walking.homes2.join(', ')} m thirty seconds on`);
check('walking away in the open loses them as well, only slower', walking.gave.every((t) => t !== null && t < 45), walking);
check('and they walk home: each is nearer where it lives half a minute on, and none has come back', walking.homes2.every((d, i) => d < walking.homes[i] - 5 || d < 3) && walking.back === 0, walking);

// ---- beans: five cans or fewer and nobody smells him at all, a dozen and it is about three metres, and nothing on the screen says so
const beans = await g(() => {
  empty(); H.lights.length = 0;
  const one = H.all.filter((s) => !s.home)[0], [x0, z0] = road(SS - 900, 1.9), out = {};
  H.all.forEach((s) => { if (s !== one) { s.x = s.tx = s.homeX = x0 + 800; s.z = s.tz = s.homeZ = z0 + 900; s.y = G.floorAt(s.x, s.z); s.quiet = true; } });
  G.place(x0, z0); G.player.yaw = 0; G.look(Math.PI, .3); G.step(.3, T); take();
  const put = (d) => { Object.assign(one, { x: x0 + d, z: z0, tx: x0 + d, tz: z0, homeX: x0 + d, homeZ: z0, state: 0, alert: 0, rouse: null, gaze: null, cool: 0, lost: 0, timer: 99, quiet: false }); one.y = G.floorAt(one.x, one.z); };
  const stand = (cans, d, seconds) => { G.S.beans = cans; put(d); G.player.inv = .85; take(); for (let t = 0; t < seconds; t += T) G.sim(T, T); return take(); };
  // five cans at 2.6 m for eight seconds, then twelve at 4.5 m for eight
  out.five = stand(5, 2.6, 8); out.farTwelve = stand(12, 4.5, 8);
  // twelve at two and a half metres: it stops and turns to him, and flares, and the screen has nothing new on it
  G.S.beans = 12; put(2.6); take();
  const text = window.screenText();
  let rousedAt = null; for (let t = 0; t < 6 && rousedAt === null; t += T) { G.step(T, T); if (one.state === 8 && !one.rouse.over) rousedAt = +t.toFixed(1); }
  G.step(.5, T);
  out.rousedAt = rousedAt; out.added = window.screenText().filter((l) => !text.includes(l)); out.whyBox = !!document.getElementById('why'); out.flare = W.flare; out.kind = W.roused[0]; out.state = one.state;
  // and he backs off, three metres, inside that second: it goes back to what it was doing, which was having a look at him
  const [px, pz] = [P().x, P().z]; G.place(px - 3.2, pz); G.sim(.3, T);
  out.back = { state: one.state, rouse: !!one.rouse, hunters: take().hunters };
  return out;
});
const quietly = (r) => r.roused.length === 0 && r.hunters === 0 && r.looked === 0;
check('with five cans of beans nobody smells him at all, at 2.6 m, in eight seconds', quietly(beans.five), beans.five);
check('and with a dozen not from 4.5 m', quietly(beans.farTwelve), beans.farTwelve);
check(`with a dozen, at 2.6 m, one stops and turns to him after ${beans.rousedAt} s and flares, and nothing on the screen says why`, beans.rousedAt !== null && beans.rousedAt < 3 && beans.kind === 'beans' && beans.added.length === 0 && !beans.whyBox && beans.flare > 1.4, beans);
check('and when he steps back in that second it goes back to what it was doing', beans.state === 8 && (beans.back.state === 0 || beans.back.state === 1) && !beans.back.rouse && beans.back.hunters === 0, beans);
await snap('5-beans');

// ---- a train going by: it blows its horn, the crossing shuts, and nobody stirs
const train = await g(() => {
  empty(); H.lights.length = 0;
  const R = G.trains, TR = R.t, gate = TR.gates[0]; R.go();
  const at = (s, off) => { const q = R.RAIL.at(s); return [q.x - q.tz * off, q.z + q.tx * off]; };
  const set = H.all.filter((s) => !s.home).slice(0, 10), [fx, fz] = at(gate.s, 900);
  H.all.forEach((s) => { if (!set.includes(s)) { s.x = s.tx = s.homeX = fx; s.z = s.tz = s.homeZ = fz + 900; s.y = G.floorAt(s.x, s.z); s.quiet = true; } });
  set.forEach((s, i) => { const [x, z] = at(gate.s + (i - 5) * 9, (i % 2 ? 1 : -1) * (22 + (i % 3) * 9)); Object.assign(s, { x, z, tx: x, tz: z, homeX: x, homeZ: z, y: G.floorAt(x, z), state: 0, alert: 0, rouse: null, gaze: null, timer: 99, quiet: false }); });
  const [px, pz] = at(gate.s - 20, 45); G.place(px, pz); G.step(.3, T); take();
  TR.send(1, gate.s - 700);
  const out = { blown: false, passed: false, shut: false };
  for (let t = 0; t < 70; t += T) { G.sim(T, T); const tr = TR.train; if (tr) { out.blown = out.blown || tr.blown.size > 0; out.passed = out.passed || tr.head > gate.s + 20; out.shut = out.shut || gate.shut; } }
  out.w = take(); out.states = set.map((s) => s.state); out.near = set.map((s) => +Math.hypot(s.x - s.homeX, s.z - s.homeZ).toFixed(0)); out.gaze = set.filter((s) => s.gaze).length;
  return out;
});
check('a train comes down the line and through the crossing, blowing for it, and the crossing shuts', train.blown && train.passed && train.shut, train);
check(`and ten burnt-down ones standing between 22 and 40 m off the line don't stir for it: nobody stops, looks, or comes${train.states.filter((st) => st === 5).length ? `, though ${train.states.filter((st) => st === 5).length} wandered onto the line, and the train knocked them down` : ''}`, quietly(train.w) && train.states.every((st) => st === 0 || st === 5) && train.gaze === 0, train);
await snap('6-train');

// ---- a noise beside a row of houses: a crash, an alarm, a blast and the bell, and nobody who lives there comes out for it
const houses = await g(() => {
  empty(); H.lights.length = 0; G.horde.T.grabReach = 0;
  // the spot with the most houses round it, and him there, and a couple of seconds for the people at home to come out
  const hs = G.homes.map((h) => h.s.pts[0]); let best = hs[0], most = -1;
  for (let i = 0; i < hs.length; i += 2) { let n = 0; for (const q of hs) if (Math.hypot(q[0] - hs[i][0], q[1] - hs[i][1]) < 80) n++; if (n > most) { most = n; best = hs[i]; } }
  G.place(best[0], best[1] + 14); G.step(.5, T); for (let i = 0; i < 3; i++) G.step(1, T);
  const home = () => H.all.filter((s) => s.home && dist(s) < 90), people = home();
  // him on the open ground in front of the nearest door
  const s0 = people.sort((a, b) => dist(a) - dist(b))[0]; if (s0) G.place(s0.home.door[0] + s0.home.nx * 7, s0.home.door[1] + s0.home.nz * 7);
  G.step(.3, T); take();
  const near = home(), states = new Set(), out = { houses: most, people: near.length, closest: +Math.min(...near.map(dist)).toFixed(1) };
  const go = (kind, r, seconds) => { const n = G.horde.noise(P().x, P().z, r, seconds, kind); for (let t = 0; t < seconds + 2; t += T) { G.sim(T, T); for (const s of near) states.add(s.state); } return n; };
  out.roused = [go('crash', 40, 3), go('alarm', 80, 15), go('blast', 120, 6), go('bell', 160, 20)];
  out.looked = G.horde.look(P().x + 8, P().z, 60, 7, 'bottle');
  out.w = take(); out.states = [...states]; out.calm = near.every((s) => s.who.calm);
  out.noted = G.roused.log.length;
  return out;
});
console.log(`     ${houses.people} people at home within 90 m of him, the nearest ${houses.closest} m off, through a crash, an alarm, a blast and the bell, and a bottle thrown at them`);
check('there are people at home all round him', houses.people >= 5 && houses.calm, houses);
check('and none of it brings one of them out, or round, or even to look: they stay as they are', houses.roused.every((n) => n === 0) && houses.looked === 0 && quietly(houses.w) && houses.states.every((st) => st === 0) && houses.noted === 0, houses);
await snap('7-houses');

// ---- driving the county for ten minutes: the number of people out at once stays level, nobody is left standing about, and someone put back comes out again just as they were
const county = await g(() => {
  empty(); H.lights.length = 0; G.traffic.on = false; G.player.inv = 1e5;
  const rd = G.map.roadById.get('us_80'), L = rd.length, turn = Math.min(L - 1500, 9500);
  // from wherever along the first stretch of US 80 has the most houses round it, so that there is someone to leave behind
  const hs = G.homes.map((h) => h.s.pts[0]); let start = 1500, most = -1;
  for (let s = 600; s < 4200; s += 200) { const q = G.map.along('us_80', s); let n = 0; for (const h of hs) if (Math.hypot(h[0] - q.x, h[1] - q.z) < 190) n++; if (n > most) { most = n; start = s; } }
  let truck = G.vehicles.find((v) => v.kind === 'pickup' && !v.ai && !v.wrecked);
  park(truck, start, 1.9); G.place(truck.x + 2, truck.z); for (let i = 0; i < 4; i++) G.step(1, T);
  // someone who lives there, who has been hit once and remembers it, and exactly where they are
  const who = H.all.filter((s) => s.home && dist(s) < 150).sort((a, b) => dist(a) - dist(b))[0];
  G.folks.hurt(who.who, who.x, who.z, 'hit');
  const mine = () => ({ id: who.who.id, x: who.x, z: who.z, y: who.y, yaw: who.yaw, state: who.state, tx: who.tx, tz: who.tz, timer: who.timer, inside: !!who.inside, hurt: who.who.hurt, there: who.who.there, mood: G.folks.mood(who.who) });
  const out = { start, turn, samples: [], resets: 0, wall: 0 };
  const begin = performance.now(); G.getIn(truck);
  let dir = 1, t = 0, d = G.driving(), still = { x: d.x, z: d.z, t: 0 };
  const sample = () => out.samples.push({ t: Math.round(t), s: Math.round(G.map.sOn('us_80', d.x, d.z)), all: H.all.length, homes: H.all.filter((s) => s.home).length, away: G.putBack.length, far: Math.round(Math.max(0, ...H.all.filter((s) => s.home).map(dist))), speed: Math.round(d.f) });
  while (t < 700) {
    d = G.driving();
    if (!d) { truck = G.vehicles.find((v) => v.kind === 'pickup' && !v.ai && !v.wrecked && v !== truck) ?? truck; const q = G.map.along('us_80', G.map.sOn('us_80', P().x, P().z)); park(truck, G.map.sOn('us_80', q.x, q.z), 1.9); G.getIn(truck); d = G.driving(); out.resets++; }
    const here = G.map.sOn('us_80', d.x, d.z), a = G.map.along('us_80', here + dir * 18), want = Math.atan2(a.x - d.x, a.z - d.z);
    let dy = want - d.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    G.stick(Math.max(-1, Math.min(1, -dy * 3)), d.f < 24 ? 1 : .4); G.look(d.yaw + Math.PI, .3);
    G.player.inv = 1e5; G.sim(1 / 15, 1 / 15); t += 1 / 15;
    if (Math.abs(t - Math.round(t / 5) * 5) < 1 / 30) { if (!out.samples.length || out.samples.at(-1).t !== Math.round(t)) sample(); }
    // the moment they are put away and the moment they are back, as they stand
    if (!out.removed && G.putBack.includes(who)) out.removed = { ...mine(), t: Math.round(t) };
    else if (out.removed && !out.restored && H.all.includes(who)) out.restored = { ...mine(), t: Math.round(t) };
    // if it has stopped dead, say against a bridge rail, it is put back on the road a little way on
    if ((still.t += 1 / 15) > 4) { if (Math.hypot(d.x - still.x, d.z - still.z) < 5) { const q = G.map.along('us_80', here + dir * 30); d.x = q.x; d.z = q.z; d.y = G.floorAt(q.x, q.z); d.yaw = Math.atan2(q.tx * dir, q.tz * dir); d.f = 8; d.s = 0; d.hp = d.K.hp; out.resets++; } still = { x: d.x, z: d.z, t: 0 }; }
    if (dir === 1 && here > turn) {
      dir = -1; d.yaw += Math.PI; d.s = 0;
      out.mid = { put: G.putBack.includes(who), out: H.all.includes(who), t: Math.round(t), s: Math.round(here), far: Math.round(Math.hypot(who.x - d.x, who.z - d.z)) };
    }
    if (dir === -1 && here < start + 25) break;
  }
  G.stick(0, 0); G.getOut(true); out.seconds = Math.round(t); out.wall = Math.round((performance.now() - begin) / 1000);
  for (let i = 0; i < 4; i++) G.step(1, T);
  out.end = { out: H.all.includes(who), put: G.putBack.includes(who), copies: H.all.filter((s) => s.who === who.who).length, now: mine(), near: Math.round(Math.hypot(who.x - P().x, who.z - P().z)) };
  return out;
});
const all = county.samples.map((q) => q.all), homes = county.samples.map((q) => q.homes);
const mean = (a) => a.reduce((n, v) => n + v, 0) / (a.length || 1);
console.log(`     ${county.seconds} s of driving US 80 out from the ${county.start} m mark to ${county.turn} m and back (${county.wall} s of real time, ${county.resets} stuck): out at once ${Math.min(...all)} to ${Math.max(...all)} (96 of those are the street crowd), people at home out ${Math.min(...homes)} to ${Math.max(...homes)}, ${Math.max(...county.samples.map((q) => q.away))} put back at most, the furthest one left standing ${Math.max(...county.samples.map((q) => q.far))} m off`);
check('he drives it for ten minutes', county.seconds >= 600, { seconds: county.seconds, resets: county.resets });
const half = Math.floor(county.samples.length / 2), thirds = Math.floor(county.samples.length / 3), peak = (a) => Math.max(...a.map((q) => q.all)), avg = (a) => mean(a.map((q) => q.all));
check(`the number out at once stays level: ${peak(county.samples.slice(0, half))} at most on the way out and ${peak(county.samples.slice(half))} on the way back, ${avg(county.samples.slice(0, thirds)).toFixed(0)} on average at the start and ${avg(county.samples.slice(-thirds)).toFixed(0)} at the end`, peak(county.samples.slice(half)) <= peak(county.samples.slice(0, half)) + 15 && avg(county.samples.slice(-thirds)) <= avg(county.samples.slice(0, thirds)) * 1.15 + 5 && Math.max(...all) <= 96 + 80, { out: peak(county.samples.slice(0, half)), back: peak(county.samples.slice(half)) });
check('and nobody who lives somewhere is left standing about further than the time it takes to notice, 300 m and a second of driving', county.samples.every((q) => q.far <= 345), county.samples.filter((q) => q.far > 345));
check('the person who was hit is put back when he is a long way on', county.mid && county.mid.put && !county.mid.out && county.mid.far > 300, county.mid);
const gone = county.removed, back = county.restored, near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) < .3;
check(`and comes out again, ${back ? back.t - gone.t : '?'} s later, when he is back within 190 m: the same body, once, where they stood and what they remember`, gone && back && county.end.copies === 1 && near(gone, back) && ['id', 'inside', 'hurt', 'there', 'mood', 'state'].every((k) => gone[k] === back[k]) && gone.hurt === 1 && gone.mood !== 0, { gone, back, end: county.end });

// ---- what it costs, with a crowd in front of him in front of the church and three of them flaring, and what goes up on a phone's screen when they do, which is nothing
const cost = async (rate) => {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate });
  const t = await g(() => {
    const b1 = performance.now(); for (let i = 0; i < 90; i++) { G.player.inv = .85; G.sim(1 / 30, 1 / 30); } const logic = (performance.now() - b1) / 90;
    const b2 = performance.now(); for (let i = 0; i < 60; i++) { G.player.inv = .85; G.step(1 / 30, 1 / 30); } return { logic, frame: (performance.now() - b2) / 60 };
  });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return t;
};
const busy = await g(() => {
  empty(); H.lights.length = 0;
  const yaw = Math.PI / 2, [gx, gz] = [SIGN[0], SIGN[1] + 2.5];
  G.place(gx, gz); G.player.yaw = yaw; G.look(yaw + Math.PI, .3); G.HP.speed = 0; G.S.beans = 12;
  // fifty-six of them in front of him, from 6 to 40 m, a third of them burnt down
  H.all.filter((s) => !s.home).slice(0, 56).forEach((s, i) => {
    const a = yaw + ((i % 9) - 4) * .2, d = 6 + i * .6, x = gx + Math.sin(a) * d, z = gz + Math.cos(a) * d;
    Object.assign(s, { x, z, tx: x, tz: z, homeX: x, homeZ: z, y: G.floorAt(x, z), state: 0, alert: 0, rouse: null, gaze: null, timer: 99, quiet: i % 3 !== 0 });
  });
  G.step(.4, T); take();
  // a crash, and three of them stop and turn to him and flare, and nothing goes up on the screen
  const text = window.screenText();
  const woke = H.noise(gx, gz, 40, 3, 'crash'); G.player.inv = .85; G.step(.3, T);
  const added = window.screenText().filter((l) => !text.includes(l));
  const c = G.crowd(), r = G.calls();
  return { woke, flare: Math.max(...H.all.filter((s) => s.state === 8).map((s) => G.glow(s))), added, whyBox: !!document.getElementById('why'), calls: r.calls, tris: r.triangles, drawn: c.shown, active: c.active };
});
await snap('8-flare');
const fast = await cost(1), slow = await cost(4);
console.log(`     ${busy.active} about, ${busy.drawn} drawn, three flaring: ${busy.calls} draw calls, ${busy.tris} triangles. A frame's JS: ${fast.frame.toFixed(1)} ms here, ${slow.frame.toFixed(1)} ms at a quarter of this CPU, ${slow.logic.toFixed(1)} ms of that without drawing. Not a real phone: the GPU isn't slowed down.`);
check('on a phone nothing goes up on the screen when three of them stop and turn to him: no new text, and nothing in the page to put any in', busy.added.length === 0 && !busy.whyBox, busy);
check('and three flare, over a crowd of 30 or more on screen', busy.woke === 3 && busy.flare > 1.4 && busy.drawn >= 30, busy);
check('under 33 ms of JS a frame at a quarter of this CPU', slow.frame < 33, slow);
check('and in the same number of draw calls as anywhere else', busy.calls < 340, busy);

check('no console errors', errors.length === 0, errors);
await close();

// ---- the same with reduced motion: nothing but brightness changes, so the flare is the same, nothing is said, and they come all the same
{
  const { page: still, errors: stillErrors, close: shut } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const r = await still.evaluate(() => {
    const G = __game, H = G.horde, T = 1 / 30; G.pause(); G.fillTown(); G.jump('town'); G.S.flags.town = true; G.S.flags.ended = G.S.flags.arrived = true; G.step(.1); document.getElementById('card').style.display = 'none'; G.bringOutCrowd(); G.step(.1);
    H.calm(); G.folks.forget(); G.roused.log.length = 0; G.traffic.on = false; G.S.hp = 3; G.player.inv = 0; H.T.grabReach = 0;
    const P = G.player.pos, far = G.map.fromTrue(0, 300);
    const three = H.all.filter((s) => !s.home).slice(0, 3);
    H.all.forEach((s) => { if (!three.includes(s)) { s.x = s.tx = s.homeX = far[0] + 900; s.z = s.tz = s.homeZ = far[1]; s.y = G.floorAt(s.x, s.z); s.quiet = true; } });
    three.forEach((s, i) => { const x = P.x + 10 + i * 3, z = P.z + (i - 1) * 4; Object.assign(s, { x, z, tx: x, tz: z, homeX: x, homeZ: z, y: G.floorAt(x, z), state: 0, alert: 0, rouse: null, gaze: null, timer: 99, quiet: false }); });
    G.step(.2, T);
    const text = window.screenText();
    const woke = H.noise(P.x, P.z, 40, 3, 'crash'); let flare = 0; for (let t = 0; t < .6; t += T) { G.step(T, T); flare = Math.max(flare, ...three.map((s) => G.glow(s))); }
    const added = window.screenText().filter((l) => !text.includes(l)), whyBox = !!document.getElementById('why'), stopped = three.every((s) => s.state === 8);
    G.step(.8, T);
    return { woke, flare, added, whyBox, stopped, after: three.map((s) => s.state), reduced: matchMedia('(prefers-reduced-motion: reduce)').matches };
  });
  check('with reduced motion they still stop and turn to him, flare, and then come, and nothing on the screen says why', r.reduced && r.woke === 3 && r.stopped && r.flare > 1.4 && r.added.length === 0 && !r.whyBox && r.after.every((st) => st === 2), r);
  check('no console errors with reduced motion', stillErrors.length === 0, stillErrors);
  await shut();
}

console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
