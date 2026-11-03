// How far over everyone stands, from 0° at the hips to 180°, on a phone-sized page: how far over the crowd are by how far gone their numbers say they are,
// with the ones who've burnt down the furthest over and nobody who's gone quiet stood up, then a row of them side on from the furthest over to the least,
// drawn the way their numbers say with their heads off the ground and their arms hanging till their hands reach it, the ones folded further over than a
// table coming for him low with their hands going like something crawling and the rest stood up, the cast a little over, someone at their door, a kid on a
// four-wheeler sat up straight, and the row again with reduced motion. Everything about the pose is measured from what went to the graphics card.
//
//   npm i && npm run fold [-- --shots dir]
import { mkdirSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const deg = (a) => a.map((v) => Math.round(v) + '°').join(', ');

// the same town on every page: Chapter 1 over, the town filled, the crowd out, nobody driving, and these
const helpers = () => {
  const G = __game; G.pause(); G.fillTown(); G.jump('town'); G.S.flags.town = true; G.S.flags.ended = G.S.flags.arrived = true; G.step(.1);
  document.getElementById('card').style.display = 'none';
  G.bringOutCrowd(); G.traffic.on = false; G.traffic.clear();
  window.G = G; window.H = G.horde; window.T = 1 / 30;
  window.land = () => { G.S.mode = 'town'; G.HP.kind = 'run'; G.player.vy = 0; G.player.grounded = true; G.player.inv = 0; G.player.kb.set(0, 0); G.S.hp = 3; document.getElementById('fail').hidden = true; };
  // in the middle of town for long enough for the people at home round about to come out
  land(); G.place(...G.map.fromTrue(0, 0)); G.step(1.5, T);
  window.quiet = H.all.filter((s) => s.quiet === true);
  window.burnt = H.all.filter((s) => s.quiet === false);
  window.bold = (s) => s.who.nerve + (s.who.temper - .5) * .4 > .3;
  // on US 80 west of town, facing along it
  const a0 = G.map.sOn('us_80', ...G.map.fromTrue(-600, -20)), p = G.map.along('us_80', a0), q = G.map.along('us_80', a0 + 1);
  const yaw = Math.atan2(q.x - p.x, q.z - p.z), fx = Math.sin(yaw), fz = Math.cos(yaw), sx = Math.cos(yaw), sz = -Math.sin(yaw);
  // these in a row across the road d metres in front of him, side on to him and each other, and everybody else a long way off, nobody remembering anything
  window.row = (list, { d = 8, gap = 1.5, pitch = .42 } = {}) => {
    G.folks.forget(); H.calm(); H.noises.length = 0;
    H.all.forEach((s, i) => Object.assign(s, { x: p.x + 900 + i, z: p.z + 600 + i, tx: p.x + 900 + i, tz: p.z + 600 + i, homeX: p.x + 900 + i, homeZ: p.z + 600 + i, state: 0 }));
    list.forEach((s, k) => {
      const off = (k - (list.length - 1) / 2) * gap, x = p.x + fx * d + sx * off, z = p.z + fz * d + sz * off;
      Object.assign(s, { x, z, tx: x, tz: z, homeX: x, homeZ: z, y: G.floorAt(x, z), state: 0, alert: 0, sus: 0, timer: 99, moving: 0, flat: 0, started: false, knows: 0, lead: null, facing: yaw + Math.PI / 2 });
    });
    land(); G.place(p.x, p.z); G.player.yaw = yaw; G.look(yaw + Math.PI, pitch); G.stick(0, 0);
    return list;
  };
  // a step of the crowd's, which is posed 12 times a second, with them standing still where they were put, side on
  window.still = (list) => { for (const s of list) Object.assign(s, { state: 0, moving: 0, timer: 99, alert: 0, sus: 0, x: s.homeX, z: s.homeZ, tx: s.homeX, tz: s.homeZ, yaw: s.facing }); G.step(1 / 12, 1 / 12); };
  // how each of them is drawn standing still: the angle at the hips, how high the lowest of their head and of their hands is, and the angle their arm hangs
  // at from straight down, forward being under nothing. Each of them shuffles a step now and then when they think, so it's from the last step they didn't.
  window.drawn = (list, steps = 24) => {
    const got = list.map(() => null);
    for (let k = 0; k < steps; k++) { still(list); list.forEach((s, i) => { if (!s.moving && k >= 6) got[i] = { number: +s.hips.toFixed(1), burnt: s.quiet === false, ...G.stance(s), arm: s.arm }; }); }
    return got;
  };
};

const page1 = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
let { page, errors } = page1;
let g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); };
await g(helpers);

