import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { RoomStore, SCHEMA_VERSION } from "../room-store";

/**
 * How the database gets from the shape an older build left to the shape this
 * one expects.
 *
 * It used to be a list of `ALTER TABLE` statements in a swallow-everything
 * try/catch, run on every open. That worked, and hid two things: a real
 * failure — a typo, a locked file, a full disk — looked exactly like the
 * ordinary case of the column already being there, and there was nowhere to
 * put a change that is not another column, because nothing recorded what
 * shape a database was in.
 */

const ROOM = "migrating-room";

let dir: string;
let path: string;
let opened: RoomStore[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "watercooler-schema-"));
  path = join(dir, "room.sqlite");
  opened = [];
});

afterEach(() => {
  for (const store of opened) store.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Open the store under test, and see that the file is let go afterwards. */
function open(file = path): RoomStore {
  const store = new RoomStore(file);
  opened.push(store);
  return store;
}

function versionOf(file: string): number {
  const db = new DatabaseSync(file);
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  db.close();
  return row.user_version;
}

function columnsOf(file: string, table: string): string[] {
  const db = new DatabaseSync(file);
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  db.close();
  return rows.map((r) => r.name);
}

/**
 * A database as an older build left it: the tables it had then, at version 0,
 * without the two columns that arrived later.
 */
function olderBuild(file: string) {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE rooms (
      slug               TEXT PRIMARY KEY,
      created_at         TEXT NOT NULL,
      active_session_key TEXT
    );
    CREATE TABLE tasks (
      room         TEXT NOT NULL,
      task_id      TEXT NOT NULL,
      seat_id      TEXT,
      session_key  TEXT,
      status       TEXT,
      requested_by TEXT,
      created_at   TEXT NOT NULL,
      position     INTEGER NOT NULL,
      data         TEXT NOT NULL,
      PRIMARY KEY (room, task_id)
    );
  `);
  db.prepare("INSERT INTO rooms (slug, created_at) VALUES (?, ?)").run(
    ROOM,
    "2026-01-01T00:00:00.000Z",
  );
  db.prepare(
    `INSERT INTO tasks (room, task_id, status, created_at, position, data)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    ROOM,
    "task-1",
    "done",
    "2026-01-01T00:00:00.000Z",
    1,
    JSON.stringify({ taskId: "task-1" }),
  );
  db.close();
}

describe("a database this build has just made", () => {
  it("comes up at the version this build knows", () => {
    open();
    expect(versionOf(path)).toBe(SCHEMA_VERSION);
  });

  it("is left alone when opened again", () => {
    open();
    const first = versionOf(path);
    // The second open must find nothing to do; before the ladder, every
    // ALTER was attempted again on every open for ever.
    expect(() => open()).not.toThrow();
    expect(versionOf(path)).toBe(first);
  });

  it("has the columns the queries use", () => {
    open();
    expect(columnsOf(path, "rooms")).toContain("spend_usd");
    expect(columnsOf(path, "tasks")).toContain("requested_by_name");
  });
});

describe("a database an older build left behind", () => {
  it("climbs to the current version", () => {
    olderBuild(path);
    expect(versionOf(path)).toBe(0);

    open();

    expect(versionOf(path)).toBe(SCHEMA_VERSION);
  });

  it("gains the columns it was missing", () => {
    olderBuild(path);
    expect(columnsOf(path, "rooms")).not.toContain("spend_usd");
    expect(columnsOf(path, "tasks")).not.toContain("requested_by_name");

    open();

    expect(columnsOf(path, "rooms")).toContain("spend_usd");
    expect(columnsOf(path, "tasks")).toContain("requested_by_name");
  });

  it("gains the tables it never had", () => {
    olderBuild(path);
    open();
    // Everything else in SCHEMA, which the older shape here has none of.
    expect(columnsOf(path, "accounts")).toContain("email");
    expect(columnsOf(path, "arcade_scores")).toContain("game");
  });

  it("keeps what was already in it", () => {
    olderBuild(path);

    const store = open();

    // The room and its one task are still there, and the column that did not
    // exist when they were written reads as its default.
    expect(store.getSpend(ROOM)).toBe(0);
    expect(store.getSnapshot(ROOM).tasks).toEqual([{ taskId: "task-1" }]);
  });

  it("is usable the moment it is up", () => {
    olderBuild(path);
    const store = open();

    // Both migrated columns, written and read back through the store.
    store.addSpend(ROOM, 0.5);
    expect(store.getSpend(ROOM)).toBeCloseTo(0.5, 5);

    store.upsertSeat(ROOM, { seatId: "seat-0", label: "Alice", assigned: true });
    store.upsertTask(ROOM, {
      taskId: "task-2",
      message: "a job",
      status: "queued",
      requestedByName: "Coop",
    });
    expect(store.assignmentBreadth(ROOM, "Coop")).toEqual({ assigned: 0, staffed: 1 });
  });
});

describe("a database from a build that has not been written yet", () => {
  it("is refused rather than written to", () => {
    open();
    const db = new DatabaseSync(path);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 5}`);
    db.close();

    // Rolling a build back is fair in an emergency; this one cannot know
    // whether it can still write the newer shape, so it says so instead of
    // guessing.
    expect(() => new RoomStore(path)).toThrow(/schema/i);
    expect(() => new RoomStore(path)).toThrow(String(SCHEMA_VERSION + 5));
  });

  it("leaves the version alone when it refuses", () => {
    open();
    const db = new DatabaseSync(path);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 5}`);
    db.close();

    expect(() => new RoomStore(path)).toThrow();
    expect(versionOf(path)).toBe(SCHEMA_VERSION + 5);
  });
});
