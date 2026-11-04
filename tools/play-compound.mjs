// Goes round the compound on Pine Forest Rd on a phone-sized page, with the game's own movement and real taps: up the measured drive from the road, in through every door, plays what's in the shed
// with the crowd listening, swims the pool, goes down the hill to the cabin and along its decks past the swing to the cinema and the studio, watches the screen, and breaks the projector
// and the tank. Then that a still of the screen is all there is for anyone who's asked for less motion.
//
//   npm i && npm run compound [-- --shots dir]
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
  const G = __game, T = 1 / 30, P = G.player.pos; G.pause(); G.jump('town'); G.S.flags.town = true; G.step(.1);
  document.getElementById('card').style.display = 'none';
  window.true2 = (x, z) => G.map.fromTrue(x, z);
  // heads for each spot in turn on his own legs, in world metres, and says where he stuck
  window.walkTo = (stops, within = .6, secs = 120) => {
    let t = 0;
    for (const [x, z] of stops) {
      G.key('w', true);
      while (t < secs && Math.hypot(P.x - x, P.z - z) > within) { G.look(Math.atan2(P.x - x, P.z - z)); G.sim(T, T); t += T; }
      G.key('w', false);
    }
    G.sim(T, T); const [x, z] = stops.at(-1); return { off: +Math.hypot(P.x - x, P.z - z).toFixed(2), t: +t.toFixed(1) };
  };
  window.played = []; const play = G.sound.play.bind(G.sound); G.sound.play = (name, o) => { played.push(name); return play(name, o); };
  // where a building's doors are, in world metres: just outside each, and just in
  window.doorsOf = (id) => { const s = G.structures.find((b) => b.id === id), [ax, az] = s.pts[s.door], [bx, bz] = s.pts[(s.door + 1) % s.pts.length], mx = (ax + bx) / 2, mz = (az + bz) / 2, l = Math.hypot(bx - ax, bz - az), nx = (bz - az) / l, nz = -(bx - ax) / l; return { out: [mx + nx * 2, mz + nz * 2], in: [mx - nx * 1.4, mz - nz * 1.4] }; };
});

// ---------------- what's there
const built = await g(async () => {
  const measured = (await (await fetch('data/lanes.json')).json()).lanes.filter((l) => l.measured && Math.hypot(l.points[0][0] - 1000, l.points[0][1] - 660) < 400).map((l) => l.id);
  const G = __game, ids = [75099630, 75190940, 900004, 900005, 900006, 900007, 900009, 900010, 900011, 900012, 900013, 900019, 900020];
  const found = ids.filter((id) => G.structures.some((s) => s.id === id));
  const lanes = G.map.lanes.filter((l) => measured.includes(l.id)).map((l) => l.id); window.measured = measured;
  const parked = [[1034.1, 640.5], [1000.6, 652.6], [1028.6, 669.1], [1031.9, 669.9]].filter(([x, z]) => { const [wx, wz] = true2(x, z); return G.vehicles.some((v) => Math.hypot(v.x - wx, v.z - wz) < 1); }).length;
  const spots = [[1034.1, 640.5], [1000.6, 652.6], [1028.6, 669.1], [1031.9, 669.9]].map(([x, z]) => { const [wx, wz] = true2(x, z); return +Math.min(...G.vehicles.map((v) => Math.hypot(v.x - wx, v.z - wz))).toFixed(1); });
  // ETB2k4's '99: where it was left, its own green, and which way it's looking and how far up the hill it is from the middle of the cabin
  const cabin = G.structures.find((s) => s.id === 900019).pts, cx = cabin.reduce((a, p) => a + p[0], 0) / cabin.length, cz = cabin.reduce((a, p) => a + p[1], 0) / cabin.length, [nx, nz] = true2(1039, 617);
  const ninetyNine = G.vehicles.filter((v) => v.kind === 'coupe99').map((v) => {
    const off = Math.atan2(cx - v.x, cz - v.z) - v.yaw;
    return { d: +Math.hypot(v.x - nx, v.z - nz).toFixed(1), paint: v.paint.getHexString(), turn: +Math.abs(Math.atan2(Math.sin(off), Math.cos(off))).toFixed(2), above: +(G.hills.at(v.x, v.z) - G.hills.at(cx, cz)).toFixed(1) };
  });
  return { want: ids.length, found: found.length, lanes, parked, spots, ninetyNine, jam: G.compound.JAM.map((j) => j.name) };
});
check('every building is in the game', built.found === built.want, built);
check('the drive, what comes off it and the track down the hill are the measured ones', built.lanes.length === 6, built.lanes);
check('the truck, the car and the two trucks are parked where they were', built.parked === 4, built.spots);
const n99 = built.ninetyNine[0];
check('ETB2k4\'s green \'99 is up the hill from the cabin, where it was left, looking down at it', built.ninetyNine.length === 1 && n99.d < .5 && n99.paint === '2f5d48' && n99.turn < .3 && n99.above > 1, built.ninetyNine);
check('the room has drums, a guitar, a bass and a keyboard', built.jam.join() === 'drums,guitar,bass,keyboard', built.jam);

