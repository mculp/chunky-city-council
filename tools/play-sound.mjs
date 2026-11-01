// Plays the game with the sound on, with real key presses and in real time, and checks what it's playing and that something's coming out. Nobody's ears are in here, so it
// can't say whether any of it sounds good. It also swaps sounds for test files, with nothing changed but the sheet, and tries a voice line.
//
//   npm i && npm run sound -- [--shots dir] [--old]    --old plays it through with the sounds worked out from code
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { serveAndOpen } from './browser.mjs';

const args = process.argv.slice(2), shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const snap = async (page, name) => { if (shots) { await mkdir(shots, { recursive: true }); await page.screenshot({ path: join(shots, name + '.png') }); } };
const has = (list, ...names) => names.every((n) => list.includes(n));

const setUp = () => {
  const G = __game; G.pause(); Object.assign(window, { G, Snd: G.sound, T: 1 / 30 }); G.step(.2, T);
  // A sound lasts as long as it lasts and the limits on them count in real seconds, so this goes at the speed the sound does
  window.run = async (seconds) => { let left = seconds, was = performance.now(); while (left > 0) { await new Promise((r) => setTimeout(r, 12)); const now = performance.now(), dt = Math.min(.05, (now - was) / 1000); was = now; G.step(dt, dt); left -= dt; } };
  window.during = async (fn) => { Snd.forget(); await fn(); return Snd.state().heard; };
  // 48 of them after him, and what a tick's JS comes to
  window.crowdCost = () => {
    const H = G.horde, P = G.player.pos; G.bringOutCrowd(); H.T.grabReach = 0; G.S.mode = 'town'; G.place(...G.map.fromTrue(-120, -60));
    H.all.slice(0, 48).forEach((s, i) => { const a = i * .13, d = 8 + i * .7; s.x = P.x + Math.cos(a) * d; s.z = P.z + Math.sin(a) * d; s.y = G.floorAt(s.x, s.z); s.state = 2; s.alert = 1; });
    G.sim(.2, T);
    const t0 = performance.now(); for (let i = 0; i < 300; i++) G.sim(T, T);
    return { each: (performance.now() - t0) / 300, voices: Snd.state().voices, loops: Snd.state().loops.length };
  };
};

const { page, errors, close } = await serveAndOpen({ viewport: { width: 390, height: 844 }, query: args.includes('--old') ? '?test#old' : '?test' });
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);

await g(setUp);
await snap(page, 'title');
const before = await g(() => Snd.state());
check('there\'s no sound at all until something\'s been touched', !before.unlocked && before.ctx === null, before);

// ---------------- the first touch
await page.keyboard.press('x');
await page.waitForFunction(() => Snd.state().ctx === 'running', null, { timeout: 5000 });
const started = await g(() => Snd.state());
check('a key press starts it', started.unlocked && started.ctx === 'running', started);
// the bank's worked out a little each frame
const frames = await g(async () => { let n = 0; while (Snd.state().queued && n < 400) { await run(1 / 30); n++; } return n; });
check(`and everything's worked out within ${frames} frames, with the game running`, frames < 400 && (await g(() => Snd.state().queued)) === 0, frames);
await g(() => { Snd.meter(); }); await wait(1800);
const loud = await g(() => Snd.meter());
console.log(`     coming out at ${loud.toFixed(1)} dB on the title`);
check('and something\'s coming out', loud > -70 && loud < -3, loud);
check('it\'s the title\'s music', (await g(() => Snd.state().music)) === 'title');

// ---------------- the mute
await page.keyboard.press('n'); await wait(400);
const quiet = await g(() => ({ db: Snd.meter(), muted: Snd.muted, shows: document.getElementById('mute').classList.contains('muted'), kept: localStorage.getItem('chunky.mute') }));
check('N mutes it, the button shows it, and it stays muted next time', quiet.db < -90 && quiet.muted && quiet.shows && quiet.kept === '1', quiet);
await snap(page, 'title-muted');
await page.keyboard.press('n'); await wait(400);
const back = await g(() => ({ db: Snd.meter(), muted: Snd.muted, kept: localStorage.getItem('chunky.mute') }));
check('N again brings it back', back.db > -70 && !back.muted && back.kept === '0', back);

