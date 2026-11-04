// Goes to Toni's, at the burned house on Gallatin St, on a phone-sized page with the stick and real taps: that she's there, see-through and shimmering, catching
// frogs in the ditch and the tall grass with nobody living there and nothing parked, and that she's a big-boned ten-year-old and not a small grown-up, measured on
// her mesh against Coop and Miss Bobby and pictured beside them. Then talking to her (CHUNKY-166): she comes up to him when he comes by along Gallatin and asks in
// the words box, with the camera over his shoulder so he can see her, TALK whenever he's near her, her other lines one at a time from the one more thing to ask, him
// or her as the frog is, and what he's seen remembered through a reload. The frog's in both her cupped hands at her chest, has no light of its own and breathes.
// "Got another one?" shows all twelve in one go, each with its line, and then she gives him Gerald. A pickup goes through her, she shows the gone quiet one too, and
// once he's seen a frog they say so. Then Gerald in his hand: all of him showing from the camera, sat on his hand, no swinging, Coop's and Miss Bobby's lines about
// him, letting him go in a ditch, and him gone for good after a reload. Then on a laptop: E to talk to her and number keys for his answers, and a swing going
// through her. Last, the same again with reduced motion, when her rows hold still and so does the frog.
//
//   npm i && npm run toni [-- --shots dir]
import { mkdirSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };

const setUp = () => {
  const G = __game; G.pause(); G.jump('town'); G.S.flags.town = true; G.S.flags.ended = G.S.flags.arrived = true; G.step(.1);
  document.getElementById('card').style.display = 'none';
  window.G = G; window.Tn = G.toni; window.R = G.toni.road; window.T = 1 / 30; window.P = () => G.player.pos;
  window.box = () => (document.getElementById('dialog').hidden ? null : { who: document.getElementById('dWho').textContent, say: document.getElementById('dSay').textContent, opts: [...document.querySelectorAll('#dOpts button')].map((b) => b.textContent.replace(/^\d\. /, '')) });
  window.land = () => { if (box()) G.toni.T.who = null; G.S.mode = 'town'; G.HP.kind = 'run'; G.player.vy = 0; G.player.grounded = true; G.player.inv = 0; G.player.kb.set(0, 0); G.S.hp = 3; G.revive(); document.getElementById('dialog').hidden = true; };
  // a point on Gallatin St, s along it from in front of the house and o out from its middle towards her side
  window.gal = (s, o = -1.2) => R.at(R.s0 + s, o);
  // with the stick, the way a player would: turn to it and push, and let go, or stop as soon as she's asked him something
  window.walkTo = ([tx, tz], seconds = 40) => {
    for (let i = 0; i < seconds * 10 && !box(); i++) { const dx = tx - P().x, dz = tz - P().z, d = Math.hypot(dx, dz); if (d < .4) break; G.look(Math.atan2(-dx, -dz), .3); G.stick(0, Math.min(1, .35 + d)); G.sim(.1, T); }
    G.stick(0, 0); G.sim(.1, T);
    return Math.hypot(P().x - tx, P().z - tz);
  };
  // up to her, wherever she's got to in the yard, until he's in reach to talk to her
  window.toHer = () => {
    for (let i = 0; i < 400; i++) { const s = Tn.state(), dx = s.x - P().x, dz = s.z - P().z, d = Math.hypot(dx, dz); if (d < 1.8) break; G.look(Math.atan2(-dx, -dz), .3); G.stick(0, Math.min(1, .3 + d * .5)); G.sim(.1, T); }
    G.stick(0, 0); G.sim(.1, T); G.step(.05);
    return { d: +Math.hypot(Tn.state().x - P().x, Tn.state().z - P().z).toFixed(2), a: button('bA'), act: G.S.act, prompt: G.state().prompt };
  };
  // stood where he's put, the camera behind him, and nobody remembering him having been near her
  window.stand = ([x, z], [lx, lz]) => { land(); G.place(x, z); G.player.yaw = Math.atan2(lx - x, lz - z); G.look(G.player.yaw + Math.PI, .3); G.stick(0, 0); G.sim(T, T); };
  // until she's doing something, or so long's gone by, saying everything she said over her head on the way
  window.until = (doing, seconds = 30) => { const said = []; for (let i = 0; i < seconds * 10 && Tn.state().doing !== doing; i++) { G.sim(.1, T); const w = Tn.says()?.text; if (w && said.at(-1) !== w) said.push(w); } return { doing: Tn.state().doing, said }; };
  // well away along Gallatin, then back to the house on foot, until she's come up to him and asked
  window.comeBy = () => { stand(gal(95), gal(0)); G.sim(1, T); const walked = walkTo(gal(4)); for (let i = 0; i < 300 && !box(); i++) G.sim(.1, T); const H = Tn.state().home; return { walked, near: +Math.hypot(P().x - H.x, P().z - H.z).toFixed(1), doing: Tn.state().doing, box: box() }; };
  // where she is on the screen, and him, as a part of its width and height, and the top of the words box
  window.onScreen = () => {
    const s = Tn.state(), v = new G.THREE.Vector3(s.x, s.y + .7, s.z).project(G.camera), h = G.heroRoot.position.clone().add(new G.THREE.Vector3(0, 1, 0)).project(G.camera);
    return { her: [+(v.x * .5 + .5).toFixed(3), +(.5 - v.y * .5).toFixed(3)], him: [+(h.x * .5 + .5).toFixed(3), +(.5 - h.y * .5).toFixed(3)], z: v.z, words: +(document.getElementById('dialog').getBoundingClientRect().top / innerHeight).toFixed(3) };
  };
  window.button = (id) => { const e = document.getElementById(id); return e.style.visibility === 'hidden' || e.hidden ? null : e.getAttribute('aria-label'); };
  window.dialog = () => (document.getElementById('dialog').hidden ? null : document.getElementById('dSay').textContent);
  // How much of a frog shows from the camera, as a part of all of it, and how many pixels all of it is. It's drawn flat green over everything else as it's
  // drawn, against what's already there, and then on its own. Its outline's left out, and it's straight from the scene, without the picture's grain or tint.
  // `lit` also says how bright the part that shows is, as the scene draws it.
  window.shows = (frog, lit = false) => {
    const r = G.renderer, T3 = G.THREE, size = r.getDrawingBufferSize(new T3.Vector2()), w = size.x, h = size.y;
    const rt = new T3.WebGLRenderTarget(w, h), flat = new T3.MeshBasicMaterial({ color: 0x00ff00, fog: false, toneMapped: false }), px = new Uint8Array(w * h * 4), drawn = new Uint8Array(w * h * 4);
    const its = []; frog.traverse((o) => { if (o.isMesh) its.push({ o, m: o.material, v: o.visible }); });
    const green = () => { r.readRenderTargetPixels(rt, 0, 0, w, h, px); let n = 0, sum = 0; for (let i = 0; i < px.length; i += 4) if (px[i] === 0 && px[i + 1] === 255 && px[i + 2] === 0) { n++; sum += .2126 * drawn[i] + .7152 * drawn[i + 1] + .0722 * drawn[i + 2]; } return { n, sum }; };
    const auto = r.autoClear; r.setRenderTarget(rt);
    if (lit) { r.autoClear = true; r.render(G.scene, G.camera); r.readRenderTargetPixels(rt, 0, 0, w, h, drawn); }
    its.forEach((e) => (e.o.visible = false)); r.autoClear = true; r.render(G.scene, G.camera);
    const hid = []; G.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible) { o.visible = false; hid.push(o); } });
    its.forEach((e, i) => { e.o.visible = i !== 1 && e.v; e.o.material = flat; }); r.autoClear = false; r.clearColor(); r.render(G.scene, G.camera);
    const seen = green(); r.autoClear = true; r.render(G.scene, G.camera); const all = green();
    r.setRenderTarget(null); r.autoClear = auto; hid.forEach((o) => (o.visible = true)); its.forEach((e) => { e.o.material = e.m; e.o.visible = e.v; });
    rt.dispose(); flat.dispose();
    return { part: all.n ? +(seen.n / all.n).toFixed(2) : 0, px: all.n, ...(lit && { bright: seen.n ? +(seen.sum / seen.n).toFixed(1) : 0 }) };
  };
  // how tall and how wide the hand Gerald's in is, in metres
  window.hand = () => { const s = new G.THREE.Box3().setFromObject(G.hero.arms[0].fist).getSize(new G.THREE.Vector3()); return { tall: +s.y.toFixed(3), wide: +Math.max(s.x, s.z).toFixed(3) }; };
  // what's alive about the frog in her hands, a twelfth of a second at a time for so long
  window.watchFrog = (seconds) => { const f = []; for (let i = 0; i < seconds * 12; i++) { G.sim(1 / 12, T); f.push(Tn.frog()); } return { throat: [Math.min(...f.map((x) => x.throat)), Math.max(...f.map((x) => x.throat))], blinks: f.filter((x, i) => x.blink && !f[i - 1]?.blink).length, turns: new Set(f.map((x) => x.turn)).size }; };
};

