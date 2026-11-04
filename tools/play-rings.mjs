// Fast travel by the mushroom rings (CHUNKY-176), on a phone-sized page with real taps: where all ten settled, that they're on the map from the start, walking into one, EAT,
// the map with all ten on it, backing out of it, and no EAT while he's held or in a pickup. Then eating at every ring and coming to in the next, all the way round: sat down
// as the world bends, somewhere else at the height of it, and sitting up there facing the road, with the one who was after him left behind and the ones waiting there
// leaving him be for a few seconds. A pickup he got out of to eat stays where he left it, only the rings near him are drawn, and with reduced motion it's a fade to dark
// and back with nothing bent.
//
//   npm i && npm run rings [-- --shots dir]
import { mkdirSync, readFileSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const SHEET = JSON.parse(readFileSync(new URL('../data/rings.json', import.meta.url), 'utf8'));
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };

async function open(reducedMotion) {
  const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, query: '?test&horde', reducedMotion });
  const g = (fn, arg) => page.evaluate(fn, arg);
  await g(() => {
    const G = __game, H = G.horde, T = 1 / 30; G.pause(); G.jump('town'); G.S.flags.town = true; G.step(.1); document.getElementById('card').style.display = 'none';
    window.clearCrowd = () => { H.calm(); H.all.length = 0; H.active.length = 0; };
    // heads for x, z on his own legs, the camera behind him, and says how near he got
    window.walkTo = ([x, z], within = .4, secs = 30) => {
      const P = G.player.pos; let t = 0; G.key('w', true);
      while (t < secs && Math.hypot(P.x - x, P.z - z) > within) { G.look(Math.atan2(P.x - x, P.z - z)); G.sim(T, T); t += T; }
      G.key('w', false); G.sim(T, T); return +Math.hypot(P.x - x, P.z - z).toFixed(2);
    };
    window.buttonSays = () => document.getElementById('bA').getAttribute('aria-label');
    window.promptSays = () => { const p = document.getElementById('prompt'); return p.hidden ? '' : p.textContent; };
    // whatever's on the screen that'd be saying something
    window.saying = () => [promptSays(), G.state().toast, G.state().card].filter(Boolean).join(' | ');
    // the whole trip, a 30th of a second at a time, and what it was like
    window.ride = () => {
      const from = G.player.pos.clone(), rows = [];
      for (let t = 0; t < 6 && G.S.mode === 'trip'; t += T) {
        G.sim(T, T); const tr = G.rings.trip(), L = G.rings.look(), P = G.player.pos;
        rows.push({ t: tr ? tr.t : null, part: tr ? tr.part : 'up', mode: G.S.mode, sit: G.rings.sit(), dream: L.dream, fade: L.fade, moved: Math.hypot(P.x - from.x, P.z - from.z), said: saying(), map: G.mapState().open });
      }
      return rows;
    };
    clearCrowd();
  });
  const snap = async (name) => { if (shots) { await g(() => __game.step(.4, 1 / 24)); await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); } };
  // a picture of this moment, without moving the clock on
  const still = async (name) => { if (shots) { await g(() => __game.render(0)); await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); } };
  const tapA = async () => { await page.tap('#bA'); await page.waitForTimeout(30); await g(() => __game.sim(1 / 30, 1 / 30)); };
  // a real tap on the map where ring i's drawn
  const tapRing = async (i) => { const [x, y] = (await g(() => __game.rings.spots()))[i]; await page.touchscreen.tap(x, y); await page.waitForTimeout(30); };
  return { page, errors, close, g, snap, still, tapA, tapRing };
}

const { page, errors, close, g, snap, still, tapA, tapRing } = await open();
const R = await g(() => __game.rings.list());

