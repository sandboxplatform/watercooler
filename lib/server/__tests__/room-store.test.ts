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

describe("the egg basket", () => {
  const at = (iso: string) => new Date(iso);

  it("tallies what somebody has found, by kind", () => {
    const store = new RoomStore(":memory:");
    store.collectEgg("coop", "Coop", "plain", "a", at("2026-01-01T09:00:00.000Z"));
    store.collectEgg("coop", "Coop", "plain", "b", at("2026-01-02T09:00:00.000Z"));
    store.collectEgg("coop", "Coop", "rainbow", "c", at("2026-01-03T09:00:00.000Z"));
    const tallies = store.eggTallies().filter((t) => t.person === "coop");
    expect(tallies.find((t) => t.tier === "plain")?.count).toBe(2);
    expect(tallies.find((t) => t.tier === "rainbow")?.count).toBe(1);
  });

  it("keeps two baskets apart", () => {
    const store = new RoomStore(":memory:");
    store.collectEgg("coop", "Coop", "jade", "a");
    store.collectEgg("guest:ann", "Ann", "jade", "b");
    const jade = store.eggTallies().filter((t) => t.tier === "jade");
    expect(jade.map((t) => t.person).sort()).toEqual(["coop", "guest:ann"]);
    expect(jade.every((t) => t.count === 1)).toBe(true);
  });

  /** The same egg twice is one egg: its id is the one it was laid with. */
  it("cannot be handed the same egg twice", () => {
    const store = new RoomStore(":memory:");
    store.collectEgg("coop", "Coop", "gilded", "the-same-egg");
    store.collectEgg("coop", "Coop", "gilded", "the-same-egg");
    expect(store.eggTallies().find((t) => t.person === "coop")?.count).toBe(1);
  });

  /**
   * A row should read without the roster, and somebody who has changed
   * their name reads as who they are now — which is SQLite's rule about a
   * bare column beside `MAX`, and worth pinning rather than assuming.
   */
  it("reports the name they found the latest one under", () => {
    const store = new RoomStore(":memory:");
    store.collectEgg("coop", "Chris", "copper", "a", at("2026-01-01T09:00:00.000Z"));
    store.collectEgg("coop", "Coop", "copper", "b", at("2026-02-01T09:00:00.000Z"));
    const tally = store.eggTallies().find((t) => t.person === "coop")!;
    expect(tally.name).toBe("Coop");
    expect(tally.latest).toBe("2026-02-01T09:00:00.000Z");
  });

  it("has nothing to say about a world where nobody has found one", () => {
    expect(new RoomStore(":memory:").eggTallies()).toEqual([]);
  });
});
