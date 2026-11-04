// Wearing your own rektguy online (CHUNKY-170), in real Chrome against a town on this machine, with real taps and clicks, wallets made
// up for it and a stand-in for the chain, so nothing real is asked or signed. A town that doesn't say it can pair a wallet isn't asked
// and doesn't offer it. On a phone, the title card has Connect a wallet under Play, which shows four letters and the wallet apps that open the game's own page in their browser. That page, in the wallet app's
// browser, shows the same four letters, takes them off its address, and asks the wallet for its address and one signature, on words
// that say it costs nothing and moves nothing, and nothing else. Back on the phone, the looks have their two rektguys' pictures over
// the town's, neither worn yet, with nothing said; they pick one and come in wearing it, and someone else in town sees it by its handle
// and has its picture, which a canvas can read. Nobody's shown the wallet's address. Then backing out, and a wallet with none, each
// end at the looks with nothing said; whoever's wearing rektguy 1386 comes in as the hero, in the hero's own look; and a laptop whose
// browser has a wallet of its own does it in a tab beside the game, with one signature. Fails on anything out of place or a console error.
//
//   npm i && npm run wallet -- [--shots dir]
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { CDN, fromCache, serveAndOpen } from './browser.mjs';
import { chainStandIn } from './chain-stand-in.mjs';
import { startServer } from '../server/index.js';
import { createChain } from '../server/chain.js';

const args = process.argv.slice(2), shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
let failed = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' -- got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(50); } };
const snap = async (page, name) => { if (shots) { await mkdir(shots, { recursive: true }); await page.screenshot({ path: join(shots, name + '.png') }); } };
const on = (p, fn, arg) => p.page.evaluate(fn, arg);

