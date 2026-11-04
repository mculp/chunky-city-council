// Goes and finds what's only there for anyone who stumbles on it, on a phone-sized page, with the game's own movement and real taps. In from School St to the second trailer from the left, down its length to the computer in the back,
// up to the screen and away again. Across the green pool. Then in a pickup up the road past where the map used to stop, on foot up the gravel loop and through the gate, between the stones to the
// slab with words on it, the northernmost, which the owner picked, and READ all along it. Nothing's marked. Last, their song, played from a stand-in for it so a check never plays theirs: a pickup
// driving past the cemetery and then pulling up by it, as loud anywhere round it with the night noise and the crowd dipped under it, once a visit, reading the stone while it plays and once it's
// done, fading away up the road, walking back in, with the sound button and the effects slider, and nothing at all without it.
//
//   npm i && npm run stumble [-- --shots dir]
import { mkdirSync, readFileSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

// A stand-in for the owner's clip, so a check never plays theirs: a soft tone, as a WAV, which Chrome plays whatever it's called
function standIn(seconds, rate = 22050) {
  const n = Math.floor(seconds * rate), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * 330) * .3 * Math.min(1, i / 400, (n - i) / 400) * 32767), 44 + i * 2);
  return b;
}

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
// with no clip of the owner's, as there wasn't until they added it, so reading the stone plays nothing here
const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, overrides: { '/audio/music/stone.mp3': null } });
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
  // whatever the owner's put on it, or nothing yet: either way it's only ever words in it, and never printed here
  check('the stone\'s sheet is its words and nothing else', typeof stone.words === 'string' && Object.keys(stone).sort().join() === 'version,words', Object.keys(stone));
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
  // the way through from the gate, in half metres, round whatever's in the way, to the nearest of the slab or right beside it
  const W = S.WORDS_SLAB, turn = S.GRAVE_TURN + W.turn, bySlab = (x, z) => { const dx = x - W.x, dz = z - W.z; return Math.abs(dx * Math.cos(turn) - dz * Math.sin(turn)) <= W.w / 2 + .3 && Math.abs(dx * Math.sin(turn) + dz * Math.cos(turn)) <= W.d / 2 + .3; };
  const Y = G.floorAt(P.x, P.z), key = (i, j) => i * 100000 + j, cell = .6, [gx, gz] = [Math.round(P.x / cell), Math.round(P.z / cell)];
  const seen = new Map([[key(gx, gz), null]]), q = [[gx, gz]]; let done = null;
  for (let h = 0; h < q.length && !done && h < 30000; h++) {
    const [i, j] = q[h];
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const n = key(i + a, j + b), x = (i + a) * cell, z = (j + b) * cell;
      if (seen.has(n) || G.blocked(x, z, Y) || G.blocked(x + .15, z, Y) || G.blocked(x - .15, z, Y) || G.blocked(x, z + .15, Y) || G.blocked(x, z - .15, Y)) continue;
      seen.set(n, [i, j]); q.push([i + a, j + b]);
      if (bySlab(x, z)) { done = [i + a, j + b]; break; }
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
// the owner's words exactly, once they've put them in data/stone.json, and that there are words from a song on it until then
const read = await g(() => { const says = promptSays(), words = __game.stumble.sheet.words; return { read: __game.stumble.stoneRead(), theirs: !!words, right: words ? says === words : /imprinted on the stone/.test(says) }; });
check(read.theirs ? 'it says the owner\'s words, exactly' : 'it says there are words from a song on it, which are the owner\'s to fill in', read.read && read.right, read);
// with no clip of the owner's there, it's asked for once, and nothing plays and nothing's said, pulling up or reading
const silent = await g(async () => { await new Promise((r) => setTimeout(r, 500)); const G = __game, s = G.sound.state(); return { unlocked: s.unlocked, clip: s.clips[G.stumble.STONE_CLIP] ?? null, clipping: s.clipping, said: !document.getElementById('sub').hidden }; });
check('with no clip of the owner\'s there, pulling up and reading it play nothing and say nothing', silent.unlocked && silent.clip?.there === false && !silent.clip.playing && silent.clipping === 0 && !silent.said, silent);
await snap('the-stone');
const typed = await g(() => { const G = __game, S = G.stumble; S.sheet.words = 'A LINE FROM THE SHEET'; G.sim(.1, 1 / 30); const says = promptSays(); S.sheet.words = ''; return says; });
check('and whatever goes on the sheet is what it says', typed === 'A LINE FROM THE SHEET', typed);
// clear of the slab, which can be read from anywhere along it
const leave = await g(() => { const G = __game, S = G.stumble, P = G.player.pos; G.place(P.x + 8, P.z); G.sim(.2, 1 / 30); const away = S.stoneRead(); G.place(S.STONE.x, S.STONE.z + 1); G.sim(.2, 1 / 30); return { away, act: G.S.act, says: promptSays() }; });
check('walk off and come back and it has to be read again', !leave.away && leave.act === 'Read the stone' && /Read the stone/.test(leave.says), leave);
// all along the slab, on it or beside it, and not from further off, and the upright in the middle that had the words before is an ordinary stone
const along = await g(() => {
  const G = __game, S = G.stumble, W = S.WORDS_SLAB, a = S.GRAVE_TURN + W.turn, at = (u, v) => [W.x + u * Math.cos(a) + v * Math.sin(a), W.z - u * Math.sin(a) + v * Math.cos(a)];
  const reads = ([x, z]) => { G.place(x, z); G.sim(.1, 1 / 30); return G.S.act === 'Read the stone' && buttonSays() === 'READ'; };
  const on = [[0, W.d / 2 - .3], [0, 0], [.6, -W.d / 2 + .7], [-W.w / 2 - .6, 0], [W.w / 2 + .6, -W.d / 4], [0, W.d / 2 + .6]].map((p) => reads(at(...p)));
  const off = [[-W.w / 2 - 1.6, 0], [W.w / 2 + 1.6, 0], [0, W.d / 2 + 1.6]].map((p) => reads(at(...p)));
  const [ux, uz] = true2(...S.CEMETERY.upright), upright = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([dx, dz]) => { G.place(ux + dx, uz + dz); G.sim(.1, 1 / 30); return G.S.act; });
  return { on, off, upright, slab: [+W.w.toFixed(2), +W.d.toFixed(2)] };
});
check(`READ comes up anywhere along the slab, on it or beside it, and not from further off`, along.on.every(Boolean) && !along.off.some(Boolean), along);
check('and the upright in the middle that had the words is an ordinary stone again', along.upright.every((a) => a !== 'Read the stone'), along.upright);

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

