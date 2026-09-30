# The world map

The three stretches, the highway, the wood and the river, the volcano, and what every outdoor place shares. Moved out of CLAUDE.md so it is read when the work needs it rather than in every session.

## The three stretches

The world map is the town it began as with a stretch added either side, and
it is laid out that way rather than renumbered:

| Stretch        | Columns | What is in it                                                      |
| -------------- | ------- | ------------------------------------------------------------------ |
| The shops      | 58      | Meadow, then four stores along the two roads; the wood above them  |
| The town       | 62      | Everything there was: the head offices, the plaza, the campus gate |
| The wilderness | 66      | Meadow, the river turning north through it, and the highway        |

**The town moved east; nothing in it was rewritten.** `TOWN_LEFT` in
`lib/world/tenants.ts` is the same trick `TOWN_TOP` already played with rows,
one axis over: the town was laid out from column 0 and the shops went in west
of it, so rather than every coordinate in the town being rewritten by hand,
the town moved east by `WEST_COLUMNS`. It is added in the few places a column
of the town is written down as a number — `CENTRE_X`, from which `EAST_X` and
the dock already follow; the three buildings in the town's own west; the two
roads; the basketball court; and the town's own props, which go through
`townWest()` in `scenery.ts` the way the middle stretch already goes through
`centre()`.

The thing that bites is a coordinate that is **already** a world column:
`centre()` and everything written off `EAST_X` carry the shift already, so
sending one of those through `townWest()` as well moves it east twice. That
is not hypothetical — `COURT` was written in the town's columns and was not
carried over, and the first thing the map's growing west did was stand the
basketball court in the middle of the new shops' park, straddling one of
their avenues. It is the same mistake the court's own hoops were caught by on
the other axis, which is why they sit outside the `town()` block.

**Four more stores, and none of them has a field crew.** Targetts, Masstown,
MacCallum and Happy Harrys, in the two staggered ranks Blockhouse and Chester
already stand in. Each is a store you walk into with its warehouse behind it
and nothing else — `westStore()` in `tenants.ts` is the shape, written once
rather than four times, because a garage added to one of them by hand is a
side door `buildStoreSpec` puts through to a room nobody generated. Two more
avenues join the roads out there (`SHOP_AVENUES`), so no doorstep is more
than a few shops from a way down to the promenade.

