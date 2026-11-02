import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actWord, buttonsFor, fastWord, keysFor } from './controls.js';

const REAL_KEYS = new Set(['WASD', 'W', 'S', 'A D', 'SHIFT', 'SPACE', 'E', 'F', 'Q', 'R', 'M', 'DRAG']);
const MODES = ['title', 'hang', 'fall', 'swim', 'land', 'bridge', 'town', 'drive', 'grabbed', 'sweep', 'dialog', 'fail', 'end'];

test('a keyboard is only ever told about keys it has', () => {
  for (const mode of MODES) for (const [key] of keysFor(mode, { act: 'Talk to Coop', map: true, thrown: { name: 'bottle', word: 'BOTTLE', n: 2, more: true } })) assert.ok(REAL_KEYS.has(key), `${mode}: ${key}`);
});

test('a prompt never asks a keyboard for a button', () => {
  assert.equal(actWord('CUT', false), 'E');
  assert.equal(fastWord(false), 'SPACE');
});

test('on foot, the keys say move, run and jump', () => {
  for (const mode of ['land', 'bridge', 'town']) assert.deepEqual(keysFor(mode).slice(0, 3), [['WASD', 'Move'], ['SHIFT', 'Run'], ['SPACE', 'Jump']]);
});

test('E only shows when there\'s something to use it on', () => {
  assert.ok(!keysFor('town').some(([k]) => k === 'E'));
  assert.ok(keysFor('town', { act: 'Talk to Coop' }).some(([k, what]) => k === 'E' && what === 'Talk to Coop'));
});

test('the map key is only there once there\'s a map', () => {
  assert.ok(!keysFor('land').some(([k]) => k === 'M'));
  assert.ok(keysFor('town', { map: true }).some(([k]) => k === 'M'));
});

test('the opening has no strip, just the prompt', () => {
  for (const mode of ['title', 'hang', 'fall', 'bitten', 'dream', 'wake']) assert.deepEqual(keysFor(mode), []);
});

test('in the water the phone\'s one button swims faster, and nothing else is on screen', () => {
  assert.deepEqual(buttonsFor('swim'), { a: null, b: 'SWIM FAST', run: false });
});

test('a phone\'s act button says what it does, and it\'s gone when it does nothing', () => {
  assert.equal(buttonsFor('hang').a, 'CUT');
  assert.equal(buttonsFor('grabbed').a, 'FREE');
  assert.equal(buttonsFor('sweep').a, 'SWEEP');
  assert.equal(buttonsFor('town').a, 'SWING');
  assert.equal(buttonsFor('land').a, null);
  assert.equal(buttonsFor('bridge').a, null);
  assert.equal(buttonsFor('town', { act: 'Talk to Coop' }).a, 'TALK');
  assert.equal(buttonsFor('town', { act: 'Play the drums' }).a, 'PLAY');
  assert.equal(buttonsFor('town', { act: 'Bump the ball' }).a, 'BUMP');
  assert.equal(buttonsFor('town', { act: 'Take the bat' }).a, 'TAKE');
  assert.equal(buttonsFor('town', { act: 'Look at the screen' }).a, 'LOOK');
  assert.equal(buttonsFor('town', { act: 'Back' }).a, 'BACK');
  assert.equal(buttonsFor('town', { act: 'Read the stone' }).a, 'READ');
});

test('near something to drive, the button says so, and driving has its own controls', () => {
  assert.equal(buttonsFor('town', { act: 'Get in the pickup' }).a, 'GET IN');
  assert.deepEqual(buttonsFor('drive'), { a: 'GET OUT', b: 'BRAKE', run: false });
  assert.deepEqual(keysFor('drive').map(([k]) => k), ['W', 'S', 'A D', 'SPACE', 'E', 'DRAG']);
  assert.ok(keysFor('town', { act: 'Get in the pickup' }).some(([k, what]) => k === 'E' && what === 'Get in the pickup'));
});

test('at the skillet, the button eats', () => {
  assert.equal(buttonsFor('town', { act: 'Eat the deer meat' }).a, 'EAT');
  assert.ok(keysFor('town', { act: 'Eat the deer meat' }).some(([k, what]) => k === 'E' && what === 'Eat the deer meat'));
});

test('prompts on a phone use the word on the button', () => {
  for (const mode of MODES) { const label = buttonsFor(mode).a; if (label) assert.equal(actWord(label, true), label); }
  assert.equal(fastWord(true), buttonsFor('swim').b);
});

test('he swings in town, and only has something to throw once he\'s carrying it', () => {
  assert.ok(keysFor('town').some(([k, what]) => k === 'F' && what === 'Swing'));
  assert.ok(!keysFor('bridge').some(([k]) => k === 'F'));
  assert.ok(!keysFor('town').some(([k]) => k === 'Q'));
  const gas = { name: 'gas', word: 'GAS', n: 2 };
  assert.ok(keysFor('town', { thrown: gas }).some(([k, what]) => k === 'Q' && what === 'Throw gas (2)'));
  assert.equal(buttonsFor('town').c, null);
  assert.equal(buttonsFor('town', { thrown: gas }).c, 'GAS 2');
  assert.equal(buttonsFor('bridge', { thrown: gas }).c, null);
});

test('he can only switch what he\'s throwing if there\'s something to switch to', () => {
  const one = { name: 'gas', word: 'GAS', n: 2 }, two = { ...one, more: true };
  assert.ok(!keysFor('town', { thrown: one }).some(([k]) => k === 'R'));
  assert.ok(keysFor('town', { thrown: two }).some(([k, what]) => k === 'R' && what === 'Switch'));
  assert.ok(!buttonsFor('town', { thrown: one }).swap);
  assert.ok(buttonsFor('town', { thrown: two }).swap);
  assert.ok(!buttonsFor('bridge', { thrown: two }).swap);
});
