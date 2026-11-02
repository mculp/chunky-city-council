# Chunky 2026

A phone-first survival game set in post-apocalyptic Chunky, Mississippi, on the real map at its real scale. Chapter 1, "Cut Down", is playable now.

## Play

```sh
python3 -m http.server
```

Then open http://localhost:8000. It needs a network connection for three.js and the fonts.

- **Touch:** left thumb moves, drag to look, and the buttons say what they do.
- **Keyboard:** WASD or arrows move, hold Shift to run, Space jumps or swims faster, E uses, F swings, Q throws a gas can, M is the map, drag to look. A strip at the bottom shows the keys that work right now.

Skip to town on the title card, or `index.html#free`, goes straight to free play: the whole map, the crowd out, three gas cans, and everything in town can be broken.

## What's here

- `index.html`: the game
- `src/map.js`: the road graph as the game walks on it
- `src/looks.js`: draws what everyone but the hero had on, from `data/looks.json`, and how far it's gone through them
- `src/structures.js`: turns every real building's footprint into walls, windows, doors and a roof, in pieces that can break
- `src/damage.js`: what breaks, what burns and what comes down with it
- `reference/stuckeys-bridge.html`: the scene the game grew out of
- `docs/art-direction.md`: how it should look
- `data/roads.json`: the road graph of real Chunky, MS, generated from Census TIGER/Line data
- `data/roads.md`: where that data comes from, its schema and how to regenerate it
- `data/lanes.json`: the smaller roads from the same Census data, and a generated drive to every building that needs one
- `data/lanes.md`: where that comes from, what's assumed about it and how to regenerate it
- `data/structures.json`: every real building within reach of those roads, generated from FEMA and ORNL footprints, USDA aerials and our own notes
- `data/structures.md`: where that data comes from, what's left out and why, and how to regenerate it
- `data/water.json`: the ponds within reach of those roads, generated from USGS's National Hydrography Dataset and corrections made by eye on a public-domain aerial
- `data/water.md`: where that data comes from, what's left out and why, and how to regenerate it
- `data/sound-new.json`: what every sound and part of the score is and how loud, for the music and sounds the game plays, made with ElevenLabs on fal
- `docs/lore.md`: what the owner has said about Chunky, in their words, and what's been built from it
- `data/signs.md`: what the church signs say and how to change it, all of it readable at `#signs`
- `data/sound.md`: how to swap a sound with a file and a line, where voice recordings go, and how to make music and sounds with ElevenLabs on fal
- `data/sound.json`: the same for the sounds worked out from code, which are kept, with their board at `#sounds` and the game playing them at `#old`
- `audio/`: the files that sheet plays, with what made each in `audio/manifest.json`
- `src/sound.js`: the levels, the mute, the sounds, the loops, the score and the voice lines
- `src/soundbank.js`: every sound worked out from numbers, which is what plays when a sound has no file
- `tools/`: the scripts that fetch the source data, build the road graph and plot it
- `tools/smoke.mjs`: plays Chapter 1 in Chrome (`npm i`, then `npm run smoke`)
- `tools/walk-roads.mjs`: walks every road end to end in Chrome (`npm run walk`)
- `tools/play-chapter1.mjs`: plays Chapter 1 on foot in Chrome, from where he wakes to the final objective (`npm run play`)
- `tools/play-horde.mjs`: plays against the crowd in Chrome and reports what it costs (`npm run horde`)
- `tools/play-lanes.mjs`: drives up a lane and a drive in Chrome, and checks what's on them (`npm run lanes`)
- `tools/play-drive.mjs`: drives every kind of vehicle in Chrome, on the roads and off them, into walls and through the crowd (`npm run drive`)
- `tools/play-field.mjs`: walks onto the ball field and tries its fence and gates, on foot and in a pickup (`npm run field`)
- `tools/play-station.mjs`: goes round the gas station for what's on its shelves, bars its door with the crowd outside, and checks that the crowd goes for its light (`npm run station`)
- `tools/play-water.mjs`: swims across a pond, floods a pickup in another and checks what's under them (`npm run water`)
- `tools/play-sound.mjs`: plays the game with the sound on and checks what it's playing (`npm run sound`)
- `tools/make-sound.mjs`: makes the music and sounds in `tools/sound_prompts.json` with ElevenLabs on fal, and says what it'd cost first (`npm run sound:make`)
- `tools/set-fal-key.sh`: saves a fal key for that, readable only by you
- `tools/measure-sound.mjs`: measures every file in `audio/` in Chrome and draws their spectrograms, since nothing here can hear (`npm run sound:measure`)
- `tools/level-sound.mjs`: sets the levels in `data/sound-new.json` to match the old sheet's, so comparing them is about the sound (`npm run sound:level`)
- `tools/play-lore.mjs`: goes and looks at what's come from the owner's lore in `docs/lore.md`, like the church signs, and hits them (`npm run lore`)
- `tools/play-wreck.mjs`: crashes, burns and blows up the town in Chrome and reports what the worst of it costs (`npm run wreck`)
- `tools/map-overlay.mjs`: draws TIGER's lines over a top-down capture of the game and measures the difference (`npm run overlay`)
- `tools/structure-overlay.mjs`: draws the game's buildings over a public-domain aerial of the same ground (`npm run overlay:structures`)

## Credits

- Roads, the railroad and the river: US Census Bureau TIGER/Line.
- Building footprints: [USA Structures](https://www.arcgis.com/home/item.html?id=0ec8512ad21e4bb987d7e848d14e7e24) by Oak Ridge National Laboratory (ORNL) and the Federal Emergency Management Agency (FEMA) Geospatial Response Office, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). We've clipped a few, moved them along compressed road and added what they look like.
- Roof colours, and the ponds' corrections: USDA National Agriculture Imagery Program, public domain.
- Ponds: US Geological Survey National Hydrography Dataset, public domain.
- The music and sounds in `audio/`: generated with ElevenLabs' models on fal. `data/sound.md` has what's on record about the rights.
