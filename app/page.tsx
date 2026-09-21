"use client";

import dynamic from "next/dynamic";
import { useCallback, useState, useSyncExternalStore } from "react";
import { StudioProvider } from "@/lib/store";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GameErrorBoundary } from "@/components/game/GameErrorBoundary";
import GameHud from "@/components/hud/GameHud";
import Sidebar, { type SidebarTab } from "@/components/hud/Sidebar";
import Profile from "@/components/hud/Profile";
import EggCard from "@/components/hud/EggCard";
import BadgeCard from "@/components/hud/BadgeCard";
import CharacterStudio from "@/components/hud/CharacterStudio";
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
  /**
   * Whether the volume slider at the foot of the column is up.
   *
   * It is the page's rather than the column's because two things reach it
   * from opposite sides: the button in the footer, and a controller's
   * shoulder buttons, which the HUD over the office is the one listening
   * for. Neither is the other's parent, so it sits above them both.
   */
  const [musicOpen, setMusicOpen] = useState(false);
  /**
   * Whether the character picker is up.
   *
   * Its button is at the foot of the column with the music and the door, and
   * the window itself is over the whole app — so, like the profile, it is
   * neither the column's nor the HUD's and sits above them both.
   */
  const [characterOpen, setCharacterOpen] = useState(false);
  const wideEnough = useSyncExternalStore(subscribeToNothing, readWideEnough, () => true);

  // Closing the column takes the slider with it: it lives in there.
  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    setMusicOpen(false);
  }, []);
  /**
   * The Online pill is a door that shuts as well as opens: pressing it while
   * People is up puts the column away again. The button at the head of the
   * column was the only way back, which is the opposite corner of the screen
   * from the one just pressed.
   *
   * Showing another tab counts as closed — the pill counts People, so it has
   * to land there rather than shut a column somebody is reading Badges in.
   */
  const togglePeople = useCallback(() => {
    if (sidebarOpen && sidebarTab === "people") {
      closeSidebar();
      return;
    }
    setSidebarTab("people");
    setSidebarOpen(true);
  }, [sidebarOpen, sidebarTab, closeSidebar]);
  const toggleMusic = useCallback(() => setMusicOpen((open) => !open), []);
  const toggleCharacter = useCallback(() => setCharacterOpen((open) => !open), []);
  const closeCharacter = useCallback(() => setCharacterOpen(false), []);
  // The controller's half: it has to open the column too, or it would turn
  // to a panel that is not on screen.
  const showMusic = useCallback(() => {
    setSidebarOpen(true);
    setMusicOpen(true);
  }, []);
  const closeMusic = useCallback(() => setMusicOpen(false), []);

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
                peopleOpen={sidebarOpen && sidebarTab === "people"}
                onTogglePeople={togglePeople}
                onShowMusic={showMusic}
                onCloseMusic={closeMusic}
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
            musicOpen={musicOpen}
            onToggleMusic={toggleMusic}
            characterOpen={characterOpen}
            onToggleCharacter={toggleCharacter}
          />

          {/*
            A profile is over the *whole* app, column included, which is why
            it is here and not in the HUD with the other windows.

            Everything in `GameHud` is over the office and nothing else —
            `.app-hud` sits at z-index 20 and the column at 30, so a window
            mounted in there is behind the column whatever z-index it asks
            for. Right for the lift and the whiteboard, which are about the
            room you are standing in; wrong for this, which is opened *from*
            the column and leads with a picture too big to read behind one.
          */}
          <Profile />

          {/*
            And one kind of egg, big enough to be worth collecting. Opened
            from the Eggs panel in the column, so it belongs here with the
            profile rather than in the HUD behind it — and it opens profiles
            of its own, off the same bus.
          */}
          <EggCard />

          {/*
            And one badge: what it is, the line saying how to get it, and
            who has it. Here for the reason the two above are, with one
            caller neither of them has — the toast over the office, which
            is the only thing that ever told anybody a badge existed and
            took six seconds about it.
          */}
          <BadgeCard />

          {/*
            The character picker, for the same reason and opened from the same
            place: its button is at the foot of the column, so the window is
            the page's rather than the HUD's.
          */}
          <CharacterStudio open={characterOpen} onClose={closeCharacter} />
        </main>
      </StudioProvider>
    </ErrorBoundary>
  );
}
