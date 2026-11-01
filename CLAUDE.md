# Chunky 2026

A phone-first survival game set in post-apocalyptic Chunky, Mississippi. The backlog is the "chunky survival" project in Linear (team CHUNKY).

Read `docs/art-direction.md` before changing anything visible. `reference/stuckeys-bridge.html` is reference material, not part of the game. Don't edit it.

## Rules

- All art is procedural three.js. Don't add image, model or texture files.
- Only the hero has his hoodie and his taped head. They're the owner's own. Everyone else wears a look from `data/looks.json`.
- No real trademarks on labels, signs, filenames or docs. Use invented brands or the orange warning triangle.
- No Gen Z or Gen Alpha slang in game text.
- Roads come from Census TIGER/Line data. Never derive geometry from Google imagery or commit any. Comparing by eye is fine, and differences get filed as corrections.
- Buildings come from FEMA and ORNL's USA Structures, which is CC BY 4.0, so its credit stays with it. Street View is for writing down what a building looks like, in words, in `tools/structure_notes.json`. No business names, people's names or street addresses go in there, because most of these are someone's home. Real businesses go under invented names.
- No music without rights.
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
- Scripts that generate it go in `tools/`. Commit the generated JSON. Raw downloads such as TIGER zips go in `data/raw/`, which is gitignored.
- Python tools run from a `.venv/` at the repo root, also gitignored, with dependencies pinned in `tools/requirements.txt`. Don't install anything globally.

## Coordinates

- 1 unit = 1 m. +X is east, +Y is up and -Z is north.
- Map data has its origin at town center, 32.32583, -88.92806, and uses a local equirectangular projection with R = 6,371,000 m: `x = R * dLon * cos(lat0)`, `z = -R * dLat`, in radians.
- The game's world has its origin at Stuckey's Bridge, which is US 80's first river crossing, so the opening scene never moves. West of the edge of town it also lays US 80 straight along z 0. `src/map.js` converts everything, and `data/roads.md` has the formulas. Place new things with `atTrue(x, z)`, in true metres from town center, so they follow the map if its compression changes.
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

`npm run play` plays Chapter 1 on foot from the bridge to its final objective, following the objective's arrow, and fails if anything's blocked or unreachable. `npm run smoke` teleports between beats, so it can't catch that.

`npm run horde` plays against the crowd with real key presses and taps: they roam the real map, notice him, run him down and grab him, and he gets away. It also reports what 48 of them cost.

`npm run overlay` draws TIGER's centerlines over a top-down capture of the game and measures every intersection against them. It writes to `data/raw/` and fails on anything outside the tolerance. `data/roads.md` has the details.

`npm run drive` finds every kind of vehicle where it's parked and drives it with real key presses and the phone's stick: along the real roads and off them, into walls, through the crowd, into the river, and out again.

`npm run field` walks onto the ball field from Adams St, runs the bases, and checks that the fence and backstop stop him and that the gates let him through, on foot and in a pickup.

`npm run wreck` wrecks the town with real key presses and taps: through a house and through brick in a pickup, over a young tree and into a big one, into a parked car, a hammer through a wall, a can through a window, cars going up and a house burning down, then that it all stays down after going away and coming back. It also reports what the worst of it costs.

The crowd comes out when Chapter 1 ends. `index.html?horde` brings it out as soon as town starts, which is the quick way to try it. `index.html#free`, or Skip to town on the title card, goes straight to town with the crowd out and three gas cans. It's an anchor because that's the only part of an address the shared link passes on.

`index.html?test` adds `window.__game`, which is what the smoke test drives. The clock starts held. `step(seconds)` advances it and `sim(seconds)` does the same without drawing, `jump(phase)` starts a phase, `place(x, z)` moves the player, `key(k, down)` and `stick(x, y)` give input, `state()` reads the game, and Math.random is seeded. A background tab runs at about 1 fps, so test with the clock held or in a real window.
