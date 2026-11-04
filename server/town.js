// One town and whoever's in it. There's no socket in here, so a test can run all of it, and the same town runs under Node, for the
// tests and for playing on this machine, and on the host for everyone.
//
// It's told what each phone says, and answers with who to tell what: `{ to, msg, close }`, where `to` is a player's id or 'all',
// and `close` means that phone's to be let go once it's been told. It believes where people say they are, as long as it's on the
// map. Who someone is, is the hash of the key their phone keeps, which is all the town ever sees, and what it keeps for them is
// their name and look, where they were and what they had. It also keeps where each vehicle was left, by its place in the game's
// list, which is the same on every phone that has the same vehicles. What the cast remember of each of them is kept apart, since
// there can be a lot of it: it comes in with them, and goes out to be kept with keepMinds().
//
// It keeps the thousand who've been here last, and only vehicles the game could have, so that however many come and whatever their
// phones say, it's all one value Cloudflare can keep. Whoever's been away longest is let go of first, and forgotten() says who, so
// that what the cast remember of them goes too.
//
// And what's broken, as src/wrecks.js has it (CHUNKY-152), in a value of its own: the same for everyone, anyone who comes in finds it,
// and it heals by itself. That's a real day after it first broke, once nobody's within 200 m of it, so nobody sees it stand back up,
// and after two days once nobody's within 60 m, since everyone comes in by the pumps. Nothing's kept at the places `aside` says.
import { NET_MAX, POSE_BYTES, encodeSnapshot, decodePose } from '../src/net.js';
import { checkName } from '../src/names.js';
import { tidy, merge, lasting, partsIn, kindOf } from '../src/wrecks.js';

const EDGE = 40000;   // metres from Stuckey's Bridge, well past anything on the map
const KINDS_MOST = 32, EACH_MOST = 999, KEY = /^[0-9a-f]{64}$/, ITEM = /^[a-z][a-z0-9_]{0,23}$/i;
// a rektguy someone's wearing of their own, by the handle that's all anyone's told of it (server/wallet.js)
const HANDLE = /^[\w-]{16,64}$/;
// About 1.1 KB each at most, as Cloudflare keeps them, and a few bytes for each place a vehicle's left, against its 2 MB for a
// value. The game parks at most one vehicle by each building, which is far fewer than that.
const KEEPS = 1000, VEHICLES_MOST = 4096;
// How long what's broken stays broken, and who's near enough that it waits. Past as much as it keeps, whatever broke first heals first.
const DAY = 864e5, NEAR = 200, BUSY_NEAR = 60, WRECKS_MOST = 2000, WRECK_PARTS_MOST = 30000, WRECKS_AT_ONCE = 64;
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
// the last 24, what they've kept about them, the newest 12, each about someone by a hash, and how many times they've been by. And how
// they feel about them, once they feel anything, as far as data/cast.json's meters go.
const MIND = { cast: 8, said: 24, notes: 12, words: 240, about: 64 }, WHO = /^[a-z]{1,16}$/, FEEL = { trust: [-3, 3], fear: [0, 3] };
const words = (s) => typeof s === 'string' && s.length > 0 && s.length <= MIND.words;
const aNote = (n) => words(n?.text) && typeof n.about === 'string' && n.about.length <= MIND.about;
const newest = (list, most) => { if (list.length > most) list.splice(0, list.length - most); };
const felt = (meter, v) => Math.max(FEEL[meter][0], Math.min(FEEL[meter][1], v));
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
    for (const meter of Object.keys(FEEL)) if (Number.isFinite(m[meter])) minds[who][meter] = felt(meter, m[meter]);
  }
  return minds;
}

