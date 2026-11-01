# TIGER inspection findings

Working notes for the road graph docs (CHUNKY-35, step 8). They record what TIGER/Line 2025 says about the ticket's roads, why `tools/road_config.json` holds what it does, and how compression and the TIGER check work. The last section is the output of `.venv/bin/python tools/inspect_tiger.py`.

Positions are metres from town center: +x is east, -z is north. They're true metres, before compression, unless they say game.

## Does TIGER's Adams St reach I-20?

No. It changes name on the way, and TIGER leaves no gap.

- `Adams St` (LINEARID 1104259460560, S1200) runs 870 m north from US 80 and stops at x -286, z -893.
- The road carries on along one geometry with three overlapping names: `Chunkey Duffee Rd`, `Chunky Duffee Rd` and `State Hwy 889`. TIGER has both spellings. All three are S1200, so width and surface don't change. `State Hwy 889` also overlaps all of `Adams St`.
- 774.0 m on, at -88.931164, 32.340809 (x -292, z -1666), the road first touches an S1630 ramp of the I-20 interchange. The config clips there, which makes Adams Street 1,644 m long.

**Assumption on the clip.** The ramp at the clip point (1104259461433) doesn't share a vertex with I-20 itself. Both of its ends land on ramps that do, so it counts as I-20's ramp here. Read literally, "an S1630 ramp touching I-20" gives the 817.2 m path in section (b), which runs 43.3 m along that ramp to the start of 1104259461434, but that path leaves the named road at the same clip point. The road's first shared vertex with I-20 itself is 144.4 m further north, at -88.931214, 32.342107 (x -296, z -1810). Using that vertex instead only means changing `clipAt`.

## Do the roads touch?

| Road | US 80 | Adams St |
| --- | --- | --- |
| Meehan Savoy Rd | Yes: the north end of `Meehan Savoy Rd S`, at x 5808, z -216 | No: 5,869 m away |
| Church St (nearest) | No: 176 m away | Yes: its east end, at x -281, z -199 |
| Adams St | Yes: its south end, at x -283, z -23 | n/a |

`Meehan Savoy Rd S` and `W` connect to each other. Segment-by-segment geometry found no crossing away from a shared vertex on any of these pairs.

## Where TIGER differs from the ticket

- **Meehan Savoy Rd "starts about 5.6 km from town center".** 5,596 m is its nearest vertex, a bend at x 5226, z 2002. Its junction with US 80 is 5,812 m away, at x 5808.
- **"Two roads are named Church St".** Adams St has a second feature too, 21.9 km away (110168391111). `US Hwy 80` has four components. So every road in the config uses the nearest-component rule, not only Church St.

## Compression

One band in `tools/road_config.json`, written to `compression[]`:

| | From | To |
| --- | --- | --- |
| True x | 1223 | 5063 |
| Game x | 1223 | 2183 |

- **The remap.** `f(x)` is the identity west of the band, scales by 0.25 inside it, and shifts by -2880 m east of it. It's strictly increasing, and `decompress_x` is its inverse. z and TIGER's lon/lat never change.
- **Where the edges are.** 150 m east of `trestle-east-far` (x 1072.95) and 150 m west of Meehan-Savoy Rd's minimum x (x 5213.20), to the nearest metre. 3,840 m becomes 960 m, about one 900 m far plane (`index.html:294`). Meehan-Savoy Rd's junction is at true x 5808, game x 2928. x 1220 looked tidier but is 3 mm from a river vertex. The nearest kept vertices to the edges in use are 0.855 m and 1.647 m away.
- **What's in the band.** No graph node or trestle. It isn't quite empty, though: US 80 crosses the river at true x 1777, game x 1361, and the river and railroad run through it.
- **What's kept and what isn't.** Every crossing, the order along each line and the direction of every TIGER turn are kept. On this data, 9 of the 3,335 turns would flip if segments weren't split at the band edges, and none flip with the split. Bearings inside the band do change, because x is squeezed to a quarter and z isn't. A straight segment also bends where it crosses a band edge. The docs and the debug plot must say so.
- **Band-edge vertices.** There are 10, listed by index in each edge's or line's `synthetic`, which is present and empty everywhere else: `us_80_e2` 2, railroad line 1 2, river line 3 6. Their lon/lat is interpolated and has 9 decimals, not TIGER's 6, so that they stay on the edge and re-deriving x from lon/lat works for every vertex. Each lands exactly on game x 1223 or 2183.
- **"Exactly on a TIGER vertex"** means within 1 mm, the resolution of written x. Float equality would miss an edge copied from a printed x.
- **Schema addition.** Crossing rows now have `lon` and `lat`, like nodes and trestles, so their x can go through `f` and be re-derived.

