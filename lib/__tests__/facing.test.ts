import { describe, it, expect } from "vitest";
import { facingFor } from "../facing";

describe("which way a character faces", () => {
  it("takes the four straight directions as they are", () => {
    expect(facingFor(-1, 0)).toBe("left");
    expect(facingFor(1, 0)).toBe("right");
    expect(facingFor(0, -1)).toBe("up");
    expect(facingFor(0, 1)).toBe("down");
  });

  /**
   * The bug this exists for. A tapped route straight down still carries a
   * pixel or two of sideways drift, and taking horizontal whenever there was
   * any of it turned the walker side-on for the whole journey.
   */
  it("faces the way it is mostly going, not merely the way it is going a bit", () => {
    expect(facingFor(1.5, 40)).toBe("down");
    expect(facingFor(-1.5, -40)).toBe("up");
    expect(facingFor(40, 1.5)).toBe("right");
    expect(facingFor(-40, -1.5)).toBe("left");
  });

  /** Two keys held at once: a side view reads better than a back. */
  it("gives an exact diagonal to horizontal", () => {
    expect(facingFor(30, 30)).toBe("right");
    expect(facingFor(-30, 30)).toBe("left");
    expect(facingFor(30, -30)).toBe("right");
  });

  /**
   * Standing still decides nothing, which is what leaves someone who walked
   * left and stopped still looking left.
   */
  it("says nothing at all when nothing is moving", () => {
    expect(facingFor(0, 0)).toBeNull();
  });
});
