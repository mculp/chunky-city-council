// Goes round the gas station on US 80 on a phone-sized page, with the game's own movement and real taps: in through the door, along the shelves for what's on them, behind the
// counter, bars the door with the crowd outside, and takes the boards down again. Then that the crowd goes for the canopy's light, and doesn't once it's broken.
//
//   npm i && npm run station [-- --shots dir]
import { mkdirSync, readFileSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); };
const tap = async (id = '#bA') => { await page.tap(id); await g(() => __game.step(.05)); };

await g(() => {
  const G = __game; G.pause(); G.jump('town'); G.S.flags.town = true; G.step(.1);
  // the store's coordinates, as index.html has it: (53, 10) on the true map's (-87.85, -31.1)
  window.loc = (x, z) => G.map.fromTrue(-87.85 + x - 53, -31.1 + z - 10);
  // heads for a spot along a list of places to go through, with his own legs, and says how close he got
  window.walk = (stops, within = .5, secs = 40) => {
    const P = G.player.pos; let t = 0;
    for (const stop of stops) {
      const [x, z] = loc(...stop); G.key('w', true);
      while (t < secs && Math.hypot(P.x - x, P.z - z) > within) { G.look(Math.atan2(P.x - x, P.z - z)); G.sim(1 / 30, 1 / 30); t += 1 / 30; }
      G.key('w', false);
    }
    G.step(.2); const [x, z] = loc(...stops.at(-1)); return { off: Math.hypot(P.x - x, P.z - z), t };
  };
  window.inside = () => { const P = G.player.pos, { pts } = G.station.house; let hit = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [ax, az] = pts[j], [bx, bz] = pts[i]; if ((az > P.z) !== (bz > P.z) && P.x < (bx - ax) * (P.z - az) / (bz - az) + ax) hit = !hit; } return hit; };
});

// ---- it's all where it should be
const placed = await g(() => {
  const G = __game, S = G.station, [px, pz] = loc(51, 10), [cx, cz] = loc(53, 8.4), [sx, sz] = loc(41.5, -2), [ax, az] = loc(43.5, -2), [ix, iz] = loc(41.8, 5.75), [kx, kz] = loc(55, 2.4), [ox, oz] = loc(50, -9);
  return { coop: Math.hypot(G.npcs.coop.x - cx, G.npcs.coop.z - cz), pump: G.blocked(px, pz, 6.2), shelf: G.blocked(sx, sz, 6.2), aisle: G.blocked(ax, az, 6.2), ice: G.blocked(ix, iz, 6.2), counter: G.blocked(kx, kz, 6.2), cooler: G.blocked(ox, oz, 6.2), lit: G.horde.lights.includes(S.spot), door: S.door.wide, walls: S.house.stops.size };
});
check('Coop\'s at the pumps', placed.coop < .1, placed);
check('the pumps, the ice box, the shelves, the counter and the coolers stop him', placed.pump && placed.ice && placed.shelf && placed.counter && placed.cooler, placed);
check('and he can get down an aisle', !placed.aisle, placed);
check('Coop still talks about the place', /I run the gas/.test(readFileSync(new URL('../data/cast.json', import.meta.url), 'utf8')));
await g(() => { const [x, z] = loc(46, 22); __game.place(x, z); __game.look(Math.atan2(x - loc(53, 8)[0], z - loc(53, 8)[1]), .22); __game.step(.6); }); await snap('from-the-road');

// ---- in through the door
let r = await g(() => walk([[50, 12.5], [50, 6.1], [49, 5.8], [49, 3.5]]));
check(`he walks in from the pumps, past the post and the barrel: ${r.t.toFixed(1)} s`, r.off < .6 && (await g(() => inside())), r);
check('nothing\'s offered from out in the middle of the room', !(await g(() => { const G = __game; G.place(...loc(47.5, -2)); G.step(.1); return G.S.act; })));
await g(() => { __game.place(...loc(49, 3.5)); __game.look(0, .4); __game.step(.4); }); await snap('inside');

// ---- what's on the shelves
const items0 = await g(() => __game.state());
check('nothing in his pockets yet', !items0.items.fluid && (await page.locator('#pockets').isHidden()), items0.items);
// along the aisles and round the ends of the shelves
for (const way of [[[46.8, 3], [46.8, -1]], [[46.8, 1.6], [53.1, 1.6]], [[47.5, 3], [44.1, 3], [44.1, -2.6]], [[44.1, 3], [42.6, 3], [42.6, -5]], [[42.6, 3], [40.4, 3], [40.4, -3.6]], [[40.4, 3], [38.6, 3], [38.6, .6]]]) r = await g((way) => walk(way, .35), way);
const got = await g(() => { const G = __game, { items, beans } = G.state(); return { items, beans, left: G.station.loot.filter((c) => !c.got).map((c) => c.kind), words: document.getElementById('pockets').textContent, shown: !document.getElementById('pockets').hidden, chapter: G.pickups.filter((c) => c.got).length }; });
check('he finds it all, on foot, off the shelves and the counter', !got.left.length, got);
check('two lots of lighter fluid and three of firecrackers', got.items.fluid === 2 && got.items.crackers === 3, got);
check('and a can of beans', got.beans === items0.beans + 1, got);
check('and it says what he\'s carrying', got.shown && /Firecrackers 3/.test(got.words) && /Lighter fluid 2/.test(got.words), got);
check('none of the chapter\'s own cans has gone', got.chapter === 0, got);
const can = await g(() => { const G = __game, [x, z] = loc(56.6, 3.7), c = G.station.cans.find((o) => Math.hypot(o.x - x, o.z - z) < .1); G.S.gas = 0; return !!c; });
r = await g(() => walk([[38.6, 3], [51, 3.7], [56.1, 3.7]], .35));
const gas = await g(() => __game.S.gas);
check('and a gas can behind the counter', can && gas === 1, [can, gas, r]);
await snap('behind-the-counter');

