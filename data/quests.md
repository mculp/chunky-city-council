# Side quests

`data/quests.json` is the side quests the town comes up with (CHUNKY-163, and the bible's section 20). It has whose round goes where by the clock, what each shape of quest is, what's said, and what it gives him. `src/quests.js` runs it, with no three.js in it, so node tests load it too. Where they can send him is `data/places.json`, documented in `data/places.md`.

## How one comes about

1. Once a real day, at the first look after midnight in Mississippi (the church signs' day), code takes the places on the list within `near` metres of someone's walk, nearest first, for the shapes that are theirs.
2. They go to Jev through the talk server's `/decide`, in plain words: who's thinking, from `jev`; how many times he's been out with them, and how the last one went; and each place's name, with what it's for. Jev answers which shape, which place by its number, and whether it's worth bringing up today. It writes no words. Code checks the answer is one of those, and anything else means no idea that day.
3. When he next comes by that day, they bring it up with the template's `ask` line, and code puts the place's name in. An idea he isn't told that day is gone with the night.
4. It stands for that night and the two after, or the three after if tonight's already started. "I'll be there." and "Not tonight." are his answers the whole time, and their model leaves them out of its replies.
5. They go out to it each of those nights whether he comes or not, with the template's sign on their door.
   - The first time he's there with them, it's done for him: he gets the template's reward, and they keep its note.
   - If its last night goes by without him, it's lapsed. They say their `lapse` line, and if he'd said yes they keep the `missed` note.
6. They think of nothing new until its nights are over.

Sometimes `/decide` doesn't answer.
- If it might answer later the same day (it was slow, off or busy, or the fetch failed), it's asked once more an hour later.
- If the month's money is spent or the ask was bad, it isn't asked again that day.

Either way, nobody comes up with anything that day, and nothing else changes.

## What's in it

| Key | What |
|---|---|
| `nights` | How many nights an idea stands. |
| `near` | How far off someone's walk a place can be, in metres. |
| `jev` | What Jev's told, in plain words. By who, what each person's doing as they think it over. `trips` is how many times he's been out with them: never, once, and `{n}` times. `done`, `missed` and `lapsed` are how the last one went. |
| `rounds` | Each person's round, by who. |
| `templates` | Each shape of quest, by its name in `data/places.json`'s `shapes`. |

A round has:

| Field | What |
|---|---|
| `way` | The walk they think on, as points in true metres from town center, as places are. |
| `day` | Where they are through a day, as `[from, to, where, sign]` by the clock in Mississippi. The sign is what's on their door while they're away from it. |
| `sun` | Where they are on a Sunday. |

They can be at the `counter` or `away`, on their `walk` (along `way` and back), `asleep` or at `church`, and on a template's nights at the `hole`.

A template has:

| Field | What |
|---|---|
| `who` | Whose it is. |
| `night` | Where they are on each of its nights, as a round's `day` has it, over the round's. They're at the place for `hole`. |
| `sign` | What's on their door while they're out at it. |
| `answers` | What he can say: `yes` and `no`. |
| `lines` | What they say. `ask` brings it up, `yes` and `no` answer his answers, `came` is when he's there, `done` is packing up, and then there's `lapse`. `{place}` is the place's name, which only code puts in. |
| `notes` | What they remember of him: `came`, and `missed` for a yes he didn't keep. |
| `reward` | What it gives him: the `rod`, which is his to keep, `worms` for that many casts, and `trust`, which he only gets the first time he's ever out with them. |

## Coop's

Coop keeps the gas station from 6:00 to 1:00 every day. From 1:00 to 1:40 he walks US 80 east to the river bridge and back, and then he sleeps in the back of the station until 6:00. On Sunday he's at Chunky Baptist from 10:00 to 11:30 and opens at noon. While he's away, BACK AT 6 or BACK AT NOON is on the door.

For fishing, GONE FISHIN' goes on the door at 9:00. He's at the hole from 9:05 to 10:00 and back behind the counter by 10:10. When he's there, he hands him the spare rod and some worms, and the rod's his to keep.

Where he stands at a hole is worked out once, by `holeAt` in `index.html`. At a trestle it's the platform halfway over, by its railing and out of a train's way, as `data/places.md` has it. Anywhere else it's the nearest dry ground on the bank to the list's spot, at least 6 m from the railroad, a step back from the water and facing it. His own cast lands 9 m out.

The chapters come first. Through Chapter 1, and whenever a chapter needs him, he's at the counter whatever the clock says.

## Fishing

Once he has the rod, he can fish wherever there's water in front of him within a cast: off the bank, a bridge or a trestle. A worm goes each time something takes it, whether he lands the fish or not, and with none left there's no casting. `src/fishing.js` has how it goes, with no three.js in it, and the page draws it.

- **Casting.** A tap of A, facing the water, lands the bobber 5 to 9 m out, on water all the way and short of the far bank.
- **The bite.** Something takes it 3 to 11 seconds later, and the bobber goes under. A tap within 1.1 seconds sets the hook. Any later and it's gone, and so is the worm.
- **Reeling in.** Holding A brings it in 1.5 m a second, and the line strains, more for a bigger fish. Every so often it runs, for longer the bigger it is, and holding on then strains the line far faster. At its limit the line snaps, and the fish is gone. Letting go eases the strain and gives the fish line, twice as fast while it runs. Within 1.5 m it's landed.
- **What he catches.** Catfish, from 2 to 20 lb in the river and 1 to 10 lb in a pond, the smaller ones more often. They're in his pockets, and the biggest hangs on a stringer from the hand he carries the rod in.
- **What's kept.** The rod, the worms and what he's caught are kept on that phone, apart from the rest of the story, until he forgets everything. A town that's shared doesn't have them yet.
