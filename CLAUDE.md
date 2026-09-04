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
pnpm test           # vitest --run
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm format         # prettier --write .
pnpm build:map      # regenerate public/maps/*.json from the room specs
pnpm seed:erp       # seed the fictional company's SQLite database (--force to wipe)
```

Node 22+, pnpm 10. CI runs format:check → lint → typecheck → build → test on every
PR, so run those four before handing work back.

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

Spend is measured server-side from what each run reports, accumulated in the room's
record, and shown in the HUD beside the occupancy pill. Hitting the ceiling is a hard
stop on dispatch, not a warning — with a host-side key the bill belongs to whoever
runs the server.

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

A visitor is offered the **shared cast** — the premade four and The Boss
(`SHARED_CAST` in `lib/characters/library.ts`). Coop's and Rob's likenesses are
theirs alone. That is enforced in three places, because hiding a choice in the
picker is decoration: `/api/characters` filters the roster by identity, and the
presence socket clamps the `spriteKey` a connection claims, so a hand-edited
profile cannot walk in wearing someone else's face.

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

### Maps

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
  pixel/ characters/               sprite ingestion, composition, poses, palettes
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
the road outside, and they never go in. A wanderer works nowhere, so `org` and
`home` are both null, which is what leaves them without a desk (`deskOf` → -1).

It leans on the world map being a presence room (`WORLD_ROOM_SLUG`), so a
wanderer is an ordinary player in it and the same `wander()` that walks a
resident round a lobby walks them down the road — no separate movement code, and
because the server is the one walking them, every viewer sees the same steps
rather than each browser inventing its own. `WORLD_WANDER` bounds the ground
they keep to, spanned between two points the game already stands people on so
it is known pavement; nothing collides them, so those bounds are all that keeps
them off the buildings and out of the sea.

A resident's look is reserved (`RESERVED` in `lib/characters/library.ts`), so
adding one takes their sheet out of the player picker automatically — which is
why a wanderer still needs a `WORKER_SPRITES` entry: that is where
`scene-presence.ts` looks up the sheet to load for a presence player.

Michael, a chicken in a necktie, is the first and so far only wanderer.

### Characters

Two files per character in `public/characters/examples/`: `<Name>.png` is the
profile picture and `<Name>_sprite.png` is the sheet, which
`scripts/build-character.ts <Name>` cuts into
`public/characters/<Name>_48x48.png`. Capitalise both — the lookup is by name,
and a lowercase file only resolves on Windows.

The sheet wants **three rows** (down, up, right; left is mirrored) of three
idle then six walk frames, on a **flat background** — the backdrop is found from
the four corners and keyed out globally, so a checkerboard defeats it and the
rows then read as one. Prefer a dark backdrop: keying is deliberately tight
(tolerance 12) to spare dark outlines, so on white the lossy edge fringe
survives as a pale halo that shimmers frame to frame.

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
- Commits: `<type>(<scope>): <subject>` with type in
  `feat|fix|docs|refactor|perf|test|chore`. One concern per PR.

## Design intent

From `CONTRIBUTING.md`, and worth holding to when adding anything:

- Tasks should feel **spatial**, not abstract. In-world interaction over hidden menus.
- Worker behaviour should be **readable at a glance**.
- New scenes should expand the world, not add settings pages.
- New UI matches the pixel HUD style.

## Environment variables

| Variable                                                                 | Default                                 | Purpose                                                               |
| ------------------------------------------------------------------------ | --------------------------------------- | --------------------------------------------------------------------- |
| `ACCESS_CODE`                                                            | —                                       | Shared visitors' code; production refuses to boot with no code at all |
| `ACCESS_CODE_COOP` / `ACCESS_CODE_ROB`                                   | —                                       | One code each; brings its holder in as themselves                     |
| `AGENT_PROVIDER`                                                         | `claude`                                | Which provider runs agents                                            |
| `PORT` / `HOSTNAME`                                                      | `3000` / `localhost`                    | Server bind; also builds auth callback URLs                           |
| `ANTHROPIC_API_KEY`                                                      | —                                       | Required by `claude-api`                                              |
| `CLAUDE_BIN` / `CLAUDE_PERMISSION_MODE` / `CLAUDE_ALLOWED_TOOLS`         | — / `acceptEdits` / —                   | Claude CLI tuning                                                     |
| `AGENT_TOWN_MODEL`                                                       | CLI default                             | `opus` \| `sonnet` \| `haiku`                                         |
| `AGENT_MAX_CONCURRENT` / `AGENT_RUN_TIMEOUT_MS` / `ROOM_SPEND_LIMIT_USD` | 4 / 180000 / 50                         | Run limits                                                            |
| `AGENT_WORKSPACE_ROOT`                                                   | `.agent-workspaces`                     | Where seat sandboxes go                                               |
| `ERP_DB_PATH` / `UPLOADS_DIR`                                            | `.data/erp.sqlite` / beside the room db | Storage paths                                                         |
| `METTARA_API_SECRET` / `METTARA_PLATFORM_ID`                             | —                                       | Required by the `mettara` provider                                    |
| `AUTH_SECRET`, `AUTH_GOOGLE_*`, `AUTH_MICROSOFT_ENTRA_ID_*`              | —                                       | Auth.js sign-in; off when absent                                      |
| `NEXT_PUBLIC_TURN_URL` / `_USERNAME` / `_CREDENTIAL`                     | —                                       | TURN relay for voice behind strict NAT                                |
| `CSP_CONNECT_SRC`                                                        | —                                       | Extra `connect-src` origins                                           |

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
