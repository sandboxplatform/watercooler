# WaterCooler

A pixel RPG where AI agents live and work. You walk around an office as the boss,
walk up to a worker, and assign a task face to face; the agent runs for real and
you watch it happen in the room rather than in a log. Published to npm as
`@geezerrrr/watercooler` and runnable with `npx @geezerrrr/watercooler`.

The office is one building in a larger world: a world map with campuses, buildings
with lobbies and floors, an arcade, a ferry to an island. One server is one world —
everyone who opens the site walks into the same places and sees each other there.

## Commands

```bash
pnpm install
pnpm dev            # custom server (tsx server.ts) on :3000 — use this, not `next dev`
pnpm build          # next build (standalone output)
pnpm start          # production, same custom server
pnpm test           # vitest, fast project only (~27s)
pnpm test:all       # every test, including the slow project — run before pushing
pnpm test:changed   # only tests whose imports reach what you changed (~7s)
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm format         # prettier --write .
pnpm build:map      # regenerate public/maps/*.json from the room specs
pnpm preview:map <file.json> <out.png> [scale]   # draw a map, without the game
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

`pnpm dev:next` exists but skips the WebSocket layer — presence, agent dispatch and
voice all break under it. Only reach for it to isolate a pure-Next rendering issue.

## Architecture

Next.js 16 App Router with a **custom HTTP server** (`server.ts`). The custom server
is load-bearing: Next alone cannot hold the WebSocket upgrades this app needs.

```
server.ts
├── attachPresenceSocket()   people, positions, speech, voice signalling
├── attachCliBridge()        agent runs, over ws://…/api/gateway
├── /api/internal/dispatch   localhost + shared-secret, for the MCP dispatch tool
├── /api/mettara/tools       HMAC-signed inbound, mounted only when keys exist
└── ensureErpData()          idempotent first-boot seed of the ERP database
```

Two sockets on purpose: presence is lossy and constant, agent traffic is rare and
must never be dropped. Don't merge them.

### The three layers

| Layer      | Lives in                    | Rule                                                      |
| ---------- | --------------------------- | --------------------------------------------------------- |
| Game       | `components/game/`          | Phaser. No React imports, no JSX.                         |
| HUD        | `components/hud/`, `panel/` | React + pixel CSS. Never touches Phaser objects directly. |
| Server/lib | `lib/`, `lib/server/`       | Shared logic and state. `lib/server/` is server-only.     |

Game and HUD talk **only** through the typed event bus in `lib/events.ts`
(`gameEvents.on/emit`, with every event declared in `GameEventMap`). Adding a new
interaction means adding an event there first. State lives in
`lib/store.ts` + `lib/reducer.ts` (React context + reducer), not in component state
and not on `window`.

### Agent providers

`AGENT_PROVIDER` picks who actually runs an agent:

| Value        | What runs the agent                                   |
| ------------ | ----------------------------------------------------- |
| `claude`     | Local `claude` CLI, on the host's Claude subscription |
| `claude-api` | The same CLI against an Anthropic API key             |
| `auggie`     | Local `auggie` CLI                                    |
| `mettara`    | Mettara Connect's hosted AI, over its SDK             |

Every provider emulates the gateway protocol in-process, so the app connects to
itself on startup and needs no gateway URL or token. Provider definitions are
in `lib/cli-providers.ts`; the run loop is `lib/cli-bridge.ts`.

`AGENT_PROVIDER=mettara` only says Mettara is _wanted_ — the server still boots on
the Claude implementation, and the HUD's connection panel is what actually switches.
That choice is remembered in the room database (`lib/server/provider-choice.ts`), so
a restart comes back on it. Mettara is refused, with the reason shown in the panel,
until its keys are set and its SDK is installed. Conversations do not carry across a
switch — a seat starts a fresh thread on whatever it switched to.

**Seat sandboxes.** Each seat runs in `.agent-workspaces/<room>/<seat>/`
(gitignored, root overridable with `AGENT_WORKSPACE_ROOT`), created on demand, with
`--permission-mode acceptEdits` — so an agent reads, writes and edits inside its own
space and nothing outside it. Rooms cannot read each other's work. Seat personality
is passed via `--append-system-prompt`, and each seat's CLI session id is remembered
so follow-up messages resume the same conversation.

`--print` runs are non-interactive: a tool that is neither auto-approved by the
permission mode nor named in `CLAUDE_ALLOWED_TOOLS` is **denied rather than prompted
for**. Worker dispatch is the exception — the MCP dispatch tool is allowed
automatically whenever more than one seat is staffed.

**`claude-api` specifics.** The key is read from the server environment and never
appears on a command line, where process listings would expose it. Runs use the
CLI's `--bare` flag, which makes the API key the only credential: without it the CLI
falls back to whatever account is signed in on the host, so an expired or mistyped
key would appear to work while quietly billing someone's subscription. A rejected key
makes the CLI retry silently rather than exit, which is why every run is also bounded
by a timeout. Missing or malformed keys are refused with a plain sentence in the
worker's bubble, not an opaque failure.

**Limits**, applied to every run whether assigned directly or delegated:

| Limit                  | Default | Env var                |
| ---------------------- | ------- | ---------------------- |
| Agents running at once | 4       | `AGENT_MAX_CONCURRENT` |
| Run duration           | 180s    | `AGENT_RUN_TIMEOUT_MS` |
| Spend per room         | $50     | `ROOM_SPEND_LIMIT_USD` |
| Humans per room        | 4       | —                      |

Spend is measured server-side from what each run reports and accumulated in the
room's record. Hitting the ceiling is a hard stop on dispatch, not a warning — with
a host-side key the bill belongs to whoever runs the server — and the refusal comes
back as a plain sentence in the worker's bubble, which is the only place a person
sees it. Nothing shows the running total: the HUD's pill was taken out, and
`budget-updated` is still emitted from the room snapshot for whatever surfaces it
next.

### Mettara

The SDK is not on npm. It goes in `vendor/mettara-lib/` as `mettara-lib.cjs` — the
`.cjs` name matters — and is linked from `package.json`; run `pnpm install` once
after adding it. The Docker image copies that folder, so a deploy carries it.

Needs `METTARA_API_SECRET` and `METTARA_PLATFORM_ID`. Optional: `METTARA_BASE_URL`
(staging or self-hosted), `METTARA_GROUP_ID` / `METTARA_GROUP_NAME` (the namespace
the room's people are provisioned under), `METTARA_AI_NAME` (default assistant; the
HUD's model field selects one by Mettara technical name).

Each seat is provisioned as its own Mettara user, so workers hold separate threads.
The first turn opens a conversation carrying the seat's personality and the company
briefing; later turns resume it by id, exactly as the Claude providers resume a CLI
session.

**Inbound tools.** When the credentials are present, `server.ts` mounts a signed
endpoint at `/api/mettara/tools` (`lib/mettara/webhook.ts`) so a Mettara AI can reach
back into the room:

| Tool            | Arguments                 | Does                     |
| --------------- | ------------------------- | ------------------------ |
| `list_workers`  | `room?`                   | Returns the seat roster  |
| `dispatch_task` | `seatId`, `task`, `room?` | Hands a task to a worker |

Every request is verified before a handler sees it, in this order: body digest, ±5
minute clock skew, nonce replay, then the HMAC-SHA256 signature over
`METHOD\npath\ntimestamp\nnonce\nbase64(SHA256(body))`. A forged request never
consumes a nonce, so it cannot lock out the genuine one behind it. The endpoint is
**not mounted at all** when there is no secret to verify against — don't add a
fallback that mounts it unauthenticated.

There is also `/api/internal/dispatch` for the MCP dispatch tool: localhost-only by
remote address, plus an `x-dispatch-secret` header.

### The door

`ACCESS_CODE` is one shared code that opens the whole world. It is exchanged for a
signed cookie (`lib/server/access.ts`) either by typing it at `/unlock` or by
arriving with `?code=…` on any path, which is what makes a shareable bookmark
possible. The cookie is an HMAC over its own expiry keyed by the code, so there is
no session store — and **rotating `ACCESS_CODE` invalidates every cookie already
issued**, which is the entire revocation story.

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
middleware-only gate would leave presence and agent dispatch wide open. Every
surface is covered in one place — pages, API routes, and both upgrades
(`lib/cli-bridge.ts`, `lib/server/presence-socket.ts` each call `isAuthorized`).
`checkOrigin` beside it is **not** authentication: it only constrains browsers, and
any other client can send whatever `Origin` it likes.

Left open by design: `/unlock` and `/api/unlock`, `/api/health` (the host's
liveness probe), `/api/auth/` (so sign-in can work), `/_next/` (without which the
unlock page cannot render). `/api/mettara/tools` and `/api/internal/dispatch` are
answered _before_ the gate — they are machine-to-machine and carry stronger
authentication of their own.

**Without a code, production serves nothing and says so.** A deployment must not
come up open, so with no `ACCESS_CODE` the server answers the health check and
refuses every other request — sockets included — with a 503 naming what is
missing. Nothing else is even built: no Next, no presence socket, no agent
bridge, because `isAuthorized()` waves everything through when no code is
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

| Code               | Identity  | What they get                                                     |
| ------------------ | --------- | ----------------------------------------------------------------- |
| `ACCESS_CODE`      | `visitor` | The shared cast only, no office, no desk; starts on the world map |
| `ACCESS_CODE_COOP` | `coop`    | Brought in as Coop, at Sandbox ERP, wearing his own look          |
| `ACCESS_CODE_ROB`  | `rob`     | The same, as Rob                                                  |

**A visitor starts outside.** The root is the default room, and the default
room is an office — somebody's building. A visitor has no building, so landing
them inside one puts them in the only place on the map that is not theirs,
with the door behind them. `landsOutside` in `lib/world/floors.ts` is the rule
and `server.ts` redirects on it: the root only, a visitor only, and only a
navigation — a typed `/r/<slug>` still opens that lobby, because a lobby is
public and a shared link has to work. `WORLD_SPAWN` already stands them on the
plaza.

A visitor is offered the **shared cast** — the premade four and The Boss
(`SHARED_CAST` in `lib/characters/library.ts`). Coop's and Rob's likenesses are
theirs alone. That is enforced in three places, because hiding a choice in the
picker is decoration: `/api/characters` filters the roster by identity, and the
presence socket clamps the `spriteKey` a connection claims, so a hand-edited
profile cannot walk in wearing someone else's face.

**Private floors.** A building's upper floors can belong to the people whose own
codes name them. `PRIVATE_LIFTS` in `lib/world/floors.ts` is the whole rule —
today `sandbox-erp` and `castle-atlantic` are Coop's and Rob's — and a building
not listed is open to everybody, so a new one needs no entry. The **lobby stays public**: a visitor
may walk in, look round and talk to whoever is there. It is the desks and the
agents above that are shut.

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

### Presence

A room's people live in a `PresenceHub`, keyed by connection rather than by
person: one browser tab is one player. Two rules keep that from showing a
person twice.

**One person, one place.** A personal code names exactly one person, so a
second connection claiming `coop` or `rob` is that same someone arriving
again. The earlier connection is dropped from the room and told
`rejected: "elsewhere"`, and `stopRoomSocket` keeps it from reconnecting —
without that last part two tabs trade the place back and forth for ever. The
shared code is exempt: many people hold it, so two visitors are two people.

**A dead socket is noticed.** The heartbeat pings every `HEARTBEAT_MS` and
now reads the pongs; a connection that misses one is terminated. It used to
ping and ignore the replies, so an abandoned socket counted as present until
it went `IDLE_TIMEOUT_MS` — fifteen seconds — without speaking. The client
sends nothing on a timer, only movement, so that clock is the only thing
that was catching it.

Both exist because of a bug that only appeared in production: behind
Railway's proxy the browser navigating away does not promptly close the
socket at the server, so walking out of a building meant meeting yourself at
the door for fifteen seconds. It does not reproduce against a local server,
where the close is immediate — `lib/server/__tests__/presence-identity.test.ts`
drives real sockets against a real server to hold the rule down.

The client closes on `pagehide` too, guarded on `persisted` so a hidden tab
or a backgrounded phone is not taken out of the room for looking away.

### Voice chat

Audio goes browser to browser over WebRTC (`lib/voice/`). The room socket carries
only the handshake; **the server never hears anything**. Everyone in the room with a
microphone on is connected to everyone else who has one, and each voice is attenuated
by distance: full within three tiles, silent past nine, linear fade between
(`lib/voice/proximity.ts`). A speaker mark appears above someone while their voice is
coming through.

Voice exists where presence does — rooms. The world map and campuses have no voice.

Routing uses a public STUN server. Browsers behind strict NATs need a TURN relay:
`NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME`, `NEXT_PUBLIC_TURN_CREDENTIAL`,
offered alongside when set.

### Task attachments

Up to eight files per task, 25 MB each, uploaded as they are chosen and kept under
`UPLOADS_DIR` (beside the room database by default, on the volume in the image). A
Claude agent finds them copied into its workspace under `attachments/`, with a note
appended to the task saying so; Mettara gets them uploaded to the group and handed
over with the message. See `lib/attachments.ts` and `lib/server/uploads.ts`.

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

Slugs become directory names for agent sandboxes, which is why
`normaliseRoomSlug` excludes separators and traversal outright rather than
trusting callers.

### Floors

A building with floors has a lobby, Floor 1 for its people's desks and
Floor 2 for its agents'. Some have a third, **Floor 3 · Operations**, and
what makes one is naming the boards that hang on its wall:

```ts
// lib/world/tenants.ts
lobby("sandbox-erp", "sandbox-erp", { game: "pinball", operations: ["trello", "zoho"] }),
lobby("castle-atlantic", "castle-atlantic", { game: "pong", operations: ["trello"] }),
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
rather than a redrawn floor. Sandbox ERP's is 46 tiles wide, Castle
Atlantic's 31.

