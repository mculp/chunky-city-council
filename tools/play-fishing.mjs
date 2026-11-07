// Coop's fishing hole (CHUNKY-163), on a phone-sized page with real taps and a real finger on A: the counter whenever the chapter needs him,
// and his round by the clock in Mississippi once it's done; Jev deciding what he comes up with through the talk server's /decide, by that
// server's own rules, and nothing coming of it while Jev's off; him bringing it up with the place named by code, over anything new the
// talk server has for him; "I'll be there." and "Not tonight."; the objective and its arrow; GONE FISHIN' on the door and him at the hole
// at nine; the spare rod and worms; a cast, the bite, the hook and reeling in against the strain to land a catfish he carries; him packing
// up at ten, going the next night too, and the next idea lapsing without him; what's kept after a reload; and in a town that's shared, the
// counter. The clock only goes forward, as it does for a player, since he thinks a thing over once a day.
//
//   npm i && npm run fishing [-- --shots dir]
import { mkdirSync, readFileSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';
import { startServer } from '../server/index.js';
import { PHONE_KEY } from '../src/net.js';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(40); } };
const QUESTS = JSON.parse(readFileSync(new URL('../data/quests.json', import.meta.url), 'utf8')), T = QUESTS.templates.fishing, J = QUESTS.jev;
const PHONE = { touch: true, viewport: { width: 390, height: 844 } };
// a time on the clock in Mississippi in November 2026, six hours behind: '11-10 21:30' is a Tuesday night
const ms = (when) => { const [, mo, d, h, mi] = /^(\d+)-(\d+) (\d+):(\d+)$/.exec(when).map(Number); return Date.UTC(2026, mo - 1, d, h + 6, mi); };
const BRIDGE = { shape: 'fishing', place: 0, worth: true }, TRESTLE = { shape: 'fishing', place: 1, worth: true };
const ASK = (place) => T.lines.ask.replace('{place}', place);

// The town on this machine, with the talk server's own rules for /talk and /decide: the canned line for anything new anyone says, and
// for what Jev decides, the next of `decisions`, with what it was asked kept in `decided`. With none left, Jev's off.
const decided = [], decisions = [];
const town = await startServer({ port: 0, quiet: true, talk: { decide: (asked) => { decided.push(asked); return decisions.shift() ?? { quiet: 'off' }; } } });
const TALK_AT = `http://localhost:${town.port}/talk`;

