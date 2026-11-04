// Goes and stands by the railroad on a phone-sized page: that a train comes when it's due, from each end in turn, with its horn and its noise, that the crossings shut for it and the drivers wait,
// that it stops him walking through it and doesn't stop for him, that all three trestles carry him over with somewhere to stand clear, that it throws the crowd clear of the tracks and nobody dies of it
// (they lie in the ditch longer than anything else keeps anyone down, get up sore and walk home, and the ones thrown into the river come up downstream, soaked, with a snake on a sleeve),
// and what it does to a parked truck and the one he's in. Then the same again with reduced motion. What it costs is at the end, and it can't say whether any of it sounds good.
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

const setup = () => {
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
};
await g(setup);

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

// ---- the crowd: the horn brings them, the train throws them clear, and nobody dies of it. They lie in the ditch longer than any swing keeps anyone down, get up sore and walk home.
// This is played twice, with and without reduced motion, so it takes the page it's on and what to call it.
const hitByTrain = async (pg, tag, picture) => {
  const e = (fn, arg) => pg.evaluate(fn, arg), out = {};
  Object.assign(out, await e(() => {
    G.bringOutCrowd(); done(); G.horde.calm();
    const H = G.horde, c = gate('chestnut_st'), q = R.RAIL.at(c.s);
    // he's well off, and there's a dozen more of them around the crossing
    const side = 70; G.place(c.x - q.tz * side, c.z + q.tx * side); G.HP.speed = 0;
    const lot = []; for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28, r = 12 + (i % 5) * 7; lot.push(H.add(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r)); }
    G.sim(.5, T);
    const count0 = H.all.length;
    TR.send(1, c.s - 560);
    while (TR.train.head < c.s - 6) { G.player.inv = 0; G.sim(.1, T); }
    const there = lot.filter((s) => Math.hypot(s.x - c.x, s.z - c.z) < 6).length;
    return { there, count0, n: lot.length };
  }));
  await e(() => { G.look(-.2, .22); G.step(.2, 1 / 24); });
  Object.assign(out, await e(() => {
    const H = G.horde, c = gate('chestnut_st'), seen = new Map();
    let turned = 0;
    const watch = () => {
      for (const s of H.all) {
        const o = seen.get(s);
        if (s.thrown && !o) seen.set(s, { seconds: s.flat - 1, spin: s.thrown.spin });
        else if (o && !s.thrown && o.down === undefined) { o.down = H.down(s); o.away = R.RAIL.nearest(s.x, s.z).d; }
        if (s.thrown) turned = Math.max(turned, Math.abs(s.tumble));
      }
    };
    while (TR.train && TR.train.head - TR.train.length < c.s + 30) { G.player.inv = 0; G.sim(.1, T); watch(); }
    window.seen = seen;
    // and a moment to land
    for (let k = 0; k < 30; k++) { G.sim(.1, T); watch(); }
    const still = H.active.filter((s) => s.under === undefined && R.RAIL.nearest(s.x, s.z).d < 1.5 && Math.hypot(s.x - c.x, s.z - c.z) < 60);
    const list = [...seen.keys()], wrong = list.filter((s) => s.who && s.who.hurt > 0);
    const f = G.downFor, longest = Math.max(f.table.swing, f.table.blast, f.truck(1e3));
    return {
      thrown: list.length, onTracks: still.length, wrong: wrong.length, shunned: list.filter((s) => s.who?.shun).length, turned, spins: list.map((s) => seen.get(s).spin),
      longest, seconds: list.map((s) => seen.get(s).seconds), down: list.map((s) => seen.get(s).down), away: list.map((s) => seen.get(s).away),
      under: list.filter((s) => s.under !== undefined).length, now: H.all.length,
    };
  }));
  // one of them lying there, from where he'd see it
  if (picture) {
    await e(() => {
      const H = G.horde, list = [...seen.keys()].filter((s) => H.down(s) > 5), P = G.player.pos;
      const s = list.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0], dx = P.x - s.x, dz = P.z - s.z, l = Math.hypot(dx, dz);
      // he's looking at them from five metres off, with the camera behind him and a little to one side
      window.lying = s; G.place(s.x + dx / l * 5, s.z + dz / l * 5); G.player.yaw = Math.atan2(-dx, -dz); G.look(Math.atan2(dx, dz) + .2, .3); G.HP.speed = 0; G.step(.4, 1 / 24);
    });
    await picture('9-lying-clear-of-the-tracks');
  }
  // each of them from the moment they're up: on their way home, sore, and 20 s later how far they've got
  Object.assign(out, await e(() => {
    const H = G.horde, list = [...seen.keys()], home = (s) => Math.hypot(s.x - s.homeX, s.z - s.homeZ), woke = new Map(), later = new Map();
    let t = 0, homeless = 0, hunting = 0, sore = 0;
    for (; t < 160 && later.size < list.length; t += .1) {
      G.player.inv = 0; G.sim(.1, T);
      for (const s of list) {
        const w = woke.get(s);
        if (!w && H.down(s) === 0) { woke.set(s, { t, d: home(s) }); if (!(s.homeward && s.sore > 0) && home(s) > H.T.homeIs + 1) homeless++; if (s.sore > 0) sore++; }
        else if (w && !later.has(s) && t - w.t >= 20) later.set(s, { got: w.d - home(s), sore: s.sore > 0, homeward: s.homeward, hunting: s.state >= 2 && s.state <= 4 });
        if (w && s.state >= 2 && s.state <= 4) hunting++;
      }
    }
    const gone = list.filter((s) => s.under !== undefined || !H.all.includes(s)).length, got = list.map((s) => later.get(s)?.got ?? NaN);
    const waking = [...woke.values()].map((w) => w.t);
    // and the rest of the day, in case anyone was owed
    G.sim(120, T);
    return {
      upAfter: Math.max(...waking), firstUp: Math.min(...waking), homeless, sore, hunting,
      onTheWay: list.filter((s, i) => woke.get(s).d < 6 || got[i] > 3).length, fastest: Math.max(...got) / 20, slowest: Math.min(...got), stillSore: [...later.values()].filter((l) => l.sore && l.homeward).length,
      gone, later: H.all.length, people: new Set(H.all.map((s) => s.who?.id)).size,
    };
  }));
  const r = out, slow = r.fastest <= 0.75 + .05;
  console.log(`     ${tag}: ${r.there} came to the horn, ${r.thrown} thrown, none dead: lying ${Math.min(...r.down).toFixed(0)} to ${Math.max(...r.down).toFixed(0)} s, the last up ${r.upAfter.toFixed(0)} s later, ${r.onTheWay} of ${r.thrown} on their way home or there by ${r.fastest.toFixed(2)} m/s at most, and ${r.later} of ${r.count0} about at the end`);
  check(`${tag}: the horn brings them to the crossing`, r.there >= 4, r);
  check(`${tag}: and it throws them clear of the tracks, ${r.thrown} of them`, r.thrown >= 4 && r.onTracks === 0 && r.away.every((d) => d > 3.5), r);
  check(`${tag}: nobody the train hits is gone, in the river or out of the crowd`, r.under === 0 && r.gone === 0 && r.later === r.count0 && r.now === r.count0, r);
  check(`${tag}: they lie there longer than any swing keeps anyone down, longer than a blast or a pickup flat out, ${r.longest} s`, r.down.every((d) => d > r.longest + 5) && r.seconds.every((d) => d > r.longest + 5), r);
  check(`${tag}: nobody holds it against him`, r.wrong === 0 && r.shunned >= r.thrown, r);
  check(`${tag}: they get up in the end, all of them, and none go for him: sore, and on their way home`, r.upAfter < 120 && r.homeless === 0 && r.sore > 0 && r.hunting === 0, r);
  check(`${tag}: and they get there slower than they used to go about, being sore`, r.onTheWay === r.thrown && slow, r);
  check(`${tag}: nobody new walks into town in their place`, r.later === r.count0 && r.people === r.count0, r);
  return r;
};
const crowd = await hitByTrain(page, 'the crowd', snap);
check('and it turns them over as it throws them', crowd.turned > 1 && crowd.spins.every((v) => v > 0), crowd);
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

