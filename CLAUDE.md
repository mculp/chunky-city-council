# Chunky 2026

A phone-first survival game set in post-apocalyptic Chunky, Mississippi. The backlog is the "chunky survival" project in Linear (team CHUNKY).

Read `docs/art-direction.md` before changing anything visible. `reference/stuckeys-bridge.html` is reference material, not part of the game. Don't edit it.

The owner sends lore for the story. It goes in `docs/lore.md` in their words as soon as it's sent, built or not. Nothing gets added to it.

## Making decisions

- Technical questions: decide, and record the assumption in the commit.

## Stack

- A static site with no bundler and no build step. All the code is in `index.html` today. New code can split into ES modules under `src/`.
- three.js is pinned to 0.160.0 from jsDelivr by the importmap in `index.html`.

## Data

- Game data is JSON under `data/`, such as `data/roads.json`, with its schema documented alongside it.
- Roads start from Census TIGER/Line data and buildings from FEMA and ORNL's USA Structures, which is CC BY 4.0, so its credit stays with it. Street View and the satellite, Google Earth's included, are what they're checked and corrected against, and none of Google's imagery is committed. What a building looks like, and where its footprint's wrong, is in `tools/structure_notes.json`, in words and without street addresses.
- The smaller roads and a drive to every building are in `data/lanes.json`, documented in `data/lanes.md`. To everything that asks what road is here they're roads, but `MAP.roads` stays the graph.
- The big farm south of the Chunky River Bridge, where the woods stop and its fences, is in `data/farm.json`, documented in `data/farm.md`.
- Dialogue and the relationship meters are in `data/cast.json`, documented in `data/cast.md`.
- What's in the pantry at the church on Church St, and how it fills back up a day at a time, is in `src/pantry.js`, also documented in `data/cast.md`. Its days are the church signs' Mississippi days.
- Everyone in town has a name, a personality and a memory of what he's done: `data/folks.json`, `src/agents.js`, documented in `data/folks.md`. None of it comes from `rnd()` or `crowdRand`, and half of everybody's an Alexander or a Clark and an eighth are Gressetts, which is the owner's. Most of the crowd have gone quiet and leave him be until he starts something, and the few who've burnt down stop, turn to him and flare for a second before they come, with nothing on the screen saying why, no more than three at once and giving up after eight seconds without him in sight, and noise rouses them and nothing draws them, which is in `src/horde.js` and the same document. Only the ones nearby are out: the people at home are put back once he's 300 m off, and come out again just as they were. Most houses have someone at home, there's someone driving on the real roads and there are kids on four-wheelers on the lanes, which is in `src/traffic.js` and the same document. With `?test` all of those stay away until `fillTown()`, so that every test that isn't about them is left alone.
- The trains run on TIGER's railroad, one at a time and near wherever he is, with crossings that shut and three trestles he can walk: `src/trains.js`, documented in `data/railroad.md`. The words on the marker by the west trestle are in `data/railroad.json`. Nothing says whose railroad it is. With `?test` the train stays away until `trains.go()`.
- Nobody dies. The train throws the crowd clear of the tracks and they lie in the ditch longer than anything else keeps anyone down, then get up sore and go home. The river's cottonmouths have whoever the train throws in, and the current takes them, and they come up downstream on the bank, soaked, with a snake on a sleeve, and walk home: the same people, with what they remember, and nobody new walking in to take their place. Where they come up is `src/river.js`, and the rest is in `src/horde.js` and `data/folks.md`.
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

`npm run net:server` runs the town everyone shares on this machine, at ws://localhost:8787, and keeps it in `data/raw/town.json`. What goes over the wire is in `src/net.js`, the town itself is `server/town.js`, and `server/host.js` is the town behind any socket, which is how the same town goes on Cloudflare. `npm run net:server -- --talk` also answers the characters' words at http://localhost:8787/talk, by the talk server's own rules but with one canned line and nothing spent, for pages on this machine, and `startServer({ talk: { line, quiet } })` does the same in a test.

