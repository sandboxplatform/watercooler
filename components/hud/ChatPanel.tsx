"use client";

import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SendHorizontal } from "lucide-react";
import { useStudio } from "@/lib/store";
import MicButton from "./MicButton";
import type { ChatMessage } from "@/types/game";
import HudFlyout from "./HudFlyout";
import MessageBubble from "./MessageBubble";

export default function ChatPanel({ messages }: { messages: ChatMessage[] }) {
  const { sayInRoom } = useStudio();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });

  useEffect(() => {
    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
    }
  }, [messages.length, virtualizer]);

  /** Everyone in the room, or only the people standing near you. */
  const [scope, setScope] = useState<"room" | "nearby">("room");

  const appendDictation = (text: string) => {
    setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    sayInRoom(trimmed, scope);
    setInput("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <HudFlyout
      title="Chat"
      subtitle="Talk to the people in the room"
      bodyClass="hud-flyout__body--chat"
    >
      <div className="hud-chat-layout">
        <div ref={scrollRef} className="hud-chat">
          {messages.length === 0 ? (
            <div className="hud-empty">Nobody has said anything yet.</div>
          ) : (
            <div
              style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div style={{ paddingBottom: 8 }}>
                    <MessageBubble msg={messages[virtualRow.index]} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "0 2px 6px" }}>
          <button
            type="button"
            className="pixel-button"
            style={{ fontSize: "8px", padding: "2px 8px", marginLeft: "auto" }}
            onClick={() => setScope((prev) => (prev === "room" ? "nearby" : "room"))}
            title={
              scope === "room"
                ? "Everyone in the room hears this"
                : "Only people standing near you hear this"
            }
          >
            {scope === "room" ? "whole room" : "nearby only"}
          </button>
        </div>

        <div className="hud-chat-input-row">
          <textarea
            ref={inputRef}
            className="pixel-input"
            style={{ flex: 1, minHeight: 40, height: 40, resize: "none", padding: "8px 10px" }}
            placeholder="Say something to the room..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <MicButton onTranscript={appendDictation} what="remark" />
          <button
            type="button"
            className="pixel-icon-btn pixel-icon-btn--primary"
            style={{ width: 40, height: 40, minWidth: 40, minHeight: 40 }}
            onClick={handleSend}
            disabled={!input.trim()}
            title="Say it"
          >
            <SendHorizontal size={16} />
          </button>
        </div>
      </div>
    </HudFlyout>
  );
}