// ---------------- the big house with the pool on two floors, as the game writes it: a row of windows on each, all under the eaves, and the porch and the carport and the roof
// down its south side a floor high, under the second floor's windows
const big = await g(async () => {
  const G = __game, { Sheet, writeStructure, eavesOf } = await import('./src/structures.js'), s = G.structures.find((b) => b.id === 75099630), sheet = new Sheet();
  writeStructure(sheet, s, 0);
  const a = sheet.arrays(), span = (p) => { let lo = Infinity, hi = -Infinity; for (let i = p.first; i < p.first + p.count; i++) { lo = Math.min(lo, a.position[i * 3 + 1]); hi = Math.max(hi, a.position[i * 3 + 1]); } return [lo, hi]; };
  const windows = a.pieces.filter((p) => p.kind === 'window').map(span), rows = [...new Set(windows.map(([lo]) => +lo.toFixed(1)))].sort((x, y) => x - y);
  const porches = a.pieces.filter((p) => p.kind === 'porch' || p.kind === 'carport').map(span);
  return { floors: s.floors, eaves: eavesOf(s), rows, windows: windows.length, top: +Math.max(...windows.map(([, hi]) => hi)).toFixed(2), porches: porches.length, porch: +Math.max(...porches.map(([, hi]) => hi)).toFixed(2) };
});
check(`the big house is on two floors, with a row of windows on each under its ${big.eaves} m eaves, and its porches a floor high`, big.floors === 2 && big.rows.length === 2 && big.top < big.eaves && big.porches > 0 && big.porch < big.rows[1], big);

// ---------------- up the drive from the road, on foot
const drive = await g(() => {
  const G = __game, P = G.player.pos, lane = G.map.lanes.filter((l) => measured.includes(l.id)).sort((a, b) => b.length - a.length)[0];
  const pts = lane.pts; G.place(pts[0][0], pts[0][1]); G.sim(.1, .1);
  let off = 0; const r = walkTo(pts.slice(1).map(([x, z]) => [x, z]), .8, 200);
  for (let i = 2; i < pts.length; i++) for (let k = 0; k <= 12; k++) { const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k / 12, z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k / 12; if (!G.onRoad(x, z) || G.pavedAt(x, z)) off++; }
  return { r, off, long: lane.length, end: [P.x, P.z] };
});
check(`he walks the ${Math.round(drive.long)} m up the drive with nothing in the way`, drive.r.off < 1.2, drive);
check('it is gravel from end to end', drive.off === 0, drive.off);
await g(() => __game.step(.1));
await snap('yard');

