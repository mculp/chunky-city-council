// The town on a socket, for the tests and for playing on this machine or on a phone on the same network. It's `ws` in front of
// server/host.js, which is server/town.js behind any socket, and the host for everyone puts the same in front of Cloudflare's.
//
//   node server/index.js [port] [--talk]
//
// CHUNKY_HERO is the sha256, in hex, of the secret in the hero's link, so that only a phone with that link is him. CHUNKY_SAVE is
// where the town's kept between runs, data/raw/town.json if it isn't said. --talk answers the characters' words at /talk as well.
// Wearing your own rektguy asks Ethereum's public nodes, or ETH_RPC_URL's, and Alchemy's NFT API with ALCHEMY_KEY for what a wallet
// holds and for the pictures, or without it IPFS_GATEWAY's for the pictures (server/chain.js).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { createTown } from './town.js';
import { createHost, MOST } from './host.js';
import { createTalk } from './talk.js';
import { createMemoryStore, createWalletRoutes, walletKey } from './wallet.js';
import { createChain } from './chain.js';
import { NET_PORT, NET_RATE } from '../src/net.js';
import { createAside } from '../src/aside.js';

// the farm's own outlines, for where nothing's kept broken (src/aside.js)
const farm = JSON.parse(readFileSync(new URL('../data/farm.json', import.meta.url), 'utf8'));

// The characters' words, for trying the game's side of them without spending anything: the talk server's own rules, from server/talk.js,
// with a stand-in for the model that says `line` every time, and only for pages on this machine. `quiet` has it answer the way it
// does when the model can't: cap, off, fast or slow.
const LINE = '{"say":"Well, look who it is."}';
const onThisMachine = (o) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(o);
function cannedTalk({ line = LINE, quiet = null } = {}) {
  const model = async (url, { signal }) => quiet === 'slow'
    ? new Promise((_, no) => signal.addEventListener('abort', () => no(signal.reason)))
    : new Response(JSON.stringify({ choices: [{ message: { content: line } }], usage: { cost: 0 } }), { status: quiet === 'off' ? 500 : 200 });
  return createTalk({
    fetch: model, key: 'canned', cap: quiet === 'cap' ? 0 : 5, origins: onThisMachine,
    phoneLimit: async () => quiet !== 'fast', placeLimit: async () => true,
    bill: { spent: async () => 0, add: async (month, cost) => cost }, log: () => {},
  });
}

