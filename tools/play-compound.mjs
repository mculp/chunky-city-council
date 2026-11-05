// Goes round the compound on Pine Forest Rd on a phone-sized page, with the game's own movement and real taps: up the measured drive from the road, into the woods along the road in a
// pickup, a four-wheeler and a golf cart, which stop them everywhere but the drive, in through every door, plays what's in the shed
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

// ---------------- the taxidermy sign across the road from the drive, side-on to the road with its board running east and west and the carving on both faces, so that it's
// read coming either way, with the plain oval plaque hanging close under its bar and the birdhouse sat on it. What's carved on it is only checked for what it isn't: there's a name, the
// word, and no number. Then he walks into it and it stops him, and a truck driven into one of its faces knocks it down.
const sign = await g(() => {
  const G = __game, S = G.compound.sign, P = G.player.pos, T = 1 / 30, mouth = G.map.lanes.filter((l) => measured.includes(l.id)).sort((a, b) => b.length - a.length)[0].pts[0];
  const ends = [-1.2, 1.2].map((u) => [S.x + S.nz * u, S.z - S.nx * u]), front = (d) => [S.x + S.nx * d, S.z + S.nz * d], V = G.THREE.Vector3, box = (o) => new G.THREE.Box3().setFromObject(o);
  // which way the road runs past it, from the nearest stretch of it
  const road = G.map.roadById.get('pine_forest_rd').pts; let near = Infinity, along = null;
  for (let i = 1; i < road.length; i++) {
    const [ax, az] = road[i - 1], [bx, bz] = road[i], l = Math.hypot(bx - ax, bz - az), t = Math.max(0, Math.min(1, ((S.x - ax) * (bx - ax) + (S.z - az) * (bz - az)) / (l * l))), d = Math.hypot(S.x - ax - (bx - ax) * t, S.z - az - (bz - az) * t);
    if (d < near) { near = d; along = [(bx - ax) / l, (bz - az) / l]; }
  }
  // the way each face looks, as a compass bearing, and how far that is from straight along the road, in degrees
  const looks = S.faces.map((m) => new V(0, 0, 1).applyQuaternion(m.quaternion)), deg = (r) => +(r * 180 / Math.PI).toFixed(1);
  const pb = box(S.plaque), bb = box(S.birdhouse), fb = box(S.faces[0]);
  const out = {
    mouth: +Math.hypot(S.x - mouth[0], S.z - mouth[1]).toFixed(1), off: ends.every(([x, z]) => !G.onRoad(x, z)),
    bearings: looks.map((n) => (deg(Math.atan2(n.x, -n.z)) + 360) % 360), offRoad: Math.max(...looks.map((n) => deg(Math.acos(Math.min(1, Math.abs(n.x * along[0] + n.z * along[1])))))),
    both: S.faces.length === 2 && looks[0].dot(looks[1]) < -.999 && S.faces.every((m) => m.material === S.faces[0].material && !!m.material.map),
    named: S.words.length === 2 && S.words[0].length > 2, word: S.words[1] === 'TAXIDERMY', number: S.words.some((w) => /\d/.test(w)), lit: S.faces.every((m) => m.material.emissiveIntensity > 0),
    // an oval half again as wide as it's tall, about 60% as wide as the board, with nothing on it, close under the bar the birdhouse sits on and clear of the board
    oval: +(Math.max(pb.max.x - pb.min.x, pb.max.z - pb.min.z) / (pb.max.y - pb.min.y)).toFixed(2), wide: +(Math.max(pb.max.x - pb.min.x, pb.max.z - pb.min.z) / Math.max(fb.max.x - fb.min.x, fb.max.z - fb.min.z)).toFixed(2),
    plain: !S.plaque.material.map, under: +(bb.min.y - pb.max.y).toFixed(2), clear: +(pb.min.y - fb.max.y).toFixed(2),
    // sat on the bar, above the top of the board and between the posts
    perched: bb.min.y > fb.max.y + 1 && Math.hypot((bb.min.x + bb.max.x) / 2 - S.x, (bb.min.z + bb.max.z) / 2 - S.z) < 1.2,
  };
  G.place(...front(3)); G.sim(.1, .1); walkTo([front(-1)], .3, 3); out.stopped = +((P.x - S.x) * S.nx + (P.z - S.z) * S.nz).toFixed(2);
  G.place(...front(5)); G.player.yaw = Math.atan2(-S.nx, -S.nz); G.look(Math.atan2(S.nx, S.nz), .05); G.step(1, T);
  return out;
});
await snap('sign');
check(`the taxidermy sign stands across the road from the drive, ${sign.mouth} m from its mouth, off the road and lit a little`, sign.mouth < 20 && sign.off && sign.lit, sign);
check(`  side-on to the road, with a face looking each way along it: they look ${sign.bearings.join('° and ')}°, within ${sign.offRoad}° of the way the road runs`, sign.both && sign.bearings.some((b) => Math.min(b, 360 - b) < 1) && sign.bearings.some((b) => Math.abs(b - 180) < 1) && sign.offRoad < 25, sign);
check('  carved with a name and TAXIDERMY on both faces, and no number', sign.both && sign.named && sign.word && !sign.number, { both: sign.both, named: sign.named, word: sign.word, number: sign.number });
check(`  with a plain oval plaque ${sign.oval} times as wide as it's tall and ${sign.wide} as wide as the board, ${sign.under} m under the top of its bar, and the birdhouse sat on it`, sign.oval > 1.4 && sign.oval < 1.6 && sign.wide > .55 && sign.wide < .68 && sign.plain && sign.under < .35 && sign.clear > .05 && sign.perched, sign);
check(`  walking into it stops him ${sign.stopped} m short of it`, sign.stopped > .1 && sign.stopped < 1, sign.stopped);
const knocked = await g(() => {
  // from far enough off across the lot's dirt to be going as fast as off the road
  const G = __game, S = G.compound.sign, T = 1 / 30, v = G.vehicles.find((o) => o.kind === 'pickup' && !o.wrecked), [x, z] = [S.x + S.nx * 24, S.z + S.nz * 24];
  G.getIn(v); v.x = x; v.z = z; v.y = G.floorAt(x, z); v.yaw = Math.atan2(-S.nx, -S.nz); v.f = v.s = 0; G.sim(T, T);
  let t = 0; for (; t < 5 && !S.prop.down; t += T) { G.stick(0, 1); G.sim(T, T); }
  G.stick(0, 0); for (let k = 0; k < 30; k++) G.sim(T, T); G.getOut(true); G.sim(.2, .2);
  return { down: S.prop.down, t: +t.toFixed(1) };
});
check(`  and a truck driven into one of its faces knocks it down (${knocked.t} s)`, knocked.down, knocked);