// ---- the crowd's numbers
const crowd = await g(() => {
  const hips = (list) => list.map((s) => s.hips).sort((a, b) => a - b), q = hips(quiet), b = hips(burnt), at = (a, f) => a[Math.floor(f * (a.length - 1))];
  return {
    n: H.all.length, quiet: q.length, burnt: b.length, quietRange: [q[0], q[q.length - 1]], burntRange: [b[0], b[b.length - 1]], quarters: [.25, .5, .75].map((f) => at(q, f)),
    scuttle: H.all.filter((s) => s.scuttle !== s.hips < 90).length, low: H.all.filter((s) => s.scuttle).length,
    home: H.all.filter((s) => s.who?.calm).map((s) => s.hips),
  };
});
console.log(`     ${crowd.n} out in town: ${crowd.burnt} burnt down from ${deg(crowd.burntRange)}, ${crowd.quiet} gone quiet from ${deg(crowd.quietRange)}, and ${crowd.home.length} at home`);
check('the ones who\'ve burnt down are folded right over, 0° to 30° at the hips, and right down to the bottom of it', crowd.burnt >= 3 && crowd.burntRange[0] >= 0 && crowd.burntRange[0] < 8 && crowd.burntRange[1] <= 30, crowd);
check(`nobody who's gone quiet stands up: they're from 30° to 150°, spread evenly, a quarter of them under ${Math.round(crowd.quarters[0])}°, half under ${Math.round(crowd.quarters[1])}° and three quarters under ${Math.round(crowd.quarters[2])}°`,
  crowd.quietRange[0] >= 30 && crowd.quietRange[1] <= 150 && crowd.quietRange[0] < 36 && crowd.quietRange[1] > 144 && [60, 90, 120].every((v, i) => Math.abs(crowd.quarters[i] - v) < 9), crowd);
check('and the ones who\'ve burnt down are further over than any of them', crowd.burntRange[1] <= crowd.quietRange[0], crowd);
check(`the ${crowd.low} folded further over than a table are the ones who come for him low, every one who's burnt down among them`, crowd.scuttle === 0 && crowd.low > crowd.burnt, crowd);
check(`and the people at home are on it too, gone quiet like the rest of them, from ${deg([Math.min(...crowd.home), Math.max(...crowd.home)])}`, crowd.home.length >= 10 && crowd.home.every((h) => h >= 30 && h <= 150) && Math.max(...crowd.home) - Math.min(...crowd.home) > 60, crowd.home);

