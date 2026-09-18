"use client";

import Image from "next/image";
import type { SeatState } from "@/types/game";
import type { HudPanelId, HudDockItem } from "./HudDock";
import CharacterPortrait from "./CharacterPortrait";
import AccountButton from "./AccountButton";

interface TopBarProps {
  seats: SeatState[];
  toolItems: HudDockItem[];
  openPanel: HudPanelId | null;
  onToggle: (id: HudPanelId) => void;
  iconOverrides?: Partial<Record<HudPanelId, string>>;
  onSeatClick?: (seatId: string) => void;
}

/**
 * The strip along the top: who is working, and the tools.
 *
 * The left corner used to carry the game's name and the building and floor
 * you were standing in. Both are gone. An Operations floor puts its rooms
 * hard against the top of the map, so a panel pinned over that corner sits
 * on top of the thing you walked up there to read — and the floor already
 * says where you are, on a sign on its own wall, which is where a room in
 * this game is supposed to tell you anything.
 */
export default function TopBar({
  seats,
  toolItems,
  openPanel,
  onToggle,
  iconOverrides,
  onSeatClick,
}: TopBarProps) {
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

      {/* Right: tool buttons group */}
      <div className="layout-topbar__tools">
        {toolItems.map((item) => {
          const active = openPanel === item.id;
          const override = iconOverrides?.[item.id];
          const src = override ?? (active ? item.iconActive : item.icon);
          return (
            <button
              key={item.id}
              type="button"
              data-dock-id={item.id}
              onClick={() => onToggle(item.id)}
              title={item.label}
              className={`topbar-tool-btn ${active ? "topbar-tool-btn--active" : ""}`}
            >
              <Image
                src={src}
                alt={item.label}
                width={24}
                height={24}
                style={{ imageRendering: "pixelated", display: "block" }}
                unoptimized
              />
            </button>
          );
        })}
        {/*
          The door was last in this row and is now at the foot of the column,
          with the music: two buttons nobody presses twice in a session, kept
          off the corner of the office for the whole of it.
        */}
        <AccountButton />
      </div>
    </div>
  );
}
