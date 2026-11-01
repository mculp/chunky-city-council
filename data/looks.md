# Looks

`data/looks.json` holds what everyone but the hero wears. `src/looks.js` draws it onto canvases when the game loads, and `index.html` puts those on the cast and the crowd. `npm test` checks the file.

The hero isn't in here. His hoodie and his taped head are his alone, and nobody else in the game gets them. See `docs/art-direction.md`.

The looks are our own reading of ten of the owner's references, chosen at random. They keep what those have in common: a chalk line, a crayon fill rather than scribble, and a skull drawn in the dark of the hood. Lettering on the references is left out.

## Top level

| Field | Type | What it is |
|---|---|---|
| `cast` | object | A look for each person, by the id they have in `data/cast.json`. |
| `crowd` | object[] | The looks the crowd is dressed in. Everyone in it gets one of these, and nobody in the cast shares one. |

## A look

| Field | Type | What it is |
|---|---|---|
| `id` | string | Unique. Seeds the drawing, so a look comes out the same every time. |
| `hood` | object | The cloth. See below. |
| `line` | object | The outline, and the ring around the opening. See below. |
| `skull` | object | What's in the hood. See below. Empty means the plain one. |
| `tassels` | object | `color`, and `tied` for a bow rather than two loose cords. |
| `mark` | object | Optional. A patch on the chest. See below. |

### `hood`

`pattern` is one of these, and `colors` is listed in the order shown.

| Pattern | Colors | What it looks like |
|---|---|---|
| `plain` | fill | Crayon in one colour. |
| `stripes` | base, stripe | Soft stripes running up the body and over the hood. |
| `bolts` | base, shard, shard | Broken shards scattered over a dark fill. |
| `ribs` | base, rib, spark | Ribs and a spine on a dark fill, with stray sparks. |

### `line`

| Field | Type | What it is |
|---|---|---|
| `color` | string | The colour. Also the skull's, unless `skull.line` says otherwise. |
| `style` | string | Optional. `glow` burns bright enough to bloom. `spikes` grows stiff hairs, and only works on the cast, whose bodies have the vertices for it. |

### `skull`

All of these are optional.

| Field | Type | What it is |
|---|---|---|
| `line` | string | Its colour, if it isn't the outline's. |
| `eyes` | string | `hollow` by default, `rings`, `x` or `shades`. |
| `accent` | string | The colour of an `x`. |
| `teeth` | string | `plain` by default, or `bloody`. |

### `mark`

| Field | Type | What it is |
|---|---|---|
| `kind` | string | `caution`, `flammable` or `radioactive`. These are generic hazard symbols with no lettering. |
| `color` | string | Its main colour. |
