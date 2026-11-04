// First, one of them walking straight at him with the sound on: with his hood in the way, its outline's drawn through him, and its glow flares and it groans once as its
// hands go up, and the glow's back once it has hold of him. Then swings at one of them walking straight at him, the way the ticket says to try it: standing still, ten times on
// a phone-sized page with real taps and ten times on a laptop with real clicks, from straight ahead and from off to one side, stood up and folded over and scuttling, tapped as
// soon as they're in reach and as late as while they're reaching for him. Each time the swing has to land before they get hold of him, and without one they do. Then
// how long one stays down, lying there and getting up slowly, with him stood over it the whole time, and the picture holding and tearing when a swing lands, which
// it doesn't with reduced motion, though the glow still flares.
//
// Then the skillet (CHUNKY-171), on the phone with real taps. A tap turns him to whoever's in reach whichever way he's facing, the nearest, and one coming for him before
// one that isn't. It lands every time from 0.4 to 2.8 m off, in front, beside and behind, stood still and reaching for him, with nobody else going down, with the middle of
// the skillet's bottom on its head or its chest in the frame it lands in, and with a ray from the camera getting to its head and to its chest past him as the pan lands, or
// its outline drawn through him, both on the screen. It goes over away from him, along the line
// from him through it, and lands 1.5 to 3 m off, or short of another of them, a parked pickup or a house's wall right behind it. One coming for him stops at arm's length. A
// ring of cast iron goes over the thud, and the one it lands on jolts back as the picture holds. Two coming at him at once, one either side, go down in two taps, the second
// swinging back the other way. With reduced motion the camera stays where it was from him.
//
// Anyone of them within 4 m that he's in front of has their outline drawn through him: reaching for him, as the pan lands and lying there, and with reduced motion too. That
// it's drawn is told by what it changes on the screen, the same moment drawn with it and without, and one 6 m off has nothing drawn through him, nor does anything else.
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
  window.land = () => { G.S.mode = 'town'; G.HP.kind = 'run'; G.player.vy = 0; G.player.grounded = true; G.player.inv = 0; G.player.kb.set(0, 0); G.S.hp = 3; G.revive(); };
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
  // Whether one of them's drawn through him, and what that changes on the screen: the same moment drawn with the outlines through him and without, and how many pixels differ
  window.outlined = (s) => {
    const c = G.renderer.domElement, pix = (off) => { G.skillet.frame(off); const cv = Object.assign(document.createElement('canvas'), { width: c.width, height: c.height }), x = cv.getContext('2d'); x.drawImage(c, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
    const a = pix(false), b = pix(true); G.skillet.frame(false);
    let px = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) px++;
    return { through: G.skillet.through().includes(s), px };
  };
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
  return { ...r, peak: Math.max(0, ...r.flare), reaching: +(s.reaching ?? 0).toFixed(2), groans: Snd.state().heard.filter((n) => n === 'groan.reach').length, grab: !!H.grab, d: +dist(s).toFixed(2), outline: outlined(s) };
});
await snap('0-reaching-for-him');
check(`with his hood in the way of it ${reach.d} m off, its outline's drawn through him as its hands go up (${reach.outline.px} pixels of it)`, reach.outline.through && reach.outline.px > 300, reach.outline);
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
  return { since: +since.toFixed(2), down: +H.down(s).toFixed(2), lie: s.lie, kneel: s.kneel, grab: !!H.grab, state: s.state, outline: outlined(s) };
});
check(`${lying.since} s on, it's lying flat on its back, with ${lying.down} s left`, lying.lie > .99 && lying.kneel === 0 && lying.state === 5 && Math.abs(lying.since + lying.down - 10) < .1, lying);
check(`and where he's in front of it lying there, its outline's drawn through him (${lying.outline.px} pixels of it)`, lying.outline.through && lying.outline.px > 300, lying.outline);
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

