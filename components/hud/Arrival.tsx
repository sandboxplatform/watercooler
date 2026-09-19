"use client";

import "./character-studio.css";
import "./world-ui.css";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { gameEvents } from "@/lib/events";
import { arriveAt } from "@/lib/room-travel";
import { WORLD_PATH } from "@/lib/world/paths";
import CharacterPortrait from "./CharacterPortrait";

/**
 * Long enough to be a moment rather than a flicker, short enough that nobody
 * waits on it. The world map is usually up well before this.
 */
const MIN_MS = 900;
/**
 * And never longer than this, whatever the map says.
 *
 * The map may say nothing at all: somebody who reloads onto `/world` and
 * finishes the welcome there is already standing in the place they are being
 * walked into, so there is no scene to come up and no `place-changed` to
 * wait for. A cover that will not lift is worse than no cover.
 */
const MAX_MS = 6000;
/** The fade, which must match `.arrival--going` in world-ui.css. */
const FADE_MS = 600;

/**
 * Walking into the world.
 *
 * The welcome screen asks who you are, and the moment it has an answer the
 * world map comes up in the same page: a tilemap, six buildings, the sheet
 * you picked, and then your character standing on the plaza. That moment
 * used to be a page load, which at least looked like something happening.
 * In the page it is a blank canvas and then a person who is suddenly there.
 *
 * So this covers it: your own face and name while the map builds, and then
 * it lifts onto your character taking their first steps onto the plaza —
 * `walkIn` on the arrival, which is the same walk everybody takes out of a
 * door.
 *
 * **It does the travelling itself**, which is the one thing here that looks
 * out of place for a panel. It is deliberate: the whole point of it is to be
 * on screen before the canvas goes blank, and the only way to be sure of
 * that is for the thing that covers the screen to be what starts the move.
 * The welcome says who arrived; this walks them in.
 *
 * `arriveAt` rather than `travelTo`, because somebody may finish the welcome
 * while already standing on the world map — a visitor is put out there
 * before they have said who they are. Travelling to the address you are
 * already at does nothing at all, which would leave this card waiting on a
 * place that was never going to say it had arrived.
 */
export default function Arrival() {
  const [who, setWho] = useState<{ name: string; spritePath: string | null } | null>(null);
  const [going, setGoing] = useState(false);

  // The first word only: a second one while this is up would restart the
  // sequence, and with it the travelling underneath.
  useEffect(() => gameEvents.on("walking-in", (person) => setWho((up) => up ?? person)), []);

  useEffect(() => {
    if (!who) return;

    // On screen now; the world map can come up behind it.
    arriveAt(WORLD_PATH, { from: null, walkIn: true });

    let up = true;
    let lifting: ReturnType<typeof setTimeout> | null = null;
    const start = Date.now();

    const lift = () => {
      if (!up) return;
      up = false;
      setGoing(true);
      lifting = setTimeout(() => setWho(null), FADE_MS);
    };
    const liftWhenSettled = () => setTimeout(lift, Math.max(0, MIN_MS - (Date.now() - start)));

    // The map saying it is up is the honest signal; the ceiling is the
    // promise that this comes off either way.
    const unsub = gameEvents.on("place-changed", liftWhenSettled);
    const ceiling = setTimeout(lift, MAX_MS);

    return () => {
      unsub();
      clearTimeout(ceiling);
      if (lifting) clearTimeout(lifting);
    };
  }, [who]);

  if (!who || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`studio-overlay arrival${going ? " arrival--going" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="arrival__card">
        <p className="arrival__where">The world</p>
        <div className="arrival__figure">
          <CharacterPortrait spritePath={who.spritePath ?? undefined} name={who.name} large />
        </div>
        <p className="arrival__name">{who.name}</p>
        <p className="arrival__lead">Walking in…</p>
        <div className="arrival__bar" aria-hidden>
          <span />
        </div>
      </div>
    </div>,
    document.body,
  );
}
