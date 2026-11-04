// tools/favicon.mjs, without Chrome: reading the icon out of the page, and an .ico of the PNGs Chrome draws from it
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ico, iconOf } from './favicon.mjs';

const SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='#07050b'/></svg>";
const page = (link) => `<!doctype html><html><head><meta charset="utf-8">${link}<title>Chunky 2026</title></head><body></body></html>`;

test('the icon is the SVG written into the page\'s own icon tag', () => {
  assert.equal(iconOf(page(`<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(SVG)}">`)), SVG);
  const own = iconOf(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  assert.match(own, /^<svg\b[\s\S]*<\/svg>$/, 'index.html\'s own icon');
});

test('a page whose icon isn\'t an SVG written into it has none to make one from', () => {
  assert.equal(iconOf(page('')), null);
  assert.equal(iconOf(page('<link rel="icon" href="icon.png">')), null);
  assert.equal(iconOf(page(`<link rel="stylesheet" href="data:image/svg+xml,${encodeURIComponent(SVG)}">`)), null);
});

test('an .ico holds each size\'s PNG just as it was, after a header saying how big each is and where it starts', () => {
  const png = (n, fill) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n, fill)]);
  const images = [{ size: 16, png: png(10, 1) }, { size: 32, png: png(20, 2) }, { size: 48, png: png(30, 3) }, { size: 256, png: png(5, 4) }];
  const out = ico(images);
  assert.deepEqual([out.readUInt16LE(0), out.readUInt16LE(2), out.readUInt16LE(4)], [0, 1, 4], 'an icon, of four');
  let at = 6 + 16 * images.length;
  images.forEach(({ size, png: bytes }, i) => {
    const e = 6 + 16 * i, side = size === 256 ? 0 : size;
    assert.deepEqual([out[e], out[e + 1], out.readUInt16LE(e + 4), out.readUInt16LE(e + 6)], [side, side, 1, 32], `${size} px across, in full colour`);
    assert.deepEqual([out.readUInt32LE(e + 8), out.readUInt32LE(e + 12)], [bytes.length, at], `where the ${size} px one is`);
    assert.deepEqual(out.subarray(at, at + bytes.length), bytes);
    at += bytes.length;
  });
  assert.equal(out.length, at);
});
