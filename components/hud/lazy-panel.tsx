"use client";

import { Suspense, lazy, useCallback, useEffect, useState, type ComponentType } from "react";
import { X } from "lucide-react";
import { gameEvents } from "@/lib/events";
import { fixture, type FixtureId } from "@/lib/fixtures";
import type { FirstOpen } from "@/lib/hooks/usePanel";

/**
 * A panel whose code is fetched the first time somebody opens it.
 *
 * The games behind the fixtures — pinball, the arcade's five, ping pong, the
 * whiteboard — were all imported by the HUD up front, so every page load
 * carried a few hundred kilobytes of game for a room that has one machine in
 * its corner or none at all. Each is now a shell that listens for its open
 * event and nothing else, and the body arrives when it is first wanted.
 *
 * The shell has to be what listens, because the open event is the only way
 * in: a panel not yet loaded is a panel with nobody subscribed, and an open
 * nobody heard would leave the scene holding the character still under a
 * window that never came. So the shell remembers the open that loaded it
 * and hands it to the body as `first`, which `usePanel` replays on mount.
 * From then on the body is mounted for good and its own `usePanel` hears
 * every open, exactly as before.
 */

export interface LazyBodyProps {
  /**
   * The open that loaded this panel, to be replayed as it mounts — or null
   * where the reader gave up while it loaded, so it mounts shut.
   */
  first: FirstOpen | null;
}

interface Wanted {
  subject: string | null;
  /** False once the reader gave up waiting; the body then mounts shut. */
  live: boolean;
}

/** The first open of a fixture's panel, and a way to give up on it. */
export function useFirstOpen(id: FixtureId): [Wanted | null, () => void] {
  const spec = fixture(id);
  const [wanted, setWanted] = useState<Wanted | null>(null);

  useEffect(() => {
    const unsubscribe = gameEvents.on(spec.opens, (which?: string | null) =>
      setWanted((was) => (was?.live ? was : { subject: which ?? null, live: true })),
    );
    // The `?<param>=1` shortcut, which `usePanel` would have read. It goes
    // through the event for the reason that hook's does: so the scene hears.
    if (new URLSearchParams(window.location.search).get(spec.param) === "1") {
      gameEvents.emit(spec.opens);
    }
    return unsubscribe;
  }, [spec.opens, spec.param]);

  const cancel = useCallback(() => {
    setWanted((was) => (was ? { ...was, live: false } : was));
    gameEvents.emit(spec.closes);
  }, [spec.closes]);

  return [wanted, cancel];
}

/** What stands in the panel's place while its code arrives. */
export function PanelLoading({ label, onCancel }: { label: string; onCancel: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div className="pinball-overlay" role="dialog" aria-label={label} aria-busy="true">
      <div className="pixel-panel panel-loading">
        <span className="panel-loading__label">Setting up {label}…</span>
        <button
          type="button"
          className="pixel-icon-btn"
          style={{ width: 26, height: 26 }}
          onClick={onCancel}
          title="Close (Esc)"
          aria-label={`Close ${label}`}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

/**
 * A shell for one fixture's panel, loading `load` on the first open.
 *
 * `label` is what the placeholder says while it loads — "Setting up
 * pinball…" — since on a slow line that is a moment somebody sees.
 */
export function lazyPanel(
  id: FixtureId,
  label: string,
  load: () => Promise<{ default: ComponentType<LazyBodyProps> }>,
) {
  const Body = lazy(load);

  function LazyPanel() {
    const [wanted, cancel] = useFirstOpen(id);
    if (!wanted) return null;
    return (
      <Suspense fallback={wanted.live ? <PanelLoading label={label} onCancel={cancel} /> : null}>
        <Body first={wanted.live ? { subject: wanted.subject } : null} />
      </Suspense>
    );
  }

  LazyPanel.displayName = `LazyPanel(${id})`;
  return LazyPanel;
}