// ---- and off a trestle they go into the river. The cottonmouths have them, and the current, and they come up downstream on the bank, soaked, with a snake on a sleeve, and walk home.
const offTrestle = async (pg, tag, picture) => {
  const e = (fn, arg) => pg.evaluate(fn, arg), out = {};
  Object.assign(out, await e(() => {
    const H = G.horde, t = R.TRESTLES[1], n0 = H.all.length;
    H.calm(); done(); G.place(t.rx, t.rz); G.HP.speed = 0;
    // four of them in the middle of it, over the water, with nothing in their heads
    const lot = [-3, -1, 1, 3].map((o) => { const [x, z] = along(t.s + o, 0), s = H.add(x, z); s.next = 99; s.y = R.TRESTLE.top; return s; });
    window.lot = lot; window.swim = new Map(); window.rec = [];
    for (const s of lot) swim.set(s, {});
    const was = H.on.surfaced; H.on.surfaced = (s) => { s.next = 0; rec.push({ s, x: s.x, z: s.z, wet: s.wet, dries: H.T.dries, snake: s.snake, snakeFor: H.T.snakeFor, sore: s.sore > 0, home: s.homeward, climbing: s.climbing, state: s.state, level: G.water.level(s.x, s.z), floor: G.floorAt(s.x, s.z), pond: !!G.water.in(s.x, s.z) }); was?.(s); };
    // and the train's already on it, so it's the sides of its cars that find them
    TR.send(1, t.s + 30);
    return { n: lot.length, n0 };
  }));
  Object.assign(out, await e(() => {
    const H = G.horde, lot = window.lot, t = R.TRESTLES[2];
    let wentUnder = 0, splash = 0;
    const had = new Set();
    for (let k = 0; k < 400 && had.size < lot.length; k++) { G.sim(.1, T); for (const s of lot) if (s.under !== undefined && !had.has(s)) { had.add(s); swim.get(s).near = G.river.path.near(s.x, s.z); } }
    const off = lot.filter((s) => !R.onTrestle(s.x, s.z)).length;
    return { off, under: had.size, still: lot.filter((s) => R.onTrestle(s.x, s.z)).length, alive: alive(), where: lot.map((s) => ({ x: Math.round(s.x), z: Math.round(s.z), y: +s.y.toFixed(1), under: s.under, flat: s.flat, thrown: !!s.thrown, state: s.state })) };
  }));
  Object.assign(out, await e(() => {
    const H = G.horde, lot = window.lot;
    // under for 10 to 18 s, and the current has them
    const t0 = lot.map((s) => s.under);
    for (let k = 0; k < 400 && lot.some((s) => s.under !== undefined); k++) { done(); G.sim(.1, T); }
    return { under0: t0, up: rec.length, back: lot.every((s) => s.under === undefined) };
  }));
  // up, and out of the water and on their way, with the snake still on the sleeve
  Object.assign(out, await e(() => {
    const first = rec.map((r) => ({ ...r, s: undefined }));
    G.sim(6, T);
    // and the snake: where it is on the sleeve it's hanging from, on every step, which is a sway, or none
    const s = window.lot.find((o) => o.snake > 0);
    G.step(.3, 1 / 24);
    const seen = new Set(); for (let i = 0; i < 12; i++) { G.step(1 / 12, 1 / 24); const m = s && G.river.relative(s); if (m) seen.add(m.slice(0, 11).map((v) => (Math.round(v * 100) / 100 || 0).toFixed(2)).join()); }
    return { first, snakesOn: window.lot.filter((o) => o.snake > 0).length, hung: seen.size, drawn: G.river.snakes().drawn };
  }));
  if (picture) {
    await e(() => {
      const lot = window.lot, P = G.player.pos, s = lot.slice().sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0], dx = P.x - s.x, dz = P.z - s.z, l = Math.hypot(dx, dz);
      window.soaked = s; G.place(s.x + dx / l * 5.5, s.z + dz / l * 5.5); G.player.yaw = Math.atan2(-dx, -dz); G.look(Math.atan2(dx, dz) + .45, .26); G.HP.speed = 0; G.step(.4, 1 / 24);
    });
    await picture('10-up-from-the-river');
  }
  Object.assign(out, await e(() => {
    const lot = window.lot, H = G.horde;
    G.sim(8, T);
    const dry = lot.map((s) => ({ x: s.x, z: s.z, floor: G.floorAt(s.x, s.z), level: G.water.level(s.x, s.z), pond: !!G.water.in(s.x, s.z), wading: s.wading, climbing: s.climbing, blocked: G.blocked(s.x, s.z, G.floorAt(s.x, s.z)) }));
    // how far downstream, along the river
    const swept = lot.filter((s) => rec.some((o) => o.s === s)).map((s) => { const r = rec.find((o) => o.s === s); return { was: swim.get(s).near, now: G.river.path.near(r.x, r.z) }; });
    const total = (p) => { let v = p.s; for (let k = G.river.path.lines[p.line].prev; k >= 0; k = G.river.path.lines[k].prev) v += G.river.path.lines[k].length; return v; };
    const out = { dry, downstream: swept.map((o) => total(o.now) - total(o.was)), wet: lot.map((s) => s.wet), homeward: lot.map((s) => s.homeward), count: H.all.length };
    // and the rest of the day, in case anyone was owed
    G.sim(60, T);
    out.later = H.all.length; out.stillThere = lot.every((s) => H.all.includes(s) && s.under === undefined);
    return out;
  }));
  const r = out;
  check(`${tag}: the train throws whoever's on a trestle off the side of it, over the river: ${r.off} of ${r.n} off, ${r.under} under`, r.off === r.n && r.under === r.n && r.alive, r);
  check(`${tag}: nobody's lost to it: they all come up again, ${r.up} of ${r.n}, the same number about as before`, r.back && r.up === r.n && r.count === r.n0 + r.n && r.later === r.count && r.stillThere, r);
  check(`${tag}: up in the water, to wade out of it, soaked, sore, with a snake, and heading home`, r.snakesOn === r.n && r.first.every((f) => f.floor < f.level - .1 && f.wet === f.dries && f.snake >= f.snakeFor[0] && f.snake <= f.snakeFor[1] && f.sore && f.home && f.climbing && f.state === 0 && !f.pond), r.first);
  check(`${tag}: downstream of the trestle, ${r.downstream.map((d) => d.toFixed(0)).join(', ')} m`, r.downstream.every((d) => d > 20 && d < 70), r.downstream);
  check(`${tag}: ${r.drawn} snakes drawn on sleeves, ${tag.includes('reduced') ? 'hanging without a sway' : 'swinging a little'}`, r.drawn >= 1 && (tag.includes('reduced') ? r.hung === 1 : r.hung > 3), r);
  check(`${tag}: then out on the bank, on dry ground that isn't a pond's or in the way`, r.dry.every((d) => d.floor >= d.level - .1 && !d.pond && !d.blocked && !d.climbing && !d.wading), r.dry);
  check(`${tag}: still soaked and still on their way`, r.wet.every((w) => w > 50) && r.homeward.every((h) => h), r);
  return r;
};
await offTrestle(page, 'off a trestle', snap);
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

