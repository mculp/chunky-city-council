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
// were placed on, a walk would come out as a stutter. What they're in, how they are and their swings and waves aren't smoothed: they
// take the newest pose's.
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
          w = { id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, speed: 0, phase: 0, s: [{ t: 0, x: p.x, y: p.y, z: p.z, yaw: p.yaw }], stamp: p.stamp, t: 0, off: now, drawn: now, here: true };
          w.ride = p.ride ?? 0; w.swings = p.swings ?? 0; w.waves = p.waves ?? 0; w.how = p.how ?? HOW.foot;
          named(w); all.set(p.id, w); list.push(w); continue;
        }
        w.here = true;
        const d = (p.stamp - w.stamp) & 0xffff;
        if (!d) continue;   // the same pose again: they've not said anything since the server's last tick
        w.stamp = p.stamp; w.t += d;
        w.ride = p.ride ?? 0; w.swings = p.swings ?? 0; w.waves = p.waves ?? 0; w.how = p.how ?? HOW.foot;
        const off = now - w.t;
        w.off = Math.abs(off - w.off) > 1000 ? off : w.off + (off - w.off) * .05;
        w.s.push({ t: w.t, x: p.x, y: p.y, z: p.z, yaw: p.yaw }); if (w.s.length > KEEP) w.s.shift();
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
        if (dist > jump) { k = 1; v = -1; }   // they didn't walk that: they're just there
        w.x = from.x + (to.x - from.x) * k; w.y = from.y + (to.y - from.y) * k; w.z = from.z + (to.z - from.z) * k; w.yaw = faceBetween(from.yaw, to.yaw, Math.min(1, k));
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
    const me = sock = new WS(url); me.binaryType = 'arraybuffer';
    me.onopen = () => { if (sock === me) send(say({ t: 'hello', ...hello() })); };
    me.onmessage = (e) => {
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
      sock = null; id = 0; walkers.clear(); sendAt = 0;
      if (refused?.why === 'full') { openAt = clock() + full; tell('full', refused); }
      else if (refused) { stopped = true; tell(refused.why, refused); }
      else { openAt = clock() + retry; tell('lost'); }
      refused = null;
    };
  }
  return {
    get id() { return id; },
    count,
    update(x, y, z, yaw, extra) {
      const now = clock();
      if (!sock && !stopped && now >= openAt) open();
      if (sock?.readyState !== 1 || !id || now < sendAt) return;
      sendAt = Math.max(sendAt + every, now - every);
      send(encodePose(Math.round(now), x, y, z, yaw, extra));
    },
    // what he's carrying, for the town to keep
    keep(state) { if (sock?.readyState === 1 && id) send(say({ t: 'keep', ...state })); },
    again() { stopped = false; openAt = 0; said = null; },
    others() { return walkers.at(clock()); },
  };
}
