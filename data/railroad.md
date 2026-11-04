# The railroad

The track is TIGER's, in `data/roads.json` with the roads, and so are the three places it crosses the river, where the trestles are. `data/railroad.json` holds the words on the marker by the west trestle. `src/trains.js` runs the trains, `src/trainmodels.js` says what they look like, and `index.html` draws them and says what they do, under "the train".

Nothing in the game, the data or this document says whose railroad it is. TIGER's rail names can be real operators' names, so `data/roads.md` calls it `Railroad`, and so does everything else. `src/trains.test.js` checks the marker for the names it might be.

## Where it comes from

| What | Source | Licence |
|---|---|---|
| The track, and where it crosses the river | [Census TIGER/Line](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html) 2025, as in `data/roads.md` | Public domain |
| The crossings' masts, lamps, arms and the box beside them | Street View by eye at Chestnut St, written down here in words | |
| What happened at the west trestle in 1863 | [Wikipedia](https://en.wikipedia.org/wiki/Chunky_Creek_train_accident) and the [Newton County Historical and Genealogical Society](https://nchgs.org/html/train_wreck_1863.html), in the marker's own words | |

No geometry comes from Google imagery, and no imagery's in the repo.

At Chestnut St each side of the road has a grey mast with a crossbuck and a pair of red lamps, an arm that comes down across the lane, and there's a white metal box on one corner. Every one of the five road crossings gets the same. Nobody's published a drawing of the trestles that I could find, so they're timber on pile bents, by eye.

## How it runs

- **One at a time.** It comes by near wherever he is: 75 seconds after he first gets to town, and then every 270 to 310 seconds, one way and then the other. A single track 16.5 km long can't keep two going opposite ways on a real clock without somewhere for them to pass, and on foot, one every five minutes or so near him is as good as a timetable. A server for more than one player would need a real one.
- **Out of sight.** It starts 1.5 km up the line from him and it's gone once its tail's 1.1 km past him, or he's 2.4 km ahead of it. More than 3.2 km from the line, nobody'd know, so none comes.
- **What it is.** One or two locomotives and 14 to 24 cars, or 10 to 16 on a slow phone: boxcars, covered hoppers and tank cars, with a lot of the same kind in a run. 22 m/s, about 50 mph.
- **Only the through line runs.** The three short pieces of track off it don't get trains.
- With `?test` it stays away until `trains.go()`, so that every test that isn't about it is left alone.

## What it does

- **The horn.** 420 m short of every crossing and every trestle it blows, and again 4.6 seconds later. The sound's one long blast with an echo, and not the long, long, short, long that's really blown for a crossing, which is why it plays twice. If he's on the tracks within 260 m ahead of it, it's two short blasts every five seconds.
- **The crossings.** Every crossing, road or lane, counts as shut from 13 seconds before it gets there until its tail's 14 m past. That's what drivers wait for, without going round, and the kids on four-wheelers too. Anyone already on it carries on. Only the five road crossings have gates: the arms take five seconds to come down and seven to go up, the red lamps take turns, and the bell rings within 110 m.
- **What you see.** The headlight first, as a star down the line that's the same size however far off, then a glare up close, with the track lit ahead of it. The two lamps down low take turns coming up to a crossing, and a red one blinks on the last car. None of it is a real light, because the one spare in the scene is already in use. With reduced motion, nothing blinks.
- **What you hear.** A rumble from 1.1 km off, higher as it comes and lower as it goes, and the wheels over the joints within 90 m. Within 34 m it shakes the camera, unless motion's reduced.
- **Him.** It doesn't stop for him. Walking into its side just stops him, but in front of it he's thrown, and it's the fail card: "The train got you." That's whether the crowd's out or not.
- **The crowd.** The horn draws anyone within 95 m of a crossing to it, like a lure, and they get wise to it the same way. People at home have lived with it all their lives and don't come. Nobody dies of it. It throws whoever it hits clear of the tracks: off the side of it they land 4 to 5 m from the middle of the track and lie there 30 to 36 seconds, and off the front, further and harder, 45 to 55. That's longer than a swing, a blast or a pickup keeps anyone down, which is 20 seconds at the most. Then they get up sore and walk home, at 0.7 of their pace, and whatever they were up to, even coming for him, they've had enough of it. With reduced motion they don't turn over on the way. Nobody blames him for the train, but they keep away from where it happened, as they do a fire. `data/folks.md` has what happens to them.
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

## Checking it

`npm test` checks the logic: the timetable, one at a time, the cars in order and round a bend, the crossings, the horn and what's at a spot. `npm run trains` goes and plays it, with reduced motion as well, including that nobody the train throws is lost.