// ---------------- the taxidermy sign at the road by the drive, facing the road. What's carved on it is only checked for what it isn't: there's a name, the word, and no number.
// Then he walks into it and it stops him, and a truck driven into it from the road knocks it down.
const sign = await g(() => {
  const G = __game, S = G.compound.sign, P = G.player.pos, T = 1 / 30, mouth = G.map.lanes.filter((l) => measured.includes(l.id)).sort((a, b) => b.length - a.length)[0].pts[0];
  const ends = [-1.2, 1.2].map((u) => [S.x + S.nz * u, S.z - S.nx * u]), front = (d) => [S.x + S.nx * d, S.z + S.nz * d];
  const out = { mouth: +Math.hypot(S.x - mouth[0], S.z - mouth[1]).toFixed(1), off: ends.every(([x, z]) => !G.onRoad(x, z)), faces: G.onRoad(...front(7)) && !G.onRoad(...front(-7)), named: S.words.length === 2 && S.words[0].length > 2, word: S.words[1] === 'TAXIDERMY', number: S.words.some((w) => /\d/.test(w)), lit: S.board.material.emissiveIntensity > 0 };
  G.place(...front(3)); G.sim(.1, .1); walkTo([front(-1)], .3, 3); out.stopped = +((P.x - S.x) * S.nx + (P.z - S.z) * S.nz).toFixed(2);
  G.place(...front(5)); G.player.yaw = Math.atan2(-S.nx, -S.nz); G.look(Math.atan2(S.nx, S.nz), .05); G.step(1, T);
  return out;
});
await snap('sign');
check(`the taxidermy sign stands by the road ${sign.mouth} m from the mouth of the drive, off the road and the drive, facing the road, and lit a little`, sign.mouth < 12 && sign.off && sign.faces && sign.lit, sign);
check('  carved with a name and TAXIDERMY, and no number', sign.named && sign.word && !sign.number, { named: sign.named, word: sign.word, number: sign.number });
check(`  walking into it stops him ${sign.stopped} m short of it`, sign.stopped > .1 && sign.stopped < 1, sign.stopped);
const knocked = await g(() => {
  const G = __game, S = G.compound.sign, T = 1 / 30, v = G.vehicles.find((o) => o.kind === 'pickup' && !o.wrecked), [x, z] = [S.x + S.nx * 14, S.z + S.nz * 14];
  G.getIn(v); v.x = x; v.z = z; v.y = G.floorAt(x, z); v.yaw = Math.atan2(-S.nx, -S.nz); v.f = v.s = 0; G.sim(T, T);
  let t = 0; for (; t < 5 && !S.prop.down; t += T) { G.stick(0, 1); G.sim(T, T); }
  G.stick(0, 0); for (let k = 0; k < 30; k++) G.sim(T, T); G.getOut(true); G.sim(.2, .2);
  return { down: S.prop.down, t: +t.toFixed(1) };
});
check(`  and a truck driven into it from the road knocks it down (${knocked.t} s)`, knocked.down, knocked);

// ---------------- no woods where it's been cleared
const clear = await g(() => {
  const G = __game, trees = G.wreck.trees, C = G.compound, D = C.DECK, L = C.LAWN, spots = { deck: D.at(7.7, 4.6), lawn: L.at(5, 5.9), cinema: C.CINEMA.at(3, 3), cabin: true2(1058.6, 598.8), studio: true2(1045.9, 600.4) }, out = {};
  for (const [k, [x, z]] of Object.entries(spots)) { G.place(x, z); G.sim(.1, .1); out[k] = trees(x, z, 6).length; }
  return out;
});
check('no trees on the deck, the lawn, or the cabin\'s decks', Object.values(clear).every((n) => n === 0), clear);

// ---------------- in through every door
const doors = await g(() => {
  const G = __game, P = G.player.pos, out = {};
  for (const id of [75099630, 75190940, 900004, 900005, 900006, 900007, 900009, 900011, 900013, 900019, 900020]) {
    const d = doorsOf(id); G.place(...d.out); G.sim(.1, .1); const r = walkTo([d.in], .4, 6); const inside = G.structures.find((s) => s.id === id), hit = G.houseAt(P.x, P.z)?.id;
    out[id] = { off: r.off, hit, ok: hit === id && inside != null };
  }
  return out;
});
for (const [id, d] of Object.entries(doors)) check(`he can walk into ${id}`, d.ok, d);

