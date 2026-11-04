// Every way a try ends, on a phone-sized page with real taps: the fever from the bite, full of whatever got him, with nothing written anywhere
// on the screen, and then he comes to where he starts again about five seconds after the hit, his heart the first thing heard, or with a tap
// straight to coming to. The crowd drag him down and stand round him folded over, looking down. Their fever's looked at a frame at a time from
// each way he could be facing, the picture as well as the camera: it's them on the screen in every frame, and never any of him. The train goes
// by stretching while its light swells till it's all there is. A pickup that hits him goes up and over, end over end, against a horizon that
// won't hold still, and it's back where it was after. A blast, a fire and something coming down on him turn the sky, with the camera rising off
// him from the far side of it. The cottonmouths have him, and the river takes him on the bridge run and his hood comes up once. Then the same
// with reduced motion: held still, with no warping, and quicker.
//
//   npm i && npm run deaths [-- --shots dir]
import { mkdirSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';
import { oneColour, WALL } from './picture.mjs';
import { CAUSES, FEVER } from '../src/fever.js';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const close = (a, b, by) => Math.abs(a - b) <= by;
const seen = new Set();

// the same town on every page: Chapter 1 over, the crowd out, nobody driving, the trains on, and these
const helpers = () => {
  const G = __game; G.pause(); G.fillTown(); G.jump('town'); G.S.flags.town = true; G.S.flags.ended = G.S.flags.arrived = true; G.step(.1);
  document.getElementById('card').style.display = 'none';
  G.bringOutCrowd(); G.traffic.on = false; G.traffic.clear();
  window.G = G; window.H = G.horde; window.T = 1 / 30; window.R = G.trains; window.TR = R.t; R.go();
  window.home = G.player.pos.clone(); window.homeYaw = G.player.yaw;
  // playing again, down to his last heart, with nobody after him, stood at x, z looking along yaw
  window.ready = () => { G.revive(); TR.clear(); H.calm(); G.S.mode = 'town'; G.HP.kind = 'run'; G.S.hp = 1; G.player.inv = 0; G.player.kb.set(0, 0); G.stick(0, 0); };
  window.standAt = (x, z, yaw) => { ready(); G.place(x, z); G.look(yaw, .3); G.step(.2, T); G.player.inv = 0; return G.player.pos.clone(); };
  // a way along US 80 from the gas station, out in the open: where, and which way the road goes
  window.road80 = (along) => {
    const road = G.map.roads.find((r) => r.id === 'us_80'), gas = G.places.gas, gx = gas.x ?? gas[0], gz = gas.z ?? gas[1];
    let i0 = 0; road.pts.forEach((p, i) => { if (Math.hypot(p[0] - gx, p[1] - gz) < Math.hypot(road.pts[i0][0] - gx, road.pts[i0][1] - gz)) i0 = i; });
    const want = road.s[i0] + along; let j = 1; while (j < road.pts.length - 1 && road.s[j] < want) j++;
    const a = road.pts[j - 1], b = road.pts[j], t = (want - road.s[j - 1]) / (road.s[j] - road.s[j - 1] || 1);
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
  };
  // Anything with words in it that can be seen: shown, not see-through, and on the page. That's the HUD, the buttons and the hints as well.
  window.words = () => [...document.querySelectorAll('body *')].filter((e) => !e.children.length && e.textContent.trim() && (() => {
    for (let x = e; x && x !== document.body; x = x.parentElement) { const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return false; }
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  })()).map((e) => e.textContent.trim());
  // until something's got him, or half a minute
  window.untilDead = () => { for (let i = 0; i < 900 && !G.fever(); i++) G.step(T, T); return G.fever(); };
  // on to a moment in it, a frame at a time
  window.until = (t) => { for (let i = 0; i < 600 && G.fever() && G.fever().t < t; i++) G.step(T, T); return G.fever(); };
  // on to where he's put where he starts again, in the dark
  window.untilPlaced = () => { let n = 0; while (G.fever() && !G.fever().placed && n++ < 600) G.step(T, T); return n * T; };
  // and on till he's playing again: how long that took, and what mode it left him in
  window.through = () => { let n = 0; while (G.fever() && n++ < 600) G.step(T, T); return { took: n * T, mode: G.S.mode }; };
  // a blast, a fire and something heavy coming down, set off beside him, and where each one is
  window.setOff = {
    blast: () => { const P = G.player.pos, x = P.x + 2.5; G.wreck.blastCan(x, G.floorAt(x, P.z) + .3, P.z); return { x, z: P.z }; },
    fire: () => { const P = G.player.pos, x = P.x + 1; G.wreck.burnAt(x, G.floorAt(P.x, P.z) + .04, P.z, 1.4, 30); return { x, z: P.z }; },
    hit: () => { const P = G.player.pos, x = P.x + 3; G.wreck.thud(x, G.floorAt(P.x, P.z) + 1, P.z, 7, 2.5); return { x, z: P.z }; },
  };
  // where the camera is from him, how far up and how far across, and how far over towards a point
  window.camFrom = (P, to) => { const c = G.state().cam, dx = c[0] - P.x, dz = c[2] - P.z; return { up: c[1] - P.y, across: Math.hypot(dx, dz), towards: to ? (dx * (to.x - P.x) + dz * (to.z - P.z)) / (Math.hypot(to.x - P.x, to.z - P.z) || 1) : 0 }; };
  // What's on the screen, read off the canvas in the same task it's drawn in, and how much of it is the one colour there's most of (tools/picture.mjs)
  window.picture = () => {
    const c = G.renderer.domElement, w = c.width, h = c.height, cv = (window.shot ??= document.createElement('canvas'));
    cv.width = w; cv.height = h; const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(c, 0, 0);
    return oneColour(x.getImageData(0, 0, w, h));
  };
  // how many of those stood round him are on the screen: any of three points on each, from their middle up, leaning in over him
  const on = new G.THREE.Vector3();
  window.ringOn = () => {
    const P = G.player.pos;
    return H.all.filter((s) => s.ring && [.6, 1, 1.4].some((up) => { const lean = up / 1.4 * .45; on.set(s.x + (P.x - s.x) * lean, (s.y ?? P.y) + up, s.z + (P.z - s.z) * lean).project(G.camera); return on.z < 1 && Math.abs(on.x) <= 1 && Math.abs(on.y) <= 1; })).length;
  };
};

let { page, errors, close: shut } = await serveAndOpen({ touch: true });
const g = (fn, arg) => page.evaluate(fn, arg);
// A frame that's meant to be all one colour, or nearly, says so, so that tools/browser.mjs doesn't take it for a wall
const snap = async (name, flat = false) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, ...(flat && { flat }) }); };
await g(helpers);
await g(`window.oneColour = ${oneColour}`);
// Nothing makes a sound until a real key or touch, so there's a heart to hear
await page.keyboard.press('x');
const heard = await page.waitForFunction(() => { const s = G.sound.state(); return s.ctx === 'running' && s.waiting === 0 && s.files.includes('wake.heart'); }, null, { timeout: 30000 }).then(() => true, () => false);
check('the sound is on, started by a real key press', heard, await g(() => G.sound.state()));

