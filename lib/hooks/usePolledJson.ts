"use client";

import { useCallback, useEffect, useState } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("Polled");

/**
 * A JSON answer read while a panel is up, and read again every so often.
 *
 * The four board panels — the project board, its numbers, the help desk and
 * the desk's numbers — each wrote this out for themselves, forty lines
 * apiece, and all four got the same three things wrong: an answer that came
 * back after the panel had moved on was put up anyway, so two quick opens
 * could end on the first one's board; nothing was ever cancelled; and a
 * panel opened a second time showed the last board it had been looking at
 * until the new one arrived, which on a floor of three project rooms is the
 * wrong room's work under this room's name.
 *
 * So the answer belongs to the address it was asked of. A new address — a
 * different room, a different board, or the panel closed and opened again —
 * starts from nothing, and anything still in flight for the old one is
 * aborted and ignored if it lands.
 */

export interface Polled<T> {
  /** The body of the last answer for this address, whatever its status. */
  data: T | null;
  /** The HTTP status that came with it, or null before one has. */
  status: number | null;
  /** The request itself failed — the network, or a body that was not JSON. */
  failed: boolean;
  /** Refused as not this person's to see: a private floor's boards. */
  denied: boolean;
  /** Nothing yet, or a read asked for by hand is on its way. */
  loading: boolean;
  /** Read again now, keeping what is shown until the answer comes. */
  refresh: () => void;
}

interface Answer<T> {
  url: string;
  data: T | null;
  status: number | null;
  failed: boolean;
}

export function usePolledJson<T>(
  url: string | null,
  { open, every }: { open: boolean; every: number },
): Polled<T> {
  const active = open ? url : null;

  const [answer, setAnswer] = useState<Answer<T> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [asked, setAsked] = useState(0);

  // A new address starts from nothing — and closing is a new address, so
  // opening again does not put the last one back up while it loads. Set
  // while rendering rather than in an effect, since it is derived from the
  // props: an effect would draw one frame of the stale board first.
  const [shownFor, setShownFor] = useState(active);
  if (shownFor !== active) {
    setShownFor(active);
    setAnswer(null);
    setRefreshing(false);
  }

  useEffect(() => {
    if (!active) return;
    let current: AbortController | null = null;
    let live = true;

    const read = async () => {
      // One request at a time: a poll that finds the last one still out
      // replaces it rather than racing it.
      current?.abort();
      const controller = new AbortController();
      current = controller;
      try {
        const response = await fetch(active, { cache: "no-store", signal: controller.signal });
        let data: T | null = null;
        try {
          data = (await response.json()) as T;
        } catch {
          // Not JSON: the answer is its status, which is failure.
        }
        if (!live || current !== controller) return;
        setAnswer({ url: active, data, status: response.status, failed: data === null });
      } catch (err) {
        if (!live || current !== controller) return;
        log.warn(`could not read ${active}:`, (err as Error).message);
        setAnswer((was) => ({
          url: active,
          data: was?.url === active ? was.data : null,
          status: null,
          failed: true,
        }));
      } finally {
        if (live && current === controller) setRefreshing(false);
      }
    };

    void read();
    const timer = every > 0 ? window.setInterval(() => void read(), every) : null;
    return () => {
      live = false;
      current?.abort();
      if (timer !== null) window.clearInterval(timer);
    };
  }, [active, every, asked]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setAsked((n) => n + 1);
  }, []);

  const mine = answer && answer.url === active ? answer : null;
  return {
    data: mine?.data ?? null,
    status: mine?.status ?? null,
    failed: mine?.failed ?? false,
    denied: mine?.status === 403,
    loading: !!active && (!mine || refreshing),
    refresh,
  };
}
