# Sound

There are two sheets, each saying what every sound and part of the score is and how loud, and `src/sound.js` plays whichever it's given.

- `data/sound-new.json` is what the game plays: music and sounds made with ElevenLabs on fal, which the owner chose on 2026-11-01.
- `data/sound.json` is the sounds `src/soundbank.js` works out from numbers. None of that is a recording, so all of it is ours. The owner wants them kept, so nothing writes over this sheet. They're also what a sound falls back on if its file doesn't come.

| Address | What it is |
|---|---|
| The plain address | The game, playing `data/sound-new.json` |
| `#old` | The game, playing `data/sound.json`, with no audio to download |
| `#sounds-new` | One button for every sound on the new sheet. A light border means it's playing a file |
| `#sounds` | One button for every worked-out sound |

To put one sound back, copy its line from `data/sound.json` over its line in `data/sound-new.json`. To put them all back, it's the line in `index.html` that picks the sheet.

A sound that came after the old sheet stopped changing is only on the new one. So far that's `amb.flies`, the flies round Robby, the `jam.` sounds, for what's in the shed on Pine Forest Rd, `ball.bump`, `ball.land` and `tramp.spring`, for the yard off True Light Rd, `lure.bottle`, `lure.pop` and `vehicle.alarm`, for what he throws, `train.rumble`, `train.clatter`, `train.horn`, `train.blast` and `crossing.bell`, for the railroad, `church.bell`, for the steeple on the church on Church St, `cricket.a`, `cricket.b` and `cricket.c`, for the night, and `groan.reach`, for the moment their hands go up when one of them reaches for him. They have no worked-out version to fall back on or to be levelled against, so `#old` plays without them, and without saying so. `tools/make-sound.test.js` checks that the new sheet has everything the old one has, and not the other way round.

## Swapping a sound

Put the file in `audio/` and add it to that sound's line in `data/sound-new.json`. That's all, and the code doesn't change:

```json
"rope.snap": { "gain": 0.9, "max": 1, "file": "audio/my-rope-snap.mp3" },
"step.road": { "gain": 0.3, "reach": 16, "file": ["audio/step-1.mp3", "audio/step-2.mp3"] },
```

A list is takes, and one's picked each time. Use mp3, which every phone can play. If the file doesn't load, the sound keeps its own.

Whatever the file's like, it comes out sitting with the rest. Its silence comes off both ends, its peak goes where the worked-out one's was, and it's folded to one channel. A loop keeps every sample and both channels, except on a phone, which folds it to one to save memory, and a sound with `"stereo": true` keeps both as well. After that `gain` is how loud it is against the others.

| Field | What it does |
|---|---|
| `file` | The file, or a list of takes |
| `gain` | How loud against the others. 1 is as it comes |
| `bus` | `effects` or `ambience`. It's `effects` if it isn't given |
| `reach` | How many metres away it can be heard, for anything played at a place |
| `spread` | How far its pitch wanders from one play to the next |
| `rate` | How fast its file plays, 1 if it isn't given: 1.4 is higher and shorter, 0.8 lower and longer. `spread` wanders around it, and it does nothing for a loop |
| `max` | How many can play at once |
| `gap` | The fewest seconds between one and the next |
| `stereo` | Keeps both channels |
| `loop` | Says it's a loop, for a new sound that has no worked-out one |
| `notes` | Blows it as notes, so many seconds each, the way a train blows for a crossing. Each one holds `held` |
| `held` | The steady stretch of the take, `[from, to]` in seconds, that each note holds. A note that's longer goes round it, and `src/sound.test.js` checks none is |
| `rest` | The seconds between notes |
| `echo` | How many seconds behind each note its echo comes back. A take's own echo is at its end, past what's held, so this stands in for it |

Two sounds can share files and still be told apart, with `rate`. `groan.reach` is `groan.hunt`'s four takes at 1.4, so it comes out higher and shorter, once as their hands go up, when he can't see them for his hood. Each line loads its own copy of its files, so those four are asked for twice and held decoded twice, about 1 MB more.

`defaults` fills in what a line leaves out. A phone plays 12 sounds at once and anything else 20.

## The score

`music` has an entry for each part of the game. Give one a `file`, and it plays that rather than the drone:

```json
"town": { "bed": 0.45, "air": 0.4, "guitar": 0.7, "file": ["audio/music/town.1.mp3", "audio/music/town.2.mp3"], "next": ["chase"] },
```

| Field | What it does |
|---|---|
| `file` | A track, or a list that's played in turn. Parts that name the same file share it, and it runs straight on from one to the next |
| `gain` | How loud this part plays it. 1 is as it comes |
| `once` | Plays it through once, rather than coming round again |
| `next` | Parts of the game to fetch ahead of time, so that they come in straight away |
| `quick` | Cuts rather than fades |
| `bed`, `air`, `guitar`, `pulse`, `bpm`, `wobble` | The drone that plays if there's no file, or until it's come |