let { page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } });
let g = (fn, arg) => page.evaluate(fn, arg);
const snap = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); };
const tap = async (id) => { await page.tap(id); await g(() => __game.sim(1 / 30, 1 / 30)); };
// one of his answers in the words box, by what it says, with a real tap
const answer = async (text) => {
  const i = await g((t) => [...document.querySelectorAll('#dOpts button')].findIndex((b) => b.textContent.replace(/^\d\. /, '') === t), text);
  if (i < 0) return null;
  await page.tap(`#dOpts button:nth-child(${i + 1})`); await g(() => __game.sim(1 / 30, 1 / 30));
  return g(() => box());
};
const reload = async () => { await page.reload({ waitUntil: 'load', timeout: 120000 }); await page.waitForFunction(() => window.__game, null, { timeout: 60000 }); await g(setUp); };
await g(setUp);
const WORDS = await g(() => fetch('data/toni.json').then((r) => r.json()));
const lineOf = (name) => WORDS.frogs[name];

// ---- the place, and her in it
let r = await g(() => {
  const s = Tn.state(), H = s.home, away = Math.max(...s.spots.map(([x, z]) => Math.hypot(x - H.x, z - H.z)));
  const ditch = s.spots.filter(([x, z]) => Tn.inDitch(x, z)).length;
  return { away: +away.toFixed(1), ditch, spots: s.spots.length, home: G.homes.some((h) => h.id === 75037508), parked: G.vehicles.filter((v) => Math.hypot(v.x - H.x, v.z - H.z) < 30).length, roof: G.structures.find((t) => t.id === 75037508).roofColor, drive: G.map.roadById.get('drive_75037508')?.surface };
});
check('she catches frogs in the ditch along Gallatin and in the grass round the house, never far from it', r.away < 30 && r.ditch >= 4 && r.ditch < r.spots, r);
check('nobody lives at the burned house, nobody\'s parked there, its roof is brown and the drive in is gravel', !r.home && r.parked === 0 && r.roof === '#664a33' && r.drive === 'gravel', r);
// once she's up out of the grass with one, since while she's down catching it it's in the grass
r = await g(() => { stand(gal(6, -3), Tn.road.at(Tn.road.s0 - 30, 20)); G.sim(2, T); for (let i = 0; i < 100 && Tn.state().inHand < 0; i++) G.sim(.1, T); G.step(.05); return { drawn: Tn.state().drawn, astral: Tn.astral(), frog: Tn.state().inHand }; });
check('near the house she\'s drawn, all of her as a projection, her hands too, but the frog in them, which is solid', r.drawn && r.astral.all && r.astral.frogSolid && r.frog >= 0, r);

