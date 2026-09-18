import { describe, it, expect, beforeEach } from "vitest";
import { RoomStore, LIMITS } from "../room-store";

const ROOM = "test-room";

function message(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    role: "player",
    content: `said ${id}`,
    timestamp: "2026-08-20T00:00:00.000Z",
    ...extra,
  };
}

let store: RoomStore;
beforeEach(() => {
  store = new RoomStore(":memory:");
});

describe("snapshots", () => {
  it("returns an empty world for a room that has never been used", () => {
    expect(store.getSnapshot("brand-new")).toEqual({ messages: [], seats: [] });
  });

  it("round-trips messages and seats", () => {
    store.replaceMessages(ROOM, [message("m1")]);
    store.replaceSeats(ROOM, [{ seatId: "seat-0", label: "Alice", roleTitle: "QA" }]);

    const snapshot = store.getSnapshot(ROOM);
    expect(snapshot.messages).toEqual([message("m1")]);
    expect(snapshot.seats).toEqual([{ seatId: "seat-0", label: "Alice", roleTitle: "QA" }]);
  });

  it("preserves the order the client sent", () => {
    // Order carries meaning: chat reads top to bottom
    store.replaceMessages(
      ROOM,
      ["m1", "m2", "m3"].map((id) => message(id)),
    );
    const ids = store.getSnapshot(ROOM).messages.map((m) => (m as { id: string }).id);
    expect(ids).toEqual(["m1", "m2", "m3"]);
  });

  it("keeps rooms isolated from each other", () => {
    store.replaceMessages("room-a", [message("a1")]);
    store.replaceMessages("room-b", [message("b1")]);

    expect(store.getSnapshot("room-a").messages).toEqual([message("a1")]);
    expect(store.getSnapshot("room-b").messages).toEqual([message("b1")]);
  });
});

describe("replacement semantics", () => {
  it("replaces a slice rather than merging into it", () => {
    store.replaceMessages(ROOM, [message("m1"), message("m2")]);
    store.replaceMessages(ROOM, [message("m3")]);

    const ids = store.getSnapshot(ROOM).messages.map((m) => (m as { id: string }).id);
    expect(ids).toEqual(["m3"]);
  });

  it("writing one slice leaves the others alone", () => {
    store.replaceMessages(ROOM, [message("m1")]);
    store.replaceSeats(ROOM, [{ seatId: "seat-0", label: "Alice" }]);

    store.replaceMessages(ROOM, []);

    expect(store.getSnapshot(ROOM).messages).toEqual([]);
    expect(store.getSnapshot(ROOM).seats).toHaveLength(1);
  });

  it("skips rows with no id instead of failing the whole write", () => {
    store.replaceMessages(ROOM, [message("m1"), { content: "no id here" }, message("m2")]);

    const ids = store.getSnapshot(ROOM).messages.map((m) => (m as { id: string }).id);
    expect(ids).toEqual(["m1", "m2"]);
  });
});

describe("limits", () => {
  it("keeps the newest messages when over the cap", () => {
    const many = Array.from({ length: LIMITS.messages + 20 }, (_, i) => message(`m${i}`));
    store.replaceMessages(ROOM, many);

    const stored = store.getSnapshot(ROOM).messages;
    expect(stored).toHaveLength(LIMITS.messages);
    // Chat is trimmed from the front, so the last message must survive
    expect((stored[stored.length - 1] as { id: string }).id).toBe(`m${LIMITS.messages + 19}`);
  });
});

