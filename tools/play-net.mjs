// Playing together (CHUNKY-151, step 1), in real Chrome against a real town on this machine, with real key presses, clicks and taps.
// The title card's one thing, Play, with how many are in town right now under it and nothing of the story, over the gas station at
// night from across US 80 (CHUNKY-169). Two newcomers press it, one on a keyboard and one on a phone: the first time it asks for a name
// each and a look, and they're straight into town out front of the gas station, where Coop can see them, on dry ground and with
// nothing in the objective box, and the other's title card says there's one in town. Coop says each line written for online once and
// then nods, and with the model on says something new, asked about them by name and as "they", and a line that warms him to them is
// how he feels about them, told him from the next ask on. A twelfth can of beans ends nothing,
// since a town that's shared has no chapters. Then each sees the other, by name and by look, walking, running, driving and swinging, and on
// the map; a truck nudges someone aside and a swing goes through them, and nobody's hurt. A try that ends is the fever, with the other
// seeing them lying where they went down, and they come to by the pumps. One goes into the river and comes back with Change your look,
// out front of the gas station in a new look and with what they had, and the time after that Play takes them straight in, with Coop
// remembering them, and how he and Miss Bobby feel about them, from what the town kept. What one breaks, the other sees come down as it
// did, with a blast doing its damage once, and nothing breaks at a place that's set aside (CHUNKY-152). Then the hero's link, who starts
// there too with no chapters, is known to the cast and finds what was broken already down: everyone sees the hero, carrying and swinging
// the skillet and the bat as he does on his own screen, and only one phone at a time is him. A day later, with everyone away, what was
// broken is back for everyone. Fails on anything out of place or a console error.
//
//   npm i && npm run net -- [--shots dir]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
// the town's time of day, for what's broken, which the check moves on to tomorrow
const DAY = 864e5, clock = { at: Date.now() };
const server = await startServer({ port: 0, quiet: true, heroHash: createHash('sha256').update(HERO).digest('hex'), wall: () => clock.at });
const query = `?test&net=ws://localhost:${server.port}`;
// One on a keyboard at a phone's size, and one that's a phone, with touch
const a = await serveAndOpen({ viewport: { width: 390, height: 844 }, query }), b = await serveAndOpen({ touch: true, query });
const pages = [a, b];
const press = (p, sel) => (p === b ? p.page.tap(sel) : p.page.click(sel));
const state = (p) => on(p, () => __game.state());
// The cast's words, and a talk server a page can be given that plays a line at a time and keeps what it was asked
const TALK = JSON.parse(readFileSync(new URL('../data/talk.json', import.meta.url), 'utf8')), CAST = JSON.parse(readFileSync(new URL('../data/cast.json', import.meta.url), 'utf8'));
const scripted = async (p) => {
  p.heard = []; p.script = [];
  await p.page.route('http://localhost:65533/talk', async (route) => {
    p.heard.push(JSON.parse(route.request().postData()));
    const next = p.script.shift() ?? { quiet: 'off' };
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(typeof next === 'string' ? { reply: next, model: 'scripted', cost: 0, ms: 1 } : next) });
  });
};
// Up to one of the cast and E, on a keyboard: what the box says once they've said it, or with { box: false } whatever's there straight away.
// Each is walked up to from where there's room, as in npm run talk.
const FROM = { coop: [0, -1.5], rocky: [.5, -1.5], bobby: [1.5, 0] };
const talkTo = async (p, who, { box = true } = {}) => {
  await on(p, ([who, [dx, dz]]) => { const n = __game.npcs[who]; __game.place(n.x + dx, n.z + dz); }, [who, FROM[who]]);
  await sleep(250); await p.page.keyboard.press('e');
  if (!box) { await sleep(50); return (await state(p)).dialog; }
  const d = await until(async () => { const s = await state(p); return s.dialog && !s.dialog.waiting ? s.dialog : null; }, 4000);
  return d && { ...d, opts: d.opts.map((o) => o.replace(/^\d\. /, '')) };
};
const later = async (p) => { await p.page.locator('#dOpts button', { hasText: 'Later.' }).first().click(); await until(async () => !(await state(p)).dialog, 2000); };
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
// Moves someone and waits until A's phone has them there, which its map does too, open or not
const standOnA = async (p, id, at) => {
  await on(p, ([x, z]) => __game.place(x, z), [at.x, at.z]);
  return until(async () => { const s = await seenOnA(id); return s && away(s, at) < .3 ? s : null; }, 4000);
};
// Every mode a phone's in and everything its objective box says, from now on: the modes a frame at a time, and the box each time it
// changes, so that nothing's missed however quickly it's gone, and whether they were ever asked who they are
const record = (p) => on(p, () => {
  const seen = window.__seen = { modes: [__game.S.mode], said: [], asked: false }, box = document.getElementById('obj');
  new MutationObserver(() => { const t = box.hidden ? '' : box.textContent; if (t && !seen.said.includes(t)) seen.said.push(t); }).observe(box, { attributes: true, childList: true, characterData: true, subtree: true });
  (function look() { if (seen.modes.at(-1) !== __game.S.mode) seen.modes.push(__game.S.mode); if (document.getElementById('join')?.hidden === false) seen.asked = true; requestAnimationFrame(look); })();
});
// The title card, in a town that's shared: what's on it, and what's behind it, which is the gas station from across US 80
const titleCard = (p) => on(p, () => {
  const shown = (id) => { const e = document.getElementById(id); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; };
  // as high as the hills have the land drawn there
  const G = __game, C = G.camera.position, L = G.station.spot, up = (x, z) => G.hills.at(x, z) * G.hills.uniforms.uHillScale.value - G.hills.here(), crossed = [];
  const pumps = new G.THREE.Vector3(L.x, G.floorAt(L.x, L.z) + up(L.x, L.z) + 1.5, L.z).project(G.camera);
  // the roads between the camera and the pumps
  for (let s = 0; s <= 1; s += .01) { const x = C.x + (L.x - C.x) * s, z = C.z + (L.z - C.z) * s, r = G.map.roadGrid.within(x, z, (o) => (o.width ?? 4) / 2); if (r && !crossed.includes(r.owner.id)) crossed.push(r.owner.id); }
  return {
    play: shown('together') ? document.getElementById('together').textContent : null, here: shown('here') ? document.getElementById('here').textContent : null,
    story: ['start', 'free', 'forget', 'chapter'].filter(shown), look: shown('changeLook'), mode: G.S.mode,
    cam: { x: C.x, y: C.y, z: C.z }, fromPumps: Math.hypot(C.x - L.x, C.z - L.z), fromBridge: Math.hypot(C.x, C.z), crossed,
    onScreen: pumps.z < 1 && Math.abs(pumps.x) < .9 && Math.abs(pumps.y) < .95, lit: G.station.light.intensity, above: C.y - (G.floorAt(C.x, C.z) + up(C.x, C.z)), inside: G.blocked(C.x, C.z, C.y),
  };
});
// Once a phone's let into town and has stood there a moment: what it went through on the way, and where they're standing, against Coop
const cameIn = async (p) => {
  await until(() => on(p, () => __game.S.mode === 'town' && !!window.__net?.you().id), 10000);
  await sleep(400);
  return on(p, () => {
    const G = __game, P = G.player.pos, C = G.npcs.coop, floor = G.floorAt(P.x, P.z), off = (a) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    return { ...window.__seen, id: __net.you().id, name: __net.you().name, look: __net.you().look, x: P.x, z: P.z, fromCoop: Math.hypot(P.x - C.x, P.z - C.z), dry: floor - G.water.level(P.x, P.z), feet: P.y - floor, kind: G.HP.kind, blocked: G.blocked(P.x, P.z, P.y), facing: off(G.player.yaw - Math.atan2(C.x - P.x, C.z - P.z)), behind: off(G.cam.yaw - G.player.yaw - Math.PI), hero: G.heroRoot.visible };
  });
};
// out front of the gas station, near enough to Coop for him to turn to them, facing him, and on their feet on dry ground in nothing
function startsAtTheGasStation(name, w) {
  check(`${name} goes straight into town, without the opening: ${w.modes.join(' → ')}`, w.modes.length > 1 && w.modes.slice(1).every((m) => m === 'town'), w);
  check(`out front of the gas station, ${w.fromCoop.toFixed(1)} m from Coop, which is near enough for him to turn to them`, w.fromCoop > 1 && w.fromCoop < 6.5, w);
  check(`facing him, to ${w.facing.toFixed(3)} radians, with the camera behind them`, w.facing < .05 && w.behind < .05, w);
  check(`on their feet on dry ground, ${w.dry.toFixed(2)} m above any water, and inside nothing`, w.kind === 'run' && Math.abs(w.feet) < .1 && w.dry > .05 && !w.blocked, w);
}