// ---- a row of them side on, from the furthest over to the least
const pickRow = () => {
  // the furthest gone and the least of the ones who've burnt down, and the ones who've gone quiet nearest to these
  const byHips = (a, b) => a.hips - b.hips, b = [...burnt].sort(byHips), near = (h) => [...quiet].sort((x, y) => Math.abs(x.hips - h) - Math.abs(y.hips - h))[0];
  window.lineup = [b[0], b[b.length - 1], ...[36, 60, 80, 100, 125, 149].map(near)];
};
const measure = () => drawn(row(lineup));
await g(pickRow);
let r = await g(measure);
await snap('1-a-row-side-on');
const quietDrawn = r.filter((s) => !s.burnt).map((s) => s.hips), burntDrawn = r.filter((s) => s.burnt).map((s) => s.hips);
console.log(`     numbered ${deg(r.map((s) => s.number))}, drawn at ${deg(r.map((s) => s.hips))}`);
check('a row of them are drawn further over the further gone their numbers say they are', r.every((s, i) => i === 0 || s.hips > r[i - 1].hips - 2), r);
check(`from 60° up they're drawn at their numbers, and under that they're eased into what there's room for, never further over than ${Math.round(Math.min(...r.map((s) => s.hips)))}°`, r.every((s) => (s.number >= 60 ? Math.abs(s.hips - s.number) < 5 : s.hips > 30 && s.hips < 62)), r);
check(`the ones who've burnt down are drawn further over than anyone who's gone quiet: ${deg(burntDrawn)} against ${deg(quietDrawn)}`, Math.max(...burntDrawn) < Math.min(...quietDrawn), r);
check(`nobody's head goes into the ground, the lowest ${Math.min(...r.map((s) => s.head)).toFixed(2)} m off it`, r.every((s) => s.head > .03), r);
const off = r.filter((s) => s.hips > 90), on = r.filter((s) => s.hips < 75);
check(`their arms hang straight down till their hands reach the ground, nearer it the further over they are: ${off.map((s) => s.hands.toFixed(2) + ' m').join(', ')}`, off.length >= 3 && off.every((s, i) => Math.abs(s.arm) < .35 && s.hands > .1 && (i === 0 || s.hands > off[i - 1].hands)), r);
check(`and anyone further over than that has their hands on the ground in front of them, ${on.map((s) => s.hands.toFixed(2) + ' m').join(', ')} off it`, on.length >= 4 && on.every((s) => s.hands > 0 && s.hands < .08 && s.arm < -.15), r);
await g(() => { const four = row(lineup.slice(0, 4), { d: 3.2, gap: 1.35, pitch: .3 }); drawn(four, 20); });
await snap('2-the-furthest-over');

// ---- coming for him
r = await g(() => {
  // the furthest gone of the ones who've burnt down who'd come for him, then the ones who've gone quiet who would nearest to 70°, just under 90° and just over it, 20 m off
  const pick = (list, h) => list.filter(bold).sort((a, b) => Math.abs(a.hips - h) - Math.abs(b.hips - h))[0];
  const list = [pick(burnt, 0), pick(quiet, 70), pick(quiet.filter((s) => s.hips < 90), 90), pick(quiet.filter((s) => s.hips > 90), 90)];
  row(list, { d: 20, gap: 2 }); for (const s of list) H.provoke(s, 'took');
  G.step(.6, T);
  const arms = list.map(() => []), lows = list.map(() => Infinity), heads = list.map(() => Infinity);
  for (let k = 0; k < 30; k++) { G.step(T, T); list.forEach((s, i) => { const st = G.stance(s); arms[i].push(s.arm); if (st) { lows[i] = Math.min(lows[i], st.hands); heads[i] = Math.min(heads[i], st.head); } }); }
  return list.map((s, i) => ({ number: +s.hips.toFixed(1), state: s.state, low: !!s.scuttle, lean: +s.lean.toFixed(2), arms: [Math.min(...arms[i]), Math.max(...arms[i])].map((a) => +a.toFixed(2)), hands: +lows[i].toFixed(3), head: +heads[i].toFixed(3) }));
});
await snap('3-coming-for-him');
const [deep, mid, under, over] = r;
check(`they all come for him`, r.every((s) => s.state >= 2 && s.state <= 4), r);
check(`the one who's burnt down and the ones at ${Math.round(mid.number)}° and ${Math.round(under.number)}° come low, and the one at ${Math.round(over.number)}° stands up to run`, [deep, mid, under].every((s) => s.low && s.lean > .9) && !over.low && over.lean < .5, r);
check(`the ones low enough to reach the ground go a hand at a time, like something crawling, from ${deep.arms[1]} to ${deep.arms[0]} forward of straight down, and never into it`, [deep, mid].every((s) => s.arms[1] < 0 && s.arms[1] - s.arms[0] > .25 && s.hands > 0 && s.head > .03), r);
check(`and the one who can't reach it drags their arms behind them, ${under.arms[0]} to ${under.arms[1]} back of straight down`, under.arms[0] > 0 && under.hands > 0, r);

