// Plays with a keyboard and a mouse, with real key presses and a real mouse, the way a laptop does. Moving it looks around with nothing held, WASD goes the way the camera's looking and
// A and D go sideways with the camera left where it was, a click hits what's in the middle of the screen, a right click throws there, the wheel changes what's in his hand, and talking, the
// map and Esc all let the mouse go. Then in a pickup, and again in an iframe that won't let a page take the mouse, and last that a phone's stick and drag haven't changed.
//
// Chrome won't give a headless page the mouse, so the first part stands in for that with what the page would be told. Everything else about it is real.
//
//   npm i && npm run keys [-- --shots dir]
import { mkdirSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };

const LAPTOP = { width: 1280, height: 800 };
const { page, errors, close } = await serveAndOpen({ viewport: LAPTOP });
const g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) { await g(() => __game.step(.4, 1 / 24)); await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); } };
const helpers = () => {
  const G = __game; window.T = 1 / 30;
  window.state = () => { const m = G.mouse.state(); return { held: m.held, locked: m.locked, free: m.free, back: m.back, mode: G.S.mode, yaw: G.cam.yaw, pitch: G.cam.pitch, strip: [...document.querySelectorAll('#keyStrip .ks')].map((k) => k.textContent) }; };
  window.fwd = () => [-Math.sin(G.cam.yaw), -Math.cos(G.cam.yaw)];
  window.right = () => [Math.cos(G.cam.yaw), -Math.sin(G.cam.yaw)];
  // how far along the camera's forward and right he went while that ran
  window.went = (secs) => { const P = G.player.pos, x = P.x, z = P.z, y0 = G.cam.yaw; for (let t = 0; t < secs; t += T) G.sim(T, T); const dx = P.x - x, dz = P.z - z, L = Math.hypot(dx, dz) || 1, f = fwd(), r = right(); return { far: L, ahead: (dx * f[0] + dz * f[1]) / L, side: (dx * r[0] + dz * r[1]) / L, turned: Math.abs(G.cam.yaw - y0) }; };
};

// ---------------- what the page would be told if Chrome gave it the mouse
await g(() => {
  const c = document.getElementById('c'); let holder = null;
  Object.defineProperty(document, 'pointerLockElement', { get: () => holder, configurable: true });
  const told = () => document.dispatchEvent(new Event('pointerlockchange'));
  c.requestPointerLock = () => { holder = c; told(); return Promise.resolve(); };
  document.exitPointerLock = () => { holder = null; told(); };
});
await g(helpers);

// ---------------- in from the title card with a real click
await page.click('#free');
await g(() => { const G = __game; G.pause(); G.step(.2, T); document.getElementById('card').style.display = 'none'; });
let st = await g(() => state());
check('the click that starts it takes the mouse', st.held && st.locked && st.mode === 'town', st);
check('and the strip says what the mouse does', st.strip.includes('MOUSELook') && st.strip.includes('CLICKSwing') && st.strip.some((k) => k.startsWith('RIGHT CLICKThrow')) && st.strip.includes('WHEELSwitch'), st.strip);
await snap('1-strip');

// ---------------- looking, with nothing held
await page.mouse.move(640, 400);
const before = await g(() => state());
await page.mouse.move(840, 400);
let after = await g(() => state());
check(`moving the mouse right turns the view right, with nothing held: ${(after.yaw - before.yaw).toFixed(3)}`, after.yaw < before.yaw - .3 && after.yaw > before.yaw - .9, { before, after });
await page.mouse.move(840, 450);
const lower = await g(() => state());
check('and moving it down looks down', lower.pitch > after.pitch + .05, { after, lower });
await page.mouse.move(840, 400);

