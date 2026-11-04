# Structures

`data/structures.json` holds every real building within reach of the game's roads and railroad: where it stands, the shape of its footprint, and what it looks like. `tools/build_structures.py` generates it. `src/structures.js` turns each one into walls, windows, doors and a roof when the camera comes near. `npm test` checks the file.

## Where it comes from

| What | Source | Licence |
|---|---|---|
| Footprints, positions and use | [USA Structures](https://www.arcgis.com/home/item.html?id=0ec8512ad21e4bb987d7e848d14e7e24), by Oak Ridge National Laboratory (ORNL) and the Federal Emergency Management Agency (FEMA) Geospatial Response Office | CC BY 4.0 |
| Roof colours | [National Agriculture Imagery Program](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer), USDA | Public domain |
| Walls, roof shape, floors, porches | Written down in `tools/structure_notes.json` from looking at Street View | Our own notes |

**Credit.** The footprints are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Anything shipping this data has to keep the credit above and say that we've changed it: we clip a few footprints, move a few off the roads and add what they look like.

**Street View is looked at, not copied.** Nothing is traced or measured from it and no imagery is committed. The notes are words, such as "brick" or "front porch". They hold no business names, people's names or street addresses, because most of these are someone's home.

USA Structures doesn't include anything under 450 sq ft, and its height and outbuilding fields are empty here. So the height of a building comes from its floors and sheds smaller than that aren't in the file.

## Regenerating it

```sh
.venv/bin/python tools/build_structures.py [--refresh]
.venv/bin/python tools/build_lanes.py
```

The drives in `data/lanes.json` go up to these buildings, so it's built after them.

Downloads are cached in `data/raw/structures/`, which is gitignored. `--refresh` fetches them again. It needs nothing from pip beyond what `tools/requirements.txt` already lists, and it reads the aerial's PNGs with the standard library.

## What's kept

Everything within 280 m of a road, a lane or the railroad, which is the reach of `MAP.inBounds`. What's further out is counted in `outsideTheMap`. The lanes bring in buildings and the buildings bring in the lanes that go to them, so `tools/build_lanes.py` works that out once and both use it. `data/lanes.md` has the details.

A footprint never changes shape or size, and it stands where the source has it. They're placed in this order, and whatever doesn't fit goes in `dropped` with the reason:

1. What's been looked at.
2. What isn't a house, a mobile home or a shed.
3. Whatever's nearest the road.

| `why` | What it means |
|---|---|
| `crowded` | It overlaps another building in the source. |
| `road` | It stands on a road, and moving it 8 m wasn't enough to clear it. A building closer than that is moved straight off, because a TIGER line and a footprint are each a few metres out and a real building beside a road shouldn't be lost over it. |
| `track` | It would stand on the railroad. |
| `river` | It would stand in the river. |
| `opening` | Within 150 m of Stuckey's Bridge in both directions, which has to stay as it was for the opening. |
| `gone` | Someone looked and it isn't there any more. |

## The file

| Field | Type | What it is |
|---|---|---|
| `version` | number | The schema's version. |
| `units` | string | `m`. |
| `source` | object | Where each part came from, with the hash and date of the footprints that were fetched, and of any further box in `footprints.also`. |
| `outsideTheMap` | number | How many in the source are out of reach. |
| `structures` | object[] | The buildings. See below. |
| `extras` | object[] | Real buildings the source missed, measured on the aerial, with the same fields as `structures`. They come straight from the `extras` in the notes. The old gas station's canopy, the steeple on the US 80 church and the store's sign are built by hand in `index.html`, around the real spot. |
| `dropped` | object[] | `id`, true `x` and `z`, and `why`. |

### A structure

Positions are true metres from town center. `MAP.fromTrue` takes them to the world.

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
| `condition` | string | Optional. `worn` has more kudzu and boarded windows, `ruin` has walls and roof missing, and `sound` has nothing fallen in or boarded up. |
| `lean` | object | Optional. `{ edge, deep, t0, t1 }` and optionally `slope` and `post`: a roof on posts down that ring edge, from `t0` to `t1` metres along it. |
| `eaves`, `pitch`, `cross`, `gableColor`, `band`, `vent` | | Optional. See the notes below. |
| `seen` | boolean | Optional. Someone has looked at this one. Without it, how it looks is what's usual for its use and size, chosen by its id. |
| `what` | string | Optional. A few plain words, when it isn't an ordinary house. |

## Notes

`tools/structure_notes.json` has `structures`, by id, and `extras`. A note can hold any of the look fields above, using a colour name or a hex for `wallColor`, plus these:

The compound on Pine Forest Rd is the most worked over of these, because it's come to matter that its buildings are the right shape. The source has two footprints there, both wrong, and the rest of it isn't in the source at all, so it's all measured on the aerial as rectangles on the one grid they're laid out on. A building with two roofs is two buildings a few centimetres apart, because `wingsOf` would run one ridge through both. One of them, the long tan building in the clearing, is newer than any public aerial, so it's the one thing here placed by eye off the map and rounded off, and it says so in its `what`. Measure it properly when a newer NAIP comes out. The cabin down the hill by the river and the little studio at the end of its deck are under the trees on the aerial, so they're measured off their pale roofs on a satellite picture taken with the leaves off, which sits up to 2 m south of the aerial on a tall roof and less on a low one, and they're drawn where the two agree. What can't be seen from above, which is mostly the walls, is a guess, apart from the cabin's door and its big windows, which the owner described.

The yard off True Light Rd is measured the same way. The source has its three footprints, about 4 or 5 m south of where the aerial has them, which is about what TIGER's road is off by there too, so it may well be the aerial that's out. They're drawn square on the grid they're laid out on, because `wingsOf` gives up on anything else and puts one roof over the lot. Two more in the source have nothing standing at them on the aerial, so they're marked gone. The walls are a guess here too.

Chunky Duffee Rd goes on past where the map would have stopped, so `tools/lane_config.json` has a second box of footprints to fetch for it, which `source.footprints.also` records. Everything up there is whatever the source calls it unless a note says otherwise, which is how a barn and a home came to be read as a church and its hall from above, until they were looked at from the road. The real church is further on and across the road, and its footprint is moved to match the aerial like the others.

The second trailer in the row nearest the ball field and the low building by the community pool are noted the same way. What's inside the trailer is `index.html`'s.

| Field | What it does |
|---|---|
| `seen` | Must be `true` for the rest of the note to count. |
| `clip` | `{ "axis": "z", "max": -35.6 }` cuts the footprint at that true coordinate, for one that took in something that isn't building. The old gas station's took in its canopy. |
| `doorFaces` | `north`, `south`, `east` or `west`, to put the door on that side rather than facing the road. |
| `doorNear` | `[dx, dz]` in metres from the footprint's middle: the door goes in the wall nearest there, for one whose door isn't in its longest wall that way. The church on Church St's is in its front gable, not the wing beside it. |
| `use` | Replaces the source's use, for one that's plainly something else. |
| `roofColor` | Hex, in place of the aerial's. |
| `move` | `[dx, dz]` in metres, for a footprint the aerial shows is out. |
| `shape` | The footprint's corners relative to the source's middle, where the aerial shows what the source took in or left out. A porch or an open bay comes out of it, and a side wing goes in. |
| `lean` | `{ "faces": "west", "deep": 2.3 }`, a roof on posts down the wall facing that way, and optionally `length`, `from` (a compass word for which end it starts at), `slope` (its roof's fall per metre, .13 unless it's given) and `post` (hex). |
| `eaves`, `pitch` | Wall height in metres and the roof's rise over run, in place of what's usual. |
| `glass` | Compass words, like `["south", "east"]`. Every length of wall facing that way gets the biggest window that'll go in it, for a wall that's mostly glass. |
| `cross` | Each wing after the first turns its ridge across the main one. |
| `gableColor`, `band`, `vent` | The gable ends in their own colour, that colour across the top of the door wall by `band` metres, and a louvre under the ridge. |
