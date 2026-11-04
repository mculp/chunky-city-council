// First, one of them walking straight at him with the sound on: with his hood in the way, all that warns him is its glow flaring and one groan as its hands go up,
// and the glow's back once it has hold of him. Then swings at one of them walking straight at him, the way the ticket says to try it: standing still, ten times on
// a phone-sized page with real taps and ten times on a laptop with real clicks, from straight ahead and from off to one side, stood up and folded over and scuttling, tapped as
// soon as they're in reach and as late as while they're reaching for him. Each time the swing has to land before they get hold of him, and without one they do. Then
// how long one stays down, lying there and getting up slowly, with him stood over it the whole time, and the picture holding and tearing when a swing lands, which
// it doesn't with reduced motion, though the glow still flares.
//
// Chrome won't give a headless page the mouse, so the laptop stands in for that with what the page would be told, as npm run keys does.
//
//   npm i && npm run swing [-- --shots dir]
import { mkdirSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const PHONE = { width: 390, height: 844 }, LAPTOP = { width: 1280, height: 800 };

// the same town on every page: Chapter 1 over, the crowd out, and these
const helpers = () => {
  const G = __game; G.pause(); G.jump('town'); G.S.flags.town = true; G.S.flags.ended = G.S.flags.arrived = true; G.step(.1);
  document.getElementById('card').style.display = 'none';
  G.bringOutCrowd();
  window.G = G; window.H = G.horde; window.F = G.folks; window.T = 1 / 30; window.P = () => G.player.pos; window.Snd = G.sound;
  window.land = () => { G.S.mode = 'town'; G.HP.kind = 'run'; G.player.vy = 0; G.player.grounded = true; G.player.inv = 0; G.player.kb.set(0, 0); G.S.hp = 3; document.getElementById('fail').hidden = true; };
  // stood on US 80 west of town, facing along it, with everyone else a long way off and nobody remembering anything
  const a0 = G.map.sOn('us_80', ...G.map.fromTrue(-600, -20)), p = G.map.along('us_80', a0 + 40), q = G.map.along('us_80', a0 + 41), yaw = Math.atan2(q.x - p.x, q.z - p.z);
  window.clear = () => {
    F.forget(); H.calm(); H.noises.length = 0;
    H.all.forEach((s, i) => Object.assign(s, { x: p.x + 900 + i, z: p.z + 600, tx: p.x + 900 + i, tz: p.z + 600, state: 0, alert: 0, sus: 0, flat: 0, moving: 0, knows: 0, lost: 0, reaching: 0 }));
    land(); G.place(p.x, p.z); G.player.yaw = yaw; G.look(yaw + Math.PI, .3); G.stick(0, 0); G.sim(T, T);
  };
  // one of them 7 m off, turned a from the way he's facing, coming straight for him and not about to lose him
  window.send = (s, a) => {
    const w = G.player.yaw + a, x = P().x + Math.sin(w) * 7, z = P().z + Math.cos(w) * 7;
    Object.assign(s, { x, z, y: G.floorAt(x, z), tx: P().x, tz: P().z, state: 2, alert: 1, sus: 0, knows: 1e9, lost: 0, flat: 0, moving: 0, reaching: 0, timer: 0 });
  };
  window.dist = (s) => Math.hypot(s.x - P().x, s.z - P().z);
  window.off = (s) => { const a = G.player.yaw - Math.atan2(s.x - P().x, s.z - P().z); return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))); };
  // the two kinds who come for him, stood up and folded over and scuttling, and the burnt-down ones if there are any, who'd come for him on sight
  const one = (low) => H.all.find((s) => s.who && !s.scuttle === !low && s.quiet === false) ?? H.all.find((s) => s.who && !s.scuttle === !low);
  window.kinds = { up: one(false), scuttle: one(true) };
  // stepped on until it's this close, or has been reaching for him this long
  window.closeTo = (s, d, reach) => { for (let i = 0; i < 300 && (reach ? (s.reaching ?? 0) < reach : dist(s) > d) && !H.grab; i++) G.sim(T, T); return { d: dist(s), reaching: s.reaching ?? 0, grab: !!H.grab }; };
  // then, after the tap: which way he turned to swing, and whether it went down or got hold of him first
  window.after = (s, yaw0) => {
    G.sim(T, T); const turned = G.player.yaw - yaw0, aim = off(s);
    let t = T; for (; t < 1.5 && !(s.flat > 0) && !H.grab; t += T) G.sim(T, T);
    return { down: s.flat > 0, grab: !!H.grab, t: +t.toFixed(2), at: +dist(s).toFixed(2), turned: +Math.atan2(Math.sin(turned), Math.cos(turned)).toFixed(2), aim: +aim.toFixed(3), burst: document.body.classList.contains('burst') };
  };
  // the time, counted from whenever it's set back to nothing
  window.since = 0;
  window.go = (secs, draw = true) => { const n = Math.max(1, Math.round(secs / T)); if (draw) G.step(n * T, T); else G.sim(n * T, T); since += n * T; };
};