// ---------------- WASD with the camera
await g(() => { const G = __game, p = G.map.along('us_80', 300); G.place(p.x, p.z); G.look(Math.atan2(p.tx, p.tz) + Math.PI, .28); G.step(.1, T); });
await page.waitForTimeout(0);
await page.keyboard.down('w');
const ahead = await g(() => went(2.5));
await page.keyboard.up('w');
check(`W goes the way the camera looks: ${ahead.ahead.toFixed(3)}`, ahead.far > 8 && ahead.ahead > .98, ahead);
await page.keyboard.down('a');
const sideways = await g(() => went(3));
await page.keyboard.up('a');
check(`A goes sideways, left of the camera: ${sideways.side.toFixed(3)}`, sideways.far > 8 && sideways.side < -.97, sideways);
check('and the camera stays where it was put, instead of swinging round behind him', sideways.turned < .001, sideways);
await page.keyboard.down('d');
const other = await g(() => went(3));
await page.keyboard.up('d');
check(`D goes the other way: ${other.side.toFixed(3)}`, other.side > .97 && other.turned < .001, other);
await page.keyboard.down('Shift'); await page.keyboard.down('w');
const running = await g(() => went(2));
await page.keyboard.up('w'); await page.keyboard.up('Shift');
check(`Shift runs: ${(running.far / 2).toFixed(1)} m/s`, running.far / 2 > 6, running);
const jump = await g(async () => { const G = __game, y = G.player.pos.y; return y; });
await page.keyboard.press(' ');
const up = await g(() => { const G = __game; G.sim(.1, T); return G.player.pos.y; });
await page.keyboard.up(' ');
check('Space jumps', up > jump + .2, { jump, up });
await g(() => __game.sim(1, T));

// ---------------- a click hits what's in the middle of the screen, whichever way he's facing
const wall = await g(() => {
  const G = __game, W = G.wreck, m = G.map;
  let t = null;
  for (const s of G.structures) {
    if (s.walls !== 'siding' || s.open || s.sqm < 60 || s.sqm > 500 || s.use === 'church' || W.damage.has(s) || m.roadGrid.nearest(s.wx, s.wz) > 45) continue;
    const id = m.roadGrid.seg.owner.id, p = m.along(id, m.sOn(id, s.wx, s.wz)), d = Math.hypot(s.wx - p.x, s.wz - p.z); if (d < 10) continue;
    const ux = (s.wx - p.x) / d, uz = (s.wz - p.z) / d, free = (k) => { const x = p.x + ux * k, z = p.z + uz * k; return !G.blocked(x, z, 6.9) && !W.treeBlocks(x, z) && Math.abs(G.floorAt(x, z) - 6.2) < 1; };
    let k = 0; for (; k < d && free(k); k += .25);
    if (k >= 4 && k < d && G.houseAt(p.x + ux * (k + .6), p.z + uz * (k + .6)) === s) { t = { s, p, ux, uz, k }; break; }
  }
  const { s, p, ux, uz, k } = t, x = p.x + ux * (k - .5), z = p.z + uz * (k - .5);
  window.theWall = s;
  G.place(x, z); G.player.yaw = Math.atan2(-ux, -uz); G.look(Math.atan2(ux, uz) + Math.PI, .28); G.sim(.1, T);
  return { facing: G.player.yaw, wanted: Math.atan2(ux, uz), hurt: W.damage.has(s) };
});
await page.mouse.click(840, 400);
const hit = await g(() => {
  const G = __game, swinging = (G.sim(T, T), G.swinging()), yaw = G.player.yaw; G.sim(.7, T);
  return { swinging, yaw, cam: G.cam.yaw, cracked: G.wreck.damage.has(theWall) && G.wreck.damage.state(theWall).walls.some((w) => w.hp < w.max) };
});
const off = Math.abs(Math.atan2(Math.sin(hit.yaw - hit.cam - Math.PI), Math.cos(hit.yaw - hit.cam - Math.PI)));
check('a click swings, and he turns to where the camera looks to do it', hit.swinging && off < .01, { hit, off });
check('and it cracks the wall in the middle of the screen, with his back to it when the click came', hit.cracked && !wall.hurt, { hit, wall });
await snap('2-swing');

