// Goes and stands by the railroad on a phone-sized page: that a train comes when it's due, from each end in turn, with its horn and its noise, that the crossings shut for it and the drivers wait,
// that it stops him walking through it and doesn't stop for him, that all three trestles carry him over with somewhere to stand clear, that it clears the crowd off the tracks, and what it does
// to a parked truck and the one he's in. What it costs is at the end, and it can't say whether any of it sounds good.
//
//   npm i && npm run trains [-- --shots dir]
import { mkdirSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); };

await g(() => {
  const G = __game; G.pause(); G.jump('town'); G.S.flags.town = true; G.S.flags.ended = G.S.flags.arrived = true; G.step(.1);
  document.getElementById('card').style.display = 'none';
  window.G = G; window.T = 1 / 30; window.R = G.trains; window.TR = R.t;
  window.P = () => G.player.pos;
  window.land = () => { G.S.mode = 'town'; G.HP.kind = 'run'; G.player.vy = 0; G.player.grounded = true; };
  window.along = (s, off = 0) => { const q = R.RAIL.at(s); return [q.x - q.tz * off, q.z + q.tx * off]; };
  // on the line at s, or beside it by off, and looking along it
  window.stand = (s, off = 0, way = 1) => { const q = R.RAIL.at(s); land(); G.place(q.x - q.tz * off, q.z + q.tx * off); G.look(Math.atan2(-q.tx * way, -q.tz * way), .3); G.HP.speed = 0; G.player.kb.set(0, 0); G.stick(0, 0); };
  // walking the way it says, for this long, and it says how far he got
  window.walkAway = (dx, dz, seconds) => { const l = Math.hypot(dx, dz); G.look(Math.atan2(-dx / l, -dz / l), .3); G.stick(0, 1); G.sim(seconds, T); G.stick(0, 0); };
  window.across = () => R.RAIL.nearest(P().x, P().z).d;
  window.gate = (road) => TR.gates.find((c) => c.road === road);
  window.done = () => { TR.clear(); G.stick(0, 0); G.player.inv = 0; G.player.kb.set(0, 0); };
  window.alive = () => G.S.mode !== 'fail';
});

// ---- off, in tests, until it's asked for, which is what keeps every other test as it was
const off = await g(() => { G.sim(1, T); return { on: R.on(), train: !!TR.train, wait: TR.wait }; });
check('with ?test no train runs until it\'s asked for', !off.on && !off.train && off.wait === 75, off);

// ---- the timetable
const due = await g(() => {
  const g0 = gate('poplar_st'); R.go(); stand(g0.s, 30);
  const log = []; let was = null;
  for (let t = 0; t < 700; t += .25) { G.sim(.25, .25); const tr = TR.train; if (tr && tr !== was) { log.push({ t, dir: tr.dir, ahead: Math.round(tr.ahead) }); was = tr; } if (tr) G.player.inv = 0; }
  return log;
});
console.log(`     trains came at ${due.map((d) => d.t).join(', ')} s`);
check('the first comes when it\'s due', due[0] && Math.abs(due[0].t - 75) < 2, due);
check('and then another every five minutes or so', due.length >= 2 && due.slice(1).every((d, i) => d.t - due[i].t >= 269 && d.t - due[i].t <= 311), due);
check('from each end in turn', due.length >= 2 && due.slice(1).every((d, i) => d.dir === -due[i].dir), due);
check('from further off than he can see', due.every((d) => d.ahead > 1400), due);
await g(() => done());

