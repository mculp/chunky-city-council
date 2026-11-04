// Playing together (CHUNKY-151, step 1), in real Chrome against a real town on this machine, with real key presses, clicks and taps.
// Two newcomers press Play with others, one on a keyboard and one on a phone: a name each and a look, the opening watched with the
// rope cut for them, and they come to on the riverbank by the Griffis Fountain bridge. Then each sees the other, by name and by look,
// walking, running, driving and swinging, and on the map; a truck nudges someone aside and a swing goes through them, and nobody's
// hurt. One goes and comes back to where they left, with what they had, and doesn't watch the opening again. Then the hero's link:
// everyone sees the hero, and only one phone at a time is him. Fails on anything out of place or a console error.
//
//   npm i && npm run net -- [--shots dir]
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { serveAndOpen } from './browser.mjs';
import { startServer } from '../server/index.js';
import { rollLook } from '../src/net.js';

const args = process.argv.slice(2), shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const report = (text) => console.log(`     ${text}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(40); } };
const snap = async (p, name) => { if (shots) { await mkdir(shots, { recursive: true }); await p.page.screenshot({ path: join(shots, name + '.png') }); } };
const on = (p, fn, arg) => p.page.evaluate(fn, arg);
const away = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);

const HERO = 'a-secret-only-the-owner-has-1386', LOOKS = 8;
const server = await startServer({ port: 0, quiet: true, heroHash: createHash('sha256').update(HERO).digest('hex') });
const query = `?test&net=ws://localhost:${server.port}`;
// One on a keyboard at a phone's size, and one that's a phone, with touch
const a = await serveAndOpen({ viewport: { width: 390, height: 844 }, query }), b = await serveAndOpen({ touch: true, query });
const pages = [a, b];
const press = (p, sel) => (p === b ? p.page.tap(sel) : p.page.click(sel));
const state = (p) => on(p, () => __game.state());
const me = (p) => on(p, () => { const P = __game.player.pos; return { id: __net.link.id, x: P.x, y: P.y, z: P.z, yaw: __game.player.yaw, mode: __game.S.mode, hero: __game.heroRoot.visible }; });
const drawn = (p) => on(p, () => __net.drawn());
const bodyOf = async (p, id) => (await drawn(p)).bodies.find((s) => s.id === id);
// Where one phone has a vehicle, every frame for so long from now, so that something over in a tenth of a second isn't missed
const film = (p, i, ms) => on(p, ([i, ms]) => { const v = __game.vehicles[i], end = performance.now() + ms, seen = window.__film = []; window.__filmed = false; (function look() { seen.push({ x: v.x, z: v.z }); if (performance.now() < end) requestAnimationFrame(look); else window.__filmed = true; })(); }, [i, ms]);
const filmed = async (p) => { await p.page.waitForFunction(() => window.__filmed); return on(p, () => window.__film); };
// Every word the big map draws with the camera at cam, and the box each takes on the screen in CSS pixels, from what fillText
// was given: the cast in cyan, everyone else playing in blue, the hero in orange, and places and streets in cream
const wordsOnMap = (p, cam) => on(p, (cam) => {
  if (!window.__words) {
    window.__words = [];
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...more) {
      if (this.canvas.id === 'mapC') {
        const t = this.getTransform(), k = Math.hypot(t.a, t.b), cos = t.a / k, sin = t.b / k;
        const w = this.measureText(text).width, size = +/([\d.]+)px/.exec(this.font)[1], u0 = x + ({ center: -w / 2, right: -w }[this.textAlign] ?? 0);
        const xs = [], ys = [];
        for (const [u, v] of [[u0, y - size / 2], [u0 + w, y - size / 2], [u0, y + size / 2], [u0 + w, y + size / 2]]) { xs.push(t.e / k + u * cos - v * sin); ys.push(t.f / k + u * sin + v * cos); }
        window.__words.push({ text, fill: this.fillStyle, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
      }
      return fill.call(this, text, x, y, ...more);
    };
  }
  window.__words.length = 0;
  __game.mapCamTo(cam);
  return window.__words.slice();
}, cam);
const meets = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const dotBox = (d) => ({ x0: d.x - 6, x1: d.x + 6, y0: d.y - 6, y1: d.y + 6 });
// Where on A's map someone has to stand for their dot to be at (sx, sy) on the screen
const worldAt = (sx, sy) => on(a, async ([sx, sy]) => {
  const { makeView, toWorld } = await import('./src/mapview.js'), c = __game.mapState().cam;
  const [x, z] = toWorld(makeView(c.x, c.z, c.scale, 0, innerWidth, innerHeight), sx, sy);
  return { x, z };
}, [sx, sy]);
// Where A's phone has someone, near or far, which is what its map goes by
const seenOnA = (id) => on(a, (id) => __net.link.others().find((o) => o.id === id), id);
// Moves someone, with A's map shut while they go since nothing moves on A while it's open, and opens it again once A has them
// there
const standOnA = async (p, id, at) => {
  if (await on(a, () => __game.mapState().open)) { await a.page.keyboard.press('Escape'); await until(() => on(a, () => !__game.mapState().open)); }
  await on(p, ([x, z]) => __game.place(x, z), [at.x, at.z]);
  const s = await until(async () => { const s = await seenOnA(id); return s && away(s, at) < .3 ? s : null; }, 4000);
  await sleep(150);
  await a.page.keyboard.press('m'); await until(() => on(a, () => __game.mapState().open));
  return s;
};

try {
  for (const p of pages) await on(p, () => __game.resume());
  // ---------------- joining
  const offered = await Promise.all(pages.map((p) => on(p, () => { const e = document.getElementById('together'); return !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.textContent; })));
  check(`the title card has "Play with others" on both: ${offered.join(', ')}`, offered.every((t) => t === 'Play with others'), offered);
  for (const p of pages) await press(p, '#together');
  check('pressing it asks for a name and a look', await until(() => Promise.all(pages.map((p) => on(p, () => { const j = document.getElementById('join'); return j && !j.hidden && j.querySelectorAll('.look').length; }))).then((n) => n.every((k) => k === 8))), null);

  // a name that isn't one is turned away with why, and nothing's sent
  await press(a, '#joinGo');
  const why = await on(a, () => ({ say: document.getElementById('joinSay').textContent, link: !!__net.link }));
  check(`no name is asked for again, without going anywhere: "${why.say}"`, /1 to 16 letters/.test(why.say) && !why.link, why);

  await a.page.click('#joinName'); await a.page.keyboard.type('Junebug');
  const rolled = await on(a, () => [...document.querySelectorAll('#join .look')].findIndex((e) => e.getAttribute('aria-pressed') === 'true'));
  check(`A's look is rolled from the name until one's picked: ${rolled}`, rolled === rollLook('Junebug', LOOKS), rolled);
  await b.page.tap('#joinName'); await b.page.keyboard.type('Dee');
  await b.page.tap('#join .look:nth-child(4)');
  const picked = await on(b, () => [...document.querySelectorAll('#join .look')].findIndex((e) => e.getAttribute('aria-pressed') === 'true'));
  check('B picks the fourth', picked === 3, picked);
  await snap(b, '01-b-picks');
  for (const p of pages) await press(p, '#joinGo');

  // ---------------- the opening, watched once, with the rope cut for them
  const watched = await Promise.all(pages.map(async (p) => {
    const seen = new Set(), prompts = new Set();
    const end = Date.now() + 40000;
    while (Date.now() < end) {
      const s = await on(p, () => ({ mode: __game.S.mode, prompt: document.getElementById('prompt').hidden ? '' : document.getElementById('prompt').textContent, title: !document.getElementById('title').hidden, join: !document.getElementById('join').hidden, cut: __game.HP.cut }));
      seen.add(s.mode); if (s.prompt) prompts.add(s.prompt);
      if (s.mode === 'town' && seen.has('hang')) return { seen: [...seen], prompts: [...prompts], ...s };
      await sleep(50);
    }
    return { seen: [...seen], prompts: [...prompts], timedOut: true };
  }));
  for (const [p, name, w] of [[a, 'A', watched[0]], [b, 'B', watched[1]]]) {
    check(`${name} watches the opening through: ${w.seen.join(' → ')}`, !w.timedOut && ['hang', 'fall', 'wake', 'town'].every((m) => w.seen.includes(m)) && !w.seen.includes('land') && !w.seen.includes('bridge'), w);
    check(`with the rope cut for them, and nothing asked of them on the way: ${w.prompts.length ? w.prompts.join(' / ') : 'nothing'}`, !w.prompts.length, w);
    check('and the title card and the name are gone', !w.title && !w.join, w);
  }
  const bank = await Promise.all(pages.map((p) => on(p, () => {
    const G = __game, P = G.player.pos, B = G.map.crossings.find((c) => c.road === 'griffis_fountain_rd' && c.with === 'river');
    return { x: P.x, z: P.z, fromBridge: Math.hypot(P.x - B.x, P.z - B.z), dry: G.floorAt(P.x, P.z) - G.water.level(P.x, P.z), onRoad: G.onRoad(P.x, P.z), blocked: G.blocked(P.x, P.z, P.y), hero: G.heroRoot.visible };
  })));
  for (const [name, w] of [['A', bank[0]], ['B', bank[1]]]) check(`${name} comes to on the riverbank, ${w.fromBridge.toFixed(0)} m from where the road crosses the river, and on their feet on dry ground`, w.fromBridge < 45 && w.dry > .05 && !w.onRoad && !w.blocked, w);
  check(`and not on top of each other: ${away(bank[0], bank[1]).toFixed(1)} m apart`, away(bank[0], bank[1]) > 1, bank);
  check('nobody has the hoodie or the tape, not even on their own screen', !bank[0].hero && !bank[1].hero, bank);
  const told = await Promise.all(pages.map((p) => on(p, () => { const o = document.getElementById('obj'); return o.hidden ? '' : o.textContent; })));
  check(`each is told the road into town: ${told.map((t) => `"${t}"`).join(' / ')}`, told.every((t) => /^Follow Griffis Fountain Rd into town$/.test(t)), told);
  await snap(a, '02-a-comes-to');

  // ---------------- each sees the other: who they are and what they look like
  let A = await me(a), B = await me(b);
  check('each is let in with an id', A.id > 0 && B.id > 0 && A.id !== B.id, { A, B });
  // each on the other's screen once they're up off the bank, which shows a moment after it does on their own
  const upOn = (p, id) => until(async () => { const s = await bodyOf(p, id); return s && s.up < 3 ? s : null; }).then(async (s) => s ?? bodyOf(p, id));
  const selfA = await bodyOf(a, A.id), onA = await upOn(a, B.id), onB = await upOn(b, A.id);
  check(`each draws themselves as a townsperson in their look: A in ${selfA?.look}`, selfA?.look === rolled, selfA);
  check('and sees the other in theirs', onA?.look === 3 && onB?.look === rolled, { onA, onB });
  for (const [name, s] of [['A', selfA], ['B on A\'s screen', onA]]) check(`${name} stands all the way up (${s?.up.toFixed(1)}° off upright) and doesn't glow`, s && s.up < 3 && s.far === 0 && s.hot === 0, s);

  // Out onto US 80 by the gas station, where there's nothing in the way. W goes the way the camera faces, so they're turned first.
  const spot = await on(a, () => { const G = __game, x = G.station.house.pts[0][0] + 30; return { x, z: G.map.zAt('us_80', x) }; });
  const onRoad = (p, x, z) => on(p, ([x, z]) => __game.place(x, z), [x, z]);
  const EAST = -Math.PI / 2, WEST = Math.PI / 2;
  await onRoad(a, spot.x, spot.z); await onRoad(b, spot.x - 6, await on(b, (x) => __game.map.zAt('us_80', x), spot.x - 6));
  // B turns to A, the way a thumb drags the view round, and the camera's let settle after the jump across town
  await on(b, ([x, z]) => { const P = __game.player.pos; __game.look(Math.atan2(P.x - x, P.z - z), .25); }, [spot.x, spot.z]);
  await sleep(1500);
  const tags = await on(b, () => __net.tags());
  const tagA = tags.find((t) => t.id === A.id);
  const headA = await on(b, (id) => __net.headOnScreen(id), A.id);
  check(`B sees A's name over A's head: "${tagA?.text}"`, tagA?.text === 'Junebug' && headA && Math.abs(tagA.x - headA.x) < 3 && tagA.y < headA.y + 2 && tagA.y > headA.y - 30, { tagA, headA });
  await sleep(500);
  const still = (await on(b, () => __net.tags())).find((t) => t.id === A.id);
  check('and it stays put to the pixel while A does', still && Math.abs(still.x - tagA.x) < .5 && Math.abs(still.y - tagA.y) < .5, { tagA, still });
  await snap(b, '03-b-sees-a');
  // and that's all they're given: the chapters are the hero's
  const inTown = await Promise.all(pages.map((p) => on(p, () => { const o = document.getElementById('obj'); return { arrived: __game.S.flags.arrived, says: o.hidden ? '' : o.textContent }; })));
  check(`once they're in town they're given nothing more: ${inTown.map((t) => `"${t.says}"`).join(' / ')}`, inTown.every((t) => t.arrived && t.says === ''), inTown);
  const counted = await Promise.all(pages.map((p) => on(p, () => { const e = document.getElementById('beans'); return e.hidden ? null : e.textContent; })));
  check(`and their beans are just a count, since the twelve are the chapters': ${counted.map((t) => `"${t}"`).join(' / ')}`, counted.every((t) => /^Beans \d+$/.test(t ?? '')), counted);

  // ---------------- walking and running, with real keys and a real thumb
  async function seenStop(watcher, who, end) {
    return until(async () => { const s = await bodyOf(watcher, who); return s && away(s, end) < .05 && s.speed < .2 ? s : null; }, 3000).then(async (s) => s ?? bodyOf(watcher, who));
  }
  async function walk(who, watcher, name, keys, hold, heading) {
    await on(who, (h) => __game.look(h), heading);
    const before = await me(who);
    for (const k of keys) await who.page.keyboard.down(k);
    await sleep(hold);
    for (const k of keys) await who.page.keyboard.up(k);
    await until(async () => { const p0 = await me(who); await sleep(150); return away(p0, await me(who)) < .01; }, 3000);
    const end = await me(who), seen = await seenStop(watcher, end.id, end);
    check(`${name} goes ${away(before, end).toFixed(1)} m, and arrives on the other's screen ${seen ? away(seen, end).toFixed(3) : '?'} m from where they stopped`, away(before, end) > 6 && seen && away(seen, end) < .05, { before, end, seen });
    const turn = seen ? Math.abs(Math.atan2(Math.sin(seen.yaw - end.yaw), Math.cos(seen.yaw - end.yaw))) : NaN;
    check(`facing the way they're facing, to ${turn.toFixed(3)} radians, and on the ground`, turn < .06 && Math.abs(seen.feet - end.y) < .1, { seen, end });
    return end;
  }
  A = await walk(a, b, 'A, walking on W', ['w'], 3000, EAST);
  A = await walk(a, b, 'A, running on Shift and W', ['Shift', 'w'], 2000, WEST);
  {
    await on(b, (h) => __game.look(h), EAST);
    const before = await me(b), box = await b.page.locator('#stick').boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const touch = await b.page.context().newCDPSession(b.page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
    for (let i = 1; i <= 8; i++) { await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy - i * 6 }] }); await sleep(16); }
    await sleep(2500);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await until(async () => { const p0 = await me(b); await sleep(150); return away(p0, await me(b)) < .01; }, 3000);
    B = await me(b);
    const seen = await seenStop(a, B.id, B);
    check(`B, on the stick, goes ${away(before, B).toFixed(1)} m and A sees B stop ${seen ? away(seen, B).toFixed(3) : '?'} m from there`, away(before, B) > 4 && seen && away(seen, B) < .05, { before, B, seen });
  }

  // ---------------- driving: the same vehicle on both, with them in it, and left where they leave it
  const truck = await on(a, ([x, z]) => {
    const G = __game, list = G.vehicles; let best = -1, d = 1e9;
    list.forEach((v, i) => { const k = Math.hypot(v.x - x, v.z - z); if (v.kind === 'pickup' && !v.wrecked && k < d) { d = k; best = i; } });
    const v = list[best], side = v.K.width / 2 + .6, x0 = v.x - Math.cos(v.yaw) * side, z0 = v.z + Math.sin(v.yaw) * side;
    G.place(x0, z0); return { i: best, x: v.x, z: v.z, yaw: v.yaw, far: d };
  }, [spot.x, spot.z]);
  await sleep(300);
  await film(b, truck.i, 1200);
  await a.page.keyboard.press('e');
  const inIt = await until(async () => (await state(a)).drive);
  check(`A gets in the nearest pickup, ${truck.far.toFixed(0)} m off, on E`, inIt?.kind === 'pickup', inIt);
  {
    const seen = await filmed(b), worst = Math.max(...seen.map((p) => away(p, truck)));
    check(`and on B's phone it stays where it's parked while A gets in, every frame of ${seen.length}: ${worst.toFixed(3)} m off at most`, seen.length > 10 && worst < .05, { worst, truck });
  }
  // out onto US 80 facing east, where there's nothing in the way, without the trip
  const lane = await on(a, (x) => { const G = __game, M = G.map, p = M.along('us_80', M.sOn('us_80', x, M.zAt('us_80', x))), east = p.tx >= 0 ? 1 : -1; return { x: p.x, z: p.z, yaw: Math.atan2(p.tx * east, p.tz * east) }; }, spot.x + 40);
  const putTruck = (at) => on(a, (at) => { const G = __game, v = G.driving(); v.x = at.x; v.z = at.z; v.y = G.floorAt(at.x, at.z); v.yaw = at.yaw; v.f = v.s = v.steer = 0; v.grounded = true; G.look(at.yaw + Math.PI); }, at);
  await putTruck(lane);
  await a.page.keyboard.down('w'); await sleep(2200); await a.page.keyboard.up('w');
  await until(async () => (await state(a)).drive?.speed < .3, 6000);
  const drove = (await state(a)).drive;
  const seenTruck = await until(async () => { const v = await on(b, (i) => { const v = __game.vehicles[i]; return { x: v.x, z: v.z, yaw: v.yaw }; }, truck.i); return away(v, drove) < .2 ? v : null; }, 3000);
  check(`B sees the pickup go ${away(lane, drove).toFixed(1)} m with A in it`, away(lane, drove) > 4 && !!seenTruck, { lane, drove, seenTruck });
  const seat = await bodyOf(b, A.id);
  check(`and A sat in it, ${seat ? away(seat, drove).toFixed(2) : '?'} m from its middle`, seat && away(seat, drove) < 1.5 && seat.seated, seat);
  // it's still rolling: out it gets, and it stops dead where A gets out, on A's phone
  await a.page.keyboard.press('e');
  await until(async () => !(await state(a)).drive);
  await sleep(500);
  const where = (p) => on(p, (i) => { const v = __game.vehicles[i]; return { x: v.x, z: v.z, yaw: v.yaw, by: v.net ?? null }; }, truck.i);
  const leftOnA = await where(a), left = await where(b);
  check(`A gets out and it's left where A left it on B's phone too: ${away(left, leftOnA).toFixed(3)} m off`, away(left, leftOnA) < .02 && Math.abs(left.yaw - leftOnA.yaw) < .01 && !left.by, { left, leftOnA });
  await snap(b, '04-b-sees-the-truck-left');

  // ---------------- nobody hurts anybody: the truck nudges B aside, and a swing goes through B
  {
    await on(a, (i) => { const G = __game, v = G.vehicles[i], side = v.K.width / 2 + .6; G.place(v.x - Math.cos(v.yaw) * side, v.z + Math.sin(v.yaw) * side); }, truck.i);
    await sleep(300);
    await a.page.keyboard.press('e'); await until(async () => (await state(a)).drive);
    await putTruck(lane);
    const v = await on(a, () => { const v = __game.driving(); return { x: v.x, z: v.z, yaw: v.yaw, K: { length: v.K.length } }; });
    const ahead = v.K.length / 2 + 7, bx = v.x + Math.sin(v.yaw) * ahead, bz = v.z + Math.cos(v.yaw) * ahead;
    await onRoad(b, bx, bz);
    await sleep(500);
    const before = await on(b, () => ({ ...__game.state(), inv: __game.player.inv }));
    await a.page.keyboard.down('w'); await sleep(2600); await a.page.keyboard.up('w');
    await until(async () => (await state(a)).drive?.speed < .3, 6000);
    const after = await on(b, () => ({ ...__game.state(), inv: __game.player.inv }));
    const moved = Math.hypot(after.pos[0] - bx, after.pos[2] - bz), passed = (await state(a)).drive;
    check(`A drives the pickup through where B's standing (${Math.hypot(passed.x - v.x, passed.z - v.z).toFixed(1)} m), and it nudges B ${moved.toFixed(1)} m aside`, Math.hypot(passed.x - v.x, passed.z - v.z) > ahead && moved > .5, { before, after, passed });
    check('without a scratch: B\'s hearts, B on their feet, and nothing flashing', after.hp === before.hp && after.mode === 'town' && after.kind === 'run' && !(after.inv > 0), after);
    await a.page.keyboard.press('e'); await until(async () => !(await state(a)).drive);
  }
  {
    const Bnow = await me(b);
    await on(a, ([x, z]) => { const G = __game; G.place(x - 1.2, z); G.player.yaw = Math.PI / 2; }, [Bnow.x, Bnow.z]);
    await sleep(400);
    const before = await on(b, () => ({ ...__game.state(), inv: __game.player.inv })), swingsBefore = (await bodyOf(b, A.id))?.swings ?? 0;
    await a.page.keyboard.press('f');
    const raised = await until(async () => { const s = await bodyOf(b, A.id); return s && s.swings !== swingsBefore && Math.max(...s.arms) > 100 ? s : null; }, 2000);
    check(`B sees A swing: A's arm goes up ${raised ? Math.max(...raised.arms).toFixed(0) : '?'}° from hanging`, !!raised, await bodyOf(b, A.id));
    await sleep(800);
    const after = await on(b, () => ({ ...__game.state(), inv: __game.player.inv }));
    check('and it goes through B, who isn\'t hurt or knocked down', after.hp === before.hp && after.mode === 'town' && after.kind === 'run' && !(after.inv > 0) && Math.hypot(after.pos[0] - before.pos[0], after.pos[2] - before.pos[2]) < .05, { before, after });
  }

  // ---------------- a wave, and the map
  {
    // WAVE goes where SHAMBLE does, which a town that's shared hasn't got, and above it if it ever shows, so they're never on top of each other
    const slot = await on(b, () => {
      const w = document.getElementById('bW'), h = document.getElementById('bH'), was = h.hidden;
      const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height }; };
      h.hidden = false; const shamble = box(h), over = box(w);
      h.hidden = true; const wave = box(w);
      h.hidden = was;
      return { shamble, wave, over };
    });
    const off = Math.hypot(slot.wave.x - slot.shamble.x, slot.wave.y - slot.shamble.y), apart = slot.over.y + slot.over.h <= slot.shamble.y || slot.shamble.y + slot.shamble.h <= slot.over.y;
    check(`WAVE is where SHAMBLE would be on B's phone, ${off.toFixed(0)} px off it, and ${apart ? 'clear of it' : 'on top of it'} when SHAMBLE shows`, slot.wave.h > 0 && off < 1 && apart, slot);
    const before = (await bodyOf(a, B.id))?.waves ?? 0;
    await b.page.tap('#bW');
    const waved = await until(async () => { const s = await bodyOf(a, B.id); return s && s.waves !== before && Math.max(...s.arms) > 120 ? s : null; }, 2000);
    check(`B taps WAVE and A sees B's hand go up, ${waved ? Math.max(...waved.arms).toFixed(0) : '?'}° from hanging`, !!waved, await bodyOf(a, B.id));
    await sleep(1800);
    await a.page.keyboard.press('v');
    const waved2 = await until(async () => { const s = await bodyOf(b, A.id); return s && Math.max(...s.arms) > 120 ? s : null; }, 2000);
    check('and V waves on a keyboard', !!waved2, await bodyOf(b, A.id));
  }
  {
    // B goes up the road a way first, or A's arrow would be on top of B's dot
    B = await me(b);
    await onRoad(b, B.x - 60, await on(b, (x) => __game.map.zAt('us_80', x), B.x - 60));
    await sleep(600);
    B = await me(b);
    await a.page.keyboard.press('m');
    await until(() => on(a, () => __game.mapState().open));
    await on(a, (at) => __game.mapCamTo({ x: at.x, z: at.z, scale: 1.5 }), B);
    await sleep(200);
    const dot = await on(a, (id) => __net.dotOnMap(id), B.id);
    check(`B is a blue dot on A's map, where B is, and not the cast's cyan: ${dot ? dot.rgb.join(',') : 'nothing'}`, dot && Math.abs(dot.rgb[0] - 0x5b) < 30 && Math.abs(dot.rgb[1] - 0x8c) < 30 && Math.abs(dot.rgb[2] - 0xff) < 30, dot);
    await snap(a, '05-a-map');

    // Names take their turn for room: the hero, then everyone else playing, then the cast, then places and streets. One further
    // down goes to the other side of its dot, or is left out. So B keeps their name beside their dot, where it always is, with
    // nothing on it or on the dot, standing where the gas station's name goes and standing on Coop.
    const cam = { x: B.x, z: B.z, scale: 1.5 }, west = B.x - 200;
    // where the gas station's name goes with nobody on it, B being well off the screen, and then B stands on it
    await standOnA(b, B.id, { x: west, z: await on(b, (x) => __game.map.zAt('us_80', x), west) });
    let words = await wordsOnMap(a, cam);
    const gas = words.find((w) => w.text === 'Gas station');
    if (gas) await standOnA(b, B.id, await worldAt((gas.x0 + gas.x1) / 2 - 20, (gas.y0 + gas.y1) / 2));
    // B's name where it always is, beside their dot, with no other word on either
    const keeps = async (words) => {
      const d = await on(a, (id) => __net.dotOnMap(id), B.id), mine = words.find((w) => w.text === 'Dee');
      if (!d) return { kept: false };
      const onIt = words.filter((w) => w !== mine && (meets(w, dotBox(d)) || (mine && meets(w, mine))));
      return { d, mine, onIt: onIt.map((w) => w.text), wouldBe: mine && { x0: d.x + 11, x1: d.x + 11 + mine.x1 - mine.x0, y0: d.y - 8, y1: d.y + 8 }, kept: !!mine && Math.abs(mine.x0 - d.x - 11) < 1.5 && !onIt.length };
    };
    words = await wordsOnMap(a, cam);
    const there = await keeps(words), gasNow = words.find((w) => w.text === 'Gas station');
    const went = !gasNow ? 'is left out' : gasNow.y1 <= gas.y0 + 1 ? 'goes up' : gasNow.y0 >= gas.y1 - 1 ? 'goes down' : 'stays put';
    check(`B stands where the gas station's name goes and keeps their own beside their dot, and the gas station's ${went}`, !!gas && !!there.wouldBe && meets(there.wouldBe, gas) && there.kept, { gas, ...there });
    await snap(a, '05-a-map-names');
    const coop = await on(a, () => __game.npcs.coop);
    await standOnA(b, B.id, coop);
    words = await wordsOnMap(a, { x: coop.x, z: coop.z, scale: 1.5 });
    const onCoop = await keeps(words), cyan = onCoop.d ? words.filter((w) => w.fill === '#6fd6c8' && Math.abs((w.y0 + w.y1) / 2 - onCoop.d.y) < 4 && Math.abs(w.x0 - onCoop.d.x) < 120) : [];
    const side = !cyan.length ? 'is left out' : cyan.every((w) => w.x1 <= onCoop.d.x) ? 'goes to the other side' : 'stays where it was';
    check(`B stands on Coop and keeps their name, and Coop's ${side}`, away(await seenOnA(B.id) ?? {}, coop) < 1 && onCoop.kept, { coop, ...onCoop, cyan });
    await a.page.keyboard.press('Escape');
    await until(() => on(a, () => !__game.mapState().open));
  }

  // ---------------- in a Camaro, which sits low: on someone else's phone, their head's under its roof right above it
  {
    const car = await on(a, ([x, z]) => {
      const G = __game, list = G.vehicles; let best = -1, d = 1e9;
      list.forEach((v, i) => { const k = Math.hypot(v.x - x, v.z - z); if (/^coupe/.test(v.kind) && !v.wrecked && k < d) { d = k; best = i; } });
      const v = list[best], side = v.K.width / 2 + .6;
      G.place(v.x - Math.cos(v.yaw) * side, v.z + Math.sin(v.yaw) * side); return { i: best, kind: v.kind, x: v.x, z: v.z, yaw: v.yaw, side };
    }, [spot.x, spot.z]);
    // what's in reach is picked twice a second, and A's come a long way
    const t0 = (await state(a)).time;
    await until(async () => (await state(a)).time > t0 + .6);
    await a.page.keyboard.press('e');
    const inCar = await until(async () => (await state(a)).drive);
    await on(b, (c) => __game.place(c.x - Math.cos(c.yaw) * (c.side + 1.5), c.z + Math.sin(c.yaw) * (c.side + 1.5)), car);
    const sat = await until(async () => { const s = await bodyOf(b, A.id); return s?.seated ? s : null; }, 4000);
    // the highest point of their body, and of the roof where it's over them, both as the car sees it
    const fit = sat && await on(b, async ([id, i]) => {
      const THREE = await import('three'), { vehicleGeometries } = await import('./src/vehiclemodels.js');
      const v = __game.vehicles[i], toCar = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(v.pitch, v.yaw, v.roll, 'YXZ')).setPosition(v.x, v.y, v.z).invert();
      const body = __net.group.children[0], slot = __net.drawn().bodies.findIndex((s) => s.id === id);
      const m = new THREE.Matrix4().fromArray(body.instanceMatrix.array, slot * 16).premultiply(toCar), p = new THREE.Vector3(), head = new THREE.Vector3(0, -1e9, 0);
      const pos = body.geometry.attributes.position, shell = vehicleGeometries()[v.kind].geo.attributes.position;
      for (let k = 0; k < pos.count; k++) { p.fromBufferAttribute(pos, k).applyMatrix4(m); if (p.y > head.y) head.copy(p); }
      let roof = -1e9;
      for (let k = 0; k < shell.count; k++) { p.fromBufferAttribute(shell, k); if (Math.hypot(p.x - head.x, p.z - head.z) < .35) roof = Math.max(roof, p.y); }
      return { kind: v.kind, head: head.y, roof };
    }, [A.id, car.i]);
    check(`A sits in the ${car.kind === 'coupe' ? '\'91' : '\'99'} Camaro on B's phone with their head ${fit ? `${((fit.roof - fit.head) * 100).toFixed(0)} cm under its roof` : 'nowhere'}`, inCar?.kind === car.kind && fit && fit.head < fit.roof - .02, { inCar, sat, fit });
    await snap(b, '06-b-sees-a-in-the-camaro');
    if (inCar) { await a.page.keyboard.press('e'); await until(async () => !(await state(a)).drive); }
  }

  // ---------------- coming back, where they left and with what they had, without the opening
  {
    await on(a, () => { __game.S.beans = 5; __game.S.items.bottle = 2; });
    await sleep(800);
    const left = await me(a);
    await a.page.reload({ waitUntil: 'load' }); await a.page.waitForFunction(() => window.__game && window.__game.resume);
    await on(a, () => __game.resume());
    await a.page.click('#together');
    const name = await until(() => on(a, () => { const j = document.getElementById('join'); return j && !j.hidden && document.getElementById('joinName').value; }));
    check(`A comes back and is asked who they are with it filled in: "${name}"`, name === 'Junebug', name);
    await a.page.click('#joinGo');
    const modes = new Set(); let back = null;
    await until(async () => { const s = await on(a, () => ({ mode: __game.S.mode, joined: !!__net.link.id })); modes.add(s.mode); return s.joined && s.mode === 'town'; }, 8000);
    back = await me(a);
    const had = await state(a);
    check(`and is straight back in town without the opening (${[...modes].join(' → ')}), ${away(left, back).toFixed(2)} m from where they left`, !modes.has('hang') && !modes.has('fall') && away(left, back) < .5, { left, back, modes: [...modes] });
    check(`with what they had: ${had.beans} beans and ${had.items.bottle} bottles`, had.beans === 5 && had.items.bottle === 2, had);
    A = back;
    check('and B sees them back', !!await until(() => bodyOf(b, A.id)), null);
  }

  // ---------------- the hero's link: everyone sees the hero, and only one phone at a time is him
  const c = await serveAndOpen({ viewport: { width: 390, height: 844 }, query: `${query}#hero=${HERO}` });
  pages.push(c);
  {
    const kept = await on(c, () => ({ hash: location.hash }));
    check('the hero\'s link comes off the address as soon as it\'s read', !kept.hash.includes('hero'), kept);
    await on(c, () => __game.resume());
    await c.page.click('#together'); await c.page.click('#joinName'); await c.page.keyboard.type('Matt'); await c.page.click('#joinGo');
    await until(async () => (await me(c)).mode === 'town' && (await me(c)).id, 10000);
    const C = await me(c);
    check('the owner\'s phone is the hero, in his hoodie, on his own screen', C.hero, C);
    await onRoad(c, A.x + 4, A.z);
    // and A turns to him, since names only show over heads that are on screen
    await on(a, ([x, z]) => { const P = __game.player.pos; __game.look(Math.atan2(P.x - x, P.z - z), .25); }, [A.x + 4, A.z]);
    await sleep(800);
    const seen = (await drawn(a)).hero;
    check(`and everyone else sees the hero where he is: ${seen ? away(seen, { x: A.x + 4, z: A.z }).toFixed(2) + ' m off' : 'not at all'}`, seen?.visible && away(seen, { x: A.x + 4, z: A.z }) < .1, seen);
    check('and not as a townsperson', !(await bodyOf(a, C.id)), await drawn(a));
    const tag = (await on(a, () => __net.tags())).find((t) => t.id === C.id);
    check(`with his name over him: "${tag?.text}"`, tag?.text === 'Matt', tag);
    await snap(a, '06-a-sees-the-hero');
    // and on everyone else's map he's in the orange of his own arrow, a way up the road so that A's arrow isn't over him
    await onRoad(c, A.x + 60, await on(c, (x) => __game.map.zAt('us_80', x), A.x + 60));
    await sleep(600);
    const H = await me(c);
    await a.page.keyboard.press('m');
    await until(() => on(a, () => __game.mapState().open));
    await on(a, (at) => __game.mapCamTo({ x: at.x, z: at.z, scale: 1.5 }), H);
    await sleep(200);
    const dot = await on(a, (id) => __net.dotOnMap(id), C.id);
    check(`he's an orange dot on A's map, like his own arrow: ${dot ? dot.rgb.join(',') : 'nothing'}`, dot && Math.abs(dot.rgb[0] - 0xec) < 30 && Math.abs(dot.rgb[1] - 0x80) < 30 && Math.abs(dot.rgb[2] - 0x3a) < 30, dot);
    // and his name comes before anyone else's: B stands on him, and B's name goes to the other side or is left out
    await standOnA(b, B.id, H);
    const said = await wordsOnMap(a, { x: H.x, z: H.z, scale: 1.5 });
    const hd = await on(a, (id) => __net.dotOnMap(id), C.id), named = said.find((w) => w.text === 'Matt' && w.fill === '#ec803a'), dees = said.filter((w) => w.text === 'Dee');
    const put = !dees.length ? 'is left out' : hd && dees.every((w) => w.x1 <= hd.x) ? 'goes to the other side' : 'stays where it was';
    check(`B stands on the hero and his name keeps its place, and B's ${put}`, away(await seenOnA(B.id) ?? {}, H) < 1 && !!hd && !!named && Math.abs(named.x0 - hd.x - 11) < 1.5 && dees.every((w) => !meets(w, named) && !meets(w, dotBox(hd))), { hd, named, dees });
    await a.page.keyboard.press('Escape');
    await until(() => on(a, () => !__game.mapState().open));
    // and by the gas station, where A and B were given nothing more, the chapters are his
    await onRoad(c, spot.x + 3, await on(c, (x) => __game.map.zAt('us_80', x), spot.x + 3));
    const his = await until(() => on(c, () => { const o = document.getElementById('obj'); return __game.S.flags.arrived && !o.hidden ? o.textContent : null; }), 4000);
    check(`and the chapters are his: "${his}"`, /^Stock up on beans/.test(his ?? ''), his);
    const count = await on(c, () => document.getElementById('beans').textContent);
    check(`and so are the twelve beans: "${count}"`, /^Beans \d+\/12$/.test(count), count);

    const d = await serveAndOpen({ viewport: { width: 390, height: 844 }, query: `${query}#hero=${HERO}` });
    pages.push(d);
    await on(d, () => __game.resume());
    await d.page.click('#together'); await d.page.click('#joinName'); await d.page.keyboard.type('Matt'); await d.page.click('#joinGo');
    await until(async () => (await me(d)).id, 10000);
    const told = await until(() => on(c, () => !document.getElementById('join').hidden && document.getElementById('joinSay').textContent), 4000);
    check(`the hero on a second phone takes over, and the first is told: "${told}"`, /hero on another phone/.test(told ?? ''), told);
    // the second phone starts where he wakes, which is too far off for A to see him, so it's who's in town that says
    const D = await me(d);
    const one = await until(() => on(a, ([c, d]) => { const all = __net.link.others(), h = all.filter((w) => w.hero); return h.length === 1 && h[0].id === d && !all.some((w) => w.id === c) ? h[0].id : null; }, [C.id, D.id]), 4000);
    check('and there\'s one hero in town, on the second phone, with the first one gone', one === D.id, { one, C: C.id, D: D.id });

    // A link to some other town, even one that would take the hero's secret, doesn't get it: it's kept for the town it came with.
    // Nor does it get who the phone is here.
    const elsewhere = await startServer({ port: 0, quiet: true, heroHash: createHash('sha256').update(HERO).digest('hex') });
    try {
      await c.page.goto(c.page.url().replace(/[?#].*$/, `?test&net=ws://localhost:${elsewhere.port}`), { waitUntil: 'load', timeout: 120000 });
      await c.page.waitForFunction(() => window.__game, null, { timeout: 30000 });
      await on(c, () => __game.resume());
      await c.page.click('#together'); await c.page.click('#joinGo');
      const there = await until(() => on(c, () => window.__net?.you().id ? __net.you() : null), 10000);
      check(`a link to another town doesn't take the hero's secret there: "${there?.name}" is ${there?.hero ? 'the hero' : 'a townsperson'} in it`, there && !there.hero, there);
      const keys = await on(c, () => Object.keys(localStorage).filter((k) => k.startsWith('chunky.net.key')).map((k) => localStorage.getItem(k)));
      check(`and the phone is someone else there, with a key of its own: ${keys.length} kept`, keys.length === 2 && keys[0] !== keys[1], keys.length);
    } finally { await elsewhere.close(); }
  }

  // ---------------- what it costs
  const sent = await on(a, () => __net.link.count);
  report(`A's wire: ${(sent.bytesIn / 1024).toFixed(0)} KB in and ${(sent.bytesOut / 1024).toFixed(0)} KB out so far`);
} finally {
  for (const p of pages) for (const e of p.errors) check(`no console errors: ${e}`, false, e);
  for (const p of pages) await p.close();
  await server.close();
}
console.log(failed ? `\n${failed} failed` : '\nplaying together: all good');
process.exit(failed ? 1 : 0);