// ---------------- the wheel and a right click
await g(() => { const G = __game, p = G.map.along('us_80', 300); G.place(p.x, p.z); G.look(.7, .28); G.player.yaw = 2.4; G.S.hand = 'bottle'; G.sim(.1, T); });
const had = await g(() => __game.S.hand);
await page.mouse.wheel(0, 100); await page.waitForTimeout(40);
const next = await g(() => { const G = __game; G.sim(T, T); return G.S.hand; });
await page.mouse.wheel(0, 100); await page.waitForTimeout(40);
const flicked = await g(() => { const G = __game; G.sim(T, T); return G.S.hand; });
check(`the wheel changes what's in his hand, from ${had} to ${next}`, next !== had, { had, next });
check('and one flick of a trackpad only moves it on once', flicked === next, { next, flicked });
await page.waitForTimeout(280);
await g(() => { __game.S.hand = 'bottle'; });
const bottles = await g(() => __game.S.items.bottle);
await page.mouse.click(840, 400, { button: 'right' });
const thrown = await g(() => { const G = __game; G.sim(T, T); const f = G.flyingLures().find((t) => t.kind === 'bottle'), L = f ? Math.hypot(f.vx, f.vz) : 1, a = fwd(); return { left: G.S.items.bottle, f, ahead: f ? (f.vx * a[0] + f.vz * a[1]) / L : 0, menu: false }; });
check(`a right click throws where the camera looks: ${thrown.ahead.toFixed(3)}`, thrown.left === bottles - 1 && thrown.ahead > .97, thrown);
await g(() => __game.sim(2, T));

// ---------------- what needs a cursor
await g(() => { const G = __game, c = G.npcs.coop; G.place(c.x, c.z - 1.5); G.step(.1, T); });
await page.keyboard.press('e');
st = await g(() => { const G = __game; G.step(.05, T); return { ...state(), who: G.state().dialog?.who }; });
check(`talking to ${st.who} lets the mouse go, to click on what to say`, st.mode === 'dialog' && !st.locked && st.back, st);
const still = await g(() => state().yaw);
await page.mouse.move(600, 300);
check('and it doesn\'t look around while it\'s let go', (await g(() => state().yaw)) === still, still);
await g(() => { const G = __game; let n = 0; while (G.S.mode === 'dialog' && n++ < 12) G.choose(0); G.step(.05, T); });
st = await g(() => state());
check('and it takes it back after', st.mode === 'town' && st.locked && !st.back, st);
await page.keyboard.press('m');
st = await g(() => { __game.step(.05, T); return { ...state(), map: !document.getElementById('map').hidden }; });
check('the map lets it go too', st.map && !st.locked, st);
await page.keyboard.press('m');
st = await g(() => { __game.step(.05, T); return { ...state(), map: !document.getElementById('map').hidden }; });
check('and it comes back when the map shuts', !st.map && st.locked, st);

// ---------------- Esc
await g(() => { document.exitPointerLock(); __game.step(.05, T); });
st = await g(() => state());
check('Esc lets it go, and the strip says how to get it back', !st.held && st.strip.includes('CLICKLook with the mouse'), st);
const free = await g(() => state().yaw);
await page.mouse.move(700, 350);
check('and it isn\'t looking around any more', (await g(() => state().yaw)) === free, free);
await page.mouse.click(700, 350);
st = await g(() => { const G = __game; G.sim(T, T); return { ...state(), swinging: G.swinging() }; });
check('a click takes it back, and that click doesn\'t swing', st.locked && !st.swinging, st);
await page.mouse.click(700, 350);
check('and the next one does', await g(() => { const G = __game; G.sim(T, T); return G.swinging(); }));
await g(() => __game.sim(1, T));

// ---------------- how fast it turns
const speed = await g(() => __game.mouse.state().speed);
await page.keyboard.press(']'); await page.keyboard.press(']');
const faster = await g(() => __game.mouse.state().speed);
check(`] makes it faster, and says so: ${Math.round(faster * 100)}%`, faster > speed * 1.3 && /Mouse speed/.test(await g(() => document.getElementById('toast').textContent)), { speed, faster });
await page.mouse.move(600, 350);
const y0 = await g(() => state().yaw); await page.mouse.move(700, 350); const y1 = await g(() => state().yaw);
check('and it turns further for the same move', Math.abs(y1 - y0) > 100 * .0028 * 1.3, { y0, y1 });
check('and it\'s remembered', Math.abs((await g(() => +localStorage.getItem('chunky.mouseSpeed'))) - faster) < 1e-9);
await page.keyboard.press('['); await page.keyboard.press('[');
check('[ takes it back down', Math.abs((await g(() => __game.mouse.state().speed)) - speed) < 1e-9);

