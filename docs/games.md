# Games

The lobby machines, the basketball court, and the eggs. Moved out of CLAUDE.md so it is read when the work needs it rather than in every session.

## The games in the lobbies

**One game to a lobby, and one lobby to a game.** A building's corner holds
a single machine, and no two buildings hold the same game — so which game
you are playing tells you where in the world you are:

| Building        | Game       | Machine     |
| --------------- | ---------- | ----------- |
| Castle Atlantic | Ping pong  | The table   |
| Sandbox ERP     | Pinball    | The machine |
| Mettara         | Breakout   | A cabinet   |
| Apeiron Media   | Oak Island | A cabinet   |

That is one field: `game` on the tenant (`lib/world/tenants.ts`), and a
`Game` is a **game rather than a machine** — `"pong" | "pinball" |
ArcadeGameId`. The five arcade games each stand in the same cabinet, which
`GAMES` in `lib/map/office.ts` gives them by spreading one entry over
`ARCADE_GAME_IDS`, so a sixth game added there has a cabinet without anyone
remembering to write one. There used to be an `also` beside `game` for a
second machine, which is how Sandbox ERP came to have the whole arcade
standing next to its pinball machine; **removing the field is the whole of
the one-per-lobby rule**, and every machine now takes the same corner
because no lobby can want two.

The other half is only ever true because the list says so, so
`tenants.test.ts` asserts it. Nothing about the world running would notice
two buildings declaring Breakout: both draw a cabinet, both open the same
panel, and the only sign of it is that the high score table you were beating
is in the other building.

**A cabinet is its game — there is no menu.** Walk up, press E, and you are
in Breakout. `arcadeGameIn(room)` is how the HUD's one `Arcade` panel knows
which, read as the panel opens rather than at mount, because riding the
lift changes rooms without rebuilding the HUD. Escape leaves, like every
other panel; before, it backed out of a game to the menu first, which is
why `usePanel` was given `escape: false` there. Three of the five games —
Flappy, Snake and Solitaire — are therefore in no building at all, and
putting one somewhere is a `game:` on a tenant plus `pnpm build:map`.

The sign over the cabinet names the game, which is the one label on the
fixture registry that is **not** the same in every room: `sign.label` may
be a function of the room's slug, and `FixtureManager.place(pois, room)`
resolves it. Written down once it would read ARCADE over a cabinet whose
sign should say BREAKOUT, and nothing but looking at it would tell you.

## The basketball court

Out of doors, in the middle of the park's east block — the grass between the
centre avenue and the east one. Sixteen tiles by eight of tarmac, a hoop at
each end, and **one ball for the whole world**: pick it up, and whoever else
is out there sees you carrying it.

**It has most of the block, with two tiles of grass round it.** The block is
twenty by twelve, so the court is centred exactly on both axes and the park
keeps a fringe to stand its trees and its lamps in — which is where the two
planters and three trees that stood on what is now tarmac went. It was nine
by six in a corner of that block, its south side on the kerb of the road and
its east side on the avenue: a half-court pushed out of the way of the park
rather than the thing the park is for, with the hoops seven tiles apart, so
a throw from anywhere on it was the same throw and two people on it were in
each other's way.

Two to one is also the shape of the real thing — 28 metres by 15 — where
nine by six was half as wide again as it should have been. **Every marking
is now struck off those metres** rather than written as pixels that happened
to suit a 432-wide court: the key is 5.8 of them deep and 4.9 across, the
centre circle 1.8 in radius, the arc 6.75 from the basket, clamped so a
plain semicircle does not come out on the sideline and read as a second
boundary. `courtLines(tilesW, tilesH)` in `scripts/make-world-art.mjs`.

**The top of the meter is one rim to the other** — the length of the court,
taken from under your own hoop, which is the longest shot the court has in
it. The end line a stride behind it is deliberately out of range: a throw
from off the back of the court is not a shot anybody was aiming.

