"use client";

import { gameEvents } from "@/lib/events";
import "./hud.css";

import { useEffect, useRef, useState } from "react";
import { useStudio } from "@/lib/store";
import type { HudPanelId } from "./HudDock";
import TopBar from "./TopBar";
import BottomBar from "./BottomBar";
import SeatManagerModal from "./SeatManagerModal";
import Welcome from "./Welcome";
import AlreadyOnline from "./AlreadyOnline";
import Arrival from "./Arrival";
import GamepadDriver from "./GamepadDriver";
import { profileSnapshot, subscribeToProfile } from "@/lib/profile";
import { registerProfile } from "@/lib/people-client";
import { pushProfileToAccount } from "@/lib/account-client";
import ElevatorModal from "./ElevatorModal";
import BadgeToast from "./BadgeToast";
import Whiteboard from "./Whiteboard";
import Pinball from "./Pinball";
import ProjectBoard from "./ProjectBoard";
import ProjectFlow from "./ProjectFlow";
import HelpDesk from "./HelpDesk";
import DocChat from "./DocChat";
import SupportPulse from "./SupportPulse";
import Boardroom from "./Boardroom";
import Arcade from "./Arcade";
import PingPong from "./PingPong";
import TouchControls from "./TouchControls";

interface GameHudProps {
  /** Whether the column is up on People, so the pill can say so. */
  peopleOpen: boolean;
  /** Open the column on People — what the Online pill counts — or shut it. */
  onTogglePeople: () => void;
  /**
   * Put the music up, and the column with it — the slider lives at the foot
   * of that column now, so a controller turning to it has to open the thing
   * it is in. `onCloseMusic` is the other half: turning away, and View.
   */
  onShowMusic: () => void;
  onCloseMusic: () => void;
}

export default function GameHud({
  peopleOpen,
  onTogglePeople,
  onShowMusic,
  onCloseMusic,
}: GameHudProps) {
  const { state } = useStudio();
  const [seatManagerOpen, setSeatManagerOpen] = useState(false);

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

  return (
    <div className="hud-overlay">
      <GamepadDriver />
      <Welcome />
      <Arrival />
      <AlreadyOnline />
      <ElevatorModal />
      <BadgeToast />
      <Whiteboard />
      <Pinball />
      <ProjectBoard />
      <ProjectFlow />
      <HelpDesk />
      <DocChat />
      <SupportPulse />
      <Boardroom />
      <Arcade />
      <PingPong />
      <TouchControls />
      {/*
        Top area: the agent pills, and the account.

        The Character button was in that corner too, and it is at the foot of
        the column now with the music and the door — the three things in this
        app that are the app rather than the world, none of them worth a
        button standing over the office for a whole session.
      */}
      <TopBar seats={state.seats} />

      {/*
        Bottom area: the status pills.

        There was a People button in the other corner that opened the column,
        and it was a second door onto one room — the Online pill already
        counts exactly that list and opens it on exactly that tab. Of the two
        the one to keep is the one that says something while it sits there.
      */}
      <div className="layout-bottom">
        <BottomBar peopleOpen={peopleOpen} onTogglePeople={onTogglePeople} />
      </div>

      {/* Modals */}
      <SeatManagerModal
        open={seatManagerOpen}
        onClose={() => setSeatManagerOpen(false)}
        seats={state.seats}
      />
    </div>
  );
}
