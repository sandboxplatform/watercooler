# Badges and profiles

The badge catalogue and its rules, the People column, and the cast and profile cards. Moved out of CLAUDE.md so it is read when the work needs it rather than in every session.

## Badges

Thirty-four of them (`lib/badges.ts`), in six groups — Getting about,
Playing, Together, The locals, Eggs, Curios. Three rules run through the
catalogue, and the last two are what the one before it got wrong.

Each carries a `hint` beside its `description`: the past tense in a list
row, and the sentence saying **where to go** on the card. Both, because a
row has space for one of them and a card is opened by somebody asking the
other.

**A badge is a place you went or a thing you did, never a tally.** Nothing
here is earned by doing anything a hundredth time. Each keys on a moment,
or on a **set** of distinct moments — every organisation, every machine,
every resident — which is a map of the world rather than a grind through
it. `badge-rules.test.ts` holds the catalogue to it.

**A badge belongs to the person, not the room.** The old ones were filed
under a room slug, so walking one floor up meant earning Walked In again in
the new place, and the wall read "7 of 4 earned in this room" because it
was also counting badges a retired agent had won. They hang on a profile
now, and a profile is one person wherever they are standing.

| Holder    | Keyed on               | Because                                                              |
| --------- | ---------------------- | -------------------------------------------------------------------- |
| A persona | Their `AccessIdentity` | The code names exactly one person, so it follows them to any browser |
| A visitor | — they hold none       | A guest is passing through, and a typed name is nobody in particular |
| A local   | — they hold none       | A resident is how a badge is _got_, not somebody who gets one        |

**A guest keeps nothing** — no badge, no mark towards one, no egg, and no
desk, which was already true since the desks come off the cast. They are a
temporary user. `badgeHolder` still names them `guest:<lowercased name>`,
because the People panel opens a profile by it, but nothing is ever filed
under that id: it was the whole of a visitor's identity, so two people who
both called themselves Guest shared one shelf and one person who typed a
different name the next day started another. A record kept under it was a
record of nobody. `isGuestHolder` is the rule, and it is asked in three
places for the usual reason:

| Where               | What it does                                                                   |
| ------------------- | ------------------------------------------------------------------------------ |
| `holderOf`          | Null for a guest, so no rule on the socket fires and an egg stays in the grass |
| `awardMachineScore` | The two scores that arrive over HTTP go on the board and on no shelf           |
| The room store      | `awardBadge`, `mark` and `collectEgg` refuse a guest whoever the caller is     |

Holding the Fort is the one rule read off the online list rather than
through `holderOf`, so it asks `isGuestHolder` itself. The high score tables
are left alone: they keep a name rather than a person, and a guest's score
still goes up on the machine. Migration 8 took out what guests had kept
before the rule — see **Storage**.

The browser says so rather than leaving a guest to find out: the profile
card, the Badges and Eggs tabs, both cards and the welcome screen each
carry a line, and the egg's `Press E` is `GUEST_EGG_PROMPT` for them. Who
is a guest there is `person` on the online list — the server's answer,
worked out from the cookie — so `selfPerson` in `eggs-client` needs no
second ask of `/api/me`; until the list arrives the egg offers nothing
either way. **Signing in changes none of it**: a signed-in person on the
shared code is still `visitor` to the socket, exactly as for the door.

**Nothing is granted on a browser's word.** Every rule in
`lib/server/badge-rules.ts` fires off something the server saw for itself —
a room joined, a microphone on, a stroke finished, a score recorded, a
resident with somebody standing next to them. Walking up to the project
board and pressing E is a fine thing to do in this world and there is
deliberately **no badge for it**: the only way to know would be to let the
page say so, and a badge a client can claim is worth nothing.

The nearest thing to an exception is the handful that key on **where
somebody is standing** — the wood, the wilderness, and the three that want
a resident beside you. A position does arrive in a `move`, but `hub.move`
clamps every one against the sprint, so the only way to be somewhere is to
have walked there. A browser can say what it likes and still cannot
arrive.

