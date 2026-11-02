// Goes round the compound on Pine Forest Rd on a phone-sized page, with the game's own movement and real taps: up the measured drive from the road, in through every door, plays what's in the shed
// with the crowd listening, swims the pool, watches the screen, and breaks the projector and the tank. Then that a still of the screen is all there is for anyone who's asked for less motion.
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
  const G = __game, ids = [75099630, 75190940, 900004, 900005, 900006, 900007, 900009, 900010, 900011, 900012, 900013];
  const found = ids.filter((id) => G.structures.some((s) => s.id === id));
  const lanes = G.map.lanes.filter((l) => measured.includes(l.id)).map((l) => l.id); window.measured = measured;
  const parked = [[1034.1, 640.5], [1000.6, 652.6], [1028.6, 669.1], [1031.9, 669.9]].filter(([x, z]) => { const [wx, wz] = true2(x, z); return G.vehicles.some((v) => Math.hypot(v.x - wx, v.z - wz) < 1); }).length;
  const spots = [[1034.1, 640.5], [1000.6, 652.6], [1028.6, 669.1], [1031.9, 669.9]].map(([x, z]) => { const [wx, wz] = true2(x, z); return +Math.min(...G.vehicles.map((v) => Math.hypot(v.x - wx, v.z - wz))).toFixed(1); });
  return { want: ids.length, found: found.length, lanes, parked, spots, jam: G.compound.JAM.map((j) => j.name) };
});
check('every building is in the game', built.found === built.want, built);
check('the drive and what comes off it are the measured ones', built.lanes.length === 5, built.lanes);
check('the truck, the car and the two trucks are parked where they were', built.parked === 4, built.spots);
check('the room has drums, a guitar, a bass and a keyboard', built.jam.join() === 'drums,guitar,bass,keyboard', built.jam);

// ---------------- up the drive from the road, on foot
const drive = await g(() => {
  const G = __game, P = G.player.pos, lane = G.map.lanes.filter((l) => measured.includes(l.id)).sort((a, b) => b.pts.length - a.pts.length)[0];
  const pts = lane.pts; G.place(pts[0][0], pts[0][1]); G.sim(.1, .1);
  let off = 0; const r = walkTo(pts.slice(1).map(([x, z]) => [x, z]), .8, 200);
  for (let i = 2; i < pts.length; i++) for (let k = 0; k <= 12; k++) { const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k / 12, z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k / 12; if (!G.onRoad(x, z) || G.pavedAt(x, z)) off++; }
  return { r, off, long: lane.length, end: [P.x, P.z] };
});
check(`he walks the ${Math.round(drive.long)} m up the drive with nothing in the way`, drive.r.off < 1.2, drive);
check('it is gravel from end to end', drive.off === 0, drive.off);
await snap('yard');

// ---------------- no woods where it's been cleared
const clear = await g(() => {
  const G = __game, trees = G.wreck.trees, D = G.compound.DECK, L = G.compound.LAWN, spots = { deck: D.at(7.7, 4.6), lawn: L.at(5, 5.9) }, out = {};
  for (const [k, [x, z]] of Object.entries(spots)) { G.place(x, z); G.sim(.1, .1); out[k] = trees(x, z, 6).length; }
  return out;
});
check('no trees on the deck or the lawn', clear.deck === 0 && clear.lawn === 0, clear);

// ---------------- in through every door
const doors = await g(() => {
  const G = __game, P = G.player.pos, out = {};
  for (const id of [75099630, 75190940, 900004, 900005, 900006, 900007, 900009, 900011, 900013]) {
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

// ---------------- the screen
const film = await g(() => {
  const G = __game, C = G.compound, [x, z] = C.LAWN.at(5, 7); G.place(x, z); G.sim(.2, .2); G.step(.1);
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
  // one that's wandered near it goes and stands in it
  const s = h.all.find((a) => a.state !== undefined); s.x = C.spot.x + 22; s.z = C.spot.z + 8; s.state = 0;
  for (let i = 0; i < 40 * 30; i++) G.sim(1 / 30, 1 / 30);
  return { d: +Math.hypot(s.x - C.spot.x, s.z - C.spot.z).toFixed(1) };
});
check('someone who wanders near ends up watching', crowd.d < 22, crowd);
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

check('no errors on the console', errors.length === 0, errors);
await close();

// ---------------- less motion
{
  const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const still = await page.evaluate(() => {
    const G = __game, C = G.compound; G.pause(); G.jump('town'); G.S.flags.town = true; G.step(.1); const [x, z] = C.LAWN.at(5, 7); G.place(x, z); G.sim(.2, .2);
    const frames = new Set(), flick = new Set(); for (let i = 0; i < 30; i++) { G.step(.2); frames.add(C.frame().toFixed(3)); flick.add(C.flick().toFixed(3)); }
    return { frames: frames.size, flick: flick.size };
  });
  check('with less motion it is a still', still.frames === 1 && still.flick === 1, still);
  check('still no errors', errors.length === 0, errors);
  await close();
}
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('all ok');
