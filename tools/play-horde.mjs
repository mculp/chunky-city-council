// Plays against the crowd in real Chrome with the game's own movement and real key presses: they roam the real map, and the ones
// who've burnt down notice him, run him down and grab him, and he gets away. Fails on anything out of place or a console error.
// The ones who've gone quiet are npm run quiet's.
//
//   npm i && npm run horde -- [--shots dir]
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { serveAndOpen } from './browser.mjs';

const args = process.argv.slice(2), shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const { page, errors, close } = await serveAndOpen({ viewport: { width: 390, height: 844 }, query: '?test&horde' });

let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) { await mkdir(shots, { recursive: true }); await g(() => __game.step(1 / 12)); await page.screenshot({ path: join(shots, name + '.png') }); } };

const helpers = () => {
  const G = __game, H = G.horde;
  // who's around him, in a ring. They're ones who've burnt down, and come for him on sight, unless it says otherwise. npm run quiet has the ones who've gone quiet.
  window.crowdRing = (n, r, at = G.player.pos, extra = { quiet: false }) => {
    for (let i = 0; i < n; i++) { const a = i / n * 6.28, x = at.x + Math.sin(a) * r, z = at.z + Math.cos(a) * r; H.add(x, z, extra); }
  };
  window.clearCrowd = () => { H.calm(); H.all.length = 0; H.active.length = 0; };
  window.states = () => { const c = [0, 0, 0, 0, 0, 0]; for (const s of H.all) c[s.state]++; return c; };
  window.away = (s) => Math.hypot(s.x - G.player.pos.x, s.z - G.player.pos.z);
  window.nearest = () => Math.min(...H.all.map(away));
  // runs a heading with the game's own movement, the camera behind him
  window.run = (x, z, seconds, stop) => {
    const P = G.player.pos; G.key('w', true);
    for (let t = 0; t < seconds; t += 1 / 30) { G.look(Math.atan2(P.x - x, P.z - z)); G.sim(1 / 30, 1 / 30); if (stop && stop()) break; }
    G.key('w', false);
  };
};
await g(helpers);

// ---------------- out on the real map
let s = await g(() => { __game.pause(); return __game.jump('town'); });
let c = await g(() => __game.crowd());
check(`?horde brings them out when town starts: ${c.all}`, c.out && c.all === 96, c);
const placed = await g(() => {
  const G = __game, M = G.map;
  return G.horde.all.map((z) => ({ road: M.roadGrid.nearest(z.x, z.z), bounds: M.inBounds(z.x, z.z), floor: G.floorAt(z.x, z.z), solid: G.blocked(z.x, z.z, z.y), church: G.horde.inSanctuary(z.x, z.z) }));
});
check('all on the streets of the real map', placed.every((p) => p.road < 12), placed.filter((p) => p.road >= 12));
check('none out of bounds, in the water or inside anything', placed.every((p) => p.bounds && p.floor > -.1 && !p.solid), placed.filter((p) => !p.bounds || p.floor <= -.1 || p.solid));
check('none in the church', placed.every((p) => !p.church), placed.filter((p) => p.church));

// ---------------- left alone they wander, and stay where they should
const roam = await g(() => {
  const G = __game, H = G.horde, M = G.map;
  G.S.beans = 0; G.player.inv = 1e4;
  const from = H.all.map((z) => [z.x, z.z]), r = { worst: 0, wet: 0, out: 0, inside: 0, church: 0 };
  // past each part of town in turn, which is what wakes them
  for (const x of [-495, -295, -95, 105]) {
    G.place(...M.fromTrue(x, 12));
    for (let i = 0; i < 40; i++) {
      G.sim(1, 1 / 30);
      for (const z of H.active) {
        r.worst = Math.max(r.worst, M.roadGrid.nearest(z.x, z.z) === Infinity ? 99 : M.roadGrid.d);
        if (G.floorAt(z.x, z.z) < -.1) r.wet++; if (!M.inBounds(z.x, z.z)) r.out++; if (G.blocked(z.x, z.z, z.y)) r.inside++; if (H.inSanctuary(z.x, z.z)) r.church++;
      }
    }
  }
  r.moved = H.all.filter((z, i) => Math.hypot(z.x - from[i][0], z.z - from[i][1]) > 5).length; r.states = states();
  G.player.inv = 0; H.calm();
  return r;
});
check(`after a few minutes ${roam.moved} of them have wandered`, roam.moved > 40, roam);
check(`and they keep to the streets, at worst ${roam.worst.toFixed(0)} m off one`, roam.worst < 40, roam);
check('never in the water, out of bounds, inside anything or in the church', !roam.wet && !roam.out && !roam.inside && !roam.church, roam);