// ---------------- the stone's words with every button showing
// nothing covers any of them: SHAMBLE, with the crowd out, and something to throw and something else to switch to
await g(() => { const G = __game, S = G.stumble; G.bringOutCrowd(); G.S.items.bottle = 2; G.S.items.crackers = 1; G.place(S.STONE.x, S.STONE.z + 1); G.sim(.2, 1 / 30); });
await tap(); await g(() => __game.sim(.1, 1 / 30));
const covered = await g(() => {
  const box = document.getElementById('prompt').getBoundingClientRect(), shown = [], over = [];
  for (const b of document.getElementById('btns').children) {
    const s = getComputedStyle(b);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    const r = b.getBoundingClientRect(); shown.push(b.id);
    if (r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top) over.push(b.id);
  }
  return { read: __game.stumble.stoneRead(), shown, over, box: [box.left, box.top, box.right, box.bottom].map(Math.round), w: innerWidth };
});
check(`nothing covers the stone's words, with ${covered.shown.join(', ')} showing`, covered.read && !covered.over.length && ['bH', 'bC', 'bN'].every((id) => covered.shown.includes(id)) && covered.box[0] >= 0 && covered.box[2] <= covered.w, covered);
await snap('the-stone-and-every-button');

check('no console errors', errors.length === 0, errors);
await close();

