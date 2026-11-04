// Playing together, step 1 (CHUNKY-151): everyone in town sees everyone else, by name and by look, walking, running, driving and
// swinging, anywhere they are, and on the map. It's brought in by Play with others on the title card, and nothing in here runs until
// then: index.html's few lines for it all hang on `net`, which stays null in a game on its own.
//
// What goes over the wire, how someone's steps are smoothed and the town itself are in src/net.js and server/. This is the phone's
// side: the panel for a name and a look, the opening watched once with the rope cut for them, coming back where they left, everyone's
// bodies, their names over them and their dots on the map, the vehicles they drive, and WAVE.
//
// Everyone but the owner is someone from Chunky who un-quit, in a townsperson's body from the town's own looks, standing all the way
// up and not glowing, which is what marks a player in a crowd. That goes for you on your own screen too. They're the crowd's own
// bodies and materials in meshes of their own, so however many are in town they cost six draw calls. The owner is the hero, on a
// link of their own, and only one phone at a time. Nobody hurts anybody: a swing goes through people, and a vehicle someone else is
// driving nudges you aside and does you no harm.
import * as THREE from 'three';
import { connectNet, rollLook, makeKey, worldOf, townUrl, HOW, PHONE_KEY } from './net.js';
import { checkName, NAME_MOST } from './names.js';
import { inVehicle, settle, KINDS } from './vehicles.js';
import { toScreen, drawLabel, COLORS as MAPC } from './mapview.js';

const MOST = 25;                  // everyone the town holds, you included
const SEE = 160, NAMED = 40;      // drawn this far from the camera, and named this far from you
const SWING_FOR = .5, WAVE_FOR = 1.6;
// A swing as the townsfolk do it, a drawing at a time on the twelve: the arm up over the shoulder and down through what's in front,
// in radians forward of hanging straight down
const SWING_ARM = [-2.75, -2.95, -2.1, -1.2, -.75, -.55];
// What the phone keeps: the name and the look, which go to any town, and what it calls itself and the hero's link once it's been
// opened on it, which are each kept for one town, by the ?net it came with, and never go to another. Otherwise a link to someone
// else's town would hand them both, and with them someone's place in this one, or the hero.
export const KEPT = { key: 'chunky.net.key@', name: 'chunky.net.name', look: 'chunky.net.look', hero: 'chunky.net.hero@' };
const UP = new THREE.Vector3(0, 1, 0);
const CSS = `
#join input{font:inherit;font-size:16px;width:min(300px,82vw);padding:10px 12px;text-align:center;letter-spacing:.06em;color:var(--cream);background:var(--panel);border:2px solid var(--line);border-radius:0;-webkit-user-select:text;user-select:text}
#join input:focus{outline:2px solid var(--cyan);outline-offset:2px}
#join .looks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:min(420px,88vw)}
#join .look{display:flex;align-items:center;gap:8px;min-height:44px;padding:8px 10px;text-align:left;font-size:12px;letter-spacing:.06em;text-transform:uppercase;background:rgba(255,255,255,.05);border:1px solid var(--line)}
#join .look i{flex:none;width:16px;height:16px;border:1px solid var(--ink)}
#join .look[aria-pressed=true]{border-color:var(--rust);background:rgba(236,128,58,.14)}
#joinSay{min-height:1.6em;color:var(--cream)}
.nettag{position:fixed;left:0;top:0;z-index:3;pointer-events:none;font-size:10px;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;color:var(--cream);background:var(--panel);border:1px solid var(--line);padding:2px 6px;will-change:transform}
.nettag[hidden]{display:none}
#bW{position:absolute;right:9px;bottom:162px;width:54px;height:54px;font-size:10px;background:var(--panel);color:var(--cream);border-color:var(--cream);box-shadow:0 3px 0 var(--ink)}
#bW[hidden]{display:none}
#bH:not([hidden])~#bW{bottom:228px}
body.watching .ctl,body.watching #keyStrip{visibility:hidden}`;

// A private window can refuse storage outright, and then who they are lasts as long as the page
function kept(store) {
  const mem = {};
  return {
    get: (k) => { try { return store?.getItem(k) ?? mem[k] ?? null; } catch { return mem[k] ?? null; } },
    set: (k, v) => { mem[k] = String(v); try { store?.setItem(k, String(v)); } catch { /* not kept */ } },
  };
}