// ---------------- senses, which only the ones who've burnt down use on him
await g(() => { clearCrowd(); __game.S.beans = 0; __game.place(...__game.map.fromTrue(-64.5, -15)); });
let r = await g(() => {
  const G = __game, H = G.horde, P = G.player.pos, one = H.add(P.x + 14, P.z, { quiet: false });
  G.sim(4, 1 / 30);
  return { state: one.state, alert: one.alert };
});
check('standing still with nothing on him, he goes unnoticed at 14 m', r.state === 0 && r.alert === 0, r);
r = await g(() => {
  const G = __game, H = G.horde, P = G.player.pos, one = H.all[0], seen = new Set();
  one.x = P.x + 22; one.z = P.z; one.y = G.floorAt(one.x, one.z); one.state = 0; one.alert = 0;
  run(P.x + 100, P.z, 6, () => { seen.add(one.state); return one.state === 2; });
  // and once he stands still it gets hold of him. Running, he'd be past it before it could.
  for (let t = 0; t < 4 && G.S.mode !== 'grabbed'; t += 1 / 30) { G.sim(1 / 30, 1 / 30); seen.add(one.state); }
  return { seen: [...seen], mode: G.S.mode, near: away(one) };
});
check('running at one: it hears him, gets curious, then hunts', r.seen.includes(1) && r.seen.includes(2), r);
check('and grabs him once he stands still', r.mode === 'grabbed', r);
await g(() => { clearCrowd(); __game.S.mode = 'town'; __game.HP.kind = 'run'; });
r = await g(() => {
  const G = __game, H = G.horde, P = G.player.pos, one = H.add(P.x + 8, P.z, { quiet: false });
  G.S.beans = 0; G.sim(3, 1 / 30); const none = one.state;
  one.state = 0; one.alert = 0; G.S.beans = 40; G.sim(1.5, 1 / 30);
  return { none, beans: one.state };
});
check('he can be smelled at 8 m carrying a lot of beans, and not without them', r.none === 0 && r.beans >= 1, r);

// ---------------- a pack
await g(() => { clearCrowd(); __game.S.beans = 0; __game.S.mode = 'town'; __game.player.inv = 0; __game.place(...__game.map.fromTrue(-64.5, -15)); crowdRing(7, 13); });
await snap('01-ring');
r = await g(() => {
  const G = __game, P = G.player.pos, seen = new Set(), x = P.x, z = P.z;
  // back and forth, so there's something to hear, until he's caught
  for (let i = 0; i < 20 && G.S.mode !== 'grabbed'; i++) { run(x + (i % 2 ? 3 : -3), z, .8, () => { for (const s of G.horde.all) seen.add(s.state); return G.S.mode === 'grabbed'; }); }
  return { seen: [...seen], mode: G.S.mode, near: nearest(), states: states() };
});
check('together they become a swarm', r.seen.includes(3), r);
check('and catch him', r.mode === 'grabbed', r);

// ---------------- held
await snap('02-grabbed');
r = await g(() => {
  const G = __game, a = G.player.pos.clone(), g0 = G.horde.grab.time;
  const out = G.step(1, 1 / 30);
  return { moved: Math.hypot(G.player.pos.x - a.x, G.player.pos.z - a.z), prompt: out.prompt, held: G.horde.grab.who.length, kind: out.kind, time: G.horde.grab.time - g0, hearts: !document.getElementById('hearts').hidden };
});
check(`held, he's dragged: ${r.moved.toFixed(2)} m in a second by ${r.held}`, r.moved > .3 && r.moved < 2, r);
check('and told what to do', /^Mash E to break free/.test(r.prompt), r);
check('hearts on show', r.hearts, r);
await snap('03-struggling');
const presses = await (async () => {
  let n = 0;
  while (n < 40 && await g(() => __game.S.mode === 'grabbed')) { await page.keyboard.press('e'); await g(() => __game.step(1 / 8, 1 / 30)); n++; }
  return n;
})();
s = await g(() => __game.state());
check(`real key presses break him free in ${presses}`, s.mode === 'town' && presses < 40, { presses, mode: s.mode });
r = await g(() => ({ inv: __game.player.inv, stunned: states()[5], prompt: document.getElementById('prompt').hidden, near: nearest() }));
check(`they're thrown off and stunned (${r.stunned}), and he gets a moment`, r.stunned >= 1 && r.inv > 0 && r.prompt, r);
await snap('04-free');
r = await g(() => {
  // back onto the road, where there's nothing in his way. The low and quick ones swarm at 4 m/s to his 4.4, so it takes a while to put much road between them.
  const G = __game, P = G.player.pos, x = P.x - 80, z = G.map.zAt('us_80', x);
  let caught = false; run(x, z, 15, () => { caught = caught || G.S.mode === 'grabbed'; return caught; });
  return { caught, near: nearest(), mode: G.S.mode };
});
check(`he outruns them: ${r.near.toFixed(1)} m clear after running for it`, !r.caught && r.near > 8, r);

