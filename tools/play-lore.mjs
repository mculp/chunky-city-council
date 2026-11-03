// Goes and looks at what's come from the owner's lore, in docs/lore.md, with the game's own movement and real key presses and taps: every church's sign,
// what it says today and tomorrow, and what happens when it's hit, then Charlie Flake's catfish, then Robby's lot and the flies, then the light on Stuckey's Bridge. It can't say whether the jokes are any good.
//
//   npm i && npm run lore [-- --shots dir]
import { mkdirSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 80 }); };

await g(() => {
  const G = __game; G.pause(); G.jump('town'); G.S.flags.town = true; G.step(.1);
  // stands in front of a sign and looks at it
  window.faceSign = (i, away, back = false) => { const s = G.churchSigns.list[i], a = s.c.facing * Math.PI / 180, k = back ? -1 : 1, x = s.x + Math.sin(a) * away * k, z = s.z - Math.cos(a) * away * k; G.place(x, z); G.look(Math.atan2(x - s.x, z - s.z)); G.step(.3); };
  // what's on a sign's canvas, as one number, so that it's plain if it's been painted again
  window.painted = (i) => { const d = G.churchSigns.list[i].g.getImageData(0, 0, 1024, 640).data; let h = 7; for (let k = 0; k < d.length; k += 97) h = (Math.imul(h, 31) + d[k]) | 0; return h; };
  window.sayings = () => G.churchSigns.list.map((s) => G.churchSigns.says(s.c.id).join(' / '));
});

// ---- the signs are there, and each of them says something
const list = await g(() => __game.churchSigns.list.map((s, i) => ({ id: s.c.id, down: s.prop.down, floor: __game.floorAt(s.x, s.z), name: s.c.name, says: sayings()[i] })));
check('every church has a sign', list.length === 3 && list.every((s) => !s.down), list);
check('each one stands on the ground', list.every((s) => Math.abs(s.floor - 6.15) < 1), list);
check('and they say different things', new Set(list.map((s) => s.says)).size === 3, list);
for (const [i, s] of list.entries()) { await g((i) => faceSign(i, 10), i); await snap(`sign-${s.id}`); }

// ---- it changes at midnight in Mississippi, without anyone reloading
await g(() => __game.churchSigns.clock(Date.UTC(2026, 10, 5, 5, 58)));
await g(() => __game.step(11));
const before = await g(() => ({ day: __game.churchSigns.day(), says: sayings(), painted: [0, 1, 2].map(painted) }));
await g(() => __game.churchSigns.clock(Date.UTC(2026, 10, 5, 6, 2)));
const stillOn = await g(() => { __game.step(.1); return __game.churchSigns.day(); });
await g(() => __game.step(11));
const after = await g(() => ({ day: __game.churchSigns.day(), says: sayings(), painted: [0, 1, 2].map(painted) }));
check('the day turns over at midnight there', after.day === before.day + 1, [before.day, after.day]);
check('the letters change within a few seconds of it', stillOn === before.day || stillOn === after.day, stillOn);
check('every sign says something else', before.says.every((s, i) => s !== after.says[i]), [before.says, after.says]);
check('and every sign is painted again', before.painted.every((p, i) => p !== after.painted[i]), [before.painted, after.painted]);
await g((i) => faceSign(i, 10), 1); await snap('sign-tomorrow');

// ---- you can walk up to it and it stops you, and the road's still clear
const walked = await g(() => { const G = __game; faceSign(1, 9); G.key('w', true); G.sim(4, 1 / 30); G.key('w', false); const s = G.churchSigns.list[1]; return { d: Math.hypot(G.player.pos.x - s.x, G.player.pos.z - s.z), mode: G.S.mode }; });
check('walking at it, he stops against it', walked.d > .5 && walked.d < 3, walked);
const road = await g(() => { const G = __game, s = G.churchSigns.list[1], [ , z] = G.map.fromTrue(0, -22.7); return Array.from({ length: 13 }, (_, k) => G.blocked(s.x - 6 + k, z, G.floorAt(s.x, z) + .1)).filter(Boolean).length; });
check('US 80 in front of it is clear', road === 0, road);

