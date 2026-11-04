// The town on a socket, for the tests and for playing on this machine or on a phone on the same network. It's `ws` in front of
// server/town.js, and the host for everyone puts the same town behind a socket of its own.
//
//   node server/index.js [port]
//
// CHUNKY_HERO is the sha256, in hex, of the secret in the hero's link, so that only a phone with that link is him. CHUNKY_SAVE is
// where the town's kept between runs, data/raw/town.json if it isn't said.
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { createTown } from './town.js';
import { NET_PORT, NET_RATE, decodeMessage, say } from '../src/net.js';

const SLOW = 16384;              // bytes still waiting to go to a phone before it's skipped for a tick
const MOST = 2048;               // the most a phone can say at once: a hello, or what he's carrying, is well under it
const KEY = /^[\w-]{16,128}$/;   // who a phone is: made on the phone and kept there, and only its hash is ever kept here
const sha = (s) => createHash('sha256').update(s).digest();

export async function startServer({ port = NET_PORT, rate = NET_RATE, max, silence = 5000, helloWithin = 5000, save = null, saveEvery = 5000, heroHash = '', quiet = false } = {}) {
  const town = createTown({ max }), sockets = new Map();   // id → the socket of whoever's in town
  const hero = /^[0-9a-f]{64}$/i.test(heroHash) ? Buffer.from(heroHash, 'hex') : null;
  if (heroHash && !hero) console.warn('CHUNKY_HERO isn\'t a sha256 in hex, so nobody\'s the hero.');
  const isHero = (secret) => !!hero && typeof secret === 'string' && secret.length <= 256 && timingSafeEqual(sha(secret), hero);

  // A town that's been kept is taken back out. One that can't be read is left as it is for someone to look at, not written over.
  if (save) {
    mkdirSync(dirname(save), { recursive: true });
    if (existsSync(save)) {
      try { town.load(JSON.parse(readFileSync(save, 'utf8'))); }
      catch (e) { throw new Error(`The town kept in ${save} can't be read, so it's been left as it is: ${e.message}`); }
    }
  }
  // written beside it and moved over it, so it's never half kept
  let unsaved = false;
  function store() {
    if (!save || !(town.dirty || unsaved)) return;
    try { writeFileSync(`${save}.tmp`, JSON.stringify(town.dump())); renameSync(`${save}.tmp`, save); unsaved = false; }
    catch (e) { unsaved = true; console.error(`Couldn't keep the town in ${save}: ${e.message}`); }
  }

  const wss = new WebSocketServer({ port, maxPayload: MOST });
  await new Promise((ok, no) => { wss.once('listening', ok); wss.once('error', no); });
  let ticks = 0, joined = 0, busy = 0;

  // a phone the town's done with, so that nothing more goes to it and its closing doesn't count as leaving twice
  function letGo(id) { const ws = sockets.get(id); sockets.delete(id); if (ws) ws.id = 0; return ws; }
  // what the town said to tell, to whom, in the order it said it
  function deliver(out) {
    for (const { to, msg, close } of out) {
      const words = say(msg);
      if (to === 'all') { for (const ws of sockets.values()) if (ws.readyState === WebSocket.OPEN) ws.send(words); continue; }
      const ws = sockets.get(to);
      if (ws?.readyState === WebSocket.OPEN) ws.send(words);
      if (close) letGo(to)?.close();
    }
  }
  function hello(ws, m) {
    const r = town.join({ keyHash: typeof m.key === 'string' && KEY.test(m.key) ? sha(m.key).toString('hex') : '', name: m.name, look: m.look, hero: isHero(m.hero), build: m.build });
    if (!r.id) { deliver(r.out ?? []); ws.send(say(r.no)); ws.close(); return; }
    // Anything everyone's told before his welcome happened before he was here, and he'll find it in the welcome itself
    const at = r.out.findIndex((o) => o.to === r.id && o.msg.t === 'welcome');
    deliver(r.out.slice(0, at));
    joined++; ws.id = r.id; sockets.set(r.id, ws);
    deliver(r.out.slice(at));
  }

  wss.on('connection', (ws, req) => {
    ws.id = 0; ws.tcp = req.socket;
    ws.on('error', () => ws.terminate());
    // it says who it is as soon as it's open, or it's let go, and it's heard once
    let said = false;
    const waiting = setTimeout(() => ws.terminate(), helloWithin);
    ws.on('message', (data, isBinary) => {
      if (ws.id) {
        if (isBinary) deliver(town.move(ws.id, data));
        else if (decodeMessage(data.toString())?.t === 'keep') deliver(town.keep(ws.id, JSON.parse(data.toString())));
        return;
      }
      if (said || isBinary) return;
      const m = decodeMessage(data.toString());
      if (m?.t !== 'hello') return;
      said = true; clearTimeout(waiting);
      hello(ws, m);
    });
    ws.on('close', () => { clearTimeout(waiting); const id = ws.id; if (id) { letGo(id); deliver(town.leave(id)); } });
  });

  const every = 1000 / rate;
  let due = performance.now() + every, timer = null;
  function beat() {
    const began = performance.now();
    for (const id of town.silent(began, silence)) { letGo(id)?.terminate(); deliver(town.leave(id)); }
    const snapshot = town.snapshot();
    for (const ws of sockets.values()) if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < SLOW) ws.send(snapshot);
    ticks++;
    const now = performance.now(); busy += now - began;
    due = Math.max(due + every, now);
    timer = setTimeout(beat, due - now);
  }
  timer = setTimeout(beat, every);
  const saver = save ? setInterval(store, saveEvery) : null;

  const actualPort = wss.address().port;
  if (!quiet) console.log(`Chunky's open on ws://localhost:${actualPort}. Serve the repo and open index.html?net on this machine, or on a phone on the same network.`);
  return {
    port: actualPort,
    stats: () => ({ ticks, joined, busy, clients: [...sockets].map(([id, ws]) => ({ id, bytesIn: ws.tcp.bytesRead, bytesOut: ws.tcp.bytesWritten })) }),
    // Everyone's let go as if they'd left, so whatever they were driving stays where it was, and the town's kept once more.
    close: () => new Promise((done) => {
      clearTimeout(timer); clearInterval(saver);
      for (const id of [...sockets.keys()]) { letGo(id); town.leave(id); }
      for (const ws of wss.clients) ws.terminate();
      wss.close(() => { store(); done(); });
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = await startServer({
    port: +process.argv[2] || NET_PORT,
    heroHash: process.env.CHUNKY_HERO ?? '',
    save: process.env.CHUNKY_SAVE || join(fileURLToPath(new URL('..', import.meta.url)), 'data', 'raw', 'town.json'),
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => s.close().then(() => process.exit(0)));
}
