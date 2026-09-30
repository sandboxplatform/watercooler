# The production line

The six things standing on a project room's floor, and the Trello arithmetic behind them. Moved out of CLAUDE.md so it is read when the work needs it rather than in every session.

**Five things stand in a row across the middle of the floor, in the
order those things happen to work.** A rack of work refined and waiting, a
machine making it, a roadblock it stops at, a rig checking it, the crates
it goes out in — a production line, laid out left to right the way the
pipeline runs, with the number each one is about on a plate over it. So a
project room is read **along** rather than looked round: work waiting,
work being made, work stuck, work being checked, work gone, in that order,
from the doorway.

They stood apart before there were three of them, each in the one place
that said the most about it on its own — the barrier in the middle
because being in the way is the whole fact about it, the crates in the far
corner because being finished with is the whole fact about them. The
barrier has not moved; the line was laid out around it. **Right against
each other, with no floor showing between**, so the row reads as one belt
running across the room rather than as things sharing it — it was two and
a half tiles apart, and three before that, and the daylight between each
pair was the only thing in the picture the eye had to measure by. **The
step is measured off the widest adjacent pair and is written in pixels for
it**: the plank, the lower crate and the rack are ninety-six apiece, the
machine's belt and the rig's beam a hundred and four, so every neighbouring
pair wants a hundred pixels between centres. A flat two tiles was tried and
is four pixels short — the belt runs under the barrier's near leg, which is
what an overlap looks like at this size.

**The row alternates on purpose**, 96, 104, 96, 104, 96, so that every seam
along it closes to nothing. The crates used to sit four pixels off the
barrier, being the narrower of that pair; their neighbour is the rig now,
and the gap has gone. Which makes the rule a new picture is under not "no
wider than the widest" but **no wider than the step less half of each
neighbour** — the rack may be ninety-six and no more, because the machine
beside it is a hundred and four. `opsLine` in `lib/map/floor.ts` is the
spacing, written once, because the first edit to one of five separately
worked-out coordinates is a line with a kink in it that nothing but
standing in the room would catch.

**Three of them are stages the wall gave up.** Refined, In Progress and
Testing come off the plate when they stand here (`wallLanes`), because a
bay and a station saying the same number six feet apart is one count
printed twice. So Sandbox ERP's plate letters Backlog and In Review, and
the floor carries the three stages work actually happens in — which is a
sharper division than five bars three of which happen to have something
standing under them.

**And nothing on the line is in the map.** These are points the scene
stands a picture on, not footprints: no station is solid and a person walks
through every one of them. So moving one, or adding two, is not a
`pnpm build:map` — and no test can catch a station in the wrong place by
flooding the floor, which is why the fit of this row is settled by standing
in the room and why `floor.test.ts` asserts every gap along it rather than
the first.

**A line across a room is in front of whichever door you come in by, and
that is what a line is.** The barrier was moved out of the upper rank's
doorway on its own account, and five of them spanning the middle cannot
be anywhere else — the upper rank's doorway looks onto the head of the
line and the lower rank's onto its far end, whatever the spacing. Which is
the right way round now: what you are looking at is no longer one object
standing where you wanted to walk, it is the room's work laid out in
order.

The incident beacon is the sixth thing on this floor and the one **off**
the line, which is what it is: see below.

**A rack of blanks at the head of it, for the work that is refined and
waiting.** Stock cut to spec, standing in a three-course rack with the
machine next along waiting to take it — which is what the stage before In
Progress is, and the one station on the line that is **doing nothing**.

The stillness is the fact rather than an omission. Two of the five things
here move, because something is being done at both; nothing is being done
to this, and a line where everything moves is a line where nothing in
particular is happening. It is also what makes the other two legible.

**It is the machine's own feedstock**, and that is a fact about the numbers
rather than a resemblance: a blank is twelve by nine, which is `PART_W` by
`PART_H` in `systems/Machine` — the identical object that rides the belt a
hundred pixels to the right. Blue blanks stand waiting, purple parts come
out on the belt, and what happens in between is the housing.

