# WaterCooler

A pixel office you walk around with other people. Workers sit at their desks,
residents wander the buildings, and everyone who opens the site is in the same
world — you see each other move and you hear each other on Global Chat.
Published to npm as `@geezerrrr/watercooler` and runnable with
`npx @geezerrrr/watercooler`.

**There is no text chat.** There was a Chat tab in the column beside the
office, an input box in it and a log of everything anybody had typed, kept
in the room's database. All of it is gone: the panel, the `say` message on
the socket, the `messages` table, and the two badges — Icebreaker and
Whisperer — that were earned by talking. Talking is **Global Chat**, which
is audio between browsers and one conversation for the whole server. The
column beside the office is now **People**, **Badges** and **Eggs**, in
that order, and the Online pill opens it on People. A `said` message still comes down
the socket, because the residents remark on arriving; it draws a bubble
that fades and nothing keeps it.

**There is no agent dispatch.** It was taken out root and branch — the task
system, the gateway, the CLI and hosted providers, the MCP and Mettara tools,
the spend ceiling and the seat sandboxes. What was the boss and their workers
is now a room with people in it. A seat is still a seat: it has a name, a role
and a look, and somebody sits in it — it simply has nothing to be given.
Anything below that still says "agents" means the residents, who are characters
rather than anything that runs.

The office is one building in a larger world: a world map with campuses, buildings
with lobbies and floors, an arcade, a ferry to an island. One server is one world —
everyone who opens the site walks into the same places and sees each other there.

The map is three screens wide in thirds — the **shops** in the west, the
**town** in the middle, the **wilderness** in the east — with thirty rows of
wood and a river along the top of the lot. See **The three stretches**.

## Commands

```bash
pnpm install
pnpm dev            # custom server (tsx server.ts) on :3000 — use this, not `next dev`
pnpm build          # next build (plain .next; the standalone tree is a publish thing)
pnpm start          # production, same custom server
pnpm test           # vitest, fast project only (~35s)
pnpm test:all       # every test, including the slow project — run before pushing
pnpm test:changed   # only tests whose imports reach what you changed (~7s)
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm format         # prettier --write .
pnpm build:map      # regenerate public/maps/*.json from the room specs
pnpm preview:map <file.json> <out.png> [scale]   # draw a map, without the game
pnpm check:sheets [Name...]   # measure the figure inside every installed character sheet
pnpm check:delivery <sheet.png>  # measure a delivered sheet before installing it
pnpm seed:erp       # seed the fictional company's SQLite database (--force to wipe)
```

Node 22+, pnpm 10 — `.nvmrc` pins it and CI reads that file, because the room
store and the ERP are built on `node:sqlite`, which arrived in 22.5. CI ran on
Node 20 for a long time and stayed green: nothing at CI time actually executed
the store, since route handlers are not run during a build. The first test to
import the presence socket brought the whole chain in and CI went red on a
commit that was fine.

CI runs format:check → lint → typecheck → build → test:all on every PR, so run
those before handing work back.

**Do not run the whole suite on every edit.** `pnpm test:changed` runs only the
tests whose import graph reaches what you touched — seconds instead of half a
minute. Two things it will not catch, so run them by hand:

- **Tests that read files at runtime.** `--changed` follows imports, and
  `exact.test.ts` sweeps `public/characters/*.png` with `readFileSync`. Change
  a sheet and scoping misses the one test that matters. Same for
  `assets.test.ts` and anything under `public/`.
- **Foundational modules.** `vitest related lib/map/office.ts` selects 25 files
  because half the codebase imports `TILE` from it. Scoping saves nothing there
  and that is correct.

`pnpm test` skips the `slow` project — two files that between them cost about
six seconds and twelve of the 1,070 tests (see `vitest.config.ts`). They still
run in CI and under `test:all`, which is what a push should use.

`pnpm dev:next` exists but skips the WebSocket layer — presence and voice both
break under it. Only reach for it to isolate a pure-Next rendering issue.

## Architecture

Next.js 16 App Router with a **custom HTTP server** (`server.ts`). The custom server
is load-bearing: Next alone cannot hold the WebSocket upgrades this app needs.

```
server.ts
├── attachPresenceSocket()   people, positions, speech, voice signalling
└── ensureErpData()          idempotent first-boot seed of the ERP database
```

There used to be a second socket beside it for agent runs, and the two were
kept apart on purpose — presence is lossy and constant, agent traffic was rare
and had to arrive. Only presence is left, and it is still the reason the
custom server exists: Next alone cannot hold the upgrade, and Next middleware
never sees one, which is why the access gate lives in `server.ts` too.

### The three layers

| Layer      | Lives in              | Rule                                                      |
| ---------- | --------------------- | --------------------------------------------------------- |
| Game       | `components/game/`    | Phaser. No React imports, no JSX.                         |
| HUD        | `components/hud/`     | React + pixel CSS. Never touches Phaser objects directly. |
| Server/lib | `lib/`, `lib/server/` | Shared logic and state. `lib/server/` is server-only.     |

Game and HUD talk **only** through the typed event bus in `lib/events.ts`
(`gameEvents.on/emit`, with every event declared in `GameEventMap`). Adding a new
interaction means adding an event there first. State lives in
`lib/store.ts` + `lib/reducer.ts` (React context + reducer), not in component state
and not on `window`.

### The door

`ACCESS_CODE` is one shared code that opens the whole world. It is exchanged for a
signed cookie (`lib/server/access.ts`) either by typing it at `/unlock` or by
arriving with `?code=…` on any path, which is what makes a shareable bookmark
possible. The cookie is an HMAC over its own expiry keyed by the code, so there is
no session store — and **rotating `ACCESS_CODE` invalidates every cookie already
issued**, which is the whole of revocation from the server's end.

**`/api/lock` is the other end of it: one browser giving its cookie back.**
There was no way out at all. The cookie is `HttpOnly`, so nothing on the page
can reach it, and with no session store to drop it from, a cookie handed over
stayed a way in for its whole week — the only answer being to rotate the code,
which turns out everybody holding it rather than the one browser that asked to
leave. The route sets the same cookie at `Max-Age=0`, which is why
`clearedAccessCookieHeader` is built by the same function as the one that sets
it: a browser matches a cookie on its name and path, so cleared under a
different `Path` it is a different cookie and the live one stays exactly where
it was, with a successful-looking response to show for it.

Two decisions in it:

- **It answers a GET as well as a POST.** `SameSite=Lax` carries the cookie on
  a cross-site navigation, so a link on another page can sign somebody out —
  against which: signing back in is one link away, and a way out that needs a
  button somebody has to build first is no way out at all. The button now
  exists (`components/hud/LockButton.tsx`) and navigates to exactly this route
  rather than reimplementing it; the address bar still works, which is what
  somebody locked out of the HUD has left. It sits at the foot of the People
  column with the music (`SidebarFooter.tsx`), not in the corner of the
  office: it is pressed once a session at most, and the corner of the office
  is a place a button is looked at all of it.

  It **asks twice** — one press arms it, the second leaves, and it disarms
  itself after four seconds. Signing out of an account is one thing; this is
  the whole world, and the code to get back in may have arrived in somebody
  else's link rather than being in this person's head. It clears the browser
  profile on the way out for the reason `AccountButton` does: this is the
  button somebody presses on a machine they are handing back.

- **It is on `isOpenPath`**, so it answers a cookie the gate would turn away —
  rotated, expired, or naming an identity this build no longer knows. Being
  locked out is the state you most want to be able to clear.

**The code in a link costs something.** Unlike a typed password it lands in browser
history, in the host's request log, and in whatever chat window the link is pasted
into. So `?code=` is honoured once and then **stripped by an immediate 302 to the
same target without it** (`urlWithoutCode`), leaving it in the address bar for a
single request; other query parameters survive, so `/r/x/floor/2?code=…&zoom=3`
lands on `/r/x/floor/2?zoom=3`. A wrong code in a link is stripped too — no sense
keeping it either — and the link path shares the form's attempt counter, so it
cannot be used to sidestep the rate limit. Cross-origin `Referer` leakage is
already covered by the `Referrer-Policy` in `next.config.ts`. If that trade stops
being worth it, the feature is one function (`handleCodeInLink` in `server.ts`).

The gate lives in `server.ts`, not in Next middleware, because **middleware never
sees a WebSocket upgrade**: both sockets attach to the Node server directly, so a
middleware-only gate would leave presence wide open. Every surface is covered
in one place — pages, API routes, and the upgrade
(`lib/server/presence-socket.ts` calls `isAuthorized`).
`checkOrigin` beside it is **not** authentication: it only constrains browsers, and
any other client can send whatever `Origin` it likes.

Left open by design: `/unlock`, `/api/unlock` and `/api/lock`, `/api/health` (the host's
liveness probe), `/api/auth/` (so sign-in can work), `/_next/` (without which the
unlock page cannot render).

**Without a code, production serves nothing and says so.** A deployment must not
come up open, so with no `ACCESS_CODE` the server answers the health check and
refuses every other request — sockets included — with a 503 naming what is
missing. Nothing else is even built: no Next and no presence socket, because
`isAuthorized()` waves everything through when no code is
configured and a running server with the sockets attached would have been open to
anyone. It used to `process.exit(1)` instead, which was equally closed and far
worse to run: the host had nothing to route to, so the deployment showed a bare
502 with the reason buried in its logs. In dev, no code just warns and the world
is open. Unlock attempts are rate limited to 10 per 15 minutes per address, in
memory — so the count resets on restart and is per-instance, not shared.

**The gate is only on `server.ts`.** There are two production entry points and
this one — `pnpm start`, and the Docker image Railway builds — is the gated one.
`server.prod.mjs`, which the published npm package runs, has no gate and serves
everything to whoever reaches the port; it is for `npx` on one machine and says
so at startup. The check is deliberately not duplicated there: it is TypeScript
the package cannot import, and a second implementation of an access check is how
the two drift — which is how that file came to be the ungated one in the first
place. Shipping one server instead of two is the fix when it matters.

**A code says who you are.** The cookie carries the identity it was opened with,
inside the signature and keyed by _that identity's_ code — so it cannot be edited
into somebody else's, and rotating one person's code turns out only them.

| Code                   | Identity   | What they get                                                     |
| ---------------------- | ---------- | ----------------------------------------------------------------- |
| `ACCESS_CODE`          | `visitor`  | The shared cast only, no office, no desk; starts on the world map |
| `ACCESS_CODE_COOP`     | `coop`     | Brought in as Coop, at Sandbox ERP, wearing his own look          |
| `ACCESS_CODE_ROB`      | `rob`      | The same, as Rob                                                  |
| `ACCESS_CODE_HUNTER`   | `hunter`   | Brought in as Hunter, at Castle Atlantic, wearing his own look    |
| `ACCESS_CODE_NATHAN`   | `nathan`   | As Nathan, at Sandbox ERP, riding that one lift and no other      |
| `ACCESS_CODE_SARA`     | `sara`     | As Sara, the same — she was one of the residents until this       |
| `ACCESS_CODE_ANDREW`   | `andrew`   | As Andrew, the same                                               |
| `ACCESS_CODE_CAMPBELL` | `campbell` | As Campbell, at Homestar — a campus, so each of its lifts         |
| `ACCESS_CODE_NICK`     | `nick`     | As Nick, a friend: his own look, no office, a visitor's lifts     |

**Adding a person is four places, and one of them bites.** `AccessIdentity`
(`lib/identity.ts`), a `Persona` and the `IDENTITIES` list (both
`lib/server/access.ts`), and `LIFT_REACH` for the floors they may ride.
`IDENTITIES` is the one to remember: `verifyToken` will not recognise a
cookie naming an identity that is not on it, so somebody wired everywhere
_but_ there is turned away by a code that is set and correct — the
`access.test.ts` round trip is what catches it. Their own sheet reserves
itself: `SHARED_CAST` offers a visitor the premade cast only, so a new
likeness is out of the picker the moment it is added.

**A name is the only part that is certain.** `home` and `characterKey` on a
`Persona` are both optional, because a code can name somebody the day it is
set while their office and their face arrive whenever they arrive. The
welcome screen asks for whichever is missing and writes in the rest, rather
than the code inventing an answer — the alternative for a look was naming a
file that is not there, which is a texture that 404s and a broken card in
their own picker. Nick is in that state on one of the two: his likeness is
drawn, and he works nowhere, so he is asked for no office. Hunter and
Campbell were both in it until their sheets arrived, and Campbell until he
went to work at Homestar.