// ---------------- not getting away
await g(() => { clearCrowd(); __game.S.mode = 'town'; __game.player.inv = 0; __game.S.beans = 3; __game.S.hp = 3; });
r = await g(() => {
  const G = __game, P = G.player.pos, one = G.horde.add(P.x + .6, P.z);
  one.state = 2; G.sim(.1 + G.horde.T.windUp, 1 / 30);
  const held = G.S.mode;
  G.sim(7.2, 1 / 30);
  return { held, mode: G.S.mode, hp: G.S.hp, beans: G.S.beans };
});
check('held for seven seconds costs a heart and a can', r.held === 'grabbed' && r.mode === 'town' && r.hp === 2 && r.beans === 2, r);
r = await g(() => {
  const G = __game, H = G.horde, P = G.player.pos;
  for (let i = 0; i < 4 && G.S.mode !== 'fail'; i++) {
    H.all.forEach((z) => { z.state = 0; z.x = P.x + 90; z.z = P.z + 90; }); G.sim(2, 1 / 30);   // the moment he gets after each one
    H.add(P.x + .6, P.z).state = 2; G.sim(7.5, 1 / 30);
  }
  return { mode: G.S.mode, hp: G.S.hp, shown: !document.getElementById('fail').hidden, say: document.getElementById('failH').textContent };
});
check('and with none left they drag him off', r.mode === 'fail' && r.shown && r.say === 'They dragged you off.', r);
await snap('05-dragged-off');
await page.click('#retry');
r = await g(() => { const G = __game; G.step(.1); const P = G.player.pos; return { mode: G.S.mode, hp: G.S.hp, church: G.horde.inSanctuary(P.x, P.z), hunting: states()[2] + states()[3] + states()[4] }; });
check('trying again puts him on the church steps, safe, with the crowd calmed down', r.mode === 'town' && r.hp === 3 && r.church && r.hunting === 0, r);

// ---------------- the church
r = await g(() => {
  const G = __game, H = G.horde, P = G.player.pos, Z = H.zones[0]; clearCrowd(); G.S.beans = 12;
  crowdRing(10, Z.r + 3, Z);
  const res = { noticed: 0, inside: 0 };
  // he's making all the noise he can inside
  for (let t = 0; t < 25; t += 1) { run(Z.x + (t % 2 ? 4 : -4), Z.z + 7, 1); res.noticed += H.all.filter((z) => z.state >= 2).length; res.inside += H.all.filter((z) => Math.hypot(z.x - Z.x, z.z - Z.z) < Z.r).length; }
  res.sanctuary = H.inSanctuary(P.x, P.z);
  H.bell(Z.x, Z.z, 80, 14); G.sim(13, 1 / 30);
  res.bell = H.all.filter((z) => Math.hypot(z.x - Z.x, z.z - Z.z) < Z.r).length;
  G.sim(25, 1 / 30);
  res.after = H.all.filter((z) => Math.hypot(z.x - Z.x, z.z - Z.z) < Z.r).length;
  return res;
});
check('inside the church they don\'t notice him and won\'t come in', r.sanctuary && r.noticed === 0 && r.inside === 0, r);
check(`the bell brings them in anyway: ${r.bell} of 10`, r.bell >= 5, r);