// ten of them coming at him: turned this far from the way he faces, tapped at this distance or this long into their reaching for him, and which kind.
// A phone turns him to anyone on his side of a right angle, and a mouse only to anyone close to where he's looking. From 2.6 m and 1.1 rad off, only
// turning to it can land it.
const TRIALS = {
  phone: [[0, 2.8, 'up'], [.4, 2.6, 'scuttle'], [-.4, 2.4, 'up'], [.8, 2.2, 'scuttle'], [-.8, 2, 'up'], [1.1, 1.8, 'scuttle'], [-1.1, 2.6, 'up'], [0, 1.2, 'scuttle'], [.3, 1, 'up'], [-.6, 'reaching', 'scuttle']],
  laptop: [[0, 2.8, 'up'], [.2, 2.6, 'scuttle'], [-.2, 2.4, 'up'], [.35, 2.2, 'scuttle'], [-.35, 2, 'up'], [.45, 1.8, 'scuttle'], [-.45, 2.6, 'up'], [0, 1.2, 'scuttle'], [.1, 1, 'up'], [-.3, 'reaching', 'scuttle']],
};
async function tenOf(device, g, press) {
  let down = 0, faced = 0;
  for (const [a, when, kind] of TRIALS[device]) {
    const got = await g(([a, when, kind]) => { clear(); const s = kinds[kind]; send(s, a); window.yaw0 = G.player.yaw; return closeTo(s, when === 'reaching' ? 0 : when, when === 'reaching' ? .15 : 0); }, [a, when, kind]);
    await press();
    const r = await g((kind) => after(kinds[kind], yaw0), kind);
    if (r.down && !r.grab) down++;
    if (r.aim < .05) faced++;
    console.log(`     ${device}, ${kind === 'up' ? 'stood up' : 'scuttling'} from ${a} rad, tapped ${when === 'reaching' ? `${got.reaching.toFixed(2)} s into reaching for him` : `at ${got.d.toFixed(2)} m`}: ${r.down && !r.grab ? `down at ${r.at} m, ${r.t} s later, turned ${r.turned}` : r.grab ? `got hold of him ${r.t} s later` : 'missed'}`);
    if (!r.down || r.aim >= .05) console.log(`       ${JSON.stringify(r)}`);
  }
  return { down, faced };
}

// ---------------- on a phone, with real taps
const phone = await serveAndOpen({ touch: true, viewport: PHONE });
let { page, errors } = phone;
let g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); };
await g(helpers);
const K = await g(() => ({ up: kinds.up.who.name, scuttle: kinds.scuttle.who.name, reach: H.T.grabReach, windUp: H.T.windUp }));
console.log(`     ${K.up} comes stood up and ${K.scuttle} scuttles, folded over. They get hold of him from ${K.reach} m, ${K.windUp} s after they're close enough.`);

