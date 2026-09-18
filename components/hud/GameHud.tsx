"use client";

import { gameEvents } from "@/lib/events";
import "./hud.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStudio } from "@/lib/store";
import type { HudDockItem, HudPanelId } from "./HudDock";
import TopBar from "./TopBar";
import BottomBar from "./BottomBar";
import SeatManagerModal from "./SeatManagerModal";
import CharacterStudio from "./CharacterStudio";
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
  /** Open the column on People — what the Online pill counts. */
  onShowPeople: () => void;
  /**
   * Put the music up, and the column with it — the slider lives at the foot
   * of that column now, so a controller turning to it has to open the thing
   * it is in. `onCloseMusic` is the other half: turning away, and View.
   */
  onShowMusic: () => void;
  onCloseMusic: () => void;
}

export default function GameHud({ onShowPeople, onShowMusic, onCloseMusic }: GameHudProps) {
  const { state } = useStudio();
  // Somebody whose own code names their sheet wears that and nothing else,
  // so there is no character to choose and no button to choose it with.
  // Assumed locked until the answer comes: a picker that is briefly there
  // and then gone is worse than one that arrives a moment late.
  const me = useMe();
  const ownLookOnly = !me || !!me.access?.persona?.characterKey;
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

  /**
   * Where the shoulder buttons have turned to.
   *
   * A ref rather than state, because nothing here draws it any more: both
   * panels it turns between are owned elsewhere now — the music at the foot
   * of the column, the seats in a modal — so a cursor kept in state would
   * be a render for nothing.
   */
  const padTurn = useRef(-1);

  // Gamepad shoulder buttons cycle the HUD panels; Back closes whatever is open
  useEffect(() => {
    const order: HudPanelId[] = ["music", "workers"];

    const unsubCycle = gameEvents.on("hud-cycle-panel", (direction) => {
      padTurn.current = (padTurn.current + direction + order.length) % order.length;
      const id = order[padTurn.current];
      setSeatManagerOpen(id === "workers");
      if (id === "music") onShowMusic();
      else onCloseMusic();
    });

    const unsubClose = gameEvents.on("hud-close-panel", () => {
      padTurn.current = -1;
      setSeatManagerOpen(false);
      onCloseMusic();
    });

    return () => {
      unsubCycle();
      unsubClose();
    };
  }, [onShowMusic, onCloseMusic]);

  /**
   * Top-right toolbar items: who you are in the world, and nothing else.
   *
   * The music was here, beside the door, and both are now at the foot of the
   * column — so neither of them stands over the corner of the office for a
   * whole session to be pressed once.
   */
  const toolItems: HudDockItem[] = useMemo(
    () =>
      ownLookOnly
        ? []
        : [
            {
              id: "workers" as const,
              label: "Character",
              icon: asset("/ui/icons/icon-workers.png"),
              iconActive: asset("/ui/icons/icon-workers-active.png"),
            },
          ],
    [ownLookOnly],
  );

  const togglePanel = useCallback(() => {
    if (!ownLookOnly) setStudioOpen((prev) => !prev);
  }, [ownLookOnly]);

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
        openPanel={studioOpen ? "workers" : null}
        onToggle={togglePanel}
      />

      {/*
        Bottom area: the status pills.

        There was a People button in the other corner that opened the column,
        and it was a second door onto one room — the Online pill already
        counts exactly that list and opens it on exactly that tab. Of the two
        the one to keep is the one that says something while it sits there.
      */}
      <div className="layout-bottom">
        <BottomBar onShowPeople={onShowPeople} />
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