Same argument, one step further out, for the basketball's two new ones:
the server holds the ball, ran the flight, took the throw's origin off the
room's own record of where the thrower stood, and is the one that saw the
pane struck. `Shot` (`lib/server/basketball.ts`) is what it hands the rule
— `banked` and `far`, both settled over the whole flight rather than in
the tick the ball goes in, because the board is usually struck a tick or
two before the rim is crossed and where it left the hand stopped being
knowable the moment it did.

Where each rule is called from:

| Rule | Fired by | In  |
| ---- | -------- | --- |

The socket lives in `lib/server/socket/` — the wiring in
`presence-socket.ts`, one module per feature under `features/`:

| Rule                            | Fired by                                  | In                            |
| ------------------------------- | ----------------------------------------- | ----------------------------- |
| `onArrival`                     | Every `join`                              | `socket/lifecycle`            |
| `onAlone`                       | The online list coming down to one person | `OnlineList.flush`            |
| `onRoomFull`, `onMeetingJoined` | A join that fills a room / walks into one | `socket/lifecycle`            |
| `onMicOn`, `onRoundTable`       | Any mic turned on: `mic`, or voice hi     | `features/mic`                |
| `onMeetingCalled`               | A `meeting` message                       | `features/meetings`           |
| `onWhiteboard`, `onPingPong`    | A finished stroke, a relayed rally        | `features/whiteboard`, relays |
| `onMingle`                      | Somebody coming to stand beside a local   | `ResidentSimulation`          |
| `onCaught`                      | Getting a hand on a resident mid-bolt     | The socket's `caught`         |
| `onScore`                       | The two high score routes                 | `machine-badges.ts`           |
| `onBasket`                      | A thrown ball falling through a rim       | `features/basketball` tick    |
| `onOutdoors`                    | A `move` into the wood or the wilderness  | `BadgeDesk.wentTo`            |
| `onRunThrough`                  | A car's box covering somebody             | `features/traffic`            |
| `onEggFound`                    | An egg taken out of the grass             | `features/eggs`               |
| `onEggLaid`                     | A fright that left one behind             | `features/eggs`               |
| `onPunch`                       | A punch that landed on the blob           | `features/blob`               |

Round Table used to be checked only inside the once-a-run On Mic grant, so
the fourth person on mic got it only if it was their first microphone of the
run — which, in a room of people who talk every day, was almost never.

Eight of those would otherwise write to the database far too often — a rally
sends a message a frame, a move arrives twenty times a second, the online
list refreshes on a timer and a crowd round the blob lands a punch every time
it comes down — so `once(person, code)` settles each one per run before the
store is asked at all. The codes are `CHATTY` in badge-rules rather than
strings written again at each call, and a code is settled only after its
rule has run, so a write that fails is tried again.

**The three newest are the three places the world grew.** The map tripled
in width and gained a wood, the court gained a backboard, and the chicken
gained a bolt fast enough to be worth chasing, and the catalogue said
nothing about any of it:

| Badge                            | Keys on                             | Why it is not covered already                                                           |
| -------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| Into the Woods / Out in the Wild | A position on the world map         | Neither is a room, so there is no `join` to hang it on                                  |
| Off the Board / Full Court       | `Shot` on the basket                | A lay-up and a bank shot were the same Swish                                            |
| Ran Him Down                     | A catch inside a fright             | Cluck is walking up to him, which a pursuer never stops doing                           |
| Right of Way                     | A car's rectangle covering somebody | Nothing collides with the traffic, so noticing is the only thing there is to do with it |

The shops in the west have **no badge of their own** and want none: all
four are organisations, so the Grand Tour already walks you out there and
in through every one of their doors. A badge for a place the catalogue
already sends you is a second badge for the same afternoon.

**`mark` is the set behind the counting badges.** `badge_marks` holds one
row per distinct thing done — `org:mettara`, `machine:pinball`,
`met:michael`, `kind:warehouse` — and the badge is granted when the count
under a prefix reaches the target. A set rather than a counter because
every one of these asks "have they done each of these", so two visits to
the same lobby must count once.

