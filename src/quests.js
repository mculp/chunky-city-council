// Side quests the town comes up with (CHUNKY-163, and the bible's section 20): the idea someone holding out that he knows comes up
// with in the night, telling him about it, the nights it stands, and where they are by the clock meanwhile. There's no three.js or page
// in here, so node tests load it too. Rounds, templates and their words are data/quests.json, where they can send him is
// data/places.json, and data/quests.md and data/places.md say the rest.
//
// Once a real day, at the first look after midnight in Mississippi (the church signs' day, src/signs.js), the places on the list near
// someone's round go to Jev, through the talk server's /decide, which asks it three things of its own: which shape, from a fixed menu;
// which place, by its number; and whether it's worth bringing up today. Jev writes no words, and nobody's words but code's ever name a
// place, from the list. When he comes by that day they tell him, and it stands for that night and the two after, or the three after if
// tonight's already started. They go each of those nights whether he comes or not, and the first time he's there with them, it's done
// for him. After its last night without him, it's lapsed, with a line from them. What it gives him is its template's, never anybody's
// words'. They think of nothing new until its nights are over. With Jev quiet, or saying anything that isn't one of its answers, nobody
// comes up with anything that day, and nothing else changes.
import { dayOf } from './signs.js';

const CENTRAL = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
// The clock in Mississippi: the church signs' day, the minute of it, and whether it's Sunday
export function clockOf(date = new Date()) {
  const p = Object.fromEntries(CENTRAL.formatToParts(date).map(({ type, value }) => [type, value]));
  return { day: dayOf(date), min: +p.hour * 60 + +p.minute + (date.getUTCSeconds() + date.getUTCMilliseconds() / 1000) / 60, sun: p.weekday === 'Sun' };
}
const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// Where someone is on their round by the clock, as data/quests.json has them: where, the sign on their door if there's one, and how
// far through it they are, for anyone walking. `over` is slots that go over the round's, such as a night out fishing.
export function slotOf(round, clock, over = []) {
  for (const [from, to, at, sign] of [...over, ...(clock.sun && round.sun ? round.sun : round.day)]) {
    const a = mins(from), b = mins(to);
    if (clock.min >= a && clock.min < b) return { at, sign: sign ?? null, t: (clock.min - a) / (b - a) };
  }
  return { at: 'away', sign: null, t: 0 };
}

// How far (x, z) is from the stretch a to b
function offStretch(x, z, [ax, az], [bx, bz]) {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)) : 0;
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}
// The places on the list a way someone walks passes near, for the given shapes: within `near` metres of any stretch of it, nearest
// first. A way is points in true metres, as places are.
export function placesNear(places, way, { shapes, near }) {
  const off = (p) => Math.min(...(way.length > 1 ? way.slice(1).map((b, i) => offStretch(p.at[0], p.at[1], way[i], b)) : [Math.hypot(p.at[0] - way[0][0], p.at[1] - way[0][1])]));
  return places.filter((p) => p.shapes.some((s) => shapes.includes(s))).map((p) => ({ p, d: off(p) })).filter((o) => o.d <= near).sort((a, b) => a.d - b.d).map((o) => o.p);
}

// The most /decide takes: characters of plain words, places, and characters for each place
export const DECIDE = { state: 4000, places: 20, place: 200 };
// What /decide is asked, as the talk server takes it: plain words for who's thinking and how it's gone with him, from data/quests.json's
// `jev`, the shapes, and the places as words, which code keeps the order of. Nothing anybody typed is ever in it. `trips` is how many
// times he's been out with them, and `last` how the last one they told him of went: 'done', 'missed' or 'lapsed'.
export function forJev({ jev, who, places, shapes, trips = 0, last = null }) {
  return {
    state: [jev[who], jev.trips[Math.min(trips, jev.trips.length - 1)].replace('{n}', trips), last && jev[last]].filter(Boolean).join(' ').slice(0, DECIDE.state),
    shapes,
    places: places.slice(0, DECIDE.places).map((p) => `${p.name}: ${p.shapes.filter((s) => shapes.includes(s)).join(', ')}`.slice(0, DECIDE.place)),
  };
}
// Why /decide can be quiet that might be over later the same day, when it's asked once more, and how many minutes later
const AGAIN = new Set(['slow', 'off', 'fast']), LATER = 60;

