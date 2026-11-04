// Talks to Coop and Miss Bobby with their own words on, on a phone-sized page with real taps and on a laptop with real key presses, against
// stand-ins for the talk server: the Platform Engineer's canned one in server/index.js, which answers by the real server's own rules and spends
// nothing, and one this plays itself, a line at a time. With nowhere to ask, and with the month's money spent, everything they say and every
// button is just what it was. With their own words on, what they'd say to him walking up is asked as he comes near, and a line that's new
// shows with his answers and Later., while one that's been said, one that's 60 words, one with an address in it and one that takes too long
// are their written lines instead, and what a line does besides how they feel about him is thrown away. What they've said and what they
// remember goes with what's asked next, and it's still there after a reload. On a laptop he types to them, and what he types that sounds like
// he's really not okay brings up the 988 Lifeline without anything being asked, and so does the model saying so.
//
//   npm i && npm run talk [-- --shots dir]
import { mkdirSync } from 'node:fs';
import { serveAndOpen } from './browser.mjs';
import { startServer } from '../server/index.js';

const at = process.argv.indexOf('--shots'), shots = at > 0 ? process.argv[at + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const PHONE = { touch: true, viewport: { width: 390, height: 844 } }, LAPTOP = { viewport: { width: 1280, height: 800 } };

const setUp = () => {
  const G = __game; G.pause(); G.jump('town'); G.S.flags.town = true; G.S.flags.arrived = true; G.step(.1);
  document.getElementById('card').style.display = 'none';
  window.G = G;
  // every ask of a talk server, as it went
  window.asked = [];
  const f = window.fetch;
  window.fetch = (u, o) => { if (/\/talk$/.test(String(u))) asked.push(JSON.parse(o.body)); return f(u, o); };
  // from well away, up in front of them, and a moment for whatever's asked as he comes near
  const FROM = { coop: [0, -1.5], rocky: [.5, -1.5], bobby: [1.5, 0] };
  window.near = (who) => { const n = G.npcs[who], [dx, dz] = FROM[who]; G.place(n.x + G.talk.AWAY + 5, n.z); G.step(.05); G.place(n.x + dx, n.z + dz); G.step(.1); };
  window.seen = () => { const d = G.state().dialog; return d && { ...d, opts: d.opts.map((o) => o.replace(/^\d\. /, '')) }; };
  // until everything asked has come back and been shown
  window.settle = async () => { await G.talk.settled(); await new Promise((r) => setTimeout(r, 0)); G.step(.02); };
};
let page, errors, close, g;
async function open(how) {
  ({ page, errors, close } = await serveAndOpen(how));
  g = (fn, arg) => page.evaluate(fn, arg);
  await g(setUp);
}
// what's on the console is checked for each page, but for asking a server that isn't there, which a phone with no signal does too
async function shut() { const noise = errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e)); check('no console errors', !noise.length, noise); await close(); }
const snap = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 82 }); };
// talking to them and answering, with a real tap on a phone or a real key on a laptop
const talkTap = async (who) => { if (who) await g((w) => near(w), who); await page.tap('#bA'); await g(() => G.step(.05)); await g(() => settle()); return g(() => seen()); };
const tapOpt = async (text) => { await page.locator('#dOpts button', { hasText: text }).first().tap(); await g(() => G.step(.05)); await g(() => settle()); return g(() => seen()); };
const talkKey = async (who) => { await g((w) => near(w), who); await page.keyboard.down('e'); await g(() => G.step(.05)); await page.keyboard.up('e'); await g(() => settle()); return g(() => seen()); };
const pressOpt = async (text) => { const i = (await g(() => seen())).opts.indexOf(text); await page.keyboard.press(String(i + 1)); await g(() => G.step(.05)); await g(() => settle()); return g(() => seen()); };
const typeTo = async (text) => { await page.keyboard.type(text, { delay: 5 }); const typed = await page.inputValue('#dTyped'); await page.keyboard.press('Enter'); await g(() => settle()); return { typed, ...(await g(() => seen())) }; };

