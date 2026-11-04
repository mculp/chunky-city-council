// Gets out of a moving pickup on a phone-sized page with real taps of GET OUT (CHUNKY-168). At a walk he steps out of it as ever. Any faster, he goes out of his
// side headfirst, hits the ground and rolls along it the way it was going, farther the faster, lies face down a moment and is up again within three seconds, and
// none of it costs him a heart. The camera stays upright through it with him on the screen, and shakes a little when he lands. The pickup goes on without him with
// its door hanging open, wanders off its line, slows and stops, and the door shuts when he gets back in. Or it hits what's in front of it: a house, or the crowd,
// who go flying at 40 mph and up and are knocked down slower, while the cast hop out of its way. While he's rolling, the river, a fire, traffic and a train still
// do what they do. Then again with reduced motion, when he's down beside the door at once, and gets up.
//
//   npm i && npm run bail [-- --shots dir]
import { mkdirSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const mph = (s) => Math.round(s * 2.237);
const f1 = (x) => (x ?? NaN).toFixed(1);

async function open(reducedMotion) {
  const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, reducedMotion });
  const g = (fn, arg) => page.evaluate(fn, arg);
  const snap = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}${reducedMotion ? '-reduced' : ''}.jpg`, type: 'jpeg', quality: 82 }); };
  await g(() => {
    const G = __game, T = 1 / 30, M = G.map, W = G.wreck;
    G.pause(); G.jump('town'); G.S.flags.town = true; G.S.flags.ended = G.S.flags.arrived = true; G.step(.2);
    document.getElementById('card').style.display = 'none';
    window.G = G; window.T = T; window.P = () => G.player.pos;
    // 260 m of US 80 west of town, going east in its right-hand lane, with the poles and the trees along it out of the way, which would stop him rolling
    const s0 = M.sOn('us_80', ...M.fromTrue(-640, -18)), s1 = M.sOn('us_80', ...M.fromTrue(-380, -18)), way = Math.sign(s1 - s0), len = Math.abs(s1 - s0);
    window.road = (k, off = 1.9) => { const q = M.along('us_80', s0 + way * k), fx = q.tx * way, fz = q.tz * way; return { x: q.x - fz * off, z: q.z + fx * off, yaw: Math.atan2(fx, fz), s: s0 + way * k, way }; };
    // each falling away from the road
    const off = (x, z) => { const q = M.along('us_80', M.sOn('us_80', x, z)), d = Math.hypot(x - q.x, z - q.z) || 1; return { k: (M.sOn('us_80', x, z) - s0) * way, d, ux: (x - q.x) / d, uz: (z - q.z) / d }; };
    for (const p of W.props) { if (p.down) continue; const o = off(p.cx, p.cz); if (o.k > -20 && o.k < len + 20 && o.d < 12) W.breakProp(p, o.ux, o.uz); }
    for (let k = -20; k < len + 20; k += 8) { const q = road(k, 0); for (const t of W.trees(q.x, q.z, 16)) if (!t.down) { const o = off(t.x, t.z); W.fellTree(t, o.ux, o.uz); } }
    G.sim(4, T);
    // what the game asks the sound for from here on, whether or not the sound's on yet
    const play = G.sound.play; let asked = [];
    G.sound.play = function (name, o) { asked.push([name, o?.rate ?? 1]); return play.call(this, name, o); };
    window.listen = () => { asked = []; };
    window.heard = () => asked;
    // a pickup that'll go, and him stood at its door
    window.pickup = () => G.vehicles.find((o) => o.kind === 'pickup' && !o.wrecked && !o.drowned && !o.loose && !o.coast && !o.ai);
    window.beside = (v) => { const a = v.yaw + Math.PI / 2, off = v.K.width / 2 + 1; G.place(v.x + Math.sin(a) * off, v.z + Math.cos(a) * off); G.player.inv = 0; G.player.kb.set(0, 0); G.step(.6, T); return G.state().prompt; };
    // in it, going so fast along `at` with the stick let go and the camera behind, and listening. Nobody's touched the camera for longer than it
    // waits to go where it wants to by itself, as nobody has whose thumb is on the button.
    window.go = (speed, at) => {
      const v = G.driving(); Object.assign(v, { x: at.x, z: at.z, y: G.floorAt(at.x, at.z), yaw: at.yaw, f: speed, s: 0, steer: 0, grounded: true, hp: v.K.hp });
      G.look(at.yaw + Math.PI, .25); G.stick(0, 1);
      // going, and kept where it was asked to be while the camera comes round behind it
      for (let i = 0; i < 40; i++) { G.step(T, T); Object.assign(v, { x: at.x, z: at.z, y: G.floorAt(at.x, at.z), yaw: at.yaw, f: speed, s: 0, steer: 0 }); }
      G.stick(0, 0); G.player.inv = 0; G.step(T, T); v.f = speed; v.s = 0;
      listen(); window.was = v;
      const b = document.getElementById('bA');
      return { button: b.innerText.replace(/\s+/g, ' '), shown: !b.hidden && b.getBoundingClientRect().width > 0, speed: Math.hypot(v.f, v.s), x: v.x, z: v.z, yaw: v.yaw, kind: v.kind, w: v.K.width };
    };
    // A step at a time with it all drawn, from the tap on: how he goes and how it looks, and the pickup going on without him, until he's up and it's stopped.
    // each(t) is called every step, for whatever a case needs to do or see along the way.
    window.after = (v, { seconds = 14, each = null } = {}) => {
      const THREE = G.THREE, cam = G.camera, right = new THREE.Vector3(), q = new THREE.Vector3(), r0 = G.bail.roll();
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), from = { x: P().x, z: P().z }, vx0 = v.x, vz0 = v.z, yaw0 = v.yaw, hp0 = G.S.hp, sp0 = Math.hypot(v.f, v.s);
      const seen = (x, y, z) => { q.set(x, y, z).project(cam); return Math.abs(q.x) < 1 && Math.abs(q.y) < 1 && q.z < 1; };
      const o = { first: r0 && { phase: r0.phase, beta: r0.beta }, kind0: G.HP.kind, mode: G.S.mode, driving: !!G.driving(), side: (P().x - v.x) * fz - (P().z - v.z) * fx, ahead: (P().x - v.x) * fx + (P().z - v.z) * fz, hp0,
        inv: G.player.inv, hoods: new Set(), tilt: 0, upright: true, shake: G.cam.shake, landShake: 0, landedAt: null, him: [0, 0], truckSeen: [0, 0], truckIn: null, upAt: null, up: null, turns: 0, open: [0, 0], faster: 0, stopAt: null, top: 0 };
      let last = sp0, rolling = !!r0;
      for (let t = 0; t < seconds; t += T) {
        const r = G.bail.roll(), going = G.bail.coasting().includes(v), sp = Math.hypot(v.f, v.s);
        if (r) {
          o.hoods.add(G.bail.hood()); o.turns = Math.max(o.turns, Math.abs(r.beta) / (Math.PI * 2));
          if (r.phase !== 'air' && o.landedAt === null) o.landedAt = t;
          o.him[1]++; if (seen(P().x, P().y + .5, P().z)) o.him[0]++;
          const inView = going && seen(v.x, v.y + 1, v.z);
          if (inView && o.landedAt !== null && o.truckIn === null) o.truckIn = t;
          if (going && r.phase === 'up') { o.truckSeen[1]++; if (inView) o.truckSeen[0]++; }
          o.top = Math.max(o.top, P().y - G.floorAt(P().x, P().z));
        }
        if (o.landedAt !== null && t - o.landedAt < .2) o.landShake = Math.max(o.landShake, G.cam.shake);
        o.shake = Math.max(o.shake, G.cam.shake); o.inv = Math.max(o.inv, G.player.inv);
        right.set(1, 0, 0).applyQuaternion(cam.quaternion); o.tilt = Math.max(o.tilt, Math.abs(right.y)); if (cam.up.y !== 1) o.upright = false;
        if (rolling && !r && o.upAt === null) { o.upAt = t; o.up = { x: P().x, z: P().z, kind: G.HP.kind, mode: G.S.mode }; }
        rolling ||= !!r;
        if (going) { o.open[1]++; if (G.bail.doors()[v.kind] > 0) o.open[0]++; o.faster = Math.max(o.faster, sp - last); }
        else if (o.stopAt === null && !G.driving()) o.stopAt = t;
        last = sp;
        if (each?.(t, r)) break;
        if (o.upAt !== null && o.stopAt !== null && t > o.upAt + .1) break;
        if ((v.wrecked || v.drowned) && o.upAt !== null) break;
        G.step(T, T);
      }
      const up = o.up ?? { x: P().x, z: P().z }, dx = up.x - from.x, dz = up.z - from.z;
      let turned = v.yaw - yaw0; turned = Math.atan2(Math.sin(turned), Math.cos(turned));
      return { ...o, hoods: [...o.hoods], hp: G.S.hp, gone: Math.hypot(dx, dz), along: dx * fx + dz * fz, across: dx * fz - dz * fx, speed: sp0,
        truck: { far: Math.hypot(v.x - vx0, v.z - vz0), off: (v.x - vx0) * fz - (v.z - vz0) * fx, turned, f: Math.hypot(v.f, v.s), coasting: G.bail.coasting().includes(v), solid: G.blocked(v.x, v.z, v.y + .2), doors: G.bail.doors()[v.kind] ?? 0, wrecked: !!v.wrecked, drowned: !!v.drowned, hp: v.hp, full: v.K.hp } };
    };
    // what of what the game asked the sound for says the door wouldn't open: the door's own sound, pitched up
    window.rattles = () => heard().filter(([name, rate]) => name === 'vehicle.door' && rate > 1.5).length;
  });
  // in a pickup again, which is a tap of the big button stood beside it
  const board = async (v) => {
    if (await g(() => !!G.driving())) return null;
    const said = await g((pick) => beside(pick === null ? pickup() : G.vehicles[pick]), v ?? null);
    const button = await page.$eval('#bA', (b) => b.innerText.replace(/\s+/g, ' '));
    await page.tap('#bA'); await g(() => G.sim(T, T));
    return { said, button, kind: await g(() => G.driving()?.kind) };
  };
  // and out of it, with a tap
  const getOut = async () => { await page.tap('#bA'); await g(() => G.step(T, T)); };
  return { page, errors, close, g, snap, board, getOut };
}

// ---------------------------------------------------------------- with motion
{
  const { page, errors, close, g, snap, board, getOut } = await open();
  const inIt = await board();
  check(`a tap of ${inIt.button} gets him in the pickup`, inIt.button === 'GET IN' && inIt.kind === 'pickup', inIt);

  // ---- at a walk he steps out, as ever
  const walk0 = await g(() => go(3.5, road(4)));
  check(`driving, the big button says ${walk0.button}`, walk0.button === 'GET OUT' && walk0.shown, walk0);
  await getOut();
  const walk = await g(() => { const v = was; G.step(.5, T); return { mode: G.S.mode, kind: G.HP.kind, roll: !!G.bail.roll(), driving: !!G.driving(), coasting: G.bail.coasting().length, f: Math.hypot(v.f, v.s), near: Math.hypot(v.x - P().x, v.z - P().z), w: v.K.width, rattles: rattles(), doors: G.bail.doors().pickup }; });
  check('at a walk a tap of GET OUT has him out on his feet beside it, and it stops where it is, as ever', walk.mode === 'town' && walk.kind === 'run' && !walk.roll && !walk.driving && !walk.coasting && walk.f === 0 && walk.near < walk.w / 2 + 1.3 && walk.rattles === 0 && walk.doors === 0, walk);

  // ---- faster, he dives out and rolls
  const runs = {};
  for (const speed of [12, 20, 25]) {
    await board();
    const start = await g((s) => go(s, road(10)), speed);
    await getOut();
    const r = await g(() => ({ ...after(was), rattles: rattles(), toast: G.state().toast }));
    runs[speed] = { ...r, start };
    console.log(`     ${mph(speed)} mph: out of his side ${f1(r.side)} m, ${f1(r.top)} m up, landed after ${f1(r.landedAt)} s, ${r.turns.toFixed(1)} turns, up after ${r.upAt?.toFixed(2)} s, ${f1(r.gone)} m on (${f1(r.along)} along, ${f1(r.across)} across); the pickup went ${f1(r.truck.far)} m, ${f1(r.truck.off)} m off its line, turned ${r.truck.turned.toFixed(3)}, stopped after ${f1(r.stopAt)} s`);
    check(`${mph(speed)} mph: GET OUT has him out of his side of it headfirst, with no rattle and nothing said`, r.first?.phase === 'air' && r.kind0 === 'roll' && r.mode === 'town' && !r.driving && r.side > 0 && r.rattles === 0 && !/slow/i.test(r.toast), r);
    check(`${mph(speed)} mph: he rolls over along the way it was going, and is up in ${r.upAt?.toFixed(1)} s`, r.turns >= 1 && Math.abs(r.turns - Math.round(r.turns)) < .01 && r.along > r.gone * .85 && r.upAt !== null && r.upAt < 3 && r.up?.kind === 'run' && r.up?.mode === 'town', r);
    check(`${mph(speed)} mph: none of it costs him a heart or knocks him about`, r.hp === r.hp0 && r.inv === 0, { hp0: r.hp0, hp: r.hp, inv: r.inv });
    check(`${mph(speed)} mph: his hood flops about as he goes over (${r.hoods.length} ways)`, r.hoods.length >= 3, r.hoods);
    check(`${mph(speed)} mph: the camera stays upright and on him all the way`, r.tilt < .01 && r.upright && r.him[0] === r.him[1], { tilt: r.tilt, upright: r.upright, him: r.him });
    check(`${mph(speed)} mph: it shakes a little when he lands (${r.landShake.toFixed(2)}), and no more`, r.landShake >= .15 && r.landShake <= .3 && r.shake <= .3, { land: r.landShake, most: r.shake });
    check(`${mph(speed)} mph: the pickup's on the screen going on without him from ${f1(r.truckIn)} s, and all the while he's face down and getting up`, r.truckSeen[1] > 10 && r.truckSeen[0] === r.truckSeen[1] && r.truckIn < r.upAt - .8, { seen: r.truckSeen, in: r.truckIn, up: r.upAt });
    check(`${mph(speed)} mph: it goes on without him with its door hanging open, slows, and stops ${f1(r.truck.far)} m on`, r.open[1] > 10 && r.open[0] === r.open[1] && r.faster < .02 && r.stopAt !== null && !r.truck.coasting && r.truck.f === 0 && r.truck.far > speed, { open: r.open, faster: r.faster, stopAt: r.stopAt, truck: r.truck });
    if (r.truck.wrecked) check(`${mph(speed)} mph: it ran off the road into something`, false, r.truck);
  }
  check(`the faster it's going, the farther he goes: ${[12, 20, 25].map((s) => f1(runs[s].gone)).join(', ')} m, and the longer: ${[12, 20, 25].map((s) => runs[s].upAt?.toFixed(1)).join(', ')} s`,
    runs[12].gone < runs[20].gone && runs[20].gone < runs[25].gone && runs[12].upAt < runs[25].upAt && runs[12].turns <= runs[25].turns, runs);
  const T20 = runs[20].truck;
  check(`it wanders off its line a little as it goes (${f1(T20.off)} m, ${T20.turned.toFixed(2)} rad)`, Math.abs(T20.off) > .3 && Math.abs(T20.off) < 4 && Math.abs(T20.turned) > .01, T20);
  check('and it\'s parked where it stops, as solid as any, with its door still open', T20.solid && T20.doors > 0, T20);

  // ---- pictures of it at 45 mph, as it goes
  if (shots) {
    await board();
    await g(() => go(20, road(10)));
    await snap('1-driving');
    await getOut();
    let t = 0;
    for (const [name, until] of [['2-out', .1], ['2-air', .25], ['2-rolling', .6], ['2-rolling-more', 1], ['2-down', 1.7], ['2-getting-up', 2.1], ['2-up', 2.6], ['2-truck-going', 4]]) {
      t = await g(([t, until]) => { while (t < until - 1e-6) { G.step(T, T); t += T; } return t; }, [t, until]);
      await snap(name);
    }
    await g(() => { for (let i = 0; i < 900 && G.bail.coasting().includes(was); i++) G.step(T, T); G.step(.3, T); });
    await snap('2-truck-stopped');
  }

  // ---- and the door shuts when he gets back in
  const back = await board();
  const shut = await g(() => { G.step(T, T); return { driving: G.driving()?.kind, doors: G.bail.doors().pickup }; });
  check('a tap of GET IN has him back in it, and its door shut', back.button === 'GET IN' && shut.driving === 'pickup' && shut.doors === 0, { back, shut });

  // ---- with the crowd out, and the hearts showing, it's the same
  await g(() => { G.bringOutCrowd(); G.horde.calm(); G.horde.all.length = 0; G.step(.1, T); });
  await g(() => go(20, road(10)));
  await getOut();
  const crowdOut = await g(() => after(was));
  check('with the crowd out it still costs him nothing', crowdOut.hp === 3 && crowdOut.hp0 === 3 && crowdOut.inv === 0 && crowdOut.upAt < 3, crowdOut);

  // ---- the crowd in front of it
  await g(() => {
    // so many of them in the road ahead of it, so many metres on, a little either side of its middle and stood still, and nobody else
    window.lineUp = (from, ks) => {
      const H = G.horde; H.calm(); H.all.length = 0;
      const fx = Math.sin(from.yaw), fz = Math.cos(from.yaw), across = [-.6, .4, -.2];
      return ks.map((k, i) => { const s = H.add(from.x + fx * k - fz * across[i % 3], from.z + fz * k + fx * across[i % 3], { quiet: true }); s.tx = s.x; s.tz = s.z; s.timer = 99; return s; });
    };
    // who it hit, how fast it was going when it did, and whether they went flying
    window.hits = (v, list) => { const got = list.map(() => null); return { each: () => { list.forEach((s, i) => { if (got[i] === null && s.flat > 0) got[i] = { speed: Math.hypot(v.f, v.s), flung: !!(s.flung || s.thrown) }; }); }, got }; };
  });
  for (const [speed, ks, flies] of [[25, [24, 31, 38], true], [11, [12, 16, 20], false]]) {
    await board();
    await g(([speed, ks]) => { window.three = lineUp(road(30), ks); go(speed, road(30)); }, [speed, ks]);
    await getOut();
    const hit = await g(() => { const v = was, h = hits(v, three), r = after(v, { seconds: 8, each: () => { h.each(); } }); return { got: h.got, flat: three.map((s) => s.flat), r: { hp: r.hp, hp0: r.hp0, inv: r.inv, upAt: r.upAt } }; });
    if (flies) await snap('3-crowd');
    console.log(`     ${mph(speed)} mph into three of them: ${hit.got.map((h) => h ? `${mph(h.speed)} mph, ${h.flung ? 'flung' : 'knocked down'}` : 'missed').join('; ')}`);
    check(flies ? 'empty, at 40 mph and up, it sends the crowd flying, as a driven truck does' : 'and slower, it knocks them down where they stood',
      hit.got.every((h) => h && (flies ? h.flung && h.speed >= 17.9 : !h.flung && h.speed < 17.9)), hit);
    check('and none of it touches him', hit.r.hp === hit.r.hp0 && hit.r.inv === 0, hit.r);
    await g(() => { G.horde.calm(); G.horde.all.length = 0; G.step(.1, T); });
  }

  // ---- the cast hop out of its way
  const cast = await g(() => {
    // whichever of the cast has a way at them from 30 m with nothing in it
    for (const c of G.fling.cast()) {
      const [x0, z0] = c.spot, blocked = (x, z) => G.blocked(x, z, G.floorAt(x, z) + .7);
      for (let i = 0; i < 72; i++) {
        const a = i / 72 * Math.PI * 2, ux = Math.sin(a), uz = Math.cos(a); let ok = true;
        for (let k = -30; k <= -1.6 && ok; k += .5) for (const w of [-4, -3, -2, -1.2, -.6, 0, .6, 1.2]) if (blocked(x0 + ux * k - uz * w, z0 + uz * k + ux * w) || G.water.in(x0 + ux * k - uz * w, z0 + uz * k + ux * w)) { ok = false; break; }
        if (ok) return { id: c.id, run: { ux, uz }, x0, z0 };
      }
    }
    return { run: null };
  });
  check(`there's a clear run at one of the cast (${cast.id})`, !!cast.run, cast);
  if (cast.run) {
    await board();
    await g(({ run, x0, z0 }) => go(13.4, { x: x0 - run.ux * 24, z: z0 - run.uz * 24, yaw: Math.atan2(run.ux, run.uz) }), cast);
    await getOut();
    const hop = await g(({ id, run, x0, z0 }) => {
      const v = was, who = () => G.fling.cast().find((n) => n.id === id);
      let jumped = false, hopped = 0, inside = false;
      const r = after(v, { seconds: 8, each: () => {
        const c = who(), fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), along = (c.x - v.x) * fx + (c.z - v.z) * fz, across = (c.z - v.z) * fx - (c.x - v.x) * fz;
        if (c.jumping) { jumped = true; hopped = Math.max(hopped, c.y - G.floorAt(c.x, c.z)); }
        if (Math.abs(along) < v.K.length / 2 && Math.abs(across) < v.K.width / 2) inside = true;
      } });
      // and with it out of the way, back up the run, they hop back onto their spot
      G.getIn(v); Object.assign(v, { x: x0 - run.ux * 14, z: z0 - run.uz * 14, f: 0, s: 0 }); v.y = G.floorAt(v.x, v.z); G.getOut(true);
      for (let k = 0; k < 150 && who().jumping; k++) G.step(T, T);
      const c = who();
      return { jumped, hopped, inside, back: Math.hypot(c.x - x0, c.z - z0), truck: r.truck, hp: r.hp, hp0: r.hp0, inv: r.inv };
    }, cast);
    check(`${cast.id} hops clear of it with nobody in it (${hop.hopped.toFixed(2)} m up), it never touches them, and they're back on their spot after`, hop.jumped && hop.hopped > .3 && !hop.inside && hop.back < .05, hop);
  }

  // ---- into a house
  const house = await g(() => {
    for (const s of G.structures) {
      if (s.open || s.sqm < 60 || s.sqm > 500 || s.use === 'church' || G.wreck.damage.has(s) || G.map.roadGrid.nearest(s.wx, s.wz) > 45) continue;
      const id = G.map.roadGrid.seg.owner.id, p = G.map.along(id, G.map.sOn(id, s.wx, s.wz)), d = Math.hypot(s.wx - p.x, s.wz - p.z); if (d < 10) continue;
      const ux = (s.wx - p.x) / d, uz = (s.wz - p.z) / d, fl = G.floorAt(p.x, p.z), free = (k, w = 0) => { const x = p.x + ux * k - uz * w, z = p.z + uz * k + ux * w; return !G.blocked(x, z, fl + .7) && !G.wreck.treeBlocks(x, z) && Math.abs(G.floorAt(x, z) - fl) < 1 && !G.water.in(x, z); };
      let wall = -1; for (let k = 0; k < d; k += .25) if (!free(k)) { wall = k; break; }
      if (wall < 4 || G.houseAt(p.x + ux * (wall + .6), p.z + uz * (wall + .6)) !== s) continue;
      let clear = true; for (let k = wall - 30; k < wall - .5 && clear; k += .5) for (const w of [-4, -2.5, -1.2, 0, 1.2]) if (!free(k, w)) { clear = false; break; }
      if (clear) return { index: s.index, x: p.x + ux * (wall - 26), z: p.z + uz * (wall - 26), yaw: Math.atan2(ux, uz) };
    }
    return null;
  });
  check('there\'s a house with a clear run at it', !!house, house);
  if (house) {
    await board();
    await g((h) => go(15, h), house);
    await getOut();
    const into = await g((h) => { const v = was, r = after(v, { seconds: 10 }), s = G.structures.find((q) => q.index === h.index); return { truck: r.truck, stopAt: r.stopAt, hit: G.wreck.damage.has(s), hp: r.hp, hp0: r.hp0, inv: r.inv }; }, house);
    await snap('4-house');
    check(`with nobody in it, it hits the house in front of it, and that stops it (${into.truck.hp} of ${into.truck.full})`, into.hit && into.truck.hp < into.truck.full && !into.truck.coasting && into.truck.far < 32, into);
  }

  // ---- what still hurts him while he rolls: a fire where he comes to a stop, someone driving, the river, a train
  await g(() => { G.S.hp = 3; G.player.inv = 0; });
  // where he stops, first, which is the same every time from the same start
  await board();
  await g(() => go(12, road(120)));
  await getOut();
  const dry = await g(() => { const v = was; let lay = null; after(v, { each: (t, r) => { if (r?.phase === 'up' && !lay) lay = { x: P().x, z: P().z, y: P().y }; } }); return lay; });
  await board();
  await g(() => go(12, road(120)));
  await getOut();
  const fire = await g((lay) => {
    G.wreck.burnAt(lay.x, lay.y + .04, lay.z, 1.6, 6);
    const v = was; let hurtWhile = null, hpThen = null;
    const r = after(v, { each: (t, roll) => { if (hurtWhile === null && G.player.inv > 0) { hurtWhile = roll ? roll.phase : 'after'; hpThen = G.S.hp; } } });
    return { hurtWhile, hpThen, hp0: r.hp0 };
  }, dry);
  await snap('5-fire');
  check(`rolling into a fire still burns him, and costs him a heart (it got him ${fire.hurtWhile === 'up' ? 'lying there' : fire.hurtWhile})`, (fire.hurtWhile === 'roll' || fire.hurtWhile === 'up') && fire.hpThen === fire.hp0 - 1, fire);

  // into a pond, off its bank
  await g(() => { G.S.hp = 3; G.player.inv = 0; G.sim(7, T); });
  await board();
  const pond = await g(() => {
    const W = G.water, p = W.in(...G.map.fromTrue(-615, -601)), [jx, jz] = G.map.fromTrue(-520, -600);
    const d = Math.hypot(jx - p.x, jz - p.z), ux = (jx - p.x) / d, uz = (jz - p.z) / d;
    let a = [p.x + ux, p.z + uz]; for (let i = 0; i < 400; i++) { if (!W.in(a[0], a[1]) && !(W.look(a[0], a[1]) && W.d < 3)) break; a = [a[0] + ux, a[1] + uz]; }
    return { x: a[0], z: a[1], yaw: Math.atan2(-ux, -uz), level: p.level };
  });
  await g((p) => go(12, p), pond);
  await getOut();
  const swam = await g(() => {
    const v = was; let swimWhile = null;
    after(v, { seconds: 6, each: (t, roll) => { if (swimWhile === null && G.S.mode === 'swim') { swimWhile = window.wasRolling ? 'rolling' : 'after'; } window.wasRolling = !!roll; } });
    return { mode: G.S.mode, kind: G.HP.kind, swimWhile, roll: !!G.bail.roll(), splash: heard().some(([n]) => n === 'splash.small'), truck: { drowned: v.drowned } };
  });
  await snap('6-pond');
  check('rolling off the bank into a pond, he\'s in it, swimming', swam.mode === 'swim' && swam.kind === 'swim' && swam.swimWhile === 'rolling' && !swam.roll && swam.splash, swam);
  check('and so is the pickup, flooded', swam.truck.drowned, swam.truck);

  // onto the railroad with a train coming
  await g(() => { if (G.S.mode === 'swim') { G.S.mode = 'town'; G.HP.kind = 'run'; } G.S.hp = 3; G.player.inv = 0; G.place(...G.map.fromTrue(-400, -18)); G.sim(.5, T); });
  await board();
  const rail = await g(() => {
    const R = G.trains, RAIL = R.RAIL, gates = R.t.gates.map((c) => c.s), W = G.wreck;
    // a stretch of the line with ground beside it a pickup can go along, away from the crossings and the trestles
    for (let s = 400; s < 9000; s += 37) {
      if (gates.some((g0) => Math.abs(g0 - s) < 120) || R.TRESTLES.some((t) => Math.abs(t.s - s) < 160)) continue;
      const at = (k, off) => { const q = RAIL.at(s + k); return [q.x - q.tz * off, q.z + q.tx * off]; }, y0 = G.floorAt(...at(0, 0));
      let ok = true;
      for (let k = -8; k <= 40 && ok; k += 2) for (const off of [0, 1.5, 3, 4.5, 6]) { const [x, z] = at(k, off), f = G.floorAt(x, z); if (!G.map.inBounds(x, z) || G.water.in(x, z) || Math.abs(f - y0) > .8 || f < .5 || G.blocked(x, z, f + .6) && !W.treeBlocks(x, z)) { ok = false; break; } }
      if (!ok) continue;
      for (let k = -8; k <= 40; k += 6) { const [x, z] = at(k, 3); for (const t of W.trees(x, z, 9)) if (!t.down) W.fellTree(t, 1, 0); }
      const q = RAIL.at(s), [x, z] = at(0, 4.2);
      return { s, x, z, yaw: Math.atan2(q.tx, q.tz) };
    }
    return null;
  });
  check('there\'s somewhere to drive alongside the railroad', !!rail, rail);
  if (rail) {
    await g((r) => { G.sim(3, T); go(12, r); }, rail);
    await getOut();
    const train = await g((rl) => {
      const R = G.trains, TR = R.t; R.go(); TR.send(-1, rl.s + 9 + 22 * 1.7);
      const v = was; let gotWhile = null;
      after(v, { seconds: 5, each: (t, roll) => { if (gotWhile === null && R.got()) { gotWhile = window.wasRolling ?? 'after'; return true; } window.wasRolling = roll?.phase ?? 'after'; } });
      G.step(T, T);
      return { gotWhile, got: R.got(), roll: !!G.bail.roll() };
    }, rail);
    await snap('7-train');
    check(`rolling onto the railroad in front of a train, it still gets him (${train.gotWhile === 'up' ? 'lying there' : train.gotWhile})`, (train.gotWhile === 'roll' || train.gotWhile === 'up') && !train.roll, train);
    // and once the fever's over he's where he wakes, and up
    const woke = await g(() => { G.trains.t.clear(); let n = 0; for (; n < 3000 && (G.fever() || G.S.mode !== 'town'); n++) G.sim(T, T); G.step(T, T); return { mode: G.S.mode, t: n * T }; });
    check(`and he comes to from it as ever (${woke.t.toFixed(0)} s on)`, woke.mode === 'town', woke);
  }

  check('no console errors', errors.length === 0, errors.slice(0, 5));
  await close();
}

