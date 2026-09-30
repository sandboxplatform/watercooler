import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { RoomStore } from "../room-store";

let store: RoomStore;
beforeEach(() => {
  store = new RoomStore(":memory:");
});

describe("the handle", () => {
  let dir: string;
  let opened: RoomStore | null = null;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "watercooler-store-"));
  });
  afterEach(() => {
    opened?.close();
    opened = null;
    rmSync(dir, { recursive: true, force: true });
  });

  it("answers the health probe", () => {
    expect(store.ping()).toBe(true);
  });

  /**
   * NORMAL is safe under WAL and spares an fsync a write; the timeout is
   * what makes a second connection wait its turn rather than fail with
   * "database is locked" the instant the first is mid-write.
   */
  it("opens a file in WAL, synchronous NORMAL, with a busy timeout", () => {
    const file = join(dir, "room.sqlite");
    opened = new RoomStore(file);
    opened.ping();
    const db = new DatabaseSync(file);
    const journal = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    db.close();
    expect(journal.journal_mode).toBe("wal");
    // synchronous and busy_timeout are per connection, so they are read off
    // the store's own: 1 is NORMAL.
    const own = (opened as unknown as { db: DatabaseSync }).db;
    expect((own.prepare("PRAGMA synchronous").get() as { synchronous: number }).synchronous).toBe(
      1,
    );
    expect((own.prepare("PRAGMA busy_timeout").get() as { timeout: number }).timeout).toBe(5000);
  });
});

describe("the egg basket", () => {
  const at = (iso: string) => new Date(iso);

  it("tallies what somebody has found, by kind", () => {
    const store = new RoomStore(":memory:");
    store.collectEgg("coop", "Coop", "plain", "a", at("2026-01-01T09:00:00.000Z"));
    store.collectEgg("coop", "Coop", "plain", "b", at("2026-01-02T09:00:00.000Z"));
    store.collectEgg("coop", "Coop", "rainbow", "c", at("2026-01-03T09:00:00.000Z"));
    const tallies = store.eggTallies().filter((t) => t.person === "coop");
    expect(tallies.find((t) => t.tier === "plain")?.count).toBe(2);
    expect(tallies.find((t) => t.tier === "rainbow")?.count).toBe(1);
  });

  it("keeps two baskets apart", () => {
    const store = new RoomStore(":memory:");
    store.collectEgg("coop", "Coop", "jade", "a");
    store.collectEgg("rob", "Rob", "jade", "b");
    const jade = store.eggTallies().filter((t) => t.tier === "jade");
    expect(jade.map((t) => t.person).sort()).toEqual(["coop", "rob"]);
    expect(jade.every((t) => t.count === 1)).toBe(true);
  });

  /** A guest keeps nothing, and this is the one place a basket is written. */
  it("keeps no basket for a guest", () => {
    const store = new RoomStore(":memory:");
    expect(store.collectEgg("guest:ann", "Ann", "jade", "a")).toBe(false);
    expect(store.eggTallies()).toEqual([]);
  });

  /** The same egg twice is one egg: its id is the one it was laid with. */
  it("cannot be handed the same egg twice", () => {
    const store = new RoomStore(":memory:");
    store.collectEgg("coop", "Coop", "gilded", "the-same-egg");
    store.collectEgg("coop", "Coop", "gilded", "the-same-egg");
    expect(store.eggTallies().find((t) => t.person === "coop")?.count).toBe(1);
  });

  /**
   * A row should read without the roster, and somebody who has changed
   * their name reads as who they are now — which is SQLite's rule about a
   * bare column beside `MAX`, and worth pinning rather than assuming.
   */
  it("reports the name they found the latest one under", () => {
    const store = new RoomStore(":memory:");
    store.collectEgg("coop", "Chris", "copper", "a", at("2026-01-01T09:00:00.000Z"));
    store.collectEgg("coop", "Coop", "copper", "b", at("2026-02-01T09:00:00.000Z"));
    const tally = store.eggTallies().find((t) => t.person === "coop")!;
    expect(tally.name).toBe("Coop");
    expect(tally.latest).toBe("2026-02-01T09:00:00.000Z");
  });

  it("has nothing to say about a world where nobody has found one", () => {
    expect(new RoomStore(":memory:").eggTallies()).toEqual([]);
  });
});
