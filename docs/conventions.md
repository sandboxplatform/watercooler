# Conventions, in full

The rationale behind the HUD type scale, in-world lettering, and the cache headers. Moved out of CLAUDE.md so it is read when the work needs it rather than in every session.

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
  handset opens at `ZOOM_OPEN_MIN`, where a 10px sign was landing as five
  pixels of screen — and can be pinched out to `ZOOM_MIN`, a quarter. The rule is a **floor, not a fixed size**: `1 / zoom`
  where that magnifies and 1 elsewhere, so a monitor is untouched, a laptop
  gains a little and a phone doubles, and goes on growing as it is pinched
  out. A true `1 / zoom` would have made every
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
  of them.

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
