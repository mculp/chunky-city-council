// What players are called, and the PG-13 check for anything players type that others will see. There's no three.js or page in
// here, so the town server runs the same check as the phone.
//
// A name is 1 to 16 letters, numbers, spaces, hyphens, apostrophes and full stops. The words that keep text out are below in
// ROT13, so that reading this file doesn't mean reading them. They're slurs, sex and the two strongest swear words, which is
// what a PG-13 film leaves out; damn, hell, ass and the like stay in. Look-alikes are read as letters first (0 as o, 3 as e,
// $ as s, ph as f, v as u), letters doubled up still count, and letters spelt out one at a time (f.u.c.k) are read as one
// word. Some of the words turn up inside ordinary names, like Hitchcock, Dickens, grape and Essex, so those only count as a
// whole word. Nothing this simple is complete, and it's a list to add to.
export const NAME_MOST = 16;

const rot13 = (s) => s.replace(/[a-z]/g, (c) => String.fromCharCode((c.charCodeAt(0) - 97 + 13) % 26 + 97));
// anywhere, even inside another word
const INSIDE = 'shpx phag avttre avttn snttbg xvxr puvax ergneq jubre cbea wvmm qvyqb oybjwbo unaqwbo phzfubg pbpxfhpx uvgyre jrgonpx enturnq gbjryurnq gjng juvgrcbjre';
// only as a word of its own
const WHOLE = 'pbpx pbpxf phz nany nahf encr encrq encrf encvfg snt sntf fcvp fcvpf fcvpx xxx anmv anmvf urvy fvrt gvgf gvggl gvggvrf obbo obbof obbovrf cravf intvan frk frkl fyhg fyhgf fyhggl chffl chffvrf genaal genaavrf ornare tbbx tbbxf pbba pbbaf qlxr ubzb ubzbf arteb wnc wncf jbc jnax jnaxre jnaxref';

const LEET = { 0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };
const letters = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ph/g, 'f')
  .replace(/[0-9@$!|+]/g, (c) => LEET[c]).replace(/v/g, 'u').replace(/[^a-z]/g, '');
// each letter of a word as many times over as anyone likes
const pattern = (word, whole) => { const p = [...letters(word)].map((c) => `${c}+`).join(''); return new RegExp(whole ? `^${p}$` : p); };
const INSIDE_RX = rot13(INSIDE).split(' ').map((w) => pattern(w, false)), WHOLE_RX = rot13(WHOLE).split(' ').map((w) => pattern(w, true));
const BETWEEN = /[\s.,'’`"\-_:;/\\()[\]{}<>*#~^&%=?]+/;

// Every word, and every scrap of a word read with the words beside it: single letters always (f.u.c.k), and in a name anything
// of two letters or less (fu ck). Two whole words are never read as one, or Mark Ike would be a slur.
function clean(text, scrap) {
  if (/14\s*88/.test(text)) return false;
  const raw = text.split(BETWEEN).filter(Boolean), words = raw.map(letters);
  for (let i = 0; i < raw.length; i++) {
    let run = raw[i], j = i;
    while (j + 1 < raw.length && (raw[j].length <= scrap || raw[j + 1].length <= scrap)) run += raw[++j];
    if (j > i) { words.push(letters(run)); i = j; }
  }
  return !words.some((w) => w && (INSIDE_RX.some((rx) => rx.test(w)) || WHOLE_RX.some((rx) => rx.test(w))));
}

// The PG-13 check by itself, for anything players write that others will read
export const isClean = (text) => clean(String(text ?? ''), 1);

// `{ ok: true, name }` with the spaces tidied, or `{ ok: false, why }` with something to tell them that doesn't repeat the word
export function checkName(raw) {
  const name = String(raw ?? '').replace(/[\p{C}\s]+/gu, ' ').trim();
  if (!name || [...name].length > NAME_MOST) return { ok: false, why: `Pick a name from 1 to ${NAME_MOST} letters long` };
  if (!/^[\p{L}\p{M}\p{N} .'’-]+$/u.test(name)) return { ok: false, why: 'Names can only have letters, numbers, spaces, hyphens, apostrophes and full stops' };
  if (!clean(name, 2)) return { ok: false, why: 'Pick a different name' };
  return { ok: true, name };
}