// ---- reading from the back as well
await g((i) => faceSign(i, 10, true), 1); await snap('sign-back');

// ---- three swings of the hammer and it goes over, and it stays over
await g(() => faceSign(0, 1.6));
const swung = await g(() => { const G = __game, s = G.churchSigns.list[0]; G.look(G.player.yaw + Math.PI); const hits = []; for (let k = 0; k < 6 && !s.prop.down; k++) { G.key('f', true); G.sim(1 / 30, 1 / 30); G.key('f', false); G.sim(.8, 1 / 30); hits.push(s.prop.hp); } G.step(1.4); return { hits, down: s.prop.down }; });
check('a hammer knocks it over in a few swings', swung.down && swung.hits.length >= 2, swung);
await snap('sign-down');
const lit = await g(() => { const G = __game, s = G.churchSigns.list[0]; G.step(1); return { bright: s.mat.color.r, glow: s.glow.visible }; });
check('and it goes dark', lit.bright < .3 && !lit.glow, lit);
const stayed = await g(() => { const G = __game, s = G.churchSigns.list[0]; G.place(...G.map.fromTrue(0, 0)); G.step(1); faceSign(0, 10); G.step(1); return s.prop.down; });
check('and it\'s still down after going away and coming back', stayed === true, stayed);

// ---- a pickup goes through one
const rammed = await g(() => {
  const G = __game, s = G.churchSigns.list[1], v = G.vehicles.find((o) => o.kind === 'pickup' && !o.wrecked && !o.drowned), a = v.yaw + Math.PI / 2, off = v.K.width / 2 + 1;
  G.place(v.x + Math.sin(a) * off, v.z + Math.cos(a) * off); G.step(.6); G.key('e', true); G.sim(1 / 30, 1 / 30); G.key('e', false); G.sim(1 / 30, 1 / 30);
  const d = G.driving(); if (!d) return { boarded: false };
  // lined up on the sign from along the road, at speed
  const [ , rz] = G.map.fromTrue(0, -22.7), n = s.c.facing * Math.PI / 180, x = s.x + Math.sin(n) * 40, z = s.z - Math.cos(n) * 40;
  d.x = x; d.z = z; d.y = G.floorAt(x, z); d.yaw = Math.atan2(s.x - x, s.z - z); d.f = 0; d.s = 0; d.steer = 0; d.grounded = true; G.look(d.yaw + Math.PI);
  G.key('w', true); for (let t = 0; t < 8 && !s.prop.down; t += 1 / 30) G.sim(1 / 30, 1 / 30); G.key('w', false); G.step(1.2);
  return { boarded: true, down: s.prop.down, hp: s.prop.hp };
});
check('a pickup goes through one', rammed.boarded && rammed.down, rammed);
await snap('sign-rammed');

// ---- what they cost
const cost = await g(() => { const G = __game; G.key('e', true); G.sim(1 / 30, 1 / 30); G.key('e', false); faceSign(2, 10); G.step(.2); const full = G.calls(); G.churchSigns.list[2].faces.forEach((f) => { f.visible = false; }); return { full, ...G.calls() }; });
console.log(`     looking at a sign: ${cost.full.calls} draw calls and ${cost.full.triangles} triangles`);