It has been wrong in both directions. At the nine-tile court's 453px a full
throw crossed a sixteen-tile one nowhere near, so the length of the court was
a length nobody could throw and the top third of the swing was a part of it
nothing used; wound up to reach the far rim from the far _end line_ it went
the other way, to 808px against the 668 between the two rims — a ball fired
out of the park, with the top of the swing spent overshooting whatever it was
pointed at. `THROW_MAX_SPEED` is the one that came down. `THROW_MAX_LIFT`
stayed, because the same lift over a shorter throw is the loftier arc, which
is the shape a shot at a hoop has; the minima are untouched, since the bottom
of the meter is a lay-up at any size.

**And the flight had to be the parabola it is solved as.** `throwReach` is
the analytic answer and `stepBall` was integrating `vz -= g·dt` and then
moving at the speed it _ended_ with, which loses `g·dt²/2` of height every
step — a pixel at a time, and twenty-five over a long throw. The two
therefore disagreed by more the harder the ball was thrown, so a shot the
meter says is perfect dropped to rim height twenty pixels short of the rim,
with nothing on screen to explain the miss. It is `z += vz·dt − g·dt²/2`
now, which is the parabola exactly at every step boundary and at any frame
rate.

**The ball is the server's.** Where it is, where a throw takes it and
whether it went in are all decided in `lib/server/basketball.ts`, and the
browser is told. A person's whole say in it is one number — the power the
meter was on — clamped on arrival; where they are standing and which way
they are facing come off the room's own record of them, so a throw cannot
be aimed from somewhere nobody is. That is what makes the basket worth a
badge: nobody can claim one, they can only sink one.

Three files, and the split is the usual one:

| Where                        | What                                                                  |
| ---------------------------- | --------------------------------------------------------------------- |
| `lib/world/basketball.ts`    | The court, the hoops, and the arithmetic of a throw. Pure, shared     |
| `lib/server/basketball.ts`   | Who has it, who may take it, and letting go of it when they walk away |
| `systems/BasketballCourt.ts` | The drawing of it, the `Press E`, and the meter                       |

**Height is the third number and it is the point.** A ball that only slid
about the ground could be thrown at a hoop and never through one, so `z` is
how far it is off the tarmac: a throw leaves the hand at `HAND_Z`, arcs
under gravity, and is a basket only where it crosses a rim's height **on
the way down**. Up through a rim is the ball hitting the underside of the
net, which is not a point — and the crossing is asked of the height the
ball _passed through_ during a tick rather than the height it is at, since
a fast ball drops from above the rim to below it inside one tick and
neither frame on its own has anything in it to say so.

Three things about the height fell out of getting it wrong:

- **A person's `y` and a ball's `y` are different lines.** A person's is
  the middle of their 96px frame; a ball's is the patch of ground it is
  lying on. `groundUnder` is the one place the two meet, and forgetting it
  put a carried ball forty pixels over its carrier's head.
- **A bounce needs the ball to have been above the ground at the start of
  the step**, not merely to be heading down at the end of one. A ball lying
  on the tarmac picks up a whole tick of gravity every tick, and reading
  that as an impact gave it a bounce it could never lose — a ball that
  never comes to rest is a ball the room broadcasts for as long as the
  server runs.
- **Solids are consulted only while the ball is low.** A throw arcs over a
  bench; a roll stops against it. One height rather than a height on every
  prop: what stands out here is a tree, a bench and a lamp, and none of
  them is a thing a basketball has any business knocking about.

**One button, pressed twice.** Press E over the ball to pick it up and a
meter starts swinging over your head; press E again to throw at whatever it
is on. A held-key charge would have been a keyboard's game and nobody
else's — this works the same on a pad and on the HUD's own action button,
which is why `OutdoorScene` now reads E, the pad and `interact-pressed`
together and hands the press to whatever the place put in `extra`.

The meter is a **triangle** rather than a sawtooth: it has to be possible
to aim for the middle of it as well as the top, and a bar that jumps back
to nothing gives you one approach to every value instead of two. The power
is the distance — `throwReach` is that relation written down — so lining
up on the centre line at the right range is the whole of the skill.

