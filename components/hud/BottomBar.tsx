"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Gamepad2, Mic, MicOff, Sparkles, User } from "lucide-react";
import { gameEvents } from "@/lib/events";
import { useVoice } from "@/lib/hooks/useVoice";
import { voiceChat } from "@/lib/voice/voice-chat";
import { STATUS_LABELS, formatModelLabel } from "@/lib/constants";
import type { ConnectionStatus, SessionMetrics } from "@/types/game";
import ControllerCheck from "./ControllerCheck";
import { buttonLabel } from "@/lib/gamepad/buttons";
import { subscribeTalkButton, talkButton } from "@/lib/gamepad/bindings";

interface BottomBarProps {
  connection: ConnectionStatus;
  sessionMetrics: SessionMetrics;
}

export default function BottomBar({ connection, sessionMetrics }: BottomBarProps) {
  // Humans in the room; the pill counts people, not the agent seats
  const [humans, setHumans] = useState<{ count: number; capacity: number } | null>(null);

  useEffect(() => {
    return gameEvents.on("presence-count", (count, capacity) => {
      setHumans({ count, capacity });
    });
  }, []);

  const [pad, setPad] = useState<{ id: string; layout: string } | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const talk = buttonLabel(useSyncExternalStore(subscribeTalkButton, talkButton, talkButton));

  useEffect(() => {
    return gameEvents.on("gamepad-state", (id, layout) => {
      setPad(id ? { id, layout } : null);
    });
  }, []);

  const voice = useVoice();
  const micOn = voice.status === "on";
  const trouble =
    (voice.connecting ? ` ${voice.connecting} still connecting.` : "") +
    (voice.failed
      ? ` ${voice.failed} could not be reached — those networks need a relay (TURN) to talk.`
      : "");
  const here = `${voice.withMic} of ${voice.humansHere} here have a microphone on.`;
  const micTitle =
    voice.status === "on"
      ? voice.peers
        ? `Microphone on — ${here} ${voice.inEarshot} of ${voice.peers} connected are within earshot.${trouble} Click to switch off.`
        : `Microphone on — ${here}${voice.withMic > 1 ? "" : " The others need to switch theirs on too."}${trouble} Click to switch off.`
      : voice.status === "requesting"
        ? "Asking for the microphone…"
        : (voice.reason ??
          `${voice.withMic > 0 ? `${here} ` : ""}Switch on voice chat: people near you in the room will hear you. On a controller, hold ${talk} to talk.`);

  return (
    <div className="layout-bottombar">
      <div className="hud-pill hud-pill--connection">
        <span
          className={`pixel-dot pixel-dot--${
            connection === "connected" ? "green" : connection === "connecting" ? "yellow" : "red"
          }`}
        />
        <span>{STATUS_LABELS[connection]}</span>
      </div>
      {/* Only once a run has reported one: an empty pill says nothing. */}
      {sessionMetrics.model ? (
        <div className="hud-pill hud-pill--model">
          <Sparkles size={10} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {formatModelLabel(sessionMetrics.model)}
          </span>
        </div>
      ) : null}
      <button
        type="button"
        className={`hud-pill hud-pill--metric hud-pill--button hud-mic${micOn ? " hud-mic--on" : ""}${
          voice.speaking ? " hud-mic--speaking" : ""
        }${voice.status === "denied" || voice.status === "unsupported" ? " hud-mic--blocked" : ""}`}
        onClick={() => void voiceChat.toggle()}
        title={micTitle}
        aria-pressed={micOn}
        aria-label={micOn ? "Switch voice chat off" : "Switch voice chat on"}
      >
        {micOn ? <Mic size={10} /> : <MicOff size={10} />}
        <span>
          {voice.status === "requesting"
            ? "mic…"
            : voice.withMic > 0
              ? `${voice.withMic}/${voice.humansHere} on mic`
              : "voice off"}
        </span>
      </button>
      {humans && (
        <div
          className="hud-pill hud-pill--metric"
          title={`${humans.count} of ${humans.capacity} humans in this room`}
        >
          <User size={10} />
          <span>
            {humans.count}/{humans.capacity} here
          </span>
        </div>
      )}
      {/* Always there, so a controller that is not being seen has somewhere to say so */}
      <button
        type="button"
        className={`hud-pill hud-pill--metric hud-pill--button${pad ? "" : " hud-pill--dim"}`}
        onClick={() => setCheckOpen(true)}
        title={
          pad
            ? `${pad.id}\nXbox layout: stick or d-pad walks · A talks to people and presses buttons · B backs out · LB RB turn the panels · View closes · hold ${talk} to talk\nClick for the controller check.`
            : "No controller seen. Click for the controller check."
        }
        aria-label="Controller check"
      >
        <Gamepad2 size={10} />
        <span>{pad ? `${pad.layout} · hold ${talk} to talk` : "no pad"}</span>
      </button>
      {checkOpen && <ControllerCheck onClose={() => setCheckOpen(false)} />}
    </div>
  );
}