// ---------------------------------------------------------------- with the town filled, and someone driving
{
  const { errors, close, g, snap, board, getOut } = await open();
  await g(() => { G.fillTown(); G.traffic.T.riders = 0; G.bringOutCrowd(); G.horde.calm(); G.sim(1, T); });
  // someone driving with a grudge, who won't stop for him lying in the road. Where he comes to a stop first, as above.
  await board();
  await g(() => go(12, road(120)));
  await getOut();
  const dry = await g(() => { let lay = null; after(was, { each: (t, r) => { if (r?.phase === 'up' && !lay) lay = { x: P().x, z: P().z, y: P().y }; } }); return lay; });
  await board();
  const car = await g(() => {
    const TF = G.traffic; TF.on = true; TF.T.every = [1e9, 1e9]; TF.T.gone = 1e5; TF.clear();
    TF.T.cars = 1; TF.T.every = [0, 0]; TF.T.from = [40, 200]; TF.soon();
    let c = null; for (let i = 0; i < 2000 && !c; i++) { G.sim(T, T); c = TF.cars[0]; }
    TF.T.every = [1e9, 1e9];
    return !!c;
  });
  check('someone comes driving', car, car);
  if (car) {
    await g(() => { G.horde.calm(); G.horde.all.length = 0; go(12, road(120)); });
    await getOut();
    const ran = await g((lay) => {
      const TF = G.traffic, c = TF.cars[0], r0 = road(120), q = G.map.along('us_80', G.map.sOn('us_80', lay.x, lay.z)), dir = -r0.way;
      Object.assign(c.who, { hurt: 1, when: G.folks.now(), nerve: 1, temper: 1 });
      const s = G.map.sOn('us_80', lay.x, lay.z) - dir * 24, p = G.map.along('us_80', s), fx = p.tx * dir, fz = p.tz * dir;
      c.road = G.map.roadById.get('us_80'); c.dir = dir; c.s = s; c.plan = null; c.off = c.want = 1.9;
      Object.assign(c.v, { x: p.x - fz * 1.9, z: p.z + fx * 1.9, y: G.floorAt(p.x - fz * 1.9, p.z + fx * 1.9), yaw: Math.atan2(fx, fz), f: 14, s: 0 });
      const v = was; let hurtWhile = null, by = null;
      const r = after(v, { each: (t, roll) => { if (hurtWhile === null && G.player.inv > 0) { hurtWhile = roll ? roll.phase : 'after'; by = Math.hypot(c.v.x - P().x, c.v.z - P().z); } } });
      return { mood: G.folks.mood(c.who), hurtWhile, by, hp: r.hp, hp0: r.hp0 };
    }, dry);
    await snap('9-traffic');
    check(`someone driving who's got it in for him still runs him down while he's rolling (${ran.hurtWhile}, ${f1(ran.by)} m off)`, (ran.hurtWhile === 'roll' || ran.hurtWhile === 'up') && ran.by < 3.5 && ran.hp === ran.hp0 - 1, ran);
  }

  check('no console errors there either', errors.length === 0, errors.slice(0, 5));
  await close();
}

