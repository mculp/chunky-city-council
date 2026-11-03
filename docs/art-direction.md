# Art direction

The game should look like a hand-drawn GIF you can walk around in. It's a real 3D scene, but every frame reads as an animated drawing: chalk lines that boil, scribbled hatching, a limited palette, dithering and glitches.

`index.html` is the working implementation. `reference/stuckeys-bridge.html` is the scene the game grew out of. See "What only the reference has" below.

## How it's made

Everything is procedural three.js. The game has no image, model or texture files, and new art should keep it that way. Draw it in code with the helpers in `index.html`:

| Helper | What it does |
|---|---|
| `makeHatch` | Scribbled crosshatch cloth, as several drawings to cycle through |
| `toonGrad`, `hoodMat` | Three-step toon shading (70, 150, 255) with the hatch as both colour and glow |
| `tapeMat` | The warning tape in the hero's hood |
| `drawPerson`, `drawRadiation`, `drawAura` | What everyone else had on, how it's going through them and what's coming off them, drawn on a canvas at load, in `src/looks.js` |
| `zombieMat` | Putting those on a body, one at a time or a whole crowd at once |
| `outlineMat`, `outline` | Screen-space outlines. A `chalk` value above 0 adds the boil and the broken chalk texture |
| `pixelTex`, `triplanar`, `textTex` | Surface textures and painted signage |
| `vehicleGeometries`, `vehMat` | Everything with an engine: low-poly boxes in `src/vehiclemodels.js`, with paint that takes each one's colour and rusts through in patches |
| `writeStructure`, `houseMat` | Every real building: `src/structures.js` writes its pieces, and one material draws the siding, brick, block, ribs, shingle, windows and doors from what's in the vertices |
| `breakable` | Anything that isn't a building and can be knocked down. While its function runs it collects the boxes, solids and kudzu it adds, and how it goes over comes from its options |
| `spray`, `dust`, `puff` | Bits off what's breaking, in a fixed pool, and the dust where it lands |
| `burnAt`, `drawFire` | Everything on fire is one list. The nearest of it is drawn on the twelve frames: low-poly flames with an ink line, a glow on the ground, smoke and sparks. None of it adds a light |
| `blast`, `thud` | Something going up, with its fireball and the fire it starts, and something heavy landing, which breaks what it lands on and stays dark |
| `swayMat` | Foliage that moves |
| `gifMat`, `renderFrame` | The final look: dither, grain, vignette and glitches |
| `triggerBurst`, `glitch` | Glitch bursts: `glitch` for hits, `triggerBurst` for the rare timed one |
| `updateParticles` | Leaves, fireflies, cyan drips and mist, wrapped around the camera |

This approach came from a failed one. Flat shapes drawn in code and set against painted frames looked like clip art and were thrown out. Building a real 3D scene and making it feel hand-drawn is what worked, so don't go back to flat sprites or paste painted images into the scene.

## The protagonist

- His proportions are measured off the coin: a big hood, 0.78 m wide and 0.9 m tall with a rounded top, sitting right down between sloping shoulders half as wide again. One continuous hood flowing into the shoulders (`HERO_SHAPE`), a little smaller all over so that it's the hood that's big.
- Black cloth `#08050a` scribbled with hot red crosshatch: `#d81f4f`, `#f2305f`, `#7e1030`.
- A chalky orange outline, `#ff7a2c`, that wobbles from frame to frame.
- A wide opening in the hood with a raised rim: arched at the top, widest just below the middle, a V at the chin.
- There's no face in there. There's warning tape, set back inside the hood (`tapeMat`): flat and straight, amber and black in equal parts, 34 degrees off vertical and rising to the right, so you see three wide bars and a sliver at each end. The bars are scribbled in with the same strokes as his hoodie, and the strokes rough up their edges. It's worked out along the line of sight, so it stays flat and slides behind the rim as he turns.
- White-outlined black drawstrings hanging long and a little wavy from white eyelets either side of the chin.
- Hanging, his head lolls away from the rope. Swimming, it comes up out of the water.
- Dark fists outlined in orange.
- A long-neck bottle with a white chalk outline (`#f6f2ea`) and glowing cyan liquid (`#3ad9d2`). The label is black with an orange warning triangle and no lettering. The liquid stays level as the bottle tips, so it runs up into the neck.

