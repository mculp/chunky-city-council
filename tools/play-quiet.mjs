// Goes among the ones who've gone quiet, on a phone-sized page with the stick and real taps: how many have burnt down and how far gone those look, walking through
// 30 of them on US 80 with only the burnt ones coming for him, the rest folded over at the waist with their arms hanging, a swing bringing the one he hit and everyone
// close by and nobody further off, a bottle thrown at one, a can picked up from at one's feet and one that isn't, the ones who come for him stood up and the ones who
// come low and quick, what they mutter when he's close, the same again with reduced motion, and what 30 of them cost.
//
//   npm i && npm run quiet [-- --shots dir]
import { mkdirSync, readFileSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const LINES = JSON.parse(readFileSync(new URL('../data/folks.json', import.meta.url), 'utf8')).mutters;
let failed = 0;
const comes = (st) => st >= 2 && st <= 4;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };

// the same town on every page: Chapter 1 over, the crowd out, and these
const helpers = () => {
  const G = __game; G.pause(); G.jump('town'); G.S.flags.town = true; G.S.flags.ended = G.S.flags.arrived = true; G.step(.1);
  document.getElementById('card').style.display = 'none';
  G.bringOutCrowd();
  window.G = G; window.H = G.horde; window.F = G.folks; window.T = 1 / 30; window.P = () => G.player.pos;
  // 80 m of US 80 west of town, running east from t = 0
  const a0 = G.map.sOn('us_80', ...G.map.fromTrue(-600, -20)), a1 = a0 + Math.sign(G.map.sOn('us_80', ...G.map.fromTrue(-500, -21)) - a0) * 80;
  window.us80 = (t) => G.map.along('us_80', a0 + (a1 - a0) * t);
  window.tOf = (x, z) => (G.map.sOn('us_80', x, z) - a0) / (a1 - a0);
  window.land = () => { G.S.mode = 'town'; G.HP.kind = 'run'; G.player.vy = 0; G.player.grounded = true; G.player.inv = 0; G.player.kb.set(0, 0); G.S.hp = 3; document.getElementById('fail').hidden = true; };
  // who came out gone quiet, and who came out burnt down
  window.quiet = H.all.filter((s) => s.quiet === true);
  window.burnt = H.all.filter((s) => s.quiet === false);
  window.boldness = (s) => s.who.nerve + (s.who.temper - .5) * .4;
  // stood where they're put, with nothing on their mind
  window.put = (s, x, z) => Object.assign(s, { x, z, tx: x, tz: z, homeX: x, homeZ: z, y: G.floorAt(x, z), state: 0, alert: 0, sus: 0, timer: 2, lead: null, moving: 0, flat: 0, started: false, knows: 0, lost: 0, mutterNext: 0 });
  // and kept there, looking about, for anything that has to find them where they were put
  window.hold = (s) => Object.assign(s, { state: 1, timer: 60, tx: s.x, tz: s.z });
  // halfway along the road and facing along it, nobody near him and nobody remembering anything
  window.mid = () => { const p = us80(.5), q = us80(.51); return { x: p.x, z: p.z, yaw: Math.atan2(q.x - p.x, q.z - p.z) }; };
  window.clear = ({ x, z, yaw } = mid()) => {
    F.forget(); H.calm(); H.noises.length = 0; G.S.beans = 0;
    const far = us80(0); H.all.forEach((s, i) => put(s, far.x + (i % 2 ? 1 : -1) * (900 + i), far.z + 500 + i));
    land(); G.place(x, z); G.player.yaw = yaw; G.look(yaw + Math.PI, .3); G.stick(0, 0); G.sim(T, T);
  };
  // d metres from him, turned a from straight ahead
  window.ahead = (s, d, a = 0) => { const yaw = G.player.yaw + a; return put(s, P().x + Math.sin(yaw) * d, P().z + Math.cos(yaw) * d); };
  window.dist = (s, x = P().x, z = P().z) => Math.hypot(s.x - x, s.z - z);
  window.coming = (s) => s.state >= 2 && s.state <= 4;
  // what's being muttered, and how far it's risen above the head it's over
  window.mutter = () => {
    const m = G.mutters()[0]; if (!m) return null;
    const s = H.all.find((o) => o.who?.id === m.id), up = G.hills.skyline.visible ? G.hills.at(s.x, s.z) - G.hills.here() : 0;
    const v = new G.THREE.Vector3(s.x + s.hdx, s.y + s.hdy + up + .1, s.z + s.hdz).project(G.camera);
    return { ...m, rise: (-v.y * .5 + .5) * innerHeight - +/translate\([-\d.]+px,\s*([-\d.]+)px\)/.exec(m.transform)[1] };
  };
};

