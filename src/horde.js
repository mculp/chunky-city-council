// What the crowd does. There's no three.js or page in here, so node tests load it too. How they look is in index.html.
//
// They've got no eyes to speak of: sound, light and the smell of beans are all they go on, and all of it's
// sharper at night. What they are is in docs/lore.md. Most of them have gone quiet and leave him be until he starts
// something, and only the ones who've burnt down come for him on sight, which is the top of how far gone they are.
// What each of them is like and what they remember of him is in src/agents.js.
//
// Nobody comes for him for no reason, and there's always a way out. Before one does, it stops, turns to him and flares for a second (ROUSED), and nothing on screen says why.
// If he backs off in that second it goes back to what it was doing. No more than three are after him at once, and the rest look up and go back. None of them is as quick
// as he is, and one that loses him for about eight seconds gives up and wanders home.
//
// Nothing draws a crowd but supper, and supper isn't here yet. A noise he makes, a crash or an alarm or a swing, rouses the ones who've burnt down and are near enough to hear it,
// and they come for him and not for wherever it was. A thrown bottle or firecrackers make one near enough turn and look at them for a few seconds, which is enough to slip past it,
// and a fire of lighter fluid is looked at while it burns, and nobody walks over to any of it. The ones who've gone quiet, and everyone at home, don't care about any of it.

import { AFTER, AWAY, TAILING, HOW, roll } from './agents.js';

// 3 was the swarm, three of them together going quicker and calling the rest over. Nothing draws a crowd, so nothing's in it any more; the number's kept so that nothing else moves.
export const SHAMBLE = 0, CURIOUS = 1, HUNTING = 2, SWARM = 3, GRABBING = 4, STUNNED = 5, AVOIDING = 6, TRAILING = 7, ROUSED = 8;
export const STATE_NAMES = ['shamble', 'curious', 'hunting', 'swarm', 'grabbing', 'stunned', 'avoiding', 'trailing', 'roused'];

export const TUNING = {
  active: 150,                     // further from the player than this, they wait
  // m/s by state. The player runs at 4.4, and the quickest of them, one coming after him folded over, tops out at three quarters of that, so the open ground is always an escape.
  speed: [.75, 1.15, 3, 0, 0, 0, 2.8, 1.5, 0],
  thinkEvery: .2,                  // seconds between looks around
  // Smell. With five cans of beans or fewer nobody smells him at all, and a dozen reaches 2 m, or about 3 at night, which is when it matters.
  smellFrom: 5, smellPerBean: 2 / 7,
  touch: 2,                        // metres, for someone standing dead still with nothing on them
  nightSense: 1.5,                 // how much further they reach at full night
  alertRate: [.5, 2],              // alert per second, at the edge of a sense and right on top of it
  alertFade: .3,
  curiousAt: .25,
  lookAround: 3,                   // seconds spent looking around where something was
  lostAfter: 5,                    // seconds someone who's just seen him for what he is knows where he is, without being able to see him
  // Never for no reason: before one comes for him it stops, turns to him and flares for this long, and backing off by this much in that time sends it back to what it was doing
  rouseFor: 1, rouseBack: 1.5, faceRate: 8, coolFor: 3,
  afterMost: 3,                    // no more than this many after him at once, however much noise he makes. The rest look up, for this long, and go back.
  lookFor: .7,
  // They give up. One that can't see him, round a corner or further off than this, for this long, stops, folds back down and wanders home.
  sight: 25, sightStep: .5, giveUp: 8, stops: 1,
  grabReach: .95, grabbers: 3, dragSpeed: .7,
  armsLength: .8,                  // metres. One coming for him gets no nearer than this, and reaches for him from here.
  windUp: .5,                      // seconds it takes them to get hold of him once they're close enough, and a hit in that time stops it
  // Hit with something he swung, the one he swung at goes over away from him and lands this far off, by their number, short of a wall or a car or the water, with this much room
  // left between them and anyone else, and room for this much of them lying there past where they land
  knockedOff: [1.9, 2.5], lieApart: .6, lieReach: .7,
  mash: .17, mashFade: .12, grabHold: 7,   // one press, how fast it slips back, and how long you've got
  stun: 1.6, shove: 2.6, mercy: 1.6,       // what breaking free buys you
  personalSpace: .95,
  feelAlong: 8,                    // seconds along a wall before trying the other way
  lightPull: .35,                  // the chance a shambler heads for a light it's near, at full night
  wading: .55,                     // how much of their pace they keep in the water, wading out of it. Nobody goes in after anything.
  goesUnder: 1.2,                  // seconds to go down, for anyone the train throws in
  thrownFalls: 15,                 // m/s², for anyone thrown
  // Hit by what he's driving at 40 mph or more, they go flying, limp: up over the top of it about one time in three and ahead of it otherwise, the faster the higher and further,
  // bouncing a couple of times, less each time, and lying in a heap however they come down
  flingFrom: 17.9,                 // m/s, which is 40 mph
  flungOver: .35, bounces: 2, bounce: .34, bounceFrom: 2.5,
  // Nobody dies. The cottonmouths have whoever the train throws in and the current takes them, and they come up a little way downstream, on the bank, soaked, with a snake hanging off a sleeve, and walk home.
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
  susPerBean: .257,                // and how much quicker for each can of beans he's carrying past what they can smell (smellFrom), so twelve is a bit under three times as quick
  susFade: .1,                     // a second, once he's out of their reach
  unmask: 14,                      // metres. Giving himself away gives him away to everyone this close
  // Anyone who's gone quiet leaves him be until he starts something: hits one, throws something at one, runs one down, or picks something up from right at one's feet
  riled: 10,                       // metres. Then that one comes for him, and so does anyone gone quiet this close who saw it.
  snatch: 1.6,                     // metres. What's this close to one of them is at its feet.
  scuttle: 1.08,                   // how much quicker the ones who come after him folded over go than the ones who stand up. Running, he still gets away.
};
// He runs at 4.4, and the quickest of them tops out at about three quarters of that
export const RUN_SPEED = 4.4;

const hypot = Math.hypot, TRY = [0, .8, 1.6, 2.4, 3.1];
function turn(from, to, k) { let d = (to - from) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return from + d * k; }

