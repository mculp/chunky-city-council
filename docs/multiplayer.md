# Playing together

Step 1 of the bible's "Playing together" (CHUNKY-151): everyone in town sees everyone else, by name and by look, walking, running, driving and swinging, anywhere they are, and on the map. Up to 25 at once.

## Trying it on this machine

```sh
npm run net:server
python3 -m http.server
```

Open http://localhost:8000/?net in two windows and press Play with others in each. From a phone on the same network it's `http://<this machine's address>:8000/?net`, since the town is looked for on the same host as the page. `?net=ws://…` points at a town somewhere else. On the game's own site, which is https, `?net` alone is the town everyone shares on Cloudflare, `TOWN_URL` in `src/net.js`, since a page on https can't open a plain ws:// socket.

The owner's link is `#hero=<secret>` on the end of the address, for a town started with `CHUNKY_HERO` set to the secret's sha256 in hex:

```sh
CHUNKY_HERO=$(printf '%s' "$SECRET" | shasum -a 256 | cut -d' ' -f1) npm run net:server
```

The phone keeps the secret once the link's been opened, for the town it came with and no other, and it comes off the address straight away so it isn't passed on.

The town as it's hosted for everyone runs on this machine in Cloudflare's own runtime too, without signing in to anything:

```sh
npx wrangler@4.154.0 dev --config server/wrangler.jsonc --port 8788 --var CHUNKY_HERO:<the sha256>
```

and it's `?net=ws://localhost:8788/town`. `npm run town:host` checks it there.

## What happens

- **Joining.** A name of up to 16 letters, checked for PG-13 on the phone and again by the town, and one of the town's eight crowd looks, picked or rolled from the name.
- **The first time.** They watch the opening with the rope cut for them. It ends at the splash, fades, and they come to on the bank beside the Chunky River Bridge on Griffis Fountain Rd, where he wakes, each a few metres from the others. Tadpole comes with CHUNKY-112. Their one objective is "Follow Griffis Fountain Rd into town", and once they're in town there's none: the chapters are the hero's, and sharing his objective waits for CHUNKY-155. Their beans are a count, "Beans 5", without the hero's twelve. "Swim to the bank." still shows for anyone in the water in town.
- **Coming back.** The town keeps their name, look, where they were, their beans, pockets and gas, by the hash of a key their phone makes and keeps for that town. They come straight back to where they left, without the opening.
- **The owner.** The hero is the owner's alone, and only one phone at a time can be him: a second one takes over, and the first is told. The first time, the owner starts where he wakes.
- **Everyone else.** Everyone else is a townsperson in their look, on their own screen too, standing all the way up and not glowing. Their names float over them within 40 m, and they're blue dots on both maps, with their names in blue on the big one, where the cast are cyan. The hero's dot is the orange of his own arrow. On the big map, names take turns for room: the hero's, then everyone else playing, then the cast, then places and streets. A name further down goes to the other side of its dot, or is left out if there's no room there either, and every dot shows. WAVE is a button on a phone, where SHAMBLE is in a game on your own, and V on a keyboard.
- **Vehicles.** A vehicle is known by its place in the game's list, so it's the same one on every phone. Someone driving it is seen in it, and it's left exactly where they get out, for everyone. Nobody can get in one someone else is in: its handle rattles, and he can see who's in it.
- **Nobody hurts anybody.** A swing goes through people. A vehicle someone else is driving nudges you out of its way on your own phone, without harm.

## What isn't shared yet

- The crowd in the street stays out until step 3, and so do drivers, kids on four-wheelers and trains. People at home and the cast are each phone's own.
- Wrecks stay on each phone until step 2.
- How much is wrecked or burnt, what people remember and the church's pantry are all still kept per browser, as they are on your own.

## Where it is

