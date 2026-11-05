# The railroad

The track is TIGER's, in `data/roads.json` with the roads, and so are the three places it crosses the river, where the trestles are. `data/railroad.json` holds the words on the marker by the west trestle. `src/trains.js` runs the trains, `src/trainmodels.js` says what they look like, and `index.html` draws them and says what they do, under "the train".

Nothing in the game, the data or this document says whose railroad it is. TIGER's rail names can be real operators' names, so `data/roads.md` calls it `Railroad`, and so does everything else. `src/trains.test.js` checks the marker for the names it might be.

## Where it comes from

| What | Source | Licence |
|---|---|---|
| The track, and where it crosses the river | [Census TIGER/Line](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html) 2025, as in `data/roads.md` | Public domain |
| The crossings' masts, lamps, arms and the box beside them | Street View by eye at Chestnut St, written down here in words | |
| What happened at the west trestle in 1863 | [Wikipedia](https://en.wikipedia.org/wiki/Chunky_Creek_train_accident) and the [Newton County Historical and Genealogical Society](https://nchgs.org/html/train_wreck_1863.html), in the marker's own words | |
| The siding in town | Measured on the satellite: a straight bare bed on the north side of the tracks, from where Mulberry St comes down to them to just short of Poplar St, about 125 m | |

No geometry comes from Google imagery, and no imagery's in the repo. The siding's ends were measured there and written down here as two points.

TIGER's line runs about 4.7 m north of the real track at Poplar St. The siding is measured from the game's track, so it lands on the bed's bare ground, and if the track's ever moved onto the real one, the siding moves with it.

At Chestnut St each side of the road has a grey mast with a crossbuck and a pair of red lamps, an arm that comes down across the lane, and there's a white metal box on one corner. Every one of the five road crossings gets the same. Nobody's published a drawing of the trestles that I could find, so they're timber on pile bents, by eye.

## How it runs

- **One at a time.** It comes by near wherever he is: 75 seconds after he first gets to town, and then every 270 to 310 seconds, one way and then the other. A single track 16.5 km long can't keep two going opposite ways on a real clock without somewhere for them to pass, and on foot, one every five minutes or so near him is as good as a timetable. A server for more than one player would need a real one.
- **Out of sight.** It starts 1.5 km up the line from him and it's gone once its tail's 1.1 km past him, or he's 2.4 km ahead of it. More than 3.2 km from the line, nobody'd know, so none comes.
- **What it is.** One or two locomotives and 14 to 24 cars, or 10 to 16 on a slow phone: boxcars, covered hoppers and tank cars, with a lot of the same kind in a run. 22 m/s, about 50 mph.
- **Only the through line runs.** The three short pieces of track TIGER has off it are 11 to 17 km from town and don't get trains. In the story nothing uses the siding in town either.
- With `?test` it stays away until `trains.go()`, so that every test that isn't about it is left alone.

## Online

In the town everyone shares, the trains run to a timetable, so it's the same train for everybody. `makeTimetable` in `src/trains.js` works out where every train is from the town's clock and nothing else, so only the clock goes over the wire, and the town can use it too.

- **Two at once.** The ones going east are locals: one locomotive and as many cars as stand clear of both the siding's switches, which is four, or five hoppers. The ones going west are the through freight, as long as the story's, and it never waits. Most of the time it's a local and a freight, but for the five minutes before a local comes to a stand on the siding, the one before it is still going away east, so it's two locals.
- **They pass on the siding in town.** The local slows to 6 m/s by the siding's west switch, by Mulberry St, crawls onto it and stands with its nose just short of the east switch, short of Poplar St, with its engine running. The freight comes out of the long single track east of town and goes by it. Its tail's past the east switch just before the local gathers speed and goes on east into the single track the freight's just left.
- **How often.** A pair every 19½ minutes (`every`), the soonest the 11 km of single track east of town can take one each way, and a little over. The local stands half of that (`stand`), so trains come through town evenly: the local rolling in, then 9¾ minutes later the freight with the local pulling out behind it, then 9¾ minutes later the next local. Further out along the line the two go by closer together, and at the far ends two come by within about a minute every 19½ minutes.
- **Where they come from.** 400 m past either end of the line, out past where anyone can walk, and that's where they go.
- **What's in it.** Every run has a number, and what's in it comes from that number, so every phone builds the same train.
- **The crossings go by when it'll get there.** A crossing shuts when the timetable will have a train on it within 13 seconds, and stays shut until the tail's 14 m past. So Poplar St's gates stay up while the local stands short of them and come down as it starts, as a real crossing's do. In the story, where nothing stops, that's the same thing as shutting 13 seconds' run short of it.
- **The horn** is blown by the same rule, 420 m's run short of a crossing, which for the local is as it gets ready to go. Whether it's heard is each phone's own, for a crossing within 300 m of whoever's playing.
- **A train that's standing** doesn't blow for anyone on the tracks, and one on the siding blows for whoever's on the siding's track ahead of it, not the main track beside it. How near a train is, which its sound is made of, is from the track it's on.
- **The town's clock** is in its welcome, and each phone keeps it, plus half the way there and back (`wall()` in `src/net.js`), so the trains are where they are on every phone to within a few metres. A town that doesn't say leaves a phone on its own clock, which is near enough. In the town everyone shares no train comes until they're in, and with `?test` not until `trains.go()`, as in the story.
- **On the page** both are drawn, each with its own lamps, and only one that's going hits anything: the local standing on the siding doesn't throw the crowd, knock a vehicle about or get him, and he can't walk through it. Standing, it's only its engine running, the rumble at half and no clatter.
- **The town runs them too,** for the crowd it runs (`server/crowd.js`), from the same timetable and its own clock, so they're where every phone has them. They're in the crowd's way where they are, on foot or thrown, and hide whoever's behind them, and one that's going throws anyone on the tracks clear of them, as on the page. It needs nothing from the phones for that.
- **The siding's drawn in the story too**, since its bed's there: rails rustier than the main line's, from where they're off the main line's at each switch, on ties wherever it's clear of the main line's, with the woods kept 6 m off its track, as they are off the main line's (`clear` on the siding in `src/trains.js`).

## What it does

- **The horn.** 420 m short of a road crossing it blows, once, if he's within about 300 m of the crossing (`hornNear`), and only once a train, for the first crossing it comes to that he's near. It doesn't blow for a crossing a long way off from him, or for the trestles. It's blown long, long, short, long, as it really is for a crossing, with an echo after each, and it's heard up to 1.2 km off: loud close by, faint from a kilometre and gone past that. If he's on the tracks within 260 m ahead of it, it's two short blasts, and not again for 15 seconds (`blastEvery`), which at the speed it goes is once before it gets to him. They're heard up to 500 m off.
- **The crossings.** Every crossing, road or lane, counts as shut from 13 seconds before it gets there until its tail's 14 m past. That's what drivers wait for, without going round, and the kids on four-wheelers too. Anyone already on it carries on. Only the five road crossings have gates: the arms take five seconds to come down and seven to go up, the red lamps take turns, and the bell rings within 110 m.
- **What you see.** The headlight first, as a star down the line that's the same size however far off, then a glare up close, with the track lit ahead of it. The two lamps down low take turns coming up to a crossing, and a red one blinks on the last car. None of it is a real light, because the one spare in the scene is already in use. With reduced motion, nothing blinks.
- **What you hear.** A rumble from 1.1 km off, higher as it comes and lower as it goes, and the wheels over the joints within 90 m. Within 34 m it shakes the camera, unless motion's reduced.
- **Him.** It doesn't stop for him. Walking into its side just stops him, but in front of it he's thrown, and it's the fail card: "The train got you." That's whether the crowd's out or not.
- **The crowd.** The horn doesn't bring anyone to a crossing. Nobody dies of it. It throws whoever it hits clear of the tracks: off the side of it they land 4 to 5 m from the middle of the track and lie there 30 to 36 seconds, and off the front, further and harder, 45 to 55. That's longer than a swing, a blast or a pickup keeps anyone down, which is 20 seconds at the most. Then they get up sore and walk home, at 0.7 of their pace, and whatever they were up to, even coming for him, they've had enough of it. With reduced motion they don't turn over on the way. Nobody blames him for the train, but they keep away from where it happened, as they do a fire. `data/folks.md` has what happens to them.
- **Vehicles.** Anything it hits is wrecked, alarm and all, and thrown off the tracks. A driver gets out and doesn't blame him. If he's in it, he's got as long as any wreck to get out.

## The trestles

Black creosoted timber: stringers on bents every 4.8 m, each four piles to a cap with the outer two leaning in and a cross brace over them, 34 m each way from where the line crosses the river, and a floor of ties 2.9 m wide. They're walkable, as a risky shortcut. There's no railing except round a platform out on one side halfway over, where there's room to stand clear while a train goes by. He can fall off or jump into the river, the piles stop anyone swimming under, the crowd can follow him out, and a truck can try it. A train throws the crowd off the side of one into the river, and the river brings them up again downstream, on the bank, soaked, with a snake on a sleeve, to walk home, as in `data/folks.md`. Nothing on them breaks yet.

The west one's the small one, labelled `break down` in `data/roads.json`, where the bridge went into Chunky Creek in 1863. The marker stands on its east bank, plain, with the date and what happened. There isn't a ghost: the owner doesn't know of any story there, so none gets told.

## Not built

The old depot. It's gone, and nobody's said where it stood, so it isn't guessed at.

## Schema of `data/railroad.json`

| Field | Type | |
|---|---|---|
| `version` | number | 1 |
| `marker.at` | [x, z] | Where the marker stands, in true metres from town center, +z south |
| `marker.title`, `marker.date` | string | What's across its top |
| `marker.lines` | string[] | Its words as they're broken on the plaque |
| `marker.words` | string | The same words in one piece, for when he reads it |
| `siding.west`, `siding.east` | [x, z] | Its switches, on the game's track, in true metres from town center, +z south. The west one's 25 m short of where Mulberry St comes down, and the east one's at the bed's east end, about 5 m short of the middle of Poplar St |
| `siding.gap` | number | Metres from the track to the siding at its fullest, on the left going east, which is north |
| `siding.ease` | number | Metres it takes from each switch to get there |

## Checking it

`npm test` checks the logic: the story's one at a time, the cars in order and round a bend, the crossings, the horn and what's at a spot. Online, it checks that the timetable gives every phone the same trains in the same places, that the local takes the switches at a crawl, stands as long as it says and goes once the freight's by, that the two only ever pass where one's on the siding, on the real line too, that a train comes through town evenly, that Poplar St's gates stay up while the local stands, that the siding's on the bed and clear of Railroad St, and what's clear of its own track, round the line's bends. `npm run net` checks that two phones have the same trains in the same places by the town's clock. `npm run trains` goes and plays it, with reduced motion as well, including that nobody the train throws is lost.