// ---------------- behind the wheel
await g(() => { const G = __game, v = G.vehicles.find((o) => o.kind === 'pickup' && !o.wrecked && !o.drowned), a = v.yaw + Math.PI / 2, off = v.K.width / 2 + 1; G.place(v.x + Math.sin(a) * off, v.z + Math.cos(a) * off); G.step(.6); });
await page.keyboard.press('e');
st = await g(() => { const G = __game; G.sim(T, T); const v = G.driving(), p = G.map.along('us_80', 300); v.x = p.x; v.z = p.z; v.y = G.floorAt(p.x, p.z); v.yaw = Math.atan2(p.tx, p.tz); v.f = v.s = v.steer = 0; G.look(v.yaw + Math.PI, .28); G.step(.1, T); return { ...state(), kind: v.kind }; });
check('E gets in a pickup, and the mouse still looks', st.mode === 'drive' && st.strip.includes('MOUSELook') && st.locked, st);
await page.mouse.move(600, 350); await page.mouse.move(800, 350);
const looked = await g(() => { const G = __game, v = G.driving(), a = Math.atan2(Math.sin(G.cam.yaw - v.yaw - Math.PI), Math.cos(G.cam.yaw - v.yaw - Math.PI)); return a; });
check('it looks off to the side when the mouse says', Math.abs(looked) > .25, looked);
await page.keyboard.down('w');
const back = await g(() => { const G = __game, v = G.driving(), road = 'us_80'; for (let t = 0; t < 4; t += T) { const q = G.map.along(road, G.map.sOn(road, v.x, v.z) + 14); let d = Math.atan2(q.x - v.x, q.z - v.z) - v.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); v.yaw += d * .1; G.sim(T, T); } return { off: Math.atan2(Math.sin(G.cam.yaw - v.yaw - Math.PI), Math.cos(G.cam.yaw - v.yaw - Math.PI)), f: v.f }; });
await page.keyboard.up('w');
check(`and once it's left alone and moving, the camera comes back behind it: ${back.off.toFixed(2)} off`, back.f > 5 && Math.abs(back.off) < .25, back);
await snap('3-driving');
await page.keyboard.press('e');
await g(() => { const G = __game, v = G.driving(); if (v) { v.f = v.s = 0; } G.sim(.1, T); });
check('no console errors on a plain page', errors.length === 0, errors);
await close();

