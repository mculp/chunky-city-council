# Toni

Toni is ten, and an astral projection. She's at the burned house on Gallatin St, catching frogs in the ditch and the tall grass round it all night, which is always, and she shows them to whoever comes by. Toni is the owner's, in `docs/lore.md`, and so is how she looks. Her twelve frogs, their names and everything she says are the Creative Director's, from CHUNKY-135 and CHUNKY-166, and the owner can overrule any of it.

What she does is `src/toni.js`, which has no three.js or page in it, so the node tests load it too. What she says is `data/toni.json`. How she looks and everything round her is under "Toni, at the burned house on Gallatin St" in `index.html`. `npm run toni` plays it in Chrome.

## Where

She's at structure 75037508, on the south side of Gallatin St, straight across from where Clay St comes in. It's a ruin in `tools/structure_notes.json`, single-storey, with the brown roof it really has (`roofColor`). Nobody lives there, so nobody's at home in it, nobody burnt down comes out of its door and nothing's parked by it, since nothing's parked by any ruin.

In front of it is the ditch along Gallatin: mud either side of a thin line of water, with rushes along both edges and a gap where the drive crosses. Round the house the grass is tall, and kept off the house, the drive and the road. Both are one mesh, laid on the ground the way the ball field's clay is, and none of it uses `rnd()`. The drive in is gravel, which is `surfaceOf` in `tools/lane_config.json`.

She looks for frogs at twelve spots, `TONI_SPOTS`: six along the ditch, either side of the drive, and six in the yard.

## How she looks

She's a big-boned ten-year-old, not a small grown-up. She's 1.36 m tall with a round head 0.29 m from chin to crown, so she's about 4.7 heads tall, where Coop and Miss Bobby are about 5.8 measured the same way. Her head's about 70% as wide as her shoulders, where a grown-up's is about 54%. Her shoulders are broad for her height and her legs are short: her hips are 40% of the way up her, where theirs are 44%.

Her look's from `data/looks.json`: a child's face (`face: "kid"`) with round cheeks, big eyes, a button nose and a little smile, brown hair to her shoulders, a big green army coat done up and down to her knees with its sleeves past her wrists, and chunky boots. She's stood up straight like Robby.

Her body's on the same sheet as everyone's, so her face and her coat land where they do on anyone. It's moved to her own heights by a smooth curve through six of them, `TONI_BUILD`: her hem, waist, shoulders, neck, chin and crown. The rest of her is the townsfolk's rig at .74 of a grown-up's size.

She's drawn as an astral projection, the way `docs/art-direction.md` says, so she's see-through and shimmering, doesn't glow, and nothing stops on her. The crowd never sees her and a swing goes through her, since she's in none of what they look at.

## The frog in her hands

There's never a jar. The frog's in both her hands, cupped together in front of her chest about .9 m up. It isn't a projection: it's solid and drawn the way things are, with no light of its own. What lights it is her. Her shimmer is a little cold light from her chest that only the frogs she's holding get, and it flickers with her rows on the twelve frames, so the frog reads at night and is what you see first.

It's alive. Its throat swells and goes down a little faster than once a second, it blinks every so often and it shifts round in her hands. Grandma, the gray treefrog, goes green while nobody's looking at her and gray again while she's shown.

## What she does

She walks to a spot, crouches in the grass for 2 to 4.5 seconds, stands up with a frog, waits 1 to 3 seconds and goes on to another spot. That's `TONI` in `src/toni.js`, with the rest of her numbers.

## Talking to her

When he comes within 26 m of the house on foot, she goes up to him, stops 1.25 m in front of him and asks "Wanna see a frog?" in the words box, the same as anyone he talks to. He answers "Yeah." or "Later.". Coming back means having been 70 m away first, and standing about doesn't bring her over again. Whenever he's near her the button says TALK, E on a laptop, and she asks him the same. If he's a little way off she comes closer first.

- **Yeah.** She holds up the next one he hasn't seen and says who it is, with its own line. Gerald's first, then the rest in order.
- **Got another one?** The next one. He can see all twelve, one after another, in one go.
- **The one more thing to ask.** Under each frog there's one more thing he can ask her, from `asks` in turn, and each only once a conversation: "Can I pet him?", "Is he a prince?" and "Are you really here?". They say him or her as the frog is, so with Princess it's "Is she a princess?".
- **Later.** She goes back to her frogs.

If he walks off more than 7 m she stops. On a laptop the number keys answer her too. While she's talking to him the camera goes round over his shoulder to see her above the words. It goes further round, lower and closer to her than for talking to anyone grown, or he'd hide her.

Once he's seen all twelve, the next "Got another one?" or "Later." gets him Gerald.

## The gone quiet

She goes up to the gone quiet near the house too, once each a night, and shows them one for 9 seconds. They don't react, and she says "He liked it. He just doesn't show it." if he's within 25 m to hear it. A night is one of the church signs' days.

