# Looks

`data/looks.json` holds what everyone but the hero had on, and how far gone each of the cast is. `src/looks.js` draws it onto canvases when the game loads, and `index.html` puts those on the cast and the crowd. `npm test` checks the file.

The hero isn't in here. His hoodie and his taped head are his alone, and nobody else in the game gets them or wears a hood. See `docs/art-direction.md`.

Everyone in here is a radiating zombie of some degree, which is the owner's word for it, in `docs/lore.md`. What they're wearing is invented, as ordinary clothes for around here. There's no lettering on anything.

## Top level

| Field | Type | What it is |
|---|---|---|
| `cast` | object | A look for each person, by the id they have in `data/cast.json`. |
| `crowd` | object[] | The looks the crowd is dressed in. Everyone in it gets one of these, and nobody in the cast shares one. |

## A look

| Field | Type | What it is |
|---|---|---|
| `id` | string | Unique. Seeds the drawing, so a look comes out the same every time. |
| `degree` | number | The cast only. How far gone they are, from 0, which is not at all, to 1. The crowd's are worked out person by person (`degreeOf`), and `farOf` keeps the ones who've burnt down the furthest gone of all, which `data/folks.md` explains. |
| `skin` | string | The colour of their skin. They've all gone a little grey. |
| `hair` | string | Optional. Without it they're bald. |
| `top` | object | What's on top. See below. |
| `bottom` | object | `kind` is `trousers`, `shorts` or `skirt`, and `color` is its colour. |
| `shoes` | string | The colour of their shoes. |
| `mark` | object | Optional. A patch on the chest. See below. |
| `line` | string | Optional. The colour of their outline, for someone it isn't burning in, like a ghost. Otherwise it goes by how far gone they are. |

### `top`

`kind` is one of these, and `colors` is listed in the order shown.

| Kind | Colors | What it looks like |
|---|---|---|
| `tee` | shirt, and optionally stripes | A T-shirt. |
| `flannel` | shirt, bands, and optionally a thin line | A big plaid, with long sleeves and buttons. |
| `overalls` | shirt, denim | A T-shirt under a bib and straps. Their legs are the denim. |
| `camo` | base, and up to three blotches | A long-sleeved jacket. `vest` is optional, and it's the colour of a hunter's vest over it. |
| `coveralls` | cloth | One piece, with a zip and two chest pockets. Their legs are the cloth too. |
| `dress` | cloth, and optionally flowers and a collar | A short-sleeved dress. |
| `none` | nothing | No shirt, and ribs. |

### `mark`

| Field | Type | What it is |
|---|---|---|
| `kind` | string | `caution`, `flammable` or `radioactive`. These are generic hazard symbols with no lettering. |
| `color` | string | Its main colour. |
