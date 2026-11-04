// One town and whoever's in it. There's no socket in here, so a test can run all of it, and the same town runs under Node, for the
// tests and for playing on this machine, and on the host for everyone.
//
// It's told what each phone says, and answers with who to tell what: `{ to, msg, close }`, where `to` is a player's id or 'all',
// and `close` means that phone's to be let go once it's been told. It believes where people say they are, as long as it's on the
// map. Who someone is, is the hash of the key their phone keeps, which is all the town ever sees, and what it keeps for them is
// their name and look, where they were and what they had. It also keeps where each vehicle was left, by its place in the game's
// list, which is the same on every phone that has the same vehicles. What the cast remember of each of them is kept apart, since
// there can be a lot of it: it comes in with them, and goes out to be kept with keepMinds().
import { NET_MAX, POSE_BYTES, encodeSnapshot, decodePose } from '../src/net.js';
import { checkName } from '../src/names.js';

const EDGE = 40000;   // metres from Stuckey's Bridge, well past anything on the map
const KINDS_MOST = 32, EACH_MOST = 999, KEY = /^[0-9a-f]{64}$/, ITEM = /^[a-z][a-z0-9_]{0,23}$/i;
const SAY = {
  key: 'Something went wrong. Reload the page to play.',
  full: 'Chunky\'s full right now. Trying again in a bit.',
  elsewhere: 'You\'re playing in another tab or on another phone.',
  hero: 'You\'re the hero on another phone now.',
  reload: 'There\'s a newer Chunky. Reload the page to play.',
};
const no = (why, say = SAY[why]) => ({ t: 'no', why, say });

// what someone's carrying, as only numbers the game could have, so nobody can fill the town's memory
const counted = (n) => (Number.isInteger(n) ? Math.max(0, Math.min(EACH_MOST, n)) : 0);
function carried(state) {
  const items = {};
  if (state?.items && typeof state.items === 'object') {
    for (const [k, v] of Object.entries(state.items)) {
      if (Object.keys(items).length >= KINDS_MOST) break;
      if (ITEM.test(k) && Number.isInteger(v) && v > 0) items[k] = Math.min(v, EACH_MOST);
    }
  }
  return { beans: counted(state?.beans), items, gas: counted(state?.gas) };
}

// What the cast remember of someone, by which of them it is, as much as src/talk.js keeps and no more: what they've said to them,
// the last 24, what they've kept about them, the newest 12, each about someone by a hash, and how many times they've been by
const MIND = { cast: 8, said: 24, notes: 12, words: 240, about: 64 }, WHO = /^[a-z]{1,16}$/;
const words = (s) => typeof s === 'string' && s.length > 0 && s.length <= MIND.words;
const aNote = (n) => words(n?.text) && typeof n.about === 'string' && n.about.length <= MIND.about;
const newest = (list, most) => { if (list.length > most) list.splice(0, list.length - most); };
function tidyMinds(kept) {
  const minds = {};
  for (const [who, m] of Object.entries(kept && typeof kept === 'object' ? kept : {})) {
    if (Object.keys(minds).length >= MIND.cast) break;
    if (!WHO.test(who) || !m || typeof m !== 'object') continue;
    minds[who] = {
      notes: (Array.isArray(m.notes) ? m.notes : []).filter(aNote).slice(-MIND.notes).map((n) => ({ about: n.about, text: n.text, at: Number.isFinite(n.at) ? n.at : 0 })),
      said: (Array.isArray(m.said) ? m.said : []).filter(words).slice(-MIND.said),
      visits: counted(m.visits),
    };
  }
  return minds;
}