**All of this is his alone.** He's the owner's own, and nobody else in the game gets his scribbled hoodie, his orange line or the tape. Don't reuse them to save time, not even on someone in the distance.

## Everyone else

Everyone else is a radiating zombie, and how far gone they are varies. That's the owner's word for it, in `docs/lore.md`. How they look is below, and the owner can overrule any of it. Nobody but the player wears a hood. `data/looks.md` explains `data/looks.json`.

- **A thin person.** Narrow and stooped, with long arms and a small bare head hanging forward on its neck (`ZOMBIE_SHAPE`), so that you can tell them from him by shape alone, a long way off. They were people from around here, and they've still got on what they had on: flannel, overalls, camo with a hunter's vest, a church dress, coveralls, or no shirt. It's all in crayon rather than his scribble, with the paper's tooth in it, going dark into the outline, and it never blooms, whatever light they're standing in.
- **How far gone** is one number from 0 to 1, and everything below goes by it. `drawRadiation` draws one map of when each spot gives way, and `zombieMat` compares the map to the number, so someone at any stage costs the same as anyone else.
- **Cracks** start at the breastbone, spread out along their branches, and light up in radium green, which stands out against the magenta sky (`RADIUM`). The trunks are brighter than the tips.
- **Burning through.** Patches of what they had on go to char, with a lit edge, until there's not much but char and cracks. The face goes last.
- **Eyes** are pinpricks to start with, and fill the sockets. The mouth lights once they're well on.
- **The line** goes from dead chalk to burning. Their skin and clothes go a little greener too.
- **What's coming off them** (`drawAura`): chalk strokes straight out from the body, like a comic drawing something that radiates, redrawn on the twelve frames, and a pool of the same green on the ground. Nothing shows until they're about a quarter gone, and the strokes get longer and more of them show from there.

With reduced motion the flicker and the strokes hold still.

Coop, Tre and Miss Odessa are the least far gone, because they can still talk, and each has clothes nobody else wears, along with Coop's cap and chain and her hat and skirt. Robby's a ghost of the same build, and not far gone at all, because he didn't die.

## The crowd

They share one body so that dozens can be on a phone's screen at once: `crowdBody`, `crowdLimb`, `drawCrowd`. Every look is on one sheet with a row each, and each person reads their own row and how far gone they are, so seven draw calls cover forty-eight of them, what's coming off them included, however many looks there are.

- They wear the looks in `data/looks.json`. How far gone each of them is comes from a number they already have, by way of `degreeOf`, and most are in the middle.
- Everything that's lit goes hotter and yellower once they've noticed something, and what's coming off them flares even on someone who's barely started, so you can read who's after you from a distance.
- Their lines thin out with distance, or a far crowd would be nothing but chalk.
- Limbs that don't bend, swung from the shoulder and hip on the same 12 fps step as everything else. Most of them limp. When they're after him their arms come up and they lean in.

## The GIF feel

- **12 fps drawing over a smooth camera.** Pose, hatch and boil step at `Math.floor(time * 12)`. The camera keeps the full frame rate.
- **Boil.** Hatching cycles through three drawings (`step % 3`) and chalk outlines shift each step (`step % 4`).
- **Limited colour.** `UnrealBloomPass` (strength .5, radius .45, threshold .92), then `OutputPass`, then `gifMat`: an 8×8 Bayer dither to 30 levels per channel, grain, a vignette and slight chromatic aberration.
- **Glitches.** Scanline tears, block shifts and colour crush down to 9 levels. They respect `prefers-reduced-motion`.
  - **Hits** (`glitch`) fire on the cut, the splash and a bite: big blocks that slide. These are what the trailer shows.
  - **Timed bursts** fire about every five minutes, on the owner's say: finer blocks that swap colour, and about half of them hold, freezing and smearing blocks of the previous frame. The reference fires one every 4 to 11 seconds.
  - **He stays clean.** A mask pass keeps him and his outlines out of the break-up. The mask and the hold buffers are only drawn during a burst, so calm frames cost no extra passes.
