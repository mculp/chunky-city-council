# Folks

Everyone in the crowd is somebody. `data/folks.json` holds what they can be called, `src/agents.js` works out what each of them is like and keeps what they remember of him, and `src/horde.js` does what that says. `npm test` checks the file and the logic, and `npm run agents` plays it in Chrome.

The cast in `data/cast.json` are separate. They've always remembered him, through their meters.

There are four kinds of people, and they're all the same people underneath, with the same list of names and the same memory:

| Who | Numbered from | Where | What's in `src/` |
|---|---|---|---|
| The crowd | 0 | The streets of town, once Chapter 1 ends, after him if they can tell he's there | `horde.js` |
| People at home | 1000 | At their door, in the house and in the yard, as soon as he's in town, and they've got nothing against him | `horde.js`, with `home` |
| Someone driving | 5000 | Along the real roads, on their own side | `traffic.js` |
| Kids on four-wheelers | 6000 | The lanes and drives | `traffic.js` |

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
- **Places.** They won't wander within 20 m of where they were last hurt. A fire or the train counts for this and nothing else, because nobody thinks of either as something he did.
- **Lures.** A kind of lure stops working on someone after it's fooled them 2 to 5 times, the nosiest soonest. They stay on him, and a different kind still works.
- **Family.** The ones who go along with others follow the nearest of their family within 20 m who'd sooner go their own way, which keeps anyone from going in a ring. That's why you see two or three walking together.
- **Word.** Someone who was there or was hit tells anyone in their family who's within 8 m, for 90 seconds. It only goes one step.
- **Home.** Once someone's further from home than they'd go, they go back. That's 40 m for a homebody and up to 440 m for someone who isn't.

None of them say anything. They don't have any new lines, and whether they should, with a real AI model, is the owner's call.

## People at home

Four in five houses and trailers have someone at home, and three in ten of those have two. That's about 900 people, and they come out when he gets within 190 m of the house, since working out where a door is takes a moment. Nobody's kept out of a house for what's there except:

- the places set aside for how they really are, which is `SET_ASIDE` in `index.html`, the same rectangles that keep parked cars off them
- two other properties and a trailer, by structure id
- anything within 400 m of Stuckey's Bridge, which is left quiet for the opening and the light

Which people are at which house comes from their order, and the names are worked out when the game runs. No name's written next to a structure id anywhere.

They go between the door, inside and the yard, staying 8 to 26 seconds in each. The less of a homebody they are, the more often they go off down the road for a bit and come back. Everything else is the same as the crowd, with one difference: **they've got nothing against him until he gives them something.** They can't make him out at all and don't answer the swarm's call, but a noise brings them to look, and being hit or being there when he hits someone changes them just as it would anyone. Then they're after him or keeping away like anyone else, so a fight in somebody's yard is noticed.

## Someone driving

`src/traffic.js` keeps 3 or 4 of them around him, from 150 to 260 m off, on their way towards where he is, and forgets them past 300 m. They use the road graph and not the lanes, and stay off Griffis Fountain Rd, since that's the old truss bridge he wakes on, and off anything within 400 m of Stuckey's Bridge.

They aren't driven by the physics. They follow the line of the road, on their own side, a little behind it, which is what rounds off a junction. So nobody ever drives into a tree. Each one's a real entry in `VEHICLES` to everything else: he walks into it, it's drawn the same way, a truck shoves it and a blast wrecks it.

- **Speed:** 24 m/s on US 80, 15 on the wider streets, 11 on the narrow ones, and 8 off the asphalt, more or less depending on their temper.
- **Junctions:** a little under half the time, they turn, slowing to 7 m/s.
- **What's in the road:** every fifth of a second they look along the line ahead for him, anyone else, and anything solid, far enough to stop comfortably.
- **Going round:** 1.5 to 5 seconds after stopping, soonest for the worst tempers, they go round on the other side at walking pace if it's clear and nobody's coming, then get back over. If there's no way round after 9 seconds, they turn back.
- **End of the road:** they turn back.
- **A railroad crossing:** while one's shut for the train, they stop short of it and wait, without going round, and go on once it opens. Anyone already on it when it shuts carries on over. The kids on four-wheelers wait the same way at a lane's crossing. `data/railroad.md` has when a crossing shuts.

Someone who's **after him** doesn't stop for him. Anyone hit on the road gets out of the way of a truck the same as on foot, which is `truck` in what they remember.

Anything happening to the vehicle puts the driver out of it, on foot, in the road, with what happened to them remembered: being rammed, a blast, a swing at the car, or him getting in once it's stopped. Then it's only a car, and it stays where it is. He can't get into anything that's moving.

The driver's drawn from the same instances as the crowd, sitting where he'd sit, and redrawn every frame with the vehicle. The lights are a point per lamp and a patch of light on the ground, in two draw calls, and a lamp fades out within a few metres of the camera, where a point would fill the screen.

## Kids on four-wheelers

2 or 3 of them, on any lane or drive that isn't paved, 7 to 12 m/s. At the end of one they go on to the next if there's one within 4 m, and otherwise come back.

**Nothing can touch them.** They aren't in `horde.active` or marked as solid, so a swing, a blast or a truck goes through, and they can't be got off the four-wheeler. They get out of his way first: from 16 m on foot or 30 m if he's driving, they go 7 m off the line, away from his side, or turn back if there's no room. They're smaller, and hardly gone at all.

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