// ---------------- what's on the lot round the sign, where it is on the aerial: the green tractor at the south end of a line with the dump trailer and the disc harrow north of it,
// the logs lying east and west, the dumpster, the cream tractor on the grass, the skid and the gravel, each within a metre of where it was measured, and no shed
const lot = await g(() => {
  const G = __game, L = G.compound.lot, at = (p) => p.objs[0].position, off = (p, tx, tz) => { const [x, z] = true2(tx, tz); return +Math.hypot(at(p).x - x, at(p).z - z).toFixed(2); };
  const [green, cream] = L.tractor, [trailer] = L.trailer, [harrow] = L.harrow, [logs] = L.logs, [bin] = L.dumpster, [skid] = L.skid;
  const [x0, z0] = true2(805, 696), [x1, z1] = true2(846, 770), [gx, gz] = true2(820, 752);
  return {
    off: { green: off(green, 815, 733), trailer: off(trailer, 815, 728.8), harrow: off(harrow, 815, 724.8), logs: off(logs, 823, 727), bin: off(bin, 825, 760), cream: off(cream, 842, 761), skid: off(skid, 829, 766), gravel: +Math.hypot(L.gravel.position.x - gx, L.gravel.position.z - gz).toFixed(2) },
    // in a line north and south, the tractor at the south end facing south
    line: Math.abs(at(green).x - at(trailer).x) < .1 && Math.abs(at(trailer).x - at(harrow).x) < .1 && at(green).z > at(trailer).z && at(trailer).z > at(harrow).z && Math.abs(green.objs[0].rotation.y) < .01,
    eastWest: Math.abs(Math.sin(logs.objs[0].rotation.y)) < .01,
    shed: G.structures.filter((s) => s.pts.some(([x, z]) => x > x0 && x < x1 && z > z0 && z < z1)).length,
  };
});
const lotOff = Object.values(lot.off);
check(`the lot has the green tractor, the dump trailer and the disc harrow in a line north from it, the logs, the dumpster, the cream tractor, the skid and the gravel, within ${Math.max(...lotOff)} m of where they were measured`, lotOff.every((d) => d < 1) && lot.line, lot);
check('  the logs lie east and west, and there\'s no shed', lot.eastWest && lot.shed === 0, lot);