let page, errors, close, g, cdp, sent;
async function open(how) {
  ({ page, errors, close } = await serveAndOpen(how));
  g = (fn, arg) => page.evaluate(fn, arg);
  cdp = await page.context().newCDPSession(page);
  // what the phone sent, its key and all
  sent = [];
  page.on('request', (r) => { if (r.url().endsWith('/decide')) sent.push(JSON.parse(r.postData())); });
}
async function shut() { check('no console errors', !errors.length, errors); await close(); }
const snap = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); };
const helpers = () => g((talkAt) => {
  const G = window.G = __game; G.pause(); G.jump('town'); G.S.flags.town = true; G.S.flags.arrived = true; G.S.beans = 0; G.step(.1);
  G.talk.on(talkAt);
  document.getElementById('card').style.display = 'none';
  window.clockTo = (t) => { G.churchSigns.clock(t); G.step(.2); };
  // somewhere to stand beside him at a hole, to one side or the other or back from the water, on the bank or on a trestle's platform
  window.dry = (x, z) => G.floorAt(x, z) >= G.water.level(x, z) - .1;
  window.beside = (h, spots) => {
    const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw), rx = Math.cos(h.yaw), rz = -Math.sin(h.yaw);
    for (const [r, f] of spots) { const x = h.x + rx * r + fx * f, z = h.z + rz * r + fz * f; if (dry(x, z)) return { x, z }; }
    return null;
  };
  // from well away, somewhere he can stand, which out on a trestle is along its deck, then up to Coop wherever he is: beside him at the
  // counter, and back from the water at a hole
  window.nearCoop = () => {
    const c = G.coop.state(), h = c.at === 'hole' ? G.coop.hole(c.place) : null, far = G.talk.AWAY + 5;
    const to = h ? beside(h, [[0, -1.2], [1, -.4], [-1, -.4]]) : { x: c.x + 1.5, z: c.z };
    for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2, x = c.x + Math.sin(a) * far, z = c.z + Math.cos(a) * far; if (dry(x, z)) { G.place(x, z); break; } }
    G.step(.05); G.place(to.x, to.z); G.step(.1);
  };
  window.seen = () => { const d = G.state().dialog; return d && !d.waiting ? { ...d, opts: d.opts.map((o) => o.replace(/^\d\. /, '')) } : null; };
  // From the pumps, looking at the store normally: the sign has to read without posing the camera in front of it.
  window.atDoor = () => { const d = G.coop.door(); G.place(G.places.gas.x + 53, G.places.gas.z + 12.5); G.player.yaw = Math.atan2(-d.nx, -d.nz); G.look(Math.atan2(d.nx, d.nz), .12); G.step(1); };
}, TALK_AT);
const clockTo = (when) => g((t) => clockTo(t), ms(when));
// the next time he looks at what he's thinking over, which is every ten seconds, and long enough for Jev to answer
const look = async () => { const was = decided.length; await g(() => G.sim(10.5)); if (await until(() => decided.length > was, 1500)) await sleep(250); };
const talkToCoop = async () => { await g(() => nearCoop()); await page.tap('#bA'); await g(() => G.step(.05)); return until(() => g(() => seen()), 3000); };
const tapOpt = async (text) => { await page.locator('#dOpts button', { hasText: text }).first().tap(); await g(() => G.step(.05)); return g(() => seen()); };
const touchA = async (type) => { const b = await page.locator('#bA').boundingBox(); await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] }); };
const button = () => page.locator('#bA').textContent();
const news = () => g(() => G.coop.news());

// ---------------- the story, with the clock held
await open(PHONE);
await helpers();

// every fishing hole on the list, as it'd be stood at: a trestle's platform halfway over, where a train goes by clear of him as the trains
// check has it, and anywhere else dry ground on the bank, well clear of the railroad; and a cast from each that lands on the water
const FISHING_PLACES = JSON.parse(readFileSync(new URL('../data/places.json', import.meta.url), 'utf8')).places.filter((p) => p.shapes.includes('fishing'));
const banks = await g((places) => places.map(({ id, kind }) => {
  const h = G.coop.hole(id), f = G.floorAt(h.x, h.z), T = G.trains.TRESTLES.reduce((a, b) => (Math.hypot(b.rx - h.x, b.rz - h.z) < Math.hypot(a.rx - h.x, a.rz - h.z) ? b : a));
  return { id, kind, onTrestle: G.trains.onTrestle(h.x, h.z), platform: Math.hypot(h.x - T.rx, h.z - T.rz) < G.trains.TRESTLE.refuge, raised: f - G.groundH(h.x, h.z), above: f - G.water.level(h.x, h.z), rail: Math.min(G.map.railGrid.nearest(h.x, h.z), 999), cast: h.to?.d ?? 0 };
}), FISHING_PLACES.map(({ id, kind }) => ({ id, kind })));
const clear = await g(() => G.trains.TRESTLE.refugeOut);
const trestles = banks.filter((b) => b.kind === 'trestle'), bad = banks.filter((b) => b.cast < 3 || b.above < .1 || (b.kind === 'trestle' ? !b.platform || b.rail < clear : b.onTrestle || b.raised > .05 || b.rail <= 6));
check(`every fishing hole on the list is somewhere to stand, with a cast that lands: ${trestles.length} on a trestle's platform halfway over, ${Math.min(...trestles.map((b) => b.rail)).toFixed(1)} m from the middle of the track at the closest, and ${banks.length - trestles.length} on dry ground on the bank, none of them within 6 m of the railroad`, banks.length === FISHING_PLACES.length && trestles.length === 3 && !bad.length, bad);