// ---- Charlie Flake's catfish, on the left coming off the bridge
await g(() => { const G = __game; if (G.driving()) G.getOut(true); G.jump('town'); G.S.flags.town = true; G.step(.1); window.C = G.charlie; });
const charlie = await g(() => {
  const G = __game, m = G.map, id = 'griffis_fountain_rd', c = m.crossings.find((o) => o.road === id && o.with === 'river'), s0 = m.sOn(id, c.x, c.z), p = m.along(id, s0 - 19), P = G.player.pos, hx = -p.tx, hz = -p.tz, left = (C.x - p.x) * hz - (C.z - p.z) * hx;
  G.place(p.x + p.tx * 8, p.z + p.tz * 8); G.look(Math.atan2(G.player.pos.x - C.x, G.player.pos.z - C.z)); G.step(.6);
  const road = Array.from({ length: 9 }, (_, k) => G.blocked(p.x + (C.x - p.x) * (k - 4) / 13, p.z + (C.z - p.z) * (k - 4) / 13, G.floorAt(p.x, p.z) + .1)).filter(Boolean).length;
  return { words: C.words.join(' ').toLowerCase(), left: left > 0, off: m.roadGrid.nearest(C.x, C.z), road, down: C.marker.down, fish: C.fish.position.toArray(), solid: G.blocked(C.x, C.z, 6.2) };
});
check('the marker says the owner\'s words and nothing else', charlie.words === 'a local resident known for catching a record 56-pound catfish from the chunky river in 1924', charlie);
check('it\'s on the left going into town, off the road', charlie.left && charlie.off > 5, charlie);
check('and the road past it is clear', charlie.road === 0, charlie);
check('you can\'t walk through its pole', charlie.solid, charlie);
await snap('charlie-from-road');
const felled = await g(() => { const G = __game, a = C.fish.position.toArray(); G.place(C.x + .9, C.z); G.look(Math.atan2(.9, 0)); for (let k = 0; k < 4 && !C.marker.down; k++) { G.key('f', true); G.sim(1 / 30, 1 / 30); G.key('f', false); G.sim(.9, 1 / 30); } G.step(2); const b = C.fish.position.toArray(); return { down: C.marker.down, fell: a[1] - b[1] }; });
check('a hammer brings it down, and the fish with it', felled.down && felled.fell > 1, felled);
await snap('charlie-down');

// ---- Robby's: the first house on the right coming off the bridge, which burned down. He said these words the once.
const LINE = 'hey man, help me get these flies out of here so we can cook some deer meat';
const tap = async (id = '#bA') => { await page.tap(id); await g(() => __game.step(.05)); };
const word = () => page.textContent('#bA'), said = () => g(() => __game.state().dialog);
const setRobby = () => g(() => {
  const G = __game; if (G.driving()) G.getOut(true); G.jump('town'); G.S.flags.town = true; G.step(.1); window.R = G.robby;
  // walks to a spot with his own legs, and says how far he got
  window.walkTo = (x, z, within = 1.2, secs = 90) => { const P = G.player.pos; let t = 0; G.key('w', true); while (t < secs && Math.hypot(P.x - x, P.z - z) > within) { G.look(Math.atan2(P.x - x, P.z - z)); G.sim(1 / 15, 1 / 30); t += 1 / 15; } G.key('w', false); G.sim(.3, 1 / 30); G.step(.1); return { t: Math.round(t), d: Math.hypot(P.x - x, P.z - z), mode: G.S.mode }; };
});
await setRobby();

// off the bridge and onto the lot on foot, from where he wakes
const walk = await g(() => { const G = __game, P = G.player.pos, from = [P.x, P.z], [rx, rz] = G.map.fromTrue(-301, 385), a = walkTo(rx, rz, 3), b = walkTo(R.lot.x - 15, R.lot.z, 1.5); return { from, a, b, side: (R.lot.x - rx) > 0 }; });
check('he can walk from where he wakes to the lot', walk.a.d < 3.5 && walk.b.d < 2 && walk.a.mode === 'town', walk);
check('and it\'s on his right, going into town', walk.side, walk);
await snap('robby-from-road');
const home = await g(() => { const G = __game, s = G.structures.find((o) => o.id === 74582285); return { there: G.houseAt(s.wx, s.wz) === s, hurt: G.wreck.damage.has(s), floor: G.floorAt(s.wx, s.wz) }; });
check('the real home behind it is still standing', home.there && !home.hurt && Math.abs(home.floor - 6.15) < 1, home);

// the memorial says what the owner said
await g(() => { const G = __game; walkTo(R.lot.x - 15, R.lot.z, .8); G.look(Math.atan2(G.player.pos.x - R.lot.x, 0)); G.step(.3); });
await snap('robby-memorial');