// ---------------- the skillet (CHUNKY-171): who it lands on, where they land, and what you see of it, with real taps
const skillet = () => {
  const THREE = G.THREE, ray = new THREE.Raycaster(), v = new THREE.Vector3();
  // one of them so far off and turned so far from the way he faces, stood still and leaving him be, or coming for him
  window.put = (s, a, d, coming = false) => {
    const w = G.player.yaw + a, x = P().x + Math.sin(w) * d, z = P().z + Math.cos(w) * d;
    Object.assign(s, { x, z, y: G.floorAt(x, z), tx: x, tz: z, alert: 0, sus: 0, flat: 0, moving: 0, reaching: 0, lost: 0, timer: 99, rouse: null, quiet: !coming, state: coming ? 2 : 0, knows: coming ? 1e9 : 0, started: false, resumes: false, cool: 0, gaze: null, sore: 0 });
    if (coming) { s.tx = P().x; s.tz = P().z; s.alert = 1; }
    return s;
  };
  // the crowd but the first n out of the way, and him where he stands, facing the way he did, with nobody remembering anything
  window.only = (n) => { clear(); return H.all.slice(0, n); };
  // Who's drawn is picked four times a second, so one put down beside him isn't drawn for a moment, which nobody walking up to him ever is. This waits for it, and keeps
  // them where they were put from him, wherever he's got to.
  window.drawn = (...list) => {
    const was = list.map((s) => ({ x: s.x - P().x, z: s.z - P().z, tx: s.tx - P().x, tz: s.tz - P().z, yaw: s.yaw, reaching: s.reaching }));
    for (let i = 0; i < 12 && list.some((s) => !G.stance(s)); i++) G.step(T, T);
    list.forEach((s, i) => { const w = was[i]; Object.assign(s, { x: P().x + w.x, z: P().z + w.z, tx: P().x + w.tx, tz: P().z + w.tz, yaw: w.yaw, reaching: w.reaching }); s.y = G.floorAt(s.x, s.z); });
  };
  // a vehicle parked somewhere else the way a check parks one, by getting in, moving it and getting out, so that it stops whatever it should
  window.repark = (v, x, z, yaw) => { G.getIn(v); Object.assign(v, { x, z, y: G.floorAt(x, z), yaw, f: 0, s: 0, steer: 0, grounded: true }); G.getOut(true); };
  // what of someone can be seen as they're drawn: whether a ray from the camera gets to their head and to their chest without running into him, or they're drawn
  // through him, and whether each is on the screen. What's in his hands doesn't count, and nor does anything of his that isn't drawn, which is anything put away with what it's in.
  const under = (o, t) => { for (let p = o; p; p = p.parent) if (p === t) return true; return false; };
  const shown = (o) => { for (let p = o; p && p !== G.hero.body; p = p.parent) if (!p.visible) return false; return true; };
  window.sees = (s) => {
    const st = G.stance(s); if (!st?.headAt) return null;
    const his = []; G.hero.body.traverse((o) => { if (o.isMesh && shown(o) && !G.skillet.tools.some((t) => under(o, t))) his.push(o); });
    const cam = G.camera.position, out = {};
    for (const k of ['headAt', 'chestAt']) {
      v.fromArray(st[k]); const far = v.distanceTo(cam); ray.set(cam, v.clone().sub(cam).normalize()); ray.far = far;
      const ndc = v.clone().project(G.camera);
      out[k] = { clear: !ray.intersectObjects(his, false).length, on: Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && ndc.z < 1 };
    }
    const through = G.skillet.through().includes(s);
    return { head: (out.headAt.clear || through) && out.headAt.on, chest: (out.chestAt.clear || through) && out.chestAt.on, past: out.headAt.clear && out.chestAt.clear, through, raw: out };
  };
  // From a tap on, a step at a time with it drawn: whether it went down or got hold of him first, what could be seen of it the step before the pan landed on it, which way
  // he was facing then, where he was, where it stood and where it ended up, and whether anyone else went down. Where it's drawn as it goes over is the line from where it stood
  // to where it lands. And how far the middle of the skillet's bottom was from the middle of its head and of its chest, as they were drawn where it stood, in the frame it
  // landed in, and which of them the game says it landed on.
  window.swung = (s, others = []) => {
    const stood = { x: s.x, z: s.z }; let seen = null, faced = null, me = null, was = null, pan = null, t = 0;
    for (; t < 1.2 && !(s.flat > 0) && !H.grab; t += T) {
      seen = sees(s); was = G.stance(s); me = { x: P().x, z: P().z }; const a = G.player.yaw - Math.atan2(s.x - P().x, s.z - P().z); faced = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
      Object.assign(stood, { x: s.x, z: s.z });
      G.step(T, T);
    }
    if (s.flat > 0 && was?.headAt) { const b = G.skillet.bottom(), off = (p) => +Math.hypot(b[0] - p[0], b[1] - p[1], b[2] - p[2]).toFixed(2); pan = { head: off(was.headAt), chest: off(was.chestAt), on: G.skillet.lands()?.part ?? null }; }
    return { down: s.flat > 0, grab: !!H.grab, t: +t.toFixed(2), seen, faced: faced && +faced.toFixed(3), me, stood, landed: { x: s.x, z: s.z }, pan, others: others.map((o) => o.flat > 0) };
  };
  window.heard = () => { const play = Snd.play, asked = []; Snd.play = function (name, o) { asked.push(name); return play.call(this, name, o); }; return () => { Snd.play = play; return asked; }; };
};
await g(skillet);
const tap = async () => { await page.tap('#bA'); };
// where it went, against where it stood and where he was: how far, how far off the line from him through it, and whether it went away from him
const fell = (r) => {
  const ux = r.stood.x - r.me.x, uz = r.stood.z - r.me.z, u = Math.hypot(ux, uz) || 1, dx = r.landed.x - r.stood.x, dz = r.landed.z - r.stood.z, far = Math.hypot(dx, dz);
  return { far: +far.toFixed(2), off: far ? +Math.acos(Math.max(-1, Math.min(1, (dx * ux + dz * uz) / (far * u)))).toFixed(2) : 0, away: dx * ux + dz * uz > 0, was: +u.toFixed(2) };
};

