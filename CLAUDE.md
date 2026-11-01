# Chunky 2026

A phone-first survival game set in post-apocalyptic Chunky, Mississippi. The backlog is the "chunky survival" project in Linear (team CHUNKY).

Read `docs/art-direction.md` before changing anything visible. `reference/stuckeys-bridge.html` is reference material, not part of the game. Don't edit it.

The owner sends lore for the story. It goes in `docs/lore.md` in their words as soon as it's sent, built or not. Nothing gets added to it.

## Rules

- All art is procedural three.js. Don't add image, model or texture files.
- Only the hero has his hoodie and his taped head. They're the owner's own. Everyone else wears a look from `data/looks.json`.
- No real trademarks on labels, signs, filenames or docs. Use invented brands or the orange warning triangle.
- No Gen Z or Gen Alpha slang in game text.
- Roads come from Census TIGER/Line data. Never derive geometry from Google imagery or commit any. Comparing by eye is fine, and differences get filed as corrections.
- Buildings come from FEMA and ORNL's USA Structures, which is CC BY 4.0, so its credit stays with it. Street View is for writing down what a building looks like, in words, in `tools/structure_notes.json`. No business names, people's names or street addresses go in there, because most of these are someone's home. Real businesses go under invented names.
- No music without rights. `data/sound.md` says what's known about the rights to what's in `audio/`.
- Keep it working on a phone with touch controls. The target is 30+ zombies on screen at 30 fps.
- Keep `prefers-reduced-motion` working.

## Making decisions

- Technical questions: decide, and record the assumption in the PR.
- Creative questions: don't invent characters, what the zombies are, story or dialogue. Stop and ask the owner.

## Stack

- A static site with no bundler and no build step. All the code is in `index.html` today. New code can split into ES modules under `src/`.
- three.js is pinned to 0.160.0 from jsDelivr by the importmap in `index.html`.

## Data

- Game data is JSON under `data/`, such as `data/roads.json`, with its schema documented alongside it.
- Dialogue and the relationship meters are in `data/cast.json`, documented in `data/cast.md`.
- What the church signs say is in `data/signs.json`, documented in `data/signs.md`, and all of it can be read at `#signs`.
- What every sound and part of the score is, and how loud, is in `data/sound-new.json`, documented in `data/sound.md`. That's what the game plays: music and sounds made with ElevenLabs, which the owner chose. A file in `audio/` and one line there take a sound's place, without touching the code. The sounds worked out from code stay too, and nothing writes over them: `data/sound.json` is their sheet, `#sounds` is their board and `#old` plays the game with them.
- Scripts that generate it go in `tools/`. Commit the generated JSON. Raw downloads such as TIGER zips go in `data/raw/`, which is gitignored.
- Python tools run from a `.venv/` at the repo root, also gitignored, with dependencies pinned in `tools/requirements.txt`. Don't install anything globally.

## Coordinates

- 1 unit = 1 m. +X is east, +Y is up and -Z is north.
- Map data has its origin at town center, 32.32583, -88.92806, and uses a local equirectangular projection with R = 6,371,000 m: `x = R * dLon * cos(lat0)`, `z = -R * dLat`, in radians.
- The game's world is that map moved over so that its origin is Stuckey's Bridge, where Stuckey Bridge Rd really crosses the river, so the opening scene never moves. Town center is about 6.8 km west and 7.8 km north of it. The map is true scale. Only the road and river right at the bridge are bent, for the opening. `src/map.js` converts everything, and `data/roads.md` has the formulas. Place new things with `atTrue(x, z)`, in true metres from town center.
- What breaks is in `src/damage.js`, and how it looks and what breaks it is in `index.html` under "what burns and what goes up". A piece is known by its place in its building, so damage survives a cell being dropped and written again. Stuckey's Bridge doesn't break.
- Keep the opening as it is. The first scene's terrain, trees and random sequence are deliberately untouched inside its square, which is why `firstSceneH` exists and why new code doesn't call `rnd()`. Use `hash()` for anything new that needs to be random and repeatable.

