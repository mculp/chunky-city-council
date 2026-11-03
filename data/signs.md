# The church signs

`data/signs.json` is what's on the letter board at every church, and which church is where. `src/signs.js` works out who says what on which day and paints it, and `index.html` stands them up, under "the church signs". `npm test` checks the file. `#signs` shows every line on one page, painted as it'd be on the board.

This is the owner's to change: edit a line and it's changed. `docs/lore.md` has what they asked for.

## Top level

| Field | Type | What it is |
|---|---|---|
| `version` | number | The schema's version. |
| `churches` | object[] | One for each sign. See below. |
| `feudEvery` | number | Every this many days they argue, using the next of `feuds`. |
| `feuds` | object[] | What they say to each other, by church id. A church that isn't in one says the next thing on the sheet. |
| `lines` | string[][] | Everything else. Each one's a list of rows. |

## `churches[]`

| Field | Type | What it is |
|---|---|---|
| `id` | string | How `feuds` refers to it, and what its letters' unevenness comes from. |
| `name` | string[] | The header, in one or two rows. Invented, because the signs carry veiled threats and these are real congregations. |
| `x`, `z` | number | Where it stands, in true metres from town center. |
| `facing` | number | The way its front looks, in degrees: 0 north, 90 east. The back's the same. They stand side-on to the road, as the real ones here do. |

## A line

At most 4 rows of at most 18 letters, from A to Z, 0 to 9 and spaces. Those are measured off the fullest of the photos, and a test holds them to it. There's no punctuation, because the photos don't have any: `IF WERE NOT` is how those signs do an apostrophe. Fewer rows come out bigger. A `3` for an `E` or `VV` for a `W` is what happens when the box of letters runs out.

No two churches say the same thing on the same day, and nothing comes round again until the sheet has. At 117 lines and three churches that's 39 days.

## What can't go on it

- A real brand, including a pun on one.
- Slang from the last ten years or so.
- Robby's line. Those words only got said once.
- What the crowd are. A sign can be scared of them, but it doesn't know.
