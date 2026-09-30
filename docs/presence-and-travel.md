# Presence and travel

Walking in, covering a move, presence and sessions, and how rooms change without a page load. Moved out of CLAUDE.md so it is read when the work needs it rather than in every session.

## Walking in

**The way in is a door, not a page load.** The welcome screen asks who you
are, and the moment it has an answer the world map comes up — in the same
page now, which is a blank canvas for as long as a tilemap, six buildings
and a character sheet take, and then somebody who is suddenly there.
`components/hud/Arrival.tsx` covers that moment: their own face and name on
a card while the map builds, and then it lifts onto their character taking
the first steps onto the plaza.

Four decisions in it:

- **The welcome screen no longer navigates; it says who arrived.** Both ways
  through it end in a `walking-in` on the bus — the button somebody presses,
  and the effect that walks a personal code straight through without asking
  it anything. A personal code was the one arrival with nothing to look at,
  which is backwards: it is the only person the app knows by name.
- **The card does the travelling.** That looks out of place for a panel and
  is the whole point: it has to be on screen before the canvas goes blank,
  and the only way to be sure of that is for the thing covering the screen
  to be what starts the move. Hence `arriveAt` above.
- **It lifts on the map saying it is up**, not on a timer — with a floor
  under it so it is a moment rather than a flicker, and a ceiling over it so
  a place that never says anything cannot strand anybody behind it.
- **The steps are the ordinary arrival walk.** `walkIn` on the `RoomArrival`
  is the same walk everybody takes out of a door; it is a separate flag
  because out of a door the walk is forced — a key held through the doorway
  would otherwise walk you straight back in — and this one is for effect.

A name chosen there reaches the room by **re-joining**, which is what a new
look already did. It had no need to before: the welcome ended in a page
load, so the name it wrote was read by a socket that had not opened yet.
Without it everybody in the world goes on seeing the name you arrived under,
which for a visitor is `Guest`.

### Covering a move

**And every move after it is the same moment.** Walking in was the one
arrival with a card over it, and the reason for the card — a place takes a
second to build and the browser cannot paint while it does — is true of
every front door, lift ride, campus gate and back button in the world. What
they got instead was the freeze described under **Rooms and places**: your
own character apparently stuck in the doorway for as long as the next place
took. So `Arrival` covers the lot, off `room-changed`.

Three things differ from the walk in, and the first is the one to remember:

- **Only the first card travels.** The welcome's does, because it has to be
  on screen before it sets the canvas going. Nothing else needs to: the
  router holds its swap back for a paint, so every other move is already
  announced a couple of frames before it is made.
