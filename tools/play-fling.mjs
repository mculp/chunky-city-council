// Hits the crowd with a pickup on a phone-sized page, getting in with a real tap and driving with the phone's stick. At 40 mph and up they go flying, limp, up over the top of it or
// off ahead of it, tumbling with their arms and legs going every which way and their glow streaking, bounce, and come down in a heap on the road, a little different every time,
// and now and then lose a shoe. They get up sore and go home, and one who's gone quiet says what it thinks of it on the way. Slower, they're knocked down as ever. The cast jump
// clear of it. Then it reports what a dozen of them in the air at once cost on a phone, and plays it again with reduced motion, when nobody turns over or flails.
//
//   npm i && npm run fling [-- --shots dir]
import { mkdirSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });

async function open(reducedMotion) {
  const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, reducedMotion });
  const g = (fn, arg) => page.evaluate(fn, arg);
  const snap = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); };
  await g(() => {
    const G = __game, T = 1 / 30; G.pause(); G.jump('town'); G.S.flags.town = true; G.step(.2); document.getElementById('card').classList.remove('show');
    G.bringOutCrowd(); G.horde.calm(); G.horde.all.length = 0; G.step(.1);
    window.G = G; window.H = G.horde; window.T = T;
    // a long straight run of US 80 west of town, with nothing parked on it
    const M = G.map, [wx, wz] = M.fromTrue(-295, -18), p = M.along('us_80', M.sOn('us_80', wx, wz));
    window.ROAD = { x: p.x, z: p.z, yaw: Math.atan2(p.tx, p.tz) };
    // stood beside the pickup, which is what the big button gets him into
    window.besidePickup = () => {
      const v = G.vehicles.find((o) => o.kind === 'pickup' && !o.wrecked && !o.drowned && !o.loose), a = v.yaw + Math.PI / 2, off = v.K.width / 2 + 1;
      G.place(v.x + Math.sin(a) * off, v.z + Math.cos(a) * off); G.step(.6); return G.state().prompt;
    };
    // what he's driving put somewhere, standing, without the trip
    window.move = (x, z, yaw) => { const v = G.driving(); v.x = x; v.z = z; v.y = G.floorAt(x, z); v.yaw = yaw; v.f = v.s = v.steer = 0; v.grounded = true; v.hp = v.K.hp; G.look(yaw + Math.PI); return v; };
    // at the start of the run, with a line of them ahead of it in the road, so many metres apart, a little either side of its middle, stood still. Whoever was there before is gone.
    window.lineUp = (n, gap, extra = {}, across = [-.6, .4, -.2, .7, -.4, .1]) => {
      H.calm(); H.all.length = 0; for (const o of G.vehicles) if (o !== G.driving() && G.onRoad(o.x, o.z)) o.z += 30;
      const v = move(ROAD.x, ROAD.z, ROAD.yaw), fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
      const list = []; for (let i = 0; i < n; i++) { const k = 30 + i * gap, c = across[i % across.length], s = H.add(v.x + fx * k - fz * c, v.z + fz * k + fx * c, extra); s.tx = s.x; s.tz = s.z; s.timer = 99; list.push(s); }
      G.sim(.1, T); return list;
    };
    // a step at a time with it all drawn, the stick held forward and no faster than cap: how each of them goes, from where they stood when it hit them
    window.drive = (list, speed, seconds, cap = Infinity) => {
      const v = G.driving(), seen = list.map((s) => ({ s, top: 0, turned: 0, streak: 0, bounces: 0, arms: new Set(), legs: new Set(), air: 0 }));
      if (speed) { v.f = speed; G.stick(0, 1); }
      const hp0 = v.hp; let slowest = Infinity;
      for (let t = 0; t < seconds; t += T) {
        G.step(T, T); v.f = Math.min(v.f, cap); if (speed) slowest = Math.min(slowest, Math.hypot(v.f, v.s));
        for (const w of seen) {
          const s = w.s;
          if (!(s.flat > 0)) s.stood = [s.x, s.z]; else if (!s.hit) s.hit = { at: s.stood ?? [s.x, s.z], flung: !!s.flung, flatFor: s.flatFor };
          if (s.thrown) {
            w.top = Math.max(w.top, s.y - G.floorAt(s.x, s.z)); w.turned = Math.max(w.turned, Math.abs(s.tumble)); w.bounces = Math.max(w.bounces, s.thrown.bounces ?? 0);
            const k = G.fling.streak(s); if (k) w.streak = Math.max(w.streak, Math.hypot(...k));
            // how they're drawn, from the 12 fps step after the one they were hit on, which is the first that draws them flying
            const st = w.air++ > 3 && G.stance(s); if (st) { w.arms.add(Math.round(st.arms / 15)); w.legs.add(Math.round(st.legs / 15)); }
          }
        }
      }
      G.stick(0, 0);
      return { hp0, hp: v.hp, slowest, wrecked: v.wrecked, flights: seen.map((w) => ({ id: w.s.who?.id, flung: !!w.s.hit?.flung, flatFor: w.s.hit?.flatFor ?? 0, top: w.top, turned: w.turned, streak: w.streak, bounces: w.bounces, arms: w.arms.size, legs: w.legs.size, far: w.s.hit ? Math.hypot(w.s.x - w.s.hit.at[0], w.s.z - w.s.hit.at[1]) : 0, y: w.s.y - G.floorAt(w.s.x, w.s.z), thrown: !!w.s.thrown, flat: w.s.flat })) };
    };
    // until nobody's in the air, and nothing that came off them is either
    window.settle = (list) => { for (let i = 0; i < 150 && (list.some((s) => s.thrown) || G.fling.shoes().some((o) => !o.down)); i++) G.sim(T, T); };
    window.stop = () => { const v = G.driving(); G.stick(0, -1); for (let i = 0; i < 300 && Math.abs(v.f) > .4; i++) G.sim(T, T); G.stick(0, 0); v.f = v.s = 0; G.sim(T, T); };
    // looks at someone from beside them, without him in the way, and draws it
    window.lookAt = (s, a = .6, r = 3.2, h = 1.7) => { const c = G.camera; G.hero.body.visible = false; c.position.set(s.x + Math.sin(a) * r, s.y + h, s.z + Math.cos(a) * r); c.lookAt(s.x, s.y + .3, s.z); c.updateMatrixWorld(); G.renderer.render(G.scene, c); };
  });
  // in the pickup again, which is a tap of the big button stood beside it
  const board = async () => { if (await g(() => !!G.driving())) return; await g(() => besidePickup()); await page.tap('#bA'); await g(() => G.sim(T, T)); };
  return { page, errors, close, g, snap, board };
}
// the most of each, from the run and from after it
const both = (a, b) => a.flights.map((f, i) => ({ ...b.flights[i], top: Math.max(f.top, b.flights[i].top), turned: Math.max(f.turned, b.flights[i].turned), bounces: Math.max(f.bounces, b.flights[i].bounces), streak: Math.max(f.streak, b.flights[i].streak), arms: f.arms, legs: f.legs }));