// ---------------- the woods along the road in front of it. Off the road flat out into them anywhere along the frontage but the drive, square on and at an angle, a pickup is
// stopped in them, and a four-wheeler and a golf cart, which are narrow enough to get between the trees, are stopped at the fence in front of them. Then the pickup turns in
// off the road at the drive, with the phone's stick, and goes up it.
const woods = await g(() => {
  const G = __game, T = 1 / 30, road = G.map.roadById.get('pine_forest_rd').pts, F = G.compound.front, [cx, cz] = true2(1000, 660);
  // how far off the road's line x, z is, the nearest point of it, and which way's square off it to the east there
  const off = (x, z) => {
    let best = { d: Infinity };
    for (let i = 1; i < road.length; i++) {
      const [ax, az] = road[i - 1], [bx, bz] = road[i], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz), t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (l * l))), qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(x - qx, z - qz);
      if (d < best.d) best = { d, x: qx, z: qz, ex: dz > 0 ? dz / l : -dz / l, ez: dz > 0 ? -dx / l : dx / l };
    }
    return best;
  };
  const away = (kind) => G.vehicles.find((o) => o.kind === kind && !o.wrecked && Math.hypot(o.x - cx, o.z - cz) > 300);
  // nose to the woods from the road's east half, flat out, until it's stopped, and how far off the road's line that is
  const ram = (v, tz, turn) => {
    const q = off(...true2(851, tz)), x = q.x + q.ex * 1.2, z = q.z + q.ez * 1.2;
    G.getIn(v); v.x = x; v.z = z; v.y = G.floorAt(x, z); v.yaw = Math.atan2(q.ex, q.ez) + turn; v.f = v.K.top; v.s = 0; v.hp = v.K.hp; G.sim(T, T);
    for (let t = 0; t < 5 && (t < 1 || Math.hypot(v.f, v.s) > .3); t += T) { G.stick(0, 1); G.sim(T, T); }
    G.stick(0, 0); const d = off(v.x, v.z).d; if (G.driving()) G.getOut(true); G.sim(T, T);
    return d;
  };
  const pickup = away('pickup'), out = { trees: F.trees.length, tries: 0, deepest: 0, fence: 0, small: [] };
  // the small ones first, while the fence is whole
  for (const kind of ['quad', 'golf']) { const v = away(kind); if (v) { out.small.push(kind); for (const tz of kind === 'quad' ? [600, 690, 780] : [640, 710, 765]) out.fence = Math.max(out.fence, ram(v, tz, 0)); } }
  for (let tz = 560; tz <= 795; tz += 15) [0, .5, -.5].forEach((turn, k) => {
    if (Math.abs(tz + k * 5 - 736) < 20) return;
    out.deepest = Math.max(out.deepest, ram(pickup, tz + k * 5, turn)); out.tries++;
  });
  out.deepest = +out.deepest.toFixed(1); out.fence = +out.fence.toFixed(1); out.far = F.far;
  // and in at the drive: south down the road and round to the left up it, with the wheels turned for the point 5 m on along the way from wherever it is, at about 5 m/s
  const lane = G.map.lanes.filter((l) => measured.includes(l.id)).sort((a, b) => b.length - a.length)[0];
  const way = [true2(851, 700), true2(851, 724), true2(851.3, 729.5), true2(853.2, 734), true2(857.4, 736), ...lane.pts.slice(1, 4)], v = pickup, K = v.K;
  const along = [0]; for (let k = 1; k < way.length; k++) along.push(along[k - 1] + Math.hypot(way[k][0] - way[k - 1][0], way[k][1] - way[k - 1][1]));
  const at = (L) => { const k = Math.max(1, along.findIndex((a) => a >= L)), f = (L - along[k - 1]) / (along[k] - along[k - 1]); return k < 1 || L >= along.at(-1) ? way.at(-1) : [way[k - 1][0] + (way[k][0] - way[k - 1][0]) * f, way[k - 1][1] + (way[k][1] - way[k - 1][1]) * f]; };
  G.getIn(v); [v.x, v.z] = way[0]; v.y = G.floorAt(...way[0]); v.yaw = 0; v.f = v.s = 0; v.hp = K.hp; G.sim(T, T);
  let t = 0, gone = 0;
  for (; t < 40 && Math.hypot(way.at(-1)[0] - v.x, way.at(-1)[1] - v.z) > 2.5; t += T) {
    // how far along the way it's got: the nearest of its points from here on, near enough
    for (let L = gone; L < gone + 8; L += .25) { const [px, pz] = at(L), [qx, qz] = at(gone); if (Math.hypot(px - v.x, pz - v.z) < Math.hypot(qx - v.x, qz - v.z)) gone = L; }
    const [ax, az] = at(gone + 5); let d = Math.atan2(ax - v.x, az - v.z) - v.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    const wheels = Math.atan(2 * K.wheelbase * Math.sin(d) / 5), most = K.lock / (1 + Math.abs(v.f) / K.top * 1.5), go = Math.abs(d) > .3 ? 3 : 5;
    G.stick(Math.max(-1, Math.min(1, -wheels / most)), Math.abs(v.f) > go + .5 ? -1 : Math.abs(v.f) > go - .5 ? 0 : 1); G.sim(T, T);
  }
  G.stick(0, 0); out.drive = { up: Math.hypot(way.at(-1)[0] - v.x, way.at(-1)[1] - v.z) <= 2.5, t: +t.toFixed(1), hurt: v.hp < K.hp, long: Math.round(lane.s[3]) };
  if (G.driving()) G.getOut(true); G.sim(.2, .2);
  return out;
});
check(`a pickup flat out off the road into the woods is stopped in them, ${woods.tries} times all along the frontage, square on and at an angle, ${woods.deepest} m from the road at most`, woods.tries >= 30 && woods.deepest < woods.far + 3, woods);
check(`  and a four-wheeler and a golf cart are stopped at the fence in front of them, ${woods.fence} m from the road`, woods.small.length === 2 && woods.fence < 6, woods);
check(`  and it turns in at the drive and goes ${woods.drive.long} m up it, touching nothing`, woods.drive.up && !woods.drive.hurt, woods.drive);