// The same visits, whatever's on: Coop three times, what he says about who runs Chunky and back, and Miss Bobby twice, by real taps
async function rounds() {
  const out = [];
  for (let i = 0; i < 3; i++) { out.push(await talkTap('coop')); if (i < 2) await tapOpt('Later.'); }
  out.push(await tapOpt('Who runs Chunky now?')); out.push(await tapOpt('Back')); await tapOpt('Later.');
  for (let i = 0; i < 2; i++) { out.push(await talkTap('bobby')); await tapOpt('Later.'); }
  return out;
}

// ---- nowhere to ask, which is what a test, the work link and every other page that isn't the game's own get: just as it was
await open(PHONE);
const before = await rounds();
let r = await g(() => ({ asked: asked.length, on: G.talk.ready() }));
check('with nowhere to ask, nothing is asked', r.asked === 0 && !r.on, r);
check('Coop meets him, then asks what he needs, and the rest is written', before[0].say.startsWith('Look what the river spat out') && before[1].say === 'What you need, river boy?' && before[2].say === 'What you need, river boy?', before.slice(0, 3).map((d) => d.say));
check('and every button is the written one, with nothing to type in on a phone', before.every((d) => !d.typing && !d.waiting && !d.care) && before[1].opts.join('|') === 'I need beans.|Who runs Chunky now?|Nice chain.|Later.', before[1]);
await shut();

// ---- the canned server, by its own rules, with the month's money spent: the one ask, then their written lines, button for button
let town = await startServer({ port: 0, quiet: true, talk: { quiet: 'cap' } });
await open(PHONE);
await g((url) => G.talk.on(url), `http://localhost:${town.port}/talk`);
const spent = await rounds();
r = await g(() => ({ asked: asked.length, ready: G.talk.ready() }));
check('with the month spent, the one ask is all there is, and then they rest', r.asked === 1 && !r.ready, r);
check('and everything they say and every button is just as it is with nothing to ask', JSON.stringify(spent) === JSON.stringify(before), { spent: spent.map((d) => d.say), before: before.map((d) => d.say) });
// and with nothing listening at all
await g(() => G.talk.on('http://localhost:65531/talk'));
r = await talkTap('coop');
check('with the server not there at all, he gets the written line', r.say === 'What you need, river boy?' && !(await g(() => G.talk.ready())), r);
await tapOpt('Later.');
await shut(); await town.close();