// With the camera behind him, one coming straight at him is behind his hood by the time it reaches, so what warns him is its glow flaring and one groan as its hands go up.
// Nothing makes a sound until a real key or touch, and the groan's file has to have come down first. A groan's gap is in real seconds, which the next trial doesn't wait for, so this goes first.
await page.keyboard.press('x');
const ready = await page.waitForFunction(() => { const s = Snd.state(); return s.ctx === 'running' && s.waiting === 0 && s.files.includes('groan.reach'); }, null, { timeout: 30000 }).then(() => true, () => false);
check('the sound is on, started by a real key press, and the groan for reaching has come down', ready && (await g(() => Snd.state().unlocked)), await g(() => Snd.state()));
const reach = await g(() => {
  clear(); const s = kinds.up; send(s, 0); Snd.forget();
  const r = { before: null, flare: [], hands: null, groaned: null };
  // stepped with the picture drawn, since that's where the glow comes from, until it's nearly got hold of him
  for (let t = 0; t < 5 && !H.grab && !(s.reaching > H.T.windUp * .9); t += T) {
    G.step(T, T);
    if (s.reaching > 0) { r.hands ??= +t.toFixed(2); r.flare.push(G.glow(s)); } else r.before = G.glow(s);
    if (r.groaned === null && Snd.lastHeard('groan.reach')) r.groaned = +t.toFixed(2);
  }
  return { ...r, peak: Math.max(0, ...r.flare), reaching: +(s.reaching ?? 0).toFixed(2), groans: Snd.state().heard.filter((n) => n === 'groan.reach').length, grab: !!H.grab };
});
await snap('0-reaching-for-him');
const held = await g(() => { const s = kinds.up; for (let t = 0; t < 2 && !H.grab; t += T) G.step(T, T); G.step(.3, T); return { glow: G.glow(s), grab: !!H.grab, groans: Snd.state().heard.filter((n) => n === 'groan.reach').length }; });
console.log(`     coming at him its glow is ${reach.before}, and with its hands going up ${reach.flare.map((v) => v.toFixed(2)).join(', ')}, then ${held.glow} once it has hold of him`);
check('its glow flares past full as its hands go up, and keeps climbing the longer it reaches', reach.hands !== null && reach.before !== null && reach.before <= 1 && reach.peak > 1.5 && reach.flare.every((v, i) => i === 0 || v >= reach.flare[i - 1]) && !reach.grab, reach);
check('it groans once, as its hands go up', reach.groaned !== null && reach.groaned === reach.hands && reach.groans === 1, reach);
check('and its glow is back to what it was once it has hold of him, with no second groan', held.grab && held.glow !== null && held.glow <= 1 && held.groans === 1, held);

// left alone, it gets hold of him half a second after it's close enough
const none = await g(() => {
  clear(); const s = kinds.up; send(s, 0);
  let t = 0, close = null;
  for (; t < 5 && !H.grab; t += T) { G.sim(T, T); if (close === null && s.reaching > 0) close = t; }
  return { grab: !!H.grab, wait: +(t - close).toFixed(2) };
});
check(`left alone, one walking straight at him gets hold of him ${none.wait} s after it's close enough`, none.grab && Math.abs(none.wait - K.windUp) < .1, none);

const onPhone = await tenOf('phone', g, () => page.tap('#bA'));
check(`on a phone, a tap knocks it down before it gets hold of him ${onPhone.down} times out of 10`, onPhone.down >= 9, onPhone);
check(`and he turned to face it to swing ${onPhone.faced} times out of 10`, onPhone.faced === 10, onPhone);

