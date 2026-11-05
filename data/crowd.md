# The crowd's start

`data/crowd.json` is what the people in the town everyone shares start from that only the game knows (CHUNKY-153b): who's at home where, every vehicle where it's parked, and the lights that draw them at night. The town runs the people there, and has no page to ask, so `tools/crowd.mjs` writes it from the game's own and `server/world.js` loads it. What stops anyone is in `data/solids.json` instead.

It's made from the page with `?test&horde` just after he's in town, before anything's moved or broken, in game world metres (+X east, -Z north, from Stuckey's Bridge), to the millimetre.

## What's in it

| Key | What |
|---|---|
| `homes` | the building's structure id for each of the people at home, in the game's order, which is their number: the first is 1000 (`HOME_ID` in `server/world.js`) and each after is one more. A house where two live is in it twice, one after the other. |
| `parked` | each vehicle where the game parks it, `[kind, x, z, yaw]`, in the game's order, which is its number on the wire. `kind` is one of `src/vehicles.js`'s `KINDS`, and `yaw` is to a ten-thousandth of a radian. |
| `lights` | each light that draws them at night, `[x, z, r, props]`: where it is, how far it reaches, and the key on the wire (`src/wrecks.js`'s `propKeys`) of every prop whose breaking puts it out. |

Which houses have someone at home, and which vehicles are parked where, are the game's to say, from what it knows of the places that are set aside, the cast and the gas station. Where each house's door is isn't in here: it's the building's own, from `src/structures.js`, and `server/world.js` works it out the way the game does.

A light's props are found by breaking each prop near it that has anything to do when it's broken, on a page of its own each, and keeping the ones that take it out of the lights. Breaking one thing can bring down more, which is why it's a page each. The cinema's light has two, the screen and the projector.

## The town's world

`createWorld({ ..., crowd })` in `server/world.js` has, from it:

- **`homes`**, each `{ id, s }`, the number and the building, and **`doorOf(home)`**: `{ door, inside, nx, nz }`, a step out from the house's front door, where inside it they go back to and which way's out, or `null` when the door's somewhere nobody can stand, and then nobody comes out of it, as in the game.
- **`parked`**, each `{ i, kind, K, x, z, yaw, y }`, which stops anyone within .3 m of it and under 1.4 m over it, kept by cells 16 m on a side as the game keeps them. **`park(i, x, z, yaw)`** is where one's been left since, and **`ride(i)`** takes one out while someone's in it.
- **`lights`**, each `{ x, z, r, k }`.

## The town's people

`createCrowd(world, { folks, looks })` in `server/crowd.js` runs them in that world with `src/horde.js` and `src/agents.js`, for everyone in town at once, the way the game runs them round him:

- The crowd's put out once anyone's in town, and only the once, along US 80, Church St and Adams St as the game puts it out (`STREETS`), and not within 35 m of anyone, in the water, in a house or anywhere nobody goes.
- The people at home come out of their front doors once anyone's within 190 m of the house, some of them out in the yard already. Anyone who lives somewhere is put back once nobody's within 300 m of them, and comes out again just as they were as soon as anyone's within 190 m. All of it's looked at once a second, as the game does.
- Whatever someone's driving isn't parked anywhere. It's in the way of anyone on foot where they've got it, though not of anyone thrown over it, and it's parked where they get out.

`step(dt, players)` is a tenth of a second for everyone in town, as `horde.update` takes them, with each one's floor as `y`. It gives back what happened, each `{ t, id }` with the folks number of whoever it happened to, and for `grab`, `free` and `overrun` the `pid` of the player it was. `mash(pid)` is a press of A from the phone of whoever's held.

## Checks

`npm run crowd` checks that the file's still what the game has, that the town's world has the compound on Pine Forest Rd's grounds and the church on Church St where the game has them and nowhere else, and that every house's door is where the game brings its people out of it. For that it goes round the county from house to house, every house within 150 m of somewhere he's stood, with the people at home brought out, and compares each one's door with the town's. `npm run crowd -- --write` writes the file again, after who lives where, what's parked where or a light has changed.

`server/world.test.js` has the rest: that every parked vehicle stops anyone, and nobody over its roof, that one left somewhere else is there and one someone's in is nowhere, that everyone at home comes out of their own front door facing out, and that every light has the props that put it out.

`server/crowd.test.js` has the town running them: the crowd out once and where it's put, the people at home out of their doors and put back and out again just as they were, someone burnt down getting hold of whoever's in town and letting go once they've fought free, told for the one it's about with two in town, a vehicle someone's driving where they've got it and parked where it's left, and everything else that happens told with who it happened to. None of it hangs on one run of random numbers.