// a Friday, in Chapter 1
await clockTo('11-06 03:00');
let c = await g(() => G.coop.state());
check(`through Chapter 1 he's behind his pumps whatever the clock says, at 3 in the morning too: ${c.at}`, c.at === 'counter' && !c.away && c.solid && !c.signShown, c);
await look();
check('and he thinks nothing over', decided.length === 0 && !sent.length, decided);

// Saturday, once it's done
await g(() => { G.S.flags.ended = true; });
await clockTo('11-07 01:10');
const w1 = await g(() => G.coop.state());
await clockTo('11-07 01:15');
const w2 = await g(() => G.coop.state()), way = await g(() => [G.coop.way(0), G.coop.way(.5)]);
const along = (p) => Math.hypot(p.x - way[0].x, p.z - way[0].z);
check(`once it's done, at 1:10 he's out on his walk along US 80 toward the river bridge, and further along by 1:15: ${along(w1).toFixed(0)} m, then ${along(w2).toFixed(0)} m of ${along(way[1]).toFixed(0)}`, w1.at === 'walk' && w2.at === 'walk' && along(w2) > along(w1) + 50 && along(w2) < along(way[1]) && w1.sign === 'BACK AT 6', { w1, w2 });
await until(() => sent.length > 0, 2000); await sleep(250);
check(`on his walk he thinks something over, which asks Jev, and with Jev off nothing comes of it: asked ${decided.length} time`, decided.length === 1 && sent.length === 1 && !(await news()), decided.length);
await clockTo('11-07 03:00');
c = await g(() => G.coop.state());
const home = await g(() => G.coop.home());
await g((h) => { G.place(h.x + 1.5, h.z); G.step(.1); }, home);
const act = await g(() => G.S.act);
check(`at 3 he's asleep in the back, with BACK AT 6 on the door and nobody to talk to at his spot: ${c.at}, "${c.sign}", ${act}`, c.at === 'asleep' && c.away && c.signShown && c.sign === 'BACK AT 6' && !c.solid && act !== 'Talk to Coop', { c, act });
await g(() => atDoor());
const sign = await g(() => G.coop.door());
check('BACK AT 6 is wholly in view from the pumps, at a readable size above the controls', sign.edges.every((e) => e.depth < 1 && e.x > 8 && e.x < 382) && Math.abs(sign.edges[1].x - sign.edges[0].x) > 50 && sign.screen.y > 180 && sign.screen.y < 600, sign);
await snap('1-back-at-6');
await look(); await look();
check(`with Jev off he's asked once more, an hour or more later, and then not again that day: asked ${decided.length} times`, decided.length === 2 && !(await news()), decided.length);
// stood on his spot behind the counter when he comes back at six, he waits, and there's nothing of him there to be stuck in
await g((h) => { G.place(h.x, h.z); G.step(.1); }, home);
await clockTo('11-07 06:00');
c = await g(() => G.coop.state());
check(`stood where he stands when he's back at six, Coop isn't in yet, and there's nothing of him to run into: ${c.at}, ${c.away ? 'not in' : 'in'}`, c.at === 'counter' && c.away && !c.solid, c);
const offSpot = await g((h) => {
  for (const [x, y] of [[0, 1], [1, 0], [0, -1], [-1, 0], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]]) {
    G.place(h.x, h.z); G.step(.05); G.stick(x, y); G.step(1); G.stick(0, 0); G.step(.05);
    const d = Math.hypot(G.player.pos.x - h.x, G.player.pos.z - h.z);
    if (d > 1.3) return d;
  }
  return 0;
}, home);
c = await g(() => G.coop.state());
check(`he can walk off it, and once he has, Coop's in behind his counter: ${offSpot.toFixed(1)} m off`, offSpot > 1.3 && c.at === 'counter' && !c.away && c.solid && Math.hypot(c.x - home.x, c.z - home.z) < .01, { offSpot, c });

