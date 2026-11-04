// What the crowd does. There's no three.js or page in here, so node tests load it too. How they look is in index.html.
//
// They've got no eyes to speak of: sound, light and the smell of beans are all they go on, and all of it's
// sharper at night. What they are is in docs/lore.md. Most of them have gone quiet and leave him be until he starts
// something, and only the ones who've burnt down come for him on sight, which is the top of how far gone they are.
// What each of them is like and what they remember of him is in src/agents.js.

import { AFTER, AWAY, TAILING, HOW, roll } from './agents.js';

export const SHAMBLE = 0, CURIOUS = 1, HUNTING = 2, SWARM = 3, GRABBING = 4, STUNNED = 5, AVOIDING = 6, TRAILING = 7;
export const STATE_NAMES = ['shamble', 'curious', 'hunting', 'swarm', 'grabbing', 'stunned', 'avoiding', 'trailing'];

export const TUNING = {
  active: 150,                     // further from the player than this, they wait
  speed: [.75, 1.15, 3, 3.7, 0, 0, 2.8, 1.5],   // m/s by state. The player runs at 4.4, so the open ground is always an escape.
  thinkEvery: .2,                  // seconds between looks around
  smellBase: 1.5, smellPerBean: .45,  // metres. A full twelve reaches about ten at night, so standing still among them still means something.
  touch: 2,                        // metres, for someone standing dead still with nothing on them
  nightSense: 1.5,                 // how much further they reach at full night
  alertRate: [.5, 2],              // alert per second, at the edge of a sense and right on top of it
  alertFade: .3,
  curiousAt: .25,
  lookAround: 3,                   // seconds spent looking around where something was
  lostAfter: 5,                    // seconds a hunter keeps going after losing you
  swarmSize: 3, swarmReach: 10, callReach: 20,
  grabReach: .95, grabbers: 3, dragSpeed: .7,
  windUp: .5,                      // seconds it takes them to get hold of him once they're close enough, and a hit in that time stops it
  mash: .17, mashFade: .12, grabHold: 7,   // one press, how fast it slips back, and how long you've got
  stun: 1.6, shove: 2.6, mercy: 1.6,       // what breaking free buys you
  personalSpace: .95,
  feelAlong: 8,                    // seconds along a wall before trying the other way
  lightPull: .35,                  // the chance a shambler heads for a light it's near, at full night
  drowned: 3.5,                    // metres. While a lure's going they can't make out anything further off than this
  lured: 2,                        // m/s, going to one, which is quicker than going to look
  wading: .55,                     // how much of that they keep in the water
  bite: [3, 7],                    // seconds in the water before the cottonmouths have them
  goesUnder: 1.2,                  // seconds to go down after that
  thrownFalls: 15,                 // m/s², for anyone thrown
  // Nobody dies. The cottonmouths have them and the current takes them, and they come up a little way downstream, on the bank, soaked, with a snake hanging off a sleeve, and walk home.
  below: [10, 18],                 // seconds under before they come up, by their number
  current: 3.5,                    // metres a second it takes them, which is how far downstream they come up: 35 to 63 m
  dries: 80,                       // seconds they stay soaked once they're up
  snakeFor: [14, 30],              // seconds the snake hangs on, by their number
  homeIs: 3,                       // metres. Close enough is home.
  homeFor: 600,                    // seconds before someone gives up on getting home
  // The train throws them clear and they lie in the ditch, then get up sore and go home. They're sore the whole way, and for a bit after.
  soreFor: 20, soreSpeed: .7,      // seconds more, and how much of their pace they keep while they are
  meet: 8,                         // metres. Closer than this counts as being around him.
  witness: 18,                     // metres. Further off than this, they didn't notice him hurt anyone.
  tell: 8,                         // metres. How close they've got to be to pass it on.
  startle: 6,                      // metres. Someone who's scared of him gets going at this, even if he's quiet.
  backOff: 6,                      // metres past that before they settle down
  cornered: 2.2,                   // metres. With nowhere left to go, this is when even they'll turn on him.
  turnsFor: 3,                     // seconds of that
  trail: 30, trailGap: [7, 13],    // metres. How far off someone starts following him, and how far back they keep.
  tagalong: .55, tagReach: 20, tagLost: 30,   // who goes along with their own people, how far off they'll notice, and how far before they give up
  afterHim: .5,                    // the chance someone with a grudge heads his way when they've got nothing else to go on
  atHome: [8, 26],                 // seconds someone at home stays where they've got to
  // Shambling along with them, he passes for one of them. Each of them comes to see through it at their own rate, and only up close.
  actPace: 1.3,                    // m/s. No quicker than one of them going to look at something
  susReach: 5,                     // metres. Further off than this, nobody looks twice at him
  susRate: .18,                    // how much of the way to seeing through him they get in a second, right up against him with nothing on him
  susPerBean: .15,                 // and how much quicker for each can of beans he's carrying, since they can smell those
  susFade: .1,                     // a second, once he's out of their reach
  unmask: 14,                      // metres. Giving himself away gives him away to everyone this close
  // Anyone who's gone quiet leaves him be until he starts something: hits one, throws something at one, runs one down, or picks something up from right at one's feet
  riled: 10,                       // metres. Then that one comes for him, and so does anyone gone quiet this close who saw it.
  snatch: 1.6,                     // metres. What's this close to one of them is at its feet.
  scuttle: 1.08,                   // how much quicker the ones who come after him folded over go than the ones who stand up. Running, he still gets away.
};

