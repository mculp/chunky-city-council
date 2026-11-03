// The light on Stuckey's Bridge, from what the owner sent. docs/lore.md has what it's from and what was decided around it. It's only where it is and what it's doing: there's
// no three.js in here and nothing about how it looks.
//
// When he comes back to the bridge it's out at the far end of it, swinging. It comes along towards him, goes through him and carries on out the other way, still swinging.
// It doesn't do anything to him, and nothing can be heard while it's close. The bridge lies along x with its middle at the origin.

export const LIGHT = {
  see: 62,        // how far he is from the middle of the bridge when it's there
  end: 24,        // how far along the bridge it starts, on the other side from him
  wait: 5,        // how long it hangs there before it comes, in seconds
  speed: 3.2,     // as fast as someone walking quickly
  through: 1.2,   // this close and it's gone through him
  past: 70,       // how far it carries on past him
  fade: 20,       // the last of that, going out
  lost: 140,      // if he gets this far away it doesn't follow
  again: 300,     // how far he has to go from the bridge for it to come another time
  hush: 30,       // how close it is when everything goes quiet, and when it comes back
  arm: .8,        // how long the swing is from where it's held
  swing: .75,     // how far it swings, in radians
  still: .3,      // and with reduced motion
  period: 1.7,    // seconds, there and back
  height: 1.15,   // where it's held, over the deck or over him
  appear: 2,      // seconds to come up
};

export const makeLight = () => ({ state: 'waiting', t: 0, x: 0, y: 0, z: 0, ux: 1, uz: 0, gone: 0, shown: 0, hush: false, through: false, closest: Infinity });

// One step. he's { x, y, z }. can says if it's a time it could happen, and deck is how high the bridge's deck is.
export function stepLight(l, he, dt, { can, deck }) {
  l.t += dt;
  const fromBridge = Math.hypot(he.x, he.z);
  if (l.state === 'waiting') {
    if (!can || fromBridge > LIGHT.see) return l;
    const side = he.x > 0 ? -1 : 1;
    Object.assign(l, { state: 'out', t: 0, x: side * LIGHT.end, y: deck + LIGHT.height, z: 0, ux: -side, uz: 0, gone: 0, shown: 0, through: false, closest: Infinity });
  } else if (l.state === 'gone') {
    if (fromBridge > LIGHT.again) l.state = 'waiting';
    return l;
  }
  const dx = he.x - l.x, dz = he.z - l.z, d = Math.hypot(dx, dz);
  l.closest = Math.min(l.closest, d);
  if (l.state !== 'past' && (d > LIGHT.lost || !can)) { end(l); return l; }
  if (l.state === 'out') {
    l.shown = Math.min(1, l.t / LIGHT.appear);
    if (l.t >= LIGHT.wait) l.state = 'coming';
  } else if (l.state === 'coming') {
    // it doesn't hurry and it doesn't miss
    if (d < LIGHT.through) { l.state = 'past'; l.through = true; l.gone = 0; } else { l.ux = dx / d; l.uz = dz / d; }
    l.y += (he.y + LIGHT.height - l.y) * Math.min(1, dt * .8);
    l.x += l.ux * LIGHT.speed * dt; l.z += l.uz * LIGHT.speed * dt;
  } else {
    l.x += l.ux * LIGHT.speed * dt; l.z += l.uz * LIGHT.speed * dt; l.gone += LIGHT.speed * dt;
    l.shown = Math.min(1, (LIGHT.past - l.gone) / LIGHT.fade);
    if (l.gone >= LIGHT.past) { end(l); return l; }
  }
  l.hush = d < LIGHT.hush && l.state !== 'out';
  return l;
}

function end(l) { l.state = 'gone'; l.shown = 0; l.hush = false; }

// Where it is, swinging across the way it's going. time's in seconds.
export function lightAt(l, time, reduced = false) {
  const a = (reduced ? LIGHT.still : LIGHT.swing) * Math.sin(time * Math.PI * 2 / LIGHT.period), across = LIGHT.arm * Math.sin(a);
  return [l.x - l.uz * across, l.y + LIGHT.arm * (1 - Math.cos(a)), l.z + l.ux * across];
}
