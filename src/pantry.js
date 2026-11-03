// The pantry at the church on Church St: what's on its shelves, and whether Miss Bobby's steps want sweeping today. There's no
// three.js or page in here, so node tests load it too. data/cast.md says how it goes.
//
// A day is the church signs' day, from src/signs.js, so it turns over at midnight in Mississippi when they change.

// She pays for the steps out of what's on the shelves. They hold `most`, and `comesIn` more turn up each day.
export const PANTRY = { most: 9, comesIn: 2, pays: 3 };

export function createPantry({ store = null, key = 'chunky.pantry.v1' } = {}) {
  let stock = PANTRY.most, day = null, swept = null;
  // A save that can't be read counts as no save, and a browser that won't store anything just doesn't remember
  try {
    const saved = JSON.parse(store.getItem(key));
    if (Number.isInteger(saved.day)) { day = saved.day; stock = Math.max(0, Math.min(PANTRY.most, saved.stock | 0)); swept = Number.isInteger(saved.swept) ? saved.swept : null; }
  } catch { /* nothing saved */ }
  const save = () => { try { store.setItem(key, JSON.stringify({ day, stock, swept })); } catch { /* not stored */ } };
  // what's come in since it was last looked at. A clock that's gone back gets nothing for it, so nothing comes in twice.
  const upTo = (today) => {
    if (day === null) day = today;
    else if (today > day) { stock = Math.min(PANTRY.most, stock + PANTRY.comesIn * (today - day)); day = today; }
  };
  return {
    stock(today) { upTo(today); return stock; },
    // what she'd give him for the steps: nothing once they've been done today, and never more than's there
    owes(today) { upTo(today); return swept === today ? 0 : Math.min(PANTRY.pays, stock); },
    sweptOn: (today) => swept === today,
    // They're done: n come off the shelves, or whatever's left
    sweep(today, n) { upTo(today); stock = Math.max(0, stock - n); swept = today; save(); },
    forget() { stock = PANTRY.most; day = null; swept = null; try { store.removeItem(key); } catch { /* nothing to remove */ } },
  };
}