`index.html?net` puts Play with others under Start, for that town, and `?net=ws://…` for one somewhere else. Without it there's no button and nothing of playing together is loaded, and `npm run frames` checks that the opening's the same to the byte. The phone's side of it is `src/together.js`, and `docs/multiplayer.md` says how it fits together. The owner is the hero on a link of their own: the address with `#hero=` and a secret, for a town started with `CHUNKY_HERO` set to that secret's sha256 in hex. Their phone keeps it for that town and no other, as every phone does the key it plays as there, and it comes off the address as soon as it's read.

`npm run deploy` puts main up at https://chunky.ms, the game's own files and nothing else: `index.html`, `src/`, `data/` and `audio/`, without tests, Markdown or `data/raw/`. It takes `--ref` for another commit and `--dry` to list the files.

## Tests

`npm test` runs `node --test` for data and logic. Name test files `*.test.js`.

`npm run frames` plays the opening as it is and as it is on `origin/main`, or the commit it's given, and fails unless every frame is the same to the byte. It's for a change that isn't meant to touch the opening, and it's run by hand.

`npm run check` runs everything below and `npm test` too, three at a time and longest first, and runs anything that fails again on its own. `-- --changed` runs only what the uncommitted changes, or the last commit, could break, `-- --dry` says what it would run, and `-- --at <commit>` checks a commit from a copy so the worktree can change meanwhile.

`npm run talk:host` plays the server for the characters' own words in Cloudflare's runtime on this machine, against a stand-in for OpenRouter so nothing's spent: a line and what it cost, a page on another site turned away, the month's cap, a phone asking too fast, and the month still spent after a restart. What it does is `server/talk.js`, and `server/worker.js` puts it on Cloudflare with the owner's key, which only the owner puts in.

`npm run net` plays together against a town on this machine, in two Chrome pages with real key presses, clicks and taps, one on a keyboard and one a phone: Play with others, a name and a look each, the opening watched with the rope cut for them and coming to on the riverbank, then each seeing the other by name and look walking, running, on the stick and driving, a pickup that stays where it's parked every frame while someone gets in and is left where it was left, a truck nudging someone aside and a swing going through them with nobody hurt, WAVE and V, a dot on the map, someone in a Camaro with their head under its roof, coming back to where they left with what they had and without the opening, and the hero's link: everyone sees the hero, a second phone takes him over, and a link to another town gets neither the hero's secret nor who the phone is. It takes `--shots dir`.

`npm run smoke` plays Chapter 1 in real Chrome and fails on a wrong beat or a console error. It needs `npm i` first and takes `--shots dir` for screenshots and `--touch` for a phone viewport.

`npm run walk` walks every road end to end, both ways, with the game's own movement code.

`npm run play` plays Chapter 1 on foot from where he wakes on the Chunky River Bridge to its final objective, following the objective's arrow, and fails if anything's blocked or unreachable. `npm run smoke` teleports between beats, so it can't catch that.

`npm run horde` plays against the ones in the crowd who come for him on sight, with real key presses and taps: they roam the real map, notice him, run him down and grab him, and he gets away. It also reports what 48 of them cost.

`npm run overlay` draws TIGER's centerlines over a top-down capture of the game and measures every intersection against them. It writes to `data/raw/` and fails on anything outside the tolerance. `data/roads.md` has the details.

`npm run drive` finds every kind of vehicle where it's parked and drives it with real key presses and the phone's stick: along the real roads and off them, into walls, through the crowd, into the river, and out again.

`npm run field` walks onto the ball field from Adams St, runs the bases, and checks that the fence and backstop stop him and that the gates let him through, on foot and in a pickup.

`npm run station` goes round the gas station on a phone-sized page: in through the door, along the shelves and the counter for what's on them, bars the door with the crowd outside, breaks the boards with a hammer, and checks that the crowd gathers under the canopy's light and stops once it's out. It takes `--shots dir`.

