import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gameEvents } from "../events";
import { resetRoomTravel, travelTo, watchRoomHistory } from "../room-travel";

/**
 * Riding the lift without reloading the page.
 *
 * What matters here is the announcement, because everything downstream of it
 * is expensive: the scene throws itself away and rebuilds, and the store
 * refetches the room. Saying so when nothing moved is a stutter for no
 * reason; not saying so when it did leaves the address bar naming one floor
 * and the game drawing another.
 *
 * The suite runs on node with no DOM — nothing else in the repo needs one,
 * and a whole jsdom for three properties is not worth what it costs every
 * run. `window` here is the three things the module actually touches.
 */

interface FakeWindow {
  location: { pathname: string; search: string };
  history: { pushState: (state: unknown, title: string, url: string) => void };
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
}

let fake: FakeWindow;
let listeners: Set<() => void>;

/** Move the fake address bar, the way a real pushState or a pop would. */
function goTo(url: string) {
  const [pathname, search] = url.split("?");
  fake.location.pathname = pathname;
  fake.location.search = search ? `?${search}` : "";
}

function popstate() {
  for (const fn of [...listeners]) fn();
}

describe("travelling between rooms in the page", () => {
  let heard: string[];
  let unsub: () => void;

  beforeEach(() => {
    listeners = new Set();
    fake = {
      location: { pathname: "/r/sandbox-erp/floor/3", search: "" },
      history: { pushState: (_state, _title, url) => goTo(url) },
      addEventListener: (type, fn) => {
        if (type === "popstate") listeners.add(fn);
      },
      removeEventListener: (type, fn) => {
        if (type === "popstate") listeners.delete(fn);
      },
    };
    (globalThis as unknown as { window: FakeWindow }).window = fake;
    resetRoomTravel();
    heard = [];
    unsub = gameEvents.on("room-changed", (room) => heard.push(room));
  });

  afterEach(() => {
    unsub();
    resetRoomTravel();
    delete (globalThis as unknown as { window?: FakeWindow }).window;
  });

  it("pushes the URL and says which room it now is", () => {
    travelTo("/r/sandbox-erp/floor/1?via=elevator");
    expect(fake.location.pathname).toBe("/r/sandbox-erp/floor/1");
    expect(heard).toEqual(["sandbox-erp-floor-1"]);
  });

  /** A query parameter is not a move, and rebuilding a scene over one is waste. */
  it("says nothing when the room is the same", () => {
    travelTo("/r/sandbox-erp/floor/3?zoom=3");
    expect(fake.location.search).toBe("?zoom=3");
    expect(heard).toEqual([]);
  });

  it("says nothing twice for the same room", () => {
    travelTo("/r/sandbox-erp/floor/1");
    travelTo("/r/sandbox-erp/floor/1?via=elevator");
    expect(heard).toEqual(["sandbox-erp-floor-1"]);
  });

  it("announces the lobby as the building's own room, not a floor of it", () => {
    travelTo("/r/sandbox-erp");
    expect(heard).toEqual(["sandbox-erp"]);
  });

  /**
   * Back and forward move between rooms as surely as the lift does, and
   * nothing else is watching for them.
   */
  it("hears the back button", () => {
    const stop = watchRoomHistory();
    travelTo("/r/sandbox-erp/floor/1");
    goTo("/r/sandbox-erp/floor/3");
    popstate();
    expect(heard).toEqual(["sandbox-erp-floor-1", "sandbox-erp-floor-3"]);
    stop();
  });

  it("stops listening when told to", () => {
    const stop = watchRoomHistory();
    stop();
    goTo("/r/sandbox-erp/floor/2");
    popstate();
    expect(heard).toEqual([]);
    expect(listeners.size).toBe(0);
  });

  it("does nothing where there is no window at all", () => {
    delete (globalThis as unknown as { window?: FakeWindow }).window;
    resetRoomTravel();
    expect(() => travelTo("/r/sandbox-erp/floor/1")).not.toThrow();
    expect(() => watchRoomHistory()()).not.toThrow();
    expect(heard).toEqual([]);
  });
});