// ---------------------------------------------------------------- with reduced motion
{
  const { errors, close, g, snap, board, getOut } = await open('reduce');
  await board();
  await g(() => go(20, road(10)));
  await getOut();
  const r = await g(() => { const v = was, first = { kind: G.HP.kind, roll: G.bail.roll(), y: P().y - G.floorAt(P().x, P().z) }, res = after(v); return { ...res, first, rattles: rattles() }; });
  await snap('8-down');
  console.log(`     ${mph(r.speed)} mph: out ${f1(r.side)} m from it and ${f1(r.ahead)} m along, up after ${r.upAt?.toFixed(2)} s; the pickup went ${f1(r.truck.far)} m`);
  check('with reduced motion GET OUT at 45 mph has him down on the ground beside the door at once', r.first.kind === 'down' && r.first.roll?.phase === 'up' && r.first.roll?.beta === 0 && Math.abs(r.first.y) < .05 && r.side > .9 && r.side < 2.2 && Math.abs(r.ahead) < 1 && r.rattles === 0, r);
  check('and up again in under a second and a half, with nothing rolling and nothing flopping', r.upAt !== null && r.upAt < 1.5 && r.turns === 0 && r.hoods.length === 1 && r.up?.kind === 'run', r);
  check('the camera doesn\'t shake at all, and stays upright on him', r.shake === 0 && r.tilt < .01 && r.upright && r.him[0] === r.him[1], { shake: r.shake, tilt: r.tilt, him: r.him });
  check('it costs him nothing', r.hp === r.hp0 && r.inv === 0, r);
  check('and the pickup still goes on without him, with its door open, and stops', r.open[1] > 10 && r.open[0] === r.open[1] && r.stopAt !== null && !r.truck.coasting && r.truck.f === 0, { open: r.open, truck: r.truck });
  check('no console errors there either', errors.length === 0, errors.slice(0, 5));
  await close();
}

console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
