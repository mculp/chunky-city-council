# The stone

`data/stone.json` is what you read off one stone in the cemetery up Chunky Duffee Rd. `index.html` reads it, under "the cemetery". `docs/lore.md` has what the owner said about it.

It's cut in the face of the stone at the head of the northernmost of the wide flat slabs, which the owner picked: number 1 on the map of the fourteen they were sent, north to south (CHUNKY-167). That's `CEMETERY.words` in `src/graves.js`. READ comes up standing on the slab or within 0.9 m of it, anywhere along it, and nothing points the way to it. The upright on its own in the middle, which had the words before, is an ordinary stone now.

Reading it plays the owner's own clip, `audio/music/stone.mp3`, their song, which they added on 2026-11-04. It's on no sheet and in no manifest, and `data/sound.md` has how it plays: once, from the stone, quieter as he walks off, with the night noise and the crowd dipped under it. Without the file, reading it plays nothing.

| Field | Type | What it is |
|---|---|---|
| `version` | number | The schema's version. |
| `words` | string | What it says when it's read. Empty, it says there are words from a song on it, without saying which. |

This is the owner's to fill in, if they want to: the words are from a song, and they're the only one who can say what goes here. Nobody else types them in.

There's no name on it, and no name goes on it. The rest of the stones have nothing on them at all, because they're somebody's.