// ---- a tap turns him to whoever's in reach, any way he's facing: the nearest, and one coming for him before one that isn't
const picks = [];
for (const [name, setup, want] of [
  ['one stood 1.5 m behind him', [[Math.PI, 1.5]], 0],
  ['one 1 m to his left and one 2 m to his right', [[1.5, 1], [-1.5, 2]], 0],
  ['one stood 1 m in front of him and one coming for him 2.2 m behind', [[0, 1], [Math.PI, 2.2, true]], 1],
  ['one coming for him 2.6 m off to his right, and nobody else', [[-1.6, 2.6, true]], 0],
]) {
  await g((setup) => { window.trial = only(setup.length).map((s, i) => put(s, ...setup[i])); G.sim(T, T); }, setup);
  await tap();
  const r = await g((want) => { const s = trial[want], others = trial.filter((o) => o !== s); return { ...swung(s, others), who: want }; }, want);
  picks.push(r.down && r.faced < .2 && !r.others.some(Boolean));
  console.log(`     ${name}: ${r.down ? `turned ${r.faced} rad off it and it went down` : r.grab ? 'it got hold of him' : 'missed'}${r.others.some(Boolean) ? ', and someone else went down too' : ''}`);
}
check(`a tap turns him to whoever's in reach in any direction, the nearest or one coming for him first, and it goes down (${picks.filter(Boolean).length} of ${picks.length})`, picks.every(Boolean), picks);