Tracks don't have to be made to loop. The silence comes off both ends, and each one fades into itself or the next over 5 seconds as it comes round. A full second of quiet in a track's last 15 seconds counts as its end, because a generated track can fade out and then have noise after it. They're levelled as they load, so they come out at about the same loudness as each other, and `levels.music` sets them all. Only the track that's wanted comes down. A long track takes a lot of memory once it's decoded, about 57 MB for two and a half minutes, so a phone keeps the last two and anything else the last four. Keep them to a couple of minutes.

## Voice lines

Nobody has written any lines for him, and nobody here will. `voice` is empty until there's a recording. When there is, this is all a line takes:

```json
"voice": {
  "bank": { "file": "audio/voice/bank.mp3", "text": "The words, for the subtitle" }
}
```

The music and everything else dip under it, the words come up, and it plays once. If one's still going, the next waits its turn. The game asks for these by name, and a name with no recording is nothing at all:

`hang`, `cut`, `river`, `bank`, `run`, `bitten`, `wake`, `town`, `failed`, `beans`, `grabbed`, `crowd`, `drive`, `wrecked`, `end`

## Somebody's own clip

A recording that's somebody's own is on no sheet and in no manifest. It's played by its file with `clip(file, { x, z, reach })`, the way the cemetery plays the owner's song from `audio/music/stone.mp3` when he pulls up and when the stone's read (`data/stone.md`). The file can be anything Chrome plays.

- It's asked for the first time it's wanted, and only then. If it isn't there, nothing plays and nothing's said, then or after. The browser notes the one request that wasn't found, the way it does for any file, and the checks don't count that as an error.
- It plays once, as loud as a voice line and turned down with the effects. From x and z, it's quieter as he walks off, out to `reach`, 30 m unless it's asked otherwise, and to one side. Without them it's from nowhere: as loud wherever he is, in the middle, which is how the owner's song plays.
- `fadeClip(file, much)` says how much of it's to be heard, from 1 for all of it down to 0, which stops it, or stops it starting if it hasn't come in yet. The page fades the song away by it.
- The music, the night noise and the effects, which have the crowd in them, dip under it the way they do under a voice line, by as much of it as there is, so they come back up as it fades and after it's done.
- It goes straight to the master, so the mute has it and nothing it dips does.
- Wanted again while it's going, it carries on, and it's never started over or twice. Once it's done, it plays again the next time it's wanted, all of it.

`state()` has each bus as it is, `levels`, and where it's headed, `aim`. Chrome only works out a bus while something's playing through it, so one with nothing on it keeps the last it had, and the checks look at `aim` for what's dipped.

## Making them with ElevenLabs on fal

`tools/sound_prompts.json` describes every track and every sound. `tools/make-sound.mjs` sends it to ElevenLabs' models on fal, saves the files in `audio/music/` and `audio/sfx/`, writes their lines into `data/sound-new.json`, and records what was made in `audio/manifest.json`. Add a sound there and run it again.

`data/sound-new.json` started as a copy of `data/sound.json`, and nothing ever writes back, so the worked-out sounds and their board stay exactly as they were.

All of it's been made: 11 tracks and 124 takes of the 75 sounds, 21 MB to download. It costs more to hold than the worked-out sounds do. Those come to about 17 MB once worked out. The files come to about 59 MB decoded at a phone's 48 kHz, with the silence off their ends and its loops folded to one channel, and up to another 92 MB for the two longest tracks a phone keeps. Elsewhere, where a loop keeps both channels, the sounds come to about 80 MB. Nobody has tried that on a real phone yet.

It needs a fal key. Run this in a real terminal, because it has to wait for you to type. It keeps the key in `~/.config/chunky/fal-key`, readable only by you, and out of the shell history, the repo and every other program's environment. `FAL_KEY` wins over that file if it's set:

```sh
bash tools/set-fal-key.sh
```

Then:

```sh
npm run sound:make                                 # what it would make, and what that comes to. Spends nothing
npm run sound:make -- --go                         # makes whatever hasn't been made yet
npm run sound:make -- --go --only town,step.road   # just those, if they haven't been
npm run sound:make -- --go --only town --again     # those again, over what's there
npm run sound:make -- --go --only step.wood.2 --again  # one take of one sound
npm run sound:make -- --go --budget 30             # the limit, in dollars, for all that's ever been spent. It's 20
```

It won't start if the run could take what's been spent over the budget, and stopping halfway loses nothing. `audio/manifest.json` keeps the running total under `spent`, and making a file over another doesn't take anything off it. On 2026-11-01 fal's pricing API said $0.60 a minute for music and $0.002 a second for sounds, and its music page said $0.80. Nothing settles whether music is rounded up to the whole minute, so the budget's held against that.