// What a phone has of what A broke at `site` (CHUNKY-152), and every frame for so long from now: whether the prop's ever falling rather
// than just down, every angle the tree's at, and how many fires there are at the vehicle
const watchBroken = (p, site, ms) => on(p, ([s, ms]) => {
  const W = __game.wreck, prop = W.props[s.prop], tree = W.trees(s.tree.x, s.tree.z, .3).find((t) => Math.abs(t.x - s.tree.x) < .06 && Math.abs(t.z - s.tree.z) < .06);
  const seen = window.__broke = { fell: false, leans: [], fires: 0, done: false }, end = performance.now() + ms;
  (function look() {
    if (W.falling.some((f) => f.prop === prop && f.t < f.T)) seen.fell = true;
    if (tree?.lean && !seen.leans.includes(+tree.lean.toFixed(3))) seen.leans.push(+tree.lean.toFixed(3));
    seen.fires = Math.max(seen.fires, W.burners.filter((q) => !q.dead && Math.hypot(q.x - s.x, q.z - s.z) < 6).length);
    if (performance.now() < end) requestAnimationFrame(look); else seen.done = true;
  })();
}, [site, ms]);
const brokenNow = (p, site) => on(p, (s) => {
  // whether anything's happened to the house, and its wall only asked after if something has, since asking makes it a state
  const G = __game, W = G.wreck, house = G.structures[s.house], held = W.damage.has(house), v = G.vehicles[s.v], r = W.damage.read(house), prop = W.props[s.prop];
  // a tree that's down isn't among the ones standing near it
  const treeDown = !W.trees(s.tree.x, s.tree.z, .3).some((t) => Math.abs(t.x - s.tree.x) < .06 && Math.abs(t.z - s.tree.z) < .06);
  return {
    wall: held && !!W.damage.state(house).parts[s.wall].gone, stops: house.stops.get(s.stop)?.[4] ?? null, prop: prop.down, propStops: [...prop.solids, ...prop.walls].every((c) => c[4] > -1e8), treeDown,
    up: !!v.exploded, wrecked: !!v.wrecked, home: Math.hypot(v.x - v.home.x, v.z - v.home.z), whole: v.hp === v.K.hp, held,
    hp: Object.fromEntries(r.parts.map((q) => [q.part, q.hp / q.max])), gone: r.parts.filter((q) => q.gone).length,
  };
}, site);