// `chain` is what's asked whose signature it is and what a wallet holds (server/chain.js), and with none, a wallet can't be checked
// `wall` is the time of day as the town has it, for what's broken, which a test can move on to tomorrow
export async function startServer({ port = NET_PORT, rate = NET_RATE, max, keeps, silence = 5000, helloWithin = 5000, save = null, saveEvery = 5000, heroHash = '', talk = false, chain = null, quiet = false, wall = () => Date.now() } = {}) {
  // what the cast remember of everyone, by the hash of their key: in the same file as the town here, beside what it keeps itself,
  // as the town for everyone keeps them each on their own
  let minds = {}, kept = null;
  const town = createTown({ max, keeps, wall, aside: createAside(farm) });
  const words = talk ? cannedTalk(talk === true ? {} : talk) : null;

  // A town that's been kept is taken back out. One that can't be read is left as it is for someone to look at, not written over.
  if (save) {
    mkdirSync(dirname(save), { recursive: true });
    if (existsSync(save)) {
      try { kept = JSON.parse(readFileSync(save, 'utf8')); town.load(kept); town.loadWrecks(kept?.wrecks); if (kept?.minds && typeof kept.minds === 'object') minds = kept.minds; }
      catch (e) { throw new Error(`The town kept in ${save} can't be read, so it's been left as it is: ${e.message}`); }
    }
  }
  // What's kept of each wallet, beside the town, as the town for everyone keeps it in its own storage. A pairing's only for now.
  const forNow = ([k]) => k.startsWith('pair:'), wallets = createMemoryStore((Array.isArray(kept?.wallets) ? kept.wallets : []).filter((e) => Array.isArray(e) && typeof e[0] === 'string' && !forNow(e)));
  const wallet = createWalletRoutes({ store: wallets, chain, pages: onThisMachine });
  const host = createHost({ town, heroHash, silence, helloWithin, mindsOf: async (k) => (Object.hasOwn(minds, k) ? minds[k] : null), rektOf: (k) => wallet.wearing(k) });
  // written beside it and moved over it, so it's never half kept
  let unsaved = false, walletsKept = JSON.stringify(wallets.entries().filter((e) => !forNow(e)));
  function store() {
    if (!save) return;
    const changed = town.keepMinds(), gone = town.forgotten();
    for (const [k, m] of changed) minds[k] = m;
    for (const k of gone) delete minds[k];
    wallets.delete(gone.map(walletKey));
    const walletsNow = wallets.entries().filter((e) => !forNow(e)), walletsSaid = JSON.stringify(walletsNow);
    if (!(town.dirty || town.wrecksDirty || unsaved || changed.length || walletsSaid !== walletsKept)) return;
    try { writeFileSync(`${save}.tmp`, JSON.stringify({ ...town.dump(), wrecks: town.dumpWrecks(), minds, wallets: walletsNow })); renameSync(`${save}.tmp`, save); unsaved = false; walletsKept = walletsSaid; }
    catch (e) { unsaved = true; console.error(`Couldn't keep the town in ${save}: ${e.message}`); }
  }

  // The town's a WebSocket. Anything else asked of it is how many are in town, for the title card, which any page can ask as any
  // page can join; the wallet's side of it, and the pictures, for pages on this machine; /talk when it's answering that; or nothing.
  const asked = (req) => new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers, body: req.method === 'POST' ? Readable.toWeb(req) : undefined, duplex: 'half' });
  const answer = async (res, a) => { res.writeHead(a.status, Object.fromEntries(a.headers)); res.end(Buffer.from(await a.arrayBuffer())); };
  const http = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://here');
    try {
      if (pathname === '/here') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ here: host.here, ...(chain && { wallets: true }) })); return; }
      if (pathname.startsWith('/wallet/') || pathname.startsWith('/rektguy/')) { await answer(res, await wallet(asked(req))); return; }
      if (!words || pathname !== '/talk') { res.writeHead(426, { 'Content-Type': 'text/plain' }); res.end('This is the town, over a WebSocket.'); return; }
      await answer(res, await words(asked(req)));
    } catch (e) { if (!res.headersSent) res.writeHead(500); res.end(); console.error(`${pathname} went wrong: ${e.message}`); }
  });
  const wss = new WebSocketServer({ server: http, maxPayload: MOST });
  await new Promise((ok, no) => { http.once('error', no); http.listen(port, ok); });
  wss.on('connection', (ws, req) => {
    const s = { ws, tcp: req.socket, send: (d) => ws.send(d), close: () => ws.close(), kill: () => ws.terminate(), get open() { return ws.readyState === WebSocket.OPEN; }, get buffered() { return ws.bufferedAmount; } };
    host.opened(s);
    ws.on('error', () => ws.terminate());
    ws.on('message', (data, isBinary) => host.heard(s, isBinary ? data : data.toString()));
    ws.on('close', () => host.closed(s));
  });

  // twenty beats a second, each due a twentieth after the last was, so they don't drift
  const every = 1000 / rate;
  let due = performance.now() + every, timer = null;
  function beat() {
    host.beat();
    const now = performance.now();
    due = Math.max(due + every, now);
    timer = setTimeout(beat, due - now);
  }
  timer = setTimeout(beat, every);
  const saver = save ? setInterval(store, saveEvery) : null;

  const actualPort = http.address().port;
  if (!quiet) console.log(`Chunky's open on ws://localhost:${actualPort}${words ? `, with the characters' words at http://localhost:${actualPort}/talk` : ''}. Serve the repo and open index.html?net on this machine, or on a phone on the same network.`);
  return {
    port: actualPort,
    stats: () => { const { ticks, joined, busy, sockets } = host.stats(); return { ticks, joined, busy, clients: sockets.map(([id, s]) => ({ id, bytesIn: s.tcp.bytesRead, bytesOut: s.tcp.bytesWritten })) }; },
    // Everyone's let go as if they'd left, so whatever they were driving stays where it was, and the town's kept once more.
    close: () => new Promise((done) => {
      clearTimeout(timer); clearInterval(saver);
      host.letGoAll();
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      http.close(() => { store(); done(); });
      http.closeAllConnections();
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const s = await startServer({
    port: +args.find((a) => /^\d+$/.test(a)) || NET_PORT,
    talk: args.includes('--talk'),
    heroHash: process.env.CHUNKY_HERO ?? '',
    chain: createChain({ rpc: process.env.ETH_RPC_URL ? process.env.ETH_RPC_URL.split(',').map((u) => u.trim()).filter(Boolean) : undefined, gateway: process.env.IPFS_GATEWAY ? process.env.IPFS_GATEWAY.split(',').map((u) => u.trim()).filter(Boolean) : undefined, alchemy: process.env.ALCHEMY_KEY || undefined }),
    save: process.env.CHUNKY_SAVE || join(fileURLToPath(new URL('..', import.meta.url)), 'data', 'raw', 'town.json'),
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => s.close().then(() => process.exit(0)));
}