// ---- the crowd: hunted down with no hearts left, the real way
let r = await g(() => {
  const P = standAt(home.x, home.z, homeYaw + Math.PI);
  for (let i = 0; i < 5; i++) { const a = i * 1.25; H.add(P.x + Math.sin(a) * 1.6, P.z + Math.cos(a) * 1.6).state = 2; }
  return { fever: untilDead(), mode: G.S.mode };
});
seen.add(r.fever?.by);
check('dragged down by the crowd, it\'s their fever', r.fever?.by === 'crowd' && r.mode === 'fail', r);
r = await g(() => {
  until(1.5); const P = G.player.pos, ring = H.all.filter((s) => s.ring);
  return { ring: ring.length, near: Math.max(...ring.map((s) => Math.hypot(s.x - P.x, s.z - P.z))), facing: ring.every((s) => Math.cos(s.yaw - Math.atan2(P.x - s.x, P.z - s.z)) > .9), cam: camFrom(P), down: G.HP.down, look: G.deathLook(), words: words() };
});
check(`they stand round him, ${r.ring} of them within ${r.near.toFixed(2)} m, looking down at him, and he's down`, r.ring >= 3 && r.near < 1.2 && r.facing && r.down === 1, r);
check('looking up at them from where he lies, wide, through the fever', r.cam.up < 1 && r.look.up[1] === 0 && r.look.fov > 80 && r.look.tint > .9 && r.look.dream > 0, r);
check('and there isn\'t a word anywhere on the screen', !r.words.length, r.words);
await snap('1-the-crowd');
r = await g(() => {
  // what's heard in the frame he's put down, in the dark, before the picture comes back
  const t0 = G.fever().t; let n = 0;
  while (G.fever() && !G.fever().placed && n++ < 600) { G.sound.forget(); G.step(T, T); }
  const dark = G.sound.state().heard, run = through();
  return { ...run, took: t0 + n * T + run.took, dark, hp: G.S.hp, church: H.inSanctuary(G.player.pos.x, G.player.pos.z), ring: H.all.filter((s) => s.ring).length, words: words(), look: G.deathLook() };
});
check(`he comes to on the church steps ${r.took.toFixed(1)} s after the hit, his heart beating as soon as he's there in the dark, with three hearts and nobody stood round`, close(r.took, 5, .3) && r.mode === 'town' && r.dark.includes('wake.heart') && r.hp === 3 && r.church && !r.ring, r);
check('and everything\'s back as it was', r.look.up[1] === 1 && r.look.fade === 1 && r.look.swell === 0 && r.look.stretch === 1 && r.look.truck === null, r.look);

