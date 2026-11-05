# Places

`data/places.json` is everywhere the town can send him on a side quest (CHUNKY-163, and the bible's section 20): the river at its public spots, the trestles, the churches, the ball field, the gas station while it's open, and the post office and the town hall. The list is the Creative Director's, who checked each one on the public aerial, and it's kept by them. Code offers places from it and from nowhere else, so nothing in the repo lists places to keep away from. It never holds a house or the cemetery.

## What's in it

| Key | What |
|---|---|
| `shapes` | The shapes a side quest can take: `fishing`; `visit`, going to see somebody; `delivery`; `lost`, finding something lost; and `dare`. |
| `kinds` | What a place can be. |
| `places` | Each place, below. |

Each place has:

| Field | What |
|---|---|
| `id` | What code knows it by. It never changes once a quest has used it. |
| `name` | What it's called when it's put to the cast's model, or on his objective. A model never names a place itself. |
| `kind` | One of `kinds`. |
| `at` | Where it is, `[x, z]` in true metres from town center, +X east and +Z south, as `atTrue` takes them. |
| `shapes` | The shapes it can be sent to for. |
| `open` | Optional: whose hours it keeps. The gas station is only a place while Coop has it open. |

## Where each one stands

- **The river and the creek:** the bank by the bridge, where there's room to stand and fish.
- **The trestles:** the platform halfway over, not the banks. The old trestle out west's `at` is its marker, for a visit, and fishing and the dare there are on the trestle itself.
- **The pond off US 80, out east:** its shore nearest the road. Nothing's built within 150 m of it.
- **The churches:** their front doors. The church by the cemetery isn't on the list.
- **The ball field:** the bleachers behind home plate. Nothing a quest does there goes north of the outfield fence.

## Left off

- The bridge on Griffis Fountain Rd, which is at the farm's edge with a house nearby.
- Every pond within 3 km of town, each of which is somebody's or a treatment basin.
- Stuckey's Bridge and the river along Stuckey Bridge Rd, which is the opening's ground.

More come as they're built: Chunky Shoals (CHUNKY-149), the depot and the jam (CHUNKY-133).