## TIGER check

Every build re-reads the road zips and checks the parsed JSON text, so it shares nothing with how the edges were built. Each edge's non-synthetic vertices have to be an unbroken run of features with one of its road's LINEARIDs, forwards or backwards.

- **Assumption on features.** Two edges can't fit inside one feature, so the check can't be literally "one raw feature": `us_80_e2` crosses the county line (1104259460504 then 1105084070834) and `meehan_savoy_rd_e1` goes from `S` to `W` (110470585272 then 1104259508037). A run may move to another feature only where both features end, at a vertex they share, and it can't double back there. The other five edges each fit inside one feature.
- **Clip endpoints.** A clip endpoint is the only vertex that may be missing from the features. The exception is never used on this data, because clip endpoints are whole TIGER vertices: the report says `Clip endpoints off their features: 0`.
- **Synthetic vertices.** The check skips these, so it first confirms each one is on a band edge and on the straight line between its TIGER neighbours. Otherwise any vertex could hide in the list.
- **Added crossings.** A vertex computed where two roads cross with no shared vertex would now fail this check. There are none on this data.
- **Rail and river** are outside this check, which covers road edges. A one-off run of the same matcher passed on all seven lines.

`.venv/bin/python tools/build_roads.py --check` regenerates the JSON in memory and exits non-zero if it differs from the file on disk. `python3 -m unittest tools/test_build_roads.py` runs the Python tests, which read no zips.

## US 80 clip

- Bounds are 500 m past each anchor in x, rounded out to 10 m: `xMinM` -4670 (west trestle, x -4160.2) and `xMaxM` 6310 (Meehan Savoy Rd junction, x 5807.8).
- Clipping keeps whole TIGER vertices, so every vertex keeps its real lon/lat. US 80 ends at x -4663, z 183 and at x 6258, z -574.
- That leaves about 510 m of road past the point level with the west trestle, and 577 m past the junction, where US 80 bends northeast.
- Inside the bounds US 80 is two features joined at the county line (1104259460504 and 1105084070834): 265 vertices, 11,333 m, with x strictly increasing west to east. The divided stretch near x -20000 falls outside.

## Other notes

- **Trestles:** the railroad meets `Chunky Riv` at three shared vertices, all on rail feature 110168393895, at 4.16 km west and 0.58 km and 1.07 km east. This matches the ticket.
- **Shared vertices:** every coordinate is exactly 6 decimals, so they're compared exactly. A shared vertex isn't proof of a junction: the Adams Street alignment shares vertices with both I-20 carriageways at the interchange, which is likely a grade separation. TIGER doesn't record that.
- **MTFCC table:** S1750 (748 features, Census internal use) isn't in the table, and no selected road uses it. S1730 is in the table, but these two counties have none.
- **Widths and surfaces** are assumed defaults by road class, and `overrides` is empty because nothing yet supports an override.

## Road graph build

Output of `.venv/bin/python tools/build_roads.py`, which writes `data/roads.json`. Its positions are game metres unless they say true, and its report is in true metres:

```text
TIGER/Line 2025, read from data/raw/. Positions are game metres unless they say true.
  US 80: 3 edge(s), 267 vertices (2 synthetic), S1200 7.3 m asphalt (class), walk n1 n2 n3 n4, features 1104259460504 1105084070834
  Adams Street: 2 edge(s), 74 vertices (0 synthetic), S1200 7.3 m asphalt (class), walk n2 n5 n6, features 1104259409674 1104259460560 1106087296718 1106087438880
  Church St: 1 edge(s), 18 vertices (0 synthetic), S1400 6.0 m asphalt (class), walk n5 n7, features 110168391385
  Meehan-Savoy Rd: 1 edge(s), 520 vertices (0 synthetic), S1400 6.0 m asphalt (class), walk n3 n8, features 1104259508037 110470585272
Nodes:
  n1 clip x -4663, z 183: us_80
  n2 junction x -283, z -23: us_80 adams_st
  n3 junction x 2928 (true x 5808), z -216: us_80 meehan_savoy_rd
  n4 clip x 3378 (true x 6258), z -574: us_80
  n5 junction x -281, z -199: adams_st church_st
  n6 clip x -292, z -1666: adams_st, connects to I-20
  n7 end x -1097, z -410: church_st
  n8 end x 12039 (true x 14919), z 6058: meehan_savoy_rd
Reference lines, clipped to the reference area:
  Railroad: features 110168393895 1103690413981 110470585569 110470586701
    161 vertices (2 synthetic), x -5043, z 834 to x 5404, z -2159
    16 vertices (0 synthetic), x 8203, z -2162 to x 9026, z -2022
    22 vertices (0 synthetic), x 12524, z 3076 to x 12078, z 7530
  Chunky River: features 110168391381 1102216410607 1102216410608 110470583324 110470583325
    16 vertices (0 synthetic), x -4691, z -2163 to x -4632, z -2164
    1199 vertices (0 synthetic), x -4560, z -2159 to x 661, z -45
    1045 vertices (6 synthetic), x 666, z -61 to x 3156, z 7591
    32 vertices (0 synthetic), x 3347, z 7594 to x 3936, z 7549
Trestles:
  trestle-east-near x 579, z 79: 584.3 m east of center
  trestle-east-far x 1073, z 191: 1089.8 m east of center
  trestle-west x -4160, z 734: 4224.4 m west of center, break down
Crossings, in order along each road:
  us_80 x -4505, z 159: river
  us_80 x 669, z -88: river
  us_80 x 1361 (true x 1777), z -21: river
  us_80 x 3241 (true x 6121), z -451: railroad
  meehan_savoy_rd x 3059 (true x 5939), z 558: railroad
Report, with positions in true metres:
  US 80 joins at the county line at -88.914715, 32.327867 (x 1254, z -227)
  Adams Street reaches I-20 at -88.931164, 32.340809 (x -292, z -1666)
  Geometric check: no crossing away from a shared vertex
  Geometric check: no near-miss under 5 m
  All selected roads connect by shared vertices
  Reference area, the roads plus 500 m: x -5163 to 15419, z -2166 to 7594
  Chunky River has a 16.2 m gap in TIGER from -88.921026, 32.326236 (x 661, z -45) to -88.920975, 32.326375 (x 666, z -61). Not bridged.
  Geometric check: the railroad and river have no near-miss under 5 m
  Railroad feature 1106087712080 has no segment inside the area
  Compression: true x 1223 to 5063 is game x 1223 to 2183, factor 0.25. Past it, x shifts by -2880 m.
  Inside that band: us_80 meets the river at true x 1777, game x 1361
  Vertices added at band edges: us_80_e2 2, railroad line 1 2, river line 3 6
  TIGER check: 7 edges, 880 vertices, all unbroken runs of raw features. Clip endpoints off their features: 0.
  TIGER check: runs through more than one feature, joined where they end: us_80_e2 (1104259460504 then 1105084070834), meehan_savoy_rd_e1 (110470585272 then 1104259508037)
Wrote data/roads.json
```