// ---------------- the woods and fence round its north and south sides, down to the river. From outside, flat out at either side all along it, square on and at an angle, the
// fastest car there is and a pickup are stopped in the woods, and a four-wheeler and a golf cart at the fence. Round the river's end of each side every one of them is stopped,
// or drowns in the river past the end of the fence. The woods and what's driven are as they were before each one, and after the last. A length of fence that's gone over
// stays down off line, so the small ones go first on each side, while it's whole, and the rest go at it as the ones before left it.
const round = await g(() => {
  const G = __game, T = 1 / 30, F = G.compound.front, B = F.band, W = G.wreck, [cx, cz] = true2(1000, 660);
  const trees = F.trees.map((t) => W.treeHere(...true2(t.x, t.z))).filter(Boolean), near = (p) => { const [x, z] = G.map.toGame(p.cx, p.cz); return x > 820 && x < 1230 && z > 530 && z < 820; };
  const fresh = () => { for (const t of trees) if (t.down || t.stump || t.burnt || t.lean || t.hp !== undefined) W.mendTree(t); for (const p of W.props) if (p.kind === 'fence' && !p.down && near(p)) p.hp = p.max; };
  const away = (kind) => G.vehicles.find((o) => o.kind === kind && !o.wrecked && Math.hypot(o.x - cx, o.z - cz) > 300), used = new Set();
  const sides = F.fences.filter((r) => r.side >= 0).map((r) => ({ side: r.side, a: G.map.toGame(...r[0]), b: G.map.toGame(...r.at(-1)) }));
  // the side's fence line's z at x, and how far past it into the compound z is
  const lineZ = (S, x) => S.a[1] + (x - S.a[0]) * (S.b[1] - S.a[1]) / (S.b[0] - S.a[0]), into = (S, x, z) => (z - lineZ(S, x)) * (S.side ? -1 : 1);
  const ram = (v, S, tx, turn) => {
    fresh(); W.mendVehicle(v); used.add(v);
    const [x, z] = true2(tx, lineZ(S, tx) + (S.side ? 3 : -3));
    G.getIn(v); v.x = x; v.z = z; v.y = G.floorAt(x, z); v.yaw = (S.side ? Math.PI : 0) + turn; v.f = v.K.top; v.s = 0; G.sim(T, T);
    for (let t = 0; t < 6 && !v.drowned && (t < 1 || Math.hypot(v.f, v.s) > .3); t += T) { G.stick(0, 1); G.sim(T, T); }
    G.stick(0, 0); const [ex, ez] = G.map.toGame(v.x, v.z), r = { past: +into(S, ex, ez).toFixed(1), drowned: !!v.drowned };
    if (G.driving()) G.getOut(true); G.sim(T, T);
    return r;
  };
  const fast = away('coupe99') ?? away('coupe'), pickup = away('pickup'), out = { tries: 0, deepest: -Infinity, small: -Infinity, smallKinds: [], end: 0, drowned: 0, endDeepest: -Infinity, fast: fast?.kind, band: B.far };
  for (const S of sides) {
    for (const [kind, k] of [['quad', .3], ['golf', .45], ['quad', .6], ['golf', .75]]) { const v = away(kind); if (!v) continue; if (!out.smallKinds.includes(kind)) out.smallKinds.push(kind); out.small = Math.max(out.small, ram(v, S, S.a[0] + (S.b[0] - S.a[0]) * k, 0).past); }
    for (let tx = S.a[0] + 10; tx < S.b[0] - 8; tx += 30) [[fast, 0], [pickup, .5], [fast, -.5], [pickup, 0]].forEach(([v, turn]) => { out.deepest = Math.max(out.deepest, ram(v, S, tx, turn).past); out.tries++; });
    // and round the river's end of it, straight in and angled down the bank either way
    for (const dx of [-3, 0, 2]) for (const v of [away('quad'), pickup, fast]) for (const turn of [0, .35, -.35]) { const r = ram(v, S, S.b[0] + dx, turn); out.end++; if (r.drowned) out.drowned++; else out.endDeepest = Math.max(out.endDeepest, r.past); }
  }
  fresh(); for (const v of used) W.mendVehicle(v);
  return out;
});
check(`a car flat out at the compound's north or south side from outside is stopped in its woods, ${round.tries} times all along both sides, square on and at an angle, ${round.deepest} m in at most`, round.tries >= 40 && round.fast && round.deepest < round.band, round);
check(`  and a four-wheeler and a golf cart are stopped at its fence, ${-round.small} m short of it`, round.smallKinds.length === 2 && round.small < 0, round);
check(`  and round the river's end of each side none gets in: ${round.drowned} of ${round.end} drown in the river past the fence's end, and the rest go ${round.endDeepest} m in at most`, round.end >= 50 && round.drowned > 0 && round.endDeepest < round.band, round);

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
  check(`  and a tap plays it, as loud as anything`, after.played.some((n) => n.startsWith('jam.')) && (after.noises > before.noises || after.heard?.r >= 40), after);
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
  // and the skillet on it is loud too, and doesn't put it down right away
  const hp = drums.prop.hp; played.length = 0; G.key('f', true); G.step(.05); G.key('f', false); for (let i = 0; i < 18; i++) G.sim(1 / 30, 1 / 30);
  return { act, beats, hp, after: drums.prop.hp, down: drums.prop.down, hit: played.filter((n) => n.startsWith('jam.')) };
});
check('playing them straight off, the second beat is the cymbal', again.beats.length >= 2 && again.beats[0] === 'jam.drum' && again.beats[1] === 'jam.cymbal', again.beats);
check('hitting the drums with the skillet sounds them and chips them', again.after < again.hp && !again.down && again.hit.length > 0, again);