// Sunday
await clockTo('11-08 10:30');
c = await g(() => G.coop.state());
check(`on Sunday morning he's at church, with BACK AT NOON on the door: ${c.at}, "${c.sign}"`, c.at === 'church' && c.away && c.sign === 'BACK AT NOON', c);
await clockTo('11-08 12:00');
c = await g(() => G.coop.state());
check(`and at noon he's back at the counter: ${c.at}`, c.at === 'counter' && c.solid && !c.signShown && Math.hypot(c.x - home.x, c.z - home.z) < .01, c);

// Monday, talked to as it comes time for his walk, he stays at the counter till they're done
await clockTo('11-09 00:59');
const talking = await talkToCoop();
await clockTo('11-09 01:05');
c = await g(() => G.coop.state());
check(`talked to as it comes time for his walk, he stays till they're done: ${c.at}`, !!talking && c.at === 'counter' && c.solid && !c.away && Math.hypot(c.x - home.x, c.z - home.z) < .01, { talking, c });
await tapOpt('Later.');
await clockTo('11-09 01:05');
c = await g(() => G.coop.state());
check(`and then he goes: ${c.at}`, c.at === 'walk', c);

// Tuesday, the day's idea, from Jev
decisions.push(TRESTLE);
const asks = decided.length;
await clockTo('11-10 08:00');
await look();
const idea = await until(news, 4000), asked = decided.at(-1);
check(`at his first look of the day he thinks of something and asks Jev, in plain words with no name in them, and the places by name: "${asked?.state}" ${JSON.stringify(asked?.places)}`, decided.length === asks + 1 && PHONE_KEY.test(sent.at(-1)?.phone ?? '') && asked.state === `${J.coop} ${J.trips[0]}` && JSON.stringify(asked.shapes) === '["fishing"]' && JSON.stringify(asked.places) === '["under the US 80 bridge, east of town: fishing","the near trestle: fishing"]', { asked, sent: sent.at(-1) });
check(`and it's the near trestle, which he's yet to tell him about: ${idea?.say} ${idea?.at?.id}`, idea?.say === 'ask' && idea.at.id === 'trestle-near', idea);
let d = await talkToCoop();
check(`he brings it up, with the place named by code, and the answers are "I'll be there." and "Not tonight.": "${d?.say}" ${d?.opts.join(' | ')}`, d?.say === ASK('the near trestle') && d.opts.join(' | ') === `${T.answers.yes} | ${T.answers.no} | Later.`, d);
await snap('2-he-brings-it-up');
d = await tapOpt(T.answers.no);
check(`"Not tonight.", and he says the offer's good three nights: "${d?.say}"`, d?.say === T.lines.no && d.opts.join() === 'Later.', d);
await tapOpt('Later.');
d = await talkToCoop();
check(`talking to him again, it's whatever he has to say now, with both answers still there: "${d?.say}" ${d?.opts.join(' | ')}`, d && d.say !== ASK('the near trestle') && d.opts.includes(T.answers.yes) && d.opts.includes(T.answers.no) && d.opts.at(-1) === 'Later.', d);
d = await tapOpt(T.answers.yes);
check(`"I'll be there.": "${d?.say}"`, d?.say === T.lines.yes, d);
await tapOpt('Later.');
const hole = await g(() => G.coop.hole('trestle-near'));
let s = await g(() => ({ obj: G.state().obj, pointer: G.pointer }));
check(`then he's to go fishing with Coop at nine, with the arrow on the trestle: "${s.obj}"`, s.obj === 'Go fishing with Coop at nine · the near trestle' && s.pointer.on, s);
await snap('3-objective');

