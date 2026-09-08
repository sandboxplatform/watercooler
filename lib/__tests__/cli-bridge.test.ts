import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
/** What the service says about its own readiness, set per test. */
let readiness: () => Promise<string | null>;

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
  ready: () => readiness(),
};

let bridge: typeof import("../cli-bridge");

beforeEach(async () => {
  globalForStore.__roomStore = new RoomStore(":memory:");
  calls = [];
  answer = async () => ({ text: "done" });
  readiness = async () => null;
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

/**
 * A hosted provider can be configured on this side and have nothing to talk
 * to on the other — an empty Mettara group is the case that prompted this.
 * The refusal has to arrive as a sentence, in front of the run, without
 * costing the room a place in the count.
 */
describe("what the service says about itself", () => {
  it("refuses the run with the service's own sentence, having run nothing", async () => {
    staff("seat-0", "Alice");
    readiness = async () => "The group has no AI in it.";

    const result = await bridge.dispatchToWorker("seat-0", "a task", ROOM);

    expect(result).toEqual({ result: "", error: "The group has no AI in it." });
    expect(calls).toHaveLength(0);
  });

  it("does not hold a place in the count when it refuses", async () => {
    staff("seat-0", "Alice");
    readiness = async () => "not ready";
    for (let i = 0; i < 6; i += 1) await bridge.dispatchToWorker("seat-0", "a task", ROOM);

    readiness = async () => null;
    expect(await bridge.dispatchToWorker("seat-0", "one more", ROOM)).toEqual({ result: "done" });
  });

  /**
   * The question reaches the network, so asking it suspends — and a check
   * separated from the run it guards by an await is no check at all. Five
   * dispatches arriving together must still leave four running: each has to
   * read the count and claim its place in one uninterrupted stretch, which
   * is why readiness is asked *before* `providerBlocked` and never inside
   * it. Moving it back inside lets all five through, and nothing else here
   * notices.
   */
  it("still holds the ceiling when the readiness question takes a moment", async () => {
    staff("seat-0", "Alice");
    readiness = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return null;
    };
    let release: (() => void) | null = null;
    const holding = new Promise<CliParsedResult>((resolve) => {
      release = () => resolve({ text: "at last" });
    });
    answer = () => holding;

    const running = Array.from({ length: 4 }, () =>
      bridge.dispatchToWorker("seat-0", "a task", ROOM),
    );
    const refused = await bridge.dispatchToWorker("seat-0", "one too many", ROOM);

    expect(refused.error).toContain("Too many agents");
    expect(calls).toHaveLength(4);

    release!();
    await Promise.all(running);
  });
});

/**
 * A hosted turn is bounded too.
 *
 * The CLI branch has always had a guard — it kills the child and the `close`
 * that follows gives the place back. The service branch had none: a request
 * that never answered held its place for ever, and four of those shut the
 * room to work with nothing on screen to say why. A streamed turn is exactly
 * the shape of call that can go quiet halfway through.
 *
 * These run against their own copy of the bridge, so a short limit here is
 * not a short limit for the tests above that hold runs open on purpose.
 */
describe("a hosted run that never answers", () => {
  let bounded: typeof import("../cli-bridge");

  beforeEach(async () => {
    process.env.AGENT_RUN_TIMEOUT_MS = "200";
    vi.resetModules();
    bounded = await import("../cli-bridge");
    bounded.setBridgeProvider(fake);
  });

  afterEach(() => {
    delete process.env.AGENT_RUN_TIMEOUT_MS;
    vi.resetModules();
  });

  it("is abandoned at the limit, with the caller's own sentence", async () => {
    staff("seat-0", "Alice");
    answer = () => new Promise<CliParsedResult>(() => {});

    const result = await bounded.dispatchToWorker("seat-0", "a task", ROOM);

    expect(result.result).toBe("");
    // `timeoutMessage` from the delegated path, so the seat is named.
    expect(result.error).toBe("Alice was stopped after 0s with no reply.");
  });

  it("gives the place back, so the room still takes work", async () => {
    staff("seat-0", "Alice");
    answer = () => new Promise<CliParsedResult>(() => {});
    // Five hangs in a row is more than the ceiling: if a timed-out run kept
    // its place, the room would be shut for good by the fourth.
    for (let i = 0; i < 5; i += 1) await bounded.dispatchToWorker("seat-0", "a task", ROOM);

    answer = async () => ({ text: "still working" });
    expect(await bounded.dispatchToWorker("seat-0", "one more", ROOM)).toEqual({
      result: "still working",
    });
  });

  /**
   * The request is abandoned rather than cancelled — the SDK takes no abort
   * signal — so the answer can still turn up long after nobody is waiting.
   * It must not give the place back a second time.
   *
   * The trick is to have other runs in flight when it lands. With the room
   * otherwise idle the count is already 0, `Math.max` clamps the second
   * decrement, and the fault is invisible — which is exactly how the same
   * mistake survived in the spawn path: it took the count from four to two
   * only when three other agents were working.
   */
  it("does not count a late answer out a second time", async () => {
    staff("seat-0", "Alice");
    // Only the first run's resolver is kept: every later call overwriting it
    // would land a filler instead, which frees a place quite legitimately and
    // tells us nothing.
    let landFirst: ((result: CliParsedResult) => void) | null = null;
    answer = () =>
      new Promise<CliParsedResult>((resolve) => {
        if (!landFirst) landFirst = resolve;
      });

    const timedOut = await bounded.dispatchToWorker("seat-0", "a task", ROOM);
    expect(timedOut.error).toContain("stopped after");

    // Four more, all still running, so the room is legitimately full.
    for (let i = 0; i < 4; i += 1) void bounded.dispatchToWorker("seat-0", "filling up", ROOM);
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Now the abandoned request finally answers. Counted out twice, this
    // frees a place that no run has finished with.
    landFirst!({ text: "sorry I am late" });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const fifth = await bounded.dispatchToWorker("seat-0", "one too many", ROOM);
    expect(fifth.error).toContain("Too many agents");
  });
});
