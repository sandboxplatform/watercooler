import { describe, it, expect } from "vitest";
import { FIXTURES, FIXTURE_ART, fixture } from "../fixtures";
import type { FixtureId } from "../fixtures";

/**
 * The registry has to be coherent, and nothing about it is checked by the
 * game running: a fixture with the wrong parameter or a regex that catches
 * somebody else's furniture looks perfectly correct on screen.
 *
 * This is the file that would have caught the whiteboard and the project
 * board both claiming `?board=1`. Every panel is mounted in every room, so
 * one parameter opened the two of them stacked on each other, and neither
 * the types nor the suite had anything to say about it.
 */

/**
 * Every point of interest the generated maps carry, from
 * `node -e` over `public/maps/*.json` — which is to say, everything
 * `pnpm build:map` writes out of `lib/map/`. A literal rather than a read
 * of the files, so `pnpm test:changed` still selects this test when the
 * registry changes.
 */
const POI_NAMES = [
  "Arcade cabinet",
  "Bookshelf 2",
  "Bookshelf 3",
  "Bookshelf 4",
  "Cauldron",
  "Help desk",
  "Help desk counter",
  "Pinball machine",
  "Ping pong table",
  "Project board",
  "Sofa",
  "Water bucket",
  "Water dispenser 1",
  "Water dispenser 2",
  "Whiteboard",
  "Whiteboard 1",
  "Whiteboard 2",
  "Workbench1",
  "printer",
];

/**
 * Every id in the union, as a record so TypeScript checks it is every one.
 * Adding a fixture id without an entry in `FIXTURES` is then a type error
 * here rather than a lookup that comes back empty at runtime — which is
 * what lets `fixture()` promise a spec instead of a spec-or-null.
 */
const EVERY_ID: Record<FixtureId, true> = {
  whiteboard: true,
  pingpong: true,
  pinball: true,
  arcade: true,
  "project-board": true,
  "help-desk": true,
};

const claimants = (name: string) => FIXTURES.filter((f) => f.match.test(name)).map((f) => f.id);

describe("the fixture registry", () => {
  it("gives every fixture its own id", () => {
    const ids = FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every fixture its own query parameter", () => {
    // The ?board=1 collision: two panels, one parameter, both opened.
    const params = FIXTURES.map((f) => f.param);
    expect(new Set(params).size).toBe(params.length);
  });

  it("pairs each open event with a close event", () => {
    for (const f of FIXTURES) {
      expect(f.opens, f.id).toMatch(/^open-/);
      expect(f.closes, f.id).toMatch(/-closed$/);
      expect(f.opens).not.toBe(f.closes);
    }
  });

  it("uses each pair of events once", () => {
    const events = FIXTURES.flatMap((f) => [f.opens, f.closes]);
    expect(new Set(events).size).toBe(events.length);
  });

  it("loads each piece of art under its own key", () => {
    const keys = FIXTURE_ART.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const art of FIXTURE_ART) expect(art.file, art.key).toMatch(/^\/sprites\//);
  });

  it("asks for a distance and says something", () => {
    for (const f of FIXTURES) {
      expect(f.radius, f.id).toBeGreaterThan(0);
      expect(f.prompt, f.id).not.toBe("");
    }
  });

  it("looks up by id", () => {
    for (const f of FIXTURES) expect(fixture(f.id)).toBe(f);
  });

  it("has an entry for every id in the union", () => {
    // usePanel and FixtureManager both take a spec's word for what a panel's
    // events and parameter are, so an id with no entry is not an option.
    for (const id of Object.keys(EVERY_ID) as FixtureId[]) {
      expect(fixture(id).id, id).toBe(id);
    }
  });
});

describe("what each fixture claims off the map", () => {
  it("never lets two fixtures claim one point of interest", () => {
    // A room's point of interest is one thing. Two fixtures matching it
    // would both stand art on it and both prompt from it.
    for (const name of POI_NAMES) {
      expect(claimants(name).length, name).toBeLessThanOrEqual(1);
    }
  });

  it("claims the things it is meant to", () => {
    expect(claimants("Whiteboard")).toEqual(["whiteboard"]);
    expect(claimants("Whiteboard 1")).toEqual(["whiteboard"]);
    expect(claimants("Water bucket")).toEqual(["pingpong"]);
    expect(claimants("Ping pong table")).toEqual(["pingpong"]);
    expect(claimants("Cauldron")).toEqual(["pinball"]);
    expect(claimants("Pinball machine")).toEqual(["pinball"]);
    expect(claimants("Arcade cabinet")).toEqual(["arcade"]);
    expect(claimants("Project board")).toEqual(["project-board"]);
    expect(claimants("Help desk")).toEqual(["help-desk"]);
  });

  it("leaves the lobby's help desk counter alone", () => {
    // Anchored, not fuzzy. A loose match here drew the support-queue board
    // on top of the counter, which is a different thing in a different room.
    expect(claimants("Help desk counter")).toEqual([]);
  });

  it("claims none of the room's ordinary furniture", () => {
    for (const name of ["Sofa", "printer", "Bookshelf 2", "Water dispenser 1", "Workbench1"]) {
      expect(claimants(name), name).toEqual([]);
    }
  });

  it("hangs several boards but only one of everything else", () => {
    for (const f of FIXTURES) {
      if (f.id === "whiteboard") expect(f.many).toBe(true);
      else expect(f.many, f.id).toBeUndefined();
    }
  });
});
