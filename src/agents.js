// Who everybody in town is: what they're like, and what they remember of him. There's no three.js or page in here, so
// node tests load it too. src/horde.js asks it how someone's taking things, and data/folks.md says how it all works.
//
// What they're like comes from their number and never changes. What they remember is kept between sessions, and only
// for the ones with something to remember, so it stays small.

// How they are with him. Nothing on the screen says which: it shows in what they do.
export const BE = 0, AFTER = 1, AWAY = 2, TAILING = 3;

export const HOW = {
  hold: [300, 1500],     // seconds of play for what he's done to halve, from the calmest of them to the worst temper
  there: .2,             // what it counts for being there when he hurt someone, or being told about it, against being hit being 1
  slipped: .3,           // and for having hold of him and losing him
  acts: .18,             // less than this and it's stopped changing what they do
  never: .2,             // and being hit never fades below this, which is enough that it never quite does
  stands: [.4, .75],     // how bold it takes to come at him: after being hit, and when it was only somebody else
  flees: .25,            // and how little it takes to keep away when it was only somebody else
  brokenBy: .12,         // how much bolder each hit past the first means they'd have to have been
  nosy: .75, nearFor: 10,  // how nosy it takes to follow him about, and how many seconds close to him without being hurt
  meetAfter: 1.5,        // seconds close to him before he knows their name
  news: 90,              // seconds it's still worth telling anyone
  thereEvery: 3,         // one fight's all one thing to whoever's there
  shunReach: 20,         // metres they keep off where they were hurt
  wiseAfter: [2, 5],     // how many of the same thrown thing it takes, from the nosiest to the least
  saveEvery: 10,
  // Out of the crowd, the furthest gone have burnt down, and they're the ones who come for him on sight. The rest have gone quiet.
  burnt: [1 / 15, 1 / 5],     // how many have burnt down in town, and from out past...
  burntOut: [1000, 3000],     // ...this far from the middle of town, in true metres, going from one to the other between
  // How far over they stand, as the angle at the hips between their legs and their back: 180° stood up straight, 90° flat like a table and 0°
  // folded right over, though it's drawn at 90° plus half of it. It goes with how far gone they are, from the least gone to the furthest of
  // each, and anyone under `scuttles` stays folded over and scuttles after him, a quick shuffle on their feet, where everyone else stands up.
  hips: { quiet: [150, 30], burnt: [30, 0], flickering: [170, 150], scuttles: 90 },
  flickers: .4,               // how far gone the cast's looks go, in data/looks.json, while they've only quit a little
};

const smooth = (t) => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };
// How many of the crowd have burnt down, so far out of town
export const burntShare = (fromTown) => HOW.burnt[0] + (HOW.burnt[1] - HOW.burnt[0]) * smooth((fromTown - HOW.burntOut[0]) / (HOW.burntOut[1] - HOW.burntOut[0]));
// Whether someone has, by how far gone their number says they are. It's the top of it, so it's the ones it shows on most. Nobody at home has.
export const burntDown = (w, fromTown) => !w.calm && w.looks.phase / 6.28 > 1 - burntShare(fromTown);
// How far over someone stands, in degrees at the hips, by how far gone their number says they are. The ones who've burnt down are over the same
// line as burntDown's, so they're all folded further over than anyone who hasn't, and the rest are spread evenly over the quiet ones' range.
export const hipsOf = (w, fromTown) => {
  const t = w.looks.phase / 6.28, line = w.calm ? 1 : 1 - burntShare(fromTown), [a, b] = t > line ? HOW.hips.burnt : HOW.hips.quiet;
  return t > line ? a + (b - a) * (t - line) / (1 - line) : a + (b - a) * t / line;
};
// And one of the cast who's only quit a little, by how far gone their look is
export const flickering = (degree) => { const [a, b] = HOW.hips.flickering; return a + (b - a) * Math.min(1, degree / HOW.flickers); };

// The same every time for the same number and salt, and nothing to do with crowdRand, which would change what everyone does after it
export const roll = (id, salt) => {
  let t = Math.imul(id + 1, 0x9E3779B1) ^ Math.imul(salt + 1, 0x85EBCA77);
  t ^= t >>> 15; t = Math.imul(t, 0xC2B2AE3D); t ^= t >>> 13; t = Math.imul(t, 0x27D4EB2F); t ^= t >>> 16;
  return (t >>> 0) / 4294967296;
};

