# Water

`data/water.json` holds the ponds within reach of the game's roads and railroad: where each one is and the shape of its shore. `tools/build_water.py` generates it, `src/water.js` loads it, and `index.html` cuts each one into the ground. The river isn't in here. It's one of TIGER's lines, in `data/roads.json`.

## Where it comes from

| What | Source | Licence |
|---|---|---|
| Ponds | [National Hydrography Dataset](https://www.usgs.gov/national-hydrography), Waterbody - Large Scale, by the US Geological Survey | Public domain |
| Corrections | `tools/water_extras.json`, by eye on the [National Agriculture Imagery Program](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer) aerial, by USDA | Public domain |

The roads come from TIGER/Line, so that was the first place to look. Its area water has 9 polygons around here, and the nearest is 406 m from a road, further than he can go. NHD has 189 lakes and ponds in the same area.

Google Maps is for comparing by eye and for noticing what's missing. No geometry comes from it, and none of its imagery is committed.

## What's left out, and what isn't

`left` in the file counts what the build dropped.

- **`swamps`:** what NHD files as swamp or marsh rather than lake or pond. On the aerial these are forest and brush, with no open water to swim in, so the game doesn't have them. Two it files that way really are open water and they're in `open` in `tools/water_extras.json`: a farm pond with a dam, and an old bend of the river.
- **`outOfReach`:** anything with no point within 500 m of a road or the railroad. Ponds within that are in the file even where he can't get to them, since `MAP.inBounds` stops 280 m out. They're on the map.
- **`byTheBridge`:** anything within 400 m of Stuckey's Bridge, because nothing changes in the first scene's square. There aren't any, and the nearest is 1.1 km away.

An outline with an island in it stops the build, since nothing handles one. None of those it keeps has one.

`reached` in `tools/water_extras.json` takes in ponds of NHD's that are further than that from the roads, but which a lane now goes past. The farm south of the Chunky River Bridge has three of them, and says that the big one's `look` is `algae`, because it's bright green on the aerial.

`ponds` in `tools/water_extras.json` are real ones NHD hasn't got, outlined by eye to the nearest few metres. There are seven: the long dark one in a gully on that farm, and three small ones west of town, the open water at the south end of the big marsh east of the railroad at about (15450, 4250), the east arm of a lake at about (8820, -1830), and a square farm pond by True Light Rd. NHD files the last two as swamp, and most of those outlines are forest and floating mat.

`pools` in `tools/water_extras.json` are swimming pools, which NHD wouldn't have, measured on the aerial. A pool isn't a pond with a level from the ground around it. Its water stands 12 cm under the level of the ground, with straight sides and a floor 1.7 m under that, its ground isn't mud and a pad doesn't fill it in. There are three, by the big house on Pine Forest Rd, by the house with the red roof off True Light Rd, and the community pool west of the trailer park, which has gone bright green.

### Corrections to file

Comparing the aerial by eye also found these, which aren't changed here:

- The pond at (173, -501) is grown over on the aerial, with open water on its north side. It's in as NHD has it.
- Small dark spots that could be ponds at about (14025, 6275), (15075, 6530), (6233, 3667) and (7333, 6200) aren't in NHD. Away from town I scanned at low resolution, so there could be more.

## Schema

Coordinates are true metres from town center, as in `data/roads.md`. Place anything new with `map.fromTrue`.

| Field | Type | |
|---|---|---|
| `version`, `units`, `origin`, `projection` | | The same as `data/roads.json` |
| `source` | object | What each source is, who it's by and its licence. `ponds` also has when it was fetched and the sha256 of what came back |
| `left` | object | The counts above |
| `ponds` | object[] | One line each, sorted by `id` |

Each of `ponds`:

| Field | Type | |
|---|---|---|
| `id` | string | NHD's permanent identifier, or `extra-1` and so on from `tools/water_extras.json` |
| `source` | string | `nhd` or `naip` |
| `area` | number | Square metres, from `ring` |
| `ring` | [x, z][] | The shore, to 0.1 m. It doesn't repeat its first point |
| `lonlat` | [lon, lat][] | The same points, as the source had them or as projected back |
| `name` | string | NHD's name, where it has one |
| `pool` | string | What sort of swimming pool it is, if it is one. `index.html` has what each looks like |
| `look` | string | A pond whose water isn't the usual colour takes the look of one of those. |
| `islands` | [x, z][][] | Dry land in the middle of it, as NHD has it. Its edges count as shore, and being on one is crossing an even number of edges, so nothing else has to know about it. |

## What the game does with it

A pond's height isn't in the file, because it comes from the ground around it, which only the game knows.

- **Level:** `WATER.settle` walks the shore every 5 m on the land as it is with no ponds. Water finds the lowest place, so the level is 0.3 m under the lowest point of its shore, and never above 0.5 m under the town. A shore that drops under 1.5 m is down by the river, so that pond is at the river's level and has no sheet of its own, though none are today.
- **The ground:** in the 9 m off the shore the land eases down to 0.3 m above the water. Under it, the floor drops at 1 in 2 to `max(1.1, min(3, sqrt(area) / 18))` metres below the water. That's a guess at depth, for how a pond feels, and not a measurement.
- **What wins over water:** a road or the railroad's bed keeps its height across a pond. So does a building's pad, and no building ends up under water. `npm run water` samples that, and no tree grows within 2 m of a shore.
- **The look:** the river's own material, with the sky and the moon in it, as one flat sheet per pond. There's mud within 4 m of the shore.
- **Swimming:** he walks in, and once the water's over 0.3 m deep he's swimming at that pond's height. In town he climbs out where it's under 0.2 m deep, which is a gap so that he can't flip between the two.
- **Vehicles:** one floods once it's 0.8 m under the water it's in, as in the river.
- **The crowd:** keeps out of it, as it does the river.
- **The maps:** both draw it in the river's colour, with no names.

## Regenerating

```sh
.venv/bin/python tools/build_water.py
```

The download is cached in `data/raw/water/`, which is gitignored. `--refresh` fetches it again, and `--check` says whether `data/water.json` matches what a fresh build would write. `.venv/bin/python -m unittest tools/test_build_water.py` tests the build, and `node --test src/water.test.js` tests the file.