// `G` is the game, as index.html hands it over: what's in it, and the few things that have to be done from in there.
export function together(G) {
  const store = kept(G.store), looks = G.looks, S = G.S, HP = G.HP, town = G.url ?? '';
  let key = store.get(KEPT.key + town);
  if (!PHONE_KEY.test(key ?? '')) { key = makeKey(); store.set(KEPT.key + town, key); }
  const secret = store.get(KEPT.hero + town) || undefined, build = { at: G.built ?? 0, world: worldOf(G.parked) };
  // the town on this machine, unless the address says where
  const url = townUrl(G.url, location);
  let link = null, you = { id: 0, name: '', look: 0, hero: false }, picked = null;
  // started: let into town the first time; watching: the opening; arrived: somewhere in town, and saying where; alone: let go of the town
  let started = false, watching = false, arrived = false, alone = false, fadeT = -1;
  let swings = 0, waves = 0, swungAt = -9, wavedAt = -9, wasSwinging = false, keptAt = 0, keptWas = '';

  // ---------------- the panel: a name and a look
  document.head.insertAdjacentHTML('beforeend', `<style>${CSS}</style>`);
  const words = (id) => id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const swatch = (l) => { const top = l.top?.colors?.[0], bottom = l.bottom?.color; return top ? `linear-gradient(${top} 58%,${bottom ?? top} 58%)` : bottom; };
  const panel = document.createElement('div'); panel.className = 'panel'; panel.id = 'join'; panel.hidden = true;
  panel.innerHTML = `<div class="pbox"><h2>Play with <span>others</span></h2><p>Who are you?</p>
    <input id="joinName" maxlength="${NAME_MOST}" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="go" placeholder="Your name" aria-label="Your name">
    <div class="looks" role="group" aria-label="What you wear">${looks.map((l, i) => `<button class="look" data-i="${i}" aria-pressed="false"><i style="background:${swatch(l)}"></i>${words(l.id)}</button>`).join('')}</div>
    <p id="joinSay" role="status" aria-live="polite"></p>
    <button class="big" id="joinGo">Join</button><button class="forget" id="joinBack">Back</button></div>`;
  document.body.appendChild(panel);
  const nameBox = panel.querySelector('#joinName'), sayBox = panel.querySelector('#joinSay'), back = panel.querySelector('#joinBack'), lookButtons = [...panel.querySelectorAll('.look')];
  const say = (text) => { sayBox.textContent = text; };
  // the look they've picked, or the one that comes with the name until they do
  const lookNow = () => picked ?? rollLook(nameBox.value, looks.length);
  const showLook = () => { const l = lookNow(); lookButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === l))); };
  lookButtons.forEach((b, i) => b.addEventListener('click', () => { picked = i; showLook(); }));
  nameBox.addEventListener('input', showLook);
  // typing a name isn't playing: N would turn the sound off and E would act
  for (const kind of ['keydown', 'keyup']) nameBox.addEventListener(kind, (e) => { e.stopPropagation(); if (kind === 'keydown' && e.key === 'Enter') join(); });
  panel.querySelector('#joinGo').addEventListener('click', join);
  back.addEventListener('click', () => {
    panel.hidden = true;
    if (started) { alone = true; link?.close(); G.toast('Playing alone'); return; }
    link?.close(); document.getElementById('title').hidden = false; G.leave();
  });
  function show(why = '') {
    nameBox.value ||= store.get(KEPT.name) ?? '';
    const l = store.get(KEPT.look); if (picked === null && l !== null && +l >= 0 && +l < looks.length) picked = +l;
    showLook(); say(why); back.textContent = started ? 'Play alone' : 'Back';
    document.getElementById('title').hidden = true; panel.hidden = false;
    // and the mouse, if it's looking about, so the panel can be clicked
    if (document.pointerLockElement) document.exitPointerLock();
    if (!nameBox.value) nameBox.focus();
  }
  function join() {
    const named = checkName(nameBox.value);
    if (!named.ok) { say(named.why); return; }
    nameBox.value = named.name; you.name = named.name; you.look = lookNow();
    store.set(KEPT.name, named.name); if (picked !== null) store.set(KEPT.look, picked);
    say('Going into town…'); alone = false;
    if (link) { link.again(); return; }
    link = connectNet({ url, hello: () => ({ key, name: you.name, look: you.look, hero: secret, build }), status, on: { welcome, car: park, bump } });
    requestAnimationFrame(pump);
  }
  function status(s, m) {
    if (s === 'joined') { say(''); return; }
    const why = m?.say ?? 'Can\'t reach the others. Trying again.';
    // lost or full once they're playing, it tries again by itself, and they carry on meanwhile
    if (started && (s === 'lost' || s === 'full')) { G.toast(s === 'lost' ? 'Lost the others. Trying again.' : why); return; }
    if (s === 'lost' || s === 'full') { say(why); return; }
    show(why);
  }

  // ---------------- let in: the opening once, or back where they were
  function welcome(m) {
    you = { ...you, id: m.id, name: m.name, look: m.look, hero: m.hero };
    for (const c of m.cars ?? []) park(c);
    panel.hidden = true;
    // back after the line dropped: nothing to start again
    if (started) return;
    started = true; G.trainsOff();
    if (m.saved) { G.toTown(freeSpot(m.saved)); restore(m.saved); arrived = true; }
    // the owner's opening is theirs, and the first time in town they start where he wakes
    else if (m.hero) { G.toTown(null); arrived = true; }
    else { watching = true; document.body.classList.add('watching'); G.opening(); }
  }
  function restore(had) {
    S.beans = had.beans ?? 0; S.gas = had.gas ?? 0;
    for (const k of Object.keys(S.items)) delete S.items[k];
    Object.assign(S.items, had.items ?? {});
    keptWas = JSON.stringify({ beans: S.beans, items: S.items, gas: S.gas });
  }
  // where they left, unless something's been parked on it since, or it was in something they were driving
  function freeSpot(at) {
    for (let r = 0; r <= 6; r += .8) for (let k = 0; k < (r ? 10 : 1); k++) {
      const x = at.x + Math.cos(k * .628) * r, z = at.z + Math.sin(k * .628) * r, y = G.floorAt(x, z);
      if (!G.blocked(x, z, y) && y > G.water.level(x, z) - .1) return { x, y, z, yaw: at.yaw };
    }
    return at;
  }

  // The opening, watched: the rope's cut for them once the cards are done, it ends at the river, and they come to on the bank by the
  // Griffis Fountain bridge, where he wakes. The hanging stays his, so nothing's asked of them on the way.
  function watch(dt) {
    if (S.mode === 'hang' && G.cardT <= 0 && HP.cut < 1) { HP.cut = Math.min(1, HP.cut + dt / 2.4); G.dropBottle(); }
    if (S.mode === 'hang' || S.mode === 'fall') G.prompt(null);
    if (S.mode === 'swim' && fadeT < 0) { fadeT = 0; G.letGo(); }
    if (fadeT >= 0) {
      fadeT += dt; G.fade(1 - Math.min(1, fadeT / .9));
      if (fadeT >= 1) { const at = bankSpot(); watching = false; fadeT = -1; document.body.classList.remove('watching'); G.comeTo(at.x, at.z, at.yaw); arrived = true; }
    }
  }
  // on dry ground by the water, upstream or down of where the road crosses it, each of them somewhere a little different
  function bankSpot() {
    const B = G.wakeBridge, s0 = G.map.sOn(G.wakeRoad, B.x, B.z), turn = (you.id * 2.39996) % (Math.PI * 2);
    let best = null;
    for (const along of [-14, -20, -26, -32, -8, -38]) {
      const p = G.map.along(G.wakeRoad, s0 + along);
      for (const side of [1, -1]) for (const out of [7, 10, 13, 16, 5]) {
        const x = p.x + p.tz * side * out + Math.cos(turn) * 1.5, z = p.z - p.tx * side * out + Math.sin(turn) * 1.5, y = G.floorAt(x, z), wet = G.water.level(x, z);
        if (y < wet + .1 || G.blocked(x, z, y) || G.onRoad(x, z)) continue;
        // facing the water's what makes it the bank
        const near = Math.min(...[1, 2, 3].map((k) => (G.water.level(x + p.tx * k * 2, z + p.tz * k * 2) > G.floorAt(x + p.tx * k * 2, z + p.tz * k * 2) ? k : 9)));
        const score = Math.abs(along) * .05 + near;
        if (!best || score < best.score) best = { x, z, yaw: Math.atan2(p.tx, p.tz), score };
      }
    }
    if (best) return best;
    const p = G.map.along(G.wakeRoad, s0 - 3);
    return { x: p.x, z: p.z, yaw: Math.atan2(-p.tx, -p.tz) };
  }

  // ---------------- the wire
  let riding = null;
  function pump() {
    if (!link) return;
    requestAnimationFrame(pump);
    if (alone) return;
    const d = G.driving, P = G.player.pos;
    // just out of something: where it was left goes first, so it's left there for everyone
    if (riding && riding !== d && arrived) link.now(riding.x, riding.y, riding.z, riding.yaw, { ride: G.vehicles.indexOf(riding) + 1, swings, waves, how: HOW.foot });
    riding = d;
    if (!arrived) link.tend();
    else if (d) link.update(d.x, d.y, d.z, d.yaw, { ride: G.vehicles.indexOf(d) + 1, swings, waves, how: HOW.foot });
    // down until they're halfway up, coming to
    else link.update(P.x, P.y, P.z, G.player.yaw, { swings, waves, how: HP.kind === 'swim' ? HOW.swim : HP.kind === 'down' && HP.down > .5 ? HOW.down : HOW.foot });
    // What they carry goes when it changes, and every few seconds while they're nowhere yet, which is how the town knows they're
    // still there through the opening
    const now = performance.now(), had = JSON.stringify({ beans: S.beans, items: S.items, gas: S.gas });
    if (link.id && (had !== keptWas || (!arrived && now - keptAt > 2000))) { keptWas = had; keptAt = now; link.keep({ beans: S.beans, items: { ...S.items }, gas: S.gas }); }
  }

  // ---------------- vehicles someone else is in
  // One left about, by them or by anyone: where it was left, for everyone
  function park(c) {
    const v = G.vehicles[c.v];
    if (!v || v === G.driving || !Number.isFinite(c.x) || !Number.isFinite(c.z)) return;
    G.markVehicle(v, false);
    v.x = c.x; v.z = c.z; v.yaw = c.yaw ?? v.yaw; v.y = G.floorAt(v.x, v.z); v.f = v.s = v.steer = 0; settle(v, G.floorAt);
    delete v.net; driven.delete(v);
    // The word that it's been left comes before they're shown out of it, since everyone's shown a little behind, and a little way
    // back down the road. So it's their poses from in it sent before it was left that don't move it again, and a newer one from in
    // it, or anyone else's, does.
    v.leftBy = null;
    for (const w of shownList) if (w.ride === c.v + 1) v.leftBy = { w, t: w.t };
    G.markVehicle(v, true); G.vehMoved();
  }
  // Someone else was in it first: out he gets
  function bump(m) {
    if (G.driving && G.vehicles.indexOf(G.driving) + 1 === m.ride) { G.getOut(true); G.toast('Someone else is in that'); }
  }
  const driven = new Set();
  function drive(list, step) {
    const now = new Set();
    for (const w of list) {
      const v = w.ride ? G.vehicles[w.ride - 1] : null;
      if (!v || v === G.driving || (v.leftBy?.w === w && w.when <= v.leftBy.t)) continue;
      v.leftBy = null; now.add(v);
      const dx = w.x - v.x, dz = w.z - v.z, ahead = dx * Math.sin(v.yaw) + dz * Math.cos(v.yaw);
      if (v.net !== w.id) { v.net = w.id; v.spin ??= 0; }
      if (Math.abs(ahead) < 20) v.spin += ahead / v.K.wheel;
      v.x = w.x; v.z = w.z; v.yaw = w.yaw; v.y = G.floorAt(v.x, v.z); v.netSpeed = w.speed; settle(v, G.floorAt);
      if (step !== v.spinStep) { v.spinStep = step; v.shownSpin = v.spin; }
      if (Math.hypot(v.x - (v.mx ?? v.x), v.z - (v.mz ?? v.z)) > 1) { G.markVehicle(v, false); G.markVehicle(v, true); }
      G.vehMoved();
    }
    // and one they've got out of stays where it is until the town says where they left it
    for (const v of driven) if (!now.has(v)) { delete v.net; v.netSpeed = 0; }
    driven.clear(); for (const v of now) driven.add(v);
  }
  // A vehicle someone else is driving doesn't stop for you: it nudges you out of the way, to whichever side you're on, and that's all
  function nudge() {
    if (G.driving || S.mode !== 'town') return;
    const P = G.player.pos;
    for (const v of driven) {
      if (Math.abs(P.y - v.y) > 1.6 || !inVehicle(v, P.x, P.z, .4)) continue;
      const rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw), side = (P.x - v.x) * rx + (P.z - v.z) * rz >= 0 ? 1 : -1;
      for (const s of [side, -side]) {
        let x = P.x, z = P.z;
        for (let k = 0; k < 40 && inVehicle(v, x, z, .45); k++) { x += rx * s * .15; z += rz * s * .15; }
        if (inVehicle(v, x, z, .45) || G.blocked(x, z, P.y)) continue;
        P.x = x; P.z = z; G.player.kb.set(rx * s * (4 + (v.netSpeed ?? 0) * .3), rz * s * (4 + (v.netSpeed ?? 0) * .3));
        break;
      }
    }
  }

  // ---------------- everybody's bodies: the crowd's, in meshes of their own, standing up and not glowing
  const group = new THREE.Group(); G.scene.add(group);
  const [crowdBodies, bodyLines, crowdArms, armLines, crowdLegs, legLines] = G.crowdParts;
  const attr = (n, size) => new THREE.InstancedBufferAttribute(new Float32Array(n * size), size).setUsage(THREE.DynamicDrawUsage);
  const z1 = attr(MOST, 4), z2 = attr(MOST * 2, 4), wet1 = attr(MOST, 1), wet2 = attr(MOST * 2, 1), heads = attr(MOST, 1), line1 = attr(MOST, 3), line2 = attr(MOST * 2, 3);
  const geoOf = (src, z, wet, head) => { const g = src.geometry.clone(); g.setAttribute('iZ', z); g.setAttribute('iWet', wet); if (head) g.setAttribute('iHead', head); return g; };
  const mesh = (geo, mat, n, share, tint) => {
    const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.count = 0;
    if (share) m.instanceMatrix = share.instanceMatrix; else m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (tint) m.instanceColor = tint;
    group.add(m); return m;
  };
  const bodies = mesh(geoOf(crowdBodies, z1, wet1, heads), crowdBodies.material, MOST), arms = mesh(geoOf(crowdArms, z2, wet2), crowdArms.material, MOST * 2), legs = mesh(geoOf(crowdLegs, z2, wet2), crowdLegs.material, MOST * 2);
  const meshes = [bodies, mesh(bodies.geometry, bodyLines.material, MOST, bodies, line1), arms, mesh(arms.geometry, armLines.material, MOST * 2, arms, line2), legs, mesh(legs.geometry, legLines.material, MOST * 2, legs, line2)];
  // nobody's far gone or after anyone, so their lines are all the same chalk
  { const c = G.zombieLine(0, 0); for (let i = 0; i < MOST * 2; i++) { if (i < MOST) c.toArray(line1.array, i * 3); c.toArray(line2.array, i * 3); } }
  const _b = new THREE.Matrix4(), _u = new THREE.Matrix4(), _l = new THREE.Matrix4(), _m = new THREE.Matrix4(), _vb = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _ve = new THREE.Euler(0, 0, 0, 'YXZ'), _h = new THREE.Vector3();
  const bodyOf = (v) => _vb.makeRotationFromEuler(_ve.set(v.pitch, v.yaw, v.roll)).setPosition(v.x, v.y, v.z);
  // How the crowd sits in what it drives, and in anything else as he sits in it, going by the car: as much lower as his seat is, and
  // as much smaller as he is there, which is how the Camaros keep everyone's head under their roofs. The pickup's numbers come out of
  // the car's that way too.
  const sits = new Map();
  const seated = (v) => {
    let s = sits.get(v.kind);
    if (!s) {
      const car = KINDS.car, k = v.K.size / car.size, own = G.SEATED[v.kind];
      s = own ? { ...own, size: G.TOWN_SCALE } : { ...G.SEATED.car, hip: v.K.seat[1] - (car.seat[1] - G.SEATED.car.hip) * k, size: G.TOWN_SCALE * k };
      sits.set(v.kind, s);
    }
    return s;
  };
  // how each was drawn, for the tests: whose they are and the numbers that went into them
  const slots = [];
  // the angles go on the game's twelve frames a second, like everyone else's, while where they are moves every frame
  const held = new Map();
  const heldPhase = (id, phase, step) => { let h = held.get(id); if (!h) held.set(id, h = { step: -1, phase }); if (h.step !== step) { h.step = step; h.phase = phase; } return h.phase; };

  // Someone in slot i: where their feet are and which way they face, how they're going, what they're in, and their latest swing and wave
  function pose(i, p, step) {
    const seat = p.seat, size = seat ? seated(seat).size : G.TOWN_SCALE, HIP = G.ZOMBIE_HIP, ph = heldPhase(p.id, p.phase, step), lie = p.down ?? 0;
    const swim = p.how === HOW.swim && !seat, moving = p.speed > .25 && !seat && !lie, run = Math.min(1, Math.max(0, (p.speed - 4.4) / 3.6));
    const stride = moving && !swim ? Math.min(1, p.speed / 4.4) * (.36 + .26 * run) : 0;
    let { x, y, z, yaw } = p;
    // sat where you'd sit, with their hips on the seat
    if (seat) { _p.set(seat.K.seat[0], seated(seat).hip - HIP * size, seat.K.seat[2]).applyMatrix4(bodyOf(seat)); ({ x, y, z } = _p); yaw = seat.yaw; }
    const lean = seat ? .16 : swim ? 1.05 : .04 + .04 * Math.min(1, p.speed / 4.4) + .14 * run;
    // feet on the ground, lying down, or in the water up to the chin
    const up = seat ? 0 : swim ? -1.05 : 1.43 * size * (1 - lie) + .28 * lie + (moving ? Math.abs(Math.sin(ph)) * .03 : 0);
    _b.compose(_p.set(x, y + up, z), _q.setFromAxisAngle(UP, yaw), _s.setScalar(size));
    if (lie) _b.multiply(_l.makeRotationX(-1.45 * lie));
    _l.makeRotationFromEuler(_e.set(lean, 0, moving ? Math.sin(ph) * .03 : 0));
    const e = _l.elements; _l.setPosition(-HIP * e[4], HIP - HIP * e[5], -HIP * e[6]);
    _u.multiplyMatrices(_b, _l).toArray(bodies.instanceMatrix.array, i * 16);
    heads.setX(i, (seat ? G.HEAD.seated : swim ? -.5 : .04) - G.HEAD.pitch);
    const swing = !seat && !swim && p.swingAge >= 0 && p.swingAge < SWING_FOR ? SWING_ARM[Math.min(SWING_ARM.length - 1, Math.floor(p.swingAge * 12))] : null;
    const wave = !seat && p.waveAge >= 0 && p.waveAge < WAVE_FOR ? 2.55 + (G.reduceMotion ? 0 : Math.sin(Math.floor(p.waveAge * 12) * 1.9) * .28) : null;
    for (let a = 0; a < 2; a++) {
      const side = a ? 1 : -1, sw = Math.sin(ph + (a ? 0 : Math.PI));
      let reach = -lean + sw * .5 * stride, out = .07;
      if (seat) reach = seated(seat).arms;
      else if (swim) reach = -lean - 1.7 + sw * 1.3;
      else if (p.air) { reach = -lean - .5; out = .5; }
      if (swing !== null) reach = (a ? swing : swing * .85) - lean;
      if (wave !== null && a === 1) { reach = -lean; out = wave; }
      _l.makeRotationFromEuler(_e.set(reach, 0, side * out)).setPosition(side * .205, .06, 0);
      _m.multiplyMatrices(_u, _l).toArray(arms.instanceMatrix.array, (i * 2 + a) * 16);
      const legSw = Math.sin(ph + (a ? Math.PI : 0)), legA = seat ? seated(seat).legs : swim ? -.3 + Math.sin(ph * 2 + a * Math.PI) * .3 : p.air ? -.55 : -legSw * stride;
      _l.makeRotationFromEuler(_e.set(legA, 0, side * (seat ? .1 : .03))).setPosition(side * .1, HIP, 0);
      _m.multiplyMatrices(swim ? _u : _b, _l).toArray(legs.instanceMatrix.array, (i * 2 + a) * 16);
    }
    const look = p.look % looks.length;
    z1.setXYZW(i, look, 0, 0, 0); wet1.setX(i, swim ? 1 : 0);
    for (let a = 0; a < 2; a++) { z2.setXYZW(i * 2 + a, look, 0, 0, 0); wet2.setX(i * 2 + a, swim ? 1 : 0); }
    slots[i] = { id: p.id, x, z, feet: seat ? y - (seated(seat).hip - HIP * size) : y, yaw, seated: !!seat, speed: p.speed, swings: p.swings ?? swings, waves: p.waves ?? waves };
  }
  const written = () => { for (const m of meshes) m.instanceMatrix.needsUpdate = true; for (const a of [z1, z2, wet1, wet2, heads]) a.needsUpdate = true; };

  // ---------------- the hero, when the owner's in town on someone else's screen: his own rig, posed the way he poses
  let twin = null, twinStep = -1;
  function drawHero(w, step) {
    const far = !w || Math.hypot(w.x - G.camera.position.x, w.z - G.camera.position.z) > SEE;
    if (twin) twin.root.visible = !far;
    if (far) return;
    if (!twin) { const rig = G.heroTwin(), root = new THREE.Group(); root.add(rig.body); G.scene.add(root); twin = { rig, root }; }
    const R = twin.rig, seat = w.ride ? G.vehicles[w.ride - 1] : null, run = Math.min(1, Math.max(0, (w.speed - 4.4) / 3.6));
    if (seat) {
      _p.set(seat.K.seat[0], seat.K.seat[1], seat.K.seat[2]).applyMatrix4(bodyOf(seat));
      twin.root.position.copy(_p); twin.root.rotation.set(seat.pitch, seat.yaw, seat.roll, 'YXZ');
      R.body.position.set(0, 0, 0); R.body.rotation.set(0, 0, 0); R.body.scale.setScalar(G.HERO_SCALE * seat.K.size);
    } else {
      twin.root.position.set(w.x, w.y, w.z); twin.root.rotation.set(0, w.yaw, 0, 'XYZ'); R.body.scale.setScalar(G.HERO_SCALE);
      if (w.how === HOW.swim) { R.body.position.set(0, .2, 0); R.body.rotation.set(.95, 0, Math.sin(w.phase) * .08); }
      else if (w.how === HOW.down) { R.body.position.set(0, .3, 0); R.body.rotation.set(1.46, 0, .16); }
      else { R.body.position.set(0, G.HERO_HIPS + Math.abs(Math.sin(w.phase)) * .05 * Math.min(1, w.speed / 4), 0); R.body.rotation.set(.1 * Math.min(1, w.speed / 4) + .22 * run, 0, 0); }
    }
    if (step === twinStep) return;
    twinStep = step;
    const V = (x, y, z) => new THREE.Vector3(x, y, z), ph = w.phase, k = seat ? 'drive' : w.how === HOW.swim ? 'swim' : w.how === HOW.down ? 'down' : 'run', tq = step / 12;
    const hood = k === 'swim' ? G.hoods.swim : G.hoods.stand; if (R.hm.geometry !== hood.geo) R.setHood(hood);
    if (k === 'swim') {
      for (let i = 0; i < 2; i++) { const s = i ? 1 : -1, a = ph + (i ? 0 : Math.PI); R.arm(i, V(s * .2, -.05 + .14 * Math.sin(a), .42 + .16 * Math.cos(a)), V(s * .7, -.3, -.2)); R.leg(i, V(s * .14, -1.3, -.12 + .12 * Math.sin(ph * 2 + i * Math.PI)), V(s * .1, -1, .6), .3); }
    } else if (k === 'drive') {
      const K = seat.K;
      for (let i = 0; i < 2; i++) { const s = i ? 1 : -1; R.arm(i, V(s * K.hands[0], K.hands[1], K.hands[2]), V(s * .8, -.5, -.1), V(0, 1, 0)); R.leg(i, V(s * K.feet[0], K.feet[1], K.feet[2]), V(s * .14, .1, 1), -.2); }
    } else if (k === 'down') {
      for (let i = 0; i < 2; i++) { const s = i ? 1 : -1; R.arm(i, V(s * .5, .18, .58), V(s * .7, -.35, -.25)); R.leg(i, V(s * .14, -1.36, i ? -.1 : .06), V(s * .1, -1, .8)); }
    } else {
      const a = Math.min(1, w.speed / 4.2) + .5 * run;
      for (let i = 0; i < 2; i++) {
        const s = i ? 1 : -1, p = ph + (i ? Math.PI : 0), lift = Math.max(0, Math.cos(p)) * .16 * a;
        R.arm(i, V(s * .36, -.6 + .05 * a, .05 - Math.sin(p) * .28 * a), V(s * .7, -.35, -.25));
        R.leg(i, V(s * .13, -1.36 + lift, Math.sin(p) * .34 * a), V(s * .1, -1, .8), lift * 2);
      }
    }
    const age = (w.at?.swung ?? -9), since = G.time - age, waved = G.time - (w.at?.waved ?? -9);
    if (k === 'run' && since < G.SWING_T) {
      const [x, y, z, turn] = G.SWING_POSES[Math.min(G.SWING_POSES.length - 1, Math.floor(since * 12))];
      R.arm(1, V(x, y, z), V(.7, -.3, -.25), V(0, 1, .25)); R.arm(0, V(x - .05, y - Math.cos(turn) * .24, z - Math.sin(turn) * .24), V(-.7, -.3, -.25), V(0, 1, .25));
    } else if (k !== 'drive' && waved < WAVE_FOR) R.arm(1, V(.52, .6 + (G.reduceMotion ? 0 : Math.sin(step * 1.9) * .05), .08), V(.8, .1, -.2));
    R.strings(tq, k === 'run' ? Math.sin(ph) * .1 * Math.min(1, w.speed / 4.2) : 0);
  }

  // ---------------- their names over them, small and steady, like the name over whoever's nearest
  const tagBox = document.createElement('div'); document.body.appendChild(tagBox);
  const tags = Array.from({ length: MOST }, () => { const e = document.createElement('div'); e.className = 'nettag'; e.hidden = true; tagBox.appendChild(e); return { e, id: 0, text: '', x: 0, y: 0 }; });
  // just over the top of someone's head, on the screen
  function headOf(w, v) {
    const seat = w.ride ? G.vehicles[w.ride - 1] : null, x = seat ? seat.x : w.x, z = seat ? seat.z : w.z;
    const over = seat ? seat.y + seated(seat).hip + (w.hero ? 1.45 : 1.25) : w.y + (w.how === HOW.swim ? .75 : w.how === HOW.down ? .7 : w.hero ? 2.4 : 2.02);
    return v.set(x, over + G.hillUp(x, z), z).project(G.camera);
  }
  function nameTags(list) {
    const P = G.player.pos; let n = 0;
    for (const w of list) {
      if (!w.name || Math.hypot(w.x - P.x, w.z - P.z) > NAMED) continue;
      headOf(w, _h); if (_h.z >= 1 || Math.abs(_h.x) > 1.05 || Math.abs(_h.y) > 1.05) continue;
      const t = tags[n++], x = Math.round((_h.x * .5 + .5) * innerWidth), y = Math.round((-_h.y * .5 + .5) * innerHeight);
      t.id = w.id;
      if (t.text !== w.name) { t.text = w.name; t.e.textContent = w.name; }
      if (t.x !== x || t.y !== y) { t.x = x; t.y = y; t.e.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`; }
      if (t.e.hidden) t.e.hidden = false;
      if (n >= tags.length) break;
    }
    for (let i = n; i < tags.length; i++) if (!tags[i].e.hidden) { tags[i].e.hidden = true; tags[i].id = 0; }
  }

  // ---------------- WAVE: a button on a phone, and V on a keyboard
  const waveButton = document.createElement('button'); waveButton.className = 'btn'; waveButton.id = 'bW'; waveButton.textContent = 'WAVE'; waveButton.setAttribute('aria-label', 'Wave'); waveButton.hidden = true;
  document.getElementById('btns')?.appendChild(waveButton);
  const doWave = () => { if (!arrived || alone || S.mode !== 'town' || G.time - wavedAt < WAVE_FOR) return; waves = (waves + 1) & 15; wavedAt = G.time; };
  waveButton.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); doWave(); });
  addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'v' && !e.repeat && panel.hidden) doWave(); });

  // what's known of each of them, kept from frame to frame: when their swings and waves were
  const marks = new Map();
  function marked(w) {
    let m = marks.get(w.id);
    if (!m) marks.set(w.id, m = { swings: w.swings, waves: w.waves, swung: -9, waved: -9 });
    if (m.swings !== w.swings) { m.swings = w.swings; m.swung = G.time; }
    if (m.waves !== w.waves) { m.waves = w.waves; m.waved = G.time; }
    w.at = m; return m;
  }
  let shownList = [];
  const net = {
    // whether this phone is the hero's, which the town says as it lets him in
    get hero() { return you.hero; },
    // after the world's placed, each frame that's drawn
    frame(dt, step) {
      if (!started) return;
      if (watching) watch(dt);
      // nobody but the owner wears the hoodie and the tape, and that's on everyone's screen including their own
      if (arrived && !you.hero) G.heroRoot.visible = false;
      const swinging = G.swingT >= 0; if (swinging && !wasSwinging) { swings = (swings + 1) & 255; swungAt = G.time; } wasSwinging = swinging;
      const showWave = arrived && !alone && S.mode === 'town'; if (waveButton.hidden === showWave) waveButton.hidden = !showWave;
      const list = alone || !link ? [] : link.others(), cx = G.camera.position.x, cz = G.camera.position.z;
      drive(list, step); nudge();
      let n = 0, hero = null;
      if (arrived && !you.hero) {
        const d = G.driving, P = G.player.pos;
        pose(n++, { id: 0, x: P.x, y: P.y, z: P.z, yaw: G.player.yaw, speed: HP.speed, phase: HP.phase, look: you.look, seat: d, how: HP.kind === 'swim' ? HOW.swim : HOW.foot, down: HP.kind === 'down' ? HP.down : 0, air: HP.kind === 'air', swingAge: G.time - swungAt, waveAge: G.time - wavedAt }, step);
        slots[0].id = you.id;
      }
      for (const w of list) {
        const m = marked(w);
        if (w.hero) { hero = w; continue; }
        if (n >= MOST || Math.hypot(w.x - cx, w.z - cz) > SEE) continue;
        pose(n++, { ...w, seat: w.ride ? G.vehicles[w.ride - 1] : null, down: w.how === HOW.down ? 1 : 0, swingAge: G.time - m.swung, waveAge: G.time - m.waved }, step);
      }
      slots.length = n;
      for (const m of meshes) m.count = n * (m.instanceMatrix.count / MOST);
      written();
      drawHero(hero, step);
      nameTags(list);
      shownList = list;
    },
    // a dot for each of them on the map, in blue so they aren't taken for the cast, who are cyan, and the hero in the orange of
    // his own arrow, with their names on the big one
    onMap(g, v, dpr, big = false) {
      if (!started) return;
      for (const w of shownList) {
        const [x, y] = toScreen(v, w.x, w.z), hue = w.hero ? MAPC.rust : MAPC.blue;
        if (x < -10 || y < -10 || x > g.canvas.width / dpr + 10 || y > g.canvas.height / dpr + 10) continue;
        g.beginPath(); g.arc(x, y, big ? 5 : 3.5, 0, 7); g.fillStyle = hue; g.strokeStyle = MAPC.ink; g.lineWidth = 2; g.stroke(); g.fill();
        if (big && w.name) drawLabel(g, w.name, x + 11, y, '13px Bungee, Impact, sans-serif', hue, 0, 'left');
      }
      if (big) lastMap = { v, dpr, g };
    },
    // the title card's Play with others
    open() { show(''); },
  };
  let lastMap = null;
  // ---------------- for the tests
  if (G.TEST) {
    window.__net = {
      get link() { return link; }, you: () => ({ ...you }), group,
      drawn() {
        const deg = THREE.MathUtils.radToDeg, at = (m, n) => new THREE.Matrix4().fromArray(m.instanceMatrix.array, n * 16), down = new THREE.Vector3(0, -1, 0);
        return {
          count: bodies.count,
          bodies: slots.map((s, i) => {
            const B = at(bodies, i), yAxis = new THREE.Vector3().setFromMatrixColumn(B, 1).normalize(), armAt = (a) => deg(new THREE.Vector3().setFromMatrixColumn(at(arms, i * 2 + a), 1).normalize().negate().angleTo(down));
            return { ...s, look: z1.getX(i), far: z1.getY(i), hot: z1.getZ(i), up: deg(yAxis.angleTo(UP)), arms: [armAt(0), armAt(1)] };
          }),
          hero: twin ? { visible: twin.root.visible, x: twin.root.position.x, y: twin.root.position.y, z: twin.root.position.z } : null,
        };
      },
      tags: () => tags.filter((t) => !t.e.hidden).map((t) => { const r = t.e.getBoundingClientRect(); return { id: t.id, text: t.e.textContent, x: r.left + r.width / 2, y: r.bottom }; }),
      headOnScreen(id) { const w = shownList.find((o) => o.id === id); if (!w) return null; headOf(w, _h); return { x: (_h.x * .5 + .5) * innerWidth, y: (-_h.y * .5 + .5) * innerHeight }; },
      dotOnMap(id) {
        const w = shownList.find((o) => o.id === id); if (!w || !lastMap) return null;
        const [x, y] = toScreen(lastMap.v, w.x, w.z), px = lastMap.g.getImageData(Math.round(x * lastMap.dpr), Math.round(y * lastMap.dpr), 1, 1).data;
        return { x, y, rgb: [px[0], px[1], px[2]] };
      },
    };
  }
  return net;
}