- `src/net.js`: what goes over the wire, and how someone's steps are smoothed. Poses are 18 bytes, twenty times a second each way, and everything else goes as JSON words. Each phone sends about 400 bytes a second, and gets about 400 a second for each other person in town, so 25 in town is under 10 KB a second down.
- `src/names.js`: the PG-13 check.
- `server/town.js`, `server/host.js` and `server/index.js`: the town, the town behind any socket, and a Node server for it on this machine.
- `server/worker.js`: the town hosted for everyone, as the Durable Object `Town`, beside the characters' words.
- `src/together.js`: the phone's side. It covers the panel, the opening and coming back, everyone's bodies (the crowd's own, in six draw calls however many there are), the hero as others see him, names over heads, map dots, vehicles and WAVE.
- `index.html`: six lines hang on `net`, which is null in a game on its own, so the opening is the same to the byte (`npm run frames`).
- `npm run net`: the check, and `npm run town:host` the hosted town's.

## Calls made along the way

- **Where the town is.** One town for everyone, the Durable Object `Town` in `server/worker.js` on Cloudflare, beside the talk server. It's made in the eastern US the first time anyone comes, which is the nearest to Mississippi. It beats twenty times a second while anyone's in it, is kept every 5 s and once the last one goes, and then rests. Until it's deployed and its address is in `src/net.js`, Play with others only shows with `?net`.
- **Keeping the town.** It's written without holding up the snapshots (`allowUnconfirmed`), so a crash loses at most the last 5 s of where people were. Everyone it's ever kept is one value, which Cloudflare holds to 2 MB: several thousand people.
- **Two things Cloudflare's sockets do differently.** Since compatibility date 2026-03-17, a socket taken with `accept()` hands over bytes as a `Blob`, which the town would drop. So the town takes them with `acceptWebSocket`, whose `webSocketMessage` always gets an `ArrayBuffer`. And wrangler dev doesn't answer a phone's close, whatever the compatibility date says, so the town answers it itself. A phone waits for that before it's closed.
- **What it costs.** Cloudflare bills 20 incoming WebSocket messages as one request. Twenty-five people for two hours is about 180,000, which is past the free plan's 100,000 a day, so playing for real is the $5 a month plan. The free plan does for building and a few testers. Whether the free plan's 100,000 counts messages 20 to one too, Cloudflare doesn't say.
- **Staying connected.** A phone that says nothing for 5 s is let go. Through the opening a newcomer has nowhere to be yet, so their phone says what it carries every 2 s instead. A dropped line tries again by itself, and a newer phone with the same key, or the hero's link, takes over.
- **Different versions of the game.** Each phone sends a fingerprint of the parked vehicles. A town only mixes games whose vehicles are the same, since that's what the list's places mean.
- **Parking exactly.** Getting out sends one last pose from the vehicle at once, so the town leaves it exactly where they did. Another phone ignores that rider's older poses from in it, even though smoothing puts those a little way back down the road.
- **Getting in and out isn't smoothed.** Everyone's shown a tenth of a second behind, and what they're in and how they are go with where they're shown, from the same pose. Getting in or out is a jump: they're just there. Before, what they were in came from the newest pose, so a pickup jumped to where its driver had been standing on everyone else's phone for a tenth of a second.
- **Who a phone is, per town.** A phone's key, which is its place in a town, and the hero's link are each kept for the town they came with, by the `?net` on the address, and never go to another. Otherwise a link to someone else's town would hand over both. The name and look go anywhere.
- **Sitting in anything.** The crowd only drives cars, pickups and four-wheelers, so `SEATED` in `index.html` only has those. In anything else, someone sits as the hero does, going by the car: as much lower as his seat is, and as much smaller as he is there. The pickup's numbers come out of the car's the same way, and it's what keeps a head under a Camaro's roof.
- **Everyone else's colour on the map.** Blue, `#5b8cff`, measured against everything else drawn there in CIEDE2000, for usual eyes and for each kind of colour blindness. For every eye it's at least 15 from the cast's cyan, the hero's orange, the red of where to go and the cream of the roads, cars and street names, and it's 6.3 to 1 against the page. White was the first thought, but it's 11 from the cream, so a player's name would read as a street's.
- **The big map keeps everyone moving.** The game stops while it's open, as it always has, so you stand still while you look. Everyone else playing doesn't: the map's drawn again five times a second while anyone else is in town, with each of them where they are now, so nobody's sent walking to where someone was. The phone carries on talking to the town all the while, on a loop of its own, so nobody's let go for reading the map. When the crowd comes to the shared town, with CHUNKY-153, opening the map can't stop the world for anybody, and that's settled then.
- **The hero as others see him.** He's built from `HERO_BUILD`, beside the hero in `index.html`, with a face of his own, so a change to how he's built shows on everyone else's phones too.
- **No hammer for townsfolk.** A swing is the arm going over and down.
