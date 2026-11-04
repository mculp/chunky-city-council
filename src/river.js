// The river, to follow downstream, and where someone it's had comes up. There's no three.js or page in here, so node tests load it too.
//
// TIGER draws the Chunky River from its upper end to its lower one, so further along a line is further downstream, and that's how the lines in
// data/roads.json are kept. It was checked against the survey, the US Geological Survey's 3D Elevation Program, along them: the bed is 92.3 m over
// sea level at the first point of the first line, 85.9 m by the time it's nearly done, 85.1 where the second line takes it up, and 74.5 m near
// the end of that. It falls the 17 m that data/hills.md says it does across the map, with nothing but the survey's own noise ever climbing back. src/river.test.js keeps it that way round.
//
// Nobody dies of it. Whoever the cottonmouths have goes under and the current takes them, and they come up a little way downstream, on the bank
// they can walk home from, soaked. src/horde.js does the rest.

const hypot = Math.hypot;

// lines are [[x, z], ...], the river as the game has it, in the order it flows. One that stops within `join` of where another starts is the same river carrying on.
export function createRiver(lines, { join = 40 } = {}) {
  const L = lines.filter((pts) => pts.length > 1).map((pts) => {
    const S = [0];
    for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, S, length: S[S.length - 1], next: -1, prev: -1 };
  });
  L.forEach((a, i) => {
    let best = join;
    L.forEach((b, j) => { const d = j === i ? Infinity : hypot(b.pts[0][0] - a.pts.at(-1)[0], b.pts[0][1] - a.pts.at(-1)[1]); if (d < best) { best = d; a.next = j; } });
    if (a.next >= 0) L[a.next].prev = i;
  });
  const river = {
    lines: L,
    // The point s metres along a line, and which way the river's flowing there
    point(k, s, out = {}) {
      const l = L[k], S = l.S;
      let lo = 0, hi = S.length - 2;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S[m] <= s) lo = m; else hi = m - 1; }
      const a = l.pts[lo], b = l.pts[lo + 1], len = S[lo + 1] - S[lo] || 1, t = Math.max(0, Math.min(1, (s - S[lo]) / len));
      out.line = k; out.s = s; out.x = a[0] + (b[0] - a[0]) * t; out.z = a[1] + (b[1] - a[1]) * t; out.tx = (b[0] - a[0]) / len; out.tz = (b[1] - a[1]) / len;
      return out;
    },
    // The nearest point of the river to x, z, and how far off it is
    near(x, z, out = {}) {
      let best = Infinity, line = 0, at = 0;
      L.forEach((l, k) => {
        for (let i = 0; i < l.pts.length - 1; i++) {
          const a = l.pts[i], b = l.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
          const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0, d = hypot(x - a[0] - dx * t, z - a[1] - dz * t);
          if (d < best) { best = d; line = k; at = l.S[i] + t * (l.S[i + 1] - l.S[i]); }
        }
      });
      river.point(line, at, out); out.d = best;
      return out;
    },
    // A point that's `metres` further downstream, or up if that's negative, going on to the line that carries on from the end of one. `end` says it ran out of river.
    walk(from, metres, out = {}) {
      let k = from.line, s = from.s + metres, end = false;
      for (let guard = 0; guard < L.length + 2; guard++) {
        const l = L[k];
        if (s > l.length) { if (l.next < 0) { s = l.length; end = true; break; } s -= l.length; k = l.next; }
        else if (s < 0) { if (l.prev < 0) { s = 0; end = true; break; } k = l.prev; s += L[k].length; }
        else break;
      }
      river.point(k, Math.max(0, Math.min(L[k].length, s)), out); out.end = end;
      return out;
    },
  };
  return river;
}

export const SURFACING = {
  reach: 70,         // metres. Water further from the river's line than this is a pond's or a pool's, and has no downstream
  out: 60,           // metres from the middle of the river, or from where they went under in a pond, they'll look for dry land
  step: .5,          // metres, looking
  deep: .8,          // metres. The outermost place the water's this deep is where they come up, so they come up out of it
  past: 1.5,         // metres up the bank from the first dry ground, so they're on it and not at the edge
  room: 10, wide: 8, // metres of clear ground there has to be straight out from the bank and along it either way, or it's against a wall or a fence
  least: 8,          // metres. The shortest they'll be swept, if the river won't have them any further
  nearer: .85,       // and how much shorter each time it won't
  homeSide: 5,       // metres. Home has to be this much to one side of the river or the other to say which bank, and otherwise it's up to them
};

