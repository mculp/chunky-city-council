// Goes and finds what's only there for anyone who stumbles on it, on a phone-sized page, with the game's own movement and real taps. In from School St to the second trailer from the left, down its length to the computer in the back,
// up to the screen and away again. Across the green pool. Then in a pickup up the road past where the map used to stop, on foot up the gravel loop and through the gate, between the stones to the one with words on it. Nothing's marked.
//
//   npm i && npm run stumble [-- --shots dir]
import { mkdirSync, readFileSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) { await g(() => __game.step(.6, 1 / 24)); await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); } };
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
  window.buttonSays = () => document.getElementById('bA').textContent;
  window.promptSays = () => { const p = document.getElementById('prompt'); return p.hidden ? '' : p.textContent; };
});

// ---------------- what's there
const built = await g(async () => {
  const G = __game, S = G.stumble, data = await (await fetch('data/lanes.json')).json(), has = (id) => G.structures.find((s) => s.id === id);
  const road = data.lanes.filter((l) => l.name === 'Chunky Duffee Rd'), north = Math.min(...road.flatMap((l) => l.points.map((p) => p[1])));
  const pool = G.water.ponds.find((p) => p.id === 'pool-3');
  const old = true2(-301, -1992), bars = G.map.closedLanes.filter((c) => Math.hypot(c.x - old[0], c.z - old[1]) < 300).length;
  return {
    trailer: has(S.CRT_TRAILER)?.use, walls: has(S.CRT_TRAILER)?.walls, poolHouse: has(76031221)?.use, church: has(76030447)?.use, behind: !!has(900015), barn: has(75057397)?.use, home: has(76025900)?.use,
    pool: pool?.pool, north, bars, roadSurface: [...new Set(road.map((l) => l.surface))],
  };
});
check('the trailer is a trailer, in its place', built.trailer === 'mobile' && built.walls === 'mobile', built);
check('the low building by the pool is there, and the pool is the green one', built.poolHouse === 'public' && built.pool === 'green', built);
check('the church is where it is, and the barn and the home down the road are what they are', built.church === 'church' && built.behind && built.barn === 'farm' && built.home === 'mobile', built);
check('the road goes on past the cemetery, paved, and nothing bars where the map used to stop', built.north < -7500 && built.bars === 0 && built.roadSurface.join() === 'asphalt', built);

// ---------------- in from School St
const inside = await g(() => {
  const G = __game, S = G.stumble, at = S.CRT.at, P = G.player.pos, t2 = (u, v) => at(u, v);
  G.place(...true2(-352, -556)); G.sim(.2, .1);
  const out = walkTo([t2(8.5, 9.5), t2(8.5, 7.3), t2(11.5, 7.3), t2(12.4, 6.7)]), door = !G.houseAt(P.x, P.z);
  const steps = walkTo([t2(12.4, 5), t2(14, 3.4), t2(17.2, 3)]), home = G.houseAt(P.x, P.z)?.id;
  const early = { act: G.S.act, button: buttonSays() };
  const back = walkTo([t2(20, 3.4), t2(22.9, 4.1)]);
  return { out, door, steps, home, early, back, act: G.S.act, button: buttonSays(), id: S.CRT_TRAILER };
});
check('he comes up onto the deck from the side that\'s open', inside.out.off < .8 && inside.door, inside);
check('in through the door and through the gap in the shelves', inside.steps.off < .8 && inside.home === inside.id, inside);
check('nothing asks anything of him till he gets to it', inside.early.act !== 'Look at the screen', inside.early);
check('at the desk it says to look at the screen, and the button says LOOK', inside.back.off < .9 && inside.act === 'Look at the screen' && inside.button === 'LOOK', inside);
await snap('at-the-desk');

