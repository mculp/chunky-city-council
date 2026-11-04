# The stone

`data/stone.json` is what you read off one stone in the cemetery up Chunky Duffee Rd. `index.html` reads it, under "the cemetery". `docs/lore.md` has what the owner said about it.

It's cut in the face of the stone at the head of the northernmost of the wide flat slabs, which the owner picked: number 1 on the map of the fourteen they were sent, north to south (CHUNKY-167). That's `CEMETERY.words` in `src/graves.js`. READ comes up standing on the slab or within 0.9 m of it, anywhere along it, and nothing points the way to it. The upright on its own in the middle, which had the words before, is an ordinary stone now.

Their song is the owner's own clip, `audio/music/stone.mp3`, which they added on 2026-11-04. It's on no sheet and in no manifest. It plays as music and not from the stone, as loud anywhere in and around the cemetery, with the night noise and the crowd dipped under it (CHUNKY-175). `src/song.js` has when:

- **Pulling up starts it:** stopping whatever he's driving, under 2 m/s, or being there on foot, within 25 m of the cemetery, which is 0 m inside it and otherwise from its edge, with the fence along the loop and the gate on it (`fromCemetery` in `src/graves.js`). Driving past doesn't, however close it goes.
- **Once a visit.** It doesn't start again by itself until he's been more than 100 m off and come back.
- **Reading the stone** carries it on if it's playing, and starts it if it isn't, because it's done or he never stopped.
- **Past 60 m it fades away** over 4 seconds, with everything it dipped coming back up as it does, and comes back up if he does first. Once it's gone, it's stopped.

Without the file, nothing plays and nothing's said. `data/sound.md` has how a clip plays.

| Field | Type | What it is |
|---|---|---|
| `version` | number | The schema's version. |
| `words` | string | What it says when it's read. Empty, it says there are words from a song on it, without saying which. |

This is the owner's to fill in, if they want to: the words are from a song, and they're the only one who can say what goes here. Nobody else types them in.

There's no name on it, and no name goes on it. The rest of the stones have nothing on them at all, because they're somebody's.