// ---- every way they can be, from everywhere: stood still from 0.4 m to 2.8 m off, and reaching for him, in front, beside and behind
const AROUND = [0, .8, -.8, 1.6, -1.6, 2.4, -2.4, Math.PI], OFF = [.4, .8, 1.4, 2, 2.8];
const all = [];
for (const kind of ['up', 'scuttle']) for (const a of AROUND) for (const d of [...OFF, 'reaching']) {
  await g(([kind, a, d]) => {
    clear(); const s = kinds[kind];
    // and a bystander on the far side of him, further off than it, where the pan would have caught it, that he doesn't turn to and mustn't go down
    const by = H.all.find((o) => o !== s && o !== kinds.up && o !== kinds.scuttle);
    if (d === 'reaching') { put(s, a, 2.2, true); closeTo(s, 0, .1); } else put(s, a, d);
    put(by, a + Math.PI, (d === 'reaching' ? dist(s) : d) + .5);
    window.trial = [s, by]; G.sim(T, T);
    if (d !== 'reaching') put(s, a, d);
    drawn(s);
  }, [kind, a, d]);
  await tap();
  const r = await g(() => swung(trial[0], [trial[1]]));
  all.push({ kind, a, d, ...r, ...fell(r) });
}
const landed = all.filter((r) => r.down && !r.grab), nobodyElse = all.filter((r) => !r.others.some(Boolean));
const seen = all.filter((r) => r.seen?.head && r.seen?.chest), away = landed.filter((r) => r.away && r.off < .35 && r.far >= 1.5 && r.far <= 3);
const show = (list) => list.slice(0, 16).map((r) => `${r.kind} ${r.a.toFixed(1)} rad ${r.d}${typeof r.d === 'number' ? ' m' : ''}: ${JSON.stringify({ down: r.down, grab: r.grab, seen: r.seen && { head: r.seen.head, chest: r.seen.chest }, far: r.far, off: r.off, away: r.away, others: r.others })}`).join('\n       ');
console.log(`     ${all.length} swings: ${landed.length} landed, ${seen.length} with its head and chest in sight as the pan got there, ${away.length} going over away from him 1.5 to 3 m, ${nobodyElse.length} with nobody else down`);
check(`it lands every time, stood still from 0.4 to 2.8 m off or reaching for him, in front, beside and behind (${landed.length} of ${all.length})`, landed.length === all.length, show(all.filter((r) => !r.down || r.grab)));
check(`and nobody he didn't turn to goes down (${nobodyElse.length} of ${all.length})`, nobodyElse.length === all.length, show(all.filter((r) => r.others.some(Boolean))));
const past = seen.filter((r) => r.seen.past).length, through = seen.filter((r) => !r.seen.past).length;
check(`you see who you hit: as the pan lands its head and chest are on the screen, with nothing of him in the way of them (${past}) or its outline drawn through him (${through}), ${seen.length} of ${all.length}`, seen.length === all.length, show(all.filter((r) => !(r.seen?.head && r.seen?.chest))));
check(`it goes over away from him, along the line from him through it, and lands 1.5 to 3 m off (${away.length} of ${landed.length})`, away.length === landed.length, show(landed.filter((r) => !(r.away && r.off < .35 && r.far >= 1.5 && r.far <= 3))));
// The skillet's on them in the frame it lands in: the middle of its bottom against the outside of their head or their chest as they were drawn where they stood, which is
// about 0.12 m from the middle of a head and 0.13 m from a chest's. It's within this much of one or the other, and never short of them.
const PAN_ON = { head: .25, chest: .3 }, onIt = all.filter((r) => r.pan && (r.pan.head <= PAN_ON.head || r.pan.chest <= PAN_ON.chest));
const panOff = (part) => all.filter((r) => r.pan?.on === part).map((r) => r.pan[part]), spread = (v) => (v.length ? `${Math.min(...v).toFixed(2)} to ${Math.max(...v).toFixed(2)} m` : 'never');
console.log(`     as it lands, the middle of the skillet's bottom is ${spread(panOff('head'))} from the middle of their head the ${panOff('head').length} times it's on their head, and ${spread(panOff('chest'))} from their chest's the ${panOff('chest').length} times it's on that`);
check(`the skillet lands on them: the middle of its bottom is within ${PAN_ON.head} m of the middle of their head or ${PAN_ON.chest} m of their chest's as it lands (${onIt.length} of ${all.length})`, onIt.length === all.length, all.filter((r) => !onIt.includes(r)).slice(0, 16).map((r) => `${r.kind} ${r.a.toFixed(1)} rad ${r.d}: ${JSON.stringify(r.pan)}`));