// ---- a big-boned ten-year-old, and not a small grown-up
r = await g(() => Tn.build());
const { toni: B, coop: C, bobby: M } = r;
check(`she's ${B.tall} m tall and her head's ${B.head} m from chin to crown, so ${B.heads} heads tall, where Coop and Miss Bobby are ${C.heads} and ${M.heads}`, Math.abs(B.tall - 1.36) < .02 && B.heads > 4.5 && B.heads < 4.9 && Math.abs(B.head - .29) < .015 && C.heads > 5.5 && M.heads > 5.5, r);
check(`her round head's ${Math.round(B.across * 100)}% as wide as her shoulders, where theirs are ${Math.round(C.across * 100)}% and ${Math.round(M.across * 100)}%`, B.across > .66 && B.across < .75 && C.across < .6 && M.across < .6, r);
check(`big-boned, her shoulders are ${B.shoulders} m across, ${Math.round(B.shoulders / B.tall * 100)}% of her height where theirs are ${Math.round(C.shoulders / C.tall * 100)}%, and her legs are short, her hips ${Math.round(B.legs * 100)}% of the way up her where theirs are ${Math.round(C.legs * 100)}%`, B.shoulders / B.tall > C.shoulders / C.tall && B.legs < C.legs - .03, r);
if (shots) {
  await g(() => {
    const s = Tn.state(), x = s.home.x + 6, z = s.home.z + 9; land(); G.place(...Tn.road.at(Tn.road.s0 - 75, -1)); G.sim(.5, T);
    Object.assign(Tn.T, { doing: 'stand', x, z, yaw: 0, left: 1e9, who: null }); G.sim(.3, T); G.step(.05);
    const y = Tn.state().y + G.hills.at(x, z) * G.hills.uniforms.uHillScale.value - G.hills.here();
    Tn.lineUp(true); G.heroRoot.position.set(x - 2.1, y, z + .1); G.heroRoot.rotation.y = 0;
    G.camera.position.set(x - .55, y + 1.2, z + 12); G.camera.lookAt(x - .55, y + .95, z); G.camera.fov = 40; G.camera.updateProjectionMatrix(); G.render(0);
  });
  await snap('0-beside-them');
  await g(() => { Tn.lineUp(false); Tn.T.left = 1; G.camera.fov = 55; G.camera.updateProjectionMatrix(); });
}

// ---- he comes by, and she comes up and asks him
r = await g(() => comeBy());
check('he walks along Gallatin to the house, and she comes up and asks him in the words box: "Wanna see a frog?"', r.near < 26 && r.doing === 'ask' && r.box?.who === 'Toni' && r.box.say === WORDS.ask && r.box.opts.join('|') === 'Yeah.|Later.', r);
r = await g(() => { G.sim(.8, T); G.step(.05); return { screen: onScreen(), cam: G.cam.talk, mode: G.S.mode }; });
check('and the camera goes over his shoulder, with her on the screen beside him and above the words', r.mode === 'dialog' && r.cam > .99 && r.screen.z < 1 && r.screen.her.every((v) => v > .05 && v < .95) && r.screen.her[1] < r.screen.words && Math.abs(r.screen.her[0] - r.screen.him[0]) > .12, r);
r = await answer('Later.');
r = { box: r, ...(await g(() => { G.sim(.5, T); return { talking: Tn.talking(), mode: G.S.mode }; })) };
check('"Later." and she goes back to her frogs', !r.box && !r.talking && r.mode === 'town', r);
r = await g(() => { G.sim(40, T); return { box: box(), seen: Tn.state().mind.seen.length }; });
check('standing about by the house, she doesn\'t come up again', !r.box && r.seen === 0, r);