// ---- without the door barred they just come in after him
const uncrowd = await g(() => {
  const G = __game; G.bringOutCrowd(); const H = G.horde, [x, z] = loc(49, 7.6), P = G.player.pos;
  for (const s of H.all) { s.x += 900; s.z += 900; s.state = 0; }
  G.place(...loc(49.2, 3.4));
  window.pack = H.all.slice(0, 6); pack.forEach((s, i) => { s.x = x + (i - 2.5) * .7; s.z = z + (i % 2) * .6; s.y = 6.15; s.state = 2; s.alert = 1; s.tx = P.x; s.tz = P.z; s.timer = 0; s.lost = 0; });
  let t = 0; for (; t < 15 && !H.grab; t += 1 / 30) G.sim(1 / 30, 1 / 30);
  const grabbed = !!H.grab; if (H.grab) { G.S.mode = 'town'; H.calm(); } G.S.hp = 3; G.player.inv = 3; G.sim(.1, 1 / 30);
  return { grabbed, t };
});
check(`with the door open they come in and get him: ${uncrowd.t.toFixed(1)} s`, uncrowd.grabbed, uncrowd);

// ---- bar it, with the same button everything else is on
await g(() => { const G = __game; G.S.mode = 'town'; for (const s of pack) { const [x, z] = loc(49, 7.6 + Math.random()); s.x = x; s.z = z; s.state = 2; s.alert = 1; s.lost = 0; s.tx = x; s.tz = z; } G.place(...loc(49.2, 5.1)); G.look(0, .4); G.step(.1); });
const offered = await g(() => __game.S.act);
check('in the doorway it offers to bar the door', offered === 'Bar the door', offered);
check('on the phone\'s one button', (await page.textContent('#bA')).trim().toUpperCase().includes('BAR'), await page.textContent('#bA'));
await tap(); 
const barred = await g(() => { const G = __game, S = G.station, P = G.player.pos, d = S.door; return { barred: S.barred(), seen: S.boards.visible, stops: G.blocked(d.x, d.z, 6.2), standing: G.blocked(P.x, P.z, 6.2), inside: inside(), act: G.S.act, hit: S.bar.down }; });
check('the boards go up', barred.barred && barred.seen, barred);
check('they stop him and anything else', barred.stops, barred);
check('and he isn\'t left stuck in the doorway', !barred.standing && barred.inside, barred);
check('it offers to take them down', barred.act === 'Unbar the door', barred);
await snap('barred-from-inside');
const held = await g(() => {
  const G = __game, H = G.horde, S = G.station, P = G.player.pos; G.place(...loc(47.5, 3));
  let t = 0, got = false, inHouse = 0; for (; t < 14; t += 1 / 30) { G.sim(1 / 30, 1 / 30); got = got || !!H.grab; }
  const [px, pz] = loc(49, 7);
  return { got, hidden: S.barredIn(), states: pack.map((s) => s.state), alert: pack.map((s) => +s.alert.toFixed(2)), near: Math.min(...pack.map((s) => Math.hypot(s.x - P.x, s.z - P.z))) };
});
check('they don\'t get him', !held.got, held);
check('and they lose interest in the place', held.hidden && held.states.every((q) => q < 2), held);
await g(() => { const G = __game; const [x, z] = loc(50, 8); G.place(x, z); G.look(Math.PI, .2); G.step(.1); }); await snap('barred-from-outside');
const shutOut = await g(() => { const G = __game; G.place(...loc(49, 7.2)); G.step(.1); return G.S.act; });
check('from outside there\'s nothing to press', shutOut !== 'Unbar the door', shutOut);

// ---- a wall coming down gives him away
const wall = await g(() => {
  const G = __game, S = G.station; G.place(...loc(47.5, 3)); G.sim(.1, 1 / 30);
  const w = [...S.house.stops.values()].find((o) => o[6] >= 0), top = w[4]; w[4] = -1e9; const open = S.barredIn(); w[4] = top; return { open, back: S.barredIn() };
});
check('with a wall gone he isn\'t hidden any more', !wall.open && wall.back, wall);