// A picture all of one colour, as a PNG, for each of the rektguys here
function png([r, g, b], size = 16) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]), len = Buffer.alloc(4), crc = Buffer.alloc(4);
    len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const head = Buffer.alloc(13); head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(Buffer.concat(Array(size).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
const COLOUR = { 7: [236, 128, 58], 12: [111, 214, 200], 40: [227, 40, 92], 1386: [241, 230, 207] };
const someone = () => privateKeyToAccount(generatePrivateKey());
const W = { one: someone(), two: someone(), none: someone(), owner: someone() };
const standIn = chainStandIn({
  owners: { 7: W.one.address, 12: W.two.address, 40: W.two.address, 1386: W.owner.address }, base: 'ipfs://QmMeta/',
  ipfs: Object.fromEntries(Object.entries(COLOUR).flatMap(([id, rgb]) => [[`QmMeta/${id}`, JSON.stringify({ image: `ipfs://QmArt/${id}.png` })], [`QmArt/${id}.png`, png(rgb)]])),
});
const server = await startServer({ port: 0, quiet: true, chain: createChain({ rpc: ['http://chain.stand-in/'], gateway: 'http://chain.stand-in/ipfs/', fetch: standIn.fetch }) });
const query = `?test&net=ws://localhost:${server.port}`, base = `http://localhost:${server.port}`;
const opened = [];
// a phone, or with { touch: false } a laptop, on the title card
async function open({ touch = true } = {}) {
  const p = await serveAndOpen(touch ? { touch, query } : { viewport: { width: 1024, height: 700 }, query });
  p.touch = touch; opened.push(p);
  await on(p, () => __game.resume());
  await until(() => on(p, () => !!window.__net), 20000);
  return p;
}
const press = (p, sel) => (p.touch ? p.page.tap(sel) : p.page.click(sel));
// what's shown of pairing: the four letters, the wallet apps and where each goes, and whether the browser's own wallet is offered
const pairPanel = (p) => on(p, () => {
  const panel = document.getElementById('pair');
  return !!panel && !panel.hidden && { letters: document.getElementById('pairLetters').textContent, apps: [...panel.querySelectorAll('#pairApps a')].map((a) => [a.textContent, a.href]), here: !!document.getElementById('pairHere') };
});
// what's shown of the looks: their own rektguys, which is pressed and whether each picture's there, and what's said
const looks = (p) => on(p, () => {
  const j = document.getElementById('join');
  if (!j || j.hidden) return null;
  const yours = j.querySelector('.yours'), rekt = yours.hidden ? [] : [...yours.querySelectorAll('.rekt')];
  return {
    yours: rekt.length, pressed: rekt.map((b) => b.getAttribute('aria-pressed') === 'true'), loaded: rekt.every((b) => b.querySelector('img').complete && b.querySelector('img').naturalWidth > 0),
    town: [...j.querySelectorAll('.looks .look')].some((b) => b.getAttribute('aria-pressed') === 'true'), said: document.getElementById('joinSay').textContent,
  };
});
// Whether a wallet's address is anywhere in what a page shows or knows of the town
const shows = (p, account) => on(p, (address) => [document.body.innerText, JSON.stringify(window.__net?.wallet()), JSON.stringify(window.__net?.link?.others() ?? [])].some((t) => t?.toLowerCase().includes(address.toLowerCase())), account.address);
// What a wallet's asked, and the words it signs, as a wallet app's browser asks it through window.ethereum
async function wallet(asked, account, method, params) {
  asked.push(method);
  if (method === 'eth_requestAccounts') return [account.address];
  if (method === 'personal_sign') { asked.words = Buffer.from(params[0].slice(2), 'hex').toString('utf8'); return account.signMessage({ message: { raw: params[0] } }); }
  throw new Error(`${method} isn't asked of a wallet here`);
}
const holding = (context, asked, account) => Promise.all([
  context.exposeFunction('chunkyWallet', (method, params) => wallet(asked, account, method, params)),
  context.addInitScript(() => { window.ethereum = { request: ({ method, params }) => window.chunkyWallet(method, params ?? []) }; }),
]);
// The wallet's page, opened in the wallet app's own browser with `account` in it, which is a browser apart from the game's
async function walletApp(browser, account, url) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await context.route(CDN, fromCache);
  const app = { context, asked: [], errors: [] };
  await holding(context, app.asked, account);
  app.page = await context.newPage();
  app.page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) app.errors.push(m.text()); });
  app.page.on('pageerror', (e) => app.errors.push(e.message));
  await app.page.goto(url, { waitUntil: 'load' });
  return app;
}
// The wallet's page showing `letters`, signed, and what it said and was asked
async function signs(page, asked, letters, who, { tap = true } = {}) {
  const shown = await until(() => page.evaluate(() => { const c = document.getElementById('check'); return !!c && !c.hidden && { letters: document.getElementById('letters').textContent, address: location.href }; }));
  check(`${who}: the wallet's page shows the same four letters, "${shown?.letters}", and has taken the pairing off its address`, shown?.letters === letters && !/pair=|net=/.test(shown.address), shown);
  await (tap ? page.tap('#sign') : page.click('#sign'));
  const said = await until(() => page.evaluate(() => document.getElementById('said').textContent));
  check(`${who}: once it's signed it says "${said}"`, said === 'Done. Go back to Chunky.', said);
  check(`${who}: and the wallet was asked for its address and one signature, and nothing else`, JSON.stringify(asked) === '["eth_requestAccounts","personal_sign"]', asked);
  const words = asked.words?.split('\n')[3] ?? '';
  check(`${who}: on words with the four letters that say what it is: "${words}"`, words.includes(`showing ${letters},`) && words.endsWith('It\'s only a signature: it costs nothing and moves nothing.'), asked.words);
}
const pageIn = (pairing) => new URL(pairing.apps.find(([name]) => name === 'Trust Wallet')[1]).searchParams.get('url');

