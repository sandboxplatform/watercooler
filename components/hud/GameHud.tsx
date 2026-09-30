"use client";

import { gameEvents } from "@/lib/events";
import "./hud.css";

import { memo, useEffect } from "react";
import TopBar from "./TopBar";
import BottomBar from "./BottomBar";
import Welcome from "./Welcome";
import AlreadyOnline from "./AlreadyOnline";
import Arrival from "./Arrival";
import GamepadDriver from "./GamepadDriver";
import { profileSnapshot, subscribeToProfile } from "@/lib/profile";
import { pushProfileToAccount } from "@/lib/account-client";
import { useBgmPlayback } from "@/lib/useBgm";
import ElevatorModal from "./ElevatorModal";
import BadgeToast from "./BadgeToast";
// Four of these are shells whose games load on first use — see `lazy-panel`.
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

/**
 * Everything over the office.
 *
 * Memoised, and the page hands it only stable callbacks, because the page
 * re-renders on every pointermove of a drag on the column's edge — and this
 * is most of the HUD, none of which has anything to do with how wide the
 * column is.
 */
function GameHud({ peopleOpen, onTogglePeople, onShowMusic, onCloseMusic }: GameHudProps) {
  // A change made here — a new character, say — follows someone signed in
  // to their account.
  useEffect(() => subscribeToProfile(() => void pushProfileToAccount(profileSnapshot())), []);

  // The music is started here rather than beside its slider, because the
  // slider is in the column and the column is not always mounted.
  useBgmPlayback();

  // A shoulder button turns to the music, which is the one panel left to
  // turn to; Back puts it away.
  useEffect(() => {
    const unsubCycle = gameEvents.on("hud-cycle-panel", () => onShowMusic());
    const unsubClose = gameEvents.on("hud-close-panel", () => onCloseMusic());
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
        Top area: the account.

        The Character button was in that corner too, and it is at the foot of
        the column now with the music and the door — the three things in this
        app that are the app rather than the world, none of them worth a
        button standing over the office for a whole session.
      */}
      <TopBar />

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
    </div>
  );
}

export default memo(GameHud);
