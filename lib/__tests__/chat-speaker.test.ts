import { describe, expect, it } from "vitest";
import { speakerLabel } from "../chat-speaker";

const me = { id: "me-1", name: "Ann" };

describe("who a bubble is from", () => {
  it("calls this browser's own remark You", () => {
    expect(speakerLabel({ actorName: "Ann", authorId: "me-1" }, me)).toBe("You");
  });

  it("names another person's remark after them, not You", () => {
    expect(speakerLabel({ actorName: "Bob", authorId: "bob-2" }, me)).toBe("Bob");
    expect(speakerLabel({ authorId: "bob-2" }, me)).toBe("Someone");
  });

  it("still says You for an unsigned remark from before signing, and for a fresh id under the same name", () => {
    expect(speakerLabel({}, me)).toBe("You");
    expect(speakerLabel({ actorName: "Ann", authorId: "old-id" }, me)).toBe("You");
  });
});
