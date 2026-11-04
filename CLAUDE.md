# Chunky 2026

A phone-first survival game set in post-apocalyptic Chunky, Mississippi. The backlog is the "chunky survival" project in Linear (team CHUNKY).

Read `docs/art-direction.md` before changing anything visible. `reference/stuckeys-bridge.html` is reference material, not part of the game. Don't edit it.

The owner sends lore for the story. It goes in `docs/lore.md` in their words as soon as it's sent, built or not. Nothing gets added to it.

## Rules

- All art is procedural three.js. Don't add image, model or texture files.
- Only the hero has his hoodie and his taped head. They're the owner's own. Everyone else is a radiating zombie of some degree, as the owner said in `docs/lore.md`, wearing a look from `data/looks.json`, and nobody else wears a hood.
- No real trademarks on labels, signs, filenames or docs. Use invented brands or the orange warning triangle.
- No Gen Z or Gen Alpha slang in game text.
- What's really there is the source of truth: Street View and the satellite, Google Earth's included. Roads start from Census TIGER/Line data and buildings from USA Structures, but don't rely on either alone, and where one disagrees with what Street View and the satellite show, correct it to match. Don't commit any of their imagery. The owner isn't selling the game or making money from it: it's just for fun.
- Buildings come from FEMA and ORNL's USA Structures, which is CC BY 4.0, so its credit stays with it. What a building looks like goes in `tools/structure_notes.json`, in words, and so does where its footprint's wrong. No business names, people's names or street addresses go in there, because most of these are someone's home. Real businesses go under invented names.
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
- The smaller roads and a drive to every building are in `data/lanes.json`, documented in `data/lanes.md`. To everything that asks what road is here they're roads, but `MAP.roads` stays the graph.
- The big farm south of the Chunky River Bridge, where the woods stop and its fences, is in `data/farm.json`, documented in `data/farm.md`.
- Dialogue and the relationship meters are in `data/cast.json`, documented in `data/cast.md`.
- What's in the pantry at the church on Church St, and how it fills back up a day at a time, is in `src/pantry.js`, also documented in `data/cast.md`. Its days are the church signs' Mississippi days.
- Everyone in town has a name, a personality and a memory of what he's done: `data/folks.json`, `src/agents.js`, documented in `data/folks.md`. None of it comes from `rnd()` or `crowdRand`, and half of everybody's an Alexander or a Clark and an eighth are Gressetts, which is the owner's. Most of the crowd have gone quiet and leave him be until he starts something, and the few who've burnt down come for him on sight, which is in `src/horde.js` and the same document. Most houses have someone at home, there's someone driving on the real roads and there are kids on four-wheelers on the lanes, which is in `src/traffic.js` and the same document. With `?test` all of those stay away until `fillTown()`, so that every test that isn't about them is left alone.
- The trains run on TIGER's railroad, one at a time and near wherever he is, with crossings that shut and three trestles he can walk: `src/trains.js`, documented in `data/railroad.md`. The words on the marker by the west trestle are in `data/railroad.json`. Nothing says whose railroad it is. With `?test` the train stays away until `trains.go()`.
- How high the land stands is in `data/hills.json`, documented in `data/hills.md`. The world's flat, and it's only what's drawn that goes up and down. A new `ShaderMaterial` with a vertex shader of its own has to `#include <hill_pars>` and use `hillOver`, or define `FLAT_WORLD`, and anything long goes through `HILLS.follow`.
- What the church signs say is in `data/signs.json`, documented in `data/signs.md`, and all of it can be read at `#signs`.
- What one stone in the cemetery says is in `data/stone.json`, documented in `data/stone.md`. It's empty, and it's the owner's to fill in: nobody else types those words.
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

`npm run horde` plays against the ones in the crowd who come for him on sight, with real key presses and taps: they roam the real map, notice him, run him down and grab him, and he gets away. It also reports what 48 of them cost.

`npm run overlay` draws TIGER's centerlines over a top-down capture of the game and measures every intersection against them. It writes to `data/raw/` and fails on anything outside the tolerance. `data/roads.md` has the details.

`npm run drive` finds every kind of vehicle where it's parked and drives it with real key presses and the phone's stick: along the real roads and off them, into walls, through the crowd, into the river, and out again.

`npm run field` walks onto the ball field from Adams St, runs the bases, and checks that the fence and backstop stop him and that the gates let him through, on foot and in a pickup.

`npm run station` goes round the gas station on a phone-sized page: in through the door, along the shelves and the counter for what's on them, bars the door with the crowd outside, breaks the boards with a hammer, and checks that the crowd gathers under the canopy's light and stops once it's out. It takes `--shots dir`.

