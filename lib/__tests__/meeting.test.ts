// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, settle } from "../hooks/__tests__/render-hook";
import type { ServerMessage } from "../presence-types";

/**
 * The notice, from the socket to the HUD.
 *
 * The server's half is held down over real sockets in
 * `lib/server/__tests__/meeting.test.ts`; this is the other end of the same
 * wire — that a `meetings` message actually reaches the pill in the bottom
 * bar, which is the one thing about this feature a person is meant to see
 * without walking anywhere.
 *
 * Worth its own file because the failure is silent: a message type nothing
 * subscribes to is dropped without a word, exactly as the lift's `boarded`
 * was, and a notice that never arrives looks identical to a meeting nobody
 * called.
 */

/** The socket's fan-out, captured so a test can play the server. */
let handlers: ((message: ServerMessage) => void)[] = [];
const sent: unknown[] = [];

vi.mock("../room-socket", () => ({
  onRoomMessage: (handler: (message: ServerMessage) => void) => {
    handlers.push(handler);
    return () => {
      handlers = handlers.filter((h) => h !== handler);
    };
  },
  sendRoom: (message: unknown) => {
    sent.push(message);
    return true;
  },
}));

const { meetingFor, meetingIn, setMeeting, useMeetings } = await import("../meeting");

const notice = (room: string, host = "Coop", since = new Date().toISOString()) => ({
  room,
  where: "Sandbox ERP · Floor 3 · Operations",
  host,
  since,
});

const say = (message: ServerMessage) => {
  for (const handler of handlers) handler(message);
};

beforeEach(() => {
  sent.length = 0;
});

describe("the meetings the HUD is told about", () => {
  it("arrive, and come down again", async () => {
    const hook = renderHook(useMeetings);
    expect(hook.current).toEqual([]);

    await settle(() => say({ type: "meetings", meetings: [notice("sandbox-erp-floor-3")] }));
    expect(hook.current).toHaveLength(1);
    expect(hook.current[0].host).toBe("Coop");

    // The whole list every time, so the one that ended is simply not in it.
    await settle(() => say({ type: "meetings", meetings: [] }));
    expect(hook.current).toEqual([]);

    hook.unmount();
  });

  it("ignores everything else the room socket carries", async () => {
    const hook = renderHook(useMeetings);
    await settle(() => say({ type: "meetings", meetings: [notice("sandbox-erp-floor-3")] }));
    await settle(() => say({ type: "online", people: [] }));
    expect(hook.current).toHaveLength(1);
    hook.unmount();
  });

  it("finds the one in the room you are standing in, and only that one", async () => {
    const all = [notice("sandbox-erp-floor-3"), notice("castle-atlantic-floor-3", "Hunter")];
    expect(meetingIn("castle-atlantic-floor-3", all)?.host).toBe("Hunter");
    expect(meetingIn("sandbox-erp", all)).toBeNull();
  });

  /**
   * The room is deliberately not in the message: it is the room this
   * connection walked into, and the browser is the part of this that can
   * lie about where somebody is standing.
   */
  it("asks for a meeting without naming a room", () => {
    setMeeting(true);
    setMeeting(false);
    expect(sent).toEqual([
      { type: "meeting", on: true },
      { type: "meeting", on: false },
    ]);
  });

  it("says how long it has been going, for a notice that is glanced at", () => {
    const at = Date.parse("2026-09-16T10:00:00Z");
    expect(meetingFor("2026-09-16T09:59:30Z", at)).toBe("just started");
    expect(meetingFor("2026-09-16T09:40:00Z", at)).toBe("20m");
    expect(meetingFor("2026-09-16T08:35:00Z", at)).toBe("1h 25m");
    // A clock that disagrees with the server's is not worth a negative age.
    expect(meetingFor("2026-09-16T10:00:30Z", at)).toBe("just started");
  });
});