**A resident cannot also hold a code, and the reason is their face.**
`RESERVED` in `lib/characters/library.ts` is built from `RESIDENTS`, and a
reserved look is kept out of `LIBRARY_CHARACTERS` — the list `looksFor`
searches. So a `Persona` naming a resident's sheet finds nothing, falls
through to the shared cast, and its holder is offered everybody's face but
their own. Sara was a resident until she was given a code; she came out of
`RESIDENTS` in the same change, which is what freed her sheet into the
library. The two states are exclusive, and `access.test.ts` says so rather
than leaving it to be rediscovered.

**`home` is an organisation, not a room.** It is what the welcome screen
asks a visitor to pick, and `isHome` checks it against `ORGANISATIONS` — so
Campbell's is `homestar`, which is a campus and no room at all. `LIFT_REACH`
is the other half and names buildings, because that is asked of a room slug.
The two look like the same fact and are not: one says who somebody works
for, the other says which doors open.

**"Works nowhere" is not the same question as "is a visitor",** and the two
came apart with Campbell, who now works at Homestar; Nick is the case today.
`worksNowhere` in `Welcome.tsx` is a visitor _or_ a persona with no `home`:
both skip the office half of the screen, because otherwise somebody with no
office is shown a list of offices none of which is theirs. Same for
`landsOutside`, which takes whether they have a building rather than the
identity — the root is the default room and the default room is an office, so
it is no more Nick's than a stranger's.

**A visitor starts outside.** The root is the default room, and the default
room is an office — somebody's building. A visitor has no building, so landing
them inside one puts them in the only place on the map that is not theirs,
with the door behind them. `landsOutside` in `lib/world/floors.ts` is the rule
and `server.ts` redirects on it: the root only, a visitor only, and only a
navigation — a typed `/r/<slug>` still opens that lobby, because a lobby is
public and a shared link has to work. `WORLD_SPAWN` already stands them on the
plaza.

**A look belongs to whoever it is of.** `looksFor` in
`lib/characters/library.ts` is the one rule: somebody whose own code names
their sheet wears that sheet and nothing else, and everybody with no sheet of
their own — a visitor, and equally a persona whose likeness has not been drawn
yet — chooses from the **shared cast**, the premade four and The Boss. Coop's
and Rob's likenesses are no more a newcomer's to put on than a stranger's.
Every personal code names a sheet as it stands, so the shared cast is the
visitor's screen and nobody else's.

So the picker is a **visitor's screen**: there is nothing for it to offer
somebody with one look, and the HUD's Character button is not drawn for them
(`ownLookOnly` in `GameHud.tsx`, assumed true until `/api/me` answers — a
picker that appears and then vanishes is worse than one that arrives late).

Enforced in three places, because hiding a button is decoration:

| Where             | What it does                                                                  |
| ----------------- | ----------------------------------------------------------------------------- |
| `GameHud`         | No button, so nobody is shown a choice they do not have                       |
| `/api/characters` | Answers `wearable` beside `characters` — what the person may wear, not a seat |
| `permittedLook`   | Clamps the `spriteKey` a connection claims, against the cookie                |

The socket is the one that actually holds: the browser says what it likes
over it, so a hand-edited profile would otherwise walk in wearing somebody
else's face. A persona is put back into **their own sheet** rather than into
whatever the connection last claimed, which may be the impersonation itself.
A persona used to be exempt from the clamp outright — the check asked "is
this a visitor?" rather than "may they wear this?" — so every personal code
was a way into everybody else's face, and a persona with no sheet of their
own into the lot.

**A clamped connection is told, and puts on what it was given.** The clamp
answered the whole world and not the browser it refused: the scene goes on
drawing whatever `lib/characters/choice.ts` remembers, so somebody wearing a
look that was turned down looked like themselves on their own screen and like
the default character to everybody else, with nothing anywhere to say why —
the same fault an uploaded sheet once had, from the other end. The welcome
carries our own entry, so `usePresence` compares it with what was claimed and
wears the difference, which re-joins in it and settles on the next welcome.

Two things that fell out of fixing it:

- **The fallback has to name a sheet.** A refused claim with nothing to keep —
  a visitor's first join — fell back to the word `"player"`, which is no
  texture key at all: every scene and the People panel alike fell through to
  the default sheet on their own, so it read as an answer everywhere while
  being the absence of one. It is `BOSS_SPRITE_KEY` now.
- **`sheetPathFor`** (`lib/characters/library.ts`) is the one way back from a
  key to a sheet — shipped or uploaded. Three places had written it out
  separately and the newest was the only one that knew about the boss.

The list an agent may be dressed from is a different question and stays the
roster: a seat wears whatever has been uploaded to the room.

**Private floors.** Two things in `lib/world/floors.ts` decide who goes up, and
they answer different questions:

- `PRIVATE_LIFTS` is a list of buildings whose floors are shut to the public —
  today `sandbox-erp` and `castle-atlantic`. A building not listed is open to
  whoever walks up, so a new one needs no entry.
- `LIFT_REACH` is how far a named person may go, which is their business
  rather than the building's.

| Person   | Reach                          | Rides                                       |
| -------- | ------------------------------ | ------------------------------------------- |
| Coop     | `"every"`                      | Every lift in the world                     |
| Rob      | `"every"`                      | The same                                    |
| Hunter   | `["castle-atlantic"]`          | Only where he works — not even a public one |
| Nathan   | `["sandbox-erp"]`              | The same, at his own building               |
| Sara     | `["sandbox-erp"]`              | The same                                    |
| Andrew   | `["sandbox-erp"]`              | The same                                    |
| Campbell | Homestar's three office blocks | Only where he works, which is a campus      |
| Nick     | _no entry_                     | Everything except a private building's      |
| visitor  | _no entry_                     | The same                                    |

Campbell's is a list of **buildings**, not his organisation: this is asked
about a room slug, and Homestar is a campus — `homestar-sales`,
`homestar-finance` and `homestar-operations` are the three of its buildings
with floors to ride to, and its store, warehouse and field crew have no lift
at all. A single-building organisation's slug happens to be both, which is
why Hunter's and Nathan's read as their employer.

`"every"` means every lift **including a building made private later**, which
is what "all the elevators" has to mean or it quietly stops being true the
next time a building is shut. And **an empty list is not the same as no
entry**: no entry falls through to the building's own rule, which is how a
visitor — and Nick, a friend rather than an employee — gets the public lifts;
an empty list is no lift anywhere. Nobody holds an empty one today, Campbell
having gone to work; `floors.test.ts` lends him one for the length of an
assertion rather than leave the distinction untested, because anything
reading `LIFT_REACH` with `if (!reach)` hands its holder the lot.

It used to be one record keyed by building, saying who may go up in each. That
could express neither of the rules above — a person barred from the _public_
lifts too, or one who should be carried up in a building nobody has made
private yet — so access moved to the person and the list kept the one job it
was good at.

The **lobby stays public** throughout: a visitor may walk in, look round and
talk to whoever is there. It is the desks and the agents above that are shut.

Enforced in three places, for the same reason a look is:

| Where                           | What it does                                              |
| ------------------------------- | --------------------------------------------------------- |
| `OfficeScene`                   | The lift will not open; the character says `LIFT_REFUSAL` |
| `blockedByFloor` in `server.ts` | A typed or shared floor URL is sent down to the lobby     |
| `attachPresenceSocket`          | A `join` for that room is refused `reason: "private"`     |

The scene's copy of the identity is asked for straight from `/api/me` rather
than taken over the event bus, because the game layer holds no React and an
emit that lands before the scene subscribes would never arrive; it assumes
`visitor` until the answer comes, since a gate that is open while it waits is
not a gate. None of the three is the gate on its own — the lift is what a
person feels, the socket is what actually keeps them out of the room.

A personal code names its holder, so the welcome screen asks them nothing — name,
office and look are written straight in. Giving two people the same code, or
reusing the shared one, would hand over that identity; the server says so loudly
at boot rather than letting it pass.

Know the limits: the shared code has no per-person revocation and no record of who
came in on it. Sign-in below is the finer-grained answer and layers on top.

### Sign-in

By default a person is a browser profile — name, home building and character in
localStorage, with the room link as the only credential. Configure Auth.js and they
become accounts known by email, with profile and counts following them across
devices.

Create an OAuth app in the Google Cloud console and one in Microsoft Entra (App
registrations), each with a redirect URI matching your host and port:

```
http://localhost:3000/api/auth/callback/google
http://localhost:3000/api/auth/callback/microsoft-entra-id
```

Then `AUTH_SECRET` (`npx auth secret` writes one), `AUTH_GOOGLE_ID` /
`AUTH_GOOGLE_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ID` / `_SECRET`, and optionally
`AUTH_MICROSOFT_ENTRA_ID_ISSUER` (`https://login.microsoftonline.com/<tenant>/v2.0`
to allow one tenant only) in `.env.local`.

A provider is offered on the welcome screen when **both** of its keys are present;
with none present, sign-in is off and profiles stay in the browser. Accounts live in
the `accounts` table of the room database: provider display name and picture, the
chosen profile, a visit count, and a `stats` map any feature can count into with
`bumpAccountStat`. A signed-in person's desk and presence go under an id derived from
their email (`lib/server/person-id.ts`), which is what keeps their desk the same from
every device.

This is also why `server.ts` passes `port` to `next()` — Next builds each request's
absolute URL from what it is told there, not from the socket, so without it sign-in
callbacks point at 3000 whatever port the server is actually on.

### Walking in

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

### Presence

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
politely — a connection taken out of its room is swept by nothing afterwards,
since the heartbeat walks the rooms, so one left waiting on a closing
handshake nobody is there to finish would sit open for as long as the server
runs. Usually nobody sees the message; where somebody does, it is two tabs
that ended up sharing a session, which is what duplicating a tab does.

`claiming` is the other half of it. The challenge takes a moment, and a
third connection arriving inside that moment would find the incumbent still
in the room and start a second challenge of its own — two newcomers, each
told the ghost is gone, both let in. Whoever is already contesting an
identity has the claim; anybody else is refused while it is decided.

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
  were in the same conversation. The join broadcasts; the drop holds its
  tongue, except where the join is then refused for a full room, which is
  the one move that ends nowhere.
- **Their tab is still their tab.** `session` is what tells one person
  coming back from two people arriving, so forgetting it here left anybody
  who had changed room once to be challenged on their next reload —
  pinged, answered by their own ghost, and turned away from their own
  world. One door was enough to arm it.

The client has the other half of the first, in `GONE_GRACE_MS`
(`lib/voice/voice-chat.ts`): gone from the list is the only way a browser
learns that somebody has left, and a single list without them in it is not
that. A reconnected socket is the next gap of this shape, and there is no
reason to let it cost a conversation either.

**A dead socket is noticed.** The heartbeat pings every `HEARTBEAT_MS` and
now reads the pongs; a connection that misses one is terminated. It used to
ping and ignore the replies, so an abandoned socket counted as present until
it went `IDLE_TIMEOUT_MS` — fifteen seconds — without speaking. The client
sends nothing on a timer, only movement, so that clock is the only thing
that was catching it.

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

### Badges

Thirty-two of them (`lib/badges.ts`), in six groups — Getting about,
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

| Holder    | Keyed on                  | Because                                                              |
| --------- | ------------------------- | -------------------------------------------------------------------- |
| A persona | Their `AccessIdentity`    | The code names exactly one person, so it follows them to any browser |
| A visitor | `guest:<lowercased name>` | The shared code names nobody; their name is the only handle there is |
| A local   | — they hold none          | A resident is how a badge is _got_, not somebody who gets one        |

The guest case is weak on purpose and marked as weak: two people who both
call themselves Guest share a shelf, and the panel prints `guest` beside
such a name. Sign-in is the finer-grained answer, exactly as it is for the
door.

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

