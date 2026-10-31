# TIGER inspection findings

Working notes for the road graph docs (CHUNKY-35, step 8). They record what TIGER/Line 2025 says about the ticket's roads and why `tools/road_config.json` holds what it does. The last section is the output of `.venv/bin/python tools/inspect_tiger.py`.

Positions are metres from town center: +x is east, -z is north.

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

## For step 5 (compression band)

- Meehan Savoy Rd spans x 5213 to x 14919. It runs west of its junction as it heads south, so a band ending at x 5600 would compress part of it. To leave the road 1:1, end the band at x 5213 or lower.
- The far east trestle is at x 1073.

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