`npm run sound` plays the game with the sound on, in real time: nothing until a touch, the mute, a hidden tab, the score through the opening, his feet on each surface, driving, the crowd, the crickets coming and going with nobody singing some of the time, and a track and a voice line swapped in with nothing changed but the sheet, the sliders for the effects and the night noise with a real drag, kept after a reload, and then every real file in `audio/` on a phone-sized page. It can't say whether any of it sounds good. `-- --old` plays it through with the sounds worked out from code.

`npm run sound:make` says what making the music and sounds with ElevenLabs on fal would cost, and `-- --go` makes them. `npm run sound:measure` then measures every file in `audio/` and fails on one that's silent, clipped, cut short, swells or clicks as it loops, or lands late, and `-- --pictures dir` draws their spectrograms. `npm run sound:level` sets `data/sound-new.json`'s levels to match the old sheet's, so run it after making anything over. The budget is a running total, kept in `audio/manifest.json`. `data/sound.md` has the rest.

`npm run lanes` drives up a gravel lane and a dirt drive to somebody's door with the phone's stick, and checks that nothing stands on the lanes, the woods are cleared off them, what's underfoot, and no barricade across a road that carries on. `data/lanes.test.js` checks that they all join up and that every building has a way in.

`npm run lore` goes and looks at what's come from the lore: every church's sign, what it says today and tomorrow, and what happens when it's hit, then Charlie Flake's marker, then Robby's lot, walking there from where he wakes, what Robby says and that he only says it once, the flies, the deer meat, and what a truck does to it, and then the light on Stuckey's Bridge: that it isn't in the opening, that it comes when he goes back on foot or driving, goes through him, and that it all goes quiet while it does. It takes `--shots dir`.

`npm run hills` goes and looks at the hills: that the first scene is at the bottom of them, that the graphics card draws twice what `src/hills.js` says, which is how tall the owner chose, that every material in the scene goes up with them, then a pickup up US 80's biggest hill with the phone's stick and back down it on foot, swimming under a bluff and in a pool on top of one. It takes `--shots dir`.

`npm run keys` plays with real key presses and a real mouse: looking with nothing held, WASD with the camera, a click that hits what's in the middle of the screen and a right click that throws there, what lets the mouse go, in a pickup, all of it again in an iframe that won't let a page take the mouse, and that a phone hasn't changed. It takes `--shots dir`. Chrome won't give a headless page the mouse, so that one part is stood in for.

`npm run water` walks into a pond and swims across it, floods a pickup in another, and checks that the crowd keeps out, that nothing real ended up under water, and that the ponds are on the map. The ponds are in `data/water.json`, documented in `data/water.md`.

`npm run farm` goes from the Chunky River Bridge down the gravel to the farm south of it on foot, then looks at what's growing where, gets stopped by a fence, jumps it, knocks it down and drives through it, swims the pond and walks its dock. It also reports what it costs to draw. It takes `--shots dir`.

`npm run wreck` wrecks the town with real key presses and taps: through a house and through brick in a pickup, over a young tree and into a big one, into a parked car, a hammer through a wall, a can through a window, cars going up and a house burning down, then that it all stays down after going away and coming back. It also reports what the worst of it costs.

`npm run lures` slips past the ones who've burnt down with what he can throw, on a phone-sized page with real taps: a bottle picked up off the shoulder, each thing thrown off US 80 into a crowd and who turns to look, for how long, with nobody walking over and the ones who've gone quiet and the ones already after him not caring, slipping past one stood by the road with each of them, where it would have noticed him without, a car alarm set off from across a lot which rouses the nearest three as it goes off, who come for him and not for the car, and which he hears for its half minute, fainter further off, a bottle into the river that nobody follows, and the swap list, which has no beans in it. Wherever along the river someone goes under there's a bank to come up on that they can walk home from, which it checks all along it, and it plays the alarm's lights and the firecrackers again with reduced motion. What each thing does is in `src/lures.js`.

