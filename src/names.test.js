import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkName, isClean, NAME_MOST } from './names.js';

// The words that keep a name out are written ROT13'd here too, so reading the tests doesn't mean reading them
const rot13 = (s) => s.replace(/[a-z]/gi, (c) => { const a = c <= 'Z' ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - a + 13) % 26 + a); });

describe('what players are called', () => {
  test('ordinary names go through as they were typed', () => {
    for (const name of ['Matt', 'Miss Bobby', 'Jo-Ann', "O'Neal", 'Zoë', 'rektguy 1386', 'J.R.', 'Junebug']) assert.deepEqual(checkName(name), { ok: true, name });
  });

  test('spaces are run together and trimmed, and anything unprintable counts as a space', () => {
    assert.deepEqual(checkName('  Miss   Bobby '), { ok: true, name: 'Miss Bobby' });
    assert.deepEqual(checkName('Miss\tBobby\n'), { ok: true, name: 'Miss Bobby' });
  });

  test(`a name is 1 to ${NAME_MOST} long, after the spaces are tidied`, () => {
    assert.equal(checkName('A').ok, true);
    assert.equal(checkName('x'.repeat(NAME_MOST)).ok, true);
    assert.equal(checkName('x'.repeat(NAME_MOST + 1)).ok, false);
    assert.equal(checkName('').ok, false);
    assert.equal(checkName('    ').ok, false);
    assert.equal(checkName(null).ok, false);
    assert.match(checkName('').why, /name/i);
  });

  test("only letters, numbers, spaces, hyphens, apostrophes and full stops", () => {
    for (const name of ['Matt<b>', 'Matt 🎸', 'Matt_1', 'a/b', '#1386']) {
      const r = checkName(name);
      assert.equal(r.ok, false, name);
      assert.match(r.why, /letters/i, name);
    }
  });

  test('a word kept out of names is caught however it is dressed up', () => {
    const word = rot13('shpx');
    for (const name of [word, word.toUpperCase(), `${word}er`, 'F.U.C.K', 'f u c k', 'fuc k', 'fvck', 'FUUUCK', 'phuck', 'Big Fuck Truck']) {
      assert.equal(checkName(name).ok, false, name);
      assert.equal(isClean(name), false, name);
    }
    // In a name, scraps of two letters are read with what's beside them. Longer writing only joins single letters, or "go ok" would be a slur.
    assert.equal(checkName('Fu Ck').ok, false);
    assert.equal(isClean('go ok'), true);
    assert.equal(checkName(rot13('A1ttre')).ok, false, 'numbers that stand for letters');
    assert.equal(checkName(rot13('Avttn')).ok, false);
  });

  test("says what's wrong without repeating the word", () => {
    const r = checkName(rot13('shpx'));
    assert.equal(r.ok, false);
    assert.doesNotMatch(r.why, /f.?u.?c.?k/i);
  });

  test('the ones that turn up inside ordinary names only count as a whole word', () => {
    // and two words aren't read as one, unless one's a scrap of a word two letters or less
    for (const name of ['Hitchcock', 'Peacock', 'Dickens', 'Grape', 'Cucumber', 'Canal', 'Essex', 'Sexton', 'Nazir', 'Raccoon', 'Fagan', 'Swanky', 'Cocky', 'Mark Ike', 'Rich Inky'])
      assert.deepEqual(checkName(name), { ok: true, name }, name);
    for (const name of [rot13('Ovt Pbpx'), rot13('pbpx'), rot13('Encr Zr'), rot13('anmv'), rot13('xxx')]) assert.equal(checkName(name).ok, false, name);
  });

  test('mild words a PG-13 film has in it are allowed', () => {
    for (const name of ['Damn Yankee', 'Hell Raiser', 'Dumb Ass', 'Crap Shoot']) assert.equal(checkName(name).ok, true, name);
  });

  test('isClean judges any text players will see by the same words, at any length', () => {
    assert.equal(isClean('Meet me at the church on Church St, the one with the bell'), true);
    assert.equal(isClean(`this whole ${rot13('shpxvat')} town`), false);
    assert.equal(isClean(''), true);
  });
});
