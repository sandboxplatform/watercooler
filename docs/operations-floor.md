# The Operations floor

The corridor and its rooms, the boards on the walls, the week's counts, the boardroom and meetings, and interior walls. Moved out of CLAUDE.md so it is read when the work needs it rather than in every session.

`trello` is the project board and `zoho` the support queue — each a picture
on the wall you walk up to and press E at. The list **is** the floor: a
building that names none has no third floor at all, and `addressFromLocation`
refuses `/floor/3` there. So Castle Atlantic has a Trello board and no
support queue, and nothing had to be special-cased to arrange it.

**An Operations floor is a corridor with rooms off both sides.** Rooms fill in
**bays** along it, one above and one below each bay, left to right — so four
rooms is two bays and ten is five. The floor **grows sideways**: `opsWidth`
and `opsRooms` in `lib/map/floor.ts` take a room count, the height never
changes, and a company with more projects on the go gets a longer corridor
rather than a redrawn floor. Sandbox ERP's is 73 tiles wide, Castle
Atlantic's 37.

**And past three bays it grows the other way too.** `opsWing` is the rule:
from four bays on, the first bay stands **west of the lift** and the rest
run east of it. Three bays is the right shape with the lift at one end —
you step out facing Operations and the whole floor is in front of you — and
a fourth stops it being true, since the far room is then four doorways off
with nothing at your back and half the corridor is a walk rather than a
place. With a wing there is work off both hands, and the two rooms nearest
the lift are a pair facing each other across it, one up and one down.

One bay and no more: a second would put the lift back in the middle of a
walk from the other end. Everything else is asked of the layout rather than
of the room list, which is why `opsOperations` exists — Operations is the
first room on a floor with no wing and the third on one with, and every
caller used to take `opsRooms(rooms)[0]`.

**A room is seventeen tiles wide, and the three it gained were the lower
rank's doorway.** Upstairs a room hangs its boards on the map's top wall and
its doorway is cut through another wall entirely, so the two never meet.
Downstairs they share one: the doorway is a hole in the same run the board,
the name and the counts want. At fourteen there was no room for all four and
the counts ran straight through it — five tiles starting at nine, a doorway
at eight — which draws perfectly and is only visible from inside the room.
Three more tiles is exactly what `BOARD_WALL` needs to put a clear tile
either side of the doorway, and the corridor is that much longer per bay,
which is the floor doing what it is built to do. `floor.test.ts` holds
everything on a lower room's wall to being clear of that room's doorway.

How many is per building: `projects` on the tenant (`lib/world/tenants.ts`),
counting the rooms besides Operations itself. **That number is in the map's
file name** — `floor-ops-trello-zoho-8-flow5.json` — because the boards alone
no longer identify a floor: two buildings with the same boards and different
numbers of projects are different floors, and sharing a file would give one
of them the wrong corridor. The `-flow3` on the end is the same argument
about the project rooms below: each hangs a board and a plate of counts, so
a floor with three of them is not a floor with one.

**A project board is a room, not a choice.** `boards` on the tenant names
them in the order their rooms run, which is **outward from the lift**: the
first has **Operations**, the room above the lift and the one you step out
facing, then the wing where there is one — upper room, then lower — and then
the lower rank east, left to right. Each room gets the board in the left-hand corner of its
wall, **the board's name lettered in the middle** and its five stage counts running to
the right-hand corner — the same arrangement as Support's, which is what
makes the corridor readable: the work on the left of every doorway and the
numbers on the right of it, whichever room you look into.

It replaced a single wall with a picker on it. One board could be shown at
a time, whichever the office had last chosen, and choosing chose for
everybody — so "what is on the go" was a question you answered by standing
at one wall and cycling. Three of them in three rooms is the same
information laid out as a place, which is what this app does with
everything else.

Three things follow, and the first is the one that would go wrong quietly:

- **The room's own board wins**, over `TRELLO_BOARD_ID` and over anything
  picked on a wall (`boardInRoom` in `lib/server/boards.ts`). A room that
  deferred to an office-wide choice would be the one switching wall again,
  wearing three doors. The pick is only consulted where a building names no
  board at all, which is Castle Atlantic — one unnamed board, a picker on
  it, and nothing counted beside it, exactly as every floor was before. A
  room asked for a board it does not hang answers 404 rather than falling
  back to the pick, and the list to pick from only comes with a picker wall.
