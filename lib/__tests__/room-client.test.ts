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
    saveRoomPatch({ seats: [] });
    expect(fetchMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(WRITE_DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("collapses a burst into a single request", () => {
    // The store persists on every reducer change; dragging a seat about must
    // not become a request per frame.
    for (let i = 0; i < 20; i++) saveRoomPatch({ seats: [{ seatId: `seat-${i}` }] as never });
    vi.advanceTimersByTime(WRITE_DEBOUNCE_MS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastWriteBody().seats).toEqual([{ seatId: "seat-19" }]);
  });

  it("starts a fresh batch after a write goes out", () => {
    saveRoomPatch({ seats: [{ seatId: "seat-0" }] as never });
    vi.advanceTimersByTime(WRITE_DEBOUNCE_MS);
    saveRoomPatch({ seats: [{ seatId: "seat-1" }] as never });
    vi.advanceTimersByTime(WRITE_DEBOUNCE_MS);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastWriteBody()).toEqual({ seats: [{ seatId: "seat-1" }] });
  });

  it("survives a failing request without throwing", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    saveRoomPatch({ seats: [] });
    vi.advanceTimersByTime(WRITE_DEBOUNCE_MS);
    await expect(flushRoomWrites()).resolves.toBeUndefined();
  });
});

describe("flushRoomWrites", () => {
  it("writes immediately instead of waiting out the debounce", async () => {
    saveRoomPatch({ seats: [{ seatId: "seat-0" }] as never });
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
    fetchMock.mockResolvedValueOnce(jsonResponse({ seats: [{ seatId: "seat-0" }] }));

    const snapshot = await fetchRoomSnapshot();
    expect(snapshot.seats).toEqual([{ seatId: "seat-0" }]);
  });

  it("fills in the slices the server left out", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    const snapshot = await fetchRoomSnapshot();
    expect(snapshot.seats).toEqual([]);
  });

  it("opens an empty room rather than throwing when the server is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(fetchRoomSnapshot()).resolves.toEqual({ seats: [] });
  });

  it("opens an empty room on a server error response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "boom" }, false, 500));
    const snapshot = await fetchRoomSnapshot();
    expect(snapshot.seats).toEqual([]);
  });
});