// ---- their fever as it's seen, a frame at a time from each way he could be facing, from the first frame after they get him until it starts to go
// black. The camera's where he's lying, looking up at them, so it's them on the screen and none of him: from there he'd be the inside of his hood,
// a wall of red. The picture's measured as well as the numbers, so a frame that's a wall of one colour fails it.
for (let f = 0; f < 4; f++) {
  r = await g(({ f, end }) => {
    const P = standAt(home.x, home.z, homeYaw + f * Math.PI / 2);
    for (let i = 0; i < 5; i++) { const a = i * 1.25; H.add(P.x + Math.sin(a) * 1.6, P.z + Math.cos(a) * 1.6).state = 2; }
    const by = untilDead()?.by, frames = [];
    // the frame they get him in is still the one behind him
    for (G.step(T, T); G.fever() && G.fever().t < end; G.step(T, T)) frames.push({ t: G.fever().t, him: G.hero.body.visible, on: ringOn(), ...picture() });
    through();
    const worst = frames.reduce((a, b) => (b.share > a.share ? b : a), frames[0]);
    return { by, n: frames.length, him: frames.filter((x) => x.him).length, on: [Math.min(...frames.map((x) => x.on)), Math.max(...frames.map((x) => x.on))], worst: worst && { t: +worst.t.toFixed(2), share: +worst.share.toFixed(2), colour: worst.colour } };
  }, { f, end: FEVER.scene - FEVER.out });
  check(`facing ${f * 90}° round from there: in all ${r.n} frames of their fever none of him's drawn, ${r.on[0]} to ${r.on[1]} of them are on the screen, and no frame is a wall of one colour, the most of one being ${r.worst?.share} of it at ${r.worst?.t} s`, r.by === 'crowd' && r.n >= 70 && !r.him && r.on[0] >= 3 && r.worst.share < WALL, r);
}

// ---- the train, the real way, and a tap to skip it
r = await g(() => {
  ready(); const s = TR.gates.find((c) => c.road === 'poplar_st').s + 300, q = R.RAIL.at(s);
  G.place(q.x, q.z); G.look(Math.atan2(-q.tx, -q.tz), .3); G.HP.speed = 0; TR.send(1, s - 300);
  for (let i = 0; i < 1200 && !G.fever(); i++) G.step(T, T);
  return { fever: G.fever() };
});
seen.add(r.fever?.by);
check('hit by the train, it\'s the train\'s fever', r.fever?.by === 'train', r);
r = await g(() => { until(1); const a = G.deathLook(); until(2.6); const b = G.deathLook(); return { a, b, words: words() }; });
check(`the boxcars stretch as they go by, to ${r.b.stretch.toFixed(1)} times as long, and its light swells till it's nearly all there is`, r.a.stretch > 1.1 && r.b.stretch > r.a.stretch && r.b.swell > .8 && r.b.swell > r.a.swell, r);
check('with nothing written', !r.words.length, r.words);
// the train's light swells till it's nearly all there is, which is meant to be nearly one colour
await snap('2-the-train', true);
const box = await page.locator('canvas').first().boundingBox(), tap = () => page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
await g(() => until(1.4));
await tap();
r = await g(() => { G.step(T, T); const f = G.fever(), run = through(); return { placed: f?.placed, part: f?.part, ...run }; });
check(`a tap goes straight to coming to, and he's playing again ${r.took.toFixed(1)} s later`, r.placed && r.part === 'waking' && r.took < FEVER.wake + .2 && r.mode === 'town', r);

