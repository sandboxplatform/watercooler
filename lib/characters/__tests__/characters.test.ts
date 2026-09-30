import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("the character store", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "wc-characters-"));
    process.env.CHARACTER_DIR = dir;
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.CHARACTER_DIR;
  });

  it("saves a character and reads it back", async () => {
    const store = await import("../store");
    const sheet = Buffer.from("pretend png");
    const character = {
      id: "ada-abc123",
      name: "Ada",
      notes: "",
      hair: "#c2571f",
      skin: "#f6d3b0",
      outfit: "#2e7d4f",
      shoes: "#5b3a29",
      createdAt: new Date(0).toISOString(),
      source: "photo" as const,
    };

    store.saveCharacter(character, sheet);
    expect(store.listCharacters()).toEqual([character]);
    expect(store.readSheet("ada-abc123")?.toString()).toBe("pretend png");
  });

  it("puts the newest character first and replaces a repeat id", async () => {
    const store = await import("../store");
    const base = {
      notes: "",
      hair: "#111111",
      skin: "#222222",
      outfit: "#333333",
      shoes: "#444444",
      source: "photo" as const,
    };
    store.saveCharacter({ ...base, id: "one", name: "One", createdAt: "a" }, Buffer.from("1"));
    store.saveCharacter({ ...base, id: "two", name: "Two", createdAt: "b" }, Buffer.from("2"));
    store.saveCharacter(
      { ...base, id: "one", name: "One again", createdAt: "c" },
      Buffer.from("3"),
    );

    const ids = store.listCharacters().map((c) => c.id);
    expect(ids).toEqual(["one", "two"]);
    expect(store.listCharacters()[0].name).toBe("One again");
  });

  it("returns nothing for an id that is not one of ours", async () => {
    const store = await import("../store");
    // Ids reach the filesystem, so anything path-shaped must not resolve.
    expect(store.readSheet("../../etc/passwd")).toBeNull();
    expect(store.readSheet("nope")).toBeNull();
    expect(store.isCharacterId("../secret")).toBe(false);
    expect(store.isCharacterId("ada-abc123")).toBe(true);
  });

  it("treats a character saved before sources existed as a photo", async () => {
    const store = await import("../store");
    writeFileSync(
      join(dir, "index.json"),
      JSON.stringify([{ id: "old-one", name: "Old", notes: "", createdAt: "a", hair: "#111111" }]),
    );
    expect(store.listCharacters()[0].source).toBe("photo");
  });

  it("survives a manifest that has been corrupted", async () => {
    const store = await import("../store");
    writeFileSync(join(dir, "index.json"), "{ broken");
    expect(store.listCharacters()).toEqual([]);
  });

  /**
   * A face was kept under the id alone, and a library sheet is redrawn in
   * place under the same id — so yesterday's face was served for ever.
   */
  it("keeps a face under the sheet it was cut from, and cuts again when the sheet changes", async () => {
    const store = await import("../store");
    const base = { name: "Ada", notes: "", createdAt: "a", source: "sheet" as const };
    store.saveCharacter({ ...base, id: "ada-1" }, Buffer.from("first sheet"));
    const cut = (sheet: Buffer) => Buffer.from(`face of ${sheet.toString()}`);

    expect(store.readPortrait("ada-1", cut)?.toString()).toBe("face of first sheet");
    const kept = store.portraitPath("ada-1", store.sheetVersion(Buffer.from("first sheet")));
    expect(readFileSync(kept, "utf8")).toBe("face of first sheet");

    // Same id, new bytes: the old face is not what comes back.
    store.saveCharacter({ ...base, id: "ada-1" }, Buffer.from("second sheet"));
    expect(store.readPortrait("ada-1", cut)?.toString()).toBe("face of second sheet");
  });

  it("hashes a sheet the way the asset manifest does", async () => {
    const store = await import("../store");
    const { asset } = await import("../../assets");
    const path = "/characters/Premade_Character_48x48_09.png";
    const bytes = readFileSync(join(process.cwd(), "public", path));
    expect(asset(path)).toBe(`${path}?v=${store.sheetVersion(bytes)}`);
  });

  it("holds an upload for ever, and a library look for ever only when it is versioned", async () => {
    const store = await import("../store");
    const at = (url: string) => new Request(`http://localhost${url}`);
    expect(store.characterCache("ada-1", at("/api/characters/ada-1"))).toBe(store.IMMUTABLE);
    expect(
      store.characterCache("library-x", at("/api/characters/library-x/portrait?v=abcd1234")),
    ).toBe(store.IMMUTABLE);
    expect(store.characterCache("library-x", at("/api/characters/library-x/portrait"))).toBe(
      store.UNVERSIONED,
    );
  });
});