For the docs:

- **Shape.** No road branches or has a second component, so each walks as one line. Every vertex in `roads.json` is a TIGER vertex, except the ones listed in `synthetic`.
- **Clip nodes.** `kind: clip` means TIGER's line carries on past that node and the graph cuts it there. The node is the last whole TIGER vertex inside the bound, never an interpolated one, as the config requires. So Adams Street's terminal node is `clip`, with `connectsTo: I-20`.
- **`connectsTo`.** The build sets it from the data, not from the config: the terminal has to lie on I-20 or on a ramp connected to I-20 through other ramps. The build fails if the road touches one before `clipAt`.
- **Walk direction.** US 80 runs west to east. Each other road runs away from where it joins the graph, so Adams Street runs from US 80 towards I-20, Church St from Adams Street heading west, and Meehan-Savoy Rd from US 80.
- **Near-misses.** A gap within 5 m of a vertex the two roads share counts as that junction and isn't reported. On this data that hides nothing: no non-touching pair of segments from different roads is under 5 m, even without the exclusion.
- **`source.files`.** It lists every zip the build reads: the two road files, the rails file and the two water files.

## Reference lines

What `reference` in `data/roads.json` holds, and what TIGER says about it. Positions are true metres, so anything past the compression band has a different x in the file. Rail features are identified by LINEARID only, and the build doesn't read the rail `FULLNAME` field.

**Reference area.** The bounding box of every included road plus 500 m: x -5163 to 15419, z -2166 to 7594. Meehan-Savoy Rd sets the east and south sides, so the box is much bigger than the town.

**Clipping.** Whole TIGER vertices only, as on the roads: a line stops at its last vertex inside the box, never an interpolated one, so every vertex keeps its real lon/lat. Rail segments are long, so a line can stop well short of the edge. The railroad's west end is at x -5043, 120 m short of it. A line that leaves the box and comes back becomes two lines, in running order.

**Railroad.** Three lines:

| Vertices | From | To | What it is |
| --- | --- | --- | --- |
| 159 | x -5043, z 834 | x 8284, z -2159 | The line through town. It leaves the box to the north here. |
| 16 | x 11083, z -2162 | x 11906, z -2022 | The same line, back inside the box for about 1 km. |
| 22 | x 15404, z 3076 | x 14958, z 7530 | Feature 1103690413981, a separate rail line across the box's southeast corner. It doesn't touch the line through town inside the box, and no included road crosses it. |

The ticket's "railroad" is the first two. The third is in `lines` because it's R1011 inside the box, so plots and later work shouldn't read `lines` as one track. Feature 1106087712080 overlaps the box only by bounding box and has no segment inside, so it isn't in `linearIds`.

**River.** Four lines, walked from the westernmost end. TIGER records no flow direction, so this isn't a claim about which way the water runs.

| Vertices | From | To | What it is |
| --- | --- | --- | --- |
| 16 | x -4691, z -2163 | x -4632, z -2164 | A bend just inside the box's north edge. |
| 1199 | x -4560, z -2159 | x 661, z -45 | Past the west and near east trestles, to the gap. |
| 1039 | x 666, z -61 | x 6036, z 7591 | From the gap, across US 80 twice and the far east trestle, then southeast. |
| 32 | x 6227, z 7594 | x 6816, z 7549 | A bend just inside the box's south edge. |

- **The gap.** TIGER's `Chunky Riv` has a 16.2 m gap from x 661, z -45 (end of 1102216410608) to x 666, z -61 (start of 1102216410607). No other water feature in either county file has a vertex nearby, named or not. It stays open: nothing bridges it. It's about 27 m south of where US 80 crosses the river, so it doesn't hide a crossing.
- **The loop.** From the gap the river runs north to x 1256, z -1581 and back south, which is why US 80 crosses it at x 669 and again at x 1777.
- **Duplicates.** The build merges segments shared between county files, but the five real features share none.

