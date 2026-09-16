import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  LIBRARY_CHARACTERS,
  LIBRARY_PREFIX,
  SHARED_CAST,
  generatedSheetPath,
  librarySheetPath,
  looksFor,
  mayWear,
  textureKeyFor,
} from "../library";
import { RESIDENTS } from "../../world/residents";

describe("the library roster", () => {
  it("lists every shipped worker and the boss", () => {
    expect(LIBRARY_CHARACTERS.length).toBeGreaterThanOrEqual(5);
    expect(LIBRARY_CHARACTERS.some((c) => c.key === "character_09")).toBe(true);
    // The residents keep their looks to themselves.
    for (const resident of RESIDENTS) {
      expect(
        LIBRARY_CHARACTERS.some((c) => c.key === resident.spriteKey),
        resident.name,
      ).toBe(false);
    }
    expect(LIBRARY_CHARACTERS.some((c) => c.name === "Coop")).toBe(true);
    for (const c of LIBRARY_CHARACTERS) {
      expect(c.id.startsWith(LIBRARY_PREFIX)).toBe(true);
      expect(c.source).toBe("library");
      expect(c.sheetUrl).toMatch(/^\/characters\/.+\.png$/);
      expect(c.portraitUrl).toBe(`/api/characters/${c.id}/portrait`);
    }
  });

  /**
   * The order is a decision, not an accident of how WORKER_SPRITES happens to
   * be written — appending a new sheet there must not reshuffle the picker.
   */
  it("offers the premade cast and the boss before the built likenesses", () => {
    const names = LIBRARY_CHARACTERS.map((c) => c.name);
    // Doc's sheet is here on disk but not on this list: he became a resident,
    // and a resident's look is reserved to them.
    expect(names).toEqual(["Alice", "Bob", "Carol", "Dave", "The Boss", "Coop", "Rob", "Hunter"]);
  });

  /**
   * A visitor came in on a code that was passed around. Every likeness built
   * from a delivered sheet belongs to the person it is of, and no visitor may
   * put one on — which is not a list anybody keeps: the shared cast is the
   * premade sheets and the boss, so a new likeness is out of a visitor's
   * picker the moment it is added to WORKER_SPRITES.
   */
  it("offers a visitor the shared cast only, never a likeness", () => {
    expect(SHARED_CAST.map((c) => c.name)).toEqual(["Alice", "Bob", "Carol", "Dave", "The Boss"]);
    expect(SHARED_CAST.some((c) => ["Coop", "Rob", "Hunter"].includes(c.name))).toBe(false);
    expect(looksFor(null)).toEqual(SHARED_CAST);
    expect(mayWear(null, "character_02")).toBe(true);
    expect(mayWear(null, "character_09")).toBe(true);
    expect(mayWear(null, "character_coop")).toBe(false);
    expect(mayWear(null, "character_rob")).toBe(false);
    expect(mayWear(null, "character_hunter")).toBe(false);
  });

  /**
   * The other half of the same rule. A visitor may not put Coop's face on,
   * and neither may Coop put on Rob's: his own code names his sheet, so that
   * sheet is the whole of what he may wear and the picker has nothing to
   * offer him. Held here rather than in the HUD, because hiding the button
   * is decoration — this is what the roster route and the presence socket
   * both ask.
   */
  it("locks somebody whose own code names their sheet to that sheet", () => {
    const coop = looksFor({ characterKey: "character_coop" });
    expect(coop.map((c) => c.name)).toEqual(["Coop"]);
    expect(mayWear({ characterKey: "character_coop" }, "character_coop")).toBe(true);
    expect(mayWear({ characterKey: "character_coop" }, "character_rob")).toBe(false);
    // Not even the cast a visitor gets the run of.
    expect(mayWear({ characterKey: "character_coop" }, "character_02")).toBe(false);
  });

  /**
   * Campbell: named by his own code, with no sheet drawn for him yet. He
   * chooses, because there is nothing of his own to wear — but he chooses
   * from the same cast a visitor does, since Coop's likeness is no more his
   * than a stranger's.
   */
  it("gives somebody with no sheet of their own the shared cast", () => {
    expect(looksFor({})).toEqual(SHARED_CAST);
    expect(mayWear({}, "character_02")).toBe(true);
    expect(mayWear({}, "character_coop")).toBe(false);
  });

  /**
   * A look named on a persona has to be a look that exists: naming one that
   * is not in the library would leave them with the shared cast and no sign
   * of why, which is the unlocked picker this rule exists to close.
   */
  it("keeps every persona's named sheet in the library", () => {
    for (const key of ["character_coop", "character_rob", "character_hunter"]) {
      expect(
        looksFor({ characterKey: key }).map((c) => c.key),
        key,
      ).toEqual([key]);
    }
  });

  it("keeps the texture key a library sheet is preloaded under", () => {
    // Workers are created against these keys at boot; renaming one would
    // leave an existing seat pointing at a texture that no longer exists.
    const alice = LIBRARY_CHARACTERS.find((c) => c.name === "Alice")!;
    expect(textureKeyFor(alice)).toBe("character_02");
  });

  it("namespaces uploaded characters so they cannot collide with the library", () => {
    expect(textureKeyFor({ id: "kai-abc", key: "x", source: "sheet" })).toBe("generated:kai-abc");
  });

  /**
   * A scene meeting somebody in an uploaded look has only the key presence
   * carries, and `WORKER_SPRITES` never holds an upload — so without the way
   * back, the sheet was never fetched and `RemotePlayer` fell back to the
   * default. The wearer looked like themselves and like nobody else's idea
   * of themselves.
   */
  it("finds the way back from an uploaded key to its sheet", () => {
    const key = textureKeyFor({ id: "kai-abc", key: "x", source: "sheet" });
    expect(generatedSheetPath(key)).toBe("/api/characters/kai-abc");
  });

  it("says nothing about a key that is not an upload", () => {
    expect(generatedSheetPath("character_02")).toBeNull();
    expect(generatedSheetPath("generated:")).toBeNull();
  });

  it("resolves a library id to its shipped file and nothing else", () => {
    expect(librarySheetPath("library-character_02")).toBe(
      "/characters/Premade_Character_48x48_02.png",
    );
    expect(librarySheetPath("kai-abc")).toBeNull();
  });
});

describe("the merged roster", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "wc-roster-"));
    process.env.CHARACTER_DIR = dir;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.CHARACTER_DIR;
  });

  it("puts the library first and every upload after it, in one shape", async () => {
    writeFileSync(
      join(dir, "index.json"),
      JSON.stringify([
        { id: "kai-abc", name: "Kai", notes: "", createdAt: "a", source: "sheet", layout: "loose" },
      ]),
    );
    const { roster } = await import("../../../app/api/characters/route");
    const all = roster();
    expect(all.slice(0, LIBRARY_CHARACTERS.length)).toEqual(LIBRARY_CHARACTERS);
    const kai = all[all.length - 1];
    expect(kai).toMatchObject({
      id: "kai-abc",
      key: "generated:kai-abc",
      sheetUrl: "/api/characters/kai-abc",
      portraitUrl: "/api/characters/kai-abc/portrait",
      source: "sheet",
      layout: "loose",
    });
  });

  it("serves a library sheet through the same read as an upload", async () => {
    const store = await import("../store");
    const sheet = store.readSheet("library-character_09");
    expect(sheet).not.toBeNull();
    expect(sheet!.length).toBeGreaterThan(10_000);
    expect(store.readSheet("library-nope")).toBeNull();
  });
});
