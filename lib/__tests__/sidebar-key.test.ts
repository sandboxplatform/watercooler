import { describe, it, expect } from "vitest";
import { SIDEBAR_KEY, togglesSidebar, type SidebarKeyPress } from "../sidebar-key";

const press = (key: string, over: Partial<SidebarKeyPress> = {}): SidebarKeyPress => ({
  key,
  repeat: false,
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...over,
});

describe("the column's binding", () => {
  it("opens on tab", () => {
    expect(togglesSidebar(press(SIDEBAR_KEY), false)).toBe(true);
    expect(SIDEBAR_KEY).toBe("Tab");
  });

  it("ignores every other key", () => {
    for (const key of ["w", "ArrowUp", " ", "Escape", "Enter", "Shift"]) {
      expect(togglesSidebar(press(key), false), key).toBe(false);
    }
  });

  /** Held down, autorepeat would flicker the column open and shut. */
  it("fires once on a press, not on the autorepeat", () => {
    expect(togglesSidebar(press(SIDEBAR_KEY, { repeat: true }), false)).toBe(false);
  });

  /**
   * Shift+Tab walks focus backwards and the other three belong to the
   * browser and the desktop. Only the bare key is ours.
   */
  it("leaves a modified tab to whoever it belongs to", () => {
    for (const modifier of ["shiftKey", "ctrlKey", "altKey", "metaKey"] as const) {
      expect(togglesSidebar(press(SIDEBAR_KEY, { [modifier]: true }), false), modifier).toBe(false);
    }
  });

  /**
   * The one that matters in practice: tab is how anybody gets from one
   * control of a panel to the next, and a text field owns the keyboard
   * outright.
   */
  it("stays out of the way when something else has the keyboard", () => {
    expect(togglesSidebar(press(SIDEBAR_KEY), true)).toBe(false);
    expect(togglesSidebar(press(SIDEBAR_KEY, { repeat: true }), true)).toBe(false);
  });
});
