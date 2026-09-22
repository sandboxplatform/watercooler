"use client";

import "./character-studio.css";
import "./world-ui.css";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SPRITE_PATH } from "@/components/game/config/animations";
import { gameEvents } from "@/lib/events";
import { readProfile } from "@/lib/profile";
import { arriveAt } from "@/lib/room-travel";
import { WORLD_ROOM_SLUG } from "@/lib/rooms";
import { describeRoom } from "@/lib/world/places";
import { WORLD_PATH } from "@/lib/world/paths";
import CharacterPortrait from "./CharacterPortrait";

/**
 * Long enough to be a moment rather than a flicker, short enough that nobody
 * waits on it. The world map is usually up well before this.
 */
const WALK_IN_MS = 900;
/**
 * And a shorter floor for an ordinary move.
 *
 * Walking into the world for the first time is meant to be a moment; a lift
 * ride is not, and a card held for the best part of a second on every door
 * would make the world feel slower than the freeze it replaced. Short enough
 * to be a wipe rather than a wait, long enough that a swap which happens to
 * be quick is not a flash of somebody's face.
 */
const MOVE_MS = 300;
/**
 * And never longer than this, whatever the place says.
 *
 * The place may say nothing at all: somebody who reloads onto `/world` and
 * finishes the welcome there is already standing in the place they are being
 * walked into, so there is no scene to come up and no `place-changed` to
 * wait for. A cover that will not lift is worse than no cover.
 */
const MAX_MS = 6000;
/** The fade, which must match `.arrival--going` in world-ui.css. */
const FADE_MS = 600;

/** What is being covered: where it is going, and who is going there. */
interface Cover {
  who: { name: string; spritePath: string };
  /** Where they are headed, said the way the People panel says it. */
  where: string;
  lead: string;
  /** The floor under this one — see the two constants above. */
  floorMs: number;
  /** When the move began, which is what the floor is measured from. */
  at: number;
  /** Whether this card is also what starts the journey; see below. */
  travels: boolean;
}

/** Our own face and name, for a card nobody had to be told about. */
function us(): Cover["who"] {
  const profile = readProfile();
  return { name: profile.name, spritePath: profile.character?.path ?? SPRITE_PATH };
}

/**
 * Going somewhere: the card that covers the moment.
 *
 * Every move in this world is a scene being torn down and another being
 * built, and that build is one long synchronous stretch — a tilemap or a
 * map's worth of ground, the buildings, the sheets. The browser cannot paint
 * in the middle of it, so whatever was on screen when the move began stays
 * there for the whole of it: walk out of a lobby and your own character
 * appears to freeze in the doorway rather than going through it.
 *
 * So this covers it, in the two places a move comes from:
 *
 * - **Walking in**, off `walking-in`. The welcome screen asks who you are
 *   and the world map comes up in the same page; without a word said that is
 *   a blank canvas and then a character who simply exists on the plaza.
 * - **Every other move**, off `room-changed` — a front door, a lift, a
 *   campus gate, the back button. `scene-router` holds the swap back for a
 *   paint so this is on screen before the thread goes away; see `afterPaint`
 *   there for why that is what the freeze was.
 *
 * Either way it lifts when the new place says it is up, with a floor under
 * it so it is a moment rather than a flicker and a ceiling over it so a
 * place that never says anything cannot strand anybody behind it.
 *
 * **The first card does the travelling**, which is the one thing here that
 * looks out of place for a panel. It is deliberate: the whole point of it is
 * to be on screen before the canvas goes blank, and the only way to be sure
 * of that is for the thing that covers the screen to be what starts the
 * move. Nothing else needs it, because nothing else makes its move in the
 * tick it announces it.
 *
 * `arriveAt` rather than `travelTo`, because somebody may finish the welcome
 * while already standing on the world map — a visitor is put out there
 * before they have said who they are. Travelling to the address you are
 * already at does nothing at all, which would leave this card waiting on a
 * place that was never going to say it had arrived.
 */
