# Solids

`data/solids.json` is everything in the game that stops anyone, and the floors raised off the ground, for the town everyone shares (CHUNKY-153), which runs the crowd and has no page to ask. `tools/solids.mjs` writes it from the game's own, `src/solids.js` loads it and answers as the game does, and `npm run solids` fails as soon as it isn't the game's any more. After anything that stops anyone has changed, `npm run solids -- --write` writes it again.

It's made from what the page has just after it starts, before anything's broken, in game world metres (+X east, -Z north, from Stuckey's Bridge). Every height is to the millimetre.

## Heights, over a flat town

The town's ground is flat, the way the game's world is, with only the drawing going up and down. So nothing in here is a height the page has. Every height is over the town's floor, which is nought everywhere but on a raised floor:

- **A raised floor** is as far up as it is from where you step onto it, so every step on and off is the game's. The dock's is from the bank at its shore end, the cabin's decks' from the yard round them, a trestle's from the railroad bed off both its ends, halfway between, and a road bridge's from the road off it.
- **Anything that stops anyone** stands as high as it does over the highest floor beside it, a little out from the middle of each of its sides. A bridge's rails stand over its deck and not over the river, and a fence out on the farm stands over the ground it's on. What's under a raised floor, such as a trestle's bents, comes out below it, and stops nobody up there.

Where the ground's level, that stops whoever the game stops and hides a head the game hides. Where it isn't, on a riverbank, it's as near as one height can be.

## What's in it

| Key | What |
|---|---|
| `fixed` | `boxes`, each `[x0, x1, z0, z1, top]`, and `walls`, each `[ax, az, bx, bz, top, radius]`, of what nothing breaks |
| `props` | each prop that breaks and stops anyone, by its key on the wire (src/wrecks.js's `propKeys`), with its own `boxes` and `walls` |
| `buildings` | each building by its structure id, with `n`, how many parts src/damage.js has it in, and `walls`, each `[part, ax, az, bx, bz, top, radius]`: its walls and the posts holding up its porches and carports, a post being a wall a millimetre long. `part` is the part it is, as the wire says it |
| `cast` | each of the cast by name, as a box where they stand |
| `bar` | the boards he can put across the gas station's door, as a wall, with the top they have while they're up |
| `floors` | `rects`, `trestles` and `bridges`, below |

A box stops anyone within .3 m of it, and a wall anyone within its radius and .3 m of its line, round its ends too. Neither stops anyone less than .25 m under its top, or over it. They're kept by cells 16 m on a side, as the page keeps them.

### The raised floors

- **`rects`**: `{ rect: [cx, cz, ux, uz, halfLength, halfWidth], top }`, an oblong along `(ux, uz)`. The dock is two of them, the runs `onDock` has, with the dock prop's key in `k`, since it goes with its prop. The cabin's decks on Pine Forest Rd are the rest.
- **`trestles`**: `{ at: [x, z, reach], half, rail, refuge: [x, z, radius], top }`. The floor is anywhere within `reach` of `at` and within `half` of one of the stretches of railroad in `rail`, `[ax, az, bx, bz]`, or in the refuge.
- **`bridges`**: `{ at: [x, z, reach], half, deck, roads }`, the road bridges over the river. The deck is anywhere within `reach` of where the road crosses and on any of `roads`, `[ax, az, bx, bz, half]`, which are every road and lane near enough to count. The rails stop anyone higher than a metre under the deck who's between `half` and a metre more from the line of whichever road's nearest.

A raised floor is where the water isn't, even one that's lower than the ground beside it.

## What src/solids.js does with it

`createSolids(data)` keeps it by cells and answers:

- **`stops(x, z, y)`**: whether anything stops someone whose feet are at `y` here, or hides their head if `y` is where their head is. That's what sight goes by.
- **`blocked(x, z, y)`**: `stops`, and the crowd's step: nobody goes up more than .7 m at once onto a raised floor. Water's step isn't in it, since water isn't.
- **`raised(x, z)`**: the highest raised floor here, or null. **`floorAt(x, z)`** is the same, and nought where there isn't one.
- **`take(w)`**: a wreck, as src/wrecks.js has it. A prop goes over by its key, and the dock with its prop. A building loses whatever parts of it are gone, but only if it's written in as many parts as it is here, since otherwise it's some other game's.
- **`heal(k)`**: as it was built.
- **`barred(up)`**: the boards across the gas station's door, which are each phone's own.

## What isn't in it

- **The ground's ups and downs.** They're the drawing's.
- **Water.** It's data/water.json's and the river's.
- **The trains, the vehicles and the trees.** The trains are the timetable's, the vehicles move, and a tree stops him and what he's driving, but not the crowd.
- **Stuckey's Bridge's planks and its abutments.** They're in the first scene's square, where the crowd never goes.
- **The map's edge.** That's `MAP.inBounds`, in src/map.js.

## What it costs

About 1.6 MB, with 1,132 buildings' 25,382 walls and posts, 1,097 props, 336 fixed things, three of the cast, three trestles and five road bridges. One line is one thing, so a change to one of them is a change to one line.
