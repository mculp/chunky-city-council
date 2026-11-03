// What every key and button does right now. Nothing here touches the page, so a test can read it.

const ON_FOOT = new Set(['land', 'bridge', 'town']);

// For the strip on a keyboard: what to press, and what it does. Moments with one thing to do have it in a prompt instead, and the strip stays out of the way.
// thrown is what's in his hand, if there's anything: { name, word, n, more }, and more says there's something else to switch to.
// mouse says the mouse has been taken, so it's what looks, swings and throws. Until it has, a click is how to take it, and the strip says so.
// shambling says he's passing for one of them.
export function keysFor(mode, { act = null, map = false, thrown = null, mouse = false, shambling = false } = {}) {
  const also = map ? [['M', 'Map']] : [], look = mouse ? ['MOUSE', 'Look'] : ['CLICK', 'Look with the mouse'];
  if (mode === 'swim') return [['WASD', 'Swim'], ['SPACE', 'Swim faster'], ...also, look];
  if (mode === 'drive') return [['W', 'Gas'], ['S', 'Brake, reverse'], ['A D', 'Steer'], ['SPACE', 'Handbrake'], ['E', 'Get out'], ...also, look];
  if (ON_FOOT.has(mode)) return [['WASD', 'Move'], ['SHIFT', 'Run'], ['SPACE', 'Jump'], ...(act ? [['E', act]] : []), ...(mode === 'town' ? [[mouse ? 'CLICK' : 'F', 'Swing'], ['C', shambling ? 'Stop shambling' : 'Shamble']] : []), ...(mode === 'town' && thrown ? [[mouse ? 'RIGHT CLICK' : 'Q', `Throw ${thrown.name} (${thrown.n})`], ...(thrown.more ? [[mouse ? 'WHEEL' : 'R', 'Switch']] : [])] : []), ...also, look];
  return [];
}

// For a phone: what each button says. A button with nothing to do isn't there.
export function buttonsFor(mode, { act = null, thrown = null } = {}) {
  if (mode === 'hang') return { a: 'CUT', b: null, run: false };
  if (mode === 'sweep') return { a: 'SWEEP', b: null, run: false };
  if (mode === 'grabbed') return { a: 'FREE', b: null, run: false };
  if (mode === 'swim') return { a: null, b: 'SWIM FAST', run: false };
  if (mode === 'drive') return { a: 'GET OUT', b: 'BRAKE', run: false };
  if (ON_FOOT.has(mode)) return { a: act ? (act.startsWith('Get in') ? 'GET IN' : act.startsWith('Eat') ? 'EAT' : act.startsWith('Bar') ? 'BAR' : act.startsWith('Unbar') ? 'UNBAR' : act.startsWith('Play') ? 'PLAY' : act.startsWith('Bump') ? 'BUMP' : act.startsWith('Take') ? 'TAKE' : act.startsWith('Look') ? 'LOOK' : act.startsWith('Read') ? 'READ' : act === 'Back' ? 'BACK' : 'TALK') : mode === 'town' ? 'SWING' : null, b: 'JUMP', run: true, c: mode === 'town' && thrown ? `${thrown.word} ${thrown.n}` : null, swap: mode === 'town' && !!thrown?.more, shamble: mode === 'town' };
  return { a: null, b: null, run: false };
}

// The mouse, on a computer. How far a pixel of it turns the camera, how far up and down the camera can go, and the most one event can turn it, because the first after taking the mouse can be a big jump.
export const MOUSE = { yaw: .0028, pitch: .002, low: -.1, high: .9, most: 240, slowest: .25, fastest: 4 };
export function lookBy(cam, dx, dy, speed = 1) {
  const clip = (v) => Math.max(-MOUSE.most, Math.min(MOUSE.most, v));
  cam.yaw -= clip(dx) * MOUSE.yaw * speed;
  cam.pitch = Math.max(MOUSE.low, Math.min(MOUSE.high, cam.pitch + clip(dy) * MOUSE.pitch * speed));
}
// Where the page can't take the mouse, it runs out of page, so it keeps turning at the sides: how fast, in radians a second, for where it is across a page that wide. Positive is to the left.
export function edgeTurn(x, width, band = 72, fastest = 2.4) {
  const left = band - x, right = band - (width - x), k = Math.max(left, right, 0) / band;
  return k <= 0 ? 0 : Math.sign(left - right) * k * k * fastest;
}
// What has to have a cursor to click on, and what there's nothing to look around in, because it's the story's camera
const CURSOR = new Set(['title', 'dialog', 'fail', 'end']), STORY_CAMERA = new Set(['title', 'hang', 'bitten', 'dream', 'wake']);
export const needsCursor = (mode, open = false) => open || CURSOR.has(mode);
export const mouseLooks = (mode, open = false) => !needsCursor(mode, open) && !STORY_CAMERA.has(mode);

// The word a prompt uses for the act button: the key on a keyboard, what the button says on a phone
export const actWord = (label, touch) => (touch ? label : 'E');
// and for swimming faster
export const fastWord = (touch) => (touch ? 'SWIM FAST' : 'SPACE');