// nine o'clock
await clockTo('11-10 21:02');
c = await g(() => G.coop.state());
check(`at nine GONE FISHIN' goes on the door, and he's on his way: ${c.at}, "${c.sign}"`, c.at === 'away' && c.away && c.sign === 'GONE FISHIN\'' && c.signShown, c);
if (shots) { await g(() => atDoor()); await snap('4-gone-fishin'); }
await clockTo('11-10 21:30');
c = await g(() => G.coop.state());
check(`at half past he's at the hole, with his rod out and his bobber on the water: ${c.at} ${c.place}`, c.at === 'hole' && c.place === 'trestle-near' && c.rod && c.bobber && c.line && Math.hypot(c.x - hole.x, c.z - hole.z) < .01, c);
const trustWas = await g(() => G.people.get('coop', 'trust'));
d = await talkToCoop();
let gear = await g(() => G.fishing.gear());
check(`he hands over the spare rod and worms: "${d?.say}", ${JSON.stringify(gear)}`, d?.say === T.lines.came && gear.rod === 1 && gear.worms === T.reward.worms, { d, gear });
const trust = await g(() => G.people.get('coop', 'trust')), notes = await g(() => G.talk.mind('coop').notes.map((n) => n.text));
check(`and he trusts him more for coming, and remembers it: ${trustWas} to ${trust}, "${notes.at(-1)}"`, trust === trustWas + T.reward.trust && notes.at(-1) === T.notes.came.replace('{place}', 'the near trestle'), { trust, notes });
await tapOpt('Later.');
s = await g(() => G.state().obj);
check(`then he's to catch one: "${s}"`, s === 'Catch a catfish', s);

// fishing, beside him on the bank
await g((h) => { const to = beside(h, [[2, 0], [-2, 0], [1, -.4], [-1, -.4]]); G.place(to.x, to.z); G.player.yaw = h.yaw; G.look(h.yaw + Math.PI, .25); G.step(.2); }, hole);
s = await g(() => ({ act: G.S.act, mode: G.S.mode, rod: G.fishing.shown().rod }));
check(`facing the water beside him with his rod, it's for casting: ${s.act}, "${await button()}", rod ${s.rod}`, s.mode === 'town' && s.act === 'Cast' && (await button()) === 'CAST' && s.rod, s);
await page.tap('#bA'); await g(() => G.step(1.5));
let v = await g(() => ({ ...G.fishing.view(), shown: G.fishing.shown(), act: G.S.act }));
check(`a tap casts, and the bobber's out on the water on a line: ${v.state}, ${v.out} m out, "${await button()}"`, v.state === 'waiting' && v.out >= 3 && v.shown.bobber && v.shown.line && v.act === 'Reel in' && (await button()) === 'REEL', v);
const waiting = await g(() => ({ tip: G.fishing.tip(), seen: G.fishing.seen() }));
check('beside Coop, the bobber is clear of him, the hood, the deck and the controls', waiting.seen.clear && waiting.seen.screen.depth < 1 && waiting.seen.screen.y > 180 && waiting.seen.screen.y < 600 && waiting.seen.pixels >= 6, waiting);
await snap('5-cast');
let t = 0;
while ((await g(() => G.fishing.view().state)) === 'waiting' && t < 15) { await g(() => G.step(.1)); t += .1; }
v = await g(() => G.fishing.view());
check(`then something takes it, and the bobber goes under: ${v.state} after ${t.toFixed(1)} s`, v.state === 'bite' && v.under === 1, v);
const bite = await g(() => { G.step(.1); const v = G.fishing.seen(); return { ...v, tip: G.fishing.tip(), rings: G.fishing.rings(), water: G.water.level(v.world[0], v.world[2]), flash: document.getElementById('bA').classList.contains('bite') && document.getElementById('prompt').classList.contains('bite') }; });
check('the bite pulls the bobber under, dips the rod tip and lights the control, with a ring where it went', bite.world[1] < bite.water - .15 && bite.tip[1] < waiting.tip[1] - .5 && bite.flash && bite.rings.length >= 1, bite);
const rings = await g(() => { G.step(.36); return G.fishing.rings(); });
check('a second ring makes the bite visible on the water, not just audible', rings.length >= 2, rings);
await snap('6-bite');
await page.tap('#bA'); await g(() => G.step(.05));
v = await g(() => G.fishing.view());
check(`a tap then sets the hook: ${v.state}`, v.state === 'hooked', v);
check('setting the hook ends the bite highlight', !(await page.locator('#bA').evaluate((e) => e.classList.contains('bite'))), null);
// reeling, with a finger down while it's calm and the line isn't straining too hard, and up while it runs
let holding = false, reddest = 0, ran = false, landed = null;
for (let i = 0; i < 900 && !landed; i++) {
  v = await g(() => G.fishing.view());
  if (v.state !== 'hooked') { landed = await g(() => ({ caught: G.fishing.caught(), gear: G.fishing.gear() })); break; }
  ran ||= v.running;
  const want = !v.running && v.strain < .75;
  if (want !== holding) { await touchA(want ? 'touchStart' : 'touchEnd'); holding = want; }
  await g(() => G.step(1 / 15));
  reddest = Math.max(reddest, await g(() => G.fishing.shown().red));
}
if (holding) await touchA('touchEnd');
const lb = landed?.caught.at(-1);
check(`holding A to reel and letting go when it runs or the line strains lands it, a ${lb} lb catfish, which used a worm`, landed?.caught.length === 1 && lb >= 2 && lb <= 20 && landed.gear.worms === T.reward.worms - 1, landed);
check('and the line went taut and red while it strained, and it ran at least once', reddest > .2 && ran, { reddest, ran });
await g(() => G.step(.1));
s = await g(() => ({ obj: G.state().obj, pockets: document.getElementById('pockets').textContent, fish: G.fishing.shown(), toast: G.state().toast }));
check(`he carries it, on a stringer at his hip, and it's in his pockets: "${s.pockets}", ${s.fish.lb} lb showing`, s.fish.fish && s.fish.lb === lb && s.pockets.includes('Catfish 1') && s.pockets.includes(`Worms ${T.reward.worms - 1}`), s);
check(`and there's nothing more to do about it: "${s.obj}"`, s.obj === 'Chunky is yours. For now.', s);
await snap('7-caught');