// world: { water(x, z), blocked(x, z, y), floorAt(x, z), depth(x, z) how far under the surface the bottom is, pond(x, z) whether it's a pond's or a pool's water and not the river's }
// Returns comeUp(s, { metres, side, home }): where someone who went under at s comes up, swept `metres` downstream, on the bank towards `home` ([x, z]) or by `side` (0 to 1)
// if home's no help. It's { x, z, bank: [x, z] }: up out of the water, a little way from the bank, and where they head to. Or nothing, if there's nowhere they could walk home from.
export function surfacing(river, world, tuning = {}) {
  const T = { ...SURFACING, ...tuning }, here = {}, mid = {};
  const bad = (x, z) => world.water(x, z) || world.blocked(x, z, world.floorAt(x, z));
  // Out from (x0, z0) along (ux, uz) until the water stops and there's bank to stand on. The place they come up is the last of the deep water on the way, and the bank is a little past the edge.
  // The river doesn't bring anyone up in a pond, or take them through one to get to the bank. Out from inside one, though, that's the water they're in.
  function marchOut(x0, z0, ux, uz, inPond = false) {
    let wet = null, deep = null;
    for (let d = 0; d <= T.out; d += T.step) {
      const x = x0 + ux * d, z = z0 + uz * d;
      if (!inPond && world.pond?.(x, z)) return null;
      if (world.water(x, z)) {
        // somewhere they could stand up in, so not off the edge of the map or against a pier
        if (!world.blocked(x, z, world.floorAt(x, z))) { wet = [x, z]; if (world.depth(x, z) >= T.deep) deep = [x, z]; }
        continue;
      }
      // it has to have been in the water, and the water has to have stopped
      if (!wet) return null;
      const bx = x + ux * T.past, bz = z + uz * T.past;
      return clear(bx, bz, ux, uz) ? { x: (deep ?? wet)[0], z: (deep ?? wet)[1], bank: [bx, bz] } : null;
    }
    return null;
  }
  // Room on the bank: nothing in the way straight out, and nothing along it either side, which is a wall or a fence they'd be stuck behind
  function clear(bx, bz, ux, uz) {
    if (bad(bx, bz)) return false;
    for (let d = 2; d <= T.room; d += 2) if (bad(bx + ux * d, bz + uz * d)) return false;
    for (const k of [-1, 1]) for (const d of [T.wide / 2, T.wide]) if (bad(bx - uz * k * d, bz + ux * k * d)) return false;
    return true;
  }
  // A pond or a pool has no downstream: they come up on the shore towards home, or the nearest one round from there
  function pond(s, how) {
    const toward = how.home ? Math.atan2(how.home[1] - s.z, how.home[0] - s.x) : (how.side ?? 0) * Math.PI * 2;
    for (const k of [0, 1, -1, 2, -2, 3, -3, 4]) {
      const a = toward + k * Math.PI / 4, out = marchOut(s.x, s.z, Math.cos(a), Math.sin(a), true);
      if (out) return out;
    }
    return null;
  }
  return function comeUp(s, how = {}) {
    if (world.pond?.(s.x, s.z)) return pond(s, how);
    river.near(s.x, s.z, here);
    if (here.d > T.reach) return pond(s, how);
    // as far downstream as the current took them, or as far as it'll go, and on the bank they can get home from
    for (let metres = how.metres ?? T.least; ; metres *= T.nearer) {
      metres = Math.max(metres, T.least);
      river.walk(here, metres, mid);
      const nx = -mid.tz, nz = mid.tx, towards = how.home ? (how.home[0] - mid.x) * nx + (how.home[1] - mid.z) * nz : 0;
      const side = Math.abs(towards) > T.homeSide ? Math.sign(towards) : (how.side ?? 0) < .5 ? 1 : -1;
      for (const k of [side, -side]) {
        const out = marchOut(mid.x, mid.z, nx * k, nz * k);
        if (out) return { ...out, metres, side: k };
      }
      if (metres <= T.least) break;
    }
    // nowhere below. Straight out from where they went in then, the way pond does.
    return pond(s, how);
  };
}
