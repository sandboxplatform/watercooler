"use client";

import { useEffect, useRef } from "react";

const MARK = "watercoolerPanel";

function isOurEntry(state: unknown): boolean {
  return typeof state === "object" && state !== null && MARK in state;
}

/**
 * Let the back button close a panel instead of leaving the app.
 *
 * On a phone the People column is a drawer over the office, and the obvious way
 * to dismiss anything covering the screen is the back button — which, with
 * nothing done about it, walks out of the app altogether and loses the room.
 *
 * The trick is an extra history entry while the panel is open: back consumes
 * that instead of the page. If the panel is closed some other way the entry
 * is taken off again, or the next back press would appear to do nothing.
 */
export function useBackToClose(active: boolean, onClose: () => void): void {
  const ourEntry = useRef(false);

  useEffect(() => {
    if (!active) return;

    window.history.pushState({ [MARK]: true }, "");
    ourEntry.current = true;

    const onPopState = () => {
      // The browser has taken our entry back; nothing left to clean up
      ourEntry.current = false;
      onClose();
    };

    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      if (!ourEntry.current) return;
      ourEntry.current = false;
      // Closed by a button rather than by going back: drop the entry, so the
      // next back press means what it says — but only if it is still the
      // one on top. A room change while the drawer was open pushes the new
      // room over it, and going back then would pop the room instead and
      // walk the person back out of the door they had just come through.
      // Left where it is, our entry has the old room's address, which is
      // exactly what the next back press ought to reach.
      if (isOurEntry(window.history.state)) window.history.back();
    };
  }, [active, onClose]);
}