// ---- what it sounds like, and what a crossing does
await page.keyboard.press('x');
await page.waitForFunction(() => __game.sound.state().ctx === 'running', null, { timeout: 5000 });
// their files come in on their own time, and the clock's held
await page.waitForFunction(() => { const Snd = __game.sound, names = ['train.horn', 'train.blast', 'train.rumble', 'train.clatter', 'crossing.bell']; for (const n of names) Snd.loop(n, .01); return names.every((n) => Snd.state().loops.includes(n)); }, null, { timeout: 60000, polling: 250 });
await g(() => { for (const n of ['train.horn', 'train.blast', 'train.rumble', 'train.clatter', 'crossing.bell']) G.sound.loop(n, 0); G.sim(9, T); });
const pass = await g(() => {
  const Snd = G.sound, c = gate('chestnut_st'), arms = R.arms.filter((a) => a.gate === c); Snd.forget();
  stand(c.s + 60, 14); TR.send(1, c.s - 700);
  const out = { armsAtFirst: arms.map((a) => a.down), shut0: c.shut };
  // up to the horn
  G.sim(13, T); out.horn = !!Snd.lastHeard('train.horn'); out.gapHorn = Math.round(TR.train.gap); out.rumbleFar = Snd.state().loopLevels['train.rumble'] ?? 0; out.rateComing = Snd.state().loopRates['train.rumble'];
  // up to the nose getting there
  let shutAt = null; while ((c.s - TR.train.head) > 8) { G.sim(.1, T); if (c.shut && shutAt === null) shutAt = Math.round(c.s - TR.train.head); }
  out.shutAt = shutAt; out.armsDown = arms.map((a) => a.down); out.bell = Snd.state().loopLevels['crossing.bell'] ?? 0; out.shutHere = TR.shutAt(c.x, c.z); out.shutElse = TR.shutAt(c.x + 50, c.z);
  G.sim(4, T); out.clatter = Snd.state().loopLevels['train.clatter'] ?? 0; out.rumbleNear = Snd.state().loopLevels['train.rumble'] ?? 0; out.alive = alive(); out.gap = TR.train?.gap; out.shake = G.cam.shake;
  return out;
});
check('it blows for the crossing, and it\'s heard', pass.horn, pass);
check('it\'s heard coming, a little sharp', pass.rumbleFar > 0 && pass.rateComing > 1.02, pass);
check('the crossing shuts in good time', pass.shutAt > 200 && pass.shutAt < 340 && pass.shutHere && !pass.shutElse, pass);
check('and its arms are down when it gets there', pass.armsAtFirst.every((a) => a === 0) && pass.armsDown.length === 2 && pass.armsDown.every((a) => a === 1), pass);
check('with the bell going', pass.bell > .03, pass);
check('and going by it\'s louder, with the wheels, and comes up through his feet', pass.clatter > .3 && pass.rumbleNear > pass.rumbleFar && pass.shake > .03, pass);
await g(() => G.step(.2, 1 / 24));
await snap('1-going-by');
const after1 = await g(() => {
  const Snd = G.sound, c = gate('chestnut_st'), arms = R.arms.filter((a) => a.gate === c), tr = TR.train, drawn = R.drawn();
  while (TR.train && (TR.train.head - TR.train.length - c.s) < 200) G.sim(.2, T);
  const rate = Snd.state().loopRates['train.rumble'], open = !c.shut; G.sim(9, T);
  return { rate, open, up: arms.map((a) => a.down), drawn, cars: tr.cars.length };
});
check('it opens behind it, and it\'s a little flat going away', after1.open && after1.up.every((a) => a === 0) && after1.rate < .98, after1);
check('and it\'s all drawn, or as much as can be seen', after1.drawn >= 6, after1);
await g(() => done());

// ---- him and the train
const side = await g(() => {
  const s = gate('poplar_st').s + 120; stand(s, 3); TR.send(1, s + 50); G.sim(.1, T);
  // straight at the side of it, for two seconds
  const q = R.RAIL.at(s); walkAway(q.tz, -q.tx, 2);
  return { off: across(), alive: alive(), on: !!TR.at(P().x, P().z, 0) };
});
check('walking into the side of it just stops him', side.off > 1.55 && side.off < 2.6 && side.alive && !side.on, side);
await g(() => done());
const hit = await g(() => {
  const Snd = G.sound; Snd.forget(); const s = gate('poplar_st').s + 300; stand(s, 0); TR.send(1, s - 300);
  G.sim(9, T);
  const out = { blast: !!Snd.lastHeard('train.blast'), still: alive() };
  while (!R.got() && TR.train && TR.train.ahead > -40) G.sim(T, T);
  const at0 = [P().x, P().z]; out.got = R.got(); out.y0 = P().y; G.sim(.5, T);
  out.up = P().y - out.y0; out.moved = Math.hypot(P().x - at0[0], P().z - at0[1]); out.off = across(); out.modeSoon = G.S.mode;
  return out;
});
check('on the tracks, it blows for him', hit.blast && hit.still, hit);
check('it doesn\'t stop, and he goes flying off to one side', hit.got && hit.up > .5 && hit.moved > 5 && hit.off > 1.6, hit);
await g(() => G.step(.05, 1 / 24));
await snap('2-hit');
const end = await g(async () => { G.sim(1, T); return { mode: G.S.mode, says: document.getElementById('failH').textContent, more: document.getElementById('failP').textContent, hidden: document.getElementById('fail').hidden }; });
check('and that\'s that', end.mode === 'fail' && !end.hidden && /train/i.test(end.says), end);
await snap('3-got');
await page.tap('#retry');
const back = await g(() => { G.sim(.2, T); return { mode: G.S.mode, off: across(), got: R.got() }; });
check('try again, and he\'s somewhere else', back.mode === 'town' && back.off > 5 && !back.got, back);
await g(() => done());

