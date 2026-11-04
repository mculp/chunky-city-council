# Hills

`data/hills.json` holds how far the land stands over the floodplain, everywhere on the map. `tools/build_hills.py` generates it, `src/hills.js` reads it, and `index.html` draws the world on it.

## Where it comes from

| What | Source | Licence |
|---|---|---|
| Elevation | [3D Elevation Program](https://www.usgs.gov/3d-elevation-program), by the US Geological Survey, through its [image service](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer) | Public domain |

It's fetched once at about 25 m a pixel east-west and 30 m north-south, which is coarser than the survey but finer than anything that can be told apart at night. Town comes out at 96 m, and the published figure's 97 m. The download is cached in `data/raw/hills/`, which is gitignored.

Nothing's exaggerated. The heights are the real ones, over the river they run down to.

## The world stays flat

Walking, driving, the crowd, what breaks and everything solid happen on the same flat world they always have, with the ground at `TOWN_Y` and the roads at `ROAD_TOP`. Only what's drawn goes up and down.

Every vertex goes up by how high the land is where it stands, less how high it is where he is. So:

- He doesn't move on the screen, and what he's standing on doesn't either. Nothing can float or sink, because the ground, the road, a parked truck and his feet all go up by the same amount at the same spot.
- Nothing in the game's rules had to change, and whatever comes to run the game on a server later has no hills to know about.
- A vehicle's front and back go up by different amounts, which is what pitches it on a slope. A tree or a post isn't a slope, and goes up whole, as near as it matters.
- A slope doesn't slow anything down. That's a decision and not a limit. It'd be a small term in `stepVehicle`.

`hill_pars` in `index.html` is the lookup, on the graphics card. It's the same cubic spline as `at()` in `src/hills.js`, four linear texture lookups there and sixteen numbers here, and `npm run hills` checks they agree. What's built into three.js gets it by patching `project_vertex` and the sprite shader. **A new `ShaderMaterial` with a vertex shader of its own has to `#include <hill_pars>` and use `hillOver`, or define `FLAT_WORLD`, or it'll be left at the bottom of the hills.** `npm run hills` looks through every material in the scene for one that hasn't. Only the sky and the moon are left out.

Anything long has to have enough points to go over a hill, so roads, lanes and the tracks go through `HILLS.follow(points)`, which adds them only where a straight stretch would leave the land by more than 1.5 cm. On the flat it adds nothing.

Lights and what's out of view are worked out on the CPU, so `scene.onBeforeRender` moves each `PointLight` up for the length of the frame, and the check for what's in view is told where a thing is drawn and not where it stands. The camera's kept above the land behind him.

## What's done to the land

Out of the survey comes a height above sea level, and these are what happens to it, in order.

1. **It's measured from the river.** The river falls about 17 m across the map, so each pixel is taken from the river's level nearby, less `TOWN_Y`, since town has always stood that far above the water. Nothing goes below that but at the foot of Chestnut St, below, and the land comes up off the floodplain without a crease.
2. **The roads and tracks are graded.** The railroad doesn't follow every rise, so it runs on an average of the land it crosses, 300 m of it either way, and the land's cut and filled to it for 15 m either side and is back to its own by 60 m. US 80 is a highway, built to long, even grades, so it's done the same with 90 m either way. Every other paved road goes over a hill the way the land does, with only a pixel's roughness taken out of it. Gravel and dirt lanes and the drives aren't graded. They're just on the land.
3. **The river and the first scene are cleared.** Nothing's above the floodplain within 60 m of the river, and the land comes up from it no more steeply than a bluff, or a road where there's a road going up it. The same goes for 380 m around Stuckey's Bridge, so the first scene's square is exactly as it was when he goes back to it.
4. **Buildings are levelled.** Somebody levelled most of the ground a building stands on, so each one's taken down to 3% of lean, or 5% next to a paved road, which has a slope of its own to keep. A pixel's 30 m, so that takes a good piece of land. It's done three times, since they overlap, with a pixel between two going mostly with the nearer. Then the paved roads are graded again: US 80 to what's around it now, and every other one back to the land as it was before anything was levelled, since the ground a building's on isn't the street's. Of 1,130 buildings, 7 still lean more than 8%, and none more than 11%.
5. **Ponds are level.** The land's all one height to 45 m from a pond's shore, and it's back to its own by 110 m, but for the pond at the foot of Chestnut St. Ponds that run together share a height, because a pixel can only be one. This comes after the buildings and roads, and the buildings are levelled once more around them without touching that flat ground.
6. **Swimming pools are level.** They and whatever's within 40 m of them come last. A pool's water is the same water as a pond's, and its coping would show it.
7. **The river and the first scene are cleared again**, since all of that takes some of them with it.

The streets were measured against the survey at 2 m a pixel: Adams St either way from Gallatin, which is at the bottom of a rise both ways, and Chestnut St climbing from Griffis Fountain Rd. The grid this is built from keeps all but a few tenths of a metre of their hills. What took them was grading every paved road like a highway, levelling the buildings into the streets, and a pond's and the railroad's flat ground reaching further than it does in life. Adams St is now within half a metre of the survey either way, about 3 m up to the brow south of Gallatin and 4.5 m up 450 m north of it.

Chestnut St is the one place the land goes below the floodplain. It's straight up the road from the bridge he wakes on, and it comes up off Griffis Fountain Rd out of the river bottoms, from 2.1 m under the floodplain on this grid to its brow 7.9 m over the corner on the 2 m survey. So `DIPS` in the builder brings the floor down 2.6 m within 60 m of the corner, and back up by 105 m, which is short of the river's 60 m. There's a pond 21 m from the corner whose water really stands 1.3 m over the road, behind a bank. The lookup reaches two pixels and the water has to be level, so at this resolution it can't stand over a road that close, and it's gone down to the corner's own height. Its flat ground only reaches 22 m, and the land's back to its own by 75 m. Chestnut St climbs 6.8 m now, from 15 m up from the corner, and no more steeply than the survey's 10% over 15 m. The grid itself only has 7.2 m of it, and the street's grading takes the rest. Griffis Fountain Rd comes down 2.1 m to the corner from the bridge, at about 2%. Really it goes on down into the bottoms, but the bridge and the river stay where they've always been.

One place wants two things at once. The compound on Pine Forest Rd stands on a real bluff about 20 m over the river, with a pool 72 m from the water, and the lookup reaches two pixels, so at this resolution it can't be level and have the river flat. So where a building's on a bluff the land can come up from 20 m off the river, and steeply, which lifts the river itself by up to 2.2 m under that one bluff. The river's bed is 3 m down, so it's still under water. The river's sheet is one flat quad, so `uRiverUp` brings it up to him if he's swimming there.

Everywhere else the river can be seen, the land's within 13 cm of the bottom. Well away from any road the river's coarser, and higher, and nobody's near enough for that to show.

## The land past the fog

The fog stops the ground at about 200 m, so the file's coarse heights are drawn as a skyline too: the same land with a point every 150 m or so, from there out to the edge of the map, in the fog's colour going towards the sky's. The first 110 m are thrown away and the next bit's tucked under the ground, so it can't show through. It has 11 m added further off, which is what a hill's trees add to it, and very far land is pulled in so that it fits in front of the camera's far plane. 
## Before town

All of this is off until he wakes at the edge of town. `uHills` is a flat texture until then and the skyline's hidden, so the first chapter's frames are exactly what they were, right out to the horizon, where a far hill would otherwise show over the flat land by a pixel or two. The first scene's square is still kept flat in the data, because he can go back there.

## Trying them taller

The owner's choosing between the hills as they really are and taller ones, so there's a switch under the sound button once the hills are on. A tap flips it between REAL HILLS and HILLS ×2, where he stands. `uHillScale` multiplies every height that's drawn, along with the skyline's and the ones the code works out for whatever's drawn over the land. The world underneath stays as flat as ever, and so does everything that's levelled in the file, so a pond stays level at twice the height. It's on real hills each time the game starts, and it comes out once the owner has chosen.

## Schema

| Field | What it is |
|---|---|
| `version` | 1 |
| `units`, `axes` | Metres, and +x east, +z south, in true metres from town center |
| `source` | Who it's from, the service, when it was fetched, the sha256 of what came back and the licence |
| `elevation` | The lowest and highest ground on the map over sea level, and the highest over the floodplain, before any of the above |
| `dips` | Where the land goes below the floodplain: the place `x`, `z`, how far from it it's all the way down (`core`) and back up (`edge`), and how far down (`depth`), in metres |
| `x0`, `z0` | The outer corner of the first pixel, in true metres. Each height is at the middle of its pixel. |
| `dx`, `dz`, `cols`, `rows` | How far apart they are, and how many |
| `quantum` | How many steps to a metre |
| `coarse` | A height every `stride` pixels, `cols` by `rows` of them, for everything further away than can be seen up close |
| `data` | What to add to `coarse`, bilinearly interpolated, to get each pixel's height |

`data` and `coarse.data` are base64. Each number is what its neighbours suggest (left + up - corner) plus a zigzag varint, and a zero byte followed by a varint is a run with nothing to add. `decodeHills` undoes it.

To keep it small, `data` is only there within 420 m of a road or the tracks, which is as far as he can go and as far as he can see, or within 60 m of water. Elsewhere it's zero and all there is is `coarse`. A height can be one step out wherever that saves saying anything, except where it's flat and around water, which are exact. It's 144 KB.

## Regenerating it

```sh
.venv/bin/python -I tools/build_hills.py
```

`--refresh` fetches it again, and `--check` says whether the file matches what a fresh build would write. Run it again whenever the roads, lanes, ponds or buildings change, since they all shape it.

`npm test` checks the file: the first scene's flat, the river's where it should be, nothing's below the floodplain but in a dip, Chestnut St's climb, all water's level, and how far the buildings lean. `npm run hills` plays it in Chrome.

For measuring the map from overhead, `npm run overlay` flattens all of this first with `hills.flat()`, since a hill would only get in the way.