// `wall` is the time of day, for what's broken, which has to mean the same after the town's been put away and taken out again. `aside`
// is src/aside.js's, for where nothing's kept broken.
export function createTown({ max = NET_MAX, keeps = KEEPS, clock = () => performance.now(), wall = () => Date.now(), aside = null } = {}) {
  const here = new Map(), riders = new Map();   // id → who's in town; a vehicle's place in the list + 1 → who's in it
  // key hash → what's kept for them, the longest away first; a vehicle's place in the list → where it was left
  let saved = new Map(), cars = new Map();
  const minds = new Map(), unkept = new Set();   // key hash → what the cast remember of them, while they're about; and whose has changed
  const letGoOf = new Set();                     // and who's been let go of, whose memories are to go too
  let build = { at: 0, world: '' }, next = 1, dirty = false;
  // what's broken → { w, the wreck as it's kept, and at, when it first broke }, the first to break first; and how many building parts
  let wrecks = new Map(), wreckParts = 0, wrecksDirty = false;

  // Nobody who's anywhere is within r of it. Someone watching the opening isn't anywhere yet.
  function nobodyWithin(x, z, r) {
    for (const p of here.values()) { if (!p.placed) continue; const s = saved.get(p.keyHash); if (Math.hypot(s.x - x, s.z - z) < r) return false; }
    return true;
  }
  // A vehicle's wherever it was left since, or wherever someone has it now, and nobody puts one back with someone in it
  const vehicleOf = (k) => (kindOf(k) === 'v' ? +k.slice(1) : -1);
  const ridden = (k) => vehicleOf(k) >= 0 && riders.has(vehicleOf(k) + 1);
  const whereIs = (k, w) => cars.get(vehicleOf(k)) ?? w;
  // healed, and everyone's told: a vehicle's back where it was parked
  function heal(keys) {
    for (const k of keys) {
      wreckParts -= partsIn(wrecks.get(k).w); wrecks.delete(k); wrecksDirty = true;
      if (cars.delete(vehicleOf(k))) dirty = true;
    }
    return keys.length ? [{ to: 'all', msg: { t: 'heal', k: keys } }] : [];
  }
  // whether there's room for so many more things and parts for `key`, once whatever broke first that nobody's near has healed
  function roomFor(key, things, parts) {
    let n = wrecks.size + things, q = wreckParts + parts;
    const go = [];
    for (const [k, e] of wrecks) {
      if (n <= WRECKS_MOST && q <= WRECK_PARTS_MOST) break;
      const at = whereIs(k, e.w);
      if (k === key || ridden(k) || !nobodyWithin(at.x, at.z, NEAR)) continue;
      go.push(k); n--; q -= partsIn(e.w);
    }
    return n <= WRECKS_MOST && q <= WRECK_PARTS_MOST ? heal(go) : null;
  }

  // someone's here, or has just gone, so they're the last to be let go of
  const seen = (k) => { const s = saved.get(k); if (s) { saved.delete(k); saved.set(k, s); } };
  // whoever's been away longest is let go of until it's down to as many as it keeps, and nobody who's here
  function makeRoom() {
    const about = new Set([...here.values()].map((p) => p.keyHash));
    for (const k of saved.keys()) {
      if (saved.size <= keeps) break;
      if (about.has(k)) continue;
      saved.delete(k); minds.delete(k); unkept.delete(k); letGoOf.add(k); dirty = true;
    }
  }

  const roster = () => ({ t: 'who', players: [...here.values()].map((p) => ({ id: p.id, name: p.name, look: p.look, hero: p.hero, ...(p.rekt && { rekt: p.rekt }) })) });
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
    here.delete(id); seen(p.keyHash);
    if (p.ride) out.push(...leaveCar(p, p.last));
    out.push({ to: 'all', msg: roster() });
    return out;
  }
  // someone let go for another phone, telling them why
  const takeOver = (p, why) => [{ to: p.id, msg: no(why), close: true }, ...drop(p.id).filter((o) => o.msg.t !== 'who')];

  return {
    get dirty() { return dirty; },
    // `minds` is what the cast remember of them, from wherever that's kept, unless the town still has it from a moment ago. `rekt`
    // is the handle of a rektguy of their own they're wearing, which the hero never is: he's in his own.
    join({ keyHash, name, look, hero, rekt, build: theirs, minds: kept } = {}) {
      if (!KEY.test(keyHash ?? '')) return { no: no('key') };
      const named = checkName(name);
      if (!named.ok) return { no: no('name', named.why) };
      const out = [], mine = { at: Number.isFinite(theirs?.at) ? theirs.at : 0, world: typeof theirs?.world === 'string' ? theirs.world.slice(0, 64) : '' };
      // A different game's welcome as long as the vehicles are the same. Once they're not, the newer one wins, and whoever's on the
      // older one reloads: where vehicles were left was by the old list, so that's forgotten.
      if (mine.world !== build.world) {
        if (here.size && mine.at < build.at) return { no: no('reload') };
        for (const p of [...here.values()]) { out.push({ to: p.id, msg: no('reload'), close: true }); here.delete(p.id); }
        riders.clear();
        if (build.world) {
          cars = new Map(); dirty = true;
          for (const k of [...wrecks.keys()]) if (vehicleOf(k) >= 0) { wrecks.delete(k); wrecksDirty = true; }
        }
        build = mine;
      } else build = { ...build, at: Math.max(build.at, mine.at) };
      // the same phone again, or the hero on another one: the newest wins
      for (const p of [...here.values()]) if (p.keyHash === keyHash) out.push(...takeOver(p, 'elsewhere'));
      if (hero === true) for (const p of [...here.values()]) if (p.hero) out.push(...takeOver(p, 'hero'));
      if (here.size >= max) return { no: no('full'), out };

      while (here.has(next)) next = next % 65535 + 1;
      const id = next; next = next % 65535 + 1;
      const p = { id, keyHash, name: named.name, look: Number.isInteger(look) && look >= 0 && look < 256 ? look : 0, hero: hero === true, rekt: hero !== true && typeof rekt === 'string' && HANDLE.test(rekt) ? rekt : null, pose: new Uint8Array(POSE_BYTES), placed: false, heard: clock(), ride: 0, last: null };
      here.set(id, p);
      const before = saved.get(keyHash);
      // back before they were forgotten where what the cast remember of them is kept, so it stays
      saved.delete(keyHash); letGoOf.delete(keyHash);
      saved.set(keyHash, { beans: 0, items: {}, gas: 0, ...before, name: p.name, look: p.look }); dirty = true;
      makeRoom();
      const back = before && 'x' in before ? { x: before.x, y: before.y, z: before.z, yaw: before.yaw, beans: before.beans, items: before.items, gas: before.gas } : null;
      if (!minds.has(keyHash)) minds.set(keyHash, tidyMinds(kept));
      out.push({ to: id, msg: { t: 'welcome', id, name: p.name, look: p.look, hero: p.hero, ...(p.rekt && { rekt: p.rekt }), saved: back, minds: minds.get(keyHash), cars: carList(), wrecks: [...wrecks.values()].map((e) => e.w) } });
      out.push({ to: 'all', msg: roster() });
      return { id, out };
    },
    move(id, bytes) {
      const p = here.get(id), out = [];
      if (!p || bytes?.length !== POSE_BYTES) return out;
      const q = decodePose(bytes);
      if (!(Math.abs(q.x) < EDGE && Math.abs(q.z) < EDGE && Number.isFinite(q.y))) return out;
      p.heard = clock();
      // someone else is already in it: he's told, and nobody's shown in it twice. One the game couldn't have is nobody's.
      let ride = q.ride <= VEHICLES_MOST ? q.ride : 0;
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
    // one of the cast said something to them, kept something about them, a visit's over, or how they feel about them has moved:
    // `who` is which of them, with `said`, with `note`, `about` and `at`, with `visit`, or with `trust` and `fear` as they are now
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
      else if (Number.isFinite(m.trust) && Number.isFinite(m.fear)) { one.trust = felt('trust', m.trust); one.fear = felt('fear', m.fear); }
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
    // whoever's been let go of since this was last asked, by key hash, whose memories are to be forgotten wherever they're kept
    forgotten() { const out = [...letGoOf]; letGoOf.clear(); return out; },
    // Something's broken on their phone, as src/wrecks.js says it, a few at a time: everyone else is told what's new in it. One that's
    // new past as much as the town keeps makes room by healing whatever broke first that nobody's near, or isn't kept. A vehicle with
    // nobody in it lies wherever it ended up, for everyone.
    wreck(id, list) {
      const p = here.get(id), healed = [], told = [], parked = [];
      if (!p || !Array.isArray(list)) return [];
      p.heard = clock();
      const now = wall();
      for (const said of list.slice(0, WRECKS_AT_ONCE)) {
        const w = tidy(said);
        if (!w || aside?.world(w.x, w.z)) continue;
        const had = wrecks.get(w.k), r = merge(had?.w ?? null, w);
        if (!r.changed) continue;
        const grows = partsIn(r.kept) - (had ? partsIn(had.w) : 0);
        if (!had || grows > 0) { const made = roomFor(w.k, had ? 0 : 1, Math.max(0, grows)); if (!made) continue; healed.push(...made); }
        // a building written in a different number of parts, by another version of the game, is broken from now
        const at = had && had.w.n === r.kept.n ? had.at : now;
        wreckParts += partsIn(r.kept) - (had ? partsIn(had.w) : 0);
        wrecks.set(w.k, { w: r.kept, at }); wrecksDirty = true;
        told.push(r.told);
        if (vehicleOf(w.k) >= 0 && !ridden(w.k)) {
          const v = vehicleOf(w.k), car = { x: r.kept.x, y: r.kept.y, z: r.kept.z, yaw: r.kept.yaw };
          cars.set(v, car); dirty = true;
          parked.push({ to: 'all', except: id, msg: { t: 'car', v, ...car } });
        }
      }
      return [...healed, ...(told.length ? [{ to: 'all', except: id, msg: { t: 'wreck', w: told } }] : []), ...parked];
    },
    // whatever's due to heal by now, with everyone told
    heal(now = wall()) {
      const go = [];
      for (const [k, e] of wrecks) {
        const age = now - e.at, at = whereIs(k, e.w);
        if (!ridden(k) && (age >= 2 * DAY ? nobodyWithin(at.x, at.z, BUSY_NEAR) : age >= DAY && nobodyWithin(at.x, at.z, NEAR))) go.push(k);
      }
      return heal(go);
    },
    get wrecksDirty() { return wrecksDirty; },
    // what's broken, kept apart from the rest since there can be a lot of it, with when each thing first broke
    dumpWrecks() { wrecksDirty = false; return [...wrecks.values()].map(({ w, at }) => ({ ...w, at })); },
    loadWrecks(list) {
      wrecks = new Map(); wreckParts = 0;
      for (const kept of Array.isArray(list) ? list : []) {
        const w = tidy(kept);
        if (!w || !Number.isFinite(kept.at) || aside?.world(w.x, w.z) || wrecks.size >= WRECKS_MOST || wreckParts + partsIn(w) > WRECK_PARTS_MOST) continue;
        wrecks.set(w.k, { w: lasting(w), at: kept.at }); wreckParts += partsIn(w);
      }
    },
    leave(id) { return here.has(id) ? drop(id) : []; },
    // nobody's in it until they've said where they are, or they'd be standing on Stuckey's Bridge
    snapshot() { return encodeSnapshot([...here.values()].filter((p) => p.placed)); },
    silent(now, limit) { return [...here.values()].filter((p) => now - p.heard > limit).map((p) => p.id); },
    get size() { return here.size; },
    // what's to be kept if the town's put away, and taken back out
    dump() { dirty = false; return { build, players: Object.fromEntries(saved), cars: Object.fromEntries(cars) }; },
    load(data) {
      saved = new Map(Object.entries(data?.players ?? {}).filter(([k, v]) => KEY.test(k) && v && typeof v === 'object'));
      cars = new Map(Object.entries(data?.cars ?? {}).map(([k, v]) => [+k, v]).filter(([k, v]) => Number.isInteger(k) && k >= 0 && k < VEHICLES_MOST && Number.isFinite(v?.x) && Number.isFinite(v?.z)));
      if (typeof data?.build?.world === 'string') build = { at: Number.isFinite(data.build.at) ? data.build.at : 0, world: data.build.world };
    },
  };
}
