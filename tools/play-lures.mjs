// Slips past the ones who've burnt down with what he can throw, on a phone-sized page, with real taps and the game's own movement: picks up a bottle, throws each thing off US 80 with a crowd
// on it and counts who turns to look (the burnt-down ones near enough, for a few seconds, or as long as a fire of lighter fluid burns, and none of them walks over, and the ones who've gone quiet
// and the ones already after him don't care), slips past one with each of them where it would have noticed him without, sets off a car alarm from across a lot (which draws nobody, and rouses the
// burnt-down ones who can hear it, who come for him and not for the car), throws a bottle into the river (which nobody follows), and goes round the swap list, which has no beans in it, since
// a can set out is supper and that isn't here yet. Wherever along the river someone goes under there's a bank to come up on that they can walk home from. Whoever stops and turns to him,
// nothing on the screen says why. Nothing flashes with reduced motion.
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
  window.G = G; window.H = G.horde; window.T = 1 / 30; window.P = () => G.player.pos;
  // A stretch of US 80 west of town, running east from t = 0, 40 m long
  const a0 = G.map.sOn('us_80', ...G.map.fromTrue(-560, -20)), a1 = a0 + Math.sign(G.map.sOn('us_80', ...G.map.fromTrue(-500, -21)) - a0) * 40;
  window.us80 = (t) => G.map.along('us_80', a0 + (a1 - a0) * t);
  // n of them along the road between two places on it, burnt down and coming for him on sight unless every so many of them have gone quiet, and everyone else nowhere near
  window.crowdOnRoad = (groups = [[0, 1, 24]], quietEvery = 0) => {
    H.calm(); H.noises.length = 0; H.looks.length = 0; G.folks.forget(); G.roused.log.length = 0;
    let i = 0; const { all } = H, a = us80(0);
    for (const [from, to, n] of groups) for (let k = 0; k < n; k++, i++) {
      const p = us80(from + (to - from) * (k + .5) / n), s = all[i];
      Object.assign(s, { x: p.x + (k % 3 - 1) * .5, z: p.z + (k % 2 ? 2 : -2), quiet: !!quietEvery && k % quietEvery === 0, tx: p.x, tz: p.z, next: k * .01, timer: 60, gaze: null, rouse: null, state: 0, alert: 0 });
      s.y = G.floorAt(s.x, s.z); s.tx = s.x; s.tz = s.z;
    }
    for (; i < all.length; i++) { const s = all[i], f = i % 2 ? 1 : -1; s.x = a.x + f * (900 + i); s.z = a.z + 500 + i; s.y = G.floorAt(s.x, s.z); s.tx = s.x; s.tz = s.z; s.quiet = true; }
    G.S.hp = 3; G.S.mode = 'town'; G.player.inv = 0; H.T.grabReach = 0; document.getElementById('fail').hidden = true;
  };
  // standing on the road at t along it, across it by so many metres, facing wherever
  window.stand = (t, across, yaw) => { const p = us80(t); G.place(p.x, p.z + across); G.player.yaw = yaw; G.look(yaw + Math.PI, .3); G.S.mode = 'town'; G.HP.speed = 0; };
  window.westYaw = (t) => { const a = us80(t), b = us80(t - .05); return Math.atan2(b.x - a.x, b.z - a.z); };
  window.flown = () => { for (let i = 0; i < 90 && G.lures.flying.some((f) => f.on); i++) G.step(1 / 30); };
  window.dist = (s, x, z) => Math.hypot(s.x - x, s.z - z);
  window.comes = (s) => s.state === 2 || s.state === 4 || (s.state === 8 && !s.rouse?.over);
  // stepped on for this long, noting who looks, who goes anywhere while they do, and who comes for him
  window.watch = (seconds, who = H.all) => {
    const r = { looked: new Set(), moved: 0, came: new Set(), start: new Map() };
    for (let t = 0; t < seconds; t += T) {
      G.sim(T, T);
      for (const s of who) {
        if (s.gaze) { if (!r.start.has(s)) r.start.set(s, [s.x, s.z]); r.looked.add(s); const [x, z] = r.start.get(s); r.moved = Math.max(r.moved, Math.hypot(s.x - x, s.z - z)); }
        if (comes(s)) r.came.add(s);
      }
    }
    return { looked: r.looked.size, moved: r.moved, came: r.came.size, who: r.looked };
  };
};
await g(setup);

