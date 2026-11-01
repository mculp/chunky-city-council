# Chunky 2026

A phone-first survival game set in post-apocalyptic Chunky, Mississippi. Chapter 1, "Cut Down", is playable now.

## Play

```sh
python3 -m http.server
```

Then open http://localhost:8000. It needs a network connection for three.js and the fonts.

- **Touch:** left thumb moves, drag to look, and the buttons say what they do.
- **Keyboard:** WASD or arrows move, hold Shift to run, Space jumps or swims faster, E uses, M is the map, drag to look. A strip at the bottom shows the keys that work right now.

## What's here

- `index.html`: the game
- `src/map.js`: the road graph as the game walks on it
- `src/looks.js`: draws what everyone but the hero wears, from `data/looks.json`
- `src/structures.js`: turns every real building's footprint into walls, windows, doors and a roof, in pieces that can break
- `reference/stuckeys-bridge.html`: the scene the game grew out of
- `docs/art-direction.md`: how it should look
- `data/roads.json`: the road graph of real Chunky, MS, generated from Census TIGER/Line data
- `data/roads.md`: where that data comes from, its schema and how to regenerate it
- `data/structures.json`: every real building within reach of those roads, generated from FEMA and ORNL footprints, USDA aerials and our own notes
- `data/structures.md`: where that data comes from, what's left out and why, and how to regenerate it
- `tools/`: the scripts that fetch the source data, build the road graph and plot it
- `tools/smoke.mjs`: plays Chapter 1 in Chrome (`npm i`, then `npm run smoke`)
- `tools/walk-roads.mjs`: walks every road end to end in Chrome (`npm run walk`)
- `tools/play-chapter1.mjs`: plays Chapter 1 on foot in Chrome, from the bridge to the final objective (`npm run play`)
- `tools/play-horde.mjs`: plays against the crowd in Chrome and reports what it costs (`npm run horde`)
- `tools/play-drive.mjs`: drives every kind of vehicle in Chrome, on the roads and off them, into walls and through the crowd (`npm run drive`)
- `tools/map-overlay.mjs`: draws TIGER's lines over a top-down capture of the game and measures the difference (`npm run overlay`)
- `tools/structure-overlay.mjs`: draws the game's buildings over a public-domain aerial of the same ground (`npm run overlay:structures`)

## Credits

- Roads, the railroad and the river: US Census Bureau TIGER/Line.
- Building footprints: [USA Structures](https://www.arcgis.com/home/item.html?id=0ec8512ad21e4bb987d7e848d14e7e24) by Oak Ridge National Laboratory (ORNL) and the Federal Emergency Management Agency (FEMA) Geospatial Response Office, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). We've clipped a few, moved them along compressed road and added what they look like.
- Roof colours: USDA National Agriculture Imagery Program, public domain.