**Trestles.** Each is one vertex shared by the rail and the river, so every cluster has one hit. Both lines' written geometry includes all three.

| id | Position | Straight line from center | Ticket |
| --- | --- | --- | --- |
| `trestle-east-near` | x 579, z 79 | 584.3 m | 580 m east |
| `trestle-east-far` | x 1073, z 191 | 1089.8 m | 1070 m east |
| `trestle-west` (`break down`) | x -4160, z 734 | 4224.4 m | 4160 m west |

The ticket's figures are closer to the east-west distance than to the straight line. The west trestle is 64 m over 4160 m in a straight line, which is inside the build's 100 m tolerance.

**Crossings.** Five, in order along each road: US 80 meets the river at x -4505, x 669 and x 1777, then the railroad at x 6121, which is past the Meehan-Savoy Rd junction at x 5808. Meehan-Savoy Rd meets the railroad at x 5939. Adams Street and Church St cross neither.

- All five are vertices shared by the road and the line, and a one-off check confirmed the road passes through the line at each. The build itself lists every contact without testing that, and adds a report line for any contact that isn't a shared vertex. There are none on this data.
- Crossings and trestles are found on the unclipped geometry. Crossings don't split road edges, so `nodes`, `roads` and `edges` are unchanged by adding `reference`.
- **Near-misses.** A gap within 30 m of a contact counts as that contact, because short segments next to a crossing or trestle sit close to the other line: 11 pairs of segments that don't touch come under 5 m, the closest 1.05 m apart, all within 6.4 m of a crossing or trestle. Nothing else comes under 5 m.

## Debug plot check

`node tools/plot-roads.js [out.svg]` draws `data/roads.json` in game coordinates with north up. Its default output, `data/raw/roads-debug.svg`, is gitignored, so no rendered plot is committed.

Checked by eye against the ticket's wording, not against another map. The west, near east and far east trestles plot at x -4160, 579 and 1073, each where the railroad meets the river, which matches the ticket's 4.16 km west and 0.58 km and 1.07 km east.

Two of the ticket's descriptions only partly hold. These are corrections to the descriptions, not to the data, and no geometry changed because of them:

- **"US 80 runs alongside the Chunky River".** From US 80's west end to true x 3000 the river stays within 1,240 m of the road and crosses it three times. East of that it falls away to the south, up to 3.4 km from the road's east end.
- **"The railroad runs east-west through town".** It does in town: 0.7° south of east from true x -1000 to 1223, and 8.7° north of east from the west end to town center. East of the far trestle it curves away, running about 32° south of east to its southernmost point at true x 4601, z 2150. It then swings north-east, crosses US 80 at true x 6121 and leaves the reference area to the north at true x 8284.

**Reading the band.** Compression draws that 32° stretch at about 68°, so the curve looks like a sharp V on the plot, and anything built from `points` gets the same V. The same renderer fed true metres from lon/lat with no compression shows a smooth curve.

## Inspector output