`npm run sound` plays the game with the sound on, in real time: nothing until a touch, the mute, a hidden tab, the score through the opening, his feet on each surface, driving, the crowd, and a track and a voice line swapped in with nothing changed but the sheet, and then every real file in `audio/` on a phone-sized page. It can't say whether any of it sounds good. `-- --old` plays it through with the sounds worked out from code.

`npm run sound:make` says what making the music and sounds with ElevenLabs on fal would cost, and `-- --go` makes them. `npm run sound:measure` then measures every file in `audio/` and fails on one that's silent, clipped, cut short, swells or clicks as it loops, or lands late, and `-- --pictures dir` draws their spectrograms. `npm run sound:level` sets `data/sound-new.json`'s levels to match the old sheet's, so run it after making anything over. The budget is a running total, kept in `audio/manifest.json`. `data/sound.md` has the rest.

`npm run lanes` drives up a gravel lane and a dirt drive to somebody's door with the phone's stick, and checks that nothing stands on the lanes, the woods are cleared off them, what's underfoot, and no barricade across a road that carries on. `data/lanes.test.js` checks that they all join up and that every building has a way in.

`npm run lore` goes and looks at what's come from the lore: every church's sign, what it says today and tomorrow, and what happens when it's hit, then Charlie Flake's marker, then Robby's lot, walking there from where he wakes, what Robby says and that he only says it once, the flies, the deer meat, and what a truck does to it, and then the light on Stuckey's Bridge: that it isn't in the opening, that it comes when he goes back on foot or driving, goes through him, and that it all goes quiet while it does. It takes `--shots dir`.

`npm run hills` goes and looks at the hills: that the first scene is at the bottom of them, that the graphics card draws what `src/hills.js` says, and twice that with a real tap on the switch for trying them taller and back with another, that every material in the scene goes up with them, then a pickup up US 80's biggest hill with the phone's stick and back down it on foot, swimming under a bluff and in a pool on top of one. It takes `--shots dir`.

`npm run keys` plays with real key presses and a real mouse: looking with nothing held, WASD with the camera, a click that hits what's in the middle of the screen and a right click that throws there, what lets the mouse go, in a pickup, all of it again in an iframe that won't let a page take the mouse, and that a phone hasn't changed. It takes `--shots dir`. Chrome won't give a headless page the mouse, so that one part is stood in for.

`npm run water` walks into a pond and swims across it, floods a pickup in another, and checks that the crowd keeps out, that nothing real ended up under water, and that the ponds are on the map. The ponds are in `data/water.json`, documented in `data/water.md`.

`npm run farm` goes from the Chunky River Bridge down the gravel to the farm south of it on foot, then looks at what's growing where, gets stopped by a fence, jumps it, knocks it down and drives through it, swims the pond and walks its dock. It also reports what it costs to draw. It takes `--shots dir`.

`npm run wreck` wrecks the town with real key presses and taps: through a house and through brick in a pickup, over a young tree and into a big one, into a parked car, a hammer through a wall, a can through a window, cars going up and a house burning down, then that it all stays down after going away and coming back. It also reports what the worst of it costs.

`npm run lures` moves the crowd without fighting it, with real taps: each lure thrown off US 80 and how many are left on the road, through three lots of them with three kinds of lure, hunters taken off him, a car alarm set off from across a lot, into the river after a bottle, and someone who ends up with them all around. What each lure does is in `src/lures.js`.

`npm run compound` goes round the compound on Pine Forest Rd on a phone-sized page: up the measured drive from the road, in through every door, plays the drums, guitar, bass and keyboard with real taps and the crowd listening, swims the pool, goes down the hill to the cabin, up onto its deck and in, along the decks past the swing to the cinema and into the studio, watches the screen with the crowd coming to its light, and breaks the projector and the propane tank. It takes `--shots dir`. What's in it is under "the compound on Pine Forest Rd" in `index.html`, and `src/things.js` has what things look like that aren't vehicles.

`npm run yard` goes round the yard off True Light Rd on a phone-sized page: up the measured drive from the road, across the pool, gets stopped by the net and goes round it, keeps the ball up six times in a row with the stick and real taps, takes the bat that gets him, bounces on the trampoline, and gets in the coupe and drives it. What keeping the ball up does is in `src/volley.js`.

`npm run stumble` goes and finds what's only there for anyone who stumbles on it, on a phone-sized page with real taps: in from School St to the second trailer from the left, across its deck and down its length to the computer in the back, up to the screen and away again, breaks it, swims the green pool, drives a pickup up Chunky Duffee Rd from where the map used to stop, walks up the gravel loop and through the gate, finds its way between the stones to the one with words on it, and reads it. It takes `--shots dir`.

