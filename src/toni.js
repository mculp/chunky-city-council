// Toni, at the burned house on Gallatin St: her twelve frogs, who's seen which, where she goes and what she's doing. There's no three.js or page in here, so node
// tests load it too. How she looks is in index.html, what she says is in data/toni.json, and data/toni.md has the rest.
//
// She's an astral projection: nothing can hurt her, the crowd pays her no mind and a swing goes through her. She catches frogs in the ditch and the tall grass
// round the house all night, and whenever anyone comes by she goes up to them with one in her hand and shows it to them. She shows him one he hasn't seen every
// time he comes by, and remembers which, until he's seen all twelve and she puts Gerald in his hand. The gone quiet don't react, and she doesn't mind.

// The creative director's twelve, Gerald first, since he's the first she shows anyone. `size` is nose to back end in metres, about half again a real one's,
// because they're seen from behind him on a phone, and in the same proportion to each other as they really are.
export const FROGS = [
  { name: 'Gerald', kind: 'bullfrog', size: .11 },          // still small, which is why he doesn't know yet
  { name: 'Tuba', kind: 'bullfrog', size: .23 },            // the biggest, as big as both her hands
  { name: 'Princess', kind: 'green treefrog', size: .075 },
  { name: 'Pickle', kind: 'green treefrog', size: .072 },
  { name: 'Grandma', kind: 'gray treefrog', size: .08 },
  { name: 'Cheetah', kind: 'southern leopard frog', size: .12 },
  { name: 'Freckles', kind: 'southern leopard frog', size: .11 },
  { name: 'Button', kind: 'spring peeper', size: .045 },    // the smallest
  { name: 'Marbles', kind: 'cricket frog', size: .05 },
  { name: 'Jellybean', kind: 'cricket frog', size: .048 },
  { name: 'Banjo', kind: 'bronze frog', size: .12 },
  { name: 'Dumpling', kind: 'toad', size: .11 },
];
export const BEST = 0;

export const TONI = {
  notice: 26,          // how near the house someone has to come for her to go up to them
  away: 70,            // how far from the house he has to have gone for coming back to be another time he's come by
  stand: 1.25,         // how far in front of someone she stops to show them
  hunt: 1.1, keen: 2.6, // m/s about the yard, and going up to someone
  crouch: [2, 4.5],    // how long she's down in the grass catching one
  between: [1, 3],     // how long she stands with it before she goes on to the next spot
  ask: 1.8,            // how long "Wanna see a frog?" is up before she says who it is
  show: 9,             // how long she holds it up after that, which is long enough to read what she says about it and what she says after
  leave: 7,            // he's walked off if he's this far away while she's showing him
  quiet: 3,            // and the same for one of the gone quiet, who doesn't wait for it
  height: 1.36,        // she's ten
};

const KEY = 'chunky.toni';
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const between = ([a, b], r) => a + (b - a) * r;

// What she remembers: which of the frogs he's seen, by name so that the list can grow, and whether he's had Gerald. Whether he's still holding him is kept
// with it, since she only gives him the once and a reload mustn't take him out of his hand.
export function loadToni(storage) {
  try {
    const kept = JSON.parse(storage?.getItem(KEY) ?? 'null');
    const seen = Array.isArray(kept?.seen) ? kept.seen.filter((n) => FROGS.some((f) => f.name === n)) : [];
    const gave = kept?.gave === true;
    return { seen: [...new Set(seen)], gave, holding: gave && kept?.holding === true };
  } catch { return { seen: [], gave: false, holding: false }; }
}
export function saveToni(storage, mind) {
  try { storage?.setItem(KEY, JSON.stringify({ seen: mind.seen, gave: mind.gave, holding: mind.holding })); } catch { /* she only forgets */ }
}
export const forgetToni = (storage) => { try { storage?.removeItem(KEY); } catch { /* nothing to forget */ } };
// The next one he hasn't seen, Gerald first, and once he's seen them all, whichever one's turn it is
export function nextFrog(mind, turn = 0) {
  const i = FROGS.findIndex((f) => !mind.seen.includes(f.name));
  if (i >= 0) return i;
  const rest = FROGS.map((_, j) => j).filter((j) => !(mind.gave && j === BEST));
  return rest[turn % rest.length];
}

// What she says showing one, from data/toni.json: its own line, then one of the lines that go with any of them, in turn, and the ones about "him" only for a boy
export function sayFrog(words, i, turn = 0) {
  const name = FROGS[i].name, he = words.he.includes(name), after = words.after.filter((a) => he || !a.he);
  return [words.frogs[name], after[turn % after.length].say];
}

