// What stops anyone in a town everyone shares, and its raised floors, as src/solids.js has them. Whether they're the game's own is
// tools/solids.mjs's, in the game.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSolids } from './solids.js';
import { encodeParts, kindOf } from './wrecks.js';

const solids = (o = {}) => createSolids({ fixed: { boxes: [], walls: [] }, props: {}, buildings: {}, cast: {}, bar: [0, 0, 0, 0, 0, 0], ...o, floors: { rects: [], trestles: [], bridges: [], ...o.floors } });
const part = (n, gone = true) => ({ part: n, gone, cracked: !gone, burning: false, dir: 0, hp: 0, shade: 255 });

describe('what stops anyone', () => {
  test('a box stops anyone within .3 m of it, unless they\'re less than .25 m under its top', () => {
    const S = solids({ fixed: { boxes: [[0, 1, 0, 1, 1]], walls: [] } });
    assert.ok(S.stops(1.29, .5, 0)); assert.ok(!S.stops(1.31, .5, 0)); assert.ok(S.stops(.5, -.29, 0)); assert.ok(!S.stops(.5, -.31, 0));
    assert.ok(S.stops(.5, .5, .74)); assert.ok(!S.stops(.5, .5, .76));
  });

  test('a wall stops anyone within its radius and .3 m of its line, round its ends too', () => {
    const S = solids({ fixed: { boxes: [], walls: [[0, 0, 10, 0, 2.5, .1]] } });
    assert.ok(S.stops(5, .39, 0)); assert.ok(!S.stops(5, .41, 0)); assert.ok(S.stops(10.39, 0, 0)); assert.ok(!S.stops(10.41, 0, 0));
    assert.ok(S.stops(5, 0, 2.24)); assert.ok(!S.stops(5, 0, 2.26));
  });

  test('it\'s the same either side of where one cell ends and the next starts', () => {
    const S = solids({ fixed: { boxes: [[15, 17, -1, 1, 2]], walls: [[30, -5, 34, 5, 2, .1]] } });
    for (const x of [15.9, 16, 16.1]) assert.ok(S.stops(x, 0, 0), `the box at ${x}`);
    for (const z of [-.1, 0, .1]) assert.ok(S.stops(32, z, 0), `the wall at ${z}`);
  });

  test('the boards across the gas station\'s door only stop anyone while they\'re up', () => {
    const S = solids({ bar: [0, 0, 2, 0, 2.6, .12] });
    assert.ok(!S.stops(1, 0, 0)); S.barred(true); assert.ok(S.stops(1, 0, 0)); S.barred(false); assert.ok(!S.stops(1, 0, 0));
  });

  test('and the cast stand where they stand', () => {
    assert.ok(solids({ cast: { coop: [0, .8, 0, .8, 2] } }).stops(.4, .4, 0));
  });
});

describe('the floors raised off the ground', () => {
  test('a raised floor is as high as it is, the ground\'s nought, and nobody steps up more than .7 m', () => {
    const S = solids({ floors: { rects: [{ rect: [5, 5, 1, 0, 2, 1], top: .5 }, { rect: [15, 5, 1, 0, 2, 1], top: .8 }] } });
    assert.equal(S.floorAt(5, 5), .5); assert.equal(S.raised(5, 5), .5); assert.equal(S.raised(0, 0), null); assert.equal(S.floorAt(0, 0), 0);
    assert.ok(!S.blocked(5, 5, 0), 'half a metre is a step'); assert.ok(S.blocked(15, 5, 0), 'and .8 m isn\'t'); assert.ok(!S.blocked(15, 5, .2));
  });

  test('even where it\'s lower than the ground, a raised floor is raised, and that\'s where the water isn\'t', () => {
    const S = solids({ floors: { rects: [{ rect: [0, 0, 1, 0, 2, 1], top: -.2 }] } });
    assert.equal(S.raised(0, 0), -.2); assert.equal(S.floorAt(0, 0), -.2);
  });

  test('an oblong turned on the map, as the dock is', () => {
    const t = 8 * Math.PI / 180, ux = Math.cos(t), uz = Math.sin(t), S = solids({ floors: { rects: [{ rect: [0, 0, ux, uz, 6.55, 1], top: .2 }] } });
    const at = (u, v) => S.raised(ux * u - uz * v, uz * u + ux * v);
    assert.equal(at(6.5, 0), .2); assert.equal(at(6.6, 0), null); assert.equal(at(0, .95), .2); assert.equal(at(0, 1.05), null);
  });

  test('a trestle is near enough the railroad within its reach of its middle, or in the refuge halfway over', () => {
    const S = solids({ floors: { trestles: [{ at: [0, 0, 34], half: 1.45, rail: [[-40, 0, 40, 0]], refuge: [0, 2.7, 1.55], top: .1 }] } });
    assert.equal(S.raised(10, 1.4), .1); assert.equal(S.raised(10, 1.5), null); assert.equal(S.raised(33.9, 0), .1); assert.equal(S.raised(34.1, 0), null);
    assert.equal(S.raised(0, 4.2), .1, 'in the refuge'); assert.equal(S.raised(0, 4.3), null);
  });

  test('a road bridge has its deck where the road is, and its rails a metre wide either side, from on the deck', () => {
    const S = solids({ floors: { bridges: [{ at: [0, 0, 28], half: 3.65, deck: 0, roads: [[-60, 0, 60, 0, 3.65]] }] } });
    assert.equal(S.raised(0, 3.6), 0); assert.equal(S.raised(0, 3.7), null); assert.equal(S.raised(29, 0), null, 'off the bridge, it\'s the road');
    assert.ok(S.rails(0, 4, 0)); assert.ok(!S.rails(0, 3.6, 0)); assert.ok(!S.rails(0, 4.7, 0)); assert.ok(!S.rails(29, 4, 0)); assert.ok(!S.rails(0, 4, -1.1), 'from down by the water');
    assert.ok(S.stops(0, 4, 0), 'and they stop anyone, as walls do');
  });
});

