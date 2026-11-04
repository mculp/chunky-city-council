// Treats people differently, on a phone-sized page with real taps and the game's own movement, and checks they behave differently afterwards, and still do after a reload:
// the same blow leaves one person keeping away and another coming for him, someone who was there hears about it, a thrown bottle stops holding the eye of someone it's fooled too often,
// someone nosy follows him about, and the families go around together. What it costs is at the end.
//
//   npm i && npm run agents [-- --shots dir]
import { mkdirSync } from 'node:fs';
import { serveAndOpen, screenLines, newLines, hasWhyBox } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); };

const AWAY = 2, AFTER = 1, TAILING = 3, SHAMBLE = 0, HUNTING = 2, AVOIDING = 6, TRAILING = 7, ROUSED = 8;
const start = () => g(() => {
  const G = __game; G.pause(); G.jump('town'); G.S.flags.town = true; G.S.flags.ended = G.S.flags.arrived = true; G.step(.1);
  document.getElementById('card').style.display = 'none';
  G.bringOutCrowd();
  // US 80 west of town, running east from where he stands
  const a0 = G.map.sOn('us_80', ...G.map.fromTrue(-560, -20)), a1 = a0 + Math.sign(G.map.sOn('us_80', ...G.map.fromTrue(-500, -21)) - a0);
  window.road = (m, across = 0) => { const p = G.map.along('us_80', a0 + (a1 - a0) * m); return [p.x, p.z + across]; };
  window.put = (s, m, across = 0) => { const [x, z] = road(m, across); s.x = s.tx = s.homeX = x; s.z = s.tz = s.homeZ = z; s.y = G.floorAt(x, z); Object.assign(s, { state: 0, alert: 0, flat: 0, stuck: 0, lost: 0, timer: 5, moving: 0, lead: null, turned: 0, under: undefined }); return s; };
  // everybody a long way off, and him on the road, facing east
  window.clear = () => {
    G.horde.calm(); const [ax, az] = road(0);
    G.horde.all.forEach((s, i) => { const f = i % 2 ? 1 : -1; s.x = s.tx = s.homeX = ax + f * (900 + i); s.z = s.tz = s.homeZ = az + 500 + i; s.y = G.floorAt(s.x, s.z); s.state = 0; s.flat = 0; s.lead = null; });
    window.stand(0);
    G.S.hp = 3; G.S.mode = 'town'; G.player.inv = 0; document.getElementById('fail').hidden = true;
  };
  window.stand = (m) => { const [x, z] = road(m), [ex, ez] = road(m + 10), yaw = Math.atan2(ex - x, ez - z); G.place(x, z); G.player.yaw = yaw; G.look(yaw + Math.PI, .3); G.HP.speed = 0; };
  // someone like this, who isn't already spoken for and doesn't go along with anybody
  const used = new Set();
  window.who = (like) => { const s = G.horde.all.find((c) => !used.has(c) && c.who.tagalong < .55 && like(c.who)); if (!s) throw new Error('nobody like that'); used.add(s); return s; };
  window.byId = (id) => G.horde.all.find((s) => s.who.id === id);
  window.dist = (s) => Math.hypot(s.x - G.player.pos.x, s.z - G.player.pos.z);
  window.moodOf = (s) => G.folks.mood(s.who);
});
await start();
const swingAt = async (js) => {
  await g(([code]) => { const G = __game, s = eval(code); clear(); put(s, 1.1); stand(0); G.step(.2); }, [js]);
  await page.tap('#bA');
  await g(() => { __game.sim(.5, 1 / 30); });
};

