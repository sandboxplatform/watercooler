"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { PanelRightClose } from "lucide-react";
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_SLIDE_MS,
} from "@/lib/constants";
import { saveSidebarWidth } from "@/lib/persistence";
import BadgesPanel from "./BadgesPanel";
import EggsPanel from "./EggsPanel";
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
 * Then Eggs, which is the third glance and last on purpose: badges are
 * what there is to do in this world and eggs are one of the things you do.
 * A collection that is not yours yet is the least pressing of the three
 * questions the column answers.
 *
 * There was a Chat tab ahead of all of them and it has gone with the
 * feature. A log of what was said, in a window beside the office, is the
 * thing this world was built not to have; talking is Global Chat, which is
 * a microphone and a pill in the bottom bar.
 */

export type SidebarTab = "people" | "badges" | "eggs";

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
  /**
   * The same fact as `draggingRef`, in a form the stylesheet can see. The
   * column slides on a transition, and a transition under a drag is a
   * column trailing a fifth of a second behind the pointer — so the class
   * turns it off for the length of the drag.
   */
  const [dragging, setDragging] = useState(false);
  /**
   * Whether the contents are mounted, which lags `open` on the way out.
   *
   * A column that empties the instant it is asked to close slides a blank
   * panel off the screen, which is the flash this whole arrangement exists
   * to have removed. So it keeps its panel for the length of the slide and
   * then lets it go — and nothing in here is subscribed or fetching while
   * the column is away, which is what returning null used to buy.
   *
   * Turned on while rendering rather than from an effect, because it is
   * derived from a prop: an effect would mount the panel a frame after the
   * slide had already started, which is the same flash from the other end.
   */
  const [lingering, setLingering] = useState(open);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setLingering(true);
  }
  const showBody = open || lingering;

  // ── Dragging the edge ──
  const startDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    draggingRef.current = true;
    setDragging(true);
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
      setDragging(false);
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

  // And let go of it a slide after it was asked to leave.
  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => setLingering(false), SIDEBAR_SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      // Escape closes the drawer on a phone, where it covers the office
      if (event.key === "Escape" && window.innerWidth < 900) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /*
    Always mounted, and closed is a width of zero rather than an absence.
    Nothing can be transitioned into or out of the document, so a column
    that came and went as a whole could only ever appear at full width.

    The width is a custom property rather than the element's own `width`
    because the body inside reads it too: the shell narrows to nothing while
    its contents stay the width they were, so the panel slides in from off
    the right edge instead of being squashed out of one — and no line of it
    re-wraps on the way, which is the other half of "no flashing". The
    office follows the shell's edge frame by frame, exactly as it does
    under a drag, so nothing is covered either.
  */
  return (
    <aside
      className={`app-sidebar${open ? " is-open" : ""}${dragging ? " is-dragging" : ""}`}
      style={
        {
          "--sidebar-w": `${width}px`,
          "--sidebar-ms": `${SIDEBAR_SLIDE_MS}ms`,
        } as CSSProperties
      }
      aria-label="Who is here, and their badges"
    >
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

      {showBody && (
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
              className={`app-sidebar__tab${tab === "eggs" ? " is-active" : ""}`}
              onClick={() => onTabChange("eggs")}
              title="What Michael has left in the grass, and who found it"
            >
              Eggs
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
            {tab === "people" ? (
              <PeoplePanel />
            ) : tab === "badges" ? (
              <BadgesPanel />
            ) : (
              <EggsPanel />
            )}
          </div>

          {/* The music and the way out, at the foot of the column that holds them */}
          <SidebarFooter
            musicOpen={musicOpen}
            onToggleMusic={onToggleMusic}
            characterOpen={characterOpen}
            onToggleCharacter={onToggleCharacter}
          />
        </div>
      )}
    </aside>
  );
}