// ---- the trestles
const trestles = await g(() => {
  const out = [];
  for (const t of R.TRESTLES) {
    // across on foot, in the middle of the track
    stand(t.s - 42); let low = Infinity, wood = false, wet = false, s = t.s - 42;
    for (let i = 0; i < 80 && s < t.s + 42; i++) {
      const q = R.RAIL.at(s), [x, z] = along(s + 4); walkAway(x - P().x, z - P().z, .5); s = R.RAIL.nearest(P().x, P().z).s;
      if (Math.abs(s - t.s) < 20) { low = Math.min(low, P().y); wood ||= G.surfaceUnder() === 'wood'; }
      wet ||= G.HP.kind === 'swim';
    }
    const ground = G.groundH(t.x, t.z);
    // the piles are in the river, and stop someone swimming, and aren't in his way up top
    let piles = 0, inWay = 0;
    for (let a = -30; a < 30; a += .5) for (let b = -3; b <= 3; b += .25) { const [x, z] = along(t.s + a, b); if (G.blocked(x, z, 0)) { piles++; if (G.blocked(x, z, R.TRESTLE.top)) inWay++; } }
    out.push({ id: t.id, over: s > t.s + 38, low, wood, wet, ground, piles, inWay, top: R.TRESTLE.top });
  }
  return out;
});
for (const t of trestles) check(`${t.id}: he walks across it, on planks, high above the river`, t.over && Math.abs(t.low - t.top) < .02 && t.wood && !t.wet && t.ground < 0, t);
check('and its piles stop anyone swimming, and aren\'t in his way up top', trestles.every((t) => t.piles > 20 && t.inWay === 0), trestles);
await g(() => { stand(R.TRESTLES[1].s - 14); G.HP.speed = 0; G.step(.5, 1 / 24); });
await snap('4-trestle');
const off1 = await g(() => {
  const t = R.TRESTLES[1]; stand(t.s + 8); const q = R.RAIL.at(t.s + 8);
  walkAway(-q.tz, q.tx, 2.5); G.sim(1.5, T);
  const out = { y: P().y, kind: G.HP.kind, onDeck: R.onTrestle(P().x, P().z), alive: alive() };
  return out;
});
check('off the side of it and he\'s in the river', off1.y < 1 && off1.kind === 'swim' && !off1.onDeck && off1.alive, off1);
await g(() => done());
const refuge = await g(() => {
  const t = R.TRESTLES[0]; land(); G.place(t.rx, t.rz); G.HP.speed = 0; G.sim(.5, T); TR.send(1, t.s - 90);
  G.sim(3, T);
  const out = { floor: G.floorAt(t.rx, t.rz), y: P().y, nose: TR.train.ahead };
  return out;
});
await g(() => { G.look(1.3, .25); G.step(1.6, 1 / 24); });
await snap('5-refuge');
const ref2 = await g(() => { const t = R.TRESTLES[0]; while (TR.train && TR.train.head - TR.train.length < t.s + 30) G.sim(.25, T); return { alive: alive(), on: R.onTrestle(P().x, P().z), y: P().y, kind: G.HP.kind, got: R.got(), head: TR.train?.head, tail: TR.train?.length }; });
check('there\'s somewhere to stand clear of it halfway over', refuge.floor === 6.25 && ref2.alive && ref2.on && !ref2.got, { refuge, ref2 });
await g(() => done());

