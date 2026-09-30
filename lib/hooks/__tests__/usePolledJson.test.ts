// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, settle } from "./render-hook";
import { usePolledJson } from "../usePolledJson";

/**
 * The board panels' read, held to the three things all four got wrong.
 *
 * Each would have looked fine from the wall: the right board does come up
 * in the end. What went wrong was the moment before — the last board still
 * showing under the new room's name, or an answer for the room you had
 * just left landing on top of the one you walked into.
 */

interface Pending {
  url: string;
  signal: AbortSignal;
  answer: (status: number, body: unknown) => void;
}

let pending: Pending[] = [];

beforeEach(() => {
  pending = [];
  globalThis.fetch = vi.fn(
    (url: string, init?: RequestInit) =>
      new Promise<Response>((resolve) => {
        pending.push({
          url,
          signal: init!.signal!,
          answer: (status, body) =>
            resolve({ status, json: async () => body } as unknown as Response),
        });
      }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("usePolledJson", () => {
  it("starts from nothing on a new address, and ignores the old one's answer", async () => {
    let url = "/api/trello?slot=1";
    const hook = renderHook(() => usePolledJson<{ n: number }>(url, { open: true, every: 0 }));
    await settle(() => pending[0].answer(200, { n: 1 }));
    expect(hook.current.data).toEqual({ n: 1 });

    url = "/api/trello?slot=2";
    hook.rerender();
    // The first room's board is not shown under the second's name.
    expect(hook.current.data).toBeNull();
    expect(hook.current.loading).toBe(true);

    const [, second] = pending;
    expect(second.url).toBe("/api/trello?slot=2");
    await settle(() => second.answer(200, { n: 2 }));
    expect(hook.current.data).toEqual({ n: 2 });
    hook.unmount();
  });

  it("drops an answer that lands after the address has moved on", async () => {
    let url = "/api/trello?slot=1";
    const hook = renderHook(() => usePolledJson<{ n: number }>(url, { open: true, every: 0 }));
    const [first] = pending;
    url = "/api/trello?slot=2";
    hook.rerender();
    expect(first.signal.aborted).toBe(true);
    // Slot 1's answer arriving late, after slot 2 was asked for.
    await settle(() => first.answer(200, { n: 1 }));
    expect(hook.current.data).toBeNull();
    await settle(() => pending[1].answer(200, { n: 2 }));
    expect(hook.current.data).toEqual({ n: 2 });
    hook.unmount();
  });

  it("aborts what is in flight when it closes, and opens again empty", async () => {
    let open = true;
    const hook = renderHook(() => usePolledJson<{ n: number }>("/api/zoho", { open, every: 0 }));
    await settle(() => pending[0].answer(200, { n: 1 }));

    open = false;
    hook.rerender();
    open = true;
    hook.rerender();
    expect(hook.current.data).toBeNull();
    expect(pending[1].signal.aborted).toBe(false);

    open = false;
    hook.rerender();
    expect(pending[1].signal.aborted).toBe(true);
    hook.unmount();
  });

  it("says a refusal is a refusal", async () => {
    const hook = renderHook(() => usePolledJson("/api/zoho", { open: true, every: 0 }));
    await settle(() => pending[0].answer(403, { error: "Not yours to read" }));
    expect(hook.current.denied).toBe(true);
    expect(hook.current.failed).toBe(false);
    hook.unmount();
  });
});
