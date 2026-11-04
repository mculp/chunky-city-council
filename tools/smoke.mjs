// Plays Chapter 1 in real Chrome through the ?test hook and fails on a wrong beat or a console error.
//
//   npm i && npm run smoke -- [--shots dir] [--touch]
//
// It serves the repo itself and drives the system Chrome with the GPU on, so WebGL runs for real.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { serveAndOpen } from './browser.mjs';

const args = process.argv.slice(2), shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null, touch = args.includes('--touch');
const { page, errors, close } = await serveAndOpen({ touch });

let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const step = (s) => g((s) => __game.step(s), s);
const key = (k, down = true) => g(([k, d]) => __game.key(k, d), [k, down]);
const snap = async (name) => { if (shots) { await mkdir(shots, { recursive: true }); await page.screenshot({ path: join(shots, name + '.png') }); } };

await g(() => __game.fillTown());
let st = await step(.5);
check('title', st.mode === 'title', st.mode); await snap('title');

// the opening
await page.click('#start');
st = await step(1); check('stuckey card', st.mode === 'hang' && /Stuckey/.test(st.card), st.card); await snap('hang');
st = await step(3.2); check('he decides', /decides/.test(st.card), st.card);
st = await step(2.5); check('cut prompt', /cut the rope/i.test(st.prompt), st.prompt);
await key('e'); st = await step(1.2); check('sawing', st.cut > .4 && st.cut < .6, st.cut); await snap('cut');
st = await step(1.3); check('rope cut', st.mode === 'fall', st.mode); await key('e', false); await snap('fall');
st = await step(1.2); check('in the river', st.mode === 'swim', st.mode); await snap('splash');
check('swim objective', /west bank/i.test(st.obj), st.obj);
st = await step(1.6);
const mocs = await g(() => { const P = __game.player.pos; return __game.river.moccasins().filter((s) => s.shown && Math.hypot(s.x - P.x, s.z - P.z) < 20).length; });
check('cottonmouths in the water with him, and nothing says so', mocs >= 3 && !st.toast, { mocs, toast: st.toast });

// swim to the west bank by hand: face it, hold forward
await g(() => __game.look(Math.PI / 2 + .1, .28));
await key('w');
for (let i = 0; i < 40 && st.mode === 'swim'; i++) { st = await step(1); if (st.hp <= 1) await g(() => { __game.S.hp = 3; }); }
await key('w', false);
check('climbed out', st.mode === 'land', st.mode);
const noose = await g(() => ({ off: __game.S.removedNoose, toast: __game.state().toast }));
check('the noose is off him, and nothing says so', noose.off && !/noose/i.test(noose.toast), noose); await snap('bank');

// up to the road and across the bridge with the planks falling behind
await g(() => { __game.place(-23, 2); __game.look(-Math.PI / 2, .3); });
st = await step(.1); await key('w'); st = await step(.6); check('bridge starts', st.mode === 'bridge', st.mode); await snap('bridge');
for (let i = 0; i < 60 && st.mode === 'bridge'; i++) {
  // hop any time the plank ahead is a hole
  const hop = await g(() => { const p = __game.player.pos; return p.x > -21 && p.x < 21; });
  if (hop && i % 2 === 0) await key(' '); st = await step(.25); await key(' ', false); st = await step(.25);
}
await key('w', false);