How many is per building: `projects` on the tenant (`lib/world/tenants.ts`),
counting the rooms besides Operations itself. **That number is in the map's
file name** — `floor-ops-trello-zoho-6.json` — because the boards alone no
longer identify a floor: two buildings with the same boards and different
numbers of projects are different floors, and sharing a file would give one
of them the wrong corridor.

**The lift is set into the lower wall, directly beneath the door to
Operations**, not at the end of the corridor. The ride has to land you
somewhere that says where you are, and Operations is the room the floor is
named after — so you step out facing its door. That is why the two doorways
in a bay are offset: the lower rank's door has to stay clear of the wall the
lift occupies, and a test asserts it does.

Boards hang on the first room's wall and the shared whiteboard on the next
one's, so both rooms have something in them. Nothing is lettered on the floor.

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
`floor-ops-trello.json` and `floor-ops-trello-zoho.json` — so two buildings
running off the same boards share one map and a third needs no new file.
`pnpm build:map` writes one per set actually in use, read off `TENANTS`.

The `?board=1` and `?desk=1` query parameters open either panel from
anywhere, which is a development shortcut rather than a way into the room:
what is on the wall is what the floor's map carries.

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

That last one had to be written. `systems/scene-presence.ts` does the same job
and says in its own docstring that it is "for a scene that is not the office" —
the office wires presence by hand, and its path had no fallback because every
sheet used to be preloaded. Removing the preload without spotting that showed
up as **two residents who looked like each other**: `RemotePlayerManager`
substitutes the default sheet for a missing texture, so the failure was silent
rather than a missing-texture box. If you touch preloading, check that people
still look like themselves — a room that renders is not proof that it is right.