// ---- a wreck: a pickup thrown into him along US 80, the real way, goes up and over him end over end, and it's back where it was after
r = await g(() => {
  const q = road80(150), fx = Math.sin(q.yaw), fz = Math.cos(q.yaw), P = standAt(q.x, q.z, q.yaw + Math.PI);
  const v = G.vehicles.filter((v) => v.kind === 'pickup' && !v.wrecked && !v.ai).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
  v.x = P.x - fx * 6; v.z = P.z - fz * 6; v.yaw = q.yaw; v.y = G.floorAt(v.x, v.z);
  G.wreck.toss(v, fx * 11, fz * 11, 3.5); window.V = v;
  const f = untilDead(); window.hitAt = { x: v.x, y: v.y, z: v.z, pitch: v.pitch };
  return { fever: f, held: !!v.held };
});
seen.add(r.fever?.by);
check('a pickup coming down US 80 into him, it\'s the wreck\'s fever, and the pickup\'s in it', r.fever?.by === 'wreck' && r.held, r);
r = await g(() => {
  const P = G.player.pos.clone(), sky = G.deathLook().sky; until(.6); const a = G.deathLook(); until(1.2); const b = G.deathLook();
  return { up: b.truck.y - hitAt.y, turned: Math.abs(b.truck.pitch - hitAt.pitch), rocks: [a.up, b.up].some((u) => Math.abs(u[0]) + Math.abs(u[2]) > .05), sky: sky !== b.sky, cam: camFrom(P), down: G.HP.down, dream: b.dream, words: words() };
});
check(`it goes ${r.up.toFixed(1)} m up and ${(r.turned * 180 / Math.PI).toFixed(0)}° over, against a pale sky and a horizon that won't hold still, with him down in the road`, r.up > 2 && r.turned > 1 && r.rocks && r.sky && r.down === 1 && r.dream > 0 && !r.words.length, r);
await snap('3-a-wreck');
// It's put back as he's put down, and carries on from there the same frame, so it's within a frame's going of where it hit him
r = await g(() => { untilPlaced(); const back = { off: Math.hypot(V.x - hitAt.x, V.y - hitAt.y, V.z - hitAt.z), over: Math.abs(V.pitch - hitAt.pitch), held: !!V.held }; return { back, ...through() }; });
check(`and when he comes to, the pickup's back where it was when it hit him, ${r.back.off.toFixed(2)} m off, for the world to have again`, r.back.off < .5 && r.back.over < .2 && !r.back.held && r.mode === 'town', r);

// ---- a blast, a fire and something coming down on him, each the real way, further along US 80
const kinds = [['blast', 250, 'a gas can going off beside him'], ['fire', 350, 'standing in a fire'], ['hit', 450, 'something heavy coming down beside him']];
for (const [by, along, what] of kinds) {
  r = await g(({ by, along }) => {
    const q = road80(along), P = standAt(q.x, q.z, q.yaw), sky = G.deathLook().sky, to = setOff[by](); untilDead(); until(1.5);
    return { by: G.fever()?.by, cam: camFrom(P, to), sky, now: G.deathLook().sky, down: G.HP.down, words: words() };
  }, { by, along });
  seen.add(r.by);
  check(`${what}: the sky turns, and the camera rises off him from the far side of it, with him down`, r.by === by && r.now !== r.sky && r.cam.up > 2 && r.cam.towards < -.5 && r.down === 1 && !r.words.length, r);
  await snap(`4-${by}`);
  r = await g(() => through());
  check(`and he's playing again after, ${r.took.toFixed(1)} s on`, r.mode === 'town', r);
}

// ---- the cottonmouths, which are only in the river and on the bridge, so it's as if one had him
r = await g(() => { const P = standAt(home.x, home.z, homeYaw); G.die('snake'); until(1.5); return { by: G.fever()?.by, cam: camFrom(P), down: G.HP.down, words: words() }; });
seen.add(r.by);
check('the cottonmouths: the bite\'s fever, rising straight up off him lying there, looking down', r.by === 'snake' && r.cam.up > 6 && r.cam.across < 6 && r.down === 1 && !r.words.length, r);
await snap('5-the-snake');
await g(() => through());