// What they're like and what they look like, from their number alone. looks is data/looks.json's crowd.
export function personOf(id, data, looks = []) {
  const look = Math.floor(roll(id, 1) * 1000), dressed = data.dressed[looks[look % looks.length]?.id];
  const kind = dressed ?? (roll(id, 2) < .5 ? 'women' : 'men'), firsts = data[kind];
  // Taking turns through the names means nobody in a family shares one until they've all been used
  const first = firsts[(Math.floor(id / 4) * 17 + (id % 4) * 5) % firsts.length];
  // Half of everybody's an Alexander or a Clark, and an eighth are Gressetts, out of the other half
  const family = id % 4 < 2 ? data.families[id % 4] : id % 8 === 2 ? data.families[2] : data.others[Math.floor(roll(id, 4) * data.others.length)];
  // what they mutter, if they've gone quiet: one of data/folks.json's, by their number
  const says = data.mutters?.length ? data.mutters[Math.floor(roll(id, 13) * data.mutters.length)] : '';
  // and on the way home from being flung by what he's driving, the same way
  const flungSays = data.flung?.length ? data.flung[Math.floor(roll(id, 14) * data.flung.length)] : '';
  return {
    // her is which list the name came from, which is all the game knows of who a man or a woman is. It goes with what woke someone, in src/horde.js's why, when what did was him hitting them.
    id, first, family, name: `${first} ${family}`, says, flungSays, her: kind === 'women',
    temper: roll(id, 5), nerve: roll(id, 6), nosy: roll(id, 7), homebody: roll(id, 8), tagalong: roll(id, 9),
    looks: { look, phase: roll(id, 10) * 6.28, limp: roll(id, 11) < .5 ? 0 : 1, size: .94 + roll(id, 12) * .12 },
    hurt: 0, truck: 0, there: 0, told: 0, got: 0, slipped: 0, near: 0, fooled: {}, when: 0, seen: 0, met: false, shun: null, where: null,
  };
}

// What they remember of each player, by their id. In the story there's only him, whose id is nothing, and what they remember of him is on them, which is
// what's kept between sessions. Anyone else, in the town everyone shares, has their own under `by`, which isn't. Reading it never makes one.
const MEMORY = Object.freeze({ hurt: 0, truck: 0, there: 0, told: 0, got: 0, slipped: 0, near: 0, when: 0, seen: 0, met: false });
const of = (w, pid) => (pid == null ? w : ((w.by ??= {})[pid] ??= { ...MEMORY }));
const peek = (w, pid) => (pid == null ? w : w.by?.[pid] ?? MEMORY);

// What's worth keeping. Nothing that's zero, so most of them take up no room at all.
// There was a `gone` here once, for whoever the river had. Nobody is lost to it now, so an old save that has one is read with it left out, and the next save doesn't write it.
const KEPT = ['hurt', 'truck', 'there', 'told', 'got', 'slipped', 'near', 'when', 'seen', 'met', 'shun', 'where'];