// ---- the crowd
const clear = await g(() => {
  G.bringOutCrowd(); const H = G.horde, c = gate('chestnut_st'), q = R.RAIL.at(c.s);
  // he's well off, and there's a dozen more of them around the crossing
  const side = 70; G.place(c.x - q.tz * side, c.z + q.tx * side); G.HP.speed = 0;
  const lot = []; for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28, r = 12 + (i % 5) * 7; lot.push(H.add(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r)); }
  G.sim(.5, T);
  const count0 = H.all.length;
  TR.send(1, c.s - 560);
  while (TR.train.head < c.s - 6) { G.player.inv = 0; G.sim(.1, T); }
  const there = lot.filter((s) => Math.hypot(s.x - c.x, s.z - c.z) < 6).length;
  return { there, count0, n: lot.length };
});
await g(() => { G.look(-.2, .22); G.step(.2, 1 / 24); });
const clear2 = await g(() => {
  const H = G.horde, c = gate('chestnut_st');
  let thrown = 0, killed = 0; const seen = new Set();
  while (TR.train && TR.train.head - TR.train.length < c.s + 30) { G.player.inv = 0; G.sim(.1, T); for (const s of H.all) { if (s.thrown && !seen.has(s)) { seen.add(s); thrown++; if (s.thrown.kills) killed++; } } }
  const still = H.active.filter((s) => s.under === undefined && R.RAIL.nearest(s.x, s.z).d < 1.5 && Math.hypot(s.x - c.x, s.z - c.z) < 60);
  const wrong = [...seen].filter((s) => s.who && s.who.hurt > 0);
  G.sim(12, T);
  return { thrown, killed, onTracks: still.length, wrong: wrong.length, shunned: [...seen].filter((s) => s.who?.shun).length, after: H.all.length, gone: [...seen].filter((s) => s.who?.gone).length };
});
console.log(`     ${clear.there} came to the horn, ${clear2.thrown} thrown, ${clear2.killed} of them killed, and ${clear2.gone} gone for good`);
check('the horn brings them to the crossing', clear.there >= 4, clear);
check('and it clears them off the tracks', clear2.thrown >= 4 && clear2.killed >= 1 && clear2.onTracks === 0, clear2);
check('it kills some of them, and they\'re gone', clear2.gone >= 1 && clear2.after < clear.count0, { clear, clear2 });
check('nobody holds it against him', clear2.wrong === 0 && clear2.shunned >= clear2.thrown, clear2);
await g(() => { done(); G.horde.calm(); });
const chased = await g(() => {
  const H = G.horde, t = R.TRESTLES[2]; stand(t.s - 6, 0);
  const [x, z] = along(t.s - 36), s = H.add(x, z);
  G.sim(.3, T); H.lure(P().x, P().z, 60, 12, false, 'test');
  G.sim(7, T);
  const out = { onDeck: R.onTrestle(s.x, s.z), y: s.y, d: Math.hypot(s.x - P().x, s.z - P().z) };
  return out;
});
check('the crowd can follow him out on a trestle', chased.onDeck && Math.abs(chased.y - await g(() => R.TRESTLE.top)) < .02, chased);
const swept = await g(() => {
  const H = G.horde, t = R.TRESTLES[2], lot = H.active.filter((s) => R.onTrestle(s.x, s.z)), n = lot.length, before = H.all.length;
  H.calm(); G.player.inv = 0; G.place(t.rx, t.rz); G.HP.speed = 0;
  for (const s of lot) { s.next = 99; s.x = along(t.s - 6, 0)[0]; s.z = along(t.s - 6, 0)[1]; s.y = R.TRESTLE.top; }
  TR.send(1, t.s - 60);
  G.sim(5, T);
  return { n, off: lot.filter((s) => !R.onTrestle(s.x, s.z) && (s.dead !== undefined || s.under !== undefined || s.who?.gone)).length, alive: alive(), before, after: H.all.length };
});
check('and off it they go, for good', swept.n >= 1 && swept.off === swept.n && swept.alive, swept);
await g(() => { done(); G.horde.calm(); });