| Rule                            | Fired by                                  | In                     |
| ------------------------------- | ----------------------------------------- | ---------------------- |
| `onArrival`                     | Every `join`                              | `presence-socket`      |
| `onAlone`                       | The online list coming down to one person | `broadcastOnline`      |
| `onRoomFull`, `onMeetingJoined` | A join that fills a room / walks into one | `presence-socket`      |
| `onMicOn`, `onMeetingCalled`    | `mic` and `meeting` messages              | `presence-socket`      |
| `onWhiteboard`, `onPingPong`    | A finished stroke, a relayed rally        | `presence-socket`      |
| `onMingle`                      | Somebody coming to stand beside a local   | `ResidentSimulation`   |
| `onCaught`                      | Getting a hand on a resident mid-bolt     | The socket's `caught`  |
| `onScore`                       | The two high score routes                 | `machine-badges.ts`    |
| `onBasket`                      | A thrown ball falling through a rim       | `stepBasketball`       |
| `onOutdoors`                    | A `move` into the wood or the wilderness  | The socket's `wentTo`  |
| `onRunThrough`                  | A car's box covering somebody             | The socket's `runOver` |
| `onEggFound`                    | An egg taken out of the grass             | `presence-socket`      |
| `onEggLaid`                     | A fright that left one behind             | The socket's `laid`    |

Six of those would otherwise write to the database far too often — a rally
sends a message a frame, a move arrives twenty times a second and the
online list refreshes on a timer — so `once(person, code)` in the socket
settles each one per run before the store is asked at all.

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
  `lib/world/eggs.ts` — a seventh kind of egg moves it. Its marks are
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

### The cast, and profiles

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
  look and whatever they have earned, which is a real profile. What they do
  not get is a backstory and a picture, and the card says so rather than
  showing a broken image.

**It is a fourth place to edit when somebody joins the world**, after the
three under the access table above, and `cast.test.ts` is what makes that
survivable: every entry has to name a real persona or resident, agree with
them about name, organisation and sprite, wear a sheet in `WORKER_SPRITES`,
and name a concept sheet that is actually on disk. A missing entry is a
failing test rather than a blank card.

### Voice chat

Audio goes browser to browser over WebRTC (`lib/voice/`). The room socket carries
only the handshake; **the server never hears anything**.

**It is called Global Chat, and the words are the point.** There are two
states and no third: a microphone is on, which is being in the chat, or it
is off, which is not. So the pill in the bottom bar is the mic icon on its
own while you are out of it, and `Global Chat (3)` in green while you are
in — the name of the one conversation and how many people are in it.
`2/5 on mic` was there before, which counted the same two numbers and
named nothing, so the thing being joined had no name anywhere in the app.
Everything underneath — peers connected, peers still negotiating, a
network that needs a relay — stays in the tooltip, because a connection
being made is not a third kind of membership.

**But the number is who you are in it _with_, not how many microphones are
on.** Those are the same number whenever the app is working, and the
difference between them is the only thing worth saying when it is not. The
pill counted `withMic`, straight off the server's list, so it reported a
conversation the server believed in rather than one this browser was
having: two people could hear each other until one of them walked
upstairs, and the pill, the People panel's green badges and the marks over
both their heads went on agreeing with each other about something none of
them had checked. So `failed` and `silent` come off it — the two states
nothing is going to mend on its own — and the tooltip says which. Not
`peers`, which would count up through every handshake and dip for a second
on every arrival: a connection being made is still not a third kind of
membership.

Being in it is said in three places, and they answer different questions:

| Where                  | Says                                                                    |
| ---------------------- | ----------------------------------------------------------------------- |
| The pill (`BottomBar`) | Whether **you** are in it, and how many people are                      |
| The People tab         | **Who** is in it — a green `Global Chat` badge beside each, and a count |
| The mark over the head | That **this person here** is in it, in the room you are both in         |

**The mark is up while their microphone is, not while they are talking.**
It used to appear only mid-sentence, which showed talking and never showed
membership — somebody standing in the chat saying nothing looked exactly
like somebody not in it, and they are the person most worth knowing about,
since they can hear you. It is grey for in the chat and green for speaking
now, and it comes off the roster's `mic` flag rather than off the audio,
so it is up the moment they join.

Two things about it:

- **Drawn rather than lettered** (`components/game/utils/voice-mark.ts`).
  It was a `🔊`, and an emoji's colour belongs to the font — there is no
  tinting one from grey to green. Eight pixels by twelve of rectangles is
  the same picture and its colour is ours.
- **Green needs your own microphone on.** Speaking is measured from the
  audio, and there is no audio from anybody unless you are in the chat
  yourself. Out of it, everyone in it is grey — which is honest, since
  nothing on that screen has heard them.

**Your own character carries one too, and it took an event to do it.**
Everybody else's comes off the roster, and we are not in our own copy of
it — `usePresence` filters us out — nor is our own level received over a
connection, since it is measured here. So the one character this browser
knows most about was the one with nothing over its head. `voice-self` on
the bus (`lib/events.ts`) carries both halves, `Player.setVoice` draws it,
and `attachPresence` takes an `ownVoice` exactly as it takes `ownSay` —
everybody else is `RemotePlayerManager`'s, and ours is the one it does
not own.

Two things in it are load-bearing:

- **The state is pushed in when a scene attaches, not only on a change.**
  A door and a lift ride each build a new character, and a bus carries
  only what happens next — so somebody walking into a room with their
  microphone already on would arrive bare and stay that way until the next
  time anybody spoke. `attachPresence` asks `voiceChat.snapshot()` for
  what is true now.
- **The mark's depth is read off the sprite rather than written down.** A
  room puts the local character at a flat 5; outdoors gives it a depth off
  its own feet, several hundred, so that it passes behind a building. A
  constant right for one is a mark drawn through the scenery in the other.

It follows the character from `Player.move`, which is where the keys, the
pad and a tapped route all end up — a mark left behind by one of the three
is a bug nobody would think to look for.

**One conversation for the whole server.** Switching a microphone on joins it: you
hear everyone else who has theirs on, at full volume, wherever in the world they are
standing. Two things follow, and both were the other way round before:

| Where                                       | Was                                   | Is                                          |
| ------------------------------------------- | ------------------------------------- | ------------------------------------------- |
| Who to say hello to (`voice-chat.ts`)       | The room's roster (`presence-roster`) | Everyone on the server (`presence-online`)  |
| Where a signal is delivered to (the socket) | The sender's room only                | The one person it is addressed to, anywhere |

A `left` on the room socket is no longer the end of somebody's voice, either: it
means they walked into the next room, on the same connection, and dropping them
there would cut a conversation off at every lift ride with nothing to mend it. Who
has actually gone is the server's own list — **once they have been gone from it
for `GONE_GRACE_MS`**, which is the same argument one level up: the list is a
snapshot taken between two things happening, and a person walking through a door
is out of one room before they are into the next. See **Presence** for the server
side, which no longer publishes that particular gap at all.

"On the same connection" is now true of **every** door rather than only the
lift's — see **Rooms and places**. It had to become true for any of this to
work: a front door was a page load, which takes the peer connections down with
the page, so a conversation survived a floor and not a building. Nothing here
changed to fix that; the navigation did.

It used to be proximity voice, per room, each voice faded by distance — full within
three tiles, silent past nine, linear between. Distance is the wrong measure once
the chat spans rooms: a floor above has coordinates of its own, so the same numbers
mean a different thing in every place. The fade went rather than being kept unused;
`lib/voice/proximity.ts` says what it was, and those three numbers are the whole of
it if it comes back.

`lib/server/__tests__/voice-reach.test.ts` drives real sockets against a real server
to hold the handshake to crossing rooms — and to still being a post box rather than a
megaphone, since nothing else about the app would notice a signal going to the wrong
person.

**A greeting is an instruction to start again.** `hello` says a microphone
is on and means "throw away whatever you hold for me"; `hi` is its answer and
is deliberately a second word, because a `hello` answered with a `hello` is
itself answered and two sides that each start again on one never finish
starting again. Whichever id sorts lower then offers (`offers` in
`proximity.ts`), so the two of them agree without saying so.

It used to be ignored outright when a connection to that person already
existed, and that one `if` is most of why voice chat worked about one time in
fifty. **A connection is two-sided and every way of losing one is one-sided:**
a `failed` is noticed by whichever side noticed it, and `roster` dropped
anybody briefly missing from the server's list. So the side that dropped said
hello and the side that had not said nothing at all — silently, for the rest of
the session.

Three things follow, all in `lib/voice/voice-chat.ts`:

| What        | Rule                                                                                                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sweep`     | The retry, on a timer. Anyone on mic without a settled connection is greeted again, backing off from 5s to a minute. There was none before — `greeted` was a set, so a gate       |
| `negotiate` | One step at a time per connection. Two crossing greetings meant two negotiations on one `RTCPeerConnection`: the second throws into a promise nobody holds and wedges it for good |
| `settled`   | `disconnected` counts as still connecting for `NEGOTIATE_GRACE_MS` — WebRTC passes through it on a hiccup and usually comes back on its own                                       |

**What goes wrong after the connection is made is a different repair.**
The three rules above are about a handshake that never took. A
conversation that was working and stopped has almost always lost its
_route_ rather than its connection — a wifi handover, a NAT rebinding, a
relay that dropped the pair — and `restartIce` is what that is for: fresh
candidates, everything else kept, audio back in about the time one
exchange takes instead of the time a whole handshake takes.

| Rule                          | Why                                                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A `failed` connection is kept | It used to be closed on the spot, which left the sweep nothing to mend and a whole handshake to run in its place. Closing it is the sweep's to do, once mending is ruled out              |
| Mend only what worked         | `everConnected`. A handshake that never completed is more likely wedged than misrouted, and no amount of fresh candidates mends a connection whose description went wrong                 |
| One mend, then rebuild        | `restartedAt`, cleared when it connects. A second restart that fails the same way is a minute of silence spent on the wrong remedy                                                        |
| Only the offering side        | A restart _is_ an offer, so two of them crossing is the thing `offers` exists to prevent. The other side needs no new code: a restart arrives as an ordinary offer and is answered as one |

**And two ways of being in the chat, connected, and silent.** Neither
touches the connection, which is why nothing about the connection would
ever have caught them:

- **The microphone is taken away.** A device can be given and then
  reclaimed — the OS hands it to another app, somebody unplugs it — and
  `track.onended` is the only warning a browser gives. Without it the pill
  stays green, every peer stays up and the person goes on believing they
  are in the conversation while sending silence at it. It leaves the chat
  and says why, and deliberately does **not** remember the microphone as
  on: coming back on the next page with the same dead device is somebody
  told twice that they are in a conversation they cannot speak into.
- **The browser will not start playback.** `play()` on a fresh `Audio` can
  be refused, and that was a line in the console. It is `silent` on the
  view now, off the pill's count and named in the tooltip, and the sweep
  asks again every few seconds — which is what a context that has since
  been woken needs to hear.

`failed` is a **set, counted now** (`unreachable`) rather than the running
total it was. The total only ever went up, so a pair that failed once and
connected on the retry went on being reported as unreachable for the rest
of the session; a number that cannot come down is not a report of
anything.

**None of it invents a route that is not there.** Two browsers with no
path between them — a symmetric NAT on either side and STUN alone — never
connect however well any of this behaves, and the answer is the TURN relay
above, at **build** time. Everything here is about making sure that is the
only reason left.

`lib/voice/__tests__/handshake.test.ts` pins all of it against a stub
`RTCPeerConnection`: which messages go out and when, not WebRTC.

**Routing uses a public STUN server, and the policy has to say so.**
`connect-src` covers an ICE server exactly as it covers a fetch, and one it
does not name is **dropped without a word** — which leaves a browser holding
only the candidates it can see on its own network. So the addresses live in
`lib/voice/ice.ts`, which `voice-chat.ts` builds peer connections from and
`next.config.ts` reads for the header: written down twice, it is a policy that
stops naming a server the moment somebody changes one.

Browsers behind strict NATs need a TURN relay: `NEXT_PUBLIC_TURN_URL`,
`NEXT_PUBLIC_TURN_USERNAME`, `NEXT_PUBLIC_TURN_CREDENTIAL`, offered alongside
when set. **`NEXT_PUBLIC_` means the build, not the run** — Next inlines them
into the browser bundle, so setting them on a running service does nothing
whatever. The image takes them as build arguments (`Dockerfile`), which on
Railway means adding them to the service's build variables; without that the
deployed app has STUN and nothing else.

### Rooms and places

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

| Who                                       | Does                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `components/game/systems/scene-router.ts` | Puts up the scene the new address names, clearing the cached tilemap first when that scene is the office                     |
| `lib/store.ts`                            | Refetches the room, since `room-client` reads the slug off the URL at call time and only the store held the old room's world |
| presence                                  | Nothing. The socket carries no room in its URL, and every scene's `create` ends with `place-entered`, which rejoins          |

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

### Floors

A building with floors has a lobby, Floor 1 for its people's desks and
Floor 2 for its workers'. Some have a third, **Floor 3 · Operations**, and
what makes one is naming the boards that hang on its wall:

```ts
// lib/world/tenants.ts
lobby("sandbox-erp", "sandbox-erp", {
  game: "pinball", helpDesk: true,                     // the lobby
  operations: ["trello", "zoho"], projects: 5,         // the floor above
  boards: [                                            // a project board per room
    { board: "Sandbox Main App", lanes: ["Backlog", "Refined", "In Progress", "In Review", "Testing"] },
    { board: "Hammer Time", lanes: ["Backlog", "Refined", "In Progress", "In Review", "Done"] },
    { board: "Reports App", lanes: ["Backlog", "Refined", "In Progress", "In Review", "Testing"] },
  ],
}),
lobby("castle-atlantic", "castle-atlantic", { game: "pong", operations: ["trello"], projects: 3 }),
```

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
rather than a redrawn floor. Sandbox ERP's is 55 tiles wide, Castle
Atlantic's 37.

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
file name** — `floor-ops-trello-zoho-6-flow3.json` — because the boards alone
no longer identify a floor: two buildings with the same boards and different
numbers of projects are different floors, and sharing a file would give one
of them the wrong corridor. The `-flow3` on the end is the same argument
about the project rooms below: each hangs a board and a plate of counts, so
a floor with three of them is not a floor with one.

**A project board is a room, not a choice.** `boards` on the tenant names
them in the order their rooms run: the first has **Operations**, the room
above the lift and the one you step out facing, and the rest take the lower
rank left to right. Each room gets the board in the left-hand corner of its
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
  it, and nothing counted beside it, exactly as every floor was before.
- **The lift's room hangs nothing.** The car is three tiles tall and hangs a
  tile below the cap of the lower wall, which is the first lower room's own
  wall face — so a board on the left of it is a board with a lift drawn
  across the end. It is skipped for the same reason it is not Support, and
  `opsProjectRooms` asks `opsElevator` rather than writing down "not the
  first lower room". Which is why three boards want six rooms, and why
  `operationsRoomCount` grows the floor to fit rather than leaving a board
  with no wall.
- **The browser never names a board.** The map letters its points of
  interest `Project board 2` / `Project flow 2`; the number is the
  **subject**, captured by the fixture's own `match` and carried on its open
  event (see **Fixtures**), and the panel asks `?room=…&slot=2`. A slot is
  geometry — the map is shared by every building with this many boards —
  where a board name is the tenant's, and a request that named one could
  name any board the token can see.

**The lift is set into the lower wall, directly beneath the door to
Operations**, not at the end of the corridor. The ride has to land you
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

Painted rather than plated, which is the whole difference from the plate
inside — no bays, no bars, the wall's own two colours, and no flash on a
number that moved. Paint does not change while you watch it. `DeskWeek` in
`systems/SupportPulse.ts` is the drawing; it keeps a timer, so it hands back
a teardown like the boards do.

**The middle figure is the two of them subtracted**, and it is the one
thing on the wall with a colour: red where the week put the desk deeper in
than it started, green where it saw off more than it took on, and the
wall's own ink where it came out level. `weekNet` in `lib/zoho/pulse.ts` is
the arithmetic and the lean; `NET` in `SupportPulse.ts` is the two colours,
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
`components/game/utils/wall-lettering.ts` is the one rule, and every
painted thing goes through it: the building's name and the line under it,
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
the board hanging in it (`opsProjectSign`, drawn by `addProjectRooms`).
Nothing else on the floor is named and nothing else needs to be. A building
running no support queue has no such room and gets no sign, which is Castle
Atlantic — and one naming no board letters nothing either, since PROJECT
BOARD over a project board says less than the sign already on it.

**Fourteen tiles of wall, three things on it, and the layout written down
once** — `BOARD_WALL` in `lib/map/floor.ts`, for **both** kinds of working
room, because Support and a project room are the same arrangement. **Both
pictures go hard into their corners** — the board into the left, the five
counts running to the right — and the room's own name has what is left
between them, drawn at the size the building's name is drawn downstairs.

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

**The five counts are a second way of looking at the same queue,** so they
come with the queue rather than being declared: `SUPPORT_PULSE` is not a
`BoardKind`, and a building running no support desk has nothing for them to
count. What is standing in three statuses, and what was raised and closed
today. The week's two come with the queue for the same reason and hang
outside the room, above.

They are one of the two fixtures whose picture is its numbers, which is why
nothing delivers art for them. `systems/CountBoard` draws the plate, the
bays and the figures and keeps them current on `PULSE_REFRESH_MS`; the
registry entry carries no `art` and no `sign`, so `FixtureManager` only
does the `Press E`. A static image under live text would be a second,
wrong copy of it.

**The other one is the project board's, and they are the same board drawn
twice.** `systems/CountBoard` is the plate, the bays, the size the figures
fall back through, the flash on a number that moved and the teardown that
keeps a timer from outliving a lift ride; `SupportPulse` and `ProjectFlow`
are the two adapters over it — what the bays are called, and where the
numbers come from. It was written once and copied, two hundred lines
apiece, which is the shape of duplication this codebase has been bitten by
twice already.

Two things differ between them, and only one is worth remembering:

|            | Support's counts                                        | The project board's                                  |
| ---------- | ------------------------------------------------------- | ---------------------------------------------------- |
| Banks      | Two, with a line between: standing, and today's traffic | One, wrapped over two rows — five stages of one flow |
| Comes with | The `zoho` board, wherever the queue hangs              | One per entry in `boards` on the tenant              |

The bank is the whole of it. Three standing counts and two day counters are
scaled separately because a standing total against a day's flow is not a
comparison; Backlog through Testing _are_ each other's comparison, so one
scale and no dividing line. `divider` on the spec is that decision and
nothing else.

**Which stages, and off which board, is the building's** — `boards` in
`lib/world/tenants.ts`, one entry per project room, each naming its Trello
board and the lists it counts in the order they run. Read when the numbers
are fetched rather than when the map is drawn, so renaming a board or a lane
is not a `build:map`; the map only carries the five tiles and the point of
interest, and those are the same tiles whatever anything is called. The
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
  Production and RCA / Incidents — because a wall counting five of seven
  lists should say which two it is not counting.

`laneShort` is what the wall letters: a bay is eighty pixels and a letter
eight of them, so "In Progress" is WIP, the same word the support board
next door uses for the same thing. Anything unlisted is its own name in
capitals, dropped a size if it does not fit.

The arithmetic is `lib/zoho/pulse.ts`, pure, and the sweeps are
`fetchPulse` in `lib/zoho/client.ts`. Three sweeps rather than one page,
because they are three questions:

| Sweep    | Asks Zoho for                         | Stops when                        |
| -------- | ------------------------------------- | --------------------------------- |
| Standing | `status=New,Queue,In Progress`        | The pages run out                 |
| Opened   | Everything, `sortBy=-createdTime`     | A ticket is older than Monday     |
| Closed   | `status=Closed`, `sortBy=-closedTime` | A ticket was closed before Monday |

**Still three sweeps for seven counts.** The week is the longer reach of the
two boundaries, so the traffic sweeps stop there and the day's counts are a
prefix of what they already read — a second pair of sweeps to midnight would
ask Zoho again for tickets it has just handed over.

Five details are load-bearing. Zoho's `from` is **one-based** — its first
record is 1 and 0 is treated as 1 — so a zero-based offset reads the
boundary record twice on every page and counts it twice with it. The
`sortBy` on the last two is not tidiness: they stop early on the first
ticket past the boundary, so the order is the only thing that makes them
exact from one page. A sweep that hits `PULSE_MAX_PAGES` marks its counters
`capped` and the figure is written `600+`, because a floor that looks like
a total is worse than no number — but **capped is asked per boundary now**,
since one sweep answers two questions: running out of pages somewhere inside
the week says nothing about today if the sweep got as far back as midnight,
which on a busy desk is the ordinary case (`sweptPast`). And a bar is a
share of its own **bank** — the three standing against each other, the two
day counters against each other, the two week counters against each other —
since one scale across the lot would measure a standing total against a
day's flow, which is not a comparison.

There is no count endpoint behind this. `/ticketsCountByFieldValues` needs
a scope the desk's token does not carry, and `/tickets/count` insists on a
`viewId`; both were tried against the real desk. Paging a filtered list is
what is left, and it is exact.

`ZOHO_PULSE_STATUSES` names the three standing statuses, comma separated,
and they must match the desk's Status picklist **exactly** — Zoho's filter
is by literal value. They map onto the three bays by position, so the first
named is the left-hand bay whatever it is called. Sandbox ERP's desk carries
New, Queue and In Progress among its nine, which is where the default comes
from.

**"This week" is Monday to now, on the desk's clock.** Monday because a
support desk's week is a working week: a Sunday ticket belongs with the
weekend it arrived in rather than opening the week that is about to be
worked. `weekStartIn` is the boundary, and it steps back **whole days on
the desk's own calendar** rather than subtracting days of milliseconds from
its midnight — a week with a clock change in it is 167 hours or 169, so the
arithmetic that looks right lands an hour inside Sunday or an hour inside
Monday twice a year, which moves two figures on the wall.

**"Today" is the desk's day, not the server's.** A support desk's day
belongs to the people working it, and the same build runs on a laptop in
one timezone and a container in another — left on the host's clock, a
deploy would move the day boundary of two counts on the wall without
anything changing about the desk. `dayStartIn` in `lib/zoho/pulse.ts` is
the boundary and `fetchDeskZone` finds the zone, in this order:

| Source         | Where from                      | Why not first                             |
| -------------- | ------------------------------- | ----------------------------------------- |
| `configured`   | `ZOHO_TIMEZONE`                 | —                                         |
| `organisation` | `timeZone` on `/organizations`  | Zoho leaves it **null** on many accounts  |
| `agents`       | The commonest zone on `/agents` | Their clock, not the desk's, in principle |
| `server`       | The host's own midnight         | An accident of where the container runs   |

`Pulse.zone` reports which of the four answered, and the panel says so
where it matters — a desk on `agents` names the zone, and one that fell all
the way through to `server` says that is what happened rather than looking
like an answer. Sandbox ERP's org field is null and its four agents are
three Halifax to one Toronto, so it lands on `agents` and
`America/Halifax`; a majority rather than the first one listed, with ties
broken alphabetically so the boundary does not drift with Zoho's ordering.

Three things in there are easy to get wrong and all of them look fine:

- **`hourCycle: "h23"`, not `hour12: false`.** Some ICU builds write
  midnight as `"24"` under the latter, which puts the boundary a day out.
- **Two passes over the offset**, which both boundaries go through. The
  offset in force _now_ is not the one in force at that midnight on the two
  days a year the clocks move, so the answer is re-derived from itself and
  the version that actually reads as midnight there is the one kept. The
  week's first guess is up to six days from now, so it is the more often
  wrong of the two and the refining pass is doing real work there rather
  than covering a corner. That is a check rather than a hope, and
  where neither reads as midnight — a zone whose clocks change _at_
  midnight — the first pass stands: an hour out on one day, rather than a
  day out.
- **The offset comes off a formatter,** not a table. The platform already
  knows every zone's history; a second implementation of that is a second
  thing to be wrong.

A zone lookup that fails is **not cached**, so a Zoho blip during the first
read does not pin the day to the server's clock until somebody restarts.

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
`floor-ops-trello-4.json` and `floor-ops-trello-zoho-6-flow3.json` — so two
buildings running off the same boards, with the same number of rooms and
project boards, share one map and a third needs no new file.
`pnpm build:map` writes one per set actually in use, read off `TENANTS`.

The `?project=1`, `?flow=1` and `?desk=1` query parameters open a panel from
anywhere, which is a development shortcut rather than a way into the room:
what is on the wall is what the floor's map carries. A link names no point of
interest, so the two project panels open on the first room's board — the
building's own, in Operations.

### Asset URLs

Everything under `public/{characters,maps,tilesets,sprites,ui}` is rewritten
**in place** — `build:map` regenerates the maps, `build-character.ts`
overwrites a sheet — so the path stays put while the bytes change. That left
one cache setting to choose between two bad outcomes: hold the files and
somebody walks around as yesterday's sprite, or don't and every room change
revalidates a hundred files.

`asset()` in `lib/assets` settles it by putting a content hash in the query:
`/characters/Coop_48x48.png?v=4ebb095c`. New bytes, new URL, so a cache hit is
only ever a hit on the right file — which is what lets the header be immutable
for a year, gated on `?v=` being present (see `next.config.ts`). The `has` and
the `missing` on those two tiers have to exclude each other: Next applies every
matching header rule and lets the last one win, so without the `missing` a
versioned request matched both and came back with the hour.

Call it **where a URL becomes a fetch** — `this.load.image(...)`, an `<img
src>`, a CSS `url()` — not where a path is worked out. `mapFileFor` and
`WORKER_SPRITES` stay plain paths, and their tests go on comparing plain
strings. `ensureSheet` hashes for every scene that swaps somebody's look, so
that one is covered in a single place.

The manifest is generated by `pnpm assets` and **committed**, because a stale
one is exactly the bug this prevents — a URL that doesn't change when the file
does. Three things keep it current: `pnpm build` runs the generator first
(chained explicitly, not as `prebuild`, because pnpm leaves pre/post scripts
off by default and it would silently never run), `build:map` runs it after
regenerating maps, and `assets.test.ts` fails with the list of changed files if
it drifts. Unknown paths pass through unhashed rather than throwing — uploaded
characters come from `/api/characters/<id>`, which is a route and not a file.

### Maps

**A room loads the sheets it needs, not the whole cast.** `OfficeScene` used to
preload every entry in `WORKER_SPRITES` — fifteen sheets, 114MB of RGBA decoded
and cut into frames on the way into every room, to draw two or three of them.
It now loads the default sheet and the player's remembered look, read from
localStorage in `preload` so nobody appears as the default for a frame first.
Everyone else arrives on demand: seats through `WorkerManager`, which already
fetched what was missing, and other people through `dressRemotePlayers`.

**Every scene shares one presence path.** `systems/scene-presence.ts` —
`attachPresence` — keeps the remote characters in step with the roster, puts
their words and voice mark over their heads, fetches a sheet the scene has not
loaded, and tells the socket where our own character stands. The office used to
wire all of that by hand, and the divergence is what made removing the preload
show up as **two residents who looked like each other**: the office's own path
had no sheet fetch, and `RemotePlayerManager` substitutes the default sheet for
a missing texture, so the failure was silent rather than a missing-texture box.

Two things the office needs and says so at the call site:

| Option          | Why                                                                                                                                                                                                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `depth: "flat"` | A room stacks people at one depth. Its props sit at 4 and the local player at 5, so a resident given a depth off their own feet is drawn over the counter they stand behind. Outdoors leaves it unset and everyone sorts by their feet, which is the only thing that reads right when somebody walks below a building. |

There was an `ownSay` beside it — this browser's own remark, over its own
character — and it went with the chat that was the only thing that sent
one. Every bubble in a room is now somebody else's, which is what
`RemotePlayerManager` already draws.

The handle's `say(id, text)` is for a scene with something of its own to
put over somebody. Nothing uses it today: the office used to announce a
badge with it and could not — the badge names its _holder_ and `say`
addresses a _connection_, so a name was being handed where a uuid was
wanted and the bubble never once appeared. The server does it now, which is
the only side holding both halves (`announce` in `presence-socket`). If you touch
preloading, check that people still look like themselves: a room that
renders is not proof that it is right, so stand two of Sandbox ERP's own
in one room — Bud is a resident and Sara walks in on her own code, in
different sheets, which is the pair to look at.

**A map declares only the tilesets it draws from.** The source map carries all
sixteen of the pack's sheets, and every generated room used to inherit the lot
while placing tiles from two — so the scene, which loads whatever the map
declares, decoded 183MB of RGBA to draw 10MB of it. That is most of the second
or two of black screen on the way into a building, and caching does nothing for
it: the bytes were already local, the decode is the cost. `tilesetsUsedBy` in
`lib/map/generate.ts` trims the list; `firstgid` values are deliberately left
alone, since a tile is found by the greatest `firstgid` at or below it and gaps
are fine, whereas renumbering would mean rewriting every tile id in every layer.

**Out of doors the grass is a carpet, not a tile at a time.** `layGround`
lays one 384px picture per eight tiles under everything at depth -1 and then
draws only what is _not_ grass over it. It used to be a picture per cell,
which on the town-sized map was four thousand of them before anything was
standing on them; the map is three times as wide now and four cells in five
of it are grass, so it would have been thirteen thousand, ten of which were
the same green square. Phaser walks the whole display list every frame
whether a thing is on camera or not, so that is paid sixty times a second
for the life of the scene. It also stops the grass reading as a tile: the
tufts repeated every 48 pixels were a pattern anybody could see once the map
had a meadow in it, and the period is eight times longer now.

Maps are **generated, not hand-drawn**. `pnpm build:map` reads `public/maps/office2.json`
as a tile source and writes lobbies, floors, stores, warehouses and garages from specs
in `lib/map/` (`office.ts`, `floor.ts`, `premises.ts`, `generate.ts`) plus the tenant
list in `lib/world/tenants.ts`. Edit the spec, not the generated JSON — regeneration
will overwrite anything you change by hand.

**Every per-building map comes off `TENANTS`**, so adding a building is a
line there and a `pnpm build:map`:

| Map                              | Written for                                                                 | From                                 |
| -------------------------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| `lobby-<slug>.json`              | A lobby with anything in it                                                 | `furnishedLobby` + `lobbyFurnishing` |
| `lobby.json`                     | Every lobby with nothing in it, between them                                | —                                    |
| `room-<slug>.json`               | Each store, warehouse and garage                                            | `kind`                               |
| `floor-ops-<boards>-<n>[-flowN]` | One per set of boards, number of projects, and how many project boards hang | `operations` + `projects` + `boards` |

The lobbies were the last thing here still hand-listed, each hand-wired in
the build script with its own `{ game, helpDesk }` while `mapFileFor`
worked the file name out from the tenant. So the furniture lived somewhere
nothing else could see it, and declaring a game without also editing the
script gave a building a map that was never written — a room that 404s, with
nothing to say why. `floors.test.ts` now walks every tenant's lobby and
floors and insists `mapFileFor` names a file that is on disk, which also
catches a building added without regenerating.

### The games in the lobbies

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

### The basketball court

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

Its numbers are the picture's — `BOARD_BEHIND_RIM`, `BOARD_HALF_WIDTH` and
the two heights in `lib/world/basketball.ts`, measured off the board drawn
in `scripts/make-world-art.mjs`. A pane reaching past its own picture is a
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
ball's coordinates twenty times a second — and it is sent on every tick
while the ball is doing something, once more when it settles, and once to
anybody walking onto the map. That last one matters: a still ball is
published once and then not again, so without it an arrival would see an
empty court until somebody touched it.

### The eggs

Startle Michael and three clucks in a hundred — `EGG_CHANCE` — he leaves
an egg in the grass **where the bolt ends**, not where it began. Anybody out
on the map can walk up to it and press E, and it goes in their basket, which
hangs on their profile beside their badges and stays there.

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

**Odds, not every thirty-third cluck**, and the two are nothing alike to
play: the draw is fresh on every fright and nothing anywhere counts them,
so a hundred may pass with nothing to show and two may come one after the
other. A counter would be a rhythm somebody could learn, and then walking
up to Michael would be a chore with a payout at the end of it rather than
a chance. `residents.test.ts` holds it to that from both ends — a roll
that keeps paying out keeps paying out, which is what says there is no
counter swallowing the other ninety-nine.

**There is a ladder, and rarity is one number written once.** Six kinds
(`EGG_KINDS` in `lib/world/eggs.ts`), each declaring a `weight`, and
everything else is read off it — the share of eggs that come out that kind,
the "1 in 100" the panel prints, the order the ladder is shown in, and the
target of the badge for finding one of each. A second field saying "rare"
is a second thing to be wrong the next time a weight moves.

| Kind         | Weight | Which is |
| ------------ | ------ | -------- |
| Hen's Egg    | 5450   | 1 in 2   |
| Speckled Egg | 2500   | 1 in 4   |
| Copper Egg   | 1250   | 1 in 8   |
| Jade Egg     | 500    | 1 in 20  |
| Gilded Egg   | 200    | 1 in 50  |
| Rainbow Egg  | 100    | 1 in 100 |

The weights total ten thousand, so the rare end is exact — five hundred
is one in twenty, two hundred is one in fifty, a hundred is one in a
hundred — and the common end takes what is left over, which is why a
hen's egg is 5450 rather than a round number. A rarity somebody crossed
the park for is worth being exact about; the one they were going to find
anyway is not.

So a rainbow is three clucks in ten thousand, which is the world's rarity
rather than anybody's goal — and The Whole Clutch, the badge for one of
every kind, is the long one in the catalogue on purpose. Both numbers are
meant to be read as "there may be one of these in this world", not as
something to sit down and work through.

Three files, and the split is the basketball's exactly:

| Where                 | What                                                                             |
| --------------------- | -------------------------------------------------------------------------------- |
| `lib/world/eggs.ts`   | The ladder, the weighted pick, the reach. Pure, shared by all three layers       |
| `lib/server/eggs.ts`  | The field: what is lying about, who may take it, and forgetting the stale ones   |
| `systems/EggPatch.ts` | The drawing of them, the `Press E`, and the shout when somebody finds a good one |

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
  (`lib/world/residents.ts`), beside `wanders`. Only ever alongside a
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
  ten minutes — long enough to finish what you were doing and walk over,
  short enough that an afternoon of clucking is not a park you cannot cross.
  `NEST_LIMIT` is twelve, and reaching it drops the **oldest**: the egg
  people have walked past twice is the one least likely to be collected, and
  refusing to lay a new one would switch the feature off for as long as the
  field stayed full.

**Two messages, which is the badges' arrangement.** `eggs` is a fact about
the world map and goes to that room — the whole field every time, like
`online` and `meetings`, because it is a handful of eggs changing a few
times an hour and a browser that missed one message would otherwise draw an
egg somebody pocketed. `egg-found` is a fact about a person and goes to
everybody, so every browser's tally stays current without refetching.
`/api/eggs` is the catch-up for a panel opened cold.

The browser's whole say is `{ type: "egg", action: "take" }`: which egg is
whichever is nearest, and whether anything is in reach at all is answered
off the room's own record of where that person is standing. A message that
named an egg could name one across the map, and the tier — the whole point
of an egg — would be a thing a browser had an opinion about.

**A press of E goes to every `extra`, not to the first that wants it.** The
world map now runs two of them, so `OutdoorPlace.extras` is a list; the ball
and an egg a step apart never argue over a press, because neither acts on
one unless something of theirs is within arm's length.

**The sprite and the HUD are the same egg drawn twice.** `scripts/make-world-art.mjs`
draws one frame per kind into the props atlas from the `shell` tones in
`lib/world/eggs.ts` — written in both because a `.mjs` cannot import a
`.ts`, which is the arrangement the basketball's board and rim numbers are
already under. The panel draws its own from those tones rather than
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

### Fixtures

The things in a room you walk up to and press E at — the boards, the games,
the support queue, the two sets of counts. One entry each in
`lib/fixtures.ts`: which points of
interest on the map are it, the art that stands on them, the sign above, how
close you have to be, what the prompt says, the `?<param>=1` that opens it
from anywhere, and the pair of events that open and close its panel.

It sits in `lib/` beside the event bus because **both layers read it**, and
that is the point — neither side writes down what the other emits:

| Who                        | Takes from it                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `systems/FixtureManager`   | Finds the points, stands the art, hangs the signs, prompts, emits the open event, and knows which panels are up so the character holds still |
| `usePanel` in `lib/hooks/` | Each panel's open event, close event and query parameter                                                                                     |

Adding something to walk up to is an entry there, its two events in
`lib/events.ts`, and a panel in `components/hud/` that calls
`usePanel("<id>")`. Nothing in `OfficeScene` changes.

**A fixture with several points says which one was pressed.** Usually it has
one, and where it has several they are several ways into the same panel — a
lobby's boards are one shared canvas, so it never mattered. An Operations
floor broke that: three project boards in three rooms are three different
boards. So every fixture's open event carries an optional **subject**, and
the subject is the **capture in the fixture's own `match`** — `"2"` off
`Project board 2` — which is one line in `FixtureManager` and no new
concept. `usePanel` hands it back beside `open`, set before the flag so a
panel's first render is already about the right thing. Null everywhere else,
including for a panel opened by its `?<param>=1` link, which names no point.

It was six hand-written copies of all of that — roughly 90 lines apiece
spread over four files — and the cost showed twice. The whiteboard and the
project board both claimed `?board=1`; every panel is mounted in every room,
so one parameter opened the two of them stacked on each other. And accepting
a ping pong challenge called the panel's own `setOpen(true)` without emitting
anything, so the office went on letting the character walk about behind a
live match. Both are the same mistake: a panel that knows how to show itself
but not how to say so. `usePanel` has no way to open a panel except the
event — `show()` emits it — which is why the hook is the fix rather than
tidier copies.

Nothing in the registry may import Phaser, which is what lets
`lib/__tests__/fixtures.test.ts` hold it to being coherent in the suite's
node environment: unique ids, unique parameters, an open event paired with
its close, an entry for every id in the union, and no point of interest
claimed by two fixtures. That last one is why the help desk's match is
anchored — the lobby's "Help desk counter" is a different thing in a
different room.

Escape closing a panel is the hook's, and off for the two that read their
own keys: the ping pong table backs out of a game to its menu before it
leaves the room, and the whiteboard swallows every key rather than only
that one. The arcade was the third until a cabinet became one game — with
no menu behind it there is nothing to back out to, so Escape leaves.

The boss's terminal was the one thing in a room that looked like a fixture
and was not — it hung off the corner of a seat rather than over anything,
and it existed to give work out. It is gone with the work, and so is the
menu that opened when you walked up to a worker: a worker has nothing to be
asked for, and a prompt that opens an empty menu is worse than no prompt.

### Doc, and the conversation he is hooked up to

Walk up to Doc and press E, and a Mettara conversation opens in a window
over the room. He is the first thing in this world you interact with that
is a **person** rather than a board, a machine or a table — and the first
that is somebody else's site rather than something this app draws.

**He is in the fixture registry like everything else**, and only his anchor
differs. A `FixtureSpec` says where it is in one of two ways now: `match`,
a point of interest in the room's tiles, or `person`, the presence id of
somebody the roster is putting down somewhere new every frame. Exactly one
of the two, which `fixtures.test.ts` insists on — neither is a prompt that
can never appear, and both is two places at once.

Everything that makes a fixture a fixture is true of him, which is why a
second registry for the moving ones would have been the six hand-written
copies `lib/fixtures.ts` exists to have replaced: one query parameter
nobody else claims, an open event paired with a close, `usePanel` on the
far side of the bus, and a panel that stops the character walking about
underneath it.

| Where                    | Which fixtures                                                       |
| ------------------------ | -------------------------------------------------------------------- |
| `systems/FixtureManager` | The ones in the tiles. It reads the map once, when the room is built |
| `systems/TalkTo`         | The ones that are people. It reads presence, every frame             |

`TalkTo` is a system rather than a branch inside the manager because the
office is not the only place it has to work: Doc is at his post in Support
most of the day and out on the world map the rest of it, so `OfficeScene`
and `OutdoorScene` both run one. A resident you can only talk to at his
desk is one you would meet on the plaza and find nothing to do with.

Outdoors that meant a rule the map had never needed: a panel opened by
walking up to somebody holds the keys, the way `fixtures.anyOpen()` does
in a room. Deliberately **not** `dialogOpen()`, which is every window in
the HUD — reading a badge card while crossing the plaza has never stopped
anybody and should not start.

**The prompt hangs on where he is drawn, not on where he is.** A remote
character eases toward the position the server reported rather than
snapping to it, so the two are a fraction of a second apart whenever
anybody is walking — about half a tile for a resident pacing a floor. Hung
off the roster the label ran ahead of the man it was about and sat over
whoever happened to be standing there, which is why `ScenePresence.drawnAt`
exists and answers null for somebody hidden or not here.

**Whose conversation it is is the server's answer, and it is the whole of
the prompt.** `docConversationFor` (`lib/server/mettara.ts`) hands back a
URL or null, `/api/mettara` is the one reading of it, and a browser given
null shows no prompt at all: Doc says his line and that is that.

`MAY_TALK` is who — Coop, Rob and Andrew today — and it is a list rather
than a name because the question is "is this person on it", so somebody
joining is an entry rather than a rewritten condition. **One conversation
between them, not one each**: a group chat is a place several people are
in, and handing them a conversation apiece would look identical from any
one screen while being three rooms nobody else is in. The test says so,
since nothing about the app running would notice.

Two things follow, and the second is the more interesting:

- **The conversation id never reaches anybody else's browser.** Written
  into `lib/world/residents.ts` beside his lines it would read better — it
  is a fact about Doc — and it would also ship in the bundle to every
  visitor who ever loads the world, since the scenes read the cast out of
  that module.
- **What this settles is the world, not a secret.** It is a link: anybody
  holding it can open it in their own browser, and Mettara decides for
  itself who may read it. What the gate decides is who finds that Doc has
  anything to say.

**Framing somebody else's site is two policies agreeing.** `frame-src` in
`next.config.ts` names `METTARA_ORIGIN`, read from `lib/mettara.ts` so the
policy and the URL cannot stop naming the same host — a frame the policy
does not name is not refused loudly, it comes up blank with a line in the
console. The far end has the other half and the last word: a site says who
may embed it with `X-Frame-Options` and `frame-ancestors`, and nothing set
here overrides a refusal. Mettara has to send `frame-ancestors` naming this
host and no `X-Frame-Options: DENY`; the day it stops, the window is white
and nothing in this app will be able to say why.

`METTARA_DOC_CONVO` moves the conversation without a deploy. **The id
only, never a URL** — a URL out of the environment could name a host the
policy has never heard of, and a blank frame looks exactly like the app
being broken.

**The frame goes when the panel goes.** Closed, it is unmounted rather than
hidden, so a third party's page is not left running and connected behind
the office for the rest of the session. Pressing E again loads the
conversation afresh, which is the right way round: a page nobody is looking
at should not be a page still open.

### Storage

Two SQLite databases (`node:sqlite`), deliberately separate:

- **Room store** (`lib/server/room-store.ts`) — app state: seats, accounts,
  presence, scores, badges.
- **ERP** (`lib/erp/`, `ERP_DB_PATH`, default `.data/erp.sqlite`) — the fictional
  company's data, seeded idempotently on first boot. It can be wiped and
  regenerated without touching anyone's room.

Migrations 2 and 3 are what took the agents out of a database that already
held them: `activity`, then `tasks` and `sessions`, dropped with their
indexes. Migration 4 took `messages` with the chat, which is the same
argument one step later: the rows were the agents' transcript and, after
them, remarks typed into a window beside the office, and nothing reads
either. `rooms` keeps `active_session_key` and `spend_usd` rather than being
rebuilt — SQLite drops a column by copying the table, and an unused column
costs a room nothing.

Migration 5 is the odd one, because it **drops a table and keeps nothing**.
`achievements` went and `badges` and `badge_marks` came in, with no
backfill between them: the old rows were filed under a _room_, half of them
were an agent's from when the world ran agents, and of the two codes left
only one survives by name. There was nothing to carry over, and a badge
half-carried is worse than a shelf that starts empty — everybody begins with
none, which is the honest state for a catalogue nobody has yet had a chance
at. See **Badges** for the shape that replaced it.

Migration 6 adds `eggs`, which is the other half of **The eggs**: the field
of them lying in the park is in memory beside the basketball, because that
is something happening, and what somebody picked up is kept, because a
basket is a person's. One row per egg rather than a count per kind — an egg
is a thing that happened at a time — and everything read back off it is a
tally, which is bounded by people times the ladder where the rows are
bounded by nothing.

**The room store's shape is versioned.** `MIGRATIONS` in
`lib/server/room-store.ts` is every change to it in order, the index being
the version it brings the database _to_, and `PRAGMA user_version` records
how far a file has climbed. Adding one is an entry there; it runs once, in
its own transaction with the version stamped inside it, so a database is
either at the version before or the one after and never halfway between.

That is what makes room for a change that is not another column — a rename,
a backfill, an index rebuilt. There was nowhere to put one before, because
nothing recorded what shape a database was in: migration was a list of
`ALTER TABLE` statements in a `try {} catch {}` that swallowed everything,
re-attempted on every open for ever. It worked, and it could not tell the
ordinary case of the column already being there from a typo, a locked file
or a full disk — all three came back as the same silence, and a database
that had failed to migrate went on being written to.

Two things follow from it:

- **A migration that fails takes the server with it**, naming itself and the
  SQL error. The alternative is writing rows into a shape that was never
  finished.
- **A database newer than the build is refused**, saying both versions.
  Rolling a build back is fair in an emergency, but the older one cannot
  know whether it can still write the newer shape, and guessing wrong
  corrupts a room quietly.

The baseline migration asks before it adds, because everything from before
the ladder sits at version 0 with the tables and — depending on its age —
some of the columns. From version 2 on, the version is the answer and a
migration can assume the one before it ran.

**Every test file gets a room database of its own**, in the OS temp
directory, from `ROOM_DB_PATH` in `vitest.setup.ts`. Three files drive real
servers — `presence-identity`, `voice-reach`, `lift-visibility` — a real
server opens the room store, and left alone that is the one in `.data/` with
somebody's actual rooms and board scribbles in it.

It was one database per run, in `vitest.config.ts`'s `env`, and those three
raced each other for it: SQLite answers the second writer "database is
locked", which arrived as an uncaught exception and failed about one run in
three **with every test passing**. So it has to be a setup file rather than
`env` — `env` is one value for the whole run — and a setup file rather than a
hook, since the store reads the path when it is first imported and a setup
file is the last moment before a test file's own imports are evaluated.

## Layout

```
app/                    App Router pages + API routes (room, characters, people, auth)
components/
  game/
    PhaserGame.tsx      dynamic import, ssr:false; creates the Game in useEffect, destroys on return
    scenes/             OfficeScene, EntryScene (which holds the router), and OutdoorScene → WorldScene, CampusScene
    entities/           Player, RemotePlayer, Worker (split under worker/), ChatBubble
    systems/            camera, doors, gamepad, pathfinding bridge, presence, fixtures, scene router
    config/             animations, emotes — frame counts and timings live here, not inline
  hud/                  every React panel, plus hud.css (the pixel HUD)
