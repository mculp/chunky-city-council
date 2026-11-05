# Folks

Everyone in the crowd is somebody. `data/folks.json` holds what they can be called, `src/agents.js` works out what each of them is like and keeps what they remember of him, and `src/horde.js` does what that says. `src/river.js` says where the river brings someone up. `npm test` checks the file and the logic, and `npm run agents` plays it in Chrome.

The cast in `data/cast.json` are separate. They've always remembered him, through their meters.

There are four kinds of people, and they're all the same people underneath, with the same list of names and the same memory:

| Who | Numbered from | Where | What's in `src/` |
|---|---|---|---|
| The crowd | 0 | The streets of town, once Chapter 1 ends. Most have gone quiet and leave him be until he starts something, and the few who've burnt down stop and turn to him when they hear, smell or see him, and then come. | `horde.js` |
| People at home | 1000 | At their door, in the house and in the yard, as soon as he's in town, and they've got nothing against him | `horde.js`, with `home` |
| Someone driving | 5000 | Along the real roads, on their own side | `traffic.js` |
| Kids on four-wheelers | 6000 | The lanes and drives | `traffic.js` |

## Who they are

Everyone has a number, starting from 0, and everything about who they are comes from that number. Nothing's saved for this, and it never changes:

- Their name. Half of everybody's an Alexander or a Clark, and an eighth are Gressetts, which is the owner's. `id % 4` says which of the first two, and out of the other half, everybody whose `id % 8` is 2 is a Gressett. The first names are made up, and a test fails if one of them is ever in `docs/lore.md` or `data/cast.json`.
- What they look like: which of `data/looks.json`'s looks, how far gone, how big, which leg they limp on.
- What they're like.

| Trait | 0 to 1 | What it does |
|---|---|---|
| `temper` | How quick to anger | How far off they can make him out, and how long what he's done stays with them |
| `nerve` | How much it takes to scare them | After being hit, whether they come back at him or keep away |
| `nosy` | How much they notice | Whether they'll follow him about, and how soon a thrown bottle stops holding their eye |
| `homebody` | How much they stay put | How far they'll go from where they started |
| `tagalong` | How much they'd rather go with somebody | Whether they go along with their own family |

The numbers are `hash`-like rolls and not `crowdRand`, since asking that for anything new would change what everybody does after it. How long the river keeps someone under, which bank they're set down on and how long the snake hangs on are rolled the same way, from their number, and so they're the same for the same person every time.

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
| `fooled` | How many times each kind of thrown thing has made them look |
| `when`, `seen` | The play clock when something last happened, and when he was last close |
| `met` | Whether he's been around them for 1.5 seconds, which is who has `where` kept. It isn't knowing their name: nothing tells him anyone's name yet, so no name in the crowd is on the screen. |
| `shun` | Where they were last hurt |
| `where` | Where they got to, so they're there the next time. Only for someone he's met. |

The clock's the one thing kept with them, and only runs while playing.

There was a `gone` here once, for whoever the river had, and the next number came out in their place. Nobody's lost to anything now, so it's not kept and not written. A save from before that says some people are gone, and they're back: it's read with that left out, and what else it says of them is kept. `version` hasn't changed, because that would have wiped everything else everyone remembers.

## How they are with him

It all comes down to one of four things, worked out when it's needed. Nothing on the screen says which: it shows in what they do.

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
| **After you** | Can tell from further off, up to two and a half times, as a hit fades. Notices twice as fast. Gives up after losing him like anyone else: nobody stays on him for good. With nothing else on, half the time they head his way. |
| **Keeps away** | Goes the other way as soon as they can tell he's there, or at 6 m even if he's quiet, faster than they'd go looking and with their hands up. Backed in where they can't go any further with him within 2.2 m, they stop, turn to him and flare for a second like anyone else about to come for him, and then turn on him for 3 seconds: if he backs off in that second they go back to keeping away, and they're one of the three. When they wander, it's not towards him. |
| **Following you** | Comes to between 7 and 13 m off, always the same for the same person, and stops there and faces him. Never lays a hand on him. Only if they've burnt down does a noise rouse them or a thrown bottle hold their eye, like anyone else. |

And whatever their mood:

- **Vehicles.** Anyone a vehicle's hit gets out of the way of one, even if they'd come at him on foot.
- **Places.** They won't wander within 20 m of where they were last hurt. A fire, the train or the river counts for this and nothing else, because nobody thinks of any of them as something he did.
- **Thrown things.** A kind stops holding someone's eye after it's done it 2 to 5 times, the nosiest soonest. A different kind still does.
- **Family.** The ones who go along with others follow the nearest of their family within 20 m who'd sooner go their own way, which keeps anyone from going in a ring. That's why you see two or three walking together.
- **Word.** Someone who was there or was hit tells anyone in their family who's within 8 m, for 90 seconds. It only goes one step.
- **Home.** Once someone's further from home than they'd go, they go back. That's 40 m for a homebody and up to 440 m for someone who isn't.

## Never for no reason

Nobody comes for him out of nowhere. Before one does, it **stops, turns to him and flares for a second**, with one groan as it does (`crowdVoices` in `index.html`), and that is all the game says of it: **nothing on the screen says why.** There's no line at the bottom, no toast and no element in the page to put one in. That's the owner's call: it's a video game.

What woke it is only kept, as `{ kind, her }` inside `src/horde.js`, for two things. One is what has to still be true by the end of the second for one that was woken by something about him (below). The other is the tests, which read the last 64 of them from `__game.roused.log`, each `{ at, kind }`, and how much hotter the flare is than the glow of anyone after him from `__game.roused.FLARE`. The `kind` is `steps`, `engine`, `beans` or `close` for something about him, `hit` for him hitting them or someone beside them, `took` for him picking something up at their feet, `cornered`, `gave` for him giving himself away, `saw`, or what a noise was called: `crash`, `alarm`, `swing`, `blast`, `bell` and so on. `her` is whether whoever he hit is a woman, from what `src/agents.js` knows of them (which list their first name is on), and nothing reads it out.

If he backs off by more than 1.5 m in that second (`rouseBack`), or hides, it goes back to what it was doing, and is left alone for `coolFor`, 3 seconds. One woken by something about him, his steps or his beans, goes back too if that's stopped being true by the end of the second. The second is `rouseFor`. The flare is `ROUSE_FLARE` in `index.html`, 0.6 over the full glow of anyone after him, and like the grab's it's brightness and not movement, so reduced motion keeps it. `npm run afternoon` checks that nothing new goes up on the screen when they stop, on a phone and with reduced motion, and `lures`, `church`, `quiet`, `agents` and `swing` check it for an alarm, the bell, a swing, a bottle and getting up.

Someone already after him isn't roused again. `rouse` leaves them alone, so a bottle that hits one, or him giving himself away beside one, doesn't end its chase, use up one of the three or send another back.

## Noise

Noise rouses the ones who've burnt down and are near enough to hear it, and only them. A crash, an alarm, a swing that hits nothing or the church bell doesn't bring the ones who've gone quiet, or anyone at home: those come only if he hits one, or someone within 10 m of them. It rouses the nearest first, no more than three, and the rest look up and go back. They come for him, and not for wherever it was: nobody walks over to a noise.

A noise rouses once for each one. Anyone who walks into earshot while it's still going is roused then, and one that has just been sent back or given up isn't roused again by the same racket. If he can't be found, in the church or barred in, it stirs nobody then, and the moment he can be found while it's still going the nearest three are. His own noise counts too, by how fast he's going and, in a vehicle, by the vehicle: a pickup's heard from 45 m and well past that flat out, and a golf cart hardly at all.