Four of the targets are **read off the world rather than written down**,
which is what keeps them true when the world changes:

- **Grand Tour** counts `ORGANISATIONS`, so a new company moves the target.
- **Knows Everybody** counts `RESIDENT_COUNT`, off the cast.
- **The Whole Clutch** counts `EGG_TIER_COUNT`, off the ladder in
  `lib/world/eggs.ts` — a ninth kind of egg moves it. Its marks are
  `egg:<tier>`, which is why nine of one kind is not a clutch: the rule
  about tallies applies to eggs exactly as it does to lobbies.
- **Played the Lot** counts `SCORED_MACHINES`, which is read off `TENANTS`
  rather than off the arcade's catalogue — and that is the whole point.
  Three of the five arcade games stand in no building at all, so a badge
  for "every arcade game" would be one nobody could finish. Ping pong is
  left out as well: it keeps no score and takes two people, which is its
  own badge.

**A badge is announced to everybody and toasted to almost nobody.** The
`badge` message goes to every connection, because the panel that lists them
lists the world and a list that only updates for whoever was in the room is
a list that is wrong everywhere else. `BadgeToast` then shows only what
happened in the room you are standing in — which always includes your own,
since the room on the message is the room you were in. Everybody _else_ in
that room sees it over the earner's head instead: `announce` sends an
ordinary `said`, so the room draws it the way it draws a resident's remark.
Your own browser does not, because a room's bubbles are everybody else's —
which is the right way round, since you have the toast and the people
around you have the moment.

**And a badge opens a card.** `components/hud/BadgeCard.tsx`, off
`open-badge` on the bus: the icon on a plinth, whether it is yours and
when, the one line saying how to get it, who has it in the order they got
there, and the rest of its group to read along. Mounted in `app/page.tsx`
beside `Profile` and `EggCard` and for the same reason — it is opened from
the column, and the HUD is behind the column.

Three things open it, and the third is most of why it exists:

| Where         | Because                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `BadgesPanel` | A row has space for a title and a line; the rest of what a badge knows had nowhere to go        |
| `Profile`     | The locked half of a shelf is a wall of grey icons, which is where "how do I get that" is asked |
| `BadgeToast`  | The badge you were _just told about_, in the middle of playing, six seconds before it goes      |

All of it used to be a `title` attribute, which is a tooltip: nothing on a
touchscreen and nothing at all while somebody is walking about. The three
windows share one set of CSS rules — `.entry-card` in `hud.css`, which was
`.egg-card` until the badges wanted the same shape — because a second set
for the same card is two things to keep looking alike.

## The column, and the key that opens it

**Tab opens the People column and puts it away again**, which is the Online
pill's job done from the keyboard — same call (`togglePeople`), same rule:
People, or away. The pill is in the corner of the office and a key is where
your hands already are.

`togglesSidebar` in `lib/sidebar-key.ts` is the binding, kept away from the
page for the reason `lib/sprint.ts` is kept away from Phaser. Tab already
means something to the browser, so most of the rule is about giving it back:
a modifier is somebody else's (Shift+Tab walks focus backwards), autorepeat
is not a second press, and a text field or a dialog owns the keyboard
outright. What is left is `preventDefault`ed, or the press would also land
the focus ring on whichever HUD button comes first.

It reads `event.key` rather than `event.code`, which is the other way round
from the sprint toggle: there is one Tab, so there is no left and right to
tell apart, and `key` is what the browser's own focus navigation reads.

**Closed is a width of nothing, not an absence.** The column used to return
null, and nothing can be transitioned into or out of the document — so it
could only ever appear at full width. It stays mounted and `.is-open`
carries it between 0 and the dragged width; the office is `flex: 1 1 auto`
beside it and narrows in step, so the column never covers anything.

Three things make that a slide rather than a squash:

