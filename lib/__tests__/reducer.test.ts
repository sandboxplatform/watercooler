import { describe, it, expect, beforeEach } from "vitest";
import { reducer, initialState, mergeDiscoveredSeats } from "../reducer";
import type { StudioSnapshot, SeatState } from "@/types/game";
import type { SeatDef } from "@/components/game/utils/MapHelpers";
import type { PersistedSeatConfig } from "@/lib/persistence";

// ── Factory helpers ─────────────────────────────────────────

function makeSeat(overrides: Partial<SeatState> = {}): SeatState {
  return {
    seatId: "seat-1",
    label: "Alice",
    assigned: true,
    spawnX: 100,
    spawnY: 200,
    spawnFacing: "down",
    ...overrides,
  };
}

function makeState(overrides: Partial<StudioSnapshot> = {}): StudioSnapshot {
  return { ...initialState, ...overrides };
}

function makeDiscoveredSeat(overrides: Partial<SeatDef> = {}): SeatDef {
  return {
    seatId: "seat-1",
    x: 100,
    y: 200,
    facing: "down",
    index: 0,
    ...overrides,
  };
}

function makePersistedConfig(overrides: Partial<PersistedSeatConfig> = {}): PersistedSeatConfig {
  return {
    seatId: "seat-1",
    label: "Custom Label",
    assigned: true,
    spriteKey: "char_01",
    spritePath: "/chars/01.png",
    ...overrides,
  };
}

// ── Helper function tests ───────────────────────────────────

describe("mergeDiscoveredSeats", () => {
  it("creates seats from discovered definitions with defaults", () => {
    const discovered = [makeDiscoveredSeat({ seatId: "s1", index: 0 })];
    const result = mergeDiscoveredSeats(discovered, [], []);
    expect(result).toHaveLength(1);
    expect(result[0].seatId).toBe("s1");
    expect(result[0].spawnX).toBe(100);
    expect(result[0].spawnY).toBe(200);
    expect(result[0].spawnFacing).toBe("down");
  });

  it("applies stored config overrides", () => {
    const discovered = [makeDiscoveredSeat({ seatId: "s1", index: 0 })];
    const stored = [
      makePersistedConfig({
        seatId: "s1",
        label: "My Custom Seat",
        roleTitle: "Architect",
        assigned: true,
      }),
    ];
    const result = mergeDiscoveredSeats(discovered, stored, []);
    expect(result[0].label).toBe("My Custom Seat");
    expect(result[0].roleTitle).toBe("Architect");
  });

  it("falls back to what the room already shows when nothing is stored", () => {
    // The map is re-read on every room change; a rename made in this browser
    // and not yet written back must not be lost on the way through.
    const discovered = [makeDiscoveredSeat({ seatId: "s1", index: 0 })];
    const current = [makeSeat({ seatId: "s1", label: "Renamed", roleTitle: "QA" })];
    const result = mergeDiscoveredSeats(discovered, [], current);
    expect(result[0].label).toBe("Renamed");
    expect(result[0].roleTitle).toBe("QA");
  });

  it("unassigned seats have no spriteKey/spritePath", () => {
    const discovered = [makeDiscoveredSeat({ seatId: "s1", index: 0 })];
    const stored = [makePersistedConfig({ seatId: "s1", assigned: false })];
    const result = mergeDiscoveredSeats(discovered, stored, []);
    expect(result[0].assigned).toBe(false);
    expect(result[0].spriteKey).toBeUndefined();
    expect(result[0].spritePath).toBeUndefined();
  });

  it("takes the position from the map rather than from what was stored", () => {
    const discovered = [makeDiscoveredSeat({ seatId: "s1", x: 640, y: 480, facing: "left" })];
    const result = mergeDiscoveredSeats(discovered, [makePersistedConfig({ seatId: "s1" })], []);
    expect(result[0].spawnX).toBe(640);
    expect(result[0].spawnY).toBe(480);
    expect(result[0].spawnFacing).toBe("left");
  });
});

// ── Reducer action tests ────────────────────────────────────

describe("reducer", () => {
  let state: StudioSnapshot;

  beforeEach(() => {
    state = makeState();
  });

  describe("initialState", () => {
    it("has expected defaults", () => {
      expect(initialState.seats).toEqual([]);
    });
  });

  describe("SYNC_SEATS", () => {
    it("replaces the roster outright", () => {
      const seats = [makeSeat({ seatId: "s1" }), makeSeat({ seatId: "s2" })];
      const next = reducer(state, { type: "SYNC_SEATS", seats });
      expect(next.seats).toBe(seats);
    });
  });

  describe("UPDATE_SEAT_CONFIG", () => {
    it("patches the named seat and leaves the others alone", () => {
      const withSeats = makeState({
        seats: [makeSeat({ seatId: "s1" }), makeSeat({ seatId: "s2", label: "Bob" })],
      });
      const next = reducer(withSeats, {
        type: "UPDATE_SEAT_CONFIG",
        seatId: "s1",
        patch: { label: "Carol" },
      });
      expect(next.seats[0].label).toBe("Carol");
      expect(next.seats[1].label).toBe("Bob");
    });

    it("ignores a seat id the room does not have", () => {
      const withSeats = makeState({ seats: [makeSeat({ seatId: "s1" })] });
      const next = reducer(withSeats, {
        type: "UPDATE_SEAT_CONFIG",
        seatId: "nobody",
        patch: { label: "Carol" },
      });
      expect(next.seats[0].label).toBe("Alice");
    });

    it("strips the crew from a seat being emptied, but keeps its name", () => {
      // A vacant seat is still a desk in the room; it just has nobody at it.
      const withSeats = makeState({
        seats: [
          makeSeat({
            seatId: "s1",
            roleTitle: "QA",
            spriteKey: "char_01",
            spritePath: "/chars/01.png",
          }),
        ],
      });
      const next = reducer(withSeats, {
        type: "UPDATE_SEAT_CONFIG",
        seatId: "s1",
        patch: { assigned: false },
      });
      expect(next.seats[0].label).toBe("Alice");
      expect(next.seats[0].roleTitle).toBeUndefined();
      expect(next.seats[0].spriteKey).toBeUndefined();
      expect(next.seats[0].spritePath).toBeUndefined();
    });
  });

  describe("an action it does not know", () => {
    it("hands back the state it was given", () => {
      const next = reducer(state, { type: "NOT_A_THING" } as never);
      expect(next).toBe(state);
    });
  });
});