**A map declares only the tilesets it draws from.** The source map carries all
sixteen of the pack's sheets, and every generated room used to inherit the lot
while placing tiles from two — so the scene, which loads whatever the map
declares, decoded 183MB of RGBA to draw 10MB of it. That is most of the second
or two of black screen on the way into a building, and caching does nothing for
it: the bytes were already local, the decode is the cost. `tilesetsUsedBy` in
`lib/map/generate.ts` trims the list; `firstgid` values are deliberately left
alone, since a tile is found by the greatest `firstgid` at or below it and gaps
are fine, whereas renumbering would mean rewriting every tile id in every layer.

Maps are **generated, not hand-drawn**. `pnpm build:map` reads `public/maps/office2.json`
as a tile source and writes lobbies, floors, stores, warehouses and garages from specs
in `lib/map/` (`office.ts`, `floor.ts`, `premises.ts`, `generate.ts`) plus the tenant
list in `lib/world/tenants.ts`. Edit the spec, not the generated JSON — regeneration
will overwrite anything you change by hand.

### Storage

Two SQLite databases (`node:sqlite`), deliberately separate:

- **Room store** (`lib/server/room-store.ts`) — app state: seats, sessions, accounts,
  presence, scores, achievements, activity, provider choice, spend.
- **ERP** (`lib/erp/`, `ERP_DB_PATH`, default `.data/erp.sqlite`) — the fictional
  company's data, seeded idempotently on first boot. Agents can write to it, so it
  can be wiped and regenerated without touching anyone's room.