// he isn't asked yet: a swing just scatters them, and there's as many after
const early = await g(async () => { walkTo(R.lot.x - 14.5, R.lot.z + 3, .6); walkTo(R.lot.x - 8, R.lot.z + 2.4, .5); const w = walkTo(R.at.x - 2.6, R.at.z + 1.6, .4); return { w, flies: R.flies(), shown: R.shown() }; });
check('there are flies round him', early.flies === 1 && early.shown > 30 && early.w.d < 1, early);
const moved = await g(() => { const a = R.where(); __game.step(.2); return a !== R.where(); });
check('and they move', moved, moved);
check('the button swings until you\'re up to him', await word() === 'SWING', await word());
await tap(); await g(() => __game.step(.5));
const scattered = await g(() => ({ stir: R.stir(), flies: R.flies() }));
check('a swing before he\'s asked only scatters them', scattered.flies === 1 && scattered.stir > 0, scattered);
await g(() => __game.step(.9));
const buzzing = await page.waitForFunction(() => { __game.step(.05); return __game.robby.loop() > .1; }, null, { timeout: 15000, polling: 200 }).then(() => true, () => false);
check('you can hear them, close to', buzzing, await g(() => R.loop()));

// he asks
const up = await g(() => walkTo(R.at.x - 1.4, R.at.z + .6, .4));
check('he can get up to him, past the steps', up.d < 1, up);
await g(() => __game.step(.1));
check('the button says TALK', await word() === 'TALK', await word());
await snap('robby-up-to-him');
await tap();
const asked = await said();
check('it\'s Robby', asked?.who === 'Robby', asked);
check('and it\'s the owner\'s words, exactly', asked?.say === LINE, asked);
check('and it\'s what\'s on the screen', await page.textContent('#dSay') === LINE, await page.textContent('#dSay'));
await snap('robby-says-it');
check('there\'s one reply, and it isn\'t words', asked?.opts?.length === 1 && asked.opts[0] === '...', asked);
await page.tap('#dOpts button'); await g(() => __game.step(.1));
const out = await g(() => ({ mode: __game.S.mode, flag: __game.S.flags.robbySaid }));
check('and then you\'re back in the game', out.mode === 'town' && out.flag, out);

// the button's for the flies now, however close he is, because it's the only button a phone has
check('standing next to him, the button swings', await word() === 'SWING', await word());
check('and the prompt says at what', /SWING at the flies/.test(await page.textContent('#prompt')), await page.textContent('#prompt'));
const left = [];
for (let k = 0; k < 4; k++) { await tap(); await g(() => __game.step(.9)); left.push(await g(() => R.flies())); }
check('four swings and the flies are out', left.join() === '0.75,0.5,0.25,0', left);
const cooking = await g(() => { __game.step(.3); return { cooking: R.cooking(), shown: R.shown(), toast: document.getElementById('toast').textContent, sound: R.loop() }; });
check('the fire\'s lit and the deer meat\'s on', cooking.cooking && cooking.shown === 0, cooking);
check('and they\'ve gone quiet', cooking.sound < .02, cooking);
await g(() => { const G = __game; G.place(R.hearth.x - 3, R.hearth.z - 3); G.look(Math.atan2(-3, -3)); G.step(.6); });
await snap('robby-cooking');

// he's said all he's ever going to
const again = await g(() => { const G = __game; G.place(R.at.x - 1.6, R.at.z + 1.8); G.step(.1); return walkTo(R.at.x - 1.4, R.at.z + .6, .4); });
await g(() => __game.step(.1));
check('he can be talked to again', again.d < 1 && await word() === 'TALK', [again, await word()]);
await tap();
check('and he doesn\'t say it twice', (await said())?.say === '...', await said());
await page.tap('#dOpts button'); await g(() => __game.step(.1));

// the deer meat
await g(() => { const G = __game; G.S.hp = 1; walkTo(R.hearth.x - 1.6, R.hearth.z + .4, .4); G.step(.1); });
check('at the skillet the button eats', await word() === 'EAT', await word());
await tap();
const fed = await g(() => { const G = __game; G.step(.2); return { hp: G.S.hp, cooking: R.cooking(), ate: G.S.flags.ateDeerMeat, toast: document.getElementById('toast').textContent }; });
check('and it fills his hearts', fed.hp === 3 && !fed.cooking && fed.ate && /hearts full/.test(fed.toast), fed);

