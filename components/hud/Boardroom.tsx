"use client";

import { useEffect, useState } from "react";
import { Users, X } from "lucide-react";
import { usePanel } from "@/lib/hooks/usePanel";
import { currentRoom } from "@/lib/room-client";
import { meetingFor, meetingIn, setMeeting, useMeetings } from "@/lib/meeting";
import { useOnline } from "@/lib/presence-online";

/**
 * The boardroom table: start a meeting, or end the one that is running.
 *
 * The one fixture whose panel does something to the world rather than
 * showing it something. A meeting is a fact about a room — it is on, and
 * these people are in it — so the panel is two lines and a button, and the
 * rest of the building learns about it through the room socket.
 *
 * Deliberately not a call: the voice chat is already one conversation for
 * the whole server and switching a microphone on is how you join it. This
 * says a meeting is happening here, which is the part a person standing in
 * a lobby three floors down has no way of knowing.
 */
export default function Boardroom() {
  // The room is read as the panel opens rather than at mount: riding the
  // lift changes rooms without rebuilding the HUD. In the open itself
  // rather than in an effect on it, which is a render deciding to render
  // again.
  const [room, setRoom] = useState("");
  const { open, close } = usePanel("boardroom", { onOpen: () => setRoom(currentRoom()) });
  const meetings = useMeetings();
  const online = useOnline();
  // Re-rendered on a beat so "20m" is not the number it was when the panel
  // opened; a meeting is watched rather than glanced at.
  const [, tick] = useState(0);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, [open]);

  if (!open) return null;

  const meeting = room ? meetingIn(room, meetings) : null;
  // Everyone the server says is standing in this room, which is who is at
  // the table. The room's own roster would do as well; this list is the one
  // already kept for the People panel.
  const here = online.filter((person) => person.room === room);
  const elsewhere = meetings.filter((m) => m.room !== room);

  return (
    <div
      className="pinball-overlay board-overlay"
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        if (window.matchMedia("(pointer: coarse)").matches) return;
        close();
      }}
      role="dialog"
      aria-label="Boardroom"
    >
      <div className="pixel-panel board-panel meeting-panel">
        <div className="pinball-head arcade-head">
          <span className="arcade-head__title">
            <Users size={11} aria-hidden /> Boardroom
          </span>
          <span className="arcade-head__buttons">
            <button
              type="button"
              className="pixel-icon-btn"
              style={{ width: 26, height: 26 }}
              onClick={close}
              title="Close (Esc)"
              aria-label="Close the boardroom"
            >
              <X size={12} />
            </button>
          </span>
        </div>

        <div className="meeting-body">
          <p className="meeting-state">
            {meeting ? (
              <>
                <span className="pixel-dot pixel-dot--green" /> A meeting is in progress — called by{" "}
                {meeting.host}, {meetingFor(meeting.since)}.
              </>
            ) : (
              <>No meeting is being held at this table.</>
            )}
          </p>

          <p className="meeting-who">
            {/* Nobody at all is the moment before the room's roster has
                arrived, which is over in a blink — but "0 people are in
                this room: ." is what the obvious two branches print. */}
            {here.length === 0
              ? "Nobody is standing in this room yet."
              : here.length === 1
                ? "You are the only person in this room."
                : `${here.length} people are in this room: ${here.map((p) => p.name).join(", ")}.`}
          </p>

          <button
            type="button"
            className={`pixel-button${meeting ? "" : " pixel-button--primary"} meeting-button`}
            onClick={() => setMeeting(!meeting)}
          >
            {meeting ? "End the meeting" : "Start a meeting"}
          </button>

          <p className="meeting-note">
            {meeting
              ? "Everyone who can reach this floor is being shown that a meeting is on. Anybody at the table can end it, and it ends on its own when the room empties."
              : "Everyone who can reach this floor will be shown that a meeting is on, wherever in the world they are standing."}
          </p>

          {elsewhere.length > 0 && (
            <p className="meeting-note meeting-note--elsewhere">
              {elsewhere.map((m) => `${m.where} — ${m.host}, ${meetingFor(m.since)}`).join(" · ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
