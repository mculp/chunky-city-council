# Road graph data

`data/roads.json` is the road graph for real Chunky, MS: US 80, Adams Street, Church St and Meehan-Savoy Rd, with the railroad, the Chunky River and three trestles beside it as reference lines. `tools/build_roads.py` generates it, so change the config or the tool and rebuild instead of editing the file. `npm test` fails if this page and the JSON disagree.

Positions here are metres from town center, with +x east and -z north. They're true metres, before compression, unless they say game. "The ticket" is CHUNKY-35. `data/tiger-inspection.md` has the working notes and the full inspector output behind this page.

## Sourcing

- **Dataset:** US Census Bureau TIGER/Line Shapefiles
- **Vintage:** TIGER/Line 2025
- **Base URL:** https://www2.census.gov/geo/tiger/TIGER2025/
- **Downloaded:** 2026-10-31

All geometry comes only from TIGER/Line. Nothing was traced, drawn by hand or taken from any other map or imagery. Inside the clip bounds every TIGER vertex is kept and none is moved. The only vertices that aren't TIGER's are the 10 listed in `synthetic`, each placed on a straight TIGER segment where that segment crosses a compression band edge.

Paths are relative to the base URL. The build hashes each zip as it reads it, so `source.files` records the exact bytes used, and `--check` fails if a zip has changed.

| File | Used for | sha256 |
| --- | --- | --- |
| `ROADS/tl_2025_28101_roads.zip` | Newton County roads: Adams Street, Church St and US 80 west of the county line | `67dfd767eaccf5350881c14be67268d8ed53f32a2482d8edc41f59764b02b5b8` |
| `ROADS/tl_2025_28075_roads.zip` | Lauderdale County roads: Meehan-Savoy Rd and US 80 east of the county line | `ab1b3504895245712ca001abe37acd88288b6bf748cf266964eb520b64c2bfbe` |
| `RAILS/tl_2025_us_rails.zip` | The railroad, from the national file | `e969ffd49f119655ac478035b7f206fb861b70c4dddb926f8cac911182e7a113` |
| `LINEARWATER/tl_2025_28101_linearwater.zip` | Newton County water: `Chunky Riv` | `0ef5f330b733561bacf62fc88ee7d56a447e04fad84f37004da71ee9d969cc7a` |
| `LINEARWATER/tl_2025_28075_linearwater.zip` | Lauderdale County water: `Chunky Riv` where it leaves Newton | `5be05acce53b247059be8ddfabec891b1176299d042e8b19f4fc53bab8fce8ad` |

## Schema

`data/roads.json` is one JSON object. `x` and `z` values are game metres, rounded to 3 decimals (1 mm). `lon` and `lat` values are degrees, with TIGER's 6 decimals, or 9 on a `synthetic` vertex.

### Top level

| Field | Type | Meaning |
| --- | --- | --- |
| `version` | number | Schema version. |
| `units` | string | `m`: 1 unit is 1 m. |
| `axes.+x` | string | `east`. |
| `axes.+y` | string | `up`. Nothing in the file has a y value. |
| `axes.-z` | string | `north`. |
| `origin.lat` | number | Town center's latitude, where x and z are 0. |
| `origin.lon` | number | Town center's longitude, where x and z are 0. |
| `projection.type` | string | `equirectangular`. |
| `projection.radiusM` | number | R, the earth radius in metres. |
| `projection.x` | string | The formula for true x, as text. |
| `projection.z` | string | The formula for z, as text. |
| `projection.angles` | string | `radians`: the unit of the angles in those formulas. |
| `projection.datum` | string | NAD83, used as-is. |

### `compression[]`

