import { describe, it, expect } from "vitest";
import { SPRINT_KEY, togglesSprint } from "../sprint";

const press = (code: string, repeat = false) => ({ code, repeat });

describe("the sprint toggle's binding", () => {
  it("flips on left shift", () => {
    expect(togglesSprint(press(SPRINT_KEY), false)).toBe(true);
    expect(SPRINT_KEY).toBe("ShiftLeft");
  });

  /** Right shift keeps meaning what it usually means. */
  it("leaves the other shift alone", () => {
    expect(togglesSprint(press("ShiftRight"), false)).toBe(false);
  });

  it("ignores every other key", () => {
    for (const code of ["KeyW", "ArrowUp", "Space", "ControlLeft", "AltLeft", "Enter"]) {
      expect(togglesSprint(press(code), false), code).toBe(false);
    }
  });

  /** Held down, autorepeat would flicker between the two modes. */
  it("fires once on a press, not on the autorepeat", () => {
    expect(togglesSprint(press(SPRINT_KEY, true), false)).toBe(false);
  });

  /**
   * The one that matters in practice: shift over a letter is a capital, and
   * a toggle firing on it would flip the mode several times a sentence.
   */
  it("stays out of the way when something else has the keyboard", () => {
    expect(togglesSprint(press(SPRINT_KEY), true)).toBe(false);
    expect(togglesSprint(press(SPRINT_KEY, true), true)).toBe(false);
  });
});