// ---- vehicles
const parked = await g(() => {
  const c = gate('poplar_st'), V = G.lures.VEHICLES, v = V.filter((o) => o.kind === 'pickup' && !o.ai && !o.loose).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0], q = R.RAIL.at(c.s + 20);
  v.x = q.x; v.z = q.z; v.yaw = Math.atan2(q.tx, q.tz) + 1.1; const was = [v.x, v.z];
  stand(c.s + 20, 25); G.step(.6, 1 / 24); TR.send(1, c.s - 40); G.sim(3.2, T);
  const flying = !!v.loose; G.sim(.1, T);
  const out = { flying, wrecked: v.wrecked, moved: Math.hypot(v.x - was[0], v.z - was[1]), off: R.RAIL.nearest(v.x, v.z).d, y: v.y, hit: !!v.trainAt };
  return out;
});
await g(() => { G.step(.1, 1 / 24); });
await snap('6-truck');
check('it throws a parked truck clear and wrecks it', parked.hit && parked.flying && parked.wrecked && parked.off > 2, parked);
await g(() => { done(); G.sim(8, T); });
const inIt = await g(() => {
  const V = G.lures.VEHICLES, c = gate('pine_forest_rd'), q = R.RAIL.at(c.s + 30), v = V.filter((o) => o.kind === 'pickup' && !o.ai && !o.wrecked && !o.loose).sort((a, b) => Math.hypot(a.x - q.x, a.z - q.z) - Math.hypot(b.x - q.x, b.z - q.z))[0];
  G.place(v.x + 2.5, v.z); G.step(.6, 1 / 24); G.key('e', true); G.sim(T, T); G.key('e', false); G.sim(.2, T);
  const d = G.driving(), out = { gotIn: d === v };
  if (!d) return out;
  d.x = q.x; d.z = q.z; d.f = d.s = d.steer = 0; d.yaw = Math.atan2(q.tx, q.tz) + 1.3; G.sim(.2, T);
  TR.send(1, c.s - 30); G.sim(3.2, T);
  out.wrecked = d.wrecked; out.alive = alive(); out.mode = G.S.mode; out.off = R.RAIL.nearest(d.x, d.z).d; out.hit = !!d.trainAt;
  return out;
});
check('and the one he\'s in, and he\'s got a moment to get out', inIt.gotIn && inIt.hit && inIt.wrecked && inIt.alive && inIt.off > 2, inIt);
await g(() => { const d = G.driving(); if (d) { d.f = d.s = 0; G.sim(.2, T); G.key('e', true); G.sim(T, T); G.key('e', false); G.sim(.2, T); } done(); G.sim(1, T); });

// ---- other people
const drivers = await g(() => {
  G.fillTown(); G.player.inv = 0; const Tf = G.traffic, c = gate('us_80'), r = G.map.roadById.get('us_80'), s0 = G.map.sOn('us_80', c.x, c.z), [x, z] = [c.x - 30, c.z + 40];
  land(); const w = G.map.along('us_80', s0 - 190); G.place(w.x - w.tz * 30, w.z + w.tx * 30); G.HP.speed = 0; G.step(.2); Tf.T.cars = 1; Tf.soon(); let n = 0;
  while (!Tf.cars.length && n++ < 500) G.sim(.1, .1);
  const car = Tf.cars[0]; if (!car) return { none: true };
  const dir = 1, s = s0 - 380, p = G.map.along('us_80', s);
  car.road = r; car.s = s; car.dir = dir; car.v.x = p.x; car.v.z = p.z; car.v.yaw = Math.atan2(p.tx, p.tz); car.v.f = 11; car.plan = null; Tf.T.cars = 1;
  TR.send(1, c.s - 500); G.sim(21, T);
  const q = G.map.along('us_80', car.s), out = { road: car.road.id, what: car.what, f: car.v.f, ahead: Math.hypot(car.v.x - c.x, car.v.z - c.z), shut: c.shut, s: car.s - s0 };
  while (TR.train && TR.train.head - TR.train.length < c.s + 20) G.sim(.25, T);
  out.stillWaiting = car.s - s0 < 0; out.waitDir = car.dir;
  G.sim(10, T);
  out.then = car.s - s0; out.on = Tf.cars.includes(car);
  return out;
});
check('a driver waits at the crossing for it', drivers.road === 'us_80' && drivers.what === 'crossing' && drivers.shut && Math.abs(drivers.f) < 1 && drivers.ahead > 7 && drivers.stillWaiting && drivers.waitDir === 1, drivers);
check('and goes on when it\'s gone', drivers.then > 5, drivers);
await g(() => { done(); G.traffic.on = false; G.traffic.clear(); });

