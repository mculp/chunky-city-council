// What's in a picture, for the checks that look at one: a frame that's nearly all one colour is the camera inside something, such
// as his hood, whatever its numbers say. tools/browser.mjs measures every screenshot a check keeps with it, and a check can measure
// a canvas inside the page.

// More of a picture than this in one colour is a wall
export const WALL = 0.8;

// How much of a picture, { data, width, height } as a canvas's ImageData has it, is one colour, and which colour that is, as
// "#rrggbb". It's measured in blocks `block` pixels across, each the average of its pixels, so that grain and the weave of what he's
// wearing don't break a colour up. A block darker than `dark` in all three is the night, which counts in the picture but is never a
// colour of its own, since that's how the game looks. Of the rest, it's the fullest of 512 boxes of colour and then every block
// within `near` of what's in it, whichever box that's in, so that one colour with the light falling across it still counts as one.
// It needs nothing from outside itself, so it can be sent into a page with page.evaluate(`(${oneColour})(…)`).
export function oneColour({ data, width, height }, { block = 8, near = 24, dark = 64 } = {}) {
  const across = Math.ceil(width / block), down = Math.ceil(height / block), n = across * down, cells = new Float64Array(n * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, c = (Math.floor(y / block) * across + Math.floor(x / block)) * 4;
    cells[c] += data[i]; cells[c + 1] += data[i + 1]; cells[c + 2] += data[i + 2]; cells[c + 3]++;
  }
  const lit = [];
  for (let c = 0; c < n * 4; c += 4) {
    const r = cells[c] / cells[c + 3], g = cells[c + 1] / cells[c + 3], b = cells[c + 2] / cells[c + 3];
    cells[c] = r; cells[c + 1] = g; cells[c + 2] = b;
    if (Math.max(r, g, b) >= dark) lit.push(c);
  }
  const hex = (v) => Math.round(v).toString(16).padStart(2, '0'), colourOf = (r, g, b) => `#${hex(r)}${hex(g)}${hex(b)}`;
  if (!lit.length) {
    let r = 0, g = 0, b = 0;
    for (let c = 0; c < n * 4; c += 4) { r += cells[c]; g += cells[c + 1]; b += cells[c + 2]; }
    return { share: 0, colour: colourOf(r / n, g / n, b / n) };
  }
  const boxes = new Uint32Array(512), box = (c) => (cells[c] >> 5) << 6 | (cells[c + 1] >> 5) << 3 | cells[c + 2] >> 5;
  for (const c of lit) boxes[box(c)]++;
  let top = 0;
  for (let k = 1; k < 512; k++) if (boxes[k] > boxes[top]) top = k;
  let r = 0, g = 0, b = 0;
  for (const c of lit) if (box(c) === top) { r += cells[c]; g += cells[c + 1]; b += cells[c + 2]; }
  r /= boxes[top]; g /= boxes[top]; b /= boxes[top];
  let same = 0, sr = 0, sg = 0, sb = 0;
  for (const c of lit) {
    if (Math.abs(cells[c] - r) > near || Math.abs(cells[c + 1] - g) > near || Math.abs(cells[c + 2] - b) > near) continue;
    same++; sr += cells[c]; sg += cells[c + 1]; sb += cells[c + 2];
  }
  return { share: same / n, colour: colourOf(sr / same, sg / same, sb / same) };
}