const page1 = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
let { page, errors } = page1;
let g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); };
const tap = async (id) => { await page.tap(id); await g(() => __game.sim(1 / 30, 1 / 30)); };
await g(helpers);

// ---- who's burnt down
const who = await g(() => {
  // two of them and four who've gone quiet in a row in front of him, to see how far gone they look
  clear(); const row = [burnt[0], quiet[0], burnt[1], quiet[1], quiet[2], quiet[3]];
  row.forEach((s, i) => ahead(s, 7, (i - 2.5) * .16)); G.step(.6, T);
  return { burnt: burnt.length, quiet: quiet.length, line: G.crowd().line, far: row.map((s) => ({ burnt: s.quiet === false, far: s.far })) };
});
await snap('1-burnt-and-quiet');
check(`about one in fifteen of them have burnt down: ${who.burnt} of ${who.burnt + who.quiet}`, who.burnt >= 2 && who.burnt / (who.burnt + who.quiet) > .03 && who.burnt / (who.burnt + who.quiet) < .13, who);
const bf = who.far.filter((r) => r.burnt).map((r) => r.far), qf = who.far.filter((r) => !r.burnt).map((r) => r.far);
check(`and they're the furthest gone, ${bf.map((f) => f.toFixed(2)).join(' and ')} against ${qf.map((f) => f.toFixed(2)).join(', ')}`, bf.every((f) => f >= who.line) && Math.min(...bf) > Math.max(...qf), who);

// ---- through 30 of them
await g(() => {
  // 28 who've gone quiet and the two who've burnt down a third and two thirds of the way along, either side of the road, 3 to 6 m off its middle
  const p = us80(-.06); clear({ x: p.x, z: p.z, yaw: mid().yaw });
  window.lot = [...quiet.slice(4, 13), burnt[0], ...quiet.slice(13, 23), burnt[1], ...quiet.slice(23, 32)];
  lot.forEach((s, i) => { const q = us80((i + .5) / lot.length), side = i % 2 ? 1 : -1, off = 3 + (i % 3) * 1.5; put(s, q.x + q.nx * side * off, q.z + q.nz * side * off); });
  // nobody gets hold of him here, and anyone who's come for him is taken out of his way once they have
  H.T.grabReach = 0;
  window.walk = { came: [], quietCame: 0, closest: 99, end: 0 };
  // the way a player would go: along the road, and around anyone gone quiet
  window.cross = (seconds) => {
    for (let i = 0; i < seconds * 5 && tOf(P().x, P().z) < 1.04; i++) {
      const here = tOf(P().x, P().z), p = us80(here), q = us80(here + .06);
      let dx = q.x - P().x + (p.x - P().x) * .3, dz = q.z - P().z + (p.z - P().z) * .3; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      for (const s of lot) { if (!s.quiet) continue; const ax = P().x - s.x, az = P().z - s.z, d = Math.hypot(ax, az); if (d < 6 && d > .01) { dx += ax / d * (6 - d) / 2.5; dz += az / d * (6 - d) / 2.5; } }
      G.look(Math.atan2(-dx, -dz), .3); G.stick(0, 1); G.sim(.2, T);
      for (const s of lot) {
        if (s.quiet) { walk.closest = Math.min(walk.closest, dist(s)); if (coming(s)) walk.quietCame++; }
        else if (coming(s) && !walk.came.includes(s)) { walk.came.push(s); put(s, P().x + 600, P().z + 600); }
      }
    }
    G.stick(0, 0); walk.end = tOf(P().x, P().z);
    return { ...walk, came: walk.came.length };
  };
  G.step(.6, T);
});
// as drawn: the angle at their hips, which their steps tip a few degrees either way with a limp, and how far off the ground their heads and hands are
const idle = await g(() => lot.filter((s) => s.quiet && s.state === 0 && G.stance(s)).map((s) => ({ number: Math.round(s.hips), ...G.stance(s), arm: s.arm })));
await snap('2-folded-on-us-80');
const bent = idle.map((r) => r.hips);
check(`the ones who've gone quiet stand folded over at the waist, each their own way, from ${Math.min(...bent).toFixed(0)}° to ${Math.max(...bent).toFixed(0)}° at the hips, with their arms hanging or their hands on the ground: ${idle.length} of them`, idle.length >= 8 && Math.max(...bent) - Math.min(...bent) > 30 && idle.every((r) => r.hips > 38 && r.hips < 156 && r.head > 0 && r.hands > 0 && r.arm < .35), idle);
let through;
for (let i = 0; i < 12; i++) {
  through = await g(() => { const r = cross(4); G.step(.05, T); return r; });
  if (i === 1) await snap('3-through-them');
  if (through.end >= 1.04) break;
}
check(`he walks all the way through 30 of them, never closer than ${through.closest.toFixed(1)} m to one, and none of the 28 who've gone quiet comes for him`, through.end > 1 && through.quietCame === 0 && through.closest > .7, through);
check(`and both of the ones who've burnt down do: ${through.came}`, through.came === 2, through);