// ---- TALK whenever he's near her, and what she shows him
r = await g(() => toHer());
check('up to her in the yard, the button says TALK', r.a === 'TALK' && r.act === 'Talk to Toni', r);
await tap('#bA');
r = await g(() => box());
check('and she asks him', r?.say === WORDS.ask, r);
r = await answer('Yeah.');
check('"Yeah." and it\'s Gerald first, with what she says about him, and something to ask her about him', r?.say === lineOf('Gerald') && r.opts.join('|') === 'Got another one?|Can I pet him?|Later.', r);
r = await g(() => { G.sim(.8, T); G.step(.05); return Tn.frog(); });
check(`he's in both her hands, cupped together, ${r.high} m up at her chest and ${r.off} m from the middle of them`, r.shown === 0 && r.cupped && !r.fists && r.off < .03 && r.high > .82 && r.high < .98, r);
await snap('1-gerald');
r = await g(() => { const on = shows(Tn.mesh(), true), was = Tn.shimmer(); Tn.shimmer(0); const dark = shows(Tn.mesh(), true); Tn.shimmer(was); return { on, dark, frog: Tn.frog() }; });
check(`he has no light of his own: lit by her he's ${r.on.bright} bright, and ${r.dark.bright} with her light off`, r.frog.lit === 'shimmer' && r.frog.glow === 0 && r.on.px > 50 && r.on.bright > r.dark.bright * 1.5, r);
r = await g(() => watchFrog(12));
check(`and he's alive: his throat goes from ${r.throat[0]} to ${r.throat[1]} of its height as he breathes, he blinks ${r.blinks} times in 12 seconds and shifts in her hands`, r.throat[0] < 1.05 && r.throat[1] > 1.5 && r.blinks >= 2 && r.turns >= 2, r);
r = await answer('Can I pet him?');
check('her other lines come from the one more thing to ask, one at a time', r?.say === 'You can pet him with one finger. One.' && r.opts.join('|') === 'Got another one?|Is he a prince?|Later.', r);
r = await answer('Got another one?');
check('"Got another one?" gets the next one he hasn\'t seen, Tuba', r?.say === lineOf('Tuba'), r);
r = await answer('Got another one?');
check('and Princess, who\'s a her', r?.say === lineOf('Princess') && r.opts.includes('Is she a princess?'), r);
r = await answer('Is she a princess?');
check('and asked, it\'s her and not him', r?.say === 'Kiss her if you want. Nothing happens. I checked.' && r.opts.includes('Are you really here?'), r);
r = await answer('Are you really here?');
check('and the last of them, after which there\'s nothing more to ask', r?.say === 'I\'m not really here. The frogs are, though.' && r.opts.join('|') === 'Got another one?|Later.', r);
await answer('Later.');
await reload();
r = await g(() => { const before = [...Tn.state().mind.seen], a = comeBy(); return { before, ...a }; });
const again = await answer('Yeah.');
check('after a reload she remembers he\'s seen Gerald, Tuba and Princess, and shows him Pickle', r.before.join() === 'Gerald,Tuba,Princess' && again?.say === lineOf('Pickle'), { ...r, again });
await answer('Later.');

// ---- all twelve in one go, and then Gerald
await g(() => { localStorage.removeItem('chunky.toni'); });
await reload();
r = await g(() => comeBy());
const lines = [];
let said = await answer('Yeah.');
for (let i = 0; i < 12 && said; i++) { lines.push(said.say); if (i < 11) said = await answer('Got another one?'); }
const names = await g(() => Tn.FROGS.map((f) => f.name));
check(`"Got another one?" shows him all twelve, one after another, each with its line: ${lines.length} of them`, lines.length === 12 && lines.every((l, i) => l === lineOf(names[i])), lines);
said = await answer('Got another one?');
r = await g(() => { const a = { ...Tn.frog(), held: Tn.gerald().held }; G.sim(2, T); return { a, b: { held: Tn.gerald().held, box: box(), items: G.S.items.gerald } }; });
check('and after the twelfth she holds Gerald out, "Take Gerald. He knows now.", and he\'s his', said?.say === WORDS.give && said.opts.join('|') === 'Later.' && r.a.shown === 0 && !r.a.held && r.b.held && r.b.items === 1, { said, r });
r = await g(() => { G.sim(4, T); return { box: box(), talking: Tn.talking(), frog: Tn.frog() }; });
check('then she goes back to her frogs, and the words box goes', !r.box && !r.talking, r);