// ---- the shoulder's got bottles on it, and he can pick one up
const found = await g(() => {
  const { LYING } = G.lures, a = G.map.fromTrue(-87.85 + 40 - 53, -31.1 + 24 - 10), b = LYING.filter((c) => c.kind === 'bottle').sort((p, q) => Math.hypot(p.x - a[0], p.z - a[1]) - Math.hypot(q.x - a[0], q.z - a[1]))[0];
  H.calm(); G.place(b.x + 3, b.z); G.step(.1);
  const seen = G.lures.lyingNear.includes(b), before = G.S.items.bottle ?? 0;
  G.key('w', true); let t = 0; while (t < 3 && !b.got) { G.look(Math.atan2(P().x - b.x, P().z - b.z)); G.sim(1 / 30, 1 / 30); t += 1 / 30; } G.key('w', false); G.step(.1);
  return { seen, before, after: G.S.items.bottle, got: b.got, bottles: LYING.filter((c) => c.kind === 'bottle').length, crackers: LYING.filter((c) => c.kind === 'crackers').length, c: document.getElementById('bC').textContent, hidden: document.getElementById('bC').hidden, pockets: document.getElementById('pockets').textContent };
});
check(`there are bottles lying about and firecrackers on shop steps: ${found.bottles} and ${found.crackers}`, found.bottles > 100 && found.crackers >= 5, found);
check('he walks over a bottle and has it', found.seen && found.got && found.after === found.before + 1, found);
check(`the button says so: ${found.c}, and so do his pockets: ${found.pockets}`, !found.hidden && /BOTTLE/.test(found.c) && /Bottles 1/i.test(found.pockets), found);

// ---- each of them, thrown along US 80 into a crowd of burnt-down ones, a quarter of whom have gone quiet
// Those near enough turn and look at it, for a few seconds or as long as the fire burns, and none of them walks over. The ones who've gone quiet don't care.
const things = [['bottle', 7], ['crackers', 8], ['fluid', 18]];
for (const [kind, looks] of things) {
  await g((kind) => {
    Object.assign(G.S.items, { bottle: 2, crackers: 2, fluid: 2 }); G.S.gas = 0; G.S.beans = 3; G.S.hand = kind;
    crowdOnRoad([[0, 1, 28]], 4);
    // 3 m clear of the end of the crowd, facing it, so what he throws goes the length of them
    stand(1.25, 0, westYaw(1.25)); G.step(.1);
  }, kind);
  const r = await g(() => ({ label: document.getElementById('bC').textContent, thrown: G.lures.thrownNow().kind }));
  await tap();
  const after = await g(([looks]) => {
    flown();
    const ev = H.looks.at(-1), burnt = H.all.filter((s) => s.quiet === false), quiet = H.all.filter((s) => s.quiet === true && dist(s, ev.x, ev.z) < 60);
    const expected = burnt.filter((s) => dist(s, ev.x, ev.z) < ev.r).length, near = burnt.filter((s) => s.gaze).length;
    const first = watch(looks - .5);
    const during = { gazing: burnt.filter((s) => s.gaze).length, quietLooking: quiet.filter((s) => s.gaze).length };
    G.sim(1.2, T);
    return { spot: [Math.round(ev.x), Math.round(ev.z)], reach: ev.r, expected, near, first: { looked: first.looked, moved: +first.moved.toFixed(3), came: first.came }, during, after: burnt.filter((s) => s.gaze).length, quiet: quiet.length, back: burnt.filter((s) => s.state === 0).length };
  }, [looks]);
  console.log(`     ${kind}: ${after.near} of the burnt-down ones within ${after.reach} m turned to look, for ${looks} s, and none went anywhere (${after.first.moved} m) or came for him`);
  check(`${kind}: he throws what the button says`, r.thrown === kind, r);
  check(`${kind}: the burnt-down ones within ${after.reach} m of where it came down turn to look at it: ${after.near} of ${after.expected}`, after.near === after.expected && after.expected >= 5, after);
  check(`${kind}: none of them walks over, or comes for him, and the ones who've gone quiet don't look, out of ${after.quiet}`, after.first.moved < .01 && after.first.came === 0 && after.during.quietLooking === 0, after);
  check(`${kind}: and when it's over ${kind === 'fluid' ? 'and the fire is out' : 'a few seconds later'} they're back to what they were doing`, after.after === 0, after);
  await snap(`thrown-${kind}`);
}

