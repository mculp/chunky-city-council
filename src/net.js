// Playing together: what goes over the wire, and how someone else's steps get smoothed out on your screen.
// There's no three.js or page in here, so the town server shares the wire format and a test can run all of it. The socket's passed in.
//
// Where everyone is goes as bytes, twenty times a second each way: a pose from each phone, and from the server a snapshot of
// everyone's. Everything else goes now and then as words, a JSON object with its kind in `t`:
//   from a phone:   hello { key, name, look, hero?, build? }, keep { beans, items, gas }
//   from the town:  welcome { id, name, look, hero, saved, cars }, who { players: [{ id, name, look, hero }] },
//                   car { v, x, y, z, yaw }, bump { ride }, no { why, say }
export const NET_RATE = 20, NET_MAX = 25, POSE_BYTES = 18;
// where a town on this machine listens, for index.html?net
export const NET_PORT = 8787;
// where the characters' words are asked for: the talk server on Cloudflare, server/worker.js
export const TALK_URL = 'https://chunky.chunkymetro.workers.dev/talk';
// and the town everyone shares, beside it
export const TOWN_URL = 'wss://chunky.chunkymetro.workers.dev/town';
// Where Play goes: the town it's given with ?net=…, and otherwise the one everyone shares on the game's own site,
// which is https, or one on the same machine as the page anywhere else, which a phone on the same network finds by the page's address
export const townUrl = (given, { protocol, hostname }) => given || (protocol === 'https:' ? TOWN_URL : `ws://${hostname || 'localhost'}:${NET_PORT}`);
// where a town says how many are in it right now, for the title card: beside it, at /here, and null for an address that isn't one
export function hereUrl(town) {
  try { const u = new URL(town); u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:'; u.pathname = `${u.pathname.replace(/\/$/, '')}/here`; u.search = ''; return u.href; } catch { return null; }
}
// who a phone is: a key it makes the first time it's needed and keeps, for the town and for the characters' words
export const PHONE_KEY = /^[\w-]{16,128}$/;
// how someone is, besides where: on their feet (walking, running, standing), swimming, or knocked down
export const HOW = { foot: 0, swim: 1, down: 2 };
const SNAPSHOT = 2, HEAD = 2, ENTRY = POSE_BYTES + 2, TAU = Math.PI * 2;
const viewOf = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);

// A pose: the sender's clock in ms, x and z to a couple of millimetres, y to the centimetre, facing to a 65536th of a turn, which
// vehicle they're in (one more than its place in the game's list, and 0 on foot), and how many times they've swung and waved, as
// counts that wrap, so that a swing or a wave between two poses still shows.
export function encodePose(stamp, x, y, z, yaw, { ride = 0, swings = 0, waves = 0, how = HOW.foot } = {}) {
  const b = new Uint8Array(POSE_BYTES), v = viewOf(b);
  v.setUint16(0, stamp & 0xffff, true); v.setFloat32(2, x, true); v.setFloat32(6, z, true);
  v.setInt16(10, Math.max(-32768, Math.min(32767, Math.round(y * 100))), true);
  v.setUint16(12, Math.round(yaw / TAU * 65536) & 0xffff, true);
  v.setUint16(14, ride & 0xffff, true); b[16] = swings & 0xff; b[17] = (how & 3) | (waves & 15) << 2;
  return b;
}
const poseAt = (v, at) => ({
  stamp: v.getUint16(at, true), x: v.getFloat32(at + 2, true), z: v.getFloat32(at + 6, true), y: v.getInt16(at + 10, true) / 100, yaw: v.getUint16(at + 12, true) / 65536 * TAU,
  ride: v.getUint16(at + 14, true), swings: v.getUint8(at + 16), waves: v.getUint8(at + 17) >> 2 & 15, how: v.getUint8(at + 17) & 3,
});
export const decodePose = (b) => poseAt(viewOf(b), 0);

// Everyone's poses as they were sent, each with who it is. The server doesn't need to unpack them to pass them on.
export function encodeSnapshot(players) {
  const b = new Uint8Array(HEAD + ENTRY * players.length), v = viewOf(b);
  b[0] = SNAPSHOT; b[1] = players.length;
  players.forEach((p, i) => { const at = HEAD + ENTRY * i; v.setUint16(at, p.id, true); b.set(p.pose, at + 2); });
  return b;
}
export const say = (message) => JSON.stringify(message);
// Words come as a string and poses as bytes. Anything else, or anything that doesn't read, is null.
export function decodeMessage(data) {
  if (typeof data === 'string') {
    try { const m = JSON.parse(data); return m && typeof m === 'object' && !Array.isArray(m) && typeof m.t === 'string' ? m : null; } catch { return null; }
  }
  const b = ArrayBuffer.isView(data) ? data : new Uint8Array(data), v = viewOf(b);
  if (b[0] !== SNAPSHOT || b.length !== HEAD + ENTRY * b[1]) return null;
  const players = [];
  for (let i = 0; i < b[1]; i++) { const at = HEAD + ENTRY * i; players.push({ id: v.getUint16(at, true), ...poseAt(v, at + 2) }); }
  return { players };
}