## Layout

```
app/                    App Router pages + API routes (room, characters, people, agents, auth)
components/
  game/
    PhaserGame.tsx      dynamic import, ssr:false; creates the Game in useEffect, destroys on return
    scenes/             OfficeScene, WorldScene, CampusScene, EntryScene
    entities/           Player, RemotePlayer, Worker (split under worker/), ChatBubble, InteractionMenu
    systems/            camera, doors, gamepad, interaction, pathfinding bridge, presence
    config/             animations, emotes — frame counts and timings live here, not inline
  hud/                  every React panel, plus hud.css (the pixel HUD)
  panel/                terminal and session-history modals
lib/
  events.ts store.ts reducer.ts    the state + event spine
  cli-bridge.ts cli-providers.ts   agent execution
  server/                          server-only: room store, presence hub/socket, residents, uploads
  map/ world/                      map generation and world layout
  arcade/ pinball/ pong/           the games (Oak Island, Flappy, Snake, Breakout, Solitaire)
  pixel/ characters/               sheet validation, PNG codec, palettes, recolouring
  voice/                           WebRTC proximity voice
  mettara/ mcp/                    Mettara client + signed webhook; MCP servers
public/maps|tilesets|sprites|characters|audio|ui
scripts/                build-map, seed-erp, sprite and world-art generators
types/game.ts           shared game types
```