lib/
  events.ts store.ts reducer.ts    the state + event spine
  badges.ts                        the catalogue, and who a badge belongs to
  camera.ts legible.ts            how far out the camera stands, and how big lettering is drawn
  fixtures.ts                      what you walk up to and press E at, read by both layers
  mettara.ts                       where Mettara is served from, for the CSP and the URL alike
  room-travel.ts                   every room change, none of them a page load
  server/                          server-only: room store, presence hub/socket, residents, access
  server/room-broadcast.ts         the way anything server-side speaks into a room
  server/badge-rules.ts            when a badge is earned — server-observed, never claimed
  server/mettara.ts                whose conversation Doc is hooked up to, and which
  server/traffic.ts                which cars are on the highway, and when one sets off
  map/ world/                      map generation and world layout
  world/cast.ts                    who the world is of: roles, concept art, backstories
  world/basketball.ts              the court in the park, and the flight of the one ball
  world/eggs.ts                    the ladder of eggs Michael leaves behind, and how rare each is
  world/wood.ts                    the wood north of the town: the Gold River and its trails
  world/wilderness.ts              the meadow east of the town, the coast, and the highway
  world/traffic.ts                 what a car is, how fast, and which lane — shared by all three layers
  arcade/ pinball/ pong/           the games (Oak Island, Flappy, Snake, Breakout, Solitaire)
  pixel/ characters/               sheet validation, PNG codec, palettes, recolouring
  voice/                           WebRTC voice, one conversation server-wide
  trello/ zoho/                    the two boards on an Operations floor, read-only
                                   (each with the counts drawn beside it: flow.ts, pulse.ts)
