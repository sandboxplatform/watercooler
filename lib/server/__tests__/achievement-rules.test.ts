import { describe, it, expect, beforeEach, vi } from "vitest";
import { ACHIEVEMENTS, achievementFor } from "../../achievements";
import { RoomStore } from "../room-store";

const ROOM = "badge-room";
let store: RoomStore;

vi.mock("../room-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../room-store")>();
  return { ...actual, getRoomStore: () => store };
});

const rules = await import("../achievement-rules");

beforeEach(() => {
  store = new RoomStore(":memory:");
});

describe("human badges", () => {
  it("gives Walked In once, however many times you return", () => {
    expect(rules.onPlayerJoined(ROOM, "Robert").map((a) => a.code)).toEqual(["walked-in"]);
    expect(rules.onPlayerJoined(ROOM, "Robert")).toEqual([]);
  });

  it("gives Full House to everyone present", () => {
    const earned = rules.onRoomFull(ROOM, ["Ann", "Ben", "Cara", "Dan"]);
    expect(earned.map((a) => a.subjectName).sort()).toEqual(["Ann", "Ben", "Cara", "Dan"]);
  });
});

describe("the catalogue", () => {
  it("rewards no badge for sheer volume", () => {
    // Every entry must key on a moment — turning up, being here when the
    // room filled — rather than on a tally anybody can grind.
    const volumeWords = /\b(100|50|ten|hundred|many|most|volume)\b/i;
    const offenders = ACHIEVEMENTS.filter((a) => volumeWords.test(a.description));
    expect(offenders.map((a) => a.code)).toEqual([]);
  });

  it("has unique codes and resolves them", () => {
    const codes = ACHIEVEMENTS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(achievementFor(code)?.code).toBe(code);
  });

  it("offers no badge nobody can earn", () => {
    // Chat went, and the two badges it was the only way to earn went with
    // it. A badge in the list with nothing left that grants it reads as
    // something still to find, and there is nothing to find.
    const granted = new Set([
      ...rules.onPlayerJoined("dead-letter", "Robert").map((a) => a.code),
      ...rules.onRoomFull("dead-letter-2", ["Ann"]).map((a) => a.code),
    ]);
    expect(ACHIEVEMENTS.map((a) => a.code).filter((code) => !granted.has(code))).toEqual([]);
  });
});
