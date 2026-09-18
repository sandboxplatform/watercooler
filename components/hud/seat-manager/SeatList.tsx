"use client";

import type { SeatState } from "@/types/game";
import CharacterPortrait from "../CharacterPortrait";

function seatStateLabel(seat: SeatState) {
  return seat.assigned ? "at desk" : "vacant";
}

function seatSummary(seat: SeatState) {
  if (!seat.assigned) return "No crew assigned";
  return seat.roleTitle ?? "Waiting at desk";
}

interface SeatListProps {
  seats: SeatState[];
  selectedSeatId: string;
  onSelectSeat: (seat: SeatState) => void;
}

export default function SeatList({ seats, selectedSeatId, onSelectSeat }: SeatListProps) {
  return (
    <div
      style={{
        minHeight: 0,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        paddingRight: 4,
      }}
    >
      {seats.map((seat, index) => {
        const active = seat.seatId === selectedSeatId;
        const statusLabel = seatStateLabel(seat);
        return (
          <button
            key={seat.seatId}
            type="button"
            className={`seat-card ${active ? "seat-card--active" : ""}`}
            onClick={() => onSelectSeat(seat)}
          >
            <div className="seat-card__info">
              <div className={`seat-manager__portrait-frame seat-manager__portrait-frame--small`}>
                {seat.assigned && seat.spritePath ? (
                  <CharacterPortrait spritePath={seat.spritePath} name={seat.label} />
                ) : (
                  <span style={{ fontSize: 8, color: "var(--pixel-muted)" }}>EMPTY</span>
                )}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 8,
                    color: "var(--pixel-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span style={{ color: "var(--pixel-muted)" }}>●</span>
                  Seat {index + 1}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    marginTop: 4,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {seat.assigned ? seat.label : "Vacant Seat"}
                </div>
                <div style={{ fontSize: 8, color: "var(--pixel-muted)", marginTop: 4 }}>
                  {seat.assigned ? (seat.roleTitle ?? "Worker") : "Unassigned"}
                </div>
              </div>
              <div
                className="seat-card__status"
                style={{
                  color: statusLabel === "vacant" ? "var(--pixel-muted)" : "var(--pixel-text)",
                }}
              >
                {statusLabel}
              </div>
            </div>
            <div className="seat-card__summary">{seatSummary(seat)}</div>
          </button>
        );
      })}
    </div>
  );
}