- **The lift's room hangs nothing.** The car is three tiles tall and hangs a
  tile below the cap of the lower wall, which is the first lower room's own
  wall face — so a board on the left of it is a board with a lift drawn
  across the end. It is skipped for the same reason it is not Support, and
  `opsProjectRooms` asks `opsElevator` rather than writing down "not the
  first lower room". `roomsForBoards` is how many rooms a given number of
  them wants, and it is **searched against the layout rather than worked
  out from it**: three rules decide it — Operations, then the wing, then
  the lower rank east — and the wing only appears past a certain length of
  corridor, so arithmetic saying the same thing is arithmetic that
  disagrees with the rooms at the boundary. `operationsRoomCount` grows
  the floor to that rather than leaving a board with no wall, and a board
  with no wall draws perfectly.
- **The browser never names a board.** The map letters its points of
  interest `Project board 2` / `Project flow 2`; the number is the
  **subject**, captured by the fixture's own `match` and carried on its open
  event (see **Fixtures**), and the panel asks `?room=…&slot=2`. A slot is
  geometry — the map is shared by every building with this many boards —
  where a board name is the tenant's, and a request that named one could
  name any board the token can see.

**The lift is set into the lower wall, directly beneath the door to
Operations**, which on a floor with a wing is a bay in from the west end and
on every other one is the end of the corridor. The ride has to land you
somewhere that says where you are, and Operations is the room the floor is
named after — so you step out facing its door. The two doorways in a bay are
at different offsets, and it is the walls rather than the look of it that
decides them: the upper rank's is a hole in a wall with nothing else on it,
so it sits where it always did; the lower rank's goes where `BOARD_WALL`
leaves room, between the board's name and the counts. They come out far
enough apart that two rooms facing each other do not line their doors up
into what reads as one wide gap, and the lower one never lands on the lift.

**The floor's name is centred on the stretch of wall it is written on.**
The corridor's upper wall is the one face anybody on this floor sees a
whole run of, and every doorway is a hole in it — so "the wall" is a
stretch between two doorways (`opsWallRuns`), not a room's frontage. The
name used to be centred between Operations' doorway and Operations' own
right-hand edge, which is an edge nothing in the corridor can see: the wall
carries on past the divider between the bays to the next doorway along. It
sat a couple of tiles to the left of the middle of what it was written on,
with nothing in the room to line up with and nothing to explain why.

