// How far over everyone stands, from 0° at the hips to 180°, on a phone-sized page. Their number is the angle at their hips, and it's drawn at 90° plus half of it, so nobody's
// drawn further over than 90°, with their back about level. It's a standing fold: the legs straight and tipped back a little over their heels, the arms hanging straight down from the
// shoulders whatever the fold, and the head tipped back stood up and hanging from the neck folded over. The hands never touch the ground, and nothing crawls. The crowd's numbers, then a
// row of them side on, from the furthest over to the least, with a table of what each is numbered and what's drawn; the ones whose number is under 90 coming for him, a quick shuffle on
// their feet with their arms swinging and never on their hands, and the rest stood up; the cast a little over, someone at their door, someone knocked down and getting up, a kid on a
// four-wheeler sat up straight, what it all costs to draw, and the row again with reduced motion. Everything about the pose is measured from what went to the graphics card.
//
//   npm i && npm run fold [-- --shots dir]
import { mkdirSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const deg = (a) => a.map((v) => Math.round(v) + '°').join(', ');
// Drawn at 90° plus half the number, as the owner's reference picture has it, and how far off the ground is well off it
const drawnAt = (n) => 90 + n / 2, WELL = { hands: .1, head: .3 };

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
  // how each of them is drawn standing still: the angle at the hips, how high the lowest of their head, hands and feet are, which way their head points, and the angle their arm hangs
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
console.log(`     ${crowd.n} out in town: ${crowd.burnt} burnt down numbered ${deg(crowd.burntRange)}, ${crowd.quiet} gone quiet numbered ${deg(crowd.quietRange)}, and ${crowd.home.length} at home`);
check('the ones who\'ve burnt down are numbered 0° to 30° at the hips, and right down to the bottom of it, so drawn at 90° to 105°', crowd.burnt >= 3 && crowd.burntRange[0] >= 0 && crowd.burntRange[0] < 8 && crowd.burntRange[1] <= 30, crowd);
check(`nobody who's gone quiet stands up: they're numbered 30° to 150°, spread evenly, a quarter of them under ${Math.round(crowd.quarters[0])}°, half under ${Math.round(crowd.quarters[1])}° and three quarters under ${Math.round(crowd.quarters[2])}°, so drawn at 105° to 165°`,
  crowd.quietRange[0] >= 30 && crowd.quietRange[1] <= 150 && crowd.quietRange[0] < 36 && crowd.quietRange[1] > 144 && [60, 90, 120].every((v, i) => Math.abs(crowd.quarters[i] - v) < 9), crowd);
check('and the ones who\'ve burnt down are further over than any of them', crowd.burntRange[1] <= crowd.quietRange[0], crowd);
check(`the ${crowd.low} numbered under 90° are the ones who scuttle when they come for him, every one who's burnt down among them`, crowd.scuttle === 0 && crowd.low > crowd.burnt, crowd);
check(`and the people at home are on it too, gone quiet like the rest of them, numbered ${deg([Math.min(...crowd.home), Math.max(...crowd.home)])}`, crowd.home.length >= 10 && crowd.home.every((h) => h >= 30 && h <= 150) && Math.max(...crowd.home) - Math.min(...crowd.home) > 60, crowd.home);

// ---- a row of them side on, from the furthest over to the least, with someone holding out at the end of it
const pickRow = () => {
  // the furthest gone and the least of the ones who've burnt down, and the ones who've gone quiet nearest to these. Nobody in town is numbered 180° yet, so one of them is made to hold out.
  const byHips = (a, b) => a.hips - b.hips, b = [...burnt].sort(byHips), near = (h) => [...quiet].sort((x, y) => Math.abs(x.hips - h) - Math.abs(y.hips - h))[0];
  window.lineup = [b[0], b[b.length - 1], ...[36, 60, 80, 100, 125, 149].map(near)];
  window.holding = quiet.find((s) => !window.lineup.includes(s) && s.hips < 140); window.holding.hips = 180; window.holding.bentFor = undefined;
  window.lineup.push(window.holding);
};
// with him out of the picture, so the whole row can be seen, from the furthest over to the one holding out
const measure = () => { G.heroRoot.visible = false; return drawn(row(lineup, { d: 9, gap: 1.05, pitch: .06 })); };
// the numbers and what's drawn, in a table, and what has to be true of them: the same with and without reduced motion
const table = (r) => {
  const f = (v, w, d = 0) => String(+v.toFixed(d)).padStart(w);
  console.log('     numbered  expected  drawn  torso  legs  arms  hands(m)  head(m)  head points');
  for (const s of r) console.log(`     ${f(s.number, 6)}°  ${f(drawnAt(s.number), 7, 1)}°  ${f(s.hips, 4)}°  ${f(s.torso, 4)}°  ${f(s.legs, 3)}°  ${f(s.arms, 3)}°  ${f(s.hands, 8, 2)}  ${f(s.head, 7, 2)}  ${f(s.pitch, 8)}°${s.number === 180 ? '   (holding out)' : ''}`);
};
const rowChecks = (r, how = '') => {
  const standing = r.find((s) => s.number === 180), folded = r.filter((s) => s.number < 180), lowestHand = Math.min(...r.map((s) => s.hands)), lowestHead = Math.min(...r.map((s) => s.head));
  const burntDrawn = r.filter((s) => s.burnt).map((s) => s.hips), quietDrawn = r.filter((s) => !s.burnt && s.number < 180).map((s) => s.hips), inOrder = r.slice().sort((a, b) => a.number - b.number);
  check(`${how}a row of them are drawn at 90° plus half their numbers, to within 3°`, folded.every((s) => Math.abs(s.hips - drawnAt(s.number)) < 3), r);
  check(`${how}and someone holding out, numbered 180°, is stood up: ${Math.round(standing.hips)}° at the hips, their back ${Math.round(standing.torso)}° off upright`, standing.hips > 170 && standing.torso < 12, standing);
  check(`${how}whoever's further over by their number is drawn further over, from ${Math.round(Math.min(...folded.map((s) => s.hips)))}° to ${Math.round(Math.max(...r.map((s) => s.hips)))}°`, inOrder.every((s, i) => i === 0 || s.hips > inOrder[i - 1].hips), r);
  check(`${how}nobody's drawn further over than about 90° with their back about level: ${Math.round(Math.min(...r.map((s) => s.hips)))}°, their back ${Math.round(Math.max(...r.map((s) => s.torso)))}° off upright at the most`, Math.min(...r.map((s) => s.hips)) > 86 && Math.min(...r.map((s) => s.hips)) < 95 && Math.max(...r.map((s) => s.torso)) < 85, r);
  check(`${how}the ones who've burnt down are drawn further over than anyone who's gone quiet: ${deg(burntDrawn)} against ${deg(quietDrawn)}`, Math.max(...burntDrawn) < Math.min(...quietDrawn), r);
  check(`${how}their legs stay straight and tip back a little over their heels, ${Math.round(Math.min(...folded.filter((s) => s.number < 100).map((s) => s.legs)))}° to ${Math.round(Math.max(...folded.map((s) => s.legs)))}° of it at the most, the further over the more`, folded.filter((s) => s.number < 100).every((s) => s.legs > 5 && s.legs < 20) && folded.every((s) => s.legs < 20), r);
  check(`${how}their arms hang straight down whatever the fold, never more than ${Math.round(Math.max(...r.map((s) => s.arms)))}° off it`, r.every((s) => s.arms < 15), r);
  check(`${how}their hands are never on the ground, the lowest ${lowestHand.toFixed(2)} m off it, and their heads are ${lowestHead.toFixed(2)} m off it at the lowest`, lowestHand > WELL.hands && lowestHead > WELL.head, r);
  check(`${how}stood up, the head tips back, ${Math.round(standing.pitch)}° from straight up, and folded right over it hangs from the neck, ${Math.round(r.find((s) => s.number === Math.min(...r.map((o) => o.number))).pitch)}°`, standing.pitch < -10 && folded.filter((s) => s.number < 100).every((s) => s.pitch > 90), r);
};
await g(pickRow);
let r = await g(measure);
await snap('1-a-row-side-on');
table(r);
rowChecks(r);
await g(() => { const four = row(lineup.slice(0, 4), { d: 3.2, gap: 1.35, pitch: .3 }); drawn(four, 20); });
await snap('2-the-furthest-over');
await g(() => { G.heroRoot.visible = true; });

// ---- coming for him, and what each of them has the whole way: how low their hands and head go, how far their arms and their first leg swing, and how close to the ground their feet come
r = await g(() => {
  // the furthest gone of the ones who've burnt down who'd come for him, then the ones who've gone quiet who would nearest to 40°, just under 90° and just over it, 20 m off
  const pick = (list, h) => list.filter(bold).sort((a, b) => Math.abs(a.hips - h) - Math.abs(b.hips - h))[0];
  const list = [pick(burnt, 0), pick(quiet, 40), pick(quiet.filter((s) => s.hips < 90), 90), pick(quiet.filter((s) => s.hips > 90), 90)];
  row(list, { d: 20, gap: 2 }); for (const s of list) H.provoke(s, 'took');
  G.step(.6, T);
  const have = list.map(() => ({ arms: [], legs: [], hands: Infinity, head: Infinity, feet: Infinity }));
  for (let k = 0; k < 45; k++) { G.step(T, T); list.forEach((s, i) => { const st = G.stance(s); if (st) { have[i].arms.push(s.arm); have[i].legs.push(st.step); have[i].hands = Math.min(have[i].hands, st.hands); have[i].head = Math.min(have[i].head, st.head); have[i].feet = Math.min(have[i].feet, st.feet); } }); }
  const range = (a) => Math.max(...a) - Math.min(...a);
  return list.map((s, i) => ({ number: +s.hips.toFixed(1), state: s.state, low: !!s.scuttle, lean: +s.lean.toFixed(2), arms: range(have[i].arms), legs: range(have[i].legs), hands: +have[i].hands.toFixed(3), head: +have[i].head.toFixed(3), feet: +have[i].feet.toFixed(3) }));
});
await snap('3-coming-for-him');
const [deep, mid, under, over] = r, scuttlers = [deep, mid, under];
console.log(`     scuttling: ${scuttlers.map((s) => `${Math.round(s.number)}°, arms swing ${s.arms.toFixed(2)} rad, legs ${Math.round(s.legs)}°, hands never under ${s.hands.toFixed(2)} m`).join('; ')}`);
check(`they all come for him`, r.every((s) => s.state >= 2 && s.state <= 4), r);
check(`the ones numbered ${Math.round(deep.number)}°, ${Math.round(mid.number)}° and ${Math.round(under.number)}° stay folded over to scuttle, and the one numbered ${Math.round(over.number)}° stands up to run`, scuttlers.every((s) => s.low && s.lean > .6) && !over.low && over.lean < .5, r);
check(`the ones who scuttle shuffle on their feet, their legs going ${Math.round(Math.min(...scuttlers.map((s) => s.legs)))}° or more from one stride to the next and their feet coming down to the ground`, scuttlers.every((s) => s.legs > 25 && s.feet < .05), r);
check(`and swing their arms, ${Math.min(...scuttlers.map((s) => s.arms)).toFixed(2)} rad or more, hanging from the shoulders`, scuttlers.every((s) => s.arms > .45), r);
check(`and never go on their hands: the lowest they get is ${Math.min(...scuttlers.map((s) => s.hands)).toFixed(2)} m off the ground, their heads ${Math.min(...scuttlers.map((s) => s.head)).toFixed(2)} m`, scuttlers.every((s) => s.hands > WELL.hands && s.head > WELL.head), r);

// ---- someone knocked down, lying there and getting up: on their knees, folded over, their hands hold out to the sides and stay off the ground
await g(() => {
  const s = window.down = quiet.filter((o) => o.hips > 40 && o.hips < 80)[0]; row([s], { d: 5, gap: 1, pitch: .15 }); drawn([s], 20);
  H.knock(s.x, s.z, 1, 10);
  window.had = { hands: Infinity, head: Infinity, kneeling: 0 };
  // a step at a time, keeping where they are, and what the lowest they've been is once they're up on their knees and till they're coming up off them. It says whether they're still down.
  window.getUp = (until = () => false) => {
    for (let k = 0; k < 150 && s.flat > 0 && !until(); k++) {
      Object.assign(s, { x: s.homeX, z: s.homeZ, yaw: s.facing }); G.step(1 / 12, 1 / 12);
      if (s.kneel > .5 && s.lie < .3) { const st = G.stance(s); had.hands = Math.min(had.hands, st.hands); had.head = Math.min(had.head, st.head); had.kneeling++; }
    }
    return s.flat > 0;
  };
  // with him out of the picture while they're on their knees, or they're behind him
  G.heroRoot.visible = false;
  getUp(() => s.kneel > .85 && s.lie < .1);
});
await snap('4-getting-up');
await g(() => { G.heroRoot.visible = true; });
r = await g(() => { const still = getUp(); return { number: +down.hips.toFixed(0), ...had, still }; });
check(`getting up, ${r.number}° at the hips, they kneel folded over for ${(r.kneeling / 12).toFixed(1)} s and their hands never go on the ground, ${r.hands.toFixed(2)} m off it at the lowest, or their head, ${r.head.toFixed(2)} m`, !r.still && r.kneeling >= 8 && r.hands > WELL.hands && r.head > WELL.head, r);

// ---- the cast
r = await g(() => ({ coop: G.castHips('coop'), rocky: G.castHips('rocky'), bobby: G.castHips('bobby'), robby: G.castHips('robby') }));
check(`Coop, Rocky and Miss Bobby are each a little over, ${deg([r.coop, r.rocky, r.bobby])}, which is 165° to 175°`, [r.coop, r.rocky, r.bobby].every((h) => h > 164.5 && h < 175.5) && new Set([r.coop, r.rocky, r.bobby].map(Math.round)).size === 3, r);
check(`and Robby, who's a ghost, isn't on it`, Math.abs(r.robby - 180) < .5, r);

// ---- someone at their door
r = await g(() => {
  const s = H.all.filter((o) => o.home).sort((a, b) => a.hips - b.hips)[0], [x, z] = s.home.door, nx = s.home.nx, nz = s.home.nz;
  Object.assign(s, { x, z, tx: x, tz: z, state: 0, inside: false, moving: 0, timer: 99 });
  land(); G.place(x + nx * 2.6 - nz * 1.8, z + nz * 2.6 + nx * 1.8); const yaw = Math.atan2(-nx, -nz); G.player.yaw = yaw; G.look(yaw + Math.PI, .3);
  for (let k = 0; k < 12; k++) { Object.assign(s, { x, z, tx: x, tz: z, state: 0, moving: 0, timer: 99, yaw: Math.atan2(-nz, nx) }); G.step(T, T); }
  return { number: +s.hips.toFixed(1), ...G.stance(s), name: s.who.name };
});
await snap('5-at-their-door');
check(`someone at home, ${r.name}, stands at the door ${Math.round(r.hips)}° at the hips, as their number says: ${Math.round(drawnAt(r.number))}°`, Math.abs(r.hips - drawnAt(r.number)) < 3 && r.head > WELL.head && r.hands > WELL.hands, r);

// ---- a kid on a four-wheeler
r = await g(() => {
  G.traffic.on = true; G.traffic.T.cars = 0; G.traffic.T.riders = 1; G.traffic.T.every = [0, 0]; G.traffic.T.riderGone = 1e5; G.traffic.T.riderFrom = [20, 60]; G.traffic.soon();
  const lane = G.map.lanes.filter((l) => l.surface === 'dirt' && l.length > 180)[0], q = G.map.along(lane.id, lane.length / 2); land(); G.place(q.x + 15, q.z + 15);
  let c = null, n = 0; while (!c && n++ < 3000) { G.sim(1 / 15, 1 / 15); c = G.traffic.riders[0]; }
  if (!c) return { none: true };
  let seen = null; for (let k = 0; k < 300 && !seen; k++) { G.place(c.v.x + 4, c.v.z + 4); G.step(T, T); seen = c.v.fig && G.stance(c.v.fig); }
  return { lean: c.v.fig?.lean, seen: !!seen, pitch: seen && Math.round(seen.pitch), name: c.who.name };
});
await snap('6-on-a-four-wheeler');
check(`a kid on a four-wheeler, ${r.name}, sits up straight, leaning ${Math.round((r.lean ?? 1) * 57.3)}°, looking where they're going, their head ${r.pitch}° off straight up`, !r.none && r.seen && r.lean <= .2 && Math.abs(r.pitch) < 25, r);

// ---- what it costs: the head tipping and the arms hanging add nothing to what the crowd was
await g(() => { G.traffic.on = false; G.traffic.clear(); G.folks.forget(); H.calm(); land(); G.place(...G.map.fromTrue(-64.5, -15)); const list = H.all.slice(0, 48); row(list.map((s, i) => Object.assign(s, { hips: i * 3.7 })), { d: 6, gap: .9 }); G.step(.5, T); });
const crowdCost = await g(() => {
  const withThem = G.calls(), shown = G.crowd().drawn;
  H.all.forEach((z) => { z.x += 400; z.homeX += 400; }); G.step(.5, T);
  const without = G.calls();
  return { shown, calls: withThem.calls - without.calls };
});
check(`${crowdCost.shown} of them drawn, folded every way and with their heads tipped, for ${crowdCost.calls} draw calls, which is what the crowd always cost`, crowdCost.shown >= 40 && crowdCost.calls <= 7, crowdCost);
check('no errors in the console', errors.length === 0, errors);
await page1.close();

// ---- the same with reduced motion
const page2 = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
({ page, errors } = page2); g = (fn, arg) => page.evaluate(fn, arg);
await g(helpers); await g(pickRow);
const rm = await g(measure);
table(rm);
rowChecks(rm, 'with reduced motion, ');
const calm = await g(() => {
  const pick = (list, h) => list.filter(bold).sort((a, b) => Math.abs(a.hips - h) - Math.abs(b.hips - h))[0], s = pick(burnt, 0);
  row([s], { d: 12, gap: 1 }); H.provoke(s, 'took'); G.step(.6, T);
  let hands = Infinity; const arms = []; for (let k = 0; k < 45; k++) { G.step(T, T); const st = G.stance(s); if (st) { hands = Math.min(hands, st.hands); arms.push(s.arm); } }
  return { low: !!s.scuttle, state: s.state, hands: +hands.toFixed(3), arms: Math.max(...arms) - Math.min(...arms) };
});
check(`and with reduced motion the one who's burnt down still scuttles on their feet, swinging their arms ${calm.arms.toFixed(2)} rad, and never gets down on their hands, ${calm.hands.toFixed(2)} m off the ground at the lowest`, calm.low && calm.state >= 2 && calm.state <= 4 && calm.arms > .45 && calm.hands > WELL.hands, calm);
check('and no errors in the console', errors.length === 0, errors);
await page2.close();

console.log(failed ? `\n${failed} failed` : '\nall ok');
process.exit(failed ? 1 : 0);