// ---------------------------------------------------------------- with motion
{
  const { page, errors, close, g, snap, board } = await open();
  const said = await g(() => besidePickup());
  await page.tap('#bA'); await g(() => G.sim(T, T));
  const inIt = await g(() => ({ mode: G.S.mode, kind: G.driving()?.kind }));
  check(`a tap of "${said}" gets him in the pickup`, inIt.mode === 'drive' && inIt.kind === 'pickup', inIt);

  // ---- at 45 mph, four of them, one after another
  await g(() => { window.four = lineUp(4, 7, { quiet: true }); });
  const run = await g(() => drive(four, 20, 3.4));
  await snap('1-flying');
  const after = await g(() => { settle(four); return drive(four, 0, .1); }), F = both(run, after);
  console.log(`     ${F.map((f) => `#${f.id} ${f.top.toFixed(1)} m up, ${f.far.toFixed(1)} m on, ${(f.turned / Math.PI / 2).toFixed(1)} turns, ${f.bounces} bounce${f.bounces === 1 ? '' : 's'}`).join('; ')}`);
  check('at 45 mph every one of them goes flying', F.every((f) => f.flung), F.map((f) => f.flung));
  check('up off the road a metre or more, and on a good way', F.every((f) => f.top > 1 && f.far > 8), F.map((f) => [f.top, f.far]));
  check('turning over in the air', F.every((f) => f.turned > 2), F.map((f) => f.turned));
  check('with their arms and legs going every which way', F.every((f) => f.arms >= 4 && f.legs >= 3), F.map((f) => [f.arms, f.legs]));
  check('and their glow streaking out behind them', F.every((f) => f.streak > .5), F.map((f) => f.streak));
  check('they bounce, and come down on the road', F.every((f) => f.bounces >= 1 && !f.thrown && Math.abs(f.y) < .05), F.map((f) => [f.bounces, f.thrown, f.y]));
  check('a little different every time', new Set(F.map((f) => `${f.far.toFixed(1)} ${f.top.toFixed(1)}`)).size === F.length, F.map((f) => [f.far, f.top]));
  check(`the pickup takes it as a crash, a little at a time (${run.hp0} to ${run.hp}), and keeps going`, run.hp < run.hp0 && run.hp > run.hp0 * .8 && !run.wrecked && run.slowest > 16, run);
  check('and they\'re down long enough that he\'s long gone by the time they get up', F.every((f) => f.flatFor >= 15), F.map((f) => f.flatFor));

  // ---- the heap, up close
  const heaps = await g(() => four.map((s) => { const st = G.stance(s); return st && { torso: st.torso, hands: st.hands, feet: st.feet, head: st.head, arms: st.arms, legs: st.legs }; }));
  console.log(`     in a heap: ${heaps.map((h) => h && `${h.torso.toFixed(0)}° over, hands ${h.hands.toFixed(2)}, feet ${h.feet.toFixed(2)}, head ${h.head.toFixed(2)} m up`).join('; ')}`);
  check('they lie in a heap on the road, with nothing through it', heaps.every((h) => h && h.torso > 50 && h.hands > -.06 && h.feet > -.06 && h.head > -.06 && h.hands < .7), heaps);
  check('and no two the same shape', new Set(heaps.map((h) => `${h.arms.toFixed(0)} ${h.legs.toFixed(0)}`)).size === heaps.length, heaps);
  if (shots) for (const [k, a] of [[0, .6], [1, 2.6]]) { await g(({ a }) => lookAt(four[0], a), { a }); await page.screenshot({ path: `${shots}/2-heap-${k}.jpg`, type: 'jpeg', quality: 82 }); }

  // ---- the shoes
  const shoes = await g(() => ({ list: G.fling.shoes(), drawn: G.fling.drawnShoes(), floors: G.fling.shoes().map((o) => o.y - G.floorAt(o.x, o.z)), from: four.map((s) => [s.x, s.z]) }));
  const away = shoes.list.map((o) => Math.min(...shoes.from.map(([x, z]) => Math.hypot(o.x - x, o.z - z))));
  check(`now and then a shoe comes off (${shoes.list.length} of ${F.length}), and lands on the ground somewhere else`, shoes.list.length >= 1 && shoes.list.length <= F.length && shoes.list.every((o) => o.down) && shoes.floors.every((y) => y > 0 && y < .1) && away.every((d) => d > 1) && shoes.drawn === shoes.list.length, { shoes, away });

  // ---- up again, sore, and home, with him long gone: back along the road in the pickup, too far off for anyone to keep away from him and not so far that they're not out
  await g(() => { stop(); move(four[0].x - Math.sin(ROAD.yaw) * 100, four[0].z - Math.cos(ROAD.yaw) * 100, ROAD.yaw); G.step(.2); });
  // and out of it, with a tap, and quiet
  await page.tap('#bA'); await g(() => G.sim(T, T));
  const up = await g(() => {
    let t = 0; for (; t < 25 && four.some((s) => s.flat > 0); t += .5) G.sim(.5, T);
    return { t, list: four.map((s) => ({ state: s.state, homeward: !!s.homeward, sore: s.sore > 0, flung: !!s.flung, flop: s.flop, twist: s.twist })) };
  });
  check(`they get up (the last of them ${up.t} s on), sore, and head home`, up.list.every((s) => s.state === 0 && s.homeward && s.sore && s.flung && s.flop === null && s.twist === 0), up);
  // how far from their door each of them was when they stopped heading home, since once they're there they're off about their business again
  const home = await g(() => {
    const got = four.map(() => null);
    for (let t = 0; t < 200 && got.includes(null); t += .25) { G.sim(.25, T); four.forEach((s, i) => { if (got[i] === null && !s.homeward) got[i] = { t, off: Math.hypot(s.x - s.homeX, s.z - s.homeZ), flung: !!s.flung }; }); }
    return four.map((s, i) => ({ ...got[i], dead: s.dead }));
  });
  check(`and they all get home (${home.map((h) => h.t?.toFixed(0)).join(', ')} s on), over it, and nobody died of it`, home.every((h) => h.t !== undefined && h.off < 2 && !h.flung && h.dead === undefined), home);

  // ---- and what one who's gone quiet says on the way, with him out of the pickup with a tap, alongside them
  await board();
  await g(() => { window.one = lineUp(1, 0, { quiet: true }); drive(one, 20, 2.2); settle(one); stop(); for (let t = 0; t < 25 && one[0].flat > 0; t += .5) G.sim(.5, T); G.step(.2); });
  await page.tap('#bA'); await g(() => G.sim(T, T));
  const said2 = await g(() => {
    const s = one[0], out = G.S.mode, seen = new Set(), lines = ['...had the right of way...', '...nobody signals no more...'];
    for (let t = 0; t < 16 && !seen.size; t += 1 / 12) {
      const a = Math.atan2(s.tx - s.x, s.tz - s.z); G.place(s.x + Math.sin(a) * 3.5, s.z + Math.cos(a) * 3.5); G.look(a);
      G.step(1 / 12, 1 / 12); for (const m of G.mutters()) if (m.id === s.who.id) seen.add(m.says);
    }
    return { out, homeward: !!s.homeward, seen: [...seen], theirs: s.who.flungSays, ok: [...seen].every((l) => lines.includes(l)) };
  });
  check(`one gone quiet mutters on the way home: "${said2.seen[0] ?? ''}"`, said2.out === 'town' && said2.homeward && said2.seen.length === 1 && said2.ok && said2.seen[0] === said2.theirs, said2);
  await snap('3-home');

  // ---- slower, they're knocked down as ever
  await board();
  await g(() => { window.three = lineUp(3, 7, { quiet: true }); });
  const slow = await g(() => drive(three, 11, 5, 11.2));
  check('at 25 mph they\'re knocked down where they stood, as ever', slow.flights.every((f) => f.flat > 0 && !f.flung && f.top < .05 && f.far < 3.6), slow.flights.map((f) => [f.flat, f.flung, f.top, f.far]));

  // ---- the cast jump clear
  const cast = await g(() => {
    // whichever of the cast has a way at them from 24 m with nothing in it
    for (const c of G.fling.cast()) {
      const [x0, z0] = c.spot, blocked = (x, z) => G.blocked(x, z, G.floorAt(x, z) + .7);
      for (let i = 0; i < 72; i++) {
        const a = i / 72 * Math.PI * 2, ux = Math.sin(a), uz = Math.cos(a); let ok = true;
        for (let k = -24; k <= -1.6 && ok; k += .5) for (const w of [-1.2, -.6, 0, .6, 1.2]) if (blocked(x0 + ux * k - uz * w, z0 + uz * k + ux * w)) { ok = false; break; }
        if (ok) return { id: c.id, run: { ux, uz }, x0, z0 };
      }
    }
    return { run: null };
  });
  check(`there's a clear run at one of the cast (${cast.id})`, !!cast.run, cast);
  if (cast.run) {
    const jump = await g(({ id, run, x0, z0 }) => {
      H.calm(); H.all.length = 0;
      const v = move(x0 - run.ux * 22, z0 - run.uz * 22, Math.atan2(run.ux, run.uz)), hp = v.hp, who = () => G.fling.cast().find((n) => n.id === id); v.f = 13.4; G.stick(0, 1);
      let jumped = false, hopped = 0, solidWhile = false, inside = false, hpAt = null;
      for (let t = 0; t < 4; t += T) {
        G.step(T, T); v.f = Math.min(v.f, 13.4);
        const c = who(), fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), along = (c.x - v.x) * fx + (c.z - v.z) * fz, across = (c.z - v.z) * fx - (c.x - v.x) * fz;
        if (c.jumping) { jumped = true; if (c.solid) solidWhile = true; hopped = Math.max(hopped, c.y - G.floorAt(c.x, c.z)); }
        if (Math.abs(along) < v.K.length / 2 && Math.abs(across) < v.K.width / 2) inside = true;
        // what it's taken by the time its front's where they were stood, before whatever's behind them, which everyone in the cast stands by
        const past = (v.x - x0) * run.ux + (v.z - z0) * run.uz;
        if (hpAt === null && past + v.K.length / 2 >= 0) hpAt = v.hp;
        if (past > 6 || (hpAt !== null && Math.abs(v.f) < .5)) break;
      }
      stop();
      const passed = { hp, hpAt, jumped, hopped, solidWhile, inside };
      // and out of the way of the spot, back up the run
      move(x0 - run.ux * 12, z0 - run.uz * 12, Math.atan2(run.ux, run.uz));
      for (let k = 0; k < 150 && who().jumping; k++) G.step(T, T);
      const c = who();
      return { ...passed, back: Math.hypot(c.x - x0, c.z - z0), solid: c.solid, jumping: c.jumping, y: c.y - G.floorAt(c.x, c.z) };
    }, cast);
    check(`${cast.id} hops clear of the pickup at 30 mph (${jump.hopped.toFixed(2)} m up), and it never touches them`, jump.jumped && jump.hopped > .3 && !jump.inside && jump.hpAt === jump.hp && !jump.solidWhile, jump);
    check('then hops back onto the spot, and is there to bump into again', jump.back < .05 && jump.solid && !jump.jumping && Math.abs(jump.y) < .05, jump);
    await snap('4-cast');
  }

  // ---- a dozen in the air at once, on a phone
  await g(() => { window.dozen = lineUp(12, .9, { quiet: true }, [-.7, 0, .7]); });
  const air = await g(() => {
    const stood = G.calls().calls, v = G.driving(); v.f = 20; G.stick(0, 1);
    // each held up in the air for the measuring, as soon as it's flying
    for (let t = 0; t < 3 && !dozen.every((s) => s.flat > 0); t += T) { G.step(T, T); v.f = Math.max(v.f, 20); for (const s of dozen) if (s.thrown && !s.held) { s.held = true; s.thrown.vy = Math.max(s.thrown.vy, 14); } }
    G.stick(0, 0);
    return { stood, hit: dozen.filter((s) => s.flat > 0).length, up: dozen.filter((s) => s.thrown).length };
  });
  const client = await page.context().newCDPSession(page);
  const cost = async (rate) => {
    await client.send('Emulation.setCPUThrottlingRate', { rate });
    const t = await g(() => { const b = performance.now(); for (let i = 0; i < 20; i++) { for (const s of dozen) if (s.thrown) s.thrown.vy = Math.max(s.thrown.vy, 4); G.step(T, T); } return { frame: (performance.now() - b) / 20, up: dozen.filter((s) => s.thrown).length, calls: G.calls().calls }; });
    await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    return t;
  };
  await snap('5-dozen');
  const fast = await cost(1), slowCPU = await cost(4);
  console.log(`     ${slowCPU.up} in the air: ${slowCPU.calls} draw calls against ${air.stood} with them stood, and a frame's JS ${fast.frame.toFixed(1)} ms here, ${slowCPU.frame.toFixed(1)} ms at a quarter of this CPU`);
  check('a dozen in the air at once costs under 33 ms of JS a frame at a quarter of this CPU', air.up >= 10 && slowCPU.up >= 10 && slowCPU.frame < 33, { air, slowCPU });
  check('and they\'re drawn in the draw calls they always are, and the shoes', slowCPU.calls <= air.stood + 2, { air, slowCPU });

  check('no console errors', errors.length === 0, errors);
  await close();
}

