"use client";

import type { ReactNode } from "react";
import type { Polled } from "@/lib/hooks/usePolledJson";

/**
 * What a board panel says when there is no board to show it.
 *
 * Two answers every one of the four board panels shares: the floor is not
 * this person's to read — the lift keeps them off it, and the routes behind
 * the walls now say so too rather than handing the numbers to anybody who
 * types the address — and the read did not get through at all. Anything
 * else (not configured, an error of the board's own) is the panel's.
 *
 * Null when neither is so, which is the panel's cue to draw what it has.
 */
export function boardTrouble(
  read: Pick<Polled<unknown>, "denied" | "failed" | "refresh">,
  /** "The board", "The desk" — what could not be reached. */
  what: string,
): ReactNode {
  if (read.denied) {
    return (
      <div className="board-note">
        <p className="board-note__lead">This floor&rsquo;s boards are private.</p>
        <p>They are for the people who work here.</p>
      </div>
    );
  }
  if (read.failed) {
    return (
      <div className="board-note">
        <p className="board-note__lead">{what} could not be reached.</p>
        <button type="button" className="pixel-button" onClick={read.refresh}>
          Try again
        </button>
      </div>
    );
  }
  return null;
}
