import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { RoomStore } from "../server/room-store";
import type { CliProvider, CliRunOptions, CliParsedResult } from "../cli-providers";

/**
 * Delegation, and through it the one place a run is started.
 *
 * `runAgent` is shared by the two ways work begins — a task handed to a
 * worker face to face, and a task an agent hands on to another seat — and it
 * was written twice before this. The direct path answers one WebSocket
 * client and needs a real socket to drive, so what is pinned here is the
 * delegated one, which reaches the same lifecycle through a plain function
 * call: the limits that guard it, the run count it keeps, the spend it
 * records, the session it resumes, and every way it can end.
 *
 * The bridge had no tests at all until this file.
 */

const ROOM = "dispatch-room";

/** The room store is a singleton on globalThis; give it an in-memory one. */
const globalForStore = globalThis as unknown as { __roomStore?: RoomStore };

/** What the fake provider was asked to do, in order. */
let calls: CliRunOptions[] = [];
/** How the fake provider answers, set per test. */
let answer: (opts: CliRunOptions) => Promise<CliParsedResult>;

/**
 * A service provider, because that is the branch with no child process and
 * so the one a test can drive. `mettara` is the real service provider's id,
 * so nothing here has to lie about what it is.
 */
const fake: CliProvider = {
  id: "mettara",
  kind: "service",
  displayName: "Fake",
  usesWorkspaces: false,
  setupHint: "",
  staticModels: [],
  run: (opts) => {
    calls.push(opts);
    return answer(opts);
  },
};

let bridge: typeof import("../cli-bridge");

beforeEach(async () => {
  globalForStore.__roomStore = new RoomStore(":memory:");
  calls = [];
  answer = async () => ({ text: "done" });
  bridge = await import("../cli-bridge");
  bridge.setBridgeProvider(fake);
});

afterEach(() => {
  delete globalForStore.__roomStore;
});

function staff(seatId: string, label: string) {
  globalForStore.__roomStore!.upsertSeat(ROOM, {
    seatId,
    label,
    roleTitle: "Worker",
    assigned: true,
  });
}

describe("handing work to another seat", () => {
  it("runs it and gives back what the worker said", async () => {
    staff("seat-0", "Alice");
    answer = async () => ({ text: "swept the yard", costUsd: 0.02 });

    const result = await bridge.dispatchToWorker("seat-0", "sweep the yard", ROOM);

    expect(result).toEqual({ result: "swept the yard" });
    expect(calls).toHaveLength(1);
    expect(calls[0].message).toBe("sweep the yard");
    expect(calls[0].seatLabel).toBe("Alice");
    // A dispatched worker does not delegate onward.
    expect(calls[0].mcpConfigPath).toBeNull();
  });

  it("bills the room for what the run cost", async () => {
    staff("seat-0", "Alice");
    answer = async () => ({ text: "done", costUsd: 0.25 });

    await bridge.dispatchToWorker("seat-0", "a task", ROOM);

    expect(globalForStore.__roomStore!.getSpend(ROOM)).toBeCloseTo(0.25, 5);
  });

  it("resumes the seat's own conversation on the next task", async () => {
    staff("seat-resume", "Bob");
    answer = async () => ({ text: "first", sessionId: "session-abc" });
    await bridge.dispatchToWorker("seat-resume", "one", ROOM);

    answer = async () => ({ text: "second" });
    await bridge.dispatchToWorker("seat-resume", "two", ROOM);

    expect(calls[0].sessionId).toBeUndefined();
    expect(calls[1].sessionId).toBe("session-abc");
  });

  it("refuses a seat nobody is sitting in, without running anything", async () => {
    const result = await bridge.dispatchToWorker("seat-nobody", "a task", ROOM);

    expect(result.result).toBe("");
    expect(result.error).toContain("seat-nobody");
    expect(calls).toHaveLength(0);
  });
});

describe("when a delegated run goes wrong", () => {
  it("hands back the reason when the provider throws", async () => {
    staff("seat-0", "Alice");
    answer = async () => {
      throw new Error("the service was unreachable");
    };

    const result = await bridge.dispatchToWorker("seat-0", "a task", ROOM);

    expect(result).toEqual({ result: "", error: "the service was unreachable" });
  });

  it("hands back the reason when the provider refuses the turn", async () => {
    staff("seat-0", "Alice");
    answer = async () => ({ text: "not signed in", isError: true, costUsd: 0.01 });

    const result = await bridge.dispatchToWorker("seat-0", "a task", ROOM);

    expect(result).toEqual({ result: "", error: "not signed in" });
    // A refused turn still cost something, and the room is still billed.
    expect(globalForStore.__roomStore!.getSpend(ROOM)).toBeCloseTo(0.01, 5);
  });

  it("does not let a failure leave the run counted against the limit", async () => {
    staff("seat-0", "Alice");
    answer = async () => {
      throw new Error("boom");
    };
    for (let i = 0; i < 6; i += 1) await bridge.dispatchToWorker("seat-0", "a task", ROOM);

    // Six failures in a row, and the room is still open for work: the count
    // is released however a run ends. It used to be kept in two places.
    answer = async () => ({ text: "still working" });
    const result = await bridge.dispatchToWorker("seat-0", "one more", ROOM);
    expect(result).toEqual({ result: "still working" });
  });
});

describe("the limits delegation shares with direct work", () => {
  it("stops at the concurrency ceiling rather than fanning out", async () => {
    staff("seat-0", "Alice");
    // Runs that never answer, so they stay counted.
    let release: (() => void) | null = null;
    const holding = new Promise<CliParsedResult>((resolve) => {
      release = () => resolve({ text: "at last" });
    });
    answer = () => holding;

    const running = Array.from({ length: 4 }, () =>
      bridge.dispatchToWorker("seat-0", "a task", ROOM),
    );
    // The fifth arrives with every place taken.
    const refused = await bridge.dispatchToWorker("seat-0", "one too many", ROOM);

    expect(refused.result).toBe("");
    expect(refused.error).toContain("Too many agents");
    expect(calls).toHaveLength(4);

    release!();
    await Promise.all(running);

    // And once they are done, the room takes work again.
    answer = async () => ({ text: "room for more" });
    expect(await bridge.dispatchToWorker("seat-0", "later", ROOM)).toEqual({
      result: "room for more",
    });
  });

  it("stops when the room has spent its budget", async () => {
    staff("seat-0", "Alice");
    globalForStore.__roomStore!.addSpend(ROOM, 1_000);

    const result = await bridge.dispatchToWorker("seat-0", "a task", ROOM);

    expect(result.result).toBe("");
    expect(result.error).toContain("spend limit");
    expect(calls).toHaveLength(0);
  });
});
