# Chunky 2026

A phone-first survival game set in post-apocalyptic Chunky, Mississippi. Chapter 1, "Cut Down", is playable now.

## Play

```sh
python3 -m http.server
```

Then open http://localhost:8000. It needs a network connection for three.js and the fonts.

- **Touch:** left thumb moves, A acts, B boosts or jumps, drag to look.
- **Keyboard:** WASD or arrows move, E acts, Space boosts and jumps, drag to look.

## What's here

- `index.html`: the game, in one file
- `reference/stuckeys-bridge.html`: the scene the game grew out of
- `docs/art-direction.md`: how it should look
- `data/roads.json`: the road graph of real Chunky, MS, generated from Census TIGER/Line data
- `data/roads.md`: where that data comes from, its schema and how to regenerate it
- `tools/`: the scripts that fetch the source data, build the road graph and plot it
- `tools/smoke.mjs`: plays Chapter 1 in Chrome (`npm i`, then `npm run smoke`)
