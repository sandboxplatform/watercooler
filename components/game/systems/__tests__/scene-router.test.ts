import { describe, expect, it } from "vitest";
import { destinationFor } from "../scene-router";

/**
 * Which scene an address names.
 *
 * The one reading of the address bar in the game layer, and now the only
 * thing that decides a place: every move between rooms pushes a URL and
 * lets this answer. It was three separate answers before — `EntryScene` at
 * boot, the office restarting itself for the lift, and a page load for
 * everything else — and the third was what made walking through a front
 * door cost a reconnection.
 */
describe("the place an address names", () => {
  it("sends /world to the world map", () => {
    expect(destinationFor({ pathname: "/world" }, {})).toEqual({
      key: "WorldScene",
      data: { from: undefined, walkIn: undefined },
    });
  });

  it("sends a campus address to the campus, naming which", () => {
    expect(destinationFor({ pathname: "/campus/homestar" }, {})).toEqual({
      key: "CampusScene",
      data: { campus: "homestar", from: undefined },
    });
  });

  it("sends the volcano and its cave to the one scene, naming which", () => {
    expect(destinationFor({ pathname: "/volcano" }, {})).toEqual({
      key: "VolcanoScene",
      data: { place: "island", from: undefined },
    });
    expect(destinationFor({ pathname: "/volcano/cave" }, { from: "volcano" })).toEqual({
      key: "VolcanoScene",
      data: { place: "cave", from: "volcano" },
    });
  });

  it("sends a lobby and a floor alike to the office", () => {
    expect(destinationFor({ pathname: "/r/sandbox-erp" }, {}).key).toBe("OfficeScene");
    expect(destinationFor({ pathname: "/r/sandbox-erp/floor/3" }, {}).key).toBe("OfficeScene");
  });

  /**
   * The root is a room too — the default one. It is the welcome screen that
   * moves somebody off it, not this.
   */
  it("sends the bare app to the office", () => {
    expect(destinationFor({ pathname: "/" }, {}).key).toBe("OfficeScene");
  });

  /**
   * The half a URL cannot carry. Out of doors the door you came out of is
   * the difference between standing on your own building's path and being
   * put down on the road like a stranger.
   */
  it("carries the place just left out to the map", () => {
    expect(destinationFor({ pathname: "/world" }, { from: "sandbox-erp" })).toEqual({
      key: "WorldScene",
      data: { from: "sandbox-erp", walkIn: undefined },
    });
  });

  it("carries a first arrival's walk in", () => {
    expect(destinationFor({ pathname: "/world" }, { walkIn: true }).data).toEqual({
      from: undefined,
      walkIn: true,
    });
  });

  /** A campus nobody named is not a campus; the office is the fallback. */
  it("does not read a malformed campus address as a campus", () => {
    expect(destinationFor({ pathname: "/campus/" }, {}).key).toBe("OfficeScene");
  });
});
