// Miss Bobby's steps (CHUNKY-182), on a phone-sized page with real taps and a real finger on A: while they want sweeping today, "Sweep the
// steps." is one of the choices whenever he talks to her, with her written lines and with her own words, in the story and in a town that's
// shared, and her model's told that's the one thing she can ask him for. Picking it sweeps them and pays from the pantry as data/cast.md
// says, and once they're swept today she's told there's nothing to ask and the choice is gone. In a town that's shared the pantry that
// pays is the player's own, which goes to the town with what they carry, and the story's pantry and how she feels about him in it are
// as they were, and when they come back into the town another time it's kept their pantry for them as they left it. The model's words
// are a stand-in's, a line at a time.
//
//   npm i && npm run sweep [-- --shots dir]
import { mkdirSync, readFileSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';
import { startServer } from '../server/index.js';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(40); } };
const TALK = JSON.parse(readFileSync(new URL('../data/talk.json', import.meta.url), 'utf8'));
const SWEEP = 'Sweep the steps.', PHONE = { touch: true, viewport: { width: 390, height: 844 } }, TALK_AT = 'http://localhost:65534/talk';
// what her model's told she can ask for, for him or for anyone else
const CAN = (him) => `Right now you can ask ${him} to ${TALK.asks.what.sweep}, and that's all you can ask.`;
const CANT = (him) => `Right now there's nothing you can ask ${him} to do`;
const line = (say, replies) => JSON.stringify({ say, mood: 'warm', do: [], remember: '', replies });