// ---- through nothing: with another of them, a car or a wall right behind it, it doesn't go through, and with no room it drops where it stood
// The pickup's side on 3.6 m ahead of him, so that its side is 1.2 m behind the one he swings at, and it goes back where it was after.
for (const [name, behind] of [['another of them', 'one'], ['a parked pickup', 'car']]) {
  await g(([behind]) => {
    if (behind === 'car') {
      clear(); const w = G.player.yaw, v = G.vehicles.find((q) => q.kind === 'pickup' && !q.ai && !q.kid && !q.wrecked && !q.drowned && !q.coast);
      window.parked = v; window.parkedWas = [v.x, v.z, v.yaw];
      repark(v, P().x + Math.sin(w) * 3.6, P().z + Math.cos(w) * 3.6, w + Math.PI / 2);
    }
    const [s, o] = only(2); put(s, 0, 1.4);
    if (behind === 'one') put(o, 0, 2.6);
    window.trial = [s, o]; G.sim(T, T);
  }, [behind]);
  await tap();
  const r = await g(([behind]) => {
    const r = swung(trial[0], behind === 'one' ? [trial[1]] : []), s = trial[0];
    const o = behind === 'one' ? trial[1] : window.parked, gap = Math.hypot(s.x - o.x, s.z - o.z), stoodGap = Math.hypot(r.stood.x - o.x, r.stood.z - o.z);
    const out = { ...r, gap: +gap.toFixed(2), stoodGap: +stoodGap.toFixed(2), into: behind === 'car' ? G.blocked(s.x, s.z, s.y + .6) : gap < .5, stops: behind === 'car' ? G.blocked(o.x, o.z, o.y + .6) : true };
    if (behind === 'car') repark(o, ...parkedWas);
    return out;
  }, [behind]);
  const f = fell(r);
  check(`with ${name} right behind it, it goes down short of it and not through it (${f.far} m, ${r.gap} m from it)`, r.down && r.stops && !r.into && (r.others.length === 0 || !r.others[0]) && (f.away || f.far < .05) && r.gap < r.stoodGap, { ...r, ...f });
}
// a house's wall: one 0.6 m out from it, and him 1.4 m further out, facing it, on the side of the nearest house to him that's clear for 3.5 m
const wall = await g(() => {
  const [s] = only(1), from = { x: P().x, z: P().z };
  const houses = G.structures.filter((q) => q.stops?.size).sort((a, b) => Math.hypot(a.wx - from.x, a.wz - from.z) - Math.hypot(b.wx - from.x, b.wz - from.z));
  for (const q of houses.slice(0, 20)) for (const [ax, az, bx, bz, , r] of q.stops.values()) {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, L = Math.hypot(bx - ax, bz - az);
    if (L < 2) continue;
    let nx = -(bz - az) / L, nz = (bx - ax) / L; if ((mx - q.wx) * nx + (mz - q.wz) * nz < 0) { nx = -nx; nz = -nz; }
    const out = (t) => [mx + nx * (r + t), mz + nz * (r + t)];
    if ([.5, 1, 1.5, 2, 2.5, 3, 3.5].some((t) => { const [x, z] = out(t); return G.blocked(x, z, G.floorAt(x, z) + .6); })) continue;
    const [hx, hz] = out(2), [tx, tz] = out(.6);
    land(); G.place(hx, hz); G.player.yaw = Math.atan2(-nx, -nz); G.look(G.player.yaw + Math.PI, .3);
    Object.assign(s, { x: tx, z: tz, y: G.floorAt(tx, tz), tx, tz, alert: 0, sus: 0, flat: 0, moving: 0, reaching: 0, lost: 0, timer: 99, rouse: null, quiet: true, state: 0, knows: 0 });
    G.sim(T, T);
    window.trial = [s]; window.wallAt = { mx, mz, nx, nz, r };
    return true;
  }
  return false;
});
if (!wall) check('a house wall to swing at one in front of', false, null);
else {
  await tap();
  const r = await g(() => {
    const r = swung(trial[0]), s = trial[0], w = wallAt;
    return { ...r, out: +((s.x - w.mx) * w.nx + (s.z - w.mz) * w.nz - w.r).toFixed(2), into: G.blocked(s.x, s.z, s.y + .6) };
  });
  const f = fell(r);
  check(`with a wall right behind it, it goes down short of the wall and not into it (${f.far} m, ${r.out} m out from it)`, r.down && !r.into && r.out > 0 && (f.away || f.far < .05), { ...r, ...f });
}
// one reaching for him stops at arm's length, and never comes inside him
const arm = await g(() => { const [s] = only(1); put(s, 0, 4, true); let near = Infinity; for (let t = 0; t < 4 && !H.grab; t += T) { G.sim(T, T); near = Math.min(near, dist(s)); } return { near: +near.toFixed(2), grab: !!H.grab }; });
check(`one coming for him stops at arm's length, ${arm.near} m from him at the nearest, and gets hold of him from there`, arm.near >= .65 && arm.grab, arm);
// nobody further off than 4 m is drawn through him, and with nobody nearer than that, nothing is: one stood straight ahead of him 6 m off, with everyone else a long way off
const afar = await g(() => { const [s] = only(1); put(s, 0, 6); go(.2); put(s, 0, 6); go(.2); return { d: +dist(s).toFixed(1), ...outlined(s) }; });
check(`one ${afar.d} m off isn't drawn through him, and nothing else is (${afar.px} pixels)`, !afar.through && afar.px === 0, afar);