// ---------------- the room in the shed, with real taps
await g(() => { const G = __game, d = doorsOf(G.compound.JAM_SHED); G.place(...d.in); G.sim(.1, .1); G.bringOutCrowd(); G.sim(.1, .1); });
for (const j of ['drums', 'guitar', 'bass', 'keyboard']) {
  const before = await g((j) => {
    // from the middle of the room, up to it
    const G = __game, it = G.compound.JAM.find((a) => a.name === j), [cx, cz] = doorsOf(G.compound.JAM_SHED).in, l = Math.hypot(cx - it.x, cz - it.z), reach = j === 'drums' ? 1.5 : .95, stand = walkTo([[cx, cz], [it.x + (cx - it.x) / l * reach, it.z + (cz - it.z) / l * reach]], .25, 12);
    G.sim(.1, .1); played.length = 0; return { act: G.S.act, button: document.getElementById('bA').textContent, noises: G.horde.noises.length, stand };
  }, j);
  check(`it says to play the ${j}, and the button says PLAY`, before.act === `Play the ${j}` && before.button === 'PLAY', before);
  await page.tap('#bA'); await page.waitForTimeout(30);
  const after = await g(() => { const G = __game; G.step(.05); return { played: [...played], noises: G.horde.noises.length, heard: G.horde.noises.at(-1) }; });
  check(`  and a tap plays it, and the crowd hears`, after.played.some((n) => n.startsWith('jam.')) && (after.noises > before.noises || after.heard?.r >= 40), after);
  await g(() => { const G = __game; for (let i = 0; i < 30; i++) G.sim(1 / 30, 1 / 30); });
  if (j === 'drums') await snap('drums');
}
const again = await g(() => {
  const G = __game, drums = G.compound.JAM[0], P = G.player.pos;
  walkTo([doorsOf(G.compound.JAM_SHED).in, [drums.x + .4, drums.z + 1.45]], .3, 12); G.sim(.1, .1); played.length = 0;
  const act = G.S.act;
  G.key('e', true); G.step(.05); G.key('e', false); for (let i = 0; i < 20; i++) G.sim(1 / 30, 1 / 30);
  G.key('e', true); G.step(.05); G.key('e', false); for (let i = 0; i < 20; i++) G.sim(1 / 30, 1 / 30);
  const beats = played.filter((n) => n.startsWith('jam.'));
  // and a hammer on it is loud too, and doesn't put it down right away
  const hp = drums.prop.hp; played.length = 0; G.key('f', true); G.step(.05); G.key('f', false); for (let i = 0; i < 18; i++) G.sim(1 / 30, 1 / 30);
  return { act, beats, hp, after: drums.prop.hp, down: drums.prop.down, hit: played.filter((n) => n.startsWith('jam.')) };
});
check('playing them straight off, the second beat is the cymbal', again.beats.length >= 2 && again.beats[0] === 'jam.drum' && again.beats[1] === 'jam.cymbal', again.beats);
check('hitting the drums with the hammer sounds them and chips them', again.after < again.hp && !again.down && again.hit.length > 0, again);

// ---------------- the pool
const pool = await g(() => {
  const G = __game, D = G.compound.DECK, P = G.player.pos, W = G.water, p = W.ponds.find((a) => a.pool);
  const [ax, az] = D.at(1, 6.2), [bx, bz] = D.at(14.2, 6.2);
  G.place(ax, az); G.sim(.2, .2);
  const onDeck = G.surfaceUnder(), rim = G.floorAt(ax, az), floor = G.groundH(p.x, p.z), level = p.level;
  G.key('w', true); let t = 0, modes = new Set(), lowest = P.y;
  while (t < 30 && Math.hypot(P.x - bx, P.z - bz) > .8) { G.look(Math.atan2(P.x - bx, P.z - bz)); G.sim(1 / 30, 1 / 30); t += 1 / 30; modes.add(G.S.mode); lowest = Math.min(lowest, P.y); if (G.S.mode === 'swim' && !window.swam) { window.swam = [P.x, P.z]; } }
  G.key('w', false); G.sim(.2, .2);
  return { onDeck, rim, floor, level, modes: [...modes], t: +t.toFixed(1), mode: G.S.mode, out: G.water.in(P.x, P.z) ? 'in' : 'out', lowest: +lowest.toFixed(2), off: +Math.hypot(P.x - bx, P.z - bz).toFixed(2), under: G.surfaceUnder() };
});
check('the deck underfoot is hard, not mud', pool.onDeck === 'road', pool.onDeck);
check('the water stands a little under the deck, and the pool has a floor well under that', pool.level < pool.rim && pool.level > pool.rim - .3 && pool.floor < pool.level - 1.4, pool);
check('he goes in, swims it and climbs out the other side', pool.modes.includes('swim') && pool.mode === 'town' && pool.out === 'out' && pool.off < 1.2, pool);
await snap('pool');

