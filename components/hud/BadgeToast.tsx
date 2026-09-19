"use client";

import { useEffect, useState } from "react";
import { gameEvents } from "@/lib/events";
import { badgeFor } from "@/lib/badges";
import { currentRoom } from "@/lib/room-client";
import { castMember } from "@/lib/world/cast";

interface Toast {
  id: number;
  icon: string;
  title: string;
  who: string;
  description: string;
}

const VISIBLE_MS = 6000;

/**
 * Announces a badge.
 *
 * Deliberately not a modal: the world keeps running underneath, and
 * somebody else earning something should never take the keys off you.
 *
 * **It is narrower than the message that feeds it.** A badge is broadcast
 * to everybody, because the panel that lists them lists the world and a
 * list that only updates for whoever happened to be in the room is a list
 * that is wrong everywhere else. Being *interrupted* about one is a
 * different question, and the answer is the room it happened in — the
 * people who watched them do it — and nobody else. Your own always shows,
 * because the room on the message is the room you were standing in; and it
 * has to, because the toast is the only thing that tells you. The bubble
 * the server puts over your head is drawn on every screen but your own.
 */
export default function BadgeToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let nextId = 0;
    return gameEvents.on("badge-earned", (earned) => {
      const badge = badgeFor(earned.code);
      if (!badge) return;
      if (earned.room !== currentRoom()) return;
      const toast: Toast = {
        id: nextId++,
        icon: badge.icon,
        title: badge.title,
        who: castMember(earned.person)?.name ?? earned.name,
        description: badge.description,
      };
      setToasts((current) => [...current, toast]);
      setTimeout(() => {
        setToasts((current) => current.filter((t) => t.id !== toast.id));
      }, VISIBLE_MS);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="badge-toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="pixel-panel badge-toast">
          <span className="badge-toast__icon">{toast.icon}</span>
          <span className="badge-toast__words">
            <span className="badge-toast__title">
              {toast.who} — {toast.title}
            </span>
            <span className="badge-toast__detail">{toast.description}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