// ---------------- where they are
const placed = await g((about) => {
  const G = __game, M = G.map, yards = G.structures.filter((s) => ['house', 'mobile', 'cabin'].includes(s.use));
  const off = (x, z, pts) => { let d = Infinity; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [ax, az] = pts[j], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-9))); d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return d; };
  return G.rings.list().map((r, i) => {
    const [ax, az] = M.fromTrue(...about[i]), road = !!M.roadGrid.within(r.x, r.z, (o) => o.width / 2 + 2.6);
    let tree = Infinity; G.wreck.treesNear(r.x, r.z, 6, (t) => { tree = Math.min(tree, Math.hypot(t.x - r.x, t.z - r.z)); });
    let wet = false, built = false, solid = false;
    for (let k = 0; k <= 16; k++) {
      const a = k / 16 * Math.PI * 2, d = k < 16 ? 1.9 : 0, x = r.x + Math.cos(a) * d, z = r.z + Math.sin(a) * d, y = G.floorAt(x, z);
      wet ||= y < G.water.level(x, z) + .2; built ||= !!G.houseAt(x, z); solid ||= G.blocked(x, z, y) || !!G.wreck.treeBlocks(x, z);
    }
    return { i, moved: +Math.hypot(r.x - ax, r.z - az).toFixed(1), road, rail: Math.round(M.railGrid.nearest(r.x, r.z)), tree: +tree.toFixed(1), wet, built, solid, yard: +Math.min(...yards.map((s) => off(r.x, r.z, s.pts))).toFixed(1), bridge: Math.round(Math.hypot(r.x, r.z)), inside: M.inBounds(r.x, r.z) };
  });
}, SHEET.rings.map((r) => r.about));
const apart = await g(() => { const R = __game.rings.list(); let least = Infinity; for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) least = Math.min(least, Math.hypot(R[i].x - R[j].x, R[i].z - R[j].z)); return Math.round(least); });
check(`all ten settled, each within ${Math.max(...placed.map((p) => p.moved))} m of where the sheet has it`, placed.length === 10 && placed.every((p) => p.moved < 60 && p.inside), placed);
check('none on a road or lane, and each a step clear of every one', placed.every((p) => !p.road), placed.filter((p) => p.road));
check('on dry ground, clear of the railroad, anything built and anything solid', placed.every((p) => !p.wet && !p.built && !p.solid && p.rail > 7), placed.filter((p) => p.wet || p.built || p.solid || p.rail <= 7));
check(`in the open, with the nearest tree ${Math.min(...placed.map((p) => p.tree))} m from a ring's middle`, placed.every((p) => p.tree >= 5), placed.filter((p) => p.tree < 5));
check(`in nobody's yard: the nearest house, mobile home or cabin is ${Math.min(...placed.map((p) => p.yard))} m off`, placed.every((p) => p.yard >= 30), placed.filter((p) => p.yard < 30));
check(`spread out, ${apart} m apart at the least, and none within ${Math.min(...placed.map((p) => p.bridge))} m of Stuckey's Bridge`, apart > 2000 && placed.every((p) => p.bridge > 1400), { apart, placed });

// ---------------- on the map from the start
await page.tap('#mini'); await page.waitForTimeout(30);
const start = await g(() => ({ open: __game.mapState().open, marked: __game.rings.marked(), picking: __game.rings.picking() }));
for (let k = 0; k < 8; k++) { await page.tap('#mapOut'); await page.waitForTimeout(20); }
// and moved over to the middle of them, the way a finger would drag it
const all = await g(() => { const G = __game, R = G.rings.list(), xs = R.map((r) => r.x), zs = R.map((r) => r.z); G.mapCamTo({ x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 }); return G.rings.marked(); });
check(`the map, before he's been near one, has all ${all} on it zoomed out`, start.open && start.picking === null && all === 10, { start, all });
await snap('01-the-map-from-the-start');
await page.tap('#mapX'); await page.waitForTimeout(30);

// ---------------- only the ones near him are drawn
const drawn = await g((r) => {
  const G = __game; G.place(r.x + 150, r.z); G.step(1, 1 / 24); const near = G.rings.drawn()[3];
  G.place(r.x + 400, r.z); G.step(1, 1 / 24); return { near, far: G.rings.drawn()[3], others: G.rings.drawn().filter(Boolean).length };
}, R[3]);
check('a ring\'s drawn from 150 m off, and not from 400 m', drawn.near && !drawn.far, drawn);

