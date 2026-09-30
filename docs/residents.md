# Residents

The residents' routines, wandering, stations, and Michael. Moved out of CLAUDE.md so it is read when the work needs it rather than in every session.

## Residents and wandering

Residents are the characters who live in the buildings. **Who they are** is
`lib/world/roster.ts` — names, looks, organisations, stations, lines — and it
imports no scenery, wood or route code, because it is what the HUD, the
character library and the floors read, and it ships to every browser.
**Where they go** is `lib/world/residents.ts`, the haunts and routes, which
is the server's and re-exports the roster for it. They were one module, and
importing the roster evaluated the whole world's tree planting on the way to
first paint: about 190ms, down to about 12 since the split.

`ResidentSimulation` walks them through their **haunts** — desk, their
organisation's rooms, its campus yard, outside — staying `DWELL_MS` at each.

**Every haunt is a presence room, the outdoors included.** They join that
room's hub as a player, so everybody there sees the same person take the
same steps. The map used to be the exception: outside was no room, and each
browser asked `/api/residents` where they were and drew them itself, every
ten seconds and never in between. That is what made a resident two things —
somebody who walks indoors and a picture outside — and both of the faults
that came of it were invisible to the server:

- **Two of them in one place.** Sandbox ERP's residents share the
  doorstep of their building among their two places outside
  (`outsideSpots`: their own spot in the row in front of the fountain, and
  the path to their own building's door). Both were sent to it and neither
  asked whether it was taken, so they stood inside each other for the
  length of a stay. Sara and Bud were the pair; Sara holds a code now, and
  Doc took her place in it.
- **Nobody walked.** They appeared at a spot, and appeared at another one
  when the stay was up.

Two rules replace them, both in the simulation because **nothing collides a
resident**: they are only ever _sent_ somewhere nobody is standing and
nobody is heading (`roomToStand`, `PERSONAL_SPACE_PX`), and a step that
would end up inside somebody is not taken — they wait for the way to clear
and go elsewhere if it stays blocked. A step that takes them _further_ from
whoever they are too close to is always allowed, or anybody who ended up
overlapping would be pinned there.

**Out of doors they come and go by their own front door.** `doorwayFor`
is the doorstep of their organisation's building: they are stood there on
arriving and walk to wherever they are standing today, and when the stay is
up they walk back to it before they go in. Only the world map has one — a
route is planned over `worldSolids()`, and a campus's own buildings are not
in them, so a yard is entered the way a room is and wandered inside its
paving once there.

**Three things were quietly taking them indoors from the middle of the
map**, which is the one thing that walk exists to prevent:

| What             | Was                                                                                    | Is                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `goIfAtTheDoor`  | An empty course meant "arrived"                                                        | Asks where they are standing. A course is dropped for other reasons than getting there                               |
| A leaver held up | `holdOn` dropped the course and `walk` skipped `aim` for a leaver, so they stood still | A step aside, then the way to the door planned again from where they now stand                                       |
| `LEAVE_WALK_MS`  | 30s, and Yash's walk home is 35                                                        | 90s. It is a backstop for somebody who _cannot_ get there, and shorter than the longest honest walk it is a deadline |

The middle one is the interesting one. A route is planned over the map's
solids and a person is not one, so the way to the door is the same way
every time it is planned and it runs straight through whoever is standing
in it. Bud and Yash have adjacent places in the row in front of the
fountain and Bud's building is east of both — so Bud planned, was blocked,
gave up, and planned the same route again for thirty seconds, and then the
backstop took him inside four hundred pixels short of his own front door.
`stepAside` goes **across** the line to whoever is in the way, since
sideways is the one direction that gives up none of the journey, and one
space of it is enough when what is in the way is a person rather than a
wall. The last one is measured off the map by `residents.test.ts` rather
than remembered, so a building put further out fails there instead of on
somebody's screen.

Because a resident is a player in every room now, the hub's `isFull` counts
humans rather than everybody in it, as `count` always did. It counted
everybody, so the residents in a lobby each took one of its four places;
that went unnoticed until seven of them could be on the world map at once
and it started refusing arrivals.

**And the open air has no human cap to speak of.** `MAX_HUMAN_PLAYERS` is
six, which is a room; the world map is where every visitor is put down, so
the seventh person outside was told it was full — and a refused person
outdoors is stranded, invisible to everybody, while their socket reconnects
into the same refusal. The world map, the campuses, the volcano and its cave
take `OPEN_AIR_CAPACITY`, sixty-four, which is a guard rather than a limit.
A room is forgotten only when it holds neither sockets nor residents, where
it used to be dropped the moment the last human left and recreated by the
next resident tick.

**Solid is the wrong question for where somebody stands.** Out of doors
everything sorts by the bottom of its own picture, so a person whose feet are
above a building's or a prop's bottom edge is drawn _behind_ it — and that
strip of ground is walkable, because only the wall is solid. `clearToStand`
in `lib/world/scenery.ts` is the right question: no building frame, no prop
picture, nothing solid. Somewhere a person can stand and be looked at.

The row was `{ x: 760, y: 668 } + n * 40`, which was in front of the fountain
when the plaza began at the origin; the plaza then moved behind `CENTRE_X`
and the literal did not. It ended up at the foot of Chester's wall, and the
first two residents to take the air stood inside the bottom strip of the
building's picture with only their name tags showing underneath it. Nothing
objected, because nothing there is solid. It is taken off the fountain now,
and **the row is walked rather than multiplied out** — `placeInRow` steps
past anywhere somebody would be hidden, which is what makes it hold when the
cast grows or a bench moves rather than being true today. It steps over the
bench in front of the fountain as it stands. `residents.test.ts` holds every
resident's every spot, and every wander spot, to `clearToStand`.

**Wandering mode** is `wanders: true` on a resident. It is a mode, not a kind of
character — put it on anybody and their whole routine collapses to one haunt,
the world map, and they never go in. A wanderer works nowhere, so `org` and
`home` are both null, which is what leaves them without a desk (`deskOf` → -1).

It leans on the world map being a presence room (`WORLD_ROOM_SLUG`), so a
wanderer is an ordinary player in it and the same `wander()` that walks a
resident round a lobby walks them across the map — no separate movement code,
and because the server is the one walking them, every viewer sees the same steps
rather than each browser inventing its own.

Everywhere else a resident wanders inside **bounds** (`WANDER_AREAS`), a patch
of open floor picked so a random point in it is never solid. The world map is
too big and too built-up for that, so it has **places** instead:
`worldWanderSpots()`. A wanderer picks one they are not standing on and
walks there, and since nothing collides them the route is the only thing keeping them
out of the walls — `routeAcross` (`lib/world/route.ts`) plans it over
`worldSolids()` on the same coarse grid `allReachable` checks the map with, and
hands back corners rather than cells. `residents.test.ts` holds every spot to
being clear of the buildings, the props and the sea, and reachable from every
other; the simulation's own tests walk Michael for twelve minutes and assert he
never crosses a solid.

**The list is in two halves, and the second is swept off the map.**

| Half             | What it is                                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PLACES`         | Written down: the doorsteps, the two promenades, the avenues, the plaza, the car park, the dock, and the walk along the bank up in the wood. Somewhere the map already means people to stand |
| `roamingSpots()` | Everywhere else: a lattice over the whole map, keeping what is reachable, clear to stand on, and twelve tiles from anything kept already                                                     |

The first half was the whole of it and could not say what it needed to say.
Doorsteps and promenades are exactly right for the town and exactly what the
shops' wood, the meadow and the far side of the wilderness have none of —
so when the map grew to three times its width, two fifths of the ground a
person can walk on ended up more than twelve tiles from anywhere Michael was
ever sent, the whole eastern quarter included. He was not wandering the
world, he was wandering the town, and nothing on screen said so, because a
chicken on a promenade looks like a chicken doing what chickens do here.
A count of thirty-six was the test, and it passed throughout.

Three rules in the sweep, and the first two are what keep it honest:
standing room, because nothing collides a resident and a point in a tree is
a chicken in a tree; reachable from the spawn, off the one flood
`reachedFrom` now hands back for `allReachable` as well; and twelve tiles
from everything kept, or the meadow alone would be three hundred points.

The first of those is `clearToStand`'s question asked of `standingRoom()` —
the frames, the pictures and the solids as one kept list — through
`coversPoint`, which buckets it — and `clearToStand` is now that same
question too, where it used to walk the lot: five thousand rectangles once
the wood is planted, 180 times slower for the same answers. An edge counts
as covered. Same arrangement the basketball is already under, for the same
reason.
A lattice point that lands in a tree looks for the gap beside it, out to
two tiles in a ring — which never fires in the meadow and is the whole
difference in the wood, where the canopy is most of the map and the
clearings are what is left between the trunks.

It is read off the map rather than listed, so a building put up in the
meadow or a trail cut through the wood changes where he goes without
anybody coming back here. **A function and not a constant**, worked out on
the first call and kept: a `const` would sweep the moment the module is
imported, and this module was in the browser's bundle when the scenes read
the cast out of it — so a quarter of a second of flooding the map, to answer a
question only the server asks, would be a quarter of a second of a page
that has not painted. `residents.test.ts` asks for **a place in every
part of the map** now, in six boxes, rather than for a number: a count is
what was true of the old list while the world grew around it.

**A route is planned against a grid, not against the list.** Asking "is this
cell blocked?" by testing every solid is the obvious way and it is what
`routeAcross` did: a flood over some nine thousand cells, each reached from up
to four sides, against a hundred and sixteen buildings, props, signs and
stretches of sea. Four million rectangle tests, about fifty milliseconds, and
the server does nothing else while it happens. That was affordable while one
chicken wandered the map; it stopped being affordable when the residents'
outdoor haunt became the map too, because seven of them can set off within a
tick of each other and half a second of blocked event loop is a room that will
not load and a lift that will not move. The solids are painted into a
`Uint8Array` once instead, kept against the list they were drawn from — which
is why `worldSolids()` hands back the same array every time rather than
rebuilding it, and why `scenery.test.ts` says so. The search itself runs on
typed arrays reused per grid shape, and the connected regions are labelled
once, so a goal across the river is refused without searching at all — a
route is about a millisecond now, where it was fifteen.

The player's own tap-to-walk planner (`components/game/utils/Pathfinder.ts`)
had the same fault a step worse: it tested every 16px cell against every
solid, two seconds on every arrival on the world map. It paints its grid now
too, caps its search at twice the grid's size, and outdoors falls back to an
unpadded grid when the body-padded one finds no way between the trees.

**The ball asks a different question of the same list, and it is bucketed
rather than painted.** `coversPoint` is the index: a route wants to know
whether a _cell_ is blocked, which a coarse painted grid answers; the
basketball wants to know whether a _point_ is inside anything, and it has to
be exact, because what comes of a yes is a bounce off that rectangle's own
edge. So each solid is filed under every 96-pixel square it touches and a
point tests only its own square's. `stepBall` asks it twice a tick while the
ball is low, against every solid on the map — fifty milliseconds a throw
before, two after.

`allReachable` in `scenery.ts` now asks `blockedCells` the same question
rather than keeping its own per-cell sweep. It was the last place still
doing it the slow way, which cost little while the map was the town and a
hundred-odd rectangles; the map is three times as wide and the scatter plants
a couple of thousand trees across it, so the sweep went up by both at once —
fifty thousand cells against better than a thousand rectangles, a second or
so a call, in tests that call it several times over.

A resident's look is reserved (`RESERVED` in `lib/characters/library.ts`), so
adding one takes their sheet out of the player picker automatically — which is
why a wanderer still needs a `WORKER_SPRITES` entry: that is where
`scene-presence.ts` looks up the sheet to load for a presence player.

Michael, a chicken in a necktie, is the first and so far only wanderer. He
also has a `greeting` — "Cluck!" — which is the other kind of thing a
resident says: `lines` are remarks on arriving somewhere, which they do on
their own account, and a greeting is an answer to somebody walking up.

It is the server's, like every other thing a resident does, so the bubble is
over his head on everyone's screen and not only on the screen of whoever
walked up. Four rules keep one word from becoming a stuck horn, all in
`lib/server/residents.ts`:

| Rule              | What it does                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Edge-triggered    | Once for an arrival, not once a tick for as long as somebody stands there                       |
| `GREET_CLEAR_PX`  | Wider than `GREET_PX`, so somebody hovering on the boundary does not cross it twice a second    |
| `GREET_QUIET_MS`  | A floor under the gap between two of them, so a queue of arrivals is one cluck rather than five |
| `CAUGHT_QUIET_MS` | The floor when the second is a catch — a second, because a catch is not an arrival              |

**Being caught is not the same as being walked up to, and that is the
fourth rule.** Somebody inside `GREET_PX` of a chicken who is _already_
running has run him down: they never left the radius for the edge to fire
on again, so nothing above can express it. It used to be that catching him
counted only if you happened to still be within arm's length on the exact
tick the fright ran out — and at half again a sprint that is a stride he
does not often lose, so a pursuer who cut a corner, got on top of him at
three seconds and was a step behind at five got nothing for it and nothing
on screen to say why. A catch is now a fresh fright of its own, held to
`CAUGHT_QUIET_MS` rather than to the length of a run: a second, because the
queue of arrivals the longer floor exists for cannot reach him at all.

**And a fright that has run its course is a fresh arrival.** Edge-triggered
is the right rule for somebody leaning on a counter and the wrong one for
somebody who chased the chicken and kept up: they never left
`GREET_CLEAR_PX`, so `greeted` stayed set, and what they got for catching
him was a bird standing there in silence until they walked away and came
back. `settle` clears the flag the tick the fright expires — and lays the
egg the run won, which is the other reason the end of a run is a moment
rather than a clock running out. `GREET_QUIET_MS` is therefore **exactly
`SPOOK_MS`**, not the eight seconds it was: a quiet period outlasting the
fright by three would put the re-cluck back where it started.

**And then he bolts, away from whoever startled him.** A cluck is a fright,
so saying it sets `spookedUntil` five seconds ahead (`SPOOK_MS`) and off he
goes at `SPOOK_SPEED_PX_S` — dashes one after another, each aimed into a
`SPOOK_SPREAD` cone with the fright behind it, until it wears off and his
ordinary wander picks up where it left it. Only a cluck that is actually
said spooks him: the quiet period above returns before the say, so a second
person walking up inside it gets neither.

**The pace is measured against the sprint, not written down.**
`SPOOK_SPEED_PX_S` is `SPRINT_SPEED_PX_S * 1.5`, because the only thing
that matters about it is that it is faster than whoever startled him. It
was 150 — under half a sprint — so anybody who ran after him caught him
inside a second, and a fright you can keep up with at a jog is not a
fright. A fifth again was the next try and was still not enough: a sprinter
loses a pixel and a half in ten to a chicken who keeps turning, so he was
caught anyway and the chase had no shape to it. At half again he is gone,
and catching him means cutting a corner rather than out-running him. It is
well inside what the hub will carry: `move` clamps against
the sprint times `SPEED_TOLERANCE`, which is two and a half of them.
`SPOOK_DASH_PX` went up with it, since 70 to 160 is a fifth of a second
apiece at this pace — a chicken shaking rather than a chicken running.

The direction used to be a plain random angle, which is a chicken who says
his one word and then dashes _past_ you as often as not — the cluck and the
fright pointing at different things. The cone is a third of the circle
rather than straight away, so it is still a scramble: every dash puts ground
between the two of them and no two of them are the same bearing.

Five things in it, and the first is the one that would go wrong quietly:

| Rule                                      | Why                                                                                                                                                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A dash lands where he could have wandered | Nothing collides a resident. Outdoors that is `openGround` **and** `reachable` from the spawn — the far bank is open ground nobody can get to — and a dash with no route tries the next direction; in a room it is the haunt's `wanderArea` bounds |
| The pause between wanders is ignored      | `walk` lets a spooked resident aim again the moment a dash ends — standing about in the middle of a fright is not fleeing                                                                                                                          |
| A walk to a door is not dropped           | `goIfAtTheDoor` reads an empty course as being at the door, so clearing one would put somebody through it from the middle of the room                                                                                                              |
| Away from where they _were_               | `spookedFrom` is a point taken at the cluck, not a person read each dash. Re-reading it would be a chase, and one a person could steer by walking round him                                                                                        |
| The cone gives way before the wall does   | A chicken in a corner has no way out that is also away. Tries past `SPOOK_TRIES` open out to the whole circle, or he would stand still in the middle of a fright                                                                                   |

It asks the room's hub rather than the simulation, because the hub is where
everybody standing in the room is — and **a resident coming round the corner
startles him exactly as a person does.** `someoneNear` used to be
`personNear` and skipped the locals, on the reasoning that they are sent to
places nobody is standing in anyway; that is true of where they are _sent_
and says nothing about the walk between two places, which crosses whatever
is in the way because nothing collides a resident. So Michael could be
walked up to by one kind of thing and stood beside by another, which is not
a fact about chickens. It skips anyone hidden in a lift, and it skips the
asker, or he would spend his life fleeing his own company. It answers
without allocating, for the reason `get` does not use `snapshot()`: this is
asked of a room on every tick.

`peopleNear` is still people-only and stays that way, because what it feeds
is a badge and a local holds none.

**`nearestNeighbour` is the second question and it is asked far less often.**
The tick check above wants a yes or a no and stops at the first it finds; a
bolt wants a point to run away from, which means scanning the room and
building one. So it is asked only on the tick something is actually said —
and for the nearest rather than for any, since a chicken with two people
around him should put the near one behind him.

It hands back whether that body is a resident, because **the fright is the
same whoever caused it and the credit is not**: an egg is a thing somebody
is given, so a chicken startled by Doc still lays and the egg lies in the
grass for whoever comes along.

One thing that looks like tidiness and is not: `greetedAt` is 0 for _never_,
the way `heldSince` is 0 for nobody in the way. A plain `now - greetedAt`
reads a fresh simulation as having just spoken, which on a clock that starts
at zero — every test in `residents.test.ts` — swallows the first greeting of
the run.

**A station** is the other way to have no desk:
`station: { room, x, y, facing, paces? }` puts a resident at a post in a room,
and having one replaces the routine rather than joining it — someone posted at a
counter is either at it or out wandering the world map, and goes nowhere else.
`home` stays null, so nothing is reserved for them upstairs; `org` is real,
since they do work for the company.

`paces` is the patch of floor they work, and it does the walking: on duty they
pace it, using the same `wanderArea` bounds that send a resident round a lobby
— which is why `wanderArea` takes the resident as well as the haunt, since a
station's patch belongs to its counter rather than to the kind of room. Without
`paces` they stand at the post. The bounds are for the sprite's **centre**, and
nothing collides a resident, so they are the only thing keeping one out of their
own furniture.

Doc works the one station that exists: **Support**, on Sandbox ERP's
Operations floor — the room the support queue hangs in, which is what makes
it Support. His post and the band he paces are `opsSupportPost` in
`lib/map/floor.ts`, read off the room rather than written down, so a longer
corridor carries him with it. He also has `lines`, the only resident who
does: he remarks on arriving, and which of the two depends on whether he is
at the post or out on the map.

The help desk counter in the lobby is still there and nobody works it. Four
tiles of counter with somebody's work all over it, down in the wide bottom
of Sandbox ERP's lobby — the part that carries on past the bitten-out
corner, where nothing else is — with one row of floor in front to walk up to
it from and two behind. Its footprint, its point of interest and the post
and pacing it was built for are all `HELP_COUNTER` in `lib/map/office.ts`;
`buildOfficeSpec(src, { helpDesk: true })` puts it in a lobby, and only
Sandbox ERP's asks for it. The art
(`scripts/make-help-desk.ts` → `public/sprites/help_desk_counter_192x96.png`) is
generated for the same reason the lift and the games are: the interiors pack has
no reception counter.

He paces _behind_ the counter rather than half hidden by it, which would look
better, because **the room has two depth schemes and neither allows it**: a prop
is drawn at depth 4 and a presence player at the height of their own feet, some
hundreds, while the local player is a flat 5. So no height given to a counter
covers a resident without also covering the person walking up to it. The bottom
of his pacing patch is therefore the post, where the bottom edge of his sheet
meets the counter's top edge — half a tile lower and he is drawn over his own
desk. The counter's sign is the only one in the room hung _below_ its subject:
above it is where he walks.

Also note the lobby's counter is **not** called "Help desk". That is the
support-queue board on an Operations floor, which `OfficeScene` finds by exactly
that name — a loose match there drew the board on top of the counter.
