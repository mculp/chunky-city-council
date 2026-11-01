# Structures

`data/structures.json` holds every real building within reach of the game's roads and railroad: where it stands, the shape of its footprint, and what it looks like. `tools/build_structures.py` generates it. `src/structures.js` turns each one into walls, windows, doors and a roof when the camera comes near. `npm test` checks the file.

## Where it comes from

| What | Source | Licence |
|---|---|---|
| Footprints, positions and use | [USA Structures](https://www.arcgis.com/home/item.html?id=0ec8512ad21e4bb987d7e848d14e7e24), by Oak Ridge National Laboratory (ORNL) and the Federal Emergency Management Agency (FEMA) Geospatial Response Office | CC BY 4.0 |
| Roof colours | [National Agriculture Imagery Program](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer), USDA | Public domain |
| Walls, roof shape, floors, porches | Written down in `tools/structure_notes.json` from looking at Street View | Our own notes |

**Credit.** The footprints are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Anything shipping this data has to keep the credit above and say that we've changed it: we clip a few footprints, move them along compressed road and add what they look like.

**Street View is looked at, not copied.** Nothing is traced or measured from it and no imagery is committed. The notes are words, such as "brick" or "front porch". They hold no business names, people's names or street addresses, because most of these are someone's home.

USA Structures doesn't include anything under 450 sq ft, and its height and outbuilding fields are empty here. So the height of a building comes from its floors and sheds smaller than that aren't in the file.

## Regenerating it

```sh
.venv/bin/python tools/build_structures.py [--refresh]
```

Downloads are cached in `data/raw/structures/`, which is gitignored. `--refresh` fetches them again. It needs nothing from pip beyond what `tools/requirements.txt` already lists, and it reads the aerial's PNGs with the standard library.

## What's kept

Everything within 280 m of a road or the railroad, in game coordinates, which is the reach of `MAP.inBounds`. What's further out is counted in `outsideTheMap`.

A footprint never changes shape or size. Where the map compresses a stretch of road, a building's middle moves with the road and the rest of it stays rigid, so buildings there can end up in each other's way. They're placed in this order, and whatever doesn't fit goes in `dropped` with the reason:

1. What's been looked at.
2. What isn't a house, a mobile home or a shed.
3. Whatever's nearest the road.

| `why` | What it means |
|---|---|
| `crowded` | A compressed stretch of road pushed it into another building. |
| `road` | A compressed stretch of road pushed it onto a road. |
| `track` | It would stand on the railroad. |
| `river` | It would stand in the river, on a bend the map has moved. |
| `opening` | Within 150 m of Stuckey's Bridge in both directions, which has to stay as it was for the opening. |
| `gone` | Someone looked and it isn't there any more. |

## The file

| Field | Type | What it is |
|---|---|---|
| `version` | number | The schema's version. |
| `units` | string | `m`. |
| `source` | object | Where each part came from, with the hash and date of the footprints that were fetched. |
| `outsideTheMap` | number | How many in the source are out of reach. |
| `structures` | object[] | The buildings. See below. |
| `extras` | object[] | Anything real that isn't in the source. Empty for now: the old gas station's canopy, the steeple on the US 80 church and the store's sign are built by hand in `index.html`, around the real spot. |
| `dropped` | object[] | `id`, true `x` and `z`, and `why`. |

### A structure

Positions are metres from town center, true metres, before compression. `MAP.fromTrue` takes them to the world.

| Field | Type | What it is |
|---|---|---|
| `id` | number | The source's `OBJECTID`. |
| `x`, `z` | number | The middle of the footprint. |
| `ring` | number[][] | The footprint's corners relative to `x`, `z`, wound clockwise on a map with north up, without repeating the first. |
| `sqm` | number | The source's area, before any clip. |
| `use` | string | `house`, `mobile`, `shed`, `farm`, `public`, `shop`, `office`, `church`, `cabin` or `hall`, from the source's primary occupancy. Its `Unclassified` becomes `shed`. A note can correct it. |
| `walls` | string | `siding`, `brick`, `block`, `metal`, `plank`, `stucco` or `mobile`. |
| `wallColor` | string | Hex. |
| `roof` | string | `gable`, `hip`, `flat` or `shed`. A footprint with wings gets one per wing. |
| `roofMat` | string | `shingle` or `metal`. |
| `roofColor` | string | Hex, from the aerial unless leaves hide the roof. |
| `floors` | number | How many. |
| `door` | number | The ring edge with the door in it: the wall facing the nearest road, or as told by `doorFaces` in the notes. |
| `doors` | number | Optional. More than one door in that wall. |
| `bays` | number | Optional. Roll-up doors along that wall. |
| `porch` | string | Optional. `front`, `side` or `wrap`. |
| `carport` | boolean | Optional. |
| `open` | boolean | Optional. A roof on posts with no walls: a carport, a pavilion, a fuel canopy. |
| `shutters` | boolean | Optional. |
| `steep` | boolean | Optional. Tall walls and a steep roof, for a church. |
| `lit` | boolean | Optional. Someone's got a light on inside. |
| `trimColor`, `doorColor` | string | Optional. Hex. |
| `condition` | string | Optional. `worn` has more kudzu and boarded windows, and `ruin` has walls and roof missing. |
| `seen` | boolean | Optional. Someone has looked at this one. Without it, how it looks is what's usual for its use and size, chosen by its id. |
| `what` | string | Optional. A few plain words, when it isn't an ordinary house. |

## Notes

`tools/structure_notes.json` has `structures`, by id, and `extras`. A note can hold any of the look fields above, using a colour name or a hex for `wallColor`, plus these:

| Field | What it does |
|---|---|
| `seen` | Must be `true` for the rest of the note to count. |
| `clip` | `{ "axis": "z", "max": -35.6 }` cuts the footprint at that true coordinate, for one that took in something that isn't building. The old gas station's took in its canopy. |
| `doorFaces` | `north`, `south`, `east` or `west`, to put the door on that side rather than facing the road. |
| `use` | Replaces the source's use, for one that's plainly something else. |
| `roofColor` | Hex, in place of the aerial's. |