**Deliberately not a stack of boxes**, which is what was asked for. The
crates are two closed boxes on a pallet with a lid and straps, standing
four stations along the same row, and the test of this line is that a
stranger can name each station from the doorway — silhouette is what
carries down a corridor where colour is what carries across a room. A
rectangular rack with horizontal courses showing through it shares nothing
with a stepped pyramid of lids, while saying the same thing about the same
kind of object: material, stacked, waiting. It is the "or something".

**And it rakes toward the machine** — six blanks, then five, then four,
all flush to the left, so the right-hand end steps down twice in the
direction the whole row reads. One still gesture doing the work an
animation would otherwise have to do, and it costs nothing: the counts
_are_ the rake, so there is no second set of coordinates to keep in step.
It also keeps the rack off being a symmetrical ziggurat, which is the
crates' family and the one shape it must not be.

| Where                    | What                                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| `countUnblocked` in flow | The declared lane, less what is roadblocked in it — for all three      |
| `opsRefined` in `floor`  | The head of the line, read off the room like the other four            |
| `systems/Refined`        | The rack, the rails, the blanks and the cut edge along the top of each |
| `systems/FloorMarker`    | The plate, the figure, the timer, the beat — for all six of them       |

**A machine second along it, for the work in hand.** The first thing in
the room that moved, and one of the three stations that are **stages** —
read off the lanes the building declared rather than off the whole board,
because unlike the barrier, the crates and the beacon these three are
lists on it.

What the wall cannot do is move. A bay draws exactly the same picture
whether the room is turning work out or sitting on it, and a number is a
number whether it has been that number since March or has changed twice
this morning. A machine running says work is happening here rather than
reporting how much of it there is, which is the thing a bay cannot say
however large it is drawn.

**So the wall has stopped lettering it** — and has since stopped lettering
the two stages either side of it. Each had a bay and a station both, which
is one count printed twice six feet apart, and of the two the bar was the
one saying less. `wallLanes` in `lib/trello/flow.ts` is the rule: the plate
letters the stages work **waits** in and the floor carries the three it
happens in. Sandbox ERP's is therefore two bays in one row, which is what
the plate being given the whole depth of its wall has to carry now.

**And each of the three is that lane less what is roadblocked in it**,
which is what keeps the row from counting a card twice. The barrier stands
in the middle of the line and counts a stuck card wherever it is standing,
so three of Hammer Time's nine In Progress cards were being counted by both
of them — the row said twelve where the board said nine, which is exactly
what a line laid out in the order work happens exists not to do. The
machine reads six. **The station gives way rather than the barrier**: being
stuck is the whole fact about a stuck card, where the lane it stopped in is
an accident of how far it got, and what a station is there to say is that
something is _happening_ to the work. `countUnblocked` is the rule, and it
is owed to all three — a card stuck in Refined or in Testing is the same
card under two things in the same row.

**A roadblock is the only thing on this floor the subtraction is owed to**,
which is why nothing like it is subtracted for the beacon or the crates.
Server Incident and Production are **lanes** — a card in either has left
all three of these stages, so no station was ever counting it and there is
nothing to take away; a card in Refined carrying a Server Incident label is
legitimately counted by both the rack and the beacon, which is two true
facts rather than one card twice. A roadblock is not a lane: it is a status
a card carries **while it stands in a stage**, which is what puts one card
under two things in the same row.

The **lane's own count is untouched**, which is the other half of it: a bar
is that stage's share of the work in flight and a stuck card is still in
flight, which is the whole reason `blocked` is not a bay of its own. So the
panel behind the wall goes on saying how many cards stand in each list, and
says in a line why the things on the floor read fewer — two numbers about
one list differing by three is the sort of thing somebody walks up to the
wall to ask.