- **Particles.** Falling leaves, fireflies, mist, and a stray cyan drop from the bottle that rings the water where it lands. Phones get 140 leaves, 70 fireflies and 5 mist sprites instead of 380, 180 and 10.

## The world

Night in an abandoned Mississippi town.

- **Palette:** night `#07050b`, ink `#120b14`, cream `#f1e6cf`, rust `#ec803a`, cyan `#6fd6c8`, hot `#e3285c`, dusk `#a99bc0`.
- **Sky:** horizon `#e0662a`, clouds `#1d1230`, moonlight `#c9d4ff`, purple fog `#2a1838`.
- **Surfaces:** flat-shaded terrain and foliage, ink outlines on buildings and steel, kudzu `#3f7a35` over everything left standing. On a building it lies flat to the walls, spilling from under the eaves or climbing from the ground, and never stands off them in mounds.
- **Stuckey's Bridge:** a rusted truss with an orange rail (`#d76a2c`). It's where the real one is, 6.45 miles south-east of town and about ten by road, and the road through it is the one thing on the map that's bent, so that the opening can look straight down it.
- **The Chunky River Bridge:** where he wakes, on Griffis Fountain Rd at the edge of town. A one-lane pin-connected Pratt through truss from 1911, 30.7 m long and 4.3 m wide, in rusted steel over sand banks. The date and the size are from public descriptions, and the rest is as it looks on Street View. It has six panels and five posts a side: a plain doubled one where each leaning end post meets the top chord, and three laced ones between them, laced on the faces that look along the road. The diagonals are pairs of flat bars, crossed by a thin one only in the middle two panels. Each portal is two beams with a zigzag between them and a heavy knee down to the end post either side, and each overhead strut has a shallow brace up to its middle from each side, with thin rods crossing every panel overhead. The deck is planks laid across, ragged at the ends, with two wheel tracks of boards laid along them. A low flat rail runs just inside the posts and carries on down each side of the way in. The town sign stands just past it.
- **The town:** the real one. Every building is at its real position, with its real footprint, in siding, brick, block or ribbed metal, and with kudzu on it. See `data/structures.md`. The town hall is the little block one on the corner of Commerce St, the post office is across Commerce from it, the gas station's canopy stands in front of the old store it belonged to, and Miss Odessa's church is the brick one at Adams and Church St. Real businesses go under invented names.
- **The ball field:** in the block between School St, Jones St and Adams St, built from the public aerial: orange clay, chalk, chain-link, the backstop, blue dugouts, aluminium bleachers and nine tall wooden light poles that have been dark a while. See the block in `index.html`.
- **The roads:** asphalt lighter than the ground, with patches, cracks and polished wheel paths. Double yellow down US 80 and Adams St, dashed yellow on the smaller roads, white edge lines on all of them, worn away in long stretches and speckled up close. A gravel shoulder thins out into the dirt. Paint stops short of junctions and railroad crossings. By the bridge, it's still the first scene's dark road.
- **The lanes and drives:** the named local roads are the same asphalt with no paint on them, unless they've been seen to have some, and narrower. The rest aren't paved: tan gravel, and the red clay of a Mississippi drive, each with two ruts pressed into it and an edge that wanders off into the ground. Clay has grass up the crown. A drive opens out where it leaves the road, and closes up by the door.
- **The map:** drawn from the same data as the world, on a dark scratched page: cream roads with the lanes in a thinner, duller cream, a rust railroad, a teal river, dusk buildings, cyan people, rust arrows. The small one turns with the camera and only appears once he's in town.
- **Vehicles:** old and rusting, in faded paint, with no real makes or badges. Cars and pickups by the houses and shops, four-wheelers by the trailers, a golf cart at every church. Their windows are open, so he's always in view at the wheel. Only the one he's driving has its lights on.
- **Props that aren't real:** the water tower, and the rusted boxcar on a railroad with dark ties (`#2a1d18`).
- **Everything breaks.** Each building comes apart in the pieces it's drawn in, and when too many walls have gone the roof comes down and the rest follows. Wood burns all the way down, and brick, block, stucco and tin keep their walls and lose the roof. Fire is comic-book fire: orange and red tongues with an ink line, black smoke in lumps, no realism. An explosion is a few big hand-drawn frames on the twelve-frame clock. Dust is many small puffs, because one big one reads as a boulder. Only the two river bridges stand up to all of it, since the first scene has to stay as it is and he has to be able to wake on the other.
- **Doors stand open.** Any building can be walked into, and its roof comes off while he's inside. Anything between the camera and him opens up around him in a dither, and the roof of whatever the camera backs into comes off too.
- **Street signs:** green blades with cream Bungee, the colours of the town sign, reading the names in the road graph. Each corner blade runs along the road it names, as real ones do, and the roadside ones face whoever's walking that way. A phone in portrait sees a narrow slice of the road, so they're big enough to read before they slide off screen.
- **The church signs:** one at every church, side-on to the road on the front lawn, and changed every day. A white cabinet with a blue header in a serif, flaking from the top down, and under it a board lit from behind by two tubes, with black changeable letters on rails: Bungee squeezed to 70% wide, each a little crooked and now and then one faded. They're measured off the owner's three photos and made bigger than life, 3 m across the face, so a phone can read them from 20 m, the way the street signs are. The base is half as wide as the board with a post at each end, in a brick planter with red flowers and kudzu. They're the brightest thing on any street, but the board stays under the bloom so the letters hold. Knocked over, they go dark. `data/signs.md` has the rest.
- **Robby's lot:** what's left of a burned house on a mown lawn, on the first thing you see coming into town. Brick piers, a chimney in burnt brick you can count the courses of, charred joists, a stove and concrete steps going up to nothing. The memorial's cross and flowers and its letters don't take the night's light, so they read from the road. Robby's the one ghost: a plain pale look, and every other pixel of him gone on the same 12 fps step as the boil, in a line that glows. The flies are pale where it's dark behind them and dark where he's behind them. With reduced motion his holes hold still and the flies move at a quarter of the rate.
- **Charlie Flake's marker:** a plaque on a pole, bigger than life like the street signs, cream on a dark blue-green, and a catfish on top side-on to the road at its true 1.2 m: flat wide head, four whiskers, a forked tail and a slate back that doesn't take the night's light. Seen from the road you're looking up at it, so its belly stays small and dull, or it reads as a whale.
- **The river:** it takes glowing rings where things hit it. Cottonmouths open white mouths before striking.
- **The ponds:** the same water as the river, with the sky and the moon in it, each at its own height just under its lowest bank. Dark mud at the edge, and the far bank and its trees black against the sky.
- **The lantern:** the one from the local legend, a guide light with nobody holding it that leads him across the river.