// ---- the ones already after him aren't interested: a bottle comes down among them and they keep coming
const hunted = await g(() => {
  Object.assign(G.S.items, { bottle: 2 }); G.S.hand = 'bottle';
  crowdOnRoad([]);
  stand(1.25, 0, westYaw(1.25)); G.step(.1);
  const hunters = H.all.slice(0, 3);
  hunters.forEach((s, i) => { const p = us80(1.25 - (7 + i * 2) / 40); Object.assign(s, { x: p.x, z: p.z + (i - 1) * 2, state: 2, alert: 1, quiet: false, knows: 1e9, lost: 0, rank: 0 }); s.y = G.floorAt(s.x, s.z); s.tx = P().x; s.tz = P().z; });
  window.hunters = hunters;
  return hunters.map((s) => s.state);
});
await tap();
const hunted2 = await g(() => { flown(); const w = watch(2, hunters); return { states: hunters.map((s) => s.state), gaze: hunters.filter((s) => s.gaze).length, closer: hunters.map((s) => +dist(s, P().x, P().z).toFixed(1)) }; });
check('three already after him are not interested in a bottle that comes down among them, and keep coming', hunted.every((st) => st === 2) && hunted2.states.every((st) => st === 2) && hunted2.gaze === 0, { hunted, hunted2 });

// ---- slipping past one: it's standing 3 m off the road with him a dozen metres short of it, and walking at it at the stick's full pace, without a throw it notices him, stops and turns to him,
// and with one it's looking at that until he's by and well out of earshot. It comes down past the one he's after, since a throw goes as far as it goes when there's nothing to aim at.
await g(() => {
  // how far off he is from the one he's after, by what he throws, and how far each thing goes
  window.OFF = { bottle: 12, crackers: 10, fluid: 8 };
  window.RANGE = { bottle: 20.4, crackers: 14.3, fluid: 12.6 };
  window.slip = (kind, throws) => {
    crowdOnRoad([]);
    const D = OFF[kind], ts = 1.2, tz = ts - D / 40, p = us80(tz), one = H.all[0];
    Object.assign(one, { x: p.x + p.nx * 3, z: p.z + p.nz * 3, quiet: false, state: 0, alert: 0, lost: 0, sus: 0, rouse: null, gaze: null, timer: 60 }); one.y = G.floorAt(one.x, one.z); one.tx = one.x; one.tz = one.z;
    Object.assign(G.S.items, { bottle: 1, crackers: 1, fluid: 1 }); G.S.hand = kind; stand(ts, 0, westYaw(ts)); G.step(.1);
    const out = { D, roused: false, looked: false, closest: Infinity, state: null, kind: null, added: null, past: +(RANGE[kind] - D).toFixed(1) }, before = screenText();
    if (throws) { G.key('q', true); G.sim(T, T); G.key('q', false); flown(); out.looked = !!one.gaze; }
    // and then he walks on along the road, as fast as the stick goes, until he's well out of earshot on the far side of it. How long that took is how long it's got to look.
    const far = us80(tz - 1), ahead = [us80(tz).x - us80(ts).x, us80(tz).z - us80(ts).z];
    for (let t = 0; t < 14; t += T) {
      const dx = far.x - P().x, dz = far.z - P().z, l = Math.hypot(dx, dz) || 1;
      G.look(Math.atan2(-dx / l, -dz / l), .3); G.stick(0, 1); G.sim(T, T);
      out.closest = Math.min(out.closest, dist(one, P().x, P().z));
      if (one.state === 8 || one.state === 2) {
        if (!out.roused) { out.at = +t.toFixed(1); out.kind = G.roused.log.at(-1)?.kind ?? null; out.added = screenText().filter((l) => !before.includes(l)); out.whyBox = !!document.getElementById('why'); }
        out.roused = true;
      }
      if (dist(one, P().x, P().z) > 20 && (P().x - one.x) * ahead[0] + (P().z - one.z) * ahead[1] > 0) { out.free = +t.toFixed(1); break; }
    }
    G.stick(0, 0); out.state = one.state;
    return out;
  };
});
for (const [kind] of things) {
  const without = await g((k) => slip(k, false), kind), withIt = await g((k) => slip(k, true), kind);
  console.log(`     ${kind}: without it, one stood 3 m off the road with him ${without.D} m short of it stops and turns to him after ${without.at} s (it was his ${without.kind}); with it, it looks at where it came down ${withIt.past} m past it, he passes within ${withIt.closest.toFixed(1)} m and is clear of earshot in ${withIt.free} s, and it ${withIt.roused ? `stops and turns to him after ${withIt.at} s` : 'never does'}`);
  check(`${kind}: walking at one it notices him, stops and turns to him, and nothing on the screen says why`, without.roused && /^(steps|close)$/.test(without.kind ?? '') && without.added.length === 0 && !without.whyBox && without.at < 3, without);
  check(`${kind}: but with it thrown past it, it looks at that, and he walks by within ${withIt.closest.toFixed(1)} m and out of earshot, and it doesn't notice him`, withIt.looked && withIt.past > 2 && !withIt.roused && withIt.closest < 4.5 && withIt.free !== undefined, withIt);
}
await snap('through');

