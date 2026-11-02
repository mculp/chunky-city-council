# Lanes

`data/lanes.json` holds the smaller roads that `data/roads.json` leaves out, and a drive to every building that needs one, so that nobody has to go through the woods to get to a house. `tools/build_lanes.py` generates it. `src/map.js` loads it into `MAP.lanes`.

There are 209 lanes, 82.3 km of them, and 903 drives, 36.9 km.

## Where it comes from

| What | Source | Licence |
|---|---|---|
| Lanes | [TIGER/Line 2025](https://www2.census.gov/geo/tiger/TIGER2025/), the same files as `data/roads.json` | Public domain |
| Drives | Generated from where the road and the building are | Ours |
| Measured drives | Measured on USDA's [NAIP aerial](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer), `measured` in `tools/lane_config.json` | Public domain |

Every vertex of a lane is where TIGER has it, apart from the few that say `measured`. Those are somebody's real drive that TIGER hasn't got and a generated one would miss, like the ones into the compound on Pine Forest Rd and the yard off True Light Rd, measured off NAIP in true metres. They come after TIGER's in the file, so adding one doesn't renumber anything, and each starts from the nearest vertex of a road or a lane so that it's joined up. Nothing comes from Google's imagery.

A road doesn't stop for a stretch just because nothing on that stretch needed it. Where one of TIGER's roads is in the game on both sides of a gap of up to 350 m, the gap comes in too, so that True Light Rd isn't barricaded from itself. Two longer gaps stay out, on Point Wanita Lake Rd and Pauldin Rd.

A drive isn't anybody's survey. It goes from the nearest road to beside the door by the shortest way that misses everything, and it bows a little by a hash of whose it is, so that it isn't ruled. It says `generated`, and so does a stretch of track that's had to find its way round a building TIGER has it going through.

## Which roads

Everything of these classes in TIGER that's inside the map, the way back from it to the game's roads, and then round again for what that brings in, until it stops bringing in any more. The interstate and its ramps aren't in it, because you can't get off them.

That means the map grows. The reach of `MAP.inBounds` is 280 m from any road, so a lane brings more buildings into reach, and each of those gets a way in. So `tools/build_structures.py` asks this file's builder which roads there are, and `data/structures.md` counts what's kept against them.

TIGER has the same stretch twice where a road has two names. It goes to the fuller name once.

| Class | What TIGER says it is | Width | Surface |
|---|---|---:|---|
| `S1200` | Secondary road | 7.3 m | asphalt |
| `S1400`, named | Local road | 5.5 m | asphalt |
| `S1400`, no name | Local road | 4.2 m | gravel |
| `S1500` | Four-wheel-drive track | 3 m | dirt |
| `S1640` | Service drive | 5 m | asphalt |
| `S1730` | Alley | 3.5 m | gravel |
| `S1740` | Private road | 3.2 m | dirt |
| `S1750` | Internal census use | 3.2 m | dirt |
| `S1780` | Parking lot road | 5 m | gravel |
| Generated drive | | 3 m | dirt |

TIGER has no width or surface, so those are assumed, in `tools/lane_config.json`. `byName` there has what's been looked at by eye. On Street View True Light Rd, Ridge Rd and Johnson Rd are narrow and paved with no paint, and Point Wanita Lake Rd is paved with a double yellow and white edge lines. So a named road is asphalt with no paint unless `byName` says it has some. That unnamed roads are gravel and private ones dirt is a guess.

`ownDrive` there is for buildings with a drive or a forecourt of their own, already built by hand in `index.html`: the owner's house and barn, the gas station and the town hall. A shed beside one of those shares its way in, as it does with a drive.

## A building and a track

A named road or a highway is in the right place, so a building that's on it moves off it, as `data/structures.md` says. Somebody's track is only roughly where TIGER has it, so it gives way to the building: it's cut where it goes through one and finds its way round. If that cuts a piece off from the rest, the piece gets a generated way back.

## In the game

- `MAP.lanes` has them all, with the same fields as `MAP.roads`, plus `lane`, `structure`, `paint` and `generated`. `MAP.roads` is still the graph, so walking every road, drawing its names and measuring it against TIGER see what they always did.
- `MAP.roadById` and `MAP.roadGrid` have them too, so to whatever asks what road is here they're roads. The land levels out under them and the trees keep off them for that reason, and `MAP.inBounds` reaches 280 m past them.
- They're drawn merged by where they are, and only near him, so a few hundred of them cost a few draw calls. `pavedAt` says if it's paved, which is what his feet, the tyres and the dust go by.
- `MAP.crossings` has theirs as well, so that one crossing the river gets a bridge.
- `closed` is where a lane stops in the game and its road carries on in TIGER. Each gets a barricade, as a clip node in the graph does. A clip node gets none if a lane carries on from it now.

## Regenerating it

```sh
.venv/bin/python tools/build_structures.py
.venv/bin/python tools/build_lanes.py
.venv/bin/python tools/build_lanes.py --check
```

The drives go up to the buildings, so it's built after them. A run takes a couple of minutes. `--check` builds it again in memory, and fails if it differs. `.venv/bin/python -m unittest tools/test_build_lanes.py` tests the logic, and `node --test data/lanes.test.js` checks the file: that it all joins up, that every building has a way in, and that it keeps out of the first scene.

## The file

Positions are true metres from town center, one row to a line.

| Field | Type | What it is |
|---|---|---|
| `version` | number | The schema's version. |
| `units` | string | `m`. |
| `source` | object | TIGER's vintage and base URL, and the files used, each with its size and sha256. |
| `classes` | object | The width and surface assumed for each class. |
| `drive` | object | The width and surface of a generated drive. |
| `lanes` | object[] | The smaller roads. See below. |
| `drives` | object[] | The drives. See below. |
| `crossings` | object[] | `road`, `with` (`river` or `railroad`), `x` and `z`, in the same form as `reference.crossings` in `data/roads.json`. |
| `closed` | object[] | `road`, `x` and `z`. |

### A lane

| Field | Type | What it is |
|---|---|---|
| `id` | string | `lane_` and a number, which changes if the file's built from different roads. |
| `name` | string or null | TIGER's name for it. |
| `mtfcc` | string | TIGER's class. |
| `linearId` | string | TIGER's id for the road. |
| `width` | number | Metres. |
| `surface` | string | `asphalt`, `gravel` or `dirt`. |
| `points` | number[][] | `[x, z]`. |
| `paint` | boolean | If it's there, it's been seen to have lines on it. |
| `generated` | boolean | If it's there, it's not TIGER's. It goes round a building or joins up a piece that's been cut off. |
| `measured` | boolean | If it's there, it's not TIGER's either. It's a real drive measured off the aerial, and its `linearId` is null. |

### A drive

| Field | Type | What it is |
|---|---|---|
| `id` | string | `drive_` and the structure's id. |
| `structure` | number | The building it goes to, from `data/structures.json`. |
| `generated` | boolean | Always true. |
| `width`, `surface`, `points` | | The same as a lane. |
