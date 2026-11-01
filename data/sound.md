# Sound

`data/sound.json` says what every sound and part of the score is and how loud. `src/sound.js` plays it and `src/soundbank.js` works out any sound that has no file, from numbers. Nothing in `src/soundbank.js` is a recording, so all of it is ours.

To hear everything, one button each, open the game at `#sounds`. A button with a light border is playing a file.

## Swapping a sound

Put the file in `audio/` and add it to that sound's line. That's all, and the code doesn't change:

```json
"rope.snap": { "gain": 0.9, "max": 1, "file": "audio/my-rope-snap.mp3" },
"step.road": { "gain": 0.3, "reach": 16, "file": ["audio/step-1.mp3", "audio/step-2.mp3"] },
```

A list is takes, and one's picked each time. Use mp3, which every phone can play. If the file doesn't load, the sound keeps its own.

Whatever the file's like, it comes out sitting with the rest. Its silence comes off both ends, its peak goes where the worked-out one's was, and it's folded to one channel. A loop keeps every sample and both channels, and so does a sound with `"stereo": true`. After that `gain` is how loud it is against the others.

| Field | What it does |
|---|---|
| `file` | The file, or a list of takes |
| `gain` | How loud, from 0 to 1 |
| `bus` | `effects` or `ambience`. It's `effects` if it isn't given |
| `reach` | How many metres away it can be heard, for anything played at a place |
| `spread` | How far its pitch wanders from one play to the next |
| `max` | How many can play at once |
| `gap` | The fewest seconds between one and the next |
| `stereo` | Keeps both channels |
| `loop` | Says it's a loop, for a new sound that has no worked-out one |

`defaults` fills in what a line leaves out. A phone plays 12 sounds at once and anything else 20.

## The score

`music` has an entry for each part of the game. Give one a `file`, and it plays that rather than the drone:

```json
"town": { "bed": 0.45, "air": 0.4, "guitar": 0.7, "file": ["audio/music/town.1.mp3", "audio/music/town.2.mp3"], "next": ["chase"] },
```

| Field | What it does |
|---|---|
| `file` | A track, or a list that's played in turn. Parts that name the same file share it, and it runs straight on from one to the next |
| `gain` | How loud this part plays it, from 0 to 1 |
| `once` | Plays it through once, rather than coming round again |
| `next` | Parts of the game to fetch ahead of time, so that they come in straight away |
| `quick` | Cuts rather than fades |
| `bed`, `air`, `guitar`, `pulse`, `bpm`, `wobble` | The drone that plays if there's no file, or until it's come |

Tracks don't have to be made to loop. The silence comes off both ends, and each one fades into itself or the next over 5 seconds as it comes round. They're levelled as they load, so they come out at about the same loudness as each other, and `levels.music` sets them all. Only the track that's wanted comes down. A long track takes a lot of memory once it's decoded, about 57 MB for two and a half minutes, so a phone keeps the last two and anything else the last four. Keep them to a couple of minutes.

## Voice lines

Nobody has written any lines for him, and nobody here will. `voice` is empty until there's a recording. When there is, this is all a line takes:

```json
"voice": {
  "bank": { "file": "audio/voice/bank.mp3", "text": "The words, for the subtitle" }
}
```

The music and everything else dip under it, the words come up, and it plays once. If one's still going, the next waits its turn. The game asks for these by name, and a name with no recording is nothing at all:

`hang`, `cut`, `river`, `bank`, `run`, `bitten`, `wake`, `town`, `failed`, `beans`, `grabbed`, `crowd`, `drive`, `wrecked`, `end`

## Making them with ElevenLabs on fal

`tools/sound_prompts.json` describes every track and every sound. `tools/make-sound.mjs` sends it to ElevenLabs' models on fal, saves the files in `audio/music/` and `audio/sfx/`, writes their lines into `data/sound.json`, and records what was made in `audio/manifest.json`. Add a sound there and run it again.

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
npm run sound:make -- --go --budget 30             # the limit, in dollars. It's 20
```

It won't start if the whole run could go over the budget, and stopping halfway loses nothing. On 2026-11-01 fal charged $0.80 a minute for music and $0.002 a second for sounds. Its pages don't settle whether music is rounded up to the whole minute, so the budget's held against that.

A track or a sound that's wrong is a matter of changing its prompt and running it with `--only` and `--again`. After a run, `npm run sound:measure` fails on a file that's silent, clipped, cut short or has a click where it loops, and `-- --pictures dir` draws a spectrogram of each. `npm run sound` and the board at `#sounds` are how to check the rest. Nothing here can hear, so somebody has to listen.

### The rights

This is what was on record on 2026-11-01. It isn't legal advice, and it's the owner's call.

- [fal's ElevenLabs page](https://fal.ai/elevenlabs) says content made through its API can be used in commercial projects, and sends you to [fal's terms](https://fal.ai/terms). Those say models hosted for other companies may come with those companies' terms on top, and that use of what comes out is at your own risk.
- [ElevenLabs' music terms](https://elevenlabs.io/eleven-music-model-specific-terms) leave studio games out of the rights on most of its plans, but not indie games: under $500,000 since first release, from a developer under $1,000,000 in its last fiscal year. Nothing says how those apply through fal.
- fal's terms also say its API mustn't be open to the players directly. It isn't. The files are made once, on a developer's machine, and the key is never in the game.

Check all of this again before the game's sold, or if it outgrows those figures. No prompt names an artist or a song. The sound of the game's own bridge videos has no licence, and it stays out, as `docs/art-direction.md` says.

## On a phone

- Nothing makes a sound or comes down until the first touch, because browsers won't allow it.
- An iPhone keeps web audio quiet with its silent switch on unless the page says it's playing something. `navigator.audioSession.type = 'playback'` says so, and on older ones a looping silent `<audio>` does it.
- When the tab's hidden or the phone's locked, it all stops. It carries on when it's back, and every touch tries again, because an iPhone can leave it stopped after a call.
- If anything in the sound goes wrong, it says so in the console once and the game carries on without it.

## What hasn't been checked

`npm run sound` proves what's playing and that something's coming out, in Chrome. It can't say whether it sounds good. How an iPhone's silent switch and lock screen behave can only be found out on an iPhone.