// a reload that night, with Skip to town: Coop's still at the hole, and knows he came and that he's caught one
const cameDay = (await g(() => G.coop.state())).came;
await page.reload();
await until(() => g(() => !!window.__game?.resume), 30000);
await helpers();
await g(() => { G.S.flags.ended = true; });
await clockTo('11-10 21:50');
await g((h) => { const to = beside(h, [[2, 0], [-2, 0], [1, -.4], [-1, -.4]]); G.place(to.x, to.z); G.player.yaw = h.yaw; G.look(h.yaw + Math.PI, .25); G.step(.2); }, hole);
c = await g(() => G.coop.state());
s = await g(() => G.state().obj);
check(`after a reload that night, he's still at the hole and it's still the night he came, and he's caught one: ${c.at}, "${s}"`, c.at === 'hole' && Number.isInteger(cameDay) && c.came === cameDay && s === 'Chunky is yours. For now.', { c, s, cameDay });

// ten o'clock
await clockTo('11-10 22:00');
c = await g(() => G.coop.state());
check(`at ten he packs up and says so, over his head: "${c.says}"`, c.says === T.lines.done && c.saysShown && c.at === 'hole', c);
await snap('8-packing-up');
await g(() => G.step(6));
c = await g(() => G.coop.state());
check(`then he's gone back: ${c.at}`, c.at === 'away' && !c.rod && !c.bobber, c);
await clockTo('11-10 22:10');
c = await g(() => G.coop.state());
check(`and he's behind the counter by ten past: ${c.at}`, c.at === 'counter' && c.solid, c);

// Wednesday night
const asked10 = decided.length;
await clockTo('11-11 21:30');
await look();
c = await g(() => G.coop.state());
check(`the next night he goes out to the hole again, and he's thought of nothing new: ${c.at}, asked ${decided.length - asked10} more times`, c.at === 'hole' && c.place === 'trestle-near' && decided.length === asked10, c);
d = await talkToCoop();
check(`talking to him there, it's done: no rod again, and no answers about it: "${d?.say}" ${d?.opts.join(' | ')}`, d && d.say !== T.lines.came && !d.opts.includes(T.answers.yes), d);
await tapOpt('Later.');