// ---- who they are
const census = await g(() => {
  const G = __game, all = G.horde.all, n = (f) => all.filter((s) => s.who.family === f).length;
  return { all: all.length, alexander: n('Alexander'), clark: n('Clark'), gressett: n('Gressett'), named: all.every((s) => s.who.first && s.who.family), names: new Set(all.map((s) => s.who.name)).size, hoods: 0, looks: new Set(all.map((s) => s.look % 8)).size, sample: all.slice(0, 8).map((s) => s.who.name) };
});
console.log(`     ${census.all} of them, such as ${census.sample.join(', ')}`);
check('half of them are Alexanders or Clarks', census.alexander === census.all / 4 && census.clark === census.all / 4, census);
check('and an eighth are Gressetts', Math.abs(census.gressett - census.all / 8) <= 1, census);
check('and everyone has a name of their own', census.named && census.names === census.all, census);
check('in all the looks', census.looks === 8, census);

// ---- the same blow, two people
const ids = await g(() => {
  window.timid = who((w) => w.nerve < .2 && w.temper < .6), window.bold = who((w) => w.nerve > .7 && w.temper > .55), window.plain = who((w) => w.nerve > .35 && w.nerve < .65 && w.temper > .35 && w.temper < .65 && w.nosy < .6);
  return { timid: timid.who.id, bold: bold.who.id, plain: plain.who.id, names: [timid.who.name, bold.who.name, plain.who.name] };
});
console.log(`     hitting ${ids.names[0]} and ${ids.names[1]}, and leaving ${ids.names[2]} alone`);
await swingAt('timid');
const hit1 = await g(() => ({ hurt: timid.who.hurt, flat: timid.flat, mood: moodOf(timid) }));
check('a tap of A knocks one of them down, and they remember it', hit1.hurt === 1 && hit1.flat > 0 && hit1.mood === AWAY, hit1);
// down for as long as a swing puts anyone down, and then a moment
await g(() => { const G = __game; while (G.horde.down(timid) > 0) G.sim(1 / 30, 1 / 30); G.sim(2, 1 / 30); G.step(.1); });
await snap('1-keeps-away');
const ran = await g(() => ({ state: timid.state, d: dist(timid) }));
check(`and when they get up they get away from him, ${ran.d.toFixed(1)} m off`, ran.state === AVOIDING && ran.d > 4, ran);
await swingAt('bold');
const hit2 = await g(() => ({ hurt: bold.who.hurt, flat: bold.flat, mood: moodOf(bold) }));
check('the same blow on someone bolder', hit2.hurt === 1 && hit2.flat > 0 && hit2.mood === AFTER, hit2);
// what's on the screen while they're down, to see that nothing new goes up when they get up
const down = await screenLines(page);
await g(() => { const G = __game; G.roused.log.length = 0; while (G.horde.down(bold) > 0) G.sim(1 / 30, 1 / 30); G.sim(.5, 1 / 30); G.step(.1); });
const stood = await g(() => ({ state: bold.state, d: dist(bold), noted: __game.roused.log.map((r) => r.kind) }));
const added = newLines(down, await screenLines(page));
check('and they get up, and stop and turn to him for a second first, because he hit them, and nothing on the screen says why', stood.state === ROUSED && stood.noted.join() === 'hit' && !(await hasWhyBox(page)) && added.length === 0, { ...stood, added });
await snap('2-after-you');
const came = await g(() => { __game.sim(1.2, 1 / 30); __game.step(.1); return { state: bold.state, d: dist(bold), grab: !!__game.horde.grab }; });
check('and then they come for him', came.grab || came.state === HUNTING, came);

// Walking towards the three of them, side by side, from far enough off that nobody should care
const towards = () => g(() => {
  const G = __game; clear(); put(timid, 34, 2); put(bold, 34, -2); put(plain, 34, 0); stand(0); G.step(.1);
  G.key('w', true); const seen = []; for (let t = 0; t < 2.2; t += 1 / 30) { G.sim(1 / 30, 1 / 30); } G.key('w', false);
  return { timid: { state: timid.state, d: dist(timid) }, bold: { state: bold.state, d: dist(bold) }, plain: { state: plain.state, d: dist(plain) }, walked: Math.hypot(G.player.pos.x - road(0)[0], G.player.pos.z - road(0)[1]) };
});
const w1 = await towards();
check(`walking towards the three, ${w1.walked.toFixed(1)} m: the one who keeps away is already going`, w1.timid.state === AVOIDING, w1);
check('the one with a grudge is already coming', w1.bold.state === HUNTING || w1.bold.state === ROUSED, w1);
check('and the one he left alone hasn\'t noticed yet', w1.plain.state === SHAMBLE, w1);

