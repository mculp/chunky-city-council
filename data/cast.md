# The cast

`data/cast.json` holds everyone you can talk to: how they feel about you, what ties them together, and what they say. `src/people.js` runs it. `npm test` checks the file, and fails on anything that would only go wrong in play, like an option that goes nowhere or a conversation that can run out of answers.

To add someone: give them a `cast` entry, a dialogue node with the same id, a look in `data/looks.json`, and a rig in `NPCS` in `index.html`.

Robby's line is the owner's, word for word, and the whole point of it is that those words were only ever said the once. He says it one time, on `robbySaid`, which is remembered, and it isn't anywhere else in the data. A test holds that. Don't give him more, and see `docs/lore.md`.

Who these people are, and what they say, is the owner's. The words here came from the prototype unchanged, except Coop's directions to the tracks, which the new map made wrong. The meter changes that weren't in the prototype, and the ties, are starting values to tune.

## Top level

| Field | Type | What it is |
|---|---|---|
| `version` | number | Part of the save's key. Change it only if old saves can't be read any more. |
| `meters` | object | Each meter's name, with its `min` and `max`. |
| `remember` | string[] | Flags saved across sessions. All others last one run. |
| `renamed` | object | Old names of cast ids and remembered flags, each with what it's called now, so that a save from before a rename keeps what it had. Tre became Rocky and Miss Odessa became Miss Bobby this way. A rename has to point at someone, and the old name can't still be in use. |
| `cast` | object[] | Everyone. See below. |
| `ties` | object[] | How helping one person costs you with another. See below. |
| `events` | object | Named lists of effects that the game fires itself, like `swept` when the steps are done. |
| `dialogue` | object | Nodes by id. See below. |

## Meters

| Meter | Range | Meaning |
|---|---|---|
| `trust` | -3 to 3 | How much they'd stick their neck out for you. Nothing on the screen shows it: it's in how they talk to him and what they'll do for him. |
| `fear` | 0 to 3 | How wary of you they are. |
| `debt` | -12 to 12 | Above 0 you owe them, below 0 they owe you, counted in cans. |

Meters are kept with fractions, because a tie can move one by half a point, and shown rounded.

## `cast[]`

| Field | Type | What it is |
|---|---|---|
| `id` | string | Matches the rig's key in `NPCS` and the dialogue node you get by talking to them. |
| `name` | string | The name in dialogue. |
| `short` | string | The name in the panel. |
| `known` | boolean | Optional. Shows in the panel from the start. Anyone else appears once you've met them. |

## `ties[]`

| Field | Type | What it is |
|---|---|---|
| `when` | string | Whose meter went up. |
| `meter` | string | Which meter. |
| `then` | string | Who else that moves. |
| `factor` | number | How much it moves them, times the gain. -0.5 costs half a point per point gained. |

A tie only fires on a gain, and doesn't set off another tie. Falling out with one person earns nothing back with their rival.

## `dialogue`

A node is `{ who, lines, opts }`. The first of its `lines` whose `when` all hold is what gets said, so the last line has no conditions.

| Field | Type | What it is |
|---|---|---|
| `who` | string | The cast id speaking. |
| `lines[].when` | string[] | Optional. Conditions, which must all hold. |
| `lines[].say` | string | The words. |
| `lines[].do` | object[] | Optional. Effects, applied when the line is said. |
| `lines[].opts` | object[] | Optional. This line's answers, in place of the node's. |
| `opts[].say` | string | The words on the button. |
| `opts[].to` | string | Optional. The node it leads to. With neither `to` nor `do`, it ends the conversation. |
| `opts[].do` | string | Optional. Something the game does instead, from `ACTIONS` in `index.html`. Only `sweep` so far. |
| `opts[].when` | string[] | Optional. Conditions for showing it. At least one option on every line must have none. |

### Conditions

| Written | Holds when |
|---|---|
| `metCoop` | The flag is set. |
| `!metCoop` | The flag isn't set. |
| `has:bag` | You're carrying at least one. |
| `!has:bag` | You aren't. |
| `has:gerald` | Gerald's in his hand, which is Toni's to give and is in `data/toni.md`. Coop, Rocky and Miss Bobby each have one line for it, said once and remembered with `geraldCoop`, `geraldRocky` and `geraldBobby`, and while he has Gerald the button with someone to show him to says SHOW. |
| `coop.trust >= 1` | A meter compares, with `>=`, `<=`, `>`, `<` or `==`. |
| `beans >= 3` | Your beans compare, the same way. |
| `pantry > 0` | What the pantry would pay for the steps right now, the same way. |

### Effects

| Written | Does |
|---|---|
| `{ "set": "paid" }` | Sets a flag. |
| `{ "unset": "paid" }` | Clears a flag. |
| `{ "meter": "coop.trust", "by": 1 }` | Moves a meter. |
| `{ "item": "bag", "by": 1 }` | Adds or takes away an item. |
| `{ "beans": 3 }` | Adds beans. Only the count is shown, with nothing after it. |
| `{ "pantry": true }` | Adds what the pantry pays and takes it off its shelves. |

Any effect can have its own `when`, as with the first meeting that only counts once.

## The pantry

Miss Bobby pays for sweeping her steps, at her house by the town hall, out of the pantry she runs at the church on Church St, and what's on its shelves is what's left. `src/pantry.js` keeps it.

- The shelves hold 9 cans at most, and 2 more come in each day. She pays 3, or whatever's there if it's less.
- The steps want sweeping once a day. A day is the church signs' day, so it turns over at midnight in Mississippi when they change.
- Until Chapter 1's done she always has his three, however empty the shelves are, because a run can't reach 12 without them. That's `pantry` reading 3 while it lasts. The cans still come off the shelves.
- Once it's done, `swept` means the steps have been swept today, and comes off at midnight.
- It's saved under `chunky.pantry.v1`, with the day it was last looked at, how many cans there were and the day the steps were last swept. "Forget everyone" wipes it with the rest.

Sweeping every day runs the shelves down to what comes in, so after a week it's 2 a day. Left alone for a few days, they're full again. Every number is in `PANTRY` in `src/pantry.js`.

## Saving

Meters, `remember` flags and who you've met are saved in `localStorage` after every change, under `chunky.people.v1`. A fresh run of the chapter keeps them, and resets beans, items and all other flags, so a run can always reach 12. If storage is refused the game plays on and just doesn't remember. "Forget everyone" on the title screen wipes the save, and it's only there when there's a save to wipe.