describe("per-entity writes", () => {
  it("appends messages in the order they arrive", () => {
    // The reason these exist: with whole-slice writes, a second player
    // speaking at the same time would send a list missing this line and
    // erase it.
    store.appendMessage(ROOM, message("m1"));
    store.appendMessage(ROOM, message("m2"));
    store.appendMessage(ROOM, message("m3"));

    const ids = store.getSnapshot(ROOM).messages.map((m) => (m as { id: string }).id);
    expect(ids).toEqual(["m1", "m2", "m3"]);
  });

  it("does not duplicate a message that is sent twice", () => {
    store.appendMessage(ROOM, message("m1"));
    store.appendMessage(ROOM, message("m1", { content: "edited" }));

    const stored = store.getSnapshot(ROOM).messages as Record<string, unknown>[];
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe("edited");
  });

  it("trims the oldest chat once past the cap", () => {
    for (let i = 0; i < LIMITS.messages + 5; i++) {
      store.appendMessage(ROOM, message(`m${i}`));
    }

    const ids = store.getSnapshot(ROOM).messages.map((m) => (m as { id: string }).id);
    expect(ids).toHaveLength(LIMITS.messages);
    expect(ids[0]).toBe("m5");
    expect(ids.at(-1)).toBe(`m${LIMITS.messages + 4}`);
  });

  it("upserts a seat so renaming crew is one small write", () => {
    store.upsertSeat(ROOM, { seatId: "seat-0", label: "Alice" });
    store.upsertSeat(ROOM, { seatId: "seat-1", label: "Bob" });
    store.upsertSeat(ROOM, { seatId: "seat-0", label: "Carol" });

    const seats = store.getSnapshot(ROOM).seats as Record<string, unknown>[];
    expect(seats).toHaveLength(2);
    expect(seats.find((s) => s.seatId === "seat-0")?.label).toBe("Carol");
  });

  it("ignores writes with no id rather than throwing", () => {
    expect(() => store.appendMessage(ROOM, { content: "nameless" })).not.toThrow();
    expect(() => store.upsertSeat(ROOM, { label: "nameless" })).not.toThrow();
    expect(store.getSnapshot(ROOM).messages).toEqual([]);
  });

  it("knows whether anybody has spoken, for the icebreaker badge", () => {
    expect(store.hasSpoken(ROOM)).toBe(false);
    store.appendMessage(ROOM, message("m1"));
    expect(store.hasSpoken(ROOM)).toBe(true);
  });

  it("files a remark with no role as a person, because there is no other kind", () => {
    // The browser stopped sending `role` when the agents went. Falling back to
    // "system" would file every remark as machinery — hidden from the room's
    // own history, and invisible to the badge above.
    store.appendMessage(ROOM, { id: "m1", content: "morning", actorName: "Ann" });
    expect(store.hasSpoken(ROOM)).toBe(true);
    expect(store.getSnapshot(ROOM).messages).toHaveLength(1);
  });
});

describe("a room that used to run agents", () => {
  /** Rows as the agent build left them, written straight in. */
  function withTranscript() {
    store.appendMessage(ROOM, { id: "said-1", role: "player", content: "morning" });
    store.appendMessage(ROOM, { id: "c1", role: "user", content: "Reply with: pineapple" });
    store.appendMessage(ROOM, { id: "c2", role: "assistant", content: "pineapple" });
    store.appendMessage(ROOM, { id: "c3", role: "system", content: "Task failed" });
    store.appendMessage(ROOM, { id: "c4", role: "tool", content: "{}" });
  }

  it("hands back what people said and nothing else", () => {
    // The transcript carries no speaker this build understands, so every line
    // of it came back labelled as the reader's own words.
    withTranscript();
    const ids = store.getSnapshot(ROOM).messages.map((m) => (m as { id: string }).id);
    expect(ids).toEqual(["said-1"]);
  });

  it("keeps a remark that arrived among the transcript, wherever it sits", () => {
    // The filter is on who spoke, not on where the row landed: a room that
    // was talked in while agents ran has the two interleaved.
    store.appendMessage(ROOM, { id: "c1", role: "assistant", content: "working" });
    store.appendMessage(ROOM, { id: "said-1", role: "player", content: "morning" });
    store.appendMessage(ROOM, { id: "c2", role: "tool", content: "{}" });
    store.appendMessage(ROOM, { id: "said-2", role: "player", content: "afternoon" });

    const ids = store.getSnapshot(ROOM).messages.map((m) => (m as { id: string }).id);
    expect(ids).toEqual(["said-1", "said-2"]);
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
