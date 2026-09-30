"use client";

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { gameEvents } from "@/lib/events";
import { fixture } from "@/lib/fixtures";
import { onRoomMessage, sendRoom } from "@/lib/room-socket";
import { PanelLoading, useFirstOpen } from "./lazy-panel";
import type { Challenge } from "./PingPongBody";

const PingPongBody = lazy(() => import("./PingPongBody"));
const SPEC = fixture("pingpong");

/**
 * Ping pong at the water bucket: the part that is always listening.
 *
 * The table itself is loaded the first time it is wanted (see
 * `lazy-panel`), but a challenge can arrive while somebody is wandering
 * about with the game never opened, so the invitation and its toast live
 * here rather than in the table. Accepting is what opens the table, and the
 * challenge is handed over in `accepted` for the table to start from.
 */
export default function PingPong() {
  const [wanted, cancelLoading] = useFirstOpen("pingpong");
  const [open, setOpen] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  /** A challenge just said yes to, for the table to pick up as it opens. */
  const accepted = useRef<Challenge | null>(null);

  // Whether the table is up, so the toast gives way to it.
  useEffect(() => {
    const offOpen = gameEvents.on(SPEC.opens, () => setOpen(true));
    const offClose = gameEvents.on(SPEC.closes, () => setOpen(false));
    return () => {
      offOpen();
      offClose();
    };
  }, []);

  useEffect(
    () =>
      onRoomMessage((message) => {
        if (message.type !== "pong") return;
        const { payload, from } = message;
        if (payload.kind === "invite") setChallenge({ matchId: payload.matchId, from });
        // Withdrawn, or given up on: a toast for a game nobody is waiting
        // to play is an invitation to stand at an empty table.
        else if (payload.kind === "quit")
          setChallenge((was) => (was?.matchId === payload.matchId ? null : was));
      }),
    [],
  );

  const accept = () => {
    if (!challenge) return;
    sendRoom({
      type: "pong",
      to: challenge.from.id,
      payload: { kind: "accept", matchId: challenge.matchId },
    });
    accepted.current = challenge;
    setChallenge(null);
    // Through the event, not a state of our own: the office is what holds
    // the character still while the table is up, and it only hears that.
    gameEvents.emit(SPEC.opens);
  };

  const decline = () => {
    if (!challenge) return;
    sendRoom({
      type: "pong",
      to: challenge.from.id,
      payload: { kind: "decline", matchId: challenge.matchId },
    });
    setChallenge(null);
  };

  // Given up on while the table was still loading: a match said yes to is
  // a match to walk out of, so the other side is told.
  const cancel = useCallback(() => {
    const match = accepted.current;
    if (match) {
      sendRoom({
        type: "pong",
        to: match.from.id,
        payload: { kind: "quit", matchId: match.matchId },
      });
      accepted.current = null;
    }
    cancelLoading();
  }, [cancelLoading]);

  return (
    <>
      {!open && challenge && (
        <div className="pong-toast pixel-panel">
          <div className="pong-toast__text">
            <strong>{challenge.from.name}</strong> fancies a game of ping pong
          </div>
          <div className="pong-toast__actions">
            <button type="button" className="pixel-button pixel-button--primary" onClick={accept}>
              Play
            </button>
            <button type="button" className="pixel-button" onClick={decline}>
              Not now
            </button>
          </div>
        </div>
      )}
      {wanted && (
        <Suspense
          fallback={wanted.live ? <PanelLoading label="ping pong" onCancel={cancel} /> : null}
        >
          <PingPongBody
            first={wanted.live ? { subject: wanted.subject } : null}
            acceptedRef={accepted}
          />
        </Suspense>
      )}
    </>
  );
}