// `home` is the middle of the house, `spots` where she looks for frogs in the ditch and the grass, as [x, z] pairs, and `rand` gives 0 to 1.
export function createToni({ home, spots, storage = null, rand = Math.random }) {
  const mind = loadToni(storage);
  const T = { x: spots[0][0], z: spots[0][1], yaw: 0, doing: 'walk', frog: nextFrog(mind), to: null, left: 0, who: null, said: null, turn: 0 };
  let visit = false, wasFar = true, shownQuiet = new Set();
  const goTo = ([x, z]) => { T.to = { x, z }; T.doing = 'walk'; };
  const nextSpot = () => goTo(spots[Math.floor(rand() * spots.length)]);
  nextSpot();
  const say = (line) => { T.said = line; };
  // He's seen it once she's said who it is, and that's when she remembers it
  function shown(i) {
    const name = FROGS[i].name;
    if (!mind.seen.includes(name)) { mind.seen.push(name); saveToni(storage, mind); }
    T.turn++;
  }
  function stepTo(target, speed, dt) {
    const d = dist(T, target);
    if (d < 1e-3) return true;
    const k = Math.min(1, speed * dt / d);
    T.yaw = Math.atan2(target.x - T.x, target.z - T.z);
    T.x += (target.x - T.x) * k; T.z += (target.z - T.z) * k;
    return k >= 1;
  }
  // a spot `stand` in front of someone, on her side of them
  const before = (p) => { const d = Math.max(.01, dist(T, p)); return { x: p.x + (T.x - p.x) / d * TONI.stand, z: p.z + (T.z - p.z) / d * TONI.stand }; };
  const back = () => { T.who = null; T.doing = 'stand'; T.left = between(TONI.between, rand()); };

  return {
    T, mind, FROGS,
    // Everyone she might go up to: `him` on foot ({ x, z } or null when he's driving or not about) and the gone quiet nearby, `quiet` ([{ id, x, z }]).
    // It says what happened this time, if anything: 'ask' as she gets to someone, 'frog' as she says which one it is, 'quiet' when it's one of the gone quiet
    // she's shown, 'give' as she holds Gerald out to him and 'gave' as he takes it.
    update(dt, { him = null, quiet = [] } = {}) {
      T.said = null;
      const H = home, near = him && dist(him, H) < TONI.notice;
      // coming back after being well away is another time he's come by, and another frog
      if (!him || dist(him, H) > TONI.away) wasFar = true;
      else if (wasFar && near) { wasFar = false; visit = true; }
      if (T.doing === 'walk' || T.doing === 'crouch' || T.doing === 'stand') {
        if (visit && near) { T.who = 'him'; T.doing = 'go'; T.frog = nextFrog(mind, T.turn); }
        else {
          const q = quiet.find((p) => !shownQuiet.has(p.id) && dist(p, H) < TONI.notice);
          if (q) { T.who = q.id; T.doing = 'go'; shownQuiet.add(q.id); }
        }
      }
      const whom = T.who === 'him' ? him : T.who !== null ? quiet.find((p) => p.id === T.who) : null;
      switch (T.doing) {
        case 'walk': if (stepTo(T.to, TONI.hunt, dt)) { T.doing = 'crouch'; T.left = between(TONI.crouch, rand()); } break;
        // down in the grass, and up again with one
        case 'crouch': if ((T.left -= dt) <= 0) { T.frog = nextFrog(mind, T.turn); back(); } break;
        case 'stand': if ((T.left -= dt) <= 0) nextSpot(); break;
        case 'go':
          if (!whom || dist(whom, H) > TONI.notice + 6) { back(); break; }
          if (stepTo(before(whom), TONI.keen, dt)) { T.doing = 'ask'; T.left = TONI.ask; T.yaw = Math.atan2(whom.x - T.x, whom.z - T.z); say('ask'); }
          break;
        case 'ask':
          if (!whom || dist(whom, T) > (T.who === 'him' ? TONI.leave : TONI.quiet + TONI.stand)) { back(); break; }
          T.yaw = Math.atan2(whom.x - T.x, whom.z - T.z);
          if ((T.left -= dt) <= 0) {
            T.doing = 'show'; T.left = TONI.show;
            if (T.who === 'him') { visit = false; say('frog'); shown(T.frog); } else say('quiet');
          }
          break;
        case 'show':
          if (whom) T.yaw = Math.atan2(whom.x - T.x, whom.z - T.z);
          if ((T.left -= dt) <= 0 || !whom || dist(whom, T) > TONI.leave) {
            // all twelve, and he hasn't had Gerald: he has now
            if (T.who === 'him' && whom && !mind.gave && FROGS.every((f) => mind.seen.includes(f.name))) { T.doing = 'give'; T.left = TONI.ask; T.frog = BEST; say('give'); }
            else back();
          }
          break;
        // he has to still be there to take it, or she keeps it for next time
        case 'give':
          if (!whom || dist(whom, T) > TONI.leave) { back(); break; }
          if ((T.left -= dt) <= 0) { mind.gave = true; mind.holding = true; saveToni(storage, mind); T.frog = nextFrog(mind, T.turn); say('gave'); back(); }
          break;
      }
      return T.said;
    },
    // a new night: the gone quiet are worth showing again
    night() { shownQuiet = new Set(); },
    gaveIt: () => mind.gave,
    // Gerald in his hand, until he lets him go in a ditch
    holding: () => mind.holding,
    letGo() { if (!mind.holding) return false; mind.holding = false; saveToni(storage, mind); return true; },
    // forgetting everyone forgets him too: he's seen none of them, and Gerald's hers again
    forget() {
      mind.seen.length = 0; mind.gave = mind.holding = false; forgetToni(storage);
      visit = false; wasFar = true; shownQuiet = new Set(); T.turn = 0; T.frog = nextFrog(mind); back();
    },
  };
}
