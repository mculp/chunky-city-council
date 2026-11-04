// When a try ends it's the fever from the bite, full of whatever got him, and then he comes to where he starts again. There isn't a word in any of it.
// This is when each part happens, so the page and the tests agree. index.html draws it, under "when a try ends", and docs/art-direction.md has how it looks.

// What can end a try, by what the page calls it. A wreck is anything on wheels that hits him, and a hit is something heavy coming down.
export const CAUSES = ['crowd', 'train', 'snake', 'river', 'blast', 'fire', 'hit', 'wreck'];

// In seconds: the fever, the dark, and coming to, about five from the hit to playing again. With reduced motion it's the same, held still, and quicker.
export const FEVER = {
  scene: 3, dark: .5, wake: 1.5,
  still: { scene: 1.4, dark: .4, wake: 1.2 },
  // how long the fever takes to come up, how hot it starts and how hot it gets, and how long he takes to go down
  up: .4, from: .6, to: 1, fall: .5,
  // how long it takes to go black, at the end of the fever, and to come back, at the start of coming to
  out: .5, back: .6,
};

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const times = (still) => (still ? FEVER.still : FEVER);

// How long it all takes, and when he starts to come to, which is where a tap skips to
export const feverLong = (still = false) => { const T = times(still); return T.scene + T.dark + T.wake; };
export const wakesAt = (still = false) => { const T = times(still); return T.scene + T.dark; };

// Where it's got to t seconds after the hit: 'fever', 'dark', 'waking' or 'up', how far through that part (0 to 1), how hot the fever is and how much of
// the picture there is. Coming to, what's left of the fever is the page's, the same as on the bridge.
export function feverAt(t, still = false) {
  const T = times(still), at = wakesAt(still);
  if (t < T.scene) return { part: 'fever', k: t / T.scene, heat: FEVER.from + (FEVER.to - FEVER.from) * smooth(0, FEVER.up, t), fade: 1 - smooth(T.scene - FEVER.out, T.scene, t) };
  if (t < at) return { part: 'dark', k: (t - T.scene) / T.dark, heat: FEVER.to, fade: 0 };
  if (t < at + T.wake) return { part: 'waking', k: (t - at) / T.wake, heat: 0, fade: smooth(0, Math.min(FEVER.back, T.wake), t - at) };
  return { part: 'up', k: 1, heat: 0, fade: 1 };
}