export function createTown({ max = NET_MAX, clock = () => performance.now() } = {}) {
  const here = new Map(), riders = new Map();   // id → who's in town; a vehicle's place in the list + 1 → who's in it
  let saved = new Map(), cars = new Map();       // key hash → what's kept for them; a vehicle's place in the list → where it was left
  const minds = new Map(), unkept = new Set();   // key hash → what the cast remember of them, while they're about; and whose has changed
  let build = { at: 0, world: '' }, next = 1, dirty = false;

  const roster = () => ({ t: 'who', players: [...here.values()].map((p) => ({ id: p.id, name: p.name, look: p.look, hero: p.hero })) });
  const carList = () => [...cars].sort((a, b) => a[0] - b[0]).map(([v, c]) => ({ v, ...c }));
  const leaveCar = (p, at) => {
    riders.delete(p.ride);
    if (!at) return [];
    const car = { x: at.x, y: at.y, z: at.z, yaw: at.yaw };
    cars.set(p.ride - 1, car); dirty = true;
    return [{ to: 'all', msg: { t: 'car', v: p.ride - 1, ...car } }];
  };
  // someone gone, and what everyone else is to be told about it
  function drop(id) {
    const p = here.get(id), out = [];
    here.delete(id);
    if (p.ride) out.push(...leaveCar(p, p.last));
    out.push({ to: 'all', msg: roster() });
    return out;
  }
  // someone let go for another phone, telling them why
  const takeOver = (p, why) => [{ to: p.id, msg: no(why), close: true }, ...drop(p.id).filter((o) => o.msg.t !== 'who')];

  return {
    get dirty() { return dirty; },
    // `minds` is what the cast remember of them, from wherever that's kept, unless the town still has it from a moment ago
    join({ keyHash, name, look, hero, build: theirs, minds: kept } = {}) {
      if (!KEY.test(keyHash ?? '')) return { no: no('key') };
      const named = checkName(name);
      if (!named.ok) return { no: no('name', named.why) };
      const out = [], mine = { at: Number.isFinite(theirs?.at) ? theirs.at : 0, world: typeof theirs?.world === 'string' ? theirs.world.slice(0, 64) : '' };
      // A different game's welcome as long as the vehicles are the same. Once they're not, the newer one wins, and whoever's on the
      // older one reloads: where vehicles were left was by the old list, so that's forgotten.
      if (mine.world !== build.world) {
        if (here.size && mine.at < build.at) return { no: no('reload') };
        for (const p of [...here.values()]) { out.push({ to: p.id, msg: no('reload'), close: true }); here.delete(p.id); }
        riders.clear(); if (build.world) { cars = new Map(); dirty = true; }
        build = mine;
      } else build = { ...build, at: Math.max(build.at, mine.at) };
      // the same phone again, or the hero on another one: the newest wins
      for (const p of [...here.values()]) if (p.keyHash === keyHash) out.push(...takeOver(p, 'elsewhere'));
      if (hero === true) for (const p of [...here.values()]) if (p.hero) out.push(...takeOver(p, 'hero'));
      if (here.size >= max) return { no: no('full'), out };

      while (here.has(next)) next = next % 65535 + 1;
      const id = next; next = next % 65535 + 1;
      const p = { id, keyHash, name: named.name, look: Number.isInteger(look) && look >= 0 && look < 256 ? look : 0, hero: hero === true, pose: new Uint8Array(POSE_BYTES), placed: false, heard: clock(), ride: 0, last: null };
      here.set(id, p);
      const before = saved.get(keyHash);
      saved.set(keyHash, { beans: 0, items: {}, gas: 0, ...before, name: p.name, look: p.look }); dirty = true;
      const back = before && 'x' in before ? { x: before.x, y: before.y, z: before.z, yaw: before.yaw, beans: before.beans, items: before.items, gas: before.gas } : null;
      if (!minds.has(keyHash)) minds.set(keyHash, tidyMinds(kept));
      out.push({ to: id, msg: { t: 'welcome', id, name: p.name, look: p.look, hero: p.hero, saved: back, minds: minds.get(keyHash), cars: carList() } });
      out.push({ to: 'all', msg: roster() });
      return { id, out };
    },
    move(id, bytes) {
      const p = here.get(id), out = [];
      if (!p || bytes?.length !== POSE_BYTES) return out;
      const q = decodePose(bytes);
      if (!(Math.abs(q.x) < EDGE && Math.abs(q.z) < EDGE && Number.isFinite(q.y))) return out;
      p.heard = clock();
      // someone else is already in it: he's told, and nobody's shown in it twice
      let ride = q.ride;
      if (ride && riders.has(ride) && riders.get(ride) !== id) { out.push({ to: id, msg: { t: 'bump', ride } }); ride = 0; }
      if (p.ride && p.ride !== ride) out.push(...leaveCar(p, p.last));
      if (ride && ride !== p.ride) { riders.set(ride, id); if (cars.delete(ride - 1)) dirty = true; }
      p.ride = ride; p.last = ride ? q : null;
      p.pose.set(bytes); if (ride !== q.ride) p.pose[14] = p.pose[15] = 0;
      p.placed = true;
      const s = saved.get(p.keyHash); s.x = q.x; s.y = q.y; s.z = q.z; s.yaw = q.yaw; dirty = true;
      return out;
    },
    // what they carry, which is also how a phone that's nowhere yet, watching the opening, says it's still there
    keep(id, state) {
      const p = here.get(id);
      if (p) { p.heard = clock(); Object.assign(saved.get(p.keyHash), carried(state)); dirty = true; }
      return [];
    },
    // one of the cast said something to them, kept something about them, or a visit's over: `who` is which of them, with `said`,
    // with `note`, `about` and `at`, or with `visit`
    mind(id, m) {
      const p = here.get(id);
      if (!p || !WHO.test(m?.who ?? '')) return [];
      p.heard = clock();
      const all = minds.get(p.keyHash), had = Object.hasOwn(all, m.who);
      if (!had && Object.keys(all).length >= MIND.cast) return [];
      const one = had ? all[m.who] : { notes: [], said: [], visits: 0 };
      if (words(m.said)) { if (one.said.includes(m.said)) return []; one.said.push(m.said); newest(one.said, MIND.said); }
      else if (aNote({ text: m.note, about: m.about })) { one.notes.push({ about: m.about, text: m.note, at: Number.isFinite(m.at) ? m.at : 0 }); newest(one.notes, MIND.notes); }
      else if (m.visit === true) one.visits = counted(one.visits + 1);
      else return [];
      all[m.who] = one; unkept.add(p.keyHash);
      return [];
    },
    // whoever's memories have changed since this was last asked, as [key hash, what the cast remember], for keeping one each. Anyone
    // whose was kept before and who's gone is let go of here, and comes back out of where it was kept.
    keepMinds() {
      const out = [...unkept].map((k) => [k, minds.get(k)]), about = new Set([...here.values()].map((p) => p.keyHash));
      for (const k of minds.keys()) if (!about.has(k) && !unkept.has(k)) minds.delete(k);
      unkept.clear();
      return out;
    },
    // and any of those that couldn't be kept, to go again next time
    notKept(list) { for (const [k, m] of list) { if (!minds.has(k)) minds.set(k, m); unkept.add(k); } },
    leave(id) { return here.has(id) ? drop(id) : []; },
    // nobody's in it until they've said where they are, or they'd be standing on Stuckey's Bridge
    snapshot() { return encodeSnapshot([...here.values()].filter((p) => p.placed)); },
    silent(now, limit) { return [...here.values()].filter((p) => now - p.heard > limit).map((p) => p.id); },
    get size() { return here.size; },
    // what's to be kept if the town's put away, and taken back out
    dump() { dirty = false; return { build, players: Object.fromEntries(saved), cars: Object.fromEntries(cars) }; },
    load(data) {
      saved = new Map(Object.entries(data?.players ?? {}).filter(([k, v]) => KEY.test(k) && v && typeof v === 'object'));
      cars = new Map(Object.entries(data?.cars ?? {}).map(([k, v]) => [+k, v]).filter(([k, v]) => Number.isInteger(k) && Number.isFinite(v?.x) && Number.isFinite(v?.z)));
      if (typeof data?.build?.world === 'string') build = { at: Number.isFinite(data.build.at) ? data.build.at : 0, world: data.build.world };
    },
  };
}