The reach and time of each is the `horde.noise(x, z, reach, seconds, kind)` call in `index.html`: a swing 14 m for 1 s, a hard hit in a vehicle 40 m for 1.5 s, a wreck 60 m for 2 s, a blast nine times its radius for 6 s, a car alarm `ALARM` in `src/lures.js`, 80 m for the first 5 seconds of its 30, as it goes off (it's heard, and its lights go on and off, for all of them), and the bell `BELL`, 160 m for 20 s, with the church off limits to them while it rings and after.

**Nothing draws a crowd.** Not the bell, an alarm or the train's horn, since everyone in Chunky has heard all of them every day for years, and nobody follows anything into the water. A crowd will come for supper, and supper isn't in yet.

## Thrown things

A bottle, firecrackers and lighter fluid that's burning draw nobody either. A burnt-down one near enough **turns and looks** at where it came down, stood still, and can't make out anything else while it does, which is long enough to slip past: a bottle holds the ones within 14 m for 7 seconds, which is about how long it takes to walk from a dozen metres short of one stood by the road to well past it, firecrackers the ones within 24 m for the 8 seconds they go off, and a fire the ones within 14 m for the 18 seconds it burns. Nobody walks over to any of it. The ones who've gone quiet, the ones at home and the ones already after him aren't interested, and a kind of thing stops doing it to someone after 2 to 5 times, the nosiest soonest. Hitting someone with it is a different matter: that's him hitting them. A can of beans isn't thrown.

## Three at most

However much noise he makes, no more than three are after him at once (`afterMost`), counting the ones who've been roused as well as the ones coming. Anyone else who'd have been roused looks up for 0.7 seconds (`lookFor`) with no flare, and goes back. Someone he's hurt, who gets up and comes for him, comes in ahead of the rest if that's three already, and sends the furthest of the others off.

## They give up

One after him that loses him for `giveUp`, 8 seconds, stops for a second, folds back down and wanders home, as it does after the train, and is left alone for 3 more. Losing him is not being able to see him: more than `sight`, 25 m, off, or with a wall or anything else at head height in between, which the page works out by walking the line in half-metre steps (`world.sees`). Hearing him doesn't help. It's `lost` on them, counting up while they can't.

At 3 m/s against his 4.4 at a walk it takes 19 to 21 seconds in the open, and a good deal less round a corner. With RUN, at 8, it takes 9 to 13, depending on how close they were when it started. `npm run afternoon` plays both.

## Where nobody goes

`horde.zones` is the places none of them goes, each a circle, `{ x, z, r }`, or a box, `{ x0, z0, x1, z1, out }`. There are two: 28 m round the church on Church St, from when the crowd comes out until the church comes down, and the compound on Pine Forest Rd, always, from the edge of the road down to the river, which is `GROUNDS` in `index.html`. Nobody steps into one, whatever he does in there. While he's in one he can't be found, so his noise stirs nobody, and anyone after him stops at the edge, loses him and gives up. Anyone in one anyway leaves it, straight out of a circle and by its way out of a box, which for the compound is the drive. The kids on four-wheelers turn round short of the compound, and the river doesn't bring anyone up on its bank there. `npm run church` and `npm run compound` play both.

## Running

He's always faster than any of them. The quickest of them comes for him folded over, at 3.24 m/s, which is 3 and 8% more, and under three quarters of the 4.4 he walks the stick at. RUN is 8 for about 20 seconds. There's no swarm any more, with its own state and speed: three of them together don't go any quicker, and nothing calls the rest over.

## Only the ones nearby are out

`fillHomes` in `index.html` brings out the people of every house within 190 m (`HOME_SEE`), and puts them back once he's more than 300 m off (`HOME_PUT`), checked once a second. It's the same body: `horde.remove` takes it out of the crowd (giving up first anyone who was after him, or about to be, so that whoever's brought back isn't hunting him with no warning) and the page keeps it in `putBack`, and `horde.restore` puts that body back when he's within 190 m again, in the same state, in the same place, with everything they remember, which was never theirs to lose. Nobody's rolled again and nobody new is added, so nothing changes in what's saved. The street crowd are from nowhere in particular and stay out. Driving up and down US 80 for ten minutes, the number out at once stays between the 96 of them and about 125, and doesn't climb.

## Gone quiet

Most of the crowd have gone quiet. They stand folded over at the waist with their arms hanging and leave him be however close he walks. They can't make him out by sound, smell, touch or light, and don't look twice when he shambles. A noise, a thrown bottle, the church bell and the train's horn don't move them either, only a light still brings them to look.

The rest have **burnt down**, and they stop and turn to him and come, as the whole crowd used to without stopping. They're the furthest gone of anyone: 1 in 15 out to 1 km from the middle of town, rising smoothly to 1 in 5 at 3 km and beyond, by how far gone each of them is and where they come out. Nobody at home or driving is one. Nobody who's gone quiet looks as far gone as the least of them in town, and further out, where there are more of them, they're drawn at least that far gone.

He **starts something** with one who's gone quiet when he:

- knocks them down: a swing, a blast, or running them down in something he's driving. A fire or the train doesn't count, because nobody thinks of either as something he did.
- hits them with something he's thrown
- picks something up from within 1.6 m of their feet, whatever it is

Then that one stops and turns to him and comes, and so does anyone gone quiet within 10 m of it, no more than three of them in all. They know where he is for 5 seconds, the same as when he gives himself away. Anyone he knocks down comes for him when they get up. Being hit, or seeing it, changes how they are with him the same as it would anyone, so anyone it makes the kind to keep away does that instead. Once they've lost him they go quiet again, unless it's left them **after you** or **keeping away**, which nobody gone quiet gets over.

Anyone whose number is under 90°, folded further over than a table, comes for him folded over like that and **scuttles**: a quick shuffle on their feet with their arms swinging, and never on their hands. They're 8% quicker than the ones who stand up: 3.24 m/s hunting against 3. That's about half of the ones who've gone quiet and every one who's burnt down. At 4.4, and a good deal more with RUN, he always gets away from either.

**Muttering.** Within 7 m of him, someone gone quiet who's on the screen says their line over their head, small and faint. It's one of the twenty in `mutters`, picked by their number, which the Creative Director wrote. It lasts 3.2 seconds, drifting up a little as it fades, and the same person doesn't say it again for 9 to 16 seconds. It's two at once at most, with someone new twice a second. With reduced motion it's there at once and fades out without moving. Within 220 m of Toni's house, once he's seen one of her frogs, about a third of them, a different third every 40 seconds, ask him `word` from `data/toni.json` instead: "Did she show you Tuba?", with one of the frogs he's seen, picked by their number. `data/toni.md` has the rest. On the way home after being flung by what he's driving, it's their line from `flung` instead, below. That's all anyone in the crowd says, and nothing new is made up for them. Whether they should say more, with a real AI model, is the owner's call.

The numbers are `HOW.burnt`, `HOW.burntOut` and `HOW.hips` in `src/agents.js`, `riled`, `snatch` and `scuttle` in `src/horde.js`, and `MUTTER` in `index.html`. `npm run quiet` plays it in Chrome.

## How far over

Everyone stands as far over as how far gone they are, as the angle at the hips between their legs and their back: 180° is stood up straight, 90° is the back flat like a table and 0° is folded right over. That's their number. It comes from their number, so the same person always stands the same way, anywhere in town, and a player can read a crowd.

It's **drawn at 90° plus half of their number**, as the owner's reference picture has it: a number of 0° looks like the picture's furthest over, 90° like the one in the middle and 180° is stood up. So nobody's drawn further over than 90°, with their back about level, and nobody's hands or head are near the ground.

| How far gone | Their number | Drawn at the hips |
| -- | -- | -- |
| Holding out | 180° | 180°, stood up |
| Coop, Rocky and Miss Bobby, and any other cast who've only quit a little | 150° to 170°, by how far gone their looks are: Rocky 151°, Coop 159° and Miss Bobby 164° | 165° to 175°: Rocky 165°, Coop 170° and Miss Bobby 172° |
| Gone quiet, and the people at home | 30° to 150°, spread evenly by their numbers, so no two in a crowd stand quite alike | 105° to 165° |
| Burnt down | 0° to 30°, the furthest gone the furthest over | 90° to 105° |

The kids on four-wheelers and anyone driving sit up straight. Robby's a ghost and isn't on it, and neither is the hero. Nobody in town stands at 180° yet: that's for anyone holding out.

It's a standing fold, at the hips and nowhere else:

- **Legs and feet.** The legs are straight and the feet are on the ground. The top half leans forward and the hips go back a little over the heels, so they don't topple, which tips the legs back, by up to 16° at the deepest. The legs don't bend, and a foot turns with its leg, so at the deepest the toes are a few centimetres up.
- **Arms.** They hang straight down from the shoulders whatever the fold, loose, swinging a little as they walk and a good deal when they scuttle. The hands never touch the ground, never rest on it and never walk on it. Their arms are as long as their legs, so for the last stretch of the fold their elbows give a little, up to 9% off the length, and a hand's never lower than about 15 cm off the ground, standing, scuttling or on their knees. Getting up off their knees, folded over, they hold them out to the sides a little for balance.
- **Head.** Stood up it tips back with the mouth open. Folded over it hangs from the neck, forward and down: a head's never lower than about 55 cm off the ground, or 45 cm getting up on their knees. It lets go between about 12° and 34° of lean. It's turned about the neck in the vertex shader by instance, so it costs no draw calls and no triangles, and it swings a little as they go, which reduced motion keeps still. Sat in something they look where they're going.

It's only a pose, so reduced motion doesn't change it. The numbers are `HOW.hips` and `HOW.flickers` in `src/agents.js`, and `HIPS_FROM` (the 90°), `ARM` and `HEAD` in `index.html`. `npm run fold` looks at all of it in Chrome.

## Knocked down

Nobody dies. Knocked down, they're down a while and get up again.

- **The swing** lands 0.2 seconds after it starts, on anyone within 1.5 m of a point 0.9 m in front of him, or 1.9 m with the bat, so it reaches about 2.4 m. As it starts it turns him to the nearest one he could reach, within 2.8 m and sooner someone who's after him than someone who isn't, by up to a metre. On a phone that's anyone on his side of a right angle. With a mouse, where the camera looks is the aim, so it's only someone within 0.5 rad of it.
- **Getting hold of him** takes them `windUp`, half a second of being within 0.95 m of him, with their hands coming up over their heads. A hit in that time stops it, and whoever's been reaching longest gets him first. So standing his ground and swinging at one coming straight at him lands first.
- **The warning.** The camera's behind him, so one coming straight at him is behind his hood for those last metres and nobody can see it reach. `src/horde.js` tells the world once as each of them starts, with `world.reaching(s)`, and the page answers with one groan, higher and shorter than a hunter's, and with what's coming off them flaring as the hands go up: by `FLARE` (0.9) past the full glow of anyone after him, wider and hotter, so that it shows round his edges. It's brightness and not movement, so reduced motion keeps it. A hit or a grab ends it, and the next go starts it again.
- **How long they're down**, getting up included, is `DOWN_FOR` in `index.html`: 10 seconds from a swing, whatever's in his hand, and 14 from a blast. A vehicle keeps them down 8 seconds and half a second more for every m/s it was doing, up to 20. A fire's still a second or so. **The train's longer than all of them**, and it's the next section.
- **Who comes for him after.** Knocked down by him, they get up and stop, turn to him and flare for a second like anyone else coming for him. Knocked down by something that isn't him, such as a fire, they hold nothing against him: whoever was after him never stopped, so they're straight back at him when they're up if that leaves no more than three, and give up if it doesn't, and anyone else goes back to what they were doing. Anyone who keeps away from him still does.
- **Asking.** `horde.down(s)` says how long someone has left, and it's nothing for anyone on their feet. `horde.keepDown(s, seconds)` keeps them down at least that much longer, for anything that needs them to stay put, and says whether they were down. They're up again the moment it runs out.

`npm run swing` tries it on a phone and a laptop.

## Home, sore and soaked

Two things used to end someone for good, and nothing does now. Whatever's happened, it's the same person at the end of it, with everything they remember, and the same number of people in town. Nobody new walks in to take anyone's place, so the horde never asks the page for anyone.

**Home** is where someone goes back to. For anyone who lives somewhere it's the door, and for the rest it's wherever they came out and go about from, which is where `roam` measures how far they'll go. Someone on their way home has nothing else in mind. Someone who comes for him on sight still does, and when that's over they go on home. It's `homeward` on them, and they give up after `homeFor`, 10 minutes, if they can't get there. Close enough is `homeIs`, 3 m, and they go on with their day from there, which for someone at home is the door, the house and the yard.

**The train** throws whoever it hits clear of the tracks, which is `trainThrows` in `index.html`. They lie where they land, in the ditch, for 30 to 36 seconds if it was the side of it and 45 to 55 if it was the front, longer than any swing or blast or pickup keeps anyone down, getting up included. Then they get up, and they're **sore**: whatever they were doing they've had enough of it, so even someone who was after him goes home, at 0.7 of their pace, with a limp, and for `soreFor`, 20 seconds more once they're there. The front throws them further and harder than the side. With reduced motion they don't turn over on the way. Nobody holds it against him, but they keep off the spot, as they do a fire, and `data/railroad.md` has the rest. Someone thrown off a trestle lands in the river.

**Flung.** Anything he's driving at 40 mph or more (`flingFrom`, 17.9 m/s) sends whoever it hits flying instead of knocking them over, which is `fling` in `src/horde.js`:

- **Where they go.** About one in three (`flungOver`) go up over the top of it and come down behind. The rest go off ahead of it, off whichever side of its middle they were on.
- **How far.** The faster it's going, the higher and further: at 45 mph, about 1.3 to 3.2 m up and 14 to 29 m on. They bounce off the road once or twice (`bounces`), less each time, and come down in a heap however they land.
- **No two alike.** Each flight's worked out from who they are and how many times it's happened to them, so it's a little different every time and nothing asks the random numbers.
- **The vehicle.** It takes the hit as a crash, a little at a time, and goes on. It doesn't stop them in the air, but a wall does.
- **Down, then home.** They lie there as long as anything driven keeps anyone down, 16 to 20 seconds from when they land, so he's long gone. Then they get up **sore** and go home, the same as from the train, and `horde.calm()` doesn't change that.
- **It counts as him hitting them**, the same as a swing, and they remember it. If he's still about when they're up, they keep away from his truck or come for him like anyone else.
- **What they say.** One who's gone quiet mutters on the way, over their head like the other mutters. It's one of the two lines in `flung`, by their number, even while they're keeping away from him.
- **A shoe.** Now and then one loses a shoe, which lands somewhere else. Nothing else ever comes off anyone.
- **Who flies.** Only the crowd and the people at home. The kids on four-wheelers can't be touched. The cast hop clear of anything coming at them at more than 4 m/s and hop back onto their spot once it's gone by.

`docs/art-direction.md` says what it looks like, and `npm run fling` plays it on a phone.

**The river** has whoever the train throws in. Nobody follows anything into it. They go under, and the cottonmouths and the current have them for 10 to 18 seconds, by their number. The current's `current`, 3.5 m/s, so they come up 35 to 63 m downstream, which is far enough that nobody's near when they come up and close enough that he can see it, and inside the 150 m the crowd's worked out for. `src/river.js` says where:

- Downstream is the way TIGER draws the river, from its upper end to its lower, so further along a line is further downstream. That was checked against the survey's elevations along it, and `src/river.test.js` keeps it that way round.
- They come up in the water, 0.8 m deep or more, a little way off the bank, and wade out of it. Nothing draws them back in while they do.
- **On the bank they can walk home from**: on the side home's on, or by their number if it's no help, dry, inside the map, with 10 m clear ahead of them and 8 m along it either way, so not against a fence or a wall. If a bank won't do it's the other one, and if neither will, a shorter way down the river. Never in a pond, and never through one.
- A pond or a pool has no downstream, so they come up on its shore towards home.
- If there's nowhere at all, they come up where they went under and wade out of it.

Then they walk home to dry off. They're **soaked** for `dries`, 80 seconds: the cloth is dark and cold, with pale glints where the moon would find it, all of it for the first 40 and then drying. A cottonmouth hangs off one sleeve for 14 to 30 seconds by their number, and then lets go. `docs/art-direction.md` says what it looks like.

Things that are only a number on them, and nowhere else: `under`, `swept`, `wet`, `snake`, `sore`, `homeward`, `flung`, and how they flop, `flop` and `twist`. None of them is saved, so after a reload everyone's dry and on their feet.

## Shambling with them

He can pass for one of them: SHAMBLE on a phone, C on a laptop, once the crowd's out. Before that there's nobody to pass for one of, in Chapter 1 or in a town that's shared, so neither shows. It holds him to their pace, 1.3 m/s however far the stick's pushed. While it holds, nobody who isn't already after him notices him by sound, smell or touch. It's for the ones who've burnt down, since anyone who's gone quiet isn't looking at him anyway. The numbers are with the crowd's in `src/horde.js`.

- **Looking twice.** Anyone within 5 m comes to see through it. It's faster the closer he is, at night, the nosier they are, and the more beans he's carrying, since they can smell those. Right up against one with nothing on him it takes about 3 to 8 seconds, and a third of that with twelve cans. It wears off once he's out of reach. When one sees through it, that one comes for him, and the act holds for everyone else.
- **What gives him away.** Running, a swing, or stepping into a light gives him away to everyone within 14 m at once. They know where he is for 5 seconds, so standing still and quiet doesn't lose them.
- **Who isn't taken in.** Someone with a grudge knows him too well, and anyone already after him stays after him. People at home leave him be either way.
- **What doesn't give him away.** Throwing something, which still makes a burnt-down one look where it came down, or jumping. A noise doesn't rouse them for him while he shambles past, since it isn't him they'd be listening for. Being grabbed, getting in a vehicle or going into the river ends it.
- **What you see.** How close each of the nearest five is to seeing through it is a small bar over their head, cream and then red near the end. For anyone off the screen it sits at the edge on their side, with an arrow.

## People at home

Four in five houses and trailers have someone at home, and three in ten of those have two. That's about 900 people, and they come out when he gets within 190 m of the house, since working out where a door is takes a moment. Nobody's kept out of a house for what's there except:

- the places set aside for how they really are, which is `SET_ASIDE` in `index.html`, the same rectangles that keep parked cars off them
- two other properties and a trailer, by structure id
- anything within 400 m of Stuckey's Bridge, which is left quiet for the opening and the light

Which people are at which house comes from their order, and the names are worked out when the game runs. No name's written next to a structure id anywhere.

They go between the door, inside and the yard, staying 8 to 26 seconds in each. The less of a homebody they are, the more often they go off down the road for a bit and come back. Everything else is the same as the crowd, with one difference: **they've got nothing against him until he gives them something.** They can't make him out at all, and nothing draws them out of the house: not a noise, a crash, an alarm, the bell or a thrown bottle. Being hit or being there when he hits someone changes them just as it would anyone. Then they're after him or keeping away like anyone else, so a fight in somebody's yard is noticed.

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

## In a town everyone shares

Online (CHUNKY-153) the town runs the crowd for everyone in it, and everything above is about each of them on their own. `horde.update` takes everyone playing, each with the town's `id` for them. The story gives it him on his own, and he has no id.

- **Who they're after.** One roused by a player is after that one, which is their id in `him`. It turns to them, comes for them, reaches for them and gives up on them. A noise, a thrown thing, a knock or a blow can say who did it with a `pid` on the end of the call, and without one it's whoever's nearest to where it happened. Anyone who isn't after anyone thinks about whoever's nearest.
- **Grabs.** Each player has their own, and their own mercy after it: `horde.grabOf(pid)`, and `horde.mash(pid)` to break free. `horde.grab` is the first one's, which in the story is his.
- **Three at most** is shared by players together. Two within 25 m of each other (`together`) share three, and stay together until they're more than 35 m apart, and so does anyone together with either of them. Apart, it's three each.
- **What they remember** is of each player, by id: `folks.mood(w, pid)` and the rest take one on the end. Him in the story is no id, and what they remember of him is on them as it always was. That's the only thing kept between sessions. Of anyone else it's under `by`, and not kept here: what the town keeps of it is 153c's. Where they were hurt, and what they've caught on to being thrown, is theirs whoever did it.
- **Leaving.** When someone leaves town, whoever was after them, keeping away from them or following them gives up, and whoever had hold of them lets go.

With him on his own all of it comes to exactly what it was. `npm test` plays the same crowd with him given alone and in a list, and gets the same, step by step.

## Schema of `data/folks.json`

| Field | What it is |
|---|---|
| `version` | Part of the save's key. Change it only if old saves can't be read any more. |
| `families` | The two families half of everybody belongs to |
| `others` | Everyone else's family names |
| `women`, `men` | First names. Their lengths mustn't be divisible by 17, which is how many they skip at a time. |
| `dressed` | A look that says which list its wearer's name comes from. Anyone else's is either. |
| `mutters` | What the ones who've gone quiet mutter, one line each, picked by their number. The Creative Director wrote them, and with `flung` they're the only words anyone in the crowd says. |
| `flung` | What one who's gone quiet mutters on the way home after being flung by what he's driving, one of the two by their number. The Creative Director wrote them. |

## Adding to it

Every number in the logic is in `HOW` in `src/agents.js` or `TUNING` in `src/horde.js`, and what he can throw is `LURES` in `src/lures.js`.

Someone's only as far as their number, so taking a name off a list or changing the order changes who everyone is, and what's saved stays with the number. That's harmless, but it's why `version` is there.
