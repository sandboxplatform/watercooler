"use client";

import MicButton from "../MicButton";
import type { SeatState } from "@/types/game";
import CharacterPortrait from "../CharacterPortrait";
import SpritePreview from "./SpritePreview";

const ROLE_PRESETS = [
  "Frontend Engineer",
  "Backend Engineer",
  "AI Agent",
  "Product Manager",
  "Designer",
  "QA",
  "Researcher",
];

function seatStateLabel(seat: SeatState) {
  if (!seat.assigned) return "vacant";
  if (seat.status === "empty") return "idle";
  return seat.status;
}

export interface SeatDetailPanelProps {
  selectedSeat: SeatState;
  effectiveName: string;
  effectiveRoleTitle: string;
  effectiveSpriteKey: string;
  effectiveSpritePath: string;
  busy: boolean;
  canSave: boolean;
  onNameChange: (value: string) => void;
  onRoleTitleChange: (value: string) => void;
  onSpriteSelect: (spriteKey: string, spritePath: string, spriteLabel: string) => void;
  onSave: () => void;
  onUnassign: () => void;
  onClose: () => void;
}

export default function SeatDetailPanel({
  selectedSeat,
  effectiveName,
  effectiveRoleTitle,
  effectiveSpriteKey,
  effectiveSpritePath,
  busy,
  canSave,
  onNameChange,
  onRoleTitleChange,
  onSpriteSelect,
  onSave,
  onUnassign,
  onClose,
}: SeatDetailPanelProps) {
  return (
    <div
      style={{
        minWidth: 0,
        minHeight: 0,
        display: "grid",
        gridTemplateRows: "auto auto 1fr auto",
        gap: 12,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12 }}>
        <div className="seat-manager__portrait-frame seat-manager__portrait-frame--large">
          {effectiveSpritePath ? (
            <CharacterPortrait
              spritePath={effectiveSpritePath}
              name={effectiveName || "Crew preview"}
              large
            />
          ) : (
            <div style={{ fontSize: 8, color: "var(--pixel-muted)" }}>No character assigned</div>
          )}
        </div>

        <div className="hud-panel__stack" style={{ gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 12 }}>
                {selectedSeat.assigned ? effectiveName || selectedSeat.label : "Vacant Seat"}
              </div>
              <div style={{ fontSize: 8, color: "var(--pixel-muted)", marginTop: 4 }}>
                {selectedSeat.seatId} · facing {selectedSeat.spawnFacing ?? "down"}
              </div>
            </div>
            <div
              style={{
                fontSize: 7,
                padding: "4px 8px",
                background: "rgba(255,255,255,0.06)",
                color: selectedSeat.assigned ? "var(--pixel-text)" : "var(--pixel-muted)",
              }}
            >
              {seatStateLabel(selectedSeat)}
            </div>
          </div>

          <div>
            <label className="hud-panel__label">Name</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                className="pixel-input hud-panel__input"
                value={effectiveName}
                onChange={(event) => onNameChange(event.target.value)}
                disabled={busy}
                placeholder="Crew name"
                style={{ minHeight: 0, flex: 1 }}
              />
              <MicButton
                onTranscript={(text) => onNameChange(text)}
                disabled={busy}
                size={28}
                what="name"
              />
            </div>
          </div>
          <div>
            <label className="hud-panel__label">Role / Title</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                className="pixel-input hud-panel__input"
                value={effectiveRoleTitle}
                onChange={(event) => onRoleTitleChange(event.target.value)}
                disabled={busy}
                placeholder="Role title"
                style={{ minHeight: 0, flex: 1 }}
              />
              <MicButton
                onTranscript={(text) => onRoleTitleChange(text)}
                disabled={busy}
                size={28}
                what="role"
              />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {ROLE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="pixel-button"
                  style={{ fontSize: 7, padding: "4px 6px" }}
                  disabled={busy}
                  onClick={() => onRoleTitleChange(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="seat-hint">
        {busy
          ? "This seat is currently active. Finish or stop the task before changing crew assignment."
          : "Select a portrait, set name and role, then save. Workers execute tasks from the main agent."}
      </div>

      <SpritePreview
        selectedSpriteKey={effectiveSpriteKey}
        busy={busy}
        onSelectSprite={onSpriteSelect}
      />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <button
          type="button"
          className="pixel-button"
          onClick={onUnassign}
          disabled={!selectedSeat.assigned || busy}
        >
          Unassign
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="pixel-button" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="pixel-button pixel-button--primary"
            onClick={onSave}
            disabled={!canSave}
          >
            {selectedSeat.assigned ? "Save Changes" : "Assign Character"}
          </button>
        </div>
      </div>
    </div>
  );
}