// ---------------- what it costs: thirty and more on screen
await g(() => { const G = __game; clearCrowd(); G.S.mode = 'town'; G.S.beans = 0; G.player.inv = 0; G.horde.T.grabReach = 0; G.place(...G.map.fromTrue(-64.5, -15)); crowdRing(48, 9, G.player.pos, {}); for (let i = 0; i < 48; i++) { const z = G.horde.all[i], d = 3 + i * .8; z.x = G.player.pos.x + ((i * 7) % 11 / 5 - 1) * .2 * (d + 5.4); z.z = G.player.pos.z - d; z.y = G.floorAt(z.x, z.z); z.yaw = 0; } G.look(0, .28); G.step(.5, 1 / 30); });   // down a portrait phone's narrow view
await snap('06-forty-eight');
c = await g(() => __game.crowd());
const onScreen = await g(() => { const G = __game, cam = G.camera, v = cam.position.clone(); let n = 0; for (const s of G.horde.all) { v.set(s.x, s.y + 1, s.z).project(cam); if (Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1) n++; } return n; });
const calm = await g(() => __game.calls());
await g(() => { __game.horde.all.forEach((z) => { z.x += 400; }); __game.step(.5, 1 / 30); });
const empty = await g(() => __game.calls());
await g(() => { __game.horde.all.forEach((z) => { z.x -= 400; }); __game.step(.5, 1 / 30); });
check(`${c.drawn} drawn, ${onScreen} on screen`, c.drawn === 48 && onScreen >= 30, { c, onScreen });
console.log(`     the crowd adds ${calm.calls - empty.calls} draw calls and ${calm.triangles - empty.triangles} triangles, to ${calm.calls} and ${calm.triangles}`);
check('in at most eight draw calls', calm.calls - empty.calls <= 8, { calm, empty });
const far = c.degrees.slice().sort((a, b) => a - b);
check(`they're all at different stages, from ${far[0].toFixed(2)} to ${far[far.length - 1].toFixed(2)}`, far.length === 48 && far.every((d) => d >= 0 && d <= 1) && new Set(far).size > 40 && far[0] < .3 && far[47] > .7, far);
const cost = async (rate) => {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate });
  const t = await g(() => { const G = __game, began = performance.now(); for (let i = 0; i < 90; i++) G.sim(1 / 30, 1 / 30); const logic = (performance.now() - began) / 90, b2 = performance.now(); for (let i = 0; i < 60; i++) G.step(1 / 30, 1 / 30); return { logic, frame: (performance.now() - b2) / 60 }; });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return t;
};
const fast = await cost(1), slow = await cost(4);
console.log(`     a frame's JS: ${fast.frame.toFixed(1)} ms here, ${slow.frame.toFixed(1)} ms at a quarter of this CPU. Not a real phone: the GPU isn't slowed down.`);
check('under 33 ms of JS a frame at a quarter of this CPU', slow.frame < 33, slow);

check('no console errors', errors.length === 0, errors);
await close();

// ---------------- on a phone: the same thing with the A button
const phone = await serveAndOpen({ touch: true, query: '?test&horde' });
await phone.page.evaluate(helpers);
await phone.page.evaluate(() => { const G = __game; G.pause(); G.jump('town'); clearCrowd(); G.place(...G.map.fromTrue(-64.5, -15)); const one = G.horde.add(G.player.pos.x + .6, G.player.pos.z); one.state = 2; G.step(.2 + G.horde.T.windUp, 1 / 30); });
let t = await phone.page.evaluate(() => __game.state());
check('on a phone it says to mash FREE', t.mode === 'grabbed' && /^Mash FREE to break free/.test(t.prompt), t);
let taps = 0;
while (taps < 40 && await phone.page.evaluate(() => __game.S.mode === 'grabbed')) { await phone.page.tap('#bA'); await phone.page.evaluate(() => __game.step(1 / 8, 1 / 30)); taps++; }
t = await phone.page.evaluate(() => __game.state());
check(`tapping A breaks free in ${taps}`, t.mode === 'town' && taps < 40, { taps, mode: t.mode });
check('no console errors on a phone', phone.errors.length === 0, phone.errors);
await phone.close();

// ---------------- not in Chapter 1
const plain = await serveAndOpen({ viewport: { width: 390, height: 844 } });
const out = await plain.page.evaluate(() => { const G = __game; G.pause(); G.jump('town'); G.step(.5, 1 / 30); return G.crowd(); });
check('without ?horde town starts empty', !out.out && out.all === 0, out);
await plain.close();

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
