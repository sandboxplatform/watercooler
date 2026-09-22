// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gameEvents } from "@/lib/events";
import { routeScenes } from "../scene-router";

/**
 * When the scene is swapped, which is not when the move is announced.
 *
 * Building a place is one long synchronous stretch — the room being left
 * torn down, and the next one's ground laid, its buildings put up and its
 * trees planted — and on a second visit there is nothing left to fetch, so
 * Phaser runs the new scene's `create` inside the call that asked for it.
 * That call is a door firing in the old scene's own `update`, so the browser
 * never gets a frame between the two: what it holds on screen for the whole
 * build is the frame from *before* the door fired, with the character still
 * standing in the doorway. It reads as the sprite freezing on the door.
 *
 * So the swap waits for a paint, which is what these assertions are about.
 * Nothing else in the app would notice if it stopped waiting: the right room
 * still comes up, a moment later, and the only sign is a frozen doorway and
 * a loading card nobody ever sees.
 */
describe("when the router swaps scenes", () => {
  let frames: Map<number, FrameRequestCallback>;
  let game: { scene: { getScene: unknown; stop: unknown; start: unknown }; cache: unknown };
  let start: ReturnType<typeof vi.fn>;
  let stopRouting: () => void;

  /** Run whatever is waiting on the next frame, once. */
  const paint = () => {
    const due = [...frames.values()];
    frames.clear();
    for (const frame of due) frame(0);
  };

  beforeEach(() => {
    frames = new Map();
    let nextFrame = 1;
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
      const id = nextFrame++;
      frames.set(id, fn);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    window.history.replaceState({}, "", "/world");

    start = vi.fn();
    game = {
      scene: { getScene: vi.fn(() => null), stop: vi.fn(), start },
      cache: { tilemap: { remove: vi.fn() } },
    };
    stopRouting = routeScenes(game as never);
    start.mockClear();
  });

  afterEach(() => {
    stopRouting();
    vi.unstubAllGlobals();
  });

  /** The place a person is looking at when the door fires. */
  it("leaves the room being left on screen for the tick that announced the move", () => {
    window.history.replaceState({}, "", "/r/sandbox-erp");
    gameEvents.emit("room-changed", "sandbox-erp", {});
    expect(start).not.toHaveBeenCalled();
  });

  /**
   * Two frames rather than one: the card that covers the move is React's,
   * and React commits on a schedule of its own that is not guaranteed to
   * have landed by the first callback.
   */
  it("swaps once the browser has had a frame to paint in", () => {
    window.history.replaceState({}, "", "/r/sandbox-erp");
    gameEvents.emit("room-changed", "sandbox-erp", {});

    paint();
    expect(start).not.toHaveBeenCalled();

    paint();
    expect(start).toHaveBeenCalledWith("OfficeScene", {});
  });

  /**
   * `go` reads the address bar rather than what it was handed, so two moves
   * inside one pair of frames would both arrive at the second one's
   * destination. One swap is the honest answer, and it is the later one.
   */
  it("makes only the newest move when two land in the same pair of frames", () => {
    window.history.replaceState({}, "", "/r/sandbox-erp");
    gameEvents.emit("room-changed", "sandbox-erp", {});
    window.history.replaceState({}, "", "/campus/homestar");
    gameEvents.emit("room-changed", "campus-homestar", {});

    paint();
    paint();
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith("CampusScene", { campus: "homestar", from: undefined });
  });

  /** A router taken down mid-move must not build a scene into a dead game. */
  it("drops a move that was still waiting when the router went", () => {
    window.history.replaceState({}, "", "/r/sandbox-erp");
    gameEvents.emit("room-changed", "sandbox-erp", {});
    stopRouting();

    paint();
    paint();
    expect(start).not.toHaveBeenCalled();
  });
});