// ---------------- from the end of the drive down the hill to the cabin, onto its deck and in, then along the decks past the swing to the cinema, and on to the studio and in
await g(() => {
  const G = __game, P = G.player.pos, [x, z] = G.map.lanes.filter((l) => measured.includes(l.id)).sort((a, b) => b.length - a.length)[0].pts.at(-1); G.place(x, z); G.sim(.2, .2);
  window.stand = () => ({ up: +(P.y - G.groundH(P.x, P.z)).toFixed(2), under: G.surfaceUnder(), deck: G.compound.onDeck(P.x, P.z), hit: G.houseAt(P.x, P.z)?.id ?? null });
});
// the rail's along the side of the deck that looks out over the river, so it's up onto the next one along from the cabin, and along to its door
const downHill = await g(() => ({ ...walkTo([true2(1053, 602), true2(1053, 599), doorsOf(__game.compound.CABIN).out], .5, 40), ...stand() }));
check('he walks from the end of the drive down the hill to the cabin and steps up onto its deck, which is wood underfoot', downHill.off < .8 && downHill.deck && Math.abs(downHill.up - .3) < .05 && downHill.under === 'wood', downHill);
const inCabin = await g(() => ({ ...walkTo([doorsOf(__game.compound.CABIN).in], .4, 8), ...stand() }));
check('  and in through its door', inCabin.hit === 900019, inCabin);
// round the projector, to between the rows of chairs
const toCinema = await g(() => ({ ...walkTo([doorsOf(__game.compound.CABIN).out, true2(1053, 598.6), true2(1051.2, 597.4), __game.compound.CINEMA.at(3.05, 3.3)], .5, 30), ...stand() }));
check('  and out again, and along the decks to the cinema beside it', toCinema.off < .8 && toCinema.deck && Math.abs(toCinema.up - .3) < .05, toCinema);
const toStudio = await g(() => ({ ...walkTo([true2(1045.9, 598.6), doorsOf(__game.compound.STUDIO).out], .5, 30), ...stand() }));
check('  and on south along the deck to the studio\'s door', toStudio.off < .8 && toStudio.deck, toStudio);
const inStudio = await g(() => ({ ...walkTo([doorsOf(__game.compound.STUDIO).in], .4, 8), ...stand() }));
check('  and in', inStudio.hit === 900020, inStudio);
const things = await g(() => {
  const G = __game, C = G.compound, props = G.wreck.props, swing = props.find((p) => p.kind === 'swing'), inStudio = (k) => props.filter((p) => p.kind === k && G.houseAt(p.cx, p.cz)?.id === C.STUDIO).length;
  return { swing: !!swing && C.onDeck(swing.cx, swing.cz), canvases: inStudio('canvas'), easel: inStudio('easel'), bench: inStudio('bench') };
});
check('the swing is out on the deck', things.swing, things);
check('the studio has the easel, the bench and six canvases', things.easel === 1 && things.bench === 1 && things.canvases === 6, things);

