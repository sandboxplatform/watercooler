"use client";

import { useCallback, useEffect, useRef } from "react";
import { PanelRightClose } from "lucide-react";
import { SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from "@/lib/constants";
import { saveSidebarWidth } from "@/lib/persistence";
import BadgesPanel from "./BadgesPanel";
import PeoplePanel from "./PeoplePanel";
import SidebarFooter from "./SidebarFooter";
import { useOnline } from "@/lib/presence-online";

/**
 * The column that stays.
 *
 * People first, because it is the question the column exists to answer —
 * who else is about, and where — and because the Online pill in the bottom
 * bar counts exactly this list and opens it. Badges are the second glance.
 *
 * There was a Chat tab ahead of both and it has gone with the feature. A
 * log of what was said, in a window beside the office, is the thing this
 * world was built not to have; talking is Global Chat, which is a
 * microphone and a pill in the bottom bar.
 */

export type SidebarTab = "people" | "badges";

interface SidebarProps {
  open: boolean;
  /**
   * Which tab is showing. Held by the page rather than here, so the HUD can
   * open the column on a tab of its own choosing — the Online pill counts
   * the people this panel lists, and pressing it lands on them.
   */
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
  /**
   * Whether the volume slider at the foot of the column is up. Held by the
   * page rather than here, because a controller's shoulder buttons turn the
   * HUD's panels and this is one of them.
   */
  musicOpen: boolean;
  onToggleMusic: () => void;
  /**
   * Whether the character picker is up. Held by the page for the reason the
   * profile is mounted there: the window is over the whole app, column
   * included, and the button that opens it is down in the footer.
   */
  characterOpen: boolean;
  onToggleCharacter: () => void;
}

export default function Sidebar({
  open,
  tab,
  onTabChange,
  width,
  onWidthChange,
  onClose,
  musicOpen,
  onToggleMusic,
  characterOpen,
  onToggleCharacter,
}: SidebarProps) {
  const online = useOnline();
  const draggingRef = useRef(false);

  // ── Dragging the edge ──
  const startDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    draggingRef.current = true;
    // Capture keeps the drag alive when the pointer runs ahead of the edge.
    // It throws if the browser has already let the pointer go, and losing it
    // must not cost the drag — or, worse, the width that came out of it.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The drag works either way
    }
  }, []);

  const onDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      // Measured from the right edge of the window, so the handle stays under
      // the pointer however the window is sized
      const next = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth - event.clientX),
      );
      onWidthChange(next);
    },
    [onWidthChange],
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      // Remember the width first: releasing the capture can throw, and the
      // width the reader just chose is the thing worth keeping
      saveSidebarWidth(width);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Nothing to release
      }
    },
    [width],
  );

  // Double-click the handle to go back to a sensible width
  const resetWidth = useCallback(() => {
    onWidthChange(SIDEBAR_DEFAULT_WIDTH);
    saveSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
  }, [onWidthChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      // Escape closes the drawer on a phone, where it covers the office
      if (event.key === "Escape" && window.innerWidth < 900) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside className="app-sidebar" style={{ width }} aria-label="Who is here, and their badges">
      <div
        className="app-sidebar__handle"
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={resetWidth}
        role="separator"
        aria-label="Drag to resize"
      />

      <div className="app-sidebar__body">
        <div className="app-sidebar__tabs">
          <button
            type="button"
            className={`app-sidebar__tab${tab === "people" ? " is-active" : ""}`}
            onClick={() => onTabChange("people")}
            title="Everyone online, and where they are"
          >
            People
            {online.length > 0 && <span className="app-sidebar__count">{online.length}</span>}
          </button>
          <button
            type="button"
            className={`app-sidebar__tab${tab === "badges" ? " is-active" : ""}`}
            onClick={() => onTabChange("badges")}
          >
            Badges
          </button>
          <button
            type="button"
            className="app-sidebar__collapse"
            onClick={onClose}
            title="Hide the panel"
            aria-label="Hide the panel"
          >
            <PanelRightClose size={14} />
          </button>
        </div>

        <div className="app-sidebar__content">
          {tab === "people" ? <PeoplePanel /> : <BadgesPanel />}
        </div>

        {/* The music and the way out, at the foot of the column that holds them */}
        <SidebarFooter
          musicOpen={musicOpen}
          onToggleMusic={onToggleMusic}
          characterOpen={characterOpen}
          onToggleCharacter={onToggleCharacter}
        />
      </div>
    </aside>
  );
}