// what's solid and what isn't
const solid = await g(() => { const G = __game; return { robby: G.blocked(R.at.x, R.at.z, 6.15), chimney: G.blocked(R.lot.x + 4.3, R.lot.z - 1, 7), steps: G.blocked(R.lot.x - 6.3, R.lot.z, 6.15) }; });
check('he isn\'t solid, and the chimney and the steps are', !solid.robby && solid.chimney && solid.steps, solid);
const through = await g(() => { const G = __game; G.place(R.at.x - .9, R.at.z); return walkTo(R.at.x + .5, R.at.z, .3, 3); });
check('and you can walk straight through him', through.d < .6, through);
const stops = await g(() => { const G = __game; G.place(R.lot.x + 1, R.lot.z - 1); const w = walkTo(R.lot.x + 7, R.lot.z - 1, .5, 4); return { w, x: G.player.pos.x - R.lot.x }; });
check('and the chimney stops him', stops.w.d > 2 && stops.x < 3.9, stops);

// a swing near a pier takes that pier, not the whole floor
const piers = await g(() => { const G = __game, list = G.wreck.props.filter((p) => p.kind === 'pier' && Math.hypot(p.cx - R.lot.x, p.cz - R.lot.z) < 10); return list.length; });
check('the piers are one at a time', piers >= 12, piers);
const hit = await g(() => { const G = __game, list = G.wreck.props.filter((p) => p.kind === 'pier' && Math.hypot(p.cx - R.lot.x, p.cz - R.lot.z) < 10), p = list.find((o) => !o.down && o.hp === o.max && o.cz > R.lot.z + 3), standing = () => list.filter((o) => !o.down).length, had = standing(); G.place(p.cx - 1.2, p.cz); G.look(Math.atan2(-1.2, 0)); for (let k = 0; k < 3 && !p.down; k++) { G.key('f', true); G.sim(1 / 30, 1 / 30); G.key('f', false); G.sim(.9, 1 / 30); } return { down: p.down, had, left: standing() }; });
check('and a hammer takes one down and leaves the rest', hit.down && hit.left === hit.had - 1, hit);

// and a pickup goes through the memorial
const memorial = await g(() => {
  const G = __game, m = R.lot.memorial, v = G.vehicles.find((o) => o.kind === 'pickup' && !o.wrecked && !o.drowned), a = v.yaw + Math.PI / 2, off = v.K.width / 2 + 1;
  G.place(v.x + Math.sin(a) * off, v.z + Math.cos(a) * off); G.step(.6); G.key('e', true); G.sim(1 / 30, 1 / 30); G.key('e', false); G.sim(1 / 30, 1 / 30);
  const d = G.driving(); if (!d) return { boarded: false };
  d.x = m.cx - 30; d.z = m.cz; d.y = G.floorAt(d.x, d.z); d.yaw = Math.PI / 2; d.f = 0; d.s = 0; d.steer = 0; d.grounded = true; G.look(d.yaw + Math.PI);
  const steps = G.wreck.props.find((p) => p.kind === 'steps' && Math.hypot(p.cx - R.lot.x, p.cz - R.lot.z) < 12);
  G.key('w', true); for (let t = 0; t < 8 && !m.down; t += 1 / 30) G.sim(1 / 30, 1 / 30);
  for (let t = 0; t < 3 && !steps.down; t += 1 / 30) G.sim(1 / 30, 1 / 30); G.key('w', false); G.step(.6);
  return { boarded: true, down: m.down, steps: steps.down, hp: steps.hp, x: d.x - R.lot.x };
});
check('a pickup goes through the memorial', memorial.boarded && memorial.down, memorial);
check('and the steps behind it', memorial.steps, memorial);
await snap('robby-memorial-down');
await g(() => { const G = __game; if (G.driving()) G.getOut(true); G.step(.1); });

// and it's remembered that he's said it, for good
check('nothing on the church signs says what he said', !(await g(() => __game.churchSigns.list.some((s) => /DEER MEAT|FLIES OUT/.test(__game.churchSigns.says(s.c.id).join(' '))))), null);
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
await setRobby();
const kept = await g(() => { const G = __game; G.place(R.at.x - 1.4, R.at.z + .6); G.step(.1); for (let k = 0; k < 4; k++) { G.key('f', true); G.sim(1 / 30, 1 / 30); G.key('f', false); G.sim(.9, 1 / 30); } return { flag: G.S.flags.robbySaid, flies: R.flies() }; });
check('after a reload it\'s remembered he\'s said it', kept.flag === true && kept.flies === 0, kept);
await g(() => __game.step(.1)); await tap();
check('and it\'s still only "..."', (await said())?.say === '...', await said());