### Residents and wandering

Residents (`lib/world/residents.ts`) are the agents who live in the buildings;
`ResidentSimulation` walks them through their **haunts** — desk, their
organisation's rooms, its campus yard, outside — staying `DWELL_MS` at each. In
a room they join that room's presence hub as a player, so everyone there sees
them walk; outside they simply stand at a spot from `outsideSpots`.

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
`WORLD_WANDER_SPOTS`, twenty points on doorsteps, promenades, avenues, the
plaza and the dock. A wanderer picks one they are not standing on and walks
there, and since nothing collides them the route is the only thing keeping them
out of the walls — `routeAcross` (`lib/world/route.ts`) plans it over
`worldSolids()` on the same coarse grid `allReachable` checks the map with, and
hands back corners rather than cells. `residents.test.ts` holds every spot to
being clear of the buildings, the props and the sea, and reachable from every
other; the simulation's own tests walk Michael for twelve minutes and assert he
never crosses a solid.

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

Michael, a chicken in a necktie, is the first and so far only wanderer.

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

Doc works the one station that exists: the help desk down in the wide bottom of
Sandbox ERP's lobby — the part that carries on past the bitten-out corner, where
nothing else is. Four tiles of counter with somebody's work all over it, one row
of floor in front to walk up to it from and two behind to pace. Its footprint,
its point of interest, his post and his pacing are all `HELP_COUNTER` in
`lib/map/office.ts`; `buildOfficeSpec(src, { helpDesk: true })` puts it in a
lobby, and only Sandbox ERP's asks for it. The art
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

The figure sits about **72px tall** in its 96px frame, feet inside frame rows
72-91 and horizontally within x 12-36 — that rectangle is the collision body
the game derives from every frame — centred on x 24, at one scale on one
baseline across all 48 slots. **Row 1, column 18** (the first idle-down frame)
is lifted straight out as the HUD portrait and gallery card, so make that one
a clean front view.

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