public/maps|tilesets|sprites|characters|audio|ui
scripts/                build-map, seed-erp, sprite and world-art generators
types/game.ts           shared game types
```

### The three stretches

The world map is the town it began as with a stretch added either side, and
it is laid out that way rather than renumbered:

| Stretch        | Columns | What is in it                                                      |
| -------------- | ------- | ------------------------------------------------------------------ |
| The shops      | 58      | Four stores along the two roads, and the wood above them           |
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

### The highway, and the cars on it

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
most three at once, nine to forty-five seconds apart.

**It is published when the road changes, not on every tick**, and that is the
one thing worth knowing about it:

|      | The ball                                                      | The traffic                                                                    |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Sent | Twenty times a second while it is live                        | When a car sets off, and when one leaves                                       |
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

### The wood, and the Gold River

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

### Outdoors

The world map and a campus are the same place in every way but the drawing
of it, and `scenes/OutdoorScene.ts` is that place: arriving out of a door
and taking a few steps down the path, walking by keys or stick or tap,
everyone else drawn from the room socket — the residents taking the air
among them — the camera that follows and zooms, and a doorway that either
starts another scene or loads a lobby's page.

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

### Residents and wandering

Residents (`lib/world/residents.ts`) are the characters who live in the buildings;
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
`coversPoint`, which buckets it. `clearToStand` itself walks the lot, and
the lot is five thousand rectangles once the wood is planted; a few
thousand candidates of that is a fifth of a second. Same arrangement the
basketball is already under, for the same reason.
A lattice point that lands in a tree looks for the gap beside it, out to
two tiles in a ring — which never fires in the meadow and is the whole
difference in the wood, where the canopy is most of the map and the
clearings are what is left between the trunks.

It is read off the map rather than listed, so a building put up in the
meadow or a trail cut through the wood changes where he goes without
anybody coming back here. **A function and not a constant**, worked out on
the first call and kept: a `const` would sweep the moment the module is
imported, and this module is in the browser's bundle — the scenes read the
cast out of it — so a quarter of a second of flooding the map, to answer a
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
rebuilding it, and why `scenery.test.ts` says so.

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

**The camera.** Every place opens at the zoom that fits the lobby, so people
and signs are the same size out of doors as in, and the wheel goes further out
on a map. Two things are not that:

- **The world map opens where it was left.** `reopenZoom` in `lib/camera.ts`
  is the rule and `loadWorldZoom` the store, in the browser for the reason
  sprinting is — a door builds a whole new scene, which is exactly the moment
  this is for. The saved value is clamped rather than trusted, because the
  zoom floor comes off the viewport and the window it was saved from may have
  been another shape. Rooms are still fitted every time, which is the point of
  fitting them; campuses too.
- **Pinch zooms on glass.** Raw touch events on the canvas, like the wheel,
  because Phaser is given one active pointer by default and would not report a
  second finger at all. A trackpad's pinch needs none of this — a browser
  reports that as a wheel with ctrl held. `pinching` is what stops the same
  two fingers also dragging the camera and reading as a tap on the floor,
  which would send the character walking off while somebody is looking closer.

**Sprinting** is a mode, not a held key: left Shift toggles it (`togglesSprint`
in `lib/sprint.ts`, bound by `ShiftLeft` so right Shift is untouched, and
ignored while a field or a dialog has the keyboard). The mode is kept in the
browser (`loadSprinting`), not on the character, because a room change builds
a new character — holding it there dropped everyone back to a walk at every
door, which is useless for the thing it is for: getting somewhere several
rooms away. `player.speed` is what
every driver reads — the keys, the pad, a tapped route — so none of them knows
about the mode; only the scripted walk out of a doorway stays at `MOVE_SPEED`.
The walk cycle's `timeScale` comes from the actual velocity rather than from
the toggle, so a half-pushed stick and a sprint both look right.

Both speeds live in `lib/presence-types.ts`, not in the game config, because
**the presence hub clamps movement against them** — its budget is
`SPRINT_SPEED_PX_S × SPEED_TOLERANCE`, so a sprinter is not hauled backwards
while a teleport still is. Two copies of a speed is one drift away from the
server fighting an honest runner.

**Facing** is one rule everywhere, `facingFor` in `lib/facing.ts`: the dominant
axis, with an exact diagonal going sideways for the keyboard's sake, and nothing
decided when nothing moves — which is what leaves someone who walked left and
stopped still looking left. Taking horizontal whenever there was any of it,
which is what the player used to do, is indistinguishable on a keyboard and
wrong for every tapped route, since a walk straight down carries a pixel of
sideways drift and that was enough to turn the walker side-on for the whole
journey.

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

| Rule                                      | Why                                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A dash lands where he could have wandered | Nothing collides a resident. Outdoors that is `openGround` on the route planner's own grid; in a room it is the haunt's `wanderArea` bounds                      |
| The pause between wanders is ignored      | `walk` lets a spooked resident aim again the moment a dash ends — standing about in the middle of a fright is not fleeing                                        |
| A walk to a door is not dropped           | `goIfAtTheDoor` reads an empty course as being at the door, so clearing one would put somebody through it from the middle of the room                            |
| Away from where they _were_               | `spookedFrom` is a point taken at the cluck, not a person read each dash. Re-reading it would be a chase, and one a person could steer by walking round him      |
| The cone gives way before the wall does   | A chicken in a corner has no way out that is also away. Tries past `SPOOK_TRIES` open out to the whole circle, or he would stand still in the middle of a fright |

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

### Characters

Two files per character in `public/characters/examples/`: `<Name>.png` is the
profile picture and `<Name>_sprite.png` is the sheet, which
`scripts/build-character.ts <Name>` installs as
`public/characters/<Name>_48x48.png`. Capitalise both — the lookup is by name,
and a lowercase file only resolves on Windows.

**The file you deliver is the file the game loads.** A sheet in the format is
copied into place, not decoded and re-encoded, so the installed file is the
one handed over — palette, colour type and all. Nothing is scaled, quantised,
keyed, padded, scrubbed or outlined; decoding happens only to check it.

```
48 x 96 frames, 24 columns x 3 rows — 1152 x 288
row 0 blank, row 1 idle, row 2 walk
across a row, six frames each of right, up, left, down
left is drawn, not mirrored; both cycles loop over their six frames
a transparent background
```

The pack's 2688-wide shape is accepted too, but **twenty-four columns is what
to draw**: it holds exactly the frames the game animates and costs a sixteenth
of the texture memory. 2688x1968 is 5.3M pixels of which nine tenths are
empty, against 0.33M for 1152x288. The wide shape survives because the pack's
cast and everything built before this are that size.

The reference figure sits **64px tall** in its 96px frame, rows 28-91,
centred on x 24, at one scale on one baseline across all 48 slots. Feet on
row 91 is the number that matters most: the game derives a collision body
from a fixed ratio of the frame — rows 72-91, x 12-36, never measured from
the art — so a character drawn a few pixels up floats, and one drawn a few
pixels down stands through his own shadow.

It was 72px until the cast was redrawn, and eight pixels reads as one person
being shorter than the people standing beside them. Two things measure it,
because `sheetFaults` settles the _format_ — canvas, frames drawn,
transparent background — and says nothing about the drawing inside the frame,
which is how two short sheets passed every check and shipped:

| Command                           | Reads                                      |
| --------------------------------- | ------------------------------------------ |
| `pnpm check:sheets [Name...]`     | The installed cast, in `public/characters` |
| `pnpm check:delivery <sheet.png>` | One sheet before it is installed           |

**Run it on the delivery, not on the cast.** The generator has drifted twice,
both times by the same amount in every one of the 48 frames of every sheet in
a batch. The fix is four pixels of art, and the installed cast is one step too
late to be told.

**They report; they do not refuse, and that should stay that way.** Which
proportions the cast has is the artist's call, and the cast does not in fact
agree: four sheets are 64px (Rob, Sara, Steve, Yoshi), five are 60px (Andrew,
Doc, Mark, Nathan, Yash), Hunter and Campbell are 58px, and Coop and Nick are
68px with their feet on row 89. Bud and Michael — a potato and a chicken — are
exempt outright, which is `SHAPES` in `scripts/check-sheets.ts`. A height rule
in `sheetFaults` would refuse those two and the artist's judgement along with
them; the exemption list belongs beside the report, which is where it is, and
somebody who is not a person goes on it as they are installed.

**And comes off it when they stop being one.** Andrew was on that list — he
was a fish finger in a bow tie — and was redrawn as a man in a suit, at which
point the exemption was hiding a real measurement rather than excusing an
unmeasurable one. The list is for a figure no height rule could sensibly
describe, not for anybody whose sheet happens to differ from the standard:
he is 60px like four others, which the report is right to say out loud.

What the report must **not** do is measure something that fires on
everything. `check:delivery` briefly held the feet band, rows 72-91, to the
collision body's x 12-36 — and flagged all eleven sheets in the cast,
including the three the standard was taken from, because nothing in a bitmap
distinguishes a boot from a coat hem or a hand at the knee. A check that is
always red says nothing at all. It prints the span now and judges only the
height and the baseline.

**Row 1, column 18** (the first idle-down frame) is lifted straight out as
the HUD portrait and gallery card, so make that one a clean front view.

A sheet's grid is **measured, not assumed** — `sheetColumns` counts it off the
image, and `makeAnims` takes that count, because Phaser numbers frames across
the whole sheet so row 1 begins at index `columns`. That number used to be the
constant 56, which is why a delivered sheet had to be 2688 across whatever it
held. Only two widths are accepted rather than any multiple of a frame: the
loose illustration grids are 1536 across, a whole 32 frames, so a
divisibility rule would wave one through to animate from nonsense.

Indexed PNGs are read (colour type 3, at 1, 2, 4 or 8 bits). A palette is how
pixel art is normally stored and what a tool writes for an "8-bit PNG";
refusing it sent the artist back to re-export for nothing, since expanding a
palette is exact.

**Anything else is refused, and there is no way past it.** `sheetFaults` in
`lib/pixel/exact.ts` is the whole rule, it reports _every_ fault at once
rather than the first — a sheet on the wrong canvas is usually on the wrong
background too, and sending somebody back to fix one thing at a time is how
three rounds happen instead of one — and `describeSheetFaults` prints them
with the specification underneath, the same words from the install script and
the upload route alike. There is no `--loose` flag and no interpreting
fallback: both existed, and having them meant art that was nearly right got
guessed at instead of redrawn. Cutting a loose sheet apart, scaling it to a
common height, quantising the colours and keying a background out is what this
used to do, and every one of those steps shows in the sprite. **The fix for
art that comes out badly is better art, not a longer pipeline.** Deleting them
took `lib/pixel/strip.ts`, `lib/pixel/ingest.ts` and `lib/characters/poses.ts`
with them — the model call that read a sheet's facings included.

**A background is refused by whether it is opaque, not by what colour it is.**
The check used to ask whether the four corners agreed on a colour, on the
theory that a shared colour is probably the backdrop. Two whole classes of
sheet walked through that: a gradient, and — the one that turned up — a sheet
exported with the editor's transparency checkerboard baked into the pixels,
whose corners were rgb(253,253,253), rgb(254,254,254), rgb(240,240,239) and
rgb(236,237,236). Not agreeing on a colour is not evidence of transparency.
So: a file with no alpha channel at all is named as that (`Bitmap.colourType`
carries the PNG colour type through the decode for this one purpose, since
"export with transparency" is a better message than "your background is the
wrong colour"); failing that, a sheet with no transparent pixel anywhere;
failing that, four opaque corners. A frame's corner is empty in every sheet
ever drawn to this format, so an opaque one means something is behind the art
— and it will be drawn, because nothing is keyed out any more.

Adding a character is three steps: drop `<Name>_sprite.png` in `examples/`,
run `build-character.ts <Name>`, add a line to `WORKER_SPRITES`. That last one
stays by hand because a key outlives its filename — seats and saved profiles
are stored against it, so deriving keys from filenames would mean renaming a
file silently reassigns everyone's look.

`/api/characters/ingest` is the same rule inside the app: a sheet in the
format is stored as the bytes that were uploaded, and anything else comes back
422 with that report.

A sprite **key** in `WORKER_SPRITES` outlives its filename — seats and saved
profiles are stored against it, so rename the file and the `path`, never the
key.

Tests sit in `__tests__/` beside the code they cover, plus `*.test.ts` files in
`lib/world/`. Coverage is substantial — when you change reducer, gateway-handler,
room-store, map or arcade logic, there is almost certainly a test already asserting
the current behaviour.

**A hook needs a DOM, and only a hook does.** The suite runs on `node`, which
is right for everything that is plain logic — and most of this codebase is,
deliberately: the arcade's games, the pinball table, routing, facing, the
maps. A React hook is the exception, because React will not give one its
dispatcher outside a renderer. So `jsdom` is a dev dependency,
`lib/hooks/__tests__/render-hook.ts` is the whole harness — a root, a
component that does nothing but call the hook, and `act` from React itself —
and a file that wants it says so with `// @vitest-environment jsdom` on its
first line. Per file, so nothing else pays for it.