// ---------------- up to the screen and away again
const eye = () => g(() => { const G = __game, S = G.stumble, c = G.camera.position; return { looking: S.looking(), act: G.S.act, button: buttonSays(), prompt: promptSays(), d: +Math.hypot(c.x - S.CRT.gx, c.z - S.CRT.gz).toFixed(2), shown: G.heroRoot.visible, seeing: G.G.uSee.value.w }; });
await tap(); await g(() => __game.step(1.4, 1 / 24));
const close1 = await eye();
check('a tap and he\'s right up to the glass, out of the way, and only the button\'s showing', close1.looking && close1.d < 1 && !close1.shown && close1.prompt === '' && close1.button === 'BACK' && close1.seeing === 0, close1);
await snap('the-screen');
const running = await g(() => { const S = __game.stumble, frames = new Set(), flick = new Set(); for (let i = 0; i < 30; i++) { __game.step(.1, 1 / 24); frames.add(S.frame()); flick.add(S.flick().toFixed(3)); } return { frames: frames.size, flick: flick.size }; });
check('it flickers, and the caret blinks', running.frames === 2 && running.flick > 2, running);
await tap(); await g(() => __game.step(1.4, 1 / 24));
const back1 = await eye();
check('a tap on BACK and he\'s back behind himself', !back1.looking && back1.d > 2 && back1.shown && back1.act === 'Look at the screen', back1);
await tap(); await g(() => __game.step(.8, 1 / 24));
const moved = await g(() => { const G = __game, S = G.stumble, was = S.looking(); G.key('s', true); G.sim(.1, 1 / 30); G.key('s', false); G.step(1.4, 1 / 24); return { was, now: S.looking(), shown: G.heroRoot.visible }; });
check('and it stops when he moves', moved.was && !moved.now && moved.shown, moved);

// ---------------- a look through what the page and the sheet actually say
{
  const html = readFileSync('index.html', 'utf8'), block = html.slice(html.indexOf('===== the second trailer'), html.indexOf('===== the community pool')), stone = JSON.parse(readFileSync('data/stone.json', 'utf8'));
  check('the words on the stone are only ever the owner\'s', stone.words === '', stone);
  check('the screen is the Buddy List, with nobody on it', /Buddy List/.test(block) && /Offline \(41\/41\)/.test(block) && !/ChunkyNet/.test(block), null);
}

// ---------------- break it and it's over
const broke = await g(() => { const G = __game, S = G.stumble; G.wreck.breakProp(S.CRT.prop, 0, 1); G.sim(.2, .1); return { on: S.crtOn(), act: G.S.act, glow: S.CRT.glow.visible }; });
check('break the computer and that is the end of it', !broke.on && broke.act !== 'Look at the screen' && !broke.glow, broke);

// ---------------- the pool
const pool = await g(() => {
  const G = __game, P = G.player.pos, p = G.water.ponds.find((o) => o.id === 'pool-3'), T = 1 / 30, [ax, az] = true2(-447, -571), [bx, bz] = true2(-431.5, -571), modes = new Set();
  G.place(ax, az); G.sim(.2, .1); let t = 0; G.key('w', true);
  while (t < 40 && Math.hypot(P.x - bx, P.z - bz) > .8) { G.look(Math.atan2(P.x - bx, P.z - bz)); G.sim(T, T); t += T; modes.add(G.S.mode); }
  G.key('w', false); G.sim(.1, .1);
  const [dx, dz] = true2(-420, -590);
  return { modes: [...modes], mode: G.S.mode, off: +Math.hypot(P.x - bx, P.z - bz).toFixed(1), deep: +(G.water.level(p.x, p.z) - G.floorAt(p.x, p.z)).toFixed(2), bare: G.groundH(dx, dz) };
});
check('he goes in, swims it and climbs out at the low building', pool.modes.includes('swim') && pool.mode === 'town' && pool.off < 1.2, pool);
await snap('the-pool');

