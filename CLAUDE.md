# Chunky 2026

A phone-first survival game set in post-apocalyptic Chunky, Mississippi. The backlog is the "chunky survival" project in Linear (team CHUNKY).

Read `docs/art-direction.md` before changing anything visible. `reference/stuckeys-bridge.html` is reference material, not part of the game. Don't edit it.

## Rules

- All art is procedural three.js. Don't add image, model or texture files.
- No real trademarks on labels, signs, filenames or docs. Use invented brands or the orange warning triangle.
- No Gen Z or Gen Alpha slang in game text.
- Roads come from Census TIGER/Line data. Never derive geometry from Google imagery or commit any. Comparing by eye is fine, and differences get filed as corrections.
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
- Scripts that generate it go in `tools/`. Commit the generated JSON. Raw downloads such as TIGER zips go in `data/raw/`, which is gitignored.

## Coordinates

- 1 unit = 1 m. +X is east, +Y is up and -Z is north.
- Map data has its origin at town center, 32.32583, -88.92806, and uses a local equirectangular projection with R = 6,371,000 m: `x = R * dLon * cos(lat0)`, `z = -R * dLat`, in radians.
- Chapter 1's scene isn't on the map yet: its origin is the bridge and its town is a placeholder. East and west already agree (the west bank is at -X, the church at +X), but its tracks run north-south where the real railroad runs east-west.

## Running it

```sh
python3 -m http.server
```

Then open http://localhost:8000.

## Tests

`npm test` runs `node --test` for data and logic. Name test files `*.test.js`. There are no tests yet.

A Playwright smoke test is planned, using a game test hook to fix the clock and seed, jump to a phase, place the player and read state. Neither exists yet.