`useTaskRouter` was the one thing covered by it, and it went with the tasks.
The harness stays: it is fifteen lines, it is the only way to test a hook at
all, and the next hook worth pinning down should not have to rediscover that
React will not hand one its dispatcher outside a renderer.

## Conventions

- TypeScript strict throughout. Prettier: double quotes, trailing commas, 100 cols,
  2-space indent. Husky + lint-staged format on commit.
- Phaser logic and React UI stay separated; they meet at `lib/events.ts`.
- No global mutable state, nothing hung on `window`.
- Constants over magic numbers — tuning values (distances, delays, zoom, wander
  timings, HUD limits) belong in `lib/constants.ts` or `components/game/config/`.
- Explicit state transitions over hidden side effects.
- Secrets come from the environment. `.env.local` is gitignored; never commit keys.
- **HUD type comes from the scale, not from a number.** `--fs-3xs` through
  `--fs-xl` in `app/globals.css`, and one media query raises the whole HUD on a
  phone — the small end most, the larger names by a pixel, because the layouts
  around them are tight. A pixel HUD built in whole pixels reads as crisp on a
  monitor and as nothing at all on a handset, and the responsive rules used to
  make it worse: the 900px breakpoint took the agent pill _down_ to 7px to win
  back width, so the screen with the least room to read on had the smallest
  lettering in the app. A new panel asks for a name; a hard-coded `font-size`
  under 13px is a panel that will not follow. In-world lettering is not part of
  this; it has a rule of its own, below.

  **The column beside the office resolves the same names larger**, on
  `.app-sidebar` in `hud.css`. Everywhere else in the HUD is a label glanced
  at — a pill, a prompt, a count — and the sizes are chosen so none of it
  takes screen away from the office. The column is the one surface that is
  _read_: names, who earned what, and a sentence apiece saying why, in a list
  the eye travels down. At `--fs-xs` that was 8px, which is the size a name
  tag is drawn at over somebody's head — right for a glance and not for a
  paragraph.

  **Its reading sizes start at 12px, which is the font's own.** ArkPixel is
  drawn on a 12px body, so 12 is where a glyph lands on whole pixels instead
  of being a shrunken picture of itself — below it the strokes are resampled
  and the type stops being crisp, which is most of what "hard to read" meant
  here. `--fs-xs` is the column's body text and is the one to keep there;
  the names under it are for the chips and the small print beside it.

  Re-resolving the names rather than making each rule in the column ask for a
  bigger one is what keeps the rule above true in there: a panel added to the
  column goes on asking for `--fs-sm` and lands legible. It costs the office
  nothing, since the column's width is the reader's, dragged to whatever they
  want; and every value is at or above what the 760px query sets, so a
  handset keeps what that query gave it.