// ---- what it feels like: a ring of cast iron over the thud, the picture holding and tearing, and the one it lands on jolting before it drops
// stood there long enough to be drawn as it stands, wherever it was before
const feel = await g(() => { const [s] = only(1); put(s, 0, 1.3); go(.3); put(s, 0, 1.3); go(.1); window.stop = heard(); window.trial = [s]; return true; });
await tap();
// It's drawn twelve times a second, so it's the first drawing after the pan lands, held with the picture, against where it stood when it was hit. How it stood before then
// isn't how it's drawn hit, so that's not what it's measured from.
const felt = await g(() => {
  const s = trial[0]; let t = 0, was = G.stance(s)?.at;
  for (; t < 1 && !(s.flat > 0); t += T) { was = G.stance(s)?.at ?? was; G.step(T, T); }
  let now = G.stance(s)?.at;
  for (let k = 0; k < 4 && now && was && now[0] === was[0] && now[2] === was[2]; k++) { G.step(T, T); now = G.stance(s)?.at; }
  const asked = stop(), jolt = now ? (now[0] - s.fromX) * s.hitX + (now[2] - s.fromZ) * s.hitZ : 0;
  return { down: s.flat > 0, thud: asked.includes('hit.flesh'), ring: asked.includes('hit.metal'), torn: document.body.classList.contains('burst'), jolt: +jolt.toFixed(3), held: s.flatFor - s.flat };
});
check('a ring of cast iron goes over the thud when it lands on someone, and the picture holds and tears', felt.down && felt.thud && felt.ring && felt.torn, felt);
check(`and the one it lands on jolts back ${felt.jolt} m from where it stood before it drops`, felt.jolt > .1, felt);

// ---- tap, tap: two coming at him at once, one on each side, go down in two taps, the second swinging back the other way
await g(() => { const [a, b] = only(2); put(a, 1.3, 1.6, true); put(b, -1.3, 1.6, true); window.trial = [a, b]; G.sim(T, T); });
await tap();
const first = await g(() => { const [a, b] = trial; let t = 0; for (; t < 1 && !(a.flat > 0 || b.flat > 0); t += T) G.step(T, T); G.step(T, T); return { t, side: G.skillet.side(), down: trial.map((s) => s.flat > 0) }; });
await tap();
const second = await g(() => { let t = 0; for (; t < 1 && !trial.every((s) => s.flat > 0) && !H.grab; t += T) G.step(T, T); return { t, side: G.skillet.side(), down: trial.map((s) => s.flat > 0), grab: !!H.grab }; });
check(`tap, tap: two coming at him at once, one either side, go down in two taps, the second swinging back the other way`, first.down.filter(Boolean).length === 1 && second.down.every(Boolean) && !second.grab && first.side === -second.side, { first, second });
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
await g(skillet);
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
// and the camera doesn't swing about to show it, but stays where it was from him: one stood straight ahead of him, where it's behind him on the screen, and one off to his side.
// It follows him a little behind wherever he goes, which is in to them as he winds up, so where it is from him is taken once it's caught up with him.
for (const a of [0, 1.6]) {
  await g((a) => { const [s] = only(1); put(s, a, 1.2); window.trial = [s]; G.sim(T, T); window.cam0 = { at: G.camera.position.clone().sub(P()), yaw: G.cam.yaw, pitch: G.cam.pitch }; }, a);
  await page.tap('#bA');
  const kept = await g(() => { const r = swung(trial[0]); go(.6); return { down: r.down, moved: +G.camera.position.clone().sub(P()).distanceTo(cam0.at).toFixed(3), turned: +(G.cam.yaw - cam0.yaw).toFixed(3), up: +(G.cam.pitch - cam0.pitch).toFixed(3) }; });
  check(`with reduced motion the camera stays where it was from him for one ${a ? 'off to his side' : 'straight ahead'} (moved ${kept.moved} m)`, kept.down && kept.moved < .05 && kept.turned === 0 && kept.up === 0, kept);
}
// the flare is brightness and not movement, so reduced motion keeps it
const calmFlare = await g(() => {
  clear(); const s = kinds.up; send(s, 0);
  let peak = 0;
  for (let t = 0; t < 5 && !H.grab && !(s.reaching > H.T.windUp * .9); t += T) { G.step(T, T); peak = Math.max(peak, G.glow(s) ?? 0); }
  return { peak: +peak.toFixed(2), outline: outlined(s) };
});
check(`with reduced motion its glow still flares as its hands go up, to ${calmFlare.peak}`, calmFlare.peak > 1.5, calmFlare);
check(`and its outline's drawn through him, with the camera where it was (${calmFlare.outline.px} pixels of it)`, calmFlare.outline.through && calmFlare.outline.px > 300, calmFlare.outline);
await snap('6-reduced-motion-reaching-for-him');
check('no console errors with reduced motion', errors.length === 0, errors.slice(0, 5));
await still.close();

console.log(failed ? `\n${failed} failed` : '\nall ok');
process.exit(failed ? 1 : 0);
