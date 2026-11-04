# Their own words

When he goes back to Coop, Rocky or Miss Bobby, they can say something new instead of the line they said last time. The game asks a cheap model for it through the talk server, which holds the owner's OpenRouter key and the month's cap of $20 (`server/talk.js`, the Platform Engineer's). This is CHUNKY-107, and the creative bible's section 15 is where it comes from.

The game's side is `src/talk.js`, which has no three.js or page in it, so the node tests load it too. What it sends, what it holds every line to and the 988 Lifeline's words are `data/talk.json`. The conversation box is under "dialogue" in `index.html`. `npm run talk` plays it in Chrome.

Who they are in `data/talk.json` comes from the bible's section 7 and the world from its sections 1 to 3, which are the Creative Director's, and their sample lines are their written ones from `data/cast.json` and the bible. The owner can overrule any of it.

## When they say something new

- **Only the three of them.** `who` is Coop, Rocky and Miss Bobby. Nobody else's words are ever asked for: not Robby's, beyond his one line, and not Toni's or anyone else's who's real.
- **Only instead of a line they've said before, that does nothing.** The first time, it's always the written line, and so is any line that changes something, like Coop paying him or Rocky meeting him. So the story's lines are the written ones, and only a line he's heard already, like "What you need, river boy?", is said in new words.
- **Asked as he comes near.** When he comes within 9 m of one of them, having been 12 m away, what they'd say is asked then, so it's there when he talks to them. If it isn't there yet, the box waits for it with Later. to press, for 3 seconds at most.
- **His answers.** The written answers that lead somewhere always stay, like "I need beans." and "Can I get some beans?". Their three for him fill up the rest, to three in all, and Later. is always last. Coop before the bag run has three of his own written ones, so there's no room for new ones until it's done.
- **Answering them.** His answer is asked about, one ask for each thing said. If nothing new comes back in time, they say a line from `spare` they haven't said lately, or the written line.
- **Typing.** On a laptop there's a box under the buttons. Any key but an answer's number starts him typing, and Enter says it. A phone has the buttons and nothing else.
- **How they feel.** A line can move how much they trust him or are scared of him by a point. More than a point either way in one visit doesn't count. Nothing else a line does is kept. Nothing changes hands, and they're told not to offer to.

## When there's nothing to ask

- Only the game's own pages ask, which are `pages`. They're the ones the talk server answers, the `ORIGINS` in `server/wrangler.jsonc`, and a test checks the two agree. Anywhere else asks nothing, which is everything with `?test` until a test says where, and the work link. `?talk=` points it at a server on this machine, and nowhere else.
- When the server says why it couldn't answer, they're left to their written lines for a while: 5 minutes when it isn't working or has no key, an hour when the month's money is spent, 15 seconds when this phone asked too soon and 30 when it took too long.
- A line the checker turns away is only that line.
- With nothing asked, everything they say and every button is just what it was before any of this.

## What every line is held to

The checker in `src/talk.js` reads what comes back before anything's shown. A line that doesn't pass is the written line instead.

- Under 30 words, and 200 letters.
- Nothing from outside Chunky: no computers or the internet, no presidents, and nobody saying "zombie". That's `outside`.
- Never how anyone quit: `never`.
- Nobody real, by name: `real`.
- No address, phone number or web address: `addresses`. An address is a number and a name with capitals, so "Take 80 to Church St" is fine.
- No songs: `lyrics`.
- Nothing past PG-13: `blocked`. Those words are kept as what `tools/talk-words.mjs` makes of them, so that they aren't written out anywhere in the game. The checker takes a word's ending off before it looks, so the list only needs the word itself.
- Nothing that sounds like someone really not okay, the same way as what he types.
- Not something they've said to him, or one of their written lines, or near enough: three words in four the same.

His answers are each 12 words at most and pass the same, and Later. is the game's own. What they keep about him is 16 words at most and passes the same, or it's dropped. A mood that isn't one of `moods` is plain. The game doesn't use the mood yet.

## The 988 Lifeline

What he types is read against `care.when` before anything's sent. If it sounds like he's really not okay, nothing is sent to anyone. Whoever he's talking to steps out of the game and says so, with `care.say`, and the 988 Suicide & Crisis Lifeline is there: call or text 988 on a phone, the chat on 988lifeline.org on either, and 911 if he's in danger. The only button is Back to the game.

The model's told to answer `{"care": true}` when he sounds that way, and the same comes up then, for what he typed only. So it comes up when the model hears what the game didn't, and when the model misses what the game heard.

The words are the Lead's, written to be plain and kind, and the Creative Director and the owner can change them here.

## What they remember

It's kept in `localStorage` under `chunky.talk.v1`, for each of them:

- `notes`: what they've kept about him, the newest 12. Each says who it's about, as a hash of this phone's key, which is kept under `chunky.talk.phone` and is also what the server limits one phone by.
- `said`: everything they've said to him, written or new, the last 24.
- `visits`: how many times he's been to talk to them.

With each ask goes the last 10 of what they've said, their notes about him and how many times he's been by, along with what's going on: his beans, what he's carrying, what's happened (`happened`) and the crowd being out (`tonight`). If it's over the server's 6000 letters, what they've said goes first, the oldest first, then their notes, then the start of the visit.

Each note says who it's about so that once the shared town keeps them, they can tell one of him what another did. That isn't built: for now it's all on this phone.

## The model

It's the first in `MODELS` in `server/talk.js` until the side-by-side trial picks one. `node tools/talk-trial.mjs` asks each of them through the talk server for three visits with Coop and three with Miss Bobby, the way the game does, and writes what each said, what the checker turned away, how long each took and what a hundred lines cost to `data/raw/talk-trial.md`. The Creative Director picks the cheapest that sounds like them. It spends the owner's money, so nothing runs it but someone asking to. `--server` points it at the canned server on this machine instead.

An ask is about 4,700 letters, which is about 1,200 tokens, and a line back is under 100. At the prices `server/talk.js` keeps, that's about $0.004 to $0.01 for a hundred lines.

## `data/talk.json`

| Field | Type | What it is |
|---|---|---|
| `version` | number | Part of the save's key. Change it only if old saves can't be read any more. |
| `who` | string[] | Who can say something new, by cast id. |
| `pages` | string[] | The pages that ask the talk server. |
| `world` | string[] | The world, as each of them is told it. |
| `him` | string | Who he is, as they're told it. |
| `opener` | string | What's asked when he walks up. |
| `tonight` | string | What's told them while the crowd's out. |
| `rules` | string[] | How to answer, a line each, and what every line's held to. |
| `people` | object | Each of them, by cast id: `name`; `sheet`, who they are; `place`, where they are; `voice`, how they talk; `samples`, their lines, for how they sound; and `spare`, the lines they can say any time. |
| `happened` | object | What's told them about what's happened: `flags` and `items`, each a sentence by the flag or the item. |
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

`state().dialog` has `heard`, what he said that they're answering, and `care`, `typing` and `waiting`.
