"use client";

import "./seat-manager.css";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useStudio } from "@/lib/store";
import { WORKER_SPRITES } from "@/components/game/config/animations";
import type { SeatState } from "@/types/game";
import SeatList from "./seat-manager/SeatList";
import SeatDetailPanel from "./seat-manager/SeatDetailPanel";

export default function SeatManagerModal({
  open,
  onClose,
  seats,
}: {
  open: boolean;
  onClose: () => void;
  seats: SeatState[];
}) {
  const { updateSeatConfig } = useStudio();
  const [selectedSeatId, setSelectedSeatId] = useState<string>("");
  const [draftSeatId, setDraftSeatId] = useState<string>("");
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [spriteKey, setSpriteKey] = useState("");
  const [spritePath, setSpritePath] = useState("");

  // Falls back to the first seat until (or unless) one is explicitly picked,
  // so no effect is needed to seed selectedSeatId once seats load.
  const selectedSeat = useMemo(
    () => seats.find((seat) => seat.seatId === selectedSeatId) ?? seats[0],
    [seats, selectedSeatId],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !selectedSeat) return null;

  const usingDraft = draftSeatId === selectedSeat.seatId;
  const effectiveName = usingDraft ? name : selectedSeat.assigned ? selectedSeat.label : "";
  const effectiveRoleTitle = usingDraft ? roleTitle : (selectedSeat.roleTitle ?? "");
  const effectiveSpriteKey = usingDraft
    ? spriteKey
    : (selectedSeat.spriteKey ?? WORKER_SPRITES[0]?.key ?? "");
  const effectiveSpritePath = usingDraft
    ? spritePath
    : (selectedSeat.spritePath ?? WORKER_SPRITES[0]?.path ?? "");

  const assignedCount = seats.filter((seat) => seat.assigned).length;
  const busy = selectedSeat.status === "running" || selectedSeat.status === "returning";

  const canSave = Boolean(
    effectiveName.trim() &&
    effectiveRoleTitle.trim() &&
    effectiveSpriteKey &&
    effectiveSpritePath &&
    !busy,
  );

  const beginDraftForSeat = (seat: SeatState) => {
    setDraftSeatId(seat.seatId);
    setName(seat.assigned ? seat.label : "");
    setRoleTitle(seat.roleTitle ?? "");
    setSpriteKey(seat.spriteKey ?? WORKER_SPRITES[0]?.key ?? "");
    setSpritePath(seat.spritePath ?? WORKER_SPRITES[0]?.path ?? "");
  };

  const handleSelectSeat = (seat: SeatState) => {
    setSelectedSeatId(seat.seatId);
    beginDraftForSeat(seat);
  };

  const handleSave = () => {
    if (!canSave) return;
    updateSeatConfig(selectedSeat.seatId, {
      assigned: true,
      label: effectiveName.trim(),
      roleTitle: effectiveRoleTitle.trim(),
      spriteKey: effectiveSpriteKey,
      spritePath: effectiveSpritePath,
    });
  };

  const handleUnassign = () => {
    if (busy) return;
    updateSeatConfig(selectedSeat.seatId, {
      assigned: false,
      roleTitle: undefined,
      spriteKey: undefined,
      spritePath: undefined,
    });
  };

  const handleNameChange = (value: string) => {
    if (!usingDraft) beginDraftForSeat(selectedSeat);
    setName(value);
  };

  const handleRoleTitleChange = (value: string) => {
    if (!usingDraft) beginDraftForSeat(selectedSeat);
    setRoleTitle(value);
  };

  const handleSpriteSelect = (key: string, path: string, label: string) => {
    if (!usingDraft) beginDraftForSeat(selectedSeat);
    setSpriteKey(key);
    setSpritePath(path);
    if (!effectiveName.trim()) setName(label);
  };

  // Rendered into the body: the HUD layer is a stacking context capped at
  // z-index 20, so in place this modal sits under the chat column at 30.
  return createPortal(
    <div
      className="seat-manager-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Seat Manager"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="seat-manager pixel-panel">
        {/* Header */}
        <div className="seat-manager__header">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
            <div>
              <div style={{ fontSize: 14, color: "var(--pixel-text)" }}>Team Management</div>
              <div style={{ fontSize: 8, color: "var(--pixel-muted)", marginTop: 4 }}>
                {seats.length} seats · {assignedCount} assigned · {seats.length - assignedCount}{" "}
                empty
              </div>
            </div>
          </div>
          <button
            type="button"
            className="pixel-icon-btn"
            style={{ width: 38, height: 38, minWidth: 38, minHeight: 38 }}
            onClick={onClose}
            title="Close"
            aria-label="Close seat manager"
          >
            <X size={16} />
          </button>
        </div>

        <SeatList
          seats={seats}
          selectedSeatId={selectedSeat.seatId}
          onSelectSeat={handleSelectSeat}
        />

        <SeatDetailPanel
          selectedSeat={selectedSeat}
          effectiveName={effectiveName}
          effectiveRoleTitle={effectiveRoleTitle}
          effectiveSpriteKey={effectiveSpriteKey}
          effectiveSpritePath={effectiveSpritePath}
          busy={busy}
          canSave={canSave}
          onNameChange={handleNameChange}
          onRoleTitleChange={handleRoleTitleChange}
          onSpriteSelect={handleSpriteSelect}
          onSave={handleSave}
          onUnassign={handleUnassign}
          onClose={onClose}
        />
      </div>
    </div>,
    document.body,
  );
}
