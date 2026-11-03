// Walks into a pond and swims across it with real key presses, drives a pickup into another, and checks that the ponds are water where the
// data says they are, that nothing real ended up under them, that the crowd keeps out, and that they're on the map.
//
//   npm i && npm run water
import { serveAndOpen } from './browser.mjs';

let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };

const { page, errors, close } = await serveAndOpen({ viewport: { width: 390, height: 844 } });
const g = (fn, arg) => page.evaluate(fn, arg);

await g(() => {
  const G = __game, W = G.water, T = 1 / 30; G.pause(); G.jump('town'); G.S.flags.town = true; G.step(.1);
  window.G = G; window.W = W; window.T = T;
  window.pondAt = (x, z) => W.in(...G.map.fromTrue(x, z));
  window.run = (seconds) => { for (let i = 0; i < seconds / T; i++) G.sim(T, T); };
  window.tapKey = (k) => { G.key(k, true); G.sim(T, T); G.key(k, false); G.sim(T, T); };
  // heads for a world spot with W held down until `done` says so or the time's up
  window.head = (x, z, seconds, done) => {
    const P = G.player.pos; G.key('w', true); let t = 0;
    for (; t < seconds && !done(); t += T) { G.look(Math.atan2(P.x - x, P.z - z)); G.sim(T, T); }
    G.key('w', false); G.sim(T, T);
    return t;
  };
  // a spot on the land just off a pond's shore, on the side towards where he's coming from, and the same across from it
  window.shores = (p, from) => {
    const out = (x, z) => { let a = [x, z]; for (let i = 0; i < 400; i++) { if (!W.in(a[0], a[1]) && !(W.look(a[0], a[1]) && W.d < 5)) return a; const d = Math.hypot(a[0] - p.x, a[1] - p.z) || 1; a = [a[0] + (a[0] - p.x) / d, a[1] + (a[1] - p.z) / d]; } return a; };
    const d = Math.hypot(from[0] - p.x, from[1] - p.z) || 1, ux = (from[0] - p.x) / d, uz = (from[1] - p.z) / d;
    return { near: out(p.x + ux, p.z + uz), far: out(p.x - ux, p.z - uz) };
  };
});

// ---------------- what's in the data is in the game
const data = await g(() => {
  const sheets = []; G.scene.traverse((o) => { if (o.isMesh && o.material?.uniforms?.uRipG && o.geometry.type !== 'PlaneGeometry') sheets.push(o); });
  const levels = W.ponds.map((p) => p.level);
  return { ponds: W.ponds.length, sheets: sheets.length, river: levels.filter((l) => l === 0).length, low: Math.min(...levels), high: Math.max(...levels) };
});
console.log(`     ${data.ponds} ponds, between ${data.low.toFixed(2)} and ${data.high.toFixed(2)} high`);
check('every pond has its own sheet of water', data.sheets === data.ponds - data.river, data);
check('and they stand below the town', data.high < 5.66 && data.low > 3, data);

// Samples every pond in reach of the roads on a grid: well inside its outline it's water, and off its shore it's land
const surface = await g(() => {
  const out = { water: 0, dry: [], land: 0, flooded: [] };
  for (const p of W.ponds) {
    if (![[p.x0, p.z0], [p.x1, p.z0], [p.x0, p.z1], [p.x1, p.z1], [p.x, p.z]].some(([x, z]) => G.map.inBounds(x, z))) continue;
    for (let x = p.x0; x <= p.x1; x += 4) for (let z = p.z0; z <= p.z1; z += 4) {
      if (!W.look(x, z)) continue;
      const d = W.d, floor = G.floorAt(x, z), onBed = G.map.roadGrid.nearest(x, z) < 8 || G.map.railGrid.nearest(x, z) < 6;
      if (d < -3 && W.in(x, z)) { out.water++; if (floor >= p.level - .3 && !onBed && !G.houseAt(x, z)) out.dry.push([Math.round(x), Math.round(z), +floor.toFixed(2)]); }
      else if (d > 2 && d < 4 && !W.in(x, z)) { out.land++; if (floor < p.level) out.flooded.push([Math.round(x), Math.round(z), +floor.toFixed(2)]); }
    }
  }
  return out;
});
console.log(`     ${surface.water} samples in the water and ${surface.land} on the banks`);
check('well inside its outline every pond has water over its floor', surface.water > 1000 && surface.dry.length === 0, { n: surface.dry.length, some: surface.dry.slice(0, 6) });
check('and just off its shore the ground is above it', surface.land > 300 && surface.flooded.length === 0, { n: surface.flooded.length, some: surface.flooded.slice(0, 6) });

