import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchRoomSnapshot,
  saveRoomPatch,
  flushRoomWrites,
  resetRoomWrites,
  WRITE_DEBOUNCE_MS,
} from "../room-client";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  resetRoomWrites();
  fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
});

function lastWriteBody() {
  const call = fetchMock.mock.calls.at(-1);
  return JSON.parse((call?.[1] as RequestInit).body as string);
}

describe("saveRoomPatch", () => {
  it("waits for the debounce before writing", () => {
    saveRoomPatch({ messages: [] });
    expect(fetchMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(WRITE_DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("collapses a burst into a single request", () => {
    // The store persists on every reducer change; a streaming reply must not
    // become a request per token.
    for (let i = 0; i < 20; i++) saveRoomPatch({ messages: [{ id: `m${i}` }] as never });
    vi.advanceTimersByTime(WRITE_DEBOUNCE_MS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastWriteBody().messages).toEqual([{ id: "m19" }]);
  });

  it("merges different slices queued together", () => {
    saveRoomPatch({ messages: [{ id: "m1" }] as never });
    saveRoomPatch({ seats: [{ seatId: "seat-0" }] as never });
    vi.advanceTimersByTime(WRITE_DEBOUNCE_MS);

    const body = lastWriteBody();
    expect(body.messages).toEqual([{ id: "m1" }]);
    expect(body.seats).toEqual([{ seatId: "seat-0" }]);
  });

  it("starts a fresh batch after a write goes out", () => {
    saveRoomPatch({ messages: [{ id: "m1" }] as never });
    vi.advanceTimersByTime(WRITE_DEBOUNCE_MS);
    saveRoomPatch({ seats: [{ seatId: "seat-1" }] as never });
    vi.advanceTimersByTime(WRITE_DEBOUNCE_MS);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastWriteBody()).toEqual({ seats: [{ seatId: "seat-1" }] });
  });

  it("survives a failing request without throwing", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    saveRoomPatch({ messages: [] });
    vi.advanceTimersByTime(WRITE_DEBOUNCE_MS);
    await expect(flushRoomWrites()).resolves.toBeUndefined();
  });
});

describe("flushRoomWrites", () => {
  it("writes immediately instead of waiting out the debounce", async () => {
    saveRoomPatch({ messages: [{ id: "m1" }] as never });
    await flushRoomWrites();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there is nothing queued", async () => {
    await flushRoomWrites();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchRoomSnapshot", () => {
  it("reads the room the server hands back", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ messages: [{ id: "m1" }], seats: [{ seatId: "seat-0" }] }),
    );

    const snapshot = await fetchRoomSnapshot();
    expect(snapshot.messages).toEqual([{ id: "m1" }]);
    expect(snapshot.seats).toEqual([{ seatId: "seat-0" }]);
  });

  it("fills in the slices the server left out", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [{ id: "m1" }] }));

    const snapshot = await fetchRoomSnapshot();
    expect(snapshot.seats).toEqual([]);
  });

  it("opens an empty room rather than throwing when the server is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(fetchRoomSnapshot()).resolves.toEqual({ messages: [], seats: [] });
  });

  it("opens an empty room on a server error response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "boom" }, false, 500));
    const snapshot = await fetchRoomSnapshot();
    expect(snapshot.messages).toEqual([]);
  });
});
