# The mushroom rings

`data/rings.json` is where the rings of pale mushrooms are, which is fast travel's first part (CHUNKY-176). There are ten, at public places on the map, spread so that no road is far from one. They're all known from the start: every one is on the map from the first minute, and he can go from any of them to any other, because the map's 20 km across and nobody should have to drive it first. Stuckey's Bridge gets nothing new, and the nearest ring to it is the turn-off to Stuckey Bridge Rd, 1.5 km short of it.

| Field | Type | What it is |
|---|---|---|
| `version` | number | The schema's version. |
| `rings` | array | One for each ring, in no particular order. |
| `rings[].at` | string | Where it is, in words, for this file and the tests. Nothing in the game shows it. |
| `rings[].about` | [x, z] | About where it is, in true metres from town center, +z south. |

`about` is near enough, and often right on the junction it's named for. The page settles each ring at the nearest spot to it where the whole ring's on dry grass in the open, going round and out in 0.75 m steps. That's `settle` in `src/rings.js` and `ringSpot` in `index.html`, and it comes out the same every time. A spot that will do is:

- a step clear of every road and lane, so the mushrooms nearest the road are about a metre off its edge;
- clear of the railroad by 6 m and the river by 12 m, and on dry ground, out of the ponds;
- clear of anything built and the ground levelled round it, and of fences and anything else solid;
- in the open, with no tree within 5 m of its middle, so that nothing hides it;
- in nobody's yard: at least 30 m from any house, mobile home or cabin. A church, a shop or the gas station isn't anybody's yard.

Mostly that's 6 or 7 m from the junction, beside the road. If nothing within 40 m will do, it goes on out until something does, across the road if need be. The gas station's goes furthest, 29 m, to get clear of the levelled ground round it and its neighbours.

What's in a ring, and the trip, are `RING` and `TRIP` in `src/rings.js`:

- **A ring** is pale mushrooms round a circle 3 m across, with an ink line and a faint light of their own. A little of it lies on the grass under them, and spores drift up off them on the twelves, so that one can be found at night. Only a ring within 220 m is drawn.
- **On the map** each ring is a circle of pale dots, from the start, with no name, and on the minimap when one's in view.
- **EAT** comes up standing within 1.6 m of a ring's middle on foot, but not while anyone's got hold of him and not in a vehicle. It opens the map zoomed out to all ten, with the one he's in dim, and he taps the one he wants. Tapping the one he's in, or nowhere near one, does nothing, and backing out of the map does nothing.
- **The trip** is 3.5 seconds. He sits down as the world bends into the fever's pink and cyan, which is CHUNKY-142's, is at the other ring at the height of it, 1.9 s in, and comes to sitting up there as it goes, facing the road. With reduced motion it's a fade to dark and back, in 1.3 seconds, and he goes while it's dark.
- **Coming to,** nobody goes for him for 6 seconds, and nothing follows him through: anyone who was after him back where he ate has lost him.
- **A vehicle** he got out of to eat stays where he left it.
- **Online,** the pose says he's on a trip (`HOW.trip` in `src/net.js`) from when he sits down till he's up, and the pose from where he's come to goes at once, so it arrives as one step.

There isn't a word in any of it (CHUNKY-158). The ring, the glow and EAT are enough.

More rings come with the fish camp (CHUNKY-149) and the jam (CHUNKY-133) once they're built. Anywhere else is the creative director's to add.

`npm run rings` plays all of it on a phone-sized page with real taps, and `src/rings.test.js` has the sheet, the trip's times and how a ring settles.