// ---------------- the track down the hill, in a pickup with the phone's stick: from the end of the drive along the yard north of the big house, round the yard's east side and
// down to the cabin's terrace, touching nothing, with the land falling as evenly as it's been cut, and how much it falls as drawn
await g(() => {
  const G = __game, T = 1 / 30, lane = G.map.lanes.filter((l) => measured.includes(l.id) && l.surface === 'dirt').sort((a, b) => b.length - a.length)[0], [a, b] = lane.pts;
  const v = G.vehicles.filter((o) => o.kind === 'pickup' && !o.wrecked).sort((p, q) => Math.hypot(p.x - a[0], p.z - a[1]) - Math.hypot(q.x - a[0], q.z - a[1]))[0];
  G.getIn(v); v.x = a[0]; v.z = a[1]; v.y = G.floorAt(a[0], a[1]); v.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]); v.f = v.s = 0; G.sim(T, T);
  const up = (x, z) => G.hills.at(x, z) * G.hills.uniforms.uHillScale.value;
  // how far along the track the nearest point to x, z is, how far off it that is, and the point `L` metres on along it from there
  const ahead = (x, z, L) => {
    const P = lane.pts; let best = { d: Infinity }, run = 0;
    for (let k = 1; k < P.length; k++) {
      const [ax, az] = P[k - 1], [bx, bz] = P[k], ex = bx - ax, ez = bz - az, l = Math.hypot(ex, ez), f = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (l * l))), d = Math.hypot(x - ax - ex * f, z - az - ez * f);
      if (d < best.d) best = { d, k, f, at: run + l * f };
      run += l;
    }
    let { k, f } = best, left = L;
    for (; k < P.length; k++, f = 0) {
      const [ax, az] = P[k - 1], [bx, bz] = P[k], l = Math.hypot(bx - ax, bz - az);
      if (left <= l * (1 - f)) return { x: ax + (bx - ax) * (f + left / l), z: az + (bz - az) * (f + left / l), at: best.at, end: false };
      left -= l * (1 - f);
    }
    return { x: P.at(-1)[0], z: P.at(-1)[1], at: best.at, end: true };
  };
  window.down = { lane, v, hits: 0, hp: v.hp, off: 0, t: 0, steep: 0, was: [v.x, v.z, up(v.x, v.z)], top: up(v.x, v.z), up, ahead };
  // on along it until it's `to` metres along, with the wheels turned for the curve through the point 4 m on along it from wherever it is, at about 5 m/s, and 3 in a bend
  window.driveDown = (to) => {
    const D = down, K = v.K;
    for (; D.t < 60; D.t += T) {
      const A = D.ahead(v.x, v.z, 4);
      if (A.at >= to || (A.end && Math.hypot(A.x - v.x, A.z - v.z) < 2.5)) break;
      let d = Math.atan2(A.x - v.x, A.z - v.z) - v.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      const wheels = Math.atan(2 * K.wheelbase * Math.sin(d) / Math.max(1, Math.hypot(A.x - v.x, A.z - v.z))), most = K.lock / (1 + Math.abs(v.f) / K.top * 1.5), go = Math.abs(d) > .15 ? 3 : 5;
      G.stick(Math.max(-1, Math.min(1, -wheels / most)), Math.abs(v.f) > go + .5 ? -1 : Math.abs(v.f) > go - .5 ? 0 : 1);
      G.sim(T, T);
      if (v.hp < D.hp) { D.hits++; D.hp = v.hp; }
      D.off = Math.max(D.off, G.map.roadGrid.nearest(v.x, v.z));
      const h = D.up(v.x, v.z), run = Math.hypot(v.x - D.was[0], v.z - D.was[1]); if (run > 1) { D.steep = Math.max(D.steep, Math.abs(h - D.was[2]) / run); D.was = [v.x, v.z, h]; }
    }
  };
});
await g(() => { driveDown(down.lane.length / 2); __game.step(.1); });
await snap('track');
const track = await g(() => {
  const G = __game, D = down, v = D.v; driveDown(Infinity); G.stick(0, 0); for (let k = 0; k < 30; k++) G.sim(1 / 30, 1 / 30);
  const cabin = G.structures.find((s) => s.id === G.compound.CABIN).pts, cx = cabin.reduce((s, p) => s + p[0], 0) / cabin.length, cz = cabin.reduce((s, p) => s + p[1], 0) / cabin.length, end = D.lane.pts.at(-1);
  // what it was cut to fall, as drawn: from its top down to where it's level with the terrace
  const P = G.hills.tracks[0].pts, low = P.at(-1)[2], foot = P.findIndex((p) => p[2] === low);
  let run = 0; for (let k = 1; k <= foot; k++) run += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
  const out = { lane: D.lane.id, length: Math.round(D.lane.length), hits: D.hits, off: +D.off.toFixed(1), t: +D.t.toFixed(1), left: +Math.hypot(end[0] - v.x, end[1] - v.z).toFixed(1), fell: +(D.top - D.up(v.x, v.z)).toFixed(1), steep: Math.round(D.steep * 100), even: Math.round((P[0][2] - low) / run * G.hills.uniforms.uHillScale.value * 100), terrace: Math.abs(G.hills.at(v.x, v.z) - G.hills.terraces[0].at) < .05, cabin: +Math.hypot(v.x - cx, v.z - cz).toFixed(1) };
  G.getOut(true); G.sim(.2, .2); return out;
});
check(`a pickup goes down the ${track.length} m track with the phone's stick, from the end of the drive to the cabin's terrace, ${track.cabin} m from the cabin`, track.left < 4 && track.terrace && track.cabin < 15, track);
check('  touching nothing on the way, and on the track the whole way', track.hits === 0 && track.off < 3, track);
check(`  down ${track.fell} m as drawn, and no steeper than ${track.steep}% as drawn anywhere, where it was cut to fall ${track.even}%`, track.fell > 6 && track.steep <= track.even * 1.25, track);