The brief is a "perfectly 3d modeled city": the real layout and landmarks of Chunky on real street geometry, rendered in this hand-drawn style. Accuracy applies to where things are and what they are. It doesn't mean photorealism. The roads, the railroad and the river come from the road graph, and the buildings from `data/structures.json`.

## The bite and the fever

Between the end of the bridge run and the edge of town there isn't a word, and nothing to press. What's in the dream is the owner's to decide, so for now it's only a look.

- **The moccasin.** It's lying where the boards stop. It rears up in an S with its mouth wide open, and it strikes on the 12 fps step. The camera cuts low and close, side on, so that a black shape with a white mouth stands against the sky. It gets its own head for this, a flat spade that opens right up, and it's drawn about twice the size of the ones in the water, because the one moment you see it should read.
- **He goes down.** The hit is a glitch and a flash, then he staggers and falls on the 12 fps step while the camera swings up and away.
- **The fever.** Hot pink and cyan take over the palette, the picture warps in rows and smears through the last frame, and the camera rises off him and out along the road towards a horizon that won't hold still. It fades to black.
- **He comes to.** Face down on the planks of the Chunky River Bridge, with the fever still in the sky. It takes a few seconds more to leave him.
- **Reduced motion.** The same scene with a still camera: the tint and the fade, no warping, no shake and no glitch, in under half the time.