// ---- a swing
const swing = await g(() => {
  clear();
  // someone bold enough to come for him once he's hit them, right in front of him. Four more within 10 m of that who'd come for him over it, two of whom come low,
  // and someone the kind to keep out of his way. Three more a long way further off than anyone who'd have seen it.
  const used = [], pick = (ok) => { const s = quiet.find((o) => !used.includes(o) && ok(o)); used.push(s); return s; };
  window.hit = hold(ahead(pick((s) => s.who.nerve > .7), 1.1));
  window.near = [[true, 4, -.6], [false, 6, .7], [true, 7.5, .5], [false, 9, -.4]].map(([low, d, a]) => ahead(pick((s) => !!s.scuttle === low && boldness(s) > .3), d, a));
  window.timid = ahead(pick((s) => boldness(s) < .2), 6, 1.3);
  window.further = [[22, 0], [26, .15], [30, -.15]].map(([d, a]) => ahead(pick(() => true), d, a));
  G.step(.3, T);
  return { near: near.map((s) => dist(s, hit.x, hit.z).toFixed(1)), further: further.map((s) => dist(s, hit.x, hit.z).toFixed(1)) };
});
await tap('#bA');
let r = await g(() => { G.sim(.5, T); G.step(.4, T); return { hit: hit.state, down: hit.flat > 0, near: near.map((s) => s.state), timid: timid.state, further: further.map((s) => s.state), leans: near.map((s) => ({ low: !!s.scuttle, lean: s.lean })) }; });
await snap('4-swing');
check(`a swing puts the one he hit down`, r.down && r.hit === 5, r);
check(`and the ${r.near.length} who've gone quiet within 10 m of it come for him (${swing.near.join(', ')} m off)`, r.near.every((st) => st >= 2 && st <= 4), { ...r, ...swing });
check('except someone the kind to keep out of his way, who does', r.timid === 6, r);
check(`and nobody further off (${swing.further.join(', ')} m) comes for him`, r.further.every((st) => st <= 1), { ...r, ...swing });
const lows = r.leans.filter((l) => l.low).map((l) => l.lean), ups = r.leans.filter((l) => !l.low).map((l) => l.lean);
check(`some come for him stood up, leaning ${ups.map((l) => l.toFixed(2)).join(' and ')}, and some folded over and low, ${lows.map((l) => l.toFixed(2)).join(' and ')}`, ups.every((l) => l < .5) && lows.every((l) => l > .9), r.leans);
r = await g(() => { const was = dist(hit); while (H.down(hit) > 0) G.sim(T, T); G.sim(1, T); return { state: hit.state, was, now: dist(hit) }; });
check(`the one he hit gets up and comes for him: from ${r.was.toFixed(1)} m to ${r.now.toFixed(1)} m`, r.state >= 2 && r.state <= 4 && r.now < r.was, r);

