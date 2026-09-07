"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { gameEvents } from "@/lib/events";
import { fixture, type FixtureId } from "@/lib/fixtures";

/**
 * The lifecycle every fixture's panel shares.
 *
 * Walking up to a thing and pressing E is the game's core interaction, and
 * each of the six panels behind it used to hand-roll the same four pieces:
 * an `open` flag, a subscription to its open event, the `?<param>=1`
 * shortcut, and a close that both hides the panel and tells the office. Six
 * copies of a lifecycle is six chances to get one part of it wrong, and two
 * of them were: the whiteboard and the project board both read `?board=1`
 * and opened stacked on each other, and accepting a ping pong challenge set
 * the panel's own state without emitting anything, so the office went on
 * letting the character walk about behind a live match.
 *
 * Both come from the same place — a panel that knows how to show itself but
 * not how to say so. Here the only way in is the event, for everybody.
 *
 * The events and the parameter come from `lib/fixtures.ts` rather than being
 * written out again, so a panel cannot drift from what the scene emits at
 * it, and the registry's test is what keeps two panels off one parameter.
 */

export interface Panel {
  /** Whether the panel is up. */
  open: boolean;
  /**
   * Close it and tell the office, so the character walks again.
   *
   * Stable across renders, so it can go straight into a dependency list or
   * a controller binding.
   */
  close: () => void;
  /**
   * Open it from the HUD's own side — a challenge accepted, a game handed
   * on. Emits the same event the scene does when somebody presses E,
   * because that event is also what stops the character walking about
   * underneath: setting the state directly opens the panel over a room that
   * does not know it is there.
   */
  show: () => void;
}

interface PanelOptions {
  /**
   * Run as it opens: load what it shows, start a game, reset a menu. Read
   * fresh each time rather than subscribed against, so it need not be
   * memoised at the call site.
   */
  onOpen?: () => void;
  /** Run as it closes, before the office is told. Same. */
  onClose?: () => void;
  /**
   * Whether Escape closes it. On by default, which is what a panel should
   * do; pass false for one that reads its own keys, where Escape means
   * something else first — the arcade backs out of a game to the menu
   * before it backs out of the room.
   */
  escape?: boolean;
}

export function usePanel(id: FixtureId, options: PanelOptions = {}): Panel {
  const [open, setOpen] = useState(false);
  const spec = fixture(id);
  const { escape = true } = options;

  // The callbacks are read at the moment they are needed rather than
  // subscribed against, so a caller passing a fresh closure every render
  // does not tear the subscription down and build it again. Kept current in
  // an effect rather than assigned while rendering, which is not allowed —
  // the initial value is already this render's, so nothing is missed before
  // the first one runs.
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const show = useCallback(() => gameEvents.emit(spec.opens), [spec.opens]);

  const close = useCallback(() => {
    latest.current.onClose?.();
    setOpen(false);
    gameEvents.emit(spec.closes);
  }, [spec.closes]);

  // Opening: the scene says when somebody walked up and pressed E, and the
  // query parameter goes through the same event, so there is one way in.
  useEffect(() => {
    const unsubscribe = gameEvents.on(spec.opens, () => {
      latest.current.onOpen?.();
      setOpen(true);
    });
    if (new URLSearchParams(window.location.search).get(spec.param) === "1") {
      gameEvents.emit(spec.opens);
    }
    return unsubscribe;
  }, [spec.opens, spec.param]);

  useEffect(() => {
    if (!open || !escape) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };
    // Capture, on the document: the games behind these panels read keys
    // too, and Escape has to reach the panel first.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, escape, close]);

  return { open, close, show };
}
