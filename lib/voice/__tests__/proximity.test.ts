import { describe, expect, it } from "vitest";
import { offers } from "../proximity";

describe("who offers", () => {
  it("is the lower id, and never oneself", () => {
    expect(offers("a1", "b2")).toBe(true);
    expect(offers("b2", "a1")).toBe(false);
    expect(offers("same", "same")).toBe(false);
  });
});