- **A shorter floor under it** (`MOVE_MS`, 300ms against the walk in's 900).
  Walking into the world for the first time is meant to be a moment; a lift
  ride is not, and a card held for the best part of a second on every door
  would make the world feel slower than the freeze it replaced.
- **It says where you are going**, in the People panel's own words —
  `describeRoom` on the room off the event, so "Sandbox ERP · Lobby" and
  "World map" mean the same thing wherever they are printed. The walk in
  went through the same function rather than keeping its own wording.

`place-changed` is what lifts it, and it is **remembered as well as waited
for**: the card goes up when the move is announced and the scene is swapped
two frames later, so ordinarily it is listening long before the new place
says anything — but React commits on a schedule of its own, and an arrival
that landed first would strand the card until its ceiling.

## Presence

A room's people live in a `PresenceHub`, keyed by connection rather than by
person: one browser tab is one player. Two rules keep that from showing a
person twice.

**One person, one session.** A personal code names exactly one person, so a
second connection claiming `coop` or `rob` is a second window onto somebody
already in the world. **The one in possession keeps its place and the
newcomer is refused** `rejected: "already-online"`, and `stopRoomSocket`
keeps it from reconnecting into the same answer over and over. The shared
code is exempt: many people hold it, so two visitors are two people.

**It is asked of the whole server, not of the room being joined.** Two Coops
is two Coops whether they are in one room or two floors apart — and the
Online pill counts the world, so the pair showed up side by side in it.
`heldBy` scans every connection's identity against the room each is standing
in, since a connection that has upgraded and not yet joined is nobody yet.

**The one in possession is pinged before it is believed, and that is the
part to keep.** A page load is a new connection too — the front door of a
building, a refresh, a reopened tab — and behind a proxy the socket the old
page left behind is not closed promptly at the server. Refusing on the
strength of an open socket alone would shut somebody out of their own world
with their own ghost, for twice `HEARTBEAT_MS`, on every door they walk
through. So the incumbent is sent a ping and given `CLAIM_GRACE_MS` to
answer: a browser that is really there replies in tens of milliseconds and
the newcomer is turned away; a ghost never replies and the newcomer takes
over from it. A second's pause on a reload is what that costs, and it is
only ever paid by somebody whose predecessor is already dead.

**A reload is not a claim, and the tab says so.** The ping above is the
right answer to two people and the wrong answer to one person coming back,
for the reason in **Rooms and places**: a browser answers a ping from its
network stack, so the socket a reloading page left behind swears it is
alive. `session` on the join is a per-tab id kept in `sessionStorage` —
surviving a reload, shared with no other tab, gone when the tab is. A join
contesting an identity held by a connection with the same session is not
contesting anything: it is one person at one screen, so it takes its own
place back and nothing is pinged. Anything else is challenged as before, and
a browser that cannot keep a session token is challenged like any other
newcomer.

`supersede` is what the two paths share: the connection being replaced is
told rather than left to go quiet, and then terminated rather than closed
politely, so it is gone at once rather than on the next heartbeat. (The
heartbeat walks every connection now, joined or not, and a connection that
upgrades and never joins is closed after `JOIN_DEADLINE_MS`; it used to walk
the rooms, and a socket outside every room was swept by nothing.) Usually nobody sees the message; where somebody does, it is two tabs
that ended up sharing a session, which is what duplicating a tab does.

`claiming` is the other half of it. The challenge takes a moment, and a
third connection arriving inside that moment would find the incumbent still
in the room and start a second challenge of its own — two newcomers, each
told the ghost is gone, both let in. Whoever is already contesting an
identity has the claim; anybody else is refused while it is decided. It is
keyed identity to the claimant's own connection, because the claimant can
join twice inside the moment — a scene arriving, then a look put on — and
refusing its own second join turned somebody away from their own world.
That join now replaces the pending one.

**Being refused is shown, not just logged.** The socket stands down for
good, so a person who was told nothing would be looking at a world with
nobody in it — themselves included — and no reason for it, which reads as
the app being broken rather than as the rule working.
`components/hud/AlreadyOnline.tsx` is the screen, off the `presence-refused`
event.

The question this asks is **which code opened the door**, not which account
is signed in: a signed-in person is still `visitor` to this socket unless
they hold a personal code, so two tabs on one Google account are two
visitors. Giving accounts the same rule means carrying the session through
the upgrade, which is a different change.

**A move is not a departure, and `drop` has to be told which it is.**
Walking through a door is a `join` on the connection already in the world,
so the server takes it out of the old room before putting it into the new
one — through the same `drop` a closed tab goes through. Two things in
there are wrong for somebody three steps away, and `moving: true` is what
turns them off:

- **The world's list must not lose them.** A `broadcastOnline` on the way
  out and another on the way in published, in between, a world with the
  mover missing from it. That is the Online count flickering down and back
  up — which the page-load fix below was supposed to have ended and had
  not — and it is worse than cosmetic, because **the voice chat reads that
  list to decide who is still in Global Chat**. Every other browser tore
  the audio down on the gap: two people could hear each other until one of
  them walked upstairs, with every indicator in the app still saying they
  were in the same conversation. The online list is now coalesced to at
  most once a tick (`OnlineList` in `lib/server/socket/online.ts`), so it
  is published after the move has finished rather than halfway through it,
  and no path — a move, a same-tab reload, a ghost superseded — can publish
  the gap.
- **Their tab is still their tab.** `session` is what tells one person
  coming back from two people arriving, so forgetting it here left anybody
  who had changed room once to be challenged on their next reload —
  pinged, answered by their own ghost, and turned away from their own
  world. One door was enough to arm it.

The client has the other half of the first, in `GONE_GRACE_MS`
(`lib/voice/sweep.ts`): gone from the list is the only way a browser
learns that somebody has left, and a single list without them in it is not
that. A reconnected socket is the next gap of this shape, and there is no
reason to let it cost a conversation either.

**A dead socket is noticed.** The heartbeat pings every `HEARTBEAT_MS` and
now reads the pongs; a connection that misses one is terminated, and only a
pong answering a ping it was actually sent counts — an unsolicited one would
otherwise let a client that stopped reading stay present for ever. It used
to ping and ignore the replies, so an abandoned socket counted as present
until it went `IDLE_TIMEOUT_MS` — fifteen seconds — without speaking.

**The socket's limits** (`lib/server/socket/`, `lib/server/rate-limit.ts`,
`lib/server/relays.ts`), none of which the ordinary client comes near:

| Limit            | Value                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| A frame          | 64KB (`maxPayload`); the largest honest ones are SDP and strokes                                                       |
| Messages         | 60 a second per connection, burst 60; `mic`, `meeting` and a board clear have budgets of their own (a clear every 30s) |
| Sustained abuse  | Over 300 dropped in ten seconds and the connection is terminated                                                       |
| Relayed payloads | Pong and voice signalling rebuilt from known fields, lengths capped                                                    |
| A slow reader    | Lossy frames skipped past 256KB queued; terminated past 2MB                                                            |
| Never joining    | Closed after `JOIN_DEADLINE_MS`, ten seconds                                                                           |

A message that throws is logged and the connection carries on; it used to
wedge the connection, which then stopped answering pings and was dropped.
Every broadcast is serialised once rather than once per recipient, and a
presence snapshot goes out only when the room has changed, plus a one-second
keepalive — it was twenty a second whether anybody had moved or not.

Both exist because of a bug that only appeared in production: behind
Railway's proxy the browser navigating away does not promptly close the
socket at the server, so walking out of a building meant meeting yourself at
the door for fifteen seconds. That same fact is why the claim above pings
before it refuses — the ghost holding the place is exactly this socket. None
of it reproduces against a local server, where the close is immediate, so
`lib/server/__tests__/presence-identity.test.ts` drives real sockets against
a real server and stands a paused one in for a page that has gone.

The client closes on `pagehide` too, guarded on `persisted` so a hidden tab
or a backgrounded phone is not taken out of the room for looking away.

**Out of sight is part of presence.** The lift car is a hole in the wall with
the character drawn in front of it, so stepping in hides them — and that is
true of everyone's screen, not just their own. `Player.board` hid the local
sprite and said nothing, so everybody else watched them idle in the doorway,
name tag and all, for as long as they took to choose a floor. It is a
`hidden` flag on the roster now, set by a `boarded` message and drawn by
`RemotePlayer.board`.

Three things about it, and two of them were the mistake:

| Where          | Rule                                                                    |
| -------------- | ----------------------------------------------------------------------- |
| `Player.board` | Emits `player-boarded`, so no call site can hide somebody quietly       |
| `hub.place`    | Clears it: a scene saying where somebody stands is a scene drawing them |
| `hub.count`    | Unchanged. Out of sight is not out of the room, and the place is held   |

It cannot ride on `player-moved`: a scene stops reporting position while a
dialog is up, and the lift's buttons are a dialog. And unlike the microphone,
which stays on through a door, it is **not** remembered per connection — a
ride is a fresh join, and arriving invisible is the worse bug of the two.
Both halves are held down by `lib/server/__tests__/lift-visibility.test.ts`,
over real sockets, because a message type the socket does not recognise is
dropped without a word.

## Rooms and places

A room is named by its slug and **the slug is in the URL, so the link is the
credential** — generate unguessable ones for anything but a demo. `lib/rooms.ts` is
the single source of truth for slug parsing and normalisation; it is shared by client
and server, so keep it import-free.

```
/                       the default room ("local")
/r/<slug>               a building's lobby
/r/<slug>/floor/<n>     a floor above it — its own room, same building
/world                  the world map (a room too, so people can see each other)
/campus/<slug>          a campus (likewise)
/volcano                Volcano Island, across the water from the second dock
/volcano/cave           the cave under its volcano, where the blob is
```

A slug reaches the filesystem nowhere any more, but `normaliseRoomSlug` still
excludes separators and traversal outright rather than trusting callers: it is
the one place that parses them, and a slug that cannot be a path is a slug
nobody has to think about again.

