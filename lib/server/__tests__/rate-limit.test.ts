import { describe, expect, it } from "vitest";
import {
  ConnectionLimiter,
  KIND_BUDGETS,
  RATE_ABUSE_DROPS,
  RATE_BURST,
  RATE_SUSTAINED_PER_S,
  TokenBucket,
} from "../rate-limit";

/** A clock the test moves by hand. */
function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("a token bucket", () => {
  it("spends its burst, then refills at its rate", () => {
    const time = clock();
    const bucket = new TokenBucket(3, 2, time.now);
    expect([bucket.take(), bucket.take(), bucket.take(), bucket.take()]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    time.advance(500);
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(false);
  });

  it("never banks more than its burst, however long it waits", () => {
    const time = clock();
    const bucket = new TokenBucket(2, 10, time.now);
    time.advance(60_000);
    expect([bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, false]);
  });
});

describe("a connection's allowance", () => {
  it("lets an honest client's rate through for as long as it keeps it up", () => {
    const time = clock();
    const limiter = new ConnectionLimiter(time.now);
    // A move and a paddle position twenty times a second each, for a minute.
    for (let tick = 0; tick < 20 * 60; tick++) {
      expect(limiter.admit()).toBe("ok");
      expect(limiter.admit()).toBe("ok");
      time.advance(50);
    }
  });

  it("drops what is past the burst, and closes on a flood that goes on", () => {
    const time = clock();
    const limiter = new ConnectionLimiter(time.now);
    for (let i = 0; i < RATE_BURST; i++) expect(limiter.admit()).toBe("ok");
    expect(limiter.admit()).toBe("drop");
    let verdict = "drop";
    for (let i = 0; i < RATE_ABUSE_DROPS && verdict !== "abuse"; i++) verdict = limiter.admit();
    expect(verdict).toBe("abuse");
    expect(RATE_SUSTAINED_PER_S).toBeGreaterThanOrEqual(40);
  });

  it("forgives a burst of drops once the window has passed", () => {
    const time = clock();
    const limiter = new ConnectionLimiter(time.now);
    for (let i = 0; i < RATE_BURST + RATE_ABUSE_DROPS - 1; i++) limiter.admit();
    time.advance(11_000);
    for (let i = 0; i < RATE_BURST; i++) expect(limiter.admit()).toBe("ok");
    expect(limiter.admit()).toBe("drop");
  });

  it("allows one clear of the board every thirty seconds", () => {
    const time = clock();
    const limiter = new ConnectionLimiter(time.now);
    expect(limiter.admitKind("board-clear")).toBe("ok");
    expect(limiter.admitKind("board-clear")).toBe("drop");
    time.advance(29_000);
    expect(limiter.admitKind("board-clear")).toBe("drop");
    time.advance(1_000);
    expect(limiter.admitKind("board-clear")).toBe("ok");
  });

  it("keeps each dear kind's budget apart from the others", () => {
    const time = clock();
    const limiter = new ConnectionLimiter(time.now);
    for (let i = 0; i < KIND_BUDGETS.mic.burst; i++) expect(limiter.admitKind("mic")).toBe("ok");
    expect(limiter.admitKind("mic")).toBe("drop");
    expect(limiter.admitKind("meeting")).toBe("ok");
  });
});
