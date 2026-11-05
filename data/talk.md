# Their own words

When he goes back to Coop, Rocky or Miss Bobby, they can say something new instead of the line they said last time. The game asks a cheap model for it through the talk server, which holds the owner's OpenRouter key and the month's cap of $20 (`server/talk.js`, the Platform Engineer's). This is CHUNKY-107, and the creative bible's section 15 is where it comes from.

The game's side is `src/talk.js`, which has no three.js or page in it, so the node tests load it too. What it sends, what it holds every line to and the 988 Lifeline's words are `data/talk.json`. The conversation box is under "dialogue" in `index.html`. `npm run talk` plays it in Chrome.

Who they are in `data/talk.json` comes from the bible's section 7 and the world from its sections 1 to 3, which are the Creative Director's, and their sample lines are their written ones from `data/cast.json` and the bible, less the ones that asked him for something or paid him, which the Creative Director replaced (CHUNKY-182). The owner can overrule any of it.

## When they say something new

- **Only the three of them.** `who` is Coop, Rocky and Miss Bobby. Nobody else's words are ever asked for: not Robby's, beyond his one line, and not Toni's or anyone else's who's real.
- **Only instead of a line they've said before, that does nothing.** The first time, it's always the written line, and so is any line that changes something, like Coop paying him or Rocky meeting him. So the story's lines are the written ones, and only a line he's heard already, like "What you need, river boy?", is said in new words.
- **Asked as he comes near.** When he comes within 9 m of one of them, having been 12 m away, what they'd say is asked then, so it's there when he talks to them. If it isn't there yet, the box waits for it with Later. to press, for 3 seconds at most.
- **His answers.** The written answers that lead somewhere always stay, like "I need beans." and "Can I get some beans?". Their three for him fill up the rest, to three in all, and Later. is always last. Coop before the bag run has three of his own written ones, so there's no room for new ones until it's done. What they can ask him to do right now is always one of them, below.
- **Only what the game can do** (CHUNKY-182, and the bible's section 15). Each of them is told what they can ask him to do right now, and that it's all they can ask, sell, trade, play, teach or hire anyone for: `asks`, with `none` when there's nothing. Today that's Miss Bobby's steps, while they want sweeping, and while they do, "Sweep the steps." is one of his answers whenever he talks to her, written lines or her own words, in the story and online, and never one that doesn't fit (`data/cast.md`). They're told he can already say yes, so it isn't one of their three. Nothing for anyone else yet: train hopping goes on Rocky's list with CHUNKY-177, and each new thing to do goes on its character's list when it's built, as a phrase in `asks.what` and in `asksOf` in `index.html`. Their sheets say what they're like, a trader and a dealer in what fell off trains, and nothing the game doesn't have goes in as something they offer, which a test reads their sheets, samples and lines for.
- **Answering them.** His answer is asked about, one ask for each thing said. What's asked has the visit so far in it a turn each, his walking up or what he said and then what they said, because some models won't answer anything else. If nothing new comes back in time, they say a line from `spare` they haven't said lately, or the written line.
- **Typing.** On a laptop there's a box under the buttons. Any key but an answer's number starts him typing, and Enter says it. A phone has the buttons and nothing else.
- **How they feel.** A line can move how much they trust him or are scared of him by a point, and each of those moves once a visit at most, whichever way. Nothing else a line does is kept. Nothing changes hands, and they're told not to offer to.

## When there's nothing to ask

- Only the game's own pages ask, which are `pages`. They're the ones the talk server answers, the `ORIGINS` in `server/wrangler.jsonc`, and a test checks the two agree. Anywhere else asks nothing, which is everything with `?test` until a test says where, and the work link. `?talk=` points it at a server on this machine, and nowhere else.
- When the server says why it couldn't answer, they're left to their written lines for a while: 5 minutes when it isn't working or has no key, an hour when the month's money is spent, 15 seconds when this phone asked too soon and 30 when it took too long.
- A line the checker turns away is only that line.
- With nothing asked, everything they say and every button is just what it was before any of this.

## In the town everyone shares

Online (CHUNKY-169, and the bible's section 19), there's nothing of the story to say, so it goes differently.

- **Something new every time.** Whenever the model can, all they say is their own words, the first time too, with his answers and Later.
- **To whoever's come by.** The hero is asked about as the story has him, to the letter. Anyone else is `online.them`: from Chunky, quit a while back and since un-quit, which they've seen enough of lately not to remark on, just a neighbor, by the name they gave, in quotes, and "they" all through. It's said so that their own words don't all open on the same thing about them (CHUNKY-182), and no two of the cast's `first` or `back` open the same way either. Everything in `opener` and `rules` that changes for them is written with `{They}`, `{them}`, `{their}` and the like, and `src/talk.js` puts in his or theirs, the same for what's said about their visits, beans and answers. The name only goes in as a short name in quotes, with anything but letters, figures, spaces, hyphens and apostrophes taken out, so it can't tell the model anything.
- **Nothing from the chapters.** What's happened isn't told them, but for whether that player's swept Miss Bobby's steps today, which is theirs, and they've no written lines from the story to fall back on.
- **When there's nothing new.** With the model off, slow or turned down, it's a line from `online.lines`, each once to each player: `first` on their first visit, `back` on the next, then each of `any` in turn. The hero gets no `first`: Coop's `hero`, or the others' `back`, then their `any`. Each has only Later. after it. Once they've all been said, they don't go round again.
- **The nod.** With none of those left, TALK opens nothing: they look at whoever it is and dip their head once, over 0.6 s. Answering them when nothing new comes in time, what they said last stays up with only Later. while they nod. TALK stays, so pressing it again gets another nod.
- **The 988 Lifeline** is the same as anywhere.
- **What they remember** of each player is the town's, under "What they remember", and goes with them if the town lets them go, which is once a thousand others have been by since. A town that doesn't say what they remember, as one from before this doesn't, leaves it on the phone as it was.
- **How they feel** about each player is the town's, kept with what they remember of them, and moved the way the story moves its meters (`moveMeter` in `src/people.js`). A line moves trust or fear by a point, each once a visit at most, within the story's ranges, and warming to Coop cools Miss Bobby by half as much, and the other way round. They're told how they feel, rounded, from `online.feel`, in a line after how many times that player's been by, and nothing's said of it while it's neither way. The hero gets it too, for how they feel about him online. In the game on its own nothing's said of it, since there the meters pick the story's lines, and the story's ask is the same to the letter. Who's met them, and how they feel in the story, are the story's, and talking online leaves them as they were.

## What every line is held to

The checker in `src/talk.js` reads what comes back before anything's shown. A line that doesn't pass is the written line instead.

- Under 30 words, and 200 letters.
- Nothing from outside Chunky: no computers or the internet, no presidents, and nobody saying "zombie". That's `outside`.
- Never how anyone quit: `never`.
- Nobody real, by name: `real`.
- No address, phone number or web address: `addresses`. An address is a number and a name with capitals, or a number of three figures or more and a street in any case, so "Take 80 to Church St" is fine.
- No songs: `lyrics`.
- Nothing past PG-13: `blocked`. Those words are kept as what `tools/talk-words.mjs` makes of them, so that they aren't written out anywhere in the game. The checker takes a word's ending off before it looks, so the list only needs the word itself. A word with stars for some of its letters counts as one, and so does one spelled with figures.
- Nothing that sounds like someone really not okay, the same way as what he types.
- Not something they've said to him, or one of their written lines, or near enough: three words in four the same.

His answers are each 12 words at most and pass the same, as they came and tidied, and Later. is the game's own. What they keep about him is 16 words at most and passes the same, or it's dropped. A mood that isn't one of `moods` is plain. The game doesn't use the mood yet.

## The 988 Lifeline

What he types is read against `care.when` before anything's sent. If it sounds like he's really not okay, nothing is sent to anyone. Whoever he's talking to steps out of the game and says so, with `care.say`, and the 988 Suicide & Crisis Lifeline is there: call or text 988 on a phone, the chat on 988lifeline.org on either, and 911 if he's in danger. The only button is Back to the game.

The model's told to answer `{"care": true}` when he sounds that way, and the same comes up then, for what he typed only. So it comes up when the model hears what the game didn't, and when the model misses what the game heard.

`care.when` leans towards bringing it up. "I don't want to be here" brings it up whatever he meant by it, and "I'm not okay with that" doesn't, since that's haggling.

The words are the Lead's, written to be plain and kind, and the Creative Director and the owner can change them here.

## What they remember

It's kept in `localStorage` under `chunky.talk.v1`, for each of them:

- `notes`: what they've kept about him, the newest 12. Each says who it's about, as a hash of this phone's key, which is kept under `chunky.talk.phone` and is also what the server limits one phone by.
- `said`: everything they've said to him, written or new, the last 24.
- `visits`: how many times he's been to talk to them.

With each ask goes the last 10 of what they've said, their notes about him and how many times he's been by, along with what's going on: his beans, what he's carrying, what's happened (`happened`), the crowd being out (`tonight`) and what they can ask him to do (`asks`). If it's over the server's 6000 letters, what they've said goes first, the oldest first, then their notes, then the start of the visit.

In the town everyone shares (CHUNKY-169) it's the town's instead, with `trust` and `fear` for how they feel about that player once they feel anything. It comes with the welcome, and each change goes to the town as it happens, a line said, a note kept, a visit over or how they feel as it is now, and none of it goes onto the phone, whose own is the game on its own's. The town keeps as much as the phone does and no more, for each player by the hash of their phone's key, beside the town itself: in `data/raw/town.json` on this machine, and as an entry of its own, `mind:<hash>`, on Cloudflare. `docs/multiplayer.md` says why.

Each note says who it's about so that they can one day tell one of them what another did. The town keeps each player's apart, so for now they only know what each did themselves.

Forget everyone, on the title, wipes it with everything else, and keeps only what the phone calls itself.

## The model

It's the first in `MODELS` in `server/talk.js` until the side-by-side trial picks one. `node tools/talk-trial.mjs` asks each of them through the talk server for three visits with Coop and three with Miss Bobby, the way the game does, and writes what each said, what the checker turned away, how long each took and what a hundred lines cost to `data/raw/talk-trial.md`. The Creative Director picks the cheapest that sounds like them. A model OpenRouter turns down goes in the report as turned away, and the rest still get their turn: only a server that won't answer the run's very first ask stops it, since that's the key not being in. It spends the owner's money, so nothing runs it but someone asking to. `--server` points it at the canned server on this machine instead.

An ask is about 4,700 letters, which is about 1,200 tokens, and a line back is under 100. At the prices `server/talk.js` keeps, that's about $0.004 to $0.01 for a hundred lines.

## `data/talk.json`

| Field | Type | What it is |
|---|---|---|
| `version` | number | Part of the save's key. Change it only if old saves can't be read any more. |
| `who` | string[] | Who can say something new, by cast id. |
| `pages` | string[] | The pages that ask the talk server. |
| `world` | string[] | The world, as each of them is told it. |
| `him` | string | Who he is, as they're told it. |
| `opener` | string | What's asked when he walks up, with `{They}` and `{walk}` for whoever it is. |
| `online` | object | The town everyone shares: `them`, who anyone but the hero is, as they're told it, with `{name}` for their name; `feel`, how they feel about whoever it is, as they're told it: `trust`, a line for each of -3 to 3, and `fear`, one for each of 0 to 3, with `""` for nothing said; and `lines`, by cast id, what each says there when there's nothing new: `first`, `back`, `any`, and Coop's `hero`. |
| `tonight` | string | What's told them while the crowd's out. |
| `asks` | object | What they can ask him to do right now, and that it's all they can ask, sell, trade, play, teach or hire anyone for: `none`, what they're told when there's nothing; `some`, what they're told when there is, with `{what}` for it; and `what`, each thing by the name `index.html` asks it by, as they'd ask it. With `{them}` and `{They}` for whoever it is. |
| `rules` | string[] | How to answer, a line each, and what every line's held to, with `{they}`, `{them}`, `{their}`, `{themselves}`, `{have}`, `{are}` and `{say}` for whoever it is. |
| `people` | object | Each of them, by cast id: `name`; `sheet`, who they are; `place`, where they are; `voice`, how they talk; `samples`, their lines, for how they sound; and `spare`, the lines they can say any time. |
| `happened` | object | What's told them about what's happened: `flags` and `items`, each a sentence by the flag or the item, with `{They}` for whoever it is where it's ever said online. |
| `moods` | string[] | The moods a line can have. |
| `outside`, `never`, `addresses`, `lyrics` | string[] | Patterns a line can't have in it. Only `addresses` minds capitals. |
| `real` | string[] | Names a line can't have in it. |
| `blocked` | string[] | What `tools/talk-words.mjs` makes of the words that aren't PG-13. |
| `care` | object | The 988 Lifeline: `when`, the patterns for what he types; `say`, what's said; `lifeline`, `how` and `danger`, what the panel says; `call`, `text` and `chat`, its buttons; `chatUrl`; and `back`, the button back to the game. |

## For tests

With `?test`, nothing is asked until `__game.talk.on(url)` says where. `__game.talk` also has:

- `ready()`: whether it would ask right now.
- `mind(who)`: what they remember of him.
- `early()`: who's been asked about as he came near.
- `visit()`: this visit: who, how many things have been said, how far their feelings have moved and whether they've stepped out of the game.
- `type(text)`: types it into the box and says it.
- `settled()`: a promise that's kept once nothing's being asked.
- `nodding(who)`: how much further over they are in a nod, in radians, or null when they aren't nodding.

`state().dialog` has `heard`, what he said that they're answering, and `care`, `typing` and `waiting`.
