// Goes round the yard off True Light Rd on a phone-sized page, with the game's own movement and real taps: up the measured drive from the road, round the house, swims the pool, gets stopped by the net,
// keeps the ball up six times in a row with the stick and the button, takes the bat that gets him, bounces on the trampoline, gets in the white Camaro, sits down low in it with the roof over
// his head, and drives it out. Then the yard light and the crowd.
//
//   npm i && npm run yard [-- --shots dir]
import { mkdirSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) { await g(() => __game.step(1 / 12)); await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); } };
const tap = async () => { await page.tap('#bA'); await page.waitForTimeout(20); await g(() => __game.sim(1 / 30, 1 / 30)); };

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
  window.buttonSays = () => document.getElementById('bA').textContent;
});

// ---------------- what's there
const built = await g(async () => {
  const G = __game, data = await (await fetch('data/lanes.json')).json();
  const ids = [74875999, 74725728, 75175622, 900014], found = ids.filter((id) => G.structures.some((s) => s.id === id));
  const notGone = [75415198, 74605951].filter((id) => G.structures.some((s) => s.id === id));
  const inside = (x, z) => G.houseAt(...true2(x, z))?.id ?? null;
  const here = data.lanes.filter((l) => l.measured && l.points.some(([x, z]) => Math.hypot(x + 1550, z + 790) < 60)).map((l) => l.id);
  const road = G.map.lanes.filter((l) => l.name === 'True Light Rd').length;
  const [mx, mz] = true2(-1634.7, -609.3), bars = G.map.closedLanes.filter((c) => Math.hypot(c.x - mx, c.z - mz) < 300).length;
  return {
    want: ids.length, found: found.length, notGone, here, road, bars,
    // the house's east side, the notch out of its north-west corner, the big building, the notch out of that, and the shed
    house: inside(-1545, -770), houseNotch: inside(-1558, -780), big: inside(-1528, -800), bigNotch: inside(-1536, -813), shed: inside(-1505, -806),
    pool: G.water.ponds.some((p) => p.id === 'pool-2'), pond: G.water.ponds.some((p) => p.id === 'extra-6'),
    coupe: G.vehicles.filter((v) => v.kind === 'coupe').map((v) => ({ d: +Math.hypot(v.x - true2(-1541, -787)[0], v.z - true2(-1541, -787)[1]).toFixed(1), r: +v.paint.r.toFixed(2), g: +v.paint.g.toFixed(2), b: +v.paint.b.toFixed(2) })),
    white: [[-1506.9, -796.7], [-1503.6, -797.2]].map(([x, z]) => { const [wx, wz] = true2(x, z); return +Math.min(...G.vehicles.map((v) => Math.hypot(v.x - wx, v.z - wz))).toFixed(1); }),
  };
});
check('every building is in the game', built.found === built.want, built);
check("the two that aren't on the aerial are gone", built.notGone.length === 0, built.notGone);
check('the house is L-shaped and the big building has its notch', built.house === 74875999 && built.houseNotch === null && built.big === 74725728 && built.bigNotch === null && built.shed === 75175622, built);
check('True Light Rd is one road, with no barricade across it near the drive', built.road === 1 && built.bars === 0, built);
check('the pool and the farm pond are there', built.pool && built.pond, built);
check('one Camaro, where it was left, and it\'s white', built.coupe.length === 1 && built.coupe[0].d < .5 && built.coupe[0].r > .6 && built.coupe[0].g > .6 && built.coupe[0].b > .5, built.coupe);
check('the white truck and car are by the little shed', built.white.every((d) => d < 1), built.white);

// ---------------- up the drive from the road, on foot, and round the house
const drive = await g(async () => {
  const G = __game, P = G.player.pos, data = await (await fetch('data/lanes.json')).json(), lane = data.lanes.filter((l) => l.measured && l.width === 4 && l.points.some(([x, z]) => Math.hypot(x + 1550, z + 790) < 60))[0], pts = lane.points.map(([x, z]) => true2(x, z));
  G.place(pts[0][0], pts[0][1]); G.sim(.1, .1);
  let off = 0, long = 0; const r = walkTo(pts.slice(1), .8, 200);
  for (let i = 1; i < pts.length; i++) { long += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); for (let k = 0; k <= 12; k++) { const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k / 12, z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k / 12; if (!G.onRoad(x, z)) off++; } }
  return { r, off, long, stuck: r.t > 190 };
});
check(`he walks the ${Math.round(drive.long)} m up the drive with nothing in the way`, drive.r.off < 1.2 && !drive.stuck, drive);
check('it is road the whole way', drive.off === 0, drive.off);