// ---------------------------------------------------------------- with reduced motion
{
  const { errors, close, g, snap, board } = await open('reduce');
  await board();
  await g(() => { window.three = lineUp(3, 7, { quiet: true }); });
  const run = await g(() => drive(three, 20, 3.2));
  await snap('6-reduced');
  const more = await g(() => { settle(three); const r = drive(three, 0, .1); return { ...r, flop: three.map((s) => s.flop && s.flop.t), twist: three.map((s) => s.twist), shoes: G.fling.shoes().length, heaps: three.map((s) => G.stance(s)).map((h) => h && [h.torso, h.hands, h.feet]) }; });
  const F = both(run, more);
  check('with reduced motion they still go flying', F.every((f) => f.flung && f.top > 1 && f.far > 8 && !f.thrown), F);
  check('without turning over, flailing or streaking', F.every((f) => f.turned === 0 && f.streak === 0 && f.arms === 1 && f.legs === 1) && more.flop.every((t) => t === 0) && more.twist.every((t) => t === 0), { F, more });
  check('nobody loses a shoe, and they still come down in a heap', more.shoes === 0 && more.heaps.every((h) => h && h[0] > 50 && h[1] > -.06 && h[2] > -.06), more);
  check('no console errors with reduced motion', errors.length === 0, errors);
  await close();
}

console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
