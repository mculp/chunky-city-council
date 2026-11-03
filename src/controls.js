// What every key and button does right now. Nothing here touches the page, so a test can read it.

const ON_FOOT = new Set(['land', 'bridge', 'town']);

// For the strip on a keyboard: what to press, and what it does. Moments with one thing to do have it in a prompt instead, and the strip stays out of the way.
// thrown is what's in his hand, if there's anything: { name, word, n, more }, and more says there's something else to switch to.
export function keysFor(mode, { act = null, map = false, thrown = null } = {}) {
  const also = map ? [['M', 'Map']] : [], look = ['DRAG', 'Look'];
  if (mode === 'swim') return [['WASD', 'Swim'], ['SPACE', 'Swim faster'], ...also, look];
  if (mode === 'drive') return [['W', 'Gas'], ['S', 'Brake, reverse'], ['A D', 'Steer'], ['SPACE', 'Handbrake'], ['E', 'Get out'], ...also, look];
  if (ON_FOOT.has(mode)) return [['WASD', 'Move'], ['SHIFT', 'Run'], ['SPACE', 'Jump'], ...(act ? [['E', act]] : []), ...(mode === 'town' ? [['F', 'Swing']] : []), ...(mode === 'town' && thrown ? [['Q', `Throw ${thrown.name} (${thrown.n})`], ...(thrown.more ? [['R', 'Switch']] : [])] : []), ...also, look];
  return [];
}

// For a phone: what each button says. A button with nothing to do isn't there.
export function buttonsFor(mode, { act = null, thrown = null } = {}) {
  if (mode === 'hang') return { a: 'CUT', b: null, run: false };
  if (mode === 'sweep') return { a: 'SWEEP', b: null, run: false };
  if (mode === 'grabbed') return { a: 'FREE', b: null, run: false };
  if (mode === 'swim') return { a: null, b: 'SWIM FAST', run: false };
  if (mode === 'drive') return { a: 'GET OUT', b: 'BRAKE', run: false };
  if (ON_FOOT.has(mode)) return { a: act ? (act.startsWith('Get in') ? 'GET IN' : act.startsWith('Eat') ? 'EAT' : act.startsWith('Bar') ? 'BAR' : act.startsWith('Unbar') ? 'UNBAR' : act.startsWith('Play') ? 'PLAY' : 'TALK') : mode === 'town' ? 'SWING' : null, b: 'JUMP', run: true, c: mode === 'town' && thrown ? `${thrown.word} ${thrown.n}` : null, swap: mode === 'town' && !!thrown?.more };
  return { a: null, b: null, run: false };
}

// The word a prompt uses for the act button: the key on a keyboard, what the button says on a phone
export const actWord = (label, touch) => (touch ? label : 'E');
// and for swimming faster
export const fastWord = (touch) => (touch ? 'SWIM FAST' : 'SPACE');