// ---------------- a hidden tab
await g(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await wait(300);
check('it stops when the tab\'s hidden', (await g(() => Snd.state().ctx)) === 'suspended', await g(() => Snd.state().ctx));
const hiddenPlay = await g(() => Snd.play('ui.tap'));
check('and plays nothing while it is', hiddenPlay === false, hiddenPlay);
await g(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await page.waitForFunction(() => Snd.state().ctx === 'running', null, { timeout: 5000 });
check('and carries on when it comes back', true);

// ---------------- the opening, in order, with its music
const opening = await g(async () => {
  const out = {}, until = async (mode, most) => { let t = 0; while (G.S.mode === mode && t < most) { await run(.1); t += .1; } };
  const at = async (name, start, then) => { Snd.forget(); start?.(); await run(.3); const music = Snd.state().music; await then?.(); out[name] = { music, heard: Snd.state().heard }; };
  await at('hang', () => G.jump('hang'), async () => { await run(6.7); G.key('e', true); await until('hang', 6); G.key('e', false); });
  await at('fall', null, () => until('fall', 6));
  await at('swim', null, async () => { G.key('a', true); await run(3); G.key('a', false); });
  await at('land', () => G.jump('land'));
  await at('bridge', () => G.jump('bridge'), async () => { G.key('w', true); await run(5.5); G.key('w', false); });
  await at('bitten', () => G.jump('bitten'));
  await at('dream', () => G.jump('dream'), () => run(1.5)); out.dream.night = Snd.state().levels.ambience;
  await at('wake', () => G.jump('wake'), () => run(2)); out.wake.night = Snd.state().levels.ambience;
  return out;
});
for (const [phase, want] of Object.entries({ hang: 'hang', fall: 'fall', swim: 'river', land: 'bank', bridge: 'run', bitten: 'bite', dream: 'dream', wake: 'wake' })) check(`${phase} has the ${want} music`, opening[phase].music === want, opening[phase].music);
check('holding to cut saws at the rope, and it snaps', has(opening.hang.heard, 'rope.creak', 'rope.saw', 'rope.snap', 'fall.air', 'glitch'), opening.hang.heard);
check('he hits the river', has(opening.fall.heard, 'splash.big'), opening.fall.heard);
check('he swims', has(opening.swim.heard, 'swim.stroke'), opening.swim.heard);
check('the bridge comes apart behind him', has(opening.bridge.heard, 'bridge.fall', 'bridge.groan', 'plank.crack'), [...new Set(opening.bridge.heard)]);
check('the bite', has(opening.bitten.heard, 'snake.strike', 'bite.sting'), opening.bitten.heard);
check('the fever, with the night gone quiet and no frogs', has(opening.dream.heard, 'dream.swell') && !opening.dream.heard.some((n) => n.startsWith('frog')) && opening.dream.night < .1, opening.dream);
check('and his heart when he wakes', has(opening.wake.heard, 'wake.heart'), opening.wake);

// ---------------- his feet
const feet = await g(async () => {
  const out = {}, walk = async (x, z) => { G.place(x, z); await run(.2); Snd.forget(); const s = G.surfaceUnder(); G.key('w', true); await run(1.4); G.key('w', false); return [s, Snd.state().heard]; };
  let t = 0; while (G.S.mode !== 'town' && t < 8) { await run(.2); t += .2; }
  // the score goes by the mode a frame ago if he got up partway through a frame's work
  await run(.1);
  out.mode = G.S.mode; out.music = Snd.state().music;
  Snd.forget(); out.deck = [G.surfaceUnder()]; G.key('w', true); await run(1.2); G.key('w', false); out.deck.push(Snd.state().heard);
  out.road = await walk(...G.map.fromTrue(-283, -100));
  out.dirt = await walk(...G.map.fromTrue(-180, -150));
  const p = G.water.in(...G.map.fromTrue(75, -325)), [ax, az] = p.ring[0], d = Math.hypot(ax - p.x, az - p.z) || 1; G.place(ax + (ax - p.x) / d * .8, az + (az - p.z) / d * .8); await run(.1); out.shore = G.surfaceUnder();
  G.place(...G.map.fromTrue(-283, -100)); await run(.4); Snd.forget();
  return out;
});
check('he gets up in town, to the town\'s music', feet.mode === 'town' && feet.music === 'town', feet);
check('on the boards of a bridge it\'s wood', feet.deck[0] === 'wood' && feet.deck[1].includes('step.wood'), feet.deck);
check('on a road it\'s road', feet.road[0] === 'road' && feet.road[1].includes('step.road'), feet.road);
check('off it it\'s dirt', feet.dirt[0] === 'dirt' && feet.dirt[1].includes('step.dirt'), feet.dirt);
check('at a pond\'s edge it\'s mud', feet.shore === 'mud', feet.shore);
await page.keyboard.down('Space'); await g(() => run(.1)); await page.keyboard.up('Space');
const landed = await g(async () => { await run(1); return Snd.state().heard.filter((n) => n.startsWith('step')).length; });
check('jumping and landing make a sound each', landed >= 2, landed);

// ---------------- what he does in town
const town = await g(async () => {
  const out = {}, P = G.player.pos, W = G.wreck;
  const sign = W.props.find((p) => p.kind === 'sign' && !p.down), pole = W.props.find((p) => p.kind === 'pole' && !p.down);
  G.place(sign.cx - 12, sign.cz); G.look(0); await run(.2); Snd.forget(); W.breakProp(sign); out.sign = Snd.lastHeard('break.metal'); await run(.3);
  G.place(pole.cx - 12, pole.cz); await run(.2); Snd.forget(); W.breakProp(pole); out.pole = Snd.lastHeard('break.wood'); await run(.3);
  G.place(...G.map.fromTrue(-120, -60)); G.look(0); await run(.2);
  Snd.forget(); W.blast(P.x + 18, P.y, P.z, 1, .01); out.near = Snd.lastHeard('explosion'); await run(.4);
  G.look(Math.PI); await run(.1); Snd.forget(); W.blast(P.x + 160, P.y, P.z, 1, .01); out.far = Snd.lastHeard('explosion'); await run(.4);
  const c = G.pickups.find((o) => !o.got); out.beans = await during(async () => { G.place(c.x, c.z); await run(.2); });
  const can = W.gasCans.find((o) => !o.got); out.gas = await during(async () => { G.S.gas = 0; G.place(can.x, can.z); await run(.2); });
  G.place(...G.map.fromTrue(-120, -60)); await run(.2); Snd.forget();
  return out;
});
check('a sign goes with a metal sound', !!town.sign && town.sign.g > .05, town.sign);
check('and off to the side it\'s on', town.sign?.pan > 0, town.sign);
check('a pole with a wooden one', !!town.pole && town.pole.g > .05, town.pole);
console.log(`     an explosion at 18 m is ${town.near?.g.toFixed(3)} and at 160 m ${town.far?.g.toFixed(3)}`);
check('an explosion fades with distance and is heard a long way off', town.near && town.far && town.near.g > town.far.g * 2 && town.far.g > .01, town);
check('with its side coming from which way he\'s facing', town.near?.pan > 0 && town.far?.pan < 0, [town.near, town.far]);
check('beans', town.beans.includes('can.clink'), town.beans);
check('and a gas can', town.gas.includes('can.slosh'), town.gas);
await page.keyboard.down('f'); await g(() => run(.1)); await page.keyboard.up('f');
const swung = await g(async () => { await run(.5); return Snd.state().heard; });
check('the hammer swings', swung.includes('swing'), swung);

// ---------------- driving
const drive = await g(async () => {
  const out = {}, v = G.vehicles.find((o) => o.kind === 'pickup' && !o.wrecked && !o.drowned && !o.loose);
  const put = (p, side = 0) => { v.x = p.x + p.tz * side; v.z = p.z - p.tx * side; v.y = G.floorAt(v.x, v.z); v.yaw = Math.atan2(p.tx, p.tz); v.f = v.s = v.steer = 0; v.grounded = true; G.look(v.yaw + Math.PI); };
  const side = v.yaw + Math.PI / 2, off = v.K.width / 2 + 1; G.place(v.x + Math.sin(side) * off, v.z + Math.cos(side) * off); await run(.3);
  Snd.forget(); G.getIn(v); await run(.8); out.getIn = Snd.state().heard;
  const [wx, wz] = G.map.fromTrue(-1500, -18), road = G.map.along('us_80', G.map.sOn('us_80', wx, wz));
  put(road); await run(.4); out.idle = Snd.state(); out.idleOnRoad = G.onRoad(v.x, v.z);
  G.key('w', true); await run(5); G.key('w', false); out.going = Snd.state(); out.speed = Math.hypot(v.f, v.s);
  G.key(' ', true); await run(.3); out.skid = Snd.state().loopLevels['vehicle.skid']; G.key(' ', false);
  put(road, 60); v.f = 12; await run(.3); out.offRoad = Snd.state().loopLevels; out.offTar = !G.onRoad(v.x, v.z);
  Snd.forget(); G.getOut(true); await run(.5); out.out = Snd.state().loopLevels; out.outHeard = Snd.state().heard.includes('vehicle.door');
  await run(2.5); out.after = Snd.state().loops;
  // straight into a wall at speed
  const [hx, hz] = G.map.fromTrue(-1, -504), s = G.structures.find((o) => o.use === 'house' && Math.hypot(o.wx - hx, o.wz - hz) > 200), car = G.vehicles.find((o) => o.kind === 'car' && !o.wrecked && !o.drowned && !o.loose);
  G.getIn(car); const [a, b] = s.pts[0], l = Math.hypot(a - s.wx, b - s.wz) || 1; car.x = s.wx + (a - s.wx) / l * (l + 16); car.z = s.wz + (b - s.wz) / l * (l + 16); car.y = G.floorAt(car.x, car.z); car.yaw = Math.atan2(s.wx - car.x, s.wz - car.z); car.f = 22; car.s = 0; car.grounded = true;
  Snd.forget(); G.key('w', true); await run(1.6); G.key('w', false); out.crash = Snd.state().heard; if (G.driving()) G.getOut(true); await run(.2);
  // and a quad into the deepest of the river
  let best = null; for (let x = -180; x < 600; x += 4) for (let z = -400; z < 400; z += 4) { const f = G.floorAt(x, z); if (f < -1.2 && G.map.inBounds(x, z) && (!best || f < best[2])) best = [x, z, f]; }
  const quad = G.vehicles.find((o) => o.kind === 'quad' && !o.wrecked && !o.drowned && !o.loose); G.getIn(quad); quad.x = best[0]; quad.z = best[1]; quad.y = best[2]; quad.yaw = 0; quad.f = 6; quad.s = 0; quad.grounded = true; G.look(Math.PI);
  Snd.update(best[0], best[1], 0); Snd.forget(); G.key('w', true); await run(.9); G.key('w', false); out.flood = Snd.state().heard; out.drowned = quad.drowned; if (G.driving()) G.getOut(true);
  await run(.1); out.mode = G.S.mode; G.place(...G.map.fromTrue(-120, -60)); G.S.mode = 'town'; G.HP.kind = 'run'; await run(.2);
  return out;
});
const engineAt = (s) => s.loopRates['engine.pickup'];
console.log(`     the pickup's engine runs at ${engineAt(drive.idle)} standing and ${engineAt(drive.going)} at ${drive.speed.toFixed(1)} m/s`);
check('getting in shuts the door and starts it', has(drive.getIn, 'vehicle.door', 'vehicle.start'), drive.getIn);
check('its engine runs once he\'s in it', drive.idle.loopLevels['engine.pickup'] > 0, drive.idle.loopLevels);
check('and it climbs with the speed', engineAt(drive.going) > engineAt(drive.idle) * 1.3 && drive.speed > 8, [engineAt(drive.idle), engineAt(drive.going), drive.speed]);
check('the road\'s under it at speed', drive.idleOnRoad && drive.going.loopLevels['vehicle.road'] > .1 && !(drive.going.loopLevels['vehicle.dirt'] > 0), drive.going.loopLevels);
check('the brakes howl', drive.skid > 0, drive.skid);
check('off the road it\'s the dirt', drive.offTar && drive.offRoad['vehicle.dirt'] > 0 && !(drive.offRoad['vehicle.road'] > 0), drive.offRoad);
check('getting out shuts the door and stops it', !(drive.out['engine.pickup'] > 0) && drive.outHeard, drive.out);
check('and nothing\'s left going after that', !drive.after.some((n) => n.startsWith('engine') || n.startsWith('vehicle')), drive.after);
check('hitting a wall at speed sounds like it', drive.crash.includes('crash') || drive.crash.includes('hit.wood') || drive.crash.includes('break.wood'), drive.crash);
check('and water floods it', drive.drowned && drive.flood.includes('flood'), drive.flood);

// ---------------- the crowd
const crowd = await g(async () => {
  const out = {}, H = G.horde, P = G.player.pos; G.bringOutCrowd(); H.T.grabReach = 0;
  G.place(...G.map.fromTrue(-120, -60)); await run(.3);
  const put = (s, d, state) => { s.x = P.x + d; s.z = P.z; s.y = G.floorAt(s.x, s.z); s.state = state; s.alert = 1; s.heard = false; };
  const [a, ...rest] = H.all; for (const s of rest) { s.x = P.x + 600; s.z = P.z + 600; s.state = 0; }
  Snd.forget(); put(a, 34, 2); await run(.4); out.far = Snd.lastHeard('groan.hunt');
  Snd.forget(); put(a, 7, 2); await run(.4); out.close = Snd.lastHeard('groan.hunt');
  out.chase = Snd.state().music;
  // left alone they settle, and the music does
  a.x = P.x + 600; a.state = 0; await run(7); out.after = Snd.state().music;
  put(a, 12, 0); Snd.forget(); let t = 0; while (!Snd.lastHeard('groan.low') && t < 30) { a.state = 0; a.x = P.x + 12; a.z = P.z; await run(.25); t += .25; } out.shamble = Snd.lastHeard('groan.low');
  a.x = P.x + 600; await run(.3);
  return out;
});
console.log(`     one that's noticed him at 34 m is ${crowd.far?.g.toFixed(3)}, at 7 m ${crowd.close?.g.toFixed(3)}, and one that hasn't at 12 m ${crowd.shamble?.g.toFixed(3)}`);
check('one that\'s noticed him is louder the closer it is', crowd.far && crowd.close && crowd.close.g > crowd.far.g * 2, crowd);
check('the music turns on him when they\'re after him', crowd.chase === 'chase', crowd.chase);
check('and goes back when they\'re not', crowd.after === 'town', crowd.after);
check('the rest of them groan to themselves', !!crowd.shamble, crowd.shamble);
const grabbed = await g(async () => {
  const H = G.horde, P = G.player.pos; H.T.grabReach = 1.1; Snd.forget(); G.S.mode = 'town'; G.player.inv = 0;
  H.all.slice(0, 6).forEach((s, i) => { const a = i * 1.05; s.x = P.x + Math.cos(a) * .9; s.z = P.z + Math.sin(a) * .9; s.y = P.y; s.state = 2; s.alert = 1; });
  let t = 0; while (G.S.mode !== 'grabbed' && t < 4) { await run(.05); t += .05; }
  await run(.1);
  return { mode: G.S.mode, heard: Snd.state().heard, music: Snd.state().music };
});
check('getting grabbed', grabbed.mode === 'grabbed' && grabbed.heard.includes('groan.grab') && grabbed.music === 'grabbed', grabbed);

// ---------------- what it costs
const cost = await g(() => crowdCost());
check('it keeps to its limit on sounds at once', cost.voices <= 20, cost);
check('no console errors', errors.length === 0, errors.slice(0, 5));
await close();

const silent = await serveAndOpen({ viewport: { width: 390, height: 844 } });
await silent.page.evaluate(setUp);
const off = await silent.page.evaluate(() => crowdCost());
console.log(`     a tick's JS with 48 after him is ${off.each.toFixed(2)} ms with the sound never started and ${cost.each.toFixed(2)} ms with it on, playing ${cost.voices} sounds and ${cost.loops} loops`);
check('and the sound doesn\'t cost a frame anything to speak of', cost.each - off.each < 2, { on: cost.each, off: off.each });
await silent.close();

// ---------------- swapping sounds with a file and a line, and nothing else
const wav = (seconds, hz, { amp = 9000, lead = 0, tail = 0 } = {}) => {
  const rate = 8000, n = Math.floor(seconds * rate), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const t = i / rate; b.writeInt16LE(t < lead || t > seconds - tail ? 0 : Math.round(Math.sin(t * hz * 6.283) * amp), 44 + i * 2); }
  return b;
};
const data = JSON.parse(await readFile(new URL('../data/sound.json', import.meta.url), 'utf8'));
data.cues['step.road'].file = ['audio/test-step.wav', 'audio/test-step.wav'];
data.cues['can.clink'].file = 'audio/not-there.wav';
data.music.title.file = data.music.hang.file = 'audio/test-title.wav';
data.music.town.file = ['audio/test-town.wav', 'audio/test-town2.wav']; data.music.town.next = ['chase'];
data.music.chase.file = 'audio/test-chase.wav';
data.music.dream.file = 'audio/test-fever.wav'; data.music.dream.once = true;
data.music.end.file = 'audio/not-there-either.wav';
data.voice.town = { file: 'audio/test-line.wav', text: 'Words for this line' };
const swapped = await serveAndOpen({ touch: true, overrides: { '/data/sound-new.json': JSON.stringify(data), '/audio/test-step.wav': wav(.1, 400), '/audio/test-title.wav': wav(9, 180, { lead: .5, tail: 1 }), '/audio/test-town.wav': wav(7, 220), '/audio/test-town2.wav': wav(7, 260), '/audio/test-chase.wav': wav(3, 300), '/audio/test-fever.wav': wav(1.5, 150), '/audio/test-line.wav': wav(1.2, 300) } });
const s = (fn, arg) => swapped.page.evaluate(fn, arg);
const asked = []; swapped.page.on('request', (r) => { const p = new URL(r.url()).pathname; if (p.startsWith('/audio/')) asked.push(p.slice(7)); });
const quietFor = (seconds) => swapped.page.waitForTimeout(seconds * 1000);
await s(setUp);
check('nothing\'s downloaded until something\'s been touched', asked.length === 0, asked);
await swapped.page.locator('#soundWord').tap();
await swapped.page.waitForFunction(() => Snd.state().ctx === 'running', null, { timeout: 5000 });
await swapped.page.waitForFunction(() => Snd.state().waiting === 0 && Snd.state().track, null, { timeout: 8000 });
const first = await s(() => ({ muted: Snd.muted, word: document.getElementById('soundWord').textContent, state: Snd.state() }));
check('on a phone, tapping "Sound on" starts it and leaves it on', !first.muted && first.word === 'Sound on', first);
check('and the title\'s track comes down', first.state.track === 'audio/test-title.wav' && !first.state.layered, first.state);
check('with none of the others yet', asked.includes('test-title.wav') && !asked.some((f) => /town|chase|fever/.test(f)), asked);
await quietFor(1.1);
await swapped.page.locator('#soundWord').tap(); await quietFor(.1);
const second = await s(() => ({ muted: Snd.muted, word: document.getElementById('soundWord').textContent }));
await swapped.page.locator('#soundWord').tap(); await quietFor(.1);
const third = await s(() => ({ muted: Snd.muted }));
check('tapping it again turns it off, and again on', second.muted && second.word === 'Sound off' && !third.muted, [second, third]);
const sw = await s(() => ({ files: Snd.state().files, step: Snd.play('step.road'), clink: Snd.play('can.clink') }));
check('a sound with a file plays the file', sw.step && sw.files.includes('step.road'), sw);
check('and one whose file isn\'t there still has its own', sw.clink && !sw.files.includes('can.clink'), sw);
const runsOn = await s(async () => { G.jump('hang'); await run(.3); return Snd.state(); });
check('the hanging shares the title\'s track, and it runs straight on through', runsOn.track === 'audio/test-title.wav' && asked.filter((f) => f === 'test-title.wav').length === 1, [runsOn.track, asked]);
await s(() => { Snd.meter(); }); await quietFor(.6);
const heardTrack = await s(() => Snd.meter());
console.log(`     a track comes out at ${heardTrack.toFixed(1)} dB`);
check('and something\'s coming out of it', heardTrack > -60 && heardTrack < -3, heardTrack);
const said = await s(async () => {
  const sub = document.getElementById('sub'), before = Snd.state().levels.music; G.jump('town'); await run(.5);
  return { before, during: { text: sub.textContent, shown: !sub.hidden, speaking: Snd.state().speaking, music: Snd.state().levels.music } };
});
check('a voice line shows its words', said.during.text === 'Words for this line' && said.during.shown && said.during.speaking === 'town', said.during);
check('the music dips under it', said.during.music < said.before * .6, said);
await snap(swapped.page, 'town-phone-voice');
const over = await s(async () => { await run(1.4); const sub = document.getElementById('sub'); return { shown: !sub.hidden, speaking: Snd.state().speaking, music: Snd.state().levels.music }; });
check('and comes back up, with the words gone, when it\'s over', !over.shown && over.speaking === null && over.music > said.during.music * 1.5, over);
const nothing = await s(() => Snd.say('nobody-has-recorded-this'));
check('a line nobody\'s recorded is nothing at all', nothing === false, nothing);
await swapped.page.waitForFunction(() => Snd.state().track === 'audio/test-town.wav', null, { timeout: 8000 });
const inTown = await s(() => Snd.state());
check('town gets its own, and what comes next is on its way down already', asked.includes('test-town.wav') && asked.includes('test-chase.wav') && asked.includes('test-town2.wav'), asked);
check('a phone only keeps two tracks in memory', inTown.maxTracks === 2 && inTown.tracks.length <= 2, [inTown.maxTracks, inTown.tracks]);
const round = await s(async () => { await run(4); return Snd.state(); });
check('it fades into the next of its list when it comes round', round.rounds === 1 && round.track === 'audio/test-town2.wav', [round.rounds, round.track]);
check('and the drone isn\'t being worked out while a track\'s on', !round.plugged, round.plugged);
await s(() => Snd.music('chase')); await quietFor(.5);
const chased = await s(() => Snd.state());
check('the chase comes straight in', chased.track === 'audio/test-chase.wav', chased.track);
const fever = await s(async () => { G.jump('dream'); await run(.5); while (Snd.state().track !== 'audio/test-fever.wav') await run(.1); const on = Snd.state().track; await run(2.5); return { on, rounds: Snd.state().rounds }; });
check('the fever\'s played once, and doesn\'t come round again', fever.on === 'audio/test-fever.wav' && fever.rounds === 0, fever);
await s(() => Snd.music('end')); await quietFor(.8);
const gone = await s(() => Snd.state());
check('a track that isn\'t there leaves the drone', gone.track === null && gone.layered && gone.plugged && gone.music === 'end', [gone.track, gone.layered, gone.plugged, gone.music]);
const cap = await s(() => { const names = Snd.cueNames().filter((n) => !/^(amb|engine|vehicle\.(road|dirt|skid))/.test(n)); for (let i = 0; i < 3; i++) for (const n of names) Snd.play(n); return Snd.state(); });
check('a phone keeps to 12 sounds at once', cap.maxVoices === 12 && cap.voices <= 12, [cap.maxVoices, cap.voices]);
await s(async () => { G.jump('town'); await run(1); });
await swapped.page.locator('#mute').tap(); await quietFor(.2);
const tapped = await s(() => Snd.muted);
await snap(swapped.page, 'town-phone-muted');
await swapped.page.locator('#mute').tap(); await quietFor(.2);
check('the button mutes it with a tap, and back', tapped && !(await s(() => Snd.muted)), tapped);
check('no console errors with files swapped in, apart from the missing ones', swapped.errors.filter((e) => !/not-there|404/.test(e)).length === 0, swapped.errors.slice(0, 5));
await swapped.close();

// ---------------- the board
const board = await serveAndOpen({ query: '?test#sounds', viewport: { width: 390, height: 844 } });
const b = (fn, arg) => board.page.evaluate(fn, arg);
const buttons = await b(() => document.querySelectorAll('#board button').length);
await board.page.click('#board button:last-of-type');
await board.page.waitForFunction(() => __game.sound.state().ctx === 'running', null, { timeout: 5000 });
const names = await b(() => __game.sound.cueNames().length + Object.keys(__game.sound.data.music).length);
check(`the board at #sounds has a button for all ${names} of them`, buttons === names, { buttons, names });
await snap(board.page, 'board');
await board.close();

// ---------------- the game plays what's made with ElevenLabs, and the old sounds stay what they are
const newSheet = JSON.parse(await readFile(new URL('../data/sound.json', import.meta.url), 'utf8'));
newSheet.cues['step.road'].file = 'audio/made-step.wav';
const both = { '/data/sound-new.json': JSON.stringify(newSheet), '/audio/made-step.wav': wav(.1, 400) };
const oldOne = await serveAndOpen({ query: '?test#sounds', viewport: { width: 390, height: 844 }, overrides: both });
const oldAsked = []; oldOne.page.on('request', (r) => { const p = new URL(r.url()).pathname; if (p.startsWith('/audio/')) oldAsked.push(p); });
await oldOne.page.click('#board button:last-of-type');
await oldOne.page.waitForFunction(() => __game.sound.state().ctx === 'running', null, { timeout: 5000 });
await oldOne.page.waitForTimeout(400);
const oldBoard = await oldOne.page.evaluate(() => ({ file: __game.sound.data.cues['step.road'].file, heading: document.querySelector('#board h2').textContent, marked: document.querySelectorAll('#board button.file').length, played: __game.sound.play('step.road'), track: __game.sound.state().track }));
check('with a new sheet there, the board at #sounds is still the old one, playing the old sounds', oldBoard.file === undefined && oldBoard.heading === 'The score' && oldBoard.marked === 0 && oldBoard.played && oldAsked.length === 0, [oldBoard, oldAsked]);
await oldOne.close();
const newOne = await serveAndOpen({ query: '?test#sounds-new', viewport: { width: 390, height: 844 }, overrides: both });
await newOne.page.click('#board button:last-of-type');
await newOne.page.waitForFunction(() => __game.sound.state().ctx === 'running' && __game.sound.state().waiting === 0, null, { timeout: 5000 });
const newBoard = await newOne.page.evaluate(() => ({ file: __game.sound.data.cues['step.road'].file, heading: document.querySelector('#board h2').textContent, marked: document.querySelectorAll('#board button.file').length, played: __game.sound.play('step.road'), files: __game.sound.state().files }));
check('the board at #sounds-new has what\'s been made, marked', newBoard.file === 'audio/made-step.wav' && newBoard.heading === 'Made with ElevenLabs' && newBoard.marked === 1 && newBoard.played && newBoard.files.includes('step.road'), newBoard);
await newOne.close();
const playing = await serveAndOpen({ query: '?test', viewport: { width: 390, height: 844 }, overrides: both });
const plainGame = await playing.page.evaluate(() => ({ file: __game.sound.data.cues['step.road'].file, board: !document.getElementById('board').hidden }));
check('the game plays the new sheet', plainGame.file === 'audio/made-step.wav' && !plainGame.board, plainGame);
await playing.close();
const trying = await serveAndOpen({ query: '?test#old', viewport: { width: 390, height: 844 }, overrides: both });
const tryAsked = []; trying.page.on('request', (r) => { const p = new URL(r.url()).pathname; if (p.startsWith('/audio/')) tryAsked.push(p); });
await trying.page.keyboard.press('x');
await trying.page.waitForFunction(() => __game.sound.state().ctx === 'running', null, { timeout: 5000 });
await trying.page.waitForTimeout(400);
const oldGame = await trying.page.evaluate(() => ({ file: __game.sound.data.cues['step.road'].file, board: !document.getElementById('board').hidden, title: !document.getElementById('title').hidden }));
check('and #old plays the game with the sounds worked out from code, downloading no audio', oldGame.file === undefined && !oldGame.board && oldGame.title && tryAsked.length === 0, [oldGame, tryAsked]);
await trying.close();
const none = await serveAndOpen({ query: '?test#sounds-new', viewport: { width: 390, height: 844 }, overrides: { '/data/sound-new.json': null } });
const noSheet = await none.page.evaluate(() => ({ cues: __game.sound.cueNames().length, heading: document.querySelector('#board h2').textContent }));
check('with nothing made yet, #sounds-new falls back on the old sheet', noSheet.cues === Object.keys(newSheet.cues).length, noSheet);
check('and that\'s the only complaint', none.errors.filter((e) => !/sound-new|404/.test(e)).length === 0, none.errors.slice(0, 4));
await none.close();

// ---------------- the real ones, on a phone, once they've been made
const made = JSON.parse(await readFile(new URL('../data/sound-new.json', import.meta.url), 'utf8').catch(() => 'null'));
if (made) {
  const real = await serveAndOpen({ touch: true }), r = (fn, arg) => real.page.evaluate(fn, arg), asked = [];
  real.page.on('request', (q) => { const p = new URL(q.url()).pathname; if (p.startsWith('/audio/')) asked.push(p); });
  await r(setUp);
  const began = Date.now(), filed = Object.entries(made.cues).filter(([, c]) => c.file).map(([n]) => n);
  await real.page.keyboard.press('x');
  await real.page.waitForFunction((n) => Snd.state().ctx === 'running' && Snd.state().waiting === 0 && Snd.state().files.length >= n, filed.length, { timeout: 30000 });
  console.log(`     ${asked.length} files fetched and ready ${((Date.now() - began) / 1000).toFixed(1)} s after the first touch`);
  const tracksAsked = () => asked.filter((p) => p.startsWith('/audio/music/'));
  check(`every one of the ${filed.length} sounds has its file, and only the title's track came down with them`, tracksAsked().join() === `/${made.music.title.file}`, tracksAsked());
  const sleep = `(ms) => new Promise((go) => setTimeout(go, ms))`;
  await r((code) => { window.sleep = eval(code); }, sleep);
  for (const [state, st] of Object.entries(made.music)) {
    const first = [st.file ?? []].flat()[0];
    if (!first) continue;
    const got = await r(async ([s, f]) => {
      const t0 = performance.now(); Snd.music(s);
      while (Snd.state().track !== f && performance.now() - t0 < 15000) await sleep(50);
      const loaded = performance.now() - t0; await sleep(2500);
      let sum = 0; for (let i = 0; i < 15; i++) { sum += 10 ** (Snd.meter() / 10); await sleep(100); }
      const now = Snd.state();
      return { loaded, db: 10 * Math.log10(sum / 15), track: now.track, tracks: now.tracks.length, most: now.maxTracks, layered: now.layered };
    }, [state, first]);
    console.log(`     ${state.padEnd(8)} came in ${(got.loaded / 1000).toFixed(1)} s and comes out at ${got.db.toFixed(1)} dB`);
    check(`${state} plays its own track instead of the drone, at a sensible level, with no more than ${got.most} tracks held`, got.track === first && !got.layered && got.db > -45 && got.db < -6 && got.tracks <= got.most, got);
  }
  const LOOPS = /^(amb|engine|vehicle\.(road|dirt|skid))/.source;
  const shots = await r(async (loops) => { const out = { played: 0, missed: [] }; for (const name of Snd.cueNames()) { if (new RegExp(loops).test(name)) continue; while (Snd.state().voices > 6) await sleep(50); if (Snd.play(name)) out.played++; else out.missed.push(name); await sleep(60); } return out; }, LOOPS);
  check(`all ${shots.played} of the sounds that play once do`, shots.missed.length === 0, shots.missed);
  const round = await r(async (loops) => { const out = {}; for (const name of Snd.cueNames()) { if (!new RegExp(loops).test(name)) continue; Snd.loop(name, 1); await sleep(300); out[name] = Snd.state().loopLevels[name]; Snd.loop(name, 0); } return out; }, LOOPS);
  check(`all ${Object.keys(round).length} of the loops do`, Object.values(round).every((v) => v > 0), round);
  const walked = await r(async () => { G.jump('town'); await run(.5); Snd.forget(); G.key('w', true); await run(2); G.key('w', false); const s = Snd.state(); return { heard: s.heard, track: s.track, voices: s.voices, most: s.maxVoices }; });
  check('in town his feet are heard over the real track', walked.heard.some((n) => n.startsWith('step.')) && walked.track?.startsWith('audio/music/town') && walked.voices <= walked.most, walked);
  const cost = await r(() => crowdCost());
  console.log(`     a tick's JS with 48 chasing and the real files: ${cost.each.toFixed(2)} ms`);
  check('it costs no more than the sounds worked out from code did to play', cost.each < 2, cost);
  check('and there are no console errors', real.errors.length === 0, real.errors.slice(0, 5));
  await real.close();
}

console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