let page, errors, close, g, cdp;
async function open(how) {
  ({ page, errors, close } = await serveAndOpen(how));
  g = (fn, arg) => page.evaluate(fn, arg);
  cdp = await page.context().newCDPSession(page);
  // every ask of the talk server, as it went, and its answers a line at a time
  page.heard = []; page.script = [];
  await page.route(TALK_AT, async (route) => {
    page.heard.push(JSON.parse(route.request().postData()));
    const next = page.script.shift() ?? { quiet: 'off' };
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(typeof next === 'string' ? { reply: next, model: 'scripted', cost: 0, ms: 1 } : next) });
  });
}
async function shut() { check('no console errors', !errors.length, errors); await close(); }
const snap = async (name) => { if (shots) { if (await g(() => !!window.__net)) await sleep(800); else await g(() => G.step(1)); await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); } };
const lastAsk = () => page.heard.at(-1)?.messages[0]?.content ?? '';
// A down with a real finger, while the clock goes on by `seconds`: stepped, with the clock held, or as it runs
async function holdA(seconds, running = false) {
  const b = await page.locator('#bA').boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  if (running) await sleep(seconds * 1000); else await g((s) => __game.step(s), seconds);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// ---------------- the story, with the clock held
await open(PHONE);
await g(() => {
  const G = window.G = __game; G.pause(); G.jump('town'); G.S.flags.town = true; G.S.flags.arrived = true; G.S.beans = 0; G.step(.1);
  document.getElementById('card').style.display = 'none';
  // from well away, up in front of her, and a moment for whatever's asked as he comes near
  window.near = () => { const n = G.npcs.bobby; G.place(n.x + G.talk.AWAY + 5, n.z); G.step(.05); G.place(n.x + 1.5, n.z); G.step(.1); };
  window.seen = () => { const d = G.state().dialog; return d && { ...d, opts: d.opts.map((o) => o.replace(/^\d\. /, '')) }; };
  window.settle = async () => { await G.talk.settled(); await new Promise((r) => setTimeout(r, 0)); G.step(.02); };
});
const talk = async () => { await g(() => near()); await page.tap('#bA'); await g(() => G.step(.05)); await g(() => settle()); return g(() => seen()); };
const tapOpt = async (text) => { await page.locator('#dOpts button', { hasText: text }).first().tap(); await g(() => G.step(.05)); await g(() => settle()); return g(() => seen()); };
// what's on the church's shelf is the pantry's, which the shelf's drawn from whenever it changes
const sweepIt = async () => {
  const before = await g(() => ({ beans: G.S.beans, stock: G.church.pantry.stock(G.church.today()) }));
  await tapOpt(SWEEP);
  const mode = await g(() => G.state().mode);
  await holdA(3.6);
  await g(() => settle());
  const after = await g(() => ({ beans: G.S.beans, stock: G.church.pantry.stock(G.church.today()), shelf: G.church.shown(), d: seen() }));
  return { mode, paid: after.beans - before.beans, off: before.stock - after.stock, drawn: after.shelf === after.stock, d: after.d };
};

// In Chapter 1, with her written lines: the choice is on her first line, before he's asked for beans, and it sweeps and pays his three
let d = await talk();
check(`in Chapter 1, with her written lines, "${SWEEP}" is one of the choices from the first: ${d?.opts.join(' | ')}`, d?.opts.includes(SWEEP) && d.opts.includes('Can I get some beans?') && d.opts.at(-1) === 'Later.', d);
const face = await g(() => { G.step(1); return { ...G.talkView(), words: document.querySelector('#dialog .box').getBoundingClientRect().top }; });
check('Miss Bobby is visible above her words before sweeping, not hidden behind his hood', face.clear && face.behind && face.face.depth < 1 && face.face.y > 60 && face.face.y < face.words - 30, face);
await snap('1-her-written-line');
let r = await sweepIt();
check(`and picking it sweeps the steps, and pays his three: +${r.paid}, ${r.off} off the church's shelf`, r.mode === 'sweep' && r.paid === 3 && r.off === 3 && r.drawn, r);
check(`then she has her say, and neither asks nor offers it again: ${r.d?.opts.join(' | ')}`, /lantern man/.test(r.d?.say) && !r.d.opts.includes(SWEEP) && !r.d.opts.includes('Can I get some beans?'), r.d);
const thankedFace = await g(() => { G.step(1); return G.talkView(); });
check('the speaker stays in view when sweeping returns to her words', thankedFace.clear && thankedFace.behind && thankedFace.face.x > 24 && thankedFace.face.x < 366, thankedFace);
await snap('1b-after-sweeping');
await tapOpt('Later.');
d = await talk();
check(`and talking to her again that day, it isn't there: ${d?.opts.join(' | ')}`, d && !d.opts.includes(SWEEP), d);
await tapOpt('Later.');

// After Chapter 1, the next day, with her own words: the choice is there with her answers, she's told it's all she can ask, and it pays
await g(() => { G.S.flags.ended = true; G.churchSigns.clock(Date.now() + 864e5); G.step(.1); });
await g((url) => G.talk.on(url), TALK_AT);
page.script.push(line('Evening, baby. Steps are gritty again, and the Lord sees grit.', ["Evening, Miss Bobby.", 'Gritty how?', 'Long day?']));
d = await talk();
const wanted = lastAsk();
check(`the next day, in her own words, "${SWEEP}" is one of the choices with her answers: ${d?.opts.join(' | ')}`, d?.say.startsWith('Evening, baby.') && d.opts.includes(SWEEP) && d.opts.includes('Evening, Miss Bobby.') && d.opts.at(-1) === 'Later.' && d.opts.length === 4, d);
check('and her model was told that\'s the one thing she can ask him for', wanted.includes(CAN('him')) && !wanted.includes(CANT('him')), wanted.slice(wanted.indexOf('Right now'), wanted.indexOf('Right now') + 260));
await snap('2-her-own-words');
page.script.push(line('There now. You did my steps like you meant it, sugar.', ['I did mean it.', 'Anytime.', 'Thank you, ma\'am.']));
r = await sweepIt();
const thanked = lastAsk();
check(`picking it sweeps and pays from the pantry: +${r.paid}, ${r.off} off the church's shelf`, r.mode === 'sweep' && r.paid === 3 && r.off === 3 && r.drawn, r);
check(`and once they're swept, she's told there's nothing to ask, and it isn't there: ${r.d?.opts.join(' | ')}`, r.d?.say.startsWith('There now.') && !r.d.opts.includes(SWEEP) && thanked.includes(CANT('him')) && !thanked.includes(CAN('him')), { d: r.d, told: thanked.slice(thanked.indexOf('Right now'), thanked.indexOf('Right now') + 120) });
await tapOpt('Later.');
page.script.push(line('Don\'t you track that grit back in here.', ['No ma\'am.', 'Wouldn\'t dream of it.', 'Night.']));
d = await talk();
check(`and the same day, in her own words again, still nothing: ${d?.opts.join(' | ')}`, d?.say.startsWith('Don\'t you track') && !d.opts.includes(SWEEP) && lastAsk().includes(CANT('him')), d);
await tapOpt('Later.');
await shut();

// ---------------- a town that's shared, with the clock running, on a phone that's never played the story
const town = await startServer({ port: 0, quiet: true });
await open({ ...PHONE, query: `?test&net=ws://localhost:${town.port}` });
await g(() => __game.resume());
await page.tap('#together');
await until(() => g(() => !document.getElementById('join').hidden));
await page.tap('#joinName'); await page.keyboard.type('Dee');
await page.tap('#joinGo');
check('a newcomer comes into town', !!(await until(() => g(() => __game.S.mode === 'town' && !!window.__net?.you().id), 10000)), null);
const helpers = () => g(() => {
  const G = window.G = __game, L = __net.link, keep = L.keep;
  // what goes to the town of what they have, as it went
  window.kept = []; L.keep = (s) => { kept.push(JSON.parse(JSON.stringify(s))); return keep.call(L, s); };
  window.near = () => { const n = G.npcs.bobby; G.place(n.x + G.talk.AWAY + 5, n.z); G.place(n.x + 1.5, n.z); };
  window.seen = () => { const d = G.state().dialog; return d && !d.waiting ? { ...d, opts: d.opts.map((o) => o.replace(/^\d\. /, '')) } : null; };
});
await helpers();
const trustWas = await g(() => G.people.get('bobby', 'trust')), shelfWas = await g(() => localStorage.getItem('chunky.pantry.v1'));
const talkOnline = async () => { await g(() => near()); await sleep(300); await page.tap('#bA'); return until(() => g(() => seen()), 4000); };
const tapOnline = async (text) => { await page.locator('#dOpts button', { hasText: text }).first().tap(); await sleep(100); };

d = await talkOnline();
check(`online, with her written line, "${SWEEP}" is one of the choices: "${d?.say}" ${d?.opts.join(' | ')}`, d?.say === TALK.online.lines.bobby.first && d.opts.join(' | ') === `${SWEEP} | Later.`, d);
await snap('3-online-written');
await tapOnline('Later.');
await g((url) => G.talk.on(url), TALK_AT);
page.script.push(line('Dee. That\'s a good church name, sugar.', ['Thank you.', 'It was my aunt\'s.', 'Is it?']), line('Look at that. Not a speck on them, Dee.', ['Glad to help.', 'Anytime.', 'Night, Miss Bobby.']));
d = await talkOnline();
let asked = lastAsk();
check(`and in her own words: ${d?.opts.join(' | ')}`, d?.say.startsWith('Dee.') && d.opts[0] === SWEEP && d.opts.at(-1) === 'Later.' && d.opts.length === 4, d);
check('with her model told it\'s the one thing she can ask them for', asked.includes(CAN('them')) && !asked.includes(CANT('them')) && !asked.includes('What\'s happened'), asked.slice(asked.indexOf('Right now'), asked.indexOf('Right now') + 200));
await snap('4-online-own-words');
await page.locator('#dOpts button', { hasText: SWEEP }).first().tap();
r = { mode: await until(() => g(() => (G.S.mode === 'sweep' ? 'sweep' : null)), 2000) };
await holdA(3.8, true);
d = await until(() => g(() => seen()), 5000);
asked = lastAsk();
const mine = await g(() => ({ beans: G.S.beans, kept: G.church.pantry.kept(), today: G.church.today(), shelf: G.church.shown(), trust: G.talk.mind('bobby').trust ?? 0, story: G.people.get('bobby', 'trust'), saved: localStorage.getItem('chunky.pantry.v1') }));
check(`picking it sweeps, and pays them from their own pantry: ${mine.beans} beans, ${mine.shelf} on the shelf`, r.mode === 'sweep' && mine.beans === 3 && mine.kept.stock === 6 && mine.kept.swept === mine.today && mine.shelf === 6, mine);
check(`and she's warmer to them, by ${mine.trust}, with the story's pantry and how she feels about him in it as they were`, mine.trust === 2 && mine.story === trustWas && mine.saved === shelfWas, mine);
check(`then she's told they've swept her steps and there's nothing to ask, and it isn't there: ${d?.opts.join(' | ')}`, d?.say.startsWith('Look at that.') && !d.opts.includes(SWEEP) && asked.includes(CANT('them')) && asked.includes('What\'s happened: They swept Miss Bobby\'s steps today.'), { d, told: asked.slice(asked.indexOf('What\'s happened'), asked.indexOf('What\'s happened') + 200) });
const went = await until(() => g(() => kept.find((k) => k.pantry?.swept === G.church.today()) ?? null), 3000);
check(`and their pantry went to the town with their beans: ${JSON.stringify(went)}`, went?.beans === 3 && went.pantry.stock === 6 && Number.isInteger(went.pantry.day), went);
await tapOnline('Later.');
await g(() => G.talk.on(null));
d = await talkOnline();
check(`and talking to her again, nothing: "${d?.say}" ${d?.opts.join(' | ')}`, d?.say === TALK.online.lines.bobby.back && d.opts.join() === 'Later.', d);
await snap('5-online-swept');
await tapOnline('Later.');

// ---------------- and back into the town another time, which has kept their pantry for them as they left it
await page.reload();
await until(() => g(() => !!window.__game?.resume), 30000);
await g(() => __game.resume());
await page.tap('#together');
check('they come back into town as who they were, straight from Play', !!(await until(() => g(() => __game.S.mode === 'town' && window.__net?.you().name === 'Dee'), 10000)), null);
await helpers();
const back = await until(() => g(() => { const k = G.church.pantry.kept(); return k.swept === G.church.today() ? { kept: k, beans: G.S.beans, shelf: G.church.shown() } : null; }), 4000);
check(`and the town's given them their pantry back as they left it: ${JSON.stringify(back)}`, back?.kept.stock === 6 && back.kept.day === went.pantry.day && back.beans === 3 && back.shelf === 6, back);
d = await talkOnline();
// her coming-back line's been said to them already, so it's the first of her lines for any time
check(`so her steps are still swept today, and there's nothing to ask: "${d?.say}" ${d?.opts.join(' | ')}`, d?.say === TALK.online.lines.bobby.any[0] && d.opts.join() === 'Later.', d);
await tapOnline('Later.');
await shut(); await town.close();
process.exit(failed ? 1 : 0);