// ---------------- walking into one
const into = await g((r) => {
  const G = __game; G.place(r.x, r.z + 5); G.sim(.5, 1 / 30);
  const outside = { act: G.S.act, button: buttonSays(), here: G.rings.here() };
  const off = walkTo([r.x, r.z]);
  return { outside, off, act: G.S.act, button: buttonSays(), prompt: promptSays(), here: G.rings.here() };
}, R[0]);
check('5 m off one, there\'s nothing to eat', into.outside.here === -1 && into.outside.act !== 'Eat a mushroom' && into.outside.button !== 'EAT', into.outside);
check(`walking into it, EAT comes up: "${into.button}", "${into.prompt}"`, into.off < .5 && into.here === 0 && into.act === 'Eat a mushroom' && into.button === 'EAT', into);
await snap('02-in-a-ring');

// ---------------- the map to pick from, and backing out of it
await tapA();
const pick = await g(() => {
  const G = __game, spots = G.rings.spots(), mapC = document.getElementById('mapC'), obj = document.getElementById('mapObj');
  return { open: G.mapState().open, picking: G.rings.picking(), marked: G.rings.marked(), mode: G.S.mode, said: obj.hidden ? '' : obj.textContent,
    clear: spots.map(([x, y]) => x > 8 && x < innerWidth - 8 && y > 8 && y < innerHeight - 8 && document.elementFromPoint(x, y) === mapC) };
});
check(`EAT opens the map with all ${pick.marked} rings on the screen and clear of its buttons`, pick.open && pick.picking === 0 && pick.marked === 10 && pick.clear.every(Boolean) && pick.mode === 'town', pick);
check('with nothing on it saying what to do', pick.said === '', pick.said);
await snap('03-picking');
await tapRing(0);
const own = await g(() => ({ open: __game.mapState().open, mode: __game.S.mode }));
await page.touchscreen.tap(30, 160); await page.waitForTimeout(30);
const none = await g(() => ({ open: __game.mapState().open, mode: __game.S.mode }));
check('tapping the ring he\'s in, or nowhere near one, does nothing', own.open && own.mode === 'town' && none.open && none.mode === 'town', { own, none });
const before = await g(() => __game.player.pos.toArray());
await page.tap('#mapX'); await page.waitForTimeout(30);
const back = await g(() => { const G = __game; G.sim(4, 1 / 30); return { open: G.mapState().open, mode: G.S.mode, trip: G.rings.trip(), pos: G.player.pos.toArray(), here: G.rings.here() }; });
check('BACK leaves him where he was, and no trip', !back.open && back.mode === 'town' && !back.trip && Math.hypot(back.pos[0] - before[0], back.pos[2] - before[2]) < .05 && back.here === 0, back);

// ---------------- held: no EAT
const held = await g(() => {
  const G = __game, H = G.horde, P = G.player.pos; clearCrowd(); G.player.inv = 0;
  const one = H.add(P.x + .6, P.z); one.state = 2; G.sim(.1 + H.T.windUp, 1 / 30);
  return { mode: G.S.mode, button: buttonSays() };
});
await tapA();
const heldAfter = await g(() => ({ mode: __game.S.mode, map: __game.mapState().open }));
check(`with one of them holding him in a ring, the button's ${held.button} and it doesn't open the map`, held.mode === 'grabbed' && held.button === 'FREE' && !heldAfter.map, { held, heldAfter });
if (heldAfter.map) { await page.tap('#mapX'); await page.waitForTimeout(30); }
await g((r) => { const G = __game; clearCrowd(); G.S.mode = 'town'; G.HP.kind = 'run'; G.player.inv = 0; walkTo([r.x, r.z]); G.sim(.2, 1 / 30); }, R[0]);

