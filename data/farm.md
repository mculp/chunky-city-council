# The farm south of the bridge

`data/farm.json` holds where the woods stop on the big farm south of the Chunky River Bridge, its fences and the trees that stand out on their own. It's written by hand, `src/farm.js` loads it, and `index.html` draws it.

Nothing in the game or on the map says whose it was. The buildings are in `data/structures.json` by their structure ids like any others, its road and tracks are in `data/lanes.json`, and its ponds are in `data/water.json`.

## Where it comes from

| What | Source | Licence |
|---|---|---|
| The outlines, the fences and the trees | [National Agriculture Imagery Program](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer) aerial, by USDA, by eye to about 10 m | Public domain |
| What the fence looks like, and that the road's gravel | Street View by eye, from Griffis Fountain Rd and written down here in words | |

No geometry comes from Google imagery, and no imagery's in the repo.

The fence is woven wire about 1.2 m high on dark posts every 4 m or so, with a braced post either side of a gateway. Griffis Fountain Rd is gravel with the red clay showing through it, on both sides of the bridge, which is why it's marked `gravel` in `tools/road_config.json` and `tools/lane_config.json` and not what its class would have made it.

## Decided around it

- Trees don't grow on open land, and woods within 44 m of it have no gaps, as they don't on the aerial, so a pasture has a hard edge. Everywhere else, the woods are what they always were.
- A tree in `lone` stands where it really does, in the same pool of trees as the rest of the woods, so it costs nothing and comes down the same. Which sort and how big comes from a hash. Most are pines. A big leafy tree in this art is a few huge polygons.
- The fence is 1.1 m, which he can jump. It stops him walking and it goes over a run of three spans at a time, like the chain-link in town. It doesn't stop a truck. It stands on the ground as it is, which rolls out here, so each post and each span goes up and down with it.
- It's cut wherever a road, a drive, a building or water is in the way, which makes the gateways. There's no gate in any of them, as there wasn't at the one I could see.
- A pasture isn't levelled, so it keeps the roll of the land and it's not a `pad`. Its yard is.
- Nothing's alive out here. There's cattle on the aerial, and those aren't in the game.
- The bales, the tractor, the trailer and the two stock tanks are where the aerial has something of about that shape. It can't say what make the tractor is, and it hasn't got one.

## Schema

| Field | Type | |
|---|---|---|
| `version`, `units`, `axes`, `source` | | 1, metres, +x east and +z south in true metres from town center, and who it's by |
| `open` | object[] | Where it's pasture: `id`, `seen`, and `ring`, its outline |
| `woods` | object[] | Trees left standing in the middle of that: `seen` and `ring` |
| `young` | object[] | Where young pines stand in rows: `seen` and `ring` |
| `fences` | [x, z][][] | Each fence as a line. The ones along Griffis Fountain Rd are that road, 5.5 m to its east |
| `scars` | [x, z][] | Bare rings about 15 m across where round bales have been fed for years |
| `bales` | [x, z, turn][] | Round bales. The first five are out by those rings, and the others are in the yard |
| `lone` | [x, z][] | The trees that stand on their own |

`src/farm.js` doesn't look at outlines once it's loaded. It fills a grid of 8 m squares, so asking what's at a spot takes the same time out here as anywhere else, and that's asked for every point of ground and for every tree.

## Checking it

`npm test` checks the file and the logic. `npm run farm` goes and plays it.