**They stand at the town's end of the stretch, not across it.** A shop every
ten columns (`WEST_SHOPS`), with the same four-column gap between each and
the next and between Happy Harrys and Blockhouse, so the row reads as one
street leading into the town. They were a shop every thirteen, spread from
four columns off the west edge, and Targetts was a minute's walk from the
plaza. The map kept its width: the twenty-odd columns they gave up are
meadow (`WEST_PLANTING`, the wilderness's scatter under another name), with
the two promenades running on through it and off the edge. Four columns
rather than Blockhouse and Chester's one because `atTheDoor` stands a tree
beside each shop, and any tighter it is drawn over the next one along — and
the tree line along the town's top edge gives way to that tree, since a shop
in the far rank has its feet on the line's own row.

Their fronts are **one drawing with four sets of colours** — `shop()` in
`scripts/make-world-art.mjs`, varying the walls, the roof, whether there is
an awning and what is stacked outside. Which is also why there is one
`SIGN_Y` for all four in `WorldScene`: the board is at the same height on
every one of them because it is the same line of that function. Four separate
drawings would have drifted apart in the part that is supposed to be the
same, and the sign band is the one that would have hurt, since it is where
the scene letters the name.

**The wilderness is wilderness**, which means nothing has been laid through
it: the two promenades stop at the town's own east edge, and what follows is
sixty-odd columns of meadow and scattered trees, and nothing in it at all.
`lib/world/wilderness.ts` is the whole of it — a thinner scatter than the
wood's, about one cell in six against two in five and more bushes than trees,
so walking east out of the car park reads as leaving the town rather than as
entering another wood.

**And the coast turns away.** The sea used to be one rectangle the whole
width of the map, which was true enough while the map was the town; carried
east it would have run the beach out past the meadow and drowned the foot of
the highway — a road that stops at a beach, with the cars on it having
nowhere to go. `SEA` steps south twice as it runs east and leaves the map
before the road does, so the road runs off the bottom edge the way it runs
off the top one.

## The highway, and the cars on it

Four columns of tarmac running the whole height of the map, four columns in
from the east edge — near enough the far side to be the edge of the world,
with a verge on both sides, because the camera is clamped to the map and a
road drawn against the edge is a road with one shoulder on screen.

It is **its own ground**, not the car park's asphalt: that tile carries a bay
line down its left edge, which is what makes a field of them read as parking
bays and what would put a stripe across both lanes every forty-eight pixels.
What makes this one a road is painted over it — `highway_marks_192x48.png`,
laid a row at a time by `placeHighwayMarks`, the way the basketball court's
lines are laid over its tarmac.

**Nothing crosses the Gold River, so the road never meets it.** The river
turns north out of the wilderness and leaves by the top edge well west of the
tarmac, and that is the whole reason its tail is drawn rather than carried on
east: a road over the water is a bridge, a bridge is a way onto the far bank,
and the far bank is the one part of this world you can see and not reach —
the cabin stands on it and the marked boulder stands in the water off it, and
`wood.test.ts` says in as many words that neither can be walked to.
`wilderness.test.ts` holds the road to never touching `riverBed()`, which is
what would fail the day somebody moves either.

**A car or two, from time to time, and they are the server's.** Which cars
are on the road is decided in `lib/server/traffic.ts`, for the reason the
basketball's flight and the chicken's wandering are: everybody standing on
the map is looking at the same road, and a road each browser invented for
itself would have two people beside each other watching different traffic. At
most three at once, nine to forty-five seconds apart — and only while a
person is on the map. The residents keep the room itself alive, but nobody
needs traffic that nobody is looking at; an arrival is sent the road as it
stands.

**It is published when the road changes, not on every tick**, and that is the
one thing worth knowing about it:

|      | The ball                                                      | The traffic                                                                    |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Sent | Up to twenty a second, while it is moving or changing hands   | When a car sets off, and when one leaves                                       |
| Why  | It is somebody's throw, and nobody can say where it goes next | It is a car on a road: a straight line at a speed both sides have written down |

`drive()` in `lib/world/traffic.ts` is that line, shared by the server and by
`components/game/systems/Highway.ts`, which runs it once a frame against the
browser's own clock. A browser arriving between two of those messages is sent
the road on joining, as it is sent the ball and the field of eggs, or it would
be looking at an empty road with cars on it.

Two smaller decisions. **Drive on the right**, so the northbound lane is the
eastern one — two cars passing on the wrong sides of each other is the one
thing about a road anybody would notice from the far side of a meadow. And
**nothing collides with a car**: you can stand in the road and one goes
through you. That is deliberate rather than unfinished — the alternative is a
lane somebody can be pinned in by scenery they have no way of hearing coming,
at the far edge of a map with nothing on the other side of it. The traffic is
the view, not the hazard, and the wanderer's spots out there are deliberately
short of the tarmac for the same reason.

## The wood, and the Gold River

North of the town, above the buildings, are thirty rows of trees with a
river through them: `lib/world/wood.ts`. The wood runs the map's whole
width, the shops' stretch and the wilderness with it. The Gold River comes
down out of the north-west **of the town**, bends east, runs the town's
whole width and then turns north out of the wilderness and off the top
edge, with a walk along the near bank of it.

**The river is fitted to the town, not to the map.** It is traced off a
drawing and the drawing is already flattened twice over by the fit —
stretched across a map three times as wide, what came out was a band of
water with a kink in it. So `TOWN` in `wood.ts` is `TOWN_LEFT` in columns
and everything measured off the picture carries it: the fit, the walk along
the bank, the two beaches, the cabin's column. Three things follow, and each
is a fact about the map rather than an accident:

- **West of the town there is no river at all.** The limb comes down out of
  the north of the _town_, so the shops' stretch is wood with no water in
  it — which is the honest answer, since the drawing never covered it.
- **East of the town the line is ours**, as it already was east of the drop.
  See the tail below.
- **The pocket on the far bank is closed at both ends now.** It used to run
  off the side of the map; the northward limb shuts it.

**Nothing crosses the water, on purpose.** The river is solid like the sea,
so the north-east of the wood is somewhere to look at rather than somewhere
to go: every trail is on this side of it, and there is no path over there
for nobody to walk on. A crossing, when there is one, is a rectangle in
`DOCKS` read off `riverBed()` — planking over water is already walked at
the ferry dock — plus a couple of rows of trail either side and a hole in
`riverBanks` where it lands.

**And nobody stands in it either, which is a second rule.** Keeping feet
out of the water is not the same as keeping a person out of the river:
everything outdoors is drawn over whatever is behind it, and a character's
position is the middle of their 96px frame, so twenty pixels of them are
drawn _above_ where they stand. Somebody on the first dry tile is therefore
painted across the near bank from the waist up, and somebody walking past a
tile below that still has their head in the water — which is what residents
sent to the water's edge looked like, since nothing collides a resident and
the route planner only ever kept their feet dry.

So `riverBanks()` grows the water's rectangles by the figure that would be
drawn over them — up by what hangs below a position, down by what stands
above it, half a body either side — and `worldSolids` carries them. That
makes it a solid rather than a rule anybody has to remember: the route
planner, the player's own collision and `clearToStand` all get it for
nothing, and `drawnOver` is the one place the figure's size is written
down. `wood.test.ts` asks it of every cell of the wood the planner calls
open. The sea is deliberately left out: its edge is the bottom of the map,
where a character at the water is seen against it from below rather than
standing in it.

**The town moved down; nothing in it was rewritten.** The town was laid out
from row 0 and the wood went in above it, so `WOOD_ROWS` / `TOWN_TOP` in
`lib/world/tenants.ts` is what shifted it — added inside `placeBuilding`,
to the two roads and the shore, the plaza, the car park and the court, and
to the town's props through `town()` in `scenery.ts`, which is the same
trick `centre()` already played with x. So a y in the town's own layout
still reads as it always did and anything laid out in the wood is in world
rows from 0.

The one thing that bites is a coordinate that is **already** a world row:
the court's hoops are read off `COURT`, which carries the shift, so sending
them through `town()` moved them down past the wood twice and put the two
posts a wood's depth south of the court. They sit outside the `town()` block
with a note saying why.

**The wood is thirty rows rather than the twenty-two it began as, and the
river is the reason.** The wood's depth is the whole of the vertical the
river has to bend in, so it is what decides how much of the drawing's shape
survives. Eight rows is as far as that trade is worth taking — the world is
already as deep as it is wide — and it is the difference between a diagonal
band with a squiggle on the end and a river with a shape.

**The river is a line with a width, not a list of rectangles.** `RIVER` is
the centreline in tiles and `riverBed()` rasterises it into one rectangle
per run along a row, so reshaping the river is moving points on a line.
Rectangles would have made it a river nobody can change: move a bend and
every rectangle after it is wrong. It joins `WATER` beside the sea, so it
is solid, drawn and foamed at its banks by exactly what the sea already
went through.

**Anything that has to meet the water is read off the water.** `southBank`
gives the first dry row under the river at a given pair of columns, and
every trail takes its rows from that, as do the wanderer's spots — and the
beaches on the far bank take theirs off `northBank`. A walk meant to follow
the bank and written as a row number leaves the bank — or ends up in the water — the next time a bend
moves, and there is nothing in the map's own drawing to say which.

**The walk along the bank follows it down.** The river falls some nine rows
between the elbow and the east edge, so a bank walk written as one row
touches the water at one end and is out in the trees at the other — which
is what it was, and why it needed a spur out to the water beside it. It is
built column by column off `southBank` now, a row back from the water and
two rows deep, with the columns at the same height gathered into a dozen
rectangles. Each step shares a row with the next because the river never
falls faster than a row per column; that is a fact about the shape rather
than something enforced, and `residents.test.ts` is what holds it, since a
walk broken at a corner is a spot nobody can reach. The spur is gone: every
step of the walk is the spur now.

**The shape is traced off the drawing, and traced rather than sketched.**
`TRACED` in `wood.ts` is the centreline as measured out of the picture —
the blue read out of it, the middle taken row by row down the north-south
limb and column by column along the eastward run, thinned to the points
where it actually turns. It is kept in the **drawing's own pixels**, and
`RIVER` fits it across the **town's** width and down until its lowest
point sits `BANK_ROOM` rows off the wood's foot. So the shape is one list
and the fit is one pair of numbers, rather than twenty pairs to redo by
hand every time the wood changes depth — or every time the map grows
sideways, which is what the fit being the town's is about.

**It is a soft W and that is the thing to keep.** It comes in off the top
edge and leans **east** as it falls, turns back west a fifth of the way
down and runs to an elbow — the first V — then east across the map, shallow
at first, dropping steeply a little past halfway into a valley, rising over
a hump, and falling into a second valley as it leaves the map. That second
pair is the other half of the W and it is the softer one. `wood.test.ts`
asserts each of those as a comparison rather than as a coordinate, because
the wood's depth is allowed to change and the shape is not. Sketched at
eight bends every one of them was lost and it read as a diagonal.

**The corners are the point, not the line.** What a bend is _for_ is the
land: each turn crops a wedge of wood out of the bank on the inside of it,
and those wedges are what make the wood a few little places rather than one
long even strip. Fitting a square drawing onto a map twice as wide as it is
deep halves every angle in it, so a bend has to be a real bend to begin with
or it lands as a bevel nobody would notice — which is what happened the
first time, with a trace that was right to within a tile everywhere and a
river that still read as one smooth bank.

**So east of the drop the line is ours rather than the drawing's.** The
drawing runs near enough flat from there to the edge, and flat water crops
nothing. The tail is a **valley** at the foot of the drop, a **hump**
halfway along and a **second valley** as it leaves the town — which puts a
tongue of wood into each valley from the north and one into the hump from
the south. Three outcrops, and the first of them is the one with the cabin
on it. The drawing's own flat stretch is still in there as the shallow top
of the hump; what changed is that it now has something either side.
Everything down to the head of the drop is the trace, untouched.

**And past the town it turns north and leaves by the top edge** (`TAIL` in
`wood.ts`): out into the wilderness, down into the second valley — the
lowest the water gets anywhere — and then up and off the map, well west of
the highway. It climbs faster than a row a column, which the eastward run
may not do; there is no walk up there to fall through, because the
wilderness has no paths. Why it turns at all is the highway: see **The
highway, and the cars on it**.

`wood.test.ts` holds each of the turns to an **angle** rather than a slope,
since an angle is exactly what the squash takes away, and it counts the
elbow's tongue directly — that is the one with water on two sides, so a
column with two runs of river in it has land between them.

One constraint runs through the whole tail: **no bend falls faster than a
row a column.** The walk along the bank steps down with the water, and a
step of two rows is a walk with a hole in it.

The rest is flatter than in the drawing and cannot not be: the vertical is
compressed about twice as hard as the horizontal. What survives — and what
makes it the same river — is where the bends fall and how they compare. A
diagonal at its true angle everywhere would need a wood as deep as the map
is wide, which is a wood bigger than the world under it.

**Two rocky beaches, on the far bank.** `WOOD_BEACHES` — shingle, its own
ground like the trails, at the shoulder where the limb turns east and at
the tip of the tongue. Which rows are **read off the bank the centreline
draws**, for the reason the walk on the near bank is read off `southBank`:
the bank staircases, so a beach written as a row number is a beach in the
river at one end of itself the next time a bend moves.

**A beach is a shelf rather than a staircase**, and that is the one place
the water is not simply what the line draws. A tile deep, stepping down
with the bank, the shoulder's came out five tiles on one row and a sixth on
the row below with a strip of river between them — a beach with a notch
bitten out of the middle of it. It takes every row from the highest the
bank reaches across its run to the lowest, and **the river gives up what
falls inside it**: `riverBed()` is the drawn bed less the shelves, so the
water's edge comes out straight along the foot of the shingle. Squaring off
can only ever take water and never stand shingle in it — above the bank a
column is dry by definition. The tongue's bank is flat and its beach is one
row, exactly as before.

That subtraction is why `riverBed()` is not the bed the centreline
rasterises: `drawnBed()` is, it is private, and a beach measures the bank
off it because a beach asking `riverBed()` where the bank is would be
asking a question its own answer had already moved.

The far bank rather than the near one, and on purpose: shingle underfoot is
ground somebody would expect to walk down to the water on, and nothing
crosses the water. They are laid after the water in `groundGrid`, so a
beach at the bank stops at it rather than being drawn over the river, and
the water's own foam laps at the stones because the foam goes over the
ground.

The tile is drawn by `shingle()` in `make-world-art.mjs`, and it took three
goes to stop it reading as concrete: pebbles have to be four or five pixels
across to be a thing rather than a speck, packed on a jittered grid rather
than dropped at random — which clumps and leaves bare floor — and **drawn
from masks rather than solved as ellipses**, since a five-wide ellipse comes
out of the arithmetic a diamond.

**There is a cabin on the far bank**, on the tongue in the first valley —
`WOOD_CABIN`, taken off `northBank` rather than written as a row, so the
bend that makes the tongue is what puts it there. It is the one place the
north side comes far enough south to be looked at properly from the walk.

It stands **two rows back from the water**, with the shingle on the last dry
row and a row of grass between. Its feet used to be on the water's own edge,
and a prop's picture hangs a row and a half above its feet — so the bottom
of it was drawn over the river, a cabin with its porch in the water, on the
one bank nobody can walk up to and see it is not.

It is **decoration and nothing else**: an ordinary prop with a footprint,
so it is solid, and solid is all it is — no door to walk into, nothing to
press at, no fixture entry. It does not need one, because there is no
bridge: `wood.test.ts` asserts `allReachable` cannot get to it from the
spawn, which is the honest way to say "you cannot go in" and would fail the
day somebody plants a crossing. `CABIN_CLEARING` keeps the scatter two
tiles off it, or the wood would grow a canopy over it — outdoors everything
sorts by the bottom of its own picture, so a tree a foot in front is a tree
drawn across the front of it.

**And a boulder standing in the river**, off the western corner of the
shoulder beach — `WOOD_BOULDER`, with a red cross daubed across it. Both
of its numbers come off `WOOD_BEACHES[0]`, which comes off the water, for
the reason the cabin's row does: the shoulder is made by a bend, so a rock
pinned to a row is a rock on dry land the next time the bend moves. The row
is the one below the shingle — a beach is a shelf, so the water's edge along
its foot is straight — and the column is the one west of it, where there is
water to stand in.

It is the cabin's argument at one tile: **a thing across the water with a
mark on it and no way of getting to it**, so the mark is all there ever is.
There is nothing under it and nothing to press at, and `wood.test.ts`
asserts `allReachable` cannot reach it, which is what would fail the day
somebody plants a crossing beside it. Its footprint buys nothing where it
stands, since the tile is water and water is already solid; it is there so
that a rock is a rock on that day.

The picture is a `slot` in `make-world-art.mjs` like every other prop, and
two things in it were the work. It is drawn in the **shingle's own pebble
ramp** rather than the lilac-grey furniture stone, because a rock in this
river and the stones washed up at its foot are the same rock broken up.
And the cross is measured **across** the stroke rather than stepped along
it: stepping a diagonal a whole pixel either side leaves the run of it a
pixel and a half apart, and what comes out is two rails with daylight down
the middle instead of one stroke.

**The trails are their own ground**, `trail` — trodden earth, generated like
the rest of the tiles — for the reason the court and the car park have
theirs: what is underfoot is a fact about the map, and a slabbed pavement
through a wood reads as the town having got there first. No kerb, except
where the trail meets the plaza's own edge: the town's paving is raised
above trodden earth exactly as it is above grass.

**The wood is scattered, not written out.** A wood is a thing you cannot see
the far side of, and one written prop by prop is a wood nobody will ever
move a trail through. `WOOD_PLANTING` is a settled hash scatter — the same
wood every run — and `scenery.ts` plants what can actually stand there.
Three rules, all about the **picture** rather than a pair of feet, which is
why they live there rather than in `wood.ts`:

| Rule                            | Why                                                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nothing hangs over a trail      | Everything outdoors sorts by the bottom of its own picture, so a walker is drawn _behind_ a tree whose feet are below theirs. A stretch of path somebody disappears along is not a path |
| Nothing off the top of the map  | The camera is clamped to the map, so a tree on row 0 is a tree with its bottom third showing and nothing above it                                                                       |
| No two trunks in the same place | Bodies, not pictures. Canopies overlapping is what a wood _is_; two footprints merged are a wider solid than either, and enough of them is a thicket a route has to go round            |

The first is asymmetric and rightly so: a tree's picture is above its feet,
so one north of a trail may stand almost on the edge of it while one south
of it has to be two tiles back. Canopies lean over the path from above.

**A wood with nobody in it is scenery.** `WOOD_WANDER_SPOTS` puts five of a
wanderer's places up there, spread along the walk on the bank and taken off
it rather than written as rows, so Michael crosses the wood like anywhere
else. All on the near bank, since a spot a wanderer is sent
to and cannot reach is one they stand still for; `residents.test.ts` holds
every one of them to being clear to stand on and reachable from every
other, which is what catches both that and a trail the scatter closed.

The way in is the trail itself: it runs down through a gap cut in the tree
line along the town's top edge and ends on the plaza's own north edge. A
trail that stopped short on the grass would be a path to a lawn, and a wood
whose entrance is a gap somebody happens to find between two buildings is
not one anybody will find.

## Outdoors

The world map and a campus are the same place in every way but the drawing
of it, and `scenes/OutdoorScene.ts` is that place: arriving out of a door
and taking a few steps down the path, walking by keys or stick or tap,
everyone else drawn from the room socket — the residents taking the air
among them — the camera that follows and zooms, and a doorway that either
starts another scene or asks the router for a lobby.

A place says three things for itself:

| Hook        | Answers                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| `loadArt`   | The pictures it is drawn from, on top of the outdoor pack                                                     |
| `layOut`    | Lay the ground and put up the buildings; hand back size, spawn, doors, entrances, solids, label, path, camera |
| `goThrough` | A doorway it opens itself by starting a scene, rather than loading a page                                     |

There used to be a fourth, `standing`, and a `/api/residents` poll behind
it: outside was no room, so each browser asked the server where the
residents were and painted them itself. It is gone with the route — the
outdoors are presence rooms, so a resident out here arrives through the
socket like anybody else.

`scenes/outdoors.ts` is the drawing half — ground, water and its foam,
props, signs, the ferry, and a building with its name on the band the art
leaves blank — and both places call it. So a third outdoor place is a
`layOut` and its art, not another scene.

**Out of doors the buildings are the menu.** This is a UI before it is a
world: pointing at a building has to mean "take me there", so a tap
anywhere on the picture walks to that front door and goes in.
`lib/world/entrances.ts` is the rule and `OutdoorPlace.entrances` is what a
place hands over — `Building`, `CampusBuilding` and the moored ferry all
already carry the three fields it wants (`frame`, `door`, `outside`), so
each place passes what it laid out.

A tap used to mean "walk to that pixel". A building is solid, so the
pathfinder snapped the destination to the nearest open ground — the side
wall. You chose Sandbox ERP and got a character standing in the flowerbed
beside it, with nothing on screen to say what had happened.

Two details it would be easy to get wrong, both of which look correct:

- **The walk ends _in_ the doorway, not in front of it.** Walking into a
  doorway is already what goes inside (`DoorLatch`), so the route does on
  its own exactly what the arrow keys would have done and there is no
  second way into a building to disagree with the first. A route that stops
  a few pixels short arrives, stands there, and the door never fires —
  which is indistinguishable from a walk that worked.
- **Two waypoints, not one.** The pathfinder inflates every solid by half a
  body width, and a doorway sits against the building — inside that
  padding, so the grid calls it blocked and snaps the destination
  elsewhere. `outside` is the part it can plan to; the last step is walked
  straight at the door, which is safe because a doorway is open ground
  under the wall. `__tests__/entrances.test.ts` holds every approach to
  being clear of `worldSolids()`, and every doorway to being hit.

**Going through a door means going out of sight**, the same as stepping
into the lift. Two things were wrong there: `enter` stopped the character
with `player.update({vx:0, vy:0})`, and `update` re-reads the keyboard — so
walking in on a held arrow key handed the stop that key's velocity and the
walk cycle carried on, with `leaving` then blocking every later frame. He
ran on the spot in the doorway for the whole second a page load takes. It
is `drive` now, and `player.board(true)` — hidden, animation stopped.

It was two files that had drifted into being the same file twice: eleven
identical fields and eight identical methods apiece, about 200 lines of
them. The cost was the usual one — only `CampusScene` cleared the map that
indexes drawn residents when it started, so the world map stopped drawing
anybody standing outside on a second visit, and there is nothing about that
to notice except an empty green.

`OfficeScene` is deliberately not one of these. A room has a tilemap,
seats, fixtures and a lift; it shares presence through `attachPresence`
rather than its whole shape.

## The volcano, and the blob in its cave

A second dock runs off the south road at the foot of the east avenue
(`VOLCANO_DOCK`), with the same boat moored to it and a board reading FERRY
TO VOLCANO. It crosses to **Volcano Island** — black sand, lava pooling either
side of the one path up, a smoking mountain — and at the foot of the mountain
is a cave with **one blob in it**, which hops about and which you can punch.

Five files, and the split is the basketball's:

| Where                    | What                                                                      |
| ------------------------ | ------------------------------------------------------------------------- |
| `lib/world/volcano.ts`   | The island and the cave, described as data. Pure, shared                  |
| `lib/world/blob.ts`      | A leap: the arc of a hop or a punch, and how far an arm reaches. Pure     |
| `lib/server/blob.ts`     | `CaveBlob`: when the next hop is due, and whether a punch landed          |
| `scenes/VolcanoScene.ts` | Draws either place from its data — one scene for both, as for campuses    |
| `systems/BlobHop.ts`     | The blob's squash and stretch, the tumble, the stars, the POW, the prompt |

**It is nobody's, so it is not a campus.** A campus is an organisation's yard
and its buildings are that organisation's lobbies; the volcano has no owner and
no lobbies. That is also why `Building.org` is nullable: the volcano ferry is
the one thing on the world map you can walk into that belongs to nobody, and
filling it with a made-up organisation would put a volcano in the welcome
screen's list of places to work and in the Grand Tour's count. `id` is the name
a building always has, and `Entrance` gained `{ kind: "volcano" }`. Coming
home, the island hands back `from: "volcano"` — its room slug — which is how
`buildingFrom` finds the right dock to stand you on.

**A second dock rather than a second boat on the first one.** Two ferries off
one dock would have split its end a board apiece, and walking down the middle
would have put you on whichever boat your feet were nearer — a crossing decided
by a pixel. Out here the buildings are the menu, and a menu with two entries in
one place is not one.

**Two rooms, two addresses.** `/volcano` is `volcano` and `/volcano/cave` is
`volcano-cave`, so the beach and the cave are different places and the blob has
exactly one room to be published to. The cave is drawn by an outdoor scene and
counts for `isOutdoorPath` for that reason alone — the office pack has no cave
in it — and its ground is **rock with the floor dug out of it** (`base: "rock"`
in the `GroundPlan`), solid the way the sea is: `solidGround` turns every run of
water, lava or rock into a body, and `layGround` draws a rock tile's face where
floor runs up to it from the south.

**Everything the blob does is a leap**, and that is the decision to keep. A hop
of its own accord is a short one and a punch a long, high one; nothing else
ever moves it. So the server says where it is going once, when it sets off —
`{ type: "blob", leap, elapsed }` — and every browser runs `leapAt` against its
own clock, which is the traffic's arrangement rather than the ball's. A cave
with a blob sitting in it is a cave with nothing on the wire. It is stepped only
while somebody is in the cave, and sent to anybody walking in, since a blob
published only when it sets off is otherwise invisible until its next hop.

Four rules in the punch, all on the server:

| Rule                                        | Why                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| The browser says only that it punched       | Where from and which way are the room's record, as for the ball                         |
| Reach from the feet, `PUNCH_REACH_PX`       | The basketball's lesson: a person's `y` is the middle of their frame                    |
| No second punch while it is still sailing   | Or two people either side of it juggle it without its ever touching the floor           |
| It stops against the first thing in the way | A punch into a corner is a stride, not a trip through the rock — see the next paragraph |

**It can be punched from somewhere it could not sit.** A hop checks only its
landing — a blob hopping over a crystal is a better thing to see than a blob
that will not go near one — so a blob caught mid-air may be over the crystal or
the lava. `knocked` skips whatever is under it at the start of the line, stops
at the first obstacle after clear floor, and failing any clear floor at all
comes down where the interrupted hop was going to land. The ten-minute soak in
`lib/server/__tests__/blob.test.ts` is what found this: a blob punched over a
crystal and knocked no distance came down inside it.

**The punch is E, the pad's A, or the HUD's button** — the interact press the
scene already gathers. Keyboard A is WASD's left, so the prompt says E there
like every other `Press` in the world, and says A (or ✕) when a controller is
plugged in, off `confirmLabel`.

**The volcano's rumble is timed off the wall clock** (`systems/Eruption.ts`):
one every `RUMBLE_EVERY_MS` since the epoch, so everybody on the island feels
the same one without the server being asked. Browsers' clocks agree to within
a second, which is near enough for a mountain.

**The cone's outline is written once** — `CONE` in `lib/world/volcano.ts`,
which cuts the solid bands from it, and which `scripts/make-world-art.mjs`
imports to draw the mountain to. It used to be written in both, with a test
reading the script to insist they agreed, because a mismatch is invisible
walls in the sky beside the summit; the script runs under tsx now, so the
copy and the test that policed it are gone.

**Two badges, both off things the server saw.** **Hot Foot** is a join to
either room — the cave counts, since a shared link can land somebody straight
in it, which is the footing Sea Legs is already on — and the volcano being
nobody's keeps it out of the Grand Tour's count. **Seeing Stars** is a punch
that _landed_: `onPunch` is only reached after `CaveBlob.punch` has checked the
reach and that the blob was not already sailing, so a swing across the cave
earns nothing. A curio rather than a local, because Knows Everybody counts the
cast and the blob is not in it.