// ---- a car alarm, from across a lot. It draws nobody: it's noise, like a crash, and the burnt-down ones who can hear it are roused, the nearest three, and come for him and not for the car
const lot = await g(() => {
  crowdOnRoad([]);
  const loc = (x, z) => G.map.fromTrue(-87.85 + x - 53, -31.1 + z - 10), truck = G.lures.VEHICLES.filter((v) => v.kind === 'pickup').sort((a, b) => { const [x, z] = loc(60.8, 9.2); return Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z); })[0];
  G.S.items.bottle = 2; G.S.hand = 'bottle';
  const free = (x, z) => !G.blocked(x, z, G.floorAt(x, z) + .5) && G.floorAt(x, z) > G.water.level(x, z) + .3;
  const open = (a, b, h) => { for (let f = .08; f < .95; f += .08) if (G.blocked(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, G.floorAt(a[0], a[1]) + h)) return false; return true; };
  const car = [truck.x, truck.z], angleAt = (m, p) => { const u = [car[0] - m[0], car[1] - m[1]], v = [p[0] - m[0], p[1] - m[1]]; return Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))); };
  // him 16 m from the truck with a clear throw at it, and twelve burnt-down ones 16 to 40 m from it, a long way from him and at the widest angle to him from the truck that fits, so that
  // coming for him and coming for the car are two different ways to walk
  let best = null;
  for (let ap = 0; ap < 6.28; ap += .26) {
    const him = [car[0] + Math.cos(ap) * 16, car[1] + Math.sin(ap) * 16];
    if (!free(...him) || !open(him, car, 1.7)) continue;
    for (let ac = 0; ac < 6.28; ac += .26) {
      const crowd = [];
      for (let r = 16; r < 40 && crowd.length < 12; r += 2) for (let d = -.3; d <= .31 && crowd.length < 12; d += .1) {
        const rr = r + crowd.length * .21, x = car[0] + Math.cos(ac + d) * rr, z = car[1] + Math.sin(ac + d) * rr;
        if (free(x, z) && Math.hypot(x - him[0], z - him[1]) > 14) crowd.push([x, z]);
      }
      if (crowd.length < 12) continue;
      const mid = [crowd.reduce((n, c) => n + c[0], 0) / 12, crowd.reduce((n, c) => n + c[1], 0) / 12];
      if (!open(mid, him, 1)) continue;
      const a = angleAt(mid, him);
      if (!best || a > best.a) best = { him, crowd, a };
    }
  }
  const { him, crowd } = best, yaw = Math.atan2(truck.x - him[0], truck.z - him[1]) + .12;
  G.place(...him); G.player.yaw = yaw; G.look(yaw + Math.PI, .25); G.S.mode = 'town'; G.step(.1);
  // every fourth of them has gone quiet, and the ones who've gone quiet have nothing against him
  crowd.forEach(([x, z], i) => { const s = H.all[i]; Object.assign(s, { x, z, quiet: i % 4 === 3, tx: x, tz: z, next: i * .01, timer: 60, state: 0, alert: 0, lost: 0, rouse: null, gaze: null }); s.y = G.floorAt(x, z); });
  window.truck = truck; window.him = him; window.crowd12 = H.all.slice(0, 12); window.from = crowd12.map((s) => [s.x, s.z]);
  return { kind: truck.kind, can: G.lures.canAlarm(truck), n: crowd.length, angle: +(best.a * 180 / Math.PI).toFixed(0), far: crowd.map(([x, z]) => Math.round(Math.hypot(x - truck.x, z - truck.z))), throwAt: Math.round(Math.hypot(him[0] - truck.x, him[1] - truck.z)) };
});
check(`there's a truck with an alarm in it, ${lot.throwAt} m from him, and a crowd ${lot.far[0]} to ${lot.far.at(-1)} m from it at ${lot.angle}° between it and him`, lot.can && lot.n === 12 && lot.angle >= 35, lot);
await tap();
const alarm = await g(() => {
  // what's on the screen before it comes down on the truck, to see what the alarm and the three stopping and turning to him put on it
  const before = screenText();
  flown();
  const went = G.lures.ALARMS.some((a) => a.v === truck), glow = () => G.lures.glows.filter((o) => o.visible).length;
  const burnt = crowd12.filter((s) => s.quiet === false), quiet = crowd12.filter((s) => s.quiet === true);
  const nearest = burnt.slice().sort((a, b) => dist(a, truck.x, truck.z) - dist(b, truck.x, truck.z)).slice(0, 3);
  // five seconds of it, a frame at a time: who stops and turns to him, who only looks up, how many are after him at once, and where the three go once they're on their way
  const stood = new Set(), looked = new Set(), shown = new Set(), began = new Map(); let peak = 0, odd = 0, added = null;
  for (let t = 0; t < 5; t += T) {
    G.step(T, T); shown.add(glow());
    let after = 0;
    for (const s of burnt) {
      if (comes(s)) after++;
      if (s.state === 8) (s.rouse.over ? looked : stood).add(s);
      if (s.state === 2 && !began.has(s)) began.set(s, { p0: [s.x, s.z], t0: t });
      const b = began.get(s); if (b && !b.p1 && t - b.t0 >= 1.5) b.p1 = [s.x, s.z];
    }
    peak = Math.max(peak, after);
    for (const s of quiet) if (s.state !== 0 || s.gaze) odd++;
    // what's new on the screen once the first of them has stopped and turned to him
    if (!added && stood.size) added = screenText().filter((l) => !before.includes(l));
  }
  const noted = G.roused.log.map((l) => l.kind), whyBox = !!document.getElementById('why'), deg = (u, v) => Math.round(Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))) * 180 / Math.PI);
  const head = [...began.values()].filter((b) => b.p1).map((b) => { const m = [b.p1[0] - b.p0[0], b.p1[1] - b.p0[1]]; return { moved: +Math.hypot(...m).toFixed(1), toHim: deg(m, [him[0] - b.p0[0], him[1] - b.p0[1]]), toCar: deg(m, [truck.x - b.p0[0], truck.z - b.p0[1]]) }; });
  // it's noise for its first 5 seconds and no more, but he hears it for all of it, fainter the further off he is, and its lights go on for all of it
  G.sim(1, T); const heard = { noisy: H.noises.some((e) => e.kind === 'alarm'), lit: G.lures.ALARMS.length };
  const level = () => { G.step(T, T); return G.sound.state().loopLevels['vehicle.alarm'] ?? 0; }, back = [G.player.pos.x, G.player.pos.z];
  const ux = (back[0] - truck.x) / Math.hypot(back[0] - truck.x, back[1] - truck.z), uz = (back[1] - truck.z) / Math.hypot(back[0] - truck.x, back[1] - truck.z);
  const at = (d) => { G.place(truck.x + ux * d, truck.z + uz * d); return level(); };
  heard.loud = { 20: at(20), 60: at(60), 170: at(170) }; G.place(...back); G.step(T, T);
  // and the rest of it, to see it run down at 30 s
  G.sim(23, T); heard.late = level(); G.sim(2, T); G.step(.5);
  return { heard, went, flashed: shown.has(0) && [...shown].some((n) => n > 0), burnt: burnt.length, stood: stood.size, theNearest: nearest.every((s) => stood.has(s)), looked: looked.size, peak, noted, added, whyBox, head, quiet: quiet.length, odd, after: G.lures.ALARMS.length, glowsAfter: glow(), again: G.lures.canAlarm(truck) };
});
check('a bottle thrown at it sets it off, from across the lot', alarm.went, alarm);
check('its lights go on and off', alarm.flashed, alarm);
check(`it rouses the nearest three of the ${alarm.burnt} burnt-down ones who can hear it: they stop and turn to him, and the other ${alarm.looked} only look up and go back`, alarm.stood === 3 && alarm.theNearest && alarm.looked === alarm.burnt - 3, alarm);
check(`no more than three are after him at once, however loud: ${alarm.peak}`, alarm.peak === 3, alarm);
check('the three were woken by the alarm, and nothing on the screen says why: no new line when they stopped, and nothing in the page to write one in', alarm.noted.length === 3 && alarm.noted.every((k) => k === 'alarm') && alarm.added?.length === 0 && !alarm.whyBox, alarm);
check(`and they come for him and not for the car: ${alarm.head.map((h) => `${h.toHim}° off him against ${h.toCar}° off the car`).join(', ')}`, alarm.head.length === 3 && alarm.head.every((h) => h.moved > 2.5 && h.toHim < h.toCar - 10), alarm);
check(`and not one of the ${alarm.quiet} who've gone quiet stops, looks or comes for it, in any frame of the five seconds`, alarm.quiet === 3 && alarm.odd === 0, alarm);
check('it\'s only noise for its first 5 seconds, while it carries on going off and its lights keep going', !alarm.heard.noisy && alarm.heard.lit === 1, alarm);
check(`he hears it the whole time, fainter further off: ${alarm.heard.loud[20].toFixed(2)} at 20 m, ${alarm.heard.loud[60].toFixed(2)} at 60 m and ${alarm.heard.loud[170]} at 170 m`, alarm.heard.loud[20] > alarm.heard.loud[60] * 1.5 && alarm.heard.loud[60] > 0 && alarm.heard.loud[170] === 0 && alarm.heard.late > 0, alarm.heard);
check('and it runs down after 30 s, and doesn\'t go again', alarm.after === 0 && alarm.glowsAfter === 0 && !alarm.again, alarm);
const hammer = await g(() => {
  crowdOnRoad([]);
  const parked = G.lures.VEHICLES.find((v) => v.kind === 'car' && G.lures.canAlarm(v) && Math.hypot(v.x - truck.x, v.z - truck.z) > 20 && Math.hypot(v.x - truck.x, v.z - truck.z) < 900);
  const yaw = Math.sin(parked.yaw), fx = Math.cos(parked.yaw), side = 1.9, x = parked.x + fx * side, z = parked.z - yaw * side;
  G.place(x, z); G.player.yaw = Math.atan2(parked.x - x, parked.z - z); G.S.mode = 'town'; G.step(.1);
  G.key('f', true); G.step(.05); G.key('f', false); G.step(.6);
  const on = G.lures.ALARMS.some((a) => a.v === parked), golf = G.lures.VEHICLES.find((v) => v.kind === 'golf');
  return { on, golf: G.lures.canAlarm(golf) };
});
check('so does a hammer, on a keyboard, and a golf cart hasn\'t got one', hammer.on && !hammer.golf, hammer);
await g(() => { const G = __game; G.step(16); });