try {
  for (const p of pages) await on(p, () => __game.resume());
  // ---------------- the title card: one thing, Play, with how many are in town right now under it and nothing of the story, over the
  // gas station at night from across US 80, where everyone comes to
  for (const p of pages) { await until(() => on(p, () => !!window.__net), 20000); await on(p, () => __net.here()); }
  const cards = await Promise.all(pages.map(titleCard));
  for (const [name, c] of [['A', cards[0]], ['B', cards[1]]]) {
    check(`${name}'s title card is one thing, "${c.play}", with nothing of the story: ${c.story.length ? `${c.story.join(', ')} still there` : 'no Start, Skip to town, Forget everyone or chapter'}`, c.play === 'Play' && !c.story.length && c.mode === 'title', c);
    check(`with how many are in town right now under it: "${c.here}"`, c.here === 'Nobody in town right now', c);
    check(`and nothing to change for someone who's never been: ${c.look ? 'Change your look is there' : 'no Change your look'}`, !c.look, c);
    check(`and behind it the gas station, ${c.fromPumps.toFixed(0)} m off across ${c.crossed.join(' and ') || 'nothing'}, its pumps lit and on the screen, and not the bridge, ${(c.fromBridge / 1000).toFixed(1)} km off`, c.crossed.includes('us_80') && c.fromPumps > 15 && c.fromPumps < 60 && c.onScreen && c.lit > 0 && c.fromBridge > 1000, c);
    check(`seen from ${c.above.toFixed(1)} m up, inside nothing`, c.above > 1 && c.above < 8 && !c.inside, c);
  }
  // drifting as the bridge's does, a little to each side
  const drift = await on(a, async () => { const C = __game.camera.position, was = { x: C.x, z: C.z }; await new Promise((r) => setTimeout(r, 2500)); return Math.hypot(C.x - was.x, C.z - was.z); });
  check(`and it drifts, ${drift.toFixed(2)} m in 2.5 s, as the bridge's camera does`, drift > .02 && drift < .9, drift);
  await snap(b, '00-b-title-over-the-gas-station');

  // ---------------- joining: the first time, Play asks for a name and a look
  await press(a, '#together');
  check('A pressing Play the first time asks for a name and a look', await until(() => on(a, () => { const j = document.getElementById('join'); return j && !j.hidden && j.querySelectorAll('.look').length === 8; })), null);

  // a name that isn't one is turned away with why, and nothing's sent
  await press(a, '#joinGo');
  const why = await on(a, () => ({ say: document.getElementById('joinSay').textContent, link: !!__net.link }));
  check(`no name is asked for again, without going anywhere: "${why.say}"`, /1 to 16 letters/.test(why.say) && !why.link, why);

  await a.page.click('#joinName'); await a.page.keyboard.type('Junebug');
  const rolled = await on(a, () => [...document.querySelectorAll('#join .look')].findIndex((e) => e.getAttribute('aria-pressed') === 'true'));
  check(`A's look is rolled from the name until one's picked: ${rolled}`, rolled === rollLook('Junebug', LOOKS), rolled);
  await record(a); await press(a, '#joinGo');
  const cameA = await cameIn(a);
  // and B's title card, still up, says there's someone in town, and asks B too
  await on(b, () => __net.here());
  const hereNow = (await titleCard(b)).here;
  check(`and B's title card, still up, says so: "${hereNow}"`, hereNow === '1 in town right now', hereNow);
  await press(b, '#together');
  check('B pressing Play the first time is asked too', await until(() => on(b, () => { const j = document.getElementById('join'); return j && !j.hidden && j.querySelectorAll('.look').length === 8; })), null);
  await b.page.tap('#joinName'); await b.page.keyboard.type('Dee');
  await b.page.tap('#join .look:nth-child(4)');
  const picked = await on(b, () => [...document.querySelectorAll('#join .look')].findIndex((e) => e.getAttribute('aria-pressed') === 'true'));
  check('B picks the fourth', picked === 3, picked);
  await snap(b, '01-b-picks');
  await record(b); await press(b, '#joinGo');

  // ---------------- straight into town, out front of the gas station where Coop can see them, and with nothing to do
  const came = [cameA, await cameIn(b)];
  for (const [name, w] of [['A', came[0]], ['B', came[1]]]) {
    startsAtTheGasStation(name, w);
    check(`and the objective box never says a thing: ${w.said.length ? w.said.map((t) => `"${t}"`).join(' / ') : 'nothing'}`, !w.said.length, w);
  }
  const gone = await Promise.all(pages.map((p) => on(p, () => document.getElementById('title').hidden && document.getElementById('join').hidden)));
  check('and the title card and the name are gone', gone.every(Boolean), gone);
  check(`and they're not on top of each other: ${away(came[0], came[1]).toFixed(1)} m apart`, away(came[0], came[1]) > 1, came);
  check('nobody has the hoodie or the tape, not even on their own screen', !came[0].hero && !came[1].hero, came);
  await snap(a, '02-a-at-the-gas-station');
  await snap(b, '02-b-at-the-gas-station');

  // ---------------- the cast online (CHUNKY-169): without the model, the lines written for online, each once to each player, never the
  // story's, then a nod; with it, something new every time, put to them as someone who un-quit and by a quoted name. A's on a keyboard.
  {
    const L = TALK.online.lines;
    for (const [who, line] of [['coop', L.coop.first], ['coop', L.coop.back], ['coop', L.coop.any[0]], ['coop', L.coop.any[1]]]) {
      const d = await talkTo(a, who);
      check(`Coop says "${d?.say}" to A, with only Later. to press`, d?.say === line && d.opts.join() === 'Later.', d);
      await later(a);
    }
    const nodded = await talkTo(a, 'coop', { box: false });
    const dip = await until(async () => { const n = await on(a, () => __game.talk.nodding('coop')); return n > .05 ? n : null; }, 1500);
    const still = (await state(a)).prompt;
    check(`and once they've all been said, TALK opens nothing and he nods, ${dip ? (dip * 57.3).toFixed(0) : 0}°, with "${still}" still there`, !nodded && dip > .05 && !!still, { nodded, dip, still });
    await snap(a, '02-a-coop-nods');
    // and with the model back, something new, which is all he says now; then it's slow, and he nods with what he said up
    await scripted(a);
    a.script.push(JSON.stringify({ say: 'Still standing up straight, I see.', mood: 'plain', do: [{ meter: 'trust', by: 1 }], remember: 'Comes back a lot.', replies: ['Still here.', 'You too.', 'Barely.'] }));
    await on(a, () => __game.talk.on('http://localhost:65533/talk'));
    const own = await talkTo(a, 'coop');
    const asked = a.heard.at(-1)?.messages ?? [], sys = asked[0]?.content ?? '';
    check(`with the model back, Coop says something new: "${own?.say}", with A's answers and Later.`, own?.say === 'Still standing up straight, I see.' && own.opts.join() === 'Still here.,You too.,Barely.,Later.', own);
    check('and he was asked as someone who un-quit, by a quoted name, and "they"', sys.includes(TALK.online.them.replace('{name}', 'Junebug')) && !sys.includes(TALK.him) && asked.at(-1)?.content === '(They walk up to talk to you.)', { start: sys.slice(sys.indexOf('"Junebug"'), sys.indexOf('"Junebug"') + 120), last: asked.at(-1) });
    await a.page.locator('#dOpts button', { hasText: 'Barely.' }).first().click();
    const mid = await until(async () => { const s = await state(a), n = await on(a, () => __game.talk.nodding('coop')); return s.dialog && !s.dialog.waiting && n > .05 ? { ...s.dialog, opts: s.dialog.opts.map((o) => o.replace(/^\d\. /, '')), n } : null; }, 4000);
    check(`and when it's slow with nothing written left, what he said stays up with only Later. while he nods: "${mid?.say}"`, mid?.say === 'Still standing up straight, I see.' && mid.opts.join() === 'Later.', mid);
    check(`A's answer went as theirs: ${a.heard.at(-1)?.messages.at(-1)?.content}`, a.heard.at(-1)?.messages.at(-1)?.content === 'They say: "Barely."', a.heard.at(-1)?.messages.at(-1));
    // what he said warmed him to them, which is how he feels about them from then on, and he's told it
    const trusted = TALK.online.feel.trust[4].replace('{them}', 'them'), then = a.heard.at(-1)?.messages[0]?.content ?? '';
    check(`and his line warmed him to A, so the next ask told him "${trusted}", and the one before didn't`, !sys.includes(trusted) && then.includes(trusted), { before: sys.includes(trusted), after: then.includes(trusted) });
    await later(a);
    await on(a, () => __game.talk.on(null));
  }

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
  // and twelve beans is twelve beans: Chapter 1 doesn't end, since a town that's shared has no chapters
  {
    // every can of beans lying about, which aren't the loot's
    const back = await me(b), can = await on(b, () => { const c = __game.pickups.find((c) => !c.got); __game.S.beans = 11; return { x: c.x, z: c.z }; });
    await on(b, (c) => __game.place(c.x, c.z), can);
    const got = await until(() => on(b, () => (__game.S.beans >= 12 ? __game.S.beans : 0)), 3000);
    // the end card would come 1.4 s after the twelfth
    await sleep(2000);
    const after = await on(b, () => ({ mode: __game.S.mode, end: !document.getElementById('end').hidden, said: window.__seen.said, beans: document.getElementById('beans').textContent }));
    check(`B picks up a twelfth can (${got} beans), and that's all: no end card, still in town and nothing said, "${after.beans}"`, got >= 12 && !after.end && after.mode === 'town' && !after.said.length && after.beans === `Beans ${got}`, after);
    await on(b, ([x, z]) => __game.place(x, z), [back.x, back.z]);
  }

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
  // it's still rolling: out it gets, and it stops dead where A gets out, on A's phone. Out of one that's going, A dives out and rolls
  // (CHUNKY-168), and is up again before anything else.
  await a.page.keyboard.press('e');
  await until(async () => !(await state(a)).drive);
  await until(async () => (await state(a)).kind === 'run', 6000);
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
    // and out, and if it's still going A dives out of it and is up again first
    await a.page.keyboard.press('e'); await until(async () => !(await state(a)).drive);
    await until(async () => (await state(a)).kind === 'run', 6000);
  }
  // ---------------- out of it going 27 mph, A dives out and rolls (CHUNKY-168), and is lying down all the while on both phones, not
  // stood up sliding along the road
  {
    await on(a, (i) => { const G = __game, v = G.vehicles[i], side = v.K.width / 2 + .6; G.place(v.x - Math.cos(v.yaw) * side, v.z + Math.sin(v.yaw) * side); }, truck.i);
    await sleep(300);
    await a.page.keyboard.press('e'); await until(async () => (await state(a)).drive);
    await on(a, () => { __game.driving().f = 12; });
    await a.page.keyboard.press('e');
    const lying = await until(async () => {
      if ((await state(a)).kind !== 'roll') return null;
      const own = await bodyOf(a, A.id), seen = await bodyOf(b, A.id);
      return own?.up > 60 && seen?.up > 60 ? { own: own.up, seen: seen.up } : null;
    }, 3000);
    check(`A dives out of it going 27 mph and rolls, lying down while A does: ${lying ? `${lying.own.toFixed(0)}° over on A's phone and ${lying.seen.toFixed(0)}° on B's` : 'stood up'}`, !!lying, lying ?? { own: await bodyOf(a, A.id), seen: await bodyOf(b, A.id), kind: (await state(a)).kind });
    await until(async () => (await state(a)).kind === 'run', 8000);
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

  // ---------------- a try that ends: the story's own fever, lying where they went down for everyone else to see, and coming to by the
  // pumps with what they had
  {
    const went = await me(b), had = (await state(b)).beans;
    await record(b);
    await on(b, ([x, z]) => __game.die('blast', { x: x + 2, z }), [went.x, went.z]);
    const fever = await until(() => on(b, () => (__game.S.mode === 'fail' ? 'fail' : null)), 2000);
    const lying = await until(async () => { const s = await bodyOf(a, B.id); return s && s.up > 60 && away(s, went) < 1 ? s : null; }, 4000);
    check(`B's try ends in the fever, and A sees B lying where B went down, ${lying ? lying.up.toFixed(0) + '° off upright' : 'not at all'}`, fever === 'fail' && !!lying, { fever, lying: lying ?? await bodyOf(a, B.id) });
    await until(() => on(b, () => __game.S.mode === 'town' && __game.HP.kind === 'run'), 20000);
    const up = await cameIn(b);
    check(`B goes through the fever and nothing else of the story's: ${up.modes.join(' → ')}`, up.modes.join() === 'town,fail,town', up);
    check(`and comes to out front of the gas station, ${up.fromCoop.toFixed(1)} m from Coop, facing him to ${up.facing.toFixed(3)} radians, on their feet on dry ground and inside nothing`, up.fromCoop > 1 && up.fromCoop < 6.5 && up.facing < .05 && up.kind === 'run' && Math.abs(up.feet) < .1 && up.dry > .05 && !up.blocked, up);
    check(`with what they had, ${(await state(b)).beans} beans, and the objective box still empty: ${up.said.map((t) => `"${t}"`).join(' / ') || 'nothing'}`, (await state(b)).beans === had && !up.said.length, up);
    B = await me(b);
    await snap(b, '04-b-comes-to-by-the-pumps');
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

    // The game stands still while the big map's open, but nobody else does: B goes 30 m up the road, and without A shutting the
    // map it has B where B is now
    const still = (await state(a)).time, from = await me(b);
    await onRoad(b, from.x - 30, await on(b, (x) => __game.map.zAt('us_80', x), from.x - 30));
    const gone = await me(b);
    const blueAt = (at) => on(a, async ([x, z]) => {
      const { makeView, toScreen } = await import('./src/mapview.js'), c = __game.mapState().cam, g = document.getElementById('mapC').getContext('2d'), dpr = g.canvas.width / innerWidth;
      const [sx, sy] = toScreen(makeView(c.x, c.z, c.scale, 0, innerWidth, innerHeight), x, z), px = g.getImageData(Math.round(sx * dpr), Math.round(sy * dpr), 1, 1).data;
      return { x: sx, y: sy, rgb: [px[0], px[1], px[2]] };
    }, [at.x, at.z]);
    const blue = (d) => Math.abs(d.rgb[0] - 0x5b) < 30 && Math.abs(d.rgb[1] - 0x8c) < 30 && Math.abs(d.rgb[2] - 0xff) < 30;
    const followed = await until(async () => { const d = await blueAt(gone); return blue(d) ? d : null; }, 3000) ?? await blueAt(gone);
    check(`with A's map open, B goes 30 m up the road and A's map has them there: ${followed.rgb.join(',')}, while A's game stands still`, blue(followed) && (await state(a)).time === still && (await on(a, () => __game.mapState().open)), { followed, still, now: (await state(a)).time });

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

  // ---------------- coming back: out front of the gas station again, with what they had and not where they were standing, even when
  // that was in the river, which is where the owner came back under it
  {
    await on(a, () => { __game.S.beans = 5; __game.S.items.bottle = 2; });
    // out in the river well away from any bridge, and swimming
    const river = await on(a, () => {
      const G = __game, M = G.map, [tx, tz] = M.fromTrue(0, 0), bridges = M.crossings.filter((k) => k.with === 'river');
      const [x, z] = M.river.flat().filter(([x, z]) => M.inBounds(x, z) && Math.hypot(x, z) > 300 && bridges.every((k) => Math.hypot(k.x - x, k.z - z) > 90) && G.water.level(x, z) > G.floorAt(x, z) + .5)
        .sort((p, q) => Math.hypot(p[0] - tx, p[1] - tz) - Math.hypot(q[0] - tx, q[1] - tz))[0];
      G.place(x, z); return { x, z };
    });
    const swimming = await until(() => on(a, () => __game.HP.kind === 'swim'), 4000);
    const seenThere = await until(async () => { const s = await on(b, (id) => __net.link.others().find((o) => o.id === id), A.id); return s && away(s, river) < 3 ? s : null; }, 4000);
    await sleep(800);
    const left = await me(a);
    check(`A swims out into the river, and B's phone has them there, ${seenThere ? away(seenThere, river).toFixed(1) : '?'} m off`, swimming && !!seenThere, { river, left, seenThere });
    await a.page.reload({ waitUntil: 'load' }); await a.page.waitForFunction(() => window.__game && window.__game.resume);
    await on(a, () => __game.resume());
    await until(() => on(a, () => !!window.__net), 20000);
    // they've been before, so there's a way to change their look, which opens who they are with it filled in
    const again = await titleCard(a);
    check(`A comes back to "${again.play}" and ${again.look ? 'Change your look' : 'no Change your look'}, since they've been before`, again.play === 'Play' && again.look, again);
    await a.page.click('#changeLook');
    const filled = await until(() => on(a, () => { const j = document.getElementById('join'); return j && !j.hidden && { name: document.getElementById('joinName').value, look: [...j.querySelectorAll('.look')].findIndex((e) => e.getAttribute('aria-pressed') === 'true') }; }));
    check(`Change your look opens who they are with it filled in: "${filled?.name}" in look ${filled?.look}`, filled?.name === 'Junebug' && filled.look === rollLook('Junebug', LOOKS), filled);
    const NEW_LOOK = (rollLook('Junebug', LOOKS) + 3) % LOOKS;
    await a.page.click(`#join .look:nth-child(${NEW_LOOK + 1})`);
    await record(a);
    await a.page.click('#joinGo');
    const back = await cameIn(a);
    startsAtTheGasStation('A, coming back,', back);
    check(`and not in the river they left from, ${away(left, back).toFixed(0)} m off`, away(left, back) > 100, { left, back });
    const had = await state(a);
    check(`with what they had: ${had.beans} beans and ${had.items.bottle} bottles`, had.beans === 5 && had.items.bottle === 2, had);
    check(`and the objective box still never says a thing: ${back.said.length ? back.said.map((t) => `"${t}"`).join(' / ') : 'nothing'}`, !back.said.length, back);
    A = await me(a);
    check('and B sees them back', !!await until(async () => { const s = await on(b, (id) => __net.link.others().find((o) => o.id === id), A.id); return s && away(s, A) < 1 ? s : null; }), null);
    const looked = await until(() => on(b, (id) => __net.link.others().find((o) => o.id === id)?.look, A.id), 3000);
    check(`in the look they changed to, ${looked}`, looked === NEW_LOOK, { looked, NEW_LOOK });
    await snap(a, '07-a-back-at-the-gas-station');
    // and the time after that, Play takes them straight in as who they are, without asking
    await a.page.reload({ waitUntil: 'load' }); await a.page.waitForFunction(() => window.__game && window.__game.resume);
    await on(a, () => __game.resume());
    await until(() => on(a, () => !!window.__net), 20000);
    await record(a);
    await a.page.click('#together');
    const straight = await cameIn(a);
    check(`and the time after that, Play takes A straight in as ${straight.name} in look ${straight.look}, without asking who they are`, !straight.asked && straight.name === 'Junebug' && straight.look === NEW_LOOK, straight);
    startsAtTheGasStation('A, straight in,', straight);
    // and the cast remember them, which the town kept and the phone didn't: Coop's said everything written for them, so he nods
    {
      const nodded = await talkTo(a, 'coop', { box: false });
      const dip = await until(async () => { const n = await on(a, () => __game.talk.nodding('coop')); return n > .05 ? n : null; }, 1500);
      // and nothing of the game on its own's is touched: what the cast remember there, who's met them in the story, or how they feel about him
      const onPhone = await on(a, ([t, c]) => ({ talk: localStorage.getItem(`chunky.talk.v${t}`), people: localStorage.getItem(`chunky.people.v${c}`) }), [TALK.version, CAST.version]);
      check(`and Coop remembers A, from the town: with all he had written said, he nods, ${dip ? (dip * 57.3).toFixed(0) : 0}°, and none of it, nor the story's meeting him, is kept on A's phone`, !nodded && dip > .05 && !onPhone.talk && !onPhone.people, { nodded, dip, onPhone });
      // and how they feel about A came back from the town too: Coop warmer, and Miss Bobby a little cooler for it, as in the story
      const felt = await on(a, () => ['coop', 'bobby'].map((w) => __game.talk.mind(w).trust));
      check(`and so does how they feel about A: Coop's trust ${felt[0]}, and Miss Bobby's ${felt[1]} for it, as the story's tie has it`, felt[0] === 1 && felt[1] === -.5, felt);
    }
    // and back out on US 80, where there's room beside them for the hero
    await onRoad(a, spot.x, spot.z); await sleep(300); A = await me(a);
  }

  // ---------------- a trip from a mushroom ring (CHUNKY-176), as anyone else sees it: they sit down in it, and once they're down they
  // go in a ghost's dither, a block at a time, and their name with them. Nothing of them goes between the rings, on the screen or the
  // map. At the other ring they're there sitting, come back the same way, and get up. B eats in the ring at the gas station and picks
  // the nearest other one, with A standing by the first; then B eats there and comes back, with A still waiting.
  {
    const R = await on(b, () => __game.rings.list());
    const home = R.reduce((best, r, i) => (away(r, spot) < away(R[best], spot) ? i : best), 0);
    const there = R.reduce((best, r, i) => (i !== home && (best < 0 || away(r, R[home]) < away(R[best], R[home])) ? i : best), -1);
    // A 5 m off and to one side, looking at it, so that A's own back isn't between their camera and B
    await on(a, (r) => { const G = __game; G.place(r.x + 4, r.z + 3); G.look(Math.atan2(4, 3) + .2, .25); }, R[home]);
    // B eats in ring i and taps ring j on the map, while A keeps what it draws of B every frame: where B is and how, and B's body and name
    const trip = async (i, j, shot) => {
      // and A sees B standing in it before anything's kept, since getting there from a few metres off is a walk on A's screen
      await on(b, (r) => __game.place(r.x, r.z), R[i]);
      await until(() => on(a, ([id, r]) => { const w = __net.link.others().find((o) => o.id === id); return !!w && Math.hypot(w.x - r.x, w.z - r.z) < 1.5; }, [B.id, R[i]]), 4000);
      const ready = await until(() => on(b, () => document.getElementById('bA').textContent === 'EAT'), 4000);
      const watching = on(a, async ([id, ms]) => {
        const out = [], t0 = performance.now();
        while (performance.now() - t0 < ms) {
          await new Promise((r) => requestAnimationFrame(r));
          const w = __net.link.others().find((o) => o.id === id), s = __net.drawn().bodies.find((o) => o.id === id);
          out.push({ t: performance.now() - t0, x: w?.x, z: w?.z, how: w?.how, drawn: !!s, sit: s?.sit ?? 0, gone: s?.gone ?? 0, tag: __net.tags().some((o) => o.id === id) });
        }
        return out;
      }, [B.id, 6500]);
      await b.page.tap('#bA');
      await until(() => on(b, () => __game.mapState().open), 3000);
      const [x, y] = (await on(b, () => __game.rings.spots()))[j];
      await b.page.touchscreen.tap(x, y);
      // and on B's own screen, at the height of it, B's sat as they sit there and not gone: there it's the world that bends
      const own = await until(() => on(b, () => { const t = __game.rings.trip(), s = __net.drawn().bodies[0]; return t?.down > .9 ? { down: t.down, sit: s.sit ?? 0, gone: s.gone ?? 0 } : null; }), 3000);
      if (shot) { await sleep(shot.at); await snap(a, shot.name); }
      return { ready, own, frames: await watching };
    };
    const near = (f, r) => f.x !== undefined && Math.hypot(f.x - r.x, f.z - r.z) < 4;
    const between = (F) => F.filter((f) => f.x !== undefined && !near(f, R[home]) && !near(f, R[there])).length;
    // and where any that were between were, for the failure
    const whereBetween = (F) => F.filter((f) => f.x !== undefined && !near(f, R[home]) && !near(f, R[there])).slice(0, 4).map((f) => ({ t: Math.round(f.t), fromHome: +away(f, R[home]).toFixed(1), fromThere: +away(f, R[there]).toFixed(1), how: f.how, drawn: f.drawn }));
    const secs = (f) => (f ? `${(f.t / 1000).toFixed(2)} s` : 'never');

    const go = await trip(home, there, { at: 300, name: '08-b-going-from-a-ring' }), F = go.frames, atHome = F.filter((f) => near(f, R[home]));
    const sat = atHome.find((f) => f.drawn && f.sit > .95), first = atHome.find((f) => f.drawn && f.gone > .02), last = atHome.findLast((f) => f.drawn), arrived = F.find((f) => near(f, R[there]));
    check(`B eats in the ring at the gas station: EAT ${go.ready ? 'comes up' : 'never comes up'}`, !!go.ready, go.ready);
    check(`and on B's own screen they sit there, ${go.own ? go.own.sit.toFixed(2) : '?'}, and don't go, ${go.own?.gone ?? '?'}`, go.own && go.own.sit > .85 && go.own.gone === 0, go.own);
    check(`on A's screen B sits down in the ring, at ${secs(sat)}, before going, from ${secs(first)}`, !!sat && !!first && sat.t <= first.t, { sat, first });
    check(`and goes in the dither over ${first && last ? ((last.t - first.t) / 1000).toFixed(2) : '?'} s, all gone before B's at the other ring at ${secs(arrived)}`,
      !!first && !!last && !!arrived && last.t < arrived.t && last.t - first.t > 350 && last.t - first.t < 1100 && atHome.filter((f) => f.drawn && f.gone > .02 && f.gone < .98).length >= 3, { first, last, arrived });
    check('and B\'s name over them goes once they\'re more gone than not', atHome.some((f) => f.drawn && !f.gone && f.tag) && !F.some((f) => f.tag && (!f.drawn || f.gone > .5)), atHome.filter((f) => f.tag).length);
    check(`and nothing of B is ever between the rings on A's screen or map: ${between(F)} of ${F.length} frames`, !between(F) && !!arrived, whereBetween(F));

    const come = await trip(there, home, { at: 1950, name: '09-b-coming-back-to-a-ring' }), C = come.frames, back = C.filter((f) => near(f, R[home]));
    const shown = back.find((f) => f.drawn), whole = back.find((f) => f.drawn && !f.gone), up = back.find((f) => f.drawn && f.how !== 3 && !f.sit);
    check(`B shows at the ring by A sat and all but gone, ${shown ? `${shown.sit.toFixed(2)} and ${shown.gone.toFixed(2)}` : 'never'}`, !!shown && shown.sit > .95 && shown.gone > .8, shown);
    check(`and comes back in the dither while sat, all there at ${secs(whole)}`, !!whole && back.filter((f) => f.drawn && f.gone > .02 && f.gone < .98).every((f) => f.sit > .95) && whole.t - shown.t > 350 && whole.t - shown.t < 1100, { shown, whole });
    check(`and gets up once the trip's over, stood at ${secs(up)}`, !!up && up.t > whole.t, up);
    check(`and nothing of B is between the rings this way either: ${between(C)} of ${C.length} frames`, !between(C), whereBetween(C));
    B = await me(b);
  }

  // ---------------- what's broken is the same for everyone (CHUNKY-152). A, well away from the gas station, knocks a wall in,
  // a prop over and a tree down and sets a parked vehicle going, with B there: B sees each come down as it did, and the blast once, with
  // nothing hit twice. Whoever comes in later finds it all where it lies, and a day on, with nobody near, it's back up for everyone.
  // Nothing at a place that's set aside breaks at all.
  // somewhere well away from the gas station, so it heals once they're all back there: a parked vehicle with a house's wall in reach of
  // its blast, something standing and a tree a little further off, and two places to stand by it, dry and inside nothing
  const site = await on(a, async () => {
    const G = __game, W = G.wreck, { createAside } = await import('./src/aside.js'), aside = createAside(G.farm.data).world, gas = G.station.house;
    const standing = (v, r0, r1) => { for (let r = r0; r <= r1; r += 2) for (let k = 0; k < 16; k++) { const x = v.x + Math.cos(k * .3927) * r, z = v.z + Math.sin(k * .3927) * r, y = G.floorAt(x, z); if (y > G.water.level(x, z) + .1 && !G.blocked(x, z, y)) return { x, z }; } return null; };
    for (let i = 0; i < G.vehicles.length; i++) {
      const v = G.vehicles[i];
      if (Math.hypot(v.x - gas.wx, v.z - gas.wz) < 320 || aside(v.x, v.z) || v.wrecked) continue;
      const house = [...W.housesNear(v.x, v.z, 12)].find((s) => !aside(s.wx, s.wz) && W.damage.state(s).parts.some((p) => p.kind === 'wall' && Math.hypot(p.x - v.x, p.z - v.z) < 7));
      const prop = W.props.findIndex((p) => p.cx !== undefined && !p.down && p.kind !== 'bar' && Math.hypot(p.cx - v.x, p.cz - v.z) > 12 && Math.hypot(p.cx - v.x, p.cz - v.z) < 70 && !aside(p.cx, p.cz));
      const tree = W.trees(v.x, v.z, 70).find((t) => Math.hypot(t.x - v.x, t.z - v.z) > 12 && !aside(t.x, t.z));
      const at = [standing(v, 12, 20), standing(v, 22, 34)];
      if (!house || prop < 0 || !tree || !at[0] || !at[1]) continue;
      const wall = W.damage.state(house).parts.filter((p) => p.kind === 'wall').sort((p, q) => Math.hypot(p.x - v.x, p.z - v.z) - Math.hypot(q.x - v.x, q.z - v.z))[0];
      return { v: i, x: v.x, z: v.z, at, house: house.index, wall: wall.part, stop: wall.stop, prop, kind: W.props[prop].kind, tree: { x: tree.x, z: tree.z } };
    }
    return null;
  });
  check(`there's somewhere with a house, a parked vehicle, something standing and a tree to break${site ? `: a ${site.kind} and a tree` : ''}`, !!site, site);
  if (site) {
    await onRoad(a, site.at[0].x, site.at[0].z); await onRoad(b, site.at[1].x, site.at[1].z);
    await sleep(800);
    await watchBroken(b, site, 4000);
    await on(a, (s) => {
      const G = __game, W = G.wreck, house = G.structures[s.house];
      W.damage.hit(house, W.damage.state(house).parts[s.wall], 99, 1, 0);
      W.breakProp(W.props[s.prop], 0, 1);
      W.fellTree(W.trees(s.tree.x, s.tree.z, .3).find((t) => Math.abs(t.x - s.tree.x) < .06 && Math.abs(t.z - s.tree.z) < .06), 1, 0);
      W.explodeVehicle(G.vehicles[s.v]);
    }, site);
    await until(() => on(b, () => window.__broke.done), 6000);
    const seenB = await on(b, () => window.__broke);
    const [onA, onB] = [await brokenNow(a, site), await brokenNow(b, site)];
    check(`B sees the wall A knocked in, the ${site.kind} A knocked over, the tree A felled and the vehicle A set going all down: ${JSON.stringify({ wall: onB.wall, prop: onB.prop, tree: onB.treeDown, up: onB.up })}`, onB.wall && onB.prop && onB.treeDown && onB.up && onB.wrecked, onB);
    check(`each coming down in front of B as it did: the ${site.kind} falling and the tree going over through ${seenB.leans.length} angles`, seenB.fell && seenB.leans.length > 2, seenB);
    check(`and the vehicle going up there, with ${seenB.fires} fire${seenB.fires === 1 ? '' : 's'} where it went`, seenB.fires > 0, seenB);
    const worse = Object.entries(onB.hp).filter(([k, h]) => h < (onA.hp[k] ?? 1) - .05);
    check(`with what the blast did to the house only done once: ${onA.gone} parts down on A and ${onB.gone} on B, and none of B's worse off than A's`, !worse.length && onB.gone <= onA.gone + 1, { worse, a: onA.gone, b: onB.gone });
    await snap(b, '10-b-sees-what-a-broke');

    // and nothing at a place that's set aside, which here's the yard off True Light Rd, breaks for anyone
    const kept = await on(a, async () => {
      const G = __game, W = G.wreck, house = G.structures.find((s) => s.x > -1600 && s.x < -1490 && s.z > -830 && s.z < -745), wall = W.damage.state(house).parts.find((p) => p.kind === 'wall');
      G.place(house.wx + 12, house.wz + 12); await new Promise((r) => setTimeout(r, 300));
      const hit = W.strike(wall.x, wall.y, wall.z, 1.2, 99, 1, 0);
      W.damage.hit(house, wall, 99, 1, 0); W.blast(wall.x, wall.y, wall.z, 8, 9);
      return { house: house.index, hit, touched: W.damage.read(house).parts.length };
    });
    check(`nothing's broken at a place that's set aside, by a swing, a blow or a blast: ${kept.touched} parts touched`, !kept.hit && !kept.touched, kept);
    await sleep(800);
    check('and nothing from there comes to B', !(await on(b, (i) => __game.wreck.damage.has(__game.structures[i]), kept.house)), kept);
    // and A back out on US 80, where there's room beside them for the hero, who comes in late and finds it all where it lies
    await onRoad(b, B.x, B.z);
  }
  await onRoad(a, spot.x, spot.z); await sleep(300); A = await me(a); B = await me(b);

  // ---------------- the hero's link: everyone sees the hero, and only one phone at a time is him
  const c = await serveAndOpen({ viewport: { width: 390, height: 844 }, query: `${query}#hero=${HERO}` });
  pages.push(c);
  {
    const kept = await on(c, () => ({ hash: location.hash }));
    check('the hero\'s link comes off the address as soon as it\'s read', !kept.hash.includes('hero'), kept);
    await on(c, () => __game.resume());
    await c.page.click('#together'); await c.page.click('#joinName'); await c.page.keyboard.type('River');
    await record(c);
    if (site) await watchBroken(c, site, 3000);
    await c.page.click('#joinGo');
    const Cin = await cameIn(c);
    startsAtTheGasStation('The hero', Cin);
    check(`and his objective box never says a thing either, since a town that's shared has no chapters: ${Cin.said.map((t) => `"${t}"`).join(' / ') || 'nothing'}`, !Cin.said.length, Cin);
    // and what A broke while he wasn't there is all down, just where it lies: nothing falls and nothing goes up as he comes in
    if (site) {
      await until(() => on(c, () => window.__broke.done), 4000);
      const [onC, seenC] = [await brokenNow(c, site), await on(c, () => window.__broke)];
      check(`coming in late, the hero finds the wall, the ${site.kind}, the tree and the vehicle A broke all down`, onC.wall && onC.prop && onC.treeDown && onC.up, onC);
      check(`where they lie, with nothing falling, the tree already over (${seenC.leans.join(', ') || 'a stump'}) and no fire`, !seenC.fell && seenC.leans.every((l) => l > 1.4) && !seenC.fires, seenC);
    }
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
    check(`with his name over him: "${tag?.text}"`, tag?.text === 'River', tag);
    // and he carries and swings what he's got as he does on his own screen (CHUNKY-172): the skillet at his right thigh between swings and in
    // his right hand with his left out for balance as he swings it, and the bat over his right shoulder and swung in both hands. Every frame
    // A draws of him has to be one his own screen draws, his fists to a centimetre, so the two can't drift apart whatever a swing's made to
    // look like. He's drawn twelve times a second, so a swing, which is .46 s, shows five or six of its six drawings, depending on where in a
    // twelfth it starts, and each screen starts it somewhere different. So what his own screen draws is every drawing it shows of a swing
    // started at each 120th through a twelfth, on a page of its own with its clock held. Where a swing lands isn't said, so those land on nothing.
    const ownPage = await serveAndOpen({ viewport: { width: 390, height: 844 } }), hisOwn = await ownPage.page.evaluate(() => {
      const G = __game, T = 1 / 120, fists = () => G.hero.arms.map((A) => A.fist.position.toArray()), out = {};
      G.pause(); G.jump('town'); G.S.flags.town = true; G.S.flags.ended = G.S.flags.arrived = true;
      let now = G.sim(.1, T).time;
      for (const bat of [false, true]) {
        G.S.flags.bat = bat; now = G.sim(.4, T).time;
        const rest = fists(), swing = []; let landed = false;
        for (let k = 0; k < 10; k++) {
          while (Math.round(now * 120) % 10 !== k) now = G.sim(T, T).time;
          G.key('f', true); G.sim(T, T); G.key('f', false);
          for (let i = 0; i < 72; i++) { now = G.sim(T, T).time; swing.push({ hands: fists() }); landed ||= !!G.skillet.lands(); }
        }
        out[bat ? 'bat' : 'pan'] = { rest: { hands: rest }, swing, landed };
      }
      G.S.flags.bat = false;
      return out;
    });
    await ownPage.close();
    const same = (f, g) => f.hands.every((h, i) => Math.hypot(h[0] - g.hands[i][0], h[1] - g.hands[i][1], h[2] - g.hands[i][2]) < .01);
    const drawings = (frames, rest) => frames.filter((f) => !same(f, rest)).reduce((list, f) => (list.some((g) => same(f, g)) ? list : [...list, f]), []);
    for (const [tool, { rest, swing, landed }] of Object.entries(hisOwn)) check(`his own screen, a frame at a time, draws the swing of the ${tool === 'bat' ? 'bat' : 'skillet'} in ${drawings(swing, rest).length} drawings, landing on nothing`, drawings(swing, rest).length >= 6 && !landed, { landed });
    const watched = () => on(a, () => new Promise((done) => {
      const got = [], t0 = performance.now();
      (function look() { const h = __net.drawn().hero; if (h) got.push({ pan: h.pan, bat: h.bat, hands: h.hands }); if (performance.now() - t0 < 1600) requestAnimationFrame(look); else done(got); })();
    }));
    await c.page.keyboard.press('f');
    // What A drew of a swing: the frames that aren't him at rest, which of his own screen's drawings each one is, any his screen never draws, and
    // him at rest after as he is on his own. A phone draws him at most every twelfth of a second, and only on a frame it draws at all, so a slow
    // one shows fewer of a swing's six drawings, as it would of his own. More than one shows it going through a swing and not stuck on one.
    const mirrored = (seen, { rest, swing }) => {
      const his = drawings(swing, rest), drawn = seen.filter((f) => !same(f, rest)), which = drawn.map((f) => his.findIndex((g) => same(f, g)));
      return { drawn, which: which.join(' '), drawings: new Set(which.filter((i) => i >= 0)).size, odd: drawn.filter((_, i) => which[i] < 0), rest: same(seen.at(-1), rest), last: seen.at(-1) };
    };
    const right = (f) => f.hands[0].map((v) => v.toFixed(2)).join(', '), thigh = (f) => f.pan && !f.bat && f.hands[0][0] < -.25 && f.hands[0][1] < -.45;
    check(`A sees him carry the skillet at his right thigh, with his right hand at ${right(seen)}`, thigh(seen), seen);
    let swung = watched();
    let frames = await swung, m = mirrored(frames, hisOwn.pan), out = m.drawn.filter((f) => f.hands[1][0] > .65 && f.hands[1][1] > -.4);
    check(`and A sees him swing the skillet as his own screen draws it, ${m.drawn.length} frames of ${frames.length} in ${m.drawings} of its drawings and ${m.odd.length} it never draws, his left out for balance in ${out.length}, and at his thigh after as he is on his own`, m.drawings > 1 && !m.odd.length && out.length > 3 && m.rest && frames.every((f) => f.pan && !f.bat) && thigh(m.last), { which: m.which, odd: m.odd.slice(0, 2), last: m.last, his: hisOwn.pan.rest });
    await snap(a, '06-a-sees-the-hero');
    // and on everyone else's map he's in the orange of his own arrow, a way up the road so that A's arrow isn't over him
    // and with the bat, it's over his right shoulder between swings, and swung in both hands across him
    await on(c, () => { __game.S.flags.bat = true; });
    await sleep(600);
    const shoulder = (await drawn(a)).hero;
    check(`with the bat, A sees it over his right shoulder, with his right hand at ${right(shoulder)}`, shoulder?.bat && !shoulder.pan && shoulder.hands[0][0] < -.1 && shoulder.hands[0][1] > -.25, shoulder);
    swung = watched();
    await c.page.keyboard.press('f');
    frames = await swung; m = mirrored(frames, hisOwn.bat); const across = m.drawn.filter((f) => f.hands[0][0] > -.2 && f.hands[1][0] < .45);
    check(`and A sees him swing it as his own screen draws it, ${m.drawn.length} frames of ${frames.length} in ${m.drawings} of its drawings and ${m.odd.length} it never draws, both fists across him in ${across.length}, and back over his shoulder after as he is on his own`, m.drawings > 1 && !m.odd.length && across.length > 3 && m.rest && frames.every((f) => f.bat && !f.pan) && m.last.hands[0][1] > -.25, { which: m.which, odd: m.odd.slice(0, 2), last: m.last, his: hisOwn.bat.rest });
    await snap(a, '06-a-sees-the-hero-with-the-bat');
    await on(c, () => { __game.S.flags.bat = false; });
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
    const hd = await on(a, (id) => __net.dotOnMap(id), C.id), named = said.find((w) => w.text === 'River' && w.fill === '#ec803a'), dees = said.filter((w) => w.text === 'Dee');
    const put = !dees.length ? 'is left out' : hd && dees.every((w) => w.x1 <= hd.x) ? 'goes to the other side' : 'stays where it was';
    check(`B stands on the hero and his name keeps its place, and B's ${put}`, away(await seenOnA(B.id) ?? {}, H) < 1 && !!hd && !!named && Math.abs(named.x0 - hd.x - 11) < 1.5 && dees.every((w) => !meets(w, named) && !meets(w, dotBox(hd))), { hd, named, dees });
    await a.page.keyboard.press('Escape');
    await until(() => on(a, () => !__game.mapState().open));
    // and by the gas station, where the story would start him on Coop's bag, there's nothing for him either, and his beans are a count
    await onRoad(c, spot.x + 3, await on(c, (x) => __game.map.zAt('us_80', x), spot.x + 3));
    await sleep(600);
    const his = await on(c, () => ({ said: window.__seen.said, beans: document.getElementById('beans').textContent }));
    check(`and by the gas station the hero's objective box is still empty, and his beans are just a count: "${his.beans}"`, !his.said.length && /^Beans \d+$/.test(his.beans), his);
    // and the cast know him: no first-time line for the hero, but Coop's for him, and Rocky's for coming back, and with the model on,
    // he's asked about as the story has him, and as "he"
    {
      const L = TALK.online.lines;
      for (const [who, line, name] of [['coop', L.coop.hero, 'Coop'], ['rocky', L.rocky.back, 'Rocky']]) {
        const d = await talkTo(c, who);
        check(`${name} says "${d?.say}" to the hero`, d?.say === line && d.opts.join() === 'Later.', d);
        await later(c);
      }
      await scripted(c);
      c.script.push(JSON.stringify({ say: 'There he is.', mood: 'plain', do: [], remember: '', replies: ['Here I am.'] }));
      await on(c, () => __game.talk.on('http://localhost:65533/talk'));
      const own = await talkTo(c, 'bobby');
      const asked = c.heard.at(-1)?.messages ?? [], sys = asked[0]?.content ?? '';
      check(`and with the model on, Miss Bobby says "${own?.say}", asked about the hero as the story has him`, own?.say === 'There he is.' && sys.includes(TALK.him) && !sys.includes(TALK.online.them.split('. ')[1]) && asked.at(-1)?.content === '(He walks up to talk to you.)', { say: own?.say, last: asked.at(-1) });
      await later(c);
      await on(c, () => __game.talk.on(null));
    }

    const d = await serveAndOpen({ viewport: { width: 390, height: 844 }, query: `${query}#hero=${HERO}` });
    pages.push(d);
    await on(d, () => __game.resume());
    await d.page.click('#together'); await d.page.click('#joinName'); await d.page.keyboard.type('River'); await d.page.click('#joinGo');
    await until(async () => (await me(d)).id, 10000);
    const told = await until(() => on(c, () => !document.getElementById('join').hidden && document.getElementById('joinSay').textContent), 4000);
    check(`the hero on a second phone takes over, and the first is told: "${told}"`, /hero on another phone/.test(told ?? ''), told);
    // it's who's in town that says, and not who's drawn near A
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
      // the name and the look go to any town, so Play takes them straight in there too
      await until(() => on(c, () => !!window.__net), 20000);
      await c.page.click('#together');
      const there = await until(() => on(c, () => window.__net?.you().id ? __net.you() : null), 10000);
      check(`a link to another town doesn't take the hero's secret there: "${there?.name}" is ${there?.hero ? 'the hero' : 'a townsperson'} in it`, there && !there.hero, there);
      const keys = await on(c, () => Object.keys(localStorage).filter((k) => k.startsWith('chunky.net.key')).map((k) => localStorage.getItem(k)));
      check(`and the phone is someone else there, with a key of its own: ${keys.length} kept`, keys.length === 2 && keys[0] !== keys[1], keys.length);
    } finally {
      // let go of the other town before it's put away, so nothing's left trying to reach it
      await on(c, () => window.__net?.link?.close()).catch(() => {});
      await elsewhere.close();
    }

    // ---------------- a day after A broke it all, with A, B and the hero by the gas station, well away, it's back for everyone: the
    // house as it was built and stopping them again, the prop standing, the tree up and the vehicle back where it was parked, whole
    if (site) {
      for (const p of [a, b, d]) await onRoad(p, spot.x + (p === d ? 6 : p === b ? -6 : 0), await on(p, (x) => __game.map.zAt('us_80', x), spot.x));
      await sleep(1500);
      clock.at += DAY + 60000;
      const healed = await until(async () => (await Promise.all([a, b, d].map((p) => brokenNow(p, site)))).every((w) => !w.held && !w.prop && !w.treeDown && !w.up), 15000);
      for (const [name, p] of [['A', a], ['B', b], ['the hero', d]]) {
        const w = await brokenNow(p, site);
        check(`a day later it's all back for ${name}: the house as it was built and the wall stopping them again (${w.stops?.toFixed(1)}), the ${site.kind} standing, the tree up, and the vehicle where it was parked ${w.home.toFixed(2)} m off, whole`,
          !!healed && !w.held && !w.wall && w.stops > -1e8 && !w.prop && w.propStops && !w.treeDown && !w.up && !w.wrecked && w.home < .05 && w.whole, w);
      }
    }
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