// ---------------- up the road, past where the map used to stop
const north = await g(async () => {
  const G = __game, data = await (await fetch('data/lanes.json')).json(), T = 1 / 30, lane = (n) => data.lanes.filter((l) => l.name === 'Chunky Duffee Rd').sort((a, b) => b.points[0][1] - a.points[0][1])[n].points;
  // the long stretch to where the next one comes off it, and on up that as far as the cemetery
  const low = lane(1), high = lane(2), cut = low.reduce((b, p, i) => (Math.hypot(p[0] - high[0][0], p[1] - high[0][1]) < Math.hypot(low[b][0] - high[0][0], low[b][1] - high[0][1]) ? i : b), 0);
  const line = [...low.slice(0, cut + 1), ...high].filter((p) => p[1] > -7400).map((p) => true2(...p));
  const v = G.vehicles.find((o) => o.kind === 'pickup' && !o.wrecked), a = v.yaw + Math.PI / 2, off = v.K.width / 2 + 1;
  G.place(v.x + Math.sin(a) * off, v.z + Math.cos(a) * off); G.step(.6);
  G.key('e', true); G.sim(T, T); G.key('e', false); G.sim(T, T);
  const inIt = G.driving()?.kind, [sx, sz] = line[0], yaw = Math.atan2(line[2][0] - sx, line[2][1] - sz);
  v.x = sx; v.z = sz; v.y = G.floorAt(sx, sz); v.yaw = yaw; v.f = v.s = v.steer = 0; v.grounded = true; G.look(yaw + Math.PI); G.sim(.2, T);
  let i = 0, t = 0, hits = 0, far = 0, last = v.hp, top = 0;
  while (t < 500) {
    while (i < line.length - 1 && Math.hypot(line[i][0] - v.x, line[i][1] - v.z) < 8 + Math.abs(v.f) * .9) i++;
    const [tx, tz] = line[i]; let d = Math.atan2(tx - v.x, tz - v.z) - v.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (i === line.length - 1 && Math.hypot(tx - v.x, tz - v.z) < 10) break;
    G.stick(Math.max(-1, Math.min(1, -d * 2.4)), Math.abs(v.f) > (Math.abs(d) > .35 ? 9 : 99) ? -1 : 1); G.sim(T, T); t += T;
    top = Math.max(top, Math.abs(v.f)); if (v.hp < last) { hits++; last = v.hp; } far = Math.max(far, G.map.roadGrid.nearest(v.x, v.z));
  }
  G.stick(0, 0); G.key('s', true); for (let k = 0; k < 240 && Math.abs(v.f) > .4; k++) G.sim(T, T); G.key('s', false); v.f = v.s = 0; G.sim(T, T);
  const [ex, ez] = line.at(-1);
  return { inIt, t: +t.toFixed(0), off: +Math.hypot(ex - v.x, ez - v.z).toFixed(1), metres: line.length, hits, far: +far.toFixed(1), top: +top.toFixed(1), wrecked: v.wrecked };
});
check(`a pickup goes up it from where the map stopped, in ${north.t} s, and it's clear all the way`, north.inIt === 'pickup' && north.off < 30 && !north.wrecked && north.hits === 0 && north.far < 6, north);
await snap('up-the-road');

// ---------------- on foot up the loop, through the gate, and between the stones to the one with words on it
const found = await g(() => {
  const G = __game, S = G.stumble, P = G.player.pos;
  G.key('e', true); G.sim(1 / 30, 1 / 30); G.key('e', false); G.sim(.3, 1 / 30);
  G.place(...true2(-472, -7392)); G.sim(.2, .1);
  const up = walkTo([true2(-447, -7409.4), true2(-428, -7431), true2(-415.5, -7428.5), true2(-410, -7420)], .8, 60);
  // the way through from the gate, in half metres, round whatever's in the way
  const Y = G.floorAt(P.x, P.z), key = (i, j) => i * 100000 + j, cell = .6, [gx, gz] = [Math.round(P.x / cell), Math.round(P.z / cell)];
  const seen = new Map([[key(gx, gz), null]]), q = [[gx, gz]]; let done = null;
  for (let h = 0; h < q.length && !done && h < 30000; h++) {
    const [i, j] = q[h];
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const n = key(i + a, j + b), x = (i + a) * cell, z = (j + b) * cell;
      if (seen.has(n) || G.blocked(x, z, Y) || G.blocked(x + .15, z, Y) || G.blocked(x - .15, z, Y) || G.blocked(x, z + .15, Y) || G.blocked(x, z - .15, Y)) continue;
      seen.set(n, [i, j]); q.push([i + a, j + b]);
      if (Math.hypot(x - S.STONE.x, z - S.STONE.z) < 1.5) { done = [i + a, j + b]; break; }
    }
  }
  const path = []; if (done) for (let c = done; c; c = seen.get(key(c[0], c[1]))) path.unshift([c[0] * cell, c[1] * cell]);
  const start = G.S.act, walk = done ? walkTo(path.filter((_, k) => k % 2 === 0 || k === path.length - 1), .5, 90) : null;
  G.sim(.2, .1);
  return { up, done: !!done, steps: path.length, walk, start, act: G.S.act, button: buttonSays() };
});
check('up the loop and in through the gate', found.up.off < 1.2, found.up);
check('there\'s a way through to it, and it\'s a walk', found.done && found.steps > 15 && found.walk?.off < .9, { done: found.done, steps: found.steps, walk: found.walk });
check('nothing says anything till he\'s right up to it', found.start !== 'Read the stone' && found.act === 'Read the stone' && found.button === 'READ', found);
await tap(); await g(() => __game.sim(.1, 1 / 30));
const read = await g(() => ({ says: promptSays(), read: __game.stumble.stoneRead() }));
check('it says there are words on it, and which they are is the owner\'s to fill in', read.read && /imprinted on the stone/.test(read.says), read);
await snap('the-stone');
const typed = await g(() => { const G = __game, S = G.stumble; S.sheet.words = 'A LINE FROM THE SHEET'; G.sim(.1, 1 / 30); const says = promptSays(); S.sheet.words = ''; return says; });
check('and whatever goes on the sheet is what it says', typed === 'A LINE FROM THE SHEET', typed);
const leave = await g(() => { const G = __game, S = G.stumble, P = G.player.pos; G.place(P.x + 4, P.z); G.sim(.2, 1 / 30); const away = S.stoneRead(); G.place(S.STONE.x, S.STONE.z + 1); G.sim(.2, 1 / 30); return { away, act: G.S.act, says: promptSays() }; });
check('walk off and come back and it has to be read again', !leave.away && leave.act === 'Read the stone' && /Read the stone/.test(leave.says), leave);