| Where                | Rule                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.app-sidebar__body` | Held at the full width whatever the shell is doing, anchored to its left edge — so it slides in from off the right, and not a line of it re-wraps |
| `SIDEBAR_SLIDE_MS`   | One number, given to the CSS as `--sidebar-ms` and to the unmount timer. The panel outlives the slide by nothing and is gone by nothing           |
| `.is-dragging`       | The transition off for the length of a drag, or the column trails the pointer by a fifth of a second                                              |

`--sidebar-w` is a custom property rather than the element's own `width`
because the body reads it too: that is what keeps the panel still while the
shell around it moves. `.app-shell` is `position: relative` so its
`overflow: hidden` reaches the part of the panel that is still outside.

On a phone the column is a drawer, out of the flow, so there is no office
edge to walk across and nothing to gain from moving its width: it slides on
a transform instead. Far enough past its own edge that its shadow goes with
it — parked at exactly `100%` it leaves twenty-odd pixels of blur lying down
the side of the office.

**And the office stopped going black, which was the whole of the flashing.**
Resizing a WebGL canvas clears its drawing buffer, and resize observations
are broadcast _after_ a frame's animation callbacks and before it is
painted — so `scale.refresh()` called where the resize is noticed lands
after Phaser has drawn and throws that frame's picture away. One of those is
a flicker nobody sees; sixty a second is an office that is simply black for
as long as it is moving. `PhaserGame` now only records the pending size in
the observer and takes it up on `PRE_STEP`, where the clear happens first
and Phaser draws into the fresh buffer in the same frame.

That was not new. **Dragging the handle had been doing it all along** — the
column's slide is the same continuous resize, which is only how it came to
be looked at.

## The cast, and profiles

`lib/world/cast.ts` is everybody the world knows by name: the eight who
hold a code and the seven residents, with a role, an organisation, a sprite
key, the concept sheet they were drawn from, and a short and largely
unreliable account of who they are.

It exists because two things were invisible. **Offline is a state.** The
People panel listed whoever had a tab open, so Hunter being out and Hunter
not existing looked identical — the column said nothing about who this
world is _of_. It now lists Online first, grouped by place as before, then
**Not here** — the rest of the cast — then **The locals**, who are always
somewhere and so are never news. The residents come down the socket in a
field of their own (`locals` on `OnlineMessage`), out of the Online count,
which counts people, and in the panel with where each is standing, because
"Doc is in Support right now" is the one thing about Doc a browser cannot
work out for itself.

And **the concept sheets were in the repository and nowhere else.** Every
character was drawn as a 1536x1024 two-panel picture — the 8-bit sprite
beside a painted portrait — and the app only ever showed the 48x48 cut out
of the other file. `components/hud/Profile.tsx` leads with it: it is the
one image in this app that is a person rather than a tile. Pressing any row
in the People panel, or any holder's name in Badges, opens it.

Two things about the window:

- **It is mounted in `app/page.tsx`, not in `GameHud`.** Everything in the
  HUD is over the office and nothing else — `.app-hud` sits at z-index 20
  and the column at 30, so a window mounted in there is behind the column
  whatever z-index it asks for. Right for the lift and the whiteboard,
  which are about the room you are standing in; wrong for this, which is
  opened _from_ the column. It travels on the bus (`open-profile`) for the
  same reason: the two ends are in different trees and neither is the
  other's parent.
- **Somebody with no cast entry still gets one.** A visitor is a name, a
  look and where they are standing, which is a real profile. What they do
  not get is a backstory and a picture, and the card says so rather than
  showing a broken image — nor a shelf or a basket, since a guest keeps
  nothing, and the card says that in place of either.

**It is a fourth place to edit when somebody joins the world**, after the
three under the access table above, and `cast.test.ts` is what makes that
survivable: every entry has to name a real persona or resident, agree with
them about name, organisation and sprite, wear a sheet in `WORKER_SPRITES`,
and name a concept sheet that is actually on disk. A missing entry is a
failing test rather than a blank card.