// world: { blocked(x, z, y, flying), flying for anyone in the air, water(x, z), floorAt(x, z), wander(s) -> [x, z], rand(), folks: src/agents.js's, or nothing and they're nobody,
//          quiet(s) whether someone just come out has gone quiet, or nothing and nobody has, reaching(s) as one of them starts to reach for him, once for each time,
//          comeUp(s, { metres, side, home }) -> { x, z, bank: [x, z] } where the river brings someone up, which is src/river.js's, or nothing and it's where they went under }
//          sees(s, p) whether one of them can see him from where it stands, or nothing and it's walls from world.blocked,
// on: { grab(grab), free(), overrun(), spotted(s) when one of them sees through his act, roused(s, why) as one stops and turns to him before it comes, thrown(s, hit),
//       splash(s) into the water, surfaced(s) up again downstream, drop(s) when the snake lets go, flung(s) as one goes flying, bounce(s, speed) as one hits the ground and goes up again }
export function createHorde(world, tuning = {}, on = {}) {
  const T = { ...TUNING, ...tuning }, all = [], active = [], noises = [], looks = [], lights = [], zones = [], F = world.folks;
  let clock = 0, mercy = 0, hearAt = 0, watch = { x: 0, z: 0 };
  const h = { all, active, noises, looks, lights, zones, T, grab: null, on };

  // A zone's a circle, { x, z, r }, or a box, { x0, z0, x1, z1, out }, where `out` is the way out of it for anyone caught inside
  const inZone = (a, x, z) => (a.r !== undefined ? hypot(x - a.x, z - a.z) < a.r : x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1);
  h.inSanctuary = (x, z) => zones.some((a) => inZone(a, x, z));
  // Off limits, to anyone outside, always, and the bell doesn't change that. Anyone caught inside is on their way out, and can go round whatever's in the way.
  const offLimits = (s, x, z) => zones.some((a) => inZone(a, x, z) && !inZone(a, s.x, s.z));
  const open = (s, x, z) => !world.blocked(x, z, s.y) && (s.wading || !world.water(x, z)) && !offLimits(s, x, z);

  h.add = (x, z, extra = {}) => {
    const s = { x, z, homeX: x, homeZ: z, y: world.floorAt(x, z), yaw: world.rand() * 6.28, state: SHAMBLE, tx: x, tz: z, alert: 0, timer: 0, lost: 0, moving: 0, stuck: 0, side: 0, clear: 0, next: world.rand() * T.thinkEvery, phase: world.rand() * 6.28, gait: world.rand() * 6.28, limp: world.rand() < .5 ? 0 : 1, look: Math.floor(world.rand() * 1000), size: .94 + world.rand() * .12, ...extra };
    // Everyone's somebody, and what they look like goes with who they are
    if (F) { const who = extra.who ?? F.next(); Object.assign(s, who.looks, extra); s.who = who; who.body = s; s.homeX = x; s.homeZ = z; s.mood = 0; }
    // whether they've gone quiet, unless it's been said. The people at home have their own way of being.
    if (s.quiet === undefined && !s.who?.calm) s.quiet = !!world.quiet?.(s);
    // how far over they stand, as their number in degrees at the hips, and whether that's far enough over to stay folded over and scuttle after him
    s.hips ??= world.hips?.(s) ?? 180;
    s.scuttle ??= s.hips < HOW.hips.scuttles;
    all.push(s); return s;
  };
  // After him: hunting or holding on to him
  const isAfter = (s) => s.state === HUNTING || s.state === GRABBING;
  // Whether they'd leave him be just now: anyone at home, and anyone who's gone quiet and isn't already after him, unless they've got something against him
  const leaves = (s, mood) => mood !== AFTER && mood !== AWAY && (!!s.who?.calm || (!!s.quiet && !isAfter(s)));
  const moodOf = (s) => (s.who ? F.mood(s.who) : 0);
  // How many are after him, and how many are about to be. A roused one that's only looking up isn't.
  function afterCount() { let n = 0; for (const o of active) if (isAfter(o) || (o.state === ROUSED && !o.rouse.over)) n++; return n; }

  // ---- Never for no reason. One that's about to come for him stops, turns to him and flares for a second first, and that's all anyone's told of it: nothing on screen says why. why is
  // { kind, her }: kind is what woke it ('crash', 'beans', 'light', 'hit', 'cornered' and so on) and her is whether whoever he hit is a woman. It's what has to still be true by the end of the second
  // for one that was woken by something about him (SENSES), and what the page keeps a log of for the tests.
  // rank is 1 for someone he's hurt, who gets in ahead of the rest if that's three already. It says whether it's roused: no, when it's three already, and it only looks up and goes back. One that's
  // already hunting him is coming for him, and is left alone, so it says yes and nothing changes: it isn't roused again, which would end its chase, and it doesn't send anyone else back.
  function rouse(s, why, rank = 0) {
    if (s.state === HUNTING) return true;
    if (s.state === ROUSED || s.state === GRABBING || s.under !== undefined || s.thrown) return false;
    const p = watch, d = hypot(s.x - p.x, s.z - p.z);
    let full = afterCount() >= T.afterMost;
    if (full && rank > 0 && evict(rank)) full = false;
    s.rouse = { why, at: clock, until: clock + (full ? T.lookFor : T.rouseFor), d0: d, over: full, rank, back: { state: s.state, tx: s.tx, tz: s.tz, timer: s.timer } };
    s.state = ROUSED; s.moving = 0; s.alert = 1; s.reaching = 0; s.rank = rank;
    if (!full) h.on.roused?.(s, why);
    return !full;
  }
  // and to what it was doing, if he backs off in that second, or it was only looking up, or there's nothing there any more to have woken it
  function unrouse(s) {
    const r = s.rouse; s.rouse = null; s.rank = 0;
    const was = r?.back.state;
    s.state = was === CURIOUS || was === TRAILING || was === AVOIDING ? was : SHAMBLE;
    s.tx = r ? r.back.tx : s.x; s.tz = r ? r.back.tz : s.z; s.timer = r ? r.back.timer : 0;
    s.alert = Math.min(s.alert, T.curiousAt); s.lost = 0; s.reaching = 0; s.cool = clock + T.coolFor;
  }
  // and the second's up, and it's him it comes for. Anyone who'd sooner keep away from him does that, unless they were backed into a corner: then they turn on him for a few seconds, and it's
  // after that, and not before, that they go back to keeping away.
  function hunt(s, p) {
    const w = s.who, mood = w ? F.mood(w) : 0, rank = s.rouse?.rank ?? 0, cornered = s.rouse?.why.kind === 'cornered';
    s.rouse = null; s.lost = 0; s.alert = 1; s.timer = 0; s.rank = rank; s.tx = p.x; s.tz = p.z; s.knows = clock + T.lostAfter;
    s.state = !cornered && (mood === AWAY || (w?.truck > 0 && p.driving)) ? AVOIDING : HUNTING;
    if (cornered) s.turned = T.turnsFor;
  }
  // They give up: stops, folds back down and wanders home
  function giveUp(s) {
    s.rouse = null; s.rank = 0; s.state = SHAMBLE; s.alert = 0; s.lost = 0; s.knows = 0; s.reaching = 0; s.moving = 0; s.sus = 0; s.tx = s.x; s.tz = s.z; s.timer = T.stops; s.cool = clock + T.coolFor;
    goHome(s);
  }
  // Room for someone he's hurt: whoever's furthest off of the rest, who isn't on him for a hurt of their own, looks up and goes back
  function evict(rank) {
    let worst = null, far = -1;
    for (const o of active) {
      if (!(o.state === HUNTING || (o.state === ROUSED && !o.rouse.over)) || (o.rank ?? 0) >= rank) continue;
      const d = hypot(o.x - watch.x, o.z - watch.z); if (d > far) { far = d; worst = o; }
    }
    if (!worst) return false;
    if (worst.state === ROUSED) unrouse(worst); else giveUp(worst);
    return true;
  }
  // He's started something there. Anyone gone quiet who's close enough to have seen it comes for him, or gets out of his way if they're the kind, the nearest first and no more than
  // three after him. victim is whoever he did it to, whose sex is kept with the cause (her), and kind is what he did. It says how many.
  function rile(x, z, victim, kind = 'hit') {
    const near = [];
    for (const o of active) {
      if (!o.quiet || o.flat > 0 || o.under !== undefined || o.thrown || (o.state >= HUNTING && o.state <= STUNNED) || o.state === AVOIDING || o.state === ROUSED || hypot(o.x - x, o.z - z) > T.riled) continue;
      near.push(o);
    }
    near.sort((a, b) => hypot(a.x - x, a.z - z) - hypot(b.x - x, b.z - z));
    let n = 0;
    for (const o of near) if (turnOn(o, x, z, victim, 0, kind)) n++;
    return n;
  }
  // and it's him they come for: they know where he is for a while, the same as when he gives himself away. It says whether they did, and not whether they were only looking up.
  function turnOn(s, x, z, victim = s, rank = 0, kind = 'hit') {
    s.lost = 0; s.sus = 0;
    if (moodOf(s) === AWAY) { s.state = AVOIDING; return true; }
    return rouse(s, { kind, her: victim?.who?.her }, rank);
  }
  // He's started something with someone without knocking them down: hit them with something he threw, or picked up what was at their feet. They come for him,
  // and so does anyone gone quiet close by who saw it. Being hit is remembered like any other, by them and whoever was there. It says how many came.
  h.provoke = (s, by = 'thrown') => {
    if (s.under !== undefined || s.thrown || s.state === GRABBING) return 0;
    if (s.who && by === 'thrown') { F.hurt(s.who, s.x, s.z, by); for (const o of active) if (o !== s && o.who && !(o.flat > 0) && hypot(o.x - s.x, o.z - s.z) < T.witness) F.wasThere(o.who); }
    const kind = by === 'took' ? 'took' : 'hit';
    let n = 0;
    if (s.state === STUNNED || s.flat > 0) s.started = true;
    else if (!(s.who?.calm && leaves(s, moodOf(s)))) { if (s.state === ROUSED) unrouse(s); if (turnOn(s, s.x, s.z, s, 1, kind)) n++; }
    return n + rile(s.x, s.z, s, kind);
  };
  // Picking up what's right at the feet of one who's gone quiet counts as starting something with them. It says how many came for him over it.
  h.took = (x, z) => { let n = 0; for (const s of active) if (s.quiet && !(s.flat > 0) && hypot(s.x - x, s.z - z) < T.snatch) n += h.provoke(s, 'took'); return n; };
  // Who a noise or a thrown bottle can move: one who hasn't gone quiet and isn't at home, who isn't after him or roused or down, and who isn't scared of him. A noise doesn't give him away
  // if he's passing for one of them, since it isn't him they'd be listening for, and it's no use in the church, where they can't find him.
  const stirs = (s) => {
    if (s.under !== undefined || s.thrown || s.climbing || !(s.state === SHAMBLE || s.state === CURIOUS || s.state === TRAILING)) return false;
    const mood = moodOf(s);
    return !leaves(s, mood) && mood !== AWAY;
  };
  const heardIn = (s, ev) => stirs(s) && !ev.heard.has(s) && !(watch.acting && moodOf(s) !== AFTER && ev.noise) && !(watch.hidden && ev.noise) && hypot(s.x - ev.x, s.z - ev.z) < ev.r;
  // Something loud, a crash or a swing or a blast or an alarm that he's set off: anyone near enough to hear it who hasn't gone quiet is roused, the nearest first and no more than three
  // after him, and comes for him, and not for wherever it was. Nobody walks over to it. kind is what it was, and what's said if it's what rouses one of them. It says how many it roused.
  h.noise = (x, z, r, seconds, kind = 'crash') => {
    const ev = { x, z, r, until: clock + seconds, kind, heard: new Set(), noise: true };
    noises.push(ev);
    const near = active.filter((s) => heardIn(s, ev)).sort((a, b) => hypot(a.x - x, a.z - z) - hypot(b.x - x, b.z - z));
    let n = 0; for (const s of near) if (hear(s, ev)) n++;
    return n;
  };
  // and one that has just been sent back, or has just given up, doesn't take it up again for the same racket: a swing is a blow and a noise, and it's one moment
  function hear(s, ev) { ev.heard.add(s); if (clock < (s.cool ?? 0)) return false; return rouse(s, { kind: ev.kind }); }
  // A thrown bottle or firecrackers, or a fire of lighter fluid that's burning: anyone near enough who hasn't gone quiet turns to it and looks at it for a few seconds, or as long as the fire
  // burns, and can't make out anything else while they do, which is long enough to slip past. Nobody walks over to it, and the ones after him aren't interested. A kind of thing stops doing it
  // to anyone it has done it to often enough. It says how many looked.
  h.look = (x, z, r, seconds, kind = 'bottle') => {
    const ev = { x, z, r, until: clock + seconds, kind, heard: new Set() };
    looks.push(ev);
    const near = active.filter((s) => heardIn(s, ev)).sort((a, b) => hypot(a.x - x, a.z - z) - hypot(b.x - x, b.z - z));
    let n = 0; for (const s of near) if (gawk(s, ev)) n++;
    return n;
  };
  function gawk(s, ev) {
    ev.heard.add(s);
    if (s.who && F.wise(s.who, ev.kind)) return false;
    if (s.who) F.fooled(s.who, ev.kind);
    s.state = CURIOUS; s.alert = Math.min(s.alert, T.curiousAt); s.lost = 0; s.tx = s.x; s.tz = s.z; s.moving = 0; s.timer = ev.until - clock; s.gaze = { x: ev.x, z: ev.z, until: ev.until };
    return true;
  }
  // He's given himself away, running or fighting or in the light: anyone close who'd have noticed him turns on him, or away from him if they're scared of him, the nearest first and
  // no more than three after him. Anyone already hunting him is after him anyway. It says how many it roused.
  h.unmask = (p, r = T.unmask) => {
    const near = [];
    for (const s of active) {
      if (s.under !== undefined || s.thrown || s.state === HUNTING || s.state === GRABBING || s.state === STUNNED || s.state === ROUSED || hypot(s.x - p.x, s.z - p.z) > r || leaves(s, moodOf(s))) continue;
      near.push(s);
    }
    near.sort((a, b) => hypot(a.x - p.x, a.z - p.z) - hypot(b.x - p.x, b.z - p.z));
    let n = 0;
    for (const s of near) {
      s.sus = 0; s.lost = 0;
      if (moodOf(s) === AWAY) { s.alert = 1; s.state = AVOIDING; n++; } else if (rouse(s, { kind: 'gave' })) n++;
    }
    return n;
  };
  // There's no lure. Nothing draws a crowd, not a train and not an alarm and not a bell, since everyone in Chunky has heard all of them every day for years, and nobody follows anything
  // into the water: a noise rouses the ones near enough to hear it, and a bottle makes them look. The one real lure is supper, which isn't here yet.
  // Knocked flat: anyone within r goes over, thrown clear, and lies there a while. It says how many. They remember it, and so does whoever was there.
  // going is how fast what hit them was going, { vx, vz, still }, and at T.flingFrom or more they go flying (fling, below). still is reduced motion, with nobody turning over.
  h.knock = (x, z, r, seconds, by = 'hit', going = null) => {
    let n = 0;
    const flung = going && hypot(going.vx, going.vz) >= T.flingFrom ? going : null;
    // nobody thinks of a fire or the train as something he did
    const his = by !== 'fire' && by !== 'train';
    let victim = null, nearest = Infinity;
    for (const s of active) {
      const dx = s.x - x, dz = s.z - z, d = hypot(dx, dz);
      if (d >= r || s.flat > 0 || s.under !== undefined) continue;
      floor(s, seconds, his, dx / (d || 1), dz / (d || 1)); n++;
      if (flung) fling(s, flung, dx, dz);
      else {
        const k = 1 + (1 - d / r) * 2.4, nx = s.x + dx / (d || 1) * k, nz = s.z + dz / (d || 1) * k;
        if (open(s, nx, nz)) { s.x = nx; s.z = nz; s.y = world.floorAt(nx, nz); }
      }
      if (s.who) F.hurt(s.who, s.x, s.z, by);
      if (d < nearest) { nearest = d; victim = s; }
    }
    if (n && F && by !== 'fire') for (const o of active) if (o.who && !(o.flat > 0) && hypot(o.x - x, o.z - z) < T.witness) F.wasThere(o.who);
    // and whoever saw him do it comes for him, with whoever was nearest as the one he hit
    if (n && his) rile(x, z, victim);
    return n;
  };
  // Down, whatever put them there. hx, hz is the way the blow went.
  function floor(s, seconds, his, hx, hz) {
    // whoever was after him and is knocked over by something that isn't him, a fire or the train, never stopped: they're straight back at him when they're up. It's checked before the state changes.
    if (!his && isAfter(s)) s.resumes = true;
    s.started = his || (s.started ?? false);
    // and what they were doing and where they were, which is how they're drawn for a moment before they go over
    s.hitAs = s.state === ROUSED ? SHAMBLE : s.state; s.fromX = s.x; s.fromZ = s.z; s.hitX = hx; s.hitZ = hz; s.reaching = 0; s.rouse = null; s.rank = 0;
    s.state = STUNNED; s.timer = seconds; s.alert = 1; s.moving = 0; s.flat = s.flatFor = seconds;
  }
  // Hit with something he swung, from where he stands at x, z: only the one he swung at goes down. It goes over away from him, along the line from him through it, and lands
  // 1.5 to 3 m off, sliding there short of anything that would stop it, a wall, a car, the water or another of them, or where it stood if there's no room at all. It falls the way
  // it's knocked, so it's turned to face him first. It says whether it went down. They remember it, and so does whoever was there.
  h.knockOne = (s, x, z, seconds, by = 'hit') => {
    if (s.flat > 0 || s.under !== undefined || s.thrown) return false;
    const d = hypot(s.x - x, s.z - z) || 1, ux = (s.x - x) / d, uz = (s.z - z) / d, [near, far] = T.knockedOff;
    floor(s, seconds, true, ux, uz);
    s.yaw = Math.atan2(-ux, -uz);
    const reach = near + (far - near) * (((s.look ?? 0) * 0.618) % 1), clear = (t) => {
      const nx = s.fromX + ux * t, nz = s.fromZ + uz * t, lx = nx + ux * T.lieReach, lz = nz + uz * T.lieReach;
      return open(s, nx, nz) && open(s, lx, lz) && !active.some((o) => o !== s && o.under === undefined && Math.min(hypot(o.x - nx, o.z - nz), hypot(o.x - lx, o.z - lz)) < T.lieApart);
    };
    let k = 0;
    for (let t = .1; t <= reach + 1e-6; t += .1) { if (!clear(t)) break; k = t; }
    if (k) { s.x = s.fromX + ux * k; s.z = s.fromZ + uz * k; s.y = world.floorAt(s.x, s.z); }
    if (s.who) F.hurt(s.who, s.x, s.z, by);
    if (F) for (const o of active) if (o.who && !(o.flat > 0) && hypot(o.x - x, o.z - z) < T.witness) F.wasThere(o.who);
    rile(s.fromX, s.fromZ, s);
    return true;
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
      s.x = hit.x; s.z = hit.z; s.thrown = { vx: hit.vx, vz: hit.vz, vy: hit.vy, spin: hit.spin ?? 0 }; s.tumble = 0; s.hitAs = undefined; s.reaching = 0; s.rouse = null; s.rank = 0;
      // whatever they were up to, they've had enough of it
      s.started = false; s.sent = true; s.resumes = false;
      s.state = STUNNED; s.timer = hit.seconds; s.alert = 1; s.moving = 0; s.flat = s.flatFor = hit.seconds + 1;
      if (s.who) F.hurt(s.who, s.x, s.z, by);
      h.on.thrown?.(s, hit);
      n++;
    }
    return n;
  };
  // Flying, limp, off whatever side of its middle they were on, whichever way it was going. Each flight's its own, by who they are and how many times it's happened to them,
  // so nothing's asked of world.rand(). They're sent home sore once they're up, the same as from the train, and he's long gone by then.
  function fling(s, f, dx, dz) {
    const sp = hypot(f.vx, f.vz) || 1, ux = f.vx / sp, uz = f.vz / sp, times = s.flings = (s.flings ?? 0) + 1;
    const r = (salt) => roll((s.who ? s.who.id : 1e6 + s.look) * 31 + times, salt), still = !!f.still;
    const side = Math.sign(dx * -uz + dz * ux) || (r(30) < .5 ? -1 : 1), over = r(31) < T.flungOver, faster = Math.max(0, sp - T.flingFrom);
    const along = sp * (over ? .38 + r(32) * .12 : 1.05 + r(32) * .2), across = side * (1.5 + r(33) * 3.5), up = (over ? 7.5 : 4) + faster * .3 + r(34) * 2;
    s.thrown = { vx: ux * along - uz * across, vz: uz * along + ux * across, vy: up, spin: still ? 0 : (r(35) < .5 ? -1 : 1) * (6 + r(36) * 6), twist: still ? 0 : (r(37) < .5 ? -1 : 1) * (2 + r(38) * 6), limp: true, bounces: 0 };
    // how they flop, which is the page's to draw: the same every time for this flight, and held where it was once they're down
    s.tumble = 0; s.twist = 0; s.flop = { seed: r(39) * 100, t: 0, still }; s.hitAs = undefined; s.sent = true; s.flung = true;
    s.y = world.floorAt(s.x, s.z) + .3;
    h.on.flung?.(s);
  }
  function fly(s, dt) {
    const f = s.thrown, nx = s.x + f.vx * dt, nz = s.z + f.vz * dt;
    s.tumble += f.spin * dt;
    if (f.limp) { s.twist += f.twist * dt; if (!s.flop.still) s.flop.t += dt; }
    // what stops them in the air is a wall, and not whatever threw them, which they go up and over
    if (!world.blocked(nx, nz, s.y, true)) { s.x = nx; s.z = nz; } else { f.vx *= -.2; f.vz *= -.2; }
    f.vy -= T.thrownFalls * dt; s.y += f.vy * dt;
    // into the water, and the river has them
    if (world.water(s.x, s.z) && s.y < (world.level?.(s.x, s.z) ?? -Infinity)) { s.thrown = null; s.tumble = 0; dive(s); h.on.splash?.(s); return; }
    const floor = world.floorAt(s.x, s.z);
    if (s.y > floor) return;
    s.y = floor;
    // limp, they bounce, less each time, and stay however they come down
    if (f.limp && f.vy < -T.bounceFrom && f.bounces < T.bounces) { f.bounces++; h.on.bounce?.(s, -f.vy); f.vy *= -T.bounce; f.vx *= .55; f.vz *= .55; f.spin *= -.5; f.twist *= .6; return; }
    // and how far over they'd turned, from upright, -π to π, which is whether they're laid on their back or their front
    if (f.limp) s.flop.land = Math.atan2(Math.sin(s.tumble), Math.cos(s.tumble));
    s.thrown = null; s.tumble = 0;
  }

  // Where someone's home is: the door for anyone who lives somewhere, and for the rest wherever they came out and go about from
  const homeOf = (s) => (s.home ? s.home.door : [s.homeX, s.homeZ]);
  // What's random about someone comes from their number, and not world.rand(), which would change what everyone does after it
  const luckOf = (s, salt) => roll(s.who ? s.who.id : 1e6 + s.look, salt);
  // Nobody dies of the river. Whoever the train throws in goes under, the cottonmouths have them and the current takes them, and a little later they come up downstream.
  function dive(s) {
    const below = T.below[0] + luckOf(s, 20) * (T.below[1] - T.below[0]);
    s.under = T.goesUnder + below; s.sinking = T.goesUnder; s.swept = below * T.current;
    s.wading = false; s.climbing = false; s.gaze = null;
    if (s.who) F.hurt(s.who, s.x, s.z, 'river');
  }
  // and up on the bank, wading out of it, with the water pouring off them and a cottonmouth hanging off a sleeve, and then home
  function surface(s) {
    const home = homeOf(s), at = world.comeUp?.(s, { metres: s.swept, side: luckOf(s, 21), home });
    if (at) { s.x = at.x; s.z = at.z; [s.tx, s.tz] = at.bank; } else { s.tx = s.x; s.tz = s.z; }
    s.y = world.floorAt(s.x, s.z);
    s.under = s.sinking = s.swept = undefined;
    // awake, whatever had them down, and not after anybody
    s.flat = 0; s.hitAs = undefined; s.thrown = null; s.tumble = 0; s.twist = 0; s.flop = null; s.reaching = 0; s.started = false;
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
    if (left < T.homeIs || clock > s.homeBy) { s.homeward = false; s.flung = false; return false; }
    s.tx = x; s.tz = z; s.timer = left / (T.speed[SHAMBLE] * (s.sore > 0 ? T.soreSpeed : 1)) + 3;
    return true;
  }
  h.calm = () => {
    if (h.grab) h.grab = null;
    for (const s of all) {
      // anyone down from the train or from being flung gets up sore and goes home all the same, which was never about him
      if (s.sent && (s.thrown || s.flat > 0)) { s.resumes = false; s.rouse = null; s.rank = 0; s.reaching = 0; s.ring = null; continue; }
      s.state = SHAMBLE; s.alert = 0; s.timer = 0; s.lost = 0; s.tx = s.x; s.tz = s.z; s.moving = 0; s.sent = false; s.rouse = null; s.rank = 0; s.cool = 0; s.reaching = 0; s.ring = null;
    }
  };
  // When they've dragged him off: the nearest n stand round where he went down, folded over and looking down at him, and stay there till unring() or calm()
  h.ring = (x, z, n, r) => {
    const near = active.filter((s) => s.under === undefined && !s.thrown && !(s.flat > 0)).sort((a, b) => hypot(a.x - x, a.z - z) - hypot(b.x - x, b.z - z)).slice(0, n);
    near.forEach((s, i) => {
      const a = i / near.length * 6.283 + .4;
      s.x = s.tx = x + Math.sin(a) * r; s.z = s.tz = z + Math.cos(a) * r; s.y = world.floorAt(s.x, s.z); s.yaw = Math.atan2(x - s.x, z - s.z);
      s.state = SHAMBLE; s.moving = 0; s.reaching = 0; s.ring = { x, z };
    });
    return near;
  };
  h.unring = () => { for (const s of all) s.ring = null; };
  // Only the ones nearby are out. Someone put back isn't thought about or looked for while they're away, and is brought out again just as they were: their state, where they were, and
  // everything they remember, which is src/agents.js's and has nothing to do with whether they're out. It's the same body, so nothing is asked of anyone's random numbers.
  h.remove = (s) => {
    // whoever was after him, or about to be, gives up first, so that whoever's brought back isn't hunting him with no warning
    if (isAfter(s) || s.state === ROUSED) giveUp(s);
    const i = all.indexOf(s); if (i >= 0) all.splice(i, 1);
    const j = active.indexOf(s); if (j >= 0) active.splice(j, 1);
    if (h.grab?.who.includes(s)) { h.grab.who.splice(h.grab.who.indexOf(s), 1); if (!h.grab.who.length) { h.grab = null; mercy = T.mercy; h.on.free?.(); } }
    return s;
  };
  h.restore = (s) => { if (!all.includes(s)) all.push(s); return s; };
  // A press of the button while held
  h.mash = () => { if (!h.grab) return; h.grab.progress += T.mash / (1 + .5 * (h.grab.who.length - 1)); if (h.grab.progress >= 1) release(true); };

  // How far off they can smell him, before the night and who they are: nothing at all with five cans of beans or fewer
  const smellOf = (beans) => Math.max(0, beans - T.smellFrom) * T.smellPerBean;
  // What he can be made out by at the moment, and how far, with what's said if that's what brings one for him. The furthest reach is what did it.
  function senseOf(p, sharp) {
    let kind = 'close', reach = T.touch;
    const hear = p.noise * sharp, smell = smellOf(p.beans) * sharp, see = p.light * sharp;
    if (hear > reach) { reach = hear; kind = p.driving ? 'engine' : 'steps'; }
    if (smell > reach) { reach = smell; kind = 'beans'; }
    if (see > reach) { reach = see; kind = 'light'; }
    return { kind, reach };
  }
  // and what woke one that was nothing but something about him, and not a crash or a hit, which has been and gone
  const SENSES = new Set(['steps', 'engine', 'beans', 'light', 'close']);
  // Whether there's anything between them and him: walls and the like at head height, a couple of metres apart along the way. The page can do better, and say so.
  function lineClear(s, p) {
    const dx = p.x - s.x, dz = p.z - s.z, d = hypot(dx, dz), n = Math.ceil((d - .8) / T.sightStep);
    for (let i = 1; i <= n; i++) { const k = Math.min(i * T.sightStep, d - .8) / (d || 1); if (world.blocked(s.x + dx * k, s.z + dz * k, s.y + 1.5)) return false; }
    return true;
  }
  const sees = (s, p) => hypot(s.x - p.x, s.z - p.z) <= T.sight && (world.sees ? world.sees(s, p) : lineClear(s, p));
  // what woke one that's made him out by itself: the sense that did it. Someone with a grudge for a hurt of their own is here because of that, whatever it was they heard.
  function whyOf(s, p, sharp, mood) {
    const w = s.who;
    if (w && mood === AFTER && w.hurt > 0) return { kind: 'hit', her: w.her };
    return { kind: senseOf(p, sharp).kind };
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
    const d = hypot(s.x - p.x, s.z - p.z), sharp = 1 + (T.nightSense - 1) * p.night;
    const scared = mood === AWAY || (w?.truck > 0 && p.driving);
    // Looking at something he threw, for as long as it lasts: turned to it, and not on him
    if (s.gaze) { if (s.state !== CURIOUS || clock >= s.gaze.until) s.gaze = null; else s.yaw = turn(s.yaw, Math.atan2(s.gaze.x - s.x, s.gaze.z - s.z), .5); }
    // Shambling, he's one of them to anyone who isn't already after him. Someone with a grudge knows him too well to be taken in, and anyone who'd leave him be doesn't look.
    const taken = !!p.acting && !p.hidden && mood !== AFTER && !isAfter(s) && s.state !== ROUSED && !quiet;
    if (taken) {
      if (d < T.susReach && !s.gaze) s.sus = Math.min(1, (s.sus ?? 0) + T.thinkEvery * T.susRate * (1 - d / T.susReach) * sharp * (1 + T.susPerBean * Math.max(0, p.beans - T.smellFrom)) * (w ? .6 + .8 * w.nosy : 1));
      else if (s.sus) s.sus = Math.max(0, s.sus - T.thinkEvery * T.susFade);
      // and that's it: they've seen through him
      if (s.sus >= 1) {
        s.sus = 0; s.lost = 0;
        if (scared) { s.alert = 1; s.state = AVOIDING; s.tx = p.x; s.tz = p.z; s.timer = 0; h.on.spotted?.(s); } else if (rouse(s, { kind: 'saw' })) h.on.spotted?.(s);
        return;
      }
    } else if (s.sus) s.sus = Math.max(0, s.sus - T.thinkEvery * T.susFade);
    const hid = p.hidden || taken;
    // the people who live here, and the ones who've gone quiet, have got nothing against him until he gives them something. And looking at something he threw, it's all anyone sees.
    const sense = senseOf(p, sharp), reach = hid || quiet || s.gaze ? 0 : sense.reach * (w ? F.senses(w, mood) : 1);
    const sensed = d < reach;
    if (sensed) s.alert = Math.min(1, s.alert + T.thinkEvery * (T.alertRate[0] + (T.alertRate[1] - T.alertRate[0]) * (1 - d / reach)) * (mood === AFTER ? 2 : 1));
    else s.alert = Math.max(0, s.alert - T.thinkEvery * T.alertFade);
    if (w) {
      if (d < T.meet) F.close(w, T.thinkEvery);
      // and it gets around, one of them at a time, among their own people
      if (F.hasNews(w)) { const o = active[Math.floor(world.rand() * active.length)]; if (o?.who && hypot(o.x - s.x, o.z - s.z) < T.tell) F.tell(w, o.who); }
    }
    // out of the water, they're not wading any more
    if (s.wading && s.state !== CURIOUS && !world.water(s.x, s.z)) s.wading = false;
    // Something he threw makes anyone who has just come into earshot of it look. Nobody walks over to it. (A noise is h.update's, which does it nearest first.)
    if (stirs(s)) for (const ev of looks) if (heardIn(s, ev) && gawk(s, ev)) return;
    // Roused, it's for the second to see whether he backs off, which is every frame in rousing() and not here, except that he can hide
    if (s.state === ROUSED) { if (p.hidden) unrouse(s); return; }

    if (s.state === STUNNED) {
      s.timer -= T.thinkEvery;
      // nobody's up while they've still got time down, which is what anything asking how long that is goes by
      if (s.timer > 0 || s.flat > 0) return;
      // run down by the train or flung, they've had enough of whatever they were at: up, sore, and off home
      if (s.sent) { sore(s); goHome(s); s.state = SHAMBLE; s.timer = 0; s.alert = 0; s.lost = 0; s.tx = s.x; s.tz = s.z; s.flop = null; s.twist = 0; return; }
      // up again. Anyone who'd keep away from him does. Whoever was after him and was thrown off him, or knocked over by something that wasn't him, goes straight back if there's room for them,
      // and gives up if there isn't: they never stopped. Whoever he hurt comes for him, which takes a second of standing there first like anyone else coming for him. And anyone else goes back
      // to what they were doing: it wasn't him, and it's nothing to them.
      const resumes = s.resumes, started = s.started; s.resumes = false; s.started = false;
      if (scared) { s.state = AVOIDING; s.lost = 0; s.tx = p.x; s.tz = p.z; }
      else if (resumes) { s.lost = 0; s.tx = p.x; s.tz = p.z; s.knows = clock + T.lostAfter; if (afterCount() < T.afterMost) s.state = HUNTING; else giveUp(s); }
      else if (started) { s.lost = 0; rouse(s, { kind: 'hit', her: w?.her }, 1); }
      else { s.state = SHAMBLE; s.timer = 0; s.alert = 0; s.tx = s.x; s.tz = s.z; }
      return;
    }
    // caught inside the church, or the compound on Pine Forest Rd: out they go, straight out of a circle and by its way out of a box
    for (const a of zones) {
      if (!inZone(a, s.x, s.z)) continue;
      s.state = SHAMBLE; s.timer = 4;
      if (a.out) { s.tx = a.out[0]; s.tz = a.out[1]; } else { const d = hypot(s.x - a.x, s.z - a.z) || 1; s.tx = a.x + (s.x - a.x) / d * (a.r + 3); s.tz = a.z + (s.z - a.z) / d * (a.r + 3); }
      return;
    }
    const startled = Math.max(reach * 1.5, T.startle);
    if (s.turned > 0) s.turned -= T.thinkEvery;
    else if (scared && !hid && d < startled && s.state !== AVOIDING && s.state !== GRABBING) { s.state = AVOIDING; s.lost = 0; }
    if (mood === TAILING && s.state <= CURIOUS && !s.gaze && !hid && d < T.trail) s.state = TRAILING;
    if (s.state === AVOIDING) {
      if (!scared || hid || d > startled + T.backOff) { s.state = SHAMBLE; s.timer = 0; return; }
      // backed into a corner with him right there, even they turn on him, and that's like anyone coming for him: it stops and flares for its second first, backing off sends it back to keeping away,
      // and it's one of the three. Left alone for a few seconds if it's been sent back.
      if (d < T.cornered && s.stuck > 1 && clock >= (s.cool ?? 0)) { s.lost = 0; rouse(s, { kind: 'cornered', her: w?.her }); return; }
      const k = 14 / (d || 1); s.tx = s.x + (s.x - p.x) * k; s.tz = s.z + (s.z - p.z) * k;
    } else if (s.state === TRAILING) {
      if (mood !== TAILING || s.gaze || hid || d > T.trail + 10) { s.state = SHAMBLE; s.timer = 0; return; }
      // it's always the same distance for the same person, and when they're there they stop and face him
      const gap = T.trailGap[0] + (T.trailGap[1] - T.trailGap[0]) * w.temper;
      if (d > gap + 1.5 || d < gap - 2) { const k = gap / (d || 1); s.tx = p.x + (s.x - p.x) * k; s.tz = p.z + (s.z - p.z) * k; }
      else { s.tx = s.x; s.tz = s.z; s.yaw = turn(s.yaw, Math.atan2(p.x - s.x, p.z - s.z), .35); }
    } else if (s.state === SHAMBLE) {
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
      // it has been long enough, and it's him it has found. It stops, turns to him and flares first, unless it's the kind to keep away, or it's only just been sent off.
      if (s.alert >= 1) {
        if (scared) { s.state = AVOIDING; s.lost = 0; return; }
        if (clock >= (s.cool ?? 0)) { rouse(s, whyOf(s, p, sharp, mood)); return; }
        s.alert = .9;
      }
      if (sensed) { s.tx = p.x; s.tz = p.z; s.timer = T.lookAround; }
      if (s.stuck > T.feelAlong) { s.stuck = 0; s.state = SHAMBLE; s.timer = 0; }   // can't get there
      else if (hypot(s.tx - s.x, s.tz - s.z) < 1.2) { s.timer -= T.thinkEvery; if (s.timer <= 0) { s.state = SHAMBLE; s.timer = 0; s.gaze = null; } }
    } else if (s.state === HUNTING) {
      // They give up. It's him it can see, and round a corner or further off than it can see he's lost for as long as that goes on, whatever it can still hear of him.
      // Someone who's just seen him for what he is knows where he is for a while, and goes there.
      if (!hid && sees(s, p)) { s.lost = 0; s.tx = p.x; s.tz = p.z; }
      else {
        s.lost += T.thinkEvery;
        if (sensed || clock < (s.knows ?? 0)) { s.tx = p.x; s.tz = p.z; }
        if (s.lost >= T.giveUp) { giveUp(s); return; }
      }
    }
  }
  // Every frame of the second it's roused: turned to him, and gone back to what it was doing if he's backed off, or he's gone quiet and out of its reach if it was something about him
  // that woke it, or he's hidden
  function rousing(s, dt, p) {
    const r = s.rouse, d = hypot(s.x - p.x, s.z - p.z);
    s.yaw = turn(s.yaw, Math.atan2(p.x - s.x, p.z - s.z), Math.min(1, dt * T.faceRate));
    s.moving = 0;
    let held = true;
    if (SENSES.has(r.why.kind) && !r.over) { const w = s.who; held = d < senseOf(p, 1 + (T.nightSense - 1) * p.night).reach * (w ? F.senses(w, F.mood(w)) : 1); }
    if (p.hidden || d > r.d0 + T.rouseBack || !held) { unrouse(s); return; }
    if (clock >= r.until) { if (r.over) unrouse(s); else hunt(s, p); }
  }
  function walk(s, dt) {
    const sp = T.speed[s.state] * (s.wading && world.water(s.x, s.z) ? T.wading : 1) * (s.sore > 0 ? T.soreSpeed : 1) * (s.scuttle && s.state === HUNTING ? T.scuttle : 1);
    s.moving = 0; if (!sp) return;
    let dx = s.tx - s.x, dz = s.tz - s.z, l = hypot(dx, dz);
    if (l < .35) return;
    // one coming for him stops at arm's length, wherever it was making for, and never comes inside him
    if (isAfter(s) && hypot(s.x - watch.x, s.z - watch.z) < T.armsLength) return;
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
    if (g.who.length < T.grabbers) for (const s of active) if (s.state === HUNTING && hypot(s.x - p.x, s.z - p.z) < T.grabReach + .3) { s.state = GRABBING; g.who.push(s); if (g.who.length >= T.grabbers) break; }
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
      // whoever was after him still is when they're up again, and straight back at him: they never stopped
      s.started = g.who.includes(s) || s.state === HUNTING; s.sent = false; s.resumes = s.started; s.rouse = null; s.rank = 0;
      s.state = STUNNED; s.timer = T.stun; s.alert = 1; s.moving = 0;
      const nx = s.x + dx / d * T.shove, nz = s.z + dz / d * T.shove;
      if (open(s, nx, nz)) { s.x = nx; s.z = nz; }
    }
    if (broke) h.on.free?.(); else h.on.overrun?.();
  }

  // p: { x, z, y, noise, light, beans, night, hidden, canGrab, driving, acting }, and acting is him shambling along with them
  h.update = (dt, p) => {
    clock += dt; watch = p; mercy = Math.max(0, mercy - dt); F?.tick(dt);
    for (let i = noises.length - 1; i >= 0; i--) if (noises[i].until < clock) noises.splice(i, 1);
    for (let i = looks.length - 1; i >= 0; i--) if (looks[i].until < clock) looks.splice(i, 1);
    active.length = 0;
    for (const s of all) {
      if (hypot(s.x - p.x, s.z - p.z) < T.active) active.push(s);
      // what's not looked at isn't thinking about him either: one that was on his way out of reach when he went doesn't take it up again when he's back
      else if (s.state === CURIOUS || s.state === ROUSED || s.state === HUNTING) { if (s.state === CURIOUS) { s.state = SHAMBLE; s.timer = 0; s.alert = 0; s.tx = s.x; s.tz = s.z; s.gaze = null; } else giveUp(s); }
    }
    // A noise that's still going rouses whoever has come into earshot of it since, or couldn't be found when it started, the nearest to it first, so that the ones who come for him
    // are the nearest three whenever they hear it
    if (noises.length && (hearAt -= dt) <= 0) {
      hearAt = T.thinkEvery;
      for (const ev of noises) for (const s of active.filter((o) => heardIn(o, ev)).sort((a, b) => hypot(a.x - ev.x, a.z - ev.z) - hypot(b.x - ev.x, b.z - ev.z))) hear(s, ev);
    }
    for (const s of active) {
      // under the water, and the current's taking them. When it's done with them they come up.
      if (s.under !== undefined) {
        s.under -= dt; s.moving = 0;
        if (s.sinking > 0) { s.sinking -= dt; s.y -= dt * 1.5; }
        if (s.under <= 0) surface(s);
        continue;
      }
      if (s.thrown) { fly(s, dt); continue; }
      if (s.ring) { s.moving = 0; continue; }
      s.next -= dt;
      // and up the moment the time they're down for is over, rather than whenever they next look around
      if (s.flat > 0 && (s.flat -= dt) <= 0 && s.state === STUNNED) { s.timer = 0; s.next = 0; }
      if (s.next <= 0) { s.next += T.thinkEvery; think(s, p); }
      if (s.state === ROUSED) rousing(s, dt, p);
      walk(s, dt);
      // wading out of the river, they're out of it when they're on the bank
      if (s.climbing && !world.water(s.x, s.z)) s.climbing = false;
      // soaked for a while, and the snake lets go of the sleeve sooner than that. Sore till they're home, and for a bit after.
      if (s.wet > 0) s.wet -= dt;
      if (s.snake > 0 && (s.snake -= dt) <= 0) { s.snake = 0; h.on.drop?.(s); }
      if (s.sore > 0 && !s.homeward) s.sore -= dt;
    }
    if (h.grab) { h.grab.x = p.x; h.grab.z = p.z; holdOn(dt, p); return; }
    // Close enough, they reach for him, and it takes them a moment to get hold. Whoever's been at it longest gets there first.
    // The world hears of each of them once, as the hands go up, so that it can warn him without needing the body, which his hood hides coming straight at him.
    const can = mercy <= 0 && p.canGrab;
    let first = null;
    for (const s of active) {
      if (can && s.state === HUNTING && hypot(s.x - p.x, s.z - p.z) < T.grabReach) { const was = s.reaching ?? 0; s.reaching = was + dt; if (!was && s.reaching > 0) world.reaching?.(s); if (s.reaching >= T.windUp && (!first || s.reaching > first.reaching)) first = s; }
      else if (s.reaching) s.reaching = 0;
    }
    if (!first) return;
    first.reaching = 0; first.state = GRABBING;
    h.grab = { who: [first], time: 0, progress: 0, at: Math.atan2(first.x - p.x, first.z - p.z), x: p.x, z: p.z, dx: 0, dz: 0 };
    h.on.grab?.(h.grab);
  };
  return h;
}