// ---- nothing stops on her
r = await g(() => {
  // straight through where she's standing, with the stick, and nothing in the way
  const s = Tn.state(); land(); G.place(s.x - 3, s.z); G.sim(T, T); const dx = s.x - P().x, dz = s.z - P().z, d = Math.hypot(dx, dz), past = [s.x + dx / d * 2.5, s.z + dz / d * 2.5];
  Object.assign(Tn.T, { doing: 'stand', left: 1e9 });
  return { blocked: G.blocked(s.x, s.z, G.floorAt(s.x, s.z) + 1), left: walkTo(past, 6) };
});
check('he walks straight through her, and nothing\'s in the way where she stands', !r.blocked && r.left < .6, r);
// the gone quiet: one stood near her, who she shows one, and they don't react
r = await g(() => {
  Tn.T.left = 1; G.bringOutCrowd(); const H = G.horde, q = H.all.find((s) => s.quiet === true);
  const [x, z] = Tn.road.at(Tn.road.s0 - 8, 9);
  Object.assign(q, { x, z, tx: x, tz: z, homeX: x, homeZ: z, y: G.floorAt(x, z), state: 1, timer: 200, alert: 0, sus: 0, flat: 0, started: false });
  stand(gal(2, -2), [x, z]); Tn.night();
  const said = [];
  for (let i = 0; i < 400; i++) { G.sim(.1, T); q.state = 1; q.timer = 200; q.tx = x; q.tz = z; const w = Tn.says()?.text; if (w && said.at(-1) !== w) said.push(w); if (said.includes('He liked it. He just doesn\'t show it.')) break; }
  return { said, who: Tn.state().who, state: q.state };
});
check('she shows one of the gone quiet one too, over her head, and is fine about it', r.said.includes(WORDS.ask) && r.said.includes(WORDS.quiet), r);
r = await g(() => {
  const H = G.horde, near = H.all.filter((s) => s.quiet === true).slice(0, 6), [x, z] = gal(0, -2);
  near.forEach((s, i) => Object.assign(s, { x: x + (i - 2.5) * 1.6, z: z - 3.2, tx: x + (i - 2.5) * 1.6, tz: z - 3.2, homeX: x, homeZ: z, y: G.floorAt(x, z), state: 0, alert: 0, sus: 0, flat: 0, mutterNext: 0 }));
  stand(gal(0, -1), [x, z - 3.2]); const heard = new Set();
  for (let i = 0; i < 240; i++) { near.forEach((s) => Object.assign(s, { state: 1, timer: 60, tx: s.x, tz: s.z })); G.sim(.4, T); G.step(1 / 60, 1 / 60); for (const m of G.mutters()) heard.add(m.says); if ([...heard].some((w) => w.startsWith('Did she show you'))) break; }
  return [...heard];
});
check('once he\'s seen one, the gone quiet near Gallatin ask him if she showed him one he has', r.some((w) => /^Did she show you \w+\?$/.test(w)), r);
await snap('2-quiet');

// ---- Gerald in his hand
r = await g(() => { G.horde.all.forEach((s, i) => Object.assign(s, { x: P().x + 900 + i, z: P().z + 900, tx: P().x + 900 + i, tz: P().z + 900, homeX: P().x + 900 + i, homeZ: P().z + 900 })); land(); G.place(...gal(-30, -1)); G.stick(0, 0); G.sim(.5, T); G.step(.1); return { ...Tn.gerald(), a: button('bA') }; });
check('Gerald\'s in his hand, and there\'s no SWING with his hand full', r.held && r.drawn && r.a === null, r);
// From the camera it's played with, behind him, standing and walking, from behind on his left, which is the hand he's in, and turned round in front of him: all of
// Gerald shows, sat on top of his hand, which is flat under him and not closed round him, which read as a can
r = await g(() => {
  const at = gal(-30, -1), view = (turn) => { land(); G.place(...at); G.player.yaw = Math.PI / 2; G.look(G.player.yaw + turn, .3); G.stick(0, 0); G.sim(.4, T); G.step(.05); return { ...shows(Tn.meshes.gerald), yaw: +G.player.yaw.toFixed(2) }; };
  const behind = view(Math.PI), left = view(-Math.PI * .75), front = view(0);
  G.look(G.player.yaw + Math.PI, .3); G.stick(0, 1); G.sim(.6, T); const walking = []; for (let i = 0; i < 4; i++) { G.sim(.1, T); G.step(1 / 30); walking.push(shows(Tn.meshes.gerald)); } G.stick(0, 0);
  return { behind, left, front, walking: walking.reduce((a, b) => (b.part < a.part ? b : a)), hand: hand(), drawn: Tn.gerald().drawn };
});
const views = ['behind', 'left', 'front', 'walking'];
check(`all of Gerald shows on top of his hand: ${views.map((v) => `${Math.round(r[v].part * 100)}% of him from ${v === 'walking' ? 'behind him walking' : v === 'left' ? 'behind on his left' : v === 'front' ? 'in front' : 'behind him'}`).join(', ')}`, r.drawn && views.every((v) => r[v].part >= .9 && r[v].px >= 120), r);
check(`and the hand he's on is flat under him, ${r.hand.tall} m tall and ${r.hand.wide} m across, not closed round him`, r.hand.tall < r.hand.wide * .6, r.hand);
await g(() => { G.look(G.player.yaw + Math.PI, .3); G.sim(.4, T); G.step(.05); });
await snap('3-gerald-in-hand');
await tap('#bA').catch(() => {});
r = await g(() => { G.sim(.2, T); return { swinging: G.swinging() }; });
check('and a tap where the button was doesn\'t swing', !r.swinging, r);