// ---- the canned server answering, on a phone with real taps
const LINE = { say: 'Evening, sugar. Pantry runs light this late, but the Lord provides.', mood: 'warm', do: [], remember: 'He came by after dark.', replies: ['Anything I can do?', "How's the van running?", 'Who changes the signs?'] };
town = await startServer({ port: 0, quiet: true, talk: { line: JSON.stringify(LINE) } });
await open(PHONE);
await g((url) => G.talk.on(url), `http://localhost:${town.port}/talk`);
r = await talkTap('bobby');
check('the first time, Miss Bobby says her written line', r.say.startsWith("Baby, you look like you've been through it"), r);
await tapOpt('Later.');
r = await g(() => { near('bobby'); return G.talk.early(); });
check('coming near her again, what she\'d say is asked before he says anything', r.includes('bobby'), r);
r = await talkTap();
const routes = r.opts.filter((o) => o === 'Can I get some beans?').length;
check('then she says something new, with the written answers that lead somewhere, her own up to three, and Later.', r.say === LINE.say && r.opts.at(-1) === 'Later.' && r.opts.length === 4 && r.opts.slice(routes, 3).every((o, i) => o === LINE.replies[i]), r);
check('and on a phone there\'s nothing to type in', !r.typing, r);
await snap('1-miss-bobby-new-words');
r = await tapOpt('Anything I can do?');
check('his answer, tapped, is what she\'s answering, and a line she\'s said already comes back as one she says any time', r.heard === 'Anything I can do?' && r.say.startsWith('You learn their name') && r.opts.at(-1) === 'Later.', r);
await snap('2-miss-bobby-any-time');
await tapOpt('Later.');
r = await talkTap('bobby');
check('and the third time it\'s her written line, since the new one\'s been said', r.say.startsWith("Baby, you look like you've been through it"), r);
await tapOpt('Later.');
r = await g(() => ({ mind: G.talk.mind('bobby'), asked: asked.map((a) => a.messages[0].content) }));
check('what she said and what she\'s keeping about him are remembered', r.mind.said.includes(LINE.say) && r.mind.notes.some((n) => n.text === LINE.remember) && r.mind.visits === 3, r.mind);
check('and go with what was asked the third time', r.asked.length === 3 && r.asked[2].includes(`- ${LINE.say}`) && r.asked[2].includes(`- ${LINE.remember}`) && r.asked[2].includes('been by to talk to you 2 times before'), r.asked.map((a) => a.slice(a.indexOf('He has'), a.indexOf('Answer with'))));
// the story's lines are always written: Coop paying, even when it's been said before
r = await g(() => { G.talk.said('coop', 'Rocky says you didn\'t peek. Respect. Three cans, like I said.'); G.S.flags.metCoop = true; G.S.flags.delivered = true; G.S.beans = 0; return asked.length; });
const paid = await talkTap('coop');
check('Coop paying him is the written line, with the beans, and nothing asked', paid.say === "Rocky says you didn't peek. Respect. Three cans, like I said." && (await g(() => G.S.beans)) === 3 && (await g(() => asked.length)) === r, paid);
await tapOpt('Pleasure doing business.');
// and the 988 Lifeline's panel on a phone, which a phone can only get to from what the model sends, so it's put up here the way the form would
await g(() => { G.S.flags.delivered = false; G.S.flags.paid = false; });
await talkTap('rocky'); await tapOpt('Later.');
r = await talkTap('rocky');
await g(() => G.talk.type('I want to kill myself'));
r = await g(() => ({ ...seen(), links: [...document.querySelectorAll('#dCare a')].filter((a) => !a.hidden).map((a) => [a.textContent, a.getAttribute('href')]), box: document.querySelector('#dialog .box').getBoundingClientRect().toJSON() }));
check('on a phone, the Lifeline can be called or texted from where it shows, or chatted with', r.care && r.links.length === 3 && r.links[0][1] === 'tel:988' && r.links[1][1] === 'sms:988' && r.box.top >= 0 && r.box.right <= 390, r);
await snap('3-the-lifeline-on-a-phone');
await shut(); await town.close();