// ---- into the river: nobody follows a bottle into the water, and the bottle doesn't make them look either
const river = await g(() => {
  crowdOnRoad([]);
  const isWet = (x, z) => G.floorAt(x, z) < G.water.level(x, z) - .1, dry = (x, z) => G.floorAt(x, z) > G.water.level(x, z) + .2 && !G.blocked(x, z, G.floorAt(x, z) + .1);
  // somewhere in the river, well away from any bridge and as near town as that can be, and a place on the bank a bottle's throw from it
  const [tx, tz] = G.map.fromTrue(0, 0), bridges = G.map.crossings.filter((k) => k.with === 'river');
  const places = G.map.river.flat().filter(([x, z]) => G.map.inBounds(x, z) && Math.hypot(x, z) > 300 && bridges.every((k) => Math.hypot(k.x - x, k.z - z) > 90)).sort((p, q) => Math.hypot(p[0] - tx, p[1] - tz) - Math.hypot(q[0] - tx, q[1] - tz));
  let spot = null, bank = null;
  for (const [x, z] of places) {
    if (bank) break;
    if (!isWet(x, z) || G.floorAt(x, z) > G.water.level(x, z) - .6) continue;
    for (let b = 0; b < 6.28 && !bank; b += .2) { const bx = x + Math.cos(b) * 14, bz = z + Math.sin(b) * 14; if (dry(bx, bz)) { let clear = true; for (let f = .1; f < .9; f += .1) if (G.blocked(bx + (x - bx) * f, bz + (z - bz) * f, 8)) clear = false; if (clear) { spot = { x, z }; bank = { x: bx, z: bz }; } } }
  }
  const yaw = Math.atan2(spot.x - bank.x, spot.z - bank.z);
  G.place(bank.x, bank.z); G.player.yaw = yaw; G.look(yaw + Math.PI, .3); G.S.mode = 'town'; G.S.items.bottle = 2; G.S.hand = 'bottle';
  // ten burnt-down ones on the banks, near enough to it to look, if it were on the ground, and not too close to him
  const crowd = H.all.slice(0, 10); let i = 0;
  for (let r = 6; r < 20 && i < 10; r += 2) for (let a = 0; a < 6.28 && i < 10; a += .5) { const x = spot.x + Math.cos(a) * r, z = spot.z + Math.sin(a) * r; if (!dry(x, z) || Math.hypot(x - bank.x, z - bank.z) < 8) continue; const s = crowd[i++]; Object.assign(s, { x, z, quiet: false, tx: x, tz: z, next: i * .01, timer: 60 }); s.y = G.floorAt(x, z); }
  window.wetCrowd = crowd.slice(0, i); window.spot = spot; G.step(.1);
  return { placed: i };
});
await tap();
const swim = await g(() => {
  const was = H.all.length; flown();
  const landed = G.lures.flying.length ? null : true, wet = (s) => G.floorAt(s.x, s.z) < G.water.level(s.x, s.z) - .1;
  let wentIn = 0, under = 0, looked = 0, came = 0;
  for (let t = 0; t < 40; t += T) { G.sim(T, T); for (const s of wetCrowd) { if (wet(s)) wentIn++; if (s.under !== undefined) under++; if (s.gaze) looked++; if (comes(s)) came++; } }
  return { placed: wetCrowd.length, wentIn, under, looked, came, same: H.all.length === was, landed };
});
check(`a bottle in the river and nobody follows it in, or is bitten, or even turns to look: ${swim.placed} of them within reach of it for 40 s`, swim.placed >= 5 && swim.wentIn === 0 && swim.under === 0 && swim.looked === 0 && swim.same, swim);

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