**No room change is a page load.** A room is a URL, so moving between them
used to be `location.assign` and the whole client came up again. Measured on
a warm cache in production that was about 1.2s to ride one floor: 232ms to
first paint, then half a second of Phaser parsing and booting before the new
map was so much as asked for, 47 requests, and 7KB actually off the network.
Nothing was being fetched — the app was being rebuilt around a room next
door. Same journey now: 2 requests, 1KB, done at 428ms, and that is the
room-state round trip rather than rebuilding anything. Both tilesets are
9.4MB of decoded RGBA, decoded once a session instead of once a floor.

**The dear half of the cost was never the milliseconds.** A page load is a
new WebSocket, a new set of peer connections and a new person as far as the
server can tell. So walking through a front door dropped you out of Global
Chat mid-sentence; the Online count flickered down and back up for everybody
in the world, which is not what a count of who is here should ever do; and
the arriving page raced its own ghost for its own code and lost — refused
`already-online` on the doorstep of a building, by itself. The ping that
decides a contested claim cannot tell those two apart, because **a pong is
written by the browser's network stack rather than by the page's script**: a
page being torn down answers one exactly as a live page does.

`lib/room-travel.ts` is the one place a room changes. It pushes the URL and
says so with `room-changed`; three things listen.

| Who                                       | Does                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `components/game/systems/scene-router.ts` | Puts up the scene the new address names, clearing the cached tilemap first when that scene is the office — after a paint |
| `components/hud/Arrival.tsx`              | Covers the move, because building the next place is a stretch the browser cannot paint during. See **Covering a move**   |
| presence                                  | Nothing. The socket carries no room in its URL, and every scene's `create` ends with `place-entered`, which rejoins      |

**And the swap waits for a paint.** Building a place is one long synchronous
stretch — the room being left torn down, and the next one's ground laid, its
buildings put up, its trees planted — and on a second visit there is nothing
left to fetch, so Phaser runs the new scene's `create` inside the call that
asked for it. That call is a door firing in the old scene's own `update`, so
the browser never gets a frame between the two: what it holds on screen for
the whole build is the frame from **before** the door fired, with the
character still standing in the doorway. Which is exactly how it read — the
sprite freezing on the door rather than going through it, the hiding that
`board(true)` had already done never reaching the glass.

`afterPaint` in the router is the whole fix, and it buys two things at once:
the doorway's last frame is the one with the character already gone, and the
card the HUD put up on hearing the move is on screen before the thread is.
Two frames rather than one, because that card is React's and React commits
on a schedule of its own. Only the newest move is made — `go` reads the
address bar rather than what it was handed, so two inside one pair of frames
would both land on the second one's destination anyway.
`__tests__/scene-router-timing.test.ts` is what holds it, since nothing else
in the app would notice it stopping: the right room still comes up a moment
later, and the only sign is a frozen doorway and a card nobody ever sees.

Three ways of meaning it, one mover underneath:

| Function     | For                                | Pushes or replaces | Announces             |
| ------------ | ---------------------------------- | ------------------ | --------------------- |
| `travelTo`   | A move through the world           | Pushes             | When the room changed |
| `redirectTo` | An address that forwards           | Replaces           | When the room changed |
| `arriveAt`   | Walking into the world, first time | Replaces           | Always                |

`arriveAt` is the odd one and it earns it: somebody finishing the welcome
screen may already be standing on the world map, since a visitor is put out
there before they have said who they are. Travelling to the address you are
already at does nothing at all, which left the arrival card waiting on a
scene that was never going to be built. Everywhere else the guard is right —
a query parameter is not a move, and everything downstream reacts by throwing
a scene away and refetching the room.

**The router is the only reading of the address bar in the game layer.**
`destinationFor` names the scene and what to tell it; `EntryScene` is the
scene Phaser boots, and its whole job is now to hold the router and stay
alive for the next move. It used to read the address once and hand over, the
office restarted itself on `room-changed` so the lift could work, and every
other move was a navigation — three answers to one question, two of which
were wrong. Swapping is done through the SceneManager rather than a scene's
own `scene.start`, which shuts down the scene it is called on: right for one
place handing over to another, wrong for a router.

**A `RoomArrival` carries what the URL cannot**: the building or campus just
left, so the map stands you on your own path rather than putting you down on
the road like a stranger, and `walkIn` for a first arrival. Back and forward
are handled too (`watchRoomHistory`), or the address bar would name one floor
while the game drew another.