// ---------------- nothing real ends up under it
const under = await g(() => {
  const wet = (x, z) => { const p = W.in(x, z); return p && G.floorAt(x, z) < p.level - .05; };
  const out = { vehicles: G.vehicles.filter((v) => wet(v.x, v.z)).length, cans: G.wreck.gasCans.filter((c) => wet(c.x, c.z)).length, props: G.wreck.props.filter((p) => p.cx !== undefined && p.kind !== 'tree' && p.kind !== 'shrub' && wet(p.cx, p.cz)).map((p) => p.kind), buildings: [], people: [], trees: 0 };
  for (const s of G.structures) { const n = s.pts.filter(([x, z]) => wet(x, z)).length; if (n) out.buildings.push([s.id, n, s.pts.length]); }
  for (const [id, n] of Object.entries(G.npcs)) if (wet(n.x, n.z)) out.people.push(id);
  // the woods only fill in around the camera, so go and stand at each pond in town
  for (const p of W.ponds) if (Math.hypot(p.x - G.map.fromTrue(0, 0)[0], p.z - G.map.fromTrue(0, 0)[1]) < 1500) { G.place(p.x, p.z); G.sim(T, T); for (const t of G.wreck.trees(p.x, p.z, 120)) if (W.in(t.x, t.z)) out.trees++; }
  return out;
});
check('no vehicle, can, prop, building or person is under one', !under.vehicles && !under.cans && !under.props.length && !under.buildings.length && !under.people.length, under);
check('and no tree grows in one', under.trees === 0, under.trees);

// ---------------- in on foot, across and out, the one by Commerce St
const swim = await g(() => {
  const p = pondAt(75, -325), P = G.player.pos; G.S.mode = 'town'; const [cx, cz] = G.map.fromTrue(-37, -300), { near, far } = shores(p, [cx, cz]);
  G.place(near[0], near[1]); run(.3);
  const start = { mode: G.S.mode, y: P.y, above: P.y - p.level };
  const t0 = head(p.x, p.z, 20, () => G.S.mode === 'swim');
  const inWater = { mode: G.S.mode, kind: G.HP.kind, y: P.y, level: p.level, floor: G.floorAt(P.x, P.z), at: [P.x, P.z], t: t0, cam: G.camera.position.y };
  const bobs = []; for (let i = 0; i < 30; i++) { G.sim(T, T); bobs.push(P.y); }
  const from = [P.x, P.z], t1 = head(far[0], far[1], 90, () => G.S.mode !== 'swim');
  G.step(.2, T);
  return { start, inWater, bob: [Math.min(...bobs), Math.max(...bobs)], level: p.level, across: Math.hypot(P.x - from[0], P.z - from[1]), t: t1, out: { mode: G.S.mode, kind: G.HP.kind, y: P.y, floor: G.floorAt(P.x, P.z), grounded: G.player.grounded }, cam: G.camera.position.y };
});
check('he starts on the bank, above the water', swim.start.mode === 'town' && swim.start.above > .1, swim.start);
check('and walking in he\'s swimming by the time it\'s over his knees', swim.inWater.mode === 'swim' && swim.inWater.kind === 'swim' && swim.inWater.floor < swim.level - .3, swim.inWater);
check('at the height of that pond and not the river\'s', Math.abs(swim.inWater.y - swim.level) < .1 && swim.bob[0] > swim.level - .06 && swim.bob[1] < swim.level + .06, { in: swim.inWater.y, bob: swim.bob, level: swim.level });
check('with the camera out of the water', swim.cam > swim.level, swim.cam);
console.log(`     swam ${swim.across.toFixed(1)} m in ${swim.t.toFixed(1)} s`);
check('he swims across and climbs out the far side', swim.out.mode === 'town' && swim.out.kind === 'run' && swim.across > 15 && swim.out.y > swim.level - .4, swim.out);