// ---- shown to Coop and Miss Bobby, then let go in a ditch
for (const [who, line] of [['coop', 'That one of Toni\'s? Keep him off my counter. Last one got in the jerky.'], ['bobby', 'She gave you Gerald? Baby, she doesn\'t give Gerald to anybody.']]) {
  r = await g((who) => { const n = G.npcs[who]; land(); G.place(n.x + 1.6, n.z); G.player.yaw = Math.atan2(n.x - P().x, n.z - P().z); G.sim(.2, T); G.step(.05); return { a: button('bA'), act: G.S.act }; }, who);
  const shown = r;
  await tap('#bA');
  r = await g(() => { G.sim(.3, T); const say = dialog(); land(); return say; });
  check(`near ${who === 'coop' ? 'Coop' : 'Miss Bobby'} the button says SHOW, and showing him gets "${line}"`, shown.a === 'SHOW' && r === line, { shown, said: r });
}
r = await g(() => { const n = G.npcs.coop; land(); G.place(n.x + 1.6, n.z); G.sim(.2, T); G.step(.05); return button('bA'); });
check('and once they\'ve seen him, it\'s just TALK again', r === 'TALK', r);
r = await g(() => {
  // the ditch: past the shoulder of Gallatin, on her side, away from the drive
  const [x, z] = Tn.road.at(Tn.road.s0 + 12); land(); G.place(...gal(12, -1)); G.sim(.1, T);
  const d = walkTo([x, z], 15); G.sim(.2, T); G.step(.05);
  return { d, a: button('bA'), act: G.S.act, ditch: Tn.inDitch(P().x, P().z) };
});
check('in the ditch the button says LET GO', r.a === 'LET GO' && r.ditch, r);
await tap('#bA');
r = await g(() => { const at = []; for (let i = 0; i < 12; i++) { G.sim(.1, T); at.push(Tn.gerald().free); } G.step(.05); return { ...Tn.gerald(), hopped: at.some(Boolean), a: button('bA') }; });
check('and he\'s let go, hops off into the ditch, and his hand\'s free to swing again', !r.held && !r.drawn && r.hopped && r.a === 'SWING', r);
await reload();
r = await g(() => comeBy());
said = await answer('Yeah.');
const after = [said?.say];
for (let i = 0; i < 12 && said; i++) { said = await answer('Got another one?'); after.push(said?.say); }
r = { ...(await g(() => ({ gerald: Tn.gerald(), gave: Tn.state().mind.gave }))), after };
check('after a reload Gerald\'s gone for good: she shows him the others, and never Gerald, or gives him again', !r.gerald.held && r.gave && after.length === 13 && after.every((l) => l && l !== WORDS.give && l !== lineOf('Gerald')), r);
console.log('errors', JSON.stringify(errors.slice(0, 5)));
check('nothing went wrong in the console', !errors.length, errors.slice(0, 5));
await close();