`npm run town` goes round the filled town on a phone-sized page: people at home who leave him be until he gives them a reason, someone coming and going, a drive along US 80 past people on their own side of the road, standing in the road, ramming one and taking another's car, and the kids, who can't be touched. It also reports what the busiest of it costs, and takes `--shots dir`.

`npm run agents` treats people differently with real taps and checks they behave differently afterwards, and still do after a reload: the same blow leaving one keeping away and another coming for him, someone who was there, a lure that stops working, someone following him about, and the families going around together. It takes `--shots dir`.

`npm run blend` gets through the ones who've burnt down on US 80 by passing for one of them, on a phone-sized page with real taps: SHAMBLE and the pace it holds him to, 30 of them crossed with nobody coming for him, the meters over their heads, one right up against him seeing through it, running, a swing and a light each giving him away to everyone close, beans making it harder, someone with a grudge not taken in, and C on a laptop. It takes `--shots dir`.

`npm run quiet` goes among the ones who've gone quiet, on a phone-sized page with the stick and real taps: how many have burnt down and how far gone they look, walking through 30 of them on US 80 with only the burnt ones coming for him, the rest folded over with their arms hanging, a swing bringing the one he hit and everyone close and nobody further off, a bottle thrown at one, a can picked up from at one's feet and one that isn't, the ones who come for him stood up and the ones who come low and quick, what they mutter, the same with reduced motion, and what 30 of them cost. It takes `--shots dir`.

`npm run fold` looks at how far over everyone stands, on a phone-sized page: the crowd's angles at the hips by how far gone they are, the ones who've burnt down the furthest over and nobody who's gone quiet stood up, a row of them side on drawn as their numbers say with their heads off the ground and their arms hanging till their hands reach it, the ones further over than a table coming for him low with their hands going like something crawling and the rest stood up, the cast a little over, someone at their door, a kid on a four-wheeler sat up straight, and the row again with reduced motion. It's measured from what went to the graphics card, and it takes `--shots dir`.

`npm run swing` starts with one walking straight at him and checks that it groans once and its glow flares as its hands go up, with the sound on from a real key press, and is back to its usual glow once it has hold of him. Then it stands still and swings at one walking straight at him, ten times on a phone-sized page with real taps and ten times on a laptop with real clicks: from straight ahead and off to the side, stood up and low and quick, tapped as soon as it's in reach and as late as while it's reaching for him. It fails unless nine in ten go down before they get hold of him. Then it watches one lie there and get up slowly, about ten seconds, with him stood over it, and checks the picture holds and tears when a swing lands and doesn't with reduced motion, and that the glow still flares with it. It takes `--shots dir`.

`npm run trains` waits by the railroad on a phone-sized page: that no train comes with `?test` until it's asked for and then they come on time, from each end in turn, the horn and the noise, a crossing shutting with its arms, lamps and bell and opening behind it, walking into its side and standing in front of it, all three trestles on foot with somewhere to stand clear and off the side into the river, the crowd coming to the horn and what it does to them, a parked truck and the one he's in, a driver waiting at the crossing, and the marker. Then the same with reduced motion. It reports what it costs and takes `--shots dir`.

`npm run church` goes round the church on Church St on a phone-sized page with the stick and real taps: in through the front door with the roof and the steeple out of the way, up the aisle and not across the pews, through the wing's wall to the pantry and what's on its shelf, Miss Bobby out front of her house by the town hall with the van she drives for Chunky Baptist, her steps swept in Chapter 1 and then once a day out of the pantry, over a week of days and after a reload, the bell rung from the rope with the crowd coming to it, into the church and out again after, E on a laptop, and the steeple coming down with the church. It takes `--shots dir`.

The crowd comes out when Chapter 1 ends. `index.html?horde` brings it out as soon as town starts, which is the quick way to try it. `index.html#free`, or Skip to town on the title card, goes straight to town with the crowd out and something of everything to throw. It's an anchor because that's the only part of an address the shared link passes on.

Chapter 1's bridge run ends in a moccasin bite, a fever dream and waking on the Chunky River Bridge at the edge of town: the modes `bitten`, `dream` and `wake`. `jump('town')` puts him where he wakes.

`index.html?test` adds `window.__game`, which is what the smoke test drives. The clock starts held. `step(seconds)` advances it and `sim(seconds)` does the same without drawing, `jump(phase)` starts a phase, `place(x, z)` moves the player, `key(k, down)` and `stick(x, y)` give input, `state()` reads the game, and Math.random is seeded. A background tab runs at about 1 fps, so test with the clock held or in a real window.