// ---------------- a can thrown in only makes a ripple
const can = await g(() => {
  const p = pondAt(75, -325), { near } = shores(p, [p.x + 100, p.z + 100]), P = G.player.pos, burning = G.wreck.burners.length; G.S.gas = 2;
  G.place(near[0], near[1]); run(.2); head(p.x, p.z, 1.5, () => W.in(P.x, P.z) || G.S.mode === 'swim'); G.key('w', false); G.look(Math.atan2(P.x - p.x, P.z - p.z)); G.player.yaw = Math.atan2(p.x - P.x, p.z - P.z);
  const had = G.S.gas; tapKey('q'); const thrown = had - G.S.gas; run(3);
  return { thrown, burning, after: G.wreck.burners.length };
});
check('a gas can thrown in the water only makes a ripple', can.thrown === 1 && can.after === can.burning, can);

// ---------------- in a pickup: it floods, and he swims out of it
const drove = await g(() => {
  if (G.S.mode === 'swim') G.S.mode = 'town';
  const p = pondAt(-615, -601), v = G.vehicles.find((o) => o.kind === 'pickup' && !o.wrecked && !o.drowned && !o.loose), [jx, jz] = G.map.fromTrue(-520, -600), { near } = shores(p, [jx, jz]);
  G.getIn(v);
  const dx = p.x - near[0], dz = p.z - near[1], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
  v.x = near[0] - ux * 6; v.z = near[1] - uz * 6; v.y = G.floorAt(v.x, v.z); v.yaw = Math.atan2(ux, uz); v.f = 8; v.s = 0; v.steer = 0; v.grounded = true; v.hp = v.K.hp;
  const dry = v.drowned; G.key('w', true); let t = 0;
  for (; t < 12 && !v.drowned; t += T) G.sim(T, T);
  G.key('w', false); run(.5);
  const flooded = { drowned: v.drowned, t, floor: G.floorAt(v.x, v.z), level: p.level, dry, stillIn: G.driving() === v, toast: document.getElementById('toast')?.textContent ?? '' };
  if (G.driving()) G.getOut(true);
  run(.1);
  const P = G.player.pos, out = { mode: G.S.mode, kind: G.HP.kind, y: P.y };
  const { far } = shores(p, [v.x, v.z]); const swum = head(near[0], near[1], 90, () => G.S.mode !== 'swim');
  return { flooded, out, swum, then: G.S.mode, level: p.level, far };
});
check('a pickup driven in floods, and stops', !drove.flooded.dry && drove.flooded.drowned && drove.flooded.floor < drove.level - .8, drove.flooded);
check('getting out of it he\'s swimming, at the pond\'s height', drove.out.mode === 'swim' && Math.abs(drove.out.y - drove.level) < .1, drove.out);
check('and he can swim back to the bank', drove.then === 'town', { then: drove.then, swum: drove.swum });