Two things about the wall. Lanes are taken off it by the **name**, not by
asking which lists the board has got: a list that has been archived is no
more the wall's business than one that is there, or losing it would put the
bay back. And the bars are untouched — still each lane's share of every
lane declared (`flowBars`), so the part of the plate left bare is what the
three stations are holding. The panel behind the plate still lists all
five, because it is the detail and the detail is where the three stages
that have left the wall are answered.

| Where                    | What                                                                             |
| ------------------------ | -------------------------------------------------------------------------------- |
| `countUnblocked` in flow | The lane, less what is roadblocked in it. Pure, over the board `readBoard` holds |
| `opsMachine` in `floor`  | Second along the line, read off the room like the other four                     |
| `systems/Machine`        | The housing, the hopper, the press portal and the belt under it                  |
| `systems/FloorMarker`    | The plate, the figure, the timer, the beat — for all six of them                 |

Five decisions in it:

- **Two things move and no more**: a press that strokes, and parts riding
  the belt out of the machine toward the rest of the line. Both are work
  being done. Nothing flashes, nothing breathes and no light comes on —
  the rule `CountBoard` is under, and this is a room where an actual fault
  has a beacon of its own.
- **The press is phased to the belt**, so a part is under the head when
  the head comes down — worked out from the constants rather than written
  down, because a stamp landing on empty belt is what the first change to
  how fast the line runs would otherwise produce, and only standing in the
  room would catch it.
- **A part fades in at one end of the belt and out at the other.** The
  three of them are the same three going round for ever, which is honest
  enough for "work is being done here"; a box vanishing off the right and
  reappearing on the left in the same frame is the one thing in the
  picture that would read as the drawing being broken.
- **Narrow, like the incidents.** All three of the building's boards call
  the list **In Progress**, so what is folded in is the few ways anybody
  writes the one stage down. Not In Review, which is a stage where work is
  looked at rather than made and has a bay saying so — nor Testing, which
  is looked at too and has a station of its own further along.
- **Three tones, which is the crates' argument.** The plate is the HUD's
  own dark with a coloured edge, so a machine drawn the same way read as
  the plate's own pedestal — one dark silhouette next to a barrier in
  hazard stripes. It is a shade lighter than the plate, the frame under it
  a shade darker again, and the purple is kept for the parts and the
  rollers. Drawn once as a wide box with a gantry tucked under the plate,
  it read as a desk with a monitor; the hopper and the press portal are
  what make it a machine, and nothing in it hides behind the plate.

Nothing is up when nothing is in hand, which is the rule all six are
under.

**A roadblock stands on the floor, and that is the point of it.** Work
that has stopped is the one thing about a board nobody goes looking for
and everybody needs to know, and the counts on the wall cannot say it: a
stuck card is still standing in a stage, so a board in trouble and a board
getting on with it draw the same bars. Another bay would have read as more
of the same. So it is not on the wall at all — it is a
striped barrier standing in the middle of the room's floor, with the
number of stuck cards on a plate over it. Walking the corridor past three
rooms says which of them is in trouble without going in, and standing in
the room you cannot look at the board without it in shot.

**The middle, rather than in line with the doorway,** which is where it
stood first. Lined up with the door it was a thing to walk round on the
way in, and off to one side of a room whose every other feature is on the
wall opposite — so the room had the barrier in one corner of the eye and
what it is about in the other. The middle is the one spot in an empty
room that belongs to the room rather than to one of its edges, it is the
same answer for both ranks, and it is in shot through the doorway either
way. The middle column of seventeen is a half tile, which is exact rather
than awkward: the marker is drawn centred on the point, and it stands on
the bottom of its row, so its feet land a shade below centre — which is
where a thing that stands up looks centred from.

It stands there still: the line was laid out around it rather than the
other way about, and it is the middle of five now rather than of three.
What it has either side of it is what work looks like when it is **not**
stuck — being made on one hand, being checked on the other — which is the
comparison the barrier was making on its own and had nothing to make it
against.