// Friday, once its nights are over, the next idea, which he never takes up
decisions.push(BRIDGE);
await clockTo('11-13 08:00');
await look();
const next = await until(news, 4000), asked13 = decided.at(-1);
check(`once its nights are over he thinks of the next, and Jev's told he came the once: "${asked13?.state}"`, next?.say === 'ask' && next.at.id === 'under-us80-east' && asked13.state === `${J.coop} ${J.trips[1]} ${J.done}`, { next, asked13 });
d = await talkToCoop();
check(`it's under the US 80 bridge: "${d?.say}"`, d?.say === ASK('under the US 80 bridge, east of town'), d);
await tapOpt('Later.');
await clockTo('11-16 08:00');
d = await talkToCoop();
check(`left three nights without him, it lapses, with his line: "${d?.say}"`, d?.say === T.lines.lapse, d);
await tapOpt('Later.');
d = await talkToCoop();
check(`and he only says so once: "${d?.say}"`, d && d.say !== T.lines.lapse, d);
await tapOpt('Later.');
const asked16 = decided.length;
await look();
d = await talkToCoop();
check(`then he thinks it over again, and with Jev off he's just himself: "${d?.say}" ${d?.opts.join(' | ')}`, decided.length === asked16 + 1 && decided.at(-1).state === `${J.coop} ${J.trips[1]} ${J.lapsed}` && !(await news()) && !d?.opts.includes(T.answers.yes), { d, state: decided.at(-1)?.state });
await tapOpt('Later.');

// kept after a reload
const keptGear = await g(() => G.fishing.gear());
await page.reload();
await until(() => g(() => !!window.__game?.resume), 30000);
await helpers();
gear = await g(() => G.fishing.gear());
check(`after a reload he still has his rod, his worms and his catfish, and Coop that he came: ${JSON.stringify(gear)}`, JSON.stringify(gear) === JSON.stringify(keptGear) && (await g(() => G.coop.trips())) === 1, { gear, keptGear });