// ---- the panel, and the name over their head
await g(() => { const G = __game; clear(); put(timid, 4); stand(0); timid.state = 0; G.step(.4); });
const tag = await g(() => { const t = document.getElementById('who'), r = t.getBoundingClientRect(); return { hidden: t.hidden, text: t.innerText, x: r.x + r.width / 2, y: r.y + r.height, w: innerWidth, h: innerHeight }; });
check(`over the head of whoever's nearest it says "${tag.text.replace(/\n/g, ' ')}"`, !tag.hidden && /keeps away/i.test(tag.text) && tag.x > 0 && tag.x < tag.w && tag.y > 0 && tag.y < tag.h, tag);
await snap('3-name');
await page.tap('#repHead');
const panel = await g(() => { __game.step(1.1); return document.getElementById('repList').innerText; });
const names = await g(() => [timid.who.name, bold.who.name, plain.who.name]);
check('the people panel says how each of them is with him', new RegExp(`${names[0]}\\s*keeps away`, 'i').test(panel) && new RegExp(`${names[1]}\\s*after you`, 'i').test(panel), panel);
await snap('4-panel');
await page.tap('#repHead');

// ---- what they saw, and what gets around
const heard = await g(() => {
  const G = __game; clear();
  const scared = who((w) => w.nerve < .12 && w.temper < .5), far = who((w) => w.nerve < .12 && w.temper < .5);
  const told = who((w) => w.family === scared.who.family && w.nerve > .3 && w.nerve < .7), stranger = who((w) => w.family !== scared.who.family && w.nerve > .3 && w.nerve < .7);
  put(window.plain2 = who((w) => w.nerve > .3 && w.nerve < .7), 1.1); put(scared, 12); put(far, 40); stand(0);
  G.horde.update(.01, { x: G.player.pos.x, z: G.player.pos.z, y: 0, noise: 0, light: 0, beans: 0, night: 1, hidden: true, canGrab: false });
  G.horde.knock(G.player.pos.x + 1.1, G.player.pos.z, 1.5, 2.4);
  const out = { there: scared.who.there, moodNear: moodOf(scared), farThere: far.who.there };
  // and word of it, from someone standing with them, to their own and not to anyone else
  put(told, 13, 1); put(stranger, 13, -1); stand(-30); G.sim(25, 1 / 15);
  out.told = told.who.told; out.stranger = stranger.who.told;
  return out;
});
check('someone who was there when it happened keeps away, without being touched', heard.there === 1 && heard.moodNear === AWAY, heard);
check('further off they didn\'t notice', heard.farThere === 0, heard);
check('and word gets around their family, and nobody else', heard.told === 1 && heard.stranger === 0, heard);

// ---- fooled once too often. A bottle comes down past a burnt-down one and it looks at that. When the same sort of thing has done it often enough it stops looking, but it still looks at a
// different sort, and someone it hasn't fooled still looks.
const wise = await g(() => {
  const G = __game; clear();
  const slow = who((w) => w.nosy > .6 && w.nerve > .3 && w.nerve < .8), fresh = who((w) => w.nerve > .3 && w.nerve < .8);
  slow.quiet = fresh.quiet = false;
  const times = []; put(slow, 20); put(fresh, 900); stand(-40);
  const [x, z] = road(26);
  const look = (kind) => { G.horde.look(x, z, 40, 4, kind); G.sim(.4, 1 / 30); const looked = !!slow.gaze; G.sim(4.5, 1 / 30); return looked; };
  for (let i = 0; i < 6; i++) { times.push(look('bottle')); put(slow, 20); }
  put(fresh, 20, 2); G.horde.look(x, z, 40, 4, 'bottle'); G.sim(.6, 1 / 30);
  const out = { times, count: slow.who.fooled.bottle, fresh: !!fresh.gaze, slowNow: !!slow.gaze };
  G.sim(4, 1 / 30); put(slow, 20); put(fresh, 900);
  G.horde.look(x, z, 40, 4, 'crackers'); G.sim(.6, 1 / 30); out.other = !!slow.gaze;
  return out;
});
check(`the same bottle gets someone to look ${wise.times.filter(Boolean).length} times, then it doesn't`, wise.times[0] && !wise.times[5] && wise.count >= 2, wise);
check('it still gets someone it hasn\'t fooled to look', wise.fresh && !wise.slowNow, wise);
check('and a different sort of thing still gets them to look', wise.other, wise);