// ---- the cast
r = await g(() => ({ coop: G.castHips('coop'), rocky: G.castHips('rocky'), bobby: G.castHips('bobby'), robby: G.castHips('robby') }));
check(`Coop, Rocky and Miss Bobby are each a little over, ${deg([r.coop, r.rocky, r.bobby])}`, [r.coop, r.rocky, r.bobby].every((h) => h > 149 && h < 171) && new Set([r.coop, r.rocky, r.bobby].map(Math.round)).size === 3, r);
check(`and Robby, who's a ghost, isn't on it`, Math.abs(r.robby - 180) < .5, r);

// ---- someone at their door
r = await g(() => {
  const s = H.all.filter((o) => o.home).sort((a, b) => a.hips - b.hips)[0], [x, z] = s.home.door, nx = s.home.nx, nz = s.home.nz;
  Object.assign(s, { x, z, tx: x, tz: z, state: 0, inside: false, moving: 0, timer: 99 });
  land(); G.place(x + nx * 2.6 - nz * 1.8, z + nz * 2.6 + nx * 1.8); const yaw = Math.atan2(-nx, -nz); G.player.yaw = yaw; G.look(yaw + Math.PI, .3);
  for (let k = 0; k < 12; k++) { Object.assign(s, { x, z, tx: x, tz: z, state: 0, moving: 0, timer: 99, yaw: Math.atan2(-nz, nx) }); G.step(T, T); }
  return { number: +s.hips.toFixed(1), ...G.stance(s), name: s.who.name };
});
await snap('4-at-their-door');
check(`someone at home, ${r.name}, stands at the door ${Math.round(r.hips)}° at the hips, as their number says`, Math.abs(r.hips - Math.max(r.number, 34 + (60 - 34) * Math.min(r.number, 60) / 60)) < 5 && r.head > .03, r);

// ---- a kid on a four-wheeler
r = await g(() => {
  G.traffic.on = true; G.traffic.T.cars = 0; G.traffic.T.riders = 1; G.traffic.T.every = [0, 0]; G.traffic.T.riderGone = 1e5; G.traffic.T.riderFrom = [20, 60]; G.traffic.soon();
  const lane = G.map.lanes.filter((l) => l.surface === 'dirt' && l.length > 180)[0], q = G.map.along(lane.id, lane.length / 2); land(); G.place(q.x + 15, q.z + 15);
  let c = null, n = 0; while (!c && n++ < 3000) { G.sim(1 / 15, 1 / 15); c = G.traffic.riders[0]; }
  if (!c) return { none: true };
  let seen = null; for (let k = 0; k < 300 && !seen; k++) { G.place(c.v.x + 4, c.v.z + 4); G.step(T, T); seen = c.v.fig && G.stance(c.v.fig); }
  return { lean: c.v.fig?.lean, seen: !!seen, name: c.who.name };
});
check(`a kid on a four-wheeler, ${r.name}, sits up straight, leaning ${Math.round((r.lean ?? 1) * 57.3)}°`, !r.none && r.seen && r.lean <= .2, r);
check('no errors in the console', errors.length === 0, errors);
await page1.close();

// ---- the same with reduced motion
const page2 = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
({ page, errors } = page2); g = (fn, arg) => page.evaluate(fn, arg);
await g(helpers); await g(pickRow);
const rm = await g(measure);
check(`with reduced motion it's the same row: drawn at ${deg(rm.map((s) => s.hips))}`, rm.every((s, i) => i === 0 || s.hips > rm[i - 1].hips - 2) && rm.every((s) => s.head > .03 && s.hands > 0), rm);
check('and no errors in the console', errors.length === 0, errors);
await page2.close();

console.log(failed ? `\n${failed} failed` : '\nall ok');
process.exit(failed ? 1 : 0);
