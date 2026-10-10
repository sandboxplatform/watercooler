# WaterCooler

A pixel office you walk around with other people. Everyone who opens the
site is in the same world: a world map with campuses, buildings with lobbies
and floors, an arcade, a ferry to an island and a second to a volcano with a
blob in its cave. You see each other move and hear each other on **Global
Chat**, which is WebRTC audio between browsers. Residents — characters, not
anything that runs — wander the buildings. Published to npm as
`@geezerrrr/watercooler` (`npx @geezerrrr/watercooler`).

Two things are gone and stay gone: **text chat** (the panel, the `say`
message, the `messages` table; a `said` still comes down the socket for the
residents' remarks, drawn as a bubble nothing keeps) and **agent dispatch**
(tasks, gateway, providers, MCP tools, seats, the ERP). Anything that still
says "agents" means the residents. The column beside the office is
**People**, **Badges** and **Eggs**, in that order.

The map is three screens wide — the **shops** in the west, the **town** in
the middle, the **wilderness** in the east — with thirty rows of wood and a
river along the top.

## Read the doc for the area you are touching

This file is the rules. The reasoning behind each feature — why it is the way
it is, and what went wrong the other ways — is in `docs/`, one file per area.
Read the one that matches before changing anything in it; most of what looks
arbitrary in this codebase is written down there with the bug that caused it.

| Doc                                                | Read before touching                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| [access-and-identity](docs/access-and-identity.md) | `server.ts`'s gate, `lib/server/access.ts`, codes, private floors, sign-in  |
| [presence-and-travel](docs/presence-and-travel.md) | The socket, sessions and claims, `lib/room-travel.ts`, the scene router     |
| [badges-and-profiles](docs/badges-and-profiles.md) | `lib/badges.ts`, `badge-rules`, the People column, the cast, profile cards  |
| [voice](docs/voice.md)                             | `lib/voice/`, the mic pill, ICE and TURN                                    |
| [floors](docs/floors.md)                           | Lobbies and floors, desks, the People floor's cubicles                      |
| [operations-floor](docs/operations-floor.md)       | The Operations floor's corridor, walls, boards, boardroom, meetings         |
| [operations-line](docs/operations-line.md)         | The six stations on a project room's floor, `lib/trello/flow.ts`            |
| [support-desk](docs/support-desk.md)               | Zoho: the queue, the pulse counts and sweeps, the desk's timezone           |
| [maps-and-assets](docs/maps-and-assets.md)         | `asset()`, the manifest, sheet loading, generated maps, outdoor rendering   |
| [characters](docs/characters.md)                   | Character sheets, `art/characters/`, `check:sheets`, installing a character |
| [world](docs/world.md)                             | The world map's stretches, highway, wood and river, volcano, `OutdoorScene` |
| [residents](docs/residents.md)                     | `ResidentSimulation`, wandering, routes, Michael                            |
| [camera-and-movement](docs/camera-and-movement.md) | Zoom limits, pinch, sprinting, facing                                       |
| [games](docs/games.md)                             | The lobby machines, the basketball court, the eggs                          |
| [fixtures](docs/fixtures.md)                       | `lib/fixtures.ts`, `usePanel`, lazy panels, Doc and Mettara                 |
| [integrations](docs/integrations.md)               | The customer mailboxes on the world map                                     |
| [storage](docs/storage.md)                         | The room store, migrations, the test database                               |
| [conventions](docs/conventions.md)                 | The HUD type scale and in-world lettering, in full                          |
| [deployment](docs/deployment.md)                   | The Dockerfile, Railway, the npm package, `/api/health`                     |

When you change behaviour, change the doc that describes it in the same
change, and `README.md` if the user-facing tour mentions it.

## Commands

```bash
pnpm install
pnpm dev            # custom server (tsx server.ts) on :3000 — use this, not `next dev`
pnpm build          # asset manifest, then next build
pnpm start          # production, same custom server (scripts/start.mjs)
pnpm test           # vitest, fast project only
pnpm test:all       # every test, including the slow project — run before pushing
pnpm test:changed   # only tests whose imports reach what you changed (seconds)
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm format         # prettier --write .
pnpm build:map      # regenerate public/maps/*.json from the room specs
pnpm build:art      # redraw the world art (tsx scripts/make-world-art.mjs)
pnpm assets         # regenerate lib/assets/manifest.json
pnpm preview:map <file.json> <out.png> [scale]   # draw a map, without the game
pnpm check:sheets [Name...]      # measure the figure inside every installed sheet
pnpm check:delivery <sheet.png>  # measure a delivered sheet before installing it
```

Node 22.5+ and pnpm 10 — `.nvmrc` pins it, CI and the image read it, because
the room store is built on `node:sqlite`.

CI runs format:check → lint → typecheck → build → test:all on every PR, so
run those before handing work back.

**Do not run the whole suite on every edit.** `pnpm test:changed` follows
imports, which misses two things — run them by hand:

- **Tests that read files at runtime.** `exact.test.ts` sweeps
  `public/characters/*.png` and `assets.test.ts` checks the manifest; change
  anything under `public/` and scoping misses them.
- **Foundational modules.** Half the codebase imports `TILE` from
  `lib/map/office.ts`; scoping saves nothing there, and that is correct.

`pnpm test` skips the `slow` project (listed in `vitest.config.ts`: the files
that drive real sockets against a real server, and the pinball wedge hunt).
CI and `test:all` run them.

`pnpm dev:next` skips the WebSocket layer — presence and voice both break
under it. Only for isolating a pure-Next rendering issue.

## Architecture

Next.js 16 App Router with a **custom HTTP server** (`server.ts`). It is
load-bearing: Next alone cannot hold the WebSocket upgrade, and Next
middleware never sees one — which is also why the access gate lives in
`server.ts` rather than in middleware.

```
server.ts
├── the gate            every page, API route and upgrade (lib/server/access.ts)
├── attachPresenceSocket()   people, positions, voice signalling (lib/server/socket/)
└── graceful shutdown   SIGTERM/SIGINT; uncaught exceptions logged
```

| Layer      | Lives in              | Rule                                                      |
| ---------- | --------------------- | --------------------------------------------------------- |
| Game       | `components/game/`    | Phaser. No React imports, no JSX.                         |
| HUD        | `components/hud/`     | React + pixel CSS. Never touches Phaser objects directly. |
| Server/lib | `lib/`, `lib/server/` | Shared logic and state. `lib/server/` is server-only.     |

Game and HUD talk **only** through the typed event bus in `lib/events.ts`
(`gameEvents.on/emit`, every event declared in `GameEventMap`). A new
interaction means a new event there first. HUD state that outlives a
component is a small module store read with `useSyncExternalStore` —
`lib/socket-store.ts` is the shape the online list, meetings, badges and eggs
share — never state hung on `window`. There is no React context store any
more; it held seats, and seats are gone.

**No room change is a page load.** `lib/room-travel.ts` pushes the URL and
emits `room-changed`; the scene router swaps the scene (after a paint), the
`Arrival` card covers the move, and the socket rejoins from the new scene.
The WebSocket and the peer connections survive every door. See
[presence-and-travel](docs/presence-and-travel.md).

## Gotchas

One line each; the doc beside each says why.

- **The gate is only on `server.ts`.** `server.prod.mjs` (what `npx` runs)
  has none, binds `127.0.0.1`, and has no presence socket. Do not duplicate
  the check there. [access](docs/access-and-identity.md)
- **Without `ACCESS_CODE`, production serves only the health check** (503
  otherwise). In dev, no code means an open world.
- **Adding a person is five places:** `AccessIdentity` (`lib/identity.ts`), a
  `Persona` and `IDENTITIES` (`lib/server/access.ts` — miss `IDENTITIES` and a
  correct code is turned away), `LIFT_REACH` (`lib/world/floors.ts`), and the
  cast (`lib/world/cast.ts`). `access.test.ts` and `cast.test.ts` catch it.
- **A resident cannot also hold a code** — a reserved look is kept out of the
  library, so the persona would be offered everybody's face but their own.
- **Private floors are enforced in four places** — the lift, `blockedByFloor`,
  the socket's join, and the board/desk routes' 403s. The lift alone is
  decoration.
- **A look is clamped on the socket** (`permittedLook`), not only hidden in
  the HUD; a persona wears their own sheet and nothing else.
- **Call `asset()` where a URL becomes a fetch**, not where a path is worked
  out. The manifest is committed; `pnpm build` and `build:map` regenerate it
  and `assets.test.ts` fails if it drifts. [maps-and-assets](docs/maps-and-assets.md)
- **Maps are generated.** Edit the spec in `lib/map/` or the tenant in
  `lib/world/tenants.ts`, then `pnpm build:map`. Hand edits to
  `public/maps/*.json` are overwritten.
- **`TOWN_LEFT` / `TOWN_TOP` shift the town**; a coordinate that is already a
  world column or row, sent through `town()`/`townWest()` again, moves twice.
  [world](docs/world.md)
- **Anything meeting the water is read off the water** (`southBank`,
  `northBank`, `riverBed()`), never written as a row number.
- **`lib/world/roster.ts` must not import scenery, wood or route code.** It is
  what the browser reads; importing the world's planting there costs ~180ms
  before first paint. The same goes for `lib/arcade/types.ts` and the games.
- **Outdoors, everything sorts by the bottom of its own picture**, so "solid"
  is the wrong question for where somebody can stand — `clearToStand` is.
- **Nothing collides a resident.** Their routes and `roomToStand` are the only
  things keeping them out of walls and each other.
- **The server decides** — the ball's flight, the eggs, the traffic, the blob,
  every badge. A browser sends one number or one word; a badge a client can
  claim is worth nothing. [badges](docs/badges-and-profiles.md)
- **A guest keeps nothing**: no badge, no egg, no desk. `isGuestHolder` is the
  rule, asked in `holderOf`, `awardMachineScore` and the store.
- **Presence is lossy, the online list is not a moment**: a move between
  rooms must never publish a list with the mover missing — voice chat tears
  down on that gap. The list is coalesced to once a tick for that reason.
- **`NEXT_PUBLIC_*` is build time.** The TURN variables are build arguments to
  the image; setting them on a running service does nothing.
- **The CSP must name** every ICE server (`connect-src`, from
  `lib/voice/ice.ts`) and Mettara (`frame-src`, from `lib/mettara.ts`). A
  server it does not name is dropped without a word.
- **The Dockerfile's runtime stage copies a named file list.** A new runtime
  file has to be named there; `runtime-image.test.ts` checks the list.
- **Migrations are append-only**: a new entry in `MIGRATIONS`
  (`lib/server/room-schema.ts`), never an edit to an old one. A failing
  migration stops the server; a database newer than the build is refused.
- **Every test file gets its own room database** (`vitest.setup.ts`); three
  files drive real servers and would otherwise lock each other out.
- **A `WORKER_SPRITES` key outlives its filename** — profiles are stored
  against it. Rename the file and the `path`, never the key.
- **Deliveries go in `art/characters/`**, not `public/`; `build-character.ts`
  installs the sheet and writes the concept as WebP. A sheet is copied, never
  re-encoded. [characters](docs/characters.md)
- **Real customer data lives in `data/`**, which is neither served nor
  published. Never put account ids or domains under `public/`.
- **Worktrees made by tooling live under `.claude/`**; eslint and vitest both
  ignore it. Leave those ignores in place.

## Layout

```
app/                    App Router pages + API routes (badges, characters, eggs, me, mettara, room, trello, zoho, auth)
components/
  game/
    PhaserGame.tsx      dynamic import, ssr:false; resize taken up on PRE_STEP
    scenes/             EntryScene (holds the router), OfficeScene, OutdoorScene → WorldScene, CampusScene, VolcanoScene
    entities/           Player, RemotePlayer, ChatBubble
    systems/            router, presence, fixtures, camera, culling, walker, OperationsFloor, PeopleFloor, the floor markers
    config/             animations, drawing (font, depths, panel colour, prompts)
    utils/              Pathfinder (painted grid), solids, wall-lettering, signs, sheets
  hud/                  every React panel, lazy-panel shells, hud.css
lib/
  events.ts socket-store.ts        the event spine, and the store shape the HUD shares
  fixtures.ts                      what you walk up to and press E at, read by both layers
  room-travel.ts                   every room change, none of them a page load
  badges.ts camera.ts legible.ts   the catalogue; how far out the camera stands; lettering size
  server/
    presence-socket.ts             the wiring; the pieces are in socket/
    socket/                        state, outbox (broadcast), lifecycle, online, badges, features/*
    rate-limit.ts relays.ts        per-connection budgets; relayed payloads rebuilt with caps
    access.ts route.ts             the door; the shared route helpers (refuse, roomParam, guarded)
    outbound.ts boards.ts          cachedFetch with timeouts; the board and desk reads and their gates
    room-store.ts room-schema.ts   the room database and its migrations
    residents.ts badge-rules.ts    the simulation; when a badge is earned
  world/
    roster.ts cast.ts              who the residents are; who the world is of
    ground.ts scenery.ts           ground and prop vocabulary; the world map's placement
    residents.ts route.ts          haunts and routes (server); typed-array route search
    tenants.ts floors.ts           buildings; floors, lifts and who may ride them
    wood.ts wilderness.ts volcano.ts basketball.ts eggs.ts mailboxes.ts traffic.ts blob.ts
  map/                             map specs: office, floor (+ ops-layout, ops-walls, ops-line, floor-fixtures), cubicles
  voice/                           voice-chat (conductor), view, microphone, peers, sweep, playback, offers, ice
  arcade/ pinball/ pong/           the games
  pixel/ characters/               PNG codec, sheet rules; the character store and library
  trello/ zoho/                    the two boards, read-only, with their arithmetic (flow.ts, pulse.ts)
art/characters/         delivered character art (inputs to build-character.ts; not served)
data/                   the customer record (not served, not published)
docs/                   the design docs above; docs/art/ holds the sheet production standard
public/maps|tilesets|sprites|characters|audio|ui|fonts
scripts/                build-map, build-assets, build-character, make-world-art, start, prepare-package, checks
```

## Tests

Tests sit in `__tests__/` beside the code they cover, plus `*.test.ts` files
in `lib/world/`. Coverage is substantial — when you change room-store, map,
world, socket or arcade logic, there is almost certainly a test already
asserting the current behaviour.

The suite runs on `node`. A React hook is the one thing that needs a DOM:
`lib/hooks/__tests__/render-hook.ts` is the harness, and a file that wants it
says `// @vitest-environment jsdom` on its first line.

## Conventions

- TypeScript strict. Prettier: double quotes, trailing commas, 100 cols,
  2-space indent. Husky + lint-staged format on commit.
- Comments explain _why_, in prose; match the density of the file you are in.
- Constants over magic numbers — tuning values belong in `lib/constants.ts`
  or `components/game/config/`.
- No global mutable state, nothing hung on `window`. Explicit state
  transitions over hidden side effects.
- Secrets come from the environment. `.env.local` is gitignored.
- **HUD type comes from the scale** (`--fs-3xs` … `--fs-xl` in
  `app/globals.css`), never a hard-coded `font-size`; the column resolves the
  same names larger. **In-world labels** go through `keepLegible`; lettering
  painted into the layout does not. [conventions](docs/conventions.md)
- No `dangerouslySetInnerHTML`. New outbound connections go in
  `CSP_CONNECT_SRC`, not a loosened policy.
- Cache headers live in `next.config.ts`: art is immutable only when asked for
  with `?v=`; `/audio/` is immutable, so change music by pointing at a new file.
- Commits: `<type>(<scope>): <subject>`, type in
  `feat|fix|docs|refactor|perf|test|chore`. One concern per PR.

## Design intent

- Everything should feel **spatial**, not abstract. In-world interaction over
  hidden menus.
- What people are doing should be **readable at a glance**.
- New scenes expand the world; they do not add settings pages.
- New UI matches the pixel HUD style.

## Environment variables

| Variable                                                                                          | Default                    | Purpose                                                                  |
| ------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| `ACCESS_CODE`                                                                                     | —                          | Shared visitors' code; production serves nothing but health without one  |
| `ACCESS_CODE_COOP` / `_ROB` / `_HUNTER` / `_NATHAN` / `_SARA` / `_ANDREW` / `_CAMPBELL` / `_NICK` | —                          | One code each; brings its holder in as themselves                        |
| `PORT` / `HOSTNAME`                                                                               | `3000` / `localhost`       | Server bind; also builds auth callback URLs                              |
| `ROOM_DB_PATH`                                                                                    | `.data/watercooler.sqlite` | The room database                                                        |
| `ZOHO_PULSE_STATUSES`                                                                             | `New,Queue,In Progress`    | The three standing statuses on Support's wall, in the order they hang    |
| `ZOHO_OPEN_STATUSES`                                                                              | `ZOHO_PULSE_STATUSES`      | What "open" means to the mailboxes on the world map                      |
| `ZOHO_TIMEZONE`                                                                                   | asked of the desk          | Which clock "today" runs on; otherwise the org's, else its agents'       |
| `METTARA_DOC_CHAT_URL`                                                                            | —                          | Doc's conversation: `https://app.mettara.ai/embed/convo/<id>`            |
| `METTARA_DOC_EMBED_ID`                                                                            | —                          | The `eid` stamped on that URL; Doc is mute without both                  |
| `METTARA_WORKSPACE_ID` / `METTARA_API_SECRET`                                                     | —                          | Signs Doc's embed tokens; without both, Doc has nothing to say to anyone |
| `METTARA_EMAIL_COOP` / `_ROB` / `_ANDREW`                                                         | —                          | The address each one's Mettara account is under; Doc is mute without it  |
| `AUTH_SECRET`, `AUTH_GOOGLE_*`, `AUTH_MICROSOFT_ENTRA_ID_*`                                       | —                          | Auth.js sign-in; off when absent                                         |
| `NEXT_PUBLIC_TURN_URL` / `_USERNAME` / `_CREDENTIAL`                                              | —                          | TURN relay for voice behind strict NAT; **build time**, not run time     |
| `CSP_CONNECT_SRC`                                                                                 | —                          | Extra `connect-src` origins                                              |
| `GIT_SHA`                                                                                         | —                          | The commit `/api/health` reports; the Dockerfile takes it as a build arg |

## Deployment

Railway deploys this repository itself on every push to `main`; CI cannot
gate it and does not try. The image (`node:22-slim`) runs
`node scripts/start.mjs` as PID 1, which passes stop signals to the server.
`/api/health` reports the running commit and start time, and CI's
`verify-deploy` job polls it (set a `HEALTH_URL` repository variable) until
the pushed commit answers. Details, and the deferred image work, in
[deployment](docs/deployment.md).
