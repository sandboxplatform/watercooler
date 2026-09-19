"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Gamepad2, Mic, MicOff, Users } from "lucide-react";
import { gameEvents } from "@/lib/events";
import { useOnline } from "@/lib/presence-online";
import { useVoice } from "@/lib/hooks/useVoice";
import { meetingFor, useMeetings } from "@/lib/meeting";
import { voiceChat } from "@/lib/voice/voice-chat";
import ControllerCheck from "./ControllerCheck";
import { buttonLabel } from "@/lib/gamepad/buttons";
import { subscribeTalkButton, talkButton } from "@/lib/gamepad/bindings";

interface BottomBarProps {
  /** Whether the People panel is up, so the pill reads as pressed. */
  peopleOpen: boolean;
  /** Show the People panel — the list this pill is counting — or put it away. */
  onTogglePeople: () => void;
}

export default function BottomBar({ peopleOpen, onTogglePeople }: BottomBarProps) {
  /**
   * Everybody logged into the world, not everybody in this room.
   *
   * The room's own figure used to hang here as its own pill — `2/6 here` —
   * which answered a question nobody was asking: a room's ceiling is the
   * server's business, and what is worth knowing at a glance is whether
   * there is anyone else about at all. This is the server's list, which
   * already leaves the residents out, so it is a count of people.
   */
  const online = useOnline();

  const [pad, setPad] = useState<{ id: string; layout: string } | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const talk = buttonLabel(useSyncExternalStore(subscribeTalkButton, talkButton, talkButton));

  useEffect(() => {
    return gameEvents.on("gamepad-state", (id, layout) => {
      setPad(id ? { id, layout } : null);
    });
  }, []);

  /**
   * A meeting somebody has called at a boardroom table.
   *
   * Everyone who could walk into that room is shown it, wherever in the
   * world they are standing — which is the whole point: the people it is
   * news to are the ones who are not in the room. The server has already
   * left out the floors this person cannot ride to, so anything that
   * arrives here is theirs to know.
   *
   * A notice rather than a way in. Walking to the lift and going up is how
   * you join it, which is how everything else in this world works.
   */
  const meetings = useMeetings();

  /**
   * Global Chat: one conversation for the whole world.
   *
   * There is no half-way state to put on it. Switching a microphone on
   * joins the chat and switching it off leaves it, so the pill has two
   * faces — the icon on its own while the microphone is off, and the
   * chat's name and the number of people in it, in green, while it is on.
   * Everything about the connections underneath stays in the tooltip: a
   * mesh peer still negotiating is not a third kind of membership, it is a
   * connection being made, and `2/5 on mic` made the two look like several.
   */
  const voice = useVoice();
  const micOn = voice.status === "on";
  const trouble =
    (voice.connecting ? ` ${voice.connecting} still connecting.` : "") +
    (voice.failed
      ? ` ${voice.failed} could not be reached — those networks need a relay (TURN) to talk.`
      : "");
  const inChat =
    voice.withMic === 1
      ? "1 person is in Global Chat"
      : `${voice.withMic} people are in Global Chat`;
  const micTitle =
    voice.status === "on"
      ? `In Global Chat — ${inChat}, of ${voice.online} in the world. ${
          voice.peers ? `Hearing ${voice.peers}.` : "Nobody else has a microphone on yet."
        }${trouble} Click to leave.`
      : voice.status === "requesting"
        ? "Asking for the microphone…"
        : (voice.reason ??
          `${voice.withMic > 0 ? `${inChat}. ` : ""}Join Global Chat: everyone in it hears you, wherever in the world they are standing. On a controller, hold ${talk} to talk.`);

  return (
    <div className="layout-bottombar">
      {/*
        The count is a door, and it shuts as well as opens: pressing it again
        puts the column away. The button at the head of the column was the
        only way back from a list opened down here.
      */}
      <button
        type="button"
        className={`hud-pill hud-pill--connection hud-pill--button${
          peopleOpen ? " hud-pill--on" : ""
        }`}
        onClick={onTogglePeople}
        title={
          peopleOpen
            ? "Click to put the list away."
            : online.length > 0
              ? `${
                  online.length === 1 ? "1 person is" : `${online.length} people are`
                } in the world. Click to see who, and where.`
              : "Click to see who is in the world, and where."
        }
        aria-expanded={peopleOpen}
        aria-label="Who is in the world"
      >
        <span className={`pixel-dot pixel-dot--${online.length > 0 ? "green" : "gray"}`} />
        <span>Online{online.length > 0 ? ` (${online.length})` : ""}</span>
      </button>
      <button
        type="button"
        className={`hud-pill hud-pill--metric hud-pill--button hud-mic${
          micOn ? " hud-mic--on" : " hud-mic--icon"
        }${voice.speaking ? " hud-mic--speaking" : ""}${
          voice.status === "requesting" ? " hud-pill--dim" : ""
        }${voice.status === "denied" || voice.status === "unsupported" ? " hud-mic--blocked" : ""}`}
        onClick={() => void voiceChat.toggle()}
        title={micTitle}
        aria-pressed={micOn}
        aria-label={micOn ? `Leave Global Chat — ${inChat}` : "Join Global Chat"}
      >
        {micOn ? <Mic size={10} /> : <MicOff size={10} />}
        {/* Off, the icon is the whole pill; on, the chat is worth naming and counting. */}
        {micOn && <span>Global Chat ({voice.withMic})</span>}
      </button>
      {meetings.length > 0 && (
        <div
          className="hud-pill hud-pill--metric hud-pill--meeting"
          title={meetings
            .map((m) => `${m.where} — called by ${m.host}, ${meetingFor(m.since)}`)
            .join("\n")}
        >
          <Users size={10} />
          <span>
            {meetings.length === 1
              ? `meeting · ${meetings[0].where.split(" · ").slice(-1)[0]}`
              : `${meetings.length} meetings`}
          </span>
        </div>
      )}
      {/*
        Only when there is a controller to talk about.

        It hung there always, dimmed, reading `no pad` — which is the state
        nearly everybody is in nearly all the time, so the bar carried a
        permanent pill whose entire message was that a thing nobody had
        plugged in was not plugged in. Plugging one in is the news, and it
        is what puts the pill up; the controller check goes with it.
      */}
      {pad && (
        <button
          type="button"
          className="hud-pill hud-pill--metric hud-pill--button"
          onClick={() => setCheckOpen(true)}
          title={`${pad.id}\nXbox layout: stick or d-pad walks · A talks to people and presses buttons · B backs out · LB RB turn the panels · View closes · hold ${talk} to talk\nClick for the controller check.`}
          aria-label="Controller check"
        >
          <Gamepad2 size={10} />
          <span>{`${pad.layout} · hold ${talk} to talk`}</span>
        </button>
      )}
      {checkOpen && <ControllerCheck onClose={() => setCheckOpen(false)} />}
    </div>
  );
}