// ---- someone nosy
const nosy = await g(() => {
  const G = __game; clear();
  const s = G.horde.all.find((c) => c.who.nosy > .76 && !c.who.hurt && !c.who.there && !c.who.told && !c.who.got && c.who.tagalong < .55); put(s, 18); stand(0);
  G.folks.close(s.who, 12); G.step(.1); G.sim(25, 1 / 30); G.step(.2);
  window.nosy = s;
  const gap = dist(s), state = s.state, moving = s.moving;
  const was = [G.player.pos.x, G.player.pos.z];
  stand(-22); G.sim(20, 1 / 30);
  return { gap, state, moving, later: dist(s), state2: s.state, grab: !!G.horde.grab };
});
check(`someone nosy who's been around him follows him, and stops ${nosy.gap.toFixed(1)} m off`, nosy.state === TRAILING && nosy.gap > 5 && nosy.gap < 16 && nosy.moving === 0, nosy);
check('and comes on when he moves off, and doesn\'t lay a hand on him', nosy.state2 === TRAILING && nosy.later > 5 && nosy.later < 16 && !nosy.grab, nosy);
await g(() => { const G = __game; G.step(.2); });
await snap('5-following');

// ---- the families
const families = await g(() => {
  const G = __game; clear();
  const lead = G.horde.all.find((s) => s.who.family === 'Clark' && s.who.tagalong < .2), tags = G.horde.all.filter((s) => s.who.family === 'Clark' && s.who.tagalong > .6).slice(0, 3), other = G.horde.all.find((s) => s.who.family === 'Alexander' && s.who.tagalong > .6);
  put(lead, 12); tags.forEach((s, i) => put(s, 8 + i * 4, 3)); put(other, 10, -3); stand(-70);
  const started = [lead.x, lead.z];
  G.sim(50, 1 / 15);
  return { n: tags.length, leads: tags.filter((s) => s.lead).length, close: tags.map((s) => Math.hypot(s.x - lead.x, s.z - lead.z)), moved: Math.hypot(lead.x - started[0], lead.z - started[1]), otherLead: other.lead?.who.family ?? null };
});
check(`those who go along go along with their own family, up to ${Math.max(...families.close).toFixed(1)} m behind`, families.leads === families.n && families.close.every((d) => d < 16), families);
check('and don\'t go along with the other', families.otherLead !== 'Clark', families);