// ---------------- the Camaro
const coupe = await g(() => {
  const G = __game, v = G.vehicles.find((o) => o.kind === 'coupe'), a = v.yaw + Math.PI / 2, off = v.K.width / 2 + 1;
  G.place(v.x + Math.sin(a) * off, v.z + Math.cos(a) * off); G.sim(.2, .1);
  return { act: G.S.act, button: buttonSays() };
});
check('it says to get in the Camaro, and nothing else about it', coupe.act === 'Get in the Camaro' && coupe.button.replace(/\s/g, '') === 'GETIN', coupe);
await snap('camaro');

// ---------------- the pool
const pool = await g(() => {
  const G = __game, P = G.player.pos, p = G.water.ponds.find((q) => q.id === 'pool-2'), cx = p.ring.reduce((s, q) => s + q[0], 0) / p.ring.length, cz = p.ring.reduce((s, q) => s + q[1], 0) / p.ring.length;
  const [ax, az] = true2(-1538, -773.5), [bx, bz] = true2(-1524, -771);
  G.place(ax, az); G.sim(.1, .1);
  const modes = new Set(); let t = 0; G.key('w', true);
  while (t < 30 && Math.hypot(P.x - bx, P.z - bz) > .8) { G.look(Math.atan2(P.x - bx, P.z - bz)); G.sim(1 / 30, 1 / 30); t += 1 / 30; modes.add(G.S.mode); }
  G.key('w', false); G.sim(.1, .1);
  return { modes: [...modes], off: +Math.hypot(P.x - bx, P.z - bz).toFixed(1), mode: G.S.mode, deep: G.water.level(cx, cz) - G.floorAt(cx, cz) };
});
check('he goes in, swims it and climbs out the other side', pool.modes.includes('swim') && pool.mode === 'town' && pool.off < 1.2, pool);

// ---------------- the net
const net = await g(() => {
  const G = __game, Y = G.yard, P = G.player.pos, c = Y.COURT, on = (u, v) => [c.x + u * c.ax - v * c.az, c.z + u * c.az + v * c.ax], side = () => (P.x - c.x) * c.ax + (P.z - c.z) * c.az, [ax, az] = on(-2, 0), [bx, bz] = on(2, 0), [ox, oz] = on(0, 6), [ex, ez] = on(2.5, 2);
  G.place(ax, az); G.sim(.1, .1);
  const r = walkTo([[bx, bz]], .6, 4), through = side() > 0;
  const round = (() => { G.place(ax, az); G.sim(.1, .1); return walkTo([on(-1, 6), [ox, oz], on(1, 6), [ex, ez]], .6, 30); })();
  return { r, through, round, past: side() > 0 };
});
check('the net stops him', !net.through, net);
check('and he can go round it', net.past && net.round.off < 1, net);

