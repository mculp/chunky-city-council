// Their song at the cemetery up Chunky Duffee Rd, which is the owner's, at audio/music/stone.mp3 (CHUNKY-175). It isn't from the stone: it's as loud anywhere in and
// around the cemetery, with everything else dipped under it. There's no three.js or page in here, so node tests load it too.
//
// Pulling up starts it: stopping whatever he's driving, or being there on foot, within `near` of the cemetery. Driving past doesn't. It's once a visit, so it doesn't
// start again by itself until he's been more than `away` off and come back. Past `fade` it fades away over `fadeFor` seconds, and comes back up if he does first.
// Reading the stone starts it whenever it isn't playing, which the page does without asking this.
export const SONG = { near: 25, stopped: 2, fade: 60, fadeFor: 4, away: 100 };

export function createSong(T = SONG) {
  let visit = false, much = 0;
  return {
    // Every frame: d is how far he is from the cemetery, 0 in it, speed how fast whatever he's driving is going, or null on foot, and dt the frame's seconds.
    // Says whether it starts now, and how much of it's to be heard, from 1 for all of it down to 0.
    update(d, speed, dt) {
      if (d > T.away) visit = false;
      much = Math.max(0, Math.min(1, much + (d > T.fade ? -dt : dt) / T.fadeFor));
      const start = !visit && d <= T.near && (speed === null || speed < T.stopped);
      if (start) { visit = true; much = 1; }
      return { start, much };
    },
    get visit() { return visit; },
  };
}