**The desk's week is lettered on the wall outside Support** — two counts
and the net between them, `opsWeekCounts`, on the stretch that room
fronts. Support's own wall is
full (the queue, the five counts, the room's name) and the plate is five
tiles with two rows on it, so a third bank would take every figure down a
size to make room for one nobody asked the wall for. Outside is where there
is room, and it is not a consolation: the numbers hang on the face the
floor writes its own name on, so stepping out of the lift says where you
are and how the week has gone in two glances.

**And last week beside it, on the next stretch along** — `opsLastWeekCounts`,
the same three figures over the week before. A week of traffic says very
little on its own: twelve raised and eleven closed is a good week or a quiet
disaster depending on what the week before it did, and the wall is where
somebody is standing when they ask. Two blocks side by side is that
comparison made by looking, rather than by remembering what the wall said
last Friday.

Three things about the pair:

- **The next stretch, not the one before**, so the corridor reads away from
  the lift as it reads back in time: the floor's name, then this week, then
  last. A stretch of its own rather than six figures crowded onto Support's,
  which is the argument that put the week out here in the first place.
- **Both are headed now** — `THIS WEEK` and `LAST WEEK`, lettered over the
  middle of each — because the headings under them are the same two words on
  both blocks. Which is why the counts are `OPENED` and `CLOSED` rather than
  `OPENED WEEK` and `CLOSED WEEK`: the block says which week, and a heading
  that says it too says it in the place with least room.
- **One `DeskWeek` draws both**, so the wall is one read on one timer. Two of
  them would ask the room's own server the same question twice a minute and
  let the halves of one row of lettering fall out of step. The plate inside
  Support shares that read too (`readDesk` in `systems/SupportPulse.ts`), so
  the floor asks for the pulse once a minute rather than twice. `last` is null on
  a floor of three or four rooms, where Support fronts the last stretch there
  is, and this week has the wall to itself exactly as it did before.

A line of lettering may be several things side by side, which is what the
blocks are made of: `letterOnWall` takes a heading over each of three
figures as **one line** rather than three, measured at the tallest thing on
it. Three separate calls would have laid three blocks of one column each and
left a row of numbers reading as three things that happen to share a wall.

Painted rather than plated, which is the whole difference from the plate
inside — no bays, no bars, the wall's own two colours, and no flash on a
number that moved. Paint does not change while you watch it. `DeskWeek` in
`systems/SupportPulse.ts` is the drawing; it keeps a timer, so it hands back
a teardown like the boards do.

**The middle figure is the two of them subtracted**, and it is the one
thing on the wall with a colour: red where the week put the desk deeper in
than it started, green where it saw off more than it took on, and the
wall's own ink where it came out level. `weekNet` in `lib/zoho/pulse.ts` is
the arithmetic and the lean, asked of either week by its `WeekBank` — the
ids are `opened-${bank}` and `closed-${bank}`, so the two blocks cannot
drift apart and a third week would need nothing there; `NET` in `SupportPulse.ts` is the two colours,
both at the weight of the ink beside them rather than the HUD's warning
colours — this is paint on a wall next to the floor's own name, and a
`#ef4444` up there reads as a light somebody switched on.

It is **not a `PulseMetric`**: nothing counts it, so there is no sweep
behind it, no bay for it on the plate and nothing for the panel to show. It
also **answers a dash where either week sweep was capped**, which is the
reason the subtraction is a function rather than two numbers taken away at
the call site. A capped count is a floor rather than a total, so a net off
one is not even a bound in a known direction — capping the opened sweep
hides tickets that would push it up and capping the closed sweep hides
tickets that would pull it down, and the wall would letter a confident
`-3` for a week that ran the other way.

**Lettering painted on a wall is centred on the wall.** `letterOnWall` in
`components/game/utils/wall-lettering.ts` is the one rule, `paintOnWall`
beside it makes the text it is applied to, and every painted thing goes
through the pair: the building's name and the line under it,
`SUPPORT`, the name of the board in each project room, and the week's three
headings and figures. Each used to hang off
a fixed pair of offsets — a bottom edge at 92 and a top edge at 100 — which
put the block a good twenty pixels low in a band of a hundred and
forty-four, and on the corridor wall, where the paint is the only thing on
a long clear stretch, that read as lettering sliding off the bottom of the
wall. The block is **measured** rather than worked out, because the second
line of a building's name wraps on the longest of them — "Building Supply
Warehouse" is two lines where every other name is one, and a block centred
on an assumed height is centred for one of the two. `WALL_ROWS` in
`lib/map/office.ts` is how deep the band is, read off the wall vocabulary
so the floor's row arithmetic and the lettering cannot disagree about it.

This is not `utils/signs.ts`, which is the opposite kind of text: a sign
floats above the world on a chip with an arrow over it and grows as the
camera stands back. Paint is sized to the wall and left alone — see the
in-world lettering rule under Conventions.

Two floors get nothing, and the desk keeps its five counts on both: one of
one room, where Operations and Support are the same room and the name
already has that wall, and one of two, where Support is in the lower rank —
whose wall is the lift's and its own boards'.

**The project board hangs in Operations; the support queue hangs in
Support.** A board is a picture of the work it stands for, so the room it
hangs in is what the room is for — and the queue is the one board that names
a job somebody does rather than a project everybody watches. Support is the
second working room, the one Doc works in, and the queue and its counts have
that wall: `opsSupportRoom` and `SUPPORT_BOARD` in `lib/map/floor.ts`.

That room is lettered `SUPPORT`, on its own wall (`opsSupportSign`, drawn
by `addSupportSign`), and every project room is lettered with the name of
the board hanging in it (`opsProjectSign`, drawn by `addProjectRooms`) —
both in `systems/OperationsFloor.ts`, which holds everything this floor
draws, with one check for what kind of floor it is and one teardown.
Nothing else on the floor is named and nothing else needs to be. A building
running no support queue has no such room and gets no sign, which is Castle
Atlantic — and one naming no board letters nothing either, since PROJECT
BOARD over a project board says less than the sign already on it.

**Fourteen tiles of wall, three things on it, and the layout written down
once** — `BOARD_WALL` in `lib/map/floor.ts`, for **both** kinds of working
room, because Support and a project room are the same arrangement. **Both
pictures go hard into their corners** — the board into the left, the
counts running to the right — and the room's own name has what is left
between them, drawn at the size the building's name is drawn downstairs.

**And the plate takes every tile nobody else asked for**, which the board
does not: six columns rather than five, running from what is next along —
the doorway downstairs, nothing at all upstairs — to the right-hand
corner, and the whole depth of the wall rather than two rows of three. A
board is a picture and is as big as it is drawn; a plate is a screen, and
how big it is is how readable it is, so of the things on this wall it is
the one to give the spare tile and the spare row to. That tile used to sit
clear between the doorway and the plate, which is a gap rather than a
margin: nothing on either side of it wanted it.

Where the picture goes inside that footprint is `WALL_FACE` in
`lib/map/office.ts`. A wall in this tileset is not a flat colour — the cap
carries a cornice, eighteen pixels of it, and the base ends in the three
pixels of shadow it throws onto the floor — so the band and the face are
different things, and a plate drawn on the band covers the cornice and
reads as poking through the ceiling. `systems/CountBoard` insets to the
face; the map carries the band, because the band is what is solid.

Flush rather than a couple of tiles in, because two tiles of clear wall to
the left of a board is not a margin, it is a gap: from the corridor the eye
has the doorway's edge to compare it against, and a board that starts short
of the corner reads as having drifted off the end of its wall. Flush, every
working room along the floor opens at the same place.

And the name is the middle of **what is left**, not the middle of the wall.
Those were the same tile while the board started two in, which is why one
number stood for both; with the board in the corner the clear stretch runs
from tile 3 to tile 9 and its middle is a tile to the left of the wall's.
The gap's middle is the one that matters — a name is only the room's if it
is lettered on wall rather than across a picture — and centred on the wall
it would have crowded the counts. It was two layouts saying the same thing in two constants
(`SUPPORT_WALL` and `OPS_WALL`), which is how one of them would have come
to disagree with the other about a wall the corridor sees both of.

**And the gap is measured rather than declared,** which is what `NAME_COLS`
was: a band four tiles wide, hard against the board, centred on itself.
That is the middle of the gap only where the gap happens to be four tiles
— and the two ranks do not agree about it, because they are looking at
different walls. Upstairs the boards hang on the map's top wall and the
doorway is cut through another wall altogether, so the stretch runs the
whole way from the board to the counts: nine tiles, middle at 7½.
Downstairs all four want one run and the doorway takes the right-hand end
of it: six tiles, middle at 6. The fixed band put both of them at 5, so
every project room lettered its board's name a tile to the left of the
clear wall it was written on, with the doorway's own edge beside it to
compare against. `nameRun` is the stretch and `signOn` is its middle, and
the scene wraps the lettering to what `cols` says it has. `DOOR_AT` was
worked out _from_ the name band, so it now says what it always came to on
its own terms: hard against the counts. It has not moved through any of
this — when the plate took the clear tile beside it, the plate grew a
column westward and the doorway stayed exactly where it was.

**The whiteboard is next door** — `opsWhiteboardRoom`, in the **left-hand
corner** of that room's wall, where every other board on this floor starts
(`BOARD_WALL.board`). Nothing else is on that wall to force it
anywhere, which is the argument for putting it where the eye already looks:
centred, it was the one thing along the corridor that lined up with neither
the doorway before it nor the one after, and it shares the room with the
boardroom table, so a board floating in the middle of a bare wall above a
table gave the room two centres. It used to have Support's wall too,
which left the name two tiles and twelve pixels to fit them, and a letter of
it behind the board's frame. It is also the only board on the floor that
stands for nothing in particular, so of the four things wanting that wall it
is the one to move; the empty room to the right of Support is where it went,
and a building running no queue keeps it where it always hung. Its point of
interest is the board's right-hand tile, so the sign over it carries a nudge
of **half a tile** — half the board's _width_ is what that was, which hung
the sign and its bobbing arrow a whole tile off centre in a lobby.

**The far room at the top is the boardroom**, and the table in it is the
one fixture on this floor that is furniture rather than a picture on a
wall. `opsBoardroom` is the room — the end of the upper rank, as far from
the lift as the floor goes — and `opsBoardroomTable` is where in it, read
off the room so a longer corridor carries the table with it. It shares the
room with the whiteboard, which is the point rather than a collision: a
table to sit round and a board to draw on is a meeting room.

Every Operations floor has one, which is what keeps it out of the map's
file name: a floor with rooms to hold meetings in and nowhere to hold one
is the odder answer. On a short floor the far upper room is Operations
itself, exactly as the whiteboard's is.

Two details, and the second is the one to know. Its point of interest is
the tile **below** the table rather than under the middle of it — a board
is a picture you stand in front of, a table is furniture, and standing
inside one is not a thing anybody does. And the reach is
`TABLE_INTERACT_DISTANCE`, not the tile and a half every other fixture
uses: five tiles of table is something you walk up to anywhere along its
near side, so a reach that only covers the middle leaves the two ends of
it as furniture you cannot use.

**A meeting is a fact about a room, and the people it is news to are
somewhere else.** Press E at the table and the panel starts one or ends the
one that is running; everybody who could walk into that room is shown a
pill in the bottom bar saying so, wherever in the world they are standing.

| Where                          | What it does                                                            |
| ------------------------------ | ----------------------------------------------------------------------- |
| `components/hud/Boardroom.tsx` | The panel at the table: what is on, who is in the room, start or end it |
| `lib/meeting.ts`               | The browser's side — the list, and the two words it sends               |
| `presence-socket`              | Who is holding one, who is told, and when it ends                       |
| `BottomBar`                    | The pill, for everybody who is not in the room                          |

Five things about it are decisions rather than mechanics:

- **The notice crosses rooms, and stops where the floor's door does.** It
  is filtered per connection by `mayEnterRoom` — the same rule that
  refuses the join — so a meeting on a floor somebody cannot ride to is not
  news they are entitled to. Server-side, for the reason every other
  private-floor check is: what the browser is told is the only part that
  holds. Hunter is the case that proves it, since he rides one building's
  lift and it is not this one.
- **The whole list every time**, like `online` rather than like a start
  and an end. A browser that missed one message is otherwise left with a
  notice that will never come down.
- **The browser never names the room.** `{ type: "meeting", on }` and
  nothing else: the room is the one that connection walked into, and where
  somebody is standing is the server's to know. The socket also refuses a
  meeting in a room with no table in it (`hasBoardroom`), because
  `?meeting=1` opens the panel anywhere and a panel is decoration.
- **Anybody at the table may end it, and an empty room ends it by
  itself.** Whoever called it may close the tab, time out or ride away and
  the meeting carries on without them — which is what a meeting does — but
  when the last person leaves, the notice would otherwise hang over the
  building for as long as the server runs, and the floor is private, so
  there may be nobody left who can reach the table to take it down.
- **In memory, not in the room store.** A meeting is something happening
  rather than something kept, and a server that restarts has ended every
  meeting it was hosting.

It is a notice rather than a way in: walking to the lift and going up is
how you join, which is how everything else in this world works. And it is
not the voice chat — that is already one conversation for the whole server,
and switching a microphone on is how you join that. This says a meeting is
happening here, which is the part somebody three floors down has no way of
knowing.

`PartitionSpec` (`lib/map/spec.ts`) is how a room gets interior walls, and
each is drawn as **the exterior wall of the same orientation** — a horizontal
one is the cap/face/base stack with its shadow, so the corridor looks at a
wall face exactly as a room looks at the top of the map. An earlier attempt
used `bottomRun` and the dark `edgeLeft`/`edgeRight` columns, which are right
at the edge of the map with the void beyond them and read as a chasm in the
middle of a room.

A doorway is a gap in the run, and `solidRuns` subtracts them. That is the
part worth a test: a wall with no gap is a room nobody can enter, and it looks
perfectly correct on the map. `floor.test.ts` floods the floor from where the
lift puts you and insists every walkable tile is reached, and that the middle
of every room is among them.

Each board keeps its own place along the wall whether or not the others are
there, so a building with one has a gap rather than a board in the wrong
spot. The map is named by the boards rather than the building —
`operationsMapFile` in `lib/world/floors.ts`, giving
`floor-ops-trello-4.json` and `floor-ops-trello-zoho-8-flow5.json` — so two
buildings running off the same boards, with the same number of rooms and
project boards, share one map and a third needs no new file.
`pnpm build:map` writes one per set actually in use, read off `TENANTS`.

The `?project=1`, `?flow=1` and `?desk=1` query parameters open a panel from
anywhere, which is a development shortcut rather than a way into the room:
what is on the wall is what the floor's map carries. A link names no point of
interest, so the two project panels open on the first room's board — the
building's own, in Operations.
