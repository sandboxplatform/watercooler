"use client";

import { useCallback, useEffect, useState } from "react";
import { gameEvents } from "@/lib/events";

/** The three windows over the whole app that are opened by name off the bus. */
export type BusWindowEvent = "open-profile" | "open-egg" | "open-badge";

/**
 * A window the bus opens: a profile, an egg, a badge.
 *
 * Each of the three held the same four things — the value it was opened
 * with, a subscription to its event, a close, and Escape — written out
 * three times. `accept` turns what arrived into what the window shows, or
 * null for something it has no card for; define it outside the component,
 * or it is a new subscription every render.
 */
export function useBusWindow<T>(event: BusWindowEvent, accept: (raw: string | null) => T | null) {
  const [value, setValue] = useState<T | null>(null);

  useEffect(
    () => gameEvents.on(event, (raw: string | null) => setValue(accept(raw))),
    [event, accept],
  );

  const close = useCallback(() => setValue(null), []);

  const up = value !== null;
  useEffect(() => {
    if (!up) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [up, close]);

  return { value, show: setValue, close };
}
