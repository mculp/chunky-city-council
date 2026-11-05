// Fishing (CHUNKY-112's, first for Coop's fishing hole in CHUNKY-163): the cast, the bobber on the water, the bite and the moment to
// set the hook, then reeling in against a line that strains, and snaps if it's held too hard while the fish runs. There's no three.js
// or page in here, so node tests load it too. The page draws it all and says when the button's pressed and whether it's held.
export const FISH = {
  bite: [3, 11],        // seconds the bobber sits before something takes it
  window: 1.1,          // seconds to set the hook once it's under
  reel: 1.5,            // metres a second he brings it in, holding
  gives: .5,            // metres a second it takes back while he lets go, and twice that while it runs
  calm: [1.5, 3.5],     // seconds between its runs
  run: [.6, 1.6],       // and how long a run lasts, longer for a bigger fish
  // How fast the line strains, held, by the pound, and held while it runs, which is what snaps it, and how fast it eases off let go
  strain: { held: .12, heldLb: .004, running: .7, runningLb: .06, eases: .8 },
  landed: 1.5,          // metres out that it's close enough to land
  most: 20,             // metres of line on the reel
  lb: { river: [2, 20], pond: [1, 10] },   // what a catfish weighs, in pounds, from the smallest to the biggest, and the smaller more often
};
const span = ([a, b], u) => a + (b - a) * u;

// `rand()` is anything from 0 up to 1, the page's from hash() so that it's the same every time
export function createFishing({ rand = Math.random } = {}) {
  // state is idle, waiting, bite, hooked; out is how far the cast went, line how much is out now, and for a bite or one on the line,
  // when it bit, its weight, and when its next run starts and stops
  let s = { state: 'idle' };
  const fish = {
    // Cast `out` metres onto water that's the river's or a pond's: the bobber sits there until something takes it
    cast(out, water = 'pond') {
      if (s.state !== 'idle') return false;
      s = { state: 'waiting', out, line: out, water, t: 0, bites: span(FISH.bite, rand()) };
      return true;
    },
    // The button: setting the hook on a bite, or bringing in a line with nothing on it, which keeps its bait
    press() {
      if (s.state === 'bite') {
        const lb = Math.round(span(FISH.lb[s.water] ?? FISH.lb.pond, rand() ** 2) * 10) / 10;
        s = { ...s, state: 'hooked', lb, strain: 0, t: 0, next: span(FISH.calm, rand()), until: 0 };
        return 'hooked';
      }
      if (s.state === 'waiting') { s = { state: 'idle' }; return 'empty'; }
      return null;
    },
    // Time going by, with the button held or not. It says what happened, if anything did: 'bite', 'missed' if the hook wasn't set in
    // time, which takes the bait, 'snapped', or 'landed' with the fish. Missed, snapped and landed are each the end of a cast.
    tick(dt, held = false) {
      if (s.state === 'waiting') {
        if ((s.t += dt) >= s.bites) { s = { ...s, state: 'bite', t: 0 }; return { what: 'bite' }; }
        return null;
      }
      if (s.state === 'bite') {
        if ((s.t += dt) >= FISH.window) { s = { state: 'idle' }; return { what: 'missed' }; }
        return null;
      }
      if (s.state !== 'hooked') return null;
      s.t += dt;
      // its runs: a calm, then a run, longer for a bigger fish
      if (!s.until && s.t >= s.next) s.until = s.t + span(FISH.run, rand()) * (.7 + s.lb / 40);
      else if (s.until && s.t >= s.until) { s.until = 0; s.next = s.t + span(FISH.calm, rand()); }
      const running = !!s.until, k = FISH.strain;
      if (held) {
        s.strain += (running ? k.running + k.runningLb * s.lb : k.held + k.heldLb * s.lb) * dt;
        if (!running) s.line -= FISH.reel * dt;
      } else {
        s.strain = Math.max(0, s.strain - k.eases * dt);
        s.line += FISH.gives * (running ? 2 : 1) * dt;
      }
      s.line = Math.min(FISH.most, s.line);
      if (s.strain >= 1) { const lb = s.lb; s = { state: 'idle' }; return { what: 'snapped', lb }; }
      if (s.line <= FISH.landed) { const caught = { lb: s.lb, water: s.water }; s = { state: 'idle' }; return { what: 'landed', fish: caught }; }
      return null;
    },
    // Put away, as when he walks off or gets in something: the cast's over, and anything on the line's gone
    stop() { s = { state: 'idle' }; },
    // What's drawn: how far out the bobber was cast and where it is now, how far under it's pulled, the strain, and whether it's running
    view() {
      const under = s.state === 'bite' ? 1 : s.state === 'hooked' ? .6 : 0;
      return { state: s.state, out: s.out ?? 0, line: s.line ?? 0, under, strain: s.strain ?? 0, running: !!s.until };
    },
  };
  return fish;
}