// ---- on a laptop: E to talk to her, the number keys for his answers, and a swing going through her
({ page, errors, close } = await serveAndOpen({}));
g = (fn, arg) => page.evaluate(fn, arg);
await g(setUp);
const came = await g(() => comeBy());
await page.keyboard.press('2'); await g(() => G.sim(.5, T));
const later = await g(() => ({ box: box(), talking: Tn.talking() }));
r = await g(() => toHer());
check('on a laptop she asks him the same, 2 is "Later.", and near her it says E · Talk to Toni', came.box?.say === WORDS.ask && !later.box && !later.talking && r.prompt === 'E · Talk to Toni', { came, later, r });
await page.keyboard.press('e'); await g(() => G.sim(.2, T));
const keyed = [await g(() => box())];
await page.keyboard.press('1'); await g(() => G.sim(.2, T));
keyed.push(await g(() => box()));
await page.keyboard.press('2'); await g(() => G.sim(.2, T));
keyed.push(await g(() => box()));
check('E and she asks him, 1 is "Yeah." and Gerald, and 2 is the one more thing to ask', keyed[0]?.say === WORDS.ask && keyed[1]?.say === lineOf('Gerald') && keyed[2]?.say === 'You can pet him with one finger. One.', keyed);
await page.keyboard.press('3'); await g(() => G.sim(.5, T));
r = await g(() => {
  land(); const s = Tn.state(); Object.assign(Tn.T, { doing: 'stand', left: 1e9 }); G.place(s.x - 2.9, s.z); G.player.yaw = Math.PI / 2; G.sim(T, T);
  G.key('f'); G.sim(T, T); G.key('f', false); const swung = G.swinging(); G.sim(.8, T); const t = Tn.state();
  return { swung, doing: t.doing, moved: +Math.hypot(t.x - s.x, t.z - s.z).toFixed(3), box: box() };
});
check('3 is "Later.", and a swing at her goes through her, and she carries on', r.swung && r.doing === 'stand' && r.moved < .01 && !r.box, r);
console.log('errors', JSON.stringify(errors.slice(0, 5)));
check('nothing went wrong in the console on a laptop', !errors.length, errors.slice(0, 5));
await close();

// ---- reduced motion: her rows hold still, and so does the frog
({ page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }));
g = (fn, arg) => page.evaluate(fn, arg);
await g(setUp);
r = await g(() => comeBy());
await answer('Yeah.');
r = { ...r, frog: await g(() => watchFrog(8)) };
check('with reduced motion she still comes up and shows him a frog, which sits still in her hands', r.box?.say === WORDS.ask && r.frog.throat[0] === 1 && r.frog.throat[1] === 1 && r.frog.blinks === 0 && r.frog.turns === 1, r);
// a little of her middle, while she's talking to him and on the screen above the words, drawn with her rows' step put somewhere else and nothing else changed
const rows = async () => {
  const box = await g(() => { G.sim(.8, T); G.step(.02); const s = Tn.state(), v = new G.THREE.Vector3(s.x, s.y + .5, s.z).project(G.camera), x = (v.x * .5 + .5) * innerWidth, y = (.5 - v.y * .5) * innerHeight; return { x, y, on: v.z < 1 && x > 30 && x < innerWidth - 30 && y > 50 && y < document.getElementById('dialog').getBoundingClientRect().top - 50, talking: Tn.talking() }; });
  const clip = { x: Math.max(0, box.x - 30), y: Math.max(0, box.y - 50), width: 60, height: 100 };
  const shot = async (step) => { await g((step) => { Tn.rows(step); G.render(0); }, step); return page.screenshot({ clip }); };
  const a = await shot(0), again = await shot(0), b = await shot(2);
  return { on: box.on && box.talking, same: a.equals(b), steady: a.equals(again), clip };
};
r = await rows();
check('and her rows hold still from one frame to the next', r.on && r.steady && r.same, r);
await close();
({ page, errors, close } = await serveAndOpen({ touch: true, viewport: { width: 390, height: 844 } }));
g = (fn, arg) => page.evaluate(fn, arg);
await g(setUp);
await g(() => comeBy());
r = await rows();
check('where without it they climb her', r.on && r.steady && !r.same, r);
await close();
process.exit(failed ? 1 : 0);