It is also the only station on the line that is **not a stage**, which is
what the three that are give way to: a card stuck in Refined, in progress
or in Testing is counted here and not there.

| Where                       | What                                                                       |
| --------------------------- | -------------------------------------------------------------------------- |
| `countRoadblocks` in `flow` | What counts as stuck. Pure, over the board `readBoard` already holds       |
| `opsRoadblock` in `floor`   | Where it stands, read off the room so a longer corridor carries it         |
| `systems/Roadblock`         | The barrier, the figure on it, and the flash when the figure moves         |
| `systems/room-flow`         | One read for the room: the counts on the wall and the barrier on the floor |

Five decisions in it:

- **A board says "stuck" in two ways and both count.** A label on the
  card, or a list of its own with the cards parked in it — neither is
  more correct than the other, and a board that uses the one this did not
  know about would quietly read zero, which is the worst answer there is
  here. A card doing both is one card: the count is of cards, not of the
  ways a board found to say so. Matched on the folded name, so
  Roadblock, Roadblocked, Blocked and Blocker are one word. Deliberately
  **not** On Hold, which is a decision somebody made rather than a thing
  in the way.
- **Counted off the whole board, not off the declared lanes.** A card is
  stuck wherever it is standing, and a lane nobody put on the wall is
  exactly where one would go to be forgotten about. So it is not a share
  of `total` either, which is another reason it is not a bay. It is also
  why the three stages standing on the line each give way to it, rather
  than the other way about — see `countUnblocked`.
- **Nothing is up when nothing is stuck.** A barrier reading 0 is a
  barrier somebody has to walk round to find out there is nothing wrong.
- **One read for the room.** The plate on the wall and the barrier on the
  floor are the same fetch — `systems/room-flow` holds an answer for a
  moment so the second asker gets it rather than the network. Short on
  purpose: it is the width of the gap between two timers started in the
  same tick, not a second opinion about how fresh the wall is.
- **One beat when the number moves**, and no animation otherwise — the
  rule `CountBoard` is already under. Hazard orange in a room of muted
  blues is what makes it carry down the corridor; a thing that pulses
  while you watch it reads as a fault.

It is drawn rather than delivered as art for the reason the two count
boards are: the figure on it is live, and a picture with a number baked
into it is a second, wrong copy of the number. The stripes are laid a
pixel row at a time, which is both the clipping and the staircase a
forty-five degree diagonal is in pixel art.

**A rig past the barrier, for the work being checked.** The fourth station
and the second of the two that move: a panel clamped on a bench with a
carriage crossing it on an overhead rail, dipping a probe onto the work at
each end of its run. It stands where the board has it and where a factory
has it — made, stuck, checked, gone.

**It is the machine inverted, and that is the whole design.** At the
machine the frame is fixed and the _work_ moves: parts ride the belt out
from under a press that stamps at one spot. Here the work is held still and
the _machine_ moves over it. That is the difference between making and
checking said as motion rather than as a caption, and it is why this is a
gantry rather than a scanner arch with work passing under it — an arch
would be the machine's belt drawn a second time a hundred pixels away,
which is the one thing a stranger would notice first. Side by side the
silhouettes share nothing: the machine is lumpy and asymmetric, a hopper up
one end and a portal the other, with everything happening at the bottom of
the picture; this is a clean rectangle with everything happening at the top.

| Where                    | What                                                             |
| ------------------------ | ---------------------------------------------------------------- |
| `countUnblocked` in flow | The declared lane, less what is roadblocked in it                |
| `opsTesting` in `floor`  | After the barrier and before the crates, read off the room       |
| `systems/Testing`        | The bench, the clamped panel, the gantry and the carriage on it  |
| `systems/FloorMarker`    | The plate, the figure, the timer, the beat — for all six of them |

Four decisions in it, and the first two are the machine's own rules
applied a second time:

- **Two things move and no more**: a carriage crossing the work, and a
  probe touching down on it. Both are inspection being done. Nothing
  flashes, nothing breathes and no light comes on — the rig has no lamp,
  and this is a room where an actual fault has a beacon of its own.
