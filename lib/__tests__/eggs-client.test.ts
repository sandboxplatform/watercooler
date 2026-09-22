// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ServerMessage } from "../presence-types";
import type { LaidEgg } from "../world/eggs";

/**
 * The field, from the socket to the scene — and, in it, which egg is new.
 *
 * The `eggs` message is the **whole list** every time, which is the right
 * shape for drawing a park and no shape at all for the one moment worth
 * letting fireworks off over. A browser walking out of a building is sent
 * exactly the same list as a browser that was standing there when Michael
 * laid one, so a scene that burst over everything it had not drawn before
 * would set one off at every egg in the park for anybody arriving.
 *
 * `laid` is what tells them apart and it is worth its own file for the
 * usual reason: the failure is silent at both ends. A `laid` the server
 * stops sending is fireworks that simply never go off, and a `laid` read
 * off the wrong message is a park that goes up like a fairground every
 * time somebody walks out of a lobby. Neither throws, and neither is
 * visible from anywhere but the map.
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

const { onEggs, takeEgg, resetEggs } = await import("../eggs-client");

const say = (message: ServerMessage) => {
  for (const handler of handlers) handler(message);
};

const egg = (id: string, tier: LaidEgg["tier"] = "plain"): LaidEgg => ({
  id,
  tier,
  x: 900,
  y: 900,
});

/** Everything a listener has been told, in order. */
function watch() {
  const calls: { ids: string[]; laid: string | null; taken: string | null }[] = [];
  const off = onEggs((eggs, news) => {
    calls.push({
      ids: eggs.map((e) => e.id),
      laid: news.laid,
      taken: news.taken?.tier ?? null,
    });
  });
  return { calls, off };
}

beforeEach(() => {
  sent.length = 0;
  resetEggs();
});

describe("the field arriving from the socket", () => {
  it("hands over what is lying there, and calls none of it new", () => {
    const { calls, off } = watch();
    // The frame everybody gets on walking onto the map: three eggs, none
    // of them this moment's.
    say({ type: "eggs", eggs: [egg("a"), egg("b"), egg("c")] });
    expect(calls.at(-1)).toEqual({ ids: ["a", "b", "c"], laid: null, taken: null });
    off();
  });

  it("names the one Michael has just left", () => {
    const { calls, off } = watch();
    say({ type: "eggs", eggs: [egg("a")] });
    say({ type: "eggs", eggs: [egg("a"), egg("b", "rainbow")], laid: "b" });
    // The whole list, as always — and the new one named in it, which is
    // the only way the scene can tell "b" from "a".
    expect(calls.at(-1)).toEqual({ ids: ["a", "b"], laid: "b", taken: null });
    off();
  });

  it("forgets it again on the next message", () => {
    const { calls, off } = watch();
    say({ type: "eggs", eggs: [egg("a")], laid: "a" });
    // One going stale, or somebody arriving: the field is republished and
    // nothing about it is news. A `laid` that stuck would be a firework
    // every time the park was swept.
    say({ type: "eggs", eggs: [egg("a")] });
    expect(calls.at(-1)?.laid).toBeNull();
    off();
  });

  it("carries a find without calling it a laying", () => {
    const { calls, off } = watch();
    say({
      type: "eggs",
      eggs: [],
      taken: { tier: "gilded", by: "Coop", x: 900, y: 900 },
    });
    expect(calls.at(-1)).toEqual({ ids: [], laid: null, taken: "gilded" });
    off();
  });

  /**
   * The scene is built after the message that told it — walking out of a
   * building takes a moment, and the field is published when it changes.
   * So a listener is handed what is lying there at once, and that catch-up
   * is emphatically not a laying.
   */
  it("catches a late listener up without setting it off", () => {
    say({ type: "eggs", eggs: [egg("a", "jade")], laid: "a" });
    const { calls, off } = watch();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ ids: ["a"], laid: null, taken: null });
    off();
  });

  /** Which egg is never said: the server has where we are standing. */
  it("asks for the nearest one without naming it", () => {
    takeEgg();
    expect(sent).toEqual([{ type: "egg", action: "take" }]);
  });
});