## Conventions

- TypeScript strict throughout. Prettier: double quotes, trailing commas, 100 cols,
  2-space indent. Husky + lint-staged format on commit.
- Phaser logic and React UI stay separated; they meet at `lib/events.ts`.
- No global mutable state, nothing hung on `window`.
- Constants over magic numbers — tuning values (distances, delays, zoom, wander
  timings, HUD limits) belong in `lib/constants.ts` or `components/game/config/`.
- Explicit state transitions over hidden side effects.
- Secrets come from the environment. `.env.local` is gitignored; never commit keys.
- No `dangerouslySetInnerHTML`. A CSP is set in `next.config.ts` — new outbound
  connections need `CSP_CONNECT_SRC`, not a loosened policy.
- Cache headers live beside it. A room change is a page load, and `public/` is
  served `max-age=0` by default, so it used to revalidate around fifty assets
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

- Tasks should feel **spatial**, not abstract. In-world interaction over hidden menus.
- Worker behaviour should be **readable at a glance**.
- New scenes should expand the world, not add settings pages.
- New UI matches the pixel HUD style.

## Environment variables

| Variable                                                                 | Default                                 | Purpose                                                                  |
| ------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------ |
| `ACCESS_CODE`                                                            | —                                       | Shared visitors' code; production refuses to boot with no code at all    |
| `ACCESS_CODE_COOP` / `ACCESS_CODE_ROB`                                   | —                                       | One code each; brings its holder in as themselves                        |
| `AGENT_PROVIDER`                                                         | `claude`                                | Which provider runs agents                                               |
| `PORT` / `HOSTNAME`                                                      | `3000` / `localhost`                    | Server bind; also builds auth callback URLs                              |
| `ANTHROPIC_API_KEY`                                                      | —                                       | Required by `claude-api`                                                 |
| `CLAUDE_BIN` / `CLAUDE_PERMISSION_MODE` / `CLAUDE_ALLOWED_TOOLS`         | — / `acceptEdits` / —                   | Claude CLI tuning                                                        |
| `AGENT_TOWN_MODEL`                                                       | CLI default                             | `opus` \| `sonnet` \| `haiku`                                            |
| `AGENT_MAX_CONCURRENT` / `AGENT_RUN_TIMEOUT_MS` / `ROOM_SPEND_LIMIT_USD` | 4 / 180000 / 50                         | Run limits                                                               |
| `AGENT_WORKSPACE_ROOT`                                                   | `.agent-workspaces`                     | Where seat sandboxes go                                                  |
| `ERP_DB_PATH` / `UPLOADS_DIR`                                            | `.data/erp.sqlite` / beside the room db | Storage paths                                                            |
| `METTARA_API_SECRET` / `METTARA_PLATFORM_ID`                             | —                                       | Required by the `mettara` provider                                       |
| `AUTH_SECRET`, `AUTH_GOOGLE_*`, `AUTH_MICROSOFT_ENTRA_ID_*`              | —                                       | Auth.js sign-in; off when absent                                         |
| `NEXT_PUBLIC_TURN_URL` / `_USERNAME` / `_CREDENTIAL`                     | —                                       | TURN relay for voice behind strict NAT                                   |
| `CSP_CONNECT_SRC`                                                        | —                                       | Extra `connect-src` origins                                              |
| `GIT_SHA`                                                                | —                                       | The commit `/api/health` reports; the Dockerfile takes it as a build arg |

`README.md` covers the same ground as user-facing narrative, with setup walkthroughs
and the feature tour (arcade, island, controller, playing together). Change behaviour
here and it likely needs updating there too.

## Deployment

`output: "standalone"`, Dockerfile, Railway (`railway.json`). `prepublishOnly` builds
and runs `scripts/prepare-package.mjs`; the published package ships only `bin/` and
`.next/standalone/`. The image copies `vendor/mettara-lib/`, so a deploy carries the
Mettara SDK (see above).

Cloud deploys run `AGENT_PROVIDER=claude-api`: there is no signed-in user on the host
and a subscription cannot be shared, so the API key is the credential and the spend
limit is the guard.

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