describe('what\'s broken, as the wire says it', () => {
  test('a prop goes over by its key and comes back healed, and a floor that\'s its own goes with it', () => {
    const S = solids({ props: { 'pfence:1:2': { boxes: [], walls: [[0, 0, 1, 0, 1.2, .06]] } }, floors: { rects: [{ k: 'pdock:3:4', rect: [10, 0, 1, 0, 2, 1], top: .2 }] } });
    assert.ok(S.stops(.5, 0, 0)); S.take({ k: 'pfence:1:2', x: 0, z: 0, d: 0 }); assert.ok(!S.stops(.5, 0, 0)); S.heal('pfence:1:2'); assert.ok(S.stops(.5, 0, 0));
    S.take({ k: 'pdock:3:4' }); assert.equal(S.raised(10, 0), null); S.heal('pdock:3:4'); assert.equal(S.raised(10, 0), .2);
  });

  test('a building loses the parts that are gone and keeps the ones that are only cracked, and comes back healed', () => {
    const S = solids({ buildings: { 7: { n: 5, walls: [[2, 0, 0, 4, 0, 3, .1], [4, 4, 0, 4, 4, 3, .1], [1, 0, 4, 4, 4, 3, .1]] } } });
    S.take({ k: 'b7', n: 5, p: encodeParts([part(2), part(1, false)]) });
    assert.ok(!S.stops(2, 0, 0), 'what\'s gone'); assert.ok(S.stops(4, 2, 0), 'what wasn\'t said'); assert.ok(S.stops(2, 4, 0), 'and what\'s only cracked');
    S.heal('b7'); assert.ok(S.stops(2, 0, 0));
  });

  test('one written in a different number of parts, or with parts that aren\'t parts, or some other kind of thing, changes nothing', () => {
    const S = solids({ buildings: { 7: { n: 5, walls: [[2, 0, 0, 4, 0, 3, .1]] } } });
    S.take({ k: 'b7', n: 6, p: encodeParts([part(2)]) }); S.take({ k: 'b7', n: 5, p: 'not base64!' }); S.take({ k: 'b7', n: 5 }); S.take({ k: 't1:2' }); S.take(null);
    assert.ok(S.stops(2, 0, 0));
  });
});

describe('data/solids.json', () => {
  const data = JSON.parse(readFileSync(new URL('../data/solids.json', import.meta.url), 'utf8')), S = createSolids(data);

  test('everything in it is known by a key the wire knows', () => {
    for (const k of Object.keys(data.props)) assert.equal(kindOf(k), 'p', k);
    for (const id of Object.keys(data.buildings)) assert.equal(kindOf(`b${id}`), 'b', id);
    for (const f of data.floors.rects) if (f.k) assert.equal(kindOf(f.k), 'p', f.k);
  });

  test('every building\'s walls and posts are its own parts, and every one of them stops anyone standing beside it', () => {
    let n = 0;
    for (const { n: parts, walls } of Object.values(data.buildings)) for (const [p, ax, az, bx, bz] of walls) {
      assert.ok(Number.isInteger(p) && p >= 0 && p < parts);
      assert.ok(S.stops((ax + bx) / 2, (az + bz) / 2, S.floorAt((ax + bx) / 2, (az + bz) / 2)), `${ax}, ${az}`); n++;
    }
    assert.ok(n > 20000 && Object.keys(data.buildings).length > 1000, `${n} walls`);
  });

  test('the town\'s floors are a step up or none at all, and the dock goes with a prop', () => {
    const { rects, trestles, bridges } = data.floors;
    for (const f of [...rects, ...trestles]) assert.ok(f.top >= 0 && f.top < .7, f.top);
    for (const b of bridges) assert.ok(Math.abs(b.deck) < .1, b.deck);
    assert.ok(rects.some((f) => f.k?.startsWith('pdock:')) && trestles.length === 3 && bridges.length >= 5);
  });
});
