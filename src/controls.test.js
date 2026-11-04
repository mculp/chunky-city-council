import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actWord, buttonsFor, edgeTurn, fastWord, keysFor, lookBy, MOUSE, mouseLooks, needsCursor } from './controls.js';

const REAL_KEYS = new Set(['WASD', 'W', 'S', 'A D', 'SHIFT', 'SPACE', 'E', 'F', 'Q', 'R', 'C', 'M', 'CLICK', 'RIGHT CLICK', 'WHEEL', 'MOUSE']);
const MODES = ['title', 'hang', 'fall', 'swim', 'land', 'bridge', 'town', 'drive', 'grabbed', 'sweep', 'dialog', 'fail', 'end'];

test('a keyboard is only ever told about keys it has', () => {
  for (const mouse of [false, true]) for (const mode of MODES) for (const [key] of keysFor(mode, { act: 'Talk to Coop', map: true, mouse, thrown: { name: 'bottle', word: 'BOTTLE', n: 2, more: true } })) assert.ok(REAL_KEYS.has(key), `${mode}: ${key}`);
});

test('in town he can shamble along with them once they\'re out, and stop, and only on foot', () => {
  assert.ok(keysFor('town', { crowd: true }).some(([k, what]) => k === 'C' && what === 'Shamble'));
  assert.ok(keysFor('town', { crowd: true, shambling: true }).some(([k, what]) => k === 'C' && what === 'Stop shambling'));
  for (const mode of ['land', 'bridge', 'swim', 'drive', 'grabbed']) assert.ok(!keysFor(mode, { crowd: true }).some(([k]) => k === 'C'), mode);
  assert.equal(buttonsFor('town', { crowd: true }).shamble, true);
  for (const mode of ['land', 'swim', 'drive', 'grabbed']) assert.ok(!buttonsFor(mode, { crowd: true }).shamble, mode);
});