// ---- and he can take them down
await g(() => { const G = __game; G.place(...loc(49.2, 4.6)); G.step(.1); }); await tap();
const down = await g(() => { const G = __game, S = G.station, d = S.door; return { barred: S.barred(), seen: S.boards.visible, stops: G.blocked(d.x, d.z, 6.2), act: G.S.act }; });
check('he can take them down and walk out', !down.barred && !down.seen && !down.stops && down.act === 'Bar the door', down);
await g(() => { const G = __game; G.horde.calm(); for (const s of G.horde.all) s.x += 900; });
r = await g(() => walk([[49, 4.6], [49, 5.8], [50, 6.1]], .5, 8)); check('and out he goes', r.off < 1 && !(await g(() => inside())), r);

// ---- a hammer goes through them, and that's the end of them
const smashed = await g(() => {
  const G = __game, S = G.station, H = G.horde; H.calm(); G.S.mode = 'town'; G.HP.kind = 'run'; G.place(...loc(49.2, 4.6)); G.step(.1);
  G.key('e', true); G.sim(1 / 30, 1 / 30); G.key('e', false); G.sim(.2, 1 / 30);
  const up = S.barred(); G.player.yaw = 0; G.look(Math.PI, .4); let n = 0; for (; n < 40 && !S.bar.down; n++) { G.key('f', true); G.sim(1 / 30, 1 / 30); G.key('f', false); G.sim(.5, 1 / 30); }
  G.sim(.1, 1 / 30); const d = S.door; return { up, swings: n, down: S.bar.down, barred: S.barred(), stops: G.blocked(d.x, d.z, 6.2), act: G.S.act };
});
check(`a hammer goes through the boards: ${smashed.swings} swings`, smashed.up && smashed.down && !smashed.barred && !smashed.stops, smashed);
check('and there\'s nothing left to bar it with', smashed.act !== 'Bar the door', smashed);

// ---- it brings them in at night, until it's broken. A shambler goes for a light it's near about one time in three, and they're shuffling, so it takes a while to show.
const light = await g(() => {
  const G = __game, H = G.horde, S = G.station, spot = S.spot; G.place(...loc(53, 40));
  const round = () => {
    H.calm(); H.all.slice(0, 24).forEach((s, i) => { const a = i / 24 * 6.283; s.x = s.homeX = spot.x + Math.cos(a) * 26; s.z = s.homeZ = spot.z + Math.sin(a) * 26; s.y = G.floorAt(s.x, s.z); s.lead = null; s.state = 0; s.alert = 0; s.timer = 0; s.tx = s.x; s.tz = s.z; });
    let close = 0; const secs = 70; for (let t = 0; t < secs; t += 1 / 5) { G.sim(1 / 5, 1 / 30); for (const s of H.all.slice(0, 24)) if (Math.hypot(s.x - spot.x, s.z - spot.z) < 10) close++; } return Math.round(close / (secs * 5));
  };
  // where they live is where they're put, or some of them only head home, wherever that happened to be
  // the barrel by the pumps is a light too, so it's the canopy's on its own against none at all
  const on = H.lights.includes(spot), all = [...H.lights];
  H.lights.length = 0; H.lights.push(spot); const withLight = round();
  H.lights.length = 0; const without = round();
  H.lights.push(...all); G.wreck.breakProp(S.canopy, 1, 0); G.sim(.5, 1 / 30);
  return { on, withLight, without, off: !H.lights.includes(spot), strip: S.strip.visible, power: S.light.intensity };
});
check(`the crowd gathers under the canopy's light: ${light.withLight} of 24 on average`, light.on && light.withLight >= 6, light);
check(`and with no light they don't: ${light.without} of 24`, light.without < light.withLight / 2, light);
check('and it goes out when the canopy comes down', light.off && !light.strip && light.power === 0, light);

// ---- what it costs, standing in there looking along the shelves
const cost = await g(() => { const G = __game; G.place(...loc(43.5, 3)); G.look(0, .35); G.step(.4); return G.calls(); });
console.log(`     in the store: ${cost.calls} draw calls and ${cost.triangles} triangles`);
check('and there are no console errors', errors.length === 0, errors);
await close();

// ---- it flickers, unless things have been asked to hold still
for (const reducedMotion of [undefined, 'reduce']) {
  const p = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, reducedMotion });
  const seen = await p.page.evaluate(() => { const G = __game, S = G.station; G.pause(); G.jump('town'); G.S.flags.town = true; G.step(.1); const set = new Set(); for (let i = 0; i < 900; i++) { G.sim(1 / 60, 1 / 60); set.add(S.light.intensity); } return [...set]; });
  check(reducedMotion ? 'with reduced motion the canopy\'s light holds still' : 'the canopy\'s light flickers', reducedMotion ? seen.length === 1 : seen.length === 2, seen);
  check('with no console errors', p.errors.length === 0, p.errors);
  await p.close();
}
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