// one tapped from right in front, and how long it stays down, with him stood over it
const from = await g(() => { clear(); const s = kinds.up; send(s, 0); closeTo(s, 2); window.yaw0 = G.player.yaw; return dist(s); });
await page.tap('#bA');
const struck = await g(() => {
  const s = kinds.up, r = after(s, yaw0);
  since = 0;
  // and turned to see it, which the camera doesn't do of its own accord
  G.look(G.player.yaw + Math.PI + .3, .22); go(T);
  return { ...r, state: s.state };
});
check(`the swing lands from ${from.toFixed(1)} m and it goes down, with the picture holding a frame and tearing`, struck.down && !struck.grab && struck.burst && struck.state === 5, struck);
await snap('1-a-swing-lands');
const lying = await g(() => {
  const s = kinds.up; go(.5);
  // stood right over it, beside it, and seen from off to one side so he isn't in the way
  const w = Math.atan2(s.x - P().x, s.z - P().z) + Math.PI / 2; G.place(s.x - Math.sin(w) * .8, s.z - Math.cos(w) * .8);
  G.player.yaw = Math.atan2(s.x - P().x, s.z - P().z); G.look(G.player.yaw + Math.PI + .7, .35); go(2.5);
  return { since: +since.toFixed(2), down: +H.down(s).toFixed(2), lie: s.lie, kneel: s.kneel, grab: !!H.grab, state: s.state };
});
check(`${lying.since} s on, it's lying flat on its back, with ${lying.down} s left`, lying.lie > .99 && lying.kneel === 0 && lying.state === 5 && Math.abs(lying.since + lying.down - 10) < .1, lying);
await snap('2-lying-there');
const kneeling = await g(() => { const s = kinds.up; go(H.down(s) - 1.2); return { since: +since.toFixed(2), down: +H.down(s).toFixed(2), lie: +s.lie.toFixed(2), kneel: +s.kneel.toFixed(2), lean: +s.lean.toFixed(2), grab: !!H.grab, state: s.state }; });
check(`at ${kneeling.since} s it's getting up, on its knees and folded over first`, kneeling.kneel > .95 && kneeling.lie < .05 && kneeling.lean > 1 && kneeling.state === 5, kneeling);
await snap('3-on-its-knees');
const rising = await g(() => { const s = kinds.up; go(.6); return { since: +since.toFixed(2), kneel: +s.kneel.toFixed(2), lean: +s.lean.toFixed(2), state: s.state }; });
check(`and at ${rising.since} s it's coming up off its knees, still folded over`, rising.state === 5 && rising.kneel > .3 && rising.kneel < .8 && rising.lean > 1, rising);
const up = await g(() => {
  const s = kinds.up;
  // what's on the screen as it gets up, to see that nothing new goes on it when it stops and turns to him
  window.before = screenText(); G.roused.log.length = 0;
  while (since < 12 && H.down(s) > 0 && !H.grab) go(T);
  return { since: +since.toFixed(2), grab: !!H.grab, state: s.state, down: H.down(s) };
});
await snap('4-up-again');
check(`it was down ${up.since} s, getting up included, and never got hold of him stood over it`, Math.abs(up.since - 10) < .2 && !lying.grab && !kneeling.grab && !up.grab && up.down === 0, { up, lying, kneeling });
// it's up, and it isn't coming yet: it stops, turns to him and flares for a second, because he hit it, and nothing on the screen says so
const turned = await g(() => { const s = kinds.up; G.step(T, T); return { state: s.state, glow: G.glow(s), noted: G.roused.log.map((r) => r.kind), added: screenText().filter((l) => !before.includes(l)), whyBox: !!document.getElementById('why'), faces: Math.abs(Math.sin((s.yaw - Math.atan2(P().x - s.x, P().z - s.z)) / 2)) }; });
check(`and it's back up, but it stops and turns to him for a second first, flaring (${turned.glow?.toFixed(2)}), because he hit it, and nothing on the screen says why`, up.state === 8 && turned.state === 8 && turned.glow > 1.4 && turned.noted.join() === 'hit' && turned.added.length === 0 && !turned.whyBox, { up, turned });
const comes = await g(() => { const s = kinds.up; go(1.1); return { state: s.state, glow: G.glow(s) }; });
check('and then it\'s after him: nobody\'s ever worse off than down', comes.state >= 2 && comes.state <= 4, comes);
check('no console errors on the phone', errors.length === 0, errors.slice(0, 5));
await phone.close();

