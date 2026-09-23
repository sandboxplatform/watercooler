"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Footprints, Gamepad2, Mic, MicOff, Users } from "lucide-react";
import { gameEvents } from "@/lib/events";
import { useOnline } from "@/lib/presence-online";
import { useVoice } from "@/lib/hooks/useVoice";
import { useSprinting } from "@/lib/hooks/useSprinting";
import { meetingFor, useMeetings } from "@/lib/meeting";
import { voiceChat } from "@/lib/voice/voice-chat";
import { TURN_URL } from "@/lib/voice/ice";
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
   * Walking or running, which on a phone had no switch at all.
   *
   * Sprinting is left Shift, and a handset has no Shift — so the one mode
   * in this world that is neither a panel nor a place was a keyboard's and
   * nobody else's. The pill is the same press by another route, and it is
   * drawn on every screen rather than only the touch ones: the mode is
   * kept between rooms and between sessions, so a browser that has been
   * left sprinting should say so wherever it is being read.
   *
   * The state is the character's, and the browser's memory of it is what
   * outlives them — the HUD is up long before any character and stays up
   * through every door. So the pill reads that, and follows the character
   * from there: a press of Shift moves it exactly as a press of it does.
   */
  const sprinting = useSprinting();

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
      ? ` ${voice.failed} cannot be reached${
          // Which of the two it is, rather than the guess this always made.
          // "Those networks need a relay" is the right answer with no relay
          // configured and a misleading one with a relay that is not working,
          // and they want opposite things done about them. NEXT_PUBLIC_ is
          // inlined at build, so this is the relay the running bundle has —
          // which is the question, a relay set on a live service being one
          // that was never compiled in.
          TURN_URL
            ? " — even over the relay (TURN) this build carries."
            : " — those networks need a relay (TURN), and this build has none."
        }`
      : "") +
    (voice.silent ? ` ${voice.silent} connected, but this browser is not playing them.` : "");
  /**
   * How many people this browser is actually in the conversation with.
   *
   * `withMic` is how many microphones the server says are on. That is the
   * number the pill showed, and it is not quite the promise the pill makes:
   * somebody whose connection has failed, or whose audio this browser will
   * not play, is in Global Chat without being in it with you. Two people
   * could hear each other until one of them walked upstairs, and this read
   * `Global Chat (2)` throughout — every indicator in the app agreeing with
   * every other one about something none of them had checked.
   *
   * Deliberately not `peers`, which would count up through every handshake:
   * a connection being made is still not a third kind of membership, and a
   * number that dips for a second on every arrival is one nobody reads.
   * Only the two states that nothing is going to mend on its own come off
   * it, and the tooltip says which.
   */
  const reached = Math.max(1, voice.withMic - voice.failed - voice.silent);
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
        /* Tab is the same door, and the pill is the only place it is written
           down: the HUD has no key legend to put it in. */
        title={
          peopleOpen
            ? "Click, or press Tab, to put the list away."
            : online.length > 0
              ? `${
                  online.length === 1 ? "1 person is" : `${online.length} people are`
                } in the world. Click, or press Tab, to see who and where.`
              : "Click, or press Tab, to see who is in the world, and where."
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
        {micOn && <span>Global Chat ({reached})</span>}
      </button>
      {/*
        Sprinting, beside the microphone: the icon and nothing else, lit
        while the mode is on. The bottom bar is glanced at rather than read,
        and a switch with two faces has already said which it is in — a word
        beside it would be the same fact printed twice, in the place with
        least room for it.
      */}
      <button
        type="button"
        className={`hud-pill hud-pill--metric hud-pill--button hud-sprint${
          sprinting ? " hud-sprint--on" : ""
        }`}
        onClick={() => gameEvents.emit("sprint-pressed")}
        title={
          sprinting
            ? "Sprinting. Click, or press left Shift, to walk."
            : "Walking. Click, or press left Shift, to sprint."
        }
        aria-pressed={sprinting}
        aria-label={sprinting ? "Stop sprinting" : "Sprint"}
      >
        <Footprints size={10} />
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
