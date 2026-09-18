"use client";

import type { ChatMessage } from "@/types/game";
import { speakerLabel } from "@/lib/chat-speaker";
import { getSelfId } from "@/lib/presence-self";
import { loadPlayerName } from "@/lib/persistence";

export default function MessageBubble({ msg }: { msg: ChatMessage }) {
  const mine = speakerLabel(msg, { id: getSelfId(), name: loadPlayerName() }) === "You";

  return (
    <div className={`hud-chat__bubble hud-chat__bubble--${mine ? "user" : "player"}`}>
      <div className="hud-chat__header">
        <div className="hud-chat__role">
          {speakerLabel(msg, { id: getSelfId(), name: loadPlayerName() })}
        </div>
      </div>
      <div className="hud-chat__content" data-message-id={msg.id}>
        {msg.content}
      </div>
    </div>
  );
}