// ---- the light on Stuckey's Bridge. It comes when he goes back there, and nothing says what it is.
const lamp = () => g(() => { const G = __game, L = G.lamp, P = G.player.pos; return { state: L.state, x: L.x, z: L.z, shown: L.shown, hush: L.hush, through: L.through, closest: L.closest, seen: G.lampGroup.visible, far: Math.hypot(L.x - P.x, L.z - P.z), hp: G.S.hp, mode: G.S.mode, words: document.body.innerText }; });
await g(() => {
  const G = __game; if (G.driving()) G.getOut(true); G.jump('town'); G.S.flags.town = true; G.step(.1);
  window.fades = []; const fade = G.sound.fade; G.sound.fade = (bus, k) => { fades.push([bus, k]); return fade(bus, k); };
  // on until the light's done what's asked, for as long as it takes someone to walk a bridge
  window.lampUntil = (done) => { const L = G.lamp; let t = 0; while (t < 90 && !done(L)) { G.step(.1, 1 / 30); t += .1; } return t; };
});
let l = await lamp();
check('the light isn\'t there from anywhere else', l.state === 'waiting' && !l.seen, l);
await g(() => { const G = __game; G.place(-40, 0); G.look(-Math.PI / 2); G.step(1, 1 / 30); });
const atFirst = await lamp();
l = atFirst; check('it\'s out at the far end of the bridge when he comes back to it', l.state === 'out' && l.x === 24 && l.seen && l.shown > 0, l);
check('and it isn\'t quiet yet', !l.hush && !(await g(() => fades.length)), l);
await g(() => { __game.step(3, 1 / 30); }); await snap('light-far-end');
await g(() => lampUntil((L) => L.state === 'coming')); l = await lamp();
check('it starts coming after a while, without him doing anything', l.state === 'coming', l);
await g(() => lampUntil((L) => L.hush)); l = await lamp();
check('everything goes quiet while it\'s still on the bridge', l.hush && l.far < 31 && l.x > -20.6, l);
check('the music, the effects and the night', JSON.stringify(await g(() => fades)) === JSON.stringify([['music', 0], ['effects', 0], ['ambience', 0]]), await g(() => fades));
await g(() => lampUntil((L) => Math.hypot(L.x - __game.player.pos.x, L.z - __game.player.pos.z) < 4)); await snap('light-close');
await g(() => lampUntil((L) => L.through)); l = await lamp();
check('it goes through him', l.through && l.state === 'past' && l.closest < 1.4, l);
check('and does nothing to him', l.hp === atFirst.hp && l.mode === 'town', [l.hp, atFirst.hp, l.mode]);
const hurts = await g(() => { const G = __game; G.step(.5, 1 / 30); return G.blocked(G.lamp.x, G.lamp.z, 6.2); });
check('there\'s nothing there to bump into', !hurts, hurts);
await g(() => { const G = __game; G.look(Math.PI / 2); G.step(3, 1 / 30); }); await snap('light-going');
await g(() => lampUntil((L) => !L.hush)); l = await lamp();
check('it carries on out the other way, still there when it\'s quiet no more', l.state === 'past' && l.x < -40 - 25 && l.shown > 0, l);
check('and the sound comes back', JSON.stringify((await g(() => fades)).slice(3)) === JSON.stringify([['music', 1], ['effects', 1], ['ambience', 1]]), await g(() => fades));
await g(() => lampUntil((L) => L.state === 'gone')); l = await lamp();
check('and then it\'s gone', l.state === 'gone' && !l.seen, l);
await g(() => { __game.step(20, 1 / 30); }); l = await lamp();
check('it doesn\'t come again while he\'s still here', l.state === 'gone' && !l.seen, l);
check('no words anywhere say what it was', !/jason|jesse|maxwell|dana|ghost|stuckey'?s light/i.test(l.words), l.words);
await g(() => { const G = __game; G.place(...G.map.fromTrue(0, 0)); G.step(.2, 1 / 30); G.place(-40, 0); G.step(.5, 1 / 30); }); l = await lamp();
check('but it does when he\'s been away', l.state === 'out' && l.seen, l);

// ---- and if he drives up, and carries on through it, that makes no difference
const drove = await g(() => {
  const G = __game, L = G.lamp, v = G.vehicles.find((o) => o.kind === 'pickup' && !o.wrecked && !o.drowned), a = v.yaw + Math.PI / 2, off = v.K.width / 2 + 1;
  G.place(v.x + Math.sin(a) * off, v.z + Math.cos(a) * off); G.step(.6); G.key('e', true); G.sim(1 / 30, 1 / 30); G.key('e', false); G.sim(1 / 30, 1 / 30);
  const d = G.driving(); if (!d) return { boarded: false };
  // come at it along the road and onto the bridge, flat out
  d.x = -80; d.z = 0; d.y = G.floorAt(-80, 0); d.yaw = Math.PI / 2; d.f = 0; d.s = 0; d.steer = 0; d.grounded = true; G.look(d.yaw + Math.PI);
  G.place(-80, 0); G.step(.1, 1 / 30); G.key('w', true);
  const was = L.state; let t = 0, heard = false; for (; t < 30 && !L.through; t += 1 / 30) { G.step(1 / 30, 1 / 30); heard = heard || L.hush; } G.key('w', false);
  const through = L.through, hp = d.hp; G.step(1, 1 / 30); const stillDriving = !!G.driving(), mode = G.S.mode; G.getOut(true); G.step(.2, 1 / 30);
  return { boarded: true, was, through, heard, stillDriving, mode, seconds: t, on: G.S.mode };
});
check('driving, it comes the same, and he goes through it', drove.boarded && drove.through && drove.heard && drove.stillDriving, drove);

check('and there are no console errors', errors.length === 0, errors);
await close();

// ---- it isn't anywhere in the opening, and with reduced motion it still swings, only less
{
  const swings = async (reducedMotion) => {
    const p = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, reducedMotion });
    const r = await p.page.evaluate(() => {
      const G = __game; G.pause(); const opening = [];
      for (const phase of ['hang', 'swim', 'land', 'bridge']) { G.jump(phase); G.step(.5, 1 / 30); opening.push(G.lamp.state === 'waiting' && !G.lampGroup.visible); }
      G.jump('town'); G.S.flags.town = true; G.step(.1, 1 / 30); G.place(-40, 0); G.step(3, 1 / 30);
      let lo = Infinity, hi = -Infinity; for (let t = 0; t < 2; t += 1 / 12) { G.step(1 / 12, 1 / 30); const z = G.lampGroup.position.z; lo = Math.min(lo, z); hi = Math.max(hi, z); }
      return { opening, swing: hi - lo };
    });
    check(`it isn't there at any point of the opening${reducedMotion ? ', with reduced motion' : ''}`, r.opening.every(Boolean), r.opening);
    check(`and in town it swings ${r.swing.toFixed(2)} m${reducedMotion ? ', with reduced motion' : ''}`, r.swing > (reducedMotion ? .3 : .9) && r.swing < (reducedMotion ? .6 : 1.2), r);
    check('with no console errors', p.errors.length === 0, p.errors);
    await p.close(); return r.swing;
  };
  const moving = await swings(undefined), still = await swings('reduce');
  check('less with reduced motion', still < moving / 2, [still, moving]);
}

// ---- the old sheet hasn't got the flies' sound, and it doesn't say so
{
  const old = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, query: '?test#old' });
  const noise = []; old.page.on('console', (m) => { if (/flies/.test(m.text())) noise.push(m.text()); });
  await old.page.evaluate(async () => { const G = __game; G.pause(); G.jump('town'); G.S.flags.town = true; G.step(.1); G.place(G.robby.at.x - 3, G.robby.at.z); await G.sound.unlock?.(); G.step(1); });
  check('the old sheet is quiet about it', noise.length === 0 && old.errors.length === 0, [noise, old.errors]);
  await old.close();
}
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
