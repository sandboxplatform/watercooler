import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  FAILURE_HOLD_MS,
  OUTBOUND_TIMEOUT_MS,
  cachedFetch,
  forgetCached,
  outboundSignal,
} from "../outbound";

beforeEach(() => forgetCached());
afterEach(() => vi.useRealTimers());

describe("a held read", () => {
  it("is loaded once for everybody who asks while it is on its way", async () => {
    let calls = 0;
    let release!: (value: string) => void;
    const load = () => {
      calls += 1;
      return new Promise<string>((resolve) => (release = resolve));
    };
    const all = Promise.all([1, 2, 3].map(() => cachedFetch("k", 1000, load)));
    // The load starts on the next tick, never inside the call that asked.
    await Promise.resolve();
    release("board");
    const answers = await all;
    expect(calls).toBe(1);
    expect(answers.map((a) => a.value)).toEqual(["board", "board", "board"]);
  });

  it("is held for its time and then read again", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const load = async () => ++calls;
    expect((await cachedFetch("k", 1000, load)).value).toBe(1);
    expect((await cachedFetch("k", 1000, load)).value).toBe(1);
    vi.advanceTimersByTime(1001);
    expect((await cachedFetch("k", 1000, load)).value).toBe(2);
  });

  /**
   * A desk rate limiting us would otherwise be asked again by every browser
   * in the building the moment it said no.
   */
  it("holds a failure briefly, so the next caller is not another request", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const load = async () => {
      calls += 1;
      throw new Error("rate limited");
    };
    await expect(cachedFetch("k", 60_000, load)).rejects.toThrow("rate limited");
    await expect(cachedFetch("k", 60_000, load)).rejects.toThrow("rate limited");
    expect(calls).toBe(1);
    vi.advanceTimersByTime(FAILURE_HOLD_MS + 1);
    await expect(cachedFetch("k", 60_000, load)).rejects.toThrow("rate limited");
    expect(calls).toBe(2);
  });

  it("keeps two keys apart", async () => {
    const a = await cachedFetch("a", 1000, async () => "a");
    const b = await cachedFetch("b", 1000, async () => "b");
    expect([a.value, b.value]).toEqual(["a", "b"]);
  });

  it("gives up on an outbound request rather than waiting for ever", () => {
    expect(OUTBOUND_TIMEOUT_MS).toBe(10_000);
    expect(outboundSignal()).toBeInstanceOf(AbortSignal);
  });
});
