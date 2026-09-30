# Access and identity

The door, the codes and who they name, private floors, and sign-in. Moved out of CLAUDE.md so it is read when the work needs it rather than in every session.

## The door

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
The address is the **last** `X-Forwarded-For` entry, the one the host's proxy
appends: the first is whatever the client wrote, and keying on it gave a
script a fresh quota with every request. That assumes exactly one proxy in
front — put a CDN before Railway and every visitor shares one quota — and
expired entries are swept on a timer, so the map cannot grow without bound.
A malformed `wc_access` cookie reads as no cookie; it used to throw out of
the gate and leave the request hanging.

**The gate is only on `server.ts`.** There are two production entry points and
this one — `pnpm start`, and the Docker image Railway builds — is the gated one.
`server.prod.mjs`, which the published npm package runs, has no gate and serves
everything to whoever reaches the port; it is for `npx` on one machine, so it
binds `127.0.0.1` unless `HOSTNAME` says otherwise (it used to listen on every
interface), and says at startup that it is single-machine. It also has **no
presence socket**: no other people, no residents, no voice — an `npx` world is
a world with you in it. The check is deliberately not duplicated there: it is TypeScript
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
(`ownLookOnly` in `SidebarFooter.tsx`, assumed true until `/api/me` answers — a
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
| The board and desk routes       | `/api/trello*` and `/api/zoho*` answer 403 `{ error }`    |

The fourth is `mayReadRoomBoards`, `mayReadDesk` and `mayPickBoards` in
`lib/server/boards.ts`. The boards on an Operations floor are the floor's
business, so reading one is asked of the room it hangs in; `?board=`, the
full board list and the office-wide pick belong to whoever can reach a wall
with a picker on it (Castle Atlantic's). They apply with no access code set
too, the way the socket does, so in dev with no codes the `?desk=1` and
`?project=1` shortcuts open onto a 403. `/api/zoho/customers` is the one desk
read left public: it serves the mailboxes on the world map, counts only.

The scene's copy of the identity is asked for from `/api/me` rather than
taken over the event bus, because the game layer holds no React and an
emit that lands before the scene subscribes would never arrive — once a
page, memoised in `OfficeScene`, with a failed ask retried at the next room.
It assumes `visitor` until the answer comes, since a gate that is open while
it waits is not a gate. None of these is the gate on its own — the lift is
what a person feels, the socket is what actually keeps them out of the room.

A personal code names its holder, so the welcome screen asks them nothing — name,
office and look are written straight in. Giving two people the same code, or
reusing the shared one, would hand over that identity; the server says so loudly
at boot rather than letting it pass.

Know the limits: the shared code has no per-person revocation and no record of who
came in on it. Sign-in below is the finer-grained answer and layers on top.

## Sign-in

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
chosen profile, a visit count, and a `stats` column nothing writes into any more
(`bumpAccountStat` had no caller and went). A signed-in person's desk and presence go under an id derived from
their email (`lib/server/person-id.ts`), which is what keeps their desk the same from
every device.

This is also why `server.ts` passes `port` to `next()` — Next builds each request's
absolute URL from what it is told there, not from the socket, so without it sign-in
callbacks point at 3000 whatever port the server is actually on.
