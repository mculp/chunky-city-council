// tools/picture.mjs: how much of a picture is one colour
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WALL, oneColour } from './picture.mjs';

// A picture `width` by `height` whose pixel at x, y is paint(x, y), an [r, g, b]
const picture = (width, height, paint) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set([...paint(x, y), 255], (y * width + x) * 4);
  return { data, width, height };
};
const RED = [196, 30, 30], NIGHT = [12, 14, 30], GRASS = [70, 110, 40], SKY = [150, 180, 220];
const ONE = { block: 1 };

test('a picture that\'s all one colour is all that colour', () => {
  assert.deepEqual(oneColour(picture(40, 32, () => RED)), { share: 1, colour: '#c41e1e' });
});

test('one colour with the light falling across it is still one colour, as the inside of a hood is', () => {
  const shaded = picture(64, 40, (x, y) => [180 + Math.round((x / 63) * 30), 24 + Math.round((y / 39) * 12), 26]);
  const { share, colour } = oneColour(shaded);
  assert.equal(share, 1);
  assert.match(colour, /^#c[0-9a-f]1[0-9a-f]1a$/, colour);
});

test('grain, and the weave of what he\'s wearing, don\'t break a colour up', () => {
  const woven = picture(96, 64, (x, y) => ((x * 7 + y * 13) % 5 === 0 ? [20, 8, 10] : RED));
  assert.ok(oneColour(woven).share > 0.99, `${oneColour(woven).share}`);
  assert.ok(oneColour(woven, ONE).share < 0.85, 'pixel by pixel, the weave would');
});

test('the night isn\'t a wall, however much of the picture it is', () => {
  assert.deepEqual(oneColour(picture(40, 32, () => NIGHT)), { share: 0, colour: '#0c0e1e' });
  const lit = picture(40, 32, (x) => (x < 4 ? SKY : NIGHT));
  assert.equal(oneColour(lit, ONE).share, 0.1, 'only what\'s lit is a colour, out of all of it');
});

test('a picture with things in it is only as much one colour as the biggest of them', () => {
  const scene = picture(100, 50, (x, y) => (y < 20 ? SKY : x < 70 ? GRASS : NIGHT));
  const { share, colour } = oneColour(scene, ONE);
  assert.equal(share, (70 * 30) / (100 * 50));
  assert.equal(colour, '#466e28');
  assert.equal(oneColour(picture(40, 40, (x, y) => [RED, SKY, GRASS, [230, 200, 60]][(x < 20) + 2 * (y < 20)]), ONE).share, 0.25);
});

test('colours a long way apart aren\'t one colour, however much of each there is', () => {
  const halves = picture(48, 24, (x) => (x < 24 ? [100, 100, 100] : [180, 180, 180]));
  assert.equal(oneColour(halves).share, 0.5);
});

test('a wall is more than four fifths of the picture in one colour', () => {
  assert.equal(WALL, 0.8);
  assert.ok(oneColour(picture(50, 40, (x) => (x < 42 ? RED : SKY)), ONE).share > WALL);
  assert.ok(oneColour(picture(50, 40, (x) => (x < 38 ? RED : SKY)), ONE).share < WALL);
});

test('it needs nothing from outside itself, so it can be sent into a page and run on a canvas there', () => {
  const sent = new Function(`return (${oneColour})`)();
  const scene = picture(30, 30, (x, y) => (x + y < 30 ? RED : SKY));
  assert.deepEqual(sent(scene), oneColour(scene));
});