// What a phone calls itself, made the first time it's needed and kept. The town only ever sees its hash.
export function makeKey() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// The game's vehicles as a word, for the town to tell two games apart. A vehicle's known by its place in the list, so everyone in
// town has to have the same list, parked in the same places. They're placed to the decimetre, since two phones' sums can differ in
// the last digit.
export function worldOf(vehicles) {
  const text = vehicles.map((v) => `${v.kind}:${Math.round(v.x * 10)}:${Math.round(v.z * 10)}:${Math.round(v.yaw * 100)}`).join('|');
  let a = 0x811c9dc5, b = 0x9747b28c;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x5bd1e995); b ^= b >>> 15; }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

// The look that comes with a name, for someone who'd rather not pick: the same one for that name every time, whatever the capitals
export function rollLook(name, looks) {
  let h = 0x811c9dc5;
  for (const c of String(name).trim().toLowerCase()) h = Math.imul(h ^ c.codePointAt(0), 0x01000193);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca77); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) % looks;
}

const KEEP = 16;   // about 800 ms of someone's poses
const faceBetween = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
// As his own legs go: a stride's so many radians a metre at a walk, and they don't speed up as much as he does running
const strideRate = (v) => Math.min(v, 4.4) * 2.4 + Math.max(0, v - 4.4) * 1.3;

// Everyone else, as they should look right now. Each person's poses are placed on the clock they were sent by, not when they got
// here or when the server passed them on, and shown `delay` ms behind the newest, so there's nearly always one either side to go between.
// Going by the sender's clock is the point: the server's ticks are out of step with everyone's frames, and if it were its clock they
// were placed on, a walk would come out as a stutter. What they're in and how they are go with where they're shown, from the same pose,
// and getting into something or out of it isn't gone between by degrees: they're just there, as they are after a jump. Their swings
// and waves aren't smoothed: they take the newest pose's, so none goes missing between two.
export function createWalkers({ delay = 100, ahead = 150, jump = 10 } = {}) {
  const all = new Map(), list = [], names = new Map();
  const named = (w) => { const n = names.get(w.id); w.name = n?.name ?? ''; w.look = n?.look ?? 0; w.hero = !!n?.hero; };
  const walkers = {
    // who's who, from the town's list of names and looks
    who(players) {
      names.clear(); for (const p of players) names.set(p.id, p);
      for (const w of list) named(w);
    },
    take(players, now) {
      for (const w of list) w.here = false;
      for (const p of players) {
        let w = all.get(p.id);
        if (!w) {
          const at = { t: 0, x: p.x, y: p.y, z: p.z, yaw: p.yaw, ride: p.ride ?? 0, how: p.how ?? HOW.foot };
          w = { id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, ride: at.ride, how: at.how, when: 0, speed: 0, phase: 0, s: [at], stamp: p.stamp, t: 0, off: now, drawn: now, here: true };
          w.swings = p.swings ?? 0; w.waves = p.waves ?? 0;
          named(w); all.set(p.id, w); list.push(w); continue;
        }
        w.here = true;
        const d = (p.stamp - w.stamp) & 0xffff;
        if (!d) continue;   // the same pose again: they've not said anything since the server's last tick
        w.stamp = p.stamp; w.t += d;
        w.swings = p.swings ?? 0; w.waves = p.waves ?? 0;
        const off = now - w.t;
        w.off = Math.abs(off - w.off) > 1000 ? off : w.off + (off - w.off) * .05;
        w.s.push({ t: w.t, x: p.x, y: p.y, z: p.z, yaw: p.yaw, ride: p.ride ?? 0, how: p.how ?? HOW.foot }); if (w.s.length > KEEP) w.s.shift();
      }
      for (let i = list.length - 1; i >= 0; i--) if (!list[i].here) { all.delete(list[i].id); list.splice(i, 1); }
    },
    at(now) {
      for (const w of list) {
        const dt = Math.max(0, now - w.drawn) / 1000, shown = now - w.off - delay, s = w.s;
        w.drawn = now;
        let i = s.length - 1; while (i > 0 && s[i].t > shown) i--;
        const a = s[i], b = s[i + 1];
        let v = 0, k = 0, from = a, to = a;
        if (b) { from = a; to = b; k = Math.max(0, Math.min(1, (shown - a.t) / (b.t - a.t))); }
        else if (i > 0) {
          // nothing newer yet: on the way they were going for a moment, and then they wait
          from = s[i - 1]; to = a; k = 1 + Math.min(shown - a.t, ahead) / (a.t - from.t);
          if (shown - a.t >= ahead) v = -1;
        }
        const dist = Math.hypot(to.x - from.x, to.z - from.z);
        if (dist > jump || to.ride !== from.ride) { k = 1; v = -1; }   // they didn't walk that: they're just there
        w.x = from.x + (to.x - from.x) * k; w.y = from.y + (to.y - from.y) * k; w.z = from.z + (to.z - from.z) * k; w.yaw = faceBetween(from.yaw, to.yaw, Math.min(1, k));
        // as of the pose they're shown at, or the one they're shown just past, and when that was sent, on their clock
        const as = k >= 1 ? to : from;
        w.ride = as.ride; w.how = as.how; w.when = as.t;
        v = v < 0 || to === from ? 0 : dist / (to.t - from.t) * 1000;
        w.speed += (v - w.speed) * Math.min(1, dt * 10);
        w.phase += strideRate(w.speed) * dt;
      }
      return list;
    },
    clear() { all.clear(); list.length = 0; },
  };
  return walkers;
}