One row per band, west to east. See [Compressed stretches](#compressed-stretches).

| Field | Type | Meaning |
| --- | --- | --- |
| `compression[].axis` | string | `x`, the only axis that's remapped. |
| `compression[].trueFrom` | number | West edge of the band, in true metres. |
| `compression[].trueTo` | number | East edge of the band, in true metres. |
| `compression[].gameFrom` | number | West edge of the band, in game metres. |
| `compression[].gameTo` | number | East edge of the band, in game metres. |
| `compression[].factor` | number | Game metres per true metre inside the band. |
| `compression[].reason` | string | Why this stretch is compressed. |

### `source`

| Field | Type | Meaning |
| --- | --- | --- |
| `source.vintage` | string | The TIGER/Line release. |
| `source.baseUrl` | string | Where the release is published. |
| `source.files[].path` | string | A zip the build read, relative to `baseUrl`. |
| `source.files[].bytes` | number | Its size. |
| `source.files[].sha256` | string | Its hash, computed when the build read it. |

### `roadClasses`

The width and surface defaults, keyed by MTFCC code. See [Width and surface](#width-and-surface).

| Field | Type | Meaning |
| --- | --- | --- |
| `roadClasses.<code>.label` | string | What the code means. |
| `roadClasses.<code>.width` | number | Assumed paved width in metres. |
| `roadClasses.<code>.surface` | string | Assumed surface. |

### `nodes[]`

The places where the graph's roads meet or stop.

| Field | Type | Meaning |
| --- | --- | --- |
| `nodes[].id` | string | `n1`, `n2` and so on. |
| `nodes[].x` | number | Game x. |
| `nodes[].z` | number | z. |
| `nodes[].lon` | number | TIGER longitude. |
| `nodes[].lat` | number | TIGER latitude. |
| `nodes[].roads` | string[] | Ids of the roads through this node. |
| `nodes[].kind` | string | `junction`: more than one road shares this vertex. `clip`: TIGER's line carries on and the graph cuts it here, at the last whole vertex inside the bound. `end`: the selected TIGER features end here. |
| `nodes[].connectsTo` | string | Optional. What a clip node leads to outside the graph. Only Adams Street's terminal node has it, set to `I-20`. |

### `roads[]`

| Field | Type | Meaning |
| --- | --- | --- |
| `roads[].id` | string | The road's id, used by every other reference to it. |
| `roads[].name` | string | Display name. |
| `roads[].tigerNames` | string[] | Every TIGER `FULLNAME` on the road's geometry. |
| `roads[].linearIds` | string[] | The TIGER `LINEARID` of every feature on it, sorted. |
| `roads[].mtfcc` | string | Road class. If a road had more than one, the one covering the most length. |
| `roads[].width` | number | Assumed paved width in metres. |
| `roads[].surface` | string | Assumed surface. |
| `roads[].specSource` | string | `class` if width and surface come from `roadClasses`, `override` if an override set them. |
| `roads[].nodes` | string[] | Node ids in walk order. |
| `roads[].edges` | string[] | Edge ids in walk order: `edges[i]` runs from `nodes[i]` to `nodes[i + 1]`. |

US 80 walks west to east. Each other road walks away from where it joins the graph, so Adams Street runs from US 80 towards I-20, Church St west from Adams Street, and Meehan-Savoy Rd from US 80. To walk a road as one line, join its edges in order and drop the first vertex of each later edge, which repeats the node the previous edge ended on.

### `edges[]`

| Field | Type | Meaning |
| --- | --- | --- |
| `edges[].id` | string | `<road id>_e<number>`. |
| `edges[].road` | string | The road it belongs to. |
| `edges[].from` | string | Node id at its first vertex. |
| `edges[].to` | string | Node id at its last vertex. |
| `edges[].points` | number[][] | `[x, z]` vertices in walk order, for drawing and building. |
| `edges[].lonlat` | number[][] | `[lon, lat]` for the same vertices, for true positions and lengths. |
| `edges[].synthetic` | number[] | Indices of the vertices that aren't TIGER's. Empty unless the edge crosses a band edge. |

### `reference`

Beside the graph, not part of it. Crossings don't split road edges or add nodes. `lines` holds separate runs in running order, each with the same `points`, `lonlat` and `synthetic` as an edge, so don't read `lines` as one track or one channel. See [Clip bounds](#clip-bounds).

| Field | Type | Meaning |
| --- | --- | --- |
| `reference.railroad.name` | string | `Railroad`. Generic on purpose: TIGER's rail names can be real operator brands, so the build never reads them. |
| `reference.railroad.linearIds` | string[] | The TIGER `LINEARID` of every rail feature kept, sorted. |
| `reference.railroad.mtfcc` | string | `R1011`, TIGER's railroad class. |
| `reference.railroad.lines[].points` | number[][] | `[x, z]` vertices. |
| `reference.railroad.lines[].lonlat` | number[][] | `[lon, lat]` for the same vertices. |
| `reference.railroad.lines[].synthetic` | number[] | Indices of the vertices that aren't TIGER's. |
| `reference.river.name` | string | `Chunky River`, the display name. |
| `reference.river.tigerName` | string | `Chunky Riv`, the TIGER name. |
| `reference.river.linearIds` | string[] | The TIGER `LINEARID` of every river feature kept, sorted. |
| `reference.river.lines[].points` | number[][] | `[x, z]` vertices. |
| `reference.river.lines[].lonlat` | number[][] | `[lon, lat]` for the same vertices. |
| `reference.river.lines[].synthetic` | number[] | Indices of the vertices that aren't TIGER's. |
| `reference.trestles[].id` | string | `trestle-east-near`, `trestle-east-far` or `trestle-west`. |
| `reference.trestles[].side` | string | `east` or `west` of town center. |
| `reference.trestles[].x` | number | Game x. |
| `reference.trestles[].z` | number | z. |
| `reference.trestles[].lon` | number | TIGER longitude of the vertex the railroad and river share. |
| `reference.trestles[].lat` | number | TIGER latitude of the same vertex. |
| `reference.trestles[].distanceFromCenterM` | number | Straight line from town center, in true metres. |
| `reference.trestles[].label` | string | Optional. `break down` on the west trestle, the site of the 1863 Chunky Creek train wreck. |
| `reference.crossings[].road` | string | The road's id. Crossings are in order along each road. |
| `reference.crossings[].with` | string | `river` or `railroad`. |
| `reference.crossings[].x` | number | Game x. |
| `reference.crossings[].z` | number | z. |
| `reference.crossings[].lon` | number | TIGER longitude of the vertex they share. |
| `reference.crossings[].lat` | number | TIGER latitude of the same vertex. |

## Road names

| Display name | Road id | TIGER names | LINEARIDs |
| --- | --- | --- | --- |
| US 80 | `us_80` | `US Hwy 80` | `1104259460504`, `1105084070834` |
| Adams Street | `adams_st` | `Adams St`, `Chunkey Duffee Rd`, `Chunky Duffee Rd`, `State Hwy 889` | `1104259409674`, `1104259460560`, `1106087296718`, `1106087438880` |
| Church St | `church_st` | `Church St` | `110168391385` |
| Meehan-Savoy Rd | `meehan_savoy_rd` | `Meehan Savoy Rd S`, `Meehan Savoy Rd W` | `1104259508037`, `110470585272` |

The railroad is called `Railroad` and is identified by LINEARID only. The river is TIGER's `Chunky Riv`.

TIGER reuses road names, so every road goes through the same rule, `nearest_component`. It groups the features carrying the road's TIGER names into components by shared vertices and takes the one nearest town center. The build fails unless that component is within `maxDistanceM` (1000 m, or 6000 m for Meehan-Savoy Rd) and contains every name.

| TIGER name | Components | Nearest point of the one kept | Nearest point of the others |
| --- | --- | --- | --- |
| `US Hwy 80` | 4 | 22 m | 12,727 m, 12,767 m and 23,693 m |
| `Adams St` | 2 | 284 m | 21,904 m |
| `Church St` | 2 | 344 m | 7,955 m |
| `Meehan Savoy Rd S` and `Meehan Savoy Rd W` | 1 | 5,596 m | None |

**Which Church St.** The one the ticket asks for, about 0.3 km from town center, not the one about 8 km away. The graph uses `110168391385`, 855 m long and 344 m from town center at its nearest. Its east end meets Adams Street at x -281, z -199, and it runs west to x -1097, z -410. The other is `110168391384`, 590 m long, 7,955 m away at x -8451 to -7922. TIGER's road files have no address ranges, so the choice rests on distance and can't be confirmed by the street address in the ticket.

## Adams St and I-20

**TIGER's `Adams St` doesn't reach I-20. It changes name on the way, with no gap.** It stops 870 m north of US 80, and the road carries on under other names. All of it is S1200 in Newton County, so width and surface don't change. TIGER has both spellings, `Chunkey` and `Chunky`.

The feature path, walking north from US 80:

| Along the road | From | To | TIGER names on this geometry | LINEARIDs |
| --- | --- | --- | --- | --- |
| 0 to 719 m | x -283, z -23 (US 80) | x -290, z -742 | `Adams St`, `State Hwy 889` | `1104259460560`, `1104259409674` |
| 719 to 870 m | x -290, z -742 | x -286, z -893 | `Adams St`, `Chunky Duffee Rd`, `State Hwy 889` | `1104259460560`, `1106087438880`, `1104259409674` |
| 870 to 1,644 m | x -286, z -893 | x -292, z -1666 (the clip) | `Chunkey Duffee Rd`, `Chunky Duffee Rd`, `State Hwy 889` | `1106087296718`, `1106087438880`, `1104259409674` |

**Where the graph stops.** At 1,644 m, 774.0 m past the end of `Adams St`, at -88.931164, 32.340809, the road first touches an S1630 ramp of the I-20 interchange (`1104259461433`). That vertex is Adams Street's last node, with `kind: clip` and `connectsTo: I-20`. I-20 isn't added as a road: the node only marks where Adams Street reaches it.

**Assumption.** The ramp at the clip doesn't share a vertex with I-20 itself. Both of its ends land on ramps that do, so it counts as I-20's ramp here. Past the clip, not in the graph:

- 43.3 m along that ramp, at x -320, z -1698, is the start of ramp `1104259461434`, the first ramp on this path that touches I-20 directly. It's 817.2 m past the end of `Adams St`.
- 144.4 m further up the road itself, at -88.931214, 32.342107 (x -296, z -1810), is the road's first shared vertex with I-20 itself (`1104259462209`, S1100). To stop there instead, change `clipAt` in `tools/road_config.json`.

## Lat/long to game coordinates

TIGER gives NAD83 longitude and latitude, used as-is with no datum shift. They become true metres through a local equirectangular projection:

```text
true x = R * dLon * cos(lat0)
z      = -R * dLat
```

- `dLon` is `lon - lon0` and `dLat` is `lat - lat0`, in radians, and `cos` takes `lat0` in radians.
- R is 6371000 m.
- The origin is town center: `lat0` is 32.32583 and `lon0` is -88.92806.
- 1 unit is 1 m. +x is east, +y is up and -z is north. The file has no y values.

Game x is true x sent through the compression band. z never changes:

```text
true x <= 1223:         game x = true x
1223 < true x < 5063:   game x = 1223 + (true x - 1223) * 0.25
true x >= 5063:         game x = true x - 2880
```

And back:

```text
game x <= 1223:         true x = game x
1223 < game x < 2183:   true x = 1223 + (game x - 1223) / 0.25
game x >= 2183:         true x = game x + 2880
```

Two examples from the file, rounded to 1 mm as it's written:

- **Past the band:** the Meehan-Savoy Rd junction (`n3`) is at -88.86625, 32.327776. That's true x 5807.793, z -216.385, so game x 2927.793.
- **Inside the band:** US 80's third river crossing is at -88.90915, 32.326017. That's true x 1776.822, z -20.793, so game x 1361.456.

Every vertex keeps its TIGER lon/lat beside its game x/z, so a true position or length is always a re-derivation away.

## Width and surface

These are assumed defaults, not surveyed values. TIGER records neither width nor surface, so both are assigned from the road class (`MTFCC`) in `tools/road_config.json`.

### By road class

| MTFCC | Class | Width (m) | Surface |
| --- | --- | --- | --- |
| S1100 | Primary road | 7.3 | asphalt |
| S1200 | Secondary road | 7.3 | asphalt |
| S1400 | Local neighborhood road, rural road or city street | 6.0 | asphalt |
| S1500 | Vehicular trail (4WD) | 3.5 | dirt |
| S1630 | Ramp | 5.0 | asphalt |
| S1640 | Service drive | 6.0 | asphalt |
| S1730 | Alley | 3.5 | gravel |
| S1740 | Private road for service vehicles | 3.5 | gravel |
| S1780 | Parking lot road | 6.0 | asphalt |

A road with a class missing from this table fails the build. S1750 (748 features, Census internal use) isn't in the table, and no selected road uses it. S1730 is in the table, but these two counties have none.

### By road

| Road | MTFCC | Width (m) | Surface | Source |
| --- | --- | --- | --- | --- |
| US 80 | S1200 | 7.3 | asphalt | class |
| Adams Street | S1200 | 7.3 | asphalt | class |
| Church St | S1400 | 6.0 | asphalt | class |
| Meehan-Savoy Rd | S1400 | 6.0 | asphalt | class |

### Overrides

No overrides: `overrides` in `tools/road_config.json` is empty, because nothing yet supports one.

To add one, key it by road id with `{width, surface, reason}` in the config and rebuild, which sets that road's `specSource` to `override`. Then replace the sentence above with a table whose columns are `Road`, `Width (m)`, `Surface` and `Reason`, with the display name in `Road`.

## Compressed stretches

There's one band. Everything else is 1:1: x outside the band, with a constant shift past it, and z everywhere.

| True x from | True x to | Game x from | Game x to | Factor |
| --- | --- | --- | --- | --- |
| 1223 | 5063 | 1223 | 2183 | 0.25 |

**Reason.** US 80 between the far east trestle and Meehan-Savoy Rd: 3.84 km with no junction or trestle, over four times the camera's 900 m far plane. It still holds one river crossing, and the railroad and river run through it. Their order is kept, but bearings inside the band change.

**Where the edges are.** 150 m east of `trestle-east-far` (x 1072.95) and 150 m west of Meehan-Savoy Rd's minimum x (x 5213.20), to the nearest metre, so that whole road stays 1:1. 3,840 m becomes 960 m, about one far plane. x 1220 was rejected because it's 3 mm from a river vertex. The nearest kept vertices to the edges in use are 0.855 m and 1.647 m away.

**How it's applied.** One global remap of x, the same for roads, railroad, river, nodes, trestles and crossings, at every z. The band isn't quite empty: it holds US 80's river crossing at true x 1777 (game x 1361) and its county-line seam at true x 1254, and the railroad and river run through it. No node or trestle is inside it, and the build fails if one is.

**What it distorts.**

- **x distances inside the band** are a quarter of their true length.
- **Lengths** measured from `points` come up short across the band: US 80 is 11,333 m in true metres and 8,810 m in game metres. Use `lonlat` for true lengths.
- **Bearings inside the band** change, because x is squeezed and z isn't, so every line there swings towards north-south. From true x 1223 to its southernmost point, the railroad runs about 30° south of east in truth and about 66° in game space. A smooth curve there looks like a sharp V, and anything built from `points` gets the same V.
- **Straight segments bend** where they cross a band edge. There are 10 vertices at those edges, listed in `synthetic`: `us_80_e2` 2, railroad line 1 2, river line 3 6. Their lon/lat is interpolated, with 9 decimals, so they stay on the edge.
- **Everything east of the band** is shifted by -2880 m. Its scale is true, but its game x isn't its distance east of town center. `distanceFromCenterM` is in true metres.

**What it keeps.** Every crossing, the order along each line and the left or right direction of every TIGER turn, because the remap is strictly increasing and z doesn't change. On this data, 9 of the 3,335 turns would flip if segments weren't split at the band edges, and none flip with the split. lon/lat never changes.

## Clip bounds

Clips keep whole TIGER vertices. A line stops at its last vertex inside the bound, never at an interpolated point, so every end keeps its real lon/lat and can stop short of the bound itself.

**US 80.** True x -4670 to 6310 (`xMinM` and `xMaxM` in the config), which is 500 m past the west trestle (x -4160.2) and the Meehan-Savoy Rd junction (x 5807.8), rounded out to 10 m. US 80 crosses each bound once and ends at x -4663, z 183 and at x 6258, z -574 (game x 3378). Inside the bounds it's two features joined at the county line.

**Adams Street.** Clipped at the I-20 ramp, as in [Adams St and I-20](#adams-st-and-i-20). Church St and Meehan-Savoy Rd aren't clipped.

**Railroad and river.** Both are clipped to the reference area, the bounding box of every included road plus 500 m: true x -5163 to 15419 (game x -5163 to 12539), z -2166 to 7594. Meehan-Savoy Rd sets the east and south sides, so the box is much bigger than the town. A line that leaves the box and comes back becomes two lines, in running order.

| Railroad line | Vertices | From | To | What it is |
| --- | --- | --- | --- | --- |
| 1 | 161 (2 synthetic) | x -5043, z 834 | x 8284, z -2159 | The line through town. It leaves the box to the north here. |
| 2 | 16 | x 11083, z -2162 | x 11906, z -2022 | The same line, back inside the box for about 1 km. |
| 3 | 22 | x 15404, z 3076 | x 14958, z 7530 | Feature `1103690413981`, a separate rail line across the box's southeast corner. It doesn't touch the line through town inside the box, and no included road crosses it. |

| River line | Vertices | From | To | What it is |
| --- | --- | --- | --- | --- |
| 1 | 16 | x -4691, z -2163 | x -4632, z -2164 | A bend just inside the box's north edge. |
| 2 | 1199 | x -4560, z -2159 | x 661, z -45 | Past the west and near east trestles, to the gap below. |
| 3 | 1045 (6 synthetic) | x 666, z -61 | x 6036, z 7591 | From the gap, across US 80 twice and past the far east trestle, then southeast. |
| 4 | 32 | x 6227, z 7594 | x 6816, z 7549 | A bend just inside the box's south edge. |

River lines are walked from the westernmost end. TIGER records no flow direction, so that isn't a claim about which way the water runs.

## Known gaps

**Disconnected roads.** None. All four roads connect by shared vertices, so the graph is one component. Church St doesn't touch US 80 (176 m away at its closest) and reaches it through Adams Street. I-20 isn't in the graph, so nothing connects to it: Adams Street's last node only marks it.

**Branches.** None. No kept road branches or has a second component, so each walks as one line. Left out on purpose: the other components with the same names, US 80's divided stretch near x -20000, and every ramp of the I-20 interchange.

**Near-misses.** No two roads come within 5 m of each other without touching, and no two cross away from a shared vertex, so no crossing vertex was added and nothing was snapped. The build counts a gap within 5 m of a vertex two roads share as that junction, but no pair of road segments comes under 5 m even without that exclusion.

Across the roads, railroad and river, the build counts a gap within 30 m of a contact as that contact, and here that exclusion does apply. 11 pairs of segments that don't touch come under 5 m, the closest 1.05 m apart, because short segments next to a crossing or trestle sit close to the other line. All 11 are within 6.4 m of a crossing or trestle, so none is a separate near-miss, and nothing else comes under 5 m.

**A gap in the river.** TIGER's `Chunky Riv` has a 16.2 m gap from x 661, z -45 (the end of `1102216410608`) to x 666, z -61 (the start of `1102216410607`). No other water feature in either county file has a vertex nearby. It stays open: nothing bridges it. It's about 27 m south of where US 80 crosses the river, so it doesn't hide a crossing.

**Rail feature left out.** `1106087712080` overlaps the reference area only by bounding box and has no segment inside, so it isn't in `linearIds`.

**Reference lines aren't in the graph.** US 80 meets the river at true x -4505, 669 and 1777 and the railroad at 6121, and Meehan-Savoy Rd meets the railroad at 5939. Adams Street and Church St cross neither. These are listed in `reference.crossings` and aren't nodes.

**Raw TIGER check.** Every build checks each road edge against the raw road features. Rail and river aren't in that check: they had a one-off run of the same matcher, which passed on all seven lines.

**What TIGER doesn't record.**

- Width and surface, which are assumed.
- Elevation.
- Grade separation. A shared vertex isn't proof of a junction: the Adams Street alignment shares vertices with both I-20 carriageways at the interchange, which is likely a bridge.
- River flow direction.

**Where TIGER differs from the ticket.** These are corrections to the ticket's descriptions. No geometry was changed to fit them.

| The ticket says | TIGER says | What the data does |
| --- | --- | --- |
| Adams Street connects US 80 to I-20 | `Adams St` stops 870 m north of US 80 and carries on under other names | Follows those names to the I-20 ramp |
| Meehan Savoy Rd starts about 5.6 km from town center | 5,596 m is its nearest vertex, a bend at x 5226, z 2002. Its junction with US 80 is 5,812 m away, at x 5808 | Joins US 80 at that junction, node `n3` |
| Two roads are named Church St | True, and the same applies to others: `Adams St` has a second feature 21.9 km away and `US Hwy 80` has four components | Uses the nearest component for every road |
| US 80 runs alongside the Chunky River | Only as far as true x 3000, where the river stays within 1,240 m and crosses it three times. East of that the river falls away south, 3.4 km from US 80's east end | Keeps TIGER's lines |
| The railroad runs east-west through town | In town it does: 0.7° south of east from true x -750 to 1154, and 8.7° north of east from its west end to town center. East of the far trestle it runs about 30° south of east to its southernmost point at true x 4601, z 2150, then north-east across US 80 at true x 6121, leaving the reference area at true x 8284 | Keeps TIGER's lines |
| The trestles are about 0.58 km and 1.07 km east and 4.16 km west | The railroad meets `Chunky Riv` at exactly three shared vertices, at x 579, 1073 and -4160. The ticket's figures are east-west offsets: the straight-line distances are 584 m, 1,090 m and 4,224 m | `distanceFromCenterM` holds the straight-line distance |

## Regenerating

Run these from the repo root. The venv is gitignored, and its one dependency is pinned in `tools/requirements.txt`.

```sh
python3 -m venv .venv
.venv/bin/pip install -r tools/requirements.txt
.venv/bin/python tools/fetch_tiger.py
.venv/bin/python tools/build_roads.py
.venv/bin/python tools/build_roads.py --check
npm test
```

- **`tools/fetch_tiger.py`** downloads the five zips to `data/raw/`, which is gitignored. It skips any file already there, so delete a zip to fetch it again. It exits non-zero if a download fails.
- **`tools/build_roads.py`** reads the zips in place, without extracting them, along with `tools/road_config.json`. It writes `data/roads.json` and prints a report of everything this page records. The same zips and config give the same bytes. Any failure exits non-zero and leaves the file as it was.
- **Every build** re-reads the road zips and fails unless each edge's non-synthetic vertices are an unbroken run of its road's raw TIGER features, which is what checks that intersections and turns stay in TIGER's order.
- **`--check`** regenerates in memory, writes nothing and exits non-zero if `data/roads.json` differs.
- **`npm test`** needs no zips or Python. It re-derives the JSON's positions and order from its lon/lat, and it fails if this page has drifted from the JSON. After a rebuild that changes anything here, its failures say what to update.

`python3 -m unittest tools/test_build_roads.py` runs the Python tests, which read no zips. `.venv/bin/python tools/inspect_tiger.py` prints the findings saved in `data/tiger-inspection.md`.

## Debug plot

```sh
node tools/plot-roads.js [out.svg]
```

This draws `data/roads.json` as an SVG with no other dependencies, by default to `data/raw/roads-debug.svg`, which is gitignored. Don't commit a rendered plot: CLAUDE.md bars image files.

It plots game coordinates with north up, east right and one scale on both axes. It shows the four roads, the railroad, the river, the trestles, the nodes and town center, with a north arrow, a 1 km scale bar and a legend. Line widths aren't to scale.

**Reading the band.** The compression band is shaded and labelled with its true and game ranges. The scale bar and bearings only hold outside it, so the railroad's smooth curve looks like a sharp V inside it.

## Decisions and assumptions

1. **Vertices.** Every TIGER vertex inside the clip bounds is kept, with no simplification, so turns survive. NAD83 lon/lat is used as-is.
2. **Intersections** come from TIGER's shared vertices, compared exactly, because TIGER is one planar topology. A geometric segment check backs this up. Near-misses are reported and never snapped.
3. **Compression** is one global, strictly increasing piecewise-linear remap of x, applied alike to roads, railroad and river. z isn't touched.
4. **One band, factor 0.25.** The plan put it on US 80 between the far east trestle and the start of Meehan Savoy Rd. The edges in use are given in [Compressed stretches](#compressed-stretches).
5. **lon/lat is kept beside x/z** on every vertex, so tests can re-derive coordinates and order independently.
6. **Width and surface** are assumed defaults by MTFCC, with no overrides until there's evidence for one.
7. **Rail names.** The data and this page use the generic name `Railroad` and identify rail features by LINEARID only.
8. **I-20** isn't a road in the graph. Only the node where Adams Street reaches it is marked.
9. **The Adams Street clip** is the road's first contact with an I-20 interchange ramp, counting a ramp that reaches I-20 through another ramp.
10. **Clip ends** are whole TIGER vertices, not interpolated points on the bound.
11. **Feature runs.** US 80's and Meehan-Savoy Rd's middle edges can't fit in one TIGER feature, so a run may move to another feature only where both features end, at a vertex they share.
12. **"On a TIGER vertex"** means within 1 mm, the resolution of written x, so a band edge copied from a printed x still counts.