let without = null;
try {
  // ---------------- a town that doesn't say it can pair a wallet, as the one on Cloudflare before it could, isn't asked and doesn't
  // offer it, so the game can go up before the town that pairs
  without = await startServer({ port: 0, quiet: true });
  const old = await serveAndOpen({ touch: true, query: `?test&net=ws://localhost:${without.port}` });
  old.touch = true; opened.push(old);
  let asks = 0;
  await old.page.route(`http://localhost:${without.port}/wallet/**`, (r) => { asks++; return r.fulfill({ status: 404, body: 'Chunky, Mississippi.' }); });
  await old.page.reload({ waitUntil: 'load' });
  await old.page.waitForFunction(() => window.__game?.resume); await on(old, () => __game.resume());
  await until(() => on(old, () => !!window.__net), 20000); await on(old, () => __net.here());
  const offered = await on(old, () => ({ wallet: !document.getElementById('connectWallet')?.hidden, here: document.getElementById('here')?.textContent }));
  check(`a town that doesn't say it can pair a wallet isn't asked, ${asks} times, and its title card, "${offered.here}", doesn't offer it`, asks === 0 && !offered.wallet && offered.here === 'Nobody in town right now', offered);

  // ---------------- on a phone: Connect a wallet under Play, four letters, and the wallet apps
  const a = await open();
  await on(a, () => __net.here());
  const card = await on(a, () => { const play = document.getElementById('together'), w = document.getElementById('connectWallet'); return { play: play?.textContent, wallet: w && !w.hidden ? w.textContent : null, under: !!w && play?.compareDocumentPosition(w) === Node.DOCUMENT_POSITION_FOLLOWING && w.previousElementSibling?.id === 'here' }; });
  check(`the title card has "${card.wallet}" under "${card.play}" and how many are in town`, card.play === 'Play' && card.wallet === 'Connect a wallet' && card.under, card);
  await snap(a.page, '00-title-card');
  await press(a, '#connectWallet');
  const pairing = await until(() => pairPanel(a)), page = pairing && pageIn(pairing);
  check(`Connect a wallet shows four letters, "${pairing?.letters}", and ${pairing?.apps.map(([n]) => n).join(', ')}, each opening the game's own page`,
    /^[A-Z]{4}$/.test(pairing?.letters) && JSON.stringify(pairing.apps.map(([n]) => n)) === '["MetaMask","Coinbase Wallet","Trust Wallet","Phantom"]'
      && new URL(page).pathname === '/wallet.html' && pairing.apps.every(([, href]) => href.includes(encodeURIComponent(page)) || href.includes(page.replace(/^https?:\/\//, ''))), pairing);
  check('and not the browser\'s own wallet, since a phone\'s browser hasn\'t one', !pairing?.here, pairing);
  await snap(a.page, '01-pairing');

  // ---------------- the wallet app's browser: the same four letters, and one signature
  const browser = a.page.context().browser();
  const app = await walletApp(browser, W.two, page);
  await snap(app.page, '02-wallet-page');
  await signs(app.page, app.asked, pairing.letters, 'two rektguys');
  await snap(app.page, '03-wallet-done');

  // ---------------- back on the phone: their two over the town's looks, neither worn yet, and nothing said
  const mine = await until(async () => { const l = await looks(a); return l?.yours && l.loaded && l; }, 12000);
  check(`the phone goes to the looks with their ${mine?.yours} rektguys' pictures over the town's, neither worn yet, with nothing said`, mine?.yours === 2 && mine.loaded && mine.pressed.every((p) => !p) && mine.said === '', mine);
  await a.page.tap('#joinName'); await a.page.keyboard.type('Pickles');
  await a.page.tap('#join .yours .rekt:nth-child(2)');
  const picked = await looks(a);
  check('they pick the second, and none of the town\'s looks is picked with it', JSON.stringify(picked?.pressed) === '[false,true]' && !picked.town, picked);
  await snap(a.page, '04-their-rektguys');
  await press(a, '#joinGo');
  const you = await until(() => on(a, () => __game.S.mode === 'town' && __net.link?.id && __net.you()), 15000), worn = await on(a, () => __net.wallet());
  check(`and come into town wearing it, by its handle alone`, !!you?.rekt && you.rekt === worn.rekt[1] && worn.wearing === worn.rekt[1] && !you.hero, { you, worn });
  check('and the phone\'s never been shown the wallet\'s address', !(await shows(a, W.two)), null);

  // ---------------- someone else in town sees it by its handle, and has its picture, which a canvas can read
  const b = await open({ touch: false });
  await b.page.click('#together');
  await until(() => on(b, () => !document.getElementById('join').hidden));
  await b.page.click('#joinName'); await b.page.keyboard.type('Dee');
  await b.page.click('#joinGo');
  const seen = await until(() => on(b, () => __net.link?.others().find((o) => o.name === 'Pickles')?.rekt), 15000);
  check('someone else in town sees what Pickles is wearing, by its handle', !!seen && seen === you?.rekt, seen);
  const colour = await on(b, async (url) => {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 4, 4);
    return [...g.getImageData(1, 1, 1, 1).data.slice(0, 3)];
  }, `${base}/rektguy/${seen}`);
  check(`and has its picture by it, which a canvas can read: rgb(${colour})`, JSON.stringify(colour) === JSON.stringify(COLOUR[40]), colour);
  check('and isn\'t shown the wallet\'s address either', !(await shows(b, W.two)), null);
  await app.context.close();

  // ---------------- backing out, and a wallet with none, each end at the looks with nothing said
  const c = await open();
  await press(c, '#connectWallet'); await until(() => pairPanel(c));
  await press(c, '#pairBack');
  const backed = await until(() => looks(c));
  check('backing out ends at the looks, with none of theirs and nothing said', backed?.yours === 0 && backed.said === '', backed);
  await press(c, '#joinBack');
  await until(() => on(c, () => !document.getElementById('title').hidden));
  await press(c, '#connectWallet');
  const empty = await until(() => pairPanel(c)), none = await walletApp(browser, W.none, pageIn(empty));
  await signs(none.page, none.asked, empty.letters, 'a wallet with none');
  const after = await until(async () => !(await pairPanel(c)) && looks(c), 12000);
  check('and a wallet with none ends at the looks too, with none of theirs and nothing said', after?.yours === 0 && after.said === '', after);
  await none.context.close();

  // ---------------- the owner's own: worn straight away, and the hero
  const o = await open();
  await press(o, '#connectWallet');
  const ownersPairing = await until(() => pairPanel(o)), owners = await walletApp(browser, W.owner, pageIn(ownersPairing));
  await signs(owners.page, owners.asked, ownersPairing.letters, 'the owner\'s own');
  const one = await until(async () => { const l = await looks(o); return l?.yours && l; }, 12000);
  check('one rektguy is worn straight away', JSON.stringify(one?.pressed) === '[true]', one);
  await o.page.tap('#joinName'); await o.page.keyboard.type('Moss');
  await press(o, '#joinGo');
  const hero = await until(() => on(o, () => __game.S.mode === 'town' && __net.link?.id && __net.you()), 15000);
  check('whoever\'s wearing rektguy 1386 comes in as the hero, in the hero\'s own look', hero?.hero === true && hero.rekt === null, hero);
  const heroSeen = await until(() => on(b, () => __net.link.others().find((w) => w.hero)), 8000);
  check('and everyone else sees the hero, with no handle', heroSeen?.name === 'Moss' && !heroSeen.rekt, heroSeen);
  await owners.context.close();

  // ---------------- a laptop with a wallet in its browser: a tab beside the game, one signature
  const l = await open({ touch: false }), asked = [];
  await holding(l.page.context(), asked, W.one);
  await l.page.reload({ waitUntil: 'load' });
  await l.page.waitForFunction(() => window.__game?.resume);
  await on(l, () => __game.resume());
  await until(() => on(l, () => !!window.__net), 20000);
  await l.page.click('#connectWallet');
  const lp = await until(() => pairPanel(l));
  check('a laptop whose browser has a wallet of its own is offered it', lp?.here === true, lp);
  await snap(l.page, '05-laptop-pairing');
  const [tab] = await Promise.all([l.page.context().waitForEvent('page'), l.page.click('#pairHere')]);
  await tab.waitForLoadState('load');
  await signs(tab, asked, lp.letters, 'the laptop', { tap: false });
  const laptops = await until(async () => { const v = await looks(l); return v?.yours && v; }, 12000);
  check('and the game\'s looks have their one, worn, in the tab it was left in', JSON.stringify(laptops?.pressed) === '[true]', laptops);

  for (const [name, p] of [['the town that can\'t pair', old], ['the phone', a], ['the other', b], ['backing out', c], ['the owner\'s', o], ['the laptop', l]]) check(`no console errors on ${name}: ${p.errors.join(' / ') || 'none'}`, !p.errors.length, p.errors);
  for (const [name, w] of [['the wallet app\'s page', app], ['the one with none', none], ['the owner\'s', owners]]) check(`no console errors on ${name}: ${w.errors.join(' / ') || 'none'}`, !w.errors.length, w.errors);
} catch (e) {
  check(`it played through: ${e.message}`, false, e.stack);
} finally {
  for (const p of opened) await p.close();
  await server.close(); await without?.close();
}
console.log(failed ? `\n${failed} failed` : '\nwearing your own rektguy: all good');
process.exit(failed ? 1 : 0);