// ---- low and quick
r = await g(() => {
  clear();
  const lows = quiet.filter((s) => s.scuttle).slice(0, 3), ups = quiet.filter((s) => !s.scuttle).slice(0, 3), all = [...lows, ...ups];
  all.forEach((s, i) => ahead(s, 26, (i - 2.5) * .1));
  // set off the way they would if he'd picked up what was at their feet. Six of them together come for him as a swarm, the low ones and the others alike.
  for (const s of all) H.provoke(s, 'took');
  G.step(1, T);
  const from = all.map((s) => dist(s));
  G.step(1.5, T);
  const pace = all.map((s, i) => (from[i] - dist(s)) / 1.5), mean = (a) => a.reduce((n, v) => n + v, 0) / a.length;
  return { low: mean(pace.slice(0, 3)), up: mean(pace.slice(3)), states: all.map((s) => s.state), leans: all.map((s) => +s.lean.toFixed(2)) };
});
await snap('5-low-and-quick');
check(`and the low ones come quicker: ${r.low.toFixed(2)} m/s against ${r.up.toFixed(2)} m/s, which is still slower than he runs`, r.low > r.up * 1.04 && r.low < 4.4 && r.states.every((st) => st === r.states[0] && comes(st)), r);

// ---- a bottle
const fall = await g(() => {
  // where a bottle thrown from here comes down, with nobody about
  clear(); G.S.items.bottle = 2; G.S.hand = 'bottle'; G.step(.05, T);
  return true;
});
await tap('#bC');
const path = await g(() => {
  const f = G.lures.flying.find((t) => t.on), pts = [];
  for (let i = 0; i < 120 && f?.on; i++) { pts.push({ x: f.x, y: f.y, z: f.z, vy: f.vy }); G.sim(T, T); }
  // the first place on its way down that it's low enough to hit someone
  return pts.find((p) => p.vy < 0 && p.y < G.floorAt(p.x, p.z) + 1.5) ?? null;
});
check('a bottle thrown from a phone flies and comes down', fall && !!path, path);
if (path) {
r = await g((p) => {
  clear(); G.S.items.bottle = 2; G.S.hand = 'bottle';
  // someone bold enough where it'll come down, one more 4 m to the side of them and one 24 m past them
  window.target = hold(put(quiet.find((s) => s.who.nerve > .7), p.x, p.z));
  const fx = Math.sin(G.player.yaw), fz = Math.cos(G.player.yaw);
  window.by = put(quiet.find((s) => s !== target && boldness(s) > .3), p.x + fz * 4, p.z - fx * 4);
  window.off = put(quiet.find((s) => s !== target && s !== by && boldness(s) > .3), p.x + fx * 24, p.z + fz * 24);
  G.step(.05, T);
  return { from: dist(target) };
}, path);
await tap('#bC');
r = await g(() => { G.sim(1.5, T); return { target: target.state, mood: F.mood(target.who), by: by.state, off: off.state, gone: dist(target) }; });
check(`a bottle thrown at one who's gone quiet brings them, and someone close by who saw it, and nobody further off`, comes(r.target) && comes(r.by) && r.off <= 1, r);
}

// ---- a can at their feet
const can = await g(() => {
  clear();
  window.can = G.pickups.find((c) => !c.got);
  // three metres in front of him, with one of them three metres past it
  window.setCan = () => { const yaw = G.player.yaw, x = P().x + Math.sin(yaw) * 3, z = P().z + Math.cos(yaw) * 3; Object.assign(can, { x, z, y: G.floorAt(x, z) + .3, got: false }); can.m.position.set(can.x, can.y + .2, can.z); can.m.visible = true; };
  window.byCan = (d) => put(quiet.find((s) => boldness(s) > .3), can.x + Math.sin(G.player.yaw) * d, can.z + Math.cos(G.player.yaw) * d);
  window.walkOn = () => { let t = 0; G.look(G.player.yaw + Math.PI, .3); G.stick(0, 1); while (!can.got && t < 4) { G.sim(.1, T); t += .1; } G.stick(0, 0); G.sim(.6, T); return { got: can.got, t }; };
  setCan(); window.near1 = byCan(3);
  return !!can;
});
r = await g(() => ({ ...walkOn(), state: near1.state }));
check('picking up a can that\'s three metres from one of them starts nothing', r.got && r.state <= 1, r);
r = await g(() => { clear(); setCan(); window.atFeet = hold(byCan(.8)); window.off = ahead(quiet.find((o) => o !== atFeet), 24, .4); return true; });
await g(() => { G.step(.3, T); });
await snap('6-at-their-feet');
r = await g(() => ({ ...walkOn(), state: atFeet.state, off: off.state }));
check('picking one up from right at their feet brings them, and nobody further off', r.got && comes(r.state) && r.off <= 1, r);