- **The touch is phased to the traverse**, so the probe is at the bottom of
  its stroke at the instant the carriage reaches an end — computed from the
  constants in the same two lines `PRESS_DELAY` and `PRESS_WAIT` are, and
  for the same reason. The failure when somebody retunes a number is a
  gauge taking its reading on the fly, half way along the panel, at full
  speed, which nothing about the room being right would catch. It survives
  a change of ease, too: it uses only where the carriage is at the start
  and the end of its run, and an ease changes the path between two
  endpoints rather than the endpoints themselves.
- **`Sine.easeInOut` rather than the belt's `Linear`**, because a gantry
  has mass: it accelerates off each end and eases into the next, where a
  belt runs at one speed for ever. It is also what makes the touch honest —
  the carriage covers about a pixel over the whole of the stroke, so the
  probe reads as stopping to take a reading rather than being dragged
  sideways with its tip in the work.
- **The quill and the tip ride in a sub-container** and the carriage does
  not, so one tween crosses and a second drops only the probe. Tweening the
  whole carriage downward would take its head four pixels off its own
  guideway on every stroke, which is a carriage coming loose from its rail.

**Yellow, and its lane with it.** The rig and the Testing lane in the
panel behind the plate are the same stage, so they are the same colour —
the last of `FLOW_COLOURS`, which was green and is yellow now. Yellow sits
between the barrier's orange and the crates' green, which is where checking
is: past the thing in the way, short of gone. The green it gave up is the
crates': see below.

**And crates at the end of it, for the work that has gone out.** The
roadblock's opposite number, and it exists for the opposite half of the
same silence: the bays say where the work in flight is standing, so a
board that shipped nine things this month and one that shipped none draw
the same bars. A card that has shipped is not standing in any stage at
all, which is why this is no more a bay than the barrier is.

Where it stands is half of what it says: the **far end of the line**, the
end of the pipeline at the end of the row. It stood in the far corner of
the floor before there was a line to stand at the end of, diagonally
across from the board it came off — which said "out of the way" and
nothing else, where the end of a line says what it is the end _of_.

**Green, and off the flow plate's scale altogether** — `FLOW_COLOURS` ends
in Testing's yellow, so this green is on none of the lanes. It has been
green before, borrowed from the plate's last bay while the scale ended
there; then Testing came off the wall to stand on this line and **owned**
that green — a lane's colour is assigned by position and the panel behind
the plate prints it, so the station and its own lane answering differently
would be the same board read twice — and the crates went brass to stay out
of its way. Testing is yellow now and its lane with it, so green is
nobody's lane and the crates have it back without being painted in a
stage's colour.

That keeps the beacon's rule, which is the one to hold to: the station that
was never a lane is lit in a colour none of the lanes use. Green rather
than anything else because it is what done is everywhere else in the HUD —
a finished card's due date, the shipped line in the panel's legend — and
it is not the beacon's red, so it is not a second alarm. If green ever goes
back onto the scale, it is the crates that move again, not the lane.

| Where                     | What                                                                    |
| ------------------------- | ----------------------------------------------------------------------- |
| `countDeployed` in `flow` | What counts as gone out. Pure, over the board `readBoard` already holds |
| `opsDeployed` in `floor`  | Where it stands, read off the room so a longer corridor carries it      |
| `systems/Deployed`        | The pallet, the two crates, and the word stencilled on the lower one    |
| `systems/FloorMarker`     | The plate, the figure, the timer, the beat when it moves — for all six  |

Four decisions in it, and the first is the one that would have shipped a
feature nobody could see:

