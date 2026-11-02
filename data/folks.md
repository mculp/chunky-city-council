# Folks

Everyone in the crowd is somebody. `data/folks.json` holds what they can be called, `src/agents.js` works out what each of them is like and keeps what they remember of him, and `src/horde.js` does what that says. `npm test` checks the file and the logic, and `npm run agents` plays it in Chrome.

The cast in `data/cast.json` are separate. They've always remembered him, through their meters.

## Who they are

Everyone has a number, starting from 0, and everything about who they are comes from that number. Nothing's saved for this, and it never changes:

- Their name. Half of everybody's an Alexander or a Clark, which is the owner's, and `id % 4` says which. The first names are made up, and a test fails if one of them is ever in `docs/lore.md` or `data/cast.json`.
- What they look like: which of `data/looks.json`'s looks, how far gone, how big, which leg they limp on.
- What they're like.

| Trait | 0 to 1 | What it does |
|---|---|---|
| `temper` | How quick to anger | How far off they can make him out, how long what he's done stays with them, and how long they'll keep looking after they've lost him |
| `nerve` | How much it takes to scare them | After being hit, whether they come back at him or keep away |
| `nosy` | How much they notice | Whether they'll follow him about, and how soon they catch on to a lure |
| `homebody` | How much they stay put | How far they'll go from where they started |
| `tagalong` | How much they'd rather go with somebody | Whether they go along with their own family |

The numbers are `hash`-like rolls and not `crowdRand`, since asking that for anything new would change what everybody does after it.

## What they remember

Only what's happened is saved, under `chunky.folks.v1`, the same way as the cast. Someone nothing's happened to takes up no room, and 96 people who've all been close to him and half of whom have been hit come to about 8 KB. It's saved every 10 seconds if anything's changed, and when the page goes away. A browser that won't store anything just doesn't remember. **Forget everyone** on the title clears it.

| Field | What it is |
|---|---|
| `hurt` | Times he's hurt them: a swing, a thrown can, a blast, a vehicle |
| `truck` | How many of those were a vehicle |
| `there` | Times they were within 18 m when he hurt someone |
| `told` | Times they've heard about it from someone in their family |
| `got`, `slipped` | Times they got hold of him and he didn't get away, and times he did |
| `near` | Seconds they've been within 8 m of him |
| `fooled` | How many times each kind of lure has worked on them |
| `when`, `seen` | The play clock when something last happened, and when he was last close |
| `met` | Whether he's been around them long enough to know their name, which takes 1.5 seconds |
| `gone` | The river had them, so they don't come back and the next number comes out in their place |
| `shun` | Where they were last hurt |
| `where` | Where they got to, so they're there the next time. Only for someone he's met. |

The clock's the one thing kept with them, and only runs while playing.

## How they are with him

It all comes down to one of four things, worked out when it's needed. That's what the people panel and the name over their head say.

**What's still with them** is `hurt`, plus a fifth for each `there` and `told`, plus three tenths for each `slipped`, halving every 5 to 30 minutes of play depending on `temper`. It never goes below a fifth for someone who's been hit, because they don't forget that.

If that's under .18, they're as they always were, unless they're one of the nosiest quarter and have been near him for 10 seconds without any trouble, when they're **following you**.

Otherwise it's how bold they are: `nerve`, plus up to a fifth either way for `temper`, less .12 for each hit past the first.

| | Comes at him | Keeps away |
|---|---|---|
| They've been hit | Over .4 | Otherwise, so everyone gives up if it keeps happening |
| It was somebody else | Over .75 | Under .25, and in between it changes nothing |

## What it changes

| | What they do |
|---|---|
| **After you** | Can tell from further off, up to two and a half times, as a hit fades. Notices twice as fast. Keeps hunting 5 to 25 seconds longer after losing him. With nothing else on, half the time they head his way. |
| **Keeps away** | Goes the other way as soon as they can tell he's there, or at 6 m even if he's quiet, faster than they'd go looking and with their hands up. They don't come when the swarm calls. Backed in where they can't go any further with him within 2.2 m, they turn on him for 3 seconds. When they wander, it's not towards him. |
| **Following you** | Comes to between 7 and 13 m off, always the same for the same person, and stops there and faces him. Never lays a hand on him. A lure or a noise takes them off him like anyone else. |

And whatever their mood:

- **Vehicles.** Anyone a vehicle's hit gets out of the way of one, even if they'd come at him on foot.
- **Places.** They won't wander within 20 m of where they were last hurt. A fire counts for this and nothing else, because nobody thinks of a fire as something he did.
- **Lures.** A kind of lure stops working on someone after it's fooled them 2 to 5 times, the nosiest soonest. They stay on him, and a different kind still works.
- **Family.** The ones who go along with others follow the nearest of their family within 20 m who'd sooner go their own way, which keeps anyone from going in a ring. That's why you see two or three walking together.
- **Word.** Someone who was there or was hit tells anyone in their family who's within 8 m, for 90 seconds. It only goes one step.
- **Home.** Once someone's further from home than they'd go, they go back. That's 40 m for a homebody and up to 440 m for someone who isn't.

None of them say anything. They don't have any new lines, and whether they should, with a real AI model, is the owner's call.

## Schema of `data/folks.json`

| Field | What it is |
|---|---|
| `version` | Part of the save's key. Change it only if old saves can't be read any more. |
| `families` | The two families half of everybody belongs to |
| `others` | Everyone else's family names |
| `women`, `men` | First names. Their lengths mustn't be divisible by 17, which is how many they skip at a time. |
| `dressed` | A look that says which list its wearer's name comes from. Anyone else's is either. |

## Adding to it

Every number in the logic is in `HOW` in `src/agents.js` or `TUNING` in `src/horde.js`.

Someone's only as far as their number, so taking a name off a list or changing the order changes who everyone is, and what's saved stays with the number. That's harmless, but it's why `version` is there.