// ---------------- it's somebody's
const graves = await g(() => {
  const G = __game, S = G.stumble, Y = G.floorAt(S.STONE.x, S.STONE.z), tall = S.GRAVES.filter((o) => o.kind !== 'slab'), stops = tall.filter((o) => { const [x, z] = G.map.fromTrue(o.x, o.z); return G.blocked(x, z, Y); }).length;
  const near = G.wreck.props.filter((p) => p.cx !== undefined && Math.hypot(p.cx - S.STONE.x, p.cz - S.STONE.z) < 90), kinds = [...new Set(near.map((p) => p.kind))];
  const turn = Math.atan2(S.CEMETERY.back[0], S.CEMETERY.back[1]), flat = S.GRAVES.find((o) => o.kind === 'slab'), foot = flat.d / 2 - .1, [fx, fz] = G.map.fromTrue(flat.x + Math.sin(turn + flat.turn) * foot, flat.z + Math.cos(turn + flat.turn) * foot);
  return { total: S.GRAVES.length, tall: tall.length, stops, kinds, slabStops: G.blocked(fx, fz, Y) };
});
check(`${graves.total} stones, and every one stops him, except that he can walk on a slab`, graves.stops === graves.tall && !graves.slabStops, graves);
check('nothing there can be broken but the fence and what grows there', graves.kinds.every((k) => ['fence', 'tree', 'shrub', 'bench'].includes(k)), graves.kinds);
const cost = await g(() => { const G = __game, S = G.stumble; G.place(...true2(-435, -7412)); G.look(-2.2); G.step(.5, 1 / 24); G.renderer.info.autoReset = false; G.renderer.info.reset(); G.step(1 / 24, 1 / 24); const { calls, triangles } = G.renderer.info.render; G.renderer.info.autoReset = true; return { calls, triangles }; });
console.log(`     looking over the stones: ${cost.calls} draw calls and ${cost.triangles} triangles`);
await snap('over-the-stones');

check('no console errors', errors.length === 0, errors);
await close();

// ---------------- less motion
{
  const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const still = await page.evaluate(() => {
    const G = __game, S = G.stumble; G.pause(); G.jump('town'); G.S.flags.town = true; G.step(.1);
    G.place(S.CRT.x + S.CRT.fx * 1.2, S.CRT.z + S.CRT.fz * 1.2); G.sim(.2, .1); G.step(.2);
    const frames = new Set(), flick = new Set(); for (let i = 0; i < 30; i++) { G.step(.2); frames.add(S.frame()); flick.add(S.flick().toFixed(3)); }
    return { frames: frames.size, flick: flick.size };
  });
  check('with less motion the screen is a still', still.frames === 1 && still.flick === 1, still);
  await page.tap('#bA'); await page.waitForTimeout(20); await page.evaluate(() => __game.sim(1 / 30, 1 / 30));
  const cut = await page.evaluate(() => { const G = __game, S = G.stumble; G.step(1 / 24, 1 / 24); return { looking: S.looking(), crt: G.cam.crt }; });
  check('and it goes straight to the glass', cut.looking && cut.crt === 1, cut);
  check('with no console errors', errors.length === 0, errors);
  await close();
}
console.log(failed ? `${failed} failed` : 'all ok');
process.exitCode = failed ? 1 : 0;