- **The word is folded, and the net has since been proved right.** It was
  written because Sandbox ERP's three boards spelled it two ways — Hammer
  Time and the Reports App kept a **Deployed** list and the board named
  after the building itself called the identical thing **Production** — so
  matching the first word only would have drawn a bare corner in the
  building's own Operations room with fifty-odd shipped cards on the board
  behind the wall. The other two have since been **renamed to Production**,
  and the net is what made that a non-event: a rule holding one word would
  have emptied the crates out of two rooms the afternoon somebody retitled
  a list, with nothing wrong with either board. Three boards agreeing today
  is not a reason to narrow it — it is the reason not to.
- **A list the wall already counts is never a despatch**, and that guard
  is what makes the wider net safe. There is no writing down which words
  are despatches and which are working stages — "Production" is where
  finished work sits on one board and could be where work is _made_ on
  another — but the building has already answered by declaring its five,
  so a list it counts is a stage whatever it is called — the **declared**
  lanes, note, not the ones the plate letters, which stopped being the same
  set when three of them went onto the floor. Deliberately not **Done**
  either: that is the stage before this one, and it is the same word
  `isTesting` refuses for the same reason.
- **Nothing is up when nothing has gone out**, which is the barrier's rule.
  A board with no such list and a board with an empty one are the same
  bare corner — and unlike a bay on the wall there is no dash to draw, since
  a thing either stands in a room or it does not.
- **The plate is shared, the picture is not.** `FloorMarker` is the plate,
  the figure and the sizes it falls back through, the read on the room's
  one timer, the flash when the number moves and the teardown a lift ride
  needs; `Refined`, `Machine`, `Roadblock`, `Testing`, `Deployed` and
  `Incident` are the six pictures over it. The second of them was written
  by copying the first, which is the shape of duplication this codebase has
  been bitten by twice — see `CountBoard`, one storey up, which is the same
  arrangement, and which is why the four that came after it are adapters
  rather than copies.

**And a beacon in the near corner, for the server being on fire.** The
sixth thing on a project room's floor, and the only one of the six that is
not about the work. A roadblock is work that has stopped and the crates
are work that has gone; an incident is not standing in any stage because it
is not a stage — the card for one sits in whatever lane somebody dropped it
in, if it is on a lane at all, and the bays would go on drawing the same
picture while the building was down. Sandbox ERP's three boards each keep a
**Server Incident** list, and nothing anywhere in this world said a word
about it.

Where it stands is the whole of what it says: **off the line**, in the
near corner — two columns off its own wall, on the room's last row, a good
two rows behind the rack at the head of it. The other five are things that
happen to work, so they stand in a row in the order they happen; nothing on
the board happens to an incident, and a thing that is off the pipeline
stands off the line.

The line growing to five brought its head a hundred pixels nearer, so what
was a couple of tiles of floor between the beacon and the head of the line
is now half of one. They are rows apart and nothing overlaps — but a sixth
station would stand on top of this, and `ROOM_COLS` is what would have to
grow for it.

The near corner rather than any other, because that is the corner you walk
in past: something wanting to be looked at **now** belongs where the eye
lands first. So a room reads in two glances — whether the server is on
fire, and then the line across the middle of the floor saying how the work
is going.

| Where                      | What                                                               |
| -------------------------- | ------------------------------------------------------------------ |
| `countIncidents` in `flow` | What counts as one. Pure, over the board `readBoard` already holds |
| `opsIncident` in `floor`   | Where it stands, read off the room so a longer corridor carries it |
| `systems/Incident`         | The plinth, the sign, the collar and the lit dome over it          |
| `systems/FloorMarker`      | The plate, the figure, the timer, the beat — for all six of them   |

Six decisions in it, and the first three are the ones that would have lit a
light nobody would ever look at again — or never lit it at all:

- **This is the narrow one**, and the narrowest rule anything on this floor
  is counted by — along with the two stages that joined the machine on the
  line, which are under exactly this argument: **all three boards call the
  list Server Incident**, in those words. The folding is for capitalisation, spacing
  and the plural only, with the qualifier optional because a bare Incidents
  is that list with its adjective dropped. Outage and Production Incident
  were in it and came out — guesses at boards that do not exist, and every
  extra word is another way for a working stage to read as the building
  burning down.