**The court is ground, the lines are a picture.** `COURTS` in
`lib/world/scenery.ts` is its tarmac, laid the way the car park's asphalt
is, because what is underfoot is a fact about the map. A centre circle and
two keys are nine tiles wide and no repeating tile can carry them, so the
markings are one transparent image at depth 1 — over the ground, under
everything standing on it. Paving that meets the court gets **no kerb**:
between two hard surfaces a kerb is a stone lip drawn across the middle of
the tarmac. Nothing exercises that today — the court stands in the middle of
its block and touches no road — so it is a rule about where the court may go
rather than a description of the map.

**The hoops are read off `HOOPS` rather than placed by hand**, because the
ball is judged against those same three points — a post put down separately
is a rim the ball falls through somewhere the picture is not. Only the pole
is solid on the ground; the rim is out over the court and the board is over
your head, where the only thing that meets either of them is the ball.

**The backboard is the second way in, and that is the point of it.** A shot
too long for the hole comes back off the board and can still drop through
the rim on the way down, so the far end of the meter is a chance rather than
a miss. Swept over every power from a given range it reads as a swish window,
a gap, then a bank window, then nothing — and `basketball.test.ts` asserts
that order, since a bank that were _easier_ than a clean shot would make the
board the way to play rather than the way to recover.

Three things about it:

| Rule                              | Why                                                                                                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A plane at one `x`, not a solid   | Both boards face along the court, so the ball meets one square on and a flat wall reverses only the component across it. Height and the way along the board are its own |
| Struck mid-tick, like the rim     | The ball covers twenty-six pixels in a tick and a pane has no thickness, so a board tested where the frame left the ball is a board the ball flies through              |
| The rest of the tick is re-walked | The rim below is judged from the bounce rather than from the straight line the ball would have flown, or a shot that banks in is scored as a miss                       |

Its numbers and the picture's are the same numbers — `BOARD_BEHIND_RIM`,
`BOARD_HALF_WIDTH` and the two heights in `lib/world/basketball.ts`, which
`scripts/make-world-art.mjs` imports and draws the board to. A pane reaching past its own picture is a
rebound out of clear air. Two honest ways past it fall out of that: under it,
through the gap between the hole and the foot of the board, and over the top.

It is also what **stops a shot taken from off the back of the court**: the
shooter's own board is between them and the far hoop, and the ball meets it
from behind exactly as it would from the front. That used to be the top of
the meter's own story — a full-power swish was thrown from eight hundred
pixels out, which on the centre line is behind the other hoop — and it is an
edge case now that the meter tops out at the distance between the two rims.
Every power the meter has can be swished from somewhere on the tarmac.

**A ball left off the court finds its own way back.** A throw at full
stretch carries it clean over the end line and the avenue beyond, and there
it stays: the court is then a court with no ball on it, and the only remedy
is somebody happening to walk past wherever it stopped. So after
`ABANDONED_MS` lying still off the tarmac it returns to the centre spot —
not quickly, because somebody who saw where it went and is walking over to
fetch it should get there first. A ball lying **on** the court is left
alone: that is where whoever last played put it, and tidying it away is
moving somebody's things.

**On the wire it is the world map's and nobody else's.** The `basketball`
broadcast goes to that room only — a floor of Sandbox ERP has no use for a
ball's coordinates twenty times a second — and it is sent on a tick where
its rounded position or its holder has changed, once more when it settles,
and once to anybody walking onto the map. So a ball held by somebody
standing still is silent, and a ball in flight is a lossy frame, skipped for
a connection that has fallen behind. That last send matters: a still ball
is published once and then not again, so without it an arrival would see an
empty court until somebody touched it. It is stepped only while a person is
out on the map; with nobody there it waits where it was, and whoever walks
out is sent it there.

## The eggs

Startle Michael and four clucks in a hundred — `EGG_CHANCE` — he leaves
an egg in the grass **where the bolt ends**, not where it began, and it goes
off like a firework as he does. Anybody out on the map can walk up to it and
press E, and it goes in their basket, which hangs on their profile beside
their badges and stays there.

It was three clucks in a hundred, which is a rate the chase was not worth: a
fright is five seconds of running a chicken down at half again a sprint, and
thirty of those for one egg is a quarter of an hour of the same afternoon.
Seven was the answer to that and overshot it the other way — an egg every
other chase is a thing you collect rather than a thing you come across. Four
is a handful of chases for one, and neither change moves anything else — the
ladder below is per **egg**, so what a rainbow is worth is exactly what it
was.