// ---- on a laptop, with real key presses, against a server this plays a line at a time
await open(LAPTOP);
const script = [], heard = [];
const routeTalk = async () => page.route('http://localhost:65532/talk', async (route) => {
  heard.push(JSON.parse(route.request().postData()));
  const next = script.shift() ?? { quiet: 'off' };
  if (next === 'hang') return;
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(typeof next === 'string' ? { reply: next, model: 'scripted', cost: 0, ms: 1 } : next) });
});
await routeTalk();
await g(() => G.talk.on('http://localhost:65532/talk'));
r = await talkKey('coop'); await pressOpt('Later.');
r = await talkKey('coop');
check('on a laptop too, Coop meets him and asks what he needs in his own words first, with nothing asked', r.say === 'What you need, river boy?' && heard.length === 0 && !r.typing, { r, heard: heard.length });
await pressOpt('Later.');
script.push(JSON.stringify({ say: "Evening, river boy. Pumps are dry, dominoes ain't.", mood: 'amused', do: [{ meter: 'trust', by: 1 }], remember: 'Keeps coming round after dark.', replies: ['Deal me in.', 'Maybe later.', 'What are the stakes?'] }));
r = await talkKey('coop');
let trust = await g(() => G.people.get('coop', 'trust'));
check('the third time he says something new, and his own three answers keep the written ones, so there\'s no room for the new ones', r.say === "Evening, river boy. Pumps are dry, dominoes ain't." && r.opts.join('|') === 'I need beans.|Who runs Chunky now?|Nice chain.|Later.', r);
check('he can type to him on a laptop, and liking him more counts', r.typing && trust === 1, { typing: r.typing, trust });
script.push(JSON.stringify({ say: 'Slow as molasses. Folks pay in beans or they don\'t pay.', mood: 'plain', do: [{ meter: 'trust', by: 1 }], remember: '', replies: ['Sounds about right.', 'Later, then.', 'What sells best?'] }));
r = await typeTo("How's business tonight?");
trust = await g(() => G.people.get('coop', 'trust'));
check('a key that isn\'t an answer\'s number starts him typing, and Enter says it', r.typed === "How's business tonight?" && r.heard === "How's business tonight?" && r.say.startsWith('Slow as molasses'), r);
check('what he typed went with the ask, and his feelings only move a point a visit', heard.at(-1).messages.at(-1).content === 'He says: "How\'s business tonight?"' && trust === 1, { last: heard.at(-1).messages.at(-1), trust });
await snap('4-typing-to-coop');
const asks = heard.length;
r = await typeTo("honestly i'm not okay");
check('typing that he\'s really not okay brings up the 988 Lifeline, with nothing sent to anyone', r.care && heard.length === asks && r.say.startsWith("Hey. I'm stepping out of the game") && r.opts.join('|') === 'Back to the game' && !r.typing, { r, asked: heard.length - asks });
r = await g(() => [...document.querySelectorAll('#dCare a')].filter((a) => !a.hidden).map((a) => a.getAttribute('href')));
check('and on a laptop it\'s the chat, with the number written out', r.length === 1 && r[0] === 'https://988lifeline.org/chat' && /988/.test(await page.textContent('#dCareHow')), r);
await snap('5-the-lifeline-on-a-laptop');
await pressOpt('Back to the game');
check('and back to the game is back to the game', (await g(() => G.state().mode)) === 'town', null);
// lines that don't pass are their written ones, and what a line does that it shouldn't is thrown away
script.push(JSON.stringify({ say: Array.from({ length: 60 }, (_, i) => `word${i}`).join(' '), replies: [] }));
r = await talkKey('coop');
check('sixty words is his written line instead', r.say === 'What you need, river boy?', r);
await pressOpt('Later.');
script.push(JSON.stringify({ say: 'Come by 412 Church St and holler, river boy.', replies: [] }));
r = await talkKey('coop');
check('and so is an address', r.say === 'What you need, river boy?', r);
await pressOpt('Later.');
script.push(JSON.stringify({ say: 'Pumps are still dry, river boy, same as yesterday.', do: [{ set: 'paid' }, { beans: 5 }, { item: 'bag', by: 1 }, { meter: 'bobby.trust', by: 1 }], replies: [] }));
r = await talkKey('coop');
const state = await g(() => ({ beans: G.S.beans, paid: !!G.S.flags.paid, bag: G.S.items.bag ?? 0, bobby: G.people.get('bobby', 'trust') }));
check('a line that does something it can\'t is said, and what it does is thrown away', r.say === 'Pumps are still dry, river boy, same as yesterday.' && state.beans === 0 && !state.paid && !state.bag && state.bobby === -0.5, state);
script.push('{"care": true}');
r = await typeTo("what's even the point of any of it");
check('and the Lifeline comes up when the model hears what the game didn\'t', r.care && heard.at(-1).messages.at(-1).content.includes('point of any of it'), r);
await pressOpt('Back to the game');
script.push('hang');
const t0 = Date.now();
r = await talkKey('coop');
check(`a line that takes too long is his written one, ${((Date.now() - t0) / 1000).toFixed(1)} s on`, r.say === 'What you need, river boy?' && Date.now() - t0 < 5000 && !(await g(() => G.talk.ready())), r);
await pressOpt('Later.');
// and after a reload, everything he's kept
await page.reload({ waitUntil: 'load' }); await g(() => new Promise((ok) => { const t = setInterval(() => { if (window.__game) { clearInterval(t); ok(); } }, 50); }));
await g(setUp);
await g(() => G.talk.on('http://localhost:65532/talk'));
script.push(JSON.stringify({ say: 'Back again, river boy. Moon looks like a dime.', replies: [] }));
r = await talkKey('coop');
const sent = heard.at(-1)?.messages[0].content ?? '';
check('after a reload he still remembers, and it goes with what\'s asked', r.say === 'Back again, river boy. Moon looks like a dime.' && sent.includes('- Keeps coming round after dark.') && sent.includes('- Slow as molasses') && /been by to talk to you \d+ times before/.test(sent), sent.slice(-1200));
await pressOpt('Later.');
await shut();
process.exit(failed ? 1 : 0);