// ---- a reload
await g(() => { const G = __game; clear(); put(timid, 45, 2); put(bold, 45, -2); stand(0); G.sim(.2, 1 / 30); G.folks.save(); });
const before = await g(() => ({ timid: { id: timid.who.id, name: timid.who.name, hurt: timid.who.hurt, x: timid.x, z: timid.z, look: timid.look, far: timid.far, size: timid.size }, bold: { id: bold.who.id, name: bold.who.name, hurt: bold.who.hurt }, plain: { id: plain.who.id, name: plain.who.name, hurt: plain.who.hurt }, fooled: Object.keys(window.nosy.who.fooled).length, known: __game.folks.met().length, nosy: window.nosy.who.id }));
await page.reload({ waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
const forget = await g(() => !document.getElementById('forget').hidden);
await start();
const after = await g((b) => {
  window.timid = byId(b.timid.id); window.bold = byId(b.bold.id); window.plain = byId(b.plain.id);
  return { timid: { id: timid.who.id, name: timid.who.name, hurt: timid.who.hurt, x: timid.x, z: timid.z, look: timid.look, size: timid.size, mood: moodOf(timid) }, bold: { name: bold.who.name, hurt: bold.who.hurt, mood: moodOf(bold) }, plain: { name: plain.who.name, hurt: plain.who.hurt, mood: moodOf(plain) }, known: __game.folks.met().length, nosy: moodOf(byId(b.nosy)) };
}, before);
check('after a reload they\'re the same people', after.timid.name === before.timid.name && after.bold.name === before.bold.name && after.timid.look === before.timid.look && after.timid.size === before.timid.size, { before, after });
check('and remember what he did', after.timid.hurt === 1 && after.bold.hurt >= 1 && after.plain.hurt === 0 && after.timid.mood === AWAY && after.bold.mood === AFTER && after.known === before.known, { before, after });
check('and they\'re where he left them', Math.hypot(after.timid.x - before.timid.x, after.timid.z - before.timid.z) < 1.5, { before, after });
const w2 = await towards();
check('and it still goes the same way: one\'s going', w2.timid.state === AVOIDING, w2);
check('one\'s coming', w2.bold.state === HUNTING || w2.bold.state === ROUSED, w2);
check('and one hasn\'t noticed', w2.plain.state === SHAMBLE, w2);
check('and the title has a way to forget them', forget, forget);

// ---- what it costs, with most of them having something to remember
const cost = async (rate) => {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate });
  const t = await g(() => {
    const G = __game, began = performance.now(); for (let i = 0; i < 90; i++) G.sim(1 / 30, 1 / 30); const logic = (performance.now() - began) / 90;
    const b2 = performance.now(); for (let i = 0; i < 60; i++) G.step(1 / 30, 1 / 30); const frame = (performance.now() - b2) / 60;
    const b3 = performance.now(); for (let i = 0; i < 20; i++) G.folks.save(); return { logic, frame, save: (performance.now() - b3) / 20, size: localStorage.getItem('chunky.folks.v1').length };
  });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return t;
};
await g(() => {
  const G = __game; G.horde.calm(); const [x, z] = road(0); stand(0);
  G.horde.all.forEach((s, i) => { const a = i * 2.4, r = 6 + Math.sqrt(i) * 5; s.x = s.tx = x + Math.cos(a) * r; s.z = s.tz = z + Math.sin(a) * r; s.y = G.floorAt(s.x, s.z); if (i % 2) G.folks.hurt(s.who, s.x, s.z, 'hit'); G.folks.close(s.who, 3); s.state = 0; });
  G.step(.2);
});
const fast = await cost(1), slow = await cost(4);
console.log(`     a frame's JS: ${fast.frame.toFixed(1)} ms here, ${slow.frame.toFixed(1)} ms at a quarter of this CPU, ${fast.logic.toFixed(2)} ms of it the crowd and everything else that isn't drawing. Saving them all takes ${slow.save.toFixed(2)} ms at that speed, ${slow.size} bytes.`);
check('under 33 ms of JS a frame at a quarter of this CPU', slow.frame < 33, slow);
check('and saving doesn\'t get in the way', slow.save < 12, slow);
await snap('6-lots');

// ---- forgetting
await page.reload({ waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
await g(() => document.getElementById('forget').click());
const gone = await g(() => ({ saved: localStorage.getItem('chunky.folks.v1'), known: __game.folks.met().length, hurt: __game.folks.person(1).hurt, hidden: document.getElementById('forget').hidden }));
check('forget everyone means them too', gone.saved === null && gone.known === 0 && gone.hurt === 0 && gone.hidden, gone);

check('no console errors', errors.length === 0, errors);
await close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
