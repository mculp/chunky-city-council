# Lore

What the owner has said about Chunky, in their words. It's the story's source, and it goes in here as soon as it's sent, built or not. Don't add to it. How a piece shows up in the game is decided around it and written under it, and the owner can overrule any of that.

Real places are by structure id, never an address. Most of these are someone's home.

## Who everyone is

> npcs should not be rektguys. I may put an nft gate on this and allow people to play as their own rektguys or other PFP. npcs should be radiating zombies of varying degrees

**In the game:** everyone but the player is one, and nobody else wears a hood. `docs/art-direction.md` says what that looks like. Decided around it:

- "Radiating" is read as radium green: cracks that spread from the breastbone, clothes burning through to char, eyes that go from pinpricks to full sockets, and chalk strokes coming off them. The green is a guess, and so is the rest of how it looks.
- "Varying degrees" is one number for each of them, from nearly a person to not much but char and light. Most are in the middle.
- How far gone they are only changes how they look, for now. It doesn't change what they do.
- Coop, Tre and Miss Odessa are the least far gone, because they still talk. Nothing's been written about what that means for them.
- What they're wearing is invented, as ordinary clothes for around here.
- The gate isn't built, since that's a "may". The hero's the only thing wearing a hood now, so when it comes, only his look has to change.

## Charlie Flake

> Charlie Flake: A local resident known for catching a record 56-pound catfish from the Chunky River in 1924

**In the game:** a marker on the left as you come off the Griffis Fountain bridge, across the road from the town sign, on the bank of the river he caught it in. It says his name and then the owner's sentence, word for word, and it has a catfish on top, 1.2 m long, which is about what 56 pounds comes to. One of the church signs brags about him too. Decided around it: where it stands, and that there's a marker at all. Nothing here says what sort of man he was, because nobody's said.

## Robby

> One time at the first house on the right after coming off the bridge (in town), a guy named Robby said these words, which is the only time in history this set of words was arranged: "hey man, help me get these flies out of here so we can cook some deer meat". Could probably be a quest.