// ---------------- round them all: eating at each and coming to in the next
const trips = [];
let behind = null;
for (let i = 0; i < 10; i++) {
  const to = (i + 1) % 10;
  // the first time, one of them's after him as he eats, and three more are waiting at the far ring
  const crowd = i === 0 ? await g((r) => {
    const G = __game, H = G.horde, P = G.player.pos; clearCrowd(); G.player.inv = 0;
    window.after = H.add(P.x + 9, P.z, { quiet: false }); after.state = 2; G.sim(.5, 1 / 30);
    window.waiting = [0, 1, 2].map((k) => H.add(r.x + Math.cos(k * 2.1) * 4.5, r.z + Math.sin(k * 2.1) * 4.5, { quiet: false }));
    return { state: after.state, d: +Math.hypot(after.x - P.x, after.z - P.z).toFixed(1) };
  }, R[to]) : null;
  const ready = await g(() => ({ act: __game.S.act, button: buttonSays(), here: __game.rings.here() }));
  await tapA(); await tapRing(to);
  const rows = await g(() => ride());
  const end = await g((r) => { const G = __game, P = G.player.pos; return { mode: G.S.mode, kind: G.state().kind, d: +Math.hypot(P.x - r.x, P.z - r.z).toFixed(2), yaw: G.player.yaw, want: r.yaw, here: G.rings.here(), grace: +G.rings.grace().toFixed(2) }; }, R[to]);
  if (i === 0) {
    // the one he left behind, and the three who were there, through the grace and after it
    behind = await g((r) => {
      const G = __game, T = 1 / 30, P = G.player.pos, out = { state: after.state, far: Math.round(Math.hypot(after.x - P.x, after.z - P.z)), during: new Set(), grabbed: false, noticed: null, closest: Infinity };
      // he walks up to whichever of them's nearest, footsteps and all, which is what rouses them, and stops just short
      const upTo = (secs, note) => {
        for (let t = 0; t < secs; t += T) {
          const s = waiting.reduce((a, b) => (Math.hypot(a.x - P.x, a.z - P.z) < Math.hypot(b.x - P.x, b.z - P.z) ? a : b)), d = Math.hypot(s.x - P.x, s.z - P.z);
          G.key('w', d > 2.2); G.look(Math.atan2(P.x - s.x, P.z - s.z)); G.sim(T, T); out.closest = Math.min(out.closest, d); if (note(t)) break;
        }
        G.key('w', false);
      };
      upTo(5.5, () => { for (const s of waiting) out.during.add(s.state); out.grabbed ||= G.S.mode === 'grabbed'; return false; });
      out.closest = +out.closest.toFixed(1);
      while (G.rings.grace() > 0) G.sim(T, T);
      upTo(12, (t) => { if (waiting.some((s) => s.state !== 0) || G.S.mode === 'grabbed') { out.noticed = +t.toFixed(1); return true; } return false; });
      out.during = [...out.during]; out.near = waiting.map((s) => +Math.hypot(s.x - P.x, s.z - P.z).toFixed(1));
      clearCrowd(); G.S.mode = 'town'; G.HP.kind = 'run'; G.player.inv = 0; walkTo([r.x, r.z], .2); G.sim(.2, T);
      return out;
    }, R[to]);
  }
  const drawnHere = await g((k) => { __game.step(.1, 1 / 24); return __game.rings.drawn()[k]; }, to);
  const swap = rows.findIndex((x) => x.moved > 100);
  trips.push({ i, to, ready, crowd, swap, going: rows.slice(0, swap), coming: rows.slice(swap), rows, end, drawnHere, long: rows.length / 30 });
}
const t0 = trips[0];
check(`one of them was coming for him as he ate, ${t0.crowd.d} m off`, t0.crowd.state !== 0 && t0.crowd.d < 9.5, t0.crowd);
check('every time, he\'s in the ring with EAT up, and the map takes his tap on the next', trips.every((t) => t.ready.here === t.i && t.ready.button === 'EAT' && t.rows.length > 0 && !t.rows[0].map), trips.map((t) => ({ i: t.i, ready: t.ready, first: t.rows[0] })));
check(`he sits down as the world bends: sat ${(t0.going.findIndex((x) => x.sit > .99) / 30).toFixed(2)} s in, and as bent as it gets, ${Math.max(...t0.going.map((x) => x.dream)).toFixed(2)}, before he goes`,
  trips.every((t) => t.swap > 0 && t.going.some((x) => x.sit > .99) && Math.max(...t.going.map((x) => x.dream)) > .95 && t.going.every((x) => x.mode === 'trip')), trips.map((t) => ({ i: t.i, swap: t.swap })));