A track or a sound that's wrong is a matter of changing its prompt and running it with `--only` and `--again`. After a run, `npm run sound:measure` fails on a file that's silent or hardly there, clipped, cut short, a track that fades out and then has more on the end, a loop with a click where it comes round or that swells partway, or a footstep or a blow that lands late or more than once. `-- --pictures dir` draws a spectrogram of each. In the prompt sheet, `quiet` says a sound is meant to be, and `uneven` that a loop's level is meant to move, as a fire's does. `npm run sound:level` then sets the gains in `data/sound-new.json` to match the old sheet's, sound by sound and part by part of the score, by a weighted loudness, so that going from one to the other is about the sound. A part's gain can be well over 1, because the sheet keeps the old `levels` so that the drone standing in for a track is no louder on it. The gains there are its, so run it again after making anything over. `npm run sound` and the boards are how to check the rest. Nothing here can hear, so somebody has to listen.

### The rights

This is what was on record on 2026-11-01. It isn't legal advice, and it's the owner's call.

- [fal's ElevenLabs page](https://fal.ai/elevenlabs) says content made through its API can be used in commercial projects, and sends you to [fal's terms](https://fal.ai/terms). Those say models hosted for other companies may come with those companies' terms on top, and that use of what comes out is at your own risk.
- [ElevenLabs' music terms](https://elevenlabs.io/eleven-music-model-specific-terms) leave studio games out of the rights on most of its plans, but not indie games: under $500,000 since first release, from a developer under $1,000,000 in its last fiscal year. Nothing says how those apply through fal.
- fal's terms also say its API mustn't be open to the players directly. It isn't. The files are made once, on a developer's machine, and the key is never in the game.

Check all of this again before the game's sold, or if it outgrows those figures. No prompt names an artist or a song. The sound of the game's own bridge videos has no licence, and it stays out, as `docs/art-direction.md` says.

## The night, car alarms and the train

The owner found the night noise, the train and the car alarm too much (CHUNKY-137), so:
- The night is crickets, one here and one there. `cricket.a`, `.b` and `.c` are three of them, a field cricket, a tree cricket and a slower one further off, each a 6 s take of one cricket with silence between its chirps. The game puts two at most on spots of their own in the grass, 10 to 45 m off, each singing its takes over and over for 5 to 20 s, a little higher or lower and quicker or slower than the next, and another starts up somewhere else after a wait that's mostly short and now and then long, 8 s on average. Over twenty minutes of it there was none a fifth of the time, for 7 s on average and half a minute at the longest, and two at once a third of it. They're on the night noise, and well under everything: one 10 m off is 20 dB under his footsteps, and one 30 m off 31 dB under, about as loud as a frog 20 m off. They're quiet in the fever. Near water there are frogs as well.
- The night never takes the last four sounds that can play at once, so the frogs and crickets can't keep a horn or a crash from being heard. A cricket's call there's no room for is tried again half a second later, rather than missed.
- A take that sounds like static is the wrong one, so each cricket's was measured: at least 82% of what's in it is on its own pitch, against 65% for the old loop, and a fifth of it or more is gaps 40 dB down or more. A katydid was tried first and taken out, at 70%.
- `amb.crickets` and `amb.wind` are off, at a gain of 0, and a loop at 0 never starts. They were the static under everything. The old sheet has its own crickets, and `#old` still plays them.
- `vehicle.alarm` is a car alarm going round its tones: whoops, a blare and a fast warble, 20 s of it. One goes for half a minute (`ALARM.seconds` in `src/lures.js`) with its lights going on and off, and it's fainter the further off he is and gone past `ALARM.heard`, 160 m. It's only noise for its first 5 seconds (`ALARM.rouses`), so it rouses the burnt-down ones near enough to hear it go off, as CHUNKY-136 says, and draws nobody.
- `train.horn` is blown as notes: long, long, short, long, out of the steady first 2.2 s of its take, with an echo after each. It carries 1.2 km, so it's loud close by, faint from a kilometre off and gone past that. `train.blast` carries 500 m. Both are at 0.5. When they're blown is in `data/railroad.md`.

These are all new, so `npm run sound:level` has nothing to level them against and leaves them be, but it would bring `amb.crickets` back up. Turn it back down after.

## The player's own levels

The button beside the mute opens two sliders, for the effects and the night noise, from nothing up to what the sheet says. They go on top of `levels`, and they're kept in the browser as `chunky.levels`, the way the mute's kept as `chunky.mute`.

## On a phone

- Nothing makes a sound or comes down until the first touch, because browsers won't allow it.
- An iPhone keeps web audio quiet with its silent switch on unless the page says it's playing something. `navigator.audioSession.type = 'playback'` says so, and on older ones a looping silent `<audio>` does it.
- When the tab's hidden or the phone's locked, it all stops. It carries on when it's back, and every touch tries again, because an iPhone can leave it stopped after a call.
- If anything in the sound goes wrong, it says so in the console once and the game carries on without it.

## What hasn't been checked

`npm run sound` proves what's playing and that something's coming out, in Chrome, with the real files on a phone-sized page too. It can't say whether it sounds good. Nothing here can hear, so the generated sounds have only been measured and looked at as spectrograms, and whether each matches its prompt is for someone with ears. How an iPhone's silent switch and lock screen behave, and whether one copes with the memory above, can only be found out on an iPhone. Check that before anyone else is told to play it on one.