// ---------------- which way the cinema faces: the screen right up against the cabin's west end with its face to the south, the chairs in rows in front of it facing north,
// and the projector behind them. Then from between the rows, looking north, the screen's straight ahead and fills the view, with the cabin just to its right.
const facing = await g(() => {
  const G = __game, C = G.compound, F = C.CINEMA, s = C.screen(), at = s.position, cabin = G.structures.find((b) => b.id === C.CABIN).pts;
  const wall = Math.min(...cabin.map((p) => p[0])), ends = [Math.min(...cabin.map((p) => p[1])), Math.max(...cabin.map((p) => p[1]))];
  // which way its face looks, from north round through east, and where its ends are
  const ry = s.rotation.y, face = Math.round(Math.atan2(Math.sin(ry), -Math.cos(ry)) * 180 / Math.PI), across = [Math.cos(ry), -Math.sin(ry)], ends2 = [-2, 2].map((k) => [at.x + across[0] * k, at.z + across[1] * k]);
  // a chair faces the way from its back to its seat: the back's the tallest of its boxes and the seat's the flattest
  const chairs = G.wreck.props.filter((p) => p.kind === 'chair' && Math.hypot(p.cx - at.x, p.cz - at.z) < 9).map((p) => {
    const by = [...p.boxes].sort((a, b) => (a.box.max.y - a.box.min.y) - (b.box.max.y - b.box.min.y)).map((h) => h.box.getCenter(at.clone())), seat = by[0], back = by.at(-1);
    return { x: +seat.x.toFixed(1), z: +seat.z.toFixed(1), way: Math.round(Math.atan2(seat.x - back.x, back.z - seat.z) * 180 / Math.PI) };
  });
  const zs = chairs.map((c) => c.z).sort((a, b) => a - b), rows = 1 + zs.filter((z, i) => i && z - zs[i - 1] > .8).length;
  // and from between the rows, looking north, where the screen and the cabin's west wall are across the view, from -1 at its left edge to 1 at its right
  const [x, z] = F.at(3.05, 3.3); G.place(x, z); G.look(0); G.sim(.2, .2); G.step(.1);
  const across2 = (wx, wz) => +at.clone().set(wx, at.y, wz).project(G.camera).x.toFixed(2), left = across2(...ends2[0]), right = across2(...ends2[1]);
  return {
    face, gap: +(wall - Math.max(ends2[0][0], ends2[1][0])).toFixed(2), beside: at.z > ends[0] && at.z < ends[1], chairs, rows, behind: Math.min(...chairs.map((c) => c.z)) - at.z,
    projector: { past: +(C.projector.cz - Math.max(...zs)).toFixed(1), off: +Math.abs(C.projector.cx - at.x).toFixed(1) },
    view: { left, right, cabin: Math.min(across2(wall, at.z), across2(wall, ends[0])) },
  };
});
check(`the screen's face looks south (${facing.face}°), at the north edge of the deck, ${facing.gap} m from the cabin's west end`, Math.abs(facing.face) > 165 && facing.beside && facing.gap > 0 && facing.gap < 1.6, facing);
check(`the chairs are in ${facing.rows} rows in front of it, every one facing north`, facing.rows === 2 && facing.chairs.length === 6 && facing.behind > 1.5 && facing.chairs.every((c) => Math.abs(c.way) < 25), facing.chairs);
check('  and the projector is behind them, in line with the screen', facing.projector.past > .8 && facing.projector.off < .5, facing.projector);
const v = facing.view;
check(`from between the rows, looking north, the screen's straight ahead and fills the view (${v.left} to ${v.right}), with the cabin just to its right (${v.cabin})`, Math.abs(v.left + v.right) < .4 && v.right - v.left > 1 && v.cabin > v.right, v);
await snap('cinema');