// ---------------- keeping it up, with the stick and the button
const start = await g(() => {
  // a frame has to be drawn before what's near him is shown, and the ball's ring only shows if the ball's group does
  const G = __game, Y = G.yard, B = Y.BALL; G.place(B.x + 1, B.z); G.sim(.1, .1); G.step(1 / 30, 1 / 30);
  return { act: G.S.act, button: buttonSays(), air: B.air, count: B.count };
});
check('beside the ball it says to bump it, and the button says BUMP', start.act === 'Bump the ball' && start.button === 'BUMP' && !start.air, start);
const seen = await (async () => {
  let bumps = 0, last = null, ring = false, says = true;
  for (let i = 1; i <= 6; i++) {
    await tap();
    last = await g(() => { const G = __game, B = G.yard.BALL; return { count: B.count, air: B.air, played: played.at(-1), up: B.vy > 0, toast: document.getElementById('toast').textContent }; });
    if (last.count !== i) break;
    bumps = i;
    if (i === 2) await snap('ball-up');
    const under = await g(() => {
      // he goes to where the ring says it's coming down, then waits with his arms ready
      const G = __game, Y = G.yard, B = Y.BALL, P = G.player.pos, T = 1 / 30; let t = 0, ring = false, said = true;
      G.key('w', true);
      while (t < 4 && !(B.vy < 0 && Y.ballInReach(B, P.x, P.z, P.y) && B.y - P.y < 1.5)) {
        const d = Math.hypot(B.landX - P.x, B.landZ - P.z);
        if (d > .4) { G.look(Math.atan2(P.x - B.landX, P.z - B.landZ)); G.key('w', true); } else G.key('w', false);
        G.sim(T, T); t += T; ring = ring || Y.ring.visible; said = said && G.S.act === 'Bump the ball';
      }
      G.key('w', false);
      return { t: +t.toFixed(2), ready: Y.ballInReach(B, P.x, P.z, P.y), ring, said };
    });
    ring = ring || under.ring; says = says && under.said;
    if (!under.ready) { last.under = under; break; }
  }
  return { bumps, last, ring, says };
})();
check('six in a row with one thumb and one button', seen.bumps === 6, seen);
check('it counts up, and the sixth says so', seen.last.toast === '6 in a row.', seen.last);
check('it sounds like something', seen.last.played === 'ball.bump', seen.last);
check('a ring shows where it\'s coming down', seen.ring, seen);
check('the button stays BUMP all the time it\'s up', seen.says, seen);
const dropped = await g(() => {
  const G = __game, B = G.yard.BALL; played.length = 0; let t = 0;
  G.place(B.x + 20, B.z); while (B.air && t < 6) { G.sim(1 / 30, 1 / 30); t += 1 / 30; }
  return { count: B.count, best: B.best, air: B.air, played: [...played], six: G.S.flags.sixInARow };
});
check('left alone it comes down, and that\'s the end of the run', dropped.count === 0 && !dropped.air && dropped.best >= 6 && dropped.six, dropped);
check('you hear it land', dropped.played.includes('ball.land'), dropped.played);

// ---------------- the bat
const bat = await g(() => {
  const G = __game, Y = G.yard, A = Y.BAT_AT; G.S.flags.sixInARow = false; G.place(A.x, A.z + 1.2); G.sim(.1, .1);
  const before = { reach: Y.batInReach(), act: G.S.act, prompt: document.getElementById('prompt')?.textContent, button: buttonSays() };
  G.key('e', true); G.sim(1 / 30, 1 / 30); G.key('e', false); G.sim(1 / 30, 1 / 30);
  const kept = !G.S.flags.bat;
  G.sim(1, 1 / 30); G.S.flags.sixInARow = true; G.sim(1 / 30, 1 / 30);
  return { before, kept, after: { act: G.S.act, button: buttonSays() } };
});
check('in the little shed, the bat isn\'t his until he\'s done six', bat.before.reach && bat.before.act === null && bat.before.prompt === '6 in a row takes the bat' && bat.kept, bat);
check('then it says to take it', bat.after.act === 'Take the bat' && bat.after.button === 'TAKE', bat.after);
await snap('shed');
await tap();
const got = await g(() => {
  const G = __game, Y = G.yard; G.sim(.1, .1);
  const out = { bat: G.S.flags.bat, gone: !Y.BAT_AT.prop.objs[0].visible, act: G.S.act, toast: document.getElementById('toast').textContent };
  G.key('f', true); G.sim(1 / 30, 1 / 30); G.key('f', false); G.sim(.1, 1 / 30); out.tool = Y.tool().visible; G.sim(1, 1 / 30);
  return out;
});
check('a tap takes it, and it\'s gone from the wall', got.bat && got.gone && got.act === null, got);
check('he swings it now', got.tool, got);

// ---------------- the trampoline
const tramp = await g(() => {
  const G = __game, Y = G.yard, P = G.player.pos, T = Y.TRAMP, Y0 = G.floorAt(T.x + 8, T.z);
  G.place(T.x + 3.4, T.z); G.sim(.1, .1);
  // a normal jump off the ground, for comparison
  let plain = 0; G.key(' ', true); G.sim(1 / 30, 1 / 30); G.key(' ', false); for (let i = 0; i < 40; i++) { G.sim(1 / 30, 1 / 30); plain = Math.max(plain, P.y - Y0); }
  G.place(T.x, T.z); P.y = Y0 + T.top + 1; G.player.grounded = false; G.player.vy = 0;
  played.length = 0; let peak = 0, times = 0, was = false;
  for (let i = 0; i < 150; i++) { G.sim(1 / 30, 1 / 30); peak = Math.max(peak, P.y - Y0); const up = G.player.vy > 0; if (up && !was) times++; was = up; }
  return { plain: +plain.toFixed(2), peak: +peak.toFixed(2), times, played: [...played], grounded: G.player.grounded };
});
check(`it throws him higher than he can jump: ${tramp.peak} m to ${tramp.plain} m, and keeps doing it`, tramp.peak > tramp.plain + 1 && tramp.times >= 2, tramp);
check('and it creaks', tramp.played.includes('tramp.spring'), tramp.played);

