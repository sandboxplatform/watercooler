import { describe, it, expect, beforeEach } from "vitest";
import { RoomStore } from "../room-store";

const ROOM = "test-room";

let store: RoomStore;
beforeEach(() => {
  store = new RoomStore(":memory:");
});

describe("snapshots", () => {
  it("returns an empty world for a room that has never been used", () => {
    expect(store.getSnapshot("brand-new")).toEqual({ seats: [] });
  });

  it("round-trips seats", () => {
    store.replaceSeats(ROOM, [{ seatId: "seat-0", label: "Alice", roleTitle: "QA" }]);

    const snapshot = store.getSnapshot(ROOM);
    expect(snapshot.seats).toEqual([{ seatId: "seat-0", label: "Alice", roleTitle: "QA" }]);
  });

  it("keeps rooms isolated from each other", () => {
    store.replaceSeats("room-a", [{ seatId: "seat-0", label: "Ann" }]);
    store.replaceSeats("room-b", [{ seatId: "seat-0", label: "Ben" }]);

    expect(store.getSnapshot("room-a").seats).toEqual([{ seatId: "seat-0", label: "Ann" }]);
    expect(store.getSnapshot("room-b").seats).toEqual([{ seatId: "seat-0", label: "Ben" }]);
  });
});

describe("replacement semantics", () => {
  it("replaces a slice rather than merging into it", () => {
    store.replaceSeats(ROOM, [{ seatId: "seat-0" }, { seatId: "seat-1" }]);
    store.replaceSeats(ROOM, [{ seatId: "seat-2" }]);

    const ids = store.getSnapshot(ROOM).seats.map((s) => (s as { seatId: string }).seatId);
    expect(ids).toEqual(["seat-2"]);
  });

  it("skips rows with no id instead of failing the whole write", () => {
    store.replaceSeats(ROOM, [{ seatId: "seat-0" }, { label: "no id here" }, { seatId: "seat-1" }]);

    const ids = store.getSnapshot(ROOM).seats.map((s) => (s as { seatId: string }).seatId);
    expect(ids).toEqual(["seat-0", "seat-1"]);
  });
});

describe("per-entity writes", () => {
  it("upserts a seat so renaming crew is one small write", () => {
    // The reason these exist: with whole-slice writes, a second person
    // editing at the same time would send a list missing this change and
    // erase it.
    store.upsertSeat(ROOM, { seatId: "seat-0", label: "Alice" });
    store.upsertSeat(ROOM, { seatId: "seat-1", label: "Bob" });
    store.upsertSeat(ROOM, { seatId: "seat-0", label: "Carol" });

    const seats = store.getSnapshot(ROOM).seats as Record<string, unknown>[];
    expect(seats).toHaveLength(2);
    expect(seats.find((s) => s.seatId === "seat-0")?.label).toBe("Carol");
  });

  it("ignores writes with no id rather than throwing", () => {
    expect(() => store.upsertSeat(ROOM, { label: "nameless" })).not.toThrow();
    expect(store.getSnapshot(ROOM).seats).toEqual([]);
  });
});

describe("people", () => {
  it("remembers who calls a building home, in the order they arrived", () => {
    const store = new RoomStore(":memory:");
    store.upsertPerson({ id: "ab12cd34", name: "Robert", home: "castle-atlantic" });
    store.upsertPerson({ id: "ef56gh78", name: "Alice", home: "castle-atlantic" });
    store.upsertPerson({ id: "ij90kl12", name: "Sam", home: "sandbox-erp" });
    expect(store.listPeople("castle-atlantic").map((p) => p.name)).toEqual(["Robert", "Alice"]);
    expect(store.listPeople("sandbox-erp").map((p) => p.name)).toEqual(["Sam"]);
  });

  it("moves a person who changes their name or home, keeping their place", () => {
    const store = new RoomStore(":memory:");
    store.upsertPerson({ id: "ab12cd34", name: "Robert", home: "castle-atlantic" });
    store.upsertPerson({ id: "ef56gh78", name: "Alice", home: "castle-atlantic" });
    store.upsertPerson({ id: "ab12cd34", name: "Bob", home: "castle-atlantic" });
    expect(store.listPeople("castle-atlantic").map((p) => p.name)).toEqual(["Bob", "Alice"]);
    store.upsertPerson({ id: "ab12cd34", name: "Bob", home: "sandbox-erp" });
    expect(store.listPeople("castle-atlantic").map((p) => p.name)).toEqual(["Alice"]);
  });
});