## Sound

The night comes first: wind, insects, the river and frogs near water, all of it thin enough that a footstep carries. The music is slow and has a lot of room in it, a low drone and a slide guitar a long way off, and it only gets a pulse when something's after him.

- **The rope snapping is the loudest silence in the game.** The music cuts as it goes, so there's only air and then the splash, and it comes back under the water.
- **The bridge** gets drums and a pulse. **The bite** cuts everything dead. **The fever** takes the night away altogether and leaves the music going out of tune. **Waking** is his heart.
- **The crowd** mutter to themselves. One that's noticed him says so, louder the closer it is, and the music turns on him until they've been gone a while.
- **Nothing speaks for him.** His voice is the owner's to record. There's a place for each line, and no line exists until there's a recording of it.

`data/sound.md` has how it's all kept.

## What only the reference has

The game has the reference's clean character, holds, timed bursts, full bottle, drawstrings and particles. These stay in the reference on purpose:

- **Mirror reflections.** The reference renders a `Reflector`. The game's water fakes the sky and moon, which is what the trailer shows and what a phone can afford.
- **The drink.** In the reference he raises and tips the bottle on a loop, with his hood bent back to meet it. In the game he holds it at his side until he decides to live, as in the trailer.

## Type and words

- Bungee for titles, prompts, names and buttons. IBM Plex Mono for everything else.
- Keep words sparse outside dialogue. The reference scene shows only its name, by design.
- Any words that appear must be readable.
- No Gen Z or Gen Alpha slang in game text.

## Motion

- Each frame should be structurally close to the last, with no sudden jumps in direction or shape.
- Motion shouldn't be so subtle that nothing but one prop seems alive.
- Check new animation for deformities and sudden transitions before calling it done.

## Controls

Touch comes first, because the game is played on a phone. The left thumb moves and dragging looks around. The buttons say what they do right now, like CUT, TALK, GET IN, SWING, THROW, JUMP, RUN, BRAKE and SWIM FAST, and a button with nothing to do isn't there. Driving takes one thumb: forward on the stick is the gas, off to the side steers and keeps the gas on, and back brakes and reverses. On a keyboard, WASD or arrows move, Shift runs, Space jumps, swims faster or is the handbrake, E uses, F swings, Q throws a gas can and M is the map, and a strip at the bottom shows the keys that work right now. `src/controls.js` has the lists.

## What stays out of this repo

- **Real trademarks.** Bottle labels and signs use invented brands or the warning triangle alone. In-world brands can come from the same family as DEL MUERTO, VOODOO HEAT, BLACK SUN, GRAVEYARD SHIFT and DEEP END. Check that a name isn't a real brand before using it.
- **Music without rights.** The existing video captures of the bridge scene are cut to a commercial track with no licence, so neither they nor the track belong here.
- **Google map imagery or geometry.** Roads come from Census TIGER/Line data and buildings from USA Structures. Google Maps is for comparing by eye and for writing down, in words, what a building looks like.
- **Reference images,** until the owner decides they can be public.