check(`he's somewhere else at the height of it, ${(t0.swap / 30).toFixed(2)} s in, and comes to sitting there`, trips.every((t) => t.swap > 45 && t.swap < 66 && t.coming[0].sit > .99 && t.coming[0].dream > .9), trips.map((t) => ({ i: t.i, swap: t.swap, come: t.coming[0] })));
check(`and gets up as it goes, ${t0.long.toFixed(2)} s in all`, trips.every((t) => t.long > 3 && t.long < 4 && t.coming.at(-1).sit === 0 && t.coming.at(-1).dream === 0 && t.end.mode === 'town' && t.end.kind === 'run'), trips.map((t) => ({ i: t.i, long: t.long, end: t.end })));
check('in the ring he picked every time, facing the road', trips.every((t) => t.end.here === t.to && t.end.d < .1 && Math.abs(Math.atan2(Math.sin(t.end.yaw - t.end.want), Math.cos(t.end.yaw - t.end.want))) < .01), trips.map((t) => ({ i: t.i, end: t.end })));
check('with that ring drawn round him as he comes to', trips.every((t) => t.drawnHere), trips.map((t) => t.drawnHere));
check('nothing on the screen says anything, all the way round', trips.every((t) => t.rows.every((x) => !x.said)), trips.flatMap((t) => t.rows.filter((x) => x.said).slice(0, 1)));
check('the picture never fades without reduced motion', trips.every((t) => t.rows.every((x) => x.fade === 1)), trips.map((t) => Math.min(...t.rows.map((x) => x.fade))));
check(`the one who was after him didn't follow: it's ${behind.far} m back and stopped coming`, behind.far > 1000 && behind.state === 0, behind);
check(`the three who were there leave him be for ${t0.end.grace} s as he comes to, though he walks up to within ${behind.closest} m of them`, Math.abs(t0.end.grace - 6) < .1 && behind.during.length === 1 && behind.during[0] === 0 && !behind.grabbed && behind.closest < 3, behind);
check(`and the same walk brings them once it's over, ${behind.noticed} s into it`, behind.noticed !== null, behind);