// ---------------- the screen
const film = await g(() => {
  const G = __game, C = G.compound, [x, z] = C.CINEMA.at(3.05, 3), [sx, sz] = C.CINEMA.at(3.05, .3); G.place(x, z); G.look(Math.atan2(x - sx, z - sz)); G.sim(.2, .2); G.step(.1);
  const frames = new Set(), flick = new Set();
  for (let i = 0; i < 40; i++) { G.step(.2); frames.add(C.frame().toFixed(3)); flick.add(C.flick().toFixed(3)); }
  return { frames: frames.size, flick: flick.size, on: C.on(), lit: G.horde.lights.includes(C.spot) };
});
check('it counts down', film.frames >= 5, film);
check('it flickers', film.flick > 3, film);
check('the crowd goes for its light', film.lit, film);
await snap('screen');
const crowd = await g(() => {
  const G = __game, C = G.compound, h = G.horde;
  // a few that have wandered near it from the yard and the bank, each of whom might go and stand in it, or might not
  const from = [[4, 22], [12, 18], [22, 8], [-4, 22], [17, 14], [8, 21]], near = h.all.filter((a) => a.state !== undefined && !a.home).slice(0, from.length);
  near.forEach((s, i) => { s.x = C.spot.x + from[i][0]; s.z = C.spot.z + from[i][1]; s.state = 0; s.timer = 0; });
  for (let i = 0; i < 40 * 30; i++) G.sim(1 / 30, 1 / 30);
  return near.map((s) => ({ d: +Math.hypot(s.x - C.spot.x, s.z - C.spot.z).toFixed(1), state: s.state }));
});
check('of a few who wander near, someone ends up watching, for the light and not for him', crowd.some((s) => s.d < 10 && s.state === 0), crowd);
const off = await g(() => { const G = __game, C = G.compound, was = C.projector.hp; G.wreck.breakProp(C.projector, 0, 1); G.sim(.2, .2); return { on: C.on(), lit: G.horde.lights.includes(C.spot), was }; });
check('break the projector and that is the end of it', !off.on && !off.lit, off);

// ---------------- the tank at the shed goes up
const tank = await g(() => {
  const G = __game, C = G.compound, p = C.tank, x = p.cx, z = p.cz, before = G.wreck.fires?.length ?? 0;
  G.place(x + 14, z + 8); G.sim(.1, .1); played.length = 0;
  G.wreck.breakProp(p, 1, 0); for (let i = 0; i < 30; i++) G.sim(1 / 30, 1 / 30);
  return { down: p.down, played: [...played] };
});
check('the tank goes up when it goes', tank.down && tank.played.some((n) => /blast|boom|explo/.test(n)), tank);

// ---------------- and how the cabin and its decks look, standing in a few places, for anyone who's asked for pictures. Nothing's checked after this but the console.
if (shots) for (const [name, from, to] of [['cabin', [1053, 611], [1058.6, 593.3]], ['swing', [1053.6, 598.8], [1060.7, 598.8]], ['studio-door', [1045.4, 599.2], [1044.9, 606]], ['studio', [1044.9, 604.4], [1044.9, 608]]]) {
  await g(([from, to]) => { const G = __game, P = G.player.pos, [x, z] = true2(...from), [tx, tz] = true2(...to); G.place(x, z); G.look(Math.atan2(x - tx, z - tz)); G.step(.8, 1 / 30); }, [from, to]);
  await snap(name);
}

check('no errors on the console', errors.length === 0, errors);
await close();

// ---------------- less motion
{
  const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const still = await page.evaluate(() => {
    const G = __game, C = G.compound; G.pause(); G.jump('town'); G.S.flags.town = true; G.step(.1); const [x, z] = C.CINEMA.at(3.05, 3); G.place(x, z); G.sim(.2, .2);
    const frames = new Set(), flick = new Set(); for (let i = 0; i < 30; i++) { G.step(.2); frames.add(C.frame().toFixed(3)); flick.add(C.flick().toFixed(3)); }
    return { frames: frames.size, flick: flick.size };
  });
  check('with less motion it is a still', still.frames === 1 && still.flick === 1, still);
  check('still no errors', errors.length === 0, errors);
  await close();
}
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('all ok');