// ---- the marker
const marker = await g(() => {
  // in front of it, a little to one side so that he isn't in the way of reading it, and its face is the side towards the track
  const M = R.MARKER, t = R.TRESTLES.find((o) => o.id === 'trestle-west'), q = R.RAIL.at(R.RAIL.nearest(M.x, M.z).s), side = ((M.x - q.x) * -q.tz + (M.z - q.z) * q.tx) >= 0 ? 1 : -1, nx = -q.tz * side, nz = q.tx * side;
  land(); G.place(M.x - nx * 2 + q.tx * .7, M.z - nz * 2 + q.tz * .7); G.look(Math.atan2(-nx, -nz), .04); G.HP.speed = 0; G.step(.4, 1 / 24);
  return { act: G.S.act, reach: R.markerInReach(), near: Math.hypot(M.x - t.x, M.z - t.z), ground: G.groundH(M.x, M.z), wet: G.water.look(M.x, M.z) };
});
check('there\'s a marker by the west trestle, on dry ground', marker.reach && marker.near < 70 && marker.ground > 6 && marker.act === 'Read the marker', marker);
await snap('7-marker');
const button = await page.textContent('#bA');
check('its button says READ', /READ/.test(button), button);
await page.tap('#bA');
const read = await g(() => { G.step(.1, 1 / 24); const e = document.querySelector('#prompt .words'); return e ? e.textContent : null; });
check('and it says what happened, in a line or two, and no ghost', /1863|flood/.test(read ?? '') && /Vicksburg/.test(read ?? '') && !/ghost|haunt/i.test(read ?? ''), read);
await snap('8-read');

// ---- what it costs, with it going right by him and the crowd about
const cost = async (rate) => {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate });
  const t = await g(() => {
    const c = gate('poplar_st'); G.horde.calm(); stand(c.s + 50, 8); TR.send(1, c.s + 120); G.step(.1, 1 / 30);
    const b1 = performance.now(); for (let i = 0; i < 90; i++) { G.player.inv = 0; G.sim(1 / 30, 1 / 30); } const logic = (performance.now() - b1) / 90;
    const b2 = performance.now(); for (let i = 0; i < 60; i++) { G.player.inv = 0; G.step(1 / 30, 1 / 30); } const frame = (performance.now() - b2) / 60, info = G.calls(); done();
    return { logic, frame, calls: info.calls, tris: info.triangles };
  });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return t;
};
const heavy = await cost(1), slow = await cost(4);
console.log(`     going by: ${heavy.calls} draw calls, ${heavy.tris} triangles. A frame's JS: ${heavy.frame.toFixed(1)} ms here and ${slow.frame.toFixed(1)} ms at a quarter of this CPU, ${slow.logic.toFixed(1)} ms of it without drawing`);
check('under 33 ms of JS a frame at a quarter of this CPU', slow.frame < 33, slow);
check('and in about the same number of draw calls as anywhere else', heavy.calls < 340, heavy);

check('no console errors', errors.length === 0, errors);
await close();

// ---- reduced motion: no shaking, and nothing flashes
{
  const { page: p2, errors: e2, close: c2 } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const still = await p2.evaluate(() => {
    const G = __game, R = G.trains, TR = R.t; G.pause(); G.jump('town'); G.S.flags.town = true; G.S.flags.ended = G.S.flags.arrived = true; G.step(.1); R.go();
    const c = TR.gates.find((o) => o.road === 'poplar_st'), q = R.RAIL.at(c.s + 40); G.place(q.x - q.tz * 4, q.z + q.tx * 4); G.HP.speed = 0; TR.send(1, c.s + 90); G.step(.5, 1 / 30);
    const col = R.star.geometry.attributes.color, a = []; for (let i = 0; i < 4; i++) { TR.send(1, c.s - 60); G.step(.3, 1 / 30); a.push(col.getX(1).toFixed(3) + col.getX(2).toFixed(3)); }
    return { shake: G.cam.shake, lamps: a };
  });
  check('with reduced motion nothing shakes', still.shake === 0, still);
  check('and the lamps hold still', new Set(still.lamps).size === 1, still);
  check('no console errors there either', e2.length === 0, e2);
  await c2();
}

console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