// ---------------- the yard light and the crowd
const light = await g(() => {
  const G = __game, Y = G.yard; G.place(Y.spot.x + 12, Y.spot.z + 12); G.bringOutCrowd(); G.sim(.1, .1);
  return { lit: G.horde.lights.includes(Y.spot), on: Y.on() };
});
check('the crowd goes for the yard light', light.lit && light.on, light);
const bump = await g(() => {
  const G = __game, H = G.horde, Y = G.yard, B = Y.BALL; H.calm(); H.all.length = 0; G.place(B.x + 1, B.z); const s = H.add(B.x + 6, B.z); G.sim(.2, 1 / 30); H.noises.length = 0;
  G.key('e', true); G.sim(1 / 30, 1 / 30); G.key('e', false); G.sim(1 / 30, 1 / 30);
  const n = H.noises.at(-1); H.all.length = 0; return { heard: n?.r, count: B.count };
});
check('the ball makes enough noise to be heard, a bit', bump.heard === 18, bump);
const out = await g(() => { const G = __game, Y = G.yard; G.wreck.breakProp(Y.pole, 0, 1); G.sim(.2, .2); return { on: Y.on(), lit: G.horde.lights.includes(Y.spot) }; });
check('breaking the pole puts it out, and they lose interest', !out.on && !out.lit, out);

// ---------------- out in the Camaro, by the real drive
const away = await g(() => {
  const G = __game, T = G.THREE, v = G.vehicles.find((o) => o.kind === 'coupe'), a = v.yaw + Math.PI / 2, off = v.K.width / 2 + 1;
  G.horde.all.length = 0; G.place(v.x + Math.sin(a) * off, v.z + Math.cos(a) * off); G.sim(.2, .1);
  G.key('e', true); G.sim(1 / 30, 1 / 30); G.key('e', false); G.sim(.5, 1 / 30); G.step(1 / 30);
  // How high he reaches in it, sat where it's parked: him on his own, drawn side on and square to it, and the rows he covers read off as metres above the ground under it. It's 1.28 m to
  // the roof and the bottom of it's 0.18 m up.
  const r = G.renderer, cam = new T.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, .1, 20), hid = [];
  const his = (o) => { for (let p = o; p; p = p.parent) if (p === G.heroRoot) return true; return false; };
  G.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible && !his(o)) { o.visible = false; hid.push(o); } });
  const side = v.yaw - Math.PI / 2; cam.position.set(v.x + Math.sin(side) * 8, v.y + .75, v.z + Math.cos(side) * 8); cam.lookAt(v.x, v.y + .75, v.z);
  const clear = r.getClearAlpha(); r.setClearAlpha(0); r.render(G.scene, cam); r.setClearAlpha(clear);
  const W = r.domElement.width, H = r.domElement.height, cv = Object.assign(document.createElement('canvas'), { width: W, height: H }), x2 = cv.getContext('2d'); x2.drawImage(r.domElement, 0, 0);
  for (const o of hid) o.visible = true;
  const px = x2.getImageData(0, 0, W, H).data; let high = H, low = -1;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 20) { const row = Math.floor(i / 4 / W); high = Math.min(high, row); low = Math.max(low, row); }
  const up = (row) => +(2.25 - row * 3 / H).toFixed(2), head = up(high), under = up(low);
  const inIt = G.driving()?.kind, x0 = v.x, z0 = v.z; G.key('w', true); let top = 0; for (let i = 0; i < 90; i++) { G.sim(1 / 30, 1 / 30); top = Math.max(top, v.f); } G.key('w', false);
  return { inIt, head, under, moved: +Math.hypot(v.x - x0, v.z - z0).toFixed(1), top: +top.toFixed(1), hp: v.hp, sound: v.K.sound };
});
check('he sits down low in it, with his head under the roof and nothing of him under the floor', away.head > 1 && away.head < 1.29 && away.under > .18, away);
check('he gets in it and it goes', away.inIt === 'coupe' && away.moved > 10 && away.top > 8, away);
await snap('in-the-camaro');

check('no console errors', errors.length === 0, errors);
console.log(failed ? `${failed} failed` : 'all ok');
await close();
process.exitCode = failed ? 1 : 0;
