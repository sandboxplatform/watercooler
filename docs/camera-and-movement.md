# Camera and movement

Zoom limits, pinch, sprinting and facing. Moved out of CLAUDE.md so it is read when the work needs it rather than in every session.

**The camera.** Every place opens at the zoom that fits the lobby, so people
and signs are the same size out of doors as in — never under `ZOOM_OPEN_MIN`,
which is half size and where a phone opens.

**Every place zooms in to `ZOOM_MAX`; out of doors stops where the place's
edges reach the screen's, and every room stops at the whole of the widest
room.** That is Operations,
seventy-three tiles of corridor, and seeing it end to end is as much as anybody
standing indoors needs — past that a room is a stamp in a screen of black.
`zoomFloor` in `lib/camera.ts` is the stop, off the viewport, so it is the
same sight on any screen: a monitor stops a little over half and a phone well
down at `ZOOM_MIN`. `widestRoom` in `lib/world/floors.ts` is the room, read
off the tenants rather than written down, and `floors.test.ts` holds it to
every map on disk. A place pulled back past its own size is drawn in the
middle of the screen with background round it (`updateCameraBounds`).

**Out of doors the place is its own stop** — `outdoorFloor`, which lets the
camera stand back until **another** of the place's edges comes onto the
screen, and no further. The world map is wider than it is deep against any
ordinary screen, so its top and bottom arrive together long before either
end: on a 1080p monitor that is a little over a quarter, with the wood's
edge at the top of the screen and the sea at the bottom. It used to go the
whole way to `ZOOM_MIN`, which was the same map with a band of black over
the trees and another under the water. "Another" because a small place
already shows some edges where it opens: the island has background either
side and may stand back until its top and bottom are on too; a campus and
the cave open whole and stay where they opened. On a phone the world map
would only fill the screen below `ZOOM_MIN`, so that is still where it stops.

**One stop for every room, not one per room**, and that is the part to keep.
It used to be two rules and a narrower range. A room stopped at the lobby's
fit, so Operations could only ever be looked at a lobby's width at a time, and
a phone opened at the old floor of 0.5 and could not be pinched out at all. Stopping each room at
its own whole was tried next and taken out again: a lobby opens whole on a
desktop, so its wheel did nothing, which reads as the zoom being broken rather
than as there being nothing more to see. Then nothing stopped a room at all,
which is the stamp in the black. The widest room answers both — a lobby still
has a wheel, and nothing indoors goes past a floor seen whole.

The opening floor is a constant of its own for the phone's sake: lowering the
pinch's limit was not meant to open every room on a phone smaller.

`LEGIBLE_MAX_SCALE` is tied to `ZOOM_MIN` by `legible.test.ts` — at a
quarter zoom a name tag is drawn four times over to arrive at the size it was
written, and a cap under that is lettering that vanishes exactly when
somebody has stood back to look for it. Lower one, raise the other.

Three things beyond that:

- **The world map opens where it was left.** `reopenZoom` in `lib/camera.ts`
  is the rule and `loadWorldZoom` the store, in the browser for the reason
  sprinting is — a door builds a whole new scene, which is exactly the moment
  this is for. The saved value is clamped rather than trusted, because the
  range has moved between builds and a stored value is whatever the browser
  held. Rooms are still fitted every time, which is the point of
  fitting them; campuses too.
- **A resize is not an arrival.** Once the wheel or a pinch has chosen a
  zoom, the People column opening on Tab, its handle being dragged and a
  phone turned round all keep it. A room used to refit on every one of them,
  which on Operations meant pulling back to see the whole corridor, opening
  the column to see who was about, and being snapped straight back in. The
  choice is `chosen` on the controller and lives as long as the scene:
  arriving somewhere is still a fit. It is held to a room's stop, which moves
  with the window — and kept unclamped, so a window that widens and narrows
  again hands it back.
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
rooms away.

**And a phone has no Shift**, which left the one mode in this world that is
neither a panel nor a place reachable from a keyboard and nowhere else. The
pill beside the microphone in the bottom bar is the same press by another
route — `sprint-pressed` on the bus, which `Player.toggleSprint` answers, so
there is one place the flip happens and the HUD cannot be sprinting while
the room is walking. It is drawn on every screen rather than only the touch
ones: the mode outlives the character, the door and the session, so a
browser that was left sprinting should say so wherever it is being read.

**The icon and nothing else, either way.** The microphone earns its label
because the thing it joins has a name and a number of people in it; this is
a switch with two faces, which has said which it is in by being lit. A word
beside it would be the same fact printed twice, in the place with least room
for it.

`sprint-changed` is the other half, and it is **pushed in when a character
is built as well as on a press**, for the reason the voice mark is: a door
builds a new character and a bus carries only what happens next. The pill
reads `loadSprinting` through `useSprinting` — an external store rather than
state kept in step by an effect, since this is a fact about the browser
rather than about any component.

`player.speed` is what
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