```text
TIGER/Line 2025, read from data/raw/
Origin 32.32583, -88.92806. Metres: +x is east, -z is north.
Road files: 8346 records, 8344 features after merging county-line duplicates. Every coordinate is exactly 6 decimals: True.
MTFCC counts: S1100 14, S1200 164, S1400 6713, S1500 16, S1630 259, S1640 4, S1740 408, S1750 748, S1780 18

(a) Target road names, grouped into connected components by shared vertices
    Components are listed nearest to town center first. Lengths are sums over
    records, so a divided stretch counts both carriageways.

  US Hwy 80: 4 component(s)
    22 m from town center at nearest, 5 record(s), 52860 m in total, MTFCC S1200
      1104259460504  S1200 Newton      22036 m long,     22 m from center, x -19865, z -751 to x 1254, z -227
      1105084070834  S1200 Lauderdale  12404 m long,   1274 m from center, x 1254, z -227 to x 12452, z -2091
      1104259460505  S1200 Newton        809 m long,  19879 m from center, x -20669, z -757 to x -19865, z -751
      1104259460506  S1200 Newton        806 m long,  19879 m from center, x -20669, z -757 to x -19865, z -751
      1104259460507  S1200 Newton      16804 m long,  20682 m from center, x -37072, z -2039 to x -20669, z -757
    12727 m from town center at nearest, 1 record(s), 11213 m in total, MTFCC S1100
      1106087441152  S1100 Lauderdale  11213 m long,  12727 m from center, x 12591, z -1855 to x 23245, z -3800
    12767 m from town center at nearest, 1 record(s), 11807 m in total, MTFCC S1100
      1106087441143  S1100 Lauderdale  11807 m long,  12767 m from center, x 23719, z -4276 to x 12627, z -1888
    23693 m from town center at nearest, 6 record(s), 30209 m in total, MTFCC S1200
      1104259471727  S1200 Lauderdale   1577 m long,  23693 m from center, x 23373, z -3878 to x 23826, z -4649
      1104469067226  S1200 Lauderdale    176 m long,  24268 m from center, x 23850, z -4503 to x 23826, z -4649
      1104259507905  S1200 Lauderdale   1186 m long,  24275 m from center, x 23826, z -4649 to x 24222, z -5737
      1104259470692  S1200 Lauderdale    722 m long,  24892 m from center, x 24222, z -5737 to x 24589, z -6349
      1104259507904  S1200 Lauderdale    716 m long,  24892 m from center, x 24222, z -5737 to x 24589, z -6349
      1104259507903  S1200 Lauderdale  25831 m long,  25395 m from center, x 24589, z -6349 to x 48993, z -11129

  Adams St: 2 component(s)
    284 m from town center at nearest, 1 record(s), 870 m in total, MTFCC S1200
      1104259460560  S1200 Newton        870 m long,    284 m from center, x -283, z -23 to x -286, z -893
    21904 m from town center at nearest, 1 record(s), 133 m in total, MTFCC S1400
      110168391111   S1400 Newton        133 m long,  21904 m from center, x -21927, z 803 to x -21894, z 674

  Church St: 2 component(s)
    344 m from town center at nearest, 1 record(s), 855 m in total, MTFCC S1400
      110168391385   S1400 Newton        855 m long,    344 m from center, x -281, z -199 to x -1097, z -410
    7955 m from town center at nearest, 1 record(s), 590 m in total, MTFCC S1400
      110168391384   S1400 Newton        590 m long,   7955 m from center, x -8451, z 812 to x -7922, z 726

  Meehan Savoy Rd S: 1 component(s)
    5596 m from town center at nearest, 1 record(s), 8043 m in total, MTFCC S1400
      110470585272   S1400 Lauderdale   8043 m long,   5596 m from center, x 7416, z 6233 to x 5808, z -216

  Meehan Savoy Rd W: 1 component(s)
    9688 m from town center at nearest, 1 record(s), 8854 m in total, MTFCC S1400
      1104259508037  S1400 Lauderdale   8854 m long,   9688 m from center, x 14919, z 6058 to x 7416, z 6233

  Meehan Savoy Rd S and W together: 1 component(s)

(b) Shortest path from the north end of Adams St to I-20, over all road features

  Start: -88.931100, 32.333858 (x -286, z -893)
  I-20: 1104470496326, 1104259462209, 1106087288220, 1104469115721 (RTTYP I, route number 20)
  Ramps: 70 S1630 features share a vertex with I-20, and 65 more connect to it through other ramps

  Reached -88.931465, 32.341099 (x -320, z -1698) after 817.2 m. On that path:
     774.0 m  Chunkey Duffee Rd 1106087296718 S1200
     774.0 m  Chunky Duffee Rd 1106087438880 S1200
     774.0 m  State Hwy 889 1104259409674 S1200
      43.3 m  (unnamed) 1104259461433 S1630
    Features on the same edges are each listed in full, so these overlap.

  Ramps and I-20 along the road that continues Adams St (Chunkey Duffee Rd, Chunky Duffee Rd, State Hwy 889):
     774.0 m  -88.931164, 32.340809 (x -292, z -1666)  (unnamed) 1104259461433 S1630, 1 other ramp(s) from I-20
     808.8 m  -88.931177, 32.341122 (x -293, z -1700)  (unnamed) 1102154921111 S1630, 1 other ramp(s) from I-20
     815.6 m  -88.931179, 32.341183 (x -293, z -1707)  (unnamed) 1102154921471 S1630, 1 other ramp(s) from I-20
     918.4 m  -88.931214, 32.342107 (x -296, z -1810)  I- 20 1104259462209 S1100, I-20 itself

(c) Do Meehan Savoy Rd and Church St touch US 80 or Adams St?
    US 80, Adams St and Church St here are the components nearest town center.
    Adams St against US 80 is included, since the road starts there.

  Meehan Savoy Rd touches US 80
    shared vertex -88.866250, 32.327776 (x 5808, z -216), on ['110470585272'] and ['1105084070834']
    geometric check: smallest gap 0.0 m, 0 crossing(s) away from a shared vertex

  Meehan Savoy Rd does not touch Adams St
    geometric check: smallest gap 5868.9 m, 0 crossing(s) away from a shared vertex

  Church St does not touch US 80
    geometric check: smallest gap 175.9 m, 0 crossing(s) away from a shared vertex

  Church St touches Adams St
    shared vertex -88.931047, 32.327620 (x -281, z -199), on ['110168391385'] and ['1104259460560']
    geometric check: smallest gap 0.0 m, 0 crossing(s) away from a shared vertex

  Adams St touches US 80
    shared vertex -88.931069, 32.326036 (x -283, z -23), on ['1104259460560'] and ['1104259460504']
    geometric check: smallest gap 0.0 m, 0 crossing(s) away from a shared vertex

(d) Trestles and the junction that set US 80's clip bounds

  Chunky Riv:
    110168391381      941 m
    1102216410608   14721 m
    1102216410607    2127 m
    110470583325    22258 m
    110470583324     2977 m
  Railroad features overlapping the river's bounding box:
    110470585569    16718 m, x 16766 to x 4981
    110470586701     4279 m, x 4981 to x 1254
    110168393895     8119 m, x 1254 to x -6765

  Railroad meets Chunky Riv at 3 shared vertices:
    4.16 km west of center: -88.972335, 32.319228 (x -4160, z 734)
    0.58 km east of center: -88.921898, 32.325122 (x 579, z 79)
    1.07 km east of center: -88.916641, 32.324111 (x 1073, z 191)
  Geometric check: smallest gap 0.0 m, 0 crossing(s) away from a shared vertex

  x = -4670: 500 m past the west trestle (x -4160.2), rounded
    US 80 crosses this bound 1 time(s)
    last whole vertex inside: -88.977682, 32.324180 (x -4663, z 183) on 1104259460504, 502 m in x and 745 m in a straight line from the west trestle

  x = 6310: 500 m past the Meehan Savoy Rd junction (x 5807.8), rounded
    US 80 crosses this bound 1 time(s)
    last whole vertex inside: -88.861459, 32.330993 (x 6258, z -574) on 1105084070834, 450 m in x and 575 m in a straight line from the Meehan Savoy Rd junction

  Meehan Savoy Rd spans x 5213 to x 14919. Its junction with US 80 is 5812 m from center. Its nearest vertex is a bend at x 5226, z 2002, 5596 m away.
```