// ---- the river, on the bridge run: under, his hood comes up once, and he comes to at the start of it
// Chapter 1 isn't over on the bridge run, so it's where he starts again
r = await g(() => {
  G.revive(); G.S.flags.town = false; G.jump('bridge'); G.step(.5, T);
  G.player.pos.set(6, -1, 0); G.player.vy = -3; G.step(T, T);
  const f = G.fever(), lv = G.water.level(6, 0), ys = [];
  for (let t = .2; t < 2.9; t += .1) { until(t); ys.push(G.player.pos.y - lv); }
  return { f, top: Math.max(...ys), low: Math.min(...ys) };
});
seen.add(r.f?.by);
check(`the river takes him on the bridge run, and his hood comes up once, ${r.top.toFixed(2)} m from the top`, r.f?.by === 'river' && r.top > r.low + .4 && r.top < .1, r);
await snap('6-the-river');
r = await g(() => { until(3.6); const waking = { part: G.fever()?.part, kind: G.HP.kind, x: G.player.pos.x }; through(); return { waking, mode: G.S.mode, obj: G.state().obj }; });
check('he comes to lying at the start of the bridge, and the run starts again', r.waking.part === 'waking' && r.waking.kind === 'down' && r.waking.x < -20 && r.mode === 'bridge' && /Run/.test(r.obj), r);
check(`every way a try ends has played its own fever: ${CAUSES.join(', ')}`, CAUSES.every((c) => seen.has(c)), [...seen]);
check('no console errors', !errors.length, errors);
await shut();

// ---- with reduced motion: the same, held still, and quicker
({ page, errors, close: shut } = await serveAndOpen({ touch: true, reducedMotion: 'reduce' }));
await page.evaluate(helpers);
await page.evaluate(`window.oneColour = ${oneColour}`);
r = await page.evaluate(() => {
  const P = standAt(home.x, home.z, homeYaw + Math.PI);
  // a frame for them to be about, since the ring is whoever's nearest of those that are
  for (let i = 0; i < 5; i++) { const a = i * 1.25; H.add(P.x + Math.sin(a) * 1.6, P.z + Math.cos(a) * 1.6); }
  G.step(T, T); G.die('crowd'); until(.3); const a = G.state().cam, la = G.deathLook(), pa = picture(); until(1.2); const b = G.state().cam, lb = G.deathLook(), pb = picture();
  return { moved: Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), dream: Math.max(la.dream, lb.dream), tint: lb.tint, fov: [la.fov, lb.fov], down: G.HP.down, him: G.hero.body.visible, on: ringOn(), most: Math.max(pa.share, pb.share), ...through() };
});
check(`with reduced motion it's held still, with the tint and no warping, him down from the start and none of him drawn, ${r.on} of them on the screen, and he's playing again ${r.took.toFixed(1)} s after it`, r.moved < .01 && r.dream === 0 && r.tint > .9 && r.fov[0] === r.fov[1] && r.down === 1 && !r.him && r.on >= 3 && r.most < WALL && r.took < 4, r);
r = await page.evaluate(() => {
  ready(); const s = TR.gates.find((c) => c.road === 'poplar_st').s + 300, q = R.RAIL.at(s);
  G.place(q.x, q.z); G.look(Math.atan2(-q.tx, -q.tz), .3); G.HP.speed = 0; TR.send(1, s - 300);
  for (let i = 0; i < 1200 && !G.fever(); i++) G.step(T, T);
  until(1); return { by: G.fever()?.by, stretch: G.deathLook().stretch };
});
check('and the boxcars don\'t stretch', r.by === 'train' && r.stretch === 1, r);
r = await page.evaluate(() => {
  through(); const q = road80(150), fx = Math.sin(q.yaw), fz = Math.cos(q.yaw), P = standAt(q.x, q.z, q.yaw + Math.PI);
  const v = G.vehicles.filter((v) => v.kind === 'pickup' && !v.wrecked && !v.ai).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
  v.x = P.x - fx * 6; v.z = P.z - fz * 6; v.yaw = q.yaw; v.y = G.floorAt(v.x, v.z); G.wreck.toss(v, fx * 11, fz * 11, 3.5);
  // from the first frame of the fever, which is when it's taken from where it hit him
  untilDead(); G.step(T, T); const was = { y: v.y, pitch: v.pitch }; until(1.2);
  return { by: G.fever()?.by, moved: Math.abs(v.y - was.y) + Math.abs(v.pitch - was.pitch), up: G.deathLook().up };
});
check('and the pickup stays where it hit him, with the horizon level', r.by === 'wreck' && r.moved < 1e-6 && r.up[1] === 1, r);
await page.screenshot({ path: shots ? `${shots}/7-held-still.png` : '/dev/null' }).catch(() => {});
check('no console errors', !errors.length, errors);
await shut();
process.exit(failed ? 1 : 0);