**Whether is settled at the cluck and where at the end of the run.** The roll
belongs to the moment of the fright, which is where the seeded randomness is;
the spot belongs to where it left him. Dropped as he turned to run, the egg
was at the feet of whoever startled him — they had only to stand still and
stoop, and the chase the whole fright exists for never happened. Laid where
he finally stops, it is a field away and going to get it is the point.
`laying` on the resident's state is the half-second of bookkeeping that
costs, and it is **one egg to a run**: a fright that is already carrying one
does not roll again, so running him down over and over is worth another
cluck and not another egg.

**Odds, not every twenty-fifth cluck**, and the two are nothing alike to
play: the draw is fresh on every fright and nothing anywhere counts them,
so fifty may pass with nothing to show and two may come one after the
other. A counter would be a rhythm somebody could learn, and then walking
up to Michael would be a chore with a payout at the end of it rather than
a chance. `residents.test.ts` holds it to that from both ends — a roll
that keeps paying out keeps paying out, which is what says there is no
counter swallowing the other thirteen.

**There is a ladder, and rarity is one number written once.** Eight kinds
(`EGG_KINDS` in `lib/world/eggs.ts`), each declaring a `weight`, and
everything else is read off it — the share of eggs that come out that kind,
the "1 in 250" the panel prints, the order the ladder is shown in, and the
target of the badge for finding one of each. A second field saying "rare"
is a second thing to be wrong the next time a weight moves.

| Kind         | Weight | Which is |
| ------------ | ------ | -------- |
| Hen's Egg    | 5305   | 1 in 2   |
| Speckled Egg | 2500   | 1 in 4   |
| Copper Egg   | 1250   | 1 in 8   |
| Jade Egg     | 500    | 1 in 20  |
| Gilded Egg   | 200    | 1 in 50  |
| Ruby Egg     | 125    | 1 in 80  |
| Obsidian Egg | 80     | 1 in 125 |
| Rainbow Egg  | 40     | 1 in 250 |

The weights total ten thousand, so the rare end is exact — five hundred
is one in twenty, two hundred is one in fifty, forty is one in two
hundred and fifty — and the common end takes what is left over, which is
why a hen's egg is 5305 rather than a round number. A rarity somebody
crossed the park for is worth being exact about; the one they were going
to find anyway is not.

**The rare end got longer rather than steeper.** A rainbow was one in a
hundred, which is a thing somebody turns up in an afternoon of chasing a
chicken. Making it one in 250 on its own would have left a cliff with
nothing on it above the gold, so the two rungs put under it — a cut stone
and a piece of volcanic glass — are the climb: the stretch between the
gold and the inexplicable is where a ladder is actually climbed.

So a rainbow is sixteen clucks in a hundred thousand, which is the
world's rarity rather than anybody's goal — and The Whole Clutch, the
badge for one of every kind, is the long one in the catalogue on purpose.
Both numbers are meant to be read as "there may be one of these in this
world", not as something to sit down and work through.

Three files, and the split is the basketball's exactly:

| Where                 | What                                                                           |
| --------------------- | ------------------------------------------------------------------------------ |
| `lib/world/eggs.ts`   | The ladder, the weighted pick, the reach. Pure, shared by all three layers     |
| `lib/server/eggs.ts`  | The field: what is lying about, who may take it, and forgetting the stale ones |
| `systems/EggPatch.ts` | The drawing of them, the `Press E`, the shout, the fireworks and the beacons   |

Five decisions in it:

- **Whether is the simulation's and what kind is the field's.** The chicken
  does not choose what he lays. `ResidentSimulation` holds the fright and
  the seeded randomness the tests drive, so it rolls the chance and calls
  `laid` on its host **when the fright wears off**; the tier is rolled on
  the other side of that call, where the ladder is. Both halves take a roll
  rather than a random function, so a cluck can be replayed. The credit
  survives the run with it, so somebody who walks away between the cluck
  and the laying still gets the badge — only a disconnect loses it.