What she says to them goes over her head a line at a time, in `#toniSays`, small and in cream with a dark edge. Each line is up for 1.4 seconds and .3 seconds a word, and fades in and out. With reduced motion it's there at once.

## What she remembers

Which frogs he's seen, by name, whether she's given him Gerald and whether he's still holding him are saved in `localStorage` under `chunky.toni`. If storage is refused, she only forgets. The button that forgets everyone forgets her too, and Gerald's hers again.

## Gerald

When he's seen the twelfth, she holds Gerald out and says "Take Gerald. He knows now." If he's still there 1.8 seconds later, Gerald's his, in the hand he doesn't throw with, and she watches him for 3 seconds and goes back to her frogs. If he's walked off, she keeps Gerald until next time. After that she never shows Gerald to anyone again and goes round the other eleven.

Gerald sits on top of his hand, held out flat at his side, so all of him shows from behind him, standing or walking, and from behind on his left, the hand he's in. He's lit by the night like anything else.

While he's holding Gerald his hand's full, so there's no swinging: no SWING on the phone, no swing on a laptop, and a tap doesn't swing either. He can still throw, talk and shamble.

- **SHOW.** Coop, Rocky and Miss Bobby each have one line for Gerald, which `has:gerald` in `data/cast.json` says once each and remembers. Until it's said the button with them is SHOW, and then TALK.
- **LET GO.** In any ditch the button is LET GO. A ditch is the low ground just past a road's shoulder, though not along somebody's drive, or within 3 m of a pond, or within 8 m of the river. Gerald hops down out of his hand and off into the ditch twice, and he's gone for good.

## Word getting round

Once he's seen one of her frogs, the gone quiet within 220 m of the house sometimes mutter "Did she show you Tuba?" instead of their own line. It names one of the frogs he's seen. `data/folks.md` has how often.

"Your buddy saw Princess. He held her wrong." isn't built. It needs the shared town to remember which frogs each player has seen, and it comes with whichever playing-together step gives the town people's memories.

## Sound

Frogs call near her house as often as they do by water, and seven in ten of them from the ditch. They're the frog sounds that were already on the sound sheet, so nothing new was made. Gerald gives one as he hops away.

## Reduced motion

Her words over her head are there at once and fade out without moving. Her rows hold still, as everything else's do: they have their own step, `ASTRAL.uStep`, set with everyone else's. The frog in her hands sits still, without breathing, blinking or shifting, and her light on it doesn't flicker.

## `data/toni.json`

| Field | Type | What it is |
|---|---|---|
| `ask` | string | What she asks as she gets to him, or when he talks to her. |
| `answers` | object | His answers in the words box: `yes` to her asking, `another` for the next frog, and `later` to stop. |
| `frogs` | object | Each frog's own line, by name. The names are `FROGS` in `src/toni.js`, which has each one's kind and size. |
| `he` | string[] | The frogs that are boys. |
| `asks` | object[] | The one more thing he can ask her about the frog she's showing, in turn: `ask`, what he asks, `say`, what she says, and `her`, the same two for a frog that isn't in `he`. Without `her` they're the same for any frog. |
| `quiet` | string | What she says after showing one of the gone quiet. |
| `give` | string | What she says holding Gerald out to him. |
| `word` | string | What the gone quiet mutter about her, with `{frog}` for which one. |

## For tests

With `?test`, `__game.toni` has:

- `state()`: what she's doing and where, what she remembers, her home and spots, whether she's drawn, which frog's in her hands, and how high she's standing.
- `says()`: what she's saying over her head now, and whether it's up and how faded, as of the last frame drawn.
- `talking()`: whether she's talking to him.
- `frog()`: the frog in her hands: which it is, whether her hands are cupped round it with her fists away, how far it is from the middle of her cupped hands and how high off the ground, its throat, whether it's blinking, how it's turned, and how it's lit.
- `mesh()` and `meshes`: the frog in her hands, and Gerald in his and all of hers, to see how much of them shows from the camera.
- `shimmer(k)`: how strong her light on the frog is, set to `k` or read.
- `build()`: how she's built, measured on her mesh, and Coop and Miss Bobby the same way: how tall, their heads from chin to crown and across, their shoulders and hips, in metres, and how many heads tall they are.
- `lineUp(on)`: Coop and Miss Bobby stood either side of her for a picture, until it's called with `false`.
- `gerald()`: whether he's holding Gerald, and whether Gerald's drawn in his hand or hopping away.
- `astral()`: whether all of her is drawn as a projection and the frogs in her hands aren't.
- `rows(step)`: sets her rows' step, and nothing else's.
- `road`, `inDitch(x, z)`, `night()`, `grandma()`, `FROGS` and `T`.