// ---------------- nobody in it: two minutes of him in the shed with the drums going now and then, and six of the crowd about the road by the drive, who'd have it that home's
// up the drive. None of them comes in, and three flung in off the road walk back out to it. The crowd's only about within 150 m of him, so it's here by the road that this can happen at all.
const kept = await g(() => {
  const G = __game, h = G.horde, Z = h.zones.find((a) => a.out), inside = (s) => s.x > Z.x0 && s.x < Z.x1 && s.z > Z.z0 && s.z < Z.z1, drums = G.compound.JAM[0], [ox, oz] = Z.out;
  const crowd = h.all.filter((a) => a.state !== undefined && !a.home && !a.flat).slice(0, 9), at = [[-4, -30], [-3, -12], [-2, 6], [-4, 18], [1, -40], [0, 40], [12, -2], [24, -3], [16, 0]];
  crowd.forEach((s, i) => { s.x = s.tx = ox + at[i][0]; s.z = s.tz = oz + at[i][1]; s.state = 0; s.timer = 0; });
  const road = crowd.slice(0, 6), flung = crowd.slice(6), was = flung.every(inside), [hx, hz] = true2(880, 734);
  for (const s of road) { s.homeX = hx; s.homeZ = hz; }
  let came = 0, left = null;
  for (let t = 1; t <= 120; t++) {
    // the same noise the drums make when they're played
    if (t % 20 === 1) h.noise(drums.x, drums.z, 40, 3, 'jam');
    G.sim(1, 1 / 30);
    came += road.filter(inside).length;
    if (left === null && !flung.some(inside)) left = t;
  }
  return { n: crowd.length, was, came, left, still: crowd.filter(inside).length };
});
check(`over two minutes with the drums going, none of the crowd about the road comes in, and three flung in off it walk back out in ${kept.left} s`, kept.n === 9 && kept.was && kept.came === 0 && kept.left !== null && kept.left < 60 && kept.still === 0, kept);
// and one chasing him up Pine Forest Rd gives up at the road when he turns in at the drive
const chase = await g(() => {
  const G = __game, h = G.horde, P = G.player.pos, Z = h.zones.find((a) => a.out), inside = (s) => s.x > Z.x0 && s.x < Z.x1 && s.z > Z.z0 && s.z < Z.z1, T = 1 / 30;
  const s = h.all.find((a) => a.state !== undefined && !a.home && !a.flat && a.quiet === false && !inside(a));
  G.place(...true2(852.5, 745)); G.sim(.1, .1);
  [s.x, s.z] = true2(856, 768); s.tx = s.x; s.tz = s.z; s.state = 0; s.timer = 0; G.sim(.1, .1);
  h.provoke(s, 'swing');
  let t = 0, hunted = false, went = false;
  for (; t < 1.6; t += T) { G.sim(T, T); hunted ||= s.state === 2; }
  walkTo([true2(851.8, 737.5), true2(880, 734)], .8, 12);
  for (let k = 0; k < 20 * 30; k++) { G.sim(T, T); hunted ||= s.state === 2; went ||= inside(s); }
  return { hunted, went, state: s.state, grabbed: !!h.grab, him: inside({ x: P.x, z: P.z }), at: [+(s.x - Z.x0).toFixed(1), +(s.z - Z.z1).toFixed(1)] };
});
check('one chasing him up the road gives up at the road when he turns in at the drive, and never sets foot in it', chase.hunted && chase.him && !chase.went && chase.state !== 2 && !chase.grabbed, chase);

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
check('its light is one the crowd goes for, though none of them can get in to it', film.lit, film);
await snap('screen');
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
