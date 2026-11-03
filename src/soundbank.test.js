import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { RATE, RECIPES, randomFrom, render, variantsOf } from './soundbank.js';

const NAMES = Object.keys(RECIPES);
const peakOf = (x) => { let p = 0; for (const s of x) p = Math.max(p, Math.abs(s)); return p; };

test('every take of every sound is real numbers, makes a noise and stays where it should', () => {
  for (const name of NAMES) for (let v = 0; v < variantsOf(name); v++) {
    const x = render(name, v), p = peakOf(x);
    assert.ok(x.length > RATE * .02, `${name} ${v} has length`);
    assert.ok(x.every(Number.isFinite), `${name} ${v} is finite`);
    assert.ok(p > .02, `${name} ${v} isn't silent`);
    assert.ok(p <= 1.0001, `${name} ${v} doesn't clip: ${p}`);
    assert.ok(Math.abs(p - RECIPES[name].peak) < .02, `${name} ${v} comes out at its peak: ${p}`);
  }
});

test('they come out the same every time', () => {
  for (const name of ['step.road', 'explosion', 'amb.wind', 'groan.hunt']) assert.deepEqual(render(name, 0), render(name, 0));
});

test('takes of a sound differ', () => {
  for (const name of NAMES) if (variantsOf(name) > 1) {
    const [a, b] = [render(name, 0), render(name, 1)];
    assert.ok(a.length !== b.length || a.some((s, i) => s !== b[i]), `${name} has two different takes`);
  }
});

test('a loop has no click where its ends meet', () => {
  for (const name of NAMES) if (RECIPES[name].loop) {
    const x = render(name, 0), jump = Math.abs(x[0] - x[x.length - 1]);
    let usual = 0; for (let i = 1; i < x.length; i++) usual += Math.abs(x[i] - x[i - 1]);
    usual /= x.length;
    assert.ok(jump < Math.max(usual * 12, .03), `${name} jumps ${jump} against ${usual}`);
  }
});

test('it has its own random numbers, so that it can\'t disturb the opening', () => {
  const a = randomFrom(1), b = randomFrom(1), c = randomFrom(2);
  assert.equal(a(), b());
  assert.notEqual(randomFrom(1)(), c());
  for (let i = 0; i < 1000; i++) { const r = a(); assert.ok(r >= 0 && r < 1); }
  for (const f of ['soundbank.js', 'sound.js']) assert.ok(!readFileSync(new URL(`./${f}`, import.meta.url), 'utf8').includes('Math.random'), `${f} doesn't use Math.random`);
});
