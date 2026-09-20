"use client";

import type { SeatState } from "@/types/game";
import CharacterPortrait from "./CharacterPortrait";
import AccountButton from "./AccountButton";

interface TopBarProps {
  seats: SeatState[];
  onSeatClick?: (seatId: string) => void;
}

/**
 * The strip along the top: who is working, and the account.
 *
 * The left corner used to carry the game's name and the building and floor
 * you were standing in. Both are gone. An Operations floor puts its rooms
 * hard against the top of the map, so a panel pinned over that corner sits
 * on top of the thing you walked up there to read — and the floor already
 * says where you are, on a sign on its own wall, which is where a room in
 * this game is supposed to tell you anything.
 */
export default function TopBar({ seats, onSeatClick }: TopBarProps) {
  const assignedSeats = seats.filter((s) => s.assigned);

  return (
    <div className="layout-top">
      {/* Center: agent pills (each pill is its own floating element) */}
      <div className="layout-topbar__agents">
        {assignedSeats.map((seat) => (
          <button
            key={seat.seatId}
            type="button"
            className="topbar-agent-pill"
            onClick={() => onSeatClick?.(seat.seatId)}
            title={seat.roleTitle ? `${seat.label} — ${seat.roleTitle}` : seat.label}
          >
            <div className="topbar-agent-pill__avatar">
              <CharacterPortrait spritePath={seat.spritePath} name={seat.label} />
            </div>
            <span className="topbar-agent-pill__name">{seat.label}</span>
            <span className={`pixel-dot pixel-dot--${seat.assigned ? "green" : "gray"}`} />
          </button>
        ))}
      </div>

      {/* Right: the account, and nothing else */}
      <div className="layout-topbar__tools">
        {/*
          The door, the music and the Character button were all in this row,
          and all three are at the foot of the column now: buttons nobody
          presses twice in a session, kept off the corner of the office for
          the whole of it.
        */}
        <AccountButton />
      </div>
    </div>
  );
}
