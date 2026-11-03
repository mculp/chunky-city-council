import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPantry, PANTRY } from './pantry.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const DAY = 20759;

describe('the pantry', () => {
  test('starts with full shelves, and three for the steps', () => {
    const p = createPantry();
    assert.equal(p.stock(DAY), PANTRY.most);
    assert.equal(p.owes(DAY), 3);
  });

  test('the steps want sweeping once a day', () => {
    const p = createPantry();
    p.sweep(DAY, p.owes(DAY));
    assert.equal(p.stock(DAY), PANTRY.most - 3);
    assert.equal(p.owes(DAY), 0);
    assert.ok(p.sweptOn(DAY));
    assert.ok(!p.sweptOn(DAY + 1));
    assert.equal(p.owes(DAY + 1), 3, 'the next day they want it again');
    assert.equal(p.stock(DAY + 1), PANTRY.most - 3 + PANTRY.comesIn, 'and some more has come in');
  });

  test('sweeping every day runs it down to what comes in', () => {
    const p = createPantry(), paid = [];
    for (let d = DAY; d < DAY + 12; d++) { const n = p.owes(d); paid.push(n); p.sweep(d, n); }
    assert.deepEqual(paid.slice(0, 3), [3, 3, 3]);
    assert.ok(paid.slice(-3).every((n) => n === PANTRY.comesIn), paid.join(' '));
  });

  test('left alone it fills back up, and no further', () => {
    const p = createPantry();
    p.sweep(DAY, 3);
    assert.equal(p.stock(DAY + 30), PANTRY.most);
  });

  test('more can come off than she pays, when the game says so, but never more than is there', () => {
    const p = createPantry();
    for (let i = 0; i < 4; i++) p.sweep(DAY, 3);
    assert.equal(p.stock(DAY), 0);
    assert.equal(p.owes(DAY), 0, 'swept and empty');
    assert.equal(p.owes(DAY + 1), PANTRY.comesIn, 'only what came in');
    assert.equal(p.owes(DAY + 2), 3, 'two days of it');
  });

  test('it remembers, between one visit and the next', () => {
    const store = memory(), a = createPantry({ store });
    a.sweep(DAY, 3);
    const b = createPantry({ store });
    assert.equal(b.stock(DAY), PANTRY.most - 3);
    assert.ok(b.sweptOn(DAY));
    b.forget();
    assert.equal(store.m.size, 0);
    assert.equal(createPantry({ store }).owes(DAY), 3);
  });

  test('a store that refuses, or a save that makes no sense, is no save', () => {
    const refusing = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
    const p = createPantry({ store: refusing });
    p.sweep(DAY, 3); p.forget();
    const odd = memory(); odd.setItem('chunky.pantry.v1', '{"day":"x","stock":40}');
    assert.equal(createPantry({ store: odd }).stock(DAY), PANTRY.most);
    const big = memory(); big.setItem('chunky.pantry.v1', JSON.stringify({ day: DAY, stock: 40 }));
    assert.equal(createPantry({ store: big }).stock(DAY), PANTRY.most);
  });

  test('a clock that goes back gets nothing for it, there or on the way forward again', () => {
    const p = createPantry();
    p.sweep(DAY, 3);
    assert.equal(p.stock(DAY - 5), PANTRY.most - 3);
    assert.equal(p.stock(DAY - 4), PANTRY.most - 3);
    assert.equal(p.stock(DAY), PANTRY.most - 3);
    assert.equal(p.stock(DAY + 1), PANTRY.most - 3 + PANTRY.comesIn);
  });
});