test('there\'s nobody to shamble along with before the crowd\'s out, in Chapter 1 or in a town that\'s shared', () => {
  assert.ok(!keysFor('town').some(([k]) => k === 'C'));
  assert.equal(buttonsFor('town').shamble, false);
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
  assert.deepEqual(keysFor('drive').map(([k]) => k), ['W', 'S', 'A D', 'SPACE', 'E', 'CLICK']);
  assert.deepEqual(keysFor('drive', { mouse: true }).map(([k]) => k), ['W', 'S', 'A D', 'SPACE', 'E', 'MOUSE']);
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

test('with Gerald in his hand there\'s no swinging, but he can still throw, show him to people and let him go', () => {
  const gas = { name: 'gas', word: 'GAS', n: 2 };
  for (const mouse of [false, true]) assert.ok(!keysFor('town', { full: true, mouse }).some(([, what]) => what === 'Swing'), `mouse ${mouse}`);
  assert.ok(keysFor('town', { full: true, thrown: gas }).some(([k]) => k === 'Q'));
  assert.ok(keysFor('town', { full: true, act: 'Let Gerald go' }).some(([k, what]) => k === 'E' && what === 'Let Gerald go'));
  assert.equal(buttonsFor('town', { full: true }).a, null);
  assert.equal(buttonsFor('town', { full: true, thrown: gas }).c, 'GAS 2');
  assert.equal(buttonsFor('town', { full: true, act: 'Show Gerald to Coop' }).a, 'SHOW');
  assert.equal(buttonsFor('town', { full: true, act: 'Let Gerald go' }).a, 'LET GO');
  assert.equal(buttonsFor('town', { full: true, act: 'Talk to Rocky' }).a, 'TALK');
  assert.equal(buttonsFor('town', { full: true, crowd: true }).shamble, true);
});

test('he can only switch what he\'s throwing if there\'s something to switch to', () => {
  const one = { name: 'gas', word: 'GAS', n: 2 }, two = { ...one, more: true };
  assert.ok(!keysFor('town', { thrown: one }).some(([k]) => k === 'R'));
  assert.ok(keysFor('town', { thrown: two }).some(([k, what]) => k === 'R' && what === 'Switch'));
  assert.ok(!buttonsFor('town', { thrown: one }).swap);
  assert.ok(buttonsFor('town', { thrown: two }).swap);
  assert.ok(!buttonsFor('bridge', { thrown: two }).swap);
});

test('until the mouse has been taken the strip says how, and once it has, it says what it does', () => {
  const gas = { name: 'gas', word: 'GAS', n: 2, more: true };
  const before = keysFor('town', { thrown: gas }), after = keysFor('town', { thrown: gas, mouse: true });
  assert.deepEqual(before.at(-1), ['CLICK', 'Look with the mouse']);
  assert.deepEqual(after.at(-1), ['MOUSE', 'Look']);
  assert.ok(after.some(([k, what]) => k === 'CLICK' && what === 'Swing'));
  assert.ok(after.some(([k, what]) => k === 'RIGHT CLICK' && what === 'Throw gas (2)'));
  assert.ok(after.some(([k, what]) => k === 'WHEEL' && what === 'Switch'));
  assert.ok(!after.some(([k]) => k === 'F' || k === 'Q' || k === 'R'));
});

test('the mouse turns the way it goes, and the camera stops at the ground and overhead', () => {
  const cam = { yaw: 0, pitch: .3 };
  lookBy(cam, 100, 0);
  assert.ok(Math.abs(cam.yaw + 100 * MOUSE.yaw) < 1e-9, 'to the right, which takes yaw down');
  assert.equal(cam.pitch, .3);
  lookBy(cam, 0, 50);
  assert.ok(Math.abs(cam.pitch - (.3 + 50 * MOUSE.pitch)) < 1e-9, 'down, which looks down');
  lookBy(cam, 0, 1000); lookBy(cam, 0, 1000);
  assert.equal(cam.pitch, MOUSE.high);
  lookBy(cam, 0, -1000); lookBy(cam, 0, -1000); lookBy(cam, 0, -1000);
  assert.equal(cam.pitch, MOUSE.low);
  const fast = { yaw: 0, pitch: 0 }; lookBy(fast, 10, 0, 2);
  assert.ok(Math.abs(fast.yaw + 20 * MOUSE.yaw) < 1e-9, 'twice as fast');
  const jump = { yaw: 0, pitch: 0 }; lookBy(jump, 100000, 0);
  assert.ok(Math.abs(jump.yaw) <= MOUSE.most * MOUSE.yaw + 1e-9, 'one big jump is cut down to size');
});

test('without the mouse taken, it keeps turning up against either side, and not in the middle', () => {
  assert.equal(edgeTurn(640, 1280), 0);
  assert.equal(edgeTurn(100, 1280), 0);
  assert.ok(edgeTurn(0, 1280) > 2, 'to the left, which takes yaw up');
  assert.ok(edgeTurn(1280, 1280) < -2, 'to the right');
  assert.ok(edgeTurn(10, 1280) > edgeTurn(40, 1280), 'faster the closer it gets');
  assert.equal(edgeTurn(0, 1280), -edgeTurn(1280, 1280));
});

test('talking, the map and the cards need a cursor, and the story\'s own camera isn\'t looked around with', () => {
  for (const mode of ['title', 'dialog', 'end']) assert.ok(needsCursor(mode), mode);
  // and the fever when a try ends is the story's, with nothing to click on, so he keeps the mouse through it
  for (const mode of ['land', 'bridge', 'town', 'drive', 'swim', 'hang', 'fall', 'grabbed', 'sweep', 'bitten', 'dream', 'wake', 'fail']) assert.ok(!needsCursor(mode), mode);
  assert.ok(needsCursor('town', true), 'the map');
  for (const mode of ['land', 'bridge', 'town', 'drive', 'swim', 'fall', 'grabbed', 'sweep']) assert.ok(mouseLooks(mode), mode);
  for (const mode of ['title', 'hang', 'bitten', 'dream', 'wake', 'dialog', 'fail', 'end']) assert.ok(!mouseLooks(mode), mode);
  assert.ok(!mouseLooks('town', true));
});