// ---------------- on a laptop, with real clicks, and what the page would be told if Chrome gave it the mouse
const laptop = await serveAndOpen({ viewport: LAPTOP });
({ page, errors } = laptop);
g = (fn, arg) => page.evaluate(fn, arg);
await g(() => {
  const c = document.getElementById('c'); let holder = null;
  Object.defineProperty(document, 'pointerLockElement', { get: () => holder, configurable: true });
  const told = () => document.dispatchEvent(new Event('pointerlockchange'));
  c.requestPointerLock = () => { holder = c; told(); return Promise.resolve(); };
  document.exitPointerLock = () => { holder = null; told(); };
});
await g(helpers);
await g(() => clear());
// always clicked in the same place, so the mouse never moves and never turns the camera
await page.mouse.click(640, 400);
const taken = await g(() => { G.sim(T, T); return { ...G.mouse.state(), swinging: G.swinging() }; });
check('the first click takes the mouse, and doesn\'t swing', taken.locked && !taken.swinging, taken);
const onLaptop = await tenOf('laptop', g, () => page.mouse.click(640, 400));
check(`on a laptop, a click knocks it down before it gets hold of him ${onLaptop.down} times out of 10`, onLaptop.down >= 9, onLaptop);
check(`and he turned to face it to swing ${onLaptop.faced} times out of 10`, onLaptop.faced === 10, onLaptop);
// with the mouse the camera's the aim, so one well off to the side isn't turned to, and the swing goes where the camera looks
const wide = await g(() => { clear(); const s = kinds.up; send(s, 1.1); closeTo(s, 2.8); window.yaw0 = G.player.yaw; return dist(s); });
await page.mouse.click(640, 400);
const aside = await g(() => after(kinds.up, yaw0));
check(`one 1.1 rad off to the side isn't turned to with a mouse, and the swing misses it from ${wide.toFixed(1)} m`, aside.turned === 0 && !aside.down, aside);
check('no console errors on the laptop', errors.length === 0, errors.slice(0, 5));
await laptop.close();

// ---------------- with reduced motion it still goes down, and stays down as long, with no frame held and nothing torn
const still = await serveAndOpen({ touch: true, viewport: PHONE, reducedMotion: 'reduce' });
({ page, errors } = still);
g = (fn, arg) => page.evaluate(fn, arg);
await g(helpers);
await g(() => { clear(); const s = kinds.up; send(s, 0); closeTo(s, 2); window.yaw0 = G.player.yaw; });
await page.tap('#bA');
const calm = await g(() => {
  const s = kinds.up, r = after(s, yaw0);
  since = 0; let torn = r.burst;
  G.look(G.player.yaw + Math.PI + .3, .22);
  while (since < .3) { go(T); torn ||= document.body.classList.contains('burst'); }
  while (since < 12 && H.down(s) > 0) go(T, false);
  return { ...r, torn, took: +since.toFixed(2) };
});
check(`with reduced motion a swing still knocks it down, for ${calm.took} s, and the picture doesn't hold or tear`, calm.down && !calm.grab && !calm.torn && Math.abs(calm.took - 10) < .2, calm);
await snap('5-reduced-motion-up-again');
// the flare is brightness and not movement, so reduced motion keeps it
const calmFlare = await g(() => {
  clear(); const s = kinds.up; send(s, 0);
  let peak = 0;
  for (let t = 0; t < 5 && !H.grab && !(s.reaching > H.T.windUp * .9); t += T) { G.step(T, T); peak = Math.max(peak, G.glow(s) ?? 0); }
  return +peak.toFixed(2);
});
check(`with reduced motion its glow still flares as its hands go up, to ${calmFlare}`, calmFlare > 1.5, calmFlare);
await snap('6-reduced-motion-reaching-for-him');
check('no console errors with reduced motion', errors.length === 0, errors.slice(0, 5));
await still.close();

console.log(failed ? `\n${failed} failed` : '\nall ok');
process.exit(failed ? 1 : 0);