// store is localStorage or anything like it, and a browser that won't keep anything just doesn't remember
export function createFolks(data, { store = null, looks = [] } = {}) {
  const KEY = `chunky.folks.v${data.version}`, everyone = new Map();
  let clock = 0, dirty = false, wait = HOW.saveEvery, turn = 0;
  const person = (id) => { let w = everyone.get(id); if (!w) { w = personOf(id, data, looks); everyone.set(id, w); } return w; };

  function load() {
    try {
      const saved = JSON.parse(store.getItem(KEY));
      if (Number.isFinite(saved.clock)) clock = saved.clock;
      for (const [id, row] of Object.entries(saved.rows)) {
        const w = person(+id);
        for (const k of KEPT) if (row[k] !== undefined) w[k] = row[k];
        if (row.fooled) w.fooled = row.fooled;
      }
    } catch { /* nothing saved */ }
  }
  function save() {
    dirty = false;
    const rows = {};
    for (const [id, w] of everyone) {
      // where they got to, so they're there next time
      if (w.body && w.body.under === undefined && w.met) w.where = [Math.round(w.body.x), Math.round(w.body.z)];
      const row = {};
      for (const k of KEPT) if (w[k]) row[k] = k === 'near' || k === 'when' || k === 'seen' ? Math.round(w[k] * 10) / 10 : w[k];
      if (Object.keys(w.fooled).length) row.fooled = w.fooled;
      if (Object.keys(row).length) rows[id] = row;
    }
    try { store.setItem(KEY, JSON.stringify({ clock: Math.round(clock), rows })); } catch { /* not stored */ }
  }

  const holdOf = (w) => HOW.hold[0] + w.temper * (HOW.hold[1] - HOW.hold[0]);
  // How much of what he's done is still with them. pid is which player, and nothing is him in the story, here and all through what follows.
  function shock(w, pid) {
    const m = peek(w, pid), was = m.hurt + (m.there + m.told) * HOW.there + m.slipped * HOW.slipped;
    if (!was) return 0;
    const now = was * 2 ** (-(clock - m.when) / holdOf(w));
    return m.hurt ? Math.max(now, HOW.never) : now;
  }
  function moodOf(w, pid) {
    const k = shock(w, pid), m = peek(w, pid);
    if (k < HOW.acts) return !m.got && !m.hurt && w.nosy > HOW.nosy && m.near >= HOW.nearFor ? TAILING : BE;
    const bold = w.nerve + (w.temper - .5) * .4 - Math.max(0, m.hurt - 1) * HOW.brokenBy;
    if (m.hurt) return bold > HOW.stands[0] ? AFTER : AWAY;
    return bold > HOW.stands[1] ? AFTER : bold < HOW.flees ? AWAY : BE;
  }
  // Anything that's happened to someone goes through here, so that it's saved
  function note(w, what) {
    what();
    dirty = true;
  }

  const folks = {
    person,
    // The next person to come out
    next() { return person(turn++); },
    tick(dt) { clock += dt; if ((wait -= dt) <= 0) { wait = HOW.saveEvery; if (dirty) save(); } },
    now: () => clock,
    save,
    hasSave() { try { return !!store.getItem(KEY); } catch { return false; } },
    forget() { for (const w of everyone.values()) { Object.assign(w, { hurt: 0, truck: 0, there: 0, told: 0, got: 0, slipped: 0, near: 0, fooled: {}, when: 0, seen: 0, met: false, shun: null, where: null }); delete w.by; } clock = 0; turn = 0; dirty = false; try { store.removeItem(KEY); } catch { /* nothing to remove */ } },

    mood: moodOf,
    shock,
    // what they remember of a player, to read
    memory: peek,
    // How far off they can make him out. It averages out at what the crowd's tuning says, and someone with a grudge can tell from further.
    senses: (w, mood, pid) => (.85 + w.temper * .3) * (mood === AFTER ? 1 + Math.min(1.5, shock(w, pid)) : 1),
    roam: (w) => 40 + (1 - w.homebody) ** 2 * 400,
    wise: (w, kind) => (w.fooled[kind] ?? 0) >= HOW.wiseAfter[0] + Math.round((1 - w.nosy) * (HOW.wiseAfter[1] - HOW.wiseAfter[0])),
    shuns: (w, x, z) => !!w.shun && Math.hypot(x - w.shun[0], z - w.shun[1]) < HOW.shunReach,

    // What's happened to them. Where they were hurt is theirs, whoever did it.
    hurt(w, x, z, by, pid) {
      note(w, () => {
        w.shun = [Math.round(x), Math.round(z)];
        // nobody thinks of a fire, a train or the river as something he did to them
        if (by === 'fire' || by === 'train' || by === 'river') return;
        const m = of(w, pid); m.hurt++; if (by === 'truck') m.truck++; m.when = clock;
      });
    },
    // Was there when he hurt somebody
    wasThere(w, pid) {
      const m = of(w, pid);
      if (clock - (m.thereAt ?? -1e9) < HOW.thereEvery) return;
      m.thereAt = clock;
      note(w, () => { m.there++; m.when = clock; });
    },
    // Who's got something to tell anyone: only what they saw for themselves, and only for a while
    hasNews: (w, pid) => { const m = peek(w, pid); return (m.hurt > 0 || m.there > 0) && clock - m.when < HOW.news; },
    tell(from, to, pid) {
      const t = peek(to, pid);
      if (from === to || from.family !== to.family || !folks.hasNews(from, pid) || ((t.hurt || t.there || t.told) && clock - t.when < HOW.news)) return false;
      note(to, () => { const m = of(to, pid); m.told++; m.when = clock; });
      return true;
    },
    got(w, pid) { note(w, () => { of(w, pid).got++; }); },
    slipped(w, pid) { note(w, () => { const m = of(w, pid); m.slipped++; m.when = clock; }); },
    // what they've been fooled by is theirs, whoever threw it
    fooled(w, kind) { note(w, () => { w.fooled[kind] = (w.fooled[kind] ?? 0) + 1; }); },
    // Close to him. He gets to know their name, and the nosy ones get curious.
    close(w, dt, pid) {
      const m = of(w, pid); m.seen = clock; m.near += dt; dirty = true;
      if (!m.met && m.near >= HOW.meetAfter) m.met = true;
    },

    // Who he's met
    met(pid) { const list = []; for (const w of everyone.values()) if (peek(w, pid).met) list.push(w); return list; },
  };
  load();
  return folks;
}