// a moccasin where the boards stop, the fever, and he comes to on the Chunky River Bridge at the edge of town
check('a moccasin at the end of the bridge', st.mode === 'bitten', [st.mode, st.pos]); await snap('bitten');
const noControls = async (what) => check(`nothing to press ${what}`, await g(() => { const on = (el) => el && !el.hidden && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none'; return !on(document.getElementById('keyStrip')) && ![...document.querySelectorAll('.ctl')].some(on); }), null);
await noControls('in the bite');
st = await step(4.2); check('the fever has him', st.mode === 'dream', st.mode); await snap('dream'); await noControls('in the dream');
st = await step(11); check('he comes to', st.mode === 'wake', st.mode); await snap('wake'); await noControls('as he comes to');
const wakeAt = await g(() => { const P = __game.player.pos, c = __game.map.crossings.find((q) => q.road === 'griffis_fountain_rd'); return Math.hypot(P.x - c.x, P.z - c.z); });
check(`on the Chunky River Bridge, ${wakeAt.toFixed(0)} m from its middle`, wakeAt < 15, wakeAt);
st = await step(4); check('on his feet, and into town', st.mode === 'town', [st.mode, st.pos]); await snap('town');
check('the road into town', /Griffis Fountain Rd/.test(st.obj), st.obj);
const stuckeys = await g(() => { const P = __game.player.pos; return { far: Math.hypot(P.x, P.z) }; });
check(`and Stuckey's is ${(stuckeys.far / 1609.344).toFixed(1)} miles behind him`, stuckeys.far > 9000, stuckeys);

// Coop's bag to Rocky
await g(() => { const c = __game.npcs.coop; __game.place(c.x, c.z - 1.5); });
st = await step(.1); check('talk prompt', /Coop/.test(st.prompt), st.prompt);
await key('e'); st = await step(.05); await key('e', false); check('coop talks', st.dialog?.who === 'Coop', st.dialog); await snap('coop');
st = await g(() => __game.choose(0)); check('beans ask', /Beans ain/.test(st.dialog?.say), st.dialog);
st = await g(() => __game.choose(0)); st = await g(() => __game.choose(0)); check('got the bag', st.items.bag === 1, st.items);
st = await g(() => __game.choose(0)); check('dialog closed', st.mode === 'town' && /Rocky/.test(st.obj), [st.mode, st.obj]);
await g(() => { const c = __game.npcs.rocky; __game.place(c.x + .5, c.z - 1.5); });
st = await step(.1); await key('e'); st = await step(.05); await key('e', false); check('rocky talks', st.dialog?.who === 'Rocky', st.dialog);
st = await g(() => __game.choose(0)); check('delivered', st.flags.delivered === true && st.beans === 2, st); st = await g(() => __game.choose(0));
await g(() => { const c = __game.npcs.coop; __game.place(c.x, c.z - 1.5); });
st = await step(.1); await key('e'); st = await step(.05); await key('e', false); check('coop pays', st.beans === 5, st.beans); st = await g(() => __game.choose(0));

// sweep for Miss Bobby, then the cans take it to twelve
await g(() => { const c = __game.npcs.bobby; __game.place(c.x + 1.5, c.z); });
st = await step(.1); await key('e'); st = await step(.05); await key('e', false); check('miss bobby talks', st.dialog?.who === 'Miss Bobby', st.dialog);
st = await g(() => __game.choose(0)); st = await g(() => __game.choose(0)); check('sweeping', st.mode === 'sweep', st.mode);
await key('e'); st = await step(3.4); await key('e', false); check('swept', st.flags.swept === true && st.beans === 8, st); await snap('swept');
st = await g((i) => __game.choose(i), st.dialog.opts.length - 1);
const cans = await g(() => __game.pickups.length);
for (let i = 0; i < cans && st.beans < 12; i++) { await g((i) => { const c = __game.pickups[i]; __game.place(c.x, c.z); }, i); st = await step(.2); }
check('twelve beans', st.beans >= 12, st.beans);
st = await step(2); check('chapter ends', st.mode === 'end', st.mode); await snap('end');

// what you've built with people outlasts the page, and a run's own business doesn't
const before = st.people;
check('coop and rocky moved', before.coop.trust !== 0 && before.rocky.trust !== 0, before);
await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
st = await g(() => __game.state());
check('meters survive a reload', JSON.stringify(st.people) === JSON.stringify(before), [st.people, before]);
check('a run\'s own flags don\'t', !st.flags.delivered && !st.flags.swept && st.beans === 0, [st.flags, st.beans]);
check('remembered flags do', st.flags.metCoop === true, st.flags);
check('the title offers to forget', await page.isVisible('#forget'), null); await snap('title-saved');
await page.click('#forget');
st = await g(() => __game.state());
check('forgetting clears everyone', st.people.coop.trust === 0 && !st.flags.metCoop && !(await page.isVisible('#forget')), st.people);
await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
st = await g(() => __game.state()); check('and it stays forgotten', st.people.coop.trust === 0, st.people);

check('no console errors', errors.length === 0, errors);
await close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