// The connection. It only ever opens from update(), which the game calls while it's drawing, so a hidden tab stays out of town.
// It says hello as soon as it's open and sends nothing else until it's let in. A town that's full gets asked again after `full` ms;
// one that turned it away for its name, for being an older game than the one in town, or because he's the hero on another phone
// isn't asked again until again() is called, since asking again would get the same answer.
export function connectNet({ url, WS = globalThis.WebSocket, clock = () => performance.now(), hello = () => ({}), status = () => {}, on = {}, retry = 2000, full = 10000 }) {
  const walkers = createWalkers(), every = 1000 / NET_RATE, count = { framesIn: 0, bytesIn: 0, framesOut: 0, bytesOut: 0 };
  let sock = null, id = 0, openAt = 0, sendAt = 0, said = null, refused = null, stopped = false;
  const tell = (s, m) => { if (s !== said) { said = s; status(s, m); } };
  const send = (data) => { sock.send(data); count.framesOut++; count.bytesOut += data.length; };
  function open() {
    // one the browser won't even ask, such as ws:// from a page on https or an address that isn't one, is lost like any other
    let me;
    try { me = sock = new WS(url); } catch { openAt = clock() + retry; tell('lost'); return; }
    me.binaryType = 'arraybuffer';
    me.onopen = () => { if (sock === me) send(say({ t: 'hello', ...hello() })); };
    // one that's been let go of says nothing more
    me.onmessage = (e) => {
      if (sock !== me) return;
      count.framesIn++; count.bytesIn += typeof e.data === 'string' ? e.data.length : e.data.byteLength;
      const m = decodeMessage(e.data);
      if (!m) return;
      if (m.players && !m.t) walkers.take(m.players.filter((p) => p.id !== id), clock());
      else if (m.t === 'welcome') { id = m.id; tell('joined'); on.welcome?.(m); }
      else if (m.t === 'who') walkers.who(m.players ?? []);
      else if (m.t === 'car') on.car?.(m);
      else if (m.t === 'bump') on.bump?.(m);
      else if (m.t === 'no') refused = m;
    };
    me.onclose = () => {
      if (sock !== me) return;
      sock = null; id = 0; walkers.clear(); sendAt = 0;
      if (refused?.why === 'full') { openAt = clock() + full; tell('full', refused); }
      else if (refused) { stopped = true; tell(refused.why, refused); }
      else { openAt = clock() + retry; tell('lost'); }
      refused = null;
    };
  }
  // open, or opened again, and whether it's let in
  const tend = (now) => { if (!sock && !stopped && now >= openAt) open(); return sock?.readyState === 1 && !!id; };
  return {
    get id() { return id; },
    count,
    update(x, y, z, yaw, extra) {
      const now = clock();
      if (!tend(now) || now < sendAt) return;
      sendAt = Math.max(sendAt + every, now - every);
      send(encodePose(Math.round(now), x, y, z, yaw, extra));
    },
    // A pose that can't wait its turn: the last from something he's just got out of, so that the town leaves it exactly where he
    // did and not where it was a moment before. The next waits its turn after it.
    now(x, y, z, yaw, extra) {
      const now = clock();
      if (!tend(now)) return;
      sendAt = Math.max(sendAt, now + every);
      send(encodePose(Math.round(now), x, y, z, yaw, extra));
    },
    // the connection kept without saying where he is, for a phone that isn't anywhere yet, which keep() says it's still there for
    tend() { tend(clock()); },
    // what he's carrying, for the town to keep
    keep(state) { if (sock?.readyState === 1 && id) send(say({ t: 'keep', ...state })); },
    again() { stopped = false; openAt = 0; said = null; },
    // let go of the town, without a word, until again()
    close() { const was = sock; stopped = true; sock = null; id = 0; refused = null; walkers.clear(); sendAt = 0; was?.close(); },
    others() { return walkers.at(clock()); },
  };
}