// ---------------- a pickup he gets out of to eat stays where he left it
const truck = await g((r) => {
  const G = __game, v = G.vehicles.find((o) => o.kind === 'pickup' && !o.wrecked && !o.drowned), side = v.yaw + Math.PI / 2;
  clearCrowd(); G.place(v.x + Math.sin(side) * (v.K.width / 2 + 1), v.z + Math.cos(side) * (v.K.width / 2 + 1)); G.sim(.5, 1 / 30);
  return { kind: v.kind, button: buttonSays() };
}, R[0]);
await tapA();
const inRing = await g((r) => {
  const G = __game, v = G.driving(); if (!v) return { mode: G.S.mode };
  Object.assign(v, { x: r.x, z: r.z, y: G.floorAt(r.x, r.z), yaw: r.yaw, f: 0, s: 0, steer: 0, grounded: true }); G.look(r.yaw + Math.PI); G.sim(.6, 1 / 30);
  return { mode: G.S.mode, button: buttonSays(), prompt: promptSays(), map: G.mapState().open };
}, R[0]);
check(`in a ${truck.kind} stood in a ring, there's no EAT: "${inRing.button}"`, inRing.mode === 'drive' && inRing.button === 'GET OUT' && !/eat/i.test(inRing.prompt), { truck, inRing });
await g((r) => { const G = __game, v = G.driving(); Object.assign(v, { x: r.x - Math.sin(r.yaw) * 7, z: r.z - Math.cos(r.yaw) * 7, y: G.floorAt(r.x - Math.sin(r.yaw) * 7, r.z - Math.cos(r.yaw) * 7), f: 0, s: 0, steer: 0 }); G.sim(.6, 1 / 30); }, R[0]);
await tapA();
const left = await g((r) => {
  const G = __game, P = G.player.pos, v = G.vehicles.find((o) => o.kind === 'pickup' && !o.wrecked && !o.drowned);
  window.parked = { v, x: v.x, z: v.z, yaw: v.yaw };
  // round the side of it he got out on, and in
  const rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw), side = Math.sign((P.x - v.x) * rx + (P.z - v.z) * rz) || 1;
  walkTo([r.x + rx * side * 3, r.z + rz * side * 3], .6);
  return { mode: G.S.mode, driving: !!G.driving(), off: walkTo([r.x, r.z]), here: G.rings.here(), button: buttonSays() };
}, R[0]);
check('out of it and walked back into the ring, EAT\'s up again', left.mode === 'town' && !left.driving && left.here === 0 && left.button === 'EAT', left);
await tapA(); await tapRing(1);
if (shots) {
  await g(() => __game.sim(1.2, 1 / 30)); await still('04-going');
  await g(() => __game.sim(.8, 1 / 30)); await still('05-coming-to');
}
await g(() => ride());
const stayed = await g((r) => { const G = __game, P = G.player.pos, { v, x, z, yaw } = parked; return { moved: +Math.hypot(v.x - x, v.z - z).toFixed(3), turned: +Math.abs(v.yaw - yaw).toFixed(3), driving: !!G.driving(), coasting: G.bail.coasting().includes(v), d: +Math.hypot(P.x - r.x, P.z - r.z).toFixed(2), away: Math.round(Math.hypot(v.x - P.x, v.z - P.z)) }; }, R[1]);
check(`the ${truck.kind} stays where he left it, ${stayed.away} m back, while he comes to in the next ring`, stayed.moved === 0 && stayed.turned === 0 && !stayed.driving && !stayed.coasting && stayed.d < .1, stayed);
await snap('06-come-to');
console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'no console errors');
check('no console errors', errors.length === 0, errors);
await close();

// ---------------- with reduced motion
{
  const { errors, close, g, still, tapA, tapRing } = await open('reduce');
  const R = await g(() => __game.rings.list());
  await g((r) => { const G = __game; G.place(r.x, r.z + 3); G.sim(.3, 1 / 30); walkTo([r.x, r.z]); }, R[0]);
  await tapA(); await tapRing(5);
  if (shots) { await g(() => __game.sim(.6, 1 / 30)); await still('07-reduced-motion-dark'); }
  const rows = await g(() => ride());
  const end = await g((r) => { const G = __game, P = G.player.pos; return { mode: G.S.mode, d: +Math.hypot(P.x - r.x, P.z - r.z).toFixed(2) }; }, R[5]);
  const long = rows.length / 30 + (shots ? .6 : 0), darkest = Math.min(...rows.map((x) => x.fade)), swap = rows.findIndex((x) => x.moved > 100);
  check(`with reduced motion it's a fade to dark, ${darkest.toFixed(2)} at its darkest, and back, ${long.toFixed(2)} s in all`, long > .9 && long < 1.6 && darkest < .05 && rows.at(-1).fade === 1 && end.mode === 'town' && end.d < .1, { long, darkest, end });
  check('nothing bent, and he goes while it\'s dark', rows.every((x) => x.dream === 0) && (shots || (swap > 0 && rows[swap].fade < .1)), { swap, at: rows[swap] });
  check('no console errors with reduced motion', errors.length === 0, errors);
  await close();
}
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