> I think the house burned down so it could just be a memorial ghost in that spot (he didn't die, he moved back to Louisiana)

> I found out Robby moved to California not Louisiana.

**In the game:** his lot is the first thing on the right coming north off the Griffis Fountain bridge, on the big mown lawn in front of structure 74582285, which is left as it is. What's there is brick piers with the charred joists off them, a chimney, a stove and the front steps going up to nothing, with a memorial out front saying IN MEMORY OF ROBBY / HE DIDN'T DIE / HE MOVED / TO CALIFORNIA. He stands where the front room's floor used to be, as a ghost, in a cloud of flies. Decided around it:

- "The bridge" is read as the Griffis Fountain bridge, because that's where you wake and how you first come into town. If it's the US 80 bridge, the first house on the right heading west is structure 75204065.
- He says the line once, ever, and that's saved. After that he says "...", and so does the only reply, because nobody's written anything for the hero to say back.
- The quest is a guess at "could probably be a quest", and it's small enough to take out. Swinging at the flies before he's asked just scatters them. After he's asked, four swings clear them, a fire lights in the hearth with deer meat on it, and eating it fills your hearts.
- What he looks like is invented: `pale-ghost` in `data/looks.json`, a pale man in a T-shirt, going in and out like static. He's built like everyone else, but with nothing burning in him, because he didn't die. It's nothing of the hero's.

## The church signs

> The church signs should all be changed daily and have ridiculous puns or veiled threats about going to hell on them, commonly misspelled or with broken grammar

They sent three photos of real signs for how they look. The photos stay out of the repo.

**In the game:** every church has one, and they change at midnight in Mississippi. `data/signs.json` is everything they say, and `#signs` shows it all on one page. Decided around it:

- The words are written fresh, not taken from the photos. One of the photos is a pun on a real brand.
- They go by the churches' real names, as it says below. They had invented ones until then, because the signs carry veiled threats and these are real congregations. The names are what the map calls them.
- It goes by the real calendar, since the game has no days of its own yet, so that everyone sees the same sign on the same day. Every fifth day they argue with each other. That part wasn't asked for.
- A few lines nod at the crowd without saying what they are. `REVIVAL TONIGHT / NOT THAT KIND` is the closest it comes.
- Nobody's said who changes them. `DO NOT ASK WHO / CHANGES THE SIGN` is as far as it goes.

Asked about the names and the days they argue, and about Robby's lot:

> sure, fk it, use the real names. arguing days sounds hilarious. yes it's close enough for robby and it was pretty funny.

## Jason and Jesse

> This is the greatest lore find in chunky history. The video shows the mother, Dana Maxwell, of one of my two best friends growing up giving an interview for travel channel. Jason Maxwell and Jesse savell died a few years later.

> The map and house is where the maxwells house is and that's why we need more small roads

The clip is someone else's footage, so it stays out of the repo. What it says, briefly: in 2005 Jason and his best friend Jesse were out on the back roads and stopped at Stuckey's Bridge, which was closed by then. They saw a light out there, swinging. It came along the bridge, went through Jesse and through Jason and on out the other way, still swinging, and they never heard a thing. They called home. Dana didn't believe it until she saw Jason, white and shaking. Within five years both of them had died, suddenly.

**In the game:** two things. There's a road to the house. The house isn't marked, and which one it is isn't written down here, because it's someone's home.

And there's the light. When he comes back to Stuckey's Bridge after the first chapter it's out at the far end, swinging. It comes along at a walk, goes through him and carries on out the other way, and it does nothing to him. The music, the night and his own feet all stop while it's close, and come back after. `src/light.js` has what it does. Decided around it:

- It's cold and pale, which is how the clip's reconstruction has it, and so it can't be taken for the warm lantern that guides him out of the river in the opening.
- It only comes after the first chapter, so that the opening stays as it was.
- It comes when he's about 60 m from the bridge. If he stays put it gets him, and if he gets 140 m away it gives up. It comes again after he's been 300 m away.
- There are no words. Nothing on the screen, the map or a sign says what it is or who saw it, and their names aren't anywhere in the game. Whether they should be is the owner's to say.
- It has no sound of its own, because they never heard a thing.

### Their people and their places

Word for word, with the street addresses taken out, as everywhere in this file, and one line of a song, which isn't reproduced here. They sent a picture of the compound from above, for which building's which. It stays out of the repo.

> [the address] is their compound. dana, husband, jason's two younger brothers, their kids and spouses (see screenshot)
>
> we used to play 6 on 6 volleyball in the yard
>
> jason really liked the st louis cardinals, maybe some volleyball side quest and cardinals gear available here. he drove an old t-top 90s white camaro so that'd be a cool vehicle to put out there. don't really have to mention by name. he was buried at cemetery at [the address] and has some of the lyrics to "nerdy" by poison the well *imprinted* on his tombstone. [the line of the song] ... some fun facts if anyone stumbles upon
>
> jesse died younger at 18 i think, he lived in the first row of trailers nearest the ballfield, second from the left. there is also a community pool directly west of the trailer park. it'd be funny if you could go in his trailer and see an old computer with CRT monitor with AIM on the screen. he was always on AIM

**In the game:** the compound's there, shaped from the public aerial, with the real track in. Nothing in the game says whose it is, and where it is isn't written next to their names here. Decided around it:

- The net stands in the yard where the picture shows the grass worn, which is a guess. There's a ball and nobody on the other side of the net. The stick gets him under it, a ring shows where it's coming down, and the button bumps it up again, each one coming down a bit further off.
- Six in a row is the side quest, because they played six on six. It takes the bat.
- The gear's red with a plain bird on it and no name, so that it isn't anybody's logo: a pennant and a jersey on the wall of the little shed, a cap, a bat with red tape on the grip, a bigger pennant on the big building where it can be seen from the net, and somebody's cap on a post of the net. He doesn't wear any of it, because how he looks is the owner's own. The sign over the bat is mine.
- The bat reaches a bit further than a hammer, and that's all it does.
- The coupe's white, long and low with a fastback, with the bar left over the seats and the two panels out of the roof, and no make or badge on it. There's only one, it's the one thing in the game that isn't rusting, and it's the fastest thing on the road. His head comes up through the roof.
- The light on a pole isn't on the picture. It's there so that the net can be seen at night, and its light brings the crowd, the same as the gas station's canopy.
- The trampoline's on the picture, and it works.
- The walls can't be seen from above, so their colors are guesses.

**In the game, the trailer:** it's there, second from the left in the row nearest the ball field, white with dark shutters and a stained deck at the door, which is how it looks from the road. Anyone can walk in. Nothing says whose it is. Decided around it:

- The computer's in the back, still on: a tube monitor, a beige tower, speakers, a keyboard and a rack of discs with nothing on their spines. Its glow can be seen on the floor coming down the length of the place, and the button goes right up to the glass.
- The messenger on the screen is invented, because the real one's a trademark. It's called ChunkyNet Messenger, with the orange warning triangle where a logo would go, and it's one line to change.
- Its list says People (0/41), with nobody online and 41 offline, and not one name. The window beside it is an away message, the old default, with its button. The 41 and the time on the clock, 2:47 AM, are mine.
- A bed, a couch, some kitchen and two posters with nothing on them anyone would know. None of that's from anything.

The community pool's there too, directly west of the park, as green as it is from above, with the low grey-roofed building on its east side and the big patch of bare ground north of them.

**In the game, the cemetery:** the road goes all the way up there now, and it's there as it is from the road and from above: the chain-link along the gravel loop, the gate at the far end of it, big bordered slabs where they are from above and rows of low grey stones, old thin ones and a few tall ones, some with flowers. The church is across the road. Decided around it:

- There's nothing written on any of the stones, because they're somebody's. Where any of them stand, beyond the big slabs, is made up.
- One's darker than the rest, off toward the back, and that's the one. Nothing points to it and it isn't on the map. Where the real one stands isn't known, and this isn't meant to be it.
- The line of the song isn't in the game or anywhere else here. Up close it says "Words from a song, imprinted on the stone." `data/stone.json` is the place for the words themselves, if the owner wants to type them in. Nobody else does. Whether they can go in the game is the same question as music.
- Nothing there breaks but the fence.

## The gas station

> it's funny the kid's name is randomly coop - that's jesse's older brother (joe) son's name, about 20 y/o now. he is really good at sports and all the girls like him. my mom used to work at the gas station for years. idk what the name of it is. pretty sure it's shut down 10 years now. so the ice box is probably in disrepair

**In the game:** the ice box is rusted through, with one door hanging open and nothing in it, and the coolers along the back are off. The canopy's light still flickers, because the crowd gathers under it and Coop's still there, whatever the store's done. The store still has no name. Coop stays as he is: that he shares a name with someone real is an accident, and nothing about that person goes in the game.

## A compound

> [the address] ... The Murpheys have a compound here. Two of them will likely play this game and the dad will probably love seeing it because he loves computers and is a nerd and wrote most of the chunky wikipedia page. we need to make sure we get these houses shaped right. my friend and his wife live in a cabin to the north with an outdoor theater and his wife has an art studio. to the south is the mom and dad's really big, nice house with a swimming pool. and the shed nearest the road is where another of the brothers and I and my brother and other people used to get together and jam out - drums, guitars, keyboards, amps, all that stuff in there

They sent a picture of this from above too, and it stays out of the repo.

**In the game:** it's there, shaped from the public aerial, and the real drive in with it, which the road data hadn't got. Nothing in the game says whose it is, and where it is isn't written next to the name here. Decided around it:

- Which building's which is read off the picture. The big one with the pool is the mom and dad's, the long one across the gravel from it is the cabin, the white one by the fenced lawn is the art studio, and the lawn is the outdoor theater. The cabin's more to the west of the big house than north of it, so that's waiting on a yes.
- The theater has a screen at the lawn's open end and two rows of lawn chairs, and a projector at the far end runs a film's countdown over and over, because any film would be somebody's. Its light brings the crowd, the same as the gas station's canopy, so they end up standing on the lawn. Breaking the projector ends it.
- The studio has an easel, a bench of paint and canvases against the wall. The paintings are invented, and they aren't of anything.
- The room in the shed has drums, a guitar, a bass, a keyboard, amps, mic stands, a couch and moving blankets on the back wall. The button plays whichever one he's by, one hit at a time, and it's loud enough for the crowd to come. There aren't any songs in it.
- The walls can't be seen from above, so their colors are guesses.
- The digger, the boat, the propane tank and the parked trucks are all on the picture. They aren't anyone's in particular, and the tank goes up if it's broken.

## Who lives here

> I think each npc should be an agent with personality and memory

> We should start filling the town and houses with npc/agents. Other people driving cars. Kids riding 4 wheelers.

> Half of the people in chunky should have Alexander or Clark as their last name.

> Can make up their first name

## Mr Barber

> An old dead millionaire named Mr Barber lived south of the bridge and owned most of the farmland as soon as you go south of the bridge and had a compound about a mile south of the bridge maybe you can find it on satellite.

## The land

> we should look a bit into altitude and hills. there aren't a lot but many are very prominent
