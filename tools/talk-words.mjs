// Prints what data/talk.json's `blocked` keeps for each word it's given, so that a word that isn't PG-13 can be kept out of what the
// characters say without being written out anywhere in the game. The checker takes a word's ending off before it looks, so give it the
// word itself: "fuss" would cover "fussed" and "fussing" too.
//
//   node tools/talk-words.mjs word [word…]
import { wordHash } from '../src/talk.js';

const words = process.argv.slice(2).map((w) => w.toLowerCase().replace(/[^a-z]/g, '')).filter(Boolean);
if (!words.length) { console.error('Give it the words.'); process.exit(1); }
console.log(JSON.stringify(words.map(wordHash)));