- **The despatches are the argument against that, and it is a real one.**
  Their net is wide because the word moved under it: two of these boards
  said Deployed and have since been renamed to Production, so "the boards
  agree today" is a weaker guarantee here than it looks. The day somebody
  retitles this list to Outages the beacon reads zero, and a beacon that
  never lights is indistinguishable from a quiet month — the silent failure
  the despatches' net exists to have avoided. Widen it the moment a board
  wants it; what is not worth doing is widening it for boards nobody has
  seen.
- **RCA is deliberately not an incident**, which is what leaving the
  qualifier a closed set buys rather than matching anything-plus-Incidents.
  A list of that name has been on this board, and a root-cause write-up is
  what is done _after_ one: a board keeps every one it has ever had, so a
  beacon counting it is a red light permanently on with a large number
  under it — which says exactly as little as a barrier reading 0 does from
  the other end.
- **A list the wall already counts is never one**, which is the despatches'
  guard. Not load-bearing here, since the net is one word and no building
  is going to call a stage of its pipeline Server Incident — it is there
  because one that did would have the same cards counted twice, on the wall
  and on the floor.
- **Nothing is up when nothing is burning**, which is the rule the other
  two are under and here is the entire point — a beacon that is always lit
  is a light nobody looks at.
- **Red, and off the flow plate's scale altogether.** `FLOW_COLOURS` runs
  cool to warm to yellow across the five stages a building declares, and
  three of them are stood on the floor wearing their own bay's colour — the
  rack its blue, the machine its purple, the rig its yellow — with the
  barrier in its orange as a thing in the way. This is the HUD's own
  `--pixel-red`, which is on none of that scale, because an incident is on
  none of the pipeline. The crates are off it too and say why: a despatch
  was never a lane either.

The dome is drawn a pixel row at a time from a half-ellipse rather than as
a Phaser ellipse, which is drawn smooth: an antialiased curve standing
beside the barrier's staircased stripes is the one thing on this floor that
would not look like it belongs there.

**Which stages, and off which board, is the building's** — `boards` in
`lib/world/tenants.ts`, one entry per project room, each naming its Trello
board and the lists it counts in the order they run. Read when the numbers
are fetched rather than when the map is drawn, so renaming a board or a lane
is not a `build:map`; the map only carries the plate's six tiles and the
point of interest, and those are the same tiles whatever anything is
called. The five things standing on the floor are in no map at all — they
are points the scene draws on, never footprints — so moving one or adding
another is not a `build:map` either. The
board is **not** a fallback: a room's own board wins over `TRELLO_BOARD_ID`
and over anything picked on a wall, because the whole point of a room per
board is that the numbers count the board lettered above them. See **A
project board is a room, not a choice** under Floors.

The arithmetic is `lib/trello/flow.ts`, pure, over the board `readBoard`
already holds — no second fetch, so a floor of people reading both is still
one request. Two things it is careful about, both of which look like
nothing:

- **A missing lane is not an empty one.** A list that has been renamed or
  archived reads as a dash rather than a zero, is left out of the total the
  bars are a share of, and says so in the panel. A lane nobody is looking
  at and a lane with nothing in it are opposite news.
- **The board's other lists are named** in the panel — Sandbox ERP's
  Production and RCA / Incidents — because a wall counting some of a
  board's lists should say which it is not counting. The panel is where
  all five declared stages are listed too, three of them being on the
  floor rather than on the plate.

`laneShort` is what the wall letters: a bay is a hundred-odd pixels and a
letter eight of them, so a long name is folded to a short one — "In
Review" is REVIEW, and "In Progress" is WIP, which the support board next
door still letters for the same thing though this plate no longer draws
the bay. Of the entries in that table only the two review spellings still
reach a bay here, REFINED and TESTING having gone down to the floor with
WIP. Anything unlisted is its own name in capitals, dropped a size if it
does not fit.
