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

  it("gives Icebreaker only to the first person to speak", () => {
    expect(rules.onPlayerSpoke(ROOM, "Robert", "room", true).map((a) => a.code)).toContain(
      "icebreaker",
    );
    expect(rules.onPlayerSpoke(ROOM, "Priya", "room", false).map((a) => a.code)).not.toContain(
      "icebreaker",
    );
  });

  it("gives Whisperer for talking to people nearby", () => {
    expect(rules.onPlayerSpoke(ROOM, "Robert", "nearby", false).map((a) => a.code)).toEqual([
      "whisperer",
    ]);
  });

  it("gives Full House to everyone present", () => {
    const earned = rules.onRoomFull(ROOM, ["Ann", "Ben", "Cara", "Dan"]);
    expect(earned.map((a) => a.subjectName).sort()).toEqual(["Ann", "Ben", "Cara", "Dan"]);
  });
});

describe("the catalogue", () => {
  it("rewards no badge for sheer volume", () => {
    // Every entry must key on a moment — turning up, speaking first, being
    // here when the room filled — rather than on a tally anybody can grind.
    const volumeWords = /\b(100|50|ten|hundred|many|most|volume)\b/i;
    const offenders = ACHIEVEMENTS.filter((a) => volumeWords.test(a.description));
    expect(offenders.map((a) => a.code)).toEqual([]);
  });

  it("has unique codes and resolves them", () => {
    const codes = ACHIEVEMENTS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(achievementFor(code)?.code).toBe(code);
  });
});
