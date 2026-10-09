# Fixtures

What you walk up to and press E at, and Doc's conversation. Moved out of CLAUDE.md so it is read when the work needs it rather than in every session.

## Fixtures

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

A panel with any weight to it — a game, a canvas, a picker — is a **shell
and a body**: `lazyPanel(id, label, () => import("./XBody"))` in
`components/hud/lazy-panel.tsx` is the shell, always mounted, holding the
`usePanel` subscription; the body is fetched on the first open and passes
`initial: first` to `usePanel`, which replays the open event that caused the
load. Every panel is mounted in every room, and before this that meant every
game shipped in the page's first chunk. Anything that must work while the
panel is shut stays in the shell — the ping pong challenge toast is the
example.

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

## Doc, and the conversation he is hooked up to

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
URL or null, `GET /api/mettara` is the one reading of it, and a browser
given null shows no prompt at all: Doc says his line and that is that. The
conversation is the Customer Success group chat, which already exists on
Mettara; nothing here makes one.

`MAY_TALK` is who — Coop, Rob and Andrew today — and it is a list rather
than a name because the question is "is this person on it", so somebody
joining is an entry rather than a rewritten condition. **One conversation
between them, not one each**: a group chat is a place several people are
in, and handing them a conversation apiece would look identical from any
one screen while being three rooms nobody else is in. The test says so,
since nothing about the app running would notice.

Two things follow, and the second is the more interesting:

- **The conversation id never reaches anybody else's browser.** Written
  into `lib/world/roster.ts` beside his lines it would read better — it
  is a fact about Doc — and it would also ship in the bundle to every
  visitor who ever loads the world, since the scenes read the cast out of
  that module.
- **What the URL settles is the world, not a secret.** It is a link:
  anybody holding it can open it in their own browser, and Mettara decides
  for itself who may read it. What the gate decides is who finds that Doc
  has anything to say.

**The frame signs in with a token, not a cookie.** It was Mettara's own
conversation page at first, signed in as whoever was signed in to Mettara —
and a browser withholds another site's cookies from a frame, so for most
people that was a sign-in page in a window. It is Mettara's **embed** now,
`/embed/convo/<id>?eid=watercooler-doc`, which signs in from a token handed
to it in the URL's fragment (`#token=…`; a fragment is never sent, and the
embed wipes it off its address on load).

The token is the server's to get, because getting one takes the platform's
secret. `POST /api/mettara` → `docTokenFor` signs a request to
`api.mettara.ai/api/v1/embed/token` — every field sorted by name, RFC 3986
encoded, `key=value&…`, HMAC-SHA256 in hex — and hands back only the token,
which lasts four hours and is good for nothing but the embed. It is asked
for **when the panel opens**, not when the page loads: each request is a
signed timestamp Mettara accepts once, and somebody walking past Doc has
not asked for anything. A few minutes before a token runs out the embed
posts `architech:token-refresh-needed` to its parent, and `DocChat` answers
with `architech:token-refresh` and a new one — by message rather than a new
`src`, which would reload the conversation under whoever is reading it.

What the request says about somebody:

| Field                                   | What it is                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| `source_user_id`                        | Their email: what each of them has recorded as their id in Mettara's Watercooler system |
| `email`                                 | `METTARA_EMAIL_<IDENTITY>` — links them to the account they already have                |
| `source_group_id` / `source_group_name` | `DOC_TEAM`: the Mettara team the group chat is in                                       |

`DOC_TEAM` is two facts about Mettara, and both are wrong **on Mettara's
side** rather than here when they drift. The id must be recorded against
the team in Mettara's dev portal before the first token is asked for — an
id it has never seen is a new team, made on the spot and empty. The name
must be the team's own: Mettara renames the team to whatever is sent.

Doc is hooked up for somebody only when all of it is there —
`METTARA_WORKSPACE_ID`, `METTARA_API_SECRET` and their email — so a
half-configured server is no prompt rather than a prompt that opens onto a
refusal. The emails are variables rather than written in because the
server's build ships to npm.

**Framing somebody else's site is two policies agreeing.** `frame-src` in
`next.config.ts` names `METTARA_ORIGIN`, read from `lib/mettara.ts` so the
policy and the URL cannot stop naming the same host — a frame the policy
does not name is not refused loudly, it comes up blank with a line in the
console. The far end has the other half and the last word: a site says who
may embed it with `X-Frame-Options` and `frame-ancestors`, and nothing set
here overrides a refusal. Mettara's embed sends `frame-ancestors 'self'
https: http://localhost:* http://127.0.0.1:*` — any https site, and local
development; the day that stops naming this host, the window is white and
nothing in this app will be able to say why.

`METTARA_DOC_CONVO` moves the conversation without a deploy. **The id
only, never a URL** — a URL out of the environment could name a host the
policy has never heard of, and a blank frame looks exactly like the app
being broken.

**The frame goes when the panel goes.** Closed, it is unmounted rather than
hidden, so a third party's page is not left running and connected behind
the office for the rest of the session. Pressing E again loads the
conversation afresh, with a fresh token, which is the right way round: a
page nobody is looking at should not be a page still open.
