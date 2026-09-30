"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

/**
 * The frame of a window over the whole app: a scrim that closes it, like
 * every other window over the office, a panel, and the X in its corner.
 *
 * Two shapes, which are two sets of rules in hud.css — `profile`, and the
 * `entry-card` the egg and the badge share — and the same frame round both.
 */
export default function CardWindow({
  kind,
  label,
  onClose,
  children,
}: {
  kind: "profile" | "entry-card";
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = kind === "profile" ? "profile__card" : "entry-card__panel";
  return (
    <div className={kind} role="dialog" aria-label={label}>
      <div className={`${kind}__scrim`} onClick={onClose} />
      <div className={`pixel-panel ${panel}`}>
        <button type="button" className="profile__close" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
        {children}
      </div>
    </div>
  );
}