// `data` is data/quests.json and `places` data/places.json's. `decide(ask)` is /decide, or a stand-in: it takes forJev()'s ask and
// answers { shape, place, worth }, where place is its number in the ask's places from 0, or { quiet } and why, and a throw is the same
// as { quiet: 'off' }. `now()` is the clock.
export function createQuests({ data, places, store = null, key = 'chunky.quests.v1', decide = null, now = () => new Date() } = {}) {
  const byId = new Map(places.map((p) => [p.id, p])), T = data.templates;
  // by who: the day they last thought, when to ask Jev again if it was quiet, how many times he's been out with them, how the last
  // one they told him of went, and their idea: { day, shape, place, told, yes, over }, where `told` is when they told him, { day, min },
  // and `over` why it's over for him, 'done' or 'lapsed'
  let minds = {};
  try { const saved = JSON.parse(store.getItem(key)); if (saved && typeof saved === 'object' && !Array.isArray(saved)) minds = saved; } catch { /* nothing saved */ }
  const save = () => { try { store.setItem(key, JSON.stringify(minds)); } catch { /* not stored */ } };
  const mind = (who) => {
    const m = minds[who];
    return m && typeof m === 'object' && !Array.isArray(m) ? m : (minds[who] = { thought: null, again: null, trips: 0, last: null, idea: null });
  };
  // their idea, at a place the list still has for it, or nothing
  const kept = (who) => { const idea = minds[who]?.idea; return idea && T[idea.shape] && byId.get(idea.place)?.shapes.includes(idea.shape) ? idea : null; };
  // and one that's still on for him: told and not over, or not told yet but thought of today
  const live = (who) => { const idea = kept(who); return idea && !idea.over && (idea.told || idea.day === clockOf(now()).day) ? idea : null; };
  // Its nights: the three nights out after they told him, from tonight if they told him before tonight's started. It stands until
  // they've packed up on the last of them.
  const nightsOf = (idea) => { const first = idea.told.day + (idea.told.min < mins(T[idea.shape].night[0][0]) ? 0 : 1); return Array.from({ length: data.nights }, (_, i) => first + i); };
  const packed = (idea) => mins(T[idea.shape].night.find(([, , at]) => at === 'hole')[1]);
  const stands = (idea, c) => { const last = nightsOf(idea).at(-1); return c.day < last || (c.day === last && c.min < packed(idea)); };
  // what's said and shown of it, with the place named by code
  const named = (line, idea) => line.replace('{place}', () => byId.get(idea.place).name);
  const of = (idea) => ({ shape: idea.shape, at: byId.get(idea.place), yes: idea.yes, lines: Object.fromEntries(Object.entries(T[idea.shape].lines).map(([k, l]) => [k, named(l, idea)])) });
  // Where they are by the clock, and the sign on their door: out at the place on each of its nights once they've told him, whether
  // he's been or not, and otherwise their round
  const where = (who) => {
    const round = data.rounds[who];
    if (!round) return null;
    const c = clockOf(now()), idea = kept(who), t = idea?.told && T[idea.shape], out = t && nightsOf(idea).includes(c.day);
    const s = slotOf(round, c, out ? t.night.map(([a, b, at]) => [a, b, at, t.sign]) : []);
    return { ...s, place: s.at === 'hole' ? byId.get(idea.place) : null };
  };
  return {
    // Once a day, at the first look: what they come up with on tonight's round, for today. Nothing while there's one he's been told
    // that's still to be closed, nor on a day that started with one he'd been told still standing, done or not, since they're still
    // going out to it. An idea he was never told is gone with the night.
    async think(who) {
      const m = mind(who), c = clockOf(now()), had = kept(who);
      if (m.thought === c.day || live(who)?.told || (had?.told && had.told.day < c.day && c.day <= nightsOf(had).at(-1))) return null;
      const again = m.again?.day === c.day;
      if (again && c.min < m.again.min) return null;
      m.thought = c.day; m.again = null; m.idea = null; save();
      const shapes = Object.keys(T).filter((s) => T[s].who === who), round = data.rounds[who];
      const near = round?.way ? placesNear(places, round.way, { shapes, near: data.near }).slice(0, DECIDE.places) : [];
      if (!near.length || !decide || !data.jev?.[who]) return null;
      let got;
      try { got = await decide(forJev({ jev: data.jev, who, places: near, shapes, trips: m.trips | 0, last: m.last })); } catch { got = { quiet: 'off' }; }
      if (got?.quiet) {
        if (!again && AGAIN.has(got.quiet)) { m.thought = null; m.again = { day: c.day, min: c.min + LATER }; save(); }
        return null;
      }
      const at = Number.isInteger(got?.place) ? near[got.place] : null;
      if (!at || !shapes.includes(got.shape) || !at.shapes.includes(got.shape) || got.worth !== true) return null;
      m.idea = { day: c.day, shape: got.shape, place: at.id, told: null, yes: false, over: null }; save();
      return of(m.idea);
    },
    // What's new about it when he comes by: 'ask' if they've not told him yet, 'lapse' once it's stood its nights without him, which
    // lapsed() closes, and otherwise nothing
    news(who) {
      const idea = live(who);
      if (!idea) return null;
      if (!idea.told) return { say: 'ask', ...of(idea) };
      return stands(idea, clockOf(now())) ? null : { say: 'lapse', ...of(idea) };
    },
    // They've told him, so it stands from now
    told(who) { const idea = live(who); if (idea && !idea.told) { const c = clockOf(now()); idea.told = { day: c.day, min: c.min }; save(); } },
    // What he can say yes to now: one they've told him that's standing
    open(who) { const idea = live(who); return idea?.told && stands(idea, clockOf(now())) ? of(idea) : null; },
    yes(who) { const idea = live(who); if (idea?.told && !idea.yes && stands(idea, clockOf(now()))) { idea.yes = true; save(); } },
    where,
    // He's there with them while they're out at it: it's done for him, that day. What it gives him is the template's, and the trust only
    // the first time ever.
    came(who) {
      const m = mind(who), idea = live(who);
      if (!idea?.told || where(who)?.at !== 'hole') return null;
      idea.over = 'done'; idea.came = clockOf(now()).day; m.last = 'done'; m.trips = (m.trips | 0) + 1; save();
      const { trust, ...rest } = T[idea.shape].reward;
      return { ...of(idea), reward: { ...rest, trust: m.trips === 1 ? trust : 0 }, note: named(T[idea.shape].notes.came, idea) };
    },
    // Its nights are over without him: closed, with their note if he'd said yes and didn't come
    lapsed(who) {
      const m = mind(who), idea = live(who);
      if (!idea?.told || stands(idea, clockOf(now()))) return null;
      idea.over = 'lapsed'; m.last = idea.yes ? 'missed' : 'lapsed'; save();
      return { note: idea.yes ? named(T[idea.shape].notes.missed, idea) : null };
    },
    trips: (who) => minds[who]?.trips | 0,
    // the day he was there with them for their idea, or nothing
    cameOn: (who) => { const idea = kept(who); return idea?.over === 'done' && Number.isInteger(idea.came) ? idea.came : null; },
    forget() { minds = {}; try { store.removeItem(key); } catch { /* nothing to remove */ } },
  };
}