// ---- switching: no beans in it, however many he has
const sw = await g(() => { crowdOnRoad([]); Object.assign(G.S.items, { bottle: 1, crackers: 1, fluid: 0 }); G.S.gas = 0; G.S.beans = 12; G.S.hand = 'bottle'; G.S.mode = 'town'; G.step(.1); return { n: !document.getElementById('bN').hidden, c: document.getElementById('bC').textContent }; });
await tap('#bN');
const sw2 = await g(() => { G.step(.1); return { c: document.getElementById('bC').textContent }; });
await tap(); await g(() => { __game.lures.flying.forEach(() => {}); __game.step(1.5); });
const sw3 = await g(() => { G.step(.1); return { n: !document.getElementById('bN').hidden, c: document.getElementById('bC').textContent, hand: G.lures.thrownNow()?.kind }; });
check(`SWAP goes from ${sw.c} to ${sw2.c}, and when that's gone he's back to what's left, with twelve cans of beans in his pockets that are never in it`, sw.n && /BOTTLE/.test(sw.c) && /CRACKERS/.test(sw2.c) && /BOTTLE/.test(sw3.c) && !sw3.n, { sw, sw2, sw3 });
await tap(); await g(() => __game.step(1.5));
const none = await g(() => ({ hidden: document.getElementById('bC').hidden, thrown: G.lures.thrownNow(), beans: G.S.beans }));
check('with nothing left the button goes, though he still has twelve cans of beans', none.hidden && none.thrown === null && none.beans === 12, none);

// ---- what it costs, at the worst of it
const cost = await g(() => {
  Object.assign(G.S.items, { bottle: 4, crackers: 4, fluid: 2 }); crowdOnRoad([[0, 1, 48]], 3); G.S.hand = 'crackers'; stand(1.25, 0, westYaw(1.25)); G.step(.5);
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
  check('no console errors', errors.length === 0, errors);
  await close();
}
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