- **It is a mode, not a chicken.** `lays: true` on a resident
  (`lib/world/roster.ts`), beside `wanders`. Only ever alongside a
  `greeting`, since the egg comes of the fright and the fright comes of the
  cluck.
- **The world map only.** The socket's `laid` refuses anywhere else and says
  why: a wanderer never goes indoors, so an egg in a lobby would be one
  nobody could ever see. The day a second layer turns up with a desk, that
  is the line to change.
- **Lying about is in memory; picked up is in the store.** The field is
  beside the ball and the meetings — an egg nobody has come for is something
  happening, and a server that restarts has tidied the park. A basket is a
  person's and outlives any server, so it is the `eggs` table (migration 6),
  one row per egg because an egg is a thing that happened at a time. What
  anybody asks of it is a **tally**, which is bounded by people times six
  where the rows are bounded by nothing.
- **Two of them go stale and one of them goes first.** `EGG_SPOILS_MS` is
  three hours, and it is set by what somebody logging in after a quiet
  stretch finds. The residents startle Michael with nobody online and lay
  about one egg every seven hours between them — measured by running the
  simulation over forty-eight empty half-days, and random enough to treat
  as a Poisson rate — so the lifetime is the whole of the odds: ten minutes
  was one login in fifty with an egg waiting, twelve hours four in five,
  and three hours is one in three. Often enough to be worth looking, rarely
  enough to be a find. `NEST_LIMIT` is forty-eight, and reaching it drops
  the **oldest**: the egg people have walked past twice is the one least
  likely to be collected, and refusing to lay a new one would switch the
  feature off for as long as the field stayed full. It is a siege guard
  and has to stay one — at twelve it would have become what decides how
  long an egg lasts on a busy day. A restart still clears the field, and a
  push to `main` is a restart, so an egg laid before a deploy is gone
  however long it had left.

**Two messages, which is the badges' arrangement.** `eggs` is a fact about
the world map and goes to that room — the whole field every time, like
`online` and `meetings`, because it is a handful of eggs changing a few
times an hour and a browser that missed one message would otherwise draw an
egg somebody pocketed. `egg-found` is a fact about a person and goes to
everybody, so every browser's tally stays current without refetching.
`/api/eggs` is the catch-up for a panel opened cold.

**A whole list cannot say which of it is new**, which is what `laid` on the
`eggs` message is for: the id of the one just dropped, null on every other
message. Somebody walking onto the map is sent exactly the same list as
somebody who was standing there when Michael laid one, so a scene bursting
over everything it had not drawn before would let the fireworks off at every
egg in the park for anybody coming out of a building. An id rather than the
egg itself, unlike `taken` — this one is still in the list beside it.

The browser's whole say is `{ type: "egg", action: "take" }`: which egg is
whichever is nearest, and whether anything is in reach at all is answered
off the room's own record of where that person is standing. A message that
named an egg could name one across the map, and the tier — the whole point
of an egg — would be a thing a browser had an opinion about.

**A guest's hand in the grass takes nothing**, and the order is the point:
`holderOf` is asked _before_ the egg leaves the nest, not after it — and
the basket is written before it leaves, too (`nest.nearest`, then
`collectEgg`, then `nest.remove`), so a failed write leaves the egg in the
grass rather than in nobody's basket. A guest has no
basket (see **Badges**), and an egg lifted out of the field for somebody
with nowhere to put it is gone from the park and in nobody's basket — which
is exactly what the code did before, since the take came first and the
holder was only asked about the badge. So it stays lying there, nothing is
published, and the scene shows a guest `GUEST_EGG_PROMPT` where anybody
else sees `Press E`. A guest's fright still lays one; the egg is the park's.
`egg-socket.test.ts` seeds the field with one egg to drive this, since
waiting on Michael is minutes.

**A press of E goes to every `extra`, not to the first that wants it.** The
world map now runs two of them, so `OutdoorPlace.extras` is a list; the ball
and an egg a step apart never argue over a press, because neither acts on
one unless something of theirs is within arm's length.

