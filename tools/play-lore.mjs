// Goes and looks at what's come from the owner's lore, in docs/lore.md, with the game's own movement and real key presses: every church's sign,
// what it says today and tomorrow, and what happens when it's hit. It can't say whether the jokes are any good.
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

check('and there are no console errors', errors.length === 0, errors);
await close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