`npm run compound` goes round the compound on Pine Forest Rd on a phone-sized page: up the measured drive from the road, in through every door, plays the drums, guitar, bass and keyboard with real taps and the crowd listening, swims the pool, goes down the hill to the cabin, up onto its deck and in, along the decks past the swing to the cinema and into the studio, watches the screen with the crowd coming to its light, and breaks the projector and the propane tank. It takes `--shots dir`. What's in it is under "the compound on Pine Forest Rd" in `index.html`, and `src/things.js` has what things look like that aren't vehicles.

`npm run yard` goes round the yard off True Light Rd on a phone-sized page: up the measured drive from the road, across the pool, gets stopped by the net and goes round it, keeps the ball up six times in a row with the stick and real taps, takes the bat that gets him, bounces on the trampoline, and gets in the white Camaro, sits down low in it with the roof over his head, and drives it. What keeping the ball up does is in `src/volley.js`.

`npm run stumble` goes and finds what's only there for anyone who stumbles on it, on a phone-sized page with real taps: in from School St to the second trailer from the left, across its deck and down its length to the computer in the back, up to the screen and away again, breaks it, swims the green pool, drives a pickup up Chunky Duffee Rd from where the map used to stop, walks up the gravel loop and through the gate, finds its way between the stones to the one with words on it, and reads it. It takes `--shots dir`.

`npm run town` goes round the filled town on a phone-sized page: people at home who leave him be until he gives them a reason, someone coming and going, a drive along US 80 past people on their own side of the road, standing in the road, ramming one and taking another's car, and the kids, who can't be touched. It also reports what the busiest of it costs, and takes `--shots dir`.

`npm run agents` treats people differently with real taps and checks they behave differently afterwards, and still do after a reload: the same blow leaving one keeping away and another coming for him, someone who was there, a thrown bottle that stops holding someone's eye, someone following him about, and the families going around together. It takes `--shots dir`.

`npm run blend` gets through the ones who've burnt down on US 80 by passing for one of them, on a phone-sized page with real taps: SHAMBLE and the pace it holds him to, 30 of them crossed with nobody coming for him, the meters over their heads, one right up against him seeing through it, running, a swing and a light each giving him away to everyone close, beans making it harder, someone with a grudge not taken in, and C on a laptop. It takes `--shots dir`.

`npm run quiet` goes among the ones who've gone quiet, on a phone-sized page with the stick and real taps: how many have burnt down and how far gone they look, walking through 30 of them on US 80 with only the burnt ones coming for him, the rest folded over with their arms hanging straight down, a swing bringing the one he hit and the nearest three of everyone close, each stopping and turning to him first, and nobody further off, a bottle thrown at one, a can picked up from at one's feet and one that isn't, the ones who come for him stood up and the ones who stay folded over and scuttle, what they mutter, the same with reduced motion, and what 30 of them cost. It takes `--shots dir`.

`npm run afternoon` plays the owner's afternoon on a phone-sized page, with real taps, a real finger on the stick and on RUN, and the game's own movement: drives a pickup east along US 80 into a parked car in front of the Baptist church, past a crowd a third of whom have burnt down, gets out with a dozen cans of beans and stands in front of the church, and counts who comes for him and why: no more than three at once, each of them stopping and turning to him and flaring first with nothing on the screen saying why, and the ones who've gone quiet staying out of it unless he ran someone down beside them. Then running for ten seconds with a finger on RUN, which loses them and sends them home, and walking away, which does too, only slower. Then a dozen cans against five, a train going by, and a crash, an alarm, a blast and the bell beside a row of houses, none of which brings anyone out, driving US 80 out and back for ten minutes with the number out at once staying level and someone who was put back coming out again just as they were, what a crowd of 48 costs with three flaring, and that nothing goes up on a phone's screen for them, with reduced motion too. It takes `--shots dir`.