**Two things are drawn over an egg rather than at it**, and they answer the
same complaint from either end. Everything out of doors sorts by the bottom
of its own picture, so an egg in the wood is behind whatever tree stands a
row south of it — and the wood is where Michael spends half his day, since
the walk along the river bank is five of his spots. Fourteen pixels of shell
under a canopy is an egg that was never there.

| What                  | Says                                        | For        |
| --------------------- | ------------------------------------------- | ---------- |
| `utils/egg-burst.ts`  | Michael has just laid one, and of what kind | A moment   |
| `utils/egg-beacon.ts` | There is one here                           | Until gone |

Both are drawn **over everything**, at the prompts' own depth rather than at
the ground's, which is the whole of the point: the place they most have to
be seen is exactly the place the egg cannot be. A burst that sorted with the
scenery would be a firework let off inside a bush.

Four decisions in the burst:

- **The colours are the egg's** — the three `shell` tones off the ladder, so
  the fireworks have said what kind it is before anybody is near enough to
  read the shout over it. Nothing else in this feature tells you from across
  a field.
- **A rarer one goes off harder**, read off the rung rather than written per
  tier: more sparks, faster, for longer, and the pops after it start at
  copper. A ninth kind of egg needs nothing there.
- **Squares, not smoke.** The spark and the four-point flash are generated
  on first use rather than delivered as art, for the reason the count
  boards' plates are drawn rather than painted — this is a white pixel and a
  star, and a PNG of either is a file to keep in step with nothing. The
  flash's spikes are stepped a pixel at a time, which is the argument the
  incident lamp's dome is already under.
- **It hands back a handle**, because a scene's shutdown takes its timers
  with it: a burst still in the air when somebody walks into a building
  would be waiting on a `delayedCall` that never arrives.

And three in the beacon, which is the half that matters in the wood:

- **The same mark for every rung.** Its job is "there is an egg here", which
  is equally true of a hen's egg and a rainbow, and a beacon that only
  showed the good ones is a beacon nobody can trust. What it takes from the
  ladder is the **colour** — so it says which kind from across a field
  without saying how much it is worth coming for.
- **It is `keepLegible`'s**, like a name tag and unlike the lettering
  painted on a wall: standing well back on a map this size is exactly when
  an egg needs finding.
- **The glow breathes and the arrow bobs, on two tweens.** One tween over
  the lot would read as the egg itself bobbing about in the grass.

**The sprite and the HUD are the same egg drawn twice.** `scripts/make-world-art.mjs`
draws one frame per kind into the props atlas from the `shell` tones in
`lib/world/eggs.ts`, imported rather than copied — the script runs under tsx
(`pnpm build:art`), so an `.mjs` importing a `.ts` is no obstacle, and the
basketball's board and rim numbers are read the same way. The panel draws its own from those tones rather than
slicing the atlas, so the HUD never has to know where in a generated sheet
an egg sits. The frame is **centred on the ground the egg lies on** and
padded below, so no scene has to know where in the frame the ground is.

**A colour is not a kind, and that was the whole fault.** Both drawings
were an ovoid in three tones of one light, which at fourteen pixels tall in
the grass and thirteen in the panel is one egg printed six times — and a
ladder whose bottom rung is meant to be worth crossing the park for cannot
be told apart from its top. So every kind carries a **marking** as well as
its tones, drawn twice like the tones are: freckles, hammered metal with
two highlights, a veined stone lit from inside, gold leaf in panels, and
the whole spectrum wound diagonally round the shell. `mark` in the script
is one half and `Marking` in `components/hud/EggMark.tsx` is the other.
The sprite is half as tall again into the bargain, and the panel's is an
SVG at whatever size it is asked for rather than a box of a fixed number of
pixels — which is what lets the same egg be a list row and the card below.

**And a rung opens a card.** `components/hud/EggCard.tsx`, off `open-egg`
on the bus: the shell at two hundred pixels on a dark plinth, how rare it
is, the `lore` paragraph behind the one-line `note`, how many are in your
basket, who else has found one, and the rest of the ladder to step along.
Mounted in `app/page.tsx` beside `Profile` and for its reason — it is
opened from the column, and the HUD is behind the column. The two are
**never up together**: each closes itself on the way to opening the other,
which is why they share a z-index rather than arguing over one.