// ---------------- the crowd comes round it, and not through it
const crowd = await g(() => {
  const p = pondAt(75, -325), { far } = shores(p, [p.x - 50, p.z]), H = G.horde, P = G.player.pos;
  G.S.mode = 'town'; G.bringOutCrowd(); H.T.grabReach = 0; G.S.beans = 0;
  G.place(far[0], far[1]); run(.2);
  // Twelve of them well back from the bank straight across from him, with the pond between, and a noise out in the middle of it
  const base = Math.atan2(p.z - far[1], p.x - far[0]), them = H.all.slice(0, 12);
  them.forEach((s, i) => {
    const a = base + (i - 5.5) * .09, ux = Math.cos(a), uz = Math.sin(a), [sx, sz] = shores(p, [p.x + ux * 100, p.z + uz * 100]).near, x = sx + ux * 12, z = sz + uz * 12;
    s.x = x; s.z = z; s.y = G.floorAt(x, z); s.state = 0; s.alert = 0;
  });
  let wet = 0, seen = 0, closest = Infinity, most = 0;
  for (let i = 0; i < 40 / T; i++) {
    if (i % 60 === 0) H.noise(p.x, p.z, 700, 3);
    G.sim(T, T);
    most = Math.max(most, H.active.length);
    for (const s of them) { const f = G.floorAt(s.x, s.z), q = W.in(s.x, s.z); seen++; if (q && f < q.level - .1) wet++; if (W.look(s.x, s.z)) closest = Math.min(closest, W.d); }
  }
  return { wet, seen, closest, active: most };
});
console.log(`     ${crowd.seen} looks at ${crowd.active} of them, the closest ${crowd.closest.toFixed(1)} m from the shore`);
check('the crowd comes to the shore and keeps out of the water', crowd.seen > 0 && crowd.wet === 0 && crowd.closest < 6, crowd);
check('no console errors', errors.length === 0, errors.slice(0, 5));
await close();

// ---------------- on a phone, with the thumb, and on the map
const phone = await serveAndOpen({ touch: true });
const p2 = (fn, arg) => phone.page.evaluate(fn, arg);
const thumb = await p2(() => {
  const G = __game, W = G.water, T = 1 / 30, P = G.player.pos; G.pause(); G.jump('town'); G.S.flags.town = true; G.step(.1);
  const p = W.in(...G.map.fromTrue(-647, -835)), out = (x, z) => { let a = [x, z]; for (let i = 0; i < 400; i++) { if (!W.in(a[0], a[1]) && !(W.look(a[0], a[1]) && W.d < 5)) return a; const d = Math.hypot(a[0] - p.x, a[1] - p.z) || 1; a = [a[0] + (a[0] - p.x) / d, a[1] + (a[1] - p.z) / d]; } return a; };
  const near = out(p.x + 1, p.z + .2);
  G.place(near[0], near[1]); G.step(.3, T); G.stick(0, 1); let t = 0;
  for (; t < 30 && G.S.mode !== 'swim'; t += T) { G.look(Math.atan2(P.x - p.x, P.z - p.z)); G.sim(T, T); }
  G.step(.2, T); const words = [...document.querySelectorAll('.tbtn, button')].filter((b) => b.offsetParent && b.textContent).map((b) => b.textContent.trim());
  const swam = { mode: G.S.mode, level: p.level, y: P.y, t, words }; G.stick(0, 0);
  return swam;
});
check('on a phone the stick walks him in, and he\'s swimming', thumb.mode === 'swim' && Math.abs(thumb.y - thumb.level) < .1, thumb);
const map = await p2(async () => {
  return { mode: __game.S.mode };
});
await phone.page.keyboard.press('m');
await phone.page.waitForTimeout(300);
const seen = await p2(() => {
  const c = document.getElementById('mapC'), open = !document.getElementById('map').hidden, w = c.width, h = c.height, g = c.getContext('2d'), d = g.getImageData(Math.floor(w / 2) - 80, Math.floor(h / 2) - 80, 160, 160).data;
  let tinted = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 1] > d[i] + 15 && d[i + 2] > d[i] + 15) tinted++;
  return { open, tinted, total: d.length / 4, w, h };
});
check('and the pond he\'s in is on the map, in the river\'s colour', seen.open && seen.tinted > 200, { ...seen, mode: map.mode });
check('no console errors on a phone', phone.errors.length === 0, phone.errors.slice(0, 5));
await phone.close();

console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