## Running it

```sh
python3 -m http.server
```

Then open http://localhost:8000.

## Tests

`npm test` runs `node --test` for data and logic. Name test files `*.test.js`.

`npm run smoke` plays Chapter 1 in real Chrome and fails on a wrong beat or a console error. It needs `npm i` first and takes `--shots dir` for screenshots and `--touch` for a phone viewport.

`npm run walk` walks every road end to end, both ways, with the game's own movement code.

`npm run play` plays Chapter 1 on foot from where he wakes on the Chunky River Bridge to its final objective, following the objective's arrow, and fails if anything's blocked or unreachable. `npm run smoke` teleports between beats, so it can't catch that.

`npm run horde` plays against the crowd with real key presses and taps: they roam the real map, notice him, run him down and grab him, and he gets away. It also reports what 48 of them cost.

`npm run overlay` draws TIGER's centerlines over a top-down capture of the game and measures every intersection against them. It writes to `data/raw/` and fails on anything outside the tolerance. `data/roads.md` has the details.

`npm run drive` finds every kind of vehicle where it's parked and drives it with real key presses and the phone's stick: along the real roads and off them, into walls, through the crowd, into the river, and out again.

`npm run field` walks onto the ball field from Adams St, runs the bases, and checks that the fence and backstop stop him and that the gates let him through, on foot and in a pickup.

`npm run sound` plays the game with the sound on, in real time: nothing until a touch, the mute, a hidden tab, the score through the opening, his feet on each surface, driving, the crowd, and a track and a voice line swapped in with nothing changed but the sheet, and then every real file in `audio/` on a phone-sized page. It can't say whether any of it sounds good. `-- --old` plays it through with the sounds worked out from code.

`npm run sound:make` says what making the music and sounds with ElevenLabs on fal would cost, and `-- --go` makes them. `npm run sound:measure` then measures every file in `audio/` and fails on one that's silent, clipped, cut short, swells or clicks as it loops, or lands late, and `-- --pictures dir` draws their spectrograms. `npm run sound:level` sets `data/sound-new.json`'s levels to match the old sheet's, so run it after making anything over. The budget is a running total, kept in `audio/manifest.json`. `data/sound.md` has the rest.

`npm run lore` goes and looks at what's come from the lore: every church's sign, what it says today and tomorrow, and what happens when it's hit, then Robby's lot, walking there from where he wakes, what Robby says and that he only says it once, the flies, the deer meat, and what a truck does to it. It takes `--shots dir`.

`npm run water` walks into a pond and swims across it, floods a pickup in another, and checks that the crowd keeps out, that nothing real ended up under water, and that the ponds are on the map. The ponds are in `data/water.json`, documented in `data/water.md`.

`npm run wreck` wrecks the town with real key presses and taps: through a house and through brick in a pickup, over a young tree and into a big one, into a parked car, a hammer through a wall, a can through a window, cars going up and a house burning down, then that it all stays down after going away and coming back. It also reports what the worst of it costs.

The crowd comes out when Chapter 1 ends. `index.html?horde` brings it out as soon as town starts, which is the quick way to try it. `index.html#free`, or Skip to town on the title card, goes straight to town with the crowd out and three gas cans. It's an anchor because that's the only part of an address the shared link passes on.

Chapter 1's bridge run ends in a moccasin bite, a fever dream and waking on the Chunky River Bridge at the edge of town: the modes `bitten`, `dream` and `wake`. `jump('town')` puts him where he wakes.

`index.html?test` adds `window.__game`, which is what the smoke test drives. The clock starts held. `step(seconds)` advances it and `sim(seconds)` does the same without drawing, `jump(phase)` starts a phase, `place(x, z)` moves the player, `key(k, down)` and `stick(x, y)` give input, `state()` reads the game, and Math.random is seeded. A background tab runs at about 1 fps, so test with the clock held or in a real window.