// The rod never stops him fighting: with one of the crowd after him close enough to swing at, A's to swing, not for the line, and a
// swing brings the line in first, with its worm if nothing had taken it
await g(() => { G.S.flags.ended = true; G.bringOutCrowd(); });
const standBy = () => g((h) => {
  const to = beside(h, [[2, 0], [-2, 0], [1, -.4], [-1, -.4]]), P = G.player.pos;
  G.place(to.x, to.z); G.player.yaw = h.yaw; G.look(h.yaw + Math.PI, .25);
  G.horde.all.forEach((o, i) => Object.assign(o, { x: P.x + 900 + i, z: P.z + 600, tx: P.x + 900 + i, tz: P.z + 600, state: 0, alert: 0, sus: 0, flat: 0, moving: 0, knows: 0, lost: 0, reaching: 0 }));
  G.step(.2);
}, hole);
await standBy();
await page.tap('#bA'); await g(() => G.step(.6));
const foe = await g(() => {
  const P = G.player.pos, s = G.horde.all.find((o) => o.who), yaw = G.player.yaw;
  for (const [r, f] of [[2.2, 0], [-2.2, 0], [0, -2.2], [1.6, -1.6], [-1.6, -1.6]]) {
    const x = P.x + Math.cos(yaw) * r + Math.sin(yaw) * f, z = P.z - Math.sin(yaw) * r + Math.cos(yaw) * f;
    if (!dry(x, z)) continue;
    Object.assign(s, { x, z, y: G.floorAt(x, z), tx: P.x, tz: P.z, state: 2, alert: 1, sus: 0, knows: 1e9, lost: 0, flat: 0, moving: 0, reaching: 0, timer: 0 });
    G.step(.05);
    return { id: s.who.id, act: G.S.act, line: G.fishing.view().state, worms: G.fishing.gear().worms };
  }
  return null;
});
check(`with a line out and one of them after him in reach, A's to swing at it: ${foe?.act}, "${await button()}"`, foe?.line === 'waiting' && foe.act === null && (await button()) === 'SWING', foe);
await page.tap('#bA'); await g(() => G.step(.6));
const swung = await g((id) => { const s = G.horde.all.find((o) => o.who?.id === id); return { down: s.flat > 0, grabbed: !!G.horde.grab, line: G.fishing.view().state, worms: G.fishing.gear().worms }; }, foe?.id);
check(`a tap swings and it goes down, with the line brought in first and its worm kept, since nothing had taken it: ${swung.worms} worms`, swung.down && !swung.grabbed && swung.line === 'idle' && swung.worms === foe?.worms, swung);
// and walking off with something on the line, it's gone, and so is its worm
await standBy();
await page.tap('#bA'); await g(() => G.step(.6));
const wormsOut = await g(() => G.fishing.gear().worms);
t = 0;
while ((await g(() => G.fishing.view().state)) === 'waiting' && t < 15) { await g(() => G.step(.1)); t += .1; }
const bit = await g(() => G.fishing.view().state);
await g(() => { const P = G.player.pos; G.place(P.x - Math.sin(G.player.yaw) * 3, P.z - Math.cos(G.player.yaw) * 3); G.step(.1); });
const walked = await g(() => ({ line: G.fishing.view().state, worms: G.fishing.gear().worms }));
check(`walking off with something on the line, it's gone, and so is its worm: ${wormsOut} to ${walked.worms}`, bit === 'bite' && walked.line === 'idle' && walked.worms === wormsOut - 1, { bit, walked, wormsOut });
await shut();

// CHUNKY-192: an actual cast at every listed bank, pond and trestle, with the normal phone camera.
await open(PHONE);
await helpers();
for (const { id } of FISHING_PLACES) {
  await g((id) => { const h = G.coop.hole(id); G.fishing.give(); G.place(h.x, h.z); G.player.yaw = h.yaw; G.look(h.yaw + Math.PI, .25); G.step(.2); }, id);
  await page.tap('#bA');
  const seen = await g(() => { G.step(1.5); return { ...G.fishing.seen(), state: G.fishing.view().state, controls: document.getElementById('prompt').getBoundingClientRect().top }; });
  check(`${id}: the bobber is visible above the controls, clear of the bank or railing, at least 6 phone pixels across`, seen.state === 'waiting' && seen.clear && seen.pixels >= 6 && seen.screen.depth < 1 && seen.screen.x > 24 && seen.screen.x < 366 && seen.screen.y > 180 && seen.screen.y < seen.controls - 12, seen);
  await snap(`view-${id}`);
  await g(() => { G.fishing.forget(); G.step(1); });
  check(`${id}: reeling in releases the fishing camera`, (await g(() => G.cam.fish)) === 0, null);
}
await shut();

// ---------------- a town that's shared, where Coop keeps the counter
await open({ ...PHONE, query: `?test&net=ws://localhost:${town.port}` });
await g(() => __game.resume());
await page.tap('#together');
await until(() => g(() => !document.getElementById('join').hidden));
await page.tap('#joinName'); await page.keyboard.type('Dee');
await page.tap('#joinGo');
check('a newcomer comes into town', !!(await until(() => g(() => __game.S.mode === 'town' && !!window.__net?.you().id), 10000)), null);
await g((t) => { __game.churchSigns.clock(t); __game.S.flags.ended = true; }, ms('11-10 03:00'));
await sleep(500);
c = await g(() => __game.coop.state());
check(`in a town that's shared he's at the counter at 3 in the morning, with nothing on the door: ${c.at}`, c.at === 'counter' && !c.signShown && !c.away, c);
await shut(); await town.close();
process.exit(failed ? 1 : 0);
