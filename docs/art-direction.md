# Art direction

The game should look like a hand-drawn GIF you can walk around in. It's a real 3D scene, but every frame reads as an animated drawing: chalk lines that boil, scribbled hatching, a limited palette, dithering and glitches.

`index.html` is the working implementation. `reference/stuckeys-bridge.html` is the scene the game grew out of. See "What only the reference has" below.

## How it's made

Everything is procedural three.js. The game has no image, model or texture files, and new art should keep it that way. Draw it in code with the helpers in `index.html`:

| Helper | What it does |
|---|---|
| `makeHatch` | Scribbled crosshatch cloth, as several drawings to cycle through |
| `toonGrad`, `hoodMat` | Three-step toon shading (70, 150, 255) with the hatch as both colour and glow |
| `faceMat` | The glowing face opening and its bars |
| `outlineMat`, `outline` | Screen-space outlines. A `chalk` value above 0 adds the boil and the broken chalk texture |
| `pixelTex`, `triplanar`, `textTex` | Surface textures and painted signage |
| `swayMat` | Foliage that moves |
| `gifMat`, `renderFrame` | The final look: dither, grain, vignette and glitches |
| `triggerBurst`, `glitch` | Glitch bursts: `glitch` for hits, `triggerBurst` for the timed ones |
| `updateParticles` | Leaves, fireflies, cyan drips and mist, wrapped around the camera |

This approach came from a failed one. Flat shapes drawn in code and set against painted frames looked like clip art and were thrown out. Building a real 3D scene and making it feel hand-drawn is what worked, so don't go back to flat sprites or paste painted images into the scene.

## The protagonist

- One continuous hood flowing into broad shoulders. Not a ball stacked on a tube.
- Black cloth `#08050a` scribbled with hot red crosshatch: `#d81f4f`, `#f2305f`, `#7e1030`.
- A chalky orange outline, `#ff7a2c`, that wobbles from frame to frame.
- A big oval face opening with glowing, chalky yellow vertical bars on near-black.
- White-outlined black drawstrings hanging from white eyelets.
- Dark fists outlined in orange.
- A long-neck bottle with a white chalk outline (`#f6f2ea`) and glowing cyan liquid (`#3ad9d2`). The label is black with an orange warning triangle and no lettering. The liquid stays level as the bottle tips, so it runs up into the neck.

Other characters use the same construction with their own colours, like Coop, Tre and Miss Odessa in `makeNPC`. Distinct characters must read as different people, not reskins.

## The GIF feel

- **12 fps drawing over a smooth camera.** Pose, hatch and boil step at `Math.floor(time * 12)`. The camera keeps the full frame rate.
- **Boil.** Hatching cycles through three drawings (`step % 3`) and chalk outlines shift each step (`step % 4`).
- **Limited colour.** `UnrealBloomPass` (strength .5, radius .45, threshold .92), then `OutputPass`, then `gifMat`: an 8×8 Bayer dither to 30 levels per channel, grain, a vignette and slight chromatic aberration.
- **Glitches.** Scanline tears, block shifts and colour crush down to 9 levels. They respect `prefers-reduced-motion`.
  - **Hits** (`glitch`) fire on the cut, the splash and a bite: big blocks that slide. These are what the trailer shows.
  - **Timed bursts** fire every 4 to 11 seconds: finer blocks that swap colour, and about half of them hold, freezing and smearing blocks of the previous frame.
  - **He stays clean.** A mask pass keeps him and his outlines out of the break-up. The mask and the hold buffers are only drawn during a burst, so calm frames cost no extra passes.
- **Particles.** Falling leaves, fireflies, mist, and a stray cyan drop from the bottle that rings the water where it lands. Phones get 140 leaves, 70 fireflies and 5 mist sprites instead of 380, 180 and 10.

## The world

Night in an abandoned Mississippi town.

- **Palette:** night `#07050b`, ink `#120b14`, cream `#f1e6cf`, rust `#ec803a`, cyan `#6fd6c8`, hot `#e3285c`, dusk `#a99bc0`.
- **Sky:** horizon `#e0662a`, clouds `#1d1230`, moonlight `#c9d4ff`, purple fog `#2a1838`.
- **Surfaces:** flat-shaded terrain and foliage, ink outlines on buildings and steel, kudzu `#3f7a35` over everything left standing.
- **The bridge:** a rusted truss with an orange rail (`#d76a2c`).
- **The town:** the Mercantile, gas station, church, water tower, and a rusted boxcar on a railroad with dark ties (`#2a1d18`).
- **The river:** it takes glowing rings where things hit it. Cottonmouths open white mouths before striking.
- **The lantern:** the one from the local legend, a guide light with nobody holding it that leads him across the river.

The brief is a "perfectly 3d modeled city": the real layout and landmarks of Chunky on real street geometry, rendered in this hand-drawn style. Accuracy applies to where things are and what they are. It doesn't mean photorealism. The roads, the railroad and the river come from the road graph. The buildings are still the prototype's, placed along those roads, until their own tickets rebuild them.

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

Touch comes first, because the game is played on a phone. Left thumb moves, A acts, B boosts or jumps, and dragging looks around. WASD or arrows, E and Space cover desktop.

## What stays out of this repo

- **Real trademarks.** Bottle labels and signs use invented brands or the warning triangle alone. In-world brands can come from the same family as DEL MUERTO, VOODOO HEAT, BLACK SUN, GRAVEYARD SHIFT and DEEP END. Check that a name isn't a real brand before using it.
- **Music without rights.** The existing video captures of the bridge scene are cut to a commercial track with no licence, so neither they nor the track belong here.
- **Google map imagery or geometry.** Roads come from Census TIGER/Line data. Google Maps is for comparing by eye only.
- **Reference images,** until the owner decides they can be public.