// ---------------- where the page isn't allowed to take the mouse, which the work link may not be
{
  const { page: outer, errors: errs, close: shut } = await serveAndOpen({
    viewport: LAPTOP, query: 'frame.html',
    overrides: { '/frame.html': '<!doctype html><body style="margin:0;background:#000"><iframe id="f" sandbox="allow-scripts allow-same-origin" src="/?test" style="position:fixed;left:40px;top:20px;width:1200px;height:760px;border:0"></iframe><script>window.__game = 1;</script></body>' },
  });
  const frame = outer.frames().find((f) => f !== outer.mainFrame());
  await frame.waitForFunction(() => window.__game, null, { timeout: 120000 });
  const f = (fn, arg) => frame.evaluate(fn, arg);
  await f(helpers);
  await frame.click('#free');
  await f(() => { const G = __game; G.pause(); G.step(.2, T); document.getElementById('card').style.display = 'none'; });
  st = await f(() => ({ ...state(), refused: __game.mouse.state().refused, cursor: document.getElementById('c').style.cursor }));
  check('an iframe won\'t let it take the mouse, and it carries on anyway', st.refused && st.free && !st.locked && st.mode === 'town', st);
  check('the mouse still looks, and the strip says so', st.strip.includes('MOUSELook') && st.strip.includes('CLICKSwing'), st.strip);
  check('with no cursor in the way', st.cursor === 'none', st.cursor);
  await outer.mouse.move(640, 400);
  const a = await f(() => state().yaw);
  await outer.mouse.move(800, 400);
  const b = await f(() => state().yaw);
  check(`moving it right turns the view right, with nothing held: ${(b - a).toFixed(3)}`, b < a - .2 && b > a - .9, { a, b });
  const middle = await f(() => { const G = __game, y = G.cam.yaw; G.step(1, T); return Math.abs(G.cam.yaw - y); });
  check('and in the middle of the page it stays put when the mouse does', middle < .001, middle);
  await outer.mouse.move(1234, 400);
  const edge = await f(() => { const G = __game, y = G.cam.yaw; G.step(1, T); return y - G.cam.yaw; });
  check(`up against the right side of the page it keeps turning right: ${edge.toFixed(2)} a second`, edge > .8, edge);
  await outer.mouse.move(46, 400);
  const left = await f(() => { const G = __game, y = G.cam.yaw; G.step(1, T); return G.cam.yaw - y; });
  check(`and against the left it turns left: ${left.toFixed(2)} a second`, left > .8, left);
  await outer.mouse.move(640, 400);
  await outer.mouse.click(640, 400);
  check('a click swings', await f(() => { const G = __game; G.sim(T, T); return G.swinging(); }));
  await f(() => __game.sim(1, T));
  const can = await f(() => __game.S.gas);
  await outer.mouse.click(640, 400, { button: 'right' });
  check('a right click throws', await f((had0) => { const G = __game; G.sim(T, T); return G.S.gas === had0 - 1; }, can));
  await f(() => { const G = __game, c = G.npcs.coop; G.place(c.x, c.z - 1.5); G.step(.1, T); });
  await outer.keyboard.press('e');
  st = await f(() => { const G = __game; G.step(.05, T); return { ...state(), cursor: document.getElementById('c').style.cursor }; });
  check('talking gives the cursor back', st.mode === 'dialog' && st.cursor === '', st);
  await f(() => { const G = __game; let n = 0; while (G.S.mode === 'dialog' && n++ < 12) G.choose(0); G.step(.05, T); });
  st = await f(() => ({ ...state(), cursor: document.getElementById('c').style.cursor }));
  check('and takes it away again after', st.free && st.cursor === 'none', st);
  await outer.keyboard.press('Escape');
  st = await f(() => { __game.step(.05, T); return { ...state(), cursor: document.getElementById('c').style.cursor }; });
  check('Esc gives it back for good, and says how to go on', !st.held && st.cursor === '' && st.strip.includes('CLICKLook with the mouse'), st);
  await outer.mouse.click(640, 400);
  st = await f(() => { const G = __game; G.sim(T, T); return { ...state(), swinging: G.swinging() }; });
  check('and a click goes back to looking, without a swing', st.free && !st.swinging, st);
  // only what the browser says about the refusal itself is allowed
  const others = errs.filter((e) => !/pointer lock|sandbox/i.test(e));
  check('no console errors in the iframe', others.length === 0, others);
  await shut();
}

// ---------------- a phone hasn't changed
{
  const { page: phone, errors: errs, close: shut } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
  const p = (fn, arg) => phone.evaluate(fn, arg);
  await p(helpers);
  await phone.tap('#free');
  await p(() => { const G = __game; G.pause(); G.step(.2, T); document.getElementById('card').style.display = 'none'; });
  st = await p(() => ({ ...state(), strip: !document.getElementById('keyStrip').hidden, stick: getComputedStyle(document.getElementById('stick')).display !== 'none' }));
  check('a phone never asks for the mouse, and has its stick and no strip', !st.held && !st.strip && st.stick, st);
  // a real finger, dragged across the picture
  const cdp = await phone.context().newCDPSession(phone), touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const y2 = await p(() => state().yaw);
  await touch('touchStart', [{ x: 200, y: 300 }]); await touch('touchMove', [{ x: 300, y: 300 }]); await touch('touchEnd', []);
  const y3 = await p(() => state().yaw);
  check(`a drag still looks around: ${(y3 - y2).toFixed(2)}`, Math.abs((y3 - y2) + 100 * .006) < .02, { y2, y3 });
  const swing = await p(() => { const G = __game, p0 = G.map.along('us_80', 300); G.place(p0.x, p0.z); G.look(0, .28); G.stick(1, 0); const y = G.cam.yaw; for (let t = 0; t < 4; t += T) G.sim(T, T); G.stick(0, 0); return { y, now: G.cam.yaw }; });
  check('and on a phone the camera still comes round behind him as he goes', Math.abs(swing.now - swing.y) > .3, swing);
  check('no console errors on a phone', errs.length === 0, errs);
  await shut();
}

console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
