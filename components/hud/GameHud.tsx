"use client";

import { Users } from "lucide-react";
import { gameEvents } from "@/lib/events";
import "./hud.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useStudio } from "@/lib/store";
import { useBgm } from "@/lib/useBgm";
import type { HudDockItem, HudPanelId } from "./HudDock";
import TopBar from "./TopBar";
import BottomBar from "./BottomBar";
import SeatManagerModal from "./SeatManagerModal";
import CharacterStudio from "./CharacterStudio";
import MusicControls from "./MusicControls";
import Welcome from "./Welcome";
import AlreadyOnline from "./AlreadyOnline";
import GamepadDriver from "./GamepadDriver";
import { profileSnapshot, subscribeToProfile } from "@/lib/profile";
import { registerProfile } from "@/lib/people-client";
import { pushProfileToAccount, useMe } from "@/lib/account-client";
import ElevatorModal from "./ElevatorModal";
import AchievementToast from "./AchievementToast";
import Whiteboard from "./Whiteboard";
import Pinball from "./Pinball";
import ProjectBoard from "./ProjectBoard";
import ProjectFlow from "./ProjectFlow";
import HelpDesk from "./HelpDesk";
import SupportPulse from "./SupportPulse";
import Boardroom from "./Boardroom";
import Arcade from "./Arcade";
import PingPong from "./PingPong";
import TouchControls from "./TouchControls";
import { asset } from "@/lib/assets";

interface GameHudProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  /** Open the column on People — what the Online pill counts. */
  onShowPeople: () => void;
}

export default function GameHud({ sidebarOpen, onToggleSidebar, onShowPeople }: GameHudProps) {
  const { state } = useStudio();
  const bgm = useBgm();
  // Somebody whose own code names their sheet wears that and nothing else,
  // so there is no character to choose and no button to choose it with.
  // Assumed locked until the answer comes: a picker that is briefly there
  // and then gone is worse than one that arrives a moment late.
  const me = useMe();
  const ownLookOnly = !me || !!me.access?.persona?.characterKey;
  const [openPanel, setOpenPanel] = useState<HudPanelId | null>(null);
  const [seatManagerOpen, setSeatManagerOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);

  // Keep the building's register current: name or home may have changed.
  // And a change made here — a new character, say — follows someone
  // signed in to their account.
  useEffect(() => {
    void registerProfile(profileSnapshot());
    return subscribeToProfile(() => {
      void registerProfile(profileSnapshot());
      void pushProfileToAccount(profileSnapshot());
    });
  }, []);

  // Gamepad shoulder buttons cycle the HUD panels; Back closes whatever is open
  useEffect(() => {
    const order: HudPanelId[] = ["music", "workers"];

    const unsubCycle = gameEvents.on("hud-cycle-panel", (direction) => {
      setSeatManagerOpen(false);
      setOpenPanel((prev) => {
        const current = prev ? order.indexOf(prev) : -1;
        const next = (current + direction + order.length) % order.length;
        const id = order[next];
        if (id === "workers") {
          setSeatManagerOpen(true);
          return null;
        }
        return id;
      });
    });

    const unsubClose = gameEvents.on("hud-close-panel", () => {
      setOpenPanel(null);
      setSeatManagerOpen(false);
    });

    return () => {
      unsubCycle();
      unsubClose();
    };
  }, []);

  // Top-right toolbar items
  const toolItems: HudDockItem[] = useMemo(
    () =>
      [
        {
          id: "music" as const,
          label: "Music",
          icon: asset("/ui/icons/icon-music.png"),
          iconActive: asset("/ui/icons/icon-music-active.png"),
        },
        // Who you are in the world: opens the character studio.
        {
          id: "workers" as const,
          label: "Character",
          icon: asset("/ui/icons/icon-workers.png"),
          iconActive: asset("/ui/icons/icon-workers-active.png"),
        },
      ].filter((item) => item.id !== "workers" || !ownLookOnly),
    [ownLookOnly],
  );

  const togglePanel = useCallback(
    (id: HudPanelId) => {
      if (id === "workers") {
        if (!ownLookOnly) setStudioOpen((prev) => !prev);
        return;
      }
      setOpenPanel((current) => (current === id ? null : id));
    },
    [ownLookOnly],
  );

  const musicIconOverrides = useMemo(
    () =>
      bgm.volume <= 0 ? { music: asset("/ui/icons/icon-music-muted.png") as string } : undefined,
    [bgm.volume],
  );

  const topRightPanelOpen = openPanel !== null;

  return (
    <div className="hud-overlay">
      <GamepadDriver />
      <Welcome />
      <AlreadyOnline />
      <ElevatorModal />
      <AchievementToast />
      <Whiteboard />
      <Pinball />
      <ProjectBoard />
      <ProjectFlow />
      <HelpDesk />
      <SupportPulse />
      <Boardroom />
      <Arcade />
      <PingPong />
      <TouchControls />
      {/* Top area: logo | agent pills | tool buttons */}
      <TopBar
        seats={state.seats}
        toolItems={toolItems}
        openPanel={openPanel}
        onToggle={togglePanel}
        iconOverrides={musicIconOverrides}
      />

      {/* Top-right flyout panels */}
      {topRightPanelOpen && (
        <div className="hud-topright-flyout">
          {openPanel === "music" ? <MusicControls bgm={bgm} /> : null}
        </div>
      )}

      {/* Bottom area: status pills (left) + the column's own button (right) */}
      <div className="layout-bottom">
        <BottomBar onShowPeople={onShowPeople} />

        {/* Spacer pushes the column's button to the right */}
        <div style={{ flex: "1 1 auto" }} />

        {/*
          The column beside the office — People, and the badges people have
          earned. This hides it and shows it again on whichever tab it was
          last left on; the Online pill opens it on People.
        */}
        <div className="hud-side-dock">
          <button
            type="button"
            className={`hud-side-dock__btn ${sidebarOpen ? "hud-side-dock__btn--active" : ""}`}
            onClick={onToggleSidebar}
            title={sidebarOpen ? "Hide the panel" : "Show who is here"}
          >
            <Users size={20} />
            <span className="hud-side-dock__label">People</span>
          </button>
        </div>
      </div>

      {/* Modals */}
      <SeatManagerModal
        open={seatManagerOpen}
        onClose={() => setSeatManagerOpen(false)}
        seats={state.seats}
      />

      <CharacterStudio open={studioOpen} onClose={() => setStudioOpen(false)} />
    </div>
  );
}