// ---- reduced motion: no shaking, and nothing flashes, and nobody turns over when they're thrown, and the snake on a sleeve only hangs. Everything else is the same.
{
  const { page: p2, errors: e2, close: c2 } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await p2.evaluate(setup);
  const still = await p2.evaluate(() => {
    R.go();
    const c = TR.gates.find((o) => o.road === 'poplar_st'), q = R.RAIL.at(c.s + 40); G.place(q.x - q.tz * 4, q.z + q.tx * 4); G.HP.speed = 0; TR.send(1, c.s + 90); G.step(.5, 1 / 30);
    const col = R.star.geometry.attributes.color, a = []; for (let i = 0; i < 4; i++) { TR.send(1, c.s - 60); G.step(.3, 1 / 30); a.push(col.getX(1).toFixed(3) + col.getX(2).toFixed(3)); }
    const out = { shake: G.cam.shake, lamps: a };
    done(); return out;
  });
  check('with reduced motion nothing shakes', still.shake === 0, still);
  check('and the lamps hold still', new Set(still.lamps).size === 1, still);
  const calm = await hitByTrain(p2, 'with reduced motion, the crowd', null);
  check('with reduced motion they\'re thrown clear and land, and nobody turns over on the way', calm.turned === 0 && calm.spins.every((v) => v === 0), calm);
  await p2.evaluate(() => { done(); G.horde.calm(); });
  await offTrestle(p2, 'with reduced motion, off a trestle', null);
  check('no console errors there either', e2.length === 0, e2);
  await c2();
}

console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