// ---------------- their song, from a stand-in for it so a check never plays theirs, in Chrome with nothing to play it out of, on the levels the game sets and what comes out of it.
// A pickup up Chunky Duffee Rd past the cemetery without stopping, and then pulling up by it. It's music, as loud anywhere round the cemetery, with the night noise and the crowd dipped
// under it, and once a visit. Reading the stone carries it on, and starts it once it's done. It fades away up the road, and walking back in after being well off starts it again.
{
  const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, overrides: { '/audio/music/stone.mp3': standIn(5) } });
  const g = (fn, arg) => page.evaluate(fn, arg), wait = (s) => page.waitForTimeout(s * 1000);
  const read = async () => { await page.tap('#bA'); await page.waitForTimeout(20); await g(() => __game.sim(1 / 30, 1 / 30)); };
  const now = () => g(() => { const G = __game, S = G.stumble, s = G.sound.state(); return { c: s.clips[S.STONE_CLIP] ?? null, clipping: s.clipping, aim: s.aim, db: G.sound.meter(), muted: G.sound.muted, visit: S.song.visit, read: S.stoneRead(), d: +S.fromCemetery(G.player.pos.x, G.player.pos.z).toFixed(1) }; });
  // on foot to a place, in true metres, and a moment there
  const at = (x, z) => g(([x, z]) => { const G = __game; G.place(...G.map.fromTrue(x, z)); G.sim(.3, 1 / 30); }, [x, z]);
  await g(async () => {
    const G = __game, S = G.stumble, W = S.WORDS_SLAB, a = S.GRAVE_TURN + W.turn, T = 1 / 30; G.pause(); G.jump('town'); G.S.flags.town = true; G.step(.1); document.getElementById('card').style.display = 'none';
    window.slab = (u, v) => [W.x + u * Math.cos(a) + v * Math.sin(a), W.z - u * Math.sin(a) + v * Math.cos(a)];
    // Chunky Duffee Rd from more than 100 m short of the cemetery to more than 100 m past it, which goes by it 9 m off
    const lanes = (await (await fetch('data/lanes.json')).json()).lanes.filter((l) => l.name === 'Chunky Duffee Rd').map((l) => l.points.map((p) => G.map.fromTrue(...p)));
    const lane = lanes.find((l) => l.some(([x, z]) => S.fromCemetery(x, z) < 15)), first = lane.findIndex(([x, z], i) => S.fromCemetery(x, z) < 105 && i > 0) - 1;
    window.road = lane.slice(first, lane.findIndex(([x, z], i) => i > first + 2 && S.fromCemetery(x, z) > 110 && z < lane[first][1]) + 1);
    const v = G.vehicles.find((o) => o.kind === 'pickup' && !o.wrecked), side = v.yaw + Math.PI / 2;
    G.place(v.x + Math.sin(side) * (v.K.width / 2 + 1), v.z + Math.cos(side) * (v.K.width / 2 + 1)); G.step(.6);
    G.key('e', true); G.sim(T, T); G.key('e', false); G.sim(T, T);
    window.truck = v;
    // the pickup to the start of the road, stopped and facing up it
    window.toStart = () => { const [sx, sz] = road[0], yaw = Math.atan2(road[2][0] - sx, road[2][1] - sz); Object.assign(v, { x: sx, z: sz, y: G.floorAt(sx, sz), yaw, f: 0, s: 0, steer: 0, grounded: true }); G.look(yaw + Math.PI); G.sim(.5, T); };
    // up the road with the stick, steering for a point ahead on it, at `top` m/s at most, slower in a bend, and if `stopBy` is given, braking once he's that near the cemetery.
    // Says how near it went, how slow it was going while it was within 25 m, how fast it was going when their song was asked for, and how near.
    window.drive = (top, stopBy = null) => {
      let i = 0, t = 0, closest = Infinity, slowest = Infinity, asked = null;
      const note = () => { const d = S.fromCemetery(v.x, v.z), sp = Math.hypot(v.f, v.s); closest = Math.min(closest, d); if (d < 25) slowest = Math.min(slowest, sp); if (!asked && G.sound.state().clips[S.STONE_CLIP]) asked = { d: +d.toFixed(1), speed: +sp.toFixed(2) }; return d; };
      while (t < 90) {
        while (i < road.length - 1 && Math.hypot(road[i][0] - v.x, road[i][1] - v.z) < 8 + Math.abs(v.f) * .9) i++;
        const [tx, tz] = road[i]; let d = Math.atan2(tx - v.x, tz - v.z) - v.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        if ((i === road.length - 1 && Math.hypot(tx - v.x, tz - v.z) < 10) || (stopBy !== null && note() < stopBy)) break;
        G.stick(Math.max(-1, Math.min(1, -d * 2.4)), Math.abs(v.f) > (Math.abs(d) > .35 ? Math.min(9, top) : top) ? -1 : 1); G.sim(T, T); t += T; note();
      }
      G.stick(0, 0);
      if (stopBy !== null) { G.key('s', true); for (let k = 0; k < 240 && Math.abs(v.f) > .3; k++) { G.sim(T, T); note(); } G.key('s', false); for (let k = 0; k < 15; k++) { G.sim(T, T); note(); } }
      return { closest: +closest.toFixed(1), slowest: +slowest.toFixed(1), asked, t: +t.toFixed(1), stopped: +Math.hypot(v.f, v.s).toFixed(2) };
    };
  });
  await page.keyboard.press('Shift'); await wait(.4);
  const before = await now();
  const past = await g(() => { toStart(); return drive(14); });
  await wait(.6);
  const after = await now();
  check(`driving past at speed doesn't start it: by it ${past.closest} m off, and never under ${past.slowest} m/s within 25 m`, past.closest < 12 && past.slowest > 4 && !past.asked && !after.c && !after.visit && after.d > 100, { past, after });
  const up = await g(() => { toStart(); return drive(14, 26); });
  await wait(.8);
  const first = await now();
  check(`pulling up in a pickup starts it: asked for at ${up.asked?.speed} m/s, ${up.asked?.d} m off, once it's stopped`, up.asked && up.asked.speed < 2 && up.asked.d < 25 && first.c?.there === true && first.c.playing && first.clipping === 1 && first.c.gain > 0 && first.c.much === 1, { up, c: first.c });
  check(`with the night noise down to ${Math.round(first.aim.ambience / before.aim.ambience * 100)}% under it and the crowd to ${Math.round(first.aim.effects / before.aim.effects * 100)}%`,
    first.aim.ambience < before.aim.ambience * .6 && first.aim.effects < before.aim.effects * .8 && first.aim.voice === before.aim.voice, { before: before.aim, during: first.aim });
  // out of the pickup, and about the cemetery on foot: at the stone, in through the gate, on the road by it, across the road at the church, and 50 m up the road
  await g(() => { const G = __game; G.key('e', true); G.sim(1 / 30, 1 / 30); G.key('e', false); G.sim(.5, 1 / 30); });
  const round = [];
  for (const [x, z] of [[-391.5, -7425.5], [-415.5, -7428.5], [-485, -7353], [-497, -7392], [-425.2, -7489.4]]) { await at(x, z); await wait(.3); const n = await now(); round.push({ d: n.d, gain: n.c.gain, playing: n.c.playing, at: n.c.at }); }
  check(`it's as loud anywhere round the cemetery, from in it to ${Math.max(...round.map((r) => r.d))} m off: ${[...new Set(round.map((r) => r.gain))].join(', ')}`, round.every((r) => r.playing && r.at === first.c.at && Math.abs(r.gain - first.c.gain) < .002) && Math.max(...round.map((r) => r.d)) > 45, round);
  await g(() => { __game.place(...slab(0, __game.stumble.WORDS_SLAB.d / 2 - .3)); __game.sim(.3, 1 / 30); });
  await read(); await wait(.2);
  const again = await now();
  check('reading the stone while it\'s playing carries it on, and doesn\'t start it over or start another', again.read && again.c.playing && again.c.at === first.c.at && again.clipping === 1, { first: first.c, again: again.c });
  const loud = await now();
  await page.locator('#mute').tap(); await wait(.3);
  const hushed = await now();
  await page.locator('#mute').tap(); await wait(.2);
  check(`the sound button has it: ${loud.db.toFixed(0)} dB coming out, then ${hushed.db.toFixed(0)}`, hushed.muted && hushed.c.playing && loud.db > -50 && hushed.db < loud.db - 40, { loud: loud.db, hushed: hushed.db });
  await page.waitForFunction(() => !__game.sound.state().clips[__game.stumble.STONE_CLIP].playing, null, { timeout: 8000 }).catch(() => {}); await wait(.8);
  const done = await now();
  check('once it\'s done, the night noise and the crowd come back up', !done.c.playing && done.clipping === 0 && ['music', 'ambience', 'effects', 'voice'].every((b) => Math.abs(done.aim[b] - before.aim[b]) < .01), { before: before.aim, after: done.aim });
  await read(); await wait(.4);
  const next = await now();
  check('and reading the stone once it\'s done starts it again', next.read && next.c.playing && next.c.at > first.c.at, next.c);
  // the effects slider, with a real drag, under the button beside the mute
  await page.locator('#levels').tap(); await wait(.2);
  const lane = await page.locator('#lvEffects').boundingBox(), mid = lane.y + lane.height / 2;
  await page.mouse.move(lane.x + lane.width - 6, mid); await page.mouse.down(); await page.mouse.move(lane.x + lane.width * .25, mid, { steps: 8 }); await page.mouse.up(); await wait(.5);
  const slid = await now(), effects = await g(() => __game.sound.levelOf('effects'));
  check(`the effects slider turns it down with the rest of the effects, to ${Math.round(effects * 100)}%`, effects < .5 && slid.c.playing && Math.abs(slid.c.out / next.c.out - effects) < .05, { effects, was: next.c.out, now: slid.c.out });
  await page.locator('#levels').tap(); await wait(.1);
  // up the road, past 60 m, it fades away over a few seconds, and everything else comes back up as it does
  const full = (await now()).c.gain;
  await g(() => { const G = __game; G.place(...G.map.fromTrue(-505.1, -7296.6)); G.sim(2, 1 / 30); }); await wait(.4);
  const fading = await now();
  await g(() => __game.sim(2.5, 1 / 30)); await wait(.4);
  const gone = await now();
  check(`${fading.d} m off it fades away: ${Math.round(fading.c.much * 100)}% of it 2 s on, and none of it 2.5 s after that`, fading.c.playing && Math.abs(fading.c.much - .5) < .05 && Math.abs(fading.c.gain - full * fading.c.much) < .01 && !gone.c.playing && gone.clipping === 0, { fading: fading.c, gone: gone.c, full });
  check('and the night noise comes back up with it', fading.aim.ambience > slid.aim.ambience && Math.abs(gone.aim.ambience - before.aim.ambience) < .01, { during: slid.aim.ambience, fading: fading.aim.ambience, gone: gone.aim.ambience, before: before.aim.ambience });
  // back without having been 100 m off: it's the same visit
  await at(-485, -7353); await g(() => __game.sim(1, 1 / 30)); await wait(.4);
  const back = await now();
  check(`back ${back.d} m off without having been 100 m away, it doesn't start again by itself`, back.visit && !back.c.playing, back);
  // well off, and in again on foot
  await at(-511.8, -7246.7);
  const off = await now();
  const walk = await g(() => {
    const G = __game, S = G.stumble, P = G.player.pos, T = 1 / 30, [ex, ez] = G.map.fromTrue(-484.9, -7353.3); let t = 0, started = null;
    G.key('w', true);
    while (t < 60 && Math.hypot(P.x - ex, P.z - ez) > .8) { G.look(Math.atan2(P.x - ex, P.z - ez)); G.sim(T, T); t += T; if (!started && S.song.visit) started = +S.fromCemetery(P.x, P.z).toFixed(1); }
    G.key('w', false); G.sim(T, T);
    return { started, t: +t.toFixed(1) };
  });
  await wait(.6);
  const walked = await now();
  check(`after ${off.d} m off, walking back in starts it again, ${walk.started} m from it`, !off.visit && walk.started !== null && walk.started <= 25 && walk.started > 23 && walked.c.playing && walked.c.at > next.c.at && walked.c.much === 1, { off: off.d, walk, c: walked.c });
  check('with no console errors', errors.length === 0, errors);
  await close();
}

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