`npm run fold` looks at how far over everyone stands, on a phone-sized page: the crowd's numbers, the angles at the hips by how far gone they are, the ones who've burnt down the furthest over and nobody who's gone quiet stood up, a row of them side on with a table of each one's number against how far over they're drawn, which is 90° plus half of it, their arms hanging straight down, their hands and heads well off the ground and their heads tipped back stood up and hanging folded over, the ones numbered under 90° coming for him folded over in a quick shuffle on their feet with their arms swinging and never on their hands and the rest stood up, someone knocked down and getting up, the cast a little over, someone at their door, a kid on a four-wheeler sat up straight, that it all draws in the same draw calls, and the row again with reduced motion. It's measured from what went to the graphics card, and it takes `--shots dir`.

`npm run swing` starts with one walking straight at him and checks that it groans once and its glow flares as its hands go up, with the sound on from a real key press, and is back to its usual glow once it has hold of him. Then it stands still and swings at one walking straight at him, ten times on a phone-sized page with real taps and ten times on a laptop with real clicks: from straight ahead and off to the side, stood up and folded over and scuttling, tapped as soon as it's in reach and as late as while it's reaching for him. It fails unless nine in ten go down before they get hold of him. Then it watches one lie there and get up slowly, about ten seconds, with him stood over it, and checks the picture holds and tears when a swing lands and doesn't with reduced motion, and that the glow still flares with it. It takes `--shots dir`.

`npm run trains` waits by the railroad on a phone-sized page: that no train comes with `?test` until it's asked for and then they come on time, from each end in turn, the horn blown long, long, short, long and the noise, a crossing shutting with its arms, lamps and bell and opening behind it, walking into its side and standing in front of it, all three trestles on foot with somewhere to stand clear and off the side into the river, the horn bringing nobody, the train blowing once and only near him, and throwing whoever's on the tracks clear of them, where they lie longer than any swing keeps anyone down and get up sore and walk home with nobody lost or new in their place, and the ones thrown off a trestle into the river coming up downstream on the bank, soaked, with a snake on a sleeve, a parked truck and the one he's in, a driver waiting at the crossing, and the marker. Then the same with reduced motion, when nobody turns over as they're thrown and the snake only hangs. It reports what it costs and takes `--shots dir`.

`npm run church` goes round the church on Church St on a phone-sized page with the stick and real taps: in through the front door with the roof and the steeple out of the way, up the aisle and not across the pews, through the wing's wall to the pantry and what's on its shelf, Miss Bobby out front of her house by the town hall with the van she drives for Chunky Baptist, her steps swept in Chapter 1 and then once a day out of the pantry, over a week of days and after a reload, the bell rung from the rope, which stirs nobody while he's in the church and rouses the nearest three of the burnt-down ones who can hear it once he's out while it's still going, who come for him and not for the church, with nobody going into it, E on a laptop, and the steeple coming down with the church. It takes `--shots dir`.

The crowd comes out when Chapter 1 ends. `index.html?horde` brings it out as soon as town starts, which is the quick way to try it. `index.html#free`, or Skip to town on the title card, goes straight to town with the crowd out and something of everything to throw. It's an anchor because that's the only part of an address the shared link passes on.

Chapter 1's bridge run ends in a moccasin bite, a fever dream and waking on the Chunky River Bridge at the edge of town: the modes `bitten`, `dream` and `wake`. `jump('town')` puts him where he wakes.

`index.html?test` adds `window.__game`, which is what the smoke test drives. The clock starts held. `step(seconds)` advances it and `sim(seconds)` does the same without drawing, `jump(phase)` starts a phase, `place(x, z)` moves the player, `key(k, down)` and `stick(x, y)` give input, `state()` reads the game, and Math.random is seeded. A background tab runs at about 1 fps, so test with the clock held or in a real window.