const hypot = Math.hypot, TRY = [0, .8, 1.6, 2.4, 3.1];
function turn(from, to, k) { let d = (to - from) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return from + d * k; }

// world: { blocked(x, z, y), water(x, z), floorAt(x, z), wander(s) -> [x, z], rand(), folks: src/agents.js's, or nothing and they're nobody,
//          quiet(s) whether someone just come out has gone quiet, or nothing and nobody has,
//          comeUp(s, { metres, side, home }) -> { x, z, bank: [x, z] } where the river brings someone up, which is src/river.js's, or nothing and it's where they went under }
// on: { grab(grab), free(), overrun(), spotted(s) when one of them sees through his act, thrown(s, hit), splash(s) into the water, bitten(s) by the cottonmouths,
//       surfaced(s) up again downstream, drop(s) when the snake lets go }
export function createHorde(world, tuning = {}, on = {}) {
  const T = { ...TUNING, ...tuning }, all = [], active = [], noises = [], lights = [], zones = [], F = world.folks;
  let clock = 0, bellUntil = -1, mercy = 0;
  const h = { all, active, noises, lights, zones, T, grab: null, on };

  h.inSanctuary = (x, z) => zones.some((a) => hypot(x - a.x, z - a.z) < a.r);
  // Off limits unless the bell's ringing, to anyone outside. Anyone caught inside when it stops is on their way out, and can go round whatever's in the way.
  const offLimits = (s, x, z) => clock >= bellUntil && zones.some((a) => hypot(x - a.x, z - a.z) < a.r && hypot(s.x - a.x, s.z - a.z) >= a.r);
  const open = (s, x, z) => !world.blocked(x, z, s.y) && (s.wading || !world.water(x, z)) && !offLimits(s, x, z);

  h.add = (x, z, extra = {}) => {
    const s = { x, z, homeX: x, homeZ: z, y: world.floorAt(x, z), yaw: world.rand() * 6.28, state: SHAMBLE, tx: x, tz: z, alert: 0, timer: 0, lost: 0, moving: 0, stuck: 0, side: 0, clear: 0, next: world.rand() * T.thinkEvery, phase: world.rand() * 6.28, gait: world.rand() * 6.28, limp: world.rand() < .5 ? 0 : 1, look: Math.floor(world.rand() * 1000), size: .94 + world.rand() * .12, ...extra };
    // Everyone's somebody, and what they look like goes with who they are
    if (F) { const who = extra.who ?? F.next(); Object.assign(s, who.looks, extra); s.who = who; who.body = s; s.homeX = x; s.homeZ = z; s.mood = 0; }
    // whether they've gone quiet, unless it's been said. The people at home have their own way of being.
    if (s.quiet === undefined && !s.who?.calm) s.quiet = !!world.quiet?.(s);
    // how far over they stand, in degrees at the hips, and whether that's far enough over to come after him low and quick like that
    s.hips ??= world.hips?.(s) ?? 180;
    s.scuttle ??= s.hips < HOW.hips.scuttles;
    all.push(s); return s;
  };
  // Whether they'd leave him be just now: anyone at home, and anyone who's gone quiet and isn't already after him, unless they've got something against him
  const leaves = (s, mood) => mood !== AFTER && mood !== AWAY && (!!s.who?.calm || (!!s.quiet && s.state !== HUNTING && s.state !== SWARM && s.state !== GRABBING));
  const moodOf = (s) => (s.who ? F.mood(s.who) : 0);
  // He's started something there. Anyone gone quiet who's close enough to have seen it comes for him, or gets out of his way if they're the kind. It says how many.
  function rile(x, z) {
    let n = 0;
    for (const o of active) {
      if (!o.quiet || o.flat > 0 || o.under !== undefined || o.thrown || (o.state >= HUNTING && o.state <= STUNNED) || o.state === AVOIDING || hypot(o.x - x, o.z - z) > T.riled) continue;
      turnOn(o, x, z); n++;
    }
    return n;
  }
  // and it's him they come for: they know where he is for a while, the same as when he gives himself away
  function turnOn(s, x, z) {
    if (moodOf(s) === AWAY) s.state = AVOIDING;
    else { s.state = HUNTING; s.alert = 1; s.sus = 0; s.tx = x; s.tz = z; s.knows = clock + T.lostAfter; }
    s.lost = 0;
  }
  // He's started something with someone without knocking them down: hit them with something he threw, or picked up what was at their feet. They come for him,
  // and so does anyone gone quiet close by who saw it. Being hit is remembered like any other, by them and whoever was there. It says how many came.
  h.provoke = (s, by = 'thrown') => {
    if (s.under !== undefined || s.thrown || s.state === GRABBING) return 0;
    if (s.who && by === 'thrown') { F.hurt(s.who, s.x, s.z, by); for (const o of active) if (o !== s && o.who && !(o.flat > 0) && hypot(o.x - s.x, o.z - s.z) < T.witness) F.wasThere(o.who); }
    if (s.state === STUNNED || s.flat > 0) s.started = true; else if (!(s.who?.calm && leaves(s, moodOf(s)))) turnOn(s, s.x, s.z);
    return 1 + rile(s.x, s.z);
  };
  // Picking up what's right at the feet of one who's gone quiet counts as starting something with them. It says how many came for him over it.
  h.took = (x, z) => { let n = 0; for (const s of active) if (s.quiet && !(s.flat > 0) && hypot(s.x - x, s.z - z) < T.snatch) n += h.provoke(s, 'took'); return n; };
  // Something loud: anyone in reach goes to look
  h.noise = (x, z, r, seconds) => { noises.push({ x, z, r, until: clock + seconds }); };
  // The church bell draws them the way a lure does, and anyone it's fooled often enough stops coming. While it rings they forget the church is off limits.
  h.bell = (x, z, r, seconds) => { h.lure(x, z, r, seconds, false, 'bell'); bellUntil = clock + seconds; };
  // He's given himself away, running or fighting or in the light: anyone close who'd have noticed him turns on him, or away from him if they're scared of him. It says how many.
  h.unmask = (p, r = T.unmask) => {
    let n = 0;
    for (const s of active) {
      if (s.under !== undefined || s.thrown || s.state === GRABBING || s.state === STUNNED || hypot(s.x - p.x, s.z - p.z) > r) continue;
      const mood = moodOf(s);
      if (leaves(s, mood)) continue;
      s.sus = 0; s.alert = 1; s.lost = 0; s.tx = p.x; s.tz = p.z; s.knows = clock + T.lostAfter;
      s.state = mood === AWAY ? AVOIDING : HUNTING; n++;
    }
    return n;
  };
  // Something thrown to draw them. While it's going it's all they can make out, unless he's right on top of them, and they go to it quicker than they'd go to look.
  // One that's landed in the water takes them in after it, and the cottonmouths have them, and the river brings them up again downstream.
  h.lure = (x, z, r, seconds, wet = false, kind = 'lure') => { noises.push({ x, z, r, until: clock + seconds, lure: true, wet, kind }); };
  // Knocked flat: anyone within r goes over, thrown clear, and lies there a while. It says how many. They remember it, and so does whoever was there.
  h.knock = (x, z, r, seconds, by = 'hit') => {
    let n = 0;
    // nobody thinks of a fire or the train as something he did
    const his = by !== 'fire' && by !== 'train';
    for (const s of active) {
      const dx = s.x - x, dz = s.z - z, d = hypot(dx, dz);
      if (d >= r || s.flat > 0 || s.under !== undefined) continue;
      s.started = his || (s.started ?? false) || s.state === HUNTING || s.state === SWARM;
      // and what they were doing and where they were, which is how they're drawn for a moment before they go over
      s.hitAs = s.state; s.fromX = s.x; s.fromZ = s.z; s.reaching = 0;
      s.state = STUNNED; s.timer = seconds; s.alert = 1; s.moving = 0; s.flat = s.flatFor = seconds; n++;
      const k = 1 + (1 - d / r) * 2.4, nx = s.x + dx / (d || 1) * k, nz = s.z + dz / (d || 1) * k;
      if (open(s, nx, nz)) { s.x = nx; s.z = nz; s.y = world.floorAt(nx, nz); }
      if (s.who) F.hurt(s.who, s.x, s.z, by);
    }
    if (n && F && by !== 'fire') for (const o of active) if (o.who && !(o.flat > 0) && hypot(o.x - x, o.z - z) < T.witness) F.wasThere(o.who);
    if (n && his) rile(x, z);
    return n;
  };
  // How much longer someone's down for, getting up included. It's nothing for anyone on their feet.
  h.down = (s) => (s.flat > 0 && !s.thrown && s.under === undefined ? s.flat : 0);
  // and keeping someone who's down there for at least this much longer, for anything that needs them to stay put. It says whether they were down.
  h.keepDown = (s, seconds) => {
    if (!h.down(s)) return false;
    const more = Math.max(0, seconds - s.flat);
    s.flat += more; s.flatFor += more; s.timer = Math.max(s.timer, s.flat);
    return true;
  };
  // Run down by something that isn't him, so nobody holds it against him, though they'll keep off the spot. at(x, z, y) says what's happened to anyone in its way:
  // where they're thrown to, how they fly and how long they're down for. Nobody dies of it. They lie where they land, and when they're up they're sore, and go home.
  // It says how many.
  h.runOver = (at, by = 'train') => {
    let n = 0;
    for (const s of active) {
      if (s.thrown || s.under !== undefined) continue;
      const hit = at(s.x, s.z, s.y);
      if (!hit) continue;
      if (h.grab?.who.includes(s)) { h.grab.who.splice(h.grab.who.indexOf(s), 1); if (!h.grab.who.length) { h.grab = null; mercy = T.mercy; h.on.free?.(); } }
      s.x = hit.x; s.z = hit.z; s.thrown = { vx: hit.vx, vz: hit.vz, vy: hit.vy, spin: hit.spin ?? 0 }; s.tumble = 0; s.hitAs = undefined; s.reaching = 0;
      // whatever they were up to, they've had enough of it
      s.started = false; s.sent = true;
      s.state = STUNNED; s.timer = hit.seconds; s.alert = 1; s.moving = 0; s.flat = s.flatFor = hit.seconds + 1;
      if (s.who) F.hurt(s.who, s.x, s.z, by);
      h.on.thrown?.(s, hit);
      n++;
    }
    return n;
  };
  function fly(s, dt) {
    const f = s.thrown, nx = s.x + f.vx * dt, nz = s.z + f.vz * dt;
    s.tumble += f.spin * dt;
    if (!world.blocked(nx, nz, s.y)) { s.x = nx; s.z = nz; } else { f.vx *= -.2; f.vz *= -.2; }
    f.vy -= T.thrownFalls * dt; s.y += f.vy * dt;
    // into the water, and the river has them
    if (world.water(s.x, s.z) && s.y < (world.level?.(s.x, s.z) ?? -Infinity)) { s.thrown = null; s.tumble = 0; dive(s); h.on.splash?.(s); return; }
    const floor = world.floorAt(s.x, s.z);
    if (s.y > floor) return;
    s.y = floor; s.thrown = null; s.tumble = 0;
  }

  // Where someone's home is: the door for anyone who lives somewhere, and for the rest wherever they came out and go about from
  const homeOf = (s) => (s.home ? s.home.door : [s.homeX, s.homeZ]);
  // What's random about someone comes from their number, and not world.rand(), which would change what everyone does after it
  const luckOf = (s, salt) => roll(s.who ? s.who.id : 1e6 + s.look, salt);
  // Nobody dies of the river. The cottonmouths have them and they go under, and the current takes them, and a little later they come up downstream.
  function dive(s) {
    const below = T.below[0] + luckOf(s, 20) * (T.below[1] - T.below[0]);
    s.under = T.goesUnder + below; s.sinking = T.goesUnder; s.swept = below * T.current;
    s.wading = false; s.climbing = false; s.soaked = 0;
    // and whatever lure took them in has had its way with them, so they don't go straight back in after it
    s.spent = s.lureSeen;
    if (s.who) F.hurt(s.who, s.x, s.z, 'river');
  }
  // and up on the bank, wading out of it, with the water pouring off them and a cottonmouth hanging off a sleeve, and then home
  function surface(s) {
    const home = homeOf(s), at = world.comeUp?.(s, { metres: s.swept, side: luckOf(s, 21), home });
    if (at) { s.x = at.x; s.z = at.z; [s.tx, s.tz] = at.bank; } else { s.tx = s.x; s.tz = s.z; }
    s.y = world.floorAt(s.x, s.z);
    s.under = s.sinking = s.swept = undefined;
    // awake, whatever had them down, and not after anybody
    s.flat = 0; s.hitAs = undefined; s.thrown = null; s.tumble = 0; s.reaching = 0; s.started = false;
    s.state = SHAMBLE; s.alert = 0; s.lost = 0; s.moving = 0; s.stuck = 0; s.side = 0; s.sus = 0; s.timer = 20;
    // they have to get out first, and nothing draws them back in
    s.wading = true; s.climbing = true;
    s.wet = T.dries; s.snake = T.snakeFor[0] + luckOf(s, 22) * (T.snakeFor[1] - T.snakeFor[0]);
    if (s.sent) sore(s);
    goHome(s);
    h.on.surfaced?.(s);
  }
  // Sore, and on their way home, however far that is
  function sore(s) { s.sent = false; s.sore = T.soreFor; }
  function goHome(s) { s.homeward = true; s.homeBy = clock + T.homeFor; }
  // Another step of the way: where they're going while they're on it, and false once they're there, or have given up
  function headHome(s) {
    const [x, z] = homeOf(s), left = hypot(x - s.x, z - s.z);
    if (left < T.homeIs || clock > s.homeBy) { s.homeward = false; return false; }
    s.tx = x; s.tz = z; s.timer = left / (T.speed[SHAMBLE] * (s.sore > 0 ? T.soreSpeed : 1)) + 3;
    return true;
  }
  h.calm = () => {
    if (h.grab) h.grab = null;
    for (const s of all) { s.state = SHAMBLE; s.alert = 0; s.timer = 0; s.lost = 0; s.tx = s.x; s.tz = s.z; s.moving = 0; s.sent = false; }
  };
  // A press of the button while held
  h.mash = () => { if (!h.grab) return; h.grab.progress += T.mash / (1 + .5 * (h.grab.who.length - 1)); if (h.grab.progress >= 1) release(true); };

  function nearestNoise(s) {
    let best = null, bd = Infinity;
    // the nearest, and a lure over anything that isn't one
    for (const n of noises) { if (n === s.spent || (n.lure && s.who && (F.wise(s.who, n.kind) || (n.kind === 'train' && s.who.calm)))) continue; const d = hypot(n.x - s.x, n.z - s.z), k = n.lure ? d - 1e4 : d; if (d < n.r && k < bd) { bd = k; best = n; } }
    return best;
  }
  // Someone at home goes between the house, the door and the yard and stays a while, and if they're the kind, goes off down the road and comes back
  function homeStop(s) {
    const H = s.home, r = world.rand(), door = hypot(s.x - H.door[0], s.z - H.door[1]) < 3;
    s.timer = T.atHome[0] + world.rand() * (T.atHome[1] - T.atHome[0]);
    if (s.inside) { s.inside = false; [s.tx, s.tz] = H.door; }
    else if (door && r < .35) { s.inside = true; [s.tx, s.tz] = H.inside; }
    else if (r > .55 + s.who.homebody * .45) { [s.tx, s.tz] = world.wander(s); s.timer = hypot(s.tx - s.x, s.tz - s.z) / T.speed[SHAMBLE] + 3; }
    else if (hypot(s.x - s.homeX, s.z - s.homeZ) > 30 || r < .5) [s.tx, s.tz] = H.door;
    else { const out = 2 + world.rand() * 5, by = (world.rand() - .5) * 10; s.tx = H.door[0] + H.nx * out + H.nz * by; s.tz = H.door[1] + H.nz * out - H.nx * by; }
  }
  // Where someone goes next, once they've got nothing better to do, is up to them
  function nextStop(s, p) {
    const w = s.who;
    if (!w) { [s.tx, s.tz] = world.wander(s); return; }
    if (s.home && s.mood !== AFTER) { homeStop(s); return; }
    // along with their own people, if they're the kind who would. It's always someone who'd sooner go their own way, so nobody ends up going round in a ring.
    if (w.tagalong > T.tagalong) {
      if (s.lead && (s.lead.under !== undefined || hypot(s.lead.x - s.x, s.lead.z - s.z) > T.tagLost)) s.lead = null;
      if (!s.lead) {
        let bd = T.tagReach;
        for (const o of active) if (o !== s && o.who && o.who.family === w.family && o.who.tagalong < w.tagalong) { const q = hypot(o.x - s.x, o.z - s.z); if (q < bd) { bd = q; s.lead = o; } }
      }
      if (s.lead) { s.tx = s.lead.x + Math.cos(s.phase) * 2.5; s.tz = s.lead.z + Math.sin(s.phase) * 2.5; s.timer = 1.5 + world.rand() * 2; return; }
    }
    const fromHome = hypot(s.x - s.homeX, s.z - s.homeZ);
    if (fromHome > F.roam(w)) { s.tx = s.homeX + (world.rand() - .5) * 10; s.tz = s.homeZ + (world.rand() - .5) * 10; s.timer = fromHome / T.speed[SHAMBLE] + 2; }
    else if (s.mood === AFTER && world.rand() < T.afterHim) { s.tx = p.x + (world.rand() - .5) * 20; s.tz = p.z + (world.rand() - .5) * 20; }
    else [s.tx, s.tz] = world.wander(s);
    // the other way, if that takes them back where they were hurt, or closer to him when they're scared of him
    const closer = s.mood === AWAY && hypot(s.tx - p.x, s.tz - p.z) < hypot(s.x - p.x, s.z - p.z);
    if (closer || F.shuns(w, s.tx, s.tz)) { s.tx = s.x * 2 - s.tx; s.tz = s.z * 2 - s.tz; }
  }
  function think(s, p) {
    const w = s.who, mood = w ? (s.mood = F.mood(w)) : 0, quiet = leaves(s, mood);
    // getting out of the river, nothing draws them back in
    const d = hypot(s.x - p.x, s.z - p.z), sharp = 1 + (T.nightSense - 1) * p.night, loud = s.climbing ? null : nearestNoise(s);
    const scared = mood === AWAY || (w?.truck > 0 && p.driving);
    // Shambling, he's one of them to anyone who isn't already after him. Someone with a grudge knows him too well to be taken in, and anyone who'd leave him be doesn't look.
    const taken = !!p.acting && !p.hidden && mood !== AFTER && s.state !== HUNTING && s.state !== SWARM && s.state !== GRABBING && !quiet;
    if (taken) {
      const near = loud?.lure ? Math.min(T.susReach, T.drowned) : T.susReach;
      if (d < near) s.sus = Math.min(1, (s.sus ?? 0) + T.thinkEvery * T.susRate * (1 - d / near) * sharp * (1 + T.susPerBean * p.beans) * (w ? .6 + .8 * w.nosy : 1));
      else if (s.sus) s.sus = Math.max(0, s.sus - T.thinkEvery * T.susFade);
      // and that's it: they've seen through him
      if (s.sus >= 1) { s.sus = 0; s.alert = 1; s.state = scared ? AVOIDING : HUNTING; s.lost = 0; s.tx = p.x; s.tz = p.z; s.timer = 0; s.knows = clock + T.lostAfter; h.on.spotted?.(s); return; }
    } else if (s.sus) s.sus = Math.max(0, s.sus - T.thinkEvery * T.susFade);
    const hid = p.hidden || taken;
    // the people who live here, and the ones who've gone quiet, have got nothing against him until he gives them something
    const reach = hid || quiet ? 0 : Math.min(Math.max(p.noise * sharp, (T.smellBase + T.smellPerBean * p.beans) * sharp, p.light * sharp, T.touch) * (w ? F.senses(w, mood) : 1), loud?.lure ? T.drowned : Infinity);
    const sensed = d < reach;
    if (sensed) s.alert = Math.min(1, s.alert + T.thinkEvery * (T.alertRate[0] + (T.alertRate[1] - T.alertRate[0]) * (1 - d / reach)) * (mood === AFTER ? 2 : 1));
    else s.alert = Math.max(0, s.alert - T.thinkEvery * T.alertFade);
    s.drawn = !!loud?.lure;
    if (w) {
      if (d < T.meet) F.close(w, T.thinkEvery);
      if (loud?.lure && s.lureSeen !== loud) { s.lureSeen = loud; F.fooled(w, loud.kind); }
      // and it gets around, one of them at a time, among their own people
      if (F.hasNews(w)) { const o = active[Math.floor(world.rand() * active.length)]; if (o?.who && hypot(o.x - s.x, o.z - s.z) < T.tell) F.tell(w, o.who); }
    }
    // once they've set off after one in the water they go all the way, and anyone who hasn't got there by the time something else comes up stays out
    if (loud?.wet) s.wading = true; else if (s.wading && s.state !== CURIOUS && !world.water(s.x, s.z)) s.wading = false;

    if (s.state === STUNNED) {
      s.timer -= T.thinkEvery;
      // nobody's up while they've still got time down, which is what anything asking how long that is goes by
      if (s.timer > 0 || s.flat > 0) return;
      // run down by the train, they've had enough of whatever they were at: up, sore, and off home
      if (s.sent) { sore(s); goHome(s); s.state = SHAMBLE; s.timer = 0; s.alert = 0; s.lost = 0; s.tx = s.x; s.tz = s.z; return; }
      // up again, and after him if it was him. Anyone who'd leave him be and has no reason not to goes back to it.
      if (!scared && !s.started && (s.quiet || w?.calm) && mood !== AFTER) { s.state = SHAMBLE; s.timer = 0; s.alert = 0; s.tx = s.x; s.tz = s.z; }
      else { s.state = scared ? AVOIDING : HUNTING; s.lost = 0; s.tx = p.x; s.tz = p.z; }
      s.started = false;
      return;
    }
    // caught inside the church when the bell stopped: out they go
    if (clock >= bellUntil) for (const a of zones) {
      const d = hypot(s.x - a.x, s.z - a.z);
      if (d < a.r) { s.state = SHAMBLE; s.timer = 4; s.tx = a.x + (s.x - a.x) / (d || 1) * (a.r + 3); s.tz = a.z + (s.z - a.z) / (d || 1) * (a.r + 3); return; }
    }
    const startled = Math.max(reach * 1.5, T.startle);
    if (s.turned > 0) s.turned -= T.thinkEvery;
    else if (scared && !hid && d < startled && s.state !== AVOIDING && s.state !== GRABBING) { s.state = AVOIDING; s.lost = 0; }
    if (mood === TAILING && s.state <= CURIOUS && !loud && !hid && d < T.trail) s.state = TRAILING;
    if (s.state === AVOIDING) {
      if (!scared || hid || d > startled + T.backOff) { s.state = SHAMBLE; s.timer = 0; return; }
      if (d < T.cornered && s.stuck > 1) { s.state = HUNTING; s.lost = 0; s.tx = p.x; s.tz = p.z; s.turned = T.turnsFor; return; }
      const k = 14 / (d || 1); s.tx = s.x + (s.x - p.x) * k; s.tz = s.z + (s.z - p.z) * k;
    } else if (s.state === TRAILING) {
      if (mood !== TAILING || loud || hid || d > T.trail + 10) { s.state = SHAMBLE; s.timer = 0; return; }
      // it's always the same distance for the same person, and when they're there they stop and face him
      const gap = T.trailGap[0] + (T.trailGap[1] - T.trailGap[0]) * w.temper;
      if (d > gap + 1.5 || d < gap - 2) { const k = gap / (d || 1); s.tx = p.x + (s.x - p.x) * k; s.tz = p.z + (s.z - p.z) * k; }
      else { s.tx = s.x; s.tz = s.z; s.yaw = turn(s.yaw, Math.atan2(p.x - s.x, p.z - s.z), .35); }
    } else if (s.state === SHAMBLE) {
      if (loud) { s.state = CURIOUS; s.tx = loud.x; s.tz = loud.z; s.timer = T.lookAround; return; }
      if (s.alert >= T.curiousAt) { s.state = CURIOUS; s.tx = p.x; s.tz = p.z; s.timer = T.lookAround; return; }
      s.timer -= T.thinkEvery;
      if (s.timer <= 0 || (!s.home && hypot(s.tx - s.x, s.tz - s.z) < .6) || s.stuck > 1) {
        s.stuck = 0;
        // on their way home, and that's all they've got in mind until they're there
        if (s.homeward && headHome(s)) return;
        s.timer = 6 + world.rand() * 10;
        const near = lights.find((l) => hypot(l.x - s.x, l.z - s.z) < l.r);
        // and it keeps going until it's there
        if (near && !s.home && world.rand() < T.lightPull * p.night) { const a = world.rand() * 6.28, r = 2 + world.rand() * 5; s.tx = near.x + Math.cos(a) * r; s.tz = near.z + Math.sin(a) * r; s.timer = hypot(s.tx - s.x, s.tz - s.z) / T.speed[SHAMBLE] + 2; }
        else nextStop(s, p);
      }
    } else if (s.state === CURIOUS) {
      if (s.alert >= 1) { s.state = scared ? AVOIDING : HUNTING; s.lost = 0; return; }
      if (loud) { s.tx = loud.x; s.tz = loud.z; s.timer = T.lookAround; }
      else if (sensed) { s.tx = p.x; s.tz = p.z; s.timer = T.lookAround; }
      if (s.stuck > T.feelAlong) { s.stuck = 0; s.state = SHAMBLE; s.timer = 0; }   // can't get there
      else if (hypot(s.tx - s.x, s.tz - s.z) < 1.2) { s.timer -= T.thinkEvery; if (s.timer <= 0) { s.state = SHAMBLE; s.timer = 0; } }
    } else if (s.state === HUNTING || s.state === SWARM) {
      // a noise only pulls a hunter off you if it's lost you already, and someone who's just seen him for what he is knows where he is for a while
      if (sensed || clock < (s.knows ?? 0)) { s.lost = 0; s.tx = p.x; s.tz = p.z; }
      else {
        s.lost += T.thinkEvery;
        if (loud) { s.state = CURIOUS; s.alert = T.curiousAt; s.tx = loud.x; s.tz = loud.z; s.timer = T.lookAround; return; }
        if (s.lost >= T.lostAfter + (w ? F.holdsOn(w, mood) : 0)) { s.state = CURIOUS; s.alert = T.curiousAt; s.timer = T.lookAround; return; }
      }
      let pack = 1;
      for (const o of active) if (o !== s && (o.state === HUNTING || o.state === SWARM) && hypot(o.x - s.x, o.z - s.z) < T.swarmReach) pack++;
      s.state = pack >= T.swarmSize ? SWARM : HUNTING;
      // and nobody who'd leave him be answers it
      if (s.state === SWARM) for (const o of active) if ((o.state === SHAMBLE || o.state === CURIOUS) && hypot(o.x - s.x, o.z - s.z) < T.callReach && !(o.who && (o.who.calm || F.mood(o.who) >= AWAY)) && !leaves(o, moodOf(o))) { o.alert = Math.min(1, o.alert + T.thinkEvery); if (o.state === SHAMBLE) { o.state = CURIOUS; o.timer = T.lookAround; } o.tx = s.tx; o.tz = s.tz; }
    }
  }
  function walk(s, dt) {
    const sp = (s.drawn && s.state === CURIOUS ? T.lured : T.speed[s.state]) * (s.wading && world.water(s.x, s.z) ? T.wading : 1) * (s.sore > 0 ? T.soreSpeed : 1) * (s.scuttle && (s.state === HUNTING || s.state === SWARM) ? T.scuttle : 1);
    s.moving = 0; if (!sp) return;
    let dx = s.tx - s.x, dz = s.tz - s.z, l = hypot(dx, dz);
    if (l < .35) return;
    dx /= l; dz /= l;
    // keep out of each other's way, so they crowd rather than stack, except someone who's scared, who goes straight past anybody
    if (s.state !== AVOIDING) for (const o of active) {
      if (o === s || o.state === AVOIDING) continue;
      const ax = s.x - o.x, az = s.z - o.z;
      if (Math.abs(ax) > T.personalSpace || Math.abs(az) > T.personalSpace) continue;
      const q = hypot(ax, az); if (q > 0 && q < T.personalSpace) { const k = (T.personalSpace - q) / T.personalSpace * 1.4; dx += ax / q * k; dz += az / q * k; }
    }
    const m = hypot(dx, dz) || 1, step = sp * dt; dx /= m; dz /= m;
    // Straight if it can. Otherwise it picks a side and keeps to it, feeling along whatever's in the way.
    if (!s.side) s.side = world.rand() < .5 ? -1 : 1;
    for (const a of TRY) {
      const q = a * s.side, c = Math.cos(q), n = Math.sin(q), vx = dx * c - dz * n, vz = dx * n + dz * c, nx = s.x + vx * step, nz = s.z + vz * step;
      if (open(s, nx, nz)) {
        s.x = nx; s.z = nz; s.y = world.floorAt(nx, nz); s.moving = sp; s.yaw = turn(s.yaw, Math.atan2(vx, vz), Math.min(1, dt * 5));
        if (a === 0) { s.clear += dt; if (s.clear > .5) { s.side = 0; s.stuck = 0; } }
        else { s.clear = 0; s.stuck += dt; if (s.stuck > T.feelAlong) { s.side = -s.side; s.stuck = 0; } }
        return;
      }
    }
    s.side = -s.side; s.stuck += dt;
  }
  function holdOn(dt, p) {
    const g = h.grab;
    g.time += dt; g.progress = Math.max(0, g.progress - T.mashFade * dt);
    if (g.who.length < T.grabbers) for (const s of active) if ((s.state === HUNTING || s.state === SWARM) && hypot(s.x - p.x, s.z - p.z) < T.grabReach + .3) { s.state = GRABBING; g.who.push(s); if (g.who.length >= T.grabbers) break; }
    // they stand around you and pull the way the first of them came from
    g.who.forEach((s, i) => {
      const a = g.at + i * 2.2, k = Math.min(1, dt * 6), nx = s.x + (p.x + Math.sin(a) * .72 - s.x) * k, nz = s.z + (p.z + Math.cos(a) * .72 - s.z) * k;
      if (open(s, nx, nz)) { s.x = nx; s.z = nz; s.y = world.floorAt(nx, nz); }
      s.yaw = turn(s.yaw, Math.atan2(p.x - s.x, p.z - s.z), Math.min(1, dt * 8)); s.moving = 0;
    });
    const k = T.dragSpeed * Math.min(1.4, .7 + g.who.length * .3);
    g.dx = Math.sin(g.at) * k; g.dz = Math.cos(g.at) * k;
    if (g.time >= T.grabHold) release(false);
  }
  function release(broke) {
    const g = h.grab; h.grab = null; mercy = T.mercy;
    if (F) for (const s of g.who) if (s.who) { if (broke) F.slipped(s.who); else F.got(s.who); }
    // everyone close gets thrown off, or they'd only grab straight back on
    for (const s of active) {
      const dx = s.x - g.x, dz = s.z - g.z, d = hypot(dx, dz) || 1;
      if (!g.who.includes(s) && d > T.shove) continue;
      // whoever was after him still is when they're up again
      s.started = g.who.includes(s) || s.state === HUNTING || s.state === SWARM; s.sent = false;
      s.state = STUNNED; s.timer = T.stun; s.alert = 1; s.moving = 0;
      const nx = s.x + dx / d * T.shove, nz = s.z + dz / d * T.shove;
      if (open(s, nx, nz)) { s.x = nx; s.z = nz; }
    }
    if (broke) h.on.free?.(); else h.on.overrun?.();
  }

  // p: { x, z, y, noise, light, beans, night, hidden, canGrab, driving, acting }, and acting is him shambling along with them
  h.update = (dt, p) => {
    clock += dt; mercy = Math.max(0, mercy - dt); F?.tick(dt);
    for (let i = noises.length - 1; i >= 0; i--) if (noises[i].until < clock) noises.splice(i, 1);
    active.length = 0;
    for (const s of all) if (hypot(s.x - p.x, s.z - p.z) < T.active) active.push(s);
    for (const s of active) {
      // under the water, and the current's taking them. When it's done with them they come up.
      if (s.under !== undefined) {
        s.under -= dt; s.moving = 0;
        if (s.sinking > 0) { s.sinking -= dt; s.y -= dt * 1.5; }
        if (s.under <= 0) surface(s);
        continue;
      }
      if (s.thrown) { fly(s, dt); continue; }
      s.next -= dt;
      // and up the moment the time they're down for is over, rather than whenever they next look around
      if (s.flat > 0 && (s.flat -= dt) <= 0 && s.state === STUNNED) { s.timer = 0; s.next = 0; }
      if (s.next <= 0) { s.next += T.thinkEvery; think(s, p); }
      walk(s, dt);
      // in the water after a lure, and the cottonmouths have them. Not on their way out of it again.
      if (s.wading && !s.climbing && s.state !== GRABBING && world.water(s.x, s.z)) {
        s.soaked = (s.soaked ?? 0) + dt; s.biteAt ??= T.bite[0] + world.rand() * (T.bite[1] - T.bite[0]);
        if (s.soaked >= s.biteAt) { dive(s); h.on.bitten?.(s); }
      } else if (s.soaked) s.soaked = 0;
      if (s.climbing && !world.water(s.x, s.z)) s.climbing = false;
      // soaked for a while, and the snake lets go of the sleeve sooner than that. Sore till they're home, and for a bit after.
      if (s.wet > 0) s.wet -= dt;
      if (s.snake > 0 && (s.snake -= dt) <= 0) { s.snake = 0; h.on.drop?.(s); }
      if (s.sore > 0 && !s.homeward) s.sore -= dt;
    }
    if (h.grab) { h.grab.x = p.x; h.grab.z = p.z; holdOn(dt, p); return; }
    // Close enough, they reach for him, and it takes them a moment to get hold. Whoever's been at it longest gets there first.
    const can = mercy <= 0 && p.canGrab;
    let first = null;
    for (const s of active) {
      if (can && (s.state === HUNTING || s.state === SWARM) && hypot(s.x - p.x, s.z - p.z) < T.grabReach) { s.reaching = (s.reaching ?? 0) + dt; if (s.reaching >= T.windUp && (!first || s.reaching > first.reaching)) first = s; }
      else if (s.reaching) s.reaching = 0;
    }
    if (!first) return;
    first.reaching = 0; first.state = GRABBING;
    h.grab = { who: [first], time: 0, progress: 0, at: Math.atan2(first.x - p.x, first.z - p.z), x: p.x, z: p.z, dx: 0, dz: 0 };
    h.on.grab?.(h.grab);
  };
  return h;
}
