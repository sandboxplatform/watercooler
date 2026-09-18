"use client";

import dynamic from "next/dynamic";
import { useCallback, useState, useSyncExternalStore } from "react";
import { StudioProvider } from "@/lib/store";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GameErrorBoundary } from "@/components/game/GameErrorBoundary";
import GameHud from "@/components/hud/GameHud";
import Sidebar, { type SidebarTab } from "@/components/hud/Sidebar";
import { loadSidebarWidth } from "@/lib/persistence";
import { useBackToClose } from "@/lib/hooks/useBackToClose";
import { SIDEBAR_DEFAULT_WIDTH } from "@/lib/constants";

const PhaserGame = dynamic(() => import("@/components/game/PhaserGame"), {
  ssr: false,
});

/** The stored width is a client-only fact, so the server must not read it. */
const subscribeToNothing = () => () => {};

/**
 * Below this the column is a drawer over the office rather than a column
 * beside it — and a drawer has no business being open before it is asked for.
 */
const SIDEBAR_FITS_AT = 900;
const readWideEnough = () => window.innerWidth >= SIDEBAR_FITS_AT;

export default function Page() {
  const storedWidth = useSyncExternalStore(
    subscribeToNothing,
    loadSidebarWidth,
    () => SIDEBAR_DEFAULT_WIDTH,
  );
  const [width, setWidth] = useState<number | null>(null);
  /**
   * Closed until the person opens it. It used to open itself on a wide
   * screen, which meant the office arrived already half covered by a
   * conversation nobody had asked for yet.
   */
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /**
   * Which tab the column is showing, and People is where it opens. The
   * Online pill in the bottom bar is a count of exactly that list, so
   * pressing it has to land there rather than on whatever was last read —
   * and People is the first tab, so a column opened any other way starts
   * on it too.
   */
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("people");
  const wideEnough = useSyncExternalStore(subscribeToNothing, readWideEnough, () => true);

  const toggleSidebar = useCallback(() => setSidebarOpen((open) => !open), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const showPeople = useCallback(() => {
    setSidebarTab("people");
    setSidebarOpen(true);
  }, []);

  // Only while it is a drawer over the office. Where it is a column beside
  // the office it covers nothing, and back should still mean back.
  useBackToClose(sidebarOpen && !wideEnough, closeSidebar);

  return (
    <ErrorBoundary>
      <StudioProvider>
        {/* The office on the left, who is in it on the right */}
        <main className="app-shell">
          <div className="app-stage">
            <GameErrorBoundary>
              <PhaserGame />
            </GameErrorBoundary>

            {/* HUD overlay — floating UI over the office only */}
            <div className="app-hud">
              <GameHud
                sidebarOpen={sidebarOpen}
                onToggleSidebar={toggleSidebar}
                onShowPeople={showPeople}
              />
            </div>
          </div>

          <Sidebar
            open={sidebarOpen}
            tab={sidebarTab}
            onTabChange={setSidebarTab}
            width={width ?? storedWidth}
            onWidthChange={setWidth}
            onClose={closeSidebar}
          />
        </main>
      </StudioProvider>
    </ErrorBoundary>
  );
}