- **In-world lettering carries a scale against the camera's.** `legibleScale`
  in `lib/legible.ts` is the rule, `systems/legible.ts` applies it, and
  anything registered with `keepLegible` is redrawn at the size it was
  written however far out the camera stands. A room's zoom is fitted to a
  lobby — 960x912, nearly square — so a wide monitor opens _zoomed in_ and a
  handset is pinned to `ZOOM_MIN`, where a 10px sign was landing as five
  pixels of screen. The rule is a **floor, not a fixed size**: `1 / zoom`
  where that magnifies and 1 elsewhere, so a monitor is untouched, a laptop
  gains a little and a phone doubles. A true `1 / zoom` would have made every
  sign on every desktop smaller, which is not what anybody asked for.

  **What is in, and what is deliberately out.** Two kinds of text live in a
  room and they want opposite things:

  | Kind                    | Examples                                                                  | Scaled |
  | ----------------------- | ------------------------------------------------------------------------- | ------ |
  | Labels, floating        | `Press E`, name tags, the chips over fixtures, a resident's name outdoors | yes    |
  | Lettering in the layout | The building's name, `SUPPORT`, the counts on a wall, a signboard's words | no     |

  A label floats above the world with nothing under it to line up with, so
  growing one costs nothing. Lettering in the layout is sized to the geometry
  around it — `SUPPORT` has the two tiles the pictures leave it, the counts
  have their bays, a signboard's words have the board — and growing one of
  those does not make it readable, it makes it overlap. Those are decoration
  and dashboards respectively, and the way to read a dashboard on a handset
  is the panel behind it. The prompt that opens the panel is in.

  Two things to know if you touch it. `keep` rescales **everything**, not
  just what arrived: a scene registers in two waves either side of the
  camera being fitted — signs during `create`, people after — and scaling
  only the new arrivals left a room's own labels at the size they were made
  with nothing for `update` to notice. And the scale is **polled** from the
  scene's `update` rather than subscribed to, because the zoom moves from
  four places (wheel, pinch, resize, a room's fit) and Phaser announces none
  of them. `InteractionMenu` predates all this and does its own true
  `1 / zoom`, which is right for it: a menu is clamped to the viewport, so it
  must not grow with the world.

- No `dangerouslySetInnerHTML`. A CSP is set in `next.config.ts` — new outbound
  connections need `CSP_CONNECT_SRC`, not a loosened policy.
- Cache headers live beside it. A room change is no longer a page load at all
  (`lib/room-travel.ts`), but a reload, a bookmark and a shared link all land
  cold, and
  `public/` is served `max-age=0` by default, so it used to revalidate around fifty assets
  and re-fetch three and a half megabytes of music every time. `/audio/` is
  immutable for a year — change the music by pointing at a different file, not
  by replacing bytes. **The art carries a content hash** (`lib/assets`), so
  `/characters/`, `/maps/`, `/tilesets/`, `/sprites/` and `/ui/` are immutable
  for a year _when asked for with `?v=`_, and an hour without. That used to be
  a flat hour, because `build:map` and `build-character.ts` rewrite files in
  place and there was nothing in the URL to say the bytes had changed — a
  redrawn walk cycle shipped and browsers went on showing the old legs.
- Commits: `<type>(<scope>): <subject>` with type in
  `feat|fix|docs|refactor|perf|test|chore`. One concern per PR.

## Design intent

From `CONTRIBUTING.md`, and worth holding to when adding anything:

- Everything should feel **spatial**, not abstract. In-world interaction over hidden menus.
- What people and workers are doing should be **readable at a glance**.
- New scenes should expand the world, not add settings pages.
- New UI matches the pixel HUD style.

## Environment variables

| Variable                                                                                          | Default                                         | Purpose                                                                  |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| `ACCESS_CODE`                                                                                     | —                                               | Shared visitors' code; production refuses to boot with no code at all    |
| `ACCESS_CODE_COOP` / `_ROB` / `_HUNTER` / `_NATHAN` / `_SARA` / `_ANDREW` / `_CAMPBELL` / `_NICK` | —                                               | One code each; brings its holder in as themselves                        |
| `PORT` / `HOSTNAME`                                                                               | `3000` / `localhost`                            | Server bind; also builds auth callback URLs                              |
| `ANTHROPIC_API_KEY`                                                                               | —                                               | Drawing a character sheet (`/api/characters/generate`); nothing else     |
| `ROOM_DB_PATH` / `ERP_DB_PATH`                                                                    | `.data/watercooler.sqlite` / `.data/erp.sqlite` | Where the two databases live                                             |
| `ZOHO_PULSE_STATUSES`                                                                             | `New,Queue,In Progress`                         | The three standing statuses on Support's wall, in the order they hang    |
| `ZOHO_TIMEZONE`                                                                                   | asked of the desk                               | Which clock "today" runs on; otherwise the org's, else its agents'       |
| `METTARA_DOC_CONVO`                                                                               | a written-down id                               | Which Mettara conversation Doc is hooked up to; the id only, never a URL |
| `AUTH_SECRET`, `AUTH_GOOGLE_*`, `AUTH_MICROSOFT_ENTRA_ID_*`                                       | —                                               | Auth.js sign-in; off when absent                                         |
| `NEXT_PUBLIC_TURN_URL` / `_USERNAME` / `_CREDENTIAL`                                              | —                                               | TURN relay for voice behind strict NAT; **build time**, not run time     |
| `CSP_CONNECT_SRC`                                                                                 | —                                               | Extra `connect-src` origins                                              |
| `GIT_SHA`                                                                                         | —                                               | The commit `/api/health` reports; the Dockerfile takes it as a build arg |

`README.md` covers the same ground as user-facing narrative, with setup walkthroughs
and the feature tour (arcade, island, controller, playing together). Change behaviour
here and it likely needs updating there too.

## Deployment

Dockerfile, Railway (`railway.json`). `prepublishOnly` runs
`scripts/prepare-package.mjs`, which builds _and_ lays the tree out; the
published package ships only `bin/` and `.next/standalone/`.

**`output: "standalone"` is asked for only by a publish** —
`BUILD_STANDALONE=1`, which that script sets. Nothing else wants the tree:
`pnpm start` and the image both run `server.ts` against a plain `.next`,
because the custom server is what holds the socket upgrades and the gate.
Asking for it always meant every build wrote a second copy of the app nobody
ran, and every production boot logged Next advising `node
.next/standalone/server.js` — which would start Next's own server in place of
ours, with no presence socket and no door on the world.

**The image's runtime stage copies a named list of files, not the repo.** A
new file the server needs at runtime has to be named there or the container
comes up with nothing to run. `scripts/start.mjs` was added and the image
went out without it once.

`pnpm start` is a launcher (`scripts/start.mjs`) rather than
`NODE_ENV=production tsx server.ts`, which is shell syntax Windows does not
have: `pnpm start` failed there while CI and the image, both Linux, stayed
green. It means the machine this is developed on can run the build it ships,
which is how a production-only change gets checked rather than trusted.

**Which build is live** comes back from `/api/health`, the one route the gate
leaves open:

```json
{
  "ok": true,
  "version": "0.4.1",
  "commit": "5d42c4a",
  "branch": "main",
  "source": "GIT_SHA",
  "startedAt": "..."
}
```

`commit` compares against `git log --oneline` by eye, and `startedAt` answers the
other half — whether a redeploy actually replaced the process, or the same
container is still up. The same line is printed at start-up, so a deploy's own
log says what it brought up.

The sha comes from `GIT_SHA` if it is set, else `RAILWAY_GIT_COMMIT_SHA`. The
second is the one that normally answers: Railway sets it on any deploy it
triggered from the connected repository, which is every deploy here, so nothing
has to be configured for this to work. `GIT_SHA` is for the cases Railway did
not trigger — a `railway up` from a laptop, or a plain
`docker build --build-arg GIT_SHA=$(git rev-parse HEAD)`.

A build nobody told answers `source: "none"` with a null commit rather than
guessing: "this build was not told which commit it is" and "this endpoint does
not report commits" look identical if the field is simply absent, and they need
different fixes. Anything that is not commit-shaped hex is refused for the same
reason — an unexpanded `$GIT_SHA` reported as the running commit looks like an
answer.

None of this existed until three separate fixes were each believed to be
un-deployed while nothing on the box could confirm either way.

**Railway deploys this repository itself**, on every push to `main`. CI does
not do it and cannot gate it — by the time the checks run, the push that
triggered the deploy has already happened. So `ci.yml`'s `verify-deploy` job
does not deploy anything; it polls `HEALTH_URL` until the pushed commit
answers, which is the part nothing else could tell you. Set a `HEALTH_URL`
repository variable (`https://host/api/health`) or the job is skipped.

It deliberately does not `needs: build`. Railway deploys whether or not the
checks pass, so what is live is worth reporting either way — and starting
alongside them means the poll is already running while the container swaps.
Two pushes close together cancel the older poll, which would otherwise time
out waiting for a commit that has been superseded.

Gating a deploy on the checks would mean CI owning the deploy instead, with
`railway up` and a project token. That was written and then taken out: with
Railway already deploying from the repository it meant two things deploying
one service, racing on every push.

`scripts/await-deploy.mjs` is the poll, and it is a script rather than bash
around `jq` for a reason worth keeping: `jq -r '.commit' 2>/dev/null || echo
null` reads a _missing jq_ as "not live yet", so a runner image that dropped
it would poll for ten minutes and then report a deploy failure that never
happened — which is exactly what it did the first time it ran on a machine
without jq. Dependency-free `.mjs` because the job installs nothing.