// ---- muttering
// a picture taken while it's being said
const mutters = async (name) => {
  const said = await g(() => {
    // anything still being said from before over with first, since nothing's said in a sim and it's left up
    clear(); G.step(3.4, T);
    // then one of them stood 4 m off, a little to one side so he's not in the way
    const s = window.mutterer = hold(ahead(quiet.find((o) => o.who.says), 4, .3));
    // and known to him, so the panel with their name is over them all along and what they say sits over that
    s.who.met = true;
    let first = null; for (let i = 0; i < 60 && !(first = mutter()); i++) G.step(T, T);
    G.step(1.6, T);
    return { first, later: mutter(), says: s.who.says, w: innerWidth, h: innerHeight };
  });
  if (shots) await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 });
  return { ...said, ...await g(() => {
    G.step(2.5, T); const after = G.mutters().filter((m) => m.id === mutterer.who.id).length;
    // and once it's after him, it's stopped
    clear(); const t = hold(ahead(quiet.find((o) => o.who.says && o !== mutterer), 4, .3)); G.step(T, T); let again = null; for (let i = 0; i < 60 && !(again = mutter()); i++) G.step(T, T);
    H.provoke(t, 'took'); G.step(.6, T);
    return { after, stops: !!again && !G.mutters().some((m) => m.id === t.who.id) };
  }) };
};
const onScreen = (m, w, h) => m && m.box.left >= 0 && m.box.right <= w && m.box.top >= 0 && m.box.bottom <= h;
let m = await mutters('7-muttering');
check(`within a few metres of him, one who's gone quiet mutters "${m.first?.says}", which is theirs and one of the twenty`, m.first && m.first.says === m.says && LINES.includes(m.says) && onScreen(m.first, m.w, m.h) && onScreen(m.later, m.w, m.h), m);
check(`faintly: it fades in from ${m.first?.opacity} to ${m.later?.opacity} and goes no higher than .72`, m.first?.opacity < .5 && m.later?.opacity === .72, m);
check(`and drifts up ${(m.later?.rise - m.first?.rise).toFixed(1)} px, then it's gone and they don't say it again straight away`, m.later?.rise - m.first?.rise > 5 && m.after === 0, m);
check('and once one comes for him, it stops', m.stops, m);
check('no console errors', errors.length === 0, errors.slice(0, 5));

// ---- what 30 and more of them cost
await g(() => {
  clear({ x: mid().x, z: mid().z, yaw: Math.PI });
  // down a portrait phone's narrow view, all of them gone quiet, so folded over and muttering
  quiet.slice(0, 40).forEach((s, i) => { const d = 3 + i * .8; put(s, P().x + ((i * 7) % 11 / 5 - 1) * .2 * (d + 5.4), P().z - d); });
  G.look(0, .28); G.step(.6, T);
});
await snap('8-thirty');
const seen = await g(() => { const v = G.camera.position.clone(); let n = 0; for (const s of quiet.slice(0, 40)) { v.set(s.x, s.y + 1, s.z).project(G.camera); if (Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1) n++; } return { n, drawn: G.crowd().drawn }; });
const cost = async (rate) => {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate });
  const t = await g(() => { const began = performance.now(); for (let i = 0; i < 60; i++) G.step(1 / 30, 1 / 30); return { frame: (performance.now() - began) / 60 }; });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return t;
};
const fast = await cost(1), slow = await cost(4);
console.log(`     a frame's JS with ${seen.n} on screen: ${fast.frame.toFixed(1)} ms here, ${slow.frame.toFixed(1)} ms at a quarter of this CPU. Not a real phone: the GPU isn't slowed down.`);
check(`${seen.n} of them on screen folded over, and under 33 ms of JS a frame at a quarter of this CPU`, seen.n >= 30 && slow.frame < 33, { seen, slow });
await g(() => { G.folks.forget(); });
await page1.close();

// ---- with reduced motion
const page2 = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
({ page, errors } = page2);
await g(helpers);
m = await mutters('9-reduced-motion');
check(`with reduced motion it's there at once, at ${m.first?.opacity}, and doesn't drift: ${(m.later?.rise - m.first?.rise).toFixed(1)} px`, m.first?.opacity === .72 && Math.abs(m.later?.rise - m.first?.rise) < 1 && LINES.includes(m.first?.says), m);
check('and it still goes, and stops when one comes for him', m.after === 0 && m.stops, m);
check('no console errors there either', errors.length === 0, errors.slice(0, 5));
await g(() => { G.folks.forget(); });
await page2.close();

console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