export default function Arrival() {
  const [cover, setCover] = useState<Cover | null>(null);
  /**
   * The card on its way off — which card, rather than whether one is.
   *
   * A flag would have to be cleared every time a fresh card goes up, and a
   * move landing while the last one is still fading would otherwise raise a
   * card that is already invisible. Naming the card it belongs to says the
   * same thing without a reset to forget.
   */
  const [fading, setFading] = useState<Cover | null>(null);
  const going = cover !== null && fading === cover;

  /**
   * The new place saying it is up — remembered as well as answered.
   *
   * The card goes up on the move being announced and the scene is swapped
   * two frames later, so ordinarily it is listening long before the place
   * has anything to say. Ordinarily: React commits on a schedule of its own,
   * and a `place-changed` that landed before this had got as far as
   * subscribing would leave the card up until its ceiling. So the arrival is
   * kept with the time it happened and the card asks whether one has landed
   * since it went up, rather than only waiting for the next.
   */
  const arrived = useRef<{ at: number; lift: (() => void) | null }>({ at: 0, lift: null });
  useEffect(
    () =>
      gameEvents.on("place-changed", () => {
        arrived.current.at = Date.now();
        arrived.current.lift?.();
      }),
    [],
  );

  // The first word only: a second one while this is up would restart the
  // sequence, and with it the travelling underneath.
  useEffect(
    () =>
      gameEvents.on("walking-in", (who) =>
        setCover(
          (up) =>
            up ?? {
              who: { name: who.name, spritePath: who.spritePath ?? SPRITE_PATH },
              where: describeRoom(WORLD_ROOM_SLUG).label,
              lead: "Walking in…",
              floorMs: WALK_IN_MS,
              at: Date.now(),
              travels: true,
            },
        ),
      ),
    [],
  );

  // And every move after it. The room comes down the event rather than being
  // read off the address bar, which is the same answer and one fewer way of
  // being a step behind it.
  //
  // This one **replaces** rather than standing aside, which is the opposite
  // of the rule above and for the same reason: a move announces itself once,
  // so a second word here is a second journey and the newer destination is
  // the true one. Dropped, it would leave the card from the first move
  // fading off over the second one's build — the freeze back, at the one
  // moment there was already something on screen that should have covered
  // it. The exception is the card that is itself travelling: the walk in
  // announces its own move, and answering that would swap the arrival for a
  // second card about the same journey.
  useEffect(
    () =>
      gameEvents.on("room-changed", (room) =>
        setCover((up) =>
          up?.travels
            ? up
            : {
                who: us(),
                where: describeRoom(room).label,
                lead: "On your way…",
                floorMs: MOVE_MS,
                at: Date.now(),
                travels: false,
              },
        ),
      ),
    [],
  );

  useEffect(() => {
    if (!cover) return;

    // On screen now; the world map can come up behind it.
    if (cover.travels) arriveAt(WORLD_PATH, { from: null, walkIn: true });

    let up = true;
    let lifting: ReturnType<typeof setTimeout> | null = null;
    let settling: ReturnType<typeof setTimeout> | null = null;

    const lift = () => {
      if (!up) return;
      up = false;
      setFading(cover);
      // By the card it was raised for, because a move that landed while this
      // one was still going has already put another up in its place.
      lifting = setTimeout(() => setCover((shown) => (shown === cover ? null : shown)), FADE_MS);
    };
    const liftWhenSettled = () => {
      if (settling) clearTimeout(settling);
      settling = setTimeout(lift, Math.max(0, cover.floorMs - (Date.now() - cover.at)));
    };

    // The place saying it is up is the honest signal; the ceiling is the
    // promise that this comes off either way. Held in a local because the
    // box itself never changes, whatever is in it.
    const settled = arrived.current;
    settled.lift = liftWhenSettled;
    if (settled.at > cover.at) liftWhenSettled();
    const ceiling = setTimeout(lift, MAX_MS);

    return () => {
      settled.lift = null;
      clearTimeout(ceiling);
      if (settling) clearTimeout(settling);
      if (lifting) clearTimeout(lifting);
    };
  }, [cover]);

  if (!cover || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`studio-overlay arrival${going ? " arrival--going" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="arrival__card">
        <p className="arrival__where">{cover.where}</p>
        <div className="arrival__figure">
          <CharacterPortrait spritePath={cover.who.spritePath} name={cover.who.name} large />
        </div>
        <p className="arrival__name">{cover.who.name}</p>
        <p className="arrival__lead">{cover.lead}</p>
        <div className="arrival__bar" aria-hidden>
          <span />
        </div>
      </div>
    </div>,
    document.body,
  );
}
